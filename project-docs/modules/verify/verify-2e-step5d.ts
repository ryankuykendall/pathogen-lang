// 2e step 5d (note 59, requirement 9; mockup project-docs/modules/mockups-2e-5d-unreadable-
// file/, approved 2026-11-16): a file that can't be read says so in its place, and the other
// files still show. On the dev stack (localhost:3000 and :8787), in full Chrome.
// - A snapshot of three files; its module is then edited, and the snapshot's older copy
//   of it is deleted from local R2 (the dev API binds the preview bucket).
// - The snapshots page shows the drawing and the other files; the module's row has a
//   warning and says why on hover; shown, it says "This file couldn't be read." where its
//   code would be, and its copy icon is off; another file shows again.
// - Light and dark screenshots.
//
// One throwaway owner (a session in the local D1). Everything made is deleted.
//
//   npm run dev:stack            (and npm run build:playground:dev after a change)
//   npx tsx project-docs/modules/verify/verify-2e-step5d.ts

import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

import puppeteer from 'puppeteer';

import type { Page } from 'puppeteer';

const PAGES_URL = 'http://localhost:3000';
const DEV_API = 'http://localhost:8787';
const OUT = 'project-docs/modules/verify';
const pause = async (ms: number): Promise<void> => {
  await new Promise((r) => setTimeout(r, ms));
};

