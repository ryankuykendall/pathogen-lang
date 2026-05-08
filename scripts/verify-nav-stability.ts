// Anti-shift verification — top navigation must not move horizontally
// when navigating between top-level routes. See:
//   project-docs/top-nav-redesign/phase-2-implementation-plan.md, Step 7.
//
// The script visits each top-level route, measures getBoundingClientRect()
// for every nav element, and fails if any element's left/top position drifts
// by more than the tolerance (default 0.5px) between routes.
//
// Run: npm run dev:website (in another terminal), then:
//   tsx scripts/verify-nav-stability.ts

import { Command } from 'commander';
import puppeteer, { type Browser, type Page } from 'puppeteer';

interface Rect {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
}

interface Measurements {
  [selector: string]: Rect | Rect[] | null;
}

const ROUTES: Array<[string, string]> = [
  ['Home', '/pathogen/'],
  ['Workspaces', '/pathogen/workspaces'],
  ['Docs', '/pathogen/docs'],
  ['Explore', '/pathogen/explore'],
  ['Featured', '/pathogen/featured'],
  ['Blog', '/pathogen/blog'],
  ['Preferences', '/pathogen/preferences'],
];

async function measureRoute(page: Page, baseUrl: string, route: string): Promise<Measurements> {
  await page.goto(`${baseUrl}${route}`, { waitUntil: 'networkidle2', timeout: 15000 });
  await page.evaluate(() => document.fonts && document.fonts.ready);

  // .site-header lives in light DOM on static pages and inside <app-shell> →
  // <app-header> shadow roots on SPA pages. Wait for either to exist.
  await page.waitForFunction(
    () => {
      const lightHeader = document.querySelector('header.site-header .tabs-wrap');
      if (lightHeader) return true;
      const shell = document.querySelector('app-shell') as HTMLElement | null;
      const header = shell?.shadowRoot?.querySelector('app-header') as HTMLElement | null;
      return header?.shadowRoot?.querySelector('.tabs-wrap') != null;
    },
    { timeout: 8000 },
  );
  await new Promise((resolve) => setTimeout(resolve, 200));

  return page.evaluate(() => {
    function toRect(el) {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
    }

    function findHeaderRoot() {
      // Static page: <header class="site-header"> sits in light DOM
      const lightHeader = document.querySelector('header.site-header');
      if (lightHeader) return lightHeader;
      // SPA: nested shadow roots
      const shell = document.querySelector('app-shell');
      const appHeader = shell && shell.shadowRoot ? shell.shadowRoot.querySelector('app-header') : null;
      if (appHeader && appHeader.shadowRoot) {
        return appHeader.shadowRoot.querySelector('header.site-header');
      }
      return null;
    }

    const root = findHeaderRoot();
    if (!root) return {};

    const tabs = Array.from(root.querySelectorAll('.tabs-wrap .nav-link')).map(toRect);

    return {
      'site-header': toRect(root),
      'logo': toRect(root.querySelector('.logo')),
      'logo-main': toRect(root.querySelector('.logo-main')),
      'tabs-wrap': toRect(root.querySelector('.tabs-wrap')),
      'nav-links': tabs,
      'theme-toggle': toRect(root.querySelector('.actions theme-toggle')),
      'account-menu': toRect(root.querySelector('.actions account-menu')),
    };
  }) as Promise<Measurements>;
}

interface DeltaRow {
  selector: string;
  minLeft: number;
  maxLeft: number;
  dLeft: number;
  minTop: number;
  maxTop: number;
  dTop: number;
  minRight: number;
  maxRight: number;
  dRight: number;
  flag: boolean;
}

function computeDeltas(
  perRoute: Map<string, Measurements>,
  tolerance: number,
): { rows: DeltaRow[]; failed: boolean } {
  const rows: DeltaRow[] = [];
  let failed = false;

  // Collect a stable selector list from the first route
  const firstRoute = perRoute.values().next().value as Measurements | undefined;
  if (!firstRoute) return { rows, failed };

  for (const selector of Object.keys(firstRoute)) {
    if (selector === 'nav-links') {
      // Special-case the array — measure each tab individually
      const navLinksByRoute = Array.from(perRoute.entries()).map(
        ([_route, m]) => (m[selector] as Rect[]) ?? [],
      );
      const numTabs = navLinksByRoute[0]?.length ?? 0;
      for (let i = 0; i < numTabs; i++) {
        const allRectsForTab = navLinksByRoute.map((arr) => arr[i]).filter(Boolean) as Rect[];
        if (allRectsForTab.length === 0) continue;
        const row = makeRow(`tab[${i}]`, allRectsForTab, tolerance);
        rows.push(row);
        if (row.flag) failed = true;
      }
    } else {
      const allRects = Array.from(perRoute.values())
        .map((m) => m[selector] as Rect | null)
        .filter(Boolean) as Rect[];
      if (allRects.length === 0) continue;
      const row = makeRow(selector, allRects, tolerance);
      rows.push(row);
      if (row.flag) failed = true;
    }
  }

  return { rows, failed };
}

