// The public page's View source with several files (2e step 6; note 59 answer 3a, mockup
// v12 P1 and P5). The Pages worker renders /u/:handle/:slug over the same in-memory
// storage the API wrote; its calls to the API go to the real router.
// - Several files: every file's name served (in an attribute, escaped), the count with
//   pathogen.json, the main's text in its <pre>, and no other file's text.
// - One file: as before, its lines counted, nothing more served.
// - source.json carries every text, for the page to load when View source opens.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { approve, call, makeHarness } from './api/publishing-harness';
import { handleApiRequest } from '../website/api/router';

import type { Harness } from './api/publishing-harness';

vi.mock('../website/generated/blog-data.js', () => ({ latestBlogPost: null }));

const API = 'http://api.test';
const MAIN = 'import { gear } from "./parts/gears.pathogen";\ngear(4);\n';
const GEARS = 'module;\nexport fn gear(r) {\n  circle(0, 0, r);\n}\n';
const SIZES = 'define ViewBox(0, 0, 100, 100);\ncircle(50, 50, 30);\n';

async function page(h: Harness, path: string): Promise<{ status: number; text: string }> {
  const { default: worker } = await import('../website/_worker');
  const res = await worker.fetch(new Request(`https://pathogen.studio${path}`), { ...h.env, API_BASE: API });
  return { status: res.status, text: await res.text() };
}

async function published(h: Harness, name: string, body: Record<string, unknown>): Promise<string> {
  const created = await call(h, 'POST', '/workspace', { name, ...body });
  const id = created.data.id as string;
  expect((await call(h, 'POST', `/workspace/${id}/submit-for-review`)).status).toBe(200);
  await approve(h, id);
  return id;
}

/** An attribute's value on the page's View source, unescaped. */
function attribute(html: string, name: string): string | null {
  const found = new RegExp(`<details class="detail-source-disclosure"[^>]*\\s${name}="([^"]*)"`).exec(html);
  return found
    ? found[1]
        .replace(/&quot;/g, '"')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
    : null;
}

describe('the public page’s View source', () => {
  let h: Harness;

  beforeEach(async () => {
    h = await makeHarness();
    vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      return handleApiRequest(new Request(url), h.env, url.pathname);
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('several files: every name and the count served, the main’s text, and no other text', async () => {
    const id = await published(h, 'Gears', {
      files: {
        'main.pathogen': { text: MAIN },
        'parts/gears.pathogen': { text: GEARS },
        'try-sizes.pathogen': { text: SIZES },
      },
      folders: ['empty'],
      entryPoints: ['main.pathogen', 'try-sizes.pathogen'],
    });
    const { status, text: html } = await page(h, '/u/ada/gears');
    expect(status).toBe(200);
    expect(html).toContain('<span class="detail-source-meta">Pathogen &middot; 4 files</span>');
    expect(JSON.parse(attribute(html, 'data-served') ?? 'null')).toEqual({
      names: ['main.pathogen', 'parts/gears.pathogen', 'try-sizes.pathogen'],
      folders: ['empty'],
      entryPoints: ['main.pathogen', 'try-sizes.pathogen'],
      main: 'main.pathogen',
    });
    expect(attribute(html, 'data-source-url')).toBe('/u/ada/gears/source.json');
    // The main's text, as before; the others load when View source opens.
    expect(html).toContain('<pre class="detail-source-code">import { gear } from &quot;./parts/gears.pathogen&quot;;');
    expect([html.includes('export fn gear'), html.includes('circle(50, 50, 30)')]).toEqual([false, false]);

    // source.json carries every text, for the page to load.
    const json = await page(h, '/u/ada/gears/source.json');
    const answer = JSON.parse(json.text) as { workspaceId: string; files: Record<string, { text: string }> };
    expect(Object.fromEntries(Object.entries(answer.files).map(([path, f]) => [path, f.text]))).toEqual({
      'main.pathogen': MAIN,
      'parts/gears.pathogen': GEARS,
      'try-sizes.pathogen': SIZES,
    });
    // Whose files: a deferred data file is read by its hash from the API (phase 3a).
    expect(answer.workspaceId).toBe(id);
  });

  it('one file: its lines counted, as before, and nothing more served', async () => {
    await published(h, 'Rings', { files: { 'main.pathogen': { text: SIZES } } });
    const { text: html } = await page(h, '/u/ada/rings');
    expect(html).toContain('<span class="detail-source-meta">Pathogen &middot; 3 lines</span>');
    expect([attribute(html, 'data-served'), attribute(html, 'data-source-url')]).toEqual([null, null]);
    expect(html).toContain('<details class="detail-source-disclosure">');
  });
});
