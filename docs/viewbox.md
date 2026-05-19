# ViewBox

Every Pathogen program renders into an SVG with a `viewBox`. The `define ViewBox` statement specifies that viewBox directly in code, making the program self-contained and reproducible across the CLI, playground, and VS Code preview.

## Syntax

```
define ViewBox(originX, originY, width, height);
```

The four arguments become the SVG `viewBox="originX originY width height"` attribute on the root `<svg>` element. The root `width` and `height` attributes default to the same `width` and `height` values.

```
define ViewBox(0, 0, 200, 200);
M 50 50 L 150 150
```

Renders to `<svg viewBox="0 0 200 200" width="200" height="200">…</svg>`.

## Arguments

Arguments are expressions and may use variables, `calc()`, or any other expression form:

```
let W = 400;
let H = 300;
define ViewBox(0, 0, W, H);
```

```
define ViewBox(0, 0, calc(100 * 4), calc(100 * 3));
```

## Negative Origin

`originX` and `originY` may be negative — useful for centering geometry around `(0, 0)`:

```
define ViewBox(-100, -100, 200, 200);
M -50 -50 L 50 50
```

## Default ViewBox

If a program contains no `define ViewBox` statement, the viewBox defaults to `0 0 200 200`.

## Placement

`define ViewBox` is a top-level statement. It may appear anywhere among other top-level statements, but **not** inside a `layer().apply { }` block, a path block, or a text block.

```
// OK
define ViewBox(0, 0, 200, 200);
define default PathLayer('main') ${ stroke: #222; };
M 0 0 L 200 200

// Error: ViewBox must appear at top level
layer('main').apply {
  define ViewBox(0, 0, 200, 200);
  M 0 0
}
```

## Errors

The compiler rejects:

- **Duplicate `define ViewBox`** — only one viewBox per program.
- **Zero or negative `width` or `height`** — these are invalid SVG dimensions.
- **`default` modifier** — `define default ViewBox(…)` is not allowed; only `PathLayer` and `TextLayer` accept `default`.
- **Non-numeric arguments** — every argument must evaluate to a finite number.

## Precedence with the CLI

The CLI accepts `--viewBox`, `--width`, and `--height` flags. When the source contains a `define ViewBox` statement, the source wins; the CLI flags are used only when the source does not define a viewBox:

| Source has `define ViewBox`? | `--viewBox` flag? | Resulting viewBox |
|------------------------------|-------------------|-------------------|
| Yes                          | (anything)        | From `define ViewBox` |
| No                           | Yes               | From `--viewBox`      |
| No                           | No                | `0 0 200 200`         |

This lets inline `-e` snippets supply a viewBox via the CLI while persistent programs declare it in source.

## Why source, not configuration

Storing viewBox in source code (rather than in workspace metadata, comments, or external configuration) keeps a program self-contained: copying the code anywhere reproduces the same image. It also lets editor tooling (completion, hover, formatting) reason about the viewBox the same way it reasons about any other statement.

## Related

- [Layers](#layers) — the rest of the `define` family (`PathLayer`, `TextLayer`, `GroupLayer`)
- [CLI](#cli) — using `--viewBox`/`--width`/`--height` flags alongside source-defined viewBox
