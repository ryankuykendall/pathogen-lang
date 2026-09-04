# Two assessments: retire the annotated evaluator; move StyleBlock opener `${` → `#{`

_Status: assessment complete; decisions taken 2026-09-03 (see "Decisions")._

## Decisions (user, 2026-09-03)

1. **Sequencing**: remove the annotated evaluator FIRST as a standalone PR;
   build the replacement debug surface afterwards.
2. **Debug features greenlit** (all four bundles): warnings channel with line
   numbers; `--json` / trace output; PathBlock `.d` / `.commands` + `assert()`;
   `log()`/`ln()` split + `expectCommandSequence` test helper.
3. **Opener change**: hard cutover `${` → `#{`, no transitional alias; legacy
   `${` in expression position gets a migration diagnostic.
4. **Cloud data**: one-shot server-side codemod over the KV `WORKSPACES`
   namespace, dry-run first.

## Phase order

| Phase | Work | Why this order |
|---|---|---|
| A | Retire annotated (Part 1) | Stops the parity tax now; shrinks the corpus Phase B must migrate (`tests/annotated.test.ts` alone holds many style blocks) and removes 4 of the evaluator dispatch sites Phase C would otherwise mirror. |
| B | `${` → `#{` cutover (Part 3) | Before Phase C so the new docs pages are written once, in the new syntax. Before any public release. |
| C | Debug features (Part 2, items 1–5, 7, 8) | Each is docs-first per `.claude/CLAUDE.md`; independent of A and B once they land. |

Each phase is its own PR with its own `project-docs/<phase>/STATUS.md`.

| Phase | Effort | Net effect |
|---|---|---|
| A — retire annotated | 1.5–2 days | −9,000 lines; 87% of evaluator commits stop needing a mirror |
| B — `#{` cutover | ~4 days + 1 h unattended | grammar-level ambiguity gone; 4 completion heuristics + 2 duplicate scanners simplified; ~4,000 corpus lines rewritten mechanically; KV migrated |
| C — debug features | ~6–7 days | warnings with lines, `--json` trace, `.d`/`.commands`, `assert`, `ln`/`log` split, test helper, `validate:samples` |
| **Total** | **≈ 12–13 working days** | |

## Context

Two long-term-health questions for the Pathogen compiler, asked 2026-09-03:

1. **Annotated evaluator.** `src/evaluator/annotated.ts` is a second, parallel
   evaluator that emits comment-annotated path output. Its original job
   (verifying output via comments/API traces, light debugging) has been
   outstripped by the language itself, and every feature or bug fix now pays a
   parity tax to keep it in sync. Question: what does removal cost, and what
   should replace its debugging value?
2. **StyleBlock opener.** `${` opens a style block AND starts a template
   interpolation. The two are told apart only by Lezer's contextual token
   groups, and a growing pile of special-case code (grammar precedence lines,
   DFA-shaped `StyleContent` token, completion scanners, TextMate lookbehinds,
   AST-builder scanners) exists to keep them apart. Question: is switching the
   opener to `#{` worth a one-time migration, given there is one user today?

## Established facts (verified this session)

### Parity tax, quantified (git, since 2026-06-01)

| Metric | Value |
|---|---|
| `src/evaluator/annotated.ts` size | 6,611 lines |
| `src/evaluator/index.ts` size (main evaluator) | 10,503 lines |
| Commits touching the main evaluator | 52 |
| Commits that ALSO had to touch annotated.ts | 45 |
| Commits whose message mentions "annotated" | 44 (of 206 total) |

Roughly 87% of evaluator changes required an annotated mirror. Memory notes
record a recurring class of review-Critical "annotated parity" bugs: second
context-aware dispatch, own `sort()`, own `styleValueToCSS`, two independent
template formatters, `pendingFlow` module flag, six switch dispatch sites,
three text-body walkers, `buildAnnotatedResult` re-origin bug (still open).

### `${` disambiguation as it stands in the grammar (`src/parser/pathogen.grammar:496-573`)

- `templateInterpStart { "$" "{" }` and `styleBlockOpen { "$" "{" }` are
  lexically identical tokens; `@precedence { styleBlockOpen, templateInterpStart }`
  plus contextual token groups decide which one applies.
- Known consequence (memory, 2026-07-18): structuring style-block content in
  the outer grammar merges LALR states and `styleBlockOpen` wins inside
  templates, silently breaking every `${expr}` interpolation. Generator reports
  no conflict. This is why `StyleContent` stays an opaque DFA token and style
  declarations are hand-parsed in `ast-builder.ts`.
- Known consequence (memory, 2026-07-20): `StyleContent` cannot be externalized
  (token groups collapse 5→4, all template literals break).
