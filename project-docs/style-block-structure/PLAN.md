# Style Blocks: drop-shadow diagnosis, structured syntax tree, and editor intelligence

## Context

Ryan hit two symptoms in the playground with a style block containing `filter: drop-shadow(4px, 4px, 4px, shadowColor)`:

1. **The drop-shadow never renders** — in playground preview and CLI alike.
2. **No color chip** appears for a color literal inside `drop-shadow(...)`, while `fill: #eaaa;` gets one.

While investigating, a third gap surfaced: **no autocomplete for `filter:` values** — neither CSS filter functions (`blur`, `drop-shadow`, …) nor Pathogen's seven custom filter constructors, even though `filter` is the 6th most-used style property in the project's own sample corpus.

Root causes (all confirmed by code trace + live repro):

### 1. drop-shadow: commas emit invalid CSS, silently
- `drop-shadow()` in CSS takes **space-separated** arguments. Pathogen passes the comma form through nearly verbatim: `tryResolveCSSFunctionArgs` (`src/evaluator/index.ts:1410-1442`) splits args on whitespace (`splitTopLevel`, `src/css-value-utils.ts:13`), resolves `shadowColor` → `#ff0000`, and rejoins — emitting `filter="drop-shadow(4px, 4px, 4px, #ff0000)"`. The browser drops the invalid declaration entirely.
- It passes compile-time validation because `isAllowedToken`'s comma branch (`src/evaluator/sanitize.ts:367-370`, built for `font-family` fallbacks) incidentally accepts `4px,`.
- Not a sanitizer or render-path issue; CLI and playground share the same builders (`src/render/build-layers.ts`). Space-separated form works today, including variable color resolution.
- **User decision: comma form becomes a positioned compile-time error** (keep style values CSS-native), e.g. `drop-shadow() uses space-separated CSS syntax: drop-shadow(4px 4px 4px color)`.
- Related drift found: the annotated evaluator (`src/evaluator/annotated.ts:1129`) never calls `tryResolveCSSFunctionArgs`, so colors in CSS function args aren't resolved in the Annotated pane.

### 2. Color chips: style-block interior is an opaque token
- `StyleContent` is a single opaque token in the Lezer grammar (`src/parser/pathogen.grammar:309-311, :442-444`), so the editor tree has zero structure inside `${ ... }`.
- Chips there rely on a regex fallback (`playground/utils/cm-color-picker.ts:331-345`) that fires only when the **entire** value of one of six hardcoded properties (`fill`, `stroke`, `color`, `stop-color`, `flood-color`, `lighting-color`) is a color. `filter` isn't in the set, and a color nested inside any function is invisible for every property.

### 3. Completions: string scanning + missing data
- Style-block completion context detection is backward string scanning (`src/language-services/completion.ts:260-291`) — no tree.
- `filter` (plus `mask`, `clip-path`, `stroke-dashoffset`, `color`, `mix-blend-mode`, `paint-order`) is missing from `STYLE_PROPERTY_ENTRIES` (`completion-data-static.ts:42-71`).
- Value position after `filter:` offers stdlib constructors as **binding-block snippets** (invalid in value position) and no CSS filter functions at all.

### Direction (per Ryan)
Move the style-block interior from one opaque token to a **real structured syntax tree**, and build chips + completions on top of it. The known grammar trap (structuring `StyleContent` in the LALR grammar breaks all `${}` template interpolation — verified dead end) does **not** apply to Lezer's `parseMixed`, which mounts an inner parser over the token's content without touching the outer grammar. `@lezer/common` (which provides `parseMixed`) is already a dependency; `@lezer/css` is not wanted (style values contain Pathogen identifiers like `filter: card;` and backtick templates), so a small dedicated inner grammar goes through the existing lezer-generator pipeline.

## Key constraints (from prior verified work — do not violate)
- `StyleContent` stays an opaque `@tokens` token in the outer grammar. No externalization, no LALR structuring.
- Inner grammar must reproduce `parseStyleDeclarations` boundary rules exactly (`src/parser/ast-builder.ts:1922-2051`): declarations end at top-level `;`, bare newline, or `//`; quote/paren/backtick/interpolation-aware; lenient on incomplete blocks (language-service resilience).
- One parser feeds compiler + CodeMirror + LSP (`src/parser/index.ts`), so the `parseMixed` wrap lives in `src/`, not playground code.
- Docs first; three-surface parity; derive completion data from its source rather than hand-maintaining parallel lists.

