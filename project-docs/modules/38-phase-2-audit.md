# Phase 2 audit: multi-file workspaces in the playground

2026-11-05. Phase 2 makes a pathogen.studio workspace hold several files that import each other, with a main file, as a folder does for the CLI and VS Code since phase 1a. This maps what today assumes "a workspace is one code string", then lists the questions the mockups and the storage design have to settle. Sources: three read-only surveys of the playground UI, storage and the API, and the playground's compile path (2026-11-05), plus `02-decision-log-v1.md` §16.3–16.6 and `37-roadmap-status.md`.

## Summary

- **The compiler side is ready.** `resolveModules` reads files through any `ProjectFileHost`; `compile(source, { modules })` and the language services take the graph as data. A workspace host is a few lines over an in-memory file map.
- **Everything else holds one string:** the stored record (`code`, one 64-bit `contentHash`, one `rev`), autosave, the store, the editor, the compile call, fonts, the error panel, snapshots, approvals and their review queues, the public detail page, forks, `?state=` links, the export legend, publishing checks and the admin tools.
- **No server code compiles anything** (the compiler bundle is over the Workers size limit), so multi-file compiles happen in the browser everywhere, admin included.
- **Decision 16 needs a second look after step 5e.** It says the preview shows main, with a toggle to pin it to the file being edited. Since 5e a library file (`module;`) never draws, so pinning the preview to it shows an empty page. The pin only helps when a workspace holds several programs.

## What is ready (phase 1a)

| Piece | Where |
|---|---|
| The loader: `resolveModules(source, { host, entry })` → `{ graph, errors }` | `src/host/load-modules.ts:114-191` |
| The host interface: `projectLabel`, `readFile(path)` → `HostReadResult` | `src/host/types.ts:39-43` |
| `compile(source, { modules })`, `getDiagnostics(doc, { modules, loadErrors })` | `src/index.ts:308-313`, `src/language-services/diagnostics.ts` |
| Language services across files: `LanguageServiceOptions { modules, projectFiles }`, `Location.file`, `Diagnostic.alsoIn`, `renameRefusal` | `src/language-services/module-exports.ts` |
| `pathogen.json` v1 `{ main }`, its folder label a workspace name already | `src/host/project.ts:11-24` |
| Exported for the browser bundle: `resolveModules`, `planImports`, `isModuleSource`, `formatModuleLoadError`, `resolveProjectPath`, `parseProjectFile` | `src/index.ts:67-92` |

## The change surface

### Storage and the API (`website/api/`, `api/`)

- **The record:** `Workspace.code: string`, `contentHash = hashContent(code)` (SHA-256 cut to 16 hex characters: fine for dirty checks, too short to address blobs), `rev` bumped on a code change with a `baseRev` 409 check (`types.ts:110-125`, `utils.ts:19-28`, `router.ts:439-464`). The client keeps its own copy of the hash rule (`playground/services/autosave.ts:21-30`), seeded from the server's.
- **Limits:** none on the server for code; the client caps name and description; snapshots cap code at 1 MB; KV's ceiling is 25 MiB per value.
- **Endpoints** (`router.ts`): create, get (live code, public if `isPublic`), update (autosave; when `code` is absent it carries over only `code`/`contentHash`/`rev`, `:488-496`, so a new field must join that list), delete, copy (unused by the SPA, and it copies `flagged`), submit-for-review, snapshots (`snapshots.ts`: one `code.pathogen` per snapshot, `code_bytes` in D1), thumbnails (PNG uploads, keyed by id), admin queues and reviews.
- **Approvals:** `WorkspaceApproval` copies `code`/`codeHash` from its queue entry (`router.ts:1044-1104`). The SVG is compiled in the admin's browser and stored in R2. A save whose hash differs from `approval.codeHash` pushes `queue:rereview`. `queue:review` and `queue:rereview` are one KV array each, every entry carrying its full code, so inlined multi-file code grows them toward the 25 MiB cap. The detail page's approval lookup parses every `approval:*` record per request (`moderation.ts:425-441`).
- **D1:** `workspace_publication_states.code_hash` is append-only, so it will mix hash formats after a migration. `snapshots.code_bytes`.
- **Server-rendered pages** (`website/_worker.ts`): nothing compiles. The detail page reads `approval.code` for its line count, the View source `<pre>` and `source.json` (forks). The Pages worker has no R2 binding, so code in R2 would need the binding or a proxy through the API Worker, as `/approval-svg` already does.
- **Migration precedent:** `scripts/migrate-builtin-names-kv.ts`: four key families, dry run by default, re-read before write, backups, `contentHash` and `rev` recomputed, prod behind `--confirm`. A migration must recompute `approval.codeHash` and `workspace.contentHash` together, or every approved workspace's next save trips re-review. Tests that pin the record's shape: `tests/api/workspace-optimistic-concurrency`, `workspace-publication`, `approval-svg`, `admin-featured-list`, `snapshots`, `workspace-thumbnail-no-clobber`, `anonymous-workspaces`, `tests/playground-workspace-switch-autosave`.

