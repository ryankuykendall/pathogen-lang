# The SVG Path Arc Command: A Critical Primer

**Purpose**: Ground the design of a richer arc API in Pathogen by fully understanding what the SVG `A`/`a` command gets right, gets wrong, and what the broader ecosystem has done to work around it.

---

## 1. The Command at a Glance

```
A rx ry x-rotation large-arc-flag sweep-flag x y    (absolute)
a rx ry x-rotation large-arc-flag sweep-flag dx dy   (relative)
```

Seven parameters — more than any other SVG path command:

| # | Parameter | Type | Purpose |
|---|-----------|------|---------|
| 1 | `rx` | number | Ellipse x-radius |
| 2 | `ry` | number | Ellipse y-radius |
| 3 | `x-rotation` | degrees | Rotation of ellipse axes relative to coordinate system |
| 4 | `large-arc-flag` | 0 \| 1 | 0 = minor arc (<=180deg), 1 = major arc (>180deg) |
| 5 | `sweep-flag` | 0 \| 1 | 0 = counter-clockwise, 1 = clockwise |
| 6 | `x` | number | Endpoint x |
| 7 | `y` | number | Endpoint y |

The arc draws an elliptical curve from the current point to (x, y), constrained to lie on an ellipse defined by `rx`, `ry`, and `x-rotation`. The two flags disambiguate which of four possible arcs to draw.

---

## 2. The Core Design Choice: Endpoint Parameterization

This is the root of nearly every usability complaint. There are two ways to define an arc:

### Center parameterization (what developers expect)

> "Draw an arc centered at (cx, cy) with radii rx/ry, from startAngle to endAngle."

Used by: Canvas `arc()`, Canvas `ellipse()`, D3.js, PostScript, Cairo, Processing, Paper.js, virtually every other 2D graphics API.

### Endpoint parameterization (what SVG chose)

> "Draw an arc from where you are to (x, y), on an ellipse with these radii, using these two flags to pick which arc."

Used by: SVG. Only SVG.

**Why SVG made this choice**: Every other path command (`M`, `L`, `C`, `Q`, `S`, `T`) ends with the coordinates of the new current point. The W3C prioritized syntactic consistency — all commands consume endpoint coordinates — over conceptual clarity. The spec's own implementation notes acknowledge this requires a non-trivial conversion algorithm (Appendix B.2.4) to actually render.

---

## 3. The Four Possible Arcs

Given two points and an ellipse (rx, ry, rotation), there are generally **two possible ellipses** that pass through both points. On each ellipse, there are **two arcs** (the short way and the long way). The flags select among these four:

```
                    sweep=0 (CCW)        sweep=1 (CW)
                 ┌─────────────────┬─────────────────┐
  large-arc=0    │   Small CCW     │   Small CW      │
  (minor arc)    │                 │                  │
                 ├─────────────────┼─────────────────┤
  large-arc=1    │   Large CCW     │   Large CW      │
  (major arc)    │                 │                  │
                 └─────────────────┴─────────────────┘
```

The flag combination determines the sign in the center-computation formula (Step 2 of B.2.4): use `+` when `fA != fS`, use `-` when `fA == fS`.

---

## 4. The Conversion Math (Endpoint to Center)

This is what every SVG renderer must do internally. The algorithm from W3C SVG2 Implementation Notes (B.2.4):

**Step 1** — Rotate to ellipse-aligned coordinates:
```
x1' =  cos(phi) * (x1-x2)/2 + sin(phi) * (y1-y2)/2
y1' = -sin(phi) * (x1-x2)/2 + cos(phi) * (y1-y2)/2
```

**Step 2** — Compute center in rotated frame:
```
K = (rx^2*ry^2 - rx^2*y1'^2 - ry^2*x1'^2) / (rx^2*y1'^2 + ry^2*x1'^2)

cx' = +/- sqrt(K) * (rx*y1'/ry)
cy' = +/- sqrt(K) * (-ry*x1'/rx)

Sign: + when fA != fS, - when fA == fS
```

**Step 3** — Transform back:
```
cx = cos(phi)*cx' - sin(phi)*cy' + (x1+x2)/2
cy = sin(phi)*cx' + cos(phi)*cy' + (y1+y2)/2
```

**Step 4** — Compute angles using vector angle function:
```
theta1     = angle((1,0), ((x1'-cx')/rx, (y1'-cy')/ry))
deltaTheta = angle(((x1'-cx')/rx, (y1'-cy')/ry), ((-x1'-cx')/rx, (-y1'-cy')/ry))
```

Where `angle(u, v) = sign(ux*vy - uy*vx) * arccos(u.v / |u||v|)`.

