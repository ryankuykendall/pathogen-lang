# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased] - 2026-04-10

### Added

#### Core
- Spread operator (`...`) and destructuring (array `[a, b, ...rest]`, object `{ x, y: alias, ...rest }`) in let declarations and for-each loops.
- Object merge (`<<`) operator for ObjectValue types.
- Multi-param trailing blocks for `.reduce()` and `.mapSlice()`.
- `squareGrid()`, `triangleGrid()`, and `hexagonGrid()` stdlib functions for grid-based pattern generation.
- `generateSvg()` exported from library — shared SVG document assembly used by CLI and VS Code preview.

#### Parser
- **Lezer migration complete** — Lezer is now the sole parser (Parsimmon fully removed). 213-line grammar replaces 1,558 lines of Parsimmon code.
- Mandatory semicolons on expression statements (function calls, assignments, let, return); block statements (for, if, fn, apply) do not require them.
- Optional trailing semicolons on text and tspan statements.
- Comments preserved in AST (top-level and block bodies) for formatter round-tripping.
- Fix: object literal property values now correctly parse function calls, method chains, and member access (previously dropped to NullLiteral).

#### Language Services
- **Completion engine rewrite** — generated from TypeScript API declarations via ts-morph instead of hand-maintained static data.
  - All 12 enums with 42 members now have completions.
  - 79 stdlib/constructor completions with accurate signatures.
  - 14 type member sets (93→118 total members) including Color instance (21 members), BoundingBox, and all layer types with `apply` method.
  - Type inference: Color constructors, hex literals, `layer()`, stdlib path functions, method return types (boundingBox→BBox, get→Point, lighten→Color), assignment propagation, map/loop callback parameters, object literal properties.
- **Formatter** — AST-based code formatter implementing the Pathogen style guide.
  - Always multi-line: arrays, objects, style blocks, enums, path blocks, text blocks, apply blocks.
  - Trailing commas on collections. One item per line.
  - Function call/def wrapping (5+ args, 4+ with complex args). Method chain wrapping (3+ steps).
  - Trailing block formatting with gradient stop column alignment.
  - Comment preservation through round-trips.
  - Range formatting and on-type formatting (auto-indent after `{`).
  - Lezer fallback for formatting code with missing semicolons.
  - Preserves trailing newline at end of file.
  - Semicolons on function calls and method calls in PathCommand context.
- **Diagnostics** — contextual Lezer error messages with 20+ specific patterns. Server-side debouncing (200ms default, 500ms mid-expression). Better message for incomplete member access (`bg.` → "Expected property or method name after 'bg.'"). Map/reduce callback errors include iteration index.
- **Semantic highlighting** — constructor types, enum names/members, SVG path commands classified via semantic tokens. All classification sets derived from generated data (no hardcoded lists).
- **Code actions** — extract variable, extract function, inline variable refactoring. Missing semicolon and typo suggestion quick fixes.
- **Code lens** — reference counts above variable, function, and enum declarations.
- **Inlay hints** — expanded type inference for Color, gradients, Mask, ClipPath, method returns, StyleBlockLiteral, merge operator.

#### VS Code Extension
- **Language server activation** — the extension now activates and runs all 16 language server features from installed .vsix packages.
- **Live preview panel** — compiles Pathogen source to SVG in real-time via bundled IIFE compiler.
  - Pan/zoom with navigator minimap.
  - Layer inspector with visibility toggles, color swatches, type badges.
  - CSS variable color pickers with live recompilation.
  - Color palette showing all colors across layers.
  - Recompile button (re-roll random values) and reset button.
  - ViewBox detection from source comments.
- **TextMate grammar** — constructor keyword highlighting (LinearGradient, Color, Point, etc.), trailing block pipe-param syntax (`{|g| ...}`).
- **Snippets** — 29 total (up from 18): gradients, Color, textblock, styleblock, Point, CSSVar, viewBox, new file template.
- **Build pipeline** — `npm run build:vscode:install` builds and installs the complete .vsix with all dependencies bundled.
- **Workspace integration** — captures workspace root, task definitions, problem matcher for CLI errors.

#### Playground
- Inspector panel with stacked layers, palette, and CSS variable panels.
- Completion UX fix — error panel no longer covers completion popups (z-index override + longer debounce during member access).
- Error panel badge showing error count.

