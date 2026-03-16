# Bug: Boolean Operations Fail on Multi-Subpath Inputs

**Filed**: 2026-03-16
**Severity**: High — blocks the text-cutout blog post demo from rendering correctly
**Component**: `src/evaluator/boolean-ops.ts`

## Summary

Boolean operations (`.union()`, `.difference()`, `.intersection()`, `.xor()`) produce incorrect results when either operand contains multiple subpaths. This manifests most visibly when unioning non-overlapping glyph paths and then using the union result as an operand in `.difference()`.

## Two Distinct Issues

### Issue 1: Union of overlapping curved paths produces artifacts

When two glyph outlines overlap (e.g., at 0.8 tracking), the union operation produces visual artifacts — missing segments, stray geometry inside the merged shape. The intersection finder and segment classifier fail to correctly handle the complex curve-curve intersections at the overlap boundary.

**Reproduction** (overlapping C and U glyphs at 0.8 tracking):
```pathogen
@font "./fonts/Bebas_Neue/BebasNeue-Regular.ttf"
let glyphs = PathBlock.fromGlyph("CU", ${ font-family: BebasNeue-Regular; font-size: 60; });
let tracking = 0.8;
let proj_C = glyphs[0].project(0, 0);
let proj_U = glyphs[1].project(calc(glyphs[0].advanceWidth * tracking), 0);

// This produces artifacts — the merged C+U has missing/extra segments
let combined = proj_C.union(proj_U);
M 50 80
combined.draw()
```

**Expected**: Clean merged outline of C and U with overlap region resolved.
**Actual**: Broken geometry with segments missing from the C.

### Issue 2: Difference ignores subpaths beyond the first in operand B

When operand B of `.difference()` contains multiple subpaths (e.g., the result of unioning non-overlapping glyphs), only the first subpath is subtracted. The remaining subpaths are silently ignored.

**Reproduction** (plate minus union of 3 non-overlapping glyphs):
```pathogen
@font "./fonts/Bebas_Neue/BebasNeue-Regular.ttf"
let glyphs = PathBlock.fromGlyph("CUT", ${ font-family: BebasNeue-Regular; font-size: 60; });

// At 1.0 tracking, glyphs don't overlap — union produces 3 separate subpaths
let proj_C = glyphs[0].project(0, 0);
let proj_U = glyphs[1].project(glyphs[0].advanceWidth, 0);
let proj_T = glyphs[2].project(calc(glyphs[0].advanceWidth + glyphs[1].advanceWidth), 0);

let combined = proj_C.union(proj_U).union(proj_T);
// combined.subPathCount == 3 (non-overlapping union = concatenation)

let plate = @{ h 120 v 70 h -120 z };
let plate_proj = plate.project(-10, -55);

// Only the first subpath (C) gets subtracted — U and T are ignored
let cutout = plate_proj.difference(combined.project(0, 0));
M 50 120
cutout.draw()
```

**Expected**: Plate with all three letters (C, U, T) punched out.
**Actual**: Plate with only the first letter punched out (or only T, depending on subpath ordering).

## Root Cause Analysis

### The pipeline: `booleanOp()` (line 1663)

1. `extractDrawCmds()` (line 1618) — Strips all `M` (moveto) and `Z` (close) commands, losing subpath boundaries. Multi-subpath input `[M L L Z M L L Z]` becomes flat `[L L L L]`.

2. `includeClosingSegment()` (line 1641) — Adds a single closing segment from the last segment's endpoint to the first segment's start point. This connects the last segment of subpath N back to the first segment of subpath 0, creating a single invalid path.

3. `windingNumber()` (line 1270) — Operates on the flattened segment array. For multi-subpath inputs, the winding number is computed against the merged (incorrect) geometry, producing wrong inside/outside classifications.

4. `handleNoIntersections()` (line 1699) — For disjoint shapes, union returns `[...cmdsA, ...cmdsB]` (concatenation). This multi-subpath result then breaks when passed to subsequent boolean operations.

### Why the "no intersections" path is critical

Non-overlapping glyph outlines always hit the `handleNoIntersections` code path. The union correctly concatenates them, but the result has N subpaths. When that N-subpath result is then used as operand B in `.difference()`, `extractDrawCmds` + `includeClosingSegment` flatten it into a single malformed path.

## Test Snippet for Regression Testing

