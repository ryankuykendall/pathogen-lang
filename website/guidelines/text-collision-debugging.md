# Text Collision Debugging

Prescriptive rules for diagnosing and preventing text-vs-element collisions in diagrams built with TextBlock and PathLayer.

---

## 1. Match `.boundingBox()` Styles to Rendering Styles

The `<<` style block passed to `.boundingBox()` must include all properties that affect text metrics — especially `font-family`. Omitting it defaults to sans-serif character widths, which can produce 30%+ width error versus monospace rendering.

**Wrong** — missing font-family causes underestimation:

```pathogen
let label = &{ text(0, 10)`Hello World` } << #{ font-size: 16; };
let bb = label.boundingBox();  // width ≈ 87px (sans-serif estimate)
// Actual monospace rendering: ~125px — 30% wider
```

**Correct** — font-family matches the rendering TextLayer:

```pathogen
let label = &{ text(0, 10)`Hello World` } << #{ font-size: 16; font-family: monospace; };
let bb = label.boundingBox();  // width ≈ 125px (matches rendered output)
```

---

## 2. Use `.intersects()` to Confirm Collisions

Programmatically verify overlap after computing bounding boxes. Do not rely on visual inspection alone — subtle overlaps are easy to miss, and font rendering differences across environments can shift elements by several pixels.

```pathogen
let label_proj = label.project(label_x, label_y);
let annotation_proj = annotation.project(anno_x, anno_y);

if (label_proj.intersects(annotation_proj)) {
  log("WARN: label intersects annotation — increase spacing");
}
```

Always project both TextBlocks to their final canvas positions before testing intersection.

---

## 3. Approximate Path Geometry as Rectangles

`.intersects()` operates on TextBlock bounding boxes — it does not detect PathLayer geometry such as bracket lines, dimension ticks, or arrows. To check collisions against path elements, pass an `{x, y, width, height}` rectangle literal that approximates the path's footprint.

```pathogen
// Height bracket is a vertical line at hx with serif ticks
let bracket_rect = { x: calc(hx - 3), y: bb.y, width: 6, height: bb.height };

if (h_label_proj.intersects(bracket_rect)) {
  log("WARN: height label intersects bracket geometry");
}
```

Pad the rectangle by a few pixels on each side to account for stroke width.

---

## 4. Use GroupLayers for Scoped Collision Detection

Cross-reference [Code Example Guidelines](./code-example-guidelines.md) §9. GroupLayers scope intersection checks to O(k) per group instead of N² across the entire canvas.

```
GroupLayer('row-10')  #{ translate-x: 60; translate-y: 100; }
  ├── TextLayer('t1')        — the label text
  ├── PathLayer('bb1')       — bounding box overlay
  ├── PathLayer('hd1')       — height bracket line
  └── TextLayer('hl1')       — height dimension label

GroupLayer('row-16')  ${ translate-x: 60; translate-y: 195; }
  └── ... (same structure, independent collision checks)
```

**Benefits:**

- Each group's `.intersects()` checks test only elements within that group
- Repositioning a group means changing one `translate-y` value, not every coordinate
- All content within each group is authored at origin — the group transform handles placement

---

## 5. Budget Margins for Font Rendering Variance

Browser font metrics differ from the compiler's 0.60em monospace character-width estimate. Even with correct `font-family` matching in `.boundingBox()`, rendered widths may vary by several pixels across environments.

Budget at least **16px gap** between text edges and adjacent annotations or path geometry. When positioning elements relative to a bounding box edge:

```pathogen
let bracket_right = 16;   // gap from estimated text edge to bracket
let h_label_gap = 8;      // gap from bracket to label text
// Total clearance: 24px from estimated text edge to label start
```

This absorbs the variance between estimated and actual font metrics without requiring per-environment tuning.
