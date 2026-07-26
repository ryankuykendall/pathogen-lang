# Style-Block Structure — STATUS (2026-07-25)

## PLAN-2 (scope awareness) — shipped same day

Follow-ups #1 and #2 from the highlighting notes, per [PLAN-2.md](PLAN-2.md):

- **Foundation**: `scope-analysis.ts` emits references inside style-block
  values (full-width ranges, `Reference.inStyleValue`; inner-styleParser wrap
  + template-interp expression parsing). Fixes rename/find-references/VS Code
  semantic tokens in style values — previously silently skipped.
- **Inner grammar**: `.` token + `Member` rule in both skip scopes
  (`@precedence { call, member }` — member-first made arg-scope tails reduce
  before shifting into calls; call must bind tighter).
- **Playground**: `cm-style-ref-recolor.ts` (resolved refs → variable color,
  baseTheme &dark coral / &light inherit) + scope-aware chip exclusion, both
  fed by the `scope-cache.ts` size-1 memo. KNOWN LIMITATION test inverted.
- Verified: 4034 tests; `verify-plan2.mjs` headless both themes (resolved refs
  coral/default, unresolved stay value-colored, declared-tomato chip gone,
  undeclared-salmon chip stays, member values error-free).
- Recorded quirk (not fixed): `lezer-expression.ts:110` adjustLocs `.offset`
  math is wrong on multi-line docs — consumers must use line/column only.
- **Post-ship fix (2026-07-26)**: the recolor was visually inert everywhere —
  CodeMirror nests the syntax-highlight span INSIDE the mark span, so the
  baseTheme rule on `.cm-style-var-ref` colored the wrapper while the inner
  `ͼx` span kept painting whiskey. Every computed-style measurement (mine,
  headless, and the in-tab console probes) hit the wrapper and reported
  coral — a systematic false positive; Ryan's side-by-side color-literal
  swatches (`let myCoral = rgb(224,108,117); let orangish = #d19a66;`) were
  the instrument that exposed it. Fix: descendant rules
  (`.cm-style-var-ref span`). LESSON for all CM decoration work: measure the
  DEEPEST span (the painted element), never the mark wrapper — see
  recolor-fixed.png and diagnose-spans.mjs.
- Review follow-ups recorded, not blocking: consolidate the three
  zero-vs-full-width range helpers (navigation/rename/semantic-tokens) if a
  fourth consumer appears; `code-lens.ts` has no test file at all
  (pre-existing gap — its reference counts now include style-value refs,
  intended but unverifiable without tests); unquoted dotted paths inside
  `url(...)` can emit a false-positive Member-head reference mid-edit
  (syntax the language doesn't support; sanitizer rejects external urls).

## Original project (PLAN.md)

All seven phases of [PLAN.md](PLAN.md) shipped in one session. See
[primer.md](primer.md) for the design constraints and comma policy.

## What shipped

| Phase | Deliverable | Result |
|---|---|---|
| 0/1 | Docs-first: `docs/syntax.md` CSS Function Values section, `docs/filters.md` callout | published; `check-links` clean |
| 2 | `StyleProperty.nameEnd/valueLoc/valueEnd` | offsets emitted at the ast-builder push site |
| 3 | Comma-form filter functions → positioned error | both evaluators via new `css-function-resolve.ts`; annotated drift fixed; negative controls for every comma-taking family |
| 4 | Completion data + filter value completions | 7 new properties; snippets derived from exported `CSS_FILTER_FUNCTION_NAMES`; typed-variable ranking; coverage-matrix test |
| 5 | `style.grammar` inner parser + `editorParser` (parseMixed) | parity corpus + outer-tree invariance tests green; `generate:style-parser` script |
| 6 | Tree-based color chips | chips anywhere in any value incl. inside `drop-shadow()`; named-color whole-value rule; regex fallback kept |
| 7 | Verification | 3995 tests / 99 files green; `check:completions` clean; CLI + annotated + playground (puppeteer) verified |

## Surface verification evidence

- **CLI**: comma form → `Line 3, col 47: drop-shadow() uses space-separated CSS
  syntax…`; space form emits `filter="drop-shadow(4px 4px 4px #ff1994)"`
  (variable resolved). `--annotated` shows the identical error.
- **Playground** (verify-playground*.mjs, headless): chip on `#c00` inside
  `drop-shadow(...)`; `4px` tokens + `filter` property name get real highlight
  classes inside `${ }`; `filter: dro` → single `drop-shadow` snippet
  completion which inserts space-separated placeholders; comma program shows
  `Line 2:11 — drop-shadow() uses space-separated CSS syntax…` in the error
  panel; template values still parse (no interpolation regression).
- **VS Code/LSP**: `packages/pathogen-language-server` typechecks against the
  fresh `dist/index.d.ts`; completions flow through shared `getCompletions`.

## Deferred (recorded in primer.md)

- `cm-textlayer-editor.ts` regex parse (safe — outer-node slicing only)
- `color(...)` in the outer `CSSColorLiteral` token (regen + keyof hand-patch cycle)
- TextMate style-block scopes (VS Code highlighting stays regex-based; already
  scopes property names via `support.type.property-name`) + LSP
  `textDocument/documentColor` for native VS Code color chips
- Interpolation as a distinct inner-grammar node (Template is one token in v1)
- Highlighting follow-ups from Ryan's 2026-07-25 review (primer.md
  "Highlighting notes"): scope-aware recolor of variable refs in style values
  (via semantic tokens), `.` token / MemberExpression in the inner grammar,
  and the (by-design) `.apply`-keyword-vs-method-color question
