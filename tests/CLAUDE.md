# Testing Playbook

## Philosophy

Every assertion must answer: "What contract is being verified?" If the assertion passes regardless of whether the feature works correctly, it is not a test. When testing compiler output, **compute the expected value from inputs** rather than hardcoding approximations.

## SVG Path Command Reference

| Command | Args | Description |
|---------|------|-------------|
| M/m | 2 floats (x, y) | Move to |
| L/l | 2 floats (x, y) | Line to |
| H/h | 1 float (x) | Horizontal line |
| V/v | 1 float (y) | Vertical line |
| C/c | 6 floats (x1, y1, x2, y2, x, y) | Cubic bezier |
| S/s | 4 floats (x2, y2, x, y) | Smooth cubic |
| Q/q | 4 floats (x1, y1, x, y) | Quadratic bezier |
| T/t | 2 floats (x, y) | Smooth quadratic |
| A/a | 7 (rx, ry, rot, large-arc-flag, sweep-flag, x, y) | Arc |
| Z/z | 0 | Close path |

## Test Utility Decision Tree

1. **Exact string match** — when compiler output is fully deterministic:
   ```ts
   expect(compilePath('M 10 20')).toBe('M 10 20');
   ```

2. **Structural + coordinate validation** — when testing geometry with float tolerance:
   ```ts
   expectSVGPathCommandSequence(result, [['M', 50, 100], ['A', 50, 50, 0, 1, 1, 150, 100]], { precision: 4 });
   ```

3. **Matcher-based validation** — when using custom matchers:
   ```ts
   expect(result).toMatchSVGPath(svgPath('M 0 0 L 100 0 L 100 100 Z'));
   ```

4. **Command structure only** — when verifying command types without coordinates:
   ```ts
   expect(result).toContainSVGCommands(['M', 'A', 'A']);
   ```

5. **Command count** — when verifying exact occurrences of a command:
   ```ts
   expect(result).toHaveSVGCommandCount('L', 5);
   ```

6. **Closure check** — when verifying path closes:
   ```ts
   expect(result).toClosePath();
   ```

## Anti-Patterns

### 1. Existence-only assertions

```ts
// BAD: passes if compiler emits ANY output
expect(result).toContain('M');

// GOOD: verify actual geometry
expectSVGPathCommandSequence(result, [['M', 50, 100], ['A', 50, 50, 0, 1, 1, 150, 100], ['A', 50, 50, 0, 1, 1, 50, 100]]);
```

### 2. Type-only assertions

```ts
// BAD: only checks that something exists and is a string
expect(result.gradients[0].stops[0].color).toBeDefined();
expect(typeof result.gradients[0].stops[0].color).toBe('string');

// GOOD: check actual resolved value
expect(result.gradients[0].stops[0].color).toBe('#ff0000');
```

### 3. Uncorrelated assertions

```ts
// BAD: separate checks don't verify order or relationship
expect(result).toContain('M');
expect(result).toContain('A');

// GOOD: verify exact output or command sequence
expect(result).toBe('M 50 100 A 50 50 0 1 1 150 100 A 50 50 0 1 1 50 100');
```

### 4. Approximate when exact is available

```ts
// BAD: hardcoded values that happen to be right
expect(result).toContain('M 20 10');

// GOOD: derive from stdlib formula
const expected = `M 20 10 L 70 10 Q 80 10 80 20 L 80 60 Q 80 70 70 70 L 20 70 Q 10 70 10 60 L 10 20 Q 10 10 20 10 Z`;
expect(result).toBe(expected);
```

## Patterns to Follow (Codebase Exemplars)

- **`context.test.ts`** (5/5) — Exact coordinate validation with `toEqual({ x, y })`
- **`errors.test.ts`** (5/5) — Exact error messages with line/column regex
- **`evaluator.test.ts` rect test** — `expect(result).toBe('M 0 0 L 100 0 L 100 50 L 0 50 Z')`

## Computing Expected Values for Stdlib Functions

Derive expected output from `src/stdlib/path.ts`:

- **`circle(cx, cy, r)`** → `M {cx-r} {cy} A {r} {r} 0 1 1 {cx+r} {cy} A {r} {r} 0 1 1 {cx-r} {cy}`
- **`rect(x, y, w, h)`** → `M {x} {y} L {x+w} {y} L {x+w} {y+h} L {x} {y+h} Z`
- **`roundRect(x, y, w, h, radius)`** → Clamp `r = min(radius, w/2, h/2)`, then: `M {x+r} {y} L {x+w-r} {y} Q {x+w} {y} {x+w} {y+r} L {x+w} {y+h-r} Q {x+w} {y+h} {x+w-r} {y+h} L {x+r} {y+h} Q {x} {y+h} {x} {y+h-r} L {x} {y+r} Q {x} {y} {x+r} {y} Z`
- **`polygon(cx, cy, r, n)`** → M at vertex 0, then n-1 L's, Z. Vertex i at angle `(i/n)*2PI - PI/2`, coords `cx + r*cos(angle)`, `cy + r*sin(angle)`
- **`star(cx, cy, outerR, innerR, points)`** → 2*points vertices alternating outer/inner radii at evenly spaced angles starting at -PI/2

## Boolean Operations

For axis-aligned rectangles, the expected output is geometrically determinable. Test authors must compute the expected polygon vertices from the rectangle geometry. At minimum, verify:
- Correct number of closed subpaths (z-count)
- Correct number of line segments
- Path closure (`toClosePath()`)

## Custom Matchers

Defined in `tests/setup.ts`, typed in `tests/vitest.d.ts`:
- `toMatchSVGPath(expected, options?)` — Full command sequence with float tolerance
- `toContainSVGCommands(commands)` — Command types in order
- `toHaveSVGCommandCount(command, count)` — Exact occurrence count
- `toClosePath()` — Ends with Z/z

## Helpers

Defined in `tests/helpers.ts`:
- `compilePath(source)` — Compile and return default layer path data
- `parseSVGPath(d)` — Parse d-string into `ParsedCommand[]`
- `svgPath(d)` — Alias for `parseSVGPath`
- `extractSVGCommands(d)` — Alias for `parseSVGPath`
- `expectSVGPathCommandSequence(result, expected, options?)` — Assert command sequence with precision
