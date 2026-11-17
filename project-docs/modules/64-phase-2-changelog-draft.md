# Phase 2: the CHANGELOG entry (draft for your approval)

2026-11-16. Note 58's step 7, last item: the CHANGELOG entry for phase 2 (2b to 2e). Nothing is in `CHANGELOG.md` until you approve.

**Approved 2026-11-17** and copied into `CHANGELOG.md` word for word, without the list below. Items 2, 3 and the 0 px pane in 4 stay open for step 8 (note 58, "Step 7, done").

**What it covers.** Every commit after the last entry's (8b76cda, 2026-11-07): ecbaabc, the last pushed commit, and the 94 after it. Commits that touch only `project-docs/` are folded into what they led to. It also covers step 7's docs work, not yet committed (note 63): the five pages, the `DOC_FILES` line, the screenshot and the compiler's no-project-folder message.

**Fixed and Changed are measured against origin/main** (ecbaabc), what pathogen.studio runs today. A fix to something that never shipped, such as an autosave race inside 2d's own code, gets no line.

## For you to decide

1. **Left out: uncommitted changes that aren't phase 2.** These are `docs/path-blocks.md`, `docs/variable-offset.md` and `tests/variable-offset.test.ts`, and the rebuilt `website/blog-static/*.html`, `playground/utils/blog-content.js` and `project-docs/pdf-export/verify/*`. None of them is in note 63.
2. **Visitors and someone else's public workspace.** Since 5a, opening it in the playground says "You do not have access to this workspace". The entry says so under Changed. Whether such a visitor should go to the public page instead is still open (58, "Step 5a, built").
3. **The re-review cleanup at ship has no script.** 5a's "For step 8" asks for a one-time removal of the re-review entries of private workspaces. The entry lists it among the production steps, without naming a script.
4. **The two preview speed fixes are under Fixed**, since Console and the inspector were slow in production too. Changed would also fit, because the layout now behaves differently:
   - the editor keeps its width on wide screens;
   - with the tree, the console and the inspector all open, the preview pane is 0 px wide in 1024 and 1280 px windows (measured in 6c2b6b6, left for you).
5. **One autosave fix is included:** a save as the page closes, over 64 KB. The live autosave sends it with `keepalive` and no size guard, so the browser refuses it. Left out: 5f9718c's other "fixed on the way" items, an edit typed during a save or after a failed one. I couldn't confirm that they happen in the live one-program autosave.
6. **Headings.** Inside each section, the order is Core, Language services, Playground, API, Documentation, Development. Documentation and Development are `####` subsections, as asked: the new page under Added, the four pages under Changed, `--to-fixed` under Fixed, Development under Added. The 2026-11-07 entry used a top-level `### Documentation` instead.
7. **The docs lines depend on step 7.** Everything under Documentation, and the no-project-folder message under Changed > Core, describes work that isn't committed yet (note 63). They hold only if step 7 is committed with this entry.

---

## [Unreleased] - 2026-11-16 (a workspace holds several files)

Phase 2 of the multi-file playground. Nothing here is pushed yet. It ships as one push, then the production migration of every saved workspace (see Development, below). Until then, the publishing problems under Fixed are still live on pathogen.studio.

### Added

#### Core

- **For library callers:**
  - `createMemoryProjectHost`, a project held in memory, as a workspace is;
  - `importEditsForMoves`, `applyImportEdits` and `pathAfterMoves`, the edits that keep every import reaching the same file when files move;
  - the workspace rules the server shares: `checkWorkspaceManifest`, `workspaceContentHash`, `workspaceFileEntry`, `workspaceFileKind`, `isJustMainWorkspace`, `WORKSPACE_LIMITS`, `WORKSPACE_MAIN_FILE`, `workspaceNameProblem`, `workspacePathProblem`, and `workspaceProjectFileText`, the one writer of `pathogen.json`.
  - The highlight bundle exports `isModuleSource` and `workspaceProjectFileText`.
- **No new built-in names.** Phase 2 adds no keywords, standard-library functions, constructors, enums or namespaces, so the reserved-name list is unchanged.

