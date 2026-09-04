# Debug & Console

Pathogen gives you four ways to see what a program is doing: `log()` messages, compiler **warnings**, `assert()` guards, and a **structured result** you can read as JSON or as values inside the language. All of them work the same way in the CLI, the playground, and VS Code.

## Console Output

In the playground, click the **Console** button in the header to open the console. It shows every `log()` message and every warning, each with the line it came from. The CLI prints logs to stderr with `--print-logs` (or writes them as JSON with `--log-file=<file>`) and always prints warnings to stderr.

## log() Function

`log()` records a message. It is a statement, not a value:

```
log("message");            // String message
log(myVar);                // Variable with label
log("pos:", ctx.position); // Multiple args
log(ctx);                  // Full context object
```

### Output Format

String arguments display as-is. Other expressions show a label with the source:

```
let r = 50;
log("radius is", r);
// Output:
// radius is
// r = 50
```

Objects are expandable in the console — click the arrow to explore nested properties.

Values display in a readable form: [angles](#syntax-angle-units) in their written unit (`90deg`, `0.5pi`), points as `Point(x, y)`, colors as their OKLCH CSS, and path blocks with their first few commands:

```
let box = @{
  h 40
  v 40
  h -40
  z
};
log(box);
// box = PathBlock(4 commands: h 40 v 40 h -40 z)
```

### log() has no value

`log(...)` cannot be used where a value is expected. `let y = log(3);` is a compile error that points you at the right function: the natural logarithm is [`ln(x)`](#stdlib-exponential-logarithmic).

## Warnings

Some operations cannot do exactly what you asked and quietly do the nearest thing instead — a fillet radius larger than the edge is clamped, a corner operation at a curve junction is skipped, a cut stroke that stops inside the shape leaves it whole. Each of these produces a **warning** with the source line:

```
let plate = @{
  h 40
  v 40
  h -40
  z
};
let soft = plate.fillet(30);   // 30 is larger than half an edge
M 10 10
soft.draw();
```

```
Line 7, col 20: Fillet radius clamped at vertex 0 (requested 30, using 20)
```

Warnings never stop compilation. They appear:

- in the playground console, marked with a **warn** chip, and as a yellow squiggle on the line in the editor;
- in VS Code, as a warning diagnostic on the line;
- on the CLI's stderr as `file:line:col: warning: message` (exit code stays 0);
- in the structured result under `warnings`, each with a `code`: `corner-op`, `cut`, `annotation-transfer`, `font-glyph`, or `gradient`.

A warning is also mirrored into the log stream as a `[warn] …` entry, so `--log-file` output keeps everything in one place.

## assert()

`assert(condition, message?)` stops compilation with an error when the condition is false. Use it to pin an invariant the rest of the program depends on — a sample that must stay inside its viewBox, a measured width that must not exceed a column:

```
let label = PathBlock.fromGlyph('Wingspan', #{ font-family: system-ui; font-size: 14; });
let width = label[0].boundingBox().width;
assert(width < 120, `label is ${width} wide, column is 120`);
```

A failed assertion reports its line, column, and message — `Line 3, col 1: assertion failed: label is 131.2 wide, column is 120`. Without a message, the condition's own source text is used. Like `log()`, `assert()` is a statement and has no value. Both work at the top level, inside loops and `if` bodies, in function and lambda bodies, in `apply { }` blocks, in path blocks, and in `&{ }` text blocks.

## Seeing Your Output

An SVG file is not something you can read; a PNG is. The CLI can rasterize what it compiled:

```bash
pathogen-lang scene.pathogen --output-svg-file=scene.svg --png=scene.png
```

`--png` renders the SVG in a headless browser (it needs the `puppeteer` dev dependency; the CLI tells you if it is missing) at the program's viewBox size, scaled by `--scale`. Programs that use GPU-rasterized gradients need `--render-gpu` as well; `--png` composes with it.

For a directory of samples, `npm run validate:samples -- <dir>` writes a PNG preview for every compiled SVG into `<dir>/previews/` and reports margin, collision, dead-space, layering, and formatting problems. Run it after `npm run compile:samples`.

## Structured Output

### `--json` on the CLI

```bash
pathogen-lang scene.pathogen --json
```

prints one JSON document instead of path data:

```json
{
  "viewBox": { "originX": 0, "originY": 0, "width": 200, "height": 200 },
  "layers": [
    {
      "name": "main",
      "type": "path",
      "d": "M 10 10 l 40 0 …",
      "styles": { "stroke": "#333" },
      "records": [
        { "loc": { "line": 8, "column": 1 }, "label": "lid", "raw": "h 40", "commandCount": 1 }
      ]
    }
  ],
  "defs": { "masks": [], "clipPaths": [], "gradients": [], "patterns": [], "markers": [], "filters": [] },
  "cssProperties": [],
  "logs": [],
  "warnings": [],
  "commands": [
    { "command": "M", "args": [10, 10], "start": { "x": 0, "y": 0 }, "end": { "x": 10, "y": 10 } }
  ]
}
```

Every `loc` also carries the character `offset` of the statement, and the document ends with `calledStdlibFunctions` (the stdlib names the program used) and, when a font could not render every character, `missingGlyphs`.

Each layer's `records` say where every emitted fragment came from (`loc` is the source line and column, `label` is its `as segment('…')` name when it has one, `raw` is the authored fragment). `commands` is the full trace of executed path commands with the cursor before and after each one. `--json` can be combined with `-o <file>`; it cannot be combined with `--output-svg-file`.

### `trace` from the library

```ts
import { compile } from 'pathogen-lang';
const result = compile(source, { trace: true });
result.warnings;            // CompileWarning[]
result.layers[0].records;   // PathRecordOutput[]
result.commands;            // CommandHistoryEntry[]
```

Without `trace: true`, `records` and `commands` are omitted and the result is as small as before.

### Path data from inside the language

A path block can report its own emitted data. `d` is the relative path string the block draws (as `.draw()` would emit at the origin), and `commands` is the list of executed commands:

```
let box = @{
  h 40
  v 40
  h -40
  z
};
log(box.d);            // "h 40 v 40 h -40 z"
log(box.commands[1]);  // {command: "v", args: [40], start: Point(40, 0), end: Point(40, 40)}
```

On a [ProjectedPath](#path-blocks-projecting-without-drawing), `d` is absolute. Colors answer `.hex`, `.css`, `.oklch`, `.lightness`, `.chroma`, and `.hue`.

## ctx Object

The `ctx` object tracks path state during evaluation.

### ctx.position

Current pen position after the last command.

| Property | Description |
|----------|-------------|
| `ctx.position.x` | X coordinate |
| `ctx.position.y` | Y coordinate |

```
M 100 50
log(ctx.position);  // {x: 100, y: 50}
L 150 75
log(ctx.position);  // {x: 150, y: 75}
```

Inside a `@{ }` path block, `ctx.position` is the block's own cursor, which starts at `(0, 0)`; it does not report where the block will eventually be drawn.

### ctx.start

Subpath start position (set by `M`/`m`, used by `Z`).

| Property | Description |
|----------|-------------|
| `ctx.start.x` | X coordinate |
| `ctx.start.y` | Y coordinate |

### ctx.commands

Array of all executed commands with their positions:

```
// Each entry contains:
{
  command: "L",        // Command letter
  args: [150, 75],     // Evaluated arguments
  start: {x: 100, y: 50},
  end: {x: 150, y: 75}
}
```

## Using ctx in Paths

Access position values with `calc()`:

```
M 50 50
// Draw relative to current position
L calc(ctx.position.x + 30) ctx.position.y
circle(ctx.position.x, ctx.position.y, 5);
```

## Example: Debug a Loop

```
M 20 100
for (i in 0..4) {
  log("iteration", i, ctx.position);
  L calc(ctx.position.x + 40) 100
}
```

This logs the iteration number and current position at each step, helping you trace how the path is constructed.
