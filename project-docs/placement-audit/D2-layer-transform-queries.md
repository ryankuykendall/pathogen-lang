# D2 — A query on a transformed layer answers coordinates that are not on screen

**Status:** readback defect FIXED and option C LANDED 2026-09-24; option D open
**Severity:** High · **Audit:** `05-defects.md` D2
**All measurements below are reproducible** — probes in the CLI, one per claim.

## The issue

A layer query returns a `ProjectedPathValue`, whose documented contract is page
coordinates (`docs/layers.md:112`: results are "in page coordinates"). When the layer carries
a `transform`, that is false: the query answers **pre-transform** coordinates and the browser
then moves the geometry.

```
let moved = PathLayer('moved') #{ translate-x: 100; translate-y: 50; };
let dots  = PathLayer('dots')  #{ fill: #c00; };

moved.subscribe('endpoint') {|corner, i, sub|
  dots.apply { circle(corner.x, corner.y, 3); }
};
moved.apply { M 10 10; L 60 10; }
```
```html
<path id="moved" d="M 10 10 L 60 10" transform="translate(100, 50)"/>   <!-- renders at (110,60)–(160,60) -->
<path id="dots"  d="M 57 10 a 3 3 0 1 1 6 0 …"/>                        <!-- dot at (60,10) -->
```

The annotation lands 100,50 away from the thing it annotates. Nothing warns.

**Why:** transforms never touch pathogen's data. `TransformState` is serialized to an SVG
`transform` attribute at render (`src/render/build-layers.ts`), and
`src/evaluator/path-query.ts` never reads `layerState.transformState`. There is a fourth
coordinate space — *layer-local, pre-transform* — wearing the `ProjectedPath` type.

## Scope

**Every transform spelling, and it compounds through groups.**

| Source | Query says | Renders at |
|---|---|---|
| style keys `translate-x/-y` | `Point(60, 10)` | `(160, 60)` |
| imperative `ctx.transform.translate.set(0,100)` | `Point(60, 80)` | `(60, 180)` |
| inside a transformed `GroupLayer` | `Point(60, 10)` | `(260, 10)` |
| `scale-x: 2; scale-y: 2` | `Point(60, 150)` | `(120, 300)` |

**Scale corrupts more than position.** On a 2× layer, a queried `length` is `50` where the
rendered length is `100`, and `boundingBox().width` is `50` against a rendered `100`. So this
is not a constant offset you can subtract — every derived measurement is wrong too.

**Subscriptions inherit it**, since they share the same `QuerySource`.

## Three facts that constrain the fix

**1. ~~The transform is not readable back for the common spelling.~~ FIXED 2026-09-24.** A manual workaround
("query, then add the transform yourself") is unavailable where it is most needed:

| Spelling | `ctx.transform.translate` reads back | Renders with the transform? |
|---|---|---|
| `#{ translate-x: 100; translate-y: 50; }` | `0,0` | yes |
| `ctx.transform.translate.set(100, 50)` | `100,50` | yes |

Style-block transforms were resolved at emit time and never populated `transformState` —
two stores, one write-only. `absorbStyleTransform` now moves the shorthand into the layer's
`TransformState` at creation, so there is one store: the shorthand reads back through
`ctx.transform`, and the two spellings compose instead of the shorthand silently discarding a
later imperative call. Output is unchanged (`transformStateToSvg` emits the same attribute for
numeric input); a non-numeric value such as `10px` is left on the legacy path verbatim.

**2. Applying the transform at query time would double-apply in the same-layer case.**
Annotating a layer from within itself works correctly today:

```
moved.apply {
  let seam = layer('moved').query('command(l)').block;
  seam.draw();                     // d="… M 10 10 l 50 0" — overlays the original exactly
}
```

Both the original and the redrawn seam are layer-local and both receive the transform once at
render. If the query returned post-transform coordinates, this seam would be transformed
again — landing at (210,110) instead of (110,60). Any fix that changes what queries return
must not break this idiom.

**3. `ProjectedPathValue` cannot currently express a transformed result.** `projectCommands`
is pure translation. A rotated or scaled query result needs full matrix application to the
command list, including arc radii and flags — real geometry work, not a coordinate add.

## Options

**A — Apply the transform to query results.** Makes "page coordinates" true. Costs: matrix
application across every command type; correct composition through nested GroupLayers; and a
resolution for fact 2, since same-layer annotation would otherwise double-apply. Largest
change, and the one that most improves the mental model.

**B — Refuse to query a transformed layer.** An error naming the transform and the layer.
Cheap, safe, honest, and it satisfies the audit's P4. Blunt: it removes a capability that
works fine as long as you know which space you are in, and same-layer annotation (fact 2) is
currently *correct* and would be forbidden.

**C — Name the space and expose the transform. LANDED 2026-09-24.** `docs/layers.md` gained
"Queries and layer transforms": queries answer in the layer's own coordinates, scale makes it
plainest, and there are two worked ways to live with it — annotate inside the same layer, or
compose `ctx.transform` yourself. The two false promises ("in page coordinates",
"ProjectedPath (absolute coords)") are corrected. Both examples in the section are verified
against the compiler.

**D — Warn on the cross-layer case only.** Fire when a query result from a transformed layer
is drawn into a layer with a *different* transform — which is exactly the failing pattern in
the repro, and leaves the correct same-layer idiom alone. Narrower than B, more targeted than
C, and needs no matrix work.

## Recommendation

**Fix fact 1 first, regardless of which option you choose** — style-set transforms should
populate `transformState`. It is a clear defect on its own, it makes the transform
inspectable, and it is a prerequisite for C and for any diagnostic in B or D.

Then **D, then C**: warn on the genuinely-wrong pattern, document the space, and leave the
working idiom working. Reach for **A** only if layer transforms are meant to be a first-class
layout tool rather than a render-time convenience — that is a product question, not a bug
question, and it is the one I would want your read on.

## Reproduce

```bash
npx tsx src/cli.ts <probe>.pathogen --output-svg-file=/dev/stdout   # compare d + transform
bash project-docs/placement-audit/probes/run-defects.sh             # D2 row
```
