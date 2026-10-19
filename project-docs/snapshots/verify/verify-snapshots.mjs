// End-to-end check of the snapshots UI against the local dev stack
// (Pages :3000 built with PATHOGEN_API_BASE=http://localhost:8787, API :8787,
// local D1 with migration 0003). Seeds a throwaway signed-in user via
// wrangler, drives the real playground, screenshots each step in light and
// dark, and cleans up.
//
//   node project-docs/snapshots/verify/verify-snapshots.mjs
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import puppeteer from 'puppeteer';

const OUT = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.resolve(OUT, '../../..');
const API = 'http://localhost:8787';
const APP = 'http://localhost:3000';
const USER = 'snapverify';
const TOKEN = 'snapverify-token';
const COOKIE = `pathogen_session=${TOKEN}`;
const results = [];
const check = (name, ok, extra = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ` — ${extra}` : ''}`);
};

function d1(sql) {
  return execFileSync(
    'npx',
    ['wrangler', 'd1', 'execute', 'svg-path-extended-users', '--local', '--persist-to=../.wrangler/state', '--json', '--command', sql],
    { cwd: path.join(ROOT, 'api'), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
  );
}

const now = Date.now();
d1(`DELETE FROM sessions WHERE user_id='${USER}'; DELETE FROM users WHERE id='${USER}';`);
d1(
  `INSERT INTO users (id,email,email_lower,handle,display_name,created_at,verified_at) VALUES ('${USER}','${USER}@example.test','${USER}@example.test','${USER}','Snap Verify',${now},${now}); ` +
    `INSERT INTO sessions (token,user_id,created_at,expires_at) VALUES ('${TOKEN}','${USER}',${now},${now + 3600000});`,
);

const CODE = `define ViewBox(0, 0, 400, 400);
// Scatter Rings — re-roll with Refresh, keep the good ones
let count = randomRange(6, 12);
for (i in 0..count) {
  circle(randomRange(40, 360), randomRange(40, 360), randomRange(18, 52));
}
`;
const created = await (
  await fetch(`${API}/workspace`, {
    method: 'POST',
    headers: { Cookie: COOKIE, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Scatter Rings', code: CODE, preferences: { background: '#ffffff', gridEnabled: false } }),
  })
).json();
const slugId = `${created.slug}--${created.id}`;
console.log('workspace', slugId);

const browser = await puppeteer.launch({ headless: 'shell', args: ['--window-size=1400,900'] });
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 900 });
const dialogs = [];
page.on('dialog', async (d) => {
  dialogs.push(d.message());
  await (d.type() === 'confirm' ? d.accept() : d.dismiss());
});
page.on('pageerror', (e) => console.log('PAGE ERROR', e.message));
await page.setCookie({ name: 'pathogen_session', value: TOKEN, domain: 'localhost', path: '/' });
await page.evaluateOnNewDocument(() => {
  window.__name = (fn) => fn;
});

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
// Deep query across shadow roots, as a string so it survives evaluate.
const DEEP = `
  window.__deep = (sel, root = document) => {
    const found = root.querySelector(sel);
    if (found) return found;
    for (const el of root.querySelectorAll('*')) {
      if (el.shadowRoot) { const f = window.__deep(sel, el.shadowRoot); if (f) return f; }
    }
    return null;
  };`;
async function poll(fnSrc, timeout = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const v = await page.evaluate(`(() => { ${DEEP} ${fnSrc} })()`);
    if (v) return v;
    await wait(200);
  }
  return null;
}
const ev = (src) => page.evaluate(`(() => { ${DEEP} ${src} })()`);
const shot = async (name) => page.screenshot({ path: path.join(OUT, `${name}.png`) });

async function run(theme) {
  await page.evaluateOnNewDocument((t) => localStorage.setItem('pathogen-theme', t), theme);
  try {
    await page.goto(`${APP}/workspace/${slugId}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
  } catch {}
  const ready = await poll(`const b = __deep('#snapshot-btn'); return b && !b.disabled && b.closest ? 'ok' : null;`, 25000);
  check(`[${theme}] Snapshot button enabled after render`, !!ready);
  const countText = await poll(`return __deep('#snapshot-count-btn')?.textContent.trim();`, 5000);
  check(`[${theme}] split button shows the count`, countText != null, countText ?? 'none');
  await shot(`01-toolbar-${theme}`);

  // Open popover from the breadcrumb.
  await ev(`__deep('#snapshot-btn').click(); return 1;`);
  const naming = await poll(`const p = document.querySelector('snapshot-popover'); return p && p.hasAttribute('open') && p.shadowRoot.querySelector('#name') ? p.shadowRoot.querySelector('#name').value : null;`);
  check(`[${theme}] popover opens in the naming state`, !!naming, naming);
  await poll(`const t = document.querySelector('snapshot-popover').shadowRoot.querySelector('.thumb'); return t && !t.classList.contains('pending') ? 1 : null;`, 8000);
  await shot(`02-popover-naming-${theme}`);
  await ev(`const r = document.querySelector('snapshot-popover').shadowRoot; r.querySelector('#name').value = 'dense ${theme}'; r.querySelector('#note').value = 'keep this one'; r.querySelector('[data-act=save]').click(); return 1;`);
  const saved = await poll(`const r = document.querySelector('snapshot-popover')?.shadowRoot; return r?.querySelector('.done .title')?.textContent;`, 15000);
  check(`[${theme}] save → Saved state`, !!saved && saved.includes(`dense ${theme}`), saved);
  await shot(`03-popover-saved-${theme}`);
  const count1 = await poll(`return __deep('#snapshot-count-btn .count')?.textContent;`);
  // Close, refresh, and take a default-named one.
  await ev(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); return 1;`);
  await ev(`__deep('#refresh-btn')?.click(); return 1;`);
  await poll(`const b = __deep('#snapshot-btn'); return b && !b.disabled ? 1 : null;`);
  await wait(400);

  // Fullscreen: camera button + tray.
  await ev(`__deep('svg-preview-pane').shadowRoot.querySelector('#fullscreen-toggle').click(); return 1;`);
  await wait(300);
  const camVisible = await ev(`const b = __deep('svg-preview-pane').shadowRoot.querySelector('#snapshot-btn'); return getComputedStyle(b).display;`);
  check(`[${theme}] fullscreen camera button visible`, camVisible === 'grid', camVisible);
  await ev(`__deep('svg-preview-pane').shadowRoot.querySelector('#snapshot-btn').click(); return 1;`);
  await poll(`return document.querySelector('snapshot-popover')?.getAttribute('placement') === 'left' ? 1 : null;`);
  await poll(`const t = document.querySelector('snapshot-popover').shadowRoot.querySelector('.thumb'); return t && !t.classList.contains('pending') ? 1 : null;`, 8000);
  await shot(`04-fullscreen-popover-${theme}`);
  await ev(`const n = document.querySelector('snapshot-popover').shadowRoot.querySelector('#name'); n.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })); return 1;`);
  const saved2 = await poll(`return document.querySelector('snapshot-popover')?.shadowRoot.querySelector('.done .title')?.textContent;`, 15000);
  check(`[${theme}] Enter saves with the default name`, !!saved2 && /Scatter Rings #\d+/.test(saved2), saved2);
  await ev(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); return 1;`);
  const trayItems = await poll(`const t = __deep('svg-preview-pane').shadowRoot.querySelector('snapshot-tray'); return t && t.hasAttribute('has-items') ? t.shadowRoot.querySelectorAll('.card').length : null;`);
  check(`[${theme}] fullscreen tray lists this visit's snapshots`, trayItems >= 2, String(trayItems));
  await shot(`05-fullscreen-tray-${theme}`);

  // Tray → snapshots page.
  await ev(`__deep('svg-preview-pane').shadowRoot.querySelector('snapshot-tray').shadowRoot.querySelector('.all').click(); return 1;`);
  const onPage = await poll(`return location.pathname.includes('/snapshots/') ? location.pathname : null;`);
  check(`[${theme}] tray "All →" opens the snapshots page`, !!onPage, onPage);
  const viewer = await poll(`const mw = __deep('workspace-snapshots-view')?.shadowRoot.querySelector('mini-workspace'); const ifr = mw?.shadowRoot?.querySelector('mini-preview')?.shadowRoot?.querySelector('iframe'); return ifr?.contentDocument?.querySelector('#preview-layers path, path[d]') ? 'rendered' : null;`, 15000);
  check(`[${theme}] mini-workspace renders the stored SVG`, viewer === 'rendered');
  const sandbox = await ev(`const mw = __deep('workspace-snapshots-view').shadowRoot.querySelector('mini-workspace'); return mw.shadowRoot.querySelector('mini-preview').shadowRoot.querySelector('iframe').getAttribute('sandbox');`);
  check(`[${theme}] viewer iframe sandbox has no allow-scripts`, sandbox === 'allow-same-origin', sandbox);
  await poll(`const f = __deep('snapshot-filmstrip'); return f && [...f.shadowRoot.querySelectorAll('.img')].every((i) => !i.classList.contains('pending')) ? 1 : null;`, 10000);
  const crumbs = await ev(`return __deep('app-breadcrumb').shadowRoot.querySelector('nav').textContent.replace(/\\s+/g, ' ').trim();`);
  check(`[${theme}] breadcrumb Workspaces / ws / Snapshots / name`, /Workspaces \/ Scatter Rings \/ Snapshots \/ /.test(crumbs), crumbs);
  await shot(`06-snapshots-page-${theme}`);

  // ← / → stepping follows the filmstrip.
  const before = await ev(`return location.pathname;`);
  await page.keyboard.press('ArrowRight');
  const after = await poll(`return location.pathname !== '${before}' ? location.pathname : null;`, 5000);
  check(`[${theme}] → steps to the next snapshot`, !!after, `${before} → ${after}`);

  // Code toggle (stock mini-workspace control).
  await ev(`__deep('workspace-snapshots-view').shadowRoot.querySelector('mini-workspace').shadowRoot.querySelector('#code-toggle').click(); return 1;`);
  await wait(800);
  await shot(`07-snapshots-page-code-${theme}`);

  // Export from the snapshot: legend code = snapshot code.
  await ev(`__deep('app-breadcrumb').shadowRoot.querySelector('[data-snapshot-action=export]').click(); return 1;`);
  const exportOpen = await poll(`const m = __deep('workspace-snapshots-view').shadowRoot.querySelector('export-modal'); return m?.classList.contains('open') ? 1 : null;`);
  check(`[${theme}] Export… opens the export dialog`, !!exportOpen);
  const legendCode = await ev(`return __deep('workspace-snapshots-view').shadowRoot.querySelector('export-modal')._formData.code.includes('Scatter Rings — re-roll');`);
  check(`[${theme}] export legend source is the snapshot's code`, legendCode === true);
  await shot(`08-export-dialog-${theme}`);
  await ev(`__deep('workspace-snapshots-view').shadowRoot.querySelector('export-modal').close(); return 1;`);
  return Number(count1);
}

