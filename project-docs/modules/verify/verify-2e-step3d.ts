// 2e, step 3d (note 58): the workspace's copy icon, in a cell at the end of the
// editor's tabs, before Docs (mockups v13 and v14). Signed in on the dev stack,
// a workspace of several files, light and dark:
// - the cell: the bar's height, 38 px wide, a border on its left, before Docs;
//   named for the file in the editor;
// - it copies that file, and says "Copied <path>" over the code, not under it;
// - another tab: it copies that one;
// - the breadcrumb has no Copy Code;
// - every tab closed: no icon;
// - a phone (390 px): the icon at the right end of the tabs, no Copy Code in
//   the control row.
//
//   npm run dev:stack            (and npm run build:playground:dev after a change)
//   npx tsx project-docs/modules/verify/verify-2e-step3d.ts

import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

import puppeteer from 'puppeteer';

import type { Page } from 'puppeteer';

const PAGES_URL = 'http://localhost:3000';
const DEV_API = 'http://localhost:8787';
const SHOTS = 'project-docs/modules/verify';
const USER_ID = `verify2e3d-${randomUUID().slice(0, 8)}`;
const TOKEN = `verify2e3d-${randomUUID()}`;
const COOKIE = `pathogen_session=${TOKEN}`;

const MAIN =
  'import { gear } from "./parts/gears.pathogen";\ndefine ViewBox(0, 0, 200, 100);\ngear(Point(100, 50), 40);\n';
const GEARS = 'module;\n\nexport fn gear(at, r) {\n  circle(at.x, at.y, r);\n}\n';

