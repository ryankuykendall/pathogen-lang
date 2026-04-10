# Developer Experience: Deduplication Audit Proposal

## Problem

During the Phase 7 semantic highlighting work (2026-04-10), we discovered hardcoded lists of constructor types, enum names, namespace names, and SVG path commands in `semantic-tokens.ts` that duplicated information already available in the generated completion data and hover provider. These lists would have silently drifted as the language evolved — new enums, constructors, or path features would appear in the completion engine but not in semantic highlighting.

This was caught by code review, but the concern is that similar duplication exists elsewhere in the codebase. Every time a static list of language features is hardcoded rather than derived from a single source of truth, it creates a maintenance burden and a risk of silent inconsistency.

## Scope

An audit should cover every file in the language-services layer and related systems that references language constructs by name. Specifically:

### Known patterns to look for

1. **Hardcoded keyword lists** — Sets or arrays of Pathogen keywords (`let`, `for`, `if`, `fn`, `return`, `define`, `enum`, etc.) that should derive from the grammar or a shared constant.

2. **Hardcoded type/constructor names** — Lists like `['PathLayer', 'TextLayer', 'GroupLayer']` or `['Point', 'Color', 'CSSVar']` that should derive from `TYPE_MEMBERS` keys or `STDLIB_COMPLETIONS`.

3. **Hardcoded enum names** — Lists that should derive from `ENUM_MEMBER_MAP` keys.

4. **Hardcoded SVG path commands** — The set `M L H V C S Q T A Z` and their lowercase variants. Should derive from `PATH_COMMAND_HOVER` keys (the hover provider is authoritative).

5. **Hardcoded stdlib function names** — Should derive from the `stdlib` export or `STDLIB_COMPLETIONS`.

6. **Hardcoded style property names** — CSS property lists that should derive from `STYLE_PROPERTY_COMPLETIONS`.

7. **Duplicated type inference patterns** — The `inferType()` function in `completion.ts` uses regex patterns that encode knowledge about constructor names. If a new constructor is added, this function needs manual updating. Consider whether the generation pipeline could produce these patterns.

### Files to audit

| File | Risk area |
|------|-----------|
| `src/language-services/semantic-tokens.ts` | Partially fixed — verify no remaining hardcoded lists |
| `src/language-services/completion.ts` | `inferType()` regex patterns, `getMethodReturnType()` map |
| `src/language-services/hover.ts` | `KEYWORD_HOVER` map, `PATH_COMMAND_HOVER` (authoritative but manually maintained) |
| `src/language-services/diagnostics.ts` | Keyword/construct references in `describeError()` |
| `src/language-services/scope-analysis.ts` | Built-in name detection |
| `src/language-services/code-actions.ts` | `ALL_KNOWN_NAMES` list for typo suggestions |
| `src/language-services/signature-help.ts` | Function signature data |
| `src/language-services/inlay-hints.ts` | Parameter name mappings |
| `src/evaluator/index.ts` | Method dispatch tables (e.g., the `case 'lighten':` chains) |
| `packages/vscode-pathogen/syntaxes/pathogen.tmLanguage.json` | Keyword and constructor patterns |
| `packages/vscode-pathogen/snippets/pathogen.code-snippets` | Snippet bodies encoding language patterns |
| `playground/utils/codemirror-setup.ts` | Completion and highlighting data |

### What "single source of truth" means here

The ideal state is:

- **Grammar** (`pathogen.grammar`) → defines all syntax constructs
- **API declarations** (`pathogen-api.ts`) → defines all types, methods, properties
- **Generation script** (`scripts/generate-completions.ts`) → produces `completion-data.generated.ts`
- **Everything else** derives from the above three

Any file that contains knowledge about the language API surface should import it from generated data, not maintain its own copy.

## Recommended approach

1. **Catalog**: grep for hardcoded lists across the codebase (patterns like `new Set([`, `['PathLayer'`, `case 'lighten':`, keyword string arrays)
2. **Classify**: for each, determine whether it can be derived from generated data or needs to remain manual (some things, like hover descriptions, are inherently manual)
3. **Prioritize**: focus on lists that are most likely to drift — constructor names, enum names, and method dispatch tables change more often than keywords
4. **Fix**: replace hardcoded lists with imports from generated data or shared constants
5. **Gate**: add a CI check or generation script audit that warns when a new type/enum/method is added to `pathogen-api.ts` but not reflected in downstream consumers

## Relationship to existing work

- The `completion-engine-generation-plan.md` already identified the drift problem for completion data and solved it with `scripts/generate-completions.ts`
- The `cross-system-feature-lifecycle.md` documents what needs updating for each change type — this audit would verify those checklists are complete
- The `completion-coverage-audit.md` found 13 missing enums — this broader audit would catch similar gaps in other systems

## Priority

Medium-high. Not blocking any feature work, but each new language feature added without this audit increases the risk of silent inconsistency. The cost of the audit is low (a few hours); the cost of not doing it accumulates with every new constructor, enum, or method.
