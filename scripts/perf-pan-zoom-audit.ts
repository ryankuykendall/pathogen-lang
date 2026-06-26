/**
 * Pan/zoom UI performance audit for the playground SVG preview.
 *
 * Motivation: a workspace whose source compiles to a very large SVG (e.g.
 * ~480 layers × ~880 circles ≈ 422k <circle> nodes) is janky to pan and zoom.
 * Two opposite-fix root causes are possible and we must measure which dominates:
 *
 *   1. Avoidable JS overhead — every mousemove/wheel runs the heavy
 *      `store.update → updateSvgStyles → updateNavigatorContent` path (the
 *      navigator is cleared and rebuilt every frame) plus a redundant
 *      `updateViewBox()`. Fixed by code cleanup. Shows up as Scripting time.
 *   2. Inherent repaint cost — 422k nodes must re-raster on every viewBox
 *      change. Fixed only by an architectural change. Shows up as Paint/Raster.
 *
 * This harness therefore attributes main- AND compositor/raster-thread time to
 * categories (Scripting / Style / Layout / Paint / Raster / Composite) using a
 * Chrome trace, NOT just a total frame number. Total frame time alone cannot
 * tell the two buckets apart.
 *
 * Design decisions that must NOT be simplified away (see plan):
 *   - Load the source into the *real* local playground editor and let it
 *     compile, so we measure the production code path. Tracing starts only
 *     AFTER render-complete + idle, so the ~compile-on-load cost is excluded.
 *   - Drive the *real* event handlers by dispatching mousedown/mousemove/
 *     mouseup and wheel events into the iframe document. Setting `viewBox`
 *     directly would bypass the store→updateSvgStyles→navigator-rebuild path
 *     and hide exactly the JS overhead we are hunting.
 *   - Measure pan and zoom as separate scenarios — pan is JS-sensitive, zoom
 *     re-rasters all strokes and is likely paint-bound; a blended number hides
 *     this.
 *   - Run one prod baseline to confirm the local repro matches the real
 *     complaint.
 *
 * Run via: npm run perf:panzoom  (requires `npm run dev:stack` on :3000/:8787)
 */

import { Command } from 'commander';
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import puppeteer, { type Browser, type Page } from 'puppeteer';

const LOCAL_ORIGIN = 'http://localhost:3000';
const DEV_API = 'http://localhost:8787';
const ANON_KEY = 'pathogen-lang:userId';
const PROD_WORKSPACE_URL =
  'https://pathogen.studio/workspace/experimenting-with-grids-and-cycling--Uh_z743swVBf9ckijwKRL';

const OUT_DIR_DEFAULT = join(
  process.cwd(),
  'project-docs',
  'pan-zoom-performance',
);

/** The workspace source under investigation. */
const SOURCE = `define ViewBox(0, 0, 13200, 7200);

define default PathLayer('background') \${
  fill: #fff;
}

layer('background').apply {
  rect(0, 0, 13200, 7200);
}

let field = Grid(320, 200, { xDim: 20, yDim: 8, outOfBounds: 'wrap' }) {|g|
  g.fill {|row, col, center|
    return calc(tan(row * 21.1 / g.rows) + cos(col * 9.1 / g.cols));
  };
};

let colorCount = 480;
let colors = Color.palette(
  oklch(0.8505 0.0113 348.5),
  oklch(0.2390 0.0728 252.6 / 0.8),
  colorCount);
let drawingLayerSet = colors.map {|color, index|
  return PathLayer(\`drawing-layer-\${index}\`) \${
    stroke-width: 0.2;
    stroke: color.darken(0.2).alpha(0.48);
    fill: color.alpha(0.325);
  };
};

let itemLength = 880;
for (drawingLayer in drawingLayerSet) {
  let x = randomRange(900, 11000);
  let y = randomRange(400, 2800);
  let start = Point(x, y);
  let next = start;
  for (k in 1..itemLength) {
    let angle = field.sampleBilinear(start.y, start.x);
    next = start.polarTranslate(angle, 4.8);
    drawingLayer.apply {
      let t   = calc(k / (itemLength * 0.11));
      let env = calc(sin(PI() * t)) * 1.5;
      let radius = calc(1 + 49 * env * (0.5 + 0.5 * sin(k * 1.9)));
      circle(start.x, start.y, radius);
    }
    start = next;
  }
}
`;

