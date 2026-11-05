/**
 * Phase 1a step 7 in the REAL playground (served bundle, live CodeMirror
 * editor, the real error panel; T9 in 11-phase-1-audit.md): docs/modules.md
 * "In each tool": "A workspace is one program with no files beside it, so
 * import is an error at the import line. The other module rules hold as in
 * any file: export without module; is an error, and a workspace that starts
 * with module; draws nothing." Also F2 on an exported name says why it can't
 * rename (step 6b).
 *
 * Requires the site on :3000 serving a fresh build (`npm run dev:website`;
 * with the dev stack running, rebuild with
 * PATHOGEN_API_BASE=http://localhost:8787 npm run build:website instead).
 * Run from the repo root:
 *   node project-docs/modules/verify/verify-phase1-playground.mjs
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import puppeteer from 'puppeteer';

const here = dirname(fileURLToPath(import.meta.url));
const ORIGIN = 'http://localhost:3000';
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};

async function pollUntil(fn, timeoutMs, what) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const v = await fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`timed out after ${timeoutMs}ms waiting for ${what}`);
}

// The site may still be starting.
await pollUntil(
  () =>
    fetch(ORIGIN)
      .then((r) => r.ok)
      .catch(() => false),
  180000,
  `${ORIGIN} to answer`,
);

const WALK = `
  function walkAll(root, sel, out) {
    for (const el of root.querySelectorAll(sel)) out.push(el);
    for (const el of root.querySelectorAll('*')) {
      if (el.shadowRoot) walkAll(el.shadowRoot, sel, out);
      if (el.tagName === 'IFRAME') { try { if (el.contentDocument) walkAll(el.contentDocument, sel, out); } catch (e) {} }
    }
    return out;
  }
`;

const browser = await puppeteer.launch({ headless: 'shell' });

/** Open a scratch workspace with `code`; the helpers read its editor, error panel and drawing. */
async function workspace(code) {
  const page = await browser.newPage();
  const dialogs = [];
  page.on('dialog', (d) => {
    dialogs.push({ type: d.type(), message: d.message() });
    d.dismiss().catch(() => {});
  });
  const state = Buffer.from(encodeURIComponent(JSON.stringify({ code }))).toString('base64');
  try {
    await page.goto(`${ORIGIN}/workspace/scratch?state=${encodeURIComponent(state)}`, {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    });
  } catch {
    // Poll the DOM directly.
  }
  const editorText = () =>
    page.evaluate(`(() => { ${WALK}
      return walkAll(document, '.cm-line', []).map((l) => l.textContent).join('\\n'); })()`);
  const errorPanel = () =>
    page.evaluate(`(() => { ${WALK}
      const panel = walkAll(document, 'error-panel', [])[0];
      if (!panel || getComputedStyle(panel).display === 'none' || !panel.shadowRoot) return '';
      return [...panel.shadowRoot.querySelectorAll(':not(style)')].filter((n) => n.children.length === 0)
        .map((n) => n.textContent).join(' ').replace(/\\s+/g, ' ').trim(); })()`);
  const firstLine = code.split('\n')[0];
  await pollUntil(async () => (await editorText()).includes(firstLine), 40000, 'the editor with the program');
  return { page, dialogs, editorText, errorPanel };
}

try {
  // 1. An import: the error at the import line, in the docs' words.
  {
    const { page, errorPanel } = await workspace(
      'import { gear } from "./parts/gears.pathogen";\ngear(Point(55, 50), 40, 12);\n',
    );
    const ERROR =
      'Cannot import "./parts/gears.pathogen": this program has no project folder to read files from. Imports work in the CLI and VS Code; a playground workspace is one program for now.';
    const shown = await pollUntil(async () => ((await errorPanel()).includes('Cannot import') ? errorPanel() : null), 40000, 'the error panel');
    check('an import is an error at the import line, in the docs\' words', shown.startsWith(`Line 1:1 — ${ERROR}`), shown);
    await page.close();
  }

  // 2. export without module;
  {
    const { page, errorPanel } = await workspace('export const size = 4;\nM 0 0 L 10 10\n');
    const ERROR =
      "export only works in a module. Remove export, or add module; at the top of the file to make it a module, which can't draw at its top level.";
    const shown = await pollUntil(async () => ((await errorPanel()).includes('export only') ? errorPanel() : null), 40000, 'the error panel');
    check('export without module; is an error at the export word', shown.startsWith(`Line 1:1 — ${ERROR}`), shown);
    await page.close();
  }

  // 3. A module workspace: no error, nothing drawn. 4. F2 on an exported name says why.
  {
    const code = 'module;\n\nexport fn dot(x) {\n  circle(x, 0, 2);\n}\n';
    const { page, dialogs, errorPanel } = await workspace(code);
    // Let a compile land, then look: no error panel, no drawn path.
    await new Promise((r) => setTimeout(r, 3000));
    const drawn = await page.evaluate(`(() => { ${WALK}
      return walkAll(document, 'svg-preview-pane path', []).map((p) => p.getAttribute('d') || '').filter((d) => d.trim()); })()`);
    const panel = await errorPanel();
    check('a module workspace compiles without error and draws nothing', panel === '' && drawn.length === 0, JSON.stringify({ panel, drawn }));

    const lineEl = await page.evaluateHandle(`(() => { ${WALK}
      return walkAll(document, '.cm-line', []).find((l) => l.textContent === 'export fn dot(x) {'); })()`);
    const box = await lineEl.asElement().boundingBox();
    await page.mouse.click(box.x + 2, box.y + box.height / 2);
    await page.keyboard.press('Home');
    for (let i = 0; i < 'export fn d'.length; i++) await page.keyboard.press('ArrowRight');
    await page.keyboard.press('F2');
    const alert = await pollUntil(async () => dialogs.find((d) => d.type === 'alert'), 10000, 'the alert');
    check(
      'F2 on an exported name says why it cannot rename, and asks for no new name',
      alert.message ===
        "dot is exported, so other files may use it. Renaming across files isn't supported yet: rename it in each file." &&
        !dialogs.some((d) => d.type === 'prompt'),
      JSON.stringify(dialogs),
    );
    await page.close();
  }
} catch (e) {
  check('playground run', false, String(e && e.message));
}

await browser.close();
writeFileSync(join(here, 'verify-phase1-playground-results.json'), `${JSON.stringify(results, null, 2)}\n`);
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length > 0 ? 1 : 0);
