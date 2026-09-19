/**
 * VS Code surface verification for strict mapSlice (2026-09-19).
 * Modeled on project-docs/range-values/verify/verify-vscode.mjs.
 * Requires `npm run build:vscode` first. Drives exactly what the .vsix ships:
 *   A. the BUNDLED language server (packages/vscode-pathogen/server) over
 *      stdio with real LSP messages — completion detail, snippet, hover, and
 *      no false diagnostics on the new options-object call
 *   B. the BUNDLED preview compiler (the script the preview webview loads) —
 *      default / partial / too-long / typo error, and demo parity with the CLI
 *
 * HEADLESS: this proves the shipped artifacts behave; it does not prove the
 * interactive feel of an installed extension.
 *
 * Run from the repo root: node project-docs/strict-mapslice/verify/verify-vscode.mjs
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

const DEMO = 'project-docs/strict-mapslice/demo.pathogen';
const code = readFileSync(DEMO, 'utf8');
const cliJson = JSON.parse(
  execFileSync('npx', ['tsx', 'src/cli.ts', DEMO, '--json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }),
);
const cliPath = cliJson.layers.map((l) => l.d ?? '').join(' ').trim();
if (!cliPath.includes('a 160 160')) throw new Error('CLI produced no ring data — the parity check would be vacuous');

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

  const completionSrc = 'let radii = [1, 2, 3];\nradii.';
  open('file:///mapslice-completion.pathogen', completionSrc);
  const completion = await request('textDocument/completion', { textDocument: { uri: 'file:///mapslice-completion.pathogen' }, position: endOf(completionSrc) });
  const items = Array.isArray(completion) ? completion : (completion?.items ?? []);
  const item = items.find((i) => i.label === 'mapSlice');
  check('LSP offers mapSlice on an array', !!item, `${items.length} items`);
  check('LSP completion detail carries the new signature', !!item && String(item.detail).includes('mapSlice(length, options?)') && String(item.detail).includes('partial'), String(item?.detail));
  check('LSP completion snippet still inserts only the required argument', !!item && String(item.insertText ?? item.textEdit?.newText) === 'mapSlice(${1:length})$0', JSON.stringify(item && (item.insertText ?? item.textEdit?.newText)));

  const hoverSrc = 'let radii = [1, 2, 3];\nlet pairs = radii.mapSlice(2);';
  open('file:///mapslice-hover.pathogen', hoverSrc);
  const hover = await request('textDocument/hover', { textDocument: { uri: 'file:///mapslice-hover.pathogen' }, position: { line: 1, character: 20 } });
  const hoverText = typeof hover?.contents === 'string' ? hover.contents : (hover?.contents?.value ?? JSON.stringify(hover?.contents));
  check('LSP hover on mapSlice carries the new signature', !!hoverText && hoverText.includes('mapSlice(length, options?)'), String(hoverText).slice(0, 110));

  // The new call shape puts an object literal in argument position: it must not
  // be flagged by the parser-level diagnostics.
  const optionSrc = 'let radii = [1, 2, 3];\nlet pairs = radii.mapSlice(2, { partial: true });\nM 0 0';
  open('file:///mapslice-options.pathogen', optionSrc);
  const optionDiags = await diagnosticsFor('file:///mapslice-options.pathogen');
  check('LSP reports no diagnostics for mapSlice(2, { partial: true })', Array.isArray(optionDiags) && optionDiags.length === 0, JSON.stringify(optionDiags?.map((d) => d.message)));
} catch (e) {
  check('LSP run completed', false, String(e && e.message));
} finally {
  proc.kill();
}

// ── B. Bundled preview compiler ─────────────────────────────────────────────
const bundle = readFileSync(join(ext, 'compiler', 'index.global.js'), 'utf8');
const browser = await puppeteer.launch({ headless: 'shell' });
try {
  const page = await browser.newPage();
  await page.setContent('<!doctype html><html><body></body></html>');
  await page.addScriptTag({ content: bundle });
  const out = await page.evaluate((src) => {
    const L = window.PathogenLang;
    const logOf = (s) => L.compile(s).logs[0].parts.map((p) => p.value).join('');
    const errorOf = (s) => { try { L.compile(s); return ''; } catch (e) { return String(e && e.message); } };
    const result = L.compile(src);
    return {
      d: result.layers.map((l) => l.data ?? l.d ?? '').join(' ').trim(),
      strict: logOf('let arr = [1, 2, 3, 4]; log(arr.mapSlice(2));'),
      partial: logOf('let arr = [1, 2, 3, 4]; log(arr.mapSlice(2, { partial: true }));'),
      tooLong: logOf('let arr = [1, 2]; log(arr.mapSlice(5));'),
      typo: errorOf('let radii = [160, 120, 80];\nlet pairs = radii.mapSlice(2, { strict: false });'),
      // Both halves of the session's work meeting: the short window only exists
      // behind { partial: true }, and the path-emit guard stops the null it yields.
      guard: errorOf('let radii = [120, 80, 40];\nfor ([pair, index] in radii.mapSlice(2, { partial: true })) {\n  let [outer, inner] = pair;\n  circle(200, 200, inner);\n}'),
      unguarded: errorOf('let radii = [120, 80, 40];\nfor ([pair, index] in radii.mapSlice(2)) {\n  let [outer, inner] = pair;\n  circle(200, 200, inner);\n}'),
      // Code-review Critical: a MISSING argument to a context-aware function.
      missingArg: errorOf('M 0 0 polarLine(0.5);'),
      fractional: errorOf('let radii = [1, 2, 3, 4];\nlet pairs = radii.mapSlice(2.6);'),
      validCtx: L.compile('M 0 0 polarLine(0deg, 10);').layers[0].data,
    };
  }, code);
  const normalize = (d) => d.replace(/\s+/g, ' ').trim();
  check('bundled preview path data equals CLI path data', normalize(out.d) === normalize(cliPath), `${normalize(out.d).length} vs ${normalize(cliPath).length} chars`);
  check('bundled preview: default is full windows only', out.strict.endsWith('[[1, 2], [2, 3], [3, 4]]'), out.strict);
  check('bundled preview: { partial: true } restores the old output', out.partial.endsWith('[[1, 2], [2, 3], [3, 4], [4]]'), out.partial);
  check('bundled preview: length longer than the array gives []', out.tooLong.endsWith('[]'), out.tooLong);
  check('bundled preview: { strict: false } is a positioned error naming the key', /Line 2, col \d+: mapSlice\(\) options: unknown key 'strict' \(supported: partial\)/.test(out.typo), out.typo);
  check('bundled preview: the reported loop compiles unguarded', out.unguarded === '', out.unguarded || 'no error');
  check('bundled preview: with { partial: true } the null reaches the guard, not the path', /circle\(\): argument 3 \(`inner`\) is null/.test(out.guard), out.guard);
  check('bundled preview: a missing context-aware argument stops the compile', /polarLine\(\) produced a non-numeric coordinate \(NaN\).*it received 1 argument\)/.test(out.missingArg), out.missingArg);
  check('bundled preview: a fractional length is an error, not a silent round', /Line 2, col \d+: mapSlice\(\) length must be a positive integer, got 2\.6 — wrap a computed length in round\(\)/.test(out.fractional), out.fractional);
  check('bundled preview: a valid context-aware call is untouched', out.validCtx === 'M 0 0 L 10 0', out.validCtx);
} catch (e) {
  check('preview-bundle run completed', false, String(e && e.message));
} finally {
  await browser.close();
}

writeFileSync('project-docs/strict-mapslice/verify/vscode-results.json', `${JSON.stringify({ at: new Date().toISOString(), results }, null, 2)}\n`);
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