- NOT affected by an opener change: `StyleInterp` / `styleContentInterp`
  (bare `${…}` inside style VALUES) are genuine interpolation and keep `${`.
  The 16-bit DFA table-size limits on those tokens are independent of the
  opener.
- `#` today: only `ColorLiteral { "#" $[0-9a-fA-F]+ }` (outer + inner grammar)
  and the path-args tokenizer's hex-color branch (`path-args-tokenizer.ts:165`).
  `#{` cannot collide with a hex literal (`{` is not a hex digit). Sigil-brace
  family already exists: `@{` path block, `&{` text block, `${` style block.

### Comment nodes are NOT annotated-only

`src/language-services/formatter.ts:248` formats `Comment` statement nodes to
preserve comments through `formatDocument`. The grammar comment at
`pathogen.grammar:462` ("preserved for the annotated view") is stale. The
`Comment` AST node, grammar rule, and ast-builder handling STAY.

## Part 1 — Retire the annotated evaluator

### Footprint (verified by exhaustive import grep)

Only three symbols escape `annotated.ts`: `evaluateAnnotated`, `AnnotatedLine`,
`AnnotatedOutput` (re-exported at `src/evaluator/index.ts:10502`; consumed by
`src/evaluator/formatter.ts` and `src/index.ts`). Excision is clean at two seams.

| Bucket | Lines | Files |
|---|---:|---|
| Delete outright, src | 6,679 | `src/evaluator/annotated.ts`, `src/evaluator/formatter.ts` |
| Delete outright, tests | ~1,876 | `tests/annotated.test.ts` (182 `it`) + ~250 lines of `describe('… annotated …')` blocks across 9 files |
| Delete outright, playground | 384 | `annotated-pane.ts/.css`, `styles/annotated.css` |
| Delete, docs | ~120 | `docs/cli.md:112-210` § Annotated Output; caveat blockquotes in `docs/path-blocks.md:876`, `docs/variable-offset.md:223`; `website/blog/pathblock-cutting.md:69` |
| Mechanical unwiring, src | ~55 | `src/index.ts` (`compileAnnotated`, `evaluateAnnotated`, `formatAnnotated`, `AnnotatedLine`, `AnnotatedOutput`, `FormatOptions` at `:130`), `src/cli.ts` (`--annotated`: `:6,19,44,403-405,859-870`), `src/worker.ts` (`:4,19,27,64-65`), `src/evaluator/index.ts:10501-10503` |
| Mechanical unwiring, playground | ~140 | 16 files: `compiler-worker.ts`, `workspace-view.ts` (`updateAnnotatedOutput` `:1230-1253`), `app-breadcrumb.ts`, `playground-header.ts`, `playground-main.ts`, `state/store.ts`, `types/store.d.ts`, `url-state.ts` (`ao` key), `debug-capture.ts`, `storybook-registry.ts`, `storybook-detail-view.ts` |
| Real surgery, shared src | 30–50 | type-widening `unknown → Value/Scope` in `types.ts:1038`, `value-semantics.ts`, `switch-match.ts`, `iteration-lock.ts`; 11 parity docblocks; audit `path-data.ts` `splitPathCommands` for deadness |
| Institutional docs | ~15 | `.claude/CLAUDE.md:106` checklist row, `src/CLAUDE.md` (12 hits), `project-docs/developer-experience/cross-system-feature-lifecycle.md:112` step 8 |

VS Code / LSP: zero source references. Scripts, api/, website build: zero
operational usage (`website/_worker.ts:1196` marketing sentence only).

### What must NOT be removed
- `Comment` AST node / grammar rule / ast-builder handling (formatter uses it).
- `src/evaluator/constructor-registry.ts` (language-services consumers).
- Shared modules extracted for parity (`value-semantics.ts`, `switch-match.ts`,
  `css-function-resolve.ts`, `iteration-lock.ts`, `struct-properties.ts`,
  `callback-methods.ts`): keep as modules, tighten their `unknown` types.
  Optional later: collapse `MatchHost` indirection in `switch-match.ts`.
- `parseWithComments`/`extractComments` (`src/parser/index.ts:185-220`): only
  `tests/parser.test.ts:1022` remains. Keep exported for now; note as dead.
- `website/blog/samples/post4/*-annotated.pathogen` and bbwp files: those are
  visually-annotated schematics, unrelated.

### Coverage to re-home before deleting `tests/annotated.test.ts`
19 "parity" tests there call `compile()` and pin main-evaluator behaviour.
Re-home as plain `compile()` string/command assertions in the owning suites:
`offset() bevel/miter joins` (`:1435`), `ProjectedPath draw()` (`:1465`),
label carriage byte-guards (`:1384`), `seams()` (`:1584`), apply-block
scoping (`:1619`). Also read `tests/struct-properties.test.ts:13` header —
that suite routes value checks through annotated; re-home on `compile()`.
`tests/path-roundtrip.test.ts:119-161` are characterization tests of
annotated's divergence; delete, they pin nothing about main.

