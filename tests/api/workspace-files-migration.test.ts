// The record transformation of the phase 2 storage migration (storage step 7;
// scripts/lib/workspace-files-migration.ts). The last describe block puts
// migrated records and their blobs into in-memory KV and R2 and drives the
// real API handlers, so "migrated" means "the API reads it as before".

import { describe, expect, it } from 'vitest';

import { MemoryR2 } from './memory-r2';
import { storedRecord } from './workspace-helpers';
import {
  migrateQueue,
  migrateRecord,
  migrateSnapshotCode,
  readEitherShape,
  rereviewWouldTrigger,
} from '../../scripts/lib/workspace-files-migration';
import { listRereviewQueue } from '../../website/api/moderation';
import { handleApiRequest } from '../../website/api/router';
import { hashContent } from '../../website/api/utils';
import { entryForText, storedFilesForText } from '../../website/api/workspace-files';
import { MemoryKV } from '../auth/helpers';

import type { Env, KVNamespace } from '../../website/api/types';

const CODE = 'define ViewBox(0, 0, 100, 100);\ncircle(50, 50, 40);\n';

async function legacyWorkspace(id: string, code: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    slug: 'old',
    userId: 'u1',
    name: 'Old',
    description: '',
    code,
    isPublic: false,
    preferences: { background: '#fff' },
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    contentHash: await hashContent(code),
    rev: 7,
    thumbnailAt: null,
    manualThumbnailAt: null,
    autoThumbnailAt: null,
    ...extra,
  };
}

async function legacyApproval(id: string, code: string) {
  return {
    workspaceId: id,
    userId: 'u1',
    code,
    codeHash: await hashContent(code),
    slug: 'old',
    name: 'Old',
    description: '',
    approvedAt: '2026-10-02T00:00:00.000Z',
    approvedByUserId: 'admin',
    featuredAt: null,
  };
}

describe('migrateRecord', () => {
  it("turns a workspace's `code` into a manifest, today's hash and one blob, and keeps every other field", async () => {
    const old = await legacyWorkspace('w1', CODE);
    const result = await migrateRecord(old, 'contentHash', 'w1');
    expect(result.kind).toBe('migrate');
    if (result.kind !== 'migrate') return;
    const main = await entryForText(CODE);
    const rest: Record<string, unknown> = { ...old };
    delete rest.code;
    expect(result.record).toEqual({
      ...rest,
      files: { 'main.pathogen': main },
      folders: [],
      entryPoints: ['main.pathogen'],
      contentHash: (await storedFilesForText(CODE)).hash,
    });
    expect(result.record.rev).toBe(7);
    expect(result.blob).toEqual({ workspaceId: 'w1', sha256: main.sha256, text: CODE });
  });

  it('leaves a record that already holds files, and refuses one with no `code` or a `code` that is not a string', async () => {
    expect(await migrateRecord({ files: {} }, 'contentHash', 'w')).toEqual({ kind: 'already' });
    expect(await migrateRecord({ code: 3 } as never, 'contentHash', 'w')).toEqual({
      kind: 'error',
      message: '`code` is not a string',
    });
    expect(await migrateRecord({ id: 'w', name: 'damaged' }, 'contentHash', 'w')).toEqual({
      kind: 'error',
      message: 'has neither `code` nor `files`',
    });
  });

  it('reads the old shape itself, now that the API refuses it (note 71): the hash the API had given it', async () => {
    const read = await readEitherShape({ code: CODE }, await hashContent(CODE));
    expect(read).toEqual({ ...(await storedFilesForText(CODE)), text: CODE });
    // Today's shape reads as the API reads it.
    const stored = await storedFilesForText(CODE);
    expect(await readEitherShape({ ...stored.manifest }, stored.hash)).toEqual({ ...stored, text: null });
  });

  it("gives an approval and its unedited workspace the same hash, so re-review's answer doesn't change", async () => {
    for (const [workspaceCode, approvedCode, wouldTrigger] of [
      [CODE, CODE, false],
      [`${CODE}// edited\n`, CODE, true],
    ] as const) {
      const ws = await legacyWorkspace('w2', workspaceCode);
      const approval = await legacyApproval('w2', approvedCode);
      expect(await rereviewWouldTrigger(approval, ws)).toBe(wouldTrigger);
      const newWs = await migrateRecord(ws, 'contentHash', 'w2');
      const newApproval = await migrateRecord(approval, 'codeHash', 'w2');
      if (newWs.kind !== 'migrate' || newApproval.kind !== 'migrate') throw new Error('expected migrations');
      expect(await rereviewWouldTrigger(newApproval.record, newWs.record)).toBe(wouldTrigger);
      expect(newApproval.blob.workspaceId).toBe('w2');
    }
  });
});

