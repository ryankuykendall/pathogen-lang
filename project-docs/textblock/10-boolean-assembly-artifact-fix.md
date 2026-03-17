# Fix: Boolean Assembly Artifacts on Overlapping Curved Paths

**Filed**: 2026-03-17
**Severity**: High — triangular artifacts visible in text-cutout blog demo
**Component**: `src/evaluator/boolean-ops.ts`
**Predecessor**: `09-boolean-multi-subpath-bug.md` (Issue 1 & Issue 2 fixes already landed)

## Background

After landing the multi-subpath fix (Issue 2) and the Dan Sunday `lineCrossing` winding number fix (Issue 1), boolean operations on overlapping curved glyph paths still produced triangular artifacts. The demo file `website/blog/samples/post12/text-cutout.pathogen` renders "CUT" at tracking=0.8 using `.union()` to merge overlapping glyphs, then `.difference()` to punch the text from a plate. The artifacts were visible at the U–T junction where the glyphs overlap.

## Problem Statement

The `assembleResult` function used **greedy closest-endpoint matching** (`chainSegments`, lines 1540–1668) to reconnect kept segments into closed paths. At complex intersection points where multiple segments converge, this greedy algorithm connected segments from the wrong contour — jumping from an outer boundary to an inner edge — creating self-intersecting paths with triangular hole artifacts.

The classification stage was correct: segments were properly marked as "inside" (gap) or "outside" (keep). The intersection finder correctly located the split points. Only the final assembly — reconnecting the kept segments into closed contours — was broken.

## Diagnosis: Command-Line Debugging

### Isolating the problem to U+T union

The first diagnostic step was isolating which glyph pair produced the artifact. By compiling just the U+T union at the command line, we could inspect the raw path data:

```bash
npm run cli -- -e '@font "./fonts/Bebas_Neue/BebasNeue-Regular.ttf"
let glyphs = PathBlock.fromGlyph("UT", ${ font-family: BebasNeue-Regular; font-size: 60; });
let tracking = 0.8;
let x1 = calc(glyphs[0].advanceWidth * tracking);
let u_proj = glyphs[0].project(0, 0);
let t_proj = glyphs[1].project(x1, 0);
log("U bbox:", u_proj.boundingBox());
log("T bbox:", t_proj.boundingBox());
let combined = u_proj.union(t_proj);
combined.drawTo(0, 0)' --print-logs
```

This revealed the union produced **2 subpaths** (2 `z` commands) instead of 1. The U and T contours were not being linked at their shared intersection points — each was emitted as a separate closed subpath.

### Dumping raw glyph geometry

To understand the intersection topology, we dumped the raw T glyph path:

```bash
npm run cli -- -e '@font "./fonts/Bebas_Neue/BebasNeue-Regular.ttf"
let glyphs = PathBlock.fromGlyph("UT", ${ font-family: BebasNeue-Regular; font-size: 60; });
let tracking = 0.8;
let x1 = calc(glyphs[0].advanceWidth * tracking);
glyphs[1].drawTo(x1, 0)' --print-logs
```

This showed the T's actual vertices: top-left at (20.016, -42), not (19.296, -42) as the bounding box suggested (the bbox included the moveTo origin point, which is not part of the drawn shape). This was critical — it meant the shared boundary at y=-42 ran from x=20.016 to x=21.9, not the wider range we initially assumed.

### Adding temporary debug logging

To see why links failed, we added temporary `console.error` calls to `assembleResult` that printed each run's entry/exit points and the links formed between them:

```
A run: entry=(21.9000,-36.0000) exit=(20.0160,-42.0000) cmds=14
B run: entry=(21.9000,-42.0000) exit=(21.9000,-36.0000) cmds=7
Link: B exit=(21.9000,-36.0000) → A entry=(21.9000,-36.0000)
```

This immediately revealed the root cause: the A run exits at (20.016, -42) but the B run enters at (21.9, -42) — a gap of 1.884 units. The B→A link succeeds (exact match at (21.9, -36)), but the A→B link fails because the exit and entry points are at different ends of a collinear shared boundary.

