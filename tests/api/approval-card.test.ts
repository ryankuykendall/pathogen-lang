// The approved card image (2e step 5b; website/api/approval-card.ts,
// project-docs/modules/58-phase-2e-plan.md answer 9b):
// - Approve copies the live thumbnails (manual over auto, size by size) and the hero
//   to the approval's own keys, and stamps `cardAt` on the approval and its index entry;
// - the owner's later thumbnails change the live images, never the approved card;
// - GET /approval-card/:id/:size serves the card to visitors while the workspace is
//   public, its hero falling back to the approved 1024, never the live hero;
// - an admin's upload with kind=approval writes the card, never the live thumbnail;
// - the one-time copy gives approvals from before 5b their card, once.

import { describe, expect, it, vi } from 'vitest';

import { approve, approved, call, EDITED, makeHarness, publicIds, send, submitted } from './publishing-harness';
import { storedRecord } from './workspace-helpers';

import type { Harness, Who } from './publishing-harness';

type Kind = 'manual' | 'auto' | 'hero' | 'approval' | 'approval-hero';

/** Uploads images whose bytes say what they are: `${label}-${size}`, or `${label}-hero`. */
async function upload(h: Harness, id: string, kind: Kind, label: string, who: Who = 'owner'): Promise<Response> {
  const form = new FormData();
  if (kind === 'hero' || kind === 'approval-hero') form.append('hero', new Blob([`${label}-hero`]), 'hero.png');
  else for (const size of ['1024', '512', '256']) form.append(size, new Blob([`${label}-${size}`]), `${size}.png`);
  return send(h, 'PUT', `/workspace/${id}/thumbnail?kind=${kind}`, who, form);
}

async function image(h: Harness, path: string, who: Who = 'signed-out'): Promise<{ status: number; text: string }> {
  const res = await send(h, 'GET', path, who);
  return { status: res.status, text: await res.text() };
}

const approvalOf = async (h: Harness, id: string): Promise<Record<string, unknown>> =>
  JSON.parse((await h.kv.get(`approval:${id}`)) ?? 'null') as Record<string, unknown>;
const indexEntryOf = async (h: Harness, id: string): Promise<Record<string, unknown> | undefined> =>
  (JSON.parse((await h.kv.get('public:workspaces')) ?? '[]') as Record<string, unknown>[]).find((e) => e.id === id);
const approvedKeys = (h: Harness, id: string): string[] => h.r2.keys(`${id}/approved-`);

describe('Approve copies the card image', () => {
  it('manual over auto, size by size, and the hero; cardAt on the approval and its index entry', async () => {
    const h = await makeHarness();
    const id = await submitted(h);
    expect((await upload(h, id, 'auto', 'auto')).status).toBe(200);
    expect((await upload(h, id, 'manual', 'manual')).status).toBe(200);
    expect((await upload(h, id, 'hero', 'live')).status).toBe(200);
    // The manual layer without its 256: that size comes from the auto layer.
    await h.r2.delete(`${id}/manual-256.png`);
    await approve(h, id);

    expect(approvedKeys(h, id).map((k) => [k, h.r2.text(k)])).toEqual([
      [`${id}/approved-1024.png`, 'manual-1024'],
      [`${id}/approved-256.png`, 'auto-256'],
      [`${id}/approved-512.png`, 'manual-512'],
      [`${id}/approved-hero.png`, 'live-hero'],
    ]);
    const { cardAt } = await approvalOf(h, id);
    expect(typeof cardAt === 'string' && !Number.isNaN(Date.parse(cardAt))).toBe(true);
    expect((await indexEntryOf(h, id))?.cardAt).toBe(cardAt);
  });

  it('the owner’s later thumbnails change the live images, not the card', async () => {
    const h = await makeHarness();
    const id = await submitted(h);
    await upload(h, id, 'manual', 'approved');
    await approve(h, id);
    await call(h, 'PUT', `/workspace/${id}`, { code: EDITED });
    await upload(h, id, 'manual', 'edited');
    await upload(h, id, 'hero', 'edited');

    expect(await image(h, `/approval-card/${id}/512`)).toEqual({ status: 200, text: 'approved-512' });
    expect(await image(h, `/thumbnail/${id}/512`)).toEqual({ status: 200, text: 'edited-512' });
    // No hero at approval: the card's hero is its 1024, never the live hero.
    expect(await image(h, `/approval-card/${id}/hero`)).toEqual({ status: 200, text: 'approved-1024' });
  });

  it('with no thumbnail: cardAt null, and a re-approval removes the older card', async () => {
    const h = await makeHarness();
    const id = await submitted(h);
    await upload(h, id, 'manual', 'first');
    await upload(h, id, 'hero', 'first');
    await approve(h, id);
    expect(approvedKeys(h, id)).toHaveLength(4);

    // The owner clears every thumbnail and edits; the edit is approved.
    expect((await call(h, 'DELETE', `/workspace/${id}/thumbnail?kind=all`)).status).toBe(200);
    await call(h, 'PUT', `/workspace/${id}`, { code: EDITED });
    await approve(h, id);
    expect((await approvalOf(h, id)).cardAt).toBeNull();
    expect((await indexEntryOf(h, id))?.cardAt).toBeNull();
    expect(approvedKeys(h, id)).toEqual([]);
  });
});

