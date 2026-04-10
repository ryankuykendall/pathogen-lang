# Plan: VS Code Developer Experience — Multi-Phase Roadmap

## Context

The VS Code extension now has a working language server with diagnostics, completions, hover, formatting, and all other language-services features. The playground has improved completion UX. This roadmap addresses everything remaining from `project-docs/developer-experience/towards-a-vscode-plugin.md` plus the preview panel at mini-workspace feature parity.

The work is organized into phases that each deliver a complete, testable improvement. Each phase should be verified end-to-end before moving to the next.

---

## Phase 1: Completion Quality — Type Inference Improvements

**Goal:** Make completions actually useful for the most common editing scenarios.

**Current state:** Type inference is regex-based, fails on method return types, callback parameters, chained expressions, and `layer()` calls.

### Deliverables

1. **Add Color instance type** to TYPE_MEMBERS — users expect `Color('#ff0000').lighten()` completions
2. **Add `layer()` to inferType** — `let ref = layer('main'); ref.` should infer LayerReference/PathLayer
3. **Add method return type mapping** — `boundingBox()` → object with `{x, y, width, height}`, `get()` → Point, `tangent()`/`normal()` → object with `{point, angle}`
4. **Add stdlib return type mapping** — `circle()`, `rect()`, `polygon()`, `star()` → PathBlock
5. **Improve scope-aware completions inside `.apply {}` blocks** — prioritize path commands and stdlib path functions

### Files
- `src/pathogen-api.ts` — Add Color instance type declaration
- `src/language-services/completion.ts` — Enhance `inferType()` and `getMembersForObject()`
- `src/language-services/completion-data.generated.ts` — Regenerate
- `tests/language-services/completion.test.ts` — Add tests for each scenario

### Verification
- Type `Color('#ff0000').` → shows `lighten`, `darken`, `alpha`, `mix`, `hueShift`, etc.
- Type `shape.boundingBox().` → shows `x`, `y`, `width`, `height`
- Type `let ref = layer('main'); ref.` → shows `apply`, `ctx`, `name`, `styles`
- Inside `.apply {}` block → `circle`, `rect`, path commands appear with priority

---

## Phase 2: Preview Panel — Compiler Integration

**Goal:** The VS Code preview panel compiles and renders Pathogen source to SVG, updating live as the user types.

**Approach:** Bundle the compiler (`dist/index.global.js`) into the webview. The extension watches for document changes, sends source to the webview via `postMessage`, the webview compiles and renders.

### Deliverables

1. **Webview HTML scaffold** — Load compiler bundle, render SVG output
2. **Extension ↔ webview communication** — `postMessage` protocol for source updates, compilation results, errors
3. **Live update on edit** — Debounced recompilation on document change (150ms)
4. **Error display in preview** — Show compilation errors inline in the preview panel
5. **ViewBox detection** — Parse `// viewBox="..."` comment from source for correct sizing

### Files
- `packages/vscode-pathogen/src/preview.ts` — Rewrite from placeholder to working implementation
- `packages/vscode-pathogen/src/extension.ts` — Register preview command (re-add with working implementation)
- `packages/vscode-pathogen/package.json` — Re-add command + menu contribution
- `scripts/build-vscode-extension.ts` — Bundle compiler into webview assets

### Verification
- Open a `.pathogen` file → `Cmd+Shift+P` → "Pathogen: Open Preview to the Side"
- Preview shows rendered SVG
- Edit code → preview updates within ~200ms
- Syntax error → preview shows error message
- `// viewBox="0 0 400 300"` → preview uses correct dimensions

---

## Phase 3: Preview Panel — Mini-Workspace Feature Parity

**Goal:** The preview panel has the same interactive features as the playground's mini-workspace.

**Approach:** Port the playground's mini-workspace, mini-preview, and inspector-panel components into the webview. They're 95% reusable — only localStorage, window.open, and local file fetch need VS Code API bridging.

### Deliverables

1. **Pan/zoom SVG preview** — Port mini-preview.ts with mouse drag panning, scroll zoom, navigator minimap
2. **Layer toggle panel** — Port layers-panel.ts with visibility toggles and color swatches
3. **CSS Variable picker** — Port cssvar-panel.ts with live color pickers for @property declarations
4. **Color palette view** — Port palette-panel.ts showing all colors used across layers
5. **VS Code theme integration** — Wire webview to follow VS Code's light/dark theme