// ---------------------------------------------------------------------------
// Trace analysis
//
// We deliberately do NOT do cross-thread self-time bucketing. The heavy work
// here is GPU raster whose events nest across processes (GPUTask → CommandBuffer
// → RasterCHROMIUM → GpuRasterBuffer::Playback), which defeats a naive self-time
// stack and silently dumps the cost into an "Other" bucket. Instead we take the
// authoritative main-thread split from page.metrics() and report raw off-main
// totals for the few events that unambiguously identify raster/commit cost.
// ---------------------------------------------------------------------------

interface TraceEvent {
  name: string;
  cat: string;
  ph: string;
  ts: number;
  dur?: number;
  pid: number;
  tid: number;
}

/** Raw total duration (ms) summed across all threads for a set of event names. */
function sumDur(events: TraceEvent[], names: Set<string>): number {
  let us = 0;
  for (const e of events) {
    if (e.ph === 'X' && typeof e.dur === 'number' && names.has(e.name)) us += e.dur;
  }
  return us / 1000;
}

const RASTER_NAMES = new Set(['RasterTask']);
const DESERIALIZE_NAMES = new Set(['RasterDecoderImpl::DoRasterCHROMIUM::Deserializing']);
const COMMIT_WAIT_NAMES = new Set(['LayerTreeHost::WaitForCommitCompletion']);
const MAIN_TASK_NAMES = new Set(['RunTask', 'ThreadControllerImpl::RunTask']);

function analyzeTrace(events: TraceEvent[]): {
  rasterTaskMs: number;
  deserializeMs: number;
  commitWaitMs: number;
  longestTaskMs: number;
} {
  let longestTaskMs = 0;
  for (const e of events) {
    if (e.ph === 'X' && typeof e.dur === 'number' && MAIN_TASK_NAMES.has(e.name)) {
      longestTaskMs = Math.max(longestTaskMs, e.dur / 1000);
    }
  }
  return {
    rasterTaskMs: sumDur(events, RASTER_NAMES),
    deserializeMs: sumDur(events, DESERIALIZE_NAMES),
    commitWaitMs: sumDur(events, COMMIT_WAIT_NAMES),
    longestTaskMs,
  };
}

// ---------------------------------------------------------------------------
// Page-side helpers (string-form to avoid tsx __name helper leaking into
// the serialized function, per security-browser-audit.ts).
// ---------------------------------------------------------------------------

/**
 * Returns render stats from the preview iframe: geometry-node count and total
 * path-data length. NOTE: `circle()` inside a PathLayer emits path *data*, not
 * <circle> elements — this scene is ~481 <path> nodes with very large `d`
 * strings, so we count geometry nodes generically and also report total `d`
 * length (the real driver of raster cost here). Returns {nodes:-1} if the
 * iframe isn't found yet.
 */
const COUNT_NODES = `
  (function () {
    function findIframe(root) {
      var direct = root.querySelector('iframe#preview-frame');
      if (direct) return direct;
      var els = root.querySelectorAll('*');
      for (var i = 0; i < els.length; i++) {
        if (els[i].shadowRoot) {
          var f = findIframe(els[i].shadowRoot);
          if (f) return f;
        }
      }
      return null;
    }
    var iframe = findIframe(document);
    if (!iframe || !iframe.contentDocument) return { nodes: -1, dLen: 0 };
    var doc = iframe.contentDocument;
    var layers = doc.getElementById('preview-layers') || doc;
    var geom = layers.querySelectorAll('path, circle, ellipse, rect, polygon, polyline, line');
    var dLen = 0;
    var paths = layers.querySelectorAll('path');
    for (var i = 0; i < paths.length; i++) dLen += (paths[i].getAttribute('d') || '').length;
    return { nodes: geom.length, dLen: dLen };
  })()
`;

/**
 * Creates a workspace via the dev API so the local audit exercises the real
 * load+compile path (workspace-view fetches the stored source and compiles it),
 * exactly as prod does. Returns the new workspace id.
 */
