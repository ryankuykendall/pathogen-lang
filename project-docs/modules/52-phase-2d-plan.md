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
3b. **The layout without a footer** (added in step 3; built, see "Built"): Background, Grid and Precision in the inspector's Canvas section; no footer, preview card or minimap; the editor and the preview run to the bottom (note 40, v6 screen O).
4. **The file tree** (new `file-tree` component; reuses `layers-panel`'s row styles and the kebab menus of `app-breadcrumb` and `landing-view`; no windowing at 20 files), and the **Files** toggle beside Console that shows it. (*Split into 4a to 4d, and dragging moved to step 6; see "Built".*)
   - Folders first, then files; icons for program, library, folder and `pathogen.json`; the `main` badge; the lock on `pathogen.json`; red dots.
   - The **+** menu (screen N) with its "where new files go" line, the inline name field, the taken-name state.
   - Each file's menu: Set as main, Rename…, Duplicate, Delete…; a folder's menu (after the v7 mockup).
   - `pathogen.json` opens read-only, with its line on how to change the main (screen J).
   - **No open file** (decided 2026-11-11): every tab can be closed, and the editor then shows an empty state with a starting point. Mockup first. Deleting the only open file reaches it too.
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
- **Autosave** (`services/autosave.ts`) keeps the whole workspace as of the latest unsaved edit, every file in it, and a save sends each file the server doesn't hold as text, the rest by hash, with the folders and the program list. Tests first (`tests/playground-autosave-files.test.ts`, 23 with both reviews'). The concrete risks they cover:
  - the page-teardown save sent only the open file as text, so an edit in another file went by its old hash and was lost. It now compares each file's text with what the server holds (`_savedTexts`), since it can't hash in time; one body builder serves both saves;
  - a save cleared the pending edit even when you typed while it was out, and the debounced save then had nothing to send. It now clears it only if it's the snapshot that was sent;
  - the retry after a failed save put the failed text back over a newer edit, and a lost second timer could send it after the newer one was saved. Now the retry sends whatever is pending, and there's one timer;
  - a timer that had fired still counted as a save to come, so `hasUnsavedChanges()` stayed true after any debounced save (the "Leave site?" prompt and an extra teardown save);
  - a save still hashing when another workspace loaded was sent under the new workspace's id;
  - `code` or `files` now follows what the server holds, not the local shape: the server answers 409 to `code` over several files, which autosave reads as another tab, so deleting down to just main (step 4) would have stopped saving.
- **Tabs** (`components/editor-tabs.ts`, storybook "Editor Tabs" with five stories): labels without `.pathogen`, a folder hint when open files share a name (as much of the folder as tells them apart, `/` at the top), program and library icons, pathogen.json with a lock (for step 4), ×, middle-click, arrow keys, Home, End and Delete, Docs at the right end. **The last tab has no ×**: the editor always shows a file (decided here; the docs page says so). *(Changed 2026-11-11: every tab will close, with an empty state, in step 4. See "Your decision on the last tab".)* A click hands focus back to the editor; the arrow keys keep it in the tabs.
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
- Checked: the jsdom tests above and `tests/playground-editor-tabs.test.ts` (8); the existing autosave tests updated for the new `init`; `verify/verify-2d-step3.ts` against `npm run dev:stack`, 27 checks. They cover:
  - one tab and the crumb; the library's tab;
  - undo per file, both ways, and after a tab is closed with its × and reopened;
  - two `gears` told apart;
  - the teardown save sending both edited files as text, and the server holding them after the reload;
  - quick tab clicks after an edit (below);
  - a workspace switch saving both, and the next workspace with no history from the last;
  - the main's error marked in main and not in the library's tab;
  - a long file back where it was scrolled to after a switch, and the other file at its top;
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
- **A second review, of the save serialization alone** (it came after the first). It found one more way to lose an edit: two saves queued behind a slow one, with an edit before each, where the first sent the newest edit and the second then sent its older one over it, and showed Saved. Fixed:
  - **A turn sends only what's pending when its turn comes.** Every edit makes the workspace pending and only a save that lands clears it, so nothing pending means nothing unsaved. The pending copy is autosave's own, so a flush at a workspace switch still saves the workspace being left.
  - **Every request out is tracked, not just the latest.** A teardown save crossing a normal one no longer hides it from the next turn, which waits for both.
  - **The queue moves on once a request is out**, and the next turn waits for its answer. Before, a request that never answered held the queue past the 20 s cap.
  - **A 409 on a request that went while another of ours was still out** (a wait that ran out) is retried once, alone, where a real conflict from another tab still shows.
  - **Each init is its own session.** An answer from before the same workspace was left and opened again can't set the new session's revision.
  - **A workspace switch waits for a teardown save that overtook its own save**, and saves again if that one failed, before letting go.
  - **Smaller fixes:**
    - a save that finds nothing left to send also cancels its debounce, so "unsaved" clears at once;
    - a teardown save's own failure shows as an error;
    - `_doSave` returns its own result instead of the store's status.
  - Tests: six more in "one save out at a time" (23 in the file), including a real conflict behind a crossing still showing on the retry.
  - The store's defaults now carry the declared types of `saveError` and `compilationError` (`string | null`), which also clears one of the playground's older type errors (8 → 7).
