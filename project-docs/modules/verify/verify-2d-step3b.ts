// Phase 2d, step 3b (note 52): the layout without a footer. The served
// playground has no footer and no minimap; the editor and the preview run to
// the bottom; the preview has no card, Fit leaves a margin, and zoomed-in art
// runs to the pane's edges; the fullscreen button takes the top-left corner;
// Background, Grid and Precision live in the inspector's Canvas section, change
// the preview, and are saved with the workspace.
//
//   npm run dev:stack
//   npx tsx project-docs/modules/verify/verify-2d-step3b.ts

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

// Non-integer coordinates, so Precision visibly rounds the path data.
const MAIN = `define ViewBox(0, 0, 200, 200);
define default PathLayer('ring') #{
  stroke: #6d3aa6;
  stroke-width: 6;
};
circle(100.123456, 100, 60.987654);
`;

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
  window.__rect = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
  };
`;

interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

/** Where things sit: the panes, the preview's container and buttons, and the drawing's background in page coordinates. */
async function layout(page: Page): Promise<{
  viewport: { width: number; height: number };
  footer: boolean;
  minimap: boolean;
  editor: Rect;
  preview: Rect;
  container: Rect;
  containerStyle: { radius: string; shadow: string };
  fullscreen: Rect;
  inspectorBtn: Rect;
  canvasBg: Rect | null;
  viewBox: string | null;
}> {
  return page.evaluate(`(() => {
    const pane = window.__find('svg-preview-pane');
    const container = pane.shadowRoot.querySelector('#preview-container');
    const iframe = pane.shadowRoot.querySelector('iframe');
    const doc = iframe?.contentDocument;
    const bg = doc?.getElementById('preview-bg');
    let canvasBg = null;
    if (bg) {
      const f = iframe.getBoundingClientRect();
      const r = bg.getBoundingClientRect();
      canvasBg = { left: f.left + r.left, top: f.top + r.top, right: f.left + r.right, bottom: f.top + r.bottom, width: r.width, height: r.height };
    }
    const cs = getComputedStyle(container);
    return {
      viewport: { width: innerWidth, height: innerHeight },
      footer: !!window.__find('playground-footer'),
      minimap: !!pane.shadowRoot.querySelector('#zoom-navigator'),
      editor: window.__rect(window.__find('code-editor-pane')),
      preview: window.__rect(pane),
      container: window.__rect(container),
      containerStyle: { radius: cs.borderTopLeftRadius, shadow: cs.boxShadow },
      fullscreen: window.__rect(pane.shadowRoot.querySelector('#fullscreen-toggle')),
      inspectorBtn: window.__rect(pane.shadowRoot.querySelector('#inspector-open-btn')),
      canvasBg,
      viewBox: doc?.getElementById('preview')?.getAttribute('viewBox') ?? null,
    };
  })()`);
}

/** What the preview draws: background fill, grid shown and size, and the ring's path data. */
async function drawing(page: Page): Promise<{ bg: string | null; grid: string | null; gridSize: string | null; d: string }> {
  return page.evaluate(`(() => {
    const doc = window.__find('svg-preview-pane').shadowRoot.querySelector('iframe')?.contentDocument;
    return {
      bg: doc?.getElementById('preview-bg')?.getAttribute('fill') ?? null,
      grid: doc?.getElementById('preview-grid')?.style.display ?? null,
      gridSize: doc?.getElementById('grid-pattern')?.getAttribute('width') ?? null,
      d: [...(doc?.querySelectorAll('#preview-layers path') ?? [])].map((p) => p.getAttribute('d')).join(' '),
    };
  })()`);
}

/** What the Canvas section shows. */
async function canvasSection(page: Page): Promise<{
  first: string | null;
  bg: string;
  grid: boolean;
  size: string;
  precision: string;
  visible: boolean;
} | null> {
  return page.evaluate(`(() => {
    const inspector = window.__find('inspector-panel');
    const panel = inspector?.shadowRoot?.querySelector('canvas-panel');
    if (!panel) return null;
    const root = panel.shadowRoot;
    const sections = [...inspector.shadowRoot.querySelector('.inspector').children].map((c) => c.tagName.toLowerCase());
    const r = panel.getBoundingClientRect();
    return {
      first: sections[1] ?? null,
      bg: root.querySelector('.bg-value').textContent,
      grid: root.querySelector('#grid-enabled').checked,
      size: root.querySelector('#grid-size').value,
      precision: root.querySelector('#to-fixed').value,
      visible:
        r.width > 100 && r.height > 60 && r.top >= 0 && r.bottom <= innerHeight + 1 && r.left >= 0 && r.right <= innerWidth + 1,
    };
  })()`);
}

async function clickIn(page: Page, rect: Rect): Promise<void> {
  await page.mouse.click(rect.left + rect.width / 2, rect.top + rect.height / 2);
}

const inspectorOpen = async (page: Page): Promise<boolean> =>
  (await page.evaluate(`import('/state/store.js').then((m) => m.store.get('inspectorOpen'))`)) === true;

/** Open the inspector with its button (a click toggles it, so only when it's closed). */
async function openInspector(page: Page): Promise<void> {
  if (!(await inspectorOpen(page))) await clickIn(page, (await layout(page)).inspectorBtn);
  await waitFor('the inspector', async () => ((await canvasSection(page))?.visible ? true : null), 5000);
}

async function closeInspector(page: Page): Promise<void> {
  if (await inspectorOpen(page)) {
    await page.evaluate(`window.__find('inspector-panel').shadowRoot.querySelector('.close-btn').click()`);
  }
  await new Promise((r) => setTimeout(r, 400));
}

async function open(page: Page, id: string): Promise<void> {
  await page.goto(`${PAGES_URL}/workspace/${id}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await waitFor('the drawing', async () => ((await drawing(page)).d.length > 0 ? true : null));
  await new Promise((r) => setTimeout(r, 500));
}