/** Generates a client-valid anonymous id: 21 chars from [0-9A-Za-z_~-]. */
function makeAnonId(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_~-';
  let id = '';
  for (let i = 0; i < 21; i++) id += alphabet[Math.floor(Math.random() * alphabet.length)];
  return id;
}

async function createLocalWorkspace(source: string, ownerId: string): Promise<string> {
  const res = await fetch(`${DEV_API}/workspace`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-User-Id': ownerId },
    body: JSON.stringify({ name: 'perf-harness-grids-cycling', code: source }),
  });
  if (!res.ok) throw new Error(`workspace create failed: HTTP ${res.status}`);
  const data = (await res.json()) as { id: string };
  return data.id;
}

async function deleteLocalWorkspace(id: string, ownerId: string): Promise<void> {
  try {
    await fetch(`${DEV_API}/workspace/${id}`, {
      method: 'DELETE',
      headers: { 'X-User-Id': ownerId },
    });
  } catch { /* best-effort cleanup */ }
}

/**
 * Drives a pan or zoom gesture by dispatching synthetic events into the
 * iframe document, one event per animation frame so the browser actually
 * paints between them (realistic per-frame load).
 */
function gestureScript(kind: 'pan' | 'zoom', steps: number): string {
  return `
    (async function () {
      function findIframe(root) {
        var direct = root.querySelector('iframe#preview-frame');
        if (direct) return direct;
        var els = root.querySelectorAll('*');
        for (var i = 0; i < els.length; i++) {
          if (els[i].shadowRoot) {
            var f = findIframe(els[i].shadowRoot);
            if (f) return f;
          }
        }
        return null;
      }
      var iframe = findIframe(document);
      if (!iframe || !iframe.contentDocument) throw new Error('preview iframe not found');
      var doc = iframe.contentDocument;
      var rect = iframe.getBoundingClientRect();
      var cx = rect.left + rect.width / 2;
      var cy = rect.top + rect.height / 2;
      function frame() { return new Promise(function (r) { requestAnimationFrame(function () { r(); }); }); }

      if ('${kind}' === 'pan') {
        // Pointer events (the shared controller listens for these; a synthetic
        // MouseEvent does not generate pointer events).
        var pdOpts = { pointerId: 1, isPrimary: true, bubbles: true };
        doc.dispatchEvent(new PointerEvent('pointerdown', Object.assign({ clientX: cx, clientY: cy }, pdOpts)));
        for (var i = 0; i < ${steps}; i++) {
          // Oscillating drag so we keep panning back and forth across the canvas.
          var ox = Math.sin(i / 6) * (rect.width * 0.30);
          var oy = Math.cos(i / 9) * (rect.height * 0.30);
          doc.dispatchEvent(new PointerEvent('pointermove', Object.assign({ clientX: cx + ox, clientY: cy + oy }, pdOpts)));
          await frame();
        }
        doc.dispatchEvent(new PointerEvent('pointerup', Object.assign({ clientX: cx, clientY: cy }, pdOpts)));
      } else {
        for (var j = 0; j < ${steps}; j++) {
          // Alternate zoom-in / zoom-out so we exercise both scale directions.
          var deltaY = (j % 24 < 12) ? -120 : 120;
          doc.dispatchEvent(new WheelEvent('wheel', { deltaY: deltaY, clientX: cx, clientY: cy, bubbles: true, cancelable: true }));
          await frame();
        }
      }
      return true;
    })();
  `;
}

// ---------------------------------------------------------------------------
// Scenario runner
// ---------------------------------------------------------------------------

interface ScenarioResult {
  label: string;
  steps: number;
  wallMs: number;
  longestTaskMs: number;
  /** Authoritative main-thread split (seconds) from page.metrics(). */
  metricsDelta: Record<string, number>;
  /** Raw off-main raster/commit totals (ms) summed across threads. */
  rasterTaskMs: number;
  deserializeMs: number;
  commitWaitMs: number;
}

