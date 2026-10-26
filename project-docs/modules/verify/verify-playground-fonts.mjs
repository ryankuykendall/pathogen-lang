/**
 * Phase 0b: the playground's side of the shared @font rules. Requires the dev
 * stack (Pages on :3000) serving a build that includes them:
 *   PATHOGEN_API_BASE=http://localhost:8787 npm run build:website
 *
 * Against the REAL served bundle and workspace view:
 *   1. a file path in @font is skipped with a warning that names the Google
 *      family to use, and the rest of the program still renders
 *   2. a source mistake (`@font "serif"`) stops the compile with the CLI's
 *      message at its line
 *   3. a Google family still loads and draws glyphs (regression)
 *
 * Run from the repo root: node project-docs/modules/verify/verify-playground-fonts.mjs
 */
import { writeFileSync } from 'node:fs';

import puppeteer from 'puppeteer';

const ORIGIN = 'http://localhost:3000';
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};

const WALK = `
  function walkAll(root, sel, out) {
    for (const el of root.querySelectorAll(sel)) out.push(el);
    for (const el of root.querySelectorAll('*')) {
      if (el.shadowRoot) walkAll(el.shadowRoot, sel, out);
      if (el.tagName === 'IFRAME') { try { if (el.contentDocument) walkAll(el.contentDocument, sel, out); } catch (e) {} }
    }
    return out;
  }
  function allText(root) {
    let text = '';
    for (const el of walkAll(root, '*', [])) {
      for (const node of el.childNodes) if (node.nodeType === 3) text += node.textContent + ' ';
    }
    return text;
  }
`;

async function pollUntil(fn, timeoutMs, what) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const v = await fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`timed out after ${timeoutMs}ms waiting for ${what}`);
}

const browser = await puppeteer.launch({ headless: 'shell' });

/** Open a scratch workspace on `code`; returns the page once the editor exists. */
async function open(code) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  page.on('dialog', (d) => {
    d.dismiss().catch(() => {});
  });
  await page.evaluateOnNewDocument(() => {
    window.__name = (fn) => fn;
  });
  const state = Buffer.from(encodeURIComponent(JSON.stringify({ code }))).toString('base64');
  try {
    await page.goto(`${ORIGIN}/workspace/scratch?state=${encodeURIComponent(state)}`, {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    });
  } catch {
    // goto lifecycle timeouts are common here; the DOM poll below decides.
  }
  await pollUntil(
    () => page.evaluate(`(() => { ${WALK} return walkAll(document, '.cm-content', []).length > 0; })()`),
    40000,
    'editor',
  );
  return page;
}
const pageText = (page) => page.evaluate(`(() => { ${WALK} return allText(document); })()`);

try {
  // 1. File path: skipped with a warning naming the family; the drawing still renders.
  const filePage = await open('define ViewBox(0, 0, 200, 100);\n@font "./fonts/Raleway-Bold.ttf";\nM 10 10 L 190 90');
  const fileNotice = await pollUntil(
    async () => {
      const text = await pageText(filePage);
      const i = text.indexOf('can’t load font files yet');
      const j = text.indexOf("can't load font files yet");
      return i >= 0 || j >= 0 ? text.slice(Math.max(0, (j >= 0 ? j : i) - 60), (j >= 0 ? j : i) + 140) : null;
    },
    40000,
    'the file-path warning',
  ).catch(() => null);
  check(
    'a file path in @font shows the warning that names the family to use',
    !!fileNotice && fileNotice.includes('@font "Raleway" 700;'),
    fileNotice ?? '(no warning found)',
  );
  const drawn = await pollUntil(
    () =>
      filePage.evaluate(
        `(() => { ${WALK} return walkAll(document, 'path', []).some((p) => (p.getAttribute('d') || '').startsWith('M 10 10 L 190 90')); })()`,
      ),
    20000,
    'the drawing',
  ).catch(() => false);
  check('the rest of the program still renders', drawn);
  await filePage.screenshot({ path: 'project-docs/modules/verify/playground-file-font-warning.png' });

  // 1b. The same skipped file, now used by a glyph call: the compile fails,
  // and the banner still explains why ("look for a preceding font-loading message").
  const usedPage = await open(
    'define ViewBox(0, 0, 200, 100);\n@font "./fonts/Raleway-Bold.ttf";\nlet s = #{ font-family: Raleway-Bold; font-size: 48; };\nlet g = PathBlock.fromGlyph("A", s);',
  );
  const usedBoth = await pollUntil(
    async () => {
      const text = await pageText(usedPage);
      return text.includes('no fonts were loaded') && text.includes("can't load font files yet") ? text : null;
    },
    40000,
    'the error and the warning together',
  ).catch(() => null);
  check('a glyph call on the skipped file fails, and the warning banner explains it', !!usedBoth);
  await usedPage.screenshot({ path: 'project-docs/modules/verify/playground-file-font-used.png' });

  // 2. Source mistake: the CLI's message at its line.
  const serifPage = await open('M 0 0 L 10 10\n@font "serif";');
  const serifError = await pollUntil(
    async () => {
      const text = await pageText(serifPage);
      const i = text.indexOf('is a CSS generic family, not a font');
      return i >= 0 ? text.slice(Math.max(0, i - 40), i + 120) : null;
    },
    40000,
    'the generic-family error',
  ).catch(() => null);
  check(
    '@font "serif" stops the compile with the CLI message at its line',
    !!serifError &&
      serifError.includes('Line 2, col 1: @font "serif"') &&
      serifError.includes('such as @font "Noto Serif";'),
    serifError ?? '(no error found)',
  );
  await serifPage.screenshot({ path: 'project-docs/modules/verify/playground-generic-family-error.png' });

  // 3. A Google family still loads and draws.
  const googlePage = await open(
    'define ViewBox(0, 0, 200, 100);\n@font "Raleway" 700;\nlet s = #{ font-family: Raleway; font-weight: 700; font-size: 64; };\nlet g = PathBlock.fromGlyph("A", s);\nM 20 90\ng[0].draw()',
  );
  const glyph = await pollUntil(
    () =>
      googlePage.evaluate(
        `(() => { ${WALK} const d = walkAll(document, 'path', []).map((p) => p.getAttribute('d') || '').find((d) => d.startsWith('M 20 90')); return d && d.length > 100 ? d.length : null; })()`,
      ),
    60000,
    'the Raleway glyph',
  ).catch(() => null);
  check('a Google family still loads and draws glyphs', !!glyph, glyph ? `${glyph} chars of path data` : '(no glyph)');

  const exported = await googlePage.evaluate(() => typeof window.PathogenLang.planFontDirectives);
  check('the served bundle exposes the shared plan', exported === 'function', exported);
} catch (e) {
  check('verification run completed', false, String(e && e.message));
} finally {
  await browser.close();
}

writeFileSync(
  'project-docs/modules/verify/playground-fonts-results.json',
  JSON.stringify({ at: new Date().toISOString(), results }, null, 2),
);
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
