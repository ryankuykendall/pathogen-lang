---
title: "Building the Gradient Pipeline: From Compiler to Blog"
date: "2026-03-06"
slug: "gradient-pipeline"
description: "How Pathogen's gradient system flows from .pathogen source through the compiler, GPU renderer, and blog build pipeline to produce the interactive demos in this series."
---

This post is about the posts. Every interactive demo in this gradient series — the color wheels, mesh grids, terrain maps, abstract compositions — follows the same path from source code to your screen. A `.pathogen` file is compiled to an SVG with embedded base64 images, wrapped in a `<mini-workspace>` component, and served as part of a static blog that works with or without JavaScript.

Understanding this pipeline explains why the system works the way it does, and where each layer of abstraction earns its keep.

## The Pipeline

The compilation pipeline has five stages. Source code enters on the left. An interactive blog embed exits on the right.

<mini-workspace src="samples/post5/pipeline-flow.pathogen" caption="Five stages: source, compiler, GPU renderer, SVG output, blog embed"></mini-workspace>

1. **.pathogen source**: Variables, expressions, gradient definitions, layer assignments, GroupLayer composition. This is what the author writes.

2. **Compiler**: Parses the source into an AST, evaluates expressions, resolves variable bindings, processes gradient initializer blocks, builds the layer tree. The output is a structured `LayerOutput[]` array with gradient definitions, path data, and text content.

3. **GPU renderer**: For gradient types that require rasterization (conic, mesh, freeform, topological), a WebGPU shader (or Canvas 2D fallback) renders the gradient to a pixel buffer at the specified resolution. The result is encoded as a base64 PNG.

4. **SVG + base64**: The compiler emits a complete SVG document. Native gradients (`<linearGradient>`, `<radialGradient>`) are SVG elements. GPU-rendered gradients become `<pattern>` elements containing `<image>` elements with base64 data URLs.

5. **Blog**: The blog build script reads `.pathogen` source and pre-compiled `.svg` pairs, encodes the source as a base64 attribute, and embeds both in a `<mini-workspace>` custom element.

## GroupLayer

The demos in this series use `GroupLayer` extensively for scene composition. `GroupLayer` maps to SVG's `<g>` element — it groups child layers into a logical unit that can be positioned, styled, and nested.

```pathogen
let card = GroupLayer('card-1') ${
  translate-x: 20;
  translate-y: 25;
};
card.append(fill_layer, label_layer, tag_layer)
```

The `translate-x`, `translate-y`, `rotate`, and `scale` convenience properties in the style block compile to a `transform` attribute on the `<g>` element. This is simpler than writing raw `transform: translate(20, 25)` and composes correctly when multiple transforms are needed (the order is always translate, rotate, scale).

The `.append()` method adds child layers to the group. Children render in append order. When a layer is appended to a new group, it is automatically removed from any previous group — no duplicate references.

<mini-workspace src="samples/post5/grouplayer-cards.pathogen" caption="Three cards positioned with GroupLayer translate — mixing native and GPU gradients" code-open></mini-workspace>

Notice that the three cards use three different gradient rendering strategies. The `LinearGradient` card compiles to a native SVG element. The `RadialGradient` card does the same. The `TopoGradient` card is GPU-rendered to a base64 image. All three are composed in the same `GroupLayer` tree — the rendering strategy is transparent to the scene composition layer.

## CLI --render-gpu

The Pathogen CLI compiles `.pathogen` files to SVG from the command line. By default, it uses string-based SVG generation — fast, no dependencies, but limited to native gradient types. GPU-rendered gradients (conic, mesh, freeform, topo) fall back to simplified representations.

The `--render-gpu` flag enables headless GPU rendering via Puppeteer. The CLI launches a headless Chrome instance, loads the playground's rendering pipeline, and captures the GPU output as base64 images. This produces the same pixel-perfect results as the interactive playground.

```bash
npx pathogen compile input.pathogen -o output.svg --render-gpu
```

GPU rendering auto-detects whether the source uses any GPU gradient types. If the source only contains linear and radial gradients, no browser is launched — the fast path handles everything. This makes `--render-gpu` safe to use unconditionally.

