# Workspace Fullscreen Chrome + Wide-Screen Editor Caps

**Date:** 2026-08-31
**Status:** Implemented, verified end-to-end

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
