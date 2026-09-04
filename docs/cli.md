# CLI Reference

The pathogen-lang CLI compiles extended SVG path syntax into standard SVG path strings or complete SVG files.

## Installation

```bash
npm install -g pathogen-lang
```

Or use with npx:

```bash
npx pathogen-lang [options]
```

## Basic Usage

### Compile a File

```bash
pathogen-lang input.svgx
```

Or with the explicit flag:

```bash
pathogen-lang --src=input.svgx
```

### Compile Inline Code

```bash
pathogen-lang -e 'circle(100, 100, 50)'
```

### Read from Stdin

```bash
echo 'let x = 50; circle(x, x, 25)' | pathogen-lang -
```

```bash
cat myfile.svgx | pathogen-lang -
```

## Output Options

### Output Path Data to File

```bash
pathogen-lang --src=input.svgx -o output.txt
pathogen-lang --src=input.svgx --output output.txt
```

### Output as Complete SVG File

Generate a complete SVG file with the path embedded:

```bash
pathogen-lang --src=input.svgx --output-svg-file=output.svg
```

This creates a ready-to-use SVG file that can be opened in any browser or image viewer.

### Output as PNG

```bash
pathogen-lang --src=input.pathogen --output-svg-file=out.svg --png=out.png
pathogen-lang --src=input.pathogen --png=out.png --scale=2
```

Rasterizes the compiled SVG in a headless browser at the program's viewBox size, multiplied by `--scale` (1–4, default 2). Requires the `puppeteer` dev dependency; the CLI exits with an error naming it if it is missing. Composes with `--render-gpu` for programs that use GPU-rasterized gradients.

### Output as JSON

```bash
pathogen-lang --src=input.pathogen --json
pathogen-lang --src=input.pathogen --json -o result.json
```

Prints one JSON document with every layer's path data, styles, and per-fragment source records, the defs, CSS properties, logs, warnings, the stdlib functions the program called, any missing glyphs, and the full command trace. See [Structured Output](#debug-structured-output). `--json` cannot be combined with `--output-svg-file`, `--render-gpu`, or `--png`.

## Log Output

Pathogen programs can use `log()` to produce diagnostic output. By default, the CLI discards log entries. Two flags expose them:

### Print to stderr

```bash
pathogen-lang -e 'let x = 42; log(x); M x 0' --print-logs
```

Output on stderr:
```
[line 1] x = 42
```

The path data still goes to stdout, so logs don't interfere with piping:

```bash
pathogen-lang -e 'log("hello"); circle(50, 50, 25)' --print-logs > output.txt
```

### Write structured JSON

```bash
pathogen-lang --src=input.pathogen --log-file=logs.json
```

This writes the full `LogEntry[]` array with line numbers and typed parts:

```json
[
  {
    "line": 3,
    "parts": [
      { "type": "value", "label": "x", "value": "42" }
    ]
  }
]
```

Both flags can be combined:

```bash
pathogen-lang --src=debug.pathogen --print-logs --log-file=logs.json --output-svg-file=out.svg
```

## SVG Styling Options

When using `--output-svg-file`, you can customize the appearance:

| Option | Default | Description |
|--------|---------|-------------|
| `--stroke=<color>` | `#000` | Stroke color |
| `--fill=<color>` | `none` | Fill color |
| `--stroke-width=<n>` | `2` | Stroke width |
| `--viewBox=<box>` | `0 0 200 200` | SVG viewBox |
| `--width=<w>` | `200` | SVG width |
| `--height=<h>` | `200` | SVG height |

**ViewBox precedence:** if the source program contains a [`define ViewBox`](#viewbox-viewbox) statement, the source value wins and the `--viewBox`/`--width`/`--height` flags are ignored. The flags apply only when the source has no `define ViewBox`.

### Examples

Red circle with no fill:

```bash
pathogen-lang -e 'circle(100, 100, 50)' \
  --output-svg-file=circle.svg \
  --stroke=red \
  --stroke-width=3
```

Blue filled polygon:

```bash
pathogen-lang -e 'polygon(100, 100, 80, 6)' \
  --output-svg-file=hexagon.svg \
  --stroke=navy \
  --fill=lightblue \
  --stroke-width=2
```

Large canvas with custom viewBox:

```bash
pathogen-lang --src=complex.svgx \
  --output-svg-file=output.svg \
  --viewBox="0 0 800 600" \
  --width=800 \
  --height=600
```

## Help and Version

```bash
pathogen-lang --help
pathogen-lang -h

pathogen-lang --version
pathogen-lang -v
```

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Error (parse error, failed assertion, file not found, unknown option, `--png` without puppeteer, etc.) |

Warnings (see [Debug & Console](#debug-warnings)) are printed to stderr as `file:line:col: warning: message` and do not change the exit code.

## File Extensions

By convention, source files use the `.svgx` extension, but any text file will work.

## Examples

### Generate a Spiral

```bash
pathogen-lang -e '
M 100 100
for (i in 1..50) {
  L calc(100 + cos(i * 0.3) * i * 1.5) calc(100 + sin(i * 0.3) * i * 1.5)
}
' --output-svg-file=spiral.svg --stroke=teal --stroke-width=2
```

### Process Multiple Files

```bash
for file in examples/*.svgx; do
  pathogen-lang --src="$file" --output-svg-file="${file%.svgx}.svg"
done
```

### Use in a Build Script

```json
{
  "scripts": {
    "build:icons": "pathogen-lang --src=src/icons.svgx --output-svg-file=dist/icons.svg"
  }
}
```
