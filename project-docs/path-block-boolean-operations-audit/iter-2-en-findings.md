# Iter-2-en findings (2026-05-01)

After §2.13 cleared the iter-1 wedge cases, the wider iter-2 matrix
(`failure-matrix-iter-2-en.pathogen`, tracking 0.5..0.8, fonts BB / RW
/ LB / PF) surfaced a *different* class of artifacts. None of these
match the original wedge symptom; together they suggest at least two
new failure modes in the post-§2.13 union pipeline.

ID format from the matrix: `<font>-<caps>-<tracking×100>`.

## A. Phantom horizontal line through the middle of `E` (Playfair) — RESOLVED: not a bug

**Diagnosis (2026-05-01)**: Not a boolean-op bug. The Playfair Display
Bold `E` glyph contains **3 additive CW subpaths** in its raw outline
extracted by `PathBlock.fromGlyph`:

| Subpath | cmds | bbox | role |
|---|---|---|---|
| 0 | 61 | 12.21 × 15.58 | outer outline of the E shape |
| 1 | 10 | 3.85 × 0.44 | thin horizontal sliver at the middle bar |
| 2 | 20 | 3.19 × 6.25 | medium decorative subpath above middle bar |

All 3 are CW (positive shoelace in SVG coords), so they stack with
nonzero fill rule — when **filled**, they all add to the winding and
produce the standard E shape. When **stroked**, every subpath gets
its outline drawn, exposing the small + medium subpaths as visible
horizontal sliver + small T/diamond decoration.

The boolean op preserves them faithfully (no intersection with `N`,
classified as STANDALONE complete rings). Both the underlay-stroke
AND the union-stroke show them at the same position; the cyan union
stroke just has higher contrast against the bg, making the user
perceive it as "out of place." Side-by-side comparison confirms:
`E.union(N)` shows the same 3 subpaths in the E region as `E` alone.

**Implication**: this artifact class is not actionable inside
`booleanOp`. Possible workarounds, if visual cleanup is desired:

1. Suppress display of intrinsic decorative subpaths at render time
   (a pre-filter on `PathBlock` outputs that drops sub-subpaths with
   bbox area below some threshold relative to the parent).
2. Render the union with **fill only**, no stroke — sliver subpaths
   contribute to winding count but produce no visible fill change
   under nonzero rule.
3. Use even-odd fill rule on the underlay so the small subpaths
   become holes — but this changes the shape of the visible E and
   isn't a faithful rendering.

For the audit's purposes, class A cells should be **removed** from
the failure inventory. The phantom horizontal is a faithful rendering
of the font's intrinsic geometry; it's the same in any other
SVG renderer that draws path outlines.

### Below: original observations (kept for paper trail)


A faint cyan stroke runs horizontally through the middle of the `E`
glyph in several Playfair Display cells, *interior* to the merged
silhouette where no boundary should appear.

| Cell | Notes |
|---|---|
| `PF-F-50` | "En" — phantom line at E's middle bar. Half-width strokes also visible. |
| `PF-U-50` | "EN" — center horizontal of E protrudes as an interior stroke. |
| `PF-F-60` | "En" — phantom line in middle of E. |
| `PF-U-60` | "EN" — phantom line in middle of E + N's left top/bottom appear to protrude *above* E at the intersection. |
| `PF-U-70` | "EN" — phantom line through middle of E **even though E is mostly unaffected by N's overlap** (the only union work is at the E/N edge). |

The PF-U-70 case is particularly diagnostic: N's overlap with E is
minimal there, so the union should leave E's interior alone. The
fact that a horizontal contour still appears across E's middle bar
suggests the artifact is *not* driven by the union of the cap-bar's
two boundaries with N. It looks more like a kept interior subpath —
either a misclassified `'inside'` ring being included in the output,
or a contour-trace step that closes through E's interior horizontal
stroke.

