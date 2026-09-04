// Puppeteer verification for CJK Google Fonts unicode-range subset loading
// (fix for PathBlock.fromGlyph rendering non-Latin characters as .notdef
// placeholder boxes — see project-docs/font-glyph-metadata/PRIMER.md,
// "The subsetting landmine").
//
// Scenario 1 — Moirai One (Korean) via fromGlyph. Asserts:
//   (a) beyond the css2 CSS + latin binary, at least one additional
//       fonts.gstatic.com slice request fires (the missing-glyph refetch),
//   (b) only the covering slices are fetched, not the ~90-slice catalog,
//   (c) no error panel and no [warn] missing-glyph log,
//   (d) the rendered glyph layer contains substantial path data.
//   The rendered SVG is saved to project-docs/font-glyph-metadata/.
//
// Scenario 2 — Latin-only program (Inter): exactly one CSS + one binary
// request (no subset regression for non-CJK fonts).
//
// Scenario 3 — Korean text with a Latin-only family (Inter): compiles, and
// the [warn] missing-glyph log appears in the workspace.
//
// Requires `npm run dev:website` (or dev:stack) on localhost:3000, with the
// playground rebuilt (`PATHOGEN_API_BASE=http://localhost:8787 npm run
// build:playground`) after any src/ or playground/ change.

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Command } from 'commander';
import puppeteer, { type Page } from 'puppeteer';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const program = new Command();
program
  .name('debug-cjk-subset-loading')
  .description('Puppeteer verification that CJK Google Fonts render real glyphs via unicode-range subset loading')
  .option('--pages-url <url>', 'Pages dev URL', 'http://localhost:3000')
  .parse();
const opts = program.opts<{ pagesUrl: string }>();
const PAGES_URL = opts.pagesUrl;

function encodeState(code: string): string {
  return btoa(encodeURIComponent(JSON.stringify({ code })));
}

const MOIRAI_PROGRAM = `define ViewBox(0, 0, 2600, 300);
let fontFamily = 'Moirai One';
@font fontFamily 400;
let baseGlyphStyles = #{
  fill: #ccc;
  stroke: #222;
  stroke-width: 1;
  font-family: fontFamily;
  font-size: 120;
};

let glyphSet = PathBlock.fromGlyph(\`Moirai 모든 인류 권리\`, baseGlyphStyles);
let x = 80;
let y = 180;
let currentGlyphLayer = PathLayer(\`glyph-layer\`) << baseGlyphStyles;

for ([glyph, gIndex] in glyphSet) {
  currentGlyphLayer.apply {
    M x y glyph.draw()
  }
  x = calc(x + glyph.advanceWidth);
}
`;

// Also exercises the glyph provenance members (char / isWhitespace / isEmpty):
// the space at index 5 must log " " / true / true, and empty glyphs are
// skipped via !glyph.isEmpty during layout.
const LATIN_PROGRAM = `define ViewBox(0, 0, 800, 200);
@font "Inter" 400;
let styles = #{ font-family: Inter; font-size: 64; };
let glyphSet = PathBlock.fromGlyph(\`Latin only\`, styles);
log(glyphSet[5].char);
log(glyphSet[5].isWhitespace);
log(glyphSet[5].isEmpty);
log(glyphSet[0].char);
log(glyphSet[0].isEmpty);
let x = 20;
let glyphLayer = PathLayer(\`latin-layer\`) << styles;
for (glyph in glyphSet) {
  if (!glyph.isEmpty) {
    glyphLayer.apply { M x 120 glyph.draw() }
  }
  x = calc(x + glyph.advanceWidth);
}
`;

const MISSING_GLYPH_PROGRAM = LATIN_PROGRAM.replace('`Latin only`', '`Latin 한글`');

