# Style-Block Structure — STATUS (2026-07-25)

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
- TextMate style-block scopes (VS Code highlighting stays regex-based)
- Interpolation as a distinct inner-grammar node (Template is one token in v1)
