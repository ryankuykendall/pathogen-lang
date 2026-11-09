// Phase 2c (note 51): the served playground compiles a workspace with
// several files, gives the editor's language services the files it imports,
// names other files in errors and console lines, and saves with `files`. The
// workspaces are made through the dev API (the tree and tabs come in 2d).
//
//   npm run dev:stack, then PATHOGEN_API_BASE=http://localhost:8787 npm run build:website
//   npx tsx project-docs/modules/verify/verify-2c-playground.ts

import puppeteer from 'puppeteer';

import type { Page } from 'puppeteer';

const PAGES_URL = 'http://localhost:3000';
const DEV_API = 'http://localhost:8787';
const ANON_KEY = 'pathogen-lang:userId';
const ownerId = Array.from({ length: 21 }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]).join('');

const GEARS = 'module;\nlog("gears loaded");\nexport fn gear(r) {\n  circle(0, 0, r);\n}\n';
const MAIN = 'import { gear } from "./parts/gears.pathogen";\ndefine ViewBox(-10, -10, 20, 20);\ngear(4);\n';
const BROKEN_GEARS = 'module;\nexport fn gear(r) {\n  circle(0, 0, nope(r));\n}\n';
const MISSING_MAIN = 'import { gear } from "./parts/gear.pathogen";\ngear(4);\n';

