# Phase 3a: the build plan

2026-11-24. You approved the v3 dialog and the docs (note 75): "The dialog design meets my expectations and I approve of the updated docs." This note splits 3a's build into steps and records the decisions the build needs before its first test.

## Before and after

| | Today | When 3a is done |
|---|---|---|
| `import gears from "./data/gears.json";` | Parse error: "Pathogen has no default export" | The name holds the file's JSON, fixed, on all three surfaces |
| A JSON mistake | — | `data/gears.json line 3, col 3: expected , or ] after an array item`, then `imported from main.pathogen line 2`, the same words everywhere |
| On disk | — | Data files up to 50 MB, raised by `--max-data-size` or `pathogen.maxDataSize` |
| The editors | — | Hover shows what a data import holds; completion offers its keys; a key no item has is underlined |
| A workspace | `.pathogen` files only | Data files too: the tree, the editor, the dialog, uploads, downloads, snapshots, Copy Debug Info; 5 MB a data file, 50 MB a workspace |
| A refused save | The sentence in the save status | "Not saved" in the save status, the reason in the error panel |

## Decisions made before the first test

1. **The import graph keeps data apart.** `ModuleGraph` gains `data: Map<path, DataFile>` (`{ path, text, value, importedFrom }`). `files` and `order` stay Pathogen-only: the evaluator parses every `files` entry as Pathogen, and the id prefixes walk `order`. Every reader of the graph is checked for whether it means "the files this program uses" and then reads `data` too: the playground's redraw inputs, the program list's dots, the error places and Copy Debug Info's reach, VS Code's preview (which sends the graph as lists, since a message drops a `Map`) and its file watchers, and the language server's index of who imports what.
2. **Our own JSON reader** (`src/data/json-reader.ts`). Two approved promises rule out `JSON.parse`: one message on every surface, and keys in the file's order (`JSON.parse` puts keys like `"2"` first). The reader:
   - builds objects as `Map`s, so a key such as `__proto__` is just a key;
   - is iterative, so deep nesting can't overflow the stack;
   - counts lines and columns as the rest of the compiler does;
   - treats a number too large to hold (`1e400`) as an error at its place, since a JSON value can't be infinite;
   - says what it expected where it stopped. Its messages are listed in the tests, word for word.
3. **A JSON mistake is a load error,** reported by the loader with the data file's line and column and an `imported from` line for each import, so the CLI prints data-import.md's block as written and the editors place it as they place other errors in imported files. A file too large or not UTF-8 is an error at the import's path, as a missing file is.
4. **One table for each path and import form.** `planImports` records the form (a name, braces, `* as`), and `importPathMistake(written, form)` gives every message in the two docs tables: a name with a `.pathogen` path, with a data path, with no extension, with another extension; braces with a data path, with no extension, with another extension. The "no default export" message moves out of the AST builder, where it stopped the whole file from building a tree. `importOtherExtensionError`'s wording retires.
5. **Every walker of imports learns the new form:** the formatter (a missing case deletes source), scope analysis, the import-again and declared-again checks, the built-in-name check, hover, symbols, rename's refusal, and the helpers that find an import under the cursor.
6. **Fixed data, and its messages.**
   - Values are fixed as they're made from the file, not in a second walk.
   - Data is read before any module runs, since a module can import data.
   - A data value has no name in its own file, so messages use the import's name (`gears`). Two files that import one file under different names share one value, so the second file's message names the first file's name. Rare, and still names the right file.
   - **Changing an object inside imported values** (data and modules) gets its own message: `Cannot change an object inside gears — it comes from data/gears.json, and imported values are fixed. Make new objects: gears.map {|gear| return { ...gear }; }`. The singular comes from the name: `cities` → `city`, `boxes` → `box`, `gears` → `gear`, and `item` when there's no plural ending, or when the singular is a keyword or a built-in name (`texts` → `item`, since `text` is a keyword).
7. **Three gates that could change approved docs or plans:**
   - **Memory:** once the reader and the conversion exist, measure 50 MB of JSON as Pathogen values in Node. If that crashes below Node's default memory, the 50 MB default and the docs' advice come back to you before the CLI step closes.
   - **Size before reading:** on disk, a file's size is checked before it's read, so a file of several gigabytes stops with the message, not a crash. One formatter for megabytes everywhere; the suggestion rounds up to the next 50 (82 MB → `--max-data-size=100`).
   - **No parsing per keystroke:** the editors resolve imports as you type, so parsed data is cached by its text, and checked with a typing test against a control.
8. **The API deploys first.** `ALLOWED_KINDS` is shared by the playground and the API. The 2e push ran the new playground against the old API for half an hour; this push deploys the API and waits for it before the Pages push.

## The steps

Each step: tests first, the build, its checks (the commit's tree tested alone, the semantics audit with 0 changed, a code review). Nothing is pushed until 3a works on all three surfaces.

| Step | What | Done when |
|---|---|---|
| **1. Syntax** | The default import in the AST; the path × form table; every walker; the docs commit (the seven pages and the `DOC_FILES` line) | Every docs example parses; each message in the two Errors tables is pinned; the formatter keeps `import gears from "…";` |
| **2. Reading data** | The JSON reader; the loader's data branch (size, UTF-8, JSON mistakes); values made fixed; the messages; `--max-data-size`; the memory gate | Every data-import.md example compiles in the CLI as the page says; the error block word for word |
| **3. Language services** | Hover; key completion after a dot and through `for (gear in gears)`; the "has no key" underline; data load errors placed; the parse cache | Hover, completion and diagnostics tests from the "In the editor" section |
| **4. VS Code** | The `pathogen.maxDataSize` setting (the extension's first); the four places note 73 found (preview edits, unsaved text, both file watchers, the server reading data files) | The preview redraws on a data edit, saved or not; hover and completion in the built `.vsix` |
| **5. Workspace rules and the API** | Data kinds `.json .geojson .topojson .fold` (`.csv .tsv .txt .svg` leave the table until their phases); uploads' reason; the server's memory on a large load (note 50's fix: above a total size, return hashes and let the client read by hash) | API tests: a 5 MB data file saves, 5 MB + 1 byte doesn't, 50 MB in all doesn't |
| **6. The playground's engine** | Workspaces compile with data; editing a data file redraws its programs; dots, error places and the debug report's reach include data; nothing sorts `gears.json` into the programs | Tests for each reader; typing check on a 5 MB file |
| **7. The playground's UI** | Braces icon, tabs keep the extension, JSON highlighting and mistakes underlined as you type, Format Document off, the New data file… dialog, the refused save in the error panel (the 1 MB `.pathogen` one too) and its retry | A verify script on the real dev playground, both themes, against mockups v2/v3 |
| **8. Everything that carries a workspace** | Upload, project import, Download workspace, snapshots, Copy Workspace, public pages and the review viewer, Copy Debug Info's 20 lines | Each one round-trips a workspace with `data/gears.json` |
| **9. Release** | One program through the CLI, VS Code and the playground, outputs compared; the CHANGELOG (for your approval); the push, API first | Your go-ahead |

## Next

Step 1, tests first.
