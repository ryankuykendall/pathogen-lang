// Puppeteer repro + verification for the workspace-switch data-loss bugs.
//
// Bug 1 (user-reported): the CodeMirror editor is a per-tab singleton and a
// workspace switch replaced the doc via an undoable transaction, so in
// workspace B, Cmd+Z past the user's own edits restored workspace A's full
// text — which autosave then persisted into B (destroying it).
//
// Bug 2 (same path): on an in-app workspace→workspace switch autosave was
// never flushed/stopped, so a live debounce timer bound to workspace A could
// fire holding the NEXT page's code (someone else's workspace, a `?state=`
// share link, or the 404 defaultCode fallback) and write it into A. Also,
// A's pending edits inside the 5s debounce window were silently dropped.
//
// Scenarios (each uses freshly created workspaces — a pre-fix run genuinely
// destroys them, so they cannot be shared across scenarios):
//   1. undo-bleed  — open A, switch in-app to B, type, Cmd+Z ×40: the doc
//      must never become A's code; after a page teardown (beforeunload
//      keepalive save), B's server-side code must still be B's.
//   2. flush       — edit A, switch to B inside the debounce window: exactly
//      one PUT must persist A's edited code; nothing may write B's code to A.
//   3. state-link  — edit A, navigate in-app to /workspace/scratch?state=…:
//      the shared code must never be saved into A (A's edit is flushed).
//   4. not-found   — edit A, navigate in-app to a nonexistent workspace id:
//      the defaultCode fallback must never be saved into A.
//
// Autosave reschedules debounced saves to the 30s MIN_INTERVAL mark, so the
// stale-timer writes in scenarios 3/4 only land ~30s after workspace load.
// Pass --slow to extend the observation windows past that mark; the fast
// default still catches the undo bleed (incl. its persisted destruction of
// B via the teardown keepalive save) and the dropped-flush regression.
//
// Requires `npm run dev:stack` (Pages on :3000 + API on :8787) with the
// playground rebuilt against the local API:
//   PATHOGEN_API_BASE=http://localhost:8787 npm run build:playground

import { Command } from 'commander';
import puppeteer from 'puppeteer';
import type { Browser, Page } from 'puppeteer';

const program = new Command();
program
  .name('debug-workspace-switch-undo')
  .description('Verify undo history and autosave are isolated across in-app workspace switches')
  .option('--pages-url <url>', 'Pages dev URL', 'http://localhost:3000')
  .option('--api-url <url>', 'API dev URL', 'http://localhost:8787')
  .option('--slow', 'extend observation windows past the 30s autosave MIN_INTERVAL', false)
  .option('--headful', 'run with a visible browser window', false)
  .parse();
const opts = program.opts<{ pagesUrl: string; apiUrl: string; slow: boolean; headful: boolean }>();

const PAGES_URL = opts.pagesUrl;
const DEV_API = opts.apiUrl;

// This script creates and deletes real workspaces — refuse non-local targets.
if (
  !/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(DEV_API) ||
  !/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(PAGES_URL)
) {
  console.error('refusing to run against a non-local target (workspaces are created/deleted for real)');
  process.exit(2);
}

const ANON_KEY = 'pathogen-lang:userId';
// Long enough for a debounced save (5s) to fire; --slow also clears the 30s
// MIN_INTERVAL reschedule so stale-timer writes have actually landed.
const OBSERVE_MS = opts.slow ? 34_000 : 8_000;

const CODE_A = `define ViewBox(0, 0, 100, 100);
// WORKSPACE-A sentinel
circle(50, 50, 40);
`;
const CODE_B = `define ViewBox(0, 0, 100, 100);
// WORKSPACE-B sentinel
rect(10, 10, 80, 80);
`;
const SHARED_CODE = `define ViewBox(0, 0, 100, 100);
// SHARED-LINK sentinel
line(0, 0, 100, 100);
`;

