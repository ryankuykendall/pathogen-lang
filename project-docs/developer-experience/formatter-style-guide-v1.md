# Pathogen Formatter Style Guide v1

Canonical formatting rules for the Pathogen language, derived from the [formatting questionnaire](formatter-style-questionnaire-v1.md). This document is the authoritative reference for the formatter implementation, TextMate grammar snippets, and VS Code completions.

## Design Philosophy

**Expand for readability.** When in doubt, put each logical unit on its own line. The Pathogen language is designed for SVG authoring where users annotate, comment, and visually scan their code. Vertical space and consistent structure make code easier to read, navigate, and comment.

---

## 1. Indentation and Whitespace

- **2 spaces** per indent level, at all nesting depths (no cap).
- **Strip trailing whitespace** on every line (except preserving blank lines themselves).

## 2. Braces

- **Same-line** opening braces (K&R style), for all block types: `fn`, `if`, `else`, `for`, `.apply`, trailing blocks (`{|g| ...}`), `.map { ... }`.

## 3. Semicolons

| Context | Rule |
|---------|------|
| `let` declarations | Always add |
| Assignments (`=`, `[]=`, `.prop =`) | Always add |
| `return` statements | Always add |
| Expression statements (function calls) | Always add |
| `@font` directives | Always add |
| `text` / `tspan` statements | Always add |
| Path commands (`M`, `L`, `C`, `Z`, etc.) | **Never** add |
| Block statements (`for`, `if`, `fn`, `enum`) | No semicolon (block-terminated) |

## 4. Operators

- **Spaces around all binary operators**: `+`, `-`, `*`, `/`, `%`, `==`, `!=`, `<`, `>`, `<=`, `>=`, `&&`, `||`, `<<`, `=`.
- **No space** after unary operators: `-x`, `!flag`.
- `calc()` contents follow the same spacing rules. No space after `calc(` or before `)`.

## 5. Style Blocks

- **Always multi-line** (unless the style block is empty: `${}`).
- One property per line, indented one level from the parent statement.
- Trailing semicolon after every property, including the last.
- Closing `}` or `};` on its own line at the parent indent level.

```pathogen
let bg = PathLayer('bg') ${
  fill: #0f172a;
  stroke: none;
};
```

Applies uniformly to `define` layer definitions and `let` layer constructors.

## 6. Path Commands

- **Always a space** between command letter and first argument: `M 10 20`, not `M10 20`.
- **Always a space** before negative values: `l -10 4`, not `l-10 4`.
- **One SVG path command per line.** Never put multiple commands on the same line.
- Path commands **never** get semicolons.
- Function calls in path context (e.g., `radialWedge(...)`, `circle(...)`) go on their own line.

```pathogen
M 100 120
L 170 120
L 200 150
Z
```

## 7. Ternary Expressions

- Short ternaries stay on one line: `let color = is_active ? Color('#22c55e') : Color('#64748b');`
- Long conditions (3+ `||`/`&&` clauses) break the condition across lines, with continuation indented one level. The `? value : value` stays together.
- **Nested ternaries** always break across multiple lines, with increasing indentation.

```pathogen
let hasBadge = d.name == "Economic" ||
  d.name == "Wargame" ||
  d.name == "Humor" ? 1 : 0;

let anchor = labelR > 200 ?
  'start' : labelR < -200 ?
    'end' : 'middle';
```

## 8. Arrays

- **Each element on its own line**, indented one level.
- **Trailing comma** after the last element, always.
- Closing `];` on its own line at the parent indent level.

```pathogen
let ramp = [
  darker,
  dark,
  base,
  light,
  lighter,
  pale,
];
```

Arrays of objects: each object is multi-line (see Object rules), one object per array element.

## 9. Objects

- **Each property on its own line**, indented one level.
- Space after colon: `x: 10`, not `x:10`.
- **Trailing comma** after the last property, always.
- Closing `};` on its own line at the parent indent level.
- Spread elements (`...defaults`) on their own line, same rules.

```pathogen
let cfg = {
  title: 'transparent-blend',
  innerR: 50,
  fromDeg: 0,
};
```

## 10. Function Definitions

- Parameters stay on one line up to **4 parameters**.
- At 5+ parameters, break after every 4th parameter. Continuation lines indented 4 spaces (double indent) from the `fn` keyword.
- Opening `{` on the same line as the closing `)`.

```pathogen
fn swatch(cx, cy, r) {
  circle(cx, cy, r);
}

fn buildSchematic(coneCx, coneCy, innerR, fromDeg,
    toDeg, rectX, rectY, rectW, rectH) {
  circle(coneCx, coneCy, innerR);
}
```

## 11. Function Calls

- Arguments stay on one line if **4 or fewer** simple arguments.
- Break to one-argument-per-line if:
  - More than 4 arguments, OR
  - Any argument is itself a function call (e.g., `calc(...)`, `Color(...)`)
- Continuation lines indented **4 spaces** (double indent) from the call site.

```pathogen
circle(cx, cy, r);

roundRect(calc(browserStart + frac1 * browserW - subPad + 4),
    calc(subY - 11),
    calc((fracHi1 * browserW + subPad * 2) * 0.92),
    15,
    2);
```

## 12. Method Chains

- **2-step chains** stay on one line: `base.lighten(0.2).alpha(0.55)`.
- **3+ steps** break with each `.method()` on its own line, indented 4 spaces (double indent).
- When a method call has many arguments that also wrap, the chained `.method()` continues at the same 4-space indent.

