# Strict `mapSlice` — full windows by default, `{ partial: true }` to opt in

## Before / after

| | Before | After |
|---|---|---|
| `[1,2,3,4].mapSlice(2)` | `[[1,2],[2,3],[3,4],[4]]` | `[[1,2],[2,3],[3,4]]` |
| Short tails | always | only with `mapSlice(2, { partial: true })` — byte-identical to today |
| `[1,2].mapSlice(5)` | `[[1,2],[2]]` | `[]` |
| Pairing neighbours | needs `if (pair.length == 2)` or the last `inner` is `null` | just works |
| `[].mapSlice(2)`, `mapSlice(1)`, rounding, `length < 1` error, trailing-block error | — | unchanged |

## Context

`mapSlice`'s main use is pairing neighbours (consecutive radii → rings, points →
segments). For that use the short trailing slice is a trap: destructuring it binds
`null`. That is what broke "Segmenting the circles v5" on 2026-09-19 —
`let [outer, inner] = radius` left `inner` null on every disc's innermost ring.
The compiler half is already fixed (path-emit guard, uncommitted, same session);
this removes the trap at its source. Precedent: Kotlin
`windowed(size, step, partialWindows = false)`, Rust `windows`, Ruby `each_cons`.

**Decisions made with the author (2026-09-19):** strict is the default · opt-in is
an options object, `{ partial: true }` (mirrors `offset(5, { join: 'round' })`,
positive-sense flag, leaves room for a future `step`) · **no production KV scan
and no migration** — flip the default, risk accepted.

**Decided here, flag if you disagree:** `length > array.length` returns `[]`
silently (the Rust/Kotlin convention), documented and tested — no warning.

## Steps

### 0. Paper trail
Copy this plan to `project-docs/strict-mapslice/plan-v1.md`. Verify outputs and
review dispositions land in the same folder.

### 1. Docs first — `docs/syntax.md` (existing page; no `DOC_FILES` change)
- Rewrite the `.mapSlice` section (~1139–1162). Heading becomes
  `` #### `.mapSlice(length, options?)` `` (matches `offset(distance, options?)`).
  Lead with full windows and the neighbour-pairing example **without** a length
  guard; then `{ partial: true }` with the old outputs; then the `[]` case. The
  null-destructuring caveat written earlier today moves under `{ partial: true }`
  — it is no longer a trap of the default.
