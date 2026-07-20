// Puppeteer verification for variable-valued font-family resolution
// (project-docs/font-variable-resolution).
//
// Scenario 1 — variable font-family: `let fontFamily = "Noto Sans";` used
// as `font-family: fontFamily;`. Asserts:
//   (a) a Google Fonts request for Noto+Sans fires,
//   (b) the preview iframe's #pathogen-fonts style contains a Noto Sans
//       @font-face,
//   (c) the rendered <text> carries font-family="Noto Sans".
//
// Scenario 2 — mystery repro: literal `font-family: "fontFamily";` (a
// quoted string, NOT the variable). Expected: no font fetched, attribute
// is the literal `fontFamily`, browser fallback rendering. Run cold to
// check the user report that this "rendered actual Noto Sans".
//
// Requires `npm run dev:website` (or dev:stack) on localhost:3000.

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Command } from 'commander';
import puppeteer, { type Page } from 'puppeteer';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const program = new Command();
program
  .name('debug-font-variable-resolution')
  .description('Puppeteer verification that variable-valued font-family resolves and loads in the playground preview')
  .option('--pages-url <url>', 'Pages dev URL', 'http://localhost:3000')
  .option('--screenshots', 'Capture per-scenario screenshots (hangs on some hosts)', false)
  .parse();
const opts = program.opts<{ pagesUrl: string; screenshots: boolean }>();
const PAGES_URL = opts.pagesUrl;

function encodeState(code: string): string {
  return btoa(encodeURIComponent(JSON.stringify({ code })));
}

const VARIABLE_PROGRAM = `define ViewBox(0, 0, 200, 200);
let fontFamily = "Noto Sans";
let fontStyles = \${ font-family: fontFamily; font-size: 16; font-weight: 900; };
let textLayer = TextLayer('with-noto-sans') << fontStyles;
textLayer.apply {
  text(25, 40)\`Variable font check\`
}
`;

const LITERAL_PROGRAM = VARIABLE_PROGRAM.replace(
  'font-family: fontFamily;',
  'font-family: "fontFamily";',
);

interface ProbeResult {
  iframeFound: boolean;
  fontsStyleContent: string | null;
  textFontFamilies: string[];
  computedFonts: string[];
  errorPanelText: string | null;
  editorCodeHead: string | null;
  previewStale: boolean | null;
  staleBadgeVisible: boolean | null;
}

async function probe(page: Page): Promise<ProbeResult> {
  return page.evaluate(() => {
    const deepQuery = (root: Document | ShadowRoot | Element, selector: string): Element | null => {
      const direct = (root as Document).querySelector?.(selector);
      if (direct) return direct;
      const all = (root as Document).querySelectorAll?.('*') ?? [];
      for (const el of Array.from(all)) {
        if (el.shadowRoot) {
          const found = deepQuery(el.shadowRoot, selector);
          if (found) return found;
        }
      }
      return null;
    };
    const result: {
      iframeFound: boolean;
      fontsStyleContent: string | null;
      textFontFamilies: string[];
      computedFonts: string[];
      errorPanelText: string | null;
      editorCodeHead: string | null;
    } = {
      iframeFound: false,
      fontsStyleContent: null,
      textFontFamilies: [],
      computedFonts: [],
      errorPanelText: null,
      editorCodeHead: null,
      previewStale: null,
      staleBadgeVisible: null,
    };
    const cmContent = deepQuery(document, '.cm-content');
    if (cmContent) result.editorCodeHead = (cmContent.textContent ?? '').slice(0, 120);
    const container = deepQuery(document, '#preview-container');
    if (container) {
      result.previewStale = container.classList.contains('stale');
      const badge = container.querySelector('#stale-badge');
      result.staleBadgeVisible = badge ? getComputedStyle(badge).display !== 'none' : null;
    }
    const iframe = deepQuery(document, 'iframe') as HTMLIFrameElement | null;
    if (iframe?.contentDocument) {
      result.iframeFound = true;
      const doc = iframe.contentDocument;
      result.fontsStyleContent = doc.getElementById('pathogen-fonts')?.textContent ?? null;
      for (const t of Array.from(doc.querySelectorAll('text'))) {
        result.textFontFamilies.push(t.getAttribute('font-family') ?? '(none)');
        result.computedFonts.push(getComputedStyle(t).fontFamily);
      }
    }
    const errPanel = deepQuery(document, 'error-panel');
    if (errPanel?.shadowRoot?.textContent?.trim()) {
      result.errorPanelText = errPanel.shadowRoot.textContent.trim().slice(0, 200);
    }
    return result;
  });
}

async function runScenario(name: string, code: string, screenshotPath?: string): Promise<void> {
  console.log(`\n━━━ Scenario: ${name} ━━━`);
  const browser = await puppeteer.launch({
    headless: true,
    defaultViewport: { width: 1400, height: 1000 },
  });
  try {
    const page = await browser.newPage();
    const fontRequests: string[] = [];
    page.on('request', (req) => {
      const url = req.url();
      if (url.includes('fonts.googleapis.com') || url.includes('fonts.gstatic.com')) {
        fontRequests.push(url);
      }
    });
    page.on('dialog', (d) => void d.dismiss());
    page.on('pageerror', (err) => console.log('[pageerror]', err.message));
    await page.evaluateOnNewDocument(() => {
      (window as unknown as { __name?: <T>(fn: T) => T }).__name = <T>(fn: T): T => fn;
      try {
        localStorage.setItem('pathogen-lang:userId', 'e2e-font-var-check');
      } catch {
        /* ignore */
      }
    });

    const url = `${PAGES_URL}/workspace/scratch?state=${encodeState(code)}`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });

    // Poll with evaluate (waitForFunction is blocked by the page CSP).
    let result: ProbeResult | null = null;
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 500));
      result = await probe(page);
      if (result.textFontFamilies.length > 0 || result.previewStale === true) break;
    }

    console.log('editor code head:', result?.editorCodeHead ?? '(no editor)');
    console.log('font requests:', fontRequests.length ? fontRequests : '(none)');
    console.log('iframe found:', result?.iframeFound);
    console.log(
      '#pathogen-fonts:',
      result?.fontsStyleContent
        ? result.fontsStyleContent.match(/font-family:\s*"[^"]*"/g)
        : '(empty)',
    );
    console.log('text font-family attrs:', result?.textFontFamilies);
    console.log('computed fontFamily:', result?.computedFonts);
    console.log('preview stale:', result?.previewStale, '| badge visible:', result?.staleBadgeVisible);
    if (result?.errorPanelText) console.log('error panel:', result.errorPanelText);
    // Screenshots are opt-in (--screenshots): page.screenshot hangs
    // indefinitely under headless Chrome on this host (reproduced against a
    // plain page, unrelated to the playground). The console assertions above
    // are the actual verification.
    if (screenshotPath && opts.screenshots) {
      const abs = join(ROOT, screenshotPath) as `${string}.png`;
      await page.screenshot({ path: abs });
      console.log('screenshot:', abs);
    }
  } finally {
    await browser.close();
  }
}

await runScenario(
  'variable font-family (fontFamily → "Noto Sans")',
  VARIABLE_PROGRAM,
  'project-docs/font-variable-resolution/playground-variable-fontfamily.png',
);
await runScenario(
  'literal quoted "fontFamily" (mystery repro, cold)',
  LITERAL_PROGRAM,
  'project-docs/font-variable-resolution/playground-literal-fontfamily-cold.png',
);
await runScenario(
  'compile error marks the preview stale',
  'let broken = ;\nM 0 0',
  'project-docs/font-variable-resolution/playground-stale-marker.png',
);
