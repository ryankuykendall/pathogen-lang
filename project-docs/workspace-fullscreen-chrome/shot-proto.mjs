import puppeteer from 'puppeteer';
const browser = await puppeteer.launch({ headless: 'new' });
const page = await browser.newPage();
await page.setViewport({ width: 1500, height: 1450 });
await page.goto('file:///Users/ryan/claude-code-projects/svg-path-extended/website/bbwp/2026-08-31-13:47:05--workspace-fullscreen-chrome--hover-colors.mw.html');
await new Promise(r => setTimeout(r, 500));
await page.screenshot({ path: process.argv[2], fullPage: true });
await browser.close();
