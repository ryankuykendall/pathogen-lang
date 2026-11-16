// Is it the JavaScript? Signed in on the dev stack, each action is timed (click → the
// editor shows the file) with a CPU profile of the main thread, whose heaviest functions
// are printed, and the main thread's long tasks. In the headless shell (1x pixels), which
// barely paints: this is how the investigation found the JavaScript fast (README.md).
//
//   npx tsx project-docs/preview-raster-perf/profile-workspace.ts [small|big|<workspace id to copy>]
//
// With a workspace id, its files are read with the local API's admin token (read only)
// and copied into the test user's own workspace, so nothing of the original is touched.
// Profiles are written to tmp/perf-files/<label>.cpuprofile (open them in Chrome's DevTools).

import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

import puppeteer from 'puppeteer';

import type { CDPSession, Page } from 'puppeteer';

const SIZE = process.argv[2] ?? 'small';
const PAGES_URL = 'http://localhost:3000';
const DEV_API = 'http://localhost:8787';
const OUT = 'tmp/perf-files';
const USER_ID = `perf-${randomUUID().slice(0, 8)}`;
const TOKEN = `perf-${randomUUID()}`;
const pause = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
mkdirSync(OUT, { recursive: true });

function d1(sql: string): void {
  execFileSync(
    'npx',
    [
      'wrangler',
      'd1',
      'execute',
      'svg-path-extended-users',
      '--local',
      '--persist-to=../.wrangler/state',
      '--command',
      sql,
    ],
    { cwd: 'api', stdio: ['pipe', 'pipe', 'inherit'] },
  );
}
const api = async (method: string, path: string, body?: unknown): Promise<Response> =>
  fetch(`${DEV_API}${path}`, {
    method,
    headers: { Cookie: `pathogen_session=${TOKEN}`, 'Content-Type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

// A small workspace, or a bigger one: more files, longer texts.
const GEARS =
  'module;\n\nexport fn gear(at, r) {\n  star(at.x, at.y, r, r - 6, 12);\n  circle(at.x, at.y, r * 0.3);\n}\n';
const MAIN =
  'import { gear } from "./parts/gears.pathogen";\ndefine ViewBox(0, 0, 200, 100);\ngear(Point(55, 50), 40);\ngear(Point(150, 50), 28);\n';
const filler = (n: number): string =>
  Array.from({ length: n }, (_, i) => `const value${i} = ${i} * 2; // a line of filler to make the file longer`).join(
    '\n',
  );
const files: Record<string, { text: string }> = {
  'main.pathogen': { text: MAIN },
  'parts/gears.pathogen': { text: GEARS },
  'demos/gears.pathogen': {
    text: 'import { gear } from "../parts/gears.pathogen";\ndefine ViewBox(0, 0, 300, 110);\nfor (i in 0..2) {\n  gear(Point(50 + i * 100, 50), 34);\n}\n',
  },
};
if (SIZE === 'big') {
  for (let i = 0; i < 12; i++) {
    files[`shapes/shape-${i}.pathogen`] = {
      text: `module;\n\n${filler(300)}\n\nexport fn shape${i}(at) { circle(at.x, at.y, ${i + 2}); }\n`,
    };
  }
  files['main.pathogen'] = { text: `${MAIN}\n${filler(400)}\n` };
}
let folders: string[] = [];
let entryPoints = ['main.pathogen', 'demos/gears.pathogen'];
const COPY = SIZE !== 'small' && SIZE !== 'big';
if (COPY) {
  const token = /^ADMIN_TOKEN=(.*)$/m.exec(readFileSync('api/.dev.vars', 'utf8'))?.[1]?.trim() ?? '';
  const res = await fetch(`${DEV_API}/workspace/${encodeURIComponent(SIZE)}?token=${encodeURIComponent(token)}`);
  if (!res.ok) throw new Error(`reading ${SIZE}: ${res.status} ${await res.text()}`);
  const source = (await res.json()) as {
    files: Record<string, { text: string }>;
    folders: string[];
    entryPoints: string[];
  };
  for (const key of Object.keys(files)) delete files[key];
  for (const [path, { text }] of Object.entries(source.files)) files[path] = { text };
  folders = source.folders;
  entryPoints = source.entryPoints;
  console.log(`copied ${Object.keys(files).length} files, entry points ${JSON.stringify(entryPoints)}`);
}

const DEEP = `
  window.__deep = (sel, root = document) => {
    const found = root.querySelector(sel);
    if (found) return found;
    for (const el of root.querySelectorAll('*')) {
      if (el.shadowRoot) { const f = window.__deep(sel, el.shadowRoot); if (f) return f; }
    }
    return null;
  };`;
const ev = async <T>(page: Page, src: string): Promise<T> => (await page.evaluate(`(() => { ${DEEP} ${src} })()`)) as T;

/** Long tasks on the main thread, recorded from the page's start. */
const LONG_TASKS = `
  window.__long = [];
  new PerformanceObserver((list) => { for (const e of list.getEntries()) window.__long.push([Math.round(e.startTime), Math.round(e.duration)]); })
    .observe({ type: 'longtask', buffered: true });`;

interface ProfileNode {
  id: number;
  callFrame: { functionName: string; url: string; lineNumber: number };
  children?: number[];
}

/** Self and total time per function from a CPU profile, the heaviest first. */
function summarize(profile: { nodes: ProfileNode[]; samples: number[]; timeDeltas: number[] }): string {
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const self = new Map<number, number>();
  profile.samples.forEach((id, i) => self.set(id, (self.get(id) ?? 0) + (profile.timeDeltas[i] ?? 0) / 1000));
  const parent = new Map<number, number>();
  for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
  const key = (n: ProfileNode): string => {
    const url = n.callFrame.url.replace(/^https?:\/\/localhost:\d+/, '');
    return `${n.callFrame.functionName || '(anonymous)'} ${url}:${n.callFrame.lineNumber + 1}`;
  };
  const selfBy = new Map<string, number>();
  const totalBy = new Map<string, number>();
  for (const [id, ms] of self) {
    const node = byId.get(id)!;
    selfBy.set(key(node), (selfBy.get(key(node)) ?? 0) + ms);
    // Inclusive: every distinct function on the stack gets the sample once.
    const seen = new Set<string>();
    for (let at: number | undefined = id; at !== undefined; at = parent.get(at)) {
      const k = key(byId.get(at)!);
      if (seen.has(k)) continue;
      seen.add(k);
      totalBy.set(k, (totalBy.get(k) ?? 0) + ms);
    }
  }
  const top = (m: Map<string, number>, n: number): string =>
    [...m]
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([k, ms]) => `    ${ms.toFixed(0).padStart(6)} ms  ${k}`)
      .join('\n');
  return `  self:\n${top(selfBy, 18)}\n  total:\n${top(totalBy, 30)}`;
}

async function measure(page: Page, client: CDPSession, label: string, act: string, doneWhen: string): Promise<void> {
  await pause(1500);
  await client.send('Profiler.start');
  const t0 = (await page.evaluate('performance.now()')) as number;
  await ev(page, act);
  let shown = -1;
  const start = Date.now();
  while (Date.now() - start < 20_000) {
    if (await ev<boolean>(page, doneWhen)) {
      shown = ((await page.evaluate('performance.now()')) as number) - t0;
      break;
    }
    await pause(20);
  }
  await pause(3000);
  const { profile } = (await client.send('Profiler.stop')) as { profile: Parameters<typeof summarize>[0] };
  writeFileSync(`${OUT}/${label}.cpuprofile`, JSON.stringify(profile));
  const long = (await page.evaluate(`window.__long.filter(([s]) => s >= ${t0})`)) as [number, number][];
  const busy = long.reduce((sum, [, d]) => sum + d, 0);
  console.log(
    `\n== ${label}: shown after ${shown.toFixed(0)} ms; long tasks ${long.length}, ${busy} ms in all: ${JSON.stringify(long.map(([s, d]) => [Math.round(s - t0), d]))}`,
  );
  console.log(summarize(profile));
}

const now = Date.now();
d1(
  `INSERT INTO users (id, email, email_lower, handle, display_name, created_at, verified_at) VALUES ('${USER_ID}', '${USER_ID}@example.invalid', '${USER_ID}@example.invalid', '${USER_ID}', 'Perf', ${now}, ${now}); ` +
    `INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES ('${TOKEN}', '${USER_ID}', ${now}, ${now + 3_600_000});`,
);
const browser = await puppeteer.launch({ headless: 'shell' });
let id = '';
try {
  const created = (await (
    await api('POST', '/workspace', { name: COPY ? 'Perf copy' : `Perf ${SIZE}`, files, folders, entryPoints })
  ).json()) as { id: string; slug: string };
  id = created.id;
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });
  page.on('pageerror', (e) => console.log('PAGE ERROR', e.message));
  await page.setCookie({ name: 'pathogen_session', value: TOKEN, domain: 'localhost', path: '/' });
  await page.evaluateOnNewDocument(LONG_TASKS);
  await page.goto(`${PAGES_URL}/workspace/${created.slug}--${created.id}`, { waitUntil: 'domcontentloaded' });
  for (let i = 0; i < 100; i++) {
    if (await ev<boolean>(page, `return !!__deep('code-editor-pane')?.code && !!__deep('file-tree');`)) break;
    await pause(150);
  }
  await pause(4000);
  const client = await page.createCDPSession();
  await client.send('Profiler.enable');
  await client.send('Profiler.setSamplingInterval', { interval: 250 });

  // pathogen.json isn't among the files sent: its text is the playground's own, a JSON object.
  const code = (path: string): string =>
    files[path]
      ? `return __deep('code-editor-pane').code === ${JSON.stringify(files[path].text)};`
      : `return __deep('code-editor-pane').code.trimStart().startsWith('{');`;
  const first = (await ev<string>(page, `return __deep('editor-tabs').active;`)) ?? entryPoints[0];
  const other = Object.keys(files).find((p) => p !== first) ?? 'pathogen.json';
  const label = SIZE.replace(/[^a-z0-9]/gi, '').slice(0, 12);
  const tabSel = (path: string): string => `[data-path=${JSON.stringify(path)}] .label`;

  await measure(
    page,
    client,
    `${label}-tree-open`,
    `__deep('file-tree').shadowRoot.querySelector('[data-path=${JSON.stringify(other)}]').click();`,
    code(other),
  );
  await measure(
    page,
    client,
    `${label}-tab-switch`,
    `__deep('editor-tabs').shadowRoot.querySelector(${JSON.stringify(tabSel(first))}).click();`,
    code(first),
  );
  await measure(
    page,
    client,
    `${label}-files-off`,
    `__deep('#files-toggle').click();`,
    `return !__deep('file-tree').classList.contains('open');`,
  );
  await measure(
    page,
    client,
    `${label}-files-on`,
    `__deep('#files-toggle').click();`,
    `return __deep('file-tree').classList.contains('open');`,
  );
} finally {
  if (id) await api('DELETE', `/workspace/${id}`);
  d1(`DELETE FROM sessions WHERE user_id = '${USER_ID}'; DELETE FROM users WHERE id = '${USER_ID}';`);
  await Promise.race([browser.close(), pause(10_000)]);
  process.exit(0);
}
