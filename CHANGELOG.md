# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased] - 2026-05-24

### Fixed

#### Workspace code reverting after edits (silent data loss)

- **Root cause — server-side clobber.** The thumbnail upload (`PUT /workspace/:id/thumbnail`) and clear (`DELETE /workspace/:id/thumbnail`) endpoints did a full-document read-modify-write of the `workspace:${id}` KV value just to stamp three timestamp fields — carrying `workspace.code` along. A code save (autosave, or a fresher second tab) that landed between the handler's read and write was silently reverted. The thumbnail is rendered client-side from the live preview, so it always looked up-to-date while the persisted code rolled back to an older version.
- **Fix — field isolation.** Thumbnail timestamps (`thumbnailAt`, `manualThumbnailAt`, `autoThumbnailAt`) now live in a sidecar KV key (`thumbmeta:${id}`). The thumbnail endpoints write **only** the sidecar and never touch `workspace:${id}`, so a thumbnail operation can no longer clobber code. Reads merge the sidecar with a lazy fallback to the legacy inline fields (`readThumbMeta` in `website/api/utils.ts`) — no migration job; pre-existing workspaces migrate on their next thumbnail write. The sidecar uses the `thumbmeta:` namespace (not `workspace:`) so `KV.list({ prefix: 'workspace:' })` scans don't pick it up. `deleteWorkspace` cascades a sidecar delete.
- **Root cause — dropped unload saves.** The playground API client issued saves with a plain `fetch`, so a save fired from the `beforeunload` handler (closing/navigating away) was cancelled mid-flight by the browser. Combined with the 5s debounce + 30s min-interval, edits made shortly before leaving could never land.
- **Fix — keepalive flush + UX guards.** The leave-the-page flush now uses `fetch(..., { keepalive: true })` so the request survives document teardown. A native "unsaved changes" prompt appears on unload while a save is still pending. Saves also flush on `visibilitychange → hidden` (the reliable mobile/backgrounding signal) and on editor blur, shrinking the unsaved-edit window. Auto-thumbnail failures, previously swallowed (`console.warn` only), now surface a non-blocking toast. The keepalive fetch is dispatched **synchronously** (no `await` before it) so it actually fires during teardown.
- **Root cause — multi-tab code-vs-code clobber.** Two tabs open on the same workspace both autosaved `code`; the slower (stale) tab's save overwrote the faster tab's newer code. Last-write-wins with no concurrency control.
- **Fix — optimistic concurrency.** The workspace doc carries a monotonic `rev` counter, bumped on every accepted code write. Each save sends `baseRev` (the revision the client edited from); the server rejects with **409** when the doc has advanced, so a stale tab can't clobber newer code. The client advances `baseRev` from each save's response (sequential saves keep working), and on a 409 stops autosaving, surfaces the multi-tab conflict (warning banner + save-status message), and keeps the local edit in memory — the user reconciles by reloading. Clients that omit `baseRev` keep the old behavior (backward compatible). Non-code updates (rename, preferences, publish toggle) re-read `code`/`rev` immediately before their full-doc write so they can't revert a concurrent code save either. Residual: KV has no compare-and-swap, so two saves landing in the *same* sub-second window can still race — exceedingly unlikely for one user given the 5s/30s autosave cadence; a Durable Object would close it fully.

### Added

#### `Grid()` constructor — 2D data containers for flow fields, heatmaps, sampling tables

- **New typed value `Grid(rows, cols, options) {|grid| ... }`** for spatial data that maps cells to canvas coordinates. The trailing block runs once at construction and receives the (mutable) grid — same pattern as `Marker(...)`, `Mask(...)`, and `Pattern(...)`. `rows` and `cols` are positive integers; `options` is an object literal whose keys are all optional.
- **Constructor options:** `xDim` / `yDim` (cell size, default 1), `origin` (Point, default `Point(0, 0)`), `defaultValue` (initial cell value, default `null`), `outOfBounds` (`'clamp'` | `'wrap'` | `'null'`, default `'clamp'`), `interpolation` (`'nearest'` | `'bilinear'`, default `'nearest'`). `defaultValue` is named that way because `default` is a reserved Pathogen keyword.
- **Driving use case.** Pathogen arrays throw on out-of-bounds access; assignment doesn't auto-extend. That makes the JS-style `if (!map[row]) map[row] = []` lazy-init pattern impossible. `Grid` removes the manual init entirely (`grid.fill {|row, col, center| return ... }`), removes the manual `row*cellSize + cellSize/2` arithmetic (`grid.getPoint(row, col)`), and adds the `outOfBounds: 'wrap'` mode common in toroidal flow-field art.
- **Members:** `rows`, `cols`, `xDim`, `yDim`, `origin`, `width` (`cols * xDim`), `height` (`rows * yDim`).
- **Methods.** Cell access: `get(r, c)`, `set(r, c, v)` (mutates, returns self), `getPoint(r, c)` (cell center as `Point`), `getRow(r)`, `getCol(c)`, `cells()` (flat row-major). Iteration: `fill {|row, col, center| return ... }` (mutate every cell), `forEach {|cell, row, col, center| ... }` (side effects — drawing arrows etc.), `map {|cell, row, col, center| return ... }` (new grid). Sampling: `sample(x, y)`, `sampleNearest(x, y)`, `sampleBilinear(x, y)`. `getPoint`/`getRow`/`getCol` deliberately mirror `MeshGradient`'s vocabulary.
- **`forEach` threads the active layer's accum** when invoked inside `layer.apply { }`, so `drawTo()` / path commands inside the block emit to the surrounding layer — same semantics users already get from a regular `for` loop.
- **Bilinear sampling handles both numeric and Point cells.** Numeric cells get the standard three-lerp (`(1-fx)`/`fx` × `(1-fy)`/`fy`) blend. Point cells interpolate `x` and `y` separately — the standard fix for direction sampling, since bilinear on raw angles produces wrong directions at every wrap-around. Cells of other types throw a clear `Grid.sampleBilinear() requires cells to be numbers or Points` error.
- **`docs/grid.md`** is the new user-facing page (registered in `scripts/build-docs.ts` `DOC_FILES`). Covers the constructor, options, members, methods, a full flow-field example, the bilinear-sampling primer, and the angle-wraparound caveat (`Point(cos(a), sin(a))` then `atan2(v.y, v.x)`). `docs/stdlib.md` and `docs/grid.md` carry reciprocal "not to be confused with" callouts disambiguating the new data-container `Grid()` from the existing `squareGrid`/`triangleGrid`/`hexagonGrid` PathSegment generators.
- **Completion + hover + signature help.** `Grid` is declared in `src/pathogen-api.ts` as `PathogenGrid` with `PathogenGridOptions`. `npm run generate:completions` produces the top-level constructor entry, the 7-property/12-method member set, and the signature `Grid(rows, cols, options)`. `let g = Grid(...)` triggers Grid member completions on `g.` via the inference table in `src/language-services/completion.ts`. Hover automatically picks up the constructor doc from `STDLIB_COMPLETIONS`.
- **VS Code.** TextMate grammar adds `Grid` to the constructor token list. A new `grid` snippet expands to `Grid(rows, cols, { xDim, yDim }) {|g| g.fill {|row, col, center| return ... }; };`.
- **Annotated evaluator parity.** `src/evaluator/annotated.ts` mirrors the constructor, member access, all 11 methods, and the sampling helpers so the Annotated debug pane doesn't error on programs using Grid.

### Tests

- **`tests/evaluator.test.ts`** — 20 new tests covering construction (defaults, `defaultValue`, fill block), members, cell access (`get`/`set`/`getPoint` with origin, `getRow`/`getCol`/`cells`), iteration (`forEach` row-major, `map` returns new grid, `forEach` inside `layer.apply` emits paths to the surrounding layer), and sampling (nearest at cell centers, bilinear at centers and midpoints, all three `outOfBounds` modes, `sample` dispatching on `interpolation`, bilinear Point interpolation).
- **`tests/errors.test.ts`** — 7 new tests pinning the error messages for argument validation, `get`/`set` out-of-bounds, invalid option values, and `sampleBilinear` on non-numeric/non-Point cells.
- **`tests/language-services/completion.test.ts`** — 1 new test verifying Grid members appear on `g.` after `let g = Grid(...)`.
- Full suite passing: **3050 tests** (up from 3022 pre-feature), no regressions.

#### `define ViewBox(...)` — viewBox in source

- **New language statement.** `define ViewBox(originX, originY, width, height);` declares the SVG viewBox in Pathogen source. Arguments are full expressions (`calc(...)`, variables, negative origins are all supported). One ViewBox per program; duplicates are a compile error.
- **Render precedence.** Source `define ViewBox` wins over the CLI's `--viewBox`/`--width`/`--height` flags; flags continue to apply for inline `-e` snippets that don't declare one. Default remains `0 0 200 200`.
- **Strict validation.** Zero or negative `width`/`height` rejected at compile time. Negative `originX`/`originY` are allowed (valid SVG, useful for centering around 0,0). Non-numeric arguments produce a clear "must evaluate to a finite number" diagnostic. `define ViewBox` inside a layer apply / path / text block is rejected ("ViewBox must appear at top level").
- **CompileResult carries the resolved viewBox.** `CompileResult.viewBox = { originX, originY, width, height } | undefined`. `compileWithContext` exposes the same field. `--include-metadata` emits it inside the metadata `<script>` block.
- **`docs/viewbox.md`** is the new user-facing page (registered in `scripts/build-docs.ts` `DOC_FILES`). `docs/cli.md`, `docs/layers.md`, and `docs/getting-started.md` cross-link to it; `getting-started.md` now opens its first example with the canonical boilerplate.
- **Completion + hover.** `define V…` completes to `define ViewBox(${1:0}, ${2:0}, ${3:200}, ${4:200});`. Hovering `ViewBox` shows the syntax and precedence rules. The `define` hover documents all three variants (PathLayer / TextLayer / ViewBox).
- **VS Code.** TextMate grammar adds `ViewBox` to the keyword token list. The `viewbox` and `newfile` snippets emit the `define ViewBox(...)` form instead of the old `// viewBox=...` comment header.
- **`scripts/migrate-viewbox.ts`** + `npm run migrate:viewbox:dev` / `migrate:viewbox:prod`. Idempotent migration: iterates every `workspace:*` KV record, parses the code with `parseLezer` to detect any existing `ViewBoxDefinition` (AST-walked, not regex'd, so comment / template-literal mentions don't fool the skip check), and prepends `define ViewBox(0, 0, ${w}, ${h});` using `preferences.width`/`height` (default 200/200) when absent. Sets a `_viewboxMigratedAt` marker. Re-reads before write to skip concurrent autosaves. Supports `--dry-run`; requires `--confirm` for `--env=prod`.

