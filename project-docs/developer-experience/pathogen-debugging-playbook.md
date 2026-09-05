# Pathogen Debugging & Authoring Playbook (for agents)

_How to see what a Pathogen program actually did, and how to write samples that
come out right the first time. Written for the agent that authors samples and
diagnoses reported bugs; distilled from the Cutting Room, Broken Lines, radial
bar chart, and easing cycles and from the 2026-09 debuggability work
(`project-docs/debug-features/`). User-facing reference lives in
`docs/debug.md` and `docs/cli.md`; this file is the working method._

## 0. The loop

Never hand-inspect an SVG string. Every visual change goes through this loop:

```bash
npx tsx src/cli.ts scene.pathogen --json > scene.json          # 1. what happened
npx tsx src/cli.ts scene.pathogen --output-svg-file=scene.svg --png=scene.png   # 2. what it looks like
```

1. **Read the warnings first.** `--json` puts every `warning` (code, message,
   line, column) at the top level; the CLI also prints them to stderr as
   `file:line:col: warning: …`. A warning is the compiler telling you it did
   something other than what you asked (a clamped fillet, a skipped corner op,
   a cut that separated nothing, a gradient with one point). Fix or accept each
   one before looking at pixels.
2. **Read the PNG.** Use the Read tool on `scene.png`. This is the only honest
   check of layout, overlap, margins, and color; the radial-bar-chart retro
   called PNG self-review "the turning point" after days of blind iteration.
   Add `--render-gpu` when the program uses `ConicGradient` / `MeshGradient` /
   `FreeformGradient` / `TopoGradient` (the CLI otherwise emits a flat rect).
3. **Read the numbers when the picture is wrong.** In `scene.json`, each path
   layer has `d`, `records` (which statement emitted which fragment, with
   `loc` and `as segment('…')` label), and `commands` (every executed command
   with the cursor before and after). `commands` answers "where was the pen"
   without adding a single `log()`.
4. For a published sample, finish with the sample pipeline in
   `website/blog/CLAUDE.md` §3.5: `compile:samples` → `format:samples` →
   `validate:samples` (margins, collisions, dead space, GroupLayer, formatting;
   writes `previews/*.png`) → bbwp.

## 1. Reading output

| You want to know | Use |
|---|---|
| Which line produced this fragment | `--json` → `layers[].records[].loc` |
| The pen position at each step | `--json` → `layers[].commands[]` (`start`/`end`), or `compile(src, { trace: true })` in a script |
| What a block will emit, from inside the program | `log(block.d)`; `log(block.commands[2])`; `log(block)` prints `PathBlock(N commands: h 40 v 40 …)` |
| A color's channels | `c.hex`, `c.css`, `c.oklch`, `c.lightness`, `c.chroma`, `c.hue` |
| A measured extent | `.boundingBox()`, `.centerPoint()`, `.length`, `.startPoint` / `.endPoint`; text via `PathBlock.fromGlyph(...)[i].boundingBox()` |
| Whether two things touch | `.intersects(other)`, `.intersectionPoints(other)` (see `website/guidelines/text-collision-debugging.md`) |
| An invariant you rely on | `assert(cond, message);` — fails compilation with `Line N, col M: assertion failed: …` in the CLI, the playground error panel, and VS Code |

`log()` is a statement (`log("w", w);`), never a value; `ln(x)` is the natural
logarithm. Values print in their written form: angles as `90deg` / `0.5pi`
(use `.deg` / `.rad` for bare numbers), points as `Point(x, y)`.

In tests, assert the structured trace instead of scraping the `d` string when
the question is what executed: `expectCommandSequence(result.layers[0],
[['M', 10, 10], ['h', 40]], { precision: 6 })` (see `tests/CLAUDE.md`).

## 2. Assertions as guardrails

Put `assert()` where a sample's correctness is a number: label width inside its
column, a piece count after `cut()`, a bounding box inside the viewBox, a
`seams()` length. They cost nothing when true and turn a silent layout drift
into a positioned error the next time anyone touches the sample.

```
let lines = PathBlock.fromGlyph(caption, #{ font-family: system-ui; font-size: 12; });
let width = lines[0].boundingBox().width;
assert(width < columnWidth, `caption is ${width} wide, column is ${columnWidth}`);
```

## 3. Traps (each cost a real session)

**Geometry**
- `ctx.position` is frozen at `(0, 0)` inside a `@{ }` block; track your own
  cursor variable for flow-field style walks. `polarLine()` emits relative
  `l` inside a block and absolute `L` outside.
- Stdlib shapes (`circle`, `rect`, `roundRect`, …) emit ABSOLUTE coordinates.
  `M x y circle(…)` on one line is a parse error and would ignore the `M`
  anyway: fold the anchor into the arguments. Inside a `@{ }` block prefer
  relative commands (`m l c z`); a stdlib shape inside a block gets mangled
  on projection.
- `partition(n)` returns `n+1` entries of `{ point, angle, t }`
  (`pts[i].point.x`, not `.get(i)`).
