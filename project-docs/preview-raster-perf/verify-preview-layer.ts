// The preview's drawing keeps a compositing layer of its own (preview-raster-perf/README.md).
// Full Chrome at 2x pixels, signed in on the dev stack, a workspace whose main is
// heavy-filters.pathogen (1,521 layers with a drop-shadow each, about a second to rasterize):
// - the preview's iframe has its own layer (will-change: transform);
// - switching tabs, opening a file from the tree, and copying paint no slow frame;
// - without the layer (overridden in the page), a tab switch does: this check can fail;
// - the controls over the drawing are still on top: the right-hand buttons, the zoom
//   pill, the fullscreen button; and in fullscreen too;
// - a pan gesture moves the view, and bakes into the viewBox when it ends;
// - a blog embed's iframe has its own layer too, its controls on top;
// - for the record, what the Files and Console toggles cost (their resize repaints).
//
//   npm run dev:stack            (and npm run build:playground:dev after a change)
//   npx tsx project-docs/preview-raster-perf/verify-preview-layer.ts

import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

import puppeteer from 'puppeteer';

import type { Page } from 'puppeteer';

const PAGES_URL = 'http://localhost:3000';
const DEV_API = 'http://localhost:8787';
const DIR = 'project-docs/preview-raster-perf';
const USER_ID = `verifylayer-${randomUUID().slice(0, 8)}`;
const TOKEN = `verifylayer-${randomUUID()}`;
const HEAVY = readFileSync(`${DIR}/heavy-filters.pathogen`, 'utf8');
const NOTES = 'module;\n\nexport const note = 1;\n';
const pause = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

