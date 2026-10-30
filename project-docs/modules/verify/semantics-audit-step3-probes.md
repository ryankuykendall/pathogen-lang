# Semantics audit (phase 0a step 3)

7 programs, 2026-10-30. Baseline `2f7cead53f3d` vs the working tree. Seeded `Math.random`, fonts loaded once with downloads off; compared on the error message, the whole CompileResult and `generateSvg()`, with trace on for programs that draw up to 20000 commands.

| Outcome | Programs |
|---|---|
| ok→error | 3 |
| error→ok | 2 |
| expected | 1 |
| unchanged | 1 |

## names the two scope rules resolve differently

From the evaluator's scope recorder (step 3): every program where a name used in a named fn resolves differently under the lexical rule than under the old caller-scope rule, as `kind fn.name`, whether or not its output changed. `bound-elsewhere` is the silent case (another binding, or a built-in, is used now); `only-where-written` was an error before; `only-where-called` is the new hinted error.

- `project-docs/modules/verify/step3-probes/caller-local-assign.pathogen` (ok→error): only-where-called bump.count
- `project-docs/modules/verify/step3-probes/caller-local-read.pathogen` (ok→error): only-where-called f.spacing
- `project-docs/modules/verify/step3-probes/caller-local-silent.pathogen` (expected): bound-elsewhere f.amt
- `project-docs/modules/verify/step3-probes/caller-shadows-builtin.pathogen` (error→ok): bound-elsewhere f.round
- `project-docs/modules/verify/step3-probes/factory-fn.pathogen` (error→ok): only-where-written times.k
- `project-docs/modules/verify/step3-probes/named-worker-caller-local.pathogen` (ok→error): only-where-called scale.k

## ok→error

- `project-docs/modules/verify/step3-probes/caller-local-assign.pathogen` (tags: scope:only-where-called)
  - error: null → "Line 7: Cannot assign to count here — a function sees the variables where it is written, not where it is called. Return the new value instead: count = bump();"
- `project-docs/modules/verify/step3-probes/caller-local-read.pathogen` (tags: scope:only-where-called)
  - error: null → "Line 8, col 19: Undefined variable: spacing — a function sees the variables where it is written, not where it is called. Pass it in: add spacing to f's para...
- `project-docs/modules/verify/step3-probes/named-worker-caller-local.pathogen` (tags: scope:only-where-called)
  - error: null → "Line 14: Error in .map() callback at index 0: Line 9, col 19: Undefined variable: k — a function sees the variables where it is written, not where it is cal...

## error→ok

- `project-docs/modules/verify/step3-probes/caller-shadows-builtin.pathogen` (tags: scope:bound-elsewhere)
  - error: "Line 7, col 10: round is not a function" → null
- `project-docs/modules/verify/step3-probes/factory-fn.pathogen` (tags: scope:only-where-written)
  - error: "Line 8, col 21: Undefined variable: k" → null

## expected

- `project-docs/modules/verify/step3-probes/caller-local-silent.pathogen` (tags: scope:bound-elsewhere)
  - $.commands[3].args[0]: 70 → 10
