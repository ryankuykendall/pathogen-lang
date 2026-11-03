/**
 * Phase 0a step 5 in the REAL playground (served bundle + live CodeMirror
 * editor): a program that declares a built-in name shows the error, F2 on the
 * name renames it everywhere it's used (window.prompt answered with a new
 * name), and the renamed program renders.
 *
 * Requires the dev stack (Pages on :3000) serving a fresh build:
 *   PATHOGEN_API_BASE=http://localhost:8787 npm run build:website
 * Run from the repo root:
 *   node project-docs/modules/verify/verify-step5-playground.mjs
 */
import puppeteer from 'puppeteer';

const ORIGIN = 'http://localhost:3000';
const code = 'define ViewBox(0, 0, 100, 40);\nlet line = 3;\nM 10 10 L calc(line * 10) 10\nlog(line);';
const RENAMED = 'define ViewBox(0, 0, 100, 40);\nlet span = 3;\nM 10 10 L calc(span * 10) 10\nlog(span);';
const ERROR = 'Cannot use line as a name — it is a built-in function. Use another name';

let failures = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};

const browser = await puppeteer.launch({ headless: 'shell' });
const page = await browser.newPage();
const prompts = [];
page.on('dialog', (d) => {
  if (d.type() === 'prompt') {
    prompts.push(d.message());
    d.accept('span').catch(() => {});
  } else {
    d.dismiss().catch(() => {});
  }
});
await page.evaluateOnNewDocument(() => {
  window.__name = (fn) => fn;
});

async function pollUntil(fn, timeoutMs, what) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const v = await fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`timed out after ${timeoutMs}ms waiting for ${what}`);
}

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
const editorText = () =>
  page.evaluate(`(() => { ${WALK}
    const lines = walkAll(document, '.cm-line', []);
    return lines.map((l) => l.textContent).join('\\n'); })()`);
// The error panel's message while it is showing, else '' (the page also holds
// the docs, which quote the same message, so the panel is read directly).
const errorPanel = () =>
  page.evaluate(`(() => { ${WALK}
    const panel = walkAll(document, 'error-panel', [])[0];
    if (!panel || getComputedStyle(panel).display === 'none' || !panel.shadowRoot) return '';
    return [...panel.shadowRoot.querySelectorAll(':not(style)')].filter((n) => n.children.length === 0)
      .map((n) => n.textContent).join(' ').replace(/\\s+/g, ' ').trim(); })()`);

const state = Buffer.from(encodeURIComponent(JSON.stringify({ code }))).toString('base64');
try {
  await page.goto(`${ORIGIN}/workspace/scratch?state=${encodeURIComponent(state)}`, {
    waitUntil: 'domcontentloaded',
    timeout: 20000,
  });
} catch {
  console.log('  (goto lifecycle timeout — polling the DOM directly)');
}

try {
  await pollUntil(async () => (await editorText()).includes('let line = 3;'), 40000, 'editor with the program');
  const shown = await pollUntil(async () => ((await errorPanel()).includes(ERROR) ? await errorPanel() : null), 40000, 'the error panel');
  check('the error panel shows the error at its line and column', shown.startsWith(`Line 2:5 — ${ERROR}`), shown);

  // Put the cursor inside `line` on line 2, then F2.
  const lineEl = await page.evaluateHandle(`(() => { ${WALK}
    return walkAll(document, '.cm-line', []).find((l) => l.textContent === 'let line = 3;'); })()`);
  const box = await lineEl.asElement().boundingBox();
  await page.mouse.click(box.x + 2, box.y + box.height / 2);
  await page.keyboard.press('Home');
  for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowRight');
  await page.keyboard.press('F2');

  const renamed = await pollUntil(async () => ((await editorText()) === RENAMED ? RENAMED : null), 10000, 'the renamed program');
  check('F2 asked for a name, prefilled with the old one', prompts.length === 1 && prompts[0].includes('"line"'), JSON.stringify(prompts));
  check('F2 renamed the declaration and every reference', renamed === RENAMED, JSON.stringify(await editorText()));

  const path = await pollUntil(
    () =>
      page.evaluate(`(() => { ${WALK}
        const ds = walkAll(document, 'path', []).map((p) => p.getAttribute('d') || '').filter((d) => d.includes('M 10 10'));
        return ds.length ? ds[0] : null; })()`),
    40000,
    'the rendered path',
  );
  check('the renamed program renders', path.replace(/\s+/g, ' ').trim() === 'M 10 10 L 30 10', path);
  const cleared = await pollUntil(async () => ((await errorPanel()) === '' ? 'cleared' : null), 10000, 'the error panel to close');
  check('the error panel closes', cleared === 'cleared');
} catch (e) {
  check('playground run', false, String(e && e.message));
}

await browser.close();
console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exitCode = failures ? 1 : 0;