## Design decisions

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| 1 | Parser wrap | Export a second pre-wrapped `editorParser = lezerParser.configure({ wrap: parseMixed(...) })`; compiler keeps unwrapped `lezerParser` | Zero compile-path risk; `buildStyleBlockLiteral`'s cursor walk never sees mounts; `.configure()` shares LR tables |
| 2 | Comma policy | Top-level commas are an error only for the 10 CSS filter functions + the `filter` property value as a whole (`blur(2px), brightness(1)` is also invalid CSS) | Filter functions are the only allow-listed functions whose CSS grammar is comma-free; `rgba`/`color-mix`/`cubic-bezier`/`polygon`/`translate`/font-family lists keep commas |
| 3 | Completion data derivation | Restructure `ALLOWED_FUNCTION_NAMES` in sanitize.ts into exported grouped consts (`CSS_FILTER_FUNCTION_NAMES`, …); completion data imports directly | Least machinery, cannot drift; bidirectional unit test guards snippet coverage |
| 4 | Completion context detection | Keep the tested string scans in `completion.ts`; only add data + value-position logic | Shared verbatim by the LSP, which has no CodeMirror tree; migration adds risk with no user-visible gain |
| 5 | `cm-textlayer-editor` | Defer — it slices the outer `StyleBlockLiteral` node and never descends into `StyleContent`, so mounts can't break it | Note as follow-up |
| 6 | Annotated-evaluator drift | Fix now: extract `tryResolveCSSFunctionArgs` into `src/evaluator/css-function-resolve.ts` parameterized by an eval callback; both evaluators call it | Comma error must fire identically in both; annotated pane gains correct color resolution |
| 7 | Compiler AST (D3) | Add optional `nameEnd` / `valueLoc` / `valueEnd` to `StyleProperty`; keep `value` a raw string | Editor tree is the structured view; optional fields keep all existing constructors/tests valid |
| 8 | Static site highlighter (`src/highlight.ts`) | Keep `StyleContent: 'str'` flat; re-export `editorParser` from that entry so the read-only CodeMirror mount gets structured highlighting | CM mounts are where users read source |

## Implementation plan (phased)

### Phase 0 — Artifact trail
Create `project-docs/style-block-structure/PLAN.md` + `primer.md` (inner-grammar boundary rules, comma policy table, parser-identity diagram) + a demo `.pathogen` exercising filter values, templates, interpolation.

### Phase 1 — Docs FIRST
- `docs/syntax.md` (style-block section ~:219): "Declarations" subsection (termination rules) + "CSS function values" subsection — filter functions are **space-separated**, with the comma before/after example and exact error text.
- `docs/filters.md` (~:596 "Layering with Native CSS Filters"): callout — commas in `drop-shadow()` are a compile error; mention value completions.
- No new doc file → no `DOC_FILES` change. Verify `npm run build:docs`.

### Phase 2 — Richer `StyleProperty` (unblocks value-positioned errors)
- `src/parser/ast.ts:375-380`: add optional `nameEnd`, `valueLoc`, `valueEnd`.
- `src/parser/ast-builder.ts:2045` push site: it already has `nameStart`/`valueStart`/`rawValue`; emit trimmed value extents via `lineColLoc(source, baseOffset + trimmedStart)`.
- Tests: ast-builder offset tests (single/multi declarations, function values, later-line values).

### Phase 3 — Comma form → positioned compile error
- `src/evaluator/sanitize.ts`:
  - Restructure :165-183 into exported grouped consts; rebuild `ALLOWED_FUNCTION_NAMES` byte-identical.
  - `COMMA_FORBIDDEN_FUNCTIONS = new Set(CSS_FILTER_FUNCTION_NAMES)`.
  - Detection A — `isAllowedToken` functional-notation branch (:343-360): depth-0 comma in a comma-forbidden function → **throw** specific message: `drop-shadow() uses space-separated CSS syntax: drop-shadow(4px 4px 4px color) — remove the commas` (generic variant for other filter fns). Verified: throws propagate uncaught out of `validateCSSValue`'s token loop.
  - Detection B — `validateCSSValue`: `filter` property with depth-0 top-level comma → `filter chains are space-separated: blur(2px) brightness(1.2)`.
- `src/evaluator/index.ts:1366-1373`: existing catch wraps with `prop.loc`; prefer `prop.valueLoc` when present.
- Annotated drift fix per decision #6: new `src/evaluator/css-function-resolve.ts`; `annotated.ts:1130` calls it before validation and wraps errors with `prop.loc`.
- Tests: `tests/layers.test.ts` (~:1420) comma-form errors with line/col; **negative controls**: `rgba(0,0,0,.5)`, `color-mix(in oklch, a, b)`, `translate(10px, 20px)`, `cubic-bezier`, `polygon(0 0, 100% 0, 50% 100%)`, `font-family: "Inter", serif`. `tests/annotated.test.ts` parity; CLI surfaces positioned message.

### Phase 4 — Completion data + value logic (independent of inner grammar)
- `completion-data-static.ts`:
  - `STYLE_PROPERTY_ENTRIES` (:42-71): add `filter`, `mask`, `clip-path`, `stroke-dashoffset`, `color`, `mix-blend-mode`, `paint-order`.
  - `STYLE_PROPERTY_VALUES` (:89-147): `filter` entry built programmatically from imported `CSS_FILTER_FUNCTION_NAMES` + snippet table (`drop-shadow(${1:dx} ${2:dy} ${3:blur} ${4:color})` — space-separated, teaching correct syntax); `url(#${1:id})` for `filter`/`mask`/`clip-path`; enumerations for `mix-blend-mode`, `paint-order`.
