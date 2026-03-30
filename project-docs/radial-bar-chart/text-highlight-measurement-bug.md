# Feature Opportunity: Accurate Text Highlighting with Background Rectangles

**Status**: Documented, not yet solved
**Discovered**: 2026-03-28, during radial bar chart data visualization work
**Severity**: Blocks a common data visualization pattern (inline text highlighting)

## Goal

Place colored background rectangles precisely behind specific words or phrases within a line of SVG text — the same visual pattern used in the Observable radial bar chart subtitle where "all board games" has a red background and "top 100" has a dark background.

## What We Tried

### Attempt 1: Manual pixel positioning
Hand-estimated the x-offset and width of each highlighted phrase based on visual inspection. Required repeated compile-check-adjust cycles. Never converged because each adjustment was a guess.

### Attempt 2: TextBlock `boundingBox()` with default sans-serif tables
Used `&{ text(0, 0)\`segment\` } << ${ font-size: 11; }` to measure each text segment, then positioned rectangles at cumulative widths.

**Result**: Rectangles consistently shifted left of the text. The built-in character width tables (approximating Arial/Helvetica) produce measurements ~10-12% narrower than the browser's `system-ui` rendering (SF Pro on macOS, Segoe UI on Windows).

### Attempt 3: `@font` with Open Sans for exact measurement
Loaded Open Sans TTF via `@font` directive, measured segments with the loaded font's exact glyph metrics.

**Result**: Measurement was precise for Open Sans, but the SVG output says `font-family="Open Sans"` — the browser doesn't have Open Sans loaded (the `@font` directive only loads fonts at compile time for measurement, it doesn't embed them in the SVG). Browser falls back to system font, producing the same mismatch.

### Attempt 4: Match measurement and rendering fonts
Set both measurement (`subStyle`) and rendering (`subtitleLayer`) to use `Open Sans`.

**Result**: Same problem — the browser still doesn't have Open Sans, so it renders with its fallback font regardless of what the SVG attribute says.

### Attempt 5: Use `sans-serif` for measurement (matching system-ui category)
Removed `@font`, measured with `sans-serif` tables, rendered with `system-ui, sans-serif`.

**Result**: The sans-serif tables approximate Arial, but `system-ui` on macOS is SF Pro. Different fonts, similar category. Measurements still ~10% too narrow.

### Attempt 6: Scale correction factor
Applied a uniform multiplier (tried 1.06, 1.09, 1.10, 1.12) to the measured widths to approximate the browser's actual rendering width.

**Result**: Got closer but never exact. The error is not uniform — it varies per character because different fonts have different relative character widths. A single scale factor can't correct for per-character metric differences.

### Attempt 7: Proportional positioning
Computed each highlight's position as a fraction of total line width (e.g., "all board games" starts at 31.5% of the line). Applied the fraction to an estimated browser width.

**Result**: Better than absolute positioning because proportional ratios are more stable across fonts. But still depends on estimating the browser's total rendered width, which varies by platform and font.

### Attempt 8: Per-segment text elements
Rendered each text segment as an independent `<text>` element at measured x-positions, with rectangles at the same positions.

**Result**: Highlights aligned perfectly with their text segments (same anchor point). But the non-highlighted segments showed gaps/overlaps because measured widths didn't match browser widths, breaking the continuous text flow.

## Root Cause Analysis

The fundamental problem is a **compile-time / render-time measurement mismatch**:

1. **Compile time**: Pathogen measures text using either built-in character width tables (~85-90% accurate for Latin text) or `@font`-loaded OpenType metrics (exact for that specific font).

2. **Render time**: The browser renders text using whatever font `system-ui` or `sans-serif` resolves to on the user's platform — SF Pro (macOS), Segoe UI (Windows), Roboto (Android), etc.

3. **The gap**: Even when using `@font` with exact metrics, the loaded font doesn't transfer to the browser. The SVG `font-family` attribute is just a string — unless the font is embedded as a data URI or available on the user's system, the browser substitutes its own font with different metrics.

This means **no compile-time measurement can guarantee pixel-accurate alignment** with browser-rendered text, because the actual rendering font is unknowable at compile time.

## Possible Solutions

### Solution A: Font embedding in SVG output
Embed the measured font as a base64 data URI in the SVG's `<style>` block via `@font-face`. This ensures the browser renders with the same font that was measured at compile time.

**Pros**: Guarantees measurement/rendering match. Works offline.
**Cons**: Increases SVG file size (50-200KB per font). May not be desired for all use cases.

**Implementation**: When `@font` is used and `--include-font-face` is passed, embed the TTF/WOFF as a data URI in the SVG output's `<defs>` or `<style>` section.

### Solution B: Runtime text measurement via JavaScript
Emit a small JavaScript snippet in the SVG that measures text at render time and repositions the highlight rectangles. Uses `getComputedTextLength()` or `getBBox()` on the actual rendered text.

**Pros**: Always accurate regardless of font.
**Cons**: Requires JavaScript (not pure SVG). Won't work in contexts that strip scripts.

### Solution C: TextBlock `highlight()` method
A new TextBlock method that handles the full pipeline: measures the text, renders both the background rectangles and the text as a coordinated unit, guaranteeing alignment because both are generated from the same measurement.

```pathogen
let subtitle = &{
  text(0, 14) {
    `They make up nearly 30% of `
    highlight(`all board games`, allBarColor)
    `, but just about 10% of the `
    highlight(`top 100`, topBarColor)
    ` ranked titles.`
  }
};
subtitle.drawTo(x, y)
```

**Pros**: Clean API. The compiler controls both text and rectangles, so they can use the same coordinate system.
**Cons**: Requires new syntax (`highlight()` inside text blocks). The measurement accuracy problem remains unless combined with Solution A.

### Solution D: Improve built-in character width tables
Add per-font character width tables for common system fonts (SF Pro, Segoe UI, Roboto). At compile time, detect the target platform or allow the user to specify it, and use the appropriate table.

**Pros**: No font embedding needed. Better default accuracy.
**Cons**: Platform-specific. Still won't be exact (font rendering also depends on hinting, anti-aliasing, and sub-pixel positioning).

### Solution E: `getTextWidth()` stdlib function with font parameter
A stdlib function that takes a string and font specification, returns the width using the loaded `@font` metrics. Combined with Solution A (font embedding), this gives exact results.

```pathogen
@font "path/to/font.ttf"
let w = getTextWidth("all board games", "FontName", 11);
```

**Pros**: Explicit, testable, debuggable.
**Cons**: Still requires font embedding for render-time accuracy.

## Recommendation

**Solution A + C together** would be the most complete:
1. Font embedding ensures measurement = rendering
2. A `highlight()` API makes the pattern easy to use
3. The accuracy problem is solved at the root (font availability) rather than papered over with heuristics

For the immediate term, the proportional positioning approach (Attempt 7) with a platform-tuned scale factor is the best available workaround.

## Current State in the Visualization

The radial bar chart subtitle currently uses proportional positioning with a 1.12x scale factor. The highlights are approximately correct but not pixel-perfect. This is acceptable for the blog post but should be revisited when a proper solution is implemented.