```pathogen
let triColor = gridColor
    .hueShift(180)
    .lighten(20%)
    .alpha(0.8);

labelTb.radialProject(cx, cy, midAngle, labelR,
    'start', 1, VerticalAnchor.Midline)
    .draw();
```

## 13. Gradient Constructors

- `{|g|` stays on the same line as the constructor.
- Each `g.stop(...)` on its own line, indented one level.
- Stop offset values are **column-aligned** (pad with spaces).
- Closing `};` on its own line.

```pathogen
let sky_grad = LinearGradient('sky', 0, 0, 0, 1) {|g|
  g.stop(0,    Color('#0d1b2a'));
  g.stop(0.45, Color('#1b4965'));
  g.stop(0.65, Color('#415a77'));
  g.stop(1,    Color('#778da9'));
};
```

## 14. Layer Definitions

- `define` statements follow the same style block rules: always multi-line (unless empty style block).
- Trailing semicolon on last property.
- No semicolon after the closing `}` of a `define` statement (it's block-like, not an expression).

```pathogen
define PathLayer('curve') ${
  fill: none;
  stroke: #3b82f6;
  stroke-width: 3;
}

define default PathLayer('main') ${
  stroke: #000;
  stroke-width: 2;
  fill: none;
}
```

## 15. Layer Apply Blocks

- **Always multi-line**, even for a single statement.
- `layer('name').apply` and `variable.apply` follow the same rules.
- `for` loops inside apply blocks are always multi-line (no single-line for loops).

```pathogen
bg.apply {
  rect(0, 0, 600, 340);
}

grid.apply {
  for (i in 0..17) {
    M 0 calc(i * 20)
    h 600
  }
}
```

## 16. Text and Tspan

- Simple inline `text(x, y)\`content\`` stays on one line (when standalone).
- Text blocks with body: always multi-line, each text/tspan on its own line.
- Semicolons on text and tspan statements.

```pathogen
text(50, 50)`Hello World`;

text(500, subY) {
  `They make up nearly 30% of `;
  tspan(0, 0, 0, hiWhite)`all board games`;
  `, but just about 10% of the `;
  tspan(0, 0, 0, hiWhite)`top 100`;
  ` ranked titles.`;
}
```

## 17. Path Blocks (`@{ }`)

- **Always multi-line**, one command per line, indented one level.
- Closing `};` on its own line.
- Control flow inside path blocks follows normal indentation rules.

```pathogen
let sq = @{
  h 60
  v 60
  h -60
  z
};
```

## 18. Text Blocks (`&{ }`)

- **Always multi-line**, each text element on its own line.
- `<< style` merge stays on the same line as the closing `}`.
- Nested text blocks with tspans follow normal nesting indentation.

```pathogen
let card = &{
  text(0, 14)`Server Node`;
  text(0, 32)`Status: online`;
  text(0, 48)`Latency: 12ms`;
} << mono_styles;
```

## 19. Enums

- **Always multi-line**, each member on its own line.
- Trailing comma after every member, including the last.
- Members with `= value` are not column-aligned (each stands alone).

```pathogen
enum Direction {
  UP,
  DOWN,
  LEFT,
  RIGHT,
}
```

## 20. Destructuring

- Array destructuring: spaces after commas, no spaces inside brackets: `[a, b, c]`.
- Object destructuring: spaces inside braces, spaces after commas, space after colon in aliases: `{ x, y: alias, ...rest }`.
- `for` destructuring follows the same spacing: `for ([d, i] in data)`.
- `for` loops are always multi-line, even with a single statement body.

```pathogen
let [head, ...tail] = points;
let { x, y: alias, width, height } = shape.boundingBox();

for ([pt, i] in top) {
  pt.color = Color('#0a0a2e');
}
```

## 21. Comments and Section Headers

- The formatter **does not enforce** a specific comment header style. Comments are left as-is.
- Preferred convention for code samples: thin rule using box-drawing character `─` (U+2500).
- Blank line before section header comments.

```pathogen
// ─── Background ───
```

## 22. Blank Lines

- The formatter **does not enforce** blank line rules. Blank lines are left as the user wrote them.
- The formatter only normalizes excessive blank lines (3+ consecutive → 2).
- Convention (not enforced): no blank line between a layer definition and its `.apply`; one blank line between logical sections.

---

## Quick Reference Table

| Decision | Rule |
|----------|------|
| Indent size | 2 spaces |
| Brace placement | Same-line (K&R) |
| Semicolons: let/assign/return/expr | Always |
| Semicolons: path commands | Never |
| Semicolons: text/tspan/@font | Always |
| Binary operator spacing | Always spaces |
| calc() spacing | Same as expressions, no pad |
| Style blocks | Always multi-line, 1 prop/line |
| Path commands | 1 per line, always space after letter |
| Arrays | 1 element/line, trailing comma |
| Objects | 1 property/line, trailing comma |
| Function params wrap at | 5+ params (break every 4th) |
| Function args wrap when | 5+ args or any arg is a call |
| Continuation indent | 4 spaces (double indent) |
| Gradient stops | Column-aligned offsets |
| Layer apply | Always multi-line |
| for loops | Always multi-line |
| Path blocks (@{}) | Always multi-line |
| Text blocks (&{}) | Always multi-line |
| Enums | Always multi-line, trailing comma |
| Method chains wrap at | 3+ steps |
| Comments | Preserved as-is |
| Blank lines | Preserved as-is (normalize 3+ → 2) |