#### Rename workspace from the overflow menu

- **New "Rename workspace" action** in the workspace breadcrumb overflow menu. Owner-only (`currentUser.id === workspaceOwnerId`); appears just under "Format Document". Opens a centered card dialog with Name and Description fields, validation matching the new-workspace form (name required, ≤ 100 chars; description ≤ 500 chars), and inline error display.
- **Save flow** calls `workspaceApi.update(id, { name, description })`, updates the store (`workspaceName`, `workspaceDescription`, `currentFileName`, `workspaceUpdatedAt`), syncs the matching entry in the workspaces list, refreshes the URL slug via `history.replaceState`, and closes. Errors surface inside the modal without dismissing the entered values.
- **Shared `updateWorkspaceSlugUrl(id, slug)`** util extracted from `workspace-view.updateUrlWithSlug` so both the workspace loader and the rename modal use the same path.
- **Storybook entry** for `edit-workspace-metadata-modal` under the Shared category with default, empty, and long-description stories. New `mi-edit` icon added to the material-icons sprite.

### Changed

- **Workspace canvas size is no longer user-editable in the playground.** The W/H number inputs are gone from the workspace footer (replaced with a read-only viewBox display), the new-workspace dialog (no longer asks for canvas size on create), and the preferences page (`Canvas Size` section removed). `store.preferences` no longer carries `width`/`height`; the new-workspace boilerplate is `define ViewBox(0, 0, 200, 200);` followed by a `define default PathLayer('main-path-layer') ${ ... };` block. The footer's viewBox display updates live from `result.viewBox` after each compile.
- **API stops persisting `preferences.width`/`height`.** POST `/api/workspace`, PUT `/api/workspace/:id`, and PUT `/api/preferences` strip those keys from incoming payloads (via `stripDimensions`). Existing KV records keep their legacy values until the migration script runs; old values are inert because the new client never reads them.
- **Optional trailing `;` on `define <LayerType>(...) ${ ... }`.** Previously a trailing `;` was a parse error; now it's accepted (matching the user-facing boilerplate style and `define ViewBox(...);`'s mandatory `;`). Existing layer definitions without `;` continue to parse unchanged.
- **`scripts/compile-bbwp.ts` + `compile-samples.ts`** prefer the canonical `define ViewBox(...)` statement when auto-detecting dimensions, falling back to the legacy `// viewBox=...` / `// Set viewBox: ...` comment forms for unmigrated source files.

### Breaking

- **`ViewBox` is now a reserved keyword.** Variable or layer names matching `ViewBox` will no longer parse. The keyword is contextual at the AST level (specialized only inside `define ViewBox(...)`) but, like other keywords (`let`, `for`, `define`), it is specialized at tokenization and cannot appear as an identifier. No examples in the codebase used it.

### Migration Path

The migration runs against KV before deploy. Atomic single-PR rollout: migrate prod KV → merge → auto-deploy. Old workers can still serve unmigrated workspaces because `preferences.width`/`height` are retained alongside the new `define ViewBox` statement during the transition window. Storage cleanup (removing the legacy `width`/`height` keys from KV entirely) is a no-op follow-up done at our convenience.

### Tests

- **`tests/viewbox.test.ts`** — 19 tests covering parsing (basic, expression args, negative origin, coexistence with layers, `ViewBox` reservedness, trailing `;` on layer defs), evaluation (validation, duplicates, zero/negative width/height, non-numeric args, no-viewbox case), and render precedence (source wins / CLI fallback / default).
- **`tests/migration-viewbox.test.ts`** — 9 tests pinning the AST-walk skip check used by the migration. Verifies that comment-only and template-literal mentions of `define ViewBox` do NOT suppress the migration, and unparseable code falls through to "prepend" mode.
- **`tests/cli.test.ts`** — 2 new tests verify CLI flag precedence (source-defined ViewBox wins over `--viewBox`, falls back to flag when source has no declaration).
- **`tests/language-services/completion.test.ts`** — 1 new test verifies `ViewBox` appears among keyword completions.
- Full suite passing: **2997 tests** (up from 2966 pre-feature).

#### Blog sample sweep

- **143 `.pathogen` files under `website/blog/samples/post*/`** updated: line 1 `// viewBox="0 0 W H"` comments replaced with `define ViewBox(0, 0, W, H);` canonical form (commit b784152). All 143 now compile successfully via `npm run compile:samples` (commits 7486f5e, ea02745).
- **Inline `svg-path` / `pathogen` code fences** in `website/blog/*.md` (101 fences across 18 posts) intentionally left untouched — they're short illustrative snippets (`arrow.draw()`, `dot.drawTo(...)`), not full programs, and adding `define ViewBox(...)` to each would clutter the teaching context.

#### AST builder postfix folding (commit 7486f5e)

The viewBox sweep surfaced a cluster of AST-builder bugs that were
silently dropping function-call argument lists in five expression
contexts. Five builders iterated CST children with `buildExpression`
(which stops at the primary node) and then fell through to
`buildExpression`'s case `'ArgList'` branch — which returns NullLiteral.
Effect: `calc(foo(5))` parsed as `CalcExpression { expression: NullLiteral }`
and `let x = calc(foo(5))` set `x` to `null` instead of the function's
return value; `text(polarX(...), polarY(...))` parsed as
`text(polarX, polarY)` (just identifiers).

Fixed builders: `buildCalcExpression`, `buildUnaryExpression`,
`buildTernaryExpression`, `buildTextStatement`, `buildTspanStatement`.
All five now use `buildExpressionWithPostfix` which folds ArgList /
MemberExpression / IndexExpression chains at sibling level.

9 new tests in `tests/ast-builder-postfix.test.ts`.

#### Sample-rot fixes (commits 7486f5e, ea02745)

After commit b784152 surfaced 27 pre-existing compile failures:

