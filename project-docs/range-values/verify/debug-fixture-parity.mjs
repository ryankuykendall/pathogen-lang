// Debug aid: where does the all-syntax fixture's output differ between the
// CLI (Node) and the browser bundle?
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import puppeteer from 'puppeteer';
const F = 'packages/vscode-pathogen/test-fixtures/all-syntax.pathogen';
const src = readFileSync(F, 'utf8');
const cli = JSON.parse(execFileSync('npx', ['tsx', 'src/cli.ts', F, '--json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })).layers.map((l) => `${l.name}:${l.d ?? ''}`).join('|');
const bundle = readFileSync(join('packages', 'vscode-pathogen', 'compiler', 'index.global.js'), 'utf8');
const browser = await puppeteer.launch({ headless: 'shell' });
const page = await browser.newPage();
await page.setContent('<!doctype html><html><body></body></html>');
await page.addScriptTag({ content: bundle });
const inPage = await page.evaluate((s) => window.PathogenLang.compile(s).layers.map((l) => `${l.name}:${l.data ?? ''}`).join('|'), src);
await browser.close();
console.log('equal:', inPage === cli, inPage.length, cli.length);
for (let i = 0; i < Math.max(inPage.length, cli.length); i++) {
  if (inPage[i] !== cli[i]) {
    console.log('first diff at', i);
    console.log(' browser:', JSON.stringify(inPage.slice(Math.max(0, i - 60), i + 60)));
    console.log(' cli    :', JSON.stringify(cli.slice(Math.max(0, i - 60), i + 60)));
    break;
  }
}
