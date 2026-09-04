# Phase C — Debuggability features + an agent debugging playbook

_Phases A (retire annotated, `fe78555`) and B (`#{` opener, `91530db`) are
done on branch `retire-annotated`; the original assessment is preserved at
`project-docs/retire-annotated/PLAN-v1-assessment.md`. This plan covers
Phase C only. Status: DRAFT — filling in from exploration._

## Context

The annotated evaluator is gone. Its debugging value (why did this vertex
not fillet, what did this block emit, where did this command come from)
must now come from first-class features that serve users AND the agent
that authors samples. The 2026-09-03 survey found the biggest wins are
things the compiler already computes but never surfaces: geometry warnings
pushed into `log()` output as untyped strings without a line, a structured
command trace behind `trackHistory` with no consumer, per-fragment source
locations in `PathRecord`, and a sample validator with no npm script.

The user greenlit four bundles (2026-09-03) and added one deliverable
(2026-09-04): a usage guide for the new and existing debugging features,
written for the agent, based on prior sample-authoring experience, kept
where every session sees it (a CLAUDE.md, or referenced from one).

## Decisions (user, 2026-09-04)

- Playbook lives in its own file,
  `project-docs/developer-experience/pathogen-debugging-playbook.md`,
  referenced from `.claude/CLAUDE.md` (always loaded) and `src/CLAUDE.md`,
  plus a memory pointer.
- `log(...)` stays the console-logging call. The natural logarithm moves to
  `ln(x)`. `log(...)` used as a VALUE is a compile error naming `ln()`.

## Deliverables

1. **Warnings channel** — `CompileResult.warnings` with source lines; CLI
   stderr, playground console chip, LSP `Warning` diagnostics.
2. **`--json` / trace output** — machine-readable compile result for the
   CLI and a `trace` option on `compile()`.
3. **Introspection** — PathBlock `.d` / `.commands`, Color readback, richer
   `log()` display; `assert(cond, message?)`.
4. **`log()` / `ln()` split** — `log` is logging only; `ln(x)` is the natural
   log; `expectCommandSequence`-style test helper (may already exist as
   `expectSVGPathCommandSequence`).
5. **`npm run validate:samples`** + CLI `--png`.
6. **Agent debugging & authoring playbook** — new file referenced from
   `.claude/CLAUDE.md`, plus a memory pointer.

## Findings that shape the design (verified 2026-09-04)

- **Warnings are already located, then thrown away.** 19 `'[warn] '`
  pushes in `src/evaluator/index.ts` (`:1990-1998, :2005, :3044-3134,
  :3176, :3678-3758, :3798, :3904, :9749, :9799, :10307`) plus
  `font-provider.ts:402`; three more use a `Warning:` prefix
  (`:10067, :10116, :10160`). At the method-dispatch sites `mLine`/`mCol`
  (`:2264-2268`) are in scope; `RecordedCornerOp.loc` (`types.ts:530`) is
  in scope at `segments.ts:458` unused; `PathRecord.loc` is dropped by the
  `flatMap` at `:9746`/`:9795`. So lines cost nothing new.
- `CompileResult` (`types.ts:971-997`) has no `warnings`; the playground
  consumes `EvaluateWithContextResult` (`index.ts:10383-10398`), whose
  builder re-projects fields by hand (`:10474-10489`) — a new field must be
  added in BOTH places and in `playground/types/compiler.d.ts:236-316`.
- `tests/font-provider.test.ts:516-624` and `compiler-worker-fonts.test.ts:149`
  assert `logs[].parts[0].value.startsWith('[warn]')`; `docs/path-blocks.md:1068,1484`
  document `[warn]` log entries. Keep the mirrored log entry.
- `LayerOutput` (`types.ts:774-785`) has no `records`; `buildMetadata`
  (`src/render/build-tree.ts:122-148`) is the live JSON shape to extend;
  `cli.ts:288-302` is a dead duplicate — don't touch it. `--json` is free;
  `-o` takes the next argv, every other flag is `--k=v`.
