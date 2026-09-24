# 05 — Measured defects

Nine bugs found while auditing. Each was **reproduced**, not inferred. Four are user-visible
breakage rather than design debt. None is fixed here; these are drafted to become
`known-issues.md` entries.

Severity is "how likely is a user to hit this, and how hard is it to diagnose when they do".

---

## D1 — Every `<defs>` producer emits invalid SVG · **High**

`Mask.append()`, `ClipPath.append()`, `Pattern.append()`, `Marker.append()` and
`TopoGradient.contour()` serialize through `commandsToAbsoluteD`, which never synthesizes a
leading moveto:

```
let m = Mask('m1');
let b = @{ h 40 v 40 h -40 z };
m.append(b);
m.append(b.project(100, 100));
```
```html
<mask id="m1">
  <path d="H 40 V 40 H 0 Z"/>        <!-- no moveto -->
  <path d="H 140 V 140 H 100 Z"/>    <!-- no moveto -->
</mask>
```

Per the SVG spec, path data must begin with a moveto; browsers discard the whole path. A
mask built this way is empty, so whatever it masks vanishes or shows unmasked. No warning.

This is the same failure class as **ISSUE-015** (open, Medium), which records it for
*layers* only. The `ProjectedPath.d` getter **does** synthesize a leading `M`
(`index.ts:6415`); the defs path does not. The two disagree.

**Fix:** synthesize the moveto where `d` is built for defs, or reuse the `.d` getter's
logic. Additive, no breaking change.

---

## D2 — A query on a transformed layer answers in a space that is not on screen · **High**

```
let moved = PathLayer('moved') #{ translate-x: 100; translate-y: 50; };
moved.apply { M 10 10; L 60 10; }
log(layer('moved').query('endpoint:last').point);   // Point(60, 10)
```
```html
<path d="M 10 10 L 60 10" transform="translate(100, 50)"/>   <!-- renders at (160, 60) -->
```

`layerState.transformState` is never read in `src/evaluator/path-query.ts`. The query returns
a `ProjectedPathValue`, whose contract is "page coordinates" — false here. Every annotation
driven from a layer query on a transformed layer lands off by the transform.

No published page documents this. `docs/layers.md:112` promises query results "in page
coordinates".

**Fix options:** apply the layer transform to query results; or refuse to query a
transformed layer; or document it and name the space. All three are decisions, not cleanups.

---

## D3 — `ProjectedPath.drawTo()` drops every label · **Medium**

Measured: a block with two `as segment(...)` labels reports 2/2 labelled commands through
`reverse`, `offset`, `scale`, `rotate`, `subPath`, `startAt`, `mirror`, `project` and
`toPathBlock` — and **0/2** through `ProjectedPath.drawTo()`.

`index.ts:3490-3495` rebuilds commands without the `meta` spread that `projectCommands`
(`:1261`) has, so `derivedMeta` never runs. `PathBlock.drawTo` goes through `projectCommands`
and keeps labels.

Sharpened by the fact that `drawTo` is the *only* way to translate a `ProjectedPath` — there
is no `translate` member — so the one available move operation is the one that silently
destroys labels.

**Fix:** add the `meta` spread. One line, no behaviour change beyond the fix.

---

## D4 — `ProjectedPath.union/difference/intersection/xor` return a PathBlock holding page coordinates · **Medium**

Declared `ProjectedPath` in `src/pathogen-api.ts:1396-1402`; measured result is a PathBlock
(relative `d`) whose numbers are page coordinates. Drawing one re-offsets it from the cursor,
double-placing it.

This is ISSUE-025's twin and is unrecorded. `cut` has the same shape.

**Fix:** either return a ProjectedPath (P3), or declare the truth. See `04-violations.md` V1.

---

## D5 — The conic gradient ignores the viewBox origin · **Medium**

`buildSvgTree` passes `buildDefs` the viewBox width and height but never `originX`/`originY`
(`src/render/build-tree.ts:63`). With `define ViewBox(-100, -100, 200, 200)` the visible area
is `(-100,-100) → (100,100)`, but the conic mask, its backing `<rect>` and its output
`<pattern>` all span `(0,0) → (200,200)`, and the default conic centre lands at `(100,100)`
— the bottom-right corner instead of the middle.

Negative origins are explicitly recommended for centring in `docs/viewbox.md`.

**Fix:** thread the origin through `buildDefs`.

---

## D6 — `rotateAtVertexIndex` ignores its index on a PathBlock · **Medium**

```
let b = @{ m 40 25 h 60 v 30 h -60 z };   // vertices: (0,0) (40,25) (100,25) (100,55) (40,55)
b.rotate(15deg).startPoint              // Point(32.1665569…, 34.5009074…)
b.rotateAtVertexIndex(1, 15deg)         // Point(32.1665569…, 34.5009074…)   identical
b.rotateAtVertexIndex(2, 15deg)         // Point(32.1665569…, 34.5009074…)   identical
```

All three rotate about `(0,0)`. Rotating about vertex 1 — which *is* the start point — would
leave `startPoint` at `(40,25)`; rotating about vertex 2 would give `(42.04, 9.47)`. Neither
happens. The index argument has no effect.

The **ProjectedPath** variant honours it: `rotate` gives `Point(200,300)` and
`rotateAtVertexIndex(1, …)` gives `Point(202.04, 284.47)`.

**Fix:** use the vertex as the pivot on the PathBlock path, as the ProjectedPath path does.

---

## D7 — A bare number means radians in three unrelated places · **Medium**

`#{ rotate: 45; }` on a layer is **45 radians** (≈2578°), because style-block evaluation
converts an `AngleValue` to radians first and `extractConvenienceTransform` then multiplies
by 180/π. Same footgun in `Marker.orient = 45` and in `text(x, y, 45)`. Each converts at a
different boundary. Only the `45deg` spelling is correct in all three.

**Fix:** reject a bare number where an angle is expected, or define the unit once.

---

## D8 — `ProjectedText.polarProject()` corrupts `origin` · **Low**

Everywhere else `origin` is the cumulative translation from block-local. `ProjectedText.polarProject`
(`index.ts:4467-4494`) computes its anchor offset from **already-absolute** elements, so it
stores an incremental delta as `origin`, discarding the prior one. Element coordinates come
out right; a later `.drawTo(X, Y)` — which computes `X − origin.x` — mis-places by the
discarded amount.

---

## D9 — `dash()`'s percent resolves against a total the pattern never uses · **Low**

`stroke-dasharray: 50%` inside `dash()` resolves against the **combined** length of all
subpaths, while the dash pattern **restarts at each subpath**. On a three-subpath receiver,
`50%` means "half of all three", applied afresh to each.

Compounding it: that total comes from `totalDrawnLength`, which drops degenerate subpaths,
while `.length` uses `calculatePathLength`, which does not — so the number the user logs and
the number `%` resolves against can differ on the same receiver.

And the same six characters in a **layer** style block survive to the SVG attribute, where
the spec resolves `%` against the viewport diagonal — a third, unrelated denominator.

---

## Also worth re-measuring

**ISSUE-002** (open since 2026-01-25) claims `M` on a separate statement does not update
`ctx.position` before context-aware stdlib calls. The recorded example no longer parses, and
the `.draw()` path demonstrably does sync the context. It may already be fixed; it should be
re-measured before anyone acts on it.
