# Phase 2f: what VS Code's preview shows (design, for your answers)

2026-11-21. Step 2f of `42-phase-2-order.md`: "VS Code parity for what the preview shows". Decision 16 (`02-decision-log-v1.md`): "Playground preview: the main file by default … VS Code mirrors this." The playground built a program list rather than decision 16's toggle (`docs/workspace-files.md`, "The preview and the program list"), so this note settles what mirroring it means in VS Code. Nothing is built yet.

## The difference that shapes it

A playground workspace writes its own `pathogen.json`, and every program is on its list. In VS Code, `pathogen.json` is written by hand, often isn't there at all, and may list only some programs: "Listing the others is optional" (`docs/projects.md`). Most VS Code use is a single file, or a folder of separate sketches. So the change is for projects that say they are one: everything else keeps today's behavior.

## Before and after

| | VS Code today | Proposed: a folder with a `pathogen.json` that has a main | Playground |
|---|---|---|---|
| Opening the preview | Draws the file you're editing | From a program's tab: that program. From a module's tab, or with no editor: the main | Opens on the main |
| Switching to another tab | Follows it | **Stays** on the program shown | Stays: "Opening a file … leaves the preview on the program you chose" |
| Editing a module | Empty, with "This file is a module…" | **The program shown redraws** with your edit | The same |
| Choosing another program | Open its tab | **Pathogen: Choose Program to Preview…**, or the preview button on its tab | The chip's program list |
| What you can choose | — | The main, then `entryPoints` in order, then the file you're editing if it's a program not on the list | Every program, the main first |
| The program shown is deleted, or becomes a module | — | Back to the main | Back to the main |
| The program shown is renamed or moved | — | The preview follows it | The same |
| A file in another project folder | Follows it | Shows that project's chosen program (its main at first) | One workspace, one project |
| **A single file, or a folder with no `pathogen.json`** | Follows the file you're editing | **Unchanged** | — |

**Unchanged:** imports, fonts, rechecking, and the preview's toolbar, inspector and pan/zoom.

**Not part of 2f:** the playground's miniatures, the red dot for errors in other programs, and the dots marking programs that use the file you're editing. VS Code's Problems panel already lists errors in open files.

## The rules in detail

- **Which folders change.** The project folder is found as now (`findProjectRoot`: the nearest `pathogen.json` upward). Only a project folder with a `pathogen.json` gets a main and a chosen program. Its main is the first of `entryPoints`, or `main.pathogen` when there's no `entryPoints` (`projectMain`). A `pathogen.json` with no usable main (`{}` and no `main.pathogen`) keeps today's behavior.
- **A list with a problem.** If `entryPoints` names a main that's missing, or a module, the preview shows `projectMain`'s message, the CLI's own words for a folder compile. You can still choose another program. If `pathogen.json` can't be read at all, the error shows at the first `import` or `@font`, as it does today, and the preview follows the file you're editing.
- **The choice** is kept per project folder while the preview is open, and resets when it closes. The playground does the same: it opens on the main each time. Several project folders (multi-root, or nested `pathogen.json` files) each keep their own choice.
- **Reading the program shown.** It may not be open in any tab, so it's read with `workspace.openTextDocument`. That takes an open tab's unsaved text, and otherwise reads the disk without showing a tab.
- **The panel's title** names the program shown: `Preview poster.pathogen`, as VS Code's Markdown preview does (`Preview README.md`).

## Questions for you

1. **Who gets the new behavior?**
   - (a) Only folders with a `pathogen.json`. *Recommended:* it's the deliberate "this is a project" mark, so a folder of sketches that happens to hold a `main.pathogen` keeps following.
   - (b) Also folders with a `main.pathogen` and no `pathogen.json`, as `pathogen-lang <folder>` treats them.
2. **What the preview button on a program's tab does.**
   - (a) Shows that program and makes it the choice. *Recommended:* in VS Code, that button is how you point at a file.
   - (b) Always shows the project's choice (the main at first); other programs only through Choose Program. This is closer to decision 16's "main by default", but the button on a demo's tab would then show the main.
3. **Where you choose.**
   - (a) VS Code's own UI: the Quick Pick, opened from the command palette and from a button in the preview's title bar, plus the panel's title. *Recommended:* parity is about what's drawn, and this leaves the preview page and its CSP alone.
   - (b) The playground's chip, in the preview's toolbar. That's a UI change inside the preview, so an HTML mockup round comes first, per your rule for UI changes.

## Your answers (2026-11-21)

1. **(a)** Only folders with a `pathogen.json`.
2. **(a)** The preview button on a program's tab shows that program and makes it the choice.
3. **(b)** The playground's program chip, in the preview. That changes the preview's own UI, so a mockup round comes before the docs and the code (`mockups-2f-vscode-chip/`). The panel's title still names the program shown.

## Mockup v1, for your review (2026-11-21)

