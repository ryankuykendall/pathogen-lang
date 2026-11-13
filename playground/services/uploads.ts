// Files from your computer into the workspace (phase 2d, step 6a; mockup v6
// screen U, docs/workspace-files.md "Uploading files").
//
// What was picked (Upload files…, Upload folder…) or dropped on the tree
// becomes PickedFiles: a path among what was picked, a size, a way to read
// it. The sort decides where each goes, which clash with a file already there
// (names compared without letter case, as for new files), and which are left
// out and why, by the workspace's own rules (the engine's, which the server
// shares). Reading turns a file's bytes into a .pathogen text. workspace-view
// asks about the clashes and plans the change (workspace-edits' planUpload).

import type { WorkspaceState } from './workspace-edits.js';

type Lib = Window['PathogenLang'];

function lib(): Lib {
  const l = (window as { PathogenLang?: Lib }).PathogenLang;
  if (!l) throw new Error('The Pathogen library is not loaded, so files cannot be added.');
  return l;
}

/** A file picked or dropped. */
export interface PickedFile {
  /** Its path among what was picked: "springs.pathogen", or "shapes/round/dot.pathogen" from a folder. */
  path: string;
  size: number;
  read: () => Promise<ArrayBuffer>;
}

/** A file left out, and why: a line of the toast. */
export interface LeftOut {
  /** As it was picked: "cities.csv", "shapes/notes.txt". */
  name: string;
  reason: string;
}

/** A file that can go in. */
export interface UploadCandidate {
  /** Where it goes: a workspace path. */
  path: string;
  file: PickedFile;
  /** The file already there with this name, in any letter case; null when there's none. */
  clashesWith: string | null;
  /** Its path as picked, when a name in it was changed to fit the name rules; else null. */
  renamedFrom: string | null;
}

/** An empty folder of a dropped folder, that goes in as it is (step 6a, your answer 7). */
export interface UploadFolder {
  /** Where it goes: a workspace path. */
  path: string;
  /** As picked, when a name in it was changed to fit; else null. */
  renamedFrom: string | null;
}

/** What to do with the files picked: the ones that can go in, the empty folders, and the ones left out. */
export interface SortedUpload {
  candidates: UploadCandidate[];
  folders: UploadFolder[];
  leftOut: LeftOut[];
}

/** The most files a dropped folder is read for: more is never a workspace (20 files). */
export const MAX_PICKED = 1000;

const PROJECT_FILE = 'pathogen.json';
const join = (folder: string, name: string): string => (folder ? `${folder}/${name}` : name);
const parentOf = (path: string): string => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '');

/** Every folder of the workspace: the ones its files sit in and the empty ones. */
function foldersOf(state: WorkspaceState): string[] {
  const out = new Set<string>();
  const add = (folder: string): void => {
    for (let f = folder; f !== '' && !out.has(f); f = parentOf(f)) out.add(f);
  };
  for (const path of Object.keys(state.files)) add(parentOf(path));
  for (const folder of state.folders) add(folder);
  return [...out];
}

/** A rule's message without the name it starts with: `"my gear.pathogen" can use only…` → `can use only…`. */
const withoutName = (message: string): string => message.replace(/^"[^"]*"\s*/, '');

/** The accents NFD splits off a letter (U+0300 to U+036F), written without an escape in the source. */
const ACCENTS = new RegExp(`[${String.fromCharCode(0x300)}-${String.fromCharCode(0x36f)}]`, 'g');
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/**
 * A name made to fit the workspace's name rules (your answer, 2026-11-13: "replacing
 * spaces or other unsupported characters with a dash"): accents dropped
 * (`über` → `uber`); any other run of characters a name can't hold becomes one
 * dash (`my gear` → `my-gear`); it starts with a letter or a digit; a name
 * Windows reserves gets `-1`; it's cut to the length a name can have. A file's
 * extension is kept. A name with nothing left becomes `file` (or `folder`).
 */
export function fittedName(name: string, isFile: boolean): string {
  const limit = lib().WORKSPACE_LIMITS.nameLength;
  const dot = isFile ? name.lastIndexOf('.') : -1;
  const ext = dot > 0 ? name.slice(dot) : '';
  let stem = (dot > 0 ? name.slice(0, dot) : name).normalize('NFD').replace(ACCENTS, '');
  stem = stem
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[^A-Za-z0-9]+/, '')
    .replace(/-+$/, '');
  if (stem === '') stem = isFile ? 'file' : 'folder';
  if (WINDOWS_RESERVED.test(stem)) stem = `${stem}-1`;
  if (stem.length + ext.length > limit) stem = stem.slice(0, limit - ext.length).replace(/[-.]+$/, '');
  return `${stem}${ext}`;
}

