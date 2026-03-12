---
title: "Boolean Operations: Combining Shapes with Union, Difference, Intersection, and XOR"
slug: pathblock-boolean-operations
date: 2026-03-13
description: "How PathBlocks support curve-preserving boolean operations — combine closed shapes using set operations without linearizing curves."
---

*Part 4 of 4 in our series on PathBlock extensions.*

> **Series: PathBlock Extensions**
> 1. [Introduction to PathBlocks](/pathogen/blog/pathblock-introduction)
> 2. [Exploring Parametric Sampling](/pathogen/blog/pathblock-parametric-sampling)
> 3. [Fillets and Chamfers](/pathogen/blog/pathblock-fillets-chamfers)
> 4. **Boolean Operations** (this post)

Boolean operations are the heavy machinery of computational geometry. Given two closed shapes, they answer fundamental questions: what's the combined outline? What's left after subtracting one from the other? Where do they overlap? Pathogen's [PathBlock boolean operations](/pathogen/docs#path-blocks-boolean-operations) bring these capabilities directly into the language.

## The Four Operations

All four operations take two closed paths and return a new PathBlock. Both operands must be closed (end with `z` or have coincident start/end points).

### Union

[`.union(other)`](/pathogen/docs#path-blocks-unionother-pathblock) combines two paths into their outer boundary — everything covered by either shape:

```pathogen
let a = @{ h 50 v 50 h -50 z };
let b = @{ h 50 v 50 h -50 z };
let combined = a.project(30, 30).union(b.project(55, 55));
```

### Difference

[`.difference(other)`](/pathogen/docs#path-blocks-differenceother-pathblock) subtracts the second shape from the first — everything in `a` that is not in `b`:

```pathogen
let result = a.project(200, 30).difference(b.project(225, 55));
```

### Intersection

[`.intersection(other)`](/pathogen/docs#path-blocks-intersectionother-pathblock) returns only the overlapping region — everything in both shapes:

```pathogen
let overlap = a.project(30, 210).intersection(b.project(55, 235));
```

### XOR

[`.xor(other)`](/pathogen/docs#path-blocks-xorother-pathblock) returns the symmetric difference — everything in either shape but not both:

```pathogen
let exclusive = a.project(200, 210).xor(b.project(225, 235));
```

<mini-workspace src="samples/post9/boolean-basics.pathogen" caption="Four boolean operations on overlapping squares — union, difference, intersection, xor" code-open></mini-workspace>

The dashed outlines show the original overlapping squares. The solid blue fills show the boolean result for each operation. Notice how union produces the combined outline, difference cuts out the overlap from the first shape, intersection keeps only the overlap, and xor keeps everything except the overlap.

## How It Works

The implementation follows the classical Greiner-Hormann approach adapted for curves: find all intersection points between the two paths, split segments at those points, classify each split segment as "inside" or "outside" the other shape (via winding number), then walk the intersection graph to assemble the result. The traversal rules differ per operation:

| Operation | Include from A | Include from B |
|---|---|---|
| Union | outside B | outside A |
| Intersection | inside B | inside A |
| Difference | outside B | inside A (reversed) |
| XOR | alternating at crossings | alternating at crossings |

Different curve combinations use specialized intersection algorithms — line-line uses a 2×2 linear system, line-cubic uses Cardano's formula, cubic-cubic uses Bezier clipping (Sederberg & Nishita). Bounding box rejection filters out non-intersecting pairs early.

## Curve Preservation

A key design goal is that boolean operations **preserve original curve types**. If the input contains cubic Béziers, the output contains cubic Béziers — not polyline approximations. The intersection finder works directly on the mathematical curve representations, and the split operation uses De Casteljau subdivision (for Béziers) or angular splitting (for arcs).

This matters for output quality. Linearized boolean results look jagged at any zoom level. Curve-preserving results stay smooth.

## Requirements

From the [documentation](/pathogen/docs#path-blocks-requirements-and-behavior):

- **Both paths must be closed.** Open paths throw an error.
- **The `other` argument** can be a PathBlock or ProjectedPath.
- **Multi-component results** produce multiple subpaths (`M...z M...z`). This happens naturally with XOR and certain difference operations.
- **Results are PathBlocks** normalized to `(0, 0)` origin, so they work with all PathBlock methods.

## Using with `.project()`

Boolean operations need absolute coordinates to compute intersections. Use [`.project(x, y)`](/pathogen/docs#path-blocks-projecting-without-drawing) to position shapes before combining them:

```pathogen
let circle = @{ circle(0, 0, 30) };
let a = circle.project(50, 50);
let b = circle.project(70, 50);
let result = a.union(b);
result.drawTo(0, 0)
```

The result is a PathBlock at `(0, 0)` origin. Use `.drawTo(x, y)` to place it anywhere.

## Chaining with Transforms

Since boolean operations return PathBlocks, you can chain them with [fillets](/pathogen/docs#path-blocks-fillets), [chamfers](/pathogen/docs#path-blocks-chamfers), [parametric sampling](/pathogen/docs#path-blocks-parametric-sampling), or even more boolean operations:

```pathogen
let sq = @{ h 50 v 50 h -50 z };
let combined = sq.project(0, 0).union(sq.project(25, 25));
let rounded = combined.fillet(5);
rounded.drawTo(10, 10)
```

This creates a union of two overlapping squares, then rounds all the corners with a 5px fillet. The composability is the whole point — each operation produces a value that feeds into the next.

The pipeline below shows the three stages: overlapping input squares, the union result, and the union with an 8px fillet applied. Each step returns a PathBlock that feeds into the next.

<mini-workspace src="samples/post9/boolean-chaining.pathogen" caption="Chaining pipeline — overlapping squares → union → union + fillet(8)"></mini-workspace>

## Standard Library Shapes

Pathogen's [standard library](/pathogen/docs#stdlib-path-functions) provides PathBlock-returning functions for common shapes — `circle()`, `rect()`, `polygon()`, `star()`, and more. These work directly with boolean operations:

```pathogen
let plate = @{ rect(0, 0, 80, 80) };
let hole = @{ circle(0, 0, 10) };
let d1 = plate.project(0, 0).difference(hole.project(25, 25));
let drilled = d1.project(0, 0).difference(hole.project(55, 55));
drilled.drawTo(0, 0)
```

The demo below shows two practical examples: a plate with four drilled holes (chained `.difference()` calls), and a badge shape created by unioning a star with a circle.

<mini-workspace src="samples/post9/boolean-stdlib.pathogen" caption="Standard library shapes — drilled plate and star-circle badge" code-open></mini-workspace>

## Putting It All Together

This series covered four layers of PathBlock capability — and since every operation returns a PathBlock, they compose freely. Here's the full pipeline in one expression: define shapes, combine them with a boolean operation, round the result with a fillet, then sample points along the filleted outline:

```pathogen
let sq = @{ h 60 v 60 h -60 z };
let combined = sq.project(0, 0).union(sq.project(30, 30));
let rounded = combined.fillet(8);
let pts = rounded.partition(24);
rounded.drawTo(10, 10)
for (p in pts) {
  @{ circle(0, 0, 2) }.drawTo(calc(10 + p.point.x), calc(10 + p.point.y))
}
```

Define once ([PathBlocks](/pathogen/blog/pathblock-introduction)), query geometry ([parametric sampling](/pathogen/blog/pathblock-parametric-sampling)), transform corners ([fillets and chamfers](/pathogen/blog/pathblock-fillets-chamfers)), combine shapes ([boolean operations](/pathogen/blog/pathblock-boolean-operations)) — all in a single composable pipeline. The full API reference is in the [PathBlocks documentation](/pathogen/docs#path-blocks-syntax).

Try it yourself in the [Pathogen playground](/pathogen/) — paste any example from this series and experiment.
