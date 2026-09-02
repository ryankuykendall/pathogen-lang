# Plan: `switch` / `case` for Pathogen

## Context

Pathogen has `if` / `else if` / `else` and range or for-each loops, but no way to dispatch one value across several patterns. Bucketing a continuous value (an angle into quadrants, `t` into phases, a distance into bands) or dispatching on a string, enum member, or struct shape today means an `else if` chain that repeats the scrutinee on every line. Ryan wants a `switch`, familiar from JS/TS, but with the improvements Swift made (no fallthrough, patterns rather than bare equality, guards, bindings) and Ruby's range-in-case idiom.

Decisions taken in this session (do not re-litigate):

| Decision | Choice |
|---|---|
| Body syntax | Braced case bodies, `case pattern { … }`, matching `if (…) { }` / `for (…) { }`. No colon form. |
| Fallthrough | None. First matching clause runs, switch ends. No `fallthrough` keyword. |
| `break` / `continue` in a case | Loop-transparent: they target the enclosing loop exactly as inside `if`. Outside a loop they stay the existing parse error. |
| Statement vs expression | Phase 1 ships the statement. Phase 2 (same plan, second commit series) adds `let x = switch (…) { case p { expr } default { expr } };` with single-expression arms. |
| Pattern kinds in v1 | Value (any expression, `==` rules), comma alternatives, ranges `a..b` / `a..<b`, open-ended `..b` / `..<b` / `a..`, `where` guards, destructuring `{x, y}` / `{x: px}` / `[a, b]` / `...rest`. |
| Text blocks | Supported in v1 in both `text(x,y){ }` and `&{ }`. |
| New reserved words | `switch`, `case`, `where`. `default` is already a keyword. Zero in-repo uses of the three as identifiers. |

Before / after:

