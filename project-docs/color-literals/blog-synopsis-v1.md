# Blog Synopsis: Color Literals

**Title**: "Drop the Quotes: Color Literals in Pathogen"

**Audience**: Existing Pathogen users and potential adopters interested in creative coding / SVG tooling.

**Word count target**: ~1,200 words (short, focused feature post)

## Synopsis (~250 words)

A UX bug became a language feature. When users changed colors via the playground's color picker on `Color('#cc0000')`, the picker stripped the quotes — producing `Color(#cc0000)` which failed to compile. Rather than just fixing the quoting, we asked: why require quotes at all?

This post introduces **color literals** in Pathogen — bare hex codes and CSS color functions that produce `ColorValue` objects as first-class expressions. No `Color()` wrapper, no string quoting, no ceremony.

We'll walk through the three layers of the feature:

1. **Hex literals** — `#cc0000`, `#f00`, `#cc000080` work anywhere an expression is expected. Wrap in parens for method chaining: `(#cc0000).lighten(20%)`.

2. **CSS color function literals** — `rgb(255, 0, 0)`, `hsl(0, 100%, 50%)`, `oklch(0.6 0.15 30)` and 6 more color spaces. Raw capture means `%` and `/` inside parens are literal, not operators.

3. **The percent suffix** — `20%` becomes `0.2`. Disambiguated from modulus by spacing: `20%` = percent, `20 % 5` = modulus.

We'll show how these features compose: `(#cc0000).lighten(20%)` reads naturally — lighten this red by 20%. The post includes a before/after comparison, interactive demos of hex literals with method chaining, and a showcase of all supported color spaces.

The `Color()` wrapper remains for named colors (`Color('coral')`) and OKLCH numeric construction. Everything is backwards-compatible.

## Mini-Workspace Demos (planned)

1. **Before/After** — Side-by-side showing `Color('#cc0000')` vs `#cc0000` producing the same output
2. **Hex + method chaining** — Building a color palette from a single hex literal using `.lighten()`, `.darken()`, `.hueShift()`
3. **CSS color spaces** — Grid showing the same color expressed in rgb, hsl, oklch, hwb, lab, lch, oklab
4. **Percent suffix** — Using `%` with color methods to create tint/shade scales