describe('GET /approval-card/:id/:size', () => {
  it('serves visitors while the workspace is public; an admin also after Make private or a flag', async () => {
    const h = await makeHarness();
    const id = await submitted(h);
    await upload(h, id, 'manual', 'approved');
    await approve(h, id);
    const res = await send(h, 'GET', `/approval-card/${id}/256`, 'signed-out');
    expect([res.status, res.headers.get('Content-Type'), res.headers.get('Cache-Control')]).toEqual([
      200,
      'image/png',
      'public, max-age=3600',
    ]);

    await call(h, 'PUT', `/workspace/${id}`, { isPublic: false });
    expect((await image(h, `/approval-card/${id}/256`)).status).toBe(404);
    expect((await image(h, `/approval-card/${id}/256`, 'visitor')).status).toBe(404);
    const admin = await send(h, 'GET', `/approval-card/${id}/256`, 'admin-session');
    expect([admin.status, await admin.text(), admin.headers.get('Cache-Control')]).toEqual([
      200,
      'approved-256',
      'private, no-store',
    ]);

    await call(h, 'PUT', `/workspace/${id}`, { isPublic: true });
    await approve(h, id);
    expect((await call(h, 'POST', `/admin/flag-workspace/${id}`, {}, 'admin-token')).status).toBe(200);
    expect((await image(h, `/approval-card/${id}/256`)).status).toBe(404);
  });

  it('404s for a size it does not serve and a workspace never approved', async () => {
    const h = await makeHarness();
    const id = await submitted(h);
    await upload(h, id, 'manual', 'live');
    expect((await image(h, `/approval-card/${id}/256`)).status).toBe(404);
    await approve(h, id);
    expect((await image(h, `/approval-card/${id}/256`)).status).toBe(200);
    expect((await image(h, `/approval-card/${id}/128`)).status).toBe(404);
    expect((await image(h, `/approval-card/${id}/manual-256`)).status).toBe(404);
  });
});

