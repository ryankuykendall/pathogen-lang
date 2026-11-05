# Phase 1a, step 6c, parts 2 and 3: the language server loads imports

2026-11-05. Parts 2 and 3 of step 6c (`31-…` lists the parts), one commit: the shared document resolver, and the server wired to it. Fonts across files follow in part 4.

## Before and after (VS Code, through the language server)

| | Before | After |
|---|---|---|
| A document's imports | never read: every import was the playground's "no project folder" error | read through the open buffers (unsaved edits in an imported file count), with the CLI's loader |
| Hover, definition, completion, parameter hints | one file (6b's cross-file features unused) | with the document's files: everything step 6b built |
| Go-to-definition on an imported name | the import line | opens the other file at the name (`file:` URI from the project path) |
| Completion in an import's quotes | — | the project's modules, kind File, replacing exactly the typed path (a textEdit), opened by `"` or `/`. A `/` anywhere else opens nothing |
| F2 on an imported or exported name | renamed in one file | refused: VS Code shows the reason (a ResponseError from prepareRename, and from rename for a client that skips it) |
| A missing file, a non-module, a cycle | — | at the import, in the CLI's words (step 6c part 1) |
| Editing an imported file in another tab | the importer kept its old results | the open files that import it, directly or not, are checked again |
| Closing an imported file with unsaved edits | — | its importers are checked against the disk again |
| A file created, changed or deleted on disk | — | every open document is checked again, and the project's module list starts over (didChangeWatchedFiles; the client watches `**/{*.pathogen,pathogen.json}`) |
| An unsaved (untitled) document | not sent to the server at all (`scheme: 'file'` only) | checked; each import says `Cannot import "…" until this file is saved: import paths start at the file's folder.` |

## Code

- `src/node`:
  - `resolveEditorModules(filePath | null, source, openText)`: finds the project folder and the document's project path, then runs resolveModules through `withOpenDocuments`. An unsaved document gets `unsavedImportErrors`. One without imports reads nothing.
  - `editorModulePaths`: the absolute paths of the files it imports.
  - `listProjectModules(root, { maxFiles = 2000 })`: the folder's `.pathogen` files that start with `module;`, skipping `node_modules` and dot folders, breadth first.
  - The preview (step 6d) uses the same resolver: two processes, one rule.
- `packages/pathogen-language-server/src/modules.ts` (`DocumentModules`):
  - `refresh` runs at each check, before fonts;
  - `optionsFor` is synchronous, so requests never touch the disk;
  - `loadErrors`, `uriFor`, `dependents` (by absolute path, since two open documents can have different project folders), `filesChanged`, `forget`;
  - the project list is cached per folder and filled in the background.
- `server.ts`:
  - every request passes `optionsFor(uri)`;
  - definition turns `Location.file` into a URI;
  - completion: the `"`/`/` filter, `range` becomes a textEdit, kind `file` becomes `CompletionItemKind.File`;
  - rename returns the refusal as a ResponseError;
  - `scheduleValidation` serves a document and its dependents;
  - `onDidClose` rechecks dependents, and `onDidChangeWatchedFiles` rechecks all.
- `packages/vscode-pathogen/src/extension.ts`: `untitled` documents, and `synchronize.fileEvents` with a watcher kept in the context's subscriptions.

## Decisions and limits

- **The project list fills in the background** after a document's first check. The first `"` in a brand-new session may offer nothing until it lands. It's cached per folder and cleared by any watched-file event.
- **Watched files cover the workspace folders.** VS Code's watcher only sees inside them. A project folder outside the workspace (a single file opened alone) gets no disk events. Edits in open tabs are still seen, which is what the docs promise ("editing or saving an imported file rechecks the open files that import it").
- **`pathogen-lang/node` grows from 20 KB to 197 KB**: the resolver needs the parser to read imports (`planImports`, `isModuleSource`). The server and the extension host already load the 1.6 MB main bundle, so this is memory for a second copy of the parse tables, not a new dependency.
- **Every open document is rechecked on a disk event.** There are rarely more than a few, and an exact dependency check would miss a document whose import couldn't find the new file before.

## Code review

Request changes: one critical finding and four warnings, all taken. The fixes are tested; there was no second review.
- **Critical: a slow refresh overwrote a newer one.** The server checks v1, starts a slow read; v2's finishes first; v1's then reset the graph that hover and completion read. A refresh still in flight after a close also re-added the document. Now each refresh gets a number from one ever-growing counter. Only the document's latest is kept, and `forget` drops one in flight. A test drives both orders with a resolver whose reads finish on command.
- **Matching paths**: `dependents` and the open-buffer lookup compared resolved path strings, so a linked folder or other letter case missed a dependent and read the disk instead of the buffer. Both now compare `samePathKey`, the real path on disk. Tested with a linked folder, and with letter case where the disk ignores it.
- **`fileURLToPath` throws** on a `file://host/…` URI, inside synchronous handlers. `filePathOf` now returns null for it.
- **The rename error code** is `LSPErrorCodes.RequestFailed` (the request was valid; the rename isn't), not `InvalidRequest`. Whether VS Code shows the text is for the step 6e check in a real VS Code.
- **`listProjectModules`** now bounds the `.pathogen` files it looks at (programs too), not only the modules found. It reads only the first 64 KB of each file. Links are not followed.
- **Trigger characters**: the verify script now checks a `"` opening an ordinary string, a `/` in `calc()` and one in a comment, which all open nothing. A `"` inside a style value (`font-family: "`) opens nothing too, as before (`"` wasn't a trigger at all).
- The prettier reflow of three existing places in extension.ts is formatting only.

The tree-alone run before these fixes found one more thing: tests/cross-channel-parity.test.ts compares the server's trigger characters with `src/language-services/feature-catalog.ts`. The catalog now lists `"` and `/`. The test's parser read `'"'` as two entries; it now matches each string to its own quote.

## Tests

- tests/node-editor-modules.test.ts (9): the resolver on real folders (project folder, its own `./`, open buffers, load errors, an unsaved document, no reads without imports), and `listProjectModules` (programs, `node_modules` and dot folders skipped, the bound, a long comment before `module;`).
- tests/language-server-modules.test.ts (10): `DocumentModules`. Options without reading, open buffers, dependents and `forget`, a linked folder and letter case, a host URI, `uriFor`, the project list and `filesChanged`, an unsaved document, a document never checked, the refresh race.
- `project-docs/modules/verify/verify-step6c-lsp.mjs`: the **built** server driven over stdio as VS Code drives it, on a real folder. 15/15 (results in `verify-step6c-lsp-results.json`):
  - hover, definition into the other file, parameter hints, namespace completion;
  - F2's refusal text, path completion with File kind and textEdit;
  - `/` or `"` elsewhere opening nothing (four places);
  - an imported buffer's edit rechecking the importer;
  - a missing file's error cleared by didChangeWatchedFiles after it's created;
  - an unsaved document's message.

## Checks

- The tree alone before the review's fixes: 194 files, 8,364 passed, 1 failed (the parity test above, fixed).
- This commit's tree alone, with them: 194 files, 8,369 passed, 0 failed.