### Migration steps (one PR, ordered so tests stay green at each step)
1. Build the replacement debug surface FIRST (Part 2 items 1, 2, 7) so
   `debug-capture.ts` "Copy Debug Info" swaps annotated output for the JSON
   trace instead of losing information.
2. Re-home the 19 parity tests + struct-properties coverage onto `compile()`.
3. Delete `annotated.ts`, `formatter.ts`, dedicated tests, scattered parity
   describes; unwire `src/index.ts`, `cli.ts`, `worker.ts`.
4. Playground: remove pane + toggles + store keys; make `url-state.ts:88`
   tolerate-and-ignore `ao` so old share links still load.
5. Tighten shared-module types; delete parity docblocks; update the grammar
   comment at `pathogen.grammar:462`.
6. Docs: remove `docs/cli.md` § Annotated Output + three caveats; CHANGELOG
   "Removed"; update `.claude/CLAUDE.md`, `src/CLAUDE.md`, lifecycle doc.
7. Mark resolved-by-deletion in `project-docs/` (bucket A list below) with a
   short note in a new `project-docs/retire-annotated/STATUS.md`; do not
   rewrite historical primers.

Bucket A folders that recorded annotated as an open gap (resolved by
deletion): `struct-destructuring/bug-ctx-transform-annotated.md`,
`language-service-audit`, `regex-audit`, `style-block-structure`,
`cutting-room` (#7b, #10, #19), `switch-case`, `angle-values`,
`angle-preserving-stdlib`, `variable-offset`, `path-cutting`, `rotate-labels`,
`array-first-last-filter`, `segment-suffixes-and-labels`, `known-issues.md`.

Breaking public API (pre-1.0, one user): `compileAnnotated`,
`evaluateAnnotated`, `formatAnnotated`, `AnnotatedLine`, `AnnotatedOutput`,
`FormatOptions`, worker message type `'compileAnnotated'`.

Estimated effort: 1.5–2 days including re-homed tests, excluding Part 2.

## Part 2 — Debuggability recommendations

Survey result (verified against evaluator dispatch, not just `.d.ts`):

**Exists but unsurfaced** (cheapest wins, build on these first):
- Geometry warnings ("Fillet radius clamped at vertex 3", chamfer skipped, …)
  are pushed into `logs` as `'[warn] …'` strings with `line: null`
  (`src/evaluator/index.ts:2004, 3042-3132, 3677-3757, 9751, 9801`). No
  severity, no source line, indistinguishable from user `log()`.
  `CompileResult` (`src/evaluator/types.ts:971-990`) has no `warnings` field.
- `compileWithContext(src, { trackHistory: true })` yields
  `context.commands[]` = `{command, args, start, end}` per emitted command
  (`src/evaluator/context.ts:340, 381-393`). Only consumer:
  `tests/context.test.ts:111`. This IS the structured form of what annotated
  output hand-rendered as comments.
- `PathRecord` / `PathCommandMeta` (`src/evaluator/types.ts:535-574`) carry
  `raw`, `commands[]`, `label`, `loc` per fragment, plus per-command
  `segmentLabel`, `endVertex`, `seamId`. Nothing surfaces "this fragment came
  from line N".
- `scripts/validate-samples.ts` (7 visual checks + PNG previews) has no npm
  script entry.
- `--include-metadata` already builds a partial JSON object
  (`src/render/build-tree.ts:135-147`), only as an embedded `<script>`.

**Does not exist:** `assert()`; `typeof`/`type()`; any way to read a
PathBlock's `d` string from inside the language (`formatValueForDisplay`
prints `PathBlock(N commands)`); Color readback accessors; enum listing;
`--json`/`--emit-ast`/`--trace` CLI flags; `DiagnosticSeverity.Warning` is
declared (`src/language-services/types.ts:22`) and never emitted (no
unused/shadowed variable, NaN coordinate, empty path, out-of-viewBox lint);
VS Code has no output channel, so `log()` is invisible there.

**Recorded pain points**: `log()` becomes ln() for bare numeric call args
(`isMathLogCandidate`, `index.ts:6562-6575`; cutting-room item 14); annotated
divergences #10/#16/#19; "Garbage tests" note asking for
`expectSVGPathCommandSequence(ctx, …)` (`project-docs/test-harness-for-ctx.md`);
~40 one-off `scripts/debug-*.ts` files = authors hand-rolling introspection.

### Recommendations (ranked; each replaces a slice of annotated's value)

