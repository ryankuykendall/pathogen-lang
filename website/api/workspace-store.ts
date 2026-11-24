// Reading and writing a workspace's files: the manifest on its KV record and
// the bytes in R2 (project-docs/modules/48-storage-design-v2.md, 50-…).
// Records are read through readStoredFiles, which refuses one from before
// phase 2 (note 71). A client may still send one `code` string (a blank or
// template workspace, an old tab): it's stored as just main.pathogen, and a
// workspace that is just main.pathogen still loads with `code` too.

import { copyFiles, putText, putTexts, readTexts, readTextsLeniently, storedSize } from './file-store.js';
import {
  checkManifest,
  contentHashOf,
  entryForText,
  fileKind,
  isJustMain,
  MAIN_FILE,
  readStoredFiles,
  storedFilesForText,
} from './workspace-files.js';

import type { Env, Workspace } from './types.js';
import type { Checked, FileEntry, StoredFileFields, StoredFiles, WorkspaceManifest } from './workspace-files.js';

export async function readWorkspaceRecord(env: Env, id: string): Promise<Workspace | null> {
  const json = await env.WORKSPACES.get(`workspace:${id}`);
  return json ? (JSON.parse(json) as Workspace) : null;
}

/** A workspace record's files (refused for a record from before phase 2: readStoredFiles). */
export function storedFilesOf(record: Workspace): Promise<StoredFiles> {
  return readStoredFiles(record, record.contentHash);
}

/** Put a manifest and its hash on a record, in today's shape. */
export function setFiles(record: StoredFileFields & { contentHash?: string }, files: StoredFiles): void {
  record.files = files.manifest.files;
  record.folders = files.manifest.folders;
  record.entryPoints = files.manifest.entryPoints;
  record.contentHash = files.hash;
  delete record.code;
}

export interface FileWithText extends FileEntry {
  text: string;
}

/**
 * A data file a load doesn't send the text of: the client reads it by its
 * hash (GET /workspace/:id/file/:sha256), which streams one file.
 */
export interface DeferredFile extends FileEntry {
  deferred: true;
}

/**
 * Data files' text a load or a viewer sends with it, in all (phase 3a step
 * 5). A workspace can hold 50 MB of data, more than a 128 MB Worker can read
 * as text and write out as JSON again in one request (note 50), so the rest
 * come back deferred.
 */
export const DATA_INLINE_BYTES = 2 * 1024 * 1024;

/**
 * The most a create's or a save's body can be (phase 3a step 5): 20
 * .pathogen files of 1 MB with room for JSON's escapes, plus small data. A
 * client sends larger files first with PUT /workspace/:id/file, one at a
 * time, and the save names them by hash (note 80).
 */
export const SAVE_BODY_BYTES = 24 * 1024 * 1024;

/**
 * The hashes a load sends the text of: every .pathogen file's (at most 20 MB,
 * the limits), and data files' in path order while they fit DATA_INLINE_BYTES.
 */
function inlinedHashes(manifest: StoredFiles['manifest']): Set<string> {
  const hashes = new Set<string>();
  let dataBytes = 0;
  for (const [path, entry] of Object.entries(manifest.files)) {
    const kind = fileKind(path);
    if (kind === 'pathogen') hashes.add(entry.sha256);
    else if (kind === 'data' && (hashes.has(entry.sha256) || dataBytes + entry.size <= DATA_INLINE_BYTES)) {
      if (!hashes.has(entry.sha256)) dataBytes += entry.size;
      hashes.add(entry.sha256);
    }
  }
  return hashes;
}

/**
 * The files with their text, as a load returns them: .pathogen files, and data
 * files up to DATA_INLINE_BYTES, the rest deferred. One R2 read per distinct
 * file sent, unless the caller already holds the texts (`known`, by sha256):
 * then a data file whose text it doesn't hold is deferred.
 */
export async function filesWithText(
  env: Env,
  workspaceId: string,
  files: StoredFiles,
  known?: ReadonlyMap<string, string>,
): Promise<{
  files: Record<string, FileWithText | DeferredFile>;
  folders: string[];
  entryPoints: string[];
  contentHash: string;
  code?: string;
}> {
  const { manifest } = files;
  const sent = inlinedHashes(manifest);
  const texts = known ?? (await readTexts(env, workspaceId, sent));
  const withText: Record<string, FileWithText | DeferredFile> = {};
  for (const [path, entry] of Object.entries(manifest.files)) {
    const text = texts.get(entry.sha256);
    withText[path] =
      fileKind(path) === 'data' && (!sent.has(entry.sha256) || text === undefined)
        ? { ...entry, deferred: true }
        : { ...entry, text: text ?? '' };
  }
  return {
    files: withText,
    folders: manifest.folders,
    entryPoints: manifest.entryPoints,
    contentHash: files.hash,
    // Today's playground reads one string: kept for a workspace that is just main.pathogen.
    ...(isJustMain(manifest) ? { code: (withText[MAIN_FILE] as FileWithText).text } : {}),
  };
}

/**
 * A file a viewer shows: its text, `unreadable` when its bytes can't be read
 * (note 59, requirement 9), or `deferred`, a data file past the budget.
 */
