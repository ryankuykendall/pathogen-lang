# `variableOffset` — Design Note

*Internal design brief. Captures the decisions reached across the July 2026
brainstorming sessions so an implementation session can start from a clean spec.
This is **not** published `docs/` — user-facing docs are written as the first step
of implementation, separately.*

**Status:** design agreed; not yet implemented.
**Companion:** [`../curve-continuity/g0-g1-g2-primer.md`](../curve-continuity/g0-g1-g2-primer.md)
(continuity concepts + the `CurveContinuity` naming rationale).

---

## 1. Objective

Add PathBlock methods that trace a **new** path *alongside* a reference
("spine") PathBlock, using a gradient-stop-like syntax. Each stop names a
position along the spine and a perpendicular (normal) offset distance; the
projected points are connected into a curve whose joins the user controls
per-knot via `CurveContinuity` (sharp G0 / smooth G1 / flowing G2).

Two forms:

- **`variableOffset`** — one profile → a new **open** PathBlock.
- **`compoundVariableOffset`** — two profiles (one on each side) that can be
  closed with end caps → a **closed** PathBlock (a variable-width ribbon), or
  left open (two unconnected profiles) if caps are omitted.

The existing `offset(distance)` produces only a *uniform* parallel curve at one
fixed distance. `variableOffset` generalizes it to **variable** distances that
change from stop to stop.

---

## 2. The core model — Model A ("rail-guided points")

**Decided:** the spine only *positions and orients* control points. Its own
arcs and lines do **not** appear in the output.

For each stop at arc-length fraction `t`:
1. Sample the spine → `{ point, tangent }` at `t`.
2. Normal = `tangent ± 90°` (sign per the existing `offset()` convention).
3. Knot = `point + normalOffset · normal`.

The output is a **fresh curve through the knots**. Between two stops there is no
"offset value" to interpolate — there is only the interpolating curve itself.
This is what makes `CurveContinuity` have a clean, unambiguous meaning: the knots
are free points, so nothing fights the continuity constraint.

### Rejected alternative — Model B ("variable-distance parallel curve")

An output that *hugs* the spine's shape with a ramping perpendicular distance.
Rejected for v1: variable-distance offsetting of arbitrary curves is a genuinely
hard geometry problem, and it muddies what "continuity" means (the spine already
imposes a shape). If ever wanted, it is a separate feature, not a mode of this one.

---

## 3. Public API (sketch — subject to grammar/naming polish at implementation)

```pathogen
// Simple: one profile, open path
let edge = spine.variableOffset() {|go, pb|
  go.startTangent(PolarVector(90deg, 8));      // optional endpoint handle
  go.stop(10%, 5,  CurveContinuity.G2);
  go.stop(50%, 12, CurveContinuity.G2);
  go.stop(90%, 20, CurveContinuity.G2);
  go.endTangent(PolarVector(0deg, 6).turn(pb.tangent(90%).angle));  // optional
};

// Compound: two profiles, closeable into a ribbon
let ribbon = spine.compoundVariableOffset() {|go, pb|
  go.startCap(Cap.round());                    // optional; omit → open
  go.stop(10%,  5, CurveContinuity.G0,  -10, CurveContinuity.G0);
  go.stop(50%, 10, CurveContinuity.G1,   -5, CurveContinuity.G1);
  go.stop(90%, 20, CurveContinuity.G2,  -20, CurveContinuity.G2);
  go.endCap(Cap.tapered(12, CurveContinuity.G2));
};
```

Both return a `PathBlockValue`, so the result composes with every existing
PathBlock operation (`+`, `.drawTo`, `.boundingBox`, etc.).

### `time` argument
`number | Percent`, interpreted as an **arc-length** fraction of the spine
(0 = start, 1 / 100% = end). Arc-length sampling already exists, so this is free.

---

## 4. Decisions

