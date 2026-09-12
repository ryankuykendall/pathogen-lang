// Puppeteer verification for ISSUE-016 (cancellable editor compiles) and
// ISSUE-017 (conic gradient regression + fallback notices) against the dev
// website. Run with the dev stack up (`npm run dev:stack`):
//
//   npx tsx scripts/debug-compile-cancel-and-conic.ts [--pages-url http://localhost:3000]
//
// Scenarios:
//   1. A 48000×18600 viewBox with a conic wheel renders through WebGPU with no
//      Dawn texture/swapchain errors and a non-blank raster (the 0.25-floor
//      regression).
//   2. The same program with `?gpu=off` renders through Canvas 2D and the
//      Pathogen console carries the fallback notice naming the gradient.
//   3. A heavy program: Cancel mid-compile → chip reads "Cancelled", no error
//      panel, preview marked stale, chip returns to idle; editing during a
//      compile logs "[compiler-worker] cancelled superseded compile".
//   4. Export → PNG download never triggers Chrome's willReadFrequently
//      warning.
//   5. Pixel parity: the three renders in project-docs/conic-parity/ (CLI
//      wedges, WebGPU, Canvas 2D — regenerate them per that folder's STATUS.md)
//      agree at sampled points to within the 1° wedge quantization.

import { existsSync, readFileSync } from 'node:fs';

import { Command } from 'commander';
import { PNG } from 'pngjs';
import puppeteer from 'puppeteer';

import type { ConsoleMessage, Page } from 'puppeteer';

const program = new Command();
program
  .name('debug-compile-cancel-and-conic')
  .option('--pages-url <url>', 'Pages dev URL', 'http://localhost:3000')
  .option('--api-url <url>', 'API dev URL', 'http://localhost:8787')
  .option('--only <scenarios>', 'Comma-separated scenario numbers to run', '1,2,3,4,5')
  .option('--dump', 'Print the browser console after each scenario')
  .parse();
const {
  pagesUrl: PAGES_URL,
  apiUrl: DEV_API,
  only,
  dump,
} = program.opts<{
  pagesUrl: string;
  apiUrl: string;
  only: string;
  dump?: boolean;
}>();
const RUN = new Set(only.split(',').map((n) => n.trim()));
function dumpConsole(lines: string[]): void {
  if (!dump) return;
  console.log('  ┌ browser console');
  for (const l of lines.slice(-40)) console.log(`  │ ${l.slice(0, 220)}`);
  console.log('  └');
}

