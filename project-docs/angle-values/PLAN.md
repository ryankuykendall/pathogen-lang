# First-Class Angle Values

## Context

Ryan hit the angle-unit variable trap in real code: `let contourHueShift = calc((haloIndex / 16) * 1.5pi); c.hueShift(contourHueShift)` silently shifted ~4.7° (radians read as degrees) while the inlined form shifted correctly. Root cause: units are consumed at the written expression (`convertUnitSuffix`), and `inferUnit`/`angleArgToDegrees` never pierce variables (invariant from commit `a34e313`). Ryan decided the intuitive model is right: **angle literals (`90deg`, `1.5pi`, `2rad`) should evaluate to a first-class Angle runtime value** that survives variables, arrays, and function calls, and coerces to radians in numeric contexts. One rule: an angle is an angle wherever it flows.

Decisions confirmed by Ryan:
- **Display**: Angle renders in its original unit everywhere (templates, `log()`, debug): `"90deg"`, `"0.5pi"`, `"1.5708rad"`. Programs needing the bare number use `.rad`/`.deg`.
- **`Color(L, C, H)`**: Angle H auto-converts to degrees (fixes the documented asymmetry at docs/syntax.md:1072). Bare numbers stay degrees; `.hue` still returns plain degrees.
- Style blocks: Angle values coerce to `formatNum(radians)` — **preserves documented** `rotate: 0.25pi` / `rotate: 45deg` usage (docs/layers.md:699,721) byte-for-byte. (Overrode the "no CSS form" error idea.)
- Members: `.deg`, `.rad`, `.turns` (no `.unit` — YAGNI).
- The deferred LS warning (project-docs/color-angle-units/FOLLOW-UPS.md §1) becomes obsolete — the trap no longer exists.

## Representation

```ts
// src/evaluator/types.ts, next to BooleanValue (:70 — the precedent)
export interface AngleValue { type: 'AngleValue'; radians: number; unit: 'deg' | 'rad' | 'pi'; }
```

New shared module `src/evaluator/angle.ts` (precedent: struct-properties.ts / member-assign.ts are shared by both evaluators):
- `isAngleValue(v)`, `angle(radians, unit)`
- `radiansToDegreesSnapped(rad)` — the `Math.round(deg * 1e10) / 1e10` snap moved verbatim from `angleArgToDegrees` (units.ts:126)
- `formatAngleForDisplay(a)` — `deg` → snapped degrees + `"deg"`; `pi` → radians/π + `"pi"`; `rad` → radians + `"rad"` (via `formatNum`)

`%` unit is orthogonal (pure ÷100 scalar) — untouched.

## Phase 1 — Docs + CHANGELOG (docs-first, hard project rule)

| File | Change |
|---|---|
| docs/syntax.md:1034 § Angle Units | Rewrite canonical rule: angle literals evaluate to a first-class Angle (radians inside, unit remembered); survives variables/arrays/calls; coerces to radians in numeric contexts. Invert :1069 "never looks inside a variable" (static mismatch check still literal-only — reword, keep). Document `.deg/.rad/.turns` and value-level arithmetic rules. |
| docs/syntax.md:196 | Update the two-layer statement — units are now a property of the value; static check remains write-shape-based. |
| docs/syntax.md:1072 | `Color(L,C,H)`: Angle H now auto-converts (behavior-change callout). |
| docs/color.md:155 | Invert the "Units do not survive a variable" callout; `deg()` demoted to convenience. |
| docs/gradients.md:232,244 | ConicGradient from/to accept Angle-carrying variables; bare-number-literal strictness unchanged. |
| docs/stdlib.md:28 | `deg()`/`rad()` demoted from escape hatch to convenience. |
| docs/layers.md, filters.md, markers.md | One-line notes: rotate/orient/filter-angle slots accept Angle values. |
| project-docs/color-angle-units/FOLLOW-UPS.md | Mark §1 obsolete (superseded by this feature). |
| CHANGELOG.md | Behavior-changes list (below). |

Copy this plan to `project-docs/angle-values/PLAN.md` at implementation start (artifact-preservation convention). Verify docs render: `npm run build:docs`. Docs go through agentic review (content-reviewer) per project rule.

## Phase 2 — Failing tests first