/** Generates a client-valid anonymous id: 21 chars from [0-9A-Za-z_~-]. */
function makeAnonId(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_~-';
  let id = '';
  for (let i = 0; i < 21; i++) id += alphabet[Math.floor(Math.random() * alphabet.length)];
  return id;
}

function encodeState(code: string): string {
  return btoa(encodeURIComponent(JSON.stringify({ code })));
}

const ownerId = makeAnonId();
const createdWorkspaces: string[] = [];

async function createLocalWorkspace(name: string, code: string): Promise<string> {
  const res = await fetch(`${DEV_API}/workspace`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-User-Id': ownerId },
    body: JSON.stringify({ name, code }),
  });
  if (!res.ok) throw new Error(`workspace create failed: HTTP ${res.status}`);
  const data = (await res.json()) as { id: string };
  createdWorkspaces.push(data.id);
  return data.id;
}

async function deleteLocalWorkspace(id: string): Promise<void> {
  try {
    await fetch(`${DEV_API}/workspace/${id}`, { method: 'DELETE', headers: { 'X-User-Id': ownerId } });
  } catch {
    /* best-effort cleanup */
  }
}

async function fetchWorkspaceCode(id: string): Promise<string | null> {
  try {
    const res = await fetch(`${DEV_API}/workspace/${id}`, { headers: { 'X-User-Id': ownerId } });
    if (!res.ok) return null;
    const data = (await res.json()) as { code?: string };
    return data.code ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Page helpers
// ---------------------------------------------------------------------------

async function readEditorCode(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const deepQuery = (root: Document | ShadowRoot, selector: string): Element | null => {
      const direct = root.querySelector(selector);
      if (direct) return direct;
      for (const el of Array.from(root.querySelectorAll('*'))) {
        if (el.shadowRoot) {
          const found = deepQuery(el.shadowRoot, selector);
          if (found) return found;
        }
      }
      return null;
    };
    const pane = deepQuery(document, 'code-editor-pane') as (Element & { code?: string }) | null;
    return pane?.code ?? null;
  });
}

async function waitForEditorContains(page: Page, marker: string, timeoutMs = 20_000): Promise<string> {
  const start = Date.now();
  let last: string | null = null;
  while (Date.now() - start < timeoutMs) {
    last = await readEditorCode(page);
    if (last?.includes(marker)) return last;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`editor never showed marker "${marker}" (last doc: ${JSON.stringify(last?.slice(0, 120))})`);
}

/**
 * Wait until the real CodeMirror editor exists (`.cm-content` rendered).
 * `pane.code` falls back to `_initialCode` before the esm.sh modules finish
 * loading, so a marker match alone does not prove the editor is live — and
 * a workspace switch before the editor exists would never enter undo history,
 * masking the bug.
 */
async function waitForEditorReady(page: Page, timeoutMs = 20_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const ready = await page.evaluate(() => {
      const deepQuery = (root: Document | ShadowRoot, selector: string): Element | null => {
        const direct = root.querySelector(selector);
        if (direct) return direct;
        for (const el of Array.from(root.querySelectorAll('*'))) {
          if (el.shadowRoot) {
            const found = deepQuery(el.shadowRoot, selector);
            if (found) return found;
          }
        }
        return null;
      };
      const pane = deepQuery(document, 'code-editor-pane');
      return !!pane?.shadowRoot?.querySelector('.cm-content');
    });
    if (ready) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('CodeMirror editor never became ready (.cm-content absent)');
}

