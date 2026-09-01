// Puppeteer editor-latency profiler for the playground workspace.
//
// Diagnoses typing choppiness: drives the real workspace at localhost:3000
// with a heavy program (or --file), performs typing + cursor-movement bursts
// against the live CodeMirror editor, and reports where main-thread time goes
// using the flag-gated `pathogen:*` performance spans (playground/utils/
// perf-marks.ts), slow-input-event / long-task observer output, and the
// existing Compile/Render console logs.
//
// Requires the playground to be served (dev:website or dev:website:quick)
// with a build that includes perf-marks instrumentation:
//   PATHOGEN_API_BASE=http://localhost:8787 npm run build:playground
//
// See project-docs/editor-perf/ for findings.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Command } from 'commander';
import puppeteer from 'puppeteer';
import type { Page } from 'puppeteer';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const program = new Command();
program
  .name('perf-typing-audit')
  .description(
    'Profile playground editor typing latency: perf spans, long tasks, slow input events per interaction phase',
  )
  .option('--pages-url <url>', 'Pages dev URL', 'http://localhost:3000')
  .option('--file <path>', 'Use this .pathogen source instead of the generated heavy program')
  .option('--layers <n>', 'Generated program: number of path layers', '6')
  .option('--loops <n>', 'Generated program: loop iterations per layer', '350')
  .option('--pad-lines <n>', 'Generated program: comment padding lines (parse weight)', '250')
  .option('--type-delay <ms>', 'Keystroke delay for the slow-typing burst', '180')
  .option(
    '--wide-layers <n>',
    'Generated program: n cheap one-circle layers with stroke+fill (inspector row stress; overrides --layers shape)',
  )
  .option('--inspector <state>', 'Inspector panel state during the run: closed | open', 'closed')
  .option(
    '--kill-inspector',
    'Disable the inspector store subscription entirely (__PATHOGEN_NO_INSPECTOR__ A/B baseline)',
  )
  .parse();

const opts = program.opts<{
  pagesUrl: string;
  file?: string;
  layers: string;
  loops: string;
  padLines: string;
  typeDelay: string;
  wideLayers?: string;
  inspector: string;
  killInspector?: boolean;
}>();

function encodeState(code: string): string {
  return btoa(encodeURIComponent(JSON.stringify({ code })));
}

/**
 * Deterministic heavy program: compile weight from per-layer loops of
 * stdlib circle() calls, parse weight from comment padding. Knobs let us
 * calibrate to the user's reported ~200ms compile time.
 */
function generateHeavyProgram(layers: number, loops: number, padLines: number): string {
  const parts: string[] = ['define ViewBox(0, 0, 1000, 1000);', ''];
  for (let l = 0; l < layers; l++) {
    const hue = Math.round((l * 360) / layers);
    parts.push(
      `let ring${l} = PathLayer('ring${l}') << \${ stroke: oklch(0.65 0.16 ${hue}); stroke-width: 1.2; fill: none; };`,
    );
    parts.push(`ring${l}.apply {`);
    parts.push(`  for (i in 0..${loops}) {`);
    parts.push(
      `    circle(500 + (300 + ${l} * 18) * cos(i * 0.618), 500 + (300 + ${l} * 18) * sin(i * 0.618), 3 + (i % 11));`,
    );
    parts.push('  }');
    parts.push('}');
    parts.push('');
  }
  for (let p = 0; p < padLines; p++) {
    parts.push(`// padding line ${p} — simulates a large hand-written document for parse-cost realism`);
  }
  parts.push('');
  return parts.join('\n');
}

/**
 * Wide program for inspector-row stress: many cheap layers (one circle each)
 * with both stroke and fill so the palette panel gets two color rows per
 * layer — ~4 inspector rows per layer across the panels, negligible per-layer
 * compile weight so 20k layers stays iterable.
 */