let failures = 0;
const check = (label: string, ok: boolean, detail?: unknown): void => {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${label}${ok ? '' : ` ${JSON.stringify(detail)?.slice(0, 600)}`}`);
  if (!ok) failures++;
};

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
  window.__frame = () => __pane()?.shadowRoot.querySelector('#preview-frame');`;
const ev = async <T>(page: Page, src: string): Promise<T> => (await page.evaluate(`(() => { ${DEEP} ${src} })()`)) as T;
const FRAMES = `
  window.__frames = [];
  const tick = (t) => { window.__frames.push(t); requestAnimationFrame(tick); };
  requestAnimationFrame(tick);`;

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
const ON_TOP = (sel: string, root = '__pane().shadowRoot'): string => `
  const root = ${root};
  const el = root.querySelector(${JSON.stringify(sel)});
  if (!el) return 'missing';
  const r = el.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return 'not shown';
  const hit = root.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return hit === el || el.contains(hit) ? 'on top' : (hit?.id || hit?.localName || 'nothing');`;

const now = Date.now();
d1(
  `INSERT INTO users (id, email, email_lower, handle, display_name, created_at, verified_at) VALUES ('${USER_ID}', '${USER_ID}@example.invalid', '${USER_ID}@example.invalid', '${USER_ID}', 'Verify layer', ${now}, ${now}); ` +
    `INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES ('${TOKEN}', '${USER_ID}', ${now}, ${now + 3_600_000});`,
);
const browser = await puppeteer.launch({ headless: true, args: ['--window-size=1440,900'] });
await browser
  .defaultBrowserContext()
  .overridePermissions(PAGES_URL, ['clipboard-read', 'clipboard-write', 'clipboard-sanitized-write']);
let id = '';
try {
  const created = (await (
    await api('POST', '/workspace', {
      name: 'Heavy filters',
      files: { 'main.pathogen': { text: HEAVY }, 'parts/notes.pathogen': { text: NOTES } },
      entryPoints: ['main.pathogen'],
    })
  ).json()) as { id: string; slug: string };
  id = created.id;
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
  page.on('pageerror', (e) => console.log('PAGE ERROR', e.message));
  await page.setCookie({ name: 'pathogen_session', value: TOKEN, domain: 'localhost', path: '/' });
  await page.evaluateOnNewDocument(FRAMES);

  for (const theme of ['light', 'dark']) {
    await page.evaluateOnNewDocument((t) => localStorage.setItem('pathogen-theme', t), theme);
    await page.goto(`${PAGES_URL}/workspace/${created.slug}--${created.id}`, { waitUntil: 'domcontentloaded' });
    const drawn = await (async () => {
      for (let i = 0; i < 120; i++) {
        const n = await ev<number>(
          page,
          `return __frame()?.contentDocument?.querySelectorAll('[filter], [style*="drop-shadow"]').length ?? 0;`,
        );
        if (n > 1000) return n;
        await pause(250);
      }
      return 0;
    })();
    await pause(5000);
    check(`[${theme}] the preview draws the heavy drawing (over 1,000 filtered layers)`, drawn > 1000, drawn);
    const willChange = await ev<string>(page, `return getComputedStyle(__frame()).willChange;`);
    check(`[${theme}] the preview's iframe has its own layer`, willChange === 'transform', willChange);

    // Opening and switching files, and copying: no slow frame.
    const tree = await slowFrames(
      page,
      `__deep('file-tree').shadowRoot.querySelector('[data-path="parts/notes.pathogen"]').click()`,
    );
    const back = await slowFrames(
      page,
      `__deep('editor-tabs').shadowRoot.querySelector('[data-path="main.pathogen"] .label').click()`,
    );
    const again = await slowFrames(
      page,
      `__deep('editor-tabs').shadowRoot.querySelector('[data-path="parts/notes.pathogen"] .label').click()`,
    );
    const copy = await slowFrames(page, `__deep('editor-tabs').shadowRoot.querySelector('.copy').click()`);
    check(
      `[${theme}] opening a file from the tree, switching tabs and copying paint no slow frame`,
      tree.length === 0 && back.length === 0 && again.length === 0 && copy.length === 0,
      { tree, back, again, copy },
    );

    // Without the layer, a tab switch is slow: the check above can fail.
    if (theme === 'light') {
      await ev(
        page,
        `const s = document.createElement('style'); s.id = 'no-layer'; s.textContent = '#preview-frame { will-change: auto !important; }';
         __pane().shadowRoot.appendChild(s); return 1;`,
      );
      await pause(4000);
      const without = await slowFrames(
        page,
        `__deep('editor-tabs').shadowRoot.querySelector('[data-path="main.pathogen"] .label').click()`,
      );
      check('without its own layer, a tab switch has a slow frame (the check can fail)', without.length > 0, without);
      await ev(page, `__pane().shadowRoot.getElementById('no-layer').remove(); return 1;`);
      await pause(4000);
    }

    // The controls over the drawing (Export, Refresh and Snapshot show in fullscreen only).
    const controls = {
      inspector: await ev<string>(page, ON_TOP('#inspector-open-btn')),
      zoom: await ev<string>(page, ON_TOP('pathogen-zoom-pill')),
      fullscreen: await ev<string>(page, ON_TOP('#fullscreen-toggle')),
    };
    check(
      `[${theme}] the controls over the drawing are on top of it`,
      Object.values(controls).every((v) => v === 'on top'),
      controls,
    );
    await page.screenshot({ path: `${DIR}/preview-layer-${theme}.png` });

    // A pan: the view moves, and bakes into the viewBox once the gesture ends. In the middle
    // of the pane, not of the iframe: since option 1 the iframe is the whole row's width
    // (option-1-build-plan.md) and the pane shows the part of it in the gap.
    const box = await ev<{ x: number; y: number; w: number; h: number }>(
      page,
      `const r = __pane().shadowRoot.querySelector('#preview-container').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height };`,
    );
    const viewBox = (): Promise<string> =>
      ev<string>(page, `return __frame().contentDocument.getElementById('preview').getAttribute('viewBox');`);
    const before = await viewBox();
    await page.mouse.move(box.x + box.w / 2, box.y + box.h / 2);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) await page.mouse.move(box.x + box.w / 2 + i * 12, box.y + box.h / 2 + i * 6);
    await page.mouse.up();
    let baked = before;
    for (let i = 0; i < 40 && baked === before; i++) {
      await pause(250);
      baked = await viewBox();
    }
    const cleared = await ev<string>(
      page,
      `return __frame().contentDocument.getElementById('preview').style.transform;`,
    );
    check(
      `[${theme}] a pan moves the view, baked into the viewBox when it ends`,
      baked !== before && (cleared === '' || cleared === 'none'),
      { before, baked, cleared },
    );

    // Fullscreen: the controls still on top.
    await ev(page, `__pane().shadowRoot.querySelector('#fullscreen-toggle').click(); return 1;`);
    await pause(1500);
    const full = {
      fullscreen: await ev<boolean>(page, `return __pane().classList.contains('fullscreen');`),
      inspector: await ev<string>(page, ON_TOP('#inspector-open-btn')),
      export: await ev<string>(page, ON_TOP('#export-btn')),
      exit: await ev<string>(page, ON_TOP('#fullscreen-toggle')),
    };
    check(
      `[${theme}] fullscreen: the controls still on top, Export among them`,
      full.fullscreen && full.inspector === 'on top' && full.export === 'on top' && full.exit === 'on top',
      full,
    );
    await ev(page, `__pane().shadowRoot.querySelector('#fullscreen-toggle').click(); return 1;`);
    await pause(1500);

    if (theme === 'light') {
      // For the record: the toggles that resize the preview (their cost is a design choice).
      const files = await slowFrames(page, `__deep('#files-toggle').click()`);
      await slowFrames(page, `__deep('#files-toggle').click()`);
      const consoleOn = await slowFrames(page, `__deep('#console-toggle').click()`);
      await slowFrames(page, `__deep('#console-toggle').click()`);
      console.log(
        `  (record) Files toggle slow frames: ${JSON.stringify(files)}; Console: ${JSON.stringify(consoleOn)}`,
      );
    }
  }

  // A blog embed: its iframe has its own layer, its zoom pill on top. (Its own fullscreen
  // button is hidden there: the embed's bar has the one a reader presses.)
  await page.goto(`${PAGES_URL}/blog/heading-turn`, { waitUntil: 'networkidle2' });
  await pause(2500);
  const MINI = `__deep('mini-workspace').shadowRoot.querySelector('mini-preview').shadowRoot`;
  // In the window, where hit-testing reaches.
  await ev(page, `__deep('mini-workspace').scrollIntoView({ block: 'center' }); return 1;`);
  await pause(1000);
  const embed = {
    willChange: await ev<string>(page, `return getComputedStyle(${MINI}.querySelector('iframe')).willChange;`),
    zoom: await ev<string>(page, ON_TOP('pathogen-zoom-pill', MINI)),
  };
  check(
    'a blog embed: its iframe has its own layer, its zoom pill on top',
    embed.willChange === 'transform' && embed.zoom === 'on top',
    embed,
  );
} finally {
  if (id) await api('DELETE', `/workspace/${id}`);
  d1(`DELETE FROM sessions WHERE user_id = '${USER_ID}'; DELETE FROM users WHERE id = '${USER_ID}';`);
  await Promise.race([browser.close(), pause(10_000)]);
}

console.log(failures === 0 ? '\nall passed' : `\n${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
