# Phase 0a step 4 — `const`

Plan: `06-phase-0a-plan.md` §Step 4. Decision 7 (`02-decision-log-v1.md`): JavaScript
semantics — the binding is fixed, the contents are not. 2026-10-30.

## Before / after

| | Before | After |
|---|---|---|
| `const margin = 10;` | parse error (`const` was an ordinary name) | a declaration |
| `margin = 12;` after it | — | `Cannot assign to margin — it is a const. Declare it with let if it needs to change`, at the assignment, before the program runs |
| `const k…; let k…;` / `let k…; const k…;` in one scope | — | `Cannot declare k again in this scope — it is a const. Use another name` / `Cannot declare k as a const — it is already declared in this scope. Use another name` |
| `let k = 1; let k = 2;` | the second replaces the first | unchanged |
| `const xs = []; xs.push(1); xs[0] = 2;` | — | allowed (contents are mutable) |
| `@font family;` with `const family = "Inter";` | — | resolves; the error suggests a const |
| `const` as a name or bare object key | a name | a keyword, like `let` (`{ 'const': 1 }` still works) |
| Formatter | printed every declaration as `let` | prints the declaration's own keyword |

## Design

- Grammar: `LetDeclaration { (kw<"let"> | kw<"const">) … }`; regenerated (four tokenizer
  groups, `keyof` already emitted). AST `LetDeclaration.kind: 'let' | 'const'`, required.
- Runtime: `declareBinding(scope, name, value, kind, line)` for let/const statements, the
  text-body let, fn definitions and every destructured name. `Scope.consts` (declared on every
  scope, filled on the first const). `updateVariable` refuses a const. Messages in
  `src/evaluator/const-bindings.ts`, shared with the static check.
- Static check (`src/parser/const-check.ts`, run by `parse()` after the reserved-name check):
  - redeclaration within one statement list (one scope at run time);
  - reassignment only for a name the whole program uses as const declarations, reads and plain
    assignment targets, and nothing else. Any parameter, loop variable, case or callback
    binding, `let`, fn name, property name or string of that name leaves it to the run-time
    check, so no shadowing form can produce a false error. With lexical names (step 3), an
    assignment after a const in the same list, or nested in a later statement of it, assigns
    that const.
  - Run-time only, by design: a function written above the const that assigns to it; any
    name that also appears as a parameter or other binding.
- Keyword registries: tokenizer `KEYWORDS` + `STATEMENT_ONLY_KEYWORDS`, both highlighters,
  code-snippet, completions (keyword + `$` snippet), hover, rename, code-actions (set and its
  `let` regexes), legacy regex inference, completion's destructure-pattern regex, the
  playground's legacy variable regex and `@font` fallback regex and message, TextMate,
  VS Code snippets, the all-syntax fixture. Scope analysis marks `isConst`; semantic tokens add
  `readonly`; symbols use `SymbolKind.Constant` (14), mapped in the language server.

## Docs and reviews

- Round 1: **revise**. Its top finding read the redeclaration rule as general (it never was:
  two `let`s still rebind); the text was ambiguous, so it now says so outright. Placement
  (the naming rules had fallen under `### const`), wording ("keeps the value", "fixes the
  name"), the vague "most mistakes" sentence, when-to-use guidance, the `@font` gotcha, em-dash
  messages, `rowY`, destructuring and shadowing examples, older "let"-only text.
- Round 2: **ready after minor revisions**, all applied: N1 two more "let or const" spots; N2
  the reporting paragraph next to the errors, naming the run-time-only cases; N3 "Two `let`s of
  the same name are fine"; N4 both declaration messages end with ". Use another name", each with
  its program; N5 the full keyword list in the naming rule plus the quoted-key workaround
  (checked: `{ text: 1 }` doesn't parse, `{ 'text': 1 }` and `o['text']` work); N6 `ownSize`;
  N7 "a step count"; N8 the `@font` reason.

## Code review

Approve, no blocking findings. Dispositions:

1. **A naming error blanked editor features.** `parse()` throwing on a const violation made the
   outline and inlay hints return nothing. The same already happened for a reserved name
   (`let rad`). Verified (`tmp/step4/probe-editor-on-violation.ts`): the outline went empty for
   both. Fixed for both: `parse(input, { namingChecks: false })` skips the reserved-name and
   const checks. The outline, inlay hints and formatter use it; compiling and diagnostics keep the
   default. Tested: the outline and formatter work and the diagnostic is still reported.
2. **A loop body's `const i` errors with the loop's own variable `i`,** because the body runs in
   the loop variable's scope; JavaScript allows it. Kept as an error rather than adding a scope per
   iteration (a Map allocation on the hot loop path; 32,000 iterations allowed), matching a fn
   parameter plus a body const. Pinned by a test and named in the docs' run-time-only sentence.
3. **Error order:** a reserved name and a const mistake are now ordered by position. Tested.
4. **Coverage:** the static check is incomplete only in the safe direction. Nodes inside plain
   records aren't walked for assignments; the runtime catches those. A test fails if the AST ever
   holds a Map or Set, which would hide names from the shadowing guard.
5. **Implicit bindings:** none; the evaluator never binds a literal name. Re-grepped.
6. **Tests:** the backstop test now evaluates ASTs that skipped the static check
   (`evaluate(parse(src, { namingChecks: false }))`), for all three messages. A test pins
   `const` as text in strings, templates, quoted keys and style values.
7. No finding: every runtime binding path is correct.

## Verification

- `tests/const.test.ts` (all failing before but the `let`-rebinds pin): the docs examples,
  both rules statically and at run time, the run-time-only cases the docs name, eight
  shadowing forms, path and text blocks, the path-args boundary, the keyword, `@font` (AST and
  the playground fallback), the formatter, outline, semantic tokens, hover, completion, and the
  editor diagnostic in an uncalled fn.
- Full suite before the round-2 message change: 7,623 passed.
- `verify/verify-step4-surfaces.ts`: 30/30 with the final code — engine, `dist/cli.js --json`,
  the playground bundle and the VS Code bundle on every probe, and the editor features from both
  bundles.
- Full suite after the review fixes: 7,629 passed.
- **Repository audit** (`verify/semantics-audit-step4.md`, baseline 37e1051): 1,441 programs.
  1,415 unchanged, **0 changed, 0 that now fail to parse**: nothing in the repository used
  `const` as a name or bare key. 4 too-large (the boolean matrices, as always). 22 skipped: the
  10 from every run, plus the 12 new programs that use `const` and so can't be read by the old
  parser (6 docs examples, the all-syntax fixture, 5 probes), all covered by
  `tests/const.test.ts` or the surface check.
- **Stored workspaces, production** (2026-10-30, the user's go-ahead per decision 22; read-only
  export, deleted afterwards): 215 records (189 workspaces, 20 approvals, 6 review-queue entries).
  **None contains the word `const` at all.** Compared against 37e1051 (production): the 205 that
  compile today are all unchanged; the 10 that don't are the same missing-`;` programs as in
  step 3. Nothing to migrate.
