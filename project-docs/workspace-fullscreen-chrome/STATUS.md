# Workspace Fullscreen Chrome + Wide-Screen Editor Caps

**Date:** 2026-08-31
**Status:** Shipped (`ff05504`); follow-up: fullscreen compilation-status chip

## Follow-up: compilation-status chip in fullscreen (2026-08-31)

Clicking Refresh in fullscreen gave no feedback — the "Compiling…" chip lives
in the breadcrumb, which fullscreen covers. Added the chip to fullscreen mode,
top-center:

- **Shared helper `utils/compilation-status.ts`** — `compilationStatusView()`
  (status→text/class map) + `compilationStatusStyles()` (chip look + pulse
  keyframes), following the `fullscreen-toggle.ts` pattern. Consumed by
  `app-breadcrumb` (no behavior change), `svg-preview-pane` (the feature), and
  `playground-header` (storybook-only — killing a drifted fork that was
  **missing the `rendering` state**; that bug is fixed as a side effect).
- **Pane wiring**: chip span placed after `#preview-container`; display gated
  on `:host(.fullscreen)` (breadcrumb owns normal mode); targeted
  `compilationStatus` subscription (`_applyCompilationStatus()`, no re-render,
  so the pulse never resets mid-animation).
- **Stale-badge coexistence**: `#stale-badge` also sits top-center and shows
  exactly when the chip says "Error"; `#preview-container.stale ~
  #compilation-status` drops the chip below the badge (verified 10px clear).