1. **First-class warnings channel.** Add `warnings: CompileWarning[]`
   (`{ message, line, column?, code }`) to `CompileResult`; route every
   existing `'[warn] '` push through one `warn(scope, msg, loc)` helper; CLI
   prints to stderr with `file:line`; playground console renders with a
   severity chip; LSP maps to `DiagnosticSeverity.Warning` on the source line.
   Replaces: annotated's "why did this vertex not fillet" commentary.
2. **`--json` CLI mode + `compile()` trace option.** `pathogen-lang f.pathogen --json`
   emits `{ layers (with d + records), defs, viewBox, logs, warnings,
   commands? }`. Add `trace: true` compile option that turns on `trackHistory`
   and includes `context.commands[]` plus each `PathRecord.loc`. This is the
   machine-readable replacement for annotated output and directly serves
   sample-authoring agents (no more `scripts/debug-*.ts`).
3. **Introspection members on PathBlock**: `.d` / `.toPathData()` (relative,
   as drawn), `.commands` (array of `{command, args, end}` structs), plus
   `Color.hex` / `.oklch` readback. `log(pathBlock)` should print the first
   N commands, not just a count.
4. **`assert(cond, message?)`** stdlib statement that fails compilation with
   the source line. Cheap, and turns sample invariants ("row fits inside
   viewBox") into compile-time checks.
5. **`log()` collision fix**: make `log(x)` always a logging statement in
   statement position; keep `ln()` (already exists? verify) as the math
   function, and emit a deprecation warning when `log(...)` is used as a
   value. This is item 14 and bites every sample author.
6. **Editor-side provenance**: playground/VS Code "highlight source of hovered
   path segment" using `PathRecord.loc` + `PathCommandMeta`. Larger; defer.
7. **Test helper**: `expectCommandSequence(result, [['M', 0, 0], ['l', 10, 0]], { precision })`
   in `tests/helpers.ts`, built on `trackHistory`. Replaces `toContain('M')`
   assertions and the parity tests that lose their partner.
8. **`npm run validate:samples`** script entry + `--png` CLI flag (reuse the
   validate-samples Puppeteer path) so a PNG is one command away.

Items 1, 2, 4, 5, 7, 8 are each ≤ 1 day; 3 is ~1 day; 6 is a project.

### Phase C scope as greenlit (items 1, 2, 3, 4, 5, 7, 8; item 6 deferred)

Docs-first for every item: `docs/debug.md` (exists; currently `log()` +
`--print-logs` only) gets sections for warnings, `assert`, `--json`, and the
PathBlock introspection members; `docs/stdlib.md` gets `ln()` and the
`log()` rule; `docs/cli.md` gets `--json`. Register nothing new (pages exist).

| Item | Key files | Notes |
|---|---|---|
| Warnings channel | `src/evaluator/types.ts` (`CompileResult.warnings`, `CompileWarning`), one `warn()` helper in `src/evaluator/index.ts` replacing the 11 `'[warn] '` pushes (`:2004, 3042-3132, 3677-3757, 3903, 9751, 9801`), `src/cli.ts` (stderr `file:line: warning:`), `playground/components/console-pane.ts` + `shared/log-entry.ts` (severity chip), `src/language-services/diagnostics.ts` (evaluate-phase warnings → `DiagnosticSeverity.Warning`), `src/worker.ts` result shape | `path-transforms.ts:1821-1837, 2236-2252` and `segments.ts:471` are the message sources; give them a `loc`. |
| `--json` / trace | `src/cli.ts` (`--json`, free today), `src/index.ts` (`compile(src, { trace: true })` → sets `trackHistory`, returns `context.commands` + `PathRecord.loc` per layer), reuse `src/render/build-tree.ts:135-147` metadata shape | Output: `{ viewBox, layers:[{name, d, records:[{loc,label,commands}]}], defs, logs, warnings, commands? }`. Playground `debug-capture.ts` embeds this instead of the removed annotated section. |
| PathBlock `.d` / `.commands`, Color readback | `src/evaluator/struct-properties.ts` (registry — extend it, not the evaluator), `src/pathogen-api.ts` (@type PathBlock, Color) → `npm run generate:completions`, `formatValueForDisplay` (`index.ts:5915-5998`) prints first 8 commands | `.d` = relative string as `.draw()` would emit (`commandsToRelativeD`); `.commands` = array of `{command, args, end}` structs. |
| `assert(cond, msg?)` | `src/stdlib/*.ts` won't fit (needs a throw with line) → statement-level builtin in `index.ts` next to `log()` dispatch; `docs/debug.md` | Error text `Line N, col M: assertion failed: <msg>` via the existing stdlib error wrapper. |
| `log()`/`ln()` split | `src/stdlib/math.ts` (+`ln`), `src/pathogen-api.ts`, `index.ts:6562-6575` (`isMathLogCandidate` deleted; `log(...)` in VALUE position becomes an error naming `ln()`), `docs/stdlib.md:49` | `ln` is used twice as a plain identifier in the corpus; stdlib names are shadowable (only `pi/deg/rad` are reserved), so no break. |
| `expectCommandSequence` | `tests/helpers.ts` + `tests/setup.ts` matcher, built on `compileWithContext(..., { trackHistory: true })` | Signature `(ctxOrResult, [['M',0,0],['l',10,0]], { precision: 4 })`; use it when re-homing Phase A parity tests. |
| `validate:samples` + `--png` | `package.json` script; CLI `--png=<file>` reusing the Puppeteer render in `scripts/validate-samples.ts` (optional dep, error if Puppeteer missing) | |

## Part 3 — `${` → `#{` assessment

### Recommendation: do it, as a hard cutover, before any public release.

### What the ambiguity costs today (inventory)

| Layer | Machinery that exists only because opener == interp marker |
|---|---|
| Grammar | `@precedence { styleBlockOpen, templateInterpStart }` (`pathogen.grammar:568`); identical-text tokens resolved by contextual token groups. Documented dead ends: LR-structuring the block silently breaks every interpolation (state merge, no generator conflict); externalizing `StyleContent` collapses groups 5→4. |
| Completion scanners | `completion.ts` `blankBalancedInterps` (:342), `isInsideOpenInterp` (:374), `isInsideStyleBlock` (:392), `isStylePropertyNameContext` (:413), `$`-keystroke snippet routing (:536). The 2026-09-01 "CSS property names offered inside an expression" bug was this guess going wrong. |
| TextMate | `style-block` `begin: (\$)(\{)` (:184) can only be told from `template-literal`'s `${` by nesting order; `$` is an LSP trigger char for two different snippets. |
| Docs prose | `docs/syntax.md:1727` and the CHANGELOG repeatedly explain "a style value's `${ }` allows one brace level" — the nested-`${` shapes are what blow the 16-bit DFA tables. |
| Churn | 38 of 206 commits since June mention style blocks / interpolation / templates; 10 grammar regens. |

### What `#{` fixes, and what it does NOT
- FIXES: the token-identity ambiguity at the grammar level. `styleBlockOpen`
  becomes `"#" "{"`, lexically distinct from `templateInterpStart`; the
  precedence line goes; any future LALR restructuring of style blocks can no
  longer silently break interpolation. Every text-based scanner (completion,
  TextMate, highlight fallback) keys on a unique two-char sequence; the
  "is the LAST `${` the opener?" heuristics in `completion.ts` collapse to a
  plain search for `#{`. `$` inside a style block unambiguously means
  interpolation; `#` at expression position unambiguously means style block.
- DOES NOT fix: the `StyleContent` DFA table-size limit (nested braces inside
  a template-form interp in a style value), the "never externalize
  StyleContent" trap, or the parseMixed inner grammar. Those are about the
  block's CONTENT, not its opener. Contextual token groups remain (e.g.
  `}` vs `templateInterpEnd`) but are no longer load-bearing for `${`.