- `completion.ts` value branch (:192-210): suppress binding-block constructor snippets in value position; after `filter:`, surface in-scope variables inferred as one of the 7 filter constructor types (via `type-inference-ast.ts` + `FILTER_CONSTRUCTORS` from `constructor-registry.ts:32`), detail `Filter — renders as url(#id)`.
- Tests: **coverage-matrix test** (property × value-kind, per generalize-reported-gaps feedback); preserve behavioral contracts at completion.test.ts :540-576, :877-892, :907-913, :1113-1192.

### Phase 5 — Inner grammar + `editorParser`
- New `src/parser/style.grammar`: `StyleSheet`, `StyleDeclaration { PropertyName ":" value* declEnd }`; value nodes `NumberUnit`, `ColorLiteral`, `Identifier`, `StringLiteral`, `CallExpression { FunctionName ArgList }`, `Template`/`Interpolation`, `LineComment`. Boundary parity with `parseStyleDeclarations`: `@skip` space/tab only; newline is an explicit declaration terminator (ignored inside `ArgList`/`Template`); single-quoted strings don't cross `}`/newline. Fallback if LALR newline handling is awkward: small external tokenizer for the value region — parity test is the gate either way.
- Generate via `npx @lezer/generator src/parser/style.grammar --typeScript -o src/parser/style.generated.ts`; add npm script `generate:style-parser`. **No pathogen.grammar change** → no regen/hand-patch of the main parser.
- New `src/parser/style-language.ts` (styleTags mapping to standard tags so stock themes pick them up) and `src/parser/editor-parser.ts` (`parseMixed` mounting `styleParser` over `StyleContent`). Export from `src/index.ts` (→ `window.PathogenLang.editorParser`) and `src/highlight.ts` (watch `dist/highlight.global.js` size).
- Consumers: `playground/utils/pathogen-language.ts:26-45`, `playground/utils/detail-source-mount.ts:57-79` → `editorParser ?? lezerParser`.
- Tests: **parity corpus test** (well-formed, mid-typing incomplete, missing `;`, templates, interpolation, quoted `}`/`;`, `//` comments — inner declaration ranges vs `parseStyleDeclarations` output using Phase 2 offsets); **outer-tree invariance test** (editorParser outer structure ≡ lezerParser, including template-interpolation cases).

### Phase 6 — Color chips via the inner tree
- `cm-color-picker.ts`: `findColorRanges` (:255-285) descends into mounts automatically. New rules: inner `ColorLiteral` + color-function `CallExpression`s get chips **anywhere in any value** (including inside `drop-shadow(...)`, any property); bare named-color `Identifier`s only as the whole value of a `COLOR_PROPERTIES` declaration (never rewrite a variable named `tomato`). Keep `addStyleBlockColors` regex as fallback when `StyleContent` has no mount. onChange guard (:404) already slices the exact sub-range; add tests for sub-value ranges and length-changing replacements. Round-trip format behavior unchanged.
- Deferred (flagged, not done): `color(...)` in the outer `CSSColorLiteral` token (would trigger the pathogen.grammar regen/hand-patch cycle); `cm-textlayer-editor` migration; TextMate style-block scopes.
- Tests: `tests/cm-color-picker.test.ts` — chip inside drop-shadow, chip on `filter` property, named-color whole-value rule, no chip on variable references, fallback path.

### Phase 7 — Build + cross-surface verification + review
Order: docs → src → `npm run build` → playground → packages.
- **CLI**: comma-form → positioned error; space form compiles; `--annotated` resolves drop-shadow colors and shows the same error.
- **Playground** (`npm run dev:website`): structured highlighting inside `${}` in both themes; chips inside `drop-shadow`; filter completions (function snippets, typed filter variables, `url(#`); no binding-block snippets in value position; `` font-family: `${family}`; `` still highlights and compiles; detail-page read-only mount renders.
- **VS Code/LSP**: LSP typechecks against fresh `dist/index.d.ts`; completions flow through shared `getCompletions` (no server change expected); TextMate grammar explicitly deferred (regex scopes adequate; comma rule is a compiler error, not highlighting).
- `npm run test:run`, `npm run check:completions`, code-reviewer agent before commit.

## Risks & mitigations
- **Inner-grammar boundary parity** (newline-terminated declarations in LALR) — highest risk. Gate: parity corpus test; fallback: external tokenizer for the value region.
- **Template-interpolation regressions** — zero outer-grammar changes by design; outer-tree invariance test.
- **Compiler perf** — compiler parser identity untouched; only editors pay inner-parse cost (incrementally cached by parseMixed).
- **Comma-rule false positives** — closed set; explicit negative-control tests for every comma-taking function family.
- **sanitize.ts restructuring** (security-sensitive) — sets rebuilt from identical literals; full suite + security tests; reviewer focus area.

## Verification summary
Same program through all three surfaces: comma form errors identically everywhere; space form renders the shadow in CLI SVG output, playground preview, and VS Code preview; chips and completions verified interactively in the playground; full Vitest suite green.
