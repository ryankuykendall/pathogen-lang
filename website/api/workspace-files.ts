// The rules a workspace's files follow (project-docs/modules/48-storage-design-v2.md,
// 50-storage-decisions-and-plan.md): names, limits, the manifest's canonical
// hash, and reading a record saved before workspaces held files. Pure — no
// bindings — so the API, the migration script and (step 2c) the playground
// share one copy and can't drift apart.

import { hashContent } from './utils.js';

export const MAIN_FILE = 'main.pathogen';
/** Reserved in every folder: in the CLI, a pathogen.json makes its folder a project of its own. */
export const PROJECT_FILE = 'pathogen.json';

export type FileKind = 'pathogen' | 'data' | 'font';

const KIND_BY_EXTENSION: Record<string, FileKind> = {
  '.pathogen': 'pathogen',
  '.json': 'data',
  '.csv': 'data',
  '.tsv': 'data',
  '.txt': 'data',
  '.svg': 'data',
  '.ttf': 'font',
  '.otf': 'font',
  '.woff': 'font',
  '.woff2': 'font',
};

/** The kinds a workspace may hold today. Data files and fonts come after phase 2. */
export const ALLOWED_KINDS: readonly FileKind[] = ['pathogen'];

export const LIMITS = {
  /**
   * 20 to start (the user's call, 2026-11-08: "let's cap a workspace to 20
   * files and see if we have users who bump up against this limit"). Note 50
   * has the call budget for raising it: a load costs one R2 read a file and a
   * copy two, inside 1,000 calls a request.
   */
  files: 20,
  /** Folders inside folders. */
  folderDepth: 8,
  nameLength: 100,
  pathLength: 255,
  workspaceBytes: 50 * 1024 * 1024,
  fileBytes: { pathogen: 1024 * 1024, data: 5 * 1024 * 1024, font: 20 * 1024 * 1024 } as Record<FileKind, number>,
} as const;

/** One file of a workspace: its bytes are in R2 under the workspace, at this hash. */
export interface FileEntry {
  /** The full SHA-256 of the file's bytes, in lowercase hex. */
  sha256: string;
  /** Bytes. */
  size: number;
}

/** What a workspace holds, beside its metadata. */
export interface WorkspaceManifest {
  /** Every file by its path: "main.pathogen", "parts/gears.pathogen". */
  files: Record<string, FileEntry>;
  /** Only the folders with nothing under them; the others come from the file paths. */
  folders: string[];
  /** The programs in order, the main first (pathogen.json's entryPoints). */
  entryPoints: string[];
}

export type Checked<T> = { ok: true; value: T } | { ok: false; message: string };

const NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;
const SHA256 = /^[0-9a-f]{64}$/;

/** The kind of file a path names, by its extension; null for one a workspace never holds. */
export function fileKind(path: string): FileKind | null {
  const name = path.slice(path.lastIndexOf('/') + 1);
  const dot = name.lastIndexOf('.');
  return dot > 0 ? (KIND_BY_EXTENSION[name.slice(dot).toLowerCase()] ?? null) : null;
}

/** Why a single file or folder name isn't allowed, or null. */
export function nameProblem(name: string): string | null {
  if (name === '') return "A name can't be empty.";
  if (name.length > LIMITS.nameLength) return `"${name}" is longer than ${LIMITS.nameLength} characters.`;
  if (name.toLowerCase() === PROJECT_FILE) {
    return `"${name}" is reserved: the playground writes the workspace's pathogen.json itself.`;
  }
  if (!NAME.test(name)) {
    return `"${name}" can use only letters a–z and A–Z, digits, -, _ and ., and must start with a letter or a digit.`;
  }
  if (WINDOWS_RESERVED.test(name)) return `"${name}" is a name Windows reserves for itself.`;
  return null;
}

