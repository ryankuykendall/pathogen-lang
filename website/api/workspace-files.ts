// The rules a workspace's files follow (project-docs/modules/48-storage-design-v2.md,
// 50-storage-decisions-and-plan.md). The names, limits and the manifest's
// canonical hash live in the engine (src/workspace/files.ts), which the
// playground also reads through the browser bundle, so the two can't drift
// apart (note 51, piece 1). This file re-exports them and adds what only the
// server needs: reading a stored record. Records from before phase 2 (one
// `code` string, no `files`) are no longer read: production had none left
// after the migration (note 71), and the migration script keeps its own
// reader for old backups (scripts/lib/workspace-files-migration.ts).

import { contentHashOf, entryForText, MAIN_FILE } from '../../src/workspace/files.js';

import type { FileEntry, WorkspaceManifest } from '../../src/workspace/files.js';

export {
  ALLOWED_KINDS,
  checkManifest,
  contentHashOf,
  entryForText,
  fileKind,
  isJustMain,
  LIMITS,
  MAIN_FILE,
  nameProblem,
  pathProblem,
  PROJECT_FILE,
  sha256Hex,
  utf8Size,
} from '../../src/workspace/files.js';
export type { Checked, FileEntry, FileKind, WorkspaceManifest } from '../../src/workspace/files.js';

/**
 * The fields a stored workspace, approval or queue entry carries. `code` is
 * only on a record from before phase 2, which readStoredFiles refuses; setFiles
 * deletes it from a record it writes.
 */
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
}

/** Why a record from before phase 2 can't be read: a handler's error says so, and nothing is written over it. */
export const OLD_SHAPE_MESSAGE =
  'This workspace is stored in a format from before November 2026 that the site no longer reads. Nothing was changed.';

/**
 * Read a stored record's files. `storedHash` is the record's own hash
 * (`contentHash`, or an approval's `codeHash`), used as is. A record without
 * `files` (one `code` string from before phase 2, or neither) throws
 * OLD_SHAPE_MESSAGE rather than be read as a program.
 */
export async function readStoredFiles(record: StoredFileFields, storedHash: string | undefined): Promise<StoredFiles> {
  if (!record.files) throw new Error(OLD_SHAPE_MESSAGE);
  const manifest: WorkspaceManifest = {
    files: record.files,
    folders: record.folders ?? [],
    entryPoints: record.entryPoints ?? [],
  };
  return { manifest, hash: storedHash ?? (await contentHashOf(manifest)) };
}

/**
 * One program's text as a workspace of just main.pathogen, in today's hash
 * rule: what a create or a save that sends one `code` string stores (today's
 * New Workspace page sends one for a blank or template workspace).
 */
export async function storedFilesForText(code: string): Promise<StoredFiles> {
  const manifest: WorkspaceManifest = {
    files: { [MAIN_FILE]: await entryForText(code) },
    folders: [],
    entryPoints: [MAIN_FILE],
  };
  return { manifest, hash: await contentHashOf(manifest) };
}
