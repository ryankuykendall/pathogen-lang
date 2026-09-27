# 05 — Measured defects

Nine bugs found while auditing. D1–D8 and ISSUE-015 are **reproduced** by
`probes/run-defects.sh` (D2 checks its mitigation, D6 and D9 their as-spec behaviour; D5, D8
and D9 gained probes 2026-09-26). Four are user-visible breakage rather than design debt.

**Status:** D1, D2 (mitigated), D3, D4, D7 and ISSUE-015 are fixed — each entry says so and
when. D6 was investigated and deliberately left alone. D5 and D8 were fixed 2026-09-26
(ISSUE-027, ISSUE-028). D9 was decided as-spec and documented the same day (ISSUE-029).
Nothing in this list is open.

Severity is "how likely is a user to hit this, and how hard is it to diagnose when they do".

---

## D1 — Every `<defs>` producer emits invalid SVG · **High** · **FIXED 2026-09-24**

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

**The contrast that names the cause.** Append a *positioned* block and the same call is
valid:

```
m.append(@{ m 0 0 h 40 v 40 h -40 z });   →  <path d="M 0 0 H 40 V 40 H 0 Z"/>   valid
m.append(@{ h 40 v 40 h -40 z });         →  <path d="H 40 V 40 H 0 Z"/>         invalid
```

So the leading `m` is what makes serialization correct — the opposite of the cursor-dependence
problem it causes elsewhere. It is also why the six defs byte-snapshot fixtures are clean:
`snapshots/03-mask.pathogen:3` authors `@{ m 0 0 … }`.

**FIXED** by `defsPathData` (`src/evaluator/index.ts`), which prepends the absolute first
point at the five defs serialization sites. Serialization only — `commands` untouched. Landed
with ISSUE-015, which is the same failure in layers. `probes/run-defects.sh` now reports
D1 and ISSUE-015 as FIXED; leaving those probes in place makes them the regression check.

---

## D2 — A query on a transformed layer answers in a space that is not on screen · **High** · **MITIGATED 2026-09-24**

> Expanded: **[`D2-layer-transform-queries.md`](D2-layer-transform-queries.md)** — full scope, the three facts that constrain a fix, and four costed options.

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

## D3 — `ProjectedPath.drawTo()` drops every label · **Medium** · **FIXED 2026-09-24**

Measured: a block with two `as segment(...)` labels reports 2/2 labelled commands through
`reverse`, `offset`, `scale`, `rotate`, `subPath`, `startAt`, `mirror`, `project` and
`toPathBlock` — and **0/2** through `ProjectedPath.drawTo()`.

`index.ts:3490-3495` rebuilds commands without the `meta` spread that `projectCommands`
(`:1261`) has, so `derivedMeta` never runs. `PathBlock.drawTo` goes through `projectCommands`
and keeps labels.

Sharpened by the fact that `drawTo` is the *only* way to translate a `ProjectedPath` — there
is no `translate` member — so the one available move operation is the one that silently
destroys labels.

**Fixed 2026-09-24 (`fdc3bc3`):** the `meta` spread was added. One line, no behaviour change
beyond the fix; `probes/run-defects.sh` reports `labels=2`.

---

## D4 — `ProjectedPath.union/difference/intersection/xor` return a PathBlock holding page coordinates · **Medium** · **FIXED 2026-09-25**

Declared `ProjectedPath` in `src/pathogen-api.ts:1396-1402`; measured result is a PathBlock
(relative `d`) whose numbers are page coordinates. Drawing one re-offsets it from the cursor,
double-placing it.

This is ISSUE-025's twin and is unrecorded. `cut` has the same shape.

**Fixed in two steps.** First "declare the truth" (the five declarations moved to
`PathogenPathBlock`), then **Fix A**: all six now return a ProjectedPath from a ProjectedPath
receiver, so P3 holds and the positioned-block artefact is gone from this family — a result
drawn from a non-origin cursor no longer shifts.

