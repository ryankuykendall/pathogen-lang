/**
 * VS Code surface verification for range values `(a..b)`.
 * Requires `npm run build:vscode` first. Drives exactly what the .vsix ships:
 *   A. the BUNDLED language server (packages/vscode-pathogen/server) over
 *      stdio with real LSP messages — completion, hover, diagnostics, format
 *   B. the BUNDLED preview compiler (packages/vscode-pathogen/compiler/
 *      index.global.js, the script the preview webview loads) — compile the
 *      demo in a browser page and compare its path data with the CLI's
 *
 * Run from the repo root: node project-docs/range-values/verify/verify-vscode.mjs
 */
import { spawn, execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import puppeteer from 'puppeteer';

const root = process.cwd();
const ext = join(root, 'packages', 'vscode-pathogen');
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};

// ── Inputs shared by both halves ─────────────────────────────────────────────
const DEMO = 'project-docs/range-values/demo.pathogen';
const code = readFileSync(DEMO, 'utf8');
const cliJson = JSON.parse(execFileSync('npx', ['tsx', 'src/cli.ts', DEMO, '--json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
const cliPath = cliJson.layers.map((l) => l.d ?? '').join(' ').trim();
const FIXTURE = 'packages/vscode-pathogen/test-fixtures/all-syntax.pathogen';
const fixtureSource = readFileSync(FIXTURE, 'utf8');
const fixtureCli = JSON.parse(execFileSync('npx', ['tsx', 'src/cli.ts', FIXTURE, '--json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }))
  .layers.map((l) => `${l.name}:${l.d ?? ''}`).join('|');

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

// ── A. Bundled language server over stdio ────────────────────────────────────
const proc = spawn(process.execPath, [join(ext, 'server', 'out', 'server.js'), '--stdio'], { stdio: ['pipe', 'pipe', 'pipe'] });
let buf = Buffer.alloc(0);
const pending = new Map();
const notifications = [];
let stderr = '';
proc.stderr.on('data', (d) => { stderr += d; });
proc.stdout.on('data', (d) => {
  buf = Buffer.concat([buf, d]);
  for (;;) {
    const headerEnd = buf.indexOf('\r\n\r\n');
    if (headerEnd === -1) return;
    const len = Number(/Content-Length: (\d+)/.exec(buf.slice(0, headerEnd).toString())[1]);
    if (buf.length < headerEnd + 4 + len) return;
    const msg = JSON.parse(buf.slice(headerEnd + 4, headerEnd + 4 + len).toString());
    buf = buf.slice(headerEnd + 4 + len);
    if (msg.id !== undefined && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    else if (msg.method) notifications.push(msg);
  }
});
const write = (msg) => { const body = JSON.stringify(msg); proc.stdin.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`); };
let nextId = 1;
const request = (method, params) => new Promise((resolve, reject) => {
  const id = nextId++;
  const timer = setTimeout(() => reject(new Error(`LSP timeout: ${method}; stderr: ${stderr.slice(-300)}`)), 20000);
  pending.set(id, (msg) => { clearTimeout(timer); resolve(msg.result); });
  write({ jsonrpc: '2.0', id, method, params });
});
const notify = (method, params) => write({ jsonrpc: '2.0', method, params });
const open = (uri, text) => notify('textDocument/didOpen', { textDocument: { uri, languageId: 'pathogen', version: 1, text } });
const endOf = (text) => { const lines = text.split('\n'); return { line: lines.length - 1, character: lines[lines.length - 1].length }; };
const diagnosticsFor = async (uri) => {
  const t0 = Date.now();
  while (Date.now() - t0 < 15000) {
    const hit = notifications.filter((n) => n.method === 'textDocument/publishDiagnostics' && n.params.uri === uri).pop();
    if (hit) return hit.params.diagnostics;
    await new Promise((r) => setTimeout(r, 150));
  }
  return null;
};

try {
  await request('initialize', {
    processId: process.pid,
    rootUri: null,
    capabilities: { textDocument: { completion: { completionItem: { snippetSupport: true } } } },
  });
  notify('initialized', {});

  const completionSrc = 'let doubled = (1..100).';
  open('file:///range-completion.pathogen', completionSrc);
  const completion = await request('textDocument/completion', { textDocument: { uri: 'file:///range-completion.pathogen' }, position: endOf(completionSrc) });
  const items = Array.isArray(completion) ? completion : (completion?.items ?? []);
  const labels = items.map((i) => i.label);
  check('LSP completion after `(1..100).` offers array members', ['map', 'filter', 'reduce', 'length', 'mapSlice'].every((n) => labels.includes(n)), `${labels.length} items: ${labels.slice(0, 6).join(', ')}`);
  const mapItem = items.find((i) => i.label === 'map');
  check('LSP `map` completion is a snippet with the trailing block', !!mapItem && mapItem.insertTextFormat === 2 && String(mapItem.insertText ?? mapItem.textEdit?.newText).includes('{|'), JSON.stringify(mapItem && (mapItem.insertText ?? mapItem.textEdit?.newText)));

  const hoverSrc = 'let doubled = (1..100).map {|index|\n  return index * 2;\n};';
  open('file:///range-hover.pathogen', hoverSrc);
  const hover = await request('textDocument/hover', { textDocument: { uri: 'file:///range-hover.pathogen' }, position: { line: 1, character: 11 } });
  const hoverText = typeof hover?.contents === 'string' ? hover.contents : (hover?.contents?.value ?? JSON.stringify(hover?.contents));
  check('LSP hover types the block param as a number', !!hoverText && hoverText.includes('number'), hoverText);
  const okDiags = await diagnosticsFor('file:///range-hover.pathogen');
  check('LSP reports no diagnostics for a valid range value', Array.isArray(okDiags) && okDiags.length === 0, JSON.stringify(okDiags));

  open('file:///range-bare.pathogen', 'let steps = 1..5;');
  const bareDiags = await diagnosticsFor('file:///range-bare.pathogen');
  check('LSP diagnostic asks for parentheses at the operator', !!bareDiags && bareDiags.some((d) => d.message.includes('needs parentheses') && d.message.includes('(1..5)') && d.range.start.character === 13), JSON.stringify(bareDiags?.map((d) => [d.message, d.range.start])));

  open('file:///range-patharg.pathogen', 'M 0 0 L (1..3) 5;');
  const pathDiags = await diagnosticsFor('file:///range-patharg.pathogen');
  check('LSP diagnostic rejects a range in a path argument', !!pathDiags && pathDiags.some((d) => d.message.includes('range cannot be used as a path argument')), JSON.stringify(pathDiags?.map((d) => d.message)));

  const commentSrc = 'let mode = 1;\nswitch (mode) {\n  case 0 {\n    M 0 0\n  }\n      // case 1 {\n  //   M 1 1\n  // }\n  default {\n    M 2 2\n  }\n}\nlet list = [\n  10, // first\n  // 20,\n  30,\n];\nL list[0] list[1]';
  open('file:///comments-anywhere.pathogen', commentSrc);
  const commentDiags = await diagnosticsFor('file:///comments-anywhere.pathogen');
  check('LSP comments anywhere: no diagnostics for a commented-out case and a comment inside a list', Array.isArray(commentDiags) && commentDiags.length === 0, JSON.stringify(commentDiags?.map((d) => d.message)));
  const commentEdits = await request('textDocument/formatting', { textDocument: { uri: 'file:///comments-anywhere.pathogen' }, options: { tabSize: 2, insertSpaces: true } });
  const commentFormatted = commentEdits?.[0]?.newText ?? commentSrc;
  check('LSP comments anywhere: formatting keeps every comment and re-indents the commented-out clause', ['  // case 1 {', '  //   M 1 1', '  // }', '// first', '// 20,'].every((c) => commentFormatted.includes(c)) && !commentFormatted.includes('      // case 1 {'), JSON.stringify(commentFormatted.slice(0, 120)));

  open('file:///reserved-name.pathogen', 'M 0 0\nM 1 1\nlet rad = 50;');
  const reservedDiags = await diagnosticsFor('file:///reserved-name.pathogen');
  check('LSP reserved-name diagnostic sits on the name, not line 1', !!reservedDiags && reservedDiags.length === 1 && reservedDiags[0].message.includes("'rad' is reserved") && reservedDiags[0].range.start.line === 2 && reservedDiags[0].range.start.character === 4, JSON.stringify(reservedDiags?.map((d) => [d.message.slice(0, 40), d.range.start])));

  const fmtSrc = 'let doubled = (1..100).map() {|index|\nreturn index * 2;\n};';
  open('file:///range-format.pathogen', fmtSrc);
  const edits = await request('textDocument/formatting', { textDocument: { uri: 'file:///range-format.pathogen' }, options: { tabSize: 2, insertSpaces: true } });
  const formatted = edits?.[0]?.newText ?? '';
  check('LSP formatting keeps the range receiver', formatted.includes('let doubled = (1..100).map() {|index|\n  return index * 2;'), JSON.stringify(formatted.slice(0, 60)));

  open('file:///all-syntax.pathogen', fixtureSource);
  const fixtureDiags = await diagnosticsFor('file:///all-syntax.pathogen');
  check('all-syntax fixture: LSP reports zero diagnostics', Array.isArray(fixtureDiags) && fixtureDiags.length === 0, JSON.stringify(fixtureDiags?.slice(0, 3)));

  await request('shutdown', null);
  notify('exit', null);
} catch (e) {
  check('LSP session completed', false, String(e && e.message));
  proc.kill();
}

// ── B. Bundled preview compiler ─────────────────────────────────────────────
const bundle = readFileSync(join(ext, 'compiler', 'index.global.js'), 'utf8');

const browser = await puppeteer.launch({ headless: 'shell' });
try {
  const page = await browser.newPage();
  await page.setContent('<!doctype html><html><body></body></html>');
  await page.addScriptTag({ content: bundle });
  const fixtureInPage = await page.evaluate((src) => {
    const result = window.PathogenLang.compile(src);
    return result.layers.map((l) => `${l.name}:${l.data ?? ''}`).join('|');
  }, fixtureSource);
  check('all-syntax fixture: bundled preview has the same geometry as the CLI on every layer (numbers within 1e-9)', sameGeometry(fixtureInPage, fixtureCli), `byte-identical: ${fixtureInPage === fixtureCli}; ${fixtureInPage.length} vs ${fixtureCli.length} chars`);

  const out = await page.evaluate((src) => {
    const L = window.PathogenLang;
    const result = L.compile(src);
    let bareError = '';
    try { L.compile('let steps = 1..5;'); } catch (e) { bareError = String(e && e.message); }
    let commentCompile = '';
    try { commentCompile = L.compile('let mode = 1;\nswitch (mode) {\n  case 0 {\n    M 0 0\n  }\n      // case 1 {\n  //   M 1 1\n  // }\n  default {\n    M 2 2\n  }\n}\nlet list = [\n  10, // first\n  // 20,\n  30,\n];\nL list[0] list[1]').layers[0].data; } catch (e) { commentCompile = 'ERROR: ' + String(e && e.message); }
    let reservedError = '';
    try { L.compile('M 0 0\nM 1 1\nlet rad = 50;'); } catch (e) { reservedError = String(e && e.message); }
    const textLoop = L.compile('let t = &{ for (i in 0..<12000) { text(0, 0)`x` } }; log(t);').logs[0].parts[0].value;
    return {
      commentCompile,
      reservedError,
      textLoop,
      d: result.layers.map((l) => l.data ?? l.d ?? '').join(' ').trim(),
      logs: result.logs.map((entry) => entry.parts.map((p) => p.value).join('')),
      bareError,
    };
  }, code);
  const normalize = (d) => d.replace(/\s+/g, ' ').trim();
  check('bundled preview compiler renders the demo', out.d.length > 0, `${out.d.length} chars`);
  check('bundled preview path data equals CLI path data', cliPath.length > 0 && normalize(out.d) === normalize(cliPath), `${normalize(out.d).length} vs ${normalize(cliPath).length} chars`);
  check('bundled preview compiler logs the range arrays', out.logs.join(' | ').includes('[0, 1, 2, 3, 4, 5, 6, 7, 8, 9]') && out.logs.join(' | ').includes('[0, 2, 4, 6, 8]'), out.logs.join(' | '));
  check('bundled preview compiler asks for parentheses', out.bareError.includes('needs parentheses'), out.bareError);
  check('bundled preview compiler: a commented-out case and a comment inside a list compile', out.commentCompile === 'M 2 2 L 10 30', out.commentCompile);
  check('bundled preview compiler positions the reserved-name error', out.reservedError.includes("line 3, column 5: 'rad' is reserved"), out.reservedError);
  check('bundled preview compiler runs a 12,000-iteration text-block loop (old cap was 10,000)', out.textLoop === 'TextBlock(12000 elements)', String(out.textLoop));
} catch (e) {
  check('preview-bundle run completed', false, String(e && e.message));
} finally {
  await browser.close();
}

writeFileSync('project-docs/range-values/verify/vscode-results.json', JSON.stringify({ at: new Date().toISOString(), results }, null, 2));
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
