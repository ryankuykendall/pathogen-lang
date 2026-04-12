# Compiler & CLI

TypeScript compiler that parses extended SVG path syntax and evaluates it to SVG path strings, multi-layer output, text elements, and annotated debug output.

## Source Structure

```
src/
├── parser/
│   ├── ast.ts                    # AST node types (statements, expressions, layers, text)
│   ├── index.ts                  # Parser exports (Lezer-only: parse, parseLezer, extractComments)
│   ├── pathogen.grammar          # Lezer grammar — single source of truth for syntax
│   ├── pathogen.generated.ts     # Generated Lezer LR parser (from grammar)
│   ├── pathogen.generated.terms.ts # Generated Lezer term constants
│   ├── path-args-tokenizer.ts    # External tokenizer for greedy path arg consumption
│   ├── highlight.ts              # CodeMirror syntax highlight tags for Lezer tree
│   └── ast-builder.ts            # CST-to-AST converter (Lezer tree → AST nodes)
├── language-services/
│   ├── index.ts                  # Re-exports all language-services
│   ├── types.ts                  # Position, Range, Diagnostic types (LSP-compatible)
│   ├── document.ts               # TextDocument abstraction
│   ├── diagnostics.ts            # getDiagnostics (Lezer error recovery)
│   ├── symbols.ts                # getDocumentSymbols (outline/breadcrumbs)
│   ├── scope-analysis.ts         # analyzeScopes (scope tree, declarations, references)
│   ├── completion.ts             # getCompletions (keywords, stdlib, user defs, members)
│   ├── completion-data.ts        # Static completion entries (stdlib, keywords, properties)
│   ├── hover.ts                  # getHoverInfo (keywords, path commands, stdlib, symbols)
│   ├── navigation.ts             # getDefinition, getReferences
│   ├── signature-help.ts         # getSignatureHelp (active parameter in function calls)
│   ├── rename.ts                 # prepareRename, getRenameEdits
│   ├── semantic-tokens.ts        # getSemanticTokens (scope-aware highlighting)
│   ├── formatter.ts              # formatDocument (AST-based code formatting)
│   ├── code-actions.ts           # getCodeActions (quick fixes for diagnostics)
│   └── inlay-hints.ts            # getInlayHints (parameter names, type hints)
├── evaluator/
│   ├── index.ts       # Main evaluator → SVG path strings, layers, text
│   ├── annotated.ts   # Annotated output with comments & loop annotations
│   ├── context.ts     # Path context tracking (position, subpath start, command history)
│   ├── format.ts      # Number formatting utilities (toFixed)
│   └── formatter.ts   # Annotated output formatting
├── stdlib/
│   ├── index.ts       # Combined exports + contextAwareFunctions set
│   ├── math.ts        # Math/trig/interpolation functions
│   └── path.ts        # Path helpers (circle, rect, polygon, star, etc.)
├── cli.ts             # CLI entry point (file, stdin, inline, --output-svg-file, --annotated)
├── index.ts           # Library exports (compile, compileAnnotated, compileWithContext)
└── worker.ts          # Web Worker entry point for async compilation
```

## Tests

```
tests/
├── CLAUDE.md                       # Testing playbook and conventions
├── parser.test.ts                  # Parser unit tests
├── evaluator.test.ts               # Evaluator/integration tests
├── layers.test.ts                  # Multi-layer system tests
├── annotated.test.ts               # Annotated output tests
├── context.test.ts                 # Path context tracking tests
├── errors.test.ts                  # Error handling tests
├── cli.test.ts                     # CLI integration tests
├── helpers.ts                      # Shared test utilities
├── helpers.test.ts                 # Tests for test utilities
├── setup.ts                        # Custom Vitest matchers
├── vitest.d.ts                     # TypeScript declarations for custom matchers
└── language-services/              # Language intelligence tests
    ├── document.test.ts            # TextDocument abstraction
    ├── diagnostics.test.ts         # Diagnostic engine (Lezer + Parsimmon)
    ├── symbols.test.ts             # Document symbols
    ├── scope-analysis.test.ts      # Scope analysis
    ├── completion.test.ts          # Completion provider
    ├── hover.test.ts               # Hover provider
    ├── navigation.test.ts          # Go-to-def, find references
    ├── signature-help.test.ts      # Signature help
    ├── rename.test.ts              # Rename symbol
    ├── semantic-tokens.test.ts     # Semantic tokens
    ├── formatter.test.ts           # Code formatter
    ├── code-actions.test.ts        # Quick fixes
    ├── inlay-hints.test.ts         # Inlay hints
    └── ast-builder.test.ts         # Lezer CST-to-AST converter
```

