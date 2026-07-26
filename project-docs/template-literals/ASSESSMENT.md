# Template Literals × parseMixed — Assessment (2026-07-26)

Question (Ryan, following the style-block parseMixed project): would template
literals (backticks + `${...}`) gain stability/robustness/extensibility/
disambiguation from extraction into a separate parseMixed-mounted parser?

**Verdict: no — the premise inverts for templates. Extraction would subtract
structure. The real defect was in the AST builder, fixed in this project.**

## Why the style-block precedent does not transfer

| | StyleContent (before parseMixed) | TemplateLiteral (today) |
|---|---|---|
| Grammar shape | opaque leaf token, zero children | composite node; `TemplateInterpolation` children hold **real expression subtrees** parsed inline by the main LALR grammar |
| Hard cases | none parsed at all | verified correct in CST: `` `${ f("}") }` `` (`}` inside string arg), nested object literals, full binary expressions |
| What a mount adds | structure where none existed | **replaces** correct subtrees; preserving them needs `overlay` range-mounts + the full Pathogen parser re-mounted inside every interpolation |
| Token-group risk removed? | n/a | **No.** `templateInterpStart` and `styleBlockOpen` are both literally `${`, disambiguated only by Lezer's contextual token groups (the documented 5→4 collapse trap). The outer grammar must still tokenize the template extent for any mount to exist, so the fragile machinery stays either way. |

## The actual defect (live silent bug, now fixed)

`buildTemplateLiteral` discarded the correct CST and re-scanned raw text with
a brace counter that had **no string-awareness**:

```
src:   let x = `${ f("}") }`;
CST:   TemplateLiteral > TemplateInterpolation > Identifier ArgList ( String )   ← correct
AST:   parts: [ Identifier " f(\"", "\") }" ]                                    ← silent garbage (pre-fix)
```

Plus: every interpolation triggered a second full parse (`let _ = expr;` wrap,
`WRAP_OFFSET=8` loc rewrites with the documented multi-line `.offset` bug),
`MAX_PARSE_DEPTH=32` silently degraded to a bogus `Identifier`, and escapes
took a separate regex pass.

The historical justification (commits `8c89ff4`/`0041d3e`: "Lezer doesn't emit
templateContent nodes") was a misdiagnosis — the lowercase tokens are indeed
not node types, but the interpolation children were always present; only the
literal text runs are gaps, recoverable by range.

**Fix shipped**: `buildTemplateLiteral` walks the CST (interpolation
expressions via `buildExpressionWithPostfix` — real absolute locations, one
parse); literal runs recovered as gaps + `unescapeTemplate`; the raw scanner
(`parseTemplateString`) demoted to error-recovery fallback for opaque/
recovered nodes only.

## Secondary findings

- **Dead highlight entries**: `templateContent` / `templateStart(End)` /
  `templateInterpStart(End)` in both highlight maps referenced node types that
  never exist — templates had NO string coloring from them. Cleaned up in this
  project (see STATUS for the coloring decision).
- `src/CLAUDE.md` said "~213 line grammar"; it is ~465 lines. Fixed.

## Review follow-ups (recorded 2026-07-26, none blocking)

- **Empty-interpolation brace leak — FIXED pre-commit** (review Critical):
  `${}` (the auto-close mid-typing state) has an error-recovered node ending
  after `${`; the builder now consumes the orphaned `}` (guarded so a literal
  `}` after a well-formed interpolation is kept). Regression tests added.
- **Pre-existing tokenizer quirk**: a bare `$` immediately before the closing
  backtick (`` `end$` ``) makes Lezer's recovery swallow the backtick and the
  following `;` into the TemplateLiteral span (verified pre-existing). The
  new builder surfaces that bad tree as a trailing junk string part where the
  old one produced `[]`. Grammar-level follow-up.
- **Formatter does not re-escape backticks** in template string parts
  (pre-existing; `formatter.ts:589-593`): round-tripping `` `esc \` tick` ``
  through formatDocument would emit an early-terminating backtick. Untested
  today; separate fix.
- **Diagnostics message on `${}`** says "Unexpected ':'" — misleading,
  pre-existing, diagnostics.ts follow-up.
- `parseTemplateString`'s `baseOffset`/`source` params are unused
  (pre-existing TS6133) — clean up or use for fallback-path locations.

## Recorded, deliberately NOT done

- **No parseMixed/overlay extraction of outer templates** (this assessment).
- **Inner style grammar's opaque `Template` token** remains the one legitimate
  parseMixed/overlay candidate (chips/nav inside style-value template
  interpolations) — still a recorded follow-up in
  `project-docs/style-block-structure/STATUS.md`, not blocking anything.
- `isInsideBacktickString`/`isInsideStyleBlock` completion scanners: working,
  regression-tested, LSP-shared — untouched.
