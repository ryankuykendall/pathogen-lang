# Phase 2d: the UI, the plan

2026-11-09. 2d builds the multi-file UI that the v6 mockups drew and you approved (`46-…`, `phase-2-mockups-v6/`), on top of 2c's plumbing (`51-…`). The user-facing contract is `docs/workspace-files.md` (written, not yet published; it publishes with 2e, note 48). Like everything in phase 2, 2d is committed locally and ships with 2e.

## Before and after

| Today (after 2c) | After 2d |
|---|---|
| The editor shows one file, the main | A **file tree** (Files, beside Console) and **tabs**; each file keeps its own undo |
| A workspace with several files can only be made through the API | **New program, New library, New folder, Upload files…, Upload folder…**, drag and drop, with name checks and the 20-file limit |
| The preview always shows the main | The **program chip** beside the zoom controls, and its **list** with a miniature of each program, the check, "Open in the editor", the dot on programs that use the file you're editing, and a red dot on one that fails |
| `pathogen.json` exists only on the server | A **read-only `pathogen.json`** at the end of the tree, rewritten as you add, rename, delete and set the main |
| — | **Rename, move, duplicate, delete**; renaming or moving a file **rewrites the imports** that name it |
| — | **Set as main**, deleting the main, a main that gains `module;` (screen E) |
| An error in another file names it | Its name **opens that file at the line**; Cmd-click on an imported name opens its file |
| Autosave sends the open file's text | Autosave sends **every changed file, the folders and the entry points** |
| Copy Debug Info captures one string | It captures the workspace (2h, designed first) |

## What's decided

- **The design:** mockups v6, all six screens (O layout, G chip, E main, N new files, U uploads, J `pathogen.json`).
- **The behaviour:** `docs/workspace-files.md`, section by section.
- **From earlier notes:** renaming a file rewrites the import paths in the workspace's other files (41); the mini-workspace gets Background and Grid, with its own mockup first (42); Copy Debug Info is designed before it's built and lands with 2d (42, 2h).
- **From 2c** (51, "Left in 2c" and the review): errors are placed against the graph of the program shown, not the open file, once the chip can show another; go-to-definition opens the other file; autosave must handle every file changing.

## Open: please decide (recommendations first)

1. **The five [TO CONFIRM] items in the docs page,** as one batch:
   - each file keeps its own undo history while the workspace is open;
   - clicking a file's name in the error panel opens it at that line;
   - moving a file also rewrites its own `./` and `../` imports, so they still reach the same files;
   - folders get **Rename…** and **Delete…** in their menu (not drawn);
   - **Duplicate** names the copy `gears-2.pathogen`, as Keep both does.

   Recommended: all five, as written.
2. **A small v7 mockup round for what v6 doesn't draw,** before that code:
   - the empty preview (a workspace with no programs left: the preview, the thumbnail and the Explore card);
   - a folder's menu (Rename…, Delete…);
   - **narrow screens** (below 800 px the playground stacks its panes): where the tree, tabs and chip go;
   - the mini-workspace's Background and Grid controls.

   Recommended: yes, one round with these four, reviewed before steps 4 and 9 below.
