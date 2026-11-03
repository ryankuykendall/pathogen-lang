# Phase 1 (modules): audit of the code today

2026-11-02. Phase 0a is complete: steps 1–5 are pushed, the last being `8cbe778` (built-in names can't be declared). Its deploy is live, and the production dry run after the deploy found nothing left to migrate. Phase 1 is the language core of the module design (`02-decision-log-v1.md` §16.4, §17):
- `import` / `export`, isolation, no cycles, freeze after load, namespace imports, defs ids and `pathogen.json`;
- it lands in the CLI and VS Code first, because those read files from disk.

This file records what the code does today. The plan built on it is `12-phase-1-plan.md`. Line numbers are as of `8cbe778`.

## 1. The corpus: `import`, `export`, `from`, `as`

`tmp/phase1/keyword-audit.ts` walked the Lezer tree of every program in the repository: 1,452 programs (blog samples, docs and blog fences, project-docs, playground templates, VS Code fixtures).

| Word | Found as | Count | Consequence |
|---|---|---|---|
| `import` | — | 0 | can be a hard keyword (`kw<>`) |
| `export` | — | 0 | can be a hard keyword |
| `as` | the existing `AsClause` keyword (`… as "name"`) | 183 | already a contextual keyword (`@extend`, grammar :234-235), so `import { a as b }` reuses it |
| `from` | a gradient property (`grad.from = 90deg`, docs/gradients.md, post2, post24) | 29 | **must stay contextual** (`@extend`, like `as`/`with`); member access is `"." Identifier` (grammar :312) |
| `from` | a variable (`let from = bar.start;` in post54 ×2, docs/stdlib.md:613, two project-docs demos) | 5 | same; `from` means something only between an import clause and its path |

Stored workspaces haven't been checked. The production export from step 5 was deleted on 2026-11-02 at the user's word, so this check needs a fresh read-only export and the user's go-ahead (decision 22).

**Update 2026-11-03 (decision 34, approved):** `tmp/phase1/scan-kv-keywords.ts` read every stored program in memory, saved no code, and counted `import`/`export` leaf tokens in any position: names, keys and members.

| Environment | Programs | Using `import` or `export` |
|---|---|---|
| Dev KV | 406 | 0 |
| Production KV (190 workspaces, 20 approvals, both review queues) | 216 | 0 |

Nothing needs migrating. The scan runs once more just before the push.

## 2. The compiler today

**Entry points are synchronous and know one source string.**
- `compile` (src/index.ts:298) and `compileWithContext` (:348) run `parse(source)` and then `evaluate` / `evaluateWithContext`. Neither takes a file path, a project folder or other files.
- `parse(input, { namingChecks })` (src/parser/index.ts:178) covers syntax errors and reserved bindings in one cursor pass (:189), then runs `buildAST` and `findConstViolation` (:254).
- `evaluate` (src/evaluator/index.ts:11764) and `evaluateWithContext` (:11869) each build their own EvaluationState literal, duplicated at :11774 and :11880. Then they run the statements, dispatch subscriptions (:11810) and call `buildCompileResult` (:11169).
- `CompileResult` (src/evaluator/types.ts:1162) holds layers, the six defs maps, cssProperties, logs, warnings, viewBox and font coverage requests.

**Phase 0b's pattern is the one to follow.** Fonts load asynchronously before a synchronous compile:
- `planFontDirectives(source)` (src/host/load-fonts.ts:92) and `resolveFonts` (:141) read through a host;
- `buildFontRegistry` hands `options.fonts` to the compile;
- the evaluator never reads files (`case 'FontDirective'` is a no-op, index.ts:10974);
- src/host/types.ts:2-3 already says the host will read imported files from phase 1 on.
- `nestedFontDirectives` (load-fonts.ts:537) rejects `@font` inside a function or block. It is the model for a top-level-only `import` check, since the grammar's `statement` rule (pathogen.grammar:24) serves the top level and blocks alike.

**Scope and drawing state (phase 0a's result).**
- `Scope` is at types.ts:1299 and `UserFunction.closure` at :1238; a fn's closure is captured at index.ts:10155.
- `callScope` (:1050) gives a call the caller's `evalState` (:1052), so the drawing context follows the call.
- `lookupVariable` (:1245) walks the scope chain, then `builtinValue` (:1264), which checks in order:
  1. `ctx`, computed from the call's origin;
  2. namespaces;
  3. `viewbox`, from the **lexical root's** state (:1288);
  4. built-in enums;
  5. the stdlib.
- `setVariable` (:1326) holds the built-in-name backstop. `declareBinding` (:1350) and `updateVariable` (:1357, the const check at :1361) do the rest.

**Nothing is immutable today.**
- The closest precedent is `ArrayValue.iterationLock` (types.ts:101, evaluator/iteration-lock.ts). It is checked at push/pop/shift/unshift (index.ts:6579-6600) and at index assignment (:10063).
- Fn and enum bindings can be reassigned, and enum members can be changed. All three of these succeed today:
  - `Dir = 5`
  - `Dir["Up"] = "zz"`
  - `f = 3`
- An enum is a plain `ObjectValue` stored with `setVariable` (:10170).
- Mutation sites a freeze would have to guard:
  - object index assignment (:10059);
  - `Object.delete` (:6324);
  - member assignment (:10526-10955 and evaluator/member-assign.ts);
  - `LayerReference.styles` (:10539);
  - Mask/ClipPath `append` (:5539-5622);
  - `Gradient.stop` (:5871);
  - the variable-offset builder's `stop` (:5429, :5440);
  - `Grid.set` / `Grid.fill` (:5661, :5699);
  - transform refs (:3086-3140);
  - **`Cycler.pick`, which advances `index` (:5479)**.
- Array `sort` and `reverse` already return copies. Spread (`[...xs]`, `{ ...o }`) and `.slice(0)` copy.

**Defs and ids.**
- Every defs constructor writes into `scope.evalState`'s maps after a duplicate check across all six. The constructors and their lines:
  - Mask :7846, ClipPath :7870;
  - gradients :7894 / :7946 / :8405-8595;
  - Pattern :8010, Marker :8062;
  - filters :8215-8382, with auto ids from `nextAutoFilterId`, :779;
  - `Gradient.inherit` :5877, `Marker.fromPathBlock` :6409.
- A duplicate throws `Duplicate defs ID '<id>'` with no line (e.g. :7862).
- `buildDefs` (src/render/build-defs.ts:83) emits **every registered def, used or not**. Derived ids are `-inner-fill`, `-inner-mask*` (:197-216) and `-ramp` / `-mask` (:880).
- References become text while a style block is evaluated (`evaluateStyleBlockLiteral`, index.ts:1949), in four ways:
  - a defs value becomes `url(#id)` (:2025-2036);
  - a bare identifier on `URL_REF_PROPERTIES` (:358) is wrapped, e.g. `marker-end: arrow` (:2128-2141);
  - a raw `url(#x)` string passes through;
  - masks and clip paths go through `.id` (:7249-7450).
- `SVGDocumentFragment` raw SVG (:7828) carries ids the defs maps never see.
- `validateCSSIdent` (sanitize.ts:32) already accepts `gears--arrowhead`.
- **The noise seed is `hashFilterId(id)`** (:772, :837): renaming a noise filter's id changes its pixels.

**Errors carry positions as text.**
- Parser errors read `Parse error at line L, column C: …`.
- Evaluator errors read `Line L, col C: …` or `Line L: …`, via `formatError` (:1176). Many evaluator errors have no position.
- These strings are **parsed back by regex** at diagnostics.ts:40-44 and :116, parser/index.ts:280 and evaluator :1010.
- `CompileWarning` (types.ts:833) and `LogEntry` (:793) have a line but no file. Nothing in `SourceLocation` (ast.ts:4) names a file.
- The CLI prefixes the entry's file name (cli.ts:833, 972, 1107).
- An error inside a fn reports the line in the fn and not the call site: `fn f(a) { return a.nope(); } … f(3)` prints `Line 1, col 18: Cannot call method 'nope' on non-array value`.

**Global state that two module evaluations in one compile would trip over.**
- `setNumberFormat` / `resetNumberFormat` are module globals (format.ts:4). `evaluate`'s `finally` (:11821) would drop `--to-fixed` for the rest of the importing program if a module ran through `evaluate()`.
- `nextCallId` / `nextRecordSeq` (segments.ts:131-132) are never reset.
- `loopDepth` (ast-builder.ts:410) is safe only while parses don't interleave.
- `coverageCache` is keyed by EvaluationState (font-namespace.ts:235). Subscriptions dispatch once per program (:11810).

**Namespace calls.**
- `ns.fn()` parses as a `MethodCallExpression`. `evaluateMethodCall` (:3067) dispatches on the receiver's type; the namespace branches are at :6207-6491.
- An `ObjectValue` receiver supports only `has` (:6517), and a missing member reads as `null` (:7566). A module namespace needs its own value type.
- A method-call statement records only a `PathWithResult` (:10202). A drawing call such as `gears.gear(12);` would lose its PathSegment unless that path is extended.

**The host and the project folder (phase 0b).**
- `FontHost.readFile(projectPath)` returns a `HostReadResult` (not-found, case-mismatch, escapes-root, folder, unreadable).
- `resolveProjectPath(written, fromFile)` (host/paths.ts:95) applies the `./ ../ /` rule; `projectDirname` is at :84.
- `pathogen.json` v1 knows only `main` (host/project.ts).
- The Node host is `createNodeFontHost` (src/node/index.ts:47), `readProjectFile` (:96, exact case, symlink walk), `findProjectRoot` (:246) and `projectEntry` (:276).
- The CLI computes the project folder only inside `loadFontsForCli` (cli.ts:826-874), and returns early when the entry has no `@font` (:832).
- **The repository root has `pathogen.json {}`**, so a fixture anywhere in the repo resolves to the repo root unless it has a nested `pathogen.json`.

**Fonts in other files.** Font planning reads only the entry's `@font`, so an imported file's `@font` would never load.

## 3. The editors and the playground today

Every editor feature works on one source string. Nothing reads another file, watches files or knows about imports.

**VS Code language server** (packages/pathogen-language-server/src/server.ts):
- `TextDocuments` with full sync (:57, :70) holds open buffers only. `workspaceFolders` isn't used.
- Every handler wraps the one document in `StringTextDocument` and calls one language-services function (:109–:454).
- Results point only into that document: the URI is `params.textDocument.uri` for definition (:185), references (:201), rename (:258) and code actions (:405). `Location` is `{ range }` with no URI (src/language-services/navigation.ts:5-7).
- Diagnostics are debounced per URI (:473-493). `validateTextDocument` (:516-536) loads fonts, then calls `getDiagnostics(doc, { fonts })`. Only the edited document is checked again, since there is no reverse-dependency index.
- There's no `didChangeWatchedFiles`, and the client has no `synchronize.fileEvents` (packages/vscode-pathogen/src/extension.ts:60-62).
- Font loading (src/fonts.ts):
  - finds the document's path with `fileURLToPath` (:86);
  - applies the root rule in `locate()` (:164-171);
  - turns an unsaved document into `'/<unsaved>'` with "save the file first" (:52, :182-185);
  - reads files **from disk only**: an import loader must prefer open buffers.

**VS Code preview** (packages/vscode-pathogen/src/):
- `preview.ts` follows the active editor (:109-115). It **ignores edits to other files** (:98-108, comment :101).
- It sends `{ uri, source, fontIds, notices, errors }` for the active document only (:189).
- The webview compiles synchronously (`webview-html.ts:664`) and **can't read files** (`localResourceRoots` is `server/` and `compiler/`, :79-82). So the extension host must resolve the import graph and send the module sources.
- The language server and the extension host each load their own copy of `pathogen-lang` (`loadPathogen`, :233-262).

**Shared language services** (src/language-services/):
- Every entry point takes one `TextDocument`, and there is no injection point.
- `analyzeScopes` (scope-analysis.ts:128-149) starts from a fresh root scope. `Declaration` (:58-67) has no file, and `DeclarationKind` (:32) has no import kind.
- Natural seam: an `import` declares its local names in the root scope (in `walkStatement`, :257+) without reading any file. Types, signatures and definition sites from the exporting file need an optional resolver, e.g. `analyzeScopes(doc, { resolveImport })`.
- Every feature calls `analyzeScopes` again, with no cache between calls.
- Hover says "Defined at line N" with no file (hover.ts:229-233). Signature help for a user fn is `name(...)` (signature-help.ts:55-66).
- Rename returns `TextEdit[]` for one document (rename.ts:57-78).
- `renameBuiltinNameFix` (code-actions.ts:86-100) renames. For an import that clashes with a built-in, the fix is `as newName`.
- `getDiagnostics` (diagnostics.ts:53-204) ends with a full synchronous `evaluate(ast, { fonts })` (:165).
  - `DiagnosticsOptions.fonts` (:25-37) is the precedent for a `modules` option.
  - So is the rule that skips font-availability errors when no fonts were passed (:183-189).
- The formatter (formatter.ts:270+, statement cases :389-404) needs `import` and `export` cases: a missing case deletes source.

**Playground.**
- `workspace-view.ts:1097` compiles `store.get('code')`, one string, through the compiler worker (compiler-worker.ts:268-310, which resolves fonts first, then src/worker.ts:49-66).
- The KV `Workspace` record (website/api/types.ts:110-125) has one `code: string`.
- `showError` (workspace-view.ts:1379-1425) **calls `getDiagnostics(doc)` again on the main thread, with no options**. An import error must therefore read the same whether or not modules were passed, and must come from the shared library.
- The precedent message for a file path is `fileFontNotice()` (playground/services/font-loader.ts:679-699). It is a warning, because a font can be skipped. An import can't be skipped, so its message is an error at the import line.
- playground/utils/scope-cache.ts:46-47 is a module-level cache keyed only by source text. That's fine in phase 1; phase 2 must key it by file and import graph.

**Syntax files.**
- A new keyword has to be added in each of these places:
  - path-args-tokenizer.ts: `KEYWORDS` :9, `CLAUSE_KEYWORDS` :38, `STATEMENT_ONLY_KEYWORDS` :46;
  - parser/highlight.ts:6;
  - src/highlight.ts:36;
  - code-snippet.ts:34;
  - completion-data-static.ts: :24, :286;
  - hover.ts:19;
  - rename.ts:23;
  - code-actions.ts:275;
  - formatter.ts:389-404;
  - symbols.ts:65-71;
  - scope-analysis.ts:259-295;
  - reserved-bindings.ts:90-96;
  - const-check.ts:38-39, :67;
  - TextMate (pathogen.tmLanguage.json:93 has `with|as`);
  - snippets (pathogen.code-snippets:90-95).
- tests/keyword-registry.test.ts:25 checks only `kw<"…">` keywords, so `@extend` words (`as`, `with`, a new `from`) escape it.

## 4. Traps (each must be handled by the plan)

| # | Trap | Where | What to do |
|---|---|---|---|
| T1 | Error positions are parsed back from message text | diagnostics.ts:40-44, :116; parser/index.ts:280; evaluator :1010 | carry file, line and column in a structured error; don't prefix file names into the strings |
| T2 | Defs follow the call | `callScope` :1052 | a def made inside an imported fn lands in the caller's maps: take the prefix from the fn's lexical module, not from `evalState` |
| T3 | `viewbox` is lexical, `ctx` follows the call | :1288 vs :1268 | inside an imported fn they'd describe different drawings unless one rule is chosen |
| T4 | Global number format | format.ts:4; `finally` :11821 | evaluate modules through an internal entry point that doesn't reset it |
| T5 | Noise seed from the id | :772, :837 | hash the id as written, not the prefixed one; prefix auto filter ids |
| T6 | `buildDefs` emits every registered def | build-defs.ts:83 | a module's defs reach the output only when the importer uses them |
| T7 | Imported `@font` never loads; CLI skips the root without `@font` | load-fonts.ts:92; cli.ts:832 | plan fonts over the whole graph; compute the project folder whenever there's an import |
| T8 | Diagnostics evaluate synchronously | diagnostics.ts:165 | pass pre-loaded modules, as with fonts |
| T9 | The playground re-runs `getDiagnostics` with no options | workspace-view.ts:1381 | the no-modules import error must be the same from `compile` and `getDiagnostics` |
| T10 | Repo root `pathogen.json {}` | repo root | import fixtures need a nested `pathogen.json` or a folder under `tmp/` |
| T11 | Method-call statements drop PathSegments | :10202 | `gears.gear(12);` must draw |
| T12 | The formatter deletes unknown statements | formatter.ts:389-404 | add `import`/`export` in the same commit as the grammar |
| T13 | The keyword-registry test skips `@extend` keywords | keyword-registry.test.ts:25 | extend it to cover `from` |
| T14 | Location and rename edits carry no URI | navigation.ts:5-7; server.ts:185/201/258/405 | add a URI (or file) to cross-file results |
| T15 | Only open documents are checked again; the preview ignores other files | server.ts:473-536; preview.ts:101 | a reverse-dependency index plus watched files |
| T16 | Never-reset counters | segments.ts:131-132 | check that ids stay unique and deterministic across module evaluations |