#### Playground

- **A workspace holds several files, like a project folder:** programs, modules (files that start with `module;`) and folders, with a `pathogen.json` the workspace writes itself. `import` works as in the CLI and VS Code: `./` and `../` start at the importing file's folder, and `/` at the top of the workspace.
  - **The preview compiles the program it shows with every file it imports,** and loads `@font` from each of them. Editing a module redraws the programs that import it.
  - **Completion, hover, parameter hints and go-to-definition** read the imported files. Inside an import's quotes, the editor lists the workspace's modules; typing `"` or `/` there opens the list.
  - **Limits:** 20 files (`pathogen.json` doesn't count), 1 MB a file, folders 8 deep, 100 characters a name and 255 a path.
  - **Names** use ASCII letters, digits, `-`, `_` and `.`, and start with a letter or a digit. Windows' reserved names (`con`, `aux`, `nul`, …) can't be used. Two names in one folder must differ by more than letter case. `pathogen.json` is reserved in every folder.
  - An unsaved scratch buffer is still one program, and an `import` there is an error.
- **The file tree, beside the editor.** **Files**, before Console in the breadcrumb, shows and hides it.
  - Folders come first, then files. The main has a `main` badge, unless it's `main.pathogen`.
  - `pathogen.json` comes last, with a lock. It opens read-only, written from the program list; typing in it shows a tip.
  - A click opens a file in a tab and leaves the preview alone. The keyboard follows the tree pattern: one Tab stop, the arrow keys, Home and End.
- **Tabs, one per open file,** each keeping its own undo history and scroll position.
  - A tab's label leaves out `.pathogen`, and adds the folder when two open files share a name. The × or a middle-click closes it.
  - The breadcrumb names the open file with its folder.
  - **Closing every tab** leads to the editor's zero-state. It offers **Open <main>**, and **Show files** when the tree is hidden. With no program, it says "No program yet" or "No files yet", why nothing draws, and offers **New program**.
- **Making files and folders.** The tree's **+** offers New program, New module, New folder, Upload files… and Upload folder….
  - Its first line says where they go: the folder last selected in the tree, else the folder of the file you're editing, else the top.
  - The name field checks the name as you type and says why one can't be used. A slash makes folders (`shapes/star`).
  - A new module starts with `module;` and `// Export fns, consts and enums here, for other files to import.`
- **Each file's and folder's own menu,** from its ⋮, a right-click, Shift+F10 or the menu key:
  - a program: Set as main, Duplicate, Rename…, Move to…, Delete…;
  - a module: Duplicate, Rename…, Move to…, Delete…;
  - a folder: the + menu's items, for that folder, then Rename…, Move to… and Delete….
- **Imports follow moved files.** Rename…, Move to… and dragging a row onto a folder update every import that reaches a moved file, and a moved file's own `./` and `../` imports. Comments and strings are never touched.
  - Before you confirm, the menu says what will change: `Moves its 2 files, and updates the imports in 3 files`. While you drag, the folder under the pointer lights up with the same count (`Move to demos/ · updates the imports in 2 files`). Where a row can't go, the label says why.
  - The rewritten lines are marked until your next edit. They stay out of each file's own undo history, so Cmd+Z never points an import at a name that's gone.
  - **The toast's Undo** puts the names, imports and tabs back as one change. A later change to the files withdraws it.
  - **Delete… asks first,** listing the files that go and the files that import them.
- **Uploads.** Drop files or a folder from your computer onto the tree, or use Upload files… and Upload folder…. The folder under the pointer lights up (`Drop 2 items to add to parts/`).
  - **A name already taken,** in any letter case, asks beside its row: **Replace**, **Keep both** (`labels-2.pathogen`) or **Skip**, with "Do the same for the others".
  - **A name that breaks the rules is changed to fit:** each run of other characters becomes one dash, and letters lose their accents (`my gear.pathogen` → `my-gear.pathogen`, `über.pathogen` → `uber.pathogen`).
  - **Left out, with the reason:** anything but `.pathogen` files (`pathogen.json` too; the workspace writes its own), a file over 1 MB or not text, and a path too deep or too long. Dot-files such as `.DS_Store` are left out silently.
  - **Past 20 files,** an upload adds nothing.
  - A dropped folder keeps its empty folders.
  - One toast lists what went in, each name changed and what was left out. Its **Undo** takes the upload back.
- **The program list.** Once a workspace has two programs, a chip beside the zoom controls names the program the preview shows. Its list shows each program drawn small, with its path and the main's badge. Choosing a row changes what the preview shows; **Open in the editor** opens its file.
  - The programs not shown compile in the background, one at a time, after you stop typing. A spinner shows while each redraws. One too detailed to draw small says "Too detailed to draw this small".
  - A dot marks the programs whose imports reach the file you're editing. There are no dots while you're editing the program the preview shows, since the preview already shows your edits.
  - A program that fails says where (`Error in parts/gears.pathogen line 9`), and the chip shows a red dot.
- **The main** is the first entry in `pathogen.json`'s list: the program the workspace opens on, and the one its thumbnail and publishing use. **Set as main** changes it.
  - The thumbnail is taken only while the preview shows the main. Otherwise **Set Thumbnail** is off, with its reason: "Add a program first", "The main is a module now" or "Show the main first".
  - A program that gains `module;` leaves the program list, and one that loses it joins the end.
  - A main that's a module can't draw as the main. The error panel says `A module can't draw as the main. Take out module;, or set another program as main.`, and its link opens the next program's menu on Set as main.
- **Errors in other files.** The error panel puts each error under the name of its file. The name, `Line 5` and each `called from` or `imported from` line are links that open the file there, with the line marked.
  - In the console, a log or warning from another file starts with its place, which is a link.
  - **Red dots in the tree** mark each program that fails and the file where it fails, the programs the preview doesn't show included. A folded folder shows the dot of a file inside it, and hovering a dot says where.
  - **Cmd+click (Ctrl+click)** on a name imported from another file opens that file at its declaration. On an import's path or a namespace's name, it opens the file.
- **A workspace with no program** draws nothing, and the status says "No programs", with the reason on hover. Export, Snapshot, Set Thumbnail and Make public wait, each saying why. On the Workspaces page, its card says so and Make Public is held back.
- **On narrow screens (800 px or less):**
  - the tree is a drawer from the left. Files opens it, and choosing a file closes it;
  - the tree's menus are sheets from the bottom, ending with **Cancel**, and so is the program list;
  - the breadcrumb leaves out the workspace's id and size, and Snapshot shows as its icon.
  - On these screens and on any touch screen, nothing is dragged, and every ⋮ and Open in the editor shows. Upload folder… isn't offered on a touch screen.
- **Copy Debug Info carries the workspace.** The report starts from the program the preview shows, and names the file open. It includes:
  - each error with its `called from` lines; the first five come with five lines either side, numbered as in the file;
  - the other programs' errors;
  - the text of the program shown and of the files its imports reach (200 lines each, about 1,500 together), the error's file first;
  - every other file by name, kind and length;
  - warnings and logs with their file.
  - Its note for an assistant names no syntax and points to the docs.
- **Copy from an icon in the code's own panel.** At the end of the tabs, before the docs book, an icon copies the file in the editor; its tooltip names the file.
  - "Copied" shows only once the clipboard has the text. A refusal says to select the text and press ⌘C.
  - With no file open, the icon isn't there.
  - The same icon is in every code panel: blog embeds (where it says "Copy the code"), the snapshots page, the review screen and the public page.
- **Snapshots keep every file.** A snapshot keeps every file as the preview drew it, the folders, `pathogen.json`'s list, and which program drew the image.
  - Only edits you haven't saved yet are uploaded, so the 1 MB limit counts only those.
  - The "edited since this rendered" note names the file and line (`line 5 of parts/gears.pathogen`), or says the workspace's files changed.
- **The snapshots page shows every file.**
  - **The code panel** lists the snapshot's files in the tree's order and opens on the program that drew the image. Its icon copies the file shown, and Export's legend lists that file.
  - On a narrow screen, the list is a menu above the code. In the list, ← and → move between files.
  - **Start new workspace** copies "this snapshot's files", the folders and the program list, and opens on the main. The viewer's own Open in playground (↗) is hidden there, since it would carry one file.
  - A snapshot taken before workspaces held files shows its one program, as before.
- **A file that can't be read** keeps its row, with a warning icon. Where its code would be, it says "This file couldn't be read. The other files show as saved.", and its copy icon is off. The other files still show: on the snapshots page, the review screen and the public page.
- **Copies carry every file.** Copy Workspace and the Workspaces page's Duplicate copy on the server, with the name and description you give:
  - every saved file, the folders, the program list and the canvas settings;
  - an edit typed just before Copy Workspace;
  - the copy opens on its main.
- **The public page shows every file.** Its summary reads `Pathogen · 4 files`, and the drawing is the main's, compiled with its imports.
  - **View source** lists the approved files beside the code and opens on the main. The other files' text loads when you open it, with Try again if it fails. A one-file workspace shows its code as before.
  - **Open as new workspace** gives a visitor every approved file, the folders and the program list, and opens on the main. An edit waiting for review isn't carried.
- **The review screen (admins) reads every file.**
  - Each card compiles the main with its imports and says how many files it has. A re-review's card says what changed since the approved version: `Since the approved version: 1 changed, 1 new, 1 removed`.
  - The modal shows the drawing and every file, opening on the main. Changed, new, moved and removed files have badges, and a box lists the changes; each line opens its file.
  - Approve is off until the files load, then sends the drawing of those files. An entry whose files can't be read says so, with Approve off and Reject on.
  - The Approved and Featured tabs, Regenerate, Set thumbnail, the thumbnail tool and `backfill-approval-svgs.ts` all compile the main with its imports.
- **Blog embeds: Background, Grid and Reset** in the control bar:
  - **Background** has five named swatches, a hex field and Default;
  - **Grid** draws under the drawing, as the playground's preview does;
  - **Reset** puts the variables, the background and the grid back.
  - They stay with the embed: Open in Playground carries the code alone.

#### API

- **Workspaces hold files.** A workspace's record is a manifest in KV: every file's path, size and hash, the folders and the entry points. Each file's bytes are in R2, by hash.
  - Create, load, save and copy take and give `files`.
  - A load still gives `code` for a workspace that is just `main.pathogen`, so a one-program client keeps working. A `code`-only save to a workspace of several files answers 409.
- **New routes:**
  - `GET /workspace/:id/file/:sha256`: one file's bytes, for the owner and admins. An admin can read any file the workspace has held, an older approval's included;
  - `POST /workspace/:id/copy`: copies every file, with `name` and `description`, for the owner and signed-in admins;
  - `GET /snapshot/:sid/files`: a snapshot's files and `program`. `GET /snapshot/:sid/code` answers 409 for a snapshot of several files;
  - `GET /approval-source/:id`: an approved workspace's files, for visitors, guarded like `/approval-svg/:id`;
  - `GET /approval-card/:id/:size` (`256`, `512`, `1024`, `hero`): the card image frozen at approval;
  - `GET /admin/review/:id/source?queue=review|rereview`: a queue entry's files, and for a re-review, `changes` and `approvedAt`;
  - `POST /admin/approval-cards`: the one-time copy of card images for older approvals, with `dryRun`.
- **A snapshot takes `files`,** each as text or by `sha256` for bytes the workspace already holds, and `program`, the path of the program that drew the image. `code` still works.
- **Answers carry more:**
  - every save carries `rereviewPending` and `publicationState`;
  - `GET /workspaces` adds `noPrograms` and `rereviewPending`;
  - the Re-review listing carries `changes`;
  - `source.json` carries `files`, `folders` and `entryPoints`.
- **A file that can't be read** comes back as `{ sha256, size, unreadable: true }` from the reads that show files: `/snapshot/:sid/files`, `/approval-source/:id` and `/admin/approval/:id`. The others are still read. The reads that save or copy files still fail rather than lose one.

#### Documentation

- **docs/workspace-files.md, published** (registered in `DOC_FILES` as `workspaceFiles`, after modules.md): "Files in a Workspace". It has a screenshot in light and dark (`docs/images/workspace-files.png`, `.dark.png`), and a "What changed (November 2026)" note: older snapshots and public pages draw as before. Its sections:
  - A new workspace;
  - The file tree and tabs;
  - Programs and modules;
  - The main;
  - The preview and the program list;
  - Try it: move a fn into a module;
  - pathogen.json;
  - When the main is gone or can't draw;
  - Adding files and folders;
  - Uploading files;
  - Renaming, moving and deleting;
  - On a phone or a tablet;
  - Errors in other files;
  - Copy Debug Info;
  - Snapshots, copies and publishing;
  - Limits.
- **Images in the docs.** A page shows a PNG from `docs/images/` on a line of its own: `![What it shows](images/name.png "caption")`. A `name.dark.png` beside it shows in the dark theme.
  - The build checks each image: alt text, a real PNG, a paragraph of its own. A failure stops it, with a message naming the page and the fix.
  - `check-links` checks that each image loads.
  - docs/CLAUDE.md, "Images", says how to use it.

#### Development

- **At ship, each with your go-ahead** (note 50):
  - **`scripts/migrate-workspace-files-kv.ts`** moves every program saved before phase 2 into R2 and rewrites its record as a manifest: workspaces, approvals, both review queues and snapshots.
    - It's a dry run by default. `--write` needs `--backup-dir`, production needs `--confirm` (a dry run too), and `--only` limits it to one workspace.
    - Each result is checked with the API's own reader, and every approval's re-review answer must come out unchanged.
    - A full local dry run: 399 records, 0 errors.
    - Until it runs, the server reads a record from before phase 2 as just `main.pathogen`.
  - **`scripts/copy-approval-cards.ts`** gives each approval made before this its card image. Run with `--dry-run` first; a non-local API needs `--confirm`.
  - **Removing the re-review entries of private workspaces** that an older server left. Until then, the review screen withdraws each one when an admin acts on it.
- **Scripts:**
  - `export-workspace-sources.ts` reads files from R2;
  - `backfill-approval-svgs.ts` compiles the main with its imports;
  - `backfill-publication-state.ts` keeps `cardAt` and `ownerHandle`;
  - the older KV migration scripts and `migrate-viewbox.ts` leave records that hold files alone;
  - `npm run build:playground:dev` and `npm run build:website:dev` build against the local API, with no variable typed in front.
- **New files:**
  - the engine's `src/workspace/files.ts`, `src/host/memory-host.ts`, `src/host/move-imports.ts` and `src/parser/module-source.ts`;
  - the API's `website/api/workspace-files.ts`, `file-store.ts`, `workspace-store.ts`, `review-changes.ts` and `approval-card.ts`, and the Pages worker's `website/approval-source.ts`;
  - the playground's components `file-tree`, `editor-tabs`, `editor-zero-state`, `program-chip`, `canvas-panel`, `clash-prompt`, `shared/confirm-dialog` and `shared/source-files` (one viewer for code that's shown but not edited);
  - its services `workspace-files`, `workspace-modules`, `workspace-edits`, `workspace-apply`, `open-files`, `program-list`, `program-drawings`, `error-place` and `uploads`.
