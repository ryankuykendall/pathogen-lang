# Phase 2g docs: the content review

2026-11-23. One content-reviewer pass over the 2g docs changes:
- `docs/workspace-files.md`: "Downloading a workspace", "A workspace from a project", the Export, Copy SVG and Snapshot bullet, the "Uploading files" bullet for project folders, and "Limits";
- one sentence each in `docs/projects.md`, `docs/exporting.md` and `docs/snapshots.md`.

The pass was checked against notes 68 and 69, both mockups' `shoot.ts` and the PNGs. Every UI string matched, and so did note 69's rule for when an import stops. Result: 2 must-fix, 8 should-fix and 2 optional findings, all taken.

| # | Finding | Disposition |
|---|---|---|
| 1 | must-fix. The rename sentence ("as in an upload, and the imports … change to match") reads as if uploads rewrite imports too. It says nothing of `entryPoints`, so a renamed main would be dropped. It also leaves out folders | **Taken:** "Unlike an upload, the imports and `entryPoints` entries that name it change to match, so the project still draws and keeps its main." Files and folders both, and the page lists each change |
| 2 | must-fix. Dot names were under "The page lists each one", but an upload drops them "without a mention", so a git repo would fill "Not added" with `.git/` | **Taken:** dot names join `__MACOSX`, left out without a mention |
| 3 | should-fix. "More than 20 files" reads as counting a README or `out/*.svg` | **Taken:** "more than 20 `.pathogen` files, not counting what's left out", here and under Limits |
| 4 | should-fix. Fitting names can make two names clash (`my gear` beside `my-gear`, or `Gears` and `gears` from Linux), and the import has no Replace or Keep both prompt | **Taken, a new decision (not in notes 68 or 69):** the second gets a number, as Keep both gives one, with its imports following. An upload would leave it out instead |
| 5 | should-fix. "VS Code's preview opens on the same programs" contradicts projects.md ("starts from the tab you open it from") | **Taken:** "VS Code's program list holds the same programs, in the same order" |
| 6 | should-fix. "Follow by name" doesn't match the mockup, which sorts by path (`demos/train` before `sketch`) | **Taken:** "in order of their paths", with that example; unlisted programs join the end in the same order |
| 7 | should-fix. The project-folder bullet under Uploading still led with the drag advice, with the new route last | **Taken:** it leads with the new workspace; the drag advice stays for adding to an existing workspace |
| 8 | should-fix. The CLI parenthesis read as if the CLI caused the file | **Taken:** "A workspace you download later includes this file, so the CLI, which needs one to compile a folder, compiles it." |
| 9 | should-fix. "Choose the folder again" doesn't fit a `.zip`, and mockup 2i's string says the same | **Taken** in the docs ("the folder or the `.zip`"). **For the build:** 2i's message says "choose it again" or names what was picked |
| 10 | should-fix. "`pathogen-lang Gear-studies` compiles its main" is false for a workspace with no program, or a module as its main | **Taken:** "When the workspace's main is a program, …" |
| 11 | optional. "On a phone or a tablet": the rule is touch. "A `pathogen.json` inside a folder" clashes with a `.zip` that holds the project in one folder | **Taken:** "On a touch screen, … with no drop area"; "a `pathogen.json` below the project's top" |
| 12 | optional. The stop list leaves out "not an object". The message names the folder or `.zip`, and the broken-JSON wording is the browser's. Also "including edits not saved yet", what happens when every entry is dropped, the order of unlisted programs, and the header comment's stale "Not yet" | **All taken** |

## Recheck

All 12 fixes landed as intended. The edits brought three new should-fix findings, all taken:

| # | Finding | Disposition |
|---|---|---|
| R1 | "naming the folder or the `.zip` where the CLI names a path" reads "where" as a place | **Taken:** "in place of the path on your computer that the CLI names" |
| R2 | Under "Uploading files", "comes in whole as a new workspace" reads as if uploading does that | **Taken:** "can come in whole" |
| R3 | "The second gets a number" doesn't say which is second | **Taken:** "the second in order of their paths", matching the program-order rule |