interface ProbeResult {
  iframeFound: boolean;
  pathCount: number;
  totalPathDataLength: number;
  svgOuterHTML: string | null;
  errorPanelText: string | null;
  warnLogText: string | null;
  consoleLogs: string[];
  previewStale: boolean | null;
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
    const deepFindText = (root: Document | ShadowRoot, needle: string): string | null => {
      const all = root.querySelectorAll('*');
      for (const el of Array.from(all)) {
        if (el.shadowRoot) {
          const found = deepFindText(el.shadowRoot, needle);
          if (found) return found;
        }
        if (el.children.length === 0 && el.textContent?.includes(needle)) {
          return el.textContent.trim().slice(0, 200);
        }
      }
      return null;
    };

    const result: ProbeResult = {
      iframeFound: false,
      pathCount: 0,
      totalPathDataLength: 0,
      svgOuterHTML: null,
      errorPanelText: null,
      warnLogText: null,
      consoleLogs: [],
      previewStale: null,
    };

    const container = deepQuery(document, '#preview-container');
    if (container) result.previewStale = container.classList.contains('stale');

    const iframe = deepQuery(document, 'iframe') as HTMLIFrameElement | null;
    if (iframe?.contentDocument) {
      result.iframeFound = true;
      const doc = iframe.contentDocument;
      const paths = Array.from(doc.querySelectorAll('path'));
      result.pathCount = paths.length;
      result.totalPathDataLength = paths.reduce((n, p) => n + (p.getAttribute('d')?.length ?? 0), 0);
      result.svgOuterHTML = doc.querySelector('svg')?.outerHTML ?? null;
    }

    // Read only rendered (non-<style>) text, and only when the panel host is
    // actually visible — the shadow root always contains its CSS text.
    const errPanel = deepQuery(document, 'error-panel');
    if (errPanel?.shadowRoot && getComputedStyle(errPanel).display !== 'none') {
      const text = Array.from(errPanel.shadowRoot.querySelectorAll(':not(style)'))
        .map((el) => (el.children.length === 0 ? el.textContent?.trim() : ''))
        .filter(Boolean)
        .join(' | ');
      if (text) result.errorPanelText = text.slice(0, 300);
    }
    // The console pane renders lazily — open it (as a user would) so the
    // log entries exist in the DOM, then look for the [warn] entry.
    const consolePane = deepQuery(document, 'console-pane') as
      | (HTMLElement & {
          open?: () => void;
          logs?: { parts?: { value?: string }[] }[];
          shadowRoot: ShadowRoot | null;
        })
      | null;
    if (consolePane?.open) consolePane.open();
    result.warnLogText = consolePane?.shadowRoot
      ? deepFindText(consolePane.shadowRoot, '[warn]')
      : deepFindText(document, '[warn]');
    result.consoleLogs = (consolePane?.logs ?? []).map((l) => l.parts?.[0]?.value ?? '');
    return result;
  });
}

interface ScenarioOutcome {
  fontRequests: string[];
  result: ProbeResult | null;
}

async function runScenario(name: string, code: string): Promise<ScenarioOutcome> {
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
      // resourceType 'fetch' = the font-loader's programmatic fetches; the
      // editor also loads fonts for UI rendering via <link> injection
      // (resourceType 'stylesheet'/'font'), which are not under test here.
      if (
        (url.includes('fonts.googleapis.com') || url.includes('fonts.gstatic.com')) &&
        req.resourceType() === 'fetch'
      ) {
        fontRequests.push(url);
      }
    });
    page.on('dialog', (d) => void d.dismiss());
    page.on('pageerror', (err) => console.log('[pageerror]', err.message));
    await page.evaluateOnNewDocument(() => {
      (window as unknown as { __name?: <T>(fn: T) => T }).__name = <T>(fn: T): T => fn;
      try {
        localStorage.setItem('pathogen-lang:userId', 'e2e-cjk-subset-check');
      } catch {
        /* ignore */
      }
    });

    const url = `${PAGES_URL}/workspace/scratch?state=${encodeState(code)}`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });

    // Poll with evaluate (waitForFunction is blocked by the page CSP). The
    // CJK path needs compile → slice fetch → recompile, so allow extra time
    // after the first render before declaring the result settled.
    let result: ProbeResult | null = null;
    let settledPolls = 0;
    let lastLength = -1;
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 500));
      result = await probe(page);
      if (result.errorPanelText) break;
      if (result.totalPathDataLength > 0 && result.totalPathDataLength === lastLength) {
        settledPolls++;
        if (settledPolls >= 3) break; // stable for 1.5s → recompiles done
      } else {
        settledPolls = 0;
      }
      lastLength = result.totalPathDataLength;
    }

    const binaries = fontRequests.filter((u) => u.includes('fonts.gstatic.com'));
    console.log('css2 requests:', fontRequests.filter((u) => u.includes('fonts.googleapis.com')).length);
    console.log('binary requests:', binaries.length);
    for (const b of binaries) console.log('  -', b.split('/').pop());
    console.log('iframe found:', result?.iframeFound);
    console.log('path count:', result?.pathCount, '| total d length:', result?.totalPathDataLength);
    console.log('preview stale:', result?.previewStale);
    console.log('warn log:', result?.warnLogText ?? '(none)');
    if (result?.errorPanelText) console.log('error panel:', result.errorPanelText);
    return { fontRequests, result };
  } finally {
    await browser.close();
  }
}

