// A workspace's file bytes in R2, at files/{workspaceId}/{sha256}
// (project-docs/modules/48-storage-design-v2.md §1). Keyed under the
// workspace, so reads follow its permissions, nobody can probe another
// user's files, and deleting the workspace deletes the prefix.
//
// Budget: one Worker request may make at most 1,000 calls to KV and R2
// together (Cloudflare's limits page, Nov 2026), and six at a time. Callers
// read only what they need, and saves never check blobs a stored manifest
// already names: saves never delete, so those exist.

import { entryForText } from './workspace-files.js';

import type { Env } from './types.js';
import type { FileEntry } from './workspace-files.js';

const TEXT_TYPE = 'text/plain; charset=utf-8';
/** R2 deletes at most 1,000 keys per call. */
const DELETE_BATCH = 1000;

export function filesPrefix(workspaceId: string): string {
  return `files/${workspaceId}/`;
}

export function fileKey(workspaceId: string, sha256: string): string {
  return `${filesPrefix(workspaceId)}${sha256}`;
}

/** Store a text under the workspace by its hash, and return its entry. The same text twice is one object. */
export async function putText(env: Env, workspaceId: string, text: string): Promise<FileEntry> {
  const entry = await entryForText(text);
  await env.THUMBNAILS.put(fileKey(workspaceId, entry.sha256), text, { httpMetadata: { contentType: TEXT_TYPE } });
  return entry;
}

/** The texts with these hashes, one read each (duplicates read once). A missing one is an error naming it. */
export async function readTexts(env: Env, workspaceId: string, hashes: Iterable<string>): Promise<Map<string, string>> {
  const unique = [...new Set(hashes)];
  const texts = await Promise.all(
    unique.map(async (sha256) => {
      const object = await env.THUMBNAILS.get(fileKey(workspaceId, sha256));
      if (!object) throw new Error(`File ${sha256} of workspace ${workspaceId} is missing from storage`);
      return [sha256, await new Response(object.body).text()] as const;
    }),
  );
  return new Map(texts);
}

/** Whether a blob is stored under the workspace. */
export async function hasFile(env: Env, workspaceId: string, sha256: string): Promise<boolean> {
  const key = fileKey(workspaceId, sha256);
  if (env.THUMBNAILS.head) return (await env.THUMBNAILS.head(key)) !== null;
  return (await env.THUMBNAILS.get(key)) !== null;
}

/**
 * Copy blobs from one workspace's prefix to another's: a fork, a duplicate,
 * a restored snapshot. Two calls per blob, so the caller keeps the count
 * inside the request's budget.
 */
export async function copyFiles(env: Env, fromId: string, toId: string, hashes: Iterable<string>): Promise<void> {
  await Promise.all(
    [...new Set(hashes)].map(async (sha256) => {
      const object = await env.THUMBNAILS.get(fileKey(fromId, sha256));
      if (!object) throw new Error(`File ${sha256} of workspace ${fromId} is missing from storage`);
      await env.THUMBNAILS.put(fileKey(toId, sha256), await new Response(object.body).arrayBuffer(), {
        httpMetadata: { contentType: TEXT_TYPE },
      });
    }),
  );
}

/**
 * Delete every blob under the workspace: one list call per 1,000 keys, then
 * one delete per 1,000. The keys are all listed before any is deleted, so a
 * page cursor never points past keys that moved up.
 */
export async function deleteWorkspaceFiles(env: Env, workspaceId: string): Promise<number> {
  if (!env.THUMBNAILS.list) return 0;
  const keys: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await env.THUMBNAILS.list({ prefix: filesPrefix(workspaceId), cursor, limit: DELETE_BATCH });
    keys.push(...page.objects.map((o) => o.key));
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  for (let i = 0; i < keys.length; i += DELETE_BATCH) {
    await env.THUMBNAILS.delete(keys.slice(i, i + DELETE_BATCH));
  }
  return keys.length;
}
