# TypeScript & Linting Hardening: Audit + Primer

**Date:** 2026-03-09
**Status:** Implementation in progress

## Executive Summary

The pathogen-lang codebase has grown rapidly: 18 TypeScript files (~14,300 LOC) in the compiler, 69 JavaScript files (~34,700 LOC) in the playground, 14 TypeScript scripts, and a Cloudflare Worker. There is no linting, no formatting enforcement, and no stricter-than-baseline tsconfig flags. This document details the audit findings and recommendations for hardening the TypeScript configuration, adding ESLint with eslint-config-airbnb-extended, and enforcing Prettier formatting.

---

## Audit Findings

### Compiler (`src/`) — 18 TypeScript files, ~14,300 LOC

**Strengths:**
- `"strict": true` already enabled in tsconfig.json (baseline strict mode)
- Zero `@ts-ignore` / `@ts-expect-error` annotations anywhere in the codebase
- Only 3 `any` usages (all in `cli.ts` for Puppeteer `page.evaluate` callbacks — justified)
- Clean separation of concerns: parser → evaluator → stdlib → CLI
- `parser/ast.ts` is a pure types file (353 LOC) — excellent pattern
- Consistent style throughout: 2-space indent, single quotes, semicolons, camelCase
- All imports verified used (no dead imports detected)

**Issues Found:**

1. **Interface/implementation mixing** — `evaluator/index.ts` has ~50 exported interfaces (lines 54–637) interleaved at the top of 5,302 lines of implementation. These are public API types consumed by the playground, CLI, tests, and library users. They should be in a dedicated `types.ts` file.

2. **Duplicated types in annotated.ts** — `annotated.ts` re-declares 15+ interfaces (SVGFragmentValue, GradientValue, PatternValue, ColorValue, ObjectValue, ArrayValue, CSSVarValue, PathBlockValue, ProjectedPathValue, etc.) that are structurally identical to those in `evaluator/index.ts`. Comment on line 55: `// Value types (same as main evaluator)`. These should import from a shared types file.

3. **Missing strict tsconfig flags** — Beyond `"strict": true`, the following are not enabled:
   - `noUnusedLocals` — catch unused variables/imports at compile time
   - `noUnusedParameters` — catch unused function parameters
   - `noFallthroughCasesInSwitch` — prevent switch fallthrough bugs
   - `noImplicitReturns` — ensure all code paths return a value
   - `forceConsistentCasingInFileNames` — prevent case-sensitivity bugs across OS

4. **No linting or formatting config** — Prettier 3.8.1 is installed as a devDependency but unconfigured. No `.prettierrc`, `.eslintrc`, or `.editorconfig` files exist.

### Playground (`playground/`) — 69 JavaScript files, ~34,700 LOC

- Entirely untyped vanilla JavaScript
- Shadow DOM web components with consistent lifecycle patterns
- Minimal JSDoc (~10% of components, ~85% of GPU services)
- Store uses magic string keys (no type safety on subscriptions)
- CustomEvent detail payloads undocumented
- No tests for any playground code
- Full TypeScript migration estimated at 200–300 hours — **not recommended now**
- JavaScript files can still benefit from ESLint rules (no-unused-vars, import ordering, etc.)

### Scripts (`scripts/`) — 14 TypeScript files

- All use Commander pattern with tsx execution
- Consistent style matching compiler conventions
- Would benefit from same linting rules as compiler

---

## Recommendations

### 1. tsconfig Hardening

Enable 5 additional strict flags:

```json
{
  "compilerOptions": {
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "noImplicitReturns": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

**Impact:** Likely 20–50 unused parameter warnings to fix (prefix with `_`). No expected behavior changes.

### 2. ESLint with eslint-config-airbnb-extended

- **Package:** eslint-config-airbnb-extended v3.0.1 (Jan 2026)
- **Config format:** ESLint 9+ flat config (`eslint.config.js`)
- **TypeScript support:** First-class via typescript-eslint
- **Scope:** `src/**/*.ts`, `scripts/**/*.ts`, `playground/**/*.js`
- **Key rules:** Import ordering, no-unused-vars, consistent returns, no console (except CLI/scripts)
- **Disabled:** React rules (no React in this project)
- **Integration:** eslint-config-prettier to avoid formatting conflicts

### 3. Prettier Configuration

Match existing codebase conventions:

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "tabWidth": 2,
  "printWidth": 120,
  "arrowParens": "always",
  "endOfLine": "lf"
}
```

### 4. Interface Extraction

Create `src/evaluator/types.ts` containing all ~50 exported interfaces from `evaluator/index.ts`. Update `annotated.ts` to import shared types instead of re-declaring them.

### 5. npm Scripts

```json
{
  "lint": "eslint .",
  "lint:fix": "eslint . --fix",
  "format": "prettier --write .",
  "format:check": "prettier --check ."
}
```

---

## What This Plan Does NOT Include

- **Full playground TypeScript migration** — Too large (200–300 hours). Recommend as separate future initiative.
- **Pre-commit hooks (husky/lint-staged)** — Can be added later; keeping initial scope focused.
- **Playground tests** — Orthogonal to linting; separate effort.
- **CI integration** — Can be added once local tooling is stable.

---

## Verification Checklist

- [ ] `npx tsc --noEmit` passes with new strict flags
- [ ] `npm run lint` passes cleanly
- [ ] `npm run format:check` passes (Prettier conformance)
- [ ] `npm run build` succeeds
- [ ] `npm run test:run` — all tests pass
- [ ] Types extracted to `evaluator/types.ts` are correctly imported everywhere
