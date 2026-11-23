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
