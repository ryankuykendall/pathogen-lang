# Range values — `(a..b)` evaluates to an array

Internal record for the feature shipped 2026-09-18. User-facing docs:
`docs/syntax.md` → "Ranges as Values". Approved plan: `plan-v1.md`.

## Before / after

| Before | After |
|---|---|
| `..` existed only inside `for` headers and `case` arms | `(a..b)` / `(a..<b)` is an expression that evaluates to an array |
| `let items = (1..100).map() {…};` → `Missing ';' after let declaration` | 100 mapped values |
| `let a = []; for (i in 1..100) { a.push(i); }` | `let a = (1..100);` |
| `let r = 1..5;` → `Missing ';' after let declaration` | `A range used as a value needs parentheses — write (1..5)` |
| `L (1..3) 5;` silently compiled to `L 1 .3 5` | compile error |
| `.map()` over 32,000 elements: 14.4 s | 0.36 s |

## Decisions (user, 2026-09-18)

1. **`(1..5)` IS the array `[1, 2, 3, 4, 5]`** — a fresh `ArrayValue` per
   evaluation; no new runtime type. Alternative considered and rejected: a lazy
   first-class `Range` value with its own members (3–4× the surface, and two
   sequence types to keep in parity forever; ranges are capped at 32,000, so
   laziness buys nothing).
2. **Parentheses are required and part of the literal.** Alternative rejected:
   bare `a..b` as a binary operator (needs a precedence level and
   disambiguation against `for` headers and open-ended `case` arms).
   `case (1..5)` is converted to the pattern `case 1..5` in the AST builder.

## How it is built

| Piece | Where |
|---|---|
| Grammar: `RangeExpression { "(" expression rangeOp expression ")" }` as a `primaryExpression` | `src/parser/pathogen.grammar` |
| AST node + shared bound walk (`readRangeBounds`) used by `RangePattern` and `RangeExpression`; `case (a..b)` → `RangePattern` | `src/parser/ast.ts`, `src/parser/ast-builder.ts` |
| One bound validator for loop and value (`resolveRange`), one message table (`RANGE_MESSAGES`), values by the loop's own repeated addition (`rangeValues`) | `src/evaluator/range-loop.ts`, `src/evaluator/index.ts` |
| No-throw callback fast path (`runCallbackBody`) for `map` / `filter` / `reduce` | `src/evaluator/index.ts` |
| Path-argument guard (`assertNoRangeInPathArgs`) | `src/parser/ast-builder.ts` |
| Needs-parentheses detector (`describeBareRange`), shared by `parse()` and `describeError` | `src/parser/range-value-errors.ts` |
| Inference (`array` / element `number`), scope + inlay walkers, formatter, bracketed-receiver member resolution (`(1..100).`, `[1, 2].`, `points[0].`) | `src/language-services/` |
| Legacy completion source defers on `)` / `]` receivers | `playground/utils/codemirror-setup.ts` |

The grammar change was spiked first on a scratch copy (`grammar-spike/probe.ts`
compares a baseline and a spike parser over 27 programs): no conflicts, no GLR
markers, `tokenizers: [pathArgsTokenizer, 0, 1, 2, 3]` unchanged, the
`keyof typeof spec_Identifier` patch survives `--typeScript` regen, and `for`
headers / `case` arms / plain parenthesized expressions keep identical trees.
Regenerate with
`npx lezer-generator src/parser/pathogen.grammar --typeScript -o src/parser/pathogen.generated.ts`.

`probes/error-shapes.ts` dumps the Lezer error-node context for every bare-range
misspelling; `describeBareRange` is written against that output. Re-run it after
any grammar change that touches expressions.

## Timings (cold CLI process, 32,000 elements, programs in `perf/`)

| Program | Before | After |
|---|---|---|
| `perf-baseline` (for + push only) | 0.36 s | 0.47 s (noise) |
| `perf-maponly` (`.map`) | 14.43 s | 0.36 s |
| `map-perf` (`.map` + `.filter` + `.reduce`) | 34.37 s | 0.38 s |
| `perf-range-map` (same, from `(1..32000)`) | — | 0.36 s |
| `perf-nested-return` (16,000 nested returns) | — | 0.61 s |
| `perf-sortonly` (comparator, already on the fast path) | 0.36 s | 0.36 s |

Root cause, measured by the Plan agent at n = 8,000: a `ReturnSignal` caught
inside the ~3,700-line `evaluateMethodCall` costs ~0.2–0.5 ms per throw; the same
throw caught in a small function costs ~0.04 ms; a top-level return
short-circuited by `evaluateGridCellBody` never throws. `createPathStore()` is a
bare `{ records: [] }`, so hoisting the sink was never the win.

## Verification (2026-09-18, after both reviews' fixes)

- `npm run test:run`: **148 files, 5,863 tests passed, 1 todo.**
  `npm run check:completions` clean. `npm run build` (incl. DTS) clean.
- CLI: `demo.pathogen` → `demo.svg`, `demo.png` (read and checked).
- Playground: `verify/verify-playground.mjs` — **11/11** against the dev stack
  (rebuilt with `PATHOGEN_API_BASE=http://localhost:8787 npm run build:website`),
  including the LIVE editor popup after `(1..100).` and after `pts[0].`;
  screenshot `verify/playground.png`.
- VS Code: `verify/verify-vscode.mjs` — **11/11** against the bundled language
  server and the bundled preview compiler from `npm run build:vscode`.
  **Not done:** an interactive install of the `.vsix` into a clean VS Code window.