- **tests/color.test.ts** (extend `'angle-unit arguments'` matrix :424): **invert the pinned test** "unit is lost through a variable" → `let turn = 0.5pi; c.hueShift(turn)` shifts 90°; Angle through array element / fn param / fn return into hueShift; `Color(0.5, 0.15, 90deg).hue ≈ 90`; snap check `hueShift(30deg)` yields exact degrees (no float noise); confirm the rest of the a34e313 matrix passes unchanged (runtime propagation subsumes static inference — hand-traced: `calc(2*45deg)` → Angle; `calc(1pi/2pi*180)` → plain ratio → degrees; `calc(sin(0.5pi)*180)` → plain).
- **tests/evaluator.test.ts**: Angle in path args via variable (`let d = calc(90deg/2); M d 0` → 0.785…); arithmetic propagation (`a+a`, `-a`, `a % calc(2pi)` drops to number); Angle as comparison/ternary/loop-bound operand; member access `.deg/.rad/.turns`; template/log display `"90deg"`/`"0.5pi"`; style block `${ rotate: 90deg; }` byte-identical, angle variable in style value emits radians; sort() on Angle array.
- **tests/annotated.test.ts** (:254): parity mirrors of the key cases + a program pushing an Angle through template/path-arg/fn-arg/style asserting `not.toContain('[object Object]')`.
- **tests/errors.test.ts** (:471): existing pinned mismatch matrix runs unchanged; add non-angle slot still rejects (`Grid(90deg, …)` "must be a number").
- **tests/gradients.test.ts**: keep :889 pinned literal-strict message; add `let a = 135deg; g.from = a` → 2.356; Marker orient with Angle var.
- **tests/struct-properties.test.ts**: ANGLE descriptor, member access + destructuring.
- **tests/language-services/completion.test.ts**: `let a = 90deg;` → `a.` completes deg/rad/turns; keep :1397 hue-rotate snippet pin.
- **tests/filters.test.ts / markers.test.ts**: Angle accepted at Emboss/ElevationShadow/MotionBlur angle slots + Marker orient (emission numbers unchanged).

## Phase 3 — Core (types.ts, angle.ts, index.ts, shared modules)

1. types.ts: add `AngleValue` to interfaces + `Value` union (:21-61). New `src/evaluator/angle.ts`.
2. **Minting** — index.ts:1395 (`NumberLiteral` in `evaluateExpression`): deg/rad/pi → `angle(convertUnitSuffix(...), unit)`. **Leave path-arg literal fast paths (index.ts:7190, :7307) as raw numbers** — immediately serialized, byte-identical output.
3. **toNumber** (index.ts:514): add `if (isAngleValue(v)) return v.radians;` — covers BinaryExpression, UnaryExpression, comparisons, getNumericArgs.
4. **BinaryExpression** (index.ts:1470-1589), after unchanged `checkAngleUnitMismatch` (:1473), before generic numeric path — value-level propagation: `±`: either side Angle → Angle (plain number read as radians; unit from left-most Angle); `*`: one Angle → Angle, two Angles → plain number (radians²; static already rejects literal case); `/`: Angle/number → Angle, Angle/Angle → plain ratio, number/Angle → plain; everything else via toNumber. UnaryExpression `-` preserves Angle.
5. **Truthiness**: TernaryExpression :1465, IfStatement, loop bounds — route through toNumber (grep `truthValue` in both evaluators).
6. **Call plumbing**: plain-stdlib dispatch :7134-7135 and context-aware args :7121 — unwrap Angles in the args map (covers sin/cos/deg/rad + entire polar/tangent/arc family :7428-7731). User-fn params (:7164) bind raw — survives free.
7. **evaluatePathArg** (:7187-7298): in each of the 6 evaluating branches replace the boolean+number pair with `const n = toNumber(value); if (n !== undefined) return formatNum(n);`.
8. **Display**: `formatValueForDisplay` before the `String(val)` fallback (:5467) + log ladder (:6083) → `formatAngleForDisplay`.
9. **Style blocks** (`evaluateStyleBlockLiteral` :1207 area): Angle → `formatNum(radians)`, trusted — before the struct fallback. Also style function-arg resolver :1386.
10. **Color methods** (hueShift :4822, analogous :4854, splitComplementary :4895): Angle value → `radiansToDegreesSnapped(radians)`; plain number → degrees; else same throw. **Remove `angleArgToDegrees` call sites and delete the function** (units.ts:121).
11. **Color(L,C,H)** (:7052-7066): Angle H → snapped degrees; L/C/alpha via toNumber.
12. **struct-properties.ts**: `ANGLE = staticDescriptor('Angle', { deg, rad, turns })`; register `AngleValue` in DESCRIPTORS (:131-140).
13. **member-assign.ts** (shared): :98 ConicGradient from/to accept Angle (assign `.radians`; AST literal-strictness :89-96 untouched — pinned message); :260 Marker orient same; sweep file's numeric guards.
14. **typeof-guard sweep** (angle-semantic slots only): transform `.set` :2056-2060; Point.rotate :4085 / polarTranslate / angleTo; rotateAtVertexIndex :2732; PolarVector ctor :6140 + turn/mirror; filter angles :8682/:8689/:8756/:8872; PathBlock tangent/normal/partition/mirror/ellipticalFillet guards; **tspan/text rotation arg** (docs/layers.md:418 — third tspan arg is an angle). Policy: all other ~150 "must be a number" guards stay strict (non-angle slots reject Angles — documented).
15. **sort()** (:5324-5346): all-number check via toNumber (also fixes BooleanValue arrays).

## Phase 4 — Annotated evaluator parity (annotated.ts)

