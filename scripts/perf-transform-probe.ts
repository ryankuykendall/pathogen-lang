/**
 * CSS-transform vs viewBox render-mechanism probe.
 *
 * The pan/zoom jank in the large "grids-and-cycling" workspace is raster-bound:
 * every viewBox change forces Chrome to re-rasterize a 72.5M-char SVG (see
 * project-docs/pan-zoom-performance/findings-and-recommendations.md). The open
 * question is whether driving pan/zoom with a CSS `transform` on a composited
 * layer — instead of mutating `viewBox` — lets the GPU move an already-rasterized
 * layer WITHOUT re-rastering.
 *
 * This probe isolates the RENDER mechanism (not the component's JS path): it
 * loads the real scene, then drives 60 frames two ways, directly on the iframe
 * SVG, and compares raster/commit cost:
 *
 *   A) viewBox     — setAttribute('viewBox', …) each frame (the status quo)
 *   B) transform   — fix viewBox, set will-change + style.transform=translate(…)
 *                    each frame (the candidate)
 *   C) transform+scale — same, but translate()+scale() (tests whether crisp zoom
 *                    re-rasters even under transform)
 *
 * If B collapses RasterTask toward zero while A stays high, CSS-transform pan
 * avoids re-raster here and is worth building. If B stays high, an SVG-in-iframe
 * does not get a cheap composited transform and we need a different lever
 * (raster-snapshot, geometry decimation). Run: npm run perf:transform-probe
 */

import { Command } from 'commander';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import puppeteer, { type Browser, type Page } from 'puppeteer';

const LOCAL_ORIGIN = 'http://localhost:3000';
const DEV_API = 'http://localhost:8787';
const ANON_KEY = 'pathogen-lang:userId';
const SOURCE_FILE = join(
  process.cwd(),
  'project-docs',
  'pan-zoom-performance',
  'grids-and-cycling.pathogen',
);

function makeAnonId(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_~-';
  let id = '';
  for (let i = 0; i < 21; i++) id += alphabet[Math.floor(Math.random() * alphabet.length)];
  return id;
}

interface TraceEvent { name: string; ph: string; dur?: number }

function sumDur(events: TraceEvent[], name: string): number {
  let us = 0;
  for (const e of events) if (e.ph === 'X' && typeof e.dur === 'number' && e.name === name) us += e.dur;
  return us / 1000;
}

const COUNT_PATHS = `(function(){function f(r){const d=r.querySelector('iframe#preview-frame');if(d)return d;for(const e of r.querySelectorAll('*'))if(e.shadowRoot){const x=f(e.shadowRoot);if(x)return x}return null}const i=f(document);if(!i||!i.contentDocument)return -1;return (i.contentDocument.getElementById('preview-layers')||i.contentDocument).querySelectorAll('path').length;})()`;

/** Drives one render-mechanism for `steps` frames, directly on the iframe SVG. */
function driveScript(mode: 'viewbox' | 'transform' | 'transform-scale', steps: number): string {
  return `
    (async function () {
      function findIframe(root) {
        var d = root.querySelector('iframe#preview-frame'); if (d) return d;
        var els = root.querySelectorAll('*');
        for (var i = 0; i < els.length; i++) if (els[i].shadowRoot) { var f = findIframe(els[i].shadowRoot); if (f) return f; }
        return null;
      }
      var iframe = findIframe(document);
      var doc = iframe.contentDocument;
      var svg = doc.getElementById('preview');
      var vb0 = (svg.getAttribute('viewBox') || '0 0 13200 7200').split(/\\s+/).map(Number);
      var W = vb0[2], H = vb0[3];
      function frame() { return new Promise(function (r) { requestAnimationFrame(function () { r(); }); }); }

      if ('${mode}' === 'viewbox') {
        for (var i = 0; i < ${steps}; i++) {
          var px = vb0[0] + Math.sin(i / 6) * (W * 0.15);
          var py = vb0[1] + Math.cos(i / 9) * (H * 0.15);
          svg.setAttribute('viewBox', px + ' ' + py + ' ' + W + ' ' + H);
          await frame();
        }
      } else {
        // Fix the viewBox so the SVG rasterizes once; promote to its own layer.
        svg.style.willChange = 'transform';
        svg.style.transformOrigin = '0 0';
        for (var j = 0; j < ${steps}; j++) {
          var tx = Math.sin(j / 6) * 300;   // CSS px
          var ty = Math.cos(j / 9) * 200;
          if ('${mode}' === 'transform-scale') {
            var s = 1 + 0.5 * (0.5 + 0.5 * Math.sin(j / 8));
            svg.style.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(' + s + ')';
          } else {
            svg.style.transform = 'translate(' + tx + 'px,' + ty + 'px)';
          }
          await frame();
        }
        svg.style.transform = '';
        svg.style.willChange = '';
      }
      return true;
    })();
  `;
}

