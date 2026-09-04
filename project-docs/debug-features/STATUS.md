# Debuggability features (Phase C) — STATUS

_Phase C of the 2026-09-03 assessment (`PLAN-v1.md` here; decisions in `../retire-annotated/PLAN-v1-assessment.md`)._

## Done (2026-09-04, branch `retire-annotated`)

| Item | Where |
|---|---|
| Warnings channel (`CompileWarning`, codes `corner-op` / `cut` / `annotation-transfer` / `font-glyph` / `gradient`) | `src/evaluator/types.ts`, `warn()` in `src/evaluator/index.ts` (22 sites), `segments.ts` `CornerOpWarning` carries `op.loc`; CLI stderr; `log-entry.ts` chip; `diagnostics.ts` Warning severity; `playground/types/compiler.d.ts` |
| `log()` logging-only, `ln()`, `assert()` | `STATEMENT_BUILTINS` in `constructor-registry.ts` + `generate-completions.ts`, `scope-analysis.ts`, `semantic-tokens.ts`, `code-actions.ts`; `evaluateStatementBuiltin` hooked at the `PathCommand` statement case and in `&{ }` bodies; value position throws; `pathogen-api.ts` declarations; TextMate keyword |
| `trace` option, `records` + per-layer `commands`, `--json` | `CompileOptions.trace`, `EvaluationState.trace`, `traceFields()` in `buildCompileResult`, `src/render/json-document.ts` `toJsonDocument`, CLI `--json` |
| PathBlock / ProjectedPath `.d` + `.commands`, `log(block)` preview | member switches in `index.ts`, `PathogenPathCommandRecord` `@type` |
| `--png` | `renderPng()` in `src/cli.ts` (dynamic puppeteer import) |
| `validate:samples` | `package.json`; `scripts/validate-samples.ts` default dir + per-post sweep, real `--margin`, fixed union |
| Test helper | `expectCommandSequence` in `tests/helpers.ts`; `tests/CLAUDE.md` |
| Playbook | `project-docs/developer-experience/pathogen-debugging-playbook.md`; referenced from `.claude/CLAUDE.md`, `src/CLAUDE.md`, `scripts/CLAUDE.md`, `website/blog/CLAUDE.md`, `website/guidelines/text-collision-debugging.md` |
| Docs | `docs/debug.md` rewritten; `docs/cli.md` (`--json`, `--png`, exit codes, warnings); `docs/stdlib.md` (`ln`); `docs/path-blocks.md` (`d`, `commands`) |

Tests: `tests/statement-builtins.test.ts`, `tests/warnings.test.ts`, `tests/trace.test.ts`, additions to `path-blocks`, `helpers`, `cli`, `constructor-registry`, `completion`, `semantic-tokens`, `diagnostics`.

## Findings along the way

- Statement-position calls are `PathCommand { command: '' }` nodes, not `ExpressionStatement`s — the reason `log(sqrt(9));` leaked a number into path data.
- `text(x, y) { … }` bodies reject calls at the grammar level (`textBodyItem`); `log()` there is a grammar extension, not done.
- ~~Corner-op finalizers returned before emitting warnings when nothing changed, so skipped ops were never reported; fixed (warnings first).~~ **Correction (code review):** `applyRecordedCornerOps` sets `changed: true` as soon as any corner op is present, so `warnings.length > 0 && !changed` is unreachable; the reordering is harmless, not a fix.
- `Color.hex/.css/.oklch/...` readback already existed; documented in the playbook instead of re-implemented.
- Playground `store.logs` was never set (debug capture always said "no log output"); fixed.

## Code review (2026-09-04, `code-reviewer` agent) — 7 warnings, 3 suggestions, 0 critical

| Finding | Resolution |
|---|---|
| First-class `PathLayer('name')` values created their context without `trackHistory`, so `commands` was empty under `trace` | `createPathContext({ trackHistory: !!scope.evalState.trace })` at the constructor site; `tests/trace.test.ts` covers the first-class form |
| `docs/debug.md` promised an editor squiggle the playground never drew (only the LSP did) | Implemented: `cm-error-highlight.ts` positions carry `severity`, `code-editor-pane.highlightWarnings()`, `cm-warning-line/char` CSS, called from the success path of `updatePreview` |
| `validate-samples` per-post sweep crashed with `ENOTDIR` on a stray file (`.DS_Store`) next to post directories | `statSync().isDirectory()` instead of `existsSync` |
| `--json --png` silently dropped `--png` | Rejected like `--output-svg-file` / `--render-gpu`; docs + usage + CLI test |
| `--png` relied on duplicate `width`/`height` attributes (first wins) | The opening `<svg>` tag's own `width`/`height` are stripped before the viewBox-derived ones are injected |
| `docs/debug.md` sample showed `"cssProperties": {}` (it is an array) and omitted `loc.offset`, `calledStdlibFunctions`, `missingGlyphs` | Corrected |
| No `warnings[]` fixtures for `cut`, `annotation-transfer`, `font-glyph` | `cut` (sliver dropped, located at the call) in `warnings.test.ts`; `font-glyph` asserted in `font-provider.test.ts`; `annotation-transfer` guards an invariant that no program can break — documented in the test file instead of fabricated |

Found while re-verifying: the new headless Chrome mode's `captureScreenshot` stalled indefinitely (even for a plain `<p>`) with the display asleep; `chrome-headless-shell` (`headless: 'shell'`) rendered in 2 s. `renderPng` and the validator previews now use the shell (`verify/shot-probe*.mjs` are the probes).

## Not done / follow-ups

- Editor-side provenance UI (hover a path segment → source line) — item 6 of the assessment, deferred.
- `log()` inside `text(){}` bodies (grammar).
- validate-samples check #3 is bounding-box based (`known-issues.md` ISSUE-012); `getPointAtLength` sampling would remove the false collisions the playbook warns about.
- Docs fences are still not compile-tested (ISSUE-013); `--json` makes a sweep script cheap.