const WEIGHTS: Record<string, number> = {
  thin: 100,
  hairline: 100,
  extralight: 200,
  ultralight: 200,
  light: 300,
  regular: 400,
  normal: 400,
  book: 400,
  medium: 500,
  semibold: 600,
  demibold: 600,
  bold: 700,
  extrabold: 800,
  ultrabold: 800,
  black: 900,
  heavy: 900,
};

/**
 * The Google Fonts line a font file's name suggests: `Raleway-Bold.ttf` →
 * `@font "Raleway" 700;`, `OpenSans-Regular.ttf` → `@font "Open Sans" 400;`.
 */
export function fontSuggestion(name: string): string {
  const parts = name
    .replace(/\.[^.]*$/, '')
    .replace(/"/g, '')
    .split(/[-_]/)
    .filter((p) => p !== '');
  // The last part names the weight when it's one (`Bold`, `SemiBoldItalic`); the rest is the family.
  const weight = parts.length > 1 ? WEIGHTS[parts[parts.length - 1].toLowerCase().replace(/italic$/, '')] : undefined;
  const familyParts = weight !== undefined ? parts.slice(0, -1) : parts;
  const family = familyParts.map((p) => p.replace(/([a-z])([A-Z])/g, '$1 $2')).join(' ');
  return weight ? `@font "${family}" ${weight};` : `@font "${family}";`;
}

/** Why a picked file that isn't a .pathogen file is left out (mockup v6 screen U, state 4; screen J, state 5). */
function kindReason(name: string, folder: string): string {
  if (name.toLowerCase() === PROJECT_FILE) {
    return folder === ''
      ? 'the playground writes this file itself. To change the main, use Set as main on a program.'
      : 'inside a folder, it would make that folder a project of its own.';
  }
  const kind = lib().workspaceFileKind(name);
  if (kind === 'font') {
    return `the playground can't load font files yet. Use the Google Fonts family instead: ${fontSuggestion(name)}`;
  }
  if (kind === 'data') return 'workspaces hold .pathogen files for now; data files come later.';
  return 'workspaces hold .pathogen files for now.';
}

/**
 * Sort the files picked for `folder` ('' is the top): where each goes, which
 * clash with a file already there, and which are left out and why; and the
 * empty folders of a dropped folder (`emptyFolders`, paths as picked).
 * - Files and folders whose names start with a dot (`.DS_Store`, `.git/`) are
 *   the computer's, and are left out without a word.
 * - A name the workspace can't use is changed to fit (fittedName), and the
 *   candidate says what it was (`renamedFrom`).
 * - A folder whose name differs from one already there (or one this upload
 *   makes) only in letter case goes into that one.
 */
export function sortUpload(
  state: WorkspaceState,
  folder: string,
  picked: readonly PickedFile[],
  emptyFolders: readonly string[] = [],
): SortedUpload {
  const limits = lib().WORKSPACE_LIMITS;
  const existingFolders = foldersOf(state);
  const folderSpelling = new Map(existingFolders.map((f) => [f.toLowerCase(), f]));
  const fileSpelling = new Map(Object.keys(state.files).map((p) => [p.toLowerCase(), p]));
  const candidates: UploadCandidate[] = [];
  const folders: UploadFolder[] = [];
  const leftOut: LeftOut[] = [];
  /** The files this upload takes so far, by their path in lower case: as picked, and whether renamed to fit. */
  const taken = new Map<string, { picked: string; renamed: boolean }>();
  /** The files this upload adds so far, by their path in lower case. */
  const newFiles = new Map<string, string>();

  /**
   * Where a picked path's folders go, each name made to fit and spelled as the
   * workspace (or this upload, so far) already spells it; and the file it runs
   * into on the way, if any (a file can't hold a folder).
   */
  const placeFolders = (segments: readonly string[]): { at: string; changed: boolean; blocked: string | null } => {
    let at = folder;
    let changed = false;
    let blocked: string | null = null;
    for (const segment of segments) {
      const fitted = fittedName(segment, false);
      if (fitted !== segment) changed = true;
      const next = join(at, fitted);
      at = folderSpelling.get(next.toLowerCase()) ?? next;
      const file = fileSpelling.get(at.toLowerCase()) ?? newFiles.get(at.toLowerCase());
      if (file !== undefined) blocked = file;
    }
    return { at, changed, blocked };
  };
  /** The folders this upload makes are spelled this way from now on. */
  const remember = (at: string): void => {
    for (let f = at; f !== '' && f !== folder; f = parentOf(f)) {
      if (!folderSpelling.has(f.toLowerCase())) folderSpelling.set(f.toLowerCase(), f);
    }
  };

  for (const file of picked) {
    const segments = file.path.split('/').filter((s) => s !== '');
    if (segments.length === 0 || segments.some((s) => s.startsWith('.'))) continue;
    const name = segments[segments.length - 1];
    const leave = (reason: string): void => {
      leftOut.push({ name: file.path, reason });
    };
    const { at, changed, blocked } = placeFolders(segments.slice(0, -1));
    if (lib().workspaceFileKind(name) !== 'pathogen') {
      leave(kindReason(name, at));
      continue;
    }
    if (blocked !== null) {
      leave(`${blocked} is a file, so it can't hold a folder.`);
      continue;
    }
    const fitted = fittedName(name, true);
    const path = join(at, fitted);
    const pathProblem = lib().workspacePathProblem(path, 'file');
    if (pathProblem) {
      leave(withoutName(pathProblem));
      continue;
    }
    if (file.size > limits.fileBytes.pathogen) {
      leave(`larger than ${limits.fileBytes.pathogen / (1024 * 1024)} MB, the most a .pathogen file can be.`);
      continue;
    }
    const renamed = changed || fitted !== name;
    const key = path.toLowerCase();
    const twin = taken.get(key);
    if (twin !== undefined) {
      leave(
        renamed || twin.renamed
          ? `would have the same name as ${twin.picked} (${fitted}), once names are changed to fit the rules.`
          : `differs from ${twin.picked} only in letter case, and both can't be in one folder.`,
      );
      continue;
    }
    if (folderSpelling.has(key)) {
      leave(`${folderSpelling.get(key)}/ is a folder with that name.`);
      continue;
    }
    taken.set(key, { picked: file.path, renamed });
    newFiles.set(key, path);
    remember(at);
    candidates.push({
      path,
      file,
      clashesWith: fileSpelling.get(key) ?? null,
      renamedFrom: renamed ? file.path : null,
    });
  }

  // A dropped folder's empty folders, after the files (whose folders they may share).
  for (const picked of emptyFolders) {
    const segments = picked.split('/').filter((s) => s !== '');
    if (segments.length === 0 || segments.some((s) => s.startsWith('.'))) continue;
    const { at, changed, blocked } = placeFolders(segments);
    if (blocked !== null) {
      leftOut.push({ name: `${picked}/`, reason: `${blocked} is a file, so it can't hold a folder.` });
      continue;
    }
    if (folderSpelling.has(at.toLowerCase())) continue;
    const problem = lib().workspacePathProblem(at, 'folder');
    if (problem) {
      leftOut.push({ name: `${picked}/`, reason: withoutName(problem) });
      continue;
    }
    remember(at);
    folders.push({ path: at, renamedFrom: changed ? `${picked}/` : null });
  }
  return { candidates, folders, leftOut };
}

const BOM = 0xfeff;
const NUL = String.fromCharCode(0);
const utf8 = new TextDecoder('utf-8', { fatal: true });

/**
 * A .pathogen file's text from its bytes, or why it can't be one. A byte-order
 * mark is dropped and line ends become `\n`, as the editor keeps them, so the
 * text saved is the text shown.
 */
export function textOf(bytes: ArrayBuffer): { text: string } | { problem: string } {
  let text: string;
  try {
    text = utf8.decode(bytes);
  } catch {
    return { problem: "isn't text, so it can't be a .pathogen file." };
  }
  if (text.includes(NUL)) return { problem: "isn't text, so it can't be a .pathogen file." };
  if (text.charCodeAt(0) === BOM) text = text.slice(1);
  return { text: text.replace(/\r\n?/g, '\n') };
}

/** The files a file input holds: Upload folder…'s keep the folder they came in (`webkitRelativePath`). */
export function pickedFromInput(files: ArrayLike<File>): { picked: PickedFile[]; truncated: boolean } {
  // A folder picked whole (a project with its dependencies) can hold tens of thousands of files.
  const all = Array.from(files).filter(
    (file) => !(file.webkitRelativePath || file.name).split('/').some((s) => s.startsWith('.')),
  );
  const picked = all.slice(0, MAX_PICKED).map((file) => ({
    path: file.webkitRelativePath || file.name,
    size: file.size,
    read: async () => file.arrayBuffer(),
  }));
  return { picked, truncated: all.length > MAX_PICKED };
}

/** The parts of a dropped file or folder entry the walk uses (FileSystemEntry), so tests can give fakes. */
export interface DroppedEntry {
  name: string;
  isFile: boolean;
  isDirectory: boolean;
  file?: (ok: (file: File) => void, fail: (err: unknown) => void) => void;
  createReader?: () => { readEntries: (ok: (entries: DroppedEntry[]) => void, fail: (err: unknown) => void) => void };
}

/** The files and folders of a drop, taken while the drop event lasts: after it, the browser empties them. */
export interface CapturedDrop {
  entries: (DroppedEntry | null)[];
  files: (File | null)[];
}

/**
 * Take what a drop holds, inside the drop handler: its entries (folders can
 * be walked) and, for an item with no entry, the file itself.
 */
export function captureDrop(data: DataTransfer): CapturedDrop {
  const items = Array.from(data.items ?? []).filter((item) => item.kind === 'file');
  if (items.length === 0) return { entries: [], files: Array.from(data.files ?? []) };
  return {
    entries: items.map((item) => (item.webkitGetAsEntry?.() as DroppedEntry | null | undefined) ?? null),
    files: items.map((item) => item.getAsFile()),
  };
}

/**
 * The files of a drop, folders walked (the browser hands a folder's entries
 * over in batches: read until an empty one). Folders whose names start with a
 * dot aren't walked. `truncated` when the drop held more than MAX_PICKED files.
 */
export async function pickedFromDrop(
  drop: CapturedDrop,
): Promise<{ picked: PickedFile[]; folders: string[]; truncated: boolean }> {
  const picked: PickedFile[] = [];
  /** The folders with nothing in them (dot-files aside): they go in as they are (your answer 7). */
  const folders: string[] = [];
  let truncated = false;
  const fileOf = async (entry: DroppedEntry): Promise<File> =>
    new Promise((resolve, reject) => entry.file!(resolve, reject));
  const childrenOf = async (entry: DroppedEntry): Promise<DroppedEntry[]> => {
    const reader = entry.createReader!();
    const all: DroppedEntry[] = [];
    for (;;) {
      const batch = await new Promise<DroppedEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
      if (batch.length === 0) return all;
      all.push(...batch);
    }
  };
  const walk = async (entry: DroppedEntry, prefix: string): Promise<void> => {
    if (truncated || entry.name.startsWith('.')) return;
    const path = join(prefix, entry.name);
    if (entry.isDirectory) {
      const children = (await childrenOf(entry)).filter((child) => !child.name.startsWith('.'));
      if (children.length === 0) folders.push(path);
      for (const child of children) await walk(child, path);
      return;
    }
    if (picked.length >= MAX_PICKED) {
      truncated = true;
      return;
    }
    const file = await fileOf(entry);
    picked.push({ path, size: file.size, read: async () => file.arrayBuffer() });
  };
  for (let i = 0; i < Math.max(drop.entries.length, drop.files.length); i++) {
    const entry = drop.entries[i] ?? null;
    if (entry) await walk(entry, '');
    else {
      const file = drop.files[i];
      if (file) picked.push({ path: file.name, size: file.size, read: async () => file.arrayBuffer() });
    }
  }
  return { picked, folders, truncated };
}

/** A name changed to fit the rules: from what was picked, to where it went. */
export interface Renamed {
  from: string;
  to: string;
}

/**
 * The toast's lines: each name changed to fit the rules (`my gear.pathogen →
 * my-gear.pathogen`), then each file left out and why, at most `max` in all,
 * then how many more.
 */
export function leftOutLines(leftOut: readonly LeftOut[], renamed: readonly Renamed[] = [], max = 6): string[] {
  const all = [...renamed.map((r) => `${r.from} → ${r.to}`), ...leftOut.map((l) => `${l.name}: ${l.reason}`)];
  const lines = all.slice(0, max);
  if (all.length > max) lines.push(`…and ${all.length - max} more.`);
  return lines;
}

/** What the toast says above its lines: names changed, files left out, or both. */
export function linesHeading(renamed: number, leftOut: number): string | null {
  if (renamed > 0 && leftOut > 0) return 'Some names were changed to fit the name rules, and some files weren’t added:';
  if (renamed > 0) return 'Some names were changed to fit the name rules:';
  if (leftOut > 0) return 'Not added:';
  return null;
}
