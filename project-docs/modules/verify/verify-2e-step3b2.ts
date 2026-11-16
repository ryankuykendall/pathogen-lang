// 2e, step 3b-2 (note 58): <mini-workspace>'s code panel is <source-files>.
// On the dev stack, light and dark:
// - a blog post's embed (the static page /blog/heading-turn): the code in
//   CodeMirror, the copy icon in the panel saying "Copy the code" and copying
//   the sample, no Copy in the bar; closed, the panel can't take the keyboard;
//   no ancestor pins the panel's fixed sheet to itself (transform, filter, …);
// - the header's own theme toggle reaches the panel's editor;
// - a phone (390 px): the panel's copy icon clear of the ↗;
// - the storybook's several-files stories: the list, opening on the program that
//   drew the image, the ↗ hidden; opening the code never shows the menu midway;
//   a narrow panel shows the menu.
//
//   npm run dev:stack            (and npm run build:playground:dev after a change)
//   npx tsx project-docs/modules/verify/verify-2e-step3b2.ts

import puppeteer from 'puppeteer';

import type { ElementHandle, Page } from 'puppeteer';

const APP = 'http://localhost:3000';
const SHOTS = 'project-docs/modules/verify';
const pause = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

let failures = 0;
const check = (label: string, ok: boolean, detail?: unknown): void => {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${label}${ok ? '' : ` ${JSON.stringify(detail)?.slice(0, 600)}`}`);
  if (!ok) failures++;
};

const DEEP = `(sel) => {
  const walk = (root) => {
    const f = root.querySelector(sel);
    if (f) return f;
    for (const el of root.querySelectorAll('*')) if (el.shadowRoot) { const g = walk(el.shadowRoot); if (g) return g; }
    return null;
  };
  return walk(document);
}`;

async function embed(page: Page): Promise<ElementHandle> {
  for (let i = 0; i < 60; i++) {
    const handle = (await page.evaluateHandle(`(${DEEP})('mini-workspace')`)).asElement() as ElementHandle | null;
    if (handle && (await handle.evaluate((el) => !!el.shadowRoot?.querySelector('source-files')))) return handle;
    await pause(100);
  }
  throw new Error('no mini-workspace with a code panel');
}

/** Wait for the embed's panel to show its code in CodeMirror. */
async function editorIn(handle: ElementHandle): Promise<boolean> {
  for (let i = 0; i < 80; i++) {
    const ok = await handle.evaluate(
      (el) => !!el.shadowRoot!.querySelector('source-files')!.shadowRoot!.querySelector('.cm-editor .cm-line'),
    );
    if (ok) return true;
    await pause(100);
  }
  return false;
}

/** Every style, from the panel up through the shadow hosts, that would pin a fixed sheet to an ancestor. */
const TRAPS = `(el) => {
  const found = [];
  let node = el.shadowRoot.querySelector('source-files');
  while (node && node !== document.documentElement) {
    if (node.nodeType === 1) {
      const s = getComputedStyle(node);
      const traps = [
        s.transform !== 'none' && 'transform',
        s.filter !== 'none' && 'filter',
        s.backdropFilter && s.backdropFilter !== 'none' && 'backdrop-filter',
        s.contain !== 'none' && 'contain',
        s.willChange !== 'auto' && 'will-change',
        s.containerType && s.containerType !== 'normal' && 'container-type',
      ].filter(Boolean);
      if (traps.length) found.push((node.tagName || '').toLowerCase() + '.' + (node.className || '') + ': ' + traps.join(','));
    }
    node = node.parentNode instanceof ShadowRoot ? node.parentNode.host : node.parentNode;
  }
  return found;
}`;

const browser = await puppeteer.launch({ headless: 'shell' });
await browser
  .defaultBrowserContext()
  .overridePermissions(APP, ['clipboard-read', 'clipboard-write', 'clipboard-sanitized-write']);
const page = await browser.newPage();
await page.setViewport({ width: 1320, height: 1000 });
page.on('pageerror', (e) => console.log('PAGE ERROR', e.message));

for (const theme of ['light', 'dark']) {
  await page.evaluateOnNewDocument((t) => localStorage.setItem('pathogen-theme', t), theme);

  // ── A blog post's embed ──────────────────────────────────────────────
  await page.goto(`${APP}/blog/heading-turn`, { waitUntil: 'networkidle2' });
  const blog = await embed(page);
  await blog.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  check(`[${theme}] blog: the code shows in CodeMirror, in <source-files>`, await editorIn(blog));
  const shape = await blog.evaluate((el) => {
    const viewer = el.shadowRoot!.querySelector('source-files')!;
    return {
      icon: viewer.shadowRoot!.querySelector('.float .cp')?.getAttribute('aria-label'),
      list: !!viewer.shadowRoot!.querySelector('.list'),
      barCopy: el.shadowRoot!.querySelectorAll('#copy-btn, .glass-bar-inner [data-tip^="Copy"]').length,
      link: !(el.shadowRoot!.querySelector('.playground-link') as HTMLElement).hidden,
    };
  });
  check(
    `[${theme}] blog: the copy icon floats in the panel, "Copy the code"; no Copy in the bar; the ↗ shown`,
    shape.icon === 'Copy the code' && !shape.list && shape.barCopy === 0 && shape.link,
    shape,
  );

  await blog.evaluate((el) =>
    (el.shadowRoot!.querySelector('source-files')!.shadowRoot!.querySelector('.float .cp') as HTMLElement).click(),
  );
  await pause(300);
  const clip = (await page.evaluate(
    `navigator.clipboard.readText().catch((e) => 'read failed: ' + e.message)`,
  )) as string;
  const copied = await blog.evaluate((el) => ({
    sample: el.querySelector('code')?.textContent ?? '',
    tip: el.shadowRoot!.querySelector('source-files')!.shadowRoot!.querySelector('.tip')?.textContent,
  }));
  check(
    `[${theme}] blog: copying puts the sample on the clipboard, then says "Copied the code"`,
    clip === copied.sample && copied.sample.startsWith('define ViewBox') && copied.tip === 'Copied the code',
    { clip: clip.slice(0, 50), tip: copied.tip },
  );

  const trapList = (await page.evaluate(`(${TRAPS})((${DEEP})('mini-workspace'))`)) as string[];
  check(`[${theme}] blog: nothing above the panel pins a fixed sheet to itself`, trapList.length === 0, trapList);

  // Closed: the panel can't take the keyboard.
  const closed = await blog.evaluate((el) => {
    (el.shadowRoot!.querySelector('#summary') as HTMLElement).click();
    (el.shadowRoot!.querySelector('#code-toggle') as HTMLElement).click();
    const viewer = el.shadowRoot!.querySelector('source-files')!;
    const cp = viewer.shadowRoot!.querySelector('.float .cp') as HTMLElement;
    cp.focus();
    return {
      inert: el.shadowRoot!.querySelector('.code-panel')!.hasAttribute('inert'),
      focused: viewer.shadowRoot!.activeElement === cp,
    };
  });
  check(
    `[${theme}] blog: closed, the panel is inert and its copy icon takes no focus`,
    closed.inert && !closed.focused,
    closed,
  );
  await blog.evaluate((el) => (el.shadowRoot!.querySelector('#code-toggle') as HTMLElement).click());
  await pause(500);

  // The header's own theme toggle reaches the panel's editor (light → dark from the light pass).
  if (theme === 'light') {
    const bgOf = (): Promise<string> =>
      blog.evaluate(
        (el) =>
          getComputedStyle(
            el.shadowRoot!.querySelector('source-files')!.shadowRoot!.querySelector('.cm-editor') as HTMLElement,
          ).backgroundColor,
      );
    const before = await bgOf();
    await page.evaluate(`(${DEEP})('theme-toggle').shadowRoot.querySelector('button').click()`);
    await pause(400);
    const after = await bgOf();
    const active = await page.evaluate(`document.documentElement.getAttribute('data-active-theme')`);
    check('the header’s theme toggle reaches the panel’s editor', before !== after && active === 'dark', {
      before,
      after,
      active,
    });
    await page.evaluate(() => localStorage.setItem('pathogen-theme', 'light'));
  }

  // ── A phone ──────────────────────────────────────────────────────────
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await page.goto(`${APP}/blog/heading-turn`, { waitUntil: 'networkidle2' });
  const phone = await embed(page);
  await phone.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await editorIn(phone);
  await pause(400);
  const clear = await phone.evaluate((el) => {
    const a = el.shadowRoot!.querySelector('.playground-link')!.getBoundingClientRect();
    const b = el
      .shadowRoot!.querySelector('source-files')!
      .shadowRoot!.querySelector('.float .cp')!
      .getBoundingClientRect();
    return {
      overlap: !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top),
      gap: Math.round(a.left - b.right),
    };
  });
  check(`[${theme}] phone: the panel's copy icon sits clear of the ↗`, !clear.overlap && clear.gap >= 2, clear);
  await phone.screenshot({ path: `${SHOTS}/2e-step3b2-phone-${theme}.png` });
  await page.setViewport({ width: 1320, height: 1000, deviceScaleFactor: 1 });

  // ── The storybook: several files ─────────────────────────────────────
  await page.goto(`${APP}/storybook/mini-workspace`, { waitUntil: 'networkidle2' });
  await pause(800);
  await page.evaluate(`(${DEEP})('.story-tab[data-story="5"]').click()`);
  await pause(300);
  const several = await embed(page);
  check(`[${theme}] several: the code shows in CodeMirror`, await editorIn(several));
  await pause(300);
  const list = await several.evaluate((el) => {
    const viewer = el.shadowRoot!.querySelector('source-files')!.shadowRoot!;
    return {
      rows: [...viewer.querySelectorAll('.list [data-path]')].map((r) => r.getAttribute('data-path')),
      open: viewer.querySelector('[aria-selected="true"]')?.getAttribute('data-path'),
      first: viewer.querySelector('.cm-line')?.textContent,
      icon: viewer.querySelector('.path .cp')?.getAttribute('aria-label'),
      link: (el.shadowRoot!.querySelector('.playground-link') as HTMLElement).hidden,
    };
  });
  check(
    `[${theme}] several: the list, opening on the program that drew the image; the ↗ hidden`,
    JSON.stringify(list.rows) ===
      JSON.stringify([
        'demos/gears.pathogen',
        'parts/gears.pathogen',
        'parts/kit.pathogen',
        'main.pathogen',
        'pathogen.json',
      ]) &&
      list.open === 'demos/gears.pathogen' &&
      list.first === 'import { gear } from "../parts/gears.pathogen";' &&
      list.icon === 'Copy demos/gears.pathogen' &&
      list.link,
    list,
  );
  await several.screenshot({ path: `${SHOTS}/2e-step3b2-several-${theme}.png` });

  // Close the code, then open it, watching every few milliseconds: the menu never shows.
  const watched = (await several.evaluate(async (el) => {
    el.removeAttribute('code-open');
    await new Promise((r) => setTimeout(r, 500));
    el.setAttribute('code-open', '');
    const host = el.shadowRoot!.querySelector('source-files')!;
    const viewer = host.shadowRoot!;
    let menu = 0;
    let samples = 0;
    // Widths the panel passed through that a viewer following every frame would call narrow.
    let narrowWidths = 0;
    const end = performance.now() + 800;
    while (performance.now() < end) {
      samples += 1;
      if (viewer.querySelector('.menu')) menu += 1;
      const width = host.getBoundingClientRect().width;
      if (width >= 120 && width < 480) narrowWidths += 1;
      await new Promise((r) => setTimeout(r, 10));
    }
    return { menu, samples, narrowWidths, list: !!viewer.querySelector('.list') };
  })) as { menu: number; samples: number; narrowWidths: number; list: boolean };
  check(
    `[${theme}] several: opening the code passes through narrow widths, and never shows the menu midway`,
    watched.menu === 0 && watched.narrowWidths > 0 && watched.list,
    watched,
  );

  await page.evaluate(`(${DEEP})('.story-tab[data-story="6"]').click()`);
  await pause(300);
  const narrow = await embed(page);
  await editorIn(narrow);
  await pause(400);
  const menu = await narrow.evaluate((el) => {
    const viewer = el.shadowRoot!.querySelector('source-files')!.shadowRoot!;
    return { menu: viewer.querySelector('.menu .p')?.textContent, list: !!viewer.querySelector('.list') };
  });
  check(
    `[${theme}] a narrow panel: the menu, naming the open file`,
    menu.menu === 'demos/gears.pathogen' && !menu.list,
    menu,
  );
  await narrow.screenshot({ path: `${SHOTS}/2e-step3b2-narrow-${theme}.png` });
}

await browser.close();
console.log(failures === 0 ? '\nall passed' : `\n${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