- **Tested:**
  - Each step wrote its tests first and ran the full suite (9,375 tests at step 6).
  - Each feature commit had a code review.
  - Each step had a browser check against `npm run dev:stack`, in light and dark (`project-docs/modules/verify/`).
  - The two preview fixes (c3b63c8, 90997bc) were measured in full Chrome at 2× (`project-docs/preview-raster-perf/`: `verify-preview-layer.ts`, 15 checks, and `verify-option-1.ts`, 23).

### Changed

#### Core

- **The message for an import with no project folder** now reads `Cannot import "./parts/gears.pathogen": this program has no project folder to read files from. Imports work in a saved playground workspace, the CLI and VS Code.` It shows for an unsaved scratch buffer, and for a library caller that passes no `modules`.

#### Language services

- **Hover on `module;`** reads "Makes this file a module, which other files can import". It said "a library other files can import".

#### Playground

- **The layout has no footer.**
  - Background, Grid and Precision are in a **Canvas** section at the top of the inspector.
  - The preview fills its pane, with no card around it, so zoomed-in art runs edge to edge. Fit leaves a margin.
  - The minimap is gone, and the fullscreen button takes its corner. The docs book is at the end of the tabs.
  - Copy SVG copies the drawing's own viewBox, as Export does; it used to copy the view on screen.
  - A link saved zoomed in opens slightly wider than before.