let failures = 0;
const check = (label: string, ok: boolean, detail?: unknown): void => {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${label}${ok ? '' : ` ${JSON.stringify(detail)?.slice(0, 700)}`}`);
  if (!ok) failures++;
};

function wrangler(args: string[]): void {
  execFileSync('npx', ['wrangler', ...args], { cwd: 'api', stdio: ['pipe', 'pipe', 'inherit'] });
}
const d1 = (sql: string): void =>
  wrangler([
    'd1',
    'execute',
    'svg-path-extended-users',
    '--local',
    '--persist-to=../.wrangler/state',
    '--command',
    sql,
  ]);

const tag = randomUUID().slice(0, 8);
const OWNER = { id: `v2e5d-${tag}`, token: `v2e5d-${randomUUID()}`, handle: `v2e5d${tag}` };

async function api(method: string, path: string, body?: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(`${DEV_API}${path}`, {
    method,
    headers: { Cookie: `pathogen_session=${OWNER.token}`, 'Content-Type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, ...((await res.json().catch(() => ({}))) as Record<string, unknown>) };
}

const MAIN =
  'import { gear } from "./parts/gears.pathogen";\ndefine ViewBox(0, 0, 200, 100);\ngear(Point(55, 50), 40);\n';
const GEARS = 'module;\n\nexport fn gear(at, r) {\n  circle(at.x, at.y, r);\n}\n';
const DEMO =
  'import { gear } from "../parts/gears.pathogen";\ndefine ViewBox(0, 0, 300, 110);\ngear(Point(50, 50), 34);\n';

const DEEP = `
  window.__deep = (sel, root = document) => {
    const found = root.querySelector(sel);
    if (found) return found;
    for (const el of root.querySelectorAll('*')) {
      if (el.shadowRoot) { const f = window.__deep(sel, el.shadowRoot); if (f) return f; }
    }
    return null;
  };
  window.__mw = () => __deep('workspace-snapshots-view')?.shadowRoot.querySelector('mini-workspace');
  window.__sf = () => __mw()?.shadowRoot.querySelector('source-files');`;
const ev = async <T>(page: Page, src: string): Promise<T> => (await page.evaluate(`(() => { ${DEEP} ${src} })()`)) as T;
async function until<T>(page: Page, src: string, ms = 30_000): Promise<T | null> {
  const start = Date.now();
  while (Date.now() - start < ms) {
    const value = await ev<T | null>(page, src).catch(() => null);
    if (value) return value;
    await pause(200);
  }
  return null;
}

const now = Date.now();
d1(
  `INSERT INTO users (id, email, email_lower, handle, display_name, created_at, verified_at) VALUES ('${OWNER.id}', '${OWNER.id}@example.invalid', '${OWNER.id}@example.invalid', '${OWNER.handle}', '${OWNER.handle}', ${now}, ${now}); ` +
    `INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES ('${OWNER.token}', '${OWNER.id}', ${now}, ${now + 3_600_000});`,
);
const browser = await puppeteer.launch({ headless: true, args: ['--window-size=1440,900'] });
let id: string | null = null;
try {
  const created = await api('POST', '/workspace', {
    name: 'Gears',
    files: {
      'main.pathogen': { text: MAIN },
      'parts/gears.pathogen': { text: GEARS },
      'demos/gears.pathogen': { text: DEMO },
    },
    folders: ['parts', 'demos'],
    entryPoints: ['main.pathogen', 'demos/gears.pathogen'],
  });
  id = created.id as string;
  const slugId = `${created.slug as string}--${id}`;

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  page.on('dialog', (d) => void d.accept());
  page.on('pageerror', (e) => console.log('PAGE ERROR', e.message));
  await page.setCookie({ name: 'pathogen_session', value: OWNER.token, domain: 'localhost', path: '/' });

  // A snapshot, made through the page.
  await page.goto(`${PAGES_URL}/workspace/${slugId}`, { waitUntil: 'domcontentloaded' });
  await until(page, `const b = __deep('#snapshot-btn'); return b && !b.disabled ? 1 : null;`, 60_000);
  await ev(page, `__deep('#snapshot-btn').click(); return 1;`);
  await until(
    page,
    `return document.querySelector('snapshot-popover')?.shadowRoot.querySelector('[data-act=save]') ? 1 : null;`,
  );
  await ev(
    page,
    `document.querySelector('snapshot-popover').shadowRoot.querySelector('[data-act=save]').click(); return 1;`,
  );
  await pause(2500);

  // The module edited since; the snapshot's older copy of it lost.
  const files = (await api('GET', `/workspace/${id}`)).files as Record<string, { sha256: string }>;
  const snapshotGears = files['parts/gears.pathogen'].sha256;
  await api('PUT', `/workspace/${id}`, {
    files: {
      'main.pathogen': { sha256: files['main.pathogen'].sha256 },
      'parts/gears.pathogen': { text: `${GEARS}// edited after the snapshot\n` },
      'demos/gears.pathogen': { sha256: files['demos/gears.pathogen'].sha256 },
    },
    folders: ['parts', 'demos'],
    entryPoints: ['main.pathogen', 'demos/gears.pathogen'],
  });
  wrangler([
    'r2',
    'object',
    'delete',
    `svg-path-extended-thumbnails-preview/files/${id}/${snapshotGears}`,
    '--local',
    '--persist-to=../.wrangler/state',
  ]);

  for (const theme of ['light', 'dark'] as const) {
    await page.evaluate(`localStorage.setItem('pathogen-theme', '${theme}')`);
    await page.goto(`${PAGES_URL}/workspace/${slugId}/snapshots/1`, { waitUntil: 'domcontentloaded' });
    await until(page, `return __sf() ? 1 : null;`);
    await ev(page, `__mw().setAttribute('code-open', ''); return 1;`);
    const first = await until<{ shown: string; rows: string[]; lostRow: { cls: boolean; title: string } }>(
      page,
      `const sf = __sf()?.shadowRoot; if (!sf?.querySelector('.cm-editor .cm-line')) return null;
       const row = sf.querySelector('.row.file[data-path="parts/gears.pathogen"]');
       return { shown: __sf().shownText, rows: [...sf.querySelectorAll('.row.file')].map((r) => r.dataset.path),
         lostRow: { cls: row.classList.contains('unreadable'), title: row.title } };`,
    );
    if (theme === 'light') {
      check(
        'the page opens with the drawing and the main, every file listed',
        first?.shown === MAIN && first.rows.length === 3,
        first,
      );
      check(
        "the module's row keeps its place, with the warning, and says why on hover",
        first?.lostRow.cls === true && first.lostRow.title === "parts/gears.pathogen couldn't be read",
        first?.lostRow,
      );
    }
    await ev(page, `__sf().shadowRoot.querySelector('.row.file[data-path="parts/gears.pathogen"]').click(); return 1;`);
    const shown = await until<{ message: string; copy: boolean; editorHidden: boolean }>(
      page,
      `const sf = __sf().shadowRoot; const code = sf.querySelector('.code');
       if (!code.classList.contains('lost')) return null;
       return { message: sf.querySelector('.unread').textContent.replace(/\\s+/g, ' ').trim(),
         copy: sf.querySelector('.path .cp').disabled,
         editorHidden: getComputedStyle(sf.querySelector('.cm')).display === 'none' };`,
    );
    if (theme === 'light') {
      check(
        'shown, it says so where its code would be, the code hidden, and its copy icon is off',
        shown?.message === 'This file couldn’t be read. The other files show as saved.' &&
          shown.copy &&
          shown.editorHidden,
        shown,
      );
    }
    await pause(500);
    const box = await ev<{ x: number; y: number; width: number; height: number }>(
      page,
      `const r = __deep('workspace-snapshots-view').shadowRoot.querySelector('.stage').getBoundingClientRect();
       return { x: r.left, y: r.top, width: r.width, height: r.height };`,
    );
    await page.screenshot({ path: `${OUT}/2e-step5d-unreadable-${theme}.png`, clip: box });
    if (theme === 'light') {
      await ev(
        page,
        `__sf().shadowRoot.querySelector('.row.file[data-path="demos/gears.pathogen"]').click(); return 1;`,
      );
      const back = await until<{ text: string; copy: boolean }>(
        page,
        `const sf = __sf().shadowRoot; if (sf.querySelector('.code').classList.contains('lost')) return null;
         return { text: __sf().shownText, copy: sf.querySelector('.path .cp').disabled };`,
      );
      check('another file shows again, its copy icon on', back?.text === DEMO && back.copy === false, back);
    }
  }
  await page.evaluate(`localStorage.setItem('pathogen-theme', 'light')`);
} finally {
  if (id) await api('DELETE', `/workspace/${id}`);
  d1(`DELETE FROM sessions WHERE token = '${OWNER.token}'; DELETE FROM users WHERE id = '${OWNER.id}';`);
  await Promise.race([browser.close(), pause(10_000)]);
}

console.log(failures === 0 ? '\nall passed' : `\n${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