### The playground UI (`playground/`)

- **Layout:** `<playground-main>` is a flex row of editor, console, preview and inspector, with no splitters and no sidebar system; console and inspector open by toggling `.open` (`playground-main.ts:27-123`). Below 800px the panes stack and the inspector becomes a bottom sheet. The error panel is absolutely positioned bottom-left at half the width (`error-panel.ts:96-113`), where a left file tree would sit.
- **Plausible homes:** tabs above `#editor-container` in `code-editor-pane` (it has no header today); a tree as a new first pane in `<playground-main>` with its toggle beside Console in the breadcrumb; a file crumb after the workspace crumb (`app-breadcrumb.ts:210-235`); on narrow screens a bottom sheet or slide-over.
- **The editor:** a document swap installs a fresh `EditorState`, which empties undo (`code-editor-pane.ts:171-206`). The extensions are built once and reused, so one `EditorState` per file would keep each file's undo history.
- **Edit flow:** each change writes `store.code`, then compiles (150/600 ms debounce), autosaves (5 s debounce, 30 s minimum, blur, Ctrl-S, tab hidden, leave), and marks the thumbnail dirty with a third hash of the one string (`workspace-view.ts:585-597`).
- **The store:** `code`, `renderedCode` (pairs a snapshot with its source), the compile result fields, and `currentFileName`, which **holds the workspace name** today and collides with any "current file".
- **Reusable pieces:** tree rows with indentation, chevrons and windowing in `layers-panel.ts` + `utils/virtual-list.ts`; kebab menus (`app-breadcrumb.ts`, `landing-view.ts`); a modal with a name field (`edit-workspace-metadata-modal.ts`); an anchored popover (`snapshot-popover.ts`); a selectable strip with arrow-key stepping (`snapshot-filmstrip.ts`); toasts with an action. Missing: a tab strip, a context menu, inline rename (renames use `window.prompt`).
- **Entry points carrying one string:** `?state=` scratch links, new-workspace templates, `?copyFrom`, forks through `source.json`, `?import=` from blog mini-workspaces, snapshots and their viewer, the export legend's source listing, the publish precheck, debug capture.

### The compile path and language services

