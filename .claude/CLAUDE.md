# svg-path-extended

A TypeScript compiler that extends SVG path syntax with variables, expressions, control flow, functions, multi-layer output, and text elements.

## Quick Reference

```bash
npm run build           # Build production bundles (ESM, CJS, browser)
npm run dev             # Build with watch mode
npm test                # Run tests in watch mode
npm run test:run        # Run tests once
npm run cli             # Run CLI in development (via tsx)
npm run dev:website     # Build website + serve at localhost:3000 via Wrangler
npm run build:website   # Full website build (lib + docs + blog + static)
npm run build:docs      # Build docs pages
npm run build:blog      # Build blog pages
```

## Project Layout

```
src/           Compiler, evaluator, CLI, stdlib       → see src/CLAUDE.md
playground/    Vanilla Web Components SPA              → see playground/CLAUDE.md
docs/          Language and CLI documentation
tests/         Vitest test suites
scripts/       Build scripts (docs, blog, website, git hooks)
website/       Cloudflare Pages worker
dist/          Build output (do not edit)
public/        Generated website build (do not edit)
```

## Feature / Bug Lifecycle

### Compiler & CLI (`src/`)

Docs first → failing tests → implement → visual verify → full test suite. See `src/CLAUDE.md` for detailed steps and test file mapping.

### Playground (`playground/`)

Build library → scope components → identify reuse → storybook-driven design → integrate → visual verify. See `playground/CLAUDE.md` for detailed steps.

### Cross-Cutting (compiler, language-services, VS Code extension, playground)

For changes spanning multiple systems, see the [cross-system feature lifecycle](project-docs/developer-experience/cross-system-feature-lifecycle.md).

**Quick checklist:**

| Change type | Systems to update |
|-------------|------------------|
| New keyword | Grammar, evaluator, `completion-data.ts`, `hover.ts`, TextMate grammar, snippets, docs |
| New stdlib function | `stdlib/*.ts`, `completion-data.ts`, `hover.ts`, docs |
| New enum | evaluator `BUILTIN_ENUMS`, `completion-data.ts` (gap — see audit), docs |
| New type with members | evaluator, `completion-data.ts`, `completion.ts` (inferType + getMembersForObject) |
| New syntax construct | Lezer grammar, AST, ast-builder, evaluator, TextMate grammar, language-services, docs |

**Build order:** compiler → language-services → `npm run build` → VS Code packages → playground → docs

### VS Code Extension (`packages/`)

Build → end-to-end install verify → test all advertised features → full test suite. See `packages/vscode-pathogen/CLAUDE.md` for details.

### Quality Standard

**Everything we build is intended for users, not for internal validation.** When Claude is asked to implement a feature, the default expectation is that the result is production-ready: it installs, activates, and works as advertised from the user's perspective. Specifically:

- **No placeholders in shipped code.** If a feature isn't ready, don't register the command / expose the UI / add the menu item. Stub code that shows "not yet implemented" to a user is not acceptable — either implement it or don't ship it.
- **No silent failures.** If something can fail at runtime (module resolution, file not found, missing dependency), handle the error with a user-visible message that explains what went wrong and how to fix it.
- **End-to-end verification is mandatory.** For CLI tools: run the command and verify output. For VS Code extensions: build the `.vsix`, install it in a clean VS Code instance, and verify every advertised feature works (activation, commands, completions, hover, diagnostics, preview). For web features: load the page and verify interactivity. "It compiles" or "tests pass" is necessary but not sufficient — the artifact must work when a user encounters it.
- **Dependency packaging must be verified.** If a feature ships as a distributable artifact (`.vsix`, npm package, browser bundle), verify that all runtime dependencies are included and resolve correctly in the installed context, not just in the development workspace.
- **Be honest about readiness.** If work is incomplete, say so explicitly and document what remains. Never present scaffolding as a finished feature. If Claude discovers during implementation that something previously built is broken or incomplete, it must flag this to the user before proceeding rather than building on top of a broken foundation.

### Agent Workflow Hints

- **Parallel exploration**: For cross-cutting work, launch explore agents for `src/` and `playground/` simultaneously — they're fully independent codebases connected only by `dist/index.global.js`
- **Targeted tests**: Run specific test files during development (e.g., `npx vitest run tests/layers.test.ts`); full suite before commit
- **Build gate**: `npm run build` is required after any `src/` change before playground testing
- **Doc-first exploration**: When planning compiler features, explore `docs/` in parallel with `src/` since doc-first is the workflow

## Agents

Project agents in `.claude/agents/`:
- **code-reviewer**: Run after implementation, before commit. Read-only code quality review.
- **content-reviewer**: Multi-persona review for blog posts, docs, tutorials. Wraps the process at `website/guidelines/agentic-review.md`.
- **test-runner**: Background agent that runs tests and analyzes failures.

## Live Playground

- Local: `npm run dev:website` → http://localhost:3000
- Deployed: https://pedestal.design/svg-path-extended/

## Changelog

`CHANGELOG.md` follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). When updating it, always cover **all** work since the last entry — review `git log` from the previous entry's date, not just the current task. Organize entries under Added/Fixed/Changed with Core/Playground/Documentation/Development sub-sections.

## Summary Instructions

When compacting, prioritize:

- Recent code changes and their rationale
- Test failures and error messages
- Current task context and next steps

## Preservation of generate artifacts

As Claude is iterating with the user on planning and implentation of features on this project, it is expected that Claude will preserve and organize all artifacts (primers, plans, code snippets, demos) in a directory named after the feature in the project-docs/ directory. Claude should have a bias, when iterating, for saving old versions of an artifact (e.g., not modifying it) and creating new versions so that we can have a shared paper trail of what was proposed, attempted, and what succeeded. Claude should never delete or destroy there artifacts without the users permission. These artifacts are essential for telling the story of how new features are created and developed for this project, and we would like to ensure that we can tell the richest story possible.

That being said, Claude should, when warranted, make recommendations around cleanup once older artifacts begin to impact or pollute context unnecessarily.

### Pathogen Language file extension: .pathogen

All Pathogen Language files in this project, whether added by the user, or generate by Claude Code, should end with the .pathogen file extension for consistency.