- `trackHistory` lives only on `compileWithContext` (`src/index.ts:215-222`);
  `compile()` cannot trace today.
- `assert` cannot be a plain stdlib function: the stdlib dispatch coerces
  args to numbers (`index.ts:7787`). `log` is dispatched first thing in
  `evaluateFunctionCall` (`:6581`); `isMathLogCandidate` (`:6563-6575`)
  picks `Math.log` for a bare number literal or a stdlib call. `log: Math.log`
  lives at `src/stdlib/math.ts:48`; `exp/log10/log2` exist, `ln` does not.
- `scripts/generate-completions.ts crossCheck` (`:39-97`, enforced by
  `npm run check:completions`) fails on a `pathogen-api.ts` declaration with
  no runtime name. Runtime names = `stdlib ∪ contextAwareFunctions ∪
  constructor-registry groups`. Removing `log` from stdlib or adding
  `assert` therefore needs a new registry group for statement builtins.
- `evaluateTextBody` (`index.ts:8508`) has NO `ExpressionStatement` branch:
  `log(...)` inside a `text(x,y){}` body is silently skipped today.
- PathBlock members are a hard-coded switch (`index.ts:6036-6121`),
  ProjectedPath likewise (`:6150-6180`); struct-properties.ts has no entry
  for either. `.draw()` serializes via `serializeRelativeAndTrack`
  (`path-data.ts:487`), `commandsToRelativeD(commands, { bridgeOriginGap })`
  (`:276`) and `commandsToAbsoluteD` (`:419`) are the context-free forms.
- **Color readback already exists** (`struct-properties.ts:79-89`: `css, hex,
  oklch, hsl, rgb, lightness, chroma, hue, a`) — that item is done; the
  playbook documents it.
- `formatValueForDisplay` (`index.ts:5915-5999`) prints
  `PathBlock(N commands)` / `ProjectedPath(x, y → x, y)`.
- Test helpers are d-string based (`tests/helpers.ts:100-148`
  `expectSVGPathCommandSequence`); nothing accepts `PathBlockCommand[]` or
  `context.commands`. `tests/CLAUDE.md` omits `extractSVGElements`.
- Playground pre-existing bug: `workspace-view.ts:1139` assigns
  `consolePane.logs` directly and nothing ever `store.set('logs')`, so
  `debug-capture.ts:20` always prints "(no log output)".
- `diagnostics.ts` Phase 3 (`:104-124`) discards the `evaluate()` result;
  `DiagnosticSeverity.Warning` is never emitted; the LSP server already maps
  it (`server.ts:544-545`).

## Design

### C1. Warnings channel
- `types.ts`: `interface CompileWarning { message: string; line?: number; column?: number; code: WarningCode }` with codes `corner-op`, `cut`, `annotation-transfer`, `font-glyph`, `gradient`; `CompileResult.warnings: CompileWarning[]`; `LogEntry.severity?: 'warn'`.
- One helper in `index.ts`: `warn(evalState, code, message, loc?)` pushes the structured warning AND the mirrored `[warn] …` log entry (now with `line`). Replace all 19 + 3 `Warning:` pushes; thread `loc` from `mLine/mCol`, `getLine(expr)`, `RecordedCornerOp.loc` (segments.ts returns `{message, loc?}` instead of strings), `PathRecord.loc` for the finalization sites, `null` for the font aggregate.
- Add `warnings` to `EvaluateWithContextResult` + its builder, `playground/types/compiler.d.ts`.
- CLI: after `outputLogs`, print `file:line:col: warning: message` (or `warning: message`) to stderr always (not gated on `--print-logs`), exit 0.
- Playground: `log-entry.ts` renders `severity === 'warn'` with a `warn` class + chip; `workspace-view.ts` also `store.set('logs', result.logs)` (fixes debug-capture).
- LSP: `diagnostics.ts` Phase 3 keeps the result and maps `warnings` → `DiagnosticSeverity.Warning` with `makeRange` (skip when no line).
- Tests: `tests/warnings.test.ts` — one fixture per code asserting message + line; font tests untouched; diagnostics test for a warning squiggle; CLI stderr test.

