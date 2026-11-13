// Phase 2d, step 3 (note 52): several open files. The served playground
// shows one tab per open file and keeps each file's undo; every edited file
// is saved, by the page-teardown save too and across a workspace switch;
// with a library's tab open, the main's error marks nothing in the library.
// Files are opened through the `open-file` event: the tree that sends it
// comes in step 4.
//
//   npm run dev:stack
//   npx tsx project-docs/modules/verify/verify-2d-step3.ts

import puppeteer from 'puppeteer';

import type { Page } from 'puppeteer';

const PAGES_URL = 'http://localhost:3000';
const DEV_API = 'http://localhost:8787';
const ANON_KEY = 'pathogen-lang:userId';
const SHOTS = 'project-docs/modules/verify';
const ownerId = Array.from(
  { length: 21 },
  () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)],
).join('');

const GEARS = 'module;\nexport fn gear(r) {\n  circle(0, 0, r);\n}\n';
const KIT = 'module;\nexport const teeth = 12;\n';
const DEMO = 'import { gear } from "../parts/gears.pathogen";\ndefine ViewBox(-10, -10, 20, 20);\ngear(6);\n';
const MAIN = 'import { gear } from "./parts/gears.pathogen";\ndefine ViewBox(-10, -10, 20, 20);\ngear(4);\n';
const BROKEN_MAIN = 'import { gear } from "./parts/gears.pathogen";\ndefine ViewBox(-10, -10, 20, 20);\ngear(nope);\n';
const OTHER = 'define ViewBox(0, 0, 20, 20);\ncircle(10, 10, 5);\n';

