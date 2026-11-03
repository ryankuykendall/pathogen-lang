# Phase 1a, step 3: running modules

2026-11-03. Plan: `12-phase-1-plan.md` "Step 3" plus its amendments. Steps 1 (`023dd75`) and 2 (`6e755dd`) came before; the CLI wiring planned for step 2 is here.

## What this step delivers

| Piece | Where | What it does |
|---|---|---|
| `compile(source, { modules })`, `compileWithContext(…, { modules })`, `getDiagnostics(doc, { modules })` | src/index.ts, diagnostics.ts | The graph from `resolveModules` goes in. Without it, an import is still the no-project-folder error |
| `loadModules` | evaluator/index.ts | Each imported file runs once, dependencies first, in a state of its own (`newEvaluationState`, now shared with `evaluate` and `evaluateWithContext`). Its exports are collected (`exportsOf`), and its logs and warnings join the compiled file's, labelled `file`. Its drawing, layers and ViewBox stay in it |
| `case 'ImportDeclaration'` + `bindImport` | evaluator/index.ts | Named imports and `* as`, bound fixed (`consts`) and remembered in `Scope.imports`. Assigning or declaring again names the file: this is the run-time backstop for the static checks, which step aside when a name is also used as a parameter (step 1 review, finding 4) |
| `ModuleNamespaceValue` | types.ts, evaluator/index.ts | Member reads and calls through the dot. `gears.gear(…);` as a statement takes the plain-call route, so it draws (`peekValue` sees the namespace without running anything). It displays as `module <file>` in logs and template literals |
| `ModuleTraceError` + `acrossFiles` | evaluator/module-runtime.ts, evaluator/index.ts | An error raised in another file names that file and line, then adds one `called from` / `imported from` line per file boundary, and knows its `site` in the compiled file. Every place code from another file can run is wrapped: direct calls, namespace calls, the variableOffset / Grid / array callbacks, subscriptions |
| `runningFile` | evaluator/index.ts | A warning or log raised in another file's code names it, even though it lands in the caller's list |
| `lastStatementLine` | evaluator/index.ts | An error from another file with no position of its own gets its statement's line (the amendment). Errors in the compiled file keep their text |
| `viewbox` follows the call | evaluator/index.ts | Decision 28: read from `programStateOf(origin.evalState)`. Path and text blocks carry `_programState`, so reads inside `@{ }` and `&{ }` still see the program's box. A one-file program reads the same box as before |
| CLI | src/cli.ts | `projectForCli` (factored out of font loading, same rules), `loadModulesForCli` (a load mistake exits 1: `file:line:col: error:` in the compiled file, the chain elsewhere), the graph passed to the compile, and logs and warnings labelled with their file |

## Checks

- **`tests/modules.test.ts`** (35), following docs/modules.md section by section, with the gears fence of each section:
  - the first example equals the same code in one file, through `compile` and `compileWithContext`;
  - named, `as`, namespace and re-export, plus every binding error word for word;
  - the runtime backstop for assignment;
  - isolation (drawing, layers, ViewBox, logs with `file`), each file run once, a warning from another file labelled;
  - drawing into your layer, `viewbox` following the call (also inside a path block);
  - each "Errors in other files" example word for word: a call, three files, calls within one file not listed, a parse error, two imports deep, a positionless error;
  - compiled-file errors unchanged; the `site`; editor diagnostics at the call and at the import;
  - callbacks across files; a lambda called back; namespace display, parameters and aliases.
- **`tests/cli.test.ts`**, "imports" (8 tests):
  - the same output as one file;
  - the error trace;
  - an entry-file load error in `@font` style, and a nested one with its chain;
  - `--print-logs` labels, and warning labels on stderr and in `--json`;
  - `-e` with `--root`;
  - a file outside `--root`.
- **Probes:** the VS Code modules fixture through the CLI renders the same two gears as the single-file probe (`tmp/phase1/modules-fixture.png`). The namespace edge cases are in `tmp/phase1/probe-namespace-edges.ts`.
- **Benchmark (review finding 3)** (`tmp/phase1/bench-step3.ts`): the step 2 compiler against this one, one-file programs, medians of 31 runs while the audit ran:

  | Program | Change |
  |---|---|
  | sort 20k | +1.7% |
  | fn calls 30k | +4.9% |
  | Grid.map 200 × 200 | −49% |
  | map 30k | +9.8% |

  The figures swing ±50% between runs on the sub-20 ms cases, so I see no systematic cost. One-file loops make no extra closure since the fixes.
- **Semantics audit and full suites:** see the commit message.

## Code review (request changes: minor; all addressed)

| # | Finding | Disposition |
|---|---|---|
| 1 | `callbackError` and the Grid/sort rewrappers flattened a cross-file trace, dropping its site | **Fixed**: a `ModuleTraceError` passes through all five; tests for map, filter, sort |
| 2, 5 | `lastStatementLine` and `runningFile` were stale or not re-entrant | **Fixed**: `acrossFiles` restores both, and `evaluate`/`evaluateWithContext` save and restore them around each compile |
| 3 | A closure per callback even with no modules | **Fixed**: `crossesFiles` is decided once per call, before the loop; direct calls go through `runUserFunctionBody` without a closure. Benchmarked (above) |
| 4 | Non-evaluator errors (cancellation, RangeError) got wrapped | **Fixed**: only plain `Error`s are traced; other classes pass through |
| 6 | Each imported file is parsed twice (Lezer in the loader, `parse()` here) | Known cost, noted. The loader needs only the tree, the evaluator the AST |
| 7 | Namespace edge cases | Probed. Truthiness, template literals (fixed: `module <file>`), aliases, parameters and enum members in `case` work. `==` and assignment give the existing clear errors; **step 4** words assignment to an imported namespace or value as "imported values are fixed" |
| 8 | viewbox at an imported file's top level reads its own box | As decided (decision 28) |
| 9 | Compiled-file errors reached through another file are traced | Kept (informative); the comment is corrected and there's a test |
| 10, 11 | CLI refactor and formatter labels | Confirmed; the step 2 tests pass |
