# Completion Engine Coverage Audit

**Date**: 2026-04-06
**Context**: During QA of the Lezer migration, we discovered that the language-services completion engine has significant gaps relative to what the runtime actually supports. The completion data in `completion-data.ts` is a static, manually maintained list with no connection to the evaluator — every runtime addition requires a separate, manual completion-data update that has frequently been missed.

## Problem Statement

The completion engine provides an incomplete and sometimes inaccurate picture of the language's API surface. Users typing `tLayer.` (a TextLayer reference) get no member suggestions. Users expecting `GridPatternType.Shape` get no enum completions. Some advertised completions don't exist at runtime.

## Audit Findings

### 1. Enums — All 13 Missing

The runtime defines 13 enums in `evaluator/index.ts` (BUILTIN_ENUMS, ~line 283). None appear in completions.

| Enum | Values |
|------|--------|
| Easing | Linear, Smoothstep, EaseIn, EaseOut, EaseInOut |
| Interpolation | SRGB, OKLCH, LinearRGB |
| SpreadMethod | Pad, Reflect, Repeat |
| GradientUnits | ObjectBoundingBox, UserSpaceOnUse |
| Direction | CW, CCW |
| ConicSpread | Clamp, Repeat, Transparent |
| InnerFill | Transparent, TransparentBlend, Center |
| TopoMethod | Distance, Laplace |
| BBoxAnchor | TopLeft, Top, TopRight, Right, BottomRight, Bottom, BottomLeft, Left, Center |
| GridPatternType | Shape, Dot, Intersection, Partial |
| HexagonOrientation | Edge, Vertex |
| VerticalAnchor | Descender, Baseline, Midline, CapHeight |

**Impact**: Users cannot discover or autocomplete enum values. Grid functions, gradient constructors, and many other stdlib functions accept enum arguments but completions don't reflect this.

### 2. Layer References — No Member Completions

Runtime supports on all layer types (PathLayer, TextLayer, GroupLayer):
- `.apply { }` — block syntax to route commands
- `.name` — layer name (string)
- `.styles` — style block

PathLayer and GroupLayer additionally support:
- `.ctx` — path context object

GroupLayer additionally supports:
- `.append(layer)` — add child layer

**No member completion sets exist for any layer type.**

### 3. Point Methods — Gaps and Mismatches

| Method | Completions | Runtime | Issue |
|--------|------------|---------|-------|
| `translate(dx, dy)` | Yes | Yes | OK |
| `rotate(angle, cx?, cy?)` | Yes | `rotate(angle, origin)` | **Signature mismatch** — runtime takes a Point, not cx/cy |
| `scale(sx, sy?, cx?, cy?)` | Yes | **Does not exist** | **Phantom completion** |
| `distance(other)` | Yes | `distanceTo(other)` | **Name mismatch** |
| `lerp(other, t)` | Yes | Yes | OK |
| `midpoint(other)` | Yes | Yes | OK |
| `polarTranslate(angle, dist)` | **Missing** | Yes | Not discoverable |
| `distanceTo(other)` | **Missing** | Yes | Not discoverable |
| `angleTo(other)` | **Missing** | Yes | Not discoverable |
| `offset(other)` | **Missing** | Yes | Not discoverable |

### 4. Array Methods — Completions That Lie

These are listed in completions but **do not exist** at runtime:
- `filter`, `flatMap`, `includes`, `indexOf`, `join`, `reverse`, `sort`

Actual runtime array methods: `push`, `pop`, `shift`, `unshift`, `empty`, `map`, `reduce`, `mapSlice`, `slice`

(`mapSlice` is missing from completions.)

### 5. String Methods — Minor Mismatch

- `split()` takes no args at runtime (splits into characters), but completions show `split(sep)`

### 6. Color Namespace — Completely Missing

Runtime supports (`evaluator/index.ts`, ~line 3682):
- `Color.mix(c1, c2, t)` — interpolate between colors
- `Color.palette(color, n)` or `Color.palette(c1, c2, n)` — generate palette
- `Color.lightDark(light, dark)` — theme-aware color

**No Color member completions exist.**

### 7. Other Missing Member Completions

| Type | Missing Members | Runtime Location |
|------|----------------|-----------------|
| PolarVector | `.turn(delta)`, `.scale(factor)`, `.mirror()` | ~line 3205 |
| Cycler | `.pick()` | ~line 3230 |
| SVGFragment | `.insert()` | ~line 3244 |
| ProjectedPath | `.get()`, `.tangent()`, `.normal()`, `.partition()`, `.reverse()`, `.boundingBox()`, `.offset()`, `.intersects()` | ~line 2551 |
| Object | `.has()` | ~line 3859 |

### 8. PathBlock — Mostly Complete

Two properties missing from completions:
- `.contours` — returns array of contours
- `.subPathCommands` — returns array of command objects

### 9. Signature Help — No Enum Context

`signature-help.ts` extracts parameter signatures from completion detail strings. Since no enum types are documented in those strings, functions like `grid()` show generic parameters without indicating that the first argument should be a `GridPatternType` value.

## Root Cause

The completion data is a static artifact maintained independently from the runtime. There is no mechanism to detect drift. The data was initially extracted from the playground's legacy `codemirror-setup.ts` completions, which were also hand-maintained.

## Recommendation

See `completion-engine-generation-plan.md` for the proposed solution: generate completion data from annotated runtime source, making the evaluator the single source of truth.
