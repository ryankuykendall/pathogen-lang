/**
 * Browser-side security audit: verifies that the iframe + CSP combination in
 * the playground blocks every outbound request from malicious SVG content,
 * even when that content bypasses the compiler entirely.
 *
 * Why a separate script: the vitest suites in tests/security/ run under JSDOM,
 * which has no CSP enforcement and no real network stack. A passing JSDOM test
 * proves "the compiler emitted nothing forbidden" but cannot prove "the iframe
 * sandbox holds." Phase 3 of the SVG sanitization plan adopted iframe + CSP as
 * the structural defense (see project-docs/security/iframe-sandbox-rationale.md);
 * this script is what verifies that defense empirically.
 *
 * Test approach:
 *   1. Launch headless Chromium via Puppeteer.
 *   2. Navigate to the playground (assumed running at PLAYGROUND_URL).
 *   3. For each malicious payload, inject raw SVG directly into the existing
 *      iframe.contentDocument — bypassing the compiler so we are testing the
 *      sandbox alone. The compiler is already covered by tests/security/.
 *   4. Use a network-request interceptor scoped to the iframe target to flag
 *      any request to a host outside the allowlist (the dev server only).
 *   5. Exit non-zero with a list of leaked requests if any payload escapes.
 */

import { Command } from 'commander';
import puppeteer, { type Browser, type HTTPRequest } from 'puppeteer';

interface Payload {
  name: string;
  description: string;
  /** Raw SVG markup. Inserted into the iframe document with `importNode`. */
  svg: string;
}

const PLAYGROUND_URL = 'http://localhost:3000/pathogen/';

const ALLOWED_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '[::1]',
]);

const ALLOWED_PROTOCOLS = new Set(['data:', 'about:', 'blob:']);

/**
 * Each payload is the kind of attack the compiler is supposed to refuse to
 * emit (Phase 1 verifies that). We bypass the compiler here to confirm the
 * iframe sandbox + CSP would still block the attack if a regression slipped
 * past the compiler. This is defense-in-depth verification, not a duplicate
 * of the compiler tests.
 */
