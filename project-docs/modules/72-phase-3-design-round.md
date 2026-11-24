# Phase 3 design round: data imports (JSON, CSV, text)

2026-11-23. Phase 3 of the modules, data and files effort (note 37, "The language changes data and SVG imports need"; note 65). Most of its design was settled in October (decision log `02-decision-log-v1.md` §14.3, §15.2, §16.5, decisions 2, 8, 10 to 12). This note proposes how to split the work and asks only what's still open.

## Before and after

| | Today | With phase 3 |
|---|---|---|
| A table of data | Typed or pasted as a Pathogen list, or kept in a module as `export const cities = [ … ];` | `import cities from "./data/cities.csv";`: rows keyed by the header, numbers already numbers |
| A JSON file | Pasted as a Pathogen literal (that already compiles: quoted keys, `true`, `null`, nested lists) | `import config from "./config.json";` |
| A text format (GPX, a weaving draft, an airfoil `.dat`) | Out of reach: strings can't be split into lines or turned into numbers | `import draft from "./draft.wif" with { type: "text" };`, and a module that parses the string |
| In the playground | A workspace holds `.pathogen` files only | Data files too: uploaded, in the tree, redrawing the programs that import them |

## Already decided

| What | Decision |
|---|---|
| The syntax | `import <name> from "<path>" [with { <hints> }];` (decision 10). A bare name imports the file's content (decision 2) |
| A `.pathogen` file's default import | Was to be its drawing (decision 2); **delayed** on 2026-11-05 (note 37, `backlog.md`). So the default-import form means data files only, and `import x from "./file.pathogen";` keeps today's error |
| The type of a file | From its extension; `with { type: "…" }` overrides (decision 10). `.json` `.geojson` `.topojson` `.fold` are JSON, `.csv` `.tsv` CSV, `.txt` text. An unknown extension is an error that lists the types |
| The value | JSON: the JSON value (key order kept). CSV: a list of row objects keyed by the header. Text: a string (UTF-8, byte-order mark dropped, line ends `\n`) |
| Fixed once loaded | Imported data is frozen, as a module's values are (decision 8), so every importer shares one value |
| Parsing | Once, in the shared loader in `src/`, so every surface gets the same value, cached by content and hints |
| Errors | Point into the data file (`cities.csv:14:9 unterminated quote`), at the import line and in the file itself |
| CSV cell types | Inferred per column: numbers, `true`/`false`, empty cells as `null`; a value with a leading zero keeps its column as strings; a column that falls back to strings says why on hover (decision 11, §14.3) |
| CSV structure | A header that isn't a name is read as `row["Population (2020)"]`; duplicate headers and ragged rows are errors that name the row |
| Casting columns | A cast list with contextual type names, TypeScript-style: `string`, `number`, `integer`, `boolean` lowercase, `Angle`, `Color`, `Point` PascalCase, never reserved outside a type position (decisions 11, 12; §16.5) |
| Hints | Literals, checked per type; an unknown hint lists the valid ones; the editor completes them |

## The proposed split

Each step is docs first (a new published page, `docs/data-import.md`, registered in `DOC_FILES`), then tests, then the build, then the checks. Each adds one kind of language machinery:

1. **3a, JSON and text.** The default import for a data path, the loader's branch, freezing, and errors that point into the file. `.json` and `.txt` are typed by their extension, so no `with { }` grammar yet. Also the **string tools** a text-format library needs (question 3): with 3a, so a text import is useful the day it lands.
2. **3b, CSV and TSV, with `with { … }`.** Inference per column, and the hints (`header`, `delimiter`, `decimal`, `skip`, `comment`, `type`). `with { }` is the first grammar change, so it goes through the new-syntax checklist: the grammar, the formatter, the path-args tokenizer, the TextMate grammar, completion inside the braces.
3. **3c, the cast list.** Type names in a type position are a new kind of syntax, and one question waits for it: how a bare number in an `Angle` column gets its unit (angle literals must carry one). It gets its own short design pass when 3b is done.

## What each step costs in the playground

