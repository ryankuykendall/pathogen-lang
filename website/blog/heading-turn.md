---
title: "Clean Tangent Control: heading() and turn() in Pathogen"
slug: heading-turn
date: 2026-03-22
description: "Two stdlib functions that set and rotate the pen's direction without emitting path commands — enabling tangentLine and tangentArc immediately after M, and clean z closure in PathBlocks."
---

Pathogen's tangent-dependent functions — [`tangentLine`](/pathogen/docs#stdlib-tangent-functions) and [`tangentArc`](/pathogen/docs#stdlib-tangent-functions) — continue drawing in the direction established by the previous command. But what if there *is* no previous command? After an `M` (moveTo), the pen has a position but no heading. Calling `tangentArc` right after `M` would fail because there's no direction to continue from.

The old workaround was a dummy segment:

```pathogen
M 50 100
h 0.01            // invisible line to set heading rightward
tangentArc(20, 90deg)
```

This sets the heading, but the 0.01px offset accumulates. When you close a path with `z`, it draws a line back to `(50.01, 100)` instead of `(50, 100)` — a tiny but visible artifact.

## heading(angle)

[`heading(angle)`](/pathogen/docs#stdlib-heading-control) sets the tangent direction without emitting any command or moving the cursor. No offset, no artifact:

```pathogen
M 50 100
heading(0)           // set heading rightward — nothing drawn
tangentArc(20, 90deg) // works immediately
```

Angles follow SVG's coordinate conventions: 0 is rightward, positive angles rotate clockwise (downward in SVG's y-down coordinate system). Use the `deg` suffix for degrees.

## turn(delta)

[`turn(delta)`](/pathogen/docs#stdlib-heading-control) rotates the current heading by a relative amount. It requires an existing heading — either from `heading()` or from a prior drawing command:

```pathogen
M 50 100
heading(0)          // start rightward
turn(90deg)         // now downward
tangentLine(30)     // draws 30px down
```

Negative deltas turn counter-clockwise. Multiple `turn()` calls accumulate:

```pathogen
heading(0)
turn(45deg)         // 45°
turn(45deg)         // 90°
tangentLine(20)     // draws at 90°
```

## Shapes Without Dummy Segments

The demo below shows four shapes built entirely with `heading`, `turn`, `tangentLine`, and `tangentArc` — no dummy segments needed. Each shape includes the code used to construct it.

<mini-workspace src="samples/post14/heading-turn-demo.pathogen" caption="heading() and turn() — C-shape, S-curve, zigzag, and spiral" code-open></mini-workspace>

## Building Regular Polygons

`heading`, `turn`, and `tangentLine` are all you need to draw any regular polygon. Set an initial heading at half the exterior angle (this orients the first edge so the polygon sits upright), then loop: draw a side with `tangentLine`, turn by the exterior angle. Replace `tangentLine` with `tangentArc` on the turns and the corners become rounded:

```pathogen
fn sharpPoly(sides, sideLen) {
  let ext = calc(360 / sides);
  heading(calc(ext / 2 * PI() / 180))
  for (i in 0..sides) {
    tangentLine(sideLen)
    turn(calc(ext * PI() / 180))
  }
}

fn roundedPoly(sides, sideLen, r) {
  let ext = calc(360 / sides);
  let straight = calc(sideLen - 2 * r * tan(ext / 2 * PI() / 180));
  heading(calc(ext / 2 * PI() / 180))
  for (i in 0..sides) {
    tangentLine(straight)
    tangentArc(r, calc(ext * PI() / 180))
  }
}
```

The showcase below draws triangles through decagons — eight polygons in each row, sharp and rounded. One function, one loop, any number of sides.

<mini-workspace src="samples/post14/polygon-showcase.pathogen" caption="Regular polygons from 3 to 10 sides — sharp and rounded corners" code-open></mini-workspace>

## Clean PathBlock Closure

`heading()` is especially valuable inside [path blocks](/pathogen/blog/pathblock-introduction). The `z` command draws a line back to the subpath start — and with `h 0.01`, that start is offset by 0.01px. With `heading()`, the start is exact:

```pathogen
// With h 0.01 — z closes to (0.01, 0), leaving a gap
let old = @{
  h 0.01
  tangentArc(20, 270deg)
  z
};

// With heading — z closes cleanly to (0, 0)
let clean = @{
  heading(0)
  tangentArc(20, 270deg)
  z
};
```

## Reading the Current Heading

The current heading is available via `ctx.heading` — a read-only property that returns the tangent angle in radians, or `undefined` after an `M` (since moves don't establish direction):

```pathogen
M 0 0  L 50 0
log(ctx.heading)   // 0 (rightward)
heading(90deg)
log(ctx.heading)   // 1.5708 (π/2, downward)
M 200 200
log(ctx.heading)   // undefined (M clears heading)
```

Any drawing command that establishes a direction — `L`, `H`, `V`, `C`, `S`, `Q`, `T`, `A`, `Z`, and stdlib path functions — sets the heading automatically. `heading()` and `turn()` let you set it explicitly when no drawing command has run yet.

Together, these two functions eliminate the dummy-segment workaround, enable clean `z` closure in path blocks, and unlock procedural shape construction — from simple arcs to regular polygons with any number of sides. They pair naturally with `tangentLine` and `tangentArc` to build complex shapes from simple, composable operations.

For more on tangent-dependent functions, see the [stdlib reference](/pathogen/docs#stdlib-tangent-functions). For path blocks, see the [PathBlock introduction](/pathogen/blog/pathblock-introduction). For multi-segment smooth curves that benefit from `heading()`, see the [chained Bézier splines post](/pathogen/blog/chained-bezier-splines).