## Root Cause: Collinear Shared Boundary Edges

The U glyph has a horizontal segment at y=-42 from (15.54, -42) to (21.9, -42). The T glyph has a horizontal segment at y=-42 from (20.016, -42) to (40.416, -42). These segments overlap in x=[20.016, 21.9] — a collinear shared edge.

Three intersection points exist in this region:

1. **(20.016, -42)** — U is split here (t≈0.70 on U's horizontal), but T is not split (t=1.0 on T's left edge, filtered out by the endpoint exclusion `t < 1 - ε`).
2. **(21.9, -42)** — T is split here (t≈0.09 on T's top bar), but U is not split (t=0.0 on U's right stem, filtered out).
3. **(21.9, -36)** — Both paths are split here (valid interior t values on both sides).

Because splits at t=0 and t=1 are filtered out (to avoid degenerate zero-length segments), the shared boundary from (20.016, -42) to (21.9, -42) ends up classified as "gap" by **both** paths:
- U classifies it as "inside T" (midpoint (20.958, -42) is inside T's boundary)
- T classifies it as "inside U" (same midpoint is inside U's boundary)

Neither path keeps the shared edge. The U run exits at one end (20.016, -42) and the T run enters at the other end (21.9, -42), with no connecting link between them.

## What Didn't Work: Earlier Approaches in `chainSegments`

The original `chainSegments` (removed in this fix) tried several heuristics to handle intersection-point ambiguity:

1. **Source-path alternation** — The code cast segments to `TaggedCmd` to read a `_source` field, preferring candidates from the opposite source path. But `_source` was never actually set — the `TaggedCmd` interface didn't exist and no code populated the field. This was dead code that always fell through to the next heuristic.

2. **Rightmost-turn rule** — Among multiple candidates at an intersection, pick the one with the most negative cross product (most clockwise turn). This traces outer boundaries correctly for simple convex shapes but fails when curves have shallow angles or when the "right" choice requires jumping to a different path entirely.

3. **Distance-based fallback** — Pick the closest unused segment by endpoint distance. This is the core greedy behavior that caused the artifacts — at intersection points with 3+ converging segments, proximity doesn't predict correct contour membership.

All three heuristics operated on a flat, unordered array of segments with no knowledge of which path they came from or their original ordering. No local heuristic can reliably solve this problem because the correct routing decision depends on global path structure.

## What Worked: Ring-Based Traversal with Intersection Links

### The insight

`splitPathAtIntersections` produces split segments **in original path order**. Each path's segments form a circular ring. Classification marks segments as kept or gap. At each gap boundary sits an intersection point that also exists on the other path's ring. Instead of proximity matching, we build **explicit links** between rings at intersection points and traverse by following kept runs → jumping at links → following the other ring's kept runs → jumping back.

### Implementation (5 new functions)

**`buildRings`** — Groups split segments into ordered subpath rings, classifying each entry as keep/gap/degenerate. For difference-B, reverses ring order and each segment's direction.

**`extractKeptRuns`** — Extracts maximal contiguous runs of kept (non-degenerate) entries from each ring. Handles wraparound by starting iteration at the first gap so a run spanning the ring boundary is captured as one run. Entire-ring-kept subpaths (no intersections) become standalone "complete" runs.

**`buildIntersectionLinks`** — Maps each run's exit point to the matching run's entry point on the other path, using tangent dot product to disambiguate when multiple candidates converge. Includes a **fallback** for the collinear shared-boundary case: when no entry matches within tight tolerance, finds the nearest available entry across all unlinked runs on the other path.

**`traceContours`** — Follows the link chain (A-run → B-run → A-run → ...) to build closed contours. When linked runs don't share an exact endpoint (the collinear gap case), inserts an explicit connecting line segment to bridge the gap. Complete rings are emitted directly without link traversal.

**`assembleResult`** — Orchestrates: buildRings → extractKeptRuns → buildIntersectionLinks → traceContours → emit output with m/z wrapping.

### The collinear fallback

The key addition beyond the basic Weiler-Atherton algorithm is the fallback linking. When U's run exits at (20.016, -42) and no T entry matches within ε, the fallback finds T's entry at (21.9, -42) as the nearest available. The `traceContours` function then inserts `l -1.884 0` to bridge the 1.884-unit gap — which is exactly the shared boundary edge that both paths had dropped. This connecting segment is geometrically correct: it traces along y=-42 from one end of the shared edge to the other.

## Testing and Verification

### Test results

- 34 boolean-ops tests pass (28 existing + 6 new)
- 1809 total tests pass across all test files
- No regressions

### New tests added

| Test | Operation | What it covers |
|------|-----------|---------------|
| Union of overlapping circles | union | Curved paths, single subpath output, arc preservation |
| Union of overlapping ellipses | union | Non-circular curves |
| Difference of circle from rectangle | difference | Curved hole cutout (2 subpaths) |
| Intersection of overlapping circles | intersection | Lens shape from curves (1 subpath) |
| XOR of overlapping circles | xor | Two crescent shapes (2 subpaths) |
| Union of collinear-edge rectangles | union | Shared boundary edge (2 subpaths, visually correct) |

### Visual verification via CLI

The primary verification was always visual — compiling the blog demo and inspecting the rendered SVG:

```bash
npm run build && npm run cli -- -e '@font "./fonts/Bebas_Neue/BebasNeue-Regular.ttf"
let glyphs = PathBlock.fromGlyph("CUT", ${ font-family: BebasNeue-Regular; font-size: 60; });
let tracking = 0.8;
...
cutout.drawTo(0, 0)' --output-svg-file=/tmp/cutout.svg \
--viewBox="-20 -75 110 90" --width=400 --height=330 --fill='#22c55e' --stroke=none
```

Before the fix: 4 subpaths (plate + C + U + T as separate contours), triangular artifact at U–T junction. After: 3 subpaths (plate + C counter + merged U/T contour), clean rendering with no artifacts.

BBWP compilation confirmed the blog demo renders correctly:
```bash
npx tsx scripts/compile-bbwp.ts website/blog/samples/post12/text-cutout.pathogen
```

A 7-glyph "CUTTING" variation was also compiled and verified artifact-free at `website/blog/samples/post12/text-cutout-cutting.pathogen`.

## Downstream Impact

The fix touches `assembleResult`, the shared assembly path for all boolean operations. Verified impact:

| Operation | Status | Notes |
|-----------|--------|-------|
| Union (curves) | Clean | Primary fix target |
| Intersection (curves) | Clean | New test: overlapping circles → lens |
| XOR (curves) | Clean | New test: overlapping circles → 2 crescents |
| Difference (curves) | Clean | Existing test: circle cutout from rectangle |
| Collinear shared edge | 2 subpaths | Visually correct via SVG fill-rule; inherent limitation of winding-number classification for boundary points |

## Known Limitation

Fully collinear shared edges (two shapes sharing an exact straight-line edge) produce 2 subpaths instead of a topologically merged single contour. The SVG `fill-rule` renders them as visually correct, and subsequent boolean operations handle multi-subpath inputs correctly. This is inherent to winding-number-based classification: the midpoint of a shared edge sits exactly on the boundary of both paths, producing ambiguous inside/outside results. The fix handles the *partial* collinear case (like the U–T junction) via fallback linking, but the fully shared edge case remains a cosmetic-only issue that does not affect visual output.

## Files Changed

| File | Change |
|------|--------|
| `src/evaluator/boolean-ops.ts` | Replaced `assembleResult` + `chainSegments` with ring-based traversal (5 new functions, ~200 lines replacing ~180 lines) |
| `tests/boolean-ops.test.ts` | Added 6 new tests for curved-path and collinear-edge cases |
| `website/blog/samples/post12/text-cutout-cutting.pathogen` | New 7-glyph "CUTTING" variation demo |