let failures = 0;
function check(label: string, ok: boolean): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${label}`);
  if (!ok) failures++;
}

const moirai = await runScenario('Moirai One Korean via fromGlyph', MOIRAI_PROGRAM);
{
  const binaries = moirai.fontRequests.filter((u) => u.includes('fonts.gstatic.com'));
  check('no compile error', !moirai.result?.errorPanelText);
  check('at least one Korean slice fetched beyond the latin primary', binaries.length >= 2);
  check(`covering slices only, not the full catalog (got ${binaries.length})`, binaries.length < 20);
  check('no [warn] missing-glyph log (Moirai One covers Hangul)', !moirai.result?.warnLogText);
  check(
    `substantial rendered path data (got ${moirai.result?.totalPathDataLength ?? 0})`,
    (moirai.result?.totalPathDataLength ?? 0) > 5000,
  );
  if (moirai.result?.svgOuterHTML) {
    const dest = join(ROOT, 'project-docs/font-glyph-metadata/verify-moirai-one.svg');
    writeFileSync(dest, moirai.result.svgOuterHTML);
    console.log('saved rendered SVG:', dest);
  }
}

const latin = await runScenario('Latin-only regression (Inter)', LATIN_PROGRAM);
{
  const binaries = latin.fontRequests.filter((u) => u.includes('fonts.gstatic.com'));
  check('no compile error', !latin.result?.errorPanelText);
  check(`exactly one binary request (got ${binaries.length})`, binaries.length === 1);
  check('no [warn] log', !latin.result?.warnLogText);
  const logs = latin.result?.consoleLogs ?? [];
  check(
    `glyph provenance members (char/isWhitespace/isEmpty) log correctly (got ${JSON.stringify(logs)})`,
    logs[0] === ' ' && logs[1] === 'true' && logs[2] === 'true' && logs[3] === 'L' && logs[4] === 'false',
  );
}

const nanum = await runScenario(
  'Curated Korean family (Nanum Gothic)',
  MOIRAI_PROGRAM.replace(/'Moirai One'/, "'Nanum Gothic'"),
);
{
  const binaries = nanum.fontRequests.filter((u) => u.includes('fonts.gstatic.com'));
  check('no compile error', !nanum.result?.errorPanelText);
  check('Korean slices fetched for the curated family', binaries.length >= 2);
  check('no [warn] log (Nanum Gothic covers Hangul)', !nanum.result?.warnLogText);
  check(
    `substantial rendered path data (got ${nanum.result?.totalPathDataLength ?? 0})`,
    (nanum.result?.totalPathDataLength ?? 0) > 5000,
  );
}

const missing = await runScenario('Missing glyphs warn (Inter + Hangul)', MISSING_GLYPH_PROGRAM);
{
  check('no compile error (missing glyphs are a warning, not an error)', !missing.result?.errorPanelText);
  check('[warn] missing-glyph log shown', !!missing.result?.warnLogText);
  console.log('warn text:', missing.result?.warnLogText);
}

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
