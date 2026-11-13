// Phase 2d, step 5b (note 52; mockup v6 screen G): every program drawn small.
// In the served playground:
// - a workspace with one program starts no second compiler;
// - after a load, the programs not shown compile on their own worker, and no
//   miniature is made while the list is closed;
// - opened, each row shows its own drawing on the canvas colour;
// - an edit to gears spins the two programs not shown (the dots on all three),
//   and redraws them; an edit to kit spins and redraws try-sizes only;
// - an error in kit: try-sizes says where, the chip's red dot; fixed, gone;
// - editing try-sizes: its own dot; the program shown's own error row;
// - a rename keeps the miniature with no compile; a delete releases its URL;
//   a workspace switch releases them all;
// - long tasks with a heavy program not shown (its tile blank), against a
//   control without it;
// - light, dark, and the storybook.
//
//   npm run dev:stack
//   npx tsx project-docs/modules/verify/verify-2d-step5b.ts

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

const GEARS = 'module;\n\nexport fn gear(cx, cy, r) {\n  circle(cx, cy, r);\n  circle(cx, cy, r * 0.3);\n}\n';
const GEARS_EDITED = 'module;\n\nexport fn gear(cx, cy, r) {\n  circle(cx, cy, r);\n  circle(cx, cy, r * 0.5);\n}\n';
const KIT = 'module;\nimport { gear } from "./gears.pathogen";\n\nexport fn ring(cx, cy, r) {\n  gear(cx, cy, r);\n}\n';
const KIT_EDITED =
  'module;\nimport { gear } from "./gears.pathogen";\n\nexport fn ring(cx, cy, r) {\n  gear(cx, cy, r + 2);\n}\n';
// Line 6: an index past the end, when try-sizes calls ring.
const KIT_BROKEN =
  'module;\nimport { gear } from "./gears.pathogen";\n\nexport fn ring(cx, cy, r) {\n  let sizes = [1];\n  gear(cx, cy, sizes[5]);\n}\n';
const FILES: Record<string, string> = {
  'main.pathogen':
    'import { gear } from "./parts/gears.pathogen";\n\ndefine ViewBox(0, 0, 200, 100);\ngear(55, 50, 40);\ngear(150, 50, 28);\n',
  'demos/gears.pathogen':
    'import { gear } from "../parts/gears.pathogen";\n\ndefine ViewBox(0, 0, 200, 100);\ngear(40, 50, 22);\ngear(100, 50, 22);\ngear(160, 50, 22);\n',
  'try-sizes.pathogen':
    'import { ring } from "./parts/kit.pathogen";\n\ndefine ViewBox(0, 0, 200, 100);\nring(60, 50, 12);\nring(140, 50, 30);\n',
  'parts/gears.pathogen': GEARS,
  'parts/kit.pathogen': KIT,
};
const ENTRY = ['main.pathogen', 'demos/gears.pathogen', 'try-sizes.pathogen'];

// A program too large to draw small: 40,000 segments.
const HEAVY = 'for (i in 0..<200) {\n  for (j in 0..<200) {\n    L calc(i + j / 200) calc(j / 2 + sin(i))\n  }\n}\n';
const LIGHT = 'circle(100, 100, 40);\n';

