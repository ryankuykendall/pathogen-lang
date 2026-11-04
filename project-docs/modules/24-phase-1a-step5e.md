# Phase 1a, step 5e: modules are libraries

2026-11-04. Plan: `23-modules-are-libraries-plan.md` (approved). Step 5 ended at `d9e49d5`.

## Docs (first, as always)

**docs/modules.md** was rewritten where the old design showed. The headings are unchanged, because other pages link to them.

- **Intro:**
  - the first example starts with `module;`;
  - the workshop is now one that "makes tools", whose tools draw at your bench;
  - two new "Know these" bullets: a library starts with `module;`, and a module makes things but doesn't draw;
  - "Imports go first" now says only `module;` comes before imports in a module.
- **"Exporting":**
  - `module;` comes first, and turns on the rules for the whole file;
  - `export` works only in a module;
  - "A module doesn't draw at its top level" names what's forbidden: path commands and drawing calls (including a call to a fn that draws), layers and `apply`, text lines, `define ViewBox`, `.subscribe`, reading `ctx` or `viewbox`. It also names what's fine: values, `@font`, `log`, `assert`, and the fact that a path block keeps its commands as a value;
  - compiled by itself, a module draws nothing;
  - the demo-in-the-library text is gone, as is "export in the file you compile does nothing".
