// Locks down R2-backed storage of the admin-captured approval SVG.
//
// Large workspaces compile to multi-megabyte SVG. The previous design inlined
// the captured preview into the KV approval record and capped it at 1 MB, so
// big workspaces silently lost their preview ("Preview pending" swatch). The
// SVG now lives in R2 at `${id}/approval.svg` (no KV size cap) and is served
// publicly via GET /approval-svg/:id, guarded the same way the public detail
// page guards visitors (404 unless the workspace is public and unflagged):
//
//   - approve with a >1 MB svg → R2 key written, approvalSvgAt stamped, and
//     NO inline `svg` left on the KV approval record
//   - GET /approval-svg/:id → serves the blob as image/svg+xml
//   - GET 404s when the workspace is unpublished or flagged, or the blob is absent
//   - deleteWorkspace removes the R2 approval.svg
//   - a legacy approval carrying inline `svg` still renders (back-compat)

import { describe, expect, it } from 'vitest';

import { handleApiRequest } from '../../website/api/router';
import { pushReviewQueue, readApproval } from '../../website/api/moderation';
import type {
  Env,
  KVNamespace,
  R2Bucket,
  R2Object,
  ReviewQueueEntry,
  Workspace,
} from '../../website/api/types';
import { MemoryD1, MemoryKV } from '../auth/helpers';

class MemoryR2 implements R2Bucket {
  private store = new Map<string, string>();

  async get(key: string): Promise<R2Object | null> {
    const value = this.store.get(key);
    if (value === undefined) return null;
    return { body: new Response(value).body! };
  }

  async put(key: string, value: ReadableStream | ArrayBuffer | string): Promise<void> {
    if (typeof value === 'string') {
      this.store.set(key, value);
    } else if (value instanceof ArrayBuffer) {
      this.store.set(key, new TextDecoder().decode(value));
    } else {
      this.store.set(key, await new Response(value).text());
    }
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  has(key: string): boolean {
    return this.store.has(key);
  }

  async seed(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }

  async read(key: string): Promise<string | undefined> {
    return this.store.get(key);
  }

  keys(): string[] {
    return [...this.store.keys()].sort();
  }
}

const ADMIN_TOKEN = 'test-admin-token';

function makeEnv(): { env: Env; kv: MemoryKV; r2: MemoryR2; db: MemoryD1 } {
  const kv = new MemoryKV();
  const r2 = new MemoryR2();
  const db = new MemoryD1();
  const env = {
    WORKSPACES: kv as unknown as KVNamespace,
    THUMBNAILS: r2 as unknown as R2Bucket,
    USERS_DB: db as unknown as Env['USERS_DB'],
    ADMIN_TOKEN,
  } as Env;
  return { env, kv, r2, db };
}

async function createWorkspace(env: Env, userId: string, code: string): Promise<string> {
  const res = await handleApiRequest(
    new Request('https://api.pathogen.studio/workspace', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': userId },
      body: JSON.stringify({ name: 'Big Workspace', code }),
    }),
    env,
    '/workspace',
  );
  expect(res.status).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

// Push a pending review-queue entry for an existing workspace so
// adminReviewDecision has something to approve.
async function queueForReview(env: Env, id: string, userId: string): Promise<void> {
  const wsJson = await (env.WORKSPACES as unknown as KVNamespace).get(`workspace:${id}`);
  const ws = JSON.parse(wsJson!) as Workspace;
  const entry: ReviewQueueEntry = {
    workspaceId: id,
    userId,
    code: ws.code,
    codeHash: ws.contentHash,
    name: ws.name,
    description: ws.description || '',
    slug: 'big-workspace',
    submittedAt: new Date().toISOString(),
  };
  await pushReviewQueue(env, entry);
}

async function approve(env: Env, id: string, svg: string | null): Promise<Response> {
  return handleApiRequest(
    new Request(`https://api.pathogen.studio/admin/review/${id}?token=${ADMIN_TOKEN}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision: 'approve', ...(svg !== null ? { svg } : {}) }),
    }),
    env,
    `/admin/review/${id}`,
  );
}

async function putApprovalSvg(env: Env, id: string, svg: string): Promise<Response> {
  return handleApiRequest(
    new Request(`https://api.pathogen.studio/admin/approval/${id}/svg?token=${ADMIN_TOKEN}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ svg }),
    }),
    env,
    `/admin/approval/${id}/svg`,
  );
}

