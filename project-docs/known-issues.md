# Known Issues and Limitations

This document tracks known issues, limitations, and technical debt in pathogen-lang. Each entry includes when it was discovered, its severity, impact, and potential solutions for future planning.

---

## ISSUE-001: Function calls after path commands parsed as arguments

**Discovered:** 2026-01-17 (during annotated output feature implementation)

**Severity:** Medium

**Description:**

Function calls that immediately follow path commands are parsed as path arguments rather than separate statements. This is due to the greedy nature of `pathArg.many()` in the parser.

**Example:**

```
M 0 0
circle(50, 50, 25)
```

This parses as a single PathCommand with `M` command and arguments `[0, 0, circle(50, 50, 25)]`, not as two separate statements.

**Impact:**

1. **Annotated output:** Function calls in this position don't receive their own `//--- functionName(...) called from line N` annotations
2. **User confusion:** Code that visually looks like separate statements behaves differently than expected
3. **Debugging difficulty:** When functions are called as path arguments, it's harder to trace which function produced which output

**Current Workarounds:**

1. Call functions as standalone statements (not after path commands):
   ```
   circle(50, 50, 25)  // Gets annotated
   M 0 0               // Separate statement
   ```

2. Wrap positioning and function calls together:
   ```
   fn positionedCircle(x, y, r) {
     M x y
     circle(x, y, r)
   }
   positionedCircle(50, 50, 25)
   ```

**Potential Solutions:**

1. **Require explicit delimiters:** Add semicolons or newlines as statement separators
   - Pro: Clear, unambiguous parsing
   - Con: Breaking change, more verbose syntax

2. **Lookahead for statement-level functions:** Detect when a function call on a new line should be a statement
   - Pro: Maintains current syntax
   - Con: Complex parser changes, potentially fragile

3. **Introduce statement terminator for path commands:** Use `Z` or `;` to explicitly end path command argument collection
   - Pro: Backward compatible, opt-in clarity
   - Con: Requires user awareness

4. **Different syntax for path arguments vs statements:** e.g., `M 0 0 @circle(...)` for argument, `circle(...)` for statement
   - Pro: Completely unambiguous
   - Con: New syntax to learn

**Recommended Long-term Solution:**

Option 3 (explicit terminator) seems most pragmatic. Document that path commands greedily consume following function calls, and recommend using `Z` or starting a new path with `M` when transitioning from path commands to function statements.

Alternatively, consider a lint/warning in the CLI that detects this pattern and suggests restructuring.

---

## ISSUE-002: M command doesn't update ctx.position before context-aware functions on separate lines

**Discovered:** 2026-01-25 (during arcFromPolarOffset implementation)

**Severity:** Medium

**Description:**

When an `M` (moveto) command and a context-aware function (like `arcFromPolarOffset`, `polarLine`, etc.) are on separate statements, the `M` command doesn't update `ctx.position` before the function evaluates. The function reads the previous position (often the origin `(0, 0)`) instead of the position set by `M`.

**Example:**

```
M 100 100
arcFromPolarOffset(0, 50, 90deg)
```

Expected: `arcFromPolarOffset` uses position `(100, 100)` to calculate the arc center at `(150, 100)`.

Actual: `arcFromPolarOffset` uses position `(0, 0)`, calculating the arc center at `(50, 0)`.

The output path is `M 100 100 A 50 50 0 0 1 50 -50` — the `M` is present but the arc was calculated from the wrong starting position.

**Impact:**

1. **Incorrect arc calculations:** `arcFromPolarOffset` (and potentially other context-aware functions) produce wrong geometry when preceded by `M` on a separate line
2. **User confusion:** The path contains both the `M` command and the arc, but they don't connect logically
3. **Workaround required:** Users must structure code to avoid this pattern

**Current Workarounds:**

1. Use context-aware functions from the origin without preceding `M`:
   ```
   arcFromPolarOffset(0, 50, 90deg)  // Works correctly from (0, 0)
   ```

2. Use `arcFromCenter` instead, which calculates positions using offsets rather than absolute ctx.position:
   ```
   M 100 100
   arcFromCenter(50, 0, 50, 180deg, 270deg, 1)  // Uses offset from M position
   ```

**Potential Solutions:**

1. **Investigate statement evaluation order:** The issue may be in how `evaluateStatements` processes path commands vs function calls — ensure `M` updates context before the next statement evaluates
   - Pro: Fixes root cause
   - Con: May have unintended side effects on other statement interactions

2. **Force context sync between statements:** Add explicit context synchronization point after each statement
   - Pro: Predictable behavior
   - Con: Performance overhead, may mask other issues

3. **Document as limitation:** Clearly document that context-aware functions should not rely on preceding `M` commands on separate lines
   - Pro: No code changes needed
   - Con: Unintuitive restriction for users

**Recommended Long-term Solution:**

Option 1 — investigate and fix the evaluation order. The current behavior is unintuitive: if `M 100 100` appears in the output path, users reasonably expect subsequent context-aware functions to use that position. This likely requires tracing through `evaluateStatements` and `evaluatePathCommand` to find where the context update is being delayed or lost.

---

## ISSUE-003: Layers menu disappears when code references an undefined layer

**Discovered:** 2026-02-13 (during layer system testing)

**Severity:** Low

**Description:**

When a user writes `layer('some-layer').apply { ... }` but `'some-layer'` has not been defined with a `define` statement, the compiler throws an `Undefined layer` error. Because the entire compilation fails, no `CompileResult` is produced, and the Layers menu in the playground disappears entirely — not just the invalid layer, but all previously visible layers.

**Example:**

```
define PathLayer('outline') { stroke: black; }
layer('outline').apply { M 0 0 L 100 100 }
layer('details').apply { M 50 50 L 75 75 }   // 'details' not defined → error
```

The `outline` layer was valid and visible in the Layers menu before the third line was added, but the compilation error causes the entire menu to vanish.

**Impact:**

1. **Discoverability loss:** Users lose visibility of layers they've already defined while in the middle of writing new layer references
2. **Confusing UX:** The Layers menu appearing and disappearing based on parse/eval success feels unstable

**Current Workarounds:**

1. Always `define` a layer before writing `layer(...).apply` blocks
2. Check the error panel — the error message clearly states which layer is undefined

**Potential Solutions:**

1. **Partial compilation:** Run compilation in two passes — first collect layer definitions, then evaluate apply blocks. If an apply block fails, still report the defined layers
   - Pro: Best UX, layers stay visible during editing
   - Con: Significant compiler architecture change

2. **Cache last successful layer list:** Keep the previous Layers menu state when compilation fails
   - Pro: Simple to implement in the playground
   - Con: Stale data could be confusing (showing layers that no longer exist in the code)

3. **Extract layer definitions without full compilation:** A lightweight regex/parse pass that finds `define ... Layer(...)` statements for the menu, independent of full compilation
   - Pro: Fast, decoupled from compilation success
   - Con: Duplicates parsing logic, could drift out of sync

**Recommended Long-term Solution:**

Option 2 (cache last successful layer list) is the most pragmatic short-term fix. Option 1 (partial compilation) would be ideal long-term but requires rethinking the single-pass evaluator architecture.

---

## ISSUE-004: Google Fonts picker limited to curated list without API key

**Discovered:** 2026-02-13 (during TextLayer style editor implementation)

**Severity:** Low

**Description:**

The TextLayer style editor's font picker uses a hardcoded curated list of ~100 popular Google Fonts. The `fetchGoogleFonts()` helper in `playground/utils/google-fonts.js` supports fetching the full catalog (~1500+ fonts) via the Google Fonts API, but this requires an API key. Since the playground runs entirely client-side, embedding an API key in the source would expose it publicly.

Currently `fetchGoogleFonts()` is called without a key, so the API path is never exercised and the curated fallback list is always used.

**Impact:**

1. **Limited font selection:** Users only see ~100 fonts instead of the full Google Fonts catalog
2. **Niche fonts unavailable:** Users looking for specific or less popular fonts won't find them in the picker
3. **Dead code:** The API fetch path in `google-fonts.js` exists but is never used

**Current Workarounds:**

1. The curated list covers the most popular Google Fonts (Roboto, Inter, Poppins, Montserrat, etc.) which satisfies the majority of use cases
2. Users can manually type any font family name into the font input field — if it's a valid Google Font, `loadGoogleFont()` will still load it from the CDN (the API key is only needed for *discovering* fonts, not *serving* them)

**Potential Solutions:**

1. **User-provided API key in preferences:** Add a field in the playground preferences UI where users can paste their own Google Fonts API key. Store it in `localStorage` via the store, pass it to `fetchGoogleFonts()`
   - Pro: No key exposure, users who want the full catalog can opt in
   - Con: Extra UI, requires users to create their own GCP project and key

2. **Proxy through backend:** Route API requests through a server-side proxy that holds the key
   - Pro: Key stays private, transparent to users
   - Con: Requires backend infrastructure, adds a dependency for a purely client-side playground

