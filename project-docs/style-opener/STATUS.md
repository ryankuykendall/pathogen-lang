# Style-block opener `${ … }` → `#{ … }` — STATUS

_Phase B of the 2026-09-03 assessment (`../retire-annotated/PLAN-v1-assessment.md`, "Part 3"). Decision: hard cutover, no alias; one-shot KV migration._

## Done (2026-09-03, branch `retire-annotated`)

- **Grammar**: `styleBlockOpen { "#" "{" }`; the `@precedence { styleBlockOpen, templateInterpStart }` line is gone — the two tokens no longer share text. Regenerated with the same four tokenizer groups and term ids; `keyof` annotation intact. `path-args-tokenizer.ts` no longer swallows a bare `#`.
- **Codemod** (`scripts/migrate-style-opener.ts`, library `scripts/lib/legacy-style-opener.ts`, 19 tests): builds the FROZEN pre-change grammar (`scripts/legacy-style-opener/`) at runtime with `@lezer/generator`; the old parser's `StyleBlockLiteral.from` decides which `${` are openers. Content check (empty, `name:` declaration, any `;`, underscore stand-in, or an unclosed property-name prefix) rejects the interpolations that error recovery wraps in a block node (fragments in the Broken Lines post, JS in bare fences). Handles Markdown fences, TS/JS literals (JS interpolations become same-length identifier stand-ins; `${'${'}` smuggled openers), snippet placeholders (skipped). Idempotent by the `#{` guard. Corpus run: 4,426 openers in 536 files; 75 flagged for review (all legitimate, next to intentionally broken examples); 6 rejected as interpolations (all correct).
- **Diagnostic**: `LEGACY_STYLE_OPENER_MESSAGE` at the `$`, cascade inside the block suppressed, never inside templates/style bodies; CLI `parse()` throws it with line/column. Quick fixes: single `$`→`#`, and *Convert all* via `findLegacyStyleOpeners` (parser-driven fixpoint, exported through `window.PathogenLang`).
- **Playground**: `#` keystroke → style-block / declaration snippets (never inside a style block, where `#` is a hex color); `$` → interpolation snippet in style values only; `cm-completion-bridge` word classes include `#`; `codemirror-setup.ts` legacy scanner keys on `#{`; `font-loader.ts` `extractFontReferences` regex on `#{` (caught by tests); `scope-cache.ts` guard on `#{`; persistent toast with **Convert all** action (`app-toast` gained `action`) on any code load that still holds legacy openers — no silent rewrite.
- **VS Code / LSP**: TextMate `style-block` begins at `#{`; `newfile` / `define` snippets; `#` trigger character (feature catalog updated).
- **Docs**: `docs/syntax.md` (opener + migration note), `docs/layers.md` callout, `docs/markers.md`; editor's note in the Broken Lines blog post; CHANGELOG breaking-change entry; `scripts/CLAUDE.md`, `packages/vscode-pathogen/CLAUDE.md`.
- **KV migration** (`scripts/migrate-style-opener-kv.ts`): four key families, hash recompute, `rev` bump, `updatedAt` re-read, `--backup-dir` required for writes, live-parser second opinion. Dev dry run: 337 migrated, 0 parse-check failures, 0 errors. **Prod run executed 2026-09-04** after the deploy was confirmed live: dry run 157 migrated / 2 skipped-no-legacy / 0 parse-check failures / 0 errors; confirmed run identical (135 workspaces, 20 approvals, both queues; 748 openers rewritten; 157 pre-images under `.kv-backups/prod/`, git-ignored); second confirmed run 0 migrated, 0 writes (93 already-migrated + 66 no-legacy). Reports: `.kv-backups/prod/kv-prod-{dry,run1,run2}.json`. **Still due: one more confirmed run 24–48 h later** (2026-09-06/07) for workspaces saved by a browser that still had the old client cached.

## Code review (2026-09-04) — findings and fixes

- **Critical, fixed**: `isLegacyStyleOpenerError` trusted ancestor *names*; where the grammar demands a `StyleBlockLiteral` (the `PathLayer('a') ${ … }` constructor form, `let pl = PathLayer(…) ${ … }`, `base << ${ … }`) error recovery synthesizes one around the stray `${`, so the diagnostic, quick fixes, and toast were silent for those forms. Now each ancestor must also start with its genuine opener (`#{` / backtick). `parse()` (CLI) also reports a legacy opener found anywhere in the tree ahead of an unrelated earlier error, matching the editor. Tests added for all three forms and the CLI parity case.
- **Warnings, fixed**: "Convert all" in the playground now goes through `codeEditorPane.replaceDocument()` — one undoable CodeMirror transaction whose update listener fires `code-change`, so the store, autosave, and recompile follow as for typed edits (the `code` setter installs a fresh EditorState and was wrong for an in-place edit). `legacyBlockEnd` skips braces inside quoted strings and templates. The codemod's declaration shape rejects bash parameter expansion (`${VAR:-x}`). The KV script re-reads approvals and queues immediately before writing and skips on any change. `PathLayer('a') #` offers the style-block snippet.

## Gates

| Gate | Result |
|---|---|
| (a) SVG byte-identity, 264 samples, before vs after | 0 unexpected diffs (3 differ, all in the known GPU-nondeterministic set of 18) |
| (b) render snapshots | pass (in the full suite) |
| (c) formatter idempotency | **not applicable as designed**: all 264 committed samples were already NOT formatter-clean at HEAD (the ≥5-arg call wrap rule re-flows every gradient constructor). Verified instead that the working-tree samples equal codemod-only output (0 drift). Follow-up below. |
| (d) full Vitest suite | 123 files, 5,393 passed |
| (e) docs + blog rebuild, link check | see commit notes |
| (f) playground manual | pending user check (dev server serves a rebuilt `public/`) |
| (g) VS Code token inspection | pending user check; extension built |

## Follow-ups

- `format:samples` reflows 157 committed samples (5-arg gradient constructors) — pre-existing; decide whether to reformat the corpus or relax `shouldWrapArgs` for short simple-arg calls (memory note from the easing cycle). During the concurrent formatter run five post11 samples failed to compile; verify whether the formatter's reflow of those files is at fault before reformatting.
- `${ }` prose in `website/blog/switch-case-comes-to-pathogen.md` and `docs/syntax.md` switch section describe interpolation and stay correct; `docs/textblock.md` "Escaping `${`" section is about templates and stays.
- Delete `scripts/legacy-style-opener/` and the two migration scripts after the 24–48 h follow-up production KV run (the immediate second run on 2026-09-04 is done).
- `project-docs/**/*.md` primers keep the syntax of their day (`.pathogen` demos are migrated). `--include-project-docs-md` exists if a sweep is ever wanted.
