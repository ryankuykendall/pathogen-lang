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

## Field report 2026-09-05 — many warnings at one site

Reopening the *Ewert vs stroke-array tweaking* workspace (≈5,000 `corner-op` warnings, all at line 76:12) rendered correctly, then showed `Maximum call stack size exceeded` with no layers. Reproduced with `verify/many-warnings-e2e.mjs`: 300 fillet calls (1,200 warnings) produced 1,200 nested `.cm-warning-char` spans on one token; at 600 the page stopped answering the debugger for over a minute, and at 1,500 (6,000 warnings) the console logged `Failed to load CodeMirror: RangeError: Maximum call stack size exceeded` — the editor's own recursion over the nested marks. Cause: `highlightWarnings()` built one line + one mark decoration per warning. Fix: `dedupeHighlightPositions()` (dedupe by line/column/severity, cap `MAX_HIGHLIGHT_POSITIONS` = 200) inside the highlighter, a `try/catch` around the cosmetic highlight call in `updatePreview`, and a 200-row cap per section in the debug capture. Follow-up (closed the same day, next section): the console pane still rendered one `log-entry` per warning mirror (thousands of custom elements).

## Follow-up 2026-09-05 — warning families with counts

The messages behind that report were near-identical, not identical: the vertex index and effective radius vary and the clamped/skipped pairs alternate, so exact-string or consecutive-run collapsing would have left thousands of rows. `src/evaluator/warning-groups.ts` groups by *family* — warning code + source position + message with every number replaced by `#` — in first-occurrence order, keeping the count and the instances (`groupWarnings`, `groupWarnLogEntries`, `warningFamily`, `WARNING_GROUP_INSTANCE_LIMIT` = 200, all exported from the library). Emission is untouched: `CompileResult.warnings`, the `[warn]` log mirrors, and `--json` carry every instance.

Surfaces: the console renders one `log-entry` per family with a `×N` chip that expands (lazily) to at most 200 instances plus a `… N more` trailer; CLI stderr prints the first instance and `  … N more like this`; the LSP publishes one diagnostic per family with `(×N similar)`; Copy Debug Info lists one row per family with `(×N)` and drops the `[warn]` mirrors from Log Output (they were listed twice before). The playground reaches the helper through `window.PathogenLang`, so `npm run build` must precede `npm run typecheck:playground` after adding a library export. Two rules the code review caught the same day: numbers inside single quotes are part of the family (`TopoGradient 'surface1'` vs `'surface2'` had collapsed — the first draft stripped every digit), and warnings without a source position (`gradient`, `font-glyph`, emitted once per entity with the name as the only identifier) are never merged at all, so two font weights missing different glyph counts cannot fold into one row either.

Verified: `verify/many-warnings-e2e.mjs . 1500` against the dev site → 6,000 mirrors, 2 console rows, chips `×3,000`, first chip expands to 200 instances + `… 2,800 more`, no page errors, page responsive in 13 s; CLI on the 50-iteration fixture → 2 warning lines + 2 count lines, `--json` 200 warnings; `verify/storybook-log-entry-e2e.mjs` → the log-entry "Warning Group" story renders `×3` with its accessible label and expands to 3 instances. Tests: `tests/warning-groups.test.ts`, `tests/playground-console-grouping.test.ts`, `tests/playground-debug-capture.test.ts`, plus grouping cases in `tests/cli.test.ts` and `tests/warnings.test.ts`.

## Not done / follow-ups

- Editor-side provenance UI (hover a path segment → source line) — item 6 of the assessment, deferred.
- `log()` inside `text(){}` bodies (grammar).
- validate-samples check #3 is bounding-box based (`known-issues.md` ISSUE-012); `getPointAtLength` sampling would remove the false collisions the playbook warns about.
- Docs fences are still not compile-tested (ISSUE-013); `--json` makes a sweep script cheap.
