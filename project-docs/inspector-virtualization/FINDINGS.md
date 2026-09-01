# Inspector at 20k+ layers: open-gate, diff-patching, windowed rendering

**Date:** 2026-08-31
**Trigger:** A user project with 20,000+ layers made the inspector unusably
slow — reported as "60,000+ rows" (actually ~80,000: layers-panel emits one
row per layer; palette-panel emits a header + one row per fill/stroke color
per layer).
**Plan:** `~/.claude/plans/i-have-noticed-a-happy-locket.md`
**Prior art:** `project-docs/editor-perf/FINDINGS.md` (the 2026-07-29
coalescing/differential fixes this builds on), `project-docs/pan-zoom-performance/minimap-compile-cost.md`
(the perf-span blind-spot method reused here).

## Result

Main-thread inspector cost per compile at 20,000 layers (wide-layer program,
`scripts/perf-typing-audit.ts --wide-layers 20000`, raw runs in `runs/`):

| Scenario | Before (`936c547`) | After |
|---|---|---|
| Inspector **closed** (default) | ~1.3–1.8 s of long tasks per compile (e.g. 544+1105 ms, 606+861 ms) | **zero inspector work** (setData gated; one residual ~150 ms long task = preview pipeline for 20k paths) |
| Inspector **open** | same ~1.3–1.8 s (closed ≠ cheaper — panel was clipped, not hidden) | ~43 ms `inspector-layers-update` + ~9 ms palette + ~5 ms cssvar (JS flatten; DOM is ~43 windowed rows) |
| `store-updates` span | ~40–55 ms (string build only — the 1.5 s landed **after** the span closed, invisible to span tables) | ~3–4 ms |
| Eye toggle | two full ~80k-row rebuilds | O(1) in-place eye patch, store echo is a value-equal no-op |

The measurement lever was the `__PATHOGEN_NO_INSPECTOR__` kill switch +
long-task observer — perf spans structurally cannot see the style/layout cost
of a huge `innerHTML` (same trap as the minimap audit).

## What shipped

1. **Open-gate** (`inspector-panel.ts`): while `open === false`, `setData`
   merges into a pending object (latest-wins, `_last` untouched) and forwards
   on open. `workspace-view` drives `open` from the store's `inspectorOpen`
   (subscription + initial set); default `open = true` keeps the lazy-mount
   consumers (mini-workspace, detail-hero-mount) unmodified.
2. **layerVisibility identity fix** (`utils/layer-visibility.ts` +
   `workspace-view.ts`): `pruneVisibility` returns the *same reference* when
   nothing is stale, so the store's identity guard skips the notify and the
   differential setData cache is no longer defeated every compile. Live names
   now include group children (pruning them used to reset their eye state on
   recompile — pre-existing bug).
3. **Visibility diff-patching** (`layers-panel.ts`): visibility never changes
   the row set, so setter diffs old/new by value and patches only flipped
   rows' eye button (innerHTML/title/aria, `CSS.escape`d selector);
   `toggleVisibility` patches instead of rebuilding. Falls back to a
   scheduled rebuild when rows aren't built yet.
