# Plan: `.centerPoint()` on PathBlock and ProjectedPath

## Context

Users who want to rotate, scale, or label a shape about its visual center currently have to build the center by hand from `boundingBox()`. The docs themselves do this in the `cut()` example (`docs/path-blocks.md:497-498`):

```
let pb = p.boundingBox();
let c = Point(calc(pb.x + pb.width / 2), calc(pb.y + pb.height / 2));
```

`centerPoint()` collapses that to `let c = p.centerPoint();`. It returns a real `Point` (so `.x`, `.y`, `.translate()`, `.distanceTo()` etc. work), computed from the same axis-aligned bounding box `boundingBox()` reports (curve and arc extrema included). It is available on both receivers; the codebase spells the second one `ProjectedPath` (type `ProjectedPathValue`), which is what the request calls "ProjectPathBlock".

Semantics:
- `centerPoint()` takes 0 arguments; `centerPoint(1)` throws `centerPoint() expects 0 arguments` (mirrors `boundingBox()`).
- PathBlock → relative coordinates; ProjectedPath → absolute coordinates (same rule as `boundingBox()`).
- Empty path → `Point(0, 0)` (because `computeBoundingBox` returns `{0,0,0,0}` for no commands).

Not in scope: a `.center` property on the bounding-box object, and TextBlock/ProjectedText (they already have `anchor(BBoxAnchor.Center)`).

## Order of work

Docs first, then failing tests, then the evaluators, then language services, then verification (per `src/CLAUDE.md` lifecycle).

### 0. Housekeeping (not feature work)

- Write memory `feedback_no_node_modules_search.md`: never read/grep/glob `node_modules/`, `dist/`, `public/`; every Agent prompt must carry that exclusion explicitly. Add the pointer line to `MEMORY.md`.
- Create `project-docs/pathblock-center-point/` and copy this plan there as `plan-v1.md` (artifact-preservation convention).

### 1. Docs — `docs/path-blocks.md` (already registered in `DOC_FILES` as `path-blocks.md`)

- Insert a new H3 immediately after the `boundingBox()` section (after line 310, before `### intersects(geometry)`), matching the file's method format (signature heading, one or two sentences, untagged fenced example with `//` result comments):

  ```
  ### `centerPoint()` → Point

  Returns the center of the path's bounding box as a Point. It is the same box `boundingBox()` reports, so Bézier and arc extrema are included, not just endpoints. Use it to rotate or scale about a shape's visual center, or to place a label in the middle of a shape.

  let plate = @{ h 60 v 40 h -60 z };
  let center = plate.centerPoint();
  log(center);                       // Point(30, 20)
  let spun = plate.rotate(0.1, center);
  ```
  Plus a second short example showing curve extrema (`@{ c 0 -40 50 -40 50 0 }` → `Point(25, -15)`).
- Rewrite the `cut()` example at lines 496-502 to use `centerPoint()` and descriptive names (`piece`, `center`) instead of `p`/`pb`/`c`.
- In `### Transforms on ProjectedPath` (line 573-585), add a `proj.centerPoint()` line showing absolute coordinates (`Point(60, 20)` for `@{ h 100 }.project(10, 20)`).
- Optionally add `centerPoint()` to the method list in the `fromGlyph` "Returns" sentence at line 1305.
- Run `npm run build:docs`; run the `content-reviewer` agent on the diff (docs/CLAUDE.md requires agentic review before commit) and show the user the synthesis.

### 2. Tests (write before implementing)

