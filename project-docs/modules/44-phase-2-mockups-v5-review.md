# Phase 2 mockups v5: your review, and two proposals for `pathogen.json`

2026-11-07. Mockups: `phase-2-mockups-v5/` (bbwp `2026-11-06-15:55:58--multi-file-workspaces--mockup-v5.bbwp.html`). v4 review: `43-phase-2-mockups-v4-review.md`.

## Your feedback, in your words

- "Agree with Keep empty folders, defer fonts as part of the work we will be doing on importing other file types such as .json, .csv, .svg, etc, keep the tabs "+" removed (this was a good call.)"
- "One other issue tangentially related that I wanted you to capture for consideration at a later point: We are providing a UI affordance that allows the user to swap between identifying a primary main file for the project. I am worried that in the long run this is going to cause us some unnecessary churn, particularly since we are allowing users to have more than one entrypoint for a project. I would like to propose that we change the 'main' member in the pathogen.json file into an 'entrypoints' array that holds the collection of entrypoints for the project. By default 'main.pathogen' is the only file list in entrypoints, and additional entrypoints are simply appended to the array. The UI affordance would be simply removing the item from the array and unshifting it into the first position. The second proposal I would like to make is that we include a readonly copy of 'pathogen.json' file in the files list. At some point we could consider making it read/write, but for the time being I think it would be sufficient to just include a readonly copy (readonly for the user, but read/write for the application) just to familiarize the user with the general layout of a pathogen project."
- "Please assess and evaluate my proposals, and please provide feedback, counter proposals, and suggestions for improving the experience."

## Decided

| Question | Decision |
|---|---|
| v5 as a whole | No changes asked for; taken as approved |
| Empty folders | Kept. The workspace stores folders as well as files (storage design, 2b) |
| Font files in a workspace | Deferred to the work on other file types (.json, .csv, .svg, fonts). Until then, v5's refusal stands, in the playground's existing font wording |
| The tabs bar "+" | Stays removed. Files are added only from the tree |

## Added to the order (`42-phase-2-order.md`)

- **A new step after phase 2: other file types in a workspace** (.json, .csv, .svg, fonts). Fonts there also bring parity with CLI and VS Code projects, which can carry a `fonts/` folder. It isn't in note 42 yet.
- **2g, export a project,** currently says the zip's `pathogen.json` has a `main` and that importing a folder reads `main`. Both follow whatever Proposal 1 settles.

## Proposal 1: an entry-points list instead of `main`

### Where `main` stands today

- **Never released.** pathogen-lang isn't on npm. `pathogen.json` and its `main` key have been in an "Unreleased" CHANGELOG entry since 2026-10-23. So changing the format now costs only our own code and tests. After a release it would mean supporting both.
- **Only the CLI reads it.** `pathogen-lang <folder>` compiles the `main`. VS Code and the language server use `pathogen.json` only to find the project folder.
- **What would change:**
  - `src/host/project.ts`: `KNOWN_KEYS`, `resolveMain` and the "must contain a JSON object" message;
  - `src/cli.ts`: `readInput` and its three folder messages;
  - `docs/projects.md`: the key table and the error rows; `docs/cli.md` line 37;
  - tests: about 21 lines in `tests/cli.test.ts`, `tests/host/project.test.ts` and `tests/host/node-host.test.ts`;
  - `packages/vscode-pathogen/test-fixtures/modules/pathogen.json`.

  The repository's own root `pathogen.json` is `{}` and doesn't change. The v1 and v2 mockup folders have `{ "main": "main.pathogen" }`; they are historical and stay as they are. Their SVGs are committed, so nothing needs to rebuild them. A v6 can't keep reading v2's example in place, though: once `main` is an unknown key, compiling it would fail. v6 would bring its own example.
- **A gap in the CLI, separate from both proposals.** A folder whose `pathogen.json` is `{}` fails with "has no "main"", even when `main.pathogen` is there. The playground treats `main.pathogen` as the entry point by convention, so the CLI should too: no key means `main.pathogen`.

### Assessment

The worry is right, and now is the cheapest moment to act on it. A single `main` string is a one-slot answer for projects that hold several programs. Most later features would want a list:
- a build that writes every program's SVG;
- several images on a published workspace's detail page;
- settings for each program (its output name, for example).

Moving the main to the front of a list is the same click as "Set as main", and it changes the file about as much as rewriting `main` does. What the list saves us is a schema change later, once people have project folders.

The open part is how the list relates to the `module;` header, and to the rule from note 43 that the chip lists every file that isn't a library. There are three ways to read the proposal.

1. **The list is every program in the project.**
   - It repeats what `module;` already says, and it has to change on every create, upload, rename and delete.
   - The playground can keep it current, but a program someone adds in VS Code or on disk won't be in it. The CLI and the playground would then disagree about what the project holds, which breaks the parity rule.
   - It is also a hand-maintained copy of something derivable, which this project avoids.
2. **The list is a chosen subset: only the programs that are entry points.**
   - This adds a third kind of file: a program that isn't an entry point.
   - It changes the approved chip rule (every non-library file).
   - That's a decision about the product, not an implementation detail, and it needs a reason, such as scratch files you don't want published.