#### Documentation
- Formatter style guide and 25-question formatting questionnaire.
- 10-phase VS Code developer experience roadmap.
- Deduplication audit proposal for language-services layer.
- Cross-system feature lifecycle documentation.
- Quality standard added to project CLAUDE.md.
- Grid functions blog post with interactive demos.
- Chained Bézier splines and heading/turn blog posts.
- Radial bar chart blog post.
- VS Code developer experience blog post with hero screenshot and architecture diagram.

### Fixed

#### Core
- Object literal property values dropping function calls — `{ y: randomRange(calc(...), calc(...)) }` was parsed as NullLiteral. Fixed by using `buildExpressionWithPostfix()` for property values.
- Map/reduce error messages now include iteration index and callback line number.
- Boolean XOR diagonal artifacts with arc-heavy paths.

#### VS Code Extension
- Preview panel white screen on initial open — captured editor reference before panel creation, use `preserveFocus: true`.
- CSS variable panel losing variables after color override — scan original source instead of compiled result.
- Missing transitive dependencies (semver, minimatch, brace-expansion, balanced-match, concat-map) added to build script.
- Removed non-functional preview command (re-added with working implementation).
- Language server type shim updated for all new exports.

#### Playground
- Uncommitted playground changes from prior sessions pushed to production.

### Changed

#### Development
- Lezer is sole parser — Parsimmon fully removed.
- Completion data generated from TypeScript API declarations instead of hand-maintained.
- Semantic token classification derived from generated data (TYPE_MEMBERS, ENUM_MEMBER_MAP, NAMESPACE_MEMBERS, PATH_COMMAND_HOVER) instead of hardcoded sets.
- VS Code extension CLAUDE.md updated with readiness status and development lifecycle.
- Quality standard: no placeholders in shipped code, end-to-end verification mandatory, be honest about readiness.

## [Unreleased] - 2026-03-21

### Added

#### Core
- PathBlock extensions: `drawTo(x, y)` convenience method, chamfers (symmetric, asymmetric, per-vertex corner beveling), fillets (circular arc rounding, elliptical arc rounding with optional rotation), and boolean operations (curve-preserving union, difference, intersection, xor).
- Color literals: bare hex (`#cc0000`, `#f00`, `#cc000080`, `#f008`), CSS color function literals (`rgb`, `hsl`, `oklch`, `hwb`, `lab`, `lch`, `oklab`), and percent suffix (`20%` → `0.2`) disambiguated from modulus by spacing.
- Booleans: `true`/`false` keywords as semantic subtypes of number, displaying as `"true"`/`"false"` in `log()` and template literals. Comparisons, logical ops, `has()`, `empty()`, `includes()` now return `BooleanValue`.
- Built-in enums: `Easing`, `Interpolation`, `SpreadMethod`, `GradientUnits`, `Direction`, `ConicSpread`, `InnerFill`, `TopoMethod` with dot notation access (e.g., `Easing.Smoothstep`).
- User-defined enums: `enum Name { Member, Member = value }` with auto-valued (lowercase string) and explicit typed values (string, number, angle, color, boolean).
- Font integration: `@font` directive for declarative font loading and `PathBlock.fromGlyph()` for converting text to manipulable path geometry via opentype.js.
- `TextBlock.toPathBlock()` for flattening text glyph outlines into a single PathBlock, removing font dependency at SVG render time.
- `TextBlock.toCodeSnippetBlock()` for generating syntax-highlighted code snippets as a GroupLayer with Pathogen-aware token coloring.
- `.intersects()` and `.intersectionPoints()` on PathBlock and ProjectedPath, mirroring the TextBlock intersection API.
- `heading(angle)` and `turn(delta)` for tangent context control — enables tangent-dependent functions immediately after `M` without workarounds.
- `cubicSpline`, `quadSpline`, `clippedQuadSpline` as stdlib functions (moved from userland definitions).
- `PolarVector(angle, distance)` value type with `turn()`, `scale()`, `mirror()` methods and `polarCubicBezier` stdlib function.
- Array `.map` with block syntax (`{|param| body}`) and `.slice` with inclusive end indexes and negative index support.
- `Point.offset(other)` method returning `{dx, dy}` vector for calculating component-wise displacement between points.
- `--print-logs` CLI flag to dump `log()` output to stderr and `--log-file=<path>` to write structured `LogEntry[]` as JSON.