- **Anchor changes**: the slug rule (`scripts/build-docs.ts` `slugify`) turns the
  new heading into `#syntax-mapslicelength-options`. Update the cross-reference in
  Null → Error Behavior (~line 497) and reword it ("slices from
  `.mapSlice(n, { partial: true })`").
- Line ~1179 (copy-vs-mutate note) needs no change.
- `npm run build:docs` then `npm run check-links`.

### 2. Failing tests
- `tests/evaluator.test.ts` `describe('mapSlice')` (~2738): update the three
  pinned outputs (`[[1,2],[2,3],[3,4]]`, `[[1,2,3]]`, `[]`). Add: `{ partial: true }`
  reproduces **each old output byte-for-byte**; `{ partial: false }` equals the
  default; `partial` from a comparison (`{ partial: 3 > 2 }`); validation errors
  below, each asserting `Line N, col M`.
- `tests/path-emit-guard.test.ts` "the reported program shape" — **breaks by
  design** (the short slice no longer exists, so nothing throws). Rewrite as:
  (a) the reported loop, unguarded, now compiles to exactly two rings;
  (b) the same loop with `{ partial: true }` is still rejected by the guard
  (keeps the destructure-to-null route covered). Update the file header comment.
- `tests/range-values.test.ts:323` is self-relative — no change.

### 3. Implement — `src/evaluator/index.ts`
- Add `parseMapSliceOptions(val, mkErr)` **next to `parseOffsetJoinOptions`
  (~1133)** and in its style: `mkErr` passed in so errors carry the call site;
  unknown keys **throw** (offset's behavior, not Grid's silent ignore). Use the
  existing `isObjectValue()` (~533).
- **Boolean trap:** a Pathogen boolean is `{ type: 'BooleanValue', value: 0|1 }`,
  never a JS boolean — `=== true` / `!val` are always wrong. Follow the
  `NoiseFilter.monochrome` precedent (~9667): `isBooleanValue(v) ? v.value === 1`,
  else number → `!== 0`, else throw.
- `case 'mapSlice'`: accept 1–2 args; loop bound becomes
  `partial ? elements.length : elements.length - len + 1`.
- Errors: `mapSlice() expects 1-2 arguments (length, options?)` ·
  `mapSlice() options must be an object, e.g. { partial: true }` ·
  `mapSlice() options: unknown key 'strict' (supported: partial)` ·
  `mapSlice() partial must be a boolean`. The unknown-key case must be tested with
  `strict` specifically — the name this feature was discussed under.

### 4. API surface — `src/pathogen-api.ts:718`
```ts
/** mapSlice(length, options?) — Sliding windows of exactly `length`; { partial: true } keeps the short trailing slices */
mapSlice(length: number, options?: { partial?: boolean }): PathogenArray;
```
Keep method-signature style (the file's eslint-disable explains why). Then
`npm run generate:completions` and `npm run check:completions` (pre-commit gate).
The snippet stays `mapSlice(${1:length})$0` — templates derive from required
params only. Completion detail and hover both flow from this line; member methods
have no signature help, and the hardcoded return-type tables
(`type-inference.ts:95`, `inlay-hints.ts:367`) stay correct at `'array'`.

### 5. Build and verify on all three surfaces
- **CLI:** `npx tsx src/cli.ts -e '…' --print-logs` for default, partial, and each error.
- **Proof on the real program:** add `segmenting-the-circles-v5-fixed-v3.pathogen`
  to `project-docs/variable-offset/closed-spine-diagnosis/` with the length guard
  **removed** — the author's original loop shape must compile and render
  concentric rings. Update that folder's `STATUS.md`.
- **Playground:** `npm run build`, then — `dev:stack` is running — only
  `PATHOGEN_API_BASE=http://localhost:8787 npm run build:website` (never the plain
  form; never touch the running workerd). Drive `/workspace/scratch?state=…` with
  a script modeled on `project-docs/range-values/verify/verify-playground.mjs`:
  console pane shows the strict result, the error panel shows the `strict` typo
  error, completion detail shows the new text.
- **VS Code:** `npm run build:vscode`, then the headless precedent
  `project-docs/range-values/verify/verify-vscode.mjs` (bundled language server
  over stdio + bundled compiler). Say in the commit message that verification was
  headless.
- `npm run test:run` full suite. Lint **touched files only**, fix by hand
  (`eslint --fix` is unsafe in this repo).
- Re-run the read-only sweep of tracked `.pathogen` sources to confirm nothing
  published changes output.

### 6. Reviews, changelog, then a checkpoint
- `code-reviewer` agent on the diff; `content-reviewer` agentic review on the
  `docs/syntax.md` changes (ask for 3–4 numbered items per message; disposition
  table in `project-docs/strict-mapslice/reviews/`).
- `CHANGELOG.md`: new `## [Unreleased] - 2026-09-19 (strict mapSlice)` section.
  Per the project rule it must cover **all** work since the last entry, so:
  `### Changed → Core` — **BREAKING** `mapSlice` (with the one-line migration:
  add `{ partial: true }`); `### Fixed → Core` — the path-emit guard;
  `### Fixed → Development` — the `circle(10)` test that passed on NaN output.
- **Stop and show you the review outcomes before committing** (required for docs
  changes). Then two commits on `main`, in order, so the fix survives if the
  breaking change is ever reverted:
  1. `fix(core): path-emitting functions reject null, NaN and missing arguments`
  2. `feat(core)!: mapSlice returns full windows only; { partial: true } keeps the short tails`

  Stage only this session's files and restore rebuild noise. **Pushing deploys
  Pages and the API to production** — push only on your go-ahead at that checkpoint.

## Out of scope (noted, not done)
- Element typing: declaring the return as `PathogenArray<PathogenArray>` would
  give `pair` array completions in `for ([pair, i] in arr.mapSlice(2))`.
- Dead branch: `type-inference-ast.ts:127` types a trailing block for `mapSlice`,
  which the evaluator rejects.
- A `step` option (`{ step: 2 }` → non-overlapping pairs) — the options object
  leaves room for it.
- Pre-existing `tsc` errors in `src/cli.ts` (`_legacyGenerateSvg`).