- **The thumbnail's change hash** keeps each file's hash by its text, so a keystroke rehashes only the file being typed in.
- **Left for step 4, from the review:**
  - A delete or rename must also prune the tabs (`openFiles`), the editor's kept states and the tab-icon cache. Otherwise a new file at a deleted file's path would bring back the old file's undo history.
  - Every planned edit (rename, move, delete, new file, import rewrites) must call `autosave.onChange(workspaceNow())`.
  - `flush()` stops autosave after its save, so an edit typed during a workspace switch's save is dropped, as before this step. The switch shows the next workspace's loading state; recorded, not changed.
- **CHANGELOG:** phase 2's entry is written for the 2e push that ships it, covering 2b to 2e.

**Changes to the plan from step 3:**
- **The Files toggle moves to step 4**, with the tree it shows: until then it would toggle nothing.
- **A step 3b is added: the layout without a footer.** You decided it in the v2 review (note 40, "Decided") and v6's screen O draws it, but no step had it. What it covers: no footer (the viewBox display goes, since the source says it); Background, Grid and Precision in the inspector's Canvas section; no card around the preview; no minimap, so the fullscreen button takes the top-left corner; the editor and the preview run to the bottom. Step 5's chip sits beside the zoom controls at the bottom, so 3b comes before it. Docs already moved in step 3.
- **For 2e:** Make public's precheck compiles the main alone, so a main that imports a file fails it. This was true since 2c, and publishing carries the workspace in 2e.
- **For step 9:** Copy URL, until it goes, shares the open file's text. That matters only with a library open.
- **For step 4:** the import rewrites of a rename reach files whose editor state is kept. The pane needs a way to apply changes to a kept state as one undo step (`state.update`), with `workspaceFiles` updated alongside.

**Your decision on the last tab** (2026-11-11), in your words: "I don't understand the concern around allowing a user to close all tabs. We could always come up with a zero-state design for no open tabs that provides a recommendation for a opening starting point."
- There was no product reason for keeping a tab open. The reason was the code: it assumes one file is always open (the store's `openFile`, `workspaceNow()` laying the editor's text over that file, the file crumb, the error marks, Copy Code).
- **Decided:** every tab can be closed. With none open, the editor shows an empty state that suggests where to start. It takes the v7 empty preview's shape: an icon, a heading, a line of text, one button.
- **When:** step 4, with a mockup first. Deleting the only open file from the tree reaches the same state, and the tree is where the other starting points are.
- Until then, the last tab keeps no × (`.sole`), and the docs page says "The last open tab stays open." Both change with step 4.

**Step 3b, the layout without a footer** (2026-11-11). As v6's screen O draws it (approved in the v4 review).
- **No footer.** `playground-footer.ts` is deleted. Its viewBox display goes, since the source says it.
- **The inspector's Canvas section** (`components/canvas-panel.ts`, storybook "Canvas Section" with four stories) has Background (swatch and value), Grid (on/off, colour, size) and Precision. Each row's controls are the footer's.
  - The section takes its values as a property and reports each change as a `canvas-change` event. It never reads the store. That way step 9's mini-workspace can give it its own values (Background and Grid, without Precision).
  - `inspector-panel` shows it only with its `canvas` attribute. The workspace's inspector has it; the mini-workspace's and the detail page's don't.
  - `workspace-view` writes the change to the store, recompiles for Precision, and saves the preferences with the same five fields as before.
  - A value outside a select's list, from an older preference, gets an option of its own, so the select never shows a different value from the one in use.