let failures = 0;
const check = (label: string, ok: boolean, detail?: unknown): void => {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${label}${ok ? '' : ` ${JSON.stringify(detail)?.slice(0, 500)}`}`);
  if (!ok) failures++;
};

async function api(method: string, path: string, body?: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(`${DEV_API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-User-Id': ownerId, Connection: 'close' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  return text ? (JSON.parse(text) as Record<string, unknown>) : {};
}

async function create(name: string, files: Record<string, string>): Promise<string> {
  const data = await api('POST', '/workspace', {
    name,
    files: Object.fromEntries(Object.entries(files).map(([p, text]) => [p, { text }])),
    entryPoints: ['main.pathogen'],
  });
  return data.id as string;
}

/** Text of every element matching `selector`, through shadow roots. */
async function deepTexts(page: Page, selector: string): Promise<string[]> {
  return page.evaluate((sel: string) => {
    const out: string[] = [];
    const walk = (root: Document | ShadowRoot): void => {
      for (const el of Array.from(root.querySelectorAll(sel))) out.push((el.shadowRoot?.textContent ?? '') + (el.textContent ?? ''));
      for (const el of Array.from(root.querySelectorAll('*'))) if (el.shadowRoot) walk(el.shadowRoot);
    };
    walk(document);
    return out;
  }, selector);
}

async function waitFor<T>(what: string, probe: () => Promise<T | null | false>, ms = 30_000): Promise<T | null> {
  const start = Date.now();
  while (Date.now() - start < ms) {
    const value = await probe();
    if (value) return value;
    await new Promise((r) => setTimeout(r, 250));
  }
  console.log(`  (timed out waiting for ${what})`);
  return null;
}

async function open(page: Page, id: string): Promise<void> {
  await page.goto(`${PAGES_URL}/workspace/${id}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
}

/** The preview's SVG markup (it renders in an iframe). */
async function previewSvg(page: Page): Promise<string> {
  for (const frame of page.frames()) {
    const svg = await frame.evaluate(() => document.querySelector('svg')?.outerHTML ?? '').catch(() => '');
    if (svg.includes('<path')) return svg;
  }
  return '';
}

const made: string[] = [];
const browser = await puppeteer.launch({ headless: true, defaultViewport: { width: 1400, height: 1000 } });
try {
  const page = await browser.newPage();
  page.on('dialog', (d) => void d.accept());
  const pageErrors: string[] = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));
  const saves: unknown[] = [];
  page.on('request', (req) => {
    if (req.method() === 'PUT' && req.url().startsWith(`${DEV_API}/workspace/`)) saves.push(JSON.parse(req.postData() ?? '{}'));
  });
  await page.evaluateOnNewDocument(
    (key: string, value: string) => {
      (window as unknown as { __name?: <T>(fn: T) => T }).__name = <T>(fn: T): T => fn;
      localStorage.setItem(key, value);
    },
    ANON_KEY,
    ownerId,
  );

  // 1. A program drawn with a library's fn; the library's log names its file.
  const id = await create('2c gears', { 'main.pathogen': MAIN, 'parts/gears.pathogen': GEARS });
  made.push(id);
  await open(page, id);
  const svg = await waitFor('the preview to draw', async () => {
    const s = await previewSvg(page);
    return s.includes('a 4 4 0 1 1 8 0') ? s : null;
  });
  check("the preview draws main with the library's gear(4)", svg !== null, svg?.slice(0, 300));
  // Open the console (the breadcrumb's Console button).
  await page.evaluate(() => {
    const find = (root: Document | ShadowRoot): HTMLElement | null => {
      const hit = root.querySelector('#console-toggle') as HTMLElement | null;
      if (hit) return hit;
      for (const el of Array.from(root.querySelectorAll('*'))) {
        const inner = el.shadowRoot ? find(el.shadowRoot) : null;
        if (inner) return inner;
      }
      return null;
    };
    find(document)?.click();
  });
  const logs = await waitFor('the library’s log in the console', async () => {
    const texts = await deepTexts(page, 'log-entry');
    return texts.some((t) => t.includes('gears loaded')) ? texts : null;
  });
  check(
    'its log line names the library and its line',
    logs !== null && logs.some((t) => t.includes('parts/gears.pathogen line 2:') && t.includes('gears loaded')),
    logs,
  );

  // 2. Completion offers the library's export in main.
  const completion = await page.evaluate(async () => {
    const find = (root: Document | ShadowRoot, sel: string): Element | null => {
      const hit = root.querySelector(sel);
      if (hit) return hit;
      for (const el of Array.from(root.querySelectorAll('*'))) {
        const inner = el.shadowRoot ? find(el.shadowRoot, sel) : null;
        if (inner) return inner;
      }
      return null;
    };
    const lib = (window as unknown as { PathogenLang: Record<string, Function> }).PathogenLang;
    const mod = await import('/services/workspace-modules.js');
    await mod.refreshOpenFileModules();
    const pane = find(document, 'code-editor-pane') as (Element & { code?: string }) | null;
    const source = `${pane?.code ?? ''}ge`;
    const doc = new (lib.StringTextDocument as unknown as new (s: string) => unknown)(source);
    const lines = source.split('\n');
    const items = (lib.getCompletions as (d: unknown, p: unknown, o: unknown) => { label: string; detail?: string }[])(
      doc,
      { line: lines.length - 1, character: lines[lines.length - 1].length },
      mod.languageServiceOptions(),
    );
    return items.filter((i) => i.label === 'gear').map((i) => `${i.label} ${i.detail ?? ''}`);
  });
  check("the editor's completion offers the imported fn", completion.length > 0, completion);

  // 3. A save sends files: main's text, the library by hash.
  await page.evaluate(() => {
    const find = (root: Document | ShadowRoot, sel: string): Element | null => {
      const hit = root.querySelector(sel);
      if (hit) return hit;
      for (const el of Array.from(root.querySelectorAll('*'))) {
        const inner = el.shadowRoot ? find(el.shadowRoot, sel) : null;
        if (inner) return inner;
      }
      return null;
    };
    const content = find(document, 'code-editor-pane')?.shadowRoot?.querySelector('.cm-content') as HTMLElement | null;
    content?.focus();
  });
  await page.keyboard.down('Meta');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.up('Meta');
  await page.keyboard.type('gear(2);\n', { delay: 10 });
  await page.keyboard.down('Meta');
  await page.keyboard.press('KeyS');
  await page.keyboard.up('Meta');
  const saved = await waitFor('a save', async () => (saves.length > 0 ? saves[saves.length - 1] : null));
  const body = saved as { files?: Record<string, { text?: string; sha256?: string }> } | null;
  check(
    'a save sends files: the edited main as text, the library by hash',
    typeof body?.files?.['main.pathogen']?.text === 'string' &&
      body.files['main.pathogen'].text!.includes('gear(2);') &&
      typeof body.files['parts/gears.pathogen']?.sha256 === 'string',
    body,
  );
  const reloaded = await waitFor('the saved text', async () => {
    const data = await api('GET', `/workspace/${id}`);
    const files = data.files as Record<string, { text: string }> | undefined;
    return files?.['main.pathogen']?.text.includes('gear(2);') ? files : null;
  });
  check('the server holds the edit, and the library unchanged', reloaded?.['parts/gears.pathogen']?.text === GEARS, reloaded);

  // 4. An error inside the library names it.
  const broken = await create('2c broken', { 'main.pathogen': MAIN, 'parts/gears.pathogen': BROKEN_GEARS });
  made.push(broken);
  await open(page, broken);
  const panel = await waitFor('the error panel', async () => {
    const texts = await deepTexts(page, 'error-panel');
    return texts.find((t) => t.includes('nope')) ?? null;
  });
  check('an error in the library names the library and its line', panel !== null && panel.includes('parts/gears.pathogen'), panel);

  // 5. A missing import is an error at its line in main.
  const missing = await create('2c missing', { 'main.pathogen': MISSING_MAIN, 'parts/gears.pathogen': GEARS });
  made.push(missing);
  await open(page, missing);
  const missingPanel = await waitFor('the missing-import error', async () => {
    const texts = await deepTexts(page, 'error-panel');
    return texts.find((t) => t.includes('was not found')) ?? null;
  });
  check(
    'a missing import is reported at its line, naming the path looked for',
    missingPanel !== null && missingPanel.includes('Line 1') && missingPanel.includes('parts/gear.pathogen'),
    missingPanel,
  );
  check('no page errors', pageErrors.length === 0, pageErrors);
} finally {
  await browser.close();
  for (const id of made) await api('DELETE', `/workspace/${id}`);
}

console.log(failures === 0 ? '\nall passed' : `\n${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
