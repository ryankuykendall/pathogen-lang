# Semantics audit (phase 0a step 2)

1410 programs, 2026-10-30. Baseline `8ea2998792ed` vs the working tree. Seeded `Math.random`, fonts loaded once with downloads off; compared on the error message, the whole CompileResult and `generateSvg()`, with trace on for programs that draw up to 20000 commands (10 larger ones are listed under "compared with trace off").

| Outcome | Programs |
|---|---|
| expected | 2 |
| too-large | 4 |
| skipped | 10 |
| unchanged | 1394 |

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

## expected

- `docs/debug.md:283` (tags: ctx-with-path-block)
  - $.logs[0].parts[0].value: "0" → "5"
- `docs/syntax.md:2057` (tags: ctx-with-path-block, call-in-path-block)
  - $.commands[1]: {"args":[60,50],"command":"L","end":{"x":60,"y":50},"start":{"x":50,"y":50}} → undefined

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
