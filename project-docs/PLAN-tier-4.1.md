# Tier 4.1: CSS Relative Color Syntax for CSSVar-backed Colors

## Problem

`Color(CSSVar('--base', '#cc6683')).lighten(0.2)` currently outputs a baked hex value (`#ffa4c1`). Changing `--base` at render time via the CSS Variables panel only updates direct `var()` references — derived colors don't propagate.

## Goal

Color methods on CSSVar-backed Colors should output CSS relative color expressions that the browser evaluates at render time, so changing `--base` propagates to all derived colors.

## CSS Relative Color Syntax

Modern CSS can derive colors from existing ones:

```css
/* Current output (compile-time, static) */
fill: #ffa4c1;

/* Target output (render-time, reactive) */
fill: oklch(from var(--base, #cc6683) calc(l + 0.2) c h);
```

## Method → CSS Expression Mapping

| Method | OKLCH Math | CSS Expression |
|--------|-----------|----------------|
| `.lighten(n)` | `L + n` | `oklch(from VAR calc(l + n) c h)` |
| `.darken(n)` | `L - n` | `oklch(from VAR calc(l - n) c h)` |
| `.saturate(f)` | `C * f` | `oklch(from VAR l calc(c * f) h)` |
| `.desaturate(f)` | `C * f` | `oklch(from VAR l calc(c * f) h)` |
| `.alpha(a)` | `alpha = a` | `oklch(from VAR l c h / a)` |
| `.hueShift(d)` | `H + d` | `oklch(from VAR l c calc(h + d))` |
| `.complement()` | `H + 180` | `oklch(from VAR l c calc(h + 180))` |
| `.mix(c2, t)` | interpolation | `color-mix(in oklch, VAR, c2 calc(t * 100)%)` |

Where `VAR` = `var(--base, #cc6683)` (the original CSSVar reference with fallback).

## Design: Dual Representation (Option B)

Keep computing OKLCH as today (for `.lightness`, `.hex`, etc. property access), but add a `cssExpr` field that carries the CSS expression string.

```typescript
interface ColorValue {
  type: 'ColorValue';
  oklch: OKLCH;                         // always computed (for properties)
  cssVar?: { varName: string; fallback: string };  // direct CSSVar backing
  cssExpr?: string;                     // CSS relative color expression
}
```

### Flow

1. `Color(CSSVar('--base', '#cc6683'))` → `{ oklch: {...}, cssVar: { varName: '--base', fallback: '#cc6683' } }`
2. `.lighten(0.2)` on a CSSVar-backed Color → `{ oklch: lighten(src.oklch, 0.2), cssExpr: 'oklch(from var(--base, #cc6683) calc(l + 0.2) c h)' }`
3. `.lighten(0.2).hueShift(90)` → `{ oklch: hueShift(lighten(...), 90), cssExpr: 'oklch(from oklch(from var(--base, #cc6683) calc(l + 0.2) c h) l c calc(h + 90))' }`
4. Style serialization: if `cssExpr` exists, output it; otherwise fall back to `oklchToCSS(oklch)`

### Key: methods strip `cssVar` and set `cssExpr`

- Direct use of a CSSVar-backed Color in a style → `var(--base, #cc6683)` (existing behavior)
- Method call on a CSSVar-backed Color → computed OKLCH + CSS expression string
- Method call on a Color without `cssVar`/`cssExpr` → plain OKLCH (existing behavior)
- Method call on a Color with `cssExpr` → nested CSS expression (chaining)

## Implementation

### Step 1: CSS expression generator (`src/color.ts`)

Add a function per method that takes a CSS source expression and returns the relative color expression:

```typescript
export function lightenCSS(source: string, amount: number): string {
  return `oklch(from ${source} calc(l + ${amount}) c h)`;
}
// ... same pattern for darken, saturate, hueShift, alpha, etc.
export function mixCSS(source1: string, source2: string, ratio: number): string {
  return `color-mix(in oklch, ${source1}, ${source2} ${Math.round(ratio * 100)}%)`;
}
```

### Step 2: Update Color method handlers (`src/evaluator/index.ts` + `annotated.ts`)

In each of the 8 method cases, check if `obj.cssVar` or `obj.cssExpr` exists. If so, compute the CSS expression alongside the OKLCH value:

```typescript
case 'lighten': {
  const amount = evaluateExpression(expr.args[0], scope);
  const newOklch = lighten(obj.oklch, amount);
  const cssExpr = obj.cssExpr || obj.cssVar
    ? lightenCSS(obj.cssExpr || `var(${obj.cssVar.varName}, ${obj.cssVar.fallback})`, amount)
    : undefined;
  return { type: 'ColorValue', oklch: newOklch, cssExpr };
}
```

### Step 3: Update style serialization (both evaluators)

```typescript
} else if (isColorValue(evaluated)) {
  if (evaluated.cssExpr) {
    resolvedValue = evaluated.cssExpr;
  } else if (evaluated.cssVar) {
    resolvedValue = `var(${evaluated.cssVar.varName}, ${oklchToCSS(evaluated.oklch)})`;
  } else {
    resolvedValue = oklchToCSS(evaluated.oklch);
  }
}
```

### Step 4: Update tests (`tests/cssvar.test.ts`)

- Existing `Color(CSSVar(...)).lighten()` test → expect CSS expression
- Add tests for each method producing correct CSS syntax
- Add chaining test: `.lighten().hueShift()` nests correctly
- Add test that non-CSSVar Colors still produce baked values

### Step 5: Storybook verification

Use the color swatch example — changing `--base-color` in the CSS var panel should update all derived swatches in real time.

## Files Changed

| File | Change |
|------|--------|
| `src/color.ts` | Add 8 `*CSS()` expression generator functions |
| `src/evaluator/index.ts` | Update 8 method handlers + style serialization |
| `src/evaluator/annotated.ts` | Mirror changes from index.ts |
| `tests/cssvar.test.ts` | Update + add tests for CSS expression output |

## Browser Compatibility

- CSS `oklch()`: Chrome 111+, Safari 15.4+, Firefox 113+
- CSS relative color syntax (`from`): Chrome 119+, Safari 16.4+, Firefox 128+
- CSS `color-mix()`: Chrome 111+, Safari 16.2+, Firefox 113+

All widely supported in 2025+ browsers. Fallback: the computed OKLCH hex is always available as a graceful degradation value.

## Clamping Considerations

The compile-time functions clamp values (L to 0–1, C to 0–0.4, H wraps 0–360). CSS `calc()` doesn't clamp — the browser handles gamut mapping. This means CSS-derived colors might differ very slightly from compile-time computed ones at extreme values, but this is acceptable since the CSS output goes through the browser's own OKLCH gamut mapping.

## Scope Estimate

Small-medium: ~8 expression generators + ~16 method handler updates (8 per evaluator) + style serializer update + tests. The pattern is repetitive across methods. No parser changes needed.
