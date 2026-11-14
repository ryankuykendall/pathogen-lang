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

**Step 4b, adding files and folders** (2026-11-12). As v6's screen N draws it.
- **The +** in the tree's header opens a menu: New program ("A file that draws"), New library ("Starts with `module;`"), New folder. **Upload files… and Upload folder… join it in step 6**, with the uploads themselves. The docs page already lists them; nothing ships before 2e.
- **Its first line says where things go:** the folder you clicked last; else the folder of the file in the editor (opening another file resets it); else the top of the workspace.
- **Keyboard:** Down or Enter on the + opens the menu with the first item focused. Up, Down, Home and End move. Escape closes it and returns to the +. Tab closes it. A click outside closes it.
- **The name field** goes first in its folder, unfolding the folder and every folder it's in. `.pathogen` follows the typed name, since the input is sized to its text.
  - Its line: "Starts with `module;` · Enter to create, Esc to cancel" for a library, "The only program, so it becomes the main · …" for a workspace's first program, and the keys alone otherwise.
  - **The name is checked as you type, by the workspace's own rules:** workspace-view's `checkName` runs step 2's `planNewFile` and `planNewFolder` (a name taken in any letter case, bad characters, the 20-file limit). A refused name shows the plan's message in the field's line, and Enter does nothing; so does an empty one.
  - Enter creates. Escape cancels and returns to the +. Leaving the field creates a good name and drops anything else, as VS Code does.
