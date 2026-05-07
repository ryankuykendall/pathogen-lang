// Regression tests for the X-User-Id impersonation guard.
//
// The vulnerability we're guarding against: with public profiles + the
// public:workspaces index, real user ids become enumerable. Without this
// guard, anyone could put a discovered user id in X-User-Id and mutate
// that user's workspaces.

import { describe, expect, it } from 'vitest';

import { getEffectiveUserId } from '../../website/auth/effective-id';
import { createSession, SESSION_COOKIE_NAME } from '../../website/auth/session';
import type { AuthEnv } from '../../website/auth/types';
import { MemoryD1, MemoryKV } from './helpers';

function makeEnv(): AuthEnv {
  return {
    WORKSPACES: new MemoryKV(),
    USERS_DB: new MemoryD1(),
  };
}

function withCookie(token: string): Request {
  return new Request('http://localhost/api/whatever', {
    headers: { Cookie: `${SESSION_COOKIE_NAME}=${token}` },
  });
}

function withHeaderId(id: string): Request {
  return new Request('http://localhost/api/whatever', {
    headers: { 'X-User-Id': id },
  });
}

function withCookieAndHeader(token: string, headerId: string): Request {
  return new Request('http://localhost/api/whatever', {
    headers: {
      Cookie: `${SESSION_COOKIE_NAME}=${token}`,
      'X-User-Id': headerId,
    },
  });
}

describe('getEffectiveUserId', () => {
  it('returns null when there is no session and no header', async () => {
    const env = makeEnv();
    const id = await getEffectiveUserId(new Request('http://localhost/'), env);
    expect(id).toBeNull();
  });

  it('returns the header id when no real user row matches', async () => {
    const env = makeEnv();
    const anonId = 'abc123def456ghijklmno';
    const id = await getEffectiveUserId(withHeaderId(anonId), env);
    expect(id).toBe(anonId);
  });

  it('REJECTS a header id that matches a real user row when there is no session', async () => {
    const env = makeEnv();
    (env.USERS_DB as MemoryD1).users.push({
      id: 'real-user-id',
      email: 'r@x.test',
      email_lower: 'r@x.test',
      handle: 'real',
      display_name: 'Real',
      created_at: 0,
      verified_at: 0,
    });
    const id = await getEffectiveUserId(withHeaderId('real-user-id'), env);
    expect(id).toBeNull();
  });

  it('returns the session user id when the cookie is valid (session wins over header)', async () => {
    const env = makeEnv();
    (env.USERS_DB as MemoryD1).users.push({
      id: 'real-user-id',
      email: 'r@x.test',
      email_lower: 'r@x.test',
      handle: 'real',
      display_name: 'Real',
      created_at: 0,
      verified_at: 0,
    });
    const token = await createSession(env.USERS_DB, 'real-user-id');

    // Even when the header claims a different id, the session is authoritative.
    const id = await getEffectiveUserId(withCookieAndHeader(token, 'spoofed-id'), env);
    expect(id).toBe('real-user-id');
  });

  it('falls back to the header when the session cookie is invalid', async () => {
    const env = makeEnv();
    const id = await getEffectiveUserId(
      withCookieAndHeader('not-a-real-token', 'anon-z'),
      env,
    );
    expect(id).toBe('anon-z');
  });

  it('returns null when an attacker pairs a stale token with a real user header', async () => {
    const env = makeEnv();
    (env.USERS_DB as MemoryD1).users.push({
      id: 'real-user-id',
      email: 'r@x.test',
      email_lower: 'r@x.test',
      handle: 'real',
      display_name: 'Real',
      created_at: 0,
      verified_at: 0,
    });
    const id = await getEffectiveUserId(
      withCookieAndHeader('not-a-real-token', 'real-user-id'),
      env,
    );
    expect(id).toBeNull();
  });
});
