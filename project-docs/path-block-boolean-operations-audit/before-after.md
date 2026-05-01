# Before / After — Failure-Matrix Diff Protocol

**Pre-fix BBWP:** `website/bbwp/2026-04-30-13:13:15--path-block-boolean-operations-audit--failure-matrix.bbwp.html`
**Post-fix BBWP:** `website/bbwp/2026-04-30-13:19:53--path-block-boolean-operations-audit--failure-matrix.bbwp.html`

Open both in adjacent browser tabs (or use `npm run serve:bbwp` and the index page to navigate) and scan row-by-row. The matrix is laid out so a single row holds **font × capitalization** fixed and varies **state × tracking** across columns — meaning failure modes that depend on tracking show up as a *streak* across one row, while font/cap-specific issues show up as a streak down one column.

## What was applied between the two BBWPs

| Phase | File | Change | Audit ref |
|---|---|---|---|
| 2 | `src/evaluator/boolean-ops.ts` | Replaced distance-only greedy pairing in `buildIntersectionLinks` with Hungarian on a tangent-aware cost matrix (`cost = dist − α · tangent_continuity`, `α = bboxDiag / 10`). Added `computeBBoxDiag` and `hungarianMinCost` helpers. Threaded `bboxDiag` through `assembleResult` from `booleanOp`. | §2.5 (P0) |
| 3 | `src/evaluator/boolean-ops.ts` | `simplifyContourSpurs` `SPUR_AREA_THRESHOLD` is now adaptive: `max(50, bboxArea × 0.0001)`. | §2.7 (P1) |
| 3 | `src/evaluator/boolean-ops.ts` | `classifyByRingWalk` seed search now escalates through `[0.5, 0.3, 0.7, 0.1, 0.9, 0.2, 0.8, 0.4, 0.6]` and accepts the first segment where any two distinct samples agree. | §2.3 (P1) |

## Where to look first

The audit predicts the largest improvement on these cells:

### 1. Adjacent-glyph diagonal-close notch (audit §2.5 — primary structural fix)

- **Strongest expected effect:** **state = `.union()`**, all three fonts, **tracking = 0.2..0.5**.
- **What to look for:** the "notch" or sharp detour where the contour zig-zags into the shape interior between two adjacent letters that share an edge. Most visible at letter pairs like `T-T` (Bebas), `i-i` / `l-l` (Raleway, Libre Bask), and any axis-aligned-stem glyph pair (`H-H`, `n-n`, `r-r`).
- **Pre-fix symptom:** small triangular bite into the cap or a diagonal across the cap.
- **Post-fix expectation:** outer boundary continuous, no diagonal bite.

Check ENCYCLOPEDIA all-caps Bebas Neue tracking 0.3 first — the back-to-back `Y-C` pair is a textbook case. Then ENCYCLOPEDIA all-lower Libre Bask tracking 0.3 — the `c-l-o-p` chain has multiple shared-edge contact points.

### 2. Adaptive spur threshold (audit §2.7)

- **Strongest expected effect:** **state = `.difference()`**, **font = Libre Baskerville 700**, **tracking = 0.5..1.2**.
- **What to look for:** at the loose tracking end (1.0..1.2), the serif terminals on Libre Baskerville should remain crisp. Pre-fix, anything with enclosed area < 50 sq path units was at risk of being "cleaned up" as a spur; the new threshold scales with the contour's bbox so serifs are preserved at the matrix's font-size 18 (~bbox area ~3,000 sq units, threshold becomes ≥ 50, still gates but doesn't drop serif features).
- **Pre-fix symptom:** missing serif terminals, slightly rounded letter edges where serifs should be sharp.
- **Post-fix expectation:** serifs intact.

### 3. Escalating seed-finder (audit §2.3)

- **Strongest expected effect:** **state = `.union()`**, **all fonts**, **tracking = 1.0..1.2** (no overlap, but axis-aligned cap edges meet flush).
- **What to look for:** missing ring(s) entirely — a cell with empty space where a contour should be — or a cell where the union has fewer subpaths than expected.
- **Pre-fix symptom:** missing letter, or letter outline shows clipped/gapped edges, when both sample points landed on a shared boundary.
- **Post-fix expectation:** all letters present and closed.

## Cells expected to remain problematic (deferred fixes)

The following audit-named failure modes were NOT addressed in this round and should remain visible in the post-fix matrix. If we want to clear them, follow up with P2 work:

- **§2.2 — `MIN_SEG_LEN = 0.5` t-merge.** Cells with ENCYCLOPEDIA all-caps Bebas Neue tracking 0.2..0.4 (extreme overlap) may still show small artifacts where two real intersections within 0.5 path units got merged. Fix: scale `MIN_SEG_LEN` by local segment length.
- **§2.4 — `isCrossingAtBoundary` 0.05 threshold.** Cells with Raleway 200 (extra-thin strokes) at near-tangent overlaps may still misclassify segment crossings. Fix: make threshold curvature-relative.
- **§2.10 — `handleNoIntersections` single-sample winding.** Specific multi-subpath glyphs (letters with counters: `o`, `e`, `a`, `p`, `d`) at tracking 1.2 (no overlap) may misclassify. Real-world impact remains low.

## Cells expected to look identical

Multi-color outline cells (state = `multi-color`, columns 1–11) should be **identical** between pre-fix and post-fix — the multi-color state does not invoke any boolean op. Any visual change in those columns indicates a regression in glyph layout or rendering and would be cause for investigation.

## Diff procedure

1. Open both BBWP files in adjacent tabs. Use Cmd-Tab between them or split-screen.
2. Pick a row of interest from the lists above.
3. For each cell in that row (column-by-column), compare pre vs post:
   - **Identical** → confirm matches the "expected to look identical" set; otherwise investigate.
   - **Improved** → log it as a confirmed fix (cell coords + nature of improvement).
   - **Regressed** → **stop and investigate before merge.** A regression means one of the fixes broke a working case.
   - **Still problematic** → confirm matches the "expected to remain" deferred-fix list. If not, escalate to a new follow-up.
4. After a full pass, summarize counts: confirmed fixes / regressions / deferred-still-broken.

## Iteration log

When regenerating the matrix during follow-up work:

```bash
npx vitest run tests/boolean-ops.test.ts                          # all 45 tests must pass first
npm run compile:bbwp -- project-docs/path-block-boolean-operations-audit/failure-matrix.pathogen
```

Each compile produces a new timestamped BBWP — never overwrite the prior one. The BBWP index in `website/bbwp/index.html` is updated automatically.

## Test backstop

The five regression tests in `tests/boolean-ops.test.ts` `describe('audit regressions')` are keyed to specific failure modes:

| Test | Audit ref |
|---|---|
| `union of adjacent squares sharing an edge has no diagonal-close notch` | §2.5 |
| `union of two heavily-overlapping rounded shapes preserves boundary direction` | §2.7 |
| `chained union of 5 overlapping shapes does not accumulate residue` | §2.7 + §2.8 |
| `difference at coincident-vertex tracking still produces a hole` | §2.10 |
| `union of thin near-tangent shapes classifies and assembles correctly` | §2.4 + §2.5 |

If a future regression makes one of these tests fail, the test name points directly to the audit section that documents the mechanism.