#### Playground
- Consolidated inspector panel with stacked layers, palette, and CSS vars in a 2:3:1 flex layout.
- GroupLayer expand/collapse with chevron toggle and full-row click targets.
- Button bar in breadcrumb: Annotated/Console/Inspector as unified toggle group.
- RadialGradient interactive examples in blog post with SVG CDATA fix.
- Mobile inspector as fixed bottom drawer at 60vh.

#### Documentation
- PathBlock Extensions blog series (4 parts): introduction, parametric sampling, fillets & chamfers, boolean operations.
- Color Literals blog post with 6 interactive mini-workspace demos.
- TextBlock & Font Integration blog series (2 parts): measure-first text, glyph extraction with `PathBlock.fromGlyph()`.
- Published 6 previously unpublished doc files: textblock, color, gradients, cssvar, masks, objects.
- Font Integration section added to path-blocks.md.
- Heading/turn and chained bezier spline documentation with visual demos.
- PolarVector documentation and demo.

### Fixed

#### Core
- Boolean assembly artifacts on overlapping curved paths — replaced greedy closest-endpoint matching with Weiler-Atherton style ring traversal using original path ordering and explicit intersection links.
- Multi-subpath relative move compounding in `commandsToRelativeD` — after `z`, relative `m` deltas were computed from wrong start point, cascading holes in chained boolean operations.
- Scientific notation parsing in `parseAndTrackPathString` — numbers like `1.83e-15` from stdlib functions were split incorrectly.
- CLI tspan rendering now outputs style attributes on `<tspan>` elements.
- CLI `@font` path resolution: font paths now resolve relative to the source file, not cwd.
- opentype.js ESM loading: async initializer using dynamic `import()` with `require()` fallback for vitest compatibility.

#### Playground
- CSS 404s and CodeMirror error highlight crash.
- Inherited GPU gradient stops: resolve stops from parent for rasterized gradient types (conic, mesh, freeform, topo) since they can't use SVG `xlink:href`.
- Mini-workspace default background changed from white to transparent.
- "Open in Playground" URL length limits — replaced URL state param with localStorage.
- Navigator now walks all descendants to find paths inside `<g>` groups.

#### Deployment
- Cloudflare Pages build: downgrade `@eslint/js` from v10 to v9 to resolve peer dependency conflict with eslint 9 — blocked 13 deployments since Mar 9.

### Changed

#### Development
- TypeScript & ESLint hardening: stricter `tsconfig` options, `eslint-config-airbnb-extended`, Prettier formatting, `~50` evaluator interfaces extracted to `evaluator/types.ts`.
- Playground and website worker fully migrated from JavaScript to TypeScript.
- Test infrastructure: SVG path parser, custom Vitest matchers (`toMatchSVGPath`, `toContainSVGCommands`, `toHaveSVGCommandCount`, `toClosePath`), and `~47` weak assertions remediated across 6 test files.
- Project agents added for code review, content review, and test running.
- Blogging playbook and website guidelines reorganized; Instructional Designer/Writer added as 4th review persona.
- Text collision debugging guideline; agentic review now required before committing new features.
- Removed old `.js` utility files replaced by TypeScript migration.
- Gitignored `tests/tmp/` and `website/bbwp/` render artifacts.

## [Unreleased] - 2026-03-08

### Added

