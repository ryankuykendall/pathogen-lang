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
| Limits | `.pathogen` 1 MB a file; data files 5 MB; fonts 20 MB; 50 MB and **20 files** a workspace (was 500; changed 2026-11-08, see "Your answers, second round"); folders 8 deep. "A fine starting point" |
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

**For 2e (step 4):** the moderation screen shows an entry with several files as having no source. It needs to load those files by hash and compile them with their imports. Autosave's dirty check still uses its own copy of the old hash, so after a change and an undo it sends one save the server skips; 2c moves it to the shared hash.

## Step 5: snapshots as manifests (2026-11-08)

- **A snapshot stores `snapshots/{ws}/{sid}/manifest.json`** (`files`, `folders`, `entryPoints`, `contentHash`) beside `image.svg` and `card.png`, in place of `code.pathogen`. Its code is the workspace's own blobs, so an unchanged file costs a snapshot nothing, and a later save can't change it (saves never delete).
- **Creating one** takes today's playground's `code` file, unchanged, or a `files` field shaped like a save's body: each file as `{ text }`, or `{ sha256 }` for bytes the workspace already stores. Either way at most 1 MB of text is uploaded (`files` sent by hash cost nothing toward it). What a `files` snapshot leaves out defaults as a new workspace's would (`folders: []`, `entryPoints: ["main.pathogen"]` when there is one), never to the workspace's current ones. Everything is checked before anything is written. `code_bytes` is the total size of the snapshot's files.
- **Reading one:** `GET /snapshot/:sid/code` serves the text of a snapshot that is just `main.pathogen` (what today's playground reads), and answers 409 for one with several files. New `GET /snapshot/:sid/files` returns every file with its text. A snapshot from before phase 2 still has its `code.pathogen` and reads as just `main.pathogen`; deleting it removes that file too.
- **Starting a workspace from one** copies its files to the new workspace's prefix through the same code as a workspace copy (`copyStoredFiles`, moved from the router into `workspace-store.ts`): two R2 calls a file, refused over 480.
- **A damaged manifest, or a file it names gone from storage,** answers 500 with a message that says which, on every read.

**Review** (a code review of step 5): no critical findings. Fixed: a damaged manifest threw a bare server error; a `files` snapshot inherited the workspace's current entry points; the refusal tests didn't assert their messages. Added tests: a hash from another workspace is refused (by-hash files are looked up under the snapshot's own workspace only), `/files` is owner-only, a quota refusal writes nothing, the 480-file guard on starting a workspace, a damaged manifest, a missing file, the 1 MB cap for `files`.

**Checked on the Worker runtime** (`verify/verify-storage-step5-snapshots.ts`, against `npm run dev:stack`; it writes one throwaway user and session to the local D1, as `scripts/seed-dev-users.ts` does): a `code` snapshot, a save of other code, the snapshot's code read back unchanged, a workspace started from it, and a `files` snapshot with one file by hash read through `/files`.

**What the sweep (step 8) must read**, from the review, so no snapshot's file is ever swept. Per workspace prefix `files/{ws}/`, a blob is referenced when any of these names its hash:
- the `workspace:{ws}` record;
- every review and re-review queue entry, and the approval, for that workspace;
- every `snapshots/{ws}/*/manifest.json` in R2, found by listing R2 (not D1), so a manifest with no row is still kept.

It stops on any manifest it can't parse, rather than skipping it. It deletes only blobs older than a grace period, and reads the references after listing the blobs: every writer puts the blobs before the record or manifest that names them, so a sweep in that gap would otherwise delete a blob about to be named. Records and snapshots from before phase 2 name no blobs.

## Step 6: the detail page and source.json (2026-11-08)

- **`website/approval-source.ts`** reads an approved workspace's source for the Pages worker: an approval from before phase 2 from its own `code`, with no request; any other through the API Worker's `GET /approval-source/:id` (the Pages worker has no R2 binding). An error, an unreachable API, or an answer of the wrong shape gives null, with a logged warning.
- **The detail page** (`/u/:handle/:slug`) shows the main program's text and line count, so a one-file approval renders as before. One with several files shows its main program; its own view (every file, by name) is a 2e design. When the source can't be read, the page still renders and its "View source" panel says the source couldn't be loaded, without the `<pre>` the highlighter would otherwise dress up.
- **`source.json`** carries `files`, `folders` and `entryPoints`, and `code` for a one-file approval, which today's "Open as new workspace" form reads. When the source can't be read it answers 503 with `source-unavailable`, which the form already reports.

**Found by the check:** before this step the detail page answered 500 for any approval saved since step 3 (`escapeHtml(approval.code)` on a missing `code`), as the step 4 review predicted. `wrangler pages dev` doesn't reload `_worker.js` after a rebuild, so checking a Pages worker change means restarting `dev:stack`.

**Checked by hand** (`verify/verify-storage-step6-detail-page.ts`, against a restarted `npm run dev:stack`): a one-file workspace and one with several files, each approved through the API; the detail page shows the approved text, not an edit made after approval; `source.json` has `code` for the first, every file for both. Unit tests: `tests/api/approval-source-pages.test.ts`.

## Step 7: the migration script (2026-11-08)

- **`scripts/migrate-workspace-files-kv.ts`** moves every program saved before phase 2 into a blob at `files/{workspaceId}/{sha256}` and rewrites its record as a manifest, with the hash in today's rule and `rev` unchanged. It covers workspaces, approvals (the blob goes under the workspace), both review queues, and snapshots (`code.pathogen` gains a `manifest.json` and is kept). It runs as a dry run by default; `--write` needs `--backup-dir`, production needs `--confirm` (also for a dry run), and `--only <workspaceId>` limits it to one workspace.
- **The transformation** is `scripts/lib/workspace-files-migration.ts`, built on the API's own reader and hash, so the migration can't compute a hash differently from the code that later compares it (note 48 §7). Every result is checked against that reader: the migrated record reads back as the same manifest and hash, and the blob's bytes hash to the name the manifest gives them.
- **The re-review check** runs for every approval: whether a save of its workspace would queue a re-review must be the same before and after. Any change fails the run.
- **Writes** go blob first, record second. Each record is re-read just before its write and skipped if it changed. A record that already holds files is left alone, since saves since the push convert records themselves. An approval or queue entry whose workspace record is missing is reported as an orphan and left alone: migrated, its detail page couldn't read its source.
- **`export-workspace-sources.ts`** now reads the `.pathogen` files of records that hold files from R2, so the built-in name collision check and the semantics audit still see every program after the migration. The folder stays flat: `<key>.pathogen` for a one-file record, as before; `<key>--<path>.pathogen` for each file of a record with several.

**Dev dry run** (all local dev data, read-only): 380 workspaces, 17 approvals and both queues would migrate (399 records), 0 errors, and every approval's re-review answer is unchanged. 1 orphan approval (its workspace is gone) would be left as it is.

**Checked end to end** (`verify/verify-storage-step7-migration.ts`, against `npm run dev:stack`): it seeds records the way they were saved before phase 2 (an approved workspace unedited since approval; one edited since, with its re-review entry; a snapshot with `code.pathogen`), migrates each with `--only` (a dry run, the write, a dry run again that finds everything already migrated), then reads back through the API and the Pages worker. Results: the same code, an unchanged save skipped, the edited one still in re-review and the unedited one not, both detail pages and `source.json` showing the approved code, the snapshot's code unchanged. `verify/verify-storage-step7-export.ts` checks the export's R2 read. Unit tests: `tests/api/workspace-files-migration.test.ts`, including migrated records driven through the real API handlers.

**Review** (a code review of step 7): no critical findings. Fixed:
- A backup could be replaced by a later run with the same folder (after `--only`, or a retry), losing the original; an existing backup is now never overwritten.
- An R2 read that failed for any reason counted as "not there", so a network error could have let the snapshot pass write a one-file manifest over a real one. Only R2's own "The specified key does not exist." now means absent; anything else is that snapshot's error.
- A record with neither `code` nor `files` would have become an empty program; it's now reported as an error.
- In the export, two paths that flatten to the same file name (`a/b.pathogen`, `a-b.pathogen`) no longer overwrite each other.

Noted, not changed: the re-review check can only fail if records are paired wrongly, since each record's hash is already checked against the reader; it stays as a second check. KV has no compare-and-swap, so a save landing between the re-read and the put is overwritten: run the write at a quiet time.

### At shipping, in this order

1. **Push everything** (2b–2e). The API Worker deploys from GitHub Actions and the Pages worker from Cloudflare's GitHub integration, separately. Wait until **both** are live: an old Pages worker answers 500 for a migrated approval (found in step 6).
2. ~~**The style-opener follow-up run.**~~ Dropped: you consider it settled (question 3 below). A program still using the old `${` opener is fixed by hand if its owner returns to it.
3. **The dry run on production** (`--env prod --confirm --report tmp/step7/prod-dry-run.json`): a production read, so only with your go-ahead. Check that it reports 0 errors, an unchanged re-review answer, and the orphans.
4. **The write**, with `--backup-dir`, after your go-ahead on the dry run's report, at a quiet time (a save landing during a record's re-read→put would be overwritten).
5. **The dry run again**: everything "already". Then the export and the collision check, as a smoke test of the R2 read.
6. **Later:** the sweep (step 8, after 2e ships, as you decided), and removing the old-shape reader once nothing old remains.

## Step 8, the sweep: a proposal, not built (2026-11-08)

The sweep deletes data, and the simple design has a hole, so this is for you to decide first. Nothing breaks without it: until it runs, unreferenced blobs only cost storage (note 48 §3: "the sweep can wait").

**The hole.** A save may name, by hash, a blob that is under the workspace's prefix but that no manifest names. Note 48 §3 plans this on purpose: a data file is uploaded first and joins the manifest with the next save. So an old blob that nothing names can become named again without being uploaded again, and a grace period on R2's upload time doesn't protect it. (A save that uploads identical bytes again also overwrites the blob before its manifest is written.)

**Proposed design:**
- **It runs inside the API Worker,** since wrangler can't list R2 objects: admin-only routes, plus a script that drives them, dry run by default.
- **References,** per prefix `files/{ws}/`:
  - the `workspace:{ws}` record;
  - its approval;
  - its entries in both review queues;
  - every `snapshots/{ws}/*/manifest.json`, found by listing R2.

  Rejections hold no files, and records from before phase 2 name no blobs. A record or manifest the sweep can't parse stops that prefix.
- **Two passes:**
  1. **Mark.** List the prefix's blobs, then read the references, and return the hashes nothing names. The script saves them in `tmp/` with the time.
  2. **Sweep,** at least the grace period later (the script enforces it, default 24 hours). For each candidate, the Worker re-reads the references and lists the blob again. It deletes the blob only if nothing names it and it was uploaded before the mark. A blob named or uploaded again since the mark is kept.
- **Prefixes with no workspace record,** left by a failed create, copy or start-from-snapshot, are mostly what it will find. They get their own test.
- **What remains:** a save could name a candidate by hash, or upload it again, in the moment between the sweep's re-read and its delete; R2 deletes aren't conditional. Then a load says the file is missing from storage, and the next save of that file's text writes it again. The window is milliseconds, and the tool is run by hand.
- **Code it needs:** the R2 type gains list's `delimiter` and its `delimitedPrefixes`, and each object's `uploaded` (exact names checked against the binding's docs). The test bucket gains a clock.

## Your answers, second round (2026-11-08), in your words

1. **The Workers plan:** "I currently pay $5 per month. For the time being, let's cap a workspace to 20 files and see if we have users who bump up against this limit."
   - $5 a month is Workers Paid, so the 1,000-call budget per request is what applies, not Free's 50 subrequests.
   - **Done:** `LIMITS.files` is 20, and `docs/workspace-files.md` (not yet published) says so. At 20 files, a load is 20 R2 reads and a copy 40.
   - The 480-file copy guard stays as a backstop, for if the limit is ever raised.
   - The 50 MB workspace total can't be reached while workspaces hold only `.pathogen` files (20 at 1 MB). It comes into play with data files and fonts.
2. **Copies of large workspaces:** "If we are capped at 20 files per workspace, this should not be an issue." Settled by the cap.
3. **The style-opener follow-up run:** "Not sure what the style-opener is." Explained in the reply. Still open: see question 3 below.
4. **The sweep:** "Let's wait until after 2e ships." It stays a proposal (step 8 above) until then.

On step 5 you asked whether a snapshot still keeps the SVG exactly as rendered. It does: `image.svg` is stored byte for byte, as before, and the migration never touches it. Only the snapshot's source moved: from its own `code.pathogen` to a manifest naming the workspace's files, which saves never delete or change.

## Questions from building

1. **Which Workers plan** is the Cloudflare account on? On Free, loads cap out near 40 files; on Paid, the 1,000-call budget is what applies. *Answered: Paid; a workspace is capped at 20 files.*
2. **Copies of large workspaces.** Options:
   - **(a)** lower the file limit to 400, so a copy stays inside one request (about 800 calls);
   - **(b)** keep 500, and copy in several requests, with the playground asking for the next batch;
   - **(c)** keep 500, and refuse to copy a workspace over about 450 files, with a message.

   Recommended: (a). A workspace that size is unlikely to be hand-made, and one request keeps a copy all-or-nothing.

   Since the step 3 review, a copy over 480 different files is refused with a message (option (c) at 480), so nothing fails silently whichever you choose. Under (a) that refusal can't happen. *Answered: settled by the 20-file cap.*
3. **The style-opener follow-up run** (see "At shipping", step 2): did it run after 2026-09-04, or is it settled without it? *Answered: settled. "I am not worried about the issue with the style opener...those older workspaces should be easy to update manually if users return to them." Step 2 of "At shipping" is dropped.* In September, style blocks changed from opening with `${` to `#{`, and `migrate-style-opener-kv.ts` rewrote stored programs on production on 2026-09-04. A second pass was planned two days later, to catch saves from browser tabs still running the old site. A read-only dry run on production would show whether any record still uses the old opener. That needs your go-ahead.
4. **The production migration**: the dry run and the write each need your go-ahead, at shipping time (after 2e). Nothing has touched production.
5. **The sweep** (step 8, above): build it now with the two-pass design, or after 2e ships? *Answered: after 2e ships.*
