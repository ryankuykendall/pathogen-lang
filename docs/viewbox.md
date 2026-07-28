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

## Reading the `viewbox`

The `viewbox` global (lowercase) exposes the values set by `define ViewBox` as a read-only struct. This removes the update-two-places pattern: a full-canvas background no longer repeats the canvas dimensions, so changing the viewBox is a one-line edit:

```
define ViewBox(0, 0, 880, 280);
define default PathLayer('base') ${ fill: #fff; };
let {width, height} = viewbox;
rect(0, 0, width, height);
```

| Member | Value |
|--------|-------|
| `viewbox.originX` | First argument to `define ViewBox` |
| `viewbox.originY` | Second argument |
| `viewbox.width`   | Third argument |
| `viewbox.height`  | Fourth argument |

The struct's type is `ViewBox` — a typo like `viewbox.w` errors with `Property 'w' does not exist on ViewBox`.

All the usual access forms work — dot access, destructuring, and rest patterns:

```
define ViewBox(-100, -100, 200, 200);
let cx = calc(viewbox.originX + viewbox.width / 2);
let {originX, originY, ...size} = viewbox;
```

`viewbox` is available anywhere after the `define ViewBox` statement has *executed* — inside `fn` bodies, `layer().apply { }` blocks, and path blocks alike. The rule is execution order, not source order: a function declared above the `define` can still read `viewbox` when it is called after the `define` has run, because the lookup happens at call time.

### Reading before defining is an error

Reading `viewbox` before `define ViewBox(…)` has executed — including in a program with no `define ViewBox` at all — is an error:

```
// Error: viewbox is not available until define ViewBox(...) has run
let {width} = viewbox;
define ViewBox(0, 0, 200, 200);
```

The implicit `0 0 200 200` default ([Default ViewBox](#viewbox-default-viewbox)) applies to rendering only; the `viewbox` global never falls back to it. To read the viewbox, declare it.

### Shadowing and read-only semantics

- The struct is read-only: assigning to a member (`viewbox.width = 5;`) is a compile error — `Cannot assign to property 'width'`.
- Each read returns a fresh copy, so `let a = viewbox;` gives you an independent snapshot.
- A user variable named `viewbox` shadows the global — `let viewbox = 5;` is legal and existing programs keep their meaning. The shadow follows normal scope rules: a `let viewbox` inside a block shadows only within that block, and the global is visible again outside it. Within a scope that shadows it, there is no way to reach the ambient global.
- Capitalized `ViewBox` remains a keyword and is only valid in `define ViewBox(…)`.

## Default ViewBox

If a program contains no `define ViewBox` statement, the *rendered* viewBox defaults to `0 0 200 200`. This default applies to rendering only — the `viewbox` global does not inherit it and errors when read in a program without `define ViewBox` (see [Reading the viewbox](#viewbox-reading-the-viewbox)).

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
- **Reading `viewbox` before `define ViewBox` has run** — see [Reading before defining is an error](#viewbox-reading-before-defining-is-an-error).
- **Assigning to a `viewbox` member** — the struct is read-only; see [Shadowing and read-only semantics](#viewbox-shadowing-and-read-only-semantics).

## Precedence with the CLI

The CLI accepts `--viewBox`, `--width`, and `--height` flags. When the source contains a `define ViewBox` statement, the source wins; the CLI flags are used only when the source does not define a viewBox:

| Source has `define ViewBox`? | `--viewBox` flag? | Resulting viewBox |
|------------------------------|-------------------|-------------------|
| Yes                          | (anything)        | From `define ViewBox` |
| No                           | Yes               | From `--viewBox`      |
| No                           | No                | `0 0 200 200`         |

This lets inline `-e` snippets supply a viewBox via the CLI while persistent programs declare it in source.

The `viewbox` global reads only from `define ViewBox`. When the viewBox comes from a CLI flag (or the implicit default), reading `viewbox` still errors — the flag affects rendering, not the program's variables. A program that reads `viewbox` must declare its viewBox in source.

## Why source, not configuration

Storing viewBox in source code (rather than in workspace metadata, comments, or external configuration) keeps a program self-contained: copying the code anywhere reproduces the same image. It also lets editor tooling (completion, hover, formatting) reason about the viewBox the same way it reasons about any other statement.

## Related

- [Layers](#layers-layers) — the rest of the `define` family (`PathLayer`, `TextLayer`, `GroupLayer`)
- [CLI](#cli-cli-reference) — using `--viewBox`/`--width`/`--height` flags alongside source-defined viewBox
- [Path Context (ctx)](#syntax-path-context-ctx) — the other ambient global, tracking the pen position during evaluation
