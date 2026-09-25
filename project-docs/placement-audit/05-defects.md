# 05 — Measured defects

Nine bugs found while auditing. D1–D4, D6, D7 and ISSUE-015 are **reproduced** by
`probes/run-defects.sh`; D8 was probed by hand (see `02`, text surface); **D5 and D9 are
source reads** and are labelled as such. Four are user-visible
breakage rather than design debt. None is fixed here; these are drafted to become
`known-issues.md` entries.

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

## D5 — The conic gradient ignores the viewBox origin · **Medium** · *source read*

`buildSvgTree` passes `buildDefs` the viewBox width and height but never `originX`/`originY`
(`src/render/build-tree.ts:63`). With `define ViewBox(-100, -100, 200, 200)` the visible area
is `(-100,-100) → (100,100)`, but the conic mask, its backing `<rect>` and its output
`<pattern>` all span `(0,0) → (200,200)`, and the default conic centre lands at `(100,100)`
— the bottom-right corner instead of the middle.

Negative origins are explicitly recommended for centring in `docs/viewbox.md`.

**Fix:** thread the origin through `buildDefs`.

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

## D7 — A bare number means radians in three unrelated places · **Medium**

`#{ rotate: 45; }` on a layer is **45 radians** (≈2578°), because style-block evaluation
converts an `AngleValue` to radians first and `extractConvenienceTransform` then multiplies
by 180/π. Same footgun in `Marker.orient = 45` and in `text(x, y, 45)`. Each converts at a
different boundary. Only the `45deg` spelling is correct in all three.

**Fix:** reject a bare number where an angle is expected, or define the unit once.

---

## D8 — `ProjectedText.polarProject()` corrupts `origin` · **Low** · *probed by hand*

Everywhere else `origin` is the cumulative translation from block-local. `ProjectedText.polarProject`
(`index.ts:4467-4494`) computes its anchor offset from **already-absolute** elements, so it
stores an incremental delta as `origin`, discarding the prior one. Element coordinates come
out right; a later `.drawTo(X, Y)` — which computes `X − origin.x` — mis-places by the
discarded amount.

---

## D9 — `dash()`'s percent resolves against a total the pattern never uses · **Low** · *source read*

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
