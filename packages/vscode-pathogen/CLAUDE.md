# VS Code Extension & Language Server

Thin VS Code extension + LSP server for the Pathogen language. All intelligence comes from `src/language-services/` — the extension and server are adapters only.

## Architecture

```
packages/vscode-pathogen/             packages/pathogen-language-server/
  src/extension.ts                      src/server.ts
    ↓                                     ↓
  Starts LanguageClient                 Creates LSP connection
  (stdio transport)                     Wraps language-services functions
    ↓                                   in LSP type converters
  Registers preview command                ↓
  (src/preview.ts — functional)         import from 'pathogen-lang'
                                        (file:../../ dependency)
```

The extension spawns the language server as a child process. The server imports all language-service functions from the `pathogen-lang` library (symlinked via `"file:../../"` in package.json) and wraps each one in an LSP handler that converts between VS Code LSP types and internal types.

## Package Layout

**Extension** (`packages/vscode-pathogen/`):

| File | Purpose |
|------|---------|
| `src/extension.ts` | Entry point. Starts LanguageClient (saved and `untitled` `.pathogen` documents; a `**/{*.pathogen,pathogen.json}` watcher feeds the server's didChangeWatchedFiles), registers preview command |
| `src/preview.ts` | The preview panel's VS Code glue (`PreviewPanel`): owns its listeners, shows the active `.pathogen` document, reads the files it imports through `previewModules`, loads its fonts through `FontSession` and posts numbered `fonts` / `update` messages. Redraws when an imported file's tab changes, or a `.pathogen` file changes on disk while the document imports anything |
| `src/preview-modules.ts` | The files the preview's document imports (`resolveEditorModules` from `pathogen-lang/node`, open tabs over the disk), as plain data for `update` (`files` as entries: postMessage can't carry a Map); load errors in the CLI's words; a module's notice. No `vscode` import — tested by `tests/vscode-preview-modules.test.ts` |
| `src/font-session.ts` | Fonts for the preview, loaded in the extension host by the CLI's loader (`pathogen-lang` + `pathogen-lang/node`, from the bundled `server/node_modules`), imported files' `@font` included. No `vscode` import — tested by `tests/vscode-font-session.test.ts` |
| `src/webview-html.ts` | The webview page and its inline script: compiles with the bundled library (`<script src="${compilerUri}">`), a fresh font registry per compile from the update's `fontIds`, `@font-face` for live `<text>`, renders via the shared `buildSvgTree` + `mountInto`. Pan/zoom is the shared `PanZoomController` (`window.PathogenPanZoom`, from `compiler/pan-zoom.global.js`) — CSS-transform during the gesture, baked into the viewBox on idle; wheel + drag + touch pinch. No `vscode` import — `project-docs/modules/verify/verify-vscode-fonts.mjs` loads it under its real CSP |
| `syntaxes/pathogen.tmLanguage.json` | TextMate grammar for syntax highlighting |
| `snippets/pathogen.code-snippets` | Code snippets (for, fn, if, switch, shapes, etc. — 35 as of 2026-09) |
| `language-configuration.json` | Comment toggling, brackets, auto-closing, indentation, folding |
| `test-fixtures/all-syntax.pathogen` | The file to open when eyeballing highlighting. Not shipped (`.vscodeignore`), but **guarded** by `tests/all-syntax-fixture.test.ts`: it must compile with zero diagnostics (so the preview command renders it) and its parse tree must contain every node type and keyword the Lezer grammar can produce |
| `package.json` | Extension manifest (contributes: languages, grammars, snippets, commands) |

**Language Server** (`packages/pathogen-language-server/`):

| File | Purpose |
|------|---------|
| `src/server.ts` | LSP adapter — each `connection.on*` handler wraps a language-services function, with `documentModules.optionsFor(uri)` for the features across files |
| `src/modules.ts` | Imports (`DocumentModules`): each open document's files read at its check (`resolveEditorModules`, open buffers first) and kept for requests, which never read the disk; the open documents a change affects; a project path back to a URI; the project's modules for path completion. Tested by `tests/language-server-modules.test.ts` |
| `src/cross-file-diagnostics.ts` | An error in another file at its own line (`CrossFileDiagnostics`): what a document's check sends to the files its errors happened in (`Diagnostic.alsoIn`), merged with each open file's own diagnostics on every publish, taken back when the sender is fixed or closed. Node-free; tested by `tests/language-server-cross-file.test.ts` |
| `src/fonts.ts` | Fonts for diagnostics (`DiagnosticFonts`): installed and cached fonts first, a background download when needed, then a recheck — diagnostics never wait for the network. Imported files' `@font` load too |

## LSP Capabilities

