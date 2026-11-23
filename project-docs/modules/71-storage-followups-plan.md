# Storage follow-ups: the check after the migration, the old reader, and the sweep

2026-11-23. The next item after 2g (note 65, "Possible next steps" 4; `backlog.md` "Storage"). Three pieces, all from note 50. Two of them touch production, so each production step waits for your go-ahead.

## Before and after

| | Today | Proposed |
|---|---|---|
| Every workspace's files read back from R2 after the migration | Never checked for all of them: the public-pages check covered the 20 public workspaces only (note 65) | One read-only pass over production: the migration's dry run again (it counts any record still in the old shape) and the export of every workspace's files, with the built-in name check over them |
| Records from before phase 2 (one `code` string, no `files`) | Every load, copy, save and snapshot path can still read one (`legacyText`, in `website/api/workspace-files.ts` and 4 other files), and so can the public page's source (`website/approval-source.ts`) | The API reads today's shape only. A record in the old shape, if one ever turned up, fails to load with a message saying so, and is never written over. The migration script keeps its own reader, so an old backup can still be migrated |
| File blobs in R2 that nothing names | Kept forever; they only cost storage | Your choice below |

## What I found

- **No save writes the old shape.** A body with `code` (an old tab, or the New Workspace page's blank and template workspaces, which still send `code`) becomes a one-file manifest in `filesFromBody` before it's stored. So the old shape can only come from records written before 2026-11-17's migration. The API keeps accepting `code` in a request; only the reading of old records goes.
- **Production had none left** on 2026-11-17 (the second dry run: all 219 in the new shape). Records made since were all written by today's code.
- **Dev's KV still has about 397 old records** (its dry run, 2026-11-17). They're local data; I'd migrate them with the same script (with a backup in `tmp/kv-backups/`) before the reader goes, so the dev playground keeps working.
- **The migration script uses the API's reader.** It keeps working if the old-shape parse moves into the script itself.

## The plan

1. **The production check** (read-only; your go-ahead). The migration's dry run with `--env prod --confirm`, and `scripts/export-workspace-sources.ts` over production with the built-in name check. Expected: 0 records to migrate and 0 errors; every file read. Anything else stops the plan, and I report it.
2. **Dev's migration** (local only): dry run, then `--write` with a backup.
3. **Remove the reader**, tests first: the API's load, copy, save and snapshot paths, and the Pages worker's public-page source, read `files` only; an old-shape record answers a clear error. The migration script gets its own small reader. Code review, full suite, then the push, which deploys both the API (GitHub Actions) and Pages. With no old records left, their order doesn't matter.
4. **The sweep**: as you choose below.

## Questions for you

1. **The production check** (step 1): go ahead with the two read-only runs? *Recommended: yes.*
2. **Removing the reader** (steps 2 and 3): go ahead, if step 1 finds nothing old? *Recommended: yes.* It takes the oldest branch out of every load and save, and a stray old record would say so rather than be read.
3. **The sweep**, which deletes blobs nothing names:
   - **(a)** Build it as note 50 designed it (a mark pass, then a sweep at least 24 hours later), then run each pass on production with your go-ahead.
   - **(b)** Build only the mark pass, as a read-only report of what nothing names and how much space it takes. Decide on deleting with those numbers.
   - **(c)** Leave it on the backlog for now. Workspaces hold only `.pathogen` texts, at most 20 MB each, so unreferenced blobs are likely a few megabytes. The bucket's total size is on the Cloudflare dashboard (R2, the bucket, Metrics), which tells us without any code. Revisit when data files and fonts arrive (phase 3) and storage can grow.

   *Recommended: (c).* Deleting stored files has the only real risk in this work (note 50's design still has a millisecond race), and today it would save almost nothing.

## Your answers (2026-11-23)

"1 yes, 2 yes, 3 (c)": the production check goes ahead; the reader goes if the check finds nothing old; the sweep stays on the backlog until data files and fonts arrive.

## Step 1, the production check (2026-11-23): passed

- **The migration's dry run** (`--env prod --confirm`, report in `tmp/storage/prod-dry-run-2026-11-23.json`): 198 workspaces, 20 approvals, 8 snapshots; 0 to migrate, 228 already in today's shape, 0 orphans, 0 errors; every approval's re-review answer unchanged.
- **The export** (`scripts/export-workspace-sources.ts --env prod --confirm`): 197 workspaces, 20 approvals and 6 queue entries written; 223 files read from R2; 0 empty; 1 reported unreadable, `workspace:HIyQr_Sks8ajH0CEMF3rh` main.pathogen "(not in R2)".
- **That one wasn't missing.** Read again (`tmp/storage/inspect-unreadable.ts`, read-only): the blob is there, 1,396 bytes as the record says, and its bytes hash to its name. The export counted any failed read as "not in R2", so a passing network or wrangler failure looked like a lost file. The export now retries twice and reports "couldn't be read: …" apart from "not in R2" (R2's own "The specified key does not exist").
  - The workspace itself: "Staggering the quad colorized v2 (Copy)", made 2026-03-01, last saved 2026-03-10, migrated 2026-11-17 (rev 1). It's public with no approval, one of the never-reviewed Explore entries you chose to leave (`backlog.md`, "Public workspaces from before reviews").
- **The built-in name check** over the export (`check-builtin-collisions.ts --kv-dir tmp/kv-sources/prod`, every current built-in name): 1,723 programs. In stored workspaces, only the one program with its own `enum GridPatternType`, left alone on 2026-11-02 because it already failed to parse (CHANGELOG, "built-in names can't be declared"). The rest are project-docs records and docs examples marked invalid, as the check expects.
- **Dev's dry run** (local): 397 records to migrate, 9 already, 1 orphan approval, 0 errors.

## Step 3, removing the reader: what changed

- `readStoredFiles` reads `files` only. A record without them (`code`, or neither) throws `OLD_SHAPE_MESSAGE`: "This workspace is stored in a format from before 17 November 2026 that the site no longer reads. Nothing was changed." Handlers answer it as "Failed to load workspace: …" (500), and nothing is written. `storedFilesForText(code)` is today's one-file workspace from a text, for a create or a save that sends `code`.
- `legacyText` and `materialize` are gone from the load, copy, save, review, approval, snapshot and file-read paths. A snapshot with only a `code.pathogen` is refused the same way.
- **Listings never fail whole for one record:** the Approved, Featured and Flagged lists give a record the reader refuses a null hash, with the reason logged; the review queues already showed a per-entry error.
- The Pages worker's public page asks the API for every approval's source; the API refuses an old one, and the page shows what it shows for a source it can't get.
- The migration script reads both shapes itself (`readEitherShape`), and checks each result against the API's reader as before.
- **The code review** (`reviews/storage-old-reader-code-review.md`): no path writes over an old record's files. Two should-fix taken: an admin's flag, unflag and unpublish took the state row's hash after changing the record, so on an old record they'd stop halfway; they now take it with `recordHashOrNull` and finish on any record (tested). The Rejected list uses it too.
- **Checked:** the API tests (306), the full suite (9,566 tests), a type check of the changed files; `verify-2g.ts` against the dev API running this code (40 of 40); and the dev API answering an unconverted dev record with the message (`tmp/storage/probe-dev-old-record.ts`).
- **Dev's conversion** (`--write --backup-dir tmp/kv-backups/files-dev-2026-11-23`) is local only and slow (one record every few seconds); it doesn't block the push.

## Shipped (2026-11-23)

Pushed `c752a015..19ce8ec3`. The API deployed through GitHub Actions in under a minute (run 45289573610), and Pages' deployment of 19ce8ec is active. Live checks, read-only:
- every approved workspace's source from `GET /approval-source/:id`: 20 of 20, before and after (`tmp/storage/check-live-sources.ts`);
- every detail page linked from `/explore` and its `source.json`: 20 of 20 on the new deployment (`tmp/storage/check-live-pages.ts`).
