// Workspace publication state machine — unit coverage for the helpers in
// website/api/moderation.ts. Pins the rules that frame the moderation
// workflow: append-only audit rows, frozen-snapshot queue entries, slug
// uniqueness per user, public-index cap + ordering.

import { describe, expect, it } from 'vitest';

import {
  PUBLIC_INDEX_CAP,
  addToFeatured,
  addToFlaggedUsers,
  addToFlaggedWorkspaces,
  appendState,
  findApprovalForUserAndSlug,
  getEffectiveState,
  getRereviewQueueEntry,
  getReviewQueueEntry,
  listApprovalsForUser,
  listFlaggedUsers,
  listFlaggedWorkspaces,
  listRereviewQueue,
  listReviewQueue,
  makeQueueEntry,
  pickUniqueSlugForUser,
  publishApprovalToIndex,
  pushRereviewQueue,
  pushReviewQueue,
  readApproval,
  removeFromFeatured,
  removeFromFlaggedUsers,
  removeFromFlaggedWorkspaces,
  removeFromReviewQueue,
  unpublishFromIndex,
  writeApproval,
} from '../../website/api/moderation';
import type { Env, Workspace, WorkspaceApproval } from '../../website/api/types';
import { MemoryD1, MemoryKV } from '../auth/helpers';

function makeEnv(): { env: Env; kv: MemoryKV; db: MemoryD1 } {
  const kv = new MemoryKV();
  const db = new MemoryD1();
  const env = {
    WORKSPACES: kv as unknown as Env['WORKSPACES'],
    USERS_DB: db as unknown as Env['USERS_DB'],
  } as Env;
  return { env, kv, db };
}

function makeWorkspace(overrides: Partial<Workspace> = {}): Workspace {
  return {
    id: 'ws-1',
    slug: 'spiral',
    userId: 'user-a',
    name: 'Spiral',
    description: 'A spiral',
    code: 'circle(50,50,25);',
    isPublic: false,
    preferences: {},
    createdAt: '2026-05-13T10:00:00.000Z',
    updatedAt: '2026-05-13T10:00:00.000Z',
    contentHash: 'abc12345',
    thumbnailAt: null,
    manualThumbnailAt: null,
    autoThumbnailAt: null,
    ...overrides,
  };
}

function makeApproval(overrides: Partial<WorkspaceApproval> = {}): WorkspaceApproval {
  return {
    workspaceId: 'ws-1',
    userId: 'user-a',
    code: 'circle(50,50,25);',
    codeHash: 'abc12345',
    slug: 'spiral',
    name: 'Spiral',
    description: '',
    manualThumbnailAt: null,
    autoThumbnailAt: null,
    approvedAt: '2026-05-13T11:00:00.000Z',
    approvedByUserId: 'admin-1',
    featuredAt: null,
    ...overrides,
  };
}

describe('state machine (append-only)', () => {
  it('appendState writes a row and getEffectiveState returns the latest', async () => {
    const { env, db } = makeEnv();
    await appendState(env.USERS_DB, { workspaceId: 'ws-1', state: 'pending', byUserId: 'user-a', codeHash: 'h1' });
    await appendState(env.USERS_DB, { workspaceId: 'ws-1', state: 'approved', byUserId: 'admin', codeHash: 'h1' });
    const row = await getEffectiveState(env.USERS_DB, 'ws-1');
    expect(row?.state).toBe('approved');
    expect(db.publicationStates).toHaveLength(2);
  });

  it('getEffectiveState returns null for workspaces without rows', async () => {
    const { env } = makeEnv();
    const row = await getEffectiveState(env.USERS_DB, 'never-submitted');
    expect(row).toBeNull();
  });

  it('rejection-then-resubmit produces a pending top-of-history without losing the rejection', async () => {
    const { env, db } = makeEnv();
    await appendState(env.USERS_DB, { workspaceId: 'ws-1', state: 'pending', byUserId: 'user-a' });
    await appendState(env.USERS_DB, { workspaceId: 'ws-1', state: 'rejected', byUserId: 'admin', internalNotes: 'too rough' });
    await appendState(env.USERS_DB, { workspaceId: 'ws-1', state: 'pending', byUserId: 'user-a' });
    const latest = await getEffectiveState(env.USERS_DB, 'ws-1');
    expect(latest?.state).toBe('pending');
    // History is fully preserved.
    expect(db.publicationStates.map((r) => r.state)).toEqual(['pending', 'rejected', 'pending']);
    const rejectionRow = db.publicationStates.find((r) => r.state === 'rejected');
    expect(rejectionRow?.internal_notes).toBe('too rough');
  });
});