- `#` is safe: only `ColorLiteral { "#" hex+ }` uses it (outer + inner
  grammar, path-args tokenizer:165); `#{` cannot match a hex literal. Inside
  templates and strings `#` is plain text. Sigil family becomes `@{` path,
  `&{` text, `#{` style (hash = CSS mnemonic).
- Alternatives considered and rejected: changing the INTERPOLATION marker
  (1,296 uses in docs+blog vs ~4,000 opener lines, and `${}` is the JS
  expectation); keyword opener `style { }` (collides with trailing-block
  lambdas / apply blocks); `%{` (`50%{` lexes as Number `50%` + `{`);
  `!{` (`!{…}` is a valid negated object literal); `~{` (free but no mnemonic).

### Migration scope (lines with an opener / files)

| Area | Lines | Files |
|---|---:|---:|
| `website/blog/samples/**/*.pathogen` | 2,255 | 264 |
| `project-docs/**` (.pathogen + .md) | 1,062 | 212 |
| `tests/**` (source embedded in TS strings) | 584 | 46 |
| `docs/*.md` | 183 | 17 |
| `website/blog/*.md` fences | 31 | 12 |
| `playground/**` (templates, storybook fixtures) | 28 | 12 |
| `packages/vscode-pathogen` (snippets, fixtures, TextMate) | 15 | 6 |
| `website/guidelines` | 10 | 2 |
| `src/**` (static snippets, embedded samples) | 3 | 3 |
| Cloud: KV `WORKSPACES` `workspace:<id>` JSON blobs (`website/api/router.ts:343,503,619`) | n/a | all stored workspaces |

