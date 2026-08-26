# Item I — Command-letter shadowing diagnostics + the `pi` story (friction #4/#5)

**Status:** rich summary for user review — no code changed yet.

## Before / after

Before (today, probe-verified):
```pathogen
let m = 25;
M 10 10
L m 40
// → "Parse error at line 3, column 2: Missing ';'"
//   (the 'm' was consumed as a new move command — the message
//    points at punctuation, nowhere near the actual mistake)

L calc(pi) 40
// → "Undefined variable: pi"
//   (yet 0.5pi is a working literal two lines away)
```

After (proposal):
```pathogen
let m = 25;
M 10 10
L m 40
// → "'m' is a path command here, so it cannot be used as a bare
//    variable in path arguments — write calc(m), or rename the
//    variable"

L calc(pi) 40
// → works: pi is a built-in constant (still shadowable by let)
```

## What I hit (probe-verified today, 2026-08-25)

- **#4 — the trap is real and the message maximally misleading.**
  `let m = 25; L m 40` fails with `Missing ';'` at a column near the
  `m` — the parser consumed `m` as a relative-move command and choked
  downstream. Crucially, **`calc(m)` works fine** — the collision is
  only in *bare* path-argument position, where the grammar's greedy
  path-args tokenizer must treat `m l h v c s q t a z` as commands.
  The language guideline already bans these names in published samples
  for this reason; users get no such warning.
- **#5 — the `pi` asymmetry.** `0.5pi` is a first-class angle literal;
  `PI()` is a stdlib call; but bare `pi` inside `calc()` is
  `Undefined variable: pi`. Surprising exactly because the literal
  form makes `pi` feel like a known word.

## Verified mechanics

- The contextual-message machinery is `describeError`
  (`language-services/diagnostics.ts:192`) — pure syntax-tree
  pattern-matching (parent/sibling/error-text), **no scope awareness**.
  Adding a shadowing case needs the declared-variable names, which
  `analyzeScopes` already computes in the same package.
- Known related gap (array-sort follow-ups memory): hover on a
  single-letter variable shows the path-command hover — same collision
  class, worth sweeping in the same item.
- `t` is the tension case: the sample guideline explicitly allows
  `let t` (parametric position), and it works everywhere except bare
  path-arg position — so a warn-at-declaration design would
  false-positive on legitimate, guideline-blessed code.

## Design options

**#4 — shadowing diagnostic placement:**
1. **Parse-error rescue (recommended):** when a parse error sits in a
   path-command context and the error region starts with a single
   letter that is both a command and a declared variable, replace the
   generic message with the specific one ("'m' is a path command here
   — write calc(m) or rename"). Zero false positives (fires only on
   actual errors), needs scope names threaded into describeError.
2. Warn at the declaration (`let m = …`): catches the trap before use,
   but false-positives on guideline-blessed `let t` and on variables
   only ever used inside calc() — would need an allowlist or usage
   analysis.
3. Both: 1 now, 2 later only if 1 proves insufficient.

**#5 — pi:**
1. **Bind `pi` as a built-in numeric constant = π (recommended):**
   what every language does; shadowable by `let pi`, so zero breakage
   (sweep confirms nothing in tests/samples declares `pi`). `calc(pi)`,
   `cos(pi)` just work. (Note: NOT the angle value `1pi` — an angle
   here would make `pi * r * r` an "area angle" and print as
   `3.14…` only after coercion; the constant should be the plain
   number, with `0.5pi` literals remaining the angle-typed spelling.)
2. Diagnostic-only: keep the error but say "did you mean PI(), or the
   literal 1pi?" — no semantic change, still a speed bump.
3. Both: the constant for calc, plus hover documenting the three
   spellings (pi, PI(), 1pi).

Scope note: #4's fix lives entirely in language-services (diagnostics,
hover sweep) — no evaluator change. #5 option 1 touches both
evaluators (constant lookup) + completions/hover + docs (stdlib or
syntax page).

## Post-commit addendum (2026-08-26): the sweep that missed

The reviewer (delivering its report after three machine-sleep
interruptions, post-commit) caught a real regression the pre-commit
sweep missed: three committed post24 samples bound `pi` as a for-in
DESTRUCTURING INDEX (`for ([p, pi] in ...)`) — a binding form the
original sweep pattern (`let pi` / `fn pi(` / param lists) did not
cover. Lesson recorded: a reserved-word sweep must enumerate the same
binding-form space as the test coverage matrix (all 9 forms), not the
two obvious ones. Fixed by renaming to panelIdx across the three
files; all 14 post24 samples recompiled byte-identical (the rename
and the formatter pass are provably cosmetic); corrected
all-binding-forms sweep now returns clean across samples/docs/blog.
