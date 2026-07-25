# Style-Block Structure — Primer

Companion to [PLAN.md](PLAN.md). Records the load-bearing facts and boundary
rules the implementation must respect.

## Parser identities

```
src/parser/index.ts
 ├─ lezerParser (unwrapped)          → parseLezer() → compiler AST (ast-builder)
 │                                    → LSP (via language-services functions)
 └─ editorParser (NEW)               → CodeMirror in playground
      = lezerParser.configure({        (pathogen-language.ts, detail-source-mount.ts)
          wrap: parseMixed(node =>
            node.name === 'StyleContent'
              ? { parser: styleParser } : null)
        })
```

- The compiler **never** sees mounted inner trees — `buildStyleBlockLiteral`'s
  cursor walk is untouched.
- `.configure()` shares LR tables; the wrap costs nothing at rest.
- `StyleContent` stays an opaque `@tokens` token in `pathogen.grammar`.
  Two verified dead ends (do NOT re-attempt without new information):
  - `@external tokens` → collapses contextual token groups 5→4, breaks all
    template literals.
  - LALR structuring of the block → `${` state-merge with template
    interpolation, silent breakage.

## Inner grammar boundary rules (parity contract)

The inner `style.grammar` must agree with `parseStyleDeclarations`
(`src/parser/ast-builder.ts:1922-2051`) on where declarations begin and end:

| Rule | Behavior |
|---|---|
| Declaration end | top-level `;`, bare newline (depth 0), or `//` comment start |
| Depth tracking | `(` `)` `[` `]` nesting; newlines inside parens do not terminate |
| Double-quoted strings | may contain `;` `}` newlines-not (same-line) |
| Single-quoted strings | never cross `}` or newline |
| Backtick templates | `${expr}` interpolation nests one brace level |
| Comments | `//` to end of line, only at value boundaries |
| Incomplete blocks | must still yield useful partial trees (mid-typing resilience) |

The **parity corpus test** is the acceptance gate: for each corpus block, inner
`StyleDeclaration` name/value ranges must match `parseStyleDeclarations` output
(using the new `StyleProperty.valueLoc`/`valueEnd` offsets).

## Comma policy (compile error)

User decision 2026-07-25: comma-separated filter-function arguments are a
**positioned compile-time error**, not normalized.

| Context | Commas | Why |
|---|---|---|
| 10 CSS filter functions (`blur` … `sepia`, incl. `drop-shadow`) | **error** | CSS grammar is space-separated; browsers silently drop the declaration |
| `filter` property top level (`blur(2px), brightness(1)`) | **error** | filter chains are space-separated in CSS |
| `rgba`, `color-mix`, `cubic-bezier`, `polygon`, `translate`/transform family, `font-family` lists | allowed | CSS grammar genuinely uses commas |

Error texts:
- `drop-shadow() uses space-separated CSS syntax: drop-shadow(4px 4px 4px color) — remove the commas`
- generic: `<fn>() takes a single value — commas are not allowed`
- chain: `filter chains are space-separated: blur(2px) brightness(1.2)`

Root cause of the original bug: `isAllowedToken`'s comma branch
(`sanitize.ts:367-370`, built for `font-family` fallbacks) accepted `4px,`,
so `drop-shadow(4px, 4px, 4px, #f00)` validated and emitted invalid CSS.

## Discovered drift (fixed in this project)

- `annotated.ts` `evaluateStyleBlockLiteral` never called
  `tryResolveCSSFunctionArgs` — colors inside CSS function args were left
  unresolved in the Annotated pane. Fixed by extracting the resolver to
  `src/evaluator/css-function-resolve.ts`, parameterized by an eval callback.

## Deferred follow-ups

- **Scope-aware named-color chip exclusion**: a variable literally named after
  a CSS color (`let tomato = ...; stroke: tomato;`) still gets a chip — the
  chip scanner sees only tree + text. Fix requires threading declared-name
  info (e.g. from analyzeScopes) into `findColorRanges`. Documented by the
  KNOWN LIMITATION test in tests/cm-color-picker.test.ts.

- `cm-textlayer-editor.ts` still regex-parses style blocks (safe: it slices the
  outer node, never descends).
- `color(...)` is not in the outer `CSSColorLiteral` token
  (`pathogen.grammar:389-392`) — adding it triggers the regen + keyof
  hand-patch cycle; inner grammar covers it inside style blocks only.
- TextMate style-block scopes in `packages/vscode-pathogen` stay regex-based
  (TextMate cannot consume the Lezer inner grammar).
- Completion context detection stays string-scan based (shared with LSP);
  the inner tree powers chips + highlighting only, for now.