| Capability | Language-Services Function | Trigger |
|-----------|---------------------------|---------|
| `textDocumentSync: Full` | `getDiagnostics()`; each publish merges what other documents sent (`CrossFileDiagnostics`) | On document change |
| `documentSymbolProvider` | `getDocumentSymbols()` | Outline request |
| `completionProvider` (`.`, `$`, `#`, `@`, `&`, `:`, `"`, `/`) | `getCompletions()` | Typing trigger chars; `"` and `/` only open an import's path list (the server returns nothing for them elsewhere) |
| `hoverProvider` | `getHoverInfo()` | Mouse hover |
| `definitionProvider` | `getDefinition()` | Ctrl+Click / F12 |
| `referencesProvider` | `getReferences()` | Find All References |
| `signatureHelpProvider` (`(`, `,`) | `getSignatureHelp()` | Inside function call |
| `renameProvider` (prepare) | `prepareRename()`, `getRenameEdits()`; `renameRefusal()` as a `RequestFailed` error for an imported or exported name | F2 |
| `semanticTokensProvider` (full) | `getSemanticTokens()`, `encodeSemanticTokens()` | File open/change |
| `documentFormattingProvider` | `formatDocument()` | Format Document |
| `codeActionProvider` | `getCodeActions()` | Lightbulb / quick fix |
| `inlayHintProvider` | `getInlayHints()` | File open/change |

## Build & Development

```bash
# Root library must build first (language server depends on it)
npm run build                                           # Root — rebuilds dist/

# Language server
cd packages/pathogen-language-server && npm run build   # Compiles src/ → out/server.js

# Extension
cd packages/vscode-pathogen && npm run build            # Compiles src/ → out/extension.js

# Watch mode (separate terminals)
cd packages/pathogen-language-server && npm run watch
cd packages/vscode-pathogen && npm run watch
```

**Dependency chain**: If `src/language-services/` changes → rebuild root lib (`npm run build`) → rebuild language server → extension picks up changes.

**Testing**: The packages have no test scripts of their own (`"test": "echo 'No tests yet'"`); their logic is tested from the root suite — `tests/vscode-font-session.test.ts` (the preview's fonts), `tests/vscode-preview-modules.test.ts` (the preview's imports), `tests/language-server-fonts.test.ts` (diagnostics' fonts), `tests/language-server-modules.test.ts` (the server's imports) and `tests/language-server-cross-file.test.ts` (errors sent to other files), with `pathogen-lang` mapped to the sources in `vitest.config.ts`. End to end, after `npm run build:vscode`:
- `node project-docs/modules/verify/verify-vscode-fonts.mjs`: the extension host, the real webview under its CSP, the bundled language server (fonts; needs the network);
- `node project-docs/modules/verify/verify-step6c-lsp.mjs`: a language server over stdio on a real project folder (imports: hover, definition, completion, F2, rechecks, watched files, an error at its own line in another open file). `PATHOGEN_SERVER=packages/vscode-pathogen/server/out/server.js` runs the bundled one;
- `node project-docs/modules/verify/verify-step6d-preview.mjs`: the preview's imports through the shipped `out/` code and the real webview.

## TextMate Grammar

The TextMate grammar (`syntaxes/pathogen.tmLanguage.json`) provides instant syntax highlighting before the language server starts. It is **hand-maintained separately** from the Lezer grammar (`src/parser/pathogen.grammar`).

When a new keyword or syntax construct is added:
1. Update the Lezer grammar (source of truth for the parser)
2. Update the TextMate grammar keyword pattern or add new scope rules
3. Add the construct to `test-fixtures/all-syntax.pathogen` — `tests/all-syntax-fixture.test.ts` fails until the new node type appears there (or gets a justified exception), and fails if the file stops compiling
4. Open the fixture in VS Code and check the highlighting by eye — there is still no automated TextMate tokenization test, so this step is the only check on the TextMate grammar's scopes (`tests/keyword-registry.test.ts` covers its keyword list only)

The Lezer grammar also powers CodeMirror 6 highlighting in the playground via `src/parser/highlight.ts` — a third, separate highlighting definition.

## Snippets

Snippets in `snippets/pathogen.code-snippets` mirror the snippet bodies from the hand-written `KEYWORD_COMPLETIONS` in `src/language-services/completion-data-static.ts`. When a new keyword snippet is added there, add a corresponding VS Code snippet here — nothing syncs the two. Same templates, different format (VS Code JSON vs completion insertText).

## What to Update When the Language Changes

| Change | Update needed in these packages |
|--------|-------------------------------|
| New keyword | TextMate grammar (keyword pattern), snippets (if templatable) |
| New syntax construct | TextMate grammar (new pattern), `test-fixtures/all-syntax.pathogen` |
| New stdlib function | Nothing — flows through language-services via LSP |
| New enum | Nothing — flows through language-services via LSP |
| New type | Nothing — flows through language-services via LSP |
| New language-service feature | `server.ts` — add new `connection.on*` handler |

For the full cross-system checklist, see `project-docs/developer-experience/cross-system-feature-lifecycle.md`.

## Readiness Status

