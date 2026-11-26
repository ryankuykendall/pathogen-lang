// Phase 3a, step 9 (note 76: "One program through the CLI, VS Code and the
// playground, outputs compared"; note 86). Each surface through the code it
// ships:
// - CLI: the built `node dist/cli.js main.pathogen --json` (the package's bin);
// - VS Code: the extension's out/preview-modules.js with its bundled library
//   reads the project from disk, and the real webview page (out/webview-html.js,
//   under its real CSP, with the bundled compiler) draws it;
// - playground: the real dev playground (dev:stack), signed in, a saved
//   workspace holding the same files; the owner's load leaves data/pad.json
//   deferred (past the 2 MB of data an answer carries), so it's read by hash.
//
// The program touches every rule of docs/data-import.md: a module that
// imports data, the same data file imported by two files (one value), a copy
// changed while the file's objects stay fixed, GeoJSON read as JSON, keys in
// the file's order ("2" stays second), a bracket key, `length` with
// brackets, an angle given its unit, a missing key, and two large files. The
// drawings are compared path by path within 1e-9. Then one JSON mistake, the
// same words on every surface.
//
//   npm run build; npm run build:vscode; npm run build:playground:dev (dev:stack running)
//   npx tsx project-docs/modules/verify/verify-3a-step9-surfaces.ts

