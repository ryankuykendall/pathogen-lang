# Phase 2 mockups v9: no file open, round 2

2026-11-12. Your answers to note 54, in your words: "1. Always main; 2. Can you mock-up this concept so that I can better understand what you are proposing? Then I can make a decision and we can proceed."

The mockup is in `phase-2-mockups-v9/`:
- `multi-file-mockup-v9.html`, also as the BBWP `2026-11-12-15:28:37--multi-file-workspaces--mockup-v9.bbwp.html` (localhost:3001/website/bbwp/);
- a PNG of each state, light and dark (`nofile2-<state>-<theme>.png`).

**How it's built.** v9 is v8's built page with one screen in place of v8's. `build.ts` reads `phase-2-mockups-v8/multi-file-mockup-v8.html` in place (v6, v7 and v8 are unchanged) and adds v9's parts.

| | v8 (before) | v9 (now) |
|---|---|---|
| The editor's button, with no file open | Opened the program the preview shows | **Always opens the main** (answer 1). States 1 and 2 |
| With no program at all | One way drawn: the editor points to the preview's New program | **Three ways drawn**, A, B and C (question 2). States 3 to 8, and side by side below the window |

## Answer 1, drawn (states 1 and 2)

- The editor says "The workspace's main is `main.pathogen`. Open it, or click any file in the tree," with **Open main.pathogen**.
- With try-sizes chosen in the chip (state 2), the button still opens the main. try-sizes opens from the tree.

## Question 2, drawn three ways (states 3 to 8)

It comes up only when the workspace has **no program**: every file is a library, or there are no files. Then there's no main for the editor's button to open. The preview already has New program there (v7, screen X, approved). The question is what the editor shows beside it.

| Option | The editor shows | New program buttons on screen | With no files at all |
|---|---|---|---|
| **A** (recommended) | No button. Its text, and a pointer toward the preview ("New program is in the preview →"), say where New program is | One: the preview's | The same |
| B | Its own New program button, which does what the preview's does | Two, that do the same thing | The same |
| C | A button that opens the first file in the tree (`parts/gears.pathogen`, a library) | One: the preview's | Nothing to open, so it's A |

A's pointer is new in v9. v8 said the same thing in its text only, which is why it was hard to picture.

Why A:
- **One action, one place.** Two buttons that do the same thing (B) make people wonder how they differ.
- **Opening a library (C) doesn't help draw anything**, and any file in the tree already opens with a click.

Below the window, the three editors stand side by side for the "only libraries" case.

## After your choice

- Fold both answers into `docs/workspace-files.md`, "The file tree and tabs" (note 54's drafted lines), with "the program the preview shows" now "the main":
  - "A tab's **×** closes it, and so does a middle-click. With every tab closed, the editor offers to open the main, and any file in the tree opens too. Opening the workspace again opens its main."
  - "**Copy Code** copies the file in the editor. With no file open, it's off."
- Then step **4d** builds the screen.