| Before | After |
|---|---|
| `if (a >= 0deg && a < 90deg) { … } else if (a >= 90deg && a < 180deg) { … } else { … }` | `switch (a) { case 0deg..<90deg { … } case 90deg..<180deg { … } default { … } }` |
| `if (kind == "circle" \|\| kind == "dot") { … } else if (kind == "square") { … }` | `switch (kind) { case "circle", "dot" { … } case "square" { … } }` |
| `let {x, y} = p; if (x > y) { … }` (no shape test possible; Points can't be `==` compared) | `switch (p) { case {x, y} where x > y { … } case [first, second] { … } }` |

## Reference syntax (goes into docs first)

```
switch (kind) {
  case "circle" {
    circle(0, 0, r);
  }
  case "square", "rect" {
    rect(0, 0, r, r);
  }
  case 0..10 { … }            // inclusive, same spelling as for (i in 0..10)
  case 0deg..<90deg { … }     // half-open; angles compare like < and <=
  case ..<0 { … }             // open lower bound
  case 100.. { … }            // open upper bound
  case {x, y} where x > y {   // destructure + guard; x, y scoped to this body
    line(0, 0, x, y);
  }
  case [first, ...rest] { … } // exact arity unless ...rest
  default {                   // optional in the statement form; must be last; at most one
    M 0 0 L 10 10
  }
}
```

Semantics: scrutinee evaluated once; clauses tested in source order; each clause body runs in a fresh child scope holding its bindings; a bare name in a pattern is a value (compared with `==`), never a binding; non-comparable kinds (Point vs number, Color, arrays) are a non-match, never an error; a `where` guard runs once after the first matching alternative binds and applies to the whole clause; alternatives in one clause must bind the same names (parse error otherwise); no match and no `default` is a no-op.

## Phase 0: Docs first (before any code)

- `docs/syntax.md`: new `## Switch Statements` section between `## Conditionals` (line 1416) and `## Functions` (1434). House style: `##` heading, one-line imperative lede ending in a colon, untagged fence, one semantics paragraph, then `###` subsections: Value patterns, Multiple values, Range patterns, Destructuring patterns, Guards, Default, Scope and loop control, Switch inside text blocks, and the reserved-words note in the style of line 1412. Update the placement bullet at line 1410 to mention `switch` cases.
- `docs/path-blocks.md:133`: add `switch` to the control-flow enumeration.
- `syntax.md` is already registered in `DOC_FILES`; run `npm run build:docs`, then the content-reviewer agent before commit (mandatory per `docs/CLAUDE.md`).
- Phase 2 adds `### Switch expressions` to the same section.

## Phase 1: Statement form

### 1. Grammar — `src/parser/pathogen.grammar`

Add to `statement` (line 24) after `IfStatement`, and to `textBodyItem` (line 118) after `TextIfStatement`:

```
SwitchStatement { kw<"switch"> "(" expression ")" "{" (CaseClause | DefaultClause)* "}" }
CaseClause      { kw<"case"> CasePattern ("," CasePattern)* WhereGuard? Block }
DefaultClause   { kw<"default"> Block }
WhereGuard      { kw<"where"> expression }
CasePattern     { RangePattern | expression }
RangePattern    {
  expression rangeOp ~rangeEnd expression |
  expression rangeOp ~rangeEnd |
  rangeOp expression
}
rangeOp { RangeOp | HalfOpenRangeOp }

TextSwitchStatement { kw<"switch"> "(" expression ")" "{" (TextCaseClause | TextDefaultClause)* "}" }
TextCaseClause      { kw<"case"> CasePattern ("," CasePattern)* WhereGuard? "{" textBodyItem* "}" }
TextDefaultClause   { kw<"default"> "{" textBodyItem* "}" }
```

Tokens: `HalfOpenRangeOp { "..<" }` next to `RangeOp` (line 436); precedence line 489 becomes `@precedence { "...", HalfOpenRangeOp, RangeOp, "." }`. `Number` already refuses a trailing `.` (line 403), so `100..` lexes as `Number RangeOp` with no token change.

Destructuring is a **cover grammar**: `case [a, b]` and `case {x, y}` parse as `ArrayLiteral` / `ObjectLiteral` (both already accept shorthand and spread forms) and the AST builder reinterprets them. This avoids the reduce/reduce conflict a dedicated `ArrayDestructure` alternative would create, and mirrors how assignment is already handled (grammar comment at lines 44-46).

Expected generator conflicts and resolutions (verify by running the generator immediately after the edit; this is the checkpoint before any TypeScript):

| Conflict | Cause | Resolution |
|---|---|---|
| `{` after a call or member (`case f(x) {`, `case Anchor.Center {`, `where g(x) {`) | shift into optional `TrailingBlock` vs reduce so the case `Block` can start | `~caseBody` ambiguity marker on the four `postfixExpression` alternatives that admit `TrailingBlock` (precedent: `~layerStyle`, line 347). GLR forks; the lambda fork dies unless the next token is `\|`/`\|\|`. No `@dynamicPrecedence` needed. Add a regression test for `list.map {\|x\| x}`, `f(x) {\|a\| a}`, `obj.m {\|\| 1}`. |
| `{` after `100..` | upper-bound `ObjectLiteral`/lambda vs case body | `~rangeEnd` marker as written above. The bound fork dies at `case`/`default`/`}`. Fallback if recovery misbehaves: drop `a..` and offer C#-style relational patterns `case >= 100` instead. |
| `for (i in 0..<n)` | `HalfOpenRangeOp` not shiftable there | Out of scope: parses as an error today and tomorrow. Optional consistency item at the end of Phase 1. |

Regenerate: `npx lezer-generator src/parser/pathogen.grammar --typeScript -o src/parser/pathogen.generated.ts` (no npm script exists; also rewrites `.terms.ts`). Diff the `specialized:` line at `pathogen.generated.ts:24`; re-apply `keyof typeof spec_Identifier` only if it comes back as `any`.

### 2. AST — `src/parser/ast.ts`

```ts
export interface SwitchStatement { type: 'SwitchStatement'; discriminant: Expression; cases: SwitchCase[]; defaultCase: SwitchDefault | null; loc?: SourceLocation }
export interface SwitchCase    { type: 'SwitchCase'; patterns: CasePattern[]; guard: Expression | null; body: Statement[]; loc?: SourceLocation }
export interface SwitchDefault { type: 'SwitchDefault'; body: Statement[]; loc?: SourceLocation }
export type CasePattern = ValuePattern | RangePattern | ArrayDestructuringPattern | ObjectDestructuringPattern;
export interface ValuePattern { type: 'ValuePattern'; value: Expression; loc?: SourceLocation }
export interface RangePattern { type: 'RangePattern'; start: Expression | null; end: Expression | null; inclusive: boolean; loc?: SourceLocation }
```

Add `loc?` to the two existing destructuring pattern interfaces (lines 332-343). Register `SwitchStatement` in `Node` (17), `Statement` (65), `TextBodyItem` (383). Text form reuses `SwitchStatement` with `TextBodyItem[]` bodies cast to `Statement[]`, exactly as `TextIfStatement` reuses `IfStatement`.

### 3. AST builder — `src/parser/ast-builder.ts`

- `buildStatement` (line 310): `case 'SwitchStatement'`. Text dispatch: see the shared helper below.
- `buildSwitchLike(cursor, source, caseNode, defaultNode, buildBody)`: CST walk with `buildExpressionWithPostfix` (line 1476) for the discriminant, as `buildForLoop` does; not slice-and-reparse (which re-enters `buildAST` and interacts with `loopDepth`). Enforces at parse time with the existing `Parse error at line L, column C:` prefix: `default` not last, more than one `default`.
- `buildCaseClause`: patterns from `CasePattern` children, guard from `WhereGuard`, body via `buildBlock` (never `buildLoopBody`, so `loopDepth` is untouched and `break` semantics fall out of the existing machinery at lines 263-306). Then `checkAlternativeBindings` (same bound-name set across comma alternatives, else parse error).
- `asCasePattern(expr)`: `ArrayLiteral` of identifiers (+ trailing `SpreadElement(Identifier)`) → `ArrayDestructuringPattern`; `ObjectLiteral` of `shorthand` props, `key: Identifier` props, trailing spread → `ObjectDestructuringPattern` (`buildObjectLiteral` already records `shorthand`, line ~2085); anything else literal-shaped (`case [1, 2]`, `case {x: 1}`) → parse error with a message that shows the valid form; otherwise `ValuePattern`. `[]` and `{}` are allowed (empty array / any object).
- `buildRangePattern`: same `phase` walk as `buildForLoop` (546-547); `inclusive = tokenName === 'RangeOp'`; a missing side stays `null`.
- **Shared text-body dispatcher** `buildTextBodyItems(cursor, source)` with the full item dispatch (Tspan, TemplateLiteral, TextForLoop, TextForEachLoop, TextIfStatement, TextSwitchStatement, else `buildStatement`). Use it in `buildTextBlock` (1242), `buildTextForLoop` (1291), `buildTextForEachLoop` (1330), `buildTextIfStatement` (1367), and the new `buildTextSwitchStatement`. This is required (without it a switch nested in a text loop is silently dropped by `buildStatement`'s `default: return null`) and it fixes two latent bugs: line 1372 dispatches a nested `TextForLoop` to the top-level `buildForLoop` (empty body), and `buildTextForEachLoop` never dispatches nested `TextIfStatement`/`TextForLoop` at all.

### 4. Evaluator

Two new shared modules, imported by both evaluators so `annotated.ts` gets no divergent copy (precedent: `angle.ts`, `struct-properties.ts`, `builtin-enums.ts`):

`src/evaluator/value-semantics.ts`
- `toNumber(v)` — the identical bodies at `index.ts:551` and `annotated.ts:165` move here.
- `valuesEqual(a, b): boolean | undefined` — the three `==` tiers extracted from `index.ts:1704-1777` (null, string/boolean coercion, numeric); `undefined` means non-comparable. Both `BinaryExpression` evaluators call it first and keep their existing "requires numeric operands" throw for `undefined`, so `==` cannot drift from `case`.
- `isTruthy(v)` — the canonical `if` formula (`index.ts:8856`). Replaces the seven inline copies (see Adjacent fixes).

`src/evaluator/switch-match.ts`
- `destructuringShapeMatches(pattern, value)` — pure shape test: array pattern needs `ArrayValue` with exact length (≥ with rest); object pattern needs `ObjectValue` with every key, or a struct via `getStructDescriptor` (`struct-properties.ts:156`) with every key. Never binds, never throws.
- `patternMatches(pattern, scrutinee, host)` and `caseMatches(clause, scrutinee, host)` where `host = { evaluate(expr), bind(pattern, value), fail(msg) }` is a six-line adapter each evaluator builds over its own `evaluateExpression`, `bindDestructuringPattern` (`index.ts:8574`, `annotated.ts:5433`) and `formatError`/`getLine`. Range bounds that are not numeric → `host.fail('Range pattern bounds must be numeric')`; a non-numeric scrutinee against a range → non-match.

Six dispatch sites, all with the same shape (evaluate discriminant once; per clause `createScope(scope)`, `caseMatches`, run body in that scope, stop; default in its own child scope):

| Site | Flow handling |
|---|---|
| `index.ts:8853` `evaluateStatementToAccum` | `return evaluateStatementsToAccum(body, caseScope, accum)` like `IfStatement` (loop-transparent `LoopFlow`) |
| `index.ts:2164` `evaluateTextBlockBody` (`&{ }`) | recurse with child scope, `return flow` if set |
| `index.ts:8547` `evaluateTextBody` (`text(){ }`) | same; child scope even though text-`if` passes `scope` through |
| `annotated.ts:5615` `evaluateStatementPlain` | one `caseScope` for the whole body; `if (pendingFlow) break;` after each statement |
| `annotated.ts:6018` `evaluateStatementAnnotated` | same; no trace line emitted (parity with `IfStatement`) |
| `annotated.ts:3929` / `4106` text walkers | recurse with child scope; add the missing `if (pendingFlow) return;` at the top of the `evaluateTextBlockStatements` loop |

Bindings always go through `setVariable` (the reserved-name funnel, `index.ts:880`), which `bindDestructuringPattern` already does.

### 5. Language services and surfaces (ordered)

| # | File | Change |
|---|---|---|
| 1 | `src/parser/path-args-tokenizer.ts:4` `KEYWORDS` | add `switch`, `case`, `where` (load-bearing: the path-args tokenizer otherwise swallows the keyword as an argument) plus the missing `break`, `continue` |
| 2 | `src/parser/highlight.ts:7, 62` | keyword string + `HalfOpenRangeOp` as operator + structural node names → `t.controlKeyword` |
| 3 | `src/highlight.ts:34` `NODE_CLASS` | `switch`, `case`, `where` → `'kw'`; `HalfOpenRangeOp` → `'op'` |
| 4 | `src/language-services/formatter.ts:161` | `case 'SwitchStatement'` printer; `formatCasePattern`; extract the `let` destructuring printer (118-129) into `formatDestructuringPattern` and reuse it; route `TspanStatement`/`TemplateLiteral` inside nested text bodies through `formatTextBodyItem` (today `default: return prefix` at 239 deletes them) |
| 5 | `src/language-services/scope-analysis.ts:243` | child scope per case; destructuring bindings declared with the same `arrayElement`/`objectProp` origin metadata `let` uses (lines 192-205) so hover/type inference work on bound names; guard and body walked in the case scope |
| 6 | `src/language-services/inlay-hints.ts:98` | walk discriminant, pattern expressions, guard, bodies |
| 7 | `src/language-services/diagnostics.ts:289` `describeError` | branches for `SwitchStatement`, `CaseClause`/`TextCaseClause`, `DefaultClause`, `CasePattern`; `errText === ':'` → "Case bodies use braces: case value { ... } (no ':' and no fallthrough)"; top-level `case`/`default`/`where` → "'case' is only valid inside a switch" etc. |
| 8 | `src/language-services/completion-data-static.ts:24` | `switch` snippet (boost 10), `case` snippet (6), `default` block snippet (4), `where` (4); assert `insertText`/`detail` in tests |
| 9 | `src/language-services/hover.ts:19` | `switch`, `case`, `where`, `default` entries; extend the `break`/`continue` text to mention switch cases |
| 10 | `src/language-services/rename.ts:17`, `code-actions.ts:241` | add the three keywords (+ the missing `break`, `continue`); hoist the code-actions set to an exported `RESERVED_IDENTIFIERS` |
| 11 | `src/evaluator/code-snippet.ts:34` | add keywords |
| 12 | `packages/vscode-pathogen/syntaxes/pathogen.tmLanguage.json:93, 350` | keyword regex; range operator `\.\.<?` |
| 13 | `packages/vscode-pathogen/snippets/pathogen.code-snippets`, `playground/utils/codemirror-setup.ts:~185` | `switch` / `case` snippets matching #8 |
| 14 | `src/language-services/symbols.ts` | no change (IfStatement is deliberately absent); test asserts a switch adds no outline symbol |

### 6. Keyword drift guard — `tests/keyword-registry.test.ts`

Reads `pathogen.grammar`, extracts every `kw<"…">` term, and asserts each appears in every hand-maintained list (tokenizer `KEYWORDS`, `parser/highlight.ts` keyword string, `NODE_CLASS`, `KEYWORD_COMPLETIONS`, `KEYWORD_HOVER`, `NON_RENAMEABLE`, `RESERVED_IDENTIFIERS`, `code-snippet.ts` `KEYWORDS`, the TextMate regex) with a small explicit exception set per list (e.g. `calc` is a legal path argument, `in` only follows `for (`). Imports the arrays where they can be exported so a rename is a compile error. Second assertion: `let <kw> = 1;` fails to parse for every keyword, which catches an edited grammar that was not regenerated. Expect it to fail first on the pre-existing gaps; fix them in the same change.

### 7. Adjacent fixes included (all on code paths this feature edits; strike any you'd rather defer)

1. Path-args tokenizer missing `break`/`continue`: `M i 0` newline `break;` currently fails with "Undefined variable: break". One line + test.
2. Text-body builder consolidation (§3): fixes the two silent-drop bugs in nested text `for`/`if` bodies. Tests for both.
3. Annotated `IfStatement` opens a fresh scope **per statement** (`annotated.ts:5625`, `6026`), so `if (x > 0) { let size = 5; M size 0 }` fails under `--annotated` and works in the main evaluator. One line each + parity test. The switch code does not copy this either way.
4. Formatter deletes `tspan`/template items nested inside text `if`/`for` bodies (§5 #4). Needed for text-form case bodies.
5. `isTruthy` unification across all seven inline sites. Behavior change is confined to `""` in ternaries (currently truthy, `if` says falsy) and `0deg`/`""` inside `&{ }` conditions. No test depends on either. If you'd rather not, scope the helper to the five canonical sites plus `where`.
6. Refresh `project-docs/developer-experience/cross-system-feature-lifecycle.md` "Adding a New Keyword": it names a file that no longer exists (`completion-data.ts`) and omits six files a keyword actually touches; point it at the drift guard.

Optional consistency item, recommended, strike if unwanted: accept `..<` in `for (i in a..<b)` and the text-loop form (grammar `rangeOp`, evaluator `end` exclusive, formatter). Otherwise `..<` exists in `case` only and `for` reports "Unexpected '<'".

### 8. Tests (Phase 1)

- `tests/parser.test.ts` `describe('switch statements')`: `toMatchObject` shapes for every pattern kind, comma alternatives, `where`, `default`, empty switch, text form; parse errors with exact `Parse error at line L, column C:` text for default-not-last, two defaults, `case [1, 2]`, mismatched alternative bindings; reserved-word failures for `let switch/case/where = 1;`; trailing-block regression trio. `tests/language-services/ast-builder.test.ts` mirrors two.
- `tests/value-semantics.test.ts`: table-driven `valuesEqual` tiers (`true == 1`, `"1"` vs `1` → undefined, `90deg == 90deg`, Point vs number → undefined) and `isTruthy`.
- `tests/evaluator.test.ts` `describe('switch statements')`, exact `compilePath` strings: first match wins; scrutinee evaluated once (a `log` in the scrutinee fires once); each equality tier; non-comparable → default; ranges incl. half-open boundary, open ends, negative bounds, `45deg` in `0deg..<90deg`, string scrutinee vs range → default; destructuring on ObjectValue, `Point`, exact arity vs rest, `{}`/`[]`; guard sees bindings; bindings invisible after the switch; `let` in a case is block-scoped; `break`/`continue` through a switch in `for`, `text(){}`, `&{ }` (mirror `tests/evaluator.test.ts:4898-5010`); `return` through a switch in a `fn`; switch inside `@{ }` and `apply { }`.
- `tests/annotated.test.ts`: `(parity)` block with a direct main-vs-annotated diff (pattern at line 1229) plus the `let`-inside-if regression.
- `tests/errors.test.ts`: `break` in a case outside a loop (line/col), non-numeric range bound.
- `tests/textblock.test.ts`: switch in `&{ }` and `text(){ }` with `tspan` bodies; nested text-if/for regression.
- Language services: completion (label + `insertText` + `detail`), hover, diagnostics (each message), formatter (exact round-trip incl. ranges/destructuring/`where`; idempotence; tspan preserved), scope-analysis, inlay-hints, symbols, `tests/highlight-tokens.test.ts` (`switch`/`case`/`where` → `kw`, `..<` → `op`), `tests/keyword-registry.test.ts`.

## Phase 2: Expression form

- Docs: `### Switch expressions` in the same section (requires `default`; one expression per arm; a statement-position use needs a trailing `;`).
- Grammar: `SwitchExpression { kw<"switch"> "(" expression ")" "{" (CaseArm | DefaultArm)* ~switchEnd "}" }`, `CaseArm { kw<"case"> CasePattern ("," CasePattern)* WhereGuard? "{" expression "}" }`, `DefaultArm { kw<"default"> "{" expression "}" }`, added to `primaryExpression`; `SwitchStatement[@dynamicPrecedence=1]` with the matching `~switchEnd` marker. The only true ambiguity is the empty body at statement position; arm bodies otherwise disambiguate within two tokens (`{ red }` is not a Block, `{ M 0 0 }` is not an arm).
- AST: `SwitchExpression { discriminant, arms: SwitchArm[], defaultValue: Expression }`; `SwitchArm { patterns, guard, value }`. Missing `default` is a parse-time error (static property, surfaces as an editor diagnostic).
- Builder: `buildSwitchExpression` reuses `buildCaseClause` with an arm-body reader; register in `buildExpression` (~1432) and `isExpressionNode` (~2470).
- Evaluators: `case 'SwitchExpression'` in both `evaluateExpression`s using the same `caseMatches`; `expressionToSource` (`index.ts:574`); `units.ts:57` angle-unit walker.
- Language services: formatter (`formatExpression` case, one line when short like `formatTernary`), scope-analysis and inlay-hints `walkExpr` cases, `type-inference-ast.ts` (infer when all arms agree), highlight node names, diagnostics (`;` inside an arm → "A switch expression arm holds a single expression").
- Tests: exact output for `let fill = switch (kind) { … };`, missing-default error, `{ red; }` diagnostic, nested switch expression, statement-position `switch … {};`, annotated parity.

## Project artifacts — `project-docs/switch-case/`

`primer-v1.md` (language comparison JS/Swift/Ruby/Rust and the decision log), `plan-v1.md` (this plan), `STATUS.md`, demos `demo-shapes.pathogen`, `demo-ranges.pathogen`, `demo-destructure.pathogen`, `demo-text.pathogen`, Phase 2 `demo-expression.pathogen`, each with the CLI-rendered `.svg` and a `.png` beside it.

## Verification

1. `npx lezer-generator …` right after the grammar edit; the conflict report is the go/no-go for §1's resolutions.
2. Targeted suites during development (`npx vitest run tests/parser.test.ts tests/evaluator.test.ts tests/annotated.test.ts tests/textblock.test.ts tests/language-services/`), then `npm run build` and `npm run test:run`.
3. Recompile every published sample (`npm run validate:samples` / the blog and docs example compile scripts) to prove no shipped program used `switch`, `case`, or `where` as an identifier.
4. Three surfaces with the demo files: CLI `npm run cli -- project-docs/switch-case/demo-ranges.pathogen --output-svg-file …` and `--annotated`; playground via `npm run dev:website` (preview matches the CLI SVG, `switch` snippet expands, hover on `case`, diagnostics for `case 1: M 0 0` and a misplaced `default`, format-document round-trips); VS Code extension built and installed per `packages/vscode-pathogen/CLAUDE.md` (TextMate colors, LSP completion/hover/diagnostics, preview parity).
5. `code-reviewer` agent on the diff and `content-reviewer` on the docs section before commit; CHANGELOG entry in the loop-control style (`CHANGELOG.md:542-551`) including the reserved-word compatibility note.

## Risks

- Grammar conflicts are reasoned from LR construction, not yet run through the generator. Fallbacks: move `~caseBody` onto `CaseClause` before `Block`; replace `a..` with relational patterns if the `~rangeEnd` fork hurts editor recovery.
- The `~caseBody` marker is the one edit to an existing expression rule; the trailing-block regression trio guards it.
- `switch`, `case`, `where` become hard reserved words (`@specialize`), a public compatibility change that needs the CHANGELOG note.
