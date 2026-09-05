# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased] - 2026-09-05 (dependency upgrade pass)

The first deliberate upgrade pass over `package.json` (root, `api/`, `packages/`). Every bump landed as its own commit with a named gate, so `git bisect` can isolate a regression to one dependency. Baseline and final state are identical on every gate: 131 test files / 5482 tests / 1 todo, root `tsc` error list (80 pre-existing) and playground `tsc` error list (7 pre-existing) byte-identical, `npm run build`, `build:website`, `build:vscode` and `npm ci` green.

### Changed

#### Development

- **Runtime pinned to Node 24.** New `.node-version` (read by Cloudflare Pages, nvm, fnm), `deploy-api.yml` moves from Node 22 to 24, `@types/node` 20 → 24, and `package.json` declares `engines.node >=22.12`. Watch the first Pages deploy after this lands — it is the first build on Node 24.
- **TypeScript 5.9 → 6.0.3** in the root, the language server and the VS Code extension. 6.0 is the last JavaScript-based TypeScript and turns every 7.0 deprecation into an error, which forced three config changes: root `tsconfig.json` now declares `types: ["node"]` (6.0 no longer auto-includes `@types/*`) and `lib: ["ES2022", "DOM", "DOM.Iterable"]` (the pan-zoom controller, zoom pill and `render/mount.ts` always used DOM types that previously leaked in through auto-included typings); both `packages/*/tsconfig.json` move from `module: commonjs` + `moduleResolution: node` (node10, now an error) to `module: nodenext`, which still emits CommonJS because neither package is `"type": "module"`; `tsup.config.ts` passes `ignoreDeprecations: "6.0"` to the declaration step only, because tsup 8.5.1's dts bundler injects the deprecated `baseUrl` option. **TypeScript 7 is held**: its `typescript` package exports only a version stub (the compiler API moved to `typescript/unstable/*`), which tsup's dts step, typescript-eslint (peer `<6.1.0`) and `scripts/lib/legacy-style-opener.ts` all still need.
- **Vitest 1.6 → 4.1.11** with `@vitest/coverage-v8` 4.1.11 (brings Vite 8). Every documented breaking change from 2.0 through 4.x was checked against the suite; none applied, zero test or config edits, wall time 39 s → 33 s. **Vitest 5.0.0 is held**: it shipped 2026-09-03, raises the Node floor to 22.12, changes the matcher augmentation shape to `Matchers<R, T>` and defaults `clearMocks` to true — revisit after 5.0.x patches.
- **marked 15 → 18** (with `marked-highlight` 2.2.4). Docs output is byte-identical; two blog pages lost the blank line marked used to emit after a raw `<img>` block (v18 trims trailing blank lines from block tokens), which is insignificant whitespace between block elements. `scripts/build-docs.ts` now renders each document with its own `Marked` instance instead of stacking a `use({ renderer })` call per document on the global singleton.
- **Commander 14 → 15** (ESM-only), **Puppeteer 24 → 25** (ESM-only), **Concurrently 9 → 10** — all Node ≥22 packages, covered by the Node 24 pin. Four scripts that still passed the long-removed `headless: 'new'` string through an `as any` cast now use `headless: true`.
- **ts-morph 27 → 28** — `npm run check:completions` regenerates `completion-data.generated.ts` byte-identically.
- **vscode-languageserver / vscode-languageclient 9 → 10** (LSP 3.18); `engines.vscode` and `@types/vscode` move from `^1.85.0` to `^1.91.0` as the client requires. The server's code-action handler normalizes the widened `Diagnostic.message` (`string | MarkupContent`) back to the plain string our language-services type carries.
- **Lint toolchain**: eslint 9.39.5, `@eslint/js` 9.39.5, `@eslint/compat` 2.1.1, `eslint-config-airbnb-extended` 3.2.0 (pulls eslint-plugin-n 18, import-x 4.17, typescript-eslint 8.69), `eslint-plugin-prettier` 5.5.6, `globals` 17.12, Prettier 3.9.6. Lint is not enforced in this repo; the problem count moved 5654 → 5777 on a clean checkout, entirely from typescript-eslint detecting more unnecessary type assertions (177 → 306), Prettier 3.9 formatting preferences (+11) and import-x flagging `@types/vscode` (+2). **ESLint 10 is held** because `eslint-config-airbnb-extended` peers `eslint ^9`.
- **Patch/minor**: `@lezer/common` 1.5.2, `@lezer/lr` 1.4.10, `@types/opentype.js` 1.3.10, `@webgpu/types` 0.1.72, jsdom 29.1.1, highlight.js 11.12, esbuild 0.27.7 (staying on the 0.27 line tsup pins; 0.28 held), wrangler 4.129 in both the root and `api/` (the root range was a stale `^4.69.0`), `hdr-color-input` 0.4.4 (the shadow `button.trigger` the playground reaches into still exists — checked headlessly with 8 upgraded chips), `svg2pdf.js` 2.8.1 (the data-URI regex vendor patch still applies exactly once), `vscode-languageserver-textdocument` 1.0.14, tsx 4.23.
- **opentype.js stays at 1.3.4.** 2.0.0 was attempted and reverted: its text shaper runs the `ccmp` GSUB step unconditionally with no feature gate or error handling, so any font whose `ccmp` uses a chaining-context lookup (Inter, in our fixtures) makes `Font.getPath` / `getAdvanceWidth` throw `substFormat: 2 is not yet supported` — 15 font tests failed. Upstream issue #627 (open since 2023) covers the same error class. Revisit when a 2.x release gates or catches that step; 2.0's fixes for hostile fonts (CFF subroutine recursion, circular composite glyphs, hinting-VM loops) are the reason to keep trying.

### Fixed

#### Core

- **The published CLI could never render a PNG.** tsup inlines devDependencies, so the CLI's lazy `import('puppeteer')` became a code-split CommonJS chunk that died with `Dynamic require of "http" is not supported`, and `--png` / `--render-gpu` reported "requires puppeteer" even with Puppeteer installed — only `npx tsx src/cli.ts` ever worked. `puppeteer` and `esbuild` are now external to the CLI bundle and resolve from the caller's install; the built CLI renders the same PNG and byte-identical SVG as the tsx path, WebGPU path included.

#### Development

- `npx eslint .` no longer aborts with "You have used a rule which requires type information" — the `.mjs` probe scripts under `scripts/` and `project-docs/` sit outside every tsconfig project and are now ignored, so lint runs to completion again.
- `scripts/build-vscode-extension.ts` installed the language server's runtime dependencies into the `.vsix` at `@latest`, so the bundle could ship a different major than the server was compiled against. It now installs the ranges the server's `package.json` declares.

## [0.8.1] - 2026-09-05 (many-warnings hardening)

### Changed

#### Core

- **Repeated warnings collapse to one row per family on every surface.** A family is the warning code, its source position, and the message with every number replaced by `#` (`Fillet radius clamped at vertex #: effective radius #`), so the thousands of near-identical corner-op warnings a glyph-filleting program emits from one call site become two rows instead of thousands. `groupWarnings()`, `groupWarnLogEntries()`, `warningFamily()`, and `WARNING_GROUP_INSTANCE_LIMIT` (200) are exported from the library (`src/evaluator/warning-groups.ts`). CLI stderr prints the first instance of each family followed by `  … N more like this`; `--json` and `CompileResult.warnings` still carry every instance. LSP diagnostics publish one `Warning` per family with `(×N similar)` appended. Tests: `tests/warning-groups.test.ts`, `tests/cli.test.ts`, `tests/warnings.test.ts`.

#### Playground

- **Console** shows one row per warning family at its first occurrence with a `×N` chip; clicking the chip lists up to 200 instances with a `… N more` trailer. Plain `log()` rows are unchanged. Test: `tests/playground-console-grouping.test.ts`; browser check: `project-docs/debug-features/verify/many-warnings-e2e.mjs` (6,000 warning mirrors → 2 rows).
- **Copy Debug Info** lists warnings once per family with `(×N)` and no longer repeats the `[warn]` log mirrors under Log Output. Test: `tests/playground-debug-capture.test.ts`.

#### Documentation

- `docs/debug.md` gains a "Repeated warnings" section describing the grouping on each surface; `docs/cli.md` documents the stderr count line.

### Fixed

#### Playground

- **"Maximum call stack size exceeded" after a correct render.** A program that applied `fillet()` to every glyph contour emitted thousands of corner-op warnings at one call site. The editor squiggle added in 0.8.0 built one decoration per warning, so CodeMirror nested thousands of identical mark spans on one token and overflowed the stack while rendering them; the exception escaped the success path of `updatePreview`, was reported as a compile error, and left the layers panel empty even though the SVG had already rendered. Highlight positions are now deduplicated by (line, column, severity) and capped at `MAX_HIGHLIGHT_POSITIONS` (200) before any decoration is built, and a decoration failure can no longer masquerade as a compile error. Regression test: `tests/playground-error-highlight.test.ts`.
- **Copy Debug Info** caps each section (layers, log output, warnings) at 200 rows and reports how many were left out, instead of producing a 10,000-line paste.
- **Vector-mode PDF export of artwork with a rasterized gradient failed with "Maximum call stack size exceeded".** Conic/mesh/freeform/topo gradients reach the SVG as a `<pattern><image href="data:image/png;base64,…">`; a 4000×4000 conic fill is a 41 MB data URI. svg2pdf.js parses that href with a regex whose payload group is `((?:.|\s)*)` — an alternation inside a repetition, one backtrack frame per character — so V8 overflowed its regex stack inside `String.match` before the image was decoded. Precision and Detail settings never mattered because the failure precedes any path work. The vendor build (`scripts/build-vendor.ts`) now rewrites that group to the equivalent `([\s\S]*)` via `scripts/lib/vendor-patches.ts`, which fails the build loudly if a svg2pdf upgrade moves the anchor. Regression tests: `tests/vendor-patches.test.ts` (patch applies once, groups identical, 40 MB payload); browser repro: `project-docs/pdf-export/verify/huge-vector-repro.ts gradient 4000`.

## [0.8.0] - 2026-09-04 (debuggability: warnings, --json, assert, ln, --png)

### Added

#### Core