import { execFileSync, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { extname, join } from 'node:path';

import puppeteer from 'puppeteer';

import type { Page } from 'puppeteer';

const ROOT = process.cwd();
const EXT = join(ROOT, 'packages', 'vscode-pathogen');
const PAGES_URL = 'http://localhost:3000';
const DEV_API = 'http://localhost:8787';
const WORK = join(ROOT, 'tmp', 'phase3', 'step9');
const SHOTS = 'project-docs/modules/verify/3a-step9';
const RESULTS = 'project-docs/modules/verify/verify-3a-step9-surfaces-results.json';
const MB = 1024 * 1024;
const pause = async (ms: number): Promise<void> => {
  await new Promise((r) => setTimeout(r, ms));
};

const results: { check: string; ok: boolean; detail?: unknown }[] = [];
let failures = 0;
const check = (label: string, ok: boolean, detail?: unknown): void => {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${label}${ok ? '' : ` ${JSON.stringify(detail)?.slice(0, 1200)}`}`);
  results.push({ check: label, ok, ...(ok ? {} : { detail }) });
  if (!ok) failures++;
};

// ── The project ───────────────────────────────────────────────────────────────
const MAIN = [
  '// main.pathogen',
  'import { drawGears, toothDepth } from "./parts/gears.pathogen";',
  'import gears from "./data/gears.json";',
  'import places from "./data/places.geojson";',
  'import order from "./data/order.json";',
  'import beam from "./data/beam.json";',
  'import big from "./data/big.json";',
  'import pad from "./data/pad.json";',
  '',
  'define ViewBox(0, 0, 240, 160);',
  '',
  '// The module draws from the same gears.json this file imports.',
  'drawGears();',
  '',
  "// A copy can change; the file's objects can't.",
  'let myGears = gears.map {|gear| return { ...gear }; };',
  'myGears[1]["teeth"] = 16;',
  'star(205, 120, 14, 14 - toothDepth, myGears[1].teeth);',
  '',
  '// GeoJSON: longitude and latitude in degrees, scaled to the ViewBox, y flipped.',
  'for (feature in places.features) {',
  '  let lon = feature.geometry.coordinates[0];',
  '  let lat = feature.geometry.coordinates[1];',
  '  circle((lon + 180) / 360 * 240, 160 - (lat + 90) / 180 * 160, feature.properties["Population (2020)"] / 1000000);',
  '}',
  '',
  "// Keys in the file's order: b, 2, a.",
  'let x = 10;',
  'for ([key, size] in order) {',
  '  rect(x, 150 - size, size, size);',
  '  x = x + size + 4;',
  '}',
  '',
  '// length takes brackets; an angle needs its unit; a missing key reads null.',
  'let tipX = 110 + beam["length"] * cos(beam.angle * 1deg);',
  'let tipY = 150 - beam["length"] * sin(beam.angle * 1deg);',
  'M 110 150 L tipX tipY',
  'if (beam.width == null) {',
  '  circle(tipX, tipY, 2);',
  '}',
  '',
  '// Two large files: in the playground, one of them comes by its hash.',
  'circle(225, 15, big.r);',
  'circle(225, 40, pad.r);',
  '',
].join('\n');
const GEARS_MODULE = [
  '// parts/gears.pathogen',
  'module;',
  '',
  'import gears from "../data/gears.json";',
  '',
  'export const toothDepth = 6;',
  '',
  'export fn drawGears() {',
  '  for (gear in gears) {',
  '    star(gear.x, gear.y, gear.radius, gear.radius - toothDepth, gear.teeth);',
  '    circle(gear.x, gear.y, gear.radius * 0.3);',
  '  }',
  '}',
  '',
].join('\n');
const GEARS_JSON =
  '[\n  { "name": "drive", "x": 55, "y": 50, "radius": 40, "teeth": 12 },\n  { "name": "idler", "x": 150, "y": 50, "radius": 28, "teeth": 8 }\n]\n';
const PLACES = `${JSON.stringify(
  {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { name: 'Lisbon', 'Population (2020)': 2_900_000 },
        geometry: { type: 'Point', coordinates: [-9.14, 38.72] },
      },
      {
        type: 'Feature',
        properties: { name: 'Osaka', 'Population (2020)': 2_700_000 },
        geometry: { type: 'Point', coordinates: [135.5, 34.69] },
      },
    ],
  },
  null,
  2,
)}\n`;
// JSON.parse would put "2" first; the file's order is b, 2, a.
const ORDER = '{\n  "b": 6,\n  "2": 10,\n  "a": 14\n}\n';
const ORDER_BROKEN = '{\n  "b": 6,\n  "2": 10\n  "a": 14\n}\n';
const BEAM = '{\n  "length": 40,\n  "angle": 30\n}\n';
const dataFile = (r: number, bytes: number): string => {
  const line = `    "${'x'.repeat(92)}",\n`;
  const lines = Math.floor((bytes - 40) / line.length);
  return `{\n  "r": ${r},\n  "pad": [\n${line.repeat(lines)}    "end"\n  ]\n}\n`;
};
const TEXTS: Record<string, string> = {
  'main.pathogen': MAIN,
  'parts/gears.pathogen': GEARS_MODULE,
  'data/gears.json': GEARS_JSON,
  'data/places.geojson': PLACES,
  'data/order.json': ORDER,
  'data/beam.json': BEAM,
  'data/big.json': dataFile(8, Math.floor(1.5 * MB)),
  'data/pad.json': dataFile(5, 1 * MB),
};

function writeProject(dir: string, texts: Record<string, string>): void {
  rmSync(dir, { recursive: true, force: true });
  for (const [path, text] of Object.entries(texts)) {
    mkdirSync(join(dir, ...path.split('/').slice(0, -1)), { recursive: true });
    writeFileSync(join(dir, ...path.split('/')), text);
  }
  writeFileSync(join(dir, 'pathogen.json'), '{\n  "entryPoints": ["main.pathogen"]\n}\n');
}
const PROJECT = join(WORK, 'project');
const BROKEN = join(WORK, 'broken');
writeProject(PROJECT, TEXTS);
writeProject(BROKEN, { ...TEXTS, 'data/order.json': ORDER_BROKEN });
mkdirSync(SHOTS, { recursive: true });

const NUM = /-?\d+(?:\.\d+)?(?:e[-+]?\d+)?/gi;
function sameGeometry(a: string, b: string): boolean {
  if (a.replace(NUM, '#').replace(/\s+/g, ' ').trim() !== b.replace(NUM, '#').replace(/\s+/g, ' ').trim()) return false;
  const na = a.match(NUM) ?? [];
  const nb = b.match(NUM) ?? [];
  return (
    na.length === nb.length &&
    na.every((v, i) => Math.abs(Number(v) - Number(nb[i])) <= 1e-9 * Math.max(1, Math.abs(Number(v))))
  );
}
/** Where two lists of paths first differ, for a failure's detail. */
function firstDifference(a: string[], b: string[]): unknown {
  if (a.length !== b.length) return { counts: [a.length, b.length] };
  const i = a.findIndex((d, k) => !sameGeometry(d, b[k]));
  return i < 0 ? null : { path: i, a: a[i].slice(0, 300), b: b[i].slice(0, 300) };
}

// ── 1. The CLI, as built ──────────────────────────────────────────────────────
const cliRun = spawnSync('node', [join(ROOT, 'dist', 'cli.js'), join(PROJECT, 'main.pathogen'), '--json'], {
  encoding: 'utf8',
  maxBuffer: 64 * MB,
});
const cliJson = JSON.parse(cliRun.stdout || '{}') as { layers?: { type?: string; d?: string }[]; warnings?: unknown[] };
const cli = (cliJson.layers ?? []).filter((l) => l.type === 'path' && l.d).map((l) => l.d!);
check('CLI: compiles the program with its module and six data files, no warnings', cliRun.status === 0 && cli.length > 0 && (cliJson.warnings ?? []).length === 0, {
  status: cliRun.status,
  stderr: cliRun.stderr.slice(0, 600),
  warnings: cliJson.warnings,
});
const all = cli.join(' ');
// The keys in the file's order: rect(10, 144, 6, 6), then rect(20, 140, 10, 10), then
// rect(34, 136, 14, 14). A rect is `M x y l w 0 l 0 h l -w 0 z`.
const rects = [...all.matchAll(/M (\d+) (\d+) l (\d+) 0 l 0 \3 l -\3 0 z/g)].map((m) => [Number(m[1]), Number(m[3])]);
check(
  "CLI: the object's keys come in the file's order (b, 2, a), not JSON.parse's",
  JSON.stringify(rects) === JSON.stringify([[10, 6], [20, 10], [34, 14]]),
  rects,
);
const cliSvg = spawnSync(
  'node',
  [join(ROOT, 'dist', 'cli.js'), join(PROJECT, 'main.pathogen'), `--output-svg-file=${join(SHOTS, 'cli.svg')}`, `--png=${join(SHOTS, 'cli.png')}`],
  { encoding: 'utf8' },
);
check('CLI: writes the SVG and its PNG', cliSvg.status === 0, cliSvg.stderr.slice(0, 600));

const cliBroken = spawnSync('node', [join(ROOT, 'dist', 'cli.js'), join(BROKEN, 'main.pathogen')], { encoding: 'utf8' });
const brokenLines = cliBroken.stderr.split('\n').map((l) => l.trim()).filter(Boolean);
const JSON_MISTAKE = brokenLines.find((l) => l.includes('data/order.json line')) ?? '';
const IMPORTED_FROM = brokenLines.find((l) => l.startsWith('imported from')) ?? '';
check('CLI: a JSON mistake names the data file, its line and column, and the import that read it', cliBroken.status !== 0 && JSON_MISTAKE !== '' && IMPORTED_FROM === 'imported from main.pathogen line 5', cliBroken.stderr);
// The words the other surfaces must use: from "data/order.json line …" on.
const MISTAKE_WORDS = JSON_MISTAKE.slice(JSON_MISTAKE.indexOf('data/order.json line'));
console.log(`      the CLI's words: ${MISTAKE_WORDS} / ${IMPORTED_FROM}`);

