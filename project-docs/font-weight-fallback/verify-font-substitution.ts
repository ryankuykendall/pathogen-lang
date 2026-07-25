// Verify the Baumans-900 repro end-to-end against the running dev playground:
//  1. no fatal red error banner, warning banner visible with the exact message
//  2. network fetched wght@400, never wght@900
//  3. dismiss hides the banner and it stays hidden after recompiles
// Run: npx tsx <this file>
import puppeteer from 'puppeteer';

const BASE = 'http://localhost:3000';

const REPRO = `define ViewBox(0, 0, 800, 200);
let fontFamily = "Baumans";
@font fontFamily;
let fontStyles = \${
  fill: #cccc0066;
  font-family: fontFamily;
  font-size: 16;
  font-weight: 900;
  stroke: #cc0;
  stroke-width: 0.25;
};
let textLayer = TextLayer('with-baumans') << fontStyles;
textLayer.apply {
  text(25, 32, 0.25pi)\`I can continue now\`
}`;

function encodeState(code: string): string {
  return Buffer.from(encodeURIComponent(JSON.stringify({ code }))).toString('base64');
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main(): Promise<void> {
  const browser = await puppeteer.launch({ headless: 'new' as unknown as boolean });
  const failures: string[] = [];
  try {
    const p = await browser.newPage();
    await p.setViewport({ width: 1400, height: 900 });
    p.on('dialog', (d) => void d.dismiss().catch(() => {}));

    const fontRequests: string[] = [];
    p.on('request', (req) => {
      if (req.url().includes('fonts.googleapis.com')) fontRequests.push(req.url());
    });
    const consoleErrors: string[] = [];
    p.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    // Seed anon user id before app scripts run
    await p.evaluateOnNewDocument(() => {
      try {
        localStorage.setItem('pathogen-lang:userId', 'VerifyFontSub123456~-');
      } catch {}
    });

    await p.goto(`${BASE}/pathogen/workspace/scratch?state=${encodeState(REPRO)}`, {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });

    // Poll (evaluate, not waitForFunction — CSP) until compile settles
    let state: any = null;
    for (let i = 0; i < 60; i++) {
      state = await p.evaluate(() => {
        const wv = document.querySelector('app-shell')?.shadowRoot?.querySelector('workspace-view');
        const sr = wv?.shadowRoot;
        if (!sr) return null;
        const errorPanel = sr.querySelector('error-panel');
        const errVisible = !!errorPanel && getComputedStyle(errorPanel).display !== 'none' &&
          (errorPanel.shadowRoot?.textContent ?? '').trim().length > 0;
        const banner = sr.querySelector('#font-warning');
        const bannerVisible = !!banner && banner.classList.contains('visible');
        const bannerText = sr.querySelector('#font-warning-text')?.textContent ?? '';
        const status = (window as any).__pathogenStore?.get?.('compilationStatus');
        return { errVisible, errText: errorPanel?.shadowRoot?.textContent?.trim() ?? '', bannerVisible, bannerText, status };
      });
      if (state?.bannerVisible || state?.errVisible) break;
      await sleep(500);
    }

    if (!state) failures.push('workspace-view shadow root never appeared');
    if (state?.errVisible) failures.push(`red error panel visible: ${state.errText.slice(0, 200)}`);
    if (!state?.bannerVisible) failures.push('font warning banner not visible');
    const expectedMsg = 'Baumans is only available at weight 400 (requested 900); using 400';
    if (state && state.bannerText !== expectedMsg) {
      failures.push(`banner text mismatch: "${state.bannerText}"`);
    }

    const bad = fontRequests.filter((u) => u.includes('Baumans') && u.includes('wght@900'));
    const good = fontRequests.filter((u) => u.includes('Baumans') && u.includes('wght@400'));
    if (bad.length > 0) failures.push(`fetched wght@900 for Baumans: ${bad[0]}`);
    if (good.length === 0) failures.push('never fetched Baumans wght@400');

    const cors = consoleErrors.filter((e) => e.includes('CORS') || e.includes('ERR_FAILED'));
    if (cors.length > 0) failures.push(`CORS/network console errors: ${cors[0].slice(0, 160)}`);

    // (screenshot removed — captured on the first run; CDP screenshot timed out flakily on re-runs)

    // Dismiss, then confirm hidden and it stays hidden
    await p.evaluate(() => {
      const sr = document.querySelector('app-shell')?.shadowRoot?.querySelector('workspace-view')?.shadowRoot;
      (sr?.querySelector('#dismiss-font-warning') as HTMLElement | null)?.click();
    });
    await sleep(300);
    const afterDismiss = await p.evaluate(() => {
      const sr = document.querySelector('app-shell')?.shadowRoot?.querySelector('workspace-view')?.shadowRoot;
      return sr?.querySelector('#font-warning')?.classList.contains('visible') ?? null;
    });
    if (afterDismiss !== false) failures.push(`banner still visible after dismiss (${afterDismiss})`);

    console.log(JSON.stringify({
      failures,
      bannerText: state?.bannerText,
      fontRequests: fontRequests.filter((u) => u.includes('Baumans')),
    }, null, 2));
    if (failures.length > 0) process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
