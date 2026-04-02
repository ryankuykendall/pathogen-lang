# How D3 and Paper.js Approach Arcs

**Purpose**: Understand two contrasting API philosophies for arc construction — one that succeeded (D3) and one that stalled (Paper.js) — to inform Pathogen's arc API investment.

---

## D3.js: The Gold Standard for Programmatic Arcs

### The API

D3 separates **layout** (computing angles from data) from **rendering** (drawing geometry from angles):

```js
// Layout: data → angles
const pie = d3.pie().value(d => d.count).padAngle(0.02);
const arcs = pie(data);
// → [{ startAngle: 0, endAngle: 1.2, padAngle: 0.02, data: {...} }, ...]

// Rendering: angles → SVG path
const arc = d3.arc()
  .innerRadius(80)
  .outerRadius(200)
  .cornerRadius(8);

svg.selectAll("path")
  .data(arcs)
  .join("path")
    .attr("d", arc);  // arc is called with each pie datum
```

The developer never sees SVG arc flags. The API speaks in the language of the domain: radii, angles, corner rounding, padding.

### Seven Properties

| Property | Default | Purpose |
|----------|---------|---------|
| `innerRadius` | from datum | 0 for pie, >0 for donut |
| `outerRadius` | from datum | Outer boundary |
| `startAngle` | from datum | In radians, 0 = 12 o'clock |
| `endAngle` | from datum | In radians, clockwise |
| `cornerRadius` | 0 | Fillet radius at arc-line junctions |
| `padAngle` | from datum | Angular gap between adjacent segments |
| `padRadius` | auto | Controls linear gap width from angular gap |

Each property accepts either a constant or an accessor function `(datum) => value`. The defaults read from the datum object — this is the glue between `pie()` and `arc()`.

### How It Generates SVG Internally

D3 does **not** build SVG path strings directly. It calls the **Canvas 2D path API** (`moveTo`, `arc`, `lineTo`, `closePath`), then a shim layer (`d3-path`) serializes those calls into SVG:

```
arc generator
  → context.moveTo(), context.arc(), context.lineTo(), context.closePath()
  → d3-path intercepts Canvas API calls
  → Path.arc() computes endpoints, flags, emits SVG A commands
  → Path.toString() returns the path data string
```

This means one implementation serves both SVG and Canvas rendering — just swap the context.

**Example output for a quarter-circle sector (ir=0, or=100, 0 to pi/2):**
```
M0,-100A100,100,0,0,1,100,0L0,0Z
```