Same moves mirrored: Value union :156; minting :3172 (path-literal sites :609/:4769 stay raw); toNumber :148; **getNumericArgs :605-644 rewritten to use toNumber** (also fixes a pre-existing BooleanValue parity gap — note in commit); truthiness; stdlib dispatch :4701 + context-aware args :4694; evaluatePathArg :4766-4849 (six `String(value)` sites → toNumber+String); **both independent template formatters** (:3392-3418 incl. inner :3402/:3412, and `evaluateAnnotatedTemplateLiteral` :3544-3559) get `formatAngleForDisplay` rungs; style path :1063 → `String(radians)`; fn-call arg display :4720 (`args.map(String)`) → Angle rung; color methods :2679/:2711/:2752 + Color ctor same rewrite as index.

## Phase 5 — Language services + completion data

- **src/pathogen-api.ts**: `/** @type Angle */ interface PathogenAngle { deg; rad; turns }` (distinct name — the existing plain alias `AngleValue` :19-21 stays as parameter sugar, no collision). Run `npm run generate:completions`; commit regenerated file (`check:completions` pre-commit guards drift).
- **src/language-services/type-inference-ast.ts** (rules go here per src/language-services/CLAUDE.md, NOT type-inference.ts): `NumberLiteral` with deg/rad/pi unit → `'Angle'` (:146-147); `CalcExpression` → `'Angle'` when `inferUnit(expr.expression) === 'angle'` (:167-168, reuse units.ts `inferUnit`) so `let a = calc(0.5pi); a.` completes.
- Do NOT touch inlay-hints (regression surface). hover/diagnostics/formatter need no changes (diagnostics runs the real evaluator; formatter round-trips `${value}${unit}` syntactically).

## Phase 6 — Cleanup + verification

units.ts: delete `angleArgToDegrees` (dead); **keep** `convertUnitSuffix`, `checkAngleUnitMismatch` + `inferUnit` (pinned messages; inferUnit now also used by type-inference-ast), `hasAngleUnit` (member-assign AST check).

## [object Object] leak checklist (all must gain an Angle rung)

index.ts:5467 (formatValueForDisplay fallback), index.ts:6083 (log ladder), annotated.ts:3418, annotated.ts:3556, annotated.ts:3402/:3412 (template inner elements), annotated.ts:1063 (style path), annotated.ts:4766-4849 (six path-arg String calls), annotated.ts:4720 (fn-call arg display), index.ts:1207/:1386 (style serializer).

## Intentional behavior changes (CHANGELOG + doc callouts)

1. Angles survive variables/arrays/calls — `let turn = 0.5pi; c.hueShift(turn)` shifts 90° (was 1.57°). The point of the feature; pinned test inverted.
2. `Color(L,C,H)` with Angle H converts to degrees (was raw radians).
3. Template/log interpolation of an Angle displays `"90deg"`/`"0.5pi"` (was radians number). Use `.rad`/`.deg` for bare numbers.
4. ConicGradient from/to + Marker orient accept Angle-carrying variables (numerically identical).
5. sort() orders Angle (and boolean) arrays instead of erroring.
6. Angle×Angle via variables yields plain radians² (literal case still statically rejected); `%` and stdlib returns drop angle-ness.

Explicit non-changes: static mismatch error messages byte-identical (errors.test.ts:471 matrix); path output for existing programs byte-identical; style-block angle output byte-identical; `%` unit untouched.

## Risks

- **Render snapshots** (tests/render-snapshots.test.ts, byte-for-byte goldens): expected zero diffs (path literals keep fast path; style coercion identical; hueShift keeps the 1e10 snap). Any diff = bug, do not update snapshots. Run after Phase 3 and Phase 4 separately.
- **Annotated parity** is the biggest surface (two template formatters, raw typeof getNumericArgs). Shared angle.ts + member-assign.ts carry most weight; cross-channel-parity tests backstop.
- **Worker structured-clone**: AngleValue is a plain object and compile() fully serializes — no surface work (verified: CLI/playground/VS Code never see raw values).
- Annotated getNumericArgs toNumber switch also admits booleans — parity fix, call out in commit.

## Verification

1. Targeted per phase: `npx vitest run tests/color.test.ts tests/errors.test.ts tests/evaluator.test.ts` (P3); `tests/annotated.test.ts tests/cross-channel-parity.test.ts` (P4); `tests/language-services/` (P5); render-snapshots + gradients + struct-properties + filters + markers throughout.
2. `npm run build`, `npm run build:docs`, `npm run check:completions`; full `npm run test:run` before commit.
3. **Playground manual check with Ryan's original halo program**: `hueShift(contourHueShift)` must sweep hue up to 90°; no `[object Object]` anywhere; log shows unit-tagged values. (Do NOT run plain `npm run build:website` if dev:stack is running — API-base trap.)
4. Three-surface parity: identical program through CLI (`npm run cli`), `--annotated`, and playground; diff outputs.
5. code-reviewer agent + agentic review of docs before commit.