### Components to port
- `playground/components/blog/mini-preview.ts` → webview
- `playground/components/layers-panel.ts` → webview
- `playground/components/cssvar-panel.ts` → webview
- `playground/components/palette-panel.ts` → webview
- `playground/components/inspector-panel.ts` → webview container

### Changes needed for VS Code webview
- Replace `localStorage` with `vscode.postMessage()` for state persistence
- Replace `window.open()` with VS Code command messaging
- Replace `themeManager` with VS Code theme CSS variables
- Use `asWebviewUri()` for any local asset loading

### Verification
- Preview shows pan/zoom SVG with navigator minimap
- Layers panel shows all layers with visibility toggles
- Toggling a layer hides/shows it in the preview
- CSS variable color pickers appear for `CSSVar()` usage
- Changing a color picker updates the SVG preview live
- Color palette shows all colors used in the document
- Theme follows VS Code light/dark mode

---

## Phase 4: Completion Quality — Type Flow Analysis

**Goal:** Completions work through assignment chains, method returns, and callback parameters.

### Deliverables

1. **Assignment type propagation** — `let x = y;` infers x's type from y's type
2. **Block parameter type inference** — `arr.map {|item| item.}` infers item type from array element type
3. **Destructured loop variable types** — `for ([d, i] in data)` infers d's type from data's element type
4. **Chained expression types** — `shape.offset(10).` infers PathBlock from offset's return type

### Files
- `src/language-services/completion.ts` — Build type propagation system
- `tests/language-services/completion.test.ts` — Test each scenario

### Verification
- `let bb = shape.boundingBox(); bb.` → shows `x`, `y`, `width`, `height`
- `arr.map {|item| item.}` → shows members of the array element type
- `for ([d, i] in data) { d.` → shows object property completions

---

## Phase 5: Diagnostic Quality

**Goal:** Diagnostics are precise, actionable, and don't interfere with editing.

### Deliverables

1. **Suppress transient errors during active typing** — Don't show "Missing ';'" while the user is mid-expression
2. **Better error messages for common mistakes** — "Did you mean `apply`?" when typing `bg.aply`
3. **Related information** — Link multi-location errors (e.g., "variable 'x' defined here" + "used here before assignment")
4. **Quick fixes for common diagnostics** — "Add missing semicolon", "Did you mean X?"

### Files
- `src/language-services/diagnostics.ts` — Suppress transient errors, improve messages
- `src/language-services/code-actions.ts` — Add quick fixes
- `playground/components/workspace-view.ts` — Improve error display timing (already started)

### Verification
- Typing incomplete code doesn't show errors for 600ms+
- "Missing ';'" has a one-click "Add semicolon" fix
- Misspelled identifiers suggest corrections

---

## Phase 6: Formatting Polish

**Goal:** The formatter handles all edge cases from the style guide and produces stable output.

### Deliverables

1. **Comment preservation** — Formatter round-trips comments (currently stripped by AST builder)
2. **Range formatting** — Format selection, not just whole document
3. **On-type formatting** — Auto-indent after `{`, auto-close `}`
4. **Formatter settings** — Configurable indent size, style block threshold

### Files
- `src/parser/ast-builder.ts` — Preserve comments in AST body
- `src/language-services/formatter.ts` — Range formatting, on-type formatting
- `packages/pathogen-language-server/src/server.ts` — Wire range formatting handler

### Verification
- Format a document with comments → comments preserved in correct positions
- Select a block → format selection only
- Type `{` → next line auto-indented
- VS Code settings: `pathogen.formatter.indentSize: 4` → uses 4-space indent

---

## Phase 7: Semantic Highlighting

**Goal:** Color coding that distinguishes variables from parameters, functions from methods, types from enums.

### Deliverables

1. **Enhance semantic token types** — variables, parameters, functions, methods, types, enums, properties, namespaces
2. **Modifier support** — readonly, declaration, deprecated
3. **Path command highlighting** — SVG path commands get distinct coloring
4. **Style property highlighting** — CSS property names inside `${ }` blocks

