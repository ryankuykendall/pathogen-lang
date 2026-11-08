// Workspace, preferences, thumbnail, and admin API handlers + the request
// dispatcher. Auth/identity routes (`/auth/*`, `/me`, `/u/:handle`) are
// dispatched here too but live in the `website/auth/` module — this router
// only adapts them.
//
// Responses returned by every handler are intentionally CORS-naked. Each
// Worker entry point (Pages `_worker.ts` or the new API Worker
// `api/src/index.ts`) wraps the final response with its own CORS policy.

import {
  handleAuthClaim,
  handleAuthLogout,
  handleAuthStart,
  handleAuthVerify,
  handleMe,
  handlePublicProfile,
} from '../auth/handlers.js';
import { getEffectiveUserId } from '../auth/effective-id.js';
import { computeUserFeatures, isAdminUser } from '../auth/features.js';
import { readSessionTokenFromRequest, getSessionUserId } from '../auth/session.js';
import { findUserById } from '../auth/users.js';
import { UserFeature } from '../auth/types.js';
import { removeFromPublicIndex } from './public-index.js';
import { countSnapshotsForWorkspace, deleteSnapshotsForWorkspace, routeSnapshotRequest } from './snapshots.js';
import {
  addToFeatured,
  addToFlaggedUsers,
  addToFlaggedWorkspaces,
  appendState,
  getEffectiveState,
  getRereviewQueueEntry,
  getReviewQueueEntry,
  listAllApprovals,
  listAllRejections,
  listApprovalsForUser,
  listFeaturedIds,
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
  readRejection,
  removeFromFeatured,
  removeFromFlaggedUsers,
  removeFromFlaggedWorkspaces,
  removeFromRereviewQueue,
  removeFromReviewQueue,
  unpublishFromIndex,
  writeApproval,
  writeRejection,
} from './moderation.js';
import { setUserFlag } from '../auth/users.js';
import type { Env, Workspace, WorkspaceApproval, WorkspaceListing, WorkspaceRejection } from './types.js';
import {
  deleteThumbMeta,
  errorResponse,
  generateNanoId,
  jsonResponse,
  readThumbMeta,
  slugify,
  writeThumbMeta,
} from './utils.js';
import { copyFiles, deletePrefix, deleteWorkspaceFiles, fileKey, putText, readTexts } from './file-store.js';
import { MAIN_FILE, fileKind, readStoredFiles } from './workspace-files.js';
import {
  filesFromBody,
  filesWithText,
  mainText,
  materialize,
  patchWorkspaceRecord,
  readWorkspaceRecord,
  setFiles,
  storedFilesOf,
} from './workspace-store.js';

/**
 * The most distinct files one copy takes: two R2 calls each (a read and a
 * write) plus a few KV calls must fit the 1,000 KV and R2 calls Cloudflare
 * allows one request. Note 50, "Questions from building", asks how larger
 * workspaces should copy.
 */
const COPY_MAX_FILES = 480;

/** A record as responses show it: never the legacy `code` field (the files say it), and today's hash. */
function withoutLegacyCode(workspace: Workspace, hash: string): Omit<Workspace, 'code'> {
  const { code: _legacy, ...rest } = workspace;
  return { ...rest, contentHash: hash };
}

// Canvas dimensions now live in source via `define ViewBox(originX, originY,
// width, height);`. Older clients may still send `width`/`height` in the
// preferences payload — strip them here so they never get persisted from
// new writes. Existing KV records that already have these keys are left
// untouched by this function; the dedicated migration script handles
// historical cleanup.
function stripDimensions(prefs: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!prefs) return {};
  const { width: _w, height: _h, ...rest } = prefs;
  return rest;
}

