# Features Added for the Radial Bar Chart Blog Post

## Language Features

### 1. Ternary Expressions (`condition ? trueVal : falseVal`)
- **Files**: `src/parser/ast.ts`, `src/parser/index.ts`, `src/evaluator/index.ts`, `src/evaluator/annotated.ts`
- **What**: Ternary operator as an expression (not statement), right-associative, lower precedence than `||`
- **Why**: Conditional values without verbose `if/else` blocks — e.g., `let flag = x > 5 ? 1 : 0`

### 2. Function Return Values for PathBlocks, StyleBlocks, TextBlocks
- **Files**: Already worked — just confirmed and tested
- **What**: `fn makeShape() { return @{ h 50 v 30 z }; }` — functions can return block values
- **Why**: Enables composable shape functions — define geometry once, apply `.fillet()`, `.drawTo()`, etc.

### 3. `radialWedge()` Stdlib Function
- **File**: `src/stdlib/path.ts`
- **Signature**: `radialWedge(innerR, outerR, fromAngle, toAngle, cornerR)`
- **What**: Annular sector with rounded corners and graceful degradation. All relative commands. Center at cursor position.
- **Why**: The core shape for radial bar charts. Handles narrow ends by analytically reducing corner radius to fit.
- **Key design**: `fromAngle`/`toAngle` (matches conic gradient convention), no `cx`/`cy` (center is cursor), no `M` emitted (composable in PathBlocks)

### 4. Fillet for Arc-Line Transitions
- **File**: `src/evaluator/path-transforms.ts`
- **What**: Extended `.fillet()` to handle arc↔line corners (previously only handled line↔line)
- **Why**: PathBlocks with `tangentArc` + `tangentLine` now get properly rounded corners

### 5. `TextBlock.radialProject()`
- **File**: `src/evaluator/index.ts`
- **Signature**: `.radialProject(cx, cy, angle, distance, anchor?, autoFlip?, verticalAlign?)`
- **What**: Projects text along a radial direction with automatic rotation, hemisphere flip, text-anchor, and vertical alignment
- **Why**: Eliminates 6+ TextLayers and manual hemisphere branching for radial label placement

### 6. `VerticalAnchor` Enum
- **File**: `src/evaluator/index.ts`
- **Members**: `Descender`, `Baseline`, `Midline`, `CapHeight`
- **What**: Controls which vertical font metric aligns with the projected point
- **Why**: Radial labels need their visual center (midline) — not baseline — aligned with bar angles

### 7. Stdlib Helpers
- **File**: `src/stdlib/math.ts`
- **Functions**: `polarX(cx, angle, r)`, `polarY(cy, angle, r)`, `normalizeAngle(angle)`
- **Why**: Reduces repetitive `calc(cx + cos(angle) * radius)` boilerplate in radial layouts

### 8. Per-Element Text Styles in SVG Output
- **File**: `src/cli.ts`
- **What**: Text element styles (like `text-anchor`) now merge with layer styles in SVG rendering
- **Why**: `radialProject` sets per-element `text-anchor` based on hemisphere — needed for correct rendering

## Documented Bugs (Not Fixed Yet)

### XOR Arc Tangent Bug
- **Doc**: `project-docs/radial-bar-chart/xor-arc-tangent-bug.md`
- **What**: Boolean XOR produces diagonal artifacts with arc-heavy paths
- **Root cause**: Missing arc case in `tangentAtEnd()`/`tangentAtStart()` in `boolean-ops.ts`

### Text Highlight Measurement
- **Doc**: `project-docs/radial-bar-chart/text-highlight-measurement-bug.md`
- **What**: Cannot precisely position background rectangles behind inline text
- **Root cause**: Compile-time measurement uses different font than browser rendering

## Blog Post Samples

All in `website/blog/samples/post16/`:
- `annular-sector.pathogen` — Core geometry with schematic annotations
- `radial-bar.pathogen` — Value-to-radius mapping with two bars
- `category-layout.pathogen` — 8 categories arranged radially
- `radial-labels.pathogen` — Rotated labels with `radialProject`
- `radial-chart-complete.pathogen` — Full 26-category chart with all features
- `summary-bars.pathogen` — Horizontal bar chart with arc-positioned dots
