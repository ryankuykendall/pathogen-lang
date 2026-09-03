// Puppeteer verification for PathBlock / ProjectedPath `.centerPoint()` in the
// playground surface.
//
// Scenario 1 — surface parity: the demo program from
//   project-docs/pathblock-center-point/centerpoint-demo.pathogen renders with
//   no error panel, and every path layer the CLI compiler (`compile()` from
//   src/) produces appears verbatim in the preview iframe.
// Scenario 2 — editor tooling as served to the playground: the bundle's
//   getCompletions offers `centerPoint` on a PathBlock and on a ProjectedPath,
//   `shape.centerPoint().` offers Point members, and getHoverInfo on the method
//   name shows its detail.
// Scenario 3 — `centerPoint(1)` surfaces the arity error in the error panel.
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
  .name('debug-centerpoint')
  .description('Puppeteer verification that centerPoint() renders and completes in the playground surface')
  .option('--pages-url <url>', 'Pages dev URL', 'http://localhost:3000')
  .parse();
const opts = program.opts<{ pagesUrl: string }>();
const PAGES_URL = opts.pagesUrl;

const DEMO_PATH = 'project-docs/pathblock-center-point/centerpoint-demo.pathogen';
const DEMO_PROGRAM = readFileSync(DEMO_PATH, 'utf8');

const ARITY_PROGRAM = `let p = @{ h 50 };
log(p.centerPoint(1));
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
  pathBlockItem: ToolingItem | null;
  projectedItem: ToolingItem | null;
  chainedLabels: string[];
  hoverContents: string | null;
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
        };
      }
    ).PathogenLang;
    const complete = (source: string, line: number, character: number): ToolingItem[] =>
      lang.getCompletions(new lang.StringTextDocument(source), { line, character });
    const pick = (items: ToolingItem[], label: string): ToolingItem | null => {
      const item = items.find((i) => i.label === label);
      return item ? { label: item.label, detail: item.detail, insertText: item.insertText } : null;
    };
    const pathBlockItem = pick(complete('let shape = @{ h 60 v 40 };\nshape.', 1, 6), 'centerPoint');
    const projectedItem = pick(
      complete('let shape = @{ h 60 v 40 };\nlet proj = shape.project(5, 5);\nproj.', 2, 5),
      'centerPoint',
    );
    const chainedLabels = complete('let shape = @{ h 60 v 40 };\nshape.centerPoint().', 1, 20).map((i) => i.label);
    const hoverSource = 'let shape = @{ h 60 v 40 };\nlet c = shape.centerPoint();';
    const hover = lang.getHoverInfo(new lang.StringTextDocument(hoverSource), { line: 1, character: 16 });
    return { pathBlockItem, projectedItem, chainedLabels, hoverContents: hover?.contents ?? null };
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
        localStorage.setItem('pathogen-lang:userId', 'e2e-centerpoint');
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
const cliLogs = cli.logs.map((entry) => entry.parts.map((p) => p.value).join(' '));
console.log('CLI logs:', cliLogs.join(' / '));
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
  check(`CLI produced ${cliPaths.length} path layers (expected 4)`, cliPaths.length === 4);
  for (const [i, d] of cliPaths.entries()) {
    check(`CLI layer ${i} path data appears verbatim in the preview`, previewNormalized.has(normalizePath(d)));
  }
  // log #1 is the arrow's relative + absolute center; logs #2-4 are the three band pivots
  check(
    'CLI logs report the arrow pivot and three band pivots',
    cliLogs.length === 4 && cliLogs[0].includes('Point(115, 150)'),
  );

  console.log('\n━━━ Scenario 2: served language services know centerPoint ━━━');
  const tooling = await probeTooling(page);
  console.log('PathBlock item:', JSON.stringify(tooling.pathBlockItem));
  console.log('ProjectedPath item:', JSON.stringify(tooling.projectedItem));
  console.log('chained labels sample:', tooling.chainedLabels.slice(0, 6).join(', '));
  console.log('hover:', tooling.hoverContents?.slice(0, 120) ?? '(none)');
  const detail = 'centerPoint() — Center of the bounding box as a Point';
  check('completion offers centerPoint on a PathBlock', tooling.pathBlockItem?.detail === detail);
  check('completion inserts centerPoint()', tooling.pathBlockItem?.insertText === 'centerPoint()$0');
  check('completion offers centerPoint on a ProjectedPath', tooling.projectedItem?.detail === detail);
  check(
    'shape.centerPoint(). offers Point members',
    ['x', 'y', 'translate', 'distanceTo'].every((m) => tooling.chainedLabels.includes(m)),
  );
  check(
    'hover on centerPoint shows the method detail',
    !!tooling.hoverContents &&
      tooling.hoverContents.includes('centerPoint') &&
      tooling.hoverContents.includes('Center of the bounding box'),
  );
});

console.log('\n━━━ Scenario 3: arity error surfaces ━━━');
await withPage(ARITY_PROGRAM, async (page) => {
  const result = await waitForCompile(page);
  console.log('error:', result.errorPanelText ?? '(none)');
  check(
    'centerPoint(1) shows the 0-arguments error',
    !!result.errorPanelText && result.errorPanelText.includes('centerPoint() expects 0 arguments'),
  );
});

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