- **No card around the preview**: no padding, no rounded corners, no shadow. The preview fills its pane, so zoomed-in art runs to the pane's edges.
- **Fit keeps a margin** (`utils/preview-fit.ts`): 6% of the drawing's longer side on every side, so at Fit the drawing doesn't touch the edges under the buttons. Only the live view sees it: the background and grid still cover just the viewBox, and export, snapshots, thumbnails and the crop dialog set their own viewBox. Fullscreen fits with the same margin.
- **No minimap.** The fullscreen button takes the top-left corner, as far in as the inspector button on the right. Each content change no longer copies every path into the minimap; that copy was the cost noted in the minimap memory.
- **The editor and the preview run to the bottom.**
- **Elsewhere:**
  - `docs/exporting.md` said "the workspace's footer **Precision** setting"; it now points to the inspector's Canvas section. That line joins step 10's docs review.
  - `scripts/verify-viewbox.ts` read the footer. It now checks the background rect and the viewBox at Fit. It was stale in older ways too, now fixed: its URL, the `${` style opener, a missing `;`, and an edit through the editor's `code` setter, which loads text without compiling.
  - `playground/CLAUDE.md`'s "Add workspace control" row names the Canvas section.
  - The blog's mini-preview keeps its minimap, and its fullscreen button stays where it was.
- **Checked:**
  - `tests/playground-canvas-panel.test.ts` (15): the section's values and events, the inspector's opt-in, no minimap or card, the button's corner, the fit margin, Copy SVG's framing.
  - `verify/verify-2d-step3b.ts` against `npm run dev:stack`, 21 checks:
    - no footer or minimap; both panes reach the bottom; no card;
    - the button's corner; the margin at Fit; edge to edge zoomed in; Copy SVG framed on the drawing;
    - Canvas above Layers; each of the four controls changing the preview, Precision by a recompile;
    - the server holding all four, and a reload showing them;
    - the Canvas section in fullscreen's inspector, and at 700 px wide;
    - the storybook, both themes.
  - `scripts/verify-viewbox.ts` passes.
  - Screenshots `verify/2d-step3b-*.png`, light and dark.
  - The full suite: 8,729 passed.
- **Review** (code-reviewer, no blockers):
  - **Fixed: Copy SVG** (⋮ menu) copied the live `<svg>` as it stood, so at Fit its viewBox now carried the margin (`-12 -12 224 224` for a 200 × 200 drawing). It copies the drawing's own viewBox now (`drawingSvgMarkup` in `utils/preview-fit.ts`, the pane's `drawingCanvas()`), zoomed or not, as Export does. Before this step a zoomed-in copy carried the zoomed view; that changes too.
  - **Fixed:** two leftover mentions, a storybook comment about "the navigator" and `style-change` as playground/CLAUDE.md's example event name (now `canvas-change`).
  - **Accepted: older links with a zoom open a little differently.** Zoom and pan are now measured against the padded canvas, so a URL saved zoomed-in before this step restores about 12% wider and offset by the margin. A link at Fit opens at Fit, with the margin. "100%" on the zoom pill is 100% of the padded fit.
  - **Accepted, as screen O draws it:** Background, Grid and Precision are seen only with the inspector open, which starts closed. Saved values still apply with it closed.
  - **Not changed:** the section compares the colour inputs' `value` attribute, not their `value` property, before setting them. The reviewer suggested the property, for an owner that might refuse a change. The property reads the picker's inner value, which may be written differently, and a mismatch would reset an open picker on every sync. Today's owner always writes the store, so the attribute stays right.
- **Seen, not changed:**
  - At 700 px the inspector's bottom sheet keeps its 240 px column (as before). Narrow screens are step 9.
  - `styles/preview.css` still has minimap rules, but nothing loads that file.

