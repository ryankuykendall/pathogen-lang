# Phase 1a, step 2: the import loader

2026-11-03. Plan: `12-phase-1-plan.md` "Step 2: the module loader". Step 1 is `023dd75`.

## What this step delivers

`src/host/load-modules.ts`: the pre-compile import step, pure like the font loader. It reads files only through a host, so the same code serves Node now and the playground's workspace files in phase 2.

| Piece | What it does |
|---|---|
| `planImports(source)` | The top-level imports, in order, from the Lezer tree alone. Each has the path as written and the position of its string. Imports inside a fn, or with no path yet, are the parser's to report |
| `importPathMistake(written)` | The path rows of docs/modules.md "Errors" |
| `resolveModules(entrySource, { host, entry })` | Reads the graph through a `ProjectFileHost`. Each file is read once, with dependencies first in `order` and the entry left out. Each mistake is reported at the import that makes it, with `importedFrom` running from the nearest import to the compiled file. Cycles are named once, at the import that closes them. A file that can't be read is an error at every import of it, read once. Every `ModuleFile` records `importedFrom`, the chain by which it was first reached, for step 3's errors in imported code |
| `withOpenDocuments(host, openText)` | Editor buffers over the disk. The disk read decides every path question first, so a buffer only stands in for a file that is really there |
| `formatModuleLoadError(error, entryLabel)` | CLI text. In the compiled file it reads like `@font` (`file:line:col: error: …`); elsewhere it gives the file and position, then one `imported from` line per import |

Also:
- `ProjectFileHost` in host/types.ts (every FontHost is one);
- `createNodeProjectHost(root)` in `pathogen-lang/node`;
- `respell` moved to host/paths.ts, shared with fonts;
- the loader's messages in src/module-messages.ts;
- exports from src/index.ts.

## Decisions taken during the step

- **An import path is the raw text between its quotes.** No escapes are processed, in the AST (step 1's builder changed) and in the loader. The review found that `".\reports\new.pathogen"` came out with a carriage return in it and missed the backslash rule. The formatter prints a plain path in double quotes and keeps the token as written when it holds `"` or `\`.
- **A path that names a folder however it's spelled** (`.`, `..`, `./`, `/`, `./parts/`, `../..`) gets `import path "…" is a folder, not a file.`, instead of a nonsense extension suggestion.
- **Two cycles through the same files** (a→b→c→a and a→c→b→a) count as one, since fixing either breaks both. There's a comment at the key.
- **The CLI wiring moves to step 3.** Passing the graph to the compile is only useful once the evaluator can run modules, so this step stays at library level.

## Checks

- `tests/modules-loader.test.ts`, 38 cases growing to 54 with the review:
  - planImports positions, CRLF, an import after other statements;
  - every path rule word for word, including the folder spellings;
  - the graph: one read per file, order, diamond, chains;
  - every read mistake;
  - cycles: entry, self, non-entry, reached twice;
  - failures re-reported at each import, read once;
  - Windows paths as typed;
  - the buffer overlay against case, missing and escaping paths;
  - the Node host on the VS Code modules fixture, including letter case and a missing file on the real disk.
- `tests/host`, `tests/cli.test.ts` (respell moved): pass.
- `tests/modules-syntax.test.ts`: raw paths and the formatter's quoting.

## Code review (approve with changes)

| # | Finding | Disposition |
|---|---|---|
| 1 | Escapes turned `\r`/`\n` in Windows paths into control characters | **Fixed**: raw paths everywhere (above) |
| 2 | `./parts/`, `..`, `./` gave nonsense fixes | **Fixed**: the folder message |
| 3 | The "cycle reached twice" test passed with de-duplication removed | **Fixed**: the cycle is now closed twice; also a non-entry self-import |
| 4 | A failed file was silent at its second importer | **Fixed**: an error at every import, still one read |
| 5 | No cap on files or depth | **For step 6** (the language server reloads on every edit; caching and a cap belong there) |
| 6 | `\\server\share` and `.PATHOGEN` messages | Left: rare, and the messages are still true |
| 7, 8, 9 | Missing cases and weak assertions | **Added** (diamond, nested climb, overlays, Windows paths, CRLF, import after statements, full messages) |