export type ShownFile = FileWithText | (FileEntry & { unreadable: true }) | DeferredFile;

/**
 * The files with their text for a viewer (a snapshot, an approval), as
 * filesWithText reads them, except that a file whose bytes can't be read comes
 * back marked `unreadable`, without text, and the others are still read. The
 * viewer says so in its place (project-docs/modules/59-phase-2e-several-files-
 * requirements.md, requirement 9). Data files past DATA_INLINE_BYTES come back
 * deferred, as for a load. Never for a load that may save or copy them.
 */
export async function filesToShow(
  env: Env,
  workspaceId: string,
  files: StoredFiles,
): Promise<{
  files: Record<string, ShownFile>;
  folders: string[];
  entryPoints: string[];
  contentHash: string;
  code?: string;
}> {
  const { manifest } = files;
  const sent = inlinedHashes(manifest);
  const { texts, missing } = await readTextsLeniently(env, workspaceId, sent);
  const shown: Record<string, ShownFile> = {};
  for (const [path, entry] of Object.entries(manifest.files)) {
    if (missing.has(entry.sha256)) shown[path] = { ...entry, unreadable: true };
    else if (fileKind(path) === 'data' && !sent.has(entry.sha256)) shown[path] = { ...entry, deferred: true };
    else shown[path] = { ...entry, text: texts.get(entry.sha256) ?? '' };
  }
  const main = shown[MAIN_FILE];
  return {
    files: shown,
    folders: manifest.folders,
    entryPoints: manifest.entryPoints,
    contentHash: files.hash,
    ...(isJustMain(manifest) && main && 'text' in main ? { code: main.text } : {}),
  };
}

/** A review-queue entry or an approval: files frozen when it was made, under its workspace's prefix. */
export interface FrozenRecord extends StoredFileFields {
  workspaceId: string;
  codeHash?: string;
}

export interface FrozenSource {
  files: Record<string, FileEntry | ShownFile>;
  folders: string[];
  entryPoints: string[];
  /** In today's rule. */
  codeHash: string;
  /** Its one program's text, for a record that is just main.pathogen. */
  code?: string;
}

/**
 * A queue entry's or an approval's source, as an admin screen or the detail
 * page reads it. `texts: 'all'` returns every .pathogen file's text (one R2
 * read each), for a viewer: a file that can't be read is marked `unreadable`
 * and the others still show (filesToShow). `texts: 'just-main'` is for
 * listings, which must stay near one call an entry: a record that is just
 * main.pathogen gets its text (one read), or fails if it can't be read, and
 * one with several files comes back as its manifest, whose files an admin
 * reads by hash (GET /workspace/:id/file/:sha256).
 */
export async function frozenSource(env: Env, record: FrozenRecord, texts: 'all' | 'just-main'): Promise<FrozenSource> {
  const stored = await readStoredFiles(record, record.codeHash);
  const { manifest } = stored;
  if (texts === 'just-main' && !isJustMain(manifest)) {
    return { files: manifest.files, folders: manifest.folders, entryPoints: manifest.entryPoints, codeHash: stored.hash };
  }
  const { contentHash, ...shown } =
    texts === 'all' ? await filesToShow(env, record.workspaceId, stored) : await filesWithText(env, record.workspaceId, stored);
  return { ...shown, codeHash: contentHash };
}

/**
 * The most distinct files one copy takes: two R2 calls each (a read and a
 * write) plus a few KV calls must fit the 1,000 KV and R2 calls Cloudflare
 * allows one request. With LIMITS.files at 20 no workspace comes near it;
 * it's a backstop in case that limit is raised past it.
 */
export const COPY_MAX_FILES = 480;

/**
 * Copy files to another workspace's prefix: a duplicate, a fork, a workspace
 * started from a snapshot. Each .pathogen text is read once and written; its
 * text comes back (by sha256), so the caller can answer without reading it
 * again. Other files are copied blob to blob. Refused, before any call, above COPY_MAX_FILES. Blobs are
 * written before the caller stores a manifest naming them; a failure in
 * between leaves blobs nothing names, which the sweep script removes.
 */
export async function copyStoredFiles(
  env: Env,
  fromId: string,
  toId: string,
  files: StoredFiles,
): Promise<Checked<Map<string, string>>> {
  const { manifest } = files;
  const hashes = [...new Set(Object.values(manifest.files).map((f) => f.sha256))];
  if (hashes.length > COPY_MAX_FILES) {
    return {
      ok: false,
      message: `This workspace has ${hashes.length} different files; a copy can take at most ${COPY_MAX_FILES} at once.`,
    };
  }
  // The texts the copy's own load answer sends (.pathogen files, data within
  // DATA_INLINE_BYTES) are read and written; the rest are copied blob to blob.
  const textHashes = inlinedHashes(manifest);
  const texts = await readTexts(env, fromId, textHashes);
  await putTexts(env, toId, texts.values());
  await copyFiles(
    env,
    fromId,
    toId,
    hashes.filter((sha256) => !texts.has(sha256)),
  );
  return { ok: true, value: texts };
}

