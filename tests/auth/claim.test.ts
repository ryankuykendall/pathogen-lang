import { describe, expect, it } from 'vitest';

import {
  claimAnonymousWorkspaces,
  countClaimableWorkspaces,
} from '../../website/auth/claim';
import { MemoryKV } from './helpers';

async function seedWorkspace(kv: MemoryKV, id: string, ownerId: string, isPublic = false): Promise<void> {
  await kv.put(`workspace:${id}`, JSON.stringify({
    id,
    userId: ownerId,
    name: `WS ${id}`,
    isPublic,
  }));
}

async function seedUserIndex(kv: MemoryKV, userId: string, ids: string[]): Promise<void> {
  await kv.put(`user:${userId}:workspaces`, JSON.stringify(ids));
}

async function readUserIndex(kv: MemoryKV, userId: string): Promise<string[]> {
  const raw = await kv.get(`user:${userId}:workspaces`);
  return raw ? JSON.parse(raw) : [];
}

describe('countClaimableWorkspaces', () => {
  it('returns 0 with no anon index', async () => {
    const kv = new MemoryKV();
    expect(await countClaimableWorkspaces(kv, 'anon-1')).toBe(0);
  });

  it('returns the index length', async () => {
    const kv = new MemoryKV();
    await seedUserIndex(kv, 'anon-1', ['ws1', 'ws2', 'ws3']);
    expect(await countClaimableWorkspaces(kv, 'anon-1')).toBe(3);
  });
});

describe('claimAnonymousWorkspaces', () => {
  it('rekeys workspaces, merges into user index, deletes anon index', async () => {
    const kv = new MemoryKV();
    await seedWorkspace(kv, 'ws1', 'anon-1');
    await seedWorkspace(kv, 'ws2', 'anon-1', true);
    await seedUserIndex(kv, 'anon-1', ['ws1', 'ws2']);
    await kv.put('public:workspaces', JSON.stringify([
      { id: 'ws2', slug: 'w2', name: 'WS ws2', description: '', userId: 'anon-1', updatedAt: '', thumbnailAt: null },
    ]));

    const result = await claimAnonymousWorkspaces(kv, 'anon-1', 'user-A');
    expect(result.claimed).toBe(2);
    expect(result.skipped).toBe(0);

    expect(JSON.parse((await kv.get('workspace:ws1'))!).userId).toBe('user-A');
    expect(JSON.parse((await kv.get('workspace:ws2'))!).userId).toBe('user-A');
    expect(await readUserIndex(kv, 'user-A')).toEqual(['ws2', 'ws1']);
    expect(await kv.get('user:anon-1:workspaces')).toBeNull();
    expect(JSON.parse((await kv.get('public:workspaces'))!)[0].userId).toBe('user-A');
  });

  it('is idempotent on retry', async () => {
    const kv = new MemoryKV();
    await seedWorkspace(kv, 'ws1', 'anon-1');
    await seedUserIndex(kv, 'anon-1', ['ws1']);

    const a = await claimAnonymousWorkspaces(kv, 'anon-1', 'user-A');
    expect(a.claimed).toBe(1);

    const b = await claimAnonymousWorkspaces(kv, 'anon-1', 'user-A');
    expect(b.claimed).toBe(0);
    expect(b.skipped).toBe(0);
    expect(await readUserIndex(kv, 'user-A')).toEqual(['ws1']);
  });

  it('skips workspaces whose owner has changed elsewhere', async () => {
    const kv = new MemoryKV();
    await seedWorkspace(kv, 'ws1', 'someone-else');
    await seedUserIndex(kv, 'anon-1', ['ws1']);

    const r = await claimAnonymousWorkspaces(kv, 'anon-1', 'user-A');
    expect(r.claimed).toBe(0);
    expect(r.skipped).toBe(1);
    expect(JSON.parse((await kv.get('workspace:ws1'))!).userId).toBe('someone-else');
  });

  it('refuses to claim into the same id', async () => {
    const kv = new MemoryKV();
    await seedUserIndex(kv, 'me', ['ws1']);
    const r = await claimAnonymousWorkspaces(kv, 'me', 'me');
    expect(r).toEqual({ claimed: 0, skipped: 0 });
    expect(await kv.get('user:me:workspaces')).not.toBeNull();
  });
});
