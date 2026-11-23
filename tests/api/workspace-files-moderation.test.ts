// Review, approval and the public source read for workspaces that hold files
// (storage step 4; project-docs/modules/48-storage-design-v2.md §4,
// 50-storage-decisions-and-plan.md). Submits through the real route with a
// signed-in session; records from before phase 2 are seeded straight into KV.

import { describe, expect, it } from 'vitest';

import { MemoryR2 } from './memory-r2';
import { storedRecord } from './workspace-helpers';
import { handleApiRequest } from '../../website/api/router';
import { hashContent } from '../../website/api/utils';
import { entryForText, OLD_SHAPE_MESSAGE } from '../../website/api/workspace-files';
import { createSession, SESSION_COOKIE_NAME } from '../../website/auth/session';
import { createUserWithDerivedHandle } from '../../website/auth/users';
import { MemoryD1, MemoryKV } from '../auth/helpers';

import type { Env, KVNamespace } from '../../website/api/types';

const ADMIN_TOKEN = 'admin-secret';
const SPIRAL = 'define ViewBox(0, 0, 100, 100);\ncircle(50, 50, 40);\n';
const GEARS = 'module;\nexport fn gear(r) {\n  circle(0, 0, r);\n}\n';
const MAIN = 'import { gear } from "./parts/gears.pathogen";\ngear(4);\n';

interface Harness {
  env: Env;
  kv: KVNamespace;
  r2: MemoryR2;
  cookie: string;
}

async function makeHarness(): Promise<Harness> {
  const kv = new MemoryKV() as unknown as KVNamespace;
  const r2 = new MemoryR2();
  const db = new MemoryD1();
  const env = { WORKSPACES: kv, THUMBNAILS: r2, USERS_DB: db, ADMIN_TOKEN } as Env;
  await createUserWithDerivedHandle(env.USERS_DB, { id: 'user-a', email: 'ada@example.com', displayName: 'Ada' });
  const token = await createSession(env.USERS_DB, 'user-a');
  return { env, kv, r2, cookie: `${SESSION_COOKIE_NAME}=${token}` };
}

