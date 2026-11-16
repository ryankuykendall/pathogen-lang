// 2e step 5b (58-phase-2e-plan.md, answer 9b): the card image frozen at approval, on
// the dev stack (localhost:3000 and :8787), in full Chrome.
// - Approve copies the owner's thumbnail (red) as the approval's card. The owner then
//   edits and makes new thumbnails and a hero (blue).
// - A visitor sees the red card on Explore, the profile and the public page (og:image,
//   and the hero, which falls back to the card's 1024), each image loading.
// - The review screen's Approved card shows the card; Regenerate replaces the card
//   with a render of the approved files, and the owner's live thumbnail stays blue;
//   Set thumbnail saves the card too, and its notice shows the card.
//
// One throwaway owner (a session in the local D1), and the seed admin
// (admin@seed.pathogen.studio, in the dev ADMIN_EMAILS) with a throwaway session, made
// if absent. The dev API's ADMIN_TOKEN comes from api/.dev.vars (never printed).
// Everything made is deleted.
//
//   npm run dev:stack
//   npm run build:playground:dev; npx tsx tmp/2e-step5/build-pages-worker.ts
//   npx tsx project-docs/modules/verify/verify-2e-step5b.ts

import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

import puppeteer from 'puppeteer';

import type { Browser, Page } from 'puppeteer';

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
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${label}${ok ? '' : ` ${JSON.stringify(detail)?.slice(0, 700)}`}`);
  if (!ok) failures++;
};

function d1(sql: string): string {
  return execFileSync(
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
      '--json',
    ],
    { cwd: 'api', stdio: ['pipe', 'pipe', 'inherit'] },
  ).toString();
}

const tag = randomUUID().slice(0, 8);
const OWNER = { id: `v2e5b-${tag}`, token: `v2e5b-${randomUUID()}`, handle: `v2e5b${tag}` };
const ADMIN_SESSION = `v2e5b-admin-${randomUUID()}`;

async function api(
  who: 'owner' | 'admin-token' | null,
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

const bytesOf = async (url: string): Promise<{ status: number; bytes: Buffer }> => {
  const res = await fetch(url);
  return { status: res.status, bytes: Buffer.from(await res.arrayBuffer()) };
};

/** A square PNG of one colour, at each card size, made by the browser. */
async function squares(browser: Browser, colour: string): Promise<Record<string, Buffer>> {
  const page = await browser.newPage();
  const out: Record<string, Buffer> = {};
  for (const size of [1024, 512, 256]) {
    await page.setViewport({ width: size, height: size });
    await page.setContent(`<body style="margin:0;background:${colour}"></body>`);
    out[String(size)] = Buffer.from(await page.screenshot({ type: 'png' }));
  }
  await page.close();
  return out;
}

async function uploadLive(id: string, kind: 'manual' | 'hero', images: Record<string, Buffer>): Promise<number> {
  const form = new FormData();
  for (const [name, bytes] of Object.entries(images)) form.append(name, new Blob([bytes]), `${name}.png`);
  const res = await fetch(`${DEV_API}/workspace/${id}/thumbnail?kind=${kind}`, {
    method: 'PUT',
    headers: { Cookie: `pathogen_session=${OWNER.token}` },
    body: form,
  });
  return res.status;
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

/** The first <img> whose src includes `part`, once it has loaded: its src and width. */
const loadedImage = async (page: Page, part: string): Promise<{ src: string; width: number } | null> =>
  until(
    page,
    `const img = [...document.querySelectorAll('img')].find((i) => i.src.includes(${JSON.stringify(part)}));
     return img && img.complete && img.naturalWidth > 0 ? { src: img.src, width: img.naturalWidth } : null;`,
  );

if (!ADMIN_TOKEN) throw new Error('api/.dev.vars has no ADMIN_TOKEN');
const now = Date.now();
const seedAdmin = (
  JSON.parse(d1(`SELECT id FROM users WHERE email_lower = '${SEED_ADMIN_EMAIL}'`)) as { results: { id: string }[] }[]
)[0].results[0];
const adminId = seedAdmin?.id ?? `v2e5b-admin-${tag}`;
d1(
  `INSERT INTO users (id, email, email_lower, handle, display_name, created_at, verified_at) VALUES ('${OWNER.id}', '${OWNER.id}@example.invalid', '${OWNER.id}@example.invalid', '${OWNER.handle}', '${OWNER.handle}', ${now}, ${now}); ` +
    `INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES ('${OWNER.token}', '${OWNER.id}', ${now}, ${now + 3_600_000}); ` +
    (seedAdmin
      ? ''
      : `INSERT INTO users (id, email, email_lower, handle, display_name, created_at, verified_at) VALUES ('${adminId}', '${SEED_ADMIN_EMAIL}', '${SEED_ADMIN_EMAIL}', 'v2e5badmin${tag}', 'Admin', ${now}, ${now}); `) +
    `INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES ('${ADMIN_SESSION}', '${adminId}', ${now}, ${now + 3_600_000});`,
);

const browser = await puppeteer.launch({ headless: true, args: ['--window-size=1440,900'] });
let workspaceId: string | null = null;
try {
  const red = await squares(browser, '#d33');
  const blue = await squares(browser, '#33d');

  // ---- The owner's workspace, approved with a red thumbnail; then a blue edit ----
  const created = await api('owner', 'POST', '/workspace', {
    name: `Card ${tag}`,
    code: 'define ViewBox(0, 0, 100, 100);\ncircle(50, 50, 40);\n',
  });
  workspaceId = created.id as string;
  const id = workspaceId;
  check('the owner uploads the red thumbnail', (await uploadLive(id, 'manual', red)) === 200);
  check('submitted', (await api('owner', 'POST', `/workspace/${id}/submit-for-review`)).status === 200);
  const approved = await api('admin-token', 'POST', `/admin/review/${id}`, { decision: 'approve' });
  check('approved', approved.status === 200, approved);
  const slug = approved.slug as string;
  await api('owner', 'PUT', `/workspace/${id}`, { code: 'define ViewBox(0, 0, 100, 100);\nrect(10, 10, 80, 80);\n' });
  check('the owner uploads blue thumbnails', (await uploadLive(id, 'manual', blue)) === 200);
  check('and a blue hero', (await uploadLive(id, 'hero', { hero: blue['1024'] })) === 200);

  // ---- A visitor ----
  const visitor = await browser.newPage();
  await visitor.setViewport({ width: 1440, height: 900 });
  const card = `/approval-card/${encodeURIComponent(id)}/`;
  for (const path of ['/explore', `/u/${OWNER.handle}`]) {
    await visitor.goto(`${PAGES_URL}${path}`, { waitUntil: 'domcontentloaded' });
    const img = await loadedImage(visitor, `${card}512?v=`);
    const served = img ? await bytesOf(img.src) : null;
    check(`${path}: the card loads, and it's the red one`, !!img && !!served && served.bytes.equals(red['512']), {
      img,
      status: served?.status,
    });
  }
  await visitor.goto(`${PAGES_URL}/u/${OWNER.handle}/${slug}`, { waitUntil: 'domcontentloaded' });
  const og = await ev<string | null>(
    visitor,
    `return document.querySelector('meta[property="og:image"]')?.content ?? null;`,
  );
  const ogBytes = og ? await bytesOf(og) : null;
  check(
    "the public page's og:image is the red card's 1024",
    !!og && og.includes(`${card}1024?v=`) && !!ogBytes?.bytes.equals(red['1024']),
    { og },
  );
  const hero = await loadedImage(visitor, `${card}hero?v=`);
  const heroBytes = hero ? await bytesOf(hero.src) : null;
  check(
    "the public page's hero is the red card's 1024 (no hero at approval), not the live blue hero",
    !!hero && !!heroBytes?.bytes.equals(red['1024']),
    { hero },
  );
  check(
    'the live thumbnail is blue (the owner sees it in the Workspaces list)',
    (await bytesOf(`${DEV_API}/thumbnail/${id}/512`)).bytes.equals(blue['512']),
  );
  await visitor.screenshot({ path: `${OUT}/2e-step5b-public-page.png` });

  // ---- The review screen, as the admin ----
  const admin = await browser.newPage();
  await admin.setViewport({ width: 1440, height: 900 });
  admin.on('dialog', (d) => void d.accept());
  admin.on('pageerror', (e) => console.log('PAGE ERROR', e.message));
  await admin.setCookie({ name: 'pathogen_session', value: ADMIN_SESSION, domain: 'localhost', path: '/' });
  await admin.goto(`${PAGES_URL}/admin/moderation`, { waitUntil: 'domcontentloaded' });
  await until(admin, `const t = __deep('[data-tab="approved"]'); if (!t) return null; t.click(); return 1;`);
  const cardSrc = `const b = __deep('[data-action="regenerate"][data-id="${id}"]');
     const img = b?.closest('li')?.querySelector('img');
     return img && img.complete && img.naturalWidth > 0 ? img.src : null;`;
  const before = await until<string>(admin, cardSrc);
  check("the Approved tab's card shows the approval's card", !!before?.includes(`${card}256?v=`), { before });

  await ev(admin, `__deep('[data-action="regenerate"][data-id="${id}"]').click(); return 1;`);
  const after = await until<string>(
    admin,
    `const s = (() => { ${cardSrc} })(); return s && s !== ${JSON.stringify(before)} ? s : null;`,
    60_000,
  );
  const regenerated = await bytesOf(`${DEV_API}${card}512`);
  check(
    'Regenerate: a new card (a render of the approved files), shown on the card',
    !!after && after.includes(`${card}256?v=`) && regenerated.status === 200 && !regenerated.bytes.equals(red['512']),
    { after, status: regenerated.status },
  );
  check(
    "Regenerate leaves the owner's live thumbnail blue",
    (await bytesOf(`${DEV_API}/thumbnail/${id}/512`)).bytes.equals(blue['512']),
  );

  const toasts: string[] = [];
  await admin.exposeFunction('__toast', (image: string) => toasts.push(image));
  await admin.evaluate(`document.addEventListener('show-toast', (e) => window.__toast(e.detail?.image ?? ''))`);
  await ev(admin, `__deep('[data-action="set-thumbnail"][data-id="${id}"]').click(); return 1;`);
  const opened = await until(
    admin,
    `const m = document.querySelector('thumbnail-crop-modal'); return m?.classList.contains('open') ? 1 : null;`,
    30_000,
  );
  await pause(800);
  if (opened)
    await ev(
      admin,
      `document.querySelector('thumbnail-crop-modal').shadowRoot.querySelector('.save-btn').click(); return 1;`,
    );
  for (let i = 0; i < 100 && !toasts.some(Boolean); i++) await pause(200);
  const setCard = await bytesOf(`${DEV_API}${card}512`);
  check(
    'Set thumbnail saves the card, and its notice shows the card',
    !!opened && toasts.some((t) => t.includes(`${card}256?v=`)) && setCard.status === 200,
    { opened, toasts },
  );
  check(
    "Set thumbnail leaves the owner's live thumbnail blue",
    (await bytesOf(`${DEV_API}/thumbnail/${id}/512`)).bytes.equals(blue['512']),
  );
  await pause(500);
  await admin.screenshot({ path: `${OUT}/2e-step5b-review-approved-tab.png` });
} finally {
  if (workspaceId) await api('owner', 'DELETE', `/workspace/${workspaceId}`);
  d1(
    `DELETE FROM sessions WHERE token IN ('${OWNER.token}', '${ADMIN_SESSION}'); DELETE FROM users WHERE id = '${OWNER.id}';` +
      (seedAdmin ? '' : ` DELETE FROM users WHERE id = '${adminId}';`),
  );
  await Promise.race([browser.close(), pause(10_000)]);
}

console.log(failures === 0 ? '\nall passed' : `\n${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
