# Cross-System Feature Lifecycle

**Date**: 2026-04-07 (updated 2026-04-10: added Playground wire-up rows and the language-services feature lifecycle; updated 2026-04-20: added Three-Surface Parity principle and the constructor-type playground wire-up steps after the Marker playground-render gap was discovered; updated 2026-09-19: swept for stale claims against the code — the VS Code preview is functional, defs are built once in `src/render/build-defs.ts`, completion data is generated from `src/pathogen-api.ts`, enums live in `builtin-enums.ts`, constructors in `constructor-registry.ts`, the site is served at the apex path; added the new-expression-node checklist).

When a language feature is added to Pathogen (keyword, stdlib function, enum, type, syntax construct), multiple systems need coordinating updates. This document is the comprehensive reference for that process.

**Quick-reference versions**: See the cross-cutting section in `.claude/CLAUDE.md` and the per-system CLAUDE.md files for concise checklists.

## Three-Surface Parity Principle

Pathogen exposes **three user-facing surfaces** where every feature must work identically:

1. **CLI** — `src/cli.ts` invoking `src/svg-generator.ts`, which serializes the shared render tree (`buildSvgTree` → `toSvgString`) into a complete SVG string
2. **Playground** — the browser SPA (served at the apex path; workspaces at `/workspaces`), rendering live in `playground/components/svg-preview-pane.ts`
3. **VS Code** — the extension preview webview in `packages/vscode-pathogen/src/preview.ts`, which compiles in-page with the bundled library and mounts the same shared render tree (and LSP features via `packages/pathogen-language-server`)

**Shipping a feature means reaching all three surfaces.** "It works in the CLI" is not done. A feature that lands in `src/` but isn't wired through to the playground preview pane or the VS Code preview is a **silent regression** — the user runs the same program twice, gets working output from the CLI and broken output from the browser, and concludes the tool is broken. This is what happened with the Marker feature (commit `87298e0` shipped CLI and tests but not the 5-file playground wiring chain; discovered 2026-04-20).

Drift between surfaces is the primary failure mode. Two tests guard it: [`tests/cross-channel-parity.test.ts`](../../tests/cross-channel-parity.test.ts) covers the language-services channel (completion, hover, etc.), and [`tests/render-channel-parity.test.ts`](../../tests/render-channel-parity.test.ts) (added 2026-04-21) runs every fixture through both render adapters — `toSvgString` for the CLI and `mountInto` for the playground and VS Code — and structurally diffs the output. Neither test can see a field that never reaches the adapter, which is exactly the playground's failure mode (a `result.<feature>s` array the store never forwards), so every checklist here still calls out the three-surface wiring steps explicitly and the Post-Change Verification Checklist still requires a manual three-surface diff.