- **Dark-theme legibility fix in the shared helper**: the error chip used
  `--error-color` (#ef4444) on dark `--error-bg` (0.6-alpha red) — red-on-red,
  illegible (screenshot-confirmed). Switched to `--error-text` (#fcd5d5 dark /
  #dc2626 light), the token pair designed for `--error-bg`. This also repairs
  the breadcrumb's dark-mode error chip, which had the same bug.
- Verify script now 30 checks: chip visible+centered on fullscreen refresh
  ("Compiling…"/"Ready" observed), hides on the completed→idle timeout, never
  displays in normal mode, "Error" below the stale badge with no overlap.
  Screenshots: `chip-ready-light.png`, `chip-error-dark.png`.
- Test-authoring gotcha: `position: absolute` **blockifies** `inline-block`,
  so a visible chip computes `display: block` — don't assert `inline-block`.

### Chip review round (code-reviewer: approve with minor follow-ups — all taken)

- playground-header's `.save-status` aligned to the canonical borderless chip
  metrics (its bordered 0.6875rem style visibly mismatched the shared chip).
- Storybook "Stale (compile error)" story now also sets
  `compilationStatus: 'error'` (+ passthrough in render), making the
  chip-below-stale-badge overlap case reachable at /storybook/svg-preview-pane.
- `tests/compilation-status.test.ts`: 8 table-driven cases pinning the shared
  status→text/class map (three consumers, one contract).
- Helper now uses `var(--radius-sm)` / `var(--transition-base)` per the
  no-hardcoded-values convention; stale-offset comment documents that 2rem is
  a clearance allowance over the badge's ~1.6rem rendered height.
- Reviewer independently confirmed: `--error-text` pairing, specificity of the
  fullscreen display gate, sibling-selector structure, status-map parity with
  the old breadcrumb switch, and that the un-unsubscribed store subscriptions
  are pre-existing debt in this file, not new.

## What shipped

1. **Fullscreen refresh + export icon buttons** in `svg-preview-pane`'s chrome,
   stacked in a new `#chrome-right` flex column under the inspector button
   (top-right). Both are fullscreen-only (`:host(.fullscreen)`) since the
   breadcrumb bar provides them in normal mode but sits under the fullscreen
   pane (z-index 9999). Refresh additionally requires a program calling
   `random`/`randomRange` (`:host(.fullscreen.uses-random)`, toggled by a
   `calledStdlibFunctions` store subscription — the pane renders once, so
   visibility is class-driven, not re-render-driven). Buttons dispatch the
   same `refresh-preview` / `open-export` events the breadcrumb uses;
   workspace-view's existing document listeners handle them.
2. **Export modal above fullscreen**: `updateInspectorOverlay()` also toggles
   `fullscreen-overlay` on `export-modal`; `export-modal.css` gives that class
   `z-index: 10001` (above the inspector overlay's 10000).
3. **Shared randomness predicate**: `playground/utils/uses-random.ts`
   (`usesRandomValues`), used by both `app-breadcrumb` and `svg-preview-pane`.
4. **Wide-screen editor caps** in `code-editor-pane.css`: `max-width` 80ch at
   ≥1800px, 100ch at ≥2400px, 120ch at ≥3000px. The 1800px rule sets
   `font-family: var(--font-mono)` + `font-size: 14px` on `:host` so `ch`
   resolves against Inconsolata 14px (~7px/ch), not the inherited sans font.
   Below 1800px (16" MBP = 1728px logical) the 50/50 split is unchanged.

## Verification

- `verify-fullscreen-chrome.mjs` — 24/24 checks (puppeteer against the running
  `wrangler pages dev` on :3000): visibility states in/out of fullscreen,
  stacking order, refresh regenerates output, export modal opens above the
  fullscreen pane, ESC closes modal first then exits fullscreen, inspector-open
  occlusion regression, completion-font stability across the 1800px breakpoint,
  and editor widths 775/561/701/841px at 1600/1920/2560/3200 viewports.
- `npm run test:run` — 5022/5022 tests across 111 files (post-implementation);
  `tests/svg-preview-pane-stale.test.ts` re-run green after the review fixes.
- `verify-breadcrumb-storybook.mjs` — breadcrumb Refresh still shows for
  random programs after the predicate refactor; storybook renders both
  `svg-preview-pane` and `code-editor-pane`.
- Screenshots: `fullscreen-chrome-light.png`, `fullscreen-chrome-dark.png`.
- `npm run typecheck:playground`: 7 pre-existing errors (font-loader,
  detail-source-mount, old svg-preview-pane getters, workspace-view debug
  paths) — none in the new code.

## Follow-up: opaque hover fills for canvas chrome (2026-08-31)

User report: hovered chrome buttons (inspector/export/refresh) went nearly
transparent over artwork — the hover rule REPLACED the solid `--bg-elevated`
base with `--accent-subtle` (0.10 light / 0.15 dark alpha). Prototyped color
options in `website/bbwp/2026-08-31-13:47:05--workspace-fullscreen-chrome--
hover-colors.mw.html` (mw artifact; tint 0.8/0.9/1.0 over the solid base,
live WCAG ratios, both themes); user approved the 0.9 recommendation.

- New hover recipe (svg-preview-pane chrome buttons, fullscreen-toggle.ts,
  and blog mini-preview's inspector button — same bug class, found by sweep):
  `background: color-mix(in srgb, var(--accent-color) 90%, var(--bg-elevated))`
  (fully opaque), `color: var(--accent-contrast)`, `border-color:
  var(--accent-hover)`.
- New theme token `--accent-contrast` (#1c1722 light / #1a1424 dark): the
  highest-contrast ink on accent fills — distinct from `--accent-text`, which
  is warm-white in light theme (~3.7:1 vs the recommended 4.71:1).
  Ratios: light 4.71:1, dark 8.35:1 on the 0.9 composite.
- `.detail-hero-fullscreen` already composited opaquely (untouched); the two
  `fill: var(--accent-subtle)` uses are navigator overlays, not buttons.
- Verify harness now 32 checks: real-mouse hover asserts the computed fill is
  opaque rgb(198, 98, 153) (Chrome serializes color-mix as `color(srgb …)` —
  parse both forms) and the icon ink is --accent-contrast. Screenshots:
  `hover-fix-light.png`, `hover-fix-dark.png`.

## Agentic review round (code-reviewer)

- **Critical (fixed):** in fullscreen with the inspector open, the inspector's
  `.fullscreen-overlay` (fixed 280px right-edge, z-index 10000) covered the
  new `#chrome-right` column (pane z-index 9999 loses as a sibling stacking
  context). Fix: `_applyInspectorOpen()` mirrors `inspectorOpen` into an
  `.inspector-open` host class; `:host(.fullscreen.inspector-open)
  #chrome-right { right: calc(280px + 1rem) }` shifts the column clear, with
  a matching 0.3s transition. Regression checks added (rect non-overlap +
  export click with inspector open) — verify script now 24/24.
- **Warning (resolved empirically):** concern that the ≥1800px mono/14px on
  `:host` could leak into CodeMirror's completion list via inheritance. The
  new "completion font stable across 1800px breakpoint" check shows
  `.cm-completionLabel` is `monospace 14px` at both 1600px and 1900px (CM6's
  base theme pins the family; size comes from `.cm-editor`'s explicit rule).
- **Warning (fixed):** storybook couldn't exercise the new states — added a
  "Random program (fullscreen chrome)" story + `usesRandom` control to the
  `svg-preview-pane` registry entry (seeds `calledStdlibFunctions`), which
  surfaced a store typing gap: `calledStdlibFunctions: []` inferred `never[]`;
  now `[] as string[]` in `state/store.ts` (matches existing typed defaults).
- **Suggestion (taken):** editor font size deduplicated into
  `--editor-font-size` on `:host`, used by both `.cm-editor` and the ch-cap
  rule so they can't drift.
- **Suggestion (deferred to commit time):** CHANGELOG entry — per convention
  it must cover all work since the last entry, which includes unrelated
  uncommitted work in this tree.

## Gotchas encountered

- Pathogen range loops need parens: `for (i in 1..8)` — the bare
  `for i in …` form is a parse error (first verify run failed on this).
- `circle()` stdlib emits `<path>` commands, not `<circle>` elements — don't
  grep preview innerHTML for `circle`.
