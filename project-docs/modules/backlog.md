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

### Count how often a workspace hits the 20-file limit
- **What:** a count of the uploads (and New program, New module, Duplicate) refused because the workspace would pass 20 files, so the limit can be raised when people bump into it (note 50: the limit was set "to see if we have users who bump up against this limit").
- **Today:** the refusal is a toast ("A workspace can hold at most 20 files: this one has 18, and the upload would make 23.") and nothing is recorded. The app has no usage counting of any kind.
- **Needs:** a small way to count events: a counter the API Worker keeps (a D1 table or a KV counter, per day, no user data), and a call from the playground when the limit refuses something. A privacy note in the docs if anything about a user is kept.
- **From:** your answer on step 6a, 2026-11-13: "That's fine, although it would be beneficial to log how often this happens at some point."
- **See also:** "Usage events: what Cloudflare offers" below. That research comes first and may replace the counter described here (2026-11-14).

### Usage events: what Cloudflare offers
- **What:** research, after the first release: does Cloudflare have a product that stores usage events, summarizes them and draws dashboards for us, so we don't build our own counters?
- **Events in mind:**
  - uploads refused by the 20-file limit (above);
  - snapshots refused by the 50 MB image cap ("Snapshots over 50 MB", below).

  Both are refused in the browser, so each needs a call from the playground to the API Worker.
- **Start with:** Workers Analytics Engine, which, as far as I know, takes custom events written from a Worker and answers SQL queries over them. Not checked yet: what it charts on its own, how long it keeps data, and what it costs. Also needed: a privacy note in the docs, if anything about a user is kept.
- **From:** your answer 7 on note 58, 2026-11-14: "I have identified two scenarios where we might want to capture analytics/telemetry events based on user behavior. Does CloudFlare provide some kind of product for this particular need that we could integrate with, and that would do all of the data storage, summarization, and dashboarding on our behalf? Let's create a follow-up item to do this research after we do the initial release."

### A console "mole", with the errors in it
- **What:** the console as a narrow bottom sheet over the workspace, like Gmail's chat "mole", instead of a pane in the row. It could also take in the error panel, so logs and errors are one place.
- **Today (from 2026-11-16):** the preview pane is the gap the other panes leave, and the editor keeps half the room the tree leaves (`project-docs/preview-raster-perf/`, option 1, 90997bc). The console is a 280 px pane after the editor. With the tree, the console and the inspector open, the preview is 0 px wide on 1024 and 1280 px windows, 73 px at 1440 and 193 px at 1680 (`measure-gap-widths.ts`). You chose to leave it that way until the mole (2026-11-16: "Leave it until the console 'mole'").
- **Needs:** a mockup first: where the mole sits, how it opens and resizes, and how errors show in it.
- **From:** your answer 5 on the option 1 mockup, 2026-11-16: "Perhaps we should try to pull the console out of flow as well. In Google's GMail, they have a UI view component call a 'mole'… I think that as a follow-up we should consider mocking up a version of a 'mole' style console, perhaps one that ultimately also combines absorbing errors as well into a unified interface. For now, we will just have to be limited to 72px of viewspace until we are able to circle back on mocking up the new console mole."

## Publishing and snapshots

After the first release (phase 2 ships with 2e). Each entry comes from your answers on note 58.

### Publish every program's drawing
- **What:** publishing makes a drawing of each program in `pathogen.json`'s list, and the whole set is what's published: the card, the public page, the review.
- **Today (the first release):** publishing shows the main. The card is the main's drawing, the public page draws the main with its imports, and its source is every file (note 58, answer 1).
- **Needs:** a design: how Explore and the public page show several drawings, and how the review screen approves them. The thumbnail render queue (Playground, above) could make each image.
- **From:** your answer 1, 2026-11-14: "For the initial release, we can limit publishing to just the image generated from the first entrypoint (main) in the workspace. However, for a future release, we should actually be generating images for each entrypoint and making the whole collection the published artifact."

### Publish from a snapshot
- **What:** publishing is an explicit action on a snapshot, or makes one when you publish. The snapshot is the record of the code and the image that were published.
- **Today (the first release):** Make public freezes the workspace's last saved files for review. Any later change to an approved workspace's files sends it back to review (note 58, question 2).
- **Needs:** a design round:
  - where the action lives (the snapshot panel, the snapshots page);
  - what re-review becomes;
  - what happens to Make public and Make private;
  - how existing approvals move over.

  A snapshot already keeps a card image, and from 2e every file as drawn and which program drew it. So it could hold the frozen card that note 58's question 9 is about.
- **Then also:**
  - bring back the review modal's ↗, hidden in 2e, as a Start new workspace from the snapshot under review, with every file (note 60, your answer 2, 2026-11-14: "suppress the button for the time being, but bring it back at the point where we move publishing to point at a specific snapshot");
  - **edits made while a submission is pending.** Today they aren't reviewed until the next save after approval (docs/publishing.md). Revisit this when publishing points at a snapshot (note 58, "Step 7, done", your answer 2, 2026-11-17);
  - **what a never-approved Rejected or Flagged card opens.** Today its modal says "No approval record". You expect option 2 of note 58's question (keep what was rejected), with the rejected snapshot as that record (your answer 4, 2026-11-17).
- **From:** your answer 2, 2026-11-14: "I am starting to feel like we should only allow publishing from a specific snapshot (or, when whe publish, we would simply create a snapshot as the reference for the state of the generated image and the code at that point in time.) Publishing should be an explicit action, and I would like to see this workflow changed. Let's add this as a post initial release follow-up."

