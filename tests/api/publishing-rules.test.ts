// Publishing's server rules (2e step 5a; project-docs/modules/58-phase-2e-plan.md,
// your answers 8 and 10):
// - a re-review is only for a public workspace: an edit to a private one queues none;
//   Make private removes one that's waiting; going back to the approved files does too;
// - approving a re-review never makes a private workspace public again; a pending
//   submission is a real approval;
// - a workspace's live files are the owner's and the admins': a visitor reads the
//   approved files through /approval-source, never GET /workspace/:id, the file route
//   or the copy route;
// - an admin, by token or by a signed-in session, reads any file the workspace ever
//   named;
// - a save that changes nothing still says whether a re-review is waiting.

import { describe, expect, it } from 'vitest';

import { approved, call, EDITED, makeHarness, publicIds, rereviewIds, reviewIds, SPIRAL } from './publishing-harness';
import { storedRecord } from './workspace-helpers';
import { handleApiRequest } from '../../website/api/router';
import { entryForText } from '../../website/api/workspace-files';

import type { Harness } from './publishing-harness';

describe('a re-review is only for a public workspace (answer 8)', () => {
  it('an edit to an approved workspace queues a re-review (as before)', async () => {
    const h = await makeHarness();
    const id = await approved(h);
    const saved = await call(h, 'PUT', `/workspace/${id}`, { code: EDITED });
    expect(saved.data.rereviewPending).toBe(true);
    expect(await rereviewIds(h)).toEqual([id]);
  });

  it('after Make private, an edit queues none', async () => {
    const h = await makeHarness();
    const id = await approved(h);
    expect((await call(h, 'PUT', `/workspace/${id}`, { isPublic: false })).status).toBe(200);
    const saved = await call(h, 'PUT', `/workspace/${id}`, { code: EDITED });
    expect(saved.data.rereviewPending).toBe(false);
    expect(await rereviewIds(h)).toEqual([]);
  });

  it('Make private removes a re-review that was waiting', async () => {
    const h = await makeHarness();
    const id = await approved(h);
    await call(h, 'PUT', `/workspace/${id}`, { code: EDITED });
    expect(await rereviewIds(h)).toEqual([id]);
    const unpublished = await call(h, 'PUT', `/workspace/${id}`, { isPublic: false });
    expect(unpublished.data.rereviewPending).toBe(false);
    expect(await rereviewIds(h)).toEqual([]);
  });

  it('going back to the approved files removes the waiting re-review', async () => {
    const h = await makeHarness();
    const id = await approved(h);
    await call(h, 'PUT', `/workspace/${id}`, { code: EDITED });
    expect(await rereviewIds(h)).toEqual([id]);
    const back = await call(h, 'PUT', `/workspace/${id}`, { code: SPIRAL });
    expect(back.data.rereviewPending).toBe(false);
    expect(await rereviewIds(h)).toEqual([]);
  });

  it('a save that changes nothing still says whether a re-review is waiting', async () => {
    const h = await makeHarness();
    const id = await approved(h);
    await call(h, 'PUT', `/workspace/${id}`, { code: EDITED });
    const same = await call(h, 'PUT', `/workspace/${id}`, { code: EDITED });
    expect([same.data.skipped, same.data.rereviewPending]).toEqual([true, true]);
    await call(h, 'PUT', `/workspace/${id}`, { isPublic: false });
    const privateSame = await call(h, 'PUT', `/workspace/${id}`, { code: EDITED });
    expect([privateSame.data.skipped, privateSame.data.rereviewPending]).toEqual([true, false]);
  });

  it('Make private and then Make public: the re-review stays gone, and the edit is submitted for review', async () => {
    const h = await makeHarness();
    const id = await approved(h);
    await call(h, 'PUT', `/workspace/${id}`, { code: EDITED });
    await call(h, 'PUT', `/workspace/${id}`, { isPublic: false });
    expect((await call(h, 'PUT', `/workspace/${id}`, { isPublic: true })).status).toBe(200);
    expect([await reviewIds(h), await rereviewIds(h)]).toEqual([[id], []]);
    const [submitted] = (await call(h, 'GET', '/admin/queue/review', undefined, 'admin-token')).data.entries as {
      code: string;
    }[];
    expect(submitted.code).toBe(EDITED);
  });

  for (const action of ['unpublish', 'flag-workspace'] as const) {
    it(`an admin's ${action === 'unpublish' ? 'Unpublish' : 'Flag'} removes a re-review that was waiting`, async () => {
      const h = await makeHarness();
      const id = await approved(h);
      await call(h, 'PUT', `/workspace/${id}`, { code: EDITED });
      expect(await rereviewIds(h)).toEqual([id]);
      expect((await call(h, 'POST', `/admin/${action}/${id}`, {}, 'admin-token')).status).toBe(200);
      expect(await rereviewIds(h)).toEqual([]);
    });
  }

  it("an admin's Requeue leaves the review entry alone, with the files as they are now", async () => {
    const h = await makeHarness();
    const id = await approved(h);
    await call(h, 'PUT', `/workspace/${id}`, { code: EDITED });
    expect((await call(h, 'POST', `/admin/requeue/${id}`, {}, 'admin-token')).status).toBe(200);
    expect([await reviewIds(h), await rereviewIds(h)]).toEqual([[id], []]);
  });
});