// Programs are stored as dev workspaces rather than `?state=` links: the heavy
// one is ~11 KB, and the dev server answers 431 for a URL that long.
const ANON_KEY = 'pathogen-lang:userId';
function makeAnonId(): string {
  // Same shape the playground generates (21 chars, URL-safe alphabet); the API
  // rejects other formats with 403.
  const alphabet = 'useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict';
  let id = '';
  for (let i = 0; i < 21; i++) id += alphabet[Math.floor(Math.random() * alphabet.length)];
  return id;
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

async function deleteLocalWorkspaces(): Promise<void> {
  for (const id of createdWorkspaces) {
    try {
      await fetch(`${DEV_API}/workspace/${id}`, { method: 'DELETE', headers: { 'X-User-Id': ownerId } });
    } catch {
      /* best-effort cleanup */
    }
  }
}

const WIDE_WHEEL = readFileSync('project-docs/conic-parity/wide-viewbox-regression.pathogen', 'utf8');
const HEAVY = readFileSync('project-docs/glyph-halo-diagnosis/programs/01-as-written-standin-font.pathogen', 'utf8');
const PARITY = readFileSync('project-docs/conic-parity/conic-parity.pathogen', 'utf8');

let failures = 0;
function check(label: string, ok: boolean, detail?: string): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

interface Probe {
  chipText: string | null;
  chipClass: string | null;
  cancelVisible: boolean;
  errorPanelText: string | null;
  previewStale: boolean | null;
  patternHrefBytes: Record<string, number>;
  consoleWarnRows: string[];
  pathCount: number;
}

async function probe(page: Page): Promise<Probe> {
  return page.evaluate(() => {
    const deepQuery = (root: Document | ShadowRoot | Element, selector: string): Element | null => {
      const direct = (root as Document).querySelector?.(selector);
      if (direct) return direct;
      for (const el of Array.from((root as Document).querySelectorAll?.('*') ?? [])) {
        if (el.shadowRoot) {
          const found = deepQuery(el.shadowRoot, selector);
          if (found) return found;
        }
      }
      return null;
    };
    const deepQueryAll = (root: Document | ShadowRoot | Element, selector: string): Element[] => {
      const out: Element[] = Array.from((root as Document).querySelectorAll?.(selector) ?? []);
      for (const el of Array.from((root as Document).querySelectorAll?.('*') ?? [])) {
        if (el.shadowRoot) out.push(...deepQueryAll(el.shadowRoot, selector));
      }
      return out;
    };
    const chip = deepQuery(document, 'app-breadcrumb')?.shadowRoot?.querySelector(
      '#compilation-status',
    ) as HTMLElement | null;
    const cancel = deepQuery(document, 'app-breadcrumb')?.shadowRoot?.querySelector(
      '#cancel-compile-btn',
    ) as HTMLElement | null;
    const container = deepQuery(document, '#preview-container');
    const iframe = deepQuery(document, 'iframe') as HTMLIFrameElement | null;
    const patternHrefBytes: Record<string, number> = {};
    let pathCount = 0;
    if (iframe?.contentDocument) {
      for (const pat of Array.from(iframe.contentDocument.querySelectorAll('pattern'))) {
        const img = pat.querySelector('image');
        const href = img?.getAttribute('href') ?? '';
        patternHrefBytes[pat.id] = href.length;
      }
      pathCount = iframe.contentDocument.querySelectorAll('path').length;
    }
    let errorPanelText: string | null = null;
    const errPanel = deepQuery(document, 'error-panel');
    if (errPanel?.shadowRoot && getComputedStyle(errPanel).display !== 'none') {
      const text = Array.from(errPanel.shadowRoot.querySelectorAll(':not(style)'))
        .map((el) => (el.children.length === 0 ? el.textContent?.trim() : ''))
        .filter(Boolean)
        .join(' | ');
      if (text) errorPanelText = text.slice(0, 300);
    }
    const consoleWarnRows = deepQueryAll(document, 'log-entry')
      .map((el) => (el.shadowRoot?.textContent ?? el.textContent ?? '').replace(/\s+/g, ' ').trim())
      .filter((t) => t.includes('[warn]'));
    return {
      chipText: chip?.textContent?.trim() ?? null,
      chipClass: chip?.className ?? null,
      cancelVisible: !!cancel && cancel.offsetParent !== null,
      errorPanelText,
      previewStale: container ? container.classList.contains('stale') : null,
      patternHrefBytes,
      consoleWarnRows,
      pathCount,
    };
  });
}

async function withPage<T>(url: string, fn: (page: Page, consoleLines: string[]) => Promise<T>): Promise<T> {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--enable-unsafe-webgpu', '--no-sandbox'],
    defaultViewport: { width: 1400, height: 1000 },
  });
  const consoleLines: string[] = [];
  try {
    const page = await browser.newPage();
    page.on('dialog', (d) => {
      d.dismiss().catch(() => undefined);
    });
    page.on('console', (m: ConsoleMessage) => consoleLines.push(`${m.type()}: ${m.text()}`));
    page.on('pageerror', (err) => consoleLines.push(`pageerror: ${err.message}`));
    await page.evaluateOnNewDocument(
      (key: string, id: string) => {
        (window as unknown as { __name?: <T>(fn: T) => T }).__name = <T>(fn: T): T => fn;
        try {
          localStorage.setItem(key, id);
        } catch {
          /* ignore */
        }
      },
      ANON_KEY,
      ownerId,
    );
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    return await fn(page, consoleLines);
  } finally {
    await browser.close();
  }
}

async function waitForIdleCompile(page: Page, timeoutMs: number): Promise<Probe> {
  let last = await probe(page);
  const deadline = Date.now() + timeoutMs;
  let sawCompiling = false;
  while (Date.now() < deadline) {
    await sleep(500);
    last = await probe(page);
    if (last.chipClass?.includes('compiling') || last.chipClass?.includes('rendering')) sawCompiling = true;
    const settled = !last.chipClass?.includes('compiling') && !last.chipClass?.includes('rendering');
    if (settled && (sawCompiling || last.pathCount > 0 || last.errorPanelText) && last.previewStale === false) break;
    if (settled && last.errorPanelText) break;
  }
  return last;
}

async function openConsolePane(page: Page): Promise<void> {
  await page.evaluate(() =>
    document.dispatchEvent(new CustomEvent('toggle-console', { bubbles: true, composed: true })),
  );
  await sleep(400);
}

