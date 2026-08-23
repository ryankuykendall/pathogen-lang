---
title: "PathBlocks: Reusable Shape Primitives in Pathogen"
slug: pathblock-introduction
date: 2026-03-10
description: "How PathBlocks turn SVG path fragments into composable, reusable building blocks — define once, draw anywhere, transform freely."
series: "PathBlock Extensions"
seriesPart: 1
seriesDescription: "PathBlocks turn SVG paths into first-class values — this series builds from the basics through sampling, corner shaping, boolean operations, and cutting shapes apart."
---

*Part 1 of 5 in our series on PathBlock extensions.*

> **Series: PathBlock Extensions**
> 1. **Introduction to PathBlocks** (this post)
> 2. [Exploring Parametric Sampling](/blog/pathblock-parametric-sampling)
> 3. [Fillets and Chamfers](/blog/pathblock-fillets-chamfers)
> 4. [Boolean Operations](/blog/pathblock-boolean-operations)
> 5. [Cutting Paths](/blog/pathblock-cutting)

If you build parametric SVGs, icon systems, or generative art, you've felt the friction: repeating the same shapes at different positions means copy-pasting `<path>` elements, tweaking `d` attributes, adjusting coordinates. PathBlocks solve this by capturing relative path commands as first-class values that you can draw, position, transform, and compose.

## What Is a PathBlock?

A PathBlock is a reusable fragment of SVG path commands. You define one with the `@{ ... }` syntax, and the commands inside are stored as relative offsets from an implicit `(0, 0)` origin. The block doesn't draw anything on its own — it's a template waiting to be placed.

```pathogen
let arrow = @{
  h 40
  l -10 -8
  l 0 5
  h -30
  v 6
  h 30
  l 0 5
  l 10 -8
};
```

This captures a small arrow shape. The commands are relative (`h`, `l`, `v`), so they describe the shape's geometry without committing to a position. See the full [PathBlock syntax](/docs#path-blocks-syntax) documentation for details.

The anatomy diagram below shows a PathBlock's structure: the green crosshair marks the `(0, 0)` origin, red dots mark [`.vertices`](/docs#path-blocks-properties), the dashed yellow rectangle shows [`.bounds`](/docs#path-blocks-properties), and the purple arrows indicate path direction.

<mini-workspace src="samples/post6/pathblock-anatomy.pathogen" caption="PathBlock anatomy — origin, vertices, bounds, and path direction"></mini-workspace>

## Drawing and Positioning

There are two ways to draw a PathBlock: the manual approach and the convenience method.

### Manual: `M` + `.draw()`

Position the cursor with an `M` command, then call `.draw()` to emit the relative commands:

```pathogen
M 60 70
arrow.draw()
```

This is flexible — you control the cursor — but it's two statements for one shape. See [Drawing a Path Block](/docs#path-blocks-drawing-a-path-block) in the documentation.

### Convenience: `.drawTo(x, y)`

The `drawTo()` method combines positioning and drawing in a single call:

```pathogen
arrow.drawTo(60, 70)
```

It emits `M 60 70` followed by the PathBlock's commands, and returns a `ProjectedPath` value you can use for further operations (sampling, transforms, boolean ops). This is the preferred approach for most use cases.

The demo below shows both approaches — manual on top, `drawTo` on the bottom. Same shapes, same positions, less ceremony with `drawTo`.

<mini-workspace src="samples/post6/drawto-vs-manual.pathogen" caption="Manual M+draw() vs drawTo() — same result, less code" code-open></mini-workspace>

## Reuse and Repetition

The real power of PathBlocks shows when you draw the same shape many times. Combine `drawTo()` with [control flow](/docs#syntax-for-loops) to generate patterns:

```pathogen
let dot = @{ a 3 3 0 1 1 6 0  a 3 3 0 1 1 -6 0 };

for (i in 0..5) {
  for (j in 0..5) {
    dot.drawTo(calc(20 + i * 15), calc(20 + j * 15))
  }
}
```

PathBlocks are [first-class values](/docs#path-blocks-first-class-values) — you can store them in variables, pass them around, and use them wherever a value is expected.

Below, a single leaf-shaped PathBlock (defined with two cubic Béziers) is drawn 28 times in radial rings — 8 in an inner ring, 12 in an outer ring, plus 8 diamond accents. One definition, many instances.

<mini-workspace src="samples/post6/pathblock-pattern.pathogen" caption="Radial pattern — one PathBlock drawn 28 times with trigonometric placement"></mini-workspace>

## A Practical Example

Here's a grid built from two simple PathBlocks — a horizontal line and a vertical line — repeated with loops. The PathBlock captures the shape; the loop handles placement.

<mini-workspace src="samples/post6/pathblock-basics.pathogen" caption="Grid from two PathBlocks — define once, draw in loops" code-open></mini-workspace>

## PathBlock Properties

Every PathBlock carries metadata about its geometry. The [Properties](/docs#path-blocks-properties) section covers all of them:

- `.startPoint` / `.endPoint` — where the shape begins and ends
- `.vertices` — all junction points as an array of Points
- `.length` — total arc length
- `.bounds` — axis-aligned bounding box (`{ x, y, width, height }`)

These properties make PathBlocks queryable — you can inspect a shape's geometry before deciding how to draw or transform it.

## Projection

Drawing places a shape into the SVG output. But sometimes you need to work with a positioned shape *without* drawing it — for example, to query its geometry or use it in a boolean operation. That's what [`.project(x, y)`](/docs#path-blocks-projecting-without-drawing) is for.

`.project()` returns a `ProjectedPath` — the same commands, but offset to absolute coordinates at `(x, y)`. The PathBlock itself stays unchanged; the ProjectedPath is a positioned view of it:

```pathogen
let box = @{ h 50 v 50 h -50 z };
let proj = box.project(100, 100);
log(proj.get(0.5));  // Point at midpoint of positioned path
```

Think of it as "place the shape here, but don't draw it yet." ProjectedPaths support all the same operations as PathBlocks — sampling, fillets, chamfers, booleans — but in absolute coordinates. You'll see `.project()` used heavily in the rest of this series whenever shapes need to interact with each other spatially.

## Standard Library Shapes

Pathogen's [standard library](/docs#stdlib-path-functions) provides ready-made PathBlocks for common shapes:

```pathogen
let c = @{ circle(0, 0, 30) };
let r = @{ rect(0, 0, 60, 40) };
let s = @{ star(0, 0, 25, 12, 5) };
```

These return PathBlocks, so all the same methods — `.draw()`, `.drawTo()`, `.project()`, transforms — work on them.

<mini-workspace src="samples/post6/stdlib-showcase.pathogen" caption="Standard library shapes — circle, rect, star, polygon, and roundRect"></mini-workspace>

## What's Next

PathBlocks are the foundation for everything that follows. In the next post, we'll explore [parametric sampling](/blog/pathblock-parametric-sampling) — querying points, tangents, and normals along a path to place elements precisely along curves. After that, [fillets and chamfers](/blog/pathblock-fillets-chamfers) show how to round and cut corners, and [boolean operations](/blog/pathblock-boolean-operations) combine shapes using union, difference, intersection, and xor.

Try it yourself in the [Pathogen playground](/) — paste any of the examples above and see the SVG output live.