// ── 2. VS Code: the extension host's side, as shipped ─────────────────────────
const bundled = createRequire(join(EXT, 'server', 'node_modules', '_resolve.js'));
const libs = { lib: bundled('pathogen-lang'), node: bundled('pathogen-lang/node') };
const extRequire = createRequire(join(EXT, 'out', '_resolve.js'));
const { previewModules } = extRequire(join(EXT, 'out', 'preview-modules.js')) as {
  previewModules: (
    libs: unknown,
    file: string,
    source: string,
    unsaved: (path: string) => string | undefined,
  ) => Promise<{ message?: unknown; errors: string[]; watched: string[] }>;
};
const noUnsaved = (): undefined => undefined;
const hostSide = await previewModules(libs, join(PROJECT, 'main.pathogen'), MAIN, noUnsaved);
const modules = JSON.parse(JSON.stringify(hostSide.message ?? null)) as { data?: [string, { text: string }][] } | null;
check(
  'VS Code host: the six data files go to the page as text, each read from disk',
  hostSide.errors.length === 0 &&
    (modules?.data ?? []).length === 6 &&
    (modules?.data ?? []).every(([p, f]) => f.text === TEXTS[p.slice(1)]),
  { errors: hostSide.errors, data: modules?.data?.map(([p]) => p) },
);
const hostBroken = await previewModules(libs, join(BROKEN, 'main.pathogen'), MAIN, noUnsaved);
const vscodeError = hostBroken.errors.join('\n');
check(
  "VS Code host: the JSON mistake, in the CLI's words",
  vscodeError.includes(MISTAKE_WORDS) && vscodeError.includes(IMPORTED_FROM),
  hostBroken.errors,
);

