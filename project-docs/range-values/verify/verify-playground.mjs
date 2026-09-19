/**
 * Playground verification for range values `(a..b)`.
 * Requires the dev stack (Pages on :3000) serving a build that includes the
 * feature: PATHOGEN_API_BASE=http://localhost:8787 npm run build:website
 *
 * Asserts, against the REAL served bundle and editor:
 *   1. the demo program renders, and its path data equals the CLI's output
 *   2. window.PathogenLang language services: completions after `(1..100).`,
 *      hover type of the block param, the needs-parentheses diagnostic, and a
 *      formatter round-trip that keeps the range receiver
 *   3. typing `(1..100).` in the live CodeMirror editor opens an autocomplete
 *      list that contains `map`
 *
 * Run from the repo root:
 *   node project-docs/range-values/verify/verify-playground.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import puppeteer from 'puppeteer';

const ORIGIN = 'http://localhost:3000';
const DEMO = 'project-docs/range-values/demo.pathogen';
const code = readFileSync(DEMO, 'utf8');

const cliJson = JSON.parse(execFileSync('npx', ['tsx', 'src/cli.ts', DEMO, '--json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
const cliPath = cliJson.layers.map((l) => l.d ?? '').join(' ').trim();
const FIXTURE = 'packages/vscode-pathogen/test-fixtures/all-syntax.pathogen';
const fixtureSource = readFileSync(FIXTURE, 'utf8');
const fixtureCli = JSON.parse(execFileSync('npx', ['tsx', 'src/cli.ts', FIXTURE, '--json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }))
  .layers.map((l) => `${l.name}:${l.d ?? ''}`).join('|');
if (!cliPath) throw new Error('CLI produced no path data — the parity check would be vacuous');


/**
 * Same geometry: identical structure, numbers equal to within 1e-9. Byte
 * equality is too strict ACROSS ENGINES — Math.cos/sin differ in the last bit
 * between Node and Chrome (59.54915028125263 vs …262), so any program using
 * trig differs in the 16th digit between the CLI and a browser surface.
 */
function sameGeometry(a, b) {
  const NUM = /-?\d+(?:\.\d+)?(?:e[-+]?\d+)?/gi;
  if (a.replace(NUM, '#') !== b.replace(NUM, '#')) return false;
  const na = a.match(NUM) ?? [];
  const nb = b.match(NUM) ?? [];
  return na.length === nb.length && na.every((v, i) => Math.abs(Number(v) - Number(nb[i])) <= 1e-9 * Math.max(1, Math.abs(Number(v))));
}

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
`;

const state = Buffer.from(encodeURIComponent(JSON.stringify({ code }))).toString('base64');
try {
  await page.goto(`${ORIGIN}/workspace/scratch?state=${encodeURIComponent(state)}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
} catch {
  console.log('  (goto lifecycle timeout — polling the DOM directly)');
}