await run('light');
await run('dark');

// Edited since render: type, then press Snapshot inside the 150 ms debounce.
await page.evaluateOnNewDocument(() => localStorage.setItem('pathogen-theme', 'light'));
try {
  await page.goto(`${APP}/workspace/${slugId}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
} catch {}
await poll(`const b = __deep('#snapshot-btn'); return b && !b.disabled ? 1 : null;`, 25000);
await wait(500);
const lines = await ev(`const c = __deep('.cm-content'); const ls = c.querySelectorAll('.cm-line'); const r = ls[2].getBoundingClientRect(); return [r.right - 2, r.top + r.height / 2];`);
await page.mouse.click(lines[0], lines[1]);
await page.keyboard.press('End');
await page.keyboard.type(' // tweak');
await ev(`__deep('#snapshot-btn').click(); return 1;`);
const staleMsg = await poll(`return document.querySelector('snapshot-popover')?.shadowRoot.querySelector('.msg.warn')?.textContent;`, 5000);
check('edited-since-render note names the line', !!staleMsg && /edited line 3/.test(staleMsg), staleMsg);
await shot('09-popover-stale-light');
await ev(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); return 1;`);

// Review fixes (code-review round 1):
// (a) toggle-shut after a breadcrumb re-render.
await ev(`__deep('#snapshot-btn').click(); return 1;`);
await poll(`return document.querySelector('snapshot-popover')?.hasAttribute('open') ? 1 : null;`);
await ev(`__deep('#console-toggle').click(); return 1;`); // re-renders the breadcrumb
await wait(300);
await page.evaluate(`(() => { ${DEEP} const b = __deep('#snapshot-btn'); b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true })); b.click(); })()`);
await wait(300);
const stillOpen = await ev(`return document.querySelector('snapshot-popover').hasAttribute('open');`);
check('Snapshot button toggles the popover shut after a breadcrumb re-render', stillOpen === false);
await ev(`__deep('#console-toggle').click(); return 1;`);

// (b) closing the popover mid-upload: save still lands, toast + tray thumb work.
await ev(`__deep('#snapshot-btn').click(); return 1;`);
await poll(`return document.querySelector('snapshot-popover')?.shadowRoot.querySelector('#name') ? 1 : null;`);
await poll(`const t = document.querySelector('snapshot-popover').shadowRoot.querySelector('.thumb'); return t && !t.classList.contains('pending') ? 1 : null;`, 8000);
await ev(`document.querySelector('snapshot-popover').shadowRoot.querySelector('[data-act=save]').click(); document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true })); return 1;`);
const closedDuringSave = await ev(`return !document.querySelector('snapshot-popover').hasAttribute('open');`);
const bgToast = await poll(`const t = __deep('app-toast'); const txt = [...(t?.shadowRoot?.querySelectorAll('.toast') || [])].map((el) => el.textContent).join(' | '); return /Saved “/.test(txt) ? txt.replace(/\\s+/g, ' ').trim().slice(0, 80) : null;`, 15000);
check('closing mid-upload still saves and reports by toast', closedDuringSave && !!bgToast, bgToast);
const trayThumbOk = await page.evaluate(`(async () => { ${DEEP} await new Promise((r) => setTimeout(r, 300)); const pane = __deep('svg-preview-pane'); const card = pane.shadowRoot.querySelector('snapshot-tray').shadowRoot.querySelector('.card'); const url = card && card.style.backgroundImage.match(/url\\("(.*)"\\)/)[1]; try { const r = await fetch(url); return r.ok && (await r.blob()).size > 0; } catch { return false; } })()`);
check('tray thumbnail URL is live (not revoked)', trayThumbOk === true);

// (c) upload fails while the popover is closed → popover re-opens with Retry.
await page.setRequestInterception(true);
const failSnapshots = (req) => {
  if (req.method() === 'POST' && /\/workspace\/[^/]+\/snapshots$/.test(req.url())) req.abort('failed');
  else req.continue();
};
page.on('request', failSnapshots);
await ev(`__deep('#snapshot-btn').click(); return 1;`);
await poll(`return document.querySelector('snapshot-popover')?.shadowRoot.querySelector('#name') ? 1 : null;`);
await ev(`document.querySelector('snapshot-popover').shadowRoot.querySelector('#note').value = 'kept after failure'; document.querySelector('snapshot-popover').shadowRoot.querySelector('[data-act=save]').click(); document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true })); return 1;`);
const retryShown = await poll(`const r = document.querySelector('snapshot-popover'); return r?.hasAttribute('open') && r.shadowRoot.querySelector('[data-act=retry]') ? r.shadowRoot.querySelector('#note').value : null;`, 15000);
check('failed upload re-opens the popover with Retry and keeps the note', retryShown === 'kept after failure', retryShown);
await shot('12-popover-retry-light');
page.off('request', failSnapshots);
await page.setRequestInterception(false);
await ev(`document.querySelector('snapshot-popover').shadowRoot.querySelector('[data-act=retry]').click(); return 1;`);
const retried = await poll(`return document.querySelector('snapshot-popover')?.shadowRoot.querySelector('.done .title')?.textContent;`, 15000);
check('Retry then saves', !!retried, retried);
await ev(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); return 1;`);

// Signed out: a fresh context without the session cookie, scratch buffer.
const anon = await browser.createBrowserContext();
const anonPage = await anon.newPage();
await anonPage.setViewport({ width: 1400, height: 900 });
anonPage.on('dialog', (d) => d.dismiss());
await anonPage.evaluateOnNewDocument(() => localStorage.setItem('pathogen-theme', 'light'));
const state = Buffer.from(encodeURIComponent(JSON.stringify({ code: CODE }))).toString('base64');
try {
  await anonPage.goto(`${APP}/workspace/scratch?state=${state}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
} catch {}
let anonReady = null;
for (let i = 0; i < 80 && !anonReady; i++) {
  anonReady = await anonPage.evaluate(`(() => { ${DEEP} const b = __deep('#snapshot-btn'); return b && !b.disabled ? 1 : null; })()`);
  if (!anonReady) await wait(250);
}
const anonCount = await anonPage.evaluate(`(() => { ${DEEP} return !!__deep('#snapshot-count-btn'); })()`);
check('signed out: Snapshot button shown without a count', !!anonReady && anonCount === false);
await anonPage.evaluate(`(() => { ${DEEP} __deep('#snapshot-btn').click(); })()`);
await wait(600);
const anonTitle = await anonPage.evaluate(`document.querySelector('snapshot-popover')?.shadowRoot.querySelector('.title')?.textContent`);
check('signed out: popover asks to sign in', anonTitle === 'Sign in to save snapshots', anonTitle);
await anonPage.screenshot({ path: path.join(OUT, '10-popover-signed-out-light.png') });
await anon.close();

