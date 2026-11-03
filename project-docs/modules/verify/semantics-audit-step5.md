# Semantics audit (phase 0a step 5)

1447 programs, 2026-11-02. Baseline `cb0e299d5c59` vs the working tree. Seeded `Math.random`, fonts loaded once with downloads off; compared on the error message, the whole CompileResult and `generateSvg()`, with trace on for programs that draw up to 20000 commands (10 larger ones are listed under "compared with trace off").

| Outcome | Programs |
|---|---|
| ok→error | 24 |
| expected | 7 |
| too-large | 4 |
| skipped | 15 |
| unchanged | 1397 |

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

## ok→error

- `docs/syntax.md:79` (tags: builtin-binding)
  - error: null → "Parse error at line 1, column 5: Cannot use line as a name — it is a built-in function. Use another name"
- `docs/syntax.md:103` (tags: builtin-binding)
  - error: null → "Parse error at line 2, column 7: Cannot use min as a name — it is a built-in function. Take the property under another name: { min: minValue }"
- `project-docs/bulge-strokes/05-jitter.pathogen` (tags: builtin-binding; random() calls 98 → 0)
  - error: null → "Parse error at line 30, column 4: Cannot use hash01 as a name — it is a built-in function. Use another name"
- `project-docs/bulge-strokes/06-halo-rebuilt.pathogen` (tags: builtin-binding)
  - error: null → "Parse error at line 27, column 4: Cannot use hash01 as a name — it is a built-in function. Use another name"
- `project-docs/chained-bezier-curves/clipped-quad-spline-demo.pathogen` (tags: builtin-binding)
  - error: null → "Parse error at line 4, column 4: Cannot use clippedQuadSpline as a name — it is a built-in function. Use another name"
- `project-docs/chained-bezier-curves/clipped-quad-spline-schematic.pathogen` (tags: builtin-binding)
  - error: null → "Parse error at line 7, column 4: Cannot use clippedQuadSpline as a name — it is a built-in function. Use another name"
- `project-docs/chained-bezier-curves/clipped-quad-spline.pathogen` (tags: builtin-binding)
  - error: null → "Parse error at line 21, column 4: Cannot use clippedQuadSpline as a name — it is a built-in function. Use another name"
- `project-docs/chained-bezier-curves/control-point-viz.pathogen` (tags: builtin-binding)
  - error: null → "Parse error at line 4, column 4: Cannot use cubicSpline as a name — it is a built-in function. Use another name"
- `project-docs/chained-bezier-curves/cubic-spline-demo.pathogen` (tags: builtin-binding)
  - error: null → "Parse error at line 4, column 4: Cannot use cubicSpline as a name — it is a built-in function. Use another name"
- `project-docs/chained-bezier-curves/cubic-spline-schematic.pathogen` (tags: builtin-binding)
  - error: null → "Parse error at line 7, column 4: Cannot use cubicSpline as a name — it is a built-in function. Use another name"
- `project-docs/chained-bezier-curves/cubic-spline.pathogen` (tags: builtin-binding)
  - error: null → "Parse error at line 18, column 4: Cannot use cubicSpline as a name — it is a built-in function. Use another name"
- `project-docs/chained-bezier-curves/quad-spline-demo.pathogen` (tags: builtin-binding)
  - error: null → "Parse error at line 4, column 4: Cannot use quadSpline as a name — it is a built-in function. Use another name"
- `project-docs/chained-bezier-curves/quad-spline-schematic.pathogen` (tags: builtin-binding)
  - error: null → "Parse error at line 8, column 4: Cannot use quadSpline as a name — it is a built-in function. Use another name"
- `project-docs/chained-bezier-curves/quad-spline.pathogen` (tags: builtin-binding)
  - error: null → "Parse error at line 18, column 4: Cannot use quadSpline as a name — it is a built-in function. Use another name"
- `project-docs/modules/verify/step3-probes/caller-shadows-builtin.pathogen` (tags: builtin-binding)
  - error: null → "Parse error at line 11, column 7: Cannot use round as a name — it is a built-in function. Use another name"
- `project-docs/observable-reactive-paths/demo-queries.pathogen` (tags: builtin-binding)
  - error: null → "Parse error at line 27, column 8: Cannot use arc as a name — it is a built-in function. Use another name"
- `project-docs/observable-reactive-paths/demo-subscriptions.pathogen` (tags: builtin-binding)
  - error: null → "Parse error at line 20, column 42: Cannot use arc as a name — it is a built-in function. Use another name"
- `project-docs/path-block-boolean-operations-audit/union-partial-overlap-repro.pathogen` (tags: builtin-binding)
  - error: null → "Parse error at line 12, column 5: Cannot use arc as a name — it is a built-in function. Use another name"
- `project-docs/path-block-boolean-operations-audit/union-speck-repro.pathogen` (tags: builtin-binding)
  - error: null → "Parse error at line 14, column 5: Cannot use arc as a name — it is a built-in function. Use another name"
- `project-docs/stdlib-primers/content/noise/02-frequency-knob.pathogen` (tags: builtin-binding)
  - error: null → "Parse error at line 11, column 7: Cannot use line as a name — it is a built-in function. Use another name"
- `project-docs/stdlib-primers/content/noise2/03-rows-of-field.pathogen` (tags: builtin-binding)
  - error: null → "Parse error at line 10, column 7: Cannot use line as a name — it is a built-in function. Use another name"