// ── 3. The real webview page, real CSP, bundled scripts ───────────────────────
const TYPES: Record<string, string> = { '.js': 'text/javascript', '.html': 'text/html' };
const { getWebviewContent } = extRequire(join(EXT, 'out', 'webview-html.js')) as {
  getWebviewContent: (compiler: string, panZoom: string, base: string, nonce: string) => string;
};
let webviewHtml = '';
const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  if (url.pathname === '/') {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(webviewHtml);
    return;
  }
  try {
    const body = readFileSync(join(EXT, url.pathname));
    res.writeHead(200, { 'content-type': TYPES[extname(url.pathname)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
const address = server.address();
const base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
webviewHtml = getWebviewContent(`${base}/compiler/index.global.js`, `${base}/compiler/pan-zoom.global.js`, base, 'verifynonce');

const d1 = (sql: string): string =>
  execFileSync(
    'npx',
    ['wrangler', 'd1', 'execute', 'svg-path-extended-users', '--local', '--persist-to=../.wrangler/state', '--command', sql, '--json'],
    { cwd: 'api', stdio: ['pipe', 'pipe', 'inherit'] },
  ).toString();
const tag = randomUUID().slice(0, 8);
const OWNER = { id: `v3a9-${tag}`, token: `v3a9-${randomUUID()}`, handle: `v3a9${tag}` };
async function api(method: string, path: string, body?: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(`${DEV_API}${path}`, {
    method,
    headers: { Cookie: `pathogen_session=${OWNER.token}`, 'Content-Type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, ...((await res.json().catch(() => ({}))) as Record<string, unknown>) };
}

const FIND = `
  window.__deep = (sel, root = document) => {
    const found = root.querySelector(sel);
    if (found) return found;
    for (const el of root.querySelectorAll('*')) {
      if (el.shadowRoot) { const f = window.__deep(sel, el.shadowRoot); if (f) return f; }
    }
    return null;
  };`;
const ev = async <T>(page: Page, src: string): Promise<T> => (await page.evaluate(`(async () => { ${FIND} ${src} })()`)) as T;
async function until<T>(page: Page, src: string, ms = 60_000): Promise<T | null> {
  const start = Date.now();
  while (Date.now() - start < ms) {
    const value = await ev<T | null>(page, src).catch(() => null);
    if (value) return value;
    await pause(250);
  }
  return null;
}
const PREVIEW_PATHS = `
  const pane = __deep('svg-preview-pane');
  const doc = pane?.shadowRoot?.querySelector('#preview-frame')?.contentDocument;
  const layers = doc?.getElementById('preview-layers');
  if (!layers) return null;
  return [...layers.querySelectorAll('path[d]')].map((p) => p.getAttribute('d')).filter((d) => d.trim() !== '');`;
const PANEL_TEXT = `
  const view = __deep('workspace-view');
  const panel = view?.shadowRoot?.querySelector('error-panel');
  if (!panel || !panel.classList.contains('visible')) return '';
  return [...panel.shadowRoot.children]
    .filter((n) => n.tagName !== 'STYLE')
    .map((n) => n.innerText || n.textContent)
    .join('\\n')
    .replace(/[ \\t]+/g, ' ')
    .trim();`;

const made: string[] = [];
const browser = await puppeteer.launch({ headless: 'shell', args: ['--window-size=1400,900'] });
try {
  // 3a. VS Code's page draws it.
  const tab = await browser.newPage();
  await tab.setViewport({ width: 900, height: 600 });
  const webviewErrors: string[] = [];
  tab.on('pageerror', (e) => webviewErrors.push(String(e.message)));
  // Page-side code as strings: tsx would add its own helpers to a function passed to the page.
  await tab.evaluateOnNewDocument(`
    window.__posted = [];
    window.__csp = [];
    window.acquireVsCodeApi = function () {
      return { postMessage: function (m) { window.__posted.push(m); }, getState: function () {}, setState: function () {} };
    };
    document.addEventListener('securitypolicyviolation', function (e) { window.__csp.push(e.violatedDirective + ' ' + e.blockedURI); });
  `);
  await tab.goto(base, { waitUntil: 'load' });
  await tab.waitForFunction(`window.__posted.some(function (m) { return m.type === 'ready'; })`, { timeout: 10_000 });
  const update = { type: 'update', seq: 1, uri: 'file:///main.pathogen', source: MAIN, fontIds: [], notices: [], errors: [], modules };
  await tab.evaluate(`window.postMessage(${JSON.stringify(update)}, '*')`);
  await tab.waitForFunction(`(document.getElementById('status') || {}).textContent === 'Compiled'`, { timeout: 20_000 });
  const vscode = (await tab.evaluate(
    `[...document.querySelectorAll('#preview-content path[d]')].map(function (el) { return el.getAttribute('d') || ''; }).filter(function (d) { return d.trim() !== ''; })`,
  )) as string[];
  check(
    'VS Code page: draws what the CLI draws, path by path (within 1e-9)',
    vscode.length === cli.length && vscode.every((d, i) => sameGeometry(d, cli[i])),
    firstDifference(vscode, cli),
  );
  await tab.screenshot({ path: `${SHOTS}/vscode-preview.png` });
  const csp = (await tab.evaluate('window.__csp')) as string[];
  check('VS Code page: no CSP violations, no page errors', csp.length === 0 && webviewErrors.length === 0, { csp, webviewErrors });
  await tab.close();

  // 3b. The playground, signed in, a saved workspace with the same files.
  const now = Date.now();
  d1(
    `INSERT INTO users (id, email, email_lower, handle, display_name, created_at, verified_at) VALUES ('${OWNER.id}', '${OWNER.id}@example.invalid', '${OWNER.id}@example.invalid', '${OWNER.handle}', 'Verify 3a 9', ${now}, ${now}); ` +
      `INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES ('${OWNER.token}', '${OWNER.id}', ${now}, ${now + 3_600_000});`,
  );
  const createFrom = async (name: string, texts: Record<string, string>): Promise<string> => {
    const created = await api('POST', '/workspace', {
      name,
      files: Object.fromEntries(Object.entries(texts).map(([p, text]) => [p, { text }])),
      entryPoints: ['main.pathogen'],
    });
    if (typeof created.id !== 'string') throw new Error(`create failed: ${JSON.stringify(created).slice(0, 400)}`);
    made.push(created.id);
    return `${created.slug as string}--${created.id}`;
  };
  const slugId = await createFrom(`Three surfaces ${tag}`, TEXTS);
  const loaded = (await api('GET', `/workspace/${slugId.split('--').pop()}`)) as { files?: Record<string, { deferred?: boolean }> };
  check(
    "playground: the owner's load leaves data/pad.json deferred (past the answer's 2 MB of data)",
    loaded.files?.['data/pad.json']?.deferred === true,
    loaded.files && Object.fromEntries(Object.entries(loaded.files).map(([p, f]) => [p, f.deferred ? 'deferred' : 'text'])),
  );

  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });
  page.on('dialog', (d) => void d.accept());
  const pageErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  await page.setCookie({ name: 'pathogen_session', value: OWNER.token, domain: 'localhost', path: '/' });
  await page.evaluateOnNewDocument(`localStorage.setItem('pathogen-theme', 'light');`);
  await page.goto(`${PAGES_URL}/workspace/${slugId}`, { waitUntil: 'domcontentloaded' });
  const playground =
    (await until<string[]>(
      page,
      `const ds = (() => { ${PREVIEW_PATHS} })(); return ds && ds.length === ${cli.length} ? ds : null;`,
      90_000,
    )) ?? (await ev<string[] | null>(page, PREVIEW_PATHS)) ?? [];
  check(
    'playground: draws what the CLI draws, path by path (within 1e-9)',
    playground.length === cli.length && playground.every((d, i) => sameGeometry(d, cli[i])),
    firstDifference(playground, cli),
  );
  check('playground: no error panel', (await ev<string>(page, PANEL_TEXT)) === '', await ev<string>(page, PANEL_TEXT));
  await pause(800);
  await page.screenshot({ path: `${SHOTS}/playground.png` });

  // 3c. The same JSON mistake in a workspace: the error panel's words.
  const brokenSlug = await createFrom(`Three surfaces broken ${tag}`, { ...TEXTS, 'data/order.json': ORDER_BROKEN });
  await page.goto(`${PAGES_URL}/workspace/${brokenSlug}`, { waitUntil: 'domcontentloaded' });
  const panel = (await until<string>(page, `const t = (() => { ${PANEL_TEXT} })(); return t.includes('order.json') ? t : null;`, 90_000)) ?? '';
  const mistakeSentence = MISTAKE_WORDS.slice(MISTAKE_WORDS.indexOf(':') + 1).trim();
  check(
    "playground: the JSON mistake in the error panel, in the CLI's words",
    panel.includes(mistakeSentence) && /line \d+/.test(panel) && panel.includes('imported from main.pathogen line 5'),
    { panel, expected: [MISTAKE_WORDS, IMPORTED_FROM] },
  );
  // beam.width is a key no item has: the editor's warning, an underline, never one of the panel's errors.
  check(
    "playground: the panel holds that error alone; the data key's warning isn't listed as one",
    // One error: no count badge (two showed "2 errors" before the fix).
    !panel.includes('has no key') && !/\d+ errors/.test(panel),
    panel,
  );
  await page.screenshot({ path: `${SHOTS}/playground-json-mistake.png` });
  check('playground: no page errors', pageErrors.length === 0, pageErrors);
} finally {
  for (const id of made) await api('DELETE', `/workspace/${id}`).catch(() => undefined);
  await browser.close();
  server.close();
}

writeFileSync(RESULTS, `${JSON.stringify({ when: new Date().toISOString(), results }, null, 2)}\n`);
console.log(`\n${results.length - failures}/${results.length} passed`);
process.exit(failures === 0 ? 0 : 1);