- **post16/* (7 files)** — missing trailing semicolons in `apply` blocks. Fixed via diagnostic-driven semicolon insertion (the parser's "Missing ';'" diagnostic points at the exact insertion position).
- **post7, post11, post13, post14 (8 files)** — runtime `Cannot use null in arithmetic expression` / `text() x must be a number` errors. All resolved by the AST builder postfix fixes above; no per-file changes needed.
- **post24/* (14 files)** — style values with raw `var()` / `oklch(from var(...) ...)` / `color-mix(in oklch, var(...), ...)` strings, rejected by the security validator. Sweep migrated to Pathogen `Color()` + `CSSVar()` constructors via `scripts/fix-post24.ts`.
- **post16/wedge-diag-{4,16}** — silent timeout in `compile-samples.ts` (these samples do dozens of XOR ops and take ~2:27 each). Timeout raised from 120s to 600s.

`npm run compile:samples` final state: **143 compiled, 0 errors**.

## [Older Unreleased] - 2026-05-13

### Added

#### Publication & Moderation (Phase 4)
- **`ownerHandle` frozen into approvals + public index.** `WorkspaceApproval` and `PublicIndexEntry` carry the workspace owner's handle from approval time, so `/u/<handle>/<slug>` URLs can be built without a per-card D1 lookup and stay stable if the owner later renames themselves.
- **Card links now go to the SSR detail page.**
  - `/explore` cards link to `/u/<ownerHandle>/<slug>` when both fields are present; legacy entries (pre-Phase-4) fall back to the prior `/workspace/<slug--id>` URL.
  - `/featured` rendering pivots from reading `workspace:{id}` to reading `approval:{id}` so each card gets the frozen owner-handle and slug from the moderated snapshot. Stale-index defense still consults the live workspace record (skipping cards that are no longer public or have been flagged).
- **Interactive `<mini-workspace>` embed on the workspace detail page.** The admin's browser captures the rendered SVG at approval time (via `compileWithContext` + the library's `generateSvg`) and POSTs it alongside the decision. The detail page embeds the frozen code + captured SVG into a `<mini-workspace>` so visitors get the same interactive viewer blog posts use today. Legacy approvals without `svg` fall back to the prior code-only render — no flag-day required.
- **Admin moderation card now renders the SVG preview.** Expanding "Review code" lazy-mounts a side-by-side preview (SVG render + source code, side-by-side at ≥700px, stacked below). The render is cached on the view, re-used on Approve so we don't double-compile. Approve without expand triggers an invisible background compile right before sending so capture still happens. Compile errors degrade gracefully to no-SVG.
- **`scripts/backfill-owner-handle.ts`** (`npm run backfill:owner-handle`): idempotent backfill that walks `approval:*` records, looks up each owner in D1, and patches the missing `ownerHandle`. Also rewrites `public:workspaces` to carry the field. Dry-run default; `--apply` to commit; `PRODUCTION_CONFIRM=1 ... --remote --apply` for production.
- **Seed dev queues for moderation UI demo.** `npm run seed:dev` now populates `queue:review` with 3 pending submissions (Alice Draft, Bob Kite, Dan Star) and `queue:rereview` with 2 drifted entries (Alice Circle, Bob Star). Pending entries also get a `pending` state row in D1; re-review entries don't (per Phase 3 design — queue membership alone signals re-review while effective state stays `approved`). Re-running the seed clears and re-populates the queues deterministically.
- **Tests**: 5 new tests in `tests/api/workspace-publication.test.ts` covering `ownerHandle` propagation through `publishApprovalToIndex`, legacy entries deserializing without `ownerHandle`, and `WorkspaceApproval` round-trip with `svg`. Publication tests now total **29**; full suite **2966 passing**.

#### Phase 4 — admin UI overhaul + queue refinements
- **Seed sample code corrected.** The four `.pathogen` snippets in `scripts/seed-dev-users.ts` now use the project's actual syntax (parens around `for (i in 0..N)`, `calc(…)` for math, mandatory trailing semicolons on expression statements, `TAU()` for full-turn). CLI-verified to compile.
- **Admin moderation UI rebuilt** with seven tabs (Pending review / Re-review / Approved / Featured / Rejected / Flagged workspaces / Flagged users). Each card carries a thumbnail (compile-on-demand inline SVG for queue entries; R2 thumbnail or letter-avatar placeholder otherwise), owner handle, and per-tab actions.
- **Review opens a modal with `<mini-workspace>` embed.** The old inline expand-the-card preview is gone. Clicking Review on any card opens a modal with the full mini-workspace component (code panel + rendered SVG, fullscreen-friendly). The cached SVG from compile is reused on Approve so we don't double-compile.
- **Scroll fix.** The admin view's host element now sets `height: 100%; overflow-y: auto` so long queues scroll properly when many cards stack.
- **State transitions exposed in UI.** New tab-aware actions:
  - **Approved / Featured tabs**: Review · Feature/Unfeature · Unpublish · Flag ws · Flag user
  - **Rejected tab**: Flag ws · Flag user (re-approval still happens via owner re-submission through `queue:review`)
  - **Featured tab**: Unfeature without unpublishing
- **New admin endpoints**: `GET /admin/queue/approved` (filtered to currently-public workspaces), `GET /admin/queue/featured`, `GET /admin/queue/rejected`. `POST /admin/unpublish/:id` (admin force-unpublish; appends `unpublished` state row + drops from public + featured indexes; approval record retained). `POST /admin/feature/:id` and `DELETE /admin/feature/:id` (feature/unfeature an approved workspace).
- **Approval records now carry `ownerHandle`** in the seed too, fixing the `@None` rendering when the seed admin viewed featured cards before the next backfill.
- **Approved listing filters to currently-public workspaces** — `isPublic && !flagged` — so admin-unpublished workspaces don't clutter the Approved tab. They remain in KV as approval records (recoverable) but aren't shown.

#### Phase 4 — admin UI bug fixes (round 2)
- **Tab counts now refresh in parallel on view load.** The view fetches every queue concurrently on first mount and after each mutating action, so the count next to every tab label is always accurate — previously the count for a tab stayed at zero until the admin clicked into it. State transitions (approve/reject/unpublish/feature/unfeature/flag) also kick off a background `Promise.all` refresh.
- **Fixed 404 on `/admin/queue/pending`.** The tab id is `pending` but the server endpoint is `/admin/queue/review` (the underlying KV key is `queue:review`). Added a `_queuePath()` translator on the client.
- **Review modal no longer hangs on "Compiling preview…".** The modal now tracks a discrete status (`idle / loading / ready / failed`) and renders three distinct states. On compile failure or missing source, the modal shows an error banner plus the source code so the admin can still review what was submitted and reject it with notes. The old `_modalSvg === null` path stayed perpetually in "Compiling…" — gone.
- **Approved/Featured Review now reads the frozen approval snapshot.** Added `GET /admin/approval/:id` (admin-gated) returning the full approval record (`code`, `svg`, `slug`, `ownerHandle`, …). The modal prefers `approval.svg` when present (instantly interactive), falls back to background compile against `approval.code`, and finally to the source-only/error view if even the code no longer parses. Legacy workspaces with pre-mandatory-semicolons syntax render their source so the admin can decide whether to unpublish or flag.
- **Fixed: every valid workspace previewed as "Compile failed".** The SVG-capture code referenced `window.SvgPathExtended.generateSvg`, but the tsup bundle's `globalName` is `PathogenLang`. `compilerWorker.compileWithContext` succeeded but the subsequent serialize call hit `undefined.generateSvg` and threw, which the catch silently cached as a failure. Switched to `window.PathogenLang.generateSvg` (matching `playground/services/compiler-worker.ts:153`) and added a separate warn when the global isn't present at all — easier to diagnose if a bundle drift recurs.

#### Phase 4 — admin modal rendering (round 3)
- **Fixed: mini-workspace preview collapsed into the upper-left of the modal.** The admin moderation view's modal CSS rule `.modal-body mini-workspace { display: block; }` overrode the component's own `:host { display: flex; flex-direction: column; }`. With block display, `flex: 1` on the internal content-area didn't grow, so the code + preview panels each shrunk to `mini-preview`'s 200px min-height. Removed the override and let mini-workspace use its own 60dvh sizing. After the fix, the diagnostic shows content-area at the full 571px (was 200px).
- **Fixed: empty-code submissions silently rendered as a blank preview.** A stale "Testing something out!" entry from earlier dev testing carried an empty `code` field. Compiling empty source produced a valid SVG with `<path d="" />`, which the modal happily displayed as an empty pane with no error. Now empty `code.trim()` short-circuits to the failed-state modal up-front, and `POST /workspace/:id/submit-for-review` rejects empty code with `400 Workspace has no code to review` so the queue can never accumulate non-renderable entries in the first place.
- **New diagnostic**: `scripts/debug-admin-modal.ts` — Puppeteer script that signs in as the seed admin, opens the moderation page, clicks the first Review button, and dumps the modal + mini-workspace + iframe internals (computed CSS, dimensions, theme-variable cascade). Re-runnable with `npx tsx scripts/debug-admin-modal.ts`; uses a disposable session token. Saved as a reproducer for the modal layout issues so future regressions surface immediately.

#### Phase 4 — simplified card actions + flagged-user badge
- **Tab actions trimmed to the minimum per the spec.** Each moderation card now shows exactly the actions needed to move the workspace between adjacent states — Review is no longer a button; clicking the thumbnail opens the review modal.
  - **Pending review**: Approve · Reject
  - **Re-review**: Approve · Reject
  - **Approved**: Pending review (requeue) · Feature
  - **Featured**: Unfeature
  - **Rejected**: Pending review (requeue) · Flag workspace
  - **Flagged workspaces**: Unflag (→ Rejected) · Flag user
  - **Flagged users**: Unflag user
- **"⚑ Flagged user" badge propagates everywhere.** Every queue listing endpoint now resolves `ownerFlagged` from the user record and surfaces it in the entry payload (Pending / Re-review / Approved / Featured / Rejected / Flagged-workspaces). Card titles render a red `⚑ Flagged user` badge whenever the owner is flagged — visible across every queue the workspace appears in.
- **`POST /admin/requeue/:id`** (new endpoint) — moves an Approved or Rejected workspace back into `queue:review`. Drops the workspace from `public:workspaces` + `featured:workspaces`, sets `isPublic: false`, pushes a fresh review queue entry with the current code as the frozen snapshot, and appends a `pending` state row attributed to the admin (with `internal_notes = "admin requeued for review"`). Rejects empty submissions with 400.
- **Unflag-workspace semantics changed.** Previously, `DELETE /admin/flag-workspace/:id` auto-restored to approved when an approval record existed. Per the simplified flow the action is now strictly "back to Rejected" — the workspace gains a fresh rejection record (internal note "Unflagged from flagged-workspaces queue."), an appended `rejected` state row, and stays off the public + featured indexes. Admin has to send it through Pending review to publish again.
- **Approved tab excludes Featured.** Cleaner disjoint sets — featured workspaces appear only in the Featured tab and admin doesn't see the same card in two places with different action buttons.
- **Rejected tab filters out currently-flagged workspaces.** Flagging a workspace from Rejected used to leave it on both lists; the listing now skips entries whose workspace record has `flagged: true` so the Flagged Workspaces tab is the only home for them while flagged.
- **`scripts/debug-admin-tabs.ts`** (new diagnostic) — Puppeteer walker that visits every moderation tab, captures the per-card action labels, and screenshots each into `/tmp/admin-tab-<id>.png`. Lets future spec changes be verified against expected action sets in one run.

#### Local dev — shared wrangler state
- **Fixed: `/explore` and `/featured` didn't reflect admin moderation actions in local dev.** Each `wrangler dev` process maintains its own miniflare KV/D1 store under its working dir's `.wrangler/state`. The two `dev:stack` workers (Pages on :3000, API on :8787) were running from different dirs, so admin writes on the API side never reached the Pages SSR reads. Production is unaffected — both projects bind to the same Cloudflare KV namespace by id.
- **Both `wrangler dev` calls now use `--persist-to=<repo>/.wrangler/state`.** Pages dev runs from the repo root and writes/reads there directly; API dev runs from `api/` and points at `../.wrangler/state`. The seed and backfill scripts now also pass `--persist-to=../.wrangler/state` on every `wrangler kv key` / `wrangler d1 execute` invocation so the CLI surface and the runtime share the same sqlite mirror.
- **`POST /admin/reconcile-indexes`** (new admin endpoint) — rebuilds `public:workspaces` + `featured:workspaces` from the canonical `approval:*` records. Useful when index drift accumulates from a long sequence of flag/unflag/unpublish/requeue operations. Idempotent.
- **`scripts/merge-wrangler-state.ts`** (`npm run merge:wrangler-state`) — one-shot tool that lifts `api/.wrangler/state` into the new shared `.wrangler/state` so existing dev data survives the path move. Dry-run by default; `--apply` to copy. After running this once + restarting `dev:stack`, both workers see the same state.
- **Thumbnail origin is now env-configured.** SSR pages (`/explore`, `/featured`, `/u/:handle`, `/u/:handle/:slug`) previously hardcoded `https://api.pathogen.studio/thumbnail/...` for every `<img src>`. In local dev that returned 404 because the workers run on `localhost:8787`. Added `env.API_BASE` to the Pages worker config (`[vars] API_BASE = "https://api.pathogen.studio"` in `wrangler.toml`, overridden to `http://localhost:8787` in `.dev.vars`). New `thumbnailUrl(env, id, size)` helper in `website/_worker.ts` reads the env var; the four hardcoded URLs in the SSR renderers now route through it. Admin moderation view's thumbnail rendering already uses the playground's `__PATHOGEN_API_BASE__` define; tightened the URL construction to handle trailing slashes cleanly.

#### Publishing UX polish
- **Removed the Visibility section from the New Workspace form.** Workspaces always start private; publishing happens later via the overflow menu on the Workspaces card or in the workspace breadcrumb. Cleaner create dialog, and the publish decision now happens on a workspace that already has code.
- **Unified labels to "Make public" / "Make private".** The workspace-breadcrumb overflow menu used to read "Submit for review" / "Unpublish workspace"; the landing-view card menu already used the cleaner phrasing. Both surfaces now match. The disabled "Pending review" / "Pending re-review" states stay where they were.
- **Toast on successful publish**: `Thank you for sharing your workspace.` (with the existing "We review public workspaces before they appear on Explore." follow-up as the body). Make-private also gets a brief confirmation toast.
- **Publishing now requires the workspace to compile.** New `playground/services/publish-precheck.ts` runs the workspace's code through `compilerWorker.compileWithContext` before issuing the `PUT /workspace/:id {isPublic:true}`. If the parser throws, or the compile produces no path data (empty SVG), the publish is blocked and the user sees a red toast explaining why ("Can't publish — workspace has compile errors"). Both the workspace breadcrumb and the landing-view card menu run the precheck. The API Worker can't enforce the same gate (the compiler bundle is ~9 MB, beyond the Workers size limit), so the client is the authority; the empty-code rejection in `submitWorkspaceForReview` stays as belt-and-suspenders for scripted/cURL bypasses.
- **Landing-view publish menu is feature-gated.** "Make Public" is hidden for users without `UserFeature.Publishing` (matches the breadcrumb). "Make Private" stays available unconditionally — opting out is always allowed.

#### Workspace detail page — always mini-workspace
- **`/u/:handle/:slug` now always renders the workspace as a `<mini-workspace>` embed.** Previously the page only used mini-workspace when the approval record had a pre-rendered `svg` field — legacy approvals (pre-Phase-4) fell back to a thumbnail-plus-source split view. The conditional is gone: the detail page always emits `<mini-workspace>` with the frozen `<code>` child plus the inline `<svg>` (when present) so visitors get the same interactive embed used in blog posts. mini-workspace.js is loaded unconditionally.
- **New `PUT /admin/approval/:id/svg`** (admin-only, 1 MB cap) — backfills `approval.svg` on an existing approval record.
- **Modal silently backfills `approval.svg`** for legacy approvals. When an admin opens the review modal on an Approved/Featured card and the approval lacks a pre-rendered SVG, the admin's browser compiles `approval.code`, renders the SVG, and POSTs it to `/admin/approval/:id/svg` while showing the modal. The next visit to `/u/<handle>/<slug>` for that workspace ships the live preview. Best-effort: PUT failures don't block the modal — just no backfill that round. Legacy approvals whose code no longer parses (e.g. pre-mandatory-semicolons syntax) stay code-only on the detail page until an owner updates the source.

#### Publication & Moderation (Phase 3)
- **Re-review on code drift**: `PUT /workspace/:id` on an approved workspace whose new code hash differs from `approval.codeHash` pushes a `queue:rereview` entry (idempotent on workspaceId — re-edits during re-review refresh the queue entry). No new state row is appended — the effective state stays `approved`, matching what visitors see on /explore. Workspace responses carry a separate `rereviewPending: boolean` flag (true when in the re-review queue) so the playground can render "Pending re-review" without lying about visibility state. `<app-breadcrumb>` reads `workspaceRereviewPending` and disables Unpublish during re-review.
- **Flagging endpoints**:
  - `POST /admin/flag-workspace/:id` — flips `workspace.flagged`, pushes to `queue:flagged-workspaces`, drops from public + featured, appends a `flagged` state row with internal notes. Approval record retained for restoration.
  - `DELETE /admin/flag-workspace/:id` — clears the flag and re-publishes from the approval record (restoring featured if `featuredAt` was set).
  - `POST /admin/flag-user/:id` — sets `users.flagged = 1` in D1, cascades through every approval the user owns to drop them from public + featured. Optional `internalNotes` body is stored in `users.flag_notes`.
  - `DELETE /admin/flag-user/:id` — clears the flag and restores every approval to public (and featured for `featuredAt` records), unless the workspace itself is independently flagged.
- **Listing endpoints**: `GET /admin/queue/rereview`, `GET /admin/queue/flagged-workspaces`, `GET /admin/queue/flagged-users`. All require `isAdminUser` (session) or the `?token=` fallback.
- **Admin UI**: `<admin-moderation-view>` extended with four tabs (Pending review / Re-review / Flagged workspaces / Flagged users), per-tab lazy-load on first visit, refresh button. Flagged tabs render with a single Unflag action. Approve handler now clears both the review queue and the re-review queue.
- **Workspace detail page**: SSR'd at `/u/:handle/:slug` in `website/_worker.ts`. Resolves the user by handle, scans approval records for `(userId, slug)`, then renders the frozen `approval.code` snapshot plus breadcrumb (`Explore › @handle › name`), description, thumbnail (with OG meta), and "Open in playground" link. Falls back to 404 when the approval is missing or the underlying workspace has been unpublished/flagged. Profile page (`/u/:handle`) cards now link to `/u/:handle/:slug` when a slug exists.
- **Workspace lifecycle cascades**: re-review queue is also cleared on workspace delete (alongside the Phase 2 review queue, approval, rejection, public-index and featured-list cleanup).
- **Tests**: 9 new tests in `tests/api/workspace-publication.test.ts` covering re-review queue idempotency, flag-queue helpers, `listApprovalsForUser`, the full flag-user cascade (drop + restore with featured preservation), and `findApprovalForUserAndSlug` per-user scoping. Total 24 publication tests; `MemoryD1` extended for the `users.flagged` UPDATE used by flag/unflag.
- **Profile-page defense**: `/u/:handle` stale-index check now also drops cards where `workspace.flagged === true`, even if the public-index entry somehow wasn't removed. Belt-and-suspenders against future cascade gaps.
- **Docs**: `docs/publishing.md` extended with the re-review behavior (auto-queue on edit, "Pending re-review" label, prior snapshot stays public) and the workspace detail page URL structure.

#### Publication & Moderation (Phase 2)
- Append-only state machine: `appendState` / `getEffectiveState` / `getStateHistory` over the `workspace_publication_states` D1 table (states: `unpublished`/`pending`/`approved`/`rejected`/`flagged`). The latest row for a workspace is the effective state.
- Frozen-snapshot review queue: `pushReviewQueue` / `getReviewQueueEntry` / `listReviewQueue` / `removeFromReviewQueue` in `website/api/moderation.ts`. Queue entries carry the code + hash + slug at submission time so admins approve exactly what was submitted, even if the live workspace is edited in the interim.
- Approval and rejection KV records (`approval:{id}` / `rejection:{id}`) with full audit metadata (`approvedByUserId`, `approvedAt`, `featuredAt`, `internalNotes`). Rejection notes are internal-only and never surfaced to the owner.
- Slug uniqueness per user: `pickUniqueSlugForUser` scans existing approvals and appends an `-id-prefix` suffix on collision so `/u/<handle>/<slug>` URLs always disambiguate.
- Public index: 100-entry cap, `approvedAt`-descending ordering, populated only by approvals via `publishApprovalToIndex` (legacy `addToPublicIndex` removed; `removeFromPublicIndex` kept for delete cascade).
- New API endpoints:
  - `POST /workspace/:id/submit-for-review` — owner-only, Publishing-gated; freezes a queue snapshot and appends a `pending` state row.
  - `GET /admin/queue/review` — admin-only (session or `?token=` fallback); returns frozen queue entries with owner handles resolved.
  - `POST /admin/review/:id` — admin-only; `decision: 'approve' | 'reject'`, optional `feature: bool`, optional `internalNotes`. Approve writes the snapshot to `approval:{id}`, appends `approved`, flips the workspace's `isPublic`, adds to the public index, and optionally features. Reject writes `rejection:{id}` with internal notes and appends `rejected`.
- `PUT /workspace/:id` now routes `isPublic` transitions through the moderation flow: true→false on an approved workspace appends `unpublished` and removes from the index; false→true triggers submission (queue + pending state) without flipping the workspace's public flag until approval.
- Workspace responses now include `publicationState` (derived from the latest state row). Listing, get, create, update, and submit all return it.
- `<admin-moderation-view>` SPA route at `/admin/moderation` gated by `UserFeature.AdminModeration`. Pending tab renders frozen-code cards with Approve / Reject (with internal-notes textarea) / Feature toggle. Re-review and Flagged tabs are placeholders for Phase 3.
- `docs/publishing.md` — user-facing reference covering submission, the review timeline, the 100-workspace cap, edits-after-approval behavior, and how the `/u/<handle>/<slug>` URL is constructed. Registered in `scripts/build-docs.ts` `DOC_FILES`.
- `scripts/backfill-publication-state.ts` (`npm run backfill:publication-state`): idempotent backfill that synthesizes approval records + `approved` state rows for pre-Phase-2 `isPublic:true` workspaces and rebuilds the public index. Dry-run by default; `--apply` to commit, `--remote` (with `PRODUCTION_CONFIRM=1`) to target production.
- 15 new unit tests in `tests/api/workspace-publication.test.ts` covering the state machine (append-only, latest wins, rejected→resubmitted), frozen-snapshot rule, slug uniqueness, public index cap + ordering, and approval/rejection round-trips. `MemoryD1` and `MemoryKV` helpers extended with `workspace_publication_states` and `.list()` support.

#### Phase 2 — state-aware UI + cleanup
- `workspacePublicationState` added to playground store; populated from `/workspace/:id` responses and threaded into `<app-breadcrumb>`. The Publish action now renders state-aware labels: "Submit for review" (unpublished/rejected), "Pending review" (disabled, pending), "Unpublish workspace" (approved). Owners see the same label after the API silently rejects them — preserves the silent-rejection contract.
- `seed:dev` now writes `approval:{id}` records and `approved` state rows for every seeded `isPublic:true` workspace, so a fresh dev DB is consistent with the Phase 2 flow without requiring a follow-up backfill.
- `backfill-publication-state.ts` enforces per-user slug uniqueness — pre-existing approval slugs are loaded once, in-progress writes also disambiguate against each other, and colliding entries get an `-id-prefix` suffix at synthesis time.
- `DELETE /workspace/:id` now cascades to moderation state: drops `approval:{id}` / `rejection:{id}`, removes from `queue:review`, `public:workspaces`, and `featured:workspaces`. State-history rows in D1 are retained (audit trail).

#### Publication & Moderation (Phase 1)
- New `0002_moderation.sql` D1 migration adds `users.flagged` + `users.flag_notes` columns and an append-only `workspace_publication_states` audit table (state ∈ `unpublished`/`pending`/`approved`/`rejected`/`flagged`). The state table is the source of truth for upcoming moderation workflows; Phase 1 lays the schema without writing to it yet.
- `UserFeature` enum (`Publishing`, `AdminModeration`) and server-side `computeUserFeatures` helper in `website/auth/features.ts`. `/me` and SSR (`window.__SSR_CURRENT_USER`) now carry a `features: UserFeature[]` array; clients gate UI on `hasFeature(user, UserFeature.Publishing)` instead of raw `verifiedAt` / `flagged` checks. The deny-list reason never reaches the client.
- `POST /workspace` and `PUT /workspace/:id` now reject `isPublic: true` transitions unless the caller has `UserFeature.Publishing` (verified email + not flagged + authenticated session, never an anonymous header).
- Playground gates: the "Make this workspace public" checkbox in `new-workspace-view` and the Publish menu item in `app-breadcrumb` are hidden unless the current user has the Publishing feature. Owners of an already-public workspace retain the Unpublish action regardless.
- `ADMIN_EMAILS` env-var-gated admin identity (`isAdminUser`). Admin membership is evaluated fresh from env on every request — no `is_admin` column, no DB-mediated privilege escalation vector.
- New `scripts/seed-dev-users.ts` (`npm run seed:dev`) seeds 10 mock users (admin, verified, unverified, flagged) with sample workspaces into the local dev D1 + KV. Idempotent (deletes seed-prefixed rows first), refuses to run with `PRODUCTION=1`.
- Backstop tests: `tests/auth/features.test.ts` pins the Publishing/AdminModeration deny-list rules across 11 cases (case-insensitive admin matching, multi-entry lists, pre-migration row tolerance).

## [Unreleased pre-moderation] - 2026-05-11

Post-0.7.0 polish. Custom filter pipeline added with six constructors (Noise, Glow, Emboss, ElevationShadow, InnerShadow, Pixelate). Inspector population is now correct on every blog post; sitewide typography refresh; homepage and docs responsive cleanup.

### Added

#### Filters
- **`NoiseFilter()`** — five-preset (`Grain` / `Paper` / `Speckle` / `Static` / `Gradient`) custom filter with trailing-block configuration, per-property finite-number guards, deterministic seed derivation, and read-side property access for `id` / `style` / `scale` / `octaves` / `amount` / `monochrome` / `seed` / `blend` / `contrast` / `stitch`.
- **`GlowFilter()`** — outer halo or inner edge light selected via the `GlowMode` enum (`Outer` | `Inner`). Knobs: `color`, `radius`, `spread`, `opacity`.
- **`EmbossFilter()`** — `feSpecularLighting`-based bevel with named light parameters: `angle`, `elevation`, `depth`, `strength`, `shininess`, `lightColor`, `smooth`.
- **`ElevationShadowFilter()`** — Material-style three-layer depth shadow tuned by a single `elevation` knob (0–24); `color`, `direction`, `tightness` for fine control.
- **`InnerShadowFilter()`** — inset shadow (the capability native CSS `drop-shadow()` cannot express); `offsetX`, `offsetY`, `blur`, `color`, `opacity`.
- **`PixelateFilter(width, height, radius)`** — mosaic via `feFlood` + `feTile` + `feMorphology`. Positional canonical form; trailing-block form also supported.
- `BlendMode` enum — CSS blend-mode keywords as enum members (`Multiply`, `Screen`, `Overlay`, `ColorBurn`, `ColorDodge`, `HardLight`, `SoftLight`, `Darken`, `Lighten`, `Difference`, `Exclusion`, `Normal`).
- `GlowMode` enum — `Outer` and `Inner` selectors for `GlowFilter`.
- `NoiseFilterScale` enum — `Fine` / `Medium` / `Coarse` packaged as discoverable members (each evaluates to the same string value the scale write handler accepts, so the enum form and the bare-string form are equivalent).
- Filter values auto-wrap to `url(#id)` when assigned to the `filter` style property in a style block; reused via `let` binding (one `<filter>` def, many references); composable across layers via `GroupLayer` stacking.

#### Documentation
- New `docs/filters.md` reference page covering all six custom filters, the `BlendMode` and `GlowMode` enums, the per-filter primitive chains, and the auto-wrapping `filter:` style property.
- New blog series: ["Custom Filters in Pathogen: First-Class Visual Effects"](website/blog/custom-filters-pipeline.md) (Part 1) and ["The Full Filter Family: Glow, Emboss, Shadows, Pixelate"](website/blog/custom-filters-family.md) (Part 2), with 23 side-by-side parameter-sweep samples between them.

#### Compiler / CLI
- `data-layer-name="<layer>"` attribute on every layer-rendered element (path, group, **and every text sibling of a multi-text TextLayer**) in CLI mode — not just playground. Enables the blog mini-workspace inspector to toggle every element of a multi-text layer in one query (`[data-layer-name="X"]`). CLI also keeps `id` on the first sibling for backward compat with consumers that resolve cross-references by id-fragment.
- BBWP server (`src/cli.ts`) gained directory-aware import resolution (extensionless paths, 308 redirects to `<path>/` for index files, `.ts → .js` on-the-fly transpilation) so the GPU render pipeline can resolve relative imports without bundling. Closes a latent regression that broke `--render-gpu` for any sample using mesh / freeform / conic / topo gradients.
- `src/render/build-tree.ts` now forwards `useImageGradients` and `gpuGradientUrls` through to `buildDefs`. Previously dropped silently, so GPU-rendered BBWPs were emitting CLI-fallback flat-color rects for non-linear gradients.
- `scripts/compile-bbwp.ts` mw.html template now references `public/components/...` (the actual layout) instead of the broken `public/pathogen/components/...` path. Every previously generated BBWP mw.html had 404'd script tags; new BBWPs load mini-workspace + theme-toggle correctly.

#### Homepage
- Dynamic version eyebrow ("built on Pathogen v{version}") that codegens from `package.json` at build time. Aligns the displayed VS Code extension name with the published marketplace handle.

### Changed

#### Typography
- DM Serif Display headings sitewide (homepage, blog, docs) — replaces the previous mixed heading stack with a single editorial display face.

#### Docs
- Sidebar background made transparent so the page backplate (grain + halos) reads through.
- Horizontal page scroll locked; wide content (column text, tables) capped at the column width with internal scroll, so the page no longer drifts sideways on long lines.

#### Tooling
- `npm` workspaces array scoped to `packages/pathogen-language-server` only (was `packages/*`). The previous glob registered `packages/vscode-pathogen` as a workspace member with the same `"name": "pathogen-lang"` as the root, producing a duplicate-version lock-file entry that failed Cloudflare Pages' `npm ci`. The VS Code extension is now installed via `cd packages/vscode-pathogen && npm install`.

### Fixed

#### Blog mini-workspace inspector
- **Inspector panels (Layers / Palette / CSS Variables) now populate on every blog post.** Mini-workspaces read inspector data from a `<script id="pathogen-metadata">` block baked into each pre-compiled `.svg`. The block is emitted only when the CLI is invoked with `--include-metadata`, which the canonical `npm run compile:samples` script passes but the manual `npx tsx src/cli.ts …` recipe (previously documented in `website/blog/CLAUDE.md`) did not. Seven blog posts (Clifford Attractor, several gradient and text posts) shipped SVGs without metadata; all newly compiled samples now include it. `website/blog/CLAUDE.md` updated to recommend `npm run compile:samples` and warn against the hand-rolled command.
- **Toggling a multi-text TextLayer now hides every text element, not just the first.** Pre-fix, only the first sibling carried `id="<layer>"` and the inspector's `[id]` query matched one element of N. Fixed by emitting `data-layer-name` on every sibling (newly compiled SVGs) plus a sibling-walk fallback in `mini-preview.setLayerVisibility` (pre-existing SVGs whose `.pathogen` sources can't currently be re-compiled).
- **Layer-toggle handler now reaches the compiled SVG.** The post-0.7.0 sandboxed-iframe migration (commit `354c4b9`) moved the SVG into the iframe document, but `mini-workspace.ts` was still querying `preview.shadowRoot` — a path that returned `null` after the migration, so toggles silently no-op'd. New `mini-preview.setLayerVisibility(name, visible)` method forwards the toggle into the iframe document, mirroring the existing `setCssVar` pattern, with a pending-toggle buffer for events that arrive before the iframe finishes parsing.

#### Renderer
- **Serializer no longer leaks `<__text-siblings__>` into output when a multi-text TextLayer is nested inside a GroupLayer.** The synthetic wrapper was unwrapped at top-level but not in `serializeBlockChild`'s recursive path. Nested TextLayers (e.g. the Clifford Attractor `concept` group containing `labels` and `formula`) serialized with literal `<__text-siblings__>` tags that browsers treated as unknown elements, silently dropping every wrapped `<text>`. Two regression tests added in `tests/render/serialize.test.ts`.

#### Homepage
- Mobile-responsive pass: nav grid overflow fixed; six showcase tiles, three tool cards, and the latest-blog card all reflow under 768px without horizontal scroll.

### Development
- `--include-metadata` documented in `pathogen-lang --help`; behavior unchanged (still off by default — the security contract in `tests/security/compiler-emission.test.ts` forbids any `<script>` in default compiler output).
- `tests/render-snapshots.test.ts` fixtures updated to reflect the new `data-layer-name` attribute (intentional API addition; not a refactor regression).
- All ~67 blog sample SVGs across post1–post16 + post22–post23 regenerated via `npm run compile:samples -- --force`. GPU-rendered samples in post2/3/4/5/24 still error in local Puppeteer with `Waiting failed: 10000ms exceeded`; their existing committed SVGs work via the inspector's legacy fallback path.

## [0.7.0] - 2026-05-09

A platform release. Pathogen now lives at `pathogen.studio` — its own
domain, its own brand, its own two-project Cloudflare architecture
(Pages for the site, Workers for the API). The companion repo was
renamed to `pathogen-lang` to match. The `/pathogen/` URL prefix that
used to scope the SPA under `pedestal.design/pathogen/...` is gone;
URLs are now apex-relative (`pathogen.studio/`, `/workspaces`, `/blog`).
Old URLs 301 to their new locations.

### Added

#### Auth
- Passwordless email-OTP accounts via Cloudflare Email Sending + D1 (commit `d4faf4a`).
- Session cookie is `Domain=.pathogen.studio` so the same login works on `pathogen.studio` (Pages) and `api.pathogen.studio` (API Worker) without a token-auth refactor.
- SSR seeds `window.__SSR_CURRENT_USER` on every server-rendered page so the account chip renders signed-in on first paint without a client-side fetch.
- `/auth/start` rate-limit: per-email + per-IP counters in KV.
- Public profile pages (`/u/:handle`).

#### Marketing site
- Atmospheric homepage at `pathogen.studio/` — code-and-render hero, three tool cards (GitHub / CLI / VS Code), latest-blog card, six showcase tiles wired to real Pathogen-rendered SVGs from the blog samples directory.
- "Pathogen Studio" rebrand — Baumans wordmark with lavender-gradient "Studio", DM Serif Display headings, Inconsolata mono code, atmospheric grain + halos backplate. Single-CTA-per-view contract.
- Top-nav redesign with anti-shift Grid layout, glassy tab pills, Material-icons sprite for overflow menu.
- Sign-in modal + claim-anonymous-workspaces flow.

#### API Worker (`api/`)
- New Cloudflare Workers project at `api.pathogen.studio` hosting every `/api/*` endpoint (`/auth/*`, `/me`, `/u/:handle`, `/workspaces`, `/workspace/:id`, `/preferences`, `/thumbnail/*`, `/admin/*`).
- `[[send_email]]` binding declared in version-controlled `api/wrangler.toml` (Pages projects don't accept this binding — that constraint drove the split).
- Origin-allowlist CORS with credentials (`pathogen.studio`, `www.pathogen.studio`, `localhost:3000`); wildcard `*` was incompatible with credentialed cookie auth.
- GitHub Action (`.github/workflows/deploy-api.yml`) auto-deploys the Worker on `git push` when `api/`, `website/api/`, or `website/auth/` change.

#### Tooling
- `scripts/migrate-anonymous-workspaces.ts` — one-off (now committed) for re-keying workspaces from anonymous browser IDs to an authenticated user.
- `scripts/build-website.ts` codegens `playground/utils/version.ts` from `package.json` so the displayed `built on Pathogen v{version}` subtitle stays in sync with releases.
- `scripts/verify-nav-stability.ts` extended to cover the new prefix-less URLs.
- `npm run dev:stack` runs both wranglers in parallel (Pages :3000, API :8787).
- `concurrently` dev-dep for the parallel-wrangler script.

### Changed

#### Domain + URL routing
- **Site moved**: `pedestal.design/pathogen/...` → `pathogen.studio/...`. Pages custom domain attached.
- **API moved**: `pedestal.design/pathogen/api/...` → `api.pathogen.studio/...`. The Pages worker no longer serves API traffic.
- **`/pathogen/` URL prefix dropped**. URLs are now apex-relative — `pathogen.studio/workspaces`, `pathogen.studio/blog/clifford-attractor`, `pathogen.studio/docs`. The old prefix path 301-redirects to its new location for backward compatibility with bookmarks and external links.
- SPA `BASE_PATH` is now `''` (was `/pathogen`). All internal navigation, top-nav tabs, and SSR-emitted hrefs use prefix-less paths. Build output writes directly to `public/` (was `public/pathogen/`).
- SPA shell renamed to `public/spa.html` so it doesn't collide with the SSR-rendered apex (`/index.html`).
- SPA `API_BASE` defaults to `https://api.pathogen.studio` at build time; override via `PATHOGEN_API_BASE` env var for local dev. All SPA fetches use `credentials: 'include'`.
- Canonical URLs, sitemap.xml, robots.txt, schema.org JSON-LD, og:url tags all reference `https://pathogen.studio` (no `/pathogen/` prefix).

#### Cloudflare config
- Pages `wrangler.toml` shrunk: drops THUMBNAILS R2 binding (only the API Worker reads/writes thumbnails now), drops email-related env vars (live in `api/wrangler.toml` instead). Keeps WORKSPACES (KV, read-only for SSR) and USERS_DB (D1, read-only for `getSsrUser`).
- All Cloudflare bindings now version-controlled in two `wrangler.toml` files (root for Pages, `/api/wrangler.toml` for Workers). No dashboard-managed config.

#### Repo + branding
- GitHub repo renamed `svg-path-extended` → `pathogen-lang`.
- npm package renamed `svg-path-extended` → `pathogen-lang`. Verified unpublished (`npm view` returned 404 for both names) so no consumers were affected. CLI binary now exposes both `pathogen` (short, daily ergonomics) and `pathogen-lang` (full, matches package name) as aliases — the legacy `svg-path-extended` binary entry was removed.
- Browser global `window.SvgPathExtended` renamed `window.PathogenLang`. Internal-only — set via `tsup.config.ts` `globalName`; no external consumers.
- CF resource names (`svg-path-extended` Pages project, `svg-path-extended-thumbnails` R2 buckets, `svg-path-extended-users` D1 database) intentionally **kept** — those are independent identifiers and renaming would require resource recreation + data migration.
- README title updated to `pathogen-lang` with a description that names the npm package.
- Visible "built on svg-path-extended v1.0" subtitle in nav header + homepage footer changed to "built on Pathogen v{version}", with `{version}` codegenned from `package.json`.
- Default playground welcome comment ("Welcome to svg-path-extended!") updated to "Welcome to Pathogen!".

#### Compiler / language services
(Older changes since the previous CHANGELOG entry — these landed before the API split:)
- @font directive: surface fetch failures + uncover errors masked by diagnostics (commit `bff7fef`).
- Color literals: support modern CSS L4 forms (`oklch(L% C H)` etc) with source-located errors (commit `6e9a7b3`).
- Boolean operations: §2.13–2.16 fixes for shared-edge disambiguation, contour chain ordering, U-bowl notch, RW-l-50 bowl-as-disk (commits `a3d29da` through `220d0fa`).
- Various boolean-ops audit closes (Class B/C/D, O3–O6, PF-A-60).

### Fixed

- Workspace migration: 50 workspaces stranded under anonymous browser IDs after the auth migration are now re-keyable to an authenticated user via the new migration script.
- SSR-side cookie reading (`getSsrUser`): correctly extends `SsrUser` with `id` + `email` so the seeded `window.__SSR_CURRENT_USER` matches the SPA's `CurrentUser` type.
- `wrangler.toml` `[[send_email]]` block was rejected by CF Pages CI — resolved by moving the binding to the new Workers project's `wrangler.toml` (commit `bad0b93`).

### Removed

- Pedestal-Design apex landing page (`website/index.html`) — the Pages worker now SSRs the apex directly via `renderHomepage()`.
- Pages worker's `apiHandlers` + `handleApiRequest` + wildcard CORS — moved to the API Worker. The Pages worker is now SSR + static-fallback only; old `/pathogen/api/*` URLs return 410 with a hint pointing at `api.pathogen.studio`.

## [Unreleased] - 2026-04-10

### Added

#### Core
- Spread operator (`...`) and destructuring (array `[a, b, ...rest]`, object `{ x, y: alias, ...rest }`) in let declarations and for-each loops.
- Object merge (`<<`) operator for ObjectValue types.
- Multi-param trailing blocks for `.reduce()` and `.mapSlice()`.
- `squareGrid()`, `triangleGrid()`, and `hexagonGrid()` stdlib functions for grid-based pattern generation.
- `generateSvg()` exported from library — shared SVG document assembly used by CLI and VS Code preview.

#### Parser
- **Lezer migration complete** — Lezer is now the sole parser (Parsimmon fully removed). 213-line grammar replaces 1,558 lines of Parsimmon code.
- Mandatory semicolons on expression statements (function calls, assignments, let, return); block statements (for, if, fn, apply) do not require them.
- Optional trailing semicolons on text and tspan statements.
- Comments preserved in AST (top-level and block bodies) for formatter round-tripping.
- Fix: object literal property values now correctly parse function calls, method chains, and member access (previously dropped to NullLiteral).

#### Language Services
- **Leading-character completion triggers** — typing `@`, `&`, `$`, or `${` no longer dead-ends in a parse error. The completion menu now offers contextual snippets:
  - `@` / `@f` / `@font` at statement start → `@font "Name" weight;` directive and `@{ }` PathBlock snippets.
  - `@` and `&` in expression position (after `=`, `(`, `,`, etc.) → `@{ }` PathBlock and `&{ }` TextBlock.
  - `&` at statement start → `&{ }` TextBlock.
  - `$` at statement start → `let`, `PathLayer`, `TextLayer` declaration snippets.
  - `$` in expression position → `${ }` style-block snippet.
  - `$` or `${` inside a backtick template literal → `${expr}` interpolation snippet.
  - Fix: backtick interpolations were misclassified as style blocks and offered CSS property completions; now the engine distinguishes the two contexts.
- **Completion engine rewrite** — generated from TypeScript API declarations via ts-morph instead of hand-maintained static data.
  - All 12 enums with 42 members now have completions.
  - 79 stdlib/constructor completions with accurate signatures.
  - 14 type member sets (93→118 total members) including Color instance (21 members), BoundingBox, and all layer types with `apply` method.
  - Type inference: Color constructors, hex literals, `layer()`, stdlib path functions, method return types (boundingBox→BBox, get→Point, lighten→Color), assignment propagation, map/loop callback parameters, object literal properties.
- **Formatter** — AST-based code formatter implementing the Pathogen style guide.
  - Always multi-line: arrays, objects, style blocks, enums, path blocks, text blocks, apply blocks.
  - Trailing commas on collections. One item per line.
  - Function call/def wrapping (5+ args, 4+ with complex args). Method chain wrapping (3+ steps).
  - Trailing block formatting with gradient stop column alignment.
  - Comment preservation through round-trips.
  - Range formatting and on-type formatting (auto-indent after `{`).
  - Lezer fallback for formatting code with missing semicolons.
  - Preserves trailing newline at end of file.
  - Semicolons on function calls and method calls in PathCommand context.
- **Diagnostics** — contextual Lezer error messages with 20+ specific patterns. Server-side debouncing (200ms default, 500ms mid-expression). Better message for incomplete member access (`bg.` → "Expected property or method name after 'bg.'"). Map/reduce callback errors include iteration index.
- **Semantic highlighting** — constructor types, enum names/members, SVG path commands classified via semantic tokens. All classification sets derived from generated data (no hardcoded lists).
- **Code actions** — extract variable, extract function, inline variable refactoring. Missing semicolon and typo suggestion quick fixes.
- **Code lens** — reference counts above variable, function, and enum declarations.
- **Inlay hints** — expanded type inference for Color, gradients, Mask, ClipPath, method returns, StyleBlockLiteral, merge operator.

#### VS Code Extension
- **Language server activation** — the extension now activates and runs all 16 language server features from installed .vsix packages.
- **Live preview panel** — compiles Pathogen source to SVG in real-time via bundled IIFE compiler.
  - Pan/zoom with navigator minimap.
  - Layer inspector with visibility toggles, color swatches, type badges.
  - CSS variable color pickers with live recompilation.
  - Color palette showing all colors across layers.
  - Recompile button (re-roll random values) and reset button.
  - ViewBox detection from source comments.
- **TextMate grammar** — constructor keyword highlighting (LinearGradient, Color, Point, etc.), trailing block pipe-param syntax (`{|g| ...}`).
- **Snippets** — 29 total (up from 18): gradients, Color, textblock, styleblock, Point, CSSVar, viewBox, new file template.
- **Build pipeline** — `npm run build:vscode:install` builds and installs the complete .vsix with all dependencies bundled.
- **Workspace integration** — captures workspace root, task definitions, problem matcher for CLI errors.

#### Playground
- Inspector panel with stacked layers, palette, and CSS variable panels.
- Completion UX fix — error panel no longer covers completion popups (z-index override + longer debounce during member access).
- Error panel badge showing error count.
- Auto-balanced brackets and quotes — typing `(`, `[`, `{`, `"`, `'`, or `` ` `` now inserts the matching closer, so a stray opener no longer cascades into a chain of "missing token" parse errors.

#### Documentation
- Formatter style guide and 25-question formatting questionnaire.
- 10-phase VS Code developer experience roadmap.
- Deduplication audit proposal for language-services layer.
- Cross-system feature lifecycle documentation.
- Quality standard added to project CLAUDE.md.
- Grid functions blog post with interactive demos.
- Chained Bézier splines and heading/turn blog posts.
- Radial bar chart blog post.
- VS Code developer experience blog post with hero screenshot and architecture diagram.

### Fixed

#### Core
- Object literal property values dropping function calls — `{ y: randomRange(calc(...), calc(...)) }` was parsed as NullLiteral. Fixed by using `buildExpressionWithPostfix()` for property values.
- Map/reduce error messages now include iteration index and callback line number.
- Boolean XOR diagonal artifacts with arc-heavy paths.

#### VS Code Extension
- Preview panel white screen on initial open — captured editor reference before panel creation, use `preserveFocus: true`.
- CSS variable panel losing variables after color override — scan original source instead of compiled result.
- Missing transitive dependencies (semver, minimatch, brace-expansion, balanced-match, concat-map) added to build script.
- Removed non-functional preview command (re-added with working implementation).
- Language server type shim updated for all new exports.

#### Playground
- Uncommitted playground changes from prior sessions pushed to production.

### Changed

#### Development
- Lezer is sole parser — Parsimmon fully removed.
- Completion data generated from TypeScript API declarations instead of hand-maintained.
- Semantic token classification derived from generated data (TYPE_MEMBERS, ENUM_MEMBER_MAP, NAMESPACE_MEMBERS, PATH_COMMAND_HOVER) instead of hardcoded sets.
- VS Code extension CLAUDE.md updated with readiness status and development lifecycle.
- Quality standard: no placeholders in shipped code, end-to-end verification mandatory, be honest about readiness.

## [Unreleased] - 2026-03-21

### Added

#### Core
- PathBlock extensions: `drawTo(x, y)` convenience method, chamfers (symmetric, asymmetric, per-vertex corner beveling), fillets (circular arc rounding, elliptical arc rounding with optional rotation), and boolean operations (curve-preserving union, difference, intersection, xor).
- Color literals: bare hex (`#cc0000`, `#f00`, `#cc000080`, `#f008`), CSS color function literals (`rgb`, `hsl`, `oklch`, `hwb`, `lab`, `lch`, `oklab`), and percent suffix (`20%` → `0.2`) disambiguated from modulus by spacing.
- Booleans: `true`/`false` keywords as semantic subtypes of number, displaying as `"true"`/`"false"` in `log()` and template literals. Comparisons, logical ops, `has()`, `empty()`, `includes()` now return `BooleanValue`.
- Built-in enums: `Easing`, `Interpolation`, `SpreadMethod`, `GradientUnits`, `Direction`, `ConicSpread`, `InnerFill`, `TopoMethod` with dot notation access (e.g., `Easing.Smoothstep`).
- User-defined enums: `enum Name { Member, Member = value }` with auto-valued (lowercase string) and explicit typed values (string, number, angle, color, boolean).
- Font integration: `@font` directive for declarative font loading and `PathBlock.fromGlyph()` for converting text to manipulable path geometry via opentype.js.
- `TextBlock.toPathBlock()` for flattening text glyph outlines into a single PathBlock, removing font dependency at SVG render time.
- `TextBlock.toCodeSnippetBlock()` for generating syntax-highlighted code snippets as a GroupLayer with Pathogen-aware token coloring.
- `.intersects()` and `.intersectionPoints()` on PathBlock and ProjectedPath, mirroring the TextBlock intersection API.
- `heading(angle)` and `turn(delta)` for tangent context control — enables tangent-dependent functions immediately after `M` without workarounds.
- `cubicSpline`, `quadSpline`, `clippedQuadSpline` as stdlib functions (moved from userland definitions).
- `PolarVector(angle, distance)` value type with `turn()`, `scale()`, `mirror()` methods and `polarCubicBezier` stdlib function.
- Array `.map` with block syntax (`{|param| body}`) and `.slice` with inclusive end indexes and negative index support.
- `Point.offset(other)` method returning `{dx, dy}` vector for calculating component-wise displacement between points.
- `--print-logs` CLI flag to dump `log()` output to stderr and `--log-file=<path>` to write structured `LogEntry[]` as JSON.

#### Playground
- Consolidated inspector panel with stacked layers, palette, and CSS vars in a 2:3:1 flex layout.
- GroupLayer expand/collapse with chevron toggle and full-row click targets.
- Button bar in breadcrumb: Annotated/Console/Inspector as unified toggle group.
- RadialGradient interactive examples in blog post with SVG CDATA fix.
- Mobile inspector as fixed bottom drawer at 60vh.

#### Documentation
- PathBlock Extensions blog series (4 parts): introduction, parametric sampling, fillets & chamfers, boolean operations.
- Color Literals blog post with 6 interactive mini-workspace demos.
- TextBlock & Font Integration blog series (2 parts): measure-first text, glyph extraction with `PathBlock.fromGlyph()`.
- Published 6 previously unpublished doc files: textblock, color, gradients, cssvar, masks, objects.
- Font Integration section added to path-blocks.md.
- Heading/turn and chained bezier spline documentation with visual demos.
- PolarVector documentation and demo.

### Fixed

#### Core
- Boolean assembly artifacts on overlapping curved paths — replaced greedy closest-endpoint matching with Weiler-Atherton style ring traversal using original path ordering and explicit intersection links.
- Multi-subpath relative move compounding in `commandsToRelativeD` — after `z`, relative `m` deltas were computed from wrong start point, cascading holes in chained boolean operations.
- Scientific notation parsing in `parseAndTrackPathString` — numbers like `1.83e-15` from stdlib functions were split incorrectly.
- CLI tspan rendering now outputs style attributes on `<tspan>` elements.
- CLI `@font` path resolution: font paths now resolve relative to the source file, not cwd.
- opentype.js ESM loading: async initializer using dynamic `import()` with `require()` fallback for vitest compatibility.

#### Playground
- CSS 404s and CodeMirror error highlight crash.
- Inherited GPU gradient stops: resolve stops from parent for rasterized gradient types (conic, mesh, freeform, topo) since they can't use SVG `xlink:href`.
- Mini-workspace default background changed from white to transparent.
- "Open in Playground" URL length limits — replaced URL state param with localStorage.
- Navigator now walks all descendants to find paths inside `<g>` groups.

#### Deployment
- Cloudflare Pages build: downgrade `@eslint/js` from v10 to v9 to resolve peer dependency conflict with eslint 9 — blocked 13 deployments since Mar 9.

### Changed

#### Development
- TypeScript & ESLint hardening: stricter `tsconfig` options, `eslint-config-airbnb-extended`, Prettier formatting, `~50` evaluator interfaces extracted to `evaluator/types.ts`.
- Playground and website worker fully migrated from JavaScript to TypeScript.
- Test infrastructure: SVG path parser, custom Vitest matchers (`toMatchSVGPath`, `toContainSVGCommands`, `toHaveSVGCommandCount`, `toClosePath`), and `~47` weak assertions remediated across 6 test files.
- Project agents added for code review, content review, and test running.
- Blogging playbook and website guidelines reorganized; Instructional Designer/Writer added as 4th review persona.
- Text collision debugging guideline; agentic review now required before committing new features.
- Removed old `.js` utility files replaced by TypeScript migration.
- Gitignored `tests/tmp/` and `website/bbwp/` render artifacts.

## [Unreleased] - 2026-03-08

### Added

#### Core
- First-class `Color` type with OKLCH color space, harmony generation (`complement`, `triad`, `tetrad`, `analogous`, `splitComplement`), palette generation (`tints`, `shades`, `tones`), contrast utilities (`contrastRatio`, `wcagCompliant`, `accessiblePair`), and component access (`hue`, `chroma`, `lightness`, `alpha`).
- `CSSVar()` constructor for referencing CSS custom properties with `var()` output and OKLCh fallback extraction.
- CSS relative color syntax for CSSVar-backed Colors — `Color(cssvar, 'oklch(from var(--x) l c h / 0.5)')`.
- CSS `@property` declarations via `CSSVar.register()` with type, initial value, and inheritance control.
- `Color.lightDark(light, dark)` for automatic light/dark mode color switching.
- Native SVG gradient support: `LinearGradient()`, `RadialGradient()`, `ConicGradient()` constructors with trailing-block stop definitions.
- Gradient interpolation modes (`srgb`, `oklch`) and stepped interpolation via `.steps`.
- Pattern paint server: `Pattern()` constructor with embedded path drawing.
- Conic gradient `innerRadius` property for smooth center plateau effects (WebGPU-only rendering) with configurable `innerFill` (`'transparent'` default, `'center'`, or `Color(...)`).
- Conic gradient features: partial sweep (`from`/`to` angles), `direction` (`cw`/`ccw`), `spread` modes (`clamp`/`repeat`/`transparent`).
- Gradient `.inherit(newId)` for creating child gradients that reference parents via SVG `href`.
- CSS custom property (`--var`) output from gradients with OKLCh fallback extraction.
- MeshGradient with bilinear interpolation over control point grids and FreeformGradient with IDW (inverse distance weighting) for scattered color points.
- TopoGradient: topological elevation gradients with distance-based SDF interpolation. Contours defined via `g.contour(path, elevation, color)`. Supports easing modes (`linear`, `smoothstep`, `ease-in`, `ease-out`, `ease-in-out`), `baseColor`, and `oklch` interpolation.
- Laplace solver for TopoGradient (`method = 'laplace'`) — solves ∇²h = 0 via Jacobi iteration for smooth elevation fields. `iterations` property (default 200, range 1–2000).
- GroupLayer for SVG `<g>` element composition with `.append()`, max nesting depth of 10, and circular reference detection.
- Transform convenience properties (`translate-x`, `translate-y`, `translate`, `scale-x`, `scale-y`, `scale`, `rotate`) on PathLayer, GroupLayer, and TextLayer style blocks.
- First-class `Mask()` and `ClipPath()` constructors for SVG masking and clipping.
- `SVGDocumentFragment()` for injecting arbitrary SVG content (filters, markers, etc.).
- String type with `length`, `empty()`, index access, `split()`, `append()`, `prepend()`, `includes()`, and `slice()`.
- First-class `Point` type with `x`/`y` properties and geometric methods: `translate()`, `polarTranslate()`, `midpoint()`, `lerp()`, `rotate()`, `distanceTo()`, `angleTo()`.
- Objects with key-value literals, property access, `length`, `has()`, iteration, and `Object.keys()`/`values()`/`entries()`/`delete()` namespace methods.
- Path Blocks (`@{ ... }`) — reusable path data with `draw()`, `project()`, parametric sampling (`get`, `tangent`, `normal`, `partition`), transforms (`reverse`, `boundingBox`, `offset`, `mirror`, `rotateAtVertexIndex`, `scale`), properties (`length`, `vertices`, `subPathCount`, `subPathCommands`, `startPoint`, `endPoint`), and `<<` concatenation.
- `partition` `t` property and `subPath()` method on PathBlocks.
- `Cycler(array, shuffle?)` stdlib function for deterministic round-robin cycling with `.pick()` and `.length`.
- Matrix transforms (`translate`, `rotate`, `scale`) on layer contexts with `set()`/`reset()` and property access.
- Dynamic layer constructors — `PathLayer` and `TextLayer` names can be expressions.
- Universal tangent tracking for all SVG path commands.
- Line and column numbers in runtime error messages, including method calls.
- Void function call support (functions that return no value).
- Improved missing semicolon error diagnostics with targeted suggestions.
- `--render-gpu` CLI flag for headless browser GPU gradient rendering via Puppeteer.

#### Playground
- WebGPU rendering pipeline for conic gradients with WGSL fragment shader, LRU texture cache (32 entries), and Canvas 2D fallback.
- GPU gradient service with pre-rendering between compilation and DOM update, staleness re-checks, and automatic cache invalidation.
- WebGPU rendering pipelines for MeshGradient (bilinear shader) and FreeformGradient (IDW shader).
- WebGPU WGSL shader for topo gradients (ray-cast containment, SDF distance interpolation, easing, OKLab color blending) with Canvas 2D fallback.
- WebGPU compute shader pipeline for Laplace solver (init + N Jacobi iterations + render in single GPU submission) with Canvas 2D fallback using 4× downscale and bilinear upsampling.
- SVG path parser utility (`flattenToSegments`) for converting d-strings to GPU-ready line segment arrays.
- GroupLayer nesting support in layers panel with recursive visibility toggling.
- CSS custom property panel for gradients with OKLCh/CSSVar warnings.
- OKLCH color picker, palette panel, and CSS var panel for the Color system.
- Floating error panel with Copy Debug Info capture.
- Scroll padding so error panel doesn't block bottom code lines.
- Autocompletion for Cycler, PathBlock, ProjectedPath, Object types, `mpi()`, `null`, and `Object` namespace methods with `pathblock` snippet template.
- Line/column error highlighting in the code editor.
- SEO-friendly static pages with JSON-LD structured data, breadcrumbs, semantic HTML, and theme toggle component.
- Extended pan clamp to allow 1/3 viewport over-pan and panning down to 50% zoom.
- `mini-workspace` and `mini-preview` Web Components for interactive blog post embeds with code toggle.
- BBWP compilation pipeline (`npm run compile:bbwp`) for archived render artifacts with auto GPU/CPU detection.

#### Documentation
- Gradient blog series (5 posts): linear/radial, conic, mesh/freeform, topological, and pipeline infrastructure.
- Annotated TopoGradient schematics — 3 samples with side-by-side rendered gradients and contour map diagrams (paint chips, elevation labels, leader lines).
- 20 blog samples for gradient posts (post1–post4) including easing modes, method comparisons, terrain maps, crystal formations, and organic contours.
- Gradients documentation covering all gradient types, Pattern, inheritance, interpolation, `innerRadius`/`innerFill`, and rendering implementation.
- TopoGradient documentation with examples (terrain, rings, peaks, Laplace solver).
- Path Blocks documentation covering definition, drawing, projection, parametric sampling, and transforms.
- Blog post: *Reactive Color in SVG* — interactive Color system demos.
- Blog post: *SEO Pages and Cloudflare Workers Routing*.
- Single-page markdown docs for AI/LLM consumption.
- `Content-Signal` directive added to `robots.txt`.

### Fixed

#### Core
- Array trailing commas and for-in loop destructuring.
- Context-aware functions emitting absolute commands inside PathBlocks.
- XML attribute injection vulnerability in CLI SVG output.

#### Playground
- Style block syntax in layer autocomplete and TextLayer widget.
- Autosave data loss when navigating away from workspace.
- Dark mode link contrast in blog and docs views.
- Mobile scroll cutoff in blog and blog post views.
- Workspace loading failure when nano ID contains hyphens.
- Nano ID generating "undefined" in workspace IDs.
- Blog static page regressions (breadcrumb, code styling, reactive-svg).

### Changed

#### Playground
- Conic gradient rendering moved from inline Canvas 2D to GPU gradient service with WebGPU primary path and Canvas 2D fallback.
- Cmd/Ctrl+S now saves immediately instead of exporting.
- Thumbnail-updated event dispatched on workspace exit.

## [Unreleased] - 2026-02-16

### Added

#### Core
- Multi-layer support — `path` layers for SVG paths and `text` layers for text elements with template literals.
- Style blocks as first-class values with merge (`+`), property access (`.fill`), and per-element inline styles.
- Arrays and `null` as first-class data types with `len()`, `push()`, `map()`, `filter()`, `reduce()`, `join()`, index access, and spread.
- `for`/`if`/`let` control flow inside text blocks.
- Radians-based text/tspan rotation (converted to degrees at render time).

#### Playground
- Thumbnail system — R2-backed storage, crop modal, landing page thumbnails, admin backfill view, and supersampled rasterization with step-down halving.
- Layer controls panel for toggling visibility and managing multi-layer compositions.
- Inline color picker and TextLayer style editor in the code editor.
- Scoped autocompletion for function parameters and layer keywords.
- Docs sidebar with anchor navigation and scroll spy.
- Export legend improvements — snap-to-grid positioning, advanced settings with font embedding, Baumans branding, compact metadata line, content-driven width, and 128-line code limit.
- Shared SVG snapshot utility for consistent multi-layer rendering across export, thumbnails, and preview.
- Loading spinner on workspace transitions with stale SVG preview clearing.
- Admin token rotation script (`npm run website:admin-token`) with Wrangler secret + redeploy.

#### Documentation
- Layers documentation covering PathLayer, TextLayer, template literals, and style blocks.
- Style blocks and template literals documented in syntax reference.
- Arrays and null documented in syntax reference.
- Conditionals docs updated to include `else if` syntax.
- Blog post: *The SVG Serialization Trap*.

### Fixed

#### Playground
- Navigator viewport stroke vanishing on large canvases.
- Navigator blank for text-only layers (clone text elements for minimap).
- Navigator per-layer styling and viewport-fill zoom for small canvases.
- Overflow menu clipped in workspace cards.
- Empty admin thumbnails — wait for in-progress generation and validate results.
- Thumbnail worker path resolution in production.

### Changed

#### Core
- Deprecated global stroke/fill controls in favor of per-layer styling.

#### Development
- Converted all scripts from JavaScript/Bash to TypeScript with Commander CLI framework for `--help`, argument parsing, and type safety.
- Scripts now run via `tsx` instead of `node`; added `commander` as a dev dependency.
- Added `scripts/CLAUDE.md` prescribing TypeScript + Commander conventions for new scripts.
- Git hook installer (`install-git-hooks.ts`) now writes shims that invoke TypeScript source via `npx tsx`.
- Added `playground/CLAUDE.md` and `src/CLAUDE.md` with conventions and workflow guardrails; refreshed project-level CLAUDE.md for multi-layer era.

## [Unreleased] - 2026-02-09

### Added

#### Core
- `else if` conditional chains — chain as many `else if` blocks as needed between `if` and `else`.
- `pi` numeric suffix for angle literals (e.g., `0.25pi`, `2pi`) and `mpi(x)` stdlib function for multiplying expressions by pi.
- Variable reassignment support (`x = value;`) — reassign previously declared variables without `let`.
- `toFixed` number precision post-processing — available as a `compile()` option and CLI flag (`--precision`).
- Async interpreter execution via Web Worker (`src/worker.ts`) for non-blocking compilation.

#### Playground
- Export with Legend feature — modal for exporting SVG with a customizable code legend overlay.
- Light/dark theme system with visual refresh and system preference detection.
- Refresh button for recompiling programs that use random functions.
- Persist workspace preferences (canvas size, stroke, fill, grid) on change via autosave service.
- Copy workspace form workflow and increased canvas size limit.
- Toggle publish action on workspace cards.
- Async compilation via Web Worker with performance optimizations.

### Fixed

#### Playground
- Width/height input max validation in footer.
- Console log objects not expandable in console pane.

### Changed

#### Branding
- Playground rebranded to **Pathogen**.

#### Deployment
- Migrated from GitHub Pages to Cloudflare Pages; removed GitHub Actions deploy workflow.

## [Unreleased] - 2026-02-02

### Added

- `arcFromPolarOffset(angle, radius, angleOfArc)` - New context-aware function for drawing arcs where the center is at a polar offset from the current position. Guarantees continuous paths by only emitting `A` commands (never `M` or `L`). Positive `angleOfArc` draws clockwise, negative draws counter-clockwise.
- Context-aware functions documentation in `docs/stdlib.md` covering polar movement, arc functions, and tangent functions.
- Known issue ISSUE-002 documenting M command timing with context-aware functions.
#### Playground
- Autocomplete for the playground CodeMirror editor with snippets, stdlib functions, and context-aware completions.
- Save/load workspace support for `.svgx` files with File System Access API fallbacks and keyboard shortcuts.
- Refactored playground into modular Web Components with shared components, extracted styles, and state store.
- App shell + History API routing with landing, workspace, docs, preferences, and storybook views plus Cloudflare Pages deployment scaffolding.
- Blog feature in the playground with list and post views, markdown rendering, and build/new-post scripts.
- Enhanced component storybook with sidebar navigation, deep links, and interactive demos.
#### Documentation
- Documentation now generated from markdown sources via `scripts/build-docs.js`, including new getting-started/debug content and syntax updates.
- Syntax highlighting for docs using highlight.js (GitHub Dark theme).

#### Development
- Added an optional post-commit hook installer (`scripts/install-git-hooks.sh`) to remind contributors to update `CHANGELOG.md`.

### Fixed

#### Core
- `arcFromCenter` now emits `L` (lineto) instead of `M` (moveto) to reach the arc start point. This keeps paths continuous so that `Z` (closepath) closes to the original path start, not the arc start. If the current position already matches the arc start, only the `A` command is emitted.

#### Deployment
- SPA routing on Cloudflare Pages now supports direct navigation to playground routes via `_worker.js` and a base href update.

### Changed

#### Core
- `arcFromPolarOffset` uses the convention that positive `angleOfArc` is clockwise and negative is counter-clockwise, matching the visual behavior in SVG's Y-down coordinate system.

#### Deployment
- Build output moved to `public/` for Cloudflare Pages auto-detection.

#### Branding
- Page titles updated to include Pedestal Design branding.
