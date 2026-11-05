/**
 * Phase 1a step 6d: imports in the VS Code preview, as shipped. Requires
 * `npm run build:vscode` first. Drives:
 *   A. the extension host's side (packages/vscode-pathogen/out/preview-modules.js)
 *      with the library from the bundled server/node_modules, as preview.ts
 *      loads it: the document's files, as the plain data postMessage carries;
 *   B. the real webview page (out/webview-html.js) under its real CSP in
 *      headless Chrome, with the bundled compiler/ scripts, fed the `update`
 *      messages the host sends, and compared with the CLI on the same files.
 *
 * Run from the repo root: node project-docs/modules/verify/verify-step6d-preview.mjs
 * Writes verify-step6d-preview-results.json beside this script; exits 1 on a failure.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

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

// ── A project: a module, a program that imports it, a program with a bad import ──
mkdirSync(join(root, 'tmp'), { recursive: true });
const project = mkdtempSync(join(root, 'tmp', 'vscode-preview-modules-'));
mkdirSync(join(project, 'parts'));
writeFileSync(join(project, 'pathogen.json'), '{}\n');
const GEARS = [
  '// parts/gears.pathogen',
  'module;',
  '',
  'export const toothDepth = 6;',
  '',
  'export fn gear(center, radius, teeth) {',
  '  star(center.x, center.y, radius, radius - toothDepth, teeth);',
  '  circle(center.x, center.y, radius * 0.3);',
  '}',
  '',
].join('\n');
const MAIN = [
  'import { gear } from "./parts/gears.pathogen";',
  '',
  'define ViewBox(0, 0, 200, 100);',
  'gear(Point(55, 50), 40, 12);',
  'gear(Point(150, 50), 28, 8);',
  '',
].join('\n');
const BROKEN = 'import { gear } from "./parts/gera.pathogen";\ngear(Point(55, 50), 40, 12);\n';
writeFileSync(join(project, 'parts', 'gears.pathogen'), GEARS);
writeFileSync(join(project, 'main.pathogen'), MAIN);
writeFileSync(join(project, 'broken.pathogen'), BROKEN);

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

/** The CLI on the same file: its path layers' data. */
function cliPaths(file) {
  const out = execFileSync('npx', ['tsx', 'src/cli.ts', file, '--json'], { encoding: 'utf8' });
  return JSON.parse(out)
    .layers.filter((l) => l.type === 'path' && l.d)
    .map((l) => l.d);
}

// ── A. The extension host's side, as shipped ──────────────────────────────────
const bundled = createRequire(join(ext, 'server', 'node_modules', '_resolve.js'));
const libs = { lib: bundled('pathogen-lang'), node: bundled('pathogen-lang/node') };
const { previewModules, MODULE_PREVIEW_NOTICE } = require(join(ext, 'out', 'preview-modules.js'));
const noBuffers = () => undefined;

