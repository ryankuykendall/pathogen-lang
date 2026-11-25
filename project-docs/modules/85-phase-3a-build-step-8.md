# Phase 3a, step 8: the carriers (build record)

The plan is note 83. Step 8 goes in parts; each is committed on its own.

## 8a: uploads and a project's import (2026-11-24)

The user, after the first push (note 84): "Let's push what we have then move onto step 8."

**What changed**
- `services/uploads.ts`: `canHold` (a .pathogen file or a data file; never a `pathogen.json`, though it ends in `.json`); `kindReason` gives the docs' sentence (`WORKSPACE_KINDS_HELD`); `tooLargeReason(name, bytes)` and `overLimit` go by the file's kind (1 MB, 5 MB), in the docs' words (`6.2 MB, more than the 5 MB a data file can be in a workspace.`); `textOf(bytes, name)` says "isn't UTF-8 text, so it can't be a data file" for a data file.
- `services/workspace-edits.ts`: `planUpload` refuses an upload that would take the workspace past 50 MB (`A workspace can hold at most 50 MB: its files are 45 MB, and the upload would make them 55 MB.`), replaced files counted as replaced, with save-limits' length × 3 shortcut.
- `services/project-import.ts`: the upload's rules; a 50 MB refusal before reading, beside the 20-file one, both counting `.pathogen` and data files together and not what's left out; `dataFiles` in the plan, never programs or modules; "There’s no file here that a workspace can take" (the import can be all data now).
- `new-workspace-view.ts`: the card lists the data files after the modules, with the braces and `data` (mockup v2 4a).
- `file-tree.ts`: Upload files…'s picker offers `.pathogen` and the data extensions (`DATA_EXTENSIONS`).
- **New: `services/workspace-create.ts`**, `createWorkspace`. A create's body is capped at 24 MB, and an import (or Open as new workspace) can bring 50 MB. Past the cap, the workspace is created without its largest data files; each is stored on its own (`PUT /workspace/:id/file`), then one save names every file by its hash (the create's answer carries the hashes). A failure after the create deletes the workspace. This is the route the server's own 413 gives. The import and Open as new workspace both create through it.

**Checks**
- Tests: uploads (the docs' reasons, data files in, never a program, 50 MB in bytes not characters), the import (data rows, both limits, `pathogen.json`), the page (the data row and its icon, the created body), the tree (the picker's list), and `playground-workspace-create.test.ts` (the split, a `.pathogen` file never waits, a failure deletes).
- Full suite 282/282 files; the commit's tree alone 280 passed, 2 skipped.
- `verify-3a-step8a.ts`, 23/23 on the dev stack in both themes: an upload of `sizes.json` with a 6.2 MB data file and a `.txt` left out, saved outside the program list; the import card (screenshots beside mockup 4a); a created workspace whose main draws from its data file; a 27 MB project created through the split (the API log: `POST /workspace`, `PUT …/file`, `PUT /workspace/:id`), every file whole.

**Review** (code-reviewer): approve, nothing serious. Taken: a comment on the kind fallback in `tooLargeReason`, a two-byte 50 MB test, and a comment that a file found not to be text only when read has counted toward the import's limits (the docs' "not counting what's left out" is about what's left out before reading; a binary `.json` that tips a project over is the rare case). Not taken: `pathogen.json`'s own "isn't text" message, which `textOf`'s wording doesn't reach.

**Left for the rest of step 8**: note 83's rows for the source readers (Open as new workspace reading deferred files by hash first, View source, the review screen, the admin views), snapshots, Make public's check, and the round trip.

## 8b: the admin side reads deferred files (2026-11-24)

The order of the rest of step 8, from the advisor: what's broken in production first. The review screen was: `reviewCompileInput` read a deferred file as `''`, so a submission whose drawing needs a data file past the answer's 2 MB would be approved with a wrong drawing, or none.

**What changed**
- **New: `utils/deferred-files.ts`**, DOM-free (the backfill script imports it): `readDeferredFiles` reads each deferred file by its hash, once a hash, four at a time; one that can't be read is marked `unreadable`, and `failed` says why. `isDeferred`, `fetchReader` (the server's `error`, never the URL, in a thrown message).
- `utils/review-entry.ts`: `ReviewFile` has a `deferred` variant; `withFilesRead(answer, read)`; `unreadableFiles` and `reviewCompileInput` count any file without its text as unread, so a deferred file is never compiled as empty and Approve stays off.
- The admin readers, each through `GET /workspace/:id/file/:sha256` (an admin reads any file the workspace ever named): the review screen's source, the Approved modal, Regenerate and Set thumbnail (`admin-moderation-view.ts`, the session cookie); the thumbnail tool (`admin-thumbnails-view.ts`, the token); `scripts/backfill-approval-svgs.ts` (the token).
- `services/workspace-files.ts`: the owner's `withDeferredTexts` is built on the same reader. Its message is the same; it now names the first failing path in path order, after every read has finished (before: the first to fail, at once).
- `SnapshotFiles`' type has the `deferred` variant; the snapshot viewer shows such a file as unreadable until 8c reads it (it showed it as unreadable before too, by a looser test).

