# Semantics audit (phase 0a step 3)

1424 programs, 2026-10-30. Baseline `2f7cead53f3d` vs the `src/` in `tmp/step3/final`. Seeded `Math.random`, fonts loaded once with downloads off; compared on the error message, the whole CompileResult and `generateSvg()`, with trace on for programs that draw up to 20000 commands (10 larger ones are listed under "compared with trace off").

| Outcome | Programs |
|---|---|
| ok→error | 2 |
| error→ok | 1 |
| too-large | 4 |
| skipped | 10 |
| unchanged | 1407 |

## compared with trace off

These draw more than 20000 commands, where a traced compile takes minutes to hours. They are compared the same way without the per-command trace (`records`, `commands`): path data, layers, logs, warnings and the SVG still have to match.

- `project-docs/editor-perf/generated-heavy.pathogen` (52824 commands; unchanged)
- `project-docs/editor-perf/generated-wide.pathogen` (60003 commands; unchanged)
- `project-docs/glyph-halo-diagnosis/programs/01-as-written-standin-font.pathogen` (1026661 commands; unchanged)
- `project-docs/glyph-halo-diagnosis/programs/02-dash-unit-floor-3.pathogen` (109499 commands; unchanged)
- `project-docs/glyph-halo-diagnosis/programs/03-dash-unit-floor-6.pathogen` (72604 commands; unchanged)
- `project-docs/glyph-halo-diagnosis/programs/04-anchored-placement.pathogen` (75662 commands; unchanged)
- `project-docs/modules/verify/step1-probes/cycler-over-trace-limit.pathogen` (25001 commands; unchanged)
- `project-docs/pan-zoom-performance/grids-and-cycling.pathogen` (1267205 commands; unchanged)
- `project-docs/path-block-boolean-operations-audit/failure-matrix-iter-3-enc.pathogen` (23462 commands; unchanged)
- `project-docs/semi-circle-example/semi-circle-example.pathogen` (480320 commands; unchanged)

## names the two scope rules resolve differently

From the evaluator's scope recorder (step 3): every program where a name used in a named fn resolves differently under the lexical rule than under the old caller-scope rule, as `kind fn.name`, whether or not its output changed. `bound-elsewhere` is the silent case (another binding, or a built-in, is used now); `only-where-written` was an error before; `only-where-called` is the new hinted error.

- `docs/syntax.md:1983` (unchanged): bound-elsewhere f.amt
- `docs/syntax.md:2000` (error→ok): only-where-written times.k
- `docs/syntax.md:2030` (ok→error): only-where-called reset.count
- `docs/syntax.md:2052` (ok→error): only-where-called scale.k

## ok→error

- `docs/syntax.md:2030` (tags: scope:only-where-called)
  - error: null → "Line 1: Cannot assign to count here — a function sees the variables where it is written, not where it is called. Return the new value instead: count = reset...
- `docs/syntax.md:2052` (tags: scope:only-where-called)
  - error: null → "Line 4: Error in .map() callback at index 0: Line 1, col 31: Undefined variable: k — a function sees the variables where it is written, not where it is call...

## error→ok

- `docs/syntax.md:2000` (tags: scope:only-where-written)
  - error: "Line 2, col 33: Undefined variable: k" → null

## too-large

- `project-docs/path-block-boolean-operations-audit/failure-matrix-2.pathogen` (no result after 240 s in the size check (one trace-off compile with the baseline), so it was stopped)
- `project-docs/path-block-boolean-operations-audit/failure-matrix-3-dashed.pathogen` (no result after 240 s in the size check (one trace-off compile with the baseline), so it was stopped)
- `project-docs/path-block-boolean-operations-audit/failure-matrix-3-solid.pathogen` (no result after 240 s in the size check (one trace-off compile with the baseline), so it was stopped)
- `project-docs/path-block-boolean-operations-audit/failure-matrix.pathogen` (no result after 240 s in the size check (one trace-off compile with the baseline), so it was stopped)

## skipped

- `website/blog/broken-lines-what-it-taught.md:134` (the baseline parser rejects it)
- `website/blog/broken-lines-what-it-taught.md:183` (the baseline parser rejects it)
- `website/blog/vscode-developer-experience.md:76` (the baseline parser rejects it)
- `project-docs/landing-background/landing-bg.pathogen` (the baseline parser rejects it)
- `project-docs/mini-workspace-chrome-reduction/sample/source.pathogen` (the baseline parser rejects it)
- `project-docs/pathblock-intersects/pathblock-intersects-demo.pathogen` (the baseline parser rejects it)
- `project-docs/pattern-conic-gradient/phase3-demo.pathogen` (the baseline parser rejects it)
- `project-docs/radial-bar-chart/xor-arc-tangent-fix-verify.pathogen` (the baseline parser rejects it)
- `project-docs/textblock-new-methods/to-code-snippet-block-demo.pathogen` (the baseline parser rejects it)
- `project-docs/textblock-new-methods/to-path-block-demo.pathogen` (the baseline parser rejects it)
