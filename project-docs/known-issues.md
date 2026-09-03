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
