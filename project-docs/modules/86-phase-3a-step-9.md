# Phase 3a, step 9: three surfaces, the CHANGELOG (build record)

Note 76's step 9: "One program through the CLI, VS Code and the playground, outputs compared; the CHANGELOG (for your approval); the push, API first."

2026-11-25. The user, after step 8's pushes: "Go ahead and push, then move onto step 9, however we are not quite ready for #3 yet...let's add that to the backlog." #3 was the release: the npm package and the VS Code extension. It's on `backlog.md` under "Release", with what the published docs describe that the released tools don't have yet.

## The three surfaces

`verify/verify-3a-step9-surfaces.ts`, 14/14 (`verify-3a-step9-surfaces-results.json`). One project, each surface through the code it ships:
- **CLI:** the built `dist/cli.js` (the package's bin), `--json`, then `--output-svg-file` and `--png` (`3a-step9/cli.svg`, `cli.png`);
- **VS Code:** the extension's `out/preview-modules.js` with its bundled library reads the project from disk, and the real webview page (`out/webview-html.js`, under its CSP, with the bundled compiler) draws it (`3a-step9/vscode-preview.png`). The `.vsix` was rebuilt for this (`npm run build:vscode`);
- **playground:** the real dev playground, signed in, a saved workspace holding the same files. The owner's load leaves `data/pad.json` deferred, so it's read by hash (`3a-step9/playground.png`).

The program touches each rule of docs/data-import.md:
- a module that imports data;
- the same data file imported by two files;
- a copy changed while the file's objects stay fixed;
- GeoJSON read as JSON;
- keys in the file's order (`"b"`, `"2"`, `"a"`; `JSON.parse` would put `"2"` first);
- a bracket key with a space;
- `length` in brackets;
- an angle given its unit;
- a missing key;
- two large files.

**Result:** the three drawings are the same, path by path, within 1e-9. Then one JSON mistake (a missing comma in `order.json`): the CLI's `data/order.json line 4, col 3: expected , or } after a key's value` / `imported from main.pathogen line 5`, in the same words in VS Code's preview errors and in the playground's error panel.

## Found and fixed: a warning listed as an error

The first run's error panel held two entries, under the "2 errors" badge: the JSON mistake, and `main.pathogen Line 38: data/beam.json has no key width.` That second one is the editors' data-key warning (step 3; docs/data-import.md "In the editor": an underline).

- **Cause:** on a failed compile, `_readFailure` (workspace-view) read every diagnostic `getDiagnostics` gave. Before 3a, a failed compile's diagnostics held no warnings in practice: fonts aren't passed there, and evaluator warnings come only from an evaluation that succeeds. Step 3's data-key check runs before the evaluator, so its warnings came along with the error.
- **When users saw it:** live since 2026-11-24, whenever a program with a key no item has also failed to compile. Someone fixing the real error saw a second "error" on a line that isn't wrong.
- **Fix:** `readDiagnostics` (`services/error-place.ts`) reads errors only, and a diagnostic without a severity counts as one. `_readFailure` falls back to the compile's own message when no error is left. Before, a list of only warnings would have hidden the real error.
- **Tests:** in `tests/playground-error-place.test.ts`:
  - the real engine with a JSON mistake and a missing key: the panel's reading holds the mistake alone;
  - only warnings: nothing read;
  - no severity: read as an error.
- **Browser check:** the step 9 check now passes only if the panel holds the JSON mistake alone, with no count badge.
- **Review** (code-reviewer): approve, nothing serious.
  - **Taken:** pin the no-severity case.
  - **Not taken:** reading "not a warning" in place of "an error". The panel lists errors, and anything else is an editor mark. And taking out the test's `window` stub: error-place finds a data file's path through `window.PathogenLang.DATA_EXTENSIONS`, so the stub is needed; a comment now says so.

## The CHANGELOG

The entry covers every commit since the last one (0b4805f1, 2026-11-23): notes 71 to 86 and steps 1 to 9. The draft is `tmp/phase3/changelog-3a-draft.md`; it waits for a content review and the user's approval before it goes into CHANGELOG.md.
