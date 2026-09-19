# Comments anywhere

Shipped 2026-09-19. User-facing docs: `docs/syntax.md` → "Comments".

## The report

> "I ran into this error recently while trying to comment out one of my case
> statements in a switch."

It had also turned up the day before, while rewriting the VS Code syntax fixture:
a `//` comment inside a multi-line array literal was a parse error, reported as
`Missing ';' after let declaration`.

## Before / after

| Before | After |
|---|---|
| `// case 1 { … }` between the clauses of a `switch` → parse error | Parses; the clause is simply off |
| A comment inside a multi-line array / object literal / call arguments, in a method chain, between enum members, in a text body, mid-statement → `Missing ';'` | All parse, and mean what they mean without the comment |
| Formatter: comments only existed in statement lists | Every comment survives a format — re-indented where it sits in a list, its statement kept verbatim otherwise |

## Root cause

`src/parser/pathogen.grammar` declared two tokens with the same definition:

```
Comment     { "//" ![\n]* }     // a statement alternative
LineComment { "//" ![\n]* }     // in @skip
@precedence { Comment, LineComment, "/" }
```

The comment in the grammar said "the parser tries Comment first (in statement
position), LineComment handles the rest." It does not work that way: token
precedence is resolved in the tokenizer, not per parse state, so `Comment` always
won — and wherever `Comment` was not grammatically valid the parse failed.
`LineComment` never fired. (`tests/all-syntax-fixture.test.ts` had recorded it as
the one node type the fixture could not exercise.)

## The fix

1. **Grammar** — one token, `LineComment`, in `@skip`. No `Comment` token, no
   `Comment` statement. Spiked first on a scratch copy (`grammar-spike/probe.ts`
   runs a baseline and a spike parser side by side): no conflicts; the token-group
   count, `PathArgs = 1` and the `keyof` patch all unchanged; ten failing
   positions parse; statement-level, fn-body, trailing-block and path-block trees
   are IDENTICAL to baseline; `//` in strings, templates and style values is still
   text.
2. **AST builder** — a skipped token can be a child of any node, and the builder
   walks children in ~150 places (67 `firstChild`, 79 `nextSibling`, exactly two
   cursor creation sites, no `SyntaxNode` navigation). So the cursor itself is
   made comment-blind (`commentBlindCursor` patches those two methods on the
   instance — no proxy, so `cursor.name` stays a native getter), and a failed
   `nextSibling()` restores the position, which callers rely on. Lists that KEEP
   comments step with `firstChildRaw` / `nextSiblingRaw` at that one level:
   Program, `Block`, trailing-block bodies, path-block and text-block bodies, text
   bodies, and switch clause lists.
3. **AST** — `SwitchCase.leadingComments`, `SwitchDefault.leadingComments`,
   `SwitchStatement.trailingComments`; `Comment` joins `TextBodyItem` (both text
   walkers already ignore item types they do not know); `ReturnStatement` gained
   a `loc`. An expression-bodied block `{|v| v * 2}` prints inline, so its
   comments are deliberately left OUT of the AST.
4. **Formatter** — comments the AST carries print on their own line. For the
   rest: `verbatimSpans` reads the parse tree, finds each comment the AST does not
   carry, climbs to the innermost list item that contains it, and that item is
   emitted verbatim (`verbatimText`), its original indent swapped for the new one;
   lines inside a multi-line template are never touched. `dropsComments` backs up
   `dropsWords`.

## Decisions

- **Trivia, not more statement positions.** The alternative — allowing `Comment`
  as an explicit alternative in clause lists, array elements, arguments, … — is
  whack-a-mole and still would not reach "in the middle of a statement".
- **Verbatim over reflow** for a statement with an interior comment. Attaching
  comments to arbitrary expression nodes (Prettier-style) is a project of its own;
  verbatim is safe today and never separates a comment from what it describes.
- Switch clauses and text bodies got first-class handling because that is where
  whole-line comments naturally live — and it was the reported case.

## Known limits (deliberate)

- A switch EXPRESSION (`let b = switch (x) { … }`) with comments between its arms
  is kept verbatim rather than re-indented — arms have no comment slot.
- Inside a verbatim statement nothing is normalised — including tab/space
  mixing on its continuation lines. Verbatim means verbatim.
- No block comments (`/* */`). Not requested; the docs say so.

## What the reviews changed

Three things shipped differently because of review (records in `reviews/`):

- **A silent wrong answer** (code review #1): slices re-parsed as
  `let _ = <slice>;` lost their `;` to a trailing comment, and an `if` condition
  fell back to `true`. The wrapper's semicolon now sits on its own line.
- **Trailing comments stay put** (content review #2): the formatter used to move
  EVERY end-of-line comment to its own line below its statement, where it read
  as describing the next one. Pre-existing, but the new docs would have
  advertised the opposite.
- **Style-block comments survive a format** (content review #5): a comment with
  words in it made the formatter refuse the whole document; one without
  (`// ----`) was silently deleted.

And one from my own probe: comments inside an open paren of a path-command
argument (the external tokenizer ended the token at `//` at any depth).

## Verification

See the session summary / CHANGELOG. `demo.pathogen` → `demo.svg` / `demo.png`.
Three-surface checks live in `project-docs/range-values/verify/` (the shared
verification scripts), extended with a commented-out-clause scenario.
