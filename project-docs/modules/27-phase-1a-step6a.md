# Phase 1a, step 6a: the CLI

2026-11-05. The first sub-step of step 6 (`26-phase-1a-step6-plan.md`).

## What

The CLI already did everything docs/modules.md "In each tool" promises for it (steps 2–5). Four promises had no test, so this step adds them. All four passed as written: no code change.

| Promise (docs/modules.md "In each tool") | Test (tests/cli.test.ts, "imports") |
|---|---|
| "Code passed with -e … imports from the current folder" | `code from -e imports from the current folder, without --root`: run from `parts/`, `import { gear } from "./gears.pathogen"` draws what a one-file gear draws |
| "… or on standard input" | `code on standard input imports from the current folder, without --root`: the same through `-` |
| "With --json and --log-file, a … log from another file has a file field naming it" | `a log from an imported file has a file field in --json and in --log-file`: `["parts/gears.pathogen", 7]` then `[undefined, 2]` in both |
| `pathogen-lang <folder>` compiles the pathogen.json `main` (docs/projects.md), and its imports start from the main's own folder | `a project folder compiles its main, and the main imports from its own folder`: main in `src/`, `./parts/gears.pathogen` beside it |

Already tested before this step: the `-e` + `--root` case, a warning's `file` on stderr and in `--json`, `--print-logs` labels, load errors.

`runCli` gained an optional working folder (its third argument; the repo root as before by default). `oneFileGear()` is the reference drawing: the same gear written in one file, so each test checks the import against plain code, not against another import. It runs once, and checks that it starts at the star's first point, `M 55 10`, so two empty outputs can't match.

## Code review

Approve. Two suggestions, both taken: compute the reference once, not per test; and pin that it isn't empty.

## Checks

- The CLI "imports" tests: 21 passed. The whole CLI file (142) passed in the commit's tree alone.
- Prettier also reflowed six long lines in the same `describe` block, written in earlier phase 1a steps. Formatting only.
