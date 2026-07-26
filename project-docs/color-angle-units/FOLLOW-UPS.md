# Color Angle Units — Deferred Follow-ups

Deferred by Ryan on 2026-07-26 after the unit-aware color-method angles work
landed (commit `a34e313`). Context: `project-docs/color-angle-units/`,
`src/evaluator/units.ts`, `src/evaluator/member-assign.ts`.

## 1. Language-service diagnostic: angle variable passed to a degrees method

**The trap**: `let turn = 0.5pi; c.hueShift(turn)` compiles cleanly but shifts
1.57° instead of 90° — the unit is consumed at the literal, and the call-site
inference (`inferUnit`) never looks inside variables. Currently defended only
by docs (`docs/color.md` callout) and the `deg()` escape hatch.

**Proposed**: a warning diagnostic (never an error) in the shared
language-services layer, so playground and VS Code both get it:

> `turn` was declared as an angle (`0.5pi` → radians), but `hueShift` reads
> bare values as degrees. Wrap it: `hueShift(deg(turn))`.

Plus a quick-fix code action inserting the `deg(...)` wrapper.

**Why feasible**:
- `NumberLiteral.unit` survives in the AST (`src/parser/ast.ts:239`) — only the
  evaluator erases it.
- `analyzeScopes` (`src/language-services/scope-analysis.ts`) already resolves
  identifier uses to declarations; inspect the declaration's initializer with
  the same `inferUnit` from `src/evaluator/units.ts` (dependency-clean, no
  second implementation).
- Degrees-taking call sites are a closed set: `hueShift`, `analogous`,
  `splitComplementary`.

**Design decisions made in the discussion**:
- Warning only; go silent if the variable is reassigned anywhere (write count
  is available from scope analysis).
- One declaration hop only — no chain chasing, no function parameters.
- Consider the mirror trap too: a bare-number variable flowing into
  ConicGradient `from`/`to` (radians slots that are strict for literals but
  blind through variables).

**Where**: check in `src/language-services/diagnostics.ts` (or small sibling
module), fix in `code-actions.ts`, tests in
`tests/language-services/diagnostics.test.ts`. Precedent for the analysis
shape: the scope-aware color-chip / style-value reference work. Estimated one
focused session; most effort is the test matrix (declared-with-suffix,
declared-via-calc, reassigned, shadowed, parameter, already-`deg()`-wrapped).

## 2. Filter property assignment parity in annotated mode

`NoiseFilter`/`GlowFilter`/`EmbossFilter`/`ElevationShadowFilter`/`MotionBlur`
member assignments have **zero** handling in the annotated evaluator's
MemberAssignmentStatement — complete no-ops, not even lenient stores. Same
class as the Gradient/Pattern/Marker/MeshPoint leniency fixed in `a34e313`;
same extraction pattern into `src/evaluator/member-assign.ts` applies. Wrinkle:
the NoiseFilter `style` case re-baselines eight fields via
`makeDefaultNoiseFilter`, so the extraction needs that dependency threaded in.
Noted as tracked in the CHANGELOG entry.

## 3. Docs structural move (content review S4)

Move the remaining mechanism/concept prose from `docs/color.md` § Hue into
`docs/syntax.md` § Angle Units, leaving color.md at reference cadence
(contract + fences + callout + links). The two-layer model paragraph already
lives in syntax.md's calc section after the M2 fix; this finishes the job.
Low priority — both pages are currently accurate and reviewed.
