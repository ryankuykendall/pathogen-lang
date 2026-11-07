# Phase 2 mockups v6: your review, and step 2b

2026-11-07. Mockups: `phase-2-mockups-v6/` (bbwp `2026-11-07-11:58:50--multi-file-workspaces--mockup-v6.bbwp.html`). Decisions before it: `45-entry-points-decisions.md`.

## Your feedback, in your words

- "#1 is reviewed and approved; Let's proceed with step 2b."

**How I read it.** "#1" is the first next step in my summary: "You review v6 and answer the two questions above." So v6 is approved as drawn, including the two behaviours on screen E that were marked as proposals. If you meant only the first question (deleting the main), the second, the main gaining `module;`, is still open; say so.

## Decided

| Question | Decision |
|---|---|
| v6 as a whole | Approved |
| Deleting the main | The next entry in `entryPoints` becomes the main, and a toast says which (screen E, state 3). This replaces v5's "`main.pathogen` takes over, or you're asked" |
| The main gains `module;` | It stays first, and the chip shows an error on it until `module;` comes out or another program is set as main. Another program that gains the header leaves the list, and is appended again if the header goes (screen E, state 4) |
| Mockups (2a) | Done. Phase 2's UI is designed; changes from here come with the docs and the storybook in 2d |

## Step 2b: where it stands

1. **`docs/projects.md` and `docs/cli.md`:** `entryPoints`, the two kinds of entry checks, the error messages, and a "What changed" line for `main`, which has been on the docs site since 2026-10-23. These are **uncommitted edits in the working tree**: committing and pushing would publish them before the CLI does what they say. They land in one push with the code.
2. **The playground page**, "Files in a Workspace": `drafts/workspace-files.md`. Where it lives until 2d ships is a question for you (below).
3. **Content review** of both: `reviews/phase-2b-docs-review.md`.
4. **The storage design:** `47-storage-design.md`.

## The draft page's location (a question for you)

The rule in CLAUDE.md is that a feature starts with `docs/<feature>.md`, registered in `DOC_FILES`. But registering a page publishes it with the next push, and this page describes UI that ships in 2d. The options:

1. **`docs/workspace-files.md`, not yet in `DOC_FILES`** (recommended). The build reads only `DOC_FILES`, so the page isn't published, and `tests/docs-examples.test.ts` reads every file in `docs/`, so its examples are tested from now on. Registering it in 2d is the switch that publishes it. Pushes of other work aren't blocked.
2. **`docs/workspace-files.md`, registered, with every commit held locally until 2d**, as phase 1a did. Every push waits for weeks.
3. **Stay in `project-docs/modules/drafts/`** and move at 2d. Its examples aren't tested until then.

## Marked [TO CONFIRM] in the draft page

These come from the recommendations in `38-phase-2-audit.md` and haven't been reviewed on their own:

- **Undo per file:** each file keeps its own undo history while the workspace is open (38, Q8).
- **Errors in other files:** clicking the file's name in the error panel opens it at that line, and a red dot in the tree marks the file (38, Q6). The dots are drawn in the mockups; the click isn't.
- **Limits and name characters:** from the storage design.

## For 2d, from the content review

- **A mockup for the empty preview:** a workspace with no programs left. The draft page says the preview "is empty and says to add a program", but no mockup shows it. It should also show the thumbnail and the explore cards for a workspace with no main.
- **Decisions the draft page marks [TO CONFIRM in 2d]:**
  - whether moving a file updates its own `./` and `../` imports (recommended: yes);
  - Rename… and Delete… on folders (recommended; not drawn);
  - how Duplicate names the copy (recommended: `gears-2.pathogen`, as Keep both does).
- **For 2c:** whether an `@font` file path in a workspace keeps today's warning (recommended, until font files can be added) or gets the CLI's error.
- **When the playground page publishes,** `docs/projects.md` adds after "it records the order of the project's programs": "The playground's program list follows that order ([Files in a Workspace](#workspace-files-pathogenjson))."

## The checklist for the code that follows the docs

- `src/host/project.ts`: `KNOWN_KEYS`, `resolveMain` → the entry-points checks, the old-`main` message.
- `src/cli.ts` `readInput`: the main is the first entry or `main.pathogen`; the existence and module checks; the new messages. Also the `--help` text ("Compile the "main" named in <folder>/pathogen.json") and `src/CLAUDE.md`'s CLI options and `project.ts` lines.
- Tests: `tests/host/project.test.ts`, `tests/cli.test.ts`, `tests/host/node-host.test.ts`. The messages are pinned word for word from the docs.
- VS Code: `packages/vscode-pathogen/test-fixtures/modules/pathogen.json`. Rerun `project-docs/modules/verify/verify-step6c-lsp.mjs` and `verify-step6d-preview.mjs`, since every tool reads `pathogen.json` through `loadProjectFileSync`.
- The CHANGELOG's Unreleased entry for `pathogen.json`.
- The month in `docs/projects.md`'s "What changed (November 2026)" callout: set it to the month the code lands.
- Unchanged: the repository's root `pathogen.json` (`{}`). The v1 and v2 mockup folders keep their `{ "main": … }`; they are historical and nothing compiles them.
