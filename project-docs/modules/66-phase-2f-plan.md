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

## The plan, once answered

1. **Docs first,** each with a content review and your approval:
   - `docs/projects.md`, "In each tool", the VS Code line ("The preview shows the file you're editing, not the main");
   - `docs/modules.md`, "In each tool", "The preview" ("it shows the file you're editing. A module doesn't draw, so its preview is empty").
2. **Tests first:** a new `packages/vscode-pathogen/src/preview-programs.ts` with no `vscode` import, as `preview-modules.ts` has none. It owns the list, the main and every rule above. It's tested from the root suite (`tests/vscode-preview-programs.test.ts`): the table's rows, a broken `entryPoints`, nested and several project folders, delete, rename, and the program becoming a module.
3. **The panel** (`preview.ts`):
   - it separates "the program shown" from "the active editor" (today `this.document` is both, and the change, disk and font paths all read it);
   - it re-reads the main when a `pathogen.json` changes;
   - it follows renames and deletes (`onDidRenameFiles`, `onDidDeleteFiles`);
   - it gets the command and its title-bar button (`package.json`: `commands`, `menus`, `when: activeWebviewPanelId == 'pathogenPreview'`).
4. **Checks:**
   - `verify-step6d-preview.mjs` extended, or a new 2f check through the shipped `out/` code;
   - then `npm run build` and `npm run build:vscode`, and the installed `.vsix` checked by hand per `packages/vscode-pathogen/CLAUDE.md`: a project with a main, a module edit, Choose Program, a lone file, and a broken `entryPoints`.
5. **Close out:**
   - a code review, the full suite, and a CHANGELOG entry;
   - `docs/workspace-files.md` needs nothing: it describes the playground.