const mainImports = await previewModules(libs, join(project, 'main.pathogen'), MAIN, noBuffers);
const mainMessage = JSON.parse(JSON.stringify(mainImports.message ?? null));
check(
  "A1 a program's imported files, as plain data postMessage can carry",
  mainImports.errors.length === 0 &&
    mainMessage &&
    Array.isArray(mainMessage.files) &&
    mainMessage.files[0][0] === '/parts/gears.pathogen',
  JSON.stringify({
    errors: mainImports.errors,
    message: mainMessage && { entry: mainMessage.entry, order: mainMessage.order },
  }),
);
const moduleImports = await previewModules(libs, join(project, 'parts', 'gears.pathogen'), GEARS, noBuffers);
check(
  'A2 a module gets the notice saying why its preview is empty',
  JSON.stringify(moduleImports.notices) === JSON.stringify([MODULE_PREVIEW_NOTICE]),
  JSON.stringify(moduleImports.notices),
);
const brokenImports = await previewModules(libs, join(project, 'broken.pathogen'), BROKEN, noBuffers);
check(
  "A3 a missing file is an error in the CLI's words",
  brokenImports.errors.length === 1 &&
    brokenImports.errors[0].startsWith(
      'broken.pathogen:1:22: error: import file "./parts/gera.pathogen" was not found',
    ),
  JSON.stringify(brokenImports.errors),
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
  // Drawn paths: an empty layer is a <path d=""> that draws nothing.
  const previewPaths = () =>
    tab.$$eval('#preview-content path[d]', (els) =>
      els.map((el) => el.getAttribute('d')).filter((d) => d.trim() !== ''),
    );
  const waitStatus = (text) =>
    tab.waitForFunction((t) => document.getElementById('status').textContent === t, { timeout: 15000 }, text);

  // B1 — a program that imports a module draws what the CLI draws.
  await send({
    type: 'update',
    seq: 1,
    uri: 'file:///main.pathogen',
    source: MAIN,
    fontIds: [],
    notices: mainImports.notices,
    errors: mainImports.errors,
    modules: mainMessage,
  });
  await waitStatus('Compiled');
  const drawn = await previewPaths();
  const cli = cliPaths(join(project, 'main.pathogen'));
  check(
    'B1 a program that imports a module draws what the CLI draws (within 1e-9)',
    drawn.length > 0 && drawn.length === cli.length && drawn.every((d, i) => sameGeometry(d, cli[i])),
    JSON.stringify({ drawn, cli }),
  );

  // B2 — a module: empty, with the notice.
  await send({
    type: 'update',
    seq: 2,
    uri: 'file:///parts/gears.pathogen',
    source: GEARS,
    fontIds: [],
    notices: moduleImports.notices,
    errors: moduleImports.errors,
  });
  await waitStatus('Compiled');
  const notice = await tab.$eval('#notices', (el) => (el.hidden ? '' : el.textContent));
  const moduleDrawn = await previewPaths();
  check(
    'B2 a module draws nothing and says why',
    moduleDrawn.length === 0 && notice.includes(MODULE_PREVIEW_NOTICE),
    JSON.stringify({ moduleDrawn, notice }),
  );

  // B3 — a missing file: the error, not a drawing.
  await send({
    type: 'update',
    seq: 3,
    uri: 'file:///broken.pathogen',
    source: BROKEN,
    fontIds: [],
    notices: brokenImports.notices,
    errors: brokenImports.errors,
  });
  await waitStatus('Error');
  const errorText = await tab.$eval('.error', (el) => el.textContent);
  check(
    "B3 a file that can't be loaded shows its error in the preview",
    errorText.includes('was not found'),
    errorText,
  );

  // B4 — an error inside the imported file names it, as the CLI does.
  const badGear = GEARS.replace('star(center.x', 'star(nowhere.x');
  const badImports = await previewModules(libs, join(project, 'main.pathogen'), MAIN, (p) =>
    p === join(project, 'parts', 'gears.pathogen') ? badGear : undefined,
  );
  await send({
    type: 'update',
    seq: 4,
    uri: 'file:///main.pathogen',
    source: MAIN,
    fontIds: [],
    notices: [],
    errors: [],
    modules: JSON.parse(JSON.stringify(badImports.message)),
  });
  await waitStatus('Error');
  const traced = await tab.$eval('.error', (el) => el.textContent);
  check(
    'B4 an unsaved edit in the imported file reaches the preview, and its error names that file',
    traced.includes('parts/gears.pathogen line 7') && traced.includes('called from main.pathogen line 4'),
    traced,
  );

  const csp = await tab.evaluate(() => window.__csp);
  check(
    'B5 no CSP violations, no page errors',
    csp.length === 0 && pageErrors.length === 0,
    JSON.stringify({ csp, pageErrors }),
  );
} finally {
  await browser.close();
  server.close();
  rmSync(project, { recursive: true, force: true });
}

writeFileSync(join(here, 'verify-step6d-preview-results.json'), `${JSON.stringify(results, null, 2)}\n`);
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length > 0 ? 1 : 0);