- `project-docs/switch-case/demo-expression.pathogen` (tags: builtin-binding)
  - error: null → "Parse error at line 5, column 6: Cannot use Marker as a name — it is a built-in constructor. Use another name"
- `project-docs/switch-case/demo-ranges.pathogen` (tags: builtin-binding)
  - error: null → "Parse error at line 6, column 7: Cannot use heading as a name — it is a built-in function. Use another name"
- `project-docs/switch-case/demo-shapes.pathogen` (tags: builtin-binding)
  - error: null → "Parse error at line 4, column 6: Cannot use Marker as a name — it is a built-in constructor. Use another name"

## expected

- `project-docs/bulge-strokes/06b-halo-lambdas.pathogen` (tags: builtin-binding)
  - error: "Line 52, col 14: compoundVariableOffset() requires a block or a << worker, e.g. compoundVariableOffset() {|go, pb| go.stop(50%, 10, CurveContinuity.G1, -10,... → "Parse error at line 17, column 4: Cannot use hash01 as a name — it is a built-in function. Use another name"
- `project-docs/glyph-listing/blog/probes/specimen-bebas-neue.pathogen` (tags: builtin-binding)
  - error: "Line 121, col 12: Font.info(): no fonts were loaded. Add @font \"Bebas Neue\"; — if you already have, look for a font-loading message above." → "Parse error at line 171, column 6: Cannot use line as a name — it is a built-in function. Use another name"
- `project-docs/glyph-listing/blog/probes/specimen-inconsolata.pathogen` (tags: builtin-binding)
  - error: "Line 121, col 12: Font.info(): no fonts were loaded. Add @font \"Inconsolata\"; — if you already have, look for a font-loading message above." → "Parse error at line 171, column 6: Cannot use line as a name — it is a built-in function. Use another name"
- `project-docs/glyph-listing/blog/probes/specimen-libre-baskerville.pathogen` (tags: builtin-binding)
  - error: "Line 121, col 12: Font.info(): no fonts were loaded. Add @font \"Libre Baskerville\"; — if you already have, look for a font-loading message above." → "Parse error at line 171, column 6: Cannot use line as a name — it is a built-in function. Use another name"
- `project-docs/glyph-listing/blog/probes/specimen-playfair-display.pathogen` (tags: builtin-binding)
  - error: "Line 121, col 12: Font.info(): no fonts were loaded. Add @font \"Playfair Display\"; — if you already have, look for a font-loading message above." → "Parse error at line 171, column 6: Cannot use line as a name — it is a built-in function. Use another name"
- `project-docs/glyph-listing/blog/probes/specimen-raleway.pathogen` (tags: builtin-binding)
  - error: "Line 121, col 12: Font.info(): no fonts were loaded. Add @font \"Raleway\"; — if you already have, look for a font-loading message above." → "Parse error at line 171, column 6: Cannot use line as a name — it is a built-in function. Use another name"
- `project-docs/modules/verify/step3-probes/caller-local-assign.pathogen` (tags: builtin-binding)
  - error: "Line 7: Cannot assign to count here — a function sees the variables where it is written, not where it is called. Return the new value instead: count = bump();" → "Parse error at line 6, column 4: Cannot use bump as a name — it is a built-in function. Use another name"

## too-large

- `project-docs/path-block-boolean-operations-audit/failure-matrix-2.pathogen` (no result after 240 s in the size check (one trace-off compile with the baseline), so it was stopped)
- `project-docs/path-block-boolean-operations-audit/failure-matrix-3-dashed.pathogen` (no result after 240 s in the size check (one trace-off compile with the baseline), so it was stopped)
- `project-docs/path-block-boolean-operations-audit/failure-matrix-3-solid.pathogen` (no result after 240 s in the size check (one trace-off compile with the baseline), so it was stopped)
- `project-docs/path-block-boolean-operations-audit/failure-matrix.pathogen` (no result after 240 s in the size check (one trace-off compile with the baseline), so it was stopped)

## skipped

- `docs/syntax.md:130` (the baseline parser rejects it)
- `docs/syntax.md:142` (the baseline parser rejects it)
- `docs/syntax.md:153` (the baseline parser rejects it)
- `website/blog/broken-lines-what-it-taught.md:134` (the baseline parser rejects it)
- `website/blog/broken-lines-what-it-taught.md:183` (the baseline parser rejects it)
- `website/blog/vscode-developer-experience.md:76` (the baseline parser rejects it)
- `project-docs/landing-background/landing-bg.pathogen` (the baseline parser rejects it)
- `project-docs/mini-workspace-chrome-reduction/sample/source.pathogen` (the baseline parser rejects it)
- `project-docs/modules/verify/step4-probes/const-reassigned-in-uncalled-fn.pathogen` (the baseline parser rejects it)
- `project-docs/modules/verify/step4-probes/const-redeclared.pathogen` (the baseline parser rejects it)
- `project-docs/pathblock-intersects/pathblock-intersects-demo.pathogen` (the baseline parser rejects it)
- `project-docs/pattern-conic-gradient/phase3-demo.pathogen` (the baseline parser rejects it)
- `project-docs/radial-bar-chart/xor-arc-tangent-fix-verify.pathogen` (the baseline parser rejects it)
- `project-docs/textblock-new-methods/to-code-snippet-block-demo.pathogen` (the baseline parser rejects it)
- `project-docs/textblock-new-methods/to-path-block-demo.pathogen` (the baseline parser rejects it)
