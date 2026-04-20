# CodeMirror Chip Rearchitecture

**Date:** 2026-04-18

## Problem

Across three iterations the CM-editor color-chip UX had compounding issues:

1. **Popover opened off-screen** — the first hidden-wrapper approach put the
   `<pathogen-color-input>` at `left: -9999px`. `<color-input>`'s popover
   uses **CSS Anchor Positioning** (`position-anchor: --trigger`) anchored to
   its own internal `::part(trigger)` — not to any argument passed to
   `show(anchor)`. So the popover rendered at `(-9991, 36)`, off-screen.

2. **Clicking inside the popover dismissed it** — `pointer-events: none` on
   the hidden wrapper host propagated into the popover descendants. Clicks
   fell through to the document and triggered popover `auto` light-dismiss.

3. **Show-before-ready** — the wrapper's `connectedCallback` was `async`,
   awaiting `customElements.whenDefined('color-input')`. `.show(chip)` fired
   before `_inner` existed and silently no-op'd through optional chaining.

4. **Popover position moved out from under the pointer** — even after
   positioning the wrapper at the chip's rect, the popover jumped to the
   viewport's midpoint on subsequent opens. Diagnosis: `<color-input>.el()`
   falls back to viewport center when the stored anchor `!a.isConnected`.
   CM's widget lifecycle was occasionally destroying the chip between clicks.

5. **Only opened once per chip** — after first dismiss, `showPopover()` on an
   already-open (or partially-torn-down) popover was throwing silently.

## Approach that worked

**Make the `<pathogen-color-input>` *be* the CodeMirror widget.**

The chip rendered in the editor is a `<pathogen-color-input cm-chip>` —
sized to 12×12, with the native trigger button filling 100% of the host and
the internal `::part(chip)` rendering the color. Clicking anywhere on the
chip hits the native trigger, which opens its own popover via the standard
`<color-input>` behavior. The popover anchors to its sibling trigger via CSS
anchor positioning, so it opens naturally adjacent to the chip with zero
positioning JavaScript.

This eliminates every failure mode above:
- No hidden host → no anchor/positioning mismatch
- No `pointer-events: none` → no click-through
- No async init race — the chip opens its own popover synchronously via the
  native custom element
- No wrapper lifecycle — CM's widget tree owns the chip
- No `show()` calls from our code — the browser dispatches click to the
  internal trigger button, which calls `showPopover()` directly

## Key files

- **`playground/components/shared/pathogen-color-input.ts`** — added the
  `[cm-chip]` attribute variant. CSS inside the wrapper's Shadow DOM sizes
  the host to 12×12, makes the inner `<color-input>` fill 100%, and styles
  the trigger + chip parts so the color fills the whole chip area. The text
  input + error row are hidden.

- **`playground/utils/cm-color-picker.ts`** — `createColorChip()` now
  creates `<pathogen-color-input cm-chip>` directly (instead of a span +
  separate hidden wrapper). `updateColor` proxies to `chip.value = c`. The
  `ColorChipWidget.ignoreEvent()` returns `true` so CM doesn't intercept
  clicks on the custom-element widget. The base theme loses its old
  `.cm-color-chip` sizing (now handled inside the wrapper's Shadow DOM).

## What this preserves

- Source format round-trip (`oklch → oklch`, hex → hex, etc.) via
  `parseColor` / `formatColor` in the `color-change` handler
- `updateColor` API used by `cm-textlayer-editor.ts`
- The scanner, decoration, and `colorPickerExtension` are all unchanged

## Behaviour still to verify in real browsers

- Cross-browser: CSS anchor positioning is Chromium-only. In Firefox/Safari
  the package ships a JavaScript fallback; I haven't verified it works when
  the trigger element is inside a nested Shadow DOM (the editor's).
- Syntax-highlighted documents with hundreds of color literals — each chip
  instantiates a whole `<color-input>` Shadow DOM and preact-signals graph.
  Previously the 600-line popup was shared across all chips. If perf
  degrades, consider lazily upgrading chips on hover/focus.
