// 2e step 6 (mockup v12 P1 to P5; note 59 answer 3a): the public page's View source with
// several files. On the dev stack (localhost:3000 and :8787), in full Chrome.
// - P1: as served, every file's name and the count, the main's text, no other text.
// - P2: just opened, source.json held back: the list and the main's text at once, the
//   other rows loading; a program's icon from the list, a module's plain until its text.
// - P3: the texts come; a module opened, with its kind; light, dark and a phone's width.
// - P4: source.json fails: the others say so, with Try again, which then fills them.
// - P5: one file: today's code view, now following a theme change.
//
// One throwaway owner (a session in the local D1); approvals through the dev API's
// ADMIN_TOKEN (api/.dev.vars, never printed). Everything made is deleted.
//
//   npm run dev:stack            (and npm run build, build:playground:dev and
//                                 tmp/2e-step5/build-pages-worker.ts after a change)
//   npx tsx project-docs/modules/verify/verify-2e-step6.ts

import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

import puppeteer from 'puppeteer';

import type { HTTPRequest, Page } from 'puppeteer';

const PAGES_URL = 'http://localhost:3000';
const DEV_API = 'http://localhost:8787';
const OUT = 'project-docs/modules/verify';
const ADMIN_TOKEN = (readFileSync('api/.dev.vars', 'utf8').match(/^ADMIN_TOKEN=(.*)$/m)?.[1] ?? '').trim();
const pause = async (ms: number): Promise<void> => {
  await new Promise((r) => setTimeout(r, ms));
};

