# Phase 1a, step 6d: imports in the VS Code preview

2026-11-05. Step 6d of `26-phase-1a-step6-plan.md`. docs/modules.md "In each tool":
- "editing or saving an imported file rechecks the open files that import it, and the preview redraws";
- "The preview: it shows the file you're editing. A module doesn't draw, so its preview is empty; to see its fns draw, open a program that imports it."

## Before and after

| | Before | After |
|---|---|---|
| A program that imports a module | compiled in the webview without files: `Cannot import "…": this program has no project folder to read files from.` | the extension host reads the files (open tabs over the disk, the language server's resolver) and sends them; the webview draws what the CLI draws |
| A module on show | an empty canvas, nothing said | empty, with the notice: `This file is a module: a module doesn't draw, so its preview is empty. To see its fns draw, open a program that imports it.` |
| A missing file, a non-module | the no-project-folder error | the CLI's message (`main.pathogen:1:22: error: import file … was not found …`), which stops the compile like a font error |
| An error inside the imported file | — | its trace, `parts/gears.pathogen line 7, col …` / `called from main.pathogen line 4` |
| Typing in an imported file's tab | nothing | the preview of the file that imports it redraws, with the unsaved text |
| An imported file changed, created or deleted on disk | nothing | redraws (a `**/*.pathogen` watcher, while the document has imports) |
| An imported file's `@font` | not loaded | loaded for the preview, its `./` from its own folder; a problem names the file |
| An unsaved document with imports | the no-project-folder error | `Untitled:1:22: error: Cannot import "…" until this file is saved: import paths start at the file's folder.` |

## Code

- `packages/vscode-pathogen/src/preview-modules.ts` (no `vscode` import, tested):
  - `previewModules(libs, filePath, source, openText)` runs `resolveEditorModules` and gives `{ message, graph, errors, notices, watched }`;
  - the graph goes as `files` entries, since postMessage would turn a Map into `{}` without an error;
  - `MODULE_PREVIEW_NOTICE`;
  - `modulesForCompile` is the reverse, which the webview's script does inline;
  - `samePathKey` matches tabs to files by real path.
- `preview.ts`:
  - `send` reads the imports before fonts, then posts `modules`, plus import errors and notices with the font ones;
  - it redraws on an edit to a watched file's tab, and on a `.pathogen` disk event while the document imports anything;
  - `openBufferText` gives tabs over the disk.
- `font-session.ts`: `load(source, filePath, modules?)` uses `resolveFontsInFiles` for imported files with `@font`, with each one's plan and stamps in the key. An imported file's message reads `parts/labels.pathogen line 2, col 1: …`.
- `webview-html.ts`: `lastModules` is rebuilt as a Map from the update and passed to `compile`.

## Decisions

- **Import errors ride the update's `errors`**, which already stop the compile for a font error, as in the CLI. No new message type.
- **The module notice uses the existing notices bar** (the advisor's "existing status message"; notices are where the preview already explains itself), in the docs' words.
- **The disk watcher redraws on any `.pathogen` change while the document imports something.** That's cheap, and it also catches a file the document couldn't find being created.

## Tests

- tests/vscode-preview-modules.test.ts (6):
  - the files as JSON draw what one file draws;
  - an open tab's text wins;
  - a missing file's error in the CLI's words;
  - an unsaved document;
  - a module's notice, word for word;
  - no imports, no reads.
- tests/vscode-font-session.test.ts (+3): an imported file's `@font`, its problem naming the file, editing it.
- `project-docs/modules/verify/verify-step6d-preview.mjs`, after `npm run build:vscode`. It runs the shipped `out/` code with the bundled libraries, and the real webview page under its CSP in headless Chrome:
  - a program importing a module draws what the CLI draws;
  - a module is empty with its notice;
  - a missing file shows its error;
  - an unsaved edit with an error in the imported file shows the trace;
  - no CSP violations.

## Code review

Approve, with one warning, taken. When an import fails ("not found"), there are no files to watch, so creating or fixing that file in another tab didn't redraw until the document itself changed. Now, while an import of the document can't be loaded, any edit in a `.pathogen` tab redraws (`importFailed`). Also taken:
- the webview checks `files` is an array before making the Map;
- tests for nested imports (order and watched include the file imported through another) and for one import that loads beside one that doesn't.

Noted, not changed:
- `compile(source, {})` equals `compile(source, undefined)`: evaluate reads every option with `?.`.
- The hand-written `PreviewLib`/`PreviewNodeLib` types follow font-session.ts's pattern. tests/vscode-preview-modules.test.ts passes the real modules, so it checks they still fit.
- The disk watcher covers the workspace folders only, as the language server's does (`32-…`).
- A bundled library without `resolveFontsInFiles` would load only the document's fonts. The bundle is built with it; the optional field is for test stubs.
- A save of the previewed document itself draws twice (edit, then disk event), debounced.

## Checks

- verify-step6d-preview.mjs after `npm run build:vscode`: 8/8 (results in `verify-step6d-preview-results.json`). The preview's numbers match the CLI's to 1e-9: trig differs in the last bit between Chrome and Node, as the phase 0b fonts harness found.
- tests/vscode-preview-modules.test.ts (8), vscode-font-session.test.ts, all-syntax-fixture.test.ts: pass.
- The tree alone before the review's changes: 195 files, 8,383 passed, 0 failed. The harness was rerun after them: 8/8.
- This commit's tree alone, with them: 195 files, 8,385 passed, 0 failed.
- The phase 0b fonts harness (verify-vscode-fonts.mjs) needs the network for Google Fonts and wasn't rerun; the font session's unit tests cover the change.
