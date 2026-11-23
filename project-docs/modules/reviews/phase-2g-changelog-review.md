# Phase 2g: the CHANGELOG entry's content review

2026-11-23. One content-reviewer pass over the draft (`tmp/2g/changelog-2g-draft.md`), checked against the docs, note 70, the code review's record and the code. 3 must-fix, 7 should-fix, 5 optional.

| # | Finding | Disposition |
|---|---|---|
| 1 | must-fix. "Zips from Finder's Compress, Windows, …": no zip made on Windows was tested; the fixtures are Info-ZIP `zip` and macOS's `ditto` | **Taken:** "Zips made by the `zip` command (Linux and macOS) and by macOS's `ditto`, which Finder's Compress uses, …; so are paths written with backslashes and names in an older encoding." (Names without the UTF-8 flag are read as Windows-1252 when they aren't UTF-8; the standard says CP437, so an accented name from an old Windows tool may read wrong: noted, not changed) |
| 2 | must-fix. "every finding in code taken" overstated the review record | **Taken,** worded as the record has it |
| 3 | must-fix. "compiles its main" contradicted "stays there when the workspace has no program" | **Taken:** "when the main is a program", as the docs say |
| 4 | should-fix. Clashes cover letter case and folders | **Taken** |
| 5 | should-fix. Note 70's decisions 3 (modules only) and 5 (an entry in another letter case) are user-visible | **Taken** |
| 6 | should-fix. The new messages and the menu's "Downloaded …" | **Taken:** a "New messages" bullet; the menu's message in the Download bullet |
| 7 | should-fix. Without a `main.pathogen` | **Taken** |
| 8 | should-fix. Documentation listed too little of `workspace-files.md`; `exporting.md` got a paragraph | **Taken** |
| 9 | should-fix. "add attributes to the page" | **Taken:** "add code that runs on the page" |
| 10 | should-fix. `uploads.ts`'s new exports and the `programNames` store key | **Taken** (`textOf` and `fittedName` were exported before 2g) |
| 11 | optional. Open with "Phase 2g of the multi-file work"; "no API change" | **Taken** |
| 12 | optional. "No new built-in names" under Core | **Taken** in the intro (no Core section: nothing in `src/` changed) |
| 13 | optional. "dot names"; the 20-file sentence | **Taken** |
| 14 | optional. "only the files that come in are read" | **Taken:** "only its `pathogen.json` and `.pathogen` files are read" |
| 15 | optional. The naming bullet under Changed | **Taken** |

## While checking finding 9

An audit of every escape helper in `playground/` and `website/_worker.ts` that writes into an attribute: all escape `"` except the New Workspace page's, which 2g fixed. Its name field also takes a link's title (`/workspace/new?state=…`), a route the code review didn't name and the worst of the three, since anyone can send a link. The Fixed item now names it, and a test covers it (`tests/playground-new-workspace-import.test.ts`, "a quote in a link's title").