- Path data is byte-identical across the three surfaces (499 chars).
- `npm run check-links`: 54 pages, 1,484 links, 0 broken; `#syntax-ranges-as-values`
  and `#viewbox-reading-the-viewbox` resolve.

`verify/debug-live-completion.mjs` is the step-by-step probe that found the
playground popup bug: the editor merges two completion sources, and the legacy
one flooded the list after any receiver ending in `)` or `]`.

## Reviews

- Code review (`code-reviewer` agent): `reviews/code-review-2026-09-18.md` —
  5 findings, all fixed.
- Content review (`content-reviewer` agent):
  `reviews/content-review-2026-09-18.md` — 13 findings, 12 applied, 1 accepted.

## Found on the way

Fixed in a follow-up the next day (2026-09-19), at the user's request:

- **The 10,000 vs 32,000 loop cap.** `git log -S` showed the cap was 10,000
  everywhere until commit `33e21ca` (2026-04-12) raised `MAX_ITERATIONS` to
  32,000; the `&{ }` text-block walker (added 2026-03-13) used a bare `10000`
  literal, so it was missed — an oversight, not a design choice. Both text
  walkers now call `resolveRange` like the statement loop and the range value,
  so `planRange` has exactly one caller and there is one limit, one set of
  messages, and a line number on each. Tests: `tests/textblock.test.ts` →
  "loop limits and bound errors match the statement for loop" (every assertion
  runs against all three loop sites).
- **Stale internal docs.** `cross-system-feature-lifecycle.md` and the quick
  checklist in `.claude/CLAUDE.md` were swept claim by claim against the code
  (not just the three statements first noticed) and the lifecycle doc gained an
  "A new EXPRESSION node" checklist from this feature's lessons. `src/CLAUDE.md`'s
  docs URL fixed.
- **`playground/CLAUDE.md`** (same day, second request) — it still said
  `BASE_PATH: /pathogen`, named every file `.js` (sources are `.ts`; only the
  import SPECIFIERS say `.js`), claimed all CSS is inline (larger components
  import an adjacent `.css` as text), described a flat 150 ms debounce and no
  compile cancellation, and listed neither `gpu/` nor `types/`. Rewritten claim
  by claim against the code; conventions and workflow rules unchanged. Added:
  the two-merged-completion-sources rule, the `dev:stack` rebuild trap, the
  no-`eslint --fix` rule, the perf flag, and where playground unit tests live.

- **The `all-syntax.pathogen` fixture** (third request). Finding: referenced by
  NOTHING executable — five doc mentions, excluded from the `.vsix` — so it had
  rotted: four compile errors, each hidden behind the one before (`let rad`;
  `obj1` undefined; absolute commands inside `@{ }`; `with fillet` on an edge
  with no previous edge), and seven grammar keywords plus text blocks, queries,
  `Grid`, `Marker`, `Pattern` never shown. Rewritten (renders:
  `fixture/all-syntax.svg` / `.png`) and guarded by
  `tests/all-syntax-fixture.test.ts`: zero diagnostics, and a parse tree
  containing EVERY node type `lezerParser.nodeSet` can produce (derived, so a new
  grammar rule fails the suite until the fixture shows it), one justified
  exception. The test earned its keep immediately — it found two operators the
  rewrite had still missed. `probes/fixture-coverage.ts` is the exploratory
  version.
- **The reserved-name error had no position** (found while investigating the
  fixture). `'rad' is reserved…` came only from the evaluator's `setVariable`
  funnel (74 callers, no location), so the CLI printed no line and editors
  squiggled line 1; `let rad = 50;` for a radius is an easy mistake. Now a static
  check over the parse tree (`src/parser/reserved-bindings.ts`), folded into the
  scan `parse()` already does, strict path only (the lenient `parseLezer` must
  keep building so scope analysis survives). Tree shapes:
  `probes/binding-shapes.ts`. It also closes a gap: an uncalled fn/lambda
  parameter or a never-matching case arm used to slip through. Code review
  (`reviews/code-review-2026-09-19.md`) found that throwing before the AST
  builder ran masked builder errors; fixed so the FIRST problem in the document
  wins, in either direction.
- **`docs/gradients.md`**: the published Pattern example did not compile
  (`@{ circle(10, 10, 3) }` lacks the `;`). Fixed and pinned by a test — the
  fixture rewrite copied it and tripped over it.

Found and NOT fixed (reported to the user):

- ~~A `//` comment inside a multi-line expression is a parse error~~ — fixed the
  same day: see [`../comments-anywhere/`](../comments-anywhere/README.md).
- **Cross-engine last-bit differences.** `Math.cos`/`sin` differ in the 16th
  digit between Node and Chrome (`59.54915028125263` vs `…262`), so a program
  using trig is not BYTE-identical between the CLI and a browser surface. The
  verify scripts compare geometry within 1e-9 for that reason
  (`verify/debug-fixture-parity.mjs` found it). `--to-fixed` hides it.
- No automated TextMate tokenization test: the fixture is now guaranteed to
  contain every construct, but whether the TextMate grammar scopes each one
  correctly is still checked by eye.

## Out of scope

Step syntax; bare `a..b` values; angle-valued range elements (bounds read as
radians, like the loop — documented); `Grid.map` nested-return cost (1.3 s at
8k cells); user-`fn` `ReturnSignal` cost in big loops; the discard-sink ctx leak.
