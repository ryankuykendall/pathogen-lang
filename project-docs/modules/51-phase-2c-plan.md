# Phase 2c: the compile path and language services, the plan

2026-11-08. Note 42 defines 2c: the playground compiles and runs its language services against the workspace's files, "compile the program the chip shows, fonts across files, diagnostics, completion and definition across files, file-aware errors and logs". Note 38 (§ "The compile path and language services") is the audit this builds on. 2c is plumbing: it adds no UI. The tree, tabs, chip and program list are 2d, so in 2c the editor still shows one file, the main.

## What the engine already has (survey, 2026-11-08)

- `resolveModules(entrySource, { host, entry })` (async) builds a `ModuleGraph` through a `ProjectFileHost` (`projectLabel`, `readFile(path)`). `compile`/`compileWithContext(source, { modules })` and every language service (`{ modules, projectFiles }`) are sync and take the graph as data. All of it ships in `window.PathogenLang`.
- No in-memory host exists outside a test (`tests/modules-editors.test.ts` `memoryHost`).
- Paths: the graph uses project paths with a leading slash (`/parts/gears.pathogen`); a workspace's keys have none. Logs, warnings and `ModuleTraceError` carry the label without the slash; load errors, `Location.file` and `alsoIn` carry the project path.
- The worker posts only `e.message` on failure, so a `ModuleTraceError`'s file and trail must come from the message (it already reads `parts/gears.pathogen line 3, col 3: …`) or from `getDiagnostics` on the main thread.

## The pieces, in order