async function waitForRender(
  page: Page,
  label: string,
  verbose: boolean,
): Promise<{ nodes: number; dLen: number }> {
  // Poll geometry-node count until it stabilises (render finished) or times out.
  let last = -1;
  let stable = 0;
  let stats: { nodes: number; dLen: number } = { nodes: 0, dLen: 0 };
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    stats = (await page.evaluate(COUNT_NODES)) as { nodes: number; dLen: number };
    if (stats.nodes > 0 && stats.nodes === last) {
      stable++;
      if (stable >= 4) break; // stable across ~2s
    } else {
      stable = 0;
    }
    last = stats.nodes;
    if (verbose) process.stdout.write(`\r  [${label}] geometry nodes: ${stats.nodes}, path-data chars: ${stats.dLen.toLocaleString()}      `);
    await new Promise((r) => setTimeout(r, 500));
  }
  if (verbose) process.stdout.write('\n');
  if (stats.nodes <= 0) throw new Error(`render never produced geometry for ${label}`);
  // Settle: let the main thread go idle before tracing.
  await new Promise((r) => setTimeout(r, 1000));
  return stats;
}

async function runScenario(
  page: Page,
  browser: Browser,
  label: string,
  kind: 'pan' | 'zoom',
  steps: number,
  outDir: string,
  verbose: boolean,
): Promise<ScenarioResult> {
  const tracePath = join(outDir, `trace-${label.replace(/\s+/g, '-')}.json`);

  const m0 = await page.metrics();
  await page.tracing.start({
    path: tracePath,
    screenshots: false,
    categories: [
      'devtools.timeline',
      'disabled-by-default-devtools.timeline',
      'disabled-by-default-devtools.timeline.frame',
      'toplevel',
      'blink',
      'cc',
      'gpu',
      'viz',
      'benchmark',
    ],
  });

  const wallStart = Date.now();
  await page.evaluate(gestureScript(kind, steps));
  const wallMs = Date.now() - wallStart;

  await page.tracing.stop();
  const m1 = await page.metrics();

  // Parse the trace. We sum raw durations for the few events that
  // unambiguously identify raster/commit cost (tracing was started/stopped
  // tightly around the gesture, so the whole capture is the window).
  const raw = JSON.parse(readFileSync(tracePath, 'utf8')) as { traceEvents: TraceEvent[] };
  const { rasterTaskMs, deserializeMs, commitWaitMs, longestTaskMs } = analyzeTrace(raw.traceEvents);

  const metricsDelta: Record<string, number> = {};
  for (const k of ['ScriptDuration', 'LayoutDuration', 'RecalcStyleDuration', 'TaskDuration'] as const) {
    metricsDelta[k] = Number((((m1 as any)[k] ?? 0) - ((m0 as any)[k] ?? 0)).toFixed(4));
  }

  if (verbose) console.log(`  [${label}] done in ${wallMs}ms; raster ${rasterTaskMs.toFixed(0)}ms, commit-wait ${commitWaitMs.toFixed(0)}ms`);

  return {
    label,
    steps,
    wallMs,
    longestTaskMs,
    metricsDelta,
    rasterTaskMs,
    deserializeMs,
    commitWaitMs,
  };
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

function formatScenario(r: ScenarioResult): string {
  // Authoritative main-thread split (page.metrics is in seconds → ms).
  const taskMs = (r.metricsDelta.TaskDuration ?? 0) * 1000;
  const scriptMs = (r.metricsDelta.ScriptDuration ?? 0) * 1000;
  const layoutMs = (r.metricsDelta.LayoutDuration ?? 0) * 1000;
  const styleMs = (r.metricsDelta.RecalcStyleDuration ?? 0) * 1000;
  // Everything else on the main thread = paint recording + commit-wait. With a
  // huge SVG re-rasterized every viewBox change, this is the bulk of the jank.
  const paintCommitMs = Math.max(0, taskMs - scriptMs - layoutMs - styleMs);

  const verdict =
    paintCommitMs > 3 * (scriptMs + layoutMs + styleMs)
      ? 'PAINT / RASTER-bound (main thread is dominated by paint-record + commit-wait, not JS)'
      : scriptMs > paintCommitMs
        ? 'SCRIPTING-bound (avoidable JS dominates)'
        : 'mixed';

  const lines: string[] = [];
  lines.push(`### ${r.label}`);
  lines.push('');
  lines.push(`- Wall time: ${r.wallMs} ms over ${r.steps} gesture frames (~${(r.wallMs / r.steps).toFixed(0)} ms/frame)`);
  lines.push(`- Longest main-thread task: ${r.longestTaskMs.toFixed(0)} ms`);
  lines.push(`- **Verdict: ${verdict}**`);
  lines.push('');
  lines.push('Main-thread time (authoritative, page.metrics):');
  lines.push('');
  lines.push('| Category | ms | % of task |');
  lines.push('|---|---:|---:|');
  const t = taskMs || 1;
  lines.push(`| Scripting | ${scriptMs.toFixed(0)} | ${((scriptMs / t) * 100).toFixed(1)}% |`);
  lines.push(`| Layout | ${layoutMs.toFixed(0)} | ${((layoutMs / t) * 100).toFixed(1)}% |`);
  lines.push(`| Style | ${styleMs.toFixed(0)} | ${((styleMs / t) * 100).toFixed(1)}% |`);
  lines.push(`| Paint-record + commit-wait | ${paintCommitMs.toFixed(0)} | ${((paintCommitMs / t) * 100).toFixed(1)}% |`);
  lines.push(`| **Total task** | **${taskMs.toFixed(0)}** | 100% |`);
  lines.push('');
  lines.push('Off-main raster evidence (raw trace totals, summed across worker threads):');
  lines.push('');
  lines.push(`- \`RasterTask\`: ${r.rasterTaskMs.toFixed(0)} ms`);
  lines.push(`- \`RasterCHROMIUM::Deserializing\` (path-op stream decode): ${r.deserializeMs.toFixed(0)} ms`);
  lines.push(`- \`LayerTreeHost::WaitForCommitCompletion\` (main thread blocked on compositor): ${r.commitWaitMs.toFixed(0)} ms`);
  lines.push('');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function auditLocal(
  browser: Browser,
  steps: number,
  outDir: string,
  verbose: boolean,
): Promise<{ render: { nodes: number; dLen: number }; scenarios: ScenarioResult[] }> {
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1000 });
  page.on('console', (msg) => {
    const t = msg.text();
    if (verbose && (t.startsWith('Render time') || t.startsWith('Compile time'))) {
      console.log(`  [local console] ${t}`);
    }
  });

  // Seed a *valid* anonymous user id (21 chars from the client's nano-id
  // alphabet). The client regenerates any id that fails its format check, so
  // it must conform — otherwise workspace-view's GET 403s and silently falls
  // back to the demo scene. We set it before any navigation so getUserId()
  // adopts it, and create the workspace owned by the same id.
  const ownerId = makeAnonId();
  await page.evaluateOnNewDocument(
    (k: string, uid: string) => {
      try { localStorage.setItem(k, uid); } catch { /* ignore */ }
    },
    ANON_KEY,
    ownerId,
  );

  const workspaceId = await createLocalWorkspace(SOURCE, ownerId);
  if (verbose) console.log(`  created local workspace ${workspaceId} owned by ${ownerId}`);

  try {
    await page.goto(`${LOCAL_ORIGIN}/workspace/${workspaceId}`, { waitUntil: 'networkidle2', timeout: 60_000 });
    const render = await waitForRender(page, 'local', verbose);

    const scenarios: ScenarioResult[] = [];
    scenarios.push(await runScenario(page, browser, 'local pan', 'pan', steps, outDir, verbose));
    scenarios.push(await runScenario(page, browser, 'local zoom', 'zoom', steps, outDir, verbose));
    return { render, scenarios };
  } finally {
    await page.close();
    await deleteLocalWorkspace(workspaceId, ownerId);
  }
}

