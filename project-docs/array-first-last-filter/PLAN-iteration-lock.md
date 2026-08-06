# Commit array feature, then lock arrays against mutation during iteration

## Context

The `.first`/`.last`/`.filter()` feature is complete and verified (full suite green, both reviews approved, revisions applied) but uncommitted. Code review confirmed a pre-existing quirk that `.filter` inherited from `.map`: iteration loops re-read `obj.elements.length` every pass, so a callback that pushes to the array being iterated (via the `arrayRef` param **or** the enclosing-scope variable — they are the same object) visits the appended elements. The same hazard exists in `for (x in arr)` loops. Decision: commit and push the feature as-is, then fix by making arrays **read-only while they are being iterated** — mutations throw a clear error. Per user decision, the lock applies to callback methods **and** for-each loops.

## Answer to "can arrayRef be immutable, and what are the implications?"

Yes — but not by changing what we pass. `arrayRef` **is** the receiver (same `ArrayValue` object), and the receiver is also reachable through the callback's closure (`a.filter {|x| a.push(1); }`), so param-level immutability or passing a copy would be either illusory or silently identity-breaking. The correct realization is a **temporary iteration lock on the ArrayValue itself**: a counter field incremented before the loop, decremented in `finally`, checked by every mutating operation. Implications:

- **Semantic change to shipped methods** — `.map`/`.reduce`/`.sort`/for-each already shipped with the permissive behavior; mutation during iteration will now throw loudly. Goes in CHANGELOG under `### Changed`. Almost certainly only breaks programs that were already buggy — except the for-each worklist pattern (`for (job in queue) { queue.push(...) }`), which was a deliberate casualty of the user's scope decision; docs will show `for (x in arr.slice(0))` (iterate a copy) as the escape hatch.
- **Stricter than JavaScript** (JS allows mutation and snapshots length in map/filter; allows it in for-of). Must be documented as intentional.
- **Counter, not boolean** — nested read-only iteration of the same array (`arr.filter {|x| ... arr.map {...} ...}`) is legal and must stay legal; and none of the 8 callback loops has a `finally` today (all are catch-and-rethrow), so lock release needs new try/finally wrappers or a thrown error would strand the lock.
- **Known boundary (pre-existing, out of scope)**: `PathBlock.subPathCommands` wraps live internal `cmd.args` arrays in fresh `ArrayValue` wrappers per read (`index.ts:5724`, `5838`), so a lock on one wrapper doesn't cover a second wrapper over the same backing array. The lock guards the array object being iterated, which is the stated goal.

## Part A — Commit and push the shipped feature

1. `CHANGELOG.md`: add a new block at top: `## [Unreleased] - 2026-08-06 (arrays: .first / .last / .filter)` with `### Added` → `#### Core` (feature bullets), `#### Documentation` (syntax.md sections + the three passages corrected: "nine callback builtins" ×2, Null intro), `#### Development` (debug script + test-count line). Match the long-form prose style of the existing blocks. (Exploration confirmed all five prior commits already have entries — only this feature is missing.)
2. Preserve artifacts per project convention: create `project-docs/array-first-last-filter/` with the plan and the two review syntheses (code review + 4-persona content review).
3. Stage exactly the feature files: `docs/syntax.md`, `src/callback-methods.ts`, `src/evaluator/index.ts`, `src/evaluator/annotated.ts`, `src/pathogen-api.ts`, `src/language-services/{completion-data.generated.ts,inlay-hints.ts,type-inference-ast.ts}`, `tests/{evaluator,annotated,errors,lambdas}.test.ts`, `tests/language-services/completion.test.ts`, `scripts/CLAUDE.md`, `scripts/debug-array-first-last-filter.ts`, `CHANGELOG.md`, `project-docs/array-first-last-filter/`. **Exclude** the unrelated pre-existing changes: `project-docs/pdf-export/verify/*`, `WEEKLY-SUMMARY-2026-07-19.md`, `api/.wrangler-backup*`. (`public/`, `website/docs-static/`, `playground/utils/docs-content.js` are gitignored — verified.)
4. Commit `feat(lang): array .first/.last properties and .filter() method` (+ Co-Authored-By footer), push to `origin main`.

## Part B — Iteration lock (docs first, per policy)