describe('review queue (frozen submission snapshot)', () => {
  it('pushReviewQueue stores the snapshot; admin reads the frozen code even if the live workspace later changes', async () => {
    const { env, kv } = makeEnv();
    const ws = makeWorkspace({ code: 'CODE_V1', contentHash: 'v1hash' });
    const entry = makeQueueEntry(ws, '2026-05-13T10:00:00.000Z');
    await pushReviewQueue(env, entry);

    // Owner saves a different version *after* submitting.
    const wsV2 = { ...ws, code: 'CODE_V2', contentHash: 'v2hash', updatedAt: '2026-05-13T11:00:00.000Z' };
    await kv.put(`workspace:${ws.id}`, JSON.stringify(wsV2));

    const fromQueue = await getReviewQueueEntry(env, ws.id);
    expect(fromQueue?.code).toBe('CODE_V1');
    expect(fromQueue?.codeHash).toBe('v1hash');
  });

  it('pushReviewQueue de-dupes by workspaceId (latest submission wins)', async () => {
    const { env } = makeEnv();
    const ws = makeWorkspace();
    await pushReviewQueue(env, makeQueueEntry({ ...ws, code: 'first' }, '2026-05-13T10:00:00.000Z'));
    await pushReviewQueue(env, makeQueueEntry({ ...ws, code: 'second' }, '2026-05-13T10:05:00.000Z'));
    const queue = await listReviewQueue(env);
    expect(queue).toHaveLength(1);
    expect(queue[0].code).toBe('second');
  });

  it('removeFromReviewQueue drops the entry for that workspace only', async () => {
    const { env } = makeEnv();
    await pushReviewQueue(env, makeQueueEntry(makeWorkspace({ id: 'a' }), 't1'));
    await pushReviewQueue(env, makeQueueEntry(makeWorkspace({ id: 'b' }), 't2'));
    await removeFromReviewQueue(env, 'a');
    const queue = await listReviewQueue(env);
    expect(queue.map((e) => e.workspaceId)).toEqual(['b']);
  });
});

describe('slug uniqueness per user', () => {
  it('returns base slug when no conflict exists', async () => {
    const { env } = makeEnv();
    const slug = await pickUniqueSlugForUser(env, 'user-a', 'spiral', 'ws-new');
    expect(slug).toBe('spiral');
  });

  it('disambiguates with workspaceId prefix when the same user already has the slug', async () => {
    const { env } = makeEnv();
    await writeApproval(env, makeApproval({ workspaceId: 'ws-old', slug: 'spiral', userId: 'user-a' }));
    const slug = await pickUniqueSlugForUser(env, 'user-a', 'spiral', 'ws-newer-12345678');
    expect(slug).toBe('spiral-ws-newer');
  });

  it('does not collide across users', async () => {
    const { env } = makeEnv();
    await writeApproval(env, makeApproval({ workspaceId: 'ws-a', slug: 'spiral', userId: 'user-a' }));
    const slug = await pickUniqueSlugForUser(env, 'user-b', 'spiral', 'ws-b');
    expect(slug).toBe('spiral');
  });

  it('handles empty base slug by substituting "workspace"', async () => {
    const { env } = makeEnv();
    const slug = await pickUniqueSlugForUser(env, 'user-a', '', 'ws-1');
    expect(slug).toBe('workspace');
  });
});