**Step 4, split into four commits** (2026-11-11). Most of it is drawn and approved (v6 screens O, N, E and J; v7 screen F), so it goes ahead while the one new screen is reviewed (note 54, mockups v8):
- **4a, the tree, read-only:** the `file-tree` component, the Files toggle (shown by default, as every mockup draws it), opening a file from the tree, `pathogen.json` read-only with its lock and its line.
- **4b, adding:** the + menu with its "where new files go" line, New program, New library, New folder, the name field and the taken-name state.
- **4c, the menus:** Set as main, Rename…, Move to…, Duplicate, Delete…, and the toast's Undo. Tests first for:
  - a delete prunes the file's tab, its kept editor state and its tab-icon entry, so a new file at a deleted file's path starts with no undo history;
  - a rename or a move carries the file's kept state, undo and all, to the new path (the docs page: each file keeps its undo);
  - every planned edit, the toast's Undo included, calls `autosave.onChange(workspaceNow())`;
  - a later change to the workspace drops the toast's pending Undo;
  - the import rewrites made in other files' kept states stay out of those files' own undo (`addToHistory` false), since Cmd-Z there would point an import back at a name that's gone (note 53, question 3). This replaces step 3's "as one undo step" note above.
- **4d, no file open:** after your review of mockups v8. Before `openFile` can be empty, every reader of it and of the editor's text gets checked: `workspaceNow()`, autosave and the thumbnail hash, Copy Code, the compile debounce, the error marks, the file crumb, Format Document. The editor shows a real empty view, so typing can't land in a hidden document that saves over a file.
- **Dragging a file onto a folder moves to step 6**, with dropping uploaded files: they share the folder that lights up under the pointer. Move to… (4c) covers moving until then.
- **Not in step 4:** red dots (step 7), the chip and its list (step 5), uploads (step 6), narrow screens (step 9).

**Step 4a, the tree, read-only** (2026-11-11). As v6's screens O and J draw it.
- **`components/file-tree.ts`** (storybook "File Tree", five stories). A view: workspace-view gives it the files (each a program or a library), the folders, the main and the file in the editor, and opens what it asks for (`open-file`). The rows come from `utils/file-tree-rows.ts`, which is pure:
  - folders first, then files, each by name, letter case aside and numbers by value (`a2` before `a10`);
  - an empty folder shows "Empty" under it, and says "empty" to a screen reader;
  - `pathogen.json` is last at the top level, with its lock;
  - the main's badge, unless the main is `main.pathogen`.
- **The keyboard:** the WAI-ARIA tree pattern, with one Tab stop.
  - Up and Down move between rows. Right unfolds a folder, then goes into it. Left folds it, or goes to the row's folder.
  - Space opens a file and the keyboard stays in the tree. Enter opens it and moves the keyboard to the editor.
  - A redraw (a folder folded, a file added) keeps the keyboard on its row.
