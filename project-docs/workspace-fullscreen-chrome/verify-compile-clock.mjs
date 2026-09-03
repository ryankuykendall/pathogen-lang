// Verification for the "Compiling... MM:SS" elapsed clock on the status chip
// (editor mode = breadcrumb chip, fullscreen mode = preview-pane chip).
// Run: node project-docs/workspace-fullscreen-chrome/verify-compile-clock.mjs
// Requires the dev stack on :3000 with the playground rebuilt for it:
//   PATHOGEN_API_BASE=http://localhost:8787 npm run build:playground
//
// Checks, per theme (light, dark) and per surface:
//   - the chip reads "Compiling... MM:SS", starts at 00:00, advances through
//     ≥3 distinct values, is monotonic, and tracks wall time within 1.5 s;
//   - ticks patch the SAME chip node (pane: node identity; breadcrumb: its
//     render() runs fewer times than the clock ticks, so ticks are not
//     re-renders) and the pulse animation stays attached;
//   - Refresh mid-compile (a superseding compile) restarts the clock at 00:00.
// Screenshots (full frame + chip crop) land next to this file.
import puppeteer from 'puppeteer';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = dirname(fileURLToPath(import.meta.url));
const CODE = readFileSync(join(OUT_DIR, 'slow-compile.pathogen'), 'utf8');
const urlFor = (code) => {
  const state = Buffer.from(encodeURIComponent(JSON.stringify({ code }))).toString('base64');
  return `http://localhost:3000/pathogen/workspace/scratch?state=${encodeURIComponent(state)}`;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const SHELL = `document.querySelector('app-shell')?.shadowRoot`;
const BREADCRUMB = `${SHELL}?.querySelector('app-breadcrumb')`;
const PANE = `${SHELL}?.querySelector('workspace-view')?.shadowRoot?.querySelector('svg-preview-pane')`;
const CLOCK_RE = /^Compiling\.\.\. (\d{2,}):(\d{2})$/;
const toSeconds = (text) => {
  const m = CLOCK_RE.exec(text);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

// Chip sample from a host's shadow root: null when absent or display:none.
// Tags the node with a probe id so node replacement is detectable, and counts
// the breadcrumb's render() calls (a re-render would replace the node).
const readChip = (page, hostPath) =>
  page.evaluate(`(() => {
    const host = ${hostPath};
    if (!host) return null;
    if (typeof host.render === 'function' && !host.__renderCounted) {
      host.__renderCounted = true; host.__renders = 0;
      const orig = host.render.bind(host);
      host.render = (...a) => { host.__renders++; return orig(...a); };
    }
    const el = host.shadowRoot?.querySelector('#compilation-status');
    if (!el) return null;
    const cs = getComputedStyle(el);
    if (cs.display === 'none') return null;
    if (!el.dataset.probe) el.dataset.probe = String(Math.random());
    const r = el.getBoundingClientRect();
    return { text: el.textContent, probe: el.dataset.probe, animation: cs.animationName,
      renders: host.__renders ?? null, rect: { x: r.x, y: r.y, w: r.width, h: r.height } };
  })()`);

async function shootChip(page, sample, name) {
  await page.screenshot({ path: join(OUT_DIR, `${name}.png`) });
  const { x, y, w, h } = sample.rect;
  const pad = 60;
  await page.screenshot({
    path: join(OUT_DIR, `${name}-chip.png`),
    clip: { x: Math.max(0, x - pad), y: Math.max(0, y - pad), width: w + pad * 2, height: h + pad * 2 },
  });
}

// Poll a chip while it shows the clock; stop once it moves on (Rendering/Ready/
// Error) after having shown at least one clock value, or at the deadline.
async function pollClock(page, hostPath, { shotName = null, timeoutMs = 60000, everyMs = 150 } = {}) {
  const samples = [];
  let shot = false;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const s = await readChip(page, hostPath);
    if (s) {
      samples.push({ ...s, at: Date.now() });
      const isClock = CLOCK_RE.test(s.text);
      if (isClock && shotName && !shot && toSeconds(s.text) >= 2) {
        await shootChip(page, s, shotName);
        shot = true;
      }
      if (!isClock && samples.some((x) => CLOCK_RE.test(x.text))) break;
    }
    await sleep(everyMs);
  }
  return samples;
}

function assessClock(label, samples, { strictNode }) {
  const clocks = samples.filter((s) => CLOCK_RE.test(s.text));
  const seconds = clocks.map((s) => toSeconds(s.text));
  const distinct = [...new Set(clocks.map((s) => s.text))];
  const after = samples.filter((s) => !CLOCK_RE.test(s.text)).map((s) => s.text);
  check(`${label}: chip shows "Compiling... MM:SS"`, clocks.length > 0,
    distinct.join(' → ') || `saw: ${samples.map((s) => s.text).join(',') || 'nothing'}`);
  if (clocks.length === 0) return clocks;
  check(`${label}: clock starts at 00:00`, clocks[0].text === 'Compiling... 00:00', clocks[0].text);
  check(`${label}: clock advances (≥3 distinct values)`, distinct.length >= 3, `${distinct.length} values`);
  check(`${label}: clock is monotonic`, seconds.every((s, i) => i === 0 || s >= seconds[i - 1]));
  const wall = (clocks[clocks.length - 1].at - clocks[0].at) / 1000;
  const shown = seconds[seconds.length - 1] - seconds[0];
  check(`${label}: clock tracks wall time`, Math.abs(wall - shown) <= 1.5, `wall ${wall.toFixed(1)}s vs shown ${shown}s`);
  check(`${label}: pulse animation stays on the compiling chip`, clocks.every((s) => s.animation === 'pulse'), clocks[0].animation);
  if (strictNode) {
    check(`${label}: same chip node across all ticks`, new Set(clocks.map((s) => s.probe)).size === 1);
  } else {
    const renders = clocks[clocks.length - 1].renders - clocks[0].renders;
    check(`${label}: ticks do not re-render the bar`, renders < distinct.length - 1,
      `${renders} render() calls during ${distinct.length} clock values`);
  }
  check(`${label}: chip moves on after compiling`, after.length > 0, after.join(','));
  return clocks;
}

const browser = await puppeteer.launch({ headless: 'new' });
try {
  for (const theme of ['light', 'dark']) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1600, height: 1000 });
    page.on('dialog', (d) => d.dismiss().catch(() => {}));
    await page.evaluateOnNewDocument(() => {
      try { localStorage.setItem('pathogen-user-id', 'verify-agent-anon'); } catch {}
    });
    if (theme === 'dark') await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
    await page.goto(urlFor(CODE), { waitUntil: 'domcontentloaded', timeout: 60000 });

    // ---------- Editor mode: breadcrumb chip during the initial compile ----------
    const editorSamples = await pollClock(page, BREADCRUMB, { shotName: `compile-clock-editor-${theme}` });
    assessClock(`${theme} editor`, editorSamples, { strictNode: false });
    // Let Ready → idle settle and the breadcrumb learn the program uses random.
    await sleep(2000);

    if (theme === 'light') {
      // ---------- Superseding compile: Refresh mid-compile restarts the clock ----------
      const hasRefresh = await page.evaluate(`Boolean(${BREADCRUMB}?.shadowRoot?.querySelector('#refresh-btn'))`);
      check('editor: breadcrumb Refresh available (random program)', hasRefresh);
      await page.evaluate(`${BREADCRUMB}.shadowRoot.querySelector('#refresh-btn').click()`);
      let reached = null;
      for (let i = 0; i < 60 && !reached; i++) {
        const s = await readChip(page, BREADCRUMB);
        if (s && toSeconds(s.text) >= 2) reached = s;
        await sleep(150);
      }
      check('supersede: first compile reached 00:02', reached !== null, reached?.text);
      await page.evaluate(`${BREADCRUMB}.shadowRoot.querySelector('#refresh-btn').click()`);
      await sleep(250);
      const restarted = await readChip(page, BREADCRUMB);
      check('supersede: clock restarts at 00:00 for the newer compile', restarted?.text === 'Compiling... 00:00', restarted?.text);
      const tail = await pollClock(page, BREADCRUMB, { timeoutMs: 60000 });
      const tailSeconds = tail.filter((s) => CLOCK_RE.test(s.text)).map((s) => toSeconds(s.text));
      check('supersede: newer compile\'s clock keeps advancing', Math.max(...tailSeconds, -1) >= 2, `max ${Math.max(...tailSeconds, -1)}s`);
      await sleep(2000);
    }

    // ---------- Fullscreen mode: pane chip on Refresh ----------
    await page.evaluate(`${PANE}.shadowRoot.querySelector('#fullscreen-toggle').click()`);
    await sleep(400);
    const fsOn = await page.evaluate(`${PANE}.classList.contains('fullscreen')`);
    check(`${theme} fullscreen entered`, fsOn);
    await page.evaluate(`${PANE}.shadowRoot.querySelector('#refresh-btn').click()`);
    const fsSamples = await pollClock(page, PANE, { shotName: `compile-clock-fullscreen-${theme}` });
    assessClock(`${theme} fullscreen`, fsSamples, { strictNode: true });
    await page.close();
  }
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
