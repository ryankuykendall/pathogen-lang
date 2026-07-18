# Compiler Regex-Reliance Remediation — Multi-Phase Plan (Phases 0–5)

## Context

An audit of `src/` (triggered by the `parseColor` regex ladder in `src/color.ts`) found ~30 regexes parsing grammar-shaped content. Stack-ranked findings:

1. **Path d-string serialize→reparse round-trip** (core evaluator; three diverging duplicate tokenizers; silent data-corruption modes; thin direct tests)
2. **Regex-based SVG sanitizer** (`svg-sanitize.ts`; security-sensitive; classic markup-by-regex bypass surface)
3. **`parseColor` regex ladder** (9 hand-rolled CSS color grammars; not atomically testable)
4. **Style-block raw blob** (grammar treats `${…}` body as one opaque token, regex-scraped in ast-builder, silent `catch{}` fallback in evaluator)
5. **Non-nesting `fn(args)` splitters** (4 sites with `[^)]*` / greedy `(.+)` captures)
6. **Language-services regex probes** duplicating the AST/scope-analysis + self-string round-trips (diagnostic messages, signature detail strings)

Key architectural nuance: `Color("rgb(...)")` accepts runtime strings, so a string-level color parser must exist regardless of grammar work — the fix is a tokenizer with atomic testable readers, with grammar structuring optional/deferred.

This plan executes all six phases in order (0→4, with 5 interleavable after 0). Each phase is independently shippable, one PR per phase.

**First deliverable:** persist the full audit (file:line inventory + this roadmap) as `project-docs/regex-audit/audit-2026-07-18.md`.

**Verified ground truth** (from code inspection):
- Grammar regen (allow-listed in `.claude/settings.local.json`): `npx @lezer/generator src/parser/pathogen.grammar --typeScript -o src/parser/pathogen.generated.ts`
- **keyof patch trap**: after every regen, manually re-apply on the `specialized:` line: `get: (value: keyof typeof spec_Identifier) => spec_Identifier[value] || -1` (generator emits untyped `(value)`; strict DTS build fails — precedent commit `3fea81b`)
- `tests/segments.test.ts` already exists (4 direct `parsePathStringToCommands` tests) — extend, don't create
- `index.ts:7832` `parseAndTrackPathString` already delegates to `segments.ts`; only `annotated.ts:726` still has the weak inline regex (no exponent support)
- The two `commandsToRelativeD` duplicates diverge materially: `index.ts:1226` is cursor-aware across `z`, supports `bridgeOriginGap`, formats via `formatNum`; `annotated.ts:574` uses naive `toFixed(4)`, no `z` correction (plus inline `fmt` copies at annotated.ts:1841, 1921)
- `annotated.ts` already imports from `segments.ts` → no circular-dep hazard for a shared module
- `index.ts:1464` `splitCSSArgs` is a near-duplicate of `sanitize.ts:323` `splitTopLevel`
- All phases are internal refactors — **no `docs/` pages required** (exceptions noted in Phases 2/3)

---

## Phase 0 — Characterization tests (safety net first) — Size S/M

**Files:** extend `tests/segments.test.ts`; new `tests/path-roundtrip.test.ts`; new `tests/color-conformance.test.ts`. Also write `project-docs/regex-audit/audit-2026-07-18.md`.

1. **`tests/segments.test.ts` additions** (number-grammar edges): implicit-decimal `M 1.5.5 2` → assert correct SVG semantics `[1.5, 0.5, 2]` via `it.fails(...)` (current `NUMBER_REGEX` drops `.5`; Phase 1 flips to `it`); negative-as-separator `L10-5` → `[10,-5]` (lock current-correct); packed `M10,20L30,40`, `h.5`, `l-.5-.5`; exponents `1e-2`/`1E+3`; missing-args tolerance `M 10 20 Q` (characterize).
2. **`tests/path-roundtrip.test.ts`** — black-box `compile()`/`compileAnnotated()` coverage of the private round-trip pipeline: `p.draw()` after cursor move (emitted `d` + `ctx.position` via `log()`); `drawTo()` on PathBlock and ProjectedPath (`index.ts:3175` site); `bridgeOriginGap` (fillet-shifted closed path — template at `tests/variable-offset.test.ts:412`); `z`-then-`m` cursor semantics (the exact divergence between duplicates); same programs through `compileAnnotated` to lock its `toFixed(4)` formatting.
3. **`tests/color-conformance.test.ts`** — first direct `import { parseColor } from '../src/color'` tests: table-driven `ACCEPT` rows (`[input, {L,C,H,alpha}]`, `toBeCloseTo`) covering all 9 functions × modern/legacy × alpha forms × percents — must pin scalings (`oklch(50% 100% 200)` → `L:0.5, C:0.4`; `lab(50% …)` percent *ignored*; the picker shape `oklch(62.8% 25.77% 29.23)`); `REJECT` rows locking current throws (`deg` units, `none`, `1e2`, negative hue, `hwb` commas, `color(display-p3 …)`), each annotated CSS-L4-gap vs. genuinely-invalid.

