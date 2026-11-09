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

## A question for you

- **`@font` with a file path in a workspace** (note 46, and `docs/workspace-files.md` "Uploading files"): keep today's warning, which suggests a Google Fonts family (recommended until font files can be added), or give the CLI's error?