### C2. `--json` / trace
- `CompileOptions.trace?: boolean` (src/index.ts:181) → `EvaluateOptions.trackHistory` + `keepRecords`. `compileWithContext` gets `keepRecords` too.
- `LayerOutput.records?: PathRecordOutput[]` = `{ loc?, label?, raw, commandCount }` populated in `buildCompileResult` only when `keepRecords` (per-keystroke playground compiles stay lean).
- `CompileResult.commands?: CommandHistoryEntry[]` when `trace`.
- CLI `--json`: implies trace; prints one JSON document to stdout (or to `-o`): `{ viewBox, layers: [{ name, type, d, styles, records }], defs: { masks, clipPaths, gradients, patterns, markers, filters }, cssProperties, logs, warnings, commands }`; reuse `buildMetadata` pieces from `build-tree.ts`. Mutually exclusive with `--output-svg-file`.
- `debug-capture.ts` adds a "Structured result" section from `compileWithContext(code, { trace: true })`? — NO: keep capture cheap; it gains warnings + records counts only.
- Tests: `tests/trace.test.ts` (records loc/label, commands via `compile(src,{trace:true})`), CLI `--json` shape test.

### C3. Introspection + `assert`
- `index.ts` PathBlock switch: `d` → `commandsToRelativeD(obj.commands, { bridgeOriginGap: true })`; `commands` → `ArrayValue` of `ObjectValue { command, args: number[], start: Point, end: Point }`; ProjectedPath: `d` → `commandsToAbsoluteD`, `commands` same shape. `formatValueForDisplay`: `PathBlock(3 commands: h 40 v 40 z)` (first 6 commands, then `…`).
- `pathogen-api.ts` PathBlock/ProjectedPath interfaces: `readonly d: string; readonly commands: PathogenArray<PathCommandRecord>` (+ a `@type PathCommandRecord` interface) → `npm run generate:completions`.
- `assert(cond, message?)`: statement builtin next to `log` in `evaluateFunctionCall`; `isTruthy(cond)`; throws `formatError(\`assertion failed: ${msg}\`, getLine(call), getCol(call))` (message defaults to the source text of the condition via `expressionToSource`). Registered in a new `STATEMENT_BUILTINS` group in `constructor-registry.ts` (with `log`) and folded into `crossCheck` runtime names; declared in `pathogen-api.ts` (`@snippet assert(${1:condition}, '${2:message}');`).
- Fix `evaluateTextBody` (`:8508`): add the `ExpressionStatement` branch (delegating to the same statement dispatch) — coverage-matrix test: `log`/`assert` inside top level, `&{ }`, `text(){}`, loops, `apply`.

### C4. `log()` / `ln()` split + test helper
- `src/stdlib/math.ts`: remove `log`, add `ln: Math.log`; `pathogen-api.ts`: `ln(x)` declared, `log(...)` re-described as the logging statement (`@kind function`, returns nothing).
- `index.ts`: delete `isMathLogCandidate`; `log`/`assert` are STATEMENT builtins: the `ExpressionStatement` branches of the three walkers + `evaluateStatements` route a `FunctionCall` named `log`/`assert` to `evaluateStatementBuiltin`; reaching `log(`/`assert(` in `evaluateFunctionCall` (value position) throws `log() records a message and has no value — use ln(x) for the natural logarithm` / `assert() is a statement`.
- Corpus sweep: `log(` in value position in docs/blog/samples (expect ~0; `docs/stdlib.md:49` row → `ln(x)`).
- `tests/helpers.ts`: `expectCommandSequence(commands: {command,args}[] , expected: [string, ...number[]][], { precision })` accepting `PathBlockCommand[]`, `CommandHistoryEntry[]`, or a `compileWithContext` result; add `extractSVGElements` to `tests/CLAUDE.md`.

