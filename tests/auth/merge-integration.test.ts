// End-to-end integration test for the anonymous → signed-in workspace
// merge.
//
// The unit tests in claim.test.ts exercise claimAnonymousWorkspaces in
// isolation. This test instead drives the entire user-visible workflow
// through the same dispatch surface the deployed API uses
// (handleApiRequest), so a regression anywhere in the chain —
// /workspace create, /auth/verify returning claimableWorkspaceCount,
// /auth/claim session check, /workspaces re-listing under the authed
// userId — is caught by `npm test`.
//
// We deliberately skip handleAuthStart so the test doesn't depend on the
// email-transport path. Instead we seed an OTP directly via the same KV
// keys storeCode() writes, then call /auth/verify with that code.

import { describe, expect, it } from 'vitest';

import { handleApiRequest } from '../../website/api/router';
import type { Env } from '../../website/api/types';
import { storeCode } from '../../website/auth/otp';
import type { AuthEnv } from '../../website/auth/types';
import { MemoryD1, MemoryKV } from './helpers';

interface TestEnv extends Env {
  // Mirror the AuthEnv shape so the auth handlers (called via
  // handleApiRequest) see the bindings they expect.
  EMAIL?: AuthEnv['EMAIL'];
  AUTH_FROM_EMAIL?: string;
  AUTH_PRODUCT_NAME?: string;
  AUTH_DEV_LOG_OTP?: string;
}

function makeEnv(): { env: TestEnv; kv: MemoryKV; db: MemoryD1 } {
  const kv = new MemoryKV();
  const db = new MemoryD1();
  const env = {
    WORKSPACES: kv as unknown as Env['WORKSPACES'],
    THUMBNAILS: {} as unknown as Env['THUMBNAILS'],
    USERS_DB: db as unknown as Env['USERS_DB'],
    AUTH_DEV_LOG_OTP: '1',
    PRODUCTION: '',
    COOKIE_DOMAIN: '',
  } as TestEnv;
  return { env, kv, db };
}

