// Puppeteer verification for the breadcrumb's Export → SVG size indicator.
//
// Scenario — compile a program in a scratch workspace and assert:
//   (a) the breadcrumb renders a `(N KB)`-style size span after the title,
//   (b) the raw byte count in the span's title attribute is BYTE-IDENTICAL
//       to the Blob the export modal's real _downloadSvg() produces with
//       default settings (the feature's core contract),
//   (c) the size span is absent outside workspace view (landing page).
//
// Requires `npm run dev:website` (or dev:stack) on localhost:3000, with the
// playground rebuilt (`PATHOGEN_API_BASE=http://localhost:8787 npm run
// build:playground`) after any playground/ change.

import { Command } from 'commander';
import puppeteer, { type Page } from 'puppeteer';

const program = new Command();
program
  .name('debug-export-size-breadcrumb')
  .description('Puppeteer verification that the breadcrumb export-size matches the actual SVG export byte count')
  .option('--pages-url <url>', 'Pages dev URL', 'http://localhost:3000')
  .parse();
const opts = program.opts<{ pagesUrl: string }>();
const PAGES_URL = opts.pagesUrl;

function encodeState(code: string): string {
  return btoa(encodeURIComponent(JSON.stringify({ code })));
}

const PROGRAM_SOURCE = `define ViewBox(0, 0, 300, 200);
circle(150, 100, 60);
rect(20, 20, 80, 40);
`;

interface SizeProbe {
  sizeText: string | null;
  titleBytes: number | null;
}

async function probeSize(page: Page): Promise<SizeProbe> {
  return page.evaluate(() => {
    // app-breadcrumb lives inside app-shell's shadow root — pierce it
    const deepQuery = (root: Document | ShadowRoot, selector: string): Element | null => {
      const direct = root.querySelector(selector);
      if (direct) return direct;
      for (const el of Array.from(root.querySelectorAll('*'))) {
        if (el.shadowRoot) {
          const found = deepQuery(el.shadowRoot, selector);
          if (found) return found;
        }
      }
      return null;
    };
    const result: { sizeText: string | null; titleBytes: number | null } = { sizeText: null, titleBytes: null };
    const breadcrumb = deepQuery(document, 'app-breadcrumb');
    const span = breadcrumb?.shadowRoot?.querySelector('.workspace-size');
    if (span) {
      result.sizeText = span.textContent?.trim() ?? null;
      const title = span.getAttribute('title') ?? '';
      const m = /^([\d,]+) bytes/.exec(title);
      if (m) result.titleBytes = Number(m[1].replace(/,/g, ''));
    }
    return result;
  });
}

let failures = 0;
function check(label: string, ok: boolean): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${label}`);
  if (!ok) failures++;
}

const browser = await puppeteer.launch({ headless: true, defaultViewport: { width: 1400, height: 1000 } });
try {
  const page = await browser.newPage();
  page.on('dialog', (d) => void d.dismiss());
  page.on('pageerror', (err) => console.log('[pageerror]', err.message));
  await page.evaluateOnNewDocument(() => {
    (window as unknown as { __name?: <T>(fn: T) => T }).__name = <T>(fn: T): T => fn;
    try {
      localStorage.setItem('pathogen-lang:userId', 'e2e-export-size');
    } catch {
      /* ignore */
    }
  });
  await page.goto(`${PAGES_URL}/workspace/scratch?state=${encodeState(PROGRAM_SOURCE)}`, {
    waitUntil: 'domcontentloaded',
    timeout: 30_000,
  });

  // Poll until the size span appears AND its byte count is stable across two
  // consecutive probes — the first compute runs before the chrome-font fetch
  // settles, then recomputes with the font bytes included.
  let probe: SizeProbe = { sizeText: null, titleBytes: null };
  let stable = false;
  let prevBytes: number | null = null;
  for (let i = 0; i < 40 && !stable; i++) {
    await new Promise((r) => setTimeout(r, 500));
    probe = await probeSize(page);
    stable = probe.titleBytes != null && probe.titleBytes === prevBytes;
    prevBytes = probe.titleBytes;
  }
  console.log('size span:', probe.sizeText ?? '(none)', '| raw bytes:', probe.titleBytes ?? '(none)');
  check('size span renders after the title', probe.sizeText != null);
  check('size span format is "(N <unit>)"', /^\(\d+(\.\d+)? (B|KB|MB)\)$/.test(probe.sizeText ?? ''));
  check('byte count settled (fonts cached)', stable);

  // Core contract: the breadcrumb number is byte-identical to the Blob the
  // export modal actually downloads with default settings.
  const blobSize = await page.evaluate(async () => {
    document.dispatchEvent(new CustomEvent('open-export', { bubbles: true, composed: true }));
    await new Promise((r) => setTimeout(r, 300));
    const findModal = (root: Document | ShadowRoot): Element | null => {
      const direct = root.querySelector('export-modal');
      if (direct) return direct;
      for (const el of Array.from(root.querySelectorAll('*'))) {
        if (el.shadowRoot) {
          const found = findModal(el.shadowRoot);
          if (found) return found;
        }
      }
      return null;
    };
    const modal = findModal(document) as (Element & { _downloadSvg?: () => Promise<Blob> }) | null;
    if (!modal?._downloadSvg) return null;
    const blob = await modal._downloadSvg();
    return blob.size;
  });
  console.log('export blob size:', blobSize ?? '(modal not reachable)');
  check('export modal reachable', blobSize != null);
  check(
    `breadcrumb bytes === export blob bytes (${probe.titleBytes} vs ${blobSize})`,
    blobSize != null && probe.titleBytes === blobSize,
  );

  // Outside workspace view the span must not render.
  await page.goto(`${PAGES_URL}/pathogen`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await new Promise((r) => setTimeout(r, 1000));
  const landing = await probeSize(page);
  check('size span absent outside workspace view', landing.sizeText == null);
} finally {
  await browser.close();
}

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
