/**
 * Phase 0b: fonts in the VS Code preview. Requires `npm run build:vscode`
 * first, and the network for the Google Fonts checks. Drives exactly what the
 * .vsix ships:
 *   A. the extension host's font session (packages/vscode-pathogen/out/
 *      font-session.js) with the library loaded from the bundled
 *      server/node_modules, as preview.ts loads it;
 *   B. the real webview page (out/webview-html.js) under its real CSP in
 *      headless Chrome, served with the bundled compiler/ scripts, fed the
 *      same `fonts` / `update` messages the host sends — and compared with the
 *      CLI on the same program and font;
 *   C. the bundled language server over stdio: diagnostics with fonts.
 *
 * Run from the repo root: node project-docs/modules/verify/verify-vscode-fonts.mjs
 */
import { execFileSync, spawn } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { extname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

import puppeteer from 'puppeteer';

const root = process.cwd();
const ext = join(root, 'packages', 'vscode-pathogen');
const require = createRequire(import.meta.url);
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};

/** Same geometry: identical structure, numbers within 1e-9 (trig differs in the last bit across engines). */
function sameGeometry(a, b) {
  const NUM = /-?\d+(?:\.\d+)?(?:e[-+]?\d+)?/gi;
  if (a.replace(NUM, '#') !== b.replace(NUM, '#')) return false;
  const na = a.match(NUM) ?? [];
  const nb = b.match(NUM) ?? [];
  return (
    na.length === nb.length &&
    na.every((v, i) => Math.abs(Number(v) - Number(nb[i])) <= 1e-9 * Math.max(1, Math.abs(Number(v))))
  );
}

// ── Fixtures: a project folder with a font file, and a fresh download cache ──
mkdirSync(join(root, 'tmp'), { recursive: true });
const project = mkdtempSync(join(root, 'tmp', 'vscode-fonts-'));
mkdirSync(join(project, 'fonts'));
writeFileSync(join(project, 'pathogen.json'), '{}\n');
copyFileSync(join(root, 'fonts', 'Baumans', 'Baumans-Regular.ttf'), join(project, 'fonts', 'Baumans-Regular.ttf'));
const cacheDir = join(project, '.font-cache');
process.env.PATHOGEN_CACHE_DIR = cacheDir;
delete process.env.PATHOGEN_OFFLINE;

const FILE_PROGRAM = [
  'define ViewBox(0, 0, 400, 160);',
  '@font "./fonts/Baumans-Regular.ttf";',
  'let style = #{ font-family: Baumans-Regular; font-size: 96; };',
  'let word = PathBlock.fromGlyph("Ab", style);',
  'M 20 130',
  'word[0].draw()',
  'M 90 130',
  'word[1].draw()',
  "define TextLayer('label') #{ font-family: Baumans-Regular; font-size: 40; fill: #555; }",
  "layer('label').apply { text(220, 130)`Ab` }",
].join('\n');
const GOOGLE_PROGRAM = [
  'define ViewBox(0, 0, 400, 160);',
  '@font "Lobster";',
  'let style = #{ font-family: Lobster; font-size: 96; };',
  'let g = PathBlock.fromGlyph("L", style);',
  'M 20 130',
  'g[0].draw()',
].join('\n');
const filePath = join(project, 'poster.pathogen');
const googlePath = join(project, 'google.pathogen');
writeFileSync(filePath, FILE_PROGRAM);
writeFileSync(googlePath, GOOGLE_PROGRAM);

/** The CLI on the same file, same cache: its layers' path data. */
function cliLayers(file, env = {}) {
  const out = execFileSync('npx', ['tsx', 'src/cli.ts', file, '--json'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ...env },
  });
  // Path layers only: a text layer's `d` in --json is its text content.
  return JSON.parse(out)
    .layers.filter((l) => l.type === 'path' && l.d)
    .map((l) => l.d);
}

// ── A. The extension host's font session, as shipped ─────────────────────────
const bundled = createRequire(join(ext, 'server', 'node_modules', '_resolve.js'));
const libs = { lib: bundled('pathogen-lang'), node: bundled('pathogen-lang/node') };
const { FontSession } = require(join(ext, 'out', 'font-session.js'));
const session = new FontSession(libs);