- **Files** sits before Console in the breadcrumb (`aria-pressed`; Console has it too now). The tree is shown at first (`filesOpen`, not remembered across a reload, like the other panes). A scratch link has no workspace files, so it shows neither Files nor the tree.
- **The layout:** the tree is 248 px wide, left of the editor, with its header level with the tabs bar. Hidden, it takes no room and no Tab stop. Below 800 px it sits above the editor at up to 30% of the window's height, until step 9's drawer.
- **`pathogen.json` opens read-only**, its text written from the entry points (`projectFileText`).
  - **It's never one of the workspace's files:**
    - `workspaceNow()` leaves it out, and so does `updatePreview`;
    - leaving its tab writes nothing back;
    - `programToShow` never returns it.

    So no save, compile or import graph sees it. The browser check confirms the saves and the server.
  - **The editor:**
    - its own state, read-only, with JSON colours (`utils/cm-json-language.ts`, a small tokenizer behind CodeMirror's StreamLanguage, not a second CDN package);
    - none of Pathogen's language services, so no diagnostics on JSON, and no update listener;
    - typing is stopped at `beforeinput`; it lights up the line above the editor and shows "Read-only. Set as main changes this list" at the cursor for 2 seconds;
    - Format Document and Convert all (`replaceDocument`) leave it alone.
  - **A bug found and fixed on the way:** CodeMirror's autocomplete leaves a timer running after the editor switches files. Typing in a program and opening `pathogen.json` at once made that timer read a field the JSON state doesn't have, and it threw "Field is not present in this state". Two Pathogen files share that field, which is why step 3 never saw it. The JSON state now has an inert autocompletion (no sources, no activation on typing), so the timer finds the field and does nothing. `tmp/2d-step4/probe-field.ts` reproduced it at 0 and 50 ms, and with signature help open.
- **Checked:**
  - tests:
    - `tests/playground-file-tree.test.ts` (16): order, folding, counts, badge, events, keyboard, modifier keys, focus, escaping;
    - `tests/playground-editor-read-only.test.ts` (4): the pane with stand-in CodeMirror modules: read-only only for `pathogen.json`, its line, no replace or format, the state it's built from (the inert autocompletion among it), typing stopped;
    - `tests/playground-cm-json.test.ts` (2);
    - `tests/app-breadcrumb-files-toggle.test.ts` (3);
    - `tests/playground-open-files.test.ts`, five more for `pathogen.json`;
  - `verify/verify-2d-step4a.ts` against `npm run dev:stack`, 34 checks:
    - the tree's place, order, Empty row, the marked file, and its header against the tabs bar;
    - a click opens a tab and leaves the preview; folding; Down and Enter;
    - `pathogen.json`: its text, its line, its tab's lock, its colours in light and dark, no marks, typing, an input method's composition, `aria-readonly`, Format Document;
    - a save that sends the files but not `pathogen.json`, and the server holding them;
    - Files off and on; a reload; 700 px; a scratch link; the storybook in both themes;
  - screenshots `verify/2d-step4a-*.png`;
  - the full suite: 8,759 passed.
- **Review** (code-reviewer, no blockers). Fixed:
  - **One rule for laying the editor's text over the workspace.** Autosave's `workspaceWith` still added the open file's text unguarded. No caller can reach it with `pathogen.json` open today, but the next one could. `withOpenFileText` and `isWorkspaceFile` in `services/workspace-files.ts` are now the one place, used by `workspaceNow()`, autosave, `updatePreview`, the tab switch and the import graph. Autosave's no-library hash reads the main when `pathogen.json` is open.
  - **The tree left keys with a modifier alone.** Alt+Left and Cmd+Left are the browser's Back; the tree had taken them.
  - **The read-only editor had no unit test,** only the browser check. It has one now, with the "Field is not present" fix pinned.
  - `aria-readonly` on the text box; the tip kept inside the pane at the right edge; no import graph built while `pathogen.json` is open.
  - **Composition from an input method** can't be cancelled at `beforeinput`. The browser check shows CodeMirror's read-only state stops it. `tmp/2d-step4/probe-ime.ts` is the control: the same input does reach `main.pathogen`.
  - Left as it is: Copy Code with `pathogen.json` open copies its text, since it copies the file in the editor; the tree works out its rows once per setter, at 20 files at most.
- **For 4c:** an open `pathogen.json` must follow the entry points when Set as main or a rename changes them. Nothing changes them while it's open in 4a, so this waits for the edit that can.

**The v7 mockup round** (2026-11-09, commit `5c8f925`): note 53, `phase-2-mockups-v7/`. Five screens: no programs left, folders and moving, narrow screens, the mini-workspace, the ⋮ menu. It also draws what v6 left out (renaming a file, Move to…, dragging a file). Six questions await you; steps 4 and 9 wait for them.
- *Answered 2026-11-09: all six agreed* (note 53, "Your answers"). What that adds to the steps:
  - step 2: each change can be undone (the toast's Undo); a rename takes a name only, no slash and no extension; Move to…; the first program in an empty workspace is shown;
  - step 4: Move to… in the file and folder menus;
  - step 5: the thumbnail isn't regenerated while there's no program;
  - step 9: the empty preview; Export, Set Thumbnail and Make public wait for a program; the "No programs" label (one field in the workspace list); narrow screens; the mini-workspace's Background and Grid, with Reset.

## Risks

- **Autosave with several changing files** is where data can be lost. Step 3 starts with the tests for the 2c review's findings 1 and 3, and with a puppeteer check that edits two files, switches workspaces, and reloads. (*Done: what those tests cover is listed under "Built", step 3.*)
- **Miniatures** compile every program. Large programs could slow the list; the plan is the shared compiler, two at a time, as the admin moderation thumbnails already do, and stale ones kept until redrawn.
- **Import rewriting** changes code the user didn't type. It rewrites only import paths, through the parse tree, and each rename's edits are one undo step in each file it touches.
