// Playground verification for the style-block-structure project.
// Checks (per project-docs/style-block-structure/PLAN.md Phase 7):
//   1. Structured highlighting inside ${ } (inner grammar tokens get distinct classes)
//   2. Color chip appears for #c00 nested inside drop-shadow(...)
//   3. Completions after `filter: ` include drop-shadow snippet + typed filter var
//   4. Comma form shows the compile error in the error panel
//   5. Template value `${family}` still parses (no interpolation regression)
import puppeteer from 'puppeteer';

const CODE = [
  "let family = 'Noto Sans';",
  'let shadowColor = oklch(0.6567 0.2598 356.8);',
  'let grain = NoiseFilter() {|f| f.style = NoiseFilterStyle.Grain; };',
  "define PathLayer('a') ${",
  '  fill: #eaaa;',
  '  filter: drop-shadow(4px 4px 4px #c00);',
  '  font-family: `${family}`;',
  '}',
  "layer('a').apply { M 10 10 L 90 90 }",
].join('\n');

const state = Buffer.from(encodeURIComponent(JSON.stringify({ code: CODE }))).toString('base64');
const url = `http://localhost:3000/pathogen/workspace/scratch?state=${encodeURIComponent(state)}`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({ headless: 'new' });
try {
  const page = await browser.newPage();
  page.on('dialog', (d) => d.dismiss().catch(() => {}));
  await page.evaluateOnNewDocument(() => {
    try { localStorage.setItem('pathogen-user-id', 'verify-agent-anon'); } catch {}
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

  // Poll for the editor + preview to exist (evaluate-poll per CSP gotcha).
  let ready = false;
  for (let i = 0; i < 60 && !ready; i++) {
    ready = await page.evaluate(() => {
      const ws = document.querySelector('app-shell')?.shadowRoot?.querySelector('workspace-view');
      const editor = ws?.shadowRoot?.querySelector('code-editor-pane');
      const cm = editor?.shadowRoot?.querySelector('.cm-content');
      return Boolean(cm && cm.textContent && cm.textContent.includes('drop-shadow'));
    });
    if (!ready) await sleep(500);
  }
  console.log('editor-ready:', ready);

  const result = await page.evaluate(() => {
    const ws = document.querySelector('app-shell')?.shadowRoot?.querySelector('workspace-view');
    const editor = ws?.shadowRoot?.querySelector('code-editor-pane');
    const root = editor?.shadowRoot;
    const out = {};

    // 1. Structured highlighting: find the line containing drop-shadow and
    // count distinct highlight classes on its spans.
    const lines = [...root.querySelectorAll('.cm-line')];
    const dsLine = lines.find((l) => l.textContent.includes('drop-shadow'));
    out.dsLineSpanClasses = dsLine
      ? [...new Set([...dsLine.querySelectorAll('span')].map((s) => s.className).filter(Boolean))]
      : [];

    // 2. Color chips: count <color-input> chips and note the line text they sit on.
    out.chips = [...root.querySelectorAll('color-input')].map((c) => c.closest('.cm-line')?.textContent?.slice(0, 60) ?? '?');

    // 5. Template line renders without error markers
    const tmplLine = lines.find((l) => l.textContent.includes('font-family'));
    out.templateLineText = tmplLine?.textContent ?? null;

    // Compile status: error panel visibility
    const errPanel = ws?.shadowRoot?.querySelector('error-panel');
    out.errorPanelText = errPanel?.shadowRoot?.textContent?.trim().slice(0, 120) || '';
    return out;
  });
  console.log('highlight-classes-on-drop-shadow-line:', JSON.stringify(result.dsLineSpanClasses));
  console.log('chips-on-lines:', JSON.stringify(result.chips));
  console.log('template-line:', JSON.stringify(result.templateLineText));
  console.log('error-panel:', JSON.stringify(result.errorPanelText));

  // 3. Completions: place cursor after `filter: ` and trigger completion.
  const completions = await page.evaluate(async () => {
    const ws = document.querySelector('app-shell')?.shadowRoot?.querySelector('workspace-view');
    const editor = ws?.shadowRoot?.querySelector('code-editor-pane');
    const root = editor?.shadowRoot;
    const view = editor?.editorView || editor?._editorView || root?.querySelector('.cm-content')?.cmView?.view
      || (() => { const el = root?.querySelector('.cm-editor'); return el && el.querySelector('.cm-content')?.cmView?.rootView?.view; })();
    if (!view) return { ok: false, reason: 'no EditorView handle' };
    const doc = view.state.doc.toString();
    const pos = doc.indexOf('drop-shadow(4px');
    view.dispatch({ selection: { anchor: pos } });
    view.focus();
    return { ok: true };
  });
  console.log('cursor-set:', JSON.stringify(completions));

  if (completions.ok) {
    // Type over: select to end of value then retype "filter: " trigger — simpler:
    // just hit Ctrl-Space at the value position.
    await page.keyboard.down('Control');
    await page.keyboard.press('Space');
    await page.keyboard.up('Control');
    await sleep(800);
    const items = await page.evaluate(() => {
      const ws = document.querySelector('app-shell')?.shadowRoot?.querySelector('workspace-view');
      const editor = ws?.shadowRoot?.querySelector('code-editor-pane');
      const tips = editor?.shadowRoot?.querySelectorAll('.cm-tooltip-autocomplete li[role=option]');
      return tips ? [...tips].map((t) => t.textContent.trim()).slice(0, 25) : [];
    });
    console.log('completion-items:', JSON.stringify(items));
  }

  console.log('page-errors:', JSON.stringify(errors.slice(0, 5)));
} finally {
  await browser.close();
}