#### Core
- First-class `Color` type with OKLCH color space, harmony generation (`complement`, `triad`, `tetrad`, `analogous`, `splitComplement`), palette generation (`tints`, `shades`, `tones`), contrast utilities (`contrastRatio`, `wcagCompliant`, `accessiblePair`), and component access (`hue`, `chroma`, `lightness`, `alpha`).
- `CSSVar()` constructor for referencing CSS custom properties with `var()` output and OKLCh fallback extraction.
- CSS relative color syntax for CSSVar-backed Colors — `Color(cssvar, 'oklch(from var(--x) l c h / 0.5)')`.
- CSS `@property` declarations via `CSSVar.register()` with type, initial value, and inheritance control.
- `Color.lightDark(light, dark)` for automatic light/dark mode color switching.
- Native SVG gradient support: `LinearGradient()`, `RadialGradient()`, `ConicGradient()` constructors with trailing-block stop definitions.
- Gradient interpolation modes (`srgb`, `oklch`) and stepped interpolation via `.steps`.
- Pattern paint server: `Pattern()` constructor with embedded path drawing.
- Conic gradient `innerRadius` property for smooth center plateau effects (WebGPU-only rendering) with configurable `innerFill` (`'transparent'` default, `'center'`, or `Color(...)`).
- Conic gradient features: partial sweep (`from`/`to` angles), `direction` (`cw`/`ccw`), `spread` modes (`clamp`/`repeat`/`transparent`).
- Gradient `.inherit(newId)` for creating child gradients that reference parents via SVG `href`.
- CSS custom property (`--var`) output from gradients with OKLCh fallback extraction.
- MeshGradient with bilinear interpolation over control point grids and FreeformGradient with IDW (inverse distance weighting) for scattered color points.
- TopoGradient: topological elevation gradients with distance-based SDF interpolation. Contours defined via `g.contour(path, elevation, color)`. Supports easing modes (`linear`, `smoothstep`, `ease-in`, `ease-out`, `ease-in-out`), `baseColor`, and `oklch` interpolation.
- Laplace solver for TopoGradient (`method = 'laplace'`) — solves ∇²h = 0 via Jacobi iteration for smooth elevation fields. `iterations` property (default 200, range 1–2000).
- GroupLayer for SVG `<g>` element composition with `.append()`, max nesting depth of 10, and circular reference detection.
- Transform convenience properties (`translate-x`, `translate-y`, `translate`, `scale-x`, `scale-y`, `scale`, `rotate`) on PathLayer, GroupLayer, and TextLayer style blocks.
- First-class `Mask()` and `ClipPath()` constructors for SVG masking and clipping.
- `SVGDocumentFragment()` for injecting arbitrary SVG content (filters, markers, etc.).
- String type with `length`, `empty()`, index access, `split()`, `append()`, `prepend()`, `includes()`, and `slice()`.
- First-class `Point` type with `x`/`y` properties and geometric methods: `translate()`, `polarTranslate()`, `midpoint()`, `lerp()`, `rotate()`, `distanceTo()`, `angleTo()`.
- Objects with key-value literals, property access, `length`, `has()`, iteration, and `Object.keys()`/`values()`/`entries()`/`delete()` namespace methods.
- Path Blocks (`@{ ... }`) — reusable path data with `draw()`, `project()`, parametric sampling (`get`, `tangent`, `normal`, `partition`), transforms (`reverse`, `boundingBox`, `offset`, `mirror`, `rotateAtVertexIndex`, `scale`), properties (`length`, `vertices`, `subPathCount`, `subPathCommands`, `startPoint`, `endPoint`), and `<<` concatenation.
- `partition` `t` property and `subPath()` method on PathBlocks.
- `Cycler(array, shuffle?)` stdlib function for deterministic round-robin cycling with `.pick()` and `.length`.
- Matrix transforms (`translate`, `rotate`, `scale`) on layer contexts with `set()`/`reset()` and property access.
- Dynamic layer constructors — `PathLayer` and `TextLayer` names can be expressions.
- Universal tangent tracking for all SVG path commands.
- Line and column numbers in runtime error messages, including method calls.
- Void function call support (functions that return no value).
- Improved missing semicolon error diagnostics with targeted suggestions.
- `--render-gpu` CLI flag for headless browser GPU gradient rendering via Puppeteer.

#### Playground
- WebGPU rendering pipeline for conic gradients with WGSL fragment shader, LRU texture cache (32 entries), and Canvas 2D fallback.
- GPU gradient service with pre-rendering between compilation and DOM update, staleness re-checks, and automatic cache invalidation.
- WebGPU rendering pipelines for MeshGradient (bilinear shader) and FreeformGradient (IDW shader).
- WebGPU WGSL shader for topo gradients (ray-cast containment, SDF distance interpolation, easing, OKLab color blending) with Canvas 2D fallback.
- WebGPU compute shader pipeline for Laplace solver (init + N Jacobi iterations + render in single GPU submission) with Canvas 2D fallback using 4× downscale and bilinear upsampling.
- SVG path parser utility (`flattenToSegments`) for converting d-strings to GPU-ready line segment arrays.
- GroupLayer nesting support in layers panel with recursive visibility toggling.
- CSS custom property panel for gradients with OKLCh/CSSVar warnings.
- OKLCH color picker, palette panel, and CSS var panel for the Color system.
- Floating error panel with Copy Debug Info capture.
- Scroll padding so error panel doesn't block bottom code lines.
- Autocompletion for Cycler, PathBlock, ProjectedPath, Object types, `mpi()`, `null`, and `Object` namespace methods with `pathblock` snippet template.
- Line/column error highlighting in the code editor.
- SEO-friendly static pages with JSON-LD structured data, breadcrumbs, semantic HTML, and theme toggle component.
- Extended pan clamp to allow 1/3 viewport over-pan and panning down to 50% zoom.
- `mini-workspace` and `mini-preview` Web Components for interactive blog post embeds with code toggle.
- BBWP compilation pipeline (`npm run compile:bbwp`) for archived render artifacts with auto GPU/CPU detection.