let failures = 0;
const check = (label: string, ok: boolean, detail?: unknown): void => {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${label}${ok ? '' : ` ${JSON.stringify(detail)?.slice(0, 900)}`}`);
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

async function waitFor<T>(what: string, probe: () => Promise<T | null | false>, ms = 30_000): Promise<T | null> {
  const start = Date.now();
  while (Date.now() - start < ms) {
    const value = await probe();
    if (value) return value;
    await new Promise((r) => setTimeout(r, 150));
  }
  console.log(`  (timed out waiting for ${what})`);
  return null;
}

const pause = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

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
  // The main thread's stalls: a 20 ms tick, and the longest wait past it, since the last reset.
  window.__stall = { max: 0, total: 0 };
  let last = performance.now();
  setInterval(() => {
    const now = performance.now();
    const late = now - last - 20;
    if (late > 30) {
      window.__stall.max = Math.max(window.__stall.max, late);
      window.__stall.total += late;
    }
    last = now;
  }, 20);
`;

const CHIP = `window.__find('program-chip').shadowRoot`;
const WV = `window.__find('workspace-view')`;

interface Row {
  path: string;
  sub: string;
  error: boolean;
  updating: boolean;
  dot: string | null;
  img: string | null;
  loaded: boolean;
}

async function rows(page: Page): Promise<Row[]> {
  return page.evaluate(`[...${CHIP}.querySelectorAll('.prow')].map((row) => {
    const img = row.querySelector('.tile img');
    return {
      path: row.dataset.path,
      sub: (row.querySelector('.p') ?? row.querySelector('.e')).textContent.split(String.fromCharCode(160)).join(' '),
      error: row.classList.contains('err'),
      updating: row.classList.contains('upd'),
      dot: row.querySelector('.udot')?.title ?? null,
      img: img?.getAttribute('src') ?? null,
      loaded: !!img && img.complete && img.naturalWidth > 0,
    };
  })`) as Promise<Row[]>;
}

const rowOf = async (page: Page, path: string): Promise<Row | undefined> =>
  (await rows(page)).find((r) => r.path === path);

/** What a miniature's blob URL holds, or null once it's released. */
const blobText = async (page: Page, url: string | null): Promise<string | null> =>
  url === null
    ? null
    : (page.evaluate(`fetch(${JSON.stringify(url)}).then((r) => r.text()).catch(() => null)`) as Promise<
        string | null
      >);

/** How many compiles the programs' worker has been asked for, and whether it has a worker. */
const programsWorker = async (page: Page): Promise<{ requests: number; worker: boolean }> =>
  page.evaluate(
    `import('/services/compiler-worker.js').then((m) => ({ requests: m.programsCompiler.requestId, worker: m.programsCompiler.worker !== null }))`,
  ) as Promise<{ requests: number; worker: boolean }>;

const storeGet = async (page: Page, key: string): Promise<unknown> =>
  page.evaluate(`import('/state/store.js').then((m) => m.store.get('${key}'))`);

const drawn = async (page: Page): Promise<string> =>
  page.evaluate(`(() => {
    const doc = window.__find('svg-preview-pane').shadowRoot.querySelector('iframe')?.contentDocument;
    return [...(doc?.querySelectorAll('#preview-layers path') ?? [])].map((p) => p.getAttribute('d')).join(' ');
  })()`) as Promise<string>;

async function open(page: Page, id: string): Promise<void> {
  await page.goto(`${PAGES_URL}/workspace/${id}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await waitFor('the drawing', async () => ((await drawn(page)).length > 0 ? true : null));
  await pause(300);
}

/** The rows stop spinning: the programs not shown have drawn. */
const settled = async (page: Page, ms = 30_000): Promise<boolean> =>
  !!(await waitFor(
    'the programs to draw',
    async () => {
      const r = await rows(page);
      return r.length > 0 && r.every((row) => !row.updating) ? true : null;
    },
    ms,
  ));

async function openList(page: Page): Promise<void> {
  const isOpen = (await page.evaluate(`!${CHIP}.querySelector('.list').hidden`)) as boolean;
  if (!isOpen) await page.evaluate(`${CHIP}.querySelector('.pick').click()`);
  await pause(200);
}

async function closeList(page: Page): Promise<void> {
  await page.evaluate(`window.__find('program-chip').close()`);
}

/** Open a file in the editor, as the tree does. */
async function openFile(page: Page, path: string): Promise<void> {
  await page.evaluate(
    `${WV}.shadowRoot.dispatchEvent(new CustomEvent('open-file', { detail: { path: ${JSON.stringify(path)} }, bubbles: true, composed: true }))`,
  );
  await waitFor(`${path} in the editor`, async () =>
    (await page.evaluate(`window.__find('code-editor-pane').activePath === ${JSON.stringify(path)}`)) ? true : null,
  );
}

/** Replace the open file's text, as typing would (one undoable change; code-change follows). */
async function setText(page: Page, text: string): Promise<void> {
  await waitFor('the editor', async () =>
    page.evaluate(`!!${WV}.shadowRoot.querySelector('code-editor-pane')._editor`),
  );
  await page.evaluate(`(() => {
    const pane = ${WV}.shadowRoot.querySelector('code-editor-pane');
    pane._editor.dispatch({ changes: { from: 0, to: pane._editor.state.doc.length, insert: ${JSON.stringify(text)} } });
  })()`);
}

async function setTheme(page: Page, theme: string): Promise<void> {
  await page.evaluate(`localStorage.setItem('pathogen-theme', '${theme}')`);
  await page.evaluateOnNewDocument((t: string) => localStorage.setItem('pathogen-theme', t), theme);
}

const made: string[] = [];
const browser = await puppeteer.launch({ headless: true, defaultViewport: { width: 1320, height: 860 } });
try {
  const newPage = async (): Promise<Page> => {
    const page = await browser.newPage();
    page.on('dialog', (d) => void d.accept());
    await page.evaluateOnNewDocument(FIND);
    await page.evaluateOnNewDocument(
      (key: string, value: string) => {
        localStorage.setItem(key, value);
        if (!localStorage.getItem('pathogen-theme')) localStorage.setItem('pathogen-theme', 'light');
      },
      ANON_KEY,
      ownerId,
    );
    return page;
  };
  const create = async (name: string, files: Record<string, string>, entryPoints: string[]): Promise<string> => {
    const created = await api('POST', '/workspace', {
      name,
      files: Object.fromEntries(Object.entries(files).map(([p, text]) => [p, { text }])),
      entryPoints,
    });
    made.push(created.id as string);
    return created.id as string;
  };
  const id = await create('5b miniatures', FILES, ENTRY);
  const oneId = await create(
    '5b one program',
    { 'main.pathogen': 'define ViewBox(0, 0, 100, 100);\ncircle(50, 50, 30);\n' },
    ['main.pathogen'],
  );

  // 1. One program: no second compiler.
  {
    const page = await newPage();
    await open(page, oneId);
    await pause(1500);
    const w = await programsWorker(page);
    check('a workspace with one program starts no programs worker', w.requests === 0 && !w.worker, w);
    await page.close();
  }

  const page = await newPage();
  const pageErrors: string[] = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));

  // 2. Loaded: the others compile on their own worker; no miniature while the list is closed.
  await open(page, id);
  check('after a load, every row settles (the programs not shown drawn)', await settled(page));
  const afterLoad = await programsWorker(page);
  check(
    'they compiled on the programs worker, one request each at least',
    afterLoad.worker && afterLoad.requests >= 2,
    afterLoad,
  );
  let r = await rows(page);
  check('the list closed: no miniature made yet', r.length === 3 && r.every((row) => row.img === null), r);

  // 3. Opened: each row's own drawing, on the canvas colour.
  await openList(page);
  await waitFor('three miniatures', async () => ((await rows(page)).every((row) => row.loaded) ? true : null));
  r = await rows(page);
  const background = (await storeGet(page, 'background')) as string;
  const texts = await Promise.all(r.map((row) => blobText(page, row.img)));
  check(
    'opened: three miniatures, loaded, each its own drawing (main 15 50, demos 18 50, try-sizes 48 50) on the canvas colour',
    r.every((row) => row.loaded && row.img?.startsWith('blob:')) &&
      texts[0]!.includes('M 15 50') &&
      texts[1]!.includes('M 18 50') &&
      texts[2]!.includes('M 48 50') &&
      texts.every((t) => t!.includes(`fill="${background}"`)),
    { r, texts: texts.map((t) => t?.slice(0, 300)) },
  );
  check(
    'no script, nothing fetched: each is an <img> of an SVG',
    texts.every((t) => t!.startsWith('<svg') && !t!.includes('<script')),
  );
  await page.screenshot({ path: `${SHOTS}/2d-step5b-open-light.png` });
  await closeList(page);

  // 4. An edit to gears: the two programs not shown spin at once, all three have the dot; then they redraw.
  await openFile(page, 'parts/gears.pathogen');
  const before = await programsWorker(page);
  const demosBefore = (await rowOf(page, 'demos/gears.pathogen'))!.img;
  await setText(page, GEARS_EDITED);
  await pause(150);
  r = await rows(page);
  const usesGears = 'Uses parts/gears.pathogen, the file you’re editing';
  check(
    'editing gears: demos and try-sizes spin at once, main (shown) doesn’t',
    r.map((row) => [row.path, row.updating]).join() ===
      [
        ['main.pathogen', false],
        ['demos/gears.pathogen', true],
        ['try-sizes.pathogen', true],
      ].join(),
    r,
  );
  check(
    'all three have the dot: they use the file you’re editing',
    r.every((row) => row.dot === usesGears),
    r,
  );
  await openList(page);
  await pause(100);
  await page.screenshot({ path: `${SHOTS}/2d-step5b-editing-light.png` });
  check('…and redraw once the typing stops', await settled(page));
  await waitFor('the new miniatures', async () => {
    const row = await rowOf(page, 'demos/gears.pathogen');
    return row?.loaded && row.img !== demosBefore ? true : null;
  });
  const demosAfter = await rowOf(page, 'demos/gears.pathogen');
  const after = await programsWorker(page);
  check(
    'demos’ miniature is redrawn with the new gear (inner circle 11: M 29 50), and its old URL released',
    (await blobText(page, demosAfter!.img))!.includes('M 29 50') && (await blobText(page, demosBefore)) === null,
  );
  check('two compiles, one each for demos and try-sizes', after.requests - before.requests >= 2, { before, after });
  await closeList(page);

  // 5. An edit to kit: only try-sizes.
  await openFile(page, 'parts/kit.pathogen');
  const kitBefore = await programsWorker(page);
  const demosUrl = (await rowOf(page, 'demos/gears.pathogen'))!.img;
  await setText(page, KIT_EDITED);
  await pause(150);
  r = await rows(page);
  check(
    'editing kit: only try-sizes spins and has the dot',
    r.map((row) => [row.path, row.updating, row.dot !== null]).join() ===
      [
        ['main.pathogen', false, false],
        ['demos/gears.pathogen', false, false],
        ['try-sizes.pathogen', true, true],
      ].join(),
    r,
  );
  check('…and redraws', await settled(page));
  const kitAfter = await programsWorker(page);
  check(
    'one program compiled, and demos kept its miniature',
    kitAfter.requests - kitBefore.requests >= 1 && (await rowOf(page, 'demos/gears.pathogen'))!.img === demosUrl,
    { kitBefore, kitAfter },
  );

  // 6. An error in kit: try-sizes says where, the chip lights; fixed, both go.
  await setText(page, KIT_BROKEN);
  await waitFor('try-sizes’ error', async () => ((await rowOf(page, 'try-sizes.pathogen'))?.error ? true : null));
  let tryRow = await rowOf(page, 'try-sizes.pathogen');
  let alert = (await page.evaluate(`${CHIP}.querySelector('.pick-err')?.title ?? null`)) as string | null;
  check(
    'kit broken: try-sizes says "Error in parts/kit.pathogen line 6", and the chip’s red dot says another program has an error',
    tryRow?.sub === 'Error in parts/kit.pathogen line 6' && alert === 'Another program has an error',
    { tryRow, alert },
  );
  check('main and demos have no error', (await rows(page)).filter((row) => row.error).length === 1);
  await openList(page);
  await pause(200);
  await page.screenshot({ path: `${SHOTS}/2d-step5b-error-light.png` });
  await closeList(page);
  await setText(page, KIT);
  await waitFor('try-sizes fixed', async () =>
    (await rowOf(page, 'try-sizes.pathogen'))?.error === false ? true : null,
  );
  alert = (await page.evaluate(`${CHIP}.querySelector('.pick-err')?.title ?? null`)) as string | null;
  tryRow = await rowOf(page, 'try-sizes.pathogen');
  check('fixed: the error and the red dot go', tryRow?.sub === 'try-sizes.pathogen' && alert === null, {
    tryRow,
    alert,
  });

  // 7. Editing try-sizes (not shown): its own dot; the preview stays on main.
  const mainDrawing = await drawn(page);
  await openFile(page, 'try-sizes.pathogen');
  await setText(page, `${FILES['try-sizes.pathogen']} `);
  await pause(150);
  r = await rows(page);
  check(
    'editing try-sizes: its dot says "The file you’re editing"; the others have none',
    r.map((row) => row.dot).join('|') === '||The file you’re editing',
    r,
  );
  await settled(page);
  check(
    'the preview still shows main',
    (await drawn(page)) === mainDrawing && (await storeGet(page, 'shownProgram')) !== 'try-sizes.pathogen',
  );

  // 8. The program shown's own error, from the editor's compile.
  await openFile(page, 'main.pathogen');
  const mainText = FILES['main.pathogen'];
  await setText(page, `${mainText}circle(1);\n`);
  await waitFor('main’s error', async () => ((await rowOf(page, 'main.pathogen'))?.error ? true : null));
  const mainRow = await rowOf(page, 'main.pathogen');
  alert = (await page.evaluate(`${CHIP}.querySelector('.pick-err')?.title ?? null`)) as string | null;
  check(
    'main (shown) broken: its row says "Error in main.pathogen line 6"; the error panel has it, not the chip',
    mainRow?.sub === 'Error in main.pathogen line 6' && alert === null,
    { mainRow, alert },
  );
  await setText(page, mainText);
  await waitFor('main fixed', async () => ((await rowOf(page, 'main.pathogen'))?.error === false ? true : null));
  await settled(page);

  // 9. A rename keeps the miniature, with no compile.
  await openList(page);
  await waitFor('miniatures', async () => ((await rows(page)).every((row) => row.loaded) ? true : null));
  const demosMini = (await rowOf(page, 'demos/gears.pathogen'))!.img;
  const renameBefore = await programsWorker(page);
  await page.evaluate(`Promise.all([import('/services/workspace-edits.js'), import('/services/workspace-apply.js')]).then(([e, a]) => {
    const planned = e.planRename(a.workspaceState(), 'demos/gears.pathogen', 'cogs');
    ${WV}._applyWorkspaceChange(planned.change, { undo: planned.undo });
  })`);
  await pause(2500);
  const cogs = await rowOf(page, 'demos/cogs.pathogen');
  const renameAfter = await programsWorker(page);
  check(
    'renamed to demos/cogs: the row keeps its miniature, and nothing is compiled again',
    cogs?.img === demosMini && cogs.loaded && !cogs.updating && renameAfter.requests === renameBefore.requests,
    { cogs, renameBefore, renameAfter },
  );

  // 10. A delete releases the miniature's URL.
  const tryMini = (await rowOf(page, 'try-sizes.pathogen'))!.img;
  check('try-sizes’ miniature is live', (await blobText(page, tryMini)) !== null);
  await page.evaluate(`Promise.all([import('/services/workspace-edits.js'), import('/services/workspace-apply.js')]).then(([e, a]) => {
    const planned = e.planDelete(a.workspaceState(), 'try-sizes.pathogen');
    ${WV}._applyWorkspaceChange(planned.change, {});
  })`);
  await pause(300);
  check(
    'deleted: its row goes, and its miniature’s URL is released',
    !(await rowOf(page, 'try-sizes.pathogen')) && (await blobText(page, tryMini)) === null,
  );

  // 11. A workspace switch releases them all.
  const live = (await rows(page)).map((row) => row.img);
  await page.evaluate(`import('/utils/router.js').then((m) => m.navigateTo('/workspace/${oneId}'))`);
  await waitFor('the other workspace', async () => ((await storeGet(page, 'workspaceId')) === oneId ? true : null));
  await pause(800);
  const released = await Promise.all(live.map((url) => blobText(page, url)));
  check(
    'a workspace switch releases every miniature’s URL',
    released.every((t) => t === null),
    released.map((t) => t?.slice(0, 40)),
  );

  // 12. Dark.
  await setTheme(page, 'dark');
  await open(page, id);
  await settled(page);
  await openList(page);
  await waitFor('miniatures', async () => ((await rows(page)).every((row) => row.loaded) ? true : null));
  await pause(200);
  await page.screenshot({ path: `${SHOTS}/2d-step5b-open-dark.png` });
  await setTheme(page, 'light');

  // 13. Long tasks: a heavy program not shown (its tile blank), against a control with a light one.
  const heavyId = await create('5b heavy', { 'main.pathogen': LIGHT, 'heavy.pathogen': HEAVY }, [
    'main.pathogen',
    'heavy.pathogen',
  ]);
  const lightId = await create('5b control', { 'main.pathogen': LIGHT, 'other.pathogen': LIGHT }, [
    'main.pathogen',
    'other.pathogen',
  ]);
  const measure = async (
    wsId: string,
    other: string,
    listOpen: boolean,
  ): Promise<{ max: number; total: number; row: Row | undefined; main: Row | undefined; requests: number }> => {
    const p = await newPage();
    await open(p, wsId);
    await settled(p, 60_000);
    if (listOpen) await openList(p);
    const start = (await programsWorker(p)).requests;
    // As after a load: the drawings forgotten, then the program shown compiled, so the other compiles again.
    await p.evaluate(`${WV}._drawings.reset(); ${WV}.updatePreview()`);
    // From when the editor's own compile is done: only the other program's compile is measured.
    await waitFor('the editor’s compile', async () =>
      (await storeGet(p, 'compilationStatus')) !== 'compiling' ? true : null,
    );
    await p.evaluate(`window.__stall = { max: 0, total: 0 }`);
    await waitFor('the compile', async () => ((await programsWorker(p)).requests > start ? true : null), 10_000);
    await settled(p, 60_000);
    await pause(500);
    const stall = (await p.evaluate(`window.__stall`)) as { max: number; total: number };
    const row = await rowOf(p, other);
    const main = await rowOf(p, 'main.pathogen');
    const requests = (await programsWorker(p)).requests - start;
    await p.close();
    return { max: stall.max, total: stall.total, row, main, requests };
  };
  // The control that the measure sees a stall at all: a 150 ms busy task.
  {
    const p = await newPage();
    await open(p, lightId);
    await pause(300);
    await p.evaluate(`window.__stall = { max: 0, total: 0 }`);
    await p.evaluate(
      `setTimeout(() => { const end = performance.now() + 150; while (performance.now() < end) {} }, 0)`,
    );
    await pause(400);
    const seen = (await p.evaluate(`window.__stall`)) as { max: number };
    check('the stall measure sees a 150 ms busy task (the control)', seen.max >= 120, seen);
    await p.close();
  }
  const control = await measure(lightId, 'other.pathogen', false);
  const heavyClosed = await measure(heavyId, 'heavy.pathogen', false);
  const heavyOpen = await measure(heavyId, 'heavy.pathogen', true);
  console.log(
    `  main-thread stalls (ms) while the program not shown compiles: control max ${control.max.toFixed(0)} total ${control.total.toFixed(0)}; heavy, list closed: max ${heavyClosed.max.toFixed(0)} total ${heavyClosed.total.toFixed(0)}; heavy, list open: max ${heavyOpen.max.toFixed(0)} total ${heavyOpen.total.toFixed(0)}`,
  );
  check(
    'the heavy program compiled in the background, both times',
    heavyClosed.requests >= 1 && heavyOpen.requests >= 1,
    { closed: heavyClosed.requests, open: heavyOpen.requests },
  );
  check(
    'the heavy program: a blank tile, no error, no spinner (too large to draw small), while main’s miniature was made',
    heavyOpen.row?.img === null && heavyOpen.row.error === false && !heavyOpen.row.updating && !!heavyOpen.main?.loaded,
    { heavy: heavyOpen.row, main: heavyOpen.main },
  );
  check(
    'no main-thread stall over 100 ms while the heavy program compiles, list closed or open',
    heavyClosed.max < 100 && heavyOpen.max < 100,
    { heavyClosed, heavyOpen },
  );

  // 13b. The editor's compile cancelled (its Cancel) as a workspace loads: the program not shown still draws.
  {
    const p = await newPage();
    await open(p, lightId);
    await settled(p);
    const start = (await programsWorker(p)).requests;
    await p.evaluate(`${WV}._drawings.reset(); ${WV}.updatePreview(); ${WV}.cancelCompile()`);
    const status = await storeGet(p, 'compilationStatus');
    const drew = await settled(p, 15_000);
    const end = (await programsWorker(p)).requests;
    check(
      'the editor’s compile cancelled during a load: the program not shown still draws, no spinner left',
      status === 'cancelled' && drew && end > start,
      { status, drew, start, end },
    );
    await p.close();
  }

  // 14. The storybook: the new story, light and dark.
  for (const theme of ['light', 'dark']) {
    await setTheme(page, theme);
    await page.goto(`${PAGES_URL}/storybook/program-chip`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await waitFor('the story', async () =>
      page.evaluate(
        `!!window.__find('.story-tab')?.getRootNode().querySelector('program-chip')?.shadowRoot?.querySelector('.pick')`,
      ),
    );
    const stories = (await page.evaluate(
      `[...window.__find('.story-tab').parentElement.querySelectorAll('.story-tab')].map((b) => b.textContent.trim())`,
    )) as string[];
    await page.evaluate(`window.__find('.story-tab[data-story="6"]')?.click()`);
    await pause(500);
    const spinning = (await page.evaluate(
      `[...window.__find('.story-tab').getRootNode().querySelector('program-chip').shadowRoot.querySelectorAll('.prow.upd')].length`,
    )) as number;
    await page.screenshot({ path: `${SHOTS}/2d-step5b-story-loading-${theme}.png` });
    check(
      `the storybook: seven chip stories, the last two rows spinning on blank tiles (${theme})`,
      stories.length === 7 && stories[6] === 'Just opened: the others drawing' && spinning === 2,
      { stories, spinning },
    );
  }

  check('no page errors', pageErrors.length === 0, pageErrors);
} finally {
  await browser.close();
  for (const wsId of made) await api('DELETE', `/workspace/${wsId}`);
}

console.log(failures === 0 ? '\nall passed' : `\n${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
