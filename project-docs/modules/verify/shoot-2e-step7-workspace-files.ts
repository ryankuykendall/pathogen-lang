// The screenshot for docs/workspace-files.md (2e step 7; docs/CLAUDE.md "Images"):
// a workspace of several files with the tree open, three files in tabs (a module in the
// editor while the preview shows the main), and the program chip's list open. Light and
// dark, the same size, to docs/images/workspace-files.png and workspace-files.dark.png.
// On the dev stack, as a throwaway owner (a session in the local D1); the workspace is
// deleted after.
//
//   npm run dev:stack            (and npm run build:playground:dev after a change)
//   npx tsx project-docs/modules/verify/shoot-2e-step7-workspace-files.ts

import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';

import puppeteer from 'puppeteer';

import type { Page } from 'puppeteer';

const PAGES_URL = 'http://localhost:3000';
const DEV_API = 'http://localhost:8787';
const pause = async (ms: number): Promise<void> => {
  await new Promise((r) => setTimeout(r, ms));
};

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

const tag = randomUUID().slice(0, 8);
const OWNER = { id: `v2e7-${tag}`, token: `v2e7-${randomUUID()}`, handle: `v2e7${tag}` };

async function api(method: string, path: string, body?: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(`${DEV_API}${path}`, {
    method,
    headers: { Cookie: `pathogen_session=${OWNER.token}`, 'Content-Type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, ...((await res.json().catch(() => ({}))) as Record<string, unknown>) };
}

// The two files are docs/modules.md's opening example, word for word, so the page's picture
// and the modules page's code agree (step 7's content review, finding 8).
const MAIN = `import { gear } from "./parts/gears.pathogen";

define ViewBox(0, 0, 200, 100);

gear(Point(55, 50), 40, 12);
gear(Point(150, 50), 28, 8);
`;
const GEARS = `module;

const toothDepth = 6;

export fn gear(center, radius, teeth) {
  star(center.x, center.y, radius, radius - toothDepth, teeth);
  circle(center.x, center.y, radius * 0.3);
}
`;
const DEMO = `import { gear } from "../parts/gears.pathogen";

define ViewBox(0, 0, 300, 110);

for (i in 0..2) {
  gear(Point(50 + i * 100, 55), 36, 9);
}
`;
const SIZES = `import { gear } from "./parts/gears.pathogen";

define ViewBox(0, 0, 200, 200);

gear(Point(100, 100), 80, 20);
`;

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
async function until<T>(page: Page, src: string, ms = 40_000): Promise<T | null> {
  const start = Date.now();
  while (Date.now() - start < ms) {
    const value = await ev<T | null>(page, src).catch(() => null);
    if (value) return value;
    await pause(250);
  }
  return null;
}

const now = Date.now();
d1(
  `INSERT INTO users (id, email, email_lower, handle, display_name, created_at, verified_at) VALUES ('${OWNER.id}', '${OWNER.id}@example.invalid', '${OWNER.id}@example.invalid', '${OWNER.handle}', '${OWNER.handle}', ${now}, ${now}); ` +
    `INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES ('${OWNER.token}', '${OWNER.id}', ${now}, ${now + 3_600_000});`,
);

mkdirSync('docs/images', { recursive: true });
let id: string | null = null;
// Tall enough that the program list, opening upward from the chip, clears the drawing.
const HEIGHT = 880;
const browser = await puppeteer.launch({ headless: true, args: [`--window-size=1280,${HEIGHT}`] });
try {
  const created = await api('POST', '/workspace', {
    name: 'Gears',
    files: {
      'main.pathogen': { text: MAIN },
      'parts/gears.pathogen': { text: GEARS },
      'demos/gears.pathogen': { text: DEMO },
      'try-sizes.pathogen': { text: SIZES },
    },
    folders: ['parts', 'demos'],
    entryPoints: ['main.pathogen', 'demos/gears.pathogen', 'try-sizes.pathogen'],
  });
  id = created.id as string;
  const url = `${PAGES_URL}/workspace/${created.slug as string}--${id}`;

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: HEIGHT });
  page.on('dialog', (d) => void d.accept());
  page.on('pageerror', (e) => console.log('PAGE ERROR', e.message));
  await page.setCookie({ name: 'pathogen_session', value: OWNER.token, domain: 'localhost', path: '/' });

  for (const theme of ['light', 'dark'] as const) {
    await page.goto(`${PAGES_URL}/`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(`localStorage.setItem('pathogen-theme', '${theme}')`);
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await until(page, `return __deep('file-tree') ? 1 : null;`);
    // The tree open: the toggle remembers its state, so let the page settle, then open it only if it's closed.
    await until(page, `return __deep('#files-toggle') ? 1 : null;`);
    await pause(1500);
    await ev(
      page,
      `const t = __deep('#files-toggle'); if (t.getAttribute('aria-pressed') !== 'true') t.click(); return 1;`,
    );
    await until(page, `return __deep('#files-toggle')?.getAttribute('aria-pressed') === 'true' ? 1 : null;`);
    await until(
      page,
      `return __deep('file-tree')?.shadowRoot.querySelector('[data-path="parts/gears.pathogen"]') ? 1 : null;`,
    );
    // Three tabs, a module in the editor: demos/gears, then parts/gears last.
    for (const path of ['demos/gears.pathogen', 'parts/gears.pathogen']) {
      await ev(page, `__deep('file-tree').shadowRoot.querySelector('[data-path="${path}"]').click(); return 1;`);
      await pause(500);
    }
    // The program list open, its drawings made.
    await until(page, `return __deep('program-chip')?.shadowRoot.querySelector('.pick') ? 1 : null;`);
    await ev(
      page,
      `const chip = __deep('program-chip').shadowRoot; if (chip.querySelector('.list').hidden) chip.querySelector('.pick').click(); return 1;`,
    );
    await until(page, `return __deep('program-chip').shadowRoot.querySelector('.list').hidden ? null : 1;`);
    await until(
      page,
      `const rows = [...(__deep('program-chip')?.shadowRoot.querySelectorAll('.prow') ?? [])];
       return rows.length === 3 && rows.every((r) => !r.classList.contains('upd') && r.querySelector('.tile img')?.complete) ? 1 : null;`,
    );
    await pause(1200);
    const file = theme === 'light' ? 'docs/images/workspace-files.png' : 'docs/images/workspace-files.dark.png';
    // From the breadcrumb down: the workspace, without the site's header (and the account's name).
    const top = await ev<number>(page, `return Math.round(__deep('app-breadcrumb').getBoundingClientRect().top);`);
    // Within the window: a capture beyond it resizes the page, which closes the list.
    await page.screenshot({
      path: file,
      clip: { x: 0, y: top, width: 1280, height: HEIGHT - top },
      captureBeyondViewport: false,
    });
    console.log(`Saved ${file}`);
  }
  await page.evaluate(`localStorage.setItem('pathogen-theme', 'light')`);
} finally {
  if (id) await api('DELETE', `/workspace/${id}`);
  d1(`DELETE FROM sessions WHERE token = '${OWNER.token}'; DELETE FROM users WHERE id = '${OWNER.id}';`);
  await Promise.race([browser.close(), pause(10_000)]);
}