- **Copy URL has left the workspace's menu;** links copied before still open. **Copy Code has left the breadcrumb,** replaced by the icon at the end of the tabs.
- **Blog embeds copy from the code panel.** Copy has left the control bar; the panel's icon copies the code while the code is open.
- **Copy Workspace is the owner's,** signed in or not. Anyone else copies a public workspace with Open as new workspace on its public page, which takes the approved files. That form now reads like Copy Workspace: "Copy Workspace", "Creating a copy of …", and no starting template.
- **Someone else's public workspace no longer opens in the playground.** It used to open from an old link, or from a card on Explore, a profile or Featured whose workspace has no public page to link to. Now it says "You do not have access to this workspace", as a private one does.
- **Make private stays in the menu while an edit waits for review,** with "An edit is waiting for review" under it, in the workspace's menu and on the Workspaces page. Before, the menu showed "Pending re-review", off, and Make private wasn't offered there.

#### Documentation

- **docs/projects.md:** a workspace is a project folder. `/` paths start at its top, the preview shows the program chosen with its chip, it holds `.pathogen` files only for now, and it writes its own `entryPoints`. An unsaved scratch buffer (code opened from a link, not yet saved as a workspace) can't import, and the page says how to copy it into one.
- **docs/modules.md:**
  - imports work in a saved workspace, with rechecking and errors in other files;
  - the "No project folder" error row is for an unsaved scratch buffer, with the new message;
  - "module" replaces "library" in five sentences.