describe('approving a re-review never makes a private workspace public', () => {
  /** A re-review left waiting for a private workspace, as an older server could leave one. */
  async function staleRereview(h: Harness): Promise<string> {
    const id = await approved(h);
    await call(h, 'PUT', `/workspace/${id}`, { code: EDITED });
    const record = await storedRecord(h.kv, id);
    await h.kv.put(`workspace:${id}`, JSON.stringify({ ...record, isPublic: false }));
    const index = JSON.parse((await h.kv.get('public:workspaces')) ?? '[]') as { id: string }[];
    await h.kv.put('public:workspaces', JSON.stringify(index.filter((e) => e.id !== id)));
    expect(await rereviewIds(h)).toEqual([id]);
    return id;
  }

  it('with only that re-review waiting, Approve is refused, the entry withdrawn, and the workspace stays private', async () => {
    const h = await makeHarness();
    const id = await staleRereview(h);
    const res = await call(h, 'POST', `/admin/review/${id}`, { decision: 'approve', svg: '<svg/>' }, 'admin-token');
    expect([res.status, res.data]).toEqual([
      409,
      { error: "This workspace isn't public any more, so its re-review was withdrawn.", withdrawn: true },
    ]);
    expect((await storedRecord(h.kv, id)).isPublic).toBe(false);
    expect(await rereviewIds(h)).toEqual([]);
    expect(await publicIds(h)).toEqual([]);
  });

  it('Reject of that re-review is withdrawn the same way, with no rejection recorded', async () => {
    const h = await makeHarness();
    const id = await staleRereview(h);
    const res = await call(h, 'POST', `/admin/review/${id}`, { decision: 'reject' }, 'admin-token');
    expect([res.status, res.data.withdrawn]).toEqual([409, true]);
    expect(await h.kv.get(`rejection:${id}`)).toBeNull();
    expect(await rereviewIds(h)).toEqual([]);
  });

  it('a pending submission beside it is a real approval: public, and both entries gone', async () => {
    const h = await makeHarness();
    const id = await staleRereview(h);
    // The owner makes it public again: a new submission.
    expect((await call(h, 'PUT', `/workspace/${id}`, { isPublic: true })).status).toBe(200);
    expect(await reviewIds(h)).toEqual([id]);
    const res = await call(h, 'POST', `/admin/review/${id}`, { decision: 'approve', svg: '<svg/>' }, 'admin-token');
    expect(res.status).toBe(200);
    expect((await storedRecord(h.kv, id)).isPublic).toBe(true);
    expect([await reviewIds(h), await rereviewIds(h)]).toEqual([[], []]);
    expect(await publicIds(h)).toEqual([id]);
  });
});

