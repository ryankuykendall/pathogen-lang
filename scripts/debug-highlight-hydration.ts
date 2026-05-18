// Puppeteer probe for the workspace-detail source-code highlighter.
//
// Loads /u/seed-alice/alice-cluster, expands the "View source" disclosure,
// waits for the lazy-loaded highlight bundle to hydrate, then reports
// what landed in the DOM. Surfaces three things:
//   1. Whether /dist/highlight.global.js was requested + its HTTP status
//   2. Any page errors (uncaught exceptions, unhandled rejections)
//   3. Whether <pre.detail-source-code> ended up with token <span> children,
//      a sample of those classes, and the resulting innerHTML head

import { Command } from 'commander';
import puppeteer from 'puppeteer';

const program = new Command();
program
  .name('debug-highlight-hydration')
  .option('--url <url>', 'Detail page to load', 'http://localhost:3000/u/seed-alice/alice-cluster')
  .option('--out <path>', 'Screenshot output', '/tmp/highlight-probe.png')
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

      const requestLog: Array<{ url: string; status?: number; failure?: string }> = [];
      const matches = (u: string) =>
        u.includes('highlight.global.js') ||
        u.includes('detail-source-mount') ||
        u.includes('esm.sh/@codemirror') ||
        u.includes('esm.sh/@uiw');
      page.on('response', (resp) => {
        const url = resp.url();
        if (matches(url)) requestLog.push({ url: url.replace(/^https?:\/\//, ''), status: resp.status() });
      });
      page.on('requestfailed', (req) => {
        const url = req.url();
        if (matches(url)) requestLog.push({ url: url.replace(/^https?:\/\//, ''), failure: req.failure()?.errorText });
      });

      // Step 1: load the page
      await page.goto(opts.url, { waitUntil: 'networkidle2', timeout: 20_000 });
      console.log(`[load] ${opts.url}`);

      // Step 2: confirm the SSR'd DOM has the disclosure + plain pre
      const ssrProbe = await page.evaluate(() => {
        const details = document.querySelector('details.detail-source-disclosure');
        if (!details) return { error: 'no <details> on page' };
        const pre = details.querySelector('pre.detail-source-code');
        return {
          detailsOpen: (details as HTMLDetailsElement).open,
          prePresent: !!pre,
          spanCount: pre ? pre.querySelectorAll('span').length : 0,
          preHead: pre ? (pre.textContent || '').slice(0, 80) : null,
        };
      });
      console.log('[ssr]', JSON.stringify(ssrProbe, null, 2));

      // Step 3: open the disclosure to trigger the boot script
      await page.evaluate(() => {
        const d = document.querySelector('details.detail-source-disclosure') as HTMLDetailsElement | null;
        if (d) d.open = true;
      });

      // Step 4: wait for the bundle to load and hydration to happen
      // (CodeMirror mount from esm.sh takes longer than the in-place swap)
      await new Promise((r) => setTimeout(r, 4500));

      // Step 5: inspect post-hydration DOM. Two possible end states:
      //   (a) CodeMirror mounted — <pre> has been replaced by .detail-
      //       source-editor with cm-editor inside it
      //   (b) Fallback hit — <pre.detail-source-code> still present,
      //       innerHTML is span-wrapped
      const hydrationProbe = await page.evaluate(() => {
        const details = document.querySelector('details.detail-source-disclosure');
        if (!details) return { error: 'no <details>' };
        const editor = details.querySelector('.detail-source-editor .cm-editor');
        if (editor) {
          const gutter = details.querySelector('.cm-gutters');
          const lineNumbers = details.querySelectorAll('.cm-lineNumbers .cm-gutterElement');
          const contentLines = details.querySelectorAll('.cm-line');
          return {
            mode: 'codemirror',
            hasGutter: !!gutter,
            lineNumberCount: lineNumbers.length,
            contentLineCount: contentLines.length,
            firstLineText: contentLines[0]?.textContent?.slice(0, 60) ?? null,
          };
        }
        const pre = details.querySelector('pre.detail-source-code');
        if (!pre) return { mode: 'unknown', error: 'no pre and no editor' };
        const spans = pre.querySelectorAll('span');
        const classes: Record<string, number> = {};
        spans.forEach((s) => {
          const c = s.className || '(empty)';
          classes[c] = (classes[c] || 0) + 1;
        });
        return {
          mode: 'fallback-spans',
          spanCount: spans.length,
          classCounts: classes,
        };
      });
      console.log('[hydrated]', JSON.stringify(hydrationProbe, null, 2));

      console.log('[network]', requestLog);

      await page.screenshot({ path: opts.out, fullPage: true });
      console.log(`[screenshot] ${opts.out}`);
    } finally {
      await browser.close();
    }
  });
program.parse();