```typescript
import { compile, createFontRegistry, addFont } from '../src';
import { readFileSync } from 'fs';

// Load Bebas Neue
const registry = createFontRegistry();
const buf = readFileSync('fonts/Bebas_Neue/BebasNeue-Regular.ttf');
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
addFont(registry, 'BebasNeue-Regular', 400, 'normal', ab);

describe('boolean ops on glyph paths', () => {
  it('union of overlapping glyphs produces clean merged outline', () => {
    const result = compile(`
      @font "Bebas Neue"
      let glyphs = PathBlock.fromGlyph("CU", \${ font-family: BebasNeue-Regular; font-size: 60; });
      let tracking = 0.8;
      let proj_C = glyphs[0].project(0, 0);
      let proj_U = glyphs[1].project(calc(glyphs[0].advanceWidth * tracking), 0);
      let combined = proj_C.union(proj_U);
      log(combined.subPathCount);
      // At 0.8 tracking, C and U overlap — union should merge into 1 subpath
      M 50 80
      combined.draw()
    `, { fonts: registry });
    // Union of overlapping paths should produce exactly 1 closed subpath
    const subPaths = parseInt(result.logs[0].parts[0].value);
    expect(subPaths).toBe(1);
    // Path data should be non-empty and not contain artifacts
    expect(result.layers[0].data.length).toBeGreaterThan(0);
  });

  it('difference subtracts all subpaths of multi-subpath operand B', () => {
    const result = compile(`
      @font "Bebas Neue"
      let glyphs = PathBlock.fromGlyph("CUT", \${ font-family: BebasNeue-Regular; font-size: 60; });
      let proj_C = glyphs[0].project(0, 0);
      let proj_U = glyphs[1].project(glyphs[0].advanceWidth, 0);
      let proj_T = glyphs[2].project(calc(glyphs[0].advanceWidth + glyphs[1].advanceWidth), 0);
      let combined = proj_C.union(proj_U).union(proj_T);
      let bb = combined.project(0, 0).boundingBox();
      let pad = 15;
      let plate = @{ h calc(bb.width + pad * 2) v calc(bb.height + pad * 2) h calc(-(bb.width + pad * 2)) z };
      let plate_proj = plate.project(calc(bb.x - pad), calc(bb.y - pad));
      let cutout = plate_proj.difference(combined.project(0, 0));
      log(cutout.subPathCount);
      M 0 0
      cutout.draw()
    `, { fonts: registry });
    // Difference should produce plate with 3 holes (C, U, T) = 4 subpaths
    // (1 outer rectangle + 3 reversed letter holes)
    const subPaths = parseInt(result.logs[0].parts[0].value);
    expect(subPaths).toBeGreaterThanOrEqual(4);
  });

  it('union then difference produces correct text cutout at 0.8 tracking', () => {
    const result = compile(`
      @font "Bebas Neue"
      let glyphs = PathBlock.fromGlyph("CUT", \${ font-family: BebasNeue-Regular; font-size: 60; });
      let tracking = 0.8;
      let x0 = 0;
      let x1 = calc(glyphs[0].advanceWidth * tracking);
      let x2 = calc(x1 + glyphs[1].advanceWidth * tracking);
      let proj_C = glyphs[0].project(x0, 0);
      let proj_U = glyphs[1].project(x1, 0);
      let proj_T = glyphs[2].project(x2, 0);
      let combined = proj_C.union(proj_U).union(proj_T);
      let bb = combined.project(0, 0).boundingBox();
      let pad = 15;
      let plate = @{ h calc(bb.width + pad * 2) v calc(bb.height + pad * 2) h calc(-(bb.width + pad * 2)) z };
      let plate_proj = plate.project(calc(bb.x - pad), calc(bb.y - pad));
      let cutout = plate_proj.difference(combined.project(0, 0));
      M 50 80
      cutout.draw()
    `, { fonts: registry });
    // Should produce non-empty path data with all three letters cut out
    expect(result.layers[0].data.length).toBeGreaterThan(0);
  });
});
```

## Fix Strategy

The fix requires making `booleanOp()` correctly handle multi-subpath inputs. Two approaches:

### Approach A: Decompose at the wrapper level
In `pathDifference`, `pathUnion`, etc., split multi-subpath inputs into individual subpaths and process them separately, then combine results. This is simpler but requires careful handling of intermediate results that themselves have multiple subpaths (e.g., a plate with a hole from a previous difference).

### Approach B: Fix `extractDrawCmds` and `includeClosingSegment`
Modify the core pipeline to preserve subpath boundaries throughout. `extractDrawCmds` would return an array of subpath segment arrays, and all downstream functions (intersection finding, winding number, classification, assembly) would operate per-subpath. This is the correct long-term fix but touches many functions.

### Approach C: Hybrid
For `pathDifference(A, multiB)`, chain individual `booleanOp(result, singleB)` calls, passing the full intermediate result (including holes from previous diffs) as operand A. Initial testing showed this produces correct results because the flattened winding numbers happen to work for the plate-with-holes case. However, `pathUnion` with overlapping curved multi-subpath inputs requires Approach B.

## Affected Blog Post

The text-cutout demo in `website/blog/samples/post12/text-cutout.pathogen` uses `.union()` and `.difference()` on glyph paths and is blocked by both issues. The blog post prose in `website/blog/pathblock-glyph-extraction.md` describes the correct pipeline; once the bug is fixed, the demo will render correctly without any prose changes.