let failures = 0;
const check = (label: string, ok: boolean, detail?: unknown): void => {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${label}${ok ? '' : ` ${JSON.stringify(detail)?.slice(0, 600)}`}`);
  if (!ok) failures++;
};

async function api(method: string, path: string, body?: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(`${DEV_API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-User-Id': ownerId, Connection: 'close' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  return text ? (JSON.parse(text) as Record<string, unknown>) : {};
}

async function create(name: string, files: Record<string, string>): Promise<string> {
  const data = await api('POST', '/workspace', {
    name,
    files: Object.fromEntries(Object.entries(files).map(([p, text]) => [p, { text }])),
    entryPoints: ['main.pathogen'],
  });
  return data.id as string;
}

async function serverTexts(id: string): Promise<Record<string, string>> {
  const data = await api('GET', `/workspace/${id}`);
  const files = (data.files ?? {}) as Record<string, { text?: string }>;
  return Object.fromEntries(Object.entries(files).map(([p, f]) => [p, f.text ?? '']));
}

async function waitFor<T>(what: string, probe: () => Promise<T | null | false>, ms = 30_000): Promise<T | null> {
  const start = Date.now();
  while (Date.now() - start < ms) {
    const value = await probe();
    if (value) return value;
    await new Promise((r) => setTimeout(r, 200));
  }
  console.log(`  (timed out waiting for ${what})`);
  return null;
}

// Run in the page: find an element through shadow roots.
const FIND = `
  window.__find = (sel) => {
    const walk = (root) => {
      const hit = root.querySelector(sel);
      if (hit) return hit;
      for (const el of root.querySelectorAll('*')) {
        const inner = el.shadowRoot ? walk(el.shadowRoot) : null;
        if (inner) return inner;
      }
      return null;
    };
    return walk(document);
  };
`;

/** What the editor area shows: the tabs, the file crumb, the editor's text, and its error marks. */
async function editorState(page: Page): Promise<{
  tabs: { label: string; path: string; selected: boolean; kind: string; closable: boolean }[];
  crumb: string;
  code: string;
  errorLines: number;
  docsPressed: string | null;
}> {
  return page.evaluate(`(() => {
    const tabsEl = window.__find('editor-tabs');
    const tabs = [...(tabsEl?.shadowRoot?.querySelectorAll('[role="tab"]') ?? [])].map((t) => ({
      label: t.textContent.trim(),
      path: t.dataset.path,
      selected: t.getAttribute('aria-selected') === 'true',
      kind: t.className.replace('tab ', '').replace(' sole', ''),
      closable: !!t.querySelector('.close'),
    }));
    const pane = window.__find('code-editor-pane');
    return {
      tabs,
      crumb: window.__find('.breadcrumb-file')?.textContent ?? '',
      code: pane?.code ?? '',
      errorLines: pane?.shadowRoot?.querySelectorAll('.cm-error-line').length ?? 0,
      docsPressed: tabsEl?.shadowRoot?.querySelector('.docs')?.getAttribute('aria-pressed') ?? null,
    };
  })()`);
}

/** Open a file the way the tree will: the `open-file` event. The editor keeps focus, so nothing saves. */
async function openFile(page: Page, path: string): Promise<void> {
  await page.evaluate(
    `window.__find('code-editor-pane').dispatchEvent(new CustomEvent('open-file', { bubbles: true, composed: true, detail: { path: ${JSON.stringify(path)} } }))`,
  );
}

async function clickTab(page: Page, path: string): Promise<void> {
  await page.evaluate(
    `window.__find('editor-tabs').shadowRoot.querySelector('[data-path="${path}"] .label').click()`,
  );
}

/** A real mouse click on a tab: it moves focus, so the editor blurs and saves, as a person's click does. */
async function mouseClickTab(page: Page, path: string): Promise<void> {
  const box = (await page.evaluate(`(() => {
    const r = window.__find('editor-tabs').shadowRoot.querySelector('[data-path="${path}"] .label').getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  })()`)) as { x: number; y: number };
  await page.mouse.click(box.x, box.y);
}

async function mouseClickClose(page: Page, path: string): Promise<void> {
  const box = (await page.evaluate(`(() => {
    const r = window.__find('editor-tabs').shadowRoot.querySelector('[data-path="${path}"] .close').getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  })()`)) as { x: number; y: number };
  await page.mouse.click(box.x, box.y);
}

async function editorScrollTop(page: Page): Promise<number> {
  return (await page.evaluate(
    `window.__find('code-editor-pane').shadowRoot.querySelector('.cm-scroller').scrollTop`,
  )) as number;
}

async function focusEditorEnd(page: Page): Promise<void> {
  await page.evaluate(`window.__find('code-editor-pane').shadowRoot.querySelector('.cm-content').focus()`);
  await page.keyboard.down('Meta');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.up('Meta');
}

async function undo(page: Page, times: number, redo = false): Promise<void> {
  for (let i = 0; i < times; i++) {
    await page.keyboard.down('Meta');
    if (redo) await page.keyboard.down('Shift');
    await page.keyboard.press('KeyZ');
    if (redo) await page.keyboard.up('Shift');
    await page.keyboard.up('Meta');
  }
}

async function previewSvg(page: Page): Promise<string> {
  for (const frame of page.frames()) {
    const svg = await frame.evaluate(() => document.querySelector('svg')?.outerHTML ?? '').catch(() => '');
    if (svg.includes('<path')) return svg;
  }
  return '';
}

async function open(page: Page, id: string): Promise<void> {
  await page.goto(`${PAGES_URL}/workspace/${id}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await waitFor('the editor', async () => (await editorState(page)).code.length > 0);
}

const made: string[] = [];
const browser = await puppeteer.launch({ headless: true, defaultViewport: { width: 1320, height: 860 } });
try {
  const page = await browser.newPage();
  page.on('dialog', (d) => void d.accept());
  const pageErrors: string[] = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));
  const saves: { id: string; body: Record<string, unknown> }[] = [];
  page.on('request', (req) => {
    if (req.method() === 'PUT' && req.url().startsWith(`${DEV_API}/workspace/`)) {
      const body = JSON.parse(req.postData() ?? '{}') as Record<string, unknown>;
      if (body.files || body.code) saves.push({ id: req.url().split('/').pop()!, body });
    }
  });
  await page.evaluateOnNewDocument(FIND);
  await page.evaluateOnNewDocument(
    (key: string, value: string) => {
      localStorage.setItem(key, value);
      localStorage.setItem('pathogen-theme', 'light');
    },
    ANON_KEY,
    ownerId,
  );

  const a = await create('2d tabs', {
    'main.pathogen': MAIN,
    'parts/gears.pathogen': GEARS,
    'parts/kit.pathogen': KIT,
    'demos/gears.pathogen': DEMO,
  });
  made.push(a);

  // 1. One tab and the file crumb. Its × came with step 4d: every tab closes,
  // the last one too, to the editor's zero-state (verify-2d-step4d.ts).
  await open(page, a);
  let state = await editorState(page);
  check(
    'a workspace opens on its main: one tab, with its × (step 4d), and the crumb main.pathogen',
    state.tabs.length === 1 &&
      state.tabs[0].label === 'main' &&
      state.tabs[0].selected &&
      state.tabs[0].closable &&
      state.crumb === 'main.pathogen',
    state,
  );
  const drawnMain = await waitFor('the preview', async () => {
    const s = await previewSvg(page);
    return s.includes('a 4 4 0 1 1 8 0') ? s : null;
  });
  check('the preview draws the main', drawnMain !== null);

  // 2. Edit main, open the library, edit it: two files changed, nothing saved yet.
  await focusEditorEnd(page);
  await page.keyboard.type('gear(2);\n', { delay: 10 });
  await openFile(page, 'parts/gears.pathogen');
  state = await editorState(page);
  check(
    'opening the library adds its tab, shows its text, and the crumb names its folder',
    state.tabs.map((t) => `${t.label}:${t.kind}:${t.selected}`).join(' ') === 'main:program:false gears:library:true' &&
      state.code === GEARS &&
      state.crumb === 'parts/gears.pathogen',
    state,
  );
  await focusEditorEnd(page);
  await page.keyboard.type('// edited in gears\n', { delay: 10 });
  const svgAfter = await previewSvg(page);
  check('the preview stays on the main while the library is open', svgAfter.includes('a 4 4 0 1 1 8 0'), svgAfter.slice(0, 200));

  // 3. Undo is per file: undoing everything in gears leaves main's edit.
  await undo(page, 40);
  state = await editorState(page);
  check('Cmd-Z in the library undoes only the library', state.code === GEARS, state.code);
  await undo(page, 40, true);
  state = await editorState(page);
  check('Cmd-Shift-Z redoes it', state.code === `${GEARS}// edited in gears\n`, state.code);
  await openFile(page, 'main.pathogen');
  state = await editorState(page);
  check('main kept its own edit', state.code === `${MAIN}gear(2);\n`, state.code);
  await focusEditorEnd(page);
  await undo(page, 1);
  const undoneOnce = (await editorState(page)).code;
  await undo(page, 1, true);
  state = await editorState(page);
  check(
    "main kept its own undo history across the switch",
    undoneOnce !== state.code && state.code === `${MAIN}gear(2);\n`,
    { undoneOnce, now: state.code },
  );

  // 4. Two files named gears: their folders tell them apart.
  await openFile(page, 'demos/gears.pathogen');
  await openFile(page, 'parts/kit.pathogen');
  state = await editorState(page);
  check(
    'two open gears get their folders; every tab has its ×',
    state.tabs.map((t) => t.label).join(', ') === 'main, gears · parts, gears · demos, kit' &&
      state.tabs.every((t) => t.closable),
    state.tabs,
  );
  await page.screenshot({ path: `${SHOTS}/2d-step3-tabs-light.png` });

  // 5. The page-teardown save: both edited files, as text, before the page goes.
  //    (Nothing has saved yet: no blur, no Cmd-S, and autosave waits 30 s after a load.)
  check(
    'nothing was saved before the reload, so the teardown save is what saves',
    !saves.some((s) => s.id === a),
    saves,
  );
  const before = saves.length;
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitFor('the editor after the reload', async () => (await editorState(page)).code.length > 0);
  const teardown = saves.slice(before).find((s) => s.id === a);
  const tdFiles = (teardown?.body.files ?? {}) as Record<string, { text?: string; sha256?: string }>;
  check(
    'the teardown save sent both edited files as text, the others by hash',
    tdFiles['main.pathogen']?.text === `${MAIN}gear(2);\n` &&
      tdFiles['parts/gears.pathogen']?.text === `${GEARS}// edited in gears\n` &&
      typeof tdFiles['parts/kit.pathogen']?.sha256 === 'string' &&
      typeof tdFiles['demos/gears.pathogen']?.sha256 === 'string',
    teardown?.body,
  );
  const held = await waitFor('the server to hold both edits', async () => {
    const t = await serverTexts(a);
    return t['main.pathogen'] === `${MAIN}gear(2);\n` && t['parts/gears.pathogen'] === `${GEARS}// edited in gears\n`
      ? t
      : null;
  });
  check('after the reload the server holds both edits', held !== null, await serverTexts(a));
  state = await editorState(page);
  check(
    'the reloaded workspace opens on its main, one tab, with the saved text',
    state.tabs.length === 1 && state.code === `${MAIN}gear(2);\n`,
    state,
  );

  // 5b. Quick tab clicks after an edit: each click blurs the editor, and each
  //     blur saves. The saves go one at a time, so none 409s another (a 409
  //     reads as another tab: the banner, and no more saving).
  await openFile(page, 'parts/gears.pathogen');
  await openFile(page, 'main.pathogen');
  await focusEditorEnd(page);
  await page.keyboard.type('gear(5);\n', { delay: 10 });
  const clicksFrom = saves.length;
  await mouseClickTab(page, 'parts/gears.pathogen');
  await mouseClickTab(page, 'main.pathogen');
  await mouseClickTab(page, 'parts/gears.pathogen');
  await mouseClickTab(page, 'main.pathogen');
  const settledAfterClicks = await waitFor('the clicks’ saves to settle', async () => {
    const t = await serverTexts(a);
    const status = await page.evaluate(`import('/state/store.js').then((m) => m.store.get('saveStatus'))`);
    return t['main.pathogen']?.includes('gear(5);') && status === 'saved' ? t : null;
  });
  const clickSaves = saves.slice(clicksFrom).filter((s) => s.id === a);
  const revs = clickSaves.map((s) => s.body.baseRev);
  const conflicted = await page.evaluate(`import('/state/store.js').then((m) => m.store.get('multiTabWarning'))`);
  check(
    'quick tab clicks after an edit: the save lands, each request from a new revision, and no conflict',
    settledAfterClicks !== null && conflicted === false && new Set(revs).size === revs.length && revs.length >= 1,
    { revs, conflicted, saved: settledAfterClicks !== null },
  );

  // 5c. A file keeps its undo after its tab is closed (docs/workspace-files.md).
  await openFile(page, 'parts/gears.pathogen');
  const gearsBefore = (await editorState(page)).code;
  await focusEditorEnd(page);
  await page.keyboard.type('// closed and reopened\n', { delay: 10 });
  await mouseClickClose(page, 'parts/gears.pathogen');
  state = await editorState(page);
  const closed = !state.tabs.some((t) => t.path === 'parts/gears.pathogen');
  await openFile(page, 'parts/gears.pathogen');
  const reopened = (await editorState(page)).code;
  await focusEditorEnd(page);
  // CodeMirror keeps Enter as its own undo step: undo until the edit is gone
  // (a fresh state, with no history, would change nothing at all).
  let undos = 0;
  while (undos < 6 && (await editorState(page)).code !== gearsBefore) {
    await undo(page, 1);
    undos++;
  }
  state = await editorState(page);
  check(
    'a closed tab’s file keeps its undo: reopened, Cmd-Z takes back the edit made before closing',
    closed && reopened === `${gearsBefore}// closed and reopened\n` && state.code === gearsBefore,
    { closed, reopened, undos, now: state.code },
  );
  await openFile(page, 'main.pathogen');

  // 6. A workspace switch saves the old workspace's edited files, and the next
  //    one starts with its own single tab and no undo history.
  const b = await create('2d other', { 'main.pathogen': OTHER });
  made.push(b);
  await focusEditorEnd(page);
  await page.keyboard.type('gear(3);\n', { delay: 10 });
  await openFile(page, 'parts/kit.pathogen');
  await focusEditorEnd(page);
  await page.keyboard.type('export const spokes = 6;\n', { delay: 10 });
  await page.evaluate(`import('/utils/router.js').then((m) => m.navigateTo('/workspace/${b}'))`);
  await waitFor('the other workspace', async () => (await editorState(page)).code === OTHER);
  const switched = await waitFor('the switch save', async () => {
    const t = await serverTexts(a);
    return t['main.pathogen']?.includes('gear(3);') && t['parts/kit.pathogen']?.includes('spokes') ? t : null;
  });
  check('switching workspaces saved both files edited in the one left', switched !== null, await serverTexts(a));
  state = await editorState(page);
  check('the next workspace has its own one tab', state.tabs.length === 1 && state.tabs[0].label === 'main', state.tabs);
  await focusEditorEnd(page);
  await undo(page, 5);
  state = await editorState(page);
  check("Cmd-Z there doesn't bring back the other workspace's history", state.code === OTHER, state.code);

  // 7. An error in the main shown: marked in main, and not in a library's tab.
  const c = await create('2d broken', { 'main.pathogen': BROKEN_MAIN, 'parts/gears.pathogen': GEARS });
  made.push(c);
  await open(page, c);
  const marked = await waitFor('the error marks', async () => ((await editorState(page)).errorLines > 0 ? true : null));
  check('the main’s error is marked in the main', marked !== null);
  await openFile(page, 'parts/gears.pathogen');
  await new Promise((r) => setTimeout(r, 800));
  state = await editorState(page);
  // Since step 7 the panel puts each error under its file's name: "main.pathogen", then "Line 3: …".
  const panel = await page.evaluate(`window.__find('error-panel')?.message ?? ''`);
  check(
    "with the library open, nothing is marked in it, and the panel names the main's line",
    state.errorLines === 0 && String(panel).startsWith('main.pathogen\nLine 3'),
    { errorLines: state.errorLines, panel: String(panel).slice(0, 300) },
  );
  await clickTab(page, 'main.pathogen');
  const back = await waitFor('the marks back in main', async () => ((await editorState(page)).errorLines > 0 ? true : null));
  check('back in main, its error is marked again', back !== null);

  // 7b. Each file keeps where it was scrolled to.
  const longMain = `define ViewBox(0, 0, 20, 20);\n${Array.from({ length: 240 }, (_, i) => `// line ${i + 2}`).join('\n')}\ncircle(10, 10, 5);\n`;
  const d = await create('2d scroll', { 'main.pathogen': longMain, 'parts/gears.pathogen': GEARS });
  made.push(d);
  await open(page, d);
  await page.evaluate(`(() => {
    const s = window.__find('code-editor-pane').shadowRoot.querySelector('.cm-scroller');
    s.scrollTop = s.scrollHeight;
  })()`);
  await new Promise((r) => setTimeout(r, 300));
  const scrolledTo = await editorScrollTop(page);
  await openFile(page, 'parts/gears.pathogen');
  await new Promise((r) => setTimeout(r, 300));
  const inGears = await editorScrollTop(page);
  await openFile(page, 'main.pathogen');
  await new Promise((r) => setTimeout(r, 300));
  const backAt = await editorScrollTop(page);
  check(
    'switching away and back keeps where the file was scrolled to; the other file starts at its top',
    scrolledTo > 1000 && Math.abs(backAt - scrolledTo) < 40 && inGears === 0,
    { scrolledTo, inGears, backAt },
  );

  // 8. Docs at the right end of the tabs.
  await page.evaluate(`window.__find('editor-tabs').shadowRoot.querySelector('.docs').click()`);
  const docsOpen = await page.evaluate(`window.__find('docs-panel').classList.contains('open')`);
  state = await editorState(page);
  check('Docs opens the docs, and says so', docsOpen === true && state.docsPressed === 'true', {
    docsOpen,
    pressed: state.docsPressed,
  });
  await page.keyboard.press('Escape');
  state = await editorState(page);
  check('Escape closes them, and the button follows', state.docsPressed === 'false', state.docsPressed);

  // 9. Screenshots in dark mode.
  await open(page, a);
  await openFile(page, 'parts/gears.pathogen');
  await openFile(page, 'demos/gears.pathogen');
  await page.evaluate(`localStorage.setItem('pathogen-theme', 'dark')`);
  await page.evaluateOnNewDocument(() => localStorage.setItem('pathogen-theme', 'dark'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitFor('the editor', async () => (await editorState(page)).code.length > 0);
  await openFile(page, 'parts/gears.pathogen');
  await openFile(page, 'demos/gears.pathogen');
  await openFile(page, 'parts/kit.pathogen');
  await new Promise((r) => setTimeout(r, 600));
  await page.screenshot({ path: `${SHOTS}/2d-step3-tabs-dark.png` });

  // 10. The component's storybook entry, dark then light.
  for (const theme of ['dark', 'light']) {
    await page.evaluateOnNewDocument((t: string) => localStorage.setItem('pathogen-theme', t), theme);
    await page.goto(`${PAGES_URL}/storybook/editor-tabs`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await waitFor('the story', async () => page.evaluate(`!!window.__find('editor-tabs')?.shadowRoot?.querySelector('[role="tab"]')`));
    // Each story in turn, stacked into one picture: click its button, keep the demo's box.
    const names = (await page.evaluate(`(() => {
      const first = window.__find('.story-tab');
      return [...(first?.parentElement?.querySelectorAll('.story-tab') ?? [])].map((b) => b.textContent.trim());
    })()`)) as string[];
    for (const [i] of names.entries()) {
      await page.evaluate(`window.__find('.story-tab[data-story="${i}"]')?.click()`);
      await new Promise((r) => setTimeout(r, 400));
      // The story's tabs: the hidden workspace view has its own <editor-tabs> too.
      const box = (await page.evaluate(`(() => {
        const r = window.__find('.story-tab').getRootNode().querySelector('editor-tabs').getBoundingClientRect();
        return { x: Math.max(0, r.x - 16), y: Math.max(0, r.y - 16), width: Math.min(1000, r.width + 32), height: r.height + 32 };
      })()`)) as { x: number; y: number; width: number; height: number };
      await page.screenshot({ path: `${SHOTS}/2d-step3-story-${i + 1}-${theme}.png`, clip: box });
    }
    check(`the storybook shows the five stories (${theme})`, names.length === 5, names);
  }

  check('no page errors', pageErrors.length === 0, pageErrors);
} finally {
  await browser.close();
  for (const id of made) await api('DELETE', `/workspace/${id}`);
}

console.log(failures === 0 ? '\nall passed' : `\n${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
