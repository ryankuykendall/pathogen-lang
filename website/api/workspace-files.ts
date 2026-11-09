// The rules a workspace's files follow (project-docs/modules/48-storage-design-v2.md,
// 50-storage-decisions-and-plan.md). The names, limits and the manifest's
// canonical hash live in the engine (src/workspace/files.ts), which the
// playground also reads through the browser bundle, so the two can't drift
// apart (note 51, piece 1). This file re-exports them and adds what only the
// server needs: reading a stored record in either shape.

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
