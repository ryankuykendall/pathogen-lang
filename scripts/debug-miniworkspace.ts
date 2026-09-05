// Diagnostic: load a blog post that has a mini-workspace with CSS vars,
// inspect what's happening with the color chips and inspector panel.

import puppeteer from 'puppeteer';

async function main(): Promise<void> {
  const browser = await puppeteer.launch({ headless: true });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(15_000);

    const logs: string[] = [];
    page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
    page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`));
    page.on('response', (r) => {
      if (r.status() >= 400 && !r.url().includes('favicon')) {
        logs.push(`HTTP ${r.status()}: ${r.url()}`);
      }
    });

    const slug = process.argv[2] || 'reactive-color-svg';
    const host = process.argv[3] || 'http://localhost:3000';
    console.log(`→ Loading ${host}/blog/${slug}`);
    await page.goto(`${host}/blog/${slug}`, { waitUntil: 'networkidle2' });

    await new Promise((r) => setTimeout(r, 2500));

    const probe = await page.evaluate(`(() => {
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

      const minis = findAllInShadow('mini-workspace');
      // Find the gradient-gallery mini-workspace by its caption text
      const targetIdx = Array.from(minis).findIndex(m => (m.getAttribute('caption') || '').includes('six types'));
      const firstMini = targetIdx >= 0 ? minis[targetIdx] : minis[0];
      if (!firstMini) return { error: 'no mini-workspace on page' };

      const out = {
        miniCount: minis.length,
        miniTag: firstMini.tagName,
        hasShadow: !!firstMini.shadowRoot,
        sourceCode: firstMini.querySelector('code')?.textContent?.slice(0, 80) || null,
        cssVars: firstMini._cssVars || 'private',
        inspectorMetadata: firstMini._inspectorMetadata ? Object.keys(firstMini._inspectorMetadata) : 'no metadata',
        chipGroupFound: !!firstMini.shadowRoot?.querySelector('#chip-group'),
        chipsCount: firstMini.shadowRoot?.querySelectorAll('.chip').length || 0,
        chipElements: Array.from(firstMini.shadowRoot?.querySelectorAll('.chip') || []).map(c => c.outerHTML.slice(0, 100)),
        inspectorBtnFound: !!firstMini.shadowRoot?.querySelector('[data-tip*="Inspect" i], #inspector-btn, button[aria-label*="inspect" i]'),
        previewElement: !!firstMini.shadowRoot?.querySelector('mini-preview'),
      };
      return out;
    })()`);

    console.log('Probe results:', JSON.stringify(probe, null, 2));

    // Find the inspector toggle button by inspecting all interactive elements
    const detail = await page.evaluate(`(() => {
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
      const mini = findAllInShadow('mini-workspace')[0];
      const sr = mini.shadowRoot;
      return {
        allButtons: Array.from(sr.querySelectorAll('button')).map(b => ({
          id: b.id, class: b.className, tip: b.dataset.tip, label: b.getAttribute('aria-label'),
        })),
        chipPathogenColorInput: Array.from(sr.querySelectorAll('pathogen-color-input')).map(p => ({
          dataset_var: p.dataset.var, value: p.getAttribute('value'),
          customElementDefined: !!customElements.get('pathogen-color-input'),
          hasShadow: !!p.shadowRoot,
        })),
      };
    })()`);
    console.log('\nDetail:', JSON.stringify(detail, null, 2));

    // Try clicking the inspector button (lives inside mini-preview shadow)
    const clickResult = await page.evaluate(`(() => {
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
      const mini = findAllInShadow('mini-workspace')[0];
      const inspectorBtn = findAllInShadow('#inspector-open-btn', mini)[0];
      const beforeOpen = mini._inspectorOpen;
      if (inspectorBtn) inspectorBtn.click();
      return {
        inspectorBtnFound: !!inspectorBtn,
        beforeOpen,
        afterClickInspectorOpen: mini._inspectorOpen,
        inspectorElementPresent: !!mini._inspectorEl,
        inspectorPanelInShadow: !!mini.shadowRoot.querySelector('inspector-panel'),
      };
    })()`);
    await new Promise((r) => setTimeout(r, 500));
    console.log('\nAfter click inspector-btn:', JSON.stringify(clickResult, null, 2));

    await new Promise((r) => setTimeout(r, 1500));
    const afterPanel = await page.evaluate(`(() => {
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
      const mini = findAllInShadow('mini-workspace')[0];
      const panel = mini.shadowRoot.querySelector('inspector-panel');
      if (!panel) return { error: 'no inspector-panel' };
      const sr = panel.shadowRoot;
      if (!sr) return { error: 'panel no shadow' };
      return {
        sectionHeadings: Array.from(sr.querySelectorAll('h2, h3, .section-heading, [class*="section"]')).map(h => h.tagName + '.' + h.className + ': ' + h.textContent?.slice(0, 40)),
        firstFewChildren: Array.from(sr.children).slice(0, 3).map(c => c.tagName + (c.id ? '#' + c.id : '') + '.' + c.className),
        innerHTMLLen: sr.innerHTML.length,
        hasSetData: typeof panel.setData,
        // Snippet of what's actually rendered
        innerSnippet: sr.innerHTML.slice(0, 1500),
      };
    })()`);
    console.log('\nInspector panel state:', JSON.stringify(afterPanel, null, 2));

    // Now test color chip click → does a picker appear?
    const chipClickResult = await page.evaluate(`(() => {
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
      const mini = findAllInShadow('mini-workspace')[0];
      const chip = mini.shadowRoot.querySelector('pathogen-color-input');
      if (!chip) return { error: 'no chip' };
      const beforeClickPopupCount = document.querySelectorAll('color-input-popup, .color-picker-popup, [role="dialog"]').length;
      chip.click();
      return {
        chipTag: chip.tagName,
        chipShadowChildren: chip.shadowRoot ? Array.from(chip.shadowRoot.children).map(c => c.tagName) : null,
        beforeClickPopupCount,
        afterClickPopupCount: document.querySelectorAll('color-input-popup, .color-picker-popup, [role="dialog"]').length,
        // Look for inner color-input element
        innerColorInput: chip.shadowRoot?.querySelector('color-input') ? 'present' : 'missing',
      };
    })()`);
    console.log('\nChip click test:', JSON.stringify(chipClickResult, null, 2));

    // Check the vendor color-input registration
    const vendorCheck = await page.evaluate(`(() => {
      return {
        colorInputDefined: !!customElements.get('color-input'),
        pathogenColorInputDefined: !!customElements.get('pathogen-color-input'),
        hdrColorInputDefined: !!customElements.get('hdr-color-input'),
        // Look for vendor script in document
        scripts: Array.from(document.scripts).map(s => s.src).filter(s => s.includes('color') || s.includes('vendor')),
      };
    })()`);
    console.log('\nVendor check:', JSON.stringify(vendorCheck, null, 2));

    const inspectorCheck = await page.evaluate(`(() => {
      return {
        inspectorPanelDefined: !!customElements.get('inspector-panel'),
        layersPanelDefined: !!customElements.get('layers-panel'),
        palettePanelDefined: !!customElements.get('palette-panel'),
        cssvarPanelDefined: !!customElements.get('cssvar-panel'),
      };
    })()`);
    console.log('\nInspector sub-elements:', JSON.stringify(inspectorCheck, null, 2));

    const panelDeep = await page.evaluate(`(() => {
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
      const mini = findAllInShadow('mini-workspace')[0];
      const panel = mini.shadowRoot.querySelector('inspector-panel');
      const sr = panel.shadowRoot;
      const insp = sr.querySelector('.inspector');
      const layers = sr.querySelector('layers-panel');
      const palette = sr.querySelector('palette-panel');
      const cssvar = sr.querySelector('cssvar-panel');
      return {
        inspectorDivChildTags: Array.from(insp.children).map(c => c.tagName),
        layersPanel: layers ? { hasShadow: !!layers.shadowRoot, layersAttr: layers.layers, innerHTML: layers.shadowRoot?.innerHTML?.length ?? 'no-shadow' } : 'missing',
        palettePanel: palette ? { hasShadow: !!palette.shadowRoot, layersAttr: palette.layers, innerHTML: palette.shadowRoot?.innerHTML?.length ?? 'no-shadow' } : 'missing',
        cssvarPanel: cssvar ? { hasShadow: !!cssvar.shadowRoot, cssPropertiesAttr: cssvar.cssProperties, innerHTML: cssvar.shadowRoot?.innerHTML?.length ?? 'no-shadow' } : 'missing',
      };
    })()`);
    console.log('\nPanel deep state:', JSON.stringify(panelDeep, null, 2));

    const cssvarContents = await page.evaluate(`(() => {
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
      const mini = findAllInShadow('mini-workspace')[0];
      const panel = mini.shadowRoot.querySelector('inspector-panel');
      const cssvar = panel.shadowRoot.querySelector('cssvar-panel');
      const innerSr = cssvar.shadowRoot;
      // Look for empty-state vs populated
      return {
        textPreview: innerSr.textContent.replace(/\\s+/g, ' ').trim().slice(0, 200),
        rowCount: innerSr.querySelectorAll('.row, .item, [data-var], li').length,
        emptyState: innerSr.querySelector('.empty, [data-empty]') ? 'present' : 'none',
      };
    })()`);
    console.log('\ncssvar-panel contents:', JSON.stringify(cssvarContents, null, 2));

    const layersContents = await page.evaluate(`(() => {
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
      const mini = findAllInShadow('mini-workspace')[0];
      const panel = mini.shadowRoot.querySelector('inspector-panel');
      const layers = panel.shadowRoot.querySelector('layers-panel');
      const innerSr = layers.shadowRoot;
      return {
        textPreview: innerSr.textContent.replace(/\\s+/g, ' ').trim().slice(0, 200),
        rowCount: innerSr.querySelectorAll('.row, .item, .layer, li').length,
      };
    })()`);
    console.log('\nlayers-panel contents:', JSON.stringify(layersContents, null, 2));

    const dataFlow = await page.evaluate(`(() => {
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
      const mini = findAllInShadow('mini-workspace')[0];
      const panel = mini.shadowRoot.querySelector('inspector-panel');
      const cssvar = panel.shadowRoot.querySelector('cssvar-panel');
      const layers = panel.shadowRoot.querySelector('layers-panel');
      return {
        miniMetadata: !!mini._inspectorMetadata,
        cssvar_layers: cssvar._layers?.length ?? 'undefined',
        cssvar_cssProperties: cssvar._cssProperties?.length ?? 'undefined',
        layers_layers: layers._layers?.length ?? 'undefined',
        cssvar_isConnected: cssvar.isConnected,
        layers_isConnected: layers.isConnected,
        cssvar_classname: cssvar.constructor.name,
      };
    })()`);
    console.log('\nData flow check:', JSON.stringify(dataFlow, null, 2));

    const cssvarRender = await page.evaluate(`(() => {
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
      const mini = findAllInShadow('mini-workspace')[0];
      const panel = mini.shadowRoot.querySelector('inspector-panel');
      const cssvar = panel.shadowRoot.querySelector('cssvar-panel');
      const sr = cssvar.shadowRoot;
      const varList = sr.querySelector('.var-list');
      return {
        layer0Styles: JSON.stringify(cssvar._layers[0]?.styles),
        cssProperties: JSON.stringify(cssvar._cssProperties),
        varListExists: !!varList,
        varListHTML: varList?.innerHTML?.slice(0, 500),
        varListChildCount: varList?.children?.length ?? 0,
      };
    })()`);
    console.log('\ncssvar render state:', JSON.stringify(cssvarRender, null, 2));

    console.log('\n=== Page errors / requests ===');
    for (const l of logs) console.log('  ' + l);
  } catch (e) {
    console.error('Unexpected:', e);
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