function publishingError(message: string, code: string): Response {
  // We include both `error` (for legacy clients) and `code` (machine-readable,
  // stable across copy changes) so the playground can branch on the reason
  // without parsing strings. The reason is intentionally generic — the
  // server knows whether the deny was due to unverified email or a flag,
  // but the client should not, per the silent-rejection rule.
  return new Response(JSON.stringify({ error: message, code }), {
    status: 403,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Resolve whether the request may set isPublic: true on a workspace. Returns
// null on success; an error Response otherwise. The check is intentionally
// strict — anonymous (header-only) users are rejected outright, and verified
// session users without the Publishing feature get a generic 403 so the deny
// reason (flagged / unverified) is not exposed to the client.
// Coerce the latest publication-state row into the string clients render.
// 'unpublished' is returned when no row exists (pre-Phase-2 workspaces) or
// when D1 throws (e.g. local dev with no migrations applied, or the
// MemoryD1 used in unit tests). Read paths must never fail just because
// the moderation table is unavailable.
async function getEffectiveStateString(env: Env, workspaceId: string): Promise<string> {
  if (!env.USERS_DB) return 'unpublished';
  try {
    const row = await getEffectiveState(env.USERS_DB, workspaceId);
    return row?.state ?? 'unpublished';
  } catch {
    return 'unpublished';
  }
}

// True when the workspace has an entry in the re-review queue — i.e. an
// approved workspace whose live code has drifted from the approval
// snapshot. Surfaced as a separate flag (rather than a state) so the
// effective state stays 'approved' and matches what visitors actually
// see on /explore. UI shows "Pending re-review" when this is set.
async function isRereviewPending(env: Env, workspaceId: string): Promise<boolean> {
  try {
    return (await getRereviewQueueEntry(env, workspaceId)) !== null;
  } catch {
    return false;
  }
}

// Resolve admin status for /admin/* routes. Accepts either a signed-in
// session whose user is in ADMIN_EMAILS (preferred — enables the admin UI
// without threading a token through every link) or the legacy ?token=
// query parameter (still required by existing automated workflows).
async function isAdminRequest(request: Request, env: Env): Promise<boolean> {
  const url = new URL(request.url);
  const adminToken = url.searchParams.get('token');
  if (adminToken && env.ADMIN_TOKEN && adminToken === env.ADMIN_TOKEN) return true;
  const token = readSessionTokenFromRequest(request);
  if (!token || !env.USERS_DB) return false;
  let sessionUserId: string | null = null;
  try {
    sessionUserId = await getSessionUserId(env.USERS_DB, token);
  } catch {
    return false;
  }
  if (!sessionUserId) return false;
  const user = await findUserById(env.USERS_DB, sessionUserId);
  if (!user) return false;
  return isAdminUser(user, env);
}

// Resolve owner handles + flagged-status for queue listings. The admin UI
// renders an "⚑ Flagged user" badge on every card whose owner is flagged,
// regardless of which queue the workspace appears in. Failures fall back
// to nulls so the queue still renders when a user row is missing.
async function resolveQueueOwners(
  env: Env,
  entries: Array<{ userId: string }>,
): Promise<
  Array<
    {
      ownerHandle: string | null;
      ownerDisplayName: string | null;
      ownerFlagged: boolean;
    } & Record<string, unknown>
  >
> {
  return Promise.all(
    entries.map(async (e) => {
      let handle: string | null = null;
      let displayName: string | null = null;
      let flagged = false;
      if (env.USERS_DB) {
        try {
          const user = await findUserById(env.USERS_DB, e.userId);
          if (user) {
            handle = user.handle;
            displayName = user.display_name;
            flagged = Boolean(user.flagged);
          }
        } catch {
          /* leave defaults */
        }
      }
      return { ...e, ownerHandle: handle, ownerDisplayName: displayName, ownerFlagged: flagged };
    }),
  );
}

// Single-user lookup helper for the Approved/Featured/Rejected listings,
// which need ownerFlagged but already resolve handle inline.
async function resolveOwnerFlagged(env: Env, userId: string | null): Promise<boolean> {
  if (!userId || !env.USERS_DB) return false;
  try {
    const user = await findUserById(env.USERS_DB, userId);
    return Boolean(user?.flagged);
  } catch {
    return false;
  }
}

// Identify the admin acting on the request, for audit attribution. Falls
// back to the literal 'admin-token' when the request is gated by the
// query-param fallback rather than a session cookie.
async function resolveAdminUserId(request: Request, env: Env): Promise<string> {
  const token = readSessionTokenFromRequest(request);
  if (!token || !env.USERS_DB) return 'admin-token';
  try {
    const sessionUserId = await getSessionUserId(env.USERS_DB, token);
    return sessionUserId ?? 'admin-token';
  } catch {
    return 'admin-token';
  }
}

async function requirePublishingFeature(request: Request, env: Env): Promise<Response | null> {
  const token = readSessionTokenFromRequest(request);
  if (!token || !env.USERS_DB) {
    return publishingError('Publishing requires a signed-in account', 'publishing-not-available');
  }
  let sessionUserId: string | null = null;
  try {
    sessionUserId = await getSessionUserId(env.USERS_DB, token);
  } catch {
    sessionUserId = null;
  }
  if (!sessionUserId) {
    return publishingError('Publishing requires a signed-in account', 'publishing-not-available');
  }
  const user = await findUserById(env.USERS_DB, sessionUserId);
  if (!user) {
    return publishingError('Publishing requires a signed-in account', 'publishing-not-available');
  }
  const features = computeUserFeatures(user, env);
  if (!features.includes(UserFeature.Publishing)) {
    return publishingError('Publishing is not available for this account', 'publishing-not-available');
  }
  return null;
}

// Each handler signature: (request, env, ...captures) => Promise<Response>.
// `captures` are the regex capture groups from the route match (e.g. workspace id, thumbnail size).
export const apiHandlers: Record<string, (request: Request, env: Env, ...args: string[]) => Promise<Response>> = {
  // GET /api/workspaces — list current user's workspaces (metadata only).
  async listWorkspaces(request: Request, env: Env): Promise<Response> {
    const userId = await getEffectiveUserId(request, env);
    if (!userId) return errorResponse('User ID required', 401);

    if (!env.WORKSPACES) {
      return errorResponse('KV namespace WORKSPACES not bound. Check Cloudflare Pages settings.', 500);
    }

    try {
      const workspaceIdsJson = await env.WORKSPACES.get(`user:${userId}:workspaces`);
      const workspaceIds: string[] = workspaceIdsJson ? JSON.parse(workspaceIdsJson) : [];

      const workspaces = await Promise.all(
        workspaceIds.map(async (id: string) => {
          const wsJson = await env.WORKSPACES.get(`workspace:${id}`);
          if (!wsJson) return null;
          const ws: Workspace = JSON.parse(wsJson);
          const publicationState = await getEffectiveStateString(env, ws.id);
          const meta = await readThumbMeta(env, ws.id, ws);
          const listing: WorkspaceListing = {
            id: ws.id,
            slug: ws.slug,
            name: ws.name,
            description: ws.description,
            isPublic: ws.isPublic,
            createdAt: ws.createdAt,
            updatedAt: ws.updatedAt,
            thumbnailAt: meta.thumbnailAt,
            manualThumbnailAt: meta.manualThumbnailAt,
            autoThumbnailAt: meta.autoThumbnailAt,
            publicationState: publicationState as WorkspaceListing['publicationState'],
          };
          return listing;
        }),
      );

      return jsonResponse(workspaces.filter(Boolean));
    } catch (err) {
      return errorResponse('Failed to list workspaces: ' + (err as Error).message, 500);
    }
  },

  // POST /api/workspace — create a new workspace.
  async createWorkspace(request: Request, env: Env): Promise<Response> {
    const userId = await getEffectiveUserId(request, env);
    if (!userId) return errorResponse('User ID required', 401);

    try {
      const body = (await request.json()) as Record<string, unknown>;
      const { name, description, isPublic, preferences } = body as {
        name?: string;
        description?: string;
        isPublic?: boolean;
        preferences?: Record<string, unknown>;
      };

      if (!name?.trim()) return errorResponse('Workspace name is required');

      if (isPublic) {
        const gate = await requirePublishingFeature(request, env);
        if (gate) return gate;
      }

      const id = generateNanoId();
      const slug = slugify(name);
      const now = new Date().toISOString();

      // `files` (and folders, entryPoints), or today's playground's one `code`
      // string, which makes a workspace that is just main.pathogen. The
      // blobs are written before the record; a failure in between leaves
      // blobs nothing names, which the sweep script removes.
      const change = await filesFromBody(
        env,
        id,
        body.files !== undefined
          ? { files: body.files, folders: body.folders, entryPoints: body.entryPoints }
          : { code: body.code ?? '' },
        null,
      );
      if (!change.ok) return errorResponse(change.message, change.status ?? 400);
      const stored = change.value!;

      // Canvas dimensions now live in source via `define ViewBox(...)`.
      // Strip legacy `width`/`height` from incoming preferences so they
      // never get re-persisted from new client builds.
      const sanitizedPrefs = stripDimensions(preferences);

      const workspace: Workspace = {
        id,
        slug,
        userId,
        name: name.trim(),
        description: (description as string | undefined)?.trim() || '',
        isPublic: Boolean(isPublic),
        preferences: sanitizedPrefs,
        createdAt: now,
        updatedAt: now,
        contentHash: stored.hash,
        rev: 0,
        thumbnailAt: null,
        manualThumbnailAt: null,
        autoThumbnailAt: null,
      };
      setFiles(workspace, stored);

      // New workspaces never enter the public index directly — even when
      // the client requests isPublic:true, the workspace is stored private
      // and a 'pending' review queue entry is pushed for the admin to
      // approve. The workspace record's isPublic stays false until the
      // approval flow flips it.
      const requestedPublic = workspace.isPublic;
      workspace.isPublic = false;
      await env.WORKSPACES.put(`workspace:${id}`, JSON.stringify(workspace));

      const workspaceIdsJson = await env.WORKSPACES.get(`user:${userId}:workspaces`);
      const workspaceIds: string[] = workspaceIdsJson ? JSON.parse(workspaceIdsJson) : [];
      workspaceIds.unshift(id);
      await env.WORKSPACES.put(`user:${userId}:workspaces`, JSON.stringify(workspaceIds));

      if (requestedPublic && env.USERS_DB) {
        const submittedAt = new Date().toISOString();
        await pushReviewQueue(env, makeQueueEntry(workspace, stored, submittedAt));
        await appendState(env.USERS_DB, {
          workspaceId: id,
          state: 'pending',
          byUserId: userId,
          codeHash: stored.hash,
        });
      }

      const responseState = await getEffectiveStateString(env, id);
      return jsonResponse(
        { ...workspace, ...(await filesWithText(env, id, stored)), publicationState: responseState },
        201,
      );
    } catch (err) {
      return errorResponse('Failed to create workspace: ' + (err as Error).message, 500);
    }
  },

  // GET /api/workspace/:id — load workspace, with public/admin/owner access checks.
  async getWorkspace(request: Request, env: Env, id: string): Promise<Response> {
    try {
      const wsJson = await env.WORKSPACES.get(`workspace:${id}`);
      if (!wsJson) return errorResponse('Workspace not found', 404);

      const workspace: Workspace = JSON.parse(wsJson);
      const userId = await getEffectiveUserId(request, env);
      const url = new URL(request.url);
      const adminToken = url.searchParams.get('token');
      const isAdmin = adminToken && env.ADMIN_TOKEN && adminToken === env.ADMIN_TOKEN;

      if (!isAdmin && !workspace.isPublic && workspace.userId !== userId) {
        return errorResponse('Access denied', 403);
      }

      const publicationState = await getEffectiveStateString(env, workspace.id);
      const rereviewPending = await isRereviewPending(env, workspace.id);
      // Thumbnail timestamps now live in the sidecar; the inline fields on the
      // doc are legacy and may be stale, so the sidecar wins.
      const meta = await readThumbMeta(env, workspace.id, workspace);
      // Snapshots are owner-only; the count drives the editor's split
      // Snapshot button. Other viewers get no count at all.
      // A D1 failure leaves the count unknown (undefined) instead of failing
      // the workspace load.
      const snapshotCount =
        workspace.userId === userId
          ? await countSnapshotsForWorkspace(env, workspace.id).catch(() => undefined)
          : undefined;
      // The files with their text: one R2 read per .pathogen file. A
      // workspace that is just main.pathogen also gets `code`, for today's
      // playground.
      const stored = await storedFilesOf(workspace);
      return jsonResponse({
        ...withoutLegacyCode(workspace, stored.hash),
        ...(await filesWithText(env, workspace.id, stored)),
        ...meta,
        publicationState,
        rereviewPending,
        snapshotCount,
      });
    } catch (err) {
      return errorResponse('Failed to load workspace: ' + (err as Error).message, 500);
    }
  },

  // PUT /api/workspace/:id — update workspace (autosave). Dirty-checks via contentHash.
  async updateWorkspace(request: Request, env: Env, id: string): Promise<Response> {
    const userId = await getEffectiveUserId(request, env);
    if (!userId) return errorResponse('User ID required', 401);

    try {
      const wsJson = await env.WORKSPACES.get(`workspace:${id}`);
      if (!wsJson) return errorResponse('Workspace not found', 404);

      let workspace: Workspace = JSON.parse(wsJson);
      if (workspace.userId !== userId) return errorResponse('Access denied', 403);

      const body = (await request.json()) as Record<string, unknown>;
      const { name, description, isPublic, preferences, baseRev } = body as {
        name?: string;
        description?: string;
        isPublic?: boolean;
        preferences?: Record<string, unknown>;
        baseRev?: number;
      };
      // A save sends `files` (and folders, entryPoints), or today's
      // playground's one `code` string.
      const touchesFiles = body.files !== undefined || body.code !== undefined;
      let stored = await storedFilesOf(workspace);

      // isPublic transitions now flow through the moderation state machine.
      //   false → true  : submission. Push queue entry, append 'pending'
      //                    state row. workspace.isPublic stays false until
      //                    the admin approval flow flips it.
      //   true  → false : owner unpublish. Append 'unpublished' state row,
      //                    remove from public index. Approval record retained
      //                    in KV so resubmits don't lose history.
      const priorState = await getEffectiveStateString(env, id);
      const submittingForReview = isPublic === true && !workspace.isPublic && priorState !== 'pending';
      const ownerUnpublish = isPublic === false && workspace.isPublic;

      if (submittingForReview) {
        const gate = await requirePublishingFeature(request, env);
        if (gate) return gate;
      }

      const changesMetadata =
        name !== undefined || description !== undefined || preferences !== undefined || isPublic !== undefined;
      let next: typeof stored | null = null;
      if (touchesFiles) {
        const currentRev = workspace.rev ?? 0;
        const conflict = (error: string) =>
          jsonResponse({ error, conflict: true, currentRev, rev: currentRev, updatedAt: workspace.updatedAt }, 409);
        // Optimistic concurrency: when the client tells us which revision it
        // edited from, reject the write if the doc has since advanced (another
        // tab/window saved). This stops a stale tab from clobbering newer code.
        // Clients that don't send baseRev keep the old last-write-wins behavior.
        if (baseRev !== undefined && baseRev !== currentRev) {
          return conflict('Workspace was modified in another tab or window');
        }
        // New blobs are written here, before the manifest below: a failed save
        // can leave a blob nothing names, never a manifest naming a missing one.
        const change = await filesFromBody(env, id, body, stored);
        if (!change.ok) return change.status === 409 ? conflict(change.message) : errorResponse(change.message);
        // Compared in today's hash rule, also for a record from before phase
        // 2, so an unchanged save is skipped whichever shape it was stored in.
        // A save that also renames or changes preferences still does those.
        if (change.value!.hash !== stored.hash) next = change.value!;
        else if (!changesMetadata) {
          return jsonResponse({
            ...withoutLegacyCode(workspace, stored.hash),
            rev: currentRev,
            publicationState: priorState,
            skipped: true,
          });
        }
      }

      // The write re-reads the record and applies only this request's
      // changes, so neither a save that landed since the read at the top of
      // this handler nor an admin's publish or flag is reverted. (Shrinks the
      // window to the re-read→put gap; KV has no CAS, so it isn't zero — a
      // Durable Object would close it.) isPublic on the record is only flipped
      // by the approval flow (→ true) or the owner-unpublish path (→ false);
      // the submit-for-review path doesn't change it.
      const readRev = workspace.rev ?? 0;
      const updatedAt = new Date().toISOString();
      const written = await patchWorkspaceRecord(env, id, (record) => {
        if (next) {
          setFiles(record, next);
          // From whichever is newer, so a save that raced this one can't reuse
          // its rev: the other tab's next save then gets its 409.
          record.rev = Math.max(record.rev ?? 0, readRev) + 1;
        }
        if (name !== undefined) {
          record.name = name.trim();
          record.slug = slugify(name);
        }
        if (description !== undefined) record.description = description.trim();
        if (preferences !== undefined) {
          // Strip width/height — canvas dimensions live in source via define ViewBox.
          record.preferences = { ...(record.preferences || {}), ...stripDimensions(preferences) };
        }
        if (ownerUnpublish && env.USERS_DB) record.isPublic = false;
        record.updatedAt = updatedAt;
      });
      if (!written) return errorResponse('Workspace not found', 404);
      workspace = written;
      stored = next ?? (await storedFilesOf(written));

      if (ownerUnpublish && env.USERS_DB) {
        await appendState(env.USERS_DB, {
          workspaceId: id,
          state: 'unpublished',
          byUserId: userId,
          codeHash: stored.hash,
        });
        await unpublishFromIndex(env, id);
      }

      if (submittingForReview && env.USERS_DB) {
        const submittedAt = workspace.updatedAt;
        await materialize(env, id, stored);
        await pushReviewQueue(env, makeQueueEntry(workspace, stored, submittedAt));
        await appendState(env.USERS_DB, {
          workspaceId: id,
          state: 'pending',
          byUserId: userId,
          codeHash: stored.hash,
        });
      }

      // Re-review trigger: a workspace with an approval record whose
      // files now differ from that snapshot enters the re-review queue.
      // The public index keeps serving the prior snapshot, so the
      // effective state on the state machine stays 'approved' (no new row
      // appended) — queue membership alone is the signal that a re-review
      // is pending. Re-edits during re-review just refresh the queue entry;
      // pushRereviewQueue dedupes on workspaceId. The approval's hash is
      // read in today's rule, so an approval from before phase 2 still
      // matches its unedited workspace.
      if (next && !ownerUnpublish && !submittingForReview) {
        const approval = await readApproval(env, id);
        if (approval && (await readStoredFiles(approval, approval.codeHash)).hash !== stored.hash) {
          await pushRereviewQueue(env, makeQueueEntry(workspace, stored, workspace.updatedAt));
        }
      }

      const responseState = await getEffectiveStateString(env, id);
      const rereviewPending = await isRereviewPending(env, id);
      return jsonResponse({
        ...withoutLegacyCode(workspace, stored.hash),
        publicationState: responseState,
        rereviewPending,
      });
    } catch (err) {
      return errorResponse('Failed to update workspace: ' + (err as Error).message, 500);
    }
  },

  // DELETE /api/workspace/:id — owner-only delete; cascades to public index + thumbnails.
  async deleteWorkspace(request: Request, env: Env, id: string): Promise<Response> {
    const userId = await getEffectiveUserId(request, env);
    if (!userId) return errorResponse('User ID required', 401);

    try {
      const wsJson = await env.WORKSPACES.get(`workspace:${id}`);
      if (!wsJson) return errorResponse('Workspace not found', 404);

      const workspace: Workspace = JSON.parse(wsJson);
      if (workspace.userId !== userId) return errorResponse('Access denied', 403);

      // Snapshots are deleted with their workspace (docs/snapshots.md). Runs
      // first: if it throws, the workspace is left intact rather than
      // deleted with its snapshots orphaned.
      const deletedSnapshots = await deleteSnapshotsForWorkspace(env, id);

      await env.WORKSPACES.delete(`workspace:${id}`);

      const workspaceIdsJson = await env.WORKSPACES.get(`user:${userId}:workspaces`);
      const workspaceIds: string[] = workspaceIdsJson ? JSON.parse(workspaceIdsJson) : [];
      const updatedIds = workspaceIds.filter((wsId: string) => wsId !== id);
      await env.WORKSPACES.put(`user:${userId}:workspaces`, JSON.stringify(updatedIds));

      if (workspace.isPublic) {
        await removeFromPublicIndex(env, id);
      }

      // Cascade moderation state so the admin queue and the featured list
      // don't carry orphans. Approval and rejection records are dropped too
      // because they only have meaning while the workspace exists. The
      // append-only state history rows stay in D1 as an audit trail.
      await Promise.all([
        env.WORKSPACES.delete(`approval:${id}`),
        env.WORKSPACES.delete(`rejection:${id}`),
        env.THUMBNAILS.delete(`${id}/approval.svg`),
        deleteThumbMeta(env, id),
        removeFromReviewQueue(env, id),
        removeFromRereviewQueue(env, id),
        unpublishFromIndex(env, id),
        removeFromFeatured(env, id),
      ]);
      // The workspace's files, and its thumbnails (which deleting used to
      // leave behind). Last, so a failure here leaves only blobs nothing
      // names, which the sweep script removes.
      await deleteWorkspaceFiles(env, id);
      await deletePrefix(env, `${id}/`);

      return jsonResponse({ success: true, deletedSnapshots });
    } catch (err) {
      return errorResponse('Failed to delete workspace: ' + (err as Error).message, 500);
    }
  },

  // POST /api/workspace/:id/copy — duplicate a workspace into the current user's account.
  async copyWorkspace(request: Request, env: Env, id: string): Promise<Response> {
    const userId = await getEffectiveUserId(request, env);
    if (!userId) return errorResponse('User ID required', 401);

    try {
      const wsJson = await env.WORKSPACES.get(`workspace:${id}`);
      if (!wsJson) return errorResponse('Workspace not found', 404);

      const original: Workspace = JSON.parse(wsJson);
      if (!original.isPublic && original.userId !== userId) {
        return errorResponse('Access denied', 403);
      }

      const body = ((await request.json().catch(() => ({}))) as Record<string, unknown>) ?? {};
      const newName = (body.name as string) || `${original.name} (Copy)`;

      const newId = generateNanoId();
      const now = new Date().toISOString();

      // The files are copied to the new workspace's prefix: two R2 calls each
      // (a read and a write), so a copy must stay inside the request's call
      // budget. The .pathogen texts read here also answer the request. Blobs
      // are written before the record; a failure in between leaves blobs
      // nothing names, which the sweep script removes.
      const stored = await storedFilesOf(original);
      const hashes = [...new Set(Object.values(stored.manifest.files).map((f) => f.sha256))];
      if (hashes.length > COPY_MAX_FILES) {
        return errorResponse(
          `This workspace has ${hashes.length} different files; a copy can take at most ${COPY_MAX_FILES} at once.`,
          413,
        );
      }
      const textHashes = new Set(
        Object.entries(stored.manifest.files)
          .filter(([path]) => fileKind(path) === 'pathogen')
          .map(([, entry]) => entry.sha256),
      );
      const texts =
        stored.legacyText !== null
          ? new Map([[stored.manifest.files[MAIN_FILE].sha256, stored.legacyText]])
          : await readTexts(env, id, textHashes);
      await Promise.all([...texts.values()].map((text) => putText(env, newId, text)));
      await copyFiles(
        env,
        id,
        newId,
        hashes.filter((sha256) => !texts.has(sha256)),
      );
      const copied = { ...stored, legacyText: null };

      const newWorkspace: Workspace = {
        ...original,
        id: newId,
        slug: slugify(newName),
        userId,
        name: newName,
        isPublic: false,
        createdAt: now,
        updatedAt: now,
        // Fresh document — start its revision counter over.
        rev: 0,
        // Copies don't inherit R2 thumbnail blobs — reset all three timestamps so
        // the listing renders the letter fallback until the copy gets its own.
        thumbnailAt: null,
        manualThumbnailAt: null,
        autoThumbnailAt: null,
      };
      // A copy starts unflagged: the flag is a moderation decision about the original.
      delete newWorkspace.flagged;
      setFiles(newWorkspace, copied);

      await env.WORKSPACES.put(`workspace:${newId}`, JSON.stringify(newWorkspace));

      const workspaceIdsJson = await env.WORKSPACES.get(`user:${userId}:workspaces`);
      const workspaceIds: string[] = workspaceIdsJson ? JSON.parse(workspaceIdsJson) : [];
      workspaceIds.unshift(newId);
      await env.WORKSPACES.put(`user:${userId}:workspaces`, JSON.stringify(workspaceIds));

      return jsonResponse({ ...newWorkspace, ...(await filesWithText(env, newId, copied, texts)) }, 201);
    } catch (err) {
      return errorResponse('Failed to copy workspace: ' + (err as Error).message, 500);
    }
  },

  // GET /workspace/:id/file/:sha256 — one of the workspace's files, by its
  // hash (note 48 §2). The owner, anyone for a public workspace, and an
  // admin may read it. Others get 403; a hash the workspace doesn't name is
  // a 404, except for an admin, who may read a submission's or an
  // approval's files after the live workspace moved on. Content-addressed
  // bytes never change, so the browser may keep them for good.
  async getWorkspaceFile(request: Request, env: Env, id: string, sha256: string): Promise<Response> {
    try {
      if (!/^[0-9a-f]{64}$/.test(sha256)) return errorResponse('File not found', 404);
      const workspace = await readWorkspaceRecord(env, id);
      if (!workspace) return errorResponse('Workspace not found', 404);
      const userId = await getEffectiveUserId(request, env);
      const mayRead = workspace.isPublic || workspace.userId === userId;
      const admin = mayRead ? false : await isAdminRequest(request, env);
      if (!mayRead && !admin) return errorResponse('Access denied', 403);

      const stored = await storedFilesOf(workspace);
      const named = Object.values(stored.manifest.files).some((f) => f.sha256 === sha256);
      if (!named && !admin) return errorResponse('File not found', 404);
      const headers = {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'private, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
      };
      // A record from before phase 2 keeps its one text on the record.
      if (named && stored.legacyText !== null) return new Response(stored.legacyText, { headers });
      const object = await env.THUMBNAILS.get(fileKey(id, sha256));
      if (!object) return errorResponse('File not found', 404);
      return new Response(object.body, { headers });
    } catch (err) {
      return errorResponse('Failed to read file: ' + (err as Error).message, 500);
    }
  },

  // GET /api/preferences
  async getPreferences(request: Request, env: Env): Promise<Response> {
    const userId = await getEffectiveUserId(request, env);
    if (!userId) return errorResponse('User ID required', 401);

    try {
      const prefsJson = await env.WORKSPACES.get(`user:${userId}:preferences`);
      const preferences: Record<string, unknown> = prefsJson ? JSON.parse(prefsJson) : null;
      return jsonResponse(preferences || {});
    } catch (err) {
      return errorResponse('Failed to get preferences: ' + (err as Error).message, 500);
    }
  },

  // PUT /api/preferences
  async savePreferences(request: Request, env: Env): Promise<Response> {
    const userId = await getEffectiveUserId(request, env);
    if (!userId) return errorResponse('User ID required', 401);

    try {
      const preferences = (await request.json()) as Record<string, unknown>;
      const sanitized = stripDimensions(preferences);
      await env.WORKSPACES.put(`user:${userId}:preferences`, JSON.stringify(sanitized));
      return jsonResponse(sanitized);
    } catch (err) {
      return errorResponse('Failed to save preferences: ' + (err as Error).message, 500);
    }
  },

  // PUT /api/workspace/:id/thumbnail?kind=manual|auto|hero — upload thumbnails via
  // FormData. kind=manual (default) writes three square sizes to ${id}/manual-${size}.png
  // and takes precedence on read. kind=auto writes the same sizes to ${id}/${size}.png
  // (legacy key) — these are the ones the idle/beforeunload timer produces; the two
  // square layers coexist and clearing the manual layer reveals the auto one. kind=hero
  // writes a single uncropped, source-aspect-ratio image to ${id}/hero.png used only by
  // the workspace detail page (GET /thumbnail/:id/hero), so non-square artwork is not
  // clipped there the way the square card thumbnails are.
  async uploadThumbnail(request: Request, env: Env, id: string): Promise<Response> {
    const userId = await getEffectiveUserId(request, env);
    const url = new URL(request.url);
    const adminToken = url.searchParams.get('token');
    // Cheap admin signal: the legacy ?token= param. The session-admin path
    // (isAdminRequest does D1 lookups) is consulted lazily below — only when the
    // caller isn't the owner — so frequent owner auto-uploads pay no extra cost.
    // Session-admin is what lets the /admin/moderation "Regenerate" action
    // upload thumbnails for a workspace it doesn't own.
    const tokenAdmin = !!adminToken && !!env.ADMIN_TOKEN && adminToken === env.ADMIN_TOKEN;
    const rawKind = url.searchParams.get('kind');
    const kind = rawKind === 'auto' ? 'auto' : rawKind === 'hero' ? 'hero' : 'manual';

    if (!userId && !tokenAdmin && !(await isAdminRequest(request, env))) {
      return errorResponse('User ID required', 401);
    }

    try {
      const wsJson = await env.WORKSPACES.get(`workspace:${id}`);
      if (!wsJson) return errorResponse('Workspace not found', 404);
      const workspace: Workspace = JSON.parse(wsJson);
      // Owners pass directly; non-owners need admin. Only here — after the
      // cheaper checks miss — do we pay for the session-admin D1 lookup.
      if (workspace.userId !== userId) {
        const isAdmin = tokenAdmin || (await isAdminRequest(request, env));
        if (!isAdmin) return errorResponse('Access denied', 403);
      }

      const formData = await request.formData();

      // Hero: a single uncropped image. No metadata is stamped — its presence is
      // detected at read time (GET /thumbnail/:id/hero falls back to the square 1024
      // when absent), and the square upload that runs alongside it already stamps the
      // timestamps. Pure R2 write, so it never clobbers the square layers' meta.
      if (kind === 'hero') {
        const file = formData.get('hero') as File | null;
        if (!file) return errorResponse('Missing hero image', 400);
        await env.THUMBNAILS.put(`${id}/hero.png`, file.stream(), {
          httpMetadata: { contentType: 'image/png' },
        });
        return jsonResponse({ success: true });
      }

      const sizes = ['1024', '512', '256'];

      for (const size of sizes) {
        const file = formData.get(size) as File | null;
        if (!file) return errorResponse(`Missing ${size} thumbnail`, 400);
        const key = kind === 'manual' ? `${id}/manual-${size}.png` : `${id}/${size}.png`;
        await env.THUMBNAILS.put(key, file.stream(), {
          httpMetadata: { contentType: 'image/png' },
        });
      }

      // Stamp the timestamps in the sidecar only — never write `workspace:${id}`
      // here, or this thumbnail upload would clobber any code save that landed
      // since we read the doc above (the auth read is read-only and safe).
      const meta = await readThumbMeta(env, id, workspace);
      const now = new Date().toISOString();
      if (kind === 'manual') {
        meta.manualThumbnailAt = now;
      } else {
        meta.autoThumbnailAt = now;
      }
      meta.thumbnailAt = now;
      await writeThumbMeta(env, id, meta);

      return jsonResponse({
        thumbnailAt: meta.thumbnailAt,
        manualThumbnailAt: meta.manualThumbnailAt || null,
        autoThumbnailAt: meta.autoThumbnailAt || null,
      });
    } catch (err) {
      return errorResponse('Failed to upload thumbnail: ' + (err as Error).message, 500);
    }
  },

  // GET /api/thumbnail/:id/:size — public read from R2. Manual (if present) takes
  // precedence over the auto/legacy layer. Existing workspaces (uploaded before the
  // manual/auto split) live at ${id}/${size}.png and fall through automatically.
  async getThumbnail(_request: Request, env: Env, id: string, size: string): Promise<Response> {
    try {
      let object = await env.THUMBNAILS.get(`${id}/manual-${size}.png`);
      if (!object) object = await env.THUMBNAILS.get(`${id}/${size}.png`);
      if (!object) return errorResponse('Thumbnail not found', 404);

      return new Response(object.body, {
        headers: {
          'Content-Type': 'image/png',
          'Cache-Control': 'public, max-age=3600',
        },
      });
    } catch (err) {
      return errorResponse('Failed to get thumbnail: ' + (err as Error).message, 500);
    }
  },

  // GET /api/thumbnail/:id/hero — public read of the uncropped, source-aspect-ratio
  // hero image used by the workspace detail page. Falls back to the square 1024
  // (manual, then auto/legacy) when no hero exists, so workspaces approved before
  // hero generation — or any without one yet — still return their square thumbnail
  // through this URL rather than 404-ing.
  async getThumbnailHero(_request: Request, env: Env, id: string): Promise<Response> {
    try {
      let object = await env.THUMBNAILS.get(`${id}/hero.png`);
      if (!object) object = await env.THUMBNAILS.get(`${id}/manual-1024.png`);
      if (!object) object = await env.THUMBNAILS.get(`${id}/1024.png`);
      if (!object) return errorResponse('Thumbnail not found', 404);

      return new Response(object.body, {
        headers: {
          'Content-Type': 'image/png',
          'Cache-Control': 'public, max-age=3600',
        },
      });
    } catch (err) {
      return errorResponse('Failed to get hero thumbnail: ' + (err as Error).message, 500);
    }
  },

  // GET /api/approval-svg/:id — public read of the admin-captured approval
  // SVG from R2. The detail page references this URL (the Pages worker has
  // no R2 binding) when an approval carries approvalSvgAt. Guarded the same
  // way the detail page guards visitors: 404 unless the workspace is public
  // and not flagged, so unpublished/flagged work doesn't leak its preview.
  async getApprovalSvg(_request: Request, env: Env, id: string): Promise<Response> {
    try {
      const wsJson = await env.WORKSPACES.get(`workspace:${id}`);
      if (!wsJson) return errorResponse('Workspace not found', 404);
      const workspace: Workspace & { flagged?: boolean } = JSON.parse(wsJson);
      if (!workspace.isPublic || workspace.flagged) {
        return errorResponse('Workspace not available', 404);
      }

      const object = await env.THUMBNAILS.get(`${id}/approval.svg`);
      if (!object) return errorResponse('Approval SVG not found', 404);

      return new Response(object.body, {
        headers: {
          'Content-Type': 'image/svg+xml',
          'Cache-Control': 'public, max-age=3600',
          // Defense-in-depth: this is user-derived SVG served from the API
          // origin (where .pathogen.studio cookies are readable) and may be
          // opened directly. The compiler already sanitizes, but block script
          // execution at the transport layer too. script-src 'none' (not
          // default-src 'none') so inline <style>/presentation still render.
          'Content-Security-Policy': "script-src 'none'",
        },
      });
    } catch (err) {
      return errorResponse('Failed to get approval SVG: ' + (err as Error).message, 500);
    }
  },

  // DELETE /api/workspace/:id/thumbnail?kind=manual|auto|all
  // kind=manual (default) removes the manual layer only, revealing the auto layer
  // if one exists. kind=auto removes the auto/legacy layer. kind=all removes both
  // square layers plus the hero image.
  async deleteThumbnail(request: Request, env: Env, id: string): Promise<Response> {
    const userId = await getEffectiveUserId(request, env);
    if (!userId) return errorResponse('User ID required', 401);

    const url = new URL(request.url);
    const rawKind = url.searchParams.get('kind');
    const kind: 'manual' | 'auto' | 'all' = rawKind === 'auto' ? 'auto' : rawKind === 'all' ? 'all' : 'manual';

    try {
      const wsJson = await env.WORKSPACES.get(`workspace:${id}`);
      if (!wsJson) return errorResponse('Workspace not found', 404);
      const workspace: Workspace = JSON.parse(wsJson);
      if (workspace.userId !== userId) return errorResponse('Access denied', 403);

      const meta = await readThumbMeta(env, id, workspace);
      const sizes = ['1024', '512', '256'];
      const deletes: Promise<void>[] = [];
      if (kind === 'manual' || kind === 'all') {
        for (const s of sizes) deletes.push(env.THUMBNAILS.delete(`${id}/manual-${s}.png`));
        meta.manualThumbnailAt = null;
      }
      if (kind === 'auto' || kind === 'all') {
        for (const s of sizes) deletes.push(env.THUMBNAILS.delete(`${id}/${s}.png`));
        meta.autoThumbnailAt = null;
      }
      if (kind === 'all') {
        deletes.push(env.THUMBNAILS.delete(`${id}/hero.png`));
      }
      await Promise.all(deletes);

      // Pre-split workspaces have a legacy thumbnail at ${id}/${size}.png but
      // null autoThumbnailAt in KV (the field didn't exist when they were uploaded).
      // If we just removed the manual layer and the metadata claims no auto
      // exists, probe R2 directly — if the legacy blob is there, surface it so
      // the frontend toast and the listing card stay honest about what GET
      // will return.
      if (kind === 'manual' && !meta.autoThumbnailAt) {
        const legacy = await env.THUMBNAILS.get(`${id}/256.png`);
        if (legacy) meta.autoThumbnailAt = new Date().toISOString();
      }

      // thumbnailAt is now whichever layer still has data, or null if none.
      // Sidecar-only write — never touch `workspace:${id}` from a thumbnail path.
      meta.thumbnailAt = meta.manualThumbnailAt || meta.autoThumbnailAt || null;
      await writeThumbMeta(env, id, meta);

      return jsonResponse({
        success: true,
        thumbnailAt: meta.thumbnailAt,
        manualThumbnailAt: meta.manualThumbnailAt || null,
        autoThumbnailAt: meta.autoThumbnailAt || null,
      });
    } catch (err) {
      return errorResponse('Failed to delete thumbnail: ' + (err as Error).message, 500);
    }
  },

  // POST /workspace/:id/submit-for-review — owner-only, Publishing-gate.
  // Freezes the current code into a queue entry and appends a 'pending'
  // state row. Repeated calls overwrite the queue entry (re-submission).
  async submitWorkspaceForReview(request: Request, env: Env, id: string): Promise<Response> {
    const userId = await getEffectiveUserId(request, env);
    if (!userId) return errorResponse('User ID required', 401);

    try {
      const wsJson = await env.WORKSPACES.get(`workspace:${id}`);
      if (!wsJson) return errorResponse('Workspace not found', 404);
      const workspace: Workspace = JSON.parse(wsJson);
      if (workspace.userId !== userId) return errorResponse('Access denied', 403);

      const gate = await requirePublishingFeature(request, env);
      if (gate) return gate;

      if (!env.USERS_DB) return errorResponse('Moderation DB unavailable', 500);

      // Reject empty submissions. An admin can't meaningfully approve a
      // workspace whose main program is empty (or that has none), and a
      // blank preview in the moderation UI would be the only signal
      // something was off.
      const stored = await storedFilesOf(workspace);
      const main = await mainText(env, id, stored);
      if (!main || !main.trim()) {
        return errorResponse('Workspace has no code to review', 400);
      }

      const submittedAt = new Date().toISOString();
      await materialize(env, id, stored);
      await pushReviewQueue(env, makeQueueEntry(workspace, stored, submittedAt));
      await appendState(env.USERS_DB, {
        workspaceId: id,
        state: 'pending',
        byUserId: userId,
        codeHash: stored.hash,
      });

      const publicationState = await getEffectiveStateString(env, id);
      return jsonResponse({ ok: true, publicationState, submittedAt });
    } catch (err) {
      return errorResponse('Failed to submit workspace: ' + (err as Error).message, 500);
    }
  },

  // GET /admin/queue/review — admin-only. Returns frozen queue entries so
  // the moderation UI renders exactly what the owner submitted.
  async adminListReviewQueue(request: Request, env: Env): Promise<Response> {
    if (!(await isAdminRequest(request, env))) return errorResponse('Unauthorized', 401);
    try {
      const entries = await listReviewQueue(env);
      // Resolve owner handles for display. Failures are swallowed (entry
      // appears with userId only).
      const enriched = await Promise.all(
        entries.map(async (e) => {
          let handle: string | null = null;
          let displayName: string | null = null;
          if (env.USERS_DB) {
            try {
              const user = await findUserById(env.USERS_DB, e.userId);
              if (user) {
                handle = user.handle;
                displayName = user.display_name;
              }
            } catch {
              /* leave null */
            }
          }
          return { ...e, ownerHandle: handle, ownerDisplayName: displayName };
        }),
      );
      return jsonResponse({ entries: enriched });
    } catch (err) {
      return errorResponse('Failed to read review queue: ' + (err as Error).message, 500);
    }
  },

  // POST /admin/review/:id — admin-only. Body: { decision: 'approve'|'reject',
  // feature?: bool, internalNotes?: string }.
  async adminReviewDecision(request: Request, env: Env, id: string): Promise<Response> {
    if (!(await isAdminRequest(request, env))) return errorResponse('Unauthorized', 401);
    if (!env.USERS_DB) return errorResponse('Moderation DB unavailable', 500);
    let body: {
      decision?: unknown;
      feature?: unknown;
      internalNotes?: unknown;
      svg?: unknown;
    };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return errorResponse('Invalid JSON body', 400);
    }
    const decision = typeof body.decision === 'string' ? body.decision : '';
    if (decision !== 'approve' && decision !== 'reject') {
      return errorResponse("decision must be 'approve' or 'reject'", 400);
    }
    const feature = decision === 'approve' && Boolean(body.feature);
    const internalNotes = typeof body.internalNotes === 'string' ? body.internalNotes : '';
    // Optional admin-captured SVG snapshot. Stored in R2 (no KV size cap)
    // so large workspaces keep their inline preview. A 12 MB sanity ceiling
    // rejects only truly pathological payloads; anything within it is kept.
    const SVG_MAX_BYTES = 12 * 1024 * 1024;
    const rawSvg = typeof body.svg === 'string' ? body.svg : null;
    const svg = rawSvg && rawSvg.length <= SVG_MAX_BYTES ? rawSvg : null;

    try {
      // Resolve the acting admin's user id for audit attribution. If the
      // request is token-gated (no session), we attribute to the admin
      // token literal so the row is still distinguishable.
      let adminUserId = 'admin-token';
      const token = readSessionTokenFromRequest(request);
      if (token && env.USERS_DB) {
        try {
          const sessionUserId = await getSessionUserId(env.USERS_DB, token);
          if (sessionUserId) adminUserId = sessionUserId;
        } catch {
          /* keep token literal */
        }
      }

      // A workspace may be in either the first-review or re-review queue.
      // The decision flow is the same for both — approve writes a fresh
      // approval record, reject preserves the prior one (re-review fail
      // doesn't unpublish; admin must explicitly flag or owner must
      // unpublish to remove from /explore).
      const queueEntry = (await getReviewQueueEntry(env, id)) || (await getRereviewQueueEntry(env, id));
      if (!queueEntry) return errorResponse('No pending submission for this workspace', 404);
      // The submitted files, in today's hash rule (an entry from before
      // phase 2 carries `code`, read as just main.pathogen).
      const submitted = await readStoredFiles(queueEntry, queueEntry.codeHash);

      const wsJson = await env.WORKSPACES.get(`workspace:${id}`);
      if (!wsJson) return errorResponse('Workspace not found', 404);
      const workspace: Workspace = JSON.parse(wsJson);

      if (decision === 'reject') {
        const rejection: WorkspaceRejection = {
          workspaceId: id,
          rejectedAt: new Date().toISOString(),
          rejectedByUserId: adminUserId,
          internalNotes,
        };
        await writeRejection(env, rejection);
        await appendState(env.USERS_DB, {
          workspaceId: id,
          state: 'rejected',
          byUserId: adminUserId,
          codeHash: submitted.hash,
          internalNotes: internalNotes || null,
        });
        await removeFromReviewQueue(env, id);
        await removeFromRereviewQueue(env, id);
        return jsonResponse({ ok: true, decision: 'reject' });
      }

      // Approve. Pick a unique slug, freeze the snapshot from the queue
      // entry, write the approval record, flip the workspace public flag
      // so listing pages can read it directly, append the state row, and
      // add to the public index. Optionally feature.
      const uniqueSlug = await pickUniqueSlugForUser(env, queueEntry.userId, queueEntry.slug, id);
      // Freeze the owner's handle at approval time so /u/<handle>/<slug>
      // URLs stay stable even if the user later renames themselves.
      let ownerHandle: string | undefined;
      try {
        const owner = await findUserById(env.USERS_DB, queueEntry.userId);
        if (owner) ownerHandle = owner.handle;
      } catch {
        /* leave undefined; approval record degrades to legacy shape */
      }
      const approvalMeta = await readThumbMeta(env, id, workspace);
      // Persist the admin-captured SVG to R2 (no size cap) rather than
      // inlining it in the KV approval record. Stamp approvalSvgAt so the
      // detail page knows to reference it by URL via GET /approval-svg/:id.
      let approvalSvgAt: string | null = null;
      if (svg) {
        await env.THUMBNAILS.put(`${id}/approval.svg`, svg, {
          httpMetadata: { contentType: 'image/svg+xml' },
        });
        approvalSvgAt = new Date().toISOString();
      }
      // The approval freezes the submitted manifest; its blobs stay under the
      // workspace, since saves never delete. An entry from before phase 2 has
      // its text written to R2 first.
      await materialize(env, id, submitted);
      const approval: WorkspaceApproval = {
        workspaceId: id,
        userId: queueEntry.userId,
        files: submitted.manifest.files,
        folders: submitted.manifest.folders,
        entryPoints: submitted.manifest.entryPoints,
        codeHash: submitted.hash,
        slug: uniqueSlug,
        name: queueEntry.name,
        description: queueEntry.description,
        manualThumbnailAt: approvalMeta.manualThumbnailAt,
        autoThumbnailAt: approvalMeta.autoThumbnailAt,
        approvedAt: new Date().toISOString(),
        approvedByUserId: adminUserId,
        featuredAt: feature ? new Date().toISOString() : null,
        ...(ownerHandle ? { ownerHandle } : {}),
        ...(approvalSvgAt ? { approvalSvgAt } : {}),
      };
      await writeApproval(env, approval);

      // Re-read before writing, so a save that landed during the review isn't reverted.
      const published =
        (await patchWorkspaceRecord(env, id, (record) => {
          record.isPublic = true;
        })) ?? workspace;

      await appendState(env.USERS_DB, {
        workspaceId: id,
        state: 'approved',
        byUserId: adminUserId,
        codeHash: submitted.hash,
      });

      await publishApprovalToIndex(env, approval, published);
      if (feature) {
        await addToFeatured(env, id);
      }
      await removeFromReviewQueue(env, id);
      await removeFromRereviewQueue(env, id);

      return jsonResponse({ ok: true, decision: 'approve', feature, slug: uniqueSlug });
    } catch (err) {
      return errorResponse('Failed to record decision: ' + (err as Error).message, 500);
    }
  },

  // GET /admin/queue/rereview — admin-only.
  async adminListRereviewQueue(request: Request, env: Env): Promise<Response> {
    if (!(await isAdminRequest(request, env))) return errorResponse('Unauthorized', 401);
    try {
      const entries = await listRereviewQueue(env);
      const enriched = await resolveQueueOwners(env, entries);
      return jsonResponse({ entries: enriched });
    } catch (err) {
      return errorResponse('Failed to read re-review queue: ' + (err as Error).message, 500);
    }
  },

  // GET /admin/approval/:id — admin-only. Returns the frozen approval
  // record (code, svg, slug, ownerHandle, …) so the moderation UI can
  // open the review modal against the moderated snapshot rather than
  // the live workspace. Legacy approvals without `svg` still expose
  // `code` for client-side compile.
  async adminGetApproval(request: Request, env: Env, id: string): Promise<Response> {
    if (!(await isAdminRequest(request, env))) return errorResponse('Unauthorized', 401);
    try {
      const approval = await readApproval(env, id);
      if (!approval) return errorResponse('No approval record', 404);
      return jsonResponse(approval);
    } catch (err) {
      return errorResponse('Failed to load approval: ' + (err as Error).message, 500);
    }
  },

  // PUT /admin/approval/:id/svg — admin-only. Backfills the rendered SVG on
  // an existing approval record. Used by the moderation modal to silently
  // refresh the rendered SVG for legacy approvals (pre-Phase-4) that don't
  // have one. Stores the SVG in R2 (no KV size cap) and stamps
  // approvalSvgAt; same 12 MB sanity ceiling as the approve endpoint.
  async adminPutApprovalSvg(request: Request, env: Env, id: string): Promise<Response> {
    if (!(await isAdminRequest(request, env))) return errorResponse('Unauthorized', 401);
    try {
      let body: { svg?: unknown };
      try {
        body = (await request.json()) as typeof body;
      } catch {
        return errorResponse('Invalid JSON body', 400);
      }
      const raw = typeof body.svg === 'string' ? body.svg : null;
      const SVG_MAX_BYTES = 12 * 1024 * 1024;
      if (!raw || raw.length > SVG_MAX_BYTES) {
        return errorResponse('SVG payload missing or oversized', 400);
      }
      const approval = await readApproval(env, id);
      if (!approval) return errorResponse('No approval record', 404);
      await env.THUMBNAILS.put(`${id}/approval.svg`, raw, {
        httpMetadata: { contentType: 'image/svg+xml' },
      });
      approval.approvalSvgAt = new Date().toISOString();
      // Make R2 the single source of truth. A legacy approval may still
      // carry an inline `svg`; the detail page checks that field first, so
      // leaving it would render the stale inline copy instead of the fresh
      // R2 one. Drop it so the freshly-stored SVG is what visitors see.
      delete approval.svg;
      await writeApproval(env, approval);
      return jsonResponse({ ok: true });
    } catch (err) {
      return errorResponse('Failed to update approval svg: ' + (err as Error).message, 500);
    }
  },

  // GET /admin/queue/approved — admin-only. Lists the catalog of approved
  // workspaces (frozen snapshots from KV) so the admin UI can render them
  // alongside the pending/re-review queues.
  async adminListApproved(request: Request, env: Env): Promise<Response> {
    if (!(await isAdminRequest(request, env))) return errorResponse('Unauthorized', 401);
    try {
      const approvals = await listAllApprovals(env);
      // Newest-first by approvedAt.
      approvals.sort((a, b) => ((b.approvedAt || '') > (a.approvedAt || '') ? 1 : -1));
      // Approved tab = currently public AND not featured AND not
      // workspace-flagged. Featured workspaces appear on their own tab
      // (disjoint sets — cleaner action buttons per the simplification
      // spec). Admin-unpublished workspaces don't appear here either;
      // their approval record is retained for restoration.
      const entries = (
        await Promise.all(
          approvals.map(async (a) => {
            let thumbnailAt: string | null = null;
            let isPublic = false;
            let flagged = false;
            try {
              const wsRaw = await env.WORKSPACES.get(`workspace:${a.workspaceId}`);
              if (wsRaw) {
                const ws = JSON.parse(wsRaw) as Workspace & { flagged?: boolean };
                thumbnailAt = (await readThumbMeta(env, a.workspaceId, ws)).thumbnailAt;
                isPublic = Boolean(ws.isPublic);
                flagged = Boolean(ws.flagged);
              }
            } catch {
              /* leave defaults */
            }
            if (!isPublic || flagged) return null;
            if (a.featuredAt) return null; // Featured tab shows these
            const ownerFlagged = await resolveOwnerFlagged(env, a.userId);
            return {
              workspaceId: a.workspaceId,
              userId: a.userId,
              name: a.name,
              description: a.description,
              slug: a.slug,
              ownerHandle: a.ownerHandle ?? null,
              ownerFlagged,
              codeHash: a.codeHash,
              approvedAt: a.approvedAt,
              featuredAt: a.featuredAt ?? null,
              thumbnailAt,
              // A preview SVG exists if it's inline (legacy KV) OR in R2 (current).
              hasSvg: Boolean(a.svg || a.approvalSvgAt),
            };
          }),
        )
      ).filter(Boolean);
      return jsonResponse({ entries });
    } catch (err) {
      return errorResponse('Failed to read approved list: ' + (err as Error).message, 500);
    }
  },

  // GET /admin/queue/featured — admin-only. Lists workspaces currently on
  // the featured list, hydrated from their approval records.
  async adminListFeatured(request: Request, env: Env): Promise<Response> {
    if (!(await isAdminRequest(request, env))) return errorResponse('Unauthorized', 401);
    try {
      const ids = await listFeaturedIds(env);
      const entries = await Promise.all(
        ids.map(async (id) => {
          const approval = await readApproval(env, id);
          if (!approval) return null;
          let thumbnailAt: string | null = null;
          try {
            const wsRaw = await env.WORKSPACES.get(`workspace:${id}`);
            if (wsRaw) {
              const ws = JSON.parse(wsRaw) as Workspace;
              thumbnailAt = (await readThumbMeta(env, id, ws)).thumbnailAt;
            }
          } catch {
            /* leave null */
          }
          const ownerFlagged = await resolveOwnerFlagged(env, approval.userId);
          return {
            workspaceId: id,
            userId: approval.userId,
            name: approval.name,
            description: approval.description,
            slug: approval.slug,
            ownerHandle: approval.ownerHandle ?? null,
            ownerFlagged,
            codeHash: approval.codeHash,
            // Featured cards render an "approved <date>" meta line (FeaturedEntry
            // extends ApprovedEntry); without approvedAt it showed "Invalid Date".
            approvedAt: approval.approvedAt,
            featuredAt: approval.featuredAt,
            thumbnailAt,
            // A preview SVG exists if it's inline (legacy KV) OR in R2 (current).
            hasSvg: Boolean(approval.svg || approval.approvalSvgAt),
          };
        }),
      );
      return jsonResponse({ entries: entries.filter(Boolean) });
    } catch (err) {
      return errorResponse('Failed to read featured list: ' + (err as Error).message, 500);
    }
  },

  // GET /admin/queue/rejected — admin-only. Lists rejection records with
  // internal notes (admin-only field; never returned to owners).
  async adminListRejected(request: Request, env: Env): Promise<Response> {
    if (!(await isAdminRequest(request, env))) return errorResponse('Unauthorized', 401);
    try {
      const rejections = await listAllRejections(env);
      rejections.sort((a, b) => ((b.rejectedAt || '') > (a.rejectedAt || '') ? 1 : -1));
      const entries = await Promise.all(
        rejections.map(async (r) => {
          let name: string | null = null;
          let ownerHandle: string | null = null;
          let userId: string | null = null;
          let thumbnailAt: string | null = null;
          let codeHash: string | null = null;
          let workspaceFlagged = false;
          let ownerFlagged = false;
          try {
            const wsRaw = await env.WORKSPACES.get(`workspace:${r.workspaceId}`);
            if (wsRaw) {
              const ws = JSON.parse(wsRaw) as Workspace & { flagged?: boolean };
              name = ws.name;
              userId = ws.userId;
              thumbnailAt = (await readThumbMeta(env, r.workspaceId, ws)).thumbnailAt;
              codeHash = ws.contentHash;
              workspaceFlagged = Boolean(ws.flagged);
            }
            if (env.USERS_DB && userId) {
              const user = await findUserById(env.USERS_DB, userId);
              if (user) {
                ownerHandle = user.handle;
                ownerFlagged = Boolean(user.flagged);
              }
            }
          } catch {
            /* leave defaults */
          }
          // Rejected tab shouldn't list workspaces that are CURRENTLY
          // flagged — those belong in Flagged workspaces.
          if (workspaceFlagged) return null;
          return {
            workspaceId: r.workspaceId,
            userId,
            name,
            ownerHandle,
            ownerFlagged,
            thumbnailAt,
            codeHash,
            rejectedAt: r.rejectedAt,
            internalNotes: r.internalNotes,
          };
        }),
      );
      return jsonResponse({ entries: entries.filter(Boolean) });
    } catch (err) {
      return errorResponse('Failed to read rejected list: ' + (err as Error).message, 500);
    }
  },

  // GET /admin/queue/flagged-workspaces — admin-only. Returns workspace
  // listings (id, name, owner handle, hash) for the flagged queue.
  async adminListFlaggedWorkspaces(request: Request, env: Env): Promise<Response> {
    if (!(await isAdminRequest(request, env))) return errorResponse('Unauthorized', 401);
    try {
      const ids = await listFlaggedWorkspaces(env);
      const entries = [];
      for (const wsId of ids) {
        const wsJson = await env.WORKSPACES.get(`workspace:${wsId}`);
        if (!wsJson) continue;
        const ws: Workspace = JSON.parse(wsJson);
        let handle: string | null = null;
        let ownerFlagged = false;
        if (env.USERS_DB) {
          try {
            const user = await findUserById(env.USERS_DB, ws.userId);
            if (user) {
              handle = user.handle;
              ownerFlagged = Boolean(user.flagged);
            }
          } catch {
            /* leave defaults */
          }
        }
        entries.push({
          workspaceId: wsId,
          name: ws.name,
          codeHash: ws.contentHash,
          ownerHandle: handle,
          ownerUserId: ws.userId,
          ownerFlagged,
          thumbnailAt: (await readThumbMeta(env, wsId, ws)).thumbnailAt,
        });
      }
      return jsonResponse({ entries });
    } catch (err) {
      return errorResponse('Failed to read flagged workspaces: ' + (err as Error).message, 500);
    }
  },

  // GET /admin/queue/flagged-users — admin-only.
  async adminListFlaggedUsers(request: Request, env: Env): Promise<Response> {
    if (!(await isAdminRequest(request, env))) return errorResponse('Unauthorized', 401);
    try {
      const ids = await listFlaggedUsers(env);
      const entries = [];
      if (env.USERS_DB) {
        for (const uid of ids) {
          try {
            const user = await findUserById(env.USERS_DB, uid);
            if (user) {
              entries.push({
                userId: uid,
                handle: user.handle,
                displayName: user.display_name,
                flagNotes: user.flag_notes ?? null,
              });
            }
          } catch {
            /* skip */
          }
        }
      }
      return jsonResponse({ entries });
    } catch (err) {
      return errorResponse('Failed to read flagged users: ' + (err as Error).message, 500);
    }
  },

  // POST /admin/unpublish/:id — admin force-unpublish. Removes from the
  // public + featured indexes and appends an 'unpublished' state row, but
  // retains the approval record so the action is reversible (admin or
  // owner can re-submit).
  async adminUnpublish(request: Request, env: Env, id: string): Promise<Response> {
    if (!(await isAdminRequest(request, env))) return errorResponse('Unauthorized', 401);
    if (!env.USERS_DB) return errorResponse('Moderation DB unavailable', 500);
    try {
      const workspace = await patchWorkspaceRecord(env, id, (record) => {
        record.isPublic = false;
      });
      if (!workspace) return errorResponse('Workspace not found', 404);
      await unpublishFromIndex(env, id);
      await removeFromFeatured(env, id);
      const adminId = await resolveAdminUserId(request, env);
      await appendState(env.USERS_DB, {
        workspaceId: id,
        state: 'unpublished',
        byUserId: adminId,
        codeHash: (await storedFilesOf(workspace)).hash,
        internalNotes: 'admin unpublish',
      });
      return jsonResponse({ ok: true, isPublic: false });
    } catch (err) {
      return errorResponse('Failed to unpublish: ' + (err as Error).message, 500);
    }
  },

  // POST /admin/feature/:id — add an approved workspace to the featured
  // list and stamp featuredAt on the approval record.
  async adminFeature(request: Request, env: Env, id: string): Promise<Response> {
    if (!(await isAdminRequest(request, env))) return errorResponse('Unauthorized', 401);
    try {
      const approval = await readApproval(env, id);
      if (!approval) return errorResponse('Workspace is not approved', 404);
      approval.featuredAt = new Date().toISOString();
      await writeApproval(env, approval);
      await addToFeatured(env, id);
      return jsonResponse({ ok: true, featured: true, featuredAt: approval.featuredAt });
    } catch (err) {
      return errorResponse('Failed to feature: ' + (err as Error).message, 500);
    }
  },

  // DELETE /admin/feature/:id — remove from featured, keep approved.
  async adminUnfeature(request: Request, env: Env, id: string): Promise<Response> {
    if (!(await isAdminRequest(request, env))) return errorResponse('Unauthorized', 401);
    try {
      const approval = await readApproval(env, id);
      if (approval) {
        approval.featuredAt = null;
        await writeApproval(env, approval);
      }
      await removeFromFeatured(env, id);
      return jsonResponse({ ok: true, featured: false });
    } catch (err) {
      return errorResponse('Failed to unfeature: ' + (err as Error).message, 500);
    }
  },

  // POST /admin/flag-workspace/:id — flag a workspace. Drops it from the
  // public + featured indexes; the approval record is retained so unflag
  // restores the prior public state. Optional body: { internalNotes }.
  async adminFlagWorkspace(request: Request, env: Env, id: string): Promise<Response> {
    if (!(await isAdminRequest(request, env))) return errorResponse('Unauthorized', 401);
    if (!env.USERS_DB) return errorResponse('Moderation DB unavailable', 500);
    try {
      let body: { internalNotes?: unknown } = {};
      try {
        body = (await request.json()) as typeof body;
      } catch {
        /* no body is fine */
      }
      const notes = typeof body.internalNotes === 'string' ? body.internalNotes : '';

      const workspace = await patchWorkspaceRecord(env, id, (record) => {
        record.flagged = true;
        record.isPublic = false;
      });
      if (!workspace) return errorResponse('Workspace not found', 404);
      await addToFlaggedWorkspaces(env, id);
      await unpublishFromIndex(env, id);
      await removeFromFeatured(env, id);
      const adminId = await resolveAdminUserId(request, env);
      await appendState(env.USERS_DB, {
        workspaceId: id,
        state: 'flagged',
        byUserId: adminId,
        codeHash: (await storedFilesOf(workspace)).hash,
        internalNotes: notes || null,
      });
      return jsonResponse({ ok: true, flagged: true });
    } catch (err) {
      return errorResponse('Failed to flag workspace: ' + (err as Error).message, 500);
    }
  },

  // DELETE /admin/flag-workspace/:id — clear the flag and (if an approval
  // record still exists) re-publish to the public index.
  async adminUnflagWorkspace(request: Request, env: Env, id: string): Promise<Response> {
    if (!(await isAdminRequest(request, env))) return errorResponse('Unauthorized', 401);
    if (!env.USERS_DB) return errorResponse('Moderation DB unavailable', 500);
    try {
      const workspace = await patchWorkspaceRecord(env, id, (record) => {
        record.flagged = false;
        record.isPublic = false;
      });
      if (!workspace) return errorResponse('Workspace not found', 404);
      await removeFromFlaggedWorkspaces(env, id);
      // Defense-in-depth: ensure no stale public/featured entries.
      await unpublishFromIndex(env, id);
      await removeFromFeatured(env, id);
      // Per the simplified action spec, unflagging a workspace transitions
      // it to the Rejected tab — admin has to send it through Pending
      // review again before it can re-enter the approved catalog. Write
      // a rejection record (carries internal notes) and append a
      // 'rejected' state row so the Rejected listing surfaces it.
      const adminId = await resolveAdminUserId(request, env);
      const rejectedAt = new Date().toISOString();
      await writeRejection(env, {
        workspaceId: id,
        rejectedAt,
        rejectedByUserId: adminId,
        internalNotes: 'Unflagged from flagged-workspaces queue.',
      });
      await appendState(env.USERS_DB, {
        workspaceId: id,
        state: 'rejected',
        byUserId: adminId,
        codeHash: (await storedFilesOf(workspace)).hash,
        internalNotes: 'unflagged → rejected',
      });
      return jsonResponse({ ok: true, flagged: false });
    } catch (err) {
      return errorResponse('Failed to unflag workspace: ' + (err as Error).message, 500);
    }
  },

  // POST /admin/requeue/:id — admin sends a workspace back into the
  // pending-review queue. Used from the Approved and Rejected tabs.
  // Pushes a queue:review entry with the current workspace code as the
  // frozen snapshot, appends a 'pending' state row, and removes the
  // workspace from public + featured indexes so visitors don't see it
  // while it's under review again.
  async adminRequeue(request: Request, env: Env, id: string): Promise<Response> {
    if (!(await isAdminRequest(request, env))) return errorResponse('Unauthorized', 401);
    if (!env.USERS_DB) return errorResponse('Moderation DB unavailable', 500);
    try {
      const current = await readWorkspaceRecord(env, id);
      if (!current) return errorResponse('Workspace not found', 404);
      const main = await mainText(env, id, await storedFilesOf(current));
      if (!main || !main.trim()) {
        return errorResponse('Workspace has no code to re-review', 400);
      }
      const workspace = await patchWorkspaceRecord(env, id, (record) => {
        record.isPublic = false;
      });
      if (!workspace) return errorResponse('Workspace not found', 404);
      const stored = await storedFilesOf(workspace);
      await unpublishFromIndex(env, id);
      await removeFromFeatured(env, id);
      // What's frozen is the record as just re-read; a save that landed since
      // the check above may have emptied it.
      const frozenMain = await mainText(env, id, stored);
      if (!frozenMain || !frozenMain.trim()) return errorResponse('Workspace has no code to re-review', 400);
      const submittedAt = new Date().toISOString();
      await materialize(env, id, stored);
      await pushReviewQueue(env, makeQueueEntry(workspace, stored, submittedAt));
      const adminId = await resolveAdminUserId(request, env);
      await appendState(env.USERS_DB, {
        workspaceId: id,
        state: 'pending',
        byUserId: adminId,
        codeHash: stored.hash,
        internalNotes: 'admin requeued for review',
      });
      return jsonResponse({ ok: true, publicationState: 'pending', submittedAt });
    } catch (err) {
      return errorResponse('Failed to requeue: ' + (err as Error).message, 500);
    }
  },

  // POST /admin/flag-user/:id — flag a user. Cascades: all of that user's
  // approval records are pulled from public + featured. Their workspace
  // records keep `isPublic` for restoration on unflag.
  async adminFlagUser(request: Request, env: Env, userId: string): Promise<Response> {
    if (!(await isAdminRequest(request, env))) return errorResponse('Unauthorized', 401);
    if (!env.USERS_DB) return errorResponse('Moderation DB unavailable', 500);
    try {
      let body: { internalNotes?: unknown } = {};
      try {
        body = (await request.json()) as typeof body;
      } catch {
        /* empty */
      }
      const notes = typeof body.internalNotes === 'string' ? body.internalNotes : '';
      await setUserFlag(env.USERS_DB, userId, true, notes || null);
      await addToFlaggedUsers(env, userId);
      // Drop every approval the user owns from the indexes.
      const approvals = await listApprovalsForUser(env, userId);
      for (const apr of approvals) {
        await unpublishFromIndex(env, apr.workspaceId);
        await removeFromFeatured(env, apr.workspaceId);
      }
      return jsonResponse({ ok: true, flagged: true, removedFromIndex: approvals.length });
    } catch (err) {
      return errorResponse('Failed to flag user: ' + (err as Error).message, 500);
    }
  },

  // DELETE /admin/flag-user/:id — unflag a user; restore their approvals
  // to public and (for any with `featuredAt`) to the featured list.
  async adminUnflagUser(request: Request, env: Env, userId: string): Promise<Response> {
    if (!(await isAdminRequest(request, env))) return errorResponse('Unauthorized', 401);
    if (!env.USERS_DB) return errorResponse('Moderation DB unavailable', 500);
    try {
      await setUserFlag(env.USERS_DB, userId, false, null);
      await removeFromFlaggedUsers(env, userId);
      const approvals = await listApprovalsForUser(env, userId);
      let restored = 0;
      for (const apr of approvals) {
        const wsJson = await env.WORKSPACES.get(`workspace:${apr.workspaceId}`);
        if (!wsJson) continue;
        const ws: Workspace = JSON.parse(wsJson);
        if (ws.flagged) continue; // workspace itself is flagged; skip
        await publishApprovalToIndex(env, apr, ws);
        if (apr.featuredAt) await addToFeatured(env, apr.workspaceId);
        restored++;
      }
      return jsonResponse({ ok: true, flagged: false, restored });
    } catch (err) {
      return errorResponse('Failed to unflag user: ' + (err as Error).message, 500);
    }
  },

  // POST /admin/reconcile-indexes — admin-only. Rebuilds the
  // public:workspaces and featured:workspaces indexes from the canonical
  // approval records. Used to recover from drift — e.g. when a sequence
  // of flag/unflag/unpublish actions over the workspace's lifetime left
  // the index out of sync with the approval record's "currently public"
  // state. Safe to call any time; idempotent.
  async adminReconcileIndexes(request: Request, env: Env): Promise<Response> {
    if (!(await isAdminRequest(request, env))) return errorResponse('Unauthorized', 401);
    try {
      const approvals = await listAllApprovals(env);
      const entries: PublicIndexEntry[] = [];
      const featuredIds: string[] = [];
      for (const a of approvals) {
        // Re-check the underlying workspace: only currently-public,
        // non-flagged workspaces belong on the index.
        const wsRaw = await env.WORKSPACES.get(`workspace:${a.workspaceId}`);
        if (!wsRaw) continue;
        let ws: Workspace & { flagged?: boolean };
        try {
          ws = JSON.parse(wsRaw);
        } catch {
          continue;
        }
        if (!ws.isPublic || ws.flagged) continue;
        // ownerFlagged: the badge propagates here too — but we still
        // include the entry; admin filters via the user-level flag.
        const entry: PublicIndexEntry = {
          id: a.workspaceId,
          slug: a.slug,
          name: a.name,
          description: a.description || '',
          userId: a.userId,
          updatedAt: ws.updatedAt,
          thumbnailAt: (await readThumbMeta(env, a.workspaceId, ws)).thumbnailAt,
          approvedAt: a.approvedAt,
        };
        if (a.ownerHandle) entry.ownerHandle = a.ownerHandle;
        entries.push(entry);
        if (a.featuredAt) featuredIds.push(a.workspaceId);
      }
      entries.sort((a, b) => {
        const aT = a.approvedAt ? new Date(a.approvedAt).getTime() : 0;
        const bT = b.approvedAt ? new Date(b.approvedAt).getTime() : 0;
        return bT - aT;
      });
      const capped = entries.slice(0, 100);
      await env.WORKSPACES.put('public:workspaces', JSON.stringify(capped));
      // Featured: newest-first by featuredAt, capped at 100.
      const featuredById = new Map(approvals.map((a) => [a.workspaceId, a]));
      featuredIds.sort((a, b) => {
        const aT = new Date(featuredById.get(a)?.featuredAt || '').getTime();
        const bT = new Date(featuredById.get(b)?.featuredAt || '').getTime();
        return bT - aT;
      });
      await env.WORKSPACES.put('featured:workspaces', JSON.stringify(featuredIds.slice(0, 100)));
      return jsonResponse({
        ok: true,
        publicCount: capped.length,
        featuredCount: featuredIds.length,
      });
    } catch (err) {
      return errorResponse('Failed to reconcile: ' + (err as Error).message, 500);
    }
  },

  // GET /api/admin/workspaces-without-thumbnails — admin-token gated.
  async adminListWithoutThumbnails(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const token = url.searchParams.get('token');
    if (!token || token !== env.ADMIN_TOKEN) return errorResponse('Unauthorized', 401);

    try {
      const allKeys: { name: string }[] = [];
      let cursor: string | undefined = undefined;
      do {
        const result = await env.WORKSPACES.list({ prefix: 'workspace:', cursor });
        allKeys.push(...result.keys);
        cursor = result.list_complete ? undefined : result.cursor;
      } while (cursor);

      const workspaces: { id: string; name: string; slug: string; userId: string; updatedAt: string }[] = [];
      for (const key of allKeys) {
        const wsJson = await env.WORKSPACES.get(key.name);
        if (!wsJson) continue;
        const ws: Workspace = JSON.parse(wsJson);
        const { thumbnailAt } = await readThumbMeta(env, ws.id, ws);
        if (!thumbnailAt) {
          workspaces.push({
            id: ws.id,
            name: ws.name,
            slug: ws.slug,
            userId: ws.userId,
            updatedAt: ws.updatedAt,
          });
        }
      }

      return jsonResponse(workspaces);
    } catch (err) {
      return errorResponse('Failed to list workspaces: ' + (err as Error).message, 500);
    }
  },
};

// Dispatcher. The caller (Worker entry point) is responsible for OPTIONS
// preflight handling and applying the appropriate CORS policy to the
// returned Response.
export async function handleApiRequest(request: Request, env: Env, apiPath: string): Promise<Response> {
  const url = new URL(request.url);
  const method = request.method;

  // ─── Auth + identity routes ───────────────────────────────────────
  if (apiPath === '/auth/start' && method === 'POST') return handleAuthStart(request, env);
  if (apiPath === '/auth/verify' && method === 'POST') return handleAuthVerify(request, env);
  if (apiPath === '/auth/logout' && method === 'POST') return handleAuthLogout(request, env);
  if (apiPath === '/auth/claim' && method === 'POST') return handleAuthClaim(request, env);
  if (apiPath === '/me' && method === 'GET') return handleMe(request, env);

  const profileMatch = apiPath.match(/^\/u\/([a-z0-9-]+)$/);
  if (profileMatch && method === 'GET') return handlePublicProfile(request, env, profileMatch[1]);

  // ─── Workspaces ───────────────────────────────────────────────────
  if (apiPath === '/workspaces' && method === 'GET') return apiHandlers.listWorkspaces(request, env);
  if (apiPath === '/workspace' && method === 'POST') return apiHandlers.createWorkspace(request, env);

  // ─── Preferences ──────────────────────────────────────────────────
  if (apiPath === '/preferences' && method === 'GET') return apiHandlers.getPreferences(request, env);
  if (apiPath === '/preferences' && method === 'PUT') return apiHandlers.savePreferences(request, env);

  // ─── Workspace by id ──────────────────────────────────────────────
  const workspaceMatch = apiPath.match(/^\/workspace\/([^/]+)$/);
  if (workspaceMatch) {
    const id = workspaceMatch[1];
    if (method === 'GET') return apiHandlers.getWorkspace(request, env, id);
    if (method === 'PUT') return apiHandlers.updateWorkspace(request, env, id);
    if (method === 'DELETE') return apiHandlers.deleteWorkspace(request, env, id);
  }

  const fileMatch = apiPath.match(/^\/workspace\/([^/]+)\/file\/([^/]+)$/);
  if (fileMatch && method === 'GET') return apiHandlers.getWorkspaceFile(request, env, fileMatch[1], fileMatch[2]);

  const copyMatch = apiPath.match(/^\/workspace\/([^/]+)\/copy$/);
  if (copyMatch && method === 'POST') return apiHandlers.copyWorkspace(request, env, copyMatch[1]);

  const submitMatch = apiPath.match(/^\/workspace\/([^/]+)\/submit-for-review$/);
  if (submitMatch && method === 'POST') {
    return apiHandlers.submitWorkspaceForReview(request, env, submitMatch[1]);
  }

  // ─── Snapshots ────────────────────────────────────────────────────
  const snapshotResponse = await routeSnapshotRequest(request, env, apiPath);
  if (snapshotResponse) return snapshotResponse;

  // ─── Thumbnails ───────────────────────────────────────────────────
  const thumbUploadMatch = apiPath.match(/^\/workspace\/([^/]+)\/thumbnail$/);
  if (thumbUploadMatch) {
    const id = thumbUploadMatch[1];
    if (method === 'PUT') return apiHandlers.uploadThumbnail(request, env, id);
    if (method === 'DELETE') return apiHandlers.deleteThumbnail(request, env, id);
  }

  const heroGetMatch = apiPath.match(/^\/thumbnail\/([^/]+)\/hero$/);
  if (heroGetMatch && method === 'GET') {
    return apiHandlers.getThumbnailHero(request, env, heroGetMatch[1]);
  }

  const thumbGetMatch = apiPath.match(/^\/thumbnail\/([^/]+)\/(\d+)$/);
  if (thumbGetMatch && method === 'GET') {
    return apiHandlers.getThumbnail(request, env, thumbGetMatch[1], thumbGetMatch[2]);
  }

  const publicApprovalSvgMatch = apiPath.match(/^\/approval-svg\/([^/]+)$/);
  if (publicApprovalSvgMatch && method === 'GET') {
    return apiHandlers.getApprovalSvg(request, env, publicApprovalSvgMatch[1]);
  }

  // ─── Admin ────────────────────────────────────────────────────────
  if (apiPath === '/admin/workspaces-without-thumbnails' && method === 'GET') {
    return apiHandlers.adminListWithoutThumbnails(request, env);
  }

  if (apiPath === '/admin/queue/review' && method === 'GET') {
    return apiHandlers.adminListReviewQueue(request, env);
  }
  if (apiPath === '/admin/reconcile-indexes' && method === 'POST') {
    return apiHandlers.adminReconcileIndexes(request, env);
  }
  if (apiPath === '/admin/queue/rereview' && method === 'GET') {
    return apiHandlers.adminListRereviewQueue(request, env);
  }
  if (apiPath === '/admin/queue/approved' && method === 'GET') {
    return apiHandlers.adminListApproved(request, env);
  }
  if (apiPath === '/admin/queue/featured' && method === 'GET') {
    return apiHandlers.adminListFeatured(request, env);
  }
  if (apiPath === '/admin/queue/rejected' && method === 'GET') {
    return apiHandlers.adminListRejected(request, env);
  }
  if (apiPath === '/admin/queue/flagged-workspaces' && method === 'GET') {
    return apiHandlers.adminListFlaggedWorkspaces(request, env);
  }
  if (apiPath === '/admin/queue/flagged-users' && method === 'GET') {
    return apiHandlers.adminListFlaggedUsers(request, env);
  }

  const reviewMatch = apiPath.match(/^\/admin\/review\/([^/]+)$/);
  if (reviewMatch && method === 'POST') {
    return apiHandlers.adminReviewDecision(request, env, reviewMatch[1]);
  }

  const approvalMatch = apiPath.match(/^\/admin\/approval\/([^/]+)$/);
  if (approvalMatch && method === 'GET') {
    return apiHandlers.adminGetApproval(request, env, approvalMatch[1]);
  }

  const approvalSvgMatch = apiPath.match(/^\/admin\/approval\/([^/]+)\/svg$/);
  if (approvalSvgMatch && method === 'PUT') {
    return apiHandlers.adminPutApprovalSvg(request, env, approvalSvgMatch[1]);
  }

  const unpublishMatch = apiPath.match(/^\/admin\/unpublish\/([^/]+)$/);
  if (unpublishMatch && method === 'POST') {
    return apiHandlers.adminUnpublish(request, env, unpublishMatch[1]);
  }

  const requeueMatch = apiPath.match(/^\/admin\/requeue\/([^/]+)$/);
  if (requeueMatch && method === 'POST') {
    return apiHandlers.adminRequeue(request, env, requeueMatch[1]);
  }

  const featureMatch = apiPath.match(/^\/admin\/feature\/([^/]+)$/);
  if (featureMatch) {
    if (method === 'POST') return apiHandlers.adminFeature(request, env, featureMatch[1]);
    if (method === 'DELETE') return apiHandlers.adminUnfeature(request, env, featureMatch[1]);
  }

  const flagWorkspaceMatch = apiPath.match(/^\/admin\/flag-workspace\/([^/]+)$/);
  if (flagWorkspaceMatch) {
    if (method === 'POST') return apiHandlers.adminFlagWorkspace(request, env, flagWorkspaceMatch[1]);
    if (method === 'DELETE') return apiHandlers.adminUnflagWorkspace(request, env, flagWorkspaceMatch[1]);
  }

  const flagUserMatch = apiPath.match(/^\/admin\/flag-user\/([^/]+)$/);
  if (flagUserMatch) {
    if (method === 'POST') return apiHandlers.adminFlagUser(request, env, flagUserMatch[1]);
    if (method === 'DELETE') return apiHandlers.adminUnflagUser(request, env, flagUserMatch[1]);
  }

  if (apiPath === '/admin/featured' || apiPath.startsWith('/admin/featured/')) {
    const token = url.searchParams.get('token');
    if (!token || token !== env.ADMIN_TOKEN) return errorResponse('Unauthorized', 401);

    if (apiPath === '/admin/featured' && method === 'GET') {
      try {
        const raw = await env.WORKSPACES.get('featured:workspaces');
        return jsonResponse(raw ? JSON.parse(raw) : []);
      } catch {
        return jsonResponse([]);
      }
    }

    if (apiPath === '/admin/featured' && method === 'POST') {
      try {
        const body = (await request.json()) as Record<string, unknown>;
        if (!body.id) return errorResponse('Missing workspace id');
        const raw = await env.WORKSPACES.get('featured:workspaces');
        const ids: string[] = raw ? JSON.parse(raw) : [];
        if (!ids.includes(body.id as string)) {
          ids.push(body.id as string);
          await env.WORKSPACES.put('featured:workspaces', JSON.stringify(ids));
        }
        return jsonResponse(ids);
      } catch (err) {
        return errorResponse('Failed: ' + (err as Error).message, 500);
      }
    }

    if (apiPath === '/admin/featured' && method === 'PUT') {
      try {
        const body = (await request.json()) as Record<string, unknown>;
        if (!Array.isArray(body.ids)) return errorResponse('Missing ids array');
        await env.WORKSPACES.put('featured:workspaces', JSON.stringify(body.ids));
        return jsonResponse(body.ids);
      } catch (err) {
        return errorResponse('Failed: ' + (err as Error).message, 500);
      }
    }

    const featuredDeleteMatch = apiPath.match(/^\/admin\/featured\/([^/]+)$/);
    if (featuredDeleteMatch && method === 'DELETE') {
      try {
        const removeId = featuredDeleteMatch[1];
        const raw = await env.WORKSPACES.get('featured:workspaces');
        const ids: string[] = raw ? JSON.parse(raw) : [];
        const filtered = ids.filter((id: string) => id !== removeId);
        await env.WORKSPACES.put('featured:workspaces', JSON.stringify(filtered));
        return jsonResponse(filtered);
      } catch (err) {
        return errorResponse('Failed: ' + (err as Error).message, 500);
      }
    }
  }

  return errorResponse('Not found', 404);
}