- **"Importing":** "Only modules can be imported", and what adding the line implies.
- **The keyword paragraph:** `module` is a keyword only as the `module;` line.
- **"An imported file runs on its own":** it never draws; only its exports reach your file.
- **"Imported fns draw with your pen":**
  - `marks.pathogen` has the header;
  - "an exported fn reads the box of whichever drawing calls it";
  - a new "A module has no layers to give you" passage moves here: export a style and a fn, with `inks.pathogen` and a `main.pathogen` using both, plus the two traps (define the layer first; don't call it inside your own `apply`).
- **"What you import is fixed":** `ids.pathogen` has the header, so its error moves from line 5 to line 7. The old drawing-tied paragraph is gone.
- **"Errors in other files":** the gears example has the header, so the error lines move: line 5 for `gears.pathogen`, and lines 5 and 7 for the three-file case. The missing-`;` example now names `const toothDepth = 6` in the intro's gears file (line 4, col 21).
- **"In each tool":** a module's preview is empty; the playground keeps the module rules.
- **Errors table:**
  - new rows: not a module; `module;` after other statements; `export` without `module;`; a module drawing while it loads; `define ViewBox` in a module; reading `ctx` or `viewbox` while a module loads;
  - the imports-first message allows `module;`;
  - the default-import message no longer mentions "the file's drawing";
  - the duplicate-id example's line is now 4;
  - the two layer/transform/subscription rows from 5c are removed.

**docs/syntax.md:** the keyword bullet says `from` and `module` are keywords only in their one place.

**Line numbers.** Computed by hand, then checked by the second content reviewer against the examples as shown. The word-for-word docs-example tests will confirm them once the code exists.

**Docs-example parse test.** Until the parser allows `module;` before an import, one fence fails: `parts/kit.pathogen` has `module;` then `import`. This is expected during the docs-first stage.

## Reviews

- **Content review, part 1** (intro, Exporting, Importing, "runs on its own"): approve with changes, all taken.
  - Dropped "can test it on its own" from the intro.
  - The "Know these" bullets no longer repeat each other.
  - **The forbidden list names calling a fn that draws** (`gear(…);`) and `.draw()`. That is the case a designer hits first, and the first draft left it out.
  - Text lines are separated from the allowed text blocks.
  - The allowed list explains why a path block is a value.
  - "Compiled by itself" says its `log` and `assert` still run.
  - "Only its exports reach your file".
- **Content review, part 2** (the rest): approve with changes, all taken.
  - All the line numbers checked out.
  - `inkLine` gained its two traps, an undefined layer and nested `apply`, and the passage moved to "Imported fns draw with your pen", where it fits.
  - The missing-`;` example names a line that really is line 4, col 21.
  - The error messages say "at the top of the file", since comments may come before `module;`.
  - **`export` without `module;` puts "Remove export" first.** A playground user who adds `module;` instead would lose their whole drawing.
  - **The drawing and `ctx` messages say "while it loads", not "put this in an exported fn".** The runtime guard also catches drawing inside a fn the module calls, where that advice would be wrong.
  - `define ViewBox` gets its own message.
  - **The default-import message changes in the code too** (`defaultImportError`), since a module has no drawing to import.

**You approved the docs on 2026-11-04 ("Approved").**

**One docs change after your approval, found by the word-for-word tests.** The missing-`;` example, in "Errors in other files" and in the Errors table row "The imported file has an error", now reads `Missing ';' after const declaration`. It used to read `Missing ';'`. Line and column are unchanged (line 4, col 21). The cause: the missing-`;` heuristic (`detectMissingSemicolon`) looks back to the previous `;`. In the old gears file that span started with the `// parts/gears.pathogen` comment, so the plain wording was chosen. Now `module;` ends just before `const`, so the specific wording is chosen. The code's message is the more helpful one, so the docs follow it. (In any file, a declaration that comes right after a leading comment still gets the plain wording. That quirk predates modules and is left as it is.)

## Code

### Before and after

| | Before (step 5d) | After (step 5e) |
|---|---|---|
| Which files can be imported | any `.pathogen` file | only a file that starts with `module;` (after any comments) |
| `export` in a file without `module;` | allowed; did nothing in the compiled file | an error at the `export` word |
| An imported file's top-level drawing | ran on every compile, then thrown away | an error at the line that draws |
| An imported file's layers, ViewBox, subscriptions | its own, kept in its file; using one elsewhere was 5c's error | can't be made: an error where it's made |
| `ctx` / `viewbox` at an imported file's top level | its own pen / the default box | an error at the read |
| A module compiled by itself | (no such thing) | draws nothing; its `log()` and `assert()` run |
| An exported fn | draws into the drawing that calls it | unchanged |

### What changed, piece by piece

| Piece | Where | What it does |
|---|---|---|
| `ModuleHeader` | pathogen.grammar (+ regenerated parser, keyof patch reapplied), ast.ts, ast-builder.ts | `module` is a contextual keyword through `@extend`, like `from`; `ModuleHeader[@dynamicPrecedence=1]` wins over the expression statement `module;`. `let module = 3;`, `module.x` and `{ module: 1 }` still parse as before. Below the top level the builder throws MODULE_FIRST_MESSAGE. `isModuleProgram` reads the header off the AST |
| Static rules | parser/module-check.ts | The header must come first (only comments before it); imports may follow it; `export` without a header is an error at the `export` word; in a module, a top-level path command, layer definition, `apply`, text or tspan statement is MODULE_DRAWS_MESSAGE and `define ViewBox` is MODULE_VIEWBOX_MESSAGE, underlined on the statement's first word. `parse()` throws the first one, and editors list them all through `getDiagnostics` |
| Messages | module-messages.ts | The six new rows of the docs' Errors table, word for word; IMPORTS_FIRST_MESSAGE and `defaultImportError` reworded as the docs say. `isImportedValueError` now lets the module messages through a style value's raw-text fallback, so `#{ stroke-width: ${viewbox.width}; }` in a module reports the module error, not a disallowed token |
| Only modules import | host/load-modules.ts | `isModuleSource` looks for a `ModuleHeader` at the top level (a misplaced one still counts; the compile then says where it belongs). A file without one is a `ModuleLoadError` at each import's path string, so the CLI and editors place it like the other load errors. Its own imports aren't followed |
| The seal | evaluator/index.ts, segments.ts, types.ts | `sealModuleDrawing` sets `drawingSealed` on a module's own evaluation state and `sealed` on its root path store while its top level runs, and on the compiled file's when it starts with `module;`. `recordPath` refuses to add to a sealed store, which catches path commands, drawing calls, `.draw()` and calling a fn that draws, at the calling line. `assertCanDraw` covers the layer constructor, `define` layers, `apply`, text lines, `define ViewBox` (its own message), `.subscribe`, `toCodeSnippetBlock`, `SVGDocumentFragment.insert()` and `layer('…')` lookups. `ctx` and `viewbox` reads check the state they would describe |
| What is never sealed | same | `drawingSealed` is a block-local field, so a path block has its own pen and drawing and may read its own `ctx`. A text block shares the pen of the code that makes it, so in a module its `ctx` read is the module's (an error). A fn another file calls runs in that file's state |
| 5c removed | evaluator/index.ts, module-runtime.ts, module-messages.ts | `drawingValues`, `drawingValueUse` at six sites, the export check, `DrawingValues`/`DrawingOwner`/`DRAWING_KINDS`, `exportedAt` and the two messages. `fixFile` keeps a backstop: reaching a layer, transform or subscription is MODULE_DRAWS_MESSAGE. It now runs inside the load's try, so that error is traced like any other |
| Step 3's dispatch removed | evaluator/index.ts `loadModules` | No subscription can exist in a module, so `runSubscriptionDispatch` no longer runs at the end of each module's load |
| Editors | formatter.ts, scope-analysis.ts, hover.ts, completion-data-static.ts, parser/highlight.ts, src/highlight.ts, the TextMate grammar | The formatter prints `module;` (trap T12: a missing case would delete it). Hover on the header's `module` checks the parse tree, so a variable named `module` keeps its own hover; the `import` and `export` hovers say only a module can be imported and `export` needs one. Completion offers `module` (inserts `module;`). Both highlighters class `module` as a keyword in the header only, and the TextMate grammar matches `module` only before `;` at the start of a line. `module` isn't in any hard keyword list, as `from` isn't |
| Fixtures | all-syntax.pathogen, modules/parts/gears.pathogen | The drawing showcase lost its three `export`s (a drawing program can't export). `gears.pathogen` gained the header and lost its demo drawing; it now carries `module`, `ModuleHeader` and `export` for the all-syntax coverage test |

### Decisions made while building

- **A fn that draws and also returns a value drops its drawing**, in a module as in any program (`let x = g();`). So it isn't an error in a module either: nothing is drawn.
- **Callbacks that draw** (Grid blocks, `map`, `reduce`) draw into a discarded sink in every program, so a module doing it is no error either. The seal only has to stop drawing that would otherwise reach the SVG.
- **`polarPoint` and other context-aware fns that only compute** read the module's pen, which is always at the origin because nothing can move it. They're allowed: the result is the same every time. Reading `ctx` by name is the documented error.
- **`layer('ink')` in a module gives the module message**, not "Undefined layer": a module has no layers, and `layer('ink').subscribe(…)` should say why.
- **`module;` is a keyword only at the top level.** A program that had `let module = …;` and then a bare `module;` statement later now gets MODULE_FIRST_MESSAGE. The semantics audit (the repository's programs) will show any such program; the production KV re-scan in step 7 looks for it too.

### Checks while building

- **The seal probe** (`tmp/phase1/probe-seal.ts`, real compiles through an import):
  - All 23 forbidden forms give the documented message at the right line: a path command, a call, `.draw()`, a fn that draws, drawing in for/if/switch, layers, `apply`, `layer('…')`, `.subscribe`, `define ViewBox` (also in a fn), `ctx`/`viewbox` (also in a style value, a path block's `viewbox`, a text block's `ctx`), `toCodeSnippetBlock`, `SVGDocumentFragment.insert()`.
  - All 16 allowed forms compile: path blocks (also reading their own `ctx`), text blocks, boolean ops, Marker/Mask/ClipPath/Pattern/gradient, styles, `log`/`assert`, helpers returning blocks, Cycler/Grid, `polarPoint`.
  - Callbacks that draw were compared with plain programs, and the drawing is discarded in both.
- **The advisor** reviewed the approach before the fixture migration:
  - the header goes on its own line in every fixture;
  - every changed expectation must be +1 line inside an imported file, and anything else is a behaviour change to report;
  - modules-drawing.test.ts is rewritten, not migrated;
  - probe the seal before migrating;
  - check index.ts for user hunks (none).
- **The fixture migration** was split across four agents, one group of test files each. Every changed expectation was +1 line inside an imported file, except where a fixture now follows the docs' layout (`// file`, `module;`, a blank line). Main-file positions didn't move. The agents found two things:
  - the `Missing ';'` docs mismatch (above);
  - my header hover read `.parent` one level short (the keyword token sits inside a rule node). It now walks the ancestors.
- **A run of path commands is underlined once.** `M 0 0 L 10 10` used to get one module diagnostic per command letter, since each letter is its own top-level statement in the tree.
- **Benchmark** (`tmp/phase1/bench-step5e.ts`, medians of 21, two runs):
  - member reads with files: 6.6 → 6.4 and 6.0 → 5.8 ms;
  - method calls with files: unchanged (18.6, 17.5);
  - drawing 3k circles: +8% in one run, −3% in the other, so noise;
  - every case without files: unchanged.

- **Semantics audit** vs `d9e49d5`, over the repository's 1,470 programs:
  - 1,407 unchanged, 0 changed, 4 too large as before.
  - 8 went from error to ok: the docs' example libraries and the VS Code fixture library. They start with `module;`, which the old code read as an undefined variable.
  - 51 skipped, one more than before: the docs' `parts/kit.pathogen`, whose `module;` before `import` the old parser rejects.
- **Full suite on the commit's tree alone:** 190 files, 8,247 passed.

## Code review

- **Code review: approve. No critical issues, two warnings.**
  1. *A half-typed header might get the not-a-module message.* It doesn't. Lezer's error recovery still builds a `ModuleHeader` for `module` without `;`, so the loader takes the file and the importer sees `lib.pathogen line 2, col 7: Missing ';'`. `Module;` with a capital M gets the not-a-module message, which says what to write. Both are now loader tests.
  2. *A bare `module;` statement now throws.* This was already a recorded decision. The reviewer asked about `module` as the last path argument before `;`. `M 0 0 L 1 module;`, `M 0 0 L module module;` and `M module 0;` keep it as an argument, and are now tests. The step 7 KV re-scan must look for `module;`.
  - Seal completeness, the entry points, the 5c removal and the loader: no problems found. All writes to `layers`, `layerOrder` and `viewBox`, and every `recordPath` caller, are guarded.
