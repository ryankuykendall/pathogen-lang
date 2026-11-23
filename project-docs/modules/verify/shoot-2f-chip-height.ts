// 2f follow-up (2026-11-23): the program chip the same height as the zoom
// controls, in VS Code's preview and the playground (the owner's request,
// after the hand check). Measures both controls and shoots the bottom of the
// preview, closed, open and focused from the keyboard, light and dark, on
// both surfaces. Run once before the change and once after:
//
//   npm run dev:stack                (the playground part needs the dev API)
//   npx tsx project-docs/modules/verify/shoot-2f-chip-height.ts before|after
//
// VS Code's page comes from packages/vscode-pathogen/out + compiler/ (npm run
// build:vscode); the playground is the dev server's (npm run build:playground:dev).
// Shots go to project-docs/modules/verify/2f-chip-height/.

import { mkdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { extname, join } from 'node:path';

import puppeteer from 'puppeteer';

import type { Page } from 'puppeteer';

const label = process.argv[2] === 'after' ? 'after' : 'before';
const root = process.cwd();
const ext = join(root, 'packages', 'vscode-pathogen');
const SHOTS = join(root, 'project-docs', 'modules', 'verify', '2f-chip-height');
mkdirSync(SHOTS, { recursive: true });
const require = createRequire(import.meta.url);

const PAGES_URL = 'http://localhost:3000';
const DEV_API = 'http://localhost:8787';
const ownerId = Array.from(
  { length: 21 },
  () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)],
).join('');

interface Sizes {
  pill: number;
  pick: number;
  pickTop: number;
  pillTop: number;
  expanded: string | null;
}

/** The zoom controls' and the chip's heights, in CSS px, inside `rootExpr`. */
async function sizes(page: Page, pillRoot: string, chipHost: string): Promise<Sizes> {
  return page.evaluate(`(() => {
    const pill = (${pillRoot}).querySelector('pathogen-zoom-pill').getBoundingClientRect();
    const el = (${chipHost}).shadowRoot.querySelector('.pick');
    const pick = el.getBoundingClientRect();
    return { pill: pill.height, pick: pick.height, pillTop: pill.top, pickTop: pick.top, expanded: el.getAttribute('aria-expanded'), pillX: [pill.left, pill.right], pickX: [pick.left, pick.right] };
  })()`) as Promise<Sizes>;
}

/**
 * Shoot the strip around the zoom controls and the chip. `captureBeyondViewport:
 * false`: Puppeteer otherwise resizes the page to take the shot, and a resize
 * closes the chip's list (as it should), so the open state would never be seen.
 */
async function shoot(page: Page, pillRoot: string, chipHost: string, file: string): Promise<void> {
  const box = (await page.evaluate(`(() => {
    const a = (${pillRoot}).querySelector('pathogen-zoom-pill').getBoundingClientRect();
    const b = (${chipHost}).shadowRoot.querySelector('.pick').getBoundingClientRect();
    return { x: Math.min(a.left, b.left) - 16, y: Math.min(a.top, b.top) - 16, right: Math.max(a.right, b.right) + 16, bottom: Math.max(a.bottom, b.bottom) + 16 };
  })()`)) as { x: number; y: number; right: number; bottom: number };
  await page.screenshot({
    path: join(SHOTS, file),
    captureBeyondViewport: false,
    clip: { x: box.x, y: box.y, width: box.right - box.x, height: box.bottom - box.y },
  });
}

/** Closed; open (a click); focused from the keyboard (open with Up, close with Escape: the keyboard goes back to the chip). */
async function states(page: Page, pillRoot: string, chipHost: string, prefix: string): Promise<Record<string, Sizes>> {
  const out: Record<string, Sizes> = {};
  const pick = `(${chipHost}).shadowRoot.querySelector('.pick')`;
  await page.mouse.move(2, 2);
  out.closed = await sizes(page, pillRoot, chipHost);
  await shoot(page, pillRoot, chipHost, `${prefix}-closed.png`);
  await page.evaluate(`${pick}.click()`);
  await new Promise((r) => setTimeout(r, 300));
  out.open = await sizes(page, pillRoot, chipHost);
  await shoot(page, pillRoot, chipHost, `${prefix}-open.png`);
  await page.evaluate(`${pick}.click()`);
  await page.evaluate(`${pick}.focus()`);
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Escape');
  await new Promise((r) => setTimeout(r, 300));
  out.focused = await sizes(page, pillRoot, chipHost);
  await shoot(page, pillRoot, chipHost, `${prefix}-focused.png`);
  return out;
}