3. **Counter-proposal: the list sets the order. It doesn't decide which files are programs.**
   - The first entry is the main.
   - Listed programs come first, in list order, in the chip and anywhere else several programs are shown (thumbnails, the detail page, a future build).
   - Programs that aren't listed are still programs: they compile, and they appear after the listed ones.
   - The list then does a job `module;` can't (order, and which program is the main), and a file added outside the playground never goes missing.

**Recommendation: reading 3, written the way you proposed it.** A new workspace's file is `{ "entrypoints": ["main.pathogen"] }`. The playground appends each new program, so in a playground project the list is complete. Only the order depends on the list; a stale or partial one never hides a file.
- **Set as main:** take the file out and put it first. The old main moves to second.
- **Rename:** rewrite the entry, as rename already rewrites imports.
- **Delete:** drop the entry. If it was the main, the next entry becomes the main, and a toast says so ("poster is now the main"), because thumbnails and publishing follow the main.
- **A program that gains `module;`:** it stops being a program, so the list drops it; take the header away and it's appended again. If the main itself gains the header, it should stay first and the chip should show an error, so the main doesn't change without the user choosing it. (2d)
- **No key at all:** the same as `["main.pathogen"]`. `{}` still just marks a project folder, and this closes the CLI gap above.
- **Item shape:** strings now. Objects can come later, if programs get their own settings.

The other cheap option is to keep `main` as one string and work out the set of programs from `module;`. It has no ordering and nowhere for per-program settings to go, so it is the format change you're worried about, postponed.

### Questions

1. **Which reading:** 3, the order (recommended), 1, every program, or 2, a chosen subset?
2. **What `pathogen-lang <folder>` compiles.** Recommended: the first entry. A flag to pick another isn't needed, since naming the file already does that (`pathogen-lang poster/poster.pathogen` finds the same project folder). Building every program, with each SVG named after its file, is a later feature.
3. **How each entry is checked.** Recommended, in the strict style of the current errors:
   - an entry that doesn't exist: an error naming it, raised when the entry is used (the folder compile, for the first), so a stale entry doesn't stop an unrelated compile;
   - an entry that's a library (`module;`): an error;
   - the same file twice: an error;
   - an empty list: an error that suggests leaving the key out;
   - each path follows the same rule as `main` today (forward slashes, inside the project folder).
4. **The key's spelling:** `entrypoints`, as you wrote it, or `entryPoints`, the camelCase used by esbuild and by package.json's own two-word keys. The UI says "entry point" as two words.

## Proposal 2: a read-only `pathogen.json` in the file tree

### Assessment

Yes. It teaches what a Pathogen project looks like, and the tree then matches what the export (2g) writes and what CLI and VS Code users see in their own file lists. These refinements would make it work better:

- **The file is shown, not stored.** The playground stores the list as workspace data and writes `pathogen.json` from it, the same way every time (two-space indent, a newline at the end), so it can't disagree with the workspace. This is part of the storage design in 2b. If the file becomes editable later, the text becomes the source, checked by the CLI's own `parseProjectFile`, so the errors match the CLI's word for word.
- **It shows what "Set as main" did.** With `pathogen.json` open in a tab, Set as main reorders the list in front of you. Of everything the file offers, this is the most useful, and the mockup should show it.
- **How it looks:**
  - pinned as the last row of the top level, muted, with a lock icon;
  - its tab keeps `.json` (only `.pathogen` is dropped from tab labels);
  - its row menu has no Rename, Delete or Move;
  - the chip leaves it out;
  - typing in it does nothing, and a line at the top of the editor explains: the playground writes this file; to change the main, use Set as main on a file.
- **A new workspace shows it too.** You asked that `main.pathogen` be the only file in a new workspace. I read that as being about `.pathogen` files. Pinned and muted, `pathogen.json` reads as the project's own file rather than a second one of yours. Showing it from the start is also how people learn it's there. Please confirm.
- **The name is reserved, in every folder.**
  - In the CLI, a `pathogen.json` inside `parts/` makes `parts/` a project folder of its own. The files there then can't import with `../`, so the exported project would break. The playground has to refuse the name in every folder, not just the top level.
  - Today a dropped `pathogen.json` is refused with the data-file message; it needs a message of its own.
  - Once data files arrive (the new step above), a `pathogen.json` dropped at the top level should be read for its entry points, or refused with a specific message.
  - Importing a project folder (2g) reads it.
- **Copy Debug Info (2h)** includes it.
- **JSON highlighting** in a read-only tab: to check in 2d.
- **It needs a mockup (v6) before any code,** under the mockups-first rule. You said "later", so v6 waits.

## If both are adopted, what changes where

- **2b:**
  - the multi-file workspaces docs page, whose sections on the main and on `pathogen.json` wait for the answers above;
  - `docs/projects.md`;
  - storage keeps the list and folders, and writes the file from them.
- **The CLI and host change:** `src/host/project.ts`, `src/cli.ts`, tests, the VS Code fixture, and the CHANGELOG's Unreleased entry. It's small, and it should land before the next npm release.
- **2d:** the pathogen.json row, its tab and the list upkeep, from the v6 mockup.
- **2g:** export writes the file; importing a folder reads it.

## Still open, from note 43

- Which characters a file name may hold (spaces, for one): storage design, 2b.
- Size limits per file and per workspace: 2b.