**Hypothesis**: the E glyph itself has multiple subpaths (outer +
counters); after split + classify, one of the *inner* horizontal
edges of the E cap-bar is being classified as kept when it shouldn't
be, OR `traceContours` is closing a chain through that edge. Likely
related to the §2.11 / §2.13 boundary handling regressions when
multiple subpaths interact.

## Root cause for classes B/C/D — self-touching glyph topology (2026-05-01)

After deep investigation of PF-A-60 (class D, the e-spur), the
underlying cause for classes B/C/D appears to be **self-touching
contour handling** in the boolean op pipeline. Verified findings:

- The Playfair Display Bold lowercase `e` glyph is a **single 40-cmd
  self-touching contour** — there is no separate "bowl counter"
  subpath in the raw glyph. The e's filled shape (with its enclosed
  bowl counter) emerges topologically from the self-touching outline
  under nonzero fill rule.

- For PF-A-60, the boolean op produces **two contours**: subpath 1
  (the merged eN outer perimeter, 53 cmds) and subpath 2 (a CCW
  20-cmd contour at bbox (13.9, -51) to (41.2, -6.8) inside the
  merged outer). Subpath 2 is NOT outside-both pocket — it traces
  the e's bowl counter as a hole.

- **The bug**: subpath 2's right edge extends out to **x=41** (where
  N's left vertical intersects e's outer outline), instead of
  closing at the cap-bar's natural right edge (x=34). The bowl
  counter is "stretched" through the e/N intersection cluster
  rather than closing along the e's internal cap-bar geometry.

- **Why**: A1 (a 17-cmd run on path A) spans from one e/N
  intersection (P1=(41.24,-30.90)) around most of e and back to
  another e/N intersection (P2=(41.04,-10.11)). B6 (2 cmds on path
  B) closes the loop at x=41. But A1's path traverses BOTH e's
  outer AND the bowl counter's boundary as if they were one ring,
  because in the input they ARE one self-touching contour.

- The fix path is **structural**, not a tweak:
  - **Option 1 (preferred)**: pre-split self-touching contours into
    separate non-self-touching subpaths (outer + counters) before
    classification. Most robust boolean libraries (Skia, paper.js)
    do this. Detection: walk the input contour, find points where
    the contour intersects itself, split there.
  - **Option 2**: topology-aware run extraction that recognizes
    runs corresponding to "interior" features of a self-touching
    contour and routes their closure through internal points
    rather than foreign-path intersections.

- Class C (PF-U-60 capital E) has 3 additive subpaths — different
  topology but same class of bug: the additive subpaths' winding
  interacts with N's intersections, producing extra contours.

- Class B (RW-l-50 half-width strokes / detour spike) is a
  **single-chain detour bug**, structurally different. Its root is
  likely Hungarian routing through a wrong intersection in a dense
  cluster, not self-touching-contour decomposition. May need its
  own separate fix.

**Implication for the iter-2/iter-3 matrices**: the matrix has done
its job — surfaced two distinct structural limitations of the
current boolean op pipeline. Neither fix is small. Both should be
costed and prioritized separately from this audit's existing P0/P1
fix list.

## B. Half-width / asymmetric strokes (Raleway, Playfair) — REVISED 2026-05-02: more severe than half-width

A subset of cells show sections of the union stroke at roughly
half the expected width — the cyan boundary is rendered on only one
side of an edge.

| Cell | Notes |
|---|---|
| `RW-l-50` | "en" — bowl of e is COMPLETELY FILLED in union output (not half-width — total topology break). |
| `RW-A-50` | "eN" — half-width stroke. |
| `RW-A-60` | "eN" — half-width stroke. |
| `PF-F-50` | "En" — also has half-width strokes alongside the phantom-line issue. |

**Diagnosis (2026-05-02)**: Investigated RW-l-50 in detail. The
artifact is more severe than "half-width strokes" — the e's bowl
counter is ENTIRELY FILLED in the union output (visible as a solid
disk). The original "half-width" framing was based on small-render
visual perception; at higher zoom, the bowl is solid.

