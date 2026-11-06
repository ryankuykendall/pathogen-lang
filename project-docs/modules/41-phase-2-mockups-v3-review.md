# Phase 2 mockups v3: your review

2026-11-06. Mockups: `phase-2-mockups-v3/` (bbwp `2026-11-06-14:08:02--multi-file-workspaces--mockup-v3.bbwp.html`). v2 review: `40-phase-2-mockups-v2-review.md`. The phase 2 order with the steps added here: `42-phase-2-order.md`.

## Your feedback, in your words

- **The picker:** "I think that the select rendered view dropdown works, but I would remove the preview from the closed state and top chip...it looks awkward...I would also like to get rid of the 'Libraries don't draw...' message at the bottom of the drop down...That being said...I think it makes the most sense to put it on the bottom adjacent to the zoom controls..."
- **#2, export:** "I do think we are going to need an export project workflow, but for now, let's just stub in the button and then add another step in our planning and implementation to address that workflow...in addition, we need to figure our what our 'copy debug info' is going to do here (it needs a big refresh as part of this effort.)"
- **#3, the primary:** "I like what we are doing with the contextual menu in setting primary, but I am not sure the star is the proper visual treatment...what I think could work instead is to keep our convention of main.pathogen being the convention for the primary entrypoint, but that we badge the main entrypoint with 'main' when it diverges from our convention."
- **#4, image export and Snapshot:** "Let's circle back to this when we do the planning on export project. I like your recommendation, but I would still like to think this experience through"
- **#5, the breadcrumb:** "Agree that this is the correct presentation"
- **#6, the mini-workspace:** "I think that we could make background and grid available in the mini-workspace, but not precision (because the SVG is already compiled.)"
- **#7, the preview rule:** "The preview selector chip is the only thing that should change what is in the current viewport (editing a library should not change the users selection.)"
  - On "Any program can be a demo, and every program draws, with or without define ViewBox": "is no longer true as we decided against this behavior in moving to more strictly designed modules"
  - On "After you pick another program, edits to a file it doesn't use won't change the big preview": "this is correct"
  - On "Renaming a file should rewrite the import paths in the other files": "yes to this."

## Decided

| Question | Decision |
|---|---|
| Program picker | **G:** the chip beside the zoom controls, centred at the bottom. B (strip) and F (top chip) are not pursued |
| The closed chip | The program's name and a caret; no picture |
| The list | No line at the bottom |
| What changes the preview | **Only the chip.** Opening a file, in the tree or a tab, or editing a library, never changes what's shown. A workspace opens on the primary |
| Edits to a file the shown program doesn't use | Don't change the preview (confirmed) |
| The primary | `main.pathogen` by convention. No star. When another file is the entry point, it gets a `main` badge. "Set as primary" stays in the row menu |
| Breadcrumb | Keeps `.pathogen` (agreed) |
| Mini-workspace | Gets Background and Grid, not Precision (its SVG is already compiled). A UI change, so it gets a mockup when it's built |
| Renaming a file | Rewrites the import paths in the workspace's other files. This reverses 38-'s Q5 recommendation; it is phase 2 scope, separate from renaming an identifier across files (backlog) |
| Export project | The button is in the mockup; the workflow is a new step (`42-`, 2g) |
| Copy Debug Info | Needs a refresh for multi-file workspaces; a new step (`42-`, 2h) |
| Image export and Snapshot of a program that isn't the primary | Revisit in the export-project planning (2g) |

## Open

- **Which files the picker lists.** You wrote that "every program draws, with or without `define ViewBox`" is no longer true. What I meant by "program": a file without `module;`. A library (`module;`) never draws; that is the strict-modules rule, and nothing here changes it. `try-sizes.pathogen` has no `define ViewBox` and compiles today at the default 0 0 200 200, in the CLI, VS Code and the playground. The question: should the picker list every file that isn't a library, or only files that define a ViewBox? v4 keeps `try-sizes` in the list until you say.
- **One word for the entry point.** The badge says `main`, and `pathogen.json` says `main`; the menu says "Set as primary". Keep both words, or make the menu match ("Set as main")?
