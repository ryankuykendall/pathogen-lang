// Re-key anonymous workspaces in KV to an authenticated user id on first sign-in.
//
// KV layout (from _worker.ts):
//   - workspace:<id>           -> Workspace JSON (Workspace.userId is the owner)
//   - user:<userId>:workspaces -> JSON array of workspace ids
//   - public:workspaces        -> JSON array of PublicIndexEntry (entry.userId)
//
// We enumerate workspaces owned by the anonymous id, rewrite their userId,
// merge them into the authenticated user's index (avoiding duplicates), update
// the public index, and finally delete the anonymous index entry. Idempotent
// against retries — a workspace already owned by the new user is skipped.

import type { KVNamespace } from './types.js';

interface MinimalWorkspace {
  id: string;
  userId: string;
  isPublic?: boolean;
  [k: string]: unknown;
}

interface MinimalPublicEntry {
  id: string;
  userId: string;
  [k: string]: unknown;
}

export interface ClaimResult {
  claimed: number;
  skipped: number;
}

export async function countClaimableWorkspaces(
  kv: KVNamespace,
  anonymousUserId: string,
): Promise<number> {
  if (!anonymousUserId) return 0;
  const raw = await kv.get(`user:${anonymousUserId}:workspaces`);
  if (!raw) return 0;
  try {
    const ids: string[] = JSON.parse(raw);
    return Array.isArray(ids) ? ids.length : 0;
  } catch {
    return 0;
  }
}

export async function claimAnonymousWorkspaces(
  kv: KVNamespace,
  anonymousUserId: string,
  authenticatedUserId: string,
): Promise<ClaimResult> {
  if (!anonymousUserId || anonymousUserId === authenticatedUserId) {
    return { claimed: 0, skipped: 0 };
  }

  const anonIndexKey = `user:${anonymousUserId}:workspaces`;
  const userIndexKey = `user:${authenticatedUserId}:workspaces`;

  const anonRaw = await kv.get(anonIndexKey);
  const anonIds: string[] = anonRaw ? safeArray(anonRaw) : [];
  if (anonIds.length === 0) {
    await kv.delete(anonIndexKey);
    return { claimed: 0, skipped: 0 };
  }

  const userRaw = await kv.get(userIndexKey);
  const userIds: string[] = userRaw ? safeArray(userRaw) : [];
  const userIdSet = new Set(userIds);

  let claimed = 0;
  let skipped = 0;

  for (const wsId of anonIds) {
    const wsRaw = await kv.get(`workspace:${wsId}`);
    if (!wsRaw) {
      skipped++;
      continue;
    }
    let ws: MinimalWorkspace;
    try {
      ws = JSON.parse(wsRaw);
    } catch {
      skipped++;
      continue;
    }
    if (ws.userId === authenticatedUserId) {
      // Already migrated; just make sure it's in the user index.
      if (!userIdSet.has(wsId)) {
        userIds.unshift(wsId);
        userIdSet.add(wsId);
      }
      skipped++;
      continue;
    }
    if (ws.userId !== anonymousUserId) {
      // Stale index entry — owner has changed elsewhere. Skip.
      skipped++;
      continue;
    }
    ws.userId = authenticatedUserId;
    await kv.put(`workspace:${wsId}`, JSON.stringify(ws));
    if (!userIdSet.has(wsId)) {
      userIds.unshift(wsId);
      userIdSet.add(wsId);
    }
    claimed++;
  }

  await kv.put(userIndexKey, JSON.stringify(userIds));
  await kv.delete(anonIndexKey);
  await rewritePublicIndex(kv, anonymousUserId, authenticatedUserId);

  return { claimed, skipped };
}

async function rewritePublicIndex(
  kv: KVNamespace,
  fromUserId: string,
  toUserId: string,
): Promise<void> {
  const raw = await kv.get('public:workspaces');
  if (!raw) return;
  let entries: MinimalPublicEntry[];
  try {
    entries = JSON.parse(raw);
    if (!Array.isArray(entries)) return;
  } catch {
    return;
  }
  let mutated = false;
  for (const entry of entries) {
    if (entry.userId === fromUserId) {
      entry.userId = toUserId;
      mutated = true;
    }
  }
  if (mutated) {
    await kv.put('public:workspaces', JSON.stringify(entries));
  }
}

function safeArray(raw: string): string[] {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}
