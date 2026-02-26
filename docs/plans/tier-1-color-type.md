# Tier 1: First-Class Color Type

## Status: In Progress

## Context
Add a first-class Color type with OKLCH internal representation and compile-time resolution. `Color('#e63946').lighten(0.2)` resolves to a concrete hex value.

## Dependencies
- Tier 0 (style value injection fix) — DONE

## API Surface
- Constructor: `Color('#hex')`, `Color('name')`, `Color('rgb()')`, `Color('hsl()')`, `Color('oklch()')`, `Color(L, C, H)`, `Color(L, C, H, a)`
- Methods: `.lighten()`, `.darken()`, `.saturate()`, `.desaturate()`, `.alpha()`, `.hueShift()`, `.complement()`, `.mix()`
- Properties: `.css`, `.hex`, `.oklch`, `.hsl`, `.rgb`, `.lightness`, `.chroma`, `.hue`, `.a`
- Static: `Color.mix(c1, c2, ratio)`
- Auto-conversion in style blocks

## Files
| File | Action |
|------|--------|
| `docs/color.md` | CREATE — user documentation |
| `tests/color.test.ts` | CREATE — test suite |
| `src/color.ts` | CREATE — color math module |
| `src/evaluator/index.ts` | MODIFY — 10 integration points |
| `src/evaluator/annotated.ts` | MODIFY — parallel support |
| `src/index.ts` | MODIFY — exports |
| `docs/stdlib.md` | MODIFY — cross-reference |

## Verification
- [ ] `npx vitest run tests/color.test.ts` passes
- [ ] `npm run test:run` — full suite, zero regressions
- [ ] `npm run build` — bundles correctly
