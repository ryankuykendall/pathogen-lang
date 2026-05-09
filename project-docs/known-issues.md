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