describe('public index (cap + ordering)', () => {
  it('orders by approvedAt descending', async () => {
    const { env } = makeEnv();
    for (let i = 0; i < 3; i++) {
      const id = `ws-${i}`;
      const approval = makeApproval({
        workspaceId: id,
        slug: `spiral-${i}`,
        approvedAt: new Date(2026, 0, 1 + i).toISOString(),
      });
      await publishApprovalToIndex(env, approval, makeWorkspace({ id }));
    }
    const raw = JSON.parse((await env.WORKSPACES.get('public:workspaces')) as string);
    expect(raw.map((e: { id: string }) => e.id)).toEqual(['ws-2', 'ws-1', 'ws-0']);
  });

  it('enforces the 100-entry cap (oldest drops)', async () => {
    const { env } = makeEnv();
    for (let i = 0; i < PUBLIC_INDEX_CAP + 5; i++) {
      const id = `ws-${i.toString().padStart(3, '0')}`;
      const approval = makeApproval({
        workspaceId: id,
        slug: id,
        approvedAt: new Date(2026, 0, 1, 0, i).toISOString(),
      });
      await publishApprovalToIndex(env, approval, makeWorkspace({ id }));
    }
    const raw = JSON.parse((await env.WORKSPACES.get('public:workspaces')) as string);
    expect(raw).toHaveLength(PUBLIC_INDEX_CAP);
    // Newest 100 retained; oldest 5 dropped.
    expect(raw[0].id).toBe('ws-104');
    expect(raw[raw.length - 1].id).toBe('ws-005');
  });

  it('unpublishFromIndex removes a single entry', async () => {
    const { env } = makeEnv();
    await publishApprovalToIndex(env, makeApproval({ workspaceId: 'a' }), makeWorkspace({ id: 'a' }));
    await publishApprovalToIndex(env, makeApproval({ workspaceId: 'b', slug: 'b', approvedAt: '2026-05-14T11:00:00.000Z' }), makeWorkspace({ id: 'b' }));
    await unpublishFromIndex(env, 'a');
    const raw = JSON.parse((await env.WORKSPACES.get('public:workspaces')) as string);
    expect(raw.map((e: { id: string }) => e.id)).toEqual(['b']);
  });
});

describe('approval / rejection records', () => {
  it('writeApproval round-trips via readApproval', async () => {
    const { env } = makeEnv();
    const approval = makeApproval({ slug: 'spiral-xyz', featuredAt: '2026-05-13T11:30:00.000Z' });
    await writeApproval(env, approval);
    const read = await readApproval(env, approval.workspaceId);
    expect(read).toEqual(approval);
  });

  it('readApproval returns null when the record is absent', async () => {
    const { env } = makeEnv();
    const read = await readApproval(env, 'never-approved');
    expect(read).toBeNull();
  });
});

