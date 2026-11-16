// Option 1 (option-1-build-plan.md): the preview pane is the gap the other panes leave, its
// iframe held at the workspace's full width, and the drawing moves to the gap once the
// panes stop. Full Chrome at 2x pixels, signed in on the dev stack, two workspaces:
// heavy-filters.pathogen (1,521 drop-shadow layers, a heavy drawing) and two gears from a
// module (a light one, with a second program so the program chip shows).
//
//   npm run dev:stack            (and npm run build:playground:dev after a change)
//   npx tsx project-docs/preview-raster-perf/verify-option-1.ts

import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

import puppeteer from 'puppeteer';

import type { Page } from 'puppeteer';

const PAGES_URL = 'http://localhost:3000';
const DEV_API = 'http://localhost:8787';
const DIR = 'project-docs/preview-raster-perf';
const USER_ID = `verifyopt1-${randomUUID().slice(0, 8)}`;
const TOKEN = `verifyopt1-${randomUUID()}`;
const HEAVY = readFileSync(`${DIR}/heavy-filters.pathogen`, 'utf8');
const NOTES = 'module;\n\nexport const note = 1;\n';
const GEARS =
  'module;\n\nexport fn gear(at, r) {\n  star(at.x, at.y, r, r - 6, 12);\n  circle(at.x, at.y, r * 0.3);\n}\n';
const GEARS_MAIN =
  'import { gear } from "./parts/gears.pathogen";\ndefine ViewBox(0, 0, 200, 100);\ngear(Point(55, 50), 40);\ngear(Point(150, 50), 28);\n';
const GEARS_DEMO =
  'import { gear } from "../parts/gears.pathogen";\ndefine ViewBox(0, 0, 300, 110);\nfor (i in 0..2) {\n  gear(Point(50 + i * 100, 50), 34);\n}\n';
const pause = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

