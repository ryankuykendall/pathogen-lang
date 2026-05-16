// Walk every moderation tab, capture the action labels on each card,
// and screenshot. Used to verify the simplified two-action spec
// (per tab) + the "Flagged user" badge propagation across tabs.
//
// Prereqs:
//   - npm run dev:stack running on :3000 + :8787
//   - npm run seed:dev applied
//   - Optionally flag a workspace beforehand so the Flagged Workspaces
//     tab has something to display.
//
// Usage:
//   tsx scripts/debug-admin-tabs.ts

import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Command } from 'commander';
import puppeteer from 'puppeteer';

const __dirname = dirname(fileURLToPath(import.meta.url));
const API_DIR = join(__dirname, '..', 'api');

const SEED_ADMIN_ID = '2b3a98582b3a98582b3a98582b3a9858';
const DEBUG_TOKEN = 'puppeteer-tabs-' + Math.random().toString(36).slice(2, 10);

function installSession(): void {
  const nowMs = Date.now();
  const expires = nowMs + 86_400_000;
  execFileSync(
    'npx',
    [
      'wrangler', 'd1', 'execute', 'svg-path-extended-users', '--local', '--persist-to=../.wrangler/state',
      '--command',
      `DELETE FROM sessions WHERE token LIKE 'puppeteer-tabs-%';
       INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES ('${DEBUG_TOKEN}', '${SEED_ADMIN_ID}', ${nowMs}, ${expires});`,
    ],
    { cwd: API_DIR, stdio: ['pipe', 'pipe', 'inherit'] },
  );
}

const TABS = [
  'pending',
  'rereview',
  'approved',
  'featured',
  'rejected',
  'flagged-workspaces',
  'flagged-users',
] as const;

const program = new Command();
program
  .name('debug-admin-tabs')
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

      await page.goto(`${opts.pagesUrl}/admin/moderation`, {
        waitUntil: 'networkidle2',
        timeout: 30_000,
      });
      await page.waitForFunction(
        () => {
          const shell = document.querySelector('app-shell');
          return !!shell?.shadowRoot?.querySelector('admin-moderation-view');
        },
        { timeout: 10_000 },
      );
      // Wait for the initial parallel-fetch of all tabs to complete.
      await new Promise((r) => setTimeout(r, 2500));

      for (const tab of TABS) {
        const switched = await page.evaluate((t) => {
          const shell = document.querySelector('app-shell');
          const view = shell?.shadowRoot?.querySelector('admin-moderation-view');
          if (!view?.shadowRoot) return false;
          const btn = view.shadowRoot.querySelector(`[data-tab="${t}"]`) as HTMLElement | null;
          if (!btn) return false;
          btn.click();
          return true;
        }, tab);
        if (!switched) {
          console.log(`[${tab}] tab button not found`);
          continue;
        }
        await new Promise((r) => setTimeout(r, 1200));

        const report = await page.evaluate(() => {
          const shell = document.querySelector('app-shell');
          const view = shell?.shadowRoot?.querySelector('admin-moderation-view');
          if (!view?.shadowRoot) return { error: 'no view' };
          const activeTabBtn = view.shadowRoot.querySelector('.tab.active');
          const activeTab = activeTabBtn?.textContent?.trim();
          const cards = Array.from(view.shadowRoot.querySelectorAll('li.card')).map((card) => {
            const title = (card.querySelector('.card-title') as HTMLElement | null)?.innerText?.trim() ?? '';
            const actions = Array.from(card.querySelectorAll('.actions button, .actions input')).map((b) => {
              const el = b as HTMLElement;
              return (el.textContent?.trim() || el.getAttribute('title') || el.tagName).slice(0, 40);
            });
            const hasFlagBadge = !!card.querySelector('.badge-flag');
            return { title, actions, hasFlagBadge };
          });
          return { activeTab, cardCount: cards.length, cards: cards.slice(0, 4) };
        });
        console.log(`\n--- ${tab} ---`);
        console.log(JSON.stringify(report, null, 2));
        const filename = `${opts.outDir}/admin-tab-${tab}.png`;
        await page.screenshot({ path: filename, fullPage: false });
      }
    } finally {
      await browser.close();
      execFileSync(
        'npx',
        ['wrangler', 'd1', 'execute', 'svg-path-extended-users', '--local', '--persist-to=../.wrangler/state',
         '--command', "DELETE FROM sessions WHERE token LIKE 'puppeteer-tabs-%';"],
        { cwd: API_DIR, stdio: ['pipe', 'pipe', 'inherit'] },
      );
    }
  });
program.parse();
