# Docs review — disposition

_2026-09-19. `content-reviewer` agentic review (UXD / UXE / PM / ID), scoped to
the new writing only: `docs/debug.md` (`## Warnings` edits, `### Numbers SVG
cannot draw`, `### Strict mode`), `docs/cli.md` (exit-code row and sentence, the
strict section), `docs/syntax.md` (two paragraphs under `### Error Behavior`)._

**Verdict: ship with changes.** 12 findings in three batches (the reviewer's
replies truncate near 4k characters). "3 wrong sentences + 2 contradictions with
text already on the page; structure and pedagogy are sound, no rework."

The reviewer has Read/Grep/Glob only, and labelled each behavioural claim either
**pinned by a test line** or **read from source, not executed**. Every unpinned
claim was run before it was adopted; where the reviewer supplied numbers it said
were guesses (7), the real ones were measured.

| # | Finding | Raised by | Disposition |
|---|---|---|---|
| 1 | "one degenerate value costs one stroke, not the whole drawing" overclaims (`debug.md`, repeated in `syntax.md`). A layer's subpaths share one `d`, so everything AFTER the bad token in that layer is lost — and the docs' own example puts the NaN in the FIRST command, so that layer draws nothing. The compiler message itself is accurate; leave it | UXE, ID, PM | **Adopted.** Already suspected before the review (the demo render shows the tail of the stroke lost) and asked about explicitly. Both sentences replaced; the same overclaim corrected in three code comments. `NON_FINITE_CONSEQUENCE` untouched. |
| 2 | "positioned like any other error" is false for two of the six codes: `gradient` and `font-glyph` call `warn()` with no `loc`, and the page already says so two paragraphs below | UXE, ID | **Adopted after reproducing**: `TopoGradient('surface1', 100, 100)` under `--strict` → `Error: TopoGradient 'surface1' has no contours … (strict: gradient)` with no `Line N`. Now "carrying the warning's own position when it has one". |
| 3 | The bullet "(exit code stays 0)" still promised it unconditionally, three lines after the new "unless you ask them to" | ID, PM, UXE | **Adopted.** "…stays 0 unless strict mode is on". |
| 4 | "One case stays an error whatever the mode" contradicts the shipped paragraphs directly above it — null and arity errors stay errors too. The real point is narrower | ID, UXE | **Adopted.** "One `NaN` stays an error whatever the mode … the one a *missing* argument produces in a context-aware function." |
| 5 | The same material appears twice across files, and the duplicate is the sentence that was wrong (1). Proposes ownership: `debug.md` the concept + library option, `cli.md` the flag reference, `syntax.md` one sentence and two links | ID, PM | **Adopted.** Causes list cut from `syntax.md`; `debug.md` now links to the CLI flag reference (it linked back zero times before). |
| 6 | Two output blocks in two different surfaces' formats, with nothing saying which; the CLI prints a third form | UXE, ID, UXD | **Adopted, reworded.** The reviewer's sentence said "as the console and `--json` report it" — `--json` reports objects, and the console's literal format was not verified, so the sentence claims only what was checked: "each warning's line, column and message — the three fields every surface carries. On the CLI the first one reads `file:2:3: warning: …`." |
| 7 | The PRE-EXISTING fillet example that the new block imitates is itself wrong: it shows `…clamped at vertex 0 (requested 30, using 20)`, and no "requested"/"using" string exists anywhere in `src/` | UXE, ID | **Adopted after running it.** The reviewer's replacement numbers were guesses, as it said. Real output: FOUR warnings, all at `7:12` — clamped at vertex 2 (`effective radius 10.00`), skipped at vertex 2, clamped at vertex 0, skipped at vertex 0. The doc had the wrong column (20), the wrong vertex, and wording from an older version of the message. The block now shows the four verbatim. Out of the change's scope strictly, but load-bearing for it. |
| 8 | Strict mode is CLI + library only, on a page that opens by promising the three surfaces work the same. Caveat: could not search `playground/` to confirm nothing passes `strict` | PM, UXD, UXE | **Adopted after verifying.** A first search silently did not run (zsh rejected an unquoted `--include=*.ts` glob and the "(none)" line printed anyway); redone with quoted globs — zero `strict:` option keys in `playground/` or the VS Code packages; the playground calls `compileWithContext` with font options only. |
| 9 | `--strict` was only findable under Exit Codes, below Help and Version. Promote to a top-level section after Log Output. Also undocumented: `--strict=` with no codes is its own error | PM, ID | **Adopted.** `## Warnings and strict mode`; anchor is now `#cli-warnings-and-strict-mode`, and the `debug.md` link added in 5 moved with it. The empty-value error is documented. |
| 10 | The library half had three gaps: `compileWithContext`, `false` / `[]` meaning off, and the runtime `WARNING_CODES` export | UXE | **Adopted.** All three are pinned by tests. |
| 11 | The strict example's commands compile `poster.pathogen` while its output block is the error from the `radius` program in the previous subsection; nothing connects them | ID, UXD | **Adopted.** "Saved as `poster.pathogen`, the program above stops at its first warning:" — and the documented error was then checked BYTE-IDENTICAL against the CLI run on exactly that program. |
| 12a | Voice pass clean; one 60-word sentence with three pivots | ID, UXD | **Adopted** — split as proposed. No pet terms repeat beyond the two already filed (1, 5). |
| 12b | The third route is missing: a NaN buried in a structured argument warns with different wording, so a reader who hits it will not match it to this section | ID | **Adopted** — one clause, quoting the message (pinned by a test). |