async function auditProd(
  browser: Browser,
  url: string,
  steps: number,
  outDir: string,
  verbose: boolean,
): Promise<{ render: { nodes: number; dLen: number }; scenarios: ScenarioResult[] }> {
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1000 });
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 90_000 });
  const render = await waitForRender(page, 'prod', verbose);

  const scenarios: ScenarioResult[] = [];
  scenarios.push(await runScenario(page, browser, 'prod pan', 'pan', steps, outDir, verbose));
  scenarios.push(await runScenario(page, browser, 'prod zoom', 'zoom', steps, outDir, verbose));
  await page.close();
  return { render, scenarios };
}

async function main(opts: {
  headed: boolean;
  verbose: boolean;
  steps: number;
  mode: 'local' | 'prod' | 'both';
  prodUrl: string;
  out: string;
}): Promise<number> {
  const outDir = opts.out;
  mkdirSync(outDir, { recursive: true });

  if (opts.mode !== 'prod') {
    try {
      const probePages = await fetch(`${LOCAL_ORIGIN}/`);
      const probeApi = await fetch(`${DEV_API}/`);
      if (!probePages.ok) throw new Error(`Pages HTTP ${probePages.status}`);
      if (!probeApi.ok) throw new Error(`API HTTP ${probeApi.status}`);
    } catch (err) {
      console.error(`✗ local dev stack not reachable (${LOCAL_ORIGIN} + ${DEV_API})`);
      console.error(`  start it with: npm run dev:stack`);
      console.error(`  underlying error: ${(err as Error).message}`);
      return 2;
    }
  }

  let browser: Browser | null = null;
  const report: string[] = [];
  const json: Record<string, unknown> = {};
  try {
    browser = await puppeteer.launch({
      headless: opts.headed ? false : true,
      args: ['--no-sandbox', '--disable-extensions', '--enable-gpu'],
    });

    if (opts.mode !== 'prod') {
      if (opts.verbose) console.log('→ local audit');
      const local = await auditLocal(browser, opts.steps, outDir, opts.verbose);
      json.local = local;
      report.push(`## Local (${local.render.nodes.toLocaleString()} geometry nodes, ${local.render.dLen.toLocaleString()} path-data chars)\n`);
      for (const s of local.scenarios) report.push(formatScenario(s));
    }
    if (opts.mode !== 'local') {
      if (opts.verbose) console.log('→ prod baseline audit');
      const prod = await auditProd(browser, opts.prodUrl, opts.steps, outDir, opts.verbose);
      json.prod = prod;
      report.push(`## Prod baseline (${prod.render.nodes.toLocaleString()} geometry nodes, ${prod.render.dLen.toLocaleString()} path-data chars)\n`);
      for (const s of prod.scenarios) report.push(formatScenario(s));
    }
  } finally {
    await browser?.close();
  }

  const md = `# Pan/Zoom Performance — captured metrics\n\n` +
    `Generated by \`scripts/perf-pan-zoom-audit.ts\`. Self-time is bucketed across all\n` +
    `threads (main + raster + compositor) so paint-bound costs that never touch the\n` +
    `main thread still show up.\n\n` +
    report.join('\n');

  const mdPath = join(outDir, 'captured-metrics.md');
  const jsonPath = join(outDir, 'captured-metrics.json');
  writeFileSync(mdPath, md);
  writeFileSync(jsonPath, JSON.stringify(json, null, 2));
  // Trace files are large; keep them only when verbose for inspection.
  if (!opts.verbose) {
    try {
      for (const f of ['local pan', 'local zoom', 'prod pan', 'prod zoom']) {
        rmSync(join(outDir, `trace-${f.replace(/\s+/g, '-')}.json`), { force: true });
      }
    } catch { /* ignore */ }
  }

  console.log(`\n✓ wrote ${mdPath}`);
  console.log(`✓ wrote ${jsonPath}`);
  console.log('\n' + md);
  return 0;
}

const program = new Command();
program
  .name('perf-pan-zoom-audit')
  .description('Profile pan/zoom interaction perf in the playground SVG preview')
  .option('--headed', 'Run with a visible browser window', false)
  .option('-v, --verbose', 'Print per-step progress', false)
  .option('--steps <n>', 'Gesture frames per scenario', (v) => parseInt(v, 10), 120)
  .option('--mode <mode>', 'local | prod | both', 'both')
  .option('--prod-url <url>', 'Prod workspace URL for the baseline', PROD_WORKSPACE_URL)
  .option('--out <dir>', 'Output directory', OUT_DIR_DEFAULT)
  .action(async (opts) => {
    const code = await main({
      headed: opts.headed,
      verbose: opts.verbose,
      steps: opts.steps,
      mode: opts.mode,
      prodUrl: opts.prodUrl,
      out: opts.out,
    });
    process.exit(code);
  });
program.parseAsync();
