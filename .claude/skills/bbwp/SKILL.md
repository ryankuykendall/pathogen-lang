---
name: bbwp
description: Compile a .pathogen file to SVG and archive as a browser-previewable HTML artifact. Auto-detects whether GPU rendering is needed. Use when the user says "/bbwp <file>" or asks to "compile as a bbwp" or wants to preview pathogen output.
---

# BBWP Compilation Skill

## Purpose

Compile a `.pathogen` source file to SVG and save the result as a self-contained, browser-previewable HTML artifact in `website/bbwp/`. The script auto-detects whether the source uses GPU gradient types (ConicGradient, MeshGradient, FreeformGradient, TopoGradient) and chooses the appropriate rendering path:

- **GPU path**: Launches headless Chrome via Puppeteer to render gradients through the WebGPU/Canvas 2D pipeline
- **CPU path**: Uses the CLI's string-based SVG generator directly — no Puppeteer required, much faster

## When to Use

- User types `/bbwp <file>`
- User asks to "compile as a bbwp" or "render as a bbwp"
- User wants to preview the SVG output of any .pathogen file in a browser

## Instructions

### Step 1: Run the compile-bbwp script

```bash
npx tsx scripts/compile-bbwp.ts <file> [options]
```

The script handles everything automatically:
- Auto-detects viewBox/width/height from source comments
- Auto-derives roadmap name from `project-docs/<roadmap>/` path structure
- Auto-derives feature name from the filename
- Auto-detects whether GPU rendering is needed
- Compiles to SVG (via Puppeteer or string-based, as appropriate)
- Wraps the SVG in a self-contained HTML page
- Saves to `website/bbwp/` with timestamp-based naming
- Updates the `website/bbwp/index.html` listing

**Available options** (all optional — auto-detection handles most cases):
- `--roadmap <name>` — override the roadmap name
- `--feature <name>` — override the feature name
- `--viewBox <box>` — override SVG viewBox
- `--width <w>` — override SVG width
- `--height <h>` — override SVG height
- `--scale <n>` — GPU scale factor 1-4 (default: 2)
- `--gpu` — force GPU rendering via headless Chrome
- `--no-gpu` — force string-based rendering (skip Puppeteer)
- `--stroke <color>` — default stroke color
- `--fill <color>` — default fill color
- `--stroke-width <w>` — default stroke width

### Step 2: Start the BBWP server (if not already running)

```bash
npm run serve:bbwp
```

Run this in the background. The server serves at http://localhost:3001.

### Step 3: Report the results

Tell the user:
- The output filename and size
- The rendering mode used (GPU or string-based) and why
- The URL to view it: `http://localhost:3001/website/bbwp/<filename>`
- The index URL: `http://localhost:3001/website/bbwp/`
- Remind them the file is not yet in version control — they can `git add` it if desired

## Prerequisites

- The library must be built first (`npm run build`) — required for both rendering paths
- Puppeteer must be installed (`npm install`) — only required when GPU rendering is used

## File Naming Convention

Output files follow: `YYYY-MM-DD-HH:MM:SS--{roadmap}--{feature}.html`

Files are never overwritten — each compilation creates a new timestamped file to preserve history.

## Example Invocations

- `/bbwp project-docs/topological-gradient/topo-showcase-large.pathogen`
- `/bbwp project-docs/pattern-conic-gradient/phase3-demo.pathogen`
- "compile this pathogen file as a bbwp"
- "render the topo showcase as a bbwp and start the server"
