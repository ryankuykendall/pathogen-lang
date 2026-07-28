# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased] - 2026-07-28 (object shorthand + style-value interpolation)

### Added

#### Core

- **Object literal shorthand properties**: `{ contour, leftOffset }` is now sugar for `{ contour: contour, leftOffset: leftOffset }` — the mirror of the destructuring shorthand the language already had. The AST builder desugars to an ordinary `key: value` pair, so evaluation, scope analysis, and navigation needed no changes; the formatter and annotated source printer round-trip the sugar instead of expanding it, and rename expands a shorthand reference to `{ key: newName }` rather than silently renaming the property key. Documented in `docs/objects.md` (new Shorthand Properties section) with a cross-link from `docs/syntax.md`.
- **Template fragments inside style values**: a backtick template can now sit *anywhere* in a style-block value, not just span the whole value — ``filter: blur(`${randomRange(1.1, 2.2)}`px);`` splices the evaluated fragment into the surrounding text (previously a misleading `disallowed token` error; the editor grammar already accepted the shape). Spliced results are validated against the same strict allow-list as hand-written values, so interpolation remains convenience, not an escape hatch. Works identically in annotated mode.
- **Numeric variables substitute inside CSS function args**: `filter: brightness(level);` now emits `brightness(1.4)` — matching the existing Color/CSSVar substitution — instead of silently emitting invalid CSS (`brightness(level)`) that browsers drop. Literal tokens are never touched, including unit-carrying negatives like `hue-rotate(-90deg)`. Chained filter functions (`blur(2px) brightness(level)`) now resolve embedded variables too; previously only single-function values did. Substitution is not unit-aware — documented, with the unitless filter functions named explicitly.
- **All interpolation forms behave identically**: a whole-value template's result now gets the same function-argument resolution as a fragment, so `` `blur(${s}px) brightness(level)` `` resolves `level` instead of emitting it verbatim for the browser to drop.

- **CSS function arguments are checked for units.** `filter: blur(4);` used to compile and emit `blur(4)` — a unitless length that browsers silently drop — and the same held for a substituted variable or an interpolated fragment. Pathogen now rejects it with a fix-it message (`blur() takes a length — "4" needs a unit (try 4px)`). The check runs on the final value, so literal, variable, and interpolated arguments are all covered, and it reaches the CLI, playground, and VS Code through the existing diagnostics path. Rules are per function: lengths for `blur`/`drop-shadow`, angles for `hue-rotate`, length-or-percentage for the basic shapes, and plain numbers for `cubic-bezier`/`steps`/`matrix`/`scale` (where a unit is now an error in the other direction). Unitless zero is always allowed. The rule is that Pathogen checks units only where CSS and SVG agree on the answer: **`rotate`/`translate`/`skew` and the color functions are deliberately unchecked** — transforms are emitted into SVG's `transform` attribute, whose grammar takes unitless user units (`rotate(45)` is correct there and is what Pathogen's own convenience properties generate) while CSS requires units, and color channels accept numbers, percentages, and angles interchangeably. `scale*`/`matrix*` are the transform-family exception: a unit is invalid in *both* grammars, so there is one right answer and it is enforced.
- **Functions must match the property they're used on.** `fill: rotate(45);` was accepted because no property-to-function mapping existed; it is now an error. The mapping covers `filter`, `clip-path`, `transform`, the color properties, and the timing-function properties — any property outside that list still accepts any allow-listed function, and only the outermost function is matched, so `drop-shadow(4px 4px 8px oklch(…))` keeps working.

### Fixed

#### Core

- **Lenient parse no longer fabricates an identifier from a colonless string key** (`{ 'radius' }`, the mid-typing state of `{ 'radius': … }`) — previously (during this same unreleased window) rename could mangle the string literal in place.
- **Same-line rename references no longer collapse onto the first occurrence**: `let p = { radius, scaled: radius };` (and `calc(a + a)`) now rename every occurrence; the line scan skips positions already claimed by an earlier edit.
- **Object-property type inference is live**: parsed longhand properties were missing their AST discriminant, leaving the `objectProp` inference branch dead — hover now infers types for bindings destructured from inline object literals (`let { x } = { x: 5 };`).
- **Style-value validator hints at template problems**: when a value still contains a backtick at validation time (e.g. an unterminated template), the error now points at the interpolation syntax instead of only citing the allow-list.
- **Security: `var()` permission is now per-token, not per-value.** The style-value validator's `allowVar` was a single flag flipped whenever *any* token in a value resolved to a compiler-emitted `CSSVar()` — so an unrelated `var()` sitting elsewhere in the same value rode through unvalidated (e.g. `drop-shadow(2px 2px var(--evil,1) c)`). The validator now allow-lists the exact `var()` strings the compiler emitted for that value; every other `var()` is rejected as before. The flaw predates the interpolation work but was reachable then and would have been widened by it.
- **Cross-evaluator number formatting parity in style values**: the annotated evaluator formatted substituted/spliced numbers with `String()` while the primary evaluator used `formatNum`, so the two surfaces emitted different CSS under a `--to-fixed` precision option. Both now use `formatNum`. The annotated evaluator's template-fragment error also gained the positioned-error fallback the primary path already had.

#### Documentation

- `docs/layers.md` documents fragment interpolation, unit-inside vs unit-outside equivalence, and numeric substitution; `docs/security.md` states that interpolation results are validated post-evaluation; `docs/filters.md` adds a dynamic filter-arguments example.

## [Unreleased] - 2026-07-26 (unit-aware color-method angles)

### Fixed

#### Core

- **`hueShift(90deg)` now shifts 90° (was a silent 1.57°).** Color methods (`hueShift`, `analogous`, `splitComplementary`) take degrees, but angle-suffixed literals evaluate to radians — so a suffixed argument was reinterpreted as a much smaller degree value with no error. A new operator-aware unit-inference pass (`src/evaluator/units.ts`) detects arguments *written* with angle units — including `calc()` arithmetic over them, like `hueShift(calc(i / 9 * 2pi))`, which now sweeps the full hue wheel instead of an invisible 5.6° — and converts radians→degrees at the call site. Bare numbers (`hueShift(180)`) are unchanged. The conversion also flows to the `CSSVar` color path (`oklch(from … calc(h + 90))`). Known limitation (documented): units don't survive variable assignment — `let a = 90deg; c.hueShift(a)` still reads as degrees; use `c.hueShift(deg(a))`.
- **Angle-unit guardrail extended to `*` and to the annotated evaluator.** Multiplying two angle values (`calc(90deg * 45deg)`) is now an error; scaling by a plain number (`calc(2 * 45deg)`) and angle/angle ratios (`calc(1pi / 2pi)`) remain valid. The `+`/`-` mismatch check now sees through nested arithmetic (`calc((90deg * 2) + 5)` throws) and runs in the annotated evaluator, which previously had no angle-unit checking at all. `convertUnitSuffix`/`hasAngleUnit`/`checkAngleUnitMismatch` are consolidated in the shared `units.ts` module instead of hand-copied between the two evaluators.
- **Gradient, Pattern, Marker, and MeshPoint property validation now matches between the primary and annotated evaluators.** The annotated evaluator's member-assignment handling was "lenient by design" — a bare `g.from = 45` (rejected by normal compilation with `requires an angle unit`), an invalid Marker enum (`mk.refX = 'middle'`), or a wrong-typed value was silently accepted or dropped under `--annotated`, so annotated/debug output could show a "working" program that the real compiler rejects. Both evaluators now share the strict validation via a new `src/evaluator/member-assign.ts` (`assignGradientProperty`/`assignPatternProperty`/`assignMarkerProperty`/`assignMeshPointProperty` — same no-drift consolidation as `units.ts`). Also fixed along the way: one of the annotated evaluator's two statement evaluators — the one that runs every top-level statement and nested block body — had no Marker assignment handling at all, so `marker.prop = value` was a silent no-op under `--annotated` at any nesting level; and its local `GradientValue` was missing the `innerRadius`/`innerFill` fields, so those assignments silently vanished instead of being stored. Remaining known gap in annotated mode (unchanged, tracked): filter property assignments (`NoiseFilter`, `GlowFilter`, …) are still complete no-ops there.
- **9 built-in enums were unresolvable in annotated mode.** `BUILTIN_ENUMS` was hand-copied into the annotated evaluator and had drifted: `BlendMode`, `NoiseFilterStyle`, `NoiseFilterScale`, `GlowMode`, `MotionBlurType`, `BBoxAnchor`, `GridPatternType`, `HexagonOrientation`, and `VerticalAnchor` were missing, so e.g. `BlendMode.Multiply` threw `Undefined variable` only under `--annotated`. The table now lives in a shared `src/evaluator/builtin-enums.ts` (re-exported from the evaluator for existing importers) consumed by both evaluators.

#### Documentation

- `docs/color.md` now states the degrees contract for hue/harmony methods (previously the unit was documented only by a `°` in a code comment) with the auto-conversion rules and the `deg()` escape hatch; `docs/syntax.md` documents that `calc()` is unit-blind and the extended mismatch rules.

## [Unreleased] - 2026-07-26 (template literals: CST-walk fix + parseMixed assessment)

### Fixed

#### Core

- **Silent template-AST corruption for interpolations containing braces in strings.** `` let x = `${ f("}") }`; `` parsed to a correct syntax tree but a garbage AST (the builder re-scanned raw text with a brace counter that had no string-awareness), compiling wrong output with zero diagnostics. `buildTemplateLiteral` now walks the CST the grammar already produced: interpolation expressions come from the single inline parse (correct absolute source positions — no more `let _ = expr;` re-parse, wrap-offset location rewrites, or silent depth-cap fallback to a bogus identifier), and literal text runs are recovered as ranges between interpolations. The raw-text scanner survives only as the error-recovery fallback for opaque/recovered nodes.

### Added

#### Playground

- **Template literals finally have string coloring**: `TemplateLiteral` is styled as a special string (oneDark cyan / light `#e40`), with interpolation expressions keeping their own token colors (verified per-painted-span in both themes). The previous highlight entries targeted template token names that never existed as tree nodes — dead code, removed from both highlight maps.

### Development

- **parseMixed assessment recorded** (`project-docs/template-literals/ASSESSMENT.md`): extracting template literals into a separate parseMixed-mounted parser would *subtract* structure — the grammar already parses interpolations inline as real expression subtrees, a mount would replace them unless unproven `overlay` machinery re-mounted the full parser inside every interpolation, and the `${` token-group fragility stays either way. The inner style grammar's opaque `Template` token remains the one legitimate future parseMixed candidate.

## [Unreleased] - 2026-07-25 (style-block scope awareness: references in values, rename/find-refs, Member expressions)

### Added

#### Core

