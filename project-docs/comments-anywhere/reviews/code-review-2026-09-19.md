# Code review — comments anywhere (2026-09-19)

`code-reviewer` agent, read-only, scoped to this change. It ran the suites and
~20 targeted repros against the real parser, evaluator and formatter.

| # | Severity | Finding | Disposition |
|---|---|---|---|
| 1 | **BUG — silent wrong answer** | Several builders re-parse a SLICE of source (an `if` / `else if` condition, a text-body `if`, a `return` value) wrapped as `` `let _ = ${slice};` ``. A slice that ENDS in a comment swallowed the wrapper's `;` on the same line; the sub-parse failed; and the builders' fallbacks took over silently — an if condition became `true`, a return value `null`. `let x = -1; if (x > 0 // check⏎) { M 1 1 } else { M 2 2 }` compiled to `M 1 1`. New with this change: before it, that input was a hard parse error. (I had filed the `return` half of this under "known limits" — wrong call; the reviewer's `if` repro shows why.) | **Fixed.** `wrapExpression()` in `src/parser/lezer-expression.ts` puts the semicolon on its own line (``let _ = ${slice}\n;``), for both wrapper sites; the 8-character prefix every offset adjustment assumes is unchanged. Six tests written red first: if, else-if, return, text-body if, for-each iterable + calc, and format-preserves-meaning. |
| 2 | WARNING | A comment in the HEADER of a text-body `if` / `for` made the verbatim climb skip past that node (it is in `LIST_CONTAINERS` for its `{ }` items) to the whole `text() { … }`, giving mixed indentation. No comment lost, meaning unchanged, stable on a second pass. | **Fixed.** Containers are now two kinds: `BODY_ONLY_CONTAINERS` (Program, Block, TrailingBlock, …) are never list items; the text-flow nodes are both containers and items, so the climb can stop ON them. Test: the text-if is one verbatim unit and its neighbours format normally. |
| 3 | NIT | `'TextElseClause'` in `LIST_CONTAINERS` is not a grammar node. | **Removed.** |
| 4 | NIT | `verbatimText` swaps only the statement's own indent prefix, so a continuation line indented with tabs keeps them after the block is re-indented with spaces. | **Accepted.** Verbatim means verbatim; mixing tab and space indentation inside one statement is the input's choice, and normalising it would mean editing the insides of a statement the formatter has promised not to touch. |
| 5 | NIT | The tests' `commentsOf` was a regex over lines, a weaker oracle than the formatter's tree-based net; it would miscount a `//` inside a string. | **Fixed.** `treeComments()` reads the parse tree (plus PathArgs and StyleContent tokens); a new test puts a URL string and real comments in one program. |

Verified clean by the reviewer: `commentBlindCursor`'s restore-on-failed-
`nextSibling` logic; both cursor-creation sites; sub-parses reach the blind cursor
through `buildAST`; the path-args tokenizer boundary; switch discriminant
comments; no false refusals from `dropsWords` / `dropsComments`; CRLF; multi-line
templates and strings inside verbatim spans; two-blocks-deep verbatim; a
comments-only file; a file with no trailing newline.

Found by my own probe before the review (`probe-positions.ts`, now permanent
tests): a comment inside an open paren of a true path-command argument
(`M calc(a // note⏎ + b) 0`) still failed — the external path-args tokenizer
ended the token at `//` at any depth. It now carries the comment to end of line
when a paren or brace is open; the builder blanks it (same length, offsets
preserved) before its own argument scan; the formatter keeps the command verbatim.

Found by the CONTENT review: comments inside a style block were lost on format
(see `content-review-2026-09-19.md` #5).
