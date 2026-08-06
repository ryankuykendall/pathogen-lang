// Puppeteer verification for array .first/.last properties and .filter() in
// the playground surface.
//
// Scenario 1 — valid program: .filter selects radii, .first/.last/.length feed
// circle() calls; asserts the preview renders exactly the expected arcs and no
// error panel.
// Scenario 2 — filter without a block: asserts the compile error surfaces in
// the error panel with the trailing-block message.
//
// Requires `npm run dev:website` (or dev:stack) on localhost:3000, with the
// playground rebuilt after any src/ change.

import { Command } from 'commander';
import puppeteer, { type Page } from 'puppeteer';

const program = new Command();
program
  .name('debug-array-first-last-filter')
  .description('Puppeteer verification that array .first/.last/.filter work in the playground surface')
  .option('--pages-url <url>', 'Pages dev URL', 'http://localhost:3000')
  .parse();
const opts = program.opts<{ pagesUrl: string }>();
const PAGES_URL = opts.pagesUrl;

function encodeState(code: string): string {
  return btoa(encodeURIComponent(JSON.stringify({ code })));
}

// big = [30, 22, 15]: first → r=30, last → r=15, length → r=3
const VALID_PROGRAM = `define ViewBox(0, 0, 300, 100);
let radii = [4, 30, 9, 22, 15];
let big = radii.filter {|r| return r >= 10; };
circle(50, 50, big.first);
circle(150, 50, big.last);
circle(250, 50, big.length);
`;

const MISSING_BLOCK_PROGRAM = `let r = [1, 2, 3].filter();
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
        localStorage.setItem('pathogen-lang:userId', 'e2e-array-first-last-filter');
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
    console.log('path d:', result?.pathData?.slice(0, 120) ?? '(none)');
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

const valid = await runScenario('.filter + .first/.last/.length render correctly', VALID_PROGRAM);
{
  check('no compile error', !valid?.errorPanelText);
  // circle(r) emits two 'a r r' arcs
  for (const r of [30, 15, 3]) {
    const arcCount = (valid?.pathData?.match(new RegExp(`a ${r} ${r}`, 'g')) ?? []).length;
    check(`circle with r=${r} rendered (got ${arcCount / 2})`, arcCount === 2);
  }
}

const missingBlock = await runScenario('filter without a block errors', MISSING_BLOCK_PROGRAM);
{
  check(
    'trailing-block error shown',
    !!missingBlock?.errorPanelText && /filter\(\) requires a trailing block/.test(missingBlock.errorPanelText),
  );
}

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
