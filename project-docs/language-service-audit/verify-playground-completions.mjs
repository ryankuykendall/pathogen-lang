/**
 * Browser verification of the 2026-07-13 language-service audit fixes in the
 * real playground (requires `npm run dev:website` on :3000 and the API worker
 * on :8787). Creates throwaway workspaces via the dev API, drives the real
 * CodeMirror editor, and asserts:
 *   1. bg.ap → accept `apply` → brace template with cursor inside (no bare label)
 *   2. `${ stroke-w` → accept `stroke-width` → single insertion (no `stroke-stroke-width`)
 *   3. `Mark` → accept `Marker` → binding-block template
 *
 * Run from the repo root: node project-docs/language-service-audit/verify-playground-completions.mjs
 */
import puppeteer from 'puppeteer';

const LOCAL_ORIGIN = 'http://localhost:3000';
const DEV_API = 'http://localhost:8787';
const ANON_KEY = 'pathogen-lang:userId';
const OWNER_ID = 'LsAuditVerifyOwner001';

function findInShadow(root, sel) {
  const d = root.querySelector(sel);
  if (d) return d;
  for (const el of root.querySelectorAll('*')) {
    if (el.shadowRoot) {
      const f = findInShadow(el.shadowRoot, sel);
      if (f) return f;
    }
  }
  return null;
}

async function createWorkspace(code) {
  const res = await fetch(`${DEV_API}/workspace`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-User-Id': OWNER_ID },
    body: JSON.stringify({ name: 'ls-audit-verify', code }),
  });
  if (!res.ok) throw new Error(`workspace create failed: HTTP ${res.status}`);
  return (await res.json()).id;
}

async function deleteWorkspace(id) {
  try {
    await fetch(`${DEV_API}/workspace/${id}`, { method: 'DELETE', headers: { 'X-User-Id': OWNER_ID } });
  } catch { /* best-effort */ }
}

const browser = await puppeteer.launch({ headless: 'new' });
const page = await browser.newPage();
// Native dialogs (confirm/prompt, e.g. autosave-draft restore) block the
// renderer entirely in headless mode unless dismissed.
page.on('dialog', (d) => { d.dismiss().catch(() => {}); });
await page.evaluateOnNewDocument(
  (k, uid) => { try { localStorage.setItem(k, uid); } catch {} },
  ANON_KEY,
  OWNER_ID,
);

const results = [];
const wsIds = [];

async function pollUntil(check, timeoutMs, what) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`timed out after ${timeoutMs}ms waiting for ${what}`);
}

