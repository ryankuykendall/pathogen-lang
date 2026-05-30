// Moderation state machine for workspace publication.
//
// Workspace publication state is the latest row in the
// `workspace_publication_states` D1 table — see migration 0002. This module
// exposes append-only mutators (no UPDATE, no DELETE) and read helpers so
// the audit trail is preserved.
//
// The flow is:
//   unpublished -> pending (owner submits)
//                  pending -> approved (admin approves)
//                          -> rejected (admin rejects with internal notes)
//                          -> rereview-pending (owner edits an approved workspace)
//   approved -> unpublished (owner revokes; approval record retained)
//
// Approval records live in KV at `approval:{workspaceId}` and carry the
// frozen code/slug/thumbnails/featuredAt — they are the source of truth for
// what visitors see on /explore and the workspace detail page.
//
// Slug uniqueness: per-user `(handle, slug)` must be unique because the
// detail-page URL is `/u/<handle>/<slug>`. Conflicts get an `-id-prefix`
// suffix at approval time and the resulting slug is frozen.

import type {
  Env,
  PublicIndexEntry,
  Workspace,
  WorkspaceApproval,
  WorkspaceRejection,
  WorkspacePublicationState,
  PublicationStateRow,
  ReviewQueueEntry,
} from './types.js';
import type { D1Database } from './types.js';
import { readThumbMeta, slugify } from './utils.js';

export const PUBLIC_INDEX_CAP = 100;
export const FEATURED_CAP = 100;

const QUEUE_REVIEW_KEY = 'queue:review';
const QUEUE_REREVIEW_KEY = 'queue:rereview';
const QUEUE_FLAGGED_WORKSPACES_KEY = 'queue:flagged-workspaces';
const QUEUE_FLAGGED_USERS_KEY = 'queue:flagged-users';

function approvalKey(workspaceId: string): string {
  return `approval:${workspaceId}`;
}

function rejectionKey(workspaceId: string): string {
  return `rejection:${workspaceId}`;
}

/**
 * Append a state-transition row. The latest row for a workspace_id is the
 * effective state. Never UPDATE; never DELETE — this is the audit log.
 */
export async function appendState(
  db: D1Database,
  args: {
    workspaceId: string;
    state: WorkspacePublicationState;
    byUserId: string;
    codeHash?: string | null;
    internalNotes?: string | null;
  },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO workspace_publication_states
       (workspace_id, state, transitioned_at, transitioned_by_user_id, code_hash, internal_notes)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      args.workspaceId,
      args.state,
      Date.now(),
      args.byUserId,
      args.codeHash ?? null,
      args.internalNotes ?? null,
    )
    .run();
}

/**
 * Read the latest state row for a workspace. Returns null when no row
 * exists (i.e. the workspace pre-dates the moderation system). Callers
 * treat null as 'unpublished'.
 */
export async function getEffectiveState(
  db: D1Database,
  workspaceId: string,
): Promise<PublicationStateRow | null> {
  return db
    .prepare(
      `SELECT id, workspace_id, state, transitioned_at, transitioned_by_user_id, code_hash, internal_notes
       FROM workspace_publication_states
       WHERE workspace_id = ?
       ORDER BY transitioned_at DESC, id DESC
       LIMIT 1`,
    )
    .bind(workspaceId)
    .first<PublicationStateRow>();
}

/**
 * Read the full state history for a workspace (newest-first). Used by the
 * admin moderation UI to show the audit trail for re-review and flagging
 * decisions.
 */
export async function getStateHistory(
  db: D1Database,
  workspaceId: string,
): Promise<PublicationStateRow[]> {
  const { results } = await db
    .prepare(
      `SELECT id, workspace_id, state, transitioned_at, transitioned_by_user_id, code_hash, internal_notes
       FROM workspace_publication_states
       WHERE workspace_id = ?
       ORDER BY transitioned_at DESC, id DESC`,
    )
    .bind(workspaceId)
    .all<PublicationStateRow>();
  return results;
}

// ─── Review queue (KV) ────────────────────────────────────────────────

