# Decision: Migrate from Parsimmon to Lezer

**Date**: 2026-04-02
**Status**: In progress (Sub-phase A)

## Problem

The Pathogen compiler uses three separate grammar definitions:
1. **Parsimmon** parser (~1525 lines) for compilation
2. **JavaScript language mode** for playground syntax highlighting (misidentifies ~40% of Pathogen syntax)
3. **TextMate grammar** (22 rules) for VS Code syntax highlighting

These must be kept in sync manually, and the playground's syntax highlighting is visibly wrong for path commands, block delimiters, keywords, colors, units, and range operators.

## Decision

Replace Parsimmon with **Lezer** (`@lezer/lr`) as the primary parser. One `.grammar` file powers both compilation (via CST-to-AST conversion) and editor syntax highlighting (natively via CodeMirror 6).

## Alternatives Considered

| Option | Effort | Verdict |
|--------|--------|---------|
| Full Lezer Grammar (chosen) | 8-11 sessions | One grammar, eliminates duplication, gains error recovery + incremental parsing |
| StreamLanguage Tokenizer | 1-2 sessions | Fixes highlighting but doesn't eliminate grammar duplication |
| Semantic Token Injection | 1 session | Partial fix, requires successful parse, visual flash |
| Chevrotain | 10+ sessions | No CodeMirror integration, no advantage over Parsimmon |
| tree-sitter | 15+ sessions | Requires WASM, impractical for browser playground |
| Do Nothing | 0 | 40% of syntax highlighted incorrectly |

## Key Tradeoffs

- **Semantic validations deferred**: Path command letter rejection, context-aware function restrictions move from parse-time to AST-build-time. Still before evaluation.
- **Learning curve**: Lezer grammar syntax is different from Parsimmon combinators.
- **Build step**: Lezer grammar must be compiled to a parser table before use.
- **TextMate grammar kept**: Still needed for VS Code instant highlighting. Future: auto-generate from Lezer.

## Sub-phases

A. Lezer grammar → B. CST-to-AST converter → C. Integration + tests → D. Playground → E. Annotated view + diagnostics → F. Cleanup → G. TextMate auto-generation (future)

## See Also

- Full plan: conversation plan file
- Roadmap: `project-docs/developer-experience/vscode-extension-roadmap-v1.md`
