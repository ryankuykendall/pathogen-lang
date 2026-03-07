# Gradient Blogpost Roadmap

## Context

Produce a 5-part blog series covering all gradient work in Pathogen (Linear/Radial, Conic, Mesh/Freeform, TopoGradient, and a meta post about the pipeline itself). This requires building a complete pipeline from new compiler features through automated rendering to blog publishing.

Phases have been reordered from the original sketch based on dependency analysis — GroupLayer (a compiler feature with no blog dependencies) comes first so all downstream phases can use it.

## Decisions Log

| Decision | Choice | Rationale |
|----------|--------|-----------|
| CLI vs separate script for GPU rendering | New CLI flag (`--render-gpu`) | Keeps all compilation in one tool |
| Output format for rasterized gradients | Embedded base64 data URLs | Self-contained SVGs, works everywhere |
| Blog format | Static HTML + progressive enhancement | SEO optimized, works without JS |
| GroupLayer nesting | Nestable (groups can contain groups) | Matches SVG's `<g>` nesting model |
| GroupLayer attributes | Full SVG `<g>` attributes | translate, scale, rotate, opacity, clip-path, mask, filter |
| GroupLayer transforms | Declarable via style block `${...}` or imperative `.ctx.transform` API | Consistent with PathLayer/TextLayer style block pattern |
| Mini-workspace interactivity | Display-only + "Open in playground" link | No compiler loaded in blog pages |
| Mini-workspace code panel | Toggleable visibility with configurable default state | End-user toggle button + developer `code-open` attribute |
| BBWP and Puppeteer page | Unified — one page serves both roles | No code duplication |
| GPU rendering code | Reuse playground/gpu/ modules directly | Single rendering code path |
| Code samples | Mix of new + updated existing showcases | Existing showcases updated with GroupLayer |
| Blog post count | 5 posts | Linear/Radial, Conic, Mesh/Freeform, Topo, Pipeline meta |
| Blog authoring format | Markdown + `<mini-workspace>` custom tags | Consistent with existing blog pipeline |

## Dependency Graph

```
Phase 1: GroupLayer (compiler)
    │
    v
Phase 2: BBWP + CLI --render-gpu
    │
    v
Phase 3: Mini-Workspace Component
    │
    v
Phase 4: Code Samples
    │
    v
Phase 5: Blog Authoring & Publishing
```

---

## Phase 1: GroupLayer

**Goal**: Add `GroupLayer` as a new layer type based on SVG `<g>`, supporting nesting and full `<g>` attributes.

### Syntax

```pathogen
// Definition
define GroupLayer('panel') ${ opacity: 0.8; }

// Constructor expression
let g = GroupLayer('annotations') ${ };

// Transforms via style block
let g2 = GroupLayer('rotated') ${
  transform: translate(100, 200) rotate(45deg);
  opacity: 0.8;
  clip-path: url(#clip1);
}

// Transforms via imperative API (equivalent)
g.ctx.transform.translate.set(100, 200)
g.ctx.transform.rotate.set(45deg)

// Children defined inside apply block
group('panel').apply {
  let bg = PathLayer('bg') ${ fill: #eee; };
  bg.apply { rect(0, 0, 200, 200) }

  let label = TextLayer('label') ${ font-size: 14; fill: #333; };
  label.apply { text(10, 20)`Panel Title` }

  // Nested group
  let inner = GroupLayer('detail') ${ opacity: 0.6; };
  inner.apply {
    let line = PathLayer('line') ${ stroke: red; };
    line.apply { M 10 30 L 190 30 }
  }
}
```

### Implementation

**`src/parser/ast.ts`** — Extend `LayerDefinition.layerType` and `LayerConstructorExpression.layerType` unions to include `'GroupLayer'`

**`src/parser/index.ts`** — Add `GroupLayer` to the layer type regex in `layerConstructorExpression` (~line 483) and `layerDefinition` (~line 859). Add `group('name').apply` as a shorthand for `layer('name').apply` when the target is a GroupLayer.

**`src/evaluator/index.ts`** — Core changes:
- New `GroupLayerState` interface alongside PathLayerState/TextLayerState/FragmentLayerState (~line 409):
  ```typescript
  interface GroupLayerState {
    name: string;
    layerType: 'GroupLayer';
    isDefault: false;  // groups cannot be default
    styles: LayerStyle;
    children: LayerState[];
    childOrder: string[];
    transformState: TransformState;
  }
  ```