#### Documentation
- Gradient blog series (5 posts): linear/radial, conic, mesh/freeform, topological, and pipeline infrastructure.
- Annotated TopoGradient schematics — 3 samples with side-by-side rendered gradients and contour map diagrams (paint chips, elevation labels, leader lines).
- 20 blog samples for gradient posts (post1–post4) including easing modes, method comparisons, terrain maps, crystal formations, and organic contours.
- Gradients documentation covering all gradient types, Pattern, inheritance, interpolation, `innerRadius`/`innerFill`, and rendering implementation.
- TopoGradient documentation with examples (terrain, rings, peaks, Laplace solver).
- Path Blocks documentation covering definition, drawing, projection, parametric sampling, and transforms.
- Blog post: *Reactive Color in SVG* — interactive Color system demos.
- Blog post: *SEO Pages and Cloudflare Workers Routing*.
- Single-page markdown docs for AI/LLM consumption.
- `Content-Signal` directive added to `robots.txt`.

### Fixed

#### Core
- Array trailing commas and for-in loop destructuring.
- Context-aware functions emitting absolute commands inside PathBlocks.
- XML attribute injection vulnerability in CLI SVG output.

#### Playground
- Style block syntax in layer autocomplete and TextLayer widget.
- Autosave data loss when navigating away from workspace.
- Dark mode link contrast in blog and docs views.
- Mobile scroll cutoff in blog and blog post views.
- Workspace loading failure when nano ID contains hyphens.
- Nano ID generating "undefined" in workspace IDs.
- Blog static page regressions (breadcrumb, code styling, reactive-svg).

### Changed

#### Playground
- Conic gradient rendering moved from inline Canvas 2D to GPU gradient service with WebGPU primary path and Canvas 2D fallback.
- Cmd/Ctrl+S now saves immediately instead of exporting.
- Thumbnail-updated event dispatched on workspace exit.

## [Unreleased] - 2026-02-16

### Added

#### Core
- Multi-layer support — `path` layers for SVG paths and `text` layers for text elements with template literals.
- Style blocks as first-class values with merge (`+`), property access (`.fill`), and per-element inline styles.
- Arrays and `null` as first-class data types with `len()`, `push()`, `map()`, `filter()`, `reduce()`, `join()`, index access, and spread.
- `for`/`if`/`let` control flow inside text blocks.
- Radians-based text/tspan rotation (converted to degrees at render time).

#### Playground
- Thumbnail system — R2-backed storage, crop modal, landing page thumbnails, admin backfill view, and supersampled rasterization with step-down halving.
- Layer controls panel for toggling visibility and managing multi-layer compositions.
- Inline color picker and TextLayer style editor in the code editor.
- Scoped autocompletion for function parameters and layer keywords.
- Docs sidebar with anchor navigation and scroll spy.
- Export legend improvements — snap-to-grid positioning, advanced settings with font embedding, Baumans branding, compact metadata line, content-driven width, and 128-line code limit.
- Shared SVG snapshot utility for consistent multi-layer rendering across export, thumbnails, and preview.
- Loading spinner on workspace transitions with stale SVG preview clearing.
- Admin token rotation script (`npm run website:admin-token`) with Wrangler secret + redeploy.

#### Documentation
- Layers documentation covering PathLayer, TextLayer, template literals, and style blocks.
- Style blocks and template literals documented in syntax reference.
- Arrays and null documented in syntax reference.
- Conditionals docs updated to include `else if` syntax.
- Blog post: *The SVG Serialization Trap*.

### Fixed

#### Playground
- Navigator viewport stroke vanishing on large canvases.
- Navigator blank for text-only layers (clone text elements for minimap).
- Navigator per-layer styling and viewport-fill zoom for small canvases.
- Overflow menu clipped in workspace cards.
- Empty admin thumbnails — wait for in-progress generation and validate results.
- Thumbnail worker path resolution in production.

