// Puppeteer survey of every surface that uses <mini-workspace>:
//   1. /admin/moderation modal (admin reviewing a pending workspace)
//   2. /u/:handle/:slug   (read-only workspace detail page)
//   3. /blog/:slug         (blog post embed)
//
// Captures a screenshot of each and prints DOM diagnostics so we can
// see what's actually rendering vs what's broken. Used when chasing
// mini-workspace visual regressions across surfaces.

import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Command } from 'commander';
import puppeteer from 'puppeteer';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const SEED_ADMIN_ID = '2b3a98582b3a98582b3a98582b3a9858';
const DEBUG_TOKEN = 'puppeteer-regression-' + Math.random().toString(36).slice(2, 10);

function installSession(): void {
  const nowMs = Date.now();
  const expires = nowMs + 86_400_000;
  execFileSync(
    'npx',
    [
      'wrangler', 'd1', 'execute', 'svg-path-extended-users', '--local',
      '--persist-to=../.wrangler/state',
      '--command',
      `DELETE FROM sessions WHERE token LIKE 'puppeteer-regression-%';
       INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES ('${DEBUG_TOKEN}', '${SEED_ADMIN_ID}', ${nowMs}, ${expires});`,
    ],
    { cwd: join(ROOT, 'api'), stdio: ['pipe', 'pipe', 'inherit'] },
  );
}