`tests/path-blocks.test.ts` — new `describe('centerPoint()')` right after the `boundingBox()` block (ends line 1353), same `compile()` + `result.logs[0].parts[n].value` idiom; Point results assert the formatted string `'Point(x, y)'` as the `reverse()` tests do at line 1268:
- horizontal line `@{ h 100 }` → `Point(50, 0)`
- closed rect `@{ h 40 v 20 h -40 z }` → `Point(20, 10)`
- negative coords `@{ h -50 v -30 }` → `Point(-25, -15)` (compare via `Number(...)`)
- cubic extrema `@{ c 0 -40 50 -40 50 0 }` → `Point(25, -15)` (bbox y = -30 at t = 0.5; derive, don't approximate)
- ProjectedPath absolute: `@{ h 100 }.project(10, 20).centerPoint()` → `Point(60, 20)`
- result is a real Point: `.x`/`.y` access and `.translate(5, 5)` chain → `Point(55, 5)`
- empty path block → `Point(0, 0)`
- the docs `cut()` example compiles and produces one path per piece
- arity: `p.centerPoint(1)` throws `/0 arguments/`
- annotated parity: `compileAnnotated` of `let c = p.centerPoint(); M calc(c.x) calc(c.y)` contains `M 50 0`; same for a ProjectedPath receiver.

`tests/language-services/completion.test.ts`:
- line 416-423: add `expect(names).toContain('centerPoint')`, and assert its `detail` text (per language-services CLAUDE.md: label-only assertions are not enough).
- `method return type completions` (line 786): add `offers Point members after .centerPoint()` → `x`, `y`, `translate`; and `infers Point from variable assignment` for `let c = s.centerPoint();\nc.`. Cover a ProjectedPath receiver too.

`tests/language-services/hover.test.ts` binding-form matrix (line 453): add a row `let c = p.centerPoint();` → `type: 'Point'`.

`tests/language-services/inlay-hints.test.ts`: add a `: Point` type-hint case for `let c = s.centerPoint();` next to the Point constructor case at line 94.

### 3. Evaluators

- `src/evaluator/path-transforms.ts` (after `computeBoundingBox`, line 252): add the single source of the math
  ```ts
  export function computeBoundingBoxCenter(commands: TransformCmd[]): { x: number; y: number } {
    const bb = computeBoundingBox(commands);
    return { x: bb.x + bb.width / 2, y: bb.y + bb.height / 2 };
  }
  ```
- `src/evaluator/index.ts`: add `case 'centerPoint'` next to `boundingBox` in both receiver switches — PathBlock branch (line 2758) and ProjectedPath branch (line 3464). Body: arity check with `mError('centerPoint() expects 0 arguments')`, then `return { type: 'PointValue' as const, x, y }` (the same Point shape `get()` returns at line 2615). Import `computeBoundingBoxCenter`.
- `src/evaluator/annotated.ts`: add the same case to the shared `evaluateAnnotatedPathTransforms` helper (line 1499, uses `throw new Error(...)`); it already serves both receivers via the call sites at 1991 and 2077. Return `PointValue` here too, so `.x`/`.y` resolve through `struct-properties.ts` in both evaluators.

### 4. Language services

- `src/pathogen-api.ts`: add `/** centerPoint() — Center of the bounding box as a Point */ centerPoint(): PathogenPoint;` after `boundingBox()` in both `PathogenPathBlock` (line 781) and `PathogenProjectedPath` (line 1154). Because the return type names a `@type`-tagged interface, `TYPE_METHOD_RETURNS[PathBlock|ProjectedPath].centerPoint = 'Point'` is generated, which drives chained completion and hover through `member-resolution.ts:82-97` and `type-inference-ast.ts:272`. No edit to the legacy `type-inference.ts` map is needed.
- Run `npm run generate:completions`; confirm `npm run check:completions` is clean.
- `src/language-services/inlay-hints.ts:362`: extend the hand-maintained Point line to `expr.method === 'get' || expr.method === 'anchor' || expr.method === 'centerPoint'`.
- No TextMate grammar or snippet change: method names are not enumerated there (grep confirmed).

### 5. Changelog and artifacts

- `CHANGELOG.md`: new version heading dated 2026-09-02 (the last entry, 0.8.0, is also today, so this feature is the only new work), `Added → Core` entry.
- `project-docs/pathblock-center-point/`: `centerpoint-demo.pathogen` (shape rotated about its center, plus a label placed at the center), and the CLI-rendered `.svg` and a `.png` of it.

## Verification

1. `npx vitest run tests/path-blocks.test.ts tests/language-services/completion.test.ts tests/language-services/hover.test.ts tests/language-services/inlay-hints.test.ts tests/language-services/generate-completions.test.ts` — all green.
2. `npm run check:completions` and `npm run build:docs` clean; `npm run check-links` on the docs page.
3. Full suite `npm run test:run`, then the `code-reviewer` agent on the diff (tell it: no `git stash`, no `node_modules`).
4. Three-surface parity with the demo program:
   - CLI: `npm run cli -- project-docs/pathblock-center-point/centerpoint-demo.pathogen --output-svg-file ...` and check the `log()` output shows `Point(...)`.
   - Playground: `npm run build`, then `npm run dev:website`, load the demo via `/workspace/scratch?state=`; confirm it renders identically, and that typing `shape.` offers `centerPoint` with hover text.
   - VS Code: rebuild `packages/pathogen-language-server` against the fresh `dist/` (it typechecks against `dist/index.d.ts`), and confirm the generated completion data reaches it. No preview change is needed since the method adds no new SVG output.
5. Commit only after the user has seen the docs review synthesis (docs/CLAUDE.md rule); stage the docs, src, tests, changelog, and project-docs sources.
