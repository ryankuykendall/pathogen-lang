// Puppeteer probe for the "Open as new workspace" / fork-from-approval
// flow. Loads the new-workspace route with fromHandle + fromSlug query
// params and reports:
//   1. What routeQuery the SPA store ended up with
//   2. Whether the /u/.../source.json fetch was issued
//   3. The form's input values after a reasonable wait
//
// Use this to triage the "form stays empty after fork click" bug.

import { Command } from 'commander';
import puppeteer from 'puppeteer';

const program = new Command();
program
  .name('debug-fork-flow')
  .option(
    '--url <url>',
    'New-workspace URL with fromHandle/fromSlug',
    'http://localhost:3000/workspace/new?fromHandle=ryan-kuykendall&fromSlug=clifford-attractor-experimint',
  )
  .option('--out <path>', 'Screenshot output', '/tmp/fork-flow.png')
  .action(async (opts: { url: string; out: string }) => {
    const browser = await puppeteer.launch({
      headless: true,
      defaultViewport: { width: 1400, height: 1100 },
    });
    try {
      const page = await browser.newPage();
      page.on('pageerror', (err) => console.log('[pageerror]', err.message));
      page.on('console', (msg) => {
        const type = msg.type();
        if (type === 'error' || type === 'warning') {
          console.log(`[console.${type}]`, msg.text());
        }
      });

      const requests: Array<{ url: string; status?: number; failure?: string }> = [];
      const allResponses: Array<{ url: string; status: number }> = [];
      page.on('response', (resp) => {
        const u = resp.url();
        allResponses.push({ url: u.replace('http://localhost:3000', ''), status: resp.status() });
        if (u.includes('source.json') || u.includes('new-workspace-view.js')) {
          requests.push({ url: u, status: resp.status() });
        }
      });
      page.on('requestfailed', (req) => {
        const u = req.url();
        if (u.includes('source.json') || u.includes('new-workspace-view.js')) {
          requests.push({ url: u, failure: req.failure()?.errorText });
        }
      });

      await page.goto(opts.url, { waitUntil: 'networkidle2', timeout: 20_000 });
      await new Promise((r) => setTimeout(r, 2500));

      const probe = await page.evaluate(() => {
        // Try to reach into the SPA shell to inspect store + form state.
        const appShell = document.querySelector('app-shell');
        const view = appShell?.shadowRoot?.querySelector('new-workspace-view');
        const sr = view?.shadowRoot;
        if (!sr) {
          return { error: 'no new-workspace-view shadow root', urlAtLoad: location.href };
        }
        const nameInput = sr.querySelector('input[name="name"]') as HTMLInputElement | null;
        const descInput = sr.querySelector('textarea[name="description"]') as HTMLTextAreaElement | null;
        const widthInput = sr.querySelector('input[name="width"]') as HTMLInputElement | null;
        const heightInput = sr.querySelector('input[name="height"]') as HTMLInputElement | null;
        const errorMsg = sr.querySelector('.error-message, .form-error, [role="alert"]')?.textContent ?? null;

        // Inspect the global store if it's exposed (services/store.ts
        // doesn't put it on window by default, but a debug build might).
        const winStore = (window as unknown as { __PATHOGEN_STORE__?: { get(k: string): unknown } }).__PATHOGEN_STORE__;
        const storeQuery = winStore ? winStore.get('routeQuery') : 'no-store';

        return {
          urlAtLoad: location.href,
          name: nameInput?.value ?? null,
          desc: descInput?.value ?? null,
          width: widthInput?.value ?? null,
          height: heightInput?.value ?? null,
          errorMsg,
          storeQuery,
        };
      });
      console.log('[probe]', JSON.stringify(probe, null, 2));
      console.log('[requests]', requests);
      const failing = allResponses.filter((r) => r.status >= 400);
      console.log('[non-2xx]', failing);

      await page.screenshot({ path: opts.out, fullPage: false });
    } finally {
      await browser.close();
    }
  });
program.parse();