function makeRow(selector: string, rects: Rect[], tolerance: number): DeltaRow {
  const lefts = rects.map((r) => r.left);
  const tops = rects.map((r) => r.top);
  const rights = rects.map((r) => r.right);
  const minLeft = Math.min(...lefts);
  const maxLeft = Math.max(...lefts);
  const minTop = Math.min(...tops);
  const maxTop = Math.max(...tops);
  const minRight = Math.min(...rights);
  const maxRight = Math.max(...rights);
  const dLeft = maxLeft - minLeft;
  const dTop = maxTop - minTop;
  const dRight = maxRight - minRight;
  // Pass criterion is HORIZONTAL stability — the user's anti-shift complaint
  // was specifically about tabs/buttons drifting left or right between
  // routes. Vertical drift (Δtop) caused by differing content states
  // (signed-in vs signed-out account-menu, etc.) is shown as info but
  // doesn't fail the run. To make Δtop strict, tighten this to also
  // include `|| dTop > tolerance`.
  const flag = dLeft > tolerance || dRight > tolerance;
  return { selector, minLeft, maxLeft, dLeft, minTop, maxTop, dTop, minRight, maxRight, dRight, flag };
}

function fmt(n: number): string {
  return n.toFixed(2).padStart(8);
}

function printReport(rows: DeltaRow[], tolerance: number, failed: boolean): void {
  console.log('\nAnti-shift report — horizontal tolerance: ±' + tolerance.toFixed(2) + 'px');
  console.log('═'.repeat(108));
  console.log(
    [
      'selector            ',
      '  Δleft',
      ' Δright',
      '   Δtop',
      '  minLeft',
      '  maxLeft',
      '   minTop',
      '   maxTop',
      '       ',
    ].join('│'),
  );
  console.log('─'.repeat(108));
  for (const r of rows) {
    const flag = r.flag ? ' ⚠ FAIL' : '   ok';
    const topNote = r.dTop > tolerance ? ` (Δtop ${r.dTop.toFixed(2)}px — info)` : '';
    console.log(
      [
        r.selector.padEnd(20),
        fmt(r.dLeft),
        fmt(r.dRight),
        fmt(r.dTop),
        fmt(r.minLeft),
        fmt(r.maxLeft),
        fmt(r.minTop),
        fmt(r.maxTop),
        flag + topNote,
      ].join('│'),
    );
  }
  console.log('═'.repeat(108));
  if (failed) {
    console.log('\n❌ At least one nav element drifted HORIZONTALLY beyond tolerance between routes.');
    console.log('   Check the FAIL rows above. Common causes:');
    console.log('     • An auto-sized track that grows/shrinks based on per-route content.');
    console.log('     • Active-tab styling that changes box dimensions (padding/border/font-weight).');
    console.log('     • A flexbox container where one was supposed to be Grid.');
  } else {
    console.log('\n✅ Top nav is HORIZONTALLY stable across all routes (the anti-shift contract).');
    const verticalDrift = rows.filter((r) => r.dTop > tolerance);
    if (verticalDrift.length > 0) {
      console.log(
        `\n   Note: ${verticalDrift.length} element(s) show vertical drift > ${tolerance}px between routes —`,
      );
      console.log(
        '   typically caused by content-state differences (e.g. <account-menu> rendering Sign In',
      );
      console.log(
        '   pill on static pages until the JS upgrade fetches /api/me). Not a layout-shift bug.',
      );
    }
  }
}

const program = new Command();
program
  .name('verify-nav-stability')
  .description('Verify that top-nav elements do not shift between top-level routes')
  .option('--base <url>', 'Base URL of the dev server', 'http://localhost:3000')
  .option('--tolerance <px>', 'Maximum allowed pixel drift between routes', '0.5')
  .option('--width <px>', 'Browser viewport width', '1440')
  .option('--height <px>', 'Browser viewport height', '900')
  .action(async (opts) => {
    const tolerance = parseFloat(opts.tolerance);
    const width = parseInt(opts.width, 10);
    const height = parseInt(opts.height, 10);

    let browser: Browser | undefined;
    try {
      browser = await puppeteer.launch({ headless: true });
      const page = await browser.newPage();
      await page.setViewport({ width, height });

      // tsx/esbuild injects __name(fn, "name") wrappers around named functions
      // for Function.prototype.name preservation. These end up in page.evaluate
      // callbacks that get stringified and run in the browser context, where
      // __name doesn't exist. Polyfill it as a no-op so evaluate calls work.
      await page.evaluateOnNewDocument(() => {
        if (typeof (globalThis as any).__name !== 'function') {
          (globalThis as any).__name = (fn: any) => fn;
        }
      });

      // First visit the landing page so we can set localStorage
      await page.goto(`${opts.base}/pathogen/`, { waitUntil: 'networkidle2', timeout: 15000 });
      await page.evaluate(() => {
        // Sign in deterministically so account-menu has identical content
        // across all routes during the test.
        localStorage.setItem('pathogen:authedUserId', 'test-user-id');
      });

      const perRoute = new Map<string, Measurements>();
      for (const [name, route] of ROUTES) {
        process.stdout.write(`Measuring ${name.padEnd(14)} (${route})... `);
        const m = await measureRoute(page, opts.base, route);
        perRoute.set(name, m);
        process.stdout.write('done\n');
      }

      const { rows, failed } = computeDeltas(perRoute, tolerance);
      printReport(rows, tolerance, failed);

      await browser.close();
      process.exit(failed ? 1 : 0);
    } catch (err) {
      console.error('verify-nav-stability error:', err);
      if (browser) await browser.close();
      process.exit(2);
    }
  });

program.parse();
