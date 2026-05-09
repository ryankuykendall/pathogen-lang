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
  AUTH_FROM_EMAIL?: string;
  AUTH_PRODUCT_NAME?: string;
  AUTH_DEV_LOG_OTP?: string;
  AUTH_RESEND_API_KEY?: string;
  PRODUCTION?: string;
  COOKIE_DOMAIN?: string;
}

export interface WorkspaceListing {
  id: string;
  slug: string;
  name: string;
  description: string;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
  thumbnailAt: string | null;
}

export interface Workspace extends WorkspaceListing {
  userId: string;
  code: string;
  preferences: Record<string, unknown>;
  contentHash: string;
}

export interface PublicIndexEntry {
  id: string;
  slug: string;
  name: string;
  description: string;
  userId: string;
  updatedAt: string;
  thumbnailAt: string | null;
}

export interface SsrUser {
  id: string;
  email: string;
  displayName: string;
  handle: string;
}
