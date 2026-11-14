// Reading and writing a workspace's files: the manifest on its KV record and
// the bytes in R2 (project-docs/modules/48-storage-design-v2.md, 50-…).
// Records from before phase 2 (one `code` string) are read through
// readStoredFiles, so every comparison uses today's hash rule, and are
// rewritten in today's shape the first time their files change.
//
// Until step 2e ships the multi-file playground, today's clients keep
// working: a workspace that is just main.pathogen still reads and saves as
// one `code` string.

import { copyFiles, putText, readTexts, storedSize } from './file-store.js';
import {
  checkManifest,
  contentHashOf,
  entryForText,
  fileKind,
  isJustMain,
  MAIN_FILE,
  readStoredFiles,
} from './workspace-files.js';

import type { Env, Workspace } from './types.js';
import type { Checked, FileEntry, StoredFileFields, StoredFiles, WorkspaceManifest } from './workspace-files.js';

export async function readWorkspaceRecord(env: Env, id: string): Promise<Workspace | null> {
  const json = await env.WORKSPACES.get(`workspace:${id}`);
  return json ? (JSON.parse(json) as Workspace) : null;
}

/** A workspace record's files, in either shape. */
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

/**
 * Make sure a record from before phase 2 has its text in R2, so a manifest
 * copied from it (a review submission, an approval, a copy) points at a blob
 * that exists. One write; nothing for a record in today's shape.
 */
export async function materialize(env: Env, workspaceId: string, files: StoredFiles): Promise<void> {
  if (files.legacyText !== null) await putText(env, workspaceId, files.legacyText);
}

export interface FileWithText extends FileEntry {
  text: string;
}

/**
 * The files with their text, as a load returns them. One R2 read per distinct
 * .pathogen file, unless the caller already holds the texts (`known`, by sha256).
 */
export async function filesWithText(
  env: Env,
  workspaceId: string,
  files: StoredFiles,
  known?: ReadonlyMap<string, string>,
): Promise<{
  files: Record<string, FileWithText>;
  folders: string[];
  entryPoints: string[];
  contentHash: string;
  code?: string;
}> {
  const { manifest } = files;
  const hashes = Object.entries(manifest.files)
    .filter(([path]) => fileKind(path) === 'pathogen')
    .map(([, entry]) => entry.sha256);
  const texts =
    files.legacyText !== null
      ? new Map([[manifest.files[MAIN_FILE].sha256, files.legacyText]])
      : (known ?? (await readTexts(env, workspaceId, hashes)));
  const withText: Record<string, FileWithText> = {};
  for (const [path, entry] of Object.entries(manifest.files)) {
    withText[path] = { ...entry, text: texts.get(entry.sha256) ?? '' };
  }
  return {
    files: withText,
    folders: manifest.folders,
    entryPoints: manifest.entryPoints,
    contentHash: files.hash,
    // Today's playground reads one string: kept for a workspace that is just main.pathogen.
    ...(isJustMain(manifest) ? { code: withText[MAIN_FILE].text } : {}),
  };
}

/** A review-queue entry or an approval: files frozen when it was made, under its workspace's prefix. */
export interface FrozenRecord extends StoredFileFields {
  workspaceId: string;
  codeHash?: string;
}

export interface FrozenSource {
  files: Record<string, FileEntry | FileWithText>;
  folders: string[];
  entryPoints: string[];
  /** In today's rule, also for a record from before phase 2. */
  codeHash: string;
  /** Its one program's text, for a record that is just main.pathogen. */
  code?: string;
}

/**
 * A queue entry's or an approval's source, as an admin screen or the detail
 * page reads it. `texts: 'all'` returns every .pathogen file's text (one R2
 * read each). `texts: 'just-main'` is for listings, which must stay near one
 * call an entry: a record that is just main.pathogen gets its text (one read;
 * none for a record from before phase 2), and one with several files comes
 * back as its manifest, whose files an admin reads by hash
 * (GET /workspace/:id/file/:sha256).
 */
export async function frozenSource(env: Env, record: FrozenRecord, texts: 'all' | 'just-main'): Promise<FrozenSource> {
  const stored = await readStoredFiles(record, record.codeHash);
  const { manifest } = stored;
  if (texts === 'just-main' && !isJustMain(manifest)) {
    return { files: manifest.files, folders: manifest.folders, entryPoints: manifest.entryPoints, codeHash: stored.hash };
  }
  const { contentHash, ...withText } = await filesWithText(env, record.workspaceId, stored);
  return { ...withText, codeHash: contentHash };
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
 * again. Other files are copied blob to blob. A record from before phase 2
 * writes its text. Refused, before any call, above COPY_MAX_FILES. Blobs are
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
  const textHashes = new Set(
    Object.entries(manifest.files)
      .filter(([path]) => fileKind(path) === 'pathogen')
      .map(([, entry]) => entry.sha256),
  );
  const texts =
    files.legacyText !== null
      ? new Map([[manifest.files[MAIN_FILE].sha256, files.legacyText]])
      : await readTexts(env, fromId, textHashes);
  await Promise.all([...texts.values()].map((text) => putText(env, toId, text)));
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
  if (files.legacyText !== null) return files.legacyText;
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
    const entry = await entryForText(body.code);
    const manifest: WorkspaceManifest = { files: { [MAIN_FILE]: entry }, folders: [], entryPoints: [MAIN_FILE] };
    const checked = checkManifest(manifest);
    if (!checked.ok) return fail(checked.message);
    const hash = await contentHashOf(checked.value);
    if (hash !== current?.hash) await putText(env, workspaceId, body.code);
    return { ok: true, value: { manifest: checked.value, hash, legacyText: null } };
  }

  if (!isRecord(body.files)) return fail('"files" must be an object of files by path.');
  // What's already stored under the workspace, with its size. A record from
  // before phase 2 has its one text on the record, not in R2: it's written
  // if the new manifest names it.
  const stored = new Map(Object.values(current?.manifest.files ?? {}).map((e) => [e.sha256, e.size]));
  const legacy =
    current && current.legacyText !== null
      ? { sha256: current.manifest.files[MAIN_FILE].sha256, text: current.legacyText }
      : null;
  if (legacy) stored.delete(legacy.sha256);

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
    if (legacy && sha256 === legacy.sha256) {
      texts.set(sha256, legacy.text);
      size = (await entryForText(legacy.text)).size;
    } else if (textSizes.has(sha256)) size = textSizes.get(sha256)!;
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

  await Promise.all(
    [...texts.entries()].filter(([sha256]) => !stored.has(sha256)).map(([, text]) => putText(env, workspaceId, text)),
  );
  return { ok: true, value: { manifest: checked.value, hash: await contentHashOf(checked.value), legacyText: null } };
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
