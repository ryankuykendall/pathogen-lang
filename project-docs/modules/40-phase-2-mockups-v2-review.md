# Phase 2 mockups v2: your review

2026-11-06. Mockups: `phase-2-mockups-v2/` (bbwp `2026-11-06-12:35:10--multi-file-workspaces--mockup-v2.bbwp.html`). v1 review: `39-phase-2-mockups-v1-review.md`.

## Your feedback, in your words

- **File names:** "We should keep the '.pathogen' extension in the file tree but not display it in the tab label."
- **Preview card:** "I would also like for us to remove the card background on the viewport (with the slight drop shadow.)"
- **Footer:** "in order to make the programs strip work a bit better, we need to rework our footer. Now that we have the viewbox definition in the code, it is no longer necessary to display that. We should also be able to drop the inline docs toggle from the footer, and we could put a docs icon toggle in the file tabs bar all the way to the right. Background color, Grid, and precision could move else where...I am wondering if we should move them to the top of the layers menu/inspector above Layers?"
- "Then we should be able to drop the footer completely, and go full bleed on the bottom with the code editor and the rendering viewport. That should give us a bit more space to include the film strip."
- **Strip:** "One change that I would like to see with the fill strip version is for it to be tighter and more compact."
- **A chip with a dropdown:** "An alternative treatment I would like to see is similar to showing the chip in the viewport (the one that displays 'Showing main') but I would like to see it operate as a dropdown that has mini-renderings inside of it allowing the user to toggle between the renderings. Again, let's remove the mini-map in the top left so that the fullscreen button can sit in the top left corner, and then the select rendering chip can display in the middle. We could also try a variation that puts the 'select rendering chip' to the right of the zoom controls, and as a group, the two controls would be centered at the bottom."
- **Primary:** "By default 'main.pathogen' should always be the only file in a new workspace. I would like to lean on the convention that 'main.pathogen' is the primary file. That being said, we do need a way of marking a file as 'primary' which behind the scenes with will setting the main: value in a pathogen.json file when a user exports the workspace."

## Decided

| Question | Decision |
|---|---|
| `.pathogen` in the tree | **Kept.** v2's assumption (drop it in the tree and breadcrumb) is reversed. Tabs still drop it |
| The preview's card | **Removed:** no rounded card, no shadow. The drawing sits on the pane |
| The footer | **Removed.** The viewBox display goes (the source says it). Docs becomes an icon toggle at the right end of the tabs bar. Background, Grid and Precision move (v3 shows them at the top of the inspector, above Layers) |
| Editor and preview | Run to the bottom of the window |
| The minimap | Gone in every v3 variant. The fullscreen button takes the top-left corner |
| New workspace | Holds `main.pathogen` only |
| The primary | `main.pathogen` by convention; another program can be marked primary. Export writes it as `main` in `pathogen.json` |

## Explored in v3

- A tighter Programs strip (B).
- The "Showing main" chip as a dropdown of miniatures: at the top centre (F), or beside the zoom controls at the bottom centre (G).
- The inspector's new top section, the docs toggle, and the layout without a footer.
- The primary: a new workspace, marking another file primary, and what export writes.

## Not mentioned in the review, still open from v2

- The preview rule (the preview follows the program you open; editing a library keeps the last program shown if it imports that library).
- Demos as programs, with "New demo" (screen D); every program draws, with or without `define ViewBox`.
- After picking another program, edits to a file it doesn't import don't change the big preview.
- Renaming a file: rewrite the import paths in other files (from v1).
