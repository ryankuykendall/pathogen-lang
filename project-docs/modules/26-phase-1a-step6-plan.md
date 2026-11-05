# Phase 1a, step 6: the surfaces (plan of sub-steps)

2026-11-05. Step 6 in `12-phase-1-plan.md`, after step 5e (`24-`) and the pen-helper follow-up (`25-`). The user-facing contract is already written and approved: docs/modules.md "In each tool" (step 5e docs), and docs/syntax.md "Built-in names" for the quick fix. So each sub-step starts at tests, one test per promise in those docs, word for word where the docs give the words.

Like step 5, the step is split into commits.

## What exists (surveys, 2026-11-05)

| Surface | Done | Missing |
|---|---|---|
| CLI | load errors (decision 31); warnings with `file` on stderr and in `--json`; `-e` + `--root`; `--print-logs` labels | tests only: a log's `file` in `--json` and `--log-file`; stdin with an import; `-e` importing from the current folder without `--root`; a folder + `main` that imports |
| Language services | `getDiagnostics(doc, { modules })`; imports declared in scope analysis (`kind: 'import'`); "imported name" hover; keyword hovers and completions | hover with the export's signature and file; go-to-definition into the other file; completion in `import { }`, in the path string, after `ns.`; signature help (no params even for local fns); rename refusal; the quick fix on an import is untested |
| Language server | font diagnostics for the document's own `@font` | no graph: `getDiagnostics` gets no `modules`; no dependency index; no `didChangeWatchedFiles`, no client `synchronize`; an imported file's `@font` isn't planned |
| Preview | fonts for the shown document | compiles without `modules` in the webview; re-renders only on the shown document's edits; no notice for a module |
| Playground | `import` and `export` errors (tested through `compile` and `getDiagnostics`) | a check in the real error panel (T9) |

## Sub-steps

**6a: CLI (tests, fixes if any fail).** The four missing tests above.

**6b: language services across files.**
- One options type that every service takes, `{ modules?: ModuleGraph }`, the way `getDiagnostics` already does. The graph comes in as data, so the services stay free of Node and work unchanged in the playground. (Not the plan's `resolveImport` callback: the graph already holds every imported file's source and resolved paths.)
- An imported file's exports come from running scope analysis on its source in the graph (tree-first rule). A small cache keyed by the source string.
- `Location` gains an optional `file` (the project path, as T14 allows "a URI (or file)"); none means this document. The server turns it into a URI.
- Hover: the export's signature and its file. Go-to-definition: the declaration in the other file.
- Completion: the exports inside `import { … }`; members after `ns.`, before the `inferObjectProperties` regex fallback; file paths inside the import string from an optional `projectFiles` list the caller supplies (the server from disk, the playground none).
- Signature help: one parameter-extraction helper for local fns and imported ones, so an imported fn never shows more than a local one. (Local fns show `name(...)` with no parameters today; this improves them too.)
- Rename: `prepareRename` on an imported or exported name refuses with the docs' reason. Its result type gains a refusal message; the server sends it as a `ResponseError`. `Declaration` gains an `exported` flag.
- Find All References stays in the current file (already so).
- The built-in-name quick fix on an import edits the name after `as` (docs/syntax.md "Built-in names"; the plan's line 303 "adds `as`" is superseded by line 349 and the docs). An unaliased `import { circle }` gets no fix, as reserved-bindings.ts already decides.

**6c: language server.**
- One graph per open document, resolved through the Node host and `withOpenDocuments` (open buffers win over disk), rebuilt on the existing debounce. Requests never resolve: hover and completion are synchronous and read the cached graph.
- A reverse-dependency index: a change to a file rechecks the open files that import it, directly or through others.
- `didChangeWatchedFiles` for `**/*.pathogen` and `pathogen.json`, with the client's `synchronize.fileEvents`.
- Fonts: plan every file's `@font` in the graph, so the editor reports the same font problems as the CLI.

**6d: preview.**
- The extension host resolves the graph and sends it in `update`. `ModuleGraph.files` is a `Map`, which `postMessage` would turn into `{}` with no error, so it goes as entries and the webview rebuilds it.
- Fonts across the graph's files, as in the CLI.
- Re-render when any file in the graph changes: an edit in another open buffer, or a change on disk.
- A module draws nothing, so its preview says why, through the existing `status` message, in the docs' words.

**6e: build and check.** `npm run build`; the playground's real error panel for `import` and `export` (T9); the `.vsix` built, installed in a clean VS Code, and every feature above checked there. (The full `verify-phase1-surfaces.ts` run is step 7.)

Each sub-step goes through the per-step process: tests first, implement, the step's checks, the full suite, the code review, the commit's tree tested alone, notes here.
