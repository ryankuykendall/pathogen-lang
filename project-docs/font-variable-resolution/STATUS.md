# Font Variable Resolution — STATUS

**Date:** 2026-07-20
**Plan:** `~/.claude/plans/i-am-noticing-a-piped-river.md`

## User report (2026-07-19)

With `let fontFamily = "Noto Sans";`:
- `font-family: fontFamily;` rendered the wrong font **and weight** in the playground
- `@font fontFamily;` → "variable name is not allowed here"
- `` font-family: `${fontFamily}`; `` and `"${fontFamily}"` → "Missing ';'" parse errors
- Mystery: `font-family: "fontFamily";` (a literal!) reportedly rendered actual Noto Sans

## Root causes

1. **Playground font fetch was regex-over-source.** The compiler resolved
   `font-family: fontFamily;` correctly (style values are try-evaluated as
   expressions), but `extractFontReferences` in
   `playground/services/font-loader.ts` only matched *quoted literal* family
   names, so the Noto Sans binary was never fetched or injected into the
   preview iframe → browser fallback font (and no 900 weight face).
2. **`@font` grammar accepted only a String token** (`pathogen.grammar`
   `FontDirective`), and font loading is a pre-compile host step with no
   runtime scope.
3. **Style blocks could not contain `${…}`** — the `StyleContent` token was
   `![}]+`, so the `}` of an interpolation terminated the block.

## What shipped

- **Grammar** (`src/parser/pathogen.grammar`):
  - `FontDirective` accepts `(String | Identifier)`.
  - `StyleContent` re-defined as a quote/comment/template-aware token
    (`styleContentString/Comment/Template/Interp` helper tokens). One brace
    level inside `${...}` interpolations (regular-language constraint; the
    first attempt — an external tokenizer — collapsed Lezer's contextual
    token groups and broke template literals everywhere, so it was reverted
    in favor of the token redefinition).
  - Regenerated with `npx lezer-generator` + re-applied the `keyof` hand
    patch (commit `3fea81b` convention).
- **AST/builder**: `FontDirective.sourceKind?: 'literal' | 'identifier'`;
  adjacency guard so `@fontFamily` errors instead of parsing as `@font Family`
  (`@font` is a single token, so maximal munch does NOT protect here);
  `parseStyleDeclarations` value scanner now tracks backtick templates and
  `${}` interpolations (with "Unterminated template literal in style value").
- **Shared resolver**: `src/parser/font-directives.ts`
  `resolveFontDirectives(program)` — const-folds top-level
  `let x = "literal";` bindings; exported from `src/index.ts`.
- **CLI**: `loadFontsFromDirectives` uses the resolver; unresolved identifier
  is a hard positioned error.
- **Formatter**: `@font identifier` formats unquoted.
- **Playground** (`font-loader.ts` + `compiler-worker.ts`):
  - Tier 1 (pre-compile): `extractTopLevelStringLets` + identifier-directive
    regex + style-block variable substitution, feeding the existing
    `isKnownGoogleFont` gate. Unresolvable `@font` identifiers produce an
    explicit compile failure (`kind: 'unresolved-identifier'`).
  - Tier 2 (post-compile): `extractFontReferencesFromCompileResult` walks the
    compiled layers (recursing into group children, merging text-element
    styles over layer styles) and fetches any binaries the source scan missed
    — covers template values and any future expression form. No recompile
    needed: `fromGlyph`/`toPathBlock` throw at compile time when a family is
    missing, so a successful compile only needs late binaries for iframe
    `@font-face` injection.
- **Docs**: `docs/path-blocks.md` (@font identifier form + example),
  `docs/layers.md` (Variables and Interpolation in Values),
  `docs/syntax.md` (cross-link).
- **Tests**: parser (template values in style blocks, @font identifier,
  `@fontFamily` guard), evaluator/layers (identifier + template resolution,
  quoted-literal pinning, `"${f}"` rejection), CLI (file font via variable,
  unresolved error), font-loader (let-map, identifier refs, compile-result
  extraction), formatter. Full suite: 3808 passing.

## Code-review round (2026-07-20)

The code-reviewer agent found two Critical regressions, both fixed and
regression-tested:

1. **StyleContent comment branch swallowed the closing `}`** — the first
   token formulation gave `//` comments a `![\n]*` tail, so a single-line
   trailing comment (`${ fill: red; // note }`) or a `//` inside
   `url(https://...)` carried the token past the block's closing brace,
   producing misplaced "Missing ';'" errors, silently dropping the next
   statement, and masking the sanitizer's clean url() rejection. Final
   formulation drops comment/slash special-casing entirely: quotes are both
   plain content *and* string-branch starts, and the DFA's
   longest-accepting-match rule yields the right extent (a same-line
   terminated string crosses `}`, anything unterminated falls back to the
   old stop-at-`}` behavior). Intermediate `}`-excluded comment-branch
   attempts blew the generator's 16-bit table limit. Tests: trailing
   comment, apostrophe-in-comment, `1/2` value, single-line url() rejection.