- **Scope analysis now sees inside style-block values.** Identifiers in `${ ... }` values that resolve to user declarations become real references with **exact full-width ranges** (`Reference.inStyleValue`), extracted via the inner style grammar (`'_: value;'` wrap) plus full expression parsing for `${...}` template interpolations. The reference rule matches evaluator semantics: bare values and member heads reference only USER declarations (`stroke-linejoin: round;` stays plain CSS; a user `let round` shadowing it becomes a reference); function names (`drop-shadow`, `.alpha`) never do. This fixes a silent hole: **rename and find-references previously skipped style values entirely** — renaming `shadowColor` did not update it inside `drop-shadow(4px 4px shadowColor)`. Rename now edits style-value occurrences with exact ranges (including several on one line — the old first-match-per-line scan couldn't), find-references/go-to-definition work from inside values, and VS Code semantic tokens color them at exact positions.
- **Member expressions in the inner style grammar**: `fill: c.alpha(40%);`, `rgba(0,0,200,1).lighten(20%)`, and chains like `a.b.c(1).d` now parse as first-class `Member` nodes in both grammar scopes (previously the `.` was an error node). `.5` numbers are unaffected.

#### Playground

- **Variable references inside style values take the variable color again.** A new decoration extension (`cm-style-ref-recolor.ts`) marks style-value identifiers that resolve to declarations, so `stroke: c;` and `drop-shadow(1px 1px c)` render `c` coral in dark mode / default text in light — matching the variable everywhere else — while CSS keywords (`middle`) and undeclared names keep the value color. Backed by a shared size-1 scope-analysis memo (`scope-cache.ts`) reused by the color-chip extension. **Post-ship fix (2026-07-26):** the theme rule must target the NESTED syntax span (`.cm-style-var-ref span`) — CodeMirror nests the highlight span inside the mark span, so styling only the mark recolors the wrapper while the glyphs keep the old color; `getComputedStyle` on the mark reports success while the screen disagrees. Found via Ryan's side-by-side color-literal calibration; verification scripts now measure the deepest span.
- **Color chips are scope-aware**: `let tomato = ...; stroke: tomato;` no longer renders a chip (clicking it would have overwritten the variable reference with a literal color — the KNOWN LIMITATION from the previous entry, now fixed in both the mounted-tree and regex-fallback chip paths). An undeclared `stroke: tomato;` still chips.

## [Unreleased] - 2026-07-25 (style-block structure: comma-form filter error, inner grammar, editor intelligence)

### Fixed

#### Core

- **Comma-form CSS filter functions are now a positioned compile error instead of a silent no-op.** `filter: drop-shadow(4px, 4px, 4px, color)` previously compiled and emitted invalid CSS the browser dropped — the shadow just never appeared (Pathogen call syntax uses commas, but CSS `drop-shadow()` is space-separated, and a `font-family`-fallback comma branch in the validator incidentally let `4px,` through). All 10 CSS filter functions now reject top-level commas with a fix-it message (`drop-shadow() uses space-separated CSS syntax: drop-shadow(4px 4px 4px color) — remove the commas`), and comma-chained filters (`blur(2px), brightness(1)`) get `filter chains are space-separated`. Errors point at the declaration **value** via the new `StyleProperty.valueLoc`. Genuinely comma-separated functions (`rgba`, `color-mix`, `cubic-bezier`, `polygon`, transform functions, font-family lists) are untouched, with negative-control tests for each family.
- **Annotated-evaluator drift**: `--annotated` never resolved Pathogen expressions embedded in CSS function args (`drop-shadow(4px 4px 8px shadowColor)` kept the raw variable name). Both evaluators now share `css-function-resolve.ts`, so resolution and the comma error behave identically; annotated validation errors gained line/col positions.

### Added

#### Core

- **Structured syntax tree inside style blocks** (`editorParser`): a new dedicated Lezer grammar (`src/parser/style.grammar` — `Declaration`, `PropertyName`, `Call`, `ArgList`, `NumberUnit`, `ColorLiteral`, `StringLiteral`, `Template` nodes) is mounted over the opaque `StyleContent` token via `parseMixed`. The outer grammar is untouched (no `${` state-merge risk — outer-tree invariance is tested), and the compiler keeps the unwrapped parser. A parity corpus test locks the inner grammar to `parseStyleDeclarations` boundary rules (top-level `;`/newline termination, paren/quote/template awareness, mid-typing leniency). New `npm run generate:style-parser`; `editorParser` ships in both `dist/index.global.js` and `dist/highlight.global.js`.
- **`StyleProperty` source extents**: AST style declarations now carry `nameEnd`, `valueLoc`, and `valueEnd` alongside `loc`, so tooling and diagnostics can address the value text without re-scanning.
- **Style completion coverage**: `filter`, `mask`, `clip-path`, `stroke-dashoffset`, `color`, `mix-blend-mode`, and `paint-order` join the property completions (previously absent — `filter` is the 6th most-used property in the sample corpus). Value position after `filter:` offers the 10 CSS filter functions as space-separated snippets (`drop-shadow(${dx} ${dy} ${blur} ${color})` — teaching the correct syntax), `url(#id)`, and ranks in-scope filter-constructor variables first with a `NoiseFilter — renders as url(#id)` detail (type-aware via AST inference). `mask`/`clip-path` get `url(#id)` + basic-shape snippets; `mix-blend-mode`/`paint-order` get their keyword enumerations. The function list is **imported from the sanitizer allow-list** (`CSS_FILTER_FUNCTION_NAMES` et al., now exported groups) so completions cannot drift from what the evaluator accepts. Declaration-shaped binding-block constructor snippets (`NoiseFilter() {|f| ...}`) are no longer inserted in value position (offered as plain names instead). A property × value-kind coverage-matrix test guards the whole surface.

#### Playground

- **Color chips everywhere in style values**: chips now come from the mounted inner tree instead of a whole-value regex — a hex or color-function literal gets a chip **anywhere in any property's value**, including nested inside `drop-shadow(...)` (the reported gap: `filter: drop-shadow(4px 4px 4px #c00)` had no chip because `filter` wasn't in the six-property regex allow-list). Bare **named** colors chip only as the entire value of a color-typed property, so a variable named `tomato` is never rewritten. The regex fallback remains for unmounted trees.
- **Structured highlighting inside `${ }`**: property names, numbers/units, strings, templates, and function calls get real token colors in both themes (previously the whole block interior was one flat string color). Applies to the editor and the read-only workspace detail mount (`dist/highlight.global.js`). Tags are tuned against the stock theme palettes so the roles contrast: dark mode reads blue property names / red variable names / orange values / yellow numbers (measured via `inspect-colors.mjs`, not assumed — `t.propertyName` would have collapsed property names into oneDark's variable-name coral).

### Documentation

- `docs/syntax.md`: new **CSS Function Values** section — space-separated filter-function syntax, the comma error with before/after example, comma-taking function families, and variable resolution inside CSS functions. `docs/filters.md`: native-CSS-syntax callout in "Layering with Native CSS Filters".

### Development

- `project-docs/style-block-structure/` — plan, primer (parser-identity diagram, comma policy, inner-grammar boundary rules), demo `.pathogen`, and the puppeteer verification scripts used for the playground surface checks.

## [Unreleased] - 2026-07-25 (font weight fallback)

### Fixed

#### Playground

- **Unavailable Google Font weights no longer kill the compile.** Requesting a weight a family doesn't ship (e.g. `Baumans` at `font-weight: 900` — Baumans only has 400) used to fetch `css2?...wght@900`, which Google rejects with a CORS-invisible 400; the playground surfaced it as a fatal "Failed to load fonts referenced by @font directive: … Failed to fetch" error plus a wall of misleading CORS console errors, refetched on every keystroke. `fetchFontBinary` now validates the weight against the fonts catalog *before* any network access (the HTTP status is unobservable cross-origin, so pre-flight is the only workable check) and snaps to the nearest available variant — min distance, ties toward lighter. The substituted binary registers under the **requested** weight so the injected `@font-face` matches the source's `font-weight` on `<text>` (no faux-bold divergence from outlined glyphs), and the buffer is cached under both weight keys, eliminating the per-keystroke refetch.
- **Non-fatal substitution warning banner**: substitutions ride the compile result (`fontSubstitutions`) into a dismissible workspace banner — "Baumans is only available at weight 400 (requested 900); using 400" (multi-variant families also list their available weights). Dismissal is remembered per message set (re-appears when the substitutions change), resets on workspace switch, and clears on compile errors. The banner styling is shared with the multi-tab warning (`.warning-banner`).
- **Font-picker preview links request only real variants**: `loadGoogleFont` previously requested `wght@100;…;900` for every family, silently 400ing for single/partial-variant families.

### Development

- New `getKnownVariants` (returns `null` for unknown families — deliberately not `getAvailableWeights`, whose `[400, 700]` default would mis-snap uncatalogued families) and `nearestWeight` in `google-fonts.ts`; first tests for that module. `font-loader` tests gain a weight-substitution coverage matrix over every curated single-variant family, tie-breaking, unknown-family passthrough, dual-key cache behavior, and exact banner message formats.

### Documentation

- `path-blocks.md` @font section: documents playground weight substitution, and corrects the load-failure claim (CLI warns and continues; the playground reports a compile error).

## [Unreleased] - 2026-07-24 (AST-based type inference + member hover)

### Added

#### Core

- **Member hover across the language service**: hovering any property or method after a `.` (e.g. `glyph.contours`, `contour.variableOffset`, `vo.stop`) now shows its signature, doc, and value type — hover previously had no member-access path at all. Powered by a new shared `member-resolution.ts` used identically by completion and hover, so both surfaces always agree. VS Code inherits it via the shared `getHoverInfo`.
- **AST-based type inference** (`type-inference-ast.ts`, the regex-audit Phase 5b design): declarations carry their real AST context (`Declaration.typeContext`) and are typed structurally — position-aware scope resolution, so shadowed names resolve to the declaration that governs the cursor. Covers what the regex engine missed: array-destructure positions (`let [num, pb, sb] = [5, @{}, ${}]`), `[element, index]` loop bindings (index is `number`), method-trailing-block params, number/boolean/`calc()`/StyleBlock literals, and element types through `PathBlock.fromGlyph(...)` / `glyph.contours` (displayed as `array<PathBlock>`). The regex rules in `type-inference.ts` remain solely as a fallback.
- **variableOffset builder registration**: new `@type VariableOffsetBuilder` / `CompoundVariableOffsetBuilder` interfaces in `pathogen-api.ts` — `vo.` inside a `variableOffset() {|vo, pb|}` block now completes and hovers `stop`/`startTangent`/`endTangent` (caps on the compound builder), with `CurveContinuity`-aware snippets. New `@blockparams` JSDoc tag feeds the generated `METHOD_BLOCK_PARAMS` so both block params infer their types.
- New generated metadata maps: `TYPE_ELEMENT_TYPES` (array element types from `PathogenArray<X>` members), `NAMESPACE_METHOD_RETURNS` (namespace function returns, e.g. `Color.palette` → array of Color), and number/boolean property types in `TYPE_PROPERTY_TYPES` (destructured numeric bindings hover as `number`).

### Changed

#### Core

- **`analyzeScopes` uses the lenient Lezer parse** (error recovery) instead of the strict parser: scope-dependent features — completions, hover, go-to-definition, rename, semantic tokens — keep working while the document has mid-typing parse errors (an unterminated `vo.` no longer blanks the whole document's intelligence).
- Hover resolves names at their **declaration sites** too (`let` names, fn params, loop vars, `{|block params|}`), and block params get their own "block parameter" label.

### Development

- Hover test suite gains the full variableOffset repro program as an integration fixture plus a binding-form × hover-site coverage matrix (every literal kind, destructure position, loop form, and block-param form) so future inference holes fail a test instead of surfacing as UX reports.
- `src/language-services/CLAUDE.md` and the cross-system lifecycle checklist now cover trailing-block methods (`@blockparams` + builder `@type` interface) and direct new inference rules to the AST module.

## [Unreleased] - 2026-07-23 (zoom/pan parity + shared zoom pill)

### Added

#### Core

- **`<pathogen-zoom-pill>`** — the single shared zoom control for every preview surface, shipped inside the pan-zoom bundle (`src/ui/zoom-pill.ts`, registered by `dist/pan-zoom.global.js`) so even the VS Code webview gets it from the script it already loads. Glass pill styled after the mini-workspace design (999px radius, backdrop-blur, borderless buttons, editable % input with arrow-key nudges), bottom-center with hover-fade, themed via a `--playground-token → --vscode-* → literal` fallback chain, styles applied through constructed `adoptedStyleSheets` (webview-CSP-safe). Storybook entry under Shared.
- **`shouldStartPan` predicate on `PanZoomConfig`** — surfaces with foreground drag interactions (legend drag/resize, thumbnail crop box) can veto pan capture per press; the controller stands down before `preventDefault`, leaving the event untouched for the surface's own handlers. First instance-level controller unit tests (fake DOM harness).

### Changed

#### Playground

- **All five preview surfaces now share one zoom/pan system**: the Export and Set Thumbnail modals migrated from hand-rolled viewBox-mutation zoom to the transform-mode `PanZoomController` — zooming now magnifies the artwork to fill the pane (matching the primary preview) instead of clipping inside a fixed window. The export modal's preview goes full-bleed: the bottom zoom-bar strip is gone, replaced by the floating pill plus a glass Snap chip (legend mode only). Four duplicated copies of zoom-chrome CSS deleted.
- **Zoom range standardized to 10%–2000%** (was 25%–1000% on controller surfaces, 10%–1000% in modals) via the now-exported shared `DEFAULTS`; all per-component MIN/MAX/STEP constants deleted.
- Export downloads are transform-proof: `_prepareExportClone` force-bakes any in-flight gesture and strips the controller's inline styles, so SVG/PNG/PDF bytes are identical even when a download races a pan (E2E-verified).

#### VS Code

- Preview panel adopts the shared pill (replacing its bespoke `--vscode-*` zoom bar) and the shared zoom range; the stale hard-coded 25–1000% input validation is gone.

### Development

- `project-docs/unified-export/verify-export.ts` extended to 41 checks: PointerEvent pan gestures, predicate veto on legend targets, mid-gesture byte-clean download, a fills-the-pane zoom-window geometry pin, a visible-artwork-layers guard, and a standalone-bundle check that `pan-zoom.global.js` alone registers a styled pill (the VS Code path). Execution record in `project-docs/pan-zoom-performance/zoom-surface-parity.md`.

## [Unreleased] - 2026-07-21 (unified export workflow)

### Added

#### Playground

- **The Export dialog is now the single export workflow** (⋮ → Export, or Ctrl/Cmd+Shift+E): SVG, **PNG** (new format — 1×/2×/4×/custom-width scaling capped at 16,384 px per side, transparent-background option, embedded fonts), and print-ready PDF from one dialog. The legend is now **optional and off by default**; legend-less exports carry a small *Created in pathogen.studio* watermark (vector through PDF outlining, even in raster mode). The legend's source listing gains **syntax highlighting** (default on) via the new `highlightPathogenTokens()` API with the light print palette inlined as literal fills — identical colors in SVG text, PNG pixels, and PDF outlines. The legend is clamped inside the canvas everywhere it can move (drag, arrows, resize, content growth) so exports never silently crop it.
- The old "Export with Legend" menu item and the raw-source `.svgx` download are retired; Ctrl+S remains autosave-only.

#### Core

- `highlightPathogenTokens(source)` — token-level highlighter API (one array per source line, round-trip invariant); `highlightPathogen` reimplemented on top of the same walk.

### Documentation

- `docs/exporting.md` rewritten around the unified dialog (formats at a glance, optional legend, branding, PNG section).
- New launch blog post: *Export Anything: SVG, PNG, and Print-Ready PDF from One Dialog* (`/blog/unified-export`, post30 sample `meridian-bloom.pathogen`).

### Development

- New tests: `highlight-tokens`, `legend-code-tokens`, `code-print-palette` (drift-guard against theme.css), outliner multi-tspan fills; Puppeteer E2E harness `project-docs/unified-export/verify-export.ts`.

## [Unreleased] - 2026-07-20 (font-family variables)

### Added

#### Core

- **`@font` accepts a variable source** — `@font fontFamily;` (optionally with a weight) now parses, where `fontFamily` is a top-level `let` bound to a plain string literal. Resolution is static (fonts load before evaluation): the new `resolveFontDirectives(program)` export const-folds top-level string `let`s; an unresolvable identifier is a positioned hard error in both the CLI and the playground. `@fontFamily` (no space) stays an error with a "did you mean `@font fontFamily`?" hint — `@font` is a single token, so without the guard it would silently parse as `@font Family`. AST gains `FontDirective.sourceKind: 'literal' | 'identifier'`; the formatter emits identifier sources unquoted.
- **Template-literal values in style blocks** — `` font-family: `${family}`; `` now parses and interpolates. The `StyleContent` grammar token is redefined to be quote- and template-aware (one brace level inside `${...}`), so a `}` inside a quoted value or an interpolation no longer terminates the style block; the AST-builder value scanner mirrors the same states and reports "Unterminated template literal in style value". Comments, `//` inside `url(...)`, and slashes keep the old stop-at-`}` extent — quotes are simultaneously plain content and string starts, with the DFA's longest-match rule picking the right boundary (adversarial single-line cases like `${ fill: red; // note }` and `url(https://…)` are regression-tested after code review caught the first formulation crossing the brace). One deliberate asymmetry: a literal `}` value needs **double** quotes — single-quoted strings never cross `}`, so everyday comment apostrophes (`// don't … // it's`) on one line can't swallow the block's closing brace. Double-quoted strings remain literal: `font-family: "${f}"` is now a clear disallowed-token error instead of a confusing "Missing ';'".

#### Playground

- **Variable- and expression-valued `font-family` now loads the right Google Font** (the reported bug: `font-family: fontFamily;` rendered a fallback font and wrong weight even though the compiler resolved it correctly). Font fetching is now two-tier: the pre-compile scan resolves `@font` directives **AST-first** — when the library global is loaded it uses the same `parse` + `resolveFontDirectives` as the CLI for exact surface parity (indented top-level `let`s, multiple statements per line, optional trailing `;`), with the regex scan kept only as a mid-typing fallback — plus style-block variable substitution through top-level string `let`s; and a new post-compile pass (`extractFontReferencesFromCompileResult`) walks the compiled layers' *resolved* styles — recursing into group children and merging text-element styles — fetching any binaries the source scan missed. No recompile is needed: compile-time font consumers throw on a missing family, so late binaries only feed the preview iframe's `@font-face` injection.

#### Playground (follow-ups)

- **Stale-preview marker** — when compilation fails, the preview pane keeps the last good render for context but now dims it and shows a "Stale preview — fix errors to update" badge, clearing on the next successful compile. Previously a stale render (with stale injected fonts) was indistinguishable from current output — the source of the "quoted font-family appeared to work" misread in the original bug report. Storybook gains a Stale story + toggle.
- **`@fontFamily` typo now gets a positioned editor diagnostic** — the adjacency guard's "unknown directive '@fontFamily' — did you mean '@font fontFamily'?" message carries line *and column*, so `getDiagnostics` anchors the squiggle to the directive (was: a generic parse error pinned to the top of the file), and the suggestion names the full intended variable rather than the `Family` remainder token.

### Documentation

- `docs/path-blocks.md`: `@font` variable form, resolution rule, and error message; variable + template pairing example.
- `docs/layers.md`: "Variables and Interpolation in Values" — bare identifiers, backtick interpolation, and the double-quotes-are-literal rule.
- `docs/syntax.md`: style-block value evaluation cross-link.

### Development

- New tests across `tests/parser.test.ts` (style-block templates, `}` in quoted values, unterminated-template error, `@font` identifier + `@fontFamily` guard), `tests/font-provider.test.ts` (`resolveFontDirectives`), `tests/layers.test.ts` (identifier/template/quoted-literal resolution pins), `tests/cli.test.ts` (file font via variable, unresolved-identifier error), `tests/font-loader.test.ts` (let-map extraction, identifier refs, compile-result extraction), and the formatter suite.
- `scripts/debug-font-variable-resolution.ts` — puppeteer verification that the Noto Sans binary is fetched, injected into `#pathogen-fonts`, and computed on the rendered `<text>` for the variable program; plus a cold repro of the quoted-literal case. Artifacts in `project-docs/font-variable-resolution/`.
- Deferred: scope-analysis reference (rename/go-to-def) for the `@font` identifier — needs an `identifierLoc` on the AST node first (see `project-docs/font-variable-resolution/STATUS.md`).

## [Unreleased] - 2026-07-19 (export output optimization)

### Added

#### Playground

- **Export output optimization in "Export with Legend"** (mockup-reviewed):
  - **Precision** (Advanced Export Settings; SVG + PDF): per-export coordinate-decimal trimming, seeded from but never mutating the workspace footer Precision (`toFixed`) setting. Applied as a post-processing pass over artwork `path[d]` attributes that re-emits **absolute** commands — rounding absolute coordinates never accumulates drift, unlike rounding the compiler's relative deltas. Text outlines and the legend are untouched.
  - **Detail** (PDF, Vector artwork only): resolution-aware decimation — culls path segments smaller than a fraction of one printed dot (300 DPI) at the chosen print size (`Fine` = ½ dot, `Standard` = 1 dot; complex artwork defaults to Standard). Visual error is bounded by the sub-dot epsilon; the dialog reports the reduction ("Detail: removed 2,447 of 4,007 path segments"). Hidden in Raster mode.
  - PDF coordinates now written at `floatPrecision: 5` (0.00001 pt), eliminating 17-digit float artifacts from the content stream.
  - **Cover sheet — preview + print specs** (mockup-reviewed): an optional page-1 job ticket (Letter for inch users, A4 for cm) with a fast raster preview, a spec manifest (trim/page size, margins, bleed, artwork mode + detail reduction, precision, date, creator), a technical summary, and handling notes ("print or send page 2 only"; a slow-render heads-up for vector artwork). Because Finder/Quick Look/Preview render page 1 for thumbnails, the cover makes dense-artwork PDFs preview instantly instead of appearing broken. Defaults ON when complex artwork is detected; docs note to disable it for automated upload portals requiring single-page files. Cover text is outlined like everything else — the document stays 100% font-free.

### Changed

#### Playground

- **Export with Legend layout** (mockup-reviewed, 4 variations): the modal's top bar is gone — the form column now owns a sticky header (title + close) and a sticky bottom action bar (Cancel + Download). The Download action sits adjacent to the form it acts on and never scrolls away; the preview pane gains the full modal height. Blog screenshot re-shot to match.

### Fixed

#### Playground

- **Optimization passes no longer touch defs-scoped geometry** — markers, clip paths, and patterns live in their own local coordinate systems where the artwork-derived epsilon/precision are meaningless; they are now excluded (was: every `path[d]` outside the legend). Guarded by an E2E marker fixture.
- **Decimation can no longer corrupt `S`/`T` smooth-curve reflections** — smooth shorthands are normalized to explicit `C`/`Q` at parse time (while original command adjacency is known), so culling a tiny predecessor no longer re-bases the reflection on a distant unrelated curve (previously up to a ~56-unit silent shape shift on hand-authored paths).
- Reduction counters now only count paths whose optimized `d` was actually written.
- **Export failed with `SecurityError: showSaveFilePicker … Must be handling a user gesture` on large artwork** — the save dialog now opens FIRST, inside the click, before the export pipeline runs (Chrome expires transient user activation after ~5s; dense artwork's outlining/rasterization/svg2pdf easily exceed that). Bonus: cancelling the dialog now skips the whole pipeline, and the file writes to the pre-acquired handle when generation finishes. Geometry validation still runs before the dialog so margin errors surface without a pointless save prompt.

#### Library

- New exports: `trimPathDataPrecision(d, decimals)`, `decimatePathData(d, epsilon)` (+ `DecimateResult`), `commandsToAbsoluteD(commands, {format})`, `parsePathDataExpanded(d)` — additive absolute-emission path passes in `src/evaluator/path-{precision,decimate}.ts` and `path-data.ts`; multi-group commands expanded per the SVG grammar (extra `M` groups become LineTos). Existing byte-locked serializers unchanged.

### Documentation

- `docs/exporting.md` gains an "Optimizing output" section — including the first published documentation for the workspace Precision control / CLI `--to-fixed`.

### Development

- New suites `tests/path-precision.test.ts` (18), `tests/path-decimate.test.ts` (13), and `tests/pdf-cover-sheet.test.ts` (15) — incl. a no-drift proof vs naive relative rounding, epsilon-monotonicity/idempotence invariants, S/T reflection normalization across subpath boundaries, and cover manifest formatting. E2E harness extended to 56 checks (decimation op-count reduction, precision decimals/absolute assertions, floatPrecision probe, marker-untouched guard, cover-sheet page structure incl. the long-values + Standard-detail combination).
- `playground/CLAUDE.md` drive-by: the browser global is `window.PathogenLang` (stale `SvgPathExtended` reference fixed).

## [Unreleased] - 2026-07-18 (print-ready PDF export)

### Added

#### Playground

- **Print-ready PDF export in "Export with Legend"** — the export modal gains a Format selector (SVG / PDF). The PDF path is built for third-party print handoff at poster sizes:
  - **Text outlining**: every `<text>`/`<tspan>` in the artwork and legend is converted to vector path outlines via opentype.js (`playground/utils/svg-text-outliner.ts` — pen model with tspan `x`/`dx`/`dy`, `text-anchor`, `dominant-baseline: hanging`, letter-spacing, whitespace-preserving code runs, per-family weight fallback with surfaced warnings). The produced PDF contains **no font programs and no text operators** — nothing for a print shop's RIP to substitute.
  - **Page sizing modes** (`playground/utils/pdf-page-layout.ts`, pure + unit-tested): *Match artwork — exact print size* (enter the printed artwork size, W↔H permanently locked to the ViewBox ratio, page = artwork + margins, never letterboxed), US/ISO presets (18×24, 24×36, Letter, Tabloid, A4–A0) with portrait/landscape, and *Custom page* (1–100 in per side) with a toggleable aspect-ratio chain lock. One **Units** select (in/cm) governs every dimension, with unit suffixes on the width/height/margin inputs and a live size-summary line.
  - **Print prep**: margins control plus a bleed (0.125 in / 3 mm) + corner crop marks checkbox; the artwork background fills to the bleed edge so trimmed posters are edge-to-edge.
  - **Raster fallback**: artwork using masks/filters (unsupported by svg2pdf.js) is embedded as a ≥300 DPI PNG capped at 8192 px, with a user-visible notice; the legend stays vector.
  - Rendering via lazily-loaded vendor bundle `public/vendor/pdf-export.js` (jsPDF + svg2pdf.js behind a shim entry so they share one jsPDF instance) — zero main-bundle growth.
- **Legend footer rebrand** — "Pathogen built with pathogen-lang" → "Created in **pathogen.studio**" with the domain set in Baumans; the embedded Baumans subset now covers the `pathogen.studio` glyphs.

### Fixed

#### Playground

- **PDF export rendered all artwork black for oklch-colored workspaces** — svg2pdf.js cannot parse modern CSS color functions (`oklch()`, `lab()`, `color()`), which Pathogen uses everywhere. New `playground/utils/svg-pdf-colors.ts` normalizes every paint (fill/stroke/stop-color/color, attributes and inline styles) to sRGB hex before PDF conversion via a 1×1-canvas `getImageData` read-back (the `fillStyle` getter no longer serializes to sRGB in modern Chrome), folding color alpha into the matching `*-opacity`.
- **Advanced Export Settings collapsed to a 2px sliver when PDF format was selected** — `overflow: hidden` on the details box removed its automatic flex minimum size, so the overflowing form column crushed it. The panel's children no longer flex-shrink (the panel scrolls), and the grid controls moved above the Format selector.
- **Vector PDFs of dense generative artwork rendered for minutes or blank in Preview/Quick Look** (a 463k-operator export needed ~114s of CPU for a single thumbnail). New **Artwork: Vector / Raster** toggle in the PDF settings; artwork exceeding complexity thresholds (>1.5M chars of path data or >20k geometry nodes) auto-defaults to the 300 DPI raster path — text outlines and the legend stay vector either way.
- **Raster-mode export crashed with `RangeError: Maximum call stack size exceeded` on large canvases** — svg2pdf's image handling regexes the entire data-URL string, which overflows at print resolution. Rasterized artwork now bypasses svg2pdf entirely: flattened print-resolution **JPEG bytes** go straight into the page via jsPDF `addImage` (no data URL anywhere, no RGBA channel-splitting), with svg2pdf drawing only the vector legend on top.
- **PDF size fields overflowed the form panel** — width/height now stack on their own lines with `w`/`h` prefixes in the inputs and the aspect-ratio lock spanning both rows.
- **Raw-HTML images in SPA blog posts rendered at natural size and overflowed the article column** — `blog-post-view` now constrains `.post-content img` to `max-width: 100%` (the static blog shell already did); benefits every post with screenshots.

### Documentation

- New published docs page `docs/exporting.md` ("Exporting Your Work") covering the Export-with-Legend workflow, SVG export, PDF sizing modes, bleed/crop marks, what stays vector, and limitations.
- Announcement blog post `print-ready-pdf-export` with a poster-shaped `post29` sample.

### Development

- `scripts/build-vendor.ts` gains `entryPath` for local shim entries; vendored `opentype.js` for the playground outliner.
- Dynamic vendor imports in `font-loader.ts`/`svg-text-outliner.ts` use variable specifiers + `@vite-ignore` so jsdom vitest suites can import these modules.
- New suites: `tests/pdf-page-layout.test.ts` (23 tests — preset/pt conversions, bleed+slug+crop-mark geometry, centering, match/custom modes, bounds), `tests/svg-text-outliner.test.ts` (12 tests against the Inter fixture font). End-to-end Puppeteer verification harness at `project-docs/pdf-export/verify-pdf-export.ts` (21 checks incl. PDF MediaBox, no-font-programs probe, raster fallback, margin-error surfacing).

## [Unreleased] - 2026-07-18 (regex-audit remediation)

Audit and remediation of risky regex-based parsing in the compiler (see
`project-docs/regex-audit/`). Structured, grammar-shaped content that was being
parsed with regexes is now parsed by purpose-built tokenizers/parsers, closing
several latent correctness bugs and two confirmed security vulnerabilities.

### Security

- **SVG fragment sanitizer hardened from a deny-list to an allow-list.** `SVGDocumentFragment()` markup is validated before it reaches the DOM (innerHTML embedding) or CLI output. Two confirmed-exploitable holes are closed: (1) the sanitizer blocked a fixed deny-list while `docs/security.md` promised an allow-list, so `<meta http-equiv="refresh">` (HTML5 foreign-content breakout → full-page hijack), `<div>`/`<img>`/`<math>` and other non-SVG elements passed through — it now rejects any element not on the documented safe set; (2) presentation attributes (`fill`/`stroke`/`mask`/`filter`/`clip-path`/`marker*`) carrying a remote `url()` were never validated (SSRF/tracking) — `url()` must now be a local fragment ref. Also: the regex tag scanner is replaced by a quote-aware cursor tokenizer (closing `>`-in-quoted-attribute truncation and whitespace-split `on*` handler bypasses), namespace-prefixed element/attribute aliases (`<svg:script>`, `x:href`) are rejected, the `data:image` href allow-list is scoped to `<image>`/`<feImage>`, unquoted attribute values and comments/CDATA/DOCTYPE/PIs are rejected. Fixtures F8/F9 in `project-docs/security/svg-attack-fixtures.md`.
- **Remote `url()` in a style value is now rejected explicitly** instead of being silently dropped (it was only dropped as a side effect of the old comment-strip eating the `//` in `https://`).

### Fixed

- **Style-block declarations missing a trailing `;` were silently dropped.** The old regex scrape (`/([a-zA-Z…])\s*:\s*([^;\n]+);/g`) required a `;` after every declaration, so a `;`-less last declaration (common in hand-written blocks) was dropped — its style property (`stroke-width`, `font-family`, …) never applied. A proper quote/paren/bracket/comment-aware declaration parser now requires `;` on every declaration and reports a positioned `Missing ';'` compile error. AST-building stays lenient (attaches an `incomplete` marker) so the language service remains resilient while a block is typed; the evaluator enforces strictly. 22 blog/demo samples that relied on the drop are fixed. Docs: `docs/syntax.md`.
- **SVG path-data tokenizing bugs.** The path round-trip tokenizer mis-parsed implicit-decimal chains (`1.5.5` dropped the second number) and packed arc flags (`1110`); a single cursor-based tokenizer (`src/evaluator/path-data.ts`) fixes both and handles exponents/sign-separators uniformly.
- **CSS color parsing** now rejects malformed forms the old regexes accepted by silently truncating (`rgb(50%50% 0)`, `rgb(1.5.5 0)`, embedded signs) — the tokenizer requires real whitespace between modern components.

### Changed

- `StyleProperty` AST nodes carry a `loc`; `StyleBlockLiteral` carries an optional `incomplete` marker. CSS-value validation errors now report per-declaration line/column.

### Development

- **Path serialize→reparse round-trip eliminated.** `draw()`/`drawTo()` previously serialized structured commands to a string and immediately regex-reparsed it to track the path context. `serializeRelativeAndTrack` (new `src/evaluator/path-data.ts`) does both in one walk, and the three diverging duplicate tokenizers + two `commandsToRelativeD` serializers across `segments.ts`/`index.ts`/`annotated.ts` are consolidated into one module. Emitted output is byte-identical (render snapshots unchanged; verified against pre-refactor CLI output).
- **`parseColor` regex ladder → tokenizer.** The nine hand-rolled CSS color-function regexes in `src/color.ts` are replaced by `src/color-parse.ts` (one scanner + a per-function acceptance table). Public `parseColor(input): OKLCH` and all call sites unchanged; the 36-row conformance suite and 136 color tests pass byte-identical, including the `hdr-color-input` picker round-trip.
- **Style-block grammar note.** A Lezer-grammar approach to structuring style declarations was attempted and abandoned: `${` is shared between `styleBlockOpen` and `templateInterpStart`, and structuring `StyleBlockLiteral` merges their LALR states, breaking template interpolation. The declaration parser lives in the AST builder instead; the grammar's `StyleContent` token stays opaque.
- New/expanded suites: `tests/path-data.test.ts`, `tests/path-roundtrip.test.ts`, `tests/color-parse.test.ts`, `tests/color-conformance.test.ts`, plus F8/F9 sanitizer fixtures and strict style-declaration tests across `parser`/`errors`/`diagnostics`.

## [Unreleased] - 2026-07-17 (segment labels & corner suffixes)

### Added

#### Definition-site path annotations: `with` corner ops and `as` labels

- **`with fillet(r)` / `with chamfer(d1, d2?)` / `with ellipticalFillet(rx, ry, rot?)` on path commands** — attach a corner operation to the joint a command creates, at the point of definition: `v 20 with fillet(5)` rounds the corner where the previous edge meets this one. Semantics are **record-then-apply**: the op is recorded on the vertex and applied at finalization via the same machinery as `.fillet()`/`.filletAtVertex()` (equivalence covered by tests), so `ctx.position` mid-program reflects authored geometry and authored records stay non-destructive. Works in `@{ }` path blocks, `apply { }` blocks, top level, and user function bodies. Errors: annotating a statement that begins a subpath, or with no previous drawing command in the subpath ("no joint to round"); curve-junction and clamping behavior matches the existing fillet methods. Not yet supported in `--annotated` mode (honest error).
- **`as segment('name')` / `as endpoint('name')` labels** — name a command range or the vertex it creates: `h 20 as segment('lid'), endpoint('corner');`. Labels are emit-neutral (byte-identical output), expression-valued (`as segment('rib-${i}')` in loops), attach at statement granularity (`circle(...) as segment('c1');` labels the whole generated range), survive corner-op trims/splices via identity propagation, and may be freely reused — a shared name forms a **group**. They are the addressing foundation for the upcoming name-based query APIs (`segment()`/`point()`/`vertex()`).
- **Optional trailing semicolon on path commands** — `h 20;` is now valid (previously a parse error with a misleading "Missing ';'" message). Clause ordering is grammar-enforced: one `with`, one `as`, `with` before `as`, comma list only on `as`. `with`/`as` remain usable as identifiers outside path-argument position (contextual keywords). New docs page `docs/segment-labels.md`; TextMate keywords, snippets, and highlight tags updated.

#### Name-based query APIs: `segment()`, `point()`, `vertex()`

- **Labels are queryable by name** on PathBlock values, ProjectedPath values, and PathLayer references: `pb.segment('lid')` returns the labeled command range as a full PathBlock (ProjectedPath in absolute coordinates for projected/layer sources) with the complete sampling/geometry API; `pb.point('corner')` returns the labeled vertex as a Point — an anchor for `drawTo`/layout that answers the **authored** sharp corner even after a corner op trims it; `pb.vertex('corner')` returns a **VertexHandle** (new value type: properties `x`/`y`/`point`/`label`, destructurable) whose `.fillet(r)` / `.chamfer(d1, d2?)` / `.ellipticalFillet(rx, ry, rot?)` are the name-based counterparts to `filletAtVertex` — robust against commands inserted earlier in the path. Layer queries (`layer('a').segment('top')`) read a non-destructive finalized snapshot of the layer's records, making layers queryable for the first time. Singular queries follow the querySelector model — first match, erroring on unknown names with the list of labels the path actually has — while the new **`segmentAll` / `pointAll` / `vertexAll`** queries return every match in authoring order (querySelectorAll-style; empty array when nothing matches), so duplicate labels form loopable groups with no index bookkeeping. Not supported in `--annotated` mode (honest error); layer/projected vertex handles reject corner ops with a "not supported yet" error (modifiability is deferred). Documented in `docs/segment-labels.md` (with `docs/layers.md` and `docs/path-blocks.md` cross-references); all docs examples compile verbatim against the shipped implementation.

### Fixed

- **Conditions nested inside re-parsed expressions were silently dropped.** `parseExpression`'s boolean recursion guard made any expression parsed while another parse was in flight return null — most visibly, an `if (param)` condition inside a path block returned from a function defaulted to `true`, running the branch regardless of the argument (`fn tab(withNotch) { return @{ ... if (withNotch) { ... } }; }` ignored `tab(false)`). The guard is now a depth limit (each nested parse handles a strictly shorter span, so legitimate nesting terminates; pathological recursion still bounds at 32). Found while authoring the announcement blog post's robustness sample; regression tests in `tests/evaluator.test.ts`.

### Changed

- **Breaking (pre-1.0):** `PathBlockValue.pathStrings: string[]` is replaced by `PathBlockValue.records: PathRecord[]` — the statement-granularity authored store pairing each byte-exact raw fragment with its structured commands. `PathLayerState.accum` is now a `PathStore` (records) instead of `string[]`. `PathRecord`, `PathStore`, `PathCommandMeta`, and `RecordedCornerOp` are exported from the package root. The field was write-only in practice; emitted SVG is unchanged.

### Development

- **Segments-everywhere refactor.** Both evaluators now accumulate structured `PathRecord`s (raw fragment + commands + optional label/loc) through a single write path (`src/evaluator/segments.ts` `recordPath`); `LayerOutput.data` joins the byte-exact raw fragments, so zero-annotation programs emit byte-identical output (render snapshots unchanged). `PathWithResult`/`PathSegment` carry their structured commands from tracking time (draw/drawTo, projected drawTo, `arcFromCenter`, `arcFromPolarOffset`, `tangentArc`, stdlib returns). Command identity (`meta`) propagates through `resolveSmooth`, corner-op trims, and splices in `sampling.ts`/`path-transforms.ts`, with inserted corner commands inheriting a segment label only when both neighbors share it. `PathCommand` GLR ambiguity against `ExpressionStatement` resolved with dynamic precedence (`h -120 with ...` parses as a path command).
- **Fixed a latent double-adjustment bug in `parseExpressionAt`** — AST nodes sharing a `loc` object (method call + its object) were line-shifted twice, corrupting error locations for single-letter-variable method calls (`s.foo();`). Locations are now adjusted exactly once (visited-set guard).
- New suites: `tests/segments.test.ts` (store/parse units + 30k-command perf smoke), `tests/segment-labels.test.ts` (recording, validation, finalization equivalence), snapshot fixture `13-segment-suffixes` exercising the syntax end-to-end. Note for grammar regens: `npx lezer-generator src/parser/pathogen.grammar -o src/parser/pathogen.generated.ts`, then re-apply the `keyof typeof spec_Identifier` type patch on the `specialized:` line (required for the DTS build).

## [Unreleased] - 2026-07-17

### Added

#### Object destructuring for built-in struct values

- **`let { x, y } = Point(20, 20);` now works** — object destructuring, previously limited to object literals, extends to every fixed-shape built-in value: `Point`, `PolarVector`, `Grid`, `MeshPoint`, `Color`, and context objects (`let { x, y } = ctx.position;`). Renaming (`{ x: px }`) and rest patterns work too; rest collects the remaining data properties into a plain object, including computed ones (a `Grid` rest carries `width`/`height`). Missing keys on a struct throw the same error as dot access (`Line N: Property 'z' does not exist on Point`) — object literals keep their lenient `null` binding. Documented in `docs/objects.md` (new "Destructuring Built-in Values" section) and cross-referenced from `docs/syntax.md`. (`src/evaluator/struct-properties.ts`, `src/evaluator/index.ts`, `src/evaluator/annotated.ts`.)
- **Editor support for destructured bindings.** Member completions and chains resolve through destructured names — `let { origin } = grid;` gives `origin.` the full Point member set; `let { color } = meshPoint;` gives `color.` the Color set. Inside the pattern braces themselves, `let { | } = grid;` suggests the RHS type's data properties (already-used keys excluded, methods and keywords suppressed; object-literal RHS suggests its keys). Backed by a new generated `TYPE_PROPERTY_TYPES` map extracted from `pathogen-api.ts` property declarations. (`src/language-services/completion.ts`, `scripts/lib/completion-extract.ts`.)
- **Type-aware hover for all inferable variables.** Hovering a variable now shows its inferred type — `let p = Point(10, 20);` hovers as `*variable: Point*`, destructured bindings resolve through the same rules (`origin` from a Grid hovers as Point), colors display as `Color`, and un-inferable variables keep the previous hover text unchanged. (`src/language-services/hover.ts`, new shared `src/language-services/type-inference.ts`.)

### Development

- **Single source of truth for struct properties.** New `src/evaluator/struct-properties.ts` registry (`getStructDescriptor` → `has`/`get`/`keys`) now backs both member access and destructuring in **both** evaluators; the six duplicated per-type member-access branches were deleted from each. `has()` uses `Object.hasOwn`, fixing a latent leak where `point.toString` resolved `Object.prototype.toString` instead of throwing. A drift-guard suite (`tests/struct-properties.test.ts`) mechanically asserts destructuring ≡ member access for every registry key through both evaluators.
- **annotated.ts type dedup.** 19 locally re-declared value interfaces replaced with `import type` from `evaluator/types.ts`; only genuinely divergent types (`GradientValue`, `PathWithResult`, `EvaluationState`, `Scope`) and the four that embed the module-local `Value` union (`GridValue`, `CyclerValue`, `ArrayValue`, `ObjectValue`) remain local, each with the reason documented.
- **Shared type-inference module.** `inferType` and friends moved out of `completion.ts` into `src/language-services/type-inference.ts` so hover and completion share one inference engine; new `inferRhsType` handles destructuring right-hand sides (`ctx.position`, constructor calls, color literals, variables).
- Destructuring error messages in text-block bodies now carry line numbers (three `bindDestructuringPattern` call sites previously dropped them).

## [Unreleased] - 2026-07-13

### Added

#### Language-service audit — snippet templates, defs-constructor completions, drift guards

- **Snippet templates on every callable completion.** Accepting a method or constructor now inserts a usable template instead of the bare name: block methods insert braces with the cursor inside (`apply { … }`), calls insert tab-stop placeholders per required parameter (`drawTo(x, y)` with `x` selected), and binding-block constructors insert the full block form (`Marker('id', 10, 10) {|m| … }`). Templates are generated from `src/pathogen-api.ts` parameter lists, with an explicit `@snippet` JSDoc tag for trailing-block syntax TypeScript can't express. The playground uses CodeMirror's native `snippet()` for real Tab-cycling between placeholders; VS Code gets LSP snippet format (with a plain-text fallback for clients without `snippetSupport`). (`scripts/generate-completions.ts`, `scripts/lib/completion-extract.ts`, `playground/utils/cm-completion-bridge.ts`, `packages/pathogen-language-server/src/server.ts`.)
- **Completions, hover, and signature help for all 12 defs constructors.** `Mask`, `ClipPath`, `LinearGradient`, `RadialGradient`, `ConicGradient`, `MeshGradient`, `FreeformGradient`, `TopoGradient`, `Pattern`, `Marker`, `SVGDocumentFragment`, and the `PathBlock` namespace previously had **zero** editor support — no completion, no hover, no signature help — despite being documented and dispatched by the evaluator. All are now declared in `pathogen-api.ts` with `@type` member interfaces, so their returned objects complete too: `m.append` inside a `Marker` block, `g.stop(...)` on gradients, `g.getPoint(0, 0).color` on meshes (with a new per-type method-return map that also keeps `grid.getPoint()` → Point distinct from `mesh.getPoint()` → MeshPoint). A new `ProjectedPath` member set covers `.project()`/`.draw()`/`.drawTo()` results.
- **Style property names complete as full declarations.** Accepting a property name inside a `${ … }` style block inserts `name: ;` with the cursor in value position (e.g. `stroke-width: |;`), so the value can be typed immediately. When a `:` already follows the cursor (retyping a name over an existing declaration), just the name is inserted — no doubled punctuation. (`src/language-services/completion-data-static.ts`, `completion.ts`.)
- **Value-position suggestions after the colon.** Typing `:` in a style block now triggers property-specific value completions — `stroke-linecap:` offers `butt`/`round`/`square`, `fill-rule:` offers `nonzero`/`evenodd`, `stroke:`/`fill:` offer `none`/`currentColor`/`context-stroke`/`context-fill`, and so on for the ten enumerated properties — ranked above generic CSS keywords and alongside the user's own variables. Hyphenated value keywords (`line-through`, `text-top`) get the same replacement-range treatment as property names via a new `getStyleValueKeywordRun` helper (both surfaces), scoped so expression-like values (`4 2`, `w - 2`) keep normal word handling. `:` added to completion trigger characters in the playground and LSP. (`completion-data-static.ts`, `completion.ts`, `cm-completion-bridge.ts`, `cm-language-services.ts`, `server.ts`.)
- **Constructor registry + self-verifying drift guards.** New `src/evaluator/constructor-registry.ts` enumerates every evaluator-dispatched constructor; `tests/constructor-registry.test.ts` compiles a canonical program per name through **both** evaluators so the registry can't rot. The generator's `crossCheck()` now validates `pathogen-api.ts` against stdlib + context-aware functions + the registry, and `npm run check:completions` runs it in `--strict` mode (non-zero exit on drift). The pre-commit hook runs the check when a commit touches the API surface, evaluator, stdlib, or the generator (warn-only).

### Fixed

#### Completion bugs from the language-service audit

- **`stroke-` + accept → `stroke-stroke-width`.** Style-block property names are hyphenated, but both editors' word patterns treat `-` as a boundary, so accepting a completion re-inserted the already-typed prefix. The playground bridge now widens its word/`validFor` patterns to include `-` **only** in style property-name position (via a new `isStylePropertyNamePosition` export — `a-b` subtraction is untouched), and the LSP attaches an explicit `textEdit` covering the hyphenated prefix. The engine also filters property-name completions by the hyphen-aware prefix so the popup narrows as you type. (`playground/utils/cm-completion-bridge.ts`, `packages/pathogen-language-server/src/server.ts`, `src/language-services/completion.ts`.)
- **`drawTo` documented a signature that throws.** Completion detail read `drawTo(layerName) — Emit to layer`; the runtime signature is `drawTo(x, y)` (returns a ProjectedPath). Root cause was a wrong declaration in `src/pathogen-api.ts` — the published docs page was already correct. Also corrected `draw()`/`project()` return-type declarations.
- **Choice-syntax snippets inserted raw `${2|Grain,Paper|}` text in the playground.** The bridge's placeholder handling didn't understand VS Code choice fields (used by the NoiseFilter/GlowFilter/MotionBlurFilter declaration snippets); they now convert to their first choice, and the manual fallback selects the first placeholder default so typing replaces it.
- **`--annotated` mode was missing 5 defs constructors, all 7 filters, `PolarVector`, and `Cycler`.** `Mask`, `ClipPath`, `MeshGradient`, `FreeformGradient`, and `TopoGradient` (plus every filter constructor, `PolarVector`, and `Cycler`) threw `Undefined variable` under `pathogen-lang --annotated`. All now evaluate with full member/property support (gradient sub-methods, `append`, MeshPoint color assignment); filters evaluate as lenient stubs since annotated mode emits no defs. Statement-level defs-constructor calls now report the same error as the main evaluator instead of a misleading `Undefined variable`. (`src/evaluator/annotated.ts`.)

### Development (language-service audit)

- `completion-data.generated.ts` gains `CONSTRUCTOR_RETURN_TYPES` and `TYPE_METHOD_RETURNS`; `completion.ts` type inference now derives constructor and binding-block rules from them instead of hand-maintained regex ladders (adding a constructor to `pathogen-api.ts` propagates everywhere with no engine change).
- Generator logic extracted to `scripts/lib/completion-extract.ts` with unit tests (`tests/language-services/generate-completions.test.ts`); `escapeString` now encodes newlines/tabs so multi-line templates emit valid code.
- Deleted the hand-maintained `packages/pathogen-language-server/src/pathogen-lang.d.ts` type shim — the LSP now typechecks against the real `dist/index.d.ts`.
- Rewrote stale `src/language-services/CLAUDE.md` (referenced a deleted `completion-data.ts`, claimed all enums were missing) and fixed the same stale references in `src/CLAUDE.md`.
- New tests: method-snippet/detail assertions in `completion.test.ts`, replacement-range + snippet-apply coverage in `completion-bridge.test.ts`, defs-constructor hover in `hover.test.ts`.

### Added (2026-05-24)

#### `variableOffset` / `compoundVariableOffset` — variable-distance offset paths with per-stop curve continuity

- **Core.** Two new PathBlock methods that trace a *new* path alongside a reference "spine" using a gradient-stop-like syntax. Where `offset(distance)` produces a uniform parallel curve, these let the offset distance **vary** per stop and let you choose the join continuity at each stop. Model A ("rail-guided points"): each stop samples the spine at an arc-length fraction and steps along the spine normal to a point; the points are connected by a curve whose joins you control. (`src/evaluator/variable-offset-geometry.ts`, `src/evaluator/index.ts`.)
  ```
  let edge = spine.variableOffset() {|go, pb|
    go.stop(10%, 5,  CurveContinuity.G1);
    go.stop(50%, 15, CurveContinuity.G2);
    go.stop(90%, 20, CurveContinuity.G1);
  };
  ```
- **`CurveContinuity` enum** — `G0` (corner), `G1` (tangent-continuous, no kink), `G2` (curvature-continuous, seamless flow). A run of `G1`/`G2` stops is built as one spline; `G2` runs solve a **clamped** cubic spline for curvature continuity, with centripetal parameterization. Endpoint tangents default to the spine's own direction (natural ⅓-chord tension) or take an explicit `PolarVector` handle via `go.startTangent`/`go.endTangent`.
- **`compoundVariableOffset`** — two profiles (one per side), closeable into a filled ribbon with **end caps**: `Cap.butt()`, `Cap.round()`, `Cap.elliptical(projection)`, `Cap.tapered(length, continuity?)`. Omitting a cap leaves that end open; omitting both yields two unconnected profiles. The `pb` block parameter is the spine itself, exposing the existing `get`/`tangent`/`normal`/`length`/`vertices` sampling API.
- **Documentation.** New published page `docs/variable-offset.md`.
- **Three-surface parity.** Works identically in the CLI, playground preview, and VS Code preview (returns a standard `PathBlockValue`); editor completions for the methods, `Cap.*`, and `CurveContinuity.*` in both the playground and VS Code LSP. Not supported in `--annotated` debug mode (raises a clear error).

#### Shared CSS-transform pan/zoom controller — large-SVG pan/zoom ~16× faster

- **Problem.** Panning/zooming a large workspace was janky. Puppeteer profiling (`scripts/perf-pan-zoom-audit.ts`, `scripts/perf-transform-probe.ts`, `project-docs/pan-zoom-performance/`) proved it was **raster-bound, not JS-bound**: mutating an SVG's `viewBox` makes Chrome re-rasterize the whole drawing every frame (~300 ms/frame for a scene of 481 paths carrying 72.5M chars of path data — *not* the assumed ~422k DOM nodes; `circle()` in a `PathLayer` emits path data, not elements). Driving pan/zoom with a CSS `transform` on the composited layer instead is ~25× cheaper for pan / ~12× for zoom.
- **`PanZoomController`** (`src/ui/pan-zoom-controller.ts`, shipped as `dist/pan-zoom.global.js` → `window.PathogenPanZoom`, plus ESM/types via the `pathogen-lang/pan-zoom` sub-path). Framework-agnostic, DOM-only, zero top-level DOM. CSS-`transform` during a gesture, baked into the `viewBox` on idle (atomic, flash-free — verified by CDP screencast). Wheel + pointer drag + **touch pinch-zoom**; rAF-batched; loop-safe (input → `onChange`; external writes → `setView`, no echo). Configurable `rebaselineThreshold` (default 0.5) bounds the "blank while panning far when zoomed in" reveal by re-rasterizing mid-drag. A `viewbox` mode keeps viewBox mutation for surfaces whose overlays can't ride a transform. Pure math (`clampPan`/`adjustPanForZoom`/`viewToViewBox`/`computeTransform`) unit-tested (`tests/pan-zoom-controller.test.ts`).
- **Adopted across every pan/zoom surface:** workspace preview (`svg-preview-pane.ts`, ~16× faster / ~300× less raster on the big scene), blog/BBWP mini-preview (`blog/mini-preview.ts`), VS Code preview webview (`packages/vscode-pathogen/src/preview.ts`), and — math-only (dedup, keep viewBox) — the thumbnail-crop and export-legend modals. Surfaces with a navigator minimap also split the viewport rect into a GPU-promoted overlay SVG so its per-frame update stops re-rasterizing the heavy minimap paths.
- **Wheel-zoom modifier per surface.** The workspace editor and blog/website embeds gate wheel-zoom behind Ctrl/Cmd (with a brief "⌘ + scroll to zoom" hint) so plain scrolling doesn't trap the page; the VS Code preview — a dedicated panel — zooms on plain scroll.
- **`bakeDelayMs` default is 72 ms** (idle before the crisp re-raster bakes in), so the area revealed by zooming out fills in quickly.

### Changed

#### Playground pan/zoom hygiene (folded into the controller)

- Pan/zoom no longer rebuilds the navigator minimap or re-styles every path each frame, no longer double-fires the viewBox update, and is rAF-batched with a cached screen-CTM — previously every `mousemove`/`wheel` ran the heavy `updateSvgStyles` path twice. These were stepping-stones now subsumed by the shared controller.

### Fixed

#### Formatter could silently change program meaning

- `formatDocument` (VS Code "Format Document", playground, and the new `npm run format:pathogen` CLI) had three semantic-corruption bugs: it dropped precedence parentheses (`calc((i + 0.5) / 28)` → `calc(i + 0.5 / 28)` — different math), re-quoted double-quoted strings containing single quotes without escaping (parse error), and printed `-(a + b)` as `-a + b`. Fixed with a grammar-mirrored operator-precedence table, quote-aware string re-escaping, and unary-argument parenthesization; regression tests assert formatting is meaning-preserving and idempotent. (`src/language-services/formatter.ts`.)

#### Uncapped `compoundVariableOffset` teleported its second profile to the canvas origin

- The no-`endCap` case emitted the profile-2 subpath break as an uppercase `M`, which the relative-command serializer turned into a literal absolute `M 0 0` — so the second profile jumped to the canvas origin whenever the ribbon was drawn anywhere else. Found by an independent model audit of the geometry; the exact-coordinate test had encoded the bug as the expected shape. Fixed to a lowercase relative `m` with a `drawTo(200,300)` regression test. Also hardened: `go.stop()` rejects decreasing times (silent cap-direction flip) and `Cap.elliptical()` rejects non-positive projections. (`src/evaluator/variable-offset-geometry.ts`, `src/evaluator/index.ts`.)

#### VS Code preview rendered blank / wrong aspect for `define ViewBox(...)` sources

- The preview webview sized its canvas from a `// viewBox="..."` source **comment** (an old convention); modern sources use the `define ViewBox(...)` construct, so `canvasW/H` fell back to the 200×200 default and all content (at the real coordinates, e.g. 13200×7200) rendered entirely outside that tiny square viewBox — a blank white box with the wrong aspect ratio. The preview now reads dimensions from the compiled `result.viewBox` (origin + size), matching the playground. (`packages/vscode-pathogen/src/preview.ts`.)

#### The default layer and the "global" layer were two distinct things internally (drift outside the viewBox)

- **Symptom.** A workspace combining `define default PathLayer(...)` with top-level (non-`apply`) path commands and context-aware stdlib functions (`polarLine`, `tangentArc`, `polarPoint`, `polarMove`, …) rendered as a long diagonal smear escaping the viewBox, instead of the intended shape. The "semi-circle-example" workspace (a spiral that re-centers each loop iteration via absolute `M`) regressed this way.
- **Root cause — a default layer forked a second set of state.** There is conceptually only **one** default layer (the implicit layer that receives bare top-level commands; `define default PathLayer` just names and styles it). But the evaluator created the named default layer with its *own* fresh `pathContext`, `accum`, and `transformState`, leaving the original global `evalState.pathContext`/`transformState`/top-level accumulator orphaned. Bare commands were redirected into the new layer's accumulator, while context-aware functions (and `parseAndTrackPathString`) kept reading the orphaned global `pathContext`. That context never saw the per-iteration `M` reset, so its position drifted monotonically and `polarLine`/`tangentArc` emitted *absolute* coordinates from the drifting base → ever-longer lines. (`apply` blocks were unaffected — they swap `evalState.pathContext` to the layer's context for the block body.) The latent split has existed since the multi-layer work; the `define ViewBox(...)` migration (`scripts/migrate-viewbox.ts`) began triggering it by prepending a `define default PathLayer` to existing workspaces.
- **Fix — collapse global and default into one layer.** A `default PathLayer` now **adopts** the global `pathContext`, `transformState`, and the top-level (root) accumulator instead of forking new ones (`src/evaluator/index.ts`, `LayerDefinition` handler), so bare commands, the pen position, the `ctx` variable, and the layer transform all refer to a single layer. The per-command "route to default layer" redirects and the temporary `getActivePathContext` resolver were removed — every site reads `evalState.pathContext` directly. The default layer adopts `evalState.rootAccum` (the top-level accumulator) rather than the locally-threaded one, so a `define default PathLayer` placed inside a function body, `.map()` callback, or another layer's `apply` block still captures top-level commands instead of silently dropping them. The annotated evaluator already used one context and needed no change. Docs (`docs/layers.md`) were corrected to describe the single default layer (previously "an implicit unnamed layer" / "Default Context (No Layers)" implied two distinct things).
- **Two latent bugs fixed as a consequence.** (1) Bare commands written *before* a `define default PathLayer` were silently dropped (they landed in the orphaned global accumulator that the output builder discarded once a named default existed) — they now render in the default layer. (2) A top-level `ctx.transform` (e.g. `ctx.transform.translate.set(...)`) mutated the orphaned global `transformState` and never reached the named default layer — it now applies correctly.
- **Verified.** The workspace compiles fully inside its 8192×8192 viewBox (rendered bbox x:[85, 8016] y:[1072, 6639]); regression tests in `tests/context.test.ts` (no per-iteration `polarLine`/`tangentArc` drift) and `tests/layers.test.ts` (pre-define commands render, top-level transform applies, single shared context). Full suite green.

#### Moderation "Regenerate preview" follow-ups

- **Regenerate hit a 404.** The action posted the preview to `/admin/approval/:id/svg` via the `_post()` helper, which defaults to `POST`, but the route is registered `PUT`-only — so it failed in production. `_post()` now accepts `PUT` and the call sends it.
- **A too-large preview aborted the whole regenerate.** Gradient-heavy workspaces bake GPU-rendered raster data into the captured SVG, so the browser's preview can be several times larger than the CLI's and exceed the 12 MB server cap (HTTP 400). The 400 threw before the thumbnail step, leaving such workspaces with neither artifact. The preview upload is now best-effort: the PNG thumbnail (the grid image and detail-page hero fallback) is always generated, and the toast reports the outcome ("Regenerated preview + thumbnail" vs "Updated thumbnail. Preview not stored: …"). Verified end-to-end in a browser via Puppeteer against `dev:stack`.
- **Regenerated non-square workspaces showed a distorted, square detail-page hero.** The admin regenerate path produced only the square (center-crop) thumbnails and never an uncropped hero — `uploadHeroRender` needs a live `<svg>` element, which the string-based admin path doesn't have. So the detail page fell back to the square 1024 thumbnail, squashing non-square art (e.g. an 8000×4800 workspace rendered 1:1). Added `uploadHeroFromSvgString` (mirrors `uploadHeroRender` but rasterizes a full-aspect SVG string), and regenerate now uploads a source-aspect hero. Verified via Puppeteer: regenerating a 600×480 workspace yields a 600×480 hero (was 1024×1024) and the detail page renders it undistorted.
- **Featured cards showed "approved Invalid Date".** `adminListFeatured` omitted `approvedAt` from its response (the Featured card renders an "approved &lt;date&gt;" meta line), so `new Date(undefined)` formatted as "Invalid Date". The endpoint now returns `approvedAt`, and `_fmtDate` degrades missing/unparseable values to "unknown date" instead.

#### Grid `fill()` / `map()` / `forEach()` compiled ~100× slower than necessary

- **Root cause — per-cell `throw`.** Each grid cell's callback body was evaluated inside a `try`, and a `return` was implemented as `throw new ReturnSignal(value)` caught once per cell. The per-cell throw-through-`try` kept V8 from optimizing the loop, so cost scaled with cell count independent of the body — a 64,000-cell `Grid(320, 200)` took ~14s to compile even when the callback was a bare `return 0.5;` (not `calc()`, not the math, not the drawing loops downstream).
- **Fix — top-level-return fast path.** A new `evaluateGridCellBody()` (`src/evaluator/index.ts`) short-circuits a **top-level** `return` without throwing; **nested** returns (inside `if`/`for`) still throw `ReturnSignal` and are caught, so all semantics are preserved (no-return → `null` cell, top-level early-return stops the body, nested return honored, `forEach` ignores returns, callback-error message unchanged). The 64k-cell fill dropped **14,400ms → 27ms**; a real flow-field workspace (64k-cell grid + 115k circles across 241 layers) went **15,049ms → 831ms (18×)**. The annotated/`--annotated` evaluator keeps the old pattern (debug-only path).

#### Public previews silently dropped for large artwork (1 MB cap)

- **Root cause.** The admin-captured preview SVG (`approval.svg`) was inlined in the KV approval record and capped at 1 MB — anything larger was silently set to `null`. A 6 MB flow-field workspace lost its preview entirely, so the detail page (`/u/:handle/:slug`) fell through to a "Preview pending" swatch no matter how it compiled.
- **Fix — R2-backed previews.** The preview SVG now lives in R2 (`{id}/approval.svg`) with the approval record stamping `approvalSvgAt`; the cap is raised to a 12 MB sanity ceiling. A new public, visibility-guarded `GET /approval-svg/:id` serves it (with `Content-Security-Policy: script-src 'none'` defense-in-depth), and the detail page references it via `<object>` with a thumbnail/swatch fallback. Legacy inline `approval.svg` records still render (backward compatible); `deleteWorkspace` cascades an R2 delete. `hasSvg` in admin listings now reflects either storage location.

#### `partition()` / sampling treated smooth `t`/`s` commands as straight lines

- Smooth-quadratic (`t`/`T`) and smooth-cubic (`s`/`S`) path commands were sampled as if they were straight line segments, so `partition()` and other length/position sampling produced wrong points along any path that used them. They are now reflected into their full quadratic/cubic control points before sampling, matching how the renderer draws them.

#### Workspace code reverting after edits (silent data loss)

- **Root cause — server-side clobber.** The thumbnail upload (`PUT /workspace/:id/thumbnail`) and clear (`DELETE /workspace/:id/thumbnail`) endpoints did a full-document read-modify-write of the `workspace:${id}` KV value just to stamp three timestamp fields — carrying `workspace.code` along. A code save (autosave, or a fresher second tab) that landed between the handler's read and write was silently reverted. The thumbnail is rendered client-side from the live preview, so it always looked up-to-date while the persisted code rolled back to an older version.
- **Fix — field isolation.** Thumbnail timestamps (`thumbnailAt`, `manualThumbnailAt`, `autoThumbnailAt`) now live in a sidecar KV key (`thumbmeta:${id}`). The thumbnail endpoints write **only** the sidecar and never touch `workspace:${id}`, so a thumbnail operation can no longer clobber code. Reads merge the sidecar with a lazy fallback to the legacy inline fields (`readThumbMeta` in `website/api/utils.ts`) — no migration job; pre-existing workspaces migrate on their next thumbnail write. The sidecar uses the `thumbmeta:` namespace (not `workspace:`) so `KV.list({ prefix: 'workspace:' })` scans don't pick it up. `deleteWorkspace` cascades a sidecar delete.
- **Root cause — dropped unload saves.** The playground API client issued saves with a plain `fetch`, so a save fired from the `beforeunload` handler (closing/navigating away) was cancelled mid-flight by the browser. Combined with the 5s debounce + 30s min-interval, edits made shortly before leaving could never land.
- **Fix — keepalive flush + UX guards.** The leave-the-page flush now uses `fetch(..., { keepalive: true })` so the request survives document teardown. A native "unsaved changes" prompt appears on unload while a save is still pending. Saves also flush on `visibilitychange → hidden` (the reliable mobile/backgrounding signal) and on editor blur, shrinking the unsaved-edit window. Auto-thumbnail failures, previously swallowed (`console.warn` only), now surface a non-blocking toast. The keepalive fetch is dispatched **synchronously** (no `await` before it) so it actually fires during teardown.
- **Root cause — multi-tab code-vs-code clobber.** Two tabs open on the same workspace both autosaved `code`; the slower (stale) tab's save overwrote the faster tab's newer code. Last-write-wins with no concurrency control.
- **Fix — optimistic concurrency.** The workspace doc carries a monotonic `rev` counter, bumped on every accepted code write. Each save sends `baseRev` (the revision the client edited from); the server rejects with **409** when the doc has advanced, so a stale tab can't clobber newer code. The client advances `baseRev` from each save's response (sequential saves keep working), and on a 409 stops autosaving, surfaces the multi-tab conflict (warning banner + save-status message), and keeps the local edit in memory — the user reconciles by reloading. Clients that omit `baseRev` keep the old behavior (backward compatible). Non-code updates (rename, preferences, publish toggle) re-read `code`/`rev` immediately before their full-doc write so they can't revert a concurrent code save either. Residual: KV has no compare-and-swap, so two saves landing in the *same* sub-second window can still race — exceedingly unlikely for one user given the 5s/30s autosave cadence; a Durable Object would close it fully.

### Added

#### Admin "Regenerate preview" action (Approved / Featured moderation tabs)

- **Per-workspace regeneration in `/admin/moderation`.** Each Approved and Featured card has a **Regenerate preview** button that recompiles the **frozen `approval.code`** (what visitors see — not the possibly-diverged live workspace), writes the full multi-layer preview SVG to R2 (the detail-page hero), and rasterizes a square-cropped variant into the grid PNG thumbnails. Used to heal entries whose preview was dropped by the old 1 MB cap or that never got a thumbnail. The card repaints immediately (local `thumbnailAt`/`hasSvg` stamp).
- **Session-admin thumbnail uploads.** `uploadThumbnail` now grants the ownership bypass to a session-authed admin (`isAdminRequest`), not only the legacy `?token=` param, so the moderation UI can refresh any workspace's thumbnail over its session cookie. The session-admin (D1) check is consulted lazily — only for non-owner uploads — so frequent owner auto-uploads pay no extra latency.

#### `MotionBlurFilter()` — directional and progressive blur

- **New custom filter constructor** (the seventh, alongside `NoiseFilter`/`GlowFilter`/`EmbossFilter`/`ElevationShadowFilter`/`InnerShadowFilter`/`PixelateFilter`) bringing the effects of the CSS [`motion-blur` proposal](https://github.com/w3c/csswg-drafts/issues/11134) — which no browser implements — to Pathogen, synthesized from stock SVG filter primitives. Configured via a trailing block: `let b = MotionBlurFilter() {|f| f.type = MotionBlurType.Linear; f.distance = 20; f.angle = 30deg; f.samples = 12; };` then `filter: b;` in a style block.
- **Two `MotionBlurType`s.** `Linear` — a directional smear along `angle` (the way a fast object blurs along its travel). `Progressive` — blur that ramps across the element, sharp at one edge and increasingly blurred toward the other (the iOS "variable/frosted blur"). New `MotionBlurType` enum (`Linear` | `Progressive`).
- **Properties:** `type` (`MotionBlurType`, default `Linear`), `distance` (≥ 0, user-space units — smear length for Linear, max blur radius for Progressive, default 10), `angle` (angle unit, default `0deg`; `0deg` = right, `90deg` = down), `samples` (integer 2–32, Linear-only tap count / quality, default 12).
- **How it's built.** Linear averages `samples` centered `feOffset` taps along the motion vector, each scaled to `1/samples` alpha and summed additively with `feComposite operator="arithmetic"` (summation, not `feMerge`, so the average isn't brightened); a final **direction-aligned** `feGaussianBlur` (two-value `stdDeviation` along the motion axis) fuses the discrete taps into a continuous smear without dulling the perpendicular edge, so the result reads as a smooth blur rather than ghost copies. Progressive crossfades a single `feGaussianBlur` copy against the sharp source through an `feImage` gradient mask in `objectBoundingBox` units, so the ramp tracks the **element's own bounding box** and supports any `angle`; the two complementary halves are summed (not merged) so a solid shape keeps full opacity through the midband.
- **Renderer support.** Linear renders in every SVG engine. Progressive depends on `feImage`, solid in Chromium-class engines (Chrome, Edge, the Electron VS Code preview) but weak in non-Chromium engines (notably Firefox), where the shape may render unblurred — documented in `docs/filters.md`. Radial/zoom blur is intentionally **not** included: it cannot be expressed as a static SVG filter (no scale/rotate primitive).
- **Surfaces & language services.** Renders in the CLI SVG output and the playground (verified via the `buildDefs` + `mountInto` DOM path). Completions, hover, member access (`f.<TAB>`), and a declaration snippet are wired for `MotionBlurFilter` and `MotionBlurType`.
- **Playground fix (incidental).** The SVG preview pane's defs-cleanup selector omitted `[data-filter-def]`, so every filter's `<filter>` def leaked across recompiles (`mountInto` appends, never clears) — a changed filter could resolve `url(#id)` to a stale duplicate. Added `[data-filter-def]` to the cleanup selector.

#### `Grid()` constructor — 2D data containers for flow fields, heatmaps, sampling tables

- **New typed value `Grid(rows, cols, options) {|grid| ... }`** for spatial data that maps cells to canvas coordinates. The trailing block runs once at construction and receives the (mutable) grid — same pattern as `Marker(...)`, `Mask(...)`, and `Pattern(...)`. `rows` and `cols` are positive integers; `options` is an object literal whose keys are all optional.
- **Constructor options:** `xDim` / `yDim` (cell size, default 1), `origin` (Point, default `Point(0, 0)`), `defaultValue` (initial cell value, default `null`), `outOfBounds` (`'clamp'` | `'wrap'` | `'null'`, default `'clamp'`), `interpolation` (`'nearest'` | `'bilinear'`, default `'nearest'`). `defaultValue` is named that way because `default` is a reserved Pathogen keyword.
- **Driving use case.** Pathogen arrays throw on out-of-bounds access; assignment doesn't auto-extend. That makes the JS-style `if (!map[row]) map[row] = []` lazy-init pattern impossible. `Grid` removes the manual init entirely (`grid.fill {|row, col, center| return ... }`), removes the manual `row*cellSize + cellSize/2` arithmetic (`grid.getPoint(row, col)`), and adds the `outOfBounds: 'wrap'` mode common in toroidal flow-field art.
- **Members:** `rows`, `cols`, `xDim`, `yDim`, `origin`, `width` (`cols * xDim`), `height` (`rows * yDim`).
- **Methods.** Cell access: `get(r, c)`, `set(r, c, v)` (mutates, returns self), `getPoint(r, c)` (cell center as `Point`), `getRow(r)`, `getCol(c)`, `cells()` (flat row-major). Iteration: `fill {|row, col, center| return ... }` (mutate every cell), `forEach {|cell, row, col, center| ... }` (side effects — drawing arrows etc.), `map {|cell, row, col, center| return ... }` (new grid). Sampling: `sample(x, y)`, `sampleNearest(x, y)`, `sampleBilinear(x, y)`. `getPoint`/`getRow`/`getCol` deliberately mirror `MeshGradient`'s vocabulary.
- **`forEach` threads the active layer's accum** when invoked inside `layer.apply { }`, so `drawTo()` / path commands inside the block emit to the surrounding layer — same semantics users already get from a regular `for` loop.
- **Bilinear sampling handles both numeric and Point cells.** Numeric cells get the standard three-lerp (`(1-fx)`/`fx` × `(1-fy)`/`fy`) blend. Point cells interpolate `x` and `y` separately — the standard fix for direction sampling, since bilinear on raw angles produces wrong directions at every wrap-around. Cells of other types throw a clear `Grid.sampleBilinear() requires cells to be numbers or Points` error.
- **`docs/grid.md`** is the new user-facing page (registered in `scripts/build-docs.ts` `DOC_FILES`). Covers the constructor, options, members, methods, a full flow-field example, the bilinear-sampling primer, and the angle-wraparound caveat (`Point(cos(a), sin(a))` then `atan2(v.y, v.x)`). `docs/stdlib.md` and `docs/grid.md` carry reciprocal "not to be confused with" callouts disambiguating the new data-container `Grid()` from the existing `squareGrid`/`triangleGrid`/`hexagonGrid` PathSegment generators.
- **Completion + hover + signature help.** `Grid` is declared in `src/pathogen-api.ts` as `PathogenGrid` with `PathogenGridOptions`. `npm run generate:completions` produces the top-level constructor entry, the 7-property/12-method member set, and the signature `Grid(rows, cols, options)`. `let g = Grid(...)` triggers Grid member completions on `g.` via the inference table in `src/language-services/completion.ts`. Hover automatically picks up the constructor doc from `STDLIB_COMPLETIONS`.
- **VS Code.** TextMate grammar adds `Grid` to the constructor token list. A new `grid` snippet expands to `Grid(rows, cols, { xDim, yDim }) {|g| g.fill {|row, col, center| return ... }; };`.
- **Annotated evaluator parity.** `src/evaluator/annotated.ts` mirrors the constructor, member access, all 11 methods, and the sampling helpers so the Annotated debug pane doesn't error on programs using Grid.

### Tests

- **`tests/evaluator.test.ts`** — 20 new tests covering construction (defaults, `defaultValue`, fill block), members, cell access (`get`/`set`/`getPoint` with origin, `getRow`/`getCol`/`cells`), iteration (`forEach` row-major, `map` returns new grid, `forEach` inside `layer.apply` emits paths to the surrounding layer), and sampling (nearest at cell centers, bilinear at centers and midpoints, all three `outOfBounds` modes, `sample` dispatching on `interpolation`, bilinear Point interpolation).
- **`tests/errors.test.ts`** — 7 new tests pinning the error messages for argument validation, `get`/`set` out-of-bounds, invalid option values, and `sampleBilinear` on non-numeric/non-Point cells.
- **`tests/language-services/completion.test.ts`** — 1 new test verifying Grid members appear on `g.` after `let g = Grid(...)`.
- Full suite passing: **3050 tests** (up from 3022 pre-feature), no regressions.

#### `define ViewBox(...)` — viewBox in source

- **New language statement.** `define ViewBox(originX, originY, width, height);` declares the SVG viewBox in Pathogen source. Arguments are full expressions (`calc(...)`, variables, negative origins are all supported). One ViewBox per program; duplicates are a compile error.
- **Render precedence.** Source `define ViewBox` wins over the CLI's `--viewBox`/`--width`/`--height` flags; flags continue to apply for inline `-e` snippets that don't declare one. Default remains `0 0 200 200`.
- **Strict validation.** Zero or negative `width`/`height` rejected at compile time. Negative `originX`/`originY` are allowed (valid SVG, useful for centering around 0,0). Non-numeric arguments produce a clear "must evaluate to a finite number" diagnostic. `define ViewBox` inside a layer apply / path / text block is rejected ("ViewBox must appear at top level").
- **CompileResult carries the resolved viewBox.** `CompileResult.viewBox = { originX, originY, width, height } | undefined`. `compileWithContext` exposes the same field. `--include-metadata` emits it inside the metadata `<script>` block.
- **`docs/viewbox.md`** is the new user-facing page (registered in `scripts/build-docs.ts` `DOC_FILES`). `docs/cli.md`, `docs/layers.md`, and `docs/getting-started.md` cross-link to it; `getting-started.md` now opens its first example with the canonical boilerplate.
- **Completion + hover.** `define V…` completes to `define ViewBox(${1:0}, ${2:0}, ${3:200}, ${4:200});`. Hovering `ViewBox` shows the syntax and precedence rules. The `define` hover documents all three variants (PathLayer / TextLayer / ViewBox).
- **VS Code.** TextMate grammar adds `ViewBox` to the keyword token list. The `viewbox` and `newfile` snippets emit the `define ViewBox(...)` form instead of the old `// viewBox=...` comment header.
- **`scripts/migrate-viewbox.ts`** + `npm run migrate:viewbox:dev` / `migrate:viewbox:prod`. Idempotent migration: iterates every `workspace:*` KV record, parses the code with `parseLezer` to detect any existing `ViewBoxDefinition` (AST-walked, not regex'd, so comment / template-literal mentions don't fool the skip check), and prepends `define ViewBox(0, 0, ${w}, ${h});` using `preferences.width`/`height` (default 200/200) when absent. Sets a `_viewboxMigratedAt` marker. Re-reads before write to skip concurrent autosaves. Supports `--dry-run`; requires `--confirm` for `--env=prod`.

#### Rename workspace from the overflow menu

- **New "Rename workspace" action** in the workspace breadcrumb overflow menu. Owner-only (`currentUser.id === workspaceOwnerId`); appears just under "Format Document". Opens a centered card dialog with Name and Description fields, validation matching the new-workspace form (name required, ≤ 100 chars; description ≤ 500 chars), and inline error display.
- **Save flow** calls `workspaceApi.update(id, { name, description })`, updates the store (`workspaceName`, `workspaceDescription`, `currentFileName`, `workspaceUpdatedAt`), syncs the matching entry in the workspaces list, refreshes the URL slug via `history.replaceState`, and closes. Errors surface inside the modal without dismissing the entered values.
- **Shared `updateWorkspaceSlugUrl(id, slug)`** util extracted from `workspace-view.updateUrlWithSlug` so both the workspace loader and the rename modal use the same path.
- **Storybook entry** for `edit-workspace-metadata-modal` under the Shared category with default, empty, and long-description stories. New `mi-edit` icon added to the material-icons sprite.

### Changed

- **Admin moderation tabs no longer compile every card up front.** The view previously compiled every Pending/Re-review card's source in the browser on load, and re-fetched all seven tabs after every moderation action — a single slow-compiling workspace janked the whole tab and re-janked on each click. Eager compilation is now bounded (at most two concurrent, each raced against a 4s timeout so a slow card falls back to its avatar), and the post-action full refetch is gone (local list mutations keep the active tab correct; other tabs re-fetch on visit, so non-active counts may briefly lag).
- **Workspace canvas size is no longer user-editable in the playground.** The W/H number inputs are gone from the workspace footer (replaced with a read-only viewBox display), the new-workspace dialog (no longer asks for canvas size on create), and the preferences page (`Canvas Size` section removed). `store.preferences` no longer carries `width`/`height`; the new-workspace boilerplate is `define ViewBox(0, 0, 200, 200);` followed by a `define default PathLayer('main-path-layer') ${ ... };` block. The footer's viewBox display updates live from `result.viewBox` after each compile.
- **API stops persisting `preferences.width`/`height`.** POST `/api/workspace`, PUT `/api/workspace/:id`, and PUT `/api/preferences` strip those keys from incoming payloads (via `stripDimensions`). Existing KV records keep their legacy values until the migration script runs; old values are inert because the new client never reads them.
- **Optional trailing `;` on `define <LayerType>(...) ${ ... }`.** Previously a trailing `;` was a parse error; now it's accepted (matching the user-facing boilerplate style and `define ViewBox(...);`'s mandatory `;`). Existing layer definitions without `;` continue to parse unchanged.
- **`scripts/compile-bbwp.ts` + `compile-samples.ts`** prefer the canonical `define ViewBox(...)` statement when auto-detecting dimensions, falling back to the legacy `// viewBox=...` / `// Set viewBox: ...` comment forms for unmigrated source files.

### Breaking

- **`ViewBox` is now a reserved keyword.** Variable or layer names matching `ViewBox` will no longer parse. The keyword is contextual at the AST level (specialized only inside `define ViewBox(...)`) but, like other keywords (`let`, `for`, `define`), it is specialized at tokenization and cannot appear as an identifier. No examples in the codebase used it.

### Migration Path

The migration runs against KV before deploy. Atomic single-PR rollout: migrate prod KV → merge → auto-deploy. Old workers can still serve unmigrated workspaces because `preferences.width`/`height` are retained alongside the new `define ViewBox` statement during the transition window. Storage cleanup (removing the legacy `width`/`height` keys from KV entirely) is a no-op follow-up done at our convenience.

### Tests

- **`tests/viewbox.test.ts`** — 19 tests covering parsing (basic, expression args, negative origin, coexistence with layers, `ViewBox` reservedness, trailing `;` on layer defs), evaluation (validation, duplicates, zero/negative width/height, non-numeric args, no-viewbox case), and render precedence (source wins / CLI fallback / default).
- **`tests/migration-viewbox.test.ts`** — 9 tests pinning the AST-walk skip check used by the migration. Verifies that comment-only and template-literal mentions of `define ViewBox` do NOT suppress the migration, and unparseable code falls through to "prepend" mode.
- **`tests/cli.test.ts`** — 2 new tests verify CLI flag precedence (source-defined ViewBox wins over `--viewBox`, falls back to flag when source has no declaration).
- **`tests/language-services/completion.test.ts`** — 1 new test verifies `ViewBox` appears among keyword completions.
- Full suite passing: **2997 tests** (up from 2966 pre-feature).

#### Blog sample sweep

- **143 `.pathogen` files under `website/blog/samples/post*/`** updated: line 1 `// viewBox="0 0 W H"` comments replaced with `define ViewBox(0, 0, W, H);` canonical form (commit b784152). All 143 now compile successfully via `npm run compile:samples` (commits 7486f5e, ea02745).
- **Inline `svg-path` / `pathogen` code fences** in `website/blog/*.md` (101 fences across 18 posts) intentionally left untouched — they're short illustrative snippets (`arrow.draw()`, `dot.drawTo(...)`), not full programs, and adding `define ViewBox(...)` to each would clutter the teaching context.

#### AST builder postfix folding (commit 7486f5e)

The viewBox sweep surfaced a cluster of AST-builder bugs that were
silently dropping function-call argument lists in five expression
contexts. Five builders iterated CST children with `buildExpression`
(which stops at the primary node) and then fell through to
`buildExpression`'s case `'ArgList'` branch — which returns NullLiteral.
Effect: `calc(foo(5))` parsed as `CalcExpression { expression: NullLiteral }`
and `let x = calc(foo(5))` set `x` to `null` instead of the function's
return value; `text(polarX(...), polarY(...))` parsed as
`text(polarX, polarY)` (just identifiers).

Fixed builders: `buildCalcExpression`, `buildUnaryExpression`,
`buildTernaryExpression`, `buildTextStatement`, `buildTspanStatement`.
All five now use `buildExpressionWithPostfix` which folds ArgList /
MemberExpression / IndexExpression chains at sibling level.

9 new tests in `tests/ast-builder-postfix.test.ts`.

#### Sample-rot fixes (commits 7486f5e, ea02745)

After commit b784152 surfaced 27 pre-existing compile failures:

- **post16/* (7 files)** — missing trailing semicolons in `apply` blocks. Fixed via diagnostic-driven semicolon insertion (the parser's "Missing ';'" diagnostic points at the exact insertion position).
- **post7, post11, post13, post14 (8 files)** — runtime `Cannot use null in arithmetic expression` / `text() x must be a number` errors. All resolved by the AST builder postfix fixes above; no per-file changes needed.
- **post24/* (14 files)** — style values with raw `var()` / `oklch(from var(...) ...)` / `color-mix(in oklch, var(...), ...)` strings, rejected by the security validator. Sweep migrated to Pathogen `Color()` + `CSSVar()` constructors via `scripts/fix-post24.ts`.
- **post16/wedge-diag-{4,16}** — silent timeout in `compile-samples.ts` (these samples do dozens of XOR ops and take ~2:27 each). Timeout raised from 120s to 600s.

`npm run compile:samples` final state: **143 compiled, 0 errors**.

## [Older Unreleased] - 2026-05-13

### Added

#### Publication & Moderation (Phase 4)
- **`ownerHandle` frozen into approvals + public index.** `WorkspaceApproval` and `PublicIndexEntry` carry the workspace owner's handle from approval time, so `/u/<handle>/<slug>` URLs can be built without a per-card D1 lookup and stay stable if the owner later renames themselves.
- **Card links now go to the SSR detail page.**
  - `/explore` cards link to `/u/<ownerHandle>/<slug>` when both fields are present; legacy entries (pre-Phase-4) fall back to the prior `/workspace/<slug--id>` URL.
  - `/featured` rendering pivots from reading `workspace:{id}` to reading `approval:{id}` so each card gets the frozen owner-handle and slug from the moderated snapshot. Stale-index defense still consults the live workspace record (skipping cards that are no longer public or have been flagged).
- **Interactive `<mini-workspace>` embed on the workspace detail page.** The admin's browser captures the rendered SVG at approval time (via `compileWithContext` + the library's `generateSvg`) and POSTs it alongside the decision. The detail page embeds the frozen code + captured SVG into a `<mini-workspace>` so visitors get the same interactive viewer blog posts use today. Legacy approvals without `svg` fall back to the prior code-only render — no flag-day required.
- **Admin moderation card now renders the SVG preview.** Expanding "Review code" lazy-mounts a side-by-side preview (SVG render + source code, side-by-side at ≥700px, stacked below). The render is cached on the view, re-used on Approve so we don't double-compile. Approve without expand triggers an invisible background compile right before sending so capture still happens. Compile errors degrade gracefully to no-SVG.
- **`scripts/backfill-owner-handle.ts`** (`npm run backfill:owner-handle`): idempotent backfill that walks `approval:*` records, looks up each owner in D1, and patches the missing `ownerHandle`. Also rewrites `public:workspaces` to carry the field. Dry-run default; `--apply` to commit; `PRODUCTION_CONFIRM=1 ... --remote --apply` for production.
- **Seed dev queues for moderation UI demo.** `npm run seed:dev` now populates `queue:review` with 3 pending submissions (Alice Draft, Bob Kite, Dan Star) and `queue:rereview` with 2 drifted entries (Alice Circle, Bob Star). Pending entries also get a `pending` state row in D1; re-review entries don't (per Phase 3 design — queue membership alone signals re-review while effective state stays `approved`). Re-running the seed clears and re-populates the queues deterministically.
- **Tests**: 5 new tests in `tests/api/workspace-publication.test.ts` covering `ownerHandle` propagation through `publishApprovalToIndex`, legacy entries deserializing without `ownerHandle`, and `WorkspaceApproval` round-trip with `svg`. Publication tests now total **29**; full suite **2966 passing**.

#### Phase 4 — admin UI overhaul + queue refinements
- **Seed sample code corrected.** The four `.pathogen` snippets in `scripts/seed-dev-users.ts` now use the project's actual syntax (parens around `for (i in 0..N)`, `calc(…)` for math, mandatory trailing semicolons on expression statements, `TAU()` for full-turn). CLI-verified to compile.
- **Admin moderation UI rebuilt** with seven tabs (Pending review / Re-review / Approved / Featured / Rejected / Flagged workspaces / Flagged users). Each card carries a thumbnail (compile-on-demand inline SVG for queue entries; R2 thumbnail or letter-avatar placeholder otherwise), owner handle, and per-tab actions.
- **Review opens a modal with `<mini-workspace>` embed.** The old inline expand-the-card preview is gone. Clicking Review on any card opens a modal with the full mini-workspace component (code panel + rendered SVG, fullscreen-friendly). The cached SVG from compile is reused on Approve so we don't double-compile.
- **Scroll fix.** The admin view's host element now sets `height: 100%; overflow-y: auto` so long queues scroll properly when many cards stack.
- **State transitions exposed in UI.** New tab-aware actions:
  - **Approved / Featured tabs**: Review · Feature/Unfeature · Unpublish · Flag ws · Flag user
  - **Rejected tab**: Flag ws · Flag user (re-approval still happens via owner re-submission through `queue:review`)
  - **Featured tab**: Unfeature without unpublishing
- **New admin endpoints**: `GET /admin/queue/approved` (filtered to currently-public workspaces), `GET /admin/queue/featured`, `GET /admin/queue/rejected`. `POST /admin/unpublish/:id` (admin force-unpublish; appends `unpublished` state row + drops from public + featured indexes; approval record retained). `POST /admin/feature/:id` and `DELETE /admin/feature/:id` (feature/unfeature an approved workspace).
- **Approval records now carry `ownerHandle`** in the seed too, fixing the `@None` rendering when the seed admin viewed featured cards before the next backfill.
- **Approved listing filters to currently-public workspaces** — `isPublic && !flagged` — so admin-unpublished workspaces don't clutter the Approved tab. They remain in KV as approval records (recoverable) but aren't shown.

#### Phase 4 — admin UI bug fixes (round 2)
- **Tab counts now refresh in parallel on view load.** The view fetches every queue concurrently on first mount and after each mutating action, so the count next to every tab label is always accurate — previously the count for a tab stayed at zero until the admin clicked into it. State transitions (approve/reject/unpublish/feature/unfeature/flag) also kick off a background `Promise.all` refresh.
- **Fixed 404 on `/admin/queue/pending`.** The tab id is `pending` but the server endpoint is `/admin/queue/review` (the underlying KV key is `queue:review`). Added a `_queuePath()` translator on the client.
- **Review modal no longer hangs on "Compiling preview…".** The modal now tracks a discrete status (`idle / loading / ready / failed`) and renders three distinct states. On compile failure or missing source, the modal shows an error banner plus the source code so the admin can still review what was submitted and reject it with notes. The old `_modalSvg === null` path stayed perpetually in "Compiling…" — gone.
- **Approved/Featured Review now reads the frozen approval snapshot.** Added `GET /admin/approval/:id` (admin-gated) returning the full approval record (`code`, `svg`, `slug`, `ownerHandle`, …). The modal prefers `approval.svg` when present (instantly interactive), falls back to background compile against `approval.code`, and finally to the source-only/error view if even the code no longer parses. Legacy workspaces with pre-mandatory-semicolons syntax render their source so the admin can decide whether to unpublish or flag.
- **Fixed: every valid workspace previewed as "Compile failed".** The SVG-capture code referenced `window.SvgPathExtended.generateSvg`, but the tsup bundle's `globalName` is `PathogenLang`. `compilerWorker.compileWithContext` succeeded but the subsequent serialize call hit `undefined.generateSvg` and threw, which the catch silently cached as a failure. Switched to `window.PathogenLang.generateSvg` (matching `playground/services/compiler-worker.ts:153`) and added a separate warn when the global isn't present at all — easier to diagnose if a bundle drift recurs.

#### Phase 4 — admin modal rendering (round 3)
- **Fixed: mini-workspace preview collapsed into the upper-left of the modal.** The admin moderation view's modal CSS rule `.modal-body mini-workspace { display: block; }` overrode the component's own `:host { display: flex; flex-direction: column; }`. With block display, `flex: 1` on the internal content-area didn't grow, so the code + preview panels each shrunk to `mini-preview`'s 200px min-height. Removed the override and let mini-workspace use its own 60dvh sizing. After the fix, the diagnostic shows content-area at the full 571px (was 200px).
- **Fixed: empty-code submissions silently rendered as a blank preview.** A stale "Testing something out!" entry from earlier dev testing carried an empty `code` field. Compiling empty source produced a valid SVG with `<path d="" />`, which the modal happily displayed as an empty pane with no error. Now empty `code.trim()` short-circuits to the failed-state modal up-front, and `POST /workspace/:id/submit-for-review` rejects empty code with `400 Workspace has no code to review` so the queue can never accumulate non-renderable entries in the first place.
- **New diagnostic**: `scripts/debug-admin-modal.ts` — Puppeteer script that signs in as the seed admin, opens the moderation page, clicks the first Review button, and dumps the modal + mini-workspace + iframe internals (computed CSS, dimensions, theme-variable cascade). Re-runnable with `npx tsx scripts/debug-admin-modal.ts`; uses a disposable session token. Saved as a reproducer for the modal layout issues so future regressions surface immediately.

#### Phase 4 — simplified card actions + flagged-user badge
- **Tab actions trimmed to the minimum per the spec.** Each moderation card now shows exactly the actions needed to move the workspace between adjacent states — Review is no longer a button; clicking the thumbnail opens the review modal.
  - **Pending review**: Approve · Reject
  - **Re-review**: Approve · Reject
  - **Approved**: Pending review (requeue) · Feature
  - **Featured**: Unfeature
  - **Rejected**: Pending review (requeue) · Flag workspace
  - **Flagged workspaces**: Unflag (→ Rejected) · Flag user
  - **Flagged users**: Unflag user
- **"⚑ Flagged user" badge propagates everywhere.** Every queue listing endpoint now resolves `ownerFlagged` from the user record and surfaces it in the entry payload (Pending / Re-review / Approved / Featured / Rejected / Flagged-workspaces). Card titles render a red `⚑ Flagged user` badge whenever the owner is flagged — visible across every queue the workspace appears in.
- **`POST /admin/requeue/:id`** (new endpoint) — moves an Approved or Rejected workspace back into `queue:review`. Drops the workspace from `public:workspaces` + `featured:workspaces`, sets `isPublic: false`, pushes a fresh review queue entry with the current code as the frozen snapshot, and appends a `pending` state row attributed to the admin (with `internal_notes = "admin requeued for review"`). Rejects empty submissions with 400.
- **Unflag-workspace semantics changed.** Previously, `DELETE /admin/flag-workspace/:id` auto-restored to approved when an approval record existed. Per the simplified flow the action is now strictly "back to Rejected" — the workspace gains a fresh rejection record (internal note "Unflagged from flagged-workspaces queue."), an appended `rejected` state row, and stays off the public + featured indexes. Admin has to send it through Pending review to publish again.
- **Approved tab excludes Featured.** Cleaner disjoint sets — featured workspaces appear only in the Featured tab and admin doesn't see the same card in two places with different action buttons.
- **Rejected tab filters out currently-flagged workspaces.** Flagging a workspace from Rejected used to leave it on both lists; the listing now skips entries whose workspace record has `flagged: true` so the Flagged Workspaces tab is the only home for them while flagged.
- **`scripts/debug-admin-tabs.ts`** (new diagnostic) — Puppeteer walker that visits every moderation tab, captures the per-card action labels, and screenshots each into `/tmp/admin-tab-<id>.png`. Lets future spec changes be verified against expected action sets in one run.

#### Local dev — shared wrangler state
- **Fixed: `/explore` and `/featured` didn't reflect admin moderation actions in local dev.** Each `wrangler dev` process maintains its own miniflare KV/D1 store under its working dir's `.wrangler/state`. The two `dev:stack` workers (Pages on :3000, API on :8787) were running from different dirs, so admin writes on the API side never reached the Pages SSR reads. Production is unaffected — both projects bind to the same Cloudflare KV namespace by id.
- **Both `wrangler dev` calls now use `--persist-to=<repo>/.wrangler/state`.** Pages dev runs from the repo root and writes/reads there directly; API dev runs from `api/` and points at `../.wrangler/state`. The seed and backfill scripts now also pass `--persist-to=../.wrangler/state` on every `wrangler kv key` / `wrangler d1 execute` invocation so the CLI surface and the runtime share the same sqlite mirror.
- **`POST /admin/reconcile-indexes`** (new admin endpoint) — rebuilds `public:workspaces` + `featured:workspaces` from the canonical `approval:*` records. Useful when index drift accumulates from a long sequence of flag/unflag/unpublish/requeue operations. Idempotent.
- **`scripts/merge-wrangler-state.ts`** (`npm run merge:wrangler-state`) — one-shot tool that lifts `api/.wrangler/state` into the new shared `.wrangler/state` so existing dev data survives the path move. Dry-run by default; `--apply` to copy. After running this once + restarting `dev:stack`, both workers see the same state.
- **Thumbnail origin is now env-configured.** SSR pages (`/explore`, `/featured`, `/u/:handle`, `/u/:handle/:slug`) previously hardcoded `https://api.pathogen.studio/thumbnail/...` for every `<img src>`. In local dev that returned 404 because the workers run on `localhost:8787`. Added `env.API_BASE` to the Pages worker config (`[vars] API_BASE = "https://api.pathogen.studio"` in `wrangler.toml`, overridden to `http://localhost:8787` in `.dev.vars`). New `thumbnailUrl(env, id, size)` helper in `website/_worker.ts` reads the env var; the four hardcoded URLs in the SSR renderers now route through it. Admin moderation view's thumbnail rendering already uses the playground's `__PATHOGEN_API_BASE__` define; tightened the URL construction to handle trailing slashes cleanly.

#### Publishing UX polish
- **Removed the Visibility section from the New Workspace form.** Workspaces always start private; publishing happens later via the overflow menu on the Workspaces card or in the workspace breadcrumb. Cleaner create dialog, and the publish decision now happens on a workspace that already has code.
- **Unified labels to "Make public" / "Make private".** The workspace-breadcrumb overflow menu used to read "Submit for review" / "Unpublish workspace"; the landing-view card menu already used the cleaner phrasing. Both surfaces now match. The disabled "Pending review" / "Pending re-review" states stay where they were.
- **Toast on successful publish**: `Thank you for sharing your workspace.` (with the existing "We review public workspaces before they appear on Explore." follow-up as the body). Make-private also gets a brief confirmation toast.
- **Publishing now requires the workspace to compile.** New `playground/services/publish-precheck.ts` runs the workspace's code through `compilerWorker.compileWithContext` before issuing the `PUT /workspace/:id {isPublic:true}`. If the parser throws, or the compile produces no path data (empty SVG), the publish is blocked and the user sees a red toast explaining why ("Can't publish — workspace has compile errors"). Both the workspace breadcrumb and the landing-view card menu run the precheck. The API Worker can't enforce the same gate (the compiler bundle is ~9 MB, beyond the Workers size limit), so the client is the authority; the empty-code rejection in `submitWorkspaceForReview` stays as belt-and-suspenders for scripted/cURL bypasses.
- **Landing-view publish menu is feature-gated.** "Make Public" is hidden for users without `UserFeature.Publishing` (matches the breadcrumb). "Make Private" stays available unconditionally — opting out is always allowed.

#### Workspace detail page — always mini-workspace
- **`/u/:handle/:slug` now always renders the workspace as a `<mini-workspace>` embed.** Previously the page only used mini-workspace when the approval record had a pre-rendered `svg` field — legacy approvals (pre-Phase-4) fell back to a thumbnail-plus-source split view. The conditional is gone: the detail page always emits `<mini-workspace>` with the frozen `<code>` child plus the inline `<svg>` (when present) so visitors get the same interactive embed used in blog posts. mini-workspace.js is loaded unconditionally.
- **New `PUT /admin/approval/:id/svg`** (admin-only, 1 MB cap) — backfills `approval.svg` on an existing approval record.
- **Modal silently backfills `approval.svg`** for legacy approvals. When an admin opens the review modal on an Approved/Featured card and the approval lacks a pre-rendered SVG, the admin's browser compiles `approval.code`, renders the SVG, and POSTs it to `/admin/approval/:id/svg` while showing the modal. The next visit to `/u/<handle>/<slug>` for that workspace ships the live preview. Best-effort: PUT failures don't block the modal — just no backfill that round. Legacy approvals whose code no longer parses (e.g. pre-mandatory-semicolons syntax) stay code-only on the detail page until an owner updates the source.

#### Publication & Moderation (Phase 3)
- **Re-review on code drift**: `PUT /workspace/:id` on an approved workspace whose new code hash differs from `approval.codeHash` pushes a `queue:rereview` entry (idempotent on workspaceId — re-edits during re-review refresh the queue entry). No new state row is appended — the effective state stays `approved`, matching what visitors see on /explore. Workspace responses carry a separate `rereviewPending: boolean` flag (true when in the re-review queue) so the playground can render "Pending re-review" without lying about visibility state. `<app-breadcrumb>` reads `workspaceRereviewPending` and disables Unpublish during re-review.
- **Flagging endpoints**:
  - `POST /admin/flag-workspace/:id` — flips `workspace.flagged`, pushes to `queue:flagged-workspaces`, drops from public + featured, appends a `flagged` state row with internal notes. Approval record retained for restoration.
  - `DELETE /admin/flag-workspace/:id` — clears the flag and re-publishes from the approval record (restoring featured if `featuredAt` was set).
  - `POST /admin/flag-user/:id` — sets `users.flagged = 1` in D1, cascades through every approval the user owns to drop them from public + featured. Optional `internalNotes` body is stored in `users.flag_notes`.
  - `DELETE /admin/flag-user/:id` — clears the flag and restores every approval to public (and featured for `featuredAt` records), unless the workspace itself is independently flagged.
- **Listing endpoints**: `GET /admin/queue/rereview`, `GET /admin/queue/flagged-workspaces`, `GET /admin/queue/flagged-users`. All require `isAdminUser` (session) or the `?token=` fallback.
- **Admin UI**: `<admin-moderation-view>` extended with four tabs (Pending review / Re-review / Flagged workspaces / Flagged users), per-tab lazy-load on first visit, refresh button. Flagged tabs render with a single Unflag action. Approve handler now clears both the review queue and the re-review queue.
- **Workspace detail page**: SSR'd at `/u/:handle/:slug` in `website/_worker.ts`. Resolves the user by handle, scans approval records for `(userId, slug)`, then renders the frozen `approval.code` snapshot plus breadcrumb (`Explore › @handle › name`), description, thumbnail (with OG meta), and "Open in playground" link. Falls back to 404 when the approval is missing or the underlying workspace has been unpublished/flagged. Profile page (`/u/:handle`) cards now link to `/u/:handle/:slug` when a slug exists.
- **Workspace lifecycle cascades**: re-review queue is also cleared on workspace delete (alongside the Phase 2 review queue, approval, rejection, public-index and featured-list cleanup).
- **Tests**: 9 new tests in `tests/api/workspace-publication.test.ts` covering re-review queue idempotency, flag-queue helpers, `listApprovalsForUser`, the full flag-user cascade (drop + restore with featured preservation), and `findApprovalForUserAndSlug` per-user scoping. Total 24 publication tests; `MemoryD1` extended for the `users.flagged` UPDATE used by flag/unflag.
- **Profile-page defense**: `/u/:handle` stale-index check now also drops cards where `workspace.flagged === true`, even if the public-index entry somehow wasn't removed. Belt-and-suspenders against future cascade gaps.
- **Docs**: `docs/publishing.md` extended with the re-review behavior (auto-queue on edit, "Pending re-review" label, prior snapshot stays public) and the workspace detail page URL structure.

#### Publication & Moderation (Phase 2)
- Append-only state machine: `appendState` / `getEffectiveState` / `getStateHistory` over the `workspace_publication_states` D1 table (states: `unpublished`/`pending`/`approved`/`rejected`/`flagged`). The latest row for a workspace is the effective state.
- Frozen-snapshot review queue: `pushReviewQueue` / `getReviewQueueEntry` / `listReviewQueue` / `removeFromReviewQueue` in `website/api/moderation.ts`. Queue entries carry the code + hash + slug at submission time so admins approve exactly what was submitted, even if the live workspace is edited in the interim.
- Approval and rejection KV records (`approval:{id}` / `rejection:{id}`) with full audit metadata (`approvedByUserId`, `approvedAt`, `featuredAt`, `internalNotes`). Rejection notes are internal-only and never surfaced to the owner.
- Slug uniqueness per user: `pickUniqueSlugForUser` scans existing approvals and appends an `-id-prefix` suffix on collision so `/u/<handle>/<slug>` URLs always disambiguate.
- Public index: 100-entry cap, `approvedAt`-descending ordering, populated only by approvals via `publishApprovalToIndex` (legacy `addToPublicIndex` removed; `removeFromPublicIndex` kept for delete cascade).
- New API endpoints:
  - `POST /workspace/:id/submit-for-review` — owner-only, Publishing-gated; freezes a queue snapshot and appends a `pending` state row.
  - `GET /admin/queue/review` — admin-only (session or `?token=` fallback); returns frozen queue entries with owner handles resolved.
  - `POST /admin/review/:id` — admin-only; `decision: 'approve' | 'reject'`, optional `feature: bool`, optional `internalNotes`. Approve writes the snapshot to `approval:{id}`, appends `approved`, flips the workspace's `isPublic`, adds to the public index, and optionally features. Reject writes `rejection:{id}` with internal notes and appends `rejected`.
- `PUT /workspace/:id` now routes `isPublic` transitions through the moderation flow: true→false on an approved workspace appends `unpublished` and removes from the index; false→true triggers submission (queue + pending state) without flipping the workspace's public flag until approval.
- Workspace responses now include `publicationState` (derived from the latest state row). Listing, get, create, update, and submit all return it.
- `<admin-moderation-view>` SPA route at `/admin/moderation` gated by `UserFeature.AdminModeration`. Pending tab renders frozen-code cards with Approve / Reject (with internal-notes textarea) / Feature toggle. Re-review and Flagged tabs are placeholders for Phase 3.
- `docs/publishing.md` — user-facing reference covering submission, the review timeline, the 100-workspace cap, edits-after-approval behavior, and how the `/u/<handle>/<slug>` URL is constructed. Registered in `scripts/build-docs.ts` `DOC_FILES`.
- `scripts/backfill-publication-state.ts` (`npm run backfill:publication-state`): idempotent backfill that synthesizes approval records + `approved` state rows for pre-Phase-2 `isPublic:true` workspaces and rebuilds the public index. Dry-run by default; `--apply` to commit, `--remote` (with `PRODUCTION_CONFIRM=1`) to target production.
- 15 new unit tests in `tests/api/workspace-publication.test.ts` covering the state machine (append-only, latest wins, rejected→resubmitted), frozen-snapshot rule, slug uniqueness, public index cap + ordering, and approval/rejection round-trips. `MemoryD1` and `MemoryKV` helpers extended with `workspace_publication_states` and `.list()` support.

#### Phase 2 — state-aware UI + cleanup
- `workspacePublicationState` added to playground store; populated from `/workspace/:id` responses and threaded into `<app-breadcrumb>`. The Publish action now renders state-aware labels: "Submit for review" (unpublished/rejected), "Pending review" (disabled, pending), "Unpublish workspace" (approved). Owners see the same label after the API silently rejects them — preserves the silent-rejection contract.
- `seed:dev` now writes `approval:{id}` records and `approved` state rows for every seeded `isPublic:true` workspace, so a fresh dev DB is consistent with the Phase 2 flow without requiring a follow-up backfill.
- `backfill-publication-state.ts` enforces per-user slug uniqueness — pre-existing approval slugs are loaded once, in-progress writes also disambiguate against each other, and colliding entries get an `-id-prefix` suffix at synthesis time.
- `DELETE /workspace/:id` now cascades to moderation state: drops `approval:{id}` / `rejection:{id}`, removes from `queue:review`, `public:workspaces`, and `featured:workspaces`. State-history rows in D1 are retained (audit trail).

#### Publication & Moderation (Phase 1)
- New `0002_moderation.sql` D1 migration adds `users.flagged` + `users.flag_notes` columns and an append-only `workspace_publication_states` audit table (state ∈ `unpublished`/`pending`/`approved`/`rejected`/`flagged`). The state table is the source of truth for upcoming moderation workflows; Phase 1 lays the schema without writing to it yet.
- `UserFeature` enum (`Publishing`, `AdminModeration`) and server-side `computeUserFeatures` helper in `website/auth/features.ts`. `/me` and SSR (`window.__SSR_CURRENT_USER`) now carry a `features: UserFeature[]` array; clients gate UI on `hasFeature(user, UserFeature.Publishing)` instead of raw `verifiedAt` / `flagged` checks. The deny-list reason never reaches the client.
- `POST /workspace` and `PUT /workspace/:id` now reject `isPublic: true` transitions unless the caller has `UserFeature.Publishing` (verified email + not flagged + authenticated session, never an anonymous header).
- Playground gates: the "Make this workspace public" checkbox in `new-workspace-view` and the Publish menu item in `app-breadcrumb` are hidden unless the current user has the Publishing feature. Owners of an already-public workspace retain the Unpublish action regardless.
- `ADMIN_EMAILS` env-var-gated admin identity (`isAdminUser`). Admin membership is evaluated fresh from env on every request — no `is_admin` column, no DB-mediated privilege escalation vector.
- New `scripts/seed-dev-users.ts` (`npm run seed:dev`) seeds 10 mock users (admin, verified, unverified, flagged) with sample workspaces into the local dev D1 + KV. Idempotent (deletes seed-prefixed rows first), refuses to run with `PRODUCTION=1`.
- Backstop tests: `tests/auth/features.test.ts` pins the Publishing/AdminModeration deny-list rules across 11 cases (case-insensitive admin matching, multi-entry lists, pre-migration row tolerance).

## [Unreleased pre-moderation] - 2026-05-11

Post-0.7.0 polish. Custom filter pipeline added with six constructors (Noise, Glow, Emboss, ElevationShadow, InnerShadow, Pixelate). Inspector population is now correct on every blog post; sitewide typography refresh; homepage and docs responsive cleanup.

### Added

#### Filters
- **`NoiseFilter()`** — five-preset (`Grain` / `Paper` / `Speckle` / `Static` / `Gradient`) custom filter with trailing-block configuration, per-property finite-number guards, deterministic seed derivation, and read-side property access for `id` / `style` / `scale` / `octaves` / `amount` / `monochrome` / `seed` / `blend` / `contrast` / `stitch`.
- **`GlowFilter()`** — outer halo or inner edge light selected via the `GlowMode` enum (`Outer` | `Inner`). Knobs: `color`, `radius`, `spread`, `opacity`.
- **`EmbossFilter()`** — `feSpecularLighting`-based bevel with named light parameters: `angle`, `elevation`, `depth`, `strength`, `shininess`, `lightColor`, `smooth`.
- **`ElevationShadowFilter()`** — Material-style three-layer depth shadow tuned by a single `elevation` knob (0–24); `color`, `direction`, `tightness` for fine control.
- **`InnerShadowFilter()`** — inset shadow (the capability native CSS `drop-shadow()` cannot express); `offsetX`, `offsetY`, `blur`, `color`, `opacity`.
- **`PixelateFilter(width, height, radius)`** — mosaic via `feFlood` + `feTile` + `feMorphology`. Positional canonical form; trailing-block form also supported.
- `BlendMode` enum — CSS blend-mode keywords as enum members (`Multiply`, `Screen`, `Overlay`, `ColorBurn`, `ColorDodge`, `HardLight`, `SoftLight`, `Darken`, `Lighten`, `Difference`, `Exclusion`, `Normal`).
- `GlowMode` enum — `Outer` and `Inner` selectors for `GlowFilter`.
- `NoiseFilterScale` enum — `Fine` / `Medium` / `Coarse` packaged as discoverable members (each evaluates to the same string value the scale write handler accepts, so the enum form and the bare-string form are equivalent).
- Filter values auto-wrap to `url(#id)` when assigned to the `filter` style property in a style block; reused via `let` binding (one `<filter>` def, many references); composable across layers via `GroupLayer` stacking.

#### Documentation
- New `docs/filters.md` reference page covering all six custom filters, the `BlendMode` and `GlowMode` enums, the per-filter primitive chains, and the auto-wrapping `filter:` style property.
- New blog series: ["Custom Filters in Pathogen: First-Class Visual Effects"](website/blog/custom-filters-pipeline.md) (Part 1) and ["The Full Filter Family: Glow, Emboss, Shadows, Pixelate"](website/blog/custom-filters-family.md) (Part 2), with 23 side-by-side parameter-sweep samples between them.

#### Compiler / CLI
- `data-layer-name="<layer>"` attribute on every layer-rendered element (path, group, **and every text sibling of a multi-text TextLayer**) in CLI mode — not just playground. Enables the blog mini-workspace inspector to toggle every element of a multi-text layer in one query (`[data-layer-name="X"]`). CLI also keeps `id` on the first sibling for backward compat with consumers that resolve cross-references by id-fragment.
- BBWP server (`src/cli.ts`) gained directory-aware import resolution (extensionless paths, 308 redirects to `<path>/` for index files, `.ts → .js` on-the-fly transpilation) so the GPU render pipeline can resolve relative imports without bundling. Closes a latent regression that broke `--render-gpu` for any sample using mesh / freeform / conic / topo gradients.
- `src/render/build-tree.ts` now forwards `useImageGradients` and `gpuGradientUrls` through to `buildDefs`. Previously dropped silently, so GPU-rendered BBWPs were emitting CLI-fallback flat-color rects for non-linear gradients.
- `scripts/compile-bbwp.ts` mw.html template now references `public/components/...` (the actual layout) instead of the broken `public/pathogen/components/...` path. Every previously generated BBWP mw.html had 404'd script tags; new BBWPs load mini-workspace + theme-toggle correctly.

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
