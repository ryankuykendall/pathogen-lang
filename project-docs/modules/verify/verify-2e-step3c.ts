// 2e, step 3c (note 58): the snapshots page shows every file. Signed in on the
// dev stack (snapshots need a session), with snapshots made in the playground:
// - a snapshot drawn by demos/gears.pathogen: the code panel lists every file in
//   the tree's order and look, pathogen.json last, opening on that program; its
//   icon names and copies that file; the ↗ is hidden;
// - Export's legend lists that same program;
// - the breadcrumb: Start new workspace ("this snapshot's files") and Export…,
//   no Copy code;
// - Rename: the viewer's title follows at once;
// - ← and → in the list move between files, not snapshots; elsewhere they step;
// - a snapshot drawn by the main opens on the main;
// - a one-file snapshot: the code alone, "Copy main.pathogen";
// - a snapshot made before 2e (its manifest swapped in local R2 for the old
//   code.pathogen): the same, and Export's legend lists its code;
// - nothing above the panel pins its sheet to an ancestor; on a phone (390 px)
//   the list is a menu whose sheet sits at the window's bottom, and the
//   breadcrumb's actions fit on one line.
//
//   npm run dev:stack            (and npm run build:playground:dev after a change)
//   npx tsx project-docs/modules/verify/verify-2e-step3c.ts

import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';

import puppeteer from 'puppeteer';

import type { Page } from 'puppeteer';

const PAGES_URL = 'http://localhost:3000';
const DEV_API = 'http://localhost:8787';
const SHOTS = 'project-docs/modules/verify';
const USER_ID = `verify2e3c-${randomUUID().slice(0, 8)}`;
const TOKEN = `verify2e3c-${randomUUID()}`;
const COOKIE = `pathogen_session=${TOKEN}`;

const MAIN =
  'import { gear } from "./parts/gears.pathogen";\ndefine ViewBox(0, 0, 200, 100);\ngear(Point(100, 50), 40);\n';
const GEARS = 'module;\n\nexport fn gear(at, r) {\n  circle(at.x, at.y, r);\n}\n';
const DEMO =
  'import { gear } from "../parts/gears.pathogen";\ndefine ViewBox(0, 0, 300, 100);\ngear(Point(50, 50), 30);\ngear(Point(150, 50), 30);\n';
const ONE = 'define ViewBox(0, 0, 100, 100);\ncircle(50, 50, 30);\n';