2. **Playground/CLI resolution divergence** — the regex-based identifier
   resolution missed indented top-level `let`s, two `let`s on one line, and
   `@font x` without the optional `;`, hard-failing programs the CLI
   accepts. Directive resolution in `font-loader.ts` is now **AST-first**:
   when `window.PathogenLang` is loaded it calls the same
   `parse` + `resolveFontDirectives` as the CLI (exact parity); the regexes
   remain only as a mid-typing fallback (source doesn't parse), with the
   anchors/optional-`;` loosened. `FontDirectiveError` gained an
   `identifier` field so unresolved-identifier failures map through the AST
   path. Tests: AST-parity describe covering all three divergence cases +
   fallback-on-parse-error.

Non-blocking review notes: `getDiagnostics` doesn't surface the
`@fontFamily` adjacency-guard message in editor squiggles (pre-existing
diagnostics gap, unchanged by this work); the debug script now uses
Commander per scripts convention.

### Re-verification round

The reviewer re-verified both fixes empirically (confirmed) and stress-found
one residual: a same-line apostrophe *pair* straddling the closing `}`
(`// don't change } … // it's fine`) still paired as a "string" crossing the
brace. Fixed by making the quote branches asymmetric — **single-quoted
strings never cross `}`** (apostrophes are everyday comment text; use double
quotes for a literal `}` value), double-quoted strings keep the crossing
feature. Regression tests pin both the repro and the asymmetry.
Remaining known (very narrow) limitation: a *double*-quote pair inside a
comment straddling the `}` on one line would still cross — accepted; a
regular-language token cannot losslessly distinguish comments from strings.

Caveats closed:
- `dist/index.global.js` confirmed to export `parse` +
  `resolveFontDirectives` (import-checked), so the AST-first path is live.
- `workspace-view.ts:196` gates compilation on `window.PathogenLang`
  existing, so the AST path is always available when the playground
  compiles; the regex fallback only runs for source that doesn't parse —
  where compilation fails with a parse error anyway. The fallback's
  inherent one-`let`-per-line limit is therefore not user-reachable for
  valid programs. (Nuance, pre-existing shape: for unparseable source
  containing `@font <ident>`-looking text, the font failure is thrown
  before the compile's own parse error.)

## Deliberate behavior notes

- Double-quoted strings never interpolate — `font-family: "${f}"` is now a
  `validateCSSValue` "disallowed token" error (was a confusing parse error).
- `}` inside a *quoted* style value no longer terminates the style block.
- Interpolations inside style values support one nested brace level (grammar
  token is regular; the AST-builder scanner mirrors this).
- `@font` identifier must resolve to a *top-level* `let` with a plain string
  literal — same rule in CLI (AST-based) and playground (regex-based).
- Deferred: scope-analysis reference for the `@font` identifier (rename /
  go-to-def) — the AST stores only the directive's loc, not the
  identifier's own range, so a reference entry would give rename a wrong
  edit span. Needs an `identifierLoc` on the AST node first.

## Verification

- CLI: user's exact program (with `<<` styles) emits
  `font-family="Noto Sans"` on both `<text>` elements; template variant
  emits family + weight correctly.
- Playground: `scripts/debug-font-variable-resolution.ts` (puppeteer, against
  the running dev stack) — **VERIFIED 2026-07-20**:
  - Scenario 1 (variable): `Noto Sans:wght@900` CSS + woff2 fetched from
    Google Fonts; iframe `#pathogen-fonts` contains the Noto Sans
    `@font-face`; `<text font-family="Noto Sans">` with **computed**
    fontFamily `"Noto Sans"` — the browser actually renders the font.
  - Scenario 2 (literal `"fontFamily"`, cold): no fetch, attribute and
    computed family are the literal `fontFamily` → fallback rendering, as
    designed.
  - Note: `page.screenshot` hangs indefinitely under headless Chrome on this
    host (reproduced against a plain page) — screenshots are opt-in via
    `--screenshots`; the console assertions are the verification record.

## Mystery: literal `"fontFamily"` rendering Noto Sans (user report)

Suspect: stale preview on compile error — `setLayersWithTiming` never runs
on error, so the last good SVG *and* its injected fonts persist
(`svg-preview-pane.ts` `_updateIframeFonts` only runs on successful render).
The user's session had parse errors (`@font fontFamily;`) interleaved with
edits, making a stale-preview misread likely. **Cold repro (2026-07-20)
confirms the literal case does NOT render Noto Sans** — no fetch, fallback
rendering — so the observation required warm state. With `@font <identifier>`
now parsing, the exact triggering sequence no longer exists. The generic
stale-preview-on-error behavior remains; clearing/labeling stale previews is
a separate, small change pending user sign-off.
