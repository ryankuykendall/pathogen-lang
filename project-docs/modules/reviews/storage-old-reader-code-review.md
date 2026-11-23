# Removing the reader for records from before phase 2: the code review

2026-11-23. One code-reviewer pass over note 71's step 3 (`readStoredFiles` refuses a record without `files`; `legacyText` and `materialize` gone; the migration script's own reader; the export's retries). No must-fix: no path writes over an old record's files. Every save, rename, copy, submit, approve and re-review reads the record's files before writing anything, and `setFiles` still deletes `code`. 2 should-fix and 4 suggestions.

| # | Finding | Disposition |
|---|---|---|
| 1 | should-fix, the closest to a must-fix. An admin's flag, unflag and unpublish save the record's change (`patchWorkspaceRecord`) first and read its hash for the state row afterwards. On a stray old record that read now throws: the record says flagged, the indexes and the state history aren't updated, and the admin sees a 500. A safety action half done | **Taken:** the state row's hash comes from `recordHashOrNull` (null, with the reason logged, for a record the reader refuses), so all three finish on any record. Test: flag, unflag and unpublish an old record; each answers 200, the state rows have no hash, the Flagged list shows it, and its code isn't touched |
| 2 | should-fix. The Rejected list read the hash strictly inside its per-entry `try`, so an old record's entry lost its owner and flags | **Taken:** `recordHashOrNull`, as in the Approved, Featured and Flagged lists |
| 3 | suggestion. Confirm the public page handles the API's 500 for an old approval like any source it can't get | Checked: `readApprovalSource` gives null for any answer that isn't 200 (test in `approval-source-pages.test.ts`), the page's existing case |
| 4 | suggestion. Check that the snapshot list doesn't read files per row | Checked: only the code, files and start-workspace routes read a snapshot's files, each through `guardedRead` |
| 5 | nit. A docblock line in `frozenSource` ran long after an edit | **Taken:** rewrapped |
| 6 | suggestion. A test of the listings' null hash | Already in `admin-featured-list.test.ts` (Featured) and the new moderation test (Flagged) |

Checked and fine, per the review: `filesFromBody`'s `code` branch stores the same manifest and hash as before; a load of a one-file workspace still returns `code`; the migration's `readEitherShape` gives an old record the hash the API gave it, and each result is still checked against the API's reader; the export's missing-key test matches the string the migration script relies on.
