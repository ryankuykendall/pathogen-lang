# Item B (log #1 + #12): ProjectedPath in-place draw() — rich summary

**Delivered 2026-08-24 for user review.** No code changed yet.
**Addendum 2026-08-24:** before/after comparison added up front per
review-format feedback; prose case-making unchanged below it.

## Before / after

| | Before (today) | After (proposal) |
|---|---|---|
| Stroke a seam where it lies | `seam.drawTo(seam.startPoint.x, seam.startPoint.y);` | `seam.draw();` |
| Draw a whole projected cut piece in place | `M px py` + `piece.draw();` (block form; using `placed.drawTo(placed.startPoint…)` silently shifts the piece ~its local offset) | `placed.draw();` — correct by construction |
| `drawTo(x, y)` meaning | Anchors `startPoint` at (x, y); correct only when `startPoint == commands[0].start` (true for sub-runs, false for cut pieces) — contract undocumented | Unchanged behavior, contract documented with the footgun named |
| `startPoint` semantics | Frame origin on cut pieces (the 2026-08-01 backlogged audit's "lying producers") | Unchanged in Item B; truthful "first inked point" queued as B2 (audit revival) |

```pathogen
// before — every sample, both idiom fences
for (seam in placed.segmentAll('cut')) {
  seam.drawTo(seam.startPoint.x, seam.startPoint.y);
}

// after
for (seam in placed.segmentAll('cut')) {
  seam.draw();
}
```

## The friction, as experienced

Every single Cutting Room sample strokes seams with the incantation
`seam.drawTo(seam.startPoint.x, seam.startPoint.y)` — "draw yourself
where you already are" expressed as a two-property re-anchor. Worse, the
same expression applied to a WHOLE projected cut piece silently drew the
piece ~63 units away from its own annotations (caught by content review
in post43/03+05), because a cut piece's `startPoint` is its projected
frame origin, not its first command's position.

## The mechanics (implementation-site report, verified anchors)

- ProjectedPath has NO `draw` case — its method switch
  (src/evaluator/index.ts:3069) goes straight to `drawTo`, whose
  emission (:3086-3102) re-projects commands and emits
  `M dtX dtY` + relative body — WITHOUT the `bridgeOriginGap` option
  PathBlock's draw/drawTo pass (:2416, :2450).
- **The crisp invariant:** `drawTo` is correct exactly when
  `startPoint == commands[0].start`. True for every `segmentAll`
  sub-run (buildSubProjected sets startPoint to the first command's
  start, :3195). False only for whole cut pieces:
  buildPathBlockFromCommands hardcodes startPoint (0,0) (:1008) while
  emitRing deliberately omits the leading `m` (boolean-ops.ts:4449).
- **Feasibility asymmetry:** a new `draw()` is STRICTLY ADDITIVE — emit
  `M commands[0].start` then the relative body; touches nothing.
  "Fixing" drawTo is a behavior change with real regression surface —
  and naively adding `bridgeOriginGap: true` would DOUBLE-OFFSET every
  seam sub-run that works today (the option tests the first command
  against absolute zero, valid only for block-local commands).
- Annotated counterpart: annotated.ts:1854 (same drawTo, no draw);
  PathBlock's annotated draw at :1750 is the template.
- API: pathogen-api.ts ProjectedPath @type at :1103-1181; PathBlock's
  draw doc-comments at :752-755 are the pattern.

## Proposed design

1. **`ProjectedPath.draw()`** (0 args): draws the path exactly where its
   commands lie — emits `M commands[0].start.x/.y` followed by the
   relative body via serializeRelativeAndTrack; returns the same
   ProjectedPathValue (chainable like PathBlock.draw's PathWithResult).
   Unlike PathBlock.draw, the cursor position is irrelevant by design —
   a projected path knows where it lives.
2. **drawTo contract documented + footgun closed:** rather than
   changing drawTo's anchor semantics (regression surface), make
   `drawTo` anchor the FIRST COMMAND for whole-piece values too, by
   fixing the one producer inconsistency: cut pieces' projected form
   gets `startPoint = commands[0].start` — i.e., fix the invariant at
   the source instead of special-casing consumers. NEEDS CARE: piece
   `project(x, y)` currently maps block startPoint (0,0) → (x,y);
   changing the projected startPoint for pieces changes what
   `placed.startPoint` returns (samples use it!) and where
   `drawTo(x, y)` anchors whole pieces (arguably the FIX, but it is a
   behavior change). Alternative: leave startPoint semantics alone and
   let `draw()` be the only in-place idiom, documenting drawTo's
   frame-anchor behavior. **Recommendation: add draw(); document
   drawTo; do NOT change startPoint semantics in this item** — the
   invariant fix can be its own follow-up if drawTo keeps biting.
3. **Series idiom collapses:**
   `seam.drawTo(seam.startPoint.x, seam.startPoint.y)` →
   **`seam.draw()`** across all 21 samples and both idiom fences; the
   whole-piece samples (43/03, 43/05 panels) can then also use
   `placed.draw()` instead of the `M px py; piece.draw()` pairing where
   the projected form is already at hand.

## Scope

- evaluator/index.ts: new 'draw' case in the ProjectedPath switch
  (mirroring PathBlock's, minus bridge complications).
- evaluator/annotated.ts: same (parity).
- pathogen-api.ts (+ generate:completions), docs/path-blocks.md
  ("Drawing a Path Block" section gains the projected form).
- Tests: draw-in-place for sub-runs AND whole cut pieces (the footgun
  case pinned green), annotated parity, inside-path-block rejection
  (same guard as drawTo).
- Series: idiom sweep (samples + fences + prose), closing-section
  entries in ALL FOUR posts (this is the series' core idiom), part 5
  cut post gets a pointer only if we touch its examples (it uses
  block draw — no change needed).

## Payoff

The core seam-decoration idiom becomes one self-evident line; the
startPoint footgun becomes unreachable in normal use; and the posts get
the cleanest possible before/after for their closing sections.

## Addendum 2 (2026-08-24, post-review correction)

The code-review round falsified part of this summary's design analysis:
"emitRing deliberately omits the leading m" held only for a piece's
FIRST ring (holes still get an m), and boolean ops use assembleResult,
which m-wraps every contour. Combined with walkRelative never seating
its cursor at the emitted anchor, draw()/drawTo() double-offset any
multi-contour projected value at non-zero placement — a pre-existing
drawTo bug that draw() would have inherited. Fixed at the root: the
serializer gained a `startCursor` option (path-data.ts) set by the four
world-space call sites; regression tests cover union/difference/holed
pieces at non-zero placement plus the pre-existing drawTo case, and
disabling the fix makes them fail. "Strictly additive" was true of the
method surface, not of the correctness work required underneath.
