// Storage step 4 (note 50): the served admin moderation view still reviews
// and approves a workspace whose text lives in R2. The real code path: a
// queue entry frozen by the API (POST /admin/requeue/:id → makeQueueEntry),
// the view's listing (GET /admin/queue/review → `code`), its compile, and its
// Approve (POST /admin/review/:id with the compiled SVG); then the admin
// approval read and the public GET /approval-source/:id.
//
// Only the sign-in is stood in for: the view asks GET /me whether the viewer
// is an admin, so the page is answered with an admin user, and each /admin/*
// request gets the dev API's ADMIN_TOKEN (read from api/.dev.vars, never
// printed). Everything else is the served page against the dev API.
//
//   npm run dev:stack                       (Pages :3000, API :8787)
//   npx tsx project-docs/modules/verify/verify-storage-step4-admin.ts
//
// Creates one throwaway workspace on the local API and deletes it after
// (which also removes its approval and queue entries).

import { readFileSync } from 'node:fs';

import puppeteer from 'puppeteer';

const PAGES_URL = 'http://localhost:3000';
const DEV_API = 'http://localhost:8787';
const CODE = 'define ViewBox(0, 0, 100, 100);\n// STEP4 sentinel\ncircle(50, 50, 40);\n';

const devVars = Object.fromEntries(
  readFileSync('api/.dev.vars', 'utf8')
    .split('\n')
    .map((line) => line.match(/^([A-Z_]+)=(.*)$/))
    .filter((m): m is RegExpMatchArray => m !== null)
    .map((m) => [m[1], m[2].replace(/^"(.*)"$/, '$1')]),
);
const ADMIN_TOKEN = devVars.ADMIN_TOKEN ?? '';
if (!ADMIN_TOKEN) {
  console.error('api/.dev.vars has no ADMIN_TOKEN, so the dev API has no admin to act as.');
  process.exit(1);
}

