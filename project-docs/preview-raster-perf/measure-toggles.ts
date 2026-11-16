// Every action that changes what's around the preview, frame by frame, under a candidate
// fix tried in the page (no code changed). Full Chrome, 2x pixels, signed in on the dev stack.
// The README in this folder has the numbers it gave on 2026-11-15.
//
//   npx tsx project-docs/preview-raster-perf/measure-toggles.ts <source> <fix>
//
// source: heavy (heavy-filters.pathogen, here), or a workspace id on the dev stack, whose
//         files are read with the local API's admin token (read only) and copied into the
//         test user's own workspace, so nothing of the original is touched.
// fix:    built | nolayer | still | keep (combine with commas)
//   built    as built (since 2026-11-15 the preview's iframe has its own layer)
//   nolayer  the iframe without its own layer, as before (will-change: auto)
//   still    the panes don't animate their widths
//   keep     the preview keeps its width: the tree, console and inspector take their room
//            from the editor (and nothing animates the preview)

import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

import puppeteer from 'puppeteer';

import type { Page } from 'puppeteer';

const SOURCE = process.argv[2] ?? 'heavy';
const FIXES = new Set((process.argv[3] ?? 'built').split(',').filter((f) => f !== 'built'));
const PAGES_URL = 'http://localhost:3000';
const DEV_API = 'http://localhost:8787';
const USER_ID = `perf-${randomUUID().slice(0, 8)}`;
const TOKEN = `perf-${randomUUID()}`;
const pause = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

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
const FRAMES = `
  window.__frames = [];
  const tick = (t) => { window.__frames.push(t); requestAnimationFrame(tick); };
  requestAnimationFrame(tick);`;

/** Act, then watch frames until they flow again with none over 50 ms for 1.5 s (12 s at most). */
async function frames(page: Page, label: string, act: string): Promise<void> {
  await pause(1500);
  const t0 = (await ev<number>(page, `${act}; return performance.now();`)) as number;
  const start = Date.now();
  let after: number[] = [];
  while (Date.now() - start < 12_000) {
    await pause(500);
    after = (await page.evaluate(`window.__frames.filter((t) => t >= ${t0})`)) as number[];
    const now = (await page.evaluate('performance.now()')) as number;
    const lastSlow = after.reduce((at, t, i) => (t - (i === 0 ? t0 : after[i - 1]) > 50 ? t : at), t0);
    // A frame still being drawn has no time yet, so the gap since the last one counts as busy.
    const lastFrame = after[after.length - 1] ?? t0;
    if (now - lastFrame < 100 && now - lastSlow > 1500) break;
  }
  const gaps = after.map((t, i) => Math.round(t - (i === 0 ? t0 : after[i - 1])));
  const slow = gaps.filter((g) => g > 50);
  let settled = 0;
  for (let i = 0; i < gaps.length; i++) if (gaps[i] > 50) settled = Math.round(after[i] - t0);
  console.log(
    `${label.padEnd(24)} slow frames ${String(slow.length).padStart(2)}  longest ${String(Math.max(0, ...slow)).padStart(5)} ms  busy ${String(settled).padStart(5)} ms`,
  );
}

let source: { files: Record<string, { text: string }>; folders: string[]; entryPoints: string[] };
if (SOURCE === 'heavy') {
  source = {
    files: {
      'main.pathogen': { text: readFileSync('project-docs/preview-raster-perf/heavy-filters.pathogen', 'utf8') },
    },
    folders: [],
    entryPoints: ['main.pathogen'],
  };
} else {
  const token = /^ADMIN_TOKEN=(.*)$/m.exec(readFileSync('api/.dev.vars', 'utf8'))?.[1]?.trim() ?? '';
  const res = await fetch(`${DEV_API}/workspace/${encodeURIComponent(SOURCE)}?token=${encodeURIComponent(token)}`);
  if (!res.ok) throw new Error(`reading ${SOURCE}: ${res.status}`);
  source = (await res.json()) as typeof source;
}

