# Storage: your decisions, and the plan for the code

2026-11-07, step 2b. The design is `48-storage-design-v2.md`. Note 49 covers the `entryPoints` code and the VS Code fix.

## Your answers, in your words

1. On the VS Code gap: "Fix it before pushing."
2. On the docs text added after your approval: "Approved"
3. On the blob design: "Yes, this sounds correct"
4. On regenerating every hash in the migration: "Sounds good"
5. On names of ASCII letters, digits, `-`, `_` and `.` only: "Yes, that is correct"
6. On the limits: "This should be a fine starting point."

## Decided

| Question | Decision |
|---|---|
| Where file bytes live | R2, at `files/{workspaceId}/{sha256}`. The KV record is a manifest (note 48, sections 1–4) |
| Loading | One request: the manifest plus every `.pathogen` file's text. Other file types, when they come, are fetched on demand by hash and cached for good |
| The detail page and forks | A new API Worker route, `GET /approval-source/:id`, as `/approval-svg/:id` serves the SVG |
| Deleting | Saves never delete blobs. Deleting a workspace deletes its prefix and its thumbnails. A sweep script, run by hand, removes blobs no manifest points to |
| Hashes | One rule for every workspace, regenerated in the migration. The dry run checks that every approved, unedited workspace still matches its approval |
| Names | Letters a–z and A–Z, digits, `-`, `_` and `.`, starting with a letter or digit; 100 characters a name, 255 a path; unique without case; `pathogen.json` reserved; no Windows reserved names |
| Limits | `.pathogen` 1 MB a file; data files 5 MB; fonts 20 MB; 50 MB and 500 files a workspace; folders 8 deep. "A fine starting point" |
| Shipping | Committed locally, held until 2e is done, then shipped with the rest of phase 2 (note 48) |

`docs/workspace-files.md` (not yet published) now states the names and limits.

## The plan for the storage code (2b), held until 2e

Each part comes with its tests in `tests/api/`. The tests that pin today's record shape are named in note 38.

1. **One shared module** for the rules both sides apply: the manifest's canonical hash, the name rules and the limits. The server and the playground import the same file, replacing `autosave.ts`'s copy of `hashContent`.
2. **Types** (`website/api/types.ts`):
   - `FileEntry`, and the manifest fields on `Workspace`;
   - `WorkspaceApproval` holds a manifest;
   - `ReviewQueueEntry` without `code`;
   - the snapshot manifest.
3. **Blob helpers:** put a file after checking its hash, get one, and delete a workspace's prefix.
4. **Endpoints** (`website/api/router.ts`, `snapshots.ts`):
   - create; get, with the inlined text;
   - update, which sends the manifest plus changed text, writes blobs first, and doesn't carry over the unchanged-hash shortcut that drops metadata;
   - `GET /workspace/:id/file/:sha256`; copy; delete;
   - submit and approve, which freeze a manifest;
   - the admin approval read; `GET /approval-source/:id`;
   - snapshots: create, get, and restore into a new workspace.
5. **Old-shape reading** for the deploy window: a record without `files` is read as just `main.pathogen`. A save that sends only `code` is accepted for such a workspace and refused for one with more files.
6. **The detail page** (`website/_worker.ts`) reads the source through the new route.
7. **The migration script:** `scripts/migrate-workspace-files-kv.ts`, after `migrate-builtin-names-kv.ts`.
   - A dry run by default; `--write`, `--backup-dir`, and `--confirm` for production.
   - R2 writes through `wrangler r2 object put --remote`.
   - The dry run includes the false-re-review check.
   - Run against production only with your go-ahead.
8. **The sweep script** for unreferenced blobs: a dry run by default.

The playground's side (the store, autosave, the editor) is 2c and 2d. The review screens, publishing and snapshot UI are 2e.

## Found while building (2026-11-08)

- **Review-queue entries keep a frozen manifest,** not nothing. A queue entry freezes what was submitted ("admins approve exactly what the user submitted, even if the live workspace is edited in the interim", `types.ts`). With `code` gone, it holds the submitted `files`, `folders` and `entryPoints`: about 100 bytes a file, still far from KV's 25 MiB cap. Approving copies that manifest into the approval. The sweep script counts queue entries as references too, so a pending submission's files are never deleted. This keeps the approved intent, a small queue; note 48 §6's "queue entries stop carrying code" stands.
- **The per-request budget.** Cloudflare's limits page (read 2026-11-08):
  - a Worker invocation may make at most 1,000 calls to KV and R2 together, on every plan;
  - at most 6 at a time;
  - all subrequests, 50 on Workers Free and 10,000 on Workers Paid.

  What that means here:
  - **Loading** a workspace at the 500-file limit is about 500 R2 reads plus a few KV reads: inside 1,000.
  - **Saving** writes only the changed files. It never checks blobs the stored manifest already names, since saves never delete, so a save costs a handful of calls.
  - **Copying** (duplicate, fork, restoring a snapshot) needs two calls per file. A workspace near 500 files would pass 1,000. That's a question for you (below).
  - **On Workers Free,** the 50-subrequest cap would limit a load to about 40 files. Which plan the account is on decides whether the 500-file limit holds at all.

## Step 3 review (2026-11-08)

A code review of the endpoints (step 3) found these. Each is fixed and has a test in `tests/api/workspace-files-api.test.ts`, unless it says otherwise.