`DEBUG_BOOLEAN_OPS` trace shows:
- Raleway lowercase e has **0 detectable self-intersections**, so
  Phase 2 doesn't process it. The e is a single 38-segment concave
  contour with the bowl traced as a bay.
- Boolean op produces **14 runs** at the e/n intersection cluster
  (16 intersections found, 3 dropped as vertex-vertex).
- Hungarian linker chains all 14 runs into ONE big trace of 67
  commands. The chain order is not e's natural walk order — runs
  are reordered by minimum cost. Some links span distance 5.368
  (substantial in this glyph's local scale).
- Result: the chain outlines an outer boundary that bypasses the
  bowl interior topologically. With only 1 output subpath (no
  inner CCW counter), nonzero fill paints the bowl as solid.

Mechanism similarities with O4 (RW-U-70):
- Both involve dense intersection clusters at the glyph junction
- Both involve the Hungarian linker selecting links that produce
  topologically wrong output
- Both indicate the run-extraction + linking stages can't handle
  certain configurations of concave inputs

Difference from O4: O4 produces 2 disjoint cycles (correct outer +
spurious inner CCW). RW-l-50 produces 1 cycle that's globally
mis-routed (no separate inner CCW for the bowl).

**Same conclusion as O4**: structural fix required in run
extraction or linking. Cannot be patched by post-assembly cleanup.

Decision recorded 2026-05-02: pause Class B with this analysis.

## C. N protrusion through E intersection (Playfair UPPER)

| Cell | Notes |
|---|---|
| `PF-U-60` | "EN" — N's left vertical stroke top/bottom appear to extend slightly past the E glyph at their meeting. |

This may simply be the underlay (orange) showing through where the
union (cyan) should cover, OR it may be a kept run that bridges
through the wrong endpoint. Without close-up zoom, ambiguous.

## D. Spur on Playfair `e` (AlT) — RESOLVED

| Cell | Notes |
|---|---|
| `PF-A-60` | "eN" — small triangular spur protrudes from the right side of the `e` glyph in the middle region. |

**Resolution (2026-05-01 verification)**: The "spurious 2-cycle"
diagnosis was a misread of path data. The PF-A-60 union output
contains **3 subpaths**: outer eN perimeter + upper e counter +
lower e counter, which is the **correct** topology for a Playfair
'e' glyph (whose crossbar legitimately divides the bowl into two
counters). Verification: with Phase 2 disabled, output collapses to
2 subpaths and the e crossbar shows as an unsplit self-intersection
sliver — the wrong topology. With Phase 2 enabled (current state),
the e renders cleanly with two separate counter regions.

In context, PF-A-60 in `failure-matrix-iter-2-en.pathogen` renders
clean. The visible "spur" the original observation described was a
reading of pre-§2.13 output; the §2.13 boundary-promotion + chain
ordering fixes already eliminated it. Class D is closed.

## Plan for next round

1. **Bump font-size by 50%** (font_size: 22 → 33) in both iter-2-en
   and iter-3-enc matrix files. Cell dimensions stay 240×60 — there
   is ample headroom. The bigger glyphs should make the half-width
   strokes and phantom horizontal lines easier to read at screenshot
   resolution.
2. **Don't attempt fixes yet.** First re-render with the larger font
   size and look for additional artifacts that the smaller size was
   masking. The artifact taxonomy may grow before it shrinks.
3. **After re-render**, pick the highest-confidence single cell from
   each class (A/B/C/D) and add diagnostic logging to capture
   classifier output, ring structure, and link assignments. Use the
   per-cell IDs to drive `compileWithContext`-style isolation tests.

## Status

- iter-1 (en, narrow tracking, no PF): clean per §2.13.
- iter-2 (en, wide tracking, with PF): **not** clean. Four
  artifact classes surfaced; documented above.
- iter-3 (enc, chained union): not yet reviewed at this depth —
  expected to inherit iter-2's classes plus chained-error
  compounding (§2.9).

## Post-Phase-1+2 audit observations (2026-05-02)

After committing the §2.14 normalization (Phase 1: union
intersecting same-winding subpaths, Phase 2: split self-touching
contours), the user did a sweep of the iter-2-en + iter-3-enc
matrices at font-size 48 and called out the following remaining
issues. Recorded here for tracking; not all are necessarily
boolean-op bugs (some may be font-intrinsic or browser-chrome
effects).

### O1. Browser favicon thumbnail (likely not a code bug)
The matrix BBWP page shows a small "eN" thumbnail at the top-left
(image 19). This is the browser auto-generating a favicon from
page content when the BBWP wrapper doesn't supply
`<link rel="icon">`. Fix: add a blank favicon link to the BBWP
template if visually distracting.

### O2. Phantom vertical stroke on right side of E (PF-F-80) — STROKE-ONLY ARTIFACT

**Diagnosis (2026-05-02 fill-vs-stroke check)**: The output is
**topologically correct under nonzero fill rule** — fill rendering
of the union path produces a perfect "En" silhouette with both E
counters and the n bowl correctly unfilled. The "phantom vertical"
visible in the audit's stroked rendering is a self-touching
figure-8 CCW contour: a single closed loop that traces both E
counters connected via a narrow-neck wrap-around the middle arm.
Two parallel vertical edges at x=spine (separated by the
middle-arm thickness, ~2 units) form the figure-8 neck, which
strokes as the visible "phantom vertical" but is interior under
fill.

**Class**: not a fill-correctness bug. Decision recorded
2026-05-02: skip a deep fix (would require a narrow-neck splitter
in boolean op output, ~half day, only justified if a downstream
consumer strokes glyph union output — current consumers all fill).
If audit visualization parity is desired, switch the matrix
visualization layers to fill rendering; the artifact disappears.

### O3. Red spur on lowercase c (LB-F-80, LB-A-80) — NOT A BUG (confirmed font-intrinsic)

**Diagnosis (2026-05-02)**: LB Bold lowercase c is a single-subpath
glyph (1 outer outline, no additive subpaths). The "small red
triangular feature" is the natural top-right terminal serif of LB
Bold c, visible in the raw glyph render as part of the natural
glyph design. Not a boolean-op artifact.

### O4. Missing fill / yellow showing through interior
(RW-U-70, RW-A-70) — REVISED 2026-05-02: also a misperception, output is correct
For Raleway 200 ExtraLight at tracking 0.7, both upper-case ENC
and AlT eNc cells show:
- Capital E rendered with a CLOSING vertical stroke on the right
  (Raleway sans-serif E is normally open right-side)
- Yellow background showing through where union fill should cover
- C with crossing strokes inside its bowl

**Diagnosis (2026-05-02 deeper investigation)**: confirmed real
fill bug, not a stroke artifact. Root cause is **structural in
run extraction + Hungarian linking**, not a post-assembly
cleanup that's missing.

`DEBUG_BOOLEAN_OPS` trace on `iter-2-isolation-rw-u-70.pathogen`
shows the boolean op produces 4 runs that the Hungarian solver
correctly pairs into **2 separate cycles**:
- Cycle 1 (CW outer): run[0] (E outer, C2→C1) + run[3] (N outer
  right, C1→C2). This is the correct merged outer perimeter.
- Cycle 2 (CCW inner): run[1] (E interior segments around spine
  + arms, C4→C3) + run[2] (N's outer-left vertical at x=152.65,
  C3→C4). Under nonzero fill, this CCW carves a 0-winding region
  inside the outer, producing the visible "yellow through" + the
  closed-right look on E.

The two cycles don't share intersection points (C1, C2 vs C3,
C4), so the Hungarian linker has only one local-cost-minimum
pairing per cluster. Each pair has cost 0 (perfect endpoint
matches), so no global rerouting is possible from cost adjustment
alone.

