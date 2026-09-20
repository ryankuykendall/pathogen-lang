# Non-finite warnings, strict mode, and error positions — status

_2026-09-19. Resume point for ISSUE-023 and ISSUE-022. Both were logged while
shipping strict `mapSlice` (`../strict-mapslice/STATUS.md`); the author asked for
fixes the same day. Resolutions are in `../known-issues.md`._

**State: implemented, reviewed, and re-verified on all three surfaces against
the final source. NOT committed** — waiting on the author, who must see the
review outcomes first (docs changes), and whose go-ahead a push needs (it
deploys Pages).

Reviews: `reviews/code-review-disposition.md` — one Critical that was real (a
NaN corrupted the structured trace; fixed at the root), one filed as Critical
and declined with evidence (the reviewer then agreed), two Warnings, and one
test-quality point that led to pinning the cache policy deterministically. `reviews/docs-review-disposition.md`
— 17 items, final verdict **ship**.

## ISSUE-023 — `M NaN 0` compiled silently

The author's decision: **a positioned warning, plus a strict mode.**

| Situation | Before | Now |
|---|---|---|
| NaN / ±Infinity in a raw path argument (`M x y`) | silent; browser stops reading the path at the token | warning `non-finite`, path still emitted |
| NaN / ±Infinity argument to a function that draws | error (for a few hours on 2026-09-19) | warning `non-finite`, path still emitted |
| NaN buried in a structured argument (`cubicSpline([{ x: NaN … }])`) | error | warning `non-finite` |
| `null` argument; too few arguments | error | error — always a mistake |
| argument missing from a context-aware function (`polarLine(0.5)`) | error | error — detected from what the call produced, only when every argument was finite |
| any warning under strict mode | — | positioned error, `… (strict: <code>)` |

- `compile(src, { strict: true | ['non-finite', …] })`, same on `compileWithContext`.
- CLI `--strict` / `--strict=<codes>`; unknown code → error listing `WARNING_CODES`.
- `scripts/compile-samples.ts` builds published samples under `--strict=non-finite`.
- Strictness lives in `warn()` — the one function every warning passes through.

**Why a warning and not an error:** five existing tests observe documented math
contracts (`smoothstep(5,5,5)`, `bump`, `noise`, `/0`, `%0`) through a path
argument, and for `random()`-driven work a fatal NaN turns an intermittent
glitch into an intermittent failure to render at all. An error version was
written and reverted earlier the same day for exactly that reason.

**Accuracy note:** a layer's subpaths share ONE `d`, so a bad token costs
everything after it *in that layer*, not just one stroke. `demo.png` shows it:
the sound layer is complete; the degenerate layer stops at x = 200 and its
final `L 380 140` is lost.

## ISSUE-022 — errors with no position, or the wrong one

Three things, found in this order:

1. **Ten expression node kinds had no `loc`** — array / object / string /
   template / number / boolean / null literals, `calc()` (two sites),
   unary expressions, a fallback identifier. A method call takes its position
   from its receiver, so `[1, 2].slice('a')` had none.
2. **`loc()` was O(source) per call** (slice the prefix, split on newlines) —
   and `offsetToLoc()` the same, once per path argument. 1.4 MB / 20,000 lines:
   **18.8 s → 0.5 s.** Had to be fixed first; adding 140,000 positions on top of
   a quadratic `loc()` would have been worse than the bug.
3. **Every error in a for-each header said "Line 1, col 9"** — the header was
   sub-parsed and never rebased. Pre-existing, user-visible, found by a derived
   check on the new positions.

## Traps worth keeping

- **`NaN` contains an `a`; `Infinity` contains a `t`.** Any scanner that finds
  path commands by letter will read them as an arc and a smooth-quad. Emitting
  a non-finite number is now official, so every scanner of emitted path text
  must take the WORD first, sign included (`path-data.ts`, "Non-finite numbers").
- **`catch { return; }` in a derived test matrix asserts nothing.** Assert both
  outcomes, and make a throw prove it is about the call under test.
- **An unquoted `--include=*.ts` is rejected by zsh and the next `echo` still
  prints.** A "(none found)" line after it is not evidence. Quote the glob.

- **A one-entry cache is evicted by sub-parses.** Every `calc()` and style value
  is parsed from its own short `let _ = …;` string, interleaved with the
  document. Caching line starts for "the last source" rebuilt the document's per
  `calc()`. Fix: sources ≤ 512 chars bypass the cache; the cache holds two.
  Diagnosed by profiling ONE construct at a time (let / literal path args /
  calc path args) at 2k and 8k lines — only `calc()` was super-linear.
- **A fuzz that never reaches the code under test.** The first equivalence fuzz
  used sources ≤ 60 chars — after the redesign, all of them bypassed the cache.
  There is now a separate long-source case that evicts on every call.
- **`let got = polarLine(…)` captures; a statement emits** (carried over from the
  strict-mapslice work — the same trap applies to any "never reaches `d`" test).
- **The playground error panel renders a position as `Line L:C — message`**, not
  `Line L, col C:`. A verify script that greps the page for a METHOD NAME will
  match the embedded docs text instead of the panel; search for the message.
- **A hook matches the TEXT of shell commands**, heredocs and comments included:
  a Python comment mentioning a watched directory name blocks the whole command.
  Use the Edit tool for such edits.
- **`loc.offset` inside a method's trailing block is block-relative** (ISSUE-024);
  line and column are right. The "every loc agrees" test programs avoid trailing
  blocks on purpose.

## Verified

| Surface | How | Result |
|---|---|---|
| CLI | by hand, plus `tests/cli.test.ts` "CLI --strict" (8 cases, true exit codes) | as specified |
| Playground | `verify/verify-playground.mjs` — served bundle (`compile` AND `compileWithContext`), live preview, live error panel, and a 2,000-iteration NaN loop (every instance kept, preview renders, no stack overflow) | 21/21 |
| VS Code | `verify/verify-vscode.mjs` — the BUNDLED server PUBLISHES a Warning (severity 2) at the right range over real LSP; the BUNDLED compiler | 17/17, **headless** |
| Suite | `npx vitest run` | 153 files, 6,341 tests, exit 0 |
| Corpus | all 511 tracked `.pathogen` sources | same 56 pre-existing failures; 0 `non-finite` warnings; 0 fail only under the gate; every `loc` function-equivalent; 23,500 emitted path layers tokenize to the same command sequence as before |
| Earlier feature | `../strict-mapslice/verify/*` re-run on the final build | both still pass |
| Browser behaviour | `demo.png` | path drawn only up to the bad token, as the message says |