- Add `parentGroup: GroupLayerState | null` to `EvaluationState` (~line 611)
- `evaluateLayerConstructor` (~line 1101): Add `GroupLayer` branch
- `LayerDefinition` case (~line 4293): Add `GroupLayer` handling; when `parentGroup` is set, register as child of group instead of top-level
- `LayerApplyBlock` case (~line 4344): Relax "cannot nest" restriction when outer block is a GroupLayer. Set `parentGroup` context so child definitions register correctly.
- Style block `${...}` on GroupLayer: parse `transform`, `opacity`, `clip-path`, `mask`, `filter` from style block and apply to the group's transform state and attributes (consistent with how PathLayer/TextLayer handle style blocks)
- `buildCompileResult` (~line 4658): Recursively produce `LayerOutput` with `type: 'group'` and `children` array
- `LayerOutput` interface: Add `type: 'group'` and `children?: LayerOutput[]`
- Nesting depth guard: max 10 levels

**`src/cli.ts`** — `generateSvg()`: Recursively render `type: 'group'` as `<g>` elements wrapping child elements. Apply transform, opacity, clip-path, mask, filter attributes.

**`docs/layers.md`** — GroupLayer section with syntax, nesting, transforms (both style block and imperative API), examples

**`tests/layers.test.ts`** — ~15 new tests:
- Define GroupLayer with styles
- GroupLayer constructor expression
- GroupLayer with style block transforms `${ transform: translate(100, 200) rotate(45deg); }`
- PathLayer children
- TextLayer children
- Nested GroupLayer children
- Group-level opacity, clip-path, mask, filter
- Group transforms (translate, rotate, scale) — both style block and imperative API
- Error: GroupLayer cannot be default
- Error: duplicate layer name within group
- Correct nested LayerOutput structure
- CLI generates nested `<g>` SVG elements
- Max nesting depth guard

### Verification
1. `npm run test:run` — all tests pass
2. `npm run build` — library builds
3. CLI: `--output-svg-file` produces correct nested `<g>` elements
4. Visual: load SVG in browser, verify transforms cascade correctly

---

## Phase 2: BBWP + CLI `--render-gpu`

**Goal**: A unified bare-bones web page that both Puppeteer (for `--render-gpu` CLI) and developers (for manual verification) can use. Imports the existing `playground/gpu/` modules directly — no code duplication.

### Architecture

```
CLI (Node.js)                        BBWP (Browser)
─────────────                        ─────────────
Compile .pathogen source             Load dist/index.global.js
Detect GPU gradients                 Import playground/gpu/gradient-service.js
Launch Puppeteer ──────────────────► Page receives CompileResult
                                     gradient-service renders all GPU gradients
                                     Build SVG DOM with embedded data URL PNGs
Extract SVG string ◄──────────────── window.__RENDERED_SVG__
Write to --output-svg-file
```

### Files

**`playground/bbwp.html`** (NEW) — Minimal HTML page:
- Loads `dist/index.global.js` (compiler global)
- Imports `gpu/gradient-service.js` as ES module
- Orchestrator function: receives CompileResult → renders gradients → builds SVG DOM → serializes via XMLSerializer → sets `window.__RENDERED_SVG__`
- When opened manually: shows a textarea to paste CompileResult JSON + a render button

**`playground/utils/svg-builder.js`** (NEW) — Shared SVG DOM building logic extracted from `svg-preview-pane.js` `setLayersWithTiming` (lines 115-310). Used by both the BBWP and potentially the preview pane itself:
- Creates SVG element with viewBox/width/height
- Builds `<defs>` (masks, clipPaths, gradients, patterns)
- For GPU gradients: creates `<pattern>` with `<image href="data:...">` using rendered data URLs
- For native gradients: standard SVG gradient elements
- Builds layer elements (path, text, fragment, group)
- Returns serialized SVG string

**`src/cli.ts`** — Add `--render-gpu` flag:
- Detects GPU-dependent gradients: `result.gradients.some(g => ['conic','mesh','freeform','topo'].includes(g.type))`
- Launches Puppeteer with the BBWP page via local HTTP server (not `file://` — ES module imports need HTTP)
- Passes CompileResult to page, waits for `window.__RENDERED_SVG__`
- Falls through to normal `generateSvg()` when no GPU gradients detected

