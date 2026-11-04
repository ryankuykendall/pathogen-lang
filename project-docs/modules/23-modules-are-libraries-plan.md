# Modules are libraries: a `module;` header, and no drawing at a module's top level (plan, approved 2026-11-04)

This plan replaces the "a file with exports is still a program" design of steps 1–5. It came out of a plan-mode discussion after step 5. The discussion is summarized first, then the approved plan follows as written.

## The discussion

**The concern (yours).** A random `.pathogen` file that draws (`M 0 0 h 20 v 20`) became importable just by putting `export` on a fn. You proposed that a module be non-drawing, asked whether module declarations should be explicit (three block or namespace forms), and asked what users would lose: StyleBlocks, and PathLayers defined in a module.

**What "can't draw" means in Pathogen.** The evaluator already lists exactly which state is the drawing (`BlockLocalField`):
- the pen;
- the layers;
- the active and default layer;
- the transform;
- the ViewBox;
- the top-level path output;
- subscriptions.

A module's top level may not change any of these. Values are fine: StyleBlocks, PathBlocks (each draws in its own private state), defs, Colors and `@font`. Exported fns still draw, into the caller's drawing.

**What we lose:**
1. **A layer value in a module.** There are equal alternatives: export the style and let your file define the layer, or export a fn that makes the layer when called.
2. **A demo inside the library file.** This is the real cost. A `demo { }` block that runs only when the module itself is compiled is the agreed future fix.
3. **A library setting up a shared visual context just by being imported.** It now needs an explicit `setup()` fn.

**What it simplifies.**
- Step 5c becomes mostly unreachable: no layer, transform or subscription can exist in a module.
- Imports only build values.

**Header vs block.** Both make a file importable and switch on the rule.
- **The header (`module;`)** keeps the file's top level as the module. Every step 1–5 rule stays as written, there's no extra nesting, and private helpers and importer-chosen namespaces stay. Its weakness: one line changes the rules for the whole file.
- **A block's one real advantage** is code outside the braces in the same file, such as a demo.
- **A block's costs:**
  - the whole library is indented;
  - the inside must be sealed from the outside;
  - every top-level rule must be restated relative to the block;
  - scope analysis, the formatter and the freeze walk need new scope kinds.
- **The other variants:**
  - **exporting everything** loses private helpers, and "default" clashes with JS and with our 1b plan;
  - **author-named namespaces** stop importers from renaming, and can collide with each other or with built-ins.

**Decided:**
- strict modules;
- the `module;` header;
- demos later, as a `demo { }` block.

---

# The approved plan

## Context

Phase 1a so far (local commits, nothing pushed) lets any `.pathogen` file be imported if it has `export`s. The imported file's top level then runs, drawing included, on every compile, and its drawing is thrown away. You were uneasy that a random program becomes a library just by having a few exports.

In the 2026-11-04 discussion we decided:
- **Modules are strict.** A module's top level declares and computes values but never draws. Exported fns still draw, into the drawing that calls them (phase 0a's rule).
- **A file says it's a module with a header:** `module;` as its first statement. Only a module can be imported.
- **Demos are for later.** We'll add a `demo { }` block that runs only when the module itself is compiled; that's not part of this work.

The aim is predictable imports: loading a library builds values and nothing else, and importability is a deliberate choice by the library's author.

## The rule