const program = new Command();
program
  .name('debug-mini-workspace-regressions')
  .option('--pages-url <url>', 'Pages dev URL', 'http://localhost:3000')
  .option('--api-url <url>', 'API dev URL', 'http://localhost:8787')
  .option('--out-dir <dir>', 'Screenshot dir', '/tmp')
  .action(async (opts: { pagesUrl: string; apiUrl: string; outDir: string }) => {
    installSession();
    const browser = await puppeteer.launch({
      headless: true,
      defaultViewport: { width: 1400, height: 1100 },
    });
    try {
      const page = await browser.newPage();
      page.on('pageerror', (err) => console.log('[pageerror]', err.message));
      await page.evaluateOnNewDocument(() => {
        (window as unknown as { __name?: <T>(fn: T) => T }).__name = <T>(fn: T): T => fn;
      });

      const apiOrigin = new URL(opts.apiUrl);
      const pagesOrigin = new URL(opts.pagesUrl);
      await page.setCookie(
        { name: 'pathogen_session', value: DEBUG_TOKEN, domain: apiOrigin.hostname, path: '/' },
        { name: 'pathogen_session', value: DEBUG_TOKEN, domain: pagesOrigin.hostname, path: '/' },
      );

      // ── 1. Workspace detail page ───────────────────────────────────
      // Visit each of the seed-approved workspaces to spot the
      // empty-preview vs working-preview difference.
      const detailPaths = [
        '/u/seed-alice/alice-circle',
        '/u/seed-bob/bob-star',
        '/u/ryan-kuykendall/more-awesome-pattern',
      ];
      for (const path of detailPaths) {
        try {
          await page.goto(`${opts.pagesUrl}${path}`, { waitUntil: 'networkidle2', timeout: 20_000 });
        } catch {
          console.log(`[detail ${path}] navigation failed`);
          continue;
        }
        await new Promise((r) => setTimeout(r, 2500));
        const probe = await page.evaluate(() => {
          const mw = document.querySelector('mini-workspace');
          if (!mw) return { error: 'no mini-workspace on page' };
          const codeChild = mw.querySelector('code');
          const svgChild = mw.querySelector('svg');
          const imgChild = mw.querySelector('img');
          const rect = mw.getBoundingClientRect();
          const playgroundLink = mw.shadowRoot?.querySelector('.playground-link');
          const playgroundLinkPos = playgroundLink
            ? (() => {
                const r = (playgroundLink as HTMLElement).getBoundingClientRect();
                const cs = getComputedStyle(playgroundLink as HTMLElement);
                return { dim: `${Math.round(r.width)}x${Math.round(r.height)}`, pos: cs.position, right: cs.right, top: cs.top, color: cs.backgroundColor };
              })()
            : null;
          // Inner iframe preview
          const preview = mw.shadowRoot?.querySelector('mini-preview');
          const iframe = preview?.shadowRoot?.querySelector('#preview-frame') as HTMLIFrameElement | null;
          const idoc = iframe?.contentDocument;
          const contentGroup = idoc?.getElementById('preview-content');
          const firstChild = contentGroup?.firstElementChild;
          return {
            mwDim: `${Math.round(rect.width)}x${Math.round(rect.height)}`,
            codePresent: !!codeChild,
            codeLen: codeChild?.textContent?.length ?? 0,
            svgPresent: !!svgChild,
            imgPresent: !!imgChild,
            imgSrc: imgChild?.getAttribute('src') ?? null,
            playgroundLink: playgroundLinkPos,
            iframePresent: !!iframe,
            iframeSize: iframe ? `${iframe.clientWidth}x${iframe.clientHeight}` : null,
            previewFirstChildTag: firstChild?.tagName.toLowerCase() ?? null,
            previewFirstChildD: firstChild?.getAttribute('d')?.slice(0, 40) ?? null,
          };
        });
        console.log(`\n[detail ${path}]`);
        console.log(JSON.stringify(probe, null, 2));
        const slug = path.replace(/\//g, '_').slice(1);
        const file = `${opts.outDir}/regression-detail-${slug}.png`;
        await page.screenshot({ path: file, fullPage: false });
        console.log(`  saved ${file}`);
      }

      // ── 2. Admin moderation modal ──────────────────────────────────
      await page.goto(`${opts.pagesUrl}/admin/moderation`, { waitUntil: 'networkidle2', timeout: 20_000 });
      await page.waitForFunction(
        () => !!document.querySelector('app-shell')?.shadowRoot?.querySelector('admin-moderation-view'),
        { timeout: 10_000 },
      );
      await new Promise((r) => setTimeout(r, 2500));
      // Click first Review (thumbnail click) in Pending tab.
      const reviewClicked = await page.evaluate(() => {
        const shell = document.querySelector('app-shell');
        const view = shell?.shadowRoot?.querySelector('admin-moderation-view');
        const btn = view?.shadowRoot?.querySelector('[data-action="review"]') as HTMLElement | null;
        if (!btn) return false;
        btn.click();
        return true;
      });
      console.log(`\n[admin-moderation] review-click: ${reviewClicked}`);
      if (reviewClicked) {
        await new Promise((r) => setTimeout(r, 3500));
        const modalProbe = await page.evaluate(() => {
          const shell = document.querySelector('app-shell');
          const view = shell?.shadowRoot?.querySelector('admin-moderation-view');
          const modal = view?.shadowRoot?.querySelector('.modal');
          const mw = view?.shadowRoot?.querySelector('mini-workspace');
          if (!mw) return { error: 'no mini-workspace in modal' };
          const rect = mw.getBoundingClientRect();
          const modalRect = modal?.getBoundingClientRect();
          const preview = mw.shadowRoot?.querySelector('mini-preview');
          const iframe = preview?.shadowRoot?.querySelector('#preview-frame') as HTMLIFrameElement | null;
          return {
            modalDim: modalRect ? `${Math.round(modalRect.width)}x${Math.round(modalRect.height)}` : null,
            mwDim: `${Math.round(rect.width)}x${Math.round(rect.height)}`,
            iframeSize: iframe ? `${iframe.clientWidth}x${iframe.clientHeight}` : null,
          };
        });
        console.log(JSON.stringify(modalProbe, null, 2));
        const file = `${opts.outDir}/regression-admin-modal.png`;
        await page.screenshot({ path: file, fullPage: false });
        console.log(`  saved ${file}`);
      }

      // ── 3. Blog post with mini-workspace ───────────────────────────
      // Find one. The custom-filters-pipeline post heavily uses them.
      const blogUrl = `${opts.pagesUrl}/blog/custom-filters-pipeline`;
      try {
        await page.goto(blogUrl, { waitUntil: 'networkidle2', timeout: 30_000 });
        await new Promise((r) => setTimeout(r, 3000));
        const blogProbe = await page.evaluate(() => {
          const mws = Array.from(document.querySelectorAll('mini-workspace'));
          return {
            count: mws.length,
            first: mws[0]
              ? (() => {
                  const mw = mws[0];
                  const rect = mw.getBoundingClientRect();
                  const code = mw.querySelector('code');
                  const img = mw.querySelector('img');
                  const preview = mw.shadowRoot?.querySelector('mini-preview');
                  const iframe = preview?.shadowRoot?.querySelector('#preview-frame') as HTMLIFrameElement | null;
                  const idoc = iframe?.contentDocument;
                  const contentGroup = idoc?.getElementById('preview-content');
                  return {
                    dim: `${Math.round(rect.width)}x${Math.round(rect.height)}`,
                    codePresent: !!code,
                    imgSrc: img?.getAttribute('src') ?? null,
                    iframeSize: iframe ? `${iframe.clientWidth}x${iframe.clientHeight}` : null,
                    previewChildren: contentGroup?.children.length ?? 'no-group',
                  };
                })()
              : null,
          };
        });
        console.log(`\n[blog custom-filters-pipeline]`);
        console.log(JSON.stringify(blogProbe, null, 2));
        const file = `${opts.outDir}/regression-blog.png`;
        await page.screenshot({ path: file, fullPage: false });
        console.log(`  saved ${file}`);
      } catch (err) {
        console.log(`[blog] failed: ${(err as Error).message}`);
      }

      // ── 4. Explore + featured screenshots (for the agentic review) ──
      for (const path of ['/explore', '/featured']) {
        try {
          await page.goto(`${opts.pagesUrl}${path}`, { waitUntil: 'networkidle2', timeout: 20_000 });
          await new Promise((r) => setTimeout(r, 1500));
          const file = `${opts.outDir}/showcase${path.replace(/\//g, '-')}.png`;
          await page.screenshot({ path: file, fullPage: true });
          console.log(`  saved ${file}`);
        } catch (err) {
          console.log(`[${path}] failed: ${(err as Error).message}`);
        }
      }
    } finally {
      await browser.close();
      execFileSync(
        'npx',
        ['wrangler', 'd1', 'execute', 'svg-path-extended-users', '--local',
         '--persist-to=../.wrangler/state',
         '--command', "DELETE FROM sessions WHERE token LIKE 'puppeteer-regression-%';"],
        { cwd: join(ROOT, 'api'), stdio: ['pipe', 'pipe', 'inherit'] },
      );
    }
  });
program.parse();