let failures = 0;
const check = (label: string, ok: boolean, detail?: unknown): void => {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${label}${ok ? '' : ` ${JSON.stringify(detail)?.slice(0, 700)}`}`);
  if (!ok) failures++;
};
const near = (a: number, b: number, tolerance = 2): boolean => Math.abs(a - b) <= tolerance;

function d1(sql: string): void {
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
}
const api = async (method: string, path: string, body?: unknown): Promise<Response> =>
  fetch(`${DEV_API}${path}`, {
    method,
    headers: { Cookie: `pathogen_session=${TOKEN}`, 'Content-Type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

const DEEP = `
  window.__deep = (sel, root = document) => {
    const found = root.querySelector(sel);
    if (found) return found;
    for (const el of root.querySelectorAll('*')) {
      if (el.shadowRoot) { const f = window.__deep(sel, el.shadowRoot); if (f) return f; }
    }
    return null;
  };
  window.__pane = () => __deep('svg-preview-pane');
  window.__frame = () => __pane()?.shadowRoot.querySelector('#preview-frame');
  // Where things are, relative to the workspace's row of panes (playground-main).
  window.__state = () => {
    const main = __deep('playground-main').getBoundingClientRect();
    const box = __pane().shadowRoot.querySelector('#preview-container').getBoundingClientRect();
    const frame = __frame();
    const fr = frame.getBoundingClientRect();
    const doc = frame.contentDocument;
    const svgEl = doc.getElementById('preview');
    const svg = svgEl.getBoundingClientRect();
    const scale = fr.width / frame.clientWidth;
    return {
      gap: { left: box.left - main.left, width: box.width },
      mainWidth: main.width,
      frameWidth: frame.clientWidth,
      held: frame.style.position,
      transform: frame.style.transform,
      scale,
      body: { position: doc.body.style.position, left: parseFloat(doc.body.style.left), width: parseFloat(doc.body.style.width) },
      drawnCenter: fr.left - main.left + (svg.left + svg.width / 2) * scale,
      drawnWidth: svg.width * scale,
      picture: __pane()._picture,
      // The slowest of the recent redraws: what decides heavy.
      redrawMs: Math.round(Math.max(0, ...__pane()._recentRedraws)),
      svgStyle: svgEl.getAttribute('style') || '',
    };
  };`;
const ev = async <T>(page: Page, src: string): Promise<T> => (await page.evaluate(`(() => { ${DEEP} ${src} })()`)) as T;
interface State {
  gap: { left: number; width: number };
  mainWidth: number;
  frameWidth: number;
  held: string;
  transform: string;
  scale: number;
  body: { position: string; left: number; width: number };
  drawnCenter: number;
  drawnWidth: number;
  picture: boolean;
  redrawMs: number;
  svgStyle: string;
}
const state = (page: Page): Promise<State> => ev<State>(page, `return __state();`);
const gapCenter = (s: State): number => s.gap.left + s.gap.width / 2;

// Frames, and every change to the drawing's box with how many layers the drawing had then.
const BEFORE_LOAD = `
  window.__frames = [];
  const tick = (t) => { window.__frames.push(t); requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  window.__fits = [];
  customElements.whenDefined('svg-preview-pane').then(() => {
    const C = customElements.get('svg-preview-pane');
    const fit = C.prototype._fitToGap;
    C.prototype._fitToGap = function (timed) {
      const before = JSON.stringify([this._drawnGap, this._drawnFrame]);
      const out = fit.call(this, timed);
      if (JSON.stringify([this._drawnGap, this._drawnFrame]) !== before) {
        const layers = this._iframeDoc?.getElementById('preview-layers')?.childElementCount ?? 0;
        window.__fits.push({ layers, gap: this._drawnGap });
      }
      return out;
    };
  });`;

/** Act; watch frames until they flow again with none over 50 ms for 1.5 s. Returns the slow frames. */
async function slowFrames(page: Page, act: string): Promise<number[]> {
  await pause(1500);
  const t0 = await ev<number>(page, `${act}; return performance.now();`);
  const start = Date.now();
  let after: number[] = [];
  while (Date.now() - start < 15_000) {
    await pause(500);
    after = (await page.evaluate(`window.__frames.filter((t) => t >= ${t0})`)) as number[];
    const now = (await page.evaluate('performance.now()')) as number;
    let lastSlow = t0;
    after.forEach((t, i) => {
      if (t - (i === 0 ? t0 : after[i - 1]) > 50) lastSlow = t;
    });
    const lastFrame = after[after.length - 1] ?? t0;
    if (now - lastFrame < 100 && now - lastSlow > 1500) break;
  }
  return after.map((t, i) => Math.round(t - (i === 0 ? t0 : after[i - 1]))).filter((g) => g > 50);
}

/** Whether the control under `sel` (in the preview's shadow root) is what's hit at its middle. */
const ON_TOP = (sel: string): string => `
  const root = __pane().shadowRoot;
  const el = root.querySelector(${JSON.stringify(sel)});
  if (!el) return 'missing';
  const r = el.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return 'not shown';
  const hit = root.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return hit === el || el.contains(hit) ? 'on top' : (hit?.id || hit?.localName || 'nothing');`;

/** A control's box relative to the row of panes. */
const CONTROL = (sel: string): string => `
  const main = __deep('playground-main').getBoundingClientRect();
  const r = __pane().shadowRoot.querySelector(${JSON.stringify(sel)}).getBoundingClientRect();
  return { left: r.left - main.left, right: r.right - main.left, center: (r.left + r.right) / 2 - main.left };`;

async function open(page: Page, slug: string, id: string, theme: string): Promise<void> {
  await page.evaluateOnNewDocument((t) => localStorage.setItem('pathogen-theme', t), theme);
  await page.goto(`${PAGES_URL}/workspace/${slug}--${id}`, { waitUntil: 'domcontentloaded' });
  for (let i = 0; i < 120; i++) {
    const n = await ev<number>(
      page,
      `return __frame()?.contentDocument?.getElementById('preview-layers')?.childElementCount ?? 0;`,
    );
    if (n > 0) break;
    await pause(250);
  }
  await pause(4000);
}

const now = Date.now();
d1(
  `INSERT INTO users (id, email, email_lower, handle, display_name, created_at, verified_at) VALUES ('${USER_ID}', '${USER_ID}@example.invalid', '${USER_ID}@example.invalid', '${USER_ID}', 'Verify option 1', ${now}, ${now}); ` +
    `INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES ('${TOKEN}', '${USER_ID}', ${now}, ${now + 3_600_000});`,
);
const browser = await puppeteer.launch({ headless: true, args: ['--window-size=1440,900'] });
const ids: string[] = [];
try {
  const make = async (name: string, body: Record<string, unknown>): Promise<{ id: string; slug: string }> => {
    const created = (await (await api('POST', '/workspace', { name, ...body })).json()) as { id: string; slug: string };
    ids.push(created.id);
    return created;
  };
  const heavy = await make('Heavy filters', {
    files: { 'main.pathogen': { text: HEAVY }, 'parts/notes.pathogen': { text: NOTES } },
    entryPoints: ['main.pathogen'],
  });
  const light = await make('Gears', {
    files: {
      'main.pathogen': { text: GEARS_MAIN },
      'parts/gears.pathogen': { text: GEARS },
      'demos/gears.pathogen': { text: GEARS_DEMO },
    },
    folders: ['parts', 'demos'],
    entryPoints: ['main.pathogen', 'demos/gears.pathogen'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
  page.on('pageerror', (e) => console.log('PAGE ERROR', e.message));
  await page.setCookie({ name: 'pathogen_session', value: TOKEN, domain: 'localhost', path: '/' });
  await page.evaluateOnNewDocument(BEFORE_LOAD);

  // ---- The heavy drawing ----
  await open(page, heavy.slug, heavy.id, 'light');
  let s = await state(page);
  check(
    "the iframe is held at the row of panes' full width; the pane shows the gap",
    s.held === 'absolute' && near(s.frameWidth, s.mainWidth, 1) && s.gap.width < s.mainWidth - 100,
    s,
  );
  check(
    "the drawing's box is the gap (the iframe's body), centered in it",
    s.body.position === 'absolute' &&
      near(s.body.left, s.gap.left, 1) &&
      near(s.body.width, s.gap.width, 1) &&
      near(s.drawnCenter, gapCenter(s)),
    s,
  );
  check(
    "the drawing's own svg element has no stage style (export and thumbnails clone it)",
    !/left|width/.test(s.svgStyle),
    s.svgStyle,
  );
  check(
    'the heavy drawing is measured heavy (its redraw kept frames away for over 100 ms)',
    s.redrawMs > 100,
    s.redrawMs,
  );
  const fits = await ev<{ layers: number; gap: unknown }[]>(page, `return window.__fits;`);
  check(
    'loading draws it once: the box took the gap before the first render, and never changed after it',
    fits.length >= 1 && fits[0].layers === 0 && fits.every((f) => f.layers === 0),
    fits,
  );

  // Toggles: no slow frame (the inspector's first close may cost its one-time redraw: recorded).
  const filesOff = await slowFrames(page, `__deep('#files-toggle').click()`);
  s = await state(page);
  check(
    "Files closed (a wider gap): the picture slides to the gap's middle, never enlarged",
    s.picture && /translateX/.test(s.transform) && s.scale <= 1.0001 && near(s.drawnCenter, gapCenter(s)),
    s,
  );
  const filesOn = await slowFrames(page, `__deep('#files-toggle').click()`);
  const consoleOn = await slowFrames(page, `__deep('#console-toggle').click()`);
  const consoleOff = await slowFrames(page, `__deep('#console-toggle').click()`);
  check(
    'Files and Console, on and off: no slow frame',
    [filesOff, filesOn, consoleOn, consoleOff].every((f) => f.length === 0),
    {
      filesOff,
      filesOn,
      consoleOn,
      consoleOff,
    },
  );
  const inspector: number[][] = [];
  for (let i = 0; i < 3; i++) {
    inspector.push(await slowFrames(page, `__deep('#inspector-open-btn').click()`));
    if (i === 0) {
      s = await state(page);
      check(
        'Inspector opened (a narrower gap): the picture shrinks to fit, centered in the gap',
        s.picture && s.scale < 0.99 && near(s.drawnCenter, gapCenter(s)) && s.drawnWidth <= s.gap.width + 1,
        s,
      );
      await page.screenshot({ path: `${DIR}/option-1-light.png` });
      const controls = {
        fullscreen: await ev<{ left: number }>(page, CONTROL('#fullscreen-toggle')),
        zoom: await ev<{ center: number }>(page, CONTROL('pathogen-zoom-pill')),
      };
      check(
        'the controls are in the gap: fullscreen at its left, the zoom pill at its middle',
        controls.fullscreen.left >= s.gap.left && near(controls.zoom.center, gapCenter(s), 3),
        { controls, gap: s.gap },
      );
    }
    inspector.push(await slowFrames(page, `__deep('inspector-panel').shadowRoot.querySelector('.close-btn').click()`));
  }
  console.log(`  (record) inspector open/close slow frames, three times: ${JSON.stringify(inspector)}`);
  check(
    'Inspector, on and off, after the first close: no slow frame',
    inspector.slice(2).every((f) => f.length === 0),
    inspector,
  );

  // A zoom step redraws: the picture gives way to the drawing drawn in the gap.
  await slowFrames(page, `__deep('#files-toggle').click()`);
  s = await state(page);
  const pictureBefore = s.picture;
  await ev(page, `__pane().panZoom.zoomIn(); return 1;`);
  await pause(2500);
  s = await state(page);
  check(
    'a zoom step draws the picture in the gap (transform cleared, box = gap)',
    pictureBefore &&
      !s.picture &&
      s.transform === '' &&
      near(s.body.left, s.gap.left, 1) &&
      near(s.body.width, s.gap.width, 1),
    { pictureBefore, s },
  );
  await ev(page, `__pane().panZoom.zoomToFit(); return 1;`);
  await pause(2500);
  // A compile redraws too.
  await slowFrames(page, `__deep('#files-toggle').click()`);
  const pictureAgain = (await state(page)).picture;
  await ev(page, `document.dispatchEvent(new CustomEvent('refresh-preview')); return 1;`);
  await pause(4000);
  s = await state(page);
  check(
    'a compile draws the picture in the gap',
    pictureAgain && !s.picture && s.transform === '' && near(s.body.left, s.gap.left, 1),
    { pictureAgain, s },
  );

  // Fullscreen: the pane covers the window, the iframe fills it, the box is the whole iframe.
  await ev(page, `__pane().shadowRoot.querySelector('#fullscreen-toggle').click(); return 1;`);
  await pause(1500);
  const full = await ev<Record<string, unknown>>(
    page,
    `const r = __pane().getBoundingClientRect(); const f = __frame();
     return { fullscreen: __pane().classList.contains('fullscreen'), w: r.width, h: r.height, held: f.style.position,
       body: f.contentDocument.body.style.position, frameWidth: f.clientWidth };`,
  );
  full.exit = await ev<string>(page, ON_TOP('#fullscreen-toggle'));
  full.export = await ev<string>(page, ON_TOP('#export-btn'));
  check(
    "fullscreen: the pane covers the window, its iframe fills it, the drawing's box is the whole iframe, its controls on top",
    full.fullscreen === true &&
      full.w === 1440 &&
      full.h === 900 &&
      full.held === '' &&
      full.body === '' &&
      full.frameWidth === 1440 &&
      full.exit === 'on top' &&
      full.export === 'on top',
    full,
  );
  await ev(page, `__pane().shadowRoot.querySelector('#fullscreen-toggle').click(); return 1;`);
  await pause(1500);
  s = await state(page);
  check(
    'out of fullscreen: held again, the box back to the gap',
    s.held === 'absolute' &&
      near(s.body.left, s.gap.left, 1) &&
      near(s.body.width, s.gap.width, 1) &&
      near(s.drawnCenter, gapCenter(s)),
    s,
  );

  // The stacking is untouched: no stacking context on the row or the panes.
  const stacking = await ev<Record<string, string>>(
    page,
    `const out = {};
     for (const tag of ['playground-main', 'file-tree', 'code-editor-pane', 'console-pane', 'svg-preview-pane', 'inspector-panel']) {
       const cs = getComputedStyle(__deep(tag));
       out[tag] = [cs.zIndex, cs.isolation, cs.transform].join(' ');
     }
     return out;`,
  );
  check(
    'no stacking context on the row or its panes (menus, popups and the error panel stack as before)',
    Object.values(stacking).every((v) => v === 'auto auto none'),
    stacking,
  );

  // Below 800 px: stacked, the iframe fills the pane, no stage.
  await page.setViewport({ width: 760, height: 900, deviceScaleFactor: 2 });
  await pause(1500);
  const narrow = await ev<Record<string, unknown>>(
    page,
    `const f = __frame(); const box = __pane().shadowRoot.querySelector('#preview-container').getBoundingClientRect();
     return { held: f.style.position, body: f.contentDocument.body.style.position, frameWidth: f.clientWidth, boxWidth: Math.round(box.width) };`,
  );
  check(
    'below 800 px: no stage, the iframe fills the pane',
    narrow.held === '' && narrow.body === '' && near(narrow.frameWidth as number, narrow.boxWidth as number, 1),
    narrow,
  );
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
  await pause(1500);
  s = await state(page);
  check('wide again: held, the box the gap', s.held === 'absolute' && near(s.body.width, s.gap.width, 1), s);

  // Dark: the same place, a screenshot.
  await open(page, heavy.slug, heavy.id, 'dark');
  await slowFrames(page, `__deep('#inspector-open-btn').click()`);
  s = await state(page);
  check('[dark] the drawing centered in the gap', near(s.drawnCenter, gapCenter(s)), s);
  await page.screenshot({ path: `${DIR}/option-1-dark.png` });
  await slowFrames(page, `__deep('inspector-panel').shadowRoot.querySelector('.close-btn').click()`);

  // ---- The light drawing ----
  await open(page, light.slug, light.id, 'light');
  s = await state(page);
  check('the light drawing is measured light', s.redrawMs <= 100, s.redrawMs);
  const lightInspector = await slowFrames(page, `__deep('#inspector-open-btn').click()`);
  s = await state(page);
  check(
    'a light drawing is redrawn in the gap once the pane stops: no picture left, box = gap, centered',
    lightInspector.length === 0 &&
      !s.picture &&
      s.transform === '' &&
      near(s.body.left, s.gap.left, 1) &&
      near(s.body.width, s.gap.width, 1) &&
      near(s.drawnCenter, gapCenter(s)),
    { lightInspector, s },
  );
  // The program chip's list fits the gap (the pane is the box it fits).
  await ev(page, `__deep('program-chip').shadowRoot.querySelector('.pick').click(); return 1;`);
  await pause(800);
  const list = await ev<Record<string, number>>(
    page,
    `const main = __deep('playground-main').getBoundingClientRect();
     const r = __deep('program-chip').shadowRoot.querySelector('.list').getBoundingClientRect();
     const box = __pane().shadowRoot.querySelector('#preview-container').getBoundingClientRect();
     return { left: r.left - main.left, right: r.right - main.left, width: r.width, gapLeft: box.left - main.left, gapRight: box.right - main.left };`,
  );
  check(
    'the program list opens inside the gap',
    list.width > 0 && list.left >= list.gapLeft - 1 && list.right <= list.gapRight + 1,
    list,
  );
  await page.keyboard.press('Escape');
} finally {
  for (const id of ids) await api('DELETE', `/workspace/${id}`);
  d1(`DELETE FROM sessions WHERE user_id = '${USER_ID}'; DELETE FROM users WHERE id = '${USER_ID}';`);
  await Promise.race([browser.close(), pause(10_000)]);
}

console.log(failures === 0 ? '\nall passed' : `\n${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