Migration is cheap because it is MECHANICAL: the old parser already knows
which `${` are openers (`StyleBlockLiteral` node → `styleBlockOpen` offset).
A tree-driven codemod (pattern: `scripts/fix-semicolons-lezer.ts`) rewrites
exactly those offsets, so ~4,000 lines carry zero ambiguity risk. Verification
is strong: SVG output for all 264 samples must be byte-identical before/after.

### Corrections found during design (supersede the "Established facts" above)
- `styleBlockOpen` is a lowercase token, not a tree node; the codemod keys on
  `StyleBlockLiteral.from` (offset of the `$`).
- The generated parser has FOUR numbered groups today
  (`pathogen.generated.ts:21` `tokenizers: [pathArgsTokenizer, 0, 1, 2, 3]`);
  the memory note saying five is stale. Post-regen check = same count as
  before the edit + `keyof typeof spec_Identifier` still present.
- Two more `$`-keyed scanners: `src/parser/index.ts:29`
  (`detectMissingSemicolon` skips `@{`/`${` blocks) and
  `playground/utils/codemirror-setup.ts:1025-1037` (`isInsideLegacyStyleBlock`,
  a duplicate of `isInsideStyleBlock`) + a legacy template at `:232`.
- `path-args-tokenizer.ts:165` swallows a bare `#` (zero hex digits) into
  `PathArgs`; harden to require ≥1 hex digit so `#{` can never be eaten.
- `docs/*.md` fences are mostly UNLABELED (1,218 bare ``` vs 16 ```pathogen);
  the codemod must treat bare fences containing `${` as candidates.
- KV source lives in FOUR key families of the `WORKSPACES` namespace:
  `workspace:{id}` (`code`, `contentHash`, `rev`), `approval:{id}` (`code`,
  `codeHash`), `queue:review`, `queue:rereview`. None in D1 or R2.
- Working tree is dirty (24 files, mostly `project-docs/pdf-export/verify/*`
  binaries); commit/stash before capturing the SVG baseline.

### Mechanics

**B1. Tree-driven codemod (Node only).**
- `scripts/legacy-style-opener/pathogen-legacy.grammar` — frozen byte copy of
  the pre-change grammar minus the `@external propSource` line.
- `scripts/lib/legacy-style-opener.ts` — builds the legacy parser at runtime
  with `buildParser(grammarText, { externalTokenizer: () => pathArgsTokenizer })`
  from `@lezer/generator` (devDependency; verify `BuildOptions.externalTokenizer`
  at implementation time — no precedent in this repo). Never imports
  `pathogen.generated.ts`, so it keeps working after the flip, which lets the
  corpus rewrite and the grammar change land in ONE commit (no red
  intermediate commit).
- Algorithm: `tree.iterate` → every `StyleBlockLiteral` whose source starts
  with `${` at `n.from` → replace that `$` with `#`, applied back-to-front.
  Interps (`StyleInterp`, `templateInterpStart`), strings, comments are never
  `StyleBlockLiteral.from`, so they are untouched by construction.
- Idempotency: a unit already containing `#{` is skipped (`already-migrated`);
  re-parsing migrated text with the legacy parser is NOT safe.
- Units: `.pathogen` files; fenced bodies in `.md` (info string empty or
  `pathogen`, containing `${`); Pathogen inside TS/JS string/template literals
  via the `typescript` API (cooked view + offset map, JS `${expr}` spans
  replaced by same-length identifiers, guarded by a Pathogen-marker regex so
  HTML/CSS/URL templates in `playground/` are skipped).
- `scripts/migrate-style-opener.ts` — Commander CLI, dry-run default,
  `--write`, `--report`, `--paths`; report lists `review` (error node near a
  rewrite), `unclassified` (marker + `\${` but zero rewrites), and prose
  `` `${ `` mentions outside fences for hand edits.
- `tests/migrate-style-opener.test.ts` — fixtures for every opener position,
  every interp shape, strings/comments/templates untouched, idempotency,
  mixed-language markdown, TS literal with adjacent JS interps.
- Delete `scripts/legacy-style-opener/` after the second prod KV run.

**B2. Grammar + tooling, in order.**
1. `pathogen.grammar:511` → `styleBlockOpen { "#" "{" }`; delete
   `@precedence { styleBlockOpen, templateInterpStart }` (`:568`); fix the
   comment block `:517-560` where it names the opener.
2. Regen (`npx lezer-generator … --typeScript`); check group count + keyof;
   `npm run build` (DTS trap).
3. `path-args-tokenizer.ts:165` hex-digit requirement + `tests/parser.test.ts` case.
4. `src/parser/index.ts:29` `'$'` → `'#'`.
5. `completion.ts`: `blankBalancedInterps` drops the `i !== opener` exception;
   `isInsideOpenInterp` block opener = `lastIndexOf('#{')`; `isInsideStyleBlock`
   / `isStylePropertyNameContext` test `'#'`; keystroke routing (`:138-158`):
   `#` → style-block/declaration snippets, `$` → interpolation only.
