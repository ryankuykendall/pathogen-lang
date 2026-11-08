// The record transformation behind scripts/migrate-workspace-files-kv.ts
// (storage step 7; project-docs/modules/48-storage-design-v2.md §8, note 50).
// Pure: no KV, R2 or D1. Each function takes a record saved before phase 2
// (one `code` string) and returns the record in today's shape plus the one
// blob to write, using the API's own reader and hash (website/api/
// workspace-files.ts), so the migration can't compute a hash differently
// from the code that later compares it (note 48 §7).
//
// Each result is checked against the API's reader before it's returned: the
// new record reads back as the same manifest and the same hash as the old
// record read through readStoredFiles, and the blob's bytes hash to the name
// the manifest gives them. An unchanged save is then still skipped, and an
// approved, unedited workspace still matches its approval.

import { MAIN_FILE, readStoredFiles, sha256Hex } from '../../website/api/workspace-files';

import type { StoredFileFields, StoredFiles, WorkspaceManifest } from '../../website/api/workspace-files';

export interface BlobToWrite {
  workspaceId: string;
  sha256: string;
  text: string;
}

export type Migrated<T> =
  | { kind: 'already' }
  | { kind: 'migrate'; record: T; blob: BlobToWrite; hash: string }
  | { kind: 'error'; message: string };

type Rec = StoredFileFields & Record<string, unknown>;

function sameManifest(a: WorkspaceManifest, b: WorkspaceManifest): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * One record (a workspace, an approval, or a queue entry). `hashField` is
 * where the record keeps its hash: `contentHash` on a workspace, `codeHash`
 * on an approval or queue entry. `workspaceId` names the prefix the blob goes
 * under: the workspace's own, also for its approval and queue entries.
 */
export async function migrateRecord<T extends Rec>(
  record: T,
  hashField: 'contentHash' | 'codeHash',
  workspaceId: string,
): Promise<Migrated<T>> {
  if (record.files !== undefined) return { kind: 'already' };
  // The API reads a record with neither as an empty program; the migration
  // doesn't write one down as that: a damaged record is reported instead.
  if (record.code === undefined) return { kind: 'error', message: 'has neither `code` nor `files`' };
  if (typeof record.code !== 'string') return { kind: 'error', message: '`code` is not a string' };
  const before = await readStoredFiles(record, record[hashField] as string | undefined);
  const next: Rec = { ...record };
  delete next.code;
  next.files = before.manifest.files;
  next.folders = before.manifest.folders;
  next.entryPoints = before.manifest.entryPoints;
  next[hashField] = before.hash;

  const after = await readStoredFiles(next, next[hashField] as string);
  if (after.hash !== before.hash || !sameManifest(after.manifest, before.manifest)) {
    return { kind: 'error', message: 'the migrated record reads back differently from the original' };
  }
  const blob = await blobOf(before, workspaceId);
  if (typeof blob === 'string') return { kind: 'error', message: blob };
  return { kind: 'migrate', record: next as T, blob, hash: before.hash };
}

async function blobOf(files: StoredFiles, workspaceId: string): Promise<BlobToWrite | string> {
  const text = files.legacyText ?? '';
  const sha256 = files.manifest.files[MAIN_FILE].sha256;
  if ((await sha256Hex(text)) !== sha256) return 'the blob would not hash to the name its manifest gives it';
  return { workspaceId, sha256, text };
}

/**
 * A queue (`queue:review`, `queue:rereview`): every entry from before phase 2,
 * in one write. `include` limits it (one workspace; entries whose workspace
 * still exists); the others are kept exactly as they are.
 */
export async function migrateQueue<T extends Rec & { workspaceId: string }>(
  entries: T[],
  include: (entry: T) => boolean = () => true,
): Promise<{ entries: T[]; blobs: BlobToWrite[]; changed: number; errors: string[] }> {
  const out: T[] = [];
  const blobs: BlobToWrite[] = [];
  const errors: string[] = [];
  let changed = 0;
  for (const entry of entries) {
    if (!include(entry)) {
      out.push(entry);
      continue;
    }
    const result = await migrateRecord(entry, 'codeHash', entry.workspaceId);
    if (result.kind === 'migrate') {
      out.push(result.record);
      blobs.push(result.blob);
      changed++;
    } else {
      if (result.kind === 'error') errors.push(`${entry.workspaceId}: ${result.message}`);
      out.push(entry);
    }
  }
  return { entries: out, blobs, changed, errors };
}

/** A snapshot from before phase 2: its code.pathogen becomes a blob and a manifest.json. */
export async function migrateSnapshotCode(
  code: string,
  workspaceId: string,
): Promise<{ manifestJson: string; blob: BlobToWrite } | { error: string }> {
  const files = await readStoredFiles({ code }, undefined);
  const blob = await blobOf(files, workspaceId);
  if (typeof blob === 'string') return { error: blob };
  return { manifestJson: JSON.stringify({ ...files.manifest, contentHash: files.hash }), blob };
}

/**
 * The re-review answer the API gives for an approval and its workspace: true
 * when a save would queue a re-review (router.ts compares the two hashes,
 * each read through readStoredFiles).
 */
export async function rereviewWouldTrigger(approval: Rec, workspace: Rec): Promise<boolean> {
  const a = await readStoredFiles(approval, approval.codeHash as string | undefined);
  const w = await readStoredFiles(workspace, workspace.contentHash as string | undefined);
  return a.hash !== w.hash;
}