| At a module's top level | |
|---|---|
| `import`, `const`, `let`, `fn`, `enum`, `export`, `@font` | allowed |
| Values: StyleBlocks, PathBlocks, TextBlocks, glyphs, Colors, CSSVar, masks/gradients/patterns/markers/filters, Cycler, Grid, math | allowed |
| `log()`, `assert()` | allowed (my default; say if you'd rather not) |
| Path commands, drawing calls used as statements (`circle(…);`) | error |
| Layers: `define PathLayer/TextLayer/GroupLayer`, `PathLayer('x') …` as a value, `toCodeSnippetBlock`, `apply` blocks, text statements | error |
| `define ViewBox`, `.subscribe(…)`, reading `ctx` or `viewbox` | error. A module has no drawing and no canvas: today a top-level `viewbox` read silently returns the default box. Inside fns, `ctx` and `viewbox` follow the call |

Also:
- Importing a file without `module;` is an error at the import.
- `export` in a file without `module;` is an error. Today it is allowed and does nothing.
- A module compiled on its own draws nothing. Its rules don't depend on how it's opened.

## Approach (a new step 5e, before the editors in step 6)

1. **Docs first** (docs/modules.md, then a content review, then your approval). Rewrite these sections:
   - the intro bullets and "Exporting" (the header, private helpers, a file with exports is no longer a program, with no demo section);
   - "An imported file runs on its own" (a module has no drawing: it only builds values);
   - the drawing-tied paragraph of "What you import is fixed" (layers can't exist in a module, so export a style or a fn instead);
   - the Errors table: add the not-a-module, export-outside-a-module and can't-draw rows; drop the two layer/transform/subscription rows that 5c added;
   - "In each tool": the playground line saying "`export` is allowed and does nothing" is no longer true;
   - the imports-first rule and its quoted message (`IMPORTS_FIRST_MESSAGE`, "only comments may come first"): `module;` now comes before imports.

   **Line numbers.** The header adds a line to every example library, so the line numbers in the "Errors in other files" examples and the `ids.pathogen` example shift. Recompute them deliberately in the draft, and tell the content reviewer and you that they're computed by hand until the word-for-word docs-example tests confirm them.

   docs/syntax.md gets `module` in the keyword list as contextual, like `from`. Update `22-docs-changes-awaiting-approval.md` to match.
2. **Syntax.**
   - **Grammar:** `module` becomes a contextual keyword via `@extend` (as `fromKw` does in src/parser/pathogen.grammar). A `ModuleHeader { moduleKw ";" }` statement is allowed at the top level, then the grammar is regenerated.
   - **AST and builder:** an AST node for it.
   - **`findModuleViolations`** (src/parser/module-check.ts): the header must come first (only comments before it), and the imports-first rule and `IMPORTS_FIRST_MESSAGE` now allow it before imports; `export` without a header is an error; in a module, the syntactic drawing statements at the top level are errors (path commands, `apply` blocks, `define` statements, text statements), positioned so editors underline them as you type. Messages go in src/module-messages.ts.
   - **Everywhere else a new statement must be handled:** the formatter (a missing case deletes source: trap T12), scope analysis, symbols, hover and keyword completion, TextMate highlighting, snippets, and the path-args tokenizer's keyword lists (as for `from`).
   - **Existing programs:** `module` stays a valid name everywhere else. `module;` as a first statement is an undeclared-variable error today, so no working program changes. `export` arrived in phase 1a, which is unpushed; production had 0 uses (decision 34 scan).
3. **Loader** (src/host/load-modules.ts, `resolveModules`): a file without the header is an error at the import line, through the existing `ModuleLoadError` path, so the CLI and editors place it like other load errors.
4. **Runtime guard** (src/evaluator/index.ts): while a module loads, **its own root drawing state** is sealed, and each write point throws a positioned "can't draw at its top level" error:
   - `recordPath` (src/evaluator/segments.ts, the one writer of path output), through a flag on that state's root PathStore only;
   - the layer constructors and `define` statements (~6 sites);
   - `define ViewBox`;
   - `subscribe`;
   - `ctxValueFor` and the `viewbox` read, when the drawing they'd describe is that sealed state.

   **What is never sealed:**
   - **Block states** (`@{ }`, `&{ }`) and def builders (Marker, Mask, Pattern content). Each check tests that specific sealed state, not "a module's code is running". So a top-level `@{ m 0 0 l 10 0 }`, a block that reads its own `ctx`, and `Marker(…) {|m| m.append(…) }` all keep working.
   - **A fn called from your file:** it runs in your drawing.

   This catches indirect drawing, like `gear(…);` at the top level, which the static check can't see.
5. **Simplify what strictness makes unreachable:**
   - Step 5c's use-site checks (`drawingValueUse` at 6 sites) and its export check go. `fixFile` keeps a cheap load-time safety check, so a drawing-tied value held by a module becomes a clear error instead of silent misuse.
   - Step 3's subscription dispatch at the end of a module's load goes (no subscriptions can exist).
   - The step 3 and 5c notes get an amendment pointing here.
6. **Tests:**
   - Rewrite tests/modules-drawing.test.ts as the "modules can't draw" matrix: every top-level drawing form, static and runtime; drawing through a called fn; `ctx` and `viewbox`; a module compiled alone.
   - **Test the allowed side as hard as the forbidden side**, since an over-broad seal would break real library code without anyone noticing. At a module's top level:
     - `@{ … }` blocks that move the pen and read their own `ctx`;
     - `&{ … }` text blocks and glyphs;
     - boolean ops;
     - Marker, Mask and Pattern built with `.append(…)` or a trailing block;
     - `Font.info`;
     - a `const x = helper();` whose helper uses only path blocks.

     Most of these already exist as module fixtures in the step 4, 5a and 5b tests; with `module;` added, their continuing to pass is that check.
   - New syntax tests: header placement, `export` without a header, the formatter round-trip, highlighting.
   - Loader tests for importing a non-module.
   - Add `module;` to every module fixture in tests/modules*.test.ts, tests/cli.test.ts and the docs examples. Rewrite the tests that relied on modules drawing: subscriptions while loading (modules-ids), inks/drawing fixtures, the demo-in-library CLI case.

## Critical files

- docs/modules.md, docs/syntax.md, project-docs/modules/ (step notes, 22-…)
- src/parser/pathogen.grammar (+ regenerate), src/parser/ast.ts, src/parser/ast-builder.ts, src/parser/module-check.ts, src/module-messages.ts
- src/host/load-modules.ts
- src/evaluator/index.ts (loadModules, the write sites, ctxValueFor, removal of the 5c checks), src/evaluator/segments.ts (recordPath), src/evaluator/module-runtime.ts (fixFile)
- src/language-services/ (formatter, scope-analysis, symbols, hover, completion-data-static), packages/vscode-pathogen TextMate grammar and snippets
- tests/modules*.test.ts, tests/cli.test.ts, tests/docs-examples.test.ts, formatter and keyword-registry tests

## Verification

- The usual per-commit gates:
  - the module tests and the full suite;
  - each commit's tree tested alone;
  - the semantics audit (one-file programs: 0 changed, since only files with `module;` or imports are affected);
  - a code review.
- **CLI end to end:**
  - a library with `module;` drawing gears from your file;
  - importing a program without the header gives the error at the import;
  - a module with `M 0 0` at its top level gives the positioned error;
  - `gear(…);` at a module's top level gives the runtime error at that line.
- **Editors** (static diagnostics) come with step 6, but `getDiagnostics` already runs `findModuleViolations`, so the underline is tested here.
- **Benchmark:** the 5c check removal should recover its read and call cost (tmp/phase1/bench-step5c.ts).

## Sequencing

The commits are local and unpushed, and there are new commits on top: no history rewrite, so the trail of what was tried stays. This rework comes before step 6, because the editors would otherwise be built on rules that are about to change. The pre-push gate stays: your approval of the docs.