### B1. Docs — `docs/syntax.md`
- Authoritative paragraph under `### Reference Semantics` (~line 1088): arrays are read-only while being iterated; mutating methods and `arr[i] = x` throw; nested read-only iteration fine; `.slice(0)` copy is the escape hatch for mutate-while-iterating needs.
- One-sentence pointers: the mutate-vs-copy note (~line 1006), the `arrayRef` bullet in `.map`/`.filter`/`.reduce` param lists ("reading is fine; mutating throws"), the `.sort` comparator-restriction sentence (~1077), and `### For-Each Iteration` (~1110) including the worklist caveat + copy idiom.
- `npm run build:docs`; content review (agentic, user sign-off) before the Part B commit.

### B2. Shared lock helper — new `src/evaluator/iteration-lock.ts`
Single source for both evaluators (their `ArrayValue` types are separate but structurally identical — cannot be unified, see `annotated.ts:332` comment):
- `lockArray(a)` / `unlockArray(a)` managing `iterationLock?: number` counter
- `arrayMutationError(op: string): string` — returns the message text; each evaluator wraps it in its own error formatter (`mError` / `formatError`). Message pattern: `Cannot <op> an array while it is being iterated — callbacks and for-each bodies receive the array read-only. Iterate a copy with .slice(0) if you need to mutate.`

### B3. Type field (two places, deliberately duplicated)
- `src/evaluator/types.ts:90-93` ArrayValue: add `iterationLock?: number`
- `src/evaluator/annotated.ts:464-467` local ArrayValue: same

### B4. Lock acquire/release — wrap loops in try/finally (none exists today)
- Main evaluator `src/evaluator/index.ts`: `map` (~5379), `filter` (~5414), `reduce` (~5452), `sort` (~5520, around the comparator-driven `sorted.sort(...)` — sort copies elements but the receiver must still be locked during comparator execution), for-each ×3: statement driver ~8574, text-block walker ~2041, path-block walker ~8229 (lock only when the iterable is an ArrayValue — ranges unaffected).
- Annotated `src/evaluator/annotated.ts`: `map` (~3142), `filter` (~3168), `reduce` (~3197), `sort` (~3257), for-each ×3: walkers ~5442, ~5833, text-body ~3858.
- for-each `break`/`continue` (no-throw LoopFlow codes) and `return` (ReturnSignal throw) both exit through the `finally`.

### B5. Mutation guards
- `push`/`pop`/`shift`/`unshift` cases: `index.ts:5357/5363/5368/5373`, `annotated.ts:3120/3126/3131/3136`
- `IndexedAssignmentStatement` — **three** sites: `index.ts:8485`, `annotated.ts:5404`, and the second annotated walker `annotated.ts:5789` (easy to miss).

### B6. Tests (no language-services changes needed — runtime-only behavior)
- `tests/evaluator.test.ts` new `describe('iteration lock')`: push/pop/unshift/shift inside `.filter`/`.map`/`.reduce` callback throws (via arrayRef and via closure variable); `arr[i] = x` inside a callback throws; push inside `for (x in arr)` throws; sort-comparator push throws; nested read-only iteration of the same array works; mutation of a *different* array inside a callback works (incl. building result arrays); mutation after iteration completes works (lock released); `for (x in arr.slice(0)) { arr.push(...) }` works and terminates; `arr.reduce(arr) {...}` pushing to the accumulator throws (acc === locked receiver).
- `tests/annotated.test.ts`: parity block for a representative subset + identical error regex.
- `tests/errors.test.ts`: exact message assertions.
- Full `npm run test:run` before commit.

### B7. Verification + ship
- CLI: mutation program errors with the new message; read-only programs from Part A still work (`npm run cli`).
- `npm run build`; extend `scripts/debug-array-first-last-filter.ts` with a third scenario (mutation inside filter surfaces the lock error in the playground error panel); re-stage fresh bundles into `public/dist/` for the running dev server (NOT a plain website rebuild — dev:stack is running).
- `@code-reviewer` agent; CHANGELOG block (`### Changed` — behavior change called out); commit `fix(lang): lock arrays against mutation during iteration` + push.

## Out of scope (flagged as follow-ups, not silently dropped)
- Grid callbacks (`Grid.fill/map/forEach`) — no gridRef param exists; grid dimensions are fixed so nothing grows mid-iteration; re-entrant `grid.fill` interleaving is a separate concern.
- `PathBlock.subPathCommands` live-args aliasing (pre-existing, above).