async function call(
  h: Harness,
  method: string,
  path: string,
  body?: unknown,
  as: 'owner' | 'admin' | 'visitor' = 'owner',
): Promise<{ status: number; data: Record<string, unknown>; headers: Headers }> {
  const url = as === 'admin' ? `${path}${path.includes('?') ? '&' : '?'}token=${ADMIN_TOKEN}` : path;
  const res = await handleApiRequest(
    new Request(`https://api.pathogen.studio${url}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(as === 'owner' ? { Cookie: h.cookie } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }),
    h.env,
    path.split('?')[0],
  );
  const text = await res.text();
  return { status: res.status, data: text ? (JSON.parse(text) as Record<string, unknown>) : {}, headers: res.headers };
}

async function createAndSubmit(h: Harness, body: Record<string, unknown>): Promise<string> {
  const created = await call(h, 'POST', '/workspace', { name: 'Spiral', ...body });
  expect(created.status).toBe(201);
  const id = created.data.id as string;
  expect((await call(h, 'POST', `/workspace/${id}/submit-for-review`)).status).toBe(200);
  return id;
}

async function approve(h: Harness, id: string): Promise<void> {
  const res = await call(h, 'POST', `/admin/review/${id}`, { decision: 'approve', svg: '<svg/>' }, 'admin');
  expect(res.status).toBe(200);
}

type Entry = Record<string, unknown> & { workspaceId: string };
const entries = (data: Record<string, unknown>): Entry[] => data.entries as Entry[];

describe("a workspace that is just main.pathogen (today's playground)", () => {
  it('the review queue lists its text as `code`, for one R2 read, with the hash in today’s rule', async () => {
    const h = await makeHarness();
    const id = await createAndSubmit(h, { code: SPIRAL });
    h.r2.resetCalls();
    const { data } = await call(h, 'GET', '/admin/queue/review', undefined, 'admin');
    const [entry] = entries(data);
    expect([entry.workspaceId, entry.code, entry.codeHash]).toEqual([
      id,
      SPIRAL,
      (await storedRecord(h.kv, id)).contentHash,
    ]);
    expect(entry.files).toEqual({ 'main.pathogen': { ...(await entryForText(SPIRAL)), text: SPIRAL } });
    expect(entry.entryPoints).toEqual(['main.pathogen']);
    expect(h.r2.calls.get).toBe(1);
  });

  it('after approval, the admin read and the public source read serve the approved text, not later edits', async () => {
    const h = await makeHarness();
    const id = await createAndSubmit(h, { code: SPIRAL });
    await approve(h, id);
    const hash = (await storedRecord(h.kv, id)).contentHash;
    // An edit after approval goes to re-review; the public reads keep the approved text.
    await call(h, 'PUT', `/workspace/${id}`, { code: `${SPIRAL}circle(50, 50, 10);\n` });

    const admin = await call(h, 'GET', `/admin/approval/${id}`, undefined, 'admin');
    expect([admin.data.code, admin.data.codeHash, admin.data.slug]).toEqual([SPIRAL, hash, 'spiral']);
    expect(admin.data.files).toEqual({ 'main.pathogen': { ...(await entryForText(SPIRAL)), text: SPIRAL } });

    const source = await call(h, 'GET', `/approval-source/${id}`, undefined, 'visitor');
    expect(source.status).toBe(200);
    expect(source.data).toEqual({
      workspaceId: id,
      name: 'Spiral',
      description: '',
      files: { 'main.pathogen': { ...(await entryForText(SPIRAL)), text: SPIRAL } },
      folders: [],
      entryPoints: ['main.pathogen'],
      codeHash: hash,
      code: SPIRAL,
    });
    expect(source.headers.get('Cache-Control')).toBe('public, s-maxage=60, max-age=30');

    const [rereview] = entries((await call(h, 'GET', '/admin/queue/rereview', undefined, 'admin')).data);
    expect(rereview.code).toBe(`${SPIRAL}circle(50, 50, 10);\n`);
  });

  it('the approved listing shows the approval’s hash in today’s rule', async () => {
    const h = await makeHarness();
    const id = await createAndSubmit(h, { code: SPIRAL });
    await approve(h, id);
    const [listed] = entries((await call(h, 'GET', '/admin/queue/approved', undefined, 'admin')).data);
    expect([listed.workspaceId, listed.codeHash]).toEqual([id, (await storedRecord(h.kv, id)).contentHash]);
  });
});

describe('a workspace with several files', () => {
  const files = { 'main.pathogen': { text: MAIN }, 'parts/gears.pathogen': { text: GEARS } };

  it('the review queue lists its manifest, without texts or `code`, and reads nothing from R2 for it', async () => {
    const h = await makeHarness();
    await createAndSubmit(h, { files });
    h.r2.resetCalls();
    const [entry] = entries((await call(h, 'GET', '/admin/queue/review', undefined, 'admin')).data);
    expect(entry.files).toEqual({
      'main.pathogen': await entryForText(MAIN),
      'parts/gears.pathogen': await entryForText(GEARS),
    });
    expect(entry).not.toHaveProperty('code');
    expect(h.r2.totalCalls()).toBe(0);
  });

  it("an entry carrying a stale `code` beside its files lists the files' source, never that text", async () => {
    const h = await makeHarness();
    await createAndSubmit(h, { files });
    const queue = JSON.parse((await h.kv.get('queue:review'))!) as Entry[];
    await h.kv.put('queue:review', JSON.stringify(queue.map((e) => ({ ...e, code: 'stale' }))));
    const [entry] = entries((await call(h, 'GET', '/admin/queue/review', undefined, 'admin')).data);
    expect(entry).not.toHaveProperty('code');
    expect(Object.keys(entry.files as object)).toEqual(['main.pathogen', 'parts/gears.pathogen']);
  });

  it('the admin read and the public source read return every file with its text', async () => {
    const h = await makeHarness();
    const id = await createAndSubmit(h, { files });
    await approve(h, id);
    const withText = {
      'main.pathogen': { ...(await entryForText(MAIN)), text: MAIN },
      'parts/gears.pathogen': { ...(await entryForText(GEARS)), text: GEARS },
    };
    const admin = await call(h, 'GET', `/admin/approval/${id}`, undefined, 'admin');
    expect(admin.data.files).toEqual(withText);
    expect(admin.data).not.toHaveProperty('code');
    const source = await call(h, 'GET', `/approval-source/${id}`, undefined, 'visitor');
    expect([source.data.files, source.data.entryPoints]).toEqual([withText, ['main.pathogen']]);
  });
});

describe('records from before phase 2', () => {
  async function seedLegacyApproved(h: Harness, id: string, code: string): Promise<void> {
    const oldHash = await hashContent(code);
    const base = {
      workspaceId: id,
      userId: 'user-a',
      code,
      codeHash: oldHash,
      slug: 'old',
      name: 'Old',
      description: '',
    };
    await h.kv.put(
      `workspace:${id}`,
      JSON.stringify({ id, userId: 'user-a', name: 'Old', slug: 'old', code, contentHash: oldHash, isPublic: true }),
    );
    await h.kv.put(
      `approval:${id}`,
      JSON.stringify({ ...base, approvedAt: '2026-10-01T00:00:00.000Z', approvedByUserId: 'admin', featuredAt: null }),
    );
    await h.kv.put('queue:rereview', JSON.stringify([{ ...base, submittedAt: '2026-10-02T00:00:00.000Z' }]));
  }

  // None is left since the migration, and the reader for them is gone (note
  // 71). A stray one is listed with its error in place, never failing a whole
  // list, and every read of it says why.
  it('a stray one: listed with its error in place; each read refused with the message', async () => {
    const h = await makeHarness();
    await seedLegacyApproved(h, 'old1', 'M 1 1');

    const [queued] = entries((await call(h, 'GET', '/admin/queue/rereview', undefined, 'admin')).data);
    expect(queued.workspaceId).toBe('old1');
    expect(String(queued.sourceError)).toBe(OLD_SHAPE_MESSAGE);
    expect(String(queued.changesError)).toBe(OLD_SHAPE_MESSAGE);

    const admin = await call(h, 'GET', '/admin/approval/old1', undefined, 'admin');
    expect([admin.status, String(admin.data.error).includes(OLD_SHAPE_MESSAGE)]).toEqual([500, true]);

    const source = await call(h, 'GET', '/approval-source/old1', undefined, 'visitor');
    expect([source.status, String(source.data.error).includes(OLD_SHAPE_MESSAGE)]).toEqual([500, true]);
  });

  it("an admin can still flag, unflag and unpublish one: each finishes, its state row has no hash, and its code isn't touched", async () => {
    const h = await makeHarness();
    await seedLegacyApproved(h, 'old2', 'M 2 2');
    const db = h.env.USERS_DB as unknown as MemoryD1;

    expect((await call(h, 'POST', '/admin/flag-workspace/old2', { internalNotes: 'spam' }, 'admin')).status).toBe(200);
    expect(await storedRecord(h.kv, 'old2')).toMatchObject({ flagged: true, isPublic: false, code: 'M 2 2' });
    // The Flagged list shows it, with no hash, rather than failing.
    const flagged = await call(h, 'GET', '/admin/queue/flagged-workspaces', undefined, 'admin');
    expect(entries(flagged.data).map((e) => [e.workspaceId, e.codeHash])).toEqual([['old2', null]]);
    expect((await call(h, 'DELETE', '/admin/flag-workspace/old2', undefined, 'admin')).status).toBe(200);
    expect((await call(h, 'POST', '/admin/unpublish/old2', undefined, 'admin')).status).toBe(200);

    expect(db.publicationStates.map((r) => [r.state, r.code_hash])).toEqual([
      ['flagged', null],
      ['rejected', null],
      ['unpublished', null],
    ]);
    const record = await storedRecord(h.kv, 'old2');
    expect([record.code, record.files]).toEqual(['M 2 2', undefined]);
  });
});

describe('GET /approval-source/:id refuses what a visitor may not see', () => {
  it('404s for a private or flagged workspace, one never approved, and one that does not exist', async () => {
    const h = await makeHarness();
    const id = await createAndSubmit(h, { code: SPIRAL });
    expect((await call(h, 'GET', `/approval-source/${id}`, undefined, 'visitor')).status).toBe(404); // pending
    await approve(h, id);
    expect((await call(h, 'GET', `/approval-source/${id}`, undefined, 'visitor')).status).toBe(200);

    const record = await storedRecord(h.kv, id);
    await h.kv.put(`workspace:${id}`, JSON.stringify({ ...record, flagged: true }));
    expect((await call(h, 'GET', `/approval-source/${id}`, undefined, 'visitor')).status).toBe(404);
    await h.kv.put(`workspace:${id}`, JSON.stringify({ ...record, isPublic: false }));
    expect((await call(h, 'GET', `/approval-source/${id}`, undefined, 'visitor')).status).toBe(404);
    expect((await call(h, 'GET', '/approval-source/nope', undefined, 'visitor')).status).toBe(404);
  });
});

describe('a queue entry whose files are missing from storage', () => {
  it('is listed with the reason, and the rest of the queue still lists', async () => {
    const h = await makeHarness();
    const broken = await createAndSubmit(h, { code: 'circle(1, 1, 1);' });
    const fine = await createAndSubmit(h, { code: SPIRAL });
    const { sha256 } = await entryForText('circle(1, 1, 1);');
    await h.r2.delete(`files/${broken}/${sha256}`);

    const res = await call(h, 'GET', '/admin/queue/review', undefined, 'admin');
    expect(res.status).toBe(200);
    const byId = new Map(entries(res.data).map((e) => [e.workspaceId, e]));
    expect(byId.get(broken)!.sourceError).toBe(`File ${sha256} of workspace ${broken} is missing from storage`);
    expect(byId.get(broken)).not.toHaveProperty('code');
    expect(byId.get(fine)!.code).toBe(SPIRAL);
  });
});
