// Mockup for 2e step 5c's follow-up (58-phase-2e-plan.md, "A question for you: Make
// private while a re-review waits"; your answer: (a)). Both menus offer Make private
// while an edit waits for re-review, with the note "An edit is waiting for review".
//
// Faithful by construction: the real menus on the dev stack, in light and dark. "Today"
// is the menu as it is; "Proposed" is the same live menu with only its item changed
// (the breadcrumb's: the state without a re-review, plus the note; the Workspaces
// page's: the note), so every style is the real one. Writes PNGs here and a
// self-contained BBWP page in website/bbwp/.
//
// One throwaway owner (local D1) and the dev ADMIN_TOKEN from api/.dev.vars (never
// printed) to approve. Everything made is deleted.
//
//   npm run dev:stack
//   npx tsx project-docs/modules/mockups-2e-5c-rereview-menu/capture.ts

import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

import puppeteer from 'puppeteer';

import type { Page } from 'puppeteer';

const PAGES_URL = 'http://localhost:3000';
const DEV_API = 'http://localhost:8787';
const OUT = 'project-docs/modules/mockups-2e-5c-rereview-menu';
const ADMIN_TOKEN = (readFileSync('api/.dev.vars', 'utf8').match(/^ADMIN_TOKEN=(.*)$/m)?.[1] ?? '').trim();
const NOTE = 'An edit is waiting for review';
const pause = async (ms: number): Promise<void> => {
  await new Promise((r) => setTimeout(r, ms));
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

const tag = randomUUID().slice(0, 8);
const OWNER = { id: `m2e5c-${tag}`, token: `m2e5c-${randomUUID()}`, handle: `m2e5c${tag}` };

async function api(admin: boolean, method: string, path: string, body?: unknown): Promise<Record<string, unknown>> {
  const url = admin ? `${DEV_API}${path}?token=${encodeURIComponent(ADMIN_TOKEN)}` : `${DEV_API}${path}`;
  const res = await fetch(url, {
    method,
    headers: { ...(admin ? {} : { Cookie: `pathogen_session=${OWNER.token}` }), 'Content-Type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, ...((await res.json().catch(() => ({}))) as Record<string, unknown>) };
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
async function until<T>(page: Page, src: string, ms = 20_000): Promise<T | null> {
  const start = Date.now();
  while (Date.now() - start < ms) {
    const value = await ev<T | null>(page, src).catch(() => null);
    if (value) return value;
    await pause(200);
  }
  return null;
}

/** A screenshot of an open menu and a margin around it, the button above it included. */
async function shootMenu(page: Page, menuSelector: string, file: string): Promise<void> {
  await pause(400);
  const box = await ev<{ x: number; y: number; width: number; height: number }>(
    page,
    `const m = ${menuSelector}; const r = m.getBoundingClientRect(); return { x: r.left, y: r.top, width: r.width, height: r.height };`,
  );
  await page.screenshot({
    path: `${OUT}/${file}`,
    clip: { x: box.x - 40, y: box.y - 56, width: box.width + 80, height: box.height + 80 },
  });
}

if (!ADMIN_TOKEN) throw new Error('api/.dev.vars has no ADMIN_TOKEN');
const now = Date.now();
d1(
  `INSERT INTO users (id, email, email_lower, handle, display_name, created_at, verified_at) VALUES ('${OWNER.id}', '${OWNER.id}@example.invalid', '${OWNER.id}@example.invalid', '${OWNER.handle}', '${OWNER.handle}', ${now}, ${now}); ` +
    `INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES ('${OWNER.token}', '${OWNER.id}', ${now}, ${now + 3_600_000});`,
);
const browser = await puppeteer.launch({ headless: true, args: ['--window-size=1440,900'] });
let id: string | null = null;
try {
  // An approved workspace with an edit waiting for re-review.
  const created = await api(false, 'POST', '/workspace', {
    name: 'Spiral',
    code: 'define ViewBox(0, 0, 100, 100);\ncircle(50, 50, 40);\n',
  });
  id = created.id as string;
  await api(false, 'POST', `/workspace/${id}/submit-for-review`);
  await api(true, 'POST', `/admin/review/${id}`, { decision: 'approve' });
  const edited = await api(false, 'PUT', `/workspace/${id}`, {
    code: 'define ViewBox(0, 0, 100, 100);\ncircle(50, 50, 30);\n',
  });
  if (edited.rereviewPending !== true) throw new Error('no re-review waiting');

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
  page.on('dialog', (d) => void d.accept());
  await page.setCookie({ name: 'pathogen_session', value: OWNER.token, domain: 'localhost', path: '/' });
  for (const theme of ['light', 'dark'] as const) {
    await page.goto(`${PAGES_URL}/`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(`localStorage.setItem('pathogen-theme', '${theme}')`);

    // ---- The workspace's menu ----
    await page.goto(`${PAGES_URL}/workspace/${created.slug as string}--${id}`, { waitUntil: 'domcontentloaded' });
    const crumbMenu = `__deep('app-breadcrumb').shadowRoot.querySelector('.menu-dropdown')`;
    const item = `__deep('app-breadcrumb')?.shadowRoot?.querySelector('[data-action="toggle-publish"]')`;
    await until(page, `const b = ${item}; return b && b.textContent.includes('Pending re-review') ? 1 : null;`);
    await ev(page, `__deep('app-breadcrumb').shadowRoot.querySelector('.menu-btn').click(); return 1;`);
    await until(page, `return ${crumbMenu}?.classList.contains('open') ? 1 : null;`);
    await shootMenu(page, crumbMenu, `workspace-menu-today-${theme}.png`);
    // Proposed: the item as without a re-review (Make private, its lock icon), with the note.
    await page.evaluate(`import('/state/store.js').then(({ store }) => store.set('workspaceRereviewPending', false))`);
    await until(page, `const b = ${item}; return b && b.textContent.includes('Make private') ? 1 : null;`);
    await ev(
      page,
      `${item}.querySelector('span').insertAdjacentHTML('beforeend', '<small>${NOTE}</small>'); return 1;`,
    );
    await shootMenu(page, crumbMenu, `workspace-menu-proposed-${theme}.png`);

    // ---- The Workspaces page's menu ----
    await page.goto(`${PAGES_URL}/workspaces`, { waitUntil: 'domcontentloaded' });
    const card = `__deep('landing-view')?.shadowRoot?.querySelector('.workspace-item[data-id="${id}"]')`;
    await until(page, `return ${card}?.querySelector('[data-action="toggle-publish"]') ? 1 : null;`);
    await ev(page, `${card}.querySelector('.menu-btn').click(); return 1;`);
    const cardMenu = `${card}.querySelector('.menu-dropdown')`;
    await until(page, `return ${cardMenu}?.classList.contains('open') ? 1 : null;`);
    await shootMenu(page, cardMenu, `workspaces-page-menu-today-${theme}.png`);
    await ev(
      page,
      `${card}.querySelector('[data-action="toggle-publish"]').insertAdjacentHTML('beforeend', '<small>${NOTE}</small>'); return 1;`,
    );
    await shootMenu(page, cardMenu, `workspaces-page-menu-proposed-${theme}.png`);
  }
  await page.evaluate(`localStorage.setItem('pathogen-theme', 'light')`);
} finally {
  if (id) await api(false, 'DELETE', `/workspace/${id}`);
  d1(`DELETE FROM sessions WHERE token = '${OWNER.token}'; DELETE FROM users WHERE id = '${OWNER.id}';`);
  await Promise.race([browser.close(), pause(10_000)]);
}

// ---- The BBWP page: Today and Proposed, side by side, light and dark ----
const img = (file: string): string => `data:image/png;base64,${readFileSync(`${OUT}/${file}`).toString('base64')}`;
const row = (title: string, base: string, today: string, proposed: string): string => `
  <section>
    <h2>${title}</h2>
    <div class="pair">
      <figure><figcaption>Today</figcaption>
        <img class="light" src="${img(`${base}-today-light.png`)}" alt="${title}, today, light">
        <img class="dark" src="${img(`${base}-today-dark.png`)}" alt="${title}, today, dark">
        <p>${today}</p></figure>
      <figure><figcaption>Proposed</figcaption>
        <img class="light" src="${img(`${base}-proposed-light.png`)}" alt="${title}, proposed, light">
        <img class="dark" src="${img(`${base}-proposed-dark.png`)}" alt="${title}, proposed, dark">
        <p>${proposed}</p></figure>
    </div>
  </section>`;
const stamp = new Date();
const two = (n: number): string => String(n).padStart(2, '0');
const name = `${stamp.getFullYear()}-${two(stamp.getMonth() + 1)}-${two(stamp.getDate())}-${two(stamp.getHours())}:${two(stamp.getMinutes())}:${two(stamp.getSeconds())}--modules--rereview-make-private-menu.bbwp.html`;
writeFileSync(
  `website/bbwp/${name}`,
  `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Make private during re-review</title>
<style>
  :root { --bg: #f6f3ee; --fg: #1c1722; --muted: #5a4f6a; --card: #fff; --line: rgba(28,23,34,.1); }
  :root[data-theme="dark"] { --bg: #16131b; --fg: #ece8f2; --muted: #a79fb4; --card: #201c27; --line: rgba(255,255,255,.1); }
  body { margin: 0; padding: 32px 16px 64px; background: var(--bg); color: var(--fg); font: 15px/1.5 system-ui, sans-serif; }
  main { max-width: 1100px; margin: 0 auto; }
  h1 { font-size: 22px; margin: 0 0 6px; }
  h2 { font-size: 16px; margin: 32px 0 12px; }
  .lede { color: var(--muted); max-width: 70ch; }
  .toggle { margin: 16px 0; display: flex; gap: 8px; }
  .toggle button { font: inherit; padding: 6px 12px; border-radius: 8px; border: 1px solid var(--line); background: var(--card); color: var(--fg); cursor: pointer; }
  .toggle button[aria-pressed="true"] { outline: 2px solid #9461c4; }
  .pair { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 24px; }
  figure { margin: 0; background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 16px; }
  figcaption { font-weight: 600; margin-bottom: 10px; }
  figure img { max-width: 100%; height: auto; display: block; }
  figure p { color: var(--muted); margin: 10px 0 0; font-size: 14px; }
  :root:not([data-theme="dark"]) img.dark, :root[data-theme="dark"] img.light { display: none; }
</style>
</head>
<body>
<main>
  <h1>Make private while an edit waits for re-review</h1>
  <p class="lede">Phase 2e, step 5c, answer (a). An approved workspace with an edit waiting for re-review. Today the workspace's menu shows "Pending re-review", off, in place of Make private. Proposed: both menus offer Make private, with the note "${NOTE}" under it, in the menus' existing note style. Make private hides the workspace from Explore and withdraws the re-review. Captured from the real menus on the dev stack: only the item's words and note differ.</p>
  <div class="toggle" role="group" aria-label="Theme">
    <button type="button" data-theme="light" aria-pressed="true">Light</button>
    <button type="button" data-theme="dark" aria-pressed="false">Dark</button>
  </div>
  ${row('The workspace’s menu', 'workspace-menu', '“Pending re-review”, off: no way to make it private until the review.', 'Make private, with the note under it.')}
  ${row('The Workspaces page’s menu', 'workspaces-page-menu', 'Make Private, with nothing to say an edit waits.', 'Make Private, with the same note.')}
</main>
<script>
  for (const b of document.querySelectorAll('.toggle button')) {
    b.addEventListener('click', () => {
      document.documentElement.dataset.theme = b.dataset.theme;
      for (const o of document.querySelectorAll('.toggle button')) o.setAttribute('aria-pressed', String(o === b));
    });
  }
</script>
</body>
</html>
`,
);
console.log(`Wrote website/bbwp/${name}`);
