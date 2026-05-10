# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased] - 2026-05-09

Post-0.7.0 polish. Inspector population is now correct on every blog post; sitewide typography refresh; homepage and docs responsive cleanup.

### Added

#### Compiler / CLI
- `data-layer-name="<layer>"` attribute on every layer-rendered element (path, group, **and every text sibling of a multi-text TextLayer**) in CLI mode — not just playground. Enables the blog mini-workspace inspector to toggle every element of a multi-text layer in one query (`[data-layer-name="X"]`). CLI also keeps `id` on the first sibling for backward compat with consumers that resolve cross-references by id-fragment.

#### Homepage
- Dynamic version eyebrow ("built on Pathogen v{version}") that codegens from `package.json` at build time. Aligns the displayed VS Code extension name with the published marketplace handle.

### Changed

#### Typography
- DM Serif Display headings sitewide (homepage, blog, docs) — replaces the previous mixed heading stack with a single editorial display face.

#### Docs
- Sidebar background made transparent so the page backplate (grain + halos) reads through.
- Horizontal page scroll locked; wide content (column text, tables) capped at the column width with internal scroll, so the page no longer drifts sideways on long lines.

#### Tooling
- `npm` workspaces array scoped to `packages/pathogen-language-server` only (was `packages/*`). The previous glob registered `packages/vscode-pathogen` as a workspace member with the same `"name": "pathogen-lang"` as the root, producing a duplicate-version lock-file entry that failed Cloudflare Pages' `npm ci`. The VS Code extension is now installed via `cd packages/vscode-pathogen && npm install`.

### Fixed

#### Blog mini-workspace inspector
- **Inspector panels (Layers / Palette / CSS Variables) now populate on every blog post.** Mini-workspaces read inspector data from a `<script id="pathogen-metadata">` block baked into each pre-compiled `.svg`. The block is emitted only when the CLI is invoked with `--include-metadata`, which the canonical `npm run compile:samples` script passes but the manual `npx tsx src/cli.ts …` recipe (previously documented in `website/blog/CLAUDE.md`) did not. Seven blog posts (Clifford Attractor, several gradient and text posts) shipped SVGs without metadata; all newly compiled samples now include it. `website/blog/CLAUDE.md` updated to recommend `npm run compile:samples` and warn against the hand-rolled command.
- **Toggling a multi-text TextLayer now hides every text element, not just the first.** Pre-fix, only the first sibling carried `id="<layer>"` and the inspector's `[id]` query matched one element of N. Fixed by emitting `data-layer-name` on every sibling (newly compiled SVGs) plus a sibling-walk fallback in `mini-preview.setLayerVisibility` (pre-existing SVGs whose `.pathogen` sources can't currently be re-compiled).
- **Layer-toggle handler now reaches the compiled SVG.** The post-0.7.0 sandboxed-iframe migration (commit `354c4b9`) moved the SVG into the iframe document, but `mini-workspace.ts` was still querying `preview.shadowRoot` — a path that returned `null` after the migration, so toggles silently no-op'd. New `mini-preview.setLayerVisibility(name, visible)` method forwards the toggle into the iframe document, mirroring the existing `setCssVar` pattern, with a pending-toggle buffer for events that arrive before the iframe finishes parsing.

#### Renderer
- **Serializer no longer leaks `<__text-siblings__>` into output when a multi-text TextLayer is nested inside a GroupLayer.** The synthetic wrapper was unwrapped at top-level but not in `serializeBlockChild`'s recursive path. Nested TextLayers (e.g. the Clifford Attractor `concept` group containing `labels` and `formula`) serialized with literal `<__text-siblings__>` tags that browsers treated as unknown elements, silently dropping every wrapped `<text>`. Two regression tests added in `tests/render/serialize.test.ts`.

#### Homepage
- Mobile-responsive pass: nav grid overflow fixed; six showcase tiles, three tool cards, and the latest-blog card all reflow under 768px without horizontal scroll.

### Development
- `--include-metadata` documented in `pathogen-lang --help`; behavior unchanged (still off by default — the security contract in `tests/security/compiler-emission.test.ts` forbids any `<script>` in default compiler output).
- `tests/render-snapshots.test.ts` fixtures updated to reflect the new `data-layer-name` attribute (intentional API addition; not a refactor regression).
- All ~67 blog sample SVGs across post1–post16 + post22–post23 regenerated via `npm run compile:samples -- --force`. GPU-rendered samples in post2/3/4/5/24 still error in local Puppeteer with `Waiting failed: 10000ms exceeded`; their existing committed SVGs work via the inspector's legacy fallback path.

