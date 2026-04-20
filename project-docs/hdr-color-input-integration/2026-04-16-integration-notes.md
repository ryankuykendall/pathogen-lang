# hdr-color-input Integration

**Date:** 2026-04-16 → 2026-04-17
**Plan:** `~/.claude/plans/ethereal-bouncing-lagoon.md`

## Summary

Replaced every `<input type="color">` in the playground with a themed
`<pathogen-color-input>` wrapper over `<color-input>` from the `hdr-color-input`
npm package. Gained wide-gamut color editing (oklch, oklab, display-p3,
rec2020, lab, lch, hwb), a richer popover UI (2D area + sliders + numeric
inputs + EyeDropper), and a single source of truth for color picking.

## What changed

### New files
- `scripts/build-vendor.ts` — esbuild pre-bundle for npm vendor chunks (writes
  `public/pathogen/vendor/hdr-color-input.js`).
- `playground/utils/color.ts` — extracted `parseColor`/`formatColor`/
  `colorToHex` and sRGB↔HSL↔OKLab↔OKLCH conversion helpers from
  `cm-color-picker.ts`. New exports: `detectFormat`, `formatToColorspace`,
  `ColorInputSpace` type.
- `playground/components/shared/pathogen-color-input.ts` — wrapper custom
  element with themed CSS parts, mirrored `value`/`colorspace`/`no-alpha`/
  `theme` attributes, and composed `color-change` event.
- `scripts/verify-color-picker.ts` — headless smoke test (puppeteer).

### Modified
- `scripts/build-playground.ts` — calls `buildVendor()` before the main esbuild pass.
- `playground/index.html` — importmap + eager `<script type="module">` load
  of the vendor chunk.
- `playground/utils/cm-color-picker.ts` — removed ~600-line custom popup
  (swatch + alpha slider + format-cycle button + text input + click-outside
  handler, `POPUP_CSS`, `ensurePopupStyles`, `activeColorPopup`). New
  `createColorChip` body instantiates `<pathogen-color-input>` in
  `document.body` and calls `show(chip)` to anchor its popover — sidesteps
  Shadow DOM top-layer issues.
- Seven call sites migrated from native color inputs to
  `<pathogen-color-input>` + `color-change` event:
  `preferences-view`, `playground-footer`, `export-legend-modal`,
  `cssvar-panel`, blog `reactive-svg`, blog `mini-workspace`, and two
  storybook showcase entries.
- `control-group.ts` ::slotted selector updated.
- `package.json` — added `hdr-color-input: ^0.4.0` runtime dependency.

### Preserved (no change)
- `palette-panel.ts` — stays read-only.
- Compiler's `src/color.ts` — follow-up: consider adopting colorjs.io as a
  library-level dep to deduplicate oklch/oklab math. See "Open follow-ups."

## Design decisions

1. **Chip + popover** — inline CM chip stays; click anchors
   `<color-input>`'s popover. Our custom popup is deleted.
2. **Wrapper over direct use** — one themed `<pathogen-color-input>` central
   component. Theming via CSS parts (`::part(trigger)`, `::part(panel)`,
   `::part(input)`, `::part(area)`, `::part(controls)`, etc.).
3. **Format preservation** — source format is captured once in `createColorChip`
   and enforced on every edit via `formatColor(parseColor(newVal), sourceFormat)`.
   hex stays hex, oklch stays oklch.
4. **document.body hosting for CM chips** — the chip is inside nested Shadow
   DOMs, but the picker wrapper lives at document root so the Popover API
   behaves predictably. Chip is passed as the anchor argument.
5. **Eager vendor load** — 67 KB gzipped; well under the 200 KB threshold for
   lazy-loading, so we keep it eager for simpler semantics.

## Verification

### Build
- `npm run build` ✓
- `npm run build:playground` ✓ (81 files, vendor 177.9 KB min / 67.3 KB gzip)
- `npm run build:website` ✓
- `npm run typecheck:playground` — clean (modulo three pre-existing
  workspace-view.ts errors unrelated to this change)
- `npm run test:run` — 2540/2540 passing

### Audit
- `grep -rn 'type="color"' playground/` — no matches outside `index.html.backup`
  (legacy pre-components prototype) and one docstring in `color.ts`.
- No references to removed popup internals
  (`cm-color-popup`, `POPUP_CSS`, `ensurePopupStyles`, `activeColorPopup`).

### Runtime (headless via `scripts/verify-color-picker.ts`)
- `<color-input>` custom element registered ✓
- `<pathogen-color-input>` wrapper registered ✓
- `/pathogen/new` workspace renders the wrapper ✓
- `/pathogen/storybook/pathogen-color-input` renders the wrapper ✓
- Synthetic `change` on inner → composed `color-change` re-dispatched ✓
- Wrapper `.value` property reflects inner value ✓

## Open follow-ups

1. **Dedupe color math** — colorjs.io is bundled inside the vendor chunk;
   adopting it as a compiler-side runtime dep would let us delete
   `src/color.ts`'s oklch/oklab matrices and their mirror in
   `playground/utils/color.ts`. Scope: compiler + playground; format-fidelity
   risk where Pathogen output stringification might shift. Not done here.
2. **Format-preservation unit test** — add a vitest roundtrip for the five
   fixtures (`#ff6347`, `rgb(255,99,71)`, `hsl(9,100%,64%)`,
   `oklch(0.7 0.19 30)`, `oklab(0.7 0.16 0.1)`) asserting that wrapper +
   `formatColor(…, sourceFormat)` returns the source format.
3. **Cross-browser popover** — smoke test passed in Chromium (puppeteer).
   Verify on Firefox 125+ / Safari 17+ manually; popover anchor positioning
   may need a JS-measured fallback if Safari is off.
4. **Compat re-exports in cm-color-picker.ts** — `parseColor`/`formatColor`/
   `colorToHex` are re-exported for backward compat. Grep showed no external
   consumers in-repo, so these can be deleted in a follow-up cleanup. Kept
   for now in case any test or ad-hoc script still imports them.
