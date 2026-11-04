# Phase 1a, step 5d: fonts in imported files

2026-11-04. Design: `17-phase-1a-step5-design.md`, section 5d, narrowed by the advisor: the shared planner and the CLI now; the language server and the VS Code preview in step 6, next to their module loading. Contract: docs/modules.md "Fonts in imported files", the font row of its Errors table, and docs/fonts.md's note that an imported file's `@font` counts. No docs change was needed.

## Before and after

| | Before | After |
|---|---|---|
| `@font "./fonts/Inter.ttf";` in an imported file | never read: font planning looked only at the compiled file, so text in that font failed | loaded, with `./` from the imported file's folder |
| Two files writing `@font "Inter";` | (one file only) | one font |
| Your `@font "./fonts/Inter.ttf";` and an imported file's `@font "Inter";` | — | one font: the file serves the family name, with no download |
| Two files loading different font files as Inter 400 | — | an error at the second file's line naming both: `Two files load different fonts as "Inter" 400: ./a/Inter.ttf (main.pathogen) and ./b/Inter.ttf (parts/labels.pathogen). Use the same font in both files.` |
| A mistake in an imported file's `@font` line | — | the usual message, naming that file (`parts/labels.pathogen:2:1: error: …` in the CLI) |

## What this step delivers

- **`resolveFontsInFiles(files, options)`** (src/host/load-fonts.ts, exported from the library). It plans every file's `@font` lines, then loads all their directives together: file paths first, then family names. That is the rule within one file today, applied across files, so a family loaded from a file in any file serves every file's family name.
  - Each file's `./` paths start from that file.
  - A different font file (another font id) for a family and weight already loaded from *another* file is the clash error. Within one file, the first stays in use with no error, as before: the amendment confines the clash to two files.
  - Messages about an imported file's lines carry `file`.
- **`resolveFonts(source, options)`** is now the one-file call of it. Message order and results are unchanged; the existing font tests pass as before.
- **The CLI.** `loadFontsForCli` takes the import graph, loads the fonts of every file, and skips loading only when no file has `@font`. It prints an imported file's messages under that file's path from the project folder, and its warnings carry `file` into `--json`.
- **`fontClashError`** in module-messages.ts, word for word with the docs.

## Not in this step

The language server and the VS Code preview still plan fonts from the open file alone. They get the graph, and with it every file's fonts, in step 6.

## Checks

- **`tests/modules-fonts.test.ts`** (8): `./` from the imported file; two family names, one font; a file serving another file's family name; one font file reached by two paths; the clash; different weights; two fonts within one file; a mistake naming its file.
- **`tests/cli.test.ts` "imports"** (+2): an imported file's font drawing the same glyph as the compiled file loading it itself; the clash stopping the CLI with the documented message.
- **Existing font tests** (load-fonts, node-host, the language-server and VS Code font sessions): unchanged and passing.
- **Semantics audit, tree-alone suite, full suite:** see the commit message.

## Reviews

- **Code review** (no critical findings). The reviewer confirmed:
  - one-file behaviour is unchanged (message order, `seen`/`fileFamilies`, the flags);
  - the clash never fires within one file or for one font file reached by two paths;
  - the entry is never in the graph's `order`;
  - `--root`'s check is right to stay entry-only, because an entry outside the root with imports already stops at loading;
  - the language server and VS Code callers of `resolveFonts` are unaffected.

  Taken:
  - **Clashes are judged against the first file's font.** A test with three files pins it: each later different font is reported against the compiled file's. The doc comment now says `files` is in order, compiled file first.
  - **A CLI test for an imported file's font *warning*:** an offline `@font "Gravitas One";` gives `parts/family.pathogen:1:1: warning: …` on stderr, and `file` in `--json`.
  - **The CLI collects imported files in one pass,** without `!` assertions.

  `tests/modules-fonts.test.ts` now has 9 tests, and the CLI "imports" block has 11.
