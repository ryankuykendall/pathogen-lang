/**
 * Node adapters for the shared loader (`pathogen-lang/node`): the CLI, the
 * VS Code extension host and the language server all build their FontHost
 * here, so file rules, font search, the download cache and offline handling
 * are one implementation. Pure decisions live in src/host/; this module only
 * does I/O.
 */
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { lstat, mkdir, open, readdir, readFile, readlink, realpath, rename, unlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, delimiter, dirname, isAbsolute, join, parse, posix, relative, resolve, sep, win32 } from 'node:path';

import { sfntLooksComplete } from '../host/google-fonts';
import {
  isModuleSource,
  planImports,
  resolveModules,
  unsavedImportErrors,
  withOpenDocuments,
} from '../host/load-modules';
import { resolveProjectPath } from '../host/paths';
import { parseProjectFile, PROJECT_FILE_NAME } from '../host/project';

import type { Dirent } from 'node:fs';
import type { FileHandle } from 'node:fs/promises';

import type { HostFetch, HostFetchResponse } from '../host/google-fonts';
import type { ModuleGraph, ModuleLoadError } from '../host/load-modules';
import type { ParsedProjectFile } from '../host/project';
import type { FontCache, FontHost, HostReadResult, LocalFontMatch, ProjectFileHost } from '../host/types';

export interface NodeFontHostOptions {
  /** Absolute OS path of the project folder. */
  root: string;
  /** Absolute OS folder of the program; the `fonts/` search walks up from here. */
  programDir: string;
  /** Why downloads are off (`--offline`, `PATHOGEN_OFFLINE=1`), or null when they're on. */
  offlineReason: string | null;
  /** Download cache folder, or null for none. */
  cacheDir: string | null;
  /** Extra font folders searched first (PATHOGEN_FONT_DIRS). */
  fontDirs?: string[];
  /** System font folders (default: this platform's). */
  systemFontDirs?: string[];
  /** Replaces global fetch (tests). */
  fetchImpl?: typeof fetch;
  /** Sent with downloads. Any non-browser User-Agent makes Google send one complete TTF. */
  userAgent?: string;
  /** Give up on a download after this long with no bytes arriving (default 30 s). */
  stallTimeoutMs?: number;
  /** Give up on a download that grows past this many bytes (default 64 MB). */
  maxDownloadBytes?: number;
  /** Give up on a download still arriving after this long (default 10 minutes). */
  maxDownloadMs?: number;
}

export function createNodeFontHost(options: NodeFontHostOptions): FontHost {
  const root = resolve(options.root);
  const host: FontHost = {
    projectLabel: root,
    readFile: async (path) => readProjectFile(root, path),
    findLocalFont: async (family, weight, { nearest }) =>
      findInstalledFont(family, weight, nearest, [
        ...(options.fontDirs ?? []).flatMap(projectFolders),
        ...walkUpFontsDir(options.programDir).flatMap(projectFolders),
        ...(options.systemFontDirs ?? systemFontDirs()).flatMap(systemFolders),
      ]),
    decodeWoff2: async (bytes) => {
      const mod = (await import('woff2-encoder/decompress')) as { default: (b: Uint8Array) => Promise<Uint8Array> };
      return new Uint8Array(await mod.default(bytes));
    },
  };
  if (options.cacheDir) host.cache = fileCache(options.cacheDir);
  if (options.offlineReason) host.offlineReason = options.offlineReason;
  else {
    host.fetch = nodeFetch(options.fetchImpl ?? fetch, options.userAgent ?? 'pathogen-lang', {
      stallMs: options.stallTimeoutMs ?? 30_000,
      maxBytes: options.maxDownloadBytes ?? MAX_DOWNLOAD_BYTES,
      maxMs: options.maxDownloadMs ?? MAX_DOWNLOAD_MS,
    });
  }
  return host;
}

// ---------------------------------------------------------------------------
// Project files
// ---------------------------------------------------------------------------

/**
 * A host that only reads project files, for loading imports
 * (`resolveModules` in pathogen-lang). A FontHost from createNodeFontHost
 * reads the same way, so a tool that loads both may pass that one instead.
 */
