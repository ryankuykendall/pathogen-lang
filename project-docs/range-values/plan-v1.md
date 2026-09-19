# Ranges as values: `(1..100).map() {|index| ...}`

## Before / after

| Today | After |
|---|---|
| `..` exists only inside `for (i in a..b)` headers and `case a..b` arms. It is not an expression. | `(a..b)` and `(a..<b)` are expressions that evaluate to an **array** of the numbers a `for` loop would visit. |
| `let items = (1..100).map() {…};` → `Parse error … Missing ';' after let declaration` | An array of 100 mapped values. |
| Building a numeric sequence needs `let a = []; for (i in 1..100) { a.push(i); }` | `let a = (1..100);` — then every array feature applies: `map/filter/reduce/sort/slice/reverse/mapSlice`, `.length/.first/.last`, for-each, spread, destructuring, `<<` workers, `log`. |
| `let r = 1..5;` → "Missing ';' after let declaration" | "A range used as a value needs parentheses — write (1..5)" (CLI, playground, VS Code). |
| `L (1..3) 5;` silently compiles to `L 1 .3 5`; `L f((1..3)) 5` silently passes `1` to `f` | Compile error: a range cannot be a path argument. |
| `.map()` over 32,000 elements: **14.4 s** (measured). `.sort()` with a comparator on the same array: 0.36 s. | `map`/`filter`/`reduce` no longer pay a throw per element; `(1..32000).map()` is sub-second. |
| `for (i in 1..5)`, `case 1..5`, `case 100..`, `(1 + 2) * 3` | Unchanged — identical parse trees (verified by spike). |

## Context

Ranges are a parse-time shape today, not a value: three grammar productions
inline `expression rangeOp expression`, and the evaluator consumes them through
`planRange()` (`src/evaluator/range-loop.ts`). There is no way to map, store,
spread, or pass a range, so producing a numeric sequence takes a for-loop plus a
`push` accumulator. The goal is Ruby-style `(1..100).map() {|index| …}`.

**Decisions (user, 2026-09-18)**

1. `(1..5)` **is the array** `[1, 2, 3, 4, 5]` — a fresh `ArrayValue` per
   evaluation, same semantics as the loop (inclusive `..`, half-open `..<`,
   auto-descending, fractional start preserved, step ±1, 32,000 cap). No new
   runtime type.
2. **Parentheses are required and part of the literal.** `for` headers and
   `case` arms are untouched. `case (1..5)` is treated as the pattern
   `case 1..5`. Open-ended `(1..)` / `(..5)` stay errors.

**Grammar spike (already run in scratchpad).** Adding
`RangeExpression { "(" expression rangeOp expression ")" }` as a
`primaryExpression` alternative generates with **no conflicts and no GLR
markers**; `tokenizers: [pathArgsTokenizer, 0, 1, 2, 3]` and the
`keyof typeof spec_Identifier` patch both survive `--typeScript` regen; 27 probe
programs behave as the table above says. Postfix parts are flat siblings after
the `RangeExpression` node, exactly like `ParenExpression`.

## Implementation (docs → tests → code, per project lifecycle)

### 0. Artifacts + docs first
- Create `project-docs/range-values/` — `README.md` (decisions, timing tables,
  follow-ups), `demo.pathogen`, and copies of the scratchpad grammar-spike probe
  and perf programs (scratchpad is ephemeral).
- `docs/syntax.md` (already in `DOC_FILES`; no registration change):
  - New `### Ranges as Values` in `## Arrays`, after `### Spread`, before
    `### Index Access`. Examples: `log((1..5))`, `(0..<4)`, `(5..1)`,
    `(0..<0)` → `[]`, fractional start, the headline `.map` example, one
    rendered sample (`define ViewBox(...)`, descriptive names, multi-line
    blocks), spread, destructuring, `for ([value, position] in (10..12))`.
    Rules paragraph: parens are the spelling; `let r = 1..5;` is an error; both
    bounds required; fresh array each evaluation; 32,000 limit; angle bounds
    count in radians (existing loop behavior).
  - Cross-link from `## For Loops`; note under `### Range Patterns` that
    `case (a..b)` is the same **interval** pattern as `case a..b` (so
    `case (5..1)` matches nothing even though the value `(5..1)` is
    `[5,4,3,2,1]`).
  - Trivial pre-existing fixes found on the way: the `<<` section sentence that
    says the right side may be "a lambda literal" (it is a compile error), and
    the loop-limit sentence (also applies to range values).
- `npm run build:docs`, `npm run check-links`.

