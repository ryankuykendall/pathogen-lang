/**
 * Phase 3a step 4: data imports in VS Code, as shipped (docs/data-import.md
 * "In each tool" and "In the editor"). Requires `npm run build:vscode` first.
 *   A. the extension host's side (out/preview-modules.js) with the bundled
 *      library: a data file goes to the page as text;
 *   B. the real webview page (out/webview-html.js) under its real CSP, with
 *      the bundled scripts: it reads the text again and draws what the CLI
 *      draws; an unsaved edit to the data file redraws;
 *   C. the bundled language server over stdio: hover, the keys after a dot
 *      (a bracket key with its textEdit and filterText), data files offered
 *      for a data import's path, the "has no key" warning, an unsaved data
 *      edit rechecking its importer (`pathogen/dataFile`), and the
 *      pathogen.maxDataSize setting (`pathogen/settings`).
 *
 * Run from the repo root: node project-docs/modules/verify/verify-3a-step4.mjs
 * Writes verify-3a-step4-results.json beside this script; exits 1 on a failure.
 */
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import puppeteer from 'puppeteer';

const here = dirname(fileURLToPath(import.meta.url));
const root = process.cwd();
const ext = join(root, 'packages', 'vscode-pathogen');
const require = createRequire(import.meta.url);
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : `  — ${detail}`}`);
};

// ── A project: a data file and a program that draws it ─────────────────────────
mkdirSync(join(root, 'tmp'), { recursive: true });
const project = mkdtempSync(join(root, 'tmp', 'verify-3a-step4-'));
const write = (path, text) => {
  mkdirSync(join(project, ...path.split('/').slice(0, -1)), { recursive: true });
  writeFileSync(join(project, ...path.split('/')), text);
};
const GEARS =
  '[\n  { "name": "drive", "x": 55, "y": 50, "radius": 40, "teeth": 12, "Notes (2020)": "a" },\n  { "name": "idler", "x": 150, "y": 50, "radius": 28, "teeth": 8 }\n]\n';
const MAIN = [
  '// main.pathogen',
  'import gears from "./data/gears.json";',
  '',
  'define ViewBox(0, 0, 200, 100);',
  '',
  'for (gear in gears) {',
  '  star(gear.x, gear.y, gear.radius, gear.radius - 6, gear.teeth);',
  '  circle(gear.x, gear.y, gear.radius * 0.3);',
  '}',
  'log(gears[0].radus);',
  '',
].join('\n');
write('pathogen.json', '{}\n');
write('data/gears.json', GEARS);
write('main.pathogen', MAIN);
write('data/big.json', `[${'1,'.repeat(786_432)}1]`); // 1.5 MB

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

function cliPaths(file) {
  const out = execFileSync('npx', ['tsx', 'src/cli.ts', file, '--json'], { encoding: 'utf8' });
  return JSON.parse(out)
    .layers.filter((l) => l.type === 'path' && l.d)
    .map((l) => l.d);
}

// ── A. The extension host's side, as shipped ──────────────────────────────────
const bundled = createRequire(join(ext, 'server', 'node_modules', '_resolve.js'));
const libs = { lib: bundled('pathogen-lang'), node: bundled('pathogen-lang/node') };
const { previewModules } = require(join(ext, 'out', 'preview-modules.js'));
const noBuffers = () => undefined;

const imports = await previewModules(libs, join(project, 'main.pathogen'), MAIN, noBuffers);
const message = JSON.parse(JSON.stringify(imports.message ?? null));
check(
  'A1 a program whose only import is data sends it, as text, and watches it',
  imports.errors.length === 0 &&
    message?.data?.[0]?.[0] === '/data/gears.json' &&
    message.data[0][1].text === GEARS &&
    imports.watched[0] === join(project, 'data', 'gears.json'),
  JSON.stringify({ errors: imports.errors, data: message?.data?.map(([p]) => p), watched: imports.watched }),
);
const limited = await previewModules(
  libs,
  join(project, 'main.pathogen'),
  'import big from "./data/big.json";\n',
  noBuffers,
  1024 * 1024,
);
check(
  "A2 the setting's limit: a file over it is an error in the CLI's words",
  limited.errors[0]?.startsWith(
    'main.pathogen:1:17: error: import file "./data/big.json" is 1.6 MB, more than the 1 MB',
  ),
  JSON.stringify(limited.errors),
);

// ── B. The real webview page, real CSP, bundled scripts ───────────────────────
const TYPES = { '.js': 'text/javascript', '.html': 'text/html' };
const { getWebviewContent } = require(join(ext, 'out', 'webview-html.js'));
let page = '';
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
page = getWebviewContent(
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
  const send = (msg) => tab.evaluate((m) => window.postMessage(m, '*'), msg);
  const previewPaths = () =>
    tab.$$eval('#preview-content path[d]', (els) =>
      els.map((el) => el.getAttribute('d')).filter((d) => d.trim() !== ''),
    );
  const waitStatus = (text) =>
    tab.waitForFunction((t) => document.getElementById('status').textContent === t, { timeout: 15000 }, text);

  await send({
    type: 'update',
    seq: 1,
    uri: 'file:///main.pathogen',
    source: MAIN,
    fontIds: [],
    notices: [],
    errors: [],
    modules: message,
  });
  await waitStatus('Compiled');
  const drawn = await previewPaths();
  const cli = cliPaths(join(project, 'main.pathogen'));
  check(
    'B1 a program that imports data draws what the CLI draws (within 1e-9)',
    drawn.length > 0 && drawn.length === cli.length && drawn.every((d, i) => sameGeometry(d, cli[i])),
    JSON.stringify({ drawn: drawn.length, cli: cli.length }),
  );

  // An unsaved edit to the data file: one gear left.
  const edited = '[{ "name": "only", "x": 100, "y": 50, "radius": 30, "teeth": 5 }]';
  const editedImports = await previewModules(libs, join(project, 'main.pathogen'), MAIN, (p) =>
    p === join(project, 'data', 'gears.json') ? edited : undefined,
  );
  await send({
    type: 'update',
    seq: 2,
    uri: 'file:///main.pathogen',
    source: MAIN,
    fontIds: [],
    notices: [],
    errors: [],
    modules: JSON.parse(JSON.stringify(editedImports.message)),
  });
  await waitStatus('Compiled');
  const redrawn = await previewPaths();
  const stars = redrawn.join(' ').match(/M/g)?.length ?? 0;
  check(
    'B2 an unsaved edit to the data file redraws with its text (one gear: a star and its hub)',
    stars === 2,
    `M count ${stars}`,
  );

  const csp = await tab.evaluate(() => window.__csp);
  check(
    'B3 no CSP violations, no page errors',
    csp.length === 0 && pageErrors.length === 0,
    JSON.stringify({ csp, pageErrors }),
  );
} finally {
  await browser.close();
  server.close();
}

// ── C. The bundled language server over stdio ─────────────────────────────────
const serverScript = join(ext, 'server', 'out', 'server.js');
const child = spawn(process.execPath, [serverScript, '--stdio'], { stdio: ['pipe', 'pipe', 'inherit'] });
let buffer = Buffer.alloc(0);
let nextId = 1;
const pending = new Map();
const diagnostics = new Map();
const waiters = [];
child.stdout.on('data', (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  for (;;) {
    const headerEnd = buffer.indexOf('\r\n\r\n');
    if (headerEnd < 0) return;
    const length = Number(/Content-Length: (\d+)/i.exec(buffer.slice(0, headerEnd).toString())[1]);
    if (buffer.length < headerEnd + 4 + length) return;
    const msg = JSON.parse(buffer.slice(headerEnd + 4, headerEnd + 4 + length).toString());
    buffer = buffer.slice(headerEnd + 4 + length);
    if (msg.id !== undefined && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    } else if (msg.method === 'textDocument/publishDiagnostics') {
      diagnostics.set(msg.params.uri, msg.params.diagnostics);
      for (const w of [...waiters]) w();
    } else if (msg.id !== undefined && msg.method) {
      sendRpc({ jsonrpc: '2.0', id: msg.id, result: null });
    }
  }
});
function sendRpc(m) {
  const body = Buffer.from(JSON.stringify(m));
  child.stdin.write(`Content-Length: ${body.length}\r\n\r\n`);
  child.stdin.write(body);
}
const request = (method, params) =>
  new Promise((resolve) => {
    const id = nextId++;
    pending.set(id, resolve);
    sendRpc({ jsonrpc: '2.0', id, method, params });
  });
const notify = (method, params) => sendRpc({ jsonrpc: '2.0', method, params });
const diagnosticsWhere = (ok, ms = 8000) =>
  new Promise((resolve) => {
    const done = () => {
      if (ok()) {
        waiters.splice(waiters.indexOf(done), 1);
        clearTimeout(timer);
        resolve(true);
      }
    };
    const timer = setTimeout(() => {
      waiters.splice(waiters.indexOf(done), 1);
      resolve(false);
    }, ms);
    waiters.push(done);
    done();
  });
const uri = (path) => pathToFileURL(join(project, ...path.split('/'))).href;
const mainUri = uri('main.pathogen');
const messagesOf = () => (diagnostics.get(mainUri) ?? []).map((d) => d.message);

try {
  await request('initialize', {
    processId: process.pid,
    rootUri: pathToFileURL(project).href,
    capabilities: { textDocument: { completion: { completionItem: { snippetSupport: true } } } },
    initializationOptions: { maxDataSize: null },
  });
  notify('initialized', {});
  notify('textDocument/didOpen', { textDocument: { uri: mainUri, languageId: 'pathogen', version: 1, text: MAIN } });
  check(
    'C1 a misspelled key is a warning with the key it means',
    await diagnosticsWhere(() => messagesOf().includes('data/gears.json has no key radus. Did you mean radius?')),
    JSON.stringify(diagnostics.get(mainUri)),
  );
  const warning = (diagnostics.get(mainUri) ?? []).find((d) => d.message.includes('radus'));
  check('C2 …as a warning (severity 2), not an error', warning?.severity === 2, JSON.stringify(warning));

  const hover = await request('textDocument/hover', {
    textDocument: { uri: mainUri },
    position: { line: 1, character: 8 },
  });
  check(
    'C3 hover on the import says what the file holds',
    hover.result?.contents?.value ===
      '**gears** — *imported data*\n\ndata/gears.json · an array of 2 objects: name, x, y, radius, teeth, Notes (2020)',
    JSON.stringify(hover.result),
  );

  // `gear.` inside the loop: line 6 is `  star(gear.x, …`; complete after `gear.` (character 12).
  const keys = await request('textDocument/completion', {
    textDocument: { uri: mainUri },
    position: { line: 6, character: 12 },
    context: { triggerKind: 2, triggerCharacter: '.' },
  });
  const items = keys.result ?? [];
  const labels = items.map((i) => `${i.label} ${i.detail}`);
  check(
    "C4 completion after a loop variable's dot: the keys and their types",
    JSON.stringify(labels.slice(0, 5)) ===
      JSON.stringify(['name string', 'x number', 'y number', 'radius number', 'teeth number']),
    JSON.stringify(labels),
  );
  const bracket = items.find((i) => i.label === 'Notes (2020)');
  check(
    'C5 a key that needs brackets replaces the dot, with what the client matches typing against',
    bracket?.textEdit?.newText === '["Notes (2020)"]' &&
      bracket.textEdit.range.start.character === 11 &&
      bracket.filterText === '.Notes (2020)',
    JSON.stringify(bracket),
  );

  // Paths: a new line `import more from "./|"`.
  const withImport = MAIN.replace('import gears', 'import more from "./";\nimport gears');
  notify('textDocument/didChange', {
    textDocument: { uri: mainUri, version: 2 },
    contentChanges: [{ text: withImport }],
  });
  await new Promise((r) => setTimeout(r, 600));
  const paths = await request('textDocument/completion', {
    textDocument: { uri: mainUri },
    position: { line: 1, character: 20 },
    context: { triggerKind: 2, triggerCharacter: '/' },
  });
  const pathLabels = (paths.result ?? []).map((i) => `${i.label} ${i.detail}`).sort();
  check(
    "C6 a data import's path is offered the project's data files, not pathogen.json",
    JSON.stringify(pathLabels) === JSON.stringify(['./data/big.json data file', './data/gears.json data file']),
    JSON.stringify(pathLabels),
  );
  notify('textDocument/didChange', { textDocument: { uri: mainUri, version: 3 }, contentChanges: [{ text: MAIN }] });

  // An unsaved edit to the data file: now it has `radus`, so the warning goes.
  notify('pathogen/dataFile', {
    uri: uri('data/gears.json'),
    text: GEARS.replace('"radius": 40', '"radius": 40, "radus": 1'),
  });
  check(
    'C7 an unsaved data edit rechecks the file that imports it (the key now exists)',
    await diagnosticsWhere(() => !messagesOf().some((m) => m.includes('radus'))),
    JSON.stringify(messagesOf()),
  );
  notify('pathogen/dataFile', { uri: uri('data/gears.json'), text: null });
  check(
    'C8 closing it reads the file on disk again (the warning is back)',
    await diagnosticsWhere(() => messagesOf().some((m) => m.includes('radus'))),
    JSON.stringify(messagesOf()),
  );

  // The setting: 1 MB, then a program that imports the 1.5 MB file.
  notify('pathogen/settings', { maxDataSize: 1 });
  notify('textDocument/didChange', {
    textDocument: { uri: mainUri, version: 4 },
    contentChanges: [{ text: 'import big from "./data/big.json";\nlog(big.length);\n' }],
  });
  check(
    'C9 pathogen.maxDataSize 1: the 1.5 MB file stops at its import',
    await diagnosticsWhere(() => messagesOf().some((m) => m.includes('more than the 1 MB a data file can be'))),
    JSON.stringify(messagesOf()),
  );
  notify('pathogen/settings', { maxDataSize: 2 });
  check(
    'C10 raised to 2: it reads',
    await diagnosticsWhere(() => messagesOf().length === 0),
    JSON.stringify(messagesOf()),
  );
} finally {
  child.kill();
  rmSync(project, { recursive: true, force: true });
}

writeFileSync(join(here, 'verify-3a-step4-results.json'), `${JSON.stringify(results, null, 2)}\n`);
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length > 0 ? 1 : 0);
