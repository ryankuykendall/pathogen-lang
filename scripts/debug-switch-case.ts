// Puppeteer verification for the `switch` / `case` statement in the
// playground surface (three-surface parity: CLI ↔ playground ↔ VS Code).
//
// Scenario 1 — ranges demo (angle quadrants, open-ended ranges): asserts the
// preview renders the same path data the CLI produces and no error panel.
// Scenario 2 — destructuring + guards demo: same check.
// Scenario 3 — text-body switch: asserts the <tspan> labels chosen by the
// range patterns appear in the preview's <text> elements.
// Scenario 4 — misplaced `default`: asserts the builder's parse error reaches
// the error panel.
// Scenario 5 — `switch` keyword completion appears in the editor popup.
//
// Requires `npm run dev:website` (or dev:stack) on localhost:3000, with the
// playground rebuilt after any src/ change
// (`PATHOGEN_API_BASE=http://localhost:8787 npm run build:website`).

import { readFileSync } from 'node:fs';
import { Command } from 'commander';
import puppeteer from 'puppeteer';
import type { Page } from 'puppeteer';
import { compile } from '../src';

const program = new Command();
program
  .name('debug-switch-case')
  .description('Puppeteer verification that switch/case renders identically in the playground')
  .option('--pages-url <url>', 'Pages dev URL', 'http://localhost:3000')
  .parse();
const opts = program.opts<{ pagesUrl: string }>();
const PAGES_URL = opts.pagesUrl;

function encodeState(code: string): string {
  return btoa(encodeURIComponent(JSON.stringify({ code })));
}

const DEMO_DIR = 'project-docs/switch-case/';
const RANGES_PROGRAM = readFileSync(`${DEMO_DIR}demo-ranges.pathogen`, 'utf8');
const DESTRUCTURE_PROGRAM = readFileSync(`${DEMO_DIR}demo-destructure.pathogen`, 'utf8');
const TEXT_PROGRAM = readFileSync(`${DEMO_DIR}demo-text.pathogen`, 'utf8');

const MISPLACED_DEFAULT_PROGRAM = `let kind = 1;
switch (kind) {
  default { M 0 0 }
  case 1 { M 1 1 }
}
`;

interface ProbeResult {
  pathData: string | null;
  textContent: string | null;
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
    const result: ProbeResult = { pathData: null, textContent: null, errorPanelText: null, previewStale: null };
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
      const texts = Array.from(iframe.contentDocument.querySelectorAll('text'))
        .map((t) => t.textContent?.trim() ?? '')
        .filter(Boolean);
      result.textContent = texts.length > 0 ? texts.join(' | ') : null;
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

async function openPlayground(code: string, userId: string): Promise<{ page: Page; close: () => Promise<void> }> {
  const browser = await puppeteer.launch({ headless: true, defaultViewport: { width: 1400, height: 1000 } });
  const page = await browser.newPage();
  page.on('dialog', (d) => {
    d.dismiss().catch(() => undefined);
  });
  page.on('pageerror', (err) => console.log('[pageerror]', err.message));
  await page.evaluateOnNewDocument((id: string) => {
    (window as unknown as { __name?: <T>(fn: T) => T }).__name = <T>(fn: T): T => fn;
    try {
      localStorage.setItem('pathogen-lang:userId', id);
    } catch {
      /* ignore */
    }
  }, userId);
  await page.goto(`${PAGES_URL}/workspace/scratch?state=${encodeState(code)}`, {
    waitUntil: 'domcontentloaded',
    timeout: 30_000,
  });
  return { page, close: async () => browser.close() };
}

async function runScenario(name: string, code: string): Promise<ProbeResult | null> {
  console.log(`\n━━━ Scenario: ${name} ━━━`);
  const { page, close } = await openPlayground(code, 'e2e-switch-case');
  try {
    let result: ProbeResult | null = null;
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 500));
      result = await probe(page);
      if (result.errorPanelText || (result.pathData && result.previewStale === false)) break;
    }
    console.log('path d:', result?.pathData?.slice(0, 120) ?? '(none)');
    console.log('text:', result?.textContent ?? '(none)');
    console.log('error:', result?.errorPanelText ?? '(none)');
    console.log('stale:', result?.previewStale);
    return result;
  } finally {
    await close();
  }
}

/** The CLI/compiler view of the same program: every layer's path data. */
function cliPathData(code: string): string[] {
  const result = compile(code);
  return result.layers
    .map((layer) => (layer as { data?: string }).data ?? '')
    .filter(Boolean);
}

let failures = 0;
function check(label: string, ok: boolean): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${label}`);
  if (!ok) failures++;
}

// The preview emits absolute-coordinate path data with its own number
// formatting (it rounds 71.99999999999997 to 72), so compare on the set of
// `M x y` move-to anchors with both sides rounded to two decimals.
function moveAnchors(pathData: string): string[] {
  return (pathData.match(/M -?[\d.]+ -?[\d.]+/g) ?? []).map((m) =>
    m.replace(/-?[\d.]+/g, (n) => String(Math.round(Number(n) * 100) / 100)),
  );
}

for (const [name, code] of [
  ['ranges demo renders like the CLI', RANGES_PROGRAM],
  ['destructuring demo renders like the CLI', DESTRUCTURE_PROGRAM],
] as const) {
  const result = await runScenario(name, code);
  check('no compile error', !result?.errorPanelText);
  const expected = moveAnchors(cliPathData(code).join(' '));
  const got = new Set(moveAnchors(result?.pathData ?? ''));
  const missing = expected.filter((m) => !got.has(m));
  check(`every CLI move-to anchor is in the preview (${expected.length} anchors, ${missing.length} missing)`, missing.length === 0 && expected.length > 0);
}

{
  const result = await runScenario('text-body switch picks tspan labels', TEXT_PROGRAM);
  check('no compile error', !result?.errorPanelText);
  const text = result?.textContent ?? '';
  check('labels low / medium / high / high present', text.includes('low') && text.includes('medium') && (text.match(/high/g) ?? []).length === 2);
}

{
  const result = await runScenario('misplaced default surfaces in the error panel', MISPLACED_DEFAULT_PROGRAM);
  check("error panel mentions 'default' must be the last clause", /'default' must be the last clause/.test(result?.errorPanelText ?? ''));
}

{
  console.log('\n━━━ Scenario: switch keyword completion ━━━');
  const { page, close } = await openPlayground('let kind = 1;\n', 'e2e-switch-case');
  try {
    await new Promise((r) => setTimeout(r, 2000));
    const editorFound = await page.evaluate(() => {
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
      const content = deepQuery(document, '.cm-content') as HTMLElement | null;
      if (!content) return false;
      content.focus();
      return true;
    });
    check('editor focused', editorFound);
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.keyboard.type('swit', { delay: 60 });
    let options = '';
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 250));
      options = await page.evaluate(() => {
        const deepAll = (root: Document | ShadowRoot | Element, selector: string): Element[] => {
          const out = Array.from((root as Document).querySelectorAll?.(selector) ?? []);
          for (const el of Array.from((root as Document).querySelectorAll?.('*') ?? [])) {
            if (el.shadowRoot) out.push(...deepAll(el.shadowRoot, selector));
          }
          return out;
        };
        return deepAll(document, '.cm-tooltip-autocomplete li')
          .map((li) => li.textContent?.trim() ?? '')
          .join(' | ');
      });
      if (options.includes('switch')) break;
    }
    console.log('completion options:', options.slice(0, 200) || '(none)');
    check("completion popup offers 'switch'", options.includes('switch'));
  } finally {
    await close();
  }
}

console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
