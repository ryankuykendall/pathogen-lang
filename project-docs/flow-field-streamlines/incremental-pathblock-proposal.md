# Proposal: Building a PathBlock incrementally from a flow-field walk

*Internal design note. Part A is usable today; Part B is a recommendation for a future,
separately-greenlit feature. No language code changes were made this round.*

## The question

You want to turn a flow-field walk into a *single continuous path* (a streamline), not a
scatter of circles. You reached for PathBlock concatenation:

```
let pb = @{ m 0 0 };
for (k in 1..itemLength) {
  let {x, y} = start.polarTranslate(angle, 3.6);
  pb = pb << @{ l x y };
}
```

We were asked to verify this works. **It doesn't** — for two independent reasons, both
confirmed by compiling.

### Why the `<<` snippet is broken

1. **`l` is a *relative* lineto, but you're feeding it *absolute* coordinates.**
   `start.polarTranslate(angle, 3.6)` returns the absolute next point (e.g. `(60, 50)`),
   and `l 60 50` means "draw a line *60 right and 50 down from here*." So the deltas grow
   every step. Verified output for a straight rightward walk:

   ```
   M 0 0 m 0 0 l 60 50 l 70 50 l 80 50 l 90 50      // runaway — should be l 10 0 each step
   ```

   The fix is to emit the *relative delta*, not the absolute point.

2. **Bare member access doesn't parse in path-args.** `@{ l x y }` works for plain
   variables, but `@{ l pt.x pt.y }` is a parse error — member access in a path argument
   must be wrapped: `@{ l calc(pt.x) calc(pt.y) }`. (Your shown loop also omits the
   `angle = ...` / `start = ...` updates, so it's illustrative rather than runnable.)

3. **It's also O(n²).** Each `pb = pb << ...` re-concatenates every prior command
   (`concatenateCommands`, `src/evaluator/index.ts:1564`). For a few-hundred-step walk that's
   a lot of wasted copying.

## Part A — What works today (recommended)

There's already a clean, O(n), single-block way to do this that needs **no new language
feature**: the context-aware `polarLine(angle, distance)` function.

`polarLine` is cursor-aware. **Outside** a block it emits an absolute `L x y`; **inside a
`@{}` block it emits a relative `l dx dy`** and advances the block's internal cursor for you.
So you never compute deltas by hand, and the geometry stays correct.

```
let p = start;                          // we track the canvas position ourselves
let stream = @{
  m start.x start.y                     // block cursor starts at the canvas point
  for (k in 1..itemLength) {
    let v = field.sampleBilinear(p.x, p.y);
    let angle = atan2(v.y, v.x);        // unit-vector field; see grid.md wraparound note
    polarLine(angle, 3.6);              // emits relative l dx dy, advances block cursor
    p = p.polarTranslate(angle, 3.6);   // advance our tracked canvas position
  }
};
M 0 0
stream.draw();
```

Verified output for a uniform field pointing right, 5 steps from `(50,50)`:

```
M 0 0 m 50 50 l 10 0 l 10 0 l 10 0 l 10 0 l 10 0
```

Clean, constant relative steps — exactly a streamline.

### Two non-obvious gotchas (both verified)

- **`ctx.position` is frozen at `(0,0)` inside a `@{}` block.** Outside a block it tracks the
  pen (e.g. `100,100` → `110,100` after `polarLine`), but **inside** a block it reads `(0,0)`
  the whole time. That's why we keep our own `p` variable to sample the field — you cannot
  rely on `ctx.position` to tell you where you are mid-block. (Reassigning an outer variable
  like `p` from *inside* the block does work, and `field.sampleBilinear(...)` is callable
  inside the block — both verified.)
- **Why `m start.x start.y` then `M 0 0` ... `stream.draw()`:** the block is authored in its
  own coordinate space starting at `(0,0)`. Beginning the block with `m start.x start.y`
  makes the block's internal cursor coincide with the canvas position, so the relative steps
  land where the field was sampled. Draw it with `.draw()` at the origin (don't `.drawTo()`
  elsewhere, or the drawn path and the sampled positions diverge).

### Why this is the better answer

`stream` is now a first-class PathBlock, so you get the whole introspection/transform API for
free: `.partition(n)`, `.get(t)`, `.tangent(t)`, `.offset(d)`, `.length`, `.boundingBox()`, …

This **connects to the oscillation primer**: build the streamline once, then place your
oscillating circles along it instead of re-walking the field —

```
let pts = stream.partition(itemLength);          // array of {point, angle, t}, itemLength+1 entries
for (i in 0..itemLength) {
  let radius = calc(1 + 8 * sin(i * 0.6));
  circle(pts[i].point.x, pts[i].point.y, radius); // .point is a Point; .angle is the tangent
}
```

(Plus, a single `<path>` streamline strokes/animates far better than N separate circles when
you want the line itself.)

## Part B — Proposed affordance (future, separate feature)

The two gotchas above (self-tracking position, the `m start.x start.y` coordinate coupling,
remembering `polarLine` emits relative only inside a block) are exactly the kind of friction
a higher-level builder should erase. Proposal:

```
let stream = field.streamline(start, { stepSize: 3.6, steps: itemLength });
```

`Grid.streamline(startPoint, opts)` → `PathBlock` would internally:

- sample the field bilinearly and extract direction via `atan2` (handling the unit-vector
  wraparound described in `docs/grid.md`),
- accumulate relative steps the way the Part-A loop does,
- track canvas position itself (no frozen-`ctx` trap for the user),
- support optional termination: `maxLength`, stop on out-of-bounds, stop when field
  magnitude falls below a threshold (so streamlines fade out where the field is calm),
- optionally a `bidirectional` flag to grow the line both ways from the seed.

### What building it would entail (not done this round)

Per the project's cross-system lifecycle, this is a new `Grid` method and would require, in
order:

1. **`docs/grid.md`** — a `streamline` section written first (docs-first rule).
2. **Evaluator** — method dispatch alongside the other `Grid` methods (`sampleBilinear` is at
   `src/evaluator/index.ts:4177`); reuse `gridSampleBilinear` and the `polarLine` delta math.
3. **Language-services** — `completion-data.ts` + `hover.ts` for the new method.
4. **Three-surface parity** — confirm identical output in CLI, playground, and VS Code
   preview (it returns a plain PathBlock, so no new defs-producer wiring is needed).
5. **Tests** — `tests/evaluator.test.ts` for geometry + termination behavior.

### Alternatives considered

- **A `polarTo` PathBlock-builder sugar** — rejected: `polarLine` already does this inside a
  block; a second name adds surface without new capability.
- **A mutable `PathBuilder` value** (`.line()`, `.polar()`, `.move()`, `.build()`) — rejected
  for now: heavier, and less idiomatic than the relative `@{}`-block pattern the language
  already favors. `streamline` solves the actual flow-field use case directly without
  introducing a new mutable type.

**Recommendation:** ship nothing this round; adopt the Part-A pattern now, and greenlight
`Grid.streamline` as its own small, docs-first feature when there's appetite.