describe('an admin’s upload of the card (kind=approval), as Regenerate and Set thumbnail send it', () => {
  it('writes the card and stamps cardAt, never the live thumbnail or its times', async () => {
    const h = await makeHarness();
    const id = await submitted(h);
    await upload(h, id, 'manual', 'live');
    await approve(h, id);
    const before = await call(h, 'GET', `/workspace/${id}`);
    const firstCardAt = (await approvalOf(h, id)).cardAt;

    const res = await upload(h, id, 'approval', 'regenerated', 'admin-session');
    const squares = (await res.json()) as { cardAt: string };
    expect(res.status).toBe(200);
    expect(squares.cardAt > (firstCardAt as string)).toBe(true);
    // The hero after the squares (Set thumbnail's order) stamps a later cardAt still.
    const heroRes = await upload(h, id, 'approval-hero', 'regenerated', 'admin-token');
    const data = (await heroRes.json()) as { cardAt: string };
    expect([heroRes.status, data.cardAt > squares.cardAt]).toEqual([200, true]);

    expect(approvedKeys(h, id).map((k) => h.r2.text(k))).toEqual([
      'regenerated-1024',
      'regenerated-256',
      'regenerated-512',
      'regenerated-hero',
    ]);
    expect(h.r2.keys(`${id}/manual-`).map((k) => h.r2.text(k))).toEqual(['live-1024', 'live-256', 'live-512']);
    const after = await call(h, 'GET', `/workspace/${id}`);
    expect([after.data.thumbnailAt, after.data.manualThumbnailAt]).toEqual([
      before.data.thumbnailAt,
      before.data.manualThumbnailAt,
    ]);
    expect((await approvalOf(h, id)).cardAt).toBe(data.cardAt);
    expect((await indexEntryOf(h, id))?.cardAt).toBe(data.cardAt);
  });

  it('is an admin’s alone (the owner gets 403), needs an approval, and never puts a workspace back on Explore', async () => {
    const h = await makeHarness();
    const id = await submitted(h);
    expect((await upload(h, id, 'approval', 'x', 'admin-token')).status).toBe(404);
    await approve(h, id);
    expect((await upload(h, id, 'approval', 'x', 'owner')).status).toBe(403);
    expect((await upload(h, id, 'approval-hero', 'x', 'visitor')).status).toBe(403);

    expect((await call(h, 'POST', `/admin/unpublish/${id}`, {}, 'admin-token')).status).toBe(200);
    expect((await upload(h, id, 'approval', 'x', 'admin-token')).status).toBe(200);
    expect(await publicIds(h)).toEqual([]);
  });

  it('a missing size writes nothing', async () => {
    const h = await makeHarness();
    const id = await approved(h);
    const form = new FormData();
    form.append('1024', new Blob(['a']), '1024.png');
    form.append('512', new Blob(['b']), '512.png');
    const res = await send(h, 'PUT', `/workspace/${id}/thumbnail?kind=approval`, 'admin-token', form);
    expect([res.status, ((await res.json()) as { error: string }).error]).toEqual([400, 'Missing 256 thumbnail']);
    expect(approvedKeys(h, id)).toEqual([]);
  });
});

