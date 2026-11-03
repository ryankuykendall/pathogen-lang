# Phase 1a, step 1: import/export syntax

2026-11-03. Plan: `12-phase-1-plan.md` "Step 1: syntax". Docs: `docs/modules.md` plus the passages on other pages; the content review is in `reviews/phase-1a-docs-review.md`, and the user approved after it ("Let's move on").

## What this step delivers

| Area | Change |
|---|---|
| Grammar | `ImportDeclaration` (`ImportSpecifiers` / `NamespaceImport` / `DefaultImport`), `ExportDeclaration` around a `LetDeclaration`/`FunctionDefinition`/`EnumDefinition`. `import`/`export` are `kw<>`; `from` is `@extend`, like `as` and `with`. No conflicts; the tokenizer still has four groups; the `keyof` line came out right with `--typeScript` |
| AST | `ImportDeclaration { source, sourceLoc, specifiers[{imported, local, loc, localLoc}], namespace? }`. `export` is a flag (`Exportable { exported, exportLoc }`) on the three declarations, so every walker keeps working unchanged |
| Builder errors | nested `import`/`export`, a default import, `export let`, all positioned (`ast-builder.ts`, top-level loops call `buildTopLevelStatement`) |
| Static rules | `src/parser/module-check.ts` on the tree: imports first (comments may precede), a name imported twice, a top-level declaration reusing an imported name. Assignment to an imported name is in `const-check.ts` (fixed like a const; message names the path as written minus `./`). A built-in name in an import goes through `reserved-bindings.ts` (`ImportSpecifier` case) |
| Syntax-error messages | `export` before a non-declaration, and an import with nothing complete before its path ("Incomplete import — …"), from parse() and the editor alike |
| Messages | all in `src/module-messages.ts`, word for word with the docs table |
| Evaluator | `ImportDeclaration` → the no-project-folder error at the import (no host passes modules yet) |
| Editors | formatter (import printing in double quotes with re-escaping, `export` prefix, verbatim spans keyed on `exportLoc`), scope analysis (`'import'` declarations, fixed), hover label "imported name" and keyword hover, semantic tokens, completion (`import` snippet, `export`), diagnostics list every module violation at its word |
| Keyword lists | path-args tokenizer (`import`, `export`; NOT `from`), both highlighters (+ `as`/`with`/`from` in `src/highlight.ts`), code-snippet, rename, code-actions, TextMate (`import`/`export` in the keyword match; an `import-header` begin/end rule where `from` is a keyword only before a quoted path), VS Code snippet |
| Fixtures | `all-syntax.pathogen` exports a const, a fn and an enum; new `test-fixtures/modules/` (pathogen.json, main.pathogen with both import forms, parts/gears.pathogen). The fixture test counts node types across both; `DefaultImport` is the one written exception |

## Decisions taken during the step

- **"Incomplete import" for a half-typed import.** Probing what the editor shows on each keystroke (`tmp/phase1/probe-half-typed.ts`) found "Missing ';'" at odd places. Now any error before a complete path reads `Incomplete import — write it as import { name } from "./file.pathogen"; or import * as name from "./file.pathogen";` at `import`. A row was added to the docs table.
- **The default-import message says `import { … }`**, since the compiler can't know the library's names. The docs row was changed to match.
- **The duplicate-import message says `{ gear as … }`**, not a made-up name. The docs row was changed to match.
- **The formatter prints import paths in double quotes**, like `@font`, and re-escapes `"` and `\` (code review finding 1; the `@font` path got the same fix).
- **`import { circle }` keeps the plain built-in message.** No file can export a built-in name, so an `as` hint would suggest something that can't work. There's a comment in reserved-bindings.ts.

## Checks

- `tests/modules-syntax.test.ts`: every docs message word for word with its position, the AST shapes, no-project-folder parity (`compile`, `getDiagnostics()` with no options and with fonts), `export` does nothing in the compiled file, `from` as a name everywhere, path arguments stop at `export`, the formatter (stable, verbatim with `export`, escapes), scope analysis and hover, error ordering, `namingChecks: false`, half-typed imports.
- `tests/keyword-registry.test.ts`: `import`/`export` in every registry; the contextual keywords are covered by both highlighters; `from` is absent from every registry that would reserve it; the TextMate `from` rule colours only the keyword.
- `tests/all-syntax-fixture.test.ts`: both fixtures, one exception.
- Full suite (before the review fixes): 184 files, 7,760 passed.
- Production KV (decision 34): 0 of 216 stored programs use `import`/`export`; dev KV 0 of 406.
- Semantics audit against `8cbe778`: see below.

## Code review (approve, no blockers)

| # | Finding | Disposition |
|---|---|---|
| 1 | Formatter wrote an unescaped path, so `'./a"b.pathogen'` or a backslash would break | **Fixed** with `doubleQuoted()`, also used for `@font`; tests for both |
| 2 | `import { circle }` could hint `as` | **Kept the plain message on purpose**, with a comment |
| 3 | TextMate rule was single-line and lazy (`import { from } from`) | **Fixed**: a begin/end rule, with `from` only before a quote; the test checks the regex |
| 4 | const-check's heuristic skips a name used elsewhere as a parameter | **For step 3**: the run-time import binding must reject assignment (in the plan's amendments) |
| 5 | No ordering or `namingChecks:false` tests | **Added** |
| 6 | Thin `from` coverage | **Added**: `import { from }`, `{ x as from }`, `* as from`, a gradient's `.from`, hover on a variable `from` |
| 7 | `import`/`export` as keys now fail | Expected; the KV scan found none; the CHANGELOG names both words (step 7) |
| 8 | `import { a as } from "…"` gave "Missing ';'" | **Fixed**: an error before the end of the path is "Incomplete import" |
| 9 | `reservedBindingError({ name: '' … })` hack | **Fixed**: `parseErrorAtOffset` |
| 10 | Pin where an exported const's redeclaration lands | **Added** (on `const`, as for a plain const) |

## Left for later steps

- Step 2: the loader; the CLI computes the project folder whenever there's an import.
- Step 3: the evaluator backstop for assignment (review 4).
- Step 6: the playground error panel check in the real browser; the built-in-name quick fix on an import (`renameBuiltinNameFix` already renames an alias or a namespace name, which is the name after `as`); eyeballing `test-fixtures/modules/main.pathogen` in VS Code.