const fileFonts = await session.load(FILE_PROGRAM, filePath);
const filePayloads = session.undelivered(fileFonts.fontIds);
check(
  'A1 a project font file loads in the extension host, byte for byte',
  fileFonts.errors.length === 0 &&
    filePayloads.length === 1 &&
    Buffer.from(filePayloads[0].buffer).equals(readFileSync(join(project, 'fonts', 'Baumans-Regular.ttf'))),
  JSON.stringify({ errors: fileFonts.errors, fonts: filePayloads.map((f) => [f.family, f.weight, f.kind]) }),
);

const escape = await session.load('@font "../../fonts/Baumans/Baumans-Regular.ttf";', filePath);
check(
  'A2 a path that leaves the project folder is an error naming the folder',
  escape.errors.length === 1 && escape.errors[0].includes(`leaves the project folder (${project})`),
  escape.errors[0],
);

let googlePayloads = [];
try {
  const googleFonts = await session.load(GOOGLE_PROGRAM, googlePath);
  googlePayloads = session.undelivered(googleFonts.fontIds);
  check(
    'A3 a Google family downloads as one complete TTF',
    googleFonts.errors.length === 0 && googlePayloads.length === 1 && googlePayloads[0].kind === 'ttf',
    JSON.stringify({
      errors: googleFonts.errors,
      notices: googleFonts.notices,
      bytes: googlePayloads[0]?.buffer.byteLength,
    }),
  );
} catch (e) {
  check('A3 a Google family downloads as one complete TTF', false, String(e && e.message));
}

process.env.PATHOGEN_OFFLINE = '1';
const offlineSession = new FontSession(libs);
const fromCache = await offlineSession.load(GOOGLE_PROGRAM, googlePath);
check(
  'A4 with downloads off, the cached copy is used (the CLI, extension and server share the cache)',
  fromCache.errors.length === 0 && fromCache.notices.length === 0 && fromCache.fontIds.length === 1,
  JSON.stringify(fromCache),
);
const restricted = await new FontSession({ ...libs, offline: () => 'VS Code Restricted Mode' }).load(
  '@font "Zzyzx Nonesuch";',
  googlePath,
);
check(
  'A5 a family that is not cached, with downloads off, is a warning naming the reason',
  restricted.notices.length === 1 && restricted.notices[0].includes('downloads are off (VS Code Restricted Mode)'),
  restricted.notices[0],
);
delete process.env.PATHOGEN_OFFLINE;

