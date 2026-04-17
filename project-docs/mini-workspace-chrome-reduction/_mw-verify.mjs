#!/usr/bin/env node
// Screenshot the radial-bar-chart blog page in light + dark mode to verify
// the refactored mini-workspace renders correctly with theme tokens.

import puppeteer from 'puppeteer';
import fs from 'node:fs';

const URL = 'http://localhost:3000/pathogen/blog/radial-bar-chart';
const OUT_DIR = '/tmp/mw-verify';
fs.mkdirSync(OUT_DIR, { recursive: true });

async function capture(theme, barOpen) {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 900, deviceScaleFactor: 1 });

  // Set theme before page load via localStorage + prefers-color-scheme emulation.
  await page.emulateMediaFeatures([
    { name: 'prefers-color-scheme', value: theme },
  ]);

  await page.goto(URL, { waitUntil: 'networkidle2', timeout: 20000 });

  // Wait for mini-workspace to render.
  await page.waitForSelector('mini-workspace', { timeout: 5000 });
  // Give web component's shadow DOM a moment to populate.
  await new Promise((r) => setTimeout(r, 800));

  // Optionally click the summary to open the glass-bar.
  if (barOpen) {
    await page.evaluate(() => {
      const mw = document.querySelector('mini-workspace');
      const summary = mw?.shadowRoot?.querySelector('#summary');
      summary?.click();
    });
    await new Promise((r) => setTimeout(r, 400));
  }

  // Scroll first mini-workspace into view.
  await page.evaluate(() => {
    const mw = document.querySelector('mini-workspace');
    mw?.scrollIntoView({ block: 'center' });
  });
  await new Promise((r) => setTimeout(r, 300));

  const fname = `${OUT_DIR}/mw-${theme}-${barOpen ? 'open' : 'closed'}.png`;
  const handle = await page.$('mini-workspace');
  if (handle) await handle.screenshot({ path: fname });
  console.log(`wrote ${fname}`);

  // Capture structure + computed styles to detect theme-token resolution issues.
  const structure = await page.evaluate(() => {
    const mw = document.querySelector('mini-workspace');
    const sr = mw?.shadowRoot;
    if (!sr) return null;
    const pick = (sel) => !!sr.querySelector(sel);
    const cs = (sel, prop) => {
      const el = sr.querySelector(sel);
      if (!el) return null;
      return getComputedStyle(el).getPropertyValue(prop);
    };
    return {
      hostClasses: mw.className,
      codeOpen: mw.hasAttribute('code-open'),
      hasSummary: pick('#summary'),
      hasGlassBar: pick('#glass-bar'),
      hasChevron: pick('.chevron'),
      hasCodeToggle: pick('#code-toggle'),
      hasCopyBtn: pick('#copy-btn'),
      hasPlayground: pick('.playground-link'),
      hasVarsReset: pick('#vars-reset'),
      chipCount: sr.querySelectorAll('.chip').length,
      titleText: sr.querySelector('.mw-title')?.textContent?.trim() || '',
      summaryAria: sr.querySelector('#summary')?.getAttribute('aria-expanded') || '',
      docTheme: document.documentElement.getAttribute('data-theme') || '(none)',
      bgElevated: getComputedStyle(document.documentElement).getPropertyValue('--bg-elevated').trim(),
      bgPrimary: getComputedStyle(document.documentElement).getPropertyValue('--bg-primary').trim(),
      summaryBg: cs('#summary', 'background-color'),
      glassBarBg: cs('#glass-bar', 'background-color'),
      glassBarHeight: cs('#glass-bar', 'height'),
      minimapVisible: (() => {
        const mp = sr.querySelector('mini-preview');
        const nav = mp?.shadowRoot?.querySelector('#zoom-navigator');
        if (!nav) return 'no-el';
        const s = getComputedStyle(nav);
        return `display=${s.display};opacity=${s.opacity};visibility=${s.visibility}`;
      })(),
    };
  });
  console.log(`  ${theme}/${barOpen ? 'open' : 'closed'}:`, JSON.stringify(structure, null, 2));

  await browser.close();
}

async function captureFullscreen(theme) {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900, deviceScaleFactor: 1 });
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: theme }]);
  await page.goto(URL, { waitUntil: 'networkidle2', timeout: 20000 });
  await page.waitForSelector('mini-workspace', { timeout: 5000 });
  await new Promise((r) => setTimeout(r, 800));

  // Open the glass-bar and click the workspace-level fullscreen button
  // (this is the user's actual path, which delegates to mini-preview).
  await page.evaluate(() => {
    const mw = document.querySelector('mini-workspace');
    mw?.shadowRoot?.querySelector('#summary')?.click();
  });
  await new Promise((r) => setTimeout(r, 400));
  await page.evaluate(() => {
    const mw = document.querySelector('mini-workspace');
    mw?.shadowRoot?.querySelector('#fullscreen-btn')?.click();
  });
  await new Promise((r) => setTimeout(r, 500));

  // Diagnostics in fullscreen.
  const diag = await page.evaluate(() => {
    const mw = document.querySelector('mini-workspace');
    const mp = mw?.shadowRoot?.querySelector('mini-preview');
    const nav = mp?.shadowRoot?.querySelector('#zoom-navigator');
    const inspBtn = mp?.shadowRoot?.querySelector('#inspector-open-btn');
    return {
      miniPreviewClass: mp?.className || '',
      navDisplay: nav ? getComputedStyle(nav).display : 'n/a',
      inspectorBtnDisplay: inspBtn ? getComputedStyle(inspBtn).display : 'n/a',
      hasMetadata: !!(mw && mw._inspectorMetadata !== null && mw._inspectorMetadata !== undefined),
      isPreviewFullscreen: !!(mw && mw._isPreviewFullscreen),
    };
  });
  console.log(`  fullscreen/${theme}:`, JSON.stringify(diag, null, 2));

  await page.screenshot({ path: `${OUT_DIR}/mw-${theme}-fullscreen.png` });
  console.log(`wrote ${OUT_DIR}/mw-${theme}-fullscreen.png`);

  // Now click the inspector button inside mini-preview (fullscreen visible).
  await page.evaluate(() => {
    const mw = document.querySelector('mini-workspace');
    const mp = mw?.shadowRoot?.querySelector('mini-preview');
    const btn = mp?.shadowRoot?.querySelector('#inspector-open-btn');
    btn?.click();
  });
  await new Promise((r) => setTimeout(r, 700));

  const inspState = await page.evaluate(() => {
    const mw = document.querySelector('mini-workspace');
    const insp = mw?.shadowRoot?.querySelector('inspector-panel');
    return {
      inspectorInDOM: !!insp,
      inspectorOpen: !!(mw && mw._inspectorOpen),
      inspectorClasses: insp?.className || '',
    };
  });
  console.log(`  fullscreen-inspector/${theme}:`, JSON.stringify(inspState, null, 2));

  await page.screenshot({ path: `${OUT_DIR}/mw-${theme}-fullscreen-inspector.png` });
  console.log(`wrote ${OUT_DIR}/mw-${theme}-fullscreen-inspector.png`);

  await browser.close();
}