3. **Expand the curated list:** Increase from ~100 to ~300-500 fonts to cover more use cases without an API
   - Pro: Zero infrastructure, no key needed
   - Con: Larger bundle size, still not the full catalog, requires manual curation updates

4. **Scrape font list at build time:** Fetch the full catalog during `npm run build` and embed it as a static JSON asset
   - Pro: Full catalog without runtime API key, no backend needed
   - Con: Requires API key at build time, list becomes stale between builds

**Recommended Long-term Solution:**

Option 1 (user-provided API key in preferences) is the cleanest approach. It respects the client-side architecture, avoids key exposure, and lets power users who want the full catalog bring their own key. The preferences view already exists as a natural place for this setting. For most users, the curated list plus manual font name entry is sufficient.

---

## ISSUE-005: No auto-formatting / code formatter for the Playground editor

**Discovered:** 2026-02-24 (during playground UX investigation)

**Severity:** Low

**Description:**

The Playground uses CodeMirror 6 (loaded from esm.sh CDN) to edit pathogen-lang code. There is no code formatting beyond CodeMirror's built-in `indentOnInput()`. The goal is to add a "format code" capability similar to Prettier, but **Prettier cannot format this language out of the box** — its built-in parsers (babel, typescript, etc.) would fail on SVG path commands like `M 0 0 L 100 100`. Any solution must understand the pathogen-lang syntax.

**Options Investigated:**

### Option A: Prettier Plugin (Heavy)

Write a Prettier plugin that adapts the existing Parsimmon parser for Prettier's pipeline.