- Corner ops (`fillet`, `chamfer`, `ellipticalFillet`, `with …` clauses) clamp
  or skip silently except for the warning — read it.
- Ranges are inclusive (`0..3` is four iterations); `for` needs parentheses:
  `for (i in 0..n)`.

**Language**
- `m l h v c s q t a z` are path commands: `let a = …; M a.x a.y` fails with a
  misleading `Missing ';'`. Published samples use descriptive names anyway.
- `%` shares the `*` precedence level; keep parentheses (`6 * (i % 2)`).
- `arr[i](t)` and `obj.f(x)` are not callable; bind first: `let f = arr[i]; f(t)`.
- `<<` applies a worker defined elsewhere (`arr.map() << f`); an inline lambda
  after `<<` is a compile error by design — use the trailing block
  `arr.filter {|x| …}`.
- Strings: `+` is numeric only; interpolate with backticks: `` `g-${i}` ``.
  `${…}` is ONLY interpolation (templates and style values). Style blocks open
  with `#{ … }`.
- Style values: `stroke-dasharray: 10 -5;` evaluates `10 - 5`; comma-separate
  lists you want raw. Quoted font names are rejected by the sanitizer; every
  published sample uses `font-family: system-ui, sans-serif;`.
- Stdlib calls have no arity check: `hash01()` silently hashes 0.
- `pi`, `deg`, `rad` are suffix-only reserved words.

**Tooling**
- CLI vs playground: pass `--stroke=none` to the CLI so a layer with no stroke
  in its style block matches the playground. The CLI cannot fetch Google
  Fonts; add `@font './Family Name.ttf';` with the file named exactly like the
  `font-family` value.
- The formatter re-wraps any call with five or more arguments one-per-line
  (`cubicBezier(x1, y1, x2, y2, t)`), and `format:samples` will reflow every
  committed sample for it; do not run it concurrently with `compile:samples`.
- `validate-samples` collisions are bounding-box based: a label inside a
  diagonal guide's box is a collision with no visual overlap. Put labels beyond
  a row's end, give each row its own layer, and use a GroupLayer once a sample
  has more than three layers.
- The 18 GPU-rasterized blog samples are nondeterministic run to run; never
  use byte-identity on them.
- `Grid.fill/map/forEach` are fast only for a top-level `return`; a nested
  return costs a throw per cell.
- Puppeteer on this machine never runs rAF or scroll events; verify those by
  direct invocation (`project_playground_puppeteer_gotchas` memory).
- `Maximum call stack size exceeded` with a correct render, an error panel,
  and an empty layers list means something AFTER the render threw (the
  layers store is written last in `updatePreview`), not the compiler. Two
  known sources: per-warning editor decorations (now deduped and capped) and
  a vendored library regex on a multi-megabyte data URI (rasterized
  gradients in vector PDF export; patched at vendor build time in
  `scripts/lib/vendor-patches.ts`).
- New-headless Chrome (`headless: true`) can hang forever in `screenshot()`
  when the display is asleep; `--png` and `validate-samples` launch
  `headless: 'shell'` for that reason. Reach for the shell in any new
  screenshot script that does not need WebGPU (`--render-gpu` does).

## 4. Verifying across the three surfaces

The compiler is shared; the surfaces are not. A feature is done when the same
program agrees in all three:

1. CLI: `npx tsx src/cli.ts f.pathogen --json` and `--png`.
2. Playground: rebuild the served site the safe way when `dev:website` is
   running — `PATHOGEN_API_BASE=http://localhost:8787 npm run build:website`
   (plain `build:website` bakes the production API base). Then load the
   program at `/workspace/scratch?state=<base64(json({code}))>`. Warnings show
   as `warn` chips in the console and yellow squiggles in the editor.
3. VS Code: `npm run build:vscode` packages the extension; warnings arrive as
   diagnostics through the LSP.

If your test passes and the user's screenshot disagrees, the test is measuring
the wrong path (`compile` vs `compileWithContext` bit us once): diff the code
paths before asking anyone to clear a cache.

## 5. Sample style (published content)

`website/guidelines/code-example-guidelines.md` is the rulebook. The ones that
fail review most often: descriptive names (no single letters beyond `i j k`,
`.x .y`, and parametric `t`); multi-command `@{ }` blocks one command per
line; `format:samples` after the last edit and `compile:samples` after that;
15 px margins; build diagrams from GroupLayers positioned by transforms, not
absolute canvas math; use `.boundingBox()` / `.drawTo()` / `.project()` for
placement instead of hand arithmetic; compile a BBWP so the sample appears in
the verification index.

## 6. Keep a friction log

Whenever a sample fights you, append the entry to the cycle's
`FRICTION-LOG.md` (convention: `project-docs/broken-lines/FRICTION-LOG.md`,
entries written in the moment, resolution added as a bold status prefix
above the original text). Every language improvement in the last three
cycles came from one of those entries.