export function createNodeProjectHost(root: string): ProjectFileHost {
  const resolvedRoot = resolve(root);
  return { projectLabel: resolvedRoot, readFile: async (path) => readProjectFile(resolvedRoot, path) };
}

/**
 * Read a project path from disk. Letter case must match each folder entry
 * exactly (macOS and Windows would otherwise ignore it), and a symbolic link
 * on the way must not lead outside the project folder.
 *
 * Nothing outside the project is ever looked at, so no answer depends on what
 * exists there: before a name is used, `walkLinks` follows its links by what
 * they say, and stops at the first folder that is outside the project. Only
 * once the walk stays inside does the system resolve the path. So a link
 * that leads outside "leaves the project folder" whatever is or isn't there,
 * and every other answer (not found, can't be read, a folder) is about
 * something inside.
 *
 * Every real path comes from the same `realpath` (the system's own), which
 * spells a folder as it is on disk: a project folder written `C:\proj` or
 * `~/MyProj` for `c:\proj` or `~/myproj` is still the same folder.
 */
export async function readProjectFile(root: string, projectPath: string): Promise<HostReadResult> {
  const segments = projectPath.split('/').filter(Boolean);
  const osPath = join(root, ...segments);
  const unreadable = (err: unknown): HostReadResult => ({ ok: false, code: 'unreadable', detail: errorText(err) });
  let realRoot: string;
  try {
    realRoot = await realpath(root);
  } catch (err) {
    return unreadable(err);
  }
  const notFound: HostReadResult = { ok: false, code: 'not-found', osPath };
  const leaves: HostReadResult = { ok: false, code: 'escapes-root' };
  const inProject = (path: string) => path === realRoot || isInside(realRoot, path);

  // `current` is always a real folder inside the project.
  let current = realRoot;
  const actual: string[] = [];
  let caseDiffers = false;
  for (const segment of segments) {
    let entries: string[];
    try {
      entries = readdirSync(current);
    } catch (err) {
      // ENOTDIR: a file named as a folder (`/a.ttf/b.ttf`)
      return errorCode(err) === 'ENOTDIR' || errorCode(err) === 'ENOENT' ? notFound : unreadable(err);
    }
    const onDisk = matchEntry(entries, segment);
    if (onDisk === undefined) return notFound;
    if (onDisk.normalize('NFC') !== segment.normalize('NFC')) caseDiffers = true;
    actual.push(onDisk);
    const next = join(current, onDisk);
    if (!(await walkLinks(next, realRoot))) return leaves;
    try {
      current = await realpath(next);
    } catch (err) {
      // A link to something missing (inside: the walk above checked), or a loop of links
      return errorCode(err) === 'ENOENT' || errorCode(err) === 'ENOTDIR' ? notFound : unreadable(err);
    }
    // The walk and the system agree on this; kept as a guard.
    if (!inProject(current)) return leaves;
  }
  if (caseDiffers) return { ok: false, code: 'case-mismatch', actual: `/${actual.join('/')}` };
  if (current === realRoot) return { ok: false, code: 'folder' };
  try {
    const stats = statSync(current);
    if (stats.isDirectory()) return { ok: false, code: 'folder' };
    if (!stats.isFile()) return notFound;
    return { ok: true, bytes: new Uint8Array(await readFile(current)) };
  } catch (err) {
    return unreadable(err);
  }
}

/**
 * Follow the symbolic links in `path` by what they say, one name at a time,
 * and answer whether every folder the walk passes through is one `mayPass`
 * allows. A name is judged once it is known not to be a link — a folder or
 * file by its real path, a missing name as written — and the walk stops at
 * the first one it may not pass, so it never looks inside anything there. A
 * name that is a link is followed instead, wherever it sits: an absolute
 * target may reach the project through an alias such as `~/Dropbox` or
 * macOS's `/tmp`. A missing name ends the looking: it and everything after it
 * are taken as written, since a missing name can't be a link. `path`'s folder
 * must be a real folder inside `realRoot`.
 *
 * A link may climb through the folders above the project on its way back in
 * (an absolute target starts at the top of the disk), but through no other.
 */
