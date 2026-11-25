# Phase 3a: the first push (steps 1 to 7)

2026-11-24. The user: "Let's push what we have then move onto step 8." So steps 1 to 7 go out before step 8, not with the rest of 3a as note 76 planned.

## The checks owed before it (note 80)

`project-docs/modules/verify/verify-3a-api-limits.ts`, 5/5 through the real Worker runtime (wrangler dev's workerd, `npm run dev:api`), `verify-3a-api-limits-results.json`:
- a file of 5 MB exactly, sent in pieces with no Content-Length, is stored;
- a save of 20 MB of two-byte text is saved (345 ms);
- a save of 25 MB is refused, 413, with how to send large files;
- a 6 MB file sent in pieces is refused, 413.

A body refused before it's all read takes down wrangler dev's own proxy ("Error inside ProxyWorker: Network connection lost"), after the Worker has answered 413. It's the local proxy's, not the Worker's (an early answer to a large upload is ordinary HTTP), and the mockup v2 runs hit it too. The script runs the refusals last.

## Decided by the push

- **Files a PUT stores that no save names** (note 80): pushing ships option (a), as they are, the sweep still deferred. The user can overrule it.

## The order (note 76, decision 8)

1. `git push origin 644cd0d2:main`: steps 1 to 5, the API's changes among them. Its playground can't make data files and its uploads refuse them, so it works with the old API meanwhile.
2. Wait for the "Deploy pathogen-api" run to succeed (it cancels a run in progress on a new push, so nothing else is pushed until it's done).
3. `git push origin main`: steps 6 and 7 and these notes. Step 6's only API change reads the same 24 MB from `LIMITS`.

## Live but unfinished until step 8

- The published docs describe uploads, a project's import, snapshots and copies carrying data files: uploads and the import still refuse them.
- A data file over the load's 2 MB (New data file… can now make one) breaks the admin review screen (`review-entry.ts`) and the public page's "Open as new workspace".
- Snapshots count unsaved data text against their 1 MB of code.
- No CHANGELOG entry yet (step 9, for the user's approval); the npm package and the VS Code extension aren't released, though the docs describe `--max-data-size` and VS Code's data imports.
- Still open for the user: the 50 MB refusal's words in docs/workspace-files.md "Limits" (note 82).
