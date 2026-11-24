# Phase 3a build: step 4, VS Code

2026-11-24. Note 76's step 4: data imports in VS Code's preview and language server, and the extension's first setting. Nothing is pushed.

## Before and after

| | Before | After |
|---|---|---|
| A program whose only import is data | The preview sent no files: "the file was not loaded" | It draws, as the CLI does |
| An unsaved edit to a data file | Nothing (the preview and the server watched `.pathogen` tabs only) | The preview redraws; the open files that import it are checked again |
| A data file saved, created or deleted | Nothing | The same, through the file watchers |
| `pathogen.maxDataSize` | — | The extension's first setting (whole megabytes, default 50); the preview, its miniatures and the server read with it, and a change takes effect at once |
| Completion of a bracket key | — | The server sends `filterText` (`.length`) and the range from the dot as a `textEdit` |
| `import gears from "./` | Modules | The project's data files (`pathogen.json`, `node_modules` and dot folders left out) |

## What was built

- **`src/node`:**
  - `resolveEditorModules(…, { maxDataBytes })`;
  - `editorModulePaths` lists data files too, so an edit to one rechecks;
  - `listProjectDataFiles(root)` for path completion.
- **The preview** (`preview-modules.ts`, `webview-html.ts`): data files cross `postMessage` as text (a value's Maps wouldn't survive). The webview reads each again with the bundled `readJson`, and keeps the value while the text is the same.
  - A program with only data imports gets its graph now.
  - Edits to open data tabs and data files on disk redraw.
  - The miniatures' drawing thread receives the setting with each draw.
- **The language server** gets data files' unsaved text through a notification of its own, `pathogen/dataFile`, which the extension sends a moment after typing stops, and takes back when the tab closes. Putting JSON in the client's document selector would have registered Pathogen's hover, completion and diagnostics on every JSON file. The server only reads data files for the files that import them, and rechecks those. `pathogen/settings` carries the setting. Both names are in `extension.ts` and `server.ts`.
- **`packages/vscode-pathogen/src/data-files.ts`:** the extension's copy of the data extensions (its build can't import `src/`), pinned to the language's list by a test, and the watchers' glob `**/*.{pathogen,json,geojson,topojson,fold}`.
- `readJson`, `dataFormatOf`, `DATA_EXTENSIONS` and the data types are exported from the library.

## Checks

- `tests/data-import-vscode.test.ts` (20): the extension's copy, the helpers, the preview's message (a JSON round trip compiles like inline data; an open buffer counts; the limit), the server's view (dependents, unsaved text, the setting, the file list).
- `tests/vscode-preview-panel.test.ts` (2 new): through a stand-in for VS Code, an edit to an open data tab redraws with its text; the setting stops a large file, and raising it draws. The stand-in gained `getConfiguration` and `onDidChangeConfiguration`.
- **`project-docs/modules/verify/verify-3a-step4.mjs` (15/15)**, after `npm run build:vscode`:
  - the extension host's side as shipped;
  - the real webview under its real CSP drawing what the CLI draws (within 1e-9) and redrawing on an unsaved data edit;
  - the bundled language server over stdio: the warning (severity 2), hover, keys and the bracket key's `textEdit` and `filterText`, data paths, the recheck on `pathogen/dataFile` and its undo on close, and the setting both ways.

## Code review

No critical findings, four warnings, all taken:
1. **Fixing a broken data file, unsaved, didn't recheck its importers in the server:** a file that failed to load wasn't one the document depended on. The loader now reports the files it tried and couldn't read (`unread`), and `editorModulePaths` includes them, so the preview and the server both watch them. The most common data edit, mending a JSON mistake, now rechecks.
2. **Any JSON change on disk did work everywhere.** `package.json`, build output and `.vscode/*.json` match the watcher. Now a data file the program shown doesn't read changes nothing in the preview unless one of its imports failed. In the server, a data file changed in place rechecks only the documents that read it. Creating or deleting one still refreshes all, since it may be the missing one and the path list changes.
3. **A setting changed while the server started was lost.** The listener is now registered first; the value is sent once the server is up; a server that fails to start says so.
4. **A large data file went to the server after every pause in typing.** The pause now grows with the file: 150 ms, plus 100 ms for each MB, at most 2 s.

Nits left: the watcher's glob is case-sensitive on Linux (`GEARS.JSON` isn't watched there, though it imports); the extension's and the preview's checks of the setting are two copies of one rule.

## Decided while building (confirm or overrule)

1. **The setting is whole megabytes from 1,** as the CLI's flag is. Any other value counts as not set (50 MB).
2. **Data files' unsaved text reaches the server after a pause in typing** (150 ms, longer for a large file), not on every keystroke.

## Still to do on VS Code

- The installed `.vsix` in a clean VS Code, by hand (step 9, with the release checks): open a project with data, hover, complete, edit the JSON and watch the preview.