**Attempted fix (reverted)**: a `dropUnionSpuriousHoles`
post-assembly pass that would drop nested CCW subpaths whose
interior lies inside one of the inputs. Reverted because the
predicate doesn't fire for this case — the CCW cycle traces
around E's entire body shape (including the upper/lower
counters), so a sampled interior point lands in E's *counter*
(unfilled by E), not E's filled spine. The cycle isn't simply
"spurious in E's body"; it's tracing E's complete body
silhouette via N's outer-left, and the boundary between
"inside E" and "outside E" runs through the cycle's interior.

**What a real fix needs**: either (a) restructure run
extraction to produce a single chain through all 4 cluster
points, (b) add cluster-aware run merging that joins sub-cycles
sharing a common cluster, or (c) topology-aware classification
that recognizes interior-only kept runs and either bridges them
with virtual links or drops them. None of these is a small
change — each touches the core walking/linking logic that the
existing 52 tests cover.

Decision recorded 2026-05-02: pause O4, leave the bug filed
with this analysis. Approach won't be fixed in this audit
session.

**REVISED 2026-05-02 (later)**: Deep winding analysis showed
the inner CCW cycle's interior is the e/E body's BAY regions
(concave portions of E's outline outside E's filled area).
Sampled grid points: 0% inside either input. The CCW correctly
represents real holes (regions outside both E and N).

