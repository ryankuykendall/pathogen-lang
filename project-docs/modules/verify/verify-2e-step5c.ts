// 2e step 5c (58-phase-2e-plan.md, answer 8): Make public, on the dev stack (localhost:3000
// and :8787), in full Chrome.
// - The breadcrumb's Make public, right after typing: the edit is saved first and is what's
//   submitted; the main, which imports a module, passes the check; the menu says "Pending
//   review".
// - The Workspaces page's Make Public, for a workspace whose main imports a module: it's
//   submitted (before, "Workspace is empty."), and its menu says "Pending Review".
// - After approval, the breadcrumb's menu follows each save: an edit makes it "Pending
//   re-review", going back to the approved text makes it "Make private", with no reload.
//
// One throwaway owner (a session in the local D1); the dev API's ADMIN_TOKEN from
// api/.dev.vars (never printed) reads the queue and approves. Everything made is deleted.
//
//   npm run dev:stack            (and npm run build:playground:dev after a change)
//   npx tsx project-docs/modules/verify/verify-2e-step5c.ts

import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

import puppeteer from 'puppeteer';

import type { Page } from 'puppeteer';

const PAGES_URL = 'http://localhost:3000';
const DEV_API = 'http://localhost:8787';
const OUT = 'project-docs/modules/verify';
const ADMIN_TOKEN = (readFileSync('api/.dev.vars', 'utf8').match(/^ADMIN_TOKEN=(.*)$/m)?.[1] ?? '').trim();
const pause = async (ms: number): Promise<void> => {
  await new Promise((r) => setTimeout(r, ms));
};

