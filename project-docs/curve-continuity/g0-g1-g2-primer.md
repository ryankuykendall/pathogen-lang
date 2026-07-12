# G0 · G1 · G2 — A Primer on Curve-Smoothing Joins in 2D

*Internal primer for feature planning. Audience: someone who needs a working
mental model of continuity before designing a smoothing/join feature for
Pathogen. ~2 pages.*

---

## The problem: joining two curves

Almost every non-trivial path is built from **segments** — lines, arcs, Bézier
pieces — stitched end to end. The quality of a path is largely decided at the
**joins** between those segments. "How smooth is this join?" has a precise
answer, and it comes in levels: **G0, G1, G2** (and beyond).

The `G` stands for *geometric continuity* — a property of the **shape of the
curve as a set of points**, independent of how fast you travel along it.

### Parametric (Cⁿ) vs. geometric (Gⁿ) continuity — the one distinction to keep

A curve is a function `P(t)` of a parameter `t`. There are two ways to ask
"is the join smooth?"

- **Cⁿ (parametric continuity):** the derivative *vectors* match up to the
  nth order. `C1` means `P'` (velocity, direction **and** speed) is identical
  on both sides.
- **Gⁿ (geometric continuity):** only the **geometry** must match — tangent
  *direction*, then curvature — while the parameter is allowed to run at a
  different speed on each side.

`Gⁿ` is the **weaker, more permissive** condition, and it is almost always the
one you actually care about for *shape*. A curve can look perfectly smooth to
the eye (G-continuous) while being parametrically discontinuous (a "speed bump"
in `t` that no one can see). For a drawing tool, **Gⁿ is the right target**;
Cⁿ mostly matters when the parameter is time (animation, motion paths).

> Rule of thumb: `Cⁿ ⟹ Gⁿ`, but not the reverse. G continuity buys you visual
> smoothness without over-constraining the parametrization.

---

## The three levels

### G0 — positional continuity ("they touch")

The endpoints coincide: the last point of segment A equals the first point of
segment B.

- **Constraint:** `A(1) = B(0)`
- **What you see:** the path is connected, but a **corner / kink** is allowed.
- **Use it for:** intentional corners — rectangles, arrowheads, polygons,
  anywhere a sharp vertex is the design.

```
   A
    \
     •      ← G0: connected, but a visible corner
    /
   B
```

### G1 — tangent continuity ("no kink")

Endpoints meet **and** the two segments leave/arrive in the **same tangent
direction** (unit tangents are equal). Speed may differ.

- **Constraint:** `A(1) = B(0)` and `Â'(1) = B̂'(0)` (unit tangents equal —
  the tangent vectors are parallel and point the same way).
- **What you see:** no corner. The curve flows through the join with no abrupt
  change of heading. **Curvature may still jump** — the curve can go from
  gently bending to sharply bending instantly.
- **Use it for:** most "make this smooth" cases. It's what the SVG smooth-curve
  commands (`S`, `T`) give you, and what a naive Catmull-Rom spline gives you.

```
      ___
   A /   •___ B     ← G1: same direction through the join,
                       but the bend can still change abruptly
```

### G2 — curvature continuity ("smooth flow")

Everything in G1, **plus** the **curvature** matches at the join — same
radius of curvature, same side.

- **Constraint:** G1, and additionally `κ_A(1) = κ_B(0)` with the centers of
  curvature on the same side (the curvature *vectors* match).
- **What you see:** the *rate of bending* is continuous. No visible "tightening"
  at the seam. This is the level the eye reads as **genuinely fluid** —
  reflections glide across it without a break.
- **Use it for:** aesthetic / "Class A" work — typography, industrial-design
  silhouettes, highway and rail alignment (Euler spirals / clothoids), smooth
  motion paths where curvature = comfort.

```
   A ~~~~~•~~~~~ B    ← G2: bending rate continuous — the flow
                        through the join is seamless
```

---

## Quick summary

| Level | Meets? | Same tangent dir? | Same curvature? | Visual result | Typical use |
|-------|:------:|:-----------------:|:---------------:|---------------|-------------|
| **G0** | ✅ | — | — | corner allowed | sharp vertices |
| **G1** | ✅ | ✅ | — | no kink; curvature can jump | general smoothing |
| **G2** | ✅ | ✅ | ✅ | seamless flow | aesthetic / precision |