`mockups-2f-vscode-chip/` (its README says what's there). Nine states, each in both of VS Code's default themes:
- **today**, for comparison: a module's tab gives an empty preview;
- **1**, opened on the main;
- **2**, the program list;
- **3**, editing a module, with the preview redrawn;
- **4**, a demo's preview button;
- **5**, a program not in `pathogen.json`;
- **6**, another program with an error;
- **7**, a missing main;
- **8**, no `pathogen.json`, unchanged.

**Decided without asking, say if you disagree:**
- **The chip's colors.** The chip and its list keep the playground's shape, with VS Code's colors: the theme's focus blue where the playground uses its purple, as the shared zoom pill already does.
- **No phone sheet.** The list stays a popover in VS Code at any width. The playground turns it into a sheet in windows under 800 px, a rule for phones, and a VS Code preview panel is usually narrower than that.
- **The chip shows only with more than one program,** as in the playground.

**Questions:**
1. **Where the chip sits.**
   - (a) Beside the zoom controls, as in the playground (states 1 to 7). *Recommended:* the same place on both surfaces.
   - (b) At the start of the preview's toolbar, the list opening downward (`list-toolbar-*.png`).
2. **What the list's rows show.**
   - (a) As in the playground: miniatures, and the red dot for another program's error (state 6). This needs each program compiled in the preview with its imports and fonts, as the playground's `program-drawings.ts` does, which roughly doubles 2f's build.
   - (b) Names and paths only (`list-names-*.png`): no program is compiled until it's chosen, so the red dot goes too.
   - *Recommended: (a),* since you chose the chip for parity. (b) is the smaller first step if you'd rather have 2f sooner, with (a) later.

   The dots marking programs that use the file you're editing (state 3) come from each program's imports, not its drawing, so they stay either way.
3. **Two new wordings.**
   - State 5's row: `sketch.pathogen · not in pathogen.json`.
   - State 7's row: "Not found", under a main that doesn't exist; the preview shows the CLI's full message.

## Your answers on mockup v1 (2026-11-21)

1. **(a)** Beside the zoom controls, as in the playground.
2. **(a)** As in the playground: miniatures, and the red dot for another program's error. Each program is compiled in the preview with its imports and fonts.
3. **OK** to both wordings: `sketch.pathogen · not in pathogen.json`, and "Not found".

**A correction to question 1.** Option (b) said the CLI's folder compile treats a folder with a `main.pathogen` and no `pathogen.json` as a project. It doesn't: it stops with "my-gears is a folder with no pathogen.json. Add one (an empty {} compiles main.pathogen), or compile a file directly." (`docs/projects.md`, Errors). So your answer (a) is the one that matches the CLI.

**Which projects change, made exact while drafting the docs.** A project folder gets a main and the program list when its `pathogen.json` has `entryPoints`, or when there's a `main.pathogen` beside a `pathogen.json` with no `entryPoints`. A `pathogen.json` without either, such as `{}` written only to mark the project folder for `@font` paths, keeps today's behavior. Such a folder declares no main, so it shouldn't get a "main doesn't exist" error. A listed main that's missing does get the error (state 7), since the list names it.

**Settled in the docs' content review** (`reviews/phase-2f-docs-review.md`):
- **A module's tab** shows the program chosen in that project, the main at first. Its preview button opens or reveals the preview, and never undoes a choice.
- **An unlisted program** stays in the list while you're editing it, or while it's the one shown.
- **Renamed or moved outside VS Code,** the program shown counts as deleted, so the preview goes back to the main. VS Code's own rename events don't see those changes; the file watcher sees the delete.
- **A main that's a module:** its row reuses the playground's wording, "A module now, so it can't draw as the main".

## The plan, once answered

1. **Docs first,** each with a content review and your approval:
   - `docs/projects.md`, "In each tool", the VS Code line ("The preview shows the file you're editing, not the main");
   - `docs/modules.md`, "In each tool", "The preview" ("it shows the file you're editing. A module doesn't draw, so its preview is empty").
2. **Tests first:** a new `packages/vscode-pathogen/src/preview-programs.ts` with no `vscode` import, as `preview-modules.ts` has none. It owns the list, the main and every rule above. It's tested from the root suite (`tests/vscode-preview-programs.test.ts`): the table's rows, a broken `entryPoints`, nested and several project folders, delete, rename, and the program becoming a module.
3. **The panel** (`preview.ts`):
   - it separates "the program shown" from "the active editor" (today `this.document` is both, and the change, disk and font paths all read it);
   - it re-reads the main when a `pathogen.json` changes;
   - it follows renames and deletes (`onDidRenameFiles`, `onDidDeleteFiles`);
   - **the chip (answer 3b, in place of the Quick Pick):**
     - the host sends the program list to the page with each update;
     - the page sends the choice back, and "Open in the editor" opens that file's tab.
   - **One chip, not a copy.** The chip moves to `src/ui/`, as the zoom pill did, and both the playground and the preview load it. Its colors take the playground's tokens first and VS Code's second, as the pill's do. A copy in the webview would drift from the playground's.
4. **Checks:**
   - `verify-step6d-preview.mjs` extended, or a new 2f check through the shipped `out/` code;
   - then `npm run build` and `npm run build:vscode`, and the installed `.vsix` checked by hand per `packages/vscode-pathogen/CLAUDE.md`: a project with a main, a module edit, Choose Program, a lone file, and a broken `entryPoints`.
5. **Close out:**
   - a code review, the full suite, and a CHANGELOG entry;
   - `docs/workspace-files.md` needs nothing: it describes the playground.