The migration was smaller than the raw grep suggested. Of 294 published samples, **4 failed to
compile** (a redundant `.project(0, 0)` on a value that is already projected) and **5 changed
geometry** (`.drawTo(0, 0)`, which used to seat the block frame and now seats the ink). All
nine were migrated and every one of the 294 verified **geometrically identical** to a
pre-change baseline; the only three flagged were the samples that use `random()` and differ
from themselves run to run.

`anchor` (V2) landed alongside for the operations that genuinely discard position — which on a
ProjectedPath receiver `subPath` no longer does.

---

## D5 — The conic gradient ignores the viewBox origin · **Medium** · *probed* · ISSUE-027 · **FIXED 2026-09-26**

`buildSvgTree` passes `buildDefs` the viewBox width and height but never `originX`/`originY`
(`src/render/build-tree.ts:63`). With `define ViewBox(-100, -100, 200, 200)` the visible area
is `(-100,-100) → (100,100)`, but the conic mask, its backing `<rect>` and its output
`<pattern>` all span `(0,0) → (200,200)`, and the default conic centre lands at `(100,100)`
— the bottom-right corner instead of the middle.

Negative origins are explicitly recommended for centring in `docs/viewbox.md`.

**Fix:** thread the origin through `buildDefs`.

Measured 2026-09-26 (`probes/run-defects.sh`, D5): `define ViewBox(-100, -100, 200, 200)` with
a conic fill emits `<pattern id="g" x="0" y="0" width="200" height="200">`. `ConicGradient`
requires `cx, cy`, so the default-centre half above is unreachable from Pathogen; the tile,
mask and rect placement is the user-visible part, on all three surfaces.

