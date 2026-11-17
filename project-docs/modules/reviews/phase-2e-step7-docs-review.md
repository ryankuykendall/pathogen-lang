# Phase 2e, step 7: content review of the docs drafts

2026-11-16. The four-persona review (UXD, UXE, PM, ID; website/guidelines/agentic-review.md) of the step 7 drafts: `docs/workspace-files.md` published, and `projects.md`, `modules.md`, `snapshots.md` and `publishing.md` brought up to date (summary: `../63-phase-2e-step7-docs.md`). The reviewer checked the pages against the playground and API code; every UI label matched.

## Findings and what was done

| # | Page | Finding | Done |
|---|---|---|---|
| 1 | publishing.md | Edits saved while a submission is pending never reach review: a save queues a re-review only for a public workspace (`router.ts:728-737`), and approval doesn't compare the live files with the submitted ones | **Documented as it is**: "Edits you make while it's pending aren't part of this review: once it's approved, your next edit sends them for review." Whether the server should queue them at approval: **a question for you** (below) |
| 2 | publishing.md | The URL isn't permanent: the slug is the name at submission (`makeQueueEntry`), picked again at each approval; a rename then a re-approval changes the URL, and the old one 404s. Renaming, a description or a thumbnail never trigger review on their own | **Documented as it is**: the slug's rule and the rename's effect; "permanent" dropped in two more places; a paragraph on what doesn't trigger review; the name and description are as submitted. Whether to keep the first URL: **a question for you** |
| 3 | publishing.md | The trigger list is incomplete (renames, removing an empty folder, the programs' order) and "as soon as" is wrong (it's the next save) | Rewritten |
| 4 | snapshots.md, workspace-files.md | Start new workspace opens on the main; a snapshot of another program doesn't redraw until it's chosen | Said in all three places |
| 5 | publishing.md | Owners aren't told about a rejection; "undo" didn't say what it achieves | Rewritten: the note goes away, no reason given; the next edit submits again |
| 6 | projects.md, modules.md | "Unsaved scratch buffer" is undefined, and the fix wasn't said | Defined (code opened from a link, such as a blog example's playground link, not yet saved as a workspace) with the fix: copy its code into a new workspace (**+ New Workspace**). Checked: the blog's playground links are `/workspace/scratch?state=…`; a scratch buffer's menu has no save item |
| 7 | workspace-files.md | "As last saved" read like a loss for Copy Workspace, which waits for the pending save | Copy Workspace: "with your latest edits"; Duplicate: "as last saved" |
| 8 | the screenshot | Single-letter names (`at`, `r`), unlike modules.md's `gear(center, radius, teeth)`; the program list covered the drawing | Retaken with modules.md's opening example word for word, in a taller window so the list clears the drawing |
| 9 | publishing.md | Step 4 gave one spelling of Pending review | Both spellings, and it's off until a reviewer decides |
| 10 | publishing.md | An unclear "it" about loading | The loading detail dropped |
| 11 | publishing.md | Step 3 missed no program and a failed save | Added |
| 12 | projects.md | The Playground bullet didn't say what the preview shows | Added: the program chosen with the chip, the main at first |
| 13 | projects.md | "From your computer" isn't true for a workspace | "From its project" |
| 14 | workspace-files.md | The section's lead-in didn't fit Make public | "Carries" |
| 15 | modules.md | The intro lacked "saved", unlike the message | Added |
| 16 | snapshots.md | The size line was muddled | Rewritten as the reviewer suggested |

## Questions for the owner (from findings 1 and 2)

1. **Edits made while a submission is pending.** After approval they're unreviewed until the next save. (a) Keep, as documented. (b) At approval, if the live files differ from the approved ones, queue a re-review of the live version at once (a server change, small).
2. **A rename changes the URL at the next approval,** and the old URL stops working. (a) Keep, as documented. (b) Keep the first approval's slug on later approvals, so a workspace's URL never changes (a server change, small; the page's old promise).

**Answers (2026-11-17):** both (a), kept as documented. The first is to be revisited once snapshots become the foundation for publishing.
