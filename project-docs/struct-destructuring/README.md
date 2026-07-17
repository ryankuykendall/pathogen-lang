# Struct Destructuring (2026-07-17)

`let {x, y} = Point(20, 20);` — object destructuring extended from plain object
literals to built-in struct values: **Point, PolarVector, Grid, MeshPoint,
Color, and context objects** (`ctx.position`).

## Design

- New shared module `src/evaluator/struct-properties.ts` exports
  `getStructDescriptor(value)` → `{ name, getters }` with lazy per-property
  getters. Both evaluators (`index.ts`, `annotated.ts`) delegate member access
  **and** destructuring to it; their former per-type member-access branches
  were deleted, so the descriptor is the single source of truth (anti-drift by
  refactoring, not parity tables).
- Missing key on a struct **throws** (`Property 'z' does not exist on Point`,
  with line number) — consistent with dot access. Plain object literals keep
  their lenient `?? null` behavior. This asymmetry is documented in
  `docs/objects.md`.
- Rest patterns evaluate the remaining getters into a plain object; computed
  properties (Grid `width`/`height`) are included.
- The main evaluator's ContextObject `transform` special case
  (TransformReference from `_transformState`) stays in `index.ts`, ahead of the
  delegation; `_transformState` is excluded from descriptor keys.
- Excluded deliberately: Gradient (its width/height getters throw for
  non-mesh subtypes, which would break rest patterns), PathBlock/Projected*
  (heavyweight computed members), id-only types.

## Artifacts

- `demo.pathogen` — all destructurable types in one drawing
- `demo.svg` / `demo.png` — CLI render (verified identical in playground
  iframe and VS Code webview bundle)

## Deferred follow-up: language services

Completions/hover do not yet understand destructured bindings:

- `inferType` (src/language-services/completion.ts) doesn't type variables
  bound by `let { x } = point;` — so `x.` after destructuring a struct gets no
  member completions. (This was already true for object-literal destructuring.)
- No completion inside the pattern braces themselves (`let { | } = point;`
  could suggest `x`, `y` from the RHS type).

Both are editor sugar with no runtime-parity obligation. If picked up, drive
key sets from `TYPE_MEMBERS` / `CONSTRUCTOR_RETURN_TYPES`
(completion-data.generated.ts — regenerate, never hand-edit).

## Review outcomes (2026-07-17)

- **code-reviewer** approved (0 critical). Its findings drove three changes:
  - Descriptor reshaped from a `getters` record to `has/get/keys` — fixes an
    inherited-member leak (`point.toString` would have resolved
    `Object.prototype.toString` instead of throwing) and removes the
    per-access closure-record allocation the reviewer benchmarked at
    ~1.6-1.8x on `ctx.position` reads (context descriptor is now a singleton
    that reads the backing record directly).
  - Drift-guard test strengthened: numeric properties are value-checked
    through the annotated evaluator via path output (was existence-only).
  - Added `text()`-body destructuring tests (the exact call sites where
    `getLine` threading changed). Note: plain `text()` statements are no-ops
    in annotated mode; its text-body path is only reachable via `&{ }`
    TextBlock bodies, which is what the annotated test uses.
  - Known behavior change (intentional hardening): `ctx._transformState` is
    no longer reachable by literal name; `.transform` synthesis unchanged.
  - Deferred suggestion: `annotated.ts` re-declares four value interfaces
    that `types.ts` also defines (pre-existing duplication, byte-identical
    today) — importing them instead would remove the drift risk.
- **content-reviewer** (4-persona) found one Must-fix, applied: the docs
  claimed destructuring works on "any built-in value readable via dot
  access", which is false (TextBlock/ProjectedPath have readable properties
  but don't destructure). Both docs now state the fixed-shape-struct rule.
  Also applied: Grid rest key enumeration, MeshPoint provenance, split
  `ctx.position` into its own example, evened out annotations.

## Known pre-existing gap (flagged by review, out of scope)

`ctx.transform` has never worked in `compileAnnotated()` — full write-up with
reproduction, root cause, and fix sketch in
[bug-ctx-transform-annotated.md](bug-ctx-transform-annotated.md).

## Also fixed in passing

- Color `.a` returns `oklch.alpha` (typed as required `number`; older values
  could be undefined at runtime — behavior preserved, normalization not done).
- Three `bindDestructuringPattern` call sites (text bodies in both evaluators)
  passed no line number; now threaded via `getLine`, so destructuring errors
  in text blocks carry line numbers.
