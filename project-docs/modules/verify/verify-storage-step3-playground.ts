// Storage step 3 (note 50): today's playground still loads, edits and saves a
// workspace through the new API, where the files live in R2 and the KV record
// is a manifest. The real code path: the served playground's load
// (GET /workspace/:id → `code`), its editor, and its save (PUT with `code`).
//
//   npm run dev:stack                       (Pages :3000, API :8787)
//   npx tsx project-docs/modules/verify/verify-storage-step3-playground.ts
//
// Creates one throwaway workspace on the local API and deletes it after.

import puppeteer from 'puppeteer';

import type { Page } from 'puppeteer';

const PAGES_URL = 'http://localhost:3000';
const DEV_API = 'http://localhost:8787';
const ANON_KEY = 'pathogen-lang:userId';
const CODE = 'define ViewBox(0, 0, 100, 100);\n// STEP3 sentinel\ncircle(50, 50, 40);\n';
const MARKER = '// edited-by-step3-verify\n';

const ownerId = Array.from({ length: 21 }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]).join('');
let failures = 0;
const check = (label: string, ok: boolean, detail?: unknown): void => {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${label}${ok ? '' : ` ${JSON.stringify(detail)}`}`);
  if (!ok) failures++;
};

async function api(method: string, path: string, body?: unknown): Promise<{ status: number; data: Record<string, unknown> }> {
  const res = await fetch(`${DEV_API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-User-Id': ownerId },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  return { status: res.status, data: text ? (JSON.parse(text) as Record<string, unknown>) : {} };
}

async function editorCode(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const find = (root: Document | ShadowRoot, sel: string): Element | null => {
      const hit = root.querySelector(sel);
      if (hit) return hit;
      for (const el of Array.from(root.querySelectorAll('*'))) {
        const inner = el.shadowRoot ? find(el.shadowRoot, sel) : null;
        if (inner) return inner;
      }
      return null;
    };
    const pane = find(document, 'code-editor-pane') as (Element & { code?: string }) | null;
    return pane?.shadowRoot?.querySelector('.cm-content') ? (pane.code ?? null) : null;
  });
}

async function waitFor<T>(what: string, probe: () => Promise<T | null | false>, ms = 30_000): Promise<T> {
  const start = Date.now();
  while (Date.now() - start < ms) {
    const value = await probe();
    if (value) return value;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`timed out waiting for ${what}`);
}

async function focusEditorStart(page: Page): Promise<void> {
  const point = await page.evaluate(() => {
    const find = (root: Document | ShadowRoot, sel: string): Element | null => {
      const hit = root.querySelector(sel);
      if (hit) return hit;
      for (const el of Array.from(root.querySelectorAll('*'))) {
        const inner = el.shadowRoot ? find(el.shadowRoot, sel) : null;
        if (inner) return inner;
      }
      return null;
    };
    const r = find(document, 'code-editor-pane')?.shadowRoot?.querySelector('.cm-content')?.getBoundingClientRect();
    return r ? { x: r.left + 40, y: r.top + 10 } : null;
  });
  if (!point) throw new Error('no editor to click');
  await page.mouse.click(point.x, point.y);
  await page.keyboard.down('Meta');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.up('Meta');
}

const created = await api('POST', '/workspace', { name: 'step3 verify', code: CODE });
check('the new API creates a workspace from one `code` string', created.status === 201 && created.data.code === CODE, created);
const id = created.data.id as string;
const slugId = `${created.data.slug as string}-${id}`;

const browser = await puppeteer.launch({ headless: true, defaultViewport: { width: 1400, height: 1000 } });
try {
  const page = await browser.newPage();
  page.on('dialog', (d) => void d.accept());
  const pageErrors: string[] = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));
  const saveStatuses: number[] = [];
  page.on('response', (res) => {
    if (res.request().method() === 'PUT' && res.url() === `${DEV_API}/workspace/${id}`) saveStatuses.push(res.status());
  });
  await page.evaluateOnNewDocument(
    (key: string, value: string) => {
      (window as unknown as { __name?: <T>(fn: T) => T }).__name = <T>(fn: T): T => fn;
      localStorage.setItem(key, value);
    },
    ANON_KEY,
    ownerId,
  );

  // Load: the playground reads `code` from the new GET response.
  for (const path of [`/workspace/${slugId}`, `/workspace/${id}`]) {
    await page.goto(`${PAGES_URL}${path}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    const loaded = await waitFor('the editor to show the workspace', async () => {
      const code = await editorCode(page);
      return code?.includes('STEP3 sentinel') ? code : null;
    }).catch(() => null);
    if (loaded) {
      check(`today's playground loads the workspace (${path})`, loaded === CODE, loaded);
      break;
    }
    if (path === `/workspace/${id}`) check("today's playground loads the workspace", false, 'editor never showed it');
  }

  // Edit and save with Cmd-S: the playground's PUT sends `code`.
  await focusEditorStart(page);
  await page.keyboard.type(MARKER, { delay: 10 });
  await page.keyboard.down('Meta');
  await page.keyboard.press('KeyS');
  await page.keyboard.up('Meta');
  await waitFor('a save to answer', async () => saveStatuses.length > 0).catch(() => undefined);
  const settled = await waitFor('the saved code to include the edit', async () => {
    const { data } = await api('GET', `/workspace/${id}`);
    return typeof data.code === 'string' && data.code.startsWith(MARKER) ? data : null;
  }).catch(() => null);
  check('its save goes through the new API (200, no conflict)', saveStatuses.length > 0 && saveStatuses.every((s) => s === 200), saveStatuses);
  check('the edit is stored, as main.pathogen in R2', settled !== null && (settled.files as Record<string, { text: string }>)['main.pathogen'].text === `${MARKER}${CODE}`, settled);

  // Reload: the edit comes back.
  await page.reload({ waitUntil: 'domcontentloaded' });
  const reloaded = await waitFor('the edited code after a reload', async () => {
    const code = await editorCode(page);
    return code?.startsWith(MARKER) ? code : null;
  }).catch(() => null);
  check('a reload shows the saved edit', reloaded === `${MARKER}${CODE}`, reloaded);
  check('no page errors', pageErrors.length === 0, pageErrors);
} finally {
  await browser.close();
  await api('DELETE', `/workspace/${id}`);
}

console.log(failures === 0 ? '\nall passed' : `\n${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