If a step ships on all three surfaces at once (question 1), the playground side of 3a is about as big as its language side:
- **Storage:** the server allows only `.pathogen` files today (`ALLOWED_KINDS`); data files need it opened (the limits are set already: 5 MB a data file, 50 MB a workspace). An API deploy.
- **Files:** Upload files…, Upload folder…, a workspace from a project (2g) and Download workspace all say `.pathogen` only; `docs/workspace-files.md` says so in at least three places ("Uploading files", "A workspace from a project", "Limits").
- **The tree and the editor:** an icon for each kind, and how a data file opens (question 5; a mockup round first).
- **Redrawing:** a program redraws when a file its imports reach changes; the program list's dots and the error places need data files to count as files a program uses.
- **Everything that carries a workspace:** snapshots, Copy Workspace, publishing, the review viewer, the public page's View source, and Copy Debug Info.
- **VS Code:** its file watcher matches only `*.pathogen` and `pathogen.json`, so an edited CSV wouldn't redraw the preview.

## Questions for you

1. **Surfaces.** Does each step ship on the CLI, VS Code and the playground together?
   - **(a)** All three together, step by step. *Recommended.* Since phase 2 a workspace has files, so a data import that worked only on disk would be a feature the playground silently lacks (the three-surface rule).
   - **(b)** The CLI and VS Code first, the playground after, as phase 1a did (decision 25).
2. **The cast list's name.** §14.3's hint table called it `types`, with strings (`{ zip: "string" }`); decision 11 and §15.2 call it `columnTypes`, with type names (`{ zip: string }`). *Recommended: `columnTypes` with type names,* the later decision; `types` was the earlier draft.
3. **String tools: methods on a string.** `s.trim()`, `s.lines()`, `s.split(",")` (a separator becomes optional; with none it still splits into characters, as today), `s.replace(find, with)` (every occurrence), `s.startsWith(…)`, `s.endsWith(…)`, and `s.toNumber()`, which gives `null` for text that isn't a number, so a reader can test it. Methods add no built-in names, so no stored program can clash with them. *Recommended: yes, this set.* Say if you'd rather `toNumber()` stop with an error.
4. **Hover and completion from data** (§14.3: hover on `cities` shows "212 rows · name (text), x (number)", `city.` completes the columns, `city.populaton` says "Did you mean population?"). *Recommended: in the step that brings each type* (JSON keys with 3a, CSV columns with 3b), since it's most of what makes data feel built in.
5. **A data file in the playground's editor.** *Recommended: editable as text,* with simple highlighting for JSON and CSV, its programs redrawing as you type, as a module's do. A table view for CSV can come later. Or read-only, edited elsewhere and uploaded again. Either way, a mockup round comes before any playground change.
6. **A size cap in the CLI and VS Code.** *Recommended: the workspace's own, 5 MB a data file,* so a project behaves the same on disk and in the playground. Or none on disk.

## Your answers (2026-11-23)

"1 (a), 2 yes, 3 yes, 4 yes, 5 editable, 6 no...I think that we should allow larger file sizes on the command-line, and that we should produce an error in the web app when a users workspace files exceed our maximum file size."

1. **All three surfaces together,** step by step.
2. **`columnTypes`,** with type names.
3. **The string methods,** as proposed: `trim()`, `lines()`, `split(separator)`, `replace(find, with)`, `startsWith()`, `endsWith()`, and `toNumber()` giving `null` for text that isn't a number.
   - *Superseded 2026-11-24 (note 74):* text imports and these methods are on hold ("we would need to support regular expressions and that is too out of scope for the initial round of work"). Drafts in `held-text-imports/`.
4. **Hover and completion from data** in the step that brings each type.
5. **A data file is editable** in the playground's editor.
6. **A larger limit on disk than in the playground.** The playground keeps the workspace's limits (5 MB a data file, 50 MB a workspace), and a file over one is an error that says so: an upload leaves it out with the reason, and a save that would pass it is refused with a message, as for a `.pathogen` file over 1 MB today.
   - Then: "We should probably have some kind of cap for files on disk, but what would make the most sense?" I recommended 50 MB a data file, with a CLI flag and a VS Code setting to raise it: a 50 MB CSV is about half a million rows, already more than an SVG can show; reading a file into values takes several times its size in memory, so far larger files crash Node with an error that doesn't name the file; and VS Code rereads data files as you type.
   - **Your answer:** "Let's go with 50 MB, with the flag and setting to raise it." The error names the file, its size and the limit, and how to raise it (`--max-data-size`; a matching VS Code setting).
   - For the record: the 32,000-step limit applies to number ranges (`for (i in 0..N)`), not to a loop over a list, so a long table loops in full.

## What writing 3a's docs turned up (2026-11-23)