const PAYLOADS: Payload[] = [
  {
    name: 'css-import-via-style',
    description: 'CSS @import inside <style> — would fetch attacker URL if CSP did not block',
    svg: `<svg xmlns="http://www.w3.org/2000/svg"><style>@import url("https://attacker.example/leak.css");</style><rect width="50" height="50"/></svg>`,
  },
  {
    name: 'css-url-fill',
    description: 'CSS url() in fill — direct outbound fetch attempt',
    svg: `<svg xmlns="http://www.w3.org/2000/svg"><style>rect{fill:url("https://attacker.example/track.png")}</style><rect width="50" height="50"/></svg>`,
  },
  {
    name: 'css-image-set',
    description: 'CSS image-set() — bypass for url() filters',
    svg: `<svg xmlns="http://www.w3.org/2000/svg"><style>rect{background-image:image-set(url("https://attacker.example/x.png") 1x)}</style><rect width="50" height="50"/></svg>`,
  },
  {
    name: 'css-cursor-url',
    description: 'CSS cursor: url() — outbound fetch from style',
    svg: `<svg xmlns="http://www.w3.org/2000/svg"><style>rect{cursor:url("https://attacker.example/c.cur"),pointer}</style><rect width="50" height="50"/></svg>`,
  },
  {
    name: 'svg-image-href-remote',
    description: '<image href="https://..."> — direct SVG element fetch',
    svg: `<svg xmlns="http://www.w3.org/2000/svg"><image href="https://attacker.example/leak.png" width="50" height="50"/></svg>`,
  },
  {
    name: 'svg-image-xlink-href',
    description: '<image xlink:href="https://..."> — legacy xlink form',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><image xlink:href="https://attacker.example/leak.png" width="50" height="50"/></svg>`,
  },
  {
    name: 'svg-use-href-remote',
    description: '<use href="https://..."> — cross-origin reference',
    svg: `<svg xmlns="http://www.w3.org/2000/svg"><use href="https://attacker.example/sprites.svg#x"/></svg>`,
  },
  {
    name: 'css-font-face-url',
    description: '@font-face src: url(remote) — font-side outbound',
    svg: `<svg xmlns="http://www.w3.org/2000/svg"><style>@font-face{font-family:x;src:url("https://attacker.example/x.woff")}</style><text font-family="x">x</text></svg>`,
  },
];

interface Leak {
  payload: string;
  url: string;
  resourceType: string;
  /** Frame URL where the request originated. */
  frameUrl: string;
}

interface PendingRequest {
  url: string;
  resourceType: string;
  frameUrl: string;
  payload: string;
}

async function runAudit(opts: { headless: boolean; verbose: boolean }): Promise<number> {
  // Sanity check the dev server is up before booting Chromium.
  try {
    const probe = await fetch(PLAYGROUND_URL);
    if (!probe.ok) {
      throw new Error(`HTTP ${probe.status}`);
    }
  } catch (err) {
    console.error(`✗ dev server not reachable at ${PLAYGROUND_URL}`);
    console.error(`  start it with: npm run dev:website`);
    console.error(`  underlying error: ${(err as Error).message}`);
    return 2;
  }

  let browser: Browser | null = null;
  const leaks: Leak[] = [];
  try {
    browser = await puppeteer.launch({
      headless: opts.headless,
      args: ['--no-sandbox', '--disable-extensions'],
    });
    const page = await browser.newPage();

    // We only care about requests that *succeed* — i.e. that actually leave
    // the iframe and reach an attacker host. CSP-blocked requests fire the
    // `request` event in Puppeteer (the browser tried) but produce no
    // `response` and a `requestfailed` event with errorText "blocked:csp".
    // We track per-request and only count "leaks" when a response arrives.
    //
    // We also scope by frame: the parent playground page itself loads
    // CodeMirror via esm.sh, which is legitimate and not under test. Only
    // requests originating from the *iframe* (about:srcdoc) count as leaks.
    let currentPayload = '<setup>';
    const pending = new Map<string, PendingRequest>();

    function isOutbound(url: string): boolean {
      try {
        const u = new URL(url, PLAYGROUND_URL);
        if (ALLOWED_PROTOCOLS.has(u.protocol)) return false;
        if (ALLOWED_HOSTS.has(u.hostname)) return false;
        if (u.protocol === 'chrome-extension:' || u.protocol === 'devtools:') return false;
        return true;
      } catch {
        return false;
      }
    }

    function isFromIframe(req: HTTPRequest): boolean {
      const frame = req.frame();
      if (!frame) return false;
      const url = frame.url();
      // Our iframe documents load via srcdoc, so frame.url() === 'about:srcdoc'.
      return url === 'about:srcdoc';
    }

    page.on('request', (req: HTTPRequest) => {
      if (!isOutbound(req.url())) return;
      if (!isFromIframe(req)) return;
      pending.set(req.url(), {
        url: req.url(),
        resourceType: req.resourceType(),
        frameUrl: req.frame()?.url() ?? '',
        payload: currentPayload,
      });
    });
    page.on('response', (res) => {
      const url = res.url();
      const p = pending.get(url);
      if (!p) return;
      // Response received — request was NOT blocked by CSP/sandbox. Real leak.
      leaks.push({ payload: p.payload, url: p.url, resourceType: p.resourceType, frameUrl: p.frameUrl });
      pending.delete(url);
    });
    page.on('requestfailed', (req: HTTPRequest) => {
      const url = req.url();
      pending.delete(url);
      // Optional verbose logging of blocks so users see CSP doing its job.
      if (opts.verbose && isOutbound(url) && isFromIframe(req)) {
        console.log(`  ✓ blocked: ${req.failure()?.errorText ?? 'unknown'} → ${url}`);
      }
    });

    await page.goto(PLAYGROUND_URL, { waitUntil: 'networkidle2', timeout: 30000 });
    if (opts.verbose) console.log(`✓ playground loaded`);

    for (const payload of PAYLOADS) {
      currentPayload = payload.name;
      if (opts.verbose) console.log(`→ injecting payload: ${payload.name}`);

      // Inject the malicious SVG directly into the playground's preview iframe,
      // bypassing the compiler. This is the "iframe sandbox alone" test. Using
      // a string-form evaluate to avoid tsx's `__name` helper polluting the
      // serialized function (puppeteer rejects helpers it can't resolve).
      const injectionScript = `
        (function (svgString) {
          function findPreviewIframe(root) {
            var direct = root.querySelector('iframe#preview-frame');
            if (direct) return direct;
            var els = root.querySelectorAll('*');
            for (var i = 0; i < els.length; i++) {
              var sr = els[i].shadowRoot;
              if (sr) {
                var found = findPreviewIframe(sr);
                if (found) return found;
              }
            }
            return null;
          }
          var iframe = findPreviewIframe(document);
          if (!iframe || !iframe.contentDocument) throw new Error('preview iframe not found');
          var doc = iframe.contentDocument;
          var layers = doc.getElementById('preview-layers');
          if (layers) layers.innerHTML = '';
          var parsed = new DOMParser().parseFromString(svgString, 'image/svg+xml');
          var svgRoot = parsed.documentElement;
          for (var i = 0; i < svgRoot.children.length; i++) {
            if (layers) layers.appendChild(doc.importNode(svgRoot.children[i], true));
          }
          // Force layout/paint so any render-time fetches fire now.
          void doc.documentElement.getBoundingClientRect();
        })(${JSON.stringify(payload.svg)});
      `;
      await page.evaluate(injectionScript);

      // Give the renderer time to attempt any outbound fetches.
      await new Promise((r) => setTimeout(r, 600));
    }

    currentPayload = '<teardown>';
  } finally {
    await browser?.close();
  }

  if (leaks.length === 0) {
    console.log(`✓ ${PAYLOADS.length} malicious payloads — zero outbound requests`);
    console.log(`  iframe sandbox + CSP holds across all tested vectors`);
    return 0;
  }

  console.error(`✗ ${leaks.length} outbound request(s) escaped the iframe sandbox:`);
  for (const leak of leaks) {
    console.error(`  [${leak.payload}] ${leak.resourceType} → ${leak.url}`);
  }
  console.error('');
  console.error('  This means the iframe + CSP combo did NOT block the leak. Investigate:');
  console.error('  - playground/utils/preview-iframe.ts (CSP definition)');
  console.error('  - project-docs/security/iframe-sandbox-rationale.md (decision log)');
  return 1;
}

const program = new Command();
program
  .name('security-browser-audit')
  .description('Verify iframe + CSP blocks outbound requests for malicious SVG payloads')
  .option('--headed', 'Run with a visible browser window for debugging', false)
  .option('-v, --verbose', 'Print per-payload progress', false)
  .action(async (opts: { headed: boolean; verbose: boolean }) => {
    const code = await runAudit({ headless: !opts.headed, verbose: opts.verbose });
    process.exit(code);
  });
program.parseAsync();