describe('Phase 4: ownerHandle + svg propagation', () => {
  it('publishApprovalToIndex carries approval.ownerHandle through to the index entry', async () => {
    const { env } = makeEnv();
    const approval = makeApproval({ workspaceId: 'ws-1', userId: 'u1', slug: 'one', ownerHandle: 'alice' });
    await publishApprovalToIndex(env, approval, makeWorkspace({ id: 'ws-1' }));
    const raw = JSON.parse((await env.WORKSPACES.get('public:workspaces')) as string);
    expect(raw[0].ownerHandle).toBe('alice');
  });

  it('publishApprovalToIndex omits ownerHandle when the approval lacks it (legacy)', async () => {
    const { env } = makeEnv();
    const approval = makeApproval({ workspaceId: 'ws-1', userId: 'u1', slug: 'one' });
    delete approval.ownerHandle;
    await publishApprovalToIndex(env, approval, makeWorkspace({ id: 'ws-1' }));
    const raw = JSON.parse((await env.WORKSPACES.get('public:workspaces')) as string);
    expect(raw[0]).not.toHaveProperty('ownerHandle');
  });

  it('WorkspaceApproval round-trip preserves svg', async () => {
    const { env } = makeEnv();
    const approval = makeApproval({
      workspaceId: 'ws-1',
      svg: '<svg xmlns="http://www.w3.org/2000/svg"><circle cx="50" cy="50" r="20"/></svg>',
    });
    await writeApproval(env, approval);
    const read = await readApproval(env, 'ws-1');
    expect(read?.svg).toBe(approval.svg);
  });

  it('WorkspaceApproval round-trip with ownerHandle + svg preserves both', async () => {
    const { env } = makeEnv();
    const approval = makeApproval({
      workspaceId: 'ws-1',
      ownerHandle: 'alice',
      svg: '<svg/>',
    });
    await writeApproval(env, approval);
    const read = await readApproval(env, 'ws-1');
    expect(read?.ownerHandle).toBe('alice');
    expect(read?.svg).toBe('<svg/>');
  });

  it('legacy PublicIndexEntry without ownerHandle deserializes and survives sort + cap', async () => {
    const { env } = makeEnv();
    // Simulate a pre-Phase-4 index entry written without ownerHandle.
    const legacyEntry = {
      id: 'ws-legacy',
      slug: 'legacy',
      name: 'Legacy',
      description: '',
      userId: 'u1',
      updatedAt: '2026-01-01T00:00:00.000Z',
      thumbnailAt: null,
      approvedAt: '2026-01-01T00:00:00.000Z',
    };
    await env.WORKSPACES.put('public:workspaces', JSON.stringify([legacyEntry]));
    // Adding a new entry alongside should not break sorting/cap.
    await publishApprovalToIndex(
      env,
      makeApproval({ workspaceId: 'ws-new', slug: 'new', ownerHandle: 'bob', approvedAt: '2026-02-01T00:00:00.000Z' }),
      makeWorkspace({ id: 'ws-new' }),
    );
    const raw = JSON.parse((await env.WORKSPACES.get('public:workspaces')) as string);
    expect(raw.map((e: { id: string }) => e.id)).toEqual(['ws-new', 'ws-legacy']);
    // Legacy entry kept its missing ownerHandle; new entry has it set.
    expect(raw[0].ownerHandle).toBe('bob');
    expect(raw[1].ownerHandle).toBeUndefined();
  });
});

describe('findApprovalForUserAndSlug (workspace detail page resolver)', () => {
  it('returns the matching approval when (userId, slug) hits', async () => {
    const { env } = makeEnv();
    await writeApproval(env, makeApproval({ workspaceId: 'w1', userId: 'u-a', slug: 'one' }));
    await writeApproval(env, makeApproval({ workspaceId: 'w2', userId: 'u-a', slug: 'two' }));
    await writeApproval(env, makeApproval({ workspaceId: 'w3', userId: 'u-b', slug: 'one' }));

    const hit = await findApprovalForUserAndSlug(env, 'u-a', 'two');
    expect(hit?.workspaceId).toBe('w2');
  });

  it('respects per-user scoping — same slug on different users does not bleed', async () => {
    const { env } = makeEnv();
    await writeApproval(env, makeApproval({ workspaceId: 'w-a', userId: 'u-a', slug: 'shared' }));
    await writeApproval(env, makeApproval({ workspaceId: 'w-b', userId: 'u-b', slug: 'shared' }));

    const hitA = await findApprovalForUserAndSlug(env, 'u-a', 'shared');
    const hitB = await findApprovalForUserAndSlug(env, 'u-b', 'shared');
    expect(hitA?.workspaceId).toBe('w-a');
    expect(hitB?.workspaceId).toBe('w-b');
  });

  it('returns null for missing (userId, slug) tuples', async () => {
    const { env } = makeEnv();
    await writeApproval(env, makeApproval({ workspaceId: 'w1', userId: 'u-a', slug: 'one' }));
    expect(await findApprovalForUserAndSlug(env, 'u-a', 'two')).toBeNull();
    expect(await findApprovalForUserAndSlug(env, 'u-b', 'one')).toBeNull();
  });
});

describe('re-review queue (Phase 3)', () => {
  it('pushRereviewQueue is idempotent on workspaceId — re-edits refresh the entry', async () => {
    const { env } = makeEnv();
    const ws = makeWorkspace();
    await pushRereviewQueue(env, makeQueueEntry({ ...ws, code: 'edit1', contentHash: 'h1' }, 't1'));
    await pushRereviewQueue(env, makeQueueEntry({ ...ws, code: 'edit2', contentHash: 'h2' }, 't2'));
    const queue = await listRereviewQueue(env);
    expect(queue).toHaveLength(1);
    expect(queue[0].code).toBe('edit2');
    expect(queue[0].codeHash).toBe('h2');
  });

  it('getRereviewQueueEntry returns null for workspaces not in the queue', async () => {
    const { env } = makeEnv();
    await pushRereviewQueue(env, makeQueueEntry(makeWorkspace({ id: 'in-queue' }), 't1'));
    expect(await getRereviewQueueEntry(env, 'in-queue')).toBeTruthy();
    expect(await getRereviewQueueEntry(env, 'not-in-queue')).toBeNull();
  });
});

