// Anonymous-user workspace contract.
//
// pathogen.studio's public promise is that signing in is *not* required —
// an unauthenticated visitor can still create and list workspaces, keyed by
// the anon nano-ID in the `X-User-Id` header. This test drives the router
// dispatcher (handleApiRequest) end-to-end against an in-memory KV so the
// contract is locked in:
//
//   - POST /workspace with only X-User-Id succeeds
//   - GET /workspaces with only X-User-Id returns what was created
//   - GET /workspaces with no X-User-Id is the only 401 path
//   - GET /workspaces for a userId with zero workspaces returns 200 + []
//     (not an error — this nails down the "empty account = Failed to fetch"
//     hypothesis raised in the workspaces-page bug report)
//   - DELETE down to zero workspaces leaves a clean empty-list response
//
// We do not exercise R2 / D1 here — those bindings stay as `undefined`/empty
// because the listing + create + delete paths never touch them.

import { describe, expect, it } from 'vitest';

import { handleApiRequest } from '../../website/api/router';
import type { Env } from '../../website/api/types';
import { MemoryKV } from '../auth/helpers';

function makeEnv(): Env {
  const kv = new MemoryKV();
  // D1 is unused for the anon workspace paths. THUMBNAILS only needs a
  // no-op `delete`: deleteWorkspace cascades a `THUMBNAILS.delete` for the
  // approval.svg blob, which always exists as a binding in production.
  return {
    WORKSPACES: kv as unknown as Env['WORKSPACES'],
    THUMBNAILS: { delete: async () => {} } as unknown as Env['THUMBNAILS'],
    USERS_DB: undefined as unknown as Env['USERS_DB'],
  } as Env;
}

function makeRequest(
  path: string,
  init: { method?: string; userId?: string | null; body?: unknown } = {},
): Request {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (init.userId) headers['X-User-Id'] = init.userId;
  return new Request(`https://api.pathogen.studio${path}`, {
    method: init.method ?? 'GET',
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
}

async function call(
  env: Env,
  path: string,
  init: { method?: string; userId?: string | null; body?: unknown } = {},
): Promise<{ status: number; data: unknown }> {
  const res = await handleApiRequest(makeRequest(path, init), env, path);
  return { status: res.status, data: await res.json() };
}

describe('anonymous workspace flow', () => {
  it('lets an anon user create a workspace with just X-User-Id', async () => {
    const env = makeEnv();
    const { status, data } = await call(env, '/workspace', {
      method: 'POST',
      userId: 'anon-x',
      body: { name: 'My first sketch', code: 'circle(50 50 25)' },
    });

    expect(status).toBe(201);
    const ws = data as { id: string; userId: string; name: string };
    expect(ws.userId).toBe('anon-x');
    expect(ws.name).toBe('My first sketch');
    expect(typeof ws.id).toBe('string');
    expect(ws.id.length).toBeGreaterThan(0);
  });

  it('lists exactly the workspaces an anon user created', async () => {
    const env = makeEnv();
    const created = await call(env, '/workspace', {
      method: 'POST',
      userId: 'anon-x',
      body: { name: 'A', code: '' },
    });
    const a = (created.data as { id: string }).id;

    const list = await call(env, '/workspaces', { userId: 'anon-x' });
    expect(list.status).toBe(200);
    const ids = (list.data as { id: string }[]).map((w) => w.id);
    expect(ids).toEqual([a]);
  });

  it('returns 401 only when X-User-Id is absent', async () => {
    const env = makeEnv();
    const res = await call(env, '/workspaces', { userId: null });
    expect(res.status).toBe(401);
    expect((res.data as { error: string }).error).toMatch(/User ID required/i);
  });

  it('returns 200 + [] for a user with no workspaces (no failure for "empty" accounts)', async () => {
    // This is the regression assertion that pins down the empty-account
    // hypothesis from the workspaces-page bug report: an account with zero
    // workspaces must list cleanly, not produce an error response.
    const env = makeEnv();
    const res = await call(env, '/workspaces', { userId: 'anon-empty' });
    expect(res.status).toBe(200);
    expect(res.data).toEqual([]);
  });

  it('returns 200 + [] after deleting the only workspace', async () => {
    const env = makeEnv();
    const created = await call(env, '/workspace', {
      method: 'POST',
      userId: 'anon-x',
      body: { name: 'transient', code: '' },
    });
    const id = (created.data as { id: string }).id;

    const del = await call(env, `/workspace/${id}`, { method: 'DELETE', userId: 'anon-x' });
    expect(del.status).toBe(200);

    const list = await call(env, '/workspaces', { userId: 'anon-x' });
    expect(list.status).toBe(200);
    expect(list.data).toEqual([]);
  });

  it('isolates workspaces between different anon users', async () => {
    const env = makeEnv();
    await call(env, '/workspace', {
      method: 'POST',
      userId: 'anon-a',
      body: { name: "A's sketch", code: '' },
    });

    const listA = await call(env, '/workspaces', { userId: 'anon-a' });
    const listB = await call(env, '/workspaces', { userId: 'anon-b' });

    expect((listA.data as unknown[]).length).toBe(1);
    expect(listB.data).toEqual([]);
  });
});
