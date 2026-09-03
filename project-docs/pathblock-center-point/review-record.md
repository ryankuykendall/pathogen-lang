# Review record — `centerPoint()` on PathBlock and ProjectedPath

Date: 2026-09-02. Both reviews ran on the uncommitted working tree after implementation.

## Code review (code-reviewer agent)

Verdict: approve, nothing blocking.

Verified directly:
- One helper, `computeBoundingBoxCenter` in `src/evaluator/path-transforms.ts`, called from the PathBlock and ProjectedPath switches in `src/evaluator/index.ts` and from the shared `evaluateAnnotatedPathTransforms` helper in `src/evaluator/annotated.ts`. The reviewer traced the annotated dispatch chain to confirm no receiver was skipped, and confirmed the other `boundingBox` sites belong to text values.
- The returned `PointValue` matches what `get()` returns; a test exercises `.translate()` and `.distanceTo()` on the result.
- Regenerating `completion-data.generated.ts` in place reproduced the working-tree diff byte for byte.
- Docs examples hand-checked against the bounding-box math; the `cut()` example is the same program as the docs-parity test.

Non-blocking suggestions:
1. Add a hover test on the method name itself (declaration-site type was tested, member hover was not). Done: `tests/language-services/hover.test.ts` now hovers `centerPoint()` on both receivers.
2. TextBlock / ProjectedText have no `centerPoint()`. Pre-existing text-vs-path asymmetry, out of scope; ProjectedText already has `anchor(BBoxAnchor.Center)`.

Unrelated: the reviewer saw one flaky failure in `tests/auth/otp.test.ts` (statistical collision test). Two full-suite runs in this session passed 5563 and 5564 tests.

## Docs review (content-reviewer agent, four personas)

Scope: new text only in `docs/path-blocks.md`. No compiled samples, so no visual assessment. The first delivery was truncated after the Instructional Designer's opening; the full tail (cross-critique and thirteen-item synthesis) arrived later and was applied in a second pass.

Must fix — all applied:
1. The sentence "rotate or scale a shape about its visual center" was wrong: `scale(sx, sy?)` takes no origin on either type and the page says scaling happens from the start point. Replaced with the reviewer's paragraph, which also drops the undemonstrated "place a label" claim (it would need `text-anchor: middle` plus a vertical adjustment, and nothing in the section shows it).
2. Empty block: `centerPoint()` returns `Point(0, 0)`, indistinguishable from a shape genuinely centered on the origin; `fromGlyph` space glyphs and `subPath(t, t)` produce empty blocks, so centering each glyph of a phrase would silently stack the spaces at the origin. Reviewer's paragraph added after the first example.
3. The four-command rectangle is one command per line, matching the `cut()` example.
4. "It is the same box" antecedent fixed inside item 1.

Should improve — applied:
5. Both examples end in a visible result: the first draws the rotated plate from a pen position; the second logs `center.translate(0, -10)` with the reviewer's comment.
6. Contrast row: a two-line fence with the exact lines the `cut()` rewrite removed (`let pb = p.boundingBox(); let c = Point(calc(...), calc(...));`) under the reviewer's lead-in sentence.
7. `for (piece in pieces)`; the mirrored test in `tests/path-blocks.test.ts` was updated with it, so its "(docs example)" name stays true.
8. Angle units: instead of a "// 0.1 radians" comment, the examples use `15deg` and `5deg` Angle values (the reviewer's "consider" item 10). The mirrored test uses the same values and passes.
9. A test asserting the plate example's values (`Point(30, 20)`, and the drawn rotated plate keeping its center at (50, 40)) was added.

Consider — applied: the Transforms intro now mentions centers (11); "absolute, where" became "absolute, while" (12). Not applied: a bounding-box schematic (13) — the page is entirely static code fences, so that is a page-level decision.

Preserved as-is: the frame symmetry the engineer identified. PathBlock `centerPoint()` is relative and PathBlock `rotate()` takes a block-frame origin; the ProjectedPath pair are both absolute. `shape.rotate(angle, shape.centerPoint())` is correct on either type without conversion, which is what the ProjectedPath line teaches and why the `cut()` rewrite is a real improvement.

Also applied while there: the `rotate()` example's `arm.rotate(45deg, Point(25, 5)); // about the arm's center` now reads `arm.rotate(45deg, arm.centerPoint())`, since hand-building that point is exactly what the method removes.

Verification after the edits: the doc snippets compile and log the values their comments state; `npm run build:docs` passes; `npm run check-links` passed on the earlier revision (48 pages, 1352 links, 0 broken) and the final revision adds no links.
