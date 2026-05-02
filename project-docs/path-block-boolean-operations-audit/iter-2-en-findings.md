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

## B. Half-width / asymmetric strokes (Raleway, Playfair)

A subset of cells show sections of the union stroke at roughly
half the expected width — the cyan boundary is rendered on only one
side of an edge.

| Cell | Notes |
|---|---|
| `RW-l-50` | "en" — half-width stroke through the e/n junction. |
| `RW-A-50` | "eN" — half-width stroke. |
| `RW-A-60` | "eN" — half-width stroke. |
| `PF-F-50` | "En" — also has half-width strokes alongside the phantom-line issue. |

**Hypothesis**: §2.13's "drop both copies of shared edges" is
firing on edges that are *not* truly shared. If detection
classifies an edge as shared but only ONE side actually overlaps,
the algorithm drops the kept-side and the rendered output traces
the un-dropped side once → visible as half-width. This is the
inverse of the iter-1 wedge problem: there we kept a shared edge
twice, here we may be dropping a non-shared edge once too often.

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

### O2. Phantom vertical stroke on right side of E (PF-F-80)
A thin extra cyan vertical stroke appears on the right side of
the capital E in PF-F-80, where the merged outer should not have
any vertical edge. Likely the same class C residual 2-cycle
mechanism — a spurious extra contour at the E/N junction now that
the inputs are normalized. Boolean-op-level bug.

### O3. Red spur on lowercase c (LB-F-80, LB-A-80)
A small red triangular feature appears on the right side of the
lowercase c in Libre Baskerville cells. Hypothesis: font-intrinsic
additive subpath in c's glyph (similar to Playfair's E having an
internal "T" decoration). To confirm: probe LB lowercase c for
subpath count.

### O4. Missing fill / yellow showing through interior
(RW-U-70, RW-A-70)
For Raleway 200 ExtraLight at tracking 0.7, both upper-case ENC
and AlT eNc cells show:
- Capital E rendered with a CLOSING vertical stroke on the right
  (Raleway sans-serif E is normally open right-side)
- Yellow background showing through where union fill should cover
- C with crossing strokes inside its bowl
This looks like the union output is keeping interior boundaries
that shouldn't survive (extra contours splitting filled regions).

### O5. Peninsula-like blue stroke (LB-l-70)
Lowercase Libre Baskerville e shows a peninsula-like blue stroke
extending from middle to bottom at the e/n intersection.
Different font than PF (LB lowercase e has 0 detectable
self-intersections per the Phase 2 probe), so the Phase 2 split
doesn't fire. The artifact is geometrically similar to the PF
peninsula but stems from a different topology — possibly a
near-tangent crossing of e's bowl with n's left vertical.

### O6. Missing intersection — N's bottom-left serif vs e
(LB-A-70)
At tracking 0.7 in Libre Bask AlT, the e and N appear visually
to overlap at N's bottom-left serif but the boolean op doesn't
register the intersection — the two glyphs render as separate
shapes where they should merge. Likely a numerical precision
case: the serif's edge passes near (but doesn't quite touch) e's
boundary, falling inside the intersection-finder's tolerance.

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