try {
  await pollUntil(() => page.evaluate(`(() => { ${WALK} return walkAll(document, '.cm-content', []).length > 0; })()`), 40000, 'editor');

  // 1. Render parity with the CLI
  const normalize = (d) => d.replace(/\s+/g, ' ').trim();
  const rendered = await pollUntil(
    () => page.evaluate(`(() => { ${WALK}
      const ds = walkAll(document, 'path', []).map((p) => p.getAttribute('d') || '').filter((d) => d.includes('M 21 60'));
      return ds.length ? ds[0] : null; })()`),
    40000,
    'rendered demo path',
  );
  check('demo renders in the playground preview', !!rendered);
  check('playground path data equals CLI path data', normalize(rendered) === normalize(cliPath), `${normalize(rendered).length} vs ${normalize(cliPath).length} chars`);

  // 2. Language services from the served bundle
  const fixtureInPage = await page.evaluate((src) => {
    const result = window.PathogenLang.compile(src);
    return { layers: result.layers.map((l) => `${l.name}:${l.data ?? ''}`).join('|'), diagnostics: window.PathogenLang.getDiagnostics(new window.PathogenLang.StringTextDocument(src)).length };
  }, fixtureSource);
  check('all-syntax fixture: zero diagnostics in the playground bundle', fixtureInPage.diagnostics === 0, String(fixtureInPage.diagnostics));
  check('all-syntax fixture: same geometry as the CLI on every layer (numbers within 1e-9)', sameGeometry(fixtureInPage.layers, fixtureCli), `byte-identical: ${fixtureInPage.layers === fixtureCli}; ${fixtureInPage.layers.length} vs ${fixtureCli.length} chars`);

  const ls = await page.evaluate(() => {
    const L = window.PathogenLang;
    const doc = (s) => new L.StringTextDocument(s);
    const endOf = (s) => { const lines = s.split('\n'); return { line: lines.length - 1, character: lines[lines.length - 1].length }; };
    const completionSrc = 'let doubled = (1..100).';
    const completions = L.getCompletions(doc(completionSrc), endOf(completionSrc)).map((c) => c.label);
    const hoverSrc = 'let doubled = (1..100).map {|index|\n  return index * 2;\n};';
    const hover = L.getHoverInfo(doc(hoverSrc), { line: 1, character: 11 });
    const diagnostics = L.getDiagnostics(doc('let steps = 1..5;')).map((d) => d.message);
    const okDiagnostics = L.getDiagnostics(doc('let steps = (1..5);\nM steps[0] 0')).map((d) => d.message);
    const fmtSrc = 'let doubled = (1..100).map() {|index|\n  return index * 2;\n};';
    const edits = L.formatDocument(doc(fmtSrc));
    const formatted = edits.length ? edits[0].newText : fmtSrc;
    let compileError = '';
    try { L.compile('let steps = 1..5;'); } catch (e) { compileError = String(e && e.message); }
    const logs = L.compile('log(`${(5..1)}`);').logs.map((entry) => entry.parts.map((p) => p.value).join(''));
    // A text-block loop above the OLD hardcoded 10,000 cap (every loop site shares one limit now)
    const textLoop = L.compile('let t = &{ for (i in 0..<12000) { text(0, 0)`x` } }; log(t);').logs[0].parts[0].value;
    // Comments anywhere: a commented-out case clause + a comment inside a list
    const commentSrc = 'let mode = 1;\nswitch (mode) {\n  case 0 {\n    M 0 0\n  }\n      // case 1 {\n  //   M 1 1\n  // }\n  default {\n    M 2 2\n  }\n}\nlet list = [\n  10, // first\n  // 20,\n  30,\n];\nL list[0] list[1]';
    let commentCompile = '';
    try { commentCompile = L.compile(commentSrc).layers[0].data; } catch (e) { commentCompile = 'ERROR: ' + String(e && e.message); }
    const commentDiagnostics = L.getDiagnostics(doc(commentSrc)).map((d) => d.message);
    const commentEdits = L.formatDocument(doc(commentSrc));
    const commentFormatted = commentEdits.length ? commentEdits[0].newText : commentSrc;
    // Reserved unit-suffix name: positioned AT the name (used to land on line 1)
    const reservedSrc = 'M 0 0\nM 1 1\nlet rad = 50;';
    let reservedError = '';
    try { L.compile(reservedSrc); } catch (e) { reservedError = String(e && e.message); }
    const reservedDiag = L.getDiagnostics(doc(reservedSrc)).map((d) => ({ start: d.range.start, message: d.message }));
    return { completions, hover: hover && hover.contents, diagnostics, okDiagnostics, formatted, compileError, logs, textLoop, reservedError, reservedDiag, commentCompile, commentDiagnostics, commentFormatted };
  });
  check('completions after `(1..100).` include map/filter/reduce/length', ['map', 'filter', 'reduce', 'length'].every((n) => ls.completions.includes(n)), `${ls.completions.length} items`);
  check('hover types the block param as a number', !!ls.hover && ls.hover.includes('number'), ls.hover ?? 'null');
  check('diagnostic asks for parentheses', ls.diagnostics.some((m) => m.includes('needs parentheses') && m.includes('(1..5)')), ls.diagnostics.join(' | '));
  check('a valid range value has no diagnostics', ls.okDiagnostics.length === 0, ls.okDiagnostics.join(' | '));
  check('formatter keeps the range receiver', ls.formatted.includes('(1..100).map()'), JSON.stringify(ls.formatted.slice(0, 40)));
  check('compile error asks for parentheses', ls.compileError.includes('needs parentheses'), ls.compileError);
  check('(5..1) evaluates to a descending array', ls.logs[0] === '[5, 4, 3, 2, 1]', ls.logs[0]);
  check('a text-block loop runs 12,000 iterations (old cap was 10,000)', ls.textLoop === 'TextBlock(12000 elements)', String(ls.textLoop));
  check('comments anywhere: a commented-out case and a comment inside a list compile', ls.commentCompile === 'M 2 2 L 10 30', ls.commentCompile);
  check('comments anywhere: no diagnostics', ls.commentDiagnostics.length === 0, ls.commentDiagnostics.join(' | '));
  check('comments anywhere: formatting keeps every comment and re-indents the commented-out clause', ['  // case 1 {', '  //   M 1 1', '  // }', '// first', '// 20,'].every((c) => ls.commentFormatted.includes(c)) && !ls.commentFormatted.includes('      // case 1 {'), JSON.stringify(ls.commentFormatted.slice(0, 120)));
  check('reserved-name compile error carries line and column', ls.reservedError.includes("line 3, column 5: 'rad' is reserved"), ls.reservedError);
  check('reserved-name diagnostic sits on the name, not line 1', ls.reservedDiag.length === 1 && ls.reservedDiag[0].start.line === 2 && ls.reservedDiag[0].start.character === 4, JSON.stringify(ls.reservedDiag));

  // 3. Live editor: type a range receiver and look for the autocomplete list
  await page.evaluate(`(() => { ${WALK} walkAll(document, '.cm-content', [])[0].focus(); })()`);
  await page.keyboard.down('Meta'); await page.keyboard.press('End'); await page.keyboard.up('Meta');
  await page.keyboard.press('Enter');
  await page.keyboard.type('let typed = (1..100).', { delay: 25 });
  // `mapSlice` exists only on arrays (stdlib has a `map` FUNCTION, so `map`
  // alone would pass on the general list) — wait for the member list itself.
  const readOptions = () => page.evaluate(`(() => { ${WALK}
      return walkAll(document, '.cm-tooltip-autocomplete li', []).map((li) => li.textContent || ''); })()`);
  let options = [];
  try {
    options = await pollUntil(async () => {
      const items = await readOptions();
      return items.some((t) => t.startsWith('mapSlice')) ? items : null;
    }, 15000, 'array member list');
  } catch {
    options = await readOptions();
  }
  const lastLine = await page.evaluate(`(() => { ${WALK}
      const lines = Array.from(walkAll(document, '.cm-content', [])[0].querySelectorAll('.cm-line')).map((l) => l.textContent || '');
      return lines[lines.length - 1]; })()`);
  check(
    'live editor offers array members after typing `(1..100).`',
    ['mapSlice', 'map', 'filter', 'length'].every((n) => options.some((t) => t.startsWith(n))),
    `last line ${JSON.stringify(lastLine)}; options: ${options.slice(0, 10).join(', ')}`,
  );

  // Toggle-comment: the docs say Cmd+/ (Ctrl+/) works in the playground editor.
  await page.keyboard.press('Escape');
  await page.keyboard.down('Meta'); await page.keyboard.press('Backspace'); await page.keyboard.up('Meta');
  await page.keyboard.type('M 9 9', { delay: 20 });
  await page.keyboard.press('Escape');
  const lastEditorLine = () => page.evaluate(`(() => { ${WALK}
      const lines = Array.from(walkAll(document, '.cm-content', [])[0].querySelectorAll('.cm-line')).map((l) => l.textContent || '');
      return lines[lines.length - 1]; })()`);
  await page.keyboard.down('Meta'); await page.keyboard.press('/'); await page.keyboard.up('Meta');
  const toggledOn = await lastEditorLine();
  await page.keyboard.down('Meta'); await page.keyboard.press('/'); await page.keyboard.up('Meta');
  const toggledOff = await lastEditorLine();
  check('live editor: Cmd+/ comments a line out and back in', toggledOn === '// M 9 9' && toggledOff === 'M 9 9', `${JSON.stringify(toggledOn)} then ${JSON.stringify(toggledOff)}`);
  await page.keyboard.down('Meta'); await page.keyboard.press('Backspace'); await page.keyboard.up('Meta');
  await page.keyboard.type('let typed = (1..100).', { delay: 25 });

  await page.screenshot({ path: 'project-docs/range-values/verify/playground.png' }).catch(() => {});

  // 4. An indexed element: the legacy source now defers on `]` receivers, so
  // the shared engine must answer with the ELEMENT type's members.
  await page.keyboard.press('Escape');
  await page.keyboard.down('Meta'); await page.keyboard.press('Backspace'); await page.keyboard.up('Meta');
  await page.keyboard.type('let pts = [Point(1, 2)];', { delay: 20 });
  await page.keyboard.press('Enter');
  await page.keyboard.type('let px = pts[0].', { delay: 25 });
  let elementOptions = [];
  try {
    elementOptions = await pollUntil(async () => {
      const items = await readOptions();
      return items.some((t) => /^x\b|^xX|^x[^a-z]/.test(t)) ? items : null;
    }, 15000, 'Point member list');
  } catch {
    elementOptions = await readOptions();
  }
  check(
    'live editor offers Point members after typing `pts[0].`',
    elementOptions.some((t) => t.startsWith('x')) && elementOptions.some((t) => t.startsWith('y')) && !elementOptions.some((t) => t.startsWith('calc')),
    `options: ${elementOptions.slice(0, 8).map((t) => t.slice(0, 24)).join(' | ')}`,
  );
} catch (e) {
  check('verification run completed', false, String(e && e.message));
} finally {
  await browser.close();
}

writeFileSync('project-docs/range-values/verify/playground-results.json', JSON.stringify({ at: new Date().toISOString(), results }, null, 2));
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
