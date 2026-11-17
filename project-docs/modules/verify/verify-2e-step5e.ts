// 2e step 5e, piece 3 (mockups v12 R1 to R6): the review screen reads each queue entry's
// source. On the dev stack (localhost:3000 and :8787), in full Chrome, as the seed admin.
// - Pending review: a card of several files shows the main's drawing, compiled with its
//   imports, and counts the files; one file looks as before; files that can't be read
//   are said on the card, with Approve off and Reject on.
// - The modal: the drawing and every file, opening on the main, the ↗ hidden; the file
//   being read survives the screen redrawing behind it; a lost entry is said in place.
// - Re-review: the card's line and the modal's box say what changed; the box's lines
//   open their files.
// - Approve sends the version it saw: a save since is refused and the tab reloads; the
//   version waiting then is approved, with its drawing.
// - Light and dark screenshots of the queue and the modal.
//
// One throwaway owner and the seed admin (admin@seed.pathogen.studio, in the dev
// ADMIN_EMAILS) with a throwaway session. The ADMIN_TOKEN comes from api/.dev.vars
// (never printed). Everything made is deleted.
//
//   npm run dev:stack            (and npm run build:playground:dev after a change)
//   npx tsx project-docs/modules/verify/verify-2e-step5e.ts

import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

import puppeteer from 'puppeteer';

import type { Page } from 'puppeteer';

const PAGES_URL = 'http://localhost:3000';
const DEV_API = 'http://localhost:8787';
const OUT = 'project-docs/modules/verify';
const ADMIN_TOKEN = (readFileSync('api/.dev.vars', 'utf8').match(/^ADMIN_TOKEN=(.*)$/m)?.[1] ?? '').trim();
const SEED_ADMIN_EMAIL = 'admin@seed.pathogen.studio';
const pause = async (ms: number): Promise<void> => {
  await new Promise((r) => setTimeout(r, ms));
};

let failures = 0;
const check = (label: string, ok: boolean, detail?: unknown): void => {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${label}${ok ? '' : ` ${JSON.stringify(detail)?.slice(0, 900)}`}`);
  if (!ok) failures++;
};

function wrangler(args: string[]): string {
  return execFileSync('npx', ['wrangler', ...args], { cwd: 'api', stdio: ['pipe', 'pipe', 'inherit'] }).toString();
}
const d1 = (sql: string): string =>
  wrangler([
    'd1',
    'execute',
    'svg-path-extended-users',
    '--local',
    '--persist-to=../.wrangler/state',
    '--command',
    sql,
    '--json',
  ]);

const tag = randomUUID().slice(0, 8);
const OWNER = { id: `v2e5e-${tag}`, token: `v2e5e-${randomUUID()}`, handle: `v2e5e${tag}` };
const ADMIN_SESSION = `v2e5e-admin-${randomUUID()}`;

async function api(
  who: 'owner' | 'admin-token',
  method: string,
  path: string,
  body?: unknown,
): Promise<Record<string, unknown>> {
  const url =
    who === 'admin-token' ? `${DEV_API}${path}?token=${encodeURIComponent(ADMIN_TOKEN)}` : `${DEV_API}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      ...(who === 'owner' ? { Cookie: `pathogen_session=${OWNER.token}` } : {}),
      'Content-Type': 'application/json',
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, ...((await res.json().catch(() => ({}))) as Record<string, unknown>) };
}

const MAIN =
  'import { gear } from "./parts/gears.pathogen";\ndefine ViewBox(0, 0, 200, 100);\ngear(Point(55, 50), 40);\ngear(Point(140, 50), 30);\n';
const GEARS = 'module;\n\nexport fn gear(at, r) {\n  circle(at.x, at.y, r);\n  circle(at.x, at.y, r / 3);\n}\n';
const SIZES =
  'import { gear } from "./parts/gears.pathogen";\ndefine ViewBox(0, 0, 120, 120);\ngear(Point(60, 60), 50);\n';
