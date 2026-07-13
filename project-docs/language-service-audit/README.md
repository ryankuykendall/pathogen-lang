# Language-Service Audit — 2026-07-13

Full audit + fix of the completion / hover / snippet-template system, triggered by
three user-reported bugs. Plan approved in-session; scope decisions: **full
templates** on every callable completion, **full audit** (all drift closed),
**no GitHub Actions** (local pre-commit guard only), **annotated.ts parity
included**.

## The three reported bugs → root causes

| Bug | Root cause | Fix |
|---|---|---|
| `PathLayer.apply` completion inserts no `{ }` template | No method completion anywhere carried `insertText` — the generator never emitted templates | Generator now derives templates from `pathogen-api.ts` params + `@snippet` JSDoc tag for block syntax |
| `stroke-` + accept `stroke-width` → `stroke-stroke-width` | Editor word patterns treat `-` as a boundary, so the replacement range started after the hyphen | Style-property-position-scoped hyphen handling: bridge word/`validFor` widened via new `isStylePropertyNamePosition`; LSP attaches explicit `textEdit`; engine filters by hyphen-aware prefix |
| `.drawTo()` documented as `drawTo(layerName) — Emit to layer` | Wrong declaration in `src/pathogen-api.ts` (the generator's source of truth); runtime is `drawTo(x, y)` → ProjectedPath | Declaration fixed (+ `draw()`/`project()` return types); published docs were already correct |

## Additional findings fixed

- **12 defs constructors had zero editor support** (Mask, ClipPath, 6 gradients,
  Pattern, Marker, SVGDocumentFragment, PathBlock namespace) — declared with
  `@type` member interfaces; member access, binding-block params, hover, and
  signature help all work now.
- **Choice-syntax snippets** (`${2|Grain,Paper|}`) inserted raw text in the
  playground — converted to first choice; playground now uses native CM6
  `snippet()` for real tab-stop cycling.
- **`--annotated` mode gaps**: Mask, ClipPath, MeshGradient, FreeformGradient,
  TopoGradient, **all 7 filter constructors**, PolarVector, and Cycler threw
  `Undefined variable`. All fixed with member/property support.
- **Deleted the LSP's hand-maintained `pathogen-lang.d.ts` shim** — typechecks
  against real `dist/index.d.ts` now (the shim's "pre-existing DTS failure"
  reason no longer holds).
- **`grid.getPoint()` vs `mesh.getPoint()` chain collision** — new generated
  `TYPE_METHOD_RETURNS` per-type map resolves method returns by receiver type.

## Drift-prevention machinery (new)

- `src/evaluator/constructor-registry.ts` — every evaluator-dispatched
  constructor, behaviorally verified by `tests/constructor-registry.test.ts`
  (canonical program per name compiled through **both** evaluators).
- `crossCheck()` in the generator validates `pathogen-api.ts` ⟷ runtime;
  `npm run check:completions` runs `--strict` (non-zero exit on drift).
- Pre-commit hook (warn-only) runs the check when API-surface files change.
- `completion.ts` type inference now derives constructor + binding-block rules
  from generated `CONSTRUCTOR_RETURN_TYPES` — no more hand-maintained regex
  ladders.

## Gotcha discovered late (encoded as a lint pragma)

`eslint --fix` (`@typescript-eslint/method-signature-style`) rewrites
`m(a): R` → `m: (a) => R`, which silently empties every generated method set
(`iface.getMethods()` → 0). `src/pathogen-api.ts` now carries an
`eslint-disable` header explaining why method style is load-bearing.

## Verification performed

- **Engine**: 3279-test full suite green; new suites: generator units (20),
  constructor registry (53), completion/bridge/hover regression tests.
- **CLI**: `verify-all-constructors.pathogen` compiles via `npm run cli` in
  both normal and `--annotated` modes.
- **Playground (real browser)**: `verify-playground-completions.mjs` (puppeteer
  against `dev:website` + dev API) — all three reported bugs verified fixed in
  live CodeMirror. Note: the workspace page's autosave-restore dialog blocks
  the headless renderer — the script dismisses dialogs; puppeteer's
  `waitForFunction` is also unreliable under the playground CSP (use
  `page.evaluate` polling).
- **VS Code**: language server builds and extension typechecks against the new
  library. **Not** verified: interactive .vsix install (snippet tab-stops,
  textEdit behavior in a real VS Code instance) — do this before release.

## Files

- `verify-all-constructors.pathogen` — CLI/annotated verification program
- `verify-playground-completions.mjs` — browser verification harness

## Follow-ups (not done here)

1. Method-level signature help (`append` collides across 5 types — needs
   receiver-aware SIGNATURE_DATA).
2. Method-level hover via TYPE_MEMBERS (hover only covers top-level names).
3. Table-driven evaluator dispatch (registry + behavioral test is the stopgap).
4. `inlay-hints.ts` still has its own hand-maintained constructor chain —
   could consume `CONSTRUCTOR_RETURN_TYPES`.
5. Interactive VS Code .vsix verification.
6. (Review finding) `PixelateFilter(width?, height?, radius?)` declaration
   implies independently-optional params, but the evaluator accepts exactly 0
   or 3 args — arg-cardinality drift that name-level crossCheck can't catch.
7. (Review finding) The pre-commit completion-drift check runs a full ts-morph
   parse on any `src/evaluator/`/`src/stdlib/` commit — consider narrowing or
   caching if commit latency becomes annoying.
