// Mockup for 2e step 5d (note 59, requirement 9: "A file that can't be read says so in
// its place, and the other files still show"). The snapshots page's viewer, with one
// file of three whose bytes can't be read.
//
// - Proposed: the real viewer on the dev stack, the unreadable file's row and code area
//   changed in place (the row's icon a warning and its name muted; the code area says
//   the file couldn't be read; the copy icon off). Every other style is the real one.
// - Today (5d's server part, before this state): the file's bytes really deleted from
//   local R2; the page names the file in its error, as the interim does.
// Light and dark. Writes PNGs here and a self-contained BBWP page in website/bbwp/.
//
// One throwaway owner (local D1). Everything made is deleted.
//
//   npm run dev:stack            (and npm run build:playground:dev)
//   npx tsx project-docs/modules/mockups-2e-5d-unreadable-file/capture.ts

import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

import puppeteer from 'puppeteer';

import type { Page } from 'puppeteer';

const PAGES_URL = 'http://localhost:3000';
const DEV_API = 'http://localhost:8787';
const OUT = 'project-docs/modules/mockups-2e-5d-unreadable-file';
const pause = async (ms: number): Promise<void> => {
  await new Promise((r) => setTimeout(r, ms));
};

function wrangler(args: string[]): void {
  execFileSync('npx', ['wrangler', ...args], { cwd: 'api', stdio: ['pipe', 'pipe', 'inherit'] });
}
const d1 = (sql: string): void =>
  wrangler([
    'd1',
    'execute',
    'svg-path-extended-users',
    '--local',
    '--persist-to=../.wrangler/state',
    '--command',
    sql,
  ]);

const tag = randomUUID().slice(0, 8);
const OWNER = { id: `m2e5d-${tag}`, token: `m2e5d-${randomUUID()}`, handle: `m2e5d${tag}` };