const SPRINGS = 'module;\n\nexport fn spring(at) {\n  circle(at.x, at.y, 4);\n}\n';
const SEVERAL = {
  files: {
    'main.pathogen': { text: MAIN },
    'parts/gears.pathogen': { text: GEARS },
    'try-sizes.pathogen': { text: SIZES },
  },
  folders: ['parts'],
  entryPoints: ['main.pathogen', 'try-sizes.pathogen'],
};

const DEEP = `
  window.__deep = (sel, root = document) => {
    const found = root.querySelector(sel);
    if (found) return found;
    for (const el of root.querySelectorAll('*')) {
      if (el.shadowRoot) { const f = window.__deep(sel, el.shadowRoot); if (f) return f; }
    }
    return null;
  };
  window.__view = () => __deep('admin-moderation-view');
  window.__q = (sel) => __view()?.shadowRoot.querySelector(sel);
  window.__card = (id) => __q('[data-action="approve"][data-id="' + id + '"]')?.closest('.card')
    ?? __q('[data-action="reject-start"][data-id="' + id + '"]')?.closest('.card');
  window.__mw = () => __q('.modal-main mini-workspace');
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

async function shoot(page: Page, selector: string, file: string): Promise<void> {
  const box = await ev<{ x: number; y: number; width: number; height: number } | null>(
    page,
    `const r = __q(${JSON.stringify(selector)})?.getBoundingClientRect();
     return r ? { x: r.left, y: r.top, width: r.width, height: r.height } : null;`,
  );
  if (box) await page.screenshot({ path: `${OUT}/${file}`, clip: box });
}

if (!ADMIN_TOKEN) throw new Error('api/.dev.vars has no ADMIN_TOKEN');
const now = Date.now();
const seedAdmin = (
  JSON.parse(d1(`SELECT id FROM users WHERE email_lower = '${SEED_ADMIN_EMAIL}'`)) as { results: { id: string }[] }[]
)[0].results[0];
const adminId = seedAdmin?.id ?? `v2e5e-admin-${tag}`;
d1(
  `INSERT INTO users (id, email, email_lower, handle, display_name, created_at, verified_at) VALUES ('${OWNER.id}', '${OWNER.id}@example.invalid', '${OWNER.id}@example.invalid', '${OWNER.handle}', '${OWNER.handle}', ${now}, ${now}); ` +
    (seedAdmin
      ? ''
      : `INSERT INTO users (id, email, email_lower, handle, display_name, created_at, verified_at) VALUES ('${adminId}', '${SEED_ADMIN_EMAIL}', '${SEED_ADMIN_EMAIL}', 'v2e5eadmin${tag}', 'Admin', ${now}, ${now}); `) +
    `INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES ('${OWNER.token}', '${OWNER.id}', ${now}, ${now + 3_600_000}); ` +
    `INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES ('${ADMIN_SESSION}', '${adminId}', ${now}, ${now + 3_600_000});`,
);

const made: string[] = [];
async function workspace(name: string, body: Record<string, unknown>, submit = true): Promise<string> {
  const created = await api('owner', 'POST', '/workspace', { name, ...body });
  const id = created.id as string;
  made.push(id);
  if (submit) await api('owner', 'POST', `/workspace/${id}/submit-for-review`);
  return id;
}

const browser = await puppeteer.launch({ headless: true, args: ['--window-size=1440,900'] });
try {
  // Pending review: several files; one file; several files, one of them lost.
  const gears = await workspace(`Gears ${tag}`, SEVERAL);
  const rings = await workspace(`Four rings ${tag}`, {
    files: { 'main.pathogen': { text: 'define ViewBox(0, 0, 100, 100);\ncircle(50, 50, 30);\n' } },
  });
  const spirals = await workspace(`Spirals ${tag}`, SEVERAL);
  // Files are stored under each workspace's own prefix: deleting this one touches no other.
  const lostSha = ((await api('owner', 'GET', `/workspace/${spirals}`)).files as Record<string, { sha256: string }>)[
    'parts/gears.pathogen'
  ].sha256;
  wrangler([
    'r2',
    'object',
    'delete',
    `svg-path-extended-thumbnails-preview/files/${spirals}/${lostSha}`,
    '--local',
    '--persist-to=../.wrangler/state',
  ]);

  // Re-review: approved, then edited (a module changed, one new, a program removed).
  const edited = await workspace(`Gears again ${tag}`, SEVERAL);
  check(
    'the re-review workspace is approved',
    (await api('admin-token', 'POST', `/admin/review/${edited}`, { decision: 'approve' })).status === 200,
  );
  await api('owner', 'PUT', `/workspace/${edited}`, {
    files: {
      'main.pathogen': { text: MAIN },
      'parts/gears.pathogen': { text: GEARS.replace('r / 3', 'r / 2') },
      'parts/springs.pathogen': { text: SPRINGS },
    },
    folders: ['parts'],
    entryPoints: ['main.pathogen'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  page.on('dialog', (d) => void d.accept());
  page.on('pageerror', (e) => console.log('PAGE ERROR', e.message));
  await page.setCookie({ name: 'pathogen_session', value: ADMIN_SESSION, domain: 'localhost', path: '/' });

  for (const theme of ['light', 'dark'] as const) {
    await page.goto(`${PAGES_URL}/`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(`localStorage.setItem('pathogen-theme', '${theme}')`);
    await page.goto(`${PAGES_URL}/admin/moderation`, { waitUntil: 'domcontentloaded' });

    // ---- R1: Pending review ----
    const cards = await until<{
      gears: { files: string; d: string; approve: boolean };
      rings: { files: string | null; d: string };
      spirals: { why: string; approve: boolean; title: string; reject: boolean };
    }>(
      page,
      `const g = __card('${gears}'), r = __card('${rings}'), s = __card('${spirals}');
       if (!g || !r || !s) return null;
       const gd = g.querySelector('.thumb svg path')?.getAttribute('d') ?? '';
       const rd = r.querySelector('.thumb svg path')?.getAttribute('d') ?? '';
       const sa = s.querySelector('[data-action="approve"]');
       if (!gd || !rd || !s.querySelector('.why')) return null;
       return {
         gears: { files: g.querySelector('.card-meta .files')?.textContent, d: gd, approve: g.querySelector('[data-action="approve"]').disabled },
         rings: { files: r.querySelector('.card-meta .files')?.textContent ?? null, d: rd },
         spirals: { why: s.querySelector('.why').textContent, approve: sa.disabled, title: sa.title,
           reject: s.querySelector('[data-action="reject-start"]').disabled },
       };`,
      60_000,
    );
    if (theme === 'light') {
      check(
        "several files: the main's drawing with its imports (two gears, four circles), the files counted, Approve on",
        cards?.gears.files === '4 files' && (cards.gears.d.match(/M/g) ?? []).length === 4 && !cards.gears.approve,
        cards?.gears,
      );
      check('one file: no count, its drawing', cards?.rings.files === null && cards.rings.d.length > 0, cards?.rings);
      check(
        "files that can't be read: said on the card, Approve off with the reason, Reject on",
        cards?.spirals.why ===
          'The submitted files couldn’t be read, so there’s nothing to review. Approve is off until they load: refresh to try again.' &&
          cards.spirals.approve &&
          cards.spirals.title === 'Approve needs the files, and they couldn’t be read' &&
          !cards.spirals.reject,
        cards?.spirals,
      );
    }
    await shoot(page, '.content', `2e-step5e-queue-${theme}.png`);

    // ---- R2: the modal on several files ----
    await ev(page, `__card('${gears}').querySelector('[data-action="review"]').click(); return 1;`);
    const modal = await until<{ open: string; hidden: boolean; rows: string[]; drawn: boolean }>(
      page,
      `const sf = __sf(); if (!sf?.shadowRoot.querySelector('.cm-editor .cm-line')) return null;
       return { open: sf.open ?? '', hidden: __mw().hasAttribute('hide-playground-link'),
         rows: [...sf.shadowRoot.querySelectorAll('.row.file, .row.project')].map((r) => r.dataset.path),
         drawn: Boolean(__mw().querySelector('svg path')) };`,
    );
    if (theme === 'light') {
      check(
        'the modal: the drawing and every file, opening on the main, the ↗ hidden',
        modal?.open === 'main.pathogen' &&
          modal.hidden &&
          modal.drawn &&
          JSON.stringify(modal.rows) ===
            JSON.stringify(['parts/gears.pathogen', 'main.pathogen', 'try-sizes.pathogen', 'pathogen.json']),
        modal,
      );
      // The admin reads the module; the screen behind redraws (a thumbnail finishing).
      await ev(
        page,
        `__sf().shadowRoot.querySelector('.row.file[data-path="parts/gears.pathogen"]').click(); return 1;`,
      );
      await ev(page, `window.__keep = __mw(); return 1;`);
      await ev(page, `__view().render(); __view().render(); return 1;`);
      const kept = await until<{ same: boolean; shown: string }>(
        page,
        `return { same: __mw() === window.__keep, shown: __sf().shownText };`,
      );
      check(
        'the file being read survives the screen redrawing behind the modal',
        kept?.same === true && kept.shown === GEARS,
        kept,
      );
    }
    await shoot(page, '.modal', `2e-step5e-modal-new-${theme}.png`);
    await ev(page, `__q('.modal [data-action="close-modal"]').click(); return 1;`);

    // ---- R6: the lost entry's modal ----
    if (theme === 'light') {
      await ev(page, `__card('${spirals}').querySelector('[data-action="review"]').click(); return 1;`);
      const lost = await until<{ text: string; viewer: boolean }>(
        page,
        `const w = __q('.modal-main .why.big'); return w ? { text: w.textContent, viewer: Boolean(__mw()) } : null;`,
      );
      check(
        "the lost entry's modal says so in place of the viewer",
        lost?.text ===
          'The submitted files couldn’t be read. There’s nothing to review yet, so Approve is off on the card. Refresh the page to try again.' &&
          !lost.viewer,
        lost,
      );
      await ev(page, `__q('.modal [data-action="close-modal"]').click(); return 1;`);
    }

    // ---- R3: Re-review ----
    await ev(page, `__q('.tab[data-tab="rereview"]').click(); return 1;`);
    const line = await until<string>(
      page,
      `return __card('${edited}')?.querySelector('.card-chg')?.textContent ?? null;`,
    );
    if (theme === 'light') {
      check(
        "the re-review card's line counts what changed",
        line === 'Since the approved version: 1 changed, 1 new, 1 removed',
        line,
      );
    }
    await until(page, `return __card('${edited}')?.querySelector('.thumb svg path') ? 1 : null;`);
    await ev(page, `__card('${edited}').querySelector('[data-action="review"]').click(); return 1;`);
    const box = await until<{ head: string; lines: string[]; gone: string[] }>(
      page,
      `const b = __q('.modal-changes'); const sf = __sf();
       if (!b || b.hidden || !sf?.shadowRoot.querySelector('.cm-editor .cm-line')) return null;
       return { head: b.querySelector('h4').textContent, lines: [...b.querySelectorAll('li')].map((l) => l.textContent),
         gone: [...sf.shadowRoot.querySelectorAll('.row.gone')].map((r) => r.textContent) };`,
    );
    if (theme === 'light') {
      check(
        "the modal's box says what changed, a line each; the viewer keeps the removed file struck out",
        box?.head.startsWith('What changed since the approved version (approved ') === true &&
          JSON.stringify(box.lines) ===
            JSON.stringify([
              'parts/gears.pathogen changed',
              'parts/springs.pathogen is new',
              'try-sizes.pathogen was removed',
              'The program list: try-sizes.pathogen left it, so pathogen.json changed',
            ]) &&
          JSON.stringify(box.gone) === JSON.stringify(['try-sizes.pathogen']),
        box,
      );
    }
    await ev(page, `__q('.modal-changes [data-file="parts/gears.pathogen"]').click(); return 1;`);
    const opened = await until<{ shown: string; pill: string }>(
      page,
      `const sf = __sf(); if (sf.shownText !== ${JSON.stringify(GEARS.replace('r / 3', 'r / 2'))}) return null;
       return { shown: 'gears', pill: sf.shadowRoot.querySelector('.path .mk')?.textContent ?? '' };`,
    );
    if (theme === 'light')
      check("a box line opens its file, its line saying 'changed'", opened?.pill === 'changed', opened);
    await pause(400);
    await shoot(page, '.modal', `2e-step5e-modal-changed-${theme}.png`);
    await ev(page, `__q('.modal [data-action="close-modal"]').click(); return 1;`);
    await ev(page, `__q('.tab[data-tab="pending"]').click(); return 1;`);
  }

  // ---- Approve names the version it saw ----
  const toasts: string[] = [];
  await page.exposeFunction('__toast', (title: string) => toasts.push(title));
  await page.goto(`${PAGES_URL}/admin/moderation`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(`document.addEventListener('show-toast', (e) => window.__toast(e.detail?.title ?? ''))`);
  await until(page, `const t = __q('.tab[data-tab="rereview"]'); if (!t) return null; t.click(); return 1;`);
  await until(
    page,
    `const b = __card('${edited}')?.querySelector('[data-action="approve"]'); return b && !b.disabled ? 1 : null;`,
  );
  const approvedBefore = (await api('admin-token', 'GET', `/admin/approval/${edited}`)).approvedAt;
  // The owner saves while the admin reads.
  await api('owner', 'PUT', `/workspace/${edited}`, {
    files: {
      'main.pathogen': { text: `${MAIN}gear(Point(20, 20), 10);\n` },
      'parts/gears.pathogen': { text: GEARS.replace('r / 3', 'r / 2') },
      'parts/springs.pathogen': { text: SPRINGS },
    },
    folders: ['parts'],
    entryPoints: ['main.pathogen'],
  });
  await ev(page, `__card('${edited}').querySelector('[data-action="approve"]').click(); return 1;`);
  const start = Date.now();
  while (toasts.length === 0 && Date.now() - start < 15_000) await pause(200);
  const after = await api('admin-token', 'GET', `/admin/approval/${edited}`);
  check(
    'a save since it was opened: nothing decided, said, the tab reloaded',
    toasts.at(-1) === 'This submission changed after it was opened. Review the version waiting now.' &&
      after.approvedAt === approvedBefore,
    { toasts, before: approvedBefore, after: after.approvedAt },
  );
  // The version waiting now loads; Approve approves it, with its drawing.
  await until(
    page,
    `const b = __card('${edited}')?.querySelector('[data-action="approve"]'); return b && !b.disabled && __card('${edited}').querySelector('.thumb svg path') ? 1 : null;`,
  );
  await ev(page, `__card('${edited}').querySelector('[data-action="approve"]').click(); return 1;`);
  await until(page, `return __card('${edited}') ? null : 1;`);
  const approval = await api('admin-token', 'GET', `/admin/approval/${edited}`);
  const waiting = (await api('owner', 'GET', `/workspace/${edited}`)) as { files?: Record<string, { sha256: string }> };
  check(
    'then the version waiting is approved, with its drawing',
    approval.approvedAt !== approvedBefore &&
      typeof approval.approvalSvgAt === 'string' &&
      (approval.files as Record<string, { sha256: string }>)['main.pathogen'].sha256 ===
        waiting.files?.['main.pathogen'].sha256,
    { approvedAt: approval.approvedAt, svgAt: approval.approvalSvgAt },
  );
  await page.evaluate(`localStorage.setItem('pathogen-theme', 'light')`);
} finally {
  for (const id of made) await api('owner', 'DELETE', `/workspace/${id}`);
  d1(
    `DELETE FROM sessions WHERE token IN ('${OWNER.token}', '${ADMIN_SESSION}'); DELETE FROM users WHERE id = '${OWNER.id}';` +
      (seedAdmin ? '' : ` DELETE FROM users WHERE id = '${adminId}';`),
  );
  await Promise.race([browser.close(), pause(10_000)]);
}

console.log(failures === 0 ? '\nall passed' : `\n${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