1. **The workspace rules move into the engine** (`src/workspace/`): names, limits, `checkManifest`, the manifest hash (`contentHashOf`). `website/api/workspace-files.ts` re-exports them, and the browser bundle exports them, so the server and the playground share one copy, as note 50 planned ("the server and the playground import the same file"). The playground's build is unbundled and can't import from `website/`.
2. **An in-memory project host** in the engine (`createMemoryProjectHost(files, { label, folders })`): `readFile` maps a project path to a workspace key, and answers `not-found` (naming the workspace path), `case-mismatch`, `folder`, as the CLI's host does on disk. Tested like the Node host.
3. **The store holds the workspace:** every file's text, the folders, `entryPoints`, the open file (the main in 2c) and the shown program (the main until the chip exists). `code` stays the open file's text, so the editor is unchanged. A load fills them from `files` (or from `code` for a server answering in today's shape).
4. **The compile:** `compileAs` takes the workspace. On the main thread, before posting, it resolves the shown program's imports through the memory host. Load errors skip the compile and show as errors at the import, as the CLI does. Fonts: the existing plan-then-fetch runs over every file in the graph, and the results merge.
5. **Errors and logs name their file:** the error panel shows the file and line of an error in another file; the open file's diagnostics come from `getDiagnostics` with `{ modules, loadErrors }` (today it passes none, so a workspace with imports would show the no-project-folder error); warning squiggles only mark the open file; console lines for another file say which. Clicking a file name opens it in 2d.
6. **Language services:** completion, hover, signature help and diagnostics get `{ modules, projectFiles }` from a graph whose entry is the open file. Graph objects are reused while sources don't change, so `analyzeFile`'s cache holds (note 38: rebuilding per keystroke re-analyzes every file). Go-to-definition into another file needs "open this file at this position", which arrives with the tabs in 2d; until then a definition in another file isn't offered.
7. **Autosave sends files** for a workspace with several files (`{ files, baseRev }`: the changed texts, the rest by hash), and its dirty check uses the shared hash. A one-file workspace keeps sending `code`, which every server version accepts.

## Checks

- Unit tests for the rules' new home, the host, the store's load, the compile with imports (an error in a library, a missing import, fonts in a library), the language-service options, and autosave's payload.
- On `npm run dev:stack`, a workspace with several files created through the API: the preview draws main with a library's fn; an error in the library names the library and its line; a completion offers the library's exports; the console names the library for its logs; a save sends `files` and reloads the same.
- The full suite; the CLI and VS Code unchanged (the engine changes are additions and a move).

## Built (2026-11-09)

- **Pieces 1–2** (commit `9dec97d`): the rules in `src/workspace/files.ts`, exported to the bundle with workspace prefixes; `createMemoryProjectHost` in `src/host/memory-host.ts`.
- **Piece 3:** `playground/services/workspace-files.ts` and five store fields (`workspaceFiles`, `workspaceFolders`, `workspaceEntryPoints`, `openFile`, `shownProgram`), reset on every workspace view and set by a load. A page with no workspace (a scratch link, a new workspace) is just its `code`.
- **Piece 4:** `compileAs` takes `options.workspace`; `resolveWorkspaceImports` reads the program's imports on the main thread and posts `modules`; load errors stop the compile (`WorkspaceLoadError`); `resolveFontsForFiles` loads `@font` from every file in the graph.
- **Piece 5:** the error panel names the file and line of an error in another file; a missing import is marked at its line; console lines from an imported file name it; warnings from another file don't mark the open file.
- **Piece 6:** `playground/services/workspace-modules.ts` keeps the open file's graph (rebuilt only when another file, the open file or its import lines change); completion, hover, signature help and go-to-definition use it.
- **Piece 7:** autosave's dirty check uses the server's hash; one file still saves `code`, several save `files` (changed texts, the rest by hash); the pending edit's workspace is taken when the edit happens, so a save after a workspace switch can't mix two workspaces (the existing switch tests caught this).

**Checked:** `tests/playground-workspace-files.test.ts`, the existing autosave and compiler tests, the full suite, and `verify/verify-2c-playground.ts` against `npm run dev:stack`: the preview draws main with a library's fn, the library's log names it, completion offers the import, a save sends `files` and the server holds it, an error in a library names the library, a missing import is reported at its line. `verify-storage-step3-playground.ts` still passes for a one-file workspace.

**Review** (a code review of pieces 3–7): no critical findings. Fixed:
- A failed import-graph build in the compile's error path threw past the error panel; now the compile's message shows.
- Autosave kept the pending edit's workspace after the save, which in 2d (other files editable) could resend an old copy of another file; it's cleared with the pending edit.
- A save answering after another workspace loaded wrote its revision, saved hashes and status into the new workspace's state; it now leaves them alone (the page-teardown save too).
- A save sends every file the workspace keeps, so a file a load answered without its text (a data file or font, after phase 2) would have been dropped. None can exist yet; if one does, the workspace isn't saved, and an error says why.

Noted for 2d: the error path places errors against the open file's graph, which assumes the program shown is the open file; once the chip can show another program, errors must be placed against that program's graph.

**Import-path completion** (2026-11-09, after your "go ahead with import-path completion"): inside an import's quotes the editor lists the workspace's libraries.
- The bridge (`cm-completion-bridge.ts`) recognises the cursor inside an import's path (`importPathBeforeCursor`) and completes there with nothing typed yet. An item's own `range` sets what it replaces, the whole path typed so far, slashes and dots included. A library shows with the module icon (`file` → `namespace`).
- Typing `"`, `'` or `/` in an import's path opens the list (`cm-language-services.ts`).
- The older completion source returns nothing inside an import's path, so its keywords don't bury the libraries.
- Checked: three cases in `tests/playground-workspace-files.test.ts` and three in `tests/playground-legacy-completion-deferral.test.ts`; in the browser, typing `import { gear as g } from "./` opens a list with `./parts/gears.pathogen` (`verify-2c-playground.ts`).

**Left in 2c:** nothing of the code. For later:
- **Go-to-definition into another file** needs "open this file at this position", which comes with the tabs (2d). Until then it jumps to the name's import, as before.
- **Snapshots** of a workspace with several files keep only the shown program's text (`renderedCode`); 2e makes them carry every file.
- **Messages** from the loader say "project folder" and "on disk", which reads oddly in a workspace; their workspace wording belongs to the docs round that publishes `docs/workspace-files.md`.

## A question for you

- **`@font` with a file path in a workspace** (note 46, and `docs/workspace-files.md` "Uploading files"): keep today's warning, which suggests a Google Fonts family (recommended until font files can be added), or give the CLI's error?
  - *Answered 2026-11-09: "Keep the warning."* The code already does (`fileFontNotice`, for every file in the graph since piece 4); the `[TO DECIDE]` mark in `docs/workspace-files.md` is removed.