**Fixed 2026-09-26:** one rule, `resolveConicPlacement` in `src/conic-param.ts`, for every
renderer — the wedge paths (CLI, and VS Code through `buildSvgTree`), the playground's Canvas
2D fallback and its WebGPU uniform — so the origin cannot be honoured by one and dropped by
another. The rule is **tile-local**: SVG draws pattern content in the tile's own coordinates
(its top-left is `(0, 0)`) and the rasters cover the same tile, so every renderer subtracts
the viewBox origin from the centre and only the `<pattern>` itself is placed at the origin.
(The first cut placed the tile and left the wedges in user space; the CLI PNG showed one
quadrant anchored at the corner — the raster paths were already tile-local, which is why
WebGPU and Canvas 2D agreed with each other and not with the wedges.)
`BuildDefsOptions.originX/originY` is threaded from `buildSvgTree` (the viewBox's first two
numbers), from the preview pane (the store's `viewBoxOriginX/Y`) and from `bbwp.html`; the
texture cache keys on the origin. Verified in `verify/d5/`: the CLI wedges are pixel-identical
to a `0 0 200 200` control, the headless WebGPU and Canvas 2D renders and the **live
playground's** rasters (both modes, `verify-playground.mjs`) agree with them within the 1°
wedge quantization, and the committed `conic-parity/` renders are unchanged. The probe reads
FIXED. Not covered, and separate: the mesh/freeform/topo **CLI fallback rects** still sit at
`(0, 0)` with the gradient's own size — they are placeholders, not renders.

---

## D6 — `rotateAtVertexIndex`'s index is inert on a PathBlock · **not a bug — document or deprecate**

**Revised 2026-09-24.** The first write-up said the index was ignored. The observable claim
holds; the mechanism named was wrong, and the behaviour turns out to be deliberate.

```
let b = @{ m 40 25 h 60 v 30 h -60 z };
b.rotate(15deg).d              // m 32.1665569… 34.5009074… l 57.955549…
b.rotateAtVertexIndex(1, 15deg).d   // identical
b.rotateAtVertexIndex(2, 15deg).d   // identical
```

The index **is** passed to `rotateAtVertexCommands`. The result is then re-based by
`buildPathBlockFromCommands(rotated)` with the origin argument omitted. Rotations of a rigid
shape about different pivots are congruent and differ only by translation, so re-basing
removes the only thing the pivot changed: the returned value is identical for every index.

**Why this is not a defect to fix.** The re-basing is deliberate, and three things depend on
it:

- `tests/path-blocks.test.ts` pins it, including a case named "startPoint (0,0) for the
  self-rebased PathBlockValue result", with comments that compute the normalized expectation.
- `website/blog/samples/post40/shattered-glyph.pathogen:74` documents it in a comment —
  *"rotateAtVertexIndex rebases its result to the pivot vertex, so add the pivot's
  glyph-local position back when placing the shard"* — and compensates for it.
- `validate:samples` would **not** catch a change: it checks warnings and collisions, not
  geometric identity, so a silent shift in that sample would ship.

A frame-preserving version was implemented and reverted for exactly this reason.

**What is still wrong:** a declared parameter that cannot change the returned value on this
receiver. The honest options are to document the behaviour on `docs/path-blocks.md` (the page
documents the re-basing for `rotateAtVertexIndex` at `:539` but does not say the index is
therefore unobservable), or to deprecate the index on a PathBlock receiver and direct callers
to the ProjectedPath form, where it works — `rotate` gives `Point(200,300)` and
`rotateAtVertexIndex(1, …)` gives `Point(202.04, 284.47)`.

Recorded at the call site in `src/evaluator/index.ts` so the next reader does not "fix" it.

---

## D7 — A bare number means radians · **Medium** · **FIXED 2026-09-26**

`#{ rotate: 45; }` on a layer is **45 radians** (≈2578°), and the same footgun sat in
`Marker.orient = 45` and `text(x, y, 45)`.

**Two corrections to this entry, both found while fixing it.**

*It was not three places — it was about fifty.* Nine context-aware functions, nine stdlib
functions, five methods duplicated across both the PathBlock and ProjectedPath switches,
eight text entry points, four Color methods and nine property assignments.

*And they were not converting at different boundaries.* The convention is uniformly radians
and deliberately so, documented at `docs/markers.md:140` and named in the titles of
`tests/layers.test.ts:448`, `:2506` and `tests/markers.test.ts:150`. Measured: `rotate(45)`
and `rotate(45deg)` differ, so `sq.rotate(45)` is radians too. D7 was never an
inconsistency; it was a convention that is easy to type wrong.

**Fixed** by requiring an explicit unit on a *literal* in a radians position, declared once in
`src/angle-params.ts` and locked by the behavioural matrix in `tests/angle-params.test.ts`.
Two deliberate limits, both in `docs/syntax.md`: the rule is static, so `let spin = 45;
sq.rotate(spin)` still means radians; and degrees positions (the OKLCH hue family, the SVG
arc rotation) are exempt because a bare number there already means what it says. Requiring
units there would have churned 349 sites across 29 samples rather than 26 across 6.

Two defects surfaced while cataloguing, each fixed first:

- **the SVG arc rotation slot is degrees**, so flattening an Angle to radians made `45deg`
  mean 0.785° — writing the unit gave *less* rotation than omitting it, and the emitted text
  disagreed with `ctx.heading` and `boundingBox()` until both code paths were fixed
- **three rotation slots rejected an Angle outright** (`radialProject`, `Endpoint`
  `ellipticalFillet`, the `with` clause), contradicting the documented promise that an angle
  flows anywhere

---

## D8 — `ProjectedText.polarProject()` corrupts `origin` · **Low** · *probed* · ISSUE-028 · **FIXED 2026-09-26**

Everywhere else `origin` is the cumulative translation from block-local. `ProjectedText.polarProject`
(`index.ts:4669-4697`) computes its anchor offset from **already-absolute** elements, so it
stores an incremental delta as `origin`, discarding the prior one. Element coordinates come
out right; a later `.drawTo(X, Y)` — which computes `X − origin.x` — mis-places by the
discarded amount.

Measured 2026-09-26 (`probes/run-defects.sh`, D8): `t.polarProject(100, 100, 0deg, 50,
BBoxAnchor.TopLeft).origin` is `Point(150, 100)`; the same call after `t.project(50, 100)`
reported `Point(100, 0)` — the prior origin subtracted rather than kept.

**Fixed 2026-09-26:** `origin` is now the prior origin plus the shift just applied — the rule
`translate` already used. `probes/run-defects.sh` D8 reads FIXED, and the `projectedText ·
polarProject` row in `02` reads `origin cumulative`. Pinned by the origin-invariant matrix in
`tests/textblock.test.ts` (every producer, chained or not, returns to block-local under
`drawTo(0, 0)`).

Original hand probe (2026-09-24), moved here from `02` when the text rows became
script-generated — `text(0, 16)` inside `&{ }`, projected at `(100, 200)`:

| Operation | Result | `origin` |
|---|---|---|
| `TextBlock.project(100, 200)` | ProjectedText | `Point(100, 200)` |
| `ProjectedText.translate(10, 10)` | ProjectedText | `Point(110, 210)` — cumulative, correct |
| `ProjectedText.polarProject(0, 0, 0deg, 50, Center)` | ProjectedText | `Point(-57.52, -209.6)` — **a delta, not a position** |
| `TextBlock.boundingBox().width` | number | `15.04` |

---

## D9 — `dash()`'s percent resolves against a total the pattern never uses · **Low** · *probed* · ISSUE-029 · **AS-SPEC 2026-09-26 — documented, denominator unified**

`stroke-dasharray: 50%` inside `dash()` resolves against the **combined** length of all
subpaths, while the dash pattern **restarts at each subpath**. On a three-subpath receiver,
`50%` means "half of all three", applied afresh to each.

Compounding it: that total comes from `totalDrawnLength`, which drops degenerate subpaths,
while `.length` uses `calculatePathLength`, which does not — so the number the user logs and
the number `%` resolves against can differ on the same receiver.

And the same six characters in a **layer** style block survive to the SVG attribute, where
the spec resolves `%` against the viewport diagonal — a third, unrelated denominator.

Measured 2026-09-26: `@{ h 30 m 10 0 h 30 m 10 0 h 30 }.dash(#{ stroke-dasharray: 50%; })`
yields three pieces of length 30 — `50%` resolved to 45 against the combined 90, each 30-long
subpath restarting and entirely dash. The `.length` half is small but real: on
`@{ h 40 c 10 0 20 10 30 10 s 20 10 30 10 m 10 0 h 20 }`, `.length` is 123.815 while `50%`
resolved to 61.920 — against a total of 123.839, 0.02% off (the two functions measure the
smooth `s` segment differently). Zero published samples use a `%` dash array.

**Decided 2026-09-26 (Ryan): keep the combined total.** One absolute dash length across all
subpaths is SVG's own behaviour, and per-contour division is one `.contours` call away. Done
as: the denominator is now literally `calculatePathLength` — the function `.length` uses — at
both call sites, so the two numbers cannot drift; `docs/path-blocks.md` says what `%` divides,
what the restart means on a multi-subpath receiver, the per-contour recipe, and that a `%` in
a *layer* style block is SVG's viewport-diagonal percentage. `probes/run-defects.sh` D9 pins
the contract (`AS-SPEC`); `tests/stroke-geometry.test.ts` pins `50%` = `.length / 2` on a cubic
receiver. On a receiver with a smooth `s` segment the piece still re-measures 0.1% off — the
cutter walks the raw command list, where an `s` lacks its reflected control point. That is a
separate, pre-existing measurement gap in `stroke-geometry.ts`, registered as **ISSUE-030** and
deliberately left out of D9 ("no geometry change").

---

## Also worth re-measuring

**ISSUE-002** (open since 2026-01-25) claims `M` on a separate statement does not update
`ctx.position` before context-aware stdlib calls. The recorded example no longer parses, and
the `.draw()` path demonstrably does sync the context. It may already be fixed; it should be
re-measured before anyone acts on it.

**Re-measured 2026-09-26:** fixed. `M 100 100; arcFromPolarOffset(0deg, 50, 90deg);` emits
`M 100 100 A 50 50 0 0 1 150 50` — the arc is computed from the moved position. Closed in
`known-issues.md`, pinned by a regression test in `tests/context.test.ts`.
