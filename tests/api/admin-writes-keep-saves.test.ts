// An admin's action never reverts a save that landed while it ran (the phase 2
// audit's "Admin writes can lose a code save", project-docs/modules/backlog.md).
//
// Before storage step 3 (80f193f8), unpublish, flag, unflag, requeue and
// approve read the workspace record when they started and wrote the whole of
// it back at the end, so an owner's save in between was undone. Since then
// every write of a record goes through patchWorkspaceRecord, which re-reads it
// and applies only the admin's change just before writing. These tests land
// an owner's save inside the two actions that do slow work between starting
// and writing (approve: the drawing, the card image, the approval; requeue:
// reading the main), and check the save survives. Unpublish, flag and unflag
// have no such gap: their first read of the record is patchWorkspaceRecord's.

import { describe, expect, it } from 'vitest';

import { approved, call, EDITED, makeHarness, submitted } from './publishing-harness';

import type { Harness } from './publishing-harness';
import type { Workspace } from '../../website/api/types';

const record = async (h: Harness, id: string): Promise<Workspace> =>
  JSON.parse((await h.kv.get(`workspace:${id}`))!) as Workspace;

/** The owner's save of EDITED, as autosave sends it, against the record's current rev. */
async function ownerSave(h: Harness, id: string): Promise<void> {
  const before = await record(h, id);
  const res = await call(h, 'PUT', `/workspace/${id}`, { code: EDITED, baseRev: before.rev ?? 0 });
  expect(res.status).toBe(200);
}

describe("an admin's action keeps a save that landed while it ran", () => {
  it('approve: a save during the approval (its drawing being stored) stays, and the workspace is public', async () => {
    const h = await makeHarness();
    const id = await submitted(h);
    const before = await record(h, id);
    // The save lands while approve stores the admin's drawing, after it read the workspace.
    const put = h.r2.put.bind(h.r2);
    let landed = false;
    h.r2.put = (async (key: string, ...rest: unknown[]) => {
      if (!landed && key === `${id}/approval.svg`) {
        landed = true;
        await ownerSave(h, id);
      }
      return (put as (...a: unknown[]) => unknown)(key, ...rest);
    }) as typeof h.r2.put;
    const res = await call(h, 'POST', `/admin/review/${id}`, { decision: 'approve', svg: '<svg/>' }, 'admin-token');
    expect([res.status, landed]).toEqual([200, true]);
    const after = await record(h, id);
    // The save's version, not the one approve read: a newer rev and content.
    expect(after.rev).toBe((before.rev ?? 0) + 1);
    expect(after.contentHash).not.toBe(before.contentHash);
    expect(after.isPublic).toBe(true);
  });

  it("requeue: a save while it reads the main stays, and it's that version that goes to review", async () => {
    const h = await makeHarness();
    const id = await approved(h);
    const before = await record(h, id);
    const get = h.r2.get.bind(h.r2);
    let landed = false;
    h.r2.get = (async (key: string, ...rest: unknown[]) => {
      if (!landed && key.startsWith(`files/${id}/`)) {
        landed = true;
        await ownerSave(h, id);
      }
      return (get as (...a: unknown[]) => unknown)(key, ...rest);
    }) as typeof h.r2.get;
    const res = await call(h, 'POST', `/admin/requeue/${id}`, undefined, 'admin-token');
    expect([res.status, landed]).toEqual([200, true]);
    const after = await record(h, id);
    expect(after.rev).toBe((before.rev ?? 0) + 1);
    expect(after.contentHash).not.toBe(before.contentHash);
    expect(after.isPublic).toBe(false);
    // The review holds the saved version.
    const queue = JSON.parse((await h.kv.get('queue:review'))!) as { workspaceId: string; codeHash: string }[];
    expect(queue.find((e) => e.workspaceId === id)?.codeHash).toBe(after.contentHash);
  });
});