### 1. Failing tests
- `tests/parser.test.ts` — node shape + `inclusive`; bound forms; postfix on the
  range (`.map() {…}`, `.map {…}`, `.length`, `[0]`, chains); `for (i in (1..5))`
  is a ForEachLoop while `for (i in 1..5)` stays a ForLoop; `case (1..5)` ≡
  `case 1..5`; `case (1..5).length` is a ValuePattern; sub-parsed positions
  (`return (1..5)…;`, `if ((1..3).length > 2)`, `for (v in (1..5))` — these
  builders fall back to `NullLiteral` silently, so assert AST shape); parse
  errors for `(1..)`, `(..5)`, `let r = 1..5;`, `f(1..5)`, `[1..5]`,
  `return 1..5;`, `calc(1..5)`.
- `tests/evaluator.test.ts` — **parity matrix** (`it.each`): for each
  `{start, end, inclusive}` row (ascending, descending, half-open both ways,
  `0..<0`, `3..3`, fractional, negative, boolean, expression/member/call
  bounds) assert `(a..b)` equals the array collected by
  `for (i in a..b) { acc.push(i); }`. Plus array features on range values,
  freshness (no aliasing across evaluations), callback-semantics guards for
  `map/filter/reduce` (top-level return, nested return, no return → null,
  expression body, error wrap text, path output discarded), and a perf guard
  (`(1..32000).map` under a generous budget; precedent
  `tests/segments.test.ts`).
- `tests/errors.test.ts` — value-form bound errors with `Line N:`; "needs
  parentheses" in six positions; path-arg guard (`L (1..3) 5`,
  `L f((1..3)) 5`, missing-`;` case) and no false positives
  (`L calc((1..3).length) 5`, `M pts[0].x 5`, strings containing `..`).
- `tests/lambdas.test.ts` — range-receiver rows in the `<<` worker matrix.
- `tests/language-services/*` — formatter round-trip + idempotency; completion
  and hover on `(1..100).`; block param `index: number`; inlay hint `: Array`;
  scope/rename for identifiers inside bounds; diagnostics message equals what
  `parse()` throws. `tests/ast-builder-postfix.test.ts`,
  `tests/highlight-tokens.test.ts` for the new node.
- Doc examples mirrored as tests with a "(docs example)" suffix (there is no
  doc-fence compiler).

### 2. Grammar + regen — `src/parser/pathogen.grammar`
- Add `RangeExpression |` beside `ParenExpression` in `primaryExpression`; add
  the rule after `ParenExpression`.
- `npx lezer-generator src/parser/pathogen.grammar --typeScript -o src/parser/pathogen.generated.ts`
  (writes both generated files). Confirm the `specialized:` `keyof` patch, the
  unchanged `tokenizers:` group count, and `PathArgs = 1` in the terms file
  (`scripts/lib/legacy-style-opener.ts` asserts it).
- Fallback if a conflict ever appears: fold into
  `ParenExpression { "(" expression (rangeOp expression)? ")" }` and branch in
  the builder.

### 3. AST + builder — `src/parser/ast.ts`, `src/parser/ast-builder.ts`
- `RangeExpression { start, end, inclusive, loc }` added to the `Expression`
  union (not to `PathArg`).
- Extract the bound walk from `buildRangePattern` into a shared
  `readRangeBounds()`; new `buildRangeExpression` reuses it. Register in
  `buildExpression` and `isExpressionNode` (not in the compound-name test at
  the top of `buildExpressionWithPostfix` — postfix siblings follow it).
- `asCasePattern`: a bare `RangeExpression` becomes a `RangePattern`.
- Do **not** normalize `for (i in (1..5))` into a ForLoop (AST/formatter
  fidelity; cost is one ≤32k-number array).

