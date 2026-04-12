# Playground ↔ VS Code Language-Feature Parity

**Date:** 2026-04-10
**Status:** Infrastructure landed in Phase B; Phase C (signature help, format, navigation, rename) in progress.

## Why this doc exists

The VS Code extension wraps every language-services feature in LSP handlers and wires the full set of capabilities. The Playground historically wired only a handful (completion, hover, post-compile error highlights) and had a stale TypeScript declaration for `window.SvgPathExtended` that left most of the language-services API invisible to the editor.

The result was that the same language-services bug looked different in the two channels, and features added for VS Code silently failed to reach Playground users. A user reporting "I don't get member completions when I type `bg.` in the Playground" was really seeing a wiring gap, not a language-services bug — the engine was correct, but CodeMirror's autocomplete never invoked it on the dot keystroke.

This doc captures the architecture that replaces that drift-prone setup. It is the reference for how a new language-services feature reaches the Playground, and the reasoning behind the enforcement layer that prevents regressions.

## Architecture at a glance

```
      src/language-services/          ← pure TypeScript, zero VS Code / Node deps
              │
              ├── index.ts             public API surface
              └── feature-catalog.ts   single source of truth for parity
                       │
   ┌───────────────────┴──────────────────────┐
   │                                          │
   ▼                                          ▼
packages/pathogen-language-         playground/utils/
  server/src/server.ts                cm-language-services.ts
   (LSP handlers for VS Code)          (CodeMirror extensions)
   │                                          │
   ▼                                          ▼
VS Code extension                         Playground editor
```

Both channels consume the same functions from `src/language-services/`. The VS Code channel wraps them as LSP handlers over stdio; the Playground channel wraps them as CodeMirror 6 extensions. Nothing language-service-shaped is ever channel-specific — the same `getCompletions(doc, pos)` call serves both.

There is **no worker / postMessage indirection** for Playground language services. Language features are synchronous and cheap, and a message-queue hop on every keystroke would hurt responsiveness without reducing drift. The compiler worker still exists for evaluation latency — that boundary is real and worth the cost — but language intelligence runs directly on the main thread.

## The feature catalog

[`src/language-services/feature-catalog.ts`](../../src/language-services/feature-catalog.ts) is the canonical registry of every language-services feature. Each entry captures:

| Field | Purpose |
|-------|---------|
| `id` | Stable identifier used by tests and wiring. |
| `fn` | Exported function name from `src/language-services/index.ts`. The parity test greps for this. |
| `vscodeCapability` | LSP provider name advertised in `server.ts`'s `onInitialize` return. `null` for push-only features (diagnostics). |
| `lspTriggerCharacters` | Trigger chars the LSP server should declare. |
| `playgroundRequired` | `true` if the feature must be wired into the Playground. |
| `playgroundSkipReason` | Human-readable reason if `playgroundRequired: false`. Required when skipped. |
| `playgroundDeferred` | `true` if the feature is staged for a future PR but allowed to be absent now. |

Adding a new language-services function that isn't in the catalog (or the `HELPERS_NOT_FEATURES` set) will fail the exhaustiveness assertion in the parity test.

## The wire-up module

[`playground/utils/cm-language-services.ts`](../../playground/utils/cm-language-services.ts) is the Playground's analog of `server.ts` — a single place where every playground-wired feature becomes a CodeMirror extension. It exports one function:

```ts
export function buildLanguageExtensions(
  cm: CmModulesForLanguageServices,
  legacyFallback: unknown,
): LanguageExtensionsResult
```

`code-editor-pane.ts` calls this once during editor creation and spreads the returned `extensions` array into `EditorState.create`. The returned `errorHighlight` handle exposes imperative setters so workspace-view can push post-compile diagnostics into the editor.

Each feature has its own internal `wire<Feature>(cm)` function that reads from `window.SvgPathExtended` and returns the CodeMirror extension(s) for that feature. Currently wired:

- **Completion** — `sharedCompletionSource` → `getCompletions` (member access, keywords, stdlib args, style properties, scope-aware user symbols).
- **Completion triggers** — An `updateListener` that manually calls `startCompletion(view)` when the user types `.`, `$`, `(`, or `,`. CodeMirror 6's built-in autocompletion does not auto-open on non-word characters, so this shim is what makes `bg.` show member completions without Ctrl+Space.
- **Hover** — `hoverTooltipExtension` → `getHoverInfo`.
- **Diagnostics** — `errorHighlightExtension` provides the decoration layer; workspace-view pushes results from `getDiagnostics` via the imperative handle.

Deferred (catalog `playgroundDeferred: true`, wiring lands in Phase C):

