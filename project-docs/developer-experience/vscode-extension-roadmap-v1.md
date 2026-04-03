# Pathogen VS Code Extension & Language Server: Roadmap v1

> Companion to `towards-a-vscode-plugin.md`. This is the phased implementation plan produced from reviewing that document against the current codebase state.

## Decisions

- **File extension**: `.pathogen` only
- **SVG Preview**: Phase 21 (after language intelligence, before playground parity)
- **Error recovery**: Statement-boundary recovery wrapper after LS skeleton (Phase 9.5). Not a parser rewrite.
- **Monorepo**: npm workspaces for `packages/` directory
- **Architecture**: Shared `src/language-services/` layer consumed by both VS Code (via LSP) and playground (via direct import)

## Architecture

Three-layer design:
1. **`src/language-services/`** — The brain. Zero Node/VS Code deps. Ships in the existing npm bundle so the playground gets it for free.
2. **`packages/pathogen-language-server/`** — Thin LSP adapter over language-services.
3. **`packages/vscode-pathogen/`** — Thin VS Code extension (TextMate grammar, language config, webview panel).

## Phase Summary (31 phases)

| Phase | Name | Dependencies |
|-------|------|-------------|
| 0 | Foundation & directory structure | None |
| 1 | TextDocument abstraction & diagnostic types | 0 |
| 2 | Structured diagnostics from parser errors | 1 |
| 3 | Evaluator error diagnostics | 2 |
| **4** | **Playground diagnostic integration** | 3 |
| 5 | VS Code extension skeleton & language config | 0 |
| 6 | TextMate grammar (basic) | 5 |
| 7 | TextMate grammar (advanced blocks) | 6 |
| 8 | Snippet contributions | 5 |
| 9 | Language server skeleton with diagnostics | 3, 5 |
| 9.5 | Multi-error recovery wrapper | 9 |
| 10 | Document symbols (outline) | 9 |
| 11 | AST scope analysis foundation | 1 |
| 12 | Completion (stdlib & keywords) | 11 |
| 13 | Completion (user definitions & scope) | 11, 12 |
| 14 | Completion (member access & type inference) | 13 |
| 15 | Style block completions | 12 |
| 16 | Wire completion into language server | 14, 9 |
| 17 | Hover provider | 11, 14 |
| 18 | Wire hover into language server | 17, 9 |
| 19 | Go to definition | 11, 9 |
| 20 | Find references | 19 |
| 21 | SVG preview panel (VS Code) | 5 |
| **22** | **Playground hover tooltips** | 17 |
| **23** | **Playground completion migration** | 14, 15 |
| 24 | Signature help | 11 |
| 25 | Rename symbol | 20 |
| 26 | Semantic tokens | 11 |
| 27 | Formatting | 1 |
| 28 | Code actions (quick fixes) | 2, 11 |
| 29 | Lezer grammar investigation | 26 |
| 30 | Inlay hints | 14 |

**Bold** = playground parity milestones.

## Milestones

| Milestone | Phases | What Users Get |
|-----------|--------|----------------|
| Playground: Shared diagnostics | 0-4 | Error highlighting powered by language-services |
| VS Code: Language feels real | 5-8 | Syntax highlighting, brackets, snippets |
| VS Code: First IDE features | 9-10 | Live error squiggles, document outline |
| Multi-error diagnostics | 9.5 | 2-5 errors per file via recovery wrapper |
| Shared: Completion engine | 11-16 | Context-aware autocomplete in VS Code |
| Shared: Code understanding | 17-20 | Hover, go-to-def, find references |
| VS Code: Visual language | 21 | Live SVG preview panel |
| Playground: Full parity | 22-23 | Hover tooltips + shared completion engine |
| Mature IDE | 24-28 | Signature help, rename, semantic tokens, formatting, quick fixes |
| Polish | 29-30 | Lezer grammar investigation, inlay hints |

## Remaining Open Questions

- Formatter opinions (semicolons, indentation size, path command spacing) — needed before Phase 27
- Publish strategy (VS Code Marketplace or internal-only initially)
- Incremental document sync (full sync probably fine for < 500-line files)
- Lezer grammar effort (playground syntax highlighting priority vs. JavaScript mode)

## See Also

- Full plan with critique, architecture details, and risk register: conversation plan file
- Source document: `project-docs/developer-experience/towards-a-vscode-plugin.md`
