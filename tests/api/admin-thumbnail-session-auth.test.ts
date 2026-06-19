// Verifies uploadThumbnail grants a SESSION-authed admin the ownership bypass.
// This is what lets the /admin/moderation "Regenerate" action refresh the grid
// thumbnails for any workspace (it authenticates via the session cookie, not the
// legacy ?token= param). The token-admin and owner upload paths are covered in
// thumbnail-kind-split.test.ts / thumbnail-hero.test.ts.

import { describe, expect, it } from 'vitest';

import { handleApiRequest } from '../../website/api/router';
import type { Env, KVNamespace, R2Bucket, R2Object } from '../../website/api/types';
import { MemoryD1, MemoryKV } from '../auth/helpers';
import { SESSION_COOKIE_NAME } from '../../website/auth/session';

class MemoryR2 implements R2Bucket {
  private store = new Map<string, string>();
  async get(key: string): Promise<R2Object | null> {
    const value = this.store.get(key);
    if (value === undefined) return null;
    return { body: new Response(value).body! } as unknown as R2Object;
  }
  async put(key: string, value: ReadableStream | ArrayBuffer | string): Promise<void> {
    if (typeof value === 'string') this.store.set(key, value);
    else if (value instanceof ArrayBuffer) this.store.set(key, new TextDecoder().decode(value));
    else this.store.set(key, await new Response(value).text());
  }
  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }
  has(key: string): boolean {
    return this.store.has(key);
  }
}

const ADMIN_EMAIL = 'admin@example.com';

function makeEnv(): { env: Env; kv: MemoryKV; r2: MemoryR2; db: MemoryD1 } {
  const kv = new MemoryKV();
  const r2 = new MemoryR2();
  const db = new MemoryD1();
  const env = {
    WORKSPACES: kv as unknown as KVNamespace,
    THUMBNAILS: r2 as unknown as R2Bucket,
    USERS_DB: db as unknown as Env['USERS_DB'],
    ADMIN_EMAILS: ADMIN_EMAIL,
  } as Env;
  return { env, kv, r2, db };
}

// Seed an admin user + a live session, return the session token.
function seedAdminSession(db: MemoryD1): string {
  db.users.push({
    id: 'admin-1',
    email: ADMIN_EMAIL,
    email_lower: ADMIN_EMAIL,
    handle: 'admin',
    display_name: 'Admin',
    created_at: Date.now(),
    verified_at: Date.now(),
  } as (typeof db.users)[number]);
  const token = 'sess-admin-token';
  db.sessions.push({
    token,
    user_id: 'admin-1',
    created_at: Date.now(),
    expires_at: Date.now() + 1_000_000,
  } as (typeof db.sessions)[number]);
  return token;
}

function uploadRequest(id: string, opts: { cookie?: string; userId?: string }): Request {
  const fd = new FormData();
  fd.append('1024', new Blob(['png-1024'], { type: 'image/png' }), '1024.png');
  fd.append('512', new Blob(['png-512'], { type: 'image/png' }), '512.png');
  fd.append('256', new Blob(['png-256'], { type: 'image/png' }), '256.png');
  const headers: Record<string, string> = {};
  if (opts.cookie) headers['Cookie'] = `${SESSION_COOKIE_NAME}=${opts.cookie}`;
  if (opts.userId) headers['X-User-Id'] = opts.userId;
  return new Request(`https://api.pathogen.studio/workspace/${id}/thumbnail?kind=auto`, {
    method: 'PUT',
    headers,
    body: fd,
  });
}

describe('uploadThumbnail session-admin bypass', () => {
  it('lets a session-admin upload a thumbnail for a workspace they do not own', async () => {
    const { env, kv, r2, db } = makeEnv();
    await kv.put(
      'workspace:ws1',
      JSON.stringify({ id: 'ws1', userId: 'owner-2', code: '', isPublic: true }),
    );
    const token = seedAdminSession(db);

    const res = await handleApiRequest(
      uploadRequest('ws1', { cookie: token }),
      env,
      '/workspace/ws1/thumbnail',
    );

    expect(res.status).toBe(200);
    // kind=auto writes the unprefixed keys (manual would be manual-<size>.png).
    expect(r2.has('ws1/1024.png')).toBe(true);
    expect(r2.has('ws1/512.png')).toBe(true);
    expect(r2.has('ws1/256.png')).toBe(true);
  });

  it('still rejects a non-admin who is not the owner (403)', async () => {
    const { env, kv } = makeEnv();
    await kv.put(
      'workspace:ws1',
      JSON.stringify({ id: 'ws1', userId: 'owner-2', code: '', isPublic: true }),
    );

    const res = await handleApiRequest(
      uploadRequest('ws1', { userId: 'stranger-3' }),
      env,
      '/workspace/ws1/thumbnail',
    );

    expect(res.status).toBe(403);
  });
});