**Full circle (two semicircles, because SVG can't do one):**
```
M0,-100A100,100,0,1,1,0,100A100,100,0,1,1,0,-100Z
```

### Corner Radius Geometry

The most sophisticated part (~80 lines of the ~150 line core). For each of the 4 corners of an annular sector:

1. Offset the radial edge by `cr` perpendicular to itself
2. Intersect with a circle of radius `R - cr` (outer) or `R + cr` (inner)
3. That intersection is the fillet center
4. Compute tangent angles via `atan2`
5. Emit a small arc for the fillet, then the main arc between fillets

**Clamping**: `cr` is clamped to `(outerR - innerR) / 2`. For narrow sectors, further restricted by intersecting the two radial edges to prevent fillet overlap. When fillets merge (e.g., `cornerRadius(Infinity)` on a quarter turn), the arc degenerates gracefully into a pill/stadium shape.

### Pad Angle: Parallel-Gap Edges

The goal is a gap of consistent *linear* width, not angular width. A fixed angular gap would be wider at the outer edge. D3 solves this:

```js
padRadius = padRadius || sqrt(innerR^2 + outerR^2);
innerPad = asin(padRadius / innerR * sin(padAngle / 2));  // larger offset
outerPad = asin(padRadius / outerR * sin(padAngle / 2));  // smaller offset
```

The inner arc gets more angular inset than the outer, keeping gap edges roughly parallel.

### Key Design Decisions

**1. Center-origin.** All arcs are generated at (0,0). Position via `transform: translate()`. This keeps path data clean, reusable, and simplifies the math.

**2. 12-o'clock convention.** 0 = top, positive = clockwise. Matches human intuition for pie charts. Internally subtracts `pi/2` to convert to math convention.

**3. Accessor pattern.** Properties are either constants or `(datum) => value` functions. This enables composability with `pie()` and per-datum variation without separate code paths.

**4. Graceful degradation everywhere.**
- Zero radius → point
- Full circle → two semicircles
- Swapped inner/outer → silently corrected
- Corner radius too large → clamped or merged
- Padding collapses inner arc → degenerates to straight lines

**5. Layout/rendering separation.** `pie()` is pure data transformation (no DOM). `arc()` is pure rendering (no data logic). They communicate through a shared data contract (`{startAngle, endAngle, ...}`). You can use either independently.

### Tradeoffs

- Center-origin requires manual `translate` on every element — extra boilerplate
- The accessor pattern is verbose for simple cases (many chained property calls)
- Three layers of indirection (generator → Canvas API → d3-path → SVG string)
- Corner rounding math is complex, but users never see it

---

## Paper.js: The Three-Point Arc and Its Discontents

### The API

Paper.js offers arcs through `arcTo()` with three overloads:

```js
// Overload 1: Three-point arc (the canonical Paper.js way)
path.arcTo(throughPoint, toPoint);

// Overload 2: Semicircular arc
path.arcTo(toPoint, clockwise);

// Overload 3: SVG-style (largely undocumented)
path.arcTo(toPoint, new Size(rx, ry), rotation, clockwise, large);
```

And the static constructor:
```js
var arc = new Path.Arc(fromPoint, throughPoint, toPoint);
```

### The Three-Point Philosophy

The primary model is **"from, through, to"** — specify three points, get the unique circular arc passing through all three. The algorithm:

1. Construct perpendicular bisectors of (from, through) and (through, to)
2. Intersect them to find the arc center
3. Compute the sweep angle from directed angles

This is intuitive for **interactive, mouse-driven** workflows (Paper.js's sweet spot). You drag three handles, you see an arc. It maps directly to how illustrators think about curves.

### Internal Representation: Everything Is Cubic Beziers

Paper.js has **no arc primitive** in its data model. Every path is a sequence of `Segment` objects (anchor point + two cubic bezier handles). When `arcTo()` is called:

1. Compute number of bezier segments: `ceil(extent / 90)` (max 90 degrees each)
2. Handle scale factor: `z = 4/3 * sin(half) / (1 + cos(half))`
3. For each segment, rotate and scale handles perpendicular to the radius

**Consequence**: SVG export emits only `M`, `l`, `c`, `z` — never `A`. Round-tripping through Paper.js loses arc representation entirely.

### The Gap: No Center + Sweep API

This is Paper.js's central arc usability problem. For programmatic use cases (pie charts, gauges, radial layouts), developers need:

> "Draw an arc centered at (cx, cy), radius r, sweeping from startAngle to endAngle."

Paper.js doesn't offer this. The workarounds are painful:

**Workaround A** — Compute a `through` point manually:
```js
var halfAngle = sweepAngle / 2;
var through = center.add(new Point({
    length: radius,
    angle: startAngle + halfAngle
}));
var to = center.add(new Point({
    length: radius,
    angle: startAngle + sweepAngle
}));
path.arcTo(through, to);
```
Breaks for 360-degree arcs (through point becomes collinear).

**Workaround B** — Use the undocumented SVG-style overload:
```js
path.arcTo(endPoint, new Size(radius, radius), 0, clockwise, large);
```
Must compute endpoint yourself, must set the `clockwise` and `large` flags — the exact problem SVG has.

### GitHub Issue #1052: "Can we get a nicer arc api?"

Open since **May 2016** (10 years unresolved). The key exchange:

**makoConstruct** (requester):
> "I've never really wanted to draw an arc by specifying three points, and from the looks of the source, neither does the computer."
>
> "Was `Path.arcTo` not meant for humans to use? Because I really can't guess why anyone would want to write code that operates in terms of `large`."

**Lehni** (Paper.js creator):
> "The API is generally aimed at humans, but also needs to cover established standards, such as SVG. There is a middle ground to be found."

makoConstruct built `arcAround(center, sweepAngle)` in a fork — about 40 lines, clean API, self-contained. Lehni asked for code reuse with existing `arcTo`. makoConstruct pushed back:

> "My patience has run out with trying to understand arcTo and I'm beginning to question whether reusing that code for a fundamentally simpler subset of the problem would improve maintainability after all."

The PR was never merged. The feature stalled.

### Other Arc-Related Issues

- **#1477**: Three-point arcs fail at exactly 180 degrees (perpendicular bisectors are parallel → no intersection). Floating-point fragility inherent in the approach.
- **#1635**: SVG import crashes when start == end (360-degree arc). Divide by zero in the endpoint-to-center conversion.
- **#1727**: "How to draw pie chart?" — no built-in sector/wedge primitive, must manually `moveTo(center)` then `arcTo` then `closePath`.

### Tradeoffs

**What works:**
- Three-point arcs are intuitive for interactive sketching and mouse-driven design
- Cubic bezier representation integrates perfectly with Paper.js's Illustrator-like editing model
- SVG import handles all arc types (after bug fixes)

**What doesn't:**
- No programmatic arc API (center + radius + sweep)
- Three-point approach has inherent fragility (collinear/coincident edge cases)
- 360-degree arcs are impossible or crash in multiple code paths
- No composite shapes (pie sectors, annular sectors, gauges)
- SVG export loses arc information permanently
- The only programmatic option (SVG-style overload) is undocumented and reintroduces the exact flag-based confusion that makes raw SVG arcs painful

---

## Side-by-Side Comparison

| Aspect | D3.js | Paper.js |
|--------|-------|----------|
| **Primary model** | Center + radii + angles | Three points (from, through, to) |
| **Target workflow** | Programmatic / data-driven | Interactive / mouse-driven |
| **Arc representation** | SVG `A` commands (via Canvas API shim) | Cubic bezier segments |
| **Composite shapes** | Yes (annular sectors with corners + padding) | No (manual construction) |
| **Full circle** | Handled (two semicircles) | Crashes or fails |
| **Elliptical arcs** | No (circular only) | Yes (via SVG-style overload) |
| **Corner rounding** | Built-in, with clamping | Not applicable |
| **Gap/padding** | Built-in (`padAngle`) | Not applicable |
| **Flag exposure** | Never | Only in undocumented overload |
| **Angle convention** | 0=top, CW, radians | Degrees, varies by method |
| **SVG round-trip** | Lossless (emits `A` commands) | Lossy (arcs → cubics on export) |
| **API maturity** | Complete, stable | Gap acknowledged but unresolved for 10 years |

---

## Implications for Pathogen

### What D3 gets right that Pathogen should emulate

1. **Domain-language API.** `innerRadius`, `outerRadius`, `startAngle`, `endAngle` — not flags. D3 proves that developers will eagerly adopt arc functions when the API matches how they think about the geometry.

2. **Graceful degradation as a first-class concern.** Every edge case (zero radius, full circle, oversized corners, collapsed padding) produces reasonable output. No crashes, no garbage geometry.

3. **Corner rounding integrated into the shape.** Not a separate post-processing step. The fillet geometry is computed alongside the main arc, with proper clamping.

4. **Composability.** The layout/rendering separation and the accessor pattern mean the same arc generator works for pie charts, donut charts, gauges, and custom radial layouts.

### What Paper.js's failure teaches

1. **Three-point arcs are wrong for programmatic use.** They're great for interactive tools but force developers to reverse-engineer intermediate points from the parameters they actually have (center, radius, angles). This is the same conceptual-mismatch problem as SVG endpoint parameterization.

2. **Undocumented escape hatches aren't APIs.** Paper.js's SVG-style overload exists but was never documented or polished. Users discovered it by reading source code. An API that users can't find doesn't solve their problem.

3. **Don't let perfect be the enemy of good.** Lehni's insistence on code reuse with the existing `arcTo` implementation blocked a 40-line solution to a 10-year-old problem. Sometimes a clean, independent implementation is the right call.

4. **360-degree arcs must work.** Both SVG and Paper.js have foot-guns here. Any arc API should handle full circles without special-case workarounds.

### The gap Pathogen can fill

Pathogen already has the circular center-based arc functions (`arcFromCenter`, `arcFromPolarOffset`, `tangentArc`). Neither D3 nor Paper.js offers the **elliptical** equivalents of these in a clean, flag-free API. D3 is circular only. Paper.js's elliptical support is buried in an undocumented SVG-parameter overload.

An elliptical arc API that maintains Pathogen's existing center-based, flag-free, context-aware patterns would be genuinely novel in this space.

---

## Sources

- [D3 d3-shape arc](https://d3js.org/d3-shape/arc) — API docs
- [D3 d3-shape source (arc.js)](https://github.com/d3/d3-shape/blob/main/src/arc.js) — implementation
- [D3 d3-path source](https://github.com/d3/d3-path/blob/main/src/path.js) — Canvas-to-SVG shim
- [D3 d3-shape pie](https://d3js.org/d3-shape/pie) — layout docs
- [Paper.js Path reference](http://paperjs.org/reference/path/) — arcTo docs
- [Paper.js issue #1052](https://github.com/paperjs/paper.js/issues/1052) — "Can we get a nicer arc api?"
- [Paper.js issue #1477](https://github.com/paperjs/paper.js/issues/1477) — Three-point arc edge cases
- [Paper.js issue #1635](https://github.com/paperjs/paper.js/issues/1635) — 360-degree arc crash
- [Paper.js issue #1727](https://github.com/paperjs/paper.js/issues/1727) — "How to draw pie chart?"
- [makoConstruct's arcAround fork](https://github.com/makoConstruct/paper.js) — proposed center+sweep API
