# Phase 0a step 5 — built-in names are a compile error

Plan: `06-phase-0a-plan.md` §Step 5. Decisions 18, 20–22 (`05-phase-0a-audit.md` §6). Started
2026-10-31.

## Before / after

| | Before | After |
|---|---|---|
| `let line = @{ h 100 };` | binds `line`; `line(...)` in that scope reaches the variable | `Cannot use line as a name — it is a built-in function. Use another name`, at the name, before the program runs |
| `fn hash01(i) { … }` | shadows the stdlib `hash01` (the-reliable-line promised this "by design") | same error |
| `let { min, max } = range;` | binds both | `Cannot use min as a name — it is a built-in function. Take the property under another name: { min: minValue }` |
| `enum Marker { Dot, Ring }` | shadows the `Marker` namespace | `Cannot use Marker as a name — it is a built-in constructor. Use another name` |
| `let viewbox = 5;`, `let ctx = …` | shadow the globals (`docs/viewbox.md` said legal) | errors ("it is the program's viewBox", "it is the drawing context") |
| `{ min: 2 }`, `range.min`, `enum E { line }`, `'line'`, style properties | allowed | allowed |
| `let pi = …` | unit-suffix error | unchanged (keeps its own message) |
| Editors | one diagnostic (the first) | every offender underlined; quick fix renames it everywhere it's used |

## The names (143, derived, never hand-listed)

From the registries, so a new built-in is reserved the moment it exists:

| Source | Kind in the message | Count |
|---|---|---|
| `stdlib` + `contextAwareFunctions` + `STATEMENT_BUILTINS` (log, assert) | function | 87 |
| `EVALUATOR_CONSTRUCTORS` + `Color` | constructor | 27 |
| `BUILTIN_ENUMS` | enum | 23 |
| `Object`, `PathBlock`, `Font`, `Cap` (namespaces in `lookupVariable`; `Marker`, `Color` count as constructors) | namespace | 4 |
| `ctx`, `viewbox` | their own wording | 2 |

Not included: `Infinity`, `NaN` (the runtime doesn't resolve them). Grammar-level names (`layer`,
`calc`, colour heads) can't be declared anyway. `pi`/`deg`/`rad` keep the unit message.

## Inventory (2026-10-31, `tmp/step5/inventory.ts` over the audit corpus, 1,443 programs)

77 declarations in 67 files: `line` 15, `sign` 12, `heading` 10, `arc` 10, `hash01` 5, `Marker` 4,
`tan` 4, `cubicSpline` 4, `clippedQuadSpline` 3, `quadSpline` 3, `round` 2, and one each of
`circle`, `ease`, `bump`, `rect`, `Direction`. By origin: samples 30, docs 10, blog 3,
project-docs 32, the VS Code fixture 2. New since the 10-26 audit: `enum Marker` (post50 ×2,
project-docs switch-case ×2) and `enum Direction` (VS Code fixture) — enum names, which decision
20's list didn't name but the existing `pi`/`deg`/`rad` check already treats as bindings.

Not in the corpus: `tests/` (≈29 inline programs and the shadowing pins, found by the suite).

## Repository migration (done for review)

Published docs and blog fences, renamed by hand:

| File | Was | Now |
|---|---|---|
| docs/syntax.md (switch ranges) | `heading` | `bearing` |
| docs/syntax.md (`<<` workers) | `ease` | `sCurve` |
| docs/gradients.md (Pattern) | `line` | `stripe` |
| docs/masks.md | `circle` | `disc` |
| docs/path-blocks.md tangent / boundingBox / intersectionPoints / scale / startAt | `tan`, `line`, `line` (+ `projLine`), `arc`, `arc` | `tangent`, `straight`, `crossbar` (+ `projCrossbar`), `semicircle`, `curve` |
| docs/syntax.md (hueShift, inline) | `let turn = 0.5pi` | `let quarter = 0.5pi` |
| docs/objects.md (Angle destructuring, inline) | `{ deg, rad, pi, turns }` | `{ deg: degrees, rad: radians, turns }` |
| docs/path-queries.md (and its prose) | `arc` | `arcCommand` |
| website/blog/cutting-room-garment.md | `round` | `rounded` |
| website/blog/pathblock-parametric-sampling.md | `tan` | `tangent` |
| website/blog/the-reliable-line.md (folklore-hash fence) | `fn hash01` | `fn sinFract`, plus an editor's note |

