# First-Class Angle Values — STATUS

**2026-08-01 — implemented, reviewed, verified. Not yet committed.**

Plan: `PLAN.md` (approved copy). Origin: Ryan hit the angle-variable trap in
the glyph-halo program (`hueShift(contourHueShift)` silently read radians as
degrees); decided angles should be first-class values instead of shipping the
deferred LS warning (now obsolete — `project-docs/color-angle-units/FOLLOW-UPS.md` §1).

## What shipped

- `AngleValue { type, radians, unit }` in both evaluators' Value unions;
  shared helpers in `src/evaluator/angle.ts` (isAngleValue, angle,
  radiansToDegreesSnapped, formatAngleForDisplay).
- Minting at NumberLiteral evaluation (path-arg literal fast paths stay raw
  numbers — byte-identical output; render snapshots unchanged).
- `toNumber` unwrap in both evaluators covers arithmetic/comparisons/
  truthiness/loop bounds/path args; stdlib + context-aware dispatch unwrap
  (including annotated's second dispatch in path-statement position and the
  bare fn-call-statement branch); nested angles in structured stdlib args via
  `asNumber` in `src/stdlib/path.ts` (cubicSpline `angle:` fields — was a
  regression caught in review).
- Arithmetic propagation (±/×scalar/÷scalar keep Angle; ÷Angle, ×Angle drop
  to plain; unit from left-most Angle operand). Static literal mismatch
  checks unchanged (pinned messages).
- hueShift/analogous/splitComplementary + Color(L,C,H) hue: Angle → exact
  degrees (1e10 snap); `angleArgToDegrees` deleted from units.ts.
- Display: written unit everywhere (templates, log, annotated) — "90deg",
  "0.5pi". Style blocks emit radians (byte-compat); CSS function args emit
  `Ndeg` (hue-rotate). Members `.deg/.rad/.pi/.turns` via struct-properties
  (`.pi` added 2026-08-01 after Ryan asked; plain π-multiple, snapped —
  deliberately NOT a re-tagging method, `a.pi == 0.5pi` is false by design).
- Re-tagging methods `.toDeg()/.toRad()/.toPi()/.toTurns()` (also 2026-08-01):
  same radians, different display unit; dispatch via shared `angleMethod` in
  angle.ts (both evaluators); unit union gained display-only `'turns'`.
- ConicGradient from/to, Marker orient, filter angles, transform.set,
  Point.rotate/polarTranslate, PolarVector, PathBlock mirror/rotateAtVertex/
  ellipticalFillet/drawTo rotation, text/tspan rotation, polarProject,
  sort(): accept Angles. Other numeric slots stay strict by policy.
- LS: `@type Angle` (PathogenAngle) in pathogen-api.ts → regenerated
  completion data; type-inference-ast infers 'Angle' for suffixed literals,
  angle-calc, and angle-through-variable arithmetic.
- Docs rewritten (syntax § Angle Units canonical + color/gradients/stdlib/
  layers/filters/markers/objects/debug/path-blocks) with behavior-change
  callouts; CHANGELOG entry.

## Reviews (both run 2026-08-01, in-session)

- **code-reviewer**: 3 Critical (annotated parity: bare stdlib stmt unwrap,
  sort(), styleValueToCSS Angle branch) — all fixed + regression-tested; the
  "pre-existing" cubicSpline note was actually a regression — fixed.
  LS through-variable inference warning — fixed. `toNumber(...) as number`
  style suggestion — not taken (matches surrounding idiom).
- **content-reviewer**: MUST 1–6 all applied (mpi note, stale equivalence
  block, canonical-sentence boundary + Grid counter-example, "where Angles
  come from" paragraph, behavior-change callouts, template-literal link fix)
  plus SHOULD 2/3/5/6 partials and the `enum Angle`→`enum Turn` rename.

## Verification

Full suite 4343 passed / 104 files (incl. byte-for-byte render snapshots).
dist-level check: variable and inline hueShift agree across a 16-step sweep
(46°→299°). CLI + --annotated verified (`polarLine(0.5pi, 40)` display +
geometry). `npm run build`, `build:docs`, `check:completions` clean.
Live `check-links` skipped (needs :3000 dev server; static anchor audit
passed for all new links).

## Deferred / follow-ups

- Consolidate display semantics into one docs section (UXD; syntax.md has
  Booleans § Display, Points § Template Literals, Angle Display).
- `<mini-workspace>` for the color.md hue wheel (content review C-5).
- Remaining "plain number in radians" sweeps in variable-offset.md and
  path-blocks tables (SHOULD-6 partial).
- Playground browser-level manual check of the original halo program (dist
  bundle verified headlessly; Ryan to eyeball in the running playground).