/** Why a file's or a folder's path isn't allowed, or null. */
export function pathProblem(path: string, kind: 'file' | 'folder'): string | null {
  if (path.length > LIMITS.pathLength) return `"${path}" is longer than ${LIMITS.pathLength} characters.`;
  const segments = path.split('/');
  for (const segment of segments) {
    const problem = nameProblem(segment);
    if (problem) return problem;
  }
  const folders = kind === 'file' ? segments.length - 1 : segments.length;
  if (folders > LIMITS.folderDepth) return `"${path}" is more than ${LIMITS.folderDepth} folders deep.`;
  if (kind === 'file') {
    const fileType = fileKind(path);
    if (fileType === null || !ALLOWED_KINDS.includes(fileType)) {
      return `"${path}": a workspace holds .pathogen files for now.`;
    }
  }
  return null;
}

/** The folders a file path sits in: "a/b/c.pathogen" → ["a", "a/b"]. */
function foldersOf(path: string): string[] {
  const segments = path.split('/');
  return segments.slice(0, -1).map((_, i) => segments.slice(0, i + 1).join('/'));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Check a manifest against every rule (names, limits, letter case, the entry
 * points) and return it normalized: files and folders sorted, and `folders`
 * kept to the ones with nothing under them, so equal workspaces have equal
 * records.
 */
export function checkManifest(input: unknown): Checked<WorkspaceManifest> {
  const fail = (message: string): Checked<WorkspaceManifest> => ({ ok: false, message });
  if (!isRecord(input) || !isRecord(input.files)) return fail('A workspace needs a "files" object.');
  const folderList = input.folders ?? [];
  const entryList = input.entryPoints ?? [];
  if (!Array.isArray(folderList) || !folderList.every((f) => typeof f === 'string')) {
    return fail('"folders" must be a list of folder paths.');
  }
  if (!Array.isArray(entryList) || !entryList.every((e) => typeof e === 'string')) {
    return fail('"entryPoints" must be a list of file paths.');
  }

  const paths = Object.keys(input.files).sort();
  if (paths.length > LIMITS.files)
    return fail(`A workspace can hold at most ${LIMITS.files} files; this one has ${paths.length}.`);

  const files: Record<string, FileEntry> = {};
  let total = 0;
  for (const path of paths) {
    const problem = pathProblem(path, 'file');
    if (problem) return fail(problem);
    const entry = input.files[path];
    if (!isRecord(entry) || typeof entry.sha256 !== 'string' || !SHA256.test(entry.sha256)) {
      return fail(`"${path}" needs a sha256: 64 lowercase hex digits.`);
    }
    if (typeof entry.size !== 'number' || !Number.isInteger(entry.size) || entry.size < 0) {
      return fail(`"${path}" needs a size in bytes.`);
    }
    const limit = LIMITS.fileBytes[fileKind(path)!];
    if (entry.size > limit)
      return fail(`"${path}" is larger than ${megabytes(limit)}, the most a file of its kind can be.`);
    total += entry.size;
    files[path] = { sha256: entry.sha256, size: entry.size };
  }
  if (total > LIMITS.workspaceBytes) {
    return fail(
      `A workspace can hold at most ${megabytes(LIMITS.workspaceBytes)}; this one holds ${megabytes(total)}.`,
    );
  }

  for (const folder of folderList as string[]) {
    const problem = pathProblem(folder, 'folder');
    if (problem) return fail(problem);
  }

  // Letter case: two names a case-insensitive file system would take for one.
  const spelled = new Map<string, string>();
  const claim = (path: string, what: string): string | null => {
    const key = path.toLowerCase();
    const earlier = spelled.get(key);
    if (earlier !== undefined && earlier !== path) {
      return `"${earlier}" and "${path}" differ only in letter case, so they would be one ${what} on macOS and Windows.`;
    }
    spelled.set(key, path);
    return null;
  };
  const folderSet = new Set<string>();
  for (const path of paths) for (const folder of foldersOf(path)) folderSet.add(folder);
  for (const folder of folderList as string[]) {
    folderSet.add(folder);
    for (const parent of foldersOf(`${folder}/x`).slice(0, -1)) folderSet.add(parent);
  }
  for (const folder of [...folderSet].sort()) {
    const clash = claim(folder, 'folder');
    if (clash) return fail(clash);
  }
  const folderKeys = new Set([...folderSet].map((f) => f.toLowerCase()));
  for (const path of paths) {
    if (folderKeys.has(path.toLowerCase())) return fail(`"${path}" is both a file and a folder.`);
    const clash = claim(path, 'file');
    if (clash) return fail(clash);
  }

  // Only the folders with nothing under them are kept.
  const occupied = new Set<string>();
  for (const path of paths) for (const folder of foldersOf(path)) occupied.add(folder);
  for (const folder of folderList as string[])
    for (const parent of foldersOf(`${folder}/x`).slice(0, -1)) occupied.add(parent);
  const folders = [...new Set(folderList as string[])].filter((f) => !occupied.has(f)).sort();

  const entryPoints: string[] = [];
  for (const entry of entryList as string[]) {
    if (!(entry in files)) return fail(`"entryPoints" lists "${entry}", which isn't a file in this workspace.`);
    if (fileKind(entry) !== 'pathogen') return fail(`"entryPoints" lists "${entry}", which isn't a .pathogen file.`);
    if (entryPoints.includes(entry)) return fail(`"entryPoints" lists "${entry}" twice.`);
    entryPoints.push(entry);
  }

  return { ok: true, value: { files, folders, entryPoints } };
}

function megabytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return `${Number.isInteger(mb) ? mb : mb.toFixed(1)} MB`;
}

