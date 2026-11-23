// Regression: the featured moderation listing must carry approvedAt.
// FeaturedEntry extends ApprovedEntry on the client and renders an
// "approved <date>" meta line; adminListFeatured previously omitted
// approvedAt, so every featured card showed "approved Invalid Date".

import { describe, expect, it } from 'vitest';

import { handleApiRequest } from '../../website/api/router';
import type { Env, KVNamespace, R2Bucket } from '../../website/api/types';
import { MemoryD1, MemoryKV } from '../auth/helpers';

const ADMIN_TOKEN = 'test-admin-token';

function makeEnv(): { env: Env; kv: MemoryKV } {
  const kv = new MemoryKV();
  const env = {
    WORKSPACES: kv as unknown as KVNamespace,
    // readThumbMeta reads the thumbmeta: KV key; R2 is not exercised here.
    THUMBNAILS: {} as unknown as R2Bucket,
    USERS_DB: new MemoryD1() as unknown as Env['USERS_DB'],
    ADMIN_TOKEN,
  } as Env;
  return { env, kv };
}

describe('adminListFeatured carries approvedAt', () => {
  it('returns approvedAt (and featuredAt) for each featured entry', async () => {
    const { env, kv } = makeEnv();
    const id = 'ws-feat-1';
    const approvedAt = '2026-06-10T12:00:00.000Z';
    const featuredAt = '2026-06-12T09:30:00.000Z';

    await (kv as unknown as KVNamespace).put(
      `approval:${id}`,
      JSON.stringify({
        workspaceId: id,
        userId: 'user-1',
        files: { 'main.pathogen': { sha256: 'a'.repeat(64), size: 16 } },
        folders: [],
        entryPoints: ['main.pathogen'],
        codeHash: 'h1',
        slug: 'flow-field',
        name: 'Flow Field',
        description: '',
        ownerHandle: 'ryan',
        approvedAt,
        featuredAt,
      }),
    );
    await (kv as unknown as KVNamespace).put('featured:workspaces', JSON.stringify([id]));
    await (kv as unknown as KVNamespace).put(
      `workspace:${id}`,
      JSON.stringify({ id, userId: 'user-1', isPublic: true }),
    );

    const res = await handleApiRequest(
      new Request(`https://api.pathogen.studio/admin/queue/featured?token=${ADMIN_TOKEN}`, {
        method: 'GET',
      }),
      env,
      '/admin/queue/featured',
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { entries: Array<{ approvedAt?: string; featuredAt?: string }> };
    expect(body.entries).toHaveLength(1);
    expect(body.entries[0].approvedAt).toBe(approvedAt);
    expect(body.entries[0].featuredAt).toBe(featuredAt);
  });

  it('a stray approval from before phase 2 is still listed, with no hash, rather than fail the list (note 71)', async () => {
    const { env, kv } = makeEnv();
    const store = kv as unknown as KVNamespace;
    for (const [id, shape] of [
      ['ws-old', { code: 'circle(5, 5, 4);' }],
      ['ws-new', { files: { 'main.pathogen': { sha256: 'b'.repeat(64), size: 16 } }, folders: [], entryPoints: ['main.pathogen'] }],
    ] as const) {
      await store.put(
        `approval:${id}`,
        JSON.stringify({ workspaceId: id, userId: 'user-1', ...shape, codeHash: `h-${id}`, slug: id, name: id, description: '', approvedAt: '2026-06-10T12:00:00.000Z', featuredAt: '2026-06-12T09:30:00.000Z' }),
      );
      await store.put(`workspace:${id}`, JSON.stringify({ id, userId: 'user-1', isPublic: true }));
    }
    await store.put('featured:workspaces', JSON.stringify(['ws-old', 'ws-new']));
    const res = await handleApiRequest(
      new Request(`https://api.pathogen.studio/admin/queue/featured?token=${ADMIN_TOKEN}`, { method: 'GET' }),
      env,
      '/admin/queue/featured',
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { entries: Array<{ workspaceId: string; codeHash: string | null }> };
    expect(body.entries.map((e) => [e.workspaceId, e.codeHash])).toEqual([
      ['ws-old', null],
      ['ws-new', 'h-ws-new'],
    ]);
  });
});