/** The console pane's own log list (the store's `logs`), independent of rendering. */
async function consoleLogTexts(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const deepQuery = (root: Document | ShadowRoot | Element, selector: string): Element | null => {
      const direct = (root as Document).querySelector?.(selector);
      if (direct) return direct;
      for (const el of Array.from((root as Document).querySelectorAll?.('*') ?? [])) {
        if (el.shadowRoot) {
          const found = deepQuery(el.shadowRoot, selector);
          if (found) return found;
        }
      }
      return null;
    };
    const pane = deepQuery(document, 'console-pane') as (Element & { logs?: { parts?: { value: string }[] }[] }) | null;
    return (pane?.logs ?? []).map((l) => (l.parts ?? []).map((p) => p.value).join(' '));
  });
}

// ── Scenario 1: wide viewBox through WebGPU ─────────────────────────────────
const wideId = await createLocalWorkspace('e2e wide wheel', WIDE_WHEEL);
const parityId = await createLocalWorkspace('e2e conic parity', PARITY);
const heavyId = await createLocalWorkspace('e2e heavy halo', HEAVY);

if (RUN.has('1')) {
  console.log('━━━ Scenario 1: 48000×18600 viewBox renders its conic wheel through WebGPU ━━━');
  await withPage(`${PAGES_URL}/workspace/${wideId}`, async (page, consoleLines) => {
    const result = await waitForIdleCompile(page, 90_000);
    const dawn = consoleLines.filter((l) =>
      /Texture size|swapchain|IOSurface|Invalid Texture|exceeded maximum texture/i.test(l),
    );
    check('no Dawn texture / swapchain errors in the browser console', dawn.length === 0, dawn[0]);
    const reduction = consoleLines.find((l) => l.includes('[GradientService]') && l.includes('texture limit'));
    check('GradientService logged the resolution reduction', !!reduction, reduction);
    const bytes = result.patternHrefBytes['wheel'] ?? 0;
    check(`pattern#wheel carries a non-blank raster (href ${bytes} chars, expect > 100000)`, bytes > 100_000);
    check('no compile error', !result.errorPanelText, result.errorPanelText ?? undefined);
    const fallbackRows = (await consoleLogTexts(page)).filter((r) => r.includes("Gradient 'wheel'"));
    check('no fallback notice in the Pathogen console on the WebGPU path', fallbackRows.length === 0, fallbackRows[0]);
    dumpConsole(consoleLines);
  });
}

// ── Scenario 2: forced Canvas 2D fallback with notice ───────────────────────
if (RUN.has('2')) {
  console.log('━━━ Scenario 2: ?gpu=off renders through Canvas 2D and says so in the Pathogen console ━━━');
  const CONIC_IDS = [
    'full-turn',
    'quarter-transparent',
    'quarter-clamp',
    'quarter-repeat',
    'ccw-hole',
    'blended-center',
  ];
  await withPage(`${PAGES_URL}/workspace/${parityId}?gpu=off`, async (page, consoleLines) => {
    const result = await waitForIdleCompile(page, 60_000);
    const disabled = consoleLines.find((l) => l.includes('WebGPU disabled by ?gpu=off'));
    check('GradientService announced the forced Canvas 2D path', !!disabled);
    const notices = (await consoleLogTexts(page)).filter((r) => r.includes('Canvas 2D fallback'));
    check(
      `Pathogen console shows a fallback notice per gradient (${notices.length}, expect 6)`,
      notices.length === 6,
      notices[0],
    );
    await openConsolePane(page);
    const rendered = (await probe(page)).consoleWarnRows.filter((r) => r.includes('Canvas 2D fallback'));
    check('the console pane renders those notices as warn rows', rendered.length > 0);
    const blank = CONIC_IDS.filter((id) => (result.patternHrefBytes[id] ?? 0) < 1000);
    check('every conic pattern has a Canvas 2D raster', blank.length === 0, blank.join(','));
    check('no compile error', !result.errorPanelText, result.errorPanelText ?? undefined);
    dumpConsole(consoleLines);
  });
}

