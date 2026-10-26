# pathogen-lang

The compiler, language services, and web playground for **Pathogen** — a typed, expression-first language for SVG paths. Source for the [`pathogen-lang`](https://www.npmjs.com/package/pathogen-lang) npm package and [pathogen.studio](https://pathogen.studio).

A TypeScript library that extends SVG path syntax with variables, expressions, control flow, and functions.

## Features

- **Variables** - Define and reuse values with `let`
- **Expressions** - Use `calc()` for math operations
- **Control flow** - `for` loops and `if/else` conditionals
- **Functions** - Define reusable path generators
- **Standard library** - Built-in math functions and shape helpers
- **CLI** - Compile from command line or integrate into build tools
- **Browser compatible** - Works in Node.js and browsers
- **[Interactive Playground](https://pathogen.studio/)** - Try it in your browser

## Try It

**[Open the Playground](https://pathogen.studio/)** to experiment with the syntax interactively. Features live preview, built-in examples, and shareable URLs.

## Installation

```bash
npm install pathogen-lang
```

## Quick Start

### CLI Usage

```bash
# Compile inline code
npx pathogen-lang -e 'circle(100, 100, 50);'
# Output: M 50 100 a 50 50 0 1 1 100 0 a 50 50 0 1 1 -100 0

# Compile a file
npx pathogen-lang input.pathogen

# Output as SVG file
npx pathogen-lang -e 'circle(100, 100, 50);' --output-svg-file=circle.svg
```

Once the package is installed, the shorter `pathogen` command does the same. Without a local install, `npx pathogen` would fetch a different npm package of that name, so scripts should use `pathogen-lang`.

### Library Usage

```typescript
import { compile, generateSvg } from 'pathogen-lang';

const result = compile(`
  let r = 50;
  let cx = 100;
  let cy = 100;
  circle(cx, cy, r);
`);

// The path data of the program's drawing
const pathData = result.layers[0].data;
const svg = `<svg viewBox="0 0 200 200">
  <path d="${pathData}" fill="none" stroke="black"/>
</svg>`;

// Or the whole document, with every layer, style and definition
const svgDocument = generateSvg(result, { viewBox: '0 0 200 200' });
```

### Loading fonts in Node

`compile()` reads no files. When a program uses `@font`, load its fonts first and pass them in. `pathogen-lang/node` loads them the way the CLI does: files inside the [project folder](https://pathogen.studio/docs#projects-the-project-folder), installed fonts, then Google Fonts through a download cache.

```typescript
import { readFileSync } from 'node:fs';
import { dirname, relative, sep } from 'node:path';

import { buildFontRegistry, compile, ensureOpentype, resolveFonts } from 'pathogen-lang';
import {
  createNodeFontHost,
  defaultCacheDir,
  findProjectRoot,
  fontDirsFromEnv,
  loadProjectFileSync,
  offlineReason,
} from 'pathogen-lang/node';

const file = 'poster/main.pathogen';
const source = readFileSync(file, 'utf8');
const programDir = dirname(file);

// The project folder, and a check of its pathogen.json, as the CLI does.
const { root, projectFile } = findProjectRoot(programDir);
if (projectFile) {
  const project = loadProjectFileSync(projectFile);
  if (!project.ok) throw new Error(project.message);
}

const host = createNodeFontHost({
  root,
  programDir,
  offlineReason: offlineReason(false), // honours PATHOGEN_OFFLINE=1
  cacheDir: defaultCacheDir(), // honours PATHOGEN_CACHE_DIR
  fontDirs: fontDirsFromEnv(process.env.PATHOGEN_FONT_DIRS),
});

// The program's path inside the project folder, with forward slashes.
const entry = `/${relative(root, file).split(sep).join('/')}`;
const { fonts, messages } = await resolveFonts(source, { host, entry });
for (const m of messages) {
  const where = m.line === undefined ? file : `${file}:${m.line}:${m.column}`;
  console.error(`${where}: ${m.severity}: ${m.message}`);
}
// An error means a font could not be loaded. A warning lets the compile run:
// with downloads off, a family that isn't found leaves only the calls that
// need it (PathBlock.fromGlyph, TextBlock.toPathBlock(), Font.*) to fail.
if (messages.some((m) => m.severity === 'error')) process.exit(1);

// Fonts are parsed with opentype.js, which loads on demand: load it before
// building the font registry.
await ensureOpentype();
const result = compile(source, { fonts: buildFontRegistry(fonts).registry });
```

## Syntax Overview

```
// Variables
let radius = 50;
let cx = 100;
let cy = 100;

// Use variables directly
M cx cy

// Math expressions use calc()
L calc(cx + radius) calc(cy * 2)

// For loops
for (i in 0..5) {
  circle(calc(20 + i * 40), 100, 15);
}

// Conditionals
if (radius > 30) {
  circle(cx, cy, radius);
} else {
  rect(cx, cy, 50, 50);
}

// Custom functions
fn diamond(x, y, size) {
  M x calc(y - size)
  L calc(x + size) y
  L x calc(y + size)
  L calc(x - size) y
  Z
}

diamond(100, 100, 40);
```

## Standard Library

### Math Functions

`sin`, `cos`, `tan`, `sqrt`, `abs`, `min`, `max`, `floor`, `ceil`, `round`, `pow`, `ln`, `exp`, `lerp`, `clamp`, `map`, `rad`, `deg`, `PI()`, `TAU()`, `random`

### Path Functions

| Function | Description |
|----------|-------------|
| `circle(cx, cy, r)` | Draw a circle |
| `rect(x, y, w, h)` | Draw a rectangle |
| `roundRect(x, y, w, h, r)` | Rounded rectangle |
| `polygon(cx, cy, r, sides)` | Regular polygon |
| `star(cx, cy, outer, inner, points)` | Star shape |
| `line(x1, y1, x2, y2)` | Line segment |
| `arc(rx, ry, rot, large, sweep, x, y)` | Arc |

## Documentation

- [Syntax Reference](https://pathogen.studio/docs#syntax-syntax-reference) - Complete language syntax
- [Standard Library](https://pathogen.studio/docs#stdlib-standard-library-reference) - All built-in functions
- [CLI Reference](https://pathogen.studio/docs#cli-cli-reference) - Command line options
- [Examples](https://pathogen.studio/docs#examples-examples) - Practical examples and recipes

## CLI Options

```
<file>                    Input source file (or --src=<file>)
<folder>                  The "main" named in <folder>/pathogen.json
-e <code>                 Inline code
-o, --output <file>       Output path data to file
--output-svg-file=<file>  Output complete SVG file
--root=<folder>           Project folder for @font paths (default: nearest pathogen.json, else the file's folder)
--offline                 Never download fonts (PATHOGEN_OFFLINE=1 does the same)

SVG styling (with --output-svg-file):
--stroke=<color>          Stroke color (default: #000)
--fill=<color>            Fill color (default: none)
--stroke-width=<n>        Stroke width (default: 2)
--viewBox=<box>           ViewBox (default: 0 0 200 200)
--width=<w>               Width (default: 200)
--height=<h>              Height (default: 200)
```

## Development

```bash
npm install
npm run build    # Build production bundles
npm test         # Run tests
npm run dev      # Build with watch mode
```

### Changelog Reminder Hook

Contributors can opt in to a gentle reminder after each commit if `CHANGELOG.md` was not updated:

```bash
scripts/install-git-hooks.sh
```

### Website Development

```bash
npm run build:website   # Build docs, blog, and playground
npm run dev:website     # Build and serve locally at http://localhost:3000
```

The playground is deployed to CloudFlare Pages with KV storage for workspace persistence.

**Local Development with KV Emulation:**

When you run `npm run dev:website`, Wrangler automatically emulates CloudFlare KV locally:

- Local data is stored in `.wrangler/state/v3/kv/`
- Data persists between restarts
- Completely isolated from production (local changes don't affect deployed site)
- Start fresh by deleting the `.wrangler/` directory

To test against real CloudFlare KV (requires authentication):

```bash
npx wrangler pages dev public --port 3000 --remote
```

**Thumbnail Infrastructure (R2):**

Workspace thumbnails are stored in CloudFlare R2. Two buckets are required:

```bash
npx wrangler r2 bucket create svg-path-extended-thumbnails
npx wrangler r2 bucket create svg-path-extended-thumbnails-preview
```

The admin backfill endpoint (`/admin/thumbnails`) requires an `ADMIN_TOKEN` secret on the `pathogen-api` Worker (after the API split, admin endpoints live on the Workers project, not Pages). To set or rotate it:

```bash
npm run rotate-admin-token   # generates a fresh token, sets it on pathogen-api, redeploys, prints the URL
# or manually:
cd api && npx wrangler secret put ADMIN_TOKEN
```

To view the current token value, go to **Cloudflare Dashboard → Workers & Pages → pathogen-api → Settings → Variables and Secrets**. Secrets are write-only via CLI, so the dashboard is the only way to retrieve it.

Access the admin backfill screen at:

```
https://pathogen.studio/admin/thumbnails?token=<ADMIN_TOKEN>
```

### Blog

Create a new blog post:

```bash
npm run new:blog
```

This prompts for title, slug, date, and description. You can also pass arguments:

```bash
npm run new:blog -- --title="My Post" --slug="my-post" --description="About this post"
```

Blog posts are markdown files in `website/blog/` with YAML frontmatter:

```yaml
---
title: "Post Title"
date: "2026-01-28"
slug: "post-slug"
description: "Brief description for the listing."
---

# Post Title

Content goes here...
```

After editing, rebuild and preview:

```bash
npm run build:blog      # Regenerate blog content
npm run dev:website     # Preview locally
```

## License

MIT
