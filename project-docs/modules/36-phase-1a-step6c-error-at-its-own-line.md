# Step 6c follow-up: an error in another file, at its own line

2026-11-05. Found in step 7 (`35-phase-1a-step7.md`, "A gap"). docs/modules.md "In each tool" (VS Code) and plan 12 decision 31 promise: "if that file is open, the error shows at its own line too". Step 6c never built it. You chose to build it ("Build it (Recommended)") over trimming the docs.

## Before and after

| | Before | After |
|---|---|---|
| `main.pathogen` calls `gear(…, 2)`; `assert(teeth >= 3, …)` fails inside `gear` in `parts/gears.pathogen` | main: the error on the call, naming `parts/gears.pathogen line 4`. gears, open: nothing | the same in main. gears, open: `assertion failed: a gear needs at least 3 teeth` / `  called from main.pathogen line 3` at line 4 |
| main fixed, or closed | — | gears' copy clears |
| An error while a file loads (`imported from`) | that file's own check shows it | unchanged: not sent, so it never shows twice |

## How

- **Language services** (`diagnostics.ts`): a `ModuleTraceError` with a site gets `Diagnostic.alsoIn = { file, range, message }` when:
  - the nearest step back is `called from`;
  - the error has a line;
  - its file is in the graph (so never this document's own code, such as a lambda an imported fn calls back).

  The range comes from the graph's text of that file (its open tab's text when it has one). The message is the error's words and its trail lines.
- **Server** (`cross-file-diagnostics.ts`, new, Node-free): `CrossFileDiagnostics` keeps each checked document's own diagnostics and what it sent, by file key (`samePathKey`). Every publish is `for(uri, key)`: own, then what other documents sent, each once.
  - `checked` replaces a sender's earlier entries and returns the files to publish again.
  - `closed` takes them back.
  - A check that returns early on a newer version changes nothing.
  - `server.ts` publishes only through `publish` / `publishTo`.
  - `DocumentModules.keyFor(uri, projectPath)` and `fileKeyOf(uri)` give the two sides one spelling.
- **Advice taken** (advisor, before building):
  - only `called from` errors are sent, so no text matching is needed to drop duplicates;
  - only the file the error happened in gets it;
  - the merge lives in its own class with unit tests;
  - LSP `relatedInformation` was left out: the docs only say the message names the line.

## Checks

- `tests/modules-editors.test.ts`, "an error in another file, at its own line" (6):
  - a direct call; a namespace and a name passed on; a call made while another file loads (every step back);
  - a load error isn't sent, and that file's own check shows it;
  - this file's own lambda isn't sent; no graph means nothing.
- `tests/language-server-cross-file.test.ts` (6): merge order; replace and clear; close; two senders with one error show it once, different trails show both; only the target file gets it; untitled documents. Also `keyFor` matches `fileKeyOf` for the same file.
- `verify-step6c-lsp.mjs`: 3 new checks over stdio. The caller opens first, so the file opened after still gets the error. Fixing the call clears it, and closing the caller clears it.
  - **19/19** on the package build; **19/19** on the server the `.vsix` ships.
  - Before the change the first check fails: `tmp/phase1/probe-open-file-error.ts` shows gears' own check finds 0 diagnostics, and the server only published what a file's own check found.
- Lint on the changed lines: the new class and the server additions are clean. Left as the surrounding code has them: `samePathKey` / `toLSPDiagnostic` used before their definitions, and the relative import of the server package in the test, as in `language-server-modules.test.ts`.
- `tmp/modules-manual-test/CHECKLIST.md` row 11b, for you in VS Code. The step uses a number where `gear` wants a Point (`gear(55, 40, …)`, so `center.x` fails at gears line 9). Two teeth draws fine there, because the sample's `gear` has no assert.
- Tree alone, before the review fixes (`d19a75c`): 196 files, 8,397 passed, 0 failed.

## Code review (approve, no blockers)

| # | Finding | Disposition |
|---|---|---|
| 1 | The close race is safe, but the guard that makes it safe is implicit: a check that ends after its document closed stops at the version check, before `checked()` | **Commented** at that check in `server.ts` |
| 2 | Only `publish` and the empty list on close call `sendDiagnostics` | Confirmed, no change |
| 3 | should-fix: no test that a linked folder or other letter case gives `keyFor` and `fileKeyOf` the same key | **Added**: the project opened through a linked folder, both ways round, and `PARTS/Gears.pathogen` on a case-insensitive disk |
| 3b | nit: `?? ''` in `publishTo` | **Changed** to an explicit null check |
| 4 | The range comes from the graph's text, which is the open buffer (`withOpenDocuments`). It can go stale while the other file is edited, but the importer is rechecked as a dependent | No change |
| 5 | `alsoIn` never reaches the wire (`toLSPDiagnostic` picks fields); the playground never deep-compares diagnostics | No change |
| 7 | nit: the duplicate test ignores the end of the range | **Changed**: it compares the whole range |

After the fixes: the two server test files (17), lint on the changed lines, `build:vscode`, and `verify-step6c-lsp.mjs` 19/19 on both servers. The final tree alone (`e0acfa6`): 196 files, 8,398 passed, 0 failed.
