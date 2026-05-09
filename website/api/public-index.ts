// Public-workspace index helpers. The "public:workspaces" KV key holds an
// array of PublicIndexEntry objects sorted newest-first; SSR pages
// (/explore, /featured) and the API workspace mutation handlers all read
// or update it through these helpers.

import type { Env, PublicIndexEntry, Workspace } from './types.js';

export async function addToPublicIndex(env: Env, workspace: Workspace): Promise<void> {
  let index: PublicIndexEntry[] = [];
  try {
    const raw = await env.WORKSPACES.get('public:workspaces');
    if (raw) index = JSON.parse(raw);
  } catch {
    /* empty */
  }

  // Drop any existing entry for this id (avoids duplicates on republish).
  index = index.filter((entry) => entry.id !== workspace.id);

  // Newest-first ordering — used by the explore page directly.
  index.unshift({
    id: workspace.id,
    slug: workspace.slug,
    name: workspace.name,
    description: workspace.description || '',
    userId: workspace.userId,
    updatedAt: workspace.updatedAt,
    thumbnailAt: workspace.thumbnailAt || null,
  });

  await env.WORKSPACES.put('public:workspaces', JSON.stringify(index));
}

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

export async function updatePublicIndex(env: Env, workspace: Workspace): Promise<void> {
  if (workspace.isPublic) {
    await addToPublicIndex(env, workspace);
  } else {
    await removeFromPublicIndex(env, workspace.id);
  }
}
