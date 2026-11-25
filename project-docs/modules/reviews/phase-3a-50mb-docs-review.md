# Phase 3a: the 50 MB refusals in docs/workspace-files.md "Limits" (content review, 2026-11-25)

The user: "Yes, please add the three 50MB refusal messages." The content-reviewer (4 personas, proportionate to a short change) reviewed the new passages only: a second error-panel example (the save), the upload's message, and the import's message.

The reviewer checked each quote against the code, word for word: `save-limits.ts:75`, `workspace-edits.ts:822`, `project-import.ts:392` (with its curly ’). The example sizes are ones the formatter prints, and each is reachable: the upload's 6.5 MB needs two or more files of 5 MB or less, and the import's 61.3 MB fits in 20 files of 5 MB or less.

## Findings and what was done

1. **Must fix: "Both stay until the file saves."** Before the addition, "Both" meant the "Not saved" status and the panel's message. Right after two examples, it read as "both messages", and only one refusal shows at a time (`saveRefusal` returns one). **Applied:** "The status and the message stay until the file saves."
2. **Should fix: the upload block's first line has no label.** "Nothing was added" is the message's title; the lead-in said only "its message says why". **Applied:** "…and a message headed "Nothing was added" says why:" (not "toast", which the page avoids as UI jargon).
3. **For the user (a product change): the import's messages say "holds at most", the upload's "can hold at most".** Shown a few lines apart, they may read as different limits. Aligning them is two strings in `project-import.ts` and their pinned tests. **Docs unchanged** (they quote the product as built); offered to the user.
4. **Consider: leave the "no file open, the largest file" fallback out.** Already left out. **No change.**

Not a finding: the upload's lead-in says "20 files or 50 MB" and shows only the 50 MB message, which names its limit itself.