| 13 | (arrived out of order — the reviewer's reply to the SECOND message landed after its final batch; it repeated 5–8 against the revised text and added one new item) `cli.md` made the same "positioned error" promise that 2 retired from `debug.md`, in a section advertising `--strict=…,gradient` three lines above | UXE, ID | **Already fixed** when that section was promoted for 9 ("…becomes an error, positioned when the warning has a position"). A wider search found the same unhedged claim where the reviewer could not see it — the PUBLIC `strict` option's JSDoc in `src/index.ts` (what npm consumers read in tooltips), two internal comments, and the changelog — all hedged the same way. The JSDoc now also says `false` and `[]` mean off. |
| 14 | (final pass, after re-reading the revised text) "the three fields every surface carries" overclaims twice — `gradient` / `font-glyph` warnings have no line or column, and `code` is a fourth field; `file:2:3` is a placeholder where the page names a real file later | UXE, ID | **Adopted.** "Each line is one warning's line, column and message. On the CLI, for a file saved as `poster.pathogen`, the first reads `poster.pathogen:2:3: warning: …`." A third instance of the overclaim corrected in 2 and 13 — introduced by my own rewording of 6. |
| 15 | The flag-reference pointer sat between the strict commands and the output they produce; every other example pair on the page is adjacent | ID, UXD | **Adopted** — moved below the output block. |
| 16 | The `cubicSpline()` addendum interrupted example → consequence | ID | **Adopted** — the payoff paragraph now closes the example; the addendum follows. No rewording. |
| 17 | Two voice edits: "the edge of a formula" still repeated across `syntax.md` and `debug.md`; "Until now" dates a reference page | ID | **Adopted, one reworded.** `debug.md`: "A value like that reaching the path used to go unreported". For `syntax.md` the reviewer proposed "where a typo produces a `null`" — not accurate: the page's own closing paragraph says a `null` comes from short arrays, destructuring and `.first` / `.last`, not typos. Written as "a formula produces them where a mistake produces a `null`". |

**Final verdict after re-reading the revised text: ship.** "Nothing left in the new text is factually wrong, no anchor is broken, and the three files no longer contradict each other or themselves." The reviewer also noted that the `strict` option's JSDoc in `src/index.ts` agrees with the wording the docs now use.

Noted by the reviewer, pre-existing and out of scope: `docs/cli.md` has two headings with the text "Examples", which the docs build resolves to `cli-examples` and `cli-examples-2` by document order. Nothing links to either today; the `-2` would move if a third appeared above them.

After the last batch: `npm run build:docs` exit 0; all four anchors the new text
links to are present exactly once in the built page; the retired
`#cli-treat-warnings-as-errors` is referenced nowhere.
