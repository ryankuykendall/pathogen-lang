# Phase 3a build: steps 1 and 2, the syntax and reading data

2026-11-24. The first two steps of note 76's plan: data imports parse, and the CLI reads them. Nothing is pushed.

## Before and after

| | Before | After |
|---|---|---|
| `import gears from "./data/gears.json";` | Parse error: "Pathogen has no default export" | Compiles in the CLI: the name holds the file's JSON, fixed |
| A JSON mistake | — | `Error: data/gears.json line 3, col 3: expected , or ] after an array item` / `  imported from main.pathogen line 2` (data-import.md's block, word for word) |
| A data file over 50 MB | — | Stops at its import, before the file is read, with its size and `--max-data-size=100` |
| `rows[0].push(9)` on a module's array of arrays | "Cannot change rows … Copy it first: [...rows]" (copying `rows` doesn't help) | "Cannot change an array inside rows … Copy it first: [...rows[0]]" |
| An object in a copied imported array | "Copy it first: { ...sizes }" | "Cannot change an object inside sizes … Make new objects: sizes.map {\|size\| return { ...size }; }" (the approved docs) |

## Step 1 (commit ae9010b4)

- **The AST** holds a data import (`defaultImport`); the builder no longer rejects it.
- **One table for each path and import form** (`importPathMistake(written, form, name)`), with every row of the two docs' Errors tables pinned in `tests/data-import-syntax.test.ts`. "No default export" for a `.pathogen` path moved there, so it is now at the path, as the other path messages are, and only where files are read: in a scratch buffer, which has none, the import's message is "no project folder".
- **Every walker of imports** knows the form: the formatter, scope analysis, the static checks, rename, module-exports and move-imports. Moving or renaming a data file rewrites the imports that name it.
- **The docs** (seven files, as approved) landed with it.
- Checks: the tree alone passed; the semantics audit: 1,440 of 1,502 programs unchanged, 0 changed (the rest are the usual too-large and baseline-unparseable ones); code review, no critical findings.

## Step 2

- **`src/data/json-reader.ts`**, our own reader. It builds Pathogen values directly, keeps keys in the file's order (`"2"` included), keeps its own stack (100,000 levels deep reads fine), and words every mistake as what it expected where it stopped. 61 tests pin the messages.
- **The loader** reads data files into the graph's own `data` map, apart from the modules. The size is checked before reading (a new `too-large` answer from the Node host), then UTF-8, then JSON. A JSON mistake is a load error in the data file, reported once, with an `imported from` line for each import on the way.
- **A parse cache** (decision 7): by project and path, compared by text, holding about 512 MB of values (eight bytes counted for each character of text). An editor that resolves imports on every keystroke reads an unchanged data file once. Sharing one value between compiles is safe because data values are fixed: a test runs ten programs that try every way to change it, or change copies, and the value is still the file's afterwards.
- **The evaluator** fixes data before any module runs (a module can import data), under the name its first import gave it, and binds it like any import.
- **The CLI:** `--max-data-size=<MB>`, checked as the docs say (a whole number from 1, after `=`).

**Tests:** `tests/data-json-reader.test.ts` (61), `data-import-loader` (50), `data-import-runtime` (21), `data-import-cli` (10). The VS Code modules fixture has a data import now, so the all-syntax test needs no exception for it.

## The memory gate (note 76, decision 7)

Measured in Node 24 (`tmp/phase3/bench-json.ts`, `bench-json-tiny.ts`):

| A 50 MB file of | Read in | Heap |
|---|---|---|
| 500,000 records like the docs' gears (57 MB) | 0.7 s (`JSON.parse`: 0.18 s) | 360 MB |
| 6.5 million `{"a":1}` objects, the worst shape | 1.3 s | 1.45 GB |

Node's default heap limit is 4.3 GB on this machine, and about 2 GB on one with 8 GB of memory. The 50 MB default and the docs' wording stand: realistic data takes about six times its size, and even the worst shape fits. The reader is about four times slower than `JSON.parse`; that buys the same message everywhere and keys in order, and a 50 MB file is read once per edit at most, thanks to the cache.

## Decided while building (confirm or overrule)

1. **An array inside an imported value gets its own message,** like the approved one for objects: "Cannot change an array inside gears — it comes from data/gears.json, and imported values are fixed. Copy it first: [...myGears[0].holes]", naming the array as the code writes it ("Copy it into a new array first, with [...]" when part of it is computed). Modules get it too: `rows[0].push(9)` used to advise copying `rows`, which doesn't help.
2. **The item name in "Make new objects"** comes from the list's name: `gears` → `gear`, `cities` → `city`, `sizes` → `size`. A name with no plural ending, one whose singular the spelling can't tell (`boxes`, `matches` but `caches`), or one whose singular is a keyword or a built-in name gets `item` (`data`, `texts`, `cases`). A wrong guess would read as a mistake in the message.
3. **The name a message suggests for a data file** with braces (`"./data/gear-sizes.json" is a data file: import it by a name, as import gearSizes from …`) is the file's name as one word, accents dropped; `data2020` for a name starting with a digit; `circleData` for a built-in name.
4. **Sizes in messages are rounded up** to a tenth of a MB, so a file just over a limit never reads as the limit itself (50 MB + 1 byte reads "50.1 MB"). The suggested `--max-data-size` is the next 50 up.
5. **A half-typed data import** (`import gears`) says `Incomplete import — write it as import gears from "./data/gears.json";`, not the braces form.
6. **A JSON mistake is reported once,** however many files import the broken file: it's a mistake in that file, and every import of it leads there.
7. **A number too large to hold** (`1e400`) is a mistake at its place ("the number 1e400 is too large"), since a JSON value can't be infinite.

## Code reviews

- **Step 1:** no critical findings. Taken: the evaluator's guard for a data import with no data. Moved to step 3: path completion inside `import gears from "./…"` doesn't know the form. Not taken: enforcing `canBeName` on what people write (it only shapes suggestions).
- **Step 2:** no critical findings, three warnings; no change to the shared value escapes the guards (checked by reading every write in the evaluator). Taken: the cache budgets values, not text, and is keyed by project; comments no longer claim deep data is safe everywhere (only the reader and the fixing walk don't recurse); the singular rule is conservative; the shared-value test. Moved to steps 4 and 6: everything below.

## Owed to later steps

- **Step 3:** path completion inside `import gears from "./…"` offers data files; braces and `* as` offer modules.
- **Step 4 (VS Code):**
  - `preview-modules.ts` returns early when `graph.files` is empty, so a program whose only import is data gets no graph; and it posts `entry`, `order` and `files` only. `data` must go too, as text the webview reads again (a message can't carry a `Map`).
  - `program-drawing.ts` passes the graph only when `files` isn't empty.
  - The watch list and `listProjectModules` (`src/node`) cover modules only, so a data edit wouldn't redraw.
- **Step 6 (the playground):** the compile worker receives the whole graph by structured clone, which would copy every data value; send only what the compile needs, or read data inside the worker.
