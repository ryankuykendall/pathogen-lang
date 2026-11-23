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

## Next

Your answers. Then 3a's docs page (`docs/data-import.md`), with a content review and your approval, and, if question 1 is (a), the playground mockups for data files alongside it.
