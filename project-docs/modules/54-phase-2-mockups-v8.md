# Phase 2 mockups v8: no file open

2026-11-11. Your decision on the last tab (note 52), in your words: "I don't understand the concern around allowing a user to close all tabs. We could always come up with a zero-state design for no open tabs that provides a recommendation for a opening starting point."

The mockup is in `phase-2-mockups-v8/`:
- `multi-file-mockup-v8.html`, also as the BBWP `2026-11-11-13:01:58--multi-file-workspaces--mockup-v8.bbwp.html` (localhost:3001/website/bbwp/);
- a PNG of each state, light and dark (`nofile-<state>-<theme>.png`).

**How it's built.** v8 is v7's built page with one screen in place of v7's five. `build.ts` reads `phase-2-mockups-v7/multi-file-mockup-v7.html` in place (v6 and v7 are unchanged) and adds v8's parts. The empty state takes the shape of v7's empty preview: an icon, a heading, a line of text, one button.

**Only this screen is new.** The tree, its + menu, the file and folder menus, Rename, Move to…, the delete dialog, the toast with Undo and the read-only `pathogen.json` were drawn in v6 and v7, and you approved them. Step 4 builds them as drawn.

## What's drawn (screen Z)

| State | What |
|---|---|
| The last tab closed | The editor says no file is open, and offers **Open main.pathogen**, the program the preview shows. The tabs bar stays, with Docs at its right end. The breadcrumb ends at the workspace. |
| Another program shown | With try-sizes chosen in the chip, the button opens `try-sizes.pathogen` (question 1). |
| The tree hidden | Files is off: a second button, **Show files**. |
| The only open file deleted | The toast, the empty state, and the preview back on the main (screen O's rule). |
| Only libraries | The preview offers New program (v7, screen X). The editor points to it instead of offering a second one (question 2). |
| No files | Every file deleted; `pathogen.json` is `{}`. The preview's line says the workspace is empty, not that every file is a library. |
| The ⋮ menu | Format Document is off: "No file open". Copy URL is gone (your 2d answer). |
| Copy Code | Off, with "No file open: open one to copy its code". |

Settled without a question, from what's already decided or built:
- **Opening the workspace again opens its main**, as today. Open tabs aren't remembered across a reload (the store's `openFiles` isn't saved), so this screen only follows something you did.
- **The tree is shown by default.** Every approved mockup draws it shown, and Files hides it.
- **What needs a file waits for one**: Copy Code and Format Document. Snapshot, Export, Copy SVG and the rest are about the drawing and don't change.
- **Closing a tab keeps that file's undo** while the workspace is open (the docs page already says so). The small line under the button repeats it.

## Questions for you (recommendation first)

1. **The button opens the program the preview shows.** Then the editor and the drawing are on the same file. They differ only after you choose another program in the chip, and then the button follows the chip. Recommended: yes.
   - The other option: it always opens the main.
2. **With nothing to draw, one New program, in the preview.** With only libraries or no files, the preview already has New program (screen X, approved). The editor says where it is rather than repeating it. Recommended: yes.
   - The other options: the editor gets a New program button too (two on screen), or its button opens the first file in the tree.

## The docs page, drafted

`docs/workspace-files.md`, "The file tree and tabs". These replace two lines once you've answered:

- Was: "A tab's **×** closes it, and so does a middle-click. The last open tab stays open."
  Now: "A tab's **×** closes it, and so does a middle-click. With every tab closed, the editor offers to open the program the preview shows, and any file in the tree opens too. Opening the workspace again opens its main."
- Was: "**Copy Code** copies the file in the editor."
  Now: "**Copy Code** copies the file in the editor. With no file open, it's off."

## Your answers (2026-11-12), in your words

"Answers: 1. Always main; 2. Can you mock-up this concept so that I can better understand what you are proposing? Then I can make a decision and we can proceed."

- Question 1: **the button always opens the main**, not the program the preview shows.
- Question 2: open. v9 draws the three ways side by side (note 55, `phase-2-mockups-v9/`).

## After your review

- Fold the answers into the docs page (the two lines above).
- Step **4d** builds the screen. Steps 4a to 4c (the tree, adding files, the menus) are already drawn and approved, so they go ahead while you review (note 52).