**`scripts/serve-bbwp.ts`** (NEW) — Simple HTTP server for manual BBWP usage

### Dependencies
- Add `puppeteer` as devDependency

### Risks
- WebGPU in headless Chrome may need `--enable-unsafe-webgpu` flag; Canvas 2D fallback in gradient-service handles the case
- ES module imports require HTTP server (not `file://`)
- Large gradient data URLs (~100KB-1MB); consider resolution cap for CLI output

### Verification
1. `npx tsx src/cli.ts --src=test.pathogen --render-gpu --output-svg-file=test.svg` with a conic gradient
2. Open output SVG in browser — gradient renders correctly
3. Compare to playground rendering — should be identical
4. Test without `--render-gpu` — existing behavior unchanged
5. Test with no GPU gradients + `--render-gpu` — falls through to normal path

---

## Phase 3: Mini-Workspace Web Component

**Goal**: Display-only web component for blog posts showing pre-compiled SVG + syntax-highlighted code, with progressive enhancement for SEO.

### Component Structure

```
<mini-workspace>
  ├── toolbar
  │   ├── Code toggle button (show/hide code panel)
  │   └── "Open in Playground" button
  ├── code-panel (left, toggleable)
  │   ├── Read-only CodeMirror (Pathogen syntax highlighting)
  │   └── copy-button
  └── preview-panel (right)
      ├── Zoomable/pannable SVG display
      └── Image navigator minimap (top-left)
```

### Code Panel Toggle

The code panel can be shown or hidden by the end-user via a toggle button in the toolbar. The developer embedding the component controls the default state:

```html
<!-- Code panel open by default -->
<mini-workspace code-open>
  ...
</mini-workspace>

<!-- Code panel closed by default (preview-only initially) -->
<mini-workspace>
  ...
</mini-workspace>
```

- **`code-open` attribute** (boolean): When present, the code panel is visible on initial render. When absent, the component starts with the code panel hidden (preview-only).
- **Toggle button**: Always visible in the toolbar. Uses a code icon (e.g., `</>`) to toggle the code panel open/closed. Tooltip: "Show code" / "Hide code".
- **Responsive behavior**: On mobile viewports, the code panel stacks above the preview when visible.

### Progressive Enhancement

Static HTML (SEO/no-JS fallback):
```html
<mini-workspace code-data="base64encodedcode" code-open>
  <pre><code class="language-pathogen">...source code...</code></pre>
  <img src="samples/example.svg" alt="..." loading="lazy">
</mini-workspace>
```

When component upgrades: replaces static content with interactive CodeMirror + pannable preview, preserving the `code-open` state.

### Files

**`playground/components/blog/mini-workspace.js`** (NEW) — Main component. Shadow DOM, side-by-side layout (responsive: stacks vertically on mobile). Lazy-loads CodeMirror via dynamic `import()`. Manages code panel visibility state via `code-open` attribute and toggle button.

**`playground/components/blog/mini-preview.js`** (NEW) — Simplified SVG preview extracted from `svg-preview-pane.js`. Keeps: mouse wheel zoom, click-drag pan, navigator minimap, zoom controls (+/-/fit). Removes: layer management, store subscriptions, gradient orchestration, style controls.

### Reused Components
- `playground/utils/codemirror-setup.js` — Read-only mode per `annotated-pane.js` pattern: `EditorState.readOnly.of(true)` + `EditorView.editable.of(false)`
- `playground/components/shared/copy-button.js` — As-is
- Theme CSS variables from `styles/theme.css`

### "Open in Playground" Button
Generates URL: `/pathogen/new?code=base64encodedcode` — new-workspace view consumes URL params

### Storybook
Add entry in `playground/utils/storybook-registry.js` with examples showing:
- Default state (code closed)
- `code-open` state
- Toggle interaction

### Verification
1. Storybook: `/storybook/mini-workspace`
2. Light + dark theme
3. Code toggle button shows/hides code panel correctly
4. `code-open` attribute sets correct initial state
5. Copy button, zoom/pan, navigator
6. "Open in Playground" navigation
7. JS-disabled: verify static code + image renders

---

## Phase 4: Code Samples

**Goal**: Create all .pathogen samples for the 5-part blog series. Mix of new purpose-built samples and existing showcases updated with GroupLayer.

