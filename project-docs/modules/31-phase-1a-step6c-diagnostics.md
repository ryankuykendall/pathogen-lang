# Phase 1a, step 6c, part 1: load errors in the Problems panel

2026-11-05. Step 6c (the language server, `26-phase-1a-step6-plan.md`) is split like 6b:
1. **`getDiagnostics` gets the files' load errors, an unsaved file's imports, and imported files' font messages** (this note; src only, all testable);
2. a shared document resolver in `src/node` (root, entry, open buffers, resolveModules) for the server and step 6d's preview;
3. the server's wiring (graph per document, every handler, dependents, watched files, completion's textEdit and File kind, rename's ResponseError);
4. fonts across files in the server (`resolveFontsInFiles`).

## Why

`getDiagnostics(doc, { modules })` had no input for what resolveModules couldn't load. With a graph that's missing a file, the editor showed only the evaluator's generic `Cannot import "…": the file was not loaded.`, at column 1. The CLI says why: not found, not a module, a cycle, a bad path. The editor should too. docs/modules.md's Errors table also has a row the code never produced: `An unsaved file in VS Code`.

## Before and after

| | Before | After |
|---|---|---|
| `import { gear } from "./parts/gera.pathogen"` (missing) | `Cannot import "./parts/gera.pathogen": the file was not loaded.` at col 1 | `import file "./parts/gera.pathogen" was not found (looked for …).` at the path, as in the CLI |
| A file that isn't a module | the same generic text | the not-a-module message, at the path |
| A missing file two imports away | `parts/broken.pathogen line 2, col 1: Cannot import … the file was not loaded.` | `parts/broken.pathogen line 2, col 19: import file "./missing.pathogen" was not found (…)` + `imported from parts/deeper.pathogen line 3` + `imported from main.pathogen line 3`, on this file's import |
| A load error and a syntax error elsewhere | the syntax error only | both |
| An unsaved file with imports | (nothing produced it) | `Cannot import "./parts/gears.pathogen" until this file is saved: import paths start at the file's folder.` at each import, the docs' text |
| A font warning from an imported file's `@font` | at that line number in **this** file, without the file's name | on the import that leads there: `parts/family.pathogen line 2, col 1: …` + `imported from main.pathogen line 1` |

## Code

- `DiagnosticsOptions.loadErrors`. With load errors, `getDiagnostics` places each one, adds the document's own diagnostics and sorts by position. It skips the evaluator pass, since the run can't happen without the files; the CLI stops there too.
- `DiagnosticsOptions.fonts.messages[].file` (the `file` resolveFontsInFiles already sets) places the message on the import.
- `load-modules.ts`:
  - `describeInImportedFile`, the `file line N, col M: … / imported from …` text, now shared by `formatModuleLoadError` (the CLI) and the editor;
  - `unsavedImportErrors(source)`: one load error per import, at its path.
- `module-messages.ts`: `unsavedFileImportError`, worded as docs/modules.md's Errors table already had it.
- Exports: `unsavedImportErrors`, and `isModuleSource` (the server lists the project's modules with it, in part 3).

## Decisions

- **An error from another file sits at the import's path**, where the evaluator already put errors from other files, not at column 1.
- **Unsaved files go through load errors**, not a new option. The server passes `unsavedImportErrors(source)` for an `untitled:` document, so it never shows the playground's "no project folder" text, which says imports work in VS Code.

## Code review

Approve with one warning, taken. A font message from a file that isn't in the graph (or with no graph) fell back to its own line and column, numbers from another file, and squiggled that line in this one. It now goes at the top, still naming its file and line.

Also checked by the reviewer:
- Every early return in the split `diagnose` behaves as before without load errors.
- `runEvaluator=false` skips exactly the evaluation.
- The sort runs only with load errors, and is stable.
- `formatModuleLoadError`'s CLI text is byte-identical.
- Nothing filters on the new `pathogen-modules` source.
- The playground never passes load errors, so its first-diagnostic error panel is unaffected.

Tests added for the review:
- a font message for a file not in the graph, without a column (" line 3" alone);
- load errors with a parse error, and with a font message (the evaluator's NaN warning absent);
- an import cycle, on the import that starts it.

## Tests

tests/modules-editors.test.ts (10): each row above, word for word, and the review's cases. A missing file two imports away pins that `importedFrom`'s last site is this file's import.

## Checks

- tests/modules*.test.ts, tests/language-services/, tests/cli.test.ts, the language-server font tests: 1,435 passed (before the review's tests).
- The tree alone before the review's changes: 192 files, 8,347 passed, 0 failed.
- This commit's tree alone, with them: 192 files, 8,350 passed, 0 failed.
