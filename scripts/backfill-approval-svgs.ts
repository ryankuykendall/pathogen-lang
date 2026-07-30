// Backfill approval SVGs for published workspaces that predate SVG capture.
//
// The workspace detail page (/u/:handle/:slug) upgrades its hero to the live
// viewer only when the approval record carries an SVG (legacy inline `svg` or
// R2 `approvalSvgAt` — see project-docs/detail-hero-viewer/STATUS.md). This
// sweep regenerates the missing ones through the SAME pipeline as the admin
// moderation view's "Regenerate preview":
//
//   compilerWorker.compileWithContext(code)   ← browser worker, Google-Fonts
//   dimensionsOrDefault(code)                    fetching included
//   PathogenLang.generateSvg(result, dims)    ← string generator, no metadata
//   PUT /admin/approval/:id/svg { svg }
//
// To reuse those modules verbatim (not an approximation), a headless Chrome
// page is served the BUILT site (public/ as document root, production layout)
// plus a tiny in-memory harness page that imports /services/compiler-worker.js
// and /utils/source-dimensions.js and exposes one compile function.
//
// Deliberate scope decisions:
// - Sweeps BOTH /admin/queue/approved and /admin/queue/featured — the two
//   listings are disjoint (featured entries are excluded from approved).
// - GPU-gradient sources (ConicGradient/MeshGradient/FreeformGradient/
//   TopoGradient) are SKIPPED by default: generateSvg renders them via the
//   CLI fallback (conic wedges, flat average-color rects), which would
//   REPLACE those pages' accurate raster heroes with degraded vectors.
//   --include-gpu overrides (matches what admin "Regenerate preview" would
//   produce today). Rendering them via the playground GPU pipeline instead
//   is a possible follow-up.
// - Approvals whose frozen code no longer compiles (e.g. pre-mandatory-
//   semicolon sources) are reported and left untouched.
// - SVG only — thumbnails/hero PNGs were generated from the same frozen code
//   at save time and are not touched.
//
// Usage:
//   npm run backfill:approval-svgs -- --dry-run                    # local dev
//   npm run backfill:approval-svgs -- --api-base https://api.pathogen.studio
//   ADMIN_TOKEN=... npm run backfill:approval-svgs -- --api-base ... [--limit N]
//
// Requires `npm run build:website` (or build:playground) to have populated
// public/ — the harness serves the built modules.

import { Command } from 'commander';
import { createServer, type Server } from 'http';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join, resolve, extname, normalize, sep } from 'path';
import puppeteer, { type Browser, type Page } from 'puppeteer';

const PROJECT_ROOT = resolve(import.meta.dirname, '..');
const PUBLIC_DIR = join(PROJECT_ROOT, 'public');
const SVG_MAX_CHARS = 12 * 1024 * 1024; // mirrors router.ts adminPutApprovalSvg cap

// Mirrors hasGpuGradients in scripts/compile-bbwp.ts (not importable — that
// script executes Commander at module top level). Keep the two in sync.
const GPU_GRADIENT_RE = /\b(ConicGradient|MeshGradient|FreeformGradient|TopoGradient)\s*\(/;

const MIME: Record<string, string> = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm', '.png': 'image/png', '.woff2': 'font/woff2',
};

const HARNESS_HTML = `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<script src="/dist/index.global.js"></script>
</head><body>
<script type="module">
  import { compileWithContext } from '/services/compiler-worker.js';
  import { dimensionsOrDefault } from '/utils/source-dimensions.js';
  // Same call sequence as admin-moderation-view.ts _compileSvg/_regenerate.
  window.__compileApproval = async (code) => {
    const result = await compileWithContext(code, 1, undefined);
    const dims = dimensionsOrDefault(code);
    const svg = window.PathogenLang.generateSvg(result, dims);
    return { svg, dims };
  };
  window.__HARNESS_READY = true;
</script>
</body></html>`;

interface QueueEntry {
  workspaceId: string;
  slug: string;
  name: string;
  ownerHandle: string | null;
  hasSvg: boolean;
  featuredAt: string | null;
}