let failures = 0;
const check = (label: string, ok: boolean, detail?: unknown): void => {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${label}${ok ? '' : ` ${JSON.stringify(detail)?.slice(0, 900)}`}`);
  if (!ok) failures++;
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
const OWNER = { id: `v2e6-${tag}`, token: `v2e6-${randomUUID()}`, handle: `v2e6${tag}` };

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
const RINGS = 'define ViewBox(0, 0, 100, 100);\ncircle(50, 50, 30);\ncircle(50, 50, 20);\n';

const DEEP = `
  window.__sf = () => document.querySelector('.detail-source-files source-files');
  window.__row = (path) => __sf()?.shadowRoot.querySelector('.row[data-path="' + path + '"]');`;
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
async function shoot(page: Page, file: string): Promise<void> {
  // On screen, as a reader sees it (CodeMirror measures its lines only then), below the fixed header.
  await ev(
    page,
    `const r = document.querySelector('.detail-source')?.getBoundingClientRect();
     if (r) window.scrollTo(0, r.top + window.scrollY - 90); return 1;`,
  );
  await pause(800);
  const box = await ev<{ x: number; y: number; width: number; height: number } | null>(
    page,
    `const r = document.querySelector('.detail-source')?.getBoundingClientRect();
     return r ? { x: r.left, y: r.top + window.scrollY, width: r.width, height: r.height } : null;`,
  );
  if (box) await page.screenshot({ path: `${OUT}/${file}`, clip: box, captureBeyondViewport: true });
}

async function published(name: string, body: Record<string, unknown>): Promise<{ id: string; slug: string }> {
  const created = await api('owner', 'POST', '/workspace', { name, ...body });
  const id = created.id as string;
  await api('owner', 'POST', `/workspace/${id}/submit-for-review`);
  const approved = await api('admin-token', 'POST', `/admin/review/${id}`, { decision: 'approve' });
  return { id, slug: approved.slug as string };
}

if (!ADMIN_TOKEN) throw new Error('api/.dev.vars has no ADMIN_TOKEN');
const now = Date.now();
d1(
  `INSERT INTO users (id, email, email_lower, handle, display_name, created_at, verified_at) VALUES ('${OWNER.id}', '${OWNER.id}@example.invalid', '${OWNER.id}@example.invalid', '${OWNER.handle}', '${OWNER.handle}', ${now}, ${now}); ` +
    `INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES ('${OWNER.token}', '${OWNER.id}', ${now}, ${now + 3_600_000});`,
);

const made: string[] = [];
const browser = await puppeteer.launch({ headless: true, args: ['--window-size=1280,1000'] });
try {
  const gears = await published(`Gears ${tag}`, {
    files: {
      'main.pathogen': { text: MAIN },
      'parts/gears.pathogen': { text: GEARS },
      'try-sizes.pathogen': { text: SIZES },
    },
    folders: ['parts'],
    entryPoints: ['main.pathogen', 'try-sizes.pathogen'],
  });
  made.push(gears.id);
  const rings = await published(`Rings ${tag}`, { files: { 'main.pathogen': { text: RINGS } } });
  made.push(rings.id);
  const gearsUrl = `${PAGES_URL}/u/${OWNER.handle}/${gears.slug}`;

  // ---- P1, as served ----
  const html = await (await fetch(gearsUrl)).text();
  check(
    'P1: served with every name and the count, the main’s text, and no other text',
    html.includes('data-served=') &&
      html.includes('Pathogen &middot; 4 files') &&
      html.includes('parts/gears.pathogen') &&
      html.includes('define ViewBox(0, 0, 200, 100)') &&
      !html.includes('r / 3') &&
      !html.includes('define ViewBox(0, 0, 120, 120)'),
    { served: html.includes('data-served='), count: html.match(/detail-source-meta">([^<]*)</)?.[1] },
  );
  if (!html.includes('data-served=')) throw new Error('The dev stack serves the old Pages worker: restart dev:stack.');

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 1000 });
  page.on('pageerror', (e) => console.log('PAGE ERROR', e.message));
  // source.json: held back, failed, or let through, as each state needs.
  let mode: 'hold' | 'fail' | 'pass' = 'pass';
  const held: HTTPRequest[] = [];
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    if (!req.url().endsWith('/source.json')) return void req.continue();
    if (mode === 'hold') held.push(req);
    else if (mode === 'fail') void req.respond({ status: 503, contentType: 'application/json', body: '{}' });
    else void req.continue();
  });

  for (const theme of ['light', 'dark'] as const) {
    await page.goto(`${PAGES_URL}/`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(`localStorage.setItem('pathogen-theme', '${theme}')`);
    await page.goto(gearsUrl, { waitUntil: 'domcontentloaded' });
    if (theme === 'light') await shoot(page, '2e-step6-p1-closed-light.png');

    // ---- P2, just opened ----
    mode = 'hold';
    await ev(page, `document.querySelector('details.detail-source-disclosure summary').click(); return 1;`);
    const opened = await until<{ shown: string; waiting: string[]; icons: Record<string, string> }>(
      page,
      `const sf = __sf(); if (!sf?.shadowRoot.querySelector('.row')) return null;
       const waiting = [...sf.shadowRoot.querySelectorAll('.row.waiting')].map((r) => r.dataset.path);
       if (!waiting.length) return null;
       const icon = (p) => __row(p)?.querySelector('.icon')?.innerHTML ?? '';
       return { shown: sf.shownText, waiting, icons: { main: icon('main.pathogen'), sizes: icon('try-sizes.pathogen'), gears: icon('parts/gears.pathogen') } };`,
    );
    if (theme === 'light') {
      check(
        'P2: the main at once, the others loading; a program’s icon from the list, the module plain for now',
        opened?.shown === MAIN &&
          JSON.stringify(opened.waiting) === JSON.stringify(['parts/gears.pathogen', 'try-sizes.pathogen']) &&
          opened.icons.sizes === opened.icons.main &&
          opened.icons.gears !== opened.icons.main,
        opened,
      );
      await shoot(page, '2e-step6-p2-loading-light.png');
    }
    mode = 'pass';
    for (const req of held.splice(0)) void req.continue();

    // ---- P3, the texts come; a module opened ----
    const arrived = await until<{ kinds: string[] }>(
      page,
      `const sf = __sf(); if (sf.shadowRoot.querySelector('.row.waiting')) return null;
       return { kinds: [...sf.shadowRoot.querySelectorAll('.row.file')].map((r) => r.dataset.path + ' ' + [...r.classList].filter((c) => c === 'library' || c === 'program')[0]) };`,
    );
    await ev(page, `__row('parts/gears.pathogen').click(); return 1;`);
    const module = await until<string>(
      page,
      `const sf = __sf(); return sf.shadowRoot.querySelector('.cm-editor .cm-line') && sf.shownText === ${JSON.stringify(GEARS)} ? 'gears' : null;`,
    );
    if (theme === 'light') {
      check(
        'P3: the texts come, each kind known; a module opens with its text',
        module === 'gears' &&
          JSON.stringify(arrived?.kinds) ===
            JSON.stringify(['parts/gears.pathogen library', 'main.pathogen program', 'try-sizes.pathogen program']),
        { arrived, module },
      );
    }
    // Each line number sits beside its line. CodeMirror measures only while the editor
    // is on screen, as it is for a reader: scrolled into view first.
    await ev(page, `document.querySelector('.detail-source').scrollIntoView({ block: 'start' }); return 1;`);
    await pause(1500);
    const drift = await ev<number[]>(
      page,
      `const root = __sf().shadowRoot;
       const lines = [...root.querySelectorAll('.cm-line')].map((l) => l.getBoundingClientRect().top);
       // By its number: the gutter's hidden spacer (the widest number) isn't a line's.
       const top = {};
       for (const g of root.querySelectorAll('.cm-lineNumbers .cm-gutterElement')) {
         if (g.style.visibility !== 'hidden' && /^\\d+$/.test(g.textContent ?? '')) top[g.textContent] = g.getBoundingClientRect().top;
       }
       return lines.map((at, i) => Math.round(Math.abs(at - (top[String(i + 1)] ?? -999))));`,
    );
    check(
      `P3 (${theme}): each line number sits beside its line`,
      drift.length === 7 && drift.every((d) => d <= 1),
      drift,
    );
    await shoot(page, `2e-step6-p3-module-${theme}.png`);
  }

  // ---- P3 at a phone's width ----
  await page.setViewport({ width: 390, height: 844 });
  await page.evaluate(`localStorage.setItem('pathogen-theme', 'light')`);
  await page.goto(gearsUrl, { waitUntil: 'domcontentloaded' });
  await ev(page, `document.querySelector('details.detail-source-disclosure summary').click(); return 1;`);
  const menu = await until<string>(
    page,
    `const m = __sf()?.shadowRoot.querySelector('.menu'); return m && !__sf().shadowRoot.querySelector('.row.waiting') ? m.textContent.replace(/\\s+/g, ' ').trim() : null;`,
  );
  check(
    'a phone’s width: the menu above the code names the main and the count',
    menu === 'main.pathogen4 files' || (menu ?? '').includes('4 files'),
    menu,
  );
  await shoot(page, '2e-step6-p3-phone-light.png');
  await page.setViewport({ width: 1280, height: 1000 });

  // ---- P4, source.json fails ----
  mode = 'fail';
  await page.goto(gearsUrl, { waitUntil: 'domcontentloaded' });
  await ev(page, `document.querySelector('details.detail-source-disclosure summary').click(); return 1;`);
  const failed = await until<{ failed: string[]; foot: string; shown: string }>(
    page,
    `const sf = __sf(); const failed = [...(sf?.shadowRoot.querySelectorAll('.row.failed') ?? [])].map((r) => r.dataset.path);
     if (!failed.length) return null;
     return { failed, foot: sf.shadowRoot.querySelector('.foot')?.textContent ?? '', shown: sf.shownText };`,
  );
  check(
    'P4: a failed request: the main still shows, the others say so, and the list offers Try again',
    failed?.shown === MAIN &&
      JSON.stringify(failed.failed) === JSON.stringify(['parts/gears.pathogen', 'try-sizes.pathogen']) &&
      failed.foot.startsWith('The other files couldn’t load.'),
    failed,
  );
  await shoot(page, '2e-step6-p4-failed-light.png');
  mode = 'pass';
  await ev(page, `__sf().shadowRoot.querySelector('.foot .retry').click(); return 1;`);
  const retried = await until<number>(
    page,
    `const sf = __sf(); return sf.shadowRoot.querySelector('.row.failed, .row.waiting') ? null : sf.files.length;`,
  );
  check('P4: Try again fills them', retried === 4, retried);

  // ---- P5, one file, following the theme ----
  await page.goto(`${PAGES_URL}/u/${OWNER.handle}/${rings.slug}`, { waitUntil: 'domcontentloaded' });
  const ringsMeta = await ev<string>(page, `return document.querySelector('.detail-source-meta')?.textContent ?? '';`);
  await ev(page, `document.querySelector('details.detail-source-disclosure summary').click(); return 1;`);
  const bg = async (): Promise<string | null> =>
    until<string>(
      page,
      `const e = document.querySelector('.detail-source-editor .cm-editor'); return e ? getComputedStyle(e).backgroundColor : null;`,
    );
  const lightBg = await bg();
  await shoot(page, '2e-step6-p5-one-light.png');
  // The page's own toggle, light → dark, with the code view open.
  await page.evaluate(`document.querySelector('theme-toggle').shadowRoot.querySelector('button').click()`);
  await pause(300);
  const darkBg = await bg();
  check(
    'P5: one file: today’s view, its lines counted, and it follows a theme change',
    ringsMeta === 'Pathogen · 4 lines' &&
      !(await ev<boolean>(page, `return Boolean(document.querySelector('.detail-source-files'));`)) &&
      lightBg !== null &&
      darkBg !== null &&
      lightBg !== darkBg,
    { ringsMeta, lightBg, darkBg },
  );
  await shoot(page, '2e-step6-p5-one-dark.png');
  await page.evaluate(`localStorage.setItem('pathogen-theme', 'light')`);
} finally {
  for (const id of made) await api('owner', 'DELETE', `/workspace/${id}`);
  d1(`DELETE FROM sessions WHERE token = '${OWNER.token}'; DELETE FROM users WHERE id = '${OWNER.id}';`);
  await Promise.race([browser.close(), pause(10_000)]);
}

console.log(failures === 0 ? '\nall passed' : `\n${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