describe('POST /admin/approval-cards, the one-time copy', () => {
  /** Three approvals; two lose their card copy, as approvals from before 5b have none. */
  async function legacyApprovals(h: Harness): Promise<string[]> {
    const ids: string[] = [];
    for (const name of ['One', 'Two', 'Three']) {
      const id = await submitted(h, name);
      await upload(h, id, 'manual', name);
      await approve(h, id);
      ids.push(id);
    }
    const legacy = [...ids].sort().slice(0, 2);
    for (const id of legacy) {
      const legacyApproval = await approvalOf(h, id);
      delete legacyApproval.cardAt;
      await h.kv.put(`approval:${id}`, JSON.stringify(legacyApproval));
      const entries = JSON.parse((await h.kv.get('public:workspaces')) ?? '[]') as Record<string, unknown>[];
      await h.kv.put(
        'public:workspaces',
        JSON.stringify(entries.map((e) => (e.id === id ? { ...e, cardAt: undefined } : e))),
      );
      await h.r2.delete(h.r2.keys(`${id}/approved-`));
    }
    return legacy;
  }

  it('copies each approval without a card once, in batches that resume, inside the call budget', async () => {
    const h = await makeHarness();
    const [first, second] = await legacyApprovals(h);

    // A dry run counts them and writes nothing.
    h.r2.resetCalls();
    const preview = await call(h, 'POST', '/admin/approval-cards', { dryRun: true }, 'admin-token');
    expect(preview.data).toMatchObject({ copied: 2, alreadyCopied: 1, done: true, dryRun: true });
    expect([h.r2.calls.put, h.r2.calls.delete, approvedKeys(h, first)]).toEqual([0, 0, []]);

    h.r2.resetCalls();
    const one = await call(h, 'POST', '/admin/approval-cards', { limit: 1 }, 'admin-token');
    expect(one.data).toEqual({ copied: 1, alreadyCopied: 0, repaired: 0, after: first, done: false });
    // 4 to 7 reads and 4 writes for one approval.
    expect(h.r2.totalCalls()).toBeLessThanOrEqual(11);
    expect(approvedKeys(h, first)).toHaveLength(3);
    const { cardAt } = await approvalOf(h, first);
    expect(typeof cardAt).toBe('string');
    expect((await indexEntryOf(h, first))?.cardAt).toBe(cardAt);

    const rest = await call(h, 'POST', '/admin/approval-cards', { after: first }, 'admin-token');
    expect(rest.data).toMatchObject({ copied: 1, alreadyCopied: 1, done: true });
    expect(approvedKeys(h, second)).toHaveLength(3);

    // A second run copies nothing.
    const again = await call(h, 'POST', '/admin/approval-cards', {}, 'admin-token');
    expect(again.data).toMatchObject({ copied: 0, alreadyCopied: 3, done: true });
  });

  it('writes the Explore index once a batch (KV takes about one write a second to a key)', async () => {
    const h = await makeHarness();
    await legacyApprovals(h);
    const put = vi.spyOn(h.kv, 'put');
    const res = await call(h, 'POST', '/admin/approval-cards', {}, 'admin-token');
    expect(res.data).toMatchObject({ copied: 2, done: true });
    expect(put.mock.calls.filter(([key]) => key === 'public:workspaces')).toHaveLength(1);
  });

  it('gives an Explore entry the card its approval already has (a run that stopped between the two)', async () => {
    const h = await makeHarness();
    const id = await submitted(h);
    await upload(h, id, 'manual', 'approved');
    await approve(h, id);
    const { cardAt } = await approvalOf(h, id);
    const entries = JSON.parse((await h.kv.get('public:workspaces')) ?? '[]') as Record<string, unknown>[];
    await h.kv.put('public:workspaces', JSON.stringify(entries.map((e) => ({ ...e, cardAt: undefined }))));

    const preview = await call(h, 'POST', '/admin/approval-cards', { dryRun: true }, 'admin-token');
    expect(preview.data).toMatchObject({ copied: 0, alreadyCopied: 1, repaired: 1 });
    expect((await indexEntryOf(h, id))?.cardAt).toBeUndefined();
    const res = await call(h, 'POST', '/admin/approval-cards', {}, 'admin-token');
    expect(res.data).toMatchObject({ copied: 0, alreadyCopied: 1, repaired: 1, done: true });
    expect((await indexEntryOf(h, id))?.cardAt).toBe(cardAt);
  });

  it('is an admin’s alone', async () => {
    const h = await makeHarness();
    expect((await call(h, 'POST', '/admin/approval-cards', {}, 'owner')).status).toBe(401);
  });
});

