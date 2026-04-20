# Cross-System Feature Lifecycle

**Date**: 2026-04-07 (updated 2026-04-10: added Playground wire-up rows and the language-services feature lifecycle; updated 2026-04-20: added Three-Surface Parity principle and the constructor-type playground wire-up steps after the Marker playground-render gap was discovered).

When a language feature is added to Pathogen (keyword, stdlib function, enum, type, syntax construct), multiple systems need coordinating updates. This document is the comprehensive reference for that process.

**Quick-reference versions**: See the cross-cutting section in `.claude/CLAUDE.md` and the per-system CLAUDE.md files for concise checklists.

## Three-Surface Parity Principle

Pathogen exposes **three user-facing surfaces** where every feature must work identically:

1. **CLI** — `src/cli.ts` invoking `src/svg-generator.ts` to produce complete SVG strings
2. **Playground** — the browser SPA at `/pathogen`, rendering live in `playground/components/svg-preview-pane.ts`
3. **VS Code** — the extension preview command in `packages/vscode-pathogen/src/preview.ts` (and LSP features via `packages/pathogen-language-server`)

**Shipping a feature means reaching all three surfaces.** "It works in the CLI" is not done. A feature that lands in `src/` but isn't wired through to the playground preview pane or the VS Code preview is a **silent regression** — the user runs the same program twice, gets working output from the CLI and broken output from the browser, and concludes the tool is broken. This is what happened with the Marker feature (commit `87298e0` shipped CLI and tests but not the 5-file playground wiring chain; discovered 2026-04-20).

Drift between surfaces is the primary failure mode. The parity test at [`tests/cross-channel-parity.test.ts`](../../tests/cross-channel-parity.test.ts) covers the language-services channel (completion, hover, etc.); **there is not yet a parity test for the render channel** (defs-producing constructs like Mask/Marker/Gradient). Until that exists, every checklist in this document calls out the three-surface wiring steps explicitly, and the Post-Change Verification Checklist requires a manual three-surface diff.

**Render-channel wiring surface:**
- **CLI**: `src/svg-generator.ts` — emits `<defs>` children to the output SVG string
- **Playground**: five-file chain — `playground/types/compiler.d.ts` (add `<Feature>Output` type) → `playground/types/store.d.ts` (add field) → `playground/state/store.ts` (initializer) → `playground/components/workspace-view.ts` (forward `result.<feature>s`) → `playground/components/svg-preview-pane.ts` (add `<Feature>Def` interface and inject into `<defs>`)
- **VS Code**: `packages/vscode-pathogen/src/preview.ts` (currently a stub — tracked in `packages/vscode-pathogen/CLAUDE.md` Readiness Status)

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
             │  stdlib/   │                   │ (16 files)     │
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

