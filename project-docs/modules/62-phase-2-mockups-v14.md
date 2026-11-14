# Phase 2 mockups v14: copying code, round 2: one cell in every header

2026-11-14. Your critique of v13 (note 61): "In the case of it being in a tab bar or a filename header, I want the styling where the button sits inside of a block (with a border to the left of the button like this" (the workspace's tabs), "but not like this" (the snapshots page's file line): "this just doesn't feel very tidy with the vertical spacing, the right margin in the button, etc...tighten this up. The positioning for single files where the tab bar or filename header are not present, is fine (top right of code editor.)"

## Where to look

The mockup is in `phase-2-mockups-v14/`:
- `multi-file-mockup-v14.html`, also as the BBWP `2026-11-14-15:07:33--multi-file-workspaces--mockup-v14.bbwp.html` (localhost:3001/website/bbwp/);
- a PNG of each state, light and dark: `copy-<state>-<theme>.png`, 14 states.

**How it's built.** v14 is v13's built page with:
- a few lines of CSS;
- a new section;
- a short script that takes out v13's floating workspace state.

`build.ts` reads `phase-2-mockups-v13/multi-file-mockup-v13.html` in place.

## Before and after

| | v13 (before) | v14 (now) |
|---|---|---|
| **A file's line** (the snapshots page, the review modal, the public page) | 28 px tall. The 26 px icon nearly touched its edges, and was inset from the right with no border | **34 px tall**, the tabs' height. The icon sits in a cell of its own, 38 px wide and the line's full height, with a border on its left, flush right |
| **The phone's file menu** | The icon after the count, inset | The same cell, after the count |
| **The workspace's tabs** | The cell before the docs book (a), or floating (b) | **The cell**, as you chose. The floating option is gone |
| **The Files header** beside the code | 28 px | 34 px, so its bottom line meets the file line's |
| **One file** | The icon floats in the code's top right corner | Unchanged |

So one cell, with the same width, border and icon, sits in the tabs, a file's line and the phone's menu.

## Settled

- The workspace's icon sits at the right end of the tabs, before the docs book (note 61, question 1, a).
- Code examples in the docs and the blog: on the backlog, for after the first release ("Copy for the code examples in the docs and the blog").
- The icon copies the file shown, and the review modal's ↗ is hidden for every entry. These were note 61's readings; you didn't raise them, so they stand.

## After your review

- The icon is built with each screen:
  - the snapshots page, the workspace and blog embeds in step 3;
  - the review screen in step 5;
  - the public page in step 6.
- Step 2 (the snapshot's manifest records `program`) can start now.
