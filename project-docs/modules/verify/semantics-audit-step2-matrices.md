# Semantics audit (phase 0a step 2)

7 programs, 2026-10-30. Baseline `8ea2998792ed` vs the working tree. Seeded `Math.random`, fonts loaded once with downloads off; compared on the error message, the whole CompileResult and `generateSvg()`, with trace on for programs that draw up to 20000 commands (4 larger ones are listed under "compared with trace off").

| Outcome | Programs |
|---|---|
| too-large | 1 |
| unchanged | 6 |

## compared with trace off

These draw more than 20000 commands, where a traced compile takes minutes to hours. They are compared the same way without the per-command trace (`records`, `commands`): path data, layers, logs, warnings and the SVG still have to match.

- `project-docs/path-block-boolean-operations-audit/failure-matrix-2.pathogen` (65441 commands; unchanged)
- `project-docs/path-block-boolean-operations-audit/failure-matrix-3-dashed.pathogen` (130676 commands; unchanged)
- `project-docs/path-block-boolean-operations-audit/failure-matrix-3-solid.pathogen` (130684 commands; unchanged)
- `project-docs/path-block-boolean-operations-audit/failure-matrix-iter-3-enc.pathogen` (23462 commands; unchanged)

## too-large

- `project-docs/path-block-boolean-operations-audit/failure-matrix.pathogen` (no result after 1200 s in the trace-off compiles (133648 commands), so it was stopped)