- **Compile:** the editor calls `editorCompiler.compileWithContext(store.code, …)` (`workspace-view.ts:1128-1130`). The worker spreads `options` into the compile, so a `modules` option needs no worker change, and structured clone carries the graph's `Map` (unlike VS Code's webview). On failure the worker returns only the message, so cross-file detail (`alsoIn`, the trace) has to come from `getDiagnostics` on the main thread.
- **Where to resolve:** on the main thread, inside `compileAs` before the request is posted, so a superseded compile is dropped by the existing stale check and cancellation needs nothing new. Load errors skip the compile, as the CLI does.
- **Two graphs:** the compile's entry is main; the language services' entry is the file being edited (definition and completion resolve from `graph.entry`).
- **Fonts:** the pre-compile font plan reads only the entry source (`compiler-worker.ts:463-547`). `resolveFontsInFiles` needs a `FontHost` the playground doesn't have, so the playground's own plan → fetch loop runs over every file in the graph instead, as VS Code's font session does.
- **Language services:** every feature builds one `StringTextDocument` and passes no options (`cm-language-services.ts`, `cm-completion-bridge.ts`, `cm-hover-tooltip.ts`). Each needs `{ modules }` (completion also `projectFiles`). Go-to-definition ignores `Location.file`; opening another file needs an "open file at position" entry point. Import-path completion needs bridge fixes: it ignores `CompletionItem.range`, its word pattern excludes `/` and `"`, it has no `file` kind, and its trigger characters lack `"` and `/`.
- **Cost:** `analyzeFile` caches by `ModuleFile` identity and `resolveModules` makes new objects each call, so rebuilding per keystroke re-analyzes every file. Reuse `ModuleFile` objects for unchanged sources; rebuild only when an import line or another file changes.
- **Errors and logs:** `showError` replaces the compile message with `getDiagnostics(doc)` on the open file without options, so in a workspace with imports it would show the no-project-folder error instead of the real one (`workspace-view.ts:1379-1427`). Warning squiggles ignore `w.file`, and console lines print `Line N:` without the file. Nothing is clickable today.

### Other consumers

- **Read the live preview** (inherit whatever it shows): thumbnails, the export modal, the minimap, snapshots. If the preview can show something other than main, these must still use main.
- **Compile one string on their own:** the publish precheck, admin thumbnails, admin moderation, `scripts/backfill-approval-svgs.ts`. A workspace-aware option on `CompilerWorkerClient.compileAs` would serve them all.
- **Blog mini-workspaces** show pre-built SVGs and never compile; "Open in Playground" hands over one string.

### VS Code

The preview follows the active editor and redraws when a file it imports changes (`packages/vscode-pathogen/src/preview.ts`). Nothing in the editors reads `pathogen.json`'s `main`; only the CLI's folder mode does. Previewing a library shows the "a module doesn't draw" notice.

## Found along the way (existing, not phase 2)

| Finding | Where |
|---|---|
| "Copy URL" reads `route.params.id`, but the route's parameter is `slugId`, so every copied link is `/workspace/new?state=…` (the create form) | `playground/utils/url-state.ts:105`, `utils/router.ts:39` |
| Admin unpublish, flag, unflag, requeue and approve rewrite the whole workspace record without re-reading it, so a code save landing in between is lost | `website/api/router.ts:1087-1088, 1417, 1485, 1514, 1563` |
| Deleting a workspace leaves its thumbnail PNGs in R2 | `router.ts:545-590` |
| `POST /workspace/:id/copy` copies `flagged` (unused by the SPA) | `router.ts:593-641` |
| The client reads `workspace.thumbnailContentHash`, which the server never writes | `workspace-view.ts:530` |
| The KV migration scripts filter `workspace:thumbmeta:`; the real prefix is `thumbmeta:` (harmless) | `scripts/migrate-*-kv.ts`, `utils.ts:62-65` |
| No server-side limit on workspace code size | `router.ts` create/update |

## Questions for the mockups

Each has a recommendation; the mockups show it, with the alternatives where they differ visually.

