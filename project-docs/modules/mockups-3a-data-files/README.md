# 3a mockups: data files in a workspace

2026-11-23. What the drafted docs say a workspace does with data files (`docs/workspace-files.md` "Data files", `docs/data-import.md` "In the editor"), drawn on the real playground. The proposals and their questions: note 72, "Proposed in the drafts, to confirm in the mockup round".

- `<state>-light.png`, `<state>-dark.png`: 12 states in both themes.
- `shoot.ts`: makes them, as 2g's did: a workspace on the dev playground with the proposals added to the real page. Run it with `npm run dev:stack` up: `npx tsx project-docs/modules/mockups-3a-data-files/shoot.ts`. The dev API holds `.pathogen` files only, so the stored `main.pathogen` holds the table inline (the preview draws what the import would), and everything a data file adds is put into the page after it loads. The script's header says what's real and what's made up.

| State | Shows |
|---|---|
| `1a-tree-editor` | `data/gears.json` and `data/profile.txt` in the tree with their own icons, the `gears.json` tab (its extension kept), the JSON in the editor with `pathogen.json`'s highlighting |
| `1b-json-error` | A comma missing: the editor's error mark at line 3, the error under `data/gears.json` with `imported from main.pathogen line 2`, red dots on `gears.json` and `main.pathogen` |
| `1c-hover` | `main.pathogen` with the import; hover on `gears`: `gears — imported data`, then `data/gears.json · an array of 2 objects: name, x, y, radius, teeth` (today's hover form, `**name** — *kind*`) |
| `1d-completion` | Completion after `gear.` in the loop: the keys, with each value's type as the detail. The signature help above it is the real one |
| `1e-tree-phone` | The tree's drawer on a phone, with the data files |
| `2a-plus-menu` | The **+** menu with **New data file** ("JSON or text") after New module, adding to `data/` |
| `2b-name-field` | Its name field in `data/`, holding `trips.json`, with no `.pathogen` after it; the line under it: "Starts as [] · Enter to create, Esc to cancel" |
| `3a-upload-message` | The upload's toast: added `gears.json` and `profile.txt` to `data/` (marked in the tree); not added `trips.json` (6.2 MB) and `notes.md` |
| `3b-save-refused` | A save refused for size, on today's surface: the save pill in the breadcrumb (`Error: …`, the message also its tooltip). The sentence crowds out the breadcrumb |
| `3c-save-refused-toast` | The alternative: the pill says "Not saved", and an error toast says why, split to fit its two lines |
| `3d-not-saved-status` | 3c with the toast closed: the save status at the breadcrumb's right end still reads "Not saved" (the open toast covers it) |
| `4a-import-project` | The New Workspace page's import card: programs, the module, and the two data files with their icons and a `data` label; under "Not added", `data/trips.json` (82 MB) |

All 24 shots are from one run (2026-11-23), after the dev stack came back from two crashes of Wrangler's own (an esbuild watcher deadlock, then a proxy error). The failed runs may have left a "Gear studies" workspace or two in the dev KV, under random owner ids.
