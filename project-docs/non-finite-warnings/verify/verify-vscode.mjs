/**
 * VS Code surface verification — non-finite warnings, strict mode, error positions
 * (ISSUE-023 + ISSUE-022, 2026-09-19). Harness modeled on
 * project-docs/strict-mapslice/verify/verify-vscode.mjs.
 * Requires `npm run build:vscode` first. Drives exactly what the .vsix ships:
 *   A. the BUNDLED language server over stdio with real LSP messages — it must
 *      PUBLISH a Warning diagnostic (severity 2) at the NaN, and none for a clean file
 *   B. the BUNDLED preview compiler — warnings, strict mode, what stays an error,
 *      and the ISSUE-022 positions
 *
 * HEADLESS: proves the shipped artifacts; not the interactive feel of an install.
 *
 * Run from the repo root: node project-docs/non-finite-warnings/verify/verify-vscode.mjs
 */
import { spawn } from 'node:child_process';
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
const demo = readFileSync('project-docs/non-finite-warnings/demo.pathogen', 'utf8');

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
  await request('initialize', { processId: process.pid, rootUri: null, capabilities: {} });
  notify('initialized', {});

  open('file:///nan.pathogen', 'let bad = sqrt(-1);\nM bad 0');
  const nanDiags = await diagnosticsFor('file:///nan.pathogen');
  const hit = (nanDiags ?? []).find((d) => d.message.includes('is NaN in a path argument'));
  check('LSP publishes a diagnostic for a NaN path argument', !!hit, JSON.stringify((nanDiags ?? []).map((d) => d.message)));
  check('…with severity Warning (2), not Error (1)', !!hit && hit.severity === 2, String(hit?.severity));
  check('…on the right line and column (0-based: line 1, character 2)', !!hit && hit.range.start.line === 1 && hit.range.start.character === 2, JSON.stringify(hit?.range?.start));

  open('file:///demo.pathogen', demo);
  const demoDiags = await diagnosticsFor('file:///demo.pathogen');
  const demoHit = (demoDiags ?? []).filter((d) => d.message.includes('is Infinity in a path argument'));
  check('LSP: the demo gets exactly one Infinity warning, on line 28', demoHit.length === 1 && demoHit[0].range.start.line === 27 && demoHit[0].severity === 2, JSON.stringify(demoHit.map((d) => [d.severity, d.range.start])));

  open('file:///clean.pathogen', 'let shift = -5;\nM shift 0 h 0 l calc(shift * 2.5) 0.25');
  const cleanDiags = await diagnosticsFor('file:///clean.pathogen');
  check('LSP: finite arguments — zero, negative, fractional — produce no diagnostic', Array.isArray(cleanDiags) && cleanDiags.length === 0, JSON.stringify(cleanDiags?.map((d) => d.message)));
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
    const errorOf = (f) => { try { f(); return ''; } catch (e) { return String(e && e.message); } };
    const nan = 'let bad = sqrt(-1);\nM bad 0';
    const result = L.compile(src);
    return {
      warnings: result.warnings,
      layers: result.layers.map((l) => `${l.name}:${l.data}`),
      strictAll: errorOf(() => L.compile(nan, { strict: true })),
      strictNamed: errorOf(() => L.compile(nan, { strict: ['non-finite'] })),
      strictOther: L.compile(nan, { strict: ['gradient'] }).warnings.length,
      drawingFn: L.compile('let radius = sqrt(-1);\ncircle(50, 50, radius);').warnings.map((w) => w.message),
      pinnedContract: L.compile('M calc(smoothstep(5, 5, 5)) 0').layers[0].data,
      nullStillFatal: errorOf(() => L.compile('let [present, missing] = [40];\ncircle(50, 50, missing);')),
      missingArgStillFatal: errorOf(() => L.compile('M 0 0 polarLine(0.5);')),
      literalReceiver: errorOf(() => L.compile("let one = 1;\nlet two = 2;\nlet result = [one, two].slice('a');")),
      stringReceiver: errorOf(() => L.compile("let pad = 0;\nlet result = 'abc'.slice('a', 'b', 'c');")),
      forEachHeader: errorOf(() => L.compile("let list = [1, 2];\nlet pad = 0;\nfor (item in list.slice('a')) { M item 0 }")),
    };
  }, demo);
  check('bundled preview: the demo warns once — non-finite, line 28 col 5', out.warnings.length === 1 && out.warnings[0].code === 'non-finite' && out.warnings[0].line === 28 && out.warnings[0].column === 5, JSON.stringify(out.warnings));
  check('bundled preview: both layers are emitted, the sound one intact', out.layers.includes('sound:M 20 60 L 380 60') && out.layers.some((l) => l.startsWith('degenerate:') && l.includes('Infinity')), JSON.stringify(out.layers));
  check('bundled preview: strict: true → positioned error naming the code', /^Line 2, col 3: .* \(strict: non-finite\)$/.test(out.strictAll), out.strictAll);
  check("bundled preview: strict: ['non-finite'] → same error", /\(strict: non-finite\)$/.test(out.strictNamed), out.strictNamed);
  check("bundled preview: strict: ['gradient'] leaves it a warning", out.strictOther === 1, String(out.strictOther));
  check('bundled preview: a drawing function warns instead of throwing', out.drawingFn.length === 1 && out.drawingFn[0].startsWith('circle(): argument 3 (`radius`) is NaN'), JSON.stringify(out.drawingFn));
  check('bundled preview: a pinned math contract still reaches the path', out.pinnedContract === 'M NaN 0', out.pinnedContract);
  check('bundled preview: null is still an error', /is null/.test(out.nullStillFatal), out.nullStillFatal);
  check('bundled preview: a missing context-aware argument is still an error', /produced a non-numeric coordinate/.test(out.missingArgStillFatal), out.missingArgStillFatal);
  check('ISSUE-022: array-literal receiver error is positioned', /^Line 3, col 14: slice\(\)/.test(out.literalReceiver), out.literalReceiver);
  check('ISSUE-022: string-literal receiver error is positioned', /^Line 2, col 14: slice\(\)/.test(out.stringReceiver), out.stringReceiver);
  check('ISSUE-022: for-each header error is positioned at the header', /^Line 3, col 14: slice\(\)/.test(out.forEachHeader), out.forEachHeader);
} catch (e) {
  check('preview-bundle run completed', false, String(e && e.message));
} finally {
  await browser.close();
}

writeFileSync('project-docs/non-finite-warnings/verify/vscode-results.json', `${JSON.stringify({ at: new Date().toISOString(), results }, null, 2)}\n`);
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