## Docs

```
docs/
├── getting-started.md # Quickstart guide
├── syntax.md          # Language syntax reference
├── stdlib.md          # Standard library functions
├── layers.md          # Multi-layer system documentation
├── cli.md             # CLI usage and options
├── examples.md        # Practical examples and recipes
├── debug.md           # Debugging guide
└── ...                # See docs/CLAUDE.md for file mapping
```

## Architecture

### Parser (Lezer)

**Lezer** (~213 line grammar + external tokenizer) — Sole parser for both compilation and editor integration. The grammar (`pathogen.grammar`) is compiled to an LR parser table by `@lezer/generator`. Lezer's built-in error recovery powers multi-error diagnostics. The parser also provides CodeMirror 6 native syntax highlighting for the playground.

**CST-to-AST converter** (`ast-builder.ts`) — Converts Lezer's concrete syntax tree to AST nodes defined in `ast.ts`. Full parity with all language constructs.

**Expression parser** (`lezer-expression.ts`) — Parses standalone expression strings (e.g., style block values) by wrapping them as `let _ = expr;` and extracting the AST.

### Language Services

Shared intelligence layer (`src/language-services/`) consumed by both the VS Code extension (via LSP) and the playground (via direct import). Zero Node.js or VS Code dependencies — ships in the main npm bundle.

Provides: diagnostics, document symbols, scope analysis, completion, hover, go-to-definition, find-references, signature help, rename, semantic tokens, formatting, code actions, inlay hints. See `src/language-services/CLAUDE.md` for module details and sync requirements.

### Evaluator (4-file split)

- **`index.ts`** — Main evaluator. Walks AST, maintains scope chain, evaluates expressions, produces SVG path strings. Supports multi-layer output (path layers + text layers), `log()` function, and user-defined functions. Has safeguards: max 32,000 loop iterations, rejects Infinity/NaN in loop bounds.
- **`annotated.ts`** — Parallel evaluator that produces annotated output preserving comments, showing loop iterations, and annotating function calls. Used by `compileAnnotated()`.
- **`context.ts`** — Path context tracking. Maintains current pen position, subpath start point, and optional command history. Powers `ctx.position`, `ctx.start`, and context-aware stdlib functions.
- **`format.ts`** / **`formatter.ts`** — Number formatting (toFixed) and annotated output formatting.

### Layers

The layer system allows multiple `<path>` and `<text>` elements in a single program. `layer` blocks define named layers with optional styles (stroke, fill, stroke-width, opacity, font-size, etc.). `apply` blocks route commands to specific layers. Default layer is used when no explicit layer is active.

### Text & Tspan

`text` statements produce `<text>` SVG elements. `tspan` children support inline styling. Text layers track position (x, y) and style properties.

### Stdlib

- **`math.ts`** — Math functions (sin, cos, lerp, clamp, map, etc.)
- **`path.ts`** — Path helpers (circle, rect, polygon, star, roundedRect, arc, etc.)
- **`index.ts`** — Combines exports, defines `contextAwareFunctions` set (polarPoint, polarOffset, polarMove, polarLine, arcFromCenter, tangentLine, tangentArc, etc.)

Context-aware functions receive the current path context and can read pen position and tangent direction.

### Key concepts

- **Path commands vs identifiers**: Single letters that are SVG path commands (M, L, H, V, C, S, Q, T, A, Z) cannot be used as variable names in path argument positions.
- **calc()**: Required for math expressions in path arguments. Plain identifiers work for simple variable references.
- **User functions**: Return PathSegment objects that stringify when used in path context.

## Key Files for Common Tasks

| Task                         | Files                                                              |
| ---------------------------- | ------------------------------------------------------------------ |
| Add new syntax               | `parser/pathogen.grammar`, `parser/ast.ts`, `parser/ast-builder.ts` |
| Add runtime behavior         | `evaluator/index.ts`                                               |
| Add annotated output support | `evaluator/annotated.ts`                                           |
| Add context tracking         | `evaluator/context.ts`                                             |
| Add layer features           | `evaluator/index.ts`, `parser/ast.ts`, `parser/pathogen.grammar`   |
| Add stdlib function          | `stdlib/math.ts` or `stdlib/path.ts`, `stdlib/index.ts`            |
| Add context-aware stdlib fn  | `stdlib/path.ts`, `stdlib/index.ts` (add to contextAwareFunctions) |
| Add CLI option               | `cli.ts`                                                           |
| Add library export           | `index.ts`                                                         |
| Add language service feature | `language-services/*.ts`, `language-services/index.ts`              |
| Add stdlib completion        | `language-services/completion-data.ts`, `language-services/hover.ts`|
| Add type member completions  | `language-services/completion-data.ts`, `language-services/completion.ts` |
| Update editor highlighting   | `parser/pathogen.grammar`, `parser/highlight.ts`                   |
| Update VS Code highlighting  | `packages/vscode-pathogen/syntaxes/pathogen.tmLanguage.json`       |
| Add VS Code snippet          | `packages/vscode-pathogen/snippets/pathogen.code-snippets`         |

