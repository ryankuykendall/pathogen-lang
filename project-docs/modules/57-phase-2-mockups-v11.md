# Phase 2 mockups v11: no file open, round 4, one zero-state in the editor

2026-11-12. Your critique of v10 (note 56), in your words: "Let's get rid of the text 'Each file keeps its undo history while the workspace is open'...I don't think that the zero-state is the appropriate place for this information; In #4 'Only libraries' I see a something in the preview pane...preview pane should not have a zero state...(same goes for 5, 6, 7)...Let's take another pass at this and try to consolidate all of the zero state messaging into the code editor zero-state for this release. If we change our minds at a later point, we can always circle back and re-introduce these concepts."

The mockup is in `phase-2-mockups-v11/`:
- `multi-file-mockup-v11.html`, also as the BBWP `2026-11-12-15:49:02--multi-file-workspaces--mockup-v11.bbwp.html` (localhost:3001/website/bbwp/);
- a PNG of each state, light and dark (`nofile4-<state>-<theme>.png`).

**How it's built.** v11 is v10's built page with one screen in place of v10's. `build.ts` reads `phase-2-mockups-v10/multi-file-mockup-v10.html` in place (v6 to v10 are unchanged).

| | v10 (before) | v11 (now) |
|---|---|---|
| The preview, with nothing to draw | An icon, "No program to show", why, and where to start | **Blank.** No zero-state of its own |
| Why nothing draws | Said in the preview, and again in the editor | **Said once, in the editor's zero-state** |
| "Each file keeps its undo history while the workspace is open." | Under Open main.pathogen | **Gone** |
| A library open, and no program (state 7) | The preview's text pointed to the + in the Files header | **No new message.** The breadcrumb's status reads "No program", and the message after the delete says why |
| The editor's buttons | Open main.pathogen, or New program with no program | The same |

## What's drawn

- **One zero-state, in the editor.** Every button and every "why" is there. The preview draws the program, or stays blank, keeping only its own chrome (the inspector toggle).
- **With a main** (states 1 to 3): "The workspace's main is `main.pathogen`. Open it, or click any file in the tree," with **Open main.pathogen**, whatever the preview shows (answer 1). With the tree hidden, Show files is beside it.
- **With no program** (states 4 to 6): "No program yet" (or "No files yet"), why nothing draws, and **New program**, the only button on screen. Its line: "It goes at the top of the workspace, and it will be the main."
- **New program from the zero-state** (state 5) puts the name field in the tree, at the top level, as the +'s New program does there.
- **A library open, and no program** (state 7): no zero-state (a file is open) and a blank preview. What already exists says what happened: the breadcrumb's status ("No program", which explains itself on hover) and the message after the delete. The + in the Files header adds a program, as always.
- **Unchanged from v8:** the ⋮ menu and Copy Code with no file open (both off, saying why), and deleting the only open file.

v10's question (state 7) is settled by the critique: no message in the preview.

## What this changes in approved screens

- **v7, screen X (the empty preview):** the preview has no zero-state at all now, not just no button (v10). The status "No program", Snapshot off, and no chip or zoom stay as drawn.

## After your review

- `docs/workspace-files.md`:
  - "The file tree and tabs": with every tab closed, the editor offers to open the main (or, with no program, to start one), and any file in the tree opens too. Opening the workspace again opens its main. Copy Code is off with no file open.
  - "Deleting the last program…" says today: "The preview is empty and says to add a program". It becomes: "The preview is empty, and the status reads No program."
- Then step **4d** builds the zero-state. Step 9's empty preview is now just blank.
