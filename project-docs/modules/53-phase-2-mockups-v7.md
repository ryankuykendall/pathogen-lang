# Phase 2 mockups v7: what v6 left undrawn

2026-11-09. Your answer to note 52's question 2: "Yes, that would be ideal." The mockups are in `phase-2-mockups-v7/`:
- `multi-file-mockup-v7.html` (also as the BBWP `2026-11-09-15:11:27--multi-file-workspaces--mockup-v7.bbwp.html`, at localhost:3001/website/bbwp/);
- a PNG of every state, light and dark;
- `reference/`: today's playground at three widths, a blog mini-workspace and Explore, as shot from `npm run dev:stack`.

**How it's built.** v7 is v6's approved kit with five new screens. `build.ts` reads v6's template in place (v6 is unchanged), adds v7's parts, and replaces v6's screens with them. The rewritten imports drawn in screen F come from step 1's engine (`importEditsForMoves`), so they are exactly what the playground will write.

## What's drawn

| Screen | What | In the four you approved? |
|---|---|---|
| X · No programs left | The empty preview, `pathogen.json` as `{}`, New program from the preview, the first program, the thumbnail and cards | Yes (the empty preview) |
| F · Folders, renaming, moving | A folder's menu, renaming a folder, after renaming (the changed imports marked, a toast with Undo), deleting a folder | Yes (the folder menu) |
| | Renaming a file, Move to…, dragging a file onto a folder | Beyond the four: undrawn in v6, and needed for step 4 |
| M · Narrow screens | A phone: stacked, the tree as a drawer, the program list as a sheet, a row's menu as an action sheet; 760 px | Yes |
| W · The mini-workspace | Background and Grid in the control bar; grid on; a background picked; Reset | Yes |
| K · The ⋮ menu | Copy URL gone; Copy Code's tooltip naming the file in the editor | Beyond the four: your 2d answers, drawn to confirm |

## Questions for you (recommendation first)

1. **The first program in an empty workspace is shown at once** (X, state 4). Everywhere else a new program leaves the preview alone. Here nothing is shown, so the new program is. It's the main by the usual rule, being first in `entryPoints`. Recommended: yes.
2. **Thumbnails while nothing draws** (X, state 5). The playground stops regenerating the thumbnail, so cards keep the last drawing. Your Workspaces page labels the card "No programs". Export, Set Thumbnail and Make public wait for a program. Recommended: all three.
   - The label needs one new field in the workspace list (`entryPoints` is empty). The record is already read there, so it's a small server change.
3. **Undo in the rename and move toast** (F, state 3). Cmd-Z in a file undoes only that file's edits. Undoing an import edit after a rename would point the import back at a name that's gone. The toast's Undo puts the names and every changed import back together. Recommended: yes, for rename and move. Delete keeps its confirmation instead.
4. **How a file moves to another folder** (F, states 5 to 7). The rename field holds the name, in its folder, as New program's field does, so a slash only goes further down. To move up or across, there's **Move to…** in the file and folder menus, as well as dragging. Move to… is also how a phone moves a file.
   - The other option: the rename field holds the path from the top (`parts/gears`). That differs from New program's field, and a phone would still need a way to move without dragging.
   - Recommended: the name in its folder, plus Move to….
   - If you choose that, the docs page's line "A name with a folder in it moves the file" changes to name Move to….
5. **Narrow screens** (M). One rule below 800 px:
   - the editor above the preview, as today;
   - the tree as a drawer, the program list as a sheet, a row's menu as an action sheet;
   - what hover shows on a desktop always shows on touch (each row's ⋮, "Open in the editor");
   - no dragging, and Upload folder… only where the browser can pick a folder.

   Recommended: yes.
6. **The mini-workspace's Background and Grid stay with the embed** (W). Open in Playground carries the code, as today. Reset puts them back with the variables. They aren't remembered after you leave the page. Recommended: yes.

## Your answers (2026-11-09), in your words

1. The first program shown at once: "Agreed".
2. The thumbnail kept, the "No programs" label, Export, Set Thumbnail and Make public waiting: "Agreed".
3. Undo in the rename and move toast: "Agreed".
4. "Agreed that it should just be the name (no path or file extension can be modified on rename.)" So the rename field holds the name alone. A slash in it is refused, with a hint to use Move to…. The `.pathogen` at the end isn't part of the field, as in New program's. Move to… and dragging are the ways to change a file's folder.
5. Narrow screens: "Agreed".
6. The mini-workspace's Background and Grid stay with the embed: "Agreed."

**Folded into `docs/workspace-files.md`** (not yet published):
- the first program in an empty workspace is the main and is shown;
- the thumbnail, the label and the three waiting items;
- Rename changes the name only; Move to… and dragging;
- the toast's Undo, and why a file's own undo isn't enough;
- a new "On a phone" section;
- Copy Code copies the file in the editor (note 52).

The mini-workspace isn't on that page: it lives in blog posts. Its two controls are recorded here, and in note 52's step 9.

## After your review

- **The docs page** (`docs/workspace-files.md`): fold in the answers. That means:
  - the first-program exception;
  - Undo;
  - Move to… (and the rename line, if question 4 goes that way);
  - the thumbnail while nothing draws;
  - a short "On a phone" section.
- **Step 2** (the workspace's edits, pure and tested) comes next, while you review: it needs none of these answers. Each operation will return its inverse, so the toast's Undo is cheap whichever way question 3 goes.
- **Steps 4 and 9** (the tree, and the rest) wait for this review.
