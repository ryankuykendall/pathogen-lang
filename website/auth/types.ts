// Type shims for Cloudflare bindings used by the auth modules.
// We hand-roll minimal shapes (matching _worker.ts's existing style) so the
// auth code is self-contained and doesn't pull in @cloudflare/workers-types.

export interface KVNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
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

export interface EmailAttachment {
  content: string;       // base64-encoded
  filename: string;
  type: string;          // MIME, e.g. "image/png"
  disposition?: 'attachment' | 'inline';
  contentId?: string;    // referenced from HTML as `cid:<contentId>` for inline images
}

export interface EmailMessage {
  from: string;
  to: string;
  subject: string;
  text?: string;
  html?: string;
  attachments?: EmailAttachment[];
}

export interface EmailBinding {
  send(message: EmailMessage): Promise<{ messageId: string }>;
}

export interface AuthEnv {
  WORKSPACES: KVNamespace;
  USERS_DB: D1Database;
  // Cloudflare Email Sending binding (public beta, April 2026). The
  // wrangler.toml block is `[[send_email]] name = "EMAIL"` (shared with the
  // legacy Email Routing binding; Email Sending mode is implied when
  // `destination_address`/`allowed_destination_addresses` are absent).
  // Optional so the worker boots before the binding is provisioned, in
  // which case we expect AUTH_DEV_LOG_OTP or AUTH_RESEND_API_KEY to fill in.
  EMAIL?: EmailBinding;
  // Optional knobs read from [vars] in wrangler.toml
  AUTH_FROM_EMAIL?: string;     // e.g. "hello@pathogen.studio"
  AUTH_PRODUCT_NAME?: string;   // e.g. "Pathogen Studio"
  AUTH_DEV_LOG_OTP?: string;    // truthy in dev: log codes to console instead of (or in addition to) sending
  AUTH_RESEND_API_KEY?: string; // alternative transport while CF Email Sending beta rolls out
  PRODUCTION?: string;          // truthy in production deploys (controls cookie Secure flag)
  // Comma-separated list of admin emails. Source of truth for moderation
  // gating — never stored in the users table, so admin elevation cannot
  // be performed by mutating a row.
  ADMIN_EMAILS?: string;
  // Set in production wrangler.toml [vars] (".pathogen.studio") so the
  // session cookie is shared between the Pages site at pathogen.studio
  // and the API Worker at api.pathogen.studio. Unset in dev (.dev.vars
  // empty) so localhost cookies stay scoped to the request host.
  COOKIE_DOMAIN?: string;
}

export interface UserRow {
  id: string;
  email: string;
  email_lower: string;
  handle: string;
  display_name: string;
  created_at: number;
  verified_at: number | null;
  // Added in migration 0002. Null/missing on rows from before the migration
  // is applied — treat absent as 0/null.
  flagged?: number | null;
  flag_notes?: string | null;
}

export interface SessionRow {
  token: string;
  user_id: string;
  created_at: number;
  expires_at: number;
}

// Capability flags surfaced to clients. UI gates on these instead of raw
// row fields so policy can change server-side without client churn — and
// so the deny-list reason (flagged / unverified) never reaches the client.
//
// MUST stay in sync with the client-side mirror at
// `playground/services/auth.ts`. The two files exist because the playground
// bundle cannot import from the worker bundle. Backstopped by
// `tests/auth/features.test.ts` (which references this side) and the
// playground typecheck (which references the other side).
export const UserFeature = {
  Publishing: 'publishing',
  AdminModeration: 'admin-moderation',
} as const;
export type UserFeature = (typeof UserFeature)[keyof typeof UserFeature];

export interface CurrentUser {
  id: string;
  email: string;
  handle: string;
  displayName: string;
  features: UserFeature[];
}
