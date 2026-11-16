// The preview pane's width (the gap) at several window widths, with the tree and the
// inspector open, then with the console open too: option 1 as built (README.md, "Narrow
// windows"). Dev stack, signed in as a throwaway user.
//
//   npx tsx project-docs/preview-raster-perf/measure-gap-widths.ts

import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

import puppeteer from 'puppeteer';

import type { Page } from 'puppeteer';

const USER_ID = `gapw-${randomUUID().slice(0, 8)}`;
const TOKEN = `gapw-${randomUUID()}`;
const pause = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const d1 = (sql: string): void => {
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
};
const api = async (method: string, path: string, body?: unknown): Promise<Response> =>
  fetch(`http://localhost:8787${path}`, {
    method,
    headers: { Cookie: `pathogen_session=${TOKEN}`, 'Content-Type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
const DEEP = `window.__deep = (sel, root = document) => { const f = root.querySelector(sel); if (f) return f;
  for (const el of root.querySelectorAll('*')) { if (el.shadowRoot) { const g = window.__deep(sel, el.shadowRoot); if (g) return g; } } return null; };`;
const ev = async <T>(page: Page, src: string): Promise<T> => (await page.evaluate(`(() => { ${DEEP} ${src} })()`)) as T;
const widths = (page: Page): Promise<Record<string, number>> =>
  ev(
    page,
    `const w = (t) => Math.round(__deep(t).getBoundingClientRect().width);
     return { window: innerWidth, tree: w('file-tree'), editor: w('code-editor-pane'), console: w('console-pane'), preview: w('svg-preview-pane'), inspector: w('inspector-panel') };`,
  );

const now = Date.now();
d1(
  `INSERT INTO users (id, email, email_lower, handle, display_name, created_at, verified_at) VALUES ('${USER_ID}', '${USER_ID}@example.invalid', '${USER_ID}@example.invalid', '${USER_ID}', 'Gap', ${now}, ${now}); ` +
    `INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES ('${TOKEN}', '${USER_ID}', ${now}, ${now + 3_600_000});`,
);
const browser = await puppeteer.launch({ headless: true });
let id = '';
try {
  const created = (await (
    await api('POST', '/workspace', {
      name: 'Gap widths',
      files: { 'main.pathogen': { text: 'define ViewBox(0, 0, 200, 100);\ncircle(100, 50, 40);\n' } },
      entryPoints: ['main.pathogen'],
    })
  ).json()) as { id: string; slug: string };
  id = created.id;
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.setCookie({ name: 'pathogen_session', value: TOKEN, domain: 'localhost', path: '/' });
  await page.goto(`http://localhost:3000/workspace/${created.slug}--${created.id}`, { waitUntil: 'domcontentloaded' });
  await pause(5000);
  await ev(page, `__deep('#inspector-open-btn').click(); return 1;`);
  await pause(800);
  for (const panes of ['tree + inspector', 'tree + console + inspector']) {
    if (panes.includes('console')) {
      await ev(page, `__deep('#console-toggle').click(); return 1;`);
      await pause(800);
    }
    for (const width of [1024, 1280, 1440, 1680]) {
      await page.setViewport({ width, height: 900 });
      await pause(600);
      console.log(`${panes.padEnd(28)} ${JSON.stringify(await widths(page))}`);
    }
  }
} finally {
  if (id) await api('DELETE', `/workspace/${id}`);
  d1(`DELETE FROM sessions WHERE user_id = '${USER_ID}'; DELETE FROM users WHERE id = '${USER_ID}';`);
  await Promise.race([browser.close(), pause(10_000)]);
  process.exit(0);
}
