// Phase 2d, step 6b: a probe of what headless Chrome does with a drag, on the
// file tree's story (where a drop moves the rows). Kept for the record of why
// verify-2d-step6b.ts sends its drops in the page.
//
// What it found (2026-11-13, Chrome under puppeteer 25):
// - A real mouse drag starts a native drag: dragstart, dragover (the folder
//   lit, the label shown, the row dimmed) and dragend come from the browser.
// - Released over a folder that takes the drop, no drop arrives: only dragend.
// - The drag interception (Input.setInterceptDrags) never fires, so CDP's
//   dispatchDragEvent can't deliver one either.
// - --from=parts/gears.pathogen: that row drags fine as the first drag in a
//   fresh browser (it froze in the check only after other drags).
//
//   npm run dev:stack
//   npx tsx project-docs/modules/verify/probe-2d-step6b-drag.ts [--from=<path>] [--intercept-only]

import puppeteer from 'puppeteer';

const browser = await puppeteer.launch({ headless: true, defaultViewport: { width: 1320, height: 860 } });
try {
  const page = await browser.newPage();
  await page.evaluateOnNewDocument(`
    // The story's tree: the app's own (in workspace-view) is in the page too, with one row at most.
    window.__tree = () => {
      const all = [];
      const walk = (root) => {
        for (const el of root.querySelectorAll('*')) {
          if (el.localName === 'file-tree') all.push(el);
          if (el.shadowRoot) walk(el.shadowRoot);
        }
      };
      walk(document);
      return all.find((t) => t.shadowRoot.querySelector('[data-path="demos"]'));
    };
    window.__events = [];
    for (const t of ['dragstart', 'dragover', 'drop', 'dragend']) {
      document.addEventListener(t, () => window.__events.push(t), true);
    }
  `);
  await page.goto('http://localhost:3000/storybook/file-tree', { waitUntil: 'domcontentloaded' });
  await new Promise((r) => setTimeout(r, 2500));
  const rect = async (path: string): Promise<{ x: number; y: number }> =>
    page.evaluate(`(() => {
      const b = window.__tree().shadowRoot.querySelector('[data-path="${path}"]').getBoundingClientRect();
      return { x: b.left + 40, y: b.top + b.height / 2 };
    })()`) as Promise<{ x: number; y: number }>;
  const shown = async (): Promise<unknown> =>
    page.evaluate(`(() => {
      const root = window.__tree().shadowRoot;
      return {
        lit: [...root.querySelectorAll('.row.drop')].map((r) => r.dataset.path),
        label: root.querySelector('.drop-label').hidden ? null : root.querySelector('.drop-label').textContent,
        dragging: [...root.querySelectorAll('.row.dragging')].map((r) => r.dataset.path),
      };
    })()`);
  const rows = async (): Promise<unknown> =>
    page.evaluate(`[...window.__tree().shadowRoot.querySelectorAll('[role="treeitem"]')].map((r) => r.dataset.path)`);

  // 1. A native drag from the mouse, released over demos/.
  if (!process.argv.includes('--intercept-only')) {
    const fromPath = process.argv.find((a) => a.startsWith('--from='))?.slice(7) ?? 'parts/kit.pathogen';
    const from = await rect(fromPath);
    const to = await rect('demos');
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) {
      await page.mouse.move(from.x + ((to.x - from.x) * i) / 10, from.y + ((to.y - from.y) * i) / 10);
      await new Promise((r) => setTimeout(r, 30));
    }
    await new Promise((r) => setTimeout(r, 300));
    console.log('native, mid-drag:', JSON.stringify(await shown()));
    await page.mouse.up();
    await new Promise((r) => setTimeout(r, 400));
    console.log(
      'native, after:',
      JSON.stringify({ events: await page.evaluate('[...new Set(window.__events)]'), rows: await rows() }),
    );
  }

  // 2. The intercepted drag: the drag's data caught, then enter, over and drop sent through Chrome's input layer.
  await page.evaluate('window.__events = []');
  const from = await rect('parts/labels.pathogen');
  const to = await rect('demos');
  const client = await page.createCDPSession();
  await client.send('Input.setInterceptDrags', { enabled: true });
  const intercepted = new Promise<unknown>((ok) => client.once('Input.dragIntercepted', (e) => ok(e.data)));
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  const data = (await Promise.race([intercepted, new Promise((ok) => setTimeout(() => ok(null), 4000))])) as never;
  console.log('intercepted drag data:', JSON.stringify(data));
  if (data !== null) {
    const send = async (type: string): Promise<unknown> =>
      client.send('Input.dispatchDragEvent', { type: type as never, x: to.x, y: to.y, data });
    await send('dragEnter');
    await send('dragOver');
    await new Promise((r) => setTimeout(r, 300));
    console.log('intercepted, mid-drag:', JSON.stringify(await shown()));
    await send('drop');
  }
  await page.mouse.up();
  await new Promise((r) => setTimeout(r, 400));
  console.log(
    'intercepted, after:',
    JSON.stringify({ events: await page.evaluate('window.__events'), rows: await rows() }),
  );
} finally {
  await browser.close();
}
