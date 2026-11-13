# Modules backlog

Deferred work from the modules, data and files effort. Each entry says what it is, where it stands today, why it waits, and where it came from. Status of the effort as a whole: `37-roadmap-status.md`. Add new entries at the end of their section; mark done ones with the commit rather than deleting them.

## Editor

### Rename and find-references across files
- **What:** F2 on an imported or exported name renames it in every file that uses it; Find All References lists uses in every file of the project.
- **Today:** F2 on a shared name is refused with the reason (`gear is imported from parts/gears.pathogen. Renaming across files isn't supported yet: rename it in each file.`), so it never renames half the uses. Find All References covers the current file. Same in VS Code and the playground.
- **Needs:** an index of every `.pathogen` file in the project folder. A start exists: the language server lists the project's modules for path completion (`listProjectModules`, `DocumentModules.listed`).
- **From:** plan 12 decision 25 ("1b"). Put on the backlog by you on 2026-11-05 ("YES, let's add this to the backlog").

### Imports follow a file renamed in VS Code
- **What:** renaming or moving a `.pathogen` file in VS Code's explorer updates the imports that name it, and the moved file's own `./` and `../` imports, as the playground does (`docs/workspace-files.md` "Renaming, moving and deleting").
- **Today:** the engine has the edits (`importEditsForMoves`, `src/host/move-imports.ts`, 2d step 1); only the playground calls it. In VS Code a rename leaves the imports as they were, and they show a not-found error.
- **Needs:** the language server's `workspace/willRenameFiles` handler, reading every `.pathogen` file in the project folder (the same index as "Rename and find-references across files" above), and answering with a `WorkspaceEdit`.
- **From:** 2d step 1 (note 52), 2026-11-09.

### Sharing a workspace
- **What:** a way to share a workspace with someone, every file of it, that replaces the old Copy URL.
- **Today:** Copy URL put one program's code in the link (`?state=`), so it can't carry a workspace with several files; it leaves the menu in 2d. Links copied before still open. Publishing to Explore is the only way to share a workspace.
- **Needs:** a design first. Some shapes: a share link to a read-only copy, served by the API with its files; or a fork link like the detail page's "Open as new workspace", for workspaces that aren't published.
- **From:** your answer on 2026-11-09 (note 52): "let's drop copy URL from the menu. We should probably come up with a more robust sharing solution, but we can save that experience for another time."

## Playground