The extension's **preview webview is functional** — the `Broken: Preview panel shows placeholder` item previously here has been resolved. The preview consumes the bundled `pathogen-lang` library via `<script src="${compilerUri}">`, compiles Pathogen source in-webview, and renders through the shared `buildSvgTree` + `mountInto` adapters (as of the 2026-04-21 render-pipeline unification; see [`project-docs/render-pipeline-unification/PLAN.md`](../../project-docs/render-pipeline-unification/PLAN.md) Phase 5). Features working today: SVG render, layer visibility toggle, CSSVar panel, palette, recompile button, navigator, pan/zoom, and fonts (since 2026-10-23: `@font` files and families load in the extension host exactly as in the CLI, so `fromGlyph` / `Font.*` geometry is byte-identical to the CLI's, and live `<text>` renders in the loaded face). The extension declares `untrustedWorkspaces: { supported: false }`, so it doesn't run in Restricted Mode.

**Pan/zoom (2026-06).** The preview adopted the shared `PanZoomController` (`src/ui/pan-zoom-controller.ts` → `dist/pan-zoom.global.js` → `window.PathogenPanZoom`); `scripts/build-vscode-extension.ts` copies that bundle into `compiler/` next to `index.global.js`, and the webview loads it via a second nonce'd `<script>`. Pan/zoom uses a CSS transform during the gesture and bakes into the `viewBox` on idle (the large-SVG perf win — see [`project-docs/pan-zoom-performance/findings-and-recommendations.md`](../../project-docs/pan-zoom-performance/findings-and-recommendations.md)); adds touch pinch-zoom; and splits the navigator viewport rect into its own GPU-promoted overlay SVG. Verified headless (`getWebviewContent` is exported for this): the webview compiles a real scene, pans/zooms, and bakes cleanly. The final interactive feel still wants a `.vsix` install/reload (see Development Lifecycle).

Other items below are still open.

### Broken

_No open items._ Resolved 2026-09-06 (confirmed in the editor): **language server did not activate when installed from .vsix**. Verified root cause: the `.vsix` never contained `vscode-languageclient`. `vsce --no-dependencies` strips the extension's own module directory, and `scripts/build-vscode-extension.ts` tried to copy the client out of the *root* install, where it is not a dependency, so `activate()` could not construct a `LanguageClient` and the server was never spawned (the preview command, which needs no client, kept working — hence the earlier misdiagnosis of the server subprocess). The build script now writes a `server/package.json` listing every runtime dependency at its declared range — the server's, the extension's (`vscode-languageclient`), and the packages `dist/index.cjs` leaves external (derived by scanning the bundle) — runs one `npm install`, and refuses to package unless each of them resolves from the bundle. `extension.ts` reports a descriptive error if the client still cannot load.

### Missing

- [ ] **No extension tests** — `"test": "echo 'No tests yet'"`. There are zero automated tests verifying that the extension activates, the language server starts, commands register, or LSP features work.
- [ ] **No end-to-end install verification** — The build script (`scripts/build-vscode-extension.ts`) packages a `.vsix` but does not verify that it works when installed. The packaging was never tested until 2026-04-08 and multiple dependency resolution issues were discovered. The render-pipeline unification (2026-04-21) did a manual install-verify for the preview webview; no automated gate yet.
- [ ] **No automated render-channel parity for VS Code** — `tests/render-channel-parity.test.ts` diffs CLI string output vs. playground DOM output; VS Code uses the same shared tree + `mountInto` adapter as the playground, so it is covered indirectly, but there is no test that drives the `preview.ts` entry point end-to-end.

### Known Gaps

- [ ] Language file icons (`icons/pathogen-light.svg`, `icons/pathogen-dark.svg`) are referenced but don't exist (removed from package.json to prevent errors)
- [ ] No bundling (esbuild) — the extension ships raw `node_modules/` which is fragile and bloated; vsce warns about this
- [x] ~~Snippet count in this doc says "18 entries"~~ — the doc no longer hardcodes a count that was wrong twice (18, then 27; it is 35 as of 2026-09)
- [ ] No automated TextMate tokenization test. `test-fixtures/all-syntax.pathogen` is guaranteed to CONTAIN every construct and to compile (`tests/all-syntax-fixture.test.ts`), but whether the TextMate grammar scopes each one correctly is still checked by eye. A `vscode-textmate` + `vscode-oniguruma` test over the same fixture would close this

## Development Lifecycle

The VS Code extension follows the same quality standard as the rest of the project:

1. **Verify the problem** — Before changing extension code, reproduce the issue by installing the `.vsix` and testing in VS Code, not just by reading source.
2. **Build and install** — `npm run build:vscode:install` builds everything and installs the `.vsix`.
3. **End-to-end verify** — After installing, reload VS Code and verify:
   - Extension activates (check Extension Host output for errors)
   - "Pathogen Language Server" appears in the Output dropdown
   - Completions, hover, diagnostics work on a `.pathogen` file
   - Preview command opens and renders; pan/zoom (wheel, drag, pinch) and zoom-fit work
4. **No dead features** — Do not register commands, menu items, or UI that don't work. If a feature isn't ready, don't expose it to users.
5. **Full test suite** — Run `npm run test:run` from the project root before committing.