function startHarnessServer(): Promise<{ server: Server; port: number }> {
  const server = createServer(async (req, res) => {
    // Whole handler guarded: a malformed percent-encoding in the URL would
    // otherwise throw in decodeURIComponent and crash the process mid-sweep.
    try {
      const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0]);
      if (urlPath === '/backfill-harness.html') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(HARNESS_HTML);
        return;
      }
      const filePath = normalize(join(PUBLIC_DIR, urlPath));
      // Descendant check, not a bare prefix check — `startsWith(PUBLIC_DIR)`
      // alone would admit a sibling like `public-evil/`.
      if (filePath !== PUBLIC_DIR && !filePath.startsWith(PUBLIC_DIR + sep)) {
        res.writeHead(403).end();
        return;
      }
      const body = await readFile(filePath);
      res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] ?? 'application/octet-stream' });
      res.end(body);
    } catch {
      if (!res.headersSent) res.writeHead(404);
      res.end();
    }
  });
  return new Promise((resolvePort) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolvePort({ server, port: typeof address === 'object' && address ? address.port : 0 });
    });
  });
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url.replace(/token=[^&]+/, 'token=***')} → HTTP ${res.status}`);
  return (await res.json()) as T;
}

const program = new Command();
program
  .name('backfill-approval-svgs')
  .description('Regenerate missing approval SVGs via the admin pipeline (see header comment)')
  .option('--api-base <url>', 'API worker origin', 'http://localhost:8787')
  .option('--token <token>', 'admin token (prefer env ADMIN_TOKEN — --token is visible in ps/shell history)')
  .option('--dry-run', 'list what would be regenerated, write nothing', false)
  .option('--limit <n>', 'process at most N approvals', (v) => parseInt(v, 10))
  .option(
    '--only <ids>',
    'comma-separated workspace ids — processes them even if hasSvg; NOTE: overwriting an approval that has a legacy inline svg permanently drops that inline copy (server deletes it on PUT)',
  )
  .option(
    '--force',
    'regenerate even when the approval already has an SVG (same legacy-inline-svg caveat as --only)',
    false,
  )
  .option('--include-gpu', 'also process GPU-gradient sources (degraded fallback render)', false)
  .option('--confirm', 'required for any non-localhost --api-base (production write gate)', false)
  .action(async (opts) => {
    const token: string | undefined = opts.token ?? process.env.ADMIN_TOKEN;
    if (!token) {
      console.error('No admin token: pass --token or set ADMIN_TOKEN.');
      process.exit(1);
    }
    // Prod write gate — same convention as migrate-viewbox.ts / backfill-owner-handle.ts.
    const apiHost = new URL(String(opts.apiBase)).hostname;
    const isLocal = apiHost === 'localhost' || apiHost === '127.0.0.1';
    if (!isLocal && !opts.confirm && !opts.dryRun) {
      console.error(`Refusing to write to non-local API (${apiHost}) without --confirm. Use --dry-run to preview.`);
      process.exit(1);
    }
    // All three harness dependencies — a partial build would otherwise fail
    // late as an opaque 30s harness timeout.
    for (const dep of ['services/compiler-worker.js', 'utils/source-dimensions.js', 'dist/index.global.js']) {
      if (!existsSync(join(PUBLIC_DIR, dep))) {
        console.error(`public/${dep} missing — run \`npm run build:playground\` first.`);
        process.exit(1);
      }
    }
    const api = String(opts.apiBase).replace(/\/$/, '');
    const authed = (path: string) => `${api}${path}${path.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`;

    // Both queues — approved excludes featured entries, so sweep the union.
    const approved = await fetchJson<{ entries: QueueEntry[] }>(authed('/admin/queue/approved'));
    const featured = await fetchJson<{ entries: QueueEntry[] }>(authed('/admin/queue/featured'));
    const byId = new Map<string, QueueEntry>();
    for (const e of [...approved.entries, ...featured.entries]) byId.set(e.workspaceId, e);

    const onlyIds = opts.only ? new Set(String(opts.only).split(',').map((s) => s.trim())) : null;
    if (onlyIds) {
      for (const id of onlyIds) {
        if (!byId.has(id)) console.warn(`⚠  --only id not found in either queue: ${id}`);
      }
    }
    let targets = [...byId.values()].filter((e) =>
      onlyIds ? onlyIds.has(e.workspaceId) : opts.force || !e.hasSvg,
    );
    if (Number.isFinite(opts.limit)) targets = targets.slice(0, opts.limit);

    console.log(`Approvals: ${byId.size} total (${approved.entries.length} approved + ${featured.entries.length} featured), ${targets.length} to process.`);
    if (targets.length === 0) return;

    let server: Server | null = null;
    let browser: Browser | null = null;
    const outcome = { done: [] as string[], skippedGpu: [] as string[], failed: [] as [string, string][] };

    try {
      let page: Page | null = null;
      if (!opts.dryRun) {
        const started = await startHarnessServer();
        server = started.server;
        browser = await puppeteer.launch({ headless: true });
        page = await browser.newPage();
        page.on('dialog', (d) => void d.dismiss().catch(() => {}));
        await page.goto(`http://127.0.0.1:${started.port}/backfill-harness.html`, { waitUntil: 'load' });
        await page.waitForFunction(() => (window as { __HARNESS_READY?: boolean }).__HARNESS_READY === true, {
          timeout: 30000,
        });
      }

      for (const entry of targets) {
        const label = `${entry.workspaceId} (${entry.ownerHandle ?? '?'}/${entry.slug})`;
        try {
          const approval = await fetchJson<{ code?: string }>(authed(`/admin/approval/${encodeURIComponent(entry.workspaceId)}`));
          const code = approval.code ?? '';
          if (!code.trim()) throw new Error('approval record has no code');

          if (GPU_GRADIENT_RE.test(code) && !opts.includeGpu) {
            outcome.skippedGpu.push(label);
            console.log(`⏭  ${label} — GPU gradient source, skipped (see --include-gpu)`);
            continue;
          }
          if (opts.dryRun) {
            outcome.done.push(label);
            console.log(`·  ${label} — would regenerate (${code.length} chars of source)`);
            continue;
          }

          const { svg, dims } = await page!.evaluate(async (src) => {
            const fn = (window as unknown as { __compileApproval: (c: string) => Promise<{ svg: string; dims: unknown }> }).__compileApproval;
            return await fn(src);
          }, code);
          if (!svg || !svg.includes('<svg')) throw new Error('compile produced no SVG');
          if (svg.length > SVG_MAX_CHARS) throw new Error(`SVG too large (${svg.length} chars > server cap)`);

          const put = await fetch(authed(`/admin/approval/${encodeURIComponent(entry.workspaceId)}/svg`), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ svg }),
          });
          if (!put.ok) throw new Error(`PUT → HTTP ${put.status}`);

          // Read-back sanity check — non-fatal. A 404 here can be by-design
          // (featured listing includes flagged/unpublished workspaces, whose
          // /approval-svg route 404s deliberately), and on --force re-runs the
          // route's 1h cache can serve stale bytes; the PUT above is the
          // authoritative success signal.
          const check = await fetch(`${api}/approval-svg/${encodeURIComponent(entry.workspaceId)}`);
          const note = check.ok ? '' : ` (read-back HTTP ${check.status} — flagged/unpublished or cached; PUT succeeded)`;

          outcome.done.push(label);
          console.log(`✓  ${label} — ${(svg.length / 1024).toFixed(1)}KB (${JSON.stringify(dims)})${note}`);
        } catch (err) {
          outcome.failed.push([label, (err as Error).message]);
          console.log(`✗  ${label} — ${(err as Error).message}`);
        }
      }
    } finally {
      await browser?.close();
      server?.close();
    }

    console.log(`\n${opts.dryRun ? 'Dry run' : 'Sweep'} complete: ${outcome.done.length} ${opts.dryRun ? 'candidates' : 'regenerated'}, ${outcome.skippedGpu.length} GPU-skipped, ${outcome.failed.length} failed.`);
    if (outcome.skippedGpu.length) {
      console.log('GPU-gradient sources (kept raster hero):');
      for (const s of outcome.skippedGpu) console.log(`  - ${s}`);
    }
    if (outcome.failed.length) {
      console.log('Failed (left untouched):');
      for (const [s, msg] of outcome.failed) console.log(`  - ${s}: ${msg}`);
      process.exitCode = 1;
    }
  });
program.parse();
