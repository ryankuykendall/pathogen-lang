/**
 * Playground verification for strict mapSlice (2026-09-19).
 * Modeled on project-docs/range-values/verify/verify-playground.mjs.
 *
 * Requires the dev stack (Pages on :3000) serving a build that includes the
 * change: PATHOGEN_API_BASE=http://localhost:8787 npm run build:website
 *
 * Asserts, against the REAL served bundle and the live editor UI:
 *   1. the demo renders in the preview and its path data equals the CLI's
 *   2. window.PathogenLang (the served bundle): default = full windows,
 *      { partial: true } = the old output, the `{ strict: false }` typo is a
 *      positioned error, completion detail + hover carry the new signature
 *   3. the live error panel shows the typo error to a user
 *
 * Run from the repo root:
 *   node project-docs/strict-mapslice/verify/verify-playground.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import puppeteer from 'puppeteer';

const ORIGIN = 'http://localhost:3000';
const DEMO = 'project-docs/strict-mapslice/demo.pathogen';
const code = readFileSync(DEMO, 'utf8');
const TYPO = 'let radii = [160, 120, 80];\nlet pairs = radii.mapSlice(2, { strict: false });\nM 0 0';

const cliJson = JSON.parse(
  execFileSync('npx', ['tsx', 'src/cli.ts', DEMO, '--json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }),
);
const cliPath = cliJson.layers.map((l) => l.d ?? '').join(' ').trim();
if (!cliPath.includes('a 160 160')) throw new Error('CLI produced no ring data — the parity check would be vacuous');

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
  // 1. Render parity with the CLI
  await open(code);
  const normalize = (d) => d.replace(/\s+/g, ' ').trim();
  const rendered = await pollUntil(
    () => page.evaluate(`(() => { ${WALK}
      const ds = walkAll(document, 'path', []).map((p) => p.getAttribute('d') || '').filter((d) => d.includes('a 160 160'));
      return ds.length ? ds[0] : null; })()`),
    40000,
    'rendered ring path',
  );
  check('demo renders in the playground preview', !!rendered);
  check('playground path data equals CLI path data', normalize(rendered) === normalize(cliPath), `${normalize(rendered).length} vs ${normalize(cliPath).length} chars`);

  // 2. The served bundle
  const ls = await page.evaluate(() => {
    const L = window.PathogenLang;
    const doc = (s) => new L.StringTextDocument(s);
    const logOf = (src) => L.compile(src).logs[0].parts.map((p) => p.value).join('');
    let typoError = '';
    try { L.compile('let radii = [160, 120, 80];\nlet pairs = radii.mapSlice(2, { strict: false });'); } catch (e) { typoError = String(e && e.message); }
    const completionSrc = 'let radii = [1, 2, 3];\nradii.';
    const item = L.getCompletions(doc(completionSrc), { line: 1, character: 6 }).find((c) => c.label === 'mapSlice');
    const hoverSrc = 'let radii = [1, 2, 3];\nlet pairs = radii.mapSlice(2);';
    const hover = L.getHoverInfo(doc(hoverSrc), { line: 1, character: 20 });
    return {
      strict: logOf('let arr = [1, 2, 3, 4]; log(arr.mapSlice(2));'),
      partial: logOf('let arr = [1, 2, 3, 4]; log(arr.mapSlice(2, { partial: true }));'),
      tooLong: logOf('let arr = [1, 2]; log(arr.mapSlice(5));'),
      // Code-review Critical: a MISSING argument to a context-aware function.
      missingArg: (() => { try { L.compile('M 0 0 polarLine(0.5);'); return ''; } catch (e) { return String(e && e.message); } })(),
      validCtx: L.compile('M 0 0 polarLine(0deg, 10);').layers[0].data,
      fractional: (() => { try { L.compile('let radii = [1, 2, 3, 4];\nlet pairs = radii.mapSlice(2.6);'); return ''; } catch (e) { return String(e && e.message); } })(),
      typoError,
      detail: item ? item.detail : null,
      insertText: item ? item.insertText : null,
      hover: hover ? hover.contents : null,
    };
  });
  check('served bundle: default is full windows only', ls.strict.endsWith('[[1, 2], [2, 3], [3, 4]]'), ls.strict);
  check('served bundle: { partial: true } restores the old output', ls.partial.endsWith('[[1, 2], [2, 3], [3, 4], [4]]'), ls.partial);
  check('served bundle: length longer than the array gives []', ls.tooLong.endsWith('[]'), ls.tooLong);
  check('served bundle: { strict: false } is a positioned error naming the key', /Line 2, col \d+: mapSlice\(\) options: unknown key 'strict' \(supported: partial\)/.test(ls.typoError), ls.typoError);
  check('served bundle: a missing context-aware argument stops the compile', /polarLine\(\) produced a non-numeric coordinate \(NaN\).*it received 1 argument\)/.test(ls.missingArg), ls.missingArg);
  check('served bundle: a fractional length is an error, not a silent round', /Line 2, col \d+: mapSlice\(\) length must be a positive integer, got 2\.6 — wrap a computed length in round\(\)/.test(ls.fractional), ls.fractional);
  check('served bundle: a valid context-aware call is untouched', ls.validCtx === 'M 0 0 L 10 0', ls.validCtx);
  check('completion detail carries the new signature', !!ls.detail && ls.detail.includes('mapSlice(length, options?)') && ls.detail.includes('partial'), String(ls.detail));
  check('completion snippet still inserts only the required argument', ls.insertText === 'mapSlice(${1:length})$0', String(ls.insertText));
  check('hover on mapSlice carries the new signature', !!ls.hover && ls.hover.includes('mapSlice(length, options?)'), String(ls.hover).slice(0, 120));

  // 3. The live error panel
  await open(TYPO);
  const panel = await pollUntil(
    () => page.evaluate(`(() => { ${WALK} const t = deepText(document); return t.includes("unknown key 'strict'") ? t : null; })()`),
    40000,
    'error panel text',
  ).catch(() => null);
  check('the error panel shows the typo error to the user', !!panel && panel.includes('(supported: partial)'));

  await page.screenshot({ path: 'project-docs/strict-mapslice/verify/playground-error-panel.png' });
} finally {
  await browser.close();
}

writeFileSync('project-docs/strict-mapslice/verify/playground-results.json', `${JSON.stringify(results, null, 2)}\n`);
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