describe("a workspace's live files are the owner's and the admins' (answer 10)", () => {
  /** Approved, then edited: the live files differ from the approved ones. */
  async function publicWithEdit(h: Harness): Promise<{ id: string; approvedSha: string; liveSha: string }> {
    const id = await approved(h);
    await call(h, 'PUT', `/workspace/${id}`, { code: EDITED });
    return { id, approvedSha: (await entryForText(SPIRAL)).sha256, liveSha: (await entryForText(EDITED)).sha256 };
  }

  for (const who of ['visitor', 'signed-out'] as const) {
    it(`a ${who} gets 403 from the workspace, its file route and its copy, and still reads the approved files`, async () => {
      const h = await makeHarness();
      const { id, liveSha } = await publicWithEdit(h);
      expect((await call(h, 'GET', `/workspace/${id}`, undefined, who)).status).toBe(403);
      expect((await call(h, 'GET', `/workspace/${id}/file/${liveSha}`, undefined, who)).status).toBe(403);
      expect((await call(h, 'POST', `/workspace/${id}/copy`, {}, who)).status).toBe(who === 'visitor' ? 403 : 401);
      const source = await call(h, 'GET', `/approval-source/${id}`, undefined, who);
      expect([source.status, (source.data.files as Record<string, { text: string }>)['main.pathogen'].text]).toEqual([
        200,
        SPIRAL,
      ]);
    });
  }

  it('the owner reads and copies, signed in or by its anonymous id', async () => {
    const h = await makeHarness();
    const { id, liveSha } = await publicWithEdit(h);
    expect((await call(h, 'GET', `/workspace/${id}`)).status).toBe(200);
    expect((await call(h, 'GET', `/workspace/${id}/file/${liveSha}`)).status).toBe(200);
    expect((await call(h, 'POST', `/workspace/${id}/copy`, {})).status).toBe(201);
    // A workspace made without signing in belongs to the browser's id.
    const anonymous = await handleApiRequest(
      new Request('https://api.pathogen.studio/workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-User-Id': 'anon-1' },
        body: JSON.stringify({ name: 'Mine', code: SPIRAL }),
      }),
      h.env,
      '/workspace',
    );
    const anonId = ((await anonymous.json()) as { id: string }).id;
    const read = await handleApiRequest(
      new Request(`https://api.pathogen.studio/workspace/${anonId}`, { headers: { 'X-User-Id': 'anon-1' } }),
      h.env,
      `/workspace/${anonId}`,
    );
    expect(read.status).toBe(200);
  });

  for (const who of ['admin-token', 'admin-session'] as const) {
    it(`an admin (${who}) reads the live files, and any file the workspace ever named`, async () => {
      const h = await makeHarness();
      const { id, approvedSha, liveSha } = await publicWithEdit(h);
      expect((await call(h, 'GET', `/workspace/${id}`, undefined, who)).status).toBe(200);
      const live = await call(h, 'GET', `/workspace/${id}/file/${liveSha}`, undefined, who);
      // The approved text is no longer in the live manifest.
      const old = await call(h, 'GET', `/workspace/${id}/file/${approvedSha}`, undefined, who);
      expect([live.status, live.data.text, old.status, old.data.text]).toEqual([200, EDITED, 200, SPIRAL]);
    });
  }

  it('a signed-in admin may copy a workspace; a token has no account to copy into', async () => {
    const h = await makeHarness();
    const { id } = await publicWithEdit(h);
    expect((await call(h, 'POST', `/workspace/${id}/copy`, {}, 'admin-session')).status).toBe(201);
    expect((await call(h, 'POST', `/workspace/${id}/copy`, {}, 'admin-token')).status).toBe(401);
  });

  it("a file the workspace never named is not found, for the owner and for an admin (another workspace's file included)", async () => {
    const h = await makeHarness();
    const { id } = await publicWithEdit(h);
    const other = (await call(h, 'POST', '/workspace', { name: 'Other', code: 'circle(1, 1, 1);\n' })).data
      .id as string;
    const othersSha = (await entryForText('circle(1, 1, 1);\n')).sha256;
    expect((await call(h, 'GET', `/workspace/${other}/file/${othersSha}`)).status).toBe(200);
    expect((await call(h, 'GET', `/workspace/${id}/file/${othersSha}`)).status).toBe(404);
    expect((await call(h, 'GET', `/workspace/${id}/file/${othersSha}`, undefined, 'admin-session')).status).toBe(404);
  });
});