### Corrections from design review (2026-09-04)
- **Statement-position calls are `PathCommand { command: '', args: [call] }`**
  (`ast-builder.ts:512-521`), not `ExpressionStatement`. `log("x");` flows
  `evaluateStatementToAccum` → `case 'PathCommand'` (`index.ts:8971`) →
  `evaluatePathCommand` → `evaluateFunctionCall` (`:6581`). Verified bug:
  `log(sqrt(9)); M 0 0` compiles to `"1.0986122886681096 M 0 0"` — the
  math result leaks into the path. Hook points are therefore `index.ts:8971`
  and `evaluateTextBlockBody` `:2107` (today `&{ log("hi"); }` throws
  "Path commands are not allowed inside text blocks").
- `text(x,y){ … }` bodies reject calls in the GRAMMAR (`pathogen.grammar:156-166`,
  `Missing ';'`), so the "evaluateTextBody silently skips log()" finding was
  wrong; `log` inside `text(){}` is a grammar extension → out of scope,
  drop from the matrix.
- Corpus has exactly ONE value-position natural-log use:
  `tests/evaluator.test.ts:280` `M calc(log(1)) 0` → `ln(1)`. Docs: one row.
  Language services assume nothing about `log` returning a number.
- Registry: export `STATEMENT_BUILTINS = ['log', 'assert'] as const` from
  `constructor-registry.ts` (NOT folded into `EVALUATOR_CONSTRUCTORS`) and
  wire four consumers: `generate-completions.ts:50-73`,
  `scope-analysis.ts:37` `STDLIB_NAMES`, `semantic-tokens.ts:47`,
  `code-actions.ts:27`; add `['statements', STATEMENT_BUILTINS]` to
  `tests/constructor-registry.test.ts` with canonical programs; add `assert`
  to the TextMate keyword list (`pathogen.tmLanguage.json:93`).
- C1: change only `applyRecordedCornerOps` (`segments.ts:184`, `finalizeSubpath`
  `:444-486` has `op.loc`) to return `{ message, loc? }[]`; leave
  path-transforms `string[]` (call sites have `mLine/mCol`). Four callers:
  `index.ts:2003, :2349, :9746, :9796`. CLI: skip `severity === 'warn'` log
  entries in the `--print-logs` loop to avoid double printing.
- C2: all record-bearing layers go through `storeToFinalizedData`
  (`index.ts:9791-9799`) → return `{ data, records? }` gated on
  `EvaluationState.keepRecords`; set in both state constructors
  (`:10339-10356`, `:10426-10443`). `buildMetadata` is not exported and strips
  `data` → new pure `src/render/json-document.ts` `toJsonDocument(result)`.
- `EvaluateWithContextResult` mirror in `playground/types/compiler.d.ts:303-316`
  already lacks `viewBox`/`missingGlyphs`; add `warnings` in both places.

### C5. `validate:samples` + `--png`
- `scripts/validate-samples.ts` globs pre-compiled `*.svg` (needs
  `compile:samples` first); `<dir>` positional is REQUIRED (`:249`);
  `--margin` is parsed but inert (`:253` vs `MARGIN_PX` const `:15`);
  `Warning['type']` union lists a never-emitted `viewbox` and omits the
  emitted `formatting` (`:37-40`, `:420`); previews go to
  `<dir>/previews/<name>.png` at 2× on `#0f172a` via `setContent` +
  `screenshot({ fullPage: true })` (`:282, :427`). Changes: default dir
  `website/blog/samples` (recursing per post) when omitted; make `--margin`
  real; fix the union; `package.json` `"validate:samples": "tsx scripts/validate-samples.ts"`;
  correct `website/blog/CLAUDE.md:165-173` (documents 6 checks incl. a
  nonexistent viewBox check; real list is 7).