function generateWideLayerProgram(layers: number): string {
  return [
    'define ViewBox(0, 0, 2000, 2000);',
    '',
    `for (i in 0..${layers}) {`,
    // eslint-disable-next-line no-template-curly-in-string -- Pathogen interpolation, not a JS template
    '  let wideLayer = PathLayer(`wide${i}`) << ${ stroke: oklch(0.6 0.12 200); stroke-width: 0.5; fill: oklch(0.9 0.05 80); };',
    '  wideLayer.apply {',
    '    circle(40 + (i % 140) * 14, 40 + floor(i / 140) * 14, 5);',
    '  }',
    '}',
    '',
  ].join('\n');
}

interface SpanEntry {
  name: string;
  duration: number;
  startTime: number;
}

interface PhaseWindow {
  label: string;
  from: number;
  to: number;
}

async function pageNow(page: Page): Promise<number> {
  return page.evaluate(() => performance.now());
}

async function collectSpans(page: Page): Promise<SpanEntry[]> {
  return page.evaluate(() => {
    // eslint-disable-next-line n/no-unsupported-features/node-builtins -- browser context, not Node
    const measures = performance.getEntriesByType('measure');
    return measures
      .filter((m) => m.name.startsWith('pathogen:'))
      .map((m) => ({ name: m.name.slice('pathogen:'.length), duration: m.duration, startTime: m.startTime }));
  });
}

function summarizeWindow(spans: SpanEntry[], win: PhaseWindow): string[] {
  const inWindow = spans.filter((s) => s.startTime >= win.from && s.startTime < win.to);
  const byName = new Map<string, number[]>();
  for (const s of inWindow) {
    const list = byName.get(s.name) ?? [];
    list.push(s.duration);
    byName.set(s.name, list);
  }
  const lines: string[] = [];
  const names = Array.from(byName.keys()).sort((a, b) => sum(byName.get(b)!) - sum(byName.get(a)!));
  for (const name of names) {
    const d = byName.get(name)!;
    lines.push(
      `    ${name.padEnd(24)} n=${String(d.length).padStart(3)}  total=${sum(d).toFixed(0).padStart(6)}ms  mean=${(sum(d) / d.length).toFixed(1).padStart(7)}ms  max=${Math.max(
        ...d,
      )
        .toFixed(1)
        .padStart(7)}ms`,
    );
  }
  if (lines.length === 0) lines.push('    (no pathogen spans in this window)');
  return lines;
}

function sum(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0);
}

async function probeStatus(page: Page): Promise<{ editor: boolean; pathCount: number; error: string | null }> {
  return page.evaluate(() => {
    const deepQuery = (root: Document | ShadowRoot | Element, selector: string): Element | null => {
      const direct = (root as Document).querySelector?.(selector);
      if (direct) return direct;
      const all = (root as Document).querySelectorAll?.('*') ?? [];
      for (const el of Array.from(all)) {
        if (el.shadowRoot) {
          const found = deepQuery(el.shadowRoot, selector);
          if (found) return found;
        }
      }
      return null;
    };
    const editor = !!deepQuery(document, '.cm-content');
    let pathCount = 0;
    const iframe = deepQuery(document, 'iframe') as HTMLIFrameElement | null;
    if (iframe?.contentDocument) {
      pathCount = iframe.contentDocument.querySelectorAll('path').length;
    }
    const errPanel = deepQuery(document, 'error-panel') as (Element & { message?: string }) | null;
    const error = errPanel?.message?.trim() || null;
    return { editor, pathCount, error };
  });
}