async function captureTooltip(theme) {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 900, deviceScaleFactor: 1 });
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: theme }]);
  await page.goto(URL, { waitUntil: 'networkidle2', timeout: 20000 });
  await page.waitForSelector('mini-workspace', { timeout: 5000 });
  await new Promise((r) => setTimeout(r, 800));

  // Open the glass-bar.
  await page.evaluate(() => {
    const mw = document.querySelector('mini-workspace');
    const summary = mw?.shadowRoot?.querySelector('#summary');
    summary?.click();
  });
  await new Promise((r) => setTimeout(r, 400));

  // Hover the leftmost (code-toggle) button to verify the left-anchored tooltip.
  const rect = await page.evaluate(() => {
    const mw = document.querySelector('mini-workspace');
    mw.scrollIntoView({ block: 'center' });
    const btn = mw.shadowRoot.querySelector('#code-toggle');
    const r = btn.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.mouse.move(rect.x, rect.y);
  await new Promise((r) => setTimeout(r, 500));

  // Capture the tooltip's computed opacity and location.
  const diag = await page.evaluate(() => {
    const mw = document.querySelector('mini-workspace');
    const btn = mw.shadowRoot.querySelector('#code-toggle');
    const cs = getComputedStyle(btn, '::after');
    const r = btn.getBoundingClientRect();
    return {
      afterContent: cs.getPropertyValue('content'),
      afterOpacity: cs.getPropertyValue('opacity'),
      afterLeft: cs.getPropertyValue('left'),
      afterTransform: cs.getPropertyValue('transform'),
      btnX: r.x,
      hostFullyOpen: mw.classList.contains('bar-fully-open'),
    };
  });
  console.log(`  tooltip/${theme}:`, JSON.stringify(diag, null, 2));

  const handle = await page.$('mini-workspace');
  if (handle) await handle.screenshot({ path: `${OUT_DIR}/mw-${theme}-tooltip.png` });
  console.log(`wrote ${OUT_DIR}/mw-${theme}-tooltip.png`);
  await browser.close();
}

async function captureEmbeddedInspector(theme) {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 900, deviceScaleFactor: 1 });
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: theme }]);
  await page.goto(URL, { waitUntil: 'networkidle2', timeout: 20000 });
  await page.waitForSelector('mini-workspace', { timeout: 5000 });
  await new Promise((r) => setTimeout(r, 800));

  // Open the glass-bar.
  await page.evaluate(() => {
    const mw = document.querySelector('mini-workspace');
    mw?.shadowRoot?.querySelector('#summary')?.click();
  });
  await new Promise((r) => setTimeout(r, 400));

  // Click the layers button in the glass-bar (embedded mode inspector).
  await page.evaluate(() => {
    const mw = document.querySelector('mini-workspace');
    mw?.scrollIntoView({ block: 'center' });
    mw?.shadowRoot?.querySelector('#inspector-btn')?.click();
  });
  await new Promise((r) => setTimeout(r, 500));

  const state = await page.evaluate(() => {
    const mw = document.querySelector('mini-workspace');
    const insp = mw?.shadowRoot?.querySelector('inspector-panel');
    return {
      inspectorInDOM: !!insp,
      inspectorClasses: insp?.className || '',
      inspectorOpen: !!(mw && mw._inspectorOpen),
    };
  });
  console.log(`  embedded-inspector/${theme}:`, JSON.stringify(state, null, 2));

  await page.screenshot({ path: `${OUT_DIR}/mw-${theme}-embedded-inspector.png` });
  console.log(`wrote ${OUT_DIR}/mw-${theme}-embedded-inspector.png`);
  await browser.close();
}

(async () => {
  try {
    await capture('light', false);
    await capture('light', true);
    await capture('dark', false);
    await capture('dark', true);
    await captureFullscreen('light');
    await captureFullscreen('dark');
    await captureTooltip('light');
    await captureEmbeddedInspector('light');
    console.log('\nAll captures complete. Inspect /tmp/mw-verify/');
  } catch (e) {
    console.error('Verify failed:', e.message);
    process.exit(1);
  }
})();
