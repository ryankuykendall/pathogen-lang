// Puppeteer verification for continue/break loop control in the playground.
//
// Scenario 1 — valid program: continue skips one circle, break caps the loop;
// asserts the preview renders exactly the expected paths and no error panel.
// Scenario 2 — misplaced break (inside a lambda): asserts the compile error
// surfaces in the error panel with the placement message.
//
// Requires `npm run dev:website` (or dev:stack) on localhost:3000, with the
// playground rebuilt after any src/ change.

import { Command } from 'commander';
import puppeteer, { type Page } from 'puppeteer';

const program = new Command();
program
  .name('debug-loop-control')
  .description('Puppeteer verification that continue/break work in the playground surface')
  .option('--pages-url <url>', 'Pages dev URL', 'http://localhost:3000')
  .parse();
const opts = program.opts<{ pagesUrl: string }>();
const PAGES_URL = opts.pagesUrl;

function encodeState(code: string): string {
  return btoa(encodeURIComponent(JSON.stringify({ code })));
}

const VALID_PROGRAM = `define ViewBox(0, 0, 300, 100);
for (i in 0..20) {
  if (i > 5) {
    break;
  }
  if (i == 2) {
    continue;
  }
  circle(calc(i * 40 + 20), 50, 12);
}
`;

const MISPLACED_PROGRAM = `for (i in 0..5) {
  let f = {|a| break; };
}
`;

interface ProbeResult {
  pathData: string | null;
  errorPanelText: string | null;
  previewStale: boolean | null;
}

async function probe(page: Page): Promise<ProbeResult> {
  return page.evaluate(() => {
    const deepQuery = (root: Document | ShadowRoot | Element, selector: string): Element | null => {
      const direct = (root as Document).querySelector?.(selector);
      if (direct) return direct;
      for (const el of Array.from((root as Document).querySelectorAll?.('*') ?? [])) {
        if (el.shadowRoot) {
          const found = deepQuery(el.shadowRoot, selector);
          if (found) return found;
        }
      }
      return null;
    };
    const result: ProbeResult = { pathData: null, errorPanelText: null, previewStale: null };
    const container = deepQuery(document, '#preview-container');
    if (container) result.previewStale = container.classList.contains('stale');
    const iframe = deepQuery(document, 'iframe') as HTMLIFrameElement | null;
    if (iframe?.contentDocument) {
      // Concatenate ALL path data — the first <path> is the preview's
      // background grid, not the compiled art.
      const ds = Array.from(iframe.contentDocument.querySelectorAll('path'))
        .map((p) => p.getAttribute('d') ?? '')
        .filter(Boolean);
      result.pathData = ds.length > 0 ? ds.join(' | ') : null;
    }
    const errPanel = deepQuery(document, 'error-panel');
    if (errPanel?.shadowRoot && getComputedStyle(errPanel).display !== 'none') {
      const text = Array.from(errPanel.shadowRoot.querySelectorAll(':not(style)'))
        .map((el) => (el.children.length === 0 ? el.textContent?.trim() : ''))
        .filter(Boolean)
        .join(' | ');
      if (text) result.errorPanelText = text.slice(0, 300);
    }
    return result;
  });
}

async function runScenario(name: string, code: string): Promise<ProbeResult | null> {
  console.log(`\n━━━ Scenario: ${name} ━━━`);
  const browser = await puppeteer.launch({ headless: true, defaultViewport: { width: 1400, height: 1000 } });
  try {
    const page = await browser.newPage();
    page.on('dialog', (d) => void d.dismiss());
    page.on('pageerror', (err) => console.log('[pageerror]', err.message));
    await page.evaluateOnNewDocument(() => {
      (window as unknown as { __name?: <T>(fn: T) => T }).__name = <T>(fn: T): T => fn;
      try {
        localStorage.setItem('pathogen-lang:userId', 'e2e-loop-control');
      } catch {
        /* ignore */
      }
    });
    await page.goto(`${PAGES_URL}/workspace/scratch?state=${encodeState(code)}`, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });
    let result: ProbeResult | null = null;
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 500));
      result = await probe(page);
      if (result.errorPanelText || (result.pathData && result.previewStale === false)) break;
    }
    console.log('path d:', result?.pathData?.slice(0, 80) ?? '(none)');
    console.log('error:', result?.errorPanelText ?? '(none)');
    console.log('stale:', result?.previewStale);
    return result;
  } finally {
    await browser.close();
  }
}

let failures = 0;
function check(label: string, ok: boolean): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${label}`);
  if (!ok) failures++;
}

const valid = await runScenario('continue + break render correctly', VALID_PROGRAM);
{
  check('no compile error', !valid?.errorPanelText);
  // 5 circles: i = 0,1,3,4,5 (2 skipped by continue, 6+ cut by break),
  // each circle = two 'a 12 12' arcs
  const arcCount = (valid?.pathData?.match(/a 12 12/g) ?? []).length;
  check(`exactly 5 circles rendered (got ${arcCount / 2})`, arcCount === 10);
}

const misplaced = await runScenario('misplaced break errors', MISPLACED_PROGRAM);
{
  check(
    'placement error shown',
    !!misplaced?.errorPanelText && /'break' is only valid inside a for loop/.test(misplaced.errorPanelText),
  );
}

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
