# Scripts

All scripts in this directory are TypeScript files executed via `tsx`.

## Conventions

- **TypeScript only** — all scripts use `.ts` extension
- **Commander CLI** — every script uses Commander for `--help`, argument parsing, and description
- **Executed via `tsx`** — scripts are not compiled; npm scripts use `tsx scripts/X.ts`
- **Async pattern** — wrap main logic in Commander's `.action()` callback

## Template for New Scripts

```ts
import { Command } from 'commander';

const program = new Command();
program
  .name('script-name')
  .description('What this script does')
  .option('--flag <value>', 'Description of flag')
  .action(async (opts) => {
    // Main logic here
  });
program.parse();
```

## Existing Scripts

| Script | Purpose |
|---|---|
| `build-docs.ts` | Convert markdown docs to `playground/utils/docs-content.js` |
| `build-blog.ts` | Convert blog markdown to `playground/utils/blog-content.js` |
| `build-website.ts` | Assemble CloudFlare Pages output in `public/` |
| `new-blog-post.ts` | Scaffold a new blog post with frontmatter |
| `rotate-admin-token.ts` | Generate a new ADMIN_TOKEN secret on the `pathogen-api` Worker and redeploy. (After the API split, admin endpoints live on the API Worker, not the Pages project.) |
| `migrate-anonymous-workspaces.ts` | One-off: re-key workspaces from anonymous user IDs to an authenticated user. Reads/writes WORKSPACES KV via wrangler. |
| `kill-port.ts` | Kill processes on a port (default 3000); used by `kill:wrangler` |
| `install-git-hooks.ts` | Install git hooks from `scripts/git-hooks/` |
| `backfill-approval-svgs.ts` | Regenerate missing approval SVGs (detail-page hero viewer) via the admin pipeline: compiles each approval's frozen code in a puppeteer harness serving `public/` (real `compiler-worker.compileWithContext` + `generateSvg`), PUTs to `/admin/approval/:id/svg`. Sweeps approved + featured queues; skips GPU-gradient sources by default; `--dry-run`; non-local API requires `--confirm`. Run via `ADMIN_TOKEN=... npm run backfill:approval-svgs`. |
| `compile-bbwp.ts` | Compile `.pathogen` → SVG → HTML artifact in `website/bbwp/` |
| `serve-bbwp.ts` | HTTP server for browsing BBWP artifacts (default port 3001) |
| `update-bbwp-index.ts` | Regenerate `website/bbwp/index.html` from directory listing |
| `check-links.ts` | Puppeteer link checker for blog posts and documentation pages |
| `validate-samples.ts` | Puppeteer sample validator: margins, collisions, GroupLayer checks + PNG previews |
| `security-browser-audit.ts` | Puppeteer audit: injects malicious SVG payloads directly into the playground's preview iframe (bypassing the compiler) and verifies the iframe sandbox + CSP block every outbound request. The browser-only counterpart to `tests/security/`, since JSDOM does not enforce CSP. Run via `npm run security:browser-audit` (requires `npm run dev:website` running on :3000). |
| `perf-pan-zoom-audit.ts` | Puppeteer pan/zoom performance profiler. Creates a throwaway workspace from a `.pathogen` source, drives the real pan/wheel handlers, and reports the main-thread split (page.metrics) + off-main raster/commit totals per scenario. Built to diagnose interactive jank and A/B fixes. Run via `npm run perf:panzoom` (requires `npm run dev:stack`). See `project-docs/pan-zoom-performance/`. |
| `perf-transform-probe.ts` | Puppeteer render-mechanism probe: drives the large SVG via viewBox-mutation vs CSS-`transform` (translate / translate+scale) and compares `RasterTask`/commit-wait. Used to prove CSS-transform pan avoids re-raster for the SVG-in-iframe (~25× cheaper). Run via `npm run perf:transform-probe`. |
| `perf-typing-audit.ts` | Puppeteer editor-latency profiler: loads a `.pathogen` source (or a generated heavy program) via `/workspace/scratch?state=`, drives real typing/cursor/error-state bursts, and aggregates the flag-gated `pathogen:*` perf spans (`playground/utils/perf-marks.ts`) per phase, plus long-task and slow-input-event logs. Built for the editor-choppiness diagnosis — see `project-docs/editor-perf/FINDINGS.md`. Run via `npm run perf:typing -- --file <path>` (requires `npm run dev:website` and a playground build with instrumentation). |
| `debug-cjk-subset-loading.ts` | Puppeteer verification that CJK Google Fonts render real glyphs via unicode-range subset loading (`PathBlock.fromGlyph`). Four scenarios: Moirai One Korean (slice refetch + rendered outlines, saves SVG artifact), Latin-only Inter (exactly one binary fetch — regression guard), curated Nanum Gothic, and Inter+Hangul (missing-glyph `[warn]` in the console pane). Run via `npx tsx scripts/debug-cjk-subset-loading.ts` (requires `npm run dev:website` on :3000 and a fresh `build:playground`). |
| `debug-export-size-breadcrumb.ts` | Puppeteer verification for the breadcrumb's Export → SVG size indicator: asserts the `(N KB)` span renders after the workspace title and that its raw byte count is byte-identical to the Blob the export modal's real `_downloadSvg()` produces with default settings, and that the span is absent outside workspace view. Run via `npx tsx scripts/debug-export-size-breadcrumb.ts` (requires `npm run dev:website` on :3000 and a fresh `build:playground`). |
| `debug-glyph-char-classes.ts` | Puppeteer verification for fromGlyph character-class members (`isSpace`/`isTab`/`isNewline`/`isMark`/`codePoint`) in the playground: asserts exact classification log rows for letter/space/newline and that the docs' newline-aware line-wrap example renders glyph outlines. Run via `npx tsx scripts/debug-glyph-char-classes.ts` (requires `npm run dev:website` on :3000 and a fresh `build:playground`). |
| `debug-loop-control.ts` | Puppeteer verification for `continue`/`break` loop control in the playground surface: a valid program renders exactly the expected circles (continue skips one, break caps the loop), and a misplaced `break` (lambda body) surfaces the `'break' is only valid inside a for loop` compile error in the error panel. Run via `npx tsx scripts/debug-loop-control.ts` (requires `npm run dev:website` on :3000 and a fresh `build:playground`). |
| `debug-array-first-last-filter.ts` | Puppeteer verification for array `.first`/`.last` properties and `.filter()` in the playground surface: a valid program renders circles whose radii come from `.filter`/`.first`/`.last`/`.length`, and `filter()` without a block surfaces the trailing-block compile error in the error panel. Run via `npx tsx scripts/debug-array-first-last-filter.ts` (requires `npm run dev:website` on :3000 and a fresh `build:playground`). |
| `debug-workspace-switch-undo.ts` | Puppeteer repro + verification for the workspace-switch data-loss fixes: undo in workspace B must never restore workspace A's code (fresh-EditorState isolation), pending edits are flushed on in-app switches, and the `?state=`/404 branches can't autosave foreign code into the previous workspace (stale debounce/keepalive timers). Creates throwaway workspaces per scenario via the dev API. `--slow` extends observation windows past the 30s autosave MIN_INTERVAL. Run via `npx tsx scripts/debug-workspace-switch-undo.ts` (requires `npm run dev:stack` and a `PATHOGEN_API_BASE=http://localhost:8787 npm run build:playground`). |

## Git Hooks

Git hooks live in `scripts/git-hooks/` as TypeScript files. The `install-git-hooks.ts` script writes shims into `.git/hooks/` that invoke the TypeScript source via `npx tsx`.

| Hook | Purpose |
|---|---|
| `git-hooks/pre-commit.ts` | Warn when public-API additions in `src/evaluator/`, `src/stdlib/`, `src/parser/`, or `src/api-surface.ts` are not accompanied by changes in `docs/*.md` or `scripts/build-docs.ts`. Warning only — never blocks. Suppress with `git commit --no-verify`. |
| `git-hooks/post-commit.ts` | Remind to update CHANGELOG.md |
