# Semantics audit (phase 0a step 2)

8 programs, 2026-10-30. Baseline `8ea2998792ed` vs the working tree. Seeded `Math.random`, fonts loaded once with downloads off; compared on the error message, the whole CompileResult and `generateSvg()`, with trace on for programs that draw up to 20000 commands.

| Outcome | Programs |
|---|---|
| expected | 7 |
| unchanged | 1 |

## expected

- `project-docs/modules/verify/step2-probes/callback-in-block.pathogen` (tags: ctx-with-path-block, callback-in-path-block)
  - $.logs[0].parts[0].value: "[0]" → "[5]"
- `project-docs/modules/verify/step2-probes/ctx-after-block.pathogen` (tags: ctx-with-path-block)
  - $.logs[0].parts[0].value: "5" → "10"
- `project-docs/modules/verify/step2-probes/ctx-in-block.pathogen` (tags: ctx-with-path-block)
  - $.logs[0].parts[0].value: "0" → "5"
- `project-docs/modules/verify/step2-probes/fn-reads-ctx-in-block.pathogen` (tags: ctx-with-path-block, call-in-path-block)
  - $.logs[0].parts[0].value: "0" → "5"
- `project-docs/modules/verify/step2-probes/lambda-draws-in-block.pathogen` (tags: call-in-path-block)
  - $.commands[1].args[0]: 60 → 0
- `project-docs/modules/verify/step2-probes/lambda-written-in-block.pathogen` (tags: ctx-with-path-block)
  - $.logs[0].parts[0].value: "0" → "70"
- `project-docs/modules/verify/step2-probes/loop-in-block-reads-ctx.pathogen` (tags: ctx-with-path-block)
  - $.logs[0].parts[0].value: "0" → "10"