let failures = 0;
const check = (label: string, ok: boolean, detail?: unknown): void => {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${label}${ok ? '' : ` ${JSON.stringify(detail)?.slice(0, 800)}`}`);
  if (!ok) failures++;
};

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

async function api(method: string, path: string, body?: unknown): Promise<Response> {
  return fetch(`${DEV_API}${path}`, {
    method,
    headers: { Cookie: COOKIE, 'Content-Type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

const pause = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

const DEEP = `
  window.__deep = (sel, root = document) => {
    const found = root.querySelector(sel);
    if (found) return found;
    for (const el of root.querySelectorAll('*')) {
      if (el.shadowRoot) { const f = window.__deep(sel, el.shadowRoot); if (f) return f; }
    }
    return null;
  };
  window.__tabs = () => __deep('editor-tabs');
  window.__copy = () => __tabs()?.shadowRoot.querySelector('.copy');`;

async function poll<T>(page: Page, src: string, ms = 20_000): Promise<T | null> {
  const start = Date.now();
  while (Date.now() - start < ms) {
    const value = (await page.evaluate(`(() => { ${DEEP} ${src} })()`)) as T;
    if (value) return value;
    await pause(150);
  }
  return null;
}
const ev = async <T>(page: Page, src: string): Promise<T> => (await page.evaluate(`(() => { ${DEEP} ${src} })()`)) as T;
const clipboard = async (page: Page): Promise<string> =>
  (await page.evaluate(`navigator.clipboard.readText().catch((e) => 'read failed: ' + e.message)`)) as string;

const now = Date.now();
d1(
  `INSERT INTO users (id, email, email_lower, handle, display_name, created_at, verified_at) VALUES ('${USER_ID}', '${USER_ID}@example.invalid', '${USER_ID}@example.invalid', '${USER_ID}', 'Verify 2e3d', ${now}, ${now}); ` +
    `INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES ('${TOKEN}', '${USER_ID}', ${now}, ${now + 3_600_000});`,
);
const made: string[] = [];
const browser = await puppeteer.launch({ headless: 'shell', args: ['--window-size=1400,900'] });
await browser
  .defaultBrowserContext()
  .overridePermissions(PAGES_URL, ['clipboard-read', 'clipboard-write', 'clipboard-sanitized-write']);
try {
  const created = (await (
    await api('POST', '/workspace', {
      name: 'Gears 2e3d',
      files: { 'main.pathogen': { text: MAIN }, 'parts/gears.pathogen': { text: GEARS } },
      entryPoints: ['main.pathogen'],
    })
  ).json()) as { id: string; slug: string };
  made.push(created.id);
  const slugId = `${created.slug}--${created.id}`;

  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('PAGE ERROR', e.message));
  await page.setCookie({ name: 'pathogen_session', value: TOKEN, domain: 'localhost', path: '/' });

  for (const theme of ['light', 'dark']) {
    await page.setViewport({ width: 1400, height: 900 });
    await page.evaluateOnNewDocument((t) => localStorage.setItem('pathogen-theme', t), theme);
    await page.goto(`${PAGES_URL}/workspace/${slugId}`, { waitUntil: 'domcontentloaded' });
    const loaded = await poll(
      page,
      `return __copy() && __deep('code-editor-pane')?.code === ${JSON.stringify(MAIN)} ? 1 : null;`,
      30_000,
    );
    check(`[${theme}] the workspace opens on main.pathogen`, loaded === 1);

    const cell = await ev<Record<string, unknown>>(
      page,
      `const t = __tabs(); const c = t.shadowRoot.querySelector('.copy'); const d = t.shadowRoot.querySelector('.docs');
       const bar = t.getBoundingClientRect(); const r = c.getBoundingClientRect(); const dr = d.getBoundingClientRect();
       return { width: Math.round(r.width), height: Math.round(r.height), bar: Math.round(bar.height),
         border: getComputedStyle(c).borderLeftWidth, beforeDocs: Math.round(dr.left) === Math.round(r.right),
         label: c.getAttribute('aria-label'), hidden: t.shadowRoot.querySelector('.copy-cell').hidden };`,
    );
    // The cell fills the bar down to its 1 px bottom border, as Docs does.
    check(
      `[${theme}] the cell: the bar's height, 38 px wide, a border on its left, just before Docs, named for the file`,
      cell.width === 38 &&
        cell.height === (cell.bar as number) - 1 &&
        cell.border === '1px' &&
        cell.beforeDocs === true &&
        cell.label === 'Copy main.pathogen' &&
        cell.hidden === false,
      cell,
    );

    // Copy, and the note over the code.
    await ev(page, `__copy().click(); return 1;`);
    const tip = await poll<{ text: string; top: boolean }>(
      page,
      `const t = __tabs(); const tip = t.shadowRoot.querySelector('.tip'); if (!tip) return null;
       const r = tip.getBoundingClientRect();
       // The note lets clicks through (pointer-events: none), which hit-testing honours: on for the test.
       tip.style.pointerEvents = 'auto';
       const hit = t.shadowRoot.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
       tip.style.pointerEvents = '';
       return { text: tip.textContent, top: !!hit && tip.contains(hit) };`,
    );
    const clip = await clipboard(page);
    check(
      `[${theme}] it copies the file in the editor, then says so over the code`,
      clip === MAIN && tip?.text === 'Copied main.pathogen' && tip.top === true,
      { clip: clip.slice(0, 50), tip },
    );
    await page.screenshot({ path: `${SHOTS}/2e-step3d-copied-${theme}.png` });

    // The breadcrumb.
    const crumb = await ev<number>(
      page,
      `return __deep('app-breadcrumb').shadowRoot.querySelectorAll('#copy-code, #copy-feedback').length;`,
    );
    check(`[${theme}] the breadcrumb has no Copy Code`, crumb === 0, crumb);

    // Another file, opened from the tree as a reader opens it: the icon copies that one.
    await ev(
      page,
      `__deep('file-tree').shadowRoot.querySelector('[data-path="parts/gears.pathogen"]').click(); return 1;`,
    );
    const switched = await poll(
      page,
      `return __deep('code-editor-pane')?.code === ${JSON.stringify(GEARS)} ? 1 : null;`,
    );
    check(`[${theme}] the tree opens parts/gears.pathogen in the editor`, switched === 1);
    await pause(2200);
    const other = await ev<Record<string, unknown>>(
      page,
      `return { label: __copy().getAttribute('aria-label'), tip: !!__tabs().shadowRoot.querySelector('.tip') };`,
    );
    await ev(page, `__copy().click(); return 1;`);
    const otherTip = await poll<string>(page, `return __tabs().shadowRoot.querySelector('.tip')?.textContent ?? null;`);
    const otherClip = await clipboard(page);
    check(
      `[${theme}] another tab: the icon names it and copies it`,
      other.label === 'Copy parts/gears.pathogen' &&
        other.tip === false &&
        otherTip === 'Copied parts/gears.pathogen' &&
        otherClip === GEARS,
      { ...other, otherTip, clip: otherClip.slice(0, 40) },
    );

    // Every tab closed, by their ×: no icon.
    for (let i = 0; i < 3; i++) {
      await ev(page, `__tabs().shadowRoot.querySelector('.close')?.click(); return 1;`);
      await pause(300);
    }
    const none = await poll<{ hidden: boolean }>(
      page,
      `const c = __tabs()?.shadowRoot.querySelector('.copy-cell'); return c && c.hidden ? { hidden: true } : null;`,
    );
    check(`[${theme}] with no file open, no icon`, none?.hidden === true, none);
  }

  // A phone.
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await page.evaluateOnNewDocument(() => localStorage.setItem('pathogen-theme', 'light'));
  await page.goto(`${PAGES_URL}/workspace/${slugId}`, { waitUntil: 'domcontentloaded' });
  await poll(page, `return __copy() && __deep('code-editor-pane')?.code ? 1 : null;`, 30_000);
  await pause(500);
  const phone = await ev<Record<string, unknown>>(
    page,
    `const t = __tabs(); const c = t.shadowRoot.querySelector('.copy').getBoundingClientRect();
     const d = t.shadowRoot.querySelector('.docs').getBoundingClientRect();
     return { visible: c.width === 38 && c.left >= 0 && d.right <= window.innerWidth, beforeDocs: Math.round(c.right) === Math.round(d.left),
       copyCode: __deep('app-breadcrumb').shadowRoot.querySelectorAll('#copy-code').length };`,
  );
  check(
    'phone: the icon at the right end of the tabs, before Docs; no Copy Code in the control row',
    phone.visible === true && phone.beforeDocs === true && phone.copyCode === 0,
    phone,
  );
  await page.screenshot({ path: `${SHOTS}/2e-step3d-phone-light.png` });
} finally {
  await browser.close();
  for (const id of made) await api('DELETE', `/workspace/${id}`);
  d1(`DELETE FROM sessions WHERE user_id = '${USER_ID}'; DELETE FROM users WHERE id = '${USER_ID}';`);
}

console.log(failures === 0 ? '\nall passed' : `\n${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
