// Puppeteer verification for the stdlib `cubicBezier(x1, y1, x2, y2, t)`
// timing curve in the playground surface.
//
// Scenario 1 — surface parity: the demo program from
//   project-docs/easing-interpolation/demo-cubic-bezier.pathogen renders with
//   no error panel, and every path layer the CLI compiler (`compile()` from
//   src/) produces appears verbatim in the preview iframe.
// Scenario 2 — editor tooling as served to the playground: the bundle's
//   getCompletions offers `cubicBezier` with its generated detail and snippet,
//   and getHoverInfo on the name shows the detail.
// Scenario 3 — an out-of-range x handle surfaces the positioned error in the
//   error panel.
//
// Requires `npm run dev:website` (or dev:stack) on localhost:3000, with the
// website rebuilt after the src/ change (PATHOGEN_API_BASE=http://localhost:8787
// npm run build:website while dev:stack is running).

import { readFileSync } from 'node:fs';
import { Command } from 'commander';
import puppeteer from 'puppeteer';
import type { Page } from 'puppeteer';
import { compile } from '../src';

const program = new Command();
program
  .name('debug-cubic-bezier')
  .description('Puppeteer verification that cubicBezier() renders and completes in the playground surface')
  .option('--pages-url <url>', 'Pages dev URL', 'http://localhost:3000')
  .parse();
const opts = program.opts<{ pagesUrl: string }>();
const PAGES_URL = opts.pagesUrl;

const DEMO_PATH = 'project-docs/easing-interpolation/demo-cubic-bezier.pathogen';
const DEMO_PROGRAM = readFileSync(DEMO_PATH, 'utf8');

const BAD_HANDLE_PROGRAM = `let start = 1;
let eased = cubicBezier(1.5, 0, 0.58, 1, 0.5);
M calc(eased) start
`;

function encodeState(code: string): string {
  return btoa(encodeURIComponent(JSON.stringify({ code })));
}

/** Round every number so CLI and preview path data compare on geometry, not float noise. */
function normalizePath(d: string): string {
  return d
    .replace(/-?\d+(?:\.\d+)?(?:e-?\d+)?/g, (n) => Number(n).toFixed(3))
    .replace(/\s+/g, ' ')
    .trim();
}

interface ProbeResult {
  paths: string[];
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
    const result: ProbeResult = { paths: [], errorPanelText: null, previewStale: null };
    const container = deepQuery(document, '#preview-container');
    if (container) result.previewStale = container.classList.contains('stale');
    const iframe = deepQuery(document, 'iframe') as HTMLIFrameElement | null;
    if (iframe?.contentDocument) {
      result.paths = Array.from(iframe.contentDocument.querySelectorAll('path'))
        .map((p) => p.getAttribute('d') ?? '')
        .filter(Boolean);
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

interface ToolingItem {
  label: string;
  detail?: string;
  insertText?: string;
}

interface ToolingResult {
  item: ToolingItem | null;
  hoverContents: string | null;
  sampleValue: number | null;
}

async function probeTooling(page: Page): Promise<ToolingResult> {
  return page.evaluate(() => {
    type Doc = object;
    const lang = (
      window as unknown as {
        PathogenLang: {
          StringTextDocument: new (source: string) => Doc;
          getCompletions: (doc: Doc, pos: { line: number; character: number }) => ToolingItem[];
          getHoverInfo: (doc: Doc, pos: { line: number; character: number }) => { contents: string } | null;
          stdlib: { cubicBezier?: (...ns: number[]) => number };
        };
      }
    ).PathogenLang;
    const items = lang.getCompletions(new lang.StringTextDocument('let e = cubicB'), { line: 0, character: 14 });
    const found = items.find((i) => i.label === 'cubicBezier');
    const item = found ? { label: found.label, detail: found.detail, insertText: found.insertText } : null;
    const hoverSource = 'let e = cubicBezier(0.42, 0, 0.58, 1, 0.5);';
    const hover = lang.getHoverInfo(new lang.StringTextDocument(hoverSource), { line: 0, character: 12 });
    const sampleValue = lang.stdlib.cubicBezier ? lang.stdlib.cubicBezier(0.42, 0, 0.58, 1, 0.3) : null;
    return { item, hoverContents: hover?.contents ?? null, sampleValue };
  });
}

async function withPage<T>(code: string, fn: (page: Page) => Promise<T>): Promise<T> {
  const browser = await puppeteer.launch({ headless: true, defaultViewport: { width: 1400, height: 1000 } });
  try {
    const page = await browser.newPage();
    page.on('dialog', (d) => {
      d.dismiss().catch(() => undefined);
    });
    page.on('pageerror', (err) => console.log('[pageerror]', err.message));
    await page.evaluateOnNewDocument(() => {
      (window as unknown as { __name?: <T>(fn: T) => T }).__name = <T>(fn: T): T => fn;
      try {
        localStorage.setItem('pathogen-lang:userId', 'e2e-cubic-bezier');
      } catch {
        /* ignore */
      }
    });
    await page.goto(`${PAGES_URL}/workspace/scratch?state=${encodeState(code)}`, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });
    return await fn(page);
  } finally {
    await browser.close();
  }
}

async function waitForCompile(page: Page): Promise<ProbeResult> {
  let result: ProbeResult = { paths: [], errorPanelText: null, previewStale: null };
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 500));
    result = await probe(page);
    if (result.errorPanelText || (result.paths.length > 0 && result.previewStale === false)) break;
  }
  return result;
}