async function walkLinks(path: string, realRoot: string): Promise<boolean> {
  const inProject = (p: string) => p === realRoot || isInside(realRoot, p);
  const mayPass = (p: string) => inProject(p) || isInside(p, realRoot);
  const separators = sep === '\\' ? /[\\/]/ : /\//;
  let resolved = dirname(path);
  const pending = [basename(path)];
  let hops = 0;
  let exists = true;
  while (pending.length > 0) {
    const name = pending.shift()!;
    if (name === '' || name === '.') continue;
    const next = name === '..' ? dirname(resolved) : join(resolved, name);
    // `..` from a real folder is its real parent; after a missing name, nothing is looked up.
    let isLink = false;
    if (name !== '..' && exists) {
      try {
        isLink = (await lstat(next)).isSymbolicLink();
      } catch {
        exists = false;
      }
    }
    if (!isLink) {
      // Its spelling on disk, where it exists; the folder it is in is already real.
      resolved = name !== '..' && exists ? await realpath(next).catch(() => next) : next;
      if (!mayPass(resolved)) return false;
      continue;
    }
    // A loop of links: one inside the project is reported by realpath once the
    // walk is done; one elsewhere leaves.
    if (++hops > 40) return inProject(resolved);
    let target = await readlink(next);
    if (sep === '\\') target = target.replace(/^\\\\\?\\/, '');
    const targetRoot = parse(target).root;
    if (targetRoot) {
      // `C:foo` is relative to a drive's current folder, which isn't knowable here.
      if (!/[\\/]$/.test(targetRoot)) return false;
      resolved = targetRoot;
    }
    pending.unshift(...target.slice(targetRoot.length).split(separators));
  }
  return true;
}

