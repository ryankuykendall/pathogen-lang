// Regression: a thumbnail upload must never revert a user's code.
//
// The original data-loss bug: the thumbnail upload/clear endpoints did a
// full-document read-modify-write of `workspace:${id}` just to stamp three
// timestamp fields, carrying `workspace.code` along. A code save that landed
// between the handler's read and write was silently clobbered — the thumbnail
// (rendered client-side, always fresh) looked updated while the persisted code
// reverted to an older version.
//
// The fix moves the timestamps to a sidecar key (`thumbmeta:${id}`) so the
// thumbnail endpoints write ONLY the sidecar and never touch `workspace:${id}`.
// These tests lock that in: the workspace doc is byte-for-byte unchanged across
// a thumbnail upload/clear, including under an interleaved code save.

import { describe, expect, it } from 'vitest';

import { handleApiRequest } from '../../website/api/router';
import type { Env, KVNamespace, R2Bucket, R2Object, Workspace } from '../../website/api/types';
import { MemoryKV } from '../auth/helpers';

class MemoryR2 implements R2Bucket {
  private store = new Map<string, string>();
  async get(key: string): Promise<R2Object | null> {
    const value = this.store.get(key);
    if (value === undefined) return null;
    return { body: new Response(value).body! };
  }
  async put(key: string, value: ReadableStream | ArrayBuffer | string): Promise<void> {
    if (typeof value === 'string') this.store.set(key, value);
    else if (value instanceof ArrayBuffer) this.store.set(key, new TextDecoder().decode(value));
    else this.store.set(key, await new Response(value).text());
  }
  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }
}

function makeEnv(): { env: Env; kv: MemoryKV } {
  const kv = new MemoryKV();
  const env = {
    WORKSPACES: kv as unknown as KVNamespace,
    THUMBNAILS: new MemoryR2() as unknown as R2Bucket,
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

async function updateCode(env: Env, id: string, userId: string, code: string): Promise<void> {
  const res = await handleApiRequest(
    new Request(`https://api.pathogen.studio/workspace/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': userId },
      body: JSON.stringify({ code }),
    }),
    env,
    `/workspace/${id}`,
  );
  expect(res.status).toBe(200);
}

function uploadThumbnail(env: Env, id: string, userId: string, kind: 'manual' | 'auto'): Promise<Response> {
  const fd = new FormData();
  for (const size of ['1024', '512', '256']) {
    fd.append(size, new Blob([`png-${size}`], { type: 'image/png' }), `${size}.png`);
  }
  return handleApiRequest(
    new Request(`https://api.pathogen.studio/workspace/${id}/thumbnail?kind=${kind}`, {
      method: 'PUT',
      headers: { 'X-User-Id': userId },
      body: fd,
    }),
    env,
    `/workspace/${id}/thumbnail`,
  );
}

function rawDoc(kv: MemoryKV, id: string): Promise<string | null> {
  return (kv as unknown as KVNamespace).get(`workspace:${id}`);
}

async function getWorkspace(env: Env, id: string, userId: string): Promise<Workspace> {
  const res = await handleApiRequest(
    new Request(`https://api.pathogen.studio/workspace/${id}`, {
      method: 'GET',
      headers: { 'X-User-Id': userId },
    }),
    env,
    `/workspace/${id}`,
  );
  expect(res.status).toBe(200);
  return (await res.json()) as Workspace;
}

describe('thumbnail upload cannot clobber code', () => {
  it('leaves the workspace doc byte-for-byte unchanged across an upload', async () => {
    const { env, kv } = makeEnv();
    const id = await createWorkspace(env, 'user-1', 'let c = oklch(0.62 0.25 27);');

    const before = await rawDoc(kv, id);
    const res = await uploadThumbnail(env, id, 'user-1', 'auto');
    expect(res.status).toBe(200);
    const after = await rawDoc(kv, id);

    // The thumbnail path must not write workspace:${id} at all.
    expect(after).toBe(before);
    // And the timestamps it reports come from the sidecar.
    const meta = JSON.parse((await (kv as unknown as KVNamespace).get(`thumbmeta:${id}`))!);
    expect(meta.autoThumbnailAt).toBeTruthy();
  });

  it('preserves the latest code when a save precedes the thumbnail upload', async () => {
    const { env, kv } = makeEnv();
    const id = await createWorkspace(env, 'user-1', 'reddish');

    // User edits reddish → yellowish (the real-world repro).
    await updateCode(env, id, 'user-1', 'yellowish');
    // Thumbnail upload captures the fresh render and stamps the sidecar.
    await uploadThumbnail(env, id, 'user-1', 'auto');

    const doc = JSON.parse((await rawDoc(kv, id))!) as Workspace;
    expect(doc.code).toBe('yellowish');
  });

  it('a thumbnail upload that interleaves with a code save keeps the newer code', async () => {
    const { env, kv } = makeEnv();
    const id = await createWorkspace(env, 'user-1', 'A');

    // Simulate the race: capture the doc as a stale thumbnail handler would
    // have, let a code save land, then run the thumbnail upload. Under the old
    // full-doc RMW this reverted code to 'A'; under the sidecar design 'B'
    // survives because the upload never writes workspace:${id}.
    await rawDoc(kv, id); // stale read (discarded — the handler no longer RMWs the doc)
    await updateCode(env, id, 'user-1', 'B');
    await uploadThumbnail(env, id, 'user-1', 'manual');

    const doc = JSON.parse((await rawDoc(kv, id))!) as Workspace;
    expect(doc.code).toBe('B');
  });

  it('getWorkspace returns sidecar timestamps, overriding stale inline fields (lazy migration)', async () => {
    const { env, kv } = makeEnv();
    const id = await createWorkspace(env, 'user-1', 'x');

    // Simulate a pre-migration doc: legacy inline thumbnail fields present,
    // no sidecar yet.
    const doc = JSON.parse((await rawDoc(kv, id))!) as Workspace;
    doc.thumbnailAt = '2020-01-01T00:00:00.000Z';
    doc.autoThumbnailAt = '2020-01-01T00:00:00.000Z';
    await (kv as unknown as KVNamespace).put(`workspace:${id}`, JSON.stringify(doc));

    // No sidecar → getWorkspace falls back to the legacy inline value.
    const legacy = await getWorkspace(env, id, 'user-1');
    expect(legacy.autoThumbnailAt).toBe('2020-01-01T00:00:00.000Z');

    // First real upload creates the sidecar; reads now come from it.
    await uploadThumbnail(env, id, 'user-1', 'auto');
    const migrated = await getWorkspace(env, id, 'user-1');
    expect(migrated.autoThumbnailAt).not.toBe('2020-01-01T00:00:00.000Z');
    expect(migrated.autoThumbnailAt).toBeTruthy();
    // The inline legacy field on the doc is now stale but ignored.
    const rawAfter = JSON.parse((await rawDoc(kv, id))!) as Workspace;
    expect(rawAfter.autoThumbnailAt).toBe('2020-01-01T00:00:00.000Z');
  });
});
