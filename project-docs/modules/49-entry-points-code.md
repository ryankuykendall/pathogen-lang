# The `entryPoints` code (step 2b, CLI and host)

2026-11-07. It implements the approved `docs/projects.md` and `docs/cli.md` contract: notes 44 to 46 for the decisions, `reviews/phase-2b-docs-review.md` for the docs review, and the user's approval in note 48.

## What changed

- **`src/host/project.ts`:**
  - `parseProjectFile` checks only the shape, because every tool reads `pathogen.json` through it: a list of paths inside the project folder, each ending in `.pathogen`, with forward slashes, none written as a folder (`dir/`).
  - Also from `parseProjectFile`:
    - a leftover `main` (with its own message when `entryPoints` is there too);
    - "Did you mean" for a key that differs only in case;
    - the known-keys message for any other unknown key.
  - `projectMain` applies the use-time rules (not empty, no file twice) and returns the main: the first entry, or `/main.pathogen`.
  - The messages for the folder compile's main live here too, so the tests can pin them.
- **`src/cli.ts`:**
  - `readInput`, and `parseArgs` with it, are now async.
  - The main is read through `readProjectFile`, the reader imports use, so its letter case and links are checked as an import's are, then `isModuleSource`.
  - `readText` is gone; its two messages, for a folder and for a file that can't be read, are kept word for word.
- **`src/index.ts`** also exports `projectMain`, `CONVENTIONAL_MAIN` and the `ProjectEntry` and `ProjectMain` types, for the playground in 2c.
- **Tests:**
  - `tests/host/project.test.ts` is rewritten;
  - the folder tests in `tests/cli.test.ts` are rewritten, and new ones added (every message in the docs' Errors table, a symbolic link that leads outside);
  - `tests/host/node-host.test.ts` is updated.
- **Other files:** the VS Code fixture `pathogen.json`, the CHANGELOG, and `src/CLAUDE.md`.
- **Two Errors rows added to `docs/projects.md` after your approval,** both for cases the code had to handle: a main reached through a symbolic link that leads outside, and `main` next to `entryPoints`.

## Verification

- `tests/host/project.test.ts`, `tests/cli.test.ts` and `tests/docs-examples.test.ts`: 277 passed after the review fixes.
- The full suite before the review fixes: 197 files, 8,430 passed, 7 skipped, 1 todo.
- **CLI end to end:** `pathogen-lang packages/vscode-pathogen/test-fixtures/modules` gives byte-identical output to compiling its `main.pathogen` by name.
- **VS Code:**
  - `npm run build` and `npm run build:vscode`;
  - `verify-step6c-lsp.mjs` against the bundled server: 19/19;
  - `verify-step6d-preview.mjs`: 8/8.
- **Lint:** no new problems in the changed lines. `tsc -p tsconfig.json` and `eslint` report many problems that were already there, in lines this change didn't touch.

## Code review (code-reviewer agent)

No critical findings: 3 warnings and 3 suggestions, all handled.

| # | Finding | Disposition |
|---|---|---|
| 1 | The symbolic-link and unreadable branches had no CLI test, and the folder and unreadable messages aren't in the docs table | **Applied:** a CLI test for a link that leads outside (skipped on Windows). The folder and unreadable messages are unchanged from before this change and weren't in the table before either. Left as they are |
| 2 | The old-`main` and not-a-list hints could suggest a value that fails next (`"poster"`) | **Applied:** a suggested value must pass as an entry, with its `.pathogen`; otherwise `main.pathogen` is suggested. Tested |
| 3 | `main` next to `entryPoints` said to replace it with a key that's already there | **Applied:** `"main" is no longer a key; remove it. The first entry in "entryPoints" is the main.` Tested, and added to the docs row |
| 4 | `"dir/"` gave a nonsense suggestion; `"x.pathogen/"` was accepted; `"Poster.PATHOGEN"` suggested `.PATHOGEN.pathogen` | **Applied:** an entry written as a folder fails the path rule, and a wrong-case extension is suggested as `.pathogen`. Tested |
| 5 | Edge cases not covered by tests: `./`, `/`, non-string entries | **Applied:** `./`, `/`, `parts/`, `poster.pathogen/`, `null` and `parts/../poster.pathogen` |
| 6 | The duplicate message shows entries as written | As the docs say; no change |

## Found while verifying: VS Code doesn't report a broken `pathogen.json` for a file that only imports

This predates this change; phase 1a shipped it.

- **The CLI** reads `pathogen.json` for any program with `import` or `@font`, and stops on a broken one.
- **VS Code reads it only in its font code.** The language server's `DocumentFonts.forDocument` (`packages/pathogen-language-server/src/fonts.ts:102`) returns early for a file with no `@font` in it or in the files it imports. The preview's `FontSession` works the same way. The shared module loader, `resolveEditorModules` (`src/node/index.ts:776`), never reads `pathogen.json`. So in VS Code, a file that imports but uses no `@font` compiles normally with a broken `pathogen.json` (say, a leftover `main`), where the CLI stops.
- **The approved docs say otherwise.** Two places claim VS Code stops such files with the CLI's message: the "What changed (November 2026)" note, and the In each tool VS Code bullet. For an import-only file that isn't true yet.
- **Fix, if wanted:**
  - `resolveEditorModules` checks `pathogen.json` when a document has imports, and reports the message as a load error at the first import's path. That covers the language server and the preview at once.
  - The two font paths then skip their copy of the message for a document with imports, so a file with both `import` and `@font` doesn't get it twice.
  - Tests in `tests/language-server-modules.test.ts` and `tests/vscode-preview-modules.test.ts`, then the two verify scripts.
- **The `entryPoints` commit is kept local** until you choose: fix the gap first and push them together (recommended), or narrow the two docs sentences and push now.

## For the end of phase 2

Gathered from notes 45 and 49:

1. `pathogen-lang <folder> --entrypoint=file.pathogen` (note 45).
2. `pathogen-lang <folder> --all`, for every entry point (note 45).
3. **`pathogen-lang create <project-name>`** (your message, 2026-11-07): "if we are relying on a pathogen.json file going forward, we should probably add a way of bootstrapping a new pathogen project from the command line: pathogen-lang create project-name where 'project-name' is the name of a directory to be created, and it stubs out the main.pathogen file as well as the pathogen.json file."

   To settle then:
   - **What it writes.** Recommended: the same two files a new playground workspace starts with. `pathogen.json` is `{ "entryPoints": ["main.pathogen"] }`, written as the playground writes it. `main.pathogen` is the playground's starting program. A project then looks the same wherever it began.
   - **How the CLI tells it apart from a file.** Today `pathogen-lang create` compiles a file named `create`. A subcommand makes `create` a reserved first word, so such a file would need `./create`. A flag (`--create=<name>`) avoids that.
   - **Refusals:** a folder that already exists and isn't empty, or a name the storage rules (note 48) wouldn't allow, so a project made on disk can also become a workspace.
   - Docs first, as always: `docs/cli.md` and `docs/projects.md`.