- **docs/snapshots.md:**
  - every file as drawn, and the program that drew it;
  - the code panel's list and copy icon, which replace Copy code;
  - Start new workspace copies the files and opens on the main;
  - Export's legend is the drawing program's file;
  - "Up to 1 MB of edits not saved yet";
  - no snapshot without a program.
- **docs/publishing.md:**
  - the menus' real names, Make public and Make private. It said "Publish workspace" and "Unpublish workspace", and named a form option that doesn't exist;
  - Make public saves, then checks the main with its imports;
  - the reviewer sees every file;
  - re-review only while public, at the next save after any change to the files, folders or program list; withdrawn by Make private or by undoing your edits, with "An edit is waiting for review"; what a rejected re-review looks like;
  - edits made while a submission is pending aren't part of its review;
  - renaming, a description or a thumbnail don't send it for review on their own;
  - the URL comes from the name as submitted, so a rename changes it at the next approval (it promised a permanent URL);
  - the card image frozen at approval;
  - the public page's View source and Open as new workspace;
  - "approved version" where it said "snapshot".
- **docs/exporting.md** points Precision at the inspector's Canvas section.

### Fixed

#### Playground

- **Heavy drawings no longer stall the editor.** Two changes, measured in full Chrome at 2× on a workspace of several thousand path layers, each with a drop shadow:
  - **The preview's drawing keeps a compositing layer of its own.** Any repaint around the preview (a tab, the breadcrumb's file name, the program chip) used to redraw the drawing. Switching tabs or opening a file took 1.9 s; now it takes no measurable time. Blog embeds, the snapshots page and the review screen get the same layer.
  - **Files, Console and the inspector slide past a still preview.** The panes used to animate their widths, which resized the preview and redrew the drawing on every frame. Files and the inspector took 7 to 8 s, and Console 2 s; now each takes no measurable time.
    - On wide screens, the editor keeps its width and the preview takes the room left.
    - The drawing moves into that room 80 ms after the panes stop, in 250 ms with no redraw; with reduced motion, it jumps.
    - An ordinary drawing is then redrawn to fit. A heavy one keeps its picture, never enlarged, until a compile, a pan or zoom, Fit or fullscreen redraws it.
    - On screens 800 px wide or less, in fullscreen and in blog embeds, nothing changes.