Beyond: **G3** matches the *rate of change* of curvature — used in the highest-end
surface work; rarely needed for 2D drawing.

---

## The math (just enough)

For a curve `P(t)` in 2D:

- **Tangent direction:** `T̂ = P'(t) / |P'(t)|`
- **Curvature:** `κ = |P'(t) × P''(t)| / |P'(t)|³`
  (the 2D cross product `x'y'' − y'x''`; `κ = 1/R`, where `R` is the radius of
  the best-fitting circle. Sign of the cross product tells you which side the
  curve bends toward — that sign must also match for true G2.)

So the ladder is: **G0** matches position, **G1** matches the *direction* of
the 1st derivative, **G2** matches a *combination* of 1st and 2nd derivatives
(via κ) — always up to a positive scale factor on the parameter, which is
exactly what makes it "geometric" rather than "parametric."

### Bézier joins — the control-point geometry

Because Pathogen paths compile to SVG cubic/quadratic Béziers, the conditions
turn into simple statements about **control points**. For a cubic with control
points `P0 P1 P2 P3`, the tangent at the start is along `P1−P0` and at the end
along `P3−P2`.

Join cubic **A** (`…, A2, A3`) to cubic **B** (`B0, B1, …`) at the shared point
`J = A3 = B0`:

- **G0:** `A3 = B0`. (share the point)
- **G1:** `A2`, `J`, `B1` are **collinear**, with `B1` on the far side of `J`.
  (the incoming and outgoing control legs point along one line)
- **C1:** G1 **and** the two legs are **equal length** (`|J−A2| = |B1−J|`).
  The SVG `S`/`T` "smooth" commands do exactly this: they **reflect** the
  previous control point through `J`, giving you C1 (hence G1) for free.
- **G2:** G1 **and** the endpoint curvatures agree. For a cubic, the curvature
  at an endpoint is `κ = (2/3) · h / a²`, where `a` is the length of the first
  control leg and `h` is the perpendicular distance of the next control point
  from that leg. Matching κ across the join constrains the placement of the
  *second* control point on each side — which is why G2 usually needs a
  **solver / spline formulation** rather than hand-placed handles.

```
        A2                 B1
          \       J        /
           •------•------•        G1/C1: A2, J, B1 collinear
                                   C1 also wants the two legs equal length
```

---

## Relevance to Pathogen / SVG (for planning)

What SVG (and therefore our compile target) gives natively:

- **`L`, polygons** → G0 corners.
- **`C`/`Q` with hand-placed handles** → whatever you place (usually G0 or G1).
- **`S`/`T` smooth commands** → automatic **C1/G1** by control-point reflection.
- **`A` (arc)** → constant curvature within the arc, but arc↔line and arc↔arc
  joins are only **G1** unless radii are matched (curvature jumps → not G2).
- **No native G2.** SVG has no primitive that guarantees curvature continuity.
  To ship G2 smoothing we must **construct** it.

Ways to construct G2 (design options to weigh):

1. **Cubic B-splines** — naturally **C2** (hence G2) everywhere; convert to
   Bézier segments for SVG output. Clean, well-understood, doesn't interpolate
   its control points (curve doesn't pass through them).
2. **G2 Hermite / curvature-matched Bézier fitting** — interpolates given
   points and solves for handles that match curvature at each join. More work,
   passes through the points.
3. **Clothoid / Euler-spiral segments** (curvature linear in arc length) —
   the gold standard for "flowing" G2 transitions; approximated by Béziers for
   SVG. This is what CAD/road design uses.
4. **Corner filleting** — replace a G0 corner with a G1 arc (easy) or a G2
   clothoid fillet (nicer) of a given radius.

### Planning takeaways

- Decide the **target level per feature**: a "smooth path through points" tool
  probably wants at least G1, ideally a G2 option; a "fillet corners" tool is a
  G1-arc vs. G2-clothoid choice.
- **G1 is cheap** (reflection / collinear handles); **G2 needs a solver or a
  spline basis**. Budget accordingly.
- Expose the level as an **explicit, user-visible choice** ("corner / smooth /
  flowing", or literally `G0/G1/G2`) rather than one magic "smooth" button —
  the levels have genuinely different looks and costs.
- Whatever we build compiles down to cubic Béziers; the interesting work is the
  math that *places the handles*, not the emit step.
