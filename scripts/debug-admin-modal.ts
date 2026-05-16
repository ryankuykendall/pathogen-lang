// Diagnostic: load /admin/moderation, sign in as the seed admin, click
// Review on a pending card, and dump the resulting modal's computed
// styles + DOM so we can see why mini-workspace isn't rendering
// correctly. Read-only — no fixes applied here.
//
// Prereqs:
//   - npm run dev:stack running (Pages :3000, API :8787)
//   - npm run seed:dev applied
//
// Usage:
//   tsx scripts/debug-admin-modal.ts [--pages-url http://localhost:3000]

import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Command } from 'commander';
import puppeteer from 'puppeteer';

const __dirname = dirname(fileURLToPath(import.meta.url));
const API_DIR = join(__dirname, '..', 'api');

const SEED_ADMIN_ID = '2b3a98582b3a98582b3a98582b3a9858';
const DEBUG_TOKEN = 'puppeteer-debug-' + Math.random().toString(36).slice(2, 10);

function installSession(): void {
  // Wipe any previous debug sessions and install a fresh one. 1-day TTL
  // is plenty for an interactive script.
  const nowMs = Date.now();
  const expires = nowMs + 86_400_000;
  execFileSync(
    'npx',
    [
      'wrangler',
      'd1',
      'execute',
      'svg-path-extended-users',
      '--local',
      '--persist-to=../.wrangler/state',
      '--command',
      `DELETE FROM sessions WHERE token LIKE 'puppeteer-debug-%';
       INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES ('${DEBUG_TOKEN}', '${SEED_ADMIN_ID}', ${nowMs}, ${expires});`,
    ],
    { cwd: API_DIR, stdio: ['pipe', 'pipe', 'inherit'] },
  );
}

