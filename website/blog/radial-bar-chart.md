---
title: "Data Visualization with Pathogen: Building a Radial Bar Chart"
slug: radial-bar-chart
date: 2026-03-29
description: "Build a radial bar chart from scratch — annular sector geometry, data-driven loops, rotated labels, and new stdlib functions for polar data visualization."
---

> **Prerequisites:** This post uses [PathBlocks](/pathogen/blog/pathblock-introduction), [TextBlocks](/pathogen/blog/textblock-introduction), [GroupLayers](/pathogen/docs#layers-defining-layers), and [for-loop destructuring](/pathogen/docs#syntax). If you're new to Pathogen, start with those introductions.

Radial bar charts arrange categorical data around a central point, encoding values as the length of wedge-shaped bars radiating outward. They're visually distinctive — the circular layout invites comparison across categories in a way that a standard bar chart can't — but geometrically demanding. Each bar is an annular sector whose inner and outer arcs, radial edges, and rounded corners all require precise coordinate math.

This post walks through building a radial bar chart in Pathogen, inspired by [Patrick Wojda's](https://observablehq.com/@gitnoise) BoardGameGeek category visualization on [Observable](https://observablehq.com/d/33703039e1484511). His chart compares how often categories appear across all games versus the top 100 ranked titles — a compelling use of radial layout to reveal patterns in community-assigned board game categories. Along the way, we'll introduce several new language features that emerged from the needs of this project: a native `radialWedge()` function, `TextBlock.radialProject()` for rotated label placement, and the `VerticalAnchor` enum for font-metric-aware text alignment.

## The Annular Sector

The fundamental shape in a radial bar chart is the **annular sector** — a ring segment defined by an inner radius, outer radius, and two angles. In Pathogen, the new `radialWedge()` stdlib function generates this shape with a single call:

```pathogen
M cx cy
radialWedge(innerR, outerR, fromAngle, toAngle, cornerR)
```

The center is wherever the cursor is positioned (via `M cx cy`). The function emits only relative commands (`m`, `a`, `l`, `z`) — no absolute `M` — so it composes naturally inside [PathBlocks](/pathogen/blog/pathblock-introduction). Angles are in radians (use the `deg` suffix for degrees — e.g., `90deg`, `-45deg`), with `fromAngle` / `toAngle` following the same convention as [conic gradients](/pathogen/blog/gradient-conic). The `cornerR` parameter controls the rounding at all four arc-line junctions.

<mini-workspace src="samples/post16/annular-sector.pathogen" caption="radialWedge() — sharp corners (ghost) vs cornerR = 6 (solid), with parameter annotations" code-open></mini-workspace>

The ghost shape shows `cornerR = 0` (sharp edges). The solid shape uses `cornerR = 6`, which rounds all four corners where radial lines meet circular arcs.

### Why a stdlib function?

We initially built annular sectors using a [PathBlock](/pathogen/blog/pathblock-introduction) with [`heading`](/pathogen/blog/heading-turn), `tangentArc`, `turn`, and `tangentLine`:

```pathogen
fn makeWedge(innerR, outerR, sweep, startAngle, cornerR) {
  let w = @{
    heading(calc(startAngle + 90deg))
    tangentArc(innerR, sweep)
    turn(-90deg)
    tangentLine(calc(outerR - innerR))
    turn(-90deg)
    tangentArc(outerR, calc(-1 * sweep))
    turn(-90deg)
    tangentLine(calc(outerR - innerR))
    z
  };
  return w.fillet(cornerR);
}
```

This approach taught us the [heading/turn](/pathogen/blog/heading-turn) system well, but it hit real problems at chart scale:

1. **`.fillet()` didn't handle arc-line transitions** — it only rounded line-to-line corners, silently skipping the four arc-line junctions in our wedge. We extended the fillet algorithm to compute tangent directions at arc endpoints, but this revealed deeper issues.
2. **Narrow bars produced degenerate output** — when the inner arc was too short for the requested corner radius, the fillet split produced zero-length commands with `undefined` SVG parameters.
3. **Graceful degradation required analytical geometry** — the correct maximum corner radius at each end depends on solving `maxCr = R × sin(halfSweep) / (1 ± sin(halfSweep))`, which is complex to derive and implement correctly in user code.

These challenges led us to create `radialWedge()` as a native stdlib function — the same design philosophy as `roundRect()`: encapsulate edge-case geometry so users get correct output without solving it themselves.

## Drawing Radial Bars

A radial bar maps a data value to the outer radius of an annular sector. The inner radius stays constant (forming the center hole), and the bar's length — its radial extent — encodes the value:

```pathogen
let outerR = calc(innerR + (maxR - innerR) * d.all / maxVal);
M cx cy
radialWedge(innerR, outerR, fromAngle, toAngle, cornerR)
```

To compare two datasets (all games vs top 100), the Observable chart overlays a narrower dark bar on top of each wider red bar. The dark bar uses 50% of the angular width, centered within the slice:

<mini-workspace src="samples/post16/radial-bar.pathogen" caption="Two overlaid bars — red (all BGG games, 15.6%) with dark overlay (top 100, 7.6%)" code-open></mini-workspace>

## Arranging Categories

With `radialWedge()` handling individual bars, arranging multiple categories is a `for` loop over a data array. The syntax `for ([d, i] in data)` destructures each element into the value `d` and its index `i` — a pattern you'll see throughout the rest of this post. Each category gets an angular slice of `TAU() / count` radians, with a slight overlap between adjacent wedges:

<mini-workspace src="samples/post16/category-layout.pathogen" caption="8 categories distributed radially — labels are added in the next section" code-open></mini-workspace>

The background-colored stroke (`stroke: bgColor; stroke-width: 0.5`) on each wedge creates the thin separation lines between adjacent bars — a subtle detail from the Observable original that gives the chart visual crispness.

## Rotated Labels with `radialProject`

Placing labels around a radial chart is the trickiest part. Each label must be:

- **Positioned** just past the bar's tip
- **Rotated** to align with the radial direction
- **Flipped** on the left hemisphere so text reads left-to-right
- **Vertically centered** so the text midline — not baseline — aligns with the bar's angular center

Doing this manually requires separate TextLayers for left and right hemispheres, manual `cos`/`sin` positioning, angle normalization for hemisphere detection, and a font-size-dependent y-offset for vertical centering. The new `.radialProject()` method on [TextBlock](/pathogen/blog/textblock-introduction) handles all of this in one call:

```pathogen
let label = &{ text(0, 0)`${d.name}` } << ${ font-size: 11; };
catLabels.apply {
  label.radialProject(cx, cy, midAngle, labelR,
    'start', 1, VerticalAnchor.Midline).draw()
}
```

The seven arguments:
1. `cx` — chart center x
2. `cy` — chart center y
3. `midAngle` — radial direction (radians)
4. `labelR` — distance from center
5. `'start'` — text extends away from center (or `'end'` for inward)
6. `1` — auto-flip enabled (detects left hemisphere, flips 180° for readability)
7. `VerticalAnchor.Midline` — which vertical font metric aligns with the projected point

<mini-workspace src="samples/post16/radial-labels.pathogen" caption="radialProject with VerticalAnchor.Midline — one TextLayer, automatic rotation and hemisphere flip" code-open></mini-workspace>

### The `VerticalAnchor` Enum

Without `VerticalAnchor`, labels on the lower half of the chart drift away from their bars. The text baseline (where glyphs sit) is below the visual center of the text. When the label is rotated, this offset translates into a radial misalignment.

`VerticalAnchor.Midline` shifts the projected point perpendicular to the radial direction by `fontSize × 0.35` — placing the x-height center (the visual middle of lowercase letters) exactly on the bar's angular midpoint. Other options: `VerticalAnchor.Baseline` (default, no shift), `VerticalAnchor.CapHeight` (top of capitals), and `VerticalAnchor.Descender` (bottom of descenders).

## Testing with Diagnostic Matrices

Building `radialWedge()` required multiple iterations to get the corner geometry right. To verify correctness across the full parameter space, we built diagnostic matrices — grids of wedges with varying angular width and outer radius, each rendered with guide circles, a dotted sharp-corner reference outline, and an XOR diff layer that highlights any geometric differences between the sharp and rounded versions.

<mini-workspace src="samples/post16/wedge-diag-4.pathogen" caption="Diagnostic matrix — cornerR = 4, varying theta × outerR. Dotted outline = sharp reference, dark red = areas where rounding changes geometry"></mini-workspace>

<mini-workspace src="samples/post16/wedge-diag-16.pathogen" caption="Diagnostic matrix — cornerR = 16, stress-testing graceful degradation at narrow inner arcs"></mini-workspace>

The dark red regions show the [XOR](/pathogen/docs#path-block-boolean-operations) between the sharp-cornered and rounded-cornered wedges. In a correct implementation, these should appear only at the four corners where rounding removes material. The `cornerR = 16` matrix demonstrates the graceful degradation: when the inner arc is too narrow for full-radius corners, `radialWedge()` analytically computes the largest corner radius that fits each end independently.

This matrix-based testing approach — rendering a grid of parameter combinations with geometric overlays — proved invaluable for identifying edge cases during development. The XOR diff layer made it immediately visible when a corner fillet was misaligned or a sweep flag was inverted, issues that would have been nearly impossible to catch by inspecting individual examples.

## The Complete Chart

Bringing everything together: 26 BoardGameGeek categories, overlaid red and dark bars, rotated labels with inline colored percentages via tspan styling, annotation badges, a wedge legend, and a summary bar chart — all driven by a single data array:

<mini-workspace src="samples/post16/radial-chart-complete.pathogen" caption="Complete radial hierarchical bar chart — BoardGameGeek category comparison"></mini-workspace>

Key techniques in the complete chart:

- **Per-wedge layers** drawn in data order — each subsequent bar stacks higher, creating the slight overlap effect from the Observable original
- **Background-colored stroke** (`stroke: bgColor; stroke-width: 1`) for separation lines between adjacent wedges
- **Inline tspan styling** for the `Name · all% · top%` label format — red interpunct and percentage, dark interpunct and percentage, with `white-space: pre` to preserve spaces around the interpunct
- **Badge icons** using `star(cx, cy, outerR, innerR, 5)` — filled circle with cream star cutout for the circled variants, solid fill for the standalone star
- **Labels follow bar tips** — `labelR = barTipR + 8` so labels sit just past each bar's end, not at a uniform distance

## Summary Bar Chart

The radial chart excels at showing the overall distribution pattern, but a linear layout makes precise value comparison easier. The companion horizontal bar chart below the main visualization shows the top 5 categories among the highest-ranked games, making the ranking immediately scannable:

<mini-workspace src="samples/post16/summary-bars.pathogen" caption="Top categories among the 100 highest-ranked board games — circles on a circular arc, bars extending left" code-open></mini-workspace>

## New Features Summary

This project prompted several additions to the Pathogen language:

| Feature | What it does |
|---------|-------------|
| `radialWedge()` | Annular sector with automatic rounded corners and graceful degradation |
| `.radialProject()` | Positions, rotates, and flips text along a radial direction |
| `VerticalAnchor` | Controls which font metric aligns with the projected point |
| `polarX()` / `polarY()` | Reduces `cx + cos(angle) * r` boilerplate |
| `normalizeAngle()` | Normalizes angles to the 0 to TAU range |
| Ternary expressions | `condition ? trueVal : falseVal` in any expression context |
| Fillet arc-line support | `.fillet()` now handles arc↔line corners |

The radial bar chart pattern — data array, angular distribution loop, `radialWedge()` for geometry, `radialProject()` for labels — is reusable for any categorical comparison that benefits from a circular layout. Try changing the `--bar-all` and `--bar-top` color variables in any of the examples above to explore different palettes, or modify the data array to add your own categories.

For the full function signatures and parameter details, see the [stdlib reference](/pathogen/docs#stdlib-path-functions) and [TextBlock documentation](/pathogen/docs#text-block-syntax). The original visualization by [Patrick Wojda](https://observablehq.com/@gitnoise) that inspired this chart is available on [Observable](https://observablehq.com/d/33703039e1484511).
