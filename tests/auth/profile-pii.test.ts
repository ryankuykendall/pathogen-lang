// Regression test: the public profile endpoint must NEVER leak PII.
// Specifically: no email, no internal user id, no email_lower, no
// created_at/verified_at timestamps. Only handle, displayName, and
// the user's public workspaces (without the owner's user id).

import { describe, expect, it } from 'vitest';

import { handlePublicProfile } from '../../website/auth/handlers';
import type { AuthEnv } from '../../website/auth/types';
import { MemoryD1, MemoryKV } from './helpers';

function makeEnv(): AuthEnv & { WORKSPACES: MemoryKV; USERS_DB: MemoryD1 } {
  return {
    WORKSPACES: new MemoryKV(),
    USERS_DB: new MemoryD1(),
  };
}

describe('GET /api/u/:handle response shape', () => {
  it('returns only handle, displayName, and public workspaces (no PII)', async () => {
    const env = makeEnv();
    env.USERS_DB.users.push({
      id: 'user-secret-id',
      email: 'private@example.test',
      email_lower: 'private@example.test',
      handle: 'ryan',
      display_name: 'Ryan',
      created_at: 1700000000000,
      verified_at: 1700000050000,
    });
    await env.WORKSPACES.put(
      'public:workspaces',
      JSON.stringify([
        {
          id: 'ws-1',
          slug: 'demo',
          name: 'Demo',
          description: 'A public sketch',
          userId: 'user-secret-id',
          updatedAt: '2026-05-06T00:00:00Z',
          thumbnailAt: null,
        },
        {
          id: 'ws-2',
          slug: 'other',
          name: 'Other',
          description: '',
          userId: 'someone-else',
          updatedAt: '2026-05-05T00:00:00Z',
          thumbnailAt: null,
        },
      ]),
    );

    const req = new Request('http://localhost/pathogen/api/u/ryan');
    const res = await handlePublicProfile(req, env, 'ryan');
    expect(res.status).toBe(200);
    const json = (await res.json()) as Record<string, unknown>;

    // Allowed keys, exact shape:
    expect(Object.keys(json).sort()).toEqual(['displayName', 'handle', 'workspaces']);
    expect(json.handle).toBe('ryan');
    expect(json.displayName).toBe('Ryan');

    // PII must not appear anywhere in the response (deep check via JSON text):
    const text = JSON.stringify(json);
    expect(text).not.toContain('private@example.test');
    expect(text).not.toContain('user-secret-id');
    expect(text).not.toContain('1700000000000');
    expect(text).not.toContain('1700000050000');

    // Workspaces are filtered to this user's only, and don't carry userId
    const wss = json.workspaces as Array<Record<string, unknown>>;
    expect(wss).toHaveLength(1);
    expect(wss[0].id).toBe('ws-1');
    expect(wss[0]).not.toHaveProperty('userId');
  });

  it('returns 404 when the handle does not exist', async () => {
    const env = makeEnv();
    const req = new Request('http://localhost/pathogen/api/u/nobody');
    const res = await handlePublicProfile(req, env, 'nobody');
    expect(res.status).toBe(404);
  });
});
