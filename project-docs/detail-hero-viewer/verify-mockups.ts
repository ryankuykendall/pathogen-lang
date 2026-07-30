// Throwaway verification + screenshot harness for the detail-hero-viewer mockups.
// Run: npx tsx verify-mockups.ts
import puppeteer from 'puppeteer';
import { mkdirSync } from 'fs';

const BASE = 'http://localhost:3001/project-docs/detail-hero-viewer/mockups';
const SHOTS = '/Users/ryan/claude-code-projects/svg-path-extended/project-docs/detail-hero-viewer/mockups/screenshots';
const VARIANTS = [
  { key: 'a', file: 'variant-a-refined-plate.html' },
  { key: 'b', file: 'variant-b-framed-viewer.html' },
  { key: 'b2', file: 'variant-b2-full-viewport.html' },
  { key: 'c', file: 'variant-c-full-bleed.html' },
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  mkdirSync(SHOTS, { recursive: true });
  const browser = await puppeteer.launch({ headless: true });
  const results: string[] = [];

  for (const theme of ['light', 'dark'] as const) {
    for (const v of VARIANTS) {
      const page = await browser.newPage();
      page.on('dialog', (d) => d.dismiss().catch(() => {}));
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(`console: ${m.text()}`);
      });
      await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 2 });
      await page.evaluateOnNewDocument((t) => {
        localStorage.setItem('pathogen-theme', t);
      }, theme);
      await page.goto(`${BASE}/${v.file}`, { waitUntil: 'networkidle0' });

      // Poll for artwork injection (avoid waitForFunction per repo gotchas).
      let ok = false;
      for (let i = 0; i < 60; i++) {
        ok = await page.evaluate(() => !!document.querySelector('#viewport > svg'));
        if (ok) break;
        await sleep(250);
      }
      if (!ok) {
        results.push(`✗ ${v.key}/${theme}: artwork never mounted. errors: ${errors.join(' | ')}`);
        await page.screenshot({ path: `${SHOTS}/variant-${v.key}-${theme}-FAILED.png` as `${string}.png` });
        await page.close();
        continue;
      }
      await sleep(600); // fonts + zoomToFit settle

      const checks = await page.evaluate(() => {
        const out: Record<string, unknown> = {};
        const svg = document.querySelector('#viewport > svg') as SVGSVGElement;
        // Geometry: a 0-height viewport passes every functional check while
        // rendering nothing (flex-basis collapse class of bug) — assert size.
        const vp = document.getElementById('viewport')!.getBoundingClientRect();
        out.viewportSize = [Math.round(vp.width), Math.round(vp.height)];
        out.viewBox = svg.getAttribute('viewBox');
        out.layerEls = svg.querySelectorAll('[data-layer-name]').length;
        const pill = document.getElementById('pill') as HTMLElement & { zoom: number; controller: unknown };
        const level = pill.shadowRoot?.querySelector('#zoom-level') as HTMLInputElement;
        out.pillZoomAtFit = level?.value;
        out.hasController = !!pill.controller;
        // zoom in via the pill button, read back
        (pill.shadowRoot?.querySelector('#zoom-in') as HTMLButtonElement)?.click();
        out.pillZoomAfterIn = level?.value;
        (pill.shadowRoot?.querySelector('#zoom-fit') as HTMLButtonElement)?.click();
        out.pillZoomAfterFit = level?.value;
        // layer rows exist somewhere on the page
        out.layerRows = document.querySelectorAll('.layer-row').length;
        // toggle the first eye, confirm the artwork element hides, restore
        const eye = document.querySelector('.layer-eye') as HTMLButtonElement;
        const firstName = document.querySelector('.layer-row .layer-name')?.textContent || '';
        eye?.click();
        const el = svg.querySelector(`[data-layer-name="${firstName}"]`) as HTMLElement;
        out.toggleHides = el ? el.style.display === 'none' : false;
        eye?.click();
        out.toggleRestores = el ? el.style.display === '' : false;
        return out;
      });

      const pass =
        (checks.viewportSize as number[])[0] > 600 &&
        (checks.viewportSize as number[])[1] > 250 &&
        checks.viewBox === '0 0 860 200' &&
        (checks.layerEls as number) > 400 &&
        checks.hasController === true &&
        checks.pillZoomAfterIn === '150%' &&
        checks.pillZoomAfterFit === '100%' &&
        (checks.layerRows as number) > 400 &&
        checks.toggleHides === true &&
        checks.toggleRestores === true;
      results.push(
        `${pass ? '✓' : '✗'} ${v.key}/${theme}: ${JSON.stringify(checks)}${errors.length ? ` | ERRORS: ${errors.join(' | ')}` : ''}`,
      );

      // b2: exercise full-viewport mode (fixed overlay, layers btn gating).
      if (v.key === 'b2') {
        const fv = await page.evaluate(() => {
          const out: Record<string, unknown> = {};
          const btn = document.getElementById('layers-btn')!;
          const stage = document.getElementById('stage')!;
          out.layersHiddenAtRest = getComputedStyle(btn).display === 'none';
          document.getElementById('fullviewport-btn')!.click();
          out.fvActive = stage.hasAttribute('data-fullviewport');
          out.fvFixed = getComputedStyle(stage).position === 'fixed';
          out.layersVisibleInFv = getComputedStyle(btn).display !== 'none';
          out.bodyLocked = document.body.style.overflow === 'hidden';
          return out;
        });
        const fvPass =
          fv.layersHiddenAtRest === true &&
          fv.fvActive === true &&
          fv.fvFixed === true &&
          fv.layersVisibleInFv === true &&
          fv.bodyLocked === true;
        await sleep(400);
        await page.screenshot({ path: `${SHOTS}/variant-b2-fullviewport-${theme}.png` as `${string}.png` });
        const fvExit = await page.evaluate(() => {
          document.getElementById('fullviewport-btn')!.click();
          return !document.getElementById('stage')!.hasAttribute('data-fullviewport') && document.body.style.overflow === '';
        });
        results.push(`${fvPass && fvExit ? '✓' : '✗'} b2/${theme} full-viewport: ${JSON.stringify(fv)} exitRestores=${fvExit}`);
        await sleep(300);
      }

      // Screenshot the page top (header + subnav + hero + start of meta).
      await page.evaluate(() => window.scrollTo(0, 0));
      await sleep(200);
      await page.screenshot({ path: `${SHOTS}/variant-${v.key}-${theme}.png` as `${string}.png` });
      await page.close();
    }
  }

  await browser.close();
  console.log(results.join('\n'));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
