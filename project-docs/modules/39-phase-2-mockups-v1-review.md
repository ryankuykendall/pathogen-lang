# Phase 2 mockups v1: your review

2026-11-06. Mockups: `phase-2-mockups-v1/` (bbwp `2026-11-05-17:19:55--multi-file-workspaces--mockup-v1.bbwp.html`). Questions: `38-phase-2-audit.md`.

## Your feedback, in your words

- "The prototypes look great! I would like to go with option #3, the tree with tabs."
- **Badges and several programs:** "I am not sure that the badging is necessary in the files menu showing 'module;' or 'main'...however, it does beg the question as to what happens when there is more than one non-module .pathogen file in a pathogen workspace. You proposed pinning as something that is done on the viewport, but what happens when a user has multiple files in the workspace with a 'define Viewbox(...)' declaration. In that case we might have to allow for pinning in the file system viewer (although I am not sure if pinning is the best metaphor to go with.) It seems that we could consider tabs in the viewport/renderer as well that target files with Viewbox defined. Perhaps this is how we handle demos? Taking this into account, can you do some explorations around what this might look like? Might we consider dropping the mini-map and then providing some kind of film roll type UI that shows mini versions of the primary rendering as well as the demo / secondary renderings?"
- **Editor tabs:** "In the tabs above the code editor, let's drop '.pathogen' from the labels, as well as the badging to preserve space. When we bring in other file types (.svg, .json, .csv, etc) we can display those extensions, but everything else should be assumed to be a .pathogen file."
- "Let's start with this set of changes and see where we end up."

## Decided

| Question (38-) | Decision |
|---|---|
| Q1 layout | **(c) a tree with tabs** |
| Editor tabs | No `.pathogen` in labels, no badges. Other file types, when they come, show their extension |
| Tree badges (`main`, `module;`) | Probably not needed; v2 drops them and explores how a reader tells files apart without them |

## Open, explored in v2

- **Several programs in one workspace.** Since step 5e a library never draws, so the files that draw are the programs: every file without `module;`. Each can render. Which one shows, and how do you switch?
  - tabs in the preview, one per program;
  - a film roll of live miniatures in place of the minimap: the primary rendering and the others;
  - choosing in the tree (a better metaphor than "pin" to be found).
- **Demos as files.** A demo is a program that imports a library and draws with it. If the preview can show any program, a library's demo is just another program beside it, so the delayed `demo { }` block may not be needed at all.
- **The primary rendering.** Thumbnails, export, snapshots and publishing need one rendering to stand for the workspace (today's main).
- **What draws.** Your wording is "files with a `define ViewBox(...)`". A program without one still draws, at the default view box, so v2 asks whether the test is "not a module" or "defines a ViewBox".
- **Dropping the minimap.** The minimap is also the pan and zoom navigator; v2 shows where that job goes.
