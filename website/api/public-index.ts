// Public-workspace index helpers — Phase 2 onward.
//
// The `public:workspaces` KV key is now mutated only through the moderation
// flow (see ./moderation.ts). Approvals are appended via
// `publishApprovalToIndex`, unpublishes via `unpublishFromIndex`. The only
// remaining responsibility here is the workspace-delete cascade — we still
// need to drop the entry if the underlying workspace is deleted entirely.

import type { Env, PublicIndexEntry } from './types.js';

export async function removeFromPublicIndex(env: Env, workspaceId: string): Promise<void> {
  let index: PublicIndexEntry[] = [];
  try {
    const raw = await env.WORKSPACES.get('public:workspaces');
    if (raw) index = JSON.parse(raw);
  } catch {
    /* empty */
  }

  const filtered = index.filter((entry) => entry.id !== workspaceId);
  if (filtered.length !== index.length) {
    await env.WORKSPACES.put('public:workspaces', JSON.stringify(filtered));
  }
}
