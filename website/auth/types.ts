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
  AUTH_FROM_EMAIL?: string;     // e.g. "noreply@pedestal.design"
  AUTH_PRODUCT_NAME?: string;   // e.g. "Pathogen"
  AUTH_DEV_LOG_OTP?: string;    // truthy in dev: log codes to console instead of (or in addition to) sending
  AUTH_RESEND_API_KEY?: string; // alternative transport while CF Email Sending beta rolls out
  PRODUCTION?: string;          // truthy in production deploys (controls cookie Secure flag)
}

export interface UserRow {
  id: string;
  email: string;
  email_lower: string;
  handle: string;
  display_name: string;
  created_at: number;
  verified_at: number | null;
}

export interface SessionRow {
  token: string;
  user_id: string;
  created_at: number;
  expires_at: number;
}

export interface CurrentUser {
  id: string;
  email: string;
  handle: string;
  displayName: string;
}