- **Making it:** the tree reports `create-entry`. workspace-view plans it again on the workspace as it stands and makes it through **`services/workspace-apply.ts`**: every file, the folders and the program list in one store update, and the program to show when the plan says so (a workspace's first program). Then:
  - the new file opens in a tab, with the keyboard in the editor; the preview doesn't change;
  - a new folder takes the keyboard in the tree, so the + adds to it next;
  - the workspace saves;
  - the preview redraws when a program is shown.

  4c's renames and moves go through the same `_applyWorkspaceChange`.
- **A bug found on the way:** the Enter that makes a folder also folded it. workspace-view adds the folder while the keypress is still on its way up the tree, the new folder takes the keyboard at once, and the tree's own Enter (fold or unfold) then ran on it. The field's keys now stop at the field. A jsdom test adds the folder synchronously, as workspace-view does, to reproduce it.
- **Checked:**
  - tests:
    - `tests/playground-file-tree.test.ts` (30): the field's place in the rows, the menu and its target, keys, a taken name, Enter, Esc, blur, folders, the first program, folding, the Enter bug;
    - `tests/playground-workspace-apply.test.ts` (6): the typed text kept, a library, a program last in the list, a first program shown, a folder, a stale plan refused with nothing changed;
  - `verify/verify-2d-step4b.ts` against `npm run dev:stack`, 26 checks:
    - the menu, a taken name, Enter, the new tab and its first lines, the preview unchanged;
    - a program last in the list, a folder kept empty with the keyboard on it, the + then adding to it, a slash making folders;
    - Esc; the keyboard alone;
    - the server holding the files and the program list in order; a reload;
    - a first program shown and badged as the main; the 20-file limit; Gears taken as gears;
    - the storybook in both themes;
    - after the review, a redraw while a good name sits in the field (27 checks in all);
  - screenshots `verify/2d-step4b-*.png`;
  - the full suite: 8,785 passed.
- **Review** (code-reviewer, no blockers). Fixed, each with a test:
  - **A redraw while the field held a good name made the file.** Chrome blurs a focused element as it's removed, and the blur read as leaving the field. Any redraw did it, such as the icon refresh while typing elsewhere or a file arriving. The browser check confirmed Chrome's blur. The tree now ignores that blur while it redraws. jsdom doesn't blur on removal, so the browser check is the test.
  - **A folder that couldn't be made kept its claim on the keyboard.** A folder with that path made later, by a rename or move in 4c, would have taken it. The claim now goes once the create-entry is handled and the folder isn't there.
  - **A folder deleted while the menu was open** left the field unseen and naming stuck. The field now goes where the + adds now, and naming never stays on without a field.
  - **The menu's keys bubbled:** its Escape could reach a dialog's or fullscreen's. They stop at the menu, as the field's do.
  - Leaving the field to make a file no longer pulls the keyboard into the editor (`focusEditor` in the event). Tab from the menu goes on from the +. The menu closes on a resize and when the tree leaves the page. The field's line is a polite live region and changes only when what it says does, so a refusal is announced.
  - Left as it is: the field and its line sit inside `role="tree"` without being tree items. Screen readers cope, and the field is labelled.

**Step 4c, split in two.** 4c-1 is the row menus with Set as main, Duplicate and Delete…. 4c-2 is Rename…, Move to… and the toast's Undo, with import rewrites into the files open in the editor. Each is its own commit.

**Step 4c-1, each file's and folder's own menu** (2026-11-12). As v6's screen E and v7's screen F draw it.
- **The ⋮** on each file and folder row shows on hover, on the file in the editor, on the row with the keyboard, while its menu is open, and always on touch. A right-click, the menu key or Shift+F10 on a row opens the same menu. `pathogen.json` has its lock instead.
  - A program: Set as main (not on the main itself), Duplicate, Delete….
  - A library: Duplicate, Delete….
  - A folder: New program, New library and New folder for that folder, then Delete….
  - Rename… and Move to… come with 4c-2; Upload files… and Upload folder… with step 6.
- **The menu machinery is shared with the +.** It knows the button that opened it (a second click on that button closes it), where the keyboard goes back to (the row, or the +), and which folder its New items add to. It flips above the row when there's no room below.
- **Where the + adds** is now "the folder of the row you're on", as screen N says: a file row gives its folder. Before, only a folder row counted. The browser check found it: after a delete, the keyboard sat on a file in `parts/` while the + added at the top.
- **Set as main** moves the badge, and `pathogen.json` follows if it's open. The preview doesn't change: `shownProgram: null` meant "the main", so it's pinned to the program shown first. The thumbnail is captured from the live preview, so it stays on the old main until reloaded: that's step 5's "the thumbnail stays the main's".
- **Duplicate** makes the copy beside the file and puts the keyboard on it in the tree. It doesn't open, as step 2's plan has it.
- **Delete… asks first**, in `components/shared/confirm-dialog.ts`: a native `<dialog>` shown modal, with Cancel focused and Escape saying no. The wording (`utils/delete-question.ts`) names the files that go and the files that import them, which will show an error at those imports, sorted as the tree sorts. After a delete, the keyboard goes to the row after it in the tree.
- **`services/workspace-apply.ts` now knows the editor.** In one store update:
  - a deleted file's tab closes, and the file in the editor becomes the tab to its right, else to its left, else the main, else the first file, else `pathogen.json`. That last is temporary until 4d's "No file open". The deleted text is never written back;
  - its kept editor state, undo history and all, is forgotten (`forgetFiles`), so a new file with its name starts afresh;
  - a deleted program that was shown sends the preview back to the main;
  - `pathogen.json` in the editor follows the program list (`refreshShown`).

  workspace-view then clears the deleted files' readings, places the marks for the file now shown, saves, recompiles when a file went or a program is shown, and shows the plan's message ("Deleted parts/kit.pathogen.").
- **Checked:**
  - tests:
    - `tests/playground-workspace-apply.test.ts` (14), "a change and the editor" among them: the tab to the right, a new file's empty history, a folder's tabs, the main then `pathogen.json` when no tab is left, Set as main's pin, the shown program deleted, `pathogen.json` following;
    - `tests/playground-file-tree.test.ts` (46): the row menus, the ⋮, a right-click, the focus going back, a folder's New, `rowAfterRemoval`, the file-row target;
    - `tests/playground-confirm-dialog.test.ts` (4) and `tests/playground-delete-question.test.ts` (4);
    - `tests/playground-editor-read-only.test.ts` (+2: `refreshShown`, `forgetFiles`);
  - `verify/verify-2d-step4c1.ts` against `npm run dev:stack`, 19 checks:
    - the ⋮ on hover; a right-click on a folder; a folder's New library;
    - Set as main with `pathogen.json` open and the preview unchanged; Duplicate;
    - Delete…'s question, then Escape; the delete and the main's error at its import; the message;
    - a new file at the deleted path with nothing to undo; a folder's delete;
    - the server holding the result; dark mode; the storybook;
    - after the review: Shift+F10, and a question answered after the workspace changed (21 checks in all);
  - screenshots `verify/2d-step4c1-*.png`;
  - the full suite: 8,822 passed.
- **Review** (code-reviewer, no blockers). It confirmed the delete's ordering: one store update, and the deleted file's kept state forgotten after the switch. A test now proves it: a subscriber never sees the deleted file. Fixed, each with a test:
  - **A question answered after the workspace changed.** The modal dialog blocks clicks but not Back, a workspace switch, or a file arriving. Delete then planned again on whatever was there. Now the answer counts only if the workspace and the question's summary (the files that go and their importers) are unchanged; otherwise nothing is deleted, and a message says why. A dialog still open when the workspace view goes is withdrawn (`cancel()`).
  - **Focus after a delete** falls back to the tree's Tab stop when the row it meant to land on has gone (`focusRow` returns whether it could; `focusTabStop`).
  - **The row menu from the keyboard on a Mac.** A Mac sends no contextmenu for Shift+F10 or the menu key, so the tree handles both itself; a second request for the same menu leaves it open. The ⋮ is `aria-hidden`, so a row's spoken name is just its name, and the row says it has a menu (`aria-haspopup`).
  - **The preview pin** applies only when there was a main to keep, and not when the program shown becomes the main.
  - A deleted open file the tab list had lost still gives way to a tab (tested).
  - The menu closes on a scroll of the tree or the page, and scrolls inside itself if it's taller than the window. A redraw keeps an open row menu with its row, or, if the row went, closes it and leaves the keyboard in the tree.
  - The dialog test now stubs `showModal`, to check the modal path is the one taken.

**Step 4c-2, Rename…, Move to… and the toast's Undo** (2026-11-12). As v7's screen F draws them (states 2, 3, 5 and 6).
- **The menus.** A file's: (Set as main), Rename…, Move to…, Duplicate, Delete…. A folder's: the + items, then Rename…, Move to…, Delete…. Each Rename… and Move to… has the mockup's line under it.
- **Rename…** turns the row into a field, in place, holding its name selected (a file's without `.pathogen`, which follows it). It reuses 4b's name field: Chrome's redraw blur guard, the keys kept to the field, the field as wide as its text. A folder's files stay listed under its field. The line under it is the plan's own count, as you type: "Updates the imports in 3 files", or for a folder "Moves its 2 files, and updates the imports in 3 files". A taken name is refused in place with the plan's message. Enter renames; the same name just closes the field; leaving the field renames a good name (as New program's does); Escape cancels, with the keyboard back on the row.
- **Move to…** opens from the row's menu, in its place: "The top of the workspace", then every folder. The folder it's in is listed and can't be chosen ("It's here now"). A folder isn't listed for itself or the folders in it. A folder that already holds its name says so and can't be chosen. The last line says what the focused folder would do, as the drawing has it: "Moving it to demos/ updates the imports in main.pathogen and try-sizes.pathogen, and kit.pathogen's own."
  - **The item under the pointer takes the keyboard**, in every menu of the tree, as in a desktop menu. Before, the line followed the pointer while Enter followed the keyboard, and the menu opens where you clicked, so they could name different folders. The browser check found it.
  - **Not built: the drawing's "New folder…" in Move to….** It needs a combined plan (a new folder and the move, as one change with one Undo) and a field saying where the folder goes. New folder, then Move to…, does it in two steps. Left for later, and named here and in the step's report.
- **A renamed or moved row keeps its folding, the folding of the folders in it, and the Tab stop.** Enter or Move to… puts the keyboard on it. If workspace-view refuses the change, everything stays where it was.
- **`services/workspace-apply.ts` follows moves.** A move used to read as a delete: the tab closed, the editor state and undo history were forgotten, and the preview jumped to the main. Now the change is walked step by step: its moves, and each import rewrite with its offsets in the text it was made for. An Undo's imports name the paths its own moves have just put back, so paths are read as they come. Then:
  - the editor's kept states and the file shown are renamed first (`renameFiles`), so nothing shows a file by a path the editor doesn't know;
  - the import rewrites reach the editor by each file's path after the change (`editFile`), as small edits **outside each file's undo history**. Cmd-Z in a file never points an import back at a name that's gone; undoing everything there leaves the import at the new name. A file whose text differs from what the edits were planned on takes the new text whole, still outside its history. The live view's edit doesn't send `code-change`: the store update says it;
  - in the file shown, the rewritten lines are marked (a bar beside each, `utils/cm-changed-lines.ts`) until its next edit;
  - the tabs keep their order under their new paths; the program shown and the file in the editor follow; then one store update.
- **The toast's Undo** puts the names, the imports and the tabs back together, as one change through the same apply. It stays 9 seconds. Any later change to the files and folders withdraws it (a new `signal` on `app-toast`), and so do another workspace and the view going. Typing doesn't. An import retyped since can't be put back: then nothing changes, and a message says why. Undoing offers no Undo of its own.
- workspace-view recompiles after a move (an import's path changed) and drops the readings kept under old paths.
- **Checked:**
  - tests:
    - `tests/playground-workspace-apply.test.ts` (23): the renamed open file keeps its tab, its place and its state; importers are rewritten as small edits, by their paths after; the open importer's `code`; the shown program and the main renamed; a move's Undo;
    - `tests/playground-file-tree.test.ts` (61): the menus; Rename…'s field, its line, a taken name, the same name, a folder's field; Move to…'s folders, the one it's in, a folder into itself, a refused folder, the line following the keyboard; folding and the keyboard following a rename; a refused rename; a row going while its field is open; a field left with a click; the rows with the field in place;
    - `tests/playground-editor-read-only.test.ts` (+4: `renameFiles`, `editFile` on a kept state, `editedLines`, `spanChange`);
    - `tests/playground-workspace-edits.test.ts` (+3: `renameHint`, `moveHint` wording; an Undo refused after an import alike was typed in);
    - `tests/playground-app-toast.test.ts` (3, new): the `signal`;
  - `verify/verify-2d-step4c2.ts` against `npm run dev:stack`, 25 checks (29 after the review). The last one added: the editor's import graph (completion, hover, go-to) is rebuilt from a moved file's new folder, kept or open. It moves `kit` to the top and then into `parts/`, where `./` means something else, and shows no load errors. A control (an import of nothing) shows the check sees one:
    - the menus; Rename…'s field, selected, and its line; the renamed file's row, tab and keyboard; main's import rewritten and marked; the toast with Undo; the preview unchanged;
    - undoing everything in the open importer, a kept importer, and the renamed file itself: the typed text goes, the import stays at the new name, and the renamed file kept its history;
    - a folder's rename: its line, its tabs, two marked lines; the toast's Undo putting it all back;
    - Move to… from the keyboard: the folders, the one it's in, the line following the keyboard and the pointer; Enter moves it;
    - a later change withdrawing the Undo; renaming the main; the server holding the new paths and rewritten imports; Escape; dark mode; the storybook (two new stories: "Renaming a folder", "Move to…");
  - `verify-2d-step4c1.ts` (21) and `verify-2d-step4b.ts` (27) still pass, with their expected menus and story counts updated;
  - screenshots `verify/2d-step4c2-*.png`.
- **Review** (code-reviewer, approve with fixes; no blockers). It confirmed the walk and the follow (an Undo's imports naming pre-move paths; a folder's rename moving the shown program, the tabs and the kept states together), and that no store subscriber sees a mixed state. Fixed:
  - **A click lost when leaving the name field.** Leaving Rename…'s field (or New program's, since 4b) with a click on another row made the change at once, between the press and the release; the rows were redrawn under the pointer, and the click opened nothing. Now a blur while a pointer is down waits for the release and the click it makes. A control with the wait switched off showed the click lost (the file clicked didn't open); with it, the file opens and the rename lands. Unit test and browser check.
  - **A whole-document replace outside the undo history** (an editor holding text other than the plan's) would collapse that file's undo history. It now changes only the span where the texts differ (`spanChange`).
  - **An Undo after an import alike was typed in.** Imports are addressed by their place among the alike ones (`nth`), so a second `import { gear } from "./parts/cogs.pathogen";` typed above the first would have made Undo rewrite the wrong one. Each planned import change now carries the count of alike imports (`of`), and a different count refuses the change ("…no longer imports … where it did"). Typing anything else keeps Undo working, as step 2 decided.
  - **Marks in kept files**: a rewritten import in a file not shown is marked when you open it (browser check).
  - **A menu opening under a pointer at rest** no longer moves the keyboard off its first item: the pointer takes the keyboard on `mousemove`, not `mouseover` (browser check).
  - A workspace loaded (a switch, or a reload) withdraws the Undo too. The folder test for the hints uses the plans' own `isFolder`. The tree's store subscription is commented as synchronous, which Rename… and Move to… rely on.
- **Docs wording to propose** (`docs/workspace-files.md`, "Renaming, moving and deleting"): its last Undo sentence reads as if Cmd-Z in a file could still point an import back at a name that's gone. What was built keeps the rewritten imports out of every file's own undo history. Proposed: "The import paths a rename or a move changes aren't part of any file's own undo history, so undoing in a file never points an import back at a name that's gone." Not changed here: the page waits for your approval.
  - *Answered 2026-11-12: "Yes."* The page has the sentence now.

**Step 4d, no file open** (2026-11-12). As mockup v11 draws it (note 57, approved: "v11 looks great. Let's proceed"). Mockups v8 to v11 got there: notes 54 to 57.
- **Docs first.** `docs/workspace-files.md`: every tab can close; with none open, the editor offers the main, or New program with no programs; Copy Code and Format Document are off with no file open; the last program deleted leaves the preview empty, with the status "No program". The content-reviewer's fixes are in (`reviews/phase-2d-step4d-docs-review.md`): "the main" is linked, the tree sentence is folded in, **New program** is bold, and "until you add a program" is added.
- **No file open is `openFile: null`**, read through `openFileNow()`. `isWorkspaceFile(null)` is false, so nothing that saves, compiles or reads imports ever lays the editor's text over a file. `code` is ''.
- **`holdsWorkspace()`** (a `workspaceId`) now says "this is a saved workspace" for the tree, the Files toggle, and whether the last tab may close. It used to be "workspaceFiles isn't empty". A workspace with every file deleted is still one: its tree and its + stay (they used to vanish). A scratch link keeps its last tab, whose text lives only in `code`.
- **Closing the last tab** (`services/open-files.ts` `showNone`) does it in one store update: the file's typed text is written back, no file is open, there are no tabs, and `code` is ''. So the blur flush and autosave never see a workspace without the last edits. The editor keeps the file's state, undo history and all.
- **The editor pane** parks the shown state and gives the view an inert state: read-only, not editable, no update listener, no language services, and an inert autocompletion (4a's pending-timer trap). The container hides behind `<editor-zero-state>` (`components/editor-zero-state.ts`, new, with a storybook entry and five stories). Copy, replace, format and the marks do nothing with no file open; `focusEditor` goes to the zero-state's first button.
- **The zero-state** says what v11 says. With a main: "The workspace's main is …. Open it, or click any file in the tree," and **Open …** (always the main: answer 1), plus **Show files** with the tree hidden. With no program: "No program yet" (or "No files yet"), why nothing draws, and **New program**. New program (and Show files) shows the tree first; New program then puts its name field at the top level (`fileTree.startNewProgram()`). The zero-state follows the store while it shows: a rename, Set as main, a delete, Files.
- **Deleting the only open file** leads to the zero-state. The interim fallback to the main, then `pathogen.json`, is gone. A deleted program that was shown sends the preview back to the main, as before.
- **The tabs:** every tab has a ×, the last one too, except a scratch link's (`lastTabStays`). Delete on the last tab puts the keyboard on the zero-state's button. **The breadcrumb:** no file crumb; Copy Code is off ("No file open: open one to copy its code"); Format Document is off ("No file open").
- **Not in 4d (step 9):** with no program, the preview still shows an empty canvas with its zoom controls, and the status reads "Ready". v11 draws it blank, with the status "No program". The browser check measured it: the compile completes and draws no path. **This blocks the push:** the page already says the preview is empty with that status, so step 9 comes before it.
  - *Answered 2026-11-12: the status reads "No programs"* ("'No programs' should be fine"), as the Workspaces card does. The page says so; step 9 builds it.
- **Checked:**
  - tests: `tests/playground-editor-zero-state.test.ts` (9, new); `tests/playground-open-files.test.ts` (the last tab closes, written back in one update; a scratch link's stays); `tests/playground-workspace-apply.test.ts` (the zero-state after a delete; a rename with no file open reaches the kept files); `tests/playground-editor-read-only.test.ts` (`showNone`, the inert state, `resetFiles(null)`); `tests/playground-editor-tabs.test.ts`; `tests/app-breadcrumb-files-toggle.test.ts` (Files with every file deleted; no crumb; Copy Code off); `tests/playground-workspace-files.test.ts` (an empty workspace opens no file); `tests/playground-file-tree.test.ts` (`focusTabStop` says whether it took the keyboard);
  - `verify/verify-2d-step4d.ts` against `npm run dev:stack`, 20 checks (24 after the review):
    - every tab closes, and the zero-state opens the main; no crumb; Copy Code and Format Document off; the preview unchanged;
    - the typed text is saved, and keys pressed with no file open change nothing;
    - Open main brings back its undo history;
    - the only open file deleted, the preview back on the main;
    - Show files; "No program yet"; New program with Files off, its field with the keyboard, the new program drawn;
    - every file deleted ("No files yet", the tree stays, the server holds an empty workspace);
    - the empty workspace reloaded: "No files yet", no tab, no file made, nothing saved; Show files there;
    - a workspace switch from the zero-state, with the next workspace's load held back 2 seconds: the editor is back while it loads, then its main opens; a scratch link's last tab; dark mode; the storybook;
  - `verify-2d-step4c2.ts` (29), `verify-2d-step4c1.ts` (21), `verify-2d-step4b.ts` (27), `verify-2d-step4a.ts` (34) and `verify-2d-step3.ts` (27) still pass. Two expectations in the older checks were out of date and are updated: step 3's last tab now has its × (this step), and 4a's tree has more than its own five stories (since 4b), so it checks and shoots those five first;
  - screenshots `verify/2d-step4d-*.png`;
  - the full suite: 8,868 passed.
- **Review** (code-reviewer: request small changes; no critical issues). It confirmed the data-safety paths: the one-update write-back, the blur's save sending the last edit's whole workspace, the inert state, `holdsWorkspace()` set in the same update as the files, and every former `store.get('openFile')` reader. Fixed:
  - **A made-up main.pathogen after a reload.** The server accepts a save with no files (`checkManifest` has no lower limit), so a workspace with every file deleted is saved empty. Reloaded, it opened an empty `main.pathogen` tab, because `fileToOpen` fell back to that name; closing the tab would then have written the file into the workspace and saved it. Now `fileToOpen` gives no file for an empty workspace, and the load opens on the zero-state (`resetFiles(null)`). Unit test and browser check.
  - **A workspace switch from the zero-state** left the old zero-state up while the next workspace loaded: its Open button named a main the new workspace hasn't got, and the tab strip already showed main.pathogen. The pane now follows the store's main.pathogen during the load, as it does when a file is open. A control with the fix switched off failed the browser check (the old "No files yet" and its New program stayed up).
  - **The zero-state redrew on every change to the files**, the same view included, which took the keyboard off its button. The same view no longer redraws. "Show files" falls back to the zero-state's button if the tree has no row to focus (in practice it always has `pathogen.json`).
  - The zero-state is a region named "Editor" for screen readers.
  - Not changed, with reasons: the zero-state's view is pushed in the same store update that clears the open file (the tree subscription listens to `openFile`), so it can't show stale text; a mouse close of the last tab doesn't move the keyboard, and neither does a mouse close of any other tab (Delete on the last tab does put it on the zero-state); an error's message names its file ("main.pathogen line 3:1") with no file open, which is right, since the editor isn't showing it; `workspaceTexts`' "loaded" test gives an empty saved workspace the same answer as `holdsWorkspace()` would, and its comment says so now.

**Step 5, the program chip and list: the plan** (2026-11-12, "Let's proceed to step 5"). The design is v6 screen G (approved in v4), and the strings come from its template (`phase-2-mockups-v6/multi-file-mockup-v6.template.html`): the chip's title "Showing X. Choose a program", the list's "Programs" and its count, the dot's "The file you're editing" and "Uses X, the file you're editing", "Error in X line N", "Updating", "Shown", "Open X in the editor", and the main badge's title. Two commits, 5a and 5b, each with tests first, a storybook entry, a browser check and a code review.
- **5a, the chip and the list.**
  - `components/program-chip.ts` (new): the chip (the program's name, a caret, the red dot) and its list, which opens upward: a tile for the miniature, the name (with `· folder` when two programs share a name, as the tabs do), the `main` badge on a main that isn't `main.pathogen`, the path, the check on the program shown, and **Open in the editor** on hover or keyboard focus (always shown on touch screens, as the docs say). A view only: workspace-view gives it the programs and hears `show-program` and `open-file`. From the keyboard: Enter, Space or Up on the chip opens the list on the program shown; Up and Down move; Enter shows; Escape closes it, back to the chip.
  - Where: beside the zoom controls, the two centred at the bottom of the preview. It shows only with two programs or more. Fullscreen and the 700 px layout are checked again.
  - The list: `entryPoints` in order, the main first even when it's become a library (its row then says "A library now, so it can't be the main", and the chip has its red dot: screen E, state 4), then any program the list doesn't name (an older save), by path.
  - **Wiring `entryPointsAfterEdit`** (written in step 2, never called): after an edit, in the debounce the tab's icon already uses, a program that gains `module;` leaves the list and `pathogen.json`, and goes back at the end when it loses it. Autosave gets the new list; the toast's Undo is withdrawn, since it was planned on the old list; an open `pathogen.json` follows.
  - **Not in the docs or the mockups: the program shown (not the main) gaining `module;`.** Proposed: the preview goes back to the main, as when the program shown is deleted, since it's no longer a program. To confirm with you.
  - **The thumbnail stays the main's** (note 38). It's taken from the preview, so since 4c-1 (Set as main leaves the preview alone) it could already show another program. From 5a, the automatic thumbnail is taken only while the preview shows the main; otherwise it waits for the next chance. **Set Thumbnail** with another program shown is off, with a title (proposed: "The thumbnail shows the main: show it with the chip first"). To confirm with you.
- **5b, every program drawn.**
  - **A third compiler client for the programs not shown** (`programsCompiler`), not `sharedCompiler` as this note said. The shared client also runs the publish precheck, and a superseded compile can only be stopped by ending the client's worker, which would reject the precheck too. The editor's client stays the editor's alone. The worker starts only when a workspace has two programs or more.
  - When: nothing with fewer than two programs. After a load, once the program shown has compiled, the others one at a time. After an edit (a longer debounce than the editor's), only the programs whose import graph holds the edited file; a newer edit cancels the run in flight.
  - The program shown takes its row from the editor's own compile: its error, and its miniature from the preview's SVG, made only while the list is open.
  - Miniatures: the compile result drawn with the engine's `generateSvg`, shown as an `<img>` of a blob URL (no scripts, nothing fetched; the URL is revoked when replaced). A drawing that can't be drawn small gets a blank tile, never an error.
  - The dot on the programs whose graph holds the file you're editing; the spinner on a row that uses the edited file until it redraws.
  - A failed program's row says "Error in X line N", found as the error panel finds it (diagnostics with the program's graph, then `alsoIn`), moved into a pure helper with tests. The chip's red dot: "Another program has an error".
  - Probes first: the form of the graph's file keys; `generateSvg` on a workspace compile's result after the worker's structured clone; with a ConicGradient, and with text.
- **Not in step 5:** red dots in the tree (step 7); the error panel's line about a main that's a library (step 7); the list as a sheet on a phone (step 9); which program export and snapshots use (2g, 2e).

**Step 5a, the program chip** (2026-11-12). As the plan above says, with these details:
- `components/program-chip.ts` (+ `.css`, from the v6 template's `.pick` and `.prow`) and `services/program-list.ts` (pure: `programsOf`, `programItems`, `chipAlert`, `programListChange`). The chip is slotted into `svg-preview-pane`, whose zoom pill now sits in a `#bottom-group` with it, the two centred together. The rows already draw 5b's dot, spinner and miniature when given them; 5a gives blank tiles.
- **Escape** while the list is open is heard on the document, first: the list closes and nothing else does. The browser check found that with the list opened by a click, Escape on the chip left the preview's fullscreen instead.
- **The list's height** comes from the nearest box around the chip that clips or scrolls (the preview), so it never makes the preview scroll; it scrolls its rows instead (at 700 px, two and a half rows show). The storybook story found the first version measuring the chip's own row.
- **`module;` typed in a program** changes `pathogen.json`'s list 300 ms later, through `_applyWorkspaceChange`, so autosave, the toast's Undo and an open `pathogen.json` follow. Files typed in since the last look are all checked, so a switch within the 300 ms isn't missed.
- **The thumbnail is the main's.** workspace-view keeps `_renderedProgram`, the program whose drawing the preview holds. The automatic thumbnail is taken only when that's the main and the main isn't a library; otherwise it stays due. Set Thumbnail is off with the reason under it, as v7 draws it: "Add a program first" (v7's), and two proposed: "The main is a library now", "Show the main first". New store key `thumbnailWait`. This also keeps a workspace with no programs from getting a blank thumbnail, which v7 decided.
- **Checked:**
  - tests: `tests/playground-program-list.test.ts` (11, new), `tests/playground-program-chip.test.ts` (17, new), `tests/app-breadcrumb-files-toggle.test.ts` (+1: Set Thumbnail waits, and says why), `tests/playground-workspace-edits.test.ts` (+1: `pathAfterChange`), `tests/playground-thumbnail-capture.test.ts` (+1: `retryWhenIdle`);
  - `verify/verify-2d-step5a.ts` against `npm run dev:stack`, 26 checks (28 after the review): the chip beside the zoom controls, centred with them; the list's order, no libraries, the check; hover's Open in the editor, which leaves the preview; a row showing its program; the keyboard; a press outside; Escape with the docs open too; try-sizes gaining `module;` (out of the list, the server's list, the preview back on main) and losing it (back at the end); the main gaining it (its row, the red dot, Set Thumbnail waiting); the automatic thumbnail not taken with try-sizes shown, and taken with main shown (the control); no chip with one program; fullscreen and Escape; 700 px; 390 px; dark; the storybook (six stories, the list's rows all showing);
  - `verify-2d-step3.ts` (27), `3b` (21), `4a` (34), `4b` (27), `4c1` (21), `4c2` (29) and `4d` (24) still pass;
  - the full suite: 8,899 passed;
  - screenshots `verify/2d-step5a-*.png`.
- **Review** (code-reviewer: approve with changes; no critical issues). It confirmed the thumbnail guard can't take a drawing that isn't the main's: after a switch in flight, a failed compile, a workspace switch (the capture reads the old workspace before it's reset), or Set as main. Fixed:
  - **A thumbnail refused while another program was shown was never asked for again.** The idle timer fires once per edit. Now the main back in the preview re-arms it, only when one is due (`thumbnailService.retryWhenIdle`, unit test). Leaving the workspace while it waits still drops it; the next edit with the main shown makes it due again. That's said in the code, and here.
  - **One Escape closed the docs too.** workspace-view's own Escape listener runs first, so it now leaves Escape to the chip's open list (browser check, opened from the keyboard, since the docs lie over the preview).
  - **A rename within the 300 ms lost the `module;` check, and the program the preview holds lost its name.** Both now follow the change's moves (`pathAfterChange`, unit test). A switch, a leave or a page close checks the list first, so the save carries it.
  - The chip: no menu `aria-haspopup` (it's a disclosure); its name shortens in a narrow preview rather than the pair overflowing (390 px check); the list closes on a resize or a fullscreen change; the keyboard goes to the chip if its row's program leaves the list; the list's 38 px is a named constant.
  - Not changed: a test of workspace-view's own wiring (it's covered by the browser check, as for the earlier steps).
- *Answered 2026-11-13: all three proposals agreed.* The program shown gaining `module;` sends the preview back to the main ("That's fine"); Set Thumbnail's reasons "The main is a library now" ("Yes") and "Show the main first" ("Yes"). The code's "proposed" marks are gone.
  - **Module, not library** (2026-11-13, the user: "I would like change our use of 'library' to 'module' in our UI text and documentation for the sake of consistency. This diminishes our need for explainer text"). The playground says New module (its "Starts with `module;`" lines gone from the + menu and the name field), "A module now, so it can't draw as the main" (the user's choice, after the review noted that "can't be the main" contradicted the docs' "it stays the main"), "The main is a module now", "Every file here is a module, so nothing draws", and "A module can't be the main."; a new module starts with `// Export fns, consts and enums here, for other files to import.`; the hover on `module;` says "a module, which other files can import". docs/modules.md and docs/workspace-files.md say "module" (content review: `reviews/module-not-library-docs-review.md`). Code identifiers (`isLibrary`, `onlyLibraries`, the `'library'` tab and row kinds) are unchanged. The mockups keep their old words, as a record.
  - **And a follow-up from the same answer:** a thumbnail shouldn't depend on what the preview shows. "We should have a generally available service inside of our app that allows a job to be enqueued to generate a thumbnail (or other sizes of rasterized preview) regardless of how user behavior or interactions change the state of the workspace." On the backlog: `backlog.md`, "A render queue for thumbnails, not tied to the preview".

**Step 5b, every program drawn** (2026-11-13, "proceed to 5b"). As the plan above says, with these details and three changes to it:
- **`services/program-drawings.ts`** (new): `ProgramDrawings`, owned by workspace-view, with everything outside it injected (the compiler, the import graph, the engine, blob URLs, the store), so the tests drive it with fakes.
  - The programs not shown compile on **`programsCompiler`**, a third client in `compiler-worker.ts`. The worker starts with the first such compile, so a workspace with one program has none (browser check).
  - They compile one at a time, in the list's order:
    - after a load, once the program shown has compiled;
    - after an edit, 800 ms after the typing stops.
  - **Only the programs whose files changed.** Each row remembers the texts it was drawn from: its own, and those of every file its imports reach (read with `programModules`, the error panel's graph). An edit marks those rows at once (the spinner) and leaves the others alone.
    - When a compile fails, or an import is missing, every path is remembered too, so a file that appears redraws it.
    - The browser check: an edit to kit redraws try-sizes only.
  - **A newer edit stops the compile in flight**, only once the typing stops and only if that compile's files changed. Each stop ends and restarts the worker, so it's never per keystroke.
  - Nothing starts while the editor's own compile runs. One already running is left to finish, on its own worker.
- **The miniature** is the engine's `generateSvg` of the compile (the CLI's drawing), on the workspace's canvas colour (a rect over the drawing's box), as an `<img>` of a blob URL. No script runs and nothing is fetched. The security contract is the compiler's (`docs/security.md`), and this is the compiler's own output.
  - Made only while the list is open, one per task (the event `program-list-open`, new on the chip). A closed list costs no drawing.
  - A compile keeps a lean drawing (no records or commands) until then. A drawing over about 250,000 characters is never drawn: a blank tile, no error.
  - A new canvas colour re-wraps the same SVG with no compile.
  - URLs are released when replaced, when their program goes (deleted, or a module now), and at a workspace switch (browser check: `fetch` of the old URL fails).
- **The dot** (`usesOf` in `services/program-list.ts`): on the file you're editing ("The file you're editing") and on the programs whose imports reach it ("Uses X, the file you're editing"). It shows only while the file you're editing isn't the program shown, as the mockup's states draw it; then the preview already says what you're editing.
- **The chip's red dot** lights for another program's error, as in 5a. A row's "Error in X line N" keeps "line N" together when it wraps.
- **A rename follows** (`follow(change)` in `_applyWorkspaceChange`). The row keeps its miniature, with no compile when no text it was drawn from changed (browser check). Forgetting a program that left waits a microtask, since the change's store update arrives before `follow`.
- **Changes to the plan, with reasons:**
  1. **Where a row says it failed is read from the compile's own message** (`services/error-place.ts`, pure, with tests on the engine's real messages), not from `getDiagnostics`. The probe (`verify/step5b-probes/probe-programs.ts`) showed two things:
     - `getDiagnostics` runs the evaluator again (its source is `pathogen-evaluator`), on the main thread, which the programs compiled in the background must never do.
     - For a parse error in an imported module it gives only the import line, with no `alsoIn`, while the message names the module and its line ("parts/gears.pathogen line 3, col 14: Missing ';'").
     
     The program shown's row reads its message the same way, so no two rows can disagree. A message with no position (a font that won't load) says "Error in X".
  2. **The program shown's miniature comes from the editor's compile result**, drawn with `generateSvg` like the others, not from the preview's SVG. It's one drawing path for every row, so they look alike. It's still made only while the list is open.
  3. **The dot's rule** above (only while the file you're editing isn't the program shown) comes from the mockup's states, which the plan didn't spell out.
- **Probes** (`verify/step5b-probes/probe-programs.ts`; the message forms are pinned by `tests/playground-error-place.test.ts`):
  - the graph's file keys carry a leading `/`, and the entry isn't among them;
  - `generateSvg` draws a structured-cloned result, a ConicGradient included (as wedge paths, as the CLI does);
  - mesh, freeform and topo gradients become their average colour;
  - text stays `<text>`, which in an `<img>` uses a system font (the preview's web fonts can't reach it). That's fine at 64 × 40.
- **Checked:**
  - tests:
    - `tests/playground-program-drawings.test.ts` (30, new);
    - `tests/playground-error-place.test.ts` (7, new);
    - `tests/playground-program-list.test.ts` (+4: drawn rows, `usesOf`);
    - `tests/playground-program-chip.test.ts` (+2: `program-list-open`, "line N" kept together);
  - `verify/verify-2d-step5b.ts` against `npm run dev:stack`, 32 checks:
    - no second worker with one program; nothing drawn while the list is closed; each row's own drawing on the canvas colour;
    - edits to gears and to kit (the spinners, the dots, which programs redraw, the compiles counted); an error in kit (the row, the red dot) and fixed;
    - try-sizes' own dot; the program shown's own error;
    - a rename (no compile), a delete and a switch (URLs released);
    - the editor's compile cancelled during a load;
    - main-thread stalls while a heavy program (40,000 segments) not shown compiles, list closed and open, against a control: none over 30 ms, and a 150 ms busy task as the measure's own control;
    - light, dark, the storybook (a seventh story, "Just opened: the others drawing");
  - after the review's fixes, `verify-2d-step3.ts` (27), `3b` (21), `4a` (34), `4b` (27), `4c1` (21), `4c2` (29), `4d` (24) and `5a` (28) still pass (5a's story count is now "six or more").
- **Review** (code-reviewer: request changes; one critical). Fixed:
  - **A workspace switch during a graph read left the background run marked as running**, so the next workspace's programs spun until an edit. The run's mark now belongs to its session. A unit test fails without the fix (control run) and passes with it.
  - **Cancel on the editor's compile** left the programs not shown waiting (they wait while it runs). Cancel now lets them go on (`resume`). Unit test and browser check.
  - **A compile the editor started before a switch** could mark the next workspace ready. `updatePreview` now passes the session it started in.
  - **A program deleted during its graph read** no longer gets a row made for it. A compile's in-flight mark can't be cleared by an older run's.
  - The layout key is worked out once per look at the rows.
  - **Typing** (found after the commit, `cfb7f9c`; fixed in the next). 5b read which files are programs on every keystroke, and reading `module;` (`isModuleSource`) is a whole-file Lezer parse: 1 to 2.5 ms on the largest programs here (a 588-line blog sample, `verify/step5b-probes/probe-is-module-cost.ts`). That held in a one-program workspace too, with no chip shown.
    - Now the list is kept between keystrokes (`_programsToDrawCache`). Only the paths that can change it drop it: the tabs' refresh 300 ms after typing (which reads `module;` for the icons anyway), the store subscription (files, the list, the open file), a workspace load, and an applied change.
    - The browser check types 28 keystrokes into the 588-line program and counts workspace-view's uncached readings: none, alone or with the chip. The control in the same run, with the list read on every call as 5b first did, counts 28.
  - *Answered 2026-11-13, both "Yes":*
    - **The dot's rule stays**, and the docs say so: "In the list, a dot before a name marks those programs, and the file itself if it's a program. While you're editing the program the preview shows, there are no dots: the preview already shows your edits."
    - **A blank tile says why on hover:** "Too detailed to draw this small" (`TOO_DETAILED`, the row's `tileNote`). The docs: "When a program is too detailed for its small drawing, the drawing is left empty. Hover the empty drawing to see …". The question was "Fine, or should hovering the tile explain it?", and "Yes" was taken as the second.
    - A focused content review of the two bullets: no blockers; its two rewrites applied, and its nit ("Only the chip changes which program the preview shows").
    - Unit tests (the row's note, the tile's title, drawn small again once it's smaller) and a browser check (the heavy program's tile; main's has no title): `verify-2d-step5b.ts` 36.
  - Not changed, with reasons:
    - `withBackground` puts the rect after the first `>` of the root tag. `generateSvg`'s root tag holds only xmlns, viewBox, width and height (commented).
    - The drawing kept from each editor compile is a bounded walk, stopped at the limit.
    - `programsCompiler` is a module singleton, ended when the workspace view goes, as `editorCompiler` is.

**Step 6, uploads and dragging: the plan** (2026-11-13, "Let's move onto step 6"). The design is mockup v6 screen U (approved in v5) and v7 screen F, state 7 (dragging a file). The contract is docs/workspace-files.md: "Uploading files", "Renaming, moving and deleting", and "Limits" ("A save or an upload that would pass a limit is refused with a message that names it, before anything is lost"). Two commits, 6a and 6b, each with tests first, a storybook entry, a browser check and a code review.
- **6a, uploads.**
  - The + menu and a folder's menu gain **Upload files…** ("Or drop them on the tree") and **Upload folder…** ("Keeps the folders inside it"), as v6 draws them. Upload folder… shows only where the browser can pick a folder.
  - Dropping files and folders from the computer onto the tree: the folder under the pointer lights up, with the label "Drop to add to parts/" by the pointer. A file row means its folder; empty space, or pathogen.json, the top. A dropped folder is read through the browser's file entries, folders inside it included.
  - A pure sort (`services/uploads.ts`): each file's workspace path (the folder dropped on, plus the folders it came in), then what goes in, what clashes (names compared without case, as for new files) and what's left out and why.
  - The clash prompt beside the tree, by the row of the file already there: Replace, Keep both (primary, `keepBothName`), Skip, and "Do this for all" with more than one clash. Files without a clash go in at once with the rest, in one change.
  - `planUpload` (`services/workspace-edits.ts`): the adds, a Replace as a remove and an add of the same path, and the new programs at the end of the list in the order they came. It goes through `finish`, so the server's own rules check it.
  - After: the new rows flash; one file opens in a tab, several don't; the preview doesn't change; the toast says what was added, and lists what wasn't, and why (a list in the toast: `app-toast` gains `items`).
  - A replaced file's tab stays and shows the new text, with a fresh undo history (a new editor call: the old history would map onto text it never had).
- **6b, dragging within the tree.** A file or a folder dragged onto a folder (or the top) moves there, through `planMove` and the same change as Move to…, with its toast and Undo. The folder under the pointer lights up, with the label "Move to demos/ · updates the imports in 2 files" (`moveHint`, as Move to…'s last line). The dragged row dims. A folder can't go into itself or a folder inside it; the folder it's already in doesn't light up. Escape cancels.
- **Proposed, not in the docs or the mockups (to confirm with you):**
  1. **A name the workspace can't use** (`my gear.pathogen`, a name over 100 characters, one Windows reserves) is left out, and the message gives the name rule, as for a file that isn't `.pathogen`. It isn't renamed for you.
  2. **More files than the limit:** the whole upload is refused before anything is added, with the limit and the count ("A workspace can hold at most 20 files: this upload would make 23"), as the Limits section says. Counted once the clashes are answered (Replace adds nothing; Keep both does).
  3. **A file over 1 MB, or one that isn't text**, is left out, and the message says why.
  4. **Files and folders whose names start with a dot** (`.DS_Store`, `.git/`) are left out without a word: they're the computer's, not yours.
  5. **Undo on the upload's toast**, as rename and Move to… have: it takes out what was added and puts back what was replaced. Replace is otherwise the one change in the tree that loses text.
  6. **Escape on the clash prompt skips that file**; the files already settled still go in.
  7. **An empty folder inside an uploaded folder isn't added**: folders come with the files in them.
  8. **A folder whose name differs only in letter case from one already there** (`Parts/` dropped where `parts/` is) goes into that one, rather than being refused.
- **Not in step 6:** importing a whole project folder (2g); data files and fonts (after phase 2); narrow screens, where nothing is dragged (step 9).

**Step 6a, uploads** (2026-11-13). As the plan above says, with the proposals built as written, and these details:
- `services/uploads.ts` (new, mostly pure):
  - `sortUpload`: where each file goes, the clashes, and what's left out and why, by the engine's own rules (`workspaceFileKind`, `workspaceNameProblem`, `workspacePathProblem`, `WORKSPACE_LIMITS`). A folder that differs only in case goes into the one already there, within the upload too. A file can't go where a folder has its name, nor a folder where a file has its.
  - `textOf`: fatal UTF-8; a NUL means it isn't text; a byte-order mark is dropped and line ends become `\n`, as the editor keeps them, so the saved text and the autosave hash settle.
  - The drop: `captureDrop` takes the entries inside the drop event, and `pickedFromDrop` walks folders, every batch of `readEntries`, skipping dot-folders.
  - `pickedFromInput`: Upload folder…'s `webkitRelativePath`. Both stop at 1,000 files and say so.
  - `fontSuggestion`: `Raleway-Bold.ttf` → `@font "Raleway" 700;`, `Open-Sans-Bold.ttf` → `@font "Open Sans" 700;`.
- `planUpload` (`workspace-edits.ts`): a Replace is a remove and an add of one path, so the Undo puts the old text back. A replaced file that becomes a module or a program leaves or joins the list (`entryPointsAfterEdit`); the main stays first. Keep both is numbered against names taken earlier in the same upload. The message: "Added 2 files to parts/: springs.pathogen and labels-2.pathogen.", "Replaced kit.pathogen.", and both joined.
- **A replaced file starts afresh** (`replaceFiles`, new on the editor pane; `applyToWorkspace` calls it for a remove and an add of one path): its tab stays, it shows the new text, and its undo history is new, since the old one would map onto text it never had. A kept tab's state is dropped. The toast's Undo goes through the same call.
- `components/clash-prompt.ts` (new; storybook "Clash Prompt", two stories), placed by the tree beside the row of the file already there (`askClash`). The keyboard starts on Keep both. Escape, heard on the document first, skips that file only. Withdrawn by another workspace (`cancelAsk` in `initialize`), it adds nothing. Withdrawn by a second upload's question, the first says so ("Another upload began before this one's question was answered").
- **The tree:** the + menu and a folder's menu gain Upload files… ("Or drop them on the tree") and Upload folder… ("Keeps the folders inside it", only where the browser can pick a folder); hidden file inputs; the drop target, with the folder lit, the rows in it, and the label by the pointer; `flash` for new rows (1.6 s, through a redraw). `app-toast` gains `items`, a text-only list (storybook story "With a list").
- **workspace-view:** `_upload` sorts, reads, asks, then plans on the workspace as it stands and makes it as one change, with Undo ("Undone. The files are as they were before the upload."). The session is taken when the files are picked or dropped, so a switch during a folder's walk adds nothing anywhere. More files than the limit, counting only the files that can't clash, is refused before any is read. A file dragged anywhere but the tree, while a workspace shows, is stopped on the document (capture): the browser doesn't open it, and the editor doesn't paste it. Any file added or replaced recompiles the preview (it may be one the program shown imports, or was missing).
- **One change from the mockup:** v6 has the files without a clash go in at once, before the question. Here the whole upload is one change, made once the last question is answered: one toast, one Undo, and one count against the limit. The question says so: "The other files go in once you've chosen."
- **Dropping from the desktop:** the browser gives only "files" while they're dragged, not their names, so the label can't list them as v6's drawing does. It says where they'll go: "Drop to add to parts/".
- **Checked:**
  - tests:
    - `tests/playground-uploads.test.ts` (27, new: the sort, `textOf`, the drop walk with fake batched entries, the cap, `fontSuggestion`, `planUpload`);
    - `tests/playground-clash-prompt.test.ts` (5, new);
    - `tests/playground-file-tree.test.ts` (+8: the menus, the pickers, the drop target, the drop, a text drag left alone, flash, `askClash`);
    - `tests/playground-workspace-apply.test.ts` (+1: Replace of the open file and of a kept one, and the Undo);
    - `tests/playground-editor-read-only.test.ts` (+1: `replaceFiles`);
    - `tests/playground-app-toast.test.ts` (+1: `items`, a name with markup shown as text);
  - `verify/verify-2d-step6a.ts` against `npm run dev:stack`, 26 checks:
    - the + menu; the question beside its row; Keep both, the toast and its list, the flash, nothing opened, the program list, the server;
    - Undo; Replace of the open file, its fresh history, and Undo;
    - Windows line ends and a byte-order mark; a 900 KB file saved whole;
    - Upload folder… (puppeteer's picker takes a folder, so it's checked for real), `.DS_Store` left out;
    - a drop on a folder (built from a `DataTransfer` in the page; its entries come back empty, so a dropped folder's walk is checked by the unit tests only);
    - a drop on the editor (nothing happens); Escape; the limit; a switch while it asks;
    - dark; the storybook;
  - `verify-2d-step3`, `3b`, `4a`, `4b`, `4c1`, `4c2`, `4d`, `5a` and `5b` still pass (4b, 4c1 and 4c2 with the menus' two new items);
  - the full suite: 8,987 passed.
- **Review** (code-reviewer: approve with warnings; no critical issues). It confirmed Replace and its Undo through `replaceFiles`, the fresh plan made in the same tick as it's applied, and the escaping. Fixed:
  - **A drop's session was taken after its folder's walk**, so a switch during a long walk could add the files to the next workspace. Now it's taken when the files are dropped or picked.
  - **Upload folder… had no cap**, and every candidate was read before the limit refused the upload. Now it's 1,000 files, as for a drop, and an upload over the limit is refused before any file is read.
  - **The drop guard ran on every page** (workspace-view is always in the page): now only while a workspace shows.
  - **Folders that differ only in case within one upload** (or a new file and a new folder with one name) would have made a workspace the server refuses. They merge or are left out with why.
  - A pick or a drop before the workspace has loaded says so. The question's Keep both name is numbered from the new file's name, as the plan numbers it. `fontSuggestion` reads hyphenated families. A test pins the main replaced with a module, and one a later Keep both's numbering.
  - Not changed, with reasons: `dragleave` in Safari (its `relatedTarget` is null) may let the light flicker between rows, and the next `dragover` lights it again; `flash` redraws the tree once per upload.
- **Proposals 1 to 8 above, and the one change from the mockup, await your answer.**
- *Answered 2026-11-13:*
  1. **Changed: "Can we rename it to make it compliant (replacing spaces or other unsupported characters with a dash?)"** Built (`fittedName`):
     - a run of characters a name can't have becomes one dash (`my gear` → `my-gear`), and accents are dropped (`über` → `uber`);
     - the name starts with a letter or a digit; one Windows reserves gets `-1`; it's cut to 100 characters, its extension kept; a name with nothing left is `file` (or `folder`);
     - folders' names too.
     
     The candidate keeps `renamedFrom`. The toast lists each name changed (`my gear.pathogen → my-gear.pathogen`) above the files left out, under "Some names were changed to fit the name rules:". A changed name can clash like any other. Two files whose changed names meet: the second is left out, saying so.
  2. "That's fine, although it would be beneficial to log how often this happens at some point." The app has no usage counting, so it's on the backlog: `backlog.md`, "Count how often a workspace hits the 20-file limit".
  3. to 6. and 8. "Yes."
  7. **Changed: "I would like to add it if we can (unless something prevents it.)"** A dropped folder's empty folders now go in (`pickedFromDrop` returns them; a folder holding only dot-files counts as empty), names fitted and case merged, through `planUpload`'s `emptyFolders`. The message says so ("…, and the empty folder shapes/round/."), and Undo takes them out. **Upload folder… can't**: the browser's folder picker lists only files.
  9. (the mockup change: everything goes in after the last question) "Not sure I understand the scenario you are describing here...Can you tell me more?" Explained (an example: springs waits for the labels question, then both go in as one change, one toast, one Undo, one limit check). Then: **"This is fine."**
  - The drag label: the browser hides dragged files' names, so v6's list can't be drawn. Asked whether it should give the count instead: **"Sure."** Built in 6b's commit ("Drop 2 items to add to parts/"; a dragged folder is one item).
  - The docs' "Uploading files" now says all of this. A focused content review checked it.

**Step 6b, dragging within the tree** (2026-11-13, "Then step 6b … A: Yes!"). As the plan above says (mockup v7 screen F, state 7), and these details:
- **The tree** (`file-tree.ts`):
  - File and folder rows are draggable; pathogen.json isn't. No drag starts while a name is being typed.
  - **The drag:**
    - It carries the row's path as its own type (`application/x-pathogen-path`), and nothing else, so a drop on the editor pastes nothing.
    - The row dims (`_mark`, so a redraw keeps it), and the drag's image is a chip with the row's icon and name.
    - The drag's end is heard on the row itself, so a row drawn again during the drag still ends it.
  - **Over a folder:** the same rule as an upload's drop (`dropFolderAt`). The folder it's in, and a folder into itself or one inside it, don't light and have no label.
    - Elsewhere it asks workspace-view's `checkMove`, once per folder per drag. The answers are asked again when the workspace changes during the drag.
    - Where it can go: the folder lights, with `moveLabel` by the pointer ("Move to demos/ · updates the imports in 2 files", the files counted, the moved file's own included).
    - Where it can't: no light, and the reason in a quieter label ("parts/ already has gears.pathogen.").
  - **Dropped:** the same `move-entry` as Move to…, so the same plan, toast and Undo. The drag is over at its drop.
  - A drag whose end was never heard is over at the next press. A row from another window's tree is left alone.
- **A moved row's folders open** (`_dispatchMove`), so it shows where it went and keeps the keyboard. This is new for Move to… too.
- **The upload label counts** (your answer above): "Drop 2 items to add to parts/". A folder is one item. A browser that doesn't say gives the label without a count.
- `moveLabel` (`workspace-edits.ts`); `checkMove` gives `hint` and `label` (`_entryCheck` takes a describe function); the storybook's "Dragging a file" and "Dragging where it can't go" hold a drag in place.
- **Checked:**
  - tests:
    - `tests/playground-file-tree.test.ts` (+21: the drag, the light, the label, refusals, the folder it's in, into itself, the top, the drop, a second drop, a folded folder opening, Esc, a redraw, the workspace changing, the dragged file gone, a lost end, leaving the tree, another window, typing a name, files during a drag, the upload count);
    - `tests/playground-workspace-edits.test.ts` (+1, `moveLabel`).
  - `verify/verify-2d-step6b.ts` against `npm run dev:stack`, 22 checks: a real drag (dragstart, dragover and dragend from the browser), with the drop sent in the page because headless Chrome doesn't deliver one reliably.
    - kit onto demos/: the label, the move, its imports, the toast, Undo, the server;
    - the folder it's in; a refusal; a folder, and not into itself; the top; a second drop; a folded folder;
    - the editor; the upload count; dark; the storybook.
    - The check's header lists headless Chrome's drag quirks and how it works around them; `verify/probe-2d-step6b-drag.ts` shows them. One is that it ignores Esc during a drag, so Esc is checked by the unit tests.
  - `verify-2d-step4a`, `4b`, `4c1`, `4c2`, `4d`, `5a`, `5b` and `6a` still pass (`4b`, `4c1` and `4c2` with thirteen tree stories; `6a` with the counted label).
- **Review** (code-reviewer: no critical issues). Fixed:
  - the per-folder answers could go stale if the workspace changed mid-drag;
  - a drag whose end was lost (Firefox may send no `dragend` for a row gone from the page) left a row dimmed;
  - a drop test that didn't check its contract;
  - the label's text written on every dragover.
- **The docs:** "Uploading files" (the count) and "Renaming, moving and deleting" (dragging), with a focused content review (no blockers; its rewrites applied: the drop targets listed first, the long bullet split, the folder it's in named).

**Step 7, errors and navigation: the plan** (2026-11-13, "Let's move onto step 7").

**The design.**
- Mockup v6 screen E, state 4: the error panel with each part under a small heading (the file's name; "The main"), and the playground's own note about a main that's a module, with a link.
- Mockup v6 screen G, state 5: a red dot on the icon of the file where a program failed and on the program, for a program not shown too.

**The contract:** docs/workspace-files.md "Errors in other files".

Three commits, each with tests first, a storybook entry where there's a component, a browser check and a code review.
- **7a, the error panel, and opening a file at a line.**
  - **One reading of a failure** (`services/error-place.ts`, extended): the file where it happened, its line and column, its words, and the steps back to the program ("called from main.pathogen line 4", "imported from …"). It reads diagnostics first: `alsoIn`; else the message's first line, which names the other file for an error in that file's own code (no `alsoIn` then); else the program's own line. Without diagnostics, it reads the compile's message. The chip's rows, the panel and the tree's dots all read it, and a test pins that they agree.
  - **The panel** shows it under the name of the file where it happened. The name, "Line N" and each step back are links (buttons): they open that file at that line, with the cursor there, the line centred, its mark, and the keyboard in the editor. The message no longer shows twice (today the `alsoIn` lines repeat it). A plain message, such as a workspace that didn't load, shows as before. Copy Debug Info and `compilationError` keep a plain-text copy.
  - **`open-file` gains `line` and `column`.** A line past the file's end goes to its last line; a file gone since does nothing.
  - **An error's marks follow it:** the reading is kept, and a file opened afterwards shows its own marks (today only the file open when the error came is marked).
  - **The main as a module:** the playground's own note, under "The main", whether or not the compile failed (a module of exports compiles, and draws nothing). It shows while the preview shows the main.
- **7b, Cmd-click on an imported name** opens its file at the definition, through `open-file`. Today it jumps to the name's import line in the same file. The graph can lag an edit, so the position is clamped.
- **7c, red dots in the tree**, on the file where a program failed and on that program, for every program (the shown one's compile and step 5b's background compiles), and on a main that's a module. They're toggled on the rows like `dragging`, never by redrawing the tree. A rename or move takes a dot with its file. Each dot has a tooltip, and the row's spoken name says so.

**Proposed, not in the docs or the mockups (to confirm with you):**
1. **Every error grouped and linked.** v6 draws the panel only for the main-as-a-module case; the grouping, the links on "Line N" and on each "called from" step are proposed.
2. **The console's links:** an entry from another file names it ("parts/gears.pathogen line 9:"), and that becomes a link; so does "Line 9:" on the shown program's entries.
3. **The note's words:** "A module can't draw as the main. Take out module;, or set another program as main." This is the row's wording ("can't draw as the main"), not v6's "A library can't be the main".
4. **The note's link, "set another program as main":** it shows Files and opens the next program's menu with Set as main focused. With no other program there's no link: "Take out module; so it draws, or add a program."
5. **The dots' tooltips:**
   - on the failing file, "try-sizes.pathogen fails here, line 9";
   - on the program, its row's words, "Error in parts/gears.pathogen line 9";
   - on a module main, "A module now, so it can't draw as the main".
6. **Cmd-click on an import's path** (`"./parts/gears.pathogen"`) opens that file at its top, if `getDefinition` gives no place there (checked in 7b).

**Not in step 7:** Copy Debug Info (step 8); narrow screens (step 9); docs/modules.md's playground lines (they change in the publishing push, as the comment at the top of docs/workspace-files.md says).

*Answered 2026-11-13, all as built:*
1. Every error grouped under its file, with links: "Great".
2. The console's links: "Great".
3. The note's words, "A module can't draw as the main. Take out module;, or set another program as main.": "Yes".
4. The note's link (the next program's menu on Set as main; no link with no other program): "That's fine".
5. The dots' hover texts: "Great".
6. Cmd+click on an import's path opens the file at its top: "Great".
7. *(proposed in 7c)* A folded folder takes a dot for a file inside it: "Great".

**Step 7a, the error panel and opening a file at a line** (2026-11-13). Built as the plan says, with proposals 1 to 4 built as written. Details:
- **`services/error-place.ts`**:
  - `readMessage` and `readDiagnostics` give `ErrorReading[]`: file, line, column, words, steps, and site.
  - An error starts only on a line that names a place, so extra lines of words stay with their error.
  - A file's name has no spaces, so "Cannot import foo.pathogen line 3" isn't read as a place.
  - `errorMarks(readings, openFile, program)` gives the marks for whichever file is open.
  - `errorText` gives the plain words, for `compilationError` and Copy Debug Info.
  - `errorPlace` (the chip's rows) now reads through `readMessage`. A test pins that the rows and the panel agree, on the real engine's failures.
- **`error-panel.ts`**:
  - `showSections`: built from DOM nodes (text through `textContent` and `append`).
  - The links are buttons named for screen readers ("Open parts/gears.pathogen at line 5").
  - The same errors again redraw nothing, so a focused link keeps the keyboard.
  - `show(message)` stays for plain messages. The storybook has three new stories.
- **The console:** `console-pane.program` (the program shown, in a workspace) makes each entry's place a button.
- **`code-editor-pane.revealPosition(line, column)`:**
  - clamps to the file;
  - waits for the editor if it hasn't loaded;
  - ignores a position that isn't a number.
- **`file-tree.openMenu(path)`** opens a row's menu from outside the tree (the note's link).
- **workspace-view:**
  - `showError` reads the failure once and keeps it (`_failure`). The panel and the marks come from it: a tab switch marks from the reading, no longer re-running getDiagnostics on the main thread.
  - The failure shows only while its program is the one shown. The chip showing another drops it at once.
  - Plain messages (`showMessage`: a workspace not found, one that can't be saved) stay until another workspace loads, behind a compile's errors. Before, the next compile wiped them.
  - `open-file` takes `line` and `column`. A file gone since gets a toast ("parts/gone.pathogen isn't in the workspace now.").
  - The main as a module: `_mainNote`, read from the programs-to-draw list (no parse while typing; 5b's typing check still counts 0).
  - **The panel sits over the editor** (v6 screen E), 12 px in, kept there by a ResizeObserver. Before, it sat at the window's left edge, half the width, over the file tree.
- **Checked:**
  - tests:
    - `tests/playground-error-place.test.ts` (+14);
    - `tests/playground-error-panel.test.ts` (10, new);
    - `tests/playground-console-grouping.test.ts` (+2);
    - `tests/playground-editor-read-only.test.ts` (+2);
    - `tests/playground-file-tree.test.ts` (+1).
  - `verify/verify-2d-step7a.ts` against `npm run dev:stack`, 25 checks:
    - the panel and its place; real clicks on the line, the step and the heading; Enter;
    - a file gone (the toast); the chip showing another program;
    - the console's two kinds of links; the main as a module of exports (the note, with a compile that worked), and its link to Set as main;
    - a scratch link; "Workspace not found" staying; dark; the storybook.
  - `verify-2d-step3` and `verify-2c-playground` (the panel's words), `4d`, `5a` and `5b` still pass (`3` with its expectation in the panel's new form).
- **Review** (code-reviewer: no critical issues). Fixed:
  - a failure kept after the chip showed another program;
  - plain messages wiped by the next compile;
  - a message's extra lines read as more errors;
  - a too-loose file pattern;
  - a link to a gone file doing nothing;
  - links named only "Line 4";
  - a link before the editor loaded;
  - an empty message.
- **The docs** (focused content review: no blockers; applied): "Errors in other files" shows the panel as a text block and says what each link opens; Cmd+click is the last bullet; "Adding `module;` to the main" is split into what happens, quoting the note.

**Step 7b, Cmd+click across files** (2026-11-13). Cmd+click (Ctrl+click) on a name imported from another file opens that file at its declaration, through `open-file`. Before, it jumped to the name's import in the same file.
- `utils/definition-target.ts` (`otherFileDefinition`) turns `getDefinition`'s project path and range into the file to open and where. A name declared in the file open still jumps within it. `cm-language-services.ts` sends `open-file` from the editor and keeps CodeMirror from starting a selection.
- **Proposal 6 comes from the engine:** `getDefinition` already gives a file's top for a click on an import's path, and for a namespace's name.
- **Checked:**
  - `tests/playground-go-to-definition.test.ts` (4, new; the real engine's getDefinition with the graph the playground builds): an imported fn at its call and in its import, a namespace's member, the namespace, the import's path, a local name;
  - `verify/verify-2d-step7b.ts` (6, real clicks with Meta held): the call, `g.size`, the path, a local name, a click without Cmd.
- The code review comes with 7c's (one review over both commits).

**Step 7c, red dots in the tree** (2026-11-13). As v6 screen G, state 5 draws them: a red dot at the corner of the icon of each program whose compile failed, and of the file where it failed. That covers the one shown (the editor's compile) and every other program (step 5b's compiles in the background), with one program too. Proposal 5's hover texts are built as written.
- **`program-drawings.ts`:**
  - entries keep where they failed (`place`), not their row's words; `rows()` gives both;
  - `follow()` moves a place's file with a rename or a move, and workspace-view refreshes the rows right after a change, so a dot goes with its file at once, before any compile.
- **`program-list.ts` `treeErrorDots`:** path → what the dot says.
  - The program's row words: "Error in parts/gears.pathogen line 9".
  - The failing file: "try-sizes.pathogen fails here, line 9". Several programs failing in one file, one line each.
  - A main that's a module: "A module now, so it can't draw as the main". It isn't in the rows (it draws nothing); it's read as the chip reads it.
- **`file-tree.ts`:**
  - `errors` marks the rows as they are (`_mark`), never by drawing them again, so a name field or a menu stays open. Setting the same dots again does nothing.
  - The icon's `title` says why on hover.
  - The row's text ends with the reason, hidden from the eye, so every screen reader reads it with the name. (`aria-description` isn't in every browser yet; the review's point.)
  - **Not in the plan, proposed (7):** a folded folder takes a dot for a file inside it ("A file in it has an error"), since that file's row is hidden.
- Storybook: the tree's "Red dots" story (fourteen stories now; the 4b, 4c-1 and 4c-2 checks count them).
- **Checked:**
  - tests:
    - `tests/playground-program-list.test.ts` (+5, `treeErrorDots`);
    - `tests/playground-program-drawings.test.ts` (+1: the place, and a rename);
    - `tests/playground-file-tree.test.ts` (+5: the dots, no redraw, a folded folder, two deep, cleared);
    - `tests/playground-go-to-definition.test.ts` (+1, below).
  - `verify/verify-2d-step7c.ts` against `npm run dev:stack`, 12 checks:
    - a program not shown failing in another file, its two dots and what they say;
    - the screen reader's words; a rename while the dot shows; a folded folder; fixed;
    - the main shown failing; the main a module, and back; dark; the storybook.
  - `verify-2d-step4b`, `4c1`, `4c2`, `5a`, `5b` (typing: `module;` still read 0 times), `6a`, `6b` and `7b` still pass.
- **Review** (code-reviewer, over 7b and 7c: no critical issues). Fixed:
  - the tree's dot and the chip read "the main is a module" from two places, which could disagree for a moment; now one;
  - `aria-description` alone (see above);
  - **7b:** Cmd+click on a definition whose file the workspace no longer holds (a graph built before a delete) now jumps within the file, as before, instead of a toast saying the file is gone (`otherFileDefinition`'s `isFile`; +1 test);
  - the dots cleared at once on a workspace switch.
- Not changed, with reasons: a place whose file was deleted keeps its dot's text until the next compile, but there's no row to show it on, and the change itself recompiles.

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