### Samples by Post

| Post | Topic | ~Samples |
|------|-------|----------|
| 1 | Linear/Radial | 5-6: basics, angles, OKLCH vs sRGB, inheritance, spread modes, combined illustration |
| 2 | Conic Variants | 5-6: color wheel, partial arc, CW/CCW, inner radius, spread modes, clock face |
| 3 | Mesh/Freeform | 5-6: mesh basics, mesh detail, freeform scatter, falloff control, sunset landscape, mesh vs freeform |
| 4 | TopoGradient | 5-6: basics, overlapping contours, distance vs laplace, easing modes, terrain map |
| 5 | Pipeline Meta | 3-4: GroupLayer organization, before/after --render-gpu, pipeline diagram |

### Directory Structure
```
website/blog/samples/
  post1/   *.pathogen + *.svg pairs
  post2/
  post3/
  post4/
  post5/
```

### Workflow per Sample
1. Write `.pathogen` source (use GroupLayer for labels/organization)
2. Compile: `npx tsx src/cli.ts --src=... --render-gpu --output-svg-file=... --viewBox="0 0 400 300"`
3. Verify SVG in browser
4. Commit both source and output

### Updating Existing Showcases
Save updated versions as new files (preserving originals per project artifact policy):
- `project-docs/topological-gradient/topo-showcase-v2-grouped.pathogen`
- etc.

### Batch Compilation Script
**`scripts/compile-samples.ts`** (NEW) — Compiles all `.pathogen` files in `website/blog/samples/` to SVGs via `--render-gpu`

---

## Phase 5: Blog Authoring & Publishing

**Goal**: Write and publish 5 Markdown blog posts with embedded `<mini-workspace>` components.

### Blog Posts

1. **"Painting with Math: Linear and Radial Gradients in Pathogen"** — Intro to gradient system, coordinate systems, OKLCH interpolation, spread methods
2. **"Beyond CSS: Conic Gradients with WebGPU Rendering"** — Why SVG lacks conics, Pathogen's API, WebGPU shader pipeline, Canvas 2D fallback
3. **"Mesh and Freeform: Gradients That SVG Forgot"** — SVG2's abandoned meshGradient, Coons patch interpolation, IDW blending
4. **"Topological Gradients: Painting with Signed Distance Fields"** — Contour-as-color-stop model, SDF vs Laplace, easing and blending
5. **"Building the Gradient Pipeline: From Compiler to Blog"** — Meta post on GroupLayer, --render-gpu, mini-workspace, tooling

### Files
```
website/blog/
  gradient-linear-radial.md
  gradient-conic.md
  gradient-mesh-freeform.md
  gradient-topological.md
  gradient-pipeline.md
```

### Build Pipeline Changes (`scripts/build-blog.ts`)

- Process `<mini-workspace src="...">` tags: read .pathogen source, inject pre-compiled code + SVG
- Register Pathogen syntax highlighting for highlight.js (or use JS highlighter with Pathogen keywords)
- Static blog pages load `components/blog/mini-workspace.js` via `<script type="module">`
- `scripts/build-website.ts`: copy `website/blog/samples/` SVGs to `public/pathogen/blog/samples/`

### Verification
1. `npm run build:blog` — all posts compile, mini-workspace tags processed
2. `npm run build:website && npm run dev:website` — full site with blog posts
3. Static HTML: crawlable code + images without JS
4. Interactive: CodeMirror + pannable preview upgrade correctly
5. Cross-references between posts work
6. Both light and dark themes

---

## Total Scope Summary

| Phase | New Files | Modified Files | Tests |
|-------|-----------|---------------|-------|
| 1: GroupLayer | 0 | 6 (ast, parser, evaluator, cli, index, layers.md) | ~15 new in layers.test.ts |
| 2: BBWP + CLI | 3-4 (bbwp.html, svg-builder.js, serve-bbwp.ts) | 2 (cli.ts, package.json) | ~10 in cli.test.ts |
| 3: Mini-workspace | 2-3 (mini-workspace.js, mini-preview.js) | 1 (storybook-registry.js) | Visual via storybook |
| 4: Code samples | ~30-40 (.pathogen + .svg pairs) | 2-3 (updated showcases) | Manual visual |
| 5: Blog posts | 5 (markdown files) | 2 (build-blog.ts, build-website.ts) | Manual visual + SEO check |