| Finding | What was done |
|---|---|
| **Copy passed the call budget.** It read every file twice (once to copy, again for the response): three calls a file. | Copy reads each `.pathogen` text once, writes it, and answers from the texts it holds: two calls a file. It copies at most 6 blobs at a time, so a large workspace isn't all in memory. Above **480** different files it refuses with a 413 and a message. This is a backstop only: question 2 below still decides how large workspaces copy. |
| **A save could revert an admin's publish or flag.** The save wrote back the record it read first, and a save with files can take a while (up to 500 R2 writes). | Every write of a record now goes through `patchWorkspaceRecord`: re-read, apply only this request's changes, write. A save's rev is one past the newer of the two reads, so two racing saves can't share a rev. KV has no compare-and-swap, so the window isn't zero; it is the re-read→put gap. |
| **A file sent by hash carried the client's size,** so a client could slip past the size limits, and the manifest could disagree with R2. | The size comes from the stored manifest, from a text in the same save, or from R2 (`head`); a size the client sends is ignored. |
| **A save with unchanged files dropped a rename** sent with it (as before phase 2). | Only a save that changes nothing at all is skipped. |
| **Requeue checked one read and froze another.** | It checks the record it freezes. |
| **Scripts that read only `code`:** `migrate-builtin-names-kv.ts` and `migrate-style-opener-kv.ts` would write a `code` beside a record's files that nothing reads. `export-workspace-sources.ts` would export an empty source. | The migrations refuse such a record with a message. The export counts it as "holding files in R2, not exported"; reading those from R2 is part of step 7. No tests: these scripts call wrangler. |
| **`backfill-approval-svgs.ts`** reads `code` from the admin approval read. | Step 4 changes that read; the script is updated with it. |
| **Admin listings show stored hashes as they are,** in two rules for old and new records. | Step 4 (the listings), with `readStoredFiles(x, x.codeHash).hash`. |
| **A load holds every `.pathogen` text in memory,** up to the 50 MB workspace limit, in a 128 MB Worker. | Not fixed. A hand-written workspace is far below this; the fix (return hashes only above a total size, and the client reads by hash) needs the playground's side, so it's on the 2c list. |
| **The "copy from a workspace" flow** in `new-workspace-view.ts` reads `code`, which a load leaves out for a workspace with several files. | Unreachable until the playground can make one; on the 2d list. |
| **A public workspace's file route serves the live files,** so an edit pending re-review is readable by anyone with its hash. | The same as `GET /workspace/:id` today; no change. Noted for 2e. |

The playground check (`verify/verify-storage-step3-playground.ts`, against `npm run dev:stack`) passes before and after the fixes: today's playground creates, loads, edits, saves (Cmd-S) and reloads a workspace through the new API, and the record holds a manifest with the text in R2.

## Step 4: review, approval and the public source read (2026-11-08)

Step 3 left queue entries without `code`, and the admin moderation screen compiles `code` for each card's thumbnail, the review modal, and the SVG it sends with Approve. Step 4 gives it back:

- **Both queue listings** (`/admin/queue/review`, `/admin/queue/rereview`) list each entry with its frozen source. An entry that is just `main.pathogen` carries its text as `code` and in `files`, for one R2 read (none for a record from before phase 2). An entry with several files carries its manifest only; an admin reads those files by hash. An entry whose files can't be read is listed with `sourceError`, so one bad entry doesn't hide the queue. Both listings now resolve owners the same way, so the review listing also says whether the owner is flagged.
- **`GET /admin/approval/:id`** returns the approval with every file's text, and `code` for a just-main approval. The moderation screen's two reads of it, and `backfill-approval-svgs.ts`, work unchanged; the script skips an approval with several files by name.
- **Every listing's hash** (approved, featured, rejected, flagged) is in today's rule.
- **`GET /approval-source/:id`** (new, public) serves the approval's frozen files, never the live ones, so an edit waiting for re-review stays unseen. It is guarded like `/approval-svg/:id` (404 unless the workspace exists, is public and isn't flagged) and cached for 60 seconds, like `source.json`. It returns `workspaceId`, `name`, `description`, the files, `codeHash`, and `code` for a just-main approval. Step 6 makes the detail page and `source.json` read it.

**Review** (a code review of step 4): no information exposure found. Fixed: the moderation screen threw on an entry with no `code` (`code.trim()` on undefined), which the API already allows; it now treats one like empty code. `verify/verify-storage-step4-admin.ts` reproduced the throw on the old bundle and passes on the new one. Also fixed: a stale `code` beside `files` is never passed through. Two more scripts that read only `code` (`migrate-viewbox.ts`, `backfill-publication-state.ts`) now leave records that hold files alone.

**Checked by hand** (`verify/verify-storage-step4-admin.ts`, against `npm run dev:stack`): the API freezes a workspace into the review queue; the served moderation screen lists it, compiles its thumbnail, and Approve sends an SVG compiled from the frozen text; the admin read and `/approval-source/:id` return that text. The script stands in for the sign-in only: it answers `GET /me` with an admin user and adds the dev API's admin token to `/admin/*` requests.

**For 2e:** the moderation screen shows an entry with several files as having no source. It needs to load those files by hash and compile them with their imports. Autosave's dirty check still uses its own copy of the old hash, so after a change and an undo it sends one save the server skips; 2c moves it to the shared hash.

## Questions from building

1. **Which Workers plan** is the Cloudflare account on? On Free, loads cap out near 40 files; on Paid, the 1,000-call budget is what applies.
2. **Copies of large workspaces.** Options:
   - **(a)** lower the file limit to 400, so a copy stays inside one request (about 800 calls);
   - **(b)** keep 500, and copy in several requests, with the playground asking for the next batch;
   - **(c)** keep 500, and refuse to copy a workspace over about 450 files, with a message.

   Recommended: (a). A workspace that size is unlikely to be hand-made, and one request keeps a copy all-or-nothing.

   Since the step 3 review, a copy over 480 different files is refused with a message (option (c) at 480), so nothing fails silently whichever you choose. Under (a) that refusal can't happen.