### Changed

#### Core
- Deprecated global stroke/fill controls in favor of per-layer styling.

#### Development
- Converted all scripts from JavaScript/Bash to TypeScript with Commander CLI framework for `--help`, argument parsing, and type safety.
- Scripts now run via `tsx` instead of `node`; added `commander` as a dev dependency.
- Added `scripts/CLAUDE.md` prescribing TypeScript + Commander conventions for new scripts.
- Git hook installer (`install-git-hooks.ts`) now writes shims that invoke TypeScript source via `npx tsx`.
- Added `playground/CLAUDE.md` and `src/CLAUDE.md` with conventions and workflow guardrails; refreshed project-level CLAUDE.md for multi-layer era.

## [Unreleased] - 2026-02-09

### Added

#### Core
- `else if` conditional chains — chain as many `else if` blocks as needed between `if` and `else`.
- `pi` numeric suffix for angle literals (e.g., `0.25pi`, `2pi`) and `mpi(x)` stdlib function for multiplying expressions by pi.
- Variable reassignment support (`x = value;`) — reassign previously declared variables without `let`.
- `toFixed` number precision post-processing — available as a `compile()` option and CLI flag (`--precision`).
- Async interpreter execution via Web Worker (`src/worker.ts`) for non-blocking compilation.

#### Playground
- Export with Legend feature — modal for exporting SVG with a customizable code legend overlay.
- Light/dark theme system with visual refresh and system preference detection.
- Refresh button for recompiling programs that use random functions.
- Persist workspace preferences (canvas size, stroke, fill, grid) on change via autosave service.
- Copy workspace form workflow and increased canvas size limit.
- Toggle publish action on workspace cards.
- Async compilation via Web Worker with performance optimizations.

### Fixed

#### Playground
- Width/height input max validation in footer.
- Console log objects not expandable in console pane.

### Changed

#### Branding
- Playground rebranded to **Pathogen**.

#### Deployment
- Migrated from GitHub Pages to Cloudflare Pages; removed GitHub Actions deploy workflow.

## [Unreleased] - 2026-02-02

### Added

- `arcFromPolarOffset(angle, radius, angleOfArc)` - New context-aware function for drawing arcs where the center is at a polar offset from the current position. Guarantees continuous paths by only emitting `A` commands (never `M` or `L`). Positive `angleOfArc` draws clockwise, negative draws counter-clockwise.
- Context-aware functions documentation in `docs/stdlib.md` covering polar movement, arc functions, and tangent functions.
- Known issue ISSUE-002 documenting M command timing with context-aware functions.
#### Playground
- Autocomplete for the playground CodeMirror editor with snippets, stdlib functions, and context-aware completions.
- Save/load workspace support for `.svgx` files with File System Access API fallbacks and keyboard shortcuts.
- Refactored playground into modular Web Components with shared components, extracted styles, and state store.
- App shell + History API routing with landing, workspace, docs, preferences, and storybook views plus Cloudflare Pages deployment scaffolding.
- Blog feature in the playground with list and post views, markdown rendering, and build/new-post scripts.
- Enhanced component storybook with sidebar navigation, deep links, and interactive demos.
#### Documentation
- Documentation now generated from markdown sources via `scripts/build-docs.js`, including new getting-started/debug content and syntax updates.
- Syntax highlighting for docs using highlight.js (GitHub Dark theme).

#### Development
- Added an optional post-commit hook installer (`scripts/install-git-hooks.sh`) to remind contributors to update `CHANGELOG.md`.

### Fixed

#### Core
- `arcFromCenter` now emits `L` (lineto) instead of `M` (moveto) to reach the arc start point. This keeps paths continuous so that `Z` (closepath) closes to the original path start, not the arc start. If the current position already matches the arc start, only the `A` command is emitted.

#### Deployment
- SPA routing on Cloudflare Pages now supports direct navigation to playground routes via `_worker.js` and a base href update.

### Changed

#### Core
- `arcFromPolarOffset` uses the convention that positive `angleOfArc` is clockwise and negative is counter-clockwise, matching the visual behavior in SVG's Y-down coordinate system.

#### Deployment
- Build output moved to `public/` for Cloudflare Pages auto-detection.

#### Branding
- Page titles updated to include Pedestal Design branding.