## [0.7.0] - 2026-05-09

A platform release. Pathogen now lives at `pathogen.studio` — its own
domain, its own brand, its own two-project Cloudflare architecture
(Pages for the site, Workers for the API). The companion repo was
renamed to `pathogen-lang` to match. The `/pathogen/` URL prefix that
used to scope the SPA under `pedestal.design/pathogen/...` is gone;
URLs are now apex-relative (`pathogen.studio/`, `/workspaces`, `/blog`).
Old URLs 301 to their new locations.

### Added

#### Auth
- Passwordless email-OTP accounts via Cloudflare Email Sending + D1 (commit `d4faf4a`).
- Session cookie is `Domain=.pathogen.studio` so the same login works on `pathogen.studio` (Pages) and `api.pathogen.studio` (API Worker) without a token-auth refactor.
- SSR seeds `window.__SSR_CURRENT_USER` on every server-rendered page so the account chip renders signed-in on first paint without a client-side fetch.
- `/auth/start` rate-limit: per-email + per-IP counters in KV.
- Public profile pages (`/u/:handle`).

#### Marketing site
- Atmospheric homepage at `pathogen.studio/` — code-and-render hero, three tool cards (GitHub / CLI / VS Code), latest-blog card, six showcase tiles wired to real Pathogen-rendered SVGs from the blog samples directory.
- "Pathogen Studio" rebrand — Baumans wordmark with lavender-gradient "Studio", DM Serif Display headings, Inconsolata mono code, atmospheric grain + halos backplate. Single-CTA-per-view contract.
- Top-nav redesign with anti-shift Grid layout, glassy tab pills, Material-icons sprite for overflow menu.
- Sign-in modal + claim-anonymous-workspaces flow.