describe('flag cascades', () => {
  it('addToFlaggedWorkspaces is idempotent', async () => {
    const { env } = makeEnv();
    await addToFlaggedWorkspaces(env, 'ws-a');
    await addToFlaggedWorkspaces(env, 'ws-a');
    await addToFlaggedWorkspaces(env, 'ws-b');
    expect(await listFlaggedWorkspaces(env)).toEqual(['ws-b', 'ws-a']);
  });

  it('removeFromFlaggedWorkspaces drops the entry', async () => {
    const { env } = makeEnv();
    await addToFlaggedWorkspaces(env, 'ws-a');
    await addToFlaggedWorkspaces(env, 'ws-b');
    await removeFromFlaggedWorkspaces(env, 'ws-a');
    expect(await listFlaggedWorkspaces(env)).toEqual(['ws-b']);
  });

  it('listApprovalsForUser returns only that user’s approvals', async () => {
    const { env } = makeEnv();
    await writeApproval(env, makeApproval({ workspaceId: 'a', userId: 'user-x', slug: 'a' }));
    await writeApproval(env, makeApproval({ workspaceId: 'b', userId: 'user-x', slug: 'b' }));
    await writeApproval(env, makeApproval({ workspaceId: 'c', userId: 'user-y', slug: 'c' }));
    const approvals = await listApprovalsForUser(env, 'user-x');
    expect(approvals.map((a) => a.workspaceId).sort()).toEqual(['a', 'b']);
  });

  it('flag cascade: drops all user approvals from public + featured, restores on unflag', async () => {
    const { env } = makeEnv();
    // Two approvals from the same user, both on public; one featured.
    const apr1 = makeApproval({ workspaceId: 'w1', userId: 'u1', slug: 'one', approvedAt: '2026-01-01T00:00:00.000Z' });
    const apr2 = makeApproval({ workspaceId: 'w2', userId: 'u1', slug: 'two', approvedAt: '2026-01-02T00:00:00.000Z', featuredAt: '2026-01-02T00:00:00.000Z' });
    await writeApproval(env, apr1);
    await writeApproval(env, apr2);
    await publishApprovalToIndex(env, apr1, makeWorkspace({ id: 'w1' }));
    await publishApprovalToIndex(env, apr2, makeWorkspace({ id: 'w2' }));
    await addToFeatured(env, 'w2');

    // Simulate flag-user cascade: remove all the user's approvals from the
    // indexes. (The router does this in adminFlagUser; the test exercises
    // the helpers it calls.)
    const approvals = await listApprovalsForUser(env, 'u1');
    for (const a of approvals) {
      await unpublishFromIndex(env, a.workspaceId);
      await removeFromFeatured(env, a.workspaceId);
    }
    await addToFlaggedUsers(env, 'u1');

    let publicIdx = JSON.parse((await env.WORKSPACES.get('public:workspaces')) as string);
    expect(publicIdx).toEqual([]);
    expect(await listFlaggedUsers(env)).toEqual(['u1']);

    // Unflag cascade.
    await removeFromFlaggedUsers(env, 'u1');
    for (const a of approvals) {
      await publishApprovalToIndex(env, a, makeWorkspace({ id: a.workspaceId }));
      if (a.featuredAt) await addToFeatured(env, a.workspaceId);
    }
    publicIdx = JSON.parse((await env.WORKSPACES.get('public:workspaces')) as string);
    expect(publicIdx.map((e: { id: string }) => e.id).sort()).toEqual(['w1', 'w2']);
    const featured = JSON.parse((await env.WORKSPACES.get('featured:workspaces')) as string);
    expect(featured).toEqual(['w2']);
  });
});