- "User-facing developer documentation" means the `.md` file in `docs/` that is compiled and published to the website at `/pathogen/docs`.
- `project-docs/<feature>/` demos, primers, and plans are **internal** — they are never a substitute. See `.claude/CLAUDE.md` → [`docs/` vs `project-docs/`](../../.claude/CLAUDE.md#docs-vs-project-docs).
- A new `.md` file has no effect until it appears in `scripts/build-docs.ts` `DOC_FILES`. Registration is part of the doc, not a separate step.
- Verify with `npm run build:docs` and spot-check the rendered page at `http://localhost:3000/pathogen/docs/<feature>` via `npm run dev:website`.

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

1. `docs/syntax.md` — Document the keyword's usage and semantics (docs first)
2. `src/parser/pathogen.grammar` — Add keyword rule to Lezer grammar
3. Regenerate parser: the Lezer generator converts grammar → `pathogen.generated.ts`
4. `src/parser/ast.ts` — Add AST node type if new statement kind
5. `src/parser/ast-builder.ts` — Handle new CST node in converter
6. `src/evaluator/index.ts` — Implement evaluation logic
7. `tests/parser.test.ts` + `tests/evaluator.test.ts` — Add tests
8. `src/language-services/completion-data.ts` — Add to `KEYWORD_COMPLETIONS`
9. `src/language-services/hover.ts` — Add to `KEYWORD_HOVER` map
10. `src/language-services/formatter.ts` — Add formatting rules if it introduces blocks
11. `src/language-services/scope-analysis.ts` — If it introduces scope (like `for`, `fn`)
12. `src/parser/highlight.ts` — Add to Lezer highlight tags (CodeMirror highlighting)
13. `packages/vscode-pathogen/syntaxes/pathogen.tmLanguage.json` — Add to TextMate keyword pattern
14. `packages/vscode-pathogen/snippets/pathogen.code-snippets` — Add snippet if templatable
15. `npm run build` to rebuild dist/
16. **Playground:** keyword completions flow automatically through the shared `getCompletions` call in `playground/utils/cm-language-services.ts`. No playground-side wiring required.

### Adding a New Stdlib Function

1. `docs/stdlib.md` — Document the function (docs first)
2. `src/stdlib/math.ts` or `src/stdlib/path.ts` — Implement the function
3. `src/stdlib/index.ts` — Export it; add to `contextAwareFunctions` if context-aware
4. `tests/evaluator.test.ts` — Add tests
5. `src/language-services/completion-data.ts` — Add to `STDLIB_COMPLETIONS`
6. `src/language-services/hover.ts` — Hover uses `STDLIB_COMPLETIONS` detail strings; verify it picks up the new entry
7. `src/language-services/signature-help.ts` — Verify signature extraction works from the new detail string
8. `tests/language-services/completion.test.ts` — Test completion appears
9. `npm run build` to rebuild dist/
10. No VS Code extension changes needed — stdlib completions flow through language-services via LSP
11. No playground changes needed — uses shared `cm-language-services.ts` wiring and the `sharedCompletionSource` bridge

### Adding a New Enum

1. `docs/` relevant section — Document the enum and its values
2. `src/evaluator/index.ts` — Add to `BUILTIN_ENUMS` (~line 283)
3. `tests/evaluator.test.ts` — Add tests
4. `src/language-services/completion-data.ts` — Add enum name to top-level completions, add member completions
5. `src/language-services/completion.ts` — Extend `getMembersForObject()` to return members for `EnumName.Member` access
6. `npm run build` to rebuild dist/

> **Note**: As of 2026-04-06, no enum completion infrastructure exists. All 13 enums are missing from completions. See `completion-coverage-audit.md` for details and `completion-engine-generation-plan.md` for the proposed fix.

### Adding a New Type with Member Access

1. `docs/` — Document the type and its properties/methods
2. `src/evaluator/index.ts` — Implement member dispatch (property access + method calls)
3. `tests/evaluator.test.ts` — Add tests
4. `src/language-services/completion-data.ts` — Add new `*_MEMBERS: MemberCompletionSet` export
5. `src/language-services/completion.ts` — Add to `getMembersForObject()` and extend `inferType()` with constructor pattern
6. `src/language-services/hover.ts` — Add member hover info if appropriate
7. `tests/language-services/completion.test.ts` — Test member completions appear
8. `npm run build` to rebuild dist/

### Adding a New Constructor Type

Applies when adding a paint-server- or defs-like constructor that produces a named SVG element and is referenced via `url(#id)` in styles (`Marker()`, `Mask()`, `ClipPath()`, `Pattern()`, `LinearGradient()`, `RadialGradient()`, etc.).

**This is the checklist most at risk of silent drift between the three user-facing surfaces.** Each of the CLI, playground, and VS Code extension has its own render path; compiling correctly in the shared engine is only step 1 of 3. Follow every step below — especially the five-file playground chain (steps 11–15) and the VS Code preview step (step 16) — or the feature will work in the CLI but produce a blank/missing result in the other two surfaces.

**Shared engine (steps 1–10):**

1. **`docs/<feature>.md` (new file) + register in `scripts/build-docs.ts` `DOC_FILES`** — docs first. Include: constructor signature, `.append()` / `.stop()` / equivalent method signatures, default attribute values, mutable properties table (with enum names), usage in styles (`fill`, `stroke`, `marker-start`, etc.), `context-stroke` / `context-fill` if applicable, generated SVG output, errors table.
2. `src/evaluator/types.ts` — Add `<Feature>Value` interface with all attributes.
3. `src/evaluator/index.ts` — Implement constructor, methods, property assignment with enum validation. If it resolves to `url(#id)` in styles, register the style-property name(s) in `URL_REF_PROPERTIES`. Register the defs map on `evalState` and include it in the duplicate-ID check. When serializing to `CompileResult`, add the output to the `result.<feature>s` array (e.g. `result.markers`).
4. `src/evaluator/annotated.ts` — Parallel annotated output support.
5. `src/api-surface.ts` — Register constructor + any new enums in the type registry.
6. `src/language-services/completion-data-static.ts` — Add constructor and member completions.
7. `src/language-services/scope-analysis.ts`, `inlay-hints.ts` — Recognize the constructor in scopes / parameter hints as needed.
8. `tests/<feature>.test.ts` — Behavior, property mutation, error messages.
9. Add the new output type to the library's `CompileResult` / `LayerOutput` types so downstream consumers (CLI, playground, VS Code) see it.
10. `npm run build && npm run build:docs` — verify `dist/` rebuilds and the docs page compiles.

**Surface 1 — CLI render path (step 11):**

11. `src/svg-generator.ts` — Emit the SVG `<defs>` element with correct attributes and child paths. Follow the existing pattern used for `result.masks`, `result.clipPaths`, `result.gradients`, `result.patterns`. Elide attributes that match SVG defaults (matches the evaluator's elision — see `result.markers` precedent).

**Surface 2 — Playground render path (steps 12–16, the five-file chain):**

12. `playground/types/compiler.d.ts` — Add `<Feature>Output` type; extend `CompileResult` with `<feature>s: <Feature>Output[]`.
13. `playground/types/store.d.ts` — Add `<feature>s` field to the store state type.
14. `playground/state/store.ts` — Add `<feature>s: []` initializer to the default state.
15. `playground/components/workspace-view.ts` — Forward `result.<feature>s || []` from the compile result into the preview pane payload (follow the existing `result.masks || []` precedent).
16. `playground/components/svg-preview-pane.ts` — Add `<Feature>Def` interface mirroring the compile-result shape; extend `DefsData` with the new field; add a loop in the defs-injection section that creates a `<feature>` element per entry, populates its attributes, appends child `<path>` (or equivalent) elements, and appends the whole thing to `defsEl`. Include the new attribute in the cleanup selector on the line that clears previous-compilation defs.

**Surface 3 — VS Code render path (step 17):**

17. `packages/vscode-pathogen/src/preview.ts` — When the preview is functional (currently stub; see `packages/vscode-pathogen/CLAUDE.md` Readiness Status), ensure it consumes `result.<feature>s` and renders via `src/svg-generator.ts`. If the preview is still a stub, file the TODO in the extension's Readiness Status but do **not** declare the feature shipped until this surface is wired.

**Internal (optional, not a substitute for the above):**

18. `project-docs/<feature>/` — demo `.pathogen` files. **Not a substitute for any of the above.** These are internal artifacts only.

**Before declaring done**, follow the Post-Change Verification Checklist below — specifically the three-surface parity diff.

### Adding New Syntax (Block Type / Construct)

This is the heaviest lift — combines the keyword checklist plus:

- `src/language-services/diagnostics.ts` — If new error patterns are possible
- `src/language-services/symbols.ts` — If it should appear in document outline
- `src/language-services/semantic-tokens.ts` — If new token types are needed
- `src/language-services/formatter.ts` — Formatting rules for new block structure
- `src/language-services/code-actions.ts` — If new quick fixes apply
- `packages/vscode-pathogen/syntaxes/pathogen.tmLanguage.json` — New TextMate pattern or updated regex
- `packages/vscode-pathogen/test-fixtures/all-syntax.pathogen` — Ensure syntax coverage

### Adding a New Style Property

1. `src/evaluator/index.ts` — Handle the property when building SVG/text layer attributes
2. `src/language-services/completion-data.ts` — Add to `STYLE_PROPERTY_COMPLETIONS`
3. `tests/evaluator.test.ts` — Add tests
4. `npm run build` to rebuild dist/

## Build Order

When making cross-system changes, build in this order:

```
1. src/parser/         ← Regenerate Lezer parser if grammar changed
2. src/evaluator/      ← Runtime implementation
   src/stdlib/
3. src/language-       ← Intelligence updates (completions, hover, etc.)
   services/           ← Register new features in feature-catalog.ts
4. npm run build       ← Produces dist/ consumed by everything downstream
5. packages/pathogen-  ← Wire LSP handlers for new language-services functions
   language-server/       in server.ts; match capability declarations
6. packages/vscode-    ← Rebuild if TextMate/snippets/extension code changed
   pathogen/
7. playground/         ← No build step (loads dist/index.global.js at runtime).
                         For new language-services features, wire the
                         adapter in utils/cm-language-services.ts.
8. docs/               ← npm run build:docs
```

## Known Gaps and Future Automation

Several steps in these checklists will become unnecessary once automation is in place:

**Completion data generation** (`completion-engine-generation-plan.md`): A proposed `scripts/generate-completions.ts` will derive completion data from annotated stdlib source + an `api-surface.ts` registry. Once implemented:
- "Add to `STDLIB_COMPLETIONS`" becomes "Add `@completion` JSDoc to the function"
- "Add enum members to completion-data" becomes "Add to `api-surface.ts`"
- A CI gate catches drift between evaluator and registry

**TextMate auto-generation**: The Lezer migration decision doc (sub-phase G) proposes generating the TextMate grammar from the Lezer grammar. This would eliminate the dual-grammar maintenance burden for keywords and syntax constructs.

**Snippet sync**: VS Code snippets currently duplicate the snippet bodies from `completion-data.ts` `KEYWORD_COMPLETIONS` entries. These could be generated from the same source.

Update these checklists once any of these automations are implemented.

**Snippet sync**: VS Code snippets currently duplicate the snippet bodies from `completion-data.ts` `KEYWORD_COMPLETIONS` entries. These could be generated from the same source.

**Render-channel parity test**: there is currently no automated test that diffs CLI-emitted SVG against the playground's rendered DOM. Adding one would catch silent surface drift (e.g. the Marker feature shipping in CLI but not playground). Until it exists, the three-surface verification below is a manual gate.

## Post-Change Verification Checklist

After making cross-system changes:

- [ ] `npm run test:run` passes (compiler + language-services tests)
- [ ] **`tests/cross-channel-parity.test.ts` passes** — the feature catalog, Playground wiring, and VS Code server.ts are all in agreement
- [ ] `npm run build` succeeds
- [ ] New feature appears in completions (verify in playground or VS Code)

### Three-surface parity (manual, required)

Compile the same minimal Pathogen program exercising the new feature through **all three surfaces** and verify visually equivalent output. Silent drift here is the primary failure mode this project has historically suffered from (Marker shipped CLI-only, discovered weeks later).

- [ ] **CLI**: `npx tsx src/cli.ts <repro>.pathogen --output-svg-file=/tmp/a.svg` — open in a browser; verify feature renders.
- [ ] **Playground**: `npm run dev:website` → open `http://localhost:3000/pathogen`, paste the same program, verify feature renders in the preview pane. If the preview shows the path but no associated defs element (marker / mask / gradient / pattern), it's a playground wire-up gap — check the five-file chain in `playground/` (see `.claude/CLAUDE.md` → Three Surfaces).
- [ ] **VS Code**: install the latest `.vsix` (or wait for the preview implementation if it's still stub), open the file, run the preview command, verify feature renders. If the preview command is still a stub, explicitly flag this in the commit message as "VS Code preview pending — tracked in packages/vscode-pathogen/CLAUDE.md Readiness Status."
- [ ] **Diff**: is the output visually equivalent across all three surfaces? If not, which surface drifts, and what file in that surface's render path needs updating?
- [ ] Hover info shows for new constructs
- [ ] TextMate grammar highlights new syntax correctly (check `test-fixtures/all-syntax.pathogen` in VS Code)
- [ ] **Playground verification**: the new feature works in `npm run dev:website` on http://localhost:3000/pathogen — not just in VS Code
- [ ] **User-facing documentation shipped**: `docs/<feature>.md` exists, is registered in `scripts/build-docs.ts` `DOC_FILES`, compiles cleanly under `npm run build:docs`, and renders at `http://localhost:3000/pathogen/docs/<feature>` during `npm run dev:website`. `project-docs/<feature>/` demos do not satisfy this check.
- [ ] **Three-surface parity**: see the Three-surface parity sub-checklist above. A feature passing tests and compiling cleanly in the CLI is **not shipped** until the same program renders equivalently in the playground preview and the VS Code preview.
- [ ] CHANGELOG.md updated
