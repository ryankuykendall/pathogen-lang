// Optimistic concurrency for workspace code writes.
//
// Closes the multi-tab code-vs-code clobber: two tabs load the same workspace,
// both edit, and the slower (stale) tab's autosave overwrites the faster tab's
// newer code. Each code write now carries `baseRev` (the revision the client
// edited from); the server rejects (409) when the doc has advanced, and bumps
// `rev` on every accepted code change. Clients that omit `baseRev` keep the
// old last-write-wins behavior (backward compatible).

import { describe, expect, it } from 'vitest';

import { handleApiRequest } from '../../website/api/router';
import type { Env, KVNamespace, R2Bucket } from '../../website/api/types';
import { MemoryKV } from '../auth/helpers';

function makeEnv(): { env: Env; kv: MemoryKV } {
  const kv = new MemoryKV();
  const env = {
    WORKSPACES: kv as unknown as KVNamespace,
    THUMBNAILS: undefined as unknown as R2Bucket,
    USERS_DB: undefined as unknown as Env['USERS_DB'],
  } as Env;
  return { env, kv };
}

async function createWorkspace(env: Env, userId: string, code: string): Promise<string> {
  const res = await handleApiRequest(
    new Request('https://api.pathogen.studio/workspace', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': userId },
      body: JSON.stringify({ name: 'tw', code }),
    }),
    env,
    '/workspace',
  );
  expect(res.status).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

async function update(env: Env, id: string, userId: string, body: Record<string, unknown>): Promise<Response> {
  return handleApiRequest(
    new Request(`https://api.pathogen.studio/workspace/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': userId },
      body: JSON.stringify(body),
    }),
    env,
    `/workspace/${id}`,
  );
}

describe('workspace optimistic concurrency', () => {
  it('a new workspace starts at rev 0 and an accepted code write bumps it to 1', async () => {
    const { env } = makeEnv();
    const id = await createWorkspace(env, 'u1', 'A');

    const res = await update(env, id, 'u1', { code: 'B', baseRev: 0 });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { rev: number; skipped?: boolean };
    expect(body.skipped).toBeUndefined();
    expect(body.rev).toBe(1);
  });

  it('rejects a stale baseRev with 409 and does not change the persisted code', async () => {
    const { env, kv } = makeEnv();
    const id = await createWorkspace(env, 'u1', 'reddish');

    // Tab A saves yellowish from rev 0 → rev 1.
    const a = await update(env, id, 'u1', { code: 'yellowish', baseRev: 0 });
    expect(a.status).toBe(200);
    expect(((await a.json()) as { rev: number }).rev).toBe(1);

    // Tab B (still at rev 0) autosaves its stale reddish edit.
    const b = await update(env, id, 'u1', { code: 'reddish-stale', baseRev: 0 });
    expect(b.status).toBe(409);
    const conflict = (await b.json()) as { conflict: boolean; currentRev: number };
    expect(conflict.conflict).toBe(true);
    expect(conflict.currentRev).toBe(1);

    // The newer code survives — the stale write did not clobber it.
    const doc = JSON.parse((await (kv as unknown as KVNamespace).get(`workspace:${id}`))!);
    expect(doc.code).toBe('yellowish');
    expect(doc.rev).toBe(1);
  });

  it('lets the same client save sequentially by advancing baseRev from each response', async () => {
    const { env } = makeEnv();
    const id = await createWorkspace(env, 'u1', 'v0');

    const r1 = (await (await update(env, id, 'u1', { code: 'v1', baseRev: 0 })).json()) as {
      rev: number;
    };
    expect(r1.rev).toBe(1);
    const r2 = (await (await update(env, id, 'u1', { code: 'v2', baseRev: r1.rev })).json()) as {
      rev: number;
    };
    expect(r2.rev).toBe(2);
  });

  it('treats a no-op save (same content) as success without bumping rev', async () => {
    const { env } = makeEnv();
    const id = await createWorkspace(env, 'u1', 'same');

    const res = await update(env, id, 'u1', { code: 'same', baseRev: 0 });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { skipped?: boolean; rev: number };
    expect(body.skipped).toBe(true);
    expect(body.rev).toBe(0);
  });

  it('falls back to last-write-wins when baseRev is omitted (backward compatible)', async () => {
    const { env, kv } = makeEnv();
    const id = await createWorkspace(env, 'u1', 'A');

    // Advance to rev 1 with a base-aware write...
    await update(env, id, 'u1', { code: 'B', baseRev: 0 });
    // ...then an old client (no baseRev) still saves, no conflict check.
    const res = await update(env, id, 'u1', { code: 'C' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { rev: number };
    expect(body.rev).toBe(2); // still increments

    const doc = JSON.parse((await (kv as unknown as KVNamespace).get(`workspace:${id}`))!);
    expect(doc.code).toBe('C');
  });

  it('does not require baseRev for non-code updates (name/preferences)', async () => {
    const { env } = makeEnv();
    const id = await createWorkspace(env, 'u1', 'A');

    const res = await update(env, id, 'u1', { name: 'Renamed' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { name: string; rev: number };
    expect(body.name).toBe('Renamed');
    expect(body.rev).toBe(0); // unchanged by a non-code update
  });

  it('a non-code update preserves the latest code and rev (no clobber)', async () => {
    const { env, kv } = makeEnv();
    const id = await createWorkspace(env, 'u1', 'A');

    // Code advances to rev 1.
    await update(env, id, 'u1', { code: 'B', baseRev: 0 });

    // A rename writes the whole doc back — it must NOT revert code/rev.
    const res = await update(env, id, 'u1', { name: 'Renamed', preferences: { gridSize: 5 } });
    expect(res.status).toBe(200);

    const doc = JSON.parse((await (kv as unknown as KVNamespace).get(`workspace:${id}`))!);
    expect(doc.code).toBe('B');
    expect(doc.rev).toBe(1);
    expect(doc.name).toBe('Renamed');
    expect(doc.preferences.gridSize).toBe(5);
  });
});
