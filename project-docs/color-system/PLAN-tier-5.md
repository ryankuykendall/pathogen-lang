# Tier 5: CSS @property Declarations + light-dark()

## Context

CSSVar-backed Colors (`Color(CSSVar('--base', '#e63946'))`) currently output `var()` references and CSS relative color expressions (`oklch(from var(...) ...)`), but the CSS custom properties are **untyped**. Without `@property` registration, browsers treat them as opaque strings — they can't interpolate them in transitions or animations.

Tier 5 adds automatic `@property` declaration collection so that exported SVGs include typed CSS custom property registrations, enabling smooth color transitions/animations when consumers animate the variables. Also adds `Color.lightDark()` for theme-aware colors.

## Feature 1: Automatic @property Collection

### How It Works

When `Color(CSSVar('--name', fallback))` is evaluated, the compiler automatically:
1. Collects a `@property` declaration: `{ name, syntax: '<color>', inherits: true, initialValue }`
2. Includes all collected declarations in `CompileResult.cssProperties`
3. CLI emits them as a `<style>` block in SVG output
4. Playground injects them into the preview SVG

Only Color-typed CSSVars get `@property` — plain `CSSVar('--width', 2)` does not. Dedup by varName (first occurrence wins).

### SVG Output

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 700" width="600" height="700">
  <style>
    @property --base-color {
      syntax: "<color>";
      inherits: true;
      initial-value: #e63946;
    }
    @property --accent-color {
      syntax: "<color>";
      inherits: true;
      initial-value: #457b9d;
    }
  </style>
  <defs>...</defs>
  <path fill="var(--base-color, #e63946)" .../>
</svg>
```

## Feature 2: Color.lightDark()

### How It Works

```
let fg = Color.lightDark(Color('#333'), Color('#eee'));
// Style output: light-dark(#333333, #eeeeee)

let fg = Color.lightDark(
  Color(CSSVar('--fg-light', '#333')),
  Color(CSSVar('--fg-dark', '#eee'))
);
// Style output: light-dark(var(--fg-light, #333333), var(--fg-dark, #eeeeee))
```

- Both arguments must be Colors
- At compile time, `.hex`, `.lightness`, etc. resolve to the **light** variant
- In style blocks, outputs `light-dark(lightCSS, darkCSS)`
- Method calls on a light-dark color lose the light-dark semantics (operate on light variant only)

## Implementation Steps

### Step 1: Documentation (`docs/color.md`)

Add two new sections:
- **@property Declarations** — explain automatic collection from `Color(CSSVar(...))`
- **Color.lightDark(light, dark)** — under Static Methods

### Step 2: Failing Tests

| File | Tests |
|------|-------|
| `tests/cssvar.test.ts` | `@property declarations` describe block: collection from Color(CSSVar(...)), dedup, multiple vars, plain CSSVar excluded, empty when no CSSVars |
| `tests/color.test.ts` | `Color.lightDark()` describe block: returns Color, resolves to light variant, emits light-dark() in styles, CSSVar-backed variants, mixed variants, error cases, log display |
| `tests/cli.test.ts` | SVG output includes `<style>` with @property; omits when no CSSVar Colors |

### Step 3: Data Structures (`src/evaluator/index.ts`)

Add near existing `MaskOutput`/`ClipPathOutput` (~line 357):

```typescript
export interface CSSPropertyDeclaration {
  name: string;          // '--base-color'
  syntax: string;        // '<color>'
  inherits: boolean;     // true
  initialValue: string;  // '#e63946'
}
```

Add `cssProperties: Map<string, CSSPropertyDeclaration>` to `EvaluationState` (~line 436). Initialize in both `evaluate()` and `evaluateWithContext()`.

Add `lightDark?: { lightCSS: string; darkCSS: string }` to `ColorValue` interface.

### Step 4: @property Collection Point (`src/evaluator/index.ts`)

In the `Color()` constructor handler (~line 2496), when processing a CSSVar argument, **before** returning the ColorValue:

```typescript
if (!scope.evalState.cssProperties.has(arg.varName)) {
  scope.evalState.cssProperties.set(arg.varName, {
    name: arg.varName, syntax: '<color>', inherits: true,
    initialValue: oklchToCSS(oklch),
  });
}
```

### Step 5: CompileResult + Exports

- Add `cssProperties: CSSPropertyDeclaration[]` to `CompileResult` and `EvaluateWithContextResult`
- Extract from `evalState.cssProperties` in `buildCompileResult()`
- Export `CSSPropertyDeclaration` type from `src/index.ts`

### Step 6: Color.lightDark() Static Method (`src/evaluator/index.ts`)

Add `'lightDark'` case in ColorNamespace method handler (~line 1818):
- Validate 2 Color arguments
- Build CSS strings for both variants (respecting cssExpr/cssVar/plain)
- Return ColorValue with `oklch: light.oklch` and `lightDark: { lightCSS, darkCSS }`

### Step 7: Style Serialization (`src/evaluator/index.ts`)

Update style resolution (~line 695) — check `lightDark` first:

```typescript
if (evaluated.lightDark) {
  resolvedValue = `light-dark(${evaluated.lightDark.lightCSS}, ${evaluated.lightDark.darkCSS})`;
} else if (evaluated.cssExpr) { ... }
```

Update `valueToString()` for log/template display.

### Step 8: CLI `<style>` Block (`src/cli.ts`)

In `generateSvg()`, build a `<style>` section from `result.cssProperties` and insert as first child of `<svg>` (before `<defs>`).

### Step 9: Playground Integration

| File | Change |
|------|--------|
| `playground/components/workspace-view.js` | Pass `cssProperties` in `defsData` to preview pane |
| `playground/components/svg-preview-pane.js` | In `setLayersWithTiming()`, create/update a `<style data-css-properties>` element inside the preview SVG with @property rules |

### Step 10: Annotated Evaluator (`src/evaluator/annotated.ts`)

Mirror the @property collection and lightDark handling from the main evaluator to keep annotated output in sync.

## Files Changed

| File | Change |
|------|--------|
| `docs/color.md` | Add @property and Color.lightDark() documentation |
| `tests/cssvar.test.ts` | @property declaration tests |
| `tests/color.test.ts` | Color.lightDark() tests |
| `tests/cli.test.ts` | SVG `<style>` output tests |
| `src/evaluator/index.ts` | CSSPropertyDeclaration type, collection, lightDark, style serialization, CompileResult |
| `src/evaluator/annotated.ts` | Mirror @property collection + lightDark support |
| `src/index.ts` | Export CSSPropertyDeclaration type |
| `src/cli.ts` | Emit `<style>` block with @property in SVG output |
| `playground/components/workspace-view.js` | Pass cssProperties to preview pane |
| `playground/components/svg-preview-pane.js` | Inject @property `<style>` into preview SVG |

## Verification

1. `npm run test:run` → all tests pass including new @property + lightDark tests
2. `npx tsx src/cli.ts --src=tests/tmp/swatches.svg-path --output-svg-file=/tmp/test.svg ...` → SVG includes `<style>` block with `@property --base-color` and `@property --accent-color`
3. Open SVG in browser → colors render correctly, `@property` declarations visible in DevTools
4. Playground: paste swatch example → CSS var panel appears, changing colors transitions smoothly (if consumer adds CSS `transition`)
5. `npm run build` → no build errors