## CLI Options

```
svg-path-extended <file>           Compile a file
svg-path-extended -                Read from stdin
svg-path-extended -e <code>        Compile inline code
svg-path-extended --src=<file>     Compile a file (explicit flag)

--annotated                        Output annotated/debug format with comments
--print-logs                       Print log() output to stderr
--log-file=<file>                  Write structured log data as JSON to file
--to-fixed=<N>                     Round decimals to N digits (0-20)
--output-svg-file=<file>           Output as complete SVG file
-o, --output <file>                Write path output to file
--viewBox=<box>                    SVG viewBox (default: "0 0 200 200")
--width=<w>                        SVG width (default: "200")
--height=<h>                       SVG height (default: "200")
--stroke=<color>                   Path stroke color (default: "#000")
--fill=<color>                     Path fill color (default: "none")
--stroke-width=<w>                 Path stroke width (default: "2")
```

## Library Exports

```ts
// Compilation
compile(source, options?)          // → CompileResult { layers, logs, calledFunctions }
compileAnnotated(source)           // → formatted annotated string
compileWithContext(source, opts?)   // → { path, layers, context, logs }

// Parsing
parse(source)                      // → Program AST (Parsimmon)
parseLezer(source)                 // → { tree, ast } (Lezer parse tree + AST)
lezerParser                        // Raw Lezer LR parser for CodeMirror integration

// Language Services (shared by VS Code extension and playground)
getDiagnostics(document)           // → Diagnostic[] (Lezer error recovery + Parsimmon)
getCompletions(document, position) // → CompletionItem[] (keywords, stdlib, user defs, members)
getHoverInfo(document, position)   // → HoverInfo | null
getDefinition(document, position)  // → Location | null
getReferences(document, position)  // → Location[]
getDocumentSymbols(document)       // → DocumentSymbol[]
getSignatureHelp(document, pos)    // → SignatureHelp | null
prepareRename(document, position)  // → PrepareRenameResult | null
getRenameEdits(document, pos, name) // → TextEdit[]
getSemanticTokens(document)        // → SemanticToken[]
formatDocument(document, options?)  // → FormatEdit[]
getCodeActions(document, range, diags) // → CodeAction[]
getInlayHints(document, range)     // → InlayHint[]
analyzeScopes(document)            // → ScopeInfo { root, declarations, references }
```

`CompileResult.layers` is an array of `LayerOutput` objects, each containing either path data or text elements, plus per-layer style overrides.

## Development Lifecycle

1. **Documentation first** — Update `docs/` before coding (except bug fixes). Start by writing the usage examples the end-user will see — these define the contract. The doc should answer: what does this look like in code, what does it produce, and when would you use it? When adding, removing, or revising features, doc changes must go through [agentic review](../website/guidelines/agentic-review.md).
2. **Write failing tests** — First, translate the doc examples from step 1 into happy-path tests that validate the documented experience. Then add edge case and error message tests to protect against surprising behavior. Target specific test files:
   - Syntax → `tests/parser.test.ts`
   - Behavior → `tests/evaluator.test.ts`
   - Layers → `tests/layers.test.ts`
   - Annotated output → `tests/annotated.test.ts`
   - Context tracking → `tests/context.test.ts`
   - Error handling → `tests/errors.test.ts`
   - CLI → `tests/cli.test.ts`
3. **Implement** — Make tests pass. Follow existing evaluator patterns for consistency — this is a language runtime, so predictability matters more than cleverness.
3.5. **Update language-services** — If the change adds or modifies keywords, stdlib functions, types, enums, or member access, update the language-services layer so completions, hover, and signature help reflect the new API surface. See `src/language-services/CLAUDE.md` for the specific files to update per change type, and the [cross-system feature lifecycle](../project-docs/developer-experience/cross-system-feature-lifecycle.md) for the full checklist.
4. **Visual verify** — Generate SVGs with `--output-svg-file` and confirm the output renders correctly, paths are smooth, and edge cases produce reasonable visual results.
5. **Code review** — Run the `@code-reviewer` agent to get a read-only review of all changes before committing.
6. **Full test suite** — `npm run test:run` before commit. This is the regression safety net — verify existing user expectations aren't broken, not just that the new feature works.
