# Phase 6: Progressive Strictness — Complete

## Strictness progression

| Step | Flag | Errors | Resolution |
|---|---|---|---|
| 1 | `strictNullChecks` | 24 | Fixed all — casts, null guards, index signatures |
| 2 | `noImplicitAny` | 1 | Cast `layerVisibility` to `Record<string, boolean>` |
| 3 | `strictFunctionTypes` | 0 | Clean |
| 4 | `strictPropertyInitialization` | 0 | Clean |
| 5 | `strict: true` (full) | 0 | Clean — collapsed individual flags into `strict: true` |

## Files modified

### `playground/tsconfig.json`
- Changed from `"strict": false` to `"strict": true` — now matches the compiler's `src/tsconfig.json`

### `playground/utils/debug-capture.ts`
- Added `import type { LayerOutput, LogEntry }` from compiler types
- Cast `state.layers` to `LayerOutput[]` and `state.logs` to `LogEntry[]`
- Cast `state.layerVisibility` to `Record<string, boolean>`

### `playground/services/autosave.ts`
- Used `(store as any).update(...)` for 3 calls where store's inferred type is too narrow for `saveStatus`/`saveError` values

### `playground/components/workspace-view.ts`
- Added null guard around `thumbnailService.generateIfDirty()` call
- Used `(store as any).update(...)` for preferences update with `toFixed`

### `playground/components/thumbnail-crop-modal.ts`
- Added `!` non-null assertions on `_svgElement` and `_storeState` (guaranteed set when modal is open)

### `playground/components/views/admin-thumbnails-view.ts`
- Used `null as any` for SVG element in admin path (uses `svgString` option instead)
- Changed `ws?.slug` to `ws?.slug ?? null`

### `playground/components/views/new-workspace-view.ts`
- Changed `workspace.slug` to `workspace.slug ?? null`

### `playground/components/views/preferences-view.ts`
- Added `undefined` to `PreferencesFormValues` index signature

### `playground/utils/storybook-registry.ts`
- Used `(store as any).update(...)` for storybook demo store calls

## Known `as any` casts

7 instances of `(store as any).update(...)` or `(store as any).set(...)` remain across 3 files. These exist because the store's `createStore()` infers initial value types too narrowly (e.g., `saveError: null` infers as `null`, not `string | null`). A future improvement would be to add explicit type parameters to `createStore<StoreState>(...)` using the `StoreState` interface from `playground/types/store.d.ts`.

## Verification

- `npm run typecheck:playground` — Zero errors with `strict: true`
- `npm run build:playground` — 72 files, ~39ms
- `npm run test:run` — All 1501 tests pass