async function getApprovalSvg(env: Env, id: string): Promise<Response> {
  return handleApiRequest(
    new Request(`https://api.pathogen.studio/approval-svg/${id}`, { method: 'GET' }),
    env,
    `/approval-svg/${id}`,
  );
}

async function deleteWorkspace(env: Env, id: string, userId: string): Promise<Response> {
  return handleApiRequest(
    new Request(`https://api.pathogen.studio/workspace/${id}`, {
      method: 'DELETE',
      headers: { 'X-User-Id': userId },
    }),
    env,
    `/workspace/${id}`,
  );
}

// 1.5 MB SVG — exceeds the old 1 MB KV cap, well within the new 12 MB ceiling.
const BIG_SVG = `<svg viewBox="0 0 100 100"><!--${'x'.repeat(1.5 * 1024 * 1024)}--></svg>`;

describe('approval SVG stored in R2', () => {
  it('approve with a >1 MB svg writes R2, stamps approvalSvgAt, and leaves no inline svg in KV', async () => {
    const { env, r2 } = makeEnv();
    const userId = 'user-1';
    const id = await createWorkspace(env, userId, 'circle(50, 50, 40);');
    await queueForReview(env, id, userId);

    expect(BIG_SVG.length).toBeGreaterThan(1024 * 1024);
    const res = await approve(env, id, BIG_SVG);
    expect(res.status).toBe(200);

    // R2 holds the full SVG under the canonical key.
    expect(r2.has(`${id}/approval.svg`)).toBe(true);
    expect(await r2.read(`${id}/approval.svg`)).toBe(BIG_SVG);

    // KV approval record has approvalSvgAt stamped and NO inline svg.
    const approval = await readApproval(env, id);
    expect(approval).not.toBeNull();
    expect(typeof approval!.approvalSvgAt).toBe('string');
    expect(approval!.svg).toBeUndefined();
  });

  it('GET /approval-svg/:id serves the blob as image/svg+xml for a public workspace', async () => {
    const { env } = makeEnv();
    const userId = 'user-1';
    const id = await createWorkspace(env, userId, 'circle(50, 50, 40);');
    await queueForReview(env, id, userId);
    await approve(env, id, BIG_SVG);

    const res = await getApprovalSvg(env, id);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/svg+xml');
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=3600');
    expect(await res.text()).toBe(BIG_SVG);
  });

  it('GET /approval-svg/:id 404s when the workspace is unpublished', async () => {
    const { env, kv } = makeEnv();
    const userId = 'user-1';
    const id = await createWorkspace(env, userId, 'circle(50, 50, 40);');
    await queueForReview(env, id, userId);
    await approve(env, id, BIG_SVG);

    // Flip the workspace back to private — approval blob lingers in R2.
    const wsJson = await (kv as unknown as KVNamespace).get(`workspace:${id}`);
    const ws = JSON.parse(wsJson!) as Workspace;
    ws.isPublic = false;
    await (kv as unknown as KVNamespace).put(`workspace:${id}`, JSON.stringify(ws));

    const res = await getApprovalSvg(env, id);
    expect(res.status).toBe(404);
  });

  it('GET /approval-svg/:id 404s when the workspace is flagged', async () => {
    const { env, kv } = makeEnv();
    const userId = 'user-1';
    const id = await createWorkspace(env, userId, 'circle(50, 50, 40);');
    await queueForReview(env, id, userId);
    await approve(env, id, BIG_SVG);

    const wsJson = await (kv as unknown as KVNamespace).get(`workspace:${id}`);
    const ws = JSON.parse(wsJson!) as Workspace & { flagged?: boolean };
    ws.flagged = true;
    await (kv as unknown as KVNamespace).put(`workspace:${id}`, JSON.stringify(ws));

    const res = await getApprovalSvg(env, id);
    expect(res.status).toBe(404);
  });

  it('GET /approval-svg/:id 404s when the blob is missing for a public workspace', async () => {
    const { env } = makeEnv();
    const userId = 'user-1';
    const id = await createWorkspace(env, userId, 'circle(50, 50, 40);');
    await queueForReview(env, id, userId);
    // Approve with no svg → no R2 blob written, but workspace is public.
    await approve(env, id, null);

    const res = await getApprovalSvg(env, id);
    expect(res.status).toBe(404);
  });

  it('GET /approval-svg/:id 404s when the workspace does not exist', async () => {
    const { env } = makeEnv();
    const res = await getApprovalSvg(env, 'nonexistent');
    expect(res.status).toBe(404);
  });

  it('deleteWorkspace removes the R2 approval.svg', async () => {
    const { env, r2 } = makeEnv();
    const userId = 'user-1';
    const id = await createWorkspace(env, userId, 'circle(50, 50, 40);');
    await queueForReview(env, id, userId);
    await approve(env, id, BIG_SVG);
    expect(r2.has(`${id}/approval.svg`)).toBe(true);

    const del = await deleteWorkspace(env, id, userId);
    expect(del.status).toBe(200);
    expect(r2.has(`${id}/approval.svg`)).toBe(false);
  });

  it('PUT /admin/approval/:id/svg writes the R2 blob and stamps approvalSvgAt', async () => {
    const { env, r2 } = makeEnv();
    const userId = 'user-1';
    const id = await createWorkspace(env, userId, 'circle(50, 50, 40);');
    await queueForReview(env, id, userId);
    // Approve with no svg, then backfill via PUT.
    await approve(env, id, null);
    expect(r2.has(`${id}/approval.svg`)).toBe(false);

    const res = await putApprovalSvg(env, id, BIG_SVG);
    expect(res.status).toBe(200);
    expect(r2.has(`${id}/approval.svg`)).toBe(true);
    expect(await r2.read(`${id}/approval.svg`)).toBe(BIG_SVG);

    const approval = await readApproval(env, id);
    expect(typeof approval!.approvalSvgAt).toBe('string');
    expect(approval!.svg).toBeUndefined();
  });

  it('PUT /admin/approval/:id/svg drops a pre-existing inline svg so R2 is authoritative', async () => {
    // A legacy approval carries inline svg; the detail page checks that
    // field first. After a PUT backfill, the inline copy must be removed so
    // visitors see the freshly-stored R2 SVG, not the stale inline one.
    const { env, kv, r2 } = makeEnv();
    const id = 'legacy-refresh-ws';
    const staleSvg = '<svg viewBox="0 0 10 10" width="10" height="10"><rect/></svg>';
    // Seed a public workspace + legacy approval record with inline svg.
    await (kv as unknown as KVNamespace).put(
      `workspace:${id}`,
      JSON.stringify({ id, userId: 'user-1', name: 'L', code: '', isPublic: true }),
    );
    await (kv as unknown as KVNamespace).put(
      `approval:${id}`,
      JSON.stringify({
        workspaceId: id,
        userId: 'user-1',
        code: 'circle(5, 5, 4);',
        codeHash: 'h1',
        slug: 'legacy',
        name: 'Legacy',
        description: '',
        manualThumbnailAt: null,
        autoThumbnailAt: null,
        approvedAt: new Date().toISOString(),
        approvedByUserId: 'admin',
        featuredAt: null,
        svg: staleSvg,
      }),
    );

    const res = await putApprovalSvg(env, id, BIG_SVG);
    expect(res.status).toBe(200);

    const approval = await readApproval(env, id);
    expect(approval!.svg).toBeUndefined();
    expect(typeof approval!.approvalSvgAt).toBe('string');
    expect(await r2.read(`${id}/approval.svg`)).toBe(BIG_SVG);

    // And the public GET now serves the fresh R2 blob, not the stale inline.
    const get = await getApprovalSvg(env, id);
    expect(get.status).toBe(200);
    expect(await get.text()).toBe(BIG_SVG);
  });

  it('a legacy approval with inline svg still resolves via readApproval (back-compat)', async () => {
    // Pre-R2 approvals stored the SVG inline in the KV record. We no longer
    // write that field, but existing records must keep working: the detail
    // page inlines approval.svg before falling through to approvalSvgAt.
    const { env, kv } = makeEnv();
    const id = 'legacy-ws';
    const legacySvg = '<svg viewBox="0 0 10 10"><rect width="10" height="10"/></svg>';
    await (kv as unknown as KVNamespace).put(
      `approval:${id}`,
      JSON.stringify({
        workspaceId: id,
        userId: 'user-1',
        code: 'circle(5, 5, 4);',
        codeHash: 'h1',
        slug: 'legacy',
        name: 'Legacy',
        description: '',
        manualThumbnailAt: null,
        autoThumbnailAt: null,
        approvedAt: new Date().toISOString(),
        approvedByUserId: 'admin',
        featuredAt: null,
        svg: legacySvg,
      }),
    );

    const approval = await readApproval(env, id);
    expect(approval).not.toBeNull();
    expect(approval!.svg).toBe(legacySvg);
    expect(approval!.approvalSvgAt).toBeUndefined();
  });
});
