# Phase 1a step 7: the checks before the push

2026-11-05. Step 6's code is all committed (6e65e1f … 5206e1b). You verified the VS Code preview of `tmp/modules-manual-test/main.pathogen` (two gears) on 2026-11-05 and asked to "move onto step 7 and then address the optional 'add the new files to the file tables'".

## Results

| Check | Result |
|---|---|
| Semantics audit vs `8cbe778`, on the step 6d tree (`tmp/phase1/tree-step6d2`) | 1,470 programs: 1,398 unchanged, **0 changed**, 68 skipped, 4 too large (the boolean-ops failure matrices, as always) |
| Skip list vs the pen-helper audit (`audit-skip-diff.ts`) | Newly skipped: exactly the 16 fences in docs/modules.md and the 2 files of `packages/vscode-pathogen/test-fixtures/modules/`. Nothing else moved |
| `verify-phase1-surfaces.ts` | **17/17**: engine, CLI, VS Code preview path, playground bundle |
| `verify-step6c-lsp.mjs` on the bundled server (`PATHOGEN_SERVER=packages/vscode-pathogen/server/out/server.js`) | **16/16**, the same as the package build |
| `verify-phase1-playground.mjs`, the real playground on :3000 | **4/4** |
| Docs approval (22-) | **Approved 2026-11-05** ("Approve"): no docs change waits on you |
| Production KV scan (decision 34, plus a bare `module;`) | You said yes. The first try failed with `Authentication error [code: 10000]`; one `npx wrangler whoami` refreshed the sign-in. Then, read-only: `scan-kv-keywords.ts --env prod --confirm`, **0 of 220 programs** (194 workspaces, 20 approvals, 6 queue entries) use `import`, `export` or a `module;` line. Export to `tmp/kv-sources/prod` (read-only), then the semantics audit vs `8cbe778` on the final tree (`tmp/phase1/tree-crossfile2`): 209 unchanged, **0 changed**, 10 skipped (the baseline parser rejects them: the known missing-`;` programs), 1 too large (1,926,648 commands, no result in 240 s) |

## verify-phase1-surfaces.ts

One temp project (the docs' gears library, a kit passing two names on with `export const gear = gears.gear;`, and five programs), each run through the call that surface really makes:

- **engine**: `resolveModules` with the Node host, then `compile`;
- **cli**: `node dist/cli.js <file> --json`;
- **vscode**: the bundled `server/node_modules/pathogen-lang/node` `resolveEditorModules`, the graph through JSON with `files` as entries (as `preview-modules.ts` posts it), then `compiler/index.global.js` in a fresh `vm` realm;
- **playground**: `dist/index.global.js` in a fresh realm, `compileWithContext`.

Checked: main draws one identical path on engine, CLI and VS Code; the playground gives the docs' no-project-folder error at line 1; `export` without `module;` is the docs' error on all four; a module compiled alone draws nothing on all four; a module's top-level `M 0 0 L 10 10` is the docs' error on all four; a one-file program is identical on all four.

## verify-phase1-playground.mjs

The served site from `npm run dev:website` (the dev stack wasn't running, so a plain build was allowed), scratch workspaces through `?state=`:

1. `import { gear } from "./parts/gears.pathogen";` → the error panel reads `Line 1:1 — Cannot import "./parts/gears.pathogen": this program has no project folder …`.
2. `export const size = 4;` → `Line 1:1 — export only works in a module. …`.
3. A `module;` workspace → no error panel, no drawn path.
4. F2 on `dot` in `export fn dot(x)` → the alert `dot is exported, so other files may use it. Renaming across files isn't supported yet: rename it in each file.`, and no prompt for a new name.

The site build regenerated `website/blog-static/*.html` and `playground/utils/blog-content.js` with differences that predate phase 1a (the step 5 renames, e.g. `arc` → `arcCommand`, never rebuilt into the committed copies). website/CLAUDE.md calls `blog-static/` auto-generated, so both were restored with `git checkout`, not committed.

## CHANGELOG

The entry `## [Unreleased] - 2026-11-05 (modules: import and export)` covers all 22 commits since `8cbe778`. A subagent drafted it from the commit messages and these notes (`tmp/phase1/changelog-draft.md`). I changed:

- two "Fixed" items that were bugs only inside phase 1a's own unpushed code: the `import { circle }` → `circleValue` quick fix (imports didn't parse before 023dd75); and the sibling-fn parameter hints (released hints showed `draw(...)` with no parameters). The second is folded into the "Changed" parameter-hints line;
- the step 6e and uncommitted-verify TODOs.

The draft also flagged:

- plan 12 and decision 33 still describe the pre-5e rules (`export` anywhere, an imported file's drawing run then discarded). 23-/24- supersede them; plan 12 was never amended.
- docs/modules.md line 348 says an error in another file "shows at its own line too" when that file is open. See "A gap: the error at its own line" below.

The one TODO left, the production scan's result, is filled in from the results above.

## A gap: the error at its own line

docs/modules.md line 348 ("In each tool", VS Code): "the error is shown on the call (or the import) in the file you're editing. The message there names the line in the other file, and if that file is open, the error shows at its own line too." Plan 12 decision 31 says the same. **The second half was never built.** Step 6c placed the error on the call and named the line; it never published anything to the other file.

- The language server publishes only for the document it just checked (`server.ts`, `connection.sendDiagnostics({ uri: textDocument.uri, … })`).
- The other file's own check can't see an error that only a caller's arguments cause. `tmp/phase1/probe-open-file-error.ts`, with the docs' own example (main calls `gear(…, 2)`, and `assert(teeth >= 3, …)` fails inside `gear`):
  - `/main.pathogen`: 1 diagnostic, line 3: `parts/gears.pathogen line 4, col 3: assertion failed: a gear needs at least 3 teeth` / `called from main.pathogen line 3`;
  - `/parts/gears.pathogen`: 0 diagnostics.
- An error raised while the other file loads (`imported from`) does show, because that file's own check runs the same top level.

Two ways out: build it (a step 6c follow-up, its own commit and checks), or take the clause out of line 348 (a docs change, so your approval again). Asked 2026-11-05; you chose "Build it". **Built and committed as `6f2e3f1`** (`36-phase-1a-step6c-error-at-its-own-line.md`).

## File tables (your "optional" item)

- `src/language-services/CLAUDE.md`: a `module-exports.ts` row; the options on `diagnostics.ts`, `signature-help.ts`, `navigation.ts` and `rename.ts`; the `tests/modules-editors.test.ts` mapping; completion items with their own `range`.
- `src/CLAUDE.md`: `host/load-modules.ts`, `module-messages.ts`, and the editor functions in `node/index.ts`.
- `packages/vscode-pathogen/CLAUDE.md`: `src/preview-modules.ts`, the server's `src/modules.ts`, imported fonts in `fonts.ts` / `font-session.ts`, the watcher and `untitled` documents in `extension.ts`, the trigger characters (`.`, `$`, `#`, `@`, `&`, `:`, `"`, `/`), the F2 refusal, and the module tests and verify scripts in "Testing".

## Still open

- Checklist #11 in `tmp/modules-manual-test/CHECKLIST.md`: whether VS Code displays F2's refusal text. The server sends it (16/16 above); the playground shows it (4/4 above).
- The push (your go-ahead). After it, `tmp/kv-sources/prod` (copies of users' code, gitignored) is deleted when you say so.
- Checklist row 11b (the error at its own line, in VS Code).
- `tmp/phase1` is about 18 GB of tree copies and audit work dirs, all gitignored. Cleanup waits on your word.
