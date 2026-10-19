# Code review — Phase 2 snapshots API, 2026-10-19

Reviewer: `code-reviewer` agent (read-only). Scope: `website/api/snapshots.ts` (new), `website/api/router.ts`, `website/api/types.ts`, `api/src/cors.ts`, `migrations/0003_snapshots.sql`, `tests/api/snapshots.test.ts`, `tests/auth/helpers.ts`.

Verdict: no auth bypass or data-loss bug; one high-severity failure mode at the quota ceiling plus hardening items.

| # | Sev | Finding | Disposition |
|---|-----|---------|-------------|
| 1 | High | Workspace delete issued 3 R2 deletes per snapshot → up to 1500 subrequests at the 500 cap, over the Worker limit; delete would fail half-done | **Fixed.** Keys deleted in batches of ≤1000 (`deleteKeys`); cascade also sweeps the `snapshots/{ws}/` prefix via `list()` (catches files from failed saves). Test: 400 snapshots + a stray file → 2 batched deletes, prefix empty. Verified on the local wrangler runtime (real R2 binding: array delete + list) |
| 2 | Warn | Quota race: count check then insert | **Fixed.** INSERT…SELECT…WHERE count < 500; 0 changes → 409 + file cleanup. Early check kept to avoid wasted uploads. Test forces every early check stale; mutation (removing the guard) makes it fail |
| 3 | Warn | Create racing a workspace delete leaves unreachable rows/files | **Fixed.** Re-read workspace after insert; if gone, delete row + files, 404. Test simulates the delete mid-save |
| 4 | Warn | `POST /snapshot/:sid/workspace` was a simple cross-site POST | **Fixed.** Requires `X-Pathogen-Snapshot: 1`. Test |
| 5 | Warn | `meta`/PUT body `null`/array → 500 | **Fixed.** Plain-object check → 400. Tests |
| 6 | Warn | Body buffered before size checks | **Fixed.** Early 413 on declared Content-Length > caps + 64 KB. Test |
| 7 | Warn | Missing-table handling inconsistent; count swallowed all errors | **Fixed.** `isMissingTable`; count returns 0 only for a missing table and rethrows otherwise (getWorkspace maps a failure to `snapshotCount: undefined`); list/create/read → 503 `snapshots-unavailable`. Test drops the table |
| 8 | Warn | Workspace endpoints return 404 vs 403 (existence probe) | **Not changed** — matches every other workspace endpoint (403 for someone else's). Snapshot ids keep the uniform 404 |
| 9 | Warn | `remove` deleted the row before the files | **Fixed.** Files first |
| S | Sugg | `.buffer` cast; empty source name in start-workspace naming; unique-match breadth; looksLikeSvg strictness; account-deletion cascade note | Comment added for `.buffer`; empty-name guard added; looksLikeSvg strictness documented; account-deletion note in module header. Unique-match left broad (bounded retry) |
| T | Tests | Other-user PUT/DELETE/start; malformed bodies; partial failures; retry exhaustion | **Added** (10 new tests; 34 in the suite) |

Result: `npx vitest run tests/api tests/auth` → 172 passed. No new lint errors in `website/api/*`; tsc (strict, DOM lib) shows only the five pre-existing errors in router.ts/handlers.ts.