- **Compiler warnings are first-class.** `CompileResult.warnings` (and the playground's `compileWithContext` result) lists every non-fatal problem the evaluator worked around — a clamped or skipped fillet / chamfer / elliptical fillet, a `cut()` stroke that separated nothing, labels dropped in a path block, a degenerate gradient, a font with missing glyphs — as `{ code, message, line, column }`. The 22 sites that used to push `'[warn] …'` strings into `logs` with no line now route through one `warn()` helper, and the corner-op sites carry the call's (or the `with` clause's) position. The `[warn]` log entry is kept as a mirror (now with the line and `severity: 'warn'`). Surfaces: the CLI prints `file:line:col: warning: message` to stderr (exit code unchanged; the mirror is skipped under `--print-logs` so nothing prints twice), the playground console shows a **warn** chip and the editor a yellow squiggle, VS Code gets a warning diagnostic. Documented in `docs/debug.md` → Warnings.
- **`assert(condition, message?)`** — a statement that stops compilation with `Line N, col M: assertion failed: <message>` (the condition's source text when no message is given). Works everywhere a statement does, including `&{ }` text blocks and constructor callbacks.
- **`ln(x)`** is the natural logarithm. **`log(...)` is now logging only.** It used to double as `Math.log` whenever its single argument was a number literal or a stdlib call — `log(sqrt(9))` printed nothing and, in statement position, leaked `1.0986…` into the path data. Using `log(...)` as a value is a compile error that names `ln()`. Statement builtins live in `STATEMENT_BUILTINS` (`src/evaluator/constructor-registry.ts`) so completions, hover, signature help, scope analysis, and the drift guard all know them.
- **`compile(src, { trace: true })`** keeps provenance: each path layer gets `records` (`loc`, `label`, `raw`, `commandCount` per emitted fragment) and `commands` (the executed history of that layer's context with the cursor before and after each command); the result gets the default layer's `commands`. Off by default.
- **PathBlock `.d` and `.commands`** — the relative path data the block emits when drawn at the origin, and every executed command as `{ command, args, start, end }`; a ProjectedPath answers `.d` in absolute coordinates. `log(block)` now previews the first commands (`PathBlock(4 commands: h 40 v 40 h -40 z)`).

#### CLI

- **`--json`** prints one JSON document — every layer's `d`, styles, `records`, and `commands`, the defs, CSS properties, logs, warnings, and the default-layer command trace (`toJsonDocument()` in the library). Combines with `-o`; exclusive with `--output-svg-file` / `--render-gpu` / `--png`.
- **`--png=<file>`** rasterizes the compiled SVG at viewBox size × `--scale` on a white background (chrome-headless-shell via the puppeteer dev dependency, with a clear error when absent — the new headless mode's screenshots can stall on a sleeping display, the shell's cannot); composes with `--output-svg-file` and `--render-gpu`.

#### Development

- `npm run validate:samples [-- <dir>]` — the sample validator finally has a script entry; with no argument it sweeps every post under `website/blog/samples`. `--margin` now actually applies (it was parsed and ignored), and the warning type union matches what the script emits. `website/blog/CLAUDE.md` lists the real seven checks (it documented six, one of which never existed).
- `expectCommandSequence()` in `tests/helpers.ts` asserts a structured command list (`trace` output, a layer's `commands`, `context.commands`, a block's `commands`) with float tolerance; `tests/CLAUDE.md` decision tree gains entry 2b.
- **Agent playbook**: `project-docs/developer-experience/pathogen-debugging-playbook.md` — the warnings → `--json` → `--png` loop, how to read the output, assertions as guardrails, the language and tooling traps from prior cycles, three-surface verification, sample style. Referenced from `.claude/CLAUDE.md`, `src/CLAUDE.md`, `scripts/CLAUDE.md`, and the blog playbook.

### Fixed

#### Playground

- The store's `logs` key was never written (the console pane was assigned directly), so "Copy Debug Info" always reported `(no log output)`. Logs and warnings now flow through the store and the capture gains a Warnings section.

## [0.8.0] - 2026-09-03 (style blocks open with `#{`)

### Changed

#### Core

- **BREAKING: the style-block opener is `#{ … }`, no longer `${ … }`.** `${` is now only ever an interpolation — inside backtick templates and inside style-block values — and `#{` is only ever a style block: `let s = #{ fill: red; stroke-width: ${w}; };`, `define PathLayer('a') #{ stroke: blue; }`, `p.dash(#{ stroke-dasharray: 10 5; })`. There is no transitional alias. Why: both constructs were spelled `${`, told apart only by Lezer's contextual token groups and a pile of text scanners guessing which one a given `${` was. That ambiguity was the root of a whole class of bugs and dead ends (LR-structuring the block silently broke every interpolation; externalizing the content token collapsed the token groups; the 2026-09-01 completion misroute offered CSS property names inside an expression). With distinct openers the grammar needs no precedence rule between them, every scanner keys on a unique two-character sequence, and a `$` inside a style block can only mean interpolation. The sigil family is now `@{` path block, `&{` text block, `#{` style block — `#` being the CSS hash. Documented in `docs/syntax.md` and `docs/layers.md`.
- **A legacy `${` in block position is a parse error that names the fix**: `Style blocks open with '#{ … }' — '${ … }' is only template interpolation now. Change this '${' to '#{'`, reported once at the opener (the cascade inside the old block is suppressed) by the CLI, the playground, and VS Code. Two quick fixes accompany it: *Change '${' to '#{'* for the one at hand, and *Convert all legacy '${' style blocks to '#{'*, which finds every opener with the parser (iterated to a fixpoint) rather than a text scan, so interpolations are never touched.
- The path-argument tokenizer no longer swallows a bare `#` (one with no hex digit after it) into the arguments, so `#{` directly after a path command line parses as a style block.

#### Playground / VS Code

- Typing `#` in expression position offers the `#{…}` style-block snippet (and declaration snippets at statement start); typing `$` inside a style value still offers the `${expr}` interpolation snippet. `#` joins the LSP completion trigger characters. The TextMate `style-block` scope begins at `#{`; the bare `${…}` interpolation rule inside it is unchanged. The `newfile` and `define` VS Code snippets emit `#{`.

#### Documentation / corpus

- Every published docs page, blog post, blog sample, guideline, test fixture, playground template, and VS Code fixture was migrated mechanically by `scripts/migrate-style-opener.ts`: the FROZEN pre-change grammar (`scripts/legacy-style-opener/`) is built at runtime and its own parse tree decides which `${` are openers, so roughly 4,400 openers changed and none of the ~1,300 interpolations did. Verified by byte-identical CLI output for all 264 blog samples before and after, unchanged render snapshots, and the full test suite. `project-docs/**/*.md` primers keep the syntax of their day; their `.pathogen` demos are migrated so they still compile.

## [0.8.0] - 2026-09-03 (retire the annotated evaluator)

### Removed

#### Core

- **The annotated evaluator is gone.** `compileAnnotated()`, `evaluateAnnotated()`, `formatAnnotated()`, the `AnnotatedLine` / `AnnotatedOutput` / `FormatOptions` types, the CLI's `--annotated` flag, and the worker's `compileAnnotated` message type are removed. The annotated path was a second, parallel evaluator (`src/evaluator/annotated.ts`, 6,611 lines) whose original job — verifying output through interleaved comments and call traces — the language itself long outgrew, while every feature and bug fix still paid a parity tax to keep it in sync (45 of the 52 evaluator commits since June also touched it, and a recurring class of review-critical "annotated parity" bugs came with them: its own `sort()`, its own `styleValueToCSS`, two independent template formatters, a module-level `pendingFlow` flag, and a still-open `buildAnnotatedResult` re-origin divergence). There is now one evaluator. The shared helper modules that were extracted to keep the two in step (`value-semantics.ts`, `switch-match.ts`, `struct-properties.ts`, `css-function-resolve.ts`, `iteration-lock.ts`) stay as the single home of each rule. `value-semantics.ts` and `switch-match.ts` now take the real `Value` type and `UserFunction.closure` is a `Scope` (the `unknown` typing only existed because the two evaluators declared separate unions); `struct-properties.ts` and `iteration-lock.ts` keep structural `unknown` inputs by design, since they act as type guards.
- Every gap that existed only in annotated mode closes with it: `cut()`, `variableOffset()` / `compoundVariableOffset()`, `with` clauses, `ctx.transform`, Mask / ClipPath / MeshGradient / FreeformGradient, and the stdlib-block and text-in-`if` divergences.

#### Playground

- The **Annotated** pane and its header / breadcrumb toggles are removed. Older share links that carry the pane's `ao` URL-state key still load (the key is read and ignored). "Copy Debug Info" keeps the layers table, per-layer path data, and log output; the Annotated Output section is dropped.

#### Documentation

- `docs/cli.md` loses its "Annotated Output" section; the "not supported in `--annotated`" caveats in `docs/path-blocks.md`, `docs/variable-offset.md`, and the Cutting Paths blog post are gone with the mode.

### Changed

#### Core

- **The CLI rejects unknown options.** A dash-prefixed argument no branch recognizes now exits 1 with `Error: Unknown option '--x'. Run with --help for the list of options.` instead of being silently skipped — so a script still passing the retired `--annotated` fails loudly rather than emitting plain path output.

#### Development

- Tests that pinned main-evaluator behaviour only by equality with annotated output are re-homed as direct `compile()` assertions (`tests/path-blocks.test.ts` pinned derived-path output for `offset()` joins, `ProjectedPath.draw()`, and `rotate()`; `tests/textblock.test.ts` text-in-`if`; `tests/style-value-interpolation.test.ts` fragment splicing; `tests/struct-properties.test.ts` value-checks through `compile()`). `tests/annotated.test.ts` and the scattered annotated-parity `describe` blocks are deleted.
- `src/CLAUDE.md`, `.claude/CLAUDE.md`, and `project-docs/developer-experience/cross-system-feature-lifecycle.md` no longer list `evaluator/annotated.ts` as a required edit site. Paper trail in `project-docs/retire-annotated/`.

## [0.8.0] - 2026-09-03 (named easing family: ease() + 21 new Easing members, shared with gradients)

### Added

#### Core

- **`ease(curve, t)`** — any `Easing` member (or its string) applied to `t`: `ease(Easing.BounceOut, t)`, `ease('elastic-out', t)`. The curve comes first and `t` last, matching `cubicBezier`. `t` clamps to `[0, 1]` with exact endpoints; the output is deliberately not clamped, so `back` and `elastic` overshoot. An unknown curve is a compile error, with the call position, that lists every valid name. `ease('ease-in', t)` is exactly `easeIn(t)` and `ease('smoothstep', t)` is `smoothstep(0, 1, t)`.
- **21 new `Easing` members** — `SineIn/SineOut/SineInOut`, `Cubic…`, `Expo…`, `Circ…`, `Back…`, `Elastic…`, `Bounce…` (strings `'sine-in'` … `'bounce-in-out'`), the standard Penner curves, alongside the legacy `Linear`, `Smoothstep`, `EaseIn`, `EaseOut`, `EaseInOut`. Enum completions and hover regenerate from the table.
- **One curve table for the language and the gradients.** `src/stdlib/easing-curves.ts` is the single source: the `Easing` enum derives its members from it, `ease()` and the quadratic trio read it, and `buildEasingWgsl()` generates the shaders' `applyEasing` from the same specs (each JS body sits beside its WGSL twin). Exported as `EASING_SPECS`, `EASING_ORDER`, `EASING_CURVES`, `easingModeIndex`, `buildEasingWgsl`. `tests/easing-curves.test.ts` pins the legacy u32 wire values 0..4, enum ↔ table agreement, and the shader splice.

#### Playground

- **`TopoGradient.easing` accepts every `Easing` member**, on both the `distance` and `laplace` methods, in WebGPU and in the Canvas fallback. The two WGSL shaders no longer hand-copy the easing switch: they carry a splice marker that `playground/gpu/easing-wgsl.ts` fills from the served compiler's `buildEasingWgsl()` at pipeline creation, and the Canvas fallback reads `EASING_CURVES`. For gradients the eased elevation is clamped back onto the color ramp (input and output), so overshooting curves hold at the ramp's edge instead of wrapping; the Canvas fallback used to skip the input clamp the shaders applied.

### Fixed

#### Core

- **The formatter keeps the parentheses around a `%` right operand of `*`.** `a * (b % c)` was flattened to `a * b % c`, which parses as `(a * b) % c` and changes the value (`6 * (3 % 2)` is 6, `6 * 3 % 2` is 0). `%` shares the times precedence level but is not regroupable, so it is now excluded from the associative-parent shortcut; `+`/`-` and `*`/`/` regrouping is unchanged. Found while formatting the easing blog samples; pinned by tests in `tests/language-services/formatter.test.ts`.
- **String arguments inside `calc()` in bare path arguments parse.** The greedy path-argument tokenizer stopped at a quote, so `M calc(ease('sine-in', t)) 0` (and `squareGrid('shape', …)`, `Color('#fff')` in the same position) failed with `Missing ';'`. It now consumes a quoted literal whole, escapes included, so a `)` or `;` inside the string cannot end the token. Function-call statements such as `circle(calc(ease('sine-in', t)), …)` were unaffected.

### Documentation

- `docs/stdlib.md` Easing → "ease": the curve family table, overshoot and clamping rules, the enum/string equivalence. `docs/gradients.md`: the `easing` property row points at the full family and states the ramp clamp. `docs/syntax.md`: the built-in enum table now lists all 23 enums (it listed 8) and the new `Easing` members.
- **Blog: "Ease Once, Apply Everywhere: Easing with Lambdas"** (`/blog/easing-with-lambdas`, dated 2026-09-07) — a practical walkthrough of the new curves through lambdas: the cam-under-a-slider model, the overshoot and arity gotchas up front, then six samples (`website/blog/samples/post51/`) that apply one eased `t` to ranges (`lerp`, `.mix`, radius), to wave amplitudes as envelopes, to cycles versus half-cycles, to factories that return lambdas with their numbers baked in, and finally to a twelve-strand plume. Samples validate clean (margins, collisions, formatting) and are archived as BBWPs.

## [0.8.0] - 2026-09-03 (cubicBezier timing curve)

### Added

#### Core

- **`cubicBezier(x1, y1, x2, y2, t)`** — the CSS `cubic-bezier()` timing curve as a stdlib function: the four handle numbers first, exactly as a stylesheet or a design tool writes them, then the value to ease. `t` clamps to `[0, 1]`; `x1`/`x2` must be within `[0, 1]` and all handles finite (a compile error otherwise, with the call's line and column); `y1`/`y2` are free, and the output is deliberately **not** clamped, so handles outside the box give anticipation and overshoot (`cubicBezier(0.68, -0.6, 0.32, 1.6, t)` is the classic back in-out). Solved with Newton then bisection using only `+ − × ÷` and a fixed structure, so results are bit-identical across engines like the hash family. The reusable form is a lambda holding the handles — `let smooth = {|t| cubicBezier(0.42, 0, 0.58, 1, t)};` — whose eased `t` feeds `lerp`, `Color.mix`, a Point's `.lerp()`, widths and stops. Completions, hover and signature help flow from the `pathogen-api.ts` declaration; the playground's editor list gained the entry. Documented in `docs/stdlib.md` → Easing → "cubicBezier", with a paste-ready table of the CSS keyword curves and the standard sine/cubic/expo/circ/back fits. The quadratic `easeIn`/`easeOut`/`easeInOut` trio is unchanged so it still matches gradient easing.

### Changed

#### Core

- **Stdlib errors carry the call position.** A message thrown inside a stdlib function (`cubicBezier` handle validation, `cubicSpline: points array must not be empty`, …) used to surface bare; both evaluators now prefix it with `Line N, col M:` of the call, the same way undefined-variable and arity errors already did.

### Development

- `project-docs/easing-interpolation/`: Ryan's original "Easing Interpolation API" proposal, the assessment that shaped this work (why `t -> t'` timing functions rather than `(start, end, time)` interpolators, and why not an `Easing.` namespace), the three-phase plan, the `demo-cubic-bezier.pathogen` demo with its CLI-rendered SVG and PNG, and `render-png.mjs`.
- `.claude/hooks/block-vendor-paths.sh` + a `PreToolUse` hook in `.claude/settings.json`: auto-denies Bash commands, Reads, Greps and Globs that name `node_modules/`, `dist/`, `public/` or `api/.wrangler-backup-*/` as a path (exclusion idioms such as `--exclude-dir=node_modules` pass; indirection through a shell variable is not caught), replacing prompt-level instructions that subagents kept ignoring.
- `scripts/debug-cubic-bezier.ts`: puppeteer check against the dev playground (run and passing 2026-09-03): CLI ↔ preview path parity for the demo, served completion/hover, the bit-exact value from the served bundle, and the positioned error for an out-of-range handle.

## [0.8.0] - 2026-09-02 (centerPoint() on PathBlock and ProjectedPath)

### Added

#### Core

- **`centerPoint()` on PathBlock and ProjectedPath** — returns the center of the path's axis-aligned bounding box as a real `Point`, so `shape.rotate(angle, shape.centerPoint())`, `shape.centerPoint().translate(0, -10)`, and `log(shape.centerPoint())` all work without rebuilding the point by hand from `boundingBox()`. It is the same box `boundingBox()` reports (Bézier and arc extrema included): relative coordinates on a PathBlock, absolute on a ProjectedPath; an empty block reports `Point(0, 0)`; passing any argument is an error. The math lives once in `computeBoundingBoxCenter` (`src/evaluator/path-transforms.ts`) and both evaluators call it. Completions, hover, chained member completion (`shape.centerPoint().`), and inlay type hints all flow from the `pathogen-api.ts` declaration. Documented in `docs/path-blocks.md` → "centerPoint()"; the `cut()` and `rotate()` examples on that page now use it instead of a hand-built center.

### Development

- `project-docs/pathblock-center-point/`: the plan, the review record, a demo program (one arrow pinwheeled about its center; cut bands each spun about their own), and its CLI-rendered SVG and PNG. `scripts/debug-centerpoint.ts` loads that demo in the playground and checks CLI ↔ preview path parity, completions/hover on both receivers, and the arity error.

## [0.8.0] - 2026-09-02 (elapsed clock on the Compiling chip)

### Added

#### Playground

- **The "Compiling..." status chip shows elapsed time** — `Compiling... MM:SS`, advancing once a second, in both the workspace bar (editor mode) and the fullscreen preview chrome. Long compiles used to sit behind a pulsing chip with no sense of progress. One clock (`playground/utils/compile-ticker.ts`, owned by the workspace view) writes a new `compilationElapsedMs` store key quantized to whole seconds, and the shared `compilationStatusView()` renders it, so the three chip surfaces (breadcrumb, fullscreen pane, storybook header) cannot drift. The breadcrumb patches its chip in place on each tick rather than re-rendering the bar, so the overflow menu, focus, and the pulse animation survive a multi-minute compile; a compile superseded by a newer one restarts the clock at `00:00`. Storybook stories: "Compiling (long, fullscreen chip)" on the preview pane and "Compiling (long)" on the header.

### Fixed

#### Playground

- **The preview pane releases its store subscriptions on disconnect** — all seven were left attached for the life of the page, so a detached pane (a storybook story, for instance) kept repainting on every store change; with a once-a-second clock that would have become a repaint per second for the length of every compile.
- The storybook header applies the compilation chip once on mount, so a story that seeds a compile before the element connects actually shows it.

### Development

- New tests: `tests/compile-ticker.test.ts` (fake-timer contract: reset on start, 1 Hz advance, whole-second quantization with no sub-second notifies, self-stop when status moves on, restart with a single live interval, idempotent stop), `tests/svg-preview-pane-compile-clock.test.ts`, `tests/app-breadcrumb-compile-clock.test.ts` (node identity across a tick proves ticks do not re-render), and `tests/playground-header-compile-clock.test.ts`; `tests/compilation-status.test.ts` gains the `formatElapsedClock` table. Browser verification in `project-docs/workspace-fullscreen-chrome/verify-compile-clock.mjs`: 38 checks across light/dark × editor/fullscreen, including wall-clock agreement, zero breadcrumb re-renders during ticks, and the Refresh-mid-compile restart.

## [0.8.0] - 2026-09-02 (switch / case statements)

### Added

#### Core

- **`switch` / `case` statement** — match one value against a list of patterns with braced case bodies and no fallthrough: the scrutinee is evaluated once, cases are tested in source order, the first match runs in its own child scope, and the switch ends. Patterns are a Swift-style family rather than bare equality: any expression (compared with `==` rules; non-comparable kinds like a Point against a number simply don't match), comma alternatives (`case "circle", "dot"`), inclusive ranges `a..b` (the `for` loop's spelling), half-open ranges `a..<b` (new `..<` token), open-ended ranges `..<0` / `100..`, ranges over angles (`case 0deg..<90deg`), object and array destructuring reusing `let`'s patterns (`case {x, y}`, `case {x: px, ...rest}`, `case [first, ...others]`, exact arity unless `...rest`), and `where` guards that run after the bindings. `default` must be last and appear at most once. `break`/`continue` inside a case act on the enclosing loop exactly as inside `if`; `return` returns from the enclosing function. Works everywhere `if` does, including path blocks, `apply` blocks, and both text-body forms (`text(x, y) { }` and `&{ }`). Documented in `docs/syntax.md` → "Switch Statements".
- Implementation: destructuring case patterns are a cover grammar (parsed as array/object literals and reinterpreted by the AST builder, mirroring how assignment is handled); the `{` after a call or member in pattern position forks against trailing-block lambdas via `~caseBody` ambiguity markers and the generator reports zero conflicts. Matching lives once in `src/evaluator/switch-match.ts` and is driven by both evaluators through a six-line host adapter; `==`, `if`, `? :`, and `where` now share `src/evaluator/value-semantics.ts` (`valuesEqual`, `isTruthy`), so `case` can never drift from `==`. Editor surfaces flow through: completions (`switch`, `case`, `default`, `where` snippets), hover, syntax highlighting (playground, docs/blog fences, VS Code TextMate), formatter, scope analysis (case bindings), inlay hints, and contextual parse diagnostics (including a hint for the colon form).
- **Compatibility note**: `switch`, `case`, and `where` are now reserved words and can no longer be used as variable names (`default` already was one). No sample in the repository used them.
- **Switch expressions** — `let radius = switch (level) { case 1, 2 { 4 } case 3..<7 { 8 } default { 12 } };`. The statement's clauses (value, range, and destructuring patterns, comma alternatives, `where` guards, bindings visible in the arm) with one expression per arm and a mandatory `default`, so a value always results and only the chosen arm's expression runs. Usable on the right of `let`, in function arguments, in template interpolation, and inside `calc()`, including in path-command arguments (the path-args tokenizer now nests braces opened inside parentheses, tracked separately from paren depth so an unclosed paren still fails where it always did). Not inside a style value's `${ }` interpolation (one brace level) or as a bare path argument. Formatter, scope analysis, inlay hints, unit inference, type inference, highlighting, and arm-specific diagnostics (`case 1 { 5; }` → "A switch expression arm holds a single expression") all handle it. Documented in `docs/syntax.md` → "Switch Expressions".
- **Half-open ranges in `for` loops** — `for (i in 0..<points.length)` visits every index exactly once; `5..<0` counts down to 1; `0..<0` runs zero times. Same spelling as the case pattern, so the range vocabulary is uniform. Every range-loop site in both evaluators (statement bodies and both text-body walkers) now shares one planner in `src/evaluator/range-loop.ts`, which also makes the iteration-limit count exact for fractional bounds; the annotated trace prints the `..<` form. Documented in `docs/syntax.md` → "Half-Open Ranges".

#### Documentation

- Blog post: [Say It Once: switch and case Come to Pathogen](/blog/switch-case-comes-to-pathogen) — the feature tour, with six live samples in `website/blog/samples/post50/` (the `else if` chain it replaces, values and enum members, ranges over numbers and angles, destructuring with guards, the expression form, and switch inside text bodies).

### Fixed

#### Core

- **The formatter keeps `else if` chains flat** — an `else if` parses as an alternate holding one `if`, and the formatter printed it back as `} else {` with a nested `if`, turning every documented chain into a pyramid on format. It now prints the chain the author wrote, at any nesting depth.
- **The formatter no longer adds a `;` after a bare template item in a text body** — the grammar has none there, so formatting `text(0, 0) { `a` tspan()`b` }` used to produce a file the parser rejects.
- **A `let` (or `fn`) inside an `apply { }` block is now visible to the rest of the block** — TextLayer apply bodies (and both annotated-mode apply handlers, for every layer type) created a fresh scope per statement, so `layer('t').apply { let level = 4; text(10, level)`…` }` failed with "Undefined variable" while the same code worked at top level. One scope per block now, matching the PathLayer branch that always had it.
- **Array literals as function-call arguments in path-argument position** — `M first([5, 6]) 0` silently became `first(5)` (the hand-rolled path-arg walker had no case for `[` and kept only the first node), so the callee saw a number where an array was written. The bracketed span now goes to the real expression parser, and `.prop` / `[index]` chains apply to it like any other argument (`sum([1, 2][0])`, nested literals, spread).
- **Every runtime constructor, enum, and context-aware function is a builtin for scope analysis** — the resolver's name sets were hand-written and missing all 26 constructors (`Point`, `Mask`, `Grid`, …), five enums (`BlendMode`, `GlowMode`, …), and the ten context-aware functions (`polarPoint`, …), so those names were unresolved references and went uncolored by semantic tokens; `PathLayer`/`TextLayer`/`GroupLayer` produced no reference at all. The sets are now derived from `constructor-registry.ts`, `builtin-enums.ts`, and `stdlib` + `contextAwareFunctions`, and the layer constructor name is recorded as a reference.
- Annotated (`--annotated`) mode had no `AssignmentStatement` case at all — `len = 70;` failed even at top level — and opened a fresh scope per *statement* inside `if` branches, so `if (x) { let size = 5; M size 0 }` failed only in annotated mode. Both now match the main evaluator.
- The path-args tokenizer's keyword stop-set was missing `break` and `continue`: `M i 0` followed by `break;` on the next line failed with "Undefined variable: break".
- Text bodies were built by four hand-copied dispatchers with different coverage — a `for` nested inside a text `if` came back with an empty body, and a text `foreach` never dispatched nested `if`/`for` at all. One shared `buildTextBodyItem` now serves every text-body position.
- Truthiness was written inline in seven places and had diverged: `""` was truthy in `? :` but falsy in `if`, and `0deg` was truthy inside `&{ }` conditions. All seven sites now share `isTruthy` and agree with `if`.
- The formatter deleted `tspan` and template items nested inside text `if`/`for` bodies.

### Development

- `tests/keyword-registry.test.ts` reads every `kw<"…">` term from `pathogen.grammar` and fails if any hand-maintained keyword list (tokenizer stop-set, both highlight maps, completions, hover, rename, code actions, snippet highlighter, TextMate regex) is missing one, or if the generated parser does not reserve it; the cross-system lifecycle checklist for keywords was rewritten around it and now names every file a keyword touches.
- `scripts/debug-switch-case.ts` drives the playground with the `project-docs/switch-case/` demos and compares the preview against the CLI; the VS Code preview webview was verified headlessly against the same demos. Full suite at 5,439 tests (+267).

## [0.8.0] - 2026-09-01 (expression completions inside interpolations)

### Fixed

#### Core

- **Completions inside `${...}` interpolations are real expression completions** — in-scope variables, member chains (`${p.di` → `distanceTo`), and stdlib — in the playground and VS Code alike. Bare style-value interps had been *misrouted* (the context scanner mistook the interp's `${` for the style-block opener and offered CSS property names inside an expression), and backtick interps everywhere — ordinary code included — returned before member resolution ever ran. Property-name context now correctly resumes after a balanced interp, and typing `$` in a style value offers the `${expr}` interpolation snippet rather than the nested style-block one. (The Broken Lines follow-up, resolved same-day.)
- **Member-head references inside style-value interps no longer double their line numbers** — `adjustLocs` shifted a loc object shared between a `MemberExpression` and its head twice; rename and find-references inside interps now land on the right line.

### Development

- Ten completion tests calling `getCompletions` directly (the prior interp describe only covered the exported context helpers — exactly why the misroute shipped unnoticed), bridge tests for the member replacement range and the intentional explicit-only popup at a bare `${`, and an `adjustLocs` scope-analysis regression. Full suite at 5,172 tests.

## [0.8.0] - 2026-09-01 (bare ${} interpolation in style values)

### Added

#### Core

- **Bare `${expr}` interpolation in style-block values** — the language's universal interpolation marker now works where it was a parse-killing trap: whole values (`stroke-linecap: ${capName};`), list tokens (`stroke-dasharray: ${cell} ${cell};`), and inside function arguments fused to units (`filter: blur(${softness}px);`). Semantics are exactly the backtick form's — evaluate, splice, untrusted, same CSS-value validation — via one shared splice path; backtick templates remain equivalent, and `${` inside quoted strings stays literal. This resolves the Broken Lines friction log's #1 in the dedicated session part 5 promised; the closing post's bench item is now its third "Fixed" section, with the diagnosis told in full.
- Grammar shape: a `StyleInterp` sibling token plus a `StyleBody` wrapper node — the interp cannot live inside the `StyleContent` DFA (16-bit tokenizer-table overflow against the quote-superposition states), and the wrapper keeps the editor's inner style grammar direct-mountable over one contiguous range so every tree walker (fence renderer, color chips, parity tests) keeps working. Both historical dead ends (external tokens; LR-structuring the block) remain untouched. Bonus fix: single-quoted values containing `${}` now parse. Known asymmetry: a *template's* interpolation inside a style value still allows no nested braces (table-size limit) — the bare form allows one level.
- Editor/services support: an `Interp` value node in the inner style grammar (highlighted like templates in the playground, blog fences, and PDF legends), scope-analysis references inside bare interps (rename/find-references/semantic tokens), completion context detection that treats balanced interps as transparent and suppresses style completions inside an unclosed `${`, a color-chip fallback that no longer truncates at an interp's brace, and a VS Code TextMate pattern so the interp's `}` doesn't end the style-block scope.

#### Documentation

- `docs/layers.md` teaches the bare form as the default interpolation story (backticks documented as the equivalent long form); `docs/syntax.md`, `docs/filters.md`, and `docs/path-blocks.md` examples swept; all Broken Lines samples and published fences use the bare form; part 5 revised (five of seven log entries now fixed, two deferred).

### Development

- Parity corpus and outer-tree invariance suites extended with bare-interp programs; 12-test interpolation suite; completion-context and chip regression tests. Full suite at 5,159 tests. Follow-up logged: full expression completions inside a bare interp (suppress-only shipped).

## [0.8.0] - 2026-09-01 (stroke geometry + the Broken Lines series)

### Added

#### Core

- **Stroke geometry: `dash()`, `outline()`, and `startAt()` on PathBlock/ProjectedPath** — stroke *styling* concepts turned into real, queryable geometry. `dash(styles)` partitions a path into tagged `{path, kind, t0, t1}` pieces from `stroke-dasharray`/`stroke-dashoffset` (SVG odd-count doubling, negative-offset wrapping, per-subpath pattern restart; `%` entries resolve against the path's own length rather than SVG's viewport diagonal). `outline(styles)` is stroke-to-path: a **closed**, boolean-ready outline built from both-sided offsetting plus `butt`/`round`/`square` caps, with `stroke-miterlimit` honored (new in the join machinery; `offset()` keeps its historical cap of 2) and near-zero spines becoming cap-shaped dots. `startAt(t)` re-anchors a path at an arc-length fraction — seamless rotation on closed paths, two runs with a jump on open ones; percent literals read naturally and wrap. Pieces and outlines keep subject-local placement (the `cut()` origin convention), so drawing everything at one anchor reassembles the source.
- **`dash-seam: merge`** — heals the seam-crossing dash on closed paths into one piece (its `t1 > 1` signals the wrap); default `split` unchanged.
- **`outline-overlap: union`** — opt-in self-union that dissolves outline self-intersections and merges touching caps into one clean boundary; default `raw` unchanged.
- **Expression-bodied lambdas** — `{|piece| piece.kind == 'dash'}` is sugar for a single implicit `return` (grammar `TrailingBlock` admits a trailing bare expression; the formatter round-trips each form as written). From the Broken Lines friction log.
- Completions for the new methods and style properties, a typed `DashPiece` member set, and enumerated `dash-seam`/`outline-overlap` values.

#### Documentation

- **The Broken Lines blog series** (five parts, `series: "Broken Lines"`): a stroke-geometry overview, three craft applications — sashiko/hitomezashi running stitches, leather stitch holes with matched seams and a card-wallet punch template, stencil bridges as dash gaps with a laser-ready trail marker — and a closing post publishing the series' working friction log (seven entries; four fixed before publication, three deferred with diagnoses). Every post went through the 4-persona agentic review with syntheses preserved in `project-docs/broken-lines/reviews/`.
- `docs/path-blocks.md` gains the Stroke Geometry reference section; `docs/syntax.md`'s Lambdas and worker-application sections cover the new sugar and the `<<` rules.

### Changed

#### Core

- **An inline lambda literal directly after `<<` is now a compile error** — `<<` applies a worker defined elsewhere (a lambda variable or named `fn`); the inline spelling is the trailing block (`arr.filter {|x| ...}`). The error message names that form. User design ruling, friction log #6.
- **Style blocks preserve bare percent literals for `stroke-dasharray`/`stroke-dashoffset` only** — `dash()` resolves `%` against path length itself; every other property keeps the historical bake-to-fraction behavior (`fill-opacity: 50%` still emits `0.5`), with regression tests locking both.

#### Development

- **The legacy `// viewBox="..."` line-1 sample comment convention is dropped** — `define ViewBox(...)` is the single source of truth. Stripped from all 88 samples that carried it (compiled SVGs verified unchanged); the authoring docs and checklists now prescribe the define only.

### Fixed

#### Core

- **`difference()` with a holed subtrahend no longer displaces the hole** — the boolean engine's subpath splitter only recognized boundaries at an explicit `z`, so a ring closed by coincident endpoints (what `circle()` emits) got glued to the hole-ring after it and the subtraction's contour reversal scrambled the pair. An `m` after drawing commands now starts a new subpath; `cut()`'s private workaround for the same limitation is now redundant. Friction log #4.

#### Playground

- **Pathogen code is highlighted by the real parser on every blog surface** — fenced blocks were highlighted as JavaScript (splitting `stroke-width` into two colors) and the mini-workspace loaded `@codemirror/lang-javascript` (coloring dashed vs undashed property names differently). Fences now render via `highlightPathogen()` walking the editor parser (structured style-block tokens; new `pr` property-name class wired through `theme.css`, the print palette with its drift guard, and the github-theme CSS on blog/docs pages), and the mini-workspace wraps `PathogenLang.editorParser` with a `/dist/highlight.global.js` fallback. PDF-export legends color style-block properties as a side effect. Friction log #7.

### Development

- Broken Lines ran as a full Cutting-Room-style cycle: live friction log (`project-docs/broken-lines/FRICTION-LOG.md`), in-cycle fixes, per-post agentic reviews, and a published wrap-up. Deferred with diagnoses: bare `${var}` whole-value style interpolation (StyleContent tokenizer), a contextual diagnostic for stdlib shapes after `M`, and offset-parameterized dashing (the leather wallet's motivating gap).
- Stroke-geometry visual demo (`project-docs/stroke-geometry/`), 66 feature tests plus lambda/boolean/highlighting regression suites; full suite at 5,139 tests.

## [0.8.0] - 2026-08-31 (inspector virtualization follow-ups)

### Fixed

#### Playground

- **Virtualized inspector lists now react to viewport growth without a scroll** — a `ResizeObserver` on each virtual list's scroller (the shared `.inspector` shell, or the list itself in standalone panels) re-windows when the viewport gets taller (window resize, fullscreen entry, mobile-sheet expansion); previously the window stayed under-filled until the next scroll, masked only by the 400px overscan. The refresh runs synchronously in the observer callback — resizes are low-frequency and slice renders never change the scroller's own size, so there's no observer-loop risk.

### Development

- Light/dark visual verification of the palette's fixed-height group headers: `project-docs/inspector-virtualization/inspector-{light,dark}.png` — no regressions, no CSS changes needed.

## [0.8.0] - 2026-08-31 (inspector virtualization for 20k-layer projects)

### Fixed

#### Playground

- **Inspector no longer stalls the editor on layer-heavy projects** — at 20,000 layers the inspector rebuilt ~80,000 rows (layers list + per-layer fill/stroke palette rows) via full `innerHTML` teardown on every compile, costing ~1.3–1.8 s of main-thread long tasks per keystroke pause — even while the panel was closed, since "closed" only clipped it. Now: a closed inspector does zero work (`setData` defers latest-wins and renders on open), and an open one windows both the layers and palette lists to the ~40 visible rows via a new shared `utils/virtual-list.ts` (fixed-row-height prefix sums + binary search, driven by the shared `.inspector` scroller with a self-scroll fallback for standalone panels). Measured after: ~43 ms of JS per compile open, ~0 closed. Event delegation, HTML escaping, and group collapse behavior are unchanged.
- **Eye toggles were two full inspector rebuilds** — visibility never changes the row set, so layer/defs visibility changes now diff by value and patch the flipped rows' eye button in place (O(1)); the store echo is a no-op.
- **A fresh `layerVisibility` object every compile defeated the inspector's differential cache** — `pruneVisibility` returns the same reference when no entries are stale, so unchanged visibility skips the notify entirely. Live names now include group children, whose hidden state used to reset on every recompile.
- **Layers inside groups never got their mask/clip-path sub-rows** — def refs are resolved during the recursive walk instead of a top-level-only map.
- **Per-row gradient/mask/clip scans hoisted** — `gradients.find()` and `masks.some()`/`clipPaths.some()` per row became per-update Maps (first match wins on duplicate ids, matching SVG's `url(#id)` resolution); palette color/var/gradient resolution now runs only for windowed rows.
- **Collapsing one inspector section left its sibling's scroll window stale** — panels dispatch `inspector-section-resize` on section/group collapse and the inspector re-windows every virtualized panel.
- **Storybook layers/palette stories rendered empty** — they set store keys the prop-driven panels never read; they now assign `panel.layers` directly.

### Development

- Perf instrumentation for the inspector: `perfSpan` wrapping all three panels' `updateList`, plus `perf-typing-audit.ts` knobs — `--wide-layers <n>` (cheap one-circle layers for row stress), `--inspector <closed|open>`, and `--kill-inspector` (`__PATHOGEN_NO_INSPECTOR__` A/B baseline, since spans can't see huge-DOM layout cost). Before/after runs and the design write-up in `project-docs/inspector-virtualization/`.
- New tests: `playground-virtual-list.test.ts` (pure window math) and `playground-inspector-virtualization.test.ts` (windowing bounds, scroll re-slice, delegated clicks on windowed rows, open-gate semantics, visibility diff-patches, prune identity contract, sibling re-window). Real-browser E2E: `scripts/debug-inspector-virtualization.ts`.
- Recorded a harness gotcha: this machine's puppeteer Chrome never runs the rendering loop (no rAF ticks or scroll-event dispatch, even headful), so rAF/scroll-driven behavior must be verified by direct invocation.

## [0.8.0] - 2026-08-31 (opaque hover fills for canvas chrome)

### Changed

#### Playground

- **Canvas-chrome buttons respond instantly on hover** — removed the `transition: all 0.15s` from the preview chrome buttons (inspector/export/refresh, fullscreen toggle, mini-preview inspector); the cross-fade made hover feedback feel laggy.

### Fixed

#### Playground

- **Hovered canvas-chrome buttons went ghost-transparent over artwork** — the hover rule on the preview chrome (inspector/export/refresh, the fullscreen toggle, and the blog mini-preview's inspector button) replaced the solid `--bg-elevated` base with `--accent-subtle` (0.10 light / 0.15 dark alpha), so the button all but vanished over busy canvases. Hover now composites a 0.9 accent tint over the solid base (`color-mix(in srgb, var(--accent-color) 90%, var(--bg-elevated))` — fully opaque) with the icon flipped to the new `--accent-contrast` ink (4.71:1 light, 8.35:1 dark on the fill) and an `--accent-hover` border. Color options were prototyped as a bbwp mockup (`workspace-fullscreen-chrome--hover-colors.mw.html`) with live WCAG ratios before the pick.

### Added

#### Playground

- **`--accent-contrast` theme token** — the highest-contrast ink for icons/UI glyphs on accent-filled surfaces (`#1c1722` light / `#1a1424` dark), distinct from `--accent-text`, whose light-theme warm-white is tuned for brand CTAs rather than maximum legibility.

### Development

- Verification harness extended to 32 checks: a real-mouse hover asserts the computed fill is the opaque 0.9 composite and the icon uses `--accent-contrast` (Chrome serializes `color-mix` results as `color(srgb …)` — the check parses both forms). Hover screenshots in `project-docs/workspace-fullscreen-chrome/`.

## [0.8.0] - 2026-08-31 (fullscreen compilation-status chip)

### Added

#### Playground

- **Compilation-status chip in fullscreen** — the workspace preview's fullscreen mode now shows the pulsing Compiling…/Rendering…/Ready/Error chip top-center, so a fullscreen Refresh gives the same feedback as the breadcrumb bar (which fullscreen covers). Fullscreen-only, driven by a targeted `compilationStatus` subscription (no re-render, so the pulse never resets mid-cycle). When a compile error puts the "Stale preview" badge at top-center, the chip drops below it instead of overlapping. The chip's map + styling moved to a shared `utils/compilation-status.ts` helper consumed by the breadcrumb, the preview pane, and the storybook header — which fixes the storybook header's long-standing missing "Rendering…" state, a drifted hand copy.

### Fixed

#### Playground

- **Dark-theme Error chip was red-on-red** — the chip (breadcrumb included) colored its Error state with `--error-color` (#ef4444) on dark mode's 0.6-alpha red `--error-bg`, making the text illegible. It now uses `--error-text`, the token pair designed for that background, in both themes.

### Development

- `tests/compilation-status.test.ts`: table-driven pin of the shared status→text/class map (three consumers, one contract). Storybook's "Stale (compile error)" story now also sets `compilationStatus: 'error'` so the chip-below-stale-badge case is reachable in isolation; verification harness extended to 30 checks (chip visibility/centering/timeout, normal-mode suppression, badge-overlap regression).

## [0.8.0] - 2026-08-31 (fullscreen preview chrome + wide-screen editor caps)

### Added

#### Playground

- **Refresh and export in fullscreen** — the workspace preview's fullscreen mode now carries its own icon-only Refresh and Export buttons, stacked beneath the inspector toggle in a new top-right chrome column. Fullscreen (`position: fixed`, z-index 9999) covers the breadcrumb bar, so programs using `random`/`randomRange` previously forced a round-trip out of fullscreen just to regenerate. Refresh appears only for programs that call `random`/`randomRange` (shared `usesRandomValues()` predicate in `utils/uses-random.ts`, now also used by the breadcrumb); Export is always available in fullscreen and opens the export modal *above* the fullscreen pane (`fullscreen-overlay` z-index 10001, toggled alongside the inspector's overlay class). ESC closes the modal first, a second ESC exits fullscreen. When the inspector overlay is open in fullscreen, the chrome column shifts clear of its 280px panel instead of being painted underneath it (caught by agentic review; regression-checked). Storybook gains a "Random program (fullscreen chrome)" story + `usesRandom` control so the states are reachable in isolation.
- **Wide-screen editor width caps** — on displays wider than a 16" MacBook Pro the code editor no longer takes 50% of the window: `code-editor-pane` caps at 80ch from 1800px, 100ch from 2400px, and 120ch from 3000px, handing the reclaimed width to the preview. The caps set the mono font on the same rule so `ch` measures Inconsolata at the editor's `--editor-font-size` (14px, now a single custom property shared with `.cm-editor`); below 1800px the 50/50 split is unchanged, as is the ≤800px stacked layout. Verified 561/701/841px at 1920/2560/3200 viewports, with completion-list fonts stable across the breakpoint.

### Development

- Fullscreen-chrome verification harness (`project-docs/workspace-fullscreen-chrome/`): 24-check puppeteer script covering fullscreen button states, refresh regeneration, modal stacking, ESC ordering, inspector-occlusion regression, and editor widths per viewport; plus breadcrumb/storybook spot-checks, light/dark screenshots, and STATUS.md.
- `calledStdlibFunctions` store default is now typed `string[]` (was inferred `never[]`, which rejected typed writes).
- Cutting Room post-loop agentic review: blog post restructure, remediation, and tic sweep, with a disposition record for the review's findings (2026-08-28).
- Domain survey Stage 1: 50 domain one-pagers with profiles and feature synthesis in `project-docs/domain-survey/` (2026-08-31).

## [0.8.0] - 2026-08-27 (truthful startPoint + annotated label parity + ternary path args — Cutting Room feedback loop, F2/B2/#18)

### Fixed

#### Core

- **`startPoint` reports the first inked point** — it had been hardcoded `Point(0, 0)` at every construction site since the language's first commit, while the day-one type comment specified an `m`-exception that was never implemented. The rule now: the last leading move's end, else the first command's own start — so `.contours[i].startPoint` reports each contour's real in-block position, `@{ m 10 15 … }` reports `(10, 15)`, and `get(0)` always agrees with `startPoint`. **Deliberate contract change** (one coherent rule): `drawTo(x, y)` now anchors the *ink* at the target — the garment post's piece-misplacement footgun fixed at the root (`placed.drawTo(placed.startPoint.x, …)` draws in place for every value now); `M x y` + `draw()` still seats the *pen* and lets a leading `m` offset. Emitted output changes only for off-origin blocks — exactly the cases that were wrong. Also fixed en route: an `endPoint` copy-paste in both evaluators' empty-commands ProjectedPath builders.
- **Annotated mode validates label names identically to `compile()`** — the F2 parity gap: `as segment('cut')` and punctuation labels compiled silently under `--annotated` while the main evaluator rejected them. The validation core is now shared (one module, both evaluators), labels stay emit-neutral in debug output, and 9 parity tests pin every rejection form.
- **Ternaries and comparisons work inside a path argument's `calc()`** — `L calc(arr[flag ? 2 : 0]) 0` was a parse error because the path-args tokenizer stopped at `?`/`:`/comparison characters even inside parens. It now consumes them at paren depth; top-level path-arg punctuation still errors as before.

## [0.8.0] - 2026-08-26 (ternary docs + index-interior postfix — Cutting Room feedback loop, item K + #17)

### Fixed

#### Core

- **Index-bracket interiors accept postfix expressions** — `calc(arr[o.n])`, `arr[pick()]`, `arr[idx[0]]`, and chains after the bracket (`pts[o.n].x`) now work; both postfix walkers built `[…]` contents with the non-postfix-aware helper (item J's review found this as the one orthogonal sibling of its eight-site class). Pinned by 6 tests including plain-index regression guards.

### Added

#### Documentation

- **The conditional (ternary) operator is documented** — a `?:` row in the syntax operators table plus a dedicated section covering value selection, string branches, use inside `${}` interpolation and style-block values (all forms compile-verified), and the `if`-reassignment alternative for multi-step choices. The garment post's pattern-sheet idioms — used in published samples before the docs admitted they existed — now have a manual entry, with a closing-section note telling that story.

## [0.8.0] - 2026-08-26 (postfix expressions in argument positions — Cutting Room feedback loop, item J)

### Fixed

#### Core

- **Postfix expressions (member access, indexing, function calls) now work in six argument positions that silently flattened them** — `layer(names[i]).apply`, `for (i in 0..arr.length)` (the everyday headline: loop bounds needed a hoisted `let n = arr.length;`), the same ranges inside text blocks, `PathLayer(names[i])` in both the `define` and constructor-expression forms, and `define ViewBox(0, 0, sheet.w, …)`. One mechanism: postfix chains sit at sibling level in the parse tree, and these builders scanned siblings with the non-postfix-aware helper — `layer(o.n)` even errored `Undefined variable: n` because the trailing property *overwrote* the target. Parser-level fix, so both evaluators and all three surfaces inherit it. Round-robin layer routing is now data-driven — `layer(shards[calc(i % 3)]).apply { … }` — and the `i % 3` if-chains are gone from the three published samples that used them (renders byte-identical or float-tail-only). Pinned by a 13-case forms×sites matrix plus regression guards for the two cursor traps the tests caught (a start bound resting on `..` silently defaulted the end bound to 0; paren-less `variable.apply { }` swallowing `.apply`).

## [0.8.0] - 2026-08-25 (reserved unit suffixes + shadowing diagnostics — Cutting Room feedback loop, item I)

### Added

#### Core

- **`pi`, `deg`, and `rad` are reserved words** — they exist only as angle unit suffixes (`0.5pi`, `90deg`, `1.5rad`). Binding one (`let pi = …`, loop variables, destructuring, `fn deg(…)`, function/lambda parameters) is a compile error in **both** evaluators (enforced at the single binding funnel each evaluator has, via one shared module — the rule cannot drift between `compile()` and `--annotated`). Referencing one standalone (`calc(pi)`) errors with the three spellings that do exist: the suffix, `PI()`, and the `deg(x)`/`rad(x)` converters — replacing both the unhelpful `Undefined variable: pi` and the silent footgun where `let f = deg;` stored an uncallable raw function. Call position, suffix position, and the Angle members `.pi`/`.deg`/`.rad` are untouched. Pinned by a 36-case binding-form coverage matrix.

#### Language services

- **The command-letter shadowing trap gets a real diagnostic.** `let m = 25;` then `L m 40` used to fail with `Missing ';'` pointed at punctuation nowhere near the mistake (the bare letter reads as a path command and recovery reparses it as one). Both error paths — the CLI's `parse()` and the editor's diagnostics — now detect the two tree shapes this takes (variable-as-next-command `L m 40`, and variable-consumed-as-command `L 5 V`) and say what happened: `'m' is a path command here, so it cannot be used as a bare variable in path arguments — write calc(m), or rename the variable`, positioned at the letter itself. Fires only when the letter is actually a declared variable, so genuine typos keep the generic message. The playground/VS Code quick fix offers a one-click `calc()` wrap (replacing the previously *wrong* add-semicolon fix), and hovering a single-letter variable at its declaration or inside `calc()` now shows the variable instead of the path-command reference.

## [0.8.0] - 2026-08-25 (query pseudo-selectors — Cutting Room feedback loop, item G)

### Added

#### Core

- **Segment queries accept CSS-style pseudo-selectors** — `segmentAll('rim:atomic')` returns every matching *drawing command* as its own block (the run-merge rule's official escape hatch: a labeled `circle()` hands back its individual arcs, no more `subPath` at guessed fractions); `:first` / `:last` / `:nth(k)` (0-indexed, unlike CSS) select whole runs from a group. One pseudo per query; unknown or chained pseudos error listing the set; point/vertex queries reject pseudo syntax with a pointer at segment queries; out-of-range `:nth` returns `[]` from the `All` form and errors with the run count from the singular. Pseudos apply after matching and merging, so they compose with the seam namespace (`'cut:first'`, `'cut.valley:atomic'`). This cashes in the `:` character that item F's label-name validation deliberately reserved — authored labels can never contain `:`, so the suffix is unambiguous by construction.

## [0.8.0] - 2026-08-25 (cutter label propagation — Cutting Room feedback loop, item F)

### Added

#### Core

- **Cutter labels propagate as `cut.<name>` sub-labels** — a knife edge authored `as segment('valley')` heals into seams labeled `cut.valley`, so each knife's seams are addressable on their own (`segmentAll('cut.valley')`) while the umbrella query `segmentAll('cut')` still answers the *whole* seam namespace merged into runs exactly as before. Composes with array cutters: mountain and valley folds, cut in one call, dashed differently. Unlabeled knife edges, cookie boundaries, and bridging segments stay plain `cut`; knife *endpoint* labels do not propagate (cut endpoints land on junction points shared by several pieces). `pieces.seams()` results keep the sub-labels. Because sub-label queries are exact, adjacent seams from differently-named knives come back one edge at a time — the unmerged escape hatch for cut seams (friction log #8, partial).
- **Label names are validated at authoring time** — `as segment(...)` / `as endpoint(...)` names must be identifier-shaped (letters, digits, `-`, `_`, starting with a letter); all punctuation — `.`, `:`, whitespace included — is a compile error, keeping the space free for the query language (`.` is the namespace delimiter; `:` is deliberately reserved for possible CSS-like pseudo-selectors). Bare `'cut'` is reserved — authoring it previously fused your geometry silently and indistinguishably into the seam group — and `cut.<name>` is the explicit segment-only opt-in that joins the seam namespace on purpose. Computed labels are validated after evaluation, per iteration. Queries stay lenient: any string can be queried. Pinned by a punctuation coverage-matrix test.

#### Documentation

- New **Label names** section in the segment-labels docs (naming rules, the reserved `cut` namespace, the opt-in); the cutting docs' label contract rewritten ("the cutter's own labels do not propagate" → the propagation contract); fold-lines sample (post41/02) rewritten as a real alternating mountain/valley accordion template; medallion kit (post41/06) replaces its merged-V `subPath` surgery with per-knife sub-label queries; stained-glass rim-join sample migrated from the bare-`'cut'` accident to the `cut.rim` opt-in with byte-identical came geometry; closing-section entries in the papercraft and stained-glass posts.

## [0.8.0] - 2026-08-25 (outward seam normals documented + pinned — Cutting Room feedback loop, item E)

### Added

#### Documentation

- **`normal(t)` on cut and boolean results is guaranteed to point away from the piece's material** — this always held (winding canonicalization pins material to a fixed side of travel), but it was undocumented, so the tab samples shipped a dot-product-and-flip direction test that never fired. The guarantee is now stated in the `normal(t)` docs (with the hole footnote — "away from the material" points *into* a hole — and the hand-authored-path caveat), cross-referenced from the cutting section, and **pinned by two tests** so a future winding change cannot silently break it. Both tab samples dropped the flip dance with byte-identical compiled output. No new API: an `outwardNormal()` alias was deliberately rejected — it would imply `normal()` isn't already outward.

## [0.8.0] - 2026-08-24 (pieces.seams() — Cutting Room feedback loop, item D)

### Added

#### Core

- **`pieces.seams()`** — called on the array `cut()` returns, answers each *physical* healed seam exactly once (per-piece queries see every interior seam twice, once per adjacent piece — the double-draw that makes opposite-phase dashed strokes fill each other's gaps). Powered by a `seamId` stamped into command meta at cut time: both twin halves of a seam share one id (cookie rings included; face-walk bridges get their own), so pairing survives the merged-V-run case that defeats geometric matching. Returned seams keep subject-local placement, exactly like the pieces. Four meta-reconstruction sites gained seamId passthroughs (normalizeMeta/derivedMeta, split fragments, ring reversal); both evaluators dispatch the new array method; declared on `PathogenArray` with completions regenerated; docs carry the seams-once contract. 8 new tests including a drawn-output equivalence proof against the old ownership-rule dedupe.

#### Documentation

- Fold-lines sample (post41/02) rewritten to the one-loop `seams()` form — the right-hand-side ownership rule is gone — with a papercraft closing-section entry (before/after) and a deliberate note in the stained-glass post that its came loops stay per-piece for teaching reasons.

## [0.8.0] - 2026-08-24 (annotated-mode divergence fixes — Cutting Room feedback loop, item C)

### Fixed

#### Core

- **Annotated mode: text statements inside `if`/`for` bodies no longer vanish from `&{}` text blocks** — the annotated evaluator routed control-flow statements through a walker with no elements accumulator, silently dropping any `text()` they contained (the main evaluator was always correct). Text blocks now walk recursively, mirroring the main evaluator, including for/for-each loop scoping and break/continue.
- **Annotated mode: stdlib-call path blocks are no longer empty** — `@{ circle(0, 0, 30); }` compiled to zero commands under `--annotated` because stdlib `PathSegment` results were never tracked into the live path context (found while writing item B's parity tests). Annotated stdlib calls now track segment commands exactly as the main evaluator does, so such blocks draw, cut, and boolean correctly in debug mode.

## [0.8.0] - 2026-08-24 (cut() array cutters — Cutting Room feedback loop, item H)

### Added

#### Core

- **`cut()` accepts an array of cutters** — `plate.cut([k1, k2, k3])` cuts along every knife exactly as if their strokes lived in one block, on both PathBlock and ProjectedPath receivers, with mixed block/projected elements allowed. Knives become compositional: build them in a loop (`knives.push(@{...})`) and hand the set to one call — the rose window's eight spokes are now a parameterized `for` loop instead of sixteen lines of chained relative-move arithmetic (the friction-log #6 bug class). Declared in `pathogen-api.ts`, completions regenerated, docs updated with the loop-built-knives contract.
- The deeper in-block re-orientation need (returning to origin/known points inside `@{}` without pen bookkeeping) is deliberately deferred to the ctx-block-argument design (user-authored, preserved as feedback-loop item L) rather than shipping an interim absolute-`M` that the ctx surface would supersede.

#### Documentation

- Six knife-bearing samples rewritten as loop-built cutter arrays (hex medallion, both 3×3 grids, both radial roses, the rose window's spokes+ring); renders verified identical (float-tail-only diffs from knife ordering). Closing-section entries added to the papercraft, jigsaw, and stained-glass posts telling the knives-stopped-doing-arithmetic story.

## [0.8.0] - 2026-08-24 (ProjectedPath.draw() — Cutting Room feedback loop, item B)

### Added

#### Core

- **Serializer fix (pre-existing `drawTo` bug):** the relative-emission walk never seated its cursor at the emitted anchor, so any projected value with a mid-list `m` — union/difference/intersection/xor results, cut pieces with holes — double-offset every subsequent contour when drawn at a non-zero position (invisible at `drawTo(0, 0)`, which is all the old tests used). `path-data.ts` gained a `startCursor` option, set by the four world-space call sites; regression-tested for boolean results and holed pieces in both evaluators.
- **`ProjectedPath.draw()`** — draws a projected value exactly where it lies, anchored on its first command; no anchor arguments, no cursor dependence. This collapses the series' central seam-decoration idiom from `seam.drawTo(seam.startPoint.x, seam.startPoint.y)` to `seam.draw()`, and makes the cut-piece placement footgun unreachable (a piece's projected `startPoint` is its frame origin, not its first command, so the old re-anchor silently shifted whole pieces — content review caught annotations 63 units off their pattern piece). Both evaluators at parity; declared in `pathogen-api.ts` with completions regenerated; the `drawTo` anchor contract is now documented in `docs/path-blocks.md` ("Drawing a ProjectedPath in place"). The deeper `startPoint` question (the backlogged 2026-08-01 "first inked point" audit) is queued as feedback-loop item B2.

#### Documentation

- All 21 Cutting Room samples and both idiom fences swept to `seam.draw()`; the two garment pattern panels now draw via `placed.draw()`. Closing "What this project taught the language" sections added to the papercraft (full story), jigsaw, and stained-glass posts, and the garment post gained the footgun chapter. Seam-idiom sample output verified byte-identical; the two panel conversions render identically.

## [0.8.0] - 2026-08-24 (offset() joins + true parallel curves — Cutting Room feedback loop, item A)

### Fixed

#### Core

- **`offset()` no longer distorts curves at sharp corners** — the miter join at a sharp corner (up to 4× the offset distance) was folded into the neighboring curve's coordinate frame, warping the curve body (the Cutting Room garment post's yoke allowance came out spiked and unusable). Joins now live *between* segments: every segment is offset with its own normals, gentle line-line corners keep a true miter (≤2× distance), and everything else gets a bevel connector. The closure corner of closed contours is now joined too (a 60×40 rectangle offset by 5 is finally a symmetric 70×50 rectangle).
- **Curve offsets are true parallel curves** — cubics/quadratics subdivide adaptively and re-fit via their control polygons (Tiller–Hanson) instead of translating control points, so a deep scoop's offset stays `distance` away along its whole length. Quadratics emit as cubics; arcs keep radius adjustment. Bevel connectors between same-labeled edges inherit the label, so labeled runs stay whole.

### Added

#### Core

- **`offset(distance, { join: 'miter' | 'bevel' | 'round' })`** — optional join control on PathBlock and ProjectedPath; `'round'` inserts arcs centered on the original corner (the rolling-pen offset), making sharp-corner rings grow by exactly 2×distance. Declared in `pathogen-api.ts`, completions regenerated, annotated evaluator at parity. Docs: the join contract in `docs/path-blocks.md`.

#### Documentation

- Garment post: the offset caveat is gone — the yoke wears its seam allowance in the pattern sheet — and the series' first **"What this project taught the language"** section tells the friction-log-to-fix story (the logged "direction flip" turned out to be miter spikes; the diagnosis lesson is part of the post). Part 1 now frames the series as a working friction log.

## [0.8.0] - 2026-08-23 (The Cutting Room series + sample formatting gate)

### Added

#### Documentation

- **Blog: "The Cutting Room"** — a new four-part project series putting `cut()` and segment labels to work together, in the Stdlib Primers format: **Papercraft** (seam queries, fold lines, generated glue tabs, label-identified pieces, exploded view, hex-medallion kit sheet), **Jigsaw** (knife authorship incl. the interlocking nub, rim-label classification, registration marks, a scattered puzzle spun with pivot-free `rotate()`), **Garment patterns** (a fully labeled half-bodice draft, label-driven yoke/body identification and layout, `offset()` seam allowance, direction-normalized notches, a finished pattern sheet), and **Stained glass** (seams as leading, the label-merge rule, tinted panes, both-operand boolean labels, a rose-window finale stamped by a cookie-cutter + spoke knife in one cut). 21 samples, each compiled with inspector metadata, validated, and BBWP-archived; two 4-persona review rounds with all must/should-fix findings applied. The Cutting Paths post's now-outdated "labels don't survive" claims corrected and its `rotateAtVertexIndex` pivot workaround annotated with a pointer to `rotate(angle, origin)`.
- Internal: `project-docs/cutting-room/FEATURE-OPPORTUNITIES.md` — a 13-entry friction log of language bugs, footguns, and API gaps surfaced by building the series (including an `offset()` direction bug on cut pieces' curved edges, with preserved repro), feeding a follow-up improvement program.

#### Development

- **Blog sample formatting is now a required, enforced step** — `npm run format:samples` (wraps the language-services formatter; previously an unwired script) must run after the last source edit; `validate-samples.ts` gained check #6 flagging unformatted sources, and the requirement is documented in the blog playbook (step 1.5, checklist, §3.5). All 21 series samples formatted; recompiled SVGs verified byte-identical.

## [0.8.0] - 2026-08-23 (PathBlock.rotate() + labels survive derived paths)

### Added

#### Core

- **`rotate(angle, origin?)` on PathBlock and ProjectedPath** — rotates the path around `origin` (a `Point`, defaulting to the block origin `(0, 0)` / the projected start point), frame-preserving like `scale()`: the result is not re-based, so pieces spin in place with no pivot compensation. Accepts plain radians or Angle values. Kernel extracted as `rotateAboutPointCommands`; `rotateAtVertexCommands` is now a two-line wrapper over it (byte-identical output, pinned by existing tests), and sub-epsilon residue is snapped so right-angle rotations emit clean numbers. Declared in `pathogen-api.ts`, so completions, hover, and signature help flow to all three surfaces.
- **Segment and endpoint labels survive derived paths** — `as segment(...)` / `as endpoint(...)` names now carry through `reverse()`, `offset()`, `mirror()`, `scale()`, `rotate()`, `rotateAtVertexIndex()`, `subPath()`, the corner-shaping family, boolean operations (labels from both operands coexist), and `cut()` (pieces keep the subject's labels). Reversal moves endpoint labels to the correct vertex, including ring-reversed subpaths inside boolean results; a label on a zero-length closing `z` re-attaches to the close vertex through every operation. Pending `with fillet(...)`-style corner ops are consumed by the block they were written in and never re-apply on a derived path (byte-equality guarded by tests). Excluded by design: `variableOffset`/`compoundVariableOffset` (full resample, no correspondence), labels on `m` commands through draw-command-rebuilding ops, and the cutter's own labels.
- **`cut()` seams are auto-labeled `'cut'`** — every healed knife edge in every piece answers `segmentAll('cut')`, so seam decoration (dashed fold lines, glue tabs) is a query away; a user's own `'cut'` label merges into the same group, matching label-group semantics.

#### Documentation

- `docs/path-blocks.md`: `rotate(angle, origin?)` section with a cut-shard example (pieces spun in place), plus ProjectedPath pivot notes and cut/boolean label bullets.
- `docs/segment-labels.md`: "Labels Survive Derived Paths" section — the operation family, the seam contract, exclusions, and caveats (open-path reversal end vertex, `m`-command labels, corner-op consumption).

## [0.8.0] - 2026-08-22 (Cutting Paths blog post, CLI named-font resolution, series spotlight)

### Added

#### Documentation

- **Blog: "Cutting Paths: Slicing Shapes Apart with cut()"** — Part 5 of the PathBlock Extensions series, closing on a shattered "pathogen.studio" wordmark (every glyph laid out by advance width, cut with its own hash-varied knife, fragments drifting and rotating per piece). Six interactive samples with on-canvas piece-count labels, knife legends, and panel dividers; every numeric claim verified by compilation; four-persona agentic review completed with all must-fix findings applied. Parts 1–4 updated to "of 5" with five-entry TOCs and `series`/`seriesPart` frontmatter.

#### Core

- **CLI resolves `@font` family names against local font files** — named lookup now searches `PATHOGEN_FONT_DIRS`, then a `fonts/` directory found by walking up from the source file, then system font directories, matching files by the Google Fonts naming convention (`@font "Playfair Display" 700;` → `PlayfairDisplay-Bold.ttf`). The same family-name declaration now works in the CLI and the playground, which fixed a class of blog samples whose file-path `@font` declarations broke the playground's "Open in a new workspace" (post12's six samples migrated alongside the new post's).

### Changed

#### Playground

- **Blog index: latest-part series spotlight** — when the newest part of a series is a late addition (published ≥14 days after the part before it), it renders as a full accent-bordered card with a "New · Part N" pill (aging to "Latest" after 45 days) while earlier parts collapse into a compact ordered list. Series published as one sequential run keep the plain all-cards layout. Implemented in both index surfaces (static SSR pages and the SPA blog view).

#### Development

- Code-example guidelines: path blocks with more than one command in published samples are written multiline, one command per line.

## [0.8.0] - 2026-08-22 (PathBlock.cut() — slice paths apart with knife strokes)

### Added

#### Core

- **`PathBlock.cut(cutter)`** — slice a subject path along the strokes of a second PathBlock and get back an array of pieces, each a complete PathBlock healed shut along the cut lines. Subjects may be open, closed, or multi-contour (glyphs, donuts, islands); holes ride along as extra subpaths in whichever piece contains them. Each cutter subpath is one knife stroke: open strokes (lines or curves) slice wherever they fully cross material, closed loops act as cookie cutters (a loop assembled geometrically from separate meeting strokes counts), and strokes crossing each other subdivide together (an X quarters a region). Cutter endpoints on or near the boundary snap onto it (scale-aware tolerance, `max(0.5, bboxDiag × 0.001)`); a stroke that dead-ends inside cuts nothing — no invented geometry. Open subjects sever into open fragments. Pieces keep subject-local placement, so drawing them at one position reassembles the shape and per-piece offsets make exploded views. Curve types are preserved end to end. Works on both PathBlock and ProjectedPath receivers; degenerate drops (untraceable fragment, sub-tolerance sliver, unassignable hole) surface as `[warn]` log entries rather than failing silently. Implementation: a planar-arrangement face walk in `boolean-ops.ts` (`pathCut`) — winding canonicalization puts material on the left of every boundary edge, one-sided subject half-edges + twinned cutter fragments make every traced face a piece, and a union-find node table with scale-aware clustering keeps distinct cuts distinct at tiny coordinate scales. Declared in `pathogen-api.ts`, so completions, hover, signature help, and array-element type inference flow to the playground and VS Code. Not yet supported in `--annotated` debug mode (clear error, matching the `variableOffset` precedent). 30 new tests (`tests/path-cut.test.ts` + annotated) cover the edge-case catalog: T-junctions, vertex crossings, tangency/collinear no-ops, donuts, islands, cookie cutters (inside, straddling, stroke-assembled), 16-cell grid decomposition, radial sectoring on arc subjects, tiny scales, mixed open+closed subjects, and both receivers.

### Fixed

#### Core

- **Winding classification no longer degenerates on chord-symmetric contours** — `subpathSignedArea` used a chord-only shoelace that evaluates to exactly 0 for a circle built from two arcs, so the §2.14 normalization prologue classified a circle-built donut's outer and hole as "same winding" and silently deleted the hole on any subsequent boolean/cut operation. Curves are now sampled for area, fixing hole preservation for all `circle()`/`arc()`-derived inputs.
- **Arc-heavy winding tests are ~15x faster** — `adaptiveCrossing` re-derived the arc's center parameterization at every recursion sample; it now takes a precomputed evaluator and threads endpoints through the recursion. An 80-stroke cut of a circle drops from ~1s to 70ms, and the boolean-ops test suite itself runs ~9x faster (6.1s → 0.7s).

### Changed

#### Documentation

- **New "Cutting Paths" section in the Path Blocks reference** — knife mental model, seven compiling examples with verified outcomes (basic slice, cookie cutter, projected alignment, exploded reassembly, two-contour glyph cut, open-path severing, and a closing per-piece-styling composition), a grouped behavior contract (arguments/results, tolerances, strokes that don't cut, compound cases), and the `--annotated` limitation callout. Passed the four-persona agentic review with all must-fix findings applied. The Boolean Operations lede is now scoped to the four set operations with a cross-link, and its example blocks were repaired — they called a one-argument `circle(30)` that compiled to NaN geometry (`circle` is `(cx, cy, r)`, and calls inside `@{}` need a trailing `;`).

## [0.8.0] - 2026-08-19 (angles survive stdlib calls — hueShift(randomRange(…)) fixed)

### Fixed

#### Core

- **Angle values now survive angle-preserving standard-library calls** (real report: `c.hueShift(randomRange(-0.5pi, 0.5pi))` showed no visible hue variation — the pi-suffixed range was flattened to bare radians at the stdlib call boundary, and the degree-based color methods read the bare result as degrees: a ±1.57° shift instead of ±90°). `abs`, `min`, `max`, `lerp`, `clamp`, `map`, `normalizeAngle`, `randomRange`, and `hashRange` now pass angle-ness through — an Angle in a deciding slot means an Angle result, with the display unit taken from the first Angle among those slots (`map` decides by its output range, `lerp`'s `t` stays a plain ratio). The per-function contract lives in `src/stdlib/angle-preserving.ts` — a single source of truth consumed by both evaluators' dispatch and locked by a metadata-driven coverage-matrix test, so a function added to the map without the behavior (or vice versa) fails CI. Angle-*consuming* functions (`sin`, `cos`, `deg`, rounding) and angle-*computing* functions (`atan2`, `rad`, `mpi`) still return plain numbers as documented. Visible behavior change: interpolating such a result now prints its unit — `${lerp(0deg, 90deg, 0.5)}` is `45deg`, no longer `0.7853981633974483`.
- **Editor type inference follows the same contract** — `let b = clamp(0deg, 0deg, 1pi)` now hovers as an Angle and offers `.deg`/`.rad`/`.pi`/`.turns` member completions in the playground and VS Code (previously untyped); the inference consults the same `ANGLE_PRESERVING_ARGS` map the runtime uses.

### Changed

#### Documentation

- New **Angle-Preserving Functions** section in the stdlib reference: the same-space rule, the deciding-slot table, a deterministic `hashRange` hue-jitter example, and an explicit warning that mixing bare numbers with Angles in deciding slots reads the bare number as radians (`min(90deg, 1)` is `57.2957795131deg`, not `1deg`). `normalizeAngle` gains its first published definition (Angle Conversion table). The syntax and color guides' "an angle is an angle wherever it flows" narratives and behavior-change callouts extended to cover the stdlib boundary.

## [0.8.0] - 2026-08-19 (verified export rasterization — no more black/blank exports)

### Fixed

#### Playground

- **PDF and PNG exports of very complex artwork no longer silently ship black or blank images** (real report: a 24×24 in filter-forced raster PDF whose artwork page was solid black, and a blank 4× PNG of the same piece). At print resolution (~52–77 MP) with thousands of `drop-shadow`-filtered layers, the browser loses the canvas context or silently no-ops the `drawImage`; the export then encoded the untouched buffer without ever looking at it (transparent → solid-black JPEG / blank PNG). Every raster attempt is now verified (context-loss check + pixel classification; pure decision logic in `playground/utils/raster-verify.ts`), and on failure the export recovers in stages: a tiled full-resolution render (2048px tiles composited into a CPU-backed destination — the single giant GPU surface allocation was the observed failure on real hardware), then a ×1/√2 size ladder down to a 2048px floor with a notice reporting the resolution actually achieved, and finally a clear error — never a blank file. Targets above 32 MP skip the doomed full-size single draw entirely (field data: single draws silently no-op somewhere between 19 MP and 39 MP even on an M2 Max).
- **Export rasterization now shows live progress** — the modal status line narrates each stage ("Rendering the artwork at 8,800 × 8,800 px in tiles — 12/25…", "Retrying at a reduced …") with paint-flushing yields (`requestAnimationFrame` → `setTimeout`; a bare `setTimeout(0)` resumes before the next frame, so messages were written but never rendered). Verification of large GPU canvases uses a single downscale-probe readback instead of banded `getImageData` scans, which forced repeated GPU pipeline syncs and locked the UI for about a minute in the field.
- **Honest resource-limit notices** — "Your browser limits how much it can rasterize at once…" replaces the misleading "free up GPU memory (close other tabs)" framing: the binding constraint is the browser's per-context budget, which doesn't scale with the machine.

### Added

#### Development

- **PDF/raster inspection dev tooling** — `npm run inspect:pdf` (`scripts/inspect-pdf.ts` + shared `scripts/lib/pdf-inspect.ts`; devDependencies `pdf-lib`, `jpeg-js`, `pngjs`): page/MediaBox summary, embedded-image listing and extraction, pixel statistics (a solid-black page prints `UNIFORM (failure signature!)`), and decoded content streams. Shared with the export E2E harness so raster pixel-truth is a permanent regression check — the original bug passed every structural assertion because nothing ever decoded the embedded image.
- `tests/raster-verify.test.ts` (25 tests) covering the pure verification/size-ladder/tile-grid logic; the export harness (`project-docs/unified-export/verify-export.ts`) grew sections 10b–10g: embedded-image pixel truth on raster and cover-sheet PDFs, prototype-patch failure injection (headless SwiftShader cannot lose a real GPU context) proving the tiled path keeps full 300 DPI, the size ladder lands in range with the reduced-DPI notice, total failure raises a red error with no file written, and the PNG path reduces with its notice — 62/62 checks.

### Changed

#### Documentation

- `docs/exporting.md` known limitations now covers complexity-limited rasterization: automatic tiled and stepped-down retries with live progress in the export dialog, the achieved-resolution notice, and a hard error instead of a blank image when even the minimum fails.

## [0.8.0] - 2026-08-11 (voice-and-audience writing standard, blog series grouping)

### Added

#### Documentation

- **`website/guidelines/voice-and-audience.md` — the canonical audience/voice standard for user-facing writing** (docs, blog, website copy; **new writing only** — existing pages are not retroactively rewritten). Generalizes the stdlib-primers positioning: written for people who build things with code — working developers, designers who code, creative coders — with no formal CS background or deep mathematical expertise assumed. Four voice principles (physical-object mental models, jargon translated on first use, examples laddered simple → complex, gotchas stated early), a short-form/UI-copy section pinning canonical audience phrasings so surfaces don't drift, the Prerequisites-callout convention, an adjacency caveat for tonal seams next to older content, and a review checklist. Wired into `docs/CLAUDE.md`, `website/CLAUDE.md`, and `website/blog/CLAUDE.md` (whose shared-guideline link lists were also de-drifted), the agentic-review personas (PM audience-fit + ID voice-alignment focus areas, a new **change scope** prerequisite so voice review can target new/changed text only, and a prose-only carve-out for the PNG-preview requirement), the content-reviewer agent, and the `new-blog-post.ts` scaffold (Prerequisites stub in an HTML comment + a `build-blog.ts` warning on leftover scaffold text).
- **Blog index series grouping** — posts carrying `series`/`seriesPart` frontmatter (plus `seriesDescription` on part 1) render as one labeled series section on the blog index: eyebrow with part count, `aria-labelledby` section header, parts ascending as `h3` cards under the series `h2`. Implemented in parallel on the static index (`build-blog.ts`) and the SPA view (`blog-view.ts`); grouping is by series key across the whole date-sorted index, so a post dated between two parts can't split the section. The seven stdlib primers are the first series.

### Changed

#### Documentation

- **Website copy now names the audience** per the new standard: homepage lede/meta/JSON-LD gained "made for anyone who builds things with code"; blog index subtitle is now "Tutorials, deep-dives, and updates about pathogen-lang — written in plain language for people who build things with code"; docs meta descriptions gained plain-language framing; /explore and /featured subtitles and both of their `<meta name="description">` tags were rewritten; and the default title fallback no longer leaks the internal repo name ("SVG Path Extended") into title tags.

### Development

- `project-docs/writing-voice/` — implementation plan, the 4-persona agentic-review synthesis with per-finding dispositions (all 7 must-fix findings applied in-session), and the deferred-opportunities list. Most urgent deferral: the homepage hero code sample now sits directly under a lede promising approachability while opening with raw OKLCH triples and radians.

## [0.8.0] - 2026-08-07 (workspace switches refresh the old workspace's thumbnail)

### Fixed

#### Playground

- **In-app workspace→workspace switches now refresh the outgoing workspace's thumbnail** — previously only leaving the workspace view (to the landing page etc.) regenerated a changed workspace's card thumbnail; switching directly to another workspace left it stale. The switch branch now captures the old workspace id before it's overwritten and runs the same generate-if-dirty path, plus dispatches `thumbnail-updated` so landing-view cards refresh, and explicitly stops the old workspace's auto-generation timer (it previously leaked when the incoming workspace wasn't owned).
- **Hero renders are captured synchronously (blank-hero clobber fix)** — the hero image (uncropped render for the workspace detail page) was re-cloned from the **live** preview element *after* the thumbnail upload await. The preview pane is a singleton whose SVG node is emptied in place when the next workspace initializes, so on a switch the old workspace's hero would have been rasterized from empty/next-workspace content and silently overwritten. Both raster sources (square-crop thumbnail + full-aspect hero) are now serialized in one synchronous pass (`buildRenderSnapshots`, exported for tests) before any await; the hero rasterizes from the captured string via the existing `uploadHeroFromSvgString` (the now-redundant `uploadHeroRender` is removed).
- **Thumbnail tracking is stamped per-generation and switch-guarded** — completion previously wrote the *current* content hash into the "already thumbnailed" tracking slot. Because tracking is module-global, a generation for workspace A completing after workspace B loaded would stamp **B's** hash, falsely marking B clean so its thumbnail never regenerated; edits typed *during* a generation were likewise marked clean. The hash is now captured at generation start and only stamped if no workspace switch happened mid-flight.
- **Thumbnails are only generated for workspaces you own** — the navigate-away path ran generate-if-dirty unconditionally, so editing a `?state=` scratch doc or someone else's workspace produced a doomed upload (403/404) and a spurious "Thumbnail not updated" error toast (reproduced: leaving a share-link visit PUT a thumbnail to the literal id `scratch`). All four call sites (leave, switch, idle auto-generate, beforeunload) now share one ownership-guarded helper.

#### Development

- `scripts/debug-workspace-switch-undo.ts` gained scenario 6 (switch triggers auto + hero uploads for the old workspace, `thumbnail-updated` fires, and the next workspace's own thumbnail still generates — the cross-stamp backstop) and a global invariant that thumbnail uploads only ever target owned workspaces. Now 6 scenarios / 23 checks.
- `tests/playground-thumbnail-capture.test.ts` — 6 jsdom tests pinning the synchronous-capture contract (snapshots survive the source element being cleared in place) and the crop/hero geometry (centered square crop, supersample floor, explicit crop regions, 1440px aspect-fit hero, grid-chrome stripping).

## [0.8.0] - 2026-08-07 (returning to a workspace re-arms autosave)

### Fixed

#### Playground

- **Leaving the workspace view and returning to the same workspace no longer disarms autosave for the rest of the session** — leaving flushes and stops autosave (correct), but returning to the *same* workspace skipped `initialize()` via the `_initialized && same-id` guard, so `autosave.init()` never re-fired: every edit made after returning was silently never saved (reproduced: zero save requests for the remainder of the session). The leave branch now marks the view uninitialized — but only when the visit actually armed autosave (owned workspaces), so `?state=` scratch visits and non-owned workspaces keep the non-destructive skip path and in-memory edits survive an away-and-back (review-caught: an unconditional re-init would have re-decoded the share link's original code over the user's tweaks). A return then re-runs the full `initialize()` path — re-arming autosave (at a fresh server rev), the multi-tab coordinator, and thumbnail auto-generation. `initialize()` also gained a generation stamp so a leave/return oscillation faster than the flush round-trip can't overlap two same-id initializations (review-caught), and a bail caused by leaving mid-load marks the view uninitialized so the next return recovers instead of resuming half-loaded. Side benefit: returning re-fetches the workspace, so edits saved from another tab meanwhile are picked up instead of resuming a stale in-memory document (which previously guaranteed a 409 conflict on the next save). Note: per-visit undo semantics apply — returning starts a fresh visit with fresh undo history, consistent with the workspace-switch isolation fix below.

#### Development

- `scripts/debug-workspace-switch-undo.ts` gained scenario 5 (away-and-back re-arms autosave — pre-fix: the after-return edit produced zero save requests and was lost; exactly-once save assertion; `?state=` scratch edits survive leave-and-return). Now 5 scenarios / 19 checks.

## [0.8.0] - 2026-08-07 (workspace switches: undo isolation + autosave flush)

### Fixed

#### Playground

- **Undo can no longer resurrect the previous workspace's code (data loss)** — the code editor is a per-tab singleton, and switching workspaces used to load the new document via an ordinary (undoable) full-document transaction. In workspace B, one Cmd+Z past your own edits restored workspace A's entire text, which autosave then persisted into B — destroying it. Workspace loads now install a **fresh `EditorState`** (`_resetDocument` in `code-editor-pane.ts`): undo history starts empty on every switch, and since `setState` fires no update listener, programmatic loads no longer emit spurious `code-change`/`isModified`/autosave signals (callers set `store('code')` explicitly — all existing call sites already did). The error-highlight extension set and theme compartment are cached across resets so diagnostics and theme toggling keep working; behavior delta: loading a workspace no longer marks it modified, and auto-thumbnails now require an actual edit.
- **Stale autosave can no longer write foreign code into the previous workspace** — an in-app workspace→workspace switch never flushed/stopped autosave, leaving a live debounce (and page-teardown keepalive) save bound to workspace A while the next route's code streamed in. On the `?state=` share-link, non-owned-workspace, and 404/defaultCode paths — which never re-init autosave — that stale save wrote the *new* page's code into A (reproduced: a share-link visit persisted the shared code into the previously open workspace on tab close). `handleRouteChange` now flushes A's pending edits at switch time (they were previously **dropped** if you switched within the 5s debounce window) and `initialize()` awaits the flush then stops autosave unconditionally before any new-workspace state exists.

#### Development

- `scripts/debug-workspace-switch-undo.ts` — puppeteer repro + verification (4 scenarios, 15 checks: undo bleed incl. server-side destruction via the teardown keepalive save, flush-on-switch, share-link and 404 stale-save vectors; `--slow` waits out the 30s autosave interval). Pre-fix it fails 10/15, reproducing the reported data loss exactly.
- Tests: 6 new service-level tests (`tests/playground-workspace-switch-autosave.test.ts`) pinning the flush/stop/init ordering contract that workspace-view relies on. Full suite: 4665 passing.

## [0.8.0] - 2026-08-06 (arrays are read-only while being iterated)

### Changed

#### Core

- **Arrays are now locked against mutation during iteration** — calling `.push()`/`.pop()`/`.shift()`/`.unshift()` on an array, or assigning to an element (`arr[i] = x`), from inside a `.map`/`.filter`/`.reduce`/`.sort` block or a `for (item in arr)` body throws `Cannot call push() on an array while it is being iterated — callbacks and for-each bodies receive the array read-only. Iterate a copy with .slice(0) if you need to mutate.` Previously the iteration loops re-read the live length, so a callback pushing to its own array visited (and could keep) the appended elements — flagged in the `.filter` review as a plausible-bug generator. **Behavior change**: this is stricter than JavaScript (which permits mid-iteration mutation and snapshots the length in `map`/`filter`), and it intentionally breaks the for-each worklist pattern (`for (job in queue) { queue.push(...) }`) — iterate a copy (`queue.slice(0)`) instead. Reading the array (including nested read-only iteration of the same array) and mutating *other* arrays inside callbacks are unaffected; `.sort` locks its receiver while comparators run even though it sorts a copy. Implemented as a shared counter-based lock (`src/evaluator/iteration-lock.ts`) with an `iterationLock` field on both evaluators' `ArrayValue` types, acquired in `try/finally` at all 14 iteration sites (4 callback methods + 3 for-each walkers, per evaluator) and checked at all 11 mutation sites (4 mutator methods per evaluator + 3 indexed-assignment handlers). Documented authoritatively in `docs/syntax.md` → Reference Semantics, with pointers from the `arrayRef` param lists, the mutate-vs-copy note, the sort comparator restriction, and For-Each Iteration.

#### Development

- `scripts/debug-array-first-last-filter.ts` gained a third scenario asserting the iteration-lock error surfaces in the playground error panel.
- Tests: 23 new (evaluator lock matrix incl. arrayRef-vs-closure routes, sort comparator, reduce accumulator === receiver, lock release after completion, slice-copy escape hatch, object-for-each unaffected; annotated parity subset; exact-message assertions in errors suite). Full suite: 4657 passing. Zero pre-existing tests needed changes — no shipped program in the repo relied on mutation during iteration.

## [0.8.0] - 2026-08-06 (arrays: .first / .last / .filter)

### Added

#### Core

- **`.first` and `.last` array properties** — return the first/last element, or `null` when the array is empty (same contract as `.pop()`/`.shift()`), without mutating the array. The safe alternative to `list[0]` / `list[list.length - 1]`, which throw on empty arrays. Implemented as inline branches beside `.length` in both evaluators (deliberately *not* a `struct-properties.ts` descriptor, which would have silently enabled `let { first, last } = arr;` destructuring); completions/hover flow from `pathogen-api.ts`.
- **`.filter {|item, index, arrayRef| ... }` array method** — returns a new array containing the elements whose callback returns a truthy value (`null`/`0`/`false` falsy; non-zero numbers, `true`, non-empty strings truthy — same rules as `if`). No `return` in the block yields `null`, so the element is dropped. Supports the `<<` worker form (`arr.filter() << pred`) via `CALLBACK_METHODS` — now nine callback builtins. Modeled on `.map` in both evaluators: per-index error wrapping (`Error in .filter() callback at index N`), discard-sink callback bodies, original array untouched. Type inference and inlay hints treat `filter` like `map` (element/index block params, array-preserving returns).
- Known limitation (inherited from `.map`, flagged in review): a callback that pushes to the array being iterated visits the appended elements — iteration re-reads the live length. A follow-up change locks arrays against mutation during iteration.

#### Documentation

- `docs/syntax.md`: new `.first`/`.last` sections (with the `null`-element-vs-empty ambiguity note) and a `.filter` section styled after `.map` (three-example scaffold: item → index → arrayRef neighbor-reads), all examples verified against the evaluator. Multi-persona review fixes: the `<<` rule's "eight callback builtins" enumeration corrected to nine (two locations), the `## Null` intro now names `.first`/`.last` among null-on-empty sources, filter's truthiness rules stated inline with links to Null + Booleans, and the mutate-vs-copy note includes `.filter()`.

#### Development

- `scripts/debug-array-first-last-filter.ts` — puppeteer verification that `.filter`/`.first`/`.last` render correctly in the playground surface and the missing-block error reaches the error panel.
- Tests: ~40 new across evaluator (filter semantics, truthiness, copy behavior), annotated parity (incl. `<<` worker form — added from review), errors (exact messages), lambdas (`filter() << f` ≡ trailing block), and completions (phantom-method guard updated). Full suite: 4634 passing.

## [0.8.0] - 2026-08-06 (glyph character classes: isSpace / isTab / isNewline / isMark / codePoint)

### Added

#### Core

- **Granular character classes on `fromGlyph()` glyphs** — five new read-time members alongside `char`/`isWhitespace`: `isSpace` (all horizontal spaces: regular, no-break, ideographic `U+3000`, en/em/thin), `isTab`, `isNewline` (`\n`, `\r`, VT, FF, `U+2028`/`U+2029`), `isMark` (combining marks — harakat, niqqud, Thai vowel signs, combining accents), and `codePoint` (numeric escape hatch). `isSpace`/`isTab`/`isNewline` partition `isWhitespace` exactly — every whitespace character is exactly one of the three — so layout loops can branch space-vs-newline safely. NEL `U+0085` is deliberately excluded from `isNewline`: JS `\s` (the shipped `isWhitespace` test) does not match it, and the partition invariant wins over Unicode completeness. Astral-safe (`for...of` iteration + `codePointAt`). Implemented via a shared classifier (`src/evaluator/char-class.ts`) used by both evaluators — identical fromGlyph-only error guidance in each; completions/hover flow from `pathogen-api.ts`. Documented in `docs/path-blocks.md` ("Glyph provenance and character classes") with a hard-line-break layout example, an `isMark`-aware letter-spacing example (decomposed `é`), a tabs-are-not-tab-stops caveat, and a "Scripts and Unicode notes" section (newlines are script-universal, NEL exclusion noted; CJK spacing covered by `isSpace`; zero-width space `U+200B` is *not* whitespace — detect via `codePoint`; marks overlay rather than advance; no Arabic contextual shaping in the per-character model). Both doc examples are backed by compile tests. Multi-persona docs review applied (hex literals removed — Pathogen numbers are decimal; `isSpace` defined as the whitespace remainder incl. `U+FEFF`).

#### Development

- `scripts/debug-glyph-char-classes.ts` — puppeteer verification that the classification members and the docs' line-wrap pattern work end-to-end in the playground surface.
- Tests: unit coverage matrix over the classifier (27 characters spanning space/tab/newline/mark/none classes, asserting the partition invariant per character), end-to-end compile tests (including NBSP, ideographic space, combining accent, astral emoji `codePoint`), and non-glyph error paths in both evaluators.

## [0.8.0] - 2026-08-06 (workspace breadcrumb: export SVG size)

### Added

#### Playground

- **Export-SVG size in the workspace breadcrumb** — the breadcrumb now shows the generated SVG's human-readable size in parentheses after the workspace title (as a sibling of the ellipsis-truncated title span, so it survives long names; hidden ≤600px). The number is the **default-settings Export → SVG download size** (watermark, grid off, precision off) and is byte-identical to the file the export modal produces — verified end-to-end by comparing against the modal's real `_downloadSvg()` blob (`scripts/debug-export-size-breadcrumb.ts`). Computed via `requestIdleCallback` after successful compiles only (coalesced, `perfSpan('export-size')`-instrumented, never in the compile/render path); recomputes on background and layer/defs-visibility changes; keeps the last-good value on compile errors (matching stale-preview behavior) and resets on workspace switch, with an armed-flag guard against stale idle/font-fetch continuations writing a size from a half-cleared preview (caught in review).
- New store key `exportSvgBytes` (number | null) and `playground/utils/format-bytes.ts` (1000-based B/KB/MB, matches Finder).

#### Development

- **Export chrome extracted into shared utils** — the modal's watermark/brand-text (`playground/utils/export-chrome.ts`) and chrome-font fetch/cache/inject logic (`playground/utils/export-fonts.ts`, replacing `ExportModal._fontCache`) are now single-source modules delegated to by both the export modal and the size estimate, so the two paths cannot drift. `playground/utils/svg-export-size.ts` mirrors the download pipeline exactly.
- `scripts/debug-export-size-breadcrumb.ts` — puppeteer verification of span rendering, format, byte-identity with the export blob, and absence outside workspace view.
- Tests: `tests/format-bytes.test.ts` and `tests/svg-export-size.test.ts` (12 tests, exact byte-delta assertions incl. UTF-8 multi-byte and font-rule injection). Full suite: 4561 passing.
- Known limitations (pre-existing, flagged): SVG export embeds only the watermark/legend chrome fonts, never artwork fonts (`result.fontBinaries` lives in the iframe head, outside the cloned SVG) — the size correctly reflects this; and the breadcrumb story cannot demonstrate the span because storybook must not mutate `currentView`.

## [0.8.0] - 2026-08-05 (loop control: continue / break)

### Added

#### Core

- **`continue;` and `break;` loop-control statements** — C-family semantics: `continue` skips to the next iteration of the innermost enclosing `for` loop, `break` exits it. Valid in range loops, for-each loops (arrays and objects), loops inside `text` blocks, and `if`/`else` branches nested in a loop body. Everything else is a boundary — `fn` bodies, lambdas, callback blocks, `apply { }`, path blocks, text-block top levels — enforced at parse time with `'break' is only valid inside a for loop`. Implemented as no-throw flow codes in the main evaluator (per the Grid callback throw-deopt lesson — zero allocation and no try/catch on the hot path) and a flag in the annotated evaluator, with full parity. Editor surfaces flow through: completions, hover, syntax highlighting (playground + VS Code TextMate), formatter, and missing-`;` diagnostics. Documented in `docs/syntax.md` → "Loop Control: continue and break".
- **Compatibility note**: `break` and `continue` are now reserved words and can no longer be used as variable names.
- Review hardening: loop control also works in loops inside `&{ }` text-block *expressions* (a separate evaluator walker from the `text(x,y){}` statement form — caught in review with an empirical repro), and every callback/defs-producer body site carries the defensive boundary guard.
- Known pre-existing follow-up (not from this change): `buildTextIfStatement` drops the body of a text-for-loop nested inside a text-block `if` (`ast-builder.ts` uses the generic loop builder there), so statements in that position are silently discarded — needs its own fix.

## [0.8.0] - 2026-08-05 (glyph provenance: char / isWhitespace / isEmpty)

### Added

#### Core

- **`PathBlock.isEmpty`** — `true` when a block has no path commands; the documented way to detect space glyphs from `fromGlyph` (and other empty blocks like `subPath(t, t)`), replacing the undocumented `subPathCount == 0` idiom.
- **`glyph.char` and `glyph.isWhitespace`** on `PathBlock.fromGlyph()` results — each glyph now records its source character (1-char string expando, like `advanceWidth`) and whether it is whitespace. Reading them on a non-glyph PathBlock errors with a pointer to `fromGlyph`/`isEmpty`. Implemented in both evaluators; completions/hover flow via `pathogen-api.ts`; documented in `docs/path-blocks.md` → "char, isWhitespace, isEmpty".

## [0.8.0] - 2026-08-05 (CJK Google Fonts subset loading)

### Fixed

#### Core

- **Non-Latin text in `PathBlock.fromGlyph()` / `TextBlock.toPathBlock()` no longer renders as placeholder boxes** — the playground fetched only the latin `@font-face` block of a Google Fonts css2 response, so CJK families (Google splits e.g. Korean fonts into ~90 `unicode-range` slices) silently mapped every non-Latin character to `.notdef`. The registry now supports multiple subset buffers per family+weight (`FontData.unicodeRanges`, `getFontVariants`), and a new coverage-aware `lookupGlyph` in `font-provider.ts` — shared by both evaluators and all three glyph call sites — selects the variant whose unicode-range and cmap actually cover each character.
- **Missing glyphs now warn instead of failing silently** — characters no registered variant can render still draw the font's placeholder box but emit a `[warn]` log naming the font, weight, and characters, and are reported structurally via `CompileResult.missingGlyphs`.

#### Playground

- **On-demand unicode-range subset fetching** — `font-loader.ts` parses all css2 `@font-face` blocks into a per-family subset index (`parseGoogleFontsCss`, `parseUnicodeRange`); when a compile reports missing glyphs, `compiler-worker.ts` fetches only the slices covering those codepoints and recompiles once (max 2 passes, progress-gated). Fetched slices are cached and included up front on later compiles, so steady-state stays at one compile per keystroke. Preview-iframe `@font-face` data URIs now carry `unicode-range` so `<text>` rendering composes the slices correctly.
- Known follow-ups: (1) PDF-export text outlining (`svg-text-outliner.ts`) still resolves only the primary subset per family; per-character variant selection there is deferred. (2) Once fetched, all of a family's subset slices ride every keystroke recompile's postMessage clone — fine for a handful of slices, but a CJK-heavy document touching many Hangul-block slices deserves a perf check and possibly a worker-side buffer cache. (3) `font-metrics.ts` bounding-box estimation still uses weight-only `getFont`, so CJK `.boundingBox()` estimates use the primary subset's metrics.

#### Documentation

- `docs/path-blocks.md`: `@font` now documents automatic script-subset loading; new "Non-Latin text and missing glyphs" section documents the placeholder-box + `[warn]` behavior.

## [0.8.0] - 2026-08-04 (Color.flatten)

### Added

#### Core

- **`Color.flatten(background?)`** — merges a translucent color down onto a solid background, image-editor style, returning the opaque color the user actually sees on screen. Compositing is Porter-Duff source-over on gamma-encoded sRGB channels (the same math browsers use to paint a translucent CSS color over a page), with the background defaulting to white. A translucent background is allowed and keeps the correctly composited alpha (`αs + αbg·(1−αs)`); flattening onto any opaque background always yields alpha 1. Theme-dynamic colors (`CSSVar(...)`-backed or `Color.lightDark(...)`) are rejected with a targeted error — CSS has no alpha-compositing expression, so the result could not follow the theme. Implemented in both evaluators with parity tests; completions, hover, and inlay hints flow via `pathogen-api.ts`; documented in `docs/color.md` → Flattening.

## [0.8.0] - 2026-08-04 (stdlib primers)

### Added

#### Documentation

- **"Stdlib Primers" blog series (posts 33–39)** — the seven internal primers published to pathogen.studio as a seven-part series (`primer-hash01` … `primer-noise2`, dated 2026-08-04 → 08-10), one post per deterministic stdlib function, each with five interactive mini-workspace examples (35 samples in `samples/post33..39/`, all validated at 0 warnings). Series TOC + part subtitles per the multi-part conventions; the internal `project-docs/stdlib-primers/` pages remain as the paper trail, cross-linked from the BBWP pinned section.
- **Blog date rendering fixed across surfaces** — `YYYY-MM-DD` frontmatter dates parse as UTC midnight but were formatted in the local/runtime timezone, so the static build (PDT) showed one day earlier than the CF worker (UTC). All five blog-date formatters now pass `timeZone: 'UTC'`; "The Reliable Line" renders August 3 everywhere.

#### Development

- **Internal stdlib primers** (`project-docs/stdlib-primers/`, linked from the pinned section atop `website/bbwp/index.html`) — seven standalone blog-post-style pages, one per deterministic stdlib function (`hash01`, `hash11`, `hashRange`, `smoothstep`, `bump`, `noise`, `noise2`), each with a plain-language mental model and five worked examples climbing from a bare function plot to a finished composition. 35 compiled-in-process `.pathogen` examples; regenerable via `build-primers.ts` (`--only`, `--check`); local-only (serve:bbwp), never deployed. Multi-persona reviewed.

## [0.8.0] - 2026-08-03 (`<<` worker application)

### Changed

#### Core

- **Lambda application to callback builtins moved from argument position to the `<<` operator** — `arr.map(f)` / `spine.compoundVariableOffset(mk)` are replaced by `arr.map() << f` / `spine.compoundVariableOffset() << mk` across all eight callback positions (array `.map`/`.reduce`/`.sort`, `Grid.fill`/`.forEach`/`.map`, `variableOffset`/`compoundVariableOffset`). Rationale: parentheses parameterize the builtin (`reduce(init) << f`), `<<` supplies the worker — the same application shape as `PathLayer('name') << styleBlock` and object merge, and it keeps the parens free for future parameters on block-taking builtins. The argument form is removed (it never reached production use) and errors with a pointer to `<<`. Trailing literal blocks are unchanged; lambdas remain first-class values and user functions still take them as ordinary arguments. Evaluation order: receiver → parenthesized args → worker → iteration. Error text at every site now advertises the `<<` form, and a callable landing on the merge path gets a targeted hint. Annotated-evaluator parity rides along: the previously missing `ObjectValue << ObjectValue` merge case now works under `--annotated`, and its `<<` error text matches the main evaluator. Editor intelligence follows (test-pinned): worker-lambda params (`<< {|go, pb| ...}`) bind to their owning call and get the same member completions and typed hover as trailing-block params, and `let a = arr.map() << f;` infers the completed call's type for chain completions.

## [0.8.0] - 2026-08-02 (deterministic hash & shaping stdlib)

### Added

#### Core

- **`hash01(n, seed?)` — deterministic random, bit-identical everywhere** — hashes an integer index to `[0, 1)` using only exactly-specified operations (lowbias32 integer mixing, `Math.imul`, IEEE arithmetic — no trigonometry), so it returns the identical value for identical arguments on every engine and surface — CLI, playground, and VS Code preview agree on every recompile, and the hash constants are a fixed contract. The optional `seed` selects an independent stream (`hash01(i, layerIndex)` replaces ad-hoc salts like `hash01(i * 7 + layer * 1013)`). Inputs truncate to 32-bit integers (`hash01(0.9) === hash01(0)`, non-finite inputs truncate to 0 — documented; continuous-input `noise()` is the companion). Supersedes the sin-fract folklore hash from blog post 31, whose `Math.sin` core is not bit-specified across JS engines. User-defined `fn hash01` still shadows the builtin (test-pinned), so existing programs are untouched.
- **`smoothstep(edge0, edge1, x)`** — the GLSL Hermite ease (`t*t*(3-2*t)` over the clamped normalized range): rises 0 → 1 with zero slope at both edges, saturates outside them, reverses when the edges are swapped (defined and tested, unlike GLSL), and collapses to a hard step when the edges are equal (NaN only at `x === edge0`). The callable analog of `Easing.Smoothstep`.
- **`noise(x, seed?)` and `noise2(x, y, seed?)` — deterministic value noise** — the continuous companions to `hash01`: `hash01` at every integer lattice point (`noise(k) === hash01(k)` exactly), smoothstep-faded between them, so the result is smooth with zero slope at each lattice point and stays in `[0, 1)`. `noise2` bilinearly blends the four surrounding corners. Scale the input for frequency (`noise(t * 8)`), pass a seed for independent streams. Same bit-exact cross-engine guarantee as `hash01` (floor + IEEE blend arithmetic only). Test-pinned: exact blended values, lattice identity, continuity across a lattice point, negative inputs, corner collapse.
- **`hash11(n, seed?)` and `hashRange(n, min, max, seed?)`** — range conveniences over the same hash: `hash11` remaps to `[-1, 1)` for signed jitter (`1 + hash11(i, layer) * 0.2`), `hashRange` scales into `[min, max)` as the deterministic drop-in for `randomRange`.
- **`bump(t, center, spread)`** — the raised-cosine width-envelope kernel from blog post 31's `bulge`, now built in: exactly 1 at `center`, eased to exactly 0 (zero slope) at `center ± spread` and beyond. Test-pinned as a term-for-term drop-in for the hand-rolled `0.5 * (1 + cos(mpi(clamp(abs(t-center)/spread, 0, 1))))`. Uses cosine, so deterministic per engine rather than bit-pinned cross-engine — docs scope the guarantee accordingly.
- **`easeIn(t)` / `easeOut(t)` / `easeInOut(t)`** — callable forms of the `Easing` enum members, using the enum runtime's exact quadratic formulas (`t²`, `1−(1−t)²`, piecewise) so a width profile eased with `easeInOut(t)` matches a gradient eased with `Easing.EaseInOut`; inputs clamp to `[0, 1]`. `Easing.Smoothstep` ↔ `smoothstep(0, 1, t)` and `Easing.Linear` ↔ identity complete the mapping (documented in a docs table, with the CSS cubic-bézier distinction called out).

#### Documentation

- `docs/stdlib.md`: new **Hash & Noise** section (determinism contract, seed streams, integer-truncation note, Cycler cross-reference), `smoothstep` in Interpolation & Clamping, and the Random section now points to `hash01` for reproducible output.
- New blog post **"The Reliable Line: Hash, Noise, and Envelopes Join the Stdlib"** (`website/blog/the-reliable-line.md`, five samples in `samples/post32/`) — why the built-in hash is deliberately not the sin-fract folklore hash (bit-exactness argument), the glow from "The Shape of a Stroke" rebuilt on `bump`/`hash11` with zero helper fns, the envelope vocabulary as one-liners (including the two-smoothstep plateau idiom), `noise()` frequency sweeps, and the `noise2()` coherent-field finale. Validated (0 warnings) + multi-persona agentic review applied.
- **Variable-Width Strokes series formalized**: "The Swelling Line" (part 1), "The Shape of a Stroke" (part 2), and "The Reliable Line" (part 3) now carry part subtitles and a shared series TOC with forward/back links.

## [0.8.0] - 2026-08-02 (lambda expressions)

### Added

#### Core

- **Lambda expressions — function literals with lexical capture (closures)** — the trailing-block syntax is now a first-class expression: `let f = {|a, b| return a + b; };` then `f(1, 2)`. `{|| ... }` is the zero-parameter form (previously the two pipes lexed as logical-or). Lambdas capture the scope where they are *written* — by reference, so later reassignments are visible, and for-loops (which create a per-iteration scope) give each loop-born lambda its own iteration's bindings. Named `fn`s deliberately keep their historical dynamic scoping (free names resolve in the caller's scope); both behaviors are now pinned by tests (`tests/evaluator.test.ts` "scoping" describe) and documented for the first time. Grammar: `TrailingBlock` joined `primaryExpression` (zero LALR conflicts; parser regenerated — the generator now emits the `keyof` annotation itself, no hand patch needed). Runtime: `UserFunction` gained optional `closure`/`isLambda`; the call path is `createScope(fn.closure ?? scope)`, so named fns are untouched. Body semantics match named fns (`return` a value, or path-command fall-through → PathSegment), and the stdlib-vs-user Angle-unwrap asymmetry is preserved. Full parity in the annotated evaluator, including the PathCommand-arg second dispatch; `log()`/template display renders `Lambda(a, b)` / `Function(x)` instead of `[object Object]`.
- **Builtins accept workers via `<<`** — wherever an iteration builtin takes a trailing block, a lambda (or named fn) now applies with the `<<` operator, mirroring `PathLayer('x') << styleBlock`: array `.map() << f`/`.reduce(init) << f`/`.sort() << cmp`, `Grid.fill() << f`/`.forEach() << f`/`.map() << f`, `spine.variableOffset() << f`/`.compoundVariableOffset() << f`. Parentheses keep the builtin's real parameters (`reduce(init)`); `<<` supplies the worker. Structural rule: a callback builtin written without a trailing block takes its worker from `<<`; anywhere else `<<` remains merge/concat (`vo() {|go,pb| ...} << edge` still concatenates). One shared `resolveCallbackBlock` helper per evaluator; lambda invocation rides the existing top-level-return fast path, and block-vs-worker output parity is test-pinned per builtin family (`tests/lambdas.test.ts`, incl. a position coverage matrix). Deliberate v1 limits, documented in `docs/syntax.md`: callee expressions (`fns[0](5)`, `obj.f(1)`, IIFE) are not yet callable — bind to a `let` first (pre-existing gap shared with named fns); lambda *literals* cannot sit inside path-argument calls (path args stop at `|`) — `<< {|x| ...}` is unaffected; constructor binding blocks (gradients/Marker/Pattern/filters/Grid ctor) still require literal blocks (`<<` there is a possible future extension).

#### Development

- Language services: lambda params bind as block parameters in scope analysis (rename/references/semantic tokens flow); `describeError` gained TrailingBlock-aware messages (malformed params, unclosed block, zero-param hint); formatter emits lambdas idempotently and never collapses `{||` to an object literal; `lambda` snippet + hover entry (static completion data and the VS Code snippet file); hover binding-form matrix rows for lambda literals and lambda params (documented-uninferable). TextMate grammar needed zero changes (its `{\|` rule is position-independent). Playground smoke-verified end-to-end via `scripts/smoke-lambda-playground.mts`.

### Documentation

- `docs/syntax.md` § Functions gained **Scoping: functions vs lambdas** (documents the long-standing dynamic scoping of named `fn`s, previously unwritten) and **§ Lambdas** (syntax, closures, loop capture, mutation visibility, builtin callback interop, limitations), plus a first-class-functions example under Defining Functions; existing Function examples gained their mandatory semicolons.
- Fixed `docs/variable-offset.md`: same-sign compound offsets produce a **detached band** floating beside the spine (previously mis-described as a "self-intersecting ribbon" — contradicted by actual renders).
- New blog post **"The Shape of a Stroke: Envelopes, Bulges, and Lambdas"** (`website/blog/lambdas-come-to-pathogen.md`, five interactive samples in `samples/post31/`) — builds a richer variable-width stroke via width-as-a-function envelopes and introduces lambdas as the capability that makes envelopes composable; validated via `scripts/validate-samples.ts` (0 warnings) and multi-persona agentic review.
- Internal: `project-docs/bulge-strokes/` — the bulge-strokes tutorial (stages 0–6 plus lambda-refactored `03b`/`06b`, with `06b` diff-verified byte-identical to `06`), review fixes, self-contained preview renderer, and blog-context primer.

## [0.8.0] - 2026-08-01 (first-class Angle values)

### Changed

#### Core

- **Angle literals are now first-class Angle values** — `90deg`, `1.5pi`, `2rad` evaluate to a runtime Angle (radians inside, written unit remembered) instead of decaying to a plain number. An angle survives variables, arrays, and function calls, and coerces to its radians value in every ordinary numeric context (path arguments, trig, comparisons, loop bounds), so existing numeric behavior and emitted path output are byte-identical. Behavior changes, all deliberate:
  - `let turn = 0.5pi; c.hueShift(turn)` now shifts 90° (previously a silent 1.57° shift — the angle-variable trap this feature removes). Same for `analogous`/`splitComplementary` and ConicGradient `from`/`to`, Marker `orient`, filter angle slots, and transform/rotation APIs, which all accept Angle-carrying variables.
  - `Color(L, C, H)` with an Angle `H` auto-converts to degrees — `Color(0.6, 0.15, 90deg)` now stores hue 90, not 1.57. (`.hue` still returns a plain number in degrees.)
  - Interpolating an Angle into a template literal or `log()` displays its written unit (`90deg`, `0.5pi`) instead of the raw radians number; use the new `.rad`/`.deg`/`.pi`/`.turns` members for bare numbers, or `.toDeg()`/`.toRad()`/`.toPi()`/`.toTurns()` to re-tag the display unit without changing the angle (`turns` is display-only — it has no literal form).
  - `calc()` arithmetic propagates angle-ness (angle ± angle, angle × plain, angle ÷ plain stay angles; angle ÷ angle is a plain ratio). Static literal mismatch errors are unchanged.
  - `sort()` now orders arrays of Angles (and booleans) instead of erroring.
  - The `deg()` escape hatch is no longer needed (still works; returns a plain number).

### Documentation

- Rewrote `docs/syntax.md` § Angle Units around the new value semantics (members, arithmetic, display); inverted the "units do not survive a variable" callout in `docs/color.md` § Hue; updated gradients/stdlib/layers/filters/markers angle notes accordingly.

## [0.8.0] - 2026-07-31 (admin Set Thumbnail from moderation)

### Added

#### Playground

- **Admin "Set thumbnail" on the moderation Approved/Featured tabs** — admins can now enter the interactive thumbnail crop workflow from `/admin/moderation` for workspaces they don't own. The button sits beside "Regenerate preview" and opens the existing `<thumbnail-crop-modal>` on a render of the frozen approval code (the same immutable source Regenerate uses), saving as `kind=manual` so the crop takes precedence over the auto layer on all public reads; the hero render refreshes from the same frozen SVG. Auth rides the session cookie via the existing session-admin upload bypass — no API changes. The modal's `open()` gained an optional `{workspaceId, context, title}` parameter (owner path unchanged): admin context hides the Clear button (DELETE remains owner-only), skips the owner-workspace store sync, shows the target workspace's name in the header, and adjusts the toast copy. The compiled SVG is origin-normalized before opening — the crop math assumes a `0 0 w h` viewBox but `define ViewBox` allows any origin — via the new pure helper `computeOriginNormalization` (`playground/utils/svg-origin.ts`, unit-tested in `tests/playground-svg-origin.test.ts`), and gets an injected white `#preview-bg` rect so the crop preview is WYSIWYG with the white-filled PNG output. The modal is body-mounted once (the view's `render()` wipes its shadow root on every state change), closed on SPA navigation, and guarded against two cards racing onto the shared instance. Owner-path Set Thumbnail has the same non-zero-origin latent bug — deferred, see `project-docs/admin-set-thumbnail/STATUS.md`.

### Fixed

#### Playground

- **Moderation toasts were silent no-ops** — `admin-moderation-view`'s `_toast` dispatched a `'toast'` event, but the only listener anywhere is `<app-toast>`'s `'show-toast'`; every toast in the view ("Approved: …", "Regenerate failed: …") was a dead event. Now dispatches `show-toast` with `detail.title`, and failure toasts carry `type: 'error'` styling.
- **Stale moderation card thumbnails after Regenerate / Set thumbnail** — the card's R2 `<img>` URL was stable, so the browser kept serving its cached PNG after a regenerate. The URL is now cache-busted on `thumbnailAt`, and a `thumbnail-updated` listener stamps the entry and drops the cached compile (which would otherwise shadow the fresh image) so the card repaints immediately.

## [0.8.0] - 2026-07-30 (detail-page live hero viewer)

### Added

#### Website

- **Live hero viewer on workspace detail pages** — the public `/u/:handle/:slug` hero upgraded from a static plate to a live viewer over the pre-compiled approval SVG: frameless stage, pan/zoom with the shared controller + zoom pill, a hover-revealed fullscreen button with viewport-fill fullscreen, and a layers inspector gated to fullscreen. All viewer behavior reuses the existing component stack (`<mini-preview>` sandboxed iframe, `<inspector-panel>`, shared fullscreen-toggle util); new code is host glue only (`playground/utils/detail-hero-mount.ts` hydration + `website/_worker.ts` gating so non-vector pages serve byte-identical HTML). The static object/img/swatch fallback chain is unchanged and remains the no-JS/failure experience. Verified 31/31 E2E checks on the dev stack in both themes.

#### Development

- **Approval-SVG backfill sweep** (`scripts/`) — regenerates missing approval SVGs through the exact admin "Regenerate preview" pipeline (puppeteer harness running the real compiler worker + `generateSvg`, PUT to `/admin/approval/:id/svg`). Unions the approved and featured listings (they're disjoint), skips GPU-gradient sources by default (their vector fallback would degrade accurate raster heroes; `--include-gpu` overrides), reports and leaves per-item failures untouched, and refuses non-local `--api-base` writes without `--confirm`. Local run: 15 candidates, 7 regenerated to the live viewer; over-cap/parse-error items correctly kept their static heroes.

## [0.8.0] - 2026-07-29 (PDF export: transparent-background black band)

### Fixed

#### Playground

- **Thick black border in exported PDFs when the workspace background is transparent** — the PDF export paints the margin+bleed area with the workspace background so trimmed posters print edge-to-edge, but `resolveCssColorToHex` resolved any zero-alpha color (e.g. `oklch(75% 75% 180 / 0%)`) to opaque `#000000`, painting the whole band solid black (found via a real user export with Bleed + crop marks on). Zero-alpha colors now resolve to `null` — the fill is skipped and the paper stays white, matching the `transparent` keyword — and semi-transparent backgrounds are flattened over white (new pure helper `flattenOverWhite` in `playground/utils/svg-pdf-colors.ts`) instead of painting at full strength. The same resolution feeds the raster/JPEG flatten, which now correctly falls back to white paper instead of black. The SVG paint-normalization path (`normalizeSvgPaintColors`), which folds alpha into `*-opacity` attributes, is unchanged. The PDF path also strips the clone's `#preview-bg` rect — the page-level fill is the single source of background paint, so a semi-transparent background no longer composites a second time inside the artwork area (which would have printed a deeper tint there than in the margins). Unit tests in `tests/svg-pdf-colors.test.ts`; red/green E2E verification on the real export path plus regression checks in `project-docs/unified-export/verify-export.ts` (which also documents that the pre-unification `verify-pdf-export.ts` harness can no longer drive the renamed modal). One sentence added to `docs/exporting.md` documenting the transparent/semi-transparent background behavior.

## [0.8.0] - 2026-07-29 (array reverse + sort)

### Added

#### Core

- **`.reverse()` and `.sort()` array methods** — both return a new array, leaving the original unmodified. Bare `.sort()` sorts in natural ascending order (numbers numerically, strings by character-code order); arrays holding anything else (Points, Colors, `null`, mixed types) — or numeric arrays containing `NaN`, which the sort algorithm would otherwise silently treat as "equal" — throw a clear error directing the user to a comparator. `.sort {|a, b| return calc(a - b); }` takes a JS-style comparator trailing block (negative → `a` first, positive → `b` first, zero → keep order; stable). A comparator that returns a non-number — including a boolean from `return a < b;` or nothing at all — is an error naming the `calc(a - b)` form. The comparator loop uses the top-level-return fast path (no per-comparison throw/catch), and both methods behave identically in the annotated evaluator. Editor support flows end-to-end: completions with snippets, hover, chain return-type inference, comparator block params infer the array's element type, and array-receiver `.reverse()` inlay hints now say `Array` instead of `PathBlock`. Documented in `docs/syntax.md` (Arrays → Methods).

## [0.8.0] - 2026-07-29 (editor typing-latency overhaul)

### Fixed

#### Playground

- **Typing choppiness on layer-heavy programs eliminated** — every debounced compile used to land a ~550 ms main-thread long task on a ~900-layer program (measured: keystrokes queued behind it with 440–560 ms input delays; 52% of wall-clock frozen during sustained typing). The compile itself was already off-thread in the worker — the freeze was the inspector pipeline: one store subscription over seven keys re-ran a full `inspectorPanel.setData(everything)` once per changed key, and each `setData` reassigned every field to all three child panels, each assignment a full re-render. Three-part fix: (1) the workspace-view subscription coalesces to a single `setData` per microtask; (2) `setData` is differential — only fields whose object identity changed are forwarded (callers must replace arrays/objects, never mutate in place); (3) the panels batch their own property-setter re-renders into one `updateList` per microtask, and layers-panel + palette-panel build their row lists as a single HTML string assigned via one `innerHTML` pass (one parse instead of one per row) with click handling moved to event delegation. Measured after: ~2.4 ms per compile for the store-update block, ~52 ms worst long task, zero keystrokes over 50 ms during sustained typing on the same program. Interpolated layer names, def ids, and style values are now HTML-escaped (previously unescaped), and swatch/dot style values pass a `cssValueForStyleAttr` guard (`playground/utils/html-escape.ts`) so the `style="…"` attributes don't depend solely on the evaluator's `validateCSSValue` allow-list. Regression tests in `tests/playground-inspector-coalescing.test.ts` cover coalescing, differential forwarding, delegated eye/group/defs-row clicks, escaping, and the injection guard.

### Added

#### Development

- **Flag-gated editor perf instrumentation** (`playground/utils/perf-marks.ts`) — inert unless `localStorage.pathogenPerf = '1'` or `?perf=1`; emits `performance.measure('pathogen:*')` spans plus `[perf]` console lines for the compile round-trip, GPU gradient pre-render, post-compile store updates, per-key store notifies, defs/layer mount, the getBBox reflow loop, font base64 encode, `getDiagnostics`, signature help, and scope analysis, and installs observers logging input events > 50 ms and all long tasks.
- **`npm run perf:typing`** (`scripts/perf-typing-audit.ts`) — puppeteer editor-latency profiler: loads a `.pathogen` source (or a generated heavy program) via `/workspace/scratch?state=`, drives real typing / cursor-movement / error-state bursts against live CodeMirror, and aggregates the perf spans per phase. Diagnosis narrative and before/after numbers in `project-docs/editor-perf/FINDINGS.md`.
- Benchmarked but deferred (tracked in `project-docs/editor-perf/FINDINGS.md`): `showError()`'s main-thread `getDiagnostics` re-evaluates the whole program per errored compile — ~64 ms per keystroke pause in a long-lived error state on a loop-heavy program, scaling 1:1 with compile time (glyph-font programs dodge it because the fonts-absent main-thread evaluation skips glyph loops — itself a diagnostics-divergence hazard). Fix direction: run diagnostics in the existing compiler worker.

## [0.8.0] - 2026-07-28 (readable `viewbox` global)

### Added

#### Core

- **Ambient `viewbox` global** — the values set by `define ViewBox(originX, originY, width, height);` are now readable anywhere after the define executes, via a read-only struct with members `originX`/`originY`/`width`/`height`. This removes the update-two-places pattern for full-canvas backgrounds: `let {width, height} = viewbox; rect(0, 0, width, height);`. Lowercase `viewbox` is a plain identifier resolved as a scope-chain fallback (the `ViewBox` keyword is untouched; zero grammar changes), so a user variable named `viewbox` shadows the global and existing programs keep their meaning. Reading it before the define has run — including in a program with no `define ViewBox` at all — is an error (`viewbox is not available until define ViewBox(...) has run`); the implicit `0 0 200 200` rendering default is deliberately not readable. Each read returns a fresh copy, and dot access, destructuring, and rest patterns all work via the shared struct-property registry in both evaluators. Full editor support: member completions, destructuring-pattern completions, hover, and scope analysis treat `viewbox` like `ctx`. Documented in `docs/viewbox.md` (new "Reading the viewbox" section) with a cross-link from `docs/syntax.md`.
- **Annotated evaluator now implements `define ViewBox`** — previously a silent no-op (no validation, no storage), it now mirrors the main evaluator's guards (top-level-only, duplicate rejection with first-defined line, finite numbers, positive dimensions) so `viewbox` reads and error behavior are identical in annotated mode.

### Fixed

#### Core

- **`define ViewBox` inside path and text blocks is now rejected** (`ViewBox definitions are not allowed inside path blocks`) — previously it was silently discarded into the block's isolated state, contradicting the documented top-level-only placement rule. The guard lives in the `ViewBoxDefinition` evaluator case itself (not just the block-body loops), so a definition nested in `if`/`for` inside a block is caught at any depth.
- **Struct values in style-block values are now a compile error instead of silent CSS corruption** — `stroke-width: viewbox;` (or `ctx`, a `Point`, a `Grid`, …) used to keep the raw source text and emit invalid SVG like `stroke-width="viewbox"` that browsers silently drop. Any value with a struct descriptor now errors with `a ViewBox value has no CSS form — use one of its members instead`. The keep-raw fallback for *unparseable/unevaluable* values (`rgb(...)`, `context-stroke`, multi-value strings) is deliberately unchanged.
- **`log(viewbox)` and `` `${viewbox}` `` interpolation format as `ViewBox(originX, originY, width, height)`** instead of `[object Object]`.
- **Annotated evaluator rejects `viewbox` member assignment** (`Cannot assign to property 'width'`), matching the main evaluator. (The annotated evaluator's broader silent-accept of unhandled member assignments — e.g. `point.x = 5` — predates this work and is left as a tracked follow-up, since fixing it wholesale needs its own regression pass.)

## [0.8.0] - 2026-07-28 (any Google Font via @font)

### Added

#### Playground

- **`@font` accepts any family published on Google Fonts** — the curated ~100-family picker list no longer gates the directive; `@font "Gravitas One";` now loads instead of erroring with `Unknown Google Font`. The fetch itself is the existence probe: a family Google serves compiles with a non-fatal dismissible notice (`"Gravitas One" is not in the curated font list; loaded directly from Google Fonts.`); a family it can't serve is a compile error whose message notes it may equally be a network failure (css2 errors carry no CORS headers, so the two are indistinguishable in the browser) and points at fonts.google.com and the picker. Requesting a weight a non-curated family lacks retries at the family's css2 default weight and reports an accurate substitution (`does not provide weight 700 on Google Fonts; using its default weight 400`) rather than failing — the playground knows the curated families' weight lists but not anyone else's. Failed probes are negative-cached for 60 s so per-keystroke recompiles don't refetch bad names; curated-family behavior (pre-fetch nearest-weight snapping, no failure caching) and the style-block `font-family` whitelist gate (per-keystroke typing protection) are unchanged. Publish precheck and admin re-renders inherit the probe, so published workspaces may now use any Google Font. Documented in `docs/path-blocks.md` (Font Integration — new curated-vs-any comparison table quoting the exact runtime strings).

### Fixed

#### Development

- **`check-links` was validating almost nothing** — the link checker now actually resolves and verifies cross-references; running the fixed checker surfaced 30 broken cross-references across the docs, all repaired.

## [0.8.0] - 2026-07-28 (object shorthand + style-value interpolation)

### Added

#### Core

- **Object literal shorthand properties**: `{ contour, leftOffset }` is now sugar for `{ contour: contour, leftOffset: leftOffset }` — the mirror of the destructuring shorthand the language already had. The AST builder desugars to an ordinary `key: value` pair, so evaluation, scope analysis, and navigation needed no changes; the formatter and annotated source printer round-trip the sugar instead of expanding it, and rename expands a shorthand reference to `{ key: newName }` rather than silently renaming the property key. Documented in `docs/objects.md` (new Shorthand Properties section) with a cross-link from `docs/syntax.md`.
- **Template fragments inside style values**: a backtick template can now sit *anywhere* in a style-block value, not just span the whole value — ``filter: blur(`${randomRange(1.1, 2.2)}`px);`` splices the evaluated fragment into the surrounding text (previously a misleading `disallowed token` error; the editor grammar already accepted the shape). Spliced results are validated against the same strict allow-list as hand-written values, so interpolation remains convenience, not an escape hatch. Works identically in annotated mode.
- **Numeric variables substitute inside CSS function args**: `filter: brightness(level);` now emits `brightness(1.4)` — matching the existing Color/CSSVar substitution — instead of silently emitting invalid CSS (`brightness(level)`) that browsers drop. Literal tokens are never touched, including unit-carrying negatives like `hue-rotate(-90deg)`. Chained filter functions (`blur(2px) brightness(level)`) now resolve embedded variables too; previously only single-function values did. Substitution is not unit-aware — documented, with the unitless filter functions named explicitly.
- **All interpolation forms behave identically**: a whole-value template's result now gets the same function-argument resolution as a fragment, so `` `blur(${s}px) brightness(level)` `` resolves `level` instead of emitting it verbatim for the browser to drop.

- **CSS function arguments are checked for units.** `filter: blur(4);` used to compile and emit `blur(4)` — a unitless length that browsers silently drop — and the same held for a substituted variable or an interpolated fragment. Pathogen now rejects it with a fix-it message (`blur() takes a length — "4" needs a unit (try 4px)`). The check runs on the final value, so literal, variable, and interpolated arguments are all covered, and it reaches the CLI, playground, and VS Code through the existing diagnostics path. Rules are per function: lengths for `blur`/`drop-shadow`, angles for `hue-rotate`, length-or-percentage for the basic shapes, and plain numbers for `cubic-bezier`/`steps`/`matrix`/`scale` (where a unit is now an error in the other direction). Unitless zero is always allowed. The rule is that Pathogen checks units only where CSS and SVG agree on the answer: **`rotate`/`translate`/`skew` and the color functions are deliberately unchecked** — transforms are emitted into SVG's `transform` attribute, whose grammar takes unitless user units (`rotate(45)` is correct there and is what Pathogen's own convenience properties generate) while CSS requires units, and color channels accept numbers, percentages, and angles interchangeably. `scale*`/`matrix*` are the transform-family exception: a unit is invalid in *both* grammars, so there is one right answer and it is enforced.
- **Functions must match the property they're used on.** `fill: rotate(45);` was accepted because no property-to-function mapping existed; it is now an error. The mapping covers `filter`, `clip-path`, `transform`, the color properties, and the timing-function properties — any property outside that list still accepts any allow-listed function, and only the outermost function is matched, so `drop-shadow(4px 4px 8px oklch(…))` keeps working.

### Fixed

#### Core

- **Lenient parse no longer fabricates an identifier from a colonless string key** (`{ 'radius' }`, the mid-typing state of `{ 'radius': … }`) — previously (during this same unreleased window) rename could mangle the string literal in place.
- **Same-line rename references no longer collapse onto the first occurrence**: `let p = { radius, scaled: radius };` (and `calc(a + a)`) now rename every occurrence; the line scan skips positions already claimed by an earlier edit.
- **Object-property type inference is live**: parsed longhand properties were missing their AST discriminant, leaving the `objectProp` inference branch dead — hover now infers types for bindings destructured from inline object literals (`let { x } = { x: 5 };`).
- **Style-value validator hints at template problems**: when a value still contains a backtick at validation time (e.g. an unterminated template), the error now points at the interpolation syntax instead of only citing the allow-list.
- **Security: `var()` permission is now per-token, not per-value.** The style-value validator's `allowVar` was a single flag flipped whenever *any* token in a value resolved to a compiler-emitted `CSSVar()` — so an unrelated `var()` sitting elsewhere in the same value rode through unvalidated (e.g. `drop-shadow(2px 2px var(--evil,1) c)`). The validator now allow-lists the exact `var()` strings the compiler emitted for that value; every other `var()` is rejected as before. The flaw predates the interpolation work but was reachable then and would have been widened by it.
- **Cross-evaluator number formatting parity in style values**: the annotated evaluator formatted substituted/spliced numbers with `String()` while the primary evaluator used `formatNum`, so the two surfaces emitted different CSS under a `--to-fixed` precision option. Both now use `formatNum`. The annotated evaluator's template-fragment error also gained the positioned-error fallback the primary path already had.

#### Documentation

- `docs/layers.md` documents fragment interpolation, unit-inside vs unit-outside equivalence, and numeric substitution; `docs/security.md` states that interpolation results are validated post-evaluation; `docs/filters.md` adds a dynamic filter-arguments example.

## [0.8.0] - 2026-07-26 (unit-aware color-method angles)

### Fixed

#### Core

- **`hueShift(90deg)` now shifts 90° (was a silent 1.57°).** Color methods (`hueShift`, `analogous`, `splitComplementary`) take degrees, but angle-suffixed literals evaluate to radians — so a suffixed argument was reinterpreted as a much smaller degree value with no error. A new operator-aware unit-inference pass (`src/evaluator/units.ts`) detects arguments *written* with angle units — including `calc()` arithmetic over them, like `hueShift(calc(i / 9 * 2pi))`, which now sweeps the full hue wheel instead of an invisible 5.6° — and converts radians→degrees at the call site. Bare numbers (`hueShift(180)`) are unchanged. The conversion also flows to the `CSSVar` color path (`oklch(from … calc(h + 90))`). Known limitation (documented): units don't survive variable assignment — `let a = 90deg; c.hueShift(a)` still reads as degrees; use `c.hueShift(deg(a))`.
- **Angle-unit guardrail extended to `*` and to the annotated evaluator.** Multiplying two angle values (`calc(90deg * 45deg)`) is now an error; scaling by a plain number (`calc(2 * 45deg)`) and angle/angle ratios (`calc(1pi / 2pi)`) remain valid. The `+`/`-` mismatch check now sees through nested arithmetic (`calc((90deg * 2) + 5)` throws) and runs in the annotated evaluator, which previously had no angle-unit checking at all. `convertUnitSuffix`/`hasAngleUnit`/`checkAngleUnitMismatch` are consolidated in the shared `units.ts` module instead of hand-copied between the two evaluators.
- **Gradient, Pattern, Marker, and MeshPoint property validation now matches between the primary and annotated evaluators.** The annotated evaluator's member-assignment handling was "lenient by design" — a bare `g.from = 45` (rejected by normal compilation with `requires an angle unit`), an invalid Marker enum (`mk.refX = 'middle'`), or a wrong-typed value was silently accepted or dropped under `--annotated`, so annotated/debug output could show a "working" program that the real compiler rejects. Both evaluators now share the strict validation via a new `src/evaluator/member-assign.ts` (`assignGradientProperty`/`assignPatternProperty`/`assignMarkerProperty`/`assignMeshPointProperty` — same no-drift consolidation as `units.ts`). Also fixed along the way: one of the annotated evaluator's two statement evaluators — the one that runs every top-level statement and nested block body — had no Marker assignment handling at all, so `marker.prop = value` was a silent no-op under `--annotated` at any nesting level; and its local `GradientValue` was missing the `innerRadius`/`innerFill` fields, so those assignments silently vanished instead of being stored. Remaining known gap in annotated mode (unchanged, tracked): filter property assignments (`NoiseFilter`, `GlowFilter`, …) are still complete no-ops there.
- **9 built-in enums were unresolvable in annotated mode.** `BUILTIN_ENUMS` was hand-copied into the annotated evaluator and had drifted: `BlendMode`, `NoiseFilterStyle`, `NoiseFilterScale`, `GlowMode`, `MotionBlurType`, `BBoxAnchor`, `GridPatternType`, `HexagonOrientation`, and `VerticalAnchor` were missing, so e.g. `BlendMode.Multiply` threw `Undefined variable` only under `--annotated`. The table now lives in a shared `src/evaluator/builtin-enums.ts` (re-exported from the evaluator for existing importers) consumed by both evaluators.

#### Documentation

- `docs/color.md` now states the degrees contract for hue/harmony methods (previously the unit was documented only by a `°` in a code comment) with the auto-conversion rules and the `deg()` escape hatch; `docs/syntax.md` documents that `calc()` is unit-blind and the extended mismatch rules.

## [0.8.0] - 2026-07-26 (template literals: CST-walk fix + parseMixed assessment)

### Fixed

#### Core

- **Silent template-AST corruption for interpolations containing braces in strings.** `` let x = `${ f("}") }`; `` parsed to a correct syntax tree but a garbage AST (the builder re-scanned raw text with a brace counter that had no string-awareness), compiling wrong output with zero diagnostics. `buildTemplateLiteral` now walks the CST the grammar already produced: interpolation expressions come from the single inline parse (correct absolute source positions — no more `let _ = expr;` re-parse, wrap-offset location rewrites, or silent depth-cap fallback to a bogus identifier), and literal text runs are recovered as ranges between interpolations. The raw-text scanner survives only as the error-recovery fallback for opaque/recovered nodes.

### Added

#### Playground

- **Template literals finally have string coloring**: `TemplateLiteral` is styled as a special string (oneDark cyan / light `#e40`), with interpolation expressions keeping their own token colors (verified per-painted-span in both themes). The previous highlight entries targeted template token names that never existed as tree nodes — dead code, removed from both highlight maps.

### Development

- **parseMixed assessment recorded** (`project-docs/template-literals/ASSESSMENT.md`): extracting template literals into a separate parseMixed-mounted parser would *subtract* structure — the grammar already parses interpolations inline as real expression subtrees, a mount would replace them unless unproven `overlay` machinery re-mounted the full parser inside every interpolation, and the `${` token-group fragility stays either way. The inner style grammar's opaque `Template` token remains the one legitimate future parseMixed candidate.

## [0.8.0] - 2026-07-25 (style-block scope awareness: references in values, rename/find-refs, Member expressions)

### Added

#### Core

- **Scope analysis now sees inside style-block values.** Identifiers in `${ ... }` values that resolve to user declarations become real references with **exact full-width ranges** (`Reference.inStyleValue`), extracted via the inner style grammar (`'_: value;'` wrap) plus full expression parsing for `${...}` template interpolations. The reference rule matches evaluator semantics: bare values and member heads reference only USER declarations (`stroke-linejoin: round;` stays plain CSS; a user `let round` shadowing it becomes a reference); function names (`drop-shadow`, `.alpha`) never do. This fixes a silent hole: **rename and find-references previously skipped style values entirely** — renaming `shadowColor` did not update it inside `drop-shadow(4px 4px shadowColor)`. Rename now edits style-value occurrences with exact ranges (including several on one line — the old first-match-per-line scan couldn't), find-references/go-to-definition work from inside values, and VS Code semantic tokens color them at exact positions.
- **Member expressions in the inner style grammar**: `fill: c.alpha(40%);`, `rgba(0,0,200,1).lighten(20%)`, and chains like `a.b.c(1).d` now parse as first-class `Member` nodes in both grammar scopes (previously the `.` was an error node). `.5` numbers are unaffected.

#### Playground

- **Variable references inside style values take the variable color again.** A new decoration extension (`cm-style-ref-recolor.ts`) marks style-value identifiers that resolve to declarations, so `stroke: c;` and `drop-shadow(1px 1px c)` render `c` coral in dark mode / default text in light — matching the variable everywhere else — while CSS keywords (`middle`) and undeclared names keep the value color. Backed by a shared size-1 scope-analysis memo (`scope-cache.ts`) reused by the color-chip extension. **Post-ship fix (2026-07-26):** the theme rule must target the NESTED syntax span (`.cm-style-var-ref span`) — CodeMirror nests the highlight span inside the mark span, so styling only the mark recolors the wrapper while the glyphs keep the old color; `getComputedStyle` on the mark reports success while the screen disagrees. Found via Ryan's side-by-side color-literal calibration; verification scripts now measure the deepest span.
- **Color chips are scope-aware**: `let tomato = ...; stroke: tomato;` no longer renders a chip (clicking it would have overwritten the variable reference with a literal color — the KNOWN LIMITATION from the previous entry, now fixed in both the mounted-tree and regex-fallback chip paths). An undeclared `stroke: tomato;` still chips.

## [0.8.0] - 2026-07-25 (style-block structure: comma-form filter error, inner grammar, editor intelligence)

### Fixed

#### Core

- **Comma-form CSS filter functions are now a positioned compile error instead of a silent no-op.** `filter: drop-shadow(4px, 4px, 4px, color)` previously compiled and emitted invalid CSS the browser dropped — the shadow just never appeared (Pathogen call syntax uses commas, but CSS `drop-shadow()` is space-separated, and a `font-family`-fallback comma branch in the validator incidentally let `4px,` through). All 10 CSS filter functions now reject top-level commas with a fix-it message (`drop-shadow() uses space-separated CSS syntax: drop-shadow(4px 4px 4px color) — remove the commas`), and comma-chained filters (`blur(2px), brightness(1)`) get `filter chains are space-separated`. Errors point at the declaration **value** via the new `StyleProperty.valueLoc`. Genuinely comma-separated functions (`rgba`, `color-mix`, `cubic-bezier`, `polygon`, transform functions, font-family lists) are untouched, with negative-control tests for each family.
- **Annotated-evaluator drift**: `--annotated` never resolved Pathogen expressions embedded in CSS function args (`drop-shadow(4px 4px 8px shadowColor)` kept the raw variable name). Both evaluators now share `css-function-resolve.ts`, so resolution and the comma error behave identically; annotated validation errors gained line/col positions.

### Added

#### Core

- **Structured syntax tree inside style blocks** (`editorParser`): a new dedicated Lezer grammar (`src/parser/style.grammar` — `Declaration`, `PropertyName`, `Call`, `ArgList`, `NumberUnit`, `ColorLiteral`, `StringLiteral`, `Template` nodes) is mounted over the opaque `StyleContent` token via `parseMixed`. The outer grammar is untouched (no `${` state-merge risk — outer-tree invariance is tested), and the compiler keeps the unwrapped parser. A parity corpus test locks the inner grammar to `parseStyleDeclarations` boundary rules (top-level `;`/newline termination, paren/quote/template awareness, mid-typing leniency). New `npm run generate:style-parser`; `editorParser` ships in both `dist/index.global.js` and `dist/highlight.global.js`.
- **`StyleProperty` source extents**: AST style declarations now carry `nameEnd`, `valueLoc`, and `valueEnd` alongside `loc`, so tooling and diagnostics can address the value text without re-scanning.
- **Style completion coverage**: `filter`, `mask`, `clip-path`, `stroke-dashoffset`, `color`, `mix-blend-mode`, and `paint-order` join the property completions (previously absent — `filter` is the 6th most-used property in the sample corpus). Value position after `filter:` offers the 10 CSS filter functions as space-separated snippets (`drop-shadow(${dx} ${dy} ${blur} ${color})` — teaching the correct syntax), `url(#id)`, and ranks in-scope filter-constructor variables first with a `NoiseFilter — renders as url(#id)` detail (type-aware via AST inference). `mask`/`clip-path` get `url(#id)` + basic-shape snippets; `mix-blend-mode`/`paint-order` get their keyword enumerations. The function list is **imported from the sanitizer allow-list** (`CSS_FILTER_FUNCTION_NAMES` et al., now exported groups) so completions cannot drift from what the evaluator accepts. Declaration-shaped binding-block constructor snippets (`NoiseFilter() {|f| ...}`) are no longer inserted in value position (offered as plain names instead). A property × value-kind coverage-matrix test guards the whole surface.

#### Playground

- **Color chips everywhere in style values**: chips now come from the mounted inner tree instead of a whole-value regex — a hex or color-function literal gets a chip **anywhere in any property's value**, including nested inside `drop-shadow(...)` (the reported gap: `filter: drop-shadow(4px 4px 4px #c00)` had no chip because `filter` wasn't in the six-property regex allow-list). Bare **named** colors chip only as the entire value of a color-typed property, so a variable named `tomato` is never rewritten. The regex fallback remains for unmounted trees.
- **Structured highlighting inside `${ }`**: property names, numbers/units, strings, templates, and function calls get real token colors in both themes (previously the whole block interior was one flat string color). Applies to the editor and the read-only workspace detail mount (`dist/highlight.global.js`). Tags are tuned against the stock theme palettes so the roles contrast: dark mode reads blue property names / red variable names / orange values / yellow numbers (measured via `inspect-colors.mjs`, not assumed — `t.propertyName` would have collapsed property names into oneDark's variable-name coral).

### Documentation

- `docs/syntax.md`: new **CSS Function Values** section — space-separated filter-function syntax, the comma error with before/after example, comma-taking function families, and variable resolution inside CSS functions. `docs/filters.md`: native-CSS-syntax callout in "Layering with Native CSS Filters".

### Development

- `project-docs/style-block-structure/` — plan, primer (parser-identity diagram, comma policy, inner-grammar boundary rules), demo `.pathogen`, and the puppeteer verification scripts used for the playground surface checks.

## [0.8.0] - 2026-07-25 (font weight fallback)

### Fixed

#### Playground

- **Unavailable Google Font weights no longer kill the compile.** Requesting a weight a family doesn't ship (e.g. `Baumans` at `font-weight: 900` — Baumans only has 400) used to fetch `css2?...wght@900`, which Google rejects with a CORS-invisible 400; the playground surfaced it as a fatal "Failed to load fonts referenced by @font directive: … Failed to fetch" error plus a wall of misleading CORS console errors, refetched on every keystroke. `fetchFontBinary` now validates the weight against the fonts catalog *before* any network access (the HTTP status is unobservable cross-origin, so pre-flight is the only workable check) and snaps to the nearest available variant — min distance, ties toward lighter. The substituted binary registers under the **requested** weight so the injected `@font-face` matches the source's `font-weight` on `<text>` (no faux-bold divergence from outlined glyphs), and the buffer is cached under both weight keys, eliminating the per-keystroke refetch.
- **Non-fatal substitution warning banner**: substitutions ride the compile result (`fontSubstitutions`) into a dismissible workspace banner — "Baumans is only available at weight 400 (requested 900); using 400" (multi-variant families also list their available weights). Dismissal is remembered per message set (re-appears when the substitutions change), resets on workspace switch, and clears on compile errors. The banner styling is shared with the multi-tab warning (`.warning-banner`).
- **Font-picker preview links request only real variants**: `loadGoogleFont` previously requested `wght@100;…;900` for every family, silently 400ing for single/partial-variant families.

### Development

- New `getKnownVariants` (returns `null` for unknown families — deliberately not `getAvailableWeights`, whose `[400, 700]` default would mis-snap uncatalogued families) and `nearestWeight` in `google-fonts.ts`; first tests for that module. `font-loader` tests gain a weight-substitution coverage matrix over every curated single-variant family, tie-breaking, unknown-family passthrough, dual-key cache behavior, and exact banner message formats.

### Documentation

- `path-blocks.md` @font section: documents playground weight substitution, and corrects the load-failure claim (CLI warns and continues; the playground reports a compile error).

## [0.8.0] - 2026-07-24 (AST-based type inference + member hover)

### Added

#### Core

- **Member hover across the language service**: hovering any property or method after a `.` (e.g. `glyph.contours`, `contour.variableOffset`, `vo.stop`) now shows its signature, doc, and value type — hover previously had no member-access path at all. Powered by a new shared `member-resolution.ts` used identically by completion and hover, so both surfaces always agree. VS Code inherits it via the shared `getHoverInfo`.
- **AST-based type inference** (`type-inference-ast.ts`, the regex-audit Phase 5b design): declarations carry their real AST context (`Declaration.typeContext`) and are typed structurally — position-aware scope resolution, so shadowed names resolve to the declaration that governs the cursor. Covers what the regex engine missed: array-destructure positions (`let [num, pb, sb] = [5, @{}, ${}]`), `[element, index]` loop bindings (index is `number`), method-trailing-block params, number/boolean/`calc()`/StyleBlock literals, and element types through `PathBlock.fromGlyph(...)` / `glyph.contours` (displayed as `array<PathBlock>`). The regex rules in `type-inference.ts` remain solely as a fallback.
- **variableOffset builder registration**: new `@type VariableOffsetBuilder` / `CompoundVariableOffsetBuilder` interfaces in `pathogen-api.ts` — `vo.` inside a `variableOffset() {|vo, pb|}` block now completes and hovers `stop`/`startTangent`/`endTangent` (caps on the compound builder), with `CurveContinuity`-aware snippets. New `@blockparams` JSDoc tag feeds the generated `METHOD_BLOCK_PARAMS` so both block params infer their types.
- New generated metadata maps: `TYPE_ELEMENT_TYPES` (array element types from `PathogenArray<X>` members), `NAMESPACE_METHOD_RETURNS` (namespace function returns, e.g. `Color.palette` → array of Color), and number/boolean property types in `TYPE_PROPERTY_TYPES` (destructured numeric bindings hover as `number`).

### Changed

#### Core

- **`analyzeScopes` uses the lenient Lezer parse** (error recovery) instead of the strict parser: scope-dependent features — completions, hover, go-to-definition, rename, semantic tokens — keep working while the document has mid-typing parse errors (an unterminated `vo.` no longer blanks the whole document's intelligence).
- Hover resolves names at their **declaration sites** too (`let` names, fn params, loop vars, `{|block params|}`), and block params get their own "block parameter" label.

### Development

- Hover test suite gains the full variableOffset repro program as an integration fixture plus a binding-form × hover-site coverage matrix (every literal kind, destructure position, loop form, and block-param form) so future inference holes fail a test instead of surfacing as UX reports.
- `src/language-services/CLAUDE.md` and the cross-system lifecycle checklist now cover trailing-block methods (`@blockparams` + builder `@type` interface) and direct new inference rules to the AST module.

## [0.8.0] - 2026-07-23 (zoom/pan parity + shared zoom pill)

### Added

#### Core

- **`<pathogen-zoom-pill>`** — the single shared zoom control for every preview surface, shipped inside the pan-zoom bundle (`src/ui/zoom-pill.ts`, registered by `dist/pan-zoom.global.js`) so even the VS Code webview gets it from the script it already loads. Glass pill styled after the mini-workspace design (999px radius, backdrop-blur, borderless buttons, editable % input with arrow-key nudges), bottom-center with hover-fade, themed via a `--playground-token → --vscode-* → literal` fallback chain, styles applied through constructed `adoptedStyleSheets` (webview-CSP-safe). Storybook entry under Shared.
- **`shouldStartPan` predicate on `PanZoomConfig`** — surfaces with foreground drag interactions (legend drag/resize, thumbnail crop box) can veto pan capture per press; the controller stands down before `preventDefault`, leaving the event untouched for the surface's own handlers. First instance-level controller unit tests (fake DOM harness).

### Changed

#### Playground

- **All five preview surfaces now share one zoom/pan system**: the Export and Set Thumbnail modals migrated from hand-rolled viewBox-mutation zoom to the transform-mode `PanZoomController` — zooming now magnifies the artwork to fill the pane (matching the primary preview) instead of clipping inside a fixed window. The export modal's preview goes full-bleed: the bottom zoom-bar strip is gone, replaced by the floating pill plus a glass Snap chip (legend mode only). Four duplicated copies of zoom-chrome CSS deleted.
- **Zoom range standardized to 10%–2000%** (was 25%–1000% on controller surfaces, 10%–1000% in modals) via the now-exported shared `DEFAULTS`; all per-component MIN/MAX/STEP constants deleted.
- Export downloads are transform-proof: `_prepareExportClone` force-bakes any in-flight gesture and strips the controller's inline styles, so SVG/PNG/PDF bytes are identical even when a download races a pan (E2E-verified).

#### VS Code

- Preview panel adopts the shared pill (replacing its bespoke `--vscode-*` zoom bar) and the shared zoom range; the stale hard-coded 25–1000% input validation is gone.

### Development

- `project-docs/unified-export/verify-export.ts` extended to 41 checks: PointerEvent pan gestures, predicate veto on legend targets, mid-gesture byte-clean download, a fills-the-pane zoom-window geometry pin, a visible-artwork-layers guard, and a standalone-bundle check that `pan-zoom.global.js` alone registers a styled pill (the VS Code path). Execution record in `project-docs/pan-zoom-performance/zoom-surface-parity.md`.

## [0.8.0] - 2026-07-21 (unified export workflow)

### Added

#### Playground

- **The Export dialog is now the single export workflow** (⋮ → Export, or Ctrl/Cmd+Shift+E): SVG, **PNG** (new format — 1×/2×/4×/custom-width scaling capped at 16,384 px per side, transparent-background option, embedded fonts), and print-ready PDF from one dialog. The legend is now **optional and off by default**; legend-less exports carry a small *Created in pathogen.studio* watermark (vector through PDF outlining, even in raster mode). The legend's source listing gains **syntax highlighting** (default on) via the new `highlightPathogenTokens()` API with the light print palette inlined as literal fills — identical colors in SVG text, PNG pixels, and PDF outlines. The legend is clamped inside the canvas everywhere it can move (drag, arrows, resize, content growth) so exports never silently crop it.
- The old "Export with Legend" menu item and the raw-source `.svgx` download are retired; Ctrl+S remains autosave-only.

#### Core

- `highlightPathogenTokens(source)` — token-level highlighter API (one array per source line, round-trip invariant); `highlightPathogen` reimplemented on top of the same walk.

### Documentation

- `docs/exporting.md` rewritten around the unified dialog (formats at a glance, optional legend, branding, PNG section).
- New launch blog post: *Export Anything: SVG, PNG, and Print-Ready PDF from One Dialog* (`/blog/unified-export`, post30 sample `meridian-bloom.pathogen`).

### Development

- New tests: `highlight-tokens`, `legend-code-tokens`, `code-print-palette` (drift-guard against theme.css), outliner multi-tspan fills; Puppeteer E2E harness `project-docs/unified-export/verify-export.ts`.

## [0.8.0] - 2026-07-20 (font-family variables)

### Added

#### Core

- **`@font` accepts a variable source** — `@font fontFamily;` (optionally with a weight) now parses, where `fontFamily` is a top-level `let` bound to a plain string literal. Resolution is static (fonts load before evaluation): the new `resolveFontDirectives(program)` export const-folds top-level string `let`s; an unresolvable identifier is a positioned hard error in both the CLI and the playground. `@fontFamily` (no space) stays an error with a "did you mean `@font fontFamily`?" hint — `@font` is a single token, so without the guard it would silently parse as `@font Family`. AST gains `FontDirective.sourceKind: 'literal' | 'identifier'`; the formatter emits identifier sources unquoted.
- **Template-literal values in style blocks** — `` font-family: `${family}`; `` now parses and interpolates. The `StyleContent` grammar token is redefined to be quote- and template-aware (one brace level inside `${...}`), so a `}` inside a quoted value or an interpolation no longer terminates the style block; the AST-builder value scanner mirrors the same states and reports "Unterminated template literal in style value". Comments, `//` inside `url(...)`, and slashes keep the old stop-at-`}` extent — quotes are simultaneously plain content and string starts, with the DFA's longest-match rule picking the right boundary (adversarial single-line cases like `${ fill: red; // note }` and `url(https://…)` are regression-tested after code review caught the first formulation crossing the brace). One deliberate asymmetry: a literal `}` value needs **double** quotes — single-quoted strings never cross `}`, so everyday comment apostrophes (`// don't … // it's`) on one line can't swallow the block's closing brace. Double-quoted strings remain literal: `font-family: "${f}"` is now a clear disallowed-token error instead of a confusing "Missing ';'".

#### Playground

- **Variable- and expression-valued `font-family` now loads the right Google Font** (the reported bug: `font-family: fontFamily;` rendered a fallback font and wrong weight even though the compiler resolved it correctly). Font fetching is now two-tier: the pre-compile scan resolves `@font` directives **AST-first** — when the library global is loaded it uses the same `parse` + `resolveFontDirectives` as the CLI for exact surface parity (indented top-level `let`s, multiple statements per line, optional trailing `;`), with the regex scan kept only as a mid-typing fallback — plus style-block variable substitution through top-level string `let`s; and a new post-compile pass (`extractFontReferencesFromCompileResult`) walks the compiled layers' *resolved* styles — recursing into group children and merging text-element styles — fetching any binaries the source scan missed. No recompile is needed: compile-time font consumers throw on a missing family, so late binaries only feed the preview iframe's `@font-face` injection.

#### Playground (follow-ups)

- **Stale-preview marker** — when compilation fails, the preview pane keeps the last good render for context but now dims it and shows a "Stale preview — fix errors to update" badge, clearing on the next successful compile. Previously a stale render (with stale injected fonts) was indistinguishable from current output — the source of the "quoted font-family appeared to work" misread in the original bug report. Storybook gains a Stale story + toggle.
- **`@fontFamily` typo now gets a positioned editor diagnostic** — the adjacency guard's "unknown directive '@fontFamily' — did you mean '@font fontFamily'?" message carries line *and column*, so `getDiagnostics` anchors the squiggle to the directive (was: a generic parse error pinned to the top of the file), and the suggestion names the full intended variable rather than the `Family` remainder token.

### Documentation

- `docs/path-blocks.md`: `@font` variable form, resolution rule, and error message; variable + template pairing example.
- `docs/layers.md`: "Variables and Interpolation in Values" — bare identifiers, backtick interpolation, and the double-quotes-are-literal rule.
- `docs/syntax.md`: style-block value evaluation cross-link.

### Development

- New tests across `tests/parser.test.ts` (style-block templates, `}` in quoted values, unterminated-template error, `@font` identifier + `@fontFamily` guard), `tests/font-provider.test.ts` (`resolveFontDirectives`), `tests/layers.test.ts` (identifier/template/quoted-literal resolution pins), `tests/cli.test.ts` (file font via variable, unresolved-identifier error), `tests/font-loader.test.ts` (let-map extraction, identifier refs, compile-result extraction), and the formatter suite.
- `scripts/debug-font-variable-resolution.ts` — puppeteer verification that the Noto Sans binary is fetched, injected into `#pathogen-fonts`, and computed on the rendered `<text>` for the variable program; plus a cold repro of the quoted-literal case. Artifacts in `project-docs/font-variable-resolution/`.
- Deferred: scope-analysis reference (rename/go-to-def) for the `@font` identifier — needs an `identifierLoc` on the AST node first (see `project-docs/font-variable-resolution/STATUS.md`).

## [0.8.0] - 2026-07-19 (export output optimization)

### Added

#### Playground

- **Export output optimization in "Export with Legend"** (mockup-reviewed):
  - **Precision** (Advanced Export Settings; SVG + PDF): per-export coordinate-decimal trimming, seeded from but never mutating the workspace footer Precision (`toFixed`) setting. Applied as a post-processing pass over artwork `path[d]` attributes that re-emits **absolute** commands — rounding absolute coordinates never accumulates drift, unlike rounding the compiler's relative deltas. Text outlines and the legend are untouched.
  - **Detail** (PDF, Vector artwork only): resolution-aware decimation — culls path segments smaller than a fraction of one printed dot (300 DPI) at the chosen print size (`Fine` = ½ dot, `Standard` = 1 dot; complex artwork defaults to Standard). Visual error is bounded by the sub-dot epsilon; the dialog reports the reduction ("Detail: removed 2,447 of 4,007 path segments"). Hidden in Raster mode.
  - PDF coordinates now written at `floatPrecision: 5` (0.00001 pt), eliminating 17-digit float artifacts from the content stream.
  - **Cover sheet — preview + print specs** (mockup-reviewed): an optional page-1 job ticket (Letter for inch users, A4 for cm) with a fast raster preview, a spec manifest (trim/page size, margins, bleed, artwork mode + detail reduction, precision, date, creator), a technical summary, and handling notes ("print or send page 2 only"; a slow-render heads-up for vector artwork). Because Finder/Quick Look/Preview render page 1 for thumbnails, the cover makes dense-artwork PDFs preview instantly instead of appearing broken. Defaults ON when complex artwork is detected; docs note to disable it for automated upload portals requiring single-page files. Cover text is outlined like everything else — the document stays 100% font-free.

### Changed

#### Playground

- **Export with Legend layout** (mockup-reviewed, 4 variations): the modal's top bar is gone — the form column now owns a sticky header (title + close) and a sticky bottom action bar (Cancel + Download). The Download action sits adjacent to the form it acts on and never scrolls away; the preview pane gains the full modal height. Blog screenshot re-shot to match.

### Fixed

#### Playground

- **Optimization passes no longer touch defs-scoped geometry** — markers, clip paths, and patterns live in their own local coordinate systems where the artwork-derived epsilon/precision are meaningless; they are now excluded (was: every `path[d]` outside the legend). Guarded by an E2E marker fixture.
- **Decimation can no longer corrupt `S`/`T` smooth-curve reflections** — smooth shorthands are normalized to explicit `C`/`Q` at parse time (while original command adjacency is known), so culling a tiny predecessor no longer re-bases the reflection on a distant unrelated curve (previously up to a ~56-unit silent shape shift on hand-authored paths).
- Reduction counters now only count paths whose optimized `d` was actually written.
- **Export failed with `SecurityError: showSaveFilePicker … Must be handling a user gesture` on large artwork** — the save dialog now opens FIRST, inside the click, before the export pipeline runs (Chrome expires transient user activation after ~5s; dense artwork's outlining/rasterization/svg2pdf easily exceed that). Bonus: cancelling the dialog now skips the whole pipeline, and the file writes to the pre-acquired handle when generation finishes. Geometry validation still runs before the dialog so margin errors surface without a pointless save prompt.

#### Library

- New exports: `trimPathDataPrecision(d, decimals)`, `decimatePathData(d, epsilon)` (+ `DecimateResult`), `commandsToAbsoluteD(commands, {format})`, `parsePathDataExpanded(d)` — additive absolute-emission path passes in `src/evaluator/path-{precision,decimate}.ts` and `path-data.ts`; multi-group commands expanded per the SVG grammar (extra `M` groups become LineTos). Existing byte-locked serializers unchanged.

### Documentation

- `docs/exporting.md` gains an "Optimizing output" section — including the first published documentation for the workspace Precision control / CLI `--to-fixed`.

### Development

- New suites `tests/path-precision.test.ts` (18), `tests/path-decimate.test.ts` (13), and `tests/pdf-cover-sheet.test.ts` (15) — incl. a no-drift proof vs naive relative rounding, epsilon-monotonicity/idempotence invariants, S/T reflection normalization across subpath boundaries, and cover manifest formatting. E2E harness extended to 56 checks (decimation op-count reduction, precision decimals/absolute assertions, floatPrecision probe, marker-untouched guard, cover-sheet page structure incl. the long-values + Standard-detail combination).
- `playground/CLAUDE.md` drive-by: the browser global is `window.PathogenLang` (stale `SvgPathExtended` reference fixed).

## [0.8.0] - 2026-07-18 (print-ready PDF export)

### Added

#### Playground

- **Print-ready PDF export in "Export with Legend"** — the export modal gains a Format selector (SVG / PDF). The PDF path is built for third-party print handoff at poster sizes:
  - **Text outlining**: every `<text>`/`<tspan>` in the artwork and legend is converted to vector path outlines via opentype.js (`playground/utils/svg-text-outliner.ts` — pen model with tspan `x`/`dx`/`dy`, `text-anchor`, `dominant-baseline: hanging`, letter-spacing, whitespace-preserving code runs, per-family weight fallback with surfaced warnings). The produced PDF contains **no font programs and no text operators** — nothing for a print shop's RIP to substitute.
  - **Page sizing modes** (`playground/utils/pdf-page-layout.ts`, pure + unit-tested): *Match artwork — exact print size* (enter the printed artwork size, W↔H permanently locked to the ViewBox ratio, page = artwork + margins, never letterboxed), US/ISO presets (18×24, 24×36, Letter, Tabloid, A4–A0) with portrait/landscape, and *Custom page* (1–100 in per side) with a toggleable aspect-ratio chain lock. One **Units** select (in/cm) governs every dimension, with unit suffixes on the width/height/margin inputs and a live size-summary line.
  - **Print prep**: margins control plus a bleed (0.125 in / 3 mm) + corner crop marks checkbox; the artwork background fills to the bleed edge so trimmed posters are edge-to-edge.
  - **Raster fallback**: artwork using masks/filters (unsupported by svg2pdf.js) is embedded as a ≥300 DPI PNG capped at 8192 px, with a user-visible notice; the legend stays vector.
  - Rendering via lazily-loaded vendor bundle `public/vendor/pdf-export.js` (jsPDF + svg2pdf.js behind a shim entry so they share one jsPDF instance) — zero main-bundle growth.
- **Legend footer rebrand** — "Pathogen built with pathogen-lang" → "Created in **pathogen.studio**" with the domain set in Baumans; the embedded Baumans subset now covers the `pathogen.studio` glyphs.

### Fixed

#### Playground

- **PDF export rendered all artwork black for oklch-colored workspaces** — svg2pdf.js cannot parse modern CSS color functions (`oklch()`, `lab()`, `color()`), which Pathogen uses everywhere. New `playground/utils/svg-pdf-colors.ts` normalizes every paint (fill/stroke/stop-color/color, attributes and inline styles) to sRGB hex before PDF conversion via a 1×1-canvas `getImageData` read-back (the `fillStyle` getter no longer serializes to sRGB in modern Chrome), folding color alpha into the matching `*-opacity`.
- **Advanced Export Settings collapsed to a 2px sliver when PDF format was selected** — `overflow: hidden` on the details box removed its automatic flex minimum size, so the overflowing form column crushed it. The panel's children no longer flex-shrink (the panel scrolls), and the grid controls moved above the Format selector.
- **Vector PDFs of dense generative artwork rendered for minutes or blank in Preview/Quick Look** (a 463k-operator export needed ~114s of CPU for a single thumbnail). New **Artwork: Vector / Raster** toggle in the PDF settings; artwork exceeding complexity thresholds (>1.5M chars of path data or >20k geometry nodes) auto-defaults to the 300 DPI raster path — text outlines and the legend stay vector either way.
- **Raster-mode export crashed with `RangeError: Maximum call stack size exceeded` on large canvases** — svg2pdf's image handling regexes the entire data-URL string, which overflows at print resolution. Rasterized artwork now bypasses svg2pdf entirely: flattened print-resolution **JPEG bytes** go straight into the page via jsPDF `addImage` (no data URL anywhere, no RGBA channel-splitting), with svg2pdf drawing only the vector legend on top.
- **PDF size fields overflowed the form panel** — width/height now stack on their own lines with `w`/`h` prefixes in the inputs and the aspect-ratio lock spanning both rows.
- **Raw-HTML images in SPA blog posts rendered at natural size and overflowed the article column** — `blog-post-view` now constrains `.post-content img` to `max-width: 100%` (the static blog shell already did); benefits every post with screenshots.

### Documentation

- New published docs page `docs/exporting.md` ("Exporting Your Work") covering the Export-with-Legend workflow, SVG export, PDF sizing modes, bleed/crop marks, what stays vector, and limitations.
- Announcement blog post `print-ready-pdf-export` with a poster-shaped `post29` sample.

### Development

- `scripts/build-vendor.ts` gains `entryPath` for local shim entries; vendored `opentype.js` for the playground outliner.
- Dynamic vendor imports in `font-loader.ts`/`svg-text-outliner.ts` use variable specifiers + `@vite-ignore` so jsdom vitest suites can import these modules.
- New suites: `tests/pdf-page-layout.test.ts` (23 tests — preset/pt conversions, bleed+slug+crop-mark geometry, centering, match/custom modes, bounds), `tests/svg-text-outliner.test.ts` (12 tests against the Inter fixture font). End-to-end Puppeteer verification harness at `project-docs/pdf-export/verify-pdf-export.ts` (21 checks incl. PDF MediaBox, no-font-programs probe, raster fallback, margin-error surfacing).

## [0.8.0] - 2026-07-18 (regex-audit remediation)

Audit and remediation of risky regex-based parsing in the compiler (see
`project-docs/regex-audit/`). Structured, grammar-shaped content that was being
parsed with regexes is now parsed by purpose-built tokenizers/parsers, closing
several latent correctness bugs and two confirmed security vulnerabilities.

### Security

- **SVG fragment sanitizer hardened from a deny-list to an allow-list.** `SVGDocumentFragment()` markup is validated before it reaches the DOM (innerHTML embedding) or CLI output. Two confirmed-exploitable holes are closed: (1) the sanitizer blocked a fixed deny-list while `docs/security.md` promised an allow-list, so `<meta http-equiv="refresh">` (HTML5 foreign-content breakout → full-page hijack), `<div>`/`<img>`/`<math>` and other non-SVG elements passed through — it now rejects any element not on the documented safe set; (2) presentation attributes (`fill`/`stroke`/`mask`/`filter`/`clip-path`/`marker*`) carrying a remote `url()` were never validated (SSRF/tracking) — `url()` must now be a local fragment ref. Also: the regex tag scanner is replaced by a quote-aware cursor tokenizer (closing `>`-in-quoted-attribute truncation and whitespace-split `on*` handler bypasses), namespace-prefixed element/attribute aliases (`<svg:script>`, `x:href`) are rejected, the `data:image` href allow-list is scoped to `<image>`/`<feImage>`, unquoted attribute values and comments/CDATA/DOCTYPE/PIs are rejected. Fixtures F8/F9 in `project-docs/security/svg-attack-fixtures.md`.
- **Remote `url()` in a style value is now rejected explicitly** instead of being silently dropped (it was only dropped as a side effect of the old comment-strip eating the `//` in `https://`).

### Fixed

- **Style-block declarations missing a trailing `;` were silently dropped.** The old regex scrape (`/([a-zA-Z…])\s*:\s*([^;\n]+);/g`) required a `;` after every declaration, so a `;`-less last declaration (common in hand-written blocks) was dropped — its style property (`stroke-width`, `font-family`, …) never applied. A proper quote/paren/bracket/comment-aware declaration parser now requires `;` on every declaration and reports a positioned `Missing ';'` compile error. AST-building stays lenient (attaches an `incomplete` marker) so the language service remains resilient while a block is typed; the evaluator enforces strictly. 22 blog/demo samples that relied on the drop are fixed. Docs: `docs/syntax.md`.
- **SVG path-data tokenizing bugs.** The path round-trip tokenizer mis-parsed implicit-decimal chains (`1.5.5` dropped the second number) and packed arc flags (`1110`); a single cursor-based tokenizer (`src/evaluator/path-data.ts`) fixes both and handles exponents/sign-separators uniformly.
- **CSS color parsing** now rejects malformed forms the old regexes accepted by silently truncating (`rgb(50%50% 0)`, `rgb(1.5.5 0)`, embedded signs) — the tokenizer requires real whitespace between modern components.

### Changed

- `StyleProperty` AST nodes carry a `loc`; `StyleBlockLiteral` carries an optional `incomplete` marker. CSS-value validation errors now report per-declaration line/column.

### Development

- **Path serialize→reparse round-trip eliminated.** `draw()`/`drawTo()` previously serialized structured commands to a string and immediately regex-reparsed it to track the path context. `serializeRelativeAndTrack` (new `src/evaluator/path-data.ts`) does both in one walk, and the three diverging duplicate tokenizers + two `commandsToRelativeD` serializers across `segments.ts`/`index.ts`/`annotated.ts` are consolidated into one module. Emitted output is byte-identical (render snapshots unchanged; verified against pre-refactor CLI output).
- **`parseColor` regex ladder → tokenizer.** The nine hand-rolled CSS color-function regexes in `src/color.ts` are replaced by `src/color-parse.ts` (one scanner + a per-function acceptance table). Public `parseColor(input): OKLCH` and all call sites unchanged; the 36-row conformance suite and 136 color tests pass byte-identical, including the `hdr-color-input` picker round-trip.
- **Style-block grammar note.** A Lezer-grammar approach to structuring style declarations was attempted and abandoned: `${` is shared between `styleBlockOpen` and `templateInterpStart`, and structuring `StyleBlockLiteral` merges their LALR states, breaking template interpolation. The declaration parser lives in the AST builder instead; the grammar's `StyleContent` token stays opaque.
- New/expanded suites: `tests/path-data.test.ts`, `tests/path-roundtrip.test.ts`, `tests/color-parse.test.ts`, `tests/color-conformance.test.ts`, plus F8/F9 sanitizer fixtures and strict style-declaration tests across `parser`/`errors`/`diagnostics`.

## [0.8.0] - 2026-07-17 (segment labels & corner suffixes)

### Added

#### Definition-site path annotations: `with` corner ops and `as` labels

- **`with fillet(r)` / `with chamfer(d1, d2?)` / `with ellipticalFillet(rx, ry, rot?)` on path commands** — attach a corner operation to the joint a command creates, at the point of definition: `v 20 with fillet(5)` rounds the corner where the previous edge meets this one. Semantics are **record-then-apply**: the op is recorded on the vertex and applied at finalization via the same machinery as `.fillet()`/`.filletAtVertex()` (equivalence covered by tests), so `ctx.position` mid-program reflects authored geometry and authored records stay non-destructive. Works in `@{ }` path blocks, `apply { }` blocks, top level, and user function bodies. Errors: annotating a statement that begins a subpath, or with no previous drawing command in the subpath ("no joint to round"); curve-junction and clamping behavior matches the existing fillet methods. Not yet supported in `--annotated` mode (honest error).
- **`as segment('name')` / `as endpoint('name')` labels** — name a command range or the vertex it creates: `h 20 as segment('lid'), endpoint('corner');`. Labels are emit-neutral (byte-identical output), expression-valued (`as segment('rib-${i}')` in loops), attach at statement granularity (`circle(...) as segment('c1');` labels the whole generated range), survive corner-op trims/splices via identity propagation, and may be freely reused — a shared name forms a **group**. They are the addressing foundation for the upcoming name-based query APIs (`segment()`/`point()`/`vertex()`).
- **Optional trailing semicolon on path commands** — `h 20;` is now valid (previously a parse error with a misleading "Missing ';'" message). Clause ordering is grammar-enforced: one `with`, one `as`, `with` before `as`, comma list only on `as`. `with`/`as` remain usable as identifiers outside path-argument position (contextual keywords). New docs page `docs/segment-labels.md`; TextMate keywords, snippets, and highlight tags updated.

#### Name-based query APIs: `segment()`, `point()`, `vertex()`

- **Labels are queryable by name** on PathBlock values, ProjectedPath values, and PathLayer references: `pb.segment('lid')` returns the labeled command range as a full PathBlock (ProjectedPath in absolute coordinates for projected/layer sources) with the complete sampling/geometry API; `pb.point('corner')` returns the labeled vertex as a Point — an anchor for `drawTo`/layout that answers the **authored** sharp corner even after a corner op trims it; `pb.vertex('corner')` returns a **VertexHandle** (new value type: properties `x`/`y`/`point`/`label`, destructurable) whose `.fillet(r)` / `.chamfer(d1, d2?)` / `.ellipticalFillet(rx, ry, rot?)` are the name-based counterparts to `filletAtVertex` — robust against commands inserted earlier in the path. Layer queries (`layer('a').segment('top')`) read a non-destructive finalized snapshot of the layer's records, making layers queryable for the first time. Singular queries follow the querySelector model — first match, erroring on unknown names with the list of labels the path actually has — while the new **`segmentAll` / `pointAll` / `vertexAll`** queries return every match in authoring order (querySelectorAll-style; empty array when nothing matches), so duplicate labels form loopable groups with no index bookkeeping. Not supported in `--annotated` mode (honest error); layer/projected vertex handles reject corner ops with a "not supported yet" error (modifiability is deferred). Documented in `docs/segment-labels.md` (with `docs/layers.md` and `docs/path-blocks.md` cross-references); all docs examples compile verbatim against the shipped implementation.

### Fixed

- **Conditions nested inside re-parsed expressions were silently dropped.** `parseExpression`'s boolean recursion guard made any expression parsed while another parse was in flight return null — most visibly, an `if (param)` condition inside a path block returned from a function defaulted to `true`, running the branch regardless of the argument (`fn tab(withNotch) { return @{ ... if (withNotch) { ... } }; }` ignored `tab(false)`). The guard is now a depth limit (each nested parse handles a strictly shorter span, so legitimate nesting terminates; pathological recursion still bounds at 32). Found while authoring the announcement blog post's robustness sample; regression tests in `tests/evaluator.test.ts`.

### Changed

- **Breaking (pre-1.0):** `PathBlockValue.pathStrings: string[]` is replaced by `PathBlockValue.records: PathRecord[]` — the statement-granularity authored store pairing each byte-exact raw fragment with its structured commands. `PathLayerState.accum` is now a `PathStore` (records) instead of `string[]`. `PathRecord`, `PathStore`, `PathCommandMeta`, and `RecordedCornerOp` are exported from the package root. The field was write-only in practice; emitted SVG is unchanged.

### Development

- **Segments-everywhere refactor.** Both evaluators now accumulate structured `PathRecord`s (raw fragment + commands + optional label/loc) through a single write path (`src/evaluator/segments.ts` `recordPath`); `LayerOutput.data` joins the byte-exact raw fragments, so zero-annotation programs emit byte-identical output (render snapshots unchanged). `PathWithResult`/`PathSegment` carry their structured commands from tracking time (draw/drawTo, projected drawTo, `arcFromCenter`, `arcFromPolarOffset`, `tangentArc`, stdlib returns). Command identity (`meta`) propagates through `resolveSmooth`, corner-op trims, and splices in `sampling.ts`/`path-transforms.ts`, with inserted corner commands inheriting a segment label only when both neighbors share it. `PathCommand` GLR ambiguity against `ExpressionStatement` resolved with dynamic precedence (`h -120 with ...` parses as a path command).
- **Fixed a latent double-adjustment bug in `parseExpressionAt`** — AST nodes sharing a `loc` object (method call + its object) were line-shifted twice, corrupting error locations for single-letter-variable method calls (`s.foo();`). Locations are now adjusted exactly once (visited-set guard).
- New suites: `tests/segments.test.ts` (store/parse units + 30k-command perf smoke), `tests/segment-labels.test.ts` (recording, validation, finalization equivalence), snapshot fixture `13-segment-suffixes` exercising the syntax end-to-end. Note for grammar regens: `npx lezer-generator src/parser/pathogen.grammar -o src/parser/pathogen.generated.ts`, then re-apply the `keyof typeof spec_Identifier` type patch on the `specialized:` line (required for the DTS build).

## [0.8.0] - 2026-07-17

### Added

#### Object destructuring for built-in struct values

- **`let { x, y } = Point(20, 20);` now works** — object destructuring, previously limited to object literals, extends to every fixed-shape built-in value: `Point`, `PolarVector`, `Grid`, `MeshPoint`, `Color`, and context objects (`let { x, y } = ctx.position;`). Renaming (`{ x: px }`) and rest patterns work too; rest collects the remaining data properties into a plain object, including computed ones (a `Grid` rest carries `width`/`height`). Missing keys on a struct throw the same error as dot access (`Line N: Property 'z' does not exist on Point`) — object literals keep their lenient `null` binding. Documented in `docs/objects.md` (new "Destructuring Built-in Values" section) and cross-referenced from `docs/syntax.md`. (`src/evaluator/struct-properties.ts`, `src/evaluator/index.ts`, `src/evaluator/annotated.ts`.)
- **Editor support for destructured bindings.** Member completions and chains resolve through destructured names — `let { origin } = grid;` gives `origin.` the full Point member set; `let { color } = meshPoint;` gives `color.` the Color set. Inside the pattern braces themselves, `let { | } = grid;` suggests the RHS type's data properties (already-used keys excluded, methods and keywords suppressed; object-literal RHS suggests its keys). Backed by a new generated `TYPE_PROPERTY_TYPES` map extracted from `pathogen-api.ts` property declarations. (`src/language-services/completion.ts`, `scripts/lib/completion-extract.ts`.)
- **Type-aware hover for all inferable variables.** Hovering a variable now shows its inferred type — `let p = Point(10, 20);` hovers as `*variable: Point*`, destructured bindings resolve through the same rules (`origin` from a Grid hovers as Point), colors display as `Color`, and un-inferable variables keep the previous hover text unchanged. (`src/language-services/hover.ts`, new shared `src/language-services/type-inference.ts`.)

### Development

- **Single source of truth for struct properties.** New `src/evaluator/struct-properties.ts` registry (`getStructDescriptor` → `has`/`get`/`keys`) now backs both member access and destructuring in **both** evaluators; the six duplicated per-type member-access branches were deleted from each. `has()` uses `Object.hasOwn`, fixing a latent leak where `point.toString` resolved `Object.prototype.toString` instead of throwing. A drift-guard suite (`tests/struct-properties.test.ts`) mechanically asserts destructuring ≡ member access for every registry key through both evaluators.
- **annotated.ts type dedup.** 19 locally re-declared value interfaces replaced with `import type` from `evaluator/types.ts`; only genuinely divergent types (`GradientValue`, `PathWithResult`, `EvaluationState`, `Scope`) and the four that embed the module-local `Value` union (`GridValue`, `CyclerValue`, `ArrayValue`, `ObjectValue`) remain local, each with the reason documented.
- **Shared type-inference module.** `inferType` and friends moved out of `completion.ts` into `src/language-services/type-inference.ts` so hover and completion share one inference engine; new `inferRhsType` handles destructuring right-hand sides (`ctx.position`, constructor calls, color literals, variables).
- Destructuring error messages in text-block bodies now carry line numbers (three `bindDestructuringPattern` call sites previously dropped them).

## [0.8.0] - 2026-07-13

### Added

#### Language-service audit — snippet templates, defs-constructor completions, drift guards

- **Snippet templates on every callable completion.** Accepting a method or constructor now inserts a usable template instead of the bare name: block methods insert braces with the cursor inside (`apply { … }`), calls insert tab-stop placeholders per required parameter (`drawTo(x, y)` with `x` selected), and binding-block constructors insert the full block form (`Marker('id', 10, 10) {|m| … }`). Templates are generated from `src/pathogen-api.ts` parameter lists, with an explicit `@snippet` JSDoc tag for trailing-block syntax TypeScript can't express. The playground uses CodeMirror's native `snippet()` for real Tab-cycling between placeholders; VS Code gets LSP snippet format (with a plain-text fallback for clients without `snippetSupport`). (`scripts/generate-completions.ts`, `scripts/lib/completion-extract.ts`, `playground/utils/cm-completion-bridge.ts`, `packages/pathogen-language-server/src/server.ts`.)
- **Completions, hover, and signature help for all 12 defs constructors.** `Mask`, `ClipPath`, `LinearGradient`, `RadialGradient`, `ConicGradient`, `MeshGradient`, `FreeformGradient`, `TopoGradient`, `Pattern`, `Marker`, `SVGDocumentFragment`, and the `PathBlock` namespace previously had **zero** editor support — no completion, no hover, no signature help — despite being documented and dispatched by the evaluator. All are now declared in `pathogen-api.ts` with `@type` member interfaces, so their returned objects complete too: `m.append` inside a `Marker` block, `g.stop(...)` on gradients, `g.getPoint(0, 0).color` on meshes (with a new per-type method-return map that also keeps `grid.getPoint()` → Point distinct from `mesh.getPoint()` → MeshPoint). A new `ProjectedPath` member set covers `.project()`/`.draw()`/`.drawTo()` results.
- **Style property names complete as full declarations.** Accepting a property name inside a `${ … }` style block inserts `name: ;` with the cursor in value position (e.g. `stroke-width: |;`), so the value can be typed immediately. When a `:` already follows the cursor (retyping a name over an existing declaration), just the name is inserted — no doubled punctuation. (`src/language-services/completion-data-static.ts`, `completion.ts`.)
- **Value-position suggestions after the colon.** Typing `:` in a style block now triggers property-specific value completions — `stroke-linecap:` offers `butt`/`round`/`square`, `fill-rule:` offers `nonzero`/`evenodd`, `stroke:`/`fill:` offer `none`/`currentColor`/`context-stroke`/`context-fill`, and so on for the ten enumerated properties — ranked above generic CSS keywords and alongside the user's own variables. Hyphenated value keywords (`line-through`, `text-top`) get the same replacement-range treatment as property names via a new `getStyleValueKeywordRun` helper (both surfaces), scoped so expression-like values (`4 2`, `w - 2`) keep normal word handling. `:` added to completion trigger characters in the playground and LSP. (`completion-data-static.ts`, `completion.ts`, `cm-completion-bridge.ts`, `cm-language-services.ts`, `server.ts`.)
- **Constructor registry + self-verifying drift guards.** New `src/evaluator/constructor-registry.ts` enumerates every evaluator-dispatched constructor; `tests/constructor-registry.test.ts` compiles a canonical program per name through **both** evaluators so the registry can't rot. The generator's `crossCheck()` now validates `pathogen-api.ts` against stdlib + context-aware functions + the registry, and `npm run check:completions` runs it in `--strict` mode (non-zero exit on drift). The pre-commit hook runs the check when a commit touches the API surface, evaluator, stdlib, or the generator (warn-only).

### Fixed

#### Completion bugs from the language-service audit

- **`stroke-` + accept → `stroke-stroke-width`.** Style-block property names are hyphenated, but both editors' word patterns treat `-` as a boundary, so accepting a completion re-inserted the already-typed prefix. The playground bridge now widens its word/`validFor` patterns to include `-` **only** in style property-name position (via a new `isStylePropertyNamePosition` export — `a-b` subtraction is untouched), and the LSP attaches an explicit `textEdit` covering the hyphenated prefix. The engine also filters property-name completions by the hyphen-aware prefix so the popup narrows as you type. (`playground/utils/cm-completion-bridge.ts`, `packages/pathogen-language-server/src/server.ts`, `src/language-services/completion.ts`.)
- **`drawTo` documented a signature that throws.** Completion detail read `drawTo(layerName) — Emit to layer`; the runtime signature is `drawTo(x, y)` (returns a ProjectedPath). Root cause was a wrong declaration in `src/pathogen-api.ts` — the published docs page was already correct. Also corrected `draw()`/`project()` return-type declarations.
- **Choice-syntax snippets inserted raw `${2|Grain,Paper|}` text in the playground.** The bridge's placeholder handling didn't understand VS Code choice fields (used by the NoiseFilter/GlowFilter/MotionBlurFilter declaration snippets); they now convert to their first choice, and the manual fallback selects the first placeholder default so typing replaces it.
- **`--annotated` mode was missing 5 defs constructors, all 7 filters, `PolarVector`, and `Cycler`.** `Mask`, `ClipPath`, `MeshGradient`, `FreeformGradient`, and `TopoGradient` (plus every filter constructor, `PolarVector`, and `Cycler`) threw `Undefined variable` under `pathogen-lang --annotated`. All now evaluate with full member/property support (gradient sub-methods, `append`, MeshPoint color assignment); filters evaluate as lenient stubs since annotated mode emits no defs. Statement-level defs-constructor calls now report the same error as the main evaluator instead of a misleading `Undefined variable`. (`src/evaluator/annotated.ts`.)

### Development (language-service audit)

- `completion-data.generated.ts` gains `CONSTRUCTOR_RETURN_TYPES` and `TYPE_METHOD_RETURNS`; `completion.ts` type inference now derives constructor and binding-block rules from them instead of hand-maintained regex ladders (adding a constructor to `pathogen-api.ts` propagates everywhere with no engine change).
- Generator logic extracted to `scripts/lib/completion-extract.ts` with unit tests (`tests/language-services/generate-completions.test.ts`); `escapeString` now encodes newlines/tabs so multi-line templates emit valid code.
- Deleted the hand-maintained `packages/pathogen-language-server/src/pathogen-lang.d.ts` type shim — the LSP now typechecks against the real `dist/index.d.ts`.
- Rewrote stale `src/language-services/CLAUDE.md` (referenced a deleted `completion-data.ts`, claimed all enums were missing) and fixed the same stale references in `src/CLAUDE.md`.
- New tests: method-snippet/detail assertions in `completion.test.ts`, replacement-range + snippet-apply coverage in `completion-bridge.test.ts`, defs-constructor hover in `hover.test.ts`.

### Added (2026-05-24)

#### `variableOffset` / `compoundVariableOffset` — variable-distance offset paths with per-stop curve continuity

- **Core.** Two new PathBlock methods that trace a *new* path alongside a reference "spine" using a gradient-stop-like syntax. Where `offset(distance)` produces a uniform parallel curve, these let the offset distance **vary** per stop and let you choose the join continuity at each stop. Model A ("rail-guided points"): each stop samples the spine at an arc-length fraction and steps along the spine normal to a point; the points are connected by a curve whose joins you control. (`src/evaluator/variable-offset-geometry.ts`, `src/evaluator/index.ts`.)
  ```
  let edge = spine.variableOffset() {|go, pb|
    go.stop(10%, 5,  CurveContinuity.G1);
    go.stop(50%, 15, CurveContinuity.G2);
    go.stop(90%, 20, CurveContinuity.G1);
  };
  ```
- **`CurveContinuity` enum** — `G0` (corner), `G1` (tangent-continuous, no kink), `G2` (curvature-continuous, seamless flow). A run of `G1`/`G2` stops is built as one spline; `G2` runs solve a **clamped** cubic spline for curvature continuity, with centripetal parameterization. Endpoint tangents default to the spine's own direction (natural ⅓-chord tension) or take an explicit `PolarVector` handle via `go.startTangent`/`go.endTangent`.
- **`compoundVariableOffset`** — two profiles (one per side), closeable into a filled ribbon with **end caps**: `Cap.butt()`, `Cap.round()`, `Cap.elliptical(projection)`, `Cap.tapered(length, continuity?)`. Omitting a cap leaves that end open; omitting both yields two unconnected profiles. The `pb` block parameter is the spine itself, exposing the existing `get`/`tangent`/`normal`/`length`/`vertices` sampling API.
- **Documentation.** New published page `docs/variable-offset.md`.
- **Three-surface parity.** Works identically in the CLI, playground preview, and VS Code preview (returns a standard `PathBlockValue`); editor completions for the methods, `Cap.*`, and `CurveContinuity.*` in both the playground and VS Code LSP. Not supported in `--annotated` debug mode (raises a clear error).

#### Shared CSS-transform pan/zoom controller — large-SVG pan/zoom ~16× faster

- **Problem.** Panning/zooming a large workspace was janky. Puppeteer profiling (`scripts/perf-pan-zoom-audit.ts`, `scripts/perf-transform-probe.ts`, `project-docs/pan-zoom-performance/`) proved it was **raster-bound, not JS-bound**: mutating an SVG's `viewBox` makes Chrome re-rasterize the whole drawing every frame (~300 ms/frame for a scene of 481 paths carrying 72.5M chars of path data — *not* the assumed ~422k DOM nodes; `circle()` in a `PathLayer` emits path data, not elements). Driving pan/zoom with a CSS `transform` on the composited layer instead is ~25× cheaper for pan / ~12× for zoom.
- **`PanZoomController`** (`src/ui/pan-zoom-controller.ts`, shipped as `dist/pan-zoom.global.js` → `window.PathogenPanZoom`, plus ESM/types via the `pathogen-lang/pan-zoom` sub-path). Framework-agnostic, DOM-only, zero top-level DOM. CSS-`transform` during a gesture, baked into the `viewBox` on idle (atomic, flash-free — verified by CDP screencast). Wheel + pointer drag + **touch pinch-zoom**; rAF-batched; loop-safe (input → `onChange`; external writes → `setView`, no echo). Configurable `rebaselineThreshold` (default 0.5) bounds the "blank while panning far when zoomed in" reveal by re-rasterizing mid-drag. A `viewbox` mode keeps viewBox mutation for surfaces whose overlays can't ride a transform. Pure math (`clampPan`/`adjustPanForZoom`/`viewToViewBox`/`computeTransform`) unit-tested (`tests/pan-zoom-controller.test.ts`).
- **Adopted across every pan/zoom surface:** workspace preview (`svg-preview-pane.ts`, ~16× faster / ~300× less raster on the big scene), blog/BBWP mini-preview (`blog/mini-preview.ts`), VS Code preview webview (`packages/vscode-pathogen/src/preview.ts`), and — math-only (dedup, keep viewBox) — the thumbnail-crop and export-legend modals. Surfaces with a navigator minimap also split the viewport rect into a GPU-promoted overlay SVG so its per-frame update stops re-rasterizing the heavy minimap paths.
- **Wheel-zoom modifier per surface.** The workspace editor and blog/website embeds gate wheel-zoom behind Ctrl/Cmd (with a brief "⌘ + scroll to zoom" hint) so plain scrolling doesn't trap the page; the VS Code preview — a dedicated panel — zooms on plain scroll.
- **`bakeDelayMs` default is 72 ms** (idle before the crisp re-raster bakes in), so the area revealed by zooming out fills in quickly.

### Changed

#### Playground pan/zoom hygiene (folded into the controller)

- Pan/zoom no longer rebuilds the navigator minimap or re-styles every path each frame, no longer double-fires the viewBox update, and is rAF-batched with a cached screen-CTM — previously every `mousemove`/`wheel` ran the heavy `updateSvgStyles` path twice. These were stepping-stones now subsumed by the shared controller.

### Fixed

#### Formatter could silently change program meaning

- `formatDocument` (VS Code "Format Document", playground, and the new `npm run format:pathogen` CLI) had three semantic-corruption bugs: it dropped precedence parentheses (`calc((i + 0.5) / 28)` → `calc(i + 0.5 / 28)` — different math), re-quoted double-quoted strings containing single quotes without escaping (parse error), and printed `-(a + b)` as `-a + b`. Fixed with a grammar-mirrored operator-precedence table, quote-aware string re-escaping, and unary-argument parenthesization; regression tests assert formatting is meaning-preserving and idempotent. (`src/language-services/formatter.ts`.)

#### Uncapped `compoundVariableOffset` teleported its second profile to the canvas origin

- The no-`endCap` case emitted the profile-2 subpath break as an uppercase `M`, which the relative-command serializer turned into a literal absolute `M 0 0` — so the second profile jumped to the canvas origin whenever the ribbon was drawn anywhere else. Found by an independent model audit of the geometry; the exact-coordinate test had encoded the bug as the expected shape. Fixed to a lowercase relative `m` with a `drawTo(200,300)` regression test. Also hardened: `go.stop()` rejects decreasing times (silent cap-direction flip) and `Cap.elliptical()` rejects non-positive projections. (`src/evaluator/variable-offset-geometry.ts`, `src/evaluator/index.ts`.)

#### VS Code preview rendered blank / wrong aspect for `define ViewBox(...)` sources

- The preview webview sized its canvas from a `// viewBox="..."` source **comment** (an old convention); modern sources use the `define ViewBox(...)` construct, so `canvasW/H` fell back to the 200×200 default and all content (at the real coordinates, e.g. 13200×7200) rendered entirely outside that tiny square viewBox — a blank white box with the wrong aspect ratio. The preview now reads dimensions from the compiled `result.viewBox` (origin + size), matching the playground. (`packages/vscode-pathogen/src/preview.ts`.)

#### The default layer and the "global" layer were two distinct things internally (drift outside the viewBox)

- **Symptom.** A workspace combining `define default PathLayer(...)` with top-level (non-`apply`) path commands and context-aware stdlib functions (`polarLine`, `tangentArc`, `polarPoint`, `polarMove`, …) rendered as a long diagonal smear escaping the viewBox, instead of the intended shape. The "semi-circle-example" workspace (a spiral that re-centers each loop iteration via absolute `M`) regressed this way.
- **Root cause — a default layer forked a second set of state.** There is conceptually only **one** default layer (the implicit layer that receives bare top-level commands; `define default PathLayer` just names and styles it). But the evaluator created the named default layer with its *own* fresh `pathContext`, `accum`, and `transformState`, leaving the original global `evalState.pathContext`/`transformState`/top-level accumulator orphaned. Bare commands were redirected into the new layer's accumulator, while context-aware functions (and `parseAndTrackPathString`) kept reading the orphaned global `pathContext`. That context never saw the per-iteration `M` reset, so its position drifted monotonically and `polarLine`/`tangentArc` emitted *absolute* coordinates from the drifting base → ever-longer lines. (`apply` blocks were unaffected — they swap `evalState.pathContext` to the layer's context for the block body.) The latent split has existed since the multi-layer work; the `define ViewBox(...)` migration (`scripts/migrate-viewbox.ts`) began triggering it by prepending a `define default PathLayer` to existing workspaces.
- **Fix — collapse global and default into one layer.** A `default PathLayer` now **adopts** the global `pathContext`, `transformState`, and the top-level (root) accumulator instead of forking new ones (`src/evaluator/index.ts`, `LayerDefinition` handler), so bare commands, the pen position, the `ctx` variable, and the layer transform all refer to a single layer. The per-command "route to default layer" redirects and the temporary `getActivePathContext` resolver were removed — every site reads `evalState.pathContext` directly. The default layer adopts `evalState.rootAccum` (the top-level accumulator) rather than the locally-threaded one, so a `define default PathLayer` placed inside a function body, `.map()` callback, or another layer's `apply` block still captures top-level commands instead of silently dropping them. The annotated evaluator already used one context and needed no change. Docs (`docs/layers.md`) were corrected to describe the single default layer (previously "an implicit unnamed layer" / "Default Context (No Layers)" implied two distinct things).
- **Two latent bugs fixed as a consequence.** (1) Bare commands written *before* a `define default PathLayer` were silently dropped (they landed in the orphaned global accumulator that the output builder discarded once a named default existed) — they now render in the default layer. (2) A top-level `ctx.transform` (e.g. `ctx.transform.translate.set(...)`) mutated the orphaned global `transformState` and never reached the named default layer — it now applies correctly.
- **Verified.** The workspace compiles fully inside its 8192×8192 viewBox (rendered bbox x:[85, 8016] y:[1072, 6639]); regression tests in `tests/context.test.ts` (no per-iteration `polarLine`/`tangentArc` drift) and `tests/layers.test.ts` (pre-define commands render, top-level transform applies, single shared context). Full suite green.

#### Moderation "Regenerate preview" follow-ups

- **Regenerate hit a 404.** The action posted the preview to `/admin/approval/:id/svg` via the `_post()` helper, which defaults to `POST`, but the route is registered `PUT`-only — so it failed in production. `_post()` now accepts `PUT` and the call sends it.
- **A too-large preview aborted the whole regenerate.** Gradient-heavy workspaces bake GPU-rendered raster data into the captured SVG, so the browser's preview can be several times larger than the CLI's and exceed the 12 MB server cap (HTTP 400). The 400 threw before the thumbnail step, leaving such workspaces with neither artifact. The preview upload is now best-effort: the PNG thumbnail (the grid image and detail-page hero fallback) is always generated, and the toast reports the outcome ("Regenerated preview + thumbnail" vs "Updated thumbnail. Preview not stored: …"). Verified end-to-end in a browser via Puppeteer against `dev:stack`.
- **Regenerated non-square workspaces showed a distorted, square detail-page hero.** The admin regenerate path produced only the square (center-crop) thumbnails and never an uncropped hero — `uploadHeroRender` needs a live `<svg>` element, which the string-based admin path doesn't have. So the detail page fell back to the square 1024 thumbnail, squashing non-square art (e.g. an 8000×4800 workspace rendered 1:1). Added `uploadHeroFromSvgString` (mirrors `uploadHeroRender` but rasterizes a full-aspect SVG string), and regenerate now uploads a source-aspect hero. Verified via Puppeteer: regenerating a 600×480 workspace yields a 600×480 hero (was 1024×1024) and the detail page renders it undistorted.
- **Featured cards showed "approved Invalid Date".** `adminListFeatured` omitted `approvedAt` from its response (the Featured card renders an "approved &lt;date&gt;" meta line), so `new Date(undefined)` formatted as "Invalid Date". The endpoint now returns `approvedAt`, and `_fmtDate` degrades missing/unparseable values to "unknown date" instead.

#### Grid `fill()` / `map()` / `forEach()` compiled ~100× slower than necessary

- **Root cause — per-cell `throw`.** Each grid cell's callback body was evaluated inside a `try`, and a `return` was implemented as `throw new ReturnSignal(value)` caught once per cell. The per-cell throw-through-`try` kept V8 from optimizing the loop, so cost scaled with cell count independent of the body — a 64,000-cell `Grid(320, 200)` took ~14s to compile even when the callback was a bare `return 0.5;` (not `calc()`, not the math, not the drawing loops downstream).
- **Fix — top-level-return fast path.** A new `evaluateGridCellBody()` (`src/evaluator/index.ts`) short-circuits a **top-level** `return` without throwing; **nested** returns (inside `if`/`for`) still throw `ReturnSignal` and are caught, so all semantics are preserved (no-return → `null` cell, top-level early-return stops the body, nested return honored, `forEach` ignores returns, callback-error message unchanged). The 64k-cell fill dropped **14,400ms → 27ms**; a real flow-field workspace (64k-cell grid + 115k circles across 241 layers) went **15,049ms → 831ms (18×)**. The annotated/`--annotated` evaluator keeps the old pattern (debug-only path).

#### Public previews silently dropped for large artwork (1 MB cap)

- **Root cause.** The admin-captured preview SVG (`approval.svg`) was inlined in the KV approval record and capped at 1 MB — anything larger was silently set to `null`. A 6 MB flow-field workspace lost its preview entirely, so the detail page (`/u/:handle/:slug`) fell through to a "Preview pending" swatch no matter how it compiled.
- **Fix — R2-backed previews.** The preview SVG now lives in R2 (`{id}/approval.svg`) with the approval record stamping `approvalSvgAt`; the cap is raised to a 12 MB sanity ceiling. A new public, visibility-guarded `GET /approval-svg/:id` serves it (with `Content-Security-Policy: script-src 'none'` defense-in-depth), and the detail page references it via `<object>` with a thumbnail/swatch fallback. Legacy inline `approval.svg` records still render (backward compatible); `deleteWorkspace` cascades an R2 delete. `hasSvg` in admin listings now reflects either storage location.

#### `partition()` / sampling treated smooth `t`/`s` commands as straight lines

- Smooth-quadratic (`t`/`T`) and smooth-cubic (`s`/`S`) path commands were sampled as if they were straight line segments, so `partition()` and other length/position sampling produced wrong points along any path that used them. They are now reflected into their full quadratic/cubic control points before sampling, matching how the renderer draws them.

#### Workspace code reverting after edits (silent data loss)

- **Root cause — server-side clobber.** The thumbnail upload (`PUT /workspace/:id/thumbnail`) and clear (`DELETE /workspace/:id/thumbnail`) endpoints did a full-document read-modify-write of the `workspace:${id}` KV value just to stamp three timestamp fields — carrying `workspace.code` along. A code save (autosave, or a fresher second tab) that landed between the handler's read and write was silently reverted. The thumbnail is rendered client-side from the live preview, so it always looked up-to-date while the persisted code rolled back to an older version.
- **Fix — field isolation.** Thumbnail timestamps (`thumbnailAt`, `manualThumbnailAt`, `autoThumbnailAt`) now live in a sidecar KV key (`thumbmeta:${id}`). The thumbnail endpoints write **only** the sidecar and never touch `workspace:${id}`, so a thumbnail operation can no longer clobber code. Reads merge the sidecar with a lazy fallback to the legacy inline fields (`readThumbMeta` in `website/api/utils.ts`) — no migration job; pre-existing workspaces migrate on their next thumbnail write. The sidecar uses the `thumbmeta:` namespace (not `workspace:`) so `KV.list({ prefix: 'workspace:' })` scans don't pick it up. `deleteWorkspace` cascades a sidecar delete.
- **Root cause — dropped unload saves.** The playground API client issued saves with a plain `fetch`, so a save fired from the `beforeunload` handler (closing/navigating away) was cancelled mid-flight by the browser. Combined with the 5s debounce + 30s min-interval, edits made shortly before leaving could never land.
- **Fix — keepalive flush + UX guards.** The leave-the-page flush now uses `fetch(..., { keepalive: true })` so the request survives document teardown. A native "unsaved changes" prompt appears on unload while a save is still pending. Saves also flush on `visibilitychange → hidden` (the reliable mobile/backgrounding signal) and on editor blur, shrinking the unsaved-edit window. Auto-thumbnail failures, previously swallowed (`console.warn` only), now surface a non-blocking toast. The keepalive fetch is dispatched **synchronously** (no `await` before it) so it actually fires during teardown.
- **Root cause — multi-tab code-vs-code clobber.** Two tabs open on the same workspace both autosaved `code`; the slower (stale) tab's save overwrote the faster tab's newer code. Last-write-wins with no concurrency control.
- **Fix — optimistic concurrency.** The workspace doc carries a monotonic `rev` counter, bumped on every accepted code write. Each save sends `baseRev` (the revision the client edited from); the server rejects with **409** when the doc has advanced, so a stale tab can't clobber newer code. The client advances `baseRev` from each save's response (sequential saves keep working), and on a 409 stops autosaving, surfaces the multi-tab conflict (warning banner + save-status message), and keeps the local edit in memory — the user reconciles by reloading. Clients that omit `baseRev` keep the old behavior (backward compatible). Non-code updates (rename, preferences, publish toggle) re-read `code`/`rev` immediately before their full-doc write so they can't revert a concurrent code save either. Residual: KV has no compare-and-swap, so two saves landing in the *same* sub-second window can still race — exceedingly unlikely for one user given the 5s/30s autosave cadence; a Durable Object would close it fully.

### Added

#### Admin "Regenerate preview" action (Approved / Featured moderation tabs)

- **Per-workspace regeneration in `/admin/moderation`.** Each Approved and Featured card has a **Regenerate preview** button that recompiles the **frozen `approval.code`** (what visitors see — not the possibly-diverged live workspace), writes the full multi-layer preview SVG to R2 (the detail-page hero), and rasterizes a square-cropped variant into the grid PNG thumbnails. Used to heal entries whose preview was dropped by the old 1 MB cap or that never got a thumbnail. The card repaints immediately (local `thumbnailAt`/`hasSvg` stamp).
- **Session-admin thumbnail uploads.** `uploadThumbnail` now grants the ownership bypass to a session-authed admin (`isAdminRequest`), not only the legacy `?token=` param, so the moderation UI can refresh any workspace's thumbnail over its session cookie. The session-admin (D1) check is consulted lazily — only for non-owner uploads — so frequent owner auto-uploads pay no extra latency.

#### `MotionBlurFilter()` — directional and progressive blur

- **New custom filter constructor** (the seventh, alongside `NoiseFilter`/`GlowFilter`/`EmbossFilter`/`ElevationShadowFilter`/`InnerShadowFilter`/`PixelateFilter`) bringing the effects of the CSS [`motion-blur` proposal](https://github.com/w3c/csswg-drafts/issues/11134) — which no browser implements — to Pathogen, synthesized from stock SVG filter primitives. Configured via a trailing block: `let b = MotionBlurFilter() {|f| f.type = MotionBlurType.Linear; f.distance = 20; f.angle = 30deg; f.samples = 12; };` then `filter: b;` in a style block.
- **Two `MotionBlurType`s.** `Linear` — a directional smear along `angle` (the way a fast object blurs along its travel). `Progressive` — blur that ramps across the element, sharp at one edge and increasingly blurred toward the other (the iOS "variable/frosted blur"). New `MotionBlurType` enum (`Linear` | `Progressive`).
- **Properties:** `type` (`MotionBlurType`, default `Linear`), `distance` (≥ 0, user-space units — smear length for Linear, max blur radius for Progressive, default 10), `angle` (angle unit, default `0deg`; `0deg` = right, `90deg` = down), `samples` (integer 2–32, Linear-only tap count / quality, default 12).
- **How it's built.** Linear averages `samples` centered `feOffset` taps along the motion vector, each scaled to `1/samples` alpha and summed additively with `feComposite operator="arithmetic"` (summation, not `feMerge`, so the average isn't brightened); a final **direction-aligned** `feGaussianBlur` (two-value `stdDeviation` along the motion axis) fuses the discrete taps into a continuous smear without dulling the perpendicular edge, so the result reads as a smooth blur rather than ghost copies. Progressive crossfades a single `feGaussianBlur` copy against the sharp source through an `feImage` gradient mask in `objectBoundingBox` units, so the ramp tracks the **element's own bounding box** and supports any `angle`; the two complementary halves are summed (not merged) so a solid shape keeps full opacity through the midband.
- **Renderer support.** Linear renders in every SVG engine. Progressive depends on `feImage`, solid in Chromium-class engines (Chrome, Edge, the Electron VS Code preview) but weak in non-Chromium engines (notably Firefox), where the shape may render unblurred — documented in `docs/filters.md`. Radial/zoom blur is intentionally **not** included: it cannot be expressed as a static SVG filter (no scale/rotate primitive).
- **Surfaces & language services.** Renders in the CLI SVG output and the playground (verified via the `buildDefs` + `mountInto` DOM path). Completions, hover, member access (`f.<TAB>`), and a declaration snippet are wired for `MotionBlurFilter` and `MotionBlurType`.
- **Playground fix (incidental).** The SVG preview pane's defs-cleanup selector omitted `[data-filter-def]`, so every filter's `<filter>` def leaked across recompiles (`mountInto` appends, never clears) — a changed filter could resolve `url(#id)` to a stale duplicate. Added `[data-filter-def]` to the cleanup selector.

#### `Grid()` constructor — 2D data containers for flow fields, heatmaps, sampling tables

- **New typed value `Grid(rows, cols, options) {|grid| ... }`** for spatial data that maps cells to canvas coordinates. The trailing block runs once at construction and receives the (mutable) grid — same pattern as `Marker(...)`, `Mask(...)`, and `Pattern(...)`. `rows` and `cols` are positive integers; `options` is an object literal whose keys are all optional.
- **Constructor options:** `xDim` / `yDim` (cell size, default 1), `origin` (Point, default `Point(0, 0)`), `defaultValue` (initial cell value, default `null`), `outOfBounds` (`'clamp'` | `'wrap'` | `'null'`, default `'clamp'`), `interpolation` (`'nearest'` | `'bilinear'`, default `'nearest'`). `defaultValue` is named that way because `default` is a reserved Pathogen keyword.
- **Driving use case.** Pathogen arrays throw on out-of-bounds access; assignment doesn't auto-extend. That makes the JS-style `if (!map[row]) map[row] = []` lazy-init pattern impossible. `Grid` removes the manual init entirely (`grid.fill {|row, col, center| return ... }`), removes the manual `row*cellSize + cellSize/2` arithmetic (`grid.getPoint(row, col)`), and adds the `outOfBounds: 'wrap'` mode common in toroidal flow-field art.
- **Members:** `rows`, `cols`, `xDim`, `yDim`, `origin`, `width` (`cols * xDim`), `height` (`rows * yDim`).
- **Methods.** Cell access: `get(r, c)`, `set(r, c, v)` (mutates, returns self), `getPoint(r, c)` (cell center as `Point`), `getRow(r)`, `getCol(c)`, `cells()` (flat row-major). Iteration: `fill {|row, col, center| return ... }` (mutate every cell), `forEach {|cell, row, col, center| ... }` (side effects — drawing arrows etc.), `map {|cell, row, col, center| return ... }` (new grid). Sampling: `sample(x, y)`, `sampleNearest(x, y)`, `sampleBilinear(x, y)`. `getPoint`/`getRow`/`getCol` deliberately mirror `MeshGradient`'s vocabulary.
- **`forEach` threads the active layer's accum** when invoked inside `layer.apply { }`, so `drawTo()` / path commands inside the block emit to the surrounding layer — same semantics users already get from a regular `for` loop.
- **Bilinear sampling handles both numeric and Point cells.** Numeric cells get the standard three-lerp (`(1-fx)`/`fx` × `(1-fy)`/`fy`) blend. Point cells interpolate `x` and `y` separately — the standard fix for direction sampling, since bilinear on raw angles produces wrong directions at every wrap-around. Cells of other types throw a clear `Grid.sampleBilinear() requires cells to be numbers or Points` error.
- **`docs/grid.md`** is the new user-facing page (registered in `scripts/build-docs.ts` `DOC_FILES`). Covers the constructor, options, members, methods, a full flow-field example, the bilinear-sampling primer, and the angle-wraparound caveat (`Point(cos(a), sin(a))` then `atan2(v.y, v.x)`). `docs/stdlib.md` and `docs/grid.md` carry reciprocal "not to be confused with" callouts disambiguating the new data-container `Grid()` from the existing `squareGrid`/`triangleGrid`/`hexagonGrid` PathSegment generators.
- **Completion + hover + signature help.** `Grid` is declared in `src/pathogen-api.ts` as `PathogenGrid` with `PathogenGridOptions`. `npm run generate:completions` produces the top-level constructor entry, the 7-property/12-method member set, and the signature `Grid(rows, cols, options)`. `let g = Grid(...)` triggers Grid member completions on `g.` via the inference table in `src/language-services/completion.ts`. Hover automatically picks up the constructor doc from `STDLIB_COMPLETIONS`.
- **VS Code.** TextMate grammar adds `Grid` to the constructor token list. A new `grid` snippet expands to `Grid(rows, cols, { xDim, yDim }) {|g| g.fill {|row, col, center| return ... }; };`.
- **Annotated evaluator parity.** `src/evaluator/annotated.ts` mirrors the constructor, member access, all 11 methods, and the sampling helpers so the Annotated debug pane doesn't error on programs using Grid.

### Tests

- **`tests/evaluator.test.ts`** — 20 new tests covering construction (defaults, `defaultValue`, fill block), members, cell access (`get`/`set`/`getPoint` with origin, `getRow`/`getCol`/`cells`), iteration (`forEach` row-major, `map` returns new grid, `forEach` inside `layer.apply` emits paths to the surrounding layer), and sampling (nearest at cell centers, bilinear at centers and midpoints, all three `outOfBounds` modes, `sample` dispatching on `interpolation`, bilinear Point interpolation).
- **`tests/errors.test.ts`** — 7 new tests pinning the error messages for argument validation, `get`/`set` out-of-bounds, invalid option values, and `sampleBilinear` on non-numeric/non-Point cells.
- **`tests/language-services/completion.test.ts`** — 1 new test verifying Grid members appear on `g.` after `let g = Grid(...)`.
- Full suite passing: **3050 tests** (up from 3022 pre-feature), no regressions.

#### `define ViewBox(...)` — viewBox in source

- **New language statement.** `define ViewBox(originX, originY, width, height);` declares the SVG viewBox in Pathogen source. Arguments are full expressions (`calc(...)`, variables, negative origins are all supported). One ViewBox per program; duplicates are a compile error.
- **Render precedence.** Source `define ViewBox` wins over the CLI's `--viewBox`/`--width`/`--height` flags; flags continue to apply for inline `-e` snippets that don't declare one. Default remains `0 0 200 200`.
- **Strict validation.** Zero or negative `width`/`height` rejected at compile time. Negative `originX`/`originY` are allowed (valid SVG, useful for centering around 0,0). Non-numeric arguments produce a clear "must evaluate to a finite number" diagnostic. `define ViewBox` inside a layer apply / path / text block is rejected ("ViewBox must appear at top level").
- **CompileResult carries the resolved viewBox.** `CompileResult.viewBox = { originX, originY, width, height } | undefined`. `compileWithContext` exposes the same field. `--include-metadata` emits it inside the metadata `<script>` block.
- **`docs/viewbox.md`** is the new user-facing page (registered in `scripts/build-docs.ts` `DOC_FILES`). `docs/cli.md`, `docs/layers.md`, and `docs/getting-started.md` cross-link to it; `getting-started.md` now opens its first example with the canonical boilerplate.
- **Completion + hover.** `define V…` completes to `define ViewBox(${1:0}, ${2:0}, ${3:200}, ${4:200});`. Hovering `ViewBox` shows the syntax and precedence rules. The `define` hover documents all three variants (PathLayer / TextLayer / ViewBox).
- **VS Code.** TextMate grammar adds `ViewBox` to the keyword token list. The `viewbox` and `newfile` snippets emit the `define ViewBox(...)` form instead of the old `// viewBox=...` comment header.
- **`scripts/migrate-viewbox.ts`** + `npm run migrate:viewbox:dev` / `migrate:viewbox:prod`. Idempotent migration: iterates every `workspace:*` KV record, parses the code with `parseLezer` to detect any existing `ViewBoxDefinition` (AST-walked, not regex'd, so comment / template-literal mentions don't fool the skip check), and prepends `define ViewBox(0, 0, ${w}, ${h});` using `preferences.width`/`height` (default 200/200) when absent. Sets a `_viewboxMigratedAt` marker. Re-reads before write to skip concurrent autosaves. Supports `--dry-run`; requires `--confirm` for `--env=prod`.

#### Rename workspace from the overflow menu

- **New "Rename workspace" action** in the workspace breadcrumb overflow menu. Owner-only (`currentUser.id === workspaceOwnerId`); appears just under "Format Document". Opens a centered card dialog with Name and Description fields, validation matching the new-workspace form (name required, ≤ 100 chars; description ≤ 500 chars), and inline error display.
- **Save flow** calls `workspaceApi.update(id, { name, description })`, updates the store (`workspaceName`, `workspaceDescription`, `currentFileName`, `workspaceUpdatedAt`), syncs the matching entry in the workspaces list, refreshes the URL slug via `history.replaceState`, and closes. Errors surface inside the modal without dismissing the entered values.
- **Shared `updateWorkspaceSlugUrl(id, slug)`** util extracted from `workspace-view.updateUrlWithSlug` so both the workspace loader and the rename modal use the same path.
- **Storybook entry** for `edit-workspace-metadata-modal` under the Shared category with default, empty, and long-description stories. New `mi-edit` icon added to the material-icons sprite.

### Changed

- **Admin moderation tabs no longer compile every card up front.** The view previously compiled every Pending/Re-review card's source in the browser on load, and re-fetched all seven tabs after every moderation action — a single slow-compiling workspace janked the whole tab and re-janked on each click. Eager compilation is now bounded (at most two concurrent, each raced against a 4s timeout so a slow card falls back to its avatar), and the post-action full refetch is gone (local list mutations keep the active tab correct; other tabs re-fetch on visit, so non-active counts may briefly lag).
- **Workspace canvas size is no longer user-editable in the playground.** The W/H number inputs are gone from the workspace footer (replaced with a read-only viewBox display), the new-workspace dialog (no longer asks for canvas size on create), and the preferences page (`Canvas Size` section removed). `store.preferences` no longer carries `width`/`height`; the new-workspace boilerplate is `define ViewBox(0, 0, 200, 200);` followed by a `define default PathLayer('main-path-layer') ${ ... };` block. The footer's viewBox display updates live from `result.viewBox` after each compile.
- **API stops persisting `preferences.width`/`height`.** POST `/api/workspace`, PUT `/api/workspace/:id`, and PUT `/api/preferences` strip those keys from incoming payloads (via `stripDimensions`). Existing KV records keep their legacy values until the migration script runs; old values are inert because the new client never reads them.
- **Optional trailing `;` on `define <LayerType>(...) ${ ... }`.** Previously a trailing `;` was a parse error; now it's accepted (matching the user-facing boilerplate style and `define ViewBox(...);`'s mandatory `;`). Existing layer definitions without `;` continue to parse unchanged.
- **`scripts/compile-bbwp.ts` + `compile-samples.ts`** prefer the canonical `define ViewBox(...)` statement when auto-detecting dimensions, falling back to the legacy `// viewBox=...` / `// Set viewBox: ...` comment forms for unmigrated source files.

### Breaking

- **`ViewBox` is now a reserved keyword.** Variable or layer names matching `ViewBox` will no longer parse. The keyword is contextual at the AST level (specialized only inside `define ViewBox(...)`) but, like other keywords (`let`, `for`, `define`), it is specialized at tokenization and cannot appear as an identifier. No examples in the codebase used it.

### Migration Path

The migration runs against KV before deploy. Atomic single-PR rollout: migrate prod KV → merge → auto-deploy. Old workers can still serve unmigrated workspaces because `preferences.width`/`height` are retained alongside the new `define ViewBox` statement during the transition window. Storage cleanup (removing the legacy `width`/`height` keys from KV entirely) is a no-op follow-up done at our convenience.

### Tests

- **`tests/viewbox.test.ts`** — 19 tests covering parsing (basic, expression args, negative origin, coexistence with layers, `ViewBox` reservedness, trailing `;` on layer defs), evaluation (validation, duplicates, zero/negative width/height, non-numeric args, no-viewbox case), and render precedence (source wins / CLI fallback / default).
- **`tests/migration-viewbox.test.ts`** — 9 tests pinning the AST-walk skip check used by the migration. Verifies that comment-only and template-literal mentions of `define ViewBox` do NOT suppress the migration, and unparseable code falls through to "prepend" mode.
- **`tests/cli.test.ts`** — 2 new tests verify CLI flag precedence (source-defined ViewBox wins over `--viewBox`, falls back to flag when source has no declaration).
- **`tests/language-services/completion.test.ts`** — 1 new test verifies `ViewBox` appears among keyword completions.
- Full suite passing: **2997 tests** (up from 2966 pre-feature).

#### Blog sample sweep

- **143 `.pathogen` files under `website/blog/samples/post*/`** updated: line 1 `// viewBox="0 0 W H"` comments replaced with `define ViewBox(0, 0, W, H);` canonical form (commit b784152). All 143 now compile successfully via `npm run compile:samples` (commits 7486f5e, ea02745).
- **Inline `svg-path` / `pathogen` code fences** in `website/blog/*.md` (101 fences across 18 posts) intentionally left untouched — they're short illustrative snippets (`arrow.draw()`, `dot.drawTo(...)`), not full programs, and adding `define ViewBox(...)` to each would clutter the teaching context.

#### AST builder postfix folding (commit 7486f5e)

The viewBox sweep surfaced a cluster of AST-builder bugs that were
silently dropping function-call argument lists in five expression
contexts. Five builders iterated CST children with `buildExpression`
(which stops at the primary node) and then fell through to
`buildExpression`'s case `'ArgList'` branch — which returns NullLiteral.
Effect: `calc(foo(5))` parsed as `CalcExpression { expression: NullLiteral }`
and `let x = calc(foo(5))` set `x` to `null` instead of the function's
return value; `text(polarX(...), polarY(...))` parsed as
`text(polarX, polarY)` (just identifiers).

Fixed builders: `buildCalcExpression`, `buildUnaryExpression`,
`buildTernaryExpression`, `buildTextStatement`, `buildTspanStatement`.
All five now use `buildExpressionWithPostfix` which folds ArgList /
MemberExpression / IndexExpression chains at sibling level.

9 new tests in `tests/ast-builder-postfix.test.ts`.

#### Sample-rot fixes (commits 7486f5e, ea02745)

After commit b784152 surfaced 27 pre-existing compile failures:

- **post16/* (7 files)** — missing trailing semicolons in `apply` blocks. Fixed via diagnostic-driven semicolon insertion (the parser's "Missing ';'" diagnostic points at the exact insertion position).
- **post7, post11, post13, post14 (8 files)** — runtime `Cannot use null in arithmetic expression` / `text() x must be a number` errors. All resolved by the AST builder postfix fixes above; no per-file changes needed.
- **post24/* (14 files)** — style values with raw `var()` / `oklch(from var(...) ...)` / `color-mix(in oklch, var(...), ...)` strings, rejected by the security validator. Sweep migrated to Pathogen `Color()` + `CSSVar()` constructors via `scripts/fix-post24.ts`.
- **post16/wedge-diag-{4,16}** — silent timeout in `compile-samples.ts` (these samples do dozens of XOR ops and take ~2:27 each). Timeout raised from 120s to 600s.

`npm run compile:samples` final state: **143 compiled, 0 errors**.

## [0.8.0] - 2026-05-13

### Added

#### Publication & Moderation (Phase 4)
- **`ownerHandle` frozen into approvals + public index.** `WorkspaceApproval` and `PublicIndexEntry` carry the workspace owner's handle from approval time, so `/u/<handle>/<slug>` URLs can be built without a per-card D1 lookup and stay stable if the owner later renames themselves.
- **Card links now go to the SSR detail page.**
  - `/explore` cards link to `/u/<ownerHandle>/<slug>` when both fields are present; legacy entries (pre-Phase-4) fall back to the prior `/workspace/<slug--id>` URL.
  - `/featured` rendering pivots from reading `workspace:{id}` to reading `approval:{id}` so each card gets the frozen owner-handle and slug from the moderated snapshot. Stale-index defense still consults the live workspace record (skipping cards that are no longer public or have been flagged).
- **Interactive `<mini-workspace>` embed on the workspace detail page.** The admin's browser captures the rendered SVG at approval time (via `compileWithContext` + the library's `generateSvg`) and POSTs it alongside the decision. The detail page embeds the frozen code + captured SVG into a `<mini-workspace>` so visitors get the same interactive viewer blog posts use today. Legacy approvals without `svg` fall back to the prior code-only render — no flag-day required.
- **Admin moderation card now renders the SVG preview.** Expanding "Review code" lazy-mounts a side-by-side preview (SVG render + source code, side-by-side at ≥700px, stacked below). The render is cached on the view, re-used on Approve so we don't double-compile. Approve without expand triggers an invisible background compile right before sending so capture still happens. Compile errors degrade gracefully to no-SVG.
- **`scripts/backfill-owner-handle.ts`** (`npm run backfill:owner-handle`): idempotent backfill that walks `approval:*` records, looks up each owner in D1, and patches the missing `ownerHandle`. Also rewrites `public:workspaces` to carry the field. Dry-run default; `--apply` to commit; `PRODUCTION_CONFIRM=1 ... --remote --apply` for production.
- **Seed dev queues for moderation UI demo.** `npm run seed:dev` now populates `queue:review` with 3 pending submissions (Alice Draft, Bob Kite, Dan Star) and `queue:rereview` with 2 drifted entries (Alice Circle, Bob Star). Pending entries also get a `pending` state row in D1; re-review entries don't (per Phase 3 design — queue membership alone signals re-review while effective state stays `approved`). Re-running the seed clears and re-populates the queues deterministically.
- **Tests**: 5 new tests in `tests/api/workspace-publication.test.ts` covering `ownerHandle` propagation through `publishApprovalToIndex`, legacy entries deserializing without `ownerHandle`, and `WorkspaceApproval` round-trip with `svg`. Publication tests now total **29**; full suite **2966 passing**.

#### Phase 4 — admin UI overhaul + queue refinements
- **Seed sample code corrected.** The four `.pathogen` snippets in `scripts/seed-dev-users.ts` now use the project's actual syntax (parens around `for (i in 0..N)`, `calc(…)` for math, mandatory trailing semicolons on expression statements, `TAU()` for full-turn). CLI-verified to compile.
- **Admin moderation UI rebuilt** with seven tabs (Pending review / Re-review / Approved / Featured / Rejected / Flagged workspaces / Flagged users). Each card carries a thumbnail (compile-on-demand inline SVG for queue entries; R2 thumbnail or letter-avatar placeholder otherwise), owner handle, and per-tab actions.
- **Review opens a modal with `<mini-workspace>` embed.** The old inline expand-the-card preview is gone. Clicking Review on any card opens a modal with the full mini-workspace component (code panel + rendered SVG, fullscreen-friendly). The cached SVG from compile is reused on Approve so we don't double-compile.
- **Scroll fix.** The admin view's host element now sets `height: 100%; overflow-y: auto` so long queues scroll properly when many cards stack.
- **State transitions exposed in UI.** New tab-aware actions:
  - **Approved / Featured tabs**: Review · Feature/Unfeature · Unpublish · Flag ws · Flag user
  - **Rejected tab**: Flag ws · Flag user (re-approval still happens via owner re-submission through `queue:review`)
  - **Featured tab**: Unfeature without unpublishing
- **New admin endpoints**: `GET /admin/queue/approved` (filtered to currently-public workspaces), `GET /admin/queue/featured`, `GET /admin/queue/rejected`. `POST /admin/unpublish/:id` (admin force-unpublish; appends `unpublished` state row + drops from public + featured indexes; approval record retained). `POST /admin/feature/:id` and `DELETE /admin/feature/:id` (feature/unfeature an approved workspace).
- **Approval records now carry `ownerHandle`** in the seed too, fixing the `@None` rendering when the seed admin viewed featured cards before the next backfill.
- **Approved listing filters to currently-public workspaces** — `isPublic && !flagged` — so admin-unpublished workspaces don't clutter the Approved tab. They remain in KV as approval records (recoverable) but aren't shown.

#### Phase 4 — admin UI bug fixes (round 2)
- **Tab counts now refresh in parallel on view load.** The view fetches every queue concurrently on first mount and after each mutating action, so the count next to every tab label is always accurate — previously the count for a tab stayed at zero until the admin clicked into it. State transitions (approve/reject/unpublish/feature/unfeature/flag) also kick off a background `Promise.all` refresh.
- **Fixed 404 on `/admin/queue/pending`.** The tab id is `pending` but the server endpoint is `/admin/queue/review` (the underlying KV key is `queue:review`). Added a `_queuePath()` translator on the client.
- **Review modal no longer hangs on "Compiling preview…".** The modal now tracks a discrete status (`idle / loading / ready / failed`) and renders three distinct states. On compile failure or missing source, the modal shows an error banner plus the source code so the admin can still review what was submitted and reject it with notes. The old `_modalSvg === null` path stayed perpetually in "Compiling…" — gone.
- **Approved/Featured Review now reads the frozen approval snapshot.** Added `GET /admin/approval/:id` (admin-gated) returning the full approval record (`code`, `svg`, `slug`, `ownerHandle`, …). The modal prefers `approval.svg` when present (instantly interactive), falls back to background compile against `approval.code`, and finally to the source-only/error view if even the code no longer parses. Legacy workspaces with pre-mandatory-semicolons syntax render their source so the admin can decide whether to unpublish or flag.
- **Fixed: every valid workspace previewed as "Compile failed".** The SVG-capture code referenced `window.SvgPathExtended.generateSvg`, but the tsup bundle's `globalName` is `PathogenLang`. `compilerWorker.compileWithContext` succeeded but the subsequent serialize call hit `undefined.generateSvg` and threw, which the catch silently cached as a failure. Switched to `window.PathogenLang.generateSvg` (matching `playground/services/compiler-worker.ts:153`) and added a separate warn when the global isn't present at all — easier to diagnose if a bundle drift recurs.

#### Phase 4 — admin modal rendering (round 3)
- **Fixed: mini-workspace preview collapsed into the upper-left of the modal.** The admin moderation view's modal CSS rule `.modal-body mini-workspace { display: block; }` overrode the component's own `:host { display: flex; flex-direction: column; }`. With block display, `flex: 1` on the internal content-area didn't grow, so the code + preview panels each shrunk to `mini-preview`'s 200px min-height. Removed the override and let mini-workspace use its own 60dvh sizing. After the fix, the diagnostic shows content-area at the full 571px (was 200px).
- **Fixed: empty-code submissions silently rendered as a blank preview.** A stale "Testing something out!" entry from earlier dev testing carried an empty `code` field. Compiling empty source produced a valid SVG with `<path d="" />`, which the modal happily displayed as an empty pane with no error. Now empty `code.trim()` short-circuits to the failed-state modal up-front, and `POST /workspace/:id/submit-for-review` rejects empty code with `400 Workspace has no code to review` so the queue can never accumulate non-renderable entries in the first place.
- **New diagnostic**: `scripts/debug-admin-modal.ts` — Puppeteer script that signs in as the seed admin, opens the moderation page, clicks the first Review button, and dumps the modal + mini-workspace + iframe internals (computed CSS, dimensions, theme-variable cascade). Re-runnable with `npx tsx scripts/debug-admin-modal.ts`; uses a disposable session token. Saved as a reproducer for the modal layout issues so future regressions surface immediately.

#### Phase 4 — simplified card actions + flagged-user badge
- **Tab actions trimmed to the minimum per the spec.** Each moderation card now shows exactly the actions needed to move the workspace between adjacent states — Review is no longer a button; clicking the thumbnail opens the review modal.
  - **Pending review**: Approve · Reject
  - **Re-review**: Approve · Reject
  - **Approved**: Pending review (requeue) · Feature
  - **Featured**: Unfeature
  - **Rejected**: Pending review (requeue) · Flag workspace
  - **Flagged workspaces**: Unflag (→ Rejected) · Flag user
  - **Flagged users**: Unflag user
- **"⚑ Flagged user" badge propagates everywhere.** Every queue listing endpoint now resolves `ownerFlagged` from the user record and surfaces it in the entry payload (Pending / Re-review / Approved / Featured / Rejected / Flagged-workspaces). Card titles render a red `⚑ Flagged user` badge whenever the owner is flagged — visible across every queue the workspace appears in.
- **`POST /admin/requeue/:id`** (new endpoint) — moves an Approved or Rejected workspace back into `queue:review`. Drops the workspace from `public:workspaces` + `featured:workspaces`, sets `isPublic: false`, pushes a fresh review queue entry with the current code as the frozen snapshot, and appends a `pending` state row attributed to the admin (with `internal_notes = "admin requeued for review"`). Rejects empty submissions with 400.
- **Unflag-workspace semantics changed.** Previously, `DELETE /admin/flag-workspace/:id` auto-restored to approved when an approval record existed. Per the simplified flow the action is now strictly "back to Rejected" — the workspace gains a fresh rejection record (internal note "Unflagged from flagged-workspaces queue."), an appended `rejected` state row, and stays off the public + featured indexes. Admin has to send it through Pending review to publish again.
- **Approved tab excludes Featured.** Cleaner disjoint sets — featured workspaces appear only in the Featured tab and admin doesn't see the same card in two places with different action buttons.
- **Rejected tab filters out currently-flagged workspaces.** Flagging a workspace from Rejected used to leave it on both lists; the listing now skips entries whose workspace record has `flagged: true` so the Flagged Workspaces tab is the only home for them while flagged.
- **`scripts/debug-admin-tabs.ts`** (new diagnostic) — Puppeteer walker that visits every moderation tab, captures the per-card action labels, and screenshots each into `/tmp/admin-tab-<id>.png`. Lets future spec changes be verified against expected action sets in one run.

#### Local dev — shared wrangler state
- **Fixed: `/explore` and `/featured` didn't reflect admin moderation actions in local dev.** Each `wrangler dev` process maintains its own miniflare KV/D1 store under its working dir's `.wrangler/state`. The two `dev:stack` workers (Pages on :3000, API on :8787) were running from different dirs, so admin writes on the API side never reached the Pages SSR reads. Production is unaffected — both projects bind to the same Cloudflare KV namespace by id.
- **Both `wrangler dev` calls now use `--persist-to=<repo>/.wrangler/state`.** Pages dev runs from the repo root and writes/reads there directly; API dev runs from `api/` and points at `../.wrangler/state`. The seed and backfill scripts now also pass `--persist-to=../.wrangler/state` on every `wrangler kv key` / `wrangler d1 execute` invocation so the CLI surface and the runtime share the same sqlite mirror.
- **`POST /admin/reconcile-indexes`** (new admin endpoint) — rebuilds `public:workspaces` + `featured:workspaces` from the canonical `approval:*` records. Useful when index drift accumulates from a long sequence of flag/unflag/unpublish/requeue operations. Idempotent.
- **`scripts/merge-wrangler-state.ts`** (`npm run merge:wrangler-state`) — one-shot tool that lifts `api/.wrangler/state` into the new shared `.wrangler/state` so existing dev data survives the path move. Dry-run by default; `--apply` to copy. After running this once + restarting `dev:stack`, both workers see the same state.
- **Thumbnail origin is now env-configured.** SSR pages (`/explore`, `/featured`, `/u/:handle`, `/u/:handle/:slug`) previously hardcoded `https://api.pathogen.studio/thumbnail/...` for every `<img src>`. In local dev that returned 404 because the workers run on `localhost:8787`. Added `env.API_BASE` to the Pages worker config (`[vars] API_BASE = "https://api.pathogen.studio"` in `wrangler.toml`, overridden to `http://localhost:8787` in `.dev.vars`). New `thumbnailUrl(env, id, size)` helper in `website/_worker.ts` reads the env var; the four hardcoded URLs in the SSR renderers now route through it. Admin moderation view's thumbnail rendering already uses the playground's `__PATHOGEN_API_BASE__` define; tightened the URL construction to handle trailing slashes cleanly.

#### Publishing UX polish
- **Removed the Visibility section from the New Workspace form.** Workspaces always start private; publishing happens later via the overflow menu on the Workspaces card or in the workspace breadcrumb. Cleaner create dialog, and the publish decision now happens on a workspace that already has code.
- **Unified labels to "Make public" / "Make private".** The workspace-breadcrumb overflow menu used to read "Submit for review" / "Unpublish workspace"; the landing-view card menu already used the cleaner phrasing. Both surfaces now match. The disabled "Pending review" / "Pending re-review" states stay where they were.
- **Toast on successful publish**: `Thank you for sharing your workspace.` (with the existing "We review public workspaces before they appear on Explore." follow-up as the body). Make-private also gets a brief confirmation toast.
- **Publishing now requires the workspace to compile.** New `playground/services/publish-precheck.ts` runs the workspace's code through `compilerWorker.compileWithContext` before issuing the `PUT /workspace/:id {isPublic:true}`. If the parser throws, or the compile produces no path data (empty SVG), the publish is blocked and the user sees a red toast explaining why ("Can't publish — workspace has compile errors"). Both the workspace breadcrumb and the landing-view card menu run the precheck. The API Worker can't enforce the same gate (the compiler bundle is ~9 MB, beyond the Workers size limit), so the client is the authority; the empty-code rejection in `submitWorkspaceForReview` stays as belt-and-suspenders for scripted/cURL bypasses.
- **Landing-view publish menu is feature-gated.** "Make Public" is hidden for users without `UserFeature.Publishing` (matches the breadcrumb). "Make Private" stays available unconditionally — opting out is always allowed.

#### Workspace detail page — always mini-workspace
- **`/u/:handle/:slug` now always renders the workspace as a `<mini-workspace>` embed.** Previously the page only used mini-workspace when the approval record had a pre-rendered `svg` field — legacy approvals (pre-Phase-4) fell back to a thumbnail-plus-source split view. The conditional is gone: the detail page always emits `<mini-workspace>` with the frozen `<code>` child plus the inline `<svg>` (when present) so visitors get the same interactive embed used in blog posts. mini-workspace.js is loaded unconditionally.
- **New `PUT /admin/approval/:id/svg`** (admin-only, 1 MB cap) — backfills `approval.svg` on an existing approval record.
- **Modal silently backfills `approval.svg`** for legacy approvals. When an admin opens the review modal on an Approved/Featured card and the approval lacks a pre-rendered SVG, the admin's browser compiles `approval.code`, renders the SVG, and POSTs it to `/admin/approval/:id/svg` while showing the modal. The next visit to `/u/<handle>/<slug>` for that workspace ships the live preview. Best-effort: PUT failures don't block the modal — just no backfill that round. Legacy approvals whose code no longer parses (e.g. pre-mandatory-semicolons syntax) stay code-only on the detail page until an owner updates the source.

#### Publication & Moderation (Phase 3)
- **Re-review on code drift**: `PUT /workspace/:id` on an approved workspace whose new code hash differs from `approval.codeHash` pushes a `queue:rereview` entry (idempotent on workspaceId — re-edits during re-review refresh the queue entry). No new state row is appended — the effective state stays `approved`, matching what visitors see on /explore. Workspace responses carry a separate `rereviewPending: boolean` flag (true when in the re-review queue) so the playground can render "Pending re-review" without lying about visibility state. `<app-breadcrumb>` reads `workspaceRereviewPending` and disables Unpublish during re-review.
- **Flagging endpoints**:
  - `POST /admin/flag-workspace/:id` — flips `workspace.flagged`, pushes to `queue:flagged-workspaces`, drops from public + featured, appends a `flagged` state row with internal notes. Approval record retained for restoration.
  - `DELETE /admin/flag-workspace/:id` — clears the flag and re-publishes from the approval record (restoring featured if `featuredAt` was set).
  - `POST /admin/flag-user/:id` — sets `users.flagged = 1` in D1, cascades through every approval the user owns to drop them from public + featured. Optional `internalNotes` body is stored in `users.flag_notes`.
  - `DELETE /admin/flag-user/:id` — clears the flag and restores every approval to public (and featured for `featuredAt` records), unless the workspace itself is independently flagged.
- **Listing endpoints**: `GET /admin/queue/rereview`, `GET /admin/queue/flagged-workspaces`, `GET /admin/queue/flagged-users`. All require `isAdminUser` (session) or the `?token=` fallback.
- **Admin UI**: `<admin-moderation-view>` extended with four tabs (Pending review / Re-review / Flagged workspaces / Flagged users), per-tab lazy-load on first visit, refresh button. Flagged tabs render with a single Unflag action. Approve handler now clears both the review queue and the re-review queue.
- **Workspace detail page**: SSR'd at `/u/:handle/:slug` in `website/_worker.ts`. Resolves the user by handle, scans approval records for `(userId, slug)`, then renders the frozen `approval.code` snapshot plus breadcrumb (`Explore › @handle › name`), description, thumbnail (with OG meta), and "Open in playground" link. Falls back to 404 when the approval is missing or the underlying workspace has been unpublished/flagged. Profile page (`/u/:handle`) cards now link to `/u/:handle/:slug` when a slug exists.
- **Workspace lifecycle cascades**: re-review queue is also cleared on workspace delete (alongside the Phase 2 review queue, approval, rejection, public-index and featured-list cleanup).
- **Tests**: 9 new tests in `tests/api/workspace-publication.test.ts` covering re-review queue idempotency, flag-queue helpers, `listApprovalsForUser`, the full flag-user cascade (drop + restore with featured preservation), and `findApprovalForUserAndSlug` per-user scoping. Total 24 publication tests; `MemoryD1` extended for the `users.flagged` UPDATE used by flag/unflag.
- **Profile-page defense**: `/u/:handle` stale-index check now also drops cards where `workspace.flagged === true`, even if the public-index entry somehow wasn't removed. Belt-and-suspenders against future cascade gaps.
- **Docs**: `docs/publishing.md` extended with the re-review behavior (auto-queue on edit, "Pending re-review" label, prior snapshot stays public) and the workspace detail page URL structure.

#### Publication & Moderation (Phase 2)
- Append-only state machine: `appendState` / `getEffectiveState` / `getStateHistory` over the `workspace_publication_states` D1 table (states: `unpublished`/`pending`/`approved`/`rejected`/`flagged`). The latest row for a workspace is the effective state.
- Frozen-snapshot review queue: `pushReviewQueue` / `getReviewQueueEntry` / `listReviewQueue` / `removeFromReviewQueue` in `website/api/moderation.ts`. Queue entries carry the code + hash + slug at submission time so admins approve exactly what was submitted, even if the live workspace is edited in the interim.
- Approval and rejection KV records (`approval:{id}` / `rejection:{id}`) with full audit metadata (`approvedByUserId`, `approvedAt`, `featuredAt`, `internalNotes`). Rejection notes are internal-only and never surfaced to the owner.
- Slug uniqueness per user: `pickUniqueSlugForUser` scans existing approvals and appends an `-id-prefix` suffix on collision so `/u/<handle>/<slug>` URLs always disambiguate.
- Public index: 100-entry cap, `approvedAt`-descending ordering, populated only by approvals via `publishApprovalToIndex` (legacy `addToPublicIndex` removed; `removeFromPublicIndex` kept for delete cascade).
- New API endpoints:
  - `POST /workspace/:id/submit-for-review` — owner-only, Publishing-gated; freezes a queue snapshot and appends a `pending` state row.
  - `GET /admin/queue/review` — admin-only (session or `?token=` fallback); returns frozen queue entries with owner handles resolved.
  - `POST /admin/review/:id` — admin-only; `decision: 'approve' | 'reject'`, optional `feature: bool`, optional `internalNotes`. Approve writes the snapshot to `approval:{id}`, appends `approved`, flips the workspace's `isPublic`, adds to the public index, and optionally features. Reject writes `rejection:{id}` with internal notes and appends `rejected`.
- `PUT /workspace/:id` now routes `isPublic` transitions through the moderation flow: true→false on an approved workspace appends `unpublished` and removes from the index; false→true triggers submission (queue + pending state) without flipping the workspace's public flag until approval.
- Workspace responses now include `publicationState` (derived from the latest state row). Listing, get, create, update, and submit all return it.
- `<admin-moderation-view>` SPA route at `/admin/moderation` gated by `UserFeature.AdminModeration`. Pending tab renders frozen-code cards with Approve / Reject (with internal-notes textarea) / Feature toggle. Re-review and Flagged tabs are placeholders for Phase 3.
- `docs/publishing.md` — user-facing reference covering submission, the review timeline, the 100-workspace cap, edits-after-approval behavior, and how the `/u/<handle>/<slug>` URL is constructed. Registered in `scripts/build-docs.ts` `DOC_FILES`.
- `scripts/backfill-publication-state.ts` (`npm run backfill:publication-state`): idempotent backfill that synthesizes approval records + `approved` state rows for pre-Phase-2 `isPublic:true` workspaces and rebuilds the public index. Dry-run by default; `--apply` to commit, `--remote` (with `PRODUCTION_CONFIRM=1`) to target production.
- 15 new unit tests in `tests/api/workspace-publication.test.ts` covering the state machine (append-only, latest wins, rejected→resubmitted), frozen-snapshot rule, slug uniqueness, public index cap + ordering, and approval/rejection round-trips. `MemoryD1` and `MemoryKV` helpers extended with `workspace_publication_states` and `.list()` support.

#### Phase 2 — state-aware UI + cleanup
- `workspacePublicationState` added to playground store; populated from `/workspace/:id` responses and threaded into `<app-breadcrumb>`. The Publish action now renders state-aware labels: "Submit for review" (unpublished/rejected), "Pending review" (disabled, pending), "Unpublish workspace" (approved). Owners see the same label after the API silently rejects them — preserves the silent-rejection contract.
- `seed:dev` now writes `approval:{id}` records and `approved` state rows for every seeded `isPublic:true` workspace, so a fresh dev DB is consistent with the Phase 2 flow without requiring a follow-up backfill.
- `backfill-publication-state.ts` enforces per-user slug uniqueness — pre-existing approval slugs are loaded once, in-progress writes also disambiguate against each other, and colliding entries get an `-id-prefix` suffix at synthesis time.
- `DELETE /workspace/:id` now cascades to moderation state: drops `approval:{id}` / `rejection:{id}`, removes from `queue:review`, `public:workspaces`, and `featured:workspaces`. State-history rows in D1 are retained (audit trail).

#### Publication & Moderation (Phase 1)
- New `0002_moderation.sql` D1 migration adds `users.flagged` + `users.flag_notes` columns and an append-only `workspace_publication_states` audit table (state ∈ `unpublished`/`pending`/`approved`/`rejected`/`flagged`). The state table is the source of truth for upcoming moderation workflows; Phase 1 lays the schema without writing to it yet.
- `UserFeature` enum (`Publishing`, `AdminModeration`) and server-side `computeUserFeatures` helper in `website/auth/features.ts`. `/me` and SSR (`window.__SSR_CURRENT_USER`) now carry a `features: UserFeature[]` array; clients gate UI on `hasFeature(user, UserFeature.Publishing)` instead of raw `verifiedAt` / `flagged` checks. The deny-list reason never reaches the client.
- `POST /workspace` and `PUT /workspace/:id` now reject `isPublic: true` transitions unless the caller has `UserFeature.Publishing` (verified email + not flagged + authenticated session, never an anonymous header).
- Playground gates: the "Make this workspace public" checkbox in `new-workspace-view` and the Publish menu item in `app-breadcrumb` are hidden unless the current user has the Publishing feature. Owners of an already-public workspace retain the Unpublish action regardless.
- `ADMIN_EMAILS` env-var-gated admin identity (`isAdminUser`). Admin membership is evaluated fresh from env on every request — no `is_admin` column, no DB-mediated privilege escalation vector.
- New `scripts/seed-dev-users.ts` (`npm run seed:dev`) seeds 10 mock users (admin, verified, unverified, flagged) with sample workspaces into the local dev D1 + KV. Idempotent (deletes seed-prefixed rows first), refuses to run with `PRODUCTION=1`.
- Backstop tests: `tests/auth/features.test.ts` pins the Publishing/AdminModeration deny-list rules across 11 cases (case-insensitive admin matching, multi-entry lists, pre-migration row tolerance).

## [0.8.0] - 2026-05-11 (pre-moderation)

Post-0.7.0 polish. Custom filter pipeline added with six constructors (Noise, Glow, Emboss, ElevationShadow, InnerShadow, Pixelate). Inspector population is now correct on every blog post; sitewide typography refresh; homepage and docs responsive cleanup.

### Added

#### Filters
- **`NoiseFilter()`** — five-preset (`Grain` / `Paper` / `Speckle` / `Static` / `Gradient`) custom filter with trailing-block configuration, per-property finite-number guards, deterministic seed derivation, and read-side property access for `id` / `style` / `scale` / `octaves` / `amount` / `monochrome` / `seed` / `blend` / `contrast` / `stitch`.
- **`GlowFilter()`** — outer halo or inner edge light selected via the `GlowMode` enum (`Outer` | `Inner`). Knobs: `color`, `radius`, `spread`, `opacity`.
- **`EmbossFilter()`** — `feSpecularLighting`-based bevel with named light parameters: `angle`, `elevation`, `depth`, `strength`, `shininess`, `lightColor`, `smooth`.
- **`ElevationShadowFilter()`** — Material-style three-layer depth shadow tuned by a single `elevation` knob (0–24); `color`, `direction`, `tightness` for fine control.
- **`InnerShadowFilter()`** — inset shadow (the capability native CSS `drop-shadow()` cannot express); `offsetX`, `offsetY`, `blur`, `color`, `opacity`.
- **`PixelateFilter(width, height, radius)`** — mosaic via `feFlood` + `feTile` + `feMorphology`. Positional canonical form; trailing-block form also supported.
- `BlendMode` enum — CSS blend-mode keywords as enum members (`Multiply`, `Screen`, `Overlay`, `ColorBurn`, `ColorDodge`, `HardLight`, `SoftLight`, `Darken`, `Lighten`, `Difference`, `Exclusion`, `Normal`).
- `GlowMode` enum — `Outer` and `Inner` selectors for `GlowFilter`.
- `NoiseFilterScale` enum — `Fine` / `Medium` / `Coarse` packaged as discoverable members (each evaluates to the same string value the scale write handler accepts, so the enum form and the bare-string form are equivalent).
- Filter values auto-wrap to `url(#id)` when assigned to the `filter` style property in a style block; reused via `let` binding (one `<filter>` def, many references); composable across layers via `GroupLayer` stacking.

#### Documentation
- New `docs/filters.md` reference page covering all six custom filters, the `BlendMode` and `GlowMode` enums, the per-filter primitive chains, and the auto-wrapping `filter:` style property.
- New blog series: ["Custom Filters in Pathogen: First-Class Visual Effects"](website/blog/custom-filters-pipeline.md) (Part 1) and ["The Full Filter Family: Glow, Emboss, Shadows, Pixelate"](website/blog/custom-filters-family.md) (Part 2), with 23 side-by-side parameter-sweep samples between them.

#### Compiler / CLI
- `data-layer-name="<layer>"` attribute on every layer-rendered element (path, group, **and every text sibling of a multi-text TextLayer**) in CLI mode — not just playground. Enables the blog mini-workspace inspector to toggle every element of a multi-text layer in one query (`[data-layer-name="X"]`). CLI also keeps `id` on the first sibling for backward compat with consumers that resolve cross-references by id-fragment.
- BBWP server (`src/cli.ts`) gained directory-aware import resolution (extensionless paths, 308 redirects to `<path>/` for index files, `.ts → .js` on-the-fly transpilation) so the GPU render pipeline can resolve relative imports without bundling. Closes a latent regression that broke `--render-gpu` for any sample using mesh / freeform / conic / topo gradients.
- `src/render/build-tree.ts` now forwards `useImageGradients` and `gpuGradientUrls` through to `buildDefs`. Previously dropped silently, so GPU-rendered BBWPs were emitting CLI-fallback flat-color rects for non-linear gradients.
- `scripts/compile-bbwp.ts` mw.html template now references `public/components/...` (the actual layout) instead of the broken `public/pathogen/components/...` path. Every previously generated BBWP mw.html had 404'd script tags; new BBWPs load mini-workspace + theme-toggle correctly.

#### Homepage
- Dynamic version eyebrow ("built on Pathogen v{version}") that codegens from `package.json` at build time. Aligns the displayed VS Code extension name with the published marketplace handle.

### Changed

#### Typography
- DM Serif Display headings sitewide (homepage, blog, docs) — replaces the previous mixed heading stack with a single editorial display face.

#### Docs
- Sidebar background made transparent so the page backplate (grain + halos) reads through.
- Horizontal page scroll locked; wide content (column text, tables) capped at the column width with internal scroll, so the page no longer drifts sideways on long lines.

#### Tooling
- `npm` workspaces array scoped to `packages/pathogen-language-server` only (was `packages/*`). The previous glob registered `packages/vscode-pathogen` as a workspace member with the same `"name": "pathogen-lang"` as the root, producing a duplicate-version lock-file entry that failed Cloudflare Pages' `npm ci`. The VS Code extension is now installed via `cd packages/vscode-pathogen && npm install`.

### Fixed

#### Blog mini-workspace inspector
- **Inspector panels (Layers / Palette / CSS Variables) now populate on every blog post.** Mini-workspaces read inspector data from a `<script id="pathogen-metadata">` block baked into each pre-compiled `.svg`. The block is emitted only when the CLI is invoked with `--include-metadata`, which the canonical `npm run compile:samples` script passes but the manual `npx tsx src/cli.ts …` recipe (previously documented in `website/blog/CLAUDE.md`) did not. Seven blog posts (Clifford Attractor, several gradient and text posts) shipped SVGs without metadata; all newly compiled samples now include it. `website/blog/CLAUDE.md` updated to recommend `npm run compile:samples` and warn against the hand-rolled command.
- **Toggling a multi-text TextLayer now hides every text element, not just the first.** Pre-fix, only the first sibling carried `id="<layer>"` and the inspector's `[id]` query matched one element of N. Fixed by emitting `data-layer-name` on every sibling (newly compiled SVGs) plus a sibling-walk fallback in `mini-preview.setLayerVisibility` (pre-existing SVGs whose `.pathogen` sources can't currently be re-compiled).
- **Layer-toggle handler now reaches the compiled SVG.** The post-0.7.0 sandboxed-iframe migration (commit `354c4b9`) moved the SVG into the iframe document, but `mini-workspace.ts` was still querying `preview.shadowRoot` — a path that returned `null` after the migration, so toggles silently no-op'd. New `mini-preview.setLayerVisibility(name, visible)` method forwards the toggle into the iframe document, mirroring the existing `setCssVar` pattern, with a pending-toggle buffer for events that arrive before the iframe finishes parsing.

#### Renderer
- **Serializer no longer leaks `<__text-siblings__>` into output when a multi-text TextLayer is nested inside a GroupLayer.** The synthetic wrapper was unwrapped at top-level but not in `serializeBlockChild`'s recursive path. Nested TextLayers (e.g. the Clifford Attractor `concept` group containing `labels` and `formula`) serialized with literal `<__text-siblings__>` tags that browsers treated as unknown elements, silently dropping every wrapped `<text>`. Two regression tests added in `tests/render/serialize.test.ts`.

#### Homepage
- Mobile-responsive pass: nav grid overflow fixed; six showcase tiles, three tool cards, and the latest-blog card all reflow under 768px without horizontal scroll.

### Development
- `--include-metadata` documented in `pathogen-lang --help`; behavior unchanged (still off by default — the security contract in `tests/security/compiler-emission.test.ts` forbids any `<script>` in default compiler output).
- `tests/render-snapshots.test.ts` fixtures updated to reflect the new `data-layer-name` attribute (intentional API addition; not a refactor regression).
- All ~67 blog sample SVGs across post1–post16 + post22–post23 regenerated via `npm run compile:samples -- --force`. GPU-rendered samples in post2/3/4/5/24 still error in local Puppeteer with `Waiting failed: 10000ms exceeded`; their existing committed SVGs work via the inspector's legacy fallback path.

## [0.7.0] - 2026-05-09

A platform release. Pathogen now lives at `pathogen.studio` — its own
domain, its own brand, its own two-project Cloudflare architecture
(Pages for the site, Workers for the API). The companion repo was
renamed to `pathogen-lang` to match. The `/pathogen/` URL prefix that
used to scope the SPA under `pedestal.design/pathogen/...` is gone;
URLs are now apex-relative (`pathogen.studio/`, `/workspaces`, `/blog`).
Old URLs 301 to their new locations.

### Added

#### Auth
- Passwordless email-OTP accounts via Cloudflare Email Sending + D1 (commit `d4faf4a`).
- Session cookie is `Domain=.pathogen.studio` so the same login works on `pathogen.studio` (Pages) and `api.pathogen.studio` (API Worker) without a token-auth refactor.
- SSR seeds `window.__SSR_CURRENT_USER` on every server-rendered page so the account chip renders signed-in on first paint without a client-side fetch.
- `/auth/start` rate-limit: per-email + per-IP counters in KV.
- Public profile pages (`/u/:handle`).

#### Marketing site
- Atmospheric homepage at `pathogen.studio/` — code-and-render hero, three tool cards (GitHub / CLI / VS Code), latest-blog card, six showcase tiles wired to real Pathogen-rendered SVGs from the blog samples directory.
- "Pathogen Studio" rebrand — Baumans wordmark with lavender-gradient "Studio", DM Serif Display headings, Inconsolata mono code, atmospheric grain + halos backplate. Single-CTA-per-view contract.
- Top-nav redesign with anti-shift Grid layout, glassy tab pills, Material-icons sprite for overflow menu.
- Sign-in modal + claim-anonymous-workspaces flow.

#### API Worker (`api/`)
- New Cloudflare Workers project at `api.pathogen.studio` hosting every `/api/*` endpoint (`/auth/*`, `/me`, `/u/:handle`, `/workspaces`, `/workspace/:id`, `/preferences`, `/thumbnail/*`, `/admin/*`).
- `[[send_email]]` binding declared in version-controlled `api/wrangler.toml` (Pages projects don't accept this binding — that constraint drove the split).
- Origin-allowlist CORS with credentials (`pathogen.studio`, `www.pathogen.studio`, `localhost:3000`); wildcard `*` was incompatible with credentialed cookie auth.
- GitHub Action (`.github/workflows/deploy-api.yml`) auto-deploys the Worker on `git push` when `api/`, `website/api/`, or `website/auth/` change.

#### Tooling
- `scripts/migrate-anonymous-workspaces.ts` — one-off (now committed) for re-keying workspaces from anonymous browser IDs to an authenticated user.
- `scripts/build-website.ts` codegens `playground/utils/version.ts` from `package.json` so the displayed `built on Pathogen v{version}` subtitle stays in sync with releases.
- `scripts/verify-nav-stability.ts` extended to cover the new prefix-less URLs.
- `npm run dev:stack` runs both wranglers in parallel (Pages :3000, API :8787).
- `concurrently` dev-dep for the parallel-wrangler script.

### Changed

#### Domain + URL routing
- **Site moved**: `pedestal.design/pathogen/...` → `pathogen.studio/...`. Pages custom domain attached.
- **API moved**: `pedestal.design/pathogen/api/...` → `api.pathogen.studio/...`. The Pages worker no longer serves API traffic.
- **`/pathogen/` URL prefix dropped**. URLs are now apex-relative — `pathogen.studio/workspaces`, `pathogen.studio/blog/clifford-attractor`, `pathogen.studio/docs`. The old prefix path 301-redirects to its new location for backward compatibility with bookmarks and external links.
- SPA `BASE_PATH` is now `''` (was `/pathogen`). All internal navigation, top-nav tabs, and SSR-emitted hrefs use prefix-less paths. Build output writes directly to `public/` (was `public/pathogen/`).
- SPA shell renamed to `public/spa.html` so it doesn't collide with the SSR-rendered apex (`/index.html`).
- SPA `API_BASE` defaults to `https://api.pathogen.studio` at build time; override via `PATHOGEN_API_BASE` env var for local dev. All SPA fetches use `credentials: 'include'`.
- Canonical URLs, sitemap.xml, robots.txt, schema.org JSON-LD, og:url tags all reference `https://pathogen.studio` (no `/pathogen/` prefix).

#### Cloudflare config
- Pages `wrangler.toml` shrunk: drops THUMBNAILS R2 binding (only the API Worker reads/writes thumbnails now), drops email-related env vars (live in `api/wrangler.toml` instead). Keeps WORKSPACES (KV, read-only for SSR) and USERS_DB (D1, read-only for `getSsrUser`).
- All Cloudflare bindings now version-controlled in two `wrangler.toml` files (root for Pages, `/api/wrangler.toml` for Workers). No dashboard-managed config.

#### Repo + branding
- GitHub repo renamed `svg-path-extended` → `pathogen-lang`.
- npm package renamed `svg-path-extended` → `pathogen-lang`. Verified unpublished (`npm view` returned 404 for both names) so no consumers were affected. CLI binary now exposes both `pathogen` (short, daily ergonomics) and `pathogen-lang` (full, matches package name) as aliases — the legacy `svg-path-extended` binary entry was removed.
- Browser global `window.SvgPathExtended` renamed `window.PathogenLang`. Internal-only — set via `tsup.config.ts` `globalName`; no external consumers.
- CF resource names (`svg-path-extended` Pages project, `svg-path-extended-thumbnails` R2 buckets, `svg-path-extended-users` D1 database) intentionally **kept** — those are independent identifiers and renaming would require resource recreation + data migration.
- README title updated to `pathogen-lang` with a description that names the npm package.
- Visible "built on svg-path-extended v1.0" subtitle in nav header + homepage footer changed to "built on Pathogen v{version}", with `{version}` codegenned from `package.json`.
- Default playground welcome comment ("Welcome to svg-path-extended!") updated to "Welcome to Pathogen!".

#### Compiler / language services
(Older changes since the previous CHANGELOG entry — these landed before the API split:)
- @font directive: surface fetch failures + uncover errors masked by diagnostics (commit `bff7fef`).
- Color literals: support modern CSS L4 forms (`oklch(L% C H)` etc) with source-located errors (commit `6e9a7b3`).
- Boolean operations: §2.13–2.16 fixes for shared-edge disambiguation, contour chain ordering, U-bowl notch, RW-l-50 bowl-as-disk (commits `a3d29da` through `220d0fa`).
- Various boolean-ops audit closes (Class B/C/D, O3–O6, PF-A-60).

### Fixed

- Workspace migration: 50 workspaces stranded under anonymous browser IDs after the auth migration are now re-keyable to an authenticated user via the new migration script.
- SSR-side cookie reading (`getSsrUser`): correctly extends `SsrUser` with `id` + `email` so the seeded `window.__SSR_CURRENT_USER` matches the SPA's `CurrentUser` type.
- `wrangler.toml` `[[send_email]]` block was rejected by CF Pages CI — resolved by moving the binding to the new Workers project's `wrangler.toml` (commit `bad0b93`).

### Removed

- Pedestal-Design apex landing page (`website/index.html`) — the Pages worker now SSRs the apex directly via `renderHomepage()`.
- Pages worker's `apiHandlers` + `handleApiRequest` + wildcard CORS — moved to the API Worker. The Pages worker is now SSR + static-fallback only; old `/pathogen/api/*` URLs return 410 with a hint pointing at `api.pathogen.studio`.

## [0.7.0] - 2026-04-10

### Added

#### Core
- Spread operator (`...`) and destructuring (array `[a, b, ...rest]`, object `{ x, y: alias, ...rest }`) in let declarations and for-each loops.
- Object merge (`<<`) operator for ObjectValue types.
- Multi-param trailing blocks for `.reduce()` and `.mapSlice()`.
- `squareGrid()`, `triangleGrid()`, and `hexagonGrid()` stdlib functions for grid-based pattern generation.
- `generateSvg()` exported from library — shared SVG document assembly used by CLI and VS Code preview.

#### Parser
- **Lezer migration complete** — Lezer is now the sole parser (Parsimmon fully removed). 213-line grammar replaces 1,558 lines of Parsimmon code.
- Mandatory semicolons on expression statements (function calls, assignments, let, return); block statements (for, if, fn, apply) do not require them.
- Optional trailing semicolons on text and tspan statements.
- Comments preserved in AST (top-level and block bodies) for formatter round-tripping.
- Fix: object literal property values now correctly parse function calls, method chains, and member access (previously dropped to NullLiteral).

#### Language Services
- **Leading-character completion triggers** — typing `@`, `&`, `$`, or `${` no longer dead-ends in a parse error. The completion menu now offers contextual snippets:
  - `@` / `@f` / `@font` at statement start → `@font "Name" weight;` directive and `@{ }` PathBlock snippets.
  - `@` and `&` in expression position (after `=`, `(`, `,`, etc.) → `@{ }` PathBlock and `&{ }` TextBlock.
  - `&` at statement start → `&{ }` TextBlock.
  - `$` at statement start → `let`, `PathLayer`, `TextLayer` declaration snippets.
  - `$` in expression position → `${ }` style-block snippet.
  - `$` or `${` inside a backtick template literal → `${expr}` interpolation snippet.
  - Fix: backtick interpolations were misclassified as style blocks and offered CSS property completions; now the engine distinguishes the two contexts.
- **Completion engine rewrite** — generated from TypeScript API declarations via ts-morph instead of hand-maintained static data.
  - All 12 enums with 42 members now have completions.
  - 79 stdlib/constructor completions with accurate signatures.
  - 14 type member sets (93→118 total members) including Color instance (21 members), BoundingBox, and all layer types with `apply` method.
  - Type inference: Color constructors, hex literals, `layer()`, stdlib path functions, method return types (boundingBox→BBox, get→Point, lighten→Color), assignment propagation, map/loop callback parameters, object literal properties.
- **Formatter** — AST-based code formatter implementing the Pathogen style guide.
  - Always multi-line: arrays, objects, style blocks, enums, path blocks, text blocks, apply blocks.
  - Trailing commas on collections. One item per line.
  - Function call/def wrapping (5+ args, 4+ with complex args). Method chain wrapping (3+ steps).
  - Trailing block formatting with gradient stop column alignment.
  - Comment preservation through round-trips.
  - Range formatting and on-type formatting (auto-indent after `{`).
  - Lezer fallback for formatting code with missing semicolons.
  - Preserves trailing newline at end of file.
  - Semicolons on function calls and method calls in PathCommand context.
- **Diagnostics** — contextual Lezer error messages with 20+ specific patterns. Server-side debouncing (200ms default, 500ms mid-expression). Better message for incomplete member access (`bg.` → "Expected property or method name after 'bg.'"). Map/reduce callback errors include iteration index.
- **Semantic highlighting** — constructor types, enum names/members, SVG path commands classified via semantic tokens. All classification sets derived from generated data (no hardcoded lists).
- **Code actions** — extract variable, extract function, inline variable refactoring. Missing semicolon and typo suggestion quick fixes.
- **Code lens** — reference counts above variable, function, and enum declarations.
- **Inlay hints** — expanded type inference for Color, gradients, Mask, ClipPath, method returns, StyleBlockLiteral, merge operator.

#### VS Code Extension
- **Language server activation** — the extension now activates and runs all 16 language server features from installed .vsix packages.
- **Live preview panel** — compiles Pathogen source to SVG in real-time via bundled IIFE compiler.
  - Pan/zoom with navigator minimap.
  - Layer inspector with visibility toggles, color swatches, type badges.
  - CSS variable color pickers with live recompilation.
  - Color palette showing all colors across layers.
  - Recompile button (re-roll random values) and reset button.
  - ViewBox detection from source comments.
- **TextMate grammar** — constructor keyword highlighting (LinearGradient, Color, Point, etc.), trailing block pipe-param syntax (`{|g| ...}`).
- **Snippets** — 29 total (up from 18): gradients, Color, textblock, styleblock, Point, CSSVar, viewBox, new file template.
- **Build pipeline** — `npm run build:vscode:install` builds and installs the complete .vsix with all dependencies bundled.
- **Workspace integration** — captures workspace root, task definitions, problem matcher for CLI errors.

#### Playground
- Inspector panel with stacked layers, palette, and CSS variable panels.
- Completion UX fix — error panel no longer covers completion popups (z-index override + longer debounce during member access).
- Error panel badge showing error count.
- Auto-balanced brackets and quotes — typing `(`, `[`, `{`, `"`, `'`, or `` ` `` now inserts the matching closer, so a stray opener no longer cascades into a chain of "missing token" parse errors.

#### Documentation
- Formatter style guide and 25-question formatting questionnaire.
- 10-phase VS Code developer experience roadmap.
- Deduplication audit proposal for language-services layer.
- Cross-system feature lifecycle documentation.
- Quality standard added to project CLAUDE.md.
- Grid functions blog post with interactive demos.
- Chained Bézier splines and heading/turn blog posts.
- Radial bar chart blog post.
- VS Code developer experience blog post with hero screenshot and architecture diagram.

### Fixed

#### Core
- Object literal property values dropping function calls — `{ y: randomRange(calc(...), calc(...)) }` was parsed as NullLiteral. Fixed by using `buildExpressionWithPostfix()` for property values.
- Map/reduce error messages now include iteration index and callback line number.
- Boolean XOR diagonal artifacts with arc-heavy paths.

#### VS Code Extension
- Preview panel white screen on initial open — captured editor reference before panel creation, use `preserveFocus: true`.
- CSS variable panel losing variables after color override — scan original source instead of compiled result.
- Missing transitive dependencies (semver, minimatch, brace-expansion, balanced-match, concat-map) added to build script.
- Removed non-functional preview command (re-added with working implementation).
- Language server type shim updated for all new exports.

#### Playground
- Uncommitted playground changes from prior sessions pushed to production.

### Changed

#### Development
- Lezer is sole parser — Parsimmon fully removed.
- Completion data generated from TypeScript API declarations instead of hand-maintained.
- Semantic token classification derived from generated data (TYPE_MEMBERS, ENUM_MEMBER_MAP, NAMESPACE_MEMBERS, PATH_COMMAND_HOVER) instead of hardcoded sets.
- VS Code extension CLAUDE.md updated with readiness status and development lifecycle.
- Quality standard: no placeholders in shipped code, end-to-end verification mandatory, be honest about readiness.

## [0.7.0] - 2026-03-21

### Added

#### Core
- PathBlock extensions: `drawTo(x, y)` convenience method, chamfers (symmetric, asymmetric, per-vertex corner beveling), fillets (circular arc rounding, elliptical arc rounding with optional rotation), and boolean operations (curve-preserving union, difference, intersection, xor).
- Color literals: bare hex (`#cc0000`, `#f00`, `#cc000080`, `#f008`), CSS color function literals (`rgb`, `hsl`, `oklch`, `hwb`, `lab`, `lch`, `oklab`), and percent suffix (`20%` → `0.2`) disambiguated from modulus by spacing.
- Booleans: `true`/`false` keywords as semantic subtypes of number, displaying as `"true"`/`"false"` in `log()` and template literals. Comparisons, logical ops, `has()`, `empty()`, `includes()` now return `BooleanValue`.
- Built-in enums: `Easing`, `Interpolation`, `SpreadMethod`, `GradientUnits`, `Direction`, `ConicSpread`, `InnerFill`, `TopoMethod` with dot notation access (e.g., `Easing.Smoothstep`).
- User-defined enums: `enum Name { Member, Member = value }` with auto-valued (lowercase string) and explicit typed values (string, number, angle, color, boolean).
- Font integration: `@font` directive for declarative font loading and `PathBlock.fromGlyph()` for converting text to manipulable path geometry via opentype.js.
- `TextBlock.toPathBlock()` for flattening text glyph outlines into a single PathBlock, removing font dependency at SVG render time.
- `TextBlock.toCodeSnippetBlock()` for generating syntax-highlighted code snippets as a GroupLayer with Pathogen-aware token coloring.
- `.intersects()` and `.intersectionPoints()` on PathBlock and ProjectedPath, mirroring the TextBlock intersection API.
- `heading(angle)` and `turn(delta)` for tangent context control — enables tangent-dependent functions immediately after `M` without workarounds.
- `cubicSpline`, `quadSpline`, `clippedQuadSpline` as stdlib functions (moved from userland definitions).
- `PolarVector(angle, distance)` value type with `turn()`, `scale()`, `mirror()` methods and `polarCubicBezier` stdlib function.
- Array `.map` with block syntax (`{|param| body}`) and `.slice` with inclusive end indexes and negative index support.
- `Point.offset(other)` method returning `{dx, dy}` vector for calculating component-wise displacement between points.
- `--print-logs` CLI flag to dump `log()` output to stderr and `--log-file=<path>` to write structured `LogEntry[]` as JSON.

#### Playground
- Consolidated inspector panel with stacked layers, palette, and CSS vars in a 2:3:1 flex layout.
- GroupLayer expand/collapse with chevron toggle and full-row click targets.
- Button bar in breadcrumb: Annotated/Console/Inspector as unified toggle group.
- RadialGradient interactive examples in blog post with SVG CDATA fix.
- Mobile inspector as fixed bottom drawer at 60vh.

#### Documentation
- PathBlock Extensions blog series (4 parts): introduction, parametric sampling, fillets & chamfers, boolean operations.
- Color Literals blog post with 6 interactive mini-workspace demos.
- TextBlock & Font Integration blog series (2 parts): measure-first text, glyph extraction with `PathBlock.fromGlyph()`.
- Published 6 previously unpublished doc files: textblock, color, gradients, cssvar, masks, objects.
- Font Integration section added to path-blocks.md.
- Heading/turn and chained bezier spline documentation with visual demos.
- PolarVector documentation and demo.

### Fixed

#### Core
- Boolean assembly artifacts on overlapping curved paths — replaced greedy closest-endpoint matching with Weiler-Atherton style ring traversal using original path ordering and explicit intersection links.
- Multi-subpath relative move compounding in `commandsToRelativeD` — after `z`, relative `m` deltas were computed from wrong start point, cascading holes in chained boolean operations.
- Scientific notation parsing in `parseAndTrackPathString` — numbers like `1.83e-15` from stdlib functions were split incorrectly.
- CLI tspan rendering now outputs style attributes on `<tspan>` elements.
- CLI `@font` path resolution: font paths now resolve relative to the source file, not cwd.
- opentype.js ESM loading: async initializer using dynamic `import()` with `require()` fallback for vitest compatibility.

#### Playground
- CSS 404s and CodeMirror error highlight crash.
- Inherited GPU gradient stops: resolve stops from parent for rasterized gradient types (conic, mesh, freeform, topo) since they can't use SVG `xlink:href`.
- Mini-workspace default background changed from white to transparent.
- "Open in Playground" URL length limits — replaced URL state param with localStorage.
- Navigator now walks all descendants to find paths inside `<g>` groups.

#### Deployment
- Cloudflare Pages build: downgrade `@eslint/js` from v10 to v9 to resolve peer dependency conflict with eslint 9 — blocked 13 deployments since Mar 9.

### Changed

#### Development
- TypeScript & ESLint hardening: stricter `tsconfig` options, `eslint-config-airbnb-extended`, Prettier formatting, `~50` evaluator interfaces extracted to `evaluator/types.ts`.
- Playground and website worker fully migrated from JavaScript to TypeScript.
- Test infrastructure: SVG path parser, custom Vitest matchers (`toMatchSVGPath`, `toContainSVGCommands`, `toHaveSVGCommandCount`, `toClosePath`), and `~47` weak assertions remediated across 6 test files.
- Project agents added for code review, content review, and test running.
- Blogging playbook and website guidelines reorganized; Instructional Designer/Writer added as 4th review persona.
- Text collision debugging guideline; agentic review now required before committing new features.
- Removed old `.js` utility files replaced by TypeScript migration.
- Gitignored `tests/tmp/` and `website/bbwp/` render artifacts.

## [0.7.0] - 2026-03-08

### Added

#### Core
- First-class `Color` type with OKLCH color space, harmony generation (`complement`, `triad`, `tetrad`, `analogous`, `splitComplement`), palette generation (`tints`, `shades`, `tones`), contrast utilities (`contrastRatio`, `wcagCompliant`, `accessiblePair`), and component access (`hue`, `chroma`, `lightness`, `alpha`).
- `CSSVar()` constructor for referencing CSS custom properties with `var()` output and OKLCh fallback extraction.
- CSS relative color syntax for CSSVar-backed Colors — `Color(cssvar, 'oklch(from var(--x) l c h / 0.5)')`.
- CSS `@property` declarations via `CSSVar.register()` with type, initial value, and inheritance control.
- `Color.lightDark(light, dark)` for automatic light/dark mode color switching.
- Native SVG gradient support: `LinearGradient()`, `RadialGradient()`, `ConicGradient()` constructors with trailing-block stop definitions.
- Gradient interpolation modes (`srgb`, `oklch`) and stepped interpolation via `.steps`.
- Pattern paint server: `Pattern()` constructor with embedded path drawing.
- Conic gradient `innerRadius` property for smooth center plateau effects (WebGPU-only rendering) with configurable `innerFill` (`'transparent'` default, `'center'`, or `Color(...)`).
- Conic gradient features: partial sweep (`from`/`to` angles), `direction` (`cw`/`ccw`), `spread` modes (`clamp`/`repeat`/`transparent`).
- Gradient `.inherit(newId)` for creating child gradients that reference parents via SVG `href`.
- CSS custom property (`--var`) output from gradients with OKLCh fallback extraction.
- MeshGradient with bilinear interpolation over control point grids and FreeformGradient with IDW (inverse distance weighting) for scattered color points.
- TopoGradient: topological elevation gradients with distance-based SDF interpolation. Contours defined via `g.contour(path, elevation, color)`. Supports easing modes (`linear`, `smoothstep`, `ease-in`, `ease-out`, `ease-in-out`), `baseColor`, and `oklch` interpolation.
- Laplace solver for TopoGradient (`method = 'laplace'`) — solves ∇²h = 0 via Jacobi iteration for smooth elevation fields. `iterations` property (default 200, range 1–2000).
- GroupLayer for SVG `<g>` element composition with `.append()`, max nesting depth of 10, and circular reference detection.
- Transform convenience properties (`translate-x`, `translate-y`, `translate`, `scale-x`, `scale-y`, `scale`, `rotate`) on PathLayer, GroupLayer, and TextLayer style blocks.
- First-class `Mask()` and `ClipPath()` constructors for SVG masking and clipping.
- `SVGDocumentFragment()` for injecting arbitrary SVG content (filters, markers, etc.).
- String type with `length`, `empty()`, index access, `split()`, `append()`, `prepend()`, `includes()`, and `slice()`.
- First-class `Point` type with `x`/`y` properties and geometric methods: `translate()`, `polarTranslate()`, `midpoint()`, `lerp()`, `rotate()`, `distanceTo()`, `angleTo()`.
- Objects with key-value literals, property access, `length`, `has()`, iteration, and `Object.keys()`/`values()`/`entries()`/`delete()` namespace methods.
- Path Blocks (`@{ ... }`) — reusable path data with `draw()`, `project()`, parametric sampling (`get`, `tangent`, `normal`, `partition`), transforms (`reverse`, `boundingBox`, `offset`, `mirror`, `rotateAtVertexIndex`, `scale`), properties (`length`, `vertices`, `subPathCount`, `subPathCommands`, `startPoint`, `endPoint`), and `<<` concatenation.
- `partition` `t` property and `subPath()` method on PathBlocks.
- `Cycler(array, shuffle?)` stdlib function for deterministic round-robin cycling with `.pick()` and `.length`.
- Matrix transforms (`translate`, `rotate`, `scale`) on layer contexts with `set()`/`reset()` and property access.
- Dynamic layer constructors — `PathLayer` and `TextLayer` names can be expressions.
- Universal tangent tracking for all SVG path commands.
- Line and column numbers in runtime error messages, including method calls.
- Void function call support (functions that return no value).
- Improved missing semicolon error diagnostics with targeted suggestions.
- `--render-gpu` CLI flag for headless browser GPU gradient rendering via Puppeteer.

#### Playground
- WebGPU rendering pipeline for conic gradients with WGSL fragment shader, LRU texture cache (32 entries), and Canvas 2D fallback.
- GPU gradient service with pre-rendering between compilation and DOM update, staleness re-checks, and automatic cache invalidation.
- WebGPU rendering pipelines for MeshGradient (bilinear shader) and FreeformGradient (IDW shader).
- WebGPU WGSL shader for topo gradients (ray-cast containment, SDF distance interpolation, easing, OKLab color blending) with Canvas 2D fallback.
- WebGPU compute shader pipeline for Laplace solver (init + N Jacobi iterations + render in single GPU submission) with Canvas 2D fallback using 4× downscale and bilinear upsampling.
- SVG path parser utility (`flattenToSegments`) for converting d-strings to GPU-ready line segment arrays.
- GroupLayer nesting support in layers panel with recursive visibility toggling.
- CSS custom property panel for gradients with OKLCh/CSSVar warnings.
- OKLCH color picker, palette panel, and CSS var panel for the Color system.
- Floating error panel with Copy Debug Info capture.
- Scroll padding so error panel doesn't block bottom code lines.
- Autocompletion for Cycler, PathBlock, ProjectedPath, Object types, `mpi()`, `null`, and `Object` namespace methods with `pathblock` snippet template.
- Line/column error highlighting in the code editor.
- SEO-friendly static pages with JSON-LD structured data, breadcrumbs, semantic HTML, and theme toggle component.
- Extended pan clamp to allow 1/3 viewport over-pan and panning down to 50% zoom.
- `mini-workspace` and `mini-preview` Web Components for interactive blog post embeds with code toggle.
- BBWP compilation pipeline (`npm run compile:bbwp`) for archived render artifacts with auto GPU/CPU detection.

#### Documentation
- Gradient blog series (5 posts): linear/radial, conic, mesh/freeform, topological, and pipeline infrastructure.
- Annotated TopoGradient schematics — 3 samples with side-by-side rendered gradients and contour map diagrams (paint chips, elevation labels, leader lines).
- 20 blog samples for gradient posts (post1–post4) including easing modes, method comparisons, terrain maps, crystal formations, and organic contours.
- Gradients documentation covering all gradient types, Pattern, inheritance, interpolation, `innerRadius`/`innerFill`, and rendering implementation.
- TopoGradient documentation with examples (terrain, rings, peaks, Laplace solver).
- Path Blocks documentation covering definition, drawing, projection, parametric sampling, and transforms.
- Blog post: *Reactive Color in SVG* — interactive Color system demos.
- Blog post: *SEO Pages and Cloudflare Workers Routing*.
- Single-page markdown docs for AI/LLM consumption.
- `Content-Signal` directive added to `robots.txt`.

### Fixed

#### Core
- Array trailing commas and for-in loop destructuring.
- Context-aware functions emitting absolute commands inside PathBlocks.
- XML attribute injection vulnerability in CLI SVG output.

#### Playground
- Style block syntax in layer autocomplete and TextLayer widget.
- Autosave data loss when navigating away from workspace.
- Dark mode link contrast in blog and docs views.
- Mobile scroll cutoff in blog and blog post views.
- Workspace loading failure when nano ID contains hyphens.
- Nano ID generating "undefined" in workspace IDs.
- Blog static page regressions (breadcrumb, code styling, reactive-svg).

### Changed

#### Playground
- Conic gradient rendering moved from inline Canvas 2D to GPU gradient service with WebGPU primary path and Canvas 2D fallback.
- Cmd/Ctrl+S now saves immediately instead of exporting.
- Thumbnail-updated event dispatched on workspace exit.

## [0.7.0] - 2026-02-16

### Added

#### Core
- Multi-layer support — `path` layers for SVG paths and `text` layers for text elements with template literals.
- Style blocks as first-class values with merge (`+`), property access (`.fill`), and per-element inline styles.
- Arrays and `null` as first-class data types with `len()`, `push()`, `map()`, `filter()`, `reduce()`, `join()`, index access, and spread.
- `for`/`if`/`let` control flow inside text blocks.
- Radians-based text/tspan rotation (converted to degrees at render time).

#### Playground
- Thumbnail system — R2-backed storage, crop modal, landing page thumbnails, admin backfill view, and supersampled rasterization with step-down halving.
- Layer controls panel for toggling visibility and managing multi-layer compositions.
- Inline color picker and TextLayer style editor in the code editor.
- Scoped autocompletion for function parameters and layer keywords.
- Docs sidebar with anchor navigation and scroll spy.
- Export legend improvements — snap-to-grid positioning, advanced settings with font embedding, Baumans branding, compact metadata line, content-driven width, and 128-line code limit.
- Shared SVG snapshot utility for consistent multi-layer rendering across export, thumbnails, and preview.
- Loading spinner on workspace transitions with stale SVG preview clearing.
- Admin token rotation script (`npm run website:admin-token`) with Wrangler secret + redeploy.

#### Documentation
- Layers documentation covering PathLayer, TextLayer, template literals, and style blocks.
- Style blocks and template literals documented in syntax reference.
- Arrays and null documented in syntax reference.
- Conditionals docs updated to include `else if` syntax.
- Blog post: *The SVG Serialization Trap*.

### Fixed

#### Playground
- Navigator viewport stroke vanishing on large canvases.
- Navigator blank for text-only layers (clone text elements for minimap).
- Navigator per-layer styling and viewport-fill zoom for small canvases.
- Overflow menu clipped in workspace cards.
- Empty admin thumbnails — wait for in-progress generation and validate results.
- Thumbnail worker path resolution in production.

### Changed

#### Core
- Deprecated global stroke/fill controls in favor of per-layer styling.

#### Development
- Converted all scripts from JavaScript/Bash to TypeScript with Commander CLI framework for `--help`, argument parsing, and type safety.
- Scripts now run via `tsx` instead of `node`; added `commander` as a dev dependency.
- Added `scripts/CLAUDE.md` prescribing TypeScript + Commander conventions for new scripts.
- Git hook installer (`install-git-hooks.ts`) now writes shims that invoke TypeScript source via `npx tsx`.
- Added `playground/CLAUDE.md` and `src/CLAUDE.md` with conventions and workflow guardrails; refreshed project-level CLAUDE.md for multi-layer era.

## [0.7.0] - 2026-02-09

### Added

#### Core
- `else if` conditional chains — chain as many `else if` blocks as needed between `if` and `else`.
- `pi` numeric suffix for angle literals (e.g., `0.25pi`, `2pi`) and `mpi(x)` stdlib function for multiplying expressions by pi.
- Variable reassignment support (`x = value;`) — reassign previously declared variables without `let`.
- `toFixed` number precision post-processing — available as a `compile()` option and CLI flag (`--precision`).
- Async interpreter execution via Web Worker (`src/worker.ts`) for non-blocking compilation.

#### Playground
- Export with Legend feature — modal for exporting SVG with a customizable code legend overlay.
- Light/dark theme system with visual refresh and system preference detection.
- Refresh button for recompiling programs that use random functions.
- Persist workspace preferences (canvas size, stroke, fill, grid) on change via autosave service.
- Copy workspace form workflow and increased canvas size limit.
- Toggle publish action on workspace cards.
- Async compilation via Web Worker with performance optimizations.

### Fixed

#### Playground
- Width/height input max validation in footer.
- Console log objects not expandable in console pane.

### Changed

#### Branding
- Playground rebranded to **Pathogen**.

#### Deployment
- Migrated from GitHub Pages to Cloudflare Pages; removed GitHub Actions deploy workflow.

## [0.7.0] - 2026-02-02

### Added

- `arcFromPolarOffset(angle, radius, angleOfArc)` - New context-aware function for drawing arcs where the center is at a polar offset from the current position. Guarantees continuous paths by only emitting `A` commands (never `M` or `L`). Positive `angleOfArc` draws clockwise, negative draws counter-clockwise.
- Context-aware functions documentation in `docs/stdlib.md` covering polar movement, arc functions, and tangent functions.
- Known issue ISSUE-002 documenting M command timing with context-aware functions.
#### Playground
- Autocomplete for the playground CodeMirror editor with snippets, stdlib functions, and context-aware completions.
- Save/load workspace support for `.svgx` files with File System Access API fallbacks and keyboard shortcuts.
- Refactored playground into modular Web Components with shared components, extracted styles, and state store.
- App shell + History API routing with landing, workspace, docs, preferences, and storybook views plus Cloudflare Pages deployment scaffolding.
- Blog feature in the playground with list and post views, markdown rendering, and build/new-post scripts.
- Enhanced component storybook with sidebar navigation, deep links, and interactive demos.
#### Documentation
- Documentation now generated from markdown sources via `scripts/build-docs.js`, including new getting-started/debug content and syntax updates.
- Syntax highlighting for docs using highlight.js (GitHub Dark theme).

#### Development
- Added an optional post-commit hook installer (`scripts/install-git-hooks.sh`) to remind contributors to update `CHANGELOG.md`.

### Fixed

#### Core
- `arcFromCenter` now emits `L` (lineto) instead of `M` (moveto) to reach the arc start point. This keeps paths continuous so that `Z` (closepath) closes to the original path start, not the arc start. If the current position already matches the arc start, only the `A` command is emitted.

#### Deployment
- SPA routing on Cloudflare Pages now supports direct navigation to playground routes via `_worker.js` and a base href update.

### Changed

#### Core
- `arcFromPolarOffset` uses the convention that positive `angleOfArc` is clockwise and negative is counter-clockwise, matching the visual behavior in SVG's Y-down coordinate system.

#### Deployment
- Build output moved to `public/` for Cloudflare Pages auto-detection.

#### Branding
- Page titles updated to include Pedestal Design branding.