**Gate:** targeted vitest files green (except deliberate `it.fails`), then `npm run test:run`. Risk ≈ zero (test-only).

---

## Phase 1 — Kill the path serialize→reparse round-trip — Size L

**Files:** new `src/evaluator/path-data.ts`; modify `src/evaluator/segments.ts` (move tokenizer out, re-export), `src/evaluator/index.ts` (delete `commandsToRelativeD` at 1226, rewire draw/drawTo), `src/evaluator/annotated.ts` (delete duplicates at 574/726/5774); new `tests/path-data.test.ts`; flip Phase 0 `it.fails`.

**Module API** (`path-data.ts`; imports only `context.ts`, `format.ts`, `types.ts` → acyclic):

```ts
export function tokenizePathData(d: string): RawPathCommand[];         // cursor scanner: exponents, implicit decimals, sign-separator, packed
export function parsePathStringToCommands(d, ctx): PathBlockCommand[]; // moved from segments.ts:337
export function parsePathStringAt(d, startPos, subpathStart?): PathBlockCommand[];
export function commandsToRelativeD(commands, opts?: { bridgeOriginGap?; format? }): string; // adopts index.ts impl (cursor-aware across z)
export function serializeRelativeAndTrack(commands, ctx, opts?): { d: string; tracked: PathBlockCommand[] };
export function splitPathCommands(d): { command; argsText }[];         // display-only, for annotated emitPathString
```

`serializeRelativeAndTrack` is the round-trip killer: one walk that serializes AND feeds `updateContextForCommand` — critically it parses back the **formatted** numbers before tracking so `ctx.position` stays bit-identical to the old serialize→regex-reparse pipeline (avoids ε drift + snapshot churn).

**Call-site conversions:**
- `index.ts:2420` (draw): `serializeRelativeAndTrack(obj.commands, ctx, { bridgeOriginGap: true })` + `updateCtxVariable(scope)`
- `index.ts:2453` (drawTo): same + `moveTo: {x,y}`; `index.ts:3175` (ProjectedPath.drawTo): `moveTo` only, no bridge
- **Keep** `parseAndTrackPathString` at true string boundaries (`index.ts:7183,7588,7652,7746`, `annotated.ts:929,992,1085`) — now on the shared exponent-correct tokenizer; `index.ts:7803` keeps `parsePathStringAt`
- `annotated.ts:1812/1843/1923`: convert to `serializeRelativeAndTrack` passing legacy `toFixed(4)` via `opts.format` in the first commit (byte parity); optional follow-up sub-commit converges on `formatNum` (deliberate, reviewed)

**Deliberate fixes to call out:** implicit-decimal silent data drop; annotated exponent handling; possibly annotated `z`-cursor bug (Phase 0 test will reveal).

**Gate:** `tests/path-data.test.ts` (tokenizer atoms + property check: reparse-of-serialize end positions ≡ input); full suite; **`tests/render-snapshots.test.ts` must pass WITHOUT `--update`** (any diff = stop and review); CLI visual verify on a representative `.pathogen`; `npm run build`.

---

## Phase 2 — Security rewrite of `svg-sanitize.ts` — Size M

**Files:** rewrite `src/evaluator/svg-sanitize.ts` internals (**exports unchanged**: `sanitizeSVGFragment(input): SanitizeResult`); extend `tests/security/fragment-sanitizer.test.ts`.