// ── Scenario 3: cancel flow ─────────────────────────────────────────────────
if (RUN.has('3')) {
  console.log('━━━ Scenario 3: Cancel mid-compile, and editing during a compile cancels the superseded one ━━━');
  await withPage(`${PAGES_URL}/workspace/${heavyId}`, async (page, consoleLines) => {
    // Wait until the chip is compiling, then hit Cancel.
    let compiling: Probe | null = null;
    for (let i = 0; i < 160; i++) {
      const p = await probe(page);
      if (p.chipClass?.includes('compiling')) {
        compiling = p;
        break;
      }
      await sleep(250);
    }
    check('chip enters the compiling state', !!compiling, compiling?.chipText ?? undefined);
    check('Cancel control is visible while compiling', !!compiling?.cancelVisible);
    await sleep(1500);
    await page.evaluate(() => {
      const deepQuery = (root: Document | ShadowRoot | Element, selector: string): Element | null => {
        const direct = (root as Document).querySelector?.(selector);
        if (direct) return direct;
        for (const el of Array.from((root as Document).querySelectorAll?.('*') ?? [])) {
          if (el.shadowRoot) {
            const found = deepQuery(el.shadowRoot, selector);
            if (found) return found;
          }
        }
        return null;
      };
      (
        deepQuery(document, 'app-breadcrumb')?.shadowRoot?.querySelector('#cancel-compile-btn') as HTMLElement | null
      )?.click();
    });
    await sleep(300);
    const cancelled = await probe(page);
    check(
      'chip reads "Cancelled" after clicking Cancel',
      cancelled.chipText === 'Cancelled',
      cancelled.chipText ?? undefined,
    );
    check('no error panel after a user cancel', !cancelled.errorPanelText, cancelled.errorPanelText ?? undefined);
    check('Cancel control hidden once cancelled', !cancelled.cancelVisible);
    await sleep(2000);
    const idle = await probe(page);
    check(
      'chip returns to idle after the cancel',
      !idle.chipClass?.includes('cancelled') && !idle.chipClass?.includes('compiling'),
      idle.chipClass ?? undefined,
    );
    check('no stray compile completion after the cancel (still no paths, no error)', !idle.errorPanelText);

    // Now type into the editor twice, 800 ms apart: the second edit must cancel
    // the first edit's compile ("superseded").
    const focused = await page.evaluate(() => {
      const deepQuery = (root: Document | ShadowRoot | Element, selector: string): Element | null => {
        const direct = (root as Document).querySelector?.(selector);
        if (direct) return direct;
        for (const el of Array.from((root as Document).querySelectorAll?.('*') ?? [])) {
          if (el.shadowRoot) {
            const found = deepQuery(el.shadowRoot, selector);
            if (found) return found;
          }
        }
        return null;
      };
      const content = deepQuery(document, '.cm-content') as HTMLElement | null;
      if (!content) return false;
      content.focus();
      return true;
    });
    check('editor focused for typing', focused);
    // Jump to the end of the document (Cmd+ArrowDown on the mac keymap, Ctrl+End
    // elsewhere) so the appended comment lines keep the program valid.
    await page.keyboard.down('Meta');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.up('Meta');
    await page.keyboard.down('Control');
    await page.keyboard.press('End');
    await page.keyboard.up('Control');
    // Append trailing comments to the last line (no newlines, so the editor's
    // auto-indent cannot alter the program).
    await page.keyboard.type(' // edit one');
    await sleep(1200);
    const superseded1 = consoleLines.filter((l) => l.includes('cancelled superseded compile')).length;
    await page.keyboard.type(' // edit two');
    await sleep(1200);
    const superseded2 = consoleLines.filter((l) => l.includes('cancelled superseded compile')).length;
    check(
      'the second edit cancelled the superseded compile',
      superseded2 > superseded1,
      `${superseded1} → ${superseded2}`,
    );
    const during = await probe(page);
    check('no error panel while the fresh compile runs', !during.errorPanelText, during.errorPanelText ?? undefined);
    dumpConsole(consoleLines);
  });
}

// ── Scenario 4: export readback ─────────────────────────────────────────────
if (RUN.has('4')) {
  console.log('━━━ Scenario 4: PNG export never trips the willReadFrequently warning ━━━');
  await withPage(`${PAGES_URL}/workspace/${parityId}`, async (page, consoleLines) => {
    await waitForIdleCompile(page, 60_000);
    await page.evaluate(() =>
      document.dispatchEvent(new CustomEvent('open-export', { bubbles: true, composed: true })),
    );
    await sleep(500);
    const clicked = await page.evaluate(() => {
      const deepQuery = (root: Document | ShadowRoot | Element, selector: string): Element | null => {
        const direct = (root as Document).querySelector?.(selector);
        if (direct) return direct;
        for (const el of Array.from((root as Document).querySelectorAll?.('*') ?? [])) {
          if (el.shadowRoot) {
            const found = deepQuery(el.shadowRoot, selector);
            if (found) return found;
          }
        }
        return null;
      };
      const modal = deepQuery(document, 'export-modal');
      const png = modal?.shadowRoot?.querySelector('.format-toggle button[data-format="png"]') as HTMLElement | null;
      const download = modal?.shadowRoot?.querySelector('.download-btn') as HTMLElement | null;
      if (!png || !download) return false;
      png.click();
      download.click();
      return true;
    });
    check('export modal opened and PNG download clicked', clicked);
    await sleep(4000);
    const readback = consoleLines.filter((l) => l.includes('willReadFrequently'));
    check('no willReadFrequently warning during PNG export', readback.length === 0, readback[0]);
    const exportErrors = consoleLines.filter((l) => l.startsWith('pageerror'));
    check('no page errors during export', exportErrors.length === 0, exportErrors[0]);
    dumpConsole(consoleLines);
  });
}

