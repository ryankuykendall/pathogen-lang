// 2e step 4 (58-phase-2e-plan.md): copies and forks, on the dev stack (localhost:3000 and
// :8787), in full Chrome.
// - Copy Workspace (the owner's): an edit typed just before it is in the copy; the copy
//   has every file, the empty folder, the programs' order and a main that isn't
//   main.pathogen, the form's name and description; it opens on its main; it's private
//   and unpublished.
// - Duplicate on the Workspaces page: the same copy.
// - Open as new workspace, by a second user, of an approved workspace with an edit
//   waiting for review: the new workspace holds the approved files, not the edit, and
//   opens on its main.
// - Someone else's public workspace: no Copy Workspace in the menu.
// - The copy form, light and dark (screenshots in project-docs/modules/verify/).
//
// Two throwaway users (sessions in the local D1) and the dev API's ADMIN_TOKEN from
// api/.dev.vars (never printed) to approve. Everything made is deleted.
//
//   npm run dev:stack            (and npm run build:playground:dev after a change)
//   npx tsx project-docs/modules/verify/verify-2e-step4.ts

import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

import puppeteer from 'puppeteer';

import type { BrowserContext, Page } from 'puppeteer';

const PAGES_URL = 'http://localhost:3000';
const DEV_API = 'http://localhost:8787';
const OUT = 'project-docs/modules/verify';
const ADMIN_TOKEN = (readFileSync('api/.dev.vars', 'utf8').match(/^ADMIN_TOKEN=(.*)$/m)?.[1] ?? '').trim();
const pause = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

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

interface User {
  id: string;
  token: string;
  handle: string;
}
const user = (label: string): User => {
  const tag = randomUUID().slice(0, 8);
  return { id: `v2e4${label}-${tag}`, token: `v2e4${label}-${randomUUID()}`, handle: `v2e4${label}${tag}` };
};
const A = user('a');
const B = user('b');

