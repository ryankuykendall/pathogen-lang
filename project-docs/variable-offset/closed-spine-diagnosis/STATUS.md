# variableOffset on closed spines — diagnosis and proposal

_2026-09-19. Triggered by the "Segmenting the circles v5" workspace: a ring built
from `circle().variableOffset()` plus an inner circle. Five reported issues plus
a set of browser-console errors noticed mid-session._

Resume point for this thread. Nothing here is committed.

## What was reported

1. No way to start the offset somewhere other than the closure point of a closed
   path, so a bump cannot straddle the seam.
2. Placing a `variableOffset()` result needs geometry bookkeeping — the origin
   moves, so an outer (offset) circle and an inner circle stop being concentric.
3. No way to close the offset from inside the builder block.
4. "What is going on": a narrow spike at 50% makes the whole circle balloon
   between roughly 25% and 75%, however the stops are tuned.
5. Do we need `.preserveSubpath(tStart, tEnd)`?
6. (mid-session) Chrome console: `<path> attribute d: Expected number,
   "… a undefined undefi…"`, five distinct errors repeated per mount surface.

## Findings

### Item 4 — not a bug: it is Model A, by recorded decision

`variableOffset` builds a **fresh spline through the stops' knots**. The spine
only positions and orients those knots; its own segments never reach the output
(`design-note.md` §2, "Model A — rail-guided points"). Nine stops on a circle
give seven distinct knots, and a Catmull-Rom spline through seven points is a
rounded polygon, not a circle.

Measured on the 20% → 45% span (a 90° arc, r = 500): the emitted cubic's handles
are ≈ 0.34 r where a circular arc needs ≈ 0.55 r, and the tangent at the 45%
knot is ≈ 17° off the circle's true tangent. The span is therefore nearly a
straight chord. Evidence: `probes/01-user-stops-vs-spine.png` (the "guitar pick",
spine overlaid).

The design note **explicitly rejected** the behaviour the user expected — "Model
B: an output that hugs the spine's shape with a ramping perpendicular distance" —
as "a separate feature, not a mode of this one". The user's use case (keep the
circle, add one bump) is exactly Model B. The name `variableOffset` and the docs'
framing ("lets the distance vary from stop to stop") both read as promising Model
B, which is why the result surprises.

### Items 1, 2, 3 — what exists today

| # | Need | Today | Gap |
|---|------|-------|-----|
| 1 | bump across the seam | `spine.startAt(t)` re-seams a closed path, seam healed (`docs/path-blocks.md`) | works; every stop time must be re-mapped by hand |
| 2 | keep the spine's frame | `result.anchor` holds the removed translation; `drawTo(x + anchor.x, y + anchor.y)` | the bookkeeping the user objects to; `anchor` is lost after `<<`, `.reverse()`, `.offset()` |
| 3 | close the offset | none — a 0% stop and a 100% stop merely coincide | no `z`; the seam is two independent endpoint tangents, not a continuity-governed knot |

The misplaced inner circles were **not** an offset defect: `a << b` continues `b`
from where `a` **ends**. The offset ends at its own tip, so `circle(500, 500,
inner)` landed +500,+500 from the tip.

### Item 6 — a genuine compiler defect (fixed this session)

`mapSlice(2)` is a sliding window whose last slice is short
(`[r1,r2],[r2,r3],[r3]` — documented). `let [outer, inner] = [r3]` binds `inner`
to `null` (documented). `circle(500, 500, null)` then compiled **successfully**,
exit 0, zero warnings, writing `a null null …` — and inside a `@{ }` block
`a undefined undefined … NaN NaN`. `docs/syntax.md` already promised that null
"as a path argument throws a descriptive error"; raw path commands honoured it,
path-emitting functions did not.

Probe matrix (`probes/04-…` and the inline runs): silent for every stdlib shape
function, for context-aware functions (`polarLine` coerced null → 0, `tangentArc`
wrote `A null null`), and for NaN from math (`sqrt(-1)`). Already guarded: raw
path args, arithmetic on null, `arr[5]` out of bounds.

## What changed this session (uncommitted)

- `src/evaluator/path-emit-guard.ts` (new) — single home of the rule. Derived
  from `pathFunctions` by function identity, so a new shape function is guarded
  on arrival and a user binding that shadows a stdlib name is not misjudged.
- `src/evaluator/index.ts` — consulted at the two call chokepoints (plain stdlib,
  context-aware). Three checks: arity, null / non-finite argument (names the
  variable when the argument is an identifier), and a backstop on the emitted
  string for routes the argument check cannot see.