// ── Scenario 5: pixel parity between the three renders ──────────────────────
if (RUN.has('5')) {
  console.log('━━━ Scenario 5: CLI wedges, WebGPU and Canvas 2D agree pixel-wise at sampled points ━━━');
  const dir = 'project-docs/conic-parity';
  const files = { cli: `${dir}/cli-wedges.png`, gpu: `${dir}/webgpu.png`, c2d: `${dir}/canvas2d.png` };
  if (!Object.values(files).every((f) => existsSync(f))) {
    check('all three parity renders exist (see project-docs/conic-parity/STATUS.md to regenerate)', false);
  } else {
    const load = (f: string): PNG => PNG.sync.read(readFileSync(f));
    const cli = load(files.cli);
    const gpu = load(files.gpu);
    const c2d = load(files.c2d);
    check('renders share one size', cli.width === gpu.width && gpu.width === c2d.width && cli.height === c2d.height);
    const px = (img: PNG, x: number, y: number): number[] => {
      const i = (y * img.width + x) * 4;
      return [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]];
    };
    // Sample a ring of radius 100 around each tile center (mid-gradient,
    // away from the hole/overlay radii) at 5° steps that never land on a
    // 1° wedge boundary; compare each channel between renders.
    const centers = [
      [150, 150],
      [450, 150],
      [750, 150],
      [150, 450],
      [450, 450],
      [750, 450],
    ];
    const diffs = (a: PNG, b: PNG): number[] => {
      const out: number[] = [];
      for (const [cx, cy] of centers) {
        for (let deg = 2.5; deg < 360; deg += 5) {
          const x = Math.round(cx + 100 * Math.cos((deg * Math.PI) / 180));
          const y = Math.round(cy + 100 * Math.sin((deg * Math.PI) / 180));
          const pa = px(a, x, y);
          const pb = px(b, x, y);
          // Premultiply so a transparent pixel's RGB noise does not count.
          for (let ch = 0; ch < 3; ch++) out.push(Math.abs((pa[ch] * pa[3]) / 255 - (pb[ch] * pb[3]) / 255));
          out.push(Math.abs(pa[3] - pb[3]));
        }
      }
      return out.sort((m, n) => m - n);
    };
    const stats = (d: number[]): { mean: number; p95: number; max: number } => ({
      mean: d.reduce((m, n) => m + n, 0) / d.length,
      p95: d[Math.floor(d.length * 0.95)],
      max: d[d.length - 1],
    });
    const gpuVsCli = stats(diffs(gpu, cli));
    const gpuVsC2d = stats(diffs(gpu, c2d));
    const cliVsC2d = stats(diffs(cli, c2d));
    const fmt = (s: { mean: number; p95: number; max: number }): string =>
      `mean ${s.mean.toFixed(1)}, p95 ${s.p95.toFixed(0)}, max ${s.max.toFixed(0)} (of 255)`;
    // 1° wedges quantize the ramp; at radius 100 a wedge is ~1.7 px wide, so
    // a sample can sit up to one wedge off the shader's continuous value.
    check(`WebGPU vs CLI wedges within wedge quantization — ${fmt(gpuVsCli)}`, gpuVsCli.mean <= 6 && gpuVsCli.p95 <= 20);
    check(`WebGPU vs Canvas 2D within wedge quantization — ${fmt(gpuVsC2d)}`, gpuVsC2d.mean <= 6 && gpuVsC2d.p95 <= 20);
    check(`CLI wedges vs Canvas 2D (same geometry, different rasterizer) — ${fmt(cliVsC2d)}`, cliVsC2d.mean <= 4 && cliVsC2d.p95 <= 16);
  }
}

await deleteLocalWorkspaces();
console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