async function api(method: string, path: string, body?: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(`${DEV_API}${path}`, {
    method,
    headers: { Cookie: `pathogen_session=${OWNER.token}`, 'Content-Type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, ...((await res.json().catch(() => ({}))) as Record<string, unknown>) };
}

const MAIN =
  'import { gear } from "./parts/gears.pathogen";\ndefine ViewBox(0, 0, 200, 100);\ngear(Point(55, 50), 40);\n';
const GEARS = 'module;\n\nexport fn gear(at, r) {\n  circle(at.x, at.y, r);\n}\n';
const DEMO =
  'import { gear } from "../parts/gears.pathogen";\ndefine ViewBox(0, 0, 300, 110);\ngear(Point(50, 50), 34);\n';

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

/** The proposed state, in the live viewer: parts/gears.pathogen can't be read. */
const PROPOSED = `
  const sf = __sf().shadowRoot;
  const style = document.createElement('style');
  style.textContent = \`
    .row.file.unreadable .name { color: var(--text-tertiary, #9087a0); }
    .row.file.unreadable .icon { color: var(--error-text, #dc2626); }
    .unread { display: grid; gap: 6px; align-content: start; padding: 18px 20px;
      font-family: var(--font-sans, system-ui, sans-serif); font-size: 13px; line-height: 1.45;
      color: var(--text-secondary, #5a4f6a); }
    .unread strong { color: var(--text-primary, #1c1722); font-weight: 600; }
    .cp[disabled] { opacity: 0.4; cursor: default; }\`;
  sf.appendChild(style);
  const warn = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg>';
  const row = sf.querySelector('.row.file[data-path="parts/gears.pathogen"]');
  row.classList.add('unreadable');
  row.querySelector('.icon').innerHTML = warn;
  row.setAttribute('title', "parts/gears.pathogen couldn't be read");
  sf.querySelector('.code').innerHTML = '<div class="unread" role="status"><strong>This file couldn’t be read.</strong><span>The other files show as saved. Reload the page to try again.</span></div>';
  const cp = sf.querySelector('.path .cp');
  cp.disabled = true;
  cp.title = "Nothing to copy: this file couldn't be read";
  return 1;`;

async function shootViewer(page: Page, file: string): Promise<void> {
  await pause(500);
  const box = await ev<{ x: number; y: number; width: number; height: number }>(
    page,
    `const s = __deep('workspace-snapshots-view').shadowRoot.querySelector('.stage'); const r = s.getBoundingClientRect();
     return { x: r.left, y: r.top, width: r.width, height: r.height };`,
  );
  await page.screenshot({ path: `${OUT}/${file}`, clip: box });
}

const now = Date.now();
d1(
  `INSERT INTO users (id, email, email_lower, handle, display_name, created_at, verified_at) VALUES ('${OWNER.id}', '${OWNER.id}@example.invalid', '${OWNER.id}@example.invalid', '${OWNER.handle}', '${OWNER.handle}', ${now}, ${now}); ` +
    `INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES ('${OWNER.token}', '${OWNER.id}', ${now}, ${now + 3_600_000});`,
);
const browser = await puppeteer.launch({ headless: true, args: ['--window-size=1440,900'] });
let id: string | null = null;
try {
  const created = await api('POST', '/workspace', {
    name: 'Gears',
    files: {
      'main.pathogen': { text: MAIN },
      'parts/gears.pathogen': { text: GEARS },
      'demos/gears.pathogen': { text: DEMO },
    },
    folders: ['parts', 'demos'],
    entryPoints: ['main.pathogen', 'demos/gears.pathogen'],
  });
  id = created.id as string;
  const slugId = `${created.slug as string}--${id}`;

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
  page.on('dialog', (d) => void d.accept());
  await page.setCookie({ name: 'pathogen_session', value: OWNER.token, domain: 'localhost', path: '/' });

  // A snapshot, made through the page as a user makes one.
  await page.goto(`${PAGES_URL}/workspace/${slugId}`, { waitUntil: 'domcontentloaded' });
  await until(page, `const b = __deep('#snapshot-btn'); return b && !b.disabled ? 1 : null;`, 60_000);
  await ev(page, `__deep('#snapshot-btn').click(); return 1;`);
  await until(
    page,
    `return document.querySelector('snapshot-popover')?.shadowRoot.querySelector('[data-act=save]') ? 1 : null;`,
  );
  await ev(
    page,
    `document.querySelector('snapshot-popover').shadowRoot.querySelector('[data-act=save]').click(); return 1;`,
  );
  await until(
    page,
    `return document.querySelector('snapshot-popover')?.shadowRoot.textContent.includes('Saved') ? 1 : null;`,
    10_000,
  );
  await pause(1500);

  const open = async (): Promise<void> => {
    await page.goto(`${PAGES_URL}/workspace/${slugId}/snapshots/1`, { waitUntil: 'domcontentloaded' });
    await until(page, `return __sf() ? 1 : null;`);
    await ev(page, `__mw().setAttribute('code-open', ''); return 1;`);
    await until(page, `return __sf()?.shadowRoot.querySelector('.cm-editor .cm-line') ? 1 : null;`);
    await ev(page, `__sf().shadowRoot.querySelector('.row.file[data-path="parts/gears.pathogen"]').click(); return 1;`);
    await until(page, `return __sf().shownText.startsWith('module;') ? 1 : null;`);
  };

  for (const theme of ['light', 'dark'] as const) {
    await page.evaluate(`localStorage.setItem('pathogen-theme', '${theme}')`);
    await open();
    await shootViewer(page, `readable-${theme}.png`);
    await ev(page, PROPOSED);
    await shootViewer(page, `proposed-${theme}.png`);
  }

  // Today: the snapshot's copy of the module really gone from local R2 (wrangler dev
  // binds the preview bucket, api/wrangler.toml preview_bucket_name). The module was
  // edited since, so the workspace itself still loads: the page loads the workspace
  // too, and a file the live workspace names going missing fails the whole page.
  const files = (await api('GET', `/workspace/${id}`)).files as Record<string, { sha256: string }>;
  const snapshotGears = files['parts/gears.pathogen'].sha256;
  await api('PUT', `/workspace/${id}`, {
    files: {
      'main.pathogen': { sha256: files['main.pathogen'].sha256 },
      'parts/gears.pathogen': { text: `${GEARS}// edited after the snapshot\n` },
      'demos/gears.pathogen': { sha256: files['demos/gears.pathogen'].sha256 },
    },
    folders: ['parts', 'demos'],
    entryPoints: ['main.pathogen', 'demos/gears.pathogen'],
  });
  wrangler([
    'r2',
    'object',
    'delete',
    `svg-path-extended-thumbnails-preview/files/${id}/${snapshotGears}`,
    '--local',
    '--persist-to=../.wrangler/state',
  ]);
  for (const theme of ['light', 'dark'] as const) {
    await page.evaluate(`localStorage.setItem('pathogen-theme', '${theme}')`);
    await page.goto(`${PAGES_URL}/workspace/${slugId}/snapshots/1`, { waitUntil: 'domcontentloaded' });
    const shown = await until(
      page,
      `const s = __deep('workspace-snapshots-view')?.shadowRoot.querySelector('.stage .message'); return s ? 1 : null;`,
      15_000,
    );
    if (!shown) {
      await page.screenshot({ path: 'tmp/2e-step5/mockup-5d-today-debug.png' });
      console.log(
        await ev<string>(
          page,
          `return (__deep('workspace-snapshots-view')?.shadowRoot.innerHTML ?? 'no view').slice(0, 1500);`,
        ),
      );
      throw new Error('the page never showed its error');
    }
    await shootViewer(page, `today-${theme}.png`);
  }
  await page.evaluate(`localStorage.setItem('pathogen-theme', 'light')`);
} finally {
  if (id) await api('DELETE', `/workspace/${id}`);
  d1(`DELETE FROM sessions WHERE token = '${OWNER.token}'; DELETE FROM users WHERE id = '${OWNER.id}';`);
  await Promise.race([browser.close(), pause(10_000)]);
}

// ---- The BBWP page ----
const img = (file: string): string => `data:image/png;base64,${readFileSync(`${OUT}/${file}`).toString('base64')}`;
const figure = (caption: string, base: string, note: string): string => `
  <figure><figcaption>${caption}</figcaption>
    <img class="light" src="${img(`${base}-light.png`)}" alt="${caption}, light">
    <img class="dark" src="${img(`${base}-dark.png`)}" alt="${caption}, dark">
    <p>${note}</p></figure>`;
const stamp = new Date();
const two = (n: number): string => String(n).padStart(2, '0');
const name = `${stamp.getFullYear()}-${two(stamp.getMonth() + 1)}-${two(stamp.getDate())}-${two(stamp.getHours())}:${two(stamp.getMinutes())}:${two(stamp.getSeconds())}--modules--unreadable-file.bbwp.html`;
writeFileSync(
  `website/bbwp/${name}`,
  `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>A file that can't be read</title>
<style>
  :root { --bg: #f6f3ee; --fg: #1c1722; --muted: #5a4f6a; --card: #fff; --line: rgba(28,23,34,.1); }
  :root[data-theme="dark"] { --bg: #16131b; --fg: #ece8f2; --muted: #a79fb4; --card: #201c27; --line: rgba(255,255,255,.1); }
  body { margin: 0; padding: 32px 16px 64px; background: var(--bg); color: var(--fg); font: 15px/1.5 system-ui, sans-serif; }
  main { max-width: 1200px; margin: 0 auto; }
  h1 { font-size: 22px; margin: 0 0 6px; }
  .lede { color: var(--muted); max-width: 75ch; }
  .toggle { margin: 16px 0 24px; display: flex; gap: 8px; }
  .toggle button { font: inherit; padding: 6px 12px; border-radius: 8px; border: 1px solid var(--line); background: var(--card); color: var(--fg); cursor: pointer; }
  .toggle button[aria-pressed="true"] { outline: 2px solid #9461c4; }
  .stack { display: grid; gap: 24px; }
  figure { margin: 0; background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 16px; }
  figcaption { font-weight: 600; margin-bottom: 10px; }
  figure img { max-width: 100%; height: auto; display: block; border-radius: 6px; }
  figure p { color: var(--muted); margin: 10px 0 0; font-size: 14px; }
  :root:not([data-theme="dark"]) img.dark, :root[data-theme="dark"] img.light { display: none; }
</style>
</head>
<body>
<main>
  <h1>A file that can't be read</h1>
  <p class="lede">Phase 2e, step 5d (note 59, requirement 9: "A file that can't be read says so in its place, and the other files still show"). A snapshot of three files whose module, <code>parts/gears.pathogen</code>, can't be read from storage. The same state applies wherever the viewer shows files: the snapshots page, the review screen's modal (5e) and the public page's View source (step 6). Captured from the real viewer on the dev stack; the proposal changes only that file's row and code area.</p>
  <div class="toggle" role="group" aria-label="Theme">
    <button type="button" data-theme="light" aria-pressed="true">Light</button>
    <button type="button" data-theme="dark" aria-pressed="false">Dark</button>
  </div>
  <div class="stack">
    ${figure('Proposed', 'proposed', 'The row keeps its place, with a warning icon and its name muted. Shown, the file says so where its code would be; its copy icon is off. The image and the other files are as saved.')}
    ${figure('Today, after 5d’s server part', 'today', 'The whole viewer fails, image included, naming the file. (Before 5d it failed with a storage error.)')}
    ${figure('For reference: every file read', 'readable', 'The same snapshot with its module shown, as it looks when nothing is missing.')}
  </div>
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
