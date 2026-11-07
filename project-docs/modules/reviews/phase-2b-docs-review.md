# Step 2b docs: content review (2026-11-07)

This is the four-persona review (UXD, UXE, PM, ID) of two drafts, both written before the code:
- `docs/projects.md` and `docs/cli.md`: `pathogen.json`'s `main` becomes `entryPoints`. These are uncommitted edits.
- `drafts/workspace-files.md`, "Files in a Workspace", the new playground page.

The reviewer had no shell. It took the November callout, the `pathogen.json` section, the CLI table's folder row, the Errors rows from "isn't an object" down, and cli.md's folder paragraph as the changes, which matches `git diff`.

## Verdict

**Approve both, with changes.** `workspace-files.md` is conditional on findings 1–3. There are 16 findings: 4 must-fix (1–4), 8 should-fix (5–12) and 4 to consider (13–16).

- **UXD:** The workspace page is short, well ordered and easy to scan. It's weak where "the list" names two lists, and where the program list is used before it's introduced.
- **UXE:** The `entryPoints` rules are precise. The gaps:
  - the playground can write a `pathogen.json` the CLI rejects;
  - entries escape the letter-case rule.
- **PM:** The workspace page leaves out what still handles one file only, which users meet on day one. projects.md doesn't say why you'd list more than one program.
- **ID:** Plain, house-style voice. Missing: a prerequisites callout, gotchas up front, and a fix in three error rows.
- **Cross-critique:**
  - UXE→PM: the one-file gap also breaks the Quality Standard (no silent failures), not only the messaging.
  - PM→UXE: an empty list is rare, but it's where export and VS Code meet, so settle it in the contract now.
  - ID→UXD: fixing "the list" means moving a section, not only swapping words.
  - UXD→ID: agreed on the callout; keep it to one line so the page stays a reference.

## Dispositions

