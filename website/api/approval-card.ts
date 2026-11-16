// The approved card image (2e step 5b; project-docs/modules/58-phase-2e-plan.md,
// answer 9b). Explore, the profile page, Featured and the public page show the
// card as it was approved, not the live thumbnail, which follows the owner's
// edits, including edits waiting for re-review.
//
// At approval the server copies the workspace's live thumbnails (the manual
// layer, else the auto one) and its hero to the approval's own keys, and stamps
// `cardAt` on the approval and its index entry. The review screen's Regenerate
// and Set thumbnail write those keys directly (uploadThumbnail, kind=approval),
// since both draw the approved files.
//
// `cardAt` has three states, on the approval and on its index entry:
// - a time: the approved card, read through GET /approval-card/:id/:size;
// - null: frozen with no image (the workspace had no thumbnail): a placeholder;
// - absent: an approval from before 5b, not yet copied: the live thumbnail, until
//   the one-time copy (POST /admin/approval-cards) reaches it.

import type { Env, PublicIndexEntry, R2Bucket } from './types.js';

export const CARD_SIZES = ['1024', '512', '256'] as const;
export type CardSize = (typeof CARD_SIZES)[number];

export function isCardSize(size: string): size is CardSize {
  return (CARD_SIZES as readonly string[]).includes(size);
}

/** Where the approval's card lives in R2. */
export function cardKey(workspaceId: string, size: CardSize | 'hero'): string {
  return `${workspaceId}/approved-${size}.png`;
}

/**
 * The keys to try for a size, in order: the size itself, then the larger ones, then
 * the smaller. A card copied with only some sizes (a workspace whose thumbnail upload
 * stopped partway) still shows an image rather than a broken one. The hero falls back
 * to the squares, largest first, never to the live hero.
 */
export function cardKeysFor(workspaceId: string, size: CardSize | 'hero'): string[] {
  const order: (CardSize | 'hero')[] =
    size === 'hero'
      ? ['hero', '1024', '512', '256']
      : size === '256'
        ? ['256', '512', '1024']
        : size === '512'
          ? ['512', '1024', '256']
          : ['1024', '512', '256'];
  return order.map((s) => cardKey(workspaceId, s));
}

export const CARD_PNG = { httpMetadata: { contentType: 'image/png' } };

/** Copies one object's bytes (a stream put needs a known length on R2), or removes the target. */
async function copyOrRemove(bucket: R2Bucket, from: string[], to: string): Promise<boolean> {
  for (const key of from) {
    const object = await bucket.get(key);
    if (!object) continue;
    await bucket.put(to, await new Response(object.body).arrayBuffer(), CARD_PNG);
    return true;
  }
  // Nothing to copy: an older card under this key would be served as this approval's.
  await bucket.delete(to);
  return false;
}

/**
 * Copies the workspace's live thumbnails and hero to the approval's card keys.
 * Returns the time to stamp as `cardAt`, or null when the workspace has no
 * thumbnail (the cards show a placeholder). 4 to 8 R2 reads and up to 4 writes.
 */
export async function freezeApprovalCard(env: Env, workspaceId: string): Promise<string | null> {
  let copied = false;
  for (const size of CARD_SIZES) {
    const from = [`${workspaceId}/manual-${size}.png`, `${workspaceId}/${size}.png`];
    if (await copyOrRemove(env.THUMBNAILS, from, cardKey(workspaceId, size))) copied = true;
  }
  // Without its own hero, GET /approval-card/:id/hero falls back to the approved 1024.
  await copyOrRemove(env.THUMBNAILS, [`${workspaceId}/hero.png`], cardKey(workspaceId, 'hero'));
  return copied ? new Date().toISOString() : null;
}

/**
 * Stamps new `cardAt`s on the index entries of these workspaces, those that have
 * one, in one read and at most one write: KV takes about one write a second to a
 * key, so a batch writes the index once. Never adds an entry: an unpublished or
 * flagged workspace stays off Explore. Like every index writer here, a
 * read-modify-write without a lock: a re-approval landing in between can be
 * undone, which only admins' actions can race.
 */
export async function refreshIndexCards(env: Env, cards: ReadonlyMap<string, string | null>): Promise<void> {
  if (cards.size === 0) return;
  const raw = await env.WORKSPACES.get('public:workspaces');
  if (!raw) return;
  const entries = JSON.parse(raw) as PublicIndexEntry[];
  let changed = false;
  for (const entry of entries) {
    const cardAt = cards.get(entry.id);
    if (cardAt === undefined || entry.cardAt === cardAt) continue;
    entry.cardAt = cardAt;
    changed = true;
  }
  if (changed) await env.WORKSPACES.put('public:workspaces', JSON.stringify(entries));
}

/** The workspaces' index entries as they are now: `cardAt` by workspace id. */
export async function indexCards(env: Env): Promise<Map<string, string | null | undefined>> {
  const raw = await env.WORKSPACES.get('public:workspaces');
  const entries = raw ? (JSON.parse(raw) as PublicIndexEntry[]) : [];
  return new Map(entries.map((e) => [e.id, e.cardAt]));
}
