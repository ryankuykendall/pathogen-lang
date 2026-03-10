# Phase 2: Leaf Node Migration — Complete

## Files migrated (12 total)

### Shared components (5)
| File | Key type additions |
|---|---|
| `components/shared/copy-button.ts` | `_dynamicText: string \| undefined`, typed DOM queries with `as HTMLButtonElement` |
| `components/shared/control-group.ts` | Minimal — return types on lifecycle methods |
| `components/shared/error-panel.ts` | `_message: string`, typed `attributeChangedCallback` params |
| `components/shared/log-entry.ts` | `import type { LogEntry as LogEntryData }` to avoid name conflict, `_data: LogEntryData \| null`, `unknown` for recursive value rendering |
| `components/shared/theme-toggle.ts` | `ThemePreference` type alias, typed `_mediaQuery`, icons/titles as `Record<ThemePreference, string>` |

### State (1)
| File | Key type additions |
|---|---|
| `state/store.ts` | Generic `createStore<T extends Record<string, unknown>>()`, `StoreCallback` type, typed `listeners` Map |

### Services (2)
| File | Key type additions |
|---|---|
| `services/user-id.ts` | `isValidId(id: string \| null): boolean`, return types on exports |
| `services/api.ts` | `ApiError` interface, typed `apiRequest`, parameter types on all API methods |

### Utilities (4)
| File | Key type additions |
|---|---|
| `utils/nano-id.ts` | `generateNanoId(size?: number): string` — minimal |
| `utils/theme.ts` | `ThemePreference`, `ActiveTheme`, `ThemeState`, `ThemeListener` types, class property types |
| `utils/url-state.ts` | `URLState` interface, `StoreLike` interface for store param |
| `utils/examples.ts` | `Record<string, string>` type on examples — essentially a rename |

## Additional changes

- `vitest.config.ts` — Added `jsTsFallback()` Vite plugin to resolve `.js` imports to `.ts` files during migration period. Required because remaining `.js` files (e.g., `router.js`) may import from modules now renamed to `.ts`.

## Verification
- `npm run build:playground` — 72 files, ~37ms
- `npm run typecheck:playground` — Zero errors
- `npm run test:run` — All 1501 tests pass
- esbuild correctly transpiles `.ts` → `.js` in `public/pathogen/`
- No stale `.js` duplicates of migrated files remain

## Migration progress
- **12 of 72** playground files now TypeScript (~17%)
- 60 remaining `.js` files for Phases 3-5