function errorCode(err: unknown): string | undefined {
  return (err as NodeJS.ErrnoException | undefined)?.code;
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * The folder entry a path segment names: the exact name, else the same name
 * in another Unicode form (macOS can store "é" as "e" plus an accent while an
 * editor writes it as one character), else one that differs only in letter
 * case, which the caller reports as a mismatch.
 */
function matchEntry(entries: string[], segment: string): string | undefined {
  if (entries.includes(segment)) return segment;
  const wanted = segment.normalize('NFC');
  return (
    entries.find((e) => e.normalize('NFC') === wanted) ??
    entries.find((e) => e.normalize('NFC').toLowerCase() === wanted.toLowerCase())
  );
}

/** `file` is strictly inside `folder` (a name like `..alt` inside it counts). */
function isInside(folder: string, file: string): boolean {
  const rel = relative(folder, file);
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

/**
 * The project folder for a program: the nearest folder with a pathogen.json,
 * from the program's own folder upward, never checking the home folder itself
 * (or the file-system root), so a stray ~/pathogen.json can't make everything
 * one project. Without one, the program's own folder.
 *
 * The home folder is recognized by its real path, however the program's
 * folder is spelled (VS Code writes Windows drives as `c:\`). The folder
 * returned keeps the caller's spelling, so paths made relative to it agree.
 */
export function findProjectRoot(programDir: string, home = homedir()): { root: string; projectFile: string | null } {
  const start = resolve(programDir);
  const real = (path: string) => {
    try {
      return realpathSync.native(path);
    } catch {
      return path;
    }
  };
  const realHome = real(resolve(home));
  let dir = start;
  for (;;) {
    const parent = dirname(dir);
    if (parent === dir || real(dir) === realHome) break;
    const candidate = join(dir, PROJECT_FILE_NAME);
    if (existsSync(candidate)) return { root: dir, projectFile: candidate };
    dir = parent;
  }
  return { root: start, projectFile: null };
}

/**
 * The program's project path (`/posters/main.pathogen`), spelled as on disk.
 * Project paths are matched letter for letter, and an editor or a command
 * line may spell a folder differently from the disk (VS Code hands over
 * `c:\…` for `C:\…`; `pathogen-lang POSTERS/main.pathogen` works on macOS for
 * `posters/`), so the real paths decide when they agree that the program is
 * inside. Otherwise the path as given, through a link that stays inside, say.
 * Null when the program is outside the project folder either way.
 */
export function projectEntry(root: string, programFile: string): string | null {
  const real = (path: string) => {
    try {
      return realpathSync.native(path);
    } catch {
      return path;
    }
  };
  const outside = (rel: string) => rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel);
  const file = resolve(programFile);
  const realRel = relative(real(resolve(root)), join(real(dirname(file)), basename(file)));
  const givenRel = relative(resolve(root), file);
  const rel = !outside(realRel) ? realRel : !outside(givenRel) ? givenRel : null;
  return rel === null ? null : `/${rel.split(sep).join('/')}`;
}

/**
 * Read and validate a pathogen.json from disk (an absolute path, so messages
 * name the folder in full). Every tool reads it here, so a broken one gets
 * the same message in the CLI, the preview and the Problems panel.
 */
export function loadProjectFileSync(projectFile: string): ParsedProjectFile {
  const folder = dirname(projectFile);
  const prefix = `${PROJECT_FILE_NAME} (${folder})`;
  let text: string;
  try {
    if (statSync(projectFile).isDirectory()) return { ok: false, message: `${prefix} is a folder, not a file.` };
    text = readFileSync(projectFile, 'utf8');
  } catch (err) {
    return { ok: false, message: `${prefix} could not be read: ${(err as Error).message}` };
  }
  return parseProjectFile(text, folder);
}

/** loadProjectFileSync for callers that expect a promise (the editors). */
export async function loadProjectFile(projectFile: string): Promise<ParsedProjectFile> {
  return loadProjectFileSync(projectFile);
}

// ---------------------------------------------------------------------------
// Installed fonts
// ---------------------------------------------------------------------------

/** Google Fonts weight names, as they appear in file names (`Raleway-Bold.ttf`). */
const WEIGHT_NAMES: Record<number, string> = {
  100: 'Thin',
  200: 'ExtraLight',
  300: 'Light',
  400: 'Regular',
  500: 'Medium',
  600: 'SemiBold',
  700: 'Bold',
  800: 'ExtraBold',
  900: 'Black',
};

/**
 * File names for a family at one weight: Google's `Raleway-Bold.ttf` (also
 * with the family's spaces kept or turned into hyphens), and macOS's
 * `Times New Roman Bold.ttf`. A name without a weight counts as 400.
 */
function fileNamesFor(family: string, weight: number): string[] {
  const bases = familyBases(family);
  const names: string[] = [];
  const suffixes = [WEIGHT_NAMES[weight], ...(weight === 400 ? [''] : [])].filter((s) => s !== undefined);
  for (const suffix of suffixes) {
    const stems = suffix ? [...bases.map((base) => `${base}-${suffix}`), `${family} ${suffix}`] : bases;
    for (const stem of stems) {
      for (const ext of ['ttf', 'otf']) names.push(`${stem}.${ext}`);
    }
  }
  return names;
}

/** A family's name as file names spell it: `PlayfairDisplay`, `Playfair Display`, `Playfair-Display`. */
function familyBases(family: string): string[] {
  return [...new Set([family.replace(/\s+/g, ''), family, family.replace(/\s+/g, '-')])];
}

/**
 * Files of a family that comes in optical sizes, as Google Fonts names them
 * (`Inter_18pt-Bold.ttf`, `Inter_24pt-Bold.ttf`), smallest size first: the
 * text size, which is closest to the font Google Fonts serves. `listing` maps
 * case-folded names to the names on disk.
 */
function opticalSizeFiles(family: string, weight: number, listing: Map<string, string[]>): string[] {
  const suffix = WEIGHT_NAMES[weight]?.toLowerCase();
  if (!suffix) return [];
  const bases = new Set(familyBases(family).map((base) => base.normalize('NFC').toLowerCase()));
  const found: { size: number; names: string[] }[] = [];
  for (const [folded, names] of listing) {
    const match = /^(.+)_(\d+(?:\.\d+)?)pt-([a-z]+)\.(?:ttf|otf)$/.exec(folded);
    if (match && bases.has(match[1]) && match[3] === suffix) found.push({ size: Number(match[2]), names });
  }
  return found.sort((a, b) => a.size - b.size).flatMap((f) => f.names);
}

async function findInstalledFont(
  family: string,
  weight: number,
  nearest: boolean,
  searchFolders: string[],
): Promise<LocalFontMatch | null> {
  const folders = [...new Set(searchFolders)];
  // Each folder is listed once. Installed fonts are found by naming
  // convention, not by a path the program wrote, so names match regardless of
  // letter case or Unicode form — on every system, as the old file-exists
  // check did on macOS.
  const key = (name: string) => name.normalize('NFC').toLowerCase();
  // Each key keeps every name it matches: Linux can hold `raleway-bold.ttf`
  // and `Raleway-Bold.ttf` side by side, and either may be the complete one.
  const listings = new Map<string, Map<string, string[]>>();
  const filesIn = (folder: string) => {
    let names = listings.get(folder);
    if (!names) {
      names = new Map();
      try {
        for (const entry of readdirSync(folder, { withFileTypes: true })) {
          if (!entry.isFile() && !entry.isSymbolicLink()) continue;
          const k = key(entry.name);
          names.set(k, [...(names.get(k) ?? []), entry.name]);
        }
      } catch {
        // not there, or not readable: nothing to find
      }
      listings.set(folder, names);
    }
    return names;
  };
  const weights = nearest
    ? Object.keys(WEIGHT_NAMES)
        .map(Number)
        .filter((w) => w !== weight)
        .sort((a, b) => Math.abs(a - weight) - Math.abs(b - weight) || a - b)
    : [weight];
  for (const w of weights) {
    for (const folder of folders) {
      const names = filesIn(folder);
      const candidates = [
        ...fileNamesFor(family, w).flatMap((name) => names.get(key(name)) ?? []),
        ...opticalSizeFiles(family, w, names),
      ];
      for (const actual of candidates) {
        const candidate = join(folder, actual);
        try {
          const bytes = new Uint8Array(await readFile(candidate));
          // A damaged or mislabeled file (a WOFF2 named .ttf) is passed over.
          if (sfntLooksComplete(bytes)) return { bytes, weight: w, label: candidate };
        } catch {
          // unreadable — keep looking
        }
      }
    }
  }
  return null;
}

/**
 * A project font folder (PATHOGEN_FONT_DIRS, a walked-up `fonts/`) and the
 * folders directly inside it, each with its `static/` folder: an unzipped
 * Google Fonts download keeps each weight in <Family>/static/, beside the
 * variable font.
 */
function projectFolders(dir: string): string[] {
  const folders = [dir];
  for (const sub of listSubdirs(dir)) {
    folders.push(sub);
    const staticDir = join(sub, 'static');
    if (isFolder(staticDir)) folders.push(staticDir);
  }
  return folders;
}

function isFolder(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/** Folder lists of the system font folders, reused for a minute (editors run for hours). */
const systemFolderLists = new Map<string, { at: number; folders: string[] }>();

/**
 * A system font folder and the folders up to two levels inside it: Linux
 * keeps families in /usr/share/fonts/truetype/<family>/.
 */
function systemFolders(dir: string): string[] {
  const known = systemFolderLists.get(dir);
  if (known && Date.now() - known.at < 60_000) return known.folders;
  const folders = [dir];
  for (const sub of listSubdirs(dir)) {
    folders.push(sub, ...listSubdirs(sub));
  }
  systemFolderLists.set(dir, { at: Date.now(), folders });
  return folders;
}

/**
 * The first `fonts/` folder found walking up from the program: its own folder
 * and up to seven above it. A file named `fonts` is not a folder and is passed.
 */
function walkUpFontsDir(programDir: string): string[] {
  let dir = resolve(programDir);
  for (let i = 0; i < 8; i++) {
    const fonts = join(dir, 'fonts');
    if (isFolder(fonts)) return [fonts];
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return [];
}

function listSubdirs(dir: string): string[] {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => join(dir, e.name));
  } catch {
    return [];
  }
}

/**
 * Where this platform keeps installed fonts. Paths are built with the
 * platform's own rules, so the answer for Windows is the same on any machine.
 */
export function systemFontDirs(
  platform: NodeJS.Platform = process.platform,
  home = homedir(),
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  switch (platform) {
    case 'darwin':
      return [
        '/Library/Fonts',
        '/System/Library/Fonts',
        '/System/Library/Fonts/Supplemental',
        posix.join(home, 'Library/Fonts'),
      ];
    case 'linux':
      return [
        '/usr/share/fonts',
        '/usr/local/share/fonts',
        posix.join(home, '.fonts'),
        posix.join(home, '.local/share/fonts'),
      ];
    case 'win32':
      return [
        win32.join(env.WINDIR || 'C:\\Windows', 'Fonts'),
        // Fonts installed "for me only" (Windows 10 1809 and later)
        win32.join(env.LOCALAPPDATA || win32.join(home, 'AppData', 'Local'), 'Microsoft', 'Windows', 'Fonts'),
      ];
    default:
      return [];
  }
}

/** PATHOGEN_FONT_DIRS, split on this platform's separator (`:`, or `;` on Windows). */
export function fontDirsFromEnv(value: string | undefined): string[] {
  return (value ?? '').split(delimiter).filter(Boolean);
}

// ---------------------------------------------------------------------------
// Downloads and the cache
// ---------------------------------------------------------------------------

/** Why downloads are off, or null: the flag wins over the environment. */
export function offlineReason(flag: boolean, env: NodeJS.ProcessEnv = process.env): string | null {
  if (flag) return '--offline';
  const value = env.PATHOGEN_OFFLINE;
  return value && value !== '0' && value.toLowerCase() !== 'false' ? 'PATHOGEN_OFFLINE=1' : null;
}

/** The cache folder: PATHOGEN_CACHE_DIR, else this platform's cache location. */
export function defaultCacheDir(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  home = homedir(),
): string {
  if (env.PATHOGEN_CACHE_DIR) return resolve(env.PATHOGEN_CACHE_DIR);
  if (platform === 'darwin') return posix.join(home, 'Library', 'Caches', 'pathogen-lang', 'fonts');
  if (platform === 'win32') {
    return win32.join(env.LOCALAPPDATA || win32.join(home, 'AppData', 'Local'), 'pathogen-lang', 'fonts');
  }
  return posix.join(env.XDG_CACHE_HOME || posix.join(home, '.cache'), 'pathogen-lang', 'fonts');
}

/**
 * A cache of small files named by a hash of the key. Each write goes to a
 * temporary file that is then renamed into place, so the CLI, the extension
 * and the language server can share the folder without reading half-written
 * fonts. A cache that can't be written is simply skipped.
 */
export function fileCache(dir: string): FontCache {
  const fileFor = (key: string) => join(dir, createHash('sha256').update(key).digest('hex').slice(0, 32));
  return {
    async get(key) {
      try {
        return new Uint8Array(await readFile(fileFor(key)));
      } catch {
        return null;
      }
    },
    async put(key, bytes) {
      const target = fileFor(key);
      // A name no other writer can share — two documents in one editor can
      // finish the same download in the same millisecond — created exclusively.
      const temp = `${target}.${randomUUID()}.tmp`;
      try {
        await mkdir(dir, { recursive: true });
        await writeFile(temp, bytes, { flag: 'wx' });
        await rename(temp, target);
      } catch {
        // An unwritable cache costs a re-download next time, nothing more —
        // but it leaves no half-written temporary file behind.
        await unlink(temp).catch(() => undefined);
      }
    },
  };
}

/**
 * fetch with a stall timeout as well as a total one: a 10 MB CJK font on a
 * slow link may take minutes, which is fine while bytes keep arriving, but a
 * server that sends a trickle forever, or more bytes than any font has, is
 * cut off. The timers are unref'd, so they never hold the process open.
 *
 * The reply is read in full, and concurrent requests for the same URL share
 * one transfer: several documents in an editor that name one uncached family
 * download it once. (The shared bytes are read-only to every caller.)
 */
function nodeFetch(fetchImpl: typeof fetch, userAgent: string, limits: DownloadLimits): HostFetch {
  let inFlight = sharedFetches.get(fetchImpl);
  if (!inFlight) {
    inFlight = new Map();
    sharedFetches.set(fetchImpl, inFlight);
  }
  const pending = inFlight;
  return async (url: string): Promise<HostFetchResponse> => {
    let reply = pending.get(url);
    if (!reply) {
      reply = fetchFully(fetchImpl, url, userAgent, limits).finally(() => pending.delete(url));
      pending.set(url, reply);
    }
    const { status, bytes } = await reply;
    return { status, text: async () => new TextDecoder().decode(bytes), bytes: async () => bytes };
  };
}

interface DownloadLimits {
  stallMs: number;
  maxBytes: number;
  maxMs: number;
}

/** The largest font file a download may be: the biggest Google families are about 20 MB. */
const MAX_DOWNLOAD_BYTES = 64 * 2 ** 20;
/** How long a single download may take, however steadily it trickles in. */
const MAX_DOWNLOAD_MS = 10 * 60_000;

/** Requests in progress, per fetch implementation (one in production), by URL. */
const sharedFetches = new WeakMap<typeof fetch, Map<string, Promise<{ status: number; bytes: Uint8Array }>>>();

async function fetchFully(
  fetchImpl: typeof fetch,
  url: string,
  userAgent: string,
  limits: DownloadLimits,
): Promise<{ status: number; bytes: Uint8Array }> {
  const controller = new AbortController();
  const host = new URL(url).host;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const restart = () => {
    clearTimeout(timer);
    timer = setTimeout(
      () => controller.abort(new Error(`no data from ${host} for ${limits.stallMs / 1000} seconds`)),
      limits.stallMs,
    );
    timer.unref?.();
  };
  const overall = setTimeout(
    () => controller.abort(new Error(`no complete reply from ${host} after ${formatDuration(limits.maxMs)}`)),
    limits.maxMs,
  );
  overall.unref?.();
  restart();
  try {
    // No redirects: downloads come only from the hosts docs/security.md names.
    const res = await fetchImpl(url, {
      headers: { 'User-Agent': userAgent },
      signal: controller.signal,
      redirect: 'error',
    });
    restart();
    return { status: res.status, bytes: await readBody(res, restart, host, limits.maxBytes) };
  } catch (err) {
    throw controller.signal.aborted ? controller.signal.reason : withCause(err);
  } finally {
    clearTimeout(timer);
    clearTimeout(overall);
  }
}

/**
 * Node's fetch says only "fetch failed" and keeps the reason in `cause`
 * (`getaddrinfo ENOTFOUND fonts.googleapis.com`, `unexpected redirect`), so
 * the reason joins the message the user sees.
 */
function withCause(err: unknown): unknown {
  if (!(err instanceof Error) || !(err.cause instanceof Error) || err.message.includes(err.cause.message)) return err;
  return new Error(`${err.message}: ${err.cause.message}`);
}

/** `10 minutes`, `1.5 seconds` */
function formatDuration(ms: number): string {
  return ms >= 60_000 && ms % 60_000 === 0 ? `${ms / 60_000} minutes` : `${ms / 1000} seconds`;
}

/** `64 MB`, `100 bytes` */
function formatSize(bytes: number): string {
  return bytes >= 2 ** 20 && bytes % 2 ** 20 === 0 ? `${bytes / 2 ** 20} MB` : `${bytes} bytes`;
}

/**
 * A cheap fingerprint of the files a program's `@font` paths name, and of its
 * pathogen.json: size and modification time each, or "none". Editors that
 * reuse a font load while you type add it to their reuse key, so adding a
 * missing font file, replacing one, or fixing pathogen.json is noticed on the
 * next edit.
 */
export function fontFileStamps(
  root: string,
  entry: string,
  writtenPaths: readonly string[],
  projectFile: string | null,
): string {
  const stamp = (osPath: string) => {
    try {
      const s = statSync(osPath);
      // The name as spelled on disk too, so a rename that changes only letter
      // case (which a project path would no longer match) is noticed.
      return `${s.size}:${s.mtimeMs}:${realpathSync.native(osPath)}`;
    } catch {
      return 'none';
    }
  };
  const parts = writtenPaths.map((written) => {
    const resolved = resolveProjectPath(written, entry);
    return resolved.ok ? stamp(join(root, ...resolved.path.split('/').filter(Boolean))) : 'outside';
  });
  if (projectFile) parts.push(stamp(projectFile));
  return parts.join('|');
}

// --- The files an editor document imports (docs/modules.md "In each tool") ---

/** What an editor knows about a document's imports. */
export interface EditorModules {
  /** The project folder; null for a document that isn't saved. */
  root: string | null;
  /** The document's project path (`/<unsaved>` before it is saved). */
  entry: string;
  graph: ModuleGraph;
  /** What couldn't be loaded, for getDiagnostics' `loadErrors`. */
  errors: ModuleLoadError[];
}

/**
 * The files an editor document imports, for the language server and the
 * VS Code preview (two processes, one rule): the project folder from the
 * file's own folder, the document's project path, then resolveModules
 * through a host whose open buffers stand in for the files on disk.
 * `filePath` is null for an unsaved document: with no folder for its paths
 * to start from, each import is a load error saying to save it. A document
 * without imports reads nothing.
 */
export async function resolveEditorModules(
  filePath: string | null,
  source: string,
  openText: (absolutePath: string) => string | undefined,
): Promise<EditorModules> {
  if (filePath === null) {
    const entry = '/<unsaved>';
    return { root: null, entry, graph: { entry, files: new Map(), order: [] }, errors: unsavedImportErrors(source) };
  }
  const { root } = findProjectRoot(dirname(filePath));
  const entry = projectEntry(root, filePath) ?? `/${relative(root, filePath).split(sep).join('/')}`;
  if (planImports(source).length === 0) {
    return { root, entry, graph: { entry, files: new Map(), order: [] }, errors: [] };
  }
  const host = withOpenDocuments(createNodeProjectHost(root), (projectPath) =>
    openText(join(root, ...projectPath.split('/').filter(Boolean))),
  );
  const { graph, errors } = await resolveModules(source, { host, entry });
  return { root, entry, graph, errors };
}

/** The absolute paths of the files a document imports: a change to any of them changes its results. */
export function editorModulePaths(modules: EditorModules): string[] {
  const { root } = modules;
  if (root === null) return [];
  return [...modules.graph.files.keys()].map((path) => join(root, ...path.split('/').filter(Boolean)));
}

/**
 * The project's modules by project path, for completing an import's path:
 * every `.pathogen` file under the folder that starts with `module;` (only
 * a module can be imported). Folders named `node_modules` or starting with a
 * dot are skipped, links are not followed, and the walk stops after looking
 * at `maxFiles` `.pathogen` files, since a folder with no pathogen.json is
 * its own project folder and could be large. Only the start of each file is
 * read: `module;` comes first, after any comments.
 */
export async function listProjectModules(root: string, limits: { maxFiles?: number } = {}): Promise<string[]> {
  const maxFiles = limits.maxFiles ?? 2000;
  const found: string[] = [];
  let looked = 0;
  const queue: string[] = [''];
  while (queue.length > 0 && looked < maxFiles) {
    const folder = queue.shift()!;
    let entries: Dirent[];
    try {
      entries = await readdir(join(root, ...folder.split('/').filter(Boolean)), { withFileTypes: true });
    } catch {
      continue;
    }
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const entry of entries) {
      if (looked >= maxFiles) break;
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      const path = `${folder}/${entry.name}`;
      if (entry.isDirectory()) queue.push(path);
      else if (entry.isFile() && entry.name.endsWith('.pathogen')) {
        looked++;
        if (await startsAsModule(join(root, ...path.split('/').filter(Boolean)))) found.push(path);
      }
    }
  }
  return found.sort();
}

/** How much of a file listProjectModules reads to find its `module;` line. */
const MODULE_HEADER_WINDOW = 64 * 1024;

async function startsAsModule(osPath: string): Promise<boolean> {
  let handle: FileHandle | undefined;
  try {
    handle = await open(osPath, 'r');
    const window = Buffer.alloc(MODULE_HEADER_WINDOW);
    const { bytesRead } = await handle.read(window, 0, MODULE_HEADER_WINDOW, 0);
    return isModuleSource(window.subarray(0, bytesRead).toString('utf8'));
  } catch {
    return false; // Unreadable: not offered.
  } finally {
    await handle?.close();
  }
}

/** Read a response body chunk by chunk, calling `progress` as each arrives. */
async function readBody(res: Response, progress: () => void, host: string, maxBytes: number): Promise<Uint8Array> {
  const tooLarge = () => new Error(`the reply from ${host} is larger than ${formatSize(maxBytes)}`);
  if (!res.body) {
    const whole = new Uint8Array(await res.arrayBuffer());
    if (whole.length > maxBytes) throw tooLarge();
    return whole;
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    length += value.length;
    if (length > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw tooLarge();
    }
    progress();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}