Side-by-side high-zoom comparison of the underlay (raw E + N)
vs the union output at the right side of E shows them
**essentially identical**. The "closing vertical" the
observation described is N's filled left vertical body sitting
adjacent to E's right edge — present in both underlay and
union. At small render scale (matrix view), N's left vertical
visually merges with E's right edge, creating the perceived
"closed E," but this is correct boolean op output, not a bug.

**Status**: O4 closed as a perceptual artifact at matrix scale.
The boolean op produces topologically correct output for
RW-U-70 / RW-A-70.

### O5. Peninsula-like blue stroke (LB-l-70) — REAL FILL BUG
Lowercase Libre Baskerville e shows a peninsula-like blue stroke
extending from middle to bottom at the e/n intersection.
Different font than PF (LB lowercase e has 0 detectable
self-intersections per the Phase 2 probe), so the Phase 2 split
doesn't fire. The artifact is geometrically similar to the PF
peninsula but stems from a different topology — possibly a
near-tangent crossing of e's bowl with n's left vertical.

**Diagnosis (2026-05-02 fill-vs-stroke check)**: confirmed real
fill bug — fill rendering still shows a small spike/peninsula
extending below the baseline at the e/n junction.

### O6. Missing intersection — N's bottom-left serif vs e
(LB-A-70) — LIKELY NOT A BUG (confirmed by underlay-vs-union comparison)

**Diagnosis (2026-05-02)**: Built isolation. Boolean op finds 3
intersections and produces a 1-chain 54-cmd output. At zoom into
the e/N junction, the underlay (raw eN) and union (boolean output)
render as **essentially identical** — both show the same small
notch where e's tail meets N's bottom-left serif. That notch is
the natural shape where e and N don't fully overlap at tracking
0.7. The boolean op is doing the right thing.

The original "missing intersection" perception was a misread — at
small render size the glyphs visually appear to merge, but the
actual geometry has them just touching with limited overlap. The
union output matches the underlay's filled silhouette.

### O7. Messy cluster of lines at E/N junction (PF-U-70)
Capital ENC at tracking 0.7 in Playfair shows a "messy cluster"
of cyan strokes at the E/N junction. Combination of class C
residual (multiple spurious contours) + possibly compounding
from the chained union (.union(B).union(C) means N's right edge
also intersects C, with each step adding noise).

### Common root candidates
Most of O2, O4, O5, O7 trace to the boolean op producing extra
contours that survive classification when they shouldn't —
either via the §2.5 Hungarian routing creating unwanted 2-cycles,
or via per-segment classification giving inconsistent results in
dense intersection clusters. Class C "residual 2-cycle" remains
the highest-leverage single fix candidate.
