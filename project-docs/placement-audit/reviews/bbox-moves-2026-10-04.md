# Reviews — `boundingBox()` / `centerPoint()` and moves that draw nothing (2026-10-04)

Docs-only change: `docs/path-blocks.md` → "What the box measures" (plus the `centerPoint()`,
`translate…PointTo` and `intersects()` sections) and the `Marker.fromPathBlock` **shape** bullet in
`docs/markers.md`. Behaviour unchanged. Numbers pinned by `tests/bounding-box-moves.test.ts`; the probes
they came from are in `../bbox-moves/`.

## content-reviewer (4 personas) — 2 must-fix, 2 should-fix, 5 held

Verdict: the rule is findable and honestly stated, the one-move-at-a-time table is the strongest part;
not ready to commit as first drafted.

| # | Finding | Disposition |
|---|---|---|
| 1 (must) | The older sentence "the bounding-box size … come through as they were" in the `translate…PointTo` section is false once the leading move is dropped | **Fixed** — reviewer's rewrite: the drawn shape keeps its size, the reported box shrinks |
| 2 (must) | The workaround read as a no-op ("drops the move … back exactly where it was"); "re-seat" untranslated | **Fixed** — "translate it to the place it already is"; says the result draws identically and `.d` reads the same (verified: `.d == hole.d` is true) |
| 3 (should) | Provenance table: lead-in promised travel-removed paths but the first rows were the opposite; "the travel" undefined; three-valued column | **Fixed** — lead-in and a yes/no "Does the box reach back to `(0, 0)`?" column |
| 4 (should) | `intersects()` trap stated too narrowly (one leading move is enough) and no way out | **Fixed, after first rejecting it wrongly.** My counter-probe used `@{ h 10 }`, whose zero-height box never overlaps anything. With squares, `@{ h 10 v 10 h -10 z }.intersects(@{ m 40 40 h 10 v 10 h -10 z })` is `true`. Wording now says one move is enough; the way out is tested |
| 5–9 (held) | "ink" / "drawn runs" unglossed; markers.md "Start the shape at its first drawn point" ambiguous; `x y width height` shorthand reads as two corners; centre/center split; put `(35, 35)` in the `centerPoint()` paragraph | **Fixed** — first self-applied from the item titles, then replaced with the reviewer's rewrites when part 2 arrived: the `centerPoint()` paragraph leads with its use and states `(35, 35)`, not `(50, 50)`; the markers bullet says a stdlib shape always opens with a move; boxes are labelled `x y width height` before the table; "center" throughout the new text (older "centred" lines in the `translate…PointTo` examples are out of scope) |

Cross-critique: a heading rename was proposed and withdrawn (four links target the anchor). The reviewer asked for
"its `.d` reads the same" to be verified rather than inferred — it is (`inked.d == hole.d`, in the test).
Re-check of the revised text: no must-fix; seven passages ok. One accuracy fix applied — the `intersects()` sentence said a block with a leading move "overlaps any other block", which a zero-height box disproves; it now says "can overlap another block". Its other two notes (the `centerPoint()` paragraph, "centre" spelling) were read from a version older than the part-2 edits and were already applied.

## Found while probing — not addressed here

The same `.d` reports a different box depending on how the path was made: a block you write, `.contours`,
the boolean ops, `scale` / `rotate` / `mirror` / `offset` count the origin; `cut` / `dash` / `outline`
pieces and query-match blocks do not. Documented as it is; whether to unify it is an open product decision.
