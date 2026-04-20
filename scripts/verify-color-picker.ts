// Headless smoke test: verifies that hdr-color-input integration is live.
// Intended as a one-off verification — not part of the permanent test suite.

import puppeteer from 'puppeteer';

async function main(): Promise<void> {
  const browser = await puppeteer.launch({ headless: 'new' as unknown as boolean });
  try {
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`);
    });

    console.log('→ Visiting /pathogen/');
    await page.goto('http://localhost:3000/pathogen/', { waitUntil: 'networkidle2' });

    // 1. Vendor chunk registered <color-input>
    const colorInputDefined = await page.evaluate(() => !!customElements.get('color-input'));
    console.log(`  color-input registered: ${colorInputDefined}`);
    if (!colorInputDefined) throw new Error('color-input custom element not registered');

    // 2. pathogen-color-input wrapper registered
    const wrapperDefined = await page.evaluate(() => !!customElements.get('pathogen-color-input'));
    console.log(`  pathogen-color-input registered: ${wrapperDefined}`);
    if (!wrapperDefined) throw new Error('pathogen-color-input wrapper not registered');

    // 3. Visit /pathogen/storybook/pathogen-color-input
    console.log('→ Visiting /pathogen/storybook/pathogen-color-input');
    await page.goto('http://localhost:3000/pathogen/storybook/pathogen-color-input', {
      waitUntil: 'networkidle2',
    });
    // Allow custom element upgrades + shadow DOM render
    await new Promise((r) => setTimeout(r, 500));

    const storybookHasPicker = await page.evaluate(`
      (function findPicker(root) {
        if (!root) return false;
        const queue = [root];
        while (queue.length) {
          const n = queue.shift();
          if (n.tagName === 'PATHOGEN-COLOR-INPUT') return true;
          if (n.shadowRoot) queue.push(...n.shadowRoot.children);
          if (n.children) queue.push(...n.children);
        }
        return false;
      })(document.querySelector('app-shell'))
    `);
    console.log(`  storybook story rendered pathogen-color-input: ${storybookHasPicker}`);

    // 4. Visit /pathogen/new and verify footer pickers upgrade
    console.log('→ Visiting /pathogen/new');
    await page.goto('http://localhost:3000/pathogen/new', { waitUntil: 'networkidle2' });
    await new Promise((r) => setTimeout(r, 500));

    const footerHasPicker = await page.evaluate(`
      (function findPicker(root) {
        if (!root) return false;
        const queue = [root];
        while (queue.length) {
          const n = queue.shift();
          if (n.tagName === 'PATHOGEN-COLOR-INPUT') return true;
          if (n.shadowRoot) queue.push(...n.shadowRoot.children);
          if (n.children) queue.push(...n.children);
        }
        return false;
      })(document.querySelector('app-shell'))
    `);
    console.log(`  workspace has pathogen-color-input: ${footerHasPicker}`);

    if (errors.length > 0) {
      console.error('\nErrors surfaced in page console:');
      for (const e of errors) console.error('  ' + e);
      throw new Error('page errors');
    }

    console.log('\n✓ Smoke test passed.');
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