Blog samples (28 files, `tmp/step5/rename-samples.ts`: whole-word outside comments, strings,
`.member` and `key:`; every diff read by eye). **All 28 compile byte-identical**
(`tmp/step5/compare-sample-svgs.ts`, HEAD vs working tree through the CLI). Formatter cleanliness
unchanged (four older samples were already not clean).

| Samples | Was | Now |
|---|---|---|
| post31/05 | `fn hash01` | `sinFract` (the name the-reliable-line already uses) |
| post38/02, post39/03 | `line` (a PathLayer) | `lineLayer` |
| post50/02, /05 | `enum Marker` | `MarkerShape` |
| post50/03 | `heading` | `bearing` |
| post52/02 | `arc` (loop) | `arcCommand` |
| post53/02, /04, post54/02, /05, /06 | `heading` (tangent angle at a corner) | `travelAngle` |
| post55 ×6, post56 ×6 | `sign` (`''` or `'-'`) | `signText` |
| post57/02 | `heading` (a TextLayer, id `'heading'`) | `headingLayer` |
| post57/05 | `line` (loop over metric lines) | `metric` |
| post7 ×2 | `tan` | `tangent` (sampling-anatomy's layer variable `tangent` became `tangentLayer`) |

Docs text: syntax.md "Four naming rules" + `### Built-in names`; viewbox.md "Read-only
semantics" (the shadowing bullet replaced; heading and its one link renamed); a pointer at the top
of stdlib.md.

Still to migrate with the code: the VS Code fixture (`enum Direction`, `let heading`), the render
snapshot `12-combined-defs.pathogen` (`let rect`, loaded by `render-snapshots.test.ts`), the inline
test programs, and the shadowing pins (`evaluator.test.ts`, `viewbox.test.ts`), which are deleted.

## Docs reviews

- Round 1 (content-reviewer, 2026-10-31): **ready after minor revisions.** Applied:
  1. two inline examples the fence inventory can't see (`let turn` in syntax.md, `{ deg, rad,
     pi, turns }` in objects.md — already an error today for `pi`); a sweep of every inline code
     span in docs/ and the blog (`tmp/step5/inline-spans.ts`) found no others;
  2. the `pi`/`deg`/`rad` bullet now covers every declared name and says `deg`/`rad` keep the
     unit message;
  3. "Names are case-sensitive: `let grid = Grid(4, 5);` is fine";
  4. "Only names you declare are checked"; links to built-in enums and case bindings;
  5. "a colon, then the new name"; "(`max` gets the same error)"; objects.md's `key: localName`
     paragraph points at Built-in names;
  6. viewbox.md Errors list: declaring `viewbox`;
  7. `projCrossbar`;
  8. the-reliable-line: "the mechanism has since changed, not the pixels", house-style
     "(since changed; …)", "instead of quietly replacing the built-in";
  9. sample names `signText`, `headingLayer`, post7 `tangent` (+ `tangentLayer`);
  10. stdlib.md pointer names destructuring;
  11. the first naming-rule bullet cut to one sentence and the link.

  Every changed inline example compiles (`tmp/step5/probe-inline-examples.ts`); all 28 samples
  still compile byte-identical. Kept: the quick-fix sentence, which ships with the code.
- Round 2: **ready.** Applied the one fix (the-reliable-line's second marker moved inside its
  sentence) and four "consider" items: `let point = Point(20, 20);` for the case-sensitivity
  example (a two-argument `Grid` raised a question of its own), a period after the bold lead,
  stdlib.md's wording ("including in destructuring (`let { min, max } = range;`)"), viewbox.md's
  Errors entry links straight to Built-in names. Carried into the code: pin both message strings
  word for word in tests; the quick fix must ship; the stored-workspace migration belongs in the
  CHANGELOG, not the reference docs; question 3 below is the owner of the changelog promise.

## Design (code)

- `src/builtin-names.ts`: `BUILTIN_NAMES: ReadonlyMap<string, BuiltinKind>` and
  `builtinNameError(name, form)`; the namespace table is shared with `lookupVariable`.
- Parser: `reserved-bindings.ts` generalised (unit names keep their message), behind
  `namingChecks` so the outline and inlay hints survive a mistake (step 4's lesson).
- Runtime backstop at the binding funnel (`setVariable` / `declareBinding`).
- Language services: one collector finds every offender with its exact range (diagnostics list
  them all; `parse()` still throws the first). Scope analysis gains exact declaration and
  reference positions and walks fn bodies at the end of their scope (names declared later
  resolve — also fixes go-to-definition for later declarations). Rename uses those positions,
  and accepts a declaration with a built-in's name. Quick fix: rename to a free name
  (`minValue`; `MyMarker` for a capitalised name; numbered if taken). `scope-analysis.ts`,
  `semantic-tokens.ts`, `code-actions.ts` derive their built-in sets from `BUILTIN_NAMES`.
- Stored workspaces: `scripts/migrate-builtin-names-kv.ts`, on the same rename engine. Dry run
  by default, `--confirm` for prod, `--backup-dir` required to write, concurrent-write check,
  hashes + `rev`. A rename is accepted only if the new source parses and its seeded output under
  the old evaluator (`cb0e299`) equals the original's; anything else is reported for review.
  Order: dev → prod dry run (the user's go-ahead) → prod write with backups (separate
  go-ahead) → re-run the dry run immediately before the push.
- Audit harness: a step-5 tag for programs that declare a built-in (expected ok→error).

## The user's answers (2026-11-02)

1. Docs approved, enum names included. 2. project-docs records stay as they are (only the render
snapshot a test loads is renamed). 3. Yes to the CLAUDE.md checklist rows. 4. Yes to the
read-only production export.

## Docs correction after approval

The approved sentence said a quick fix renames the name "in the playground and VS Code". The
playground has no code-action UI (`cm-language-services.ts` lists it as a deferred follow-up: a
gutter lightbulb), but it does have F2 rename, which now works on these declarations. The sentence
now says: underlined in both; F2 renames it everywhere it's used; VS Code also offers a quick fix
that picks a free name. Reported to the user.

## Stored workspaces, production (read-only export, 2026-11-02)

216 records (190 workspaces, 20 approvals, 6 queue entries). 34 declare a built-in name:

| Names | Records | Notes |
|---|---|---|
| `let min` / `let max` (loop body, `0.0001` / `0.9999`) | 22 workspaces | the font-specimen copies; no approval record has them, so the source they were copied from isn't stored |
| `fn mpi(x)` | 10: 8 workspaces, 1 approval, its `queue:rereview` entry | a user version of the stdlib `mpi` |
| `enum GridPatternType` | 1 workspace | already fails to parse (a missing `;`, one of the 10 from every audit) |
| `let map` | 1 workspace | |

Codemod over the export (`tmp/step5/codemod-local.ts`, the same code the KV script runs, gate
against `cb0e299`): **30 renamed with identical output** (SVG, logged values, warnings; fonts
loaded as the CLI loads them), **3 renamed that already failed** and fail with the identical
error after (an empty-spine `compoundVariableOffset`, an out-of-bounds index, an output too large
for a JS string), **1 left alone** (the `GridPatternType` program: it doesn't parse today and keeps
its missing-`;` error, which is reported before naming errors). Names chosen: `minValue`,
`maxValue`, `myMpi`, `mapValue`.

Gate fixes found on the way: fonts are resolved from the renamed text (the font planner parses
with the new rules, which refuse the original), and the old evaluator needs `ensureOpentype()`
before glyph geometry, as the CLI does.

## Verification

- `tests/builtin-names.test.ts` (67) and `tests/migrate-builtin-names.test.ts` (15); about 45 older
  tests renamed, and the pins that asserted shadowing now assert the error. Full suite green.
- `verify/verify-step5-surfaces.ts`: 32/32 — the five probes (`step5-probes/`) on the engine,
  `dist/cli.js --json`, the playground bundle and the VS Code bundle; diagnostics, the quick fix,
  rename and the outline from both bundles.
- `verify/verify-step5-playground.mjs` (the real served playground): the error panel shows
  `Line 2:5 — Cannot use line as a name …`; F2 prompts, renames the declaration and every reference,
  the renamed program renders, the panel closes.
- Repository audit (`verify/semantics-audit-step5.md`, baseline `cb0e299`): 1,447 programs, 1,397
  unchanged; 31 change and every one declares a built-in (tag `builtin-binding`): the 2 docs
  examples written to show the error and 29 project-docs records; 0 unexplained; 15 skipped, 4
  too-large.
- Dev KV: dry run 4 to migrate, 5 for review (programs still on the legacy `${` style opener, which
  already fail today).

## Before the production step (advisor checklist, 2026-11-02)

- **Snapshots hold code.** Workspace snapshots (2026-10-19) store `code.pathogen` in R2
  (`THUMBNAILS`, `snapshots/{workspaceId}/{snapshotId}/`, rows in D1), and one can be restored as a
  new workspace. The export read only KV. Per the plan they are reported, not rewritten; counting
  them is a production read (asked for with the write). The KV script's header said nothing in
  R2 holds source — corrected.
- **The current write path, end to end on dev:** a pre-migration backup put back into dev KV, then
  `--write --only` with the current script (`kvPut` through `--path`, the new `kvGet`), then read
  back: the stored value is the record's JSON, the code is renamed and otherwise identical,
  `contentHash` recomputed, `rev` + 1, other fields untouched (`tmp/step5/dev-roundtrip.ts`). A
  second dev dry run finds nothing left to migrate (5 legacy-`${` programs stay in review).
- **The user's own files:** `check-builtin-collisions.ts` over `project-docs/variable-offset/` (the
  glyph brush-stroke work the 22 production copies resemble) and the root-level `.pathogen` files:
  none declares a built-in.
- **VS Code quick fix through the language server:** `server.ts` publishes the diagnostic's
  message and range unchanged and hands `context.diagnostics` back to `getCodeActions` unchanged,
  so the fix finds its declaration.
- Full suite on the working tree after the review fixes: 183 files, 7,711 passed. On the staged
  tree alone (`git write-tree` → `git archive` → `vitest --root`, without the user's uncommitted
  variable-offset work): 182 files, 7,701 passed.

## Production migration (2026-11-02, the user's go-ahead: "Let's continue")

- **Snapshots:** the D1 `snapshots` table is empty on production (`tmp/step5/count-snapshots.ts`,
  SELECT + R2 get only), so no snapshot code to report. A second, direct COUNT(*) was blocked by
  auto mode's production-read rule and not retried; the first query returned an empty result set,
  not an error.
- **Dry run** (`migrate-builtin-names-kv.ts --env prod --confirm`): identical to the local run over
  the export — 33 to migrate, 1 for review (`enum GridPatternType`, already unparseable).
- **Write** (`--write --backup-dir tmp/kv-backups/step5-prod`): 33 migrated (31 workspaces,
  `approval:izpU6Ry9gVKxuN~yNTw7T`, `queue:rereview` with its one entry), 178 unchanged, 1 review,
  0 skipped for a concurrent write, 0 errors. 33 backups on disk.
- **Dry run again** right after: 0 to migrate, the same 1 for review, 0 errors. It runs once more
  right before the push (saves in between can bring a name back).

## Code review

Approve with fixes. Dispositions:

1. `PI`/`E`/`Infinity`/`NaN` in scope analysis: `PI` and `E` are stdlib functions, so still
   built-ins; `Infinity`/`NaN` are undefined at run time (checked), so dropping them matches the
   language. No change.
2. **`declarationName` picked the wrong binding** when a trailing block and a lambda in the call's
   arguments bind the same name (`reduce({|acc, v| …}) {|acc, v| …}`): both were anchored at the
   call. Fixed: the AST builder records the block's own position (`BlockFunction.loc`) and block
   parameters anchor there. Tested both ways.
3. **`kvGet` hid read errors** as "absent". Fixed: only "Value not found" is absent; anything else
   stops the run.
4. **`kvPut` passed the record on the command line.** Fixed: written through a file with `--path`
   (deleted after).
5. The read-then-write race: kept the runbook order (dry run → write → dry run again before the
   push); `rev` covers open tabs.
6. "Fails as before" with a message that names the renamed identifier lands in review — safe.
- Smaller: `--only` on a never-approved workspace now counts its approval as absent; a hover test
  for a name declared after the fn that uses it.

## Questions for the user (with the docs approval)

1. Enum names are covered (`enum Marker` is an error) — confirm.
2. project-docs programs that declare built-ins (pre-stdlib prototypes such as `fn cubicSpline`,
   the step-3 probes that pin old behaviour, primer copies, switch-case and query demos): leave
   them as records of their time (recommended; the audit tags them as expected), or rename.
   Only the render snapshot, which a test loads, is renamed either way.
3. The plan adds the collision audit to the new-stdlib rows of `.claude/CLAUDE.md` and
   `src/CLAUDE.md`; CLAUDE.md files change only when asked.
4. Go-ahead for the read-only production export (decision 22), to size the codemod and trace the
   `let min`/`let max` forks.