let failures = 0;
const check = (label: string, ok: boolean, detail?: unknown): void => {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${label}${ok ? '' : ` ${JSON.stringify(detail)?.slice(0, 700)}`}`);
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

const tag = randomUUID().slice(0, 8);
const OWNER = { id: `v2e5c-${tag}`, token: `v2e5c-${randomUUID()}`, handle: `v2e5c${tag}` };

async function api(admin: boolean, method: string, path: string, body?: unknown): Promise<Record<string, unknown>> {
  const url = admin ? `${DEV_API}${path}?token=${encodeURIComponent(ADMIN_TOKEN)}` : `${DEV_API}${path}`;
  const res = await fetch(url, {
    method,
    headers: { ...(admin ? {} : { Cookie: `pathogen_session=${OWNER.token}` }), 'Content-Type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  try {
    return { status: res.status, ...(JSON.parse(text) as Record<string, unknown>) };
  } catch {
    return { status: res.status, text };
  }
}

const MAIN = 'import { gear } from "./parts/gears.pathogen";\ndefine ViewBox(0, 0, 100, 100);\ngear(40);\n';
const GEARS = 'module;\n\nexport fn gear(r) {\n  circle(50, 50, r);\n}\n';
const FILES = { 'main.pathogen': { text: MAIN }, 'parts/gears.pathogen': { text: GEARS } };

/** The main's text in the review queue's entry for a workspace (a multi-file entry lists hashes; the admin reads the file). */
async function submittedMain(id: string): Promise<string | null> {
  const queue = await api(true, 'GET', '/admin/queue/review');
  const entry = (queue.entries as { workspaceId: string; files?: Record<string, { sha256: string }> }[]).find(
    (e) => e.workspaceId === id,
  );
  const sha = entry?.files?.['main.pathogen']?.sha256;
  if (!sha) return null;
  return (await api(true, 'GET', `/workspace/${id}/file/${sha}`)).text as string;
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

/** The breadcrumb's publish item: its words (without a note) and whether it's off. */
const publishItem = `const b = __deep('app-breadcrumb')?.shadowRoot?.querySelector('[data-action="toggle-publish"]');
  return b ? { label: b.querySelector('span')?.firstChild?.textContent?.trim() ?? '', disabled: b.disabled,
    note: b.querySelector('small')?.textContent ?? '' } : null;`;

async function openInEditor(page: Page, slug: string, id: string): Promise<void> {
  await page.goto(`${PAGES_URL}/workspace/${slug}--${id}`, { waitUntil: 'domcontentloaded' });
  await until(
    page,
    `const tabs = __deep('editor-tabs'); const tree = __deep('file-tree');
     return tabs?.active && tree && location.pathname.endsWith(${JSON.stringify(id)}) &&
       tree.shadowRoot.querySelectorAll('[data-path]').length > 1 ? 1 : null;`,
  );
}

/** Puts the cursor at the end of the editor's first line. */
async function endOfFirstLine(page: Page): Promise<void> {
  const point = await until<{ x: number; y: number }>(
    page,
    `const c = __deep('.cm-content'); if (!c) return null;
     const r = c.getBoundingClientRect(); return r.width ? { x: r.left + 60, y: r.top + 8 } : null;`,
  );
  if (!point) throw new Error('the editor never showed');
  await page.mouse.click(point.x, point.y);
  await page.keyboard.press('End');
}

async function save(page: Page): Promise<void> {
  await page.keyboard.down('Control');
  await page.keyboard.press('s');
  await page.keyboard.up('Control');
}

if (!ADMIN_TOKEN) throw new Error('api/.dev.vars has no ADMIN_TOKEN');
const now = Date.now();
d1(
  `INSERT INTO users (id, email, email_lower, handle, display_name, created_at, verified_at) VALUES ('${OWNER.id}', '${OWNER.id}@example.invalid', '${OWNER.id}@example.invalid', '${OWNER.handle}', '${OWNER.handle}', ${now}, ${now}); ` +
    `INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES ('${OWNER.token}', '${OWNER.id}', ${now}, ${now + 3_600_000});`,
);
const browser = await puppeteer.launch({ headless: true, args: ['--window-size=1440,900'] });
const made: string[] = [];
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  page.on('dialog', (d) => void d.accept());
  page.on('pageerror', (e) => console.log('PAGE ERROR', e.message));
  await page.setCookie({ name: 'pathogen_session', value: OWNER.token, domain: 'localhost', path: '/' });
  const toasts: string[] = [];
  await page.exposeFunction('__toast', (title: string) => toasts.push(title));
  await page.evaluateOnNewDocument(
    `document.addEventListener('show-toast', (e) => window.__toast(e.detail?.title ?? ''))`,
  );
  const puts: string[] = [];
  page.on('request', (r) => {
    if (r.method() === 'PUT' && /\/workspace\/[^/]+$/.test(new URL(r.url()).pathname)) {
      const body = r.postData() ?? '';
      puts.push(body.includes('"isPublic"') ? 'isPublic' : 'save');
    }
  });

  // ---- The breadcrumb's Make public, right after typing ----
  const first = await api(false, 'POST', '/workspace', {
    name: `Make public ${tag}`,
    files: FILES,
    folders: ['parts'],
    entryPoints: ['main.pathogen'],
  });
  const firstId = first.id as string;
  made.push(firstId);
  await openInEditor(page, first.slug as string, firstId);
  await endOfFirstLine(page);
  const typed = ' // typed just before Make public';
  await page.keyboard.type(typed, { delay: 5 });
  puts.length = 0;
  await ev(
    page,
    `__deep('app-breadcrumb').shadowRoot.querySelector('[data-action="toggle-publish"]').click(); return 1;`,
  );
  for (let i = 0; i < 100 && !toasts.includes('Thank you for sharing your workspace.'); i++) await pause(200);
  const main = await submittedMain(firstId);
  check(
    "breadcrumb: the edit is saved first, then submitted, and it's what's in the review queue",
    puts.join(',') === 'save,isPublic' && main === MAIN.replace('\n', `${typed}\n`),
    { puts, main, toasts },
  );
  check(
    'breadcrumb: the main, which imports a module, passed the check',
    toasts.includes('Thank you for sharing your workspace.'),
    toasts,
  );
  const pending = await until<{ label: string; disabled: boolean }>(
    page,
    `const p = (() => { ${publishItem} })(); return p?.label === 'Pending review' ? p : null;`,
  );
  check('breadcrumb: the menu says "Pending review", off', pending?.disabled === true, pending);

  // ---- The Workspaces page's Make Public ----
  const second = await api(false, 'POST', '/workspace', {
    name: `Workspaces page ${tag}`,
    files: FILES,
    folders: ['parts'],
    entryPoints: ['main.pathogen'],
  });
  const secondId = second.id as string;
  made.push(secondId);
  toasts.length = 0;
  await page.goto(`${PAGES_URL}/workspaces`, { waitUntil: 'domcontentloaded' });
  const item = `__deep('landing-view')?.shadowRoot?.querySelector('.workspace-item[data-id="${secondId}"] [data-action="toggle-publish"]')`;
  await until(page, `return ${item} ? 1 : null;`);
  await ev(page, `${item}.click(); return 1;`);
  for (let i = 0; i < 100 && toasts.length === 0; i++) await pause(200);
  check(
    'Workspaces page: a main that imports a module is submitted (before: "Workspace is empty.")',
    toasts.includes('Thank you for sharing your workspace.') && (await submittedMain(secondId)) === MAIN,
    toasts,
  );
  const listed = await until<{ text: string; disabled: boolean }>(
    page,
    `const b = ${item}; return b && b.textContent === 'Pending Review' ? { text: b.textContent, disabled: b.disabled } : null;`,
  );
  check('Workspaces page: its menu says "Pending Review", off', listed?.disabled === true, listed);
  await ev(
    page,
    `__deep('landing-view').shadowRoot.querySelector('.workspace-item[data-id="${secondId}"] .menu-btn').click(); return 1;`,
  );
  await pause(300);
  await page.screenshot({ path: `${OUT}/2e-step5c-workspaces-pending.png` });

  // ---- After approval, the menu follows each save ----
  const approved = await api(true, 'POST', `/admin/review/${firstId}`, { decision: 'approve' });
  check('the first workspace is approved', approved.status === 200, approved);
  await openInEditor(page, first.slug as string, firstId);
  const before = await until<{ label: string }>(
    page,
    `const p = (() => { ${publishItem} })(); return p?.label === 'Make private' ? p : null;`,
  );
  check('approved: the menu says "Make private"', !!before, before);
  await endOfFirstLine(page);
  const edit = ' // waiting';
  await page.keyboard.type(edit, { delay: 5 });
  await save(page);
  const NOTE = 'An edit is waiting for review';
  const waiting = await until<{ label: string; disabled: boolean; note: string }>(
    page,
    `const p = (() => { ${publishItem} })(); return p?.note === ${JSON.stringify(NOTE)} ? p : null;`,
  );
  check(
    `an edit saved: Make private, on, with "${NOTE}", with no reload (answer (a))`,
    waiting?.label === 'Make private' && waiting.disabled === false,
    waiting,
  );
  await ev(page, `__deep('app-breadcrumb').shadowRoot.querySelector('.menu-btn').click(); return 1;`);
  await pause(400);
  await page.screenshot({ path: `${OUT}/2e-step5c-make-private-waiting.png` });
  await ev(page, `__deep('app-breadcrumb').shadowRoot.querySelector('.menu-btn').click(); return 1;`);
  for (let i = 0; i < edit.length; i++) await page.keyboard.press('Backspace');
  await save(page);
  const back = await until<{ label: string; disabled: boolean; note: string }>(
    page,
    `const p = (() => { ${publishItem} })(); return p?.label === 'Make private' && !p.note ? p : null;`,
  );
  const queue = await api(true, 'GET', '/admin/queue/rereview');
  check(
    'back to the approved text: "Make private" with no note, and no re-review waits',
    !!back && !(queue.entries as { workspaceId: string }[]).some((e) => e.workspaceId === firstId),
    { back },
  );

  // ---- With an edit waiting, the Workspaces page's Make Private says so, and withdraws it ----
  await page.keyboard.type(edit, { delay: 5 });
  await save(page);
  await until(page, `const p = (() => { ${publishItem} })(); return p?.note ? 1 : null;`);
  toasts.length = 0;
  await page.goto(`${PAGES_URL}/workspaces`, { waitUntil: 'domcontentloaded' });
  const firstItem = `__deep('landing-view')?.shadowRoot?.querySelector('.workspace-item[data-id="${firstId}"] [data-action="toggle-publish"]')`;
  const card = await until<{ text: string }>(
    page,
    `const b = ${firstItem}; return b && b.querySelector('small') ? { text: b.textContent } : null;`,
  );
  check(`Workspaces page: Make Private with "${NOTE}"`, card?.text === `Make Private${NOTE}`, card);
  await ev(page, `${firstItem}.click(); return 1;`);
  for (let i = 0; i < 100 && !toasts.includes('Workspace is now private.'); i++) await pause(200);
  const withdrawn = await api(true, 'GET', '/admin/queue/rereview');
  const after = await until<{ text: string }>(
    page,
    `const b = ${firstItem}; return b && b.textContent === 'Make Public' ? { text: b.textContent } : null;`,
  );
  check(
    'its Make Private: private, the re-review withdrawn, and the card offers Make Public',
    !!after && !(withdrawn.entries as { workspaceId: string }[]).some((e) => e.workspaceId === firstId),
    { after, toasts },
  );
} finally {
  for (const id of made) await api(false, 'DELETE', `/workspace/${id}`);
  d1(`DELETE FROM sessions WHERE token = '${OWNER.token}'; DELETE FROM users WHERE id = '${OWNER.id}';`);
  await Promise.race([browser.close(), pause(10_000)]);
}

console.log(failures === 0 ? '\nall passed' : `\n${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
