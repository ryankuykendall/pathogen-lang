# Workspaces read in one format: the CHANGELOG entry's content review

2026-11-23. One content-reviewer pass over `tmp/storage/changelog-storage-draft.md`, checked against note 71, the code review's record and the code. 3 must-fix, 4 should-fix, 3 optional; all taken.

| # | Finding | Disposition |
|---|---|---|
| 1 | must-fix. "Local dev data was migrated": the run was still going; the backlog said the same | **Taken** in both: "is being converted… that isn't part of the push" |
| 2 | must-fix. The Notes left out note 70's record of 2g shipping, in 185898f6 | **Taken** |
| 3 | must-fix. "9,566 tests" had no source in the notes | **Taken:** the count is from the run after the review fixes; note 71's "Checked" now says so |
| 4 | should-fix. The admin sentence overstated the Rejected list, and "left the public index" didn't fit unflag | **Taken,** with the reviewer's wording |
| 5 | should-fix. The export line dropped the file reported missing | **Taken** |
| 6 | should-fix. Tested: the counts | **Taken** |
| 7 | should-fix. "Your go-ahead", "your answers", "as you chose": earlier entries never address the maintainer | **Taken:** "approved first", "the answers", "by choice" |
| 8 | optional. The quoted message is the workspace one; a snapshot's starts "Snapshot <id>…" | **Taken:** "a message ending '…'" |
| 9 | optional. "From before November 2026" is wrong for records saved on 1 to 16 November, before the migration on 17 November | **Taken in the code too:** the message now reads "from before 17 November 2026" (`OLD_SHAPE_MESSAGE` and the snapshot message, with their tests), going out with the CHANGELOG |
| 10 | optional. Say today's check found all 228 in today's format | **Taken** |
