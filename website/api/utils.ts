// Worker utility helpers. Responses returned here are intentionally
// CORS-naked — each Worker entry point applies its own CORS policy to
// the final response (Pages keeps the legacy wildcard for backwards
// compatibility; the new API Worker uses an origin allowlist).

import type { Env, ThumbMeta, Workspace } from './types.js';

const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_~';

export function generateNanoId(size: number = 21): string {
  let id = '';
  const bytes = crypto.getRandomValues(new Uint8Array(size));
  for (let i = 0; i < size; i++) {
    id += ALPHABET[bytes[i] & 63];
  }
  return id;
}

export async function hashContent(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray
    .slice(0, 8)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
    .replace(/-+$/, '');
}

export function jsonResponse(data: unknown, status: number = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function errorResponse(message: string, status: number = 400): Response {
  return jsonResponse({ error: message }, status);
}

// ─── Thumbnail metadata sidecar ──────────────────────────────────────
//
// The three thumbnail timestamps used to live on the workspace doc, so the
// thumbnail upload/clear endpoints had to read the whole `workspace:{id}`
// value and write it back just to stamp a date — silently reverting any code
// save that landed in between (and clobbering a fresh tab from a stale one).
// Storing them under a separate key makes that class of data loss structurally
// impossible: thumbnail writes touch only `thumbmeta:{id}`, code writes touch
// only `workspace:{id}`.

// Deliberately NOT under the `workspace:` namespace — `KV.list({ prefix:
// 'workspace:' })` scans (e.g. adminListWithoutThumbnails) must not pick up
// these sidecar values as if they were workspace docs.
const THUMB_META_PREFIX = 'thumbmeta:';

export function thumbMetaKey(id: string): string {
  return `${THUMB_META_PREFIX}${id}`;
}

type LegacyThumbFields = Pick<Workspace, 'thumbnailAt' | 'manualThumbnailAt' | 'autoThumbnailAt'>;

// Read the sidecar; fall back to the legacy inline fields on the workspace doc
// when no sidecar exists yet (lazy migration — no batch job). `workspace` is
// optional: callers that already parsed the doc pass it so the fallback works;
// brand-new docs and missing-sidecar reads resolve to all-null.
export async function readThumbMeta(env: Env, id: string, workspace?: LegacyThumbFields | null): Promise<ThumbMeta> {
  const raw = await env.WORKSPACES.get(thumbMetaKey(id));
  if (raw) {
    try {
      const meta = JSON.parse(raw) as Partial<ThumbMeta>;
      return {
        thumbnailAt: meta.thumbnailAt ?? null,
        manualThumbnailAt: meta.manualThumbnailAt ?? null,
        autoThumbnailAt: meta.autoThumbnailAt ?? null,
      };
    } catch {
      /* corrupt sidecar — fall through to legacy fields */
    }
  }
  return {
    thumbnailAt: workspace?.thumbnailAt ?? null,
    manualThumbnailAt: workspace?.manualThumbnailAt ?? null,
    autoThumbnailAt: workspace?.autoThumbnailAt ?? null,
  };
}

export async function writeThumbMeta(env: Env, id: string, meta: ThumbMeta): Promise<void> {
  await env.WORKSPACES.put(thumbMetaKey(id), JSON.stringify(meta));
}

export async function deleteThumbMeta(env: Env, id: string): Promise<void> {
  await env.WORKSPACES.delete(thumbMetaKey(id));
}
