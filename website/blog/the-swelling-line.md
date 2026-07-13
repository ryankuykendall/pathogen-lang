---
title: "The Swelling Line: Variable Offsets, Ribbons, and Letterforms"
slug: the-swelling-line
date: 2026-07-12
description: "Two new PathBlock methods — variableOffset and compoundVariableOffset — turn any path into a rail for expressive, variable-width strokes. We build up from the rail model to curvature-continuous joins, filled ribbons with end caps, and a glyph-wrapped Pathogen wordmark."
---

Pathogen has always had [`offset()`](/docs#path-blocks-path-blocks): give it a path and a distance, and it hands back a uniform parallel curve. Useful — but static. The line never thickens, never tapers, never *breathes*.

This post introduces two new PathBlock methods that let it breathe: **`variableOffset`** and **`compoundVariableOffset`**. The distance can now change along the path, and you decide — stop by stop — how smoothly the curve flows. By the end we'll wrap every letter of the word *Pathogen* in flowing, multi-colored ribbons.

## The line that breathes

Start with the contrast. `offset(18)` holds one distance the whole way. `variableOffset` places *stops* along the path — each with its own distance — and threads a curve through the resulting points.

<mini-workspace src="samples/post27/01-offset-vs-variable.pathogen" caption="Top: offset(18) — one fixed distance. Bottom: variableOffset() — the distance changes at each stop." code-open></mini-workspace>

The syntax is deliberately gradient-like: a block of `go.stop(time, distance, continuity)` calls, where `time` is a fraction along the path (`10%` is exactly `0.1`).

## The spine is a rail

Here's the mental model that makes everything click. The path you call `variableOffset` on is the **spine**, and it behaves like a *rail*: at each stop it samples a point and the direction perpendicular to itself (the **normal**), then steps out along that normal by your distance. The new curve is built through those points. The spine's own shape never appears in the output — it only *places and aims* the points.

<mini-workspace src="samples/post27/02-rail-model.pathogen" caption="The grey rail, the red knots sitting out on its normals, and the offset curve threading through them." code-open></mini-workspace>

That's why it's a *rail* and not a stencil: you're not tracing the spine, you're riding alongside it.

## Choosing the join: G0, G1, G2

The best part is the last argument of each stop. `CurveContinuity` decides how the curve behaves *at* each point — the trade-off between crisp and smooth:

- **`G0`** — a corner. The curve meets the point and bends sharply.
- **`G1`** — no kink. The curve flows through with a continuous heading, though the *rate* of bending can still jump.
- **`G2`** — seamless. Even the curvature is continuous; the eye reads it as a single fluid motion.

The same five points, three ways — plus an overlay, because G1 and G2 are easy to conflate. Both are "smooth," but watch the space *between* knots: G2 redistributes the bending across the whole run, so the two curves part company mid-span even though they agree at every knot.

<mini-workspace src="samples/post27/03-continuity.pathogen" caption="Identical knots. Top to bottom: G0 (corners), G1 (no kink), G2 (curvature-continuous flow) — and G1 vs G2 overlaid, separating between the knots." code-open></mini-workspace>

Under the hood, a run of `G1`/`G2` stops is built as one spline; the `G2` runs solve a clamped cubic spline so the curvature matches across every join. You get to choose the smoothness; Pathogen does the maths.

## Shaping the ends

By default, the curve leaves its first and last points along the spine's own direction — a sensible, zero-configuration choice. When you want more control, hand an endpoint a [`PolarVector`](/docs#stdlib-polarvectorangle-distance): a direction plus a tension.

One subtlety: tangent handles are *directional* — they describe the direction of travel, so the two ends of a curve usually want different treatments. A common pattern (below): pin the start with an absolute angle, and aim the end along the rail by rotating a handle with `.turn(pb.tangent(94%).angle)`.

<mini-workspace src="samples/post27/04-endpoints.pathogen" caption="Top: spine-derived endpoints (default). Bottom: PolarVector handles — an absolute straight-up launch at the start, a spine-aligned landing at the end." code-open></mini-workspace>

The handle's angle sets the departure direction; its distance sets how firmly the curve pulls toward it before it bends away.

## From strokes to ribbons

An open stroke is only half the story. **`compoundVariableOffset`** places *two* profiles and closes them into a filled, variable-width **ribbon**. Each stop now takes two offset/continuity pairs — one per profile — and the *signs* of those offsets decide the ribbon's whole character:

- **Opposite signs, mirrored** — a classic ribbon straddling the spine symmetrically.
- **Opposite signs, asymmetric** — a calligraphy nib pressing harder on one side: the swell lives above the rail while the underside stays taut.
- **Same sign** — both profiles sit on *one* side, so the ribbon detaches from the spine entirely and floats alongside it as a band. (Hold that thought — it's exactly how the wordmark auras at the end of this post are built.)

<mini-workspace src="samples/post27/05-ribbon.pathogen" caption="One idea, three shapes: mirrored profiles, an asymmetric swell, and a same-side band floating above the dashed rail." code-open></mini-workspace>

Every ribbon is finished with **end caps** — and, like `CurveContinuity`, caps are a small vocabulary you compose:

<mini-workspace src="samples/post27/06-caps.pathogen" caption="Top to bottom: Cap.butt(), Cap.round(), Cap.elliptical(34), Cap.tapered(40, CurveContinuity.G2)." code-open></mini-workspace>

Omit a cap and that end stays open; omit both and you get two separate profiles instead of a closed ribbon.

## Any path — including type

Because the spine is *just a PathBlock*, anything that produces one can be a rail — including a font glyph. [`PathBlock.fromGlyph`](/docs#path-blocks-pathblockfromglyphtext-styles) returns an array with one PathBlock per character (hence the `[0]` to take the first letter), and `contours[0]` isolates one clean closed loop from that glyph's outline. Now that loop is a spine like any other.

One practical note: a letterform is a *long* rail with reversing curves, and the offset curve only knows about your stops. A handful of stops produces a loose gesture that ignores the letter; **densely placed stops** (a `for` loop works nicely) let the offset genuinely trace it.

<mini-workspace src="samples/post27/07-glyph-spine.pathogen" caption="Thirty stops along the outer contour of an 'S' — the offset hugs the letter, breathing between 6 and 18 units wide." code-open></mini-workspace>

Push it further: three concentric compound ribbons, each a different distance out, wrap the letter in a colored aura. Render the crisp glyph on top and you have an ornament.

<mini-workspace src="samples/post27/08-glyph-aura.pathogen" caption="Three concentric compound-offset bands — red inner, amber middle, blue outer — wrapping the letter, with the crisp glyph on top." code-open></mini-workspace>

> One caveat worth knowing: a glyph outline is a *closed* ink boundary, and letters with counters (`a`, `o`, `e`, `g`) return multiple contours in one PathBlock. Sampling across the jump between them produces spikes — so reach for `contours[0]` (or a specific contour) to get a single, well-behaved loop.

## The finale: a living wordmark

Put it all together. Lay out the letters of *Pathogen* with [advance-width spacing](/docs#path-blocks-path-blocks), give each glyph its own three-band red/yellow/blue aura, and set the crisp letters on top. Every ribbon in this image is a `compoundVariableOffset`.

<mini-workspace src="samples/post27/09-finale-wordmark.pathogen" caption="Every letter of the wordmark wrapped in three concentric compound-offset bands — the whole post in one image." code-open></mini-workspace>

## Where to go next

Two methods, one idea: **any path can be a rail for a variable-width stroke.** Vary the distance for tapered edges; choose `G0`/`G1`/`G2` for the character of the joins; add a second profile for a filled ribbon; cap it; and point it at your own geometry — even your own type.

The full reference lives in the [Variable Offset docs](/docs#variable-offset-variable-offset). Go make something that breathes.