### Snapshots of every program
- **What:** a snapshot can keep the drawing of each program in the list, not only the one the preview shows.
- **Today (2e):** a snapshot keeps the drawing the preview showed, every file as it was then, and which program drew it.
- **From:** your answer 3, 2026-11-14: "We can then circle back at a later point to determine whether we want give the user the ability to snapshot the results of each entrypoint."

### Snapshots of a program that isn't the main
- **What:** note 58's question 4:
  - **(a)** the snapshot panel names the program under its thumbnail (`demos/gears.pathogen`);
  - **(b)** the snapshots page labels it;
  - **(c)** "Start new workspace" opens the new workspace showing that program;
  - **(d)** "Copy code" copies that program's file.
- **Today:** what 2e does for such a snapshot is note 58's question A.
- **From:** your answer 4, 2026-11-14: "Let's hold off on this until a future release based on my answers above."

### Copy for the code examples in the docs and the blog
- **What:** the code examples on docs and blog pages (code blocks, not the embeds) get the same copy icon as every code panel in 2e: at the top right of the example, copying its text, with "Copied" only once the copy has worked.
- **Today:** they have no copy at all. 2e puts the icon in the workspace, the snapshots page, the review modal, the public page and blog embeds (notes 61 and 62).
- **Needs:** the docs build (`scripts/build-docs.ts`, the static page and the docs panel) and the blog build (`scripts/build-blog.ts`) to emit it, and a small shared script to run it. The blog can't be rebuilt while blog edits are in progress in the working tree.
- **From:** your answer on v13, 2026-11-14: "Per the code examples in the doces and blog pages, let's add that as another follow-up item we need to revisit after the initial release."

### Line-by-line differences on a re-review
- **What:** in a re-review, each changed file shows what changed in its text, line by line, against the approved version.
- **Today (2e):** a re-review marks each file new, changed, moved or removed, with a line for a new main and for a folder added or removed. The marks come from comparing the two manifests by hash, without reading any text (note 59, question 4).
- **Needs:** the approved and submitted texts of each changed file (the admin can read both from 2e), and a diff view in the review modal.
- **From:** note 59, question 4, agreed 2026-11-14. Line-by-line differences were put on the backlog there.

### Public workspaces from before reviews
- **What:** 16 of your own early workspaces are still listed on Explore (places 21–36) but were never reviewed. Each has no approval record, `isPublic: true` and an index entry without an owner handle (note 58, "The count").
- **Today (from 2e):**
  - only the owner can open `/workspace/…`, so a visitor clicking one of these cards gets "You do not have access to this workspace";
  - Make public does nothing for them, since `updateWorkspace` submits only when the record isn't public (`router.ts:618`).
- **The fix, built and rehearsed but not run:** `tmp/2e-step8/unpublish-unreviewed.ts`, not committed; note 58 has its design and its dev rehearsals. It calls the existing admin Unpublish for each Explore entry without an approval: off Explore, `isPublic` false, and Make public works again. It needs the production admin token.
- **Not done:** a read-only scan of every production workspace for others in the same state that aren't on Explore. Their owners' Make public is stuck the same way.
- **Could go with it:** a visitor at an approved workspace's playground link goes to its public page instead of "no access". That doesn't help these 16, which have no public page.
- **From:** your answer, 2026-11-17: option 2, leave them as they are.

### Snapshots over 50 MB
- **What:** a way to snapshot images larger than 50 MB. You've seen an SVG of 80 MB.
- **Today:** the browser refuses before uploading: "This render is … Snapshots are limited to 50 MB. Try a lower Precision, or export it directly." (`playground/services/snapshot-controller.ts:213-220`). The server checks the same limit (`SNAPSHOT_LIMITS.svgBytes`, `website/api/snapshots.ts`). Nothing records a refusal.
- **Needs:**
  1. first, a count of refusals ("Usage events", above);
  2. then a way to take larger uploads. The Worker reads the whole form with `request.formData()`, and a 49 MB upload was checked only against the local runtime.
- **From:** your answer 7, 2026-11-14: "although that are some snapshots that get quite large (where the SVG was as large as 80MB)...we don't have to accommodate that immediately, but we might want to log when users try to snapshot an image result that exceeds our cap." Later the same day: "50MB for a snapshot's image is a fine limit." So this waits until the refusal counts say otherwise.

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

### The inspector's one-time freeze on its first close
- **What:** find out why the first inspector toggle after the drawing is redrawn redraws part of the drawing, and stop it.
- **Today:** 0.17–0.31 s on kablammo-investigations (thousands of drop-shadow layers), once: on the first close (or, if the inspector is toggled first, the first open) after an edit, a pan or a zoom. Later opens and closes cost nothing.
- **Known:** it's GPU raster of part of the drawing, with the main thread idle. Hiding the drawing removes it. Hiding the inspector's contents, turning the grain off and hiding the preview's layers button don't. Which tiles are redrawn isn't known: the traces didn't record Chrome's tile details. `project-docs/preview-raster-perf/README.md`, "The inspector's one-time freeze"; `measure-overlay.ts` has the flags used.
- **From:** your answer on the option 1 build, 2026-11-16: "Let's leave 'The 0.17 s on the inspector's first close' for another follow-up."

### Cache parsed modules across compiles in VS Code
- Keyed by content hash. Only if large projects get slow (plan 12 follow-ups).