### A render queue for thumbnails, not tied to the preview
- **What:** a service anywhere in the app can ask for a workspace's thumbnail (or another raster size: the hero, a miniature, a snapshot) as a job: which workspace, which program (its main), which files at which content hash. The job compiles that program from those files on its own worker, draws it with the engine (`buildSvgTree` / `generateSvg`, the way the CLI and the admin "Regenerate" path do), rasterizes it, and uploads it. What the user does next (shows another program, switches or leaves the workspace, closes a tab) can't cancel it or change what it draws.
- **Today:** the workspace thumbnail is taken from the preview's live `<svg>`. The idle timer in `services/thumbnail-service.ts` sends `thumbnail-auto-generate`, and workspace-view answers with `previewPane.preview` (`_generateThumbnailFor`), so a thumbnail can be taken only while the preview holds the main's drawing (2d step 5a's `_thumbnailWait`). Leaving the workspace while another program is shown drops a thumbnail that was due; the next edit with the main shown makes it due again. The workspace-switch path has to serialize the outgoing drawing synchronously, before the preview pane is cleared (`buildRenderSnapshots`). The admin "Regenerate" path (`views/admin-thumbnails-view.ts`) already compiles a workspace's code and draws it without the preview, as one program.
- **Needs:** a queue keyed by workspace and content hash (a newer hash replaces a waiting job for the same workspace; one job at a time, as now); the job takes its files from the saved workspace or a snapshot of the store, never the editor; the multi-file compile (`compileAs` with the workspace's files and its main); the hero and the square crop drawn from the same SVG string; the manual Set Thumbnail (with its crop) as a job with a higher priority. Then the preview-tied paths, the `thumbnail-auto-generate` event and `_thumbnailWait`'s "Show the main first" can go. Step 5b's miniature compiles (`programsCompiler`) are the same shape, so the two may share the worker and the drawing code.
- **From:** your note on the 5a report, 2026-11-13: "our current system for generating thumbnails is too tightly coupled to the current state of the app/workspace. It seems like we should have a generally available service inside of our app that allows a job to be enqueued to generate a thumbnail (or other sizes of rasterized preview) regardless of how user behavior or interactions change the state of the workspace."

## Language

### Default import of a drawing
- **What:** `import badge from "./badge.pathogen";` gives that file's drawing as a value to place (decision 5 in `02-decision-log-v1.md`).
- **Today:** any default import is an error that shows the `{ }` and `* as` forms.
- **Open:** the use case. Since step 5e only `module;` files can be imported and modules never draw, so this would mean importing an ordinary program, reopening that rule. It also needs a value type for "a drawing" (placement, layers, ViewBox). SVG import (phase 4) is the closest relative.
- **From:** plan 12 decision 25 ("1b, after a design round"). Delayed by you on 2026-11-05: "I'm not sure I understand the use case for this or believe it is a priority."

### The `demo { }` block
- **What:** a block in a module that runs only when the module itself is compiled, so a library can show itself.
- **Today:** a module's preview is empty, with the notice "This file is a module: a module doesn't draw, so its preview is empty. To see its fns draw, open a program that imports it."
- **From:** the step 5e decision (`23-modules-are-libraries-plan.md`). Delayed by you on 2026-11-05: "I am not sure that we need to focus on the demo block."

### Fn and enum bindings fixed in every file
- **What:** decision 30 option (b): fn and enum names behave like `const` in every file, and enum members can't change. Breaking; needs its own audit and KV check.
- **Today:** imported fns and enums are fixed; inside one file `f = 3` and `Dir["Up"] = "zz"` still work.
- **From:** plan 12 decision 30 (a), "propose separately".

### Positions on every evaluator error
- **What:** errors in the compiled file that have no line today get one, as errors in imported files already do.
- **Why it waits:** it changes error text, so it needs its own audit (plan 12 amendments, "Step 3, positions").

### `@font` file paths follow a moved file
- **What:** when font files can be added to a workspace, moving a file updates its relative `@font "./fonts/…"` paths, and moving a font file updates the `@font` lines that name it, as moving a file does for imports.
- **Today:** a workspace holds only `.pathogen` files, and an `@font` file path in a workspace gets a warning that suggests a Google Fonts family (note 51), so a move can't break one. `importEditsForMoves` (`src/host/move-imports.ts`) rewrites imports only.
- **Needs:** the same edits over `planFontDirectives`' paths, in the same function, when fonts arrive (note 50's data files and fonts).
- **From:** 2d step 1 (note 52), 2026-11-09.

## Bugs

### `star(…)` with a string point count
- `star(cx, cy, r1, r2, 'twelve')` draws `m 0 0 z` instead of failing. Found while checking phase 1a's examples (plan 12 follow-ups).

### A missing enum member is `null`, not an error
- `enum Teeth { Few = 8, Fine = 20 } log(Teeth.Huge);` logs `Teeth.Huge = null` (checked 2026-11-06). A typo in a member name silently becomes `null`. A namespace's missing member is an error that lists the exports; an enum could do the same. Not documented either way (docs/syntax.md "User-Defined Enums"). Found while building the phase 2 v2 mockups.

### A fn that only writes text fails inside a TextLayer `apply`
- `layer('captions').apply { caption(10, 20); }`, where `caption` only calls `text(x, y)`, fails with `Line 10: Path commands cannot be used inside a TextLayer apply block` (checked 2026-11-06, `tmp/phase1/probe-textlayer-fn.pathogen`). docs/layers.md "Restrictions" only forbids path commands (`M`, `L`) there. A bare call statement seems to go through path output. Found while building the phase 2 v2 mockups; `parts/labels`' `caption()` there opens the layer itself to work around it.

### Found in the phase 2 audit (playground and API)
Existing issues outside the modules work, found while mapping phase 2 (`38-phase-2-audit.md`, "Found along the way"):
- **"Copy URL" always opens the create form.** It reads `route.params.id`, but the workspace route's parameter is `slugId`, so every link is `/workspace/new?state=…` (`playground/utils/url-state.ts:105`, `utils/router.ts:39`). Decide what the link should open, then fix.
- **Admin writes can lose a code save.** Unpublish, flag, unflag, requeue and approve rewrite the whole workspace record without re-reading it (`website/api/router.ts:1087-1088, 1417, 1485, 1514, 1563`).
- **Deleting a workspace leaves its thumbnail PNGs in R2** (`router.ts:545-590`).
- **`POST /workspace/:id/copy` copies `flagged`.** The SPA doesn't use it (`router.ts:593-641`).
- **A dead read:** the client reads `workspace.thumbnailContentHash`, which the server never writes (`workspace-view.ts:530`).
- **No server-side limit on workspace code size.**

## Performance

### Cache parsed modules across compiles in VS Code
- Keyed by content hash. Only if large projects get slow (plan 12 follow-ups).