1. **Where the files live in the layout.** (a) A collapsible file tree as the first pane, toggled beside Console; (b) tabs above the editor; (c) both: a tree for the workspace, tabs for open files. *Recommendation: (a), with the open file named in the breadcrumb. Workspaces will hold a handful of files, and a tree shows folders (`parts/gears.pathogen`). Tabs can come later.*
2. **Folders.** Imports name paths like `./parts/gears.pathogen`. *Recommendation: yes, as paths with `/`, shown as a tree, so a workspace and a CLI or VS Code project folder have the same shape.*
3. **What the preview shows (decision 16 after 5e).** (a) Main, with a pin to the edited file, as decided; (b) always main, and any program file can be made main. *Recommendation: (b). Editing a library then redraws main live, which is the point of editing it. A pin only helps a workspace with several programs; it can come later. VS Code could mirror this: previewing a library shows the project's main when `pathogen.json` names one.*
4. **The main file.** How it is marked in the tree, how it changes ("Set as main"), and what a new workspace starts with. *Recommendation: a new workspace is one `main.pathogen`; "New file" offers a library (starting `module;`) or a program.*
5. **File operations.** New file, new folder, rename, move, delete, duplicate. *Recommendation: new, rename (paths included, so a rename can move), delete with confirmation, from a row menu and a "+" in the tree header. Renaming does not rewrite imports in other files (cross-file rename is on the backlog); the error panel then shows the missing import.*
6. **Errors in other files.** *Recommendation: the error panel and console name the file and are clickable (open that file at the line); the tree shows an error dot on the file where it happened (`alsoIn`) and on main; opening that file shows the squiggle at its line.*
7. **Go-to-definition and hover across files.** *Recommendation: Ctrl/Cmd-click on an imported name opens the other file at the name; hover shows "Defined in parts/gears.pathogen, line 8" as in VS Code.*
8. **Undo per file.** *Recommendation: each file keeps its own undo history while the workspace is open (one `EditorState` per file).*
9. **Saving.** *Recommendation: the workspace saves as one unit (all changed files, one `rev`), with one save status, as today. Per-file conflict handling only matters with several editors at once, which the two-tab banner already warns about.*
10. **Which files.** *Recommendation: `.pathogen` only in phase 2. Data files wait for the language changes (37-), but the tree should leave room for them.*
11. **Narrow screens.** *Recommendation: the tree becomes a slide-over from the left, opened from the breadcrumb.*
12. **Sharing and showing a multi-file workspace.** `?state=` links carry one string. The public detail page shows one listing. Forks, snapshots and the export legend copy one string. *Recommendation: `?state=` stays for single-file workspaces; a multi-file workspace shares by its public link. The detail page's View source lists the files with main first. Forks and snapshots carry every file. The export legend prints main.*

## Questions for the storage design (after the mockups)

- **Inline or blobs.** (a) `files: { path: source }` and `main` inline in the KV record; (b) a manifest (path → hash, size) plus content-addressed blobs in R2, the decision log's lean (§12). Inline is simpler; blobs keep queues and approvals small, dedupe snapshots, and match the review-queue size concern. Decide with numbers from today's stored programs.
- **Hashes.** `contentHash` over a canonical form of `{ main, files }`; a full SHA-256 for any blob address. The client and server rules stay identical.
- **`rev`:** one per workspace (recommended above) or per file.
- **Approvals, queues, snapshots and forks** freeze every file (or a manifest). `source.json` returns files. Re-review compares the new hash.
- **Migration:** every stored workspace, approval and queue entry becomes `{ main: "main.pathogen", files: { "main.pathogen": code } }` (or its manifest), hashes recomputed together, through the migrate-builtin-names pattern, prod behind your go-ahead.
- **Limits:** a server-side cap on file count and total size.
- **Docs first:** a published page for workspaces with several files (docs/projects.md "In each tool" and docs/modules.md "In each tool" change too).

## A possible order for phase 2

1. **2a, mockups** in `website/bbwp/`, reviewed with you before any playground code.
2. **2b, docs and storage design**, then the API and the migration (dry run, your go-ahead, write).
3. **2c, the compile path and language services** against a workspace host: compile main, fonts across files, diagnostics, completion and definition across files, file-aware errors and logs.
4. **2d, the UI** from the approved mockups, storybook first.
5. **2e, publishing, forks, snapshots, admin tools and the detail page** carrying every file.
6. **2f, VS Code parity** for what the preview shows.
