# Cross-System Feature Lifecycle

**Date**: 2026-04-07 (updated 2026-04-10: added Playground wire-up rows and the language-services feature lifecycle).

When a language feature is added to Pathogen (keyword, stdlib function, enum, type, syntax construct), multiple systems need coordinating updates. This document is the comprehensive reference for that process.

**Quick-reference versions**: See the cross-cutting section in `.claude/CLAUDE.md` and the per-system CLAUDE.md files for concise checklists.

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
                │   docs/     │  User-facing documentation
                └──────┬──────┘
                       │
    ┌──────────────────┼──────────────────┐
    │                  │                  │
┌───┴────┐    ┌────────┴────────┐   ┌────┴───────────────────┐
│Compiler│    │Language Services│   │VS Code Extension       │
│src/    │───▶│src/language-    │◀──│packages/vscode-pathogen│
│parser/ │    │services/        │   │packages/pathogen-      │
│evaluat.│    │(16 files)       │   │  language-server/      │
│stdlib/ │    └────────┬────────┘   └────────────────────────┘
└────────┘             │
                       │
              ┌────────┴────────┐
              │   Playground    │
              │  playground/    │
              │ (via dist/      │
              │  index.global.js│
              └─────────────────┘
```

**Dependency chain**: Compiler → Language Services → dist/ bundle → { Playground, Language Server → VS Code Extension }

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

## Post-Change Verification Checklist

After making cross-system changes:

- [ ] `npm run test:run` passes (compiler + language-services tests)
- [ ] **`tests/cross-channel-parity.test.ts` passes** — the feature catalog, Playground wiring, and VS Code server.ts are all in agreement
- [ ] `npm run build` succeeds
- [ ] New feature appears in completions (verify in playground or VS Code)
- [ ] Hover info shows for new constructs
- [ ] TextMate grammar highlights new syntax correctly (check `test-fixtures/all-syntax.pathogen` in VS Code)
- [ ] **Playground verification**: the new feature works in `npm run dev:website` on http://localhost:3000/pathogen — not just in VS Code
- [ ] Documentation updated and passes `npm run build:docs`
- [ ] CHANGELOG.md updated