const program = new Command();
program
  .name('debug-admin-modal')
  .option('--pages-url <url>', 'Pages dev URL', 'http://localhost:3000')
  .option('--api-url <url>', 'API dev URL', 'http://localhost:8787')
  .option('--screenshot <path>', 'Save screenshot here', '/tmp/admin-modal-debug.png')
  .action(async (opts: { pagesUrl: string; apiUrl: string; screenshot: string }) => {
    console.log('Installing puppeteer admin session...');
    installSession();

    const browser = await puppeteer.launch({
      headless: true,
      defaultViewport: { width: 1400, height: 1000 },
    });
    try {
      const page = await browser.newPage();

      // Capture console + uncaught errors from the page so we see them
      // inline with the diagnostic.
      page.on('console', (msg) => {
        const type = msg.type();
        if (type === 'error' || type === 'warning' || type === 'warn') {
          console.log(`  [page ${type}]`, msg.text());
        }
      });
      page.on('pageerror', (err) => console.log('  [pageerror]', err.message));

      // Set the session cookie on the API origin BEFORE navigating, so the
      // first /me call from the playground resolves to our admin user.
      // Cookies are per-domain — we need the cookie scoped to the API
      // host (localhost:8787) since the playground hits the API for /me.
      const apiOrigin = new URL(opts.apiUrl);
      const pagesOrigin = new URL(opts.pagesUrl);
      await page.setCookie(
        {
          name: 'pathogen_session',
          value: DEBUG_TOKEN,
          domain: apiOrigin.hostname,
          path: '/',
          httpOnly: false, // puppeteer flag; doesn't affect Set-Cookie shape
          secure: false,
          sameSite: 'Lax',
        },
        {
          name: 'pathogen_session',
          value: DEBUG_TOKEN,
          domain: pagesOrigin.hostname,
          path: '/',
          httpOnly: false,
          secure: false,
          sameSite: 'Lax',
        },
      );

      // Shim tsx's __name codegen so inline page.evaluate functions don't
      // ReferenceError when transpiled. The helper just returns the fn
      // unchanged; only used by tsx for source-map labeling.
      await page.evaluateOnNewDocument(() => {
        (window as unknown as { __name?: <T>(fn: T) => T }).__name = <T>(fn: T): T => fn;
      });

      console.log(`Navigating to ${opts.pagesUrl}/admin/moderation ...`);
      await page.goto(`${opts.pagesUrl}/admin/moderation`, {
        waitUntil: 'networkidle2',
        timeout: 30_000,
      });

      // Helper to dig the admin view out of app-shell's shadow root.
      const getAdminViewHandle = (): Promise<unknown> =>
        page.evaluateHandle(() => {
          const shell = document.querySelector('app-shell');
          return shell?.shadowRoot?.querySelector('admin-moderation-view') ?? null;
        });

      // Wait up to 10s for the SPA to define + mount the view.
      await page.waitForFunction(
        () => {
          const shell = document.querySelector('app-shell');
          return !!shell?.shadowRoot?.querySelector('admin-moderation-view');
        },
        { timeout: 10_000 },
      );
      const initialDom = await page.evaluate(() => {
        const shell = document.querySelector('app-shell');
        const adminView = shell?.shadowRoot?.querySelector('admin-moderation-view');
        return {
          title: document.title,
          hasAppShell: !!shell,
          hasAdminView: !!adminView,
          isActive: adminView?.classList.contains('active') ?? false,
          adminViewShadow: !!adminView?.shadowRoot,
          hasPathogenLang: !!(window as unknown as { PathogenLang?: unknown }).PathogenLang,
          currentView: ((window as unknown as { __store__?: { get: (k: string) => unknown } }).__store__?.get('currentView')) ?? '(no exported store)',
        };
      });
      console.log('Initial DOM state:', initialDom);
      // Give the view a moment to populate the queues + compile thumbs.
      await new Promise((r) => setTimeout(r, 2000));

      // Snapshot tab labels + counts before clicking Review.
      const tabStatus = await page.evaluate(() => {
        const shell = document.querySelector('app-shell');
        const view = shell?.shadowRoot?.querySelector('admin-moderation-view');
        if (!view?.shadowRoot) return { error: 'no admin view shadow root' };
        const tabs = Array.from(view.shadowRoot.querySelectorAll('.tab')).map(
          (b) => (b as HTMLElement).textContent?.trim() ?? '',
        );
        const isAdmin = !view.shadowRoot.querySelector('.notice');
        return { isAdmin, tabs };
      });
      console.log('Admin view state:', tabStatus);

      // Click the first Review button on the Pending tab.
      const reviewClicked = await page.evaluate(() => {
        const shell = document.querySelector('app-shell');
        const view = shell?.shadowRoot?.querySelector('admin-moderation-view');
        if (!view?.shadowRoot) return { ok: false };
        const btn = view.shadowRoot.querySelector(
          '[data-action="review"]',
        ) as HTMLElement | null;
        if (!btn) return { ok: false };
        const card = btn.closest('li.card');
        const title = card?.querySelector('.card-title')?.textContent?.trim();
        const id = btn.getAttribute('data-id');
        btn.click();
        return { ok: true, title, id };
      });
      console.log('Review button clicked:', reviewClicked);
      if (!reviewClicked) {
        console.log('No pending entries to review. Aborting.');
        return;
      }

      // Wait for the modal mini-workspace to mount + compile.
      await new Promise((r) => setTimeout(r, 3000));

      // Diagnostic dump of the modal: backdrop, modal, body, mini-workspace.
      const modalReport = await page.evaluate(() => {
        const shell = document.querySelector('app-shell');
        const view = shell?.shadowRoot?.querySelector('admin-moderation-view');
        if (!view?.shadowRoot) return { error: 'no admin view shadow root' };

        const dim = (el: Element | null): string => {
          if (!el) return 'null';
          const r = el.getBoundingClientRect();
          return `${Math.round(r.width)}x${Math.round(r.height)}`;
        };
        const describe = (el: Element | null): Record<string, string> | null => {
          if (!el) return null;
          const cs = getComputedStyle(el);
          return {
            tag: el.tagName.toLowerCase(),
            dim: dim(el),
            bg: cs.backgroundColor,
            color: cs.color,
            font: cs.fontFamily.slice(0, 60),
            display: cs.display,
            position: cs.position,
            z: cs.zIndex,
            'var(--bg-elevated)': cs.getPropertyValue('--bg-elevated').trim() || '(unset)',
            'var(--text-primary)': cs.getPropertyValue('--text-primary').trim() || '(unset)',
            'var(--accent-color)': cs.getPropertyValue('--accent-color').trim() || '(unset)',
            'var(--border-color)': cs.getPropertyValue('--border-color').trim() || '(unset)',
          };
        };

        const backdrop = view.shadowRoot.querySelector('.modal-backdrop');
        const modal = view.shadowRoot.querySelector('.modal');
        const body = view.shadowRoot.querySelector('.modal-body');
        const compiling = view.shadowRoot.querySelector('.modal-compiling');
        const failed = view.shadowRoot.querySelector('.modal-failed');
        const mw = view.shadowRoot.querySelector('mini-workspace');

        const mwInternals: Record<string, unknown> = {};
        if (mw?.shadowRoot) {
          const firstChild = mw.shadowRoot.firstElementChild;
          mwInternals['first-child'] = firstChild
            ? {
                tag: firstChild.tagName.toLowerCase(),
                className: (firstChild as HTMLElement).className,
                dim: dim(firstChild),
              }
            : null;
          const preview = mw.shadowRoot.querySelector('mini-preview');
          const cmHost = mw.shadowRoot.querySelector('.cm-editor');
          mwInternals['mini-preview'] = preview ? { dim: dim(preview) } : null;
          mwInternals['cm-editor'] = cmHost ? { dim: dim(cmHost) } : null;
          if (preview?.shadowRoot) {
            const svg = preview.shadowRoot.querySelector('svg');
            mwInternals['mini-preview svg'] = svg ? { dim: dim(svg) } : null;
          }
        }

        return {
          themeAttr: document.documentElement.getAttribute('data-active-theme'),
          backdrop: describe(backdrop),
          modal: describe(modal),
          body: describe(body),
          compiling: describe(compiling),
          failed: describe(failed),
          'mini-workspace': describe(mw),
          mwInternals,
        };
      });

      console.log('\n=== Modal diagnostic ===');
      console.log(JSON.stringify(modalReport, null, 2));

      // Wait an extra second for the iframe + CodeMirror to settle, then
      // dig into the iframe document so we can see what the preview is
      // actually rendering.
      await new Promise((r) => setTimeout(r, 1500));
      const iframeReport = await page.evaluate(() => {
        const shell = document.querySelector('app-shell');
        const view = shell?.shadowRoot?.querySelector('admin-moderation-view');
        const mw = view?.shadowRoot?.querySelector('mini-workspace');
        if (!mw?.shadowRoot) return { error: 'no mini-workspace shadow' };
        const dim = (el: Element | null): string => {
          if (!el) return 'null';
          const r = el.getBoundingClientRect();
          return `${Math.round(r.width)}x${Math.round(r.height)}`;
        };
        // Walk the mini-workspace's direct shadow children to see what
        // takes up the host height. content-area being 200px instead of
        // ~570px is the symptom we're tracking.
        const childWalk: Record<string, string> = {};
        if (mw.shadowRoot) {
          const root = mw.shadowRoot;
          root.querySelectorAll(':host > *, [class]').forEach((el) => {
            const node = el as HTMLElement;
            if (!node.className) return;
            const cs = getComputedStyle(node);
            childWalk[`${node.tagName.toLowerCase()}.${node.className}`] = `${dim(node)} flex=${cs.flex} display=${cs.display}`;
          });
        }
        const hostCs = getComputedStyle(mw);
        // Pierce mini-preview's shadow → iframe → document
        const preview = mw.shadowRoot.querySelector('mini-preview');
        const iframe = preview?.shadowRoot?.querySelector('#preview-frame') as HTMLIFrameElement | null;
        const idoc = iframe?.contentDocument;
        const previewSvg = idoc?.getElementById('preview') as unknown as SVGSVGElement | null;
        const contentGroup = idoc?.getElementById('preview-content');

        const contentArea = mw.shadowRoot.querySelector('.content-area');
        const codePanel = mw.shadowRoot.querySelector('.code-panel');
        const previewPanel = mw.shadowRoot.querySelector('.preview-panel');

        return {
          codeOpenAttr: mw.hasAttribute('code-open'),
          hostCss: `display=${hostCs.display} flexDir=${hostCs.flexDirection} height=${hostCs.height} maxHeight=${hostCs.maxHeight} minHeight=${hostCs.minHeight}`,
          hostHeight: dim(mw),
          childWalk,
          contentArea: dim(contentArea),
          contentAreaGridCols: contentArea ? getComputedStyle(contentArea).gridTemplateColumns : '',
          codePanel: dim(codePanel),
          previewPanel: dim(previewPanel),
          iframe: iframe ? dim(iframe) : 'null',
          previewSvgAttrs: previewSvg
            ? {
                width: previewSvg.getAttribute('width'),
                height: previewSvg.getAttribute('height'),
                viewBox: previewSvg.getAttribute('viewBox'),
                cssDim: dim(previewSvg),
              }
            : null,
          contentGroupChildren: contentGroup ? contentGroup.children.length : 'no-group',
          contentGroupFirstTag:
            contentGroup && contentGroup.firstElementChild
              ? contentGroup.firstElementChild.tagName.toLowerCase()
              : 'none',
        };
      });
      console.log('\n=== Iframe / mini-preview internals ===');
      console.log(JSON.stringify(iframeReport, null, 2));

      // Drop in a separate compile via the page's library so we can see
      // what's actually coming back. Uses the same source code the admin
      // view would, captured via the queue API.
      const standaloneCompile = await page.evaluate(async () => {
        const lib = (window as unknown as {
          PathogenLang?: {
            compile?: (s: string) => unknown;
            compileWithContext?: (s: string) => unknown;
            generateSvg?: (r: unknown, o: unknown) => string;
          };
        }).PathogenLang;
        if (!lib) return { error: 'no PathogenLang global' };
        const code = '// viewBox="0 0 200 200"\ncircle(100, 100, 60);\n';
        try {
          const ctxResult = lib.compileWithContext ? lib.compileWithContext(code) : null;
          const plainResult = lib.compile ? lib.compile(code) : null;
          const svgFromCtx = lib.generateSvg && ctxResult
            ? lib.generateSvg(ctxResult, { viewBox: '0 0 200 200', width: '200', height: '200' })
            : '(no generateSvg or ctxResult)';
          const svgFromPlain = lib.generateSvg && plainResult
            ? lib.generateSvg(plainResult, { viewBox: '0 0 200 200', width: '200', height: '200' })
            : '(no generateSvg or plainResult)';
          const ctxKeys = ctxResult ? Object.keys(ctxResult as Record<string, unknown>) : [];
          const ctxLayers = ctxResult
            ? ((ctxResult as { layers?: unknown[] }).layers || []).length
            : -1;
          const firstLayer = ctxResult
            ? JSON.stringify(((ctxResult as { layers?: unknown[] }).layers || [])[0]).slice(0, 200)
            : null;
          return {
            ctxKeys,
            ctxLayers,
            firstLayer,
            svgFromCtxPreview: typeof svgFromCtx === 'string' ? svgFromCtx.slice(0, 250) : svgFromCtx,
            svgFromPlainPreview:
              typeof svgFromPlain === 'string' ? svgFromPlain.slice(0, 250) : svgFromPlain,
          };
        } catch (err) {
          return { error: (err as Error).message };
        }
      });
      console.log('\n=== Standalone compile probe ===');
      console.log(JSON.stringify(standaloneCompile, null, 2));

      // Run the same admin-side path: compilerWorker.compileWithContext
      // (resolves via Web Worker). This is what the actual modal uses,
      // so it should reveal the worker round-trip mutation.
      const workerProbe = await page.evaluate(async () => {
        // Dynamic-import the playground's worker wrapper. Path matches
        // the built layout: public/services/compiler-worker.js.
        try {
          const mod = (await import(/* @vite-ignore */ '/services/compiler-worker.js')) as {
            default?: { compileWithContext?: (s: string, id: number, isStale?: unknown) => Promise<unknown> };
            compileWithContext?: (s: string, id: number, isStale?: unknown) => Promise<unknown>;
          };
          const fn = mod.compileWithContext || mod.default?.compileWithContext;
          if (!fn) return { error: 'compileWithContext not exported' };
          const code = '// viewBox="0 0 200 200"\ncircle(100, 100, 60);\n';
          const result = (await fn(code, 1, undefined)) as Record<string, unknown> & {
            layers?: Array<Record<string, unknown>>;
          };
          return {
            keys: Object.keys(result),
            layersCount: (result.layers || []).length,
            firstLayer: JSON.stringify(result.layers?.[0]).slice(0, 240),
          };
        } catch (err) {
          return { error: (err as Error).message };
        }
      });
      console.log('\n=== Worker compile probe (via compiler-worker.js) ===');
      console.log(JSON.stringify(workerProbe, null, 2));

      // Exact replica of admin-moderation-view._compileSvg path: pump
      // the same code through `compilerWorker.compileWithContext` AND
      // then `window.PathogenLang.generateSvg`, and inspect the
      // resulting SVG string. If THIS path produces an empty d, the
      // bug is in how we feed the worker result into generateSvg.
      const combinedProbe = await page.evaluate(async () => {
        try {
          const mod = (await import(/* @vite-ignore */ '/services/compiler-worker.js')) as {
            default?: { compileWithContext?: (s: string, id: number, isStale?: unknown) => Promise<unknown> };
            compileWithContext?: (s: string, id: number, isStale?: unknown) => Promise<unknown>;
          };
          const fn = mod.compileWithContext || mod.default?.compileWithContext;
          const lib = (window as unknown as {
            PathogenLang?: { generateSvg?: (r: unknown, o: unknown) => string };
          }).PathogenLang;
          if (!fn || !lib?.generateSvg) return { error: 'missing fn/lib' };
          const code = '// viewBox="0 0 200 200"\ncircle(100, 100, 60);\n';
          const result = await fn(code, 1, undefined);
          const svgString = lib.generateSvg(result, {
            viewBox: '0 0 200 200',
            width: '200',
            height: '200',
          });
          // Quick path-d extraction.
          const pathDMatch = svgString.match(/<path[^>]*\sd="([^"]*)"/);
          return {
            svgPreview: svgString.slice(0, 300),
            pathD: pathDMatch ? pathDMatch[1] : '(no path d match)',
            resultLayerData: (() => {
              const r = result as { layers?: Array<{ data?: string }> };
              return r.layers?.[0]?.data ?? '(no layer)';
            })(),
          };
        } catch (err) {
          return { error: (err as Error).message };
        }
      });
      console.log('\n=== Combined: worker + generateSvg (mirrors admin path) ===');
      console.log(JSON.stringify(combinedProbe, null, 2));

      // Look at the actual SVG string that mini-workspace was handed by
      // the admin moderation view. mini-workspace exposes its
      // `_svgContent` as a private field, but we can read it off the
      // light-DOM <svg> child it picked up at connection time.
      const modalSvgString = await page.evaluate(() => {
        const shell = document.querySelector('app-shell');
        const view = shell?.shadowRoot?.querySelector('admin-moderation-view');
        const mw = view?.shadowRoot?.querySelector('mini-workspace');
        if (!mw) return { error: 'no mini-workspace' };
        const svgChild = mw.querySelector('svg');
        const codeChild = mw.querySelector('code');
        return {
          svgChildExists: !!svgChild,
          svgChildOuter: svgChild ? svgChild.outerHTML.slice(0, 400) : null,
          codeChildText: codeChild ? codeChild.textContent : null,
        };
      });
      console.log('\n=== mini-workspace light-DOM children (what admin view rendered) ===');
      console.log(JSON.stringify(modalSvgString, null, 2));

      const innerSvg = await page.evaluate(() => {
        const shell = document.querySelector('app-shell');
        const view = shell?.shadowRoot?.querySelector('admin-moderation-view');
        const mw = view?.shadowRoot?.querySelector('mini-workspace');
        const preview = mw?.shadowRoot?.querySelector('mini-preview');
        const iframe = preview?.shadowRoot?.querySelector('#preview-frame') as HTMLIFrameElement | null;
        const idoc = iframe?.contentDocument;
        const previewSvg = idoc?.getElementById('preview') as unknown as SVGSVGElement | null;
        if (!previewSvg) return { error: 'no preview svg' };
        const cs = getComputedStyle(previewSvg);
        const inlineStyle = previewSvg.getAttribute('style');
        // Sample the first child of preview-content to see its transform / d attribute
        const child = idoc?.getElementById('preview-content')?.firstElementChild;
        return {
          previewSvg: {
            cs_width: cs.width,
            cs_height: cs.height,
            cs_position: cs.position,
            cs_translate: cs.translate,
            inlineStyle,
            outerHTML: previewSvg.outerHTML.slice(0, 400),
          },
          firstChild: child
            ? {
                tag: child.tagName.toLowerCase(),
                d: child.getAttribute('d'),
                transform: child.getAttribute('transform'),
                bbox: (child as SVGGraphicsElement).getBBox
                  ? (() => {
                      const b = (child as SVGGraphicsElement).getBBox();
                      return `${b.x},${b.y} ${b.width}x${b.height}`;
                    })()
                  : 'no-getBBox',
              }
            : null,
        };
      });
      console.log('\n=== Inner SVG ===');
      console.log(JSON.stringify(innerSvg, null, 2));

      await page.screenshot({ path: opts.screenshot, fullPage: false });
      console.log(`\nScreenshot saved to ${opts.screenshot}`);
    } finally {
      await browser.close();
      // Clean up the debug session.
      execFileSync(
        'npx',
        [
          'wrangler',
          'd1',
          'execute',
          'svg-path-extended-users',
          '--local',
          '--command',
          "DELETE FROM sessions WHERE token LIKE 'puppeteer-debug-%';",
        ],
        { cwd: API_DIR, stdio: ['pipe', 'pipe', 'inherit'] },
      );
    }
  });
program.parse();
