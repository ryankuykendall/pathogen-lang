# pathogen-lang

The compiler, language services, and web playground for **Pathogen** — a typed, expression-first language for SVG paths. Source for the [`svg-path-extended`](https://www.npmjs.com/package/svg-path-extended) npm package and [pathogen.studio](https://pathogen.studio).

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
npm install svg-path-extended
```

## Quick Start

### CLI Usage

```bash
# Compile inline code
npx svg-path-extended -e 'circle(100, 100, 50)'
# Output: M 50 100 A 50 50 0 1 1 150 100 A 50 50 0 1 1 50 100

# Compile a file
npx svg-path-extended --src=input.svgx

# Output as SVG file
npx svg-path-extended -e 'circle(100, 100, 50)' --output-svg-file=circle.svg
```

### Library Usage

```typescript
import { compile } from 'svg-path-extended';

const pathData = compile(`
  let r = 50;
  let cx = 100;
  let cy = 100;
  circle(cx, cy, r)
`);

// Use in SVG
const svg = `<svg viewBox="0 0 200 200">
  <path d="${pathData}" fill="none" stroke="black"/>
</svg>`;
```

## Syntax Overview

```
// Variables
let radius = 50;
let cx = 100;

// Use variables directly
M cx cy

// Math expressions use calc()
L calc(cx + radius) calc(cy * 2)

// For loops
for (i in 0..5) {
  circle(calc(20 + i * 40), 100, 15)
}

// Conditionals
if (radius > 30) {
  circle(cx, cy, radius)
} else {
  rect(cx, cy, 50, 50)
}

// Custom functions
fn diamond(x, y, size) {
  M x calc(y - size)
  L calc(x + size) y
  L x calc(y + size)
  L calc(x - size) y
  Z
}

diamond(100, 100, 40)
```

## Standard Library

### Math Functions

`sin`, `cos`, `tan`, `sqrt`, `abs`, `min`, `max`, `floor`, `ceil`, `round`, `pow`, `log`, `exp`, `lerp`, `clamp`, `map`, `rad`, `deg`, `PI`, `TAU`, `random`

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

- [Syntax Reference](docs/syntax.md) - Complete language syntax
- [Standard Library](docs/stdlib.md) - All built-in functions
- [CLI Reference](docs/cli.md) - Command line options
- [Examples](docs/examples.md) - Practical examples and recipes

## CLI Options

```
--src=<file>              Input source file
-e <code>                 Inline code
-o, --output <file>       Output path data to file
--output-svg-file=<file>  Output complete SVG file

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

The admin backfill endpoint (`/pathogen/admin/thumbnails`) requires an `ADMIN_TOKEN` secret. To set or rotate it:

```bash
npx wrangler pages secret put ADMIN_TOKEN --project-name svg-path-extended
```

To view the current token value, go to **Cloudflare Dashboard → Pages → svg-path-extended → Settings → Environment variables**. Secrets are write-only via CLI, so the dashboard is the only way to retrieve it.

Access the admin backfill screen at:

```
https://pedestal.design/pathogen/admin/thumbnails?token=<ADMIN_TOKEN>
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
