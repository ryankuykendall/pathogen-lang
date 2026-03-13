# Color Literals Implementation Summary

## Phases Completed

### Phase 1: Hex Color Literals + Percent Suffix + Playground Fix
- `ColorLiteral` AST node added to `ast.ts`
- Hex literal parser (`#cc0000`, `#f00`, `#cc000080`, `#f008`) in `parser/index.ts`
- `%` suffix on numbers: `20%` → `0.2` (disambiguation: no space = percent, spaces = modulus)
- 4-digit hex (`#f008`) support in `color.ts`
- `Color()` pass-through for ColorValue arguments
- Playground color picker quoting bug fixed (range now excludes quotes)
- Bare hex detection in playground color picker
- `convertAngleUnit` renamed to `convertUnitSuffix` with `%` case
- `hasAngleUnit` updated to exclude `%` from angle unit checking
- Style block raw preservation: `ColorLiteral` in style block context preserves raw value (no OKLCH round-trip)
- Parenthesized expressions now support postfix (`.method()`, `.property`, `[index]`)

### Phase 2: CSS Color Function Literals
- `cssColorLiteral` parser with raw capture for 9 CSS color functions
- Functions: `rgb`, `rgba`, `hsl`, `hsla`, `hwb`, `lab`, `lch`, `oklab`, `oklch`
- Raw capture (`/[^)]*/`) avoids conflicts with `%` and `/` inside parens
- CSS color function detection in playground color picker
- CSS function names effectively reserved (shadow user-defined functions)

### Phase 3: Extended Color Spaces
- `hwb()` → HWB to sRGB to OKLCH conversion
- `oklab()` → OKLab to OKLCH (polar conversion)
- `lab()` → CIE Lab to XYZ (D65) to linear sRGB to OKLab to OKLCH
- `lch()` → CIE LCH to CIE Lab to XYZ to linear sRGB to OKLab to OKLCH

## Files Changed

| File | Changes |
|------|---------|
| `src/parser/ast.ts` | `ColorLiteral` interface + `Expression` union + `%` in NumberLiteral unit |
| `src/parser/index.ts` | `colorLiteral`, `cssColorLiteral` parsers, `%` in number regex, postfix on parens |
| `src/evaluator/index.ts` | `ColorLiteral` case, `convertUnitSuffix`, `Color()` pass-through, style block raw preservation |
| `src/evaluator/annotated.ts` | Same evaluator changes |
| `src/color.ts` | 4-digit hex, HWB/Lab/LCH/OKLab parsing and conversion |
| `playground/utils/cm-color-picker.ts` | Quote fix, bare hex detection, CSS color function detection |
| `docs/color.md` | Color Literals, CSS Color Function Literals sections |
| `docs/syntax.md` | Color Literals, Percent Suffix sections |

## Test Coverage
- 39 new tests added across parser, evaluator, color, and errors test files
- All 1653 tests passing (16 test files)