6. `completion-data-static.ts` (`:49, :307, :315, :388-397`) snippets emit `#{`;
   `npm run generate:completions` (expect no diff).
7. Playground: `cm-completion-bridge.ts:140,177` add `#` to word classes;
   `codemirror-setup.ts:232,1031`; confirm `fill: #f` shows no empty popup
   (`cm-color-picker.ts:461` needs 3–8 hex digits, unaffected).
8. Diagnostics: `diagnostics.ts` `describeError` (`:229`) — if the error node
   starts with `${`, return the migration message ("Style blocks open with
   '#{ … }' — '${ … }' is only template interpolation now"); same check in
   `parse()` (`src/parser/index.ts:162-177`) so the CLI says it; in
   `findLezerErrors` skip cascaded error nodes up to the block's matching `}`.
   Quick fix in `code-actions.ts` (pattern `missingSemicolonFix` `:343-367`):
   single-char edit, plus **"Convert all legacy `${` style blocks"** implemented
   as a fixpoint over the diagnostics engine itself (apply every migration
   diagnostic's edit, re-diagnose, repeat ≤ 8 times) — NO second hand-written
   scanner (deviation from the design agent's proposal: a parallel
   state-machine scanner is exactly the drift-prone class of code this change
   removes). Tests in `diagnostics.test.ts`, `code-actions.test.ts`, `errors.test.ts`.
9. `src/highlight.ts:25,59`, `src/parser/highlight.ts:47` comments;
   `hover.ts:44,46`; `formatter.ts:785,789` emit `#{`; formatter tests.
10. Docs prose: `docs/syntax.md:255` + a short "Migrating from `${`" note
    quoting the diagnostic; `docs/layers.md:21` callout; `docs/markers.md:269`;
    CHANGELOG breaking-change entry; `packages/vscode-pathogen/CLAUDE.md` LSP
    table; `scripts/CLAUDE.md` rows for the new scripts.
11. VS Code: `pathogen.tmLanguage.json:184` `begin: "(#)(\\{)"` (nested-interp
    rule `:202` unchanged); snippets `:11,:129`; README `:90-92`;
    `test-fixtures/all-syntax.pathogen`; LSP `server.ts:83` add `'#'` to
    `triggerCharacters` (keep `$`); bump extension version.
12. Rebuild: `npm run build`, `build:docs`, `build:blog` (diff of
    `playground/utils/blog-content.js` must be `$`→`#` only), LS + extension.

**B3. Inbound URLs (`?state=`, `?import=`).** These cannot be migrated in any
store. Rely on the diagnostic + "Convert all" quick fix (B2.8) surfaced by a
one-time toast when a loaded document produces migration diagnostics
(`workspace-view.ts:410-412`, both `new-workspace-view.ts` entry points). No
silent rewrite: the user applies it, so autosave never writes an edit they
did not make.

**B4. KV migration.** `scripts/migrate-style-opener-kv.ts` modeled on
`scripts/migrate-viewbox.ts` (wrangler via `execFileSync`, `cwd=api/`,
`--env dev|prod`, `--confirm` for prod, `--dry-run`, `--only <id>`,
`--report`, `--backup-dir` writing every pre-image — KV has no versioning).
Per record: rewrite `code` with the B1 library; second opinion = the NEW
parser reports zero error nodes on the result (abort the record otherwise).
`workspace:{id}`: `contentHash = hashContent(newCode)` (`website/api/utils.ts:19-27`
re-implemented with `node:crypto`), `rev + 1` (forces stale tabs to 409 into
the existing "open in another tab" banner, `router.ts:439`,
`playground/services/autosave.ts:41-43,126`), `updatedAt` untouched (re-read
before write, skip on change). `approval:{id}`: `code` + `codeHash`.
Queues: rewrite each entry, write the array once. Deterministic rewrite keeps
`approval.codeHash === workspace.contentHash` invariant, so nothing lands in
`queue:rereview` spuriously. Outcomes: `migrated`, `skipped-no-legacy`,
`skipped-already-migrated`, `skipped-concurrent-write`, `error`.
Rollout: merge → Pages deploys (no Worker deploy needed; API stores opaque
strings) → run prod migration immediately with backup → re-run 24–48 h later
(idempotent). Dev rehearsal first against `.wrangler/state` after
`npm run seed:dev` (its `SAMPLE_CODE_*` gets migrated in the corpus pass).

**B5. Verification gates.**
- (a) Byte-identical blog SVGs: on a clean tree BEFORE the change,
  `npm run compile:samples -- --force` and copy `website/blog/samples/**/*.svg`
  to the scratchpad; after, `--force` again and `diff -r`. Expect zero diffs
  (`--include-metadata` carries no source/timestamps; `#{`/`${` have equal
  width so `valueLoc` offsets are unchanged). GPU samples diffed separately;
  accept only pixel noise there. 30–60 min unattended.
- (b) `npx vitest run tests/render-snapshots.test.ts` passes without `-u`
  (fixtures under `project-docs/render-pipeline-unification/snapshots/` are
  migrated by the codemod).
- (c) `npm run format:samples -- website/blog/samples` → every file
  `unchanged`; `format:pathogen --check` on the same glob.
- (d) `npm run test:run`, `typecheck:playground`, `lint`, `check:completions`;
  grep gate: `grep -rnE "(\)|=|<<|default)\s*\\\$\{" docs website/blog
  website/guidelines project-docs tests playground src packages` returns only
  interpolations; codemod report `unclassified` empty.
- (e) `build:docs && build:blog && build:website`, `check-links`; no error
  classes in Lezer-highlighted blog fences.
- (f) Playground manual: `let s = #` offers the `#{...}` snippet; inside
  `#{ }` hyphenated property completions; `stroke-width: ${` offers
  expressions, no CSS props; `` `hi $ `` offers `${...}`; pasting
  `let s = ${ fill: red; };` shows ONE squiggle with the migration message and
  the quick fix converts it; an old `?state=` link toasts + converts on click.
- (g) VS Code: `npm run build:vscode:install`, open
  `test-fixtures/all-syntax.pathogen`, Inspect Editor Tokens: `#{` →
  `keyword.operator.style-block.pathogen`, value `${…}` →
  `string.interpolated.pathogen`, backtick `${…}` →
  `meta.template.expression.pathogen`; `#` triggers completion via LSP.

**B6. Effort.** Codemod lib + CLI + tests 6–8 h; corpus run + hand edits
3–4 h; grammar/scanners/diagnostics/LSP 6–8 h; URL toast + convert-all 2–3 h;
KV script + rehearsal + prod run 4–5 h; gates + docs + extension 4–6 h.
**Total ≈ 25–34 h (4 days) + ~1 h unattended compile time.**

Housekeeping after approval: update memory note
`project-lezer-stylecontent-token` (five groups → "same count as before").

## Verification

### Phase A (annotated removal)
1. `grep -rn annotated src playground packages/*/src scripts website/*.ts` returns only
   the SVG-sense uses (`segment-labels.test.ts:26,107`, post4 schematics, `formatter.test.ts:260`).
2. `npm run build` + `npm run check:completions` clean; `dist/index.d.ts` no longer
   exports `compileAnnotated`/`AnnotatedOutput`/`FormatOptions`.
3. `npm run test:run` — expect ~5,200 − (182 + ~30) tests, all green; re-homed
   parity tests present in their owning suites.
4. `tests/render-snapshots.test.ts` unchanged (annotated never fed the render path).
5. Playground: `npm run dev:website`, open a workspace, confirm no annotated toggle in
   header/breadcrumb, "Copy Debug Info" still produces layers + logs, and an old share
   link containing `ao:` in `?state=` still loads.
6. CLI: `pathogen-lang --annotated x.pathogen` prints "unknown option" (not a crash).
7. `npm run build:docs` + link check: no dangling `#cli-annotated-output` anchors.

### Phase B (`#{` cutover) — see Part 3 mechanics; the non-negotiable gate is
byte-identical SVG for all 264 blog samples and unchanged render snapshots.

### Phase C (debug features), per item
- Warnings: a fillet-clamp program compiled via CLI prints `file:L:C: warning: …` to
  stderr and still exits 0; the same program in the playground shows a warning chip
  with the line; VS Code shows a yellow squiggle at that line.
- `--json`: `pathogen-lang f.pathogen --json | jq .layers[0].records[0].loc` returns a
  line; `compile(src, { trace: true }).context.commands.length` equals the emitted
  command count on a fixture.
- `.d` / `.commands`: `log(circle(0,0,10).d)` prints the same string `.draw()` emits;
  pinned in `tests/path-blocks.test.ts`.
- `assert(false, "x")` fails with `Line N, col M: assertion failed: x` in all three
  surfaces (CLI exit 1, playground error panel, VS Code diagnostic).
- `log(sqrt(9))` now logs `3` (no ln); `ln(3)` returns `1.0986…`; `let y = log(3);`
  errors naming `ln()`.
- `expectCommandSequence` used by at least the five re-homed Phase A tests.
- `npm run validate:samples` exists and runs the 7 checks over `website/blog/samples`.
- Full suite green; agentic review before each commit; CHANGELOG updated per phase.