async function main(): Promise<void> {
  const layers = parseInt(opts.layers, 10);
  const loops = parseInt(opts.loops, 10);
  const padLines = parseInt(opts.padLines, 10);
  const typeDelay = parseInt(opts.typeDelay, 10);

  let source: string;
  if (opts.file) {
    source = readFileSync(opts.file, 'utf-8');
    console.log(`source: ${opts.file} (${source.length} chars)`);
  } else if (opts.wideLayers) {
    const wide = parseInt(opts.wideLayers, 10);
    source = generateWideLayerProgram(wide);
    const outDir = join(ROOT, 'project-docs', 'editor-perf');
    mkdirSync(outDir, { recursive: true });
    const savedTo = join(outDir, 'generated-wide.pathogen');
    writeFileSync(savedTo, source);
    console.log(`source: generated wide (${wide} one-circle layers, ${source.length} chars) → ${savedTo}`);
  } else {
    source = generateHeavyProgram(layers, loops, padLines);
    const outDir = join(ROOT, 'project-docs', 'editor-perf');
    mkdirSync(outDir, { recursive: true });
    const savedTo = join(outDir, 'generated-heavy.pathogen');
    writeFileSync(savedTo, source);
    console.log(
      `source: generated (${layers} layers × ${loops} loops + ${padLines} pad lines, ${source.length} chars) → ${savedTo}`,
    );
  }

  const browser = await puppeteer.launch({ headless: true, defaultViewport: { width: 1500, height: 1000 } });
  try {
    const page = await browser.newPage();
    page.on('dialog', (d) => {
      d.dismiss().catch(() => {});
    });
    page.on('pageerror', (err) => console.log('[pageerror]', err.message));

    const consoleLines: { t: number; text: string }[] = [];
    const t0 = Date.now();
    page.on('console', (msg) => {
      const text = msg.text();
      if (text.startsWith('[perf]') || text.startsWith('Compile time:') || text.startsWith('Render time:')) {
        consoleLines.push({ t: Date.now() - t0, text });
      }
    });

    console.log(`inspector: ${opts.inspector}${opts.killInspector ? ' (subscription kill switch ON)' : ''}`);
    await page.evaluateOnNewDocument((killInspector: boolean) => {
      (window as unknown as { __name?: <T>(fn: T) => T }).__name = <T>(fn: T): T => fn;
      if (killInspector) {
        (window as unknown as { __PATHOGEN_NO_INSPECTOR__?: boolean }).__PATHOGEN_NO_INSPECTOR__ = true;
      }
      try {
        localStorage.setItem('pathogen-lang:userId', 'e2e-perf-typing-audit');
        localStorage.setItem('pathogenPerf', '1');
      } catch {
        /* ignore */
      }
    }, opts.killInspector === true);

    const url = `${opts.pagesUrl}/workspace/scratch?state=${encodeState(source)}`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 }).catch(() => {
      /* gate on editor DOM below instead */
    });

    // Wait for editor + first successful render (poll: CSP breaks waitForFunction).
    let ready = false;
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 500));
      const s = await probeStatus(page);
      if (s.error) {
        console.error('COMPILE ERROR in test program — fix the source before measuring:\n', s.error.slice(0, 400));
        return;
      }
      if (s.editor && s.pathCount > 0) {
        ready = true;
        break;
      }
    }
    if (!ready) {
      console.error('Timed out waiting for editor + first render. Is the dev server running with a current build?');
      return;
    }
    console.log('workspace ready — first compile/render done\n');

    if (opts.inspector === 'open') {
      // workspace-view listens for this on document; opening before the
      // typing phases makes every debounced compile pay the visible-inspector
      // render path.
      // eslint-disable-next-line n/no-unsupported-features/node-builtins -- browser context, not Node
      await page.evaluate(() => document.dispatchEvent(new CustomEvent('toggle-inspector')));
      await new Promise((r) => setTimeout(r, 1500));
      console.log('inspector opened\n');
    }

    // Focus the editor programmatically (a coordinate click can be swallowed
    // by long tasks / overlays), then jump the cursor to the document end so
    // typed text lands after the program body.
    const focused = await page.evaluate(() => {
      const deepQuery = (root: Document | ShadowRoot | Element, selector: string): Element | null => {
        const direct = (root as Document).querySelector?.(selector);
        if (direct) return direct;
        const all = (root as Document).querySelectorAll?.('*') ?? [];
        for (const el of Array.from(all)) {
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
      let ae: Element | null = document.activeElement;
      while (ae?.shadowRoot?.activeElement) ae = ae.shadowRoot.activeElement;
      return !!ae && (ae === content || ae.classList.contains('cm-content'));
    });
    if (!focused) {
      console.error('Could not focus .cm-content');
      return;
    }
    await page.keyboard.down('Meta');
    await page.keyboard.press('ArrowDown'); // Cmd+ArrowDown → doc end (mac keymap)
    await page.keyboard.up('Meta');
    await new Promise((r) => setTimeout(r, 800));

    const windows: PhaseWindow[] = [];

    // Phase 1 — fast typing burst (keystrokes beat the 150ms debounce; measures
    // per-keystroke editor extensions: signature-help, scope analysis).
    // Starts with '//' so the appended line is a comment: after the first two
    // keystrokes the program stays valid (the lone '/' state is realistic too).
    let from = await pageNow(page);
    await page.keyboard.press('Enter');
    await page.keyboard.type('// fast burst abcdefghijklmnop', { delay: 60 });
    await new Promise((r) => setTimeout(r, 1200));
    windows.push({ label: 'Phase 1: fast typing (60ms/key, 30 keys)', from, to: await pageNow(page) });

    // Sanity check: confirm the burst actually landed in the editor.
    const burstLanded = await page.evaluate(() => {
      const walk = (root: Document | ShadowRoot | Element): Element | null => {
        const direct = (root as Document).querySelector?.('.cm-content');
        if (direct) return direct;
        const all = (root as Document).querySelectorAll?.('*') ?? [];
        for (const el of Array.from(all)) {
          if (el.shadowRoot) {
            const found = walk(el.shadowRoot);
            if (found) return found;
          }
        }
        return null;
      };
      return walk(document)?.textContent?.includes('fast burst') ?? false;
    });
    if (!burstLanded) console.error('WARNING: typed burst not found in editor text — keystrokes did not land');

    // Phase 2 — slow typing (each keystroke lets the debounce fire: full
    // compile → render pipeline lands between keystrokes; worst-case chop).
    from = await pageNow(page);
    await page.keyboard.type(' slow deliberate typing', { delay: typeDelay });
    await new Promise((r) => setTimeout(r, 1500));
    windows.push({ label: `Phase 2: slow typing (${typeDelay}ms/key, 23 keys)`, from, to: await pageNow(page) });

    // Phase 3 — cursor movement only (no doc change: isolates the
    // selection-triggered signature-help recompute).
    from = await pageNow(page);
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press(i % 2 === 0 ? 'ArrowLeft' : 'ArrowRight');
      await new Promise((r) => setTimeout(r, 60));
    }
    await new Promise((r) => setTimeout(r, 800));
    windows.push({ label: 'Phase 3: arrow-key cursor movement (40 presses)', from, to: await pageNow(page) });

    // Phase 4 — enter a long-lived EVAL-error state: a statement that parses
    // fine but fails evaluation (undefined variable). Placed at the document
    // end so the evaluator runs the whole program before hitting it — the
    // worst case for the main-thread getDiagnostics in showError().
    from = await pageNow(page);
    await page.keyboard.down('Meta');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.up('Meta');
    await page.keyboard.press('Enter');
    await page.keyboard.type('let zz = nosuchvariable;', { delay: 60 });
    await new Promise((r) => setTimeout(r, 1500));
    windows.push({ label: 'Phase 4: entering eval-error state (24 keys)', from, to: await pageNow(page) });

    // Phase 5 — sustained typing while the program stays broken: every
    // debounced compile fails in the worker, then showError() runs
    // getDiagnostics (parse + full evaluate) on the MAIN thread.
    from = await pageNow(page);
    await page.keyboard.press('Enter');
    await page.keyboard.type('// editing while broken', { delay: typeDelay });
    await new Promise((r) => setTimeout(r, 1500));
    windows.push({
      label: `Phase 5: typing in error state (${typeDelay}ms/key, 23 keys)`,
      from,
      to: await pageNow(page),
    });

    const spans = await collectSpans(page);
    console.log('━━━ pathogen:* span summary per phase ━━━');
    for (const win of windows) {
      console.log(`\n  ${win.label}  [${(win.to - win.from).toFixed(0)}ms window]`);
      for (const line of summarizeWindow(spans, win)) console.log(line);
    }

    console.log('\n━━━ console timing / observer log (chronological) ━━━');
    for (const line of consoleLines) {
      console.log(`  +${String(line.t).padStart(6)}ms  ${line.text}`);
    }

    const status = await probeStatus(page);
    console.log(
      `\nfinal: preview paths=${status.pathCount}, error=${status.error ? status.error.slice(0, 120) : 'none'}`,
    );
  } finally {
    await browser.close();
  }
}

await main();
