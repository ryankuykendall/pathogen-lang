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
        code: 'circle(5, 5, 4);',
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
});
