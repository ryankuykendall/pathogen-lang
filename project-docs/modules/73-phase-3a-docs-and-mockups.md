# Phase 3a: the docs and the mockups, for your review

2026-11-23. Note 72's next step: 3a's docs first, with the playground mockups for data files beside them, a content review, then your approval of both.

## Before and after

| | Today | With 3a |
|---|---|---|
| A table of numbers | Typed into the program, or kept in a module as `export const gears = [ … ];` | `import gears from "./data/gears.json";`, and the name holds the file's array |
| A text format (an airfoil, a GPX track) | Out of reach: strings can't be split into lines or read as numbers | `import profile from "./data/profile.txt";`, then `.lines()`, `.trim()`, `.split(" ")`, `.toNumber()` |
| A workspace | `.pathogen` files only | Data files too: in the tree with their own icons, edited in the editor, uploaded, downloaded, carried into snapshots and copies |
| Limits | 1 MB a `.pathogen` file, 20 files | Also 5 MB a data file and 50 MB a workspace, data files counted in the 20. On disk, 50 MB a data file, raised by `--max-data-size` or `pathogen.maxDataSize` |

## What to look at

**The docs** (drafts, not committed: see "Commit plan" below):
- `docs/data-import.md`, new: the page for data imports.
- `docs/syntax.md`: the string methods (`lines`, `trim`, `replace`, `startsWith`, `endsWith`, `toNumber`; `split` takes a separator). It also corrects `.empty()` and `.includes()`, which return `true`/`false`, not `1`/`0`.
- `docs/modules.md`, `docs/cli.md`, `docs/projects.md`, `docs/workspace-files.md`: what changes on each.

**The mockups:** `mockups-3a-data-files/` (README lists the 12 states; light and dark). They're the real dev playground with the new parts put into the page.

**The content review:** `reviews/phase-3a-docs-review.md`, three parts, 18 findings and 2 nits. All were taken except half of one, which came from a stale read, and one optional idea. Each claim about how the language behaves today was checked first. Two findings changed what the docs promise:
- **Fixed goes all the way in.** `[...gears]` gives an array you can add to, but its objects are still the file's. To change items: `gears.map {|gear| return { ...gear }; }`. This was already true of modules, and modules.md now says so too.
- **A key that's a keyword, or `length`, takes brackets:** `label["text"]`, `beam["length"]` (`.length` on an object is its number of keys).

## Questions for you

1. **Icons.** JSON files get the braces icon `pathogen.json` already has; text files a page with two lines (1a). *Recommended: as shown.*
2. **New data file** (2a, 2b): in the **+** menu and a folder's menu, small text "JSON or text". You type the name with its extension. A new JSON file starts as `[]`, a text file empty. *Recommended: as shown.* Or start JSON as `{}`.
3. **A save over a limit:**
   - **(a)** The breadcrumb's save status reads "Not saved", and a toast says why in two lines: "Not saved: data/trips.json is 5.4 MB" / "A data file can be up to 5 MB in a workspace. Your edits stay in the editor." (3c; 3d with the toast closed). *Recommended.*
   - **(b)** Today's surface: the whole sentence in the save status (3b). It squeezes the breadcrumb to "Workspaces / G".
4. **Copy Debug Info:** a data file the imports reach comes with its size and first 20 lines, unless the error is in it, and lines over 200 characters are cut (most GeoJSON is one line). *Recommended: yes.* A 5 MB file would otherwise fill the report's whole budget.
5. **Public pages and the review viewer:** View source lists data files with the other files, and so do snapshots, Copy Workspace and Download workspace. *Recommended: yes,* "every file" as today.
6. **Hover and completion** (1c, 1d): hover reads `gears — imported data`, then `data/gears.json · an array of 2 objects: name, x, y, radius, teeth`; completion shows each key's type (`number`, `string`). *Recommended: as shown.*
7. **A project over 50 MB in all** adds nothing when it comes in as a new workspace, as one over 20 files does (4a shows a single file over 5 MB left out). *Recommended: adds nothing,* so a project never arrives half-imported.

## Build items the review and mockups added (beyond note 72's)

- **One message for changing an object inside imported values** (data and modules alike): `Cannot change an object inside gears — it comes from data/gears.json, and imported values are fixed. Make new objects: gears.map {|gear| return { ...gear }; }`. Today it advises `Copy it first: { ...gears }`, which doesn't help.
- **A message for an import by a name with no extension:** `import path "./data/gears" has no extension. Write the file's full name, such as "./data/gears.json".`
- **VS Code, four places, not one:** `preview.ts:191` ignores edits to documents that aren't `pathogen`; `preview.ts:154` passes only open `.pathogen` documents' unsaved text to the compiler; both file watchers (`preview.ts:208`, `extension.ts:56`) match only `*.pathogen` and `pathogen.json`; and the language server is given only `.pathogen` documents, so it has to read data files itself for hover and completion.
- **The playground's refused save gets a toast** (question 3a): today it shows only in the save status.
- **Measure** how much memory a 50 MB JSON file takes as Pathogen values before the CLI page ships. The docs now say only "more memory than its size on disk".

## Commit plan

`tests/docs-examples.test.ts` parses every example, and the page's two `import … from "./data/…"` examples don't parse until 3a's parser change. So, after your approval:
1. this note, the review record and the mockups are committed;
2. the docs stay uncommitted in the tree, and go in with the commit that makes those examples parse (the build's first step);
3. nothing is pushed until 3a works on all three surfaces.

## Next

Your answers to the seven questions, and your approval of the docs. Then the build, tests first.
