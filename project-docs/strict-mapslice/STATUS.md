# Strict `mapSlice` — status

_2026-09-19. Resume point. Approved plan: `plan-v1.md`._

**State: SHIPPED.** Committed as `3813223` on `main` and pushed 2026-09-19
(`428b8aa..3813223`), on the author's go-ahead after seeing the review outcomes.
Cloudflare Pages: completed / success. The API worker did not redeploy — nothing
under `api/`, `website/api/` or `website/auth/` changed.

**Production verified, not assumed** (a green deploy check says the build
finished, not that the site behaves):

- `PATHOGEN_ORIGIN=https://pathogen.studio node verify/verify-playground.mjs` →
  **13/13** (`verify/playground-results-production.json`): the demo renders with
  path data byte-equal to the local CLI; full windows by default;
  `{ partial: true }`; the `strict` typo error; the fractional-length error; the
  missing context-aware argument; completion detail, snippet and hover; and the
  live error panel.
- `https://pathogen.studio/docs`: the new anchor, the behavior-change note, the
  positive-integer clause, the option-key clause and the context-aware link are
  each present; the old `#syntax-mapslicelength` anchor and the old "slices are
  shorter" sentence are gone.

Not done: the `.vsix` was built and verified headlessly but **not installed in
an editor, and not published** — that is a separate release step.

Reviews: `reviews/code-review-disposition.md` (1 Critical — a real hole in the
path-emit guard, fixed; details there) and `reviews/docs-review-disposition.md`
(16 findings, all dispositioned; first pass "ship with changes", **final verdict
"ship"** after the reviewer re-read the revised passages and re-verified the
quoted error messages against the source).

Two things surfaced along the way and were **logged, not fixed** — both in
`../known-issues.md`: **ISSUE-022** (a method called on an array *literal* loses
its error position) and **ISSUE-023** (a raw path argument accepts NaN /
Infinity — a fix was written, collided with five deliberate tests, and was
reverted because it is a policy decision for the author).

## What it is

`arr.mapSlice(n)` returns full windows only. `arr.mapSlice(n, { partial: true })`
restores the previous output byte-for-byte. A `length` longer than the array
gives `[]`. Origin: `../variable-offset/closed-spine-diagnosis/STATUS.md`.

Decisions (author, 2026-09-19): strict is the default; the opt-in is an options
object with a positive-sense flag (`partial`), not `strict: false` and not a
positional boolean; no production KV scan and no migration. **At the commit
checkpoint:** one commit, not two (the two pieces are entangled in `index.ts`,
`syntax.md`, the guard tests and the changelog); and `length` must be a positive
integer — the silent `Math.round` (`mapSlice(2.6)` → windows of 3) is gone.

Asked at the same checkpoint whether the context-aware functions need a heading
to exist first: **already enforced, nothing built.** `tangentLine`, `tangentArc`
and `turn` stop with a positioned error when no heading is established, and
`heading()` with no argument clears it so the next one errors too. `polarLine` /
`polarMove` / `polarPoint` carry their own angle and *set* the heading — a
required prior heading would break `M 0 0 polarLine(0deg, 10)`. None of this
touches ISSUE-023, whose programs contain no heading at all.

## Where things are

| Piece | File |
|---|---|
| Contract | `docs/syntax.md` — `.mapSlice(length, options?)`; anchor is now `#syntax-mapslicelength-options` (the Null section links to it) |
| Options parser | `src/evaluator/index.ts` — `parseMapSliceOptions`, beside `parseOffsetJoinOptions` (its model: unknown keys throw) |
| Behaviour | `src/evaluator/index.ts` — `case 'mapSlice'` |
| Declaration | `src/pathogen-api.ts` → `npm run generate:completions` (one generated line) |
| Tests | `tests/evaluator.test.ts` `describe('mapSlice')`; `tests/path-emit-guard.test.ts` "the reported program shape" |
| Demo | `demo.pathogen` |
| Verification | `verify/verify-playground.mjs`, `verify/verify-vscode.mjs` (+ results JSON, error-panel screenshot) |

## Verified

| Surface | How | Result |
|---|---|---|
| CLI | `npx tsx src/cli.ts` on default / partial / too-long / both likely mistakes | as specified |
| Playground | `verify/verify-playground.mjs` against the served site (rebuilt with the local API base pinned — the dev stack was running) | 13/13: preview path data byte-equal to the CLI (207 chars), served-bundle behaviour, the code-review fix (missing context-aware argument), completion detail, hover, live error panel |
| VS Code | `npm run build:vscode`, then `verify/verify-vscode.mjs` — the BUNDLED language server over stdio and the BUNDLED preview compiler | 15/15. **Headless**: proves the shipped artifacts, not the interactive feel of an installed extension |
| Suite | `npx vitest run` | 151 files, 6249 tests, exit 0 |
| Links | `npm run check-links` | 1484 OK, 0 broken; after the later docs edits, every anchor the new text links to was confirmed present exactly once in the built page |
| Drift gate | `generate-completions --strict` | exit 0 |
| Published programs | tracked `.pathogen` sources that call `mapSlice` | none — no published output changes |
| Real program | `../variable-offset/closed-spine-diagnosis/segmenting-the-circles-v5-fixed-v3.pathogen` — the author's loop with the length guard removed | compiles, 0 warnings, renders concentric |

## Traps worth keeping

- **A Pathogen boolean is a wrapped object** (`{ type: 'BooleanValue', value: 0|1 }`)
  and is always truthy in JS. `props.get('partial') === true` and `!value` are
  both wrong; unwrap with `isBooleanValue`, and accept a number too, as
  `NoiseFilter.monochrome` does. Two tests (`{ partial: 3 > 2 }`, `{ partial: 3 < 2 }`)
  exist to fail if this regresses.
- **Two options-object precedents disagree.** `offset()` throws on unknown keys;
  `Grid()` ignores them. This follows `offset()` — a silently ignored
  `{ strict: false }` would be the worst outcome for this particular option.
- **The heading rename moved the anchor.** Any future rename of the heading
  moves it again; `npm run check-links` is the gate.
- **Method errors are positioned from the receiver.** Array-literal receivers
  carry no position (ISSUE-022), so positioned-error tests must call the method
  on a variable.

## Out of scope, noted

- Element typing: returning `PathogenArray<PathogenArray>` would give `pair`
  array completions in `for ([pair, i] in arr.mapSlice(2))`.
- Dead branch: `type-inference-ast.ts:127` types a trailing block for `mapSlice`,
  which the evaluator rejects.
- A `step` option (`{ step: 2 }` → non-overlapping pairs); the options object
  leaves room.
- ISSUE-022 (array-literal receiver position).
