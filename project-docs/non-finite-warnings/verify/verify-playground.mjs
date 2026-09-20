/**
 * Playground verification — non-finite warnings, strict mode, error positions
 * (ISSUE-023 + ISSUE-022, 2026-09-19). Harness modeled on
 * project-docs/strict-mapslice/verify/verify-playground.mjs.
 *
 * Requires a served build that includes the change:
 *   PATHOGEN_API_BASE=http://localhost:8787 npm run build:website
 * PATHOGEN_ORIGIN=https://pathogen.studio runs the same checks against production.
 *
 * Asserts, against the REAL served bundle and the live page:
 *   1. a program with a degenerate stroke still RENDERS — no error panel, the
 *      sound layer complete, the degenerate layer emitted with its Infinity
 *   2. served bundle: the warning (code, message, position) from BOTH compile()
 *      and compileWithContext() — the playground calls the second; the editor
 *      diagnostic is a Warning, not an Error; strict mode in both forms
 *   3. ISSUE-022: errors on a literal receiver and in a for-each header carry
 *      the right line and column; the live error panel shows them
 *
 * Run from the repo root: node project-docs/non-finite-warnings/verify/verify-playground.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import puppeteer from 'puppeteer';

const ORIGIN = process.env.PATHOGEN_ORIGIN ?? 'http://localhost:3000';
const SUFFIX = process.env.PATHOGEN_ORIGIN ? '-production' : '';
const DEMO = 'project-docs/non-finite-warnings/demo.pathogen';
const code = readFileSync(DEMO, 'utf8');
const HEADER_ERROR = "let list = [1, 2];\nlet pad = 0;\nfor (item in list.slice('a')) { M item 0 }";

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};

const browser = await puppeteer.launch({ headless: 'shell' });
const page = await browser.newPage();
page.on('dialog', (d) => { d.dismiss().catch(() => {}); });
await page.evaluateOnNewDocument(() => { window.__name = (fn) => fn; });

async function pollUntil(fn, timeoutMs, what) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const v = await fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`timed out after ${timeoutMs}ms waiting for ${what}`);
}

const WALK = `
  function walkAll(root, sel, out) {
    for (const el of root.querySelectorAll(sel)) out.push(el);
    for (const el of root.querySelectorAll('*')) {
      if (el.shadowRoot) walkAll(el.shadowRoot, sel, out);
      if (el.tagName === 'IFRAME') { try { if (el.contentDocument) walkAll(el.contentDocument, sel, out); } catch (e) {} }
    }
    return out;
  }
  function deepText(root) {
    let text = '';
    for (const el of root.querySelectorAll('*')) {
      if (el.shadowRoot) text += ' ' + deepText(el.shadowRoot);
      if (!el.children.length) text += ' ' + (el.textContent || '');
    }
    return text;
  }
`;

const stateFor = (src) => encodeURIComponent(Buffer.from(encodeURIComponent(JSON.stringify({ code: src }))).toString('base64'));
async function open(src) {
  try {
    await page.goto(`${ORIGIN}/workspace/scratch?state=${stateFor(src)}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
  } catch {
    console.log('  (goto lifecycle timeout — polling the DOM directly)');
  }
  await pollUntil(() => page.evaluate(`(() => { ${WALK} return walkAll(document, '.cm-content', []).length > 0; })()`), 40000, 'editor');
}

try {
  // 1. A degenerate stroke does not take the drawing down with it
  await open(code);
  const paths = await pollUntil(
    () => page.evaluate(`(() => { ${WALK}
      const ds = walkAll(document, 'path', []).map((p) => p.getAttribute('d') || '');
      const sound = ds.find((d) => d.replace(/\\s+/g, ' ').trim() === 'M 20 60 L 380 60');
      const degenerate = ds.find((d) => d.includes('Infinity'));
      return sound && degenerate ? { sound, degenerate } : null; })()`),
    40000,
    'both layers in the preview',
  ).catch(() => null);
  check('the sound layer renders complete beside a degenerate one', !!paths && paths.sound.replace(/\s+/g, ' ').trim() === 'M 20 60 L 380 60', paths ? paths.sound : 'not found');
  check('the degenerate layer is still emitted, Infinity and all', !!paths && paths.degenerate.replace(/\s+/g, ' ').trim() === 'M 20 140 L 200 140 L Infinity 140 L 380 140', paths ? paths.degenerate : 'not found');
  const pageText = await page.evaluate(`(() => { ${WALK} return deepText(document); })()`);
  check('no compile ERROR is shown for a warning', !/Error:[^\n]*in a path argument/.test(pageText));

  // 2. The served bundle
  const ls = await page.evaluate((src) => {
    const L = window.PathogenLang;
    const errorOf = (f) => { try { f(); return ''; } catch (e) { return String(e && e.message); } };
    const nan = 'let bad = sqrt(-1);\nM bad 0';
    const viaCompile = L.compile(src).warnings;
    const viaContext = L.compileWithContext(src).warnings;
    const diagnostics = L.getDiagnostics(new L.StringTextDocument(nan))
      .filter((d) => d.message.includes('in a path argument'))
      .map((d) => ({ severity: d.severity, line: d.range.start.line }));
    return {
      viaCompile, viaContext, diagnostics,
      warningSeverity: L.DiagnosticSeverity.Warning,
      codes: L.WARNING_CODES,
      strictAll: errorOf(() => L.compile(nan, { strict: true })),
      strictNamed: errorOf(() => L.compile(nan, { strict: ['non-finite'] })),
      strictOther: L.compile(nan, { strict: ['gradient'] }).warnings.length,
      strictContext: errorOf(() => L.compileWithContext(nan, { strict: ['non-finite'] })),
      drawingFn: L.compile('let radius = sqrt(-1);\ncircle(50, 50, radius);').warnings.map((w) => w.message),
      nullStillFatal: errorOf(() => L.compile('let [present, missing] = [40];\ncircle(50, 50, missing);')),
      missingArgStillFatal: errorOf(() => L.compile('M 0 0 polarLine(0.5);')),
      literalReceiver: errorOf(() => L.compile("let one = 1;\nlet two = 2;\nlet result = [one, two].slice('a');")),
      objectReceiver: errorOf(() => L.compile("let pad = 0;\nlet result = { list: [1, 2] }.list.slice('a');")),
      forEachHeader: errorOf(() => L.compile("let list = [1, 2];\nlet pad = 0;\nfor (item in list.slice('a')) { M item 0 }")),
    };
  }, code);
  const expectWarning = (w) => w.length === 1 && w[0].code === 'non-finite' && w[0].line === 28 && w[0].column === 5 && w[0].message.startsWith('`ratio` is Infinity in a path argument');
  check('served bundle: compile() warns — code, message, line 28 col 5', expectWarning(ls.viaCompile), JSON.stringify(ls.viaCompile));
  check('served bundle: compileWithContext() warns identically (the path the playground takes)', expectWarning(ls.viaContext), JSON.stringify(ls.viaContext));
  check('served bundle: the editor diagnostic is a Warning on the right line', ls.diagnostics.length === 1 && ls.diagnostics[0].severity === ls.warningSeverity && ls.diagnostics[0].line === 1, JSON.stringify(ls.diagnostics));
  check('served bundle: WARNING_CODES is exported and lists non-finite', Array.isArray(ls.codes) && ls.codes.includes('non-finite'), JSON.stringify(ls.codes));
  check('served bundle: strict: true → positioned error naming the code', /^Line 2, col 3: `bad` is NaN in a path argument .* \(strict: non-finite\)$/.test(ls.strictAll), ls.strictAll);
  check("served bundle: strict: ['non-finite'] → same error", /\(strict: non-finite\)$/.test(ls.strictNamed), ls.strictNamed);
  check("served bundle: strict: ['gradient'] leaves it a warning", ls.strictOther === 1, String(ls.strictOther));
  check('served bundle: compileWithContext honours strict', /\(strict: non-finite\)$/.test(ls.strictContext), ls.strictContext);
  check('served bundle: a drawing function warns instead of throwing', ls.drawingFn.length === 1 && ls.drawingFn[0].startsWith('circle(): argument 3 (`radius`) is NaN'), JSON.stringify(ls.drawingFn));
  check('served bundle: null is still an error', /circle\(\): argument 3 \(`missing`\) is null/.test(ls.nullStillFatal), ls.nullStillFatal);
  check('served bundle: a missing context-aware argument is still an error', /polarLine\(\) produced a non-numeric coordinate/.test(ls.missingArgStillFatal), ls.missingArgStillFatal);
  check('ISSUE-022: array-literal receiver error is positioned', /^Line 3, col 14: slice\(\)/.test(ls.literalReceiver), ls.literalReceiver);
  check('ISSUE-022: object-literal receiver error is positioned', /^Line 2, col 14: slice\(\)/.test(ls.objectReceiver), ls.objectReceiver);
  check('ISSUE-022: for-each header error is positioned at the header', /^Line 3, col 14: slice\(\)/.test(ls.forEachHeader), ls.forEachHeader);

  // 3. The live error panel
  await open(HEADER_ERROR);
  const panel = await pollUntil(
    () => page.evaluate(`(() => { ${WALK} const t = deepText(document); return t.includes('slice() start must be a number') ? t : null; })()`),
    40000,
    'error panel text',
  ).catch(() => null);
  // The panel renders a position as `Line L:C — message`. Before the fix this read `Line 1:9`.
  const shown = panel ? (/Line \d+:\d+ — slice\(\) start must be a number/.exec(panel)?.[0] ?? '') : '';
  check('the error panel shows the for-each header error with its real position', shown === 'Line 3:14 — slice() start must be a number', shown || 'message not found');

  // 4. Thousands of identical warnings from one site. compile() keeps every
  //    instance by documented contract (grouping is a display concern), and a
  //    NaN in a loop repeats per iteration — the shape that once overflowed the
  //    editor's highlight marks and surfaced as a bogus compile error.
  const LOOPED = 'let bad = sqrt(-1);\nM 20 60 L 380 60\nfor (i in 0..1999) {\n  M bad 0\n}';
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e && e.message)));
  await open(LOOPED);
  const looped = await pollUntil(
    () => page.evaluate(`(() => { ${WALK}
      const d = walkAll(document, 'path', []).map((p) => p.getAttribute('d') || '').find((t) => t.includes('M 20 60 L 380 60'));
      return d ? { length: d.length, text: deepText(document) } : null; })()`),
    60000,
    'the looped program in the preview',
  ).catch(() => null);
  const inBundle = await page.evaluate((src) => window.PathogenLang.compileWithContext(src).warnings.length, LOOPED);
  check('2,000 identical warnings: every instance is kept, as documented', inBundle === 2000, String(inBundle));
  check('2,000 identical warnings: the preview still renders', !!looped, looped ? `${looped.length} chars of path data` : 'never rendered');
  check('2,000 identical warnings: no stack overflow, no page error', !!looped && !/Maximum call stack/.test(looped.text) && pageErrors.length === 0, pageErrors.slice(0, 2).join(' | ') || 'clean');

  await page.screenshot({ path: `project-docs/non-finite-warnings/verify/playground-error-panel${SUFFIX}.png` });
} finally {
  await browser.close();
}

writeFileSync(`project-docs/non-finite-warnings/verify/playground-results${SUFFIX}.json`, `${JSON.stringify(results, null, 2)}\n`);
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