- `tests/path-emit-guard.test.ts` (new) — coverage matrix derived from
  `pathFunctions` × every argument position, every context-aware function, the
  reported program shape, NaN / Infinity, arity, and byte-identical valid output.
- `tests/path-blocks.test.ts` — one pre-existing test called `circle(10)` (one
  argument to a three-argument function) and asserted only the `M 50 50` prefix,
  so `M NaN undefined a undefined …` had been passing. Now a valid call with an
  exact-output assertion.
- `docs/syntax.md` — Null → Error Behavior covers drawing functions;
  `.mapSlice()` documents the short-slice destructuring trap with the length
  check. **Needs agentic review before commit** (docs/CLAUDE.md).

Verification: full suite 151 files / 6191 tests green. Read-only sweep of all 510
git-tracked `.pathogen` sources under `website/blog/samples`, `docs`,
`project-docs`: **0** rejected by the guard (56 fail for unrelated pre-existing
reasons — fonts under bare `compile()`, pre-semicolon syntax). CLI verified on
the user's verbatim program: `Line 49, col 7: circle(): argument 3 (`inner`) is
null — path functions need a number here`, exit 1.

Not verified by me: the playground in a browser (site rebuilt with the local API
base pinned; not driven through puppeteer), and VS Code (`.vsix` not rebuilt).
The guard has no per-surface wiring — it raises an ordinary compile error — but
that is reasoning, not observation.

Flagged, not touched: `npx tsc --noEmit` reports pre-existing errors in
`src/cli.ts` (`_legacyGenerateSvg` is dead code referencing missing `escapeXml`
/ `radToDeg`). `src/cli.ts` is unmodified in this session.

## Working today — the corrected artwork

`segmenting-the-circles-v5-fixed.pathogen` (render:
`probes/05-fixed-artwork-cropped-view.png`). Three marked fixes, the author's
layout / colours / stop values untouched:

1. skip `mapSlice`'s short last slice;
2. densify the nine stops to one per ~5° inside the builder, easing the offset
   between rows, so Model A has enough knots to follow the circle
   (`probes/02-dense-stops-workaround.png`);
3. keep outer and inner as separate blocks, drawn into one layer at one origin
   with `anchor` + `fill-rule: evenodd`
   (`probes/03-seam-spanning-and-concentric.png`, which also shows `startAt(50%)`
   carrying a bump across the original seam).

Cost of the workaround: ~74 cubics per ring instead of ~9, and the densifying
loop is boilerplate every author would have to rediscover.

## Proposal — awaiting the author's decision

**A. Spine-hugging offset (the real fix for 4, and the answer to 5).** Interpolate
the offset *distance* between stops and emit `spine(t) + d(t)·normal(t)`.
`CurveContinuity` keeps a clean meaning — it governs the 1-D profile `d(t)`
(G0 corner, G1 smooth, G2 curvature-continuous) — which answers the design
note's objection that Model B "muddies what continuity means". The tangent is
analytic, so cubic Hermite fitting is tractable; the design note's "genuinely
hard" part is cusp trimming where `d` exceeds the radius of curvature, which the
existing self-intersection policy (§4.6, emit the true curve) already covers.
Open: spine corners need joins, as `offset()` has.

With A, `preserveSubpath` is unnecessary: two stops with equal offsets already
preserve the spine between them (offset 0 → the spine itself). Recommend **not**
adding it.

Surface options: (1) `spine.offset() {|profile, pb| … }` — `offset(d)` is
uniform, `offset` with a block is variable; inherits `{ join }`; (2) a new method
name; (3) a mode switch on `variableOffset` (the design note argued against).
Recommendation: (1).

**B. Seam (item 1).** On a closed spine let stop times run past 100% and wrap
(`stop(90%) … stop(110%)`), keeping the non-decreasing rule. No time re-mapping,
unlike `startAt`. Additive.

**C. Origin (item 2).** A way to keep the spine's frame so
`outer.drawTo(x, y); inner.drawTo(x, y);` is concentric with no `anchor` math.
Note a frame-preserving result alone does not rescue `<<` (it continues from the
end point) — composing a ring wants same-layer subpaths or a frame-preserving
combine.

**D. Close (item 3).** `vo.close()` — treat the knots as periodic so the first
stop's continuity governs the seam, and emit `z`. Needs a cyclic solve for G2.

Suggested order: A → D → B → C. Each is docs-first (`docs/variable-offset.md`),
then tests, then the three-surface pass.

---

## Follow-up (same day) — author's two challenges

### "Would `reset()` / `backToOrigin()` have resolved the positioning?" — No. Measured.

History, corrected against the record (`cutting-room/opportunities/H-block-reorientation/`,
`FEATURE-OPPORTUNITIES.md` #15): `returnToOrigin()` was dropped in favour of
block-local absolute `M 0 0` (Item H, mechanism 1); that was in turn **dropped as
superseded by the author's Item L** — `@{|ctx| … }` with `ctx.origin.return()`
emitting a *relative* `m dx dy` home ("relative purity preserved by design").
Item L was deferred as a fast-follow on 2026-08-24 and **never landed**:
`@{|ctx| …}` does not parse today, and `M` inside a block is still rejected. Only
`L-ctx-block-argument/intent.md` exists.

`probes/06-return-to-origin-experiment` emulates exactly what
`ctx.origin.return()` would emit (`m -endPoint`):

- `bumped.endPoint = Point(0, 0)` — a closed offset **already ends on its own
  origin**. Return-to-origin emits `m 0 0`, a no-op.
- Render: (A) original `<<` and (B) return-to-origin are pixel-identical, inner
  circle displaced. (C) stepping back by `anchor` as well is concentric.

The pen never drifted from the block's origin. `variableOffset` **moved the
origin itself** (normalized to the curve's first point), so returning to it
returns to the wrong place. The displacement is exactly `anchor` = (195, 700).

Design consequence: the two features are **complementary, in a fixed order**.
Return-to-origin only helps once the origin is the right one. If a result kept
the spine's frame (proposal C), its end point would be `anchor` and
`ctx.origin.return()` would emit precisely the `m -anchor` that probe 06 (C)
writes by hand. Proposal C is the prerequisite; Item L is the ergonomic finish —
and remains worth building for its original cutting-room use case regardless.

### The author's critique of the v1 fix was fair

v1 split each ring into two blocks. Probe 06 (C) shows that was unnecessary.
`segmenting-the-circles-v5-fixed-v2.pathogen` keeps the author's
`outerPB << inner` composition — one PathBlock per ring — by inserting
`m -endPoint -anchor` between them (render:
`probes/07-fixed-v2-single-block-cropped-view.png`, concentric). v1 kept for the
paper trail. v2 still carries `anchor` arithmetic and the `mapSlice` length
guard: both are workarounds for the two language gaps, not fixes.

### `mapSlice(size, strict = true)` — assessment

Agree, including strict as the **default**. Short tails are almost never wanted
from a sliding window, and the mainstream equivalents yield only full windows
(Kotlin `windowed(size, step, partialWindows = false)` is nearly this exact
proposal; Rust `windows`, Ruby `each_cons`).

- Blast radius in the repo: **no** published blog sample or docs example uses
  `mapSlice` outside its own docs section; 5 unit tests in
  `tests/evaluator.test.ts` (2738–2769) pin the short tails. Unknown and not
  measurable from here: stored production workspaces relying on short tails.
- Shape: Pathogen has no named arguments. The precedent for optional settings is
  an options object — `offset(5, { join: 'round' })` — so
  `mapSlice(2, { strict: false })` rather than a bare positional
  `mapSlice(2, false)`, which does not say what `false` means at the call site.
- It is a breaking change to a documented default → the author's call. If it
  lands, the `.mapSlice()` trap paragraph added to `docs/syntax.md` this session
  should be rewritten around the new default rather than kept.
- Independent of this, the path-emit guard stays: it is what turned the silent
  `a undefined` into a positioned error, whatever produced the null.

---

## Follow-up 2 (same day) — strict `mapSlice` landed (uncommitted)

The author chose to fix the `mapSlice` trap at its source: full windows by
default, `{ partial: true }` to keep the short tails. Record:
`../../strict-mapslice/STATUS.md`.

`segmenting-the-circles-v5-fixed-v3.pathogen` is v2 with the `radius.length == 2`
guard **removed** — the loop is the author's original shape again. It compiles
with 0 warnings and renders concentric (`probes/08-fixed-v3-unguarded-cropped-view.png`).
Of v1's three workarounds, one is now gone. Still standing, each waiting on a
language change from the proposal above:

- the densifying loop inside the builder → needs the spine-hugging offset (A);
- the `m -endPoint -anchor` step between the offset and the inner circle →
  needs the origin option (C), after which Item L's `ctx.origin.return()` would
  express it directly.