async function api(who: User | null, method: string, path: string, body?: unknown): Promise<Record<string, unknown>> {
  const url = who === null ? `${DEV_API}${path}?token=${encodeURIComponent(ADMIN_TOKEN)}` : `${DEV_API}${path}`;
  const res = await fetch(url, {
    method,
    headers: { ...(who ? { Cookie: `pathogen_session=${who.token}` } : {}), 'Content-Type': 'application/json' },
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

const MAIN =
  'import { gear } from "./parts/gears.pathogen";\ndefine ViewBox(0, 0, 200, 100);\ngear(Point(55, 50), 40);\n';
const GEARS = 'module;\n\nexport fn gear(at, r) {\n  circle(at.x, at.y, r);\n}\n';
const DEMO =
  'import { gear } from "../parts/gears.pathogen";\ndefine ViewBox(0, 0, 300, 110);\ngear(Point(50, 50), 34);\n';
const FILES = {
  'main.pathogen': { text: MAIN },
  'parts/gears.pathogen': { text: GEARS },
  'demos/gears.pathogen': { text: DEMO },
};
const FOLDERS = ['parts', 'demos', 'empty'];
// The main is demos/gears.pathogen: the first of the list.
const ENTRY_POINTS = ['demos/gears.pathogen', 'main.pathogen'];
const textsOf = (data: Record<string, unknown>): Record<string, string> =>
  Object.fromEntries(
    Object.entries((data.files ?? {}) as Record<string, { text: string }>).map(([p, f]) => [p, f.text]),
  );

/** The copy form: wait for it, optionally change its description, submit; the new workspace's id. */
async function submitCopyForm(page: Page, description?: string, shot?: string): Promise<string | null> {
  const form = await until<{ title: string; name: string; description: string; template: boolean }>(
    page,
    `const v = __deep('new-workspace-view'); const r = v?.shadowRoot; const n = r?.querySelector('[name="name"]');
     return n && n.value ? { title: r.querySelector('h1').textContent, name: n.value,
       description: r.querySelector('[name="description"]').value, template: !!r.querySelector('[name="template"]') } : null;`,
  );
  // Recorded first, so a form that never shows reads as null rather than the last one.
  (submitCopyForm as unknown as { last: typeof form }).last = form;
  if (!form) return null;
  if (shot) await page.screenshot({ path: shot });
  if (description !== undefined) {
    await ev(
      page,
      `const f = __deep('new-workspace-view').shadowRoot.querySelector('[name="description"]');
       f.value = ${JSON.stringify(description)}; f.dispatchEvent(new Event('input', { bubbles: true })); return 1;`,
    );
  }
  const before = page.url();
  await ev(page, `__deep('new-workspace-view').shadowRoot.querySelector('.primary-btn').click(); return 1;`);
  for (let i = 0; i < 100 && (page.url() === before || page.url().includes('/workspace/new')); i++) await pause(200);
  return /--([^/?#]+)$/.exec(new URL(page.url()).pathname)?.[1] ?? null;
}
const lastForm = (): { title: string; name: string; description: string; template: boolean } =>
  (submitCopyForm as unknown as { last: { title: string; name: string; description: string; template: boolean } }).last;

/** The workspace view's open file and tree, once it has loaded `id`. */
async function opened(page: Page, id: string): Promise<{ open: string; tree: string[] } | null> {
  return until(
    page,
    `const ws = __deep('workspace-view'); if (!ws) return null;
     const tree = __deep('file-tree'); const tabs = __deep('editor-tabs');
     if (!tree || !tabs || !location.pathname.endsWith(${JSON.stringify(id)})) return null;
     const rows = [...tree.shadowRoot.querySelectorAll('[data-path]')].map((r) => r.dataset.path);
     return tabs.active && rows.length ? { open: tabs.active, tree: rows } : null;`,
  );
}

if (!ADMIN_TOKEN) throw new Error('api/.dev.vars has no ADMIN_TOKEN');
const now = Date.now();
d1(
  [A, B]
    .map(
      (u) =>
        `INSERT INTO users (id, email, email_lower, handle, display_name, created_at, verified_at) VALUES ('${u.id}', '${u.id}@example.invalid', '${u.id}@example.invalid', '${u.handle}', '${u.handle}', ${now}, ${now}); ` +
        `INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES ('${u.token}', '${u.id}', ${now}, ${now + 3_600_000});`,
    )
    .join(' '),
);
const browser = await puppeteer.launch({ headless: true, args: ['--window-size=1440,900'] });
const made: { who: User; id: string }[] = [];
try {
  const pageFor = async (who: User, context: BrowserContext): Promise<Page> => {
    const page = await context.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    page.on('dialog', (d) => void d.accept());
    page.on('pageerror', (e) => console.log('PAGE ERROR', e.message));
    await page.setCookie({ name: 'pathogen_session', value: who.token, domain: 'localhost', path: '/' });
    return page;
  };
  const pageA = await pageFor(A, browser.defaultBrowserContext());

  // ---- Copy Workspace, the owner's ----
  const original = await api(A, 'POST', '/workspace', {
    name: 'Step4 Gears',
    description: 'Original',
    files: FILES,
    folders: FOLDERS,
    entryPoints: ENTRY_POINTS,
  });
  const originalId = original.id as string;
  made.push({ who: A, id: originalId });
  await pageA.goto(`${PAGES_URL}/workspace/${original.slug as string}--${originalId}`, {
    waitUntil: 'domcontentloaded',
  });
  const first = await opened(pageA, originalId);
  check('the original opens on its main, demos/gears.pathogen', first?.open === 'demos/gears.pathogen', first);
  // Type an edit, and copy at once: no waiting for the autosave.
  const point = await until<{ x: number; y: number }>(
    pageA,
    `const c = __deep('.cm-content'); if (!c) return null;
     const r = c.getBoundingClientRect(); return r.width ? { x: r.left + 60, y: r.top + 8 } : null;`,
  );
  if (!point) throw new Error('the editor never showed');
  await pageA.mouse.click(point.x, point.y);
  await pageA.keyboard.press('End');
  await pageA.keyboard.type(' // typed just before copying', { delay: 5 });
  await ev(
    pageA,
    `__deep('app-breadcrumb').shadowRoot.querySelector('[data-action="copy-workspace"]').click(); return 1;`,
  );
  const copyId = await submitCopyForm(pageA, 'My copy', `${OUT}/2e-step4-copy-form-light.png`);
  const form = lastForm();
  check(
    'the copy form: Copy Workspace, "(Copy)" after the name, the description, no starting template',
    form.title === 'Copy Workspace' &&
      form.name === 'Step4 Gears (Copy)' &&
      form.description === 'Original' &&
      !form.template,
    form,
  );
  check('Create Copy opens a new workspace', !!copyId && copyId !== originalId, pageA.url());
  if (copyId) {
    made.push({ who: A, id: copyId });
    const copy = await api(A, 'GET', `/workspace/${copyId}`);
    const texts = textsOf(copy);
    check(
      'the copy holds every file, with the edit typed just before Copy Workspace',
      Object.keys(texts).sort().join() === Object.keys(FILES).sort().join() &&
        texts['demos/gears.pathogen']?.includes('// typed just before copying') &&
        texts['main.pathogen'] === MAIN,
      texts,
    );
    check(
      // A workspace lists only the folders no file implies: here, `empty`.
      "the copy keeps the empty folder and the programs' order (its main isn't main.pathogen)",
      JSON.stringify(copy.folders) === JSON.stringify(original.folders) &&
        (copy.folders as string[]).includes('empty') &&
        JSON.stringify(copy.entryPoints) === JSON.stringify(ENTRY_POINTS),
      { folders: copy.folders, originalFolders: original.folders, entryPoints: copy.entryPoints },
    );
    check(
      "the copy takes the form's name and description, and is private and unpublished",
      copy.name === 'Step4 Gears (Copy)' &&
        copy.description === 'My copy' &&
        copy.isPublic === false &&
        (copy.publicationState === undefined || copy.publicationState === 'unpublished') &&
        !copy.rereviewPending,
      { name: copy.name, description: copy.description, isPublic: copy.isPublic, state: copy.publicationState },
    );
    const copyOpened = await opened(pageA, copyId);
    check(
      'the copy opens on its main, and its tree shows the empty folder',
      copyOpened?.open === 'demos/gears.pathogen' && copyOpened.tree.includes('empty'),
      copyOpened,
    );
    const originalNow = await api(A, 'GET', `/workspace/${originalId}`);
    check(
      'the original keeps its name and description',
      originalNow.description === 'Original' && originalNow.name === 'Step4 Gears',
      {
        name: originalNow.name,
        description: originalNow.description,
      },
    );
  }

  // ---- Duplicate, on the Workspaces page ----
  await pageA.goto(`${PAGES_URL}/workspaces`, { waitUntil: 'domcontentloaded' });
  const listed = await until<boolean>(
    pageA,
    `return !!__deep('landing-view')?.shadowRoot.querySelector('.menu-btn[data-id="${originalId}"]');`,
  );
  check('the Workspaces page lists the original', !!listed);
  await ev(
    pageA,
    `__deep('landing-view').shadowRoot.querySelector('.menu-btn[data-id="${originalId}"]').click(); return 1;`,
  );
  await pause(300);
  await ev(
    pageA,
    `__deep('landing-view').shadowRoot.querySelector('.menu-dropdown.open [data-action="copy"]').click(); return 1;`,
  );
  const duplicateId = await submitCopyForm(pageA);
  if (duplicateId) {
    made.push({ who: A, id: duplicateId });
    const duplicate = await api(A, 'GET', `/workspace/${duplicateId}`);
    check(
      "Duplicate copies every file, the folders and the main, with the original's description",
      Object.keys(textsOf(duplicate)).length === 3 &&
        JSON.stringify(duplicate.entryPoints) === JSON.stringify(ENTRY_POINTS) &&
        (duplicate.folders as string[]).includes('empty') &&
        duplicate.description === 'Original',
      {
        files: Object.keys(textsOf(duplicate)),
        entryPoints: duplicate.entryPoints,
        description: duplicate.description,
      },
    );
  } else {
    check('Duplicate opens a new workspace', false, pageA.url());
  }

  // ---- Open as new workspace, by someone else ----
  const published = await api(A, 'POST', '/workspace', {
    name: 'Step4 Published',
    description: 'Approved',
    files: FILES,
    folders: FOLDERS,
    entryPoints: ENTRY_POINTS,
  });
  const publishedId = published.id as string;
  made.push({ who: A, id: publishedId });
  await api(null, 'POST', `/admin/requeue/${publishedId}`, {});
  const approved = await api(null, 'POST', `/admin/review/${publishedId}`, {
    decision: 'approve',
    svg: '<svg xmlns="http://www.w3.org/2000/svg"/>',
  });
  const slug = approved.slug as string;
  check('the second workspace is approved', approved.status === 200 && !!slug, approved);
  // An edit after approval, waiting for review: a fork mustn't carry it.
  const edited = await api(A, 'PUT', `/workspace/${publishedId}`, {
    files: { ...FILES, 'main.pathogen': { text: `${MAIN}// edited after approval\n` } },
    folders: FOLDERS,
    entryPoints: ENTRY_POINTS,
  });
  check('an edit after approval is saved (re-review waiting)', edited.status === 200, edited.status);

  const contextB = await browser.createBrowserContext();
  const pageB = await pageFor(B, contextB);
  await pageB.goto(`${PAGES_URL}/u/${A.handle}/${slug}`, { waitUntil: 'domcontentloaded' });
  const cta = await pageB.$('a.detail-cta');
  const ctaText = cta ? await cta.evaluate((a) => a.textContent?.trim() ?? '') : '';
  check('the public page offers B "Open as new workspace"', ctaText.startsWith('Open as new workspace'), ctaText);
  await cta?.click();
  await pageB.waitForNavigation({ waitUntil: 'domcontentloaded' }).catch(() => undefined);
  const forkId = await submitCopyForm(pageB);
  const forkForm = lastForm();
  check(
    'the fork form reads as a copy: Copy Workspace, "(Copy)" after the name, no starting template',
    forkForm?.title === 'Copy Workspace' && forkForm.name === 'Step4 Published (Copy)' && !forkForm.template,
    forkForm,
  );
  if (forkId) {
    made.push({ who: B, id: forkId });
    const fork = await api(B, 'GET', `/workspace/${forkId}`);
    const texts = textsOf(fork);
    check(
      "the fork holds the approved files, not the edit waiting for review, and is B's",
      texts['main.pathogen'] === MAIN &&
        texts['demos/gears.pathogen'] === DEMO &&
        texts['parts/gears.pathogen'] === GEARS &&
        fork.userId === B.id,
      { texts, userId: fork.userId },
    );
    check(
      "the fork keeps the empty folder and the programs' order",
      (fork.folders as string[]).includes('empty') && JSON.stringify(fork.entryPoints) === JSON.stringify(ENTRY_POINTS),
      { folders: fork.folders, entryPoints: fork.entryPoints },
    );
    const forkOpened = await opened(pageB, forkId);
    check('the fork opens on its main', forkOpened?.open === 'demos/gears.pathogen', forkOpened);
  } else {
    check('Open as new workspace makes a workspace', false, pageB.url());
  }

  // ---- Someone else's public workspace: no Copy Workspace ----
  await pageB.goto(`${PAGES_URL}/workspace/${slug}--${publishedId}`, { waitUntil: 'domcontentloaded' });
  const menu = await until<{ copy: boolean; svg: boolean }>(
    pageB,
    `const r = __deep('app-breadcrumb')?.shadowRoot; const svg = r?.querySelector('[data-action="copy-svg"]');
     return svg && __deep('file-tree') ? { copy: !!r.querySelector('[data-action="copy-workspace"]'), svg: true } : null;`,
  );
  check("someone else's public workspace: the menu has no Copy Workspace", menu?.copy === false, menu);

  // ---- The copy form in dark ----
  await pageA.evaluate(`localStorage.setItem('pathogen-theme', 'dark')`);
  await pageA.goto(`${PAGES_URL}/workspace/new?copyFrom=${originalId}`, { waitUntil: 'domcontentloaded' });
  await until(pageA, `return __deep('new-workspace-view')?.shadowRoot.querySelector('[name="name"]')?.value || null;`);
  await pause(500);
  await pageA.screenshot({ path: `${OUT}/2e-step4-copy-form-dark.png` });
  await pageA.evaluate(`localStorage.setItem('pathogen-theme', 'light')`);
} finally {
  for (const { who, id } of made) await api(who, 'DELETE', `/workspace/${id}`);
  d1(
    [A, B]
      .map((u) => `DELETE FROM sessions WHERE user_id = '${u.id}'; DELETE FROM users WHERE id = '${u.id}';`)
      .join(' '),
  );
  await Promise.race([browser.close(), pause(10_000)]);
}

console.log(failures === 0 ? '\nall passed' : `\n${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