## Mini-Workspace Component

The `<mini-workspace>` custom element powers every demo in this blog series. It is a progressive enhancement component — the static HTML build includes syntax-highlighted code and a pre-rendered SVG image, so the post works without JavaScript. When JS loads, the component upgrades to an interactive experience:

- **Code panel**: A CodeMirror editor (loaded on demand from CDN) with Pathogen syntax highlighting. Read-only, but scrollable and searchable.
- **SVG preview**: The pre-compiled SVG rendered as an `<img>` element.
- **Code toggle**: Show or hide the code panel. Demos marked with `code-open` start with code visible.
- **Open in Playground**: Encodes the source into a URL and opens the full playground editor, where you can modify the code and see live results.

The embed syntax in markdown is a single HTML tag:

```html
<mini-workspace src="samples/post1/linear-basics.pathogen"
                caption="Description of the demo"
                code-open></mini-workspace>
```

The blog build script (`scripts/build-blog.ts`) processes these tags during compilation. It reads the `.pathogen` source file, base64-encodes it into a `code-data` attribute, finds the paired `.svg` file, and embeds it as a fallback `<img>`. The result is a self-contained HTML block that works in both the SPA and the static SEO pages.

## Blog Build Pipeline

The blog build script produces two outputs from each markdown file:

1. **SPA content** (`playground/utils/blog-content.js`): A JavaScript module exporting a `blogIndex` array (title, slug, date, description) and a `posts` object mapping slugs to full HTML content. The playground's blog reader component loads this module and renders posts client-side.

2. **Static HTML** (`website/blog-static/`): Fully rendered HTML pages with inline CSS, syntax highlighting, and navigation. These are served by the Cloudflare Pages worker for SEO crawlers and work in any browser without JavaScript.

The `processMiniWorkspaceTags()` function handles the `<mini-workspace>` transformation — reading source files, encoding content, embedding SVG fallbacks, and generating syntax-highlighted code blocks. It runs during both SPA and static builds, producing identical embedded content.

```bash
npm run build:blog    # Compile all posts
npm run build:website # Full site build (includes blog)
npm run dev:website   # Build + serve at localhost:3000
```

## All Six Types

The gallery below shows all six gradient types in a single Pathogen source file. The top row — Linear, Radial, Conic — spans the range from native SVG to GPU-rendered. The bottom row — Mesh, Freeform, Topo — represents gradient models that have never existed in any web standard.

<mini-workspace src="samples/post5/gradient-gallery.pathogen" caption="The complete Pathogen gradient system — six types, one language"></mini-workspace>

Each type is covered in detail in the preceding posts:

- [Linear and Radial](/pathogen/blog/gradient-linear-radial) — native SVG elements with OKLCH interpolation, spread methods, and inheritance
- [Conic](/pathogen/blog/gradient-conic) — angular sweeps with WebGPU rendering, partial arcs, inner radius, and fill modes
- [Mesh and Freeform](/pathogen/blog/gradient-mesh-freeform) — grid-based and scatter-based color fields with GPU-accelerated bilinear and IDW blending
- [Topological](/pathogen/blog/gradient-topological) — contour-based gradients using signed distance fields and Laplace solvers

## Closing

The gradient system is built in layers. At the bottom, `Color` and OKLCH give us a perceptually uniform foundation. Above that, six gradient types cover the full range from standard SVG primitives to novel GPU-rendered models. `GroupLayer` and the layer system compose these gradients into scenes. The compiler turns it all into portable SVG. The rendering pipeline ensures every gradient looks the same whether it runs in a WebGPU shader or a headless Chrome instance.

Each layer does one thing. The source language does not know about rendering. The renderer does not know about blog embeds. The blog build does not know about GPU shaders. This separation is what makes the system tractable — each piece can be understood, tested, and modified independently.

The result is a language where you can write `let g = TopoGradient(...)` and have it appear as an interactive demo in a blog post. Every layer in between is infrastructure that earns its complexity by staying out of the way.
