# `switch` / `case` — design primer (v1, 2026-09-01)

Pathogen had `if` / `else if` / `else` and loops, but no way to dispatch one value across several patterns. Bucketing a continuous value (an angle into quadrants, `t` into phases, a distance into bands) or dispatching on a string, enum member, or struct shape meant an `else if` chain that repeats the scrutinee on every line. The published contract is `docs/syntax.md` → "Switch Statements"; this primer records why it looks the way it does.

## What we borrowed from whom

| Language | Idea | Taken? | Why |
|---|---|---|---|
| JavaScript / TypeScript | `switch (x) { case v: … }` familiarity, `default` | The keyword, the parenthesized scrutinee, `default` | Ryan's home dialect; `default` was already a Pathogen keyword |
| JavaScript | Fallthrough + `break` to exit | **No** | Pathogen's `break`/`continue` are loop control implemented as no-throw flow codes; reusing `break` for switch would change what `break` means inside a switch nested in a `for` — the classic JS trap |
| Swift | No fallthrough; the case is a *pattern* (values, ranges, bindings, `where` guards); comma alternatives; every alternative must bind the same names | Yes, all of it | The pattern model is what makes ranges, destructuring, and guards one grammar rule instead of four features |
| Swift | `case value:` colon form with indented bodies | **No** — braced bodies `case v { … }` | Every other body in Pathogen is braced (`if (…) { }`, `for (…) { }`); braces give each case its own scope, reuse the existing `Block` path in parser/formatter/scope analysis, and avoid the ternary `? :` interaction |
| Ruby | `case x when 1..5` ranges; `when` asks the pattern whether it matches (`===`) instead of comparing with `==` | Ranges yes; the "pattern decides" idea yes | For a drawing language, bucketing a continuous value is the most common switch; a value that `==` cannot compare (Point vs number) is a *non-match*, never an error |
| Rust | `match` as an expression | Phase 2 | Pathogen is expression-first; `let fill = switch (kind) { … };` is planned with the same syntax and single-expression arms |
| C# | Relational patterns `case >= 100:` | Held in reserve | Open-ended ranges `100..` cover the need; relational patterns are the fallback if `100..` ever hurts editor recovery |

## Decisions

- **Braced bodies, no fallthrough.** First matching clause runs, switch ends. `break`/`continue` inside a case target the enclosing loop, exactly as inside `if`; with no loop they remain the existing parse error.
- **Patterns**: value (any expression, `==` rules), comma alternatives, `a..b` (inclusive, same spelling as `for`), `a..<b` (half-open, new `..<` token), open-ended `..b` / `..<b` / `a..`, object/array destructuring reusing `let`'s patterns, `where` guards.
- **A bare name is a value, not a binding.** `case cols - 1 { }` compares; there is no Swift `case let n`. Bindings come only from destructuring.
- **Non-comparable → non-match.** `==` still throws for `Point == 5`; `case 5` against a Point simply does not match. Both go through one shared `valuesEqual` so they cannot drift.
- **`default` last, at most once** (parse error otherwise). Statement form without `default` is a no-op on no match.
- **Text bodies supported** (`text(){ }` and `&{ }`) in v1, through a `TextSwitchStatement` grammar rule mirroring `TextIfStatement`.
- **Reserved words**: `switch`, `case`, `where` (via `@specialize`, like every other keyword). No sample in the repo used them as identifiers.

## Grammar notes (what the generator actually said)

- `case [a, b]` / `case {x, y}` are parsed as array/object **literals** (cover grammar) and reinterpreted by the AST builder; a dedicated destructure alternative would be a reduce/reduce conflict against the literal forms. `ObjectLiteral` already accepts shorthand `{x, y}` and records `shorthand: true`, which is what makes the reinterpretation exact.
- `{` after a call or member in pattern position (`case f(x) {`, `case Shape.Circle {`) is a shift/reduce conflict against `TrailingBlock` lambdas. Resolved with `~caseBody` ambiguity markers on the four `postfixExpression` alternatives that admit a trailing block (precedent: `~layerStyle`). GLR forks; the lambda fork dies unless `|` follows.
- `case 100.. {` is a similar fork between an upper-bound expression starting with `{` and the case body; `~rangeEnd` markers resolve it.
- `Number` already refuses a trailing `.`, so `100..` and `0..<10` lex with no token changes beyond adding `HalfOpenRangeOp { "..<" }` ahead of `RangeOp` in the precedence line.
- The generator reported **zero** conflicts with these markers; every form in `docs/syntax.md` parses error-free, and the trailing-block lambda forms still parse.

## Evaluator notes

- Shared modules `src/evaluator/value-semantics.ts` (`toNumber`, `valuesEqual`, `isTruthy`) and `src/evaluator/switch-match.ts` (`patternMatches`, `caseMatches`, `selectSwitchClause`) are imported by both evaluators; each evaluator contributes only a six-line `MatchHost` adapter.
- Six dispatch sites: main `evaluateStatementToAccum` + two text walkers; annotated `evaluateStatementPlain` + `evaluateStatementAnnotated` + two text walkers.
- `isTruthy` replaced seven inline truthiness formulas that had diverged (`""` was truthy in ternaries but falsy in `if`; `0deg` was truthy in `&{ }` conditions). All seven now agree with `if`.

## Bugs found on the way (fixed in this change)

1. Path-args tokenizer stop-set was missing `break`/`continue`: `M i 0` newline `break;` failed with "Undefined variable: break".
2. Text-body builders were four hand-copied dispatchers with different coverage: a `for` nested in a text `if` got an empty body, and a text `foreach` never dispatched nested `if`/`for` at all. Now one `buildTextBodyItem`.
3. Annotated `IfStatement` opened a fresh scope per *statement*, so `if (x) { let size = 5; M size 0 }` failed under `--annotated`.
4. Annotated mode had no `AssignmentStatement` case at all: `len = 70;` failed even at top level.
5. Formatter deleted `tspan`/template items nested inside text `if`/`for` bodies.