- CLI `--png=<file>`: do NOT reuse `renderGpuSvg` (`cli.ts:582`, an SVG
  producer via `playground/bbwp.html`); implement launch → `setContent`
  (SVG inlined, explicit width/height, white background, `deviceScaleFactor`
  from `--scale`) → `screenshot({ clip })`, the shape of
  `project-docs/easing-interpolation/render-png.mjs:13-21`, behind the
  dynamic-import guard at `cli.ts:583-588` (puppeteer is a devDependency).
  Composes after `--render-gpu`. Requires `--output-svg-file` or writes the
  PNG from the in-memory SVG. Docs: `docs/cli.md` § Output Options + exit
  code note; `docs/debug.md` "seeing your output".

### C6 seeds (from prior sessions)
- `project-docs/radial-bar-chart/reflection.md:18-59` — "PNG preview
  self-evaluation was a turning point"; rule 5 = compile → validate-samples
  → read PNG → assess → iterate. `website/guidelines/text-collision-debugging.md`
  is the closest sibling; `website/blog/CLAUDE.md` §3.5 is the sample
  pipeline (cross-reference, don't duplicate). Friction-log convention:
  `project-docs/broken-lines/FRICTION-LOG.md:1-10`.
- Only `.claude/CLAUDE.md` is always loaded; nested CLAUDE.md files load
  when their subtree is touched.

## Implementation sequence (docs first for every step)

1. **Docs**: rewrite `docs/debug.md` (sections: Console + `log()`; Warnings;
   `assert()`; Seeing your output — `--png`, `validate:samples`, bbwp;
   Structured output — `--json`, `trace`, records, `.d`/`.commands`; the
   `ctx` material kept and fixed for mandatory semicolons); `docs/cli.md`
   (`--json`, `--png`, exit codes); `docs/stdlib.md:49` → `ln(x)` + a note
   that `log()` is the console statement; `docs/path-blocks.md` PathBlock
   property table (`d`, `commands`). Both pages are already in `DOC_FILES`.
2. **C4 + C3 statement builtins**: `STATEMENT_BUILTINS` + four consumers;
   `ln` in `math.ts`; `evaluateStatementBuiltin(call, scope)` holding the
   current log body + `assert`; hooks at `index.ts:8971` and `:2107`; value
   position throws (`log() records a message and has no value — use ln(x)
   for the natural logarithm` / `assert() is a statement`); delete
   `isMathLogCandidate`; `pathogen-api.ts` (`ln`, `log` returns void with
   `@snippet log(${1:value});`, `assert` with `@snippet`); regenerate
   completions; `tests/evaluator.test.ts:280` → `ln`; TextMate keyword.
   Tests: `tests/statement-builtins.test.ts` matrix (top level, for, if, fn,
   apply, `@{}`, `&{}`, constructor callback, lambda block; `log(sqrt(9))`
   no longer pollutes path data; value-position error text; assert
   pass/fail/default message/line:col); registry canonical programs;
   semantic-tokens + completion tests for `log`/`ln`/`assert`.
3. **C1 warnings**: types, `warn()` helper, 22 sites, `segments.ts` shape,
   result builders + `compiler.d.ts`, CLI stderr with dedupe, playground
   chip + `store.set('logs'/'warnings')`, LSP Warning mapping. Tests:
   `tests/warnings.test.ts` (one fixture per code, asserting message AND
   line), diagnostics Warning test, CLI stderr test.
4. **C2 trace / `--json`**: `keepRecords`, `CompileOptions.trace`,
   `storeToFinalizedData` → records, `LayerOutput.records`,
   `CompileResult.commands`, `src/render/json-document.ts`, CLI `--json`
   (stdout or `-o`; exclusive with `--output-svg-file`). Tests:
   `tests/trace.test.ts`, CLI `--json` shape.
5. **C3 introspection**: PathBlock/ProjectedPath `d` + `commands` in the
   member switches, display string, `pathogen-api.ts` + regenerate,
   `expectCommandSequence` in `tests/helpers.ts` (+ `helpers.test.ts`),
   `tests/CLAUDE.md` (add `extractSVGElements`, the new helper, decision-tree
   entry 2b for command arrays).
6. **C5**: `validate:samples` script + fixes; CLI `--png`; docs.
7. **C6 playbook** last (commands and warning codes final): write
   `project-docs/developer-experience/pathogen-debugging-playbook.md`; add
   the "Debugging samples" bullet to `.claude/CLAUDE.md` Agent Workflow
   Hints; rewrite `src/CLAUDE.md` step 4 to name `--png` / `--json`; row in
   `scripts/CLAUDE.md`; cross-links from `website/blog/CLAUDE.md` §3.5 and
   `website/guidelines/text-collision-debugging.md`; memory note.
8. CHANGELOG entry; `project-docs/debug-features/STATUS.md`; code review;
   full suite; commit (one PR, branch `retire-annotated`).

## Verification
- `npx tsx src/cli.ts -e 'let b = @{ h 40 v 40 h -40 z }; let f = b.fillet(30); M 0 0 f.draw()'`
  prints `1:…: warning: Fillet radius clamped …` to stderr and exit 0;
  `--json` shows the same under `warnings[0].line`.
- `npx tsx src/cli.ts -e 'log(sqrt(9)); M 0 0'` → path `M 0 0`, log `3`;
  `-e 'let y = log(3);'` → the ln() error; `ln(1)` → `0`.
- `assert(false, "x")` fails in CLI (exit 1, `Line 1, col 1: assertion
  failed: x`), playground error panel, VS Code diagnostic; `assert(true)` is
  silent.
- `log(circle(0,0,10))` prints `PathBlock(3 commands: m -10 0 a … )`;
  `log(p.d)` equals the `.draw()` emission for a block drawn at origin.
- `npx tsx src/cli.ts f.pathogen --output-svg-file=f.svg --png=f.png`
  writes a PNG the agent can Read; `npm run validate:samples` runs over
  `website/blog/samples` and writes previews.
- Full suite, build, `check:completions`, playground typecheck delta, lint
  delta, `build:docs` + link check, the three-surface parity check for
  warnings (CLI stderr, playground chip, VS Code squiggle).

### C6. Agent playbook
- New file `project-docs/developer-experience/pathogen-debugging-playbook.md`
  (agent-facing; NOT a docs/ page). Referenced from `.claude/CLAUDE.md`
  "Agent Workflow Hints" (one paragraph: when to open it) and from
  `src/CLAUDE.md` Development Lifecycle step 4. Memory pointer added.
- Sections: (1) the 90-second loop — write, `npx tsx src/cli.ts file --json`,
  read warnings first, `--output-svg-file` + `--png`, bbwp; (2) reading
  output — records/loc, commands, `.d`, `log()` display strings, warnings
  codes; (3) assertions as guardrails in samples; (4) known traps from
  prior sessions (cursor frozen inside `@{}`, polarLine relative/absolute,
  stdlib shapes emit absolute coords so `M x y circle()` ignores the M,
  `m l h v c s q t a z` shadow commands, `%` precedence, `arr[i](t)` not
  callable, `${'…'}` quoted fonts rejected in style values, formatter
  5-arg wrap, validate-samples bbox collisions, ranges inclusive + loop
  parens, `<<` worker rules, `${}` interpolation only in backticks/style
  values, `#{` opener, CLI `--stroke=none` for playground parity, CLI font
  file-stem workaround, GPU gradients need `--render-gpu`, Grid callback
  perf); (5) verifying across the three surfaces; (6) sample style rules
  (descriptive names, multiline path blocks, format:samples, bbwp index).
