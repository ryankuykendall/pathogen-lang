// Puppeteer verification for fromGlyph character-class provenance members
// (isSpace / isTab / isNewline / isMark / codePoint) in the playground surface.
//
// Runs the docs/path-blocks.md line-wrap example shape: logs every glyph's
// classification via template interpolation and lays out "a b\nc" with a
// newline-aware cursor. Asserts:
//   (a) no error panel,
//   (b) the console pane logs the exact classification row for a letter,
//       a space, and a newline (partition invariant end-to-end),
//   (c) glyph outlines render (wrap produced drawn paths).
//
// Requires `npm run dev:website` (or dev:stack) on localhost:3000, with the
// playground rebuilt (`PATHOGEN_API_BASE=http://localhost:8787 npm run
// build:playground`) after any src/ change.

import { Command } from 'commander';
import puppeteer, { type Page } from 'puppeteer';

const program = new Command();
program
  .name('debug-glyph-char-classes')
  .description('Puppeteer verification that fromGlyph character classes work in the playground surface')
  .option('--pages-url <url>', 'Pages dev URL', 'http://localhost:3000')
  .parse();
const opts = program.opts<{ pagesUrl: string }>();
const PAGES_URL = opts.pagesUrl;

function encodeState(code: string): string {
  return btoa(encodeURIComponent(JSON.stringify({ code })));
}

const PROGRAM = `define ViewBox(0, 0, 400, 160);
@font "Inter" 400;
let styles = #{ font-family: Inter; font-size: 48; };
let glyphs = PathBlock.fromGlyph("a b\\nc", styles);

for (g in glyphs) {
  log(\`\${g.codePoint}|\${g.isSpace}|\${g.isTab}|\${g.isNewline}|\${g.isMark}|\${g.isWhitespace}\`);
}

let x = 20;
let y = 60;
for (g in glyphs) {
  if (g.isNewline) {
    y = calc(y + 60);
    x = 20;
  } else {
    if (!g.isWhitespace) {
      M x y
      g.draw()
    }
    x = calc(x + g.advanceWidth);
  }
}
`;

interface ProbeResult {
  pathCount: number;
  totalPathDataLength: number;
  errorPanelText: string | null;
  previewStale: boolean | null;
  consoleLogs: string[];
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
    const result: ProbeResult = {
      pathCount: 0,
      totalPathDataLength: 0,
      errorPanelText: null,
      previewStale: null,
      consoleLogs: [],
    };
    const container = deepQuery(document, '#preview-container');
    if (container) result.previewStale = container.classList.contains('stale');
    const iframe = deepQuery(document, 'iframe') as HTMLIFrameElement | null;
    if (iframe?.contentDocument) {
      const ds = Array.from(iframe.contentDocument.querySelectorAll('path'))
        .map((p) => p.getAttribute('d') ?? '')
        .filter(Boolean);
      result.pathCount = ds.length;
      result.totalPathDataLength = ds.join('').length;
    }
    const errPanel = deepQuery(document, 'error-panel');
    if (errPanel?.shadowRoot && getComputedStyle(errPanel).display !== 'none') {
      const text = Array.from(errPanel.shadowRoot.querySelectorAll(':not(style)'))
        .map((el) => (el.children.length === 0 ? el.textContent?.trim() : ''))
        .filter(Boolean)
        .join(' | ');
      if (text) result.errorPanelText = text.slice(0, 300);
    }
    const consolePane = deepQuery(document, 'console-pane') as
      | (Element & { logs?: { parts?: { value?: string }[] }[] })
      | null;
    result.consoleLogs = (consolePane?.logs ?? []).map((l) =>
      (l.parts ?? []).map((p) => p.value ?? '').join(''),
    );
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
      localStorage.setItem('pathogen-lang:userId', 'e2e-glyph-char-classes');
    } catch {
      /* ignore */
    }
  });
  await page.goto(`${PAGES_URL}/workspace/scratch?state=${encodeState(PROGRAM)}`, {
    waitUntil: 'domcontentloaded',
    timeout: 30_000,
  });
  let result: ProbeResult | null = null;
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 500));
    result = await probe(page);
    if (result.errorPanelText || (result.consoleLogs.length >= 6 && result.previewStale === false)) break;
  }
  console.log('logs:', JSON.stringify(result?.consoleLogs ?? []));
  console.log('path count:', result?.pathCount, '| total d length:', result?.totalPathDataLength);
  console.log('error:', result?.errorPanelText ?? '(none)');

  check('no compile error', !result?.errorPanelText);
  const logs = result?.consoleLogs ?? [];
  check("letter 'a' row (97, all false)", logs.some((l) => l.endsWith('97|false|false|false|false|false')));
  check('space row (32, isSpace + isWhitespace)', logs.some((l) => l.endsWith('32|true|false|false|false|true')));
  check('newline row (10, isNewline + isWhitespace)', logs.some((l) => l.endsWith('10|false|false|true|false|true')));
  // 3 drawn letters + preview grid — anything beyond the grid means glyph outlines rendered
  check(`glyph outlines rendered (paths: ${result?.pathCount})`, (result?.totalPathDataLength ?? 0) > 500);
} finally {
  await browser.close();
}

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