/** The text of the workspace's main program, or null when it has no programs. */
export async function mainText(env: Env, workspaceId: string, files: StoredFiles): Promise<string | null> {
  const main = files.manifest.entryPoints[0];
  if (main === undefined) return null;
  const { sha256 } = files.manifest.files[main];
  return (await readTexts(env, workspaceId, [sha256])).get(sha256) ?? null;
}

/** What a create or a save may send about files. */
export interface FilesBody {
  /** Today's playground: the one program's text. */
  code?: unknown;
  /** Each file as `{ text }`, or as `{ sha256 }` for bytes already stored (a `size` sent with it is ignored). */
  files?: unknown;
  folders?: unknown;
  entryPoints?: unknown;
}

export type FilesChange = Checked<StoredFiles | null> & { status?: number };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Turn what a client sent into the workspace's new files, and write the bytes
 * that are new. Null when the body says nothing about files.
 *
 * Budget: one R2 write per new text, and one existence check per file sent
 * by hash that the current manifest doesn't already name. Files the current
 * manifest names are never checked: saves don't delete, so they exist.
 */
export async function filesFromBody(
  env: Env,
  workspaceId: string,
  body: FilesBody,
  current: StoredFiles | null,
): Promise<FilesChange> {
  const fail = (message: string, status = 400): FilesChange => ({ ok: false, message, status });

  if (body.files === undefined) {
    if (body.code === undefined) return { ok: true, value: null };
    if (typeof body.code !== 'string') return fail('"code" must be a string.');
    if (current && !isJustMain(current.manifest)) {
      // An open tab from before the workspace held several files. Saving its
      // one string would replace every file, so it's stopped like a conflict.
      return fail('This workspace now holds several files. Reload the page to edit it.', 409);
    }
    const stored = await storedFilesForText(body.code);
    const checked = checkManifest(stored.manifest);
    if (!checked.ok) return fail(checked.message);
    if (stored.hash !== current?.hash) await putText(env, workspaceId, body.code);
    return { ok: true, value: { manifest: checked.value, hash: stored.hash } };
  }

  if (!isRecord(body.files)) return fail('"files" must be an object of files by path.');
  // What's already stored under the workspace, with its size.
  const stored = new Map(Object.values(current?.manifest.files ?? {}).map((e) => [e.sha256, e.size]));

  // Texts first, so a file sent by hash can name a text sent in the same save.
  const texts = new Map<string, string>();
  const textSizes = new Map<string, number>();
  // No prototype: a path such as "__proto__" (an own key of parsed JSON) is a
  // key like any other, so checkManifest sees it and refuses it, rather than
  // the assignment setting the prototype and the file vanishing unchecked.
  const files: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  const byHash: { path: string; sha256: string }[] = [];
  for (const [path, sent] of Object.entries(body.files)) {
    if (isRecord(sent) && typeof sent.text === 'string') {
      const entry = await entryForText(sent.text);
      texts.set(entry.sha256, sent.text);
      textSizes.set(entry.sha256, entry.size);
      files[path] = entry;
    } else if (isRecord(sent) && typeof sent.sha256 === 'string') {
      byHash.push({ path, sha256: sent.sha256 });
    } else {
      return fail(`"${path}" needs its text, or the sha256 of a file already stored.`);
    }
  }
  // A file sent by hash takes its size from what's stored, never from the
  // client, so the size limits hold. Only a hash the current manifest doesn't
  // name costs a call (a head).
  for (const { path, sha256 } of byHash) {
    let size: number | null;
    if (textSizes.has(sha256)) size = textSizes.get(sha256)!;
    else if (stored.has(sha256)) size = stored.get(sha256)!;
    else if (/^[0-9a-f]{64}$/.test(sha256)) size = await storedSize(env, workspaceId, sha256);
    else size = 0; // checkManifest names the malformed hash
    if (size === null) {
      return fail(`"${path}" names a file this workspace doesn't have (sha256 ${sha256}). Send its text instead.`);
    }
    files[path] = { sha256, size };
  }

  const entryPoints = body.entryPoints ?? current?.manifest.entryPoints ?? (MAIN_FILE in files ? [MAIN_FILE] : []);
  const folders = body.folders ?? current?.manifest.folders ?? [];
  const checked = checkManifest({ files, folders, entryPoints });
  if (!checked.ok) return fail(checked.message);

  await putTexts(
    env,
    workspaceId,
    [...texts.entries()].filter(([sha256]) => !stored.has(sha256)).map(([, text]) => text),
  );
  return { ok: true, value: { manifest: checked.value, hash: await contentHashOf(checked.value) } };
}

/**
 * Re-read a record and apply only this request's changes just before
 * writing, so a save or an admin action that landed meanwhile isn't reverted
 * (KV has no compare-and-swap; this narrows the window to the read→put gap).
 * Every write of a workspace record goes through here.
 */
export async function patchWorkspaceRecord(
  env: Env,
  id: string,
  change: (record: Workspace) => void,
): Promise<Workspace | null> {
  const record = await readWorkspaceRecord(env, id);
  if (!record) return null;
  change(record);
  await env.WORKSPACES.put(`workspace:${id}`, JSON.stringify(record));
  return record;
}
