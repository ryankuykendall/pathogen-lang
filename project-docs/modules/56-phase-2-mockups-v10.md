# Phase 2 mockups v10: no file open, round 3, buttons in the editor only

2026-11-12. Your direction on v9 (note 55), in your words: "I find all of the options a bit confusing because in some cases the preview pane has a call to action, and I think that all of the calls to action should be limited to the code editor zero-state. With that constraint in mind, please take another pass at the mock-ups."

The mockup is in `phase-2-mockups-v10/`:
- `multi-file-mockup-v10.html`, also as the BBWP `2026-11-12-15:39:57--multi-file-workspaces--mockup-v10.bbwp.html` (localhost:3001/website/bbwp/);
- a PNG of each state, light and dark (`nofile3-<state>-<theme>.png`).

**How it's built.** v10 is v9's built page with one screen in place of v9's. `build.ts` reads `phase-2-mockups-v9/multi-file-mockup-v9.html` in place (v6 to v9 are unchanged).

| | v9 (before) | v10 (now) |
|---|---|---|
| Where you start something, when nothing draws | The preview's New program (v7, screen X), and the editor's option A, B or C | **Only the editor's zero-state**: every button is there |
| The empty preview | Why it's empty, and a New program button | **Why it's empty, and where to start. No button** |
| A library open, and no program (v7, screen X, state 1) | The preview's New program | **The + in the Files header**, whose menu has New program. The preview says so |
| The editor's button, with a main | Opens the main (answer 1) | The same |

## The rule, drawn

- **The preview only shows.** It draws the program, or says why there's nothing to draw. It never has a button.
- **With a main** (states 1 to 3), the zero-state's button opens it, whatever the preview shows (answer 1). With the tree hidden, Show files is beside it.
- **With no program** (states 4 and 6), the zero-state's button is **New program**, the only one on screen. That settles question 2: no second button in the preview (v9's B), and no button that opens a library (v9's C).
- **New program from the zero-state** (state 5) puts the name field in the tree, at the top level, as the +'s New program does there, and the field says it will be the main. Enter opens it, and the preview shows it (v7, screen X, state 4, unchanged).
- **A library open, and no program** (state 7): a file is open, so there's no zero-state. Nothing new appears: the preview's text points to the **+** in the Files header, where New program already is.
- **Unchanged from v8:** the ⋮ menu and Copy Code with no file open (both off, saying why), and deleting the only open file.

## What this changes in approved screens

- **v7, screen X (the empty preview):** its New program button goes. Its state 3 ("New program, from the preview") now starts from the editor's zero-state, or from the + menu.
- Nothing else drawn before has a button in the preview.

## One question (recommendation first)

1. **State 7: the preview's text points to the + in the Files header.** Recommended: it keeps every button in the editor's zero-state, as you asked.
   - The other option: a line above the open library, like pathogen.json's read-only line, with New program in it. That's a button outside the zero-state, so it bends the rule.

## After your review

- `docs/workspace-files.md`, "The file tree and tabs": with every tab closed, the editor offers to open the main (or, with no program, New program), and any file in the tree opens too. Opening the workspace again opens its main. Copy Code is off with no file open.
- The empty preview needs no change on the docs page: it already says "The preview is empty and says to add a program", with no button.
- Then step **4d** builds the zero-state, and the empty preview loses its button (the playground hasn't built that button yet: step 9 draws the empty preview).
