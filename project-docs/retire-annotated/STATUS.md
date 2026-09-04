# Retire the annotated evaluator — STATUS

_Phase A of the 2026-09-03 assessment (`PLAN-v1-assessment.md`, sections "Decisions" and "Part 1")._

## Done (2026-09-03, branch `retire-annotated`)

- Deleted `src/evaluator/annotated.ts` (6,611 lines) and `src/evaluator/formatter.ts`.
- Removed `compileAnnotated` / `evaluateAnnotated` / `formatAnnotated` / `AnnotatedLine` / `AnnotatedOutput` / `FormatOptions` from the package surface, `--annotated` from the CLI, and the `compileAnnotated` worker message.
- Playground: removed `annotated-pane` (component + two CSS files), the header / breadcrumb toggles, the `annotatedOutput` / `annotatedOpen` store keys, the storybook entries, and the Annotated section of the debug capture. `url-state.ts` still reads the legacy `ao` key and ignores it.
- Shared modules: `value-semantics.ts`, `switch-match.ts` now take `Value`; `UserFunction.closure` is typed `Scope`; the "both evaluators" docblocks in `reserved-names`, `path-data`, `css-function-resolve`, `member-assign`, `struct-properties`, `builtin-enums`, `range-loop`, `segments`, `char-class`, `iteration-lock`, `ast.ts`, `pathogen.grammar`, `ast-builder.ts` are rewritten. The `Comment` AST node stays — the formatter re-emits it.
- Tests: `tests/annotated.test.ts` deleted; annotated blocks removed from `cli`, `path-roundtrip`, `segment-labels`, `path-blocks`, `errors`, `stroke-geometry`, `style-value-interpolation`, `constructor-registry`, `struct-properties`. Re-homed as `compile()` pins: offset() round/miter/bevel joins, multi-contour `ProjectedPath.draw()`, in-place draw, `rotate()` about a point, PathBlock/ProjectedPath `centerPoint()`, text-in-`if` inside text blocks, template-fragment splicing in filter values, struct numeric-property destructuring parity.
- CLI: unknown dash-prefixed options now exit 1 with `Error: Unknown option '--x'` (they were silently ignored, so `--annotated` would have quietly produced default output). Test in `tests/cli.test.ts`.
- Docs: `docs/cli.md` § Annotated Output removed; caveats in `docs/path-blocks.md`, `docs/variable-offset.md`, `website/blog/pathblock-cutting.md` removed; `website/_worker.ts` marketing line; `src/CLAUDE.md`, `.claude/CLAUDE.md`, lifecycle checklist; CHANGELOG entry.

## Resolved by deletion (previously recorded annotated-only gaps)

`struct-destructuring/bug-ctx-transform-annotated.md`, `language-service-audit` (README risks + `--annotated` gap list), `regex-audit` (naive `toFixed(4)` / missing `bridgeOriginGap`), `style-block-structure` (CSS function args), `cutting-room` FEATURE-OPPORTUNITIES #7b / #10 / #19, `switch-case` (per-statement scope), `angle-values` (two template formatters), `angle-preserving-stdlib` (dispatch cast), `variable-offset` design-note limitation, `path-cutting` STATUS "not supported in annotated", `rotate-labels` inline project mapper, `array-first-last-filter` "cannot be unified" note, `segment-suffixes-and-labels` mirroring plan, `known-issues.md` ISSUE-001 impact #1. Those documents are historical and were NOT rewritten.

## Not done / follow-ups

- `parseWithComments` / `extractComments` (`src/parser/index.ts`) have no production consumer now; only `tests/parser.test.ts` uses them. Left exported.
- `splitPathCommands` (`src/evaluator/path-data.ts`) is covered by `tests/path-data.test.ts` only; no production consumer.
- Optional simplification: collapse the `MatchHost` indirection in `switch-match.ts` now that only one evaluator supplies it.
- Phase C (debug features) replaces the debugging value: warnings channel, `--json` trace, PathBlock `.d` / `.commands`, `assert()`, `ln()` / `log()` split, `expectCommandSequence`, `validate:samples`.