**Design:** single-pass cursor tokenizer (`tokenizeSVG(input): SvgToken[]`, throws on structural violations): quote-aware attribute scanning (fixes `>`-in-quoted-attr truncation bypass), per-attribute `on*`/`style` checks (authoritative; keep the whole-input quick-reject regexes for message compat), **reject** comments/CDATA/DOCTYPE/PIs/unterminated tags (today silently skipped — the smuggling surface), port `BLOCKED_ELEMENTS` + `validateHrefValue` + balance checks onto tokens, and derive `defsContent`/`visualContent` from depth-tracked byte ranges instead of the `defsRe` regex.

**Adversarial tests:** `<rect title="a>b" onclick="x"/>`; blocked element inside comment; CDATA smuggle; unquoted attr value; `on\nclick` split-name; `<defs id="x">`; `</defs>` inside attr value; mixed-case `<ScRiPt>`; `href=" javascript:…"`; unterminated quote/tag at EOF; stray `<` in text content (behavior change — verify).

**Risk:** strictness may reject previously-compiling fragments (e.g. comments in pasted SVG). Before choosing reject-vs-strip for comments, grep `examples/`/`tests/fixtures/` for `SVGDocumentFragment` usage; if real usage exists, *strip* comments instead (never tokenize inside them). If user-visible strictness lands, add a note to `docs/` security page. Run `/security-review` after landing.

---

## Phase 3 — Tokenizer-based `parseColor` — Size M

**Files:** new `src/color-parse.ts` (pure lexer, no `color.ts` import); modify `src/color.ts` (replace regex ladder at 467-570 with dispatch on `parseColorFunction`; keep named/hex branches, all conversion math, and **the public `parseColor(input): OKLCH` signature** — zero churn at the 6 call sites); new `tests/color-parse.test.ts`.

**Design:** `parseColorFunction(input): ParsedColorFunction | null` returning `{ fn, comps: [c,c,c], alpha?, legacy }` where each component is `{ value, percent }`. Atomic exported readers: `readNumber` (sign per-function, digits, single dot, optional `%` — no exponent, matching current behavior), `readSeparator`, `readAlphaClause`. A per-function acceptance table encodes exactly what today's regexes accept (signs, required-`%` slots, legacy-comma availability, `lab`/`lch` percent-tolerated-and-ignored, no-`%`-alpha quirks). `color.ts` keeps the existing scaling helpers (`/100`, `/250` i.e. chroma 100%→0.4, `/255`) applied to components.

**Strict-compat first:** Phase 0 conformance tables must pass byte-identical — the picker round-trip invariant (`hdr-color-input` emits `oklch(L% C% H)`) is a pinned row. CSS-L4 extensions (`none`, exponents, `deg`/`turn`) are **explicitly deferred** to a separate follow-up PR because they're user-facing → docs-first + agentic review.

**Gate:** `tests/color-parse.test.ts` atoms + per-function matrices; `tests/color-conformance.test.ts` unchanged-green; `tests/color.test.ts` (136 cases); picker tests (`tests/cm-color-picker.test.ts`, `tests/playground-color-util.test.ts`); full suite.

---

## Phase 4 — Grammar: real style-declaration nodes — Size L (do last)

**Files:** `src/parser/pathogen.grammar` (restructure `StyleBlockLiteral`, remove `StyleContent` token + its precedence entry at 429); **new** `src/parser/style-tokenizer.ts` (external tokenizer, modeled on `path-args-tokenizer.ts`); regenerated `pathogen.generated.ts`/`.terms.ts` **+ manual keyof patch**; `src/parser/ast-builder.ts` (rewrite `buildStyleBlockLiteral` 1851-1871 as tree walk, delete scrape + comment-strip regexes); `src/parser/ast.ts` (`StyleProperty` gains `loc?`/`valueLoc?`); `src/parser/highlight.ts` (`StylePropertyName: t.propertyName`, `StyleValue: t.special(t.string)` replacing `StyleContent` at 54).

**Grammar:**
```lezer
StyleBlockLiteral { styleBlockOpen StyleDeclaration* "}" }
StyleDeclaration { StylePropertyName ":" StyleValue ";" }
@external tokens styleTokenizer from "./style-tokenizer" { StylePropertyName, StyleValue }
```
External tokenizer (not `@tokens`) because `StylePropertyName` needs `-` (collides with global `Identifier`/minus) and `StyleValue` is contextual "until top-level `;`" — Lezer confines external tokens to shifting states, so they're scoped to style blocks by construction (precedent: `PathArgs`). Value scanning is paren-depth + quote aware. `@skip` handles `//` comments inside blocks. `LayerConstructor`'s `~layerStyle` marker unaffected.