**Render-channel wiring surface.** Since the render-pipeline unification (2026-04-21) the `<defs>` elements themselves are built in ONE place, `src/render/build-defs.ts` (`buildDefs`, one `build<Feature>` function per construct). The surfaces differ only in how the compile result reaches it:
- **CLI**: `src/svg-generator.ts` passes the whole `CompileResult` to `buildSvgTree` — a new construct handled in `build-defs.ts` appears with no CLI change
- **Playground**: five-file chain — `playground/types/compiler.d.ts` (add `<Feature>Output` type) → `playground/types/store.d.ts` (add field) → `playground/state/store.ts` (initializer) → `playground/components/workspace-view.ts` (forward `result.<feature>s`) → `playground/components/svg-preview-pane.ts` (add the field to `DefsData`, forward it into the `window.PathogenLang.buildDefs({...})` call, and add its `data-<feature>-def` attribute to the cleanup selector). The preview pane rebuilds a partial result by hand, so a field that is not forwarded is silently dropped — this chain is still where features go missing
- **VS Code**: `packages/vscode-pathogen/src/preview.ts` calls `PathogenLang.compile()` then `PathogenLang.buildSvgTree(result, …)` inside the webview and mounts `<defs>` generically — a new construct needs no `preview.ts` change, but it does need a rebuilt bundle: `npm run build` then `npm run build:vscode` (which copies the browser bundle into the extension's `compiler/` directory)

## Feature Catalog — Single Source of Truth

Every language-services feature is registered in [`src/language-services/feature-catalog.ts`](../../src/language-services/feature-catalog.ts). The catalog is the authoritative registry of:

- What language-services functions exist
- Which LSP capability each feature corresponds to in the VS Code extension
- Whether each feature is wired into the Playground editor (and if not, why)
- Which LSP trigger characters each feature uses

The parity test at [`tests/cross-channel-parity.test.ts`](../../tests/cross-channel-parity.test.ts) enforces that every feature in the catalog is wired into every channel that needs it. **If you add a new language-services function without updating the catalog, the parity test fails.** If the catalog has an entry marked `playgroundRequired: true` that is not referenced in `playground/utils/cm-language-services.ts`, the parity test fails. Same for VS Code capability declarations in `packages/pathogen-language-server/src/server.ts`.

See also [`playground-language-parity.md`](./playground-language-parity.md) for the architecture of the Playground wire-up and the test's assertions.

## System Map

```
                             ┌─────────────┐
                             │   docs/     │  User-facing developer documentation
                             └──────┬──────┘
                                    │
                         (shared engine: compiler + intelligence)
                    ┌───────────────┴───────────────┐
             ┌─────┴──────┐                   ┌─────┴──────────┐
             │  Compiler  │                   │ Language       │
             │  src/      │──────────────────▶│ Services       │
             │  parser/   │                   │ src/language-  │
             │  evaluator/│                   │ services/      │
             │  stdlib/   │                   │                │
             └─────┬──────┘                   └────────┬───────┘
                   │                                   │
                   ▼                                   ▼
           ┌───── three user-facing surfaces (must maintain parity) ──────┐
           │                                                              │
    ┌──────┴────┐       ┌──────────────────┐        ┌────────────────────┴──┐
    │ 1. CLI    │       │ 2. Playground    │        │ 3. VS Code Extension  │
    │ src/cli.ts│       │ playground/      │        │ packages/vscode-      │
    │ src/svg-  │       │ (svg-preview-    │        │   pathogen/           │
    │ generator │       │  pane.ts, etc.)  │        │ packages/pathogen-    │
    │ .ts       │       │                  │        │   language-server/    │
    └───────────┘       └──────────────────┘        └───────────────────────┘
```

**Dependency chain**: Compiler → Language Services → `dist/` bundle → { CLI, Playground, VS Code Language Server → VS Code Extension }

**Parity expectation**: a single Pathogen program must produce visually equivalent output in all three surfaces. Drift between surfaces (feature works in CLI but not playground, completions work in VS Code but not playground, etc.) is the primary failure mode this document exists to prevent.

## Mandatory first step: user-facing developer documentation

**Every checklist in this document assumes `docs/<feature>.md` has already been written and registered in `scripts/build-docs.ts` `DOC_FILES` before any code is changed.** If the feature doesn't have a published docs page, stop and write one first. This is not optional and not a later step — it is prerequisite to any of the checklists below.

- "User-facing developer documentation" means the `.md` file in `docs/` that is compiled and published to the website at `/docs` (one static page; each heading is an anchor, `/docs#<page>-<heading-slug>`).
- `project-docs/<feature>/` demos, primers, and plans are **internal** — they are never a substitute. See `.claude/CLAUDE.md` → [`docs/` vs `project-docs/`](../../.claude/CLAUDE.md#docs-vs-project-docs).
- A new `.md` file has no effect until it appears in `scripts/build-docs.ts` `DOC_FILES`. Registration is part of the doc, not a separate step.
- Verify with `npm run build:docs`, then `npm run check-links` against a running dev server, and spot-check the rendered section at `http://localhost:3000/docs#<page>-<heading-slug>`. **If `npm run dev:stack` is already running, never run plain `npm run build:website` / `dev:website`** — it bakes the production API base into the served bundle; use `PATHOGEN_API_BASE=http://localhost:8787 npm run build:website`.

## Feature Type Checklists

### Adding a New Language-Services Feature

**This is the new case to handle in 2026-04-10 and beyond.** Any time you add a new get/format/prepare/analyze function to `src/language-services/`, use this checklist so it ships in both channels:

1. Implement the feature in `src/language-services/<feature>.ts`.
2. Export it from `src/language-services/index.ts`.
3. Add an entry to `LANGUAGE_FEATURES` in `src/language-services/feature-catalog.ts`:
   - Set `fn` to the exported function name.
   - Set `vscodeCapability` if it maps to an LSP provider, or `null` for push-only features (e.g. diagnostics).
   - Set `lspTriggerCharacters` if it has any (completion, signature help, on-type formatting).
   - Set `playgroundRequired: true` unless there is a concrete technical reason to skip it, in which case set `false` and provide a `playgroundSkipReason` longer than a few words.
   - If you're staging the work, set `playgroundDeferred: true` until the wiring PR lands.
4. Wire the feature into VS Code by adding an LSP handler in `packages/pathogen-language-server/src/server.ts`. Match the capability declaration in the `onInitialize` return to what the catalog says.
5. Wire the feature into the Playground by adding a `wireX(cm)` function inside `playground/utils/cm-language-services.ts` and returning its extensions from `buildLanguageExtensions`. Reference the shared function by name so the parity test can find it.
6. Add a test in `tests/language-services/<feature>.test.ts`.
7. `npm run test:run` — the cross-channel parity test in `tests/cross-channel-parity.test.ts` must pass. If it doesn't, follow the failure messages to fix the catalog or the wire-ups.
8. `npm run build` to rebuild dist/ (playground loads `dist/index.global.js` at runtime).

### Adding a New Keyword

The keyword lists below are hand-maintained and used to drift silently. `tests/keyword-registry.test.ts` now reads every `kw<"…">` term out of `pathogen.grammar` and fails if any list is missing one (each list has a small, commented exception set), and it also fails if the generated parser does not reserve the word — so an edited grammar that was not regenerated is caught too. Run it early.

1. `docs/syntax.md` — Document the keyword's usage and semantics (docs first)
2. `src/parser/pathogen.grammar` — Add the `kw<"…">` uses and rules
3. Regenerate the parser: `npx lezer-generator src/parser/pathogen.grammar --typeScript -o src/parser/pathogen.generated.ts` (no npm script; also rewrites `pathogen.generated.terms.ts`). Confirm the `specialized:` line still carries `keyof typeof spec_Identifier`. Read the generator's conflict report before writing any TypeScript.
4. `src/parser/path-args-tokenizer.ts` — Add to `KEYWORDS` if the keyword can start a statement. This is load-bearing: the path-args tokenizer keeps consuming identifiers across newlines, so `M x y` followed by an unknown keyword swallows it as an argument.
5. `src/parser/ast.ts` — Add the AST node type and register it in `Node`, `Statement`, and (if it can appear in text bodies) `TextBodyItem`
6. `src/parser/ast-builder.ts` — Handle the CST node in `buildStatement` (an unhandled node is silently dropped) and, for text bodies, in `buildTextBodyItem`
7. `src/evaluator/index.ts` — `evaluateStatementToAccum` plus the two text walkers (`evaluateTextBlockBody` for `&{ }`, `evaluateTextBody` for `text(){ }`)
8. `tests/parser.test.ts` + `tests/evaluator.test.ts` — Add tests
9. `src/parser/highlight.ts` — Add to `KEYWORD_NODE_NAMES` and the structural `t.controlKeyword` line (CodeMirror highlighting)
10. `src/highlight.ts` — Add to `NODE_CLASS` (docs/blog fences, export legend, PDF)
11. `src/language-services/completion-data-static.ts` — Add to `KEYWORD_COMPLETIONS` (hand-written; `completion-data.generated.ts` covers stdlib, constructors, enums and type members — never keywords)
12. `src/language-services/hover.ts` — Add to `KEYWORD_HOVER`
13. `src/language-services/rename.ts` `NON_RENAMEABLE` and `src/language-services/code-actions.ts` `RESERVED_IDENTIFIERS`
14. `src/language-services/diagnostics.ts` — Contextual `describeError` messages for the new node names
15. `src/language-services/formatter.ts` — A printer case is mandatory: `formatStatement`'s default branch prints nothing, which deletes the statement on format
16. `src/language-services/scope-analysis.ts` and `inlay-hints.ts` — Walk the new node's expressions and bodies (an unwalked body silently loses hints, references, and rename inside it)
17. `src/language-services/symbols.ts` — Only if the construct should appear in the outline (conditionals deliberately don't)
18. `src/evaluator/code-snippet.ts` `KEYWORDS` — Thumbnail/social-card highlighter
19. `packages/vscode-pathogen/syntaxes/pathogen.tmLanguage.json` — Add to the TextMate keyword pattern
20. `packages/vscode-pathogen/snippets/pathogen.code-snippets` and `playground/utils/codemirror-setup.ts` — Add snippets if templatable
21. `CHANGELOG.md` — Include a compatibility note: every `kw<>` keyword is a reserved word and can no longer be a variable name
22. `npm run build` to rebuild dist/
23. **Playground:** keyword completions flow automatically through the shared `getCompletions` call in `playground/utils/cm-language-services.ts`. No playground-side wiring required.

### Adding a New Stdlib Function

1. `docs/stdlib.md` — Document the function (docs first)
2. `src/stdlib/<module>.ts` (`math.ts`, `path.ts`, `geometry.ts`, `grid.ts`, `format.ts`) — Implement the function
3. `src/stdlib/index.ts` — Export it; add to `contextAwareFunctions` if context-aware
4. `tests/evaluator.test.ts` — Add tests
5. `src/pathogen-api.ts` — Declare the function with a JSDoc detail line (keep method-signature style; the file-level eslint-disable explains why), then `npm run generate:completions`. Completion, hover and signature help all flow from the generated `STDLIB_COMPLETIONS` / `SIGNATURE_DATA` — do not hand-edit `completion-data.generated.ts`
6. `npm run check:completions` — the generator's `crossCheck()` fails if the declaration and the runtime registry disagree (the pre-commit hook runs this too)
7. `tests/language-services/completion.test.ts` — Test the completion appears; assert `detail` / `insertText`, not just the label
8. `npm run build` to rebuild dist/
9. No VS Code extension source changes needed — stdlib completions flow through language-services via LSP (rebuild the `.vsix` with `npm run build:vscode` so its bundled server picks them up)
10. No playground changes needed — uses shared `cm-language-services.ts` wiring and the `sharedCompletionSource` bridge

### Adding a New Enum

1. `docs/` relevant section — Document the enum and its values
2. `src/evaluator/builtin-enums.ts` — Add to `BUILTIN_ENUMS` (the runtime definition, and the generator's source of truth for members)
3. `tests/evaluator.test.ts` — Add tests
4. `src/api-surface.ts` — Add an `ENUM_METADATA` entry (description + ranking). An enum without metadata logs a warning at import time
5. `npm run generate:completions` — `ENUM_COMPLETIONS` and `ENUM_MEMBER_MAP` are generated straight from the runtime, so members cannot drift; `EnumName.` member access already resolves through `ENUM_MEMBER_MAP` in `member-resolution.ts` with no per-enum code
6. `npm run build` to rebuild dist/

### Adding a New Type with Member Access

1. `docs/` — Document the type and its properties/methods
2. `src/evaluator/index.ts` — Implement member dispatch (property access + method calls)
3. `tests/evaluator.test.ts` — Add tests
4. `src/pathogen-api.ts` — Declare a `@type TypeName`-tagged interface with JSDoc per member; run `npm run generate:completions`. Member completions, chain returns, property types, array element types, and hover all flow from the generated data — do not hand-edit `completion-data.generated.ts` or `completion.ts`/`hover.ts`
5. `tests/language-services/completion.test.ts` + `hover.test.ts` — Test member completions AND member hover appear (assert `detail`/`insertText`, not just labels)
6. `npm run build` to rebuild dist/

**This includes builder/handle values that only exist inside a block.** If users
can call methods on it (`vo.stop(...)` inside `variableOffset() {|vo, pb| ...}`),
it is a type with member access and needs a `@type` interface — the variableOffset
builder shipped without one and had zero completions/hover until 2026-07-24.

### Adding a Method That Takes a Trailing Block (`{|a, b| ...}`)

1. Declare the method in its type's `@type` interface in `src/pathogen-api.ts` with **both** tags, in this order: `@blockparams HandleType, SpineType` **before** `@snippet` (the snippet capture runs to end-of-line and would swallow a trailing `@blockparams`; the generator warns).
2. Give each block-param handle type its own `@type` interface (see above) so `handle.` completes and hovers.
3. `npm run generate:completions` — `METHOD_BLOCK_PARAMS` + `TYPE_MEMBERS` entries flow to block-param inference in `type-inference-ast.ts` automatically.
4. Test: completion on `handle.` inside the block, hover on the params at declaration and use sites.

### Adding a New Constructor Type

Applies when adding a paint-server- or defs-like constructor that produces a named SVG element and is referenced via `url(#id)` in styles (`Marker()`, `Mask()`, `ClipPath()`, `Pattern()`, `LinearGradient()`, `RadialGradient()`, etc.).

**This is the checklist most at risk of silent drift between the three user-facing surfaces.** The `<defs>` element is built once (`src/render/build-defs.ts`), but the playground rebuilds a partial compile result by hand before calling it. Follow every step below — especially the five-file playground chain (steps 11–15) — or the feature will work in the CLI and VS Code but produce a blank/missing result in the playground.

**Shared engine (steps 1–9):**

1. **`docs/<feature>.md` (new file) + register in `scripts/build-docs.ts` `DOC_FILES`** — docs first. Include: constructor signature, `.append()` / `.stop()` / equivalent method signatures, default attribute values, mutable properties table (with enum names), usage in styles (`fill`, `stroke`, `marker-start`, etc.), `context-stroke` / `context-fill` if applicable, generated SVG output, errors table.
2. `src/evaluator/types.ts` — Add `<Feature>Value` interface with all attributes.
3. `src/evaluator/index.ts` — Implement constructor, methods, property assignment with enum validation. If it resolves to `url(#id)` in styles, register the style-property name(s) in `URL_REF_PROPERTIES`. Register the defs map on `evalState` and include it in the duplicate-ID check. When serializing to `CompileResult`, add the output to the `result.<feature>s` array (e.g. `result.markers`).
4. `src/evaluator/constructor-registry.ts` — Add the name to the right list (`DEFS_CONSTRUCTORS`, `FILTER_CONSTRUCTORS`, `VALUE_CONSTRUCTORS`, …) and a canonical program to `tests/constructor-registry.test.ts`, which compiles one call per registered name so the list cannot drift from the evaluator. New enums: `builtin-enums.ts` + `ENUM_METADATA` in `src/api-surface.ts` (that file holds enum metadata only).
5. `src/pathogen-api.ts` — Declare the constructor (with `@snippet` if it takes a binding block) returning a `@type`-tagged interface that lists its members, then `npm run generate:completions`. Constructor completions, member completions, chain returns, hover and `CONSTRUCTOR_RETURN_TYPES` are all generated; `--strict` fails if the declaration and `constructor-registry.ts` disagree.
6. `src/language-services/scope-analysis.ts`, `inlay-hints.ts` — Recognize the constructor in scopes / parameter hints as needed.
7. `tests/<feature>.test.ts` — Behavior, property mutation, error messages.
8. Add the new output type to the library's `CompileResult` / `LayerOutput` types so downstream consumers (CLI, playground, VS Code) see it.
9. `npm run build && npm run build:docs` — verify `dist/` rebuilds and the docs page compiles.

**Shared render tree — reaches the CLI and VS Code directly (step 10):**

10. `src/render/build-defs.ts` — Add a `build<Feature>` function and a loop over `result.<feature>s` in `buildDefs`. Follow the existing pattern used for `result.masks`, `result.clipPaths`, `result.gradients`, `result.patterns`; elide attributes that match SVG defaults (see the `result.markers` precedent); honor `emitPlaygroundDataAttrs` by emitting a `data-<feature>-def` attribute. Add a fixture under `project-docs/render-pipeline-unification/snapshots/` so `tests/render-channel-parity.test.ts` and `tests/render-snapshots.test.ts` cover it. `src/svg-generator.ts` needs no change.

**Surface 2 — Playground render path (steps 11–15, the five-file chain):**

11. `playground/types/compiler.d.ts` — Add `<Feature>Output` type; extend `CompileResult` with `<feature>s: <Feature>Output[]`.
12. `playground/types/store.d.ts` — Add `<feature>s` field to the store state type.
13. `playground/state/store.ts` — Add `<feature>s: []` initializer to the default state.
14. `playground/components/workspace-view.ts` — Forward `result.<feature>s || []` from the compile result into the preview pane payload (follow the existing `result.masks || []` precedent).
15. `playground/components/svg-preview-pane.ts` — Add a `<Feature>Def` interface mirroring the compile-result shape; extend `DefsData` with the new field; forward it into the partial result passed to `window.PathogenLang.buildDefs({...})` (the shared builder creates the elements — do not hand-build them); add `[data-<feature>-def]` to the cleanup selector that clears the previous compilation's defs.

**Surface 3 — VS Code render path (step 16):**

16. No `preview.ts` change is normally needed: the webview calls `PathogenLang.compile()` and `PathogenLang.buildSvgTree(result, …)` and mounts `<defs>` generically, so step 10 carries the construct through. What IS needed is a rebuilt bundle — `npm run build`, then `npm run build:vscode` (copies the browser bundle into `packages/vscode-pathogen/compiler/`) — and a check that the construct renders in the preview. Only constructs that need webview-side behavior (a panel, a toggle, a GPU path) touch `preview.ts`.

**Internal (optional, not a substitute for the above):**

17. `project-docs/<feature>/` — demo `.pathogen` files. **Not a substitute for any of the above.** These are internal artifacts only.

**Before declaring done**, follow the Post-Change Verification Checklist below — specifically the three-surface parity diff.

### Adding New Syntax (Block Type / Construct)

This is the heaviest lift — combines the keyword checklist plus:

- `src/language-services/diagnostics.ts` — If new error patterns are possible
- `src/language-services/symbols.ts` — If it should appear in document outline
- `src/language-services/semantic-tokens.ts` — If new token types are needed
- `src/language-services/formatter.ts` — Formatting rules for new block structure
- `src/language-services/code-actions.ts` — If new quick fixes apply
- `packages/vscode-pathogen/syntaxes/pathogen.tmLanguage.json` — New TextMate pattern or updated regex
- `packages/vscode-pathogen/test-fixtures/all-syntax.pathogen` — Add the construct. `tests/all-syntax-fixture.test.ts` enforces this: the fixture's parse tree must contain every node type and keyword the grammar can produce, and the file must compile with zero diagnostics, so a new grammar node fails the suite until the fixture shows it

#### A new EXPRESSION node (no keyword)

Written after range values `(a..b)` landed (2026-09-18; record in [`../range-values/`](../range-values/README.md)). An expression node touches fewer files than a statement, but every one of them fails **silently** when missed — TypeScript's exhaustiveness does not catch them, because each walker ends in a `default`.

1. `docs/` first, then spike the grammar on a scratch copy before touching the real one: run `lezer-generator` and read its conflict report. A rule that shares a prefix with an existing one and diverges on the next token (`"(" expression` → `)` vs `..`) needs no markers
2. `src/parser/ast.ts` — The interface **and** the `Expression` union. Give it a `loc`: method-call errors on a receiver report the receiver's line
3. `src/parser/ast-builder.ts` — `buildExpression` dispatch **and** `isExpressionNode` (postfix `.method()` / `[i]` after the node is dropped without it). Builders must not throw on a half-built node: `parseLezer` (the lenient path the language services use mid-typing) builds from error trees; only `parse()` rejects them first
4. **The path-argument shadow grammar** — `src/parser/path-args-tokenizer.ts` and `parsePathArgs` in `ast-builder.ts` re-scan path arguments with their own rules and know nothing about the Lezer grammar. Only `calc(…)` interiors and array literals reach the real parser; call arguments and `[index]` suffixes do not. Decide what the new syntax means there and guard it (`assertNoRangeInPathArgs` is the precedent) — the alternative is wrong path data with no error
5. `src/evaluator/index.ts` — `evaluateExpression`, and `expressionToSource` (used by `log()` labels)
6. `src/language-services/formatter.ts` `formatExpression` — **mandatory, in the same change as the grammar**: the default branch returns `''`, which deletes the expression from the user's source on format
7. `src/language-services/scope-analysis.ts` `walkExpr` and `inlay-hints.ts` `walkExpr` — walk every child expression, or identifiers inside lose references, rename, go-to-definition and parameter hints
8. `src/language-services/type-inference-ast.ts` (`inferExprType`, `inferExprElementType`) **and** the separate private `inferExprType` in `inlay-hints.ts` (display-cased names: `'Array'`, not `'array'`)
9. `src/language-services/member-resolution.ts` — if the node can be a member-access receiver. It is regex-based over the current line; a receiver that ends in `)` or `]` needs a branch in `resolveBracketedReceiver`
10. `src/language-services/diagnostics.ts` + `src/parser/index.ts` — if there is a predictable misspelling, give it a targeted message from ONE shared detector (`describeBareRange` is the precedent) so the compile error and the editor squiggle say the same thing. Write it against real error-tree shapes (dump them; recovery is not guessable)
11. **Playground completion popup** — the editor registers two completion sources and CodeMirror **merges** them. `svgPathCompletions` in `playground/utils/codemirror-setup.ts` must return `null` wherever the shared engine owns the answer, or its keyword list buries the real options. Verify in the live editor, asserting on a member that exists only on the expected type

### Adding a New Style Property

1. `src/evaluator/index.ts` — Handle the property when building SVG/text layer attributes
2. `src/language-services/completion-data-static.ts` — Add to `STYLE_PROPERTY_ENTRIES` (feeds `STYLE_PROPERTY_COMPLETIONS`), and to `STYLE_PROPERTY_VALUES` if the property takes enumerated keywords
3. `tests/evaluator.test.ts` — Add tests
4. `npm run build` to rebuild dist/

## Build Order

When making cross-system changes, build in this order:

```
0. docs/               ← FIRST: write the page, then npm run build:docs
1. src/parser/         ← Regenerate Lezer parser if grammar changed (no npm script:
                         npx lezer-generator src/parser/pathogen.grammar
                         --typeScript -o src/parser/pathogen.generated.ts)
2. src/evaluator/      ← Runtime implementation
   src/stdlib/
3. src/pathogen-api.ts ← Declarations, then npm run generate:completions
   src/language-       ← Intelligence updates (inference, walkers, formatter)
   services/           ← Register new features in feature-catalog.ts
4. npm run build       ← Produces dist/ consumed by everything downstream
5. packages/pathogen-  ← Wire LSP handlers for new language-services functions
   language-server/       in server.ts; match capability declarations
6. packages/vscode-    ← npm run build:vscode — ALWAYS after a src/ change: the
   pathogen/             .vsix ships its own copy of the compiler bundle and
                         the language server, so it goes stale otherwise
7. playground/         ← Loads the browser bundle at runtime, but the SERVED copy
                         lives in the generated site: when dev:stack is running,
                         rebuild with PATHOGEN_API_BASE=http://localhost:8787
                         npm run build:website (a plain build:website bakes in
                         the production API). For new language-services
                         features, wire the adapter in
                         utils/cm-language-services.ts.
```

## Known Gaps and Future Automation

**Done — completion data generation.** `scripts/generate-completions.ts` (pure logic in `scripts/lib/completion-extract.ts`) derives stdlib, constructor, enum, type-member, signature and block-param data from `src/pathogen-api.ts` plus the runtime `BUILTIN_ENUMS`. `npm run check:completions` is the drift gate (strict cross-check against the stdlib registry, `contextAwareFunctions` and `constructor-registry.ts`, then a git-diff of the generated file); the pre-commit hook runs it. The checklists above already describe this pipeline. `src/language-services/CLAUDE.md` is the authoritative reference for the JSDoc conventions (`@type`, `@snippet`, `@blockparams`).

**Done — render-channel parity test** (next paragraph).

Still manual, and still able to drift:

**TextMate auto-generation**: The Lezer migration decision doc (sub-phase G) proposes generating the TextMate grammar from the Lezer grammar. This would eliminate the dual-grammar maintenance burden for keywords and syntax constructs. Until then `tests/keyword-registry.test.ts` catches a missing *keyword*; nothing catches a missing operator or construct.

**Snippet sync**: VS Code snippets (`packages/vscode-pathogen/snippets/pathogen.code-snippets`) duplicate the snippet bodies from `KEYWORD_COMPLETIONS` in `completion-data-static.ts`. These could be generated from the same source.

**The path-argument shadow grammar**: `path-args-tokenizer.ts` + `parsePathArgs` mirror the expression grammar by hand. `tests/keyword-registry.test.ts` guards its keyword list only; new operators and expression forms are not guarded (see "A new EXPRESSION node").

**The legacy playground completion source**: `svgPathCompletions` duplicates part of what `getCompletions` does and has to be taught to stand aside case by case. Retiring it would remove the class of bug.

Update these checklists once any of these are automated.

**Render-channel parity test**: [`tests/render-channel-parity.test.ts`](../../tests/render-channel-parity.test.ts) (added 2026-04-21 by the render-pipeline unification — see [`../render-pipeline-unification/PLAN.md`](../render-pipeline-unification/PLAN.md)) runs every fixture through both render adapters (`toSvgString` and `mountInto`) and structurally diffs the output. If a future change to one adapter diverges from the other — e.g. adds a new defs type to `build-defs.ts` without updating the DOM adapter's unwrapping logic — this test fails. Fixtures live in [`../render-pipeline-unification/snapshots/`](../render-pipeline-unification/snapshots/). The same fixtures pin CLI string output in [`tests/render-snapshots.test.ts`](../../tests/render-snapshots.test.ts).

## Post-Change Verification Checklist

After making cross-system changes:

- [ ] `npm run test:run` passes (compiler + language-services tests)
- [ ] **`tests/cross-channel-parity.test.ts` passes** — the feature catalog, Playground wiring, and VS Code server.ts are all in agreement
- [ ] `npm run build` succeeds
- [ ] New feature appears in completions (verify in playground or VS Code)

### Three-surface parity (manual, required)

Compile the same minimal Pathogen program exercising the new feature through **all three surfaces** and verify visually equivalent output. Silent drift here is the primary failure mode this project has historically suffered from (Marker shipped CLI-only, discovered weeks later).

- [ ] **CLI**: `npx tsx src/cli.ts <repro>.pathogen --json` first (read `warnings` and each layer's `d`), then `--output-svg-file=<f>.svg --png=<f>.png` and look at the PNG. Keep the repro and its renders in `project-docs/<feature>/`, not a temp directory.
- [ ] **Playground**: with the dev server on `http://localhost:3000` (rebuilt so it serves the new bundle — see Build Order step 7), open `/workspace/scratch?state=<base64 of {"code": …}>` or paste the same program into a workspace, and verify the feature renders in the preview pane. If the preview shows the path but no associated defs element (marker / mask / gradient / pattern), it's a playground wire-up gap — check the five-file chain in `playground/` (see `.claude/CLAUDE.md` → Three Surfaces). For editor behavior (completions, hover, diagnostics) drive the LIVE editor, not just `window.PathogenLang.*` — the popup merges two completion sources, so a correct service answer can still be buried. Scriptable precedent: `project-docs/range-values/verify/verify-playground.mjs`.
- [ ] **VS Code**: `npm run build:vscode`, then either install the `.vsix` (`npm run build:vscode:install`), open the file and run the preview command, or drive the exact bundled artifacts headlessly — the bundled language server over stdio with real LSP messages and the bundled preview compiler in a browser page (precedent: `project-docs/range-values/verify/verify-vscode.mjs`). Say in the commit message which of the two you did; the headless run does not prove the interactive feel.
- [ ] **Diff**: is the path data byte-identical across all three surfaces? If not, which surface drifts, and what file in that surface's render path needs updating?
- [ ] Hover info shows for new constructs
- [ ] TextMate grammar highlights new syntax correctly (check `test-fixtures/all-syntax.pathogen` in VS Code)
- [ ] **Playground verification**: the new feature works in the dev playground on http://localhost:3000 — not just in VS Code
- [ ] **User-facing documentation shipped**: `docs/<feature>.md` exists, is registered in `scripts/build-docs.ts` `DOC_FILES`, compiles cleanly under `npm run build:docs`, renders at `http://localhost:3000/docs#<page>-<heading-slug>`, and `npm run check-links` reports no broken links. Every code fence is mirrored by a test (there is no doc-fence compiler — mark them "(docs example)"). `project-docs/<feature>/` demos do not satisfy this check.
- [ ] **Three-surface parity**: see the Three-surface parity sub-checklist above. A feature passing tests and compiling cleanly in the CLI is **not shipped** until the same program renders equivalently in the playground preview and the VS Code preview.
- [ ] CHANGELOG.md updated