const report: Record<string, unknown> = {};
const browser = await puppeteer.launch({ headless: 'shell' });
try {
  // ── VS Code's preview page, under its CSP, with the bundled scripts ──
  const { getWebviewContent } = require(join(ext, 'out', 'webview-html.js'));
  let html = '';
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    if (url.pathname === '/') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(html);
      return;
    }
    try {
      const body = readFileSync(join(ext, url.pathname));
      res.writeHead(200, {
        'content-type': extname(url.pathname) === '.js' ? 'text/javascript' : 'application/octet-stream',
      });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  html = getWebviewContent(`${base}/compiler/index.global.js`, `${base}/compiler/pan-zoom.global.js`, base, 'n');
  const THEMES: Record<string, Record<string, string>> = {
    dark: {
      '--vscode-editor-background': '#1f1f1f',
      '--vscode-foreground': '#cccccc',
      '--vscode-descriptionForeground': '#9d9d9d',
      '--vscode-panel-border': '#2b2b2b',
      '--vscode-focusBorder': '#0078d4',
      '--vscode-input-border': '#3c3c3c',
      '--vscode-editorWidget-background': '#202020',
      '--vscode-widget-shadow': 'rgba(0, 0, 0, 0.36)',
      '--vscode-list-hoverBackground': '#2a2d2e',
      '--vscode-errorForeground': '#f85149',
      '--vscode-editor-font-family': 'Menlo, Monaco, monospace',
    },
    light: {
      '--vscode-editor-background': '#ffffff',
      '--vscode-foreground': '#3b3b3b',
      '--vscode-descriptionForeground': '#616161',
      '--vscode-panel-border': '#e5e5e5',
      '--vscode-focusBorder': '#005fb8',
      '--vscode-input-border': '#cecece',
      '--vscode-editorWidget-background': '#f8f8f8',
      '--vscode-widget-shadow': 'rgba(0, 0, 0, 0.16)',
      '--vscode-list-hoverBackground': '#f2f2f2',
      '--vscode-errorForeground': '#d1242f',
      '--vscode-editor-font-family': 'Menlo, Monaco, monospace',
    },
  };
  const row = (path: string) => ({
    path,
    name: path.replace(/^.*\//, '').replace(/\.pathogen$/, ''),
    hint: null,
    badge: false,
    error: null,
    uses: null,
    updating: false,
    miniature: null,
  });
  for (const [theme, vars] of Object.entries(THEMES)) {
    const page = await browser.newPage();
    await page.setViewport({ width: 720, height: 560, deviceScaleFactor: 2 });
    await page.evaluateOnNewDocument((v: Record<string, string>) => {
      (window as unknown as { acquireVsCodeApi: unknown }).acquireVsCodeApi = () => ({
        postMessage() {},
        getState() {},
        setState() {},
      });
      document.addEventListener('DOMContentLoaded', () => {
        for (const [k, value] of Object.entries(v)) document.documentElement.style.setProperty(k, value);
      });
    }, vars);
    await page.goto(base, { waitUntil: 'load' });
    await page.evaluate((m) => window.postMessage(m, '*'), {
      type: 'update',
      seq: 1,
      uri: 'file:///try-sizes.pathogen',
      source: 'define ViewBox(0, 0, 300, 100);\ncircle(50, 50, 30);\ncircle(150, 50, 30);\n',
      fontIds: [],
      notices: [],
      errors: [],
    });
    await page.evaluate((m) => window.postMessage(m, '*'), {
      type: 'programs',
      items: [row('main.pathogen'), row('demos/train.pathogen'), row('try-sizes.pathogen')],
      shown: 'try-sizes.pathogen',
      editing: 'try-sizes.pathogen',
      alert: null,
    });
    await new Promise((r) => setTimeout(r, 500));
    report[`vscode-${theme}`] = await states(
      page,
      'document',
      `document.getElementById('program-chip')`,
      `${label}-vscode-${theme}`,
    );
    await page.close();
  }
  server.close();

  // ── The playground (dev server and dev API) ──
  const api = async (method: string, path: string, body?: unknown): Promise<Record<string, unknown>> => {
    const res = await fetch(`${DEV_API}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', 'X-User-Id': ownerId, Connection: 'close' },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const text = await res.text();
    return text ? (JSON.parse(text) as Record<string, unknown>) : {};
  };
  const files: Record<string, string> = {
    'main.pathogen': 'define ViewBox(0, 0, 200, 100);\ncircle(55, 50, 40);\ncircle(150, 50, 28);\n',
    'demos/train.pathogen': 'define ViewBox(0, 0, 200, 100);\ncircle(40, 50, 22);\ncircle(100, 50, 22);\n',
    'try-sizes.pathogen': 'define ViewBox(0, 0, 200, 100);\ncircle(60, 50, 12);\ncircle(140, 50, 30);\n',
  };
  const created = await api('POST', '/workspace', {
    name: '2f chip height',
    files: Object.fromEntries(Object.entries(files).map(([p, text]) => [p, { text }])),
    entryPoints: Object.keys(files),
  });
  const id = created.id as string;
  const FIND = `window.__find = (sel) => { const walk = (r) => { const hit = r.querySelector(sel); if (hit) return hit; for (const el of r.querySelectorAll('*')) { const inner = el.shadowRoot ? walk(el.shadowRoot) : null; if (inner) return inner; } return null; }; return walk(document); };`;
  try {
    for (const theme of ['dark', 'light']) {
      const page = await browser.newPage();
      await page.setViewport({ width: 1320, height: 860, deviceScaleFactor: 2 });
      page.on('dialog', (d) => void d.accept());
      await page.evaluateOnNewDocument(FIND);
      await page.evaluateOnNewDocument(
        (owner: string, t: string) => {
          localStorage.setItem('pathogen-lang:userId', owner);
          localStorage.setItem('pathogen-theme', t);
        },
        ownerId,
        theme,
      );
      await page.goto(`${PAGES_URL}/workspace/${id}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      for (let i = 0; i < 150; i++) {
        const ready = await page.evaluate(
          `(() => { const c = window.__find && window.__find('program-chip'); return !!c && !c.hidden && !!c.shadowRoot?.querySelector('.pick .name')?.textContent; })()`,
        );
        if (ready) break;
        await new Promise((r) => setTimeout(r, 200));
      }
      await new Promise((r) => setTimeout(r, 800));
      report[`playground-${theme}`] = await states(
        page,
        `window.__find('svg-preview-pane').shadowRoot`,
        `window.__find('program-chip')`,
        `${label}-playground-${theme}`,
      );
      await page.close();
    }
  } finally {
    await api('DELETE', `/workspace/${id}`);
  }
} finally {
  await browser.close();
}

console.log(JSON.stringify(report, null, 2));