### Files
- `src/language-services/semantic-tokens.ts` — Enhance token classification
- `packages/pathogen-language-server/src/server.ts` — Already wired

### Verification
- Variables colored differently from parameters
- Path commands (M, L, C, Z) get distinct highlighting
- Enum names vs enum members colored differently
- Function definitions vs function calls distinguished

---

## Phase 8: Workspace Integration

**Goal:** The extension detects `.pathogen` files, understands project structure, and supports multi-file workflows.

### Deliverables

1. **File detection** — Auto-detect `.pathogen` files in workspace
2. **ViewBox comment completion** — Auto-insert `// viewBox="0 0 W H"` on new files
3. **@font path resolution** — Resolve font paths relative to workspace root
4. **Build task integration** — "Compile Pathogen" task that runs CLI and shows errors in Problems panel
5. **Problem matcher** — Parse CLI error output into VS Code diagnostics

### Files
- `packages/vscode-pathogen/package.json` — Add task definition, problem matcher
- `packages/vscode-pathogen/src/extension.ts` — File detection, font path resolution

### Verification
- Create a new `.pathogen` file → viewBox snippet offered
- `@font "./fonts/Inter.ttf"` → path resolves relative to workspace
- `Cmd+Shift+B` → "Compile Pathogen" task available
- CLI errors appear in Problems panel

---

## Phase 9: Advanced Refactoring

**Goal:** Safe, reliable refactoring operations.

### Deliverables

1. **Extract variable** — Select expression → extract to `let` declaration
2. **Extract function** — Select block → extract to `fn` definition
3. **Convert layer pattern** — Convert between `define` and `let` layer definitions
4. **Inline variable** — Replace variable with its value

### Files
- `src/language-services/code-actions.ts` — Add refactoring code actions
- `packages/pathogen-language-server/src/server.ts` — Wire code action handlers

### Verification
- Select `calc(x + 10)` → "Extract to variable" creates `let temp = calc(x + 10);`
- Select a for-loop body → "Extract to function" creates `fn extracted(...) { ... }`

---

## Phase 10: Inlay Hints and Code Lens

**Goal:** Subtle inline information that reduces cognitive load.

### Deliverables

1. **Parameter name hints** — Show parameter names at call sites: `circle(⌜cx⌝ 50, ⌜cy⌝ 50, ⌜r⌝ 25)`
2. **Inferred type hints** — Show inferred types: `let bb ⌜: BBox⌝ = shape.boundingBox()`
3. **Layer command count lens** — Show "3 commands" above `.apply` blocks
4. **Reference count lens** — Show "2 references" above variable declarations

### Files
- `src/language-services/inlay-hints.ts` — Already exists, enhance
- `packages/pathogen-language-server/src/server.ts` — Already wired

### Verification
- Hover-free parameter names visible at function call sites
- Type annotations appear next to variable declarations
- Code lens shows reference counts

---

## Implementation Order and Dependencies

```
Phase 1: Completion Quality (type inference)     ← No dependencies, high impact
Phase 2: Preview Panel (compiler integration)    ← No dependencies, high impact  
Phase 3: Preview Panel (mini-workspace parity)   ← Depends on Phase 2
Phase 4: Completion Quality (type flow)          ← Depends on Phase 1
Phase 5: Diagnostic Quality                      ← No dependencies
Phase 6: Formatting Polish                       ← No dependencies
Phase 7: Semantic Highlighting                   ← No dependencies
Phase 8: Workspace Integration                   ← No dependencies
Phase 9: Advanced Refactoring                    ← Depends on Phase 5
Phase 10: Inlay Hints and Code Lens              ← Depends on Phase 4
```

Phases 1, 2, 5, 6, 7, 8 can be worked on in any order. Recommended priority: **1 → 2 → 3 → 5 → 4 → 6 → 7 → 8 → 9 → 10**.

---

## Verification Standard (All Phases)

Every phase must be verified by:
1. Building the VS Code extension (`npm run build:vscode:install`) and testing in VS Code
2. Testing in the deployed playground (for shared language-services changes)
3. Running the full test suite (`npm run test:run`)
4. Testing with real user scenarios (incomplete code, mid-expression typing, large files)