### 4.1 No coordinate arguments anywhere
- Simple form has **no** `.start(x,y)` / `.end(x,y)`. The path spans first-stop →
  last-stop. Lead-ins / lead-outs are done by **composing PathBlocks**
  (`@{ m ax ay; … } << edge`), which the language already supports. Keeping the
  block to one job (sample → place → interpolate) beats a second, coordinate-based
  mental model inside the same closure.
- Compound **caps carry no coordinates** — the two endpoints are already fully
  determined by the first/last stop's two offsets. The user picks only a *style*.
  Omitting a cap yields the open "two unconnected profiles" case.

### 4.2 Naming
- `variableOffset` / `compoundVariableOffset`. Deliberately **not** "gradient*"
  (collides with the color `Gradient` constructs).
- **No `ribbon` alias** *(resolved — see §6.1)*. One concept, one name. `ribbon`
  is semantically wrong when caps are omitted (the compound form is then two
  *open, unconnected* profiles, not a ribbon), and the codebase has no precedent
  for cute method aliases (`offset`, `partition`, `boundingBox`, `drawTo` are all
  single descriptive names). An alias would also split discoverability across two
  completion entries for one operation. Can be added non-breakingly later if a
  real ergonomic need appears.

### 4.3 Continuity construction (`CurveContinuity { G0, G1, G2 }`)
Per-knot continuity flag drives curve construction:
- **G0** — hard corner; the spline **breaks** here (position continuity only).
- **G1** — tangent-continuous; tangent from both neighbors (Catmull-Rom / Hermite).
- **G2** — curvature-continuous; **clamped cubic spline** (tridiagonal solve) over
  each maximal run of non-G0 knots, broken at G0 knots.

**Clamped, NOT natural** (important — resolves a §4.3/§4.4 tension): a *natural*
spline pins end curvature to zero and cannot honor a specified end tangent. §4.4
requires the endpoints to use a *specified first derivative* (spine-derived, or a
`PolarVector`), with end curvature left free. That is by definition a **clamped**
spline. The interior tridiagonal rows are identical to the natural case; only the
two boundary rows differ (clamped encodes the end tangent; natural zeroes end
curvature). Implement clamped.

Algorithm shape: split the knot sequence at G0 knots into spans. Within a span,
if all interior knots are G1, a local Hermite/Catmull-Rom tangent pass suffices;
if any are G2, solve the clamped tridiagonal system for that span. Use
**centripetal/chord-length parameterization** (not uniform) for both the
Catmull-Rom tangents and the tridiagonal solve — uniform overshoots on unevenly
spaced knots and worsens the §4.6 cusp/self-intersection risk. Emit every segment
as a **cubic Bézier** (Hermite→Bézier: control points at `p0 + m0/3`,
`p1 − m1/3`). This is the hard core and the main implementation risk — build and
visually verify happy-path construction *first*.

> **Mixed G1/G2 within one span (deferred, conscious):** when a span contains both
> G1 and G2 knots, "solve the tridiagonal for the span" effectively upgrades the G1
> knots to G2. v1 happy-path tests use uniform continuity per span, so this doesn't
> bite the spike — but it is a real under-specification to revisit, not a silent
> decision.

### 4.4 Endpoint tangents
- **Default = spine-derived**: with no explicit handle, the first/last knot's
  tangent = the spine's own tangent at that stop's `time` (`pb.tangent`). Chosen
  because it is zero-config and maximally on-brand for Model A — the rail that
  placed the point also orients how the curve leaves it.