**Checks**
- Tests: `playground-deferred-files.test.ts` (once a hash, failures marked with why, four at once, `isDeferred`, `fetchReader`), a deferred case in `playground-review-entry.test.ts` (never compiled as empty; read, it compiles; a failed read keeps it off).
- `verify-3a-step8b.ts`, 5/5 on the dev stack as the seed admin: a workspace whose main draws from `data/a.json` (1.5 MB) and `data/b.json` (1 MB, so deferred, as the review source confirms); the card draws both circles with Approve on; Approve's SVG has both; the backfill script regenerates it reading `b.json` by hash.

**Review** (code-reviewer): approve, nothing serious; every admin path covered; the token never reaches a message.

## 8c: a public workspace's data files, for a visitor (2026-11-24)

**What changed**
- **The viewer** (`<source-files>`: the public page's View source, the snapshots page, the review modal): a `data` kind, with the braces in the list and the header, and its JSON highlighted with the editor's own JSON tokenizer, made from the same `@codemirror/language` (a second copy from the CDN would be refused by CodeMirror). A data file with a line past 20,000 characters is shown plain and unwrapped, as the editor shows it (`LONG_DATA_LINE` and `longestLine` moved to `cm-json-language.ts` for both). pathogen.json, which the viewer highlighted with Pathogen's parser, is now highlighted as JSON.
- **A file's kind** (`snapshot-viewer-files.ts` `sourceFileKind`, shared with the public page): a data file by its extension, the engine's `workspaceFileKind`, never parsed with `isModuleSource` (it can be 5 MB). The small highlight bundle exports `workspaceFileKind` for the public page. Before its text comes, a data file shows the braces already.
- **source.json** (the Pages worker) names its `workspaceId` (already public: the page's image addresses carry it), so the page can read a deferred file from the API's public `/approval-source/:id/file/:sha256` (`readApprovalFiles`, cookies omitted).
- **View source** (`detail-source-mount.ts`): the files show once every deferred one is read; one that can't be, or a source.json cached from before it named its workspace (up to a minute), fails the load with the viewer's Try again.
- **Open as new workspace** (`new-workspace-view.ts`): reads deferred files first; the copy holds every file whole or isn't made ("Failed to load workspace: data/b.json couldn’t be read (File not found).").

**Checks**
- Tests: the data kind and its braces before the text; a deferred file read from the approval route, and a failed read or a source.json without its workspace failing the load (`playground-detail-source-files`); never parsed (`playground-snapshot-viewer-files`); Open as new workspace's copy and its failure (`playground-new-workspace-copy`); source.json's `workspaceId` (`pages-detail-source`).
- `verify-3a-step8c.ts`, 11/11 on the dev stack: a workspace approved through the admin route, `b.json` (1 MB) deferred in source.json; View source signed out, light and dark: both data files with the braces, `b.json` whole and highlighted (screenshots in `3a-step8c/`); Open as new workspace signed in: the copy holds `b.json` whole and draws both circles.
- The dev stack was restarted for this: wrangler's Pages server bundles its worker when it starts, so a rebuilt `_worker.js` isn't served until then.

**Review** (code-reviewer): approve, nothing serious. Taken: a highlight bundle cached from before data files would parse a 5 MB data file as Pathogen on the main thread, so a text past 1 MB (more than a .pathogen file can hold) is no longer parsed (`sourceFileKind`); the viewer's language choice is a pure function, `viewerLanguage`, tested with the long-line case; `readApprovalFiles` tested directly (no cookies, the address, a missing workspace, a failed read). Not taken: a file whose kind changes while its text stays the same keeps its highlighting (only an empty file could); a re-approval within source.json's minute of caching can 404 a file by its old hash, which shows "didn't load" with Try again and heals.

## 8d: the owner's snapshots and Make public (2026-11-24)

**What changed**
- **The snapshots page** (`workspace-snapshots-view.ts`): a snapshot's deferred data files are read by their hash (`snapshotApi.fileText`, `GET /snapshot/:sid/file/:sha256`, the owner's route) before its code panel shows them; one that can't be read says so in its place, and the page reads again next time rather than keeping that.
- **Make public on the Workspaces page** (`landing-view.ts`): the check read the workspace without its deferred files (`workspaceFromAnswer` keeps only files with text), so a main that imports a data file past the load's 2 MB failed the check and Make public was refused. It reads them first (`withDeferredTexts`); a file that can't be read says so, as any failure there does. The breadcrumb's Make public checks the editor's own files, which the load has read.
- **A snapshot's save: no change.** It sends saved files by their hash and only text not saved yet, up to 1 MB, as docs/snapshots.md "Limits" says of every file. A data file the load read by its hash is known to autosave by that hash, so it goes by hash.

**Checks**
- Tests: deferred cases in `playground-make-public.test.ts` (read by its hash, the check compiles with it; a read that fails is said, naming the file, and nothing is submitted).
- `verify-3a-step8d.ts`, 7/7 on the dev stack: the workspace opens and draws from `b.json` (deferred); a snapshot taken from the breadcrumb is saved, holding `b.json` whole, which its files answer leaves deferred; its page shows `b.json` whole, as data, highlighted, in both themes (screenshots in `3a-step8d/`); Make public passes its check and submits.

**Review** (code-reviewer): nothing serious; no reader of a snapshot's or the owner's files missed (Start new workspace from a snapshot copies on the server; the breadcrumb's Make public, the precheck and Download read the editor's files, which the load read); the save-side reasoning holds. Taken: a comment on the cast in `_loadFiles`, and the failing-read test for Make public. Not taken: a page-level test of `_loadFiles` with a failed read (the browser check covers the read; the not-keeping is two lines).

## 8e: the round trip (2026-11-24)

Note 83's last row: done when each carrier round-trips a workspace with data files. `verify-3a-step8e.ts`, 12/12 on the dev stack, one workspace (a main importing a module and `data/a.json`, 1.5 MB, and `data/b.json`, 1 MB, deferred; an empty folder), each copy compared with it file by file, by sha256:
- **Download workspace**: the .zip holds every file whole, the empty folder and pathogen.json; the CLI compiles the unzipped folder, reading both data files (`M 30 50 a 10 10 … M 105 50 a 25 25 …`), the CLI side of three-surface parity for data imports;
- the .zip **imported** as a new workspace; **Copy Workspace**; a **snapshot** then **Start new workspace** from it; **Upload files…** of the unzipped data files; **Open as new workspace** after approval: the same files, each.

No code changed for 8e. Step 8 is done; what's left of 3a is step 9 (note 76): the three-surface comparison, the CHANGELOG (for the user's approval), the npm package and the VS Code extension. Noted, not changed: the owner's load now reports a lost file after the other reads finish; a record with a file carrying neither text nor a mark (none since 2e step 5d) now keeps Approve off rather than compiling it as empty.