- Signature help (C1)
- Format document (C2)
- Go-to-definition (C4)
- Find references (C5)
- Rename (C6)
- Document symbols / outline panel (follow-up)
- Code actions / quick-fix lightbulb (follow-up)
- Inlay hints (follow-up)

Skipped by design:

- **Semantic tokens** — `pathogenLanguage()` via Lezer already provides syntax highlighting through `@codemirror/language`. Layering semantic tokens on top would double-render.
- **Code lenses** — reference-count chrome above declarations has low value in a single-file editor.
- **Range / on-type formatting** — no natural entry point in the Playground UI.

Each skip is tracked in the catalog with a `playgroundSkipReason` and surfaces in the parity test's assertion: skipped features must have an explicit reason longer than a few words.

## The `window.SvgPathExtended` type

[`playground/types/global.d.ts`](../../playground/types/global.d.ts) is auto-derived from `dist/index.d.ts` via an `import type * as SvgPathExtendedLib from '../../dist/index'` statement. The declared shape of `window.SvgPathExtended` is `typeof SvgPathExtendedLib`. This means:

- Every new language-services export automatically appears on the Window type after the next `npm run build`. No manual sync step.
- Adding a function to `src/language-services/index.ts` cannot leave the Playground TS check broken in a silent way — either the function is visible through the derivation, or the build failed.
- The imports are `import type`, so they are erased by the esbuild micro-transpiler and never reach the runtime bundle.

The playground tsconfig uses `skipLibCheck: true`, so internal noise in the generated `.d.ts` is ignored. The import intentionally points at `dist/` rather than `src/` because importing from `src/` drags the playground tsconfig into the main library's strict-mode issues (pre-existing errors in `src/parser/ast-builder.ts`) that are unrelated to the playground.

The rule that led to this design is documented in `feedback_no_drift_prone_files.md`: *never hand-maintain a file that mirrors another source of truth; derive it.*

## The parity test

[`tests/cross-channel-parity.test.ts`](../../tests/cross-channel-parity.test.ts) enforces three invariants. All assertions are string-based — no import-graph coupling — so the test is immune to toolchain quirks.

1. **Exhaustiveness.** Every export from `src/language-services/index.ts` whose name starts with `get`, `format`, `prepare`, or `analyze` must be classified in `LANGUAGE_FEATURES` or `HELPERS_NOT_FEATURES`. New exports that are neither fail the test until classified.
2. **Playground completeness.** Every catalog entry with `playgroundRequired: true` and `playgroundDeferred: false` must have its `fn` name textually present in `playground/utils/cm-language-services.ts`. Remove a wire-up by accident and the test fails with a per-feature message.
3. **VS Code completeness.** Every catalog entry with a `vscodeCapability` must have that capability declared in `packages/pathogen-language-server/src/server.ts`'s `onInitialize` return. Every `lspTriggerCharacters` set must match what server.ts declares for that provider (validated via regex extraction of the quoted strings).

The test file also asserts that every skipped feature has a non-trivial `playgroundSkipReason`, so skips always have documented rationale.

## Debugging a parity test failure

| Failure | Fix |
|---------|-----|
| `has no unclassified get/format/prepare/analyze exports` → `['getMyNewThing']` | You added a new language-services export. Decide whether it's a user-facing feature or an internal helper. If feature, add to `LANGUAGE_FEATURES`. If helper, add to `HELPERS_NOT_FEATURES`. |
| `cataloged features all exist as exports` → `expected [...] to contain "getMyOldThing"` | The catalog references a function that no longer exists. Remove or rename the catalog entry. |
| `signatureHelp (getSignatureHelp) is referenced in cm-language-services.ts` → fails | You flipped `playgroundDeferred` to `false` without wiring the feature. Either wire it in `cm-language-services.ts` or set `playgroundDeferred: true`. |
| `signatureHelp capability "signatureHelpProvider" is declared in server.ts` → fails | Server.ts doesn't declare the capability. Add it to the `onInitialize` return. |
| `trigger characters declared in server.ts don't match the catalog` | Update server.ts's `triggerCharacters` array OR update the catalog's `lspTriggerCharacters`. They must agree. |
| `every skipped feature has an explicit playgroundSkipReason` | Supply a longer (>20 char) `playgroundSkipReason` when setting `playgroundRequired: false`. |

## Relationship to the cross-system lifecycle doc

The cross-system-feature-lifecycle doc ([`cross-system-feature-lifecycle.md`](./cross-system-feature-lifecycle.md)) has a new **"Adding a New Language-Services Feature"** checklist that walks through the full path: implement → catalog → LSP handler → Playground wire-up → test. Use that checklist for new features; this doc is the architectural reference for *why* the pieces fit together the way they do.
