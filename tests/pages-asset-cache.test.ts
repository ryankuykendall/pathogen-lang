// The Pages worker asks browsers to check the playground's code on every load
// (website/_worker.ts revalidateEveryLoad; project-docs/modules/66-phase-2f-plan.md,
// "Before the push"). Cloudflare let browsers keep JS and CSS for 4 hours
// unasked, so a visitor could run some files from before a deploy with others
// from after it. Code files get `private, no-cache`, keep their ETag, and a
// 304 stays a 304; images and the pages keep what they had.

import { describe, expect, it, vi } from 'vitest';

import type { Env } from '../website/api/types';

vi.mock('../website/generated/blog-data.js', () => ({ latestBlogPost: null }));

const PAGES_DEFAULT = 'public, max-age=0, must-revalidate';

/** The worker over a stand-in ASSETS that answers every file with `status` and an ETag. */
async function serve(path: string, status = 200, init: RequestInit = {}): Promise<{ res: Response; asked: string[] }> {
  const { default: worker } = await import('../website/_worker');
  const asked: string[] = [];
  const ASSETS = {
    fetch: async (input: Request | string) => {
      asked.push(typeof input === 'string' ? input : input.url);
      return new Response(status === 304 ? null : `body of ${path}`, {
        status,
        headers: { 'Cache-Control': PAGES_DEFAULT, ETag: '"abc"', 'Content-Type': 'text/javascript' },
      });
    },
  };
  const res = await worker.fetch(new Request(`https://pathogen.studio${path}`, init), { ASSETS } as unknown as Env);
  return { res, asked };
}

describe("the playground's code is checked on every load", () => {
  it.each([
    '/components/workspace-view.js',
    '/dist/pan-zoom.global.js',
    '/dist/index.global.js',
    '/vendor/opentype.js',
    '/workers/thumbnail.worker.mjs',
    '/styles/theme.css',
    '/dist/index.global.js.map',
    '/vendor/decoder.wasm',
    '/assets/data.json',
    '/vendor/Upper.JS',
  ])('%s: private, no-cache, its ETag kept', async (path) => {
    const { res, asked } = await serve(path);
    expect([res.status, res.headers.get('Cache-Control'), res.headers.get('ETag')]).toEqual([
      200,
      'private, no-cache',
      '"abc"',
    ]);
    expect(await res.text()).toBe(`body of ${path}`);
    // The request itself goes to Pages, so its conditional headers still reach it.
    expect(asked).toEqual([`https://pathogen.studio${path}`]);
  });

  it('an unchanged file asked again answers 304, with no body', async () => {
    const { res } = await serve('/components/app-shell.js', 304, { headers: { 'If-None-Match': '"abc"' } });
    expect([res.status, res.headers.get('Cache-Control'), await res.text()]).toEqual([304, 'private, no-cache', '']);
  });

  it.each(['/favicon.png', '/assets/material-icons-sprite.svg', '/fonts/Inter.woff2'])(
    '%s (not code): as Pages sends it',
    async (path) => {
      const { res } = await serve(path);
      expect(res.headers.get('Cache-Control')).toBe(PAGES_DEFAULT);
    },
  );

  // HTML needs nothing: Cloudflare doesn't hold pages for 4 hours, and Pages sends
  // them max-age=0, must-revalidate (live, 2026-11-23: /workspaces and /blog).
  it.each([
    ['/workspaces', 'https://pathogen.studio/spa.html'],
    ['/docs', 'https://pathogen.studio/docs/index.html'],
    ['/blog', 'https://pathogen.studio/blog/index.html'],
    ['/blog/heading-turn', 'https://pathogen.studio/blog/heading-turn.html'],
  ])('%s (HTML) is as Pages sends it', async (path, file) => {
    const { res, asked } = await serve(path);
    expect(asked).toEqual([file]);
    expect(res.headers.get('Cache-Control')).toBe(PAGES_DEFAULT);
  });
});
