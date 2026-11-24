# Phase 3a build: step 3, the editors read data

2026-11-24. Note 76's step 3: hover, completion and the "has no key" underline for imported data, in the shared language services that VS Code's language server and the playground both use. Nothing is pushed.

## Before and after

| | Before | After |
|---|---|---|
| Hover on `gears` | `gears — imported name` | `gears — imported data`, then `data/gears.json · an array of 2 objects: name, x, y, radius, teeth` (mockup 1c) |
| `gear.` in `for (gear in gears)` | No keys | The keys, with each value's type: `name string`, `x number`, … (mockup 1d) |
| A key that needs brackets | — | Offered in its bracket form, which replaces the dot: `["Population (2020)"]`, `["length"]`, `["text"]` |
| `gear.radus` | Nothing (it reads as null when run) | A warning: `data/gears.json has no key radus. Did you mean radius?` |
| `import gears from "./` | The project's modules | Its data files; braces and `* as` still get the modules |
| A keystroke with a 57 MB data file | — | About 10 ms to re-read and compare the file, 1 ms for completion and for diagnostics (after the first, 240 ms) |

## What was built

- **`src/language-services/data-shapes.ts`:**
  - `describeData` gives hover's few words;
  - `dataOfExpression` / `dataOfDeclaration` find the values an expression reaches in a data file: the import, a key (`gear.radius`, `place["Population (2020)"]`), an item (`gears[0]`), and names declared from them (a loop over the array, `let first = gears[0]`, a block parameter of `.map`, `.filter`, `.forEach`, `.find`, `.some`, `.every`, `.sort`, and `.reduce`'s second);
  - the keys of a list of objects, each in the order it first appears, cached per array;
  - `isDotKey` (docs/data-import.md: a key that isn't a name, is a keyword, or is `length` takes brackets) and `nearestKey`.
- **Hover** answers a data import's name with what it holds, at the import and at every use. With no data (the file couldn't be read) it says only `imported data`.
- **Completion** offers the keys after a dot on data. A half-typed `gear.` inside a block can stop the block from parsing; then the names are read again from the text with a placeholder after the dot. A bracket-form item has a `range` (the dot to the cursor) and a new `filterText` (`.length`), so an editor matches what was typed.
- **The underline** is a warning, not an error: reading a missing key gives `null` and the program runs. A key only some items have isn't underlined (it may be optional), and nothing is when a list is too long to check whole (over 200,000 values).
- **Import paths:** the path context knows the import's form; a name alone is offered data files ("data file"), braces and `* as` modules.
- **Data marked once:** a cached data value is marked fixed once, and the marks last as long as the value (`markData`, `dataMarkOf` in module-runtime.ts), so a keystroke's compile doesn't walk every record again. A module that holds data doesn't take it over: its messages still name the data file. Measured (`tmp/phase3/perf-editors.ts`): diagnostics on a complete program with 500,000 records went from 95 ms a keystroke to 1 ms.
- `levenshtein` moved to `edit-distance.ts`, shared by the code actions and the key suggestions.
- The `import` keyword's hover mentions data files, and no longer says imports work only in the CLI and VS Code.

## Decided while building (confirm or overrule)

1. **The underline is a warning** (yellow), since the program still runs. The docs say only "underlined".
2. **Hover's few words** for other shapes: `an array of 3 numbers`, `an array of 3 items` (mixed), `an empty array`, `an object with 2 keys: size, palette`, `a number: 42`, `a string: "hi"`. A long key list stops after 12: `… (15 keys)`.
3. **Completion after a dot on data offers only the keys,** as mockup 1d shows, not methods such as `.has()`.
4. **A key's type** is its first value's: a key that is a number in one item and a string in another shows `number`.

## Code review

No critical findings; the mark-once change checked sound (every change to a value goes through the one guard, and `dataNames` is saved around nested compiles). Taken:
- **The key pass was quadratic:** finding each dot's receiver scanned the file from its start. It now reads backwards from the dot, in place: 12,000 dots in a 190 KB program take 460 ms with the compile, four times 1,000 lines' 98 ms.
- **The second analysis** for a half-typed block now runs only when the name is written as a block's parameter (`{|gear|`), not for `ctx.` or an enum's name.
- Tests for the receiver scan's edge cases (`log(1.`, `a[0.`, a string before the dot).

Not taken: "a single data object loses its methods in completion". An object written in the program offers only its keys today too (`let p = { x: 1 }; p.` gives `x`), so data matches it (decision 3).

For step 6: the playground's completion bridge (`playground/utils/cm-completion-bridge.ts`) applies an item's label, assumes that when one item has a `range` all do, and ignores `filterText`. A bracket key would replace the dot with the bare key, and plain keys beside it would be placed wrong. It must apply `insertText`, place each item by its own range, and match on `filterText`.

## Tests

`tests/data-import-editors.test.ts` (47): hover, the descriptions, completion through a loop, an index, a variable and `.map`'s block, the bracket form and its range, the underline (a misspelled key with and without a near one, through an index in brackets, a key only some items have, a method), the placement of a data file's JSON mistake on the import, and path completion for each form. One test in `modules-editors` changed: a name alone isn't offered modules any more.

## Owed to later steps

- **Step 4:** the language server must pass `filterText` and the bracket items' `range` as a `textEdit`; its project file list (`listProjectModules`) lists only modules, so path completion needs data files too.
- **Step 6/7:** the playground's completion bridge must apply `range` and `filterText` for the bracket form, and its file list must include data files.
