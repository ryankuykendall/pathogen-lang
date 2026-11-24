# 3a mockups v3: a lighter New data file dialog

2026-11-24. Your answer to v2's dialog (note 75): one field, the name and the extension after it as a dropdown, with what each extension holds shown only in the dropdown's list. Only the dialog's states; the rest of v2 (`../mockups-3a-data-files-v2/`) stands.

- **Review them in the gallery:** `website/bbwp/2026-11-24-12:09:07--modules--3a-data-files-mockups-v3.bbwp.html` (localhost:3001), built by `../mockups-bbwp.ts`.
- `shoot.ts`: makes them, with `npm run dev:stack` up: `npx tsx project-docs/modules/mockups-3a-data-files-v3/shoot.ts`. The dialog's frame is the playground's `confirm-dialog`; the field and the list are put into it, styled from the theme's tokens and the tree menu's rules.

| State | Shows |
|---|---|
| `2b-new-data-dialog` | The dialog: `trips` and the `.json` dropdown in one field; "Adds data/trips.json"; Cancel and Create |
| `2c-extension-list` | The dropdown open: `.json` (checked), `.geojson`, `.topojson`, `.fold`, each with what it holds |
| `2d-name-taken` | `gears`: "data/ already has gears.json.", the field marked, Create off |

One run, 6 shots, after widening the list from 260 to 300 px so each hint fits on one line.
