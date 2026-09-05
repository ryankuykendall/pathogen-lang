// Headless verification of `define ViewBox` in the playground.
// page.evaluate(...) bodies are strings so tsx's `__name` helper
// (injected for nested function declarations) doesn't leak into the
// browser context.

import puppeteer from 'puppeteer';

const findInShadowSrc = `
  const findInShadow = (selector, root) => {
    const queue = [root || document];
    while (queue.length) {
      const n = queue.shift();
      const hit = n && n.querySelector ? n.querySelector(selector) : null;
      if (hit) return hit;
      if (n && n.children) for (const c of n.children) queue.push(c);
      if (n && n.shadowRoot) queue.push(n.shadowRoot);
    }
    return null;
  };
`;

const probeSrc = `(() => {
  ${findInShadowSrc}
  let preview_viewBox = null, preview_width = null, preview_height = null;
  let layer_paths = [];
  const previewPane = findInShadow('svg-preview-pane');
  if (previewPane) {
    const iframe = previewPane.shadowRoot && previewPane.shadowRoot.querySelector('iframe');
    const innerDoc = iframe && iframe.contentDocument;
    const svg = innerDoc && innerDoc.getElementById('preview');
    if (svg) {
      preview_viewBox = svg.getAttribute('viewBox');
      preview_width = svg.getAttribute('width');
      preview_height = svg.getAttribute('height');
    }
    if (innerDoc) {
      const paths = innerDoc.querySelectorAll('#preview-layers path');
      layer_paths = Array.from(paths).map(p => ({
        d: (p.getAttribute('d') || '').slice(0, 60),
        layerName: p.getAttribute('data-layer-name'),
      }));
    }
  }
  const footer = findInShadow('playground-footer');
  let footer_viewBox_display = null;
  if (footer) {
    const display = footer.shadowRoot && footer.shadowRoot.querySelector('#viewbox-display');
    footer_viewBox_display = display ? display.textContent : null;
  }
  return { preview_viewBox, preview_width, preview_height, footer_viewBox_display, layer_paths };
})()`;

async function probe(page: any): Promise<any> {
  return await page.evaluate(probeSrc);
}

async function main(): Promise<void> {
  const browser = await puppeteer.launch({ headless: true });
  let ok = true;
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(20_000);
    await page.setCacheEnabled(false);

    const pageErrors: string[] = [];
    page.on('pageerror', (e) => pageErrors.push(`pageerror: ${e.message}`));
    page.on('console', (msg) => {
      if (msg.type() === 'error') pageErrors.push(`console.error: ${msg.text()}`);
    });

    console.log('→ Visiting /pathogen/workspace/new');
    await page.goto('http://localhost:3000/pathogen/workspace/new', { waitUntil: 'networkidle2' });
    await new Promise((r) => setTimeout(r, 1500));

    // Submit the form (creates a workspace and navigates to /workspace/:id)
    const submitSrc = `(() => {
      ${findInShadowSrc}
      const view = findInShadow('new-workspace-view');
      if (!view) return 'new-workspace-view not found';
      const sr = view.shadowRoot;
      const nameInput = sr.querySelector('input[name="name"]');
      if (!nameInput) return 'name input not found';
      nameInput.value = 'viewbox-verify-' + Date.now();
      nameInput.dispatchEvent(new Event('input', { bubbles: true }));
      const submit = sr.querySelector('button[type="submit"]') || sr.querySelector('button');
      submit.click();
      return 'submitted';
    })()`;
    console.log('  ' + (await page.evaluate(submitSrc)));
    await new Promise((r) => setTimeout(r, 6000));

    // Direct lib check: does compileWithContext on the boilerplate
    // produce layers? This isolates a bundle/library issue from a wiring issue.
    const directCompile = await page.evaluate(`(() => {
      const PL = window.PathogenLang;
      const src = "define ViewBox(0, 0, 200, 200);\\ndefine default PathLayer('main-path-layer') \${\\n  fill: #bbb;\\n  stroke: #222;\\n  stroke-width: 1;\\n};\\n\\ncircle(100, 100, 40)\\n";
      try {
        const r = PL.compileWithContext(src);
        return { layerCount: r.layers.length, layers: r.layers.map(l => ({ name: l.name, data: (l.data || '').slice(0, 60), type: l.type })), viewBox: r.viewBox };
      } catch (e) { return 'error: ' + e.message; }
    })()`);
    console.log('  direct lib compileWithContext:', JSON.stringify(directCompile));

    console.log('→ Probing fresh workspace (boilerplate)');
    const fresh = await probe(page);
    console.log('  ', JSON.stringify(fresh, null, 2));
    if (fresh.preview_viewBox !== '0 0 200 200') {
      console.error(`  FAIL fresh preview viewBox: got "${fresh.preview_viewBox}"`);
      ok = false;
    } else {
      console.log('  OK boilerplate preview viewBox = 0 0 200 200');
    }
    if (fresh.footer_viewBox_display !== '0 0 200 200') {
      console.error(`  FAIL fresh footer: got "${fresh.footer_viewBox_display}"`);
      ok = false;
    } else {
      console.log('  OK footer reflects boilerplate viewBox');
    }
    const freshHasCircle = fresh.layer_paths.some((p: any) =>
      p.layerName === 'main-path-layer' && p.d && p.d.length > 0,
    );
    if (!freshHasCircle) {
      console.error(`  FAIL: boilerplate compile did not produce path layers — ${JSON.stringify(fresh.layer_paths)}`);
      ok = false;
    } else {
      console.log('  OK boilerplate compile produced layer paths');
    }

    // Edit: change ViewBox to (10, 20, 500, 300).
    console.log('→ Editing ViewBox to (10, 20, 500, 300)');
    const editSrc = `(() => {
      ${findInShadowSrc}
      const editor = findInShadow('code-editor-pane');
      const newCode = "define ViewBox(10, 20, 500, 300);\\ndefine default PathLayer('main-path-layer') \${\\n  fill: #bbb;\\n  stroke: #222;\\n  stroke-width: 1;\\n};\\n\\ncircle(100, 100, 40);\\n";
      editor.code = newCode;
      return 'set code';
    })()`;
    console.log('  ' + (await page.evaluate(editSrc)));
    await new Promise((r) => setTimeout(r, 6000));

    console.log('→ Probing after edit');
    const after = await probe(page);
    console.log('  ', JSON.stringify(after, null, 2));
    if (after.preview_viewBox !== '10 20 500 300') {
      console.error(`  FAIL after preview viewBox: got "${after.preview_viewBox}"`);
      ok = false;
    } else {
      console.log('  OK preview viewBox updated to "10 20 500 300"');
    }
    if (after.footer_viewBox_display !== '10 20 500 300') {
      console.error(`  FAIL after footer: got "${after.footer_viewBox_display}"`);
      ok = false;
    } else {
      console.log('  OK footer updated');
    }
    if (after.preview_width !== '500' || after.preview_height !== '300') {
      console.error(`  FAIL after preview width/height: got ${after.preview_width}/${after.preview_height}`);
      ok = false;
    } else {
      console.log('  OK preview width/height = 500/300');
    }

    if (pageErrors.length) {
      console.error('\n=== Console errors ===');
      pageErrors.forEach((e) => console.error('  ' + e));
    }
  } catch (e) {
    console.error('Unexpected:', e);
    ok = false;
  } finally {
    await browser.close();
  }
  if (!ok) {
    console.error('\n=== Verification FAILED ===');
    process.exit(1);
  }
  console.log('\n=== Verification PASSED ===');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
