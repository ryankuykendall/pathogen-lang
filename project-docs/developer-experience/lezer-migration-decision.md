# Decision: Migrate from Parsimmon to Lezer

**Date**: 2026-04-02
**Status**: Partial migration complete (A-E done, F-G deferred)

## Problem

The Pathogen compiler used three separate grammar definitions:
1. **Parsimmon** parser (~1525 lines) for compilation
2. **JavaScript language mode** for playground syntax highlighting (misidentified ~40% of Pathogen syntax)
3. **TextMate grammar** (22 rules) for VS Code syntax highlighting

## What Was Done

| Sub-phase | Status | Deliverable |
|-----------|--------|-------------|
| A | Done | Lezer grammar (213 lines + external tokenizer) |
| B | Done | CST-to-AST converter (1,241 lines, ~50 functions) |
| C | Done | `parseLezer()` and `lezerParser` exported from library |
| D | Done | Playground uses Lezer for syntax highlighting (replaced JS mode) |
| E | Done | Diagnostics use Lezer error recovery (deleted recovery.ts) |
| F | Partial | Parsimmon NOT removed — Lezer doesn't cover all edge cases yet |
| G | Future | Auto-generate TextMate from Lezer |

## Current Architecture (Dual Parser)

- **Compilation**: Parsimmon (`parse()` → AST → evaluator)
- **Playground highlighting**: Lezer grammar → CodeMirror 6 native integration
- **VS Code highlighting**: TextMate grammar (instant) + semantic tokens from LSP (enhanced)
- **Diagnostics**: Lezer error recovery for multi-error detection + Parsimmon for detailed messages
- **Editor features**: language-services layer (15 capabilities) consuming Parsimmon AST

## What's Needed to Remove Parsimmon

The Lezer grammar covers core constructs but 1317 of 2322 tests fail when Lezer is used as the primary parser. The gap includes:
- Style block expression evaluation (evaluator uses Parsimmon `expression` parser directly)
- Edge cases in operator parsing, destructuring, complex expressions
- Some statement types not fully handled in the CST-to-AST converter

This is significant work but incremental — each grammar fix can be tested against the full suite.

## Key Tradeoffs Accepted

- **Dual parser maintenance**: Both Parsimmon and Lezer must handle new syntax additions (documented in src/CLAUDE.md Key Files table)
- **TextMate grammar kept**: Still needed for VS Code instant highlighting; could be auto-generated from Lezer (sub-phase G)
- **Semantic validations deferred**: Some parse-time checks (path command letter rejection) happen at AST-build time with Lezer

## See Also

- Architecture: `src/CLAUDE.md`
- Roadmap: `project-docs/developer-experience/vscode-extension-roadmap-v1.md`
- Lezer grammar: `src/parser/pathogen.grammar`
- AST builder: `src/parser/ast-builder.ts`
