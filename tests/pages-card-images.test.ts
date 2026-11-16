// The public pages show the card as approved (2e step 5b; website/api/approval-card.ts,
// project-docs/modules/58-phase-2e-plan.md answer 9b). The Pages worker renders
// Explore, the profile page, Featured and the public page (og:image, the hero's image,
// More by) over the same in-memory storage the API wrote; its calls to the API go to
// the real router.
// - An approval with a card: /approval-card/:id/:size?v=<cardAt>.
// - One approved without a thumbnail (cardAt null): the placeholder.
// - One from before the card copy (cardAt absent): the live thumbnail, as before.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { approve, call, makeHarness, send, submitted } from './api/publishing-harness';
import { handleApiRequest } from '../website/api/router';

import type { Harness } from './api/publishing-harness';

vi.mock('../website/generated/blog-data.js', () => ({ latestBlogPost: null }));

const API = 'http://api.test';

async function page(h: Harness, path: string): Promise<string> {
  const { default: worker } = await import('../website/_worker');
  const res = await worker.fetch(new Request(`https://pathogen.studio${path}`), { ...h.env, API_BASE: API });
  expect(res.status).toBe(200);
  return res.text();
}

async function withCard(h: Harness, name: string, label: string): Promise<{ id: string; cardAt: string }> {
  const id = await submitted(h, name);
  const form = new FormData();
  for (const size of ['1024', '512', '256']) form.append(size, new Blob([`${label}-${size}`]), `${size}.png`);
  expect((await send(h, 'PUT', `/workspace/${id}/thumbnail?kind=manual`, 'owner', form)).status).toBe(200);
  await approve(h, id, { feature: true });
  const approval = JSON.parse((await h.kv.get(`approval:${id}`)) ?? '{}') as { cardAt: string };
  return { id, cardAt: approval.cardAt };
}

const cardUrl = (id: string, size: number | 'hero', cardAt: string): string =>
  `${API}/approval-card/${encodeURIComponent(id)}/${size}?v=${encodeURIComponent(cardAt)}`;

describe('the public pages show the card as approved', () => {
  let h: Harness;

  beforeEach(async () => {
    h = await makeHarness();
    // The public page reads the approved source from the API.
    vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      return handleApiRequest(new Request(url), h.env, url.pathname);
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('Explore, the profile, Featured, and the public page’s og:image, hero and More by', async () => {
    const spiral = await withCard(h, 'Spiral', 'spiral');
    const gears = await withCard(h, 'Gears', 'gears');

    for (const path of ['/explore', '/u/ada', '/featured']) {
      const html = await page(h, path);
      expect(html).toContain(`src="${cardUrl(spiral.id, 512, spiral.cardAt)}"`);
      expect(html).toContain(`src="${cardUrl(gears.id, 512, gears.cardAt)}"`);
      expect(html).not.toContain('/thumbnail/');
    }

    const detail = await page(h, '/u/ada/spiral');
    expect(detail).toContain(`<meta property="og:image" content="${cardUrl(spiral.id, 1024, spiral.cardAt)}">`);
    // The approval's SVG is the hero; its fallback image is the card's hero.
    expect(detail).toContain(`src="${cardUrl(spiral.id, 'hero', spiral.cardAt)}"`);
    // More by: the other workspace's card.
    expect(detail).toContain(`src="${cardUrl(gears.id, 512, gears.cardAt)}"`);
    expect(detail).not.toContain('/thumbnail/');
  });

  it('approved without a thumbnail: the placeholder, never the live thumbnail made later', async () => {
    const id = await submitted(h);
    await approve(h, id);
    const form = new FormData();
    for (const size of ['1024', '512', '256']) form.append(size, new Blob(['later']), `${size}.png`);
    await send(h, 'PUT', `/workspace/${id}/thumbnail?kind=manual`, 'owner', form);
    const explore = await page(h, '/explore');
    expect(explore).toContain('<div class="explore-placeholder"></div>');
    expect(explore).not.toContain(`/thumbnail/${id}`);
    expect(explore).not.toContain('/approval-card/');
  });

  it('an approval from before the card copy shows the live thumbnail, as before', async () => {
    const { id } = await withCard(h, 'Spiral', 'spiral');
    const approval = JSON.parse((await h.kv.get(`approval:${id}`)) ?? '{}') as Record<string, unknown>;
    delete approval.cardAt;
    await h.kv.put(`approval:${id}`, JSON.stringify(approval));
    expect((await call(h, 'POST', '/admin/reconcile-indexes', {}, 'admin-token')).status).toBe(200);

    const explore = await page(h, '/explore');
    expect(explore).toContain(`src="${API}/thumbnail/${id}/512"`);
    const detail = await page(h, '/u/ada/spiral');
    expect(detail).toContain(`<meta property="og:image" content="${API}/thumbnail/${id}/1024">`);
    expect(detail).toContain(`src="${API}/thumbnail/${id}/hero"`);
  });
});
