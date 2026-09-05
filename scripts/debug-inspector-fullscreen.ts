// Verify the inspector dismiss-on-fullscreen-transition fix.
//   1. Enter fullscreen on a mini-workspace, open inspector, exit fullscreen.
//      Expectation: inspector is no longer in DOM.
//   2. Open mini-workspace A, enter fullscreen, open inspector. Then
//      enter fullscreen on workspace B without exiting A first.
//      Expectation: A's inspector is closed before B is fullscreen.

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
  const findAllInShadow = (selector, root) => {
    const out = [];
    const queue = [root || document];
    while (queue.length) {
      const n = queue.shift();
      if (n && n.querySelectorAll) out.push(...n.querySelectorAll(selector));
      if (n && n.children) for (const c of n.children) queue.push(c);
      if (n && n.shadowRoot) queue.push(n.shadowRoot);
    }
    return out;
  };
`;

async function main(): Promise<void> {
  const browser = await puppeteer.launch({ headless: true });
  let ok = true;
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(15_000);
    await page.setCacheEnabled(false);

    page.on('pageerror', (e) => console.log(`pageerror: ${e.message}`));

    console.log('→ Loading /blog/gradient-pipeline (has several mini-workspaces)');
    await page.goto('http://localhost:3000/blog/gradient-pipeline', { waitUntil: 'networkidle2' });
    await new Promise((r) => setTimeout(r, 2500));

    // CASE 1: enter fullscreen on mini-workspace[0], open inspector, exit fullscreen.
    const case1 = await page.evaluate(`(() => {
      ${findInShadowSrc}
      const minis = findAllInShadow('mini-workspace');
      const mini = minis[0];
      const fsBtn = findInShadow('#fullscreen-toggle', mini);
      const inspectBtn = findInShadow('#inspector-open-btn', mini);
      if (!mini || !fsBtn || !inspectBtn) {
        return { error: 'missing element', miniCount: minis.length, fsBtn: !!fsBtn, inspectBtn: !!inspectBtn };
      }
      fsBtn.click();
      return { ok: 1, isFullscreen: mini._isPreviewFullscreen };
    })()`);
    console.log('  after fullscreen-toggle:', JSON.stringify(case1));
    await new Promise((r) => setTimeout(r, 400));

    const openInspector = await page.evaluate(`(() => {
      ${findInShadowSrc}
      const mini = findAllInShadow('mini-workspace')[0];
      const inspectBtn = findInShadow('#inspector-open-btn', mini);
      inspectBtn.click();
      return { isFullscreen: mini._isPreviewFullscreen };
    })()`);
    console.log('  after inspector-open click:', JSON.stringify(openInspector));
    await new Promise((r) => setTimeout(r, 800));

    const stateBeforeExit = await page.evaluate(`(() => {
      ${findInShadowSrc}
      const mini = findAllInShadow('mini-workspace')[0];
      return {
        inspectorOpen: mini._inspectorOpen,
        panelInShadow: !!mini.shadowRoot.querySelector('inspector-panel'),
      };
    })()`);
    console.log('  state with fullscreen + inspector:', JSON.stringify(stateBeforeExit));
    if (!stateBeforeExit.inspectorOpen) {
      console.error('  FAIL: inspector did not open during fullscreen');
      ok = false;
    }

    // Now exit fullscreen — expectation: inspector dismissed
    const exit1 = await page.evaluate(`(() => {
      ${findInShadowSrc}
      const mini = findAllInShadow('mini-workspace')[0];
      const fsBtn = findInShadow('#fullscreen-toggle', mini);
      fsBtn.click();
      return { isFullscreen: mini._isPreviewFullscreen };
    })()`);
    console.log('  after fullscreen exit:', JSON.stringify(exit1));
    await new Promise((r) => setTimeout(r, 500));

    const afterExit = await page.evaluate(`(() => {
      ${findInShadowSrc}
      const mini = findAllInShadow('mini-workspace')[0];
      return {
        inspectorOpen: mini._inspectorOpen,
        panelInShadow: !!mini.shadowRoot.querySelector('inspector-panel'),
      };
    })()`);
    console.log('  after exit, inspector state:', JSON.stringify(afterExit));
    if (afterExit.inspectorOpen || afterExit.panelInShadow) {
      console.error('  CASE 1 FAIL: inspector should be dismissed after exit fullscreen');
      ok = false;
    } else {
      console.log('  CASE 1 OK: inspector dismissed on fullscreen exit');
    }

    // CASE 2: re-open A's fullscreen, open inspector, DO NOT exit. Then
    // open B's fullscreen — A's inspector should close.
    console.log('\n→ Testing cross-instance leakage');
    await page.evaluate(`(() => {
      ${findInShadowSrc}
      const minis = findAllInShadow('mini-workspace');
      const a = minis[0], b = minis[1];
      // Open A's fullscreen
      findInShadow('#fullscreen-toggle', a).click();
    })()`);
    await new Promise((r) => setTimeout(r, 400));
    await page.evaluate(`(() => {
      ${findInShadowSrc}
      const mini = findAllInShadow('mini-workspace')[0];
      findInShadow('#inspector-open-btn', mini).click();
    })()`);
    await new Promise((r) => setTimeout(r, 600));

    const beforeB = await page.evaluate(`(() => {
      ${findInShadowSrc}
      const minis = findAllInShadow('mini-workspace');
      return {
        aInspectorOpen: minis[0]._inspectorOpen,
        bInspectorOpen: minis[1]._inspectorOpen,
        aFullscreen: minis[0]._isPreviewFullscreen,
        bFullscreen: minis[1]._isPreviewFullscreen,
      };
    })()`);
    console.log('  state before B fullscreen:', JSON.stringify(beforeB));

    await page.evaluate(`(() => {
      ${findInShadowSrc}
      const mini = findAllInShadow('mini-workspace')[1];
      findInShadow('#fullscreen-toggle', mini).click();
    })()`);
    await new Promise((r) => setTimeout(r, 500));

    const afterB = await page.evaluate(`(() => {
      ${findInShadowSrc}
      const minis = findAllInShadow('mini-workspace');
      return {
        aInspectorOpen: minis[0]._inspectorOpen,
        bInspectorOpen: minis[1]._inspectorOpen,
        aFullscreen: minis[0]._isPreviewFullscreen,
        bFullscreen: minis[1]._isPreviewFullscreen,
        anyInspectorPanelAnywhere: findAllInShadow('inspector-panel').length,
      };
    })()`);
    console.log('  state after B fullscreen:', JSON.stringify(afterB));
    if (afterB.aInspectorOpen || afterB.anyInspectorPanelAnywhere > 0) {
      console.error("  CASE 2 FAIL: A's inspector should close when B enters fullscreen");
      ok = false;
    } else {
      console.log("  CASE 2 OK: A's inspector closed when B entered fullscreen");
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
