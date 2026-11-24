# Content review: 3a docs after the first mockup round (note 74)

2026-11-24. A focused review (content-reviewer) of the passages changed for note 74: `docs/workspace-files.md` "Data files", "Adding files and folders", "Uploading files" and "Limits"; `docs/data-import.md` "Know these before you start", "File types", "In the editor" and two Errors rows. It checked them against note 74's decisions. 5 must-fix, 3 should, 3 consider.

| # | Finding | Disposition |
|---|---|---|
| M1 | data-import.md, "Its extension says how it's read" suggests several readings when only JSON is left, and doesn't finish the thought | Taken: "**Data files are JSON:** `.json`, or a format built on JSON (`.geojson`, `.topojson`, `.fold`). Any other extension is an error." |
| M2 | The New data file… bullet: 8 sentences; `data/trips.json` appears without saying it's added to `data/`; bad names not covered. Asked: `trips.txt`? A workspace at 20 files? | Taken, split into three sub-bullets. The refusals now name a taken name, an extension that isn't one of the four (`trips.txt`), a name that breaks the name rules, and a workspace at 20 files: the dialog says why and Create is off, as New program's field does today ("A workspace can hold at most 20 files, and this one has 20.") |
| M3 | "Adding files and folders" says New program and New module put a name field in the tree, and never mentions the dialog | Taken: a bullet pointing to the dialog |
| M4 | The Data files bullet says "an edit that takes a file past its limit", Limits says "a save that would pass a limit"; the 50 MB total left out; Limits linked twice | Taken: "If an edit would take the file or the workspace past a limit, it isn't saved … Your edits stay in the editor ([Limits])" |
| M5 | Limits: "refused before anything is lost" reads as if something's lost after; "beside any errors" unclear; only the message said to stay; "make the file smaller" is the wrong fix for the 50 MB total | Taken: "the playground doesn't save it, and nothing is lost … with any other errors … Both stay until the file saves. When it fits again, made smaller or with other files deleted to make room, it saves." A save retried after a delete is a build item (note 74). The reviewer's point that this paragraph also covers `.pathogen` files over 1 MB is note 74's open question 2; approval of the paragraph waits on it |
| S1 | `./data/profile.txt` as the unknown-extension example: text may come back, and CSV comes in 3b | Taken: `./data/sizes.xlsx` |
| S2 | Row label "A JSON file that isn't UTF-8" | Taken: "A data file that isn't UTF-8 text" |
| S3 | "under the editor" can read as the preview on a phone | Taken: "at the bottom of the editor", the owner's words |
| C1 | Uploading: "the message says why", show it | Taken: the `profile.txt` reason quoted |
| C2 | "Upload folder…." ends with a full stop after the ellipsis | Not taken: that sentence is published text from before 3a |
| C3 | "an error that lists these" → "its message lists these four" | Not taken: the table has one row of four extensions, and it grows with 3b |

After the fixes: `npm run build:docs`; every `#` link in the six pages resolves; `tests/docs-examples.test.ts` has only the expected failure (the default import 3a's parser adds).