async function openEditorWith(code) {
  const id = await createWorkspace(code);
  wsIds.push(id);
  // Navigation lifecycle events are flaky under wrangler pages dev (the page
  // renders fine while 'domcontentloaded' occasionally never fires through
  // CDP). Treat goto timeouts as non-fatal — the waitForFunction below is the
  // real readiness gate on the actual editor DOM.
  try {
    await page.goto(`${LOCAL_ORIGIN}/workspace/${id}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  } catch (e) {
    console.log(`  (goto lifecycle timeout for ${id} — polling editor DOM directly)`);
  }
  // The playground CSP interferes with puppeteer's waitForFunction utility
  // injection, so poll with plain page.evaluate instead (which works fine).
  await pollUntil(() => page.evaluate(() => {
    function walk(root, sel) {
      const d = root.querySelector(sel);
      if (d) return d;
      for (const el of root.querySelectorAll('*')) {
        if (el.shadowRoot) {
          const f = walk(el.shadowRoot, sel);
          if (f) return f;
        }
      }
      return null;
    }
    return !!walk(document, '.cm-content');
  }), 30000, 'editor (.cm-content)');
  await page.evaluate(() => {
    function walk(root, sel) {
        const d = root.querySelector(sel);
        if (d) return d;
        for (const el of root.querySelectorAll('*')) {
          if (el.shadowRoot) {
            const f = walk(el.shadowRoot, sel);
            if (f) return f;
          }
        }
        return null;
      }
    walk(document, '.cm-content').focus();
  });
  await page.keyboard.down('Meta');
  await page.keyboard.press('End');
  await page.keyboard.up('Meta');
  await new Promise((r) => setTimeout(r, 400));
}

async function editorText() {
  return page.evaluate(() => {
    function walk(root, sel) {
        const d = root.querySelector(sel);
        if (d) return d;
        for (const el of root.querySelectorAll('*')) {
          if (el.shadowRoot) {
            const f = walk(el.shadowRoot, sel);
            if (f) return f;
          }
        }
        return null;
      }
    const content = walk(document, '.cm-content');
    return Array.from(content.querySelectorAll('.cm-line')).map((l) => l.textContent ?? '').join('\n');
  });
}

async function acceptOption(label) {
  try {
    await pollUntil(() => page.evaluate(() => {
      function walk(root, sel) {
        const d = root.querySelector(sel);
        if (d) return d;
        for (const el of root.querySelectorAll('*')) {
          if (el.shadowRoot) {
            const f = walk(el.shadowRoot, sel);
            if (f) return f;
          }
        }
        return null;
      }
      return !!walk(document, '.cm-tooltip-autocomplete li');
    }), 8000, 'completion popup');
  } catch {
    return false;
  }
  return page.evaluate(
    (wanted) => {
      function walk(root, sel) {
        const d = root.querySelector(sel);
        if (d) return d;
        for (const el of root.querySelectorAll('*')) {
          if (el.shadowRoot) {
            const f = walk(el.shadowRoot, sel);
            if (f) return f;
          }
        }
        return null;
      }
      const list = walk(document, '.cm-tooltip-autocomplete');
      if (!list) return false;
      const options = Array.from(list.querySelectorAll('li'));
      const target =
        options.find((o) => o.querySelector('.cm-completionLabel')?.textContent === wanted) ??
        options.find((o) => (o.textContent ?? '').startsWith(wanted));
      if (!target) return false;
      target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, composed: true }));
      target.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
      return true;
    },
    label,
  );
}

try {
  // ── 1. apply brace template ────────────────────────────────────────────────
  await openEditorWith("let bg = PathLayer('bg');\n");
  await page.keyboard.type('bg.ap', { delay: 30 });
  const clicked1 = await acceptOption('apply');
  await new Promise((r) => setTimeout(r, 500));
  const text1 = await editorText();
  results.push({
    name: 'bg.ap → accept apply inserts brace template',
    pass: clicked1 && /bg\.apply \{/.test(text1) && !text1.includes('apapply'),
    detail: JSON.stringify(text1.split('\n').slice(-4)),
  });

  // ── 2. stroke- doubling fix ────────────────────────────────────────────────
  await openEditorWith('M 0 0\n');
  await page.keyboard.type('let s = ${ stroke-w', { delay: 30 });
  const clicked2 = await acceptOption('stroke-width');
  await new Promise((r) => setTimeout(r, 500));
  const text2 = await editorText();
  results.push({
    name: '${ stroke-w → accept stroke-width inserts `stroke-width: ;` once',
    pass: clicked2 && text2.includes('stroke-width: ;') && !text2.includes('stroke-stroke-width'),
    detail: JSON.stringify(text2.split('\n').slice(-3)),
  });

  // ── 2b. value-position suggestions after the colon ────────────────────────
  await openEditorWith('M 0 0\n');
  await page.keyboard.type('let s = ${ stroke-linecap: ro', { delay: 30 });
  const clicked2b = await acceptOption('round');
  await new Promise((r) => setTimeout(r, 500));
  const text2b = await editorText();
  results.push({
    name: '${ stroke-linecap: ro → accept round inserts value',
    pass: clicked2b && text2b.includes('stroke-linecap: round'),
    detail: JSON.stringify(text2b.split('\n').slice(-3)),
  });

  // ── 3. Marker binding-block template ──────────────────────────────────────
  await openEditorWith('M 0 0\n');
  await page.keyboard.type('let mk = Mark', { delay: 30 });
  const clicked3 = await acceptOption('Marker');
  await new Promise((r) => setTimeout(r, 500));
  const text3 = await editorText();
  results.push({
    name: 'Mark → accept Marker inserts binding-block template',
    pass: clicked3 && text3.includes("Marker('id', 10, 10) {|m|"),
    detail: JSON.stringify(text3.split('\n').slice(-5)),
  });
} finally {
  for (const id of wsIds) await deleteWorkspace(id);
  await browser.close();
}

let failed = 0;
for (const r of results) {
  console.log(`${r.pass ? '✓' : '✗'} ${r.name}`);
  if (!r.pass) {
    failed++;
    console.log(`    got: ${r.detail.slice(0, 400)}`);
  }
}
process.exit(failed === 0 ? 0 : 1);