// Storybook entries render.
for (const id of ['snapshot-popover', 'snapshot-tray', 'snapshot-filmstrip']) {
  try {
    await page.goto(`${APP}/storybook/${id}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
  } catch {}
  const ok = await poll(`return __deep('${id}') ? 1 : null;`, 10000);
  await wait(700);
  check(`storybook /${id} renders`, !!ok);
  await shot(`11-storybook-${id}`);
}

// Landing delete confirm mentions the snapshots; the API then cascades.
const list = await (await fetch(`${API}/workspace/${created.id}/snapshots`, { headers: { Cookie: COOKIE } })).json();
check('snapshots stored via the UI', list.count === 6, `count=${list.count}`);
try {
  await page.goto(`${APP}/workspaces`, { waitUntil: 'domcontentloaded', timeout: 20000 });
} catch {}
await poll(`return __deep('landing-view')?.shadowRoot.querySelector('[data-action=delete]') ? 1 : null;`);
await ev(`__deep('landing-view').shadowRoot.querySelector('[data-action=delete]').click(); return 1;`);
await poll(`return null;`, 3000);
check('delete confirmation names the snapshot count', dialogs.some((m) => /also deletes its 6 snapshots/.test(m)), dialogs.at(-1));
const afterDelete = await fetch(`${API}/workspace/${created.id}/snapshots`, { headers: { Cookie: COOKIE } });
check('workspace + snapshots gone after delete', afterDelete.status === 404, String(afterDelete.status));

await browser.close();
for (const w of (await (await fetch(`${API}/workspaces`, { headers: { Cookie: COOKIE } })).json()) || []) {
  await fetch(`${API}/workspace/${w.id}`, { method: 'DELETE', headers: { Cookie: COOKIE } });
}
d1(`DELETE FROM sessions WHERE user_id='${USER}'; DELETE FROM users WHERE id='${USER}';`);
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