| # | Severity | Finding | Disposition |
|---|---|---|---|
| 1 | MUST | The page never says what still handles one file. The header's list of one-file features left out Copy Code. Note 42 ties Copy Debug Info to 2d. Nothing moves a workspace to a folder until 2g, though the intro promises they have the same shape | **Applied, with a question for you.** The header says the page publishes when the multi-file UI ships to users, and recommends that this waits for 2e (publishing, forks and snapshots carry every file) and 2h (Copy Debug Info). A "Not yet" callout after the intro covers the project folder (2g), image export (`[TO DECIDE]`, note 41 #4) and share links (`[TO CONFIRM]`, note 38 Q12). Copy Code's file is decided in 2d |
| 2 | MUST | The playground could write a `pathogen.json` the CLI rejects. Note 47 allows an empty `entryPoints` when a workspace has no programs, and projects.md makes `[]` an error | **Applied, option (a).** An empty list is written as `{}` (note 47, section 2). The page adds: "Deleting the last program leaves the workspace with no main. The preview is empty and says to add a program, and `pathogen.json` becomes `{}`." |
| 3 | MUST, a question | Checking for an empty list or a duplicate at read time would stop every `import` or `@font` file in VS Code and the CLI, even file compiles that never use the list. That's the reason note 44 gave for deferring the missing-file check | **Applied as the recommendation, for your approval.** Read time checks only the shape: a list of paths inside the project folder, with forward slashes. When the list is used: not empty, no path twice, and the main exists and is a program. Today only the CLI's folder mode uses the list |
| 4 | MUST | "The main is a module" had no version for a project without `entryPoints`, and offered one fix where the playground offers two | **Applied, the reviewer's wording.** Two versions, both starting "Take out module;" |
| 5 | SHOULD | Three rows didn't say what to do: the old `main` key (a whole object reads as "replace the file", which would drop `$schema`), `entryPoints` that isn't a list (most likely a string carried over from `main`), and a main that doesn't exist (no fix, and no "looked for") | **Applied, the reviewer's wording.** "Replace it with "entryPoints": ["poster.pathogen"]"; the not-a-list example shows your own value; both "doesn't exist" versions say where they looked |
| 6 | SHOULD | Entries skipped the path rules a program follows: letter case (`existsSync` matches `Poster.pathogen` on macOS, then Linux fails), a leading `/` (the code accepts it) and the `.pathogen` extension (imports require it) | **Applied.** Entries must match letter case, checked when the list is used, with a new row. `/main.pathogen` is allowed and counts as the same path as `main.pathogen`. Entries must end in `.pathogen`, a shape check at read time, with a row matching modules.md's |
| 7 | SHOULD | projects.md didn't say why you'd list more than the main, and the November callout didn't say where the old-`main` error appears: in VS Code too, where it stops imports | **Applied, the reviewer's wording.** "Only the first entry is used today. Listing the others is optional; it records the order of the project's programs." The callout names the CLI and VS Code and what the error stops. The read-time bullet links to In each tool. When the playground page publishes, projects.md gains "The playground's program list follows that order" (note 46, for 2d) |
| 8 | SHOULD | Terms on the playground page: "library" never connected to "module"; "the program list" used before it was introduced; "the list" could mean either list; and the re-append when `module;` comes out was missing | **Applied, the reviewer's wording.** Library is linked to module once, the program list is named where it's introduced and glossed at its first use, and the `module;` sentence covers both lists and the re-append |
| 9 | SHOULD | No prerequisites callout; modules.md, its sibling, has one | **Applied.** The callout comes first. The intro's two sentences that said the same thing are gone |
| 10 | SHOULD | "Errors in other files" counted from the file you're editing; in the playground the file compiled is the program shown. The red dots mark both the file and the program (v6, chip screen, state 5). Undo per file and click-to-open were stated as fact while note 46 lists them as to confirm | **Applied, the reviewer's wording.** Both open items are marked `[TO CONFIRM]` where they appear |
| 11 | SHOULD | (a) Most first readers already have workspaces, and each gains a file name and a `pathogen.json` row: a "What changed" callout is the house pattern. (b) The page didn't say what an `@font` file path does in a workspace, which a project from the CLI often has | **Applied.** (a) The callout, with a `[month]` placeholder and the snapshot sentence conditional on 2e. (b) The draft keeps today's warning, which suggests a family, marked `[TO DECIDE in 2c]`, recommended until font files can be added |
| 12 | SHOULD | Not settled: (a) whether a moved file's own `./` imports are rewritten; (b) whether folders can be renamed and deleted; (c) what Duplicate names the copy; (d) the empty preview isn't drawn, and the thumbnail and explore cards of a workspace with no main aren't either | **Applied as recommendations, marked `[TO CONFIRM in 2d]`.** (a) Yes, rewritten. (b) Rename… and Delete… on folders. (c) `gears-2.pathogen`, as Keep both names a copy; a program's copy goes at the end of the program list. (d) On note 46's 2d mockup list |
| 13 | CONSIDER | (a) The example unknown key, `"entrypoints"`, differs from the known key only in letter case, and the `@font` rows already ask "did you mean". (b) The duplicate row didn't say which spelling it names | **Applied, the reviewer's wording.** A key that differs only in case gets `Did you mean "entryPoints"?`; any other ends `Known keys: entryPoints.` The duplicate row names both entries as written |
| 14 | CONSIDER | The page's `pathogen.json` section: "the last row at the top of the tree" read as a contradiction; the libraries sentence was hard to parse and gave no reason; the read-only line in the editor wasn't mentioned | **Applied, the reviewer's wording** |
| 15 | CONSIDER | Limits read as a placeholder; "the file you're on" was vague; a taken name wasn't covered; the reason `pathogen.json` is reserved in every folder was missing | **Applied.** Limits is marked `[TO DECIDE, note 47]`. The "+" target says the file you're editing, the folder you selected, or the top. A taken name is refused in place. The reason for reserving the name in every folder is given |
| 16 | CONSIDER | The header didn't list the sentences on other pages that go out of date the day this page publishes | **Applied.** The header lists them: projects.md line 3, its Playground bullet and the held-back sentence; modules.md's intro line, its Playground bullet and its "No project folder" row |

## Your feedback

Awaiting your review. The critique, the cross-critique and every disposition are above.