**What a Prettier plugin requires:**
1. **Parser adapter** — Convert Parsimmon AST → Prettier-compatible AST with `locStart`/`locEnd` offsets on every node
2. **Printer** — Convert AST → Prettier's Doc IR (`group`, `indent`, `line`, `hardline`, etc.) — this is the bulk of the work (~500-800 lines)
3. **Comment attachment** — Tell Prettier how to associate comments with AST nodes (the parser already parses `Comment` nodes, but they'd need location info and parent/sibling association)
4. **Browser loading** — Load via `prettier/standalone` + the plugin from CDN or bundled

**Effort:** ~1-2 weeks. The printer alone is substantial — every AST node type (path commands, `for`, `if`, `fn`, `let`, `layer`, `text`, `tspan`, `define`, `apply`, `calc()`, style blocks, path blocks, etc.) needs a printing rule.

**Pros:** Full Prettier experience — configurable print width, format-on-save, consistent with other editors.
**Cons:** Heavy dependency (~1-2 MB loaded in browser), significant upfront investment, must maintain the plugin as the language evolves. Prettier plugins are designed for "real" languages — the DSL's path command syntax (space-separated args, single-letter commands) is awkward to model in Prettier's Doc IR.

### Option B: AST-Based Custom Formatter (Medium)

Write a standalone formatter that uses the existing parser: `parse(code) → AST → pretty-print`.

**What this requires:**
1. **Printer function** — Walk the AST and emit formatted text with proper indentation, line breaks, and spacing (~400-600 lines)
2. **Comment preservation** — The parser must preserve comments with location info (needs verification — Parsimmon AST may drop or reorder comments)
3. **Round-trip fidelity** — Formatting must not change program semantics (path command arguments must stay in order, `calc()` expressions preserved exactly)

**Effort:** ~3-5 days. Simpler than a Prettier plugin because we control the output format directly — no Doc IR translation layer.

**Pros:** No external dependency, full control, lightweight.
**Cons:** Still significant work. Comment preservation is the hardest part — if the parser doesn't track comment positions relative to surrounding code, comments could be misplaced or lost. Must be maintained alongside parser changes.

### Option C: Brace-Counting Indent Formatter (Light) — Recommended Starting Point

Don't parse the code at all. Scan line-by-line, track `{ }` nesting depth, and reindent each line.

**What this requires:**
1. **Line scanner** (~100-200 lines) — For each line: strip leading whitespace, count net brace changes (opening `{` increases depth, closing `}` decreases), handle special cases (`${` style blocks, `@{` path blocks, string literals, comments), apply indentation = `depth * indentSize` spaces
2. **CodeMirror integration** — A command that replaces the document with reindented text
3. **UI trigger** — Keyboard shortcut (Shift+Alt+F) and/or toolbar button

**Effort:** ~1 day.

**Pros:** Simple, no dependencies, handles the most common formatting need (inconsistent indentation after copy-paste or rapid editing), zero risk of breaking code semantics (only whitespace changes), trivial to maintain.
**Cons:** Only fixes indentation — won't reflow long lines, normalize spacing, or enforce one-statement-per-line. But for a DSL editor, consistent indentation is 80%+ of the formatting value.

**Could be extended incrementally:** blank line normalization, trailing whitespace removal, consistent spacing around `=` in `let` declarations.

**Impact:**

1. **Poor editing experience:** After copy-pasting code or rapid editing, indentation becomes inconsistent with no way to fix it automatically
2. **No standard tooling:** Unlike mainstream languages, there is no external formatter users can run

**Current Workarounds:**

1. Manually fix indentation
2. CodeMirror's `indentOnInput()` handles new lines but does not reformat existing code

**Recommended Long-term Solution:**

**Start with Option C** (brace-counting indenter). It delivers the core formatting value with minimal effort and risk. If more sophisticated formatting is needed later, Option B (AST-based) can be built on top — the indenter stays useful as a fast path for simple cases. Option A (Prettier plugin) is not worth the investment unless the language becomes widely adopted and users expect Prettier integration in external editors.

**Implementation plan for Option C:**

| File | Changes |
|------|---------|
| `playground/utils/cm-format.js` | New file — brace-counting indent formatter + CodeMirror command |
| `playground/components/code-editor-pane.js` | Add format keybinding (Shift+Alt+F), toolbar button, import extension |

---

## ISSUE-006: Style block parser strips `//` as a line comment, dropping URL-like values

**Discovered:** 2026-04-27 (during SVG sanitization hardening, [security plan](../.claude/plans/i-was-reading-the-polished-peacock.md))

**Severity:** Low

**Description:**

The style-block AST builder treats `//` as a line comment delimiter (`parser/ast-builder.ts:1704`):

```ts
const stripped = raw.replace(/\/\/[^\n]*/g, ''); // Strip comments
```

The replacement happens before the property-extraction regex runs, and it does not respect string literal boundaries. For a property like:

```pathogen
define PathLayer('a') ${ background-image: "url(https://evil.example/log)"; }
```

…the `//` inside `https://` truncates the value at `https:` and the regex `/([a-zA-Z][a-zA-Z0-9-]*)\s*:\s*([^;\n]+);/g` no longer matches. The property is silently dropped from the AST and the compiled SVG contains no styles for that layer.

**Impact:**

- **Currently a coincidental safety net:** the malicious URL never reaches the compiled output, but for the wrong reason — by parser truncation, not by validation.
- **Future-fragility:** if anyone fixes the comment stripper without restoring it as a parser feature, `https://`, `http://`, and any other `//`-bearing value would suddenly survive. Phase 1 of the SVG sanitization plan (compiler emission hardening, 2026-04-27) added a strict CSS-value allow-list at `src/evaluator/sanitize.ts` that already rejects every `url()`/`image-set()`/`var()`/etc. shape, so the safety net being removed would not regress the security contract — but the user-facing behavior would change (silent drop becomes loud rejection).
- **Functional regression:** legitimate uses of `//` in style values (e.g. `data:image/png;...` URIs in `mask` references) are also silently dropped today.

**Current Workarounds:**

Avoid `//` in style block values. The Pathogen language already routes legitimate URL refs through `Mask()`, `ClipPath()`, `LinearGradient()`, etc. — `url(#id)` (no `//`) — so users rarely hit this in practice.

**Potential Solutions:**

1. **String-aware comment stripping** — track open string-literal state while scanning, only treat `//` as a comment when not inside `"…"` or `'…'`. ~10 lines of code.
2. **Two-pass parse** — extract string-literal spans first, replace each with a placeholder, strip comments, then restore. Slightly cleaner but more work.
3. **Drop line-comment support inside style blocks entirely** — Pathogen has block comments `/* … */`; remove `//`-stripping from the style block path. Simpler but breaks any user relying on `//` comments inside `${ … }`.

**Recommended Long-term Solution:**

Option 1 — string-aware stripping, since users do use `//` comments and `data:` URIs are a legitimate value form. Tracked separately from the security work because the security contract is already enforced by `validateCSSValue` regardless of which path delivers the value.

---

## ISSUE-007: Style sanitizer rejects the quoted font-family stack the design system mandates

**Discovered:** 2026-09-03 (authoring `website/blog/samples/post51/` for the easing post)

**Severity:** Low

**Description:**

`website/guidelines/example-design-system.md` §3 calls this typography stack a hard requirement for every example surface:

```pathogen
let labels = TextLayer('labels') ${ font-family: 'Helvetica Neue', 'Helvetica', 'Arial', sans-serif; };
```

The style-value allow-list (`src/evaluator/sanitize.ts`, see `docs/security.md`) rejects it at compile time:

```
Style value for "font-family" contains a disallowed token ("'Helvetica" in "'Helvetica Neue', 'Helvetica', 'Arial', sans-serif")
```

Every published sample therefore uses `font-family: system-ui, sans-serif;` instead, and the design system's typography section cannot be followed by any `.pathogen` sample. The same guide's `fg_auto` expression (`oklch(from var(--bg) …)`) has not been checked against the sanitizer either.

**Impact:**

- Sample authors discover the conflict only at compile time and fall back to whatever the previous post used, so the design system's typography rules are dead letter for samples.
- Multi-word family names (`Helvetica Neue`) may be impossible to express at all if unquoted identifier sequences are also rejected (not verified).

**Current Workarounds:**

Single-word or generic families without quotes: `system-ui, sans-serif`.

**Potential Solutions:**

1. **Allow quoted strings for `font-family` only**, validated as a quoted run of letters, digits, spaces and hyphens. Keeps the allow-list strict elsewhere.
2. **Amend the design system** to an unquoted stack and confirm the sanitizer accepts `Helvetica Neue` as an identifier sequence.
3. Both: accept quoted names and update the guide to show the exact form that compiles.

**Recommended Long-term Solution:**

Option 3. Quoted font names are ordinary CSS and the security contract is about `url()`/`var()`/function shapes, not string literals in `font-family`; the guide should then show the compiling form and the sanitizer test suite should pin it.

---

## ISSUE-008: The formatter wraps every call with five or more arguments, however short

**Discovered:** 2026-09-03 (formatting the easing post's samples)

**Severity:** Low

**Description:**

`shouldWrapArgs` in `src/language-services/formatter.ts` (~line 507) returns true for any call with `>= 5` arguments, so the canonical form of a short call is one argument per line:

```pathogen
let smooth = {|t| cubicBezier(0.42,
    0,
    0.58,
    1,
    t)};
```

`validate-samples` check #6 requires formatter-clean sources, so every published sample that uses `cubicBezier(x1, y1, x2, y2, t)` (or `map(v, a, b, c, d)`) must carry this shape.

**Impact:**

The central idiom of the easing docs and blog post reads as heavy in the mini-workspace code panel, which the wrapping rule exists to keep readable. Any future five-argument stdlib function inherits the same look.

**Current Workarounds:**

None inside a sample; the `docs/*.md` code fences are not formatted, so they show the one-line form.

**Potential Solutions:**

1. **Width-based rule:** keep a call on one line when every argument is a literal or identifier and the printed call fits within the line budget; wrap otherwise.
2. **Per-callee exemption list** for known short signatures. Fragile.
3. Leave as is and accept the look.

**Recommended Long-term Solution:**

Option 1. Note the migration cost: previously formatted samples containing such calls become "unformatted" under the new rule and must be reformatted (they were only ever exploded by this rule, so reformatting is mechanical); run `format:samples` across `website/blog/samples/` in the same change.

---

## ISSUE-009: Topological, mesh and freeform gradients rasterize only in the playground

**Discovered:** 2026-09-03 (three-surface check for `TopoGradient.easing`), pre-existing

**Severity:** Medium

**Description:**

Only the playground renders `TopoGradient`, `MeshGradient` and `FreeformGradient` to pixels (`useImageGradients: true` in `playground/utils/svg-builder.ts` and `components/svg-preview-pane.ts`, via the WebGPU shaders or the Canvas fallback in `playground/gpu/gradient-service.ts`). The CLI's `--output-svg-file` and the VS Code preview both fall into `src/render/build-defs.ts:189-245`, which emits a `<pattern>` holding a single flat-color `<rect>` (the base color or the first contour's color). Every topo property that shapes the field — `easing` (now 26 curves), `method`, `iterations`, contour elevations — has no effect on those two surfaces.

**Impact:**

Violates the three-surface parity rule in `.claude/CLAUDE.md`: the same program produces a shaded field in the playground and a flat fill from the CLI or the editor preview, with no warning. `scripts/compile-bbwp.ts` and `compile-samples.ts` work around it by driving headless Chrome for GPU gradient types.

**Current Workarounds:**

Use `npm run compile:bbwp` / `compile:samples` (puppeteer) for rasterized output outside the playground; the CLI itself cannot.

**Potential Solutions:**

1. **CPU rasterizer in `src/`** (pure JS: the SDF distance blend and the Jacobi solver already exist in JS form in `gradient-service.ts`; add a PNG encoder) shared by the CLI and the VS Code preview, using the same `EASING_CURVES` table.
2. **Puppeteer path inside the CLI** behind a flag, mirroring `compile-bbwp.ts`. Heavy dependency for a CLI.
3. **Emit a loud warning** from the CLI and the preview when a rasterized gradient type is present, and document the limitation in `docs/gradients.md`.

**Recommended Long-term Solution:**

Option 1 for parity, with option 3 as the immediate stopgap so users are not misled silently.

---

## ISSUE-010: Enum-backed property doc strings in `pathogen-api.ts` can drift from the enum

**Discovered:** 2026-09-03 (code review of the named easing family)

**Severity:** Low

**Description:**

Hover and completion details for type members come from JSDoc comments in `src/pathogen-api.ts` via `npm run generate:completions`. When a comment enumerates an enum's values by hand, nothing checks it against `BUILTIN_ENUMS`. `TopoGradient.easing` listed five values while the enum had grown to 26; it shipped past every test and was caught only in review (fixed in `ed4e1c2` by naming the family instead of listing it).

**Impact:**

A user hovering a property sees a stale value list. Any future enum growth (blend modes, marker orientations, …) can silently repeat this.

**Current Workarounds:**

Write property doc strings that name the enum ("any `Easing` member or its string") rather than listing values.

**Potential Solutions:**

1. **A drift test:** for every `pathogen-api.ts` doc string that contains a quoted value list matching an enum's values, assert the list equals `Object.values(BUILTIN_ENUMS.X)`.
2. **A lint** in `scripts/generate-completions.ts --strict` that rejects doc strings enumerating three or more values of a known enum, pointing at the enum name instead.
3. **Generate** the value list into the detail string from the enum at completion-data generation time, via a `@enum Easing` tag on the property.

**Recommended Long-term Solution:**

Option 3: a `@enum X` tag keeps hover text complete and correct by construction; option 2 as the guard for comments that forget the tag.

---

## ISSUE-011: `tsc --noEmit` reports pre-existing errors in parser and playground files

**Discovered:** 2026-09-03 (typechecking during the easing work), pre-existing

**Severity:** Low (two of the errors may hide real logic bugs)

**Description:**

`npx tsc --noEmit -p tsconfig.json`:

```
src/parser/ast-builder.ts(2437,20): TS2367 comparison of '"ObjectProperty"' and '":"' has no overlap
src/parser/ast-builder.ts(2470,13): TS2367 comparison of '"SpreadElement"' and '"..."' has no overlap
src/parser/lezer-expression.ts(6,20): TS6133 'setExpressionParser' declared but never read
src/parser/lezer-expression.ts(7,27): TS6196 'SourceLocation' declared but never used
src/parser/path-args-tokenizer.ts(71,13): TS6133 'saved' declared but never read
```

`npm run typecheck:playground`:

```
playground/components/workspace-view.ts(1225,9): TS2322 string not assignable to null | undefined
playground/components/workspace-view.ts(1276,48): TS2554 expected 1 argument, got 2
playground/components/workspace-view.ts(1282,27): TS2551 'highlightErrors' does not exist (did you mean 'highlightError'?)
playground/services/font-loader.ts(492,3): TS2322 ArrayBuffer | SharedArrayBuffer not assignable to ArrayBuffer
playground/utils/detail-source-mount.ts(48,33): TS2307 cannot find module '/dist/highlight.global.js'
```

**Impact:**

The two TS2367 errors in `ast-builder.ts` compare a Lezer node name against a punctuation string that can never be a node name, so those branches are dead: either the punctuation case is silently unhandled or the check is redundant. The `workspace-view.ts` errors suggest an error-highlighting call that no longer matches the editor's API (`highlightErrors` vs `highlightError`), which may mean multi-error highlighting is not wired. The rest are hygiene. Because the baseline is red, new type errors do not stand out.

**Current Workarounds:**

None; the build (`tsup`) and esbuild playground transpile do not typecheck, so nothing fails.

**Potential Solutions:**

1. Fix each error and make `tsc --noEmit` part of `npm run lint` or a pre-commit hook so the baseline stays green.
2. Investigate `ast-builder.ts:2437,2470` and `workspace-view.ts:1276-1282` first as possible behavior bugs.

**Recommended Long-term Solution:**

Both, in that order.

---

## ISSUE-012: `validate-samples` text-geometry collisions use bounding boxes

**Discovered:** 2026-09-03 (validating `website/blog/samples/post51/`)

**Severity:** Low

**Description:**

`scripts/validate-samples.ts` check #3 intersects the text element's rect with each path element's `getBoundingClientRect()`. A path that spans a region (a diagonal guide line, a multi-row wave drawn as one layer) reports a collision for any text inside its box, with no visual overlap:

```
[text-geometry-collision] Text "1 half-cycle" overlaps <path>#guide-1 (73% of text area)
```

Authors work around it by splitting rows into separate layers and moving labels outside the path's box, which shapes sample structure around the checker rather than around the reader.

**Impact:**

False positives cost an authoring round trip per sample and can push labels away from the geometry they describe, which the schematic checklist argues against.

**Current Workarounds:**

One layer per row; labels beyond the row's extent.

**Potential Solutions:**

1. **Geometry-aware test:** rasterize the path (or sample points along it via `getPointAtLength`) and check the text rect against those points with a small tolerance.
2. **Per-sample allowlist** comment for known false positives.
3. Keep bbox but require a minimum path-area coverage before flagging.

**Recommended Long-term Solution:**

Option 1; `getPointAtLength` sampling is cheap in the puppeteer page the script already drives.

---

## ISSUE-013: `docs/*.md` code fences are not compile-tested

**Discovered:** 2026-09-03 (docs-first work for `cubicBezier` and `ease`), pre-existing

**Severity:** Low

**Description:**

There is no harness that extracts the Pathogen fences from `docs/*.md` and compiles them. The reviewer of the easing docs compiled each new fence by hand. Any fence can rot silently as the language changes (the `docs/gradients.md` TopoGradient example still writes `rect(0, 0, 400, 300)` without a semicolon inside `apply`, for instance, which may or may not parse under mandatory semicolons).

**Impact:**

Published documentation can show code that no longer compiles, which is the worst kind of docs bug for a language.

**Current Workarounds:**

Manual compilation during review.

**Potential Solutions:**

1. A vitest file that walks `docs/*.md`, extracts ```` ```pathogen ```` and unlabeled fences that start with a Pathogen statement, prepends a `define ViewBox` when missing, and asserts `compile()` succeeds (with an allowlist for intentionally failing snippets).
2. Do the same in `scripts/build-docs.ts` and fail the docs build.

**Recommended Long-term Solution:**

Option 1 first (fast, runs with the suite), option 2 once the corpus is clean.

---

## ISSUE-014: `cubicBezier` handles cannot drive `TopoGradient.easing`

**Discovered:** 2026-09-03 (named easing family design)

**Severity:** Low (limitation, documented)

**Description:**

Gradient easing travels to the shaders as a single `u32` mode (an index into `EASING_ORDER`). The 26 named curves fit that; a CSS `cubic-bezier(x1, y1, x2, y2)` needs four floats and a solve in WGSL, so `topo.easing = cubicBezier(...)` has no spelling. `docs/stdlib.md` documents `cubicBezier` as stdlib-only.

**Impact:**

A user who tunes a curve with `cubicBezier` for geometry cannot reuse the same handles on a gradient; they must pick the nearest named curve.

**Current Workarounds:**

Use the nearest `Easing` member (the docs table maps the classic curves to handle values and back).

**Potential Solutions:**

1. Extend both topo uniform structs with four `f32` handles and a mode value meaning "bezier", port the Newton/bisection solve to WGSL (`buildEasingWgsl` already generates the switch), and accept a `{ x1, y1, x2, y2 }` object or a four-element array on `easing`.
2. Approximate at compile time: sample the bezier into a small LUT texture. More plumbing.

**Recommended Long-term Solution:**

Option 1 when there is demand; the uniform layouts in `topo-shader.ts` and `topo-laplace-shader.ts` both have room (the laplace struct already carries three pad words).

---

## ISSUE-015: A layer whose path data has no leading moveto compiles silently and renders nothing

**Discovered:** 2026-09-09 (glyph-halo diagnosis, `project-docs/glyph-halo-diagnosis/`)

**RESOLVED:** 2026-09-24 — repaired at serialization, in `finalizeStore`
(`src/evaluator/index.ts`), which is the single point every LayerOutput's `data` passes
through. `ensureLeadingMove` (`src/evaluator/segments.ts`) prepends a zero-length **relative**
`m 0 0`: at the start of path data a relative moveto resolves as absolute, so it names the
(0,0) a layer's own cursor already starts from and adds no geometry. The same audit found the
identical failure in every `<defs>` producer — `Mask`/`ClipPath`/`Pattern`/`Marker.append()`
and `.contour()` emitted `d="H 40 V 40 H 0 Z"` — fixed alongside by `defsPathData`, which
prepends the **absolute** first point instead, because defs content has no cursor for a
relative move to resolve against.

**The command list is never touched.** A synthesized move must not become a value the
language can see: it would add a phantom `command` match, shift every `:nth` index, and
change what `command:first` selects. Pinned by `tests/leading-move.test.ts`, which asserts
both that the output is repaired and that `foo.d`, `.commands`, `subPathCount` and query
indices are unchanged for `@{ h 10 } << @{ v 10 }`.

Scope note: this repairs **all** layer output, including bare authored commands — `H 50` now
compiles to `m 0 0 H 50`. 22 unit tests asserted the unrepaired (non-rendering) strings and
were updated. No published sample changed; no byte-snapshot fixture moved.

**Severity:** Medium

**Description:**

`draw()` emits a block's commands from the layer's current cursor. A block whose command list does not begin with `m` (a plain `@{ l 10 0 }`, or any `variableOffset` / `compoundVariableOffset` / `offset` / `subPath` / `reverse` result, all of which are normalized to their first point) drawn as the **first** command of a layer yields path data such as `d="c 0.9 2.0 …"` or `d="l 10 0 l 0 10"`. SVG requires path data to start with a moveto, so the browser drops the whole path and logs `<path> attribute d: Expected moveto path command ('M' or 'm')` — once when the preview mounts it (`src/render/mount.ts`) and once more when the minimap copies it. The CLI writes the same invalid `d` verbatim. No surface repairs it and the evaluator emits no warning.

```
let ribbon = spine.variableOffset() {|vo, pb| … };
let L = PathLayer('halo-stroke') #{ fill: #000; };
L.apply { ribbon.draw(); }          // d="c …" — invisible layer, console error only
L.apply { ribbon.drawTo(x, y); }    // d="M x y c …" — renders
```

**Impact:**

A whole layer disappears with no compile-time signal; the only explanation is in the browser console, and the CLI gives none. In the diagnosis this cost most of a day: 48 halo-stroke layers compiled cleanly and were invisible. Violates the "no silent failures" rule in `.claude/CLAUDE.md`.

**Current Workarounds:**

Use `drawTo(x, y)` (or an explicit `M`) for the first draw into a layer. For offset results that must register on their spine, `drawTo(originX + block.anchor.x, originY + block.anchor.y)` — see `docs/variable-offset.md` "Placement — origin normalization and `anchor`".

**Potential Solutions:**

1. **Evaluator warning** at the first inked command into an empty layer when it is not a moveto: name the layer, suggest `drawTo()` / `M`. Cheap; makes the failure visible in all three surfaces via the existing warning channel.
2. **Prepend `M 0 0` in the shared renderer** (`src/render/`) so the layer renders at the origin instead of vanishing. Keeps CLI, playground and VS Code identical.
3. Both: the warning explains, the prepend keeps the layer visible.

**Recommended Long-term Solution:**

Option 3. The warning is the fix for the user; the prepend is defense in depth for the surfaces.

---

## Fixed during the glyph-halo follow-up (2026-09-12)

ISSUE-016, ISSUE-017 and ISSUE-020 were resolved on the same day; their original entries are kept below the table for the trail. Evidence: `project-docs/conic-parity/`, `scripts/debug-compile-cancel-and-conic.ts` (23 browser checks), CHANGELOG 2026-09-12.

| Issue | Fix |
|-------|-----|
| ISSUE-016 — the playground compile worker never cancelled; edits during a long compile queued more full compiles | `playground/services/compiler-worker.ts` refactored into `CompilerWorkerClient` with a dedicated `editorCompiler` (the shared instance still backs the publish precheck and admin views); `updatePreview` terminates the superseded compile before posting; Cancel control beside the `Compiling…` chip (breadcrumb + fullscreen chrome) with a `cancelled` status; typed `CompileCancelledError` never routes through `showError`; already-stale requests are refused before posting. No automatic termination by timer (user decision). Main-thread copy mitigations (former option 4) were not part of this pass. |
| ISSUE-020 — `normal(t).angle` unwrapped (−1.5π … 0.5π), ranges undocumented | `wrapToPi` in `src/evaluator/sampling.ts` applied at both `case 'normal'` sites → (−π, π] like `tangent(t)` (exactly left = +π); `docs/path-blocks.md` orientation table + `switch`-range trap, `docs/syntax.md` producer list, hover strings; tests for the down-left quadrant, exactly-left parity and full-circle sweeps; after-diagram recompiled from real values. Noted, not fixed: `tangentArc` / `arcFromPolarOffset` return `ContextObject.angle` as `endAngle ± π/2` unwrapped, and `ctx.tangentAngle` is declared in `pathogen-api.ts` but never populated. |
| ISSUE-017 — conic `innerRadius` / `spread` honoured only on WebGPU; gradients blank above 32768-unit viewBoxes | `src/conic-param.ts` ports the shader rules; `src/conic-renderer.ts` + `build-defs.ts` honour every property (annular sectors, blended-fill overlay/mask, spread over the full circle, ccw by reflection, linear-light mixing); the playground's Canvas 2D fallback draws the same wedges; `clampScale` floor removed (`raster-size.ts`), WebGPU renders wrapped in error scopes (`gpu-error-scopes.ts`), adapter limits requested (≤ 16384), cache keyed on post-clamp size + path, failures never cached, Pathogen-console notices for fallback/failure, `?gpu=off` / `PATHOGEN_GPU=off` switches; docs updated. Still approximate on the CLI: the blended inner fills use a five-stop radial gradient rather than per-pixel smoothstep. |

---

## ISSUE-018: No program-wide output budget; per-fragment records retained with `trace` off

**Discovered:** 2026-09-09 (a program emitting ~30k dash ribbons: 126 MB SVG, ~1.1 M commands, 1.4 GB peak heap in 15 s)

**Severity:** Low

**Description:**

The only runaway guard is `MAX_DASH_PIECES = 20000` per `dash()` call (`src/evaluator/stroke-geometry.ts`), which throws rather than warns; 48 calls of 7,000 pieces pass it. Nothing counts total commands, layers, or output bytes, so a program can compile "successfully" into an SVG no browser can hold. Independently, `layerState.accum.records` (`src/evaluator/index.ts` ~2389) accumulates per-fragment records with a string per command for every layer regardless of the `trace` option, which is a large share of the peak heap. Also inconsistent: statement loops cap at 32,000 iterations, text-block loops at 10,000.

**Impact:**

Users hit the browser's limits (ISSUE-016) instead of a compiler message; peak memory is ~10× the output size.

**Current Workarounds:**

`log(pieces.length)` / `log(block.commands.length)` while tuning; measure with the CLI (`/usr/bin/time -l`).

**Potential Solutions:**

1. Warning-group entries when total dash pieces, emitted commands or estimated output bytes cross thresholds (name the layer/site).
2. Skip `records` accumulation unless `trace` is set (or store compactly).
3. Align the two loop caps.

**Recommended Long-term Solution:**

1 and 2; 3 opportunistically.

---

## ISSUE-019: `variableOffset` / `compoundVariableOffset` are not available on `ProjectedPath`

**Discovered:** 2026-09-09

**RESOLVED:** 2026-09-21 — both methods now dispatch on `ProjectedPath` and return a
result **registered on its spine** (absolute placement preserved), so `.draw()` lands
the curve where the queried or subscribed geometry is. `anchor` rides along equal to
`startPoint`, so a `<<` worker written with the registration idiom reads correctly on
either receiver. The origin-preservation matrix asked for by solution 2 is published in
`docs/path-blocks.md` → Transforms → "Where the result lands". A zero-length spine (the
leading move a bare `'command'` selector matches) is now a named error instead of a
curve collapsed onto one point, and `ProjectedPath.toPathBlock()` was added as the
free-floating escape hatch. Paper trail:
`project-docs/observable-reactive-paths/projected-variable-offset/`.

**Severity:** Low

**Description:**

`dash()` and `outline()` exist on both `PathBlockValue` and `ProjectedPathValue` (pieces stay projected), but `variableOffset()` and `compoundVariableOffset()` throw `Unknown ProjectedPath method` on a projected path. So `halo.project(x, y).dash(…)` pieces cannot be offset in place; the only route is the `anchor` registration on un-projected pieces (ISSUE-015 workaround). Also: `offset`, `subPath`, `reverse` re-origin their result at its first point (dropping a piece's leading `m`) while `outline`, `scale`, `fillet` keep it — the matrix is measured in `project-docs/glyph-halo-diagnosis/STATUS.md`; only the offset family documents `anchor`.

**Impact:**

API asymmetry; users discover it by error message after building the pipeline.

**Current Workarounds:**

Offset the un-projected piece and place with `drawTo(origin + anchor)`.

**Potential Solutions:**

1. Add both methods to the ProjectedPath dispatch, returning a projected result (absolute placement preserved).
2. Document which transforms keep a block's origin and which normalize (table in `docs/path-blocks.md`).

**Recommended Long-term Solution:**

Both.

---

## ISSUE-026: path transforms are case-blind to absolute curve commands

**Discovered:** 2026-09-21 (code review of the ISSUE-019 work, then widened by audit)

**RESOLVED:** 2026-09-22 — fixed at the boundary rather than at the ~20 call sites.
`wrapCommands` (`src/evaluator/path-query.ts`) now normalizes a block's commands to
lowercase-relative via `normalizeToRelativeArgs`, which is what `docs/path-queries.md`
has always said a block is ("Path blocks always report lowercase relative commands";
`absolute` is "always false on blocks and projections") — the runtime had been reporting
`true`. Solution 2 from the list below, chosen over solution 1 because it is one site
instead of twenty reads with three different shapes (absolute points, relative deltas,
tangent vectors), and because it makes the runtime match a documented contract instead of
adding a new one. `normalizeToRelativeArgs` returns lowercase args untouched, so nothing
moves for the common case. All fifteen audited methods now agree; guarded by the
"transforms agree too" matrix in `tests/path-queries.test.ts`.

**Severity:** Medium

**Description:**

Same root cause as the sampling bug fixed in 7bb4bfc, in a different file. Layer records
preserve the case a command was authored in, so an uppercase `C`/`S`/`Q`/`T` carries
**absolute** control points. `src/evaluator/path-transforms.ts` rebuilds geometry from
those arguments and treats them as deltas from `start` unconditionally — roughly fifteen
sites, e.g. `splitCommandAtParametricT` (`:1444`, `:1445`, `:1477`), `:289`/`:290`/`:323`,
`:485`/`:486`, `:562`, `:1028`–`:1063`, `:2134`/`:2142`.

7bb4bfc fixed the *readers* (`calculateCommandLength`, `sampleOnCommand`,
`getParametricTForCommand`, `resolveSmooth`), so `d`, `length`, `get`, `tangent` and
`partition` are now correct. The *transforms* were never fixed and remain wrong.

**Measured** (`project-docs/observable-reactive-paths/projected-variable-offset/audit-absolute-methods.pathogen`
— the same curve authored absolutely and relatively, compared method by method):

| Agree | Differ |
|---|---|
| `d`, `length`, `get`, `tangent`, `partition` | `subPath`, `offset`, `reverse`, `startAt`, `scale`, `mirror`, `boundingBox`, `dash`, `outline`, `fillet` |

Concretely, `M 5 5; C 15 85 95 25 105 5;` and its exact relative twin produce the same
`d` but different `subPath(0.4, 0.6)` output.

**Impact:**

Any transform of layer-sourced geometry authored with absolute curve commands produces
the wrong shape — silently, because the whole-path `d` looks right. `dash()` inherits it
through `subPathCommands`.

**Exposure:** 2 published samples author absolute curve commands
(`post1/radial-glow.pathogen`, `post24/theme-combined.pathogen`); **no** byte-snapshot
fixture does. So a fix is unlikely to move pinned output.

**Potential Solutions:**

1. Apply the `isAbsoluteCmd` / `controlPointOf` helpers from `sampling.ts` (export them)
   at each site in `path-transforms.ts`, exactly as 7bb4bfc did for the readers. The
   relative branch must return arguments untouched so lowercase results stay
   bit-identical.
2. Or normalize case and arguments once, where layer commands become query geometry
   (`wrapCommands`, `src/evaluator/path-query.ts`), so no downstream consumer has to
   care. Fewer sites, but it changes what `Command.absolute` can report from a block and
   needs its own audit.

**Recommended Long-term Solution:**

1, backed by extending the absolute/relative coverage matrix in `tests/path-queries.test.ts`
to the transform surface — the audit script above is already the shape of that test.

**Note:** the existing coverage matrix checks `d`, `length` and `get` only, which is why
this survived the 7bb4bfc work.

---

## ISSUE-025: `ProjectedPath.subPath()` returns a PathBlock, but is declared as a ProjectedPath

**Discovered:** 2026-09-21 (while auditing origin preservation for ISSUE-019)

**Severity:** Low

**Description:**

Every other transform on a `ProjectedPath` keeps page coordinates. `subPath(t0, t1)` is
the exception: `src/evaluator/index.ts` returns a `PathBlockValue` normalized to `(0,0)`,
with the in-code comment "Return PathBlockValue (normalized to 0,0) so result is
drawable" — so the behaviour is deliberate. What is not deliberate is the mismatch:
`src/pathogen-api.ts` declares `subPath(startT, endT): PathogenProjectedPath` on
`PathogenProjectedPath`, and the generated `TYPE_METHOD_RETURNS.ProjectedPath.subPath`
therefore says `'ProjectedPath'`. Completions and chain-typing promise a projected value
and the runtime hands back a relative one.

Measured: `@{ h 100 v 40 }.project(200, 300).subPath(0.2, 0.8)` answers
`d = 'l 72 0 l 0 12'`, `startPoint = Point(0, 0)`.

**Impact:**

Chained completions after `.subPath(...)` on a projected value offer the wrong member
set, and a program that trusts the declared type places the slice at the origin. The
same class of drift as ISSUE-019, which shipped as completions offering
`match.block.variableOffset()` while the evaluator refused it.

**Potential Solutions:**

1. Declare the truth: `subPath(startT, endT): PathogenPathBlock` on `PathogenProjectedPath`,
   regenerate completions, and document it in the "Where the result lands" table (the
   table already states the current behaviour).
2. Or make it consistent with the other transforms and return a registered
   `ProjectedPathValue` — a behaviour change for anyone relying on the normalization.

**Recommended Long-term Solution:**

1 now (it is documentation-only and removes the false promise); 2 as a considered API
change, since it would move existing output.

**Note:** `tests/receiver-parity.test.ts` guards method *presence* in both directions but
not return types, which is why this survived.

---

## ISSUE-024: `loc.offset` is block-relative for nodes inside a method's trailing block

**Discovered:** 2026-09-19 (a differential check of every `loc` in every tracked program against the line/column definition; 665 of 83,922 disagreed, in 31 files)

**Severity:** Low — no user-visible symptom found

**Description:**

For statements inside a trailing block on a method call — `list.map {|item| … }`, `spine.variableOffset() {|go, pb| … }` — `loc.line` and `loc.column` are correct, but `loc.offset` is relative to the block's own text rather than the document. Measured on `project-docs/bulge-strokes/01-extract-function.pathogen`: a `PathCommand` reports `line 2, col 5` with `offset 57`, and offset 57 of the file is inside a comment. Errors raised inside such blocks report the RIGHT line and column (verified: `Line 5, col 13` and `Line 6, col 13` for errors on those lines), because `formatError` reads line and column, never offset.

**Impact:**

None observed. Anything that maps a node back to source text by `offset` — a future refactoring or code-action that slices the document — would read the wrong text for these nodes.

**Current Workarounds:**

Use `line` / `column`, not `offset`, for nodes that may sit inside a trailing block.

**Potential Solutions:**

1. Rebase `offset` where the trailing block's body is built, the way `parseExpressionAt` → `adjustLocations` already does for sub-parsed expressions.
2. Extend `tests/source-locations.test.ts`' "every loc agrees with the original definition" programs with a trailing block; today they deliberately avoid one, and the file says why.

**Recommended Long-term Solution:**

1, then 2 as its regression test.

---

## Resolved entries (kept for the trail)

### ISSUE-023 (resolved 2026-09-19): A raw path argument accepted NaN and Infinity (`M NaN 0`)

**Resolution:** The author chose option 2 — a positioned warning, with a strict mode.

- New warning code **`non-finite`**: a NaN or ±Infinity in a raw path argument, or handed to a function that draws, warns and the path is still emitted. `null` and a missing argument stay errors. The drawing functions, which had treated a NaN argument as fatal for a few hours on 2026-09-19, follow the same policy now, so `circle(x, y, r)` and `M x y` no longer disagree about the same NaN.
- **Strict mode**: `compile(src, { strict: true | ['non-finite', …] })` (also `compileWithContext`), CLI `--strict` / `--strict=<codes>`. It lives in `warn()`, the one function every warning passes through, so it covers every code. `WARNING_CODES` is a runtime list with the `WarningCode` type DERIVED from it; the CLI validates against it.
- `scripts/compile-samples.ts` passes `--strict=non-finite`, so a published sample cannot ship a path the browser stops reading partway. A named code, so warnings a sample has accepted do not fail the build.
- The five pinned math-contract tests pass untouched — the value still reaches the path, with a warning beside it.
- Census before shipping: 0 of 455 compiling tracked programs put NaN / Infinity into path data, so the warning is silent across the corpus and none fails under the gate.
- A missing argument to a context-aware function is still detected by inspecting what was produced, and still fatal — but only when every argument was finite; a NaN ARGUMENT warns and the NaN it produces is expected. Finite-but-degenerate inputs (zero radius, zero sweep, zero distance) were measured to produce finite output, so a NaN there does mean a missing argument.
- Accuracy note for anyone rewording the message: a layer's subpaths share one `d`, so a bad token costs everything AFTER it in that layer, not one stroke. `project-docs/non-finite-warnings/demo.png` shows it.

Original entry:

> ISSUE-023: A raw path argument accepts NaN and Infinity (`M NaN 0`) — a policy decision, not yet made

**Discovered:** 2026-09-19 (widening the path-emit guard after code review; a fix was written, collided with five deliberate tests, and was reverted pending a decision)

**Severity:** Medium

**Description:**

`evaluatePathArg` (`src/evaluator/index.ts`) rejects `null` — `Cannot use null as a path argument` — but formats any other number straight into the path, finite or not:

| Program | Output today |
|---|---|
| `let bad = sqrt(-1); M bad 0` | `M NaN 0` |
| `M calc(sqrt(-1)) 0` | `M NaN 0` |
| `let big = 1 / 0; M big 0` | `M Infinity 0` |
| `let bad = sqrt(-1); M 0 0 h bad` | `M 0 0 h NaN` |

SVG cannot represent these; the browser stops reading the path at that token and logs `Expected number`, while the compiler reports success with no warning. It is the same user-visible failure the path-emit guard closed for drawing *functions* (`circle(50, 50, null)` → `a null null`), reached by a different route. All six computed-argument branches of `evaluatePathArg` end in `return formatNum(n)`, so the function is a true chokepoint and the mechanical fix is six call sites.

**Why it was not simply fixed:**

Five existing tests pin these outputs on purpose — `tests/errors.test.ts` ("division by zero (returns Infinity)", "modulo by zero (returns NaN)") and `tests/evaluator.test.ts` (`smoothstep` with equal edges, `bump` with zero spread, `noise` of a non-finite `x`, the last three marked "documented contract"). What they protect is each **math function's degenerate return value**; `M calc(…) 0` is only the channel they read it back through. But making the path argument fatal changes more than a test helper:

- Today a degenerate math input yields **one broken path**. As a compile error it yields **no image at all**. For generative work driven by `random()`, a piece that renders 999 times in 1,000 would fail outright on the 1,000th instead of dropping one stroke.
- Against that: the broken path is silent, arrives with no line number, and is the exact failure that started the 2026-09-19 investigation.

**Inconsistency this leaves in the tree:** the path-emit guard already treats a non-finite *argument to a drawing function* as fatal (`circle(50, 50, sqrt(-1))` is an error), so `circle(x, y, r)` and `M x y` currently disagree about the same NaN. Whatever is decided here should be applied to both.

**Potential Solutions:**

1. **Compile error**, consistently (raw arguments and drawing functions). Move the five tests' observation channel to `log()`, which is the honest channel for a number anyway. Strictest; turns an intermittent visual glitch into an intermittent hard failure.
2. **Positioned warning, path still emitted.** A new `WarningCode`; the `warn()` helper and all three surfaces already carry line and column. Nothing that renders today stops rendering, and the silence ends. The browser still logs `Expected number`. Would mean relaxing the drawing-function guard to match, for non-finite numbers only (`null` and missing arguments stay fatal — those are always programming errors).
3. **Warning, and drop the offending command** so the rest of the path survives. Friendliest output; the compiler silently changing geometry is the kind of thing this project avoids.

**Recommended Long-term Solution:**

2. It ends the silent failure without making degenerate math fatal, it is the smallest behavioural change for existing programs, and it resolves the `circle` / `M` disagreement in the direction that breaks nothing. Pair it with a `--strict` CLI flag (warnings as errors) for published samples, where a NaN should stop the build. The author's call.

---

### ISSUE-022 (resolved 2026-09-19): A method call on a literal lost its error position — and every error in a for-each header said "Line 1, col 9"

**Resolution:** Wider than first logged, and it had a performance bug underneath it.

- **The class, not the instance.** An audit of `src/parser/ast-builder.ts` found ten expression node kinds built with no `loc`: `ArrayLiteral`, `ObjectLiteral`, `StringLiteral`, `TemplateLiteral` (2 returns), `NumberLiteral`, `BooleanLiteral`, `NullLiteral`, `CalcExpression` (2 sites — the path-argument one had a position computed and never attached), `UnaryExpression`, and a fallback `Identifier`. All carry one now; nine interfaces in `ast.ts` gained `loc?`. Chains inherit it, so `{ list: [1, 2] }.list.slice('a')` and `[[1, 2]][0].slice('a')` are positioned too.
- **`loc()` was O(source) per call.** It sliced the document prefix and split it on newlines for every node; `offsetToLoc()` did the same once per PATH ARGUMENT. A 1.4 MB, 20,000-line program took **18.8 s to parse**; giving 140,000 more nodes a position would have made that worse. All three copies now share `lineColumnAt()` — line starts computed once, binary search, clamped exactly as `slice(0, offset)` clamps. The same program parses in **0.5 s**. First attempt used a one-entry line-start cache, which every `calc()` sub-parse evicted, rebuilding the document's line starts per `calc()` — still quadratic (11× time for 4× the lines, isolated by profiling one construct at a time). Sources of ≤ 512 characters now bypass the cache, which holds two entries.
- **Equivalence is proven, not assumed.** `tests/source-locations.test.ts` keeps the old definition verbatim as an oracle: 22,000+ generated `(source, offset)` pairs including CRLF, astral characters, negative / beyond-length / fractional / NaN / ±Infinity offsets, plus a case that evicts the cache on every call.
- **Found by that work: for-each headers.** `buildForEachLoop` parsed its header with the non-rebasing `parseExpressionString`, so ANY error in a for-each header — top level, function body, path block, text block — reported `Line 1, col 9` (column 9 is the width of the `let _ = ` wrapper). It now uses `parseExpressionAt`. A derived check ("every number literal's offset points at text that parses back to its value") exposed it: the `2` in `radii.mapSlice(2)` on line 3 reported `1:24`.
- Adding `loc` to ten node kinds broke no test (152 files at the time), and no tracked program changed output.

Original entry:

> ISSUE-022: A method call on an array literal loses its error position

**Discovered:** 2026-09-19 (writing positioned-error tests for strict `mapSlice`; the messages were right and the `Line N, col M` prefix was missing)

**Severity:** Low

**Description:**

A `MethodCallExpression` takes its `loc` from its receiver (`src/parser/ast-builder.ts:2126`, `:2162`, `:2165` — `loc: (expr as { loc?: SourceLocation }).loc`), and `evaluateMethodCall` positions every `mError(...)` from that `loc`. An array **literal** node is built without a `loc`, so any error raised by a method called directly on one is unpositioned. Measured:

| Receiver | Error for `.slice('a')` |
|---|---|
| `[1, 2].slice('a')` | `slice() start must be a number` — **no position** |
| `arr.slice('a')` | `Line 1, col 27: slice() start must be a number` |
| `(1..3).slice('a')` | positioned |
| `(arr).slice('a')` | positioned |
| `arr.reverse().slice('a')` | positioned |
| `@{ h 10 }.offset('a')` | positioned |

So the gap is exactly "array literal as the receiver", and it affects every array method (`slice`, `map`, `filter`, `sort`, `mapSlice`, …), not one of them. It predates the `mapSlice` change.

**Impact:**

The error panel and CLI show the message with no line, and editors cannot place the squiggle. Rare in real programs (arrays are usually bound to a name first); common in one-line tests and docs snippets, which is how it stayed hidden — `tests/evaluator.test.ts` asserted array-method errors by message only.

**Current Workarounds:**

Bind the array to a variable before calling the method.

**Potential Solutions:**

1. Give the array-literal node a `loc` where the AST builder constructs it, like every other literal receiver. Mind the note at `ast-builder.ts:124` — nodes may share one `loc` object — and check the formatter and the language-services walkers, which read `loc`.
2. Fall back in `evaluateMethodCall`: when `expr.loc` is absent, walk to the nearest positioned ancestor or descendant (`getLineDeep` already does this for binary expressions).

**Recommended Long-term Solution:**

1, with a coverage-matrix test over receiver shapes × one representative method so a future literal kind cannot regress it (the table above is the matrix).

---

### ISSUE-021 (resolved 2026-09-15): Arc length ignored the sweep flags — any arc of a half circle or more reported its chord

**Discovered:** 2026-09-14 (path-query milestone 1: `call(circle).block.length` returned 100 for a radius-25 circle)

**Severity:** Medium

**Description:**

`approximateArcLength(rx, ry, start, end)` in `src/evaluator/sampling.ts` derives the arc angle from the chord alone (`2·asin(chord/2r)`) and never reads `largeArc` / `sweep`. Two consequences: an arc whose chord equals the diameter (a half circle) hits the `halfChord >= r` guard and returns the **chord** (`2r` instead of `πr`), and any `largeArc` arc reports the length of the *minor* arc. `circle()` emits two half-circle arcs, so:

```
let ring = @{ circle(0, 0, 25); };
log(ring.length);      // 100 — should be 157.08 (2πr)
```

`calculateCommandLength` receives the full command (all seven arc args) and could compute the exact length through `arcEndpointToCenter` (`|deltaAngle| · r` for circular arcs; numeric integration for elliptical ones).

**Impact:**

`PathBlock.length` / `ProjectedPath.length`, the new `Command.length` / `Segment.length` / `Call.block.length`, `[length…]` query filters, and any arc-length parametrisation that sums command lengths (`partition`, `get(t)`, `subPath(t0, t1)`, `dash`) are skewed on paths containing half-circle or large arcs. Quarter arcs (the common fillet case) are correct.

**Current Workarounds:**

Measure circles analytically (`2 * PI * r`); prefer arcs under 180° (two quarter arcs instead of one half arc) when `.length`-driven layout matters.

**Potential Solutions:**

1. Compute the exact arc length in `calculateCommandLength` via `arcEndpointToCenter` (circular: exact; elliptical: Simpson/Gauss over the parameter range). Pros: fixes every consumer at once. Cons: changes `partition`/`get(t)` sample positions on affected paths — published samples that place things along circles must be re-rendered and eyeballed.
2. Keep the approximation but honour `largeArc` (reflect the minor angle) and treat `halfChord ≈ r` as `π`. Pros: tiny diff. Cons: still approximate for ellipses.

**Recommended Long-term Solution:**

1, with a render-snapshot sweep of samples that use `partition`/`get` on arcs, in its own commit — deliberately not bundled into the query-language milestone (it would have silently moved geometry under an unrelated feature).

**Resolution (2026-09-15):** `calculateCommandLength` now routes arcs through `arcEndpointToCenter`: circular arcs are `|sweep| · r` exactly, elliptical arcs integrate the parametrization speed (Simpson, 64 slices). `approximateArcLength` is gone. `render-snapshots` and every published-sample suite were unchanged by the fix; `get(t)` / `partition` on paths mixing lines with half-circle or large arcs now weight the arc correctly (pinned in `tests/arc-length.test.ts`).

### ISSUE-016 (resolved 2026-09-12): The playground compile worker never cancels; edits during a long compile queue more full compiles

**Discovered:** 2026-09-09 (a 25-minute `Compiling…` on a heavy glyph-halo program)

**Severity:** Medium

**Description:**

`playground/services/compiler-worker.ts` posts each debounced compile to the same `Worker`. There is no `terminate()` on a newer compile (`terminateWorker()` is only called from `worker.onerror` and `disconnectedCallback`), no timeout in `sendRequest`, and the staleness check (`isStale(compilationId)`) runs in the `resolve` callback — **after** the worker has finished and the result has been structured-cloned to the main thread. Web Workers process messages serially, so every edit made while a long compile runs adds another full compile behind it, each of which is computed, cloned, and then discarded. The first compile of a Google Fonts family whose primary slice lacks the program's glyphs also runs the whole compile a second time (`resolveMissingGlyphSubsets`, up to 2 passes). The `Compiling… MM:SS` chip spans only the worker round-trip (`workspace-view.ts` `_compileTicker.start()` → `stop()` before `setLayersWithTiming`), so a long chip time is always the worker, never the DOM.

**Impact:**

A runaway program pins the tab with no cancellation path; the user's natural reaction (editing the program to make it lighter) makes the wait longer. The only escape is reloading the tab. On the main thread, a large result is then copied four times (store, preview DOM, minimap `d` copies, idle export-size `cloneNode` + serialize) with no size threshold, and `getBBox()` is forced once per path.

**Current Workarounds:**

Do not edit while a heavy compile is running; reload the tab to abort; iterate on heavy programs via the CLI (`npx tsx src/cli.ts - --print-logs < file`), where Node's heap is also raisable (`--max-old-space-size`), unlike Chrome's (pointer-compression cage, ~3.6 GB ceiling regardless of `--js-flags`, measured 2026-09-10).

**Potential Solutions:**

1. **Terminate and respawn the worker when a newer compile starts** (fonts are re-sent per request already, so respawn cost is the worker script load). Stale work stops immediately instead of after completion.
2. **Watchdog**: terminate + surface an error after N seconds (configurable), with a "keep waiting" affordance.
3. **Check staleness in the worker** before `postMessage` (send the latest compilationId to the worker via a side channel) to skip the clone of a stale result.
4. Main-thread mitigations: skip the minimap copy / export-size estimate above a byte threshold; drop the per-path `getBBox()` loop or cap it.

**Recommended Long-term Solution:**

Option 1 now (small change, largest effect), option 2 as the safety net, option 4 as a separate pass.

---

### ISSUE-017 (resolved 2026-09-12): Conic gradient `innerRadius` and `spread` are honoured only on the WebGPU path

**Discovered:** 2026-09-09 (three-surface check of a `ConicGradient` with `innerRadius` and `spread: 'transparent'`), pre-existing

**Severity:** Medium

**Description:**

- CLI / VS Code wedge renderer: `src/render/build-defs.ts` calls `renderConicToWedges(...)` without `innerRadius` (no parameter exists), and `src/conic-renderer.ts` receives `spread` as `_spread` and never reads it. `'clamp'`, `'repeat'` and `'transparent'` produce byte-identical output; the apparent transparency outside the sweep is incidental (no wedge is drawn there).
- Playground Canvas 2D fallback (`playground/gpu/gradient-service.ts` `renderConicCanvas2D`): "innerRadius is NOT supported in Canvas 2D (silently ignored)"; `spread` is not applied either.
- Related, same area: `webgpu-device.ts` calls `requestDevice()` with no `requiredLimits`, so `maxTextureDimension2D` is the spec default 8192 even on adapters that allow 16384 (a 22200×14800 viewBox rasterizes at 8192×5461, 0.37 px per unit). The texture-cache key hashes the **pre-clamp** size, so the GPU and Canvas paths store different-resolution rasters under one key. `playground/utils/decorate-conic-gradients.ts` (last-resort path) has no `clampScale` and would attempt `viewBox × 2` (1.3 Gpx for that viewBox). `docs/gradients.md` "Rendering" still says the playground uses Canvas 2D and omits WebGPU; the raster resolution formula and caps are undocumented; no test pins the formula or the 1°/wedge count.

**Update 2026-09-12 — silent blank render above viewBox width 32768.** `clampScale()` (`gradient-service.ts:100-108`) floors the reduced scale at 0.25 "to avoid degenerate textures", so for `ViewBox(0, 0, 48000, 18600)` it computes 8192/48000 = 0.17, floors it to 0.25, and asks for a 12000×4650 texture — over the 8192 cap it just applied. Dawn rejects it (`Texture size … exceeded maximum texture size`, `Could not create the swapchain texture`, `IOSurface width (12000) exceeds maxTextureDimension2D (8192)`, then a cascade of `[Invalid Texture] is invalid due to a previous error`), but these are **uncaptured validation errors**: nothing throws, `renderConicWebGPU` continues on the invalid texture, `toDataURL` reads back a transparent PNG, the `catch` → `renderConicCanvas2D` fallback never fires, and the blank data URL is **cached** under the gradient's key. The user sees the gradient-filled layers as transparent (only their strokes) with no error in the Pathogen console. Any viewBox whose long edge exceeds 32768 units hits this; 22200 did not. Evidence: `project-docs/glyph-halo-diagnosis/` (Noto Sans Takri workspace, 2026-09-12 console).

**Impact:**

Violates three-surface parity: a wheel with `innerRadius = 1000` and `spread = 'transparent'` renders as designed in Chrome's playground and differently from the CLI, PDF export, VS Code preview and non-WebGPU browsers, with no warning. Above 32768 units of viewBox it does not render in the playground either (see update). Companion to ISSUE-009 (topo/mesh/freeform rasterize only in the playground).

**Current Workarounds:**

Preview in a WebGPU-capable browser; treat CLI/VS Code conic output as approximate.

**Potential Solutions:**

1. Pass `innerRadius` and honour `spread` in `renderConicToWedges` (inner radius = wedges become annular sectors; `repeat` = tile the stop list over the full circle; `transparent` = current behaviour, made explicit).
2. Implement `innerRadius` in the Canvas 2D fallback via a destination-out disc.
3. Request `maxTextureDimension2D` up to the adapter limit in `requestDevice`; hash the post-clamp size; add `clampScale` to the decorator.
5. **Fix the clamp and make failure visible** (small, unblocks the 48000-wide case): drop the 0.25 floor in `clampScale` (or cap it at `maxDim / max(w, h)`), wrap each WebGPU render in `device.pushErrorScope('validation')` / `popErrorScope()` and throw on error so the Canvas 2D fallback actually runs and a blank result is never cached, and surface a Pathogen-console warning when a gradient falls back or fails.
4. Document resolution + caps in `docs/gradients.md`; pin wedge count and raster formula with tests.

**Recommended Long-term Solution:**

5 immediately (it is a regression for any large viewBox), then 1 + 4 (parity and honesty), then 2 and 3.

---

### ISSUE-020 (resolved 2026-09-12): `normal(t).angle` is the tangent minus a quarter turn, unwrapped (−1.5π … 0.5π); `switch` ranges above 0.5π never match

**Discovered:** 2026-09-11 (a halo builder's `case 1.2pi..<1.8pi` on `normal.angle` was dead code)

**Severity:** Low

**Description:**

`tangent(t).angle` is an `atan2` value in [−π, π]. `normal(t).angle` is computed as `result.tangent - Math.PI / 2` with no re-wrap (`src/evaluator/index.ts:2687` and `:3392`), so it spans (−1.5π, 0.5π]: right = 0, down = 0.5π, **left = −π, up = −0.5π, bottom-left = −1.25π** (measured 2026-09-12 on arcs, quadratics and lines, both windings; `project-docs/glyph-halo-diagnosis/probes/angle-convention-and-winding.pathogen`). Only the lower-right quarter turn comes back positive. Users who assume `0..2pi` write `case 1.2pi..<1.8pi { … }` and the arm silently never fires; users who assume the atan2 range are also surprised in the lower-left quadrant. `docs/path-blocks.md` does not state either range. Circular-distance helpers that fold with `((a - b) % TAU() + TAU()) % TAU()` and periodic formulas (`cos(a - light)`) are unaffected; plain range comparisons are. Diagram: `project-docs/glyph-halo-diagnosis/normal-angle-and-winding.pathogen` (bbwp `2026-09-12-07:44:13--glyph-halo-diagnosis--normal-angle-and-winding`).

**Impact:**

Silent design bugs (no flare, no lighting weighting) that look like tuning problems.

**Current Workarounds:**

Fold first (`let a = ((n.angle % TAU()) + TAU()) % TAU();`) or use the negative range (`case -0.8pi..<-0.2pi`); prefer periodic formulas (`cos(a - light)`) for weighting.

**Potential Solutions:**

1. Wrap the normal angle into the same [−π, π] range as the tangent at both derivation sites (one `atan2(sin, cos)` or a fold), and document the range beside `normal(t)` / `tangent(t)` in `docs/path-blocks.md`, with the y-down orientation table (0 = right, 0.5π = down, ±π = left, −0.5π = up).
2. Diagnostic: a `switch` on a value known to be an angle with a numeric range arm entirely outside [−π, π] could warn "this arm can never match an angle".
3. Optional `.angle` normalization helper in the stdlib (`wrapAngle(a)` → [0, 2π)).

**Recommended Long-term Solution:**

1 now (the wrap is a one-line consistency fix plus a doc line; it changes raw values only in the lower-left quadrant); 3 if it comes up again; 2 only if the angle type carries through to `switch` cheaply.

---

## Fixed during the easing work (2026-09-03)

Logged for the trail; all pinned by tests.

| Bug | Fix |
|-----|-----|
| A quoted string inside `calc()` in a bare path command failed to parse (`M calc(ease('sine-in', t)) 0` → `Missing ';'`); the greedy path-args tokenizer stopped at a quote and the AST builder's paren/bracket/comma scanners ignored quotes. Also affected `squareGrid('shape', …)` and `Color('#fff')` in that position. | `ed4e1c2` (`src/parser/path-args-tokenizer.ts`, `src/parser/ast-builder.ts` `skipQuoted`) |
| The formatter dropped the parentheses in `a * (b % c)`, which the left-associative grammar reads as `(a * b) % c` and which changes the value. | `5c0e258` (`src/language-services/formatter.ts`) |
| A message thrown inside a stdlib function surfaced without its call position. | `2296107` (both evaluators wrap the stdlib call) |
| The Canvas-fallback `getEasingFn` in `gradient-service.ts` did not clamp its input while both WGSL copies did, so GPU and Canvas renders could differ for out-of-range elevations. | `ed4e1c2` (shared table; input and output clamped in all four renderers) |
| `docs/syntax.md` listed 8 of the 23 built-in enums. | `ed4e1c2` |
| `TopoGradient.easing` hover/completion text listed five values after the enum grew to 26. | `ed4e1c2` (see ISSUE-010 for the missing guard) |
| `cubicBezier`'s Newton iteration could step far outside `[0, 1]` beside a flat point before the bisection fallback recovered; correct but fragile. | `2296107` (leave-the-interval check; bisection runs to bracket exhaustion) |

---

## Template for New Issues

```markdown
## ISSUE-XXX: Brief title

**Discovered:** YYYY-MM-DD (context)

**Severity:** Low | Medium | High | Critical

**Description:**

What is the issue? Include code examples.

**Impact:**

How does this affect users or the codebase?

**Current Workarounds:**

What can users do today?

**Potential Solutions:**

Numbered list of approaches with pros/cons.

**Recommended Long-term Solution:**

Which solution do we prefer and why?
```