const ownerId = Array.from({ length: 21 }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]).join('');
let failures = 0;
const check = (label: string, ok: boolean, detail?: unknown): void => {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${label}${ok ? '' : ` ${JSON.stringify(detail)?.slice(0, 400)}`}`);
  if (!ok) failures++;
};

async function api(
  method: string,
  path: string,
  body?: unknown,
  admin = false,
): Promise<{ status: number; data: Record<string, unknown> }> {
  const url = admin ? `${DEV_API}${path}${path.includes('?') ? '&' : '?'}token=${encodeURIComponent(ADMIN_TOKEN)}` : `${DEV_API}${path}`;
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-User-Id': ownerId },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let data: Record<string, unknown> = {};
  try {
    data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    data = { text };
  }
  return { status: res.status, data };
}

async function waitFor<T>(what: string, probe: () => Promise<T | null | false | undefined>, ms = 30_000): Promise<T> {
  const start = Date.now();
  while (Date.now() - start < ms) {
    const value = await probe();
    if (value) return value;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`timed out waiting for ${what}`);
}

const created = await api('POST', '/workspace', { name: 'step4 verify', code: CODE });
check('the new API creates a workspace from one `code` string', created.status === 201, created);
const id = created.data.id as string;

// A workspace with several files, which the API accepts already: its queue
// entry has no `code`, and the view must list it without throwing.
const multi = await api('POST', '/workspace', {
  name: 'step4 verify multi',
  files: {
    'main.pathogen': { text: 'import { gear } from "./gears.pathogen";\ngear(4);\n' },
    'gears.pathogen': { text: 'module;\nexport fn gear(r) {\n  circle(0, 0, r);\n}\n' },
  },
});
check('the new API creates a workspace with several files', multi.status === 201, multi);
const multiId = multi.data.id as string;

const browser = await puppeteer.launch({ headless: true, defaultViewport: { width: 1400, height: 1000 } });
try {
  const queued = await api('POST', `/admin/requeue/${id}`, {}, true);
  check('the API freezes it into the review queue', queued.status === 200, queued);
  const queuedMulti = await api('POST', `/admin/requeue/${multiId}`, {}, true);
  check('and the one with several files', queuedMulti.status === 200, queuedMulti);

  const page = await browser.newPage();
  page.on('dialog', (d) => void d.accept());
  const pageErrors: string[] = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));
  let approveBody: { decision?: string; svg?: string } | null = null;
  let approveStatus: number | null = null;
  page.on('response', (res) => {
    if (res.request().method() === 'POST' && res.url().startsWith(`${DEV_API}/admin/review/${id}`)) {
      approveStatus = res.status();
    }
  });

  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = new URL(req.url());
    if (url.origin === DEV_API && url.pathname === '/me' && req.method() === 'GET') {
      void req.respond({
        status: 200,
        contentType: 'application/json',
        headers: { 'Access-Control-Allow-Origin': PAGES_URL, 'Access-Control-Allow-Credentials': 'true' },
        body: JSON.stringify({
          currentUser: {
            id: 'verify-admin',
            email: 'verify-admin@example.invalid',
            handle: 'verify-admin',
            displayName: 'Verify Admin',
            features: ['publishing', 'admin-moderation'],
          },
        }),
      });
      return;
    }
    if (url.origin === DEV_API && url.pathname.startsWith('/admin/') && req.method() !== 'OPTIONS') {
      if (req.method() === 'POST' && url.pathname === `/admin/review/${id}`) {
        approveBody = JSON.parse(req.postData() ?? '{}') as typeof approveBody;
      }
      url.searchParams.set('token', ADMIN_TOKEN);
      void req.continue({ url: url.toString() });
      return;
    }
    void req.continue();
  });
  await page.evaluateOnNewDocument(() => {
    (window as unknown as { __name?: <T>(fn: T) => T }).__name = <T>(fn: T): T => fn;
  });

  await page.goto(`${PAGES_URL}/admin/moderation`, { waitUntil: 'domcontentloaded', timeout: 30_000 });

  // The pending card for this workspace, with a thumbnail compiled from the listed `code`.
  const card = await waitFor('the pending card and its compiled thumbnail', () =>
    page.evaluate((wsId: string) => {
      const view = document.querySelector('app-shell')?.shadowRoot?.querySelector('admin-moderation-view');
      const root = view?.shadowRoot;
      const button = root?.querySelector(`[data-action="approve"][data-id="${wsId}"]`);
      const cardEl = button?.closest('.card');
      if (!cardEl) return null;
      const html = cardEl.innerHTML;
      return html.includes('<svg') || html.includes('data:image/svg') ? { hasSvg: true } : null;
    }, id),
  ).catch(() => null);
  check('the admin view lists the entry and compiles its thumbnail from the listed code', card !== null, card);
  const multiListed = await page.evaluate((wsId: string) => {
    const view = document.querySelector('app-shell')?.shadowRoot?.querySelector('admin-moderation-view');
    return Boolean(view?.shadowRoot?.querySelector(`[data-action="approve"][data-id="${wsId}"]`));
  }, multiId);
  check('it lists the entry with several files too', multiListed);
  // Give the thumbnail loop time to reach the entry with no `code`.
  await new Promise((r) => setTimeout(r, 1500));
  check('listing an entry with no `code` throws nothing in the page', pageErrors.length === 0, pageErrors);

  // Approve through the card.
  await page.evaluate((wsId: string) => {
    const view = document.querySelector('app-shell')?.shadowRoot?.querySelector('admin-moderation-view');
    (view?.shadowRoot?.querySelector(`[data-action="approve"][data-id="${wsId}"]`) as HTMLButtonElement | null)?.click();
  }, id);
  await waitFor('the approve request to answer', async () => approveStatus !== null).catch(() => undefined);
  const sent = approveBody as { decision?: string; svg?: string } | null;
  check('Approve answers 200', approveStatus === 200, approveStatus);
  check(
    'Approve sends an SVG compiled from the frozen text (not empty)',
    sent?.decision === 'approve' && typeof sent.svg === 'string' && sent.svg.includes('<svg') && /<path[^>]* d="M/.test(sent.svg),
    sent?.svg?.slice(0, 200),
  );

  const approval = await api('GET', `/admin/approval/${id}`, undefined, true);
  check('the admin approval read returns the approved text as `code`', approval.data.code === CODE, approval.data);
  const source = await api('GET', `/approval-source/${id}`);
  check(
    'GET /approval-source/:id serves it publicly, with its files',
    source.status === 200 &&
      source.data.code === CODE &&
      (source.data.files as Record<string, { text: string }>)['main.pathogen'].text === CODE,
    source,
  );
  check('no page errors', pageErrors.length === 0, pageErrors);
} finally {
  await browser.close();
  await api('DELETE', `/workspace/${id}`);
  await api('DELETE', `/workspace/${multiId}`);
}

console.log(failures === 0 ? '\nall passed' : `\n${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
