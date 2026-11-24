# 3a mockups v2: data files in a workspace

2026-11-24. The first round's answers (note 74) drawn on the real playground. v1 is in `../mockups-3a-data-files/`, unchanged.

- **Review them in the gallery:** `website/bbwp/2026-11-24-11:54:26--modules--3a-data-files-mockups-v2.bbwp.html` (localhost:3001), built by `../mockups-bbwp.ts`. After a re-shoot, run `npx tsx project-docs/modules/mockups-bbwp.ts`, then `npx tsx scripts/update-bbwp-index.ts`.
- `<state>-light.png`, `<state>-dark.png`: 11 states in both themes.
- `shoot.ts`: makes them, as v1's did. Run it with `npm run dev:stack` up: `npx tsx project-docs/modules/mockups-3a-data-files-v2/shoot.ts`. Its header says what changed from v1, and what's real and what's made up.

| State | Shows | From v1 |
|---|---|---|
| `1a-tree-editor` | `data/gears.json` and `data/sizes.json` in the tree, both with the braces; the `gears.json` tab; the JSON highlighted | braces for every data file; no `profile.txt` |
| `1b-json-error` | A comma missing: the error mark at line 3, the error under `data/gears.json` with `imported from main.pathogen line 2`, red dots | the tree only |
| `1c-hover` | Hover on `gears`: `data/gears.json · an array of 2 objects: name, x, y, radius, teeth` | as agreed |
| `1d-completion` | Completion after `gear.`: the keys with their types | as agreed |
| `1e-tree-phone` | The tree's drawer on a phone | the tree only |
| `2a-plus-menu` | The **+** menu with **New data file…** after New module, no small text | no "JSON or text"; the ellipsis |
| `2b-new-data-dialog` | The dialog: the name (`trips`, the extension after it), "Makes data/trips.json, starting as {}", the type list (JSON, GeoJSON, TopoJSON, FOLD), Cancel and Create | new: replaces v1's name field in the tree |
| `2c-name-taken` | The same with `gears`: "data/ already has gears.json." (the tree's own words), Create off | new |
| `3a-upload-message` | The upload's toast: added `gears.json` and `sizes.json`; not added `trips.json` (6.2 MB) and `profile.txt` (what a workspace holds) | `profile.txt` left out |
| `3b-save-refused` | A save refused for size: "Not saved" in the save status, and the reason in the error panel under `data/trips.json` | the error panel, not the breadcrumb (v1 3b) or a toast (v1 3c, 3d) |
| `4a-import-project` | The New Workspace page's import card: two JSON files with the braces; under "Not added", `data/trips.json` (82 MB) and `data/profile.txt` | `profile.txt` left out |

**The dialog's frame** is `confirm-dialog`, the native `<dialog>` the tree's Delete… already asks with (its title bar, its Cancel and its button); the name field and the type list are put into its body. The build can reuse it, or make a sibling with the same styles.

**Runs.** The first run (22 shots) was good; a re-run for two wording changes (the taken-name line in the tree's words; "Maps with shared borders") was cut short when the dev API's Wrangler crashed ("Error inside ProxyWorker: Network connection lost"), and so was the next, right after a restart. The script now waits for a page's requests to finish before closing it, and the run after that made all 22 shots. The interrupted runs left one or two "Gear studies" workspaces in the dev KV under random owner ids.
