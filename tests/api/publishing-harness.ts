// A harness for publishing's server tests (2e step 5): the real router over
// in-memory KV, R2 and D1, with an owner, a second user and an admin signed in,
// and the admin token.

import { expect } from 'vitest';

import { MemoryR2 } from './memory-r2';
import { handleApiRequest } from '../../website/api/router';
import { createSession, SESSION_COOKIE_NAME } from '../../website/auth/session';
import { createUserWithDerivedHandle } from '../../website/auth/users';
import { MemoryD1, MemoryKV } from '../auth/helpers';

import type { Env, KVNamespace } from '../../website/api/types';

export const ADMIN_TOKEN = 'admin-secret';
export const SPIRAL = 'define ViewBox(0, 0, 100, 100);\ncircle(50, 50, 40);\n';
export const EDITED = `${SPIRAL}circle(50, 50, 10);\n`;

export type Who = 'owner' | 'visitor' | 'admin-session' | 'admin-token' | 'signed-out';

export interface Harness {
  env: Env;
  kv: KVNamespace;
  r2: MemoryR2;
  cookies: Record<'owner' | 'visitor' | 'admin-session', string>;
}

export async function makeHarness(): Promise<Harness> {
  const kv = new MemoryKV() as unknown as KVNamespace;
  const r2 = new MemoryR2();
  const env = {
    WORKSPACES: kv,
    THUMBNAILS: r2,
    USERS_DB: new MemoryD1(),
    ADMIN_TOKEN,
    ADMIN_EMAILS: 'grace@example.com',
  } as Env;
  const cookie = async (id: string, email: string, name: string): Promise<string> => {
    await createUserWithDerivedHandle(env.USERS_DB, { id, email, displayName: name });
    return `${SESSION_COOKIE_NAME}=${await createSession(env.USERS_DB, id)}`;
  };
  return {
    env,
    kv,
    r2,
    cookies: {
      owner: await cookie('user-a', 'ada@example.com', 'Ada'),
      visitor: await cookie('user-b', 'bo@example.com', 'Bo'),
      'admin-session': await cookie('user-g', 'grace@example.com', 'Grace'),
    },
  };
}

/** A request as `who` sends it: the session cookie, or the admin token in the query. */
export async function send(
  h: Harness,
  method: string,
  path: string,
  who: Who,
  body?: BodyInit,
  contentType?: string,
): Promise<Response> {
  const url = who === 'admin-token' ? `${path}${path.includes('?') ? '&' : '?'}token=${ADMIN_TOKEN}` : path;
  const cookie = who === 'owner' || who === 'visitor' || who === 'admin-session' ? h.cookies[who] : null;
  return handleApiRequest(
    new Request(`https://api.pathogen.studio${url}`, {
      method,
      headers: { ...(contentType ? { 'Content-Type': contentType } : {}), ...(cookie ? { Cookie: cookie } : {}) },
      ...(body !== undefined ? { body } : {}),
    }),
    h.env,
    path.split('?')[0],
  );
}

/** A JSON request; the file route's text answer comes back as `data.text`. */
export async function call(
  h: Harness,
  method: string,
  path: string,
  body?: unknown,
  who: Who = 'owner',
): Promise<{ status: number; data: Record<string, unknown> }> {
  const res = await send(
    h,
    method,
    path,
    who,
    body !== undefined ? JSON.stringify(body) : undefined,
    'application/json',
  );
  const text = await res.text();
  if ((res.headers.get('Content-Type') ?? '').startsWith('text/plain')) return { status: res.status, data: { text } };
  return { status: res.status, data: text ? (JSON.parse(text) as Record<string, unknown>) : {} };
}

/** A workspace of the owner's, submitted for review. */
export async function submitted(h: Harness, name = 'Spiral', code = SPIRAL): Promise<string> {
  const created = await call(h, 'POST', '/workspace', { name, code });
  const id = created.data.id as string;
  expect((await call(h, 'POST', `/workspace/${id}/submit-for-review`)).status).toBe(200);
  return id;
}

export async function approve(h: Harness, id: string, extra: Record<string, unknown> = {}): Promise<void> {
  const res = await call(
    h,
    'POST',
    `/admin/review/${id}`,
    { decision: 'approve', svg: '<svg/>', ...extra },
    'admin-token',
  );
  expect(res.status).toBe(200);
}

/** A workspace of the owner's, submitted and approved: public, with an approval. */
export async function approved(h: Harness): Promise<string> {
  const id = await submitted(h);
  await approve(h, id);
  return id;
}

const queueIds = async (h: Harness, queue: string): Promise<string[]> =>
  (
    (await call(h, 'GET', `/admin/queue/${queue}`, undefined, 'admin-token')).data.entries as { workspaceId: string }[]
  ).map((e) => e.workspaceId);
export const rereviewIds = async (h: Harness): Promise<string[]> => queueIds(h, 'rereview');
export const reviewIds = async (h: Harness): Promise<string[]> => queueIds(h, 'review');
export const publicIds = async (h: Harness): Promise<string[]> =>
  (JSON.parse((await h.kv.get('public:workspaces')) ?? '[]') as { id: string }[]).map((e) => e.id);