async function setTheme(page: Page, theme: string): Promise<void> {
  await page.evaluate(`localStorage.setItem('pathogen-theme', '${theme}')`);
  await page.evaluateOnNewDocument((t: string) => localStorage.setItem('pathogen-theme', t), theme);
}

const near = (a: number, b: number, tolerance = 1.5): boolean => Math.abs(a - b) <= tolerance;

const made: string[] = [];
const browser = await puppeteer.launch({ headless: true, defaultViewport: { width: 1320, height: 860 } });
try {
  const page = await browser.newPage();
  page.on('dialog', (d) => void d.accept());
  const pageErrors: string[] = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));
  const prefSaves: Record<string, unknown>[] = [];
  page.on('request', (req) => {
    if (req.method() === 'PUT' && req.url().startsWith(`${DEV_API}/workspace/`)) {
      const body = JSON.parse(req.postData() ?? '{}') as Record<string, unknown>;
      if (body.preferences) prefSaves.push(body.preferences as Record<string, unknown>);
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

  const id = await create('3b layout', { 'main.pathogen': MAIN });
  made.push(id);
  await open(page, id);

  // 1. No footer, no minimap; the editor and the preview run to the bottom.
  let at = await layout(page);
  check('there is no footer and no minimap', !at.footer && !at.minimap, { footer: at.footer, minimap: at.minimap });
  check(
    'the editor and the preview run to the bottom of the window',
    near(at.editor.bottom, at.viewport.height) && near(at.preview.bottom, at.viewport.height),
    { editor: at.editor.bottom, preview: at.preview.bottom, viewport: at.viewport.height },
  );

  // 2. No card: the preview fills its pane, square corners, no shadow.
  check(
    'the preview fills its pane with no card (no corners, no shadow)',
    near(at.container.left, at.preview.left) &&
      near(at.container.right, at.preview.right) &&
      near(at.container.top, at.preview.top) &&
      near(at.container.bottom, at.preview.bottom) &&
      at.containerStyle.radius === '0px' &&
      at.containerStyle.shadow === 'none',
    { container: at.container, preview: at.preview, style: at.containerStyle },
  );

  // 3. The fullscreen button takes the top-left corner, matching the inspector button's top-right.
  check(
    'the fullscreen button sits in the top-left corner, as far in as the inspector button',
    near(at.fullscreen.left - at.preview.left, 16) &&
      near(at.fullscreen.top - at.preview.top, 16) &&
      near(at.preview.right - at.inspectorBtn.right, at.fullscreen.left - at.preview.left),
    { fullscreen: at.fullscreen, inspector: at.inspectorBtn, preview: at.preview },
  );

  // 4. Fit leaves a margin: the viewBox is the box plus 6% of its longer side, and the
  //    drawing's background sits inside the pane with room on every side.
  const bg = at.canvasBg!;
  const insets = {
    left: bg.left - at.container.left,
    right: at.container.right - bg.right,
    top: bg.top - at.container.top,
    bottom: at.container.bottom - bg.bottom,
  };
  check(
    'at Fit the drawing keeps a margin on every side',
    at.viewBox === '-12 -12 224 224' && Object.values(insets).every((v) => v >= 20),
    { viewBox: at.viewBox, insets },
  );
  await page.screenshot({ path: `${SHOTS}/2d-step3b-layout-light.png` });

  // 5. Zoomed in, the art runs to the pane's edges (no invisible clip line inside the pane).
  await page.evaluate(`import('/state/store.js').then((m) => m.store.update({ zoomLevel: 3, panX: 70, panY: 70 }))`);
  await new Promise((r) => setTimeout(r, 500));
  at = await layout(page);
  const z = at.canvasBg!;
  check(
    'zoomed in, the drawing covers the whole pane, edge to edge',
    z.left <= at.container.left && z.right >= at.container.right && z.top <= at.container.top && z.bottom >= at.container.bottom,
    { canvasBg: z, container: at.container },
  );
  await page.screenshot({ path: `${SHOTS}/2d-step3b-zoomed-light.png` });

  // 5b. Copy SVG (⋮ menu) frames the drawing alone: the program's box, not the zoomed view
  //     and not the fit margin. The clipboard write is caught, not sent.
  const copiedViewBox = async (): Promise<string | null> =>
    (await page.evaluate(`(() => {
      let copied = null;
      navigator.clipboard.writeText = async (text) => { copied = text; };
      window.__find('workspace-view').copySvg();
      delete navigator.clipboard.writeText;
      if (!copied) return null;
      return new DOMParser().parseFromString(copied, 'image/svg+xml').documentElement.getAttribute('viewBox');
    })()`)) as string | null;
  const copiedZoomed = await copiedViewBox();
  await page.evaluate(`window.__find('svg-preview-pane').zoomFit()`);
  await new Promise((r) => setTimeout(r, 300));
  const copiedAtFit = await copiedViewBox();
  check('Copy SVG copies the drawing\'s own viewBox, zoomed or at Fit', copiedZoomed === '0 0 200 200' && copiedAtFit === '0 0 200 200', {
    copiedZoomed,
    copiedAtFit,
  });

  // 6. The inspector's Canvas section, above Layers, with the workspace's values.
  await openInspector(page);
  let canvas = await canvasSection(page);
  check(
    'the inspector opens with Canvas first, above Layers, showing the defaults',
    canvas?.first === 'canvas-panel' &&
      canvas.visible &&
      canvas.bg === '#f5f5f5' &&
      canvas.grid &&
      canvas.size === '20' &&
      canvas.precision === '',
    canvas,
  );
  await page.screenshot({ path: `${SHOTS}/2d-step3b-inspector-light.png` });

  // 7. Background: the colour picker's change recolours the preview and is saved.
  await page.evaluate(`window.__find('canvas-panel').shadowRoot.querySelector('#bg').dispatchEvent(
    new CustomEvent('color-change', { bubbles: true, composed: true, detail: { value: '#fff4dc' } }))`);
  await new Promise((r) => setTimeout(r, 300));
  let drawn = await drawing(page);
  canvas = await canvasSection(page);
  check('Background recolours the preview, and the section shows the new value', drawn.bg === '#fff4dc' && canvas?.bg === '#fff4dc', {
    drawn: drawn.bg,
    shown: canvas?.bg,
  });

  // 8. Grid: a real click on the checkbox hides it; the size select resizes it.
  const gridBox = (await page.evaluate(
    `window.__rect(window.__find('canvas-panel').shadowRoot.querySelector('#grid-enabled'))`,
  )) as Rect;
  await clickIn(page, gridBox);
  await new Promise((r) => setTimeout(r, 300));
  drawn = await drawing(page);
  check('the Grid checkbox hides the grid', drawn.grid === 'none', drawn.grid);
  await page.evaluate(`(() => {
    const s = window.__find('canvas-panel').shadowRoot.querySelector('#grid-size');
    s.value = '50';
    s.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await new Promise((r) => setTimeout(r, 300));
  drawn = await drawing(page);
  check('the grid size select resizes the grid', drawn.gridSize === '50', drawn.gridSize);

  // 9. Precision recompiles: the ring's numbers are rounded to one decimal.
  const before = drawn.d;
  await page.evaluate(`(() => {
    const s = window.__find('canvas-panel').shadowRoot.querySelector('#to-fixed');
    s.value = '1';
    s.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  const rounded = await waitFor('the recompile', async () => {
    const d = (await drawing(page)).d;
    return d !== before && d.length > 0 ? d : null;
  });
  check(
    'Precision recompiles with rounded numbers',
    before.includes('39.135802') && rounded !== null && rounded.includes('39.1') && !rounded.includes('39.13'),
    { before: before.slice(0, 120), after: rounded?.slice(0, 120) },
  );

  // 10. Saved with the workspace: the server holds the preferences, and a reload shows them.
  const held = await waitFor(
    'the preferences on the server',
    async () => {
      const ws = await api('GET', `/workspace/${id}`);
      const p = (ws.preferences ?? {}) as Record<string, unknown>;
      return p.background === '#fff4dc' && p.gridEnabled === false && p.gridSize === 50 && p.toFixed === 1 ? p : null;
    },
    20_000,
  );
  check('the server holds all four changes', held !== null, { held, sent: prefSaves });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitFor('the drawing after the reload', async () => ((await drawing(page)).d.length > 0 ? true : null));
  await new Promise((r) => setTimeout(r, 500));
  await openInspector(page);
  canvas = await canvasSection(page);
  drawn = await drawing(page);
  check(
    'after a reload the Canvas section and the preview show the saved values',
    canvas?.bg === '#fff4dc' &&
      canvas.grid === false &&
      canvas.size === '50' &&
      canvas.precision === '1' &&
      drawn.bg === '#fff4dc' &&
      drawn.grid === 'none' &&
      drawn.d.includes('39.1') &&
      !drawn.d.includes('39.13'),
    { canvas, drawn: { ...drawn, d: drawn.d.slice(0, 80) } },
  );

  // 11. Fullscreen: the inspector overlay has the Canvas section too.
  at = await layout(page);
  await clickIn(page, at.fullscreen);
  await new Promise((r) => setTimeout(r, 400));
  const fsInspector = await page.evaluate(`(() => {
    const i = window.__find('inspector-panel');
    return { overlay: i.classList.contains('fullscreen-overlay'), open: i.classList.contains('open') };
  })()`);
  await new Promise((r) => setTimeout(r, 400));
  canvas = await canvasSection(page);
  check('in fullscreen, the open inspector shows the Canvas section', JSON.stringify(fsInspector) === '{"overlay":true,"open":true}' && !!canvas?.visible, {
    fsInspector,
    canvas,
  });
  await page.screenshot({ path: `${SHOTS}/2d-step3b-fullscreen-light.png` });
  await page.keyboard.press('Escape'); // closes the inspector overlay
  await page.keyboard.press('Escape'); // leaves fullscreen

  // 12. A narrow window: the inspector button still reaches the Canvas section (a bottom sheet).
  await closeInspector(page);
  await page.setViewport({ width: 700, height: 900 });
  await new Promise((r) => setTimeout(r, 400));
  const narrowBtn = (await layout(page)).inspectorBtn;
  check(
    'at 700px the inspector button is on screen',
    narrowBtn.width > 0 && narrowBtn.top >= 0 && narrowBtn.bottom <= 900,
    narrowBtn,
  );
  await openInspector(page);
  canvas = await canvasSection(page);
  check('at 700px the button opens the inspector with the Canvas section', !!canvas?.visible, canvas);
  await page.screenshot({ path: `${SHOTS}/2d-step3b-narrow-light.png` });
  await closeInspector(page);
  await page.setViewport({ width: 1320, height: 860 });

  // 13. Dark mode.
  await setTheme(page, 'dark');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitFor('the drawing', async () => ((await drawing(page)).d.length > 0 ? true : null));
  await new Promise((r) => setTimeout(r, 600));
  await closeInspector(page);
  await page.screenshot({ path: `${SHOTS}/2d-step3b-layout-dark.png` });
  await openInspector(page);
  await page.screenshot({ path: `${SHOTS}/2d-step3b-inspector-dark.png` });

  // 14. The storybook entry, dark then light: four stories, and a change updates the story.
  for (const theme of ['dark', 'light']) {
    await setTheme(page, theme);
    await page.goto(`${PAGES_URL}/storybook/canvas-panel`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await waitFor('the story', async () =>
      page.evaluate(`!!window.__find('.story-tab')?.getRootNode().querySelector('canvas-panel')?.shadowRoot?.querySelector('#bg')`),
    );
    const names = (await page.evaluate(`(() => {
      const first = window.__find('.story-tab');
      return [...(first?.parentElement?.querySelectorAll('.story-tab') ?? [])].map((b) => b.textContent.trim());
    })()`)) as string[];
    for (const [i] of names.entries()) {
      await page.evaluate(`window.__find('.story-tab[data-story="${i}"]')?.click()`);
      await new Promise((r) => setTimeout(r, 500));
      // The story's frame: the hidden workspace view has its own inspector too.
      const box = (await page.evaluate(`(() => {
        const root = window.__find('.story-tab').getRootNode();
        const el = root.querySelector('inspector-panel') ?? root.querySelector('canvas-panel');
        const r = (el.parentElement ?? el).getBoundingClientRect();
        return { x: Math.max(0, r.x - 16), y: Math.max(0, r.y - 16), width: r.width + 32, height: r.height + 32 };
      })()`)) as { x: number; y: number; width: number; height: number };
      await page.screenshot({ path: `${SHOTS}/2d-step3b-story-${i + 1}-${theme}.png`, clip: box });
    }
    check(`the storybook shows the four stories (${theme})`, names.length === 4, names);
  }
  const storyGrid = await page.evaluate(`(() => {
    window.__find('.story-tab[data-story="0"]')?.click();
    return new Promise((done) => setTimeout(() => {
      const panel = window.__find('.story-tab').getRootNode().querySelector('canvas-panel');
      const box = panel.shadowRoot.querySelector('#grid-size');
      box.value = '100';
      box.dispatchEvent(new Event('change', { bubbles: true }));
      done(panel.settings.gridSize);
    }, 400));
  })()`);
  check('in the story, a change updates the section (as workspace-view does)', storyGrid === 100, storyGrid);

  check('no page errors', pageErrors.length === 0, pageErrors);
} finally {
  await browser.close();
  for (const id of made) await api('DELETE', `/workspace/${id}`);
}

console.log(failures === 0 ? '\nall passed' : `\n${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