let failures = 0;
function check(label: string, ok: boolean): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${label}`);
  if (!ok) failures++;
}

console.log('━━━ Scenario 1: demo renders with CLI parity ━━━');
const cli = compile(DEMO_PROGRAM);
const cliPaths = cli.layers.filter((l) => l.type === 'path').map((l) => l.data);
await withPage(DEMO_PROGRAM, async (page) => {
  const result = await waitForCompile(page);
  console.log(
    'preview paths:',
    result.paths.length,
    'error:',
    result.errorPanelText ?? '(none)',
    'stale:',
    result.previewStale,
  );
  check('no compile error in the playground', !result.errorPanelText);
  const previewNormalized = new Set(result.paths.map(normalizePath));
  check(`CLI produced ${cliPaths.length} path layers (expected 2: rails, dots)`, cliPaths.length === 2);
  for (const [i, d] of cliPaths.entries()) {
    check(`CLI layer ${i} path data appears verbatim in the preview`, previewNormalized.has(normalizePath(d)));
  }

  console.log('\n━━━ Scenario 2: served language services know cubicBezier ━━━');
  const tooling = await probeTooling(page);
  console.log('completion item:', JSON.stringify(tooling.item));
  console.log('hover:', tooling.hoverContents?.slice(0, 140) ?? '(none)');
  console.log('served stdlib cubicBezier(0.42, 0, 0.58, 1, 0.3) =', tooling.sampleValue);
  check(
    'completion offers cubicBezier with the generated detail',
    tooling.item?.detail === 'cubicBezier(x1, y1, x2, y2, t) — CSS cubic-bezier timing curve; y handles may overshoot',
  );
  check(
    'completion inserts the five-slot snippet',
    tooling.item?.insertText === 'cubicBezier(${1:x1}, ${2:y1}, ${3:x2}, ${4:y2}, ${5:t})$0',
  );
  check(
    'hover on cubicBezier shows the detail',
    !!tooling.hoverContents &&
      tooling.hoverContents.includes('cubicBezier') &&
      tooling.hoverContents.includes('CSS cubic-bezier timing curve'),
  );
  check(
    'served bundle computes the pinned bit-exact value',
    tooling.sampleValue === 0.18739590670531242,
  );
});

console.log('\n━━━ Scenario 3: out-of-range x handle surfaces a positioned error ━━━');
await withPage(BAD_HANDLE_PROGRAM, async (page) => {
  const result = await waitForCompile(page);
  console.log('error:', result.errorPanelText ?? '(none)');
  check(
    'cubicBezier(1.5, …) shows the handle-range error with its line',
    !!result.errorPanelText &&
      result.errorPanelText.includes('cubicBezier: x1 and x2 must be within [0, 1]') &&
      result.errorPanelText.includes('Line 2'),
  );
});

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