describe('migrateQueue', () => {
  it('migrates the old entries, leaves the rest as they are, and can be limited to one workspace', async () => {
    const already = { workspaceId: 'w3', files: { 'main.pathogen': await entryForText('A') }, codeHash: 'h' };
    const entries = [
      { workspaceId: 'w1', code: 'one', codeHash: await hashContent('one') },
      already,
      { workspaceId: 'w2', code: 'two', codeHash: await hashContent('two') },
    ];
    const all = await migrateQueue(entries);
    expect([all.changed, all.errors, all.blobs.map((b) => b.workspaceId)]).toEqual([2, [], ['w1', 'w2']]);
    expect(all.entries[1]).toBe(already);
    expect(all.entries.every((e) => !('code' in e))).toBe(true);

    const onlyW2 = await migrateQueue(entries, (e) => e.workspaceId === 'w2');
    expect([onlyW2.changed, onlyW2.entries[0]]).toEqual([1, entries[0]]);
  });
});

describe('migrateSnapshotCode', () => {
  it('makes the manifest.json the API reads, and the blob', async () => {
    const result = await migrateSnapshotCode(CODE, 'w4');
    if ('error' in result) throw new Error(result.error);
    const stored = await storedFilesForText(CODE);
    expect(JSON.parse(result.manifestJson)).toEqual({ ...stored.manifest, contentHash: stored.hash });
    const { sha256 } = stored.manifest.files['main.pathogen'];
    expect(result.blob).toEqual({ workspaceId: 'w4', sha256, text: CODE });
  });
});

describe('migrated records, read by the API', () => {
  async function migratedEnv(): Promise<{ env: Env; kv: KVNamespace; r2: MemoryR2 }> {
    const kv = new MemoryKV() as unknown as KVNamespace;
    const r2 = new MemoryR2();
    const env = { WORKSPACES: kv, THUMBNAILS: r2, USERS_DB: undefined as unknown as Env['USERS_DB'] } as Env;
    const ws = await migrateRecord(await legacyWorkspace('w5', CODE, { isPublic: true }), 'contentHash', 'w5');
    const approval = await migrateRecord(await legacyApproval('w5', CODE), 'codeHash', 'w5');
    if (ws.kind !== 'migrate' || approval.kind !== 'migrate') throw new Error('expected migrations');
    // As the script writes them: the blob first, then the records.
    await r2.put(`files/w5/${ws.blob.sha256}`, ws.blob.text);
    await kv.put('workspace:w5', JSON.stringify(ws.record));
    await kv.put('approval:w5', JSON.stringify(approval.record));
    await kv.put('user:u1:workspaces', JSON.stringify(['w5']));
    return { env, kv, r2 };
  }

  const call = async (env: Env, method: string, body?: unknown) => {
    const res = await handleApiRequest(
      new Request('https://api.pathogen.studio/workspace/w5', {
        method,
        headers: { 'Content-Type': 'application/json', 'X-User-Id': 'u1' },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      }),
      env,
      '/workspace/w5',
    );
    return (await res.json()) as Record<string, unknown>;
  };

  it('loads the same code, skips an unchanged save, and sends no approved, unedited workspace to re-review', async () => {
    const { env, kv } = await migratedEnv();
    expect((await call(env, 'GET')).code).toBe(CODE);
    const before = await storedRecord(kv, 'w5');
    expect(await call(env, 'PUT', { code: CODE, baseRev: 7 })).toMatchObject({ skipped: true, rev: 7 });
    expect(await storedRecord(kv, 'w5')).toEqual(before);
    expect(await listRereviewQueue(env)).toEqual([]);

    // An edit after the migration still goes to re-review, as before it.
    await call(env, 'PUT', { code: `${CODE}// edited\n`, baseRev: 7 });
    expect((await listRereviewQueue(env)).map((e) => e.workspaceId)).toEqual(['w5']);
  });
});
