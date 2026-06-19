// Shared types between the Pages worker (website/_worker.ts) and the
// Workers project (api/src/index.ts). Both projects bind to the same KV
// namespace, R2 bucket, and D1 database — keeping types in one place
// avoids drift.

export interface KVNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
  list(options?: {
    prefix?: string;
    cursor?: string;
  }): Promise<{ keys: { name: string }[]; list_complete: boolean; cursor?: string }>;
}

export interface R2Object {
  body: ReadableStream;
}

export interface R2Bucket {
  get(key: string): Promise<R2Object | null>;
  put(
    key: string,
    value: ReadableStream | ArrayBuffer | string,
    options?: { httpMetadata?: { contentType?: string } },
  ): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<{ success: boolean; meta: { changes: number } }>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  exec(query: string): Promise<unknown>;
}

export interface EmailBinding {
  send(message: {
    from: string;
    to: string;
    subject: string;
    text?: string;
    html?: string;
  }): Promise<{ messageId: string }>;
}

export interface Env {
  ASSETS?: { fetch(input: RequestInfo): Promise<Response> };
  WORKSPACES: KVNamespace;
  THUMBNAILS: R2Bucket;
  USERS_DB: D1Database;
  EMAIL?: EmailBinding;
  ADMIN_TOKEN?: string;
  // Comma-separated list of admin emails. Membership is recomputed from
  // env on every request, so admin elevation never traverses the users
  // table. Set via `wrangler secret put ADMIN_EMAILS` on both projects.
  ADMIN_EMAILS?: string;
  AUTH_FROM_EMAIL?: string;
  AUTH_PRODUCT_NAME?: string;
  AUTH_DEV_LOG_OTP?: string;
  AUTH_RESEND_API_KEY?: string;
  PRODUCTION?: string;
  COOKIE_DOMAIN?: string;
  // Origin used by SSR pages to build cross-origin <img src> URLs for
  // workspace thumbnails. Production reads "https://api.pathogen.studio"
  // from wrangler.toml [vars]; dev sets http://localhost:8787 in
  // .dev.vars. Helpers fall back to the production origin when unset.
  API_BASE?: string;
}

export interface WorkspaceListing {
  id: string;
  slug: string;
  name: string;
  description: string;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
  // thumbnailAt = max(manualThumbnailAt, autoThumbnailAt); used by the listing
  // page to decide between <img> and the letter-avatar fallback.
  thumbnailAt: string | null;
  manualThumbnailAt: string | null;
  autoThumbnailAt: string | null;
  // The effective moderation state — derived from the latest
  // workspace_publication_states row, or 'unpublished' when no row exists.
  // Clients render the Publish/Pending/Published/Re-submit button based on
  // this value.
  publicationState?: WorkspacePublicationState;
  // True when the workspace is approved AND its current code differs from
  // the approved snapshot (queue:rereview membership). publicationState
  // stays 'approved' in this case; this flag carries the "needs re-review"
  // signal so the UI can render "Pending re-review".
  rereviewPending?: boolean;
}

export interface Workspace extends WorkspaceListing {
  userId: string;
  code: string;
  preferences: Record<string, unknown>;
  contentHash: string;
  // Monotonic code-revision counter for optimistic concurrency. Incremented on
  // every successful code write. A client sends the `rev` it last loaded/saved
  // as `baseRev`; the server rejects the write (409) when the doc has advanced —
  // stopping a stale second tab from clobbering a newer save. Absent on docs
  // created before this field existed; readers treat missing as 0.
  rev?: number;
  // Set by admin moderation (Phase 3). Flagged workspaces are removed from
  // public + featured indexes immediately and listed in
  // `queue:flagged-workspaces`.
  flagged?: boolean;
}

// Thumbnail timestamps live in a sidecar KV value (`workspace:thumbmeta:{id}`)
// rather than on the workspace doc, so the thumbnail upload/clear endpoints
// never read-modify-write `workspace:{id}` and therefore can never clobber a
// concurrent code save. Legacy workspace docs still carry these fields inline;
// `readThumbMeta` falls back to them when no sidecar exists (lazy migration).
export interface ThumbMeta {
  thumbnailAt: string | null;
  manualThumbnailAt: string | null;
  autoThumbnailAt: string | null;
}

export interface PublicIndexEntry {
  id: string;
  slug: string;
  name: string;
  description: string;
  userId: string;
  updatedAt: string;
  thumbnailAt: string | null;
  // Set on entries written by the Phase 2 approval flow; absent on
  // pre-Phase-2 entries (treated as oldest for sort purposes).
  approvedAt?: string;
  // Frozen owner handle from the approval record. Lets explore-page cards
  // build /u/<handle>/<slug> hrefs without a D1 lookup per card. Optional
  // for back-compat with pre-Phase-4 index entries.
  ownerHandle?: string;
}

export interface SsrUser {
  id: string;
  email: string;
  displayName: string;
  handle: string;
  features: string[];
}

// ─── Moderation types (Phase 2) ──────────────────────────────────────

export type WorkspacePublicationState =
  | 'unpublished'
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'flagged';

export interface PublicationStateRow {
  id: number;
  workspace_id: string;
  state: WorkspacePublicationState;
  transitioned_at: number;
  transitioned_by_user_id: string;
  code_hash: string | null;
  internal_notes: string | null;
}

// Frozen at submission time — admins approve exactly what the user
// submitted, even if the live workspace is edited in the interim.
export interface ReviewQueueEntry {
  workspaceId: string;
  userId: string;
  code: string;
  codeHash: string;
  name: string;
  description: string;
  slug: string;
  submittedAt: string;
}

export interface WorkspaceApproval {
  workspaceId: string;
  userId: string;
  code: string;
  codeHash: string;
  slug: string;            // frozen at approval time; unique within (userId, slug)
  name: string;
  description: string;
  manualThumbnailAt: string | null;
  autoThumbnailAt: string | null;
  approvedAt: string;
  approvedByUserId: string;
  featuredAt: string | null;
  // Frozen handle of the workspace owner at approval time. Lets explore
  // and featured cards link to /u/<handle>/<slug> without a D1 lookup per
  // card. Optional only for back-compat with pre-Phase-4 approval records.
  ownerHandle?: string;
  // Pre-rendered SVG markup captured by the admin's browser at approval
  // time. LEGACY storage path: early approvals embedded the SVG inline in
  // this KV record (capped at 1 MB server-side). Newer approvals store the
  // SVG in R2 instead (see `approvalSvgAt`) so large workspaces aren't
  // size-capped. Kept for backward-compat: legacy records still carry it
  // and the detail page still inlines it when present.
  svg?: string;
  // ISO timestamp set when the admin-captured SVG is stored in R2 at
  // `${workspaceId}/approval.svg` (no size cap there). When set, the detail
  // page references the SVG by URL via the API Worker rather than inlining
  // it. Absent on legacy approvals (which used the inline `svg` field) and
  // on approvals where no SVG was captured.
  approvalSvgAt?: string | null;
}

export interface WorkspaceRejection {
  workspaceId: string;
  rejectedAt: string;
  rejectedByUserId: string;
  internalNotes: string;
}