/** SPA navigation without a page reload — pushState + popstate, like the router. */
async function navigateInApp(page: Page, path: string): Promise<void> {
  await page.evaluate((p) => {
    history.pushState(null, '', p);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, path);
}

/** Click the CodeMirror content element so it takes keyboard focus. */
async function focusEditor(page: Page): Promise<void> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const rect = await page.evaluate(() => {
      const deepQuery = (root: Document | ShadowRoot, selector: string): Element | null => {
        const direct = root.querySelector(selector);
        if (direct) return direct;
        for (const el of Array.from(root.querySelectorAll('*'))) {
          if (el.shadowRoot) {
            const found = deepQuery(el.shadowRoot, selector);
            if (found) return found;
          }
        }
        return null;
      };
      const pane = deepQuery(document, 'code-editor-pane');
      const content = pane?.shadowRoot?.querySelector('.cm-content');
      const r = (content ?? pane)?.getBoundingClientRect();
      return r && r.width > 0
        ? { x: r.left + Math.min(r.width / 2, 100), y: r.top + Math.min(r.height / 2, 40) }
        : null;
    });
    if (rect) {
      await page.mouse.click(rect.x, rect.y);
      const focused = await page.evaluate(() => {
        // Walk the composed active-element chain into shadow roots.
        let el: Element | null = document.activeElement;
        while (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement;
        return el?.classList.contains('cm-content') ?? false;
      });
      if (focused) return;
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error('could not focus the CodeMirror editor');
}

async function typeInEditor(page: Page, text: string): Promise<void> {
  await focusEditor(page);
  // Move to the document start so the typed marker can't split an existing
  // sentinel line (the focus click lands mid-document).
  await page.keyboard.down('Meta');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.up('Meta');
  await page.keyboard.type(text, { delay: 15 });
}

async function pressUndo(page: Page): Promise<void> {
  await page.keyboard.down('Meta');
  await page.keyboard.press('KeyZ');
  await page.keyboard.up('Meta');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

interface RecordedSave {
  wsId: string;
  code: string;
  at: number;
}

interface RecordedThumbnailPut {
  wsId: string;
  kind: string;
  at: number;
}

let failures = 0;
function check(label: string, ok: boolean): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${label}`);
  if (!ok) failures++;
}

// Preflight: both dev servers must be reachable.
try {
  await fetch(`${PAGES_URL}/`);
  await fetch(`${DEV_API}/`);
} catch {
  console.error(`dev stack not reachable (${PAGES_URL} + ${DEV_API}) — run \`npm run dev:stack\``);
  process.exit(2);
}

const browser: Browser = await puppeteer.launch({
  headless: !opts.headful,
  defaultViewport: { width: 1400, height: 1000 },
});

const saves: RecordedSave[] = [];
const thumbnailPuts: RecordedThumbnailPut[] = [];

async function newAppPage(): Promise<Page> {
  const page = await browser.newPage();
  // Accept (not dismiss) dialogs: a dismissed beforeunload prompt would wedge
  // page.goto teardown navigations.
  page.on('dialog', (d) => void d.accept());
  page.on('pageerror', (err) => console.log('[pageerror]', err.message));
  page.on('request', (req) => {
    if (req.method() !== 'PUT') return;
    const thumb = new RegExp(`^${DEV_API}/workspace/([^/?]+)/thumbnail(?:\\?|$)`).exec(req.url());
    if (thumb) {
      const kind = new URL(req.url()).searchParams.get('kind') ?? 'manual';
      thumbnailPuts.push({ wsId: thumb[1], kind, at: Date.now() });
      return;
    }
    const m = new RegExp(`^${DEV_API}/workspace/([^/?]+)`).exec(req.url());
    if (!m) return;
    try {
      const body = JSON.parse(req.postData() ?? '{}') as { code?: string };
      if (typeof body.code === 'string') saves.push({ wsId: m[1], code: body.code, at: Date.now() });
    } catch {
      /* non-JSON body */
    }
  });
  await page.evaluateOnNewDocument(
    (key: string, id: string) => {
      (window as unknown as { __name?: <T>(fn: T) => T }).__name = <T>(fn: T): T => fn;
      // Record thumbnail-updated dispatches so scenarios can assert on them.
      document.addEventListener('thumbnail-updated', (e) => {
        const w = window as unknown as { __thumbnailEvents?: string[] };
        const detail = (e as unknown as { detail?: { workspaceId?: string } }).detail;
        (w.__thumbnailEvents ??= []).push(String(detail?.workspaceId ?? ''));
      });
      try {
        localStorage.setItem(key, id);
      } catch {
        /* ignore */
      }
    },
    ANON_KEY,
    ownerId,
  );
  return page;
}

async function openWorkspace(page: Page, wsId: string, marker: string): Promise<void> {
  await page.goto(`${PAGES_URL}/workspace/${wsId}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  try {
    await waitForEditorContains(page, marker);
    await waitForEditorReady(page);
  } catch (err) {
    console.error(
      `${(err as Error).message}\nWorkspace never loaded — is the served playground built against the local API?` +
        `\nRebuild with: PATHOGEN_API_BASE=${DEV_API} npm run build:playground`,
    );
    process.exit(2);
  }
}

const savesTo = (wsId: string, since: number): RecordedSave[] => saves.filter((s) => s.wsId === wsId && s.at >= since);

try {
  // -------------------------------------------------------------------------
  // Scenario 1 — undo bleed (the user's report)
  // -------------------------------------------------------------------------
  console.log('\n--- scenario 1: undo must not restore the previous workspace ---');
  const ws1A = await createLocalWorkspace('e2e-undo-A', CODE_A);
  const ws1B = await createLocalWorkspace('e2e-undo-B', CODE_B);
  const s1Start = Date.now();
  {
    const page = await newAppPage();
    await openWorkspace(page, ws1A, 'WORKSPACE-A');
    await navigateInApp(page, `/workspace/${ws1B}`);
    await waitForEditorContains(page, 'WORKSPACE-B');
    await typeInEditor(page, '// edit-in-B\n');
    await waitForEditorContains(page, 'edit-in-B');

    let everBecameA = false;
    let doc: string | null = null;
    for (let i = 0; i < 40; i++) {
      await pressUndo(page);
      await new Promise((r) => setTimeout(r, 60));
      doc = await readEditorCode(page);
      if (doc?.includes('WORKSPACE-A')) {
        everBecameA = true;
        break;
      }
    }
    check('undo never restores workspace A code into the B editor', !everBecameA);
    check(
      'editor settles at workspace B code after exhaustive undo',
      doc != null && doc.includes('WORKSPACE-B') && !doc.includes('edit-in-B'),
    );

    // Tear the page down. With the bug present, the beforeunload keepalive
    // save persists the undone-to-A doc into workspace B right here — no need
    // to wait out the 30s autosave interval to observe the destruction.
    await page.goto('about:blank');
    await new Promise((r) => setTimeout(r, 1_500));
    await page.close();
  }
  const persistedB = await fetchWorkspaceCode(ws1B);
  check(
    'workspace B server-side code survives the session (not replaced by A)',
    persistedB != null && persistedB.includes('WORKSPACE-B') && !persistedB.includes('WORKSPACE-A'),
  );
  const badSavesB = savesTo(ws1B, s1Start).filter((s) => s.code.includes('WORKSPACE-A'));
  check('no save request ever carried workspace A code to workspace B', badSavesB.length === 0);

  // -------------------------------------------------------------------------
  // Scenario 2 — pending edit in A is flushed on an in-app switch
  // -------------------------------------------------------------------------
  console.log('\n--- scenario 2: pending edits flushed when switching A→B ---');
  const ws2A = await createLocalWorkspace('e2e-flush-A', CODE_A);
  const ws2B = await createLocalWorkspace('e2e-flush-B', CODE_B);
  const s2Start = Date.now();
  {
    const page = await newAppPage();
    await openWorkspace(page, ws2A, 'WORKSPACE-A');
    await typeInEditor(page, '// pending-edit-A\n');
    await waitForEditorContains(page, 'pending-edit-A');
    await navigateInApp(page, `/workspace/${ws2B}`);
    await waitForEditorContains(page, 'WORKSPACE-B');
    await new Promise((r) => setTimeout(r, OBSERVE_MS));
    const flushed = savesTo(ws2A, s2Start).filter((s) => s.code.includes('pending-edit-A'));
    const crossB = savesTo(ws2A, s2Start).filter((s) => s.code.includes('WORKSPACE-B'));
    check('pending edit in A is persisted on switch (flush)', flushed.length >= 1);
    check('flush happens exactly once', flushed.length === 1);
    check('workspace B code is never saved into workspace A', crossB.length === 0);
    await page.close();
  }

  // -------------------------------------------------------------------------
  // Scenario 3 — `?state=` share link must not be saved into A
  // -------------------------------------------------------------------------
  console.log('\n--- scenario 3: ?state= share link never autosaved into A ---');
  const ws3A = await createLocalWorkspace('e2e-share-A', CODE_A);
  const s3Start = Date.now();
  {
    const page = await newAppPage();
    await openWorkspace(page, ws3A, 'WORKSPACE-A');
    await typeInEditor(page, '// pending-edit-A2\n');
    await waitForEditorContains(page, 'pending-edit-A2');
    await navigateInApp(page, `/workspace/scratch?state=${encodeState(SHARED_CODE)}`);
    await waitForEditorContains(page, 'SHARED-LINK');
    await new Promise((r) => setTimeout(r, OBSERVE_MS));
    const sharedIntoA = savesTo(ws3A, s3Start).filter((s) => s.code.includes('SHARED-LINK'));
    const flushed = savesTo(ws3A, s3Start).filter((s) => s.code.includes('pending-edit-A2'));
    check('shared-link code is never saved into workspace A', sharedIntoA.length === 0);
    check('pending edit in A is persisted before opening the share link', flushed.length === 1);
    await page.close();
  }
  // The true post-fix contract: A's server-side code is the flushed edit —
  // never the share-link code (which the stale keepalive save used to write
  // into A on page teardown).
  const persisted3A = await fetchWorkspaceCode(ws3A);
  check(
    'workspace A server-side code is the flushed edit after the share-link visit',
    persisted3A != null && persisted3A.includes('pending-edit-A2') && !persisted3A.includes('SHARED-LINK'),
  );
  if (persisted3A == null || !persisted3A.includes('pending-edit-A2') || persisted3A.includes('SHARED-LINK')) {
    console.log('  [debug] ws3A server code:', JSON.stringify(persisted3A?.slice(0, 200) ?? null));
    console.log(
      '  [debug] all recorded saves to ws3A:',
      JSON.stringify(savesTo(ws3A, 0).map((s) => s.code.slice(0, 60))),
    );
  }

  // -------------------------------------------------------------------------
  // Scenario 4 — 404 fallback (defaultCode) must not be saved into A
  // -------------------------------------------------------------------------
  console.log('\n--- scenario 4: 404 defaultCode fallback never autosaved into A ---');
  const ws4A = await createLocalWorkspace('e2e-404-A', CODE_A);
  const s4Start = Date.now();
  {
    const page = await newAppPage();
    await openWorkspace(page, ws4A, 'WORKSPACE-A');
    await typeInEditor(page, '// pending-edit-A3\n');
    await waitForEditorContains(page, 'pending-edit-A3');
    await navigateInApp(page, '/workspace/zzz-e2e-nonexistent');
    // The 404 fallback swaps in defaultCode — wait for A's code to be gone.
    const start404 = Date.now();
    let fallbackDoc: string | null = null;
    while (Date.now() - start404 < 20_000) {
      fallbackDoc = await readEditorCode(page);
      if (fallbackDoc && !fallbackDoc.includes('WORKSPACE-A')) break;
      await new Promise((r) => setTimeout(r, 250));
    }
    check(
      '404 route swaps the editor away from workspace A',
      fallbackDoc != null && !fallbackDoc.includes('WORKSPACE-A'),
    );
    await new Promise((r) => setTimeout(r, OBSERVE_MS));
    const defaultIntoA =
      fallbackDoc == null ? [] : savesTo(ws4A, s4Start).filter((s) => s.code.trim() === fallbackDoc.trim());
    const flushed = savesTo(ws4A, s4Start).filter((s) => s.code.includes('pending-edit-A3'));
    check('defaultCode is never saved into workspace A', defaultIntoA.length === 0);
    check('pending edit in A is persisted before the 404 route', flushed.length === 1);
    await page.close();
  }
  const persisted4A = await fetchWorkspaceCode(ws4A);
  check(
    'workspace A server-side code is the flushed edit after the 404 visit',
    persisted4A != null && persisted4A.includes('pending-edit-A3') && persisted4A.includes('WORKSPACE-A'),
  );
  if (persisted4A == null || !persisted4A.includes('pending-edit-A3') || !persisted4A.includes('WORKSPACE-A')) {
    console.log('  [debug] ws4A server code:', JSON.stringify(persisted4A?.slice(0, 200) ?? null));
    console.log(
      '  [debug] all recorded saves to ws4A:',
      JSON.stringify(savesTo(ws4A, 0).map((s) => s.code.slice(0, 60))),
    );
  }

  // -------------------------------------------------------------------------
  // Scenario 5 — leaving the workspace view and returning re-arms autosave
  // -------------------------------------------------------------------------
  // Leaving flushes AND stops autosave; returning to the SAME workspace used
  // to skip initialize() entirely (the `_initialized && same id` guard), so
  // autosave.init() never re-fired — every edit after returning was silently
  // never saved for the rest of the session.
  console.log('\n--- scenario 5: away-and-back to the same workspace re-arms autosave ---');
  const ws5A = await createLocalWorkspace('e2e-return-A', CODE_A);
  const s5Start = Date.now();
  {
    const page = await newAppPage();
    await openWorkspace(page, ws5A, 'WORKSPACE-A');
    // Leave to the landing view and come back — all in-app, same tab.
    await navigateInApp(page, '/workspaces');
    await new Promise((r) => setTimeout(r, 1_000));
    await navigateInApp(page, `/workspace/${ws5A}`);
    await waitForEditorContains(page, 'WORKSPACE-A');
    await waitForEditorReady(page);
    // Edit after returning, then leave again: the leave-view flush must
    // persist it (it force-saves past MIN_INTERVAL). With autosave disarmed,
    // this flush is a silent no-op and the edit is lost.
    await typeInEditor(page, '// after-return-edit\n');
    await waitForEditorContains(page, 'after-return-edit');
    await navigateInApp(page, '/workspaces');
    await new Promise((r) => setTimeout(r, 3_000));
    const savedAfterReturn = savesTo(ws5A, s5Start).filter((s) => s.code.includes('after-return-edit'));
    check('edit made after returning to the workspace is persisted', savedAfterReturn.length >= 1);
    check('after-return edit is saved exactly once', savedAfterReturn.length === 1);

    // Regression guard for the other half of the contract: a `?state=`
    // scratch visit never arms autosave, so leaving and returning must NOT
    // force a re-initialize (which would re-decode the URL's original code
    // and discard the user's in-memory edits).
    await navigateInApp(page, `/workspace/scratch?state=${encodeState(SHARED_CODE)}`);
    await waitForEditorContains(page, 'SHARED-LINK');
    await waitForEditorReady(page);
    await typeInEditor(page, '// scratch-tweak\n');
    await waitForEditorContains(page, 'scratch-tweak');
    await navigateInApp(page, '/workspaces');
    await new Promise((r) => setTimeout(r, 500));
    await navigateInApp(page, `/workspace/scratch?state=${encodeState(SHARED_CODE)}`);
    await new Promise((r) => setTimeout(r, 1_500));
    const scratchDoc = await readEditorCode(page);
    check(
      'in-memory edits to a ?state= scratch doc survive leaving and returning',
      scratchDoc?.includes('scratch-tweak') === true,
    );
    await page.close();
  }
  const persisted5A = await fetchWorkspaceCode(ws5A);
  check(
    'workspace A server-side code contains the after-return edit',
    persisted5A?.includes('after-return-edit') === true,
  );
  if (persisted5A?.includes('after-return-edit') !== true) {
    console.log('  [debug] ws5A server code:', JSON.stringify(persisted5A?.slice(0, 200) ?? null));
    console.log(
      '  [debug] all recorded saves to ws5A:',
      JSON.stringify(savesTo(ws5A, 0).map((s) => s.code.slice(0, 60))),
    );
  }

  // -------------------------------------------------------------------------
  // Scenario 6 — in-app switch refreshes the OLD workspace's thumbnail
  // -------------------------------------------------------------------------
  // Leaving the workspace view generates the old workspace's thumbnail if its
  // content changed; a workspace→workspace switch used to skip this entirely,
  // leaving A's card thumbnail stale. Also backstops the cross-workspace hash
  // stamp: A's generation completing after B loads must not mark B "clean"
  // (which would suppress B's own thumbnail on its next leave).
  console.log("\n--- scenario 6: switching refreshes the old workspace's thumbnail ---");
  const ws6A = await createLocalWorkspace('e2e-thumb-A', CODE_A);
  const ws6B = await createLocalWorkspace('e2e-thumb-B', CODE_B);
  const s6Start = Date.now();
  {
    const page = await newAppPage();
    await openWorkspace(page, ws6A, 'WORKSPACE-A');
    await typeInEditor(page, '// thumb-edit-A\n');
    await waitForEditorContains(page, 'thumb-edit-A');
    // Let the compile settle so the preview holds A's rendered content.
    await new Promise((r) => setTimeout(r, 1_000));
    await navigateInApp(page, `/workspace/${ws6B}`);
    await waitForEditorContains(page, 'WORKSPACE-B');
    await waitForEditorReady(page);
    // Type in B promptly — pre-fix, A's in-flight generation completing after
    // this would stamp B's content hash as "already thumbnailed".
    await typeInEditor(page, '// thumb-edit-B\n');
    await waitForEditorContains(page, 'thumb-edit-B');
    await new Promise((r) => setTimeout(r, OBSERVE_MS));

    const thumbsA = thumbnailPuts.filter((t) => t.wsId === ws6A && t.at >= s6Start);
    check(
      'switch triggers an auto thumbnail upload for workspace A',
      thumbsA.some((t) => t.kind === 'auto'),
    );
    check(
      'switch triggers a hero upload for workspace A',
      thumbsA.some((t) => t.kind === 'hero'),
    );
    const events = await page.evaluate(
      () => (window as unknown as { __thumbnailEvents?: string[] }).__thumbnailEvents ?? [],
    );
    check('thumbnail-updated event fired for workspace A', events.includes(ws6A));

    // Leave to the landing view: B was edited, so B's thumbnail must generate
    // now — the regression backstop for the cross-workspace hash stamp.
    await navigateInApp(page, '/workspaces');
    await new Promise((r) => setTimeout(r, OBSERVE_MS));
    const thumbsB = thumbnailPuts.filter((t) => t.wsId === ws6B && t.at >= s6Start);
    check(
      'leaving after the switch uploads workspace B thumbnail (no cross-workspace stamp)',
      thumbsB.some((t) => t.kind === 'auto'),
    );
    await page.close();
  }

  // Global invariant across all scenarios: thumbnail uploads only ever
  // target real workspaces this user owns — never `scratch`, a 404 id, or
  // someone else's workspace (the ownership guard; pre-guard, leaving a
  // ?state= visit PUT a thumbnail to the bogus id "scratch" and surfaced a
  // spurious "Thumbnail not updated" error toast).
  const foreignThumbPuts = thumbnailPuts.filter((t) => !createdWorkspaces.includes(t.wsId));
  check('thumbnail uploads only target owned workspaces', foreignThumbPuts.length === 0);
  if (failures > 0) {
    console.log('  [debug] recorded thumbnail PUTs:', JSON.stringify(thumbnailPuts));
  }
} finally {
  await browser.close();
  for (const id of createdWorkspaces) await deleteLocalWorkspace(id);
}

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
