# Phase 3a docs: the content review

2026-11-23. A content-reviewer pass over the 3a drafts (note 72), in three parts, since its replies cut off near 4,000 characters:
1. `docs/data-import.md` (new) and the string methods in `docs/syntax.md`;
2. the changes to `docs/modules.md`, `docs/cli.md` and `docs/projects.md`;
3. the changes to `docs/workspace-files.md`.

Each finding the reviewer made about how the language behaves today was checked with a probe before it was taken (`tmp/phase3/freeze/`, `tmp/phase3/probe-review-1.ts`).

## Part 1: data-import.md and the string methods

| # | Finding | Disposition |
|---|---|---|
| 1 | must-fix. "What you import is fixed" advised `[...gears]`, but fixing reaches the objects inside: `[...gears]` then `myGears[0]["teeth"] = 16` is still an error, and so are the items of `.filter`, `.slice` and `.sort`. "A value worked out from the data… change it as you like" was false for those | **Taken, checked** (the change is refused, and today's message advises `Copy it first: { ...gears }`, which doesn't help). A paragraph "Fixed goes all the way in", with `gears.map {\|gear\| return { ...gear }; }` and the one-level caveat. A new Errors row for changing an object inside the data. **For the build:** that message, for data and for modules alike |
| 2 | must-fix. A key can't always be read with a dot: `.length` on an object is its number of keys, even with a `length` key, and a keyword key (`text`, `default`, `in`) doesn't parse after a dot | **Taken, checked** (`gear.length` gave 3, `gear["length"]` 120; `label.text`, `o.default`, `o.in` are parse errors). "Read a key" names keywords, with `label["text"]`, and a new bullet: "`length` always takes brackets". Completion offers such keys in bracket form |
| 3 | should-fix. The profile example never tests a field, though the text says a reader can; a title line or a blank line would stop it | **Taken:** the example file has a title line; the reader splits, filters on `toNumber() != null`, then maps. The sentence after says what the filter skips |
| 4 | should-fix. A degree value passed as is reads as radians, silently | **Taken:** "An angle stored in degrees and passed as it is reads as radians, with no warning. Give it its unit" |
| 5 | should-fix. "Pathogen doesn't project them" clashes with `.project()`; GeoJSON is lon/lat with north up; TopoJSON is arcs, often delta-encoded | **Taken,** in the reviewer's words |
| 6 | optional. "a list of places"; `.split(separator?)` to match `.slice(start, end?)`; the `.toNumber()` example's undeclared `field`; modules.md's "Only a module can be imported" now contradicts the data page | **All taken.** modules.md: "Of `.pathogen` files, only a module can be imported", in the intro bullet and in the import rules |

## Part 2: modules.md, cli.md, projects.md

| # | Finding | Disposition |
|---|---|---|
| 1 | must-fix. cli.md's reason for 50 MB claimed more than was checked: "several times its size" is unmeasured (note 72 lists the measurement); the limit that bites is Node.js's heap, not the computer's memory; "a 50 MB table" doesn't fit 3a (no CSV yet); raising the limit can still crash | **Taken:** "about half a million short JSON records"; "takes more memory than its size on disk" (no multiple until measured); Node.js's crash names no file, so the limit stops first; and `NODE_OPTIONS=--max-old-space-size=8192` for `JavaScript heap out of memory` after raising it |
| 2 | should-fix. The playground limits were stated three ways, and none said data files count toward the 20 | **Taken:** "a data file up to 5 MB, and a workspace up to 50 MB and 20 files, data files included" in data-import.md, projects.md and cli.md; cli.md says what's left out and what doesn't come in |
| 3 | should-fix. cli.md "File Extensions" said "any text file will work" | **Taken,** in the reviewer's words |
| 4 | should-fix. `import gears from "./data/gears";` would be told to add `.pathogen`, then hit "no default export" | **Taken:** a new message for an import by a name with no extension (modules.md and data-import.md Errors); "written in full, with its extension (`.pathogen` for a module)" |
| 5 | should-fix. modules.md doesn't say copying is one level deep, though the same code fixes a module's exports | **Taken, checked** (`tmp/phase3/freeze/` is a module: `[...gears]` then changing an item is refused). A sentence in the intro bullet and a table row. The better message is a build item for both |
| 6 | should-fix. The pages promise VS Code redraws on a data file edit, but `preview.ts` ignores edits whose language isn't `pathogen`, both watchers match only `*.pathogen` and `pathogen.json`, and the language server only gets `.pathogen` documents | **Taken as build items** (note 73). projects.md: the preview stays on its program while you move between files, data files included, and redraws when you edit a module or a data file |
| nit | "A program can also import a data file" | **Taken:** "A program or a module" |

## Part 3: workspace-files.md, against the mockups

| # | Finding | Disposition |
|---|---|---|
| 1 | must-fix. Limits still had 3b's one-sentence message; the "Not saved" status wasn't mentioned; in mockup 3c the toast covers the status; its `trips.json` is invalid JSON with no underline | **Partly stale:** Limits already had 3c's two lines (changed before part 3 was sent). **Taken:** the Data files bullet now says the save status reads "Not saved" and a message says why; a new mockup state `3d-not-saved-status` (the toast closed); `trips.json` made valid |
| 2 | must-fix. Copy Debug Info's budgets count lines, and a JSON file on one line (most GeoJSON) is one line | **Taken:** lines over 200 characters are cut with "…"; "Every other file" lists a data file with its size |
| 3 | should-fix. A reader with a 40 MB file learns it's "Not added", but not that the programs importing it then stop at the import | **Taken,** in the reviewer's words. Not taken: a not-found message that remembers why a file was left out (the import page's "Not added" list already says) |
| 4 | should-fix. "Type `data/gears.json`" contradicts mockup 2b (the field is inside `data/`); no rule for an unreadable ending | **Taken:** `trips.json`, a slash makes folders, the five endings, and the field says which work |
| 5 | should-fix. Unchanged text assumes `.pathogen`: the Windows names rule and "a deleted module" | **Taken:** "with or without an extension: `con.pathogen` and `con.json` can't be used either"; "a deleted module or data file" |
| 6 | should-fix. The Data files limits bullet leaves out the 20 files | **Taken,** with the wording the other three pages use |
| nit | 4a says "7 files in 2 folders" for 5 listed and 1 not added | **Kept:** the count includes `pathogen.json`, which the card lists only when the workspace writes a new one (as in 2g) |