This is not a trivial computation. It involves coordinate rotations, a square root with sign selection, an arccos with cross-product sign correction, and a modular adjustment to constrain deltaTheta. This entire procedure exists because of the endpoint parameterization choice.

---

## 5. Edge Cases and Auto-Correction

The spec defines several "out of range" behaviors (Section 9.5.1):

| Condition | Behavior |
|-----------|----------|
| `rx = 0` or `ry = 0` | Treated as straight line to endpoint |
| Negative radii | Absolute value used |
| Start == End | Arc omitted entirely |
| Radii too small to reach endpoint | Both radii scaled up uniformly until they just reach |

The **radii auto-scaling** formula:
```
Lambda = (x1'^2 / rx^2) + (y1'^2 / ry^2)
If Lambda > 1: rx *= sqrt(Lambda), ry *= sqrt(Lambda)
```

The **full-circle impossibility** is particularly notable: since start == end causes the arc to be omitted, you literally cannot draw a complete circle with a single arc command. You must use two semicircular arcs. No center-parameterized API has this limitation.

---

## 6. Developer Critiques

### "Confusing as heck"

> "Arcs are **confusing as heck**. It took me a _long_ time to really build an intuition for what each parameter does."
> — Josh Comeau

> "It's my **least favorite command** because there are so many elements to it."
> — Myriam Frisano, Smashing Magazine

> "The current definition of an arc is **very powerful but too difficult for a lot of authors**."
> — Dirk Schulze, SVG Working Group member

> Developers find the SVG arc command **"incredibly unintuitive and befuzzling."**
> — Kelley van Evert

### The seven categories of pain

**1. Conceptual mismatch.** Developers think "draw an arc from 0 to 90 degrees around this center." SVG demands "draw an arc to this endpoint, on an ellipse with these radii, using flag 0 1." The mental model doesn't match the API.

**2. Parameter overload.** Seven parameters is cognitively expensive. Compare `C` (cubic bezier) which also has 6 coordinate values — but those are 3 intuitive control/end points. The arc's 7 parameters mix radii, angles (in degrees!), binary flags, and coordinates in a single command.

**3. The flag problem.** Two binary flags creating a 4-way disambiguation is "highly unintuitive." Developers must mentally simulate which of four arcs they want, then reverse-engineer the flag combination. The flags don't correspond to any natural geometric property that's easy to visualize.

**4. The full-circle impossibility.** A complete circle requires two arc commands. This is a direct consequence of endpoint parameterization and trips up every developer who tries `A r r 0 1 1 startX startY` expecting a full circle.