The drafts: `docs/data-import.md` (new, registered in `DOC_FILES` as `dataImport`), the string methods in `docs/syntax.md`, and changes to `docs/modules.md`, `docs/cli.md`, `docs/projects.md` and `docs/workspace-files.md`. Not committed: they wait for the content review and your approval.

**Build items for 3a:**
- **The docs commit lands with the parser change.** `tests/docs-examples.test.ts` parses every example, and `import gears from "./data/gears.json";` is a parse error today (the default-import message). Those two examples are 3a's first failing tests, so the docs go in with the commit that makes them parse, and nothing is pushed before 3a works.
- **Our own JSON reader, or at least our own messages.** The page promises one message for a JSON mistake on every surface (`data/gears.json line 3, col 3: expected , or ] after an array item`). `JSON.parse` words its errors differently in V8 and in Safari, as the 2g page already admits for `pathogen.json`.
- **The workspace's kinds follow the language.** `src/workspace/files.ts` lists `.json .csv .tsv .txt .svg` as data, and lacks `.geojson .topojson .fold`. With 3a a workspace accepts exactly what a program can import then: `.json .geojson .topojson .fold .txt`. CSV and TSV join with 3b; `.svg` waits for SVG imports.
- **Data files count toward the 20 files** (note 50: the limit caps R2 reads, one a file), so the page says so, and 2g's "more than 20 `.pathogen` files" sentence now counts every file.
- **Worker memory.** Note 50 left "a load holds every file's text in memory, up to 50 MB, in a 128 MB Worker" unfixed, because `.pathogen` files alone (20 × 1 MB) couldn't reach it. Data files at 5 MB each can (20 × 5 MB is past the 50 MB total, so the total is what binds). The fix note 50 sketched (above a total size, return hashes only and let the client read by hash) is part of 3a's playground work.
- **The 50 MB limit on disk needs a measurement:** how much memory a 50 MB JSON file takes as Pathogen values, once the loader exists. It's the check behind the number.
- **`pathogen.maxDataSize` is the VS Code extension's first setting** (it has none today: no `contributes.configuration`).
- **The `text` keyword:** `text` can't be a variable name (it starts a text line), so the examples avoid it; `.startsWith(prefix)` and `.endsWith(suffix)` name their parameters for the same reason.
- **A correction found on the way:** strings' `.empty()` and `.includes()` return `true` / `false`, not `1` / `0` as `docs/syntax.md` said. Fixed in the same draft.
- **Checked:** template literals turn `\n` and `\t` into a line break and a tab; a 90,601-item array loops in full with `for`, `.map` and `.filter` (under 100 ms each), so the 32,000-step limit doesn't touch a long table.

**New names a user sees:** `--max-data-size=<MB>` (CLI), `pathogen.maxDataSize` (VS Code), the string methods `lines`, `trim`, `replace`, `startsWith`, `endsWith`, `toNumber` (and `split` taking a separator), **New data file** in the tree's menus, and the editor's "has no key … Did you mean …?" underline.

**Proposed in the drafts, to confirm in the mockup round** (the docs say these as written; each can change):
1. **The tree and tabs:** one icon for JSON, one for text; a data file's tab keeps its extension (`gears.json`).
2. **New data file** in the **+** menu and in a folder's menu: you type the extension. A new JSON file starts as `[]`, a text file empty.
3. **The editor:** JSON highlighted, and a JSON mistake underlined as you type, with the import's message. Format Document is off for a data file.
4. **Copy Debug Info:** a data file the imports reach comes with its size and first 20 lines (not its whole text), unless the error is in it.
5. **Public pages and the review viewer:** View source shows data files with the others ("every file"), as do snapshots, Copy Workspace and Download workspace.
6. **A save over a limit:** refused with `data/trips.json is 5.4 MB, more than the 5 MB a data file can be in a workspace. Your edits are kept in the editor but not saved.`
7. **A project over 50 MB in all** adds nothing when it comes in as a new workspace, as more than 20 files does.

## Next

3a's docs, first: a new page, `docs/data-import.md` (JSON and text imports, the value, freezing, errors), the string methods where strings are documented, and the changes to `docs/modules.md`, `docs/workspace-files.md` (data files in a workspace, their limits and errors), `docs/projects.md` and `docs/cli.md` (the 50 MB limit on disk, `--max-data-size`, and VS Code's setting). Alongside them, the playground mockups for data files: the tree, the editor, uploads and the import of a project. A content review, then your approval of both.