interface ProbeResult {
  mode: string;
  wallMs: number;
  taskMs: number;
  rasterTaskMs: number;
  commitWaitMs: number;
}

async function runMode(page: Page, mode: 'viewbox' | 'transform' | 'transform-scale', steps: number, outDir: string): Promise<ProbeResult> {
  const tracePath = join(outDir, `probe-${mode}.json`);
  const m0 = await page.metrics();
  await page.tracing.start({
    path: tracePath,
    screenshots: false,
    categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'toplevel', 'blink', 'cc', 'gpu', 'viz'],
  });
  const t0 = Date.now();
  await page.evaluate(driveScript(mode, steps));
  const wallMs = Date.now() - t0;
  await page.tracing.stop();
  const m1 = await page.metrics();
  const events = (JSON.parse(readFileSync(tracePath, 'utf8')) as { traceEvents: TraceEvent[] }).traceEvents;
  rmSync(tracePath, { force: true }); // traces are large; keep only the summary
  return {
    mode,
    wallMs,
    taskMs: Number(((((m1 as any).TaskDuration ?? 0) - ((m0 as any).TaskDuration ?? 0)) * 1000).toFixed(0)),
    rasterTaskMs: Number(sumDur(events, 'RasterTask').toFixed(0)),
    commitWaitMs: Number(sumDur(events, 'LayerTreeHost::WaitForCommitCompletion').toFixed(0)),
  };
}

async function main(opts: { headed: boolean; steps: number; out: string }): Promise<number> {
  try {
    const a = await fetch(`${LOCAL_ORIGIN}/`); const b = await fetch(`${DEV_API}/`);
    if (!a.ok || !b.ok) throw new Error('dev stack not ok');
  } catch (err) {
    console.error(`✗ dev stack not reachable; run: npm run dev:stack (${(err as Error).message})`);
    return 2;
  }

  const source = readFileSync(SOURCE_FILE, 'utf8');
  const ownerId = makeAnonId();
  const created = await fetch(`${DEV_API}/workspace`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-User-Id': ownerId },
    body: JSON.stringify({ name: 'perf-transform-probe', code: source }),
  });
  const { id } = (await created.json()) as { id: string };

  let browser: Browser | null = null;
  const results: ProbeResult[] = [];
  try {
    browser = await puppeteer.launch({
      headless: opts.headed ? false : true,
      args: ['--no-sandbox', '--enable-gpu'],
      protocolTimeout: 600_000, // forced back-to-back rasters can be slow
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1600, height: 1000 });
    await page.evaluateOnNewDocument((k: string, u: string) => { try { localStorage.setItem(k, u); } catch { /* */ } }, ANON_KEY, ownerId);
    await page.goto(`${LOCAL_ORIGIN}/workspace/${id}`, { waitUntil: 'networkidle2', timeout: 60_000 });

    // Wait for the real scene to render (poll path count to stable).
    let last = -1, stable = 0, n = 0;
    for (let i = 0; i < 120; i++) {
      n = (await page.evaluate(COUNT_PATHS)) as number;
      if (n > 0 && n === last) { if (++stable >= 4) break; } else stable = 0;
      last = n;
      await new Promise((r) => setTimeout(r, 500));
    }
    if (n <= 0) throw new Error('scene did not render');
    console.log(`scene rendered: ${n} paths`);
    await new Promise((r) => setTimeout(r, 1000));

    for (const mode of ['viewbox', 'transform', 'transform-scale'] as const) {
      results.push(await runMode(page, mode, opts.steps, opts.out));
    }
    await page.close();
  } finally {
    await browser?.close();
    await fetch(`${DEV_API}/workspace/${id}`, { method: 'DELETE', headers: { 'X-User-Id': ownerId } }).catch(() => {});
  }

  console.log('\nRender-mechanism comparison (60 frames each, isolated from component JS):\n');
  console.log('| mode | wall ms | task ms | RasterTask ms | commit-wait ms |');
  console.log('|---|---:|---:|---:|---:|');
  for (const r of results) {
    console.log(`| ${r.mode} | ${r.wallMs} | ${r.taskMs} | ${r.rasterTaskMs} | ${r.commitWaitMs} |`);
  }
  return 0;
}

const program = new Command();
program
  .name('perf-transform-probe')
  .description('Compare viewBox-mutation vs CSS-transform render cost for the large SVG')
  .option('--headed', 'Visible browser', false)
  .option('--steps <n>', 'Frames per mode', (v) => parseInt(v, 10), 30)
  .option('--out <dir>', 'Output dir for traces', join(process.cwd(), 'project-docs', 'pan-zoom-performance', 'transform-probe'))
  .action(async (opts) => {
    const { mkdirSync } = await import('node:fs');
    mkdirSync(opts.out, { recursive: true });
    process.exit(await main({ headed: opts.headed, steps: opts.steps, out: opts.out }));
  });
program.parseAsync();
