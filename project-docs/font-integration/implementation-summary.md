# opentype.js Integration: Implementation Summary

## What Was Implemented (Phases 1-3)

### Phase 1: Font Provider Foundation

**New Files:**
- `src/evaluator/font-provider.ts` — opentype.js wrapper with lazy loading, registry management, metrics, and glyph conversion

**Modified Files:**
- `src/evaluator/types.ts` — Added `FontData`, `FontRegistry`, `PathBlockNamespace` interfaces; extended `EvaluationState` with `fontRegistry`
- `src/parser/ast.ts` — Added `FontDirective` AST node
- `src/parser/index.ts` — Added `@font` directive parser (supports `@font "family" [weight]`)
- `src/evaluator/font-metrics.ts` — `estimateTextBoundingBox()`, `estimateTextWidth()`, `estimateLineHeight()` now accept optional `FontRegistry` for precise metrics
- `src/evaluator/index.ts` — Wire fontRegistry through all 12 `estimateTextBoundingBox()` call sites; `evaluate()` accepts `fonts` in options; `FontDirective` statement handler (no-op)
- `src/evaluator/annotated.ts` — Mirror all changes from index.ts
- `src/index.ts` — Export new types (`FontData`, `FontRegistry`, `FontDirective`) and functions (`createFontRegistry`, `addFont`, `getFontFromRegistry`)
- `src/worker.ts` — Accept `fontBuffers` in `WorkerRequest`, reconstruct `FontRegistry` from transferred buffers
- `src/cli.ts` — Scan AST for `@font` directives, load local fonts (file paths + system font directory scan), pass `FontRegistry` to `compile()`

**Dependencies:**
- `opentype.js` (regular dependency, ~55KB gzipped)
- `@types/opentype.js` (dev dependency)

### Phase 2: PathBlock.fromGlyph()

**Evaluator Changes (index.ts + annotated.ts):**
- `PathBlockNamespace` sentinel returned by `lookupVariable("PathBlock")`
- `PathBlock.fromGlyph(text, styles)` method dispatch — converts text to array of PathBlockValues
- Each glyph PathBlockValue has `.advanceWidth` property for positioning
- `.contours` property decomposes multi-contour glyphs (e.g., "O" → outer + inner rings)
- Proper error messages for missing registry, missing font, missing font-family

### Phase 3: Playground Integration

**New Files:**
- `playground/services/font-loader.ts` — Google Fonts binary fetching + caching (fetch CSS → extract TTF URL → fetch binary → cache)

**Modified Files:**
- `playground/services/compiler-worker.ts` — Auto-resolves font binaries before compilation; sends via Transferable for zero-copy
- `playground/types/compiler.d.ts` — Added `FontData`, `FontRegistry`, `CompileOptions.fonts`

## Test Results

- 29 new tests in `tests/font-provider.test.ts`
- 1754 existing tests unchanged
- **1783 total tests, all passing**
- Test fixture: `tests/fixtures/fonts/Inter-Regular.ttf`

## What's NOT in Scope (Future Work)

- **Phase 4**: CLI Google Fonts auto-download + disk caching
- **Phase 5**: Playground font upload UI (drag-drop .ttf/.otf)

## Key Design Decisions

1. **FontRegistry as pre-step**: Async font loading happens before synchronous `compile()` call. Each host environment (CLI, playground, tests) builds the registry.
2. **opentype.js lazy loading via `require()`**: Avoids CJS/ESM interop issues with Vitest; zero overhead when fonts aren't used.
3. **Fallback preserved**: No `FontRegistry` → all existing behavior unchanged. Missing font in registry → built-in tables + warning.
4. **`@font` as parser-level syntax**: Consistent with parser-first convention. Evaluator ignores it — it's declarative metadata.