// ── B. The real webview page, real CSP, bundled scripts ──────────────────────
const TYPES = { '.js': 'text/javascript', '.html': 'text/html' };
const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/') {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(page);
    return;
  }
  try {
    const body = readFileSync(join(ext, url.pathname));
    res.writeHead(200, { 'content-type': TYPES[extname(url.pathname)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const { getWebviewContent } = require(join(ext, 'out', 'webview-html.js'));
const page = getWebviewContent(
  `${base}/compiler/index.global.js`,
  `${base}/compiler/pan-zoom.global.js`,
  base,
  'verifynonce',
);

const browser = await puppeteer.launch({ headless: 'shell' });
try {
  const tab = await browser.newPage();
  await tab.setViewport({ width: 900, height: 420 });
  const pageErrors = [];
  tab.on('pageerror', (e) => pageErrors.push(String(e && e.message)));
  await tab.evaluateOnNewDocument(() => {
    window.__posted = [];
    window.__csp = [];
    window.acquireVsCodeApi = () => ({ postMessage: (m) => window.__posted.push(m), getState() {}, setState() {} });
    document.addEventListener('securitypolicyviolation', (e) =>
      window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`),
    );
  });
  await tab.goto(base, { waitUntil: 'load' });
  await tab.waitForFunction(() => window.__posted.some((m) => m.type === 'ready'), { timeout: 10000 });
  check('B1 the page loads under its CSP and says ready', true);

  const send = (msg) => tab.evaluate((m) => window.postMessage(m, '*'), msg);
  /** Font payloads cross into the page as base64 and become ArrayBuffers there. */
  /** `reply` marks the host's answer to `needFonts`, as preview.ts sends it. */
  const sendFonts = (fonts, reply = false) =>
    tab.evaluate(
      (list, isReply) =>
        window.postMessage(
          {
            type: 'fonts',
            ...(isReply ? { reply: true } : {}),
            fonts: list.map((f) => ({
              ...f,
              buffer: Uint8Array.from(atob(f.b64), (c) => c.charCodeAt(0)).buffer,
              b64: undefined,
            })),
          },
          '*',
        ),
      fonts.map((f) => ({
        id: f.id,
        family: f.family,
        weight: f.weight,
        style: f.style,
        kind: f.kind,
        b64: Buffer.from(f.buffer).toString('base64'),
      })),
      reply,
    );
  const status = () => tab.$eval('#status', (el) => el.textContent);
  const previewPaths = () => tab.$$eval('#preview-content path[d]', (els) => els.map((el) => el.getAttribute('d')));

  // B2 — an update that names a font the page doesn't hold asks for it, then compiles when it arrives.
  await send({
    type: 'update',
    seq: 1,
    uri: 'file:///poster.pathogen',
    source: FILE_PROGRAM,
    fontIds: fileFonts.fontIds,
    notices: [],
    errors: [],
  });
  await tab.waitForFunction(() => window.__posted.some((m) => m.type === 'needFonts'), { timeout: 5000 });
  const asked = await tab.evaluate(() => window.__posted.find((m) => m.type === 'needFonts').ids);
  check(
    'B2 an update naming a missing font asks for exactly that font',
    JSON.stringify(asked) === JSON.stringify(fileFonts.fontIds),
    JSON.stringify(asked),
  );
  await sendFonts(filePayloads, true);
  await tab.waitForFunction(() => document.getElementById('status').textContent === 'Compiled', { timeout: 15000 });
  const fileDom = await previewPaths();
  const fileCli = cliLayers(filePath, { PATHOGEN_OFFLINE: '1' });
  check(
    'B3 fromGlyph renders in the preview with the same geometry as the CLI (same font file)',
    fileCli.length > 0 && fileCli.every((d, i) => sameGeometry(d, fileDom[i] ?? '')),
    `${fileDom.length} preview paths vs ${fileCli.length} CLI layers; byte-identical: ${JSON.stringify(fileDom) === JSON.stringify(fileCli)}`,
  );
  const faces = await tab.$eval('#pathogen-font-faces', (el) => el.textContent);
  check(
    'B4 live <text> gets the loaded face as an inlined @font-face',
    faces.includes('font-family: "Baumans-Regular"') && faces.includes('data:font/ttf;base64,'),
    `${faces.length} chars of @font-face`,
  );
  const textFont = await tab
    .$eval('#preview-content text', (el) => getComputedStyle(el).fontFamily)
    .catch(() => '(no text element)');
  check('B5 the <text> element asks for that face', textFont.includes('Baumans-Regular'), textFont);
  await tab.screenshot({ path: 'project-docs/modules/verify/vscode-webview-fonts.png' });

  // B6 — the Google family, parity with the CLI on the same downloaded file.
  if (googlePayloads.length === 1) {
    await sendFonts(googlePayloads);
    await send({
      type: 'update',
      seq: 2,
      uri: 'file:///google.pathogen',
      source: GOOGLE_PROGRAM,
      fontIds: [googlePayloads[0].id],
      notices: [],
      errors: [],
    });
    await tab.waitForFunction(
      () => {
        const d = document.querySelector('#preview-content path[d]');
        return document.getElementById('status').textContent === 'Compiled' && d && d.getAttribute('d').length > 50;
      },
      { timeout: 15000 },
    );
    const googleDom = await previewPaths();
    const googleCli = cliLayers(googlePath, { PATHOGEN_OFFLINE: '1' });
    check(
      'B6 a downloaded Google font renders with the same geometry as the CLI',
      googleCli.length > 0 && googleCli.every((d, i) => sameGeometry(d, googleDom[i] ?? '')),
      `byte-identical: ${JSON.stringify(googleDom) === JSON.stringify(googleCli)}`,
    );
  } else {
    check('B6 a downloaded Google font renders with the same geometry as the CLI', false, 'no download (A3 failed)');
  }

  // B7 — curated families named only in a style block are requested for display.
  const DISPLAY =
    "define TextLayer('title') #{ font-family: Raleway; font-weight: 700; font-size: 24; }\nlayer('title').apply { text(10, 40)`Hello` }";
  await send({
    type: 'update',
    seq: 3,
    uri: 'file:///display.pathogen',
    source: DISPLAY,
    fontIds: [],
    notices: [],
    errors: [],
  });
  await tab
    .waitForFunction(() => window.__posted.some((m) => m.type === 'displayFonts'), { timeout: 5000 })
    .catch(() => undefined);
  const display = await tab.evaluate(() =>
    window.__posted.filter((m) => m.type === 'displayFonts').map((m) => m.families),
  );
  check(
    'B7 a curated family used only for <text> is requested for display',
    JSON.stringify(display) === JSON.stringify([[{ family: 'Raleway', weight: 700 }]]),
    JSON.stringify(display),
  );

  // B8 — font errors stop the compile (as in the CLI); warnings show in the notices bar.
  await send({
    type: 'update',
    seq: 4,
    uri: 'file:///poster.pathogen',
    source: 'M 0 0',
    fontIds: [],
    notices: ['Line 1, col 1: a notice'],
    errors: ['Line 2, col 1: @font file "./x.ttf" was not found'],
  });
  await tab.waitForFunction(() => !!document.querySelector('.error'), { timeout: 5000 });
  const shown = await tab.evaluate(() => ({
    error: document.querySelector('.error').textContent,
    notices: document.getElementById('notices').hidden ? null : document.getElementById('notices').textContent,
  }));
  check(
    'B8 a font error stops the compile and is shown; warnings fill the notices bar',
    shown.error.includes('was not found') && shown.notices === 'Line 1, col 1: a notice',
    JSON.stringify(shown),
  );

  // B9 — an older update arriving late never replaces a newer one.
  await send({
    type: 'update',
    seq: 3,
    uri: 'file:///poster.pathogen',
    source: 'M 9 9',
    fontIds: [],
    notices: [],
    errors: [],
  });
  await new Promise((r) => setTimeout(r, 300));
  check('B9 an out-of-order older update is ignored', (await status()) === 'Error', await status());

  // B11 — the same file closed and reopened (its document version starts again at 1) still updates.
  await send({
    type: 'update',
    seq: 5,
    uri: 'file:///poster.pathogen',
    source: 'M 9 9 L 20 20',
    fontIds: [],
    notices: [],
    errors: [],
  });
  await tab
    .waitForFunction(() => document.getElementById('status').textContent === 'Compiled', { timeout: 5000 })
    .catch(() => undefined);
  const reopened = await previewPaths();
  check(
    'B11 a reopened file still updates the preview',
    reopened.some((d) => d.startsWith('M 9 9 L 20 20')),
    JSON.stringify(reopened),
  );

  // B12 — fonts that never arrive end in a message, not an endless wait.
  await send({
    type: 'update',
    seq: 6,
    uri: 'file:///poster.pathogen',
    source: 'M 0 0',
    fontIds: ['never-sent'],
    notices: [],
    errors: [],
  });
  await tab.waitForFunction(() => window.__posted.filter((m) => m.type === 'needFonts').length >= 2, { timeout: 5000 });
  await sendFonts([], true);
  await tab.waitForFunction(() => !!document.querySelector('.error'), { timeout: 5000 }).catch(() => undefined);
  const stranded = await tab.evaluate(() => document.querySelector('.error')?.textContent ?? '');
  check('B12 fonts that never arrive end in a message', stranded.includes('did not reach the preview'), stranded);

  const csp = await tab.evaluate(() => window.__csp);
  check(
    'B10 no Content-Security-Policy violations and no page errors',
    csp.length === 0 && pageErrors.length === 0,
    JSON.stringify({ csp, pageErrors }),
  );
} catch (e) {
  check('webview run completed', false, String(e && e.stack));
} finally {
  await browser.close();
  server.close();
}

// ── C. The bundled language server: diagnostics with fonts ──────────────────
const proc = spawn(process.execPath, [join(ext, 'server', 'out', 'server.js'), '--stdio'], {
  stdio: ['pipe', 'pipe', 'pipe'],
  env: { ...process.env, PATHOGEN_OFFLINE: '1' },
});
let lspBuf = Buffer.alloc(0);
const pendingLsp = new Map();
const notifications = [];
let lspStderr = '';
proc.stderr.on('data', (d) => {
  lspStderr += d;
});
proc.stdout.on('data', (d) => {
  lspBuf = Buffer.concat([lspBuf, d]);
  for (;;) {
    const headerEnd = lspBuf.indexOf('\r\n\r\n');
    if (headerEnd === -1) return;
    const len = Number(/Content-Length: (\d+)/.exec(lspBuf.slice(0, headerEnd).toString())[1]);
    if (lspBuf.length < headerEnd + 4 + len) return;
    const msg = JSON.parse(lspBuf.slice(headerEnd + 4, headerEnd + 4 + len).toString());
    lspBuf = lspBuf.slice(headerEnd + 4 + len);
    if (msg.id !== undefined && pendingLsp.has(msg.id)) {
      pendingLsp.get(msg.id)(msg);
      pendingLsp.delete(msg.id);
    } else if (msg.method) notifications.push(msg);
  }
});
const lspWrite = (msg) => {
  const body = JSON.stringify(msg);
  proc.stdin.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
};
let nextId = 1;
const request = (method, params) =>
  new Promise((resolve, reject) => {
    const id = nextId++;
    const timer = setTimeout(
      () => reject(new Error(`LSP timeout: ${method}; stderr: ${lspStderr.slice(-300)}`)),
      20000,
    );
    pendingLsp.set(id, (msg) => {
      clearTimeout(timer);
      resolve(msg.result);
    });
    lspWrite({ jsonrpc: '2.0', id, method, params });
  });
const notify = (method, params) => lspWrite({ jsonrpc: '2.0', method, params });
const diagnosticsFor = async (uri) => {
  const t0 = Date.now();
  while (Date.now() - t0 < 15000) {
    const hit = notifications
      .filter((n) => n.method === 'textDocument/publishDiagnostics' && n.params.uri === uri)
      .pop();
    if (hit) return hit.params.diagnostics;
    await new Promise((r) => setTimeout(r, 150));
  }
  return null;
};
try {
  await request('initialize', { processId: process.pid, rootUri: null, capabilities: {} });
  notify('initialized', {});
  const afterGlyph = [
    '@font "./fonts/Baumans-Regular.ttf";',
    'let s = #{ font-family: Baumans-Regular; font-size: 48; };',
    'let g = PathBlock.fromGlyph("A", s);',
    'M calc(0/0) 10',
  ].join('\n');
  const uri1 = pathToFileURL(join(project, 'after-glyph.pathogen')).href;
  notify('textDocument/didOpen', { textDocument: { uri: uri1, languageId: 'pathogen', version: 1, text: afterGlyph } });
  const d1 = await diagnosticsFor(uri1);
  check(
    'C1 the language server loads the font, so a problem after a font call reaches the Problems panel',
    !!d1 && d1.length === 1 && d1[0].range.start.line === 3 && d1[0].severity === 2 && d1[0].message.includes('NaN'),
    JSON.stringify(d1?.map((d) => [d.severity, d.range.start.line, d.source, d.message.slice(0, 40)])),
  );
  const uri2 = pathToFileURL(join(project, 'missing.pathogen')).href;
  notify('textDocument/didOpen', {
    textDocument: { uri: uri2, languageId: 'pathogen', version: 1, text: 'M 0 0\n@font "./fonts/Missing.ttf";' },
  });
  const d2 = await diagnosticsFor(uri2);
  check(
    'C2 a missing font file is an error at its @font line',
    !!d2 &&
      d2.length === 1 &&
      d2[0].range.start.line === 1 &&
      d2[0].severity === 1 &&
      d2[0].source === 'pathogen-fonts',
    JSON.stringify(d2?.map((d) => [d.severity, d.range.start.line, d.source, d.message.slice(0, 60)])),
  );
  await request('shutdown', null);
  notify('exit', null);
} catch (e) {
  check('LSP session completed', false, String(e && e.message));
  proc.kill();
} finally {
  rmSync(project, { recursive: true, force: true });
}

writeFileSync(
  'project-docs/modules/verify/vscode-fonts-results.json',
  JSON.stringify({ at: new Date().toISOString(), results }, null, 2),
);
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