**Explicit behavior change:** missing-`;` declarations were silently dropped by the scrape regex; they become recoverable, localized parse errors (grep `examples/` + tests for reliance first). Evaluator `evaluateStyleBlockLiteral` (index.ts:1344) untouched — values stay strings through the existing trusted/untrusted logic; structuring *values* as expressions is out of scope (CSS token soup isn't a Pathogen expression).

**CSSColorLiteral interior structuring: explicitly deferred.** Compile-time color diagnostics are achievable with zero grammar risk by running Phase 3's `parseColorFunction` over `CSSColorLiteral` node text in `diagnostics.ts` (fast-follow). Note the `ast-builder.ts:1390` wrinkle (`Color.oklch(...)` tokenizes as CSSColorLiteral after `.`).

**Regen procedure:** (1) run the generator command above; (2) re-apply the keyof patch; (3) confirm `.terms.ts` exports the new terms; (4) `npm run build` (catches DTS trap) → three-surface verify: full suite, playground smoke (style highlighting, completions in `${…}`), VS Code TextMate parity is optional (independent regex grammar).

**Tests:** `tests/parser.test.ts` (declaration nodes + positions, interleaved comments, missing-`;` recovery, hyphenated names, function values); `tests/language-services/ast-builder.test.ts` (loc/valueLoc); `tests/layers.test.ts`/`evaluator.test.ts` unchanged; `diagnostics.test.ts` localized-error case. Land as one atomic PR (grammar + regen + builder + highlight must move together); rollback = revert the PR.

---

## Phase 5 — Shared utilities + language-services migration — Size M, incremental

Interleavable any time after Phase 0; one commit per bullet, each independently revertible.

**5a. New `src/css-value-utils.ts`:** `splitTopLevel(value, sep?)` (paren+quote aware) and `matchFunctionNotation(value): {name, args} | null` (balanced). Adopters: `sanitize.ts` (delete local `splitTopLevel` at 323, swap fn-notation regex at 360; anchored `var()` checks at 306/311 may stay, documented), `index.ts` (delete `splitCSSArgs` at 1464, swap `tryResolveCSSFunctionArgs` regex at 1488), `ast-builder.ts:1393` (fixes nested-paren args). New `tests/css-value-utils.test.ts`.

**5b. Language-services (priority order):**
1. **Structured diagnostics**: add `code?`/`data?` to `Diagnostic` (`types.ts`); `code-actions.ts:48` matches `diag.code === 'undefined-variable'` instead of message regex; introduce `PathogenError extends Error {line?, column?}` so `diagnostics.ts:58,69` reads fields structurally (regex kept as fallback).
2. **`inlay-hints.ts:38-42`**: derive params from structured `SIGNATURE_DATA`, not detail-string regex.
3. **`type-inference.ts`**: tree-first path — extend `scope-analysis.ts` `Declaration` with `initializer?: {from, to, nodeName}`; `inferTypeFromTree()` switches on initializer node type; regex ladder stays as fallback; migrate rule-by-rule with `hover`/`completion` tests green.
4. **`completion.ts:449-480`**: object-literal member recovery via the same declaration-initializer lookup.
5. **`semantic-tokens.ts:230`** + **`rename.ts:162`**: Lezer tree queries replace line-regex scans (lowest priority — cosmetic failure mode).

---

## PR / commit structure

One PR per phase, ordered 0→1→2→3→4; 5a/5b interleave. Phase 1 sub-commits: (1) additive module + tests, (2) index.ts rewiring, (3) annotated.ts adoption/deletion, (4, optional) formatting convergence. Phase 2: failing adversarial tests first, then the fix. Phase 3: additive module, then dispatch swap. Regenerated grammar files isolated in their own commit hunk for review.

## Verification (uniform gates)

Targeted vitest files → `npm run test:run` → `npm run build` (mandatory after `src/` changes; catches the DTS/keyof trap) → CLI visual verify via `--output-svg-file` (Phases 1–2) → playground smoke via `npm run build`/`npm run dev:website` (Phase 4) → snapshot policy: `render-snapshots.test.ts` passes without `--update`; deliberate updates are their own reviewed commit. Run `@code-reviewer` before each phase's commit (per repo lifecycle) and `/security-review` after Phase 2.