async function readQueue(env: Env, key: string): Promise<ReviewQueueEntry[]> {
  try {
    const raw = await env.WORKSPACES.get(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeQueue(
  env: Env,
  key: string,
  entries: ReviewQueueEntry[],
): Promise<void> {
  await env.WORKSPACES.put(key, JSON.stringify(entries));
}

export async function pushReviewQueue(env: Env, entry: ReviewQueueEntry): Promise<void> {
  const queue = await readQueue(env, QUEUE_REVIEW_KEY);
  // Remove any previous entry for this workspaceId so the queue carries
  // at most one pending submission per workspace. Resubmissions overwrite.
  const filtered = queue.filter((e) => e.workspaceId !== entry.workspaceId);
  filtered.unshift(entry);
  await writeQueue(env, QUEUE_REVIEW_KEY, filtered);
}

export async function listReviewQueue(env: Env): Promise<ReviewQueueEntry[]> {
  return readQueue(env, QUEUE_REVIEW_KEY);
}

export async function removeFromReviewQueue(env: Env, workspaceId: string): Promise<void> {
  const queue = await readQueue(env, QUEUE_REVIEW_KEY);
  const filtered = queue.filter((e) => e.workspaceId !== workspaceId);
  if (filtered.length !== queue.length) {
    await writeQueue(env, QUEUE_REVIEW_KEY, filtered);
  }
}

export async function getReviewQueueEntry(
  env: Env,
  workspaceId: string,
): Promise<ReviewQueueEntry | null> {
  const queue = await readQueue(env, QUEUE_REVIEW_KEY);
  return queue.find((e) => e.workspaceId === workspaceId) ?? null;
}

export async function pushRereviewQueue(env: Env, entry: ReviewQueueEntry): Promise<void> {
  const queue = await readQueue(env, QUEUE_REREVIEW_KEY);
  const filtered = queue.filter((e) => e.workspaceId !== entry.workspaceId);
  filtered.unshift(entry);
  await writeQueue(env, QUEUE_REREVIEW_KEY, filtered);
}

export async function listRereviewQueue(env: Env): Promise<ReviewQueueEntry[]> {
  return readQueue(env, QUEUE_REREVIEW_KEY);
}

export async function getRereviewQueueEntry(
  env: Env,
  workspaceId: string,
): Promise<ReviewQueueEntry | null> {
  const queue = await readQueue(env, QUEUE_REREVIEW_KEY);
  return queue.find((e) => e.workspaceId === workspaceId) ?? null;
}

export async function removeFromRereviewQueue(env: Env, workspaceId: string): Promise<void> {
  const queue = await readQueue(env, QUEUE_REREVIEW_KEY);
  const filtered = queue.filter((e) => e.workspaceId !== workspaceId);
  if (filtered.length !== queue.length) {
    await writeQueue(env, QUEUE_REREVIEW_KEY, filtered);
  }
}

// ─── Approval / rejection records (KV) ────────────────────────────────

export async function readApproval(env: Env, workspaceId: string): Promise<WorkspaceApproval | null> {
  try {
    const raw = await env.WORKSPACES.get(approvalKey(workspaceId));
    return raw ? (JSON.parse(raw) as WorkspaceApproval) : null;
  } catch {
    return null;
  }
}

export async function writeApproval(env: Env, record: WorkspaceApproval): Promise<void> {
  await env.WORKSPACES.put(approvalKey(record.workspaceId), JSON.stringify(record));
}

export async function readRejection(
  env: Env,
  workspaceId: string,
): Promise<WorkspaceRejection | null> {
  try {
    const raw = await env.WORKSPACES.get(rejectionKey(workspaceId));
    return raw ? (JSON.parse(raw) as WorkspaceRejection) : null;
  } catch {
    return null;
  }
}

export async function writeRejection(env: Env, record: WorkspaceRejection): Promise<void> {
  await env.WORKSPACES.put(rejectionKey(record.workspaceId), JSON.stringify(record));
}

// ─── Slug uniqueness ──────────────────────────────────────────────────

/**
 * Pick a slug that is unique among the user's existing approval records.
 * The base slug from slugify(name) is preferred; on conflict, append the
 * first 8 chars of the workspaceId so the URL stays human-readable but
 * always disambiguates. Same workspaceId reusing its prior slug is fine.
 */
export async function pickUniqueSlugForUser(
  env: Env,
  userId: string,
  baseSlug: string,
  workspaceId: string,
): Promise<string> {
  if (!baseSlug) baseSlug = 'workspace';
  // List approval keys; for each, parse and filter by userId.
  const conflicts = new Set<string>();
  let cursor: string | undefined;
  do {
    const result = await env.WORKSPACES.list({ prefix: 'approval:', cursor });
    for (const k of result.keys) {
      const id = k.name.slice('approval:'.length);
      if (id === workspaceId) continue;
      const rec = await readApproval(env, id);
      if (rec && rec.userId === userId) {
        conflicts.add(rec.slug);
      }
    }
    cursor = result.list_complete ? undefined : result.cursor;
  } while (cursor);
  if (!conflicts.has(baseSlug)) return baseSlug;
  return `${baseSlug}-${workspaceId.slice(0, 8)}`;
}

// ─── Public index (with cap + approved-only filter) ───────────────────

async function readPublicIndex(env: Env): Promise<PublicIndexEntry[]> {
  try {
    const raw = await env.WORKSPACES.get('public:workspaces');
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writePublicIndex(env: Env, entries: PublicIndexEntry[]): Promise<void> {
  // Sort by approvedAt descending; cap at PUBLIC_INDEX_CAP (oldest drop).
  // Entries without approvedAt sort as oldest so they age out first.
  const sorted = entries.slice().sort((a, b) => {
    const aT = a.approvedAt ? new Date(a.approvedAt).getTime() : 0;
    const bT = b.approvedAt ? new Date(b.approvedAt).getTime() : 0;
    return bT - aT;
  });
  await env.WORKSPACES.put(
    'public:workspaces',
    JSON.stringify(sorted.slice(0, PUBLIC_INDEX_CAP)),
  );
}

/**
 * Insert (or refresh) a public index entry. Called when a workspace is
 * approved or its underlying record is updated while approved. Sorted by
 * approvedAt; the index is capped at 100 entries.
 */
export async function publishApprovalToIndex(
  env: Env,
  approval: WorkspaceApproval,
  workspace: Workspace,
): Promise<void> {
  const entries = await readPublicIndex(env);
  const filtered = entries.filter((e) => e.id !== approval.workspaceId);
  filtered.push({
    id: approval.workspaceId,
    slug: approval.slug,
    name: approval.name,
    description: approval.description || '',
    userId: approval.userId,
    updatedAt: workspace.updatedAt,
    // Read the live thumbnail timestamp via the sidecar (with legacy fallback)
    // — same source adminReconcileIndexes uses, so the two index-writing paths
    // agree. Deriving from the approval's manual/auto fields alone would blank
    // the card for pre-kind-split workspaces (single legacy `thumbnailAt`, both
    // manual/auto null) on re-approve or owner un-flag.
    thumbnailAt: (await readThumbMeta(env, approval.workspaceId, workspace)).thumbnailAt,
    approvedAt: approval.approvedAt,
    ...(approval.ownerHandle ? { ownerHandle: approval.ownerHandle } : {}),
  });
  await writePublicIndex(env, filtered);
}

export async function unpublishFromIndex(env: Env, workspaceId: string): Promise<void> {
  const entries = await readPublicIndex(env);
  const filtered = entries.filter((e) => e.id !== workspaceId);
  if (filtered.length !== entries.length) {
    await writePublicIndex(env, filtered);
  }
}

// ─── Featured index ───────────────────────────────────────────────────

async function readFeatured(env: Env): Promise<string[]> {
  try {
    const raw = await env.WORKSPACES.get('featured:workspaces');
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function addToFeatured(env: Env, workspaceId: string): Promise<void> {
  const ids = await readFeatured(env);
  if (ids.includes(workspaceId)) return;
  ids.unshift(workspaceId);
  await env.WORKSPACES.put(
    'featured:workspaces',
    JSON.stringify(ids.slice(0, FEATURED_CAP)),
  );
}

export async function removeFromFeatured(env: Env, workspaceId: string): Promise<void> {
  const ids = await readFeatured(env);
  const filtered = ids.filter((id) => id !== workspaceId);
  if (filtered.length !== ids.length) {
    await env.WORKSPACES.put('featured:workspaces', JSON.stringify(filtered));
  }
}

// ─── Flagged workspaces / users (KV) ──────────────────────────────────

async function readIdQueue(env: Env, key: string): Promise<string[]> {
  try {
    const raw = await env.WORKSPACES.get(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeIdQueue(env: Env, key: string, ids: string[]): Promise<void> {
  await env.WORKSPACES.put(key, JSON.stringify(ids));
}

export async function addToFlaggedWorkspaces(env: Env, workspaceId: string): Promise<void> {
  const ids = await readIdQueue(env, QUEUE_FLAGGED_WORKSPACES_KEY);
  if (ids.includes(workspaceId)) return;
  ids.unshift(workspaceId);
  await writeIdQueue(env, QUEUE_FLAGGED_WORKSPACES_KEY, ids);
}

export async function removeFromFlaggedWorkspaces(env: Env, workspaceId: string): Promise<void> {
  const ids = await readIdQueue(env, QUEUE_FLAGGED_WORKSPACES_KEY);
  const filtered = ids.filter((id) => id !== workspaceId);
  if (filtered.length !== ids.length) {
    await writeIdQueue(env, QUEUE_FLAGGED_WORKSPACES_KEY, filtered);
  }
}

export async function listFlaggedWorkspaces(env: Env): Promise<string[]> {
  return readIdQueue(env, QUEUE_FLAGGED_WORKSPACES_KEY);
}

export async function addToFlaggedUsers(env: Env, userId: string): Promise<void> {
  const ids = await readIdQueue(env, QUEUE_FLAGGED_USERS_KEY);
  if (ids.includes(userId)) return;
  ids.unshift(userId);
  await writeIdQueue(env, QUEUE_FLAGGED_USERS_KEY, ids);
}

export async function removeFromFlaggedUsers(env: Env, userId: string): Promise<void> {
  const ids = await readIdQueue(env, QUEUE_FLAGGED_USERS_KEY);
  const filtered = ids.filter((id) => id !== userId);
  if (filtered.length !== ids.length) {
    await writeIdQueue(env, QUEUE_FLAGGED_USERS_KEY, filtered);
  }
}

export async function listFlaggedUsers(env: Env): Promise<string[]> {
  return readIdQueue(env, QUEUE_FLAGGED_USERS_KEY);
}

/**
 * Find the approval record for a given (userId, slug) tuple — the lookup
 * the workspace-detail page uses to resolve `/u/:handle/:slug`. Returns
 * null when no matching approval exists. Iterates `approval:*` keys; the
 * 100-cap on the public index bounds this in practice.
 */
export async function findApprovalForUserAndSlug(
  env: Env,
  userId: string,
  slug: string,
): Promise<WorkspaceApproval | null> {
  let cursor: string | undefined;
  do {
    const result = await env.WORKSPACES.list({ prefix: 'approval:', cursor });
    for (const k of result.keys) {
      const id = k.name.slice('approval:'.length);
      const rec = await readApproval(env, id);
      if (rec && rec.userId === userId && rec.slug === slug) return rec;
    }
    cursor = result.list_complete ? undefined : result.cursor;
  } while (cursor);
  return null;
}

/**
 * Enumerate every approval record currently in KV. Used by the admin
 * Approved / Featured tabs to list the moderated catalog.
 */
export async function listAllApprovals(env: Env): Promise<WorkspaceApproval[]> {
  const approvals: WorkspaceApproval[] = [];
  let cursor: string | undefined;
  do {
    const result = await env.WORKSPACES.list({ prefix: 'approval:', cursor });
    for (const k of result.keys) {
      const id = k.name.slice('approval:'.length);
      const rec = await readApproval(env, id);
      if (rec) approvals.push(rec);
    }
    cursor = result.list_complete ? undefined : result.cursor;
  } while (cursor);
  return approvals;
}

/**
 * Enumerate every rejection record in KV. Used by the admin Rejected tab.
 */
export async function listAllRejections(env: Env): Promise<WorkspaceRejection[]> {
  const rejections: WorkspaceRejection[] = [];
  let cursor: string | undefined;
  do {
    const result = await env.WORKSPACES.list({ prefix: 'rejection:', cursor });
    for (const k of result.keys) {
      const id = k.name.slice('rejection:'.length);
      const rec = await readRejection(env, id);
      if (rec) rejections.push(rec);
    }
    cursor = result.list_complete ? undefined : result.cursor;
  } while (cursor);
  return rejections;
}

/**
 * Read the current featured ID list. Exposed for the admin Featured tab.
 */
export async function listFeaturedIds(env: Env): Promise<string[]> {
  return readFeatured(env);
}

/**
 * Enumerate every approval record belonging to a given user. Used by the
 * flag-user cascade to drop the user's entries from the public + featured
 * indexes (and the unflag path to restore them).
 */
export async function listApprovalsForUser(
  env: Env,
  userId: string,
): Promise<WorkspaceApproval[]> {
  const approvals: WorkspaceApproval[] = [];
  let cursor: string | undefined;
  do {
    const result = await env.WORKSPACES.list({ prefix: 'approval:', cursor });
    for (const k of result.keys) {
      const id = k.name.slice('approval:'.length);
      const rec = await readApproval(env, id);
      if (rec && rec.userId === userId) approvals.push(rec);
    }
    cursor = result.list_complete ? undefined : result.cursor;
  } while (cursor);
  return approvals;
}

// ─── Build a queue entry (frozen snapshot of submitted code) ──────────

export function makeQueueEntry(workspace: Workspace, submittedAt: string): ReviewQueueEntry {
  return {
    workspaceId: workspace.id,
    userId: workspace.userId,
    code: workspace.code,
    codeHash: workspace.contentHash,
    name: workspace.name,
    description: workspace.description || '',
    slug: slugify(workspace.name),
    submittedAt,
  };
}
