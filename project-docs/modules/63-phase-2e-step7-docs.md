# Phase 2e, step 7: the docs (drafts for your approval)

2026-11-16. Step 7 of note 58: publish `docs/workspace-files.md` and bring four published pages up to date with 2b to 2e. Nothing is committed until you approve; a content review comes first (its record: `reviews/phase-2e-step7-docs-review.md`).

## What changes

| Page | Before | After |
|---|---|---|
| `workspace-files.md` | Not published; placeholders for the month, the snapshot sentence and the screenshot; "Copy Code" | Published (`DOC_FILES`, after modules.md). "What changed (November 2026)"; old snapshots and public pages draw as before; a screenshot near the top, light and dark; the copy icon at the end of the tabs; the main is what publishing uses; a new section, **Snapshots, copies and publishing** |
| `projects.md` | "The playground can't read files yet"; "A workspace is one program for now"; "Today only the CLI uses the list" | A workspace is a project folder: `/` paths start at its top, `.pathogen` files only for now; an unsaved scratch buffer can't import; a workspace writes its own `entryPoints` list |
| `modules.md` | "A playground workspace is one program for now, so `import` is an error there"; the error row's message says the same | Imports work in a saved workspace, with rechecking and errors in other files; the error row is for an unsaved scratch buffer, and its message is the compiler's new one |
| `snapshots.md` | One program's code; Copy code in the actions; "1 MB of code per snapshot"; the publishing page's "snapshot" explained | Every file as drawn, and the program that drew it; the code panel's list and copy icon; Start new workspace copies the files and opens on the main; Export's legend is the drawing program's file; "Up to 1 MB of edits not saved yet"; the no-program reason |
| `publishing.md` | "Publish workspace", "Unpublish workspace", a form option that doesn't exist; re-review after any edit; "Pending re-review"; "snapshot" | The menus' real names; Make public saves, then checks the main with its imports; the reviewer sees every file; re-review only while public, withdrawn by Make private or by undoing; "An edit is waiting for review"; the card frozen at approval; the public page's View source and Open as new workspace; "approved version" |

## Also changed, with the docs

- **The compiler's message** for an import with no project folder (`src/module-messages.ts`): "…Imports work in the CLI and VS Code; a playground workspace is one program for now." becomes "…Imports work in a saved playground workspace, the CLI and VS Code." It still shows for an unsaved scratch buffer and for an API caller with no files. `tests/modules-syntax.test.ts` pins it.
- **The screenshot:** `docs/images/workspace-files.png` and `workspace-files.dark.png`, from `verify/shoot-2e-step7-workspace-files.ts` on the dev stack (a throwaway workspace; the site's header left out, so no account name shows).

## Checked

- `npm run build:docs`: every page builds; the two images are checked and copied.
- Every `#…` link in the five pages names a heading on the built page (`tmp/2e-step7/check-anchors.ts`). `npm run check-links` crawls the served site, which only `build:website` refreshes; that waits for the ship (it would regenerate the blog over your edits).
- The module tests and the docs-example tests.

## The content review

Sixteen findings, all applied (`reviews/phase-2e-step7-docs-review.md`). Two were wrong claims in publishing.md, now said as the code behaves, with a question each for you: edits made while a submission is pending aren't reviewed until the next save after approval; and a rename changes the URL at the next approval, the old one stopping. The screenshot was retaken with modules.md's own example.

## The CHANGELOG

Drafted in `64-phase-2-changelog-draft.md`: one entry for 2b to 2e (94 commits, and this step's docs), with its own short list of things for you to decide. It goes into `CHANGELOG.md` when you approve.

## Approved (2026-11-17)

The docs and the CHANGELOG entry, as drafted. Both review questions kept as documented; the never-approved cards' question deferred to the snapshots work (note 58, "Step 7, done").