4. **Windowed rendering** (`utils/virtual-list.ts`, both panels): pure-math
   `buildOffsets`/`computeWindow` (prefix sums + binary search) + a
   `VirtualList` class owning a `.vl-sizer`/`.vl-slice` DOM pair. Driven by
   the shared `.inspector` shell scroller (wired via a `scrollHost` setter
   from inspector-panel's render), self-scroll fallback for standalone/
   storybook. Fixed row heights: 28px layer rows, 24px palette headers
   (given an explicit height in CSS), 26px color rows — paired comments in
   CSS and TS. 600px viewport fallback when `clientHeight === 0` (jsdom, the
   closed→open transition frame). ~400px overscan, passive rAF-throttled
   scroll handler, event delegation and `escapeHtml` unchanged.
5. **Quadratic hoists**: `gradientById` / `defTypeById` Maps replace
   per-row `gradients.find()` and `masks.some()`/`clipPaths.some()`; badge
   count folded into the flatten walk. Palette's color/var/gradient
   resolution moved into the windowed `renderSlice` (runs for ~40 rows, not
   60k).
6. **Group-children defs rows** (bug fix, deliberate visible change): def
   refs are now resolved during the recursive walk, so layers inside groups
   get their mask/clip sub-rows.
7. **Collapse short-circuit**: a collapsed section skips the DOM build
   (badge stays live) and rebuilds on expand if dirty.
8. **Instrumentation**: `perfSpan` in all three panels' `updateList`;
   `perf-typing-audit.ts` gains `--wide-layers <n>` (cheap one-circle layers,
   stroke+fill), `--inspector <closed|open>`, `--kill-inspector`.
9. **Storybook stories fixed**: layers/palette stories set store keys the
   prop-driven panels never read — they now assign `panel.layers` directly.

## Code-review outcomes (agentic review, same session)

- **Fixed (Critical):** storybook prop assignment tripped `typecheck:playground`
  (`unknown || []` widens to `{}`) — cast added.
- **Fixed (Warning):** sibling-panel staleness — a section or group collapse
  changes one panel's height, shifting the other's offset within the shared
  scroller with nothing re-measuring it. Panels now dispatch
  `inspector-section-resize` (composed) and inspector-panel re-windows both;
  covered by a new jsdom test.
- **Fixed (Warning):** `gradientById` Map construction silently switched
  duplicate-id resolution to last-match; a `has()` guard restores the
  first-match semantics SVG uses for `url(#id)`.
- **Fixed (Warning):** debug script lint (prettier + missing
  `eslint-disable` on the browser-context `CustomEvent`).
- **Fixed (gap):** added a `defsVisibility` diff-patch test.
- **Accepted, not done:** reconnect test for standalone panels (traced
  correct by the reviewer); a test forcing the non-`CSS.escape` selector
  fallback branch; `_countLayers` vs. flatten-walk count duplication.

## Tests

- `tests/playground-virtual-list.test.ts` — pure window math.
- `tests/playground-inspector-virtualization.test.ts` — windowing bounds,
  scroll re-slice, delegated clicks on windowed rows, collapsed-group badge,
  group-children defs rows, open-gate semantics, visibility patch, prune
  identity contract.
- `tests/playground-inspector-coalescing.test.ts` — prior fixes, unmodified
  and green.
- `scripts/debug-inspector-virtualization.ts` — real-browser E2E (gate,
  window+sizer geometry, deep-scroll palette windowing, eye-toggle round
  trip). Full suite: 5,057 tests pass.

## Environment gotcha (recorded)

Puppeteer's Chrome on this machine **never runs the rendering loop** — zero
rAF ticks and no scroll-event dispatch, verified even headful on
`about:blank`. Browser-delivered scroll therefore cannot be E2E-tested here;
the debug script falls back native event → synthetic dispatch → manual
`refresh()` and logs which level responded. Anything rAF- or scroll-driven
must be tested via direct invocation in this environment.

## Deferred / known limitations

- The ~43 ms/compile layers flatten at 20k layers is O(layers × styles)
  (defs-ref regex per style value). Fine for now; could cache per-layer defs
  refs keyed on the layers array identity if it ever matters.
- Palette still lists **top-level** layers only (group children's colors
  don't appear) — pre-existing behavior, deliberately unchanged.
- Palette badge goes momentarily stale only in the never-hit case of updates
  arriving while collapsed *and* the flatten being skipped — not applicable
  (flatten always runs); layers badge always live.
- `content-visibility: auto` was evaluated and rejected: it would still pay
  the 80k-row string build + innerHTML parse per compile.
- No `ResizeObserver` on the scrollers: growing the viewport taller without
  scrolling can leave the window under-filled until the next scroll; the
  400px overscan masks it in practice. Polish-level follow-up.
- The `.group-header` visual change (explicit 24px flex height replacing
  padding-derived height) should get a light/dark-theme eyeball in the
  playground/storybook when convenient.
- Compile-roundtrip itself is ~2.5 s at 20k layers (off-main-thread, worker)
  — untouched by this work and now the dominant per-compile cost for such
  scenes.