- **Make public saves your latest edits first,** and waits for any save still out. Before, it submitted the last saved version, so an edit made within autosave's delay wasn't what the reviewer saw. A save that fails submits nothing and says why. Make public then checks the main with the files it imports, as the preview compiles it.
- **The menu's publishing state follows each save,** not only a reload. Once an edit to an approved, public workspace is saved, the menu shows that it waits for review. Undoing back to the approved files clears that, with no reload.
- **The Workspaces page's Make Public follows the workspace's state.** It ignored the pending, rejected and re-review states, and marked the card public on its own. Now it runs the breadcrumb's check, keeps the state the server answers, and says "Pending Review", off, while a submission waits.
- **Copy says "Copied" only once the clipboard has the text.** The breadcrumb's Copy Code and the snapshots page's Copy code said "Copied!" whatever happened.
- **The snapshots page:**
  - renaming a snapshot updates the viewer's title at once; it kept the old name until another snapshot was chosen;
  - ← and → no longer jump to another snapshot while you're in the code panel.
- **Messages such as "Workspace not found" stay until another workspace loads;** the next compile used to wipe them.
- **A save as you leave the page, for a workspace over 64 KB,** goes as an ordinary request. The browser refuses a page-closing (`keepalive`) request that large.
- **The public page's code view follows a theme change** made after the page loads.
- **The review screen (admins) in the dark theme:** its error panels, badges and Reject buttons have dark colours. The primary button's text is now dark on the dark theme's light orange, where white was hard to read.

