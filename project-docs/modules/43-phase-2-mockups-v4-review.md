# Phase 2 mockups v4: your review

2026-11-06. Mockups: `phase-2-mockups-v4/` (bbwp `2026-11-06-15:29:55--multi-file-workspaces--mockup-v4.bbwp.html`). v3 review: `41-phase-2-mockups-v3-review.md`.

## Your feedback, in your words

- "All looks great except for the Export flow displaying in a modal. Again...let's defer that workflow at a later point."
- "One thing I have not seen yet is what the workflow looks like when a user clicks on the '+' button in the files menu. How is that going to work with files, folders, and potentially uploading files from the local filesystem to be added to the project?"
- On renaming the menu item to "Set as main": "yes I think this is the right direction."

## Decided

| Question | Decision |
|---|---|
| v4 as a whole | Approved, except the export dialog |
| Export | Deferred: nothing of it in the mockups until step 2g (`42-phase-2-order.md`) |
| The row menu item | **"Set as main"**, matching the badge and `pathogen.json` |
| Which files the chip lists | Every file that isn't a library, with or without `define ViewBox` (v4 listed `try-sizes`, which has none). Taken as approved from "All looks great"; not asked again |

## Explored in v5

The "+" in the Files header: new programs, libraries and folders, and uploading files from your computer (picker and drag and drop), with name clashes and file types the playground can't take yet. Also in v5: the tabs bar loses its "+", so files are added only from the tree.

## Open, from v5

- **Font files in a workspace.** CLI and VS Code projects can carry a `fonts/` folder (`@font "./fonts/a.ttf"`); v5 refuses font uploads with the playground's existing message. Holding them would need the playground to load fonts from the workspace.
- **Empty folders.** Recommended: kept, so the workspace stores folders as well as files (storage design, 2b).
- **Which characters a file name may hold** (spaces, for one): storage design, 2b. Names are compared without case in v5.
- **Size limits** per file and per workspace (the server has none for code today; `backlog.md`).