#### API Worker (`api/`)
- New Cloudflare Workers project at `api.pathogen.studio` hosting every `/api/*` endpoint (`/auth/*`, `/me`, `/u/:handle`, `/workspaces`, `/workspace/:id`, `/preferences`, `/thumbnail/*`, `/admin/*`).
- `[[send_email]]` binding declared in version-controlled `api/wrangler.toml` (Pages projects don't accept this binding — that constraint drove the split).
- Origin-allowlist CORS with credentials (`pathogen.studio`, `www.pathogen.studio`, `localhost:3000`); wildcard `*` was incompatible with credentialed cookie auth.
- GitHub Action (`.github/workflows/deploy-api.yml`) auto-deploys the Worker on `git push` when `api/`, `website/api/`, or `website/auth/` change.

#### Tooling
- `scripts/migrate-anonymous-workspaces.ts` — one-off (now committed) for re-keying workspaces from anonymous browser IDs to an authenticated user.
- `scripts/build-website.ts` codegens `playground/utils/version.ts` from `package.json` so the displayed `built on Pathogen v{version}` subtitle stays in sync with releases.
- `scripts/verify-nav-stability.ts` extended to cover the new prefix-less URLs.
- `npm run dev:stack` runs both wranglers in parallel (Pages :3000, API :8787).
- `concurrently` dev-dep for the parallel-wrangler script.

### Changed

#### Domain + URL routing
- **Site moved**: `pedestal.design/pathogen/...` → `pathogen.studio/...`. Pages custom domain attached.
- **API moved**: `pedestal.design/pathogen/api/...` → `api.pathogen.studio/...`. The Pages worker no longer serves API traffic.
- **`/pathogen/` URL prefix dropped**. URLs are now apex-relative — `pathogen.studio/workspaces`, `pathogen.studio/blog/clifford-attractor`, `pathogen.studio/docs`. The old prefix path 301-redirects to its new location for backward compatibility with bookmarks and external links.
- SPA `BASE_PATH` is now `''` (was `/pathogen`). All internal navigation, top-nav tabs, and SSR-emitted hrefs use prefix-less paths. Build output writes directly to `public/` (was `public/pathogen/`).
- SPA shell renamed to `public/spa.html` so it doesn't collide with the SSR-rendered apex (`/index.html`).
- SPA `API_BASE` defaults to `https://api.pathogen.studio` at build time; override via `PATHOGEN_API_BASE` env var for local dev. All SPA fetches use `credentials: 'include'`.
- Canonical URLs, sitemap.xml, robots.txt, schema.org JSON-LD, og:url tags all reference `https://pathogen.studio` (no `/pathogen/` prefix).

#### Cloudflare config
- Pages `wrangler.toml` shrunk: drops THUMBNAILS R2 binding (only the API Worker reads/writes thumbnails now), drops email-related env vars (live in `api/wrangler.toml` instead). Keeps WORKSPACES (KV, read-only for SSR) and USERS_DB (D1, read-only for `getSsrUser`).
- All Cloudflare bindings now version-controlled in two `wrangler.toml` files (root for Pages, `/api/wrangler.toml` for Workers). No dashboard-managed config.

#### Repo + branding
- GitHub repo renamed `svg-path-extended` → `pathogen-lang`.
- npm package renamed `svg-path-extended` → `pathogen-lang`. Verified unpublished (`npm view` returned 404 for both names) so no consumers were affected. CLI binary now exposes both `pathogen` (short, daily ergonomics) and `pathogen-lang` (full, matches package name) as aliases — the legacy `svg-path-extended` binary entry was removed.
- Browser global `window.SvgPathExtended` renamed `window.PathogenLang`. Internal-only — set via `tsup.config.ts` `globalName`; no external consumers.
- CF resource names (`svg-path-extended` Pages project, `svg-path-extended-thumbnails` R2 buckets, `svg-path-extended-users` D1 database) intentionally **kept** — those are independent identifiers and renaming would require resource recreation + data migration.
- README title updated to `pathogen-lang` with a description that names the npm package.
- Visible "built on svg-path-extended v1.0" subtitle in nav header + homepage footer changed to "built on Pathogen v{version}", with `{version}` codegenned from `package.json`.
- Default playground welcome comment ("Welcome to svg-path-extended!") updated to "Welcome to Pathogen!".

#### Compiler / language services
(Older changes since the previous CHANGELOG entry — these landed before the API split:)
- @font directive: surface fetch failures + uncover errors masked by diagnostics (commit `bff7fef`).
- Color literals: support modern CSS L4 forms (`oklch(L% C H)` etc) with source-located errors (commit `6e9a7b3`).
- Boolean operations: §2.13–2.16 fixes for shared-edge disambiguation, contour chain ordering, U-bowl notch, RW-l-50 bowl-as-disk (commits `a3d29da` through `220d0fa`).
- Various boolean-ops audit closes (Class B/C/D, O3–O6, PF-A-60).

### Fixed

- Workspace migration: 50 workspaces stranded under anonymous browser IDs after the auth migration are now re-keyable to an authenticated user via the new migration script.
- SSR-side cookie reading (`getSsrUser`): correctly extends `SsrUser` with `id` + `email` so the seeded `window.__SSR_CURRENT_USER` matches the SPA's `CurrentUser` type.
- `wrangler.toml` `[[send_email]]` block was rejected by CF Pages CI — resolved by moving the binding to the new Workers project's `wrangler.toml` (commit `bad0b93`).

### Removed

- Pedestal-Design apex landing page (`website/index.html`) — the Pages worker now SSRs the apex directly via `renderHomepage()`.
- Pages worker's `apiHandlers` + `handleApiRequest` + wildcard CORS — moved to the API Worker. The Pages worker is now SSR + static-fallback only; old `/pathogen/api/*` URLs return 410 with a hint pointing at `api.pathogen.studio`.

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
- **Leading-character completion triggers** — typing `@`, `&`, `$`, or `${` no longer dead-ends in a parse error. The completion menu now offers contextual snippets:
  - `@` / `@f` / `@font` at statement start → `@font "Name" weight;` directive and `@{ }` PathBlock snippets.
  - `@` and `&` in expression position (after `=`, `(`, `,`, etc.) → `@{ }` PathBlock and `&{ }` TextBlock.
  - `&` at statement start → `&{ }` TextBlock.
  - `$` at statement start → `let`, `PathLayer`, `TextLayer` declaration snippets.
  - `$` in expression position → `${ }` style-block snippet.
  - `$` or `${` inside a backtick template literal → `${expr}` interpolation snippet.
  - Fix: backtick interpolations were misclassified as style blocks and offered CSS property completions; now the engine distinguishes the two contexts.
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
- Auto-balanced brackets and quotes — typing `(`, `[`, `{`, `"`, `'`, or `` ` `` now inserts the matching closer, so a stray opener no longer cascades into a chain of "missing token" parse errors.

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