#### API

- **Explore's cards no longer show edits waiting for review.** Explore, the profile page, Featured and the public page's image used the live thumbnail. It follows the owner's edits within about 10 minutes, though docs/publishing.md promised a stable image.
  - Approve now copies the thumbnail as the approval's card, and every public page shows the card. The copy is the thumbnail at the moment of approval, so it can include edits made after submitting.
  - Regenerate and Set thumbnail on the review screen write the card. They used to write the owner's live thumbnail from the approved files, over the owner's own.
  - An approval made before this shows the live thumbnail until the one-time copy reaches it (Development).
- **Re-review is only for a public workspace.** After Make private, the next edit queued a re-review, and approving it **made the workspace public again**, against the owner's choice. Now an edit to a private workspace queues none. On an approved, public workspace, any change to its files, folders or program list sends it back for review at the next save: an edit to any file, a file added, renamed, moved or removed, an empty folder added or removed, or a change to the main or the programs' order. Each of these withdraws a waiting re-review:
  - Make private;
  - a save whose files are back to the approved ones;
  - an admin's Unpublish or Flag;
  - Requeue.

  A re-review left waiting for a workspace that isn't public is withdrawn when an admin acts on it: 409 `{ withdrawn: true }`, and the review screen says why.
- **Approve could approve files nobody had looked at.** A save replaces a waiting re-review, so an admin could approve the newer files with the older drawing. Approve and Reject now send the version the admin saw. A newer one decides nothing, and the screen says "This submission changed after it was opened. Review the version waiting now."
- **A public workspace's live files were readable by anyone,** edits waiting for review included, through `GET /workspace/:id`.
  - That route and the file route are now the owner's (signed in, or by the browser's id) and the admins' (by token, or a signed-in session in `ADMIN_EMAILS`). The copy route is the owner's and a signed-in admin's: a token has no account to copy into.
  - Visitors read the approved files through `/approval-source/:id` and `source.json`.

#### Documentation

- **docs/exporting.md gave `--to-fixed <N>`,** which the CLI refuses (`Unknown option`). It now says `--to-fixed=<N>`, and docs/cli.md gains "Round the numbers", which documents the flag.