let failures = 0;
const check = (label: string, ok: boolean, detail?: unknown): void => {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${label}${ok ? '' : ` ${JSON.stringify(detail)?.slice(0, 800)}`}`);
  if (!ok) failures++;
};

/**
 * The local dev stack's R2 bucket: wrangler dev binds the PREVIEW bucket
 * (api/wrangler.toml preview_bucket_name). Until 2026-11-16 this named the
 * production bucket, whose local copy the dev API never reads, so the swap
 * below changed nothing. And a scratch file for a put.
 */
const R2_BUCKET = 'svg-path-extended-thumbnails-preview';
const PRE2E_FILE = 'tmp/verify-2e-step3c-code.pathogen';

function r2(args: string[]): void {
  execFileSync('npx', ['wrangler', 'r2', ...args, '--local', '--persist-to=../.wrangler/state'], {
    cwd: 'api',
    stdio: ['pipe', 'pipe', 'inherit'],
  });
}

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
    headers: { Cookie: COOKIE, 'Content-Type': 'application/json', 'X-Pathogen-Snapshot': '1' },
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
  window.__mw = () => __deep('workspace-snapshots-view')?.shadowRoot.querySelector('mini-workspace');
  window.__sf = () => __mw()?.shadowRoot.querySelector('source-files');`;

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
const storeDo = async (page: Page, src: string): Promise<unknown> =>
  page.evaluate(`import('/state/store.js').then(({ store }) => { ${src} })`);

/** Snapshot what the preview shows, and return the new snapshot's id. */
async function snapshot(page: Page): Promise<string> {
  await poll(page, `const b = __deep('#snapshot-btn'); return b && !b.disabled ? 1 : null;`, 30_000);
  const before = await ev<number>(page, `return window.__made.length;`);
  await ev(page, `__deep('#snapshot-btn').click(); return 1;`);
  await poll(
    page,
    `return document.querySelector('snapshot-popover')?.shadowRoot.querySelector('[data-act=save]') ? 1 : null;`,
  );
  await ev(
    page,
    `document.querySelector('snapshot-popover').shadowRoot.querySelector('[data-act=save]').click(); return 1;`,
  );
  const id = await poll<string>(page, `return window.__made.length > ${before} ? window.__made[${before}] : null;`);
  await ev(page, `document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); return 1;`);
  return id ?? '';
}

/** Records each new snapshot's id from the upload's answer. */
const RECORD_SNAPSHOTS = `
  window.__made = [];
  const realFetch = window.fetch.bind(window);
  window.fetch = async (url, init) => {
    const res = await realFetch(url, init);
    if (String(url).endsWith('/snapshots') && init?.method === 'POST') {
      const id = (await res.clone().json().catch(() => null))?.snapshot?.id ?? null;
      if (id) window.__made.push(id);
    }
    return res;
  };`;

/** Open the snapshots page on snapshot n, the code open; resolves once the panel's editor shows. */
async function openSnapshot(page: Page, slugId: string, n: number): Promise<void> {
  await page.goto(`${PAGES_URL}/workspace/${slugId}/snapshots/${n}`, { waitUntil: 'domcontentloaded' });
  await poll(page, `return __sf() ? 1 : null;`);
  await ev(page, `__mw().setAttribute('code-open', ''); return 1;`);
  await poll(page, `return __sf()?.shadowRoot.querySelector('.cm-editor .cm-line') ? 1 : null;`);
  await pause(400);
}

const now = Date.now();
d1(
  `INSERT INTO users (id, email, email_lower, handle, display_name, created_at, verified_at) VALUES ('${USER_ID}', '${USER_ID}@example.invalid', '${USER_ID}@example.invalid', '${USER_ID}', 'Verify 2e3c', ${now}, ${now}); ` +
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
      name: 'Gears 2e3c',
      files: {
        'main.pathogen': { text: MAIN },
        'parts/gears.pathogen': { text: GEARS },
        'demos/gears.pathogen': { text: DEMO },
      },
      folders: ['spare'],
      entryPoints: ['main.pathogen', 'demos/gears.pathogen'],
    })
  ).json()) as { id: string; slug: string };
  made.push(created.id);
  const slugId = `${created.slug}--${created.id}`;
  const single = (await (
    await api('POST', '/workspace', { name: 'One 2e3c', files: { 'main.pathogen': { text: ONE } } })
  ).json()) as { id: string; slug: string };
  made.push(single.id);
  const singleSlugId = `${single.slug}--${single.id}`;

  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });
  page.on('pageerror', (e) => console.log('PAGE ERROR', e.message));
  await page.setCookie({ name: 'pathogen_session', value: TOKEN, domain: 'localhost', path: '/' });
  await page.evaluateOnNewDocument(() => localStorage.setItem('pathogen-theme', 'light'));
  await page.evaluateOnNewDocument(RECORD_SNAPSHOTS);

  // Two snapshots of the gears: the main's, then demos/gears.pathogen's.
  await page.goto(`${PAGES_URL}/workspace/${slugId}`, { waitUntil: 'domcontentloaded' });
  await poll(
    page,
    `return import('/state/store.js').then(({ store }) => store.get('renderedFiles') ? 1 : null);`,
    30_000,
  );
  const byMain = await snapshot(page);
  await storeDo(page, `store.set('shownProgram', 'demos/gears.pathogen');`);
  await ev(page, `__deep('#refresh-btn').click(); return 1;`);
  await poll(
    page,
    `return import('/state/store.js').then(({ store }) => store.get('renderedFiles')?.program === 'demos/gears.pathogen' ? 1 : null);`,
  );
  const byDemo = await snapshot(page);
  // And one of a one-file workspace.
  await page.goto(`${PAGES_URL}/workspace/${singleSlugId}`, { waitUntil: 'domcontentloaded' });
  await poll(
    page,
    `return import('/state/store.js').then(({ store }) => store.get('renderedFiles') ? 1 : null);`,
    30_000,
  );
  const byOne = await snapshot(page);
  check('three snapshots made in the playground', !!byMain && !!byDemo && !!byOne, { byMain, byDemo, byOne });

  const numberOf = async (workspaceId: string, id: string): Promise<number> => {
    const list = (await (await api('GET', `/workspace/${workspaceId}/snapshots`)).json()) as {
      snapshots: { id: string; n: number }[];
    };
    return list.snapshots.find((s) => s.id === id)?.n ?? 0;
  };
  const nMain = await numberOf(created.id, byMain);
  const nDemo = await numberOf(created.id, byDemo);
  const nOne = await numberOf(single.id, byOne);

  // ── Drawn by demos/gears.pathogen ────────────────────────────────────
  await openSnapshot(page, slugId, nDemo);
  const demo = await ev<Record<string, unknown>>(
    page,
    `const sf = __sf().shadowRoot;
     return {
       rows: [...sf.querySelectorAll('.list [data-path]')].map((r) => r.dataset.path),
       kinds: [...sf.querySelectorAll('.list .row.file')].map((r) => r.classList.contains('library') ? 'module' : 'program'),
       folders: [...sf.querySelectorAll('.list .row.folder')].map((r) => r.textContent.trim()),
       badges: sf.querySelectorAll('.badge-main').length,
       open: sf.querySelector('[aria-selected="true"]')?.dataset.path,
       path: sf.querySelector('.path .p')?.textContent,
       first: sf.querySelector('.cm-line')?.textContent,
       icon: sf.querySelector('.path .cp')?.getAttribute('aria-label'),
       linkHidden: __mw().shadowRoot.querySelector('.playground-link').hidden,
       barCopy: __mw().shadowRoot.querySelectorAll('#copy-btn').length,
     };`,
  );
  check(
    'demos/gears: every file in the tree’s order and look, pathogen.json last, opening on the program that drew it; the ↗ hidden',
    JSON.stringify(demo.rows) ===
      JSON.stringify(['demos/gears.pathogen', 'parts/gears.pathogen', 'main.pathogen', 'pathogen.json']) &&
      JSON.stringify(demo.kinds) === JSON.stringify(['program', 'module', 'program']) &&
      JSON.stringify(demo.folders) === JSON.stringify(['demos', 'parts', 'spare']) &&
      demo.badges === 0 &&
      demo.open === 'demos/gears.pathogen' &&
      demo.path === 'demos/gears.pathogen' &&
      demo.first === 'import { gear } from "../parts/gears.pathogen";' &&
      demo.icon === 'Copy demos/gears.pathogen' &&
      demo.linkHidden === true &&
      demo.barCopy === 0,
    demo,
  );
  await page.screenshot({ path: `${SHOTS}/2e-step3c-several-light.png` });

  await ev(page, `__sf().shadowRoot.querySelector('.path .cp').click(); return 1;`);
  await pause(300);
  const clip = (await page.evaluate(
    `navigator.clipboard.readText().catch((e) => 'read failed: ' + e.message)`,
  )) as string;
  const tip = await ev<string>(page, `return __sf().shadowRoot.querySelector('.tip')?.textContent ?? '';`);
  check('its icon copies that file, then says so', clip === DEMO && tip === 'Copied demos/gears.pathogen', {
    clip: clip.slice(0, 60),
    tip,
  });

  // Export's legend: the same program.
  await ev(
    page,
    `const m = __deep('workspace-snapshots-view').shadowRoot.querySelector('export-modal');
     const real = m.open.bind(m);
     m.open = (svg, state) => { window.__exportState = state; return real(svg, state); };
     return 1;`,
  );
  await ev(page, `__deep('[data-snapshot-action="export"]').click(); return 1;`);
  const legend = await poll<string>(page, `return window.__exportState?.code ?? null;`);
  check('Export’s legend lists the program that drew it', legend === DEMO, legend?.slice(0, 60));
  await ev(page, `document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); return 1;`);
  await pause(300);

  // The breadcrumb.
  const crumb = await ev<string[][]>(
    page,
    `return [...__deep('app-breadcrumb').shadowRoot.querySelectorAll('.controls-left button')].map((b) => [b.textContent.trim(), b.title]);`,
  );
  check(
    'the breadcrumb: Start new workspace (this snapshot’s files) and Export…, no Copy code',
    JSON.stringify(crumb) ===
      JSON.stringify([
        ['+ Start new workspace', "Create a new workspace with this snapshot's files"],
        ['Export…', 'Export this snapshot as SVG, PNG, or PDF'],
      ]),
    crumb,
  );

  // Rename: the viewer's title follows without choosing another snapshot.
  page.once('dialog', (d) => void d.accept('Gears, renamed'));
  await ev(page, `__deep('app-breadcrumb').shadowRoot.querySelector('.menu-btn').click(); return 1;`);
  await ev(
    page,
    `__deep('app-breadcrumb').shadowRoot.querySelector('[data-action="snapshot-rename"]').click(); return 1;`,
  );
  const renamed = await poll<string>(
    page,
    `const t = __mw()?.shadowRoot.querySelector('.mw-title')?.textContent; return t === 'Gears, renamed' ? t : null;`,
  );
  check('Rename: the viewer’s title follows at once', renamed === 'Gears, renamed', renamed);

  // ← and → in the list move between files; the page stays on this snapshot.
  const urlBefore = page.url();
  await ev(page, `__sf().shadowRoot.querySelector('[data-path="demos/gears.pathogen"]').focus(); return 1;`);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowDown');
  await pause(500);
  const inList = await ev<{ focused: string | null }>(
    page,
    `return { focused: __sf().shadowRoot.activeElement?.dataset.path ?? null };`,
  );
  check(
    '← and → in the list don’t step to another snapshot; ↓ moves to the next file',
    page.url() === urlBefore && inList.focused === 'parts/gears.pathogen',
    { url: page.url(), urlBefore, ...inList },
  );

  // Elsewhere, they step: → goes to the previous (older) snapshot, drawn by the main.
  await ev(page, `document.activeElement?.blur(); __sf().blur(); return 1;`);
  await page.keyboard.press('ArrowRight');
  const stepped = await poll<string>(
    page,
    `return location.pathname.endsWith('/snapshots/${nMain}') && __sf()?.shadowRoot.querySelector('.cm-line') ? location.pathname : null;`,
  );
  check('outside the list, → steps to the next snapshot', !!stepped, page.url());
  await pause(500);
  const main = await ev<Record<string, unknown>>(
    page,
    `const sf = __sf().shadowRoot;
     return { open: sf.querySelector('[aria-selected="true"]')?.dataset.path, first: sf.querySelector('.cm-line')?.textContent };`,
  );
  check(
    'a snapshot drawn by the main opens on the main (the code stays open)',
    main.open === 'main.pathogen' && main.first === 'import { gear } from "./parts/gears.pathogen";',
    main,
  );

  // Fixed-position traps from the page's panel up.
  const traps = await ev<string[]>(
    page,
    `const found = [];
     let node = __sf();
     while (node && node !== document.documentElement) {
       if (node.nodeType === 1) {
         const s = getComputedStyle(node);
         const t = [s.transform !== 'none' && 'transform', s.filter !== 'none' && 'filter',
           s.backdropFilter && s.backdropFilter !== 'none' && 'backdrop-filter', s.contain !== 'none' && 'contain',
           s.willChange !== 'auto' && 'will-change', s.containerType && s.containerType !== 'normal' && 'container-type'].filter(Boolean);
         if (t.length) found.push(node.localName + ': ' + t.join(','));
       }
       node = node.parentNode instanceof ShadowRoot ? node.parentNode.host : node.parentNode;
     }
     return found;`,
  );
  check('nothing above the panel pins its sheet to an ancestor', traps.length === 0, traps);

  // Dark.
  await page.evaluate(
    `document.documentElement.setAttribute('data-active-theme', 'dark'); document.documentElement.setAttribute('data-theme', 'dark')`,
  );
  await pause(400);
  await page.screenshot({ path: `${SHOTS}/2e-step3c-several-dark.png` });
  await page.evaluate(
    `document.documentElement.setAttribute('data-active-theme', 'light'); document.documentElement.setAttribute('data-theme', 'light')`,
  );

  // ── One file ─────────────────────────────────────────────────────────
  await openSnapshot(page, singleSlugId, nOne);
  const one = await ev<Record<string, unknown>>(
    page,
    `const sf = __sf().shadowRoot;
     return { list: !!sf.querySelector('.list'), path: !!sf.querySelector('.path'), icon: sf.querySelector('.float .cp')?.getAttribute('aria-label'), text: __sf().shownText };`,
  );
  check(
    'a one-file snapshot: the code alone, its icon naming main.pathogen',
    !one.list && !one.path && one.icon === 'Copy main.pathogen' && one.text === ONE,
    one,
  );
  await page.screenshot({ path: `${SHOTS}/2e-step3c-one-light.png` });

  // ── Made before 2e: no manifest, only code.pathogen (how every snapshot before phase 2 is stored) ──
  const prefix = `snapshots/${single.id}/${byOne}`;
  writeFileSync(PRE2E_FILE, ONE);
  r2(['object', 'delete', `${R2_BUCKET}/${prefix}/manifest.json`]);
  r2(['object', 'put', `${R2_BUCKET}/${prefix}/code.pathogen`, `--file=../${PRE2E_FILE}`]);
  const legacy = (await (await api('GET', `/snapshot/${byOne}/files`)).json()) as { files?: Record<string, unknown> };
  check(
    'the snapshot now reads as one made before 2e (no manifest, its code alone)',
    Object.keys(legacy.files ?? {}).join() === 'main.pathogen',
    legacy,
  );
  await openSnapshot(page, singleSlugId, nOne);
  const old = await ev<Record<string, unknown>>(
    page,
    `const sf = __sf().shadowRoot;
     return { list: !!sf.querySelector('.list'), path: !!sf.querySelector('.path'), icon: sf.querySelector('.float .cp')?.getAttribute('aria-label'), text: __sf().shownText };`,
  );
  await ev(
    page,
    `const m = __deep('workspace-snapshots-view').shadowRoot.querySelector('export-modal');
     const real = m.open.bind(m);
     m.open = (svg, state) => { window.__exportState = state; return real(svg, state); };
     return 1;`,
  );
  await ev(page, `__deep('[data-snapshot-action="export"]').click(); return 1;`);
  const oldLegend = await poll<string>(page, `return window.__exportState?.code ?? null;`);
  await ev(page, `document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); return 1;`);
  check(
    'a snapshot made before 2e: the code alone, "Copy main.pathogen", and Export’s legend lists it',
    !old.list && !old.path && old.icon === 'Copy main.pathogen' && old.text === ONE && oldLegend === ONE,
    { ...old, oldLegend },
  );

  // ── A phone ──────────────────────────────────────────────────────────
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await openSnapshot(page, slugId, nDemo);
  await pause(400);
  const phone = await ev<Record<string, unknown>>(
    page,
    `const sf = __sf().shadowRoot;
     const bc = __deep('app-breadcrumb').shadowRoot;
     // Their middles: the ⋮ is a little taller than the two buttons beside it.
     const middles = [...bc.querySelectorAll('[data-snapshot-action], .menu-btn')].map((b) => {
       const r = b.getBoundingClientRect();
       return Math.round(r.top + r.height / 2);
     });
     return { menu: sf.querySelector('.menu .p')?.textContent, list: !!sf.querySelector('.list'), middles };`,
  );
  const middles = phone.middles as number[];
  check(
    'phone: the list is a menu on the program that drew it; the breadcrumb’s actions on one line',
    phone.menu === 'demos/gears.pathogen' &&
      !phone.list &&
      middles.length === 3 &&
      Math.max(...middles) - Math.min(...middles) <= 2,
    phone,
  );
  await ev(page, `__sf().shadowRoot.querySelector('.menu').click(); return 1;`);
  await pause(300);
  const sheet = await ev<{ bottom: number; height: number; rows: number } | null>(
    page,
    `const s = __sf().shadowRoot.querySelector('.sheet');
     if (!s) return null;
     const r = s.getBoundingClientRect();
     return { bottom: Math.round(r.bottom), height: window.innerHeight, rows: s.querySelectorAll('[data-path]').length };`,
  );
  check(
    'phone: the menu opens the files as a sheet at the window’s bottom',
    !!sheet && sheet.bottom === sheet.height && sheet.rows === 4,
    sheet,
  );
  await page.screenshot({ path: `${SHOTS}/2e-step3c-phone-sheet-light.png` });
} finally {
  await browser.close();
  for (const id of made) await api('DELETE', `/workspace/${id}`);
  d1(`DELETE FROM sessions WHERE user_id = '${USER_ID}'; DELETE FROM users WHERE id = '${USER_ID}';`);
}

console.log(failures === 0 ? '\nall passed' : `\n${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
