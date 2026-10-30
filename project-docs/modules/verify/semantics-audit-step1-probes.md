# Semantics audit (phase 0a step 1)

7 programs, 2026-10-28. Baseline `cedd42e8984b` vs the working tree. Seeded `Math.random`, fonts loaded once with downloads off; compared on the error message, the whole CompileResult and `generateSvg()`, with trace on for programs that draw up to 20000 commands (1 larger ones are listed under "compared with trace off").

| Outcome | Programs |
|---|---|
| expected | 6 |
| unchanged | 1 |

## compared with trace off

These draw more than 20000 commands, where a traced compile takes minutes to hours. They are compared the same way without the per-command trace (`records`, `commands`): path data, layers, logs, warnings and the SVG still have to match.

- `project-docs/modules/verify/step1-probes/cycler-over-trace-limit.pathogen` (25001 commands; expected)

## expected

- `project-docs/modules/verify/step1-probes/cycler-pick.pathogen` (tags: call-shaped-path-arg)
  - $.commands[1].args[0]: 20 → 10
- `project-docs/modules/verify/step1-probes/random-pen.pathogen` (tags: call-shaped-path-arg; random() calls 2 → 1)
  - $.commands[1].args[0]: 33.21306281723082 → 42.8359225159511
- `project-docs/modules/verify/step1-probes/side-effect-next-line.pathogen` (tags: call-shaped-path-arg)
  - $.logs[0].parts[0].value: "2" → "1"
- `project-docs/modules/verify/step1-probes/index-side-effect.pathogen` (tags: call-shaped-path-arg)
  - $.commands[1].args[0]: 6 → 5
- `project-docs/modules/verify/step1-probes/arc-rotation-count.pathogen` (tags: call-shaped-path-arg)
  - $.logs[0].parts[0].value: "2" → "1"
- `project-docs/modules/verify/step1-probes/cycler-over-trace-limit.pathogen` (tags: call-shaped-path-arg)
  - $.layers[0].data: "M 0 0 l 1 0 l 3 0 l 2 0 l 1 0 l 3 0 l 2 0 l 1 0 l 3 0 l 2 0 l 1 0 l 3 0 l 2 0 l 1 0 l 3 0 l 2 0 l 1 0 l 3 0 l 2 0 l 1 0 l 3 0 l 2 0 l 1 0 l 3 0 l 2 0 l 1 0 ... → "M 0 0 l 1 0 l 2 0 l 3 0 l 1 0 l 2 0 l 3 0 l 1 0 l 2 0 l 3 0 l 1 0 l 2 0 l 3 0 l 1 0 l 2 0 l 3 0 l 1 0 l 2 0 l 3 0 l 1 0 l 2 0 l 3 0 l 1 0 l 2 0 l 3 0 l 1 0 ...
