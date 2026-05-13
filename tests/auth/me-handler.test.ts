// /me is the client's status-probe endpoint — every page load asks
// "am I signed in?". It is invoked unconditionally, including for anonymous
// visitors, so it MUST NOT 500 in any reasonable failure mode. These tests
// pin down the "no session", "no user", and "D1 throws" paths.

import { describe, expect, it } from 'vitest';

import { handleMe } from '../../website/auth/handlers';
import type { AuthEnv } from '../../website/auth/types';
import { MemoryD1, MemoryKV } from './helpers';

function makeEnv(overrides: Partial<AuthEnv> = {}): AuthEnv {
  return {
    WORKSPACES: new MemoryKV(),
    USERS_DB: new MemoryD1(),
    PRODUCTION: '',
    COOKIE_DOMAIN: '',
    ...overrides,
  } as AuthEnv;
}

function makeRequest(cookie?: string): Request {
  const headers: Record<string, string> = {};
  if (cookie) headers['Cookie'] = cookie;
  return new Request('https://api.pathogen.studio/me', { headers });
}

describe('handleMe', () => {
  it('returns 200 + currentUser:null when no cookie is sent', async () => {
    const env = makeEnv();
    const res = await handleMe(makeRequest(), env);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ currentUser: null });
  });

  it('returns 200 + currentUser:null when the cookie has no matching session', async () => {
    const env = makeEnv();
    const res = await handleMe(makeRequest('pathogen_session=stale-token'), env);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ currentUser: null });
    expect(res.headers.get('Set-Cookie')).toMatch(/Max-Age=0/);
  });

  it('returns 200 + currentUser:null when D1 throws on session lookup', async () => {
    // Simulate a broken D1 (e.g. local dev with no migrations applied).
    // The status-probe nature of /me means D1 failures must not bubble up
    // as 500s — they look identical to "no session" from the client.
    const throwingDb = {
      prepare() {
        return {
          bind() {
            return this;
          },
          async first() {
            throw new Error('no such table: sessions');
          },
          async all() {
            return { results: [] };
          },
          async run() {
            return { success: false, meta: { changes: 0 } };
          },
        };
      },
      async exec() {
        return null;
      },
    } as unknown as AuthEnv['USERS_DB'];
    const env = makeEnv({ USERS_DB: throwingDb });

    const res = await handleMe(makeRequest('pathogen_session=anything'), env);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ currentUser: null });
  });

  it('returns 200 + currentUser:null when the session resolves but the user row is missing', async () => {
    const db = new MemoryD1();
    db.sessions.push({
      token: 'tok-x',
      user_id: 'ghost-user',
      created_at: Date.now(),
      expires_at: Date.now() + 1000 * 60 * 60,
    });
    const env = makeEnv({ USERS_DB: db });

    const res = await handleMe(makeRequest('pathogen_session=tok-x'), env);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ currentUser: null });
    expect(res.headers.get('Set-Cookie')).toMatch(/Max-Age=0/);
  });

  it('returns the current user when session and row both resolve', async () => {
    const db = new MemoryD1();
    const userId = 'real-user-1';
    db.users.push({
      id: userId,
      email: 'a@b.com',
      email_lower: 'a@b.com',
      handle: 'a',
      display_name: 'A',
      created_at: Date.now(),
      verified_at: Date.now(),
    });
    db.sessions.push({
      token: 'tok-real',
      user_id: userId,
      created_at: Date.now(),
      expires_at: Date.now() + 1000 * 60 * 60,
    });
    const env = makeEnv({ USERS_DB: db });

    const res = await handleMe(makeRequest('pathogen_session=tok-real'), env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { currentUser: { id: string; handle: string } };
    expect(body.currentUser.id).toBe(userId);
    expect(body.currentUser.handle).toBe('a');
  });
});
