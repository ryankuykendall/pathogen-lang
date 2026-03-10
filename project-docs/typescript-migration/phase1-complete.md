# Phase 1: esbuild Pipeline Infrastructure — Complete

## What was done

### Files created
- `scripts/build-playground.ts` — esbuild transpiler script (72 files in ~40ms)
- `playground/tsconfig.json` — Type-checking config (`noEmit: true`, `strict: false`, `allowJs: true`)
- `playground/types/global.d.ts` — `window.SvgPathExtended` API surface declaration
- `playground/types/compiler.d.ts` — Playground-local copies of compiler output types (LayerOutput, GradientOutput, CompileResult, etc.)
- `playground/types/store.d.ts` — `StoreState` interface, `Store` interface, `StoreKey`/`StoreCallback` types
- `playground/types/assets.d.ts` — CSS module import declaration (`*.css` → string)

### Files modified
- `scripts/build-website.ts` — Replaced `copyDir` loop (lines 49-71) with `buildPlayground()` call; renamed `playgroundDest` → `pathogenDest`
- `package.json` — Added `build:playground`, `dev:playground`, `typecheck:playground` scripts; added `esbuild` and `@webgpu/types` devDeps
- `eslint.config.mjs` — Added `playground/**/*.ts` override block with TypeScript parser pointing to `playground/tsconfig.json`; added `playground/types/**` to ignores

### No changes needed
- `.gitignore` — `public/` was already ignored, covering `public/pathogen/`

## Verification results
- `npm run build:playground` — 72 files in ~40ms
- `npm run build:website` — Full pipeline works end-to-end
- `npm run typecheck:playground` — Clean, no errors
- `npm run test:run` — All 1501 tests pass
- `npx eslint scripts/build-playground.ts` — Clean lint
- Output file diff: Source `.js` files and compiled output are identical (esbuild passes JS through unchanged)

## Key design decisions
- **`outbase: PLAYGROUND`** — esbuild preserves directory structure relative to `playground/`, outputting to `public/pathogen/`
- **CLI guard** — `build-playground.ts` guards `program.parse()` with `isDirectExecution` check to prevent double-execution when imported by `build-website.ts`
- **Type declarations are local** — Compiler types are redeclared in `playground/types/compiler.d.ts` rather than importing from `dist/index.d.ts`, so playground type-checking doesn't depend on a library build
- **`strict: false`, `checkJs: false`** — Start permissive; tighten progressively in Phase 6