- **Override** = `go.startTangent(v)` / `go.endTangent(v)` where `v` is a
  **`PolarVector`** (reused as-is — its type doc literally says "for defining
  bezier control points"). `distance` encodes tension, `angle` the direction.
  Angle is **absolute** by default; spine-relative is free via
  `.turn(pb.tangent(t).angle)`. The handle only bites on a **G1/G2** endpoint
  (a G0 endpoint is a corner — no tangent to clamp).
- The endpoint boundary condition is **always a first-derivative (tangent)
  condition** — spine-derived by default, or clamped via `PolarVector`. Endpoint
  *curvature* is left free (whatever the solve yields); there is intentionally no
  API to pin it in v1 *(resolved — §6.4)*.
- v1 is **endpoint-only**. Interior per-knot tangent overrides are deferred
  post-v1 *(resolved — §6.3)*; when they land they use a dedicated
  `go.tangent(time, PolarVector)` directive (parallel to `startTangent` /
  `endTangent`), keeping the `stop()` signature stable.

### 4.5 End caps — constructor values, not an enum
Caps carry parameters, so they are **constructor values**, matching the language's
`Marker()` / `Gradient()` idiom. Let `A`, `B` be the two profile endpoints at the
cap's stop, and "outward" the path direction beyond that stop.

| Cap | Factory | Geometry | Params |
|-----|---------|----------|--------|
| Butt | `Cap.butt()` | straight line A→B | none |
| Round | `Cap.round()` | semicircle, radius `|AB|/2` | none |
| Elliptical | `Cap.elliptical(projection)` | half-ellipse: cross semi-axis `|AB|/2`, along-path semi-axis `projection` | `projection` |
| Tapered | `Cap.tapered(length, continuity?)` | apex at `midpoint(A,B) + length·outward`; flanks A→apex→B | `length`; optional `CurveContinuity` |

Notes: `Round` is the symmetric case of `Elliptical`. `Tapered` **reuses**
`CurveContinuity` for its flanks (G0 = sharp point, G1/G2 = ogee). This establishes
a clean API rule worth stating in user docs: **enums for closed param-less choices;
constructor functions for parameterized ones.**

### 4.6 Self-intersection policy
- **v1: allow it.** Emit the mathematically true curve as-is. Self-intersection
  can only arise in the interpolating curve (loops/cusps when knots are close and
  offsets swing hard) — that is user-modeling, not an engine failure. Silently
  reshaping would violate the project's "don't change the user's design parameters"
  rule, and is consistent with how `offset()` already behaves.
- **Later, cheap:** an optional compile-time **warning** (log/diagnostic channel)
  when a segment–segment intersection is detected in the output. Informs without
  mutating.
- **Out of scope:** de-looping / boolean cleanup (that is a separate path-booleans
  feature and must not gate this one).

### 4.7 `pb : PathBlockRef` — minimal read-only surface
A convenience handle to the spine for querying inside the block. **Aligned with
the existing PathBlock sampling API** (names + return shapes) so users reuse what
they already know (decided 2026-07-12 after agentic review):
- `pb.length` → number (total arc length)
- `pb.get(time)` → Point
- `pb.tangent(time)` → `{ point, angle }` (angle in radians)
- `pb.normal(time)` → `{ point, angle }` (angle in radians)
- `pb.vertices` → list of points

Read-only; purely for computing offsets/handles relative to the spine.
(Earlier drafts used `pointAt`/`tangentAt`/`normalAt` returning scalars — rejected
for diverging from the shipped `get`/`tangent`/`normal` sampling methods.)

### 4.8 Compound traversal / winding order
A closed compound ribbon is always assembled as the standard stroke-outline
traversal, in a **fixed, sign-independent order**:

1. **Profile 1** — the *first* `(normalOffset, continuity)` pair of each stop —
   traversed forward: start → end.
2. **end cap** — bridges profile-1-end → profile-2-end (the `Cap.*` value from
   `endCap`).
3. **Profile 2** — the *second* pair — traversed backward: end → start.
4. **start cap** — bridges profile-2-start → profile-1-start (from `startCap`).
5. `z` — close.

Omitting a cap leaves that end open (the "two unconnected profiles" case).

We fix the *order* deterministically but do **not** auto-normalize the winding
*direction*: whether the result winds CW or CCW falls out of the offset signs,
which are the user's geometry — normalizing them would violate the "don't change
the user's parameters" rule. Consequently, fill appearance depends on the offset
signs and the chosen fill-rule. Offsets on the *same* side (both positive or both
negative) yield a self-intersecting ribbon — allowed per §4.6, warned later.

---

## 5. Reuse map (for implementation)

Most primitives already exist — the new code is the **spline construction + caps**,
not the sampling/normal machinery.

- **`src/evaluator/sampling.ts`**
  - `samplePathAtFraction(cmds, t) → { point, tangent }` — **arc-length** sampling.
    Directly powers stop placement; normal = tangent ± 90°.
  - `calculatePathLength`, `partitionPath` — total length / even sampling.
    Back the `pb.length` / `pb.get` / `pb.tangent` / `pb.normal` surface.
- **`src/evaluator/path-transforms.ts`**
  - `offsetCommands(cmds, distance)` — the current uniform `offset()`. Establishes
    the left-hand-normal `(dy, −dx)` (y-down) **sign convention** to reuse for
    "which side is positive," and shows the miter-join / miter-limit handling.
- **`src/evaluator/types.ts`**
  - `PolarVectorValue { angle, distance }` + `PolarVector(a, d)` constructor with
    `.turn / .scale / .mirror`. Reused verbatim as the endpoint tangent handle.
- **PathBlock method dispatch** lives in `src/evaluator/index.ts` (see the existing
  `partition` / `offset` cases ~2377 / ~2441) — the new methods slot in beside them
  and return a `PathBlockValue`.

### Known limitation — `--annotated` debug mode
`variableOffset` / `compoundVariableOffset` work in all three user surfaces (CLI,
playground, VS Code preview — all use the main evaluator). They are **not** wired
into the parallel `annotated.ts` evaluator (`--annotated` / `compileAnnotated`),
which has a reduced value system (it lacks `PolarVectorValue`, the `go` builder,
and `Cap`). Using them in `--annotated` mode raises a clear, explicit error rather
than producing wrong output. Full annotated support is deferred (debug-only mode;
disproportionate duplication for the value). Decided 2026-07-12.

### Implementation-phase scope (NOT this note)
Because the result is a PathBlock, it flows through the existing PathBlock render
path — but per `.claude/CLAUDE.md` the new methods/constructors/enum still require:
`docs/<feature>.md` first (+ `DOC_FILES`), grammar/AST if block syntax is new,
evaluator, `completion-data.ts` + `hover.ts`, `BUILTIN_ENUMS` for `CurveContinuity`,
tests, and **three-surface parity** (CLI / playground / VS Code). All later.

---

## 6. Resolved decisions (were open)

All four threads that were open at first-draft are now resolved; each entry points
to its authoritative home in §4.

1. **`ribbon` alias → dropped.** One concept, one name; semantically wrong for the
   uncapped (open) case; no codebase precedent for aliases. Non-breaking to add
   later. → §4.2.
2. **Compound traversal / winding order → fixed, sign-independent order** (profile 1
   forward → end cap → profile 2 backward → start cap → close); winding *direction*
   deliberately not normalized. → §4.8.
3. **Interior per-knot tangent overrides → deferred post-v1**; when added, use a
   dedicated `go.tangent(time, PolarVector)` directive (v1 is endpoint-only). → §4.4.
4. **G2 endpoint curvature → won't do in v1.** Endpoint condition is always a
   tangent (first-derivative) condition; curvature left free, no API to pin it. → §4.4.

---

## 7. Suggested build order (when implementation starts)

1. `docs/variable-offset.md` (contract-first, per project lifecycle) + `DOC_FILES`.
2. Failing tests from the doc examples.
3. Stop sampling → knot projection (reuses `samplePathAtFraction`).
4. Curve construction: G0 breaks → G1 Catmull-Rom → G2 tridiagonal solve. **Visual
   verify here — highest risk.**
5. Endpoint tangents (spine-derived default; `PolarVector` override).
6. Compound: second profile + `Cap.*` constructors + closing/winding.
7. `pb` read-only surface.
8. Optional self-intersection warning.
9. Language-services (completions/hover/enum) + three-surface parity + full suite.