**5. Pedagogical overhead.** The number of interactive SVG arc explorers that exist on the web is itself evidence of the problem. No other path command needs a dedicated visualization tool to understand. Notable examples:
- [SVG Arc Explorer](https://svg-art.ru/?page=arc)
- [Understand SVG Arcs](https://github.com/waldyrious/understand-svg-arcs)
- Numerous CodePen and Observable notebooks

**6. Angle/coordinate mixing.** `x-rotation` is in degrees while everything else is in the coordinate space. This is the only place in the path `d` attribute where a degree value appears, breaking the otherwise uniform coordinate-based parameterization.

**7. Implementation burden.** The spec itself calls the conversion algorithm one of the "mathematically trickier parts." Libraries implementing SVG arc support need multiple trig calls, sign selections, and modular arithmetic. This complexity leaks into any tool that needs to manipulate arcs programmatically (animation, morphing, boolean operations).

---

## 7. How Other APIs and Libraries Fix It

### Canvas API

```js
// Circular arc — center parameterization
ctx.arc(cx, cy, radius, startAngle, endAngle, counterclockwise)

// Elliptical arc — center parameterization
ctx.ellipse(cx, cy, radiusX, radiusY, rotation, startAngle, endAngle, counterclockwise)

// Tangent arc — defined by two tangent lines and radius
ctx.arcTo(x1, y1, x2, y2, radius)
```

All center-based. Angles in radians. One boolean for direction instead of two flags. No endpoint coordinates needed — the current point and center define everything. `arcTo` offers a third paradigm (tangent-based) that's ideal for rounded corners.

### D3.js (`d3-shape`)

```js
const arc = d3.arc()
  .innerRadius(80)
  .outerRadius(100)
  .startAngle(0)
  .endAngle(Math.PI / 2)
  .cornerRadius(5);
```

Developers **never see SVG arc flags**. D3 translates center-parameterized, semantically meaningful properties into SVG path strings internally. This is the dominant API for data visualization arcs.

### Paper.js

Users filed issues requesting `arcAround(center, sweepAngle)` because the existing three-point arc API was unintuitive. Quote from a user: "I've never really wanted to draw an arc by specifying three points, and from the looks of the source, **neither does the computer.**"

### Raphael.js / Snap.svg

Rewrote arc handling to accept center-angle parameters. The internal `arc2curve` function converts to cubic beziers, bypassing SVG arcs entirely for reliable rendering.

### SVG 2 Tried and Failed

The SVG Working Group proposed adding Canvas-aligned commands to SVG 2:
- `arc(x, y, r)` — circular arc to center
- `ellipse(x, y, rx, ry, rotation)` — elliptical arc to center
- `arcTo(x1, y1, x2, y2, r)` — tangent arc

These **never made it into the final specification**. The original endpoint-based `A`/`a` remains the only arc command in SVG.

---

## 8. What Pathogen Already Has

The project has already built several abstractions over the raw arc command:

| Function | Parameterization | Context-Aware | Notes |
|----------|-----------------|---------------|-------|
| `arc(rx, ry, rot, la, sw, x, y)` | Raw endpoint | No | Thin wrapper, all 7 params exposed |
| `arcFromCenter(dcx, dcy, r, start, end, cw)` | Center + angles | Yes | Emits `L` if position doesn't match start |
| `arcFromPolarOffset(angle, r, sweep)` | Polar + sweep | Yes | Guarantees no extra `L`, ideal for chains |
| `tangentArc(r, sweep)` | Tangent continuation | Yes | Requires prior heading, enables smooth chains |
| `radialWedge(iR, oR, from, to, cr)` | Composite shape | No | Annular sector with fillets, all relative commands |

**Abstraction spectrum:**
```
Raw SVG          Center-based         Direction-based       Composite shapes
  arc()    →   arcFromCenter()    →    tangentArc()     →    radialWedge()
(7 params)    arcFromPolarOffset()      (2 params)          (5 params)
               (3 params)
```

The existing abstractions address the center-vs-endpoint problem well for circular arcs. The gap is in **elliptical** territory — there is no `ellipticalArcFromCenter`, no elliptical `tangentArc`, and no elliptical composite shape.

---

## 9. Implications for Pathogen's Arc API

The SVG arc command's limitations suggest several design principles for a richer API:

### What to preserve
- **Endpoint parameterization as an escape hatch**: The raw `arc()` function should remain for power users and generated code. It's the only way to express certain edge cases.
- **Composability with path context**: The context-aware pattern (heading tracking, tangent chaining) is the project's strongest arc abstraction.

### What to address
- **No elliptical center-based function**: `arcFromCenter` and `arcFromPolarOffset` are circular only. An elliptical equivalent would fill the most obvious gap.
- **No sweep-angle-based elliptical arc**: Expressing "draw an elliptical arc sweeping 90 degrees" is currently impossible without manually computing endpoints and flags.
- **Composite shapes limited to circular**: `radialWedge` uses circular arcs. Elliptical wedges, sectors, and annuli have no high-level function.
- **The flag problem persists in raw `arc()`**: Users who drop to the low-level API still face the flag disambiguation problem. An intermediate abstraction that accepts angles but emits `A` commands could help.

### Design questions for API investment
1. Should elliptical arcs follow the same 3-tier pattern (raw, center-based, tangent-based)?
2. Should there be an `ellipse()` shape function (like `circle()` exists) as a starting point?
3. How should rotation interact with the context-aware functions? (Transform vs. parameter)
4. Should composite shapes (`ellipticalWedge`, `ellipticalSector`) share a common geometry engine?

---

## Sources

- [W3C SVG2 — Arc Commands (Section 9.3.8)](https://www.w3.org/TR/SVG2/paths.html#PathDataEllipticalArcCommands)
- [W3C SVG2 — Out-of-Range Parameters (Section 9.5.1)](https://www.w3.org/TR/SVG2/paths.html#ArcOutOfRangeParameters)
- [W3C SVG2 — Implementation Notes (Sections B.2.1-B.2.5)](https://www.w3.org/TR/SVG2/implnote.html)
- [MDN — SVG Tutorial: Paths](https://developer.mozilla.org/en-US/docs/Web/SVG/Tutorial/Paths)
- [Smashing Magazine — Mastering SVG Arcs](https://www.smashingmagazine.com/2024/12/mastering-svg-arcs/)
- [GitHub — understand-svg-arcs](https://github.com/waldyrious/understand-svg-arcs)
- [MDN — Canvas arc()](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/arc)
- [MDN — Canvas ellipse()](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/ellipse)
- [Observable — SVG Elliptical Arc to Canvas Path2D](https://observablehq.com/@awhitty/svg-2-elliptical-arc-to-canvas-path2d)
- [D3.js — d3-shape arc](https://d3js.org/d3-shape/arc)
