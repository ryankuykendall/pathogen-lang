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
| `inspect-pdf.ts` | PDF/raster inspection CLI (`npm run inspect:pdf`): page + embedded-image summary, image extraction, pixel statistics (uniform/black detection — the black-page failure signature), decoded content streams. Shares `scripts/lib/pdf-inspect.ts` with the unified-export E2E harness. |
| `validate-samples.ts` | Puppeteer sample validator (`npm run validate:samples [-- <dir>]`, default every post under `website/blog/samples`): margins (`--margin`), text/text, text/geometry and geometry/geometry collisions, dead space, GroupLayer usage, formatter cleanliness; writes `<dir>/previews/*.png`. Needs `compile:samples` first. Soft gate; `--strict` exits 1. |
| `migrate-style-opener.ts` | One-off codemod for the 2026-09 style-block opener change (`${ … }` → `#{ … }`). Builds the FROZEN pre-change grammar (`scripts/legacy-style-opener/pathogen-legacy.grammar`) at runtime with `@lezer/generator`, so the old parser — not a regex — decides which `${` are block openers; rewrites `.pathogen` files, Markdown fences, and Pathogen inside TS/JS string literals (JS interpolations become same-length identifier stand-ins; `${'${'}` smuggled openers are handled). Dry run by default, `--write` applies, `--report` emits JSON with `review` (opener next to a parse error) and `skipped` (snippet placeholders, probable interpolations, already migrated) entries. Library in `scripts/lib/legacy-style-opener.ts`, tests in `tests/migrate-style-opener.test.ts`. Delete `scripts/legacy-style-opener/` once the production KV migration has run twice. |
| `migrate-style-opener-kv.ts` | One-off: apply the same codemod to stored workspace source in the `WORKSPACES` KV namespace (`workspace:{id}`, `approval:{id}`, `queue:review`, `queue:rereview`), recomputing `contentHash` / `codeHash` and bumping `rev`. `--env dev\|prod`, `--dry-run`, `--confirm` for prod, `--backup-dir` writes every pre-image. Idempotent (skips records already holding `#{`). |
| `security-browser-audit.ts` | Puppeteer audit: injects malicious SVG payloads directly into the playground's preview iframe (bypassing the compiler) and verifies the iframe sandbox + CSP block every outbound request. The browser-only counterpart to `tests/security/`, since JSDOM does not enforce CSP. Run via `npm run security:browser-audit` (requires `npm run dev:website` running on :3000). |
| `perf-pan-zoom-audit.ts` | Puppeteer pan/zoom performance profiler. Creates a throwaway workspace from a `.pathogen` source, drives the real pan/wheel handlers, and reports the main-thread split (page.metrics) + off-main raster/commit totals per scenario. Built to diagnose interactive jank and A/B fixes. Run via `npm run perf:panzoom` (requires `npm run dev:stack`). See `project-docs/pan-zoom-performance/`. |
| `perf-transform-probe.ts` | Puppeteer render-mechanism probe: drives the large SVG via viewBox-mutation vs CSS-`transform` (translate / translate+scale) and compares `RasterTask`/commit-wait. Used to prove CSS-transform pan avoids re-raster for the SVG-in-iframe (~25× cheaper). Run via `npm run perf:transform-probe`. |
| `perf-typing-audit.ts` | Puppeteer editor-latency profiler: loads a `.pathogen` source (or a generated heavy program) via `/workspace/scratch?state=`, drives real typing/cursor/error-state bursts, and aggregates the flag-gated `pathogen:*` perf spans (`playground/utils/perf-marks.ts`) per phase, plus long-task and slow-input-event logs. Built for the editor-choppiness diagnosis — see `project-docs/editor-perf/FINDINGS.md`. Inspector knobs (see `project-docs/inspector-virtualization/FINDINGS.md`): `--wide-layers <n>` generates n cheap one-circle layers (inspector row stress), `--inspector <closed\|open>` sets the panel state before the phases, `--kill-inspector` disables the inspector store subscription entirely (`__PATHOGEN_NO_INSPECTOR__` A/B baseline — perf spans can't see huge-DOM layout cost; compare long tasks instead). Run via `npm run perf:typing -- --file <path>` (requires `npm run dev:website` and a playground build with instrumentation). |
| `debug-inspector-virtualization.ts` | Puppeteer verification for the inspector's windowed rendering: closed-inspector setData gate (zero rows), bounded window + full-height sizer + full-count badge on open, deep-scroll re-windowing of layers and palette against the shared shell scroller, and the O(1) eye-toggle patch surviving the store echo. Falls back native scroll → synthetic dispatch → manual `refresh()` because this machine's puppeteer Chrome never runs the rendering loop (no rAF ticks / scroll events). Run via `npx tsx scripts/debug-inspector-virtualization.ts` (requires `npm run dev:website` on :3000 and a fresh `PATHOGEN_API_BASE=http://localhost:8787 npm run build:playground`). |
| `debug-cjk-subset-loading.ts` | Puppeteer verification that CJK Google Fonts render real glyphs via unicode-range subset loading (`PathBlock.fromGlyph`). Four scenarios: Moirai One Korean (slice refetch + rendered outlines, saves SVG artifact), Latin-only Inter (exactly one binary fetch — regression guard), curated Nanum Gothic, and Inter+Hangul (missing-glyph `[warn]` in the console pane). Run via `npx tsx scripts/debug-cjk-subset-loading.ts` (requires `npm run dev:website` on :3000 and a fresh `build:playground`). |
| `debug-export-size-breadcrumb.ts` | Puppeteer verification for the breadcrumb's Export → SVG size indicator: asserts the `(N KB)` span renders after the workspace title and that its raw byte count is byte-identical to the Blob the export modal's real `_downloadSvg()` produces with default settings, and that the span is absent outside workspace view. Run via `npx tsx scripts/debug-export-size-breadcrumb.ts` (requires `npm run dev:website` on :3000 and a fresh `build:playground`). |
| `debug-glyph-char-classes.ts` | Puppeteer verification for fromGlyph character-class members (`isSpace`/`isTab`/`isNewline`/`isMark`/`codePoint`) in the playground: asserts exact classification log rows for letter/space/newline and that the docs' newline-aware line-wrap example renders glyph outlines. Run via `npx tsx scripts/debug-glyph-char-classes.ts` (requires `npm run dev:website` on :3000 and a fresh `build:playground`). |
| `debug-loop-control.ts` | Puppeteer verification for `continue`/`break` loop control in the playground surface: a valid program renders exactly the expected circles (continue skips one, break caps the loop), and a misplaced `break` (lambda body) surfaces the `'break' is only valid inside a for loop` compile error in the error panel. Run via `npx tsx scripts/debug-loop-control.ts` (requires `npm run dev:website` on :3000 and a fresh `build:playground`). |
| `debug-array-first-last-filter.ts` | Puppeteer verification for array `.first`/`.last` properties and `.filter()` in the playground surface: a valid program renders circles whose radii come from `.filter`/`.first`/`.last`/`.length`, and `filter()` without a block surfaces the trailing-block compile error in the error panel. Run via `npx tsx scripts/debug-array-first-last-filter.ts` (requires `npm run dev:website` on :3000 and a fresh `build:playground`). |
| `debug-centerpoint.ts` | Puppeteer verification for PathBlock / ProjectedPath `.centerPoint()` in the playground surface: the `project-docs/pathblock-center-point/` demo renders with no error panel and every path layer from `compile()` appears verbatim in the preview iframe (CLI ↔ playground parity), the served bundle's `getCompletions`/`getHoverInfo` offer `centerPoint` on both receivers plus Point members after `.centerPoint().`, and `centerPoint(1)` surfaces the arity error. Run via `npx tsx scripts/debug-centerpoint.ts` (requires `npm run dev:website` on :3000 and a fresh website build). |
| `debug-easing-family.ts` | Puppeteer verification for `ease(curve, t)`, the 21 new `Easing` members, and topo-gradient easing parity: the served bundle's `EASING_ORDER`/enum/`stdlib.ease`/`buildEasingWgsl()` agree with the source table and completions/hover know `ease` and `Easing.BounceOut`; both spliced topo shaders are compiled through WebGPU's `createShaderModule` (skipped with a message when headless Chrome has no GPU); a TopoGradient with `Easing.BounceOut` (distance), `Easing.ElasticInOut` (laplace) and the string `'back-in'` renders an image-backed pattern with no error panel, saving preview screenshots to `project-docs/easing-interpolation/`; and `ease('wobble', t)` surfaces the positioned error listing the valid names. Run via `npx tsx scripts/debug-easing-family.ts` (requires `npm run dev:website` on :3000 and a fresh website build). |
| `debug-cubic-bezier.ts` | Puppeteer verification for the stdlib `cubicBezier(x1, y1, x2, y2, t)` timing curve in the playground surface: the `project-docs/easing-interpolation/demo-cubic-bezier.pathogen` demo renders with no error panel and both path layers from `compile()` appear verbatim in the preview iframe, the served bundle's `getCompletions`/`getHoverInfo` offer `cubicBezier` with its generated detail and five-slot snippet, the served `stdlib.cubicBezier` returns the pinned bit-exact value, and an out-of-range x handle surfaces the `Line N` error. Run via `npx tsx scripts/debug-cubic-bezier.ts` (requires `npm run dev:website` on :3000 and a fresh website build). |
| `debug-workspace-switch-undo.ts` | Puppeteer repro + verification for the workspace-switch data-loss fixes: undo in workspace B must never restore workspace A's code (fresh-EditorState isolation), pending edits are flushed on in-app switches, the `?state=`/404 branches can't autosave foreign code into the previous workspace (stale debounce/keepalive timers), leaving the workspace view then returning to the same workspace re-arms autosave (edits after returning must persist), and switching refreshes the old workspace's thumbnail (auto + hero uploads, `thumbnail-updated` event, no cross-workspace hash stamp, uploads only for owned workspaces). Creates throwaway workspaces per scenario via the dev API. `--slow` extends observation windows past the 30s autosave MIN_INTERVAL. Run via `npx tsx scripts/debug-workspace-switch-undo.ts` (requires `npm run dev:stack` and a `PATHOGEN_API_BASE=http://localhost:8787 npm run build:playground`). |

## Git Hooks

Git hooks live in `scripts/git-hooks/` as TypeScript files. The `install-git-hooks.ts` script writes shims into `.git/hooks/` that invoke the TypeScript source via `npx tsx`.

| Hook | Purpose |
|---|---|
| `git-hooks/pre-commit.ts` | Warn when public-API additions in `src/evaluator/`, `src/stdlib/`, `src/parser/`, or `src/api-surface.ts` are not accompanied by changes in `docs/*.md` or `scripts/build-docs.ts`. Warning only — never blocks. Suppress with `git commit --no-verify`. |
| `git-hooks/post-commit.ts` | Remind to update CHANGELOG.md |