3. **Copy Code** copies the file in the editor (recommended), or the program shown?
4. **Copy URL** (a share link holds one file's code): offer it only for a workspace that is just `main.pathogen` (recommended; docs page, note 38 Q12), or for the file in the editor?

Which program SVG, PNG and PDF export use stays with 2g (note 42). Snapshots carrying every file stay with 2e.

## Your answers (2026-11-09), in your words

1. The five [TO CONFIRM] items: "Yes" to each (per-file undo; a file's name in the error panel opens it at that line; moving a file fixes its own `./` and `../` imports; folders get Rename… and Delete…; Duplicate names the copy `gears-2.pathogen`). The marks are gone from `docs/workspace-files.md`.
2. The v7 mockup round: "Yes, that would be ideal."
3. Copy Code copies the file in the editor: "That is correct."
4. Copy URL: "My inclination is to say let's drop copy URL from the menu. We should probably come up with a more robust sharing solution, but we can save that experience for another time."
   - So **Copy URL leaves the workspace's menu**, for every workspace, in step 9. Links copied before still open (`?state=` loading stays). The docs page says so; a better way to share is on the backlog.
   - This also ends the bug note 38 found: Copy URL read `route.params.id` where the route's parameter is `slugId`, so every copied link opened the new-workspace form.

## The steps

Each step: tests first; a storybook entry for each new component (the playground's rule: the story is the component's spec); light and dark; a puppeteer check against `npm run dev:stack`; the full suite; a code review; a local commit.

1. **Rewriting import paths** (engine, `src/`). A function that, given a workspace's sources and a set of moves (`parts/gears.pathogen` → `machines/gears.pathogen`), returns the edits to every import that names a moved file, and to a moved file's own relative imports. Built on the Lezer tree (`planImports` positions), not text search. Shared with VS Code's rename later. No UI.
2. **The workspace's edits** (`playground/services/`, pure and tested): create a file or folder, rename, move, duplicate, delete; set as main; a main or program gaining or losing `module;` (screen E); `pathogen.json`'s text from the entry points; names checked with the engine's rules (`workspaceNameProblem`, `workspacePathProblem`) and the 20-file limit; Keep-both numbering.
3. **Several open files.**
   - `code-editor-pane` keeps one `EditorState` per open file (its extensions are already built once and reused; note 38), so each file keeps its undo.
   - New **`editor-tabs`** component: labels without `.pathogen`, `gears · parts` when two open files share a name, close ×, Docs at the right end, no "+".
   - The breadcrumb's **file crumb** (`demos/gears.pathogen`). (*The **Files** toggle moved to step 4; see "Built".*)
   - The store: open files and the active one; `code` stays the active file's text.
   - **Autosave** sends every changed file, the folders and the entry points, and the page-teardown save keeps doing that without hashing. The 2c review's findings 1 and 3 become real here, so their tests come first.
3b. **The layout without a footer** (added in step 3; see "Built"): Background, Grid and Precision in the inspector's Canvas section; no footer, preview card or minimap; the editor and the preview run to the bottom (note 40, v6 screen O).
4. **The file tree** (new `file-tree` component; reuses `layers-panel`'s row styles and the kebab menus of `app-breadcrumb` and `landing-view`; no windowing at 20 files), and the **Files** toggle beside Console that shows it.
   - Folders first, then files; icons for program, library, folder and `pathogen.json`; the `main` badge; the lock on `pathogen.json`; red dots.
   - The **+** menu (screen N) with its "where new files go" line, the inline name field, the taken-name state.
   - Each file's menu: Set as main, Rename…, Duplicate, Delete…; a folder's menu (after the v7 mockup).
   - `pathogen.json` opens read-only, with its line on how to change the main (screen J).
5. **The program chip and list** (new `program-chip` and `program-list`; the popover reuses `snapshot-popover`'s anchoring).
   - The chip sets the program shown; only it changes the preview.
   - Miniatures: each program compiled by the shared compiler, not the editor's, so they never cancel the editor's compile; redrawn after an edit to a file they use; a spinner until then.
   - The dot on programs that use the file you're editing; the red dot and the row's failure on one that fails.
   - Errors placed against the shown program's graph (from 2c). (*Done in step 3, which made it reachable.*)
   - The thumbnail stays the main's (note 38).
6. **Uploads** (screen U): Upload files…, Upload folder…, drag and drop onto the tree with the folder under the pointer lit, the clash prompt (Replace, Keep both, Skip, the same for all), the unsupported-files message, the 20-file limit.
7. **Errors and navigation:** a file's name in the error panel opens it at that line; Cmd-click on an imported name opens its file at the definition; red dots in the tree on the failing file and the program that ran into it.
8. **Copy Debug Info (2h):** answer note 42's five questions with you first, then build.
9. **The rest:** Copy Code copies the file in the editor; Copy URL leaves the menu; the empty preview (after the v7 mockup); the mini-workspace's Background and Grid (after its mockup); narrow screens (after the v7 mockup).
10. **The docs page:** remove the [TO CONFIRM] marks as they're settled, and run its content review again before it publishes with 2e.

## Built

**Step 1, rewriting import paths** (2026-11-09). `src/host/move-imports.ts`, exported from the bundle:
- `importEditsForMoves(files, moves)`: for files and moves by project path (a move names a file, or a folder and everything in it), the edits to the text between an import's quotes that keep it reaching the same file. Only imports that would otherwise stop reaching it change; one that still does keeps its spelling. Absolute paths stay absolute, quotes keep their style. Imports the loader would refuse (a path mistake, a path above the top, a string not closed yet) and anything that isn't an import (comments, strings, non-`.pathogen` files) are left alone. Every path maps against the names before any move, so a swap works; when a folder and a file in it both move, the file's own move wins.
- `applyImportEdits(source, edits)`: makes them from the end back, and refuses edits made for another version of the text (each edit carries the path it replaces), so a stale edit can't land in the wrong place once open editors hold newer text (step 3).
- `pathAfterMoves(path, moves)`: for step 2's file keys and entry points.
- A mis-cased import (already an error) is left as written: when its target moves, its case-mismatch error becomes not-found. Pinned by a test.
- Checked: `tests/host/move-imports.test.ts` (31). The round trip compiles each program through the memory host and the loader before and after a move: no load errors, the same files reached, the same drawing.
- Backlog: VS Code's rename hook (the second caller), and `@font` file paths once fonts can be added.
- **Review** (no critical findings, no bug in the mapping). Fixed: a move path with a trailing slash, an empty, `.` or `..` part, or the top itself mapped to the wrong place silently, and is now refused; so are the same path moved twice and two files that would land on one path; `applyImportEdits` also checks the quotes around each edit and refuses overlapping edits. Added tests: a file and its import moved apart in one go, a `../../` result, an import that would climb above the top from the new place, edits given out of order. Left for step 2 as planned: `pathogen.json`'s entry for a moved program (`pathAfterMoves`), and the name rules for a new path.

**Step 2, the workspace's edits** (2026-11-09). `playground/services/workspace-edits.ts`, pure: each plan reads a workspace passed in (in step 3, the open editors' live text) and returns a Change and its Undo, or why it can't be done.
- Plans: `planNewFile` (program or library; `.pathogen` added; a slash makes folders), `planNewFolder`, `planRename` (the name only: a slash is refused with a pointer to Move to…, and the `.pathogen` isn't part of it), `planMove` (Move to… and dragging), `planDuplicate` (`keepBothName`: the number goes after the whole name, so a copy of `labels-2` is `labels-2-2` and a year is never read as a count), `planDelete` and `deleteSummary` (for the dialog), `planSetMain`, `entryPointsAfterEdit` (a program gaining or losing `module;`), `projectFileText`.
- Import edits are kept as "the nth import written X becomes Y" and found again from the parse tree when applied. So Undo still lands after you've typed elsewhere in the file, and refuses (`StaleChangeError`, nothing changed) when the import itself was retyped. `importChangeOffsets` gives an editor each edit's place in the text it holds.
- Every plan's result goes through the engine's `checkWorkspaceManifest`, so folders and the program list are the server's normal form and the autosave hash settles; names, letter case, depth and the 20 files are the server's own rules.
- The first program a workspace gets is shown, from one place (`finish`).
- `projectFileText(entryPoints)` is new in the engine (`src/workspace/files.ts`, `workspaceProjectFileText` in the bundle): the one writer of pathogen.json; what it writes reads back the same through the CLI's `parseProjectFile`.
- Checked: `tests/playground-workspace-edits.test.ts` (52). Every plan that succeeds is also checked for the server's normal form and for an exact Undo. `tests/workspace-project-file-text.test.ts` (5).
- **Review** (no critical findings; nothing writes into the wrong place under the documented flows). Fixed:
  - Undo found an import by its path and its count among imports of that path. So an import of the same file typed above it made Undo revert yours and leave the original. Each import is now also matched on what it imports (`import { gear } from`), read from where the statement starts: `planImports` gives `statementFrom` now (engine). Tested with exactly that case.
  - Deleting an empty folder said "and the 0 files in it".
  - New program and New library checked the name's length without `.pathogen`; Rename already counted it. Both count it now.
  - Dead code in `planDelete`.
  - Added tests:
    - several spellings of one import, a single-quoted one, and one still being typed;
    - whole files after a rename;
    - all-or-nothing, including a change that fails partway and a refused Undo;
    - an empty folder deleted, a deep file deleted, folders moved in and out, a file moved into an empty folder;
    - taken folder names, `a/b` folders, names over 100 characters, and more than 8 folders deep;
    - Set as main on the main, a copy shown in a workspace with no programs, a 21st copy refused, and a plain delete message.
  - Kept, with a comment: the file-limit message before the server's, which would count the 21st file ("this one has 21").

**Step 3, several open files** (2026-11-10).
- **Autosave** (`services/autosave.ts`) keeps the whole workspace as of the latest unsaved edit, every file in it, and a save sends each file the server doesn't hold as text, the rest by hash, with the folders and the program list. Tests first (`tests/playground-autosave-files.test.ts`, 17 with the review's). The concrete risks they cover:
  - the page-teardown save sent only the open file as text, so an edit in another file went by its old hash and was lost. It now compares each file's text with what the server holds (`_savedTexts`), since it can't hash in time; one body builder serves both saves;
  - a save cleared the pending edit even when you typed while it was out, and the debounced save then had nothing to send. It now clears it only if it's the snapshot that was sent;
  - the retry after a failed save put the failed text back over a newer edit, and a lost second timer could send it after the newer one was saved. Now the retry sends whatever is pending, and there's one timer;
  - a timer that had fired still counted as a save to come, so `hasUnsavedChanges()` stayed true after any debounced save (the "Leave site?" prompt and an extra teardown save);
  - a save still hashing when another workspace loaded was sent under the new workspace's id;
  - `code` or `files` now follows what the server holds, not the local shape: the server answers 409 to `code` over several files, which autosave reads as another tab, so deleting down to just main (step 4) would have stopped saving.
- **Tabs** (`components/editor-tabs.ts`, storybook "Editor Tabs" with five stories): labels without `.pathogen`, a folder hint when open files share a name (as much of the folder as tells them apart, `/` at the top), program and library icons, pathogen.json with a lock (for step 4), ×, middle-click, arrow keys, Home, End and Delete, Docs at the right end. **The last tab has no ×**: the editor always shows a file (decided here; the docs page says so). A click hands focus back to the editor; the arrow keys keep it in the tabs.
- **One editor state per file** (`code-editor-pane.ts`): a file's state is kept, undo history and scroll position included, from its first opening until the workspace changes, closed tab or not ("while the workspace is open"). A workspace load forgets every kept state, so another workspace's `main.pathogen` history can't come back. Switching never fires `code-change`, so it neither saves nor recompiles.
- **The store**: `openFiles` (the tabs, in order). A tab switch writes the outgoing file's text into `workspaceFiles` (`services/open-files.ts`, tested with a fake editor: `tests/playground-open-files.test.ts`, 10). Files open through one `open-file` event, which the tree, the program list and the error panel will send (steps 4, 5, 7); nothing in the UI sends it yet.
- **The file crumb**: `parts/` quiet, `gears.pathogen` as the current crumb.
- **Docs** moved from the footer to the tabs bar.
- **Errors with another file open**, pulled forward from step 5, since tabs make it reachable now: the error is the shown program's, read with that program's graph (`programModules`). The editor marks only its own file's lines: the program's when it's the one shown, or the open file's when the error happened in its code. The panel then names the program (`main.pathogen line 3:6 — …`). A library's own warnings mark it in its tab. Showing another file re-places the last compile's marks without recompiling.
- **Other readers of `code`**, now that the open file needn't be the program shown:
  - the snapshot's "edited since it drew" check compares against the program shown;
  - the export legend's code is `renderedCode`, the code that drew the picture;
  - the thumbnail's change hash covers every file (a just-main workspace hashes as before, so stored thumbnail hashes still match);
  - Make public prechecks the main, whichever tab is open;
  - Copy Code copies the file in the editor, as decided.
- Checked: the jsdom tests above and `tests/playground-editor-tabs.test.ts` (8); the existing autosave tests updated for the new `init`; `verify/verify-2d-step3.ts` against `npm run dev:stack`, 25 checks. They cover:
  - one tab and the crumb; the library's tab;
  - undo per file, both ways;
  - two `gears` told apart;
  - the teardown save sending both edited files as text, and the server holding them after the reload;
  - quick tab clicks after an edit (below);
  - a workspace switch saving both, and the next workspace with no history from the last;
  - the main's error marked in main and not in the library's tab;
  - Docs.

  Screenshots `verify/2d-step3-*.png`, light and dark.
- **Review** (no critical findings). Fixed:
  - **Two of our own saves out together, from the same revision, 409 each other**, and autosave reads a 409 as another tab: the banner, and no more saving. Each tab click blurs the editor and saves, so quick clicks after an edit did it. In the browser, the build without the fix sent four saves all from revision 1, showed the banner, and then lost the next workspace switch's edits.
    - Now one request is out at a time: normal saves wait their turn, and send the newest edit when it comes.
    - A teardown save takes over from a save still hashing, and sends nothing when the request already out carries the latest edit.
    - When a teardown save with a newer edit crosses an older request, the 409 that one of them gets isn't a conflict. Whichever lands, the newer text is what's saved.
    - A wait for a request that never answers ends after 20 s, so it can't stop every save after it.
    - Tests: six in "one save out at a time", and the browser check above (`verify-2d-step3.ts` 5b).
  - A teardown save over the browsers' 64 KB keepalive cap was refused outright and silently. It now goes as a plain request, and a failed teardown save is logged and retried if the page stays.
  - Copy URL and Copy Debug Info carried the open file's text (a library, with a library open). They carry the program shown now (`shownProgramText`), tested.
  - Opening a file the workspace no longer has changes nothing (`show` checks).
- **Left for step 4, from the review:**
  - A delete or rename must also prune the tabs (`openFiles`), the editor's kept states and the tab-icon cache. Otherwise a new file at a deleted file's path would bring back the old file's undo history.
  - Every planned edit (rename, move, delete, new file, import rewrites) must call `autosave.onChange(workspaceNow())`.
  - `flush()` stops autosave after its save, so an edit typed during a workspace switch's save is dropped, as before this step. The switch shows the next workspace's loading state; recorded, not changed.

**Changes to the plan from step 3:**
- **The Files toggle moves to step 4**, with the tree it shows: until then it would toggle nothing.
- **A step 3b is added: the layout without a footer.** You decided it in the v2 review (note 40, "Decided") and v6's screen O draws it, but no step had it. What it covers: no footer (the viewBox display goes, since the source says it); Background, Grid and Precision in the inspector's Canvas section; no card around the preview; no minimap, so the fullscreen button takes the top-left corner; the editor and the preview run to the bottom. Step 5's chip sits beside the zoom controls at the bottom, so 3b comes before it. Docs already moved in step 3.
- **For 2e:** Make public's precheck compiles the main alone, so a main that imports a file fails it. This was true since 2c, and publishing carries the workspace in 2e.
- **For step 9:** Copy URL, until it goes, shares the open file's text. That matters only with a library open.
- **For step 4:** the import rewrites of a rename reach files whose editor state is kept. The pane needs a way to apply changes to a kept state as one undo step (`state.update`), with `workspaceFiles` updated alongside.

**The v7 mockup round** (2026-11-09, commit `5c8f925`): note 53, `phase-2-mockups-v7/`. Five screens: no programs left, folders and moving, narrow screens, the mini-workspace, the ⋮ menu. It also draws what v6 left out (renaming a file, Move to…, dragging a file). Six questions await you; steps 4 and 9 wait for them.
- *Answered 2026-11-09: all six agreed* (note 53, "Your answers"). What that adds to the steps:
  - step 2: each change can be undone (the toast's Undo); a rename takes a name only, no slash and no extension; Move to…; the first program in an empty workspace is shown;
  - step 4: Move to… in the file and folder menus;
  - step 5: the thumbnail isn't regenerated while there's no program;
  - step 9: the empty preview; Export, Set Thumbnail and Make public wait for a program; the "No programs" label (one field in the workspace list); narrow screens; the mini-workspace's Background and Grid, with Reset.

## Risks

- **Autosave with several changing files** is where data can be lost. Step 3 starts with the tests for the 2c review's findings 1 and 3, and with a puppeteer check that edits two files, switches workspaces, and reloads.
- **Miniatures** compile every program. Large programs could slow the list; the plan is the shared compiler, two at a time, as the admin moderation thumbnails already do, and stale ones kept until redrawn.
- **Import rewriting** changes code the user didn't type. It rewrites only import paths, through the parse tree, and each rename's edits are one undo step in each file it touches.
