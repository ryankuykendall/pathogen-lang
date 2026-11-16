// The overlay layout, tried in the page (no code changed): the preview spans the whole
// workspace behind the panes, and the tree, editor, console and inspector sit on top of it.
// Opening or closing a pane no longer resizes the preview; the drawing is then moved once
// to the middle of the gap the panes leave. Full Chrome, 2x pixels, signed in on the dev
// stack, frame by frame as in measure-toggles.ts. The README has the numbers (2026-11-16).
//
//   npx tsx project-docs/preview-raster-perf/measure-overlay.ts <source> <mode>
//
// source: heavy (heavy-filters.pathogen, here), or a workspace id on the dev stack, read
//         with the local API's admin token (read only) and copied into a test user's
//         workspace, so nothing of the original is touched.
// mode:   built   the layout as built, for comparison
//         static  overlay; the drawing stays where it is (do panes moving over it cost?)
//         slide   overlay; once the pane has moved, the drawing slides to the gap's middle
//                 by moving the preview's layer (a transform on the iframe), keeping its size
//         refit   overlay; once the pane has moved, the drawing is fitted to the gap
//                 (the drawing's box changes size, as a real re-fit would)
//         scale   overlay; the preview's layer slides and scales so the drawing fits the
//                 gap, from the pixels already drawn (soft when enlarged), without redrawing
//         --detail (after the mode) also prints every frame over 25 ms
//         --inspector-only opens and closes the inspector three times, nothing else
//         --hide-inspector hides the inspector's contents (display: none) while it's closed
//         --trace writes Chrome traces of the first inspector open and close to tmp/perf-files/
//         --no-grain turns off the page's grain texture (theme.css body::before)
//         --hide-drawing hides the preview's iframe (to see what the drawing itself costs)
//         --no-inspector-btn keeps the preview's layers button hidden (it reappears on close)
//         --trace-tiles adds Chrome's cc debug category to --trace
//         --repeat-inspector ends with three more inspector opens and closes
//
// Each run also nudges the zoom by 2% and back: the cost of one raster of the drawing,
// which every edit and every pan pays already.

import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';

import puppeteer from 'puppeteer';

import type { Page } from 'puppeteer';

