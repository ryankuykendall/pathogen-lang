# 2e step 8: the CHANGELOG after shipping, content review (2026-11-21)

The top entry was written before shipping ("Nothing here is pushed yet…"). Four edits record what happened: the intro, the Development section's "At ship" heading and its two "ran on production" lines, and the Fixed card item's last bullet. One content-reviewer pass, on the facts in note 58 ("Step 8, the push", "the files migration", "the card copy").

| # | Finding | Disposition |
|---|---|---|
| 1 | Intro: "Every workspace saved before it moved…" misparses ("it" reads as the workspace), and "every workspace" leaves out approvals, queues and snapshots | **Taken:** "Everything saved before then moved to the new storage that day (workspaces, approvals, the review queues and snapshots), and older approvals got their card images on 2026-11-21" |
| 1b | "Phase 2" is internal jargon (optional) | **Kept:** the entry's existing wording, and the heading names the change |
| 2 | "**At ship** (note 50)" is stale, and "note 50" can't be looked up | **Taken:** "**Run once on production** (`project-docs/modules/50-storage-decisions-and-plan.md`)", as other entries cite notes by path |
| 2b | "found all 219 moved": the 219th wasn't moved | **Taken:** "found all 219 in the new shape" |
| 2c | "saved after the push" gives no reason | **Taken:** "since a save through the new API converts the record" |
| 2d | "every public page loads its files" claims more than was checked | **Taken, as** "all 20 public pages load their files": the 20 approvals are every public page, and all 20 were checked |
| 3 | **Factual:** "It ran on production…" made the script the subject, but the copy ran from the browser console; "the same route" pointed at nothing | **Fixed:** "**The copy ran on production on 2026-11-21** without this script, since no admin token was saved: an admin, signed in, made its `POST /admin/approval-cards` calls from the browser console (the route takes an admin's session as well as the token)." |
| 4 | Fixed bullet: "(Development)" → "(see Development)"; "made before this" is vague; name the blank card | **Taken:** "made before this release", "(see Development)", "whose Explore card showed a blank placeholder, though they had a thumbnail, now show their picture". "Before this release" rather than the suggested "before 2026-11-17", which could be off for an approval made earlier that day |
| 5 | Line 167's "made before this" is vague too | **Taken:** "made before this release" |
| 6 | Older entries' "not yet published" lines and the `[Unreleased]` heading | **Left,** as the reviewer advised: they record what was true then, and the 2026-11-02 entry keeps the same heading form |
