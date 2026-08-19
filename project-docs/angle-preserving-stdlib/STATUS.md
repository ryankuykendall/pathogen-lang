# Angle-Preserving Stdlib Functions — STATUS

**Date:** 2026-08-19
**Origin:** User report — `glyphFontColor.hueShift(randomRange(-0.5pi, 0.5pi))` showed no visible hue variation (all 20 squares stayed #c00).

## Root cause

Stdlib dispatch flattened every `AngleValue` argument to bare radians and never re-wrapped the result (`src/evaluator/index.ts` stdlib call site + two mirrors in `annotated.ts`). `randomRange` therefore returned a bare number in `[-1.57, 1.57]`, which `.hueShift()` read as **degrees** — a ±1.57° shift, ~115× too small to see. This was the pre-AngleValue lossy behavior re-emerging across the stdlib call boundary ("angles survive variables" shipped earlier, but they did not survive stdlib calls).

A second, separate observation from the same report — `.lighten(randomRange(20%, 50%))` looking flat — is **not** this bug: `20%` is erased to `0.2` at the literal (no PercentValue type exists), and `lighten` adds an absolute OKLCH L delta clamped at 1.0, so mid/high-L bases saturate. Out of scope here; documented behavior.

## What shipped

- **`src/stdlib/angle-preserving.ts`** (new) — `ANGLE_PRESERVING_ARGS`, the single-source-of-truth contract: which functions are angle-transparent and which argument slots carry the value space. `abs [0]`, `min/max 'all'`, `lerp [0,1]`, `clamp [0,1,2]`, `map [3,4]` (output range), `normalizeAngle [0]`, `randomRange [0,1]`, `hashRange [1,2]`.
- **`src/evaluator/angle.ts`** — `callStdlibPreservingAngles(name, fn, rawArgs)`: unwraps Angle args to radians, calls, re-wraps a numeric result as an AngleValue when a relevant arg was an Angle (display unit from the first such arg). Non-number results pass through untouched.
- **Wired at all 3 plain-stdlib dispatch sites** (`index.ts` expression call; `annotated.ts` expression call + bare-statement call). Context-aware dispatch intentionally unchanged (geometry consumers; `heading()` documented plain radians). Angle-*producing* fns (`atan2`, `rad`, `mpi`) deliberately still return plain radians — wrapping them would silently break the documented contract.
- **Docs** — `docs/stdlib.md` new "Angle-Preserving Functions" section; `docs/syntax.md` flow list + "Where Angles come from"; `docs/color.md` narrative + behavior-change callout.
- **Language services** — "angle-preserving" notes in `src/pathogen-api.ts` JSDoc for the 8 functions; completions regenerated.
- **Tests** — metadata-driven coverage matrix in `tests/evaluator.test.ts` (angle-in→angle-out at exactly 45°, plain-in→plain-out, every non-listed fn stays plain, map/min/lerp unit-source targeted tests, hueShift(randomRange/hashRange) e2e); annotated parity tests; updated pinned strings.

## Verification

- Targeted + full suite: 4723 passed.
- CLI: `hueShift(randomRange(0.5pi, 0.5pi))` → hue 90 (was 1.57 pre-fix).
- Playground real code path: user's exact program through `compileWithContext` on `dist/index.global.js` → 20 layers, 20 distinct fills.
- Visual: `repro-random-hueshift.{pathogen,svg,png}` in this folder — hues span gold→red→purple.

## Agentic review round (both reviews run pre-commit)

**Code review** (1 Critical, 2 Warning): missing `as Value` cast at the annotated expression-call dispatch site (+1 tsc error over the 94-error baseline; `npm run build` still passed since the dts step didn't reach it, but `tsc --noEmit` caught it) — **fixed**; 2 new lint errors in angle.ts — **fixed** (eslint --fix, behavior-diffed); language-services gap: angle-preserving results had no Angle hover/member completions — **fixed** by teaching `inferExprType`'s FunctionCall case (`src/language-services/type-inference-ast.ts`) to consult `ANGLE_PRESERVING_ARGS`, with completion tests. Added the suggested non-degenerate tests: mixed-magnitude `lerp(0deg, 0.5pi, 0.5)` → `45deg`, variadic `max(1, 2, 0.5pi)` (Angle past `Math.max.length`), annotated bare-statement discard.

**Content review** (3 must-fix, all applied): the "nothing changes unless an angle flows in" sentence was false for mixed bare/Angle deciding slots (`min(90deg, 1)` is `57.2957795131deg` — now documented as an explicit warning); `normalizeAngle` had no definition anywhere in docs/ (row added to Angle Conversion); rule statement rewritten to "same space as inputs" (the old "pick or blend" mispredicted `abs`/`normalizeAngle`). Should-improves applied: observable + deterministic `hashRange` swatch example, dangling colon in color.md, syntax.md callout extension, table header renamed to "Arguments that set the result's unit", forward-reference pointers, rounding-family clause. Skipped (noted, low value): per-section cross-links, gradients.md cosmetic list wording, color.md variable renaming.

**Post-review verification**: full suite 4729 passed; `tsc --noEmit` back to the 94 pre-existing baseline; `npm run build` clean; my files lint-clean (2 remaining type-inference-ast.ts lint errors pre-exist this change).

**Deferred**: CHANGELOG.md entry (write at commit time, covering all work since the last entry per convention). Percent semantics inconsistency across color methods (saturate=multiplier, lighten/darken=absolute L delta, alpha=fraction) noted as a possible future docs/design pass.

## Behavior changes (documented in docs)

1. `${lerp(0deg, 90deg, 0.5)}` prints `45deg`, no longer `0.7853981633974483`.
2. Degree-reading color methods now interpret transparent-fn results correctly (the fix); programs that pre-compensated (×180/π) change output.
3. Path geometry numerics unchanged (all consumers coerce via toNumber → radians).

## Artifacts

- `plan-2026-08-19.md` — the approved implementation plan
- `repro-random-hueshift.pathogen` / `.svg` / `.png` — before/after repro