const SOURCE = process.argv[2] ?? 'heavy';
const MODE = process.argv[3] ?? 'built';
if (!['built', 'static', 'slide', 'refit', 'scale'].includes(MODE)) throw new Error(`unknown mode ${MODE}`);
const HIDE = process.argv.includes('--hide-inspector');
const TRACE = process.argv.includes('--trace');
const INSPECTOR_ONLY = process.argv.includes('--inspector-only');
const PAGES_URL = 'http://localhost:3000';
const DEV_API = 'http://localhost:8787';
const USER_ID = `perf-${randomUUID().slice(0, 8)}`;
const TOKEN = `perf-${randomUUID()}`;
const pause = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

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
  };`;
const ev = async <T>(page: Page, src: string): Promise<T> => (await page.evaluate(`(() => { ${DEEP} ${src} })()`)) as T;
const FRAMES = `
  window.__frames = [];
  const tick = (t) => { window.__frames.push(t); requestAnimationFrame(tick); };
  requestAnimationFrame(tick);`;

/**
 * The gap the panes leave over the preview, in the iframe's coordinates: from the right
 * edge of the tree, editor or console, whichever is furthest right, to the inspector's
 * left edge (the workspace's right edge while it's closed). Then where the drawing goes.
 */
const GAP = `
  window.__gap = () => {
    const ifr = __deep('#preview-frame');
    const box = ifr.parentElement.getBoundingClientRect();
    const left = Math.max(...['file-tree', 'code-editor-pane', 'console-pane'].map((t) => __deep(t).getBoundingClientRect().right));
    const right = __deep('inspector-panel').getBoundingClientRect().left;
    return { center: (left + right) / 2 - box.left, width: right - left };
  };
  window.__fit = (gap) => {
    const svg = __deep('#preview-frame').contentDocument.querySelector('svg#preview');
    svg.style.left = gap.center + 'px';
    svg.style.width = gap.width + 'px';
  };
  window.__shifts = [];
  window.__shift = (mode) => {
    const gap = window.__gap();
    window.__shifts.push(Math.round(gap.center) + '/' + Math.round(gap.width));
    if (mode === 'slide') __deep('#preview-frame').style.transform = 'translateX(' + (gap.center - window.__placed.center) + 'px)';
    if (mode === 'refit') window.__fit(gap);
    if (mode === 'scale') {
      // The scale the drawing would have fitted to this gap, over the one it was drawn at.
      const ifr = __deep('#preview-frame');
      const vb = ifr.contentDocument.querySelector('svg#preview').viewBox.baseVal;
      const fit = (g) => Math.min(g.width / vb.width, ifr.clientHeight / vb.height);
      ifr.style.transformOrigin = window.__placed.center + 'px 50%';
      ifr.style.transform = 'translateX(' + (gap.center - window.__placed.center) + 'px) scale(' + fit(gap) / fit(window.__placed) + ')';
    }
    // The drawing's size on screen, read on the next frames (after the change is laid out).
    requestAnimationFrame(() => {
      const drawn = __deep('#preview-frame').contentDocument.querySelector('#preview-layers').getBoundingClientRect();
      window.__shifts[window.__shifts.length - 1] += ' drawn ' + Math.round(drawn.width) + 'x' + Math.round(drawn.height);
    });
  };`;

/** Act, then watch frames until they flow again with none over 50 ms for 1.5 s (12 s at most). */
async function frames(page: Page, label: string, act: string): Promise<void> {
  await pause(1500);
  const t0 = (await ev<number>(page, `${act}; return performance.now();`)) as number;
  const start = Date.now();
  let after: number[] = [];
  while (Date.now() - start < 12_000) {
    await pause(500);
    after = (await page.evaluate(`window.__frames.filter((t) => t >= ${t0})`)) as number[];
    const now = (await page.evaluate('performance.now()')) as number;
    const lastSlow = after.reduce((at, t, i) => (t - (i === 0 ? t0 : after[i - 1]) > 50 ? t : at), t0);
    // A frame still being drawn has no time yet, so the gap since the last one counts as busy.
    const lastFrame = after[after.length - 1] ?? t0;
    if (now - lastFrame < 100 && now - lastSlow > 1500) break;
  }
  const gaps = after.map((t, i) => Math.round(t - (i === 0 ? t0 : after[i - 1])));
  const slow = gaps.filter((g) => g > 50);
  let settled = 0;
  for (let i = 0; i < gaps.length; i++) if (gaps[i] > 50) settled = Math.round(after[i] - t0);
  console.log(
    `${label.padEnd(24)} slow frames ${String(slow.length).padStart(2)}  longest ${String(Math.max(0, ...slow)).padStart(5)} ms  busy ${String(settled).padStart(5)} ms`,
  );
  if (process.argv.includes('--detail')) {
    const late = gaps.map((g, i) => [Math.round(after[i] - t0), g]).filter(([, g]) => g > 25);
    console.log(`    frames over 25 ms [at, gap]: ${JSON.stringify(late)}`);
  }
}

let source: { files: Record<string, { text: string }>; folders: string[]; entryPoints: string[] };
if (SOURCE === 'heavy') {
  source = {
    files: {
      'main.pathogen': { text: readFileSync('project-docs/preview-raster-perf/heavy-filters.pathogen', 'utf8') },
    },
    folders: [],
    entryPoints: ['main.pathogen'],
  };
} else {
  const token = /^ADMIN_TOKEN=(.*)$/m.exec(readFileSync('api/.dev.vars', 'utf8'))?.[1]?.trim() ?? '';
  const res = await fetch(`${DEV_API}/workspace/${encodeURIComponent(SOURCE)}?token=${encodeURIComponent(token)}`);
  if (!res.ok) throw new Error(`reading ${SOURCE}: ${res.status}`);
  source = (await res.json()) as typeof source;
}

const now = Date.now();
d1(
  `INSERT INTO users (id, email, email_lower, handle, display_name, created_at, verified_at) VALUES ('${USER_ID}', '${USER_ID}@example.invalid', '${USER_ID}@example.invalid', '${USER_ID}', 'Perf', ${now}, ${now}); ` +
    `INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES ('${TOKEN}', '${USER_ID}', ${now}, ${now + 3_600_000});`,
);
const browser = await puppeteer.launch({ headless: true, args: ['--window-size=1440,900'] });
let id = '';
try {
  const created = (await (
    await api('POST', '/workspace', {
      name: 'Perf overlay',
      files: Object.fromEntries(Object.entries(source.files).map(([p, f]) => [p, { text: f.text }])),
      folders: source.folders,
      entryPoints: source.entryPoints,
    })
  ).json()) as { id: string; slug: string };
  id = created.id;
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
  page.on('pageerror', (e) => console.log('PAGE ERROR', e.message));
  await page.setCookie({ name: 'pathogen_session', value: TOKEN, domain: 'localhost', path: '/' });
  await page.evaluateOnNewDocument(FRAMES);
  await page.goto(`${PAGES_URL}/workspace/${created.slug}--${created.id}`, { waitUntil: 'domcontentloaded' });
  for (let i = 0; i < 100; i++) {
    if (await ev<boolean>(page, `return !!__deep('code-editor-pane')?.code && !!__deep('file-tree');`)) break;
    await pause(150);
  }
  await pause(6000);
  await ev(page, `${GAP} return 1;`);

  if (MODE !== 'built') {
    // The editor keeps the width it has now; the console, when open, takes 360 px; the
    // preview leaves the row and fills the workspace behind the panes.
    const editorWidth = await ev<number>(
      page,
      `return Math.round(__deep('code-editor-pane').getBoundingClientRect().width);`,
    );
    const css = `
      :host { position: relative; }
      ::slotted(svg-preview-pane) { position: absolute !important; inset: 0; z-index: 0; transition: none !important; }
      ::slotted(file-tree), ::slotted(code-editor-pane), ::slotted(console-pane), ::slotted(inspector-panel) {
        position: relative; z-index: 1; background: var(--bg-primary, #fff);
      }
      ::slotted(code-editor-pane), :host(.inspector-open) ::slotted(code-editor-pane) { flex: 0 0 ${editorWidth}px !important; }
      ::slotted(console-pane.open) { flex: 0 0 360px !important; }
      ::slotted(inspector-panel) { margin-left: auto; }`;
    await ev(
      page,
      `const s = document.createElement('style'); s.textContent = ${JSON.stringify(css)};
       __deep('playground-main').shadowRoot.appendChild(s); return 1;`,
    );
    await pause(1000);
    // The drawing starts fitted to the gap, as the layout would place it on opening.
    await ev(page, `window.__placed = window.__gap(); window.__fit(window.__placed); return 1;`);
    console.log(
      `editor ${editorWidth} px; drawing placed in ${JSON.stringify(await ev(page, `return window.__placed;`))}`,
    );
  }
  console.log(`source: ${SOURCE}; mode: ${MODE}`);
  await pause(5000);
  mkdirSync('tmp/perf-files', { recursive: true });
  await page.screenshot({ path: `tmp/perf-files/overlay-${MODE}-start.png` });

  // A pane's move takes 0.2 to 0.3 s; the drawing moves once, after it.
  const toggle = (button: string): string =>
    `__deep(${JSON.stringify(button)}).click(); ${MODE === 'built' ? '' : `setTimeout(() => window.__shift(${JSON.stringify(MODE)}), 350);`}`;
  const nudge = (factor: number): string =>
    `const pz = __deep('svg-preview-pane').panZoom; pz.setView({ zoom: pz.getView().zoom * ${factor} })`;

  // --hide-inspector: the inspector's contents are display: none while it's closed, so
  // they're hidden in the same style change that starts the close.
  if (HIDE) {
    await ev(
      page,
      `const s = document.createElement('style'); s.textContent = ':host(:not(.open)) .inspector { display: none; }';
       __deep('inspector-panel').shadowRoot.appendChild(s); return 1;`,
    );
  }
  // --no-grain: the page's grain texture (theme.css body::before) turned off.
  if (process.argv.includes('--no-grain')) {
    await ev(
      page,
      `const s = document.createElement('style'); s.textContent = 'body::before { display: none !important; }';
       document.head.appendChild(s); return 1;`,
    );
  }
  // --hide-drawing: the preview's iframe is hidden (visibility), to see what the drawing costs.
  if (process.argv.includes('--hide-drawing')) {
    await ev(page, `__deep('#preview-frame').style.visibility = 'hidden'; return 1;`);
    await pause(3000);
  }
  // --no-inspector-btn: the preview's layers button (shown again when the inspector closes) stays hidden.
  if (process.argv.includes('--no-inspector-btn')) {
    await ev(
      page,
      `const s = document.createElement('style'); s.textContent = '#inspector-open-btn { display: none !important; }';
       __deep('svg-preview-pane').shadowRoot.appendChild(s); return 1;`,
    );
  }
  let traced = 0;
  const inspectorToggle = async (label: string): Promise<void> => {
    traced += 1;
    // Only the first open and the first close are traced (inspector-1.json, inspector-2.json).
    const trace = TRACE && traced <= 2;
    if (trace) {
      await page.tracing.start({
        path: `tmp/perf-files/inspector-${traced}-${MODE}${HIDE ? '-hide' : ''}.json`,
        categories: [
          'devtools.timeline',
          'disabled-by-default-devtools.timeline',
          'blink',
          'cc',
          'gpu',
          'viz',
          'toplevel',
          ...(process.argv.includes('--trace-tiles') ? ['disabled-by-default-cc.debug'] : []),
        ],
      });
    }
    await frames(page, label, toggle('#inspector-open-btn'));
    if (trace) await page.tracing.stop();
  };

  if (INSPECTOR_ONLY) {
    for (let i = 1; i <= 3; i++) {
      await inspectorToggle(`Inspector on (${i})`);
      await inspectorToggle(`Inspector off (${i})`);
    }
  } else {
    await frames(page, 'one raster (zoom 2%)', nudge(1.02));
    await frames(page, 'one raster (zoom back)', nudge(1 / 1.02));
    await frames(page, 'Files off', toggle('#files-toggle'));
    await frames(page, 'Files on', toggle('#files-toggle'));
    await inspectorToggle('Inspector on');
    await page.screenshot({ path: `tmp/perf-files/overlay-${MODE}-inspector.png` });
    await inspectorToggle('Inspector off');
    await frames(page, 'Console on', toggle('#console-toggle'));
    await frames(page, 'Console off', toggle('#console-toggle'));
    // --repeat-inspector: three more opens and closes, to see whether a close's cost recurs.
    if (process.argv.includes('--repeat-inspector')) {
      for (let i = 2; i <= 4; i++) {
        await inspectorToggle(`Inspector on (${i})`);
        await inspectorToggle(`Inspector off (${i})`);
      }
    }
  }
  const placed = await ev<{ center: number; width: number } | null>(
    page,
    `return window.__gap ? window.__gap() : null;`,
  );
  console.log(`gap at the end: ${JSON.stringify(placed)}`);
  console.log(`gaps after each toggle (center/width): ${JSON.stringify(await ev(page, `return window.__shifts;`))}`);
} finally {
  if (id) await api('DELETE', `/workspace/${id}`);
  d1(`DELETE FROM sessions WHERE user_id = '${USER_ID}'; DELETE FROM users WHERE id = '${USER_ID}';`);
  await Promise.race([browser.close(), pause(10_000)]);
  process.exit(0);
}