function makeRequest(
  path: string,
  init: {
    method?: string;
    userId?: string | null;
    cookie?: string | null;
    body?: unknown;
  } = {},
): Request {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (init.userId) headers['X-User-Id'] = init.userId;
  if (init.cookie) headers['Cookie'] = init.cookie;
  return new Request(`https://api.pathogen.studio${path}`, {
    method: init.method ?? 'GET',
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
}

async function call(
  env: Env,
  path: string,
  init: {
    method?: string;
    userId?: string | null;
    cookie?: string | null;
    body?: unknown;
  } = {},
): Promise<{ status: number; data: unknown; setCookie: string | null }> {
  const res = await handleApiRequest(makeRequest(path, init), env, path);
  return {
    status: res.status,
    data: await res.json(),
    setCookie: res.headers.get('Set-Cookie'),
  };
}

function extractSessionCookie(setCookieHeader: string | null): string {
  if (!setCookieHeader) throw new Error('No Set-Cookie header on response');
  // "pathogen_session=<token>; HttpOnly; SameSite=Lax; Path=/; Max-Age=..."
  const first = setCookieHeader.split(';')[0];
  if (!first.startsWith('pathogen_session=')) {
    throw new Error(`Unexpected Set-Cookie shape: ${setCookieHeader}`);
  }
  return first; // ready to use as a Cookie request header
}

describe('anon → signed-in workspace merge (end-to-end via handleApiRequest)', () => {
  it('creates anon workspaces, signs in, claims, lists under the authed user, and is idempotent', async () => {
    const { env, kv } = makeEnv();
    const anonId = 'anon-merge-1';
    const email = 'pathogen-merge-test@example.com';

    // 1. As anon, create two workspaces.
    const ws1 = await call(env, '/workspace', {
      method: 'POST',
      userId: anonId,
      body: { name: 'First', code: 'circle(50 50 25)' },
    });
    const ws2 = await call(env, '/workspace', {
      method: 'POST',
      userId: anonId,
      body: { name: 'Second', code: 'rect(0 0 100 50)' },
    });
    expect(ws1.status).toBe(201);
    expect(ws2.status).toBe(201);
    const id1 = (ws1.data as { id: string }).id;
    const id2 = (ws2.data as { id: string }).id;

    // 2. As anon, list — both visible.
    const anonList = await call(env, '/workspaces', { userId: anonId });
    expect(anonList.status).toBe(200);
    expect((anonList.data as { id: string }[]).map((w) => w.id).sort()).toEqual(
      [id1, id2].sort(),
    );

    // 3. Seed an OTP directly (skip handleAuthStart so the test doesn't
    // depend on the email transport). storeCode() is the same KV writer
    // that handleAuthStart calls, so /auth/verify sees a real code.
    const code = '123456';
    await storeCode(kv as unknown as AuthEnv['WORKSPACES'], email, code);

    // 4. Verify the OTP, passing the anon id so the response can report
    // claimableWorkspaceCount.
    const verify = await call(env, '/auth/verify', {
      method: 'POST',
      body: { email, code, anonymousUserId: anonId },
    });
    expect(verify.status).toBe(200);
    const verifyBody = verify.data as {
      ok: boolean;
      firstTime: boolean;
      currentUser: { id: string };
      claimableWorkspaceCount: number;
    };
    expect(verifyBody.ok).toBe(true);
    expect(verifyBody.firstTime).toBe(true);
    expect(verifyBody.claimableWorkspaceCount).toBe(2);

    const authedUserId = verifyBody.currentUser.id;
    const sessionCookie = extractSessionCookie(verify.setCookie);

    // 5. Claim the anon workspaces using the session cookie.
    const claim = await call(env, '/auth/claim', {
      method: 'POST',
      cookie: sessionCookie,
      body: { anonymousUserId: anonId },
    });
    expect(claim.status).toBe(200);
    expect(claim.data).toMatchObject({ ok: true, claimed: 2, skipped: 0 });

    // 6. With the session cookie (no X-User-Id needed; session resolves
    // server-side), the authed user sees both workspaces.
    const authedList = await call(env, '/workspaces', { cookie: sessionCookie });
    expect(authedList.status).toBe(200);
    expect((authedList.data as { id: string }[]).map((w) => w.id).sort()).toEqual(
      [id1, id2].sort(),
    );

    // 7. The workspace records themselves now have the authed userId.
    const stored1 = JSON.parse((await kv.get(`workspace:${id1}`))!);
    const stored2 = JSON.parse((await kv.get(`workspace:${id2}`))!);
    expect(stored1.userId).toBe(authedUserId);
    expect(stored2.userId).toBe(authedUserId);

    // 8. The anon index is gone — listing as the anon id returns [].
    const drainedAnonList = await call(env, '/workspaces', { userId: anonId });
    expect(drainedAnonList.status).toBe(200);
    expect(drainedAnonList.data).toEqual([]);

    // 9. Calling /auth/claim a second time is a no-op (idempotency).
    const claimAgain = await call(env, '/auth/claim', {
      method: 'POST',
      cookie: sessionCookie,
      body: { anonymousUserId: anonId },
    });
    expect(claimAgain.status).toBe(200);
    expect(claimAgain.data).toMatchObject({ ok: true, claimed: 0, skipped: 0 });
  });

  it('rejects /auth/claim without a session', async () => {
    const { env } = makeEnv();
    const res = await call(env, '/auth/claim', {
      method: 'POST',
      body: { anonymousUserId: 'anon-z' },
    });
    expect(res.status).toBe(401);
    expect((res.data as { error: string }).error).toMatch(/not signed in/i);
  });

  it('returns claimableWorkspaceCount=0 when the verifying user has no anon workspaces to claim', async () => {
    const { env, kv } = makeEnv();
    const email = 'no-anon-workspaces@example.com';
    const code = '654321';
    await storeCode(kv as unknown as AuthEnv['WORKSPACES'], email, code);

    const verify = await call(env, '/auth/verify', {
      method: 'POST',
      body: { email, code, anonymousUserId: 'anon-empty' },
    });
    expect(verify.status).toBe(200);
    expect((verify.data as { claimableWorkspaceCount: number }).claimableWorkspaceCount).toBe(0);
  });
});