### 4. Evaluator — `src/evaluator/range-loop.ts`, `src/evaluator/index.ts`
- `range-loop.ts`: `RANGE_MESSAGES` table owning both phrasings (loop strings
  stay byte-identical — they are test-pinned; value form says "range bounds
  must be numeric / finite", "range would produce N elements (max 32000)") and
  `rangeValues(start, plan)` using the **same repeated-addition loop** as `for`
  (never `start + k*step` — fractional parity depends on it).
- `index.ts`: local `resolveRange()` reusing `toNumber`, `planRange`,
  `formatError`, `MAX_ITERATIONS`; refactor the main ForLoop site onto it;
  `case 'RangeExpression'` in `evaluateExpression` returns a fresh `ArrayValue`;
  add the case to `expressionToSource`.
- Text-body loop sites (different messages, 10,000 cap) are left alone and
  recorded as a follow-up.

### 5. Perf fast path for `map` / `filter` / `reduce` — `src/evaluator/index.ts`
- Root cause (Plan-agent measurement): a `ReturnSignal` caught *inside* the
  ~3,700-line `evaluateMethodCall` costs ~0.2–0.5 ms per throw; caught in a
  small function it is ~0.04 ms; a top-level return short-circuited by
  `evaluateGridCellBody` costs nothing.
- Add a small module-level `runCallbackBody(body, scope, sink)` next to
  `evaluateGridCellBody` (top-level return short-circuits; nested
  `ReturnSignal` is caught here, outside the giant function). Use it in the
  three methods with one fresh `createPathStore()` per element. Keep the
  call-site error wrap (`Error in .map() callback at index N: …`), the
  iteration lock, and the break/continue boundary.
- One observable delta, to record in the CHANGELOG: statements inside a single
  callback invocation now share a discard store (as `sort` and Grid callbacks
  already do). Path output is still discarded; the known ctx-leak follow-up is
  untouched.
- Measure cold at n = 32,000 (inline vs helper vs nested return); keep the
  numbers in the README.

### 6. Path-arg `..` guard — `src/parser/ast-builder.ts`
- `assertNoRangeInPathArgs()` called once from `buildPathCommand` before
  `parsePathArgs`: forward scan that skips quoted strings, `calc(…)` groups and
  array-literal `[…]` groups (reusing `skipQuoted`, `extractParenContent`,
  `extractBracketContent`), fires on `..` that is not `...`, throws via
  `parseErrorAt` with a message that also mentions a missing `;` on the path
  command above (a statement starting with `(` is swallowed into path args).
  Builder errors already reach the editor through `getDiagnostics` phase 2.

### 7. "Needs parentheses" error — `src/parser/index.ts`, `src/language-services/diagnostics.ts`
- Shared `describeBareRange(input, errorNode)` next to
  `describeCommandShadowing`; matches a range-op error child **or** source text
  starting with `..` (not `...`), excluding for/case parents. Called in
  `parse()` before `detectMissingSemicolon` and in `describeError`, so the CLI
  string and the editor diagnostic are the same text. Separate wording for a
  missing bound: "A range value needs both bounds: (start..end)".

### 8. Language services — `src/language-services/`
- `type-inference-ast.ts`: `RangeExpression` → `'array'`; element type
  `'number'` (this types `index` via the existing `inferBlockParam`).
- `scope-analysis.ts` and `inlay-hints.ts` `walkExpr`: walk both bounds;
  inlay-hints' private `inferExprType` → `'Array'`.
- `formatter.ts` `formatExpression`: print `(start..end)` / `(start..<end)`.
  **Must land with the grammar change** — the `default: return ''` branch would
  otherwise format `let items = (1..100).map…` into `let items = .map…`.
- `member-resolution.ts`: new first branch for a `(…).` receiver — backward
  paren match (new small `matchingOpenParen` helper that skips strings), reject
  when the `(` belongs to a call, require a top-level `..` inside → array
  members (completion and hover share this).
- No change: `pathogen-api.ts`, generated completion data (`check:completions`
  stays clean), `symbols.ts`, `semantic-tokens.ts`, `navigation.ts`,
  `rename.ts`, TextMate grammar, `highlight.ts`, playground source.

### 9. VS Code — `packages/vscode-pathogen/`
- Range-value lines in `test-fixtures/all-syntax.pathogen`; optional "Range
  Map" snippet.

### 10. CHANGELOG + reviews
- `## [Unreleased]`: **Added/Core** ranges as values (`Docs: Syntax "Ranges as
  Values"`); **Changed/Core** map/filter/reduce fast path with before/after
  numbers and the shared-sink note; **Fixed/Core** path-arg `..` guard and the
  parentheses message; docs fix line.
- `code-reviewer` agent on the diff; `content-reviewer` on the docs (ask for
  3–4 numbered items per message; disposition table in
  `project-docs/range-values/reviews/`). Commit only on the user's go-ahead.

## Out of scope (recorded in `project-docs/range-values/README.md`)
Step syntax; bare `a..b` values; angle-valued range elements; the 10,000 vs
32,000 text-block loop cap divergence; `Grid.map` nested-return cost; user-`fn`
`ReturnSignal` cost in big loops; the discard-sink ctx leak.

## Verification
1. Targeted: `npx vitest run tests/parser.test.ts tests/evaluator.test.ts tests/errors.test.ts tests/lambdas.test.ts tests/language-services/`
   plus `tests/keyword-registry.test.ts`, `tests/migrate-style-opener.test.ts`.
2. `npm run check:completions`, `npm run format:samples` (smoke), then full
   `npm run test:run`.
3. Re-time 32,000-element `map` / `filter` / `reduce` cold via the CLI
   (baseline 14.4 s for `map`).
4. `npm run build`, `npm run build:vscode`. Check `ps` for wrangler before any
   website build — never plain `build:website` / `dev:website` while
   `dev:stack` is up.
5. Three-surface parity with `project-docs/range-values/demo.pathogen`:
   - **CLI**: `npx tsx src/cli.ts demo.pathogen --json`, then
     `--output-svg-file` + `--png`, read the PNG.
   - **Playground**: inject via `/workspace/scratch?state=`; confirm render,
     `(1..100).` completions, hover `index: number`, the `let r = 1..5;`
     diagnostic, format round-trip.
   - **VS Code / LSP**: same five checks against the built `.vsix`.
   - Diff the SVG output across surfaces.