/** A workspace that is just main.pathogen, as every workspace was before phase 2. */
export function isJustMain(manifest: WorkspaceManifest): boolean {
  const paths = Object.keys(manifest.files);
  return (
    paths.length === 1 &&
    paths[0] === MAIN_FILE &&
    manifest.folders.length === 0 &&
    manifest.entryPoints.length === 1 &&
    manifest.entryPoints[0] === MAIN_FILE
  );
}

/**
 * The workspace's content hash: one rule for every workspace (note 48 §7).
 * Files by path with their hashes, then the entry points in their order, then
 * the empty folders — so renaming, reordering the entry points or adding an
 * empty folder changes it, and nothing else does.
 */
export async function contentHashOf(manifest: WorkspaceManifest): Promise<string> {
  const files = Object.keys(manifest.files)
    .sort()
    .map((path) => [path, manifest.files[path].sha256]);
  return hashContent(JSON.stringify([files, manifest.entryPoints, [...manifest.folders].sort()]));
}

/** The full SHA-256 of a text's UTF-8 bytes, in lowercase hex. */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function utf8Size(text: string): number {
  return new TextEncoder().encode(text).length;
}

/** A text as a file entry. */
export async function entryForText(text: string): Promise<FileEntry> {
  return { sha256: await sha256Hex(text), size: utf8Size(text) };
}

/** The fields a stored workspace, approval or queue entry may carry, in either shape. */
export interface StoredFileFields {
  /** Before phase 2: the one program's text. */
  code?: string;
  files?: Record<string, FileEntry>;
  folders?: string[];
  entryPoints?: string[];
}

export interface StoredFiles {
  manifest: WorkspaceManifest;
  /** The content hash in today's rule. */
  hash: string;
  /** For a record from before phase 2: the program's text, which isn't in R2 yet. */
  legacyText: string | null;
}

/**
 * Read a stored record's files, whichever shape it was saved in. A record from
 * before phase 2 (`code`, no `files`) reads as just main.pathogen, with its
 * hash in today's rule, so comparisons never mix the two rules: an unchanged
 * save is still unchanged, and an approved, unedited workspace still matches
 * its approval. The migration script writes exactly this.
 *
 * `storedHash` is the record's own hash (`contentHash`, or an approval's
 * `codeHash`); it's used as is for a record already in today's shape.
 */
export async function readStoredFiles(record: StoredFileFields, storedHash: string | undefined): Promise<StoredFiles> {
  if (record.files) {
    const manifest: WorkspaceManifest = {
      files: record.files,
      folders: record.folders ?? [],
      entryPoints: record.entryPoints ?? [],
    };
    return { manifest, hash: storedHash ?? (await contentHashOf(manifest)), legacyText: null };
  }
  const code = record.code ?? '';
  const manifest: WorkspaceManifest = {
    files: { [MAIN_FILE]: await entryForText(code) },
    folders: [],
    entryPoints: [MAIN_FILE],
  };
  return { manifest, hash: await contentHashOf(manifest), legacyText: code };
}
