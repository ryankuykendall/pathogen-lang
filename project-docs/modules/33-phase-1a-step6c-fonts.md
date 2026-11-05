# Phase 1a, step 6c, part 4: fonts in imported files, in the editor

2026-11-05. The last part of step 6c (`31-…` lists the parts). docs/modules.md "Fonts in imported files": an imported file's `@font` loads too, its `./` paths from its own folder. The CLI has done this since step 5d (`resolveFontsInFiles`); the language server loaded only the document's own `@font` lines (moved here from 5d, see the memory note).

## Before and after

| | Before | After |
|---|---|---|
| A module with `@font "../fonts/Baumans-Regular.ttf"`; the importer draws a Baumans glyph | `PathBlock.fromGlyph() requires font data, but no fonts were loaded…` on the importer's glyph line | no problems: the module's font loads for the importer, as in the CLI |
| A missing font file in an imported file | (the same "no fonts were loaded" error, on the glyph line) | `parts/labels.pathogen line 2, col 1: @font file "../fonts/Missing.ttf" was not found (…)` + `imported from poster.pathogen line 1`, on the import (step 6c part 1 places it) |
| Fixing the imported file's `@font` | — | loads again on the next check: the memo key includes each imported file's `@font` plan and file stamps |

## Code

- `packages/pathogen-language-server/src/fonts.ts`:
  - `forDocument(uri, source, modules?)` gathers the graph's files that have `@font`, in load order;
  - the early "no `@font`" return looks at all of them;
  - the memo key adds each imported file's plan and `fontFileStamps`;
  - `resolveWith(…, imported)` calls `resolveFontsInFiles` with the document first, as the CLI does.
- `server.ts`: passes the graph `DocumentModules.refresh` just read.

## Code review

Approve. The memo key catches every edit, stays stable when nothing changes, and the download path sees the same files on both passes. Two test gaps, both added: a font file appearing later under the same path (only the stamps change), and the same files checked twice loading once. Not taken: the server passes only imported files that have `@font`, where the CLI passes all of them. That doesn't change resolveFontsInFiles's result.

## Tests

- tests/language-server-fonts.test.ts (+5):
  - the importer's glyph with a module's font (no diagnostics);
  - a missing font file in an imported file, placed on the import;
  - fixing it loads again;
  - a font file added later under the same path loads;
  - the same files twice load once.
- verify-step6c-lsp.mjs: +1, the built server with a module's `@font` and an importer's glyph, no problems. 16/16.

## Checks

- tests/language-server-fonts.test.ts: 16 passed.
- This commit's tree alone: 194 files, 8,374 passed, 0 failed.