## Pushed (2026-11-25)

The user: "Go ahead and push." 8a to 8e touch nothing under `api/`, `website/api/` or `website/auth/`, so one `git push origin main` (75a7a2dc..ac20def9), Pages only, no API deploy. Read-only checks of production (`tmp/phase3/prod-step8-probe.ts`): `/utils/deferred-files.js` served; the homepage and /explore 200; three public source.json answers each name their `workspaceId`.

## The 50 MB refusals in the docs (2026-11-25)

The user: "Yes, please add the three 50MB refusal messages." docs/workspace-files.md "Limits" quotes each as built: the save's in the error panel under the file being edited, the upload's under "Nothing was added", the import's on the New Workspace page. Their wordings differ ("a workspace can hold", "can hold at most", "holds at most"); the docs quote them as they are. Content review: `reviews/phase-3a-50mb-docs-review.md`. Pushed 522aca07 at the user's word.

Then the user: "make the import message change". The import's two refusals (20 files, 50 MB) say "A workspace can hold at most …", as the upload's, New program's and the server's do; `project-import.test.ts` and the docs' quote follow. The 2g mockup's copy (`mockups-2g-project/shoot.ts`) is left as it was shot.

## Files a PUT stores that no save names (the user asked, 2026-11-25)

Checked for the explanation: deleting a workspace removes every file stored under it (`deleteWorkspaceFiles`, by the workspace's prefix), so such a file lasts only as long as its workspace, and a create that fails after its PUTs (`createWorkspace`) deletes them with the workspace. The user: "hold off on the clean-up script for the moment (save this as a follow-up on our list.)" Recorded in `backlog.md`, Storage, "The sweep".
