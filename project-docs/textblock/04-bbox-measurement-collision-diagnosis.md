# Diagnosing and Fixing Text Collisions in bbox-measurement.pathogen

## The Problem

The `bbox-measurement` blog sample had several visible issues:

1. **Text overflowing bounding boxes** — The blue bounding box rectangles were too narrow; rendered text extended past their right edge
2. **Height labels overlapping text content** — The green `h = ...` labels and their bracket geometry sat inside the rendered text area
3. **Floating point noise** — Dimension labels showed ugly values like `w = 87.52000000000001` and `h = 28.799999999999997`

## Diagnosis Process

### Step 1: Visual identification (Puppeteer screenshot)

A Puppeteer screenshot of the rendered BBWP confirmed the visual overlap issues. The blue bounding box rectangles did not enclose the rendered text — characters spilled past the right edge.

### Step 2: Root cause via `.boundingBox()` comparison

A diagnostic Pathogen file (`bbox-measurement-diag2.pathogen`) measured the **same text** under two font-family settings, revealing a style mismatch:

```pathogen
// Sans-serif estimation (original — no font-family in << styles)
let small_text = &{ text(0, 10)`font-size: 10` } << ${ font-size: 10; };
let bb_sans = small_text.boundingBox();  // width = 54.7

// Monospace estimation (what the TextLayer actually renders)
let small_mono = &{ text(0, 10)`font-size: 10` } << ${ font-size: 10; font-family: monospace; };
let bb_mono = small_mono.boundingBox();  // width = 78
```

| Row | Sans-serif (measured) | Monospace (rendered) | Error |
|-----|----------------------|---------------------|-------|
| 10px | 54.7px | 78px | **30% too narrow** |
| 16px | 87.5px | 124.8px | 30% too narrow |
| 24px | 131.3px | 187.2px | 30% too narrow |

**Root cause**: The `<<` style blocks omitted `font-family`, so `.boundingBox()` defaulted to sans-serif character widths. But the rendering TextLayer used `font-family: monospace`.

### Step 3: Confirm collisions with `.intersects()`

Projected the height labels at their original positions and tested against correctly-measured text:

```pathogen
let s_proj = small_mono.project(x0, y_s);
let hl_s = h_label.project(calc(x0 + bb_sans.width + 12), ...);
log("intersects:", hl_s.intersects(s_proj));  // true — all three rows
```

Gap calculations showed negative values: -11px, -25px, -44px (labels inside the text area).

### Step 4: First fix — style alignment + rounding + spacing

1. Added `font-family: monospace;` to all `<<` style blocks
2. Used `round()` to clean floating point noise
3. Increased spacing offsets

This fixed the text-vs-text intersections, but a Puppeteer screenshot revealed a remaining issue: the height bracket **path geometry** (vertical line + serif ticks) still sat too close to the text content. The estimation gap (10px between estimated text edge and bracket) was consumed by the difference between our character width table (0.60em) and the browser's actual monospace width.

### Step 5: Architectural redesign with GroupLayers

The remaining collision exposed a deeper design issue: the sample was built entirely in absolute canvas coordinates, making collision detection an N² problem across all elements. Per the [Code Example Guidelines](../../website/guidelines/code-example-guidelines.md) §9:

> Build diagrams from GroupLayers that represent logical components. Position components using transforms. Avoid constructing diagrams entirely in absolute canvas coordinates.

The sample was restructured into logical groups:

```
GroupLayer('row-10')  ${ translate-x: 60; translate-y: 100; }
  ├── TextLayer('t1')        — the label text
  ├── PathLayer('bb1')       — bounding box overlay
  ├── PathLayer('wd1')       — width dimension line
  ├── TextLayer('wl1')       — width dimension label
  ├── PathLayer('hd1')       — height bracket line
  └── TextLayer('hl1')       — height dimension label

GroupLayer('row-16')  ${ translate-x: 60; translate-y: 195; }
  └── ... (same structure)

GroupLayer('row-24')  ${ translate-x: 60; translate-y: 300; }
  └── ... (same structure)

GroupLayer('code-group') ${ translate-x: 360; translate-y: 80; }
  ├── TextLayer('code')      — code snippet
  └── TextLayer('kw')        — keyword highlighting
```

**Benefits:**

1. **Scoped collision detection** — Each row's `.intersects()` checks only test elements within that group (6 elements, not 24). No N² cross-group checks needed.
2. **Repositioning is trivial** — Moving a row means changing one `translate-y` value, not updating every coordinate in every layer.
3. **Origin-relative composition** — All content within each group is authored at origin (0, 0). The group transform handles placement.
4. **Increased bracket gap** — `bracket_right = 16` (was 10) plus `h_label_gap = 8` puts height labels 24px from the estimated text edge — ample room for font rendering variance.

### Step 6: Collision verification within groups

Each row includes inline collision checks:

```pathogen
// Check h-label vs text content
let hl1_proj = (&{ text(0, 8)`h = ${round(bb1.height)}` } << anno_styles)
  .project(calc(hx1 + h_label_gap), calc(bb1.y + bb1.height / 2 + 3));
let t1_proj = t1.project(0, 0);
if (hl1_proj.intersects(t1_proj)) { log("WARN: row-10 h-label intersects text"); }

// Check h-label vs bracket geometry (approximate bracket as rect)
if (hl1_proj.intersects({ x: calc(hx1 - 3), y: bb1.y, width: 6, height: bb1.height })) {
  log("WARN: row-10 h-label intersects bracket");
}
```

**Result**: All checks pass — zero warnings logged.

### Step 7: Visual confirmation

Final Puppeteer screenshot confirms:
- All bounding boxes correctly wrap their text content
- Height labels and brackets sit clearly to the right with visible gap
- Dimension values are clean rounded numbers
- Row spacing is even and unambiguous

## Key Takeaways

1. **TextBlock styles for `.boundingBox()` must match rendering styles.** Omitting `font-family` can produce 30%+ error.

2. **GroupLayer composition turns collision detection from N² to O(k)** — check within each logically scoped group, not across the entire canvas.

3. **Path geometry is invisible to `.intersects()`** — bracket lines, dimension ticks, and other `PathLayer` elements aren't caught by TextBlock intersection checks. Approximate them as `{x, y, width, height}` rectangles for detection.

4. **Font rendering variance requires margins** — Even with correct font-family matching, browser monospace fonts may differ slightly from our 0.60em estimate. A 16px gap absorbs this safely.

## Artifacts

| File | Purpose |
|------|---------|
| `bbox-measurement-diag2.pathogen` | Diagnostic: sans-serif vs monospace estimation comparison |
| `bbox-measurement-diag3.pathogen` | Diagnostic: bracket geometry overlap analysis |
| `bbox-measurement-verify.pathogen` | Verification: intermediate fix (pre-GroupLayer) |
| `bbox-measurement.pathogen` | Final version using GroupLayers |