describe('the card survives partial and failed copies', () => {
  it('a card copied with only some sizes serves the nearest one, never a broken image', async () => {
    const h = await makeHarness();
    const id = await submitted(h);
    await upload(h, id, 'manual', 'live');
    // A thumbnail upload that stopped after its 1024.
    await h.r2.delete([`${id}/manual-512.png`, `${id}/manual-256.png`]);
    await approve(h, id);
    expect(approvedKeys(h, id)).toEqual([`${id}/approved-1024.png`]);
    expect(await image(h, `/approval-card/${id}/256`)).toEqual({ status: 200, text: 'live-1024' });
    expect(await image(h, `/approval-card/${id}/hero`)).toEqual({ status: 200, text: 'live-1024' });
  });

  it('a re-approval whose copy fails keeps the earlier card, never the live thumbnail', async () => {
    const h = await makeHarness();
    const id = await submitted(h);
    await upload(h, id, 'manual', 'first');
    await approve(h, id);
    const { cardAt } = await approvalOf(h, id);
    await call(h, 'PUT', `/workspace/${id}`, { code: EDITED });
    await upload(h, id, 'manual', 'edited');

    const get = h.r2.get.bind(h.r2);
    vi.spyOn(h.r2, 'get').mockImplementation(async (key: string) => {
      if (key.includes('/manual-')) throw new Error('R2 is down');
      return get(key);
    });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await approve(h, id);
    vi.restoreAllMocks();

    expect((await approvalOf(h, id)).cardAt).toBe(cardAt);
    expect((await indexEntryOf(h, id))?.cardAt).toBe(cardAt);
    expect(await image(h, `/approval-card/${id}/512`)).toEqual({ status: 200, text: 'first-512' });
  });
});

describe('a new hero changes the card’s URL', () => {
  it('for an approval with a card, a hero upload stamps a new cardAt; without one, it makes none', async () => {
    const h = await makeHarness();
    const id = await submitted(h);
    await upload(h, id, 'manual', 'live');
    await approve(h, id);
    const { cardAt } = await approvalOf(h, id);
    const res = await upload(h, id, 'approval-hero', 'new', 'admin-token');
    const data = (await res.json()) as { cardAt: string };
    expect(data.cardAt > (cardAt as string)).toBe(true);
    expect([(await approvalOf(h, id)).cardAt, (await indexEntryOf(h, id))?.cardAt]).toEqual([data.cardAt, data.cardAt]);

    const bare = await submitted(h, 'Bare');
    await approve(h, bare);
    expect((await approvalOf(h, bare)).cardAt).toBeNull();
    expect(await (await upload(h, bare, 'approval-hero', 'new', 'admin-token')).json()).toEqual({ success: true });
    expect((await approvalOf(h, bare)).cardAt).toBeNull();
  });
});

describe('the index keeps cardAt through every path that writes it', () => {
  it('reconcile, and a user’s unflag, write the approval’s cardAt', async () => {
    const h = await makeHarness();
    const id = await submitted(h);
    await upload(h, id, 'manual', 'approved');
    await approve(h, id);
    const { cardAt } = await approvalOf(h, id);
    expect((await call(h, 'POST', '/admin/reconcile-indexes', {}, 'admin-token')).status).toBe(200);
    expect((await indexEntryOf(h, id))?.cardAt).toBe(cardAt);
    const owner = (await storedRecord(h.kv, id)).userId;
    expect((await call(h, 'POST', `/admin/flag-user/${owner}`, {}, 'admin-token')).status).toBe(200);
    expect((await call(h, 'DELETE', `/admin/flag-user/${owner}`, undefined, 'admin-token')).status).toBe(200);
    expect((await indexEntryOf(h, id))?.cardAt).toBe(cardAt);
  });

  it('Feature, Unfeature and a new approval SVG keep the approval’s cardAt', async () => {
    const h = await makeHarness();
    const id = await submitted(h);
    await upload(h, id, 'manual', 'approved');
    await approve(h, id);
    const { cardAt } = await approvalOf(h, id);
    expect((await call(h, 'POST', `/admin/feature/${id}`, {}, 'admin-token')).status).toBe(200);
    expect((await call(h, 'DELETE', `/admin/feature/${id}`, undefined, 'admin-token')).status).toBe(200);
    expect((await call(h, 'PUT', `/admin/approval/${id}/svg`, { svg: '<svg/>' }, 'admin-token')).status).toBe(200);
    expect((await approvalOf(h, id)).cardAt).toBe(cardAt);
  });
});