const now = Date.now();
d1(
  `INSERT INTO users (id, email, email_lower, handle, display_name, created_at, verified_at) VALUES ('${USER_ID}', '${USER_ID}@example.invalid', '${USER_ID}@example.invalid', '${USER_ID}', 'Perf', ${now}, ${now}); ` +
    `INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES ('${TOKEN}', '${USER_ID}', ${now}, ${now + 3_600_000});`,
);
const browser = await puppeteer.launch({ headless: true, args: ['--window-size=1440,900'] });
let id = '';
try {
  const created = (await (
    await api('POST', '/workspace', {
      name: 'Perf toggles',
      files: Object.fromEntries(Object.entries(source.files).map(([p, f]) => [p, { text: f.text }])),
      folders: source.folders,
      entryPoints: source.entryPoints,
    })
  ).json()) as { id: string; slug: string };
  id = created.id;
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
  page.on('pageerror', (e) => console.log('PAGE ERROR', e.message));
  await page.setCookie({ name: 'pathogen_session', value: TOKEN, domain: 'localhost', path: '/' });
  await page.evaluateOnNewDocument(FRAMES);
  await page.goto(`${PAGES_URL}/workspace/${created.slug}--${created.id}`, { waitUntil: 'domcontentloaded' });
  for (let i = 0; i < 100; i++) {
    if (await ev<boolean>(page, `return !!__deep('code-editor-pane')?.code && !!__deep('file-tree');`)) break;
    await pause(150);
  }
  await pause(6000);

  const inject = async (host: string, css: string): Promise<void> => {
    await ev(
      page,
      `const s = document.createElement('style'); s.textContent = ${JSON.stringify(css)};
       __deep(${JSON.stringify(host)}).shadowRoot.appendChild(s); return 1;`,
    );
  };
  if (FIXES.has('nolayer')) await inject('svg-preview-pane', '#preview-frame { will-change: auto !important; }');
  if (FIXES.has('still')) await inject('playground-main', '::slotted(*) { transition: none !important; }');
  if (FIXES.has('keep')) {
    const w = await ev<number>(page, `return Math.round(__deep('svg-preview-pane').getBoundingClientRect().width);`);
    await inject(
      'playground-main',
      `::slotted(svg-preview-pane), :host(.inspector-open) ::slotted(svg-preview-pane) { flex: 0 0 ${w}px !important; transition: none !important; }`,
    );
  }
  console.log(`source: ${SOURCE}; fix: ${[...FIXES].join(', ') || 'none (as built)'}`);
  await pause(4000);

  const first = (await ev<string>(page, `return __deep('editor-tabs').active;`)) ?? 'main.pathogen';
  await ev(page, `__deep('file-tree').shadowRoot.querySelector('[data-path="pathogen.json"]').click(); return 1;`);
  await pause(2500);
  const tab = (path: string): string =>
    `__deep('editor-tabs').shadowRoot.querySelector('[data-path=${JSON.stringify(path)}] .label').click()`;
  await frames(page, 'tab switch', tab(first));
  await frames(page, 'tab switch back', tab('pathogen.json'));
  await frames(page, 'Files off', `__deep('#files-toggle').click()`);
  await frames(page, 'Files on', `__deep('#files-toggle').click()`);
  await frames(page, 'Console on', `__deep('#console-toggle').click()`);
  await frames(page, 'Console off', `__deep('#console-toggle').click()`);
  await frames(page, 'Inspector on', `__deep('#inspector-open-btn').click()`);
  await frames(page, 'Inspector off', `__deep('#inspector-open-btn').click()`);
  await frames(page, 'Docs on', `__deep('editor-tabs').shadowRoot.querySelector('.docs').click()`);
  await frames(page, 'Docs off', `__deep('editor-tabs').shadowRoot.querySelector('.docs').click()`);
} finally {
  if (id) await api('DELETE', `/workspace/${id}`);
  d1(`DELETE FROM sessions WHERE user_id = '${USER_ID}'; DELETE FROM users WHERE id = '${USER_ID}';`);
  await Promise.race([browser.close(), pause(10_000)]);
  process.exit(0);
}
