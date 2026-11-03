# Phase 1a: importing names from other files

Proposed 2026-11-02. **Approved by the user on 2026-11-03: "I am aligned with your recommendations, please proceed."** Every recommendation in decisions 25–35 stands as written below.
- Builds on `11-phase-1-audit.md` (the code today) and decisions 1–24 (`02-decision-log-v1.md` §17, `05-phase-0a-audit.md` §6).
- New decisions continue the numbering at 25.

## Before and after

| Today | After phase 1a (CLI and VS Code) |
|---|---|
| One file is one program. Reusing a helper means copying it. | `import { gear, Teeth } from "./parts/gears.pathogen";` brings in names a file exports. `import * as gears from "./parts/gears.pathogen";` brings them all in under one name: `gears.gear(12);`. |
| — | `export const`, `export fn` and `export enum` mark what a file offers. The file still compiles and draws on its own, so a library can carry its own demo. |
| — | Each imported file runs in its own state. Its drawing, layers and ViewBox never reach the importer. A fn it exports draws with the caller's pen, because the drawing context follows the call (phase 0a). |
| — | Imported names and values are fixed once their file has loaded. |
| A defs id is global: two `Marker('arrowhead', …)` are a duplicate-id error. | Ids made in an imported file get the file as a prefix (`parts-gears--arrowhead`). The compiled file's own ids stay exactly as written. |
| `@font` is read only from the compiled file. | An imported file's `@font` loads too, with its paths starting from that file. |
| Errors, warnings and logs have a line, no file. | They name the file. An error inside an imported file also shows where the compiled file called it. |
| The playground: one program. | The playground is unchanged except that `import` is an error at the import line. Multi-file workspaces are phase 2. `export` compiles, so a workspace can already be written as a library. |
| VS Code: every feature sees one file. | Diagnostics, hover, go-to-definition, completion and signature help work across files. Editing a file checks the open files that import it again, and the preview re-renders. |

## What phase 1a ships, and what waits

**Ships:**
- named and namespace imports; `export`;
- isolation; a cycle is an error; freeze after load;
- defs ids;
- `@font` in imported files;
- errors, warnings and logs that name their file;
- the CLI and VS Code (the language server and the preview);
- the playground's import error.

**Waits** (decision 25):

| Item | When | Why |
|---|---|---|
| Default import of a `.pathogen` file: its drawing as a value (decision 5) | 1b, after a design round | there's no value type for "a drawing" yet. Placing it, its layers and its ViewBox all need decisions. Until then, `import gears from …` is an error that shows the `{ }` and `* as` forms |
| Renaming and find-references across files | 1b | both need an index of every file in the project folder. Until then, renaming an imported or exported name is refused with a message that says why; it never edits only half the uses |
| The preview shows the main file, with a pin toggle (decision 16) | phase 2, with the playground's version | in 1a the preview keeps following the active editor, which shows a library's demo while you edit it |
| A syntax for re-exporting | later, if needed | `export const gear = gears.gear;` already re-exports a value or a fn |

## Decisions needed (25–35)

Each has a recommendation. "Approve the recommendations" settles them all. Otherwise, change any by number.

**25. Phase 1a's scope.** CLAUDE.md treats a feature missing from the playground as shipped-incomplete. Decision 17 already ordered the phases this way: CLI and VS Code first, multi-file workspaces later. This decision asks for explicit sign-off on two things:
- the playground shows an error for `import` until phase 2;
- the four items in the table above wait.
*Recommendation: yes.*

**26. Values that change themselves, imported from another file.**

```pathogen
// colors.pathogen
export const palette = Cycler([oklch(0.6 0.2 30), oklch(0.6 0.2 250)]);

// main.pathogen
import { palette } from "./colors.pathogen";
let first = palette.pick();   // ?
```

| Option | Behavior |
|---|---|
| **(a) An error** | "palette comes from colors.pathogen, and imported values are fixed. Export a fn that makes one instead: `export fn palette() { return Cycler([…]); }`" |
| (b) Exempt | every file that imports `palette` shares one position, so picks in one file change what the next file gets |
| (c) A copy per importing file | each file gets its own position. That is hidden state, unlike any other import |

The same rule covers the builder methods called on an imported value: `Gradient.stop`, `Grid.set` / `fill`, `Mask.append`, the variable-offset `stop`, layer style changes and transform refs.
*Recommendation: (a). It is decision 24's "exported functions should be as pure as possible", applied to values.*

**27. A defs id made inside an imported fn.**

```pathogen
// parts/arrows.pathogen
export fn arrowhead() { return Marker('arrowhead', …); }

// main.pathogen
import { arrowhead } from "./parts/arrows.pathogen";
let tip = arrowhead();   // id: parts-arrows--arrowhead
```

The marker is created while main is drawing, so today's code would put it in main's id space, where it could collide with main's own `arrowhead`. *Recommendation:* the prefix comes from the file where the code is written (the fn's closure), not the file that calls it. A library's ids then never collide with yours, wherever its fns are called.

**28. `viewbox` inside an imported fn.**

`ctx` follows the call, so it describes the drawing the fn is drawing into. `viewbox` is read from the lexical root (audit T3), so as things stand it would describe the library's own drawing.

| Option | `viewbox` in an imported fn means |
|---|---|
| **(a) The caller's drawing, like `ctx`** | a helper such as `fn centerMark() { … viewbox.center … }` centers on whatever drawing calls it |
| (b) The library's own ViewBox | the library's demo frame, wherever the fn is called |

Programs in one file behave the same either way.
*Recommendation: (a). `viewbox` and `ctx` together are "the drawing you're in".*

**29. An exported fn that changes its own file's top-level `let`.**

```pathogen
// counter.pathogen
let count = 0;
export fn next() { count = count + 1; return count; }

// main.pathogen
import { next } from "./counter.pathogen";
log(next());   // error
```

Decisions 8 (freeze after load) and 24 (purity at the module boundary) make this an error. A suggested message: "count belongs to counter.pathogen, whose variables are fixed once it has loaded. Return the new value, or pass the count in: `fn next(count) { return count + 1; }`". Reading `count` is fine. Within counter.pathogen, while it loads, `next()` works as it does today.
*Recommendation: an error, as decided. This decision just confirms the consequence now that it has an example.*

**30. Fn and enum bindings inside one file.** Today these all work:
- `Dir = 5`;
- `Dir["Up"] = "zz"`, which changes an enum member;
- `f = 3`, which replaces a fn.

| Option | Behavior |
|---|---|
| **(a) Leave them for now** | the freeze already fixes imported fns and enums, so one-file programs are unchanged |
| (b) Fix them everywhere | fn and enum bindings behave like `const`, and enum members can't change. This is a breaking change: it needs its own audit, a KV check and a step of its own |

*Recommendation: (a) in 1a. Record (b) as a follow-up to propose separately.*

**31. How an error from another file reads.**

CLI:
```text
Error: parts/gears.pathogen line 12, col 5: Cannot call method 'nope' on non-array value
  called from main.pathogen line 40
```

Editors:
- The diagnostic sits on the call (or the import) in the file you're editing, and links to the line in `parts/gears.pathogen`.
- If that file is open, the error also shows at its own line.

Warnings and logs from another file carry the same file label (`[parts/gears.pathogen:12]`).
*Recommendation: yes, this layout. Errors in the compiled file keep today's text exactly.*

**32. Where imports may go.**

| Option | Rule |
|---|---|
| **(a) At the top of the file** | imports come before any other statement; comments may come first. "import must come before other statements" names the fix |
| (b) Anywhere at the top level | imports are hoisted and run first, as in JavaScript. A `log()` written above an import would then print after the imported file's logs |

*Recommendation: (a). It's easy to loosen later without breaking anything, but tightening it later would break programs.*

**33. The defaults in §17 that were never confirmed, and a few new ones.**
- **Paths:** they start with `./`, `../` or `/`, and follow docs/projects.md:
  - forward slashes;
  - exact letter case;
  - never leaving the project folder;
  - `./` is relative to the file it's written in.
- **Other specifiers:** any other form (`"gears"`, `"@handle/kit"`, `"std:…"`) is an error, which keeps those forms free for sharing and a standard library later.
- **Extension:** `.pathogen` is written out in the path. Only `.pathogen` files can be imported in phase 1; data files are phase 3.
- **Runs once:** every imported file runs once per compile, however many files import it. Its top-level drawing runs too and is then discarded.
- **`export` anywhere:** `export` is allowed in any file, and ignored in the file being compiled.
- **Imported names follow the naming rules:**
  - A built-in's name is an error, and the quick fix adds `as` (`import { line as edge } …`).
  - A name declared twice is an error.
  - Importing a name the file doesn't export lists what it does export. If the name exists but isn't exported, the message says to add `export`.
- **Prefix spelling:** the path from the project folder, with `/` turned into `-` and `.pathogen` dropped, then `--`:
  - `parts/gears.pathogen` gives `parts-gears--arrowhead`;
  - a file at the top of the project gives `gears--arrowhead`, as in decision 9.
  - The result must pass `validateCSSIdent` (`/^[A-Za-z_][A-Za-z0-9_-]*$/`), so the prefix is escaped:
    - a leading digit gets a `_` in front (`2026-poster.pathogen` gives `_2026-poster--arrowhead`);
    - any other character outside `A-Z a-z 0-9 _ -`, such as a space, a dot in a folder name or a non-ASCII letter, becomes `_` plus its hex code (`my gears.pathogen` gives `my_20gears--…`).
  - **Collisions:** two files in one compile can map to the same prefix, for example `parts-gears.pathogen` at the top and `parts/gears.pathogen`. That is an error naming both, with a hint to rename one. Ids stay stable: they never depend on which other files happen to be imported.
- **Fonts:** fonts are shared across the compile by family name. Two `.pathogen` files that both write `@font "Inter";` share one font, and that's fine. Two different *font files* loaded under the same family name (for example `./a/Inter.ttf` and `./b/Inter.ttf`) are an error that names both.

*Recommendation: confirm them all.*

**34. Checking stored workspaces for `import` / `export` used as names.** The repository has none in any position (audit §1). Stored workspaces need a read of production.
- `import` and `export` become hard keywords, like `let`, `const` and `fn`. Hard keywords already can't be object keys or members: `{ const: 1 }` is a parse error today. So `obj.import` and `{ export: 1 }` will stop parsing too, and the scan counts keys and members as well as names.
- *Proposal:* a read-only scan that reads the stored programs in memory and reports only workspace ids and line numbers. It saves no copy of anyone's code.
- It would run once after approval, and once more just before the push.
- If it finds any, they're migrated before the push, the way step 5's names were (decision 22).
*Recommendation: approve the scan, run as described.*

**35. Values tied to an imported file's drawing.** Isolation keeps a file's layers out of the importer's drawing. Freezing covers changes to values. Neither says what happens when a value that *refers to* the imported file's drawing reaches the importer:

```pathogen
// inks.pathogen
export const ink = layer('ink');

// main.pathogen
import { ink } from "./inks.pathogen";
ink.apply { M 0 0 L 10 10 }   // ?
```

Such a value can also arrive without being exported directly, for example from `export fn ink() { return inkLayer; }`. So the rule has to hold where the value is used, not only at the export.

| Value | Refers to | Recommended rule |
|---|---|---|
| Layer (`layer('ink')` made while the file loads) | that file's drawing | **an error at the use**: "ink is a layer of inks.pathogen's drawing, which stays in that file. Export a fn that draws, and call it inside your own layer." The same message comes earlier, at the `export` line, when the export itself is a layer |
| Transform reference (`ctx.transform`, `.translate` etc. captured while the file loads) | that file's transform state | the same error at the use |
| Subscription | a layer of that file's drawing | the same error at the use |
| Query results (`command`, `call`, `segment`, `subpath`, `endpoint`) | a snapshot of finalized commands | **readable, frozen**: they're data. One taken from a layer can be read but can't change that layer |
| Defs (Mask, Gradient, Pattern, Marker, Filter) and `CSSVar` | their definition | **cross when used**: the def, or the CSSVar's `@property` registration, is added to the output (step 5) |
| Functions | their file's names | **cross**: lexical closure; they draw with the caller's pen |
| Everything else (numbers, strings, points, colors, PathBlocks, TextBlocks, arrays, objects, enums) | nothing | **cross, frozen** |

A fn exported from inks.pathogen that calls `layer('ink')` *when it runs* is fine: the drawing context follows the call, so that layer belongs to the caller's drawing.
*Recommendation: the table as written.*

## Docs first

These are written before any code, then go through the content review and your approval. They're committed with the steps and pushed with the rest of phase 1a.

| Page | Change |
|---|---|
| **docs/modules.md (new, `DOC_FILES` `'modules.md': 'modules'`)** | import and export forms; what isolation means for your drawing; drawing with the caller's pen; what's fixed after load; defs ids; fonts; errors, with the full error table in the style of docs/projects.md; "In each tool" (the playground's error) |
| docs/projects.md | imports are the second kind of file a program reads; the intro, "In each tool" and the errors table point to modules.md |
| docs/syntax.md | `import`/`export` in the keyword lists (like the other keywords, they can't be object keys or members); the naming rules count an imported name as a declaration; "Built-in names" adds `as` |
| docs/cli.md | imports from a file, a folder, `-e` and stdin; errors that name a file |
| docs/markers.md, gradients.md, masks.md, filters.md | one line each: ids made in an imported file get a prefix |
| docs/fonts.md | `@font` in an imported file |

## Steps

Each step is one commit, tested on its own tree. All of phase 1a is pushed together after step 7, with your go-ahead. The docs describe the whole of it, and Pages publishes them on push.

**While phase 1a is unpushed,** main is ahead of origin by up to seven commits, and a plain `git push` would deploy half-finished modules. If a production fix is needed in that window, it is committed on top of `origin/main` and pushed by itself, with the module commits rebased after it. That happens only after asking you.

### Step 0: save the audit and this plan
`11-phase-1-audit.md` and this file. `02` stays untouched.

### Step 1: syntax
- **Grammar:**
  - `ImportDeclaration { kw<"import"> ImportClause from String ";" }`, where the clause is `{ a, b as c }`, `* as ns`, or a bare name (the default import, which is an error in 1a);
  - `ExportDeclaration { kw<"export"> (LetDeclaration | FunctionDefinition | EnumDefinition) }`;
  - `from` is `@extend`, like `as` and `with`;
  - regenerate the parser;
  - add AST nodes and ast-builder cases.
- **Static rules** in `parse()`, behind `namingChecks`, with exact positions:
  - imports and exports at the top level only (modelled on `nestedFontDirectives`);
  - imports come first (decision 32);
  - `export` goes only on `const`, `fn` or `enum`; `export let` says to use `const`;
  - imported local names go through reserved-bindings (built-in names) and the duplicate-declaration check.
- **Every keyword list** (audit §3):
  - the tokenizer (`KEYWORDS`, `STATEMENT_ONLY_KEYWORDS`), both highlighters and code-snippet;
  - completions, hover, rename's `NON_RENAMEABLE` and code-actions' `RESERVED_IDENTIFIERS`;
  - symbols and scope-analysis;
  - the TextMate grammar, the snippets, and the all-syntax fixture.
- **The formatter, in this same commit** (T12): print imports and the `export` prefix, and test the round trip.
- **Tests:** extend tests/keyword-registry.test.ts to cover `@extend` words (T13).
- **No host:** with no loaded modules, `compile` and `getDiagnostics` (with or without options) both give the same positioned error at the import (T9).

### Step 2: the module loader
- **`src/host/load-modules.ts`:**
  - `planImports(source)`: a Lezer scan of the top level;
  - `resolveModules(entry, host)`: builds the graph in dependency order and returns `{ files: Map<projectPath, source>, order }`.
- **Path rules:** reuse `resolveProjectPath` and the `HostReadResult` cases, with messages worded as in projects.md's table (`import path "../x.pathogen" leaves the project folder …`).
- **Other rules:** the specifier and extension rules (decision 33); a cycle is an error that names the chain: `main.pathogen → parts/a.pathogen → main.pathogen`.
- **Host:** the read moves to a shared `readFile`, decoded as UTF-8. The Node host takes an overlay of open buffers, so the language server and the preview see unsaved edits.
- **CLI:** compute the project folder whenever the program has an import, not only for `@font` (T7). Pass `{ modules, file }` to the compile.
- **Tests:** an in-memory host covering every path error, cycles, case mismatches and missing files; the Node host on fixtures under `tests/fixtures/modules/`, each with its own `pathogen.json` (T10).

### Step 3: evaluation (isolation, exports, namespaces, errors with files)
- **API:** `compile(source, { modules, file })` and `getDiagnostics(doc, { modules, file })`.
- **Running modules:** each module goes through an internal `evaluateModule`, which doesn't reset the global number format (T4). It has its own EvaluationState and root scope, and runs once per compile, in dependency order (T16: check that ids and record sequences stay unique and deterministic).
- **Exports:** the module root's bindings marked `export`.
- **Imports:** each becomes a fixed binding in the importer's root scope. Assigning to one gives "gear is imported from parts/gears.pathogen; imported names can't be reassigned".
- **`ModuleNamespaceValue`:**
  - handled in member access and in method calls;
  - a missing member is an error that lists the exports, not `null`;
  - `ns.Teeth.Twelve` works;
  - `ns.gear(12);` as a statement keeps its PathSegment (T11).
- **Structured errors:** an error that carries `{ file, line, column, callSite? }` (T1). Text for the compiled file stays exactly as today, so the existing regexes keep working; `file` reaches diagnostics and the CLI through the new fields. `CompileWarning` and `LogEntry` gain `file?`.
- **Tests:** tests/modules.test.ts; the docs examples first, then each error message word for word.

### Step 4: freeze after load
- **Marking:** a `frozen` flag on arrays, objects, Cyclers and builder values. When a module finishes loading, everything reachable from its root bindings is marked (the walk is safe on cycles).
- **Guards:** every mutation site in audit §2 checks the flag, as decided in 26. The message names the file and the copy (`[...xs]`, `{ ...o }`).
- **Module bindings:** the module root's bindings are fixed after load (decision 29). They get their own message, not const's.
- **Tests:** a coverage matrix of every mutation site against an imported value, plus the counter example from decision 29.

### Step 5: what crosses the boundary
- **Defs:**
  - a def belongs to the module whose code creates it, found through the closure chain (T2, decision 27), and its id is prefixed unless that module is the compiled file;
  - values carry the prefixed id;
  - a raw `url(#x)` string in a module's style block is rewritten when `x` is one of that module's defs;
  - in the compiled file, a raw `url(#arrowhead)` that matches only an imported file's def gets a hint to import the value;
  - a module's def reaches the output only when something uses it, together with the defs it refers to (gradient `href`, marker content) (T6);
  - noise is seeded from the id as written (T5); auto filter ids and derived ids are prefixed.
- **CSSVar:** a module's `@property` registrations (`cssProperties`) cross the same way, when the importer uses the CSSVar.
- **Values tied to a module's drawing** (decision 35): layers, transform references and subscriptions from another module are an error at the use, and at the `export` line when exported directly. Query results cross as frozen snapshots.
- **Fonts:** `planFontDirectives` runs over every file in the graph, with each file's paths starting from that file. A family loaded from two different files is an error.
- **Logs and warnings** from a module's top level, and from its fns, carry the file.
- **Subscriptions:** a module's subscriptions dispatch on its own drawing, at the end of its load and before the freeze.

### Step 6: the surfaces
- **CLI:**
  - errors follow decision 31; `--json` warnings and logs carry `file`;
  - `-e` and stdin resolve imports from the current folder, or from `--root`, the way `@font` does;
  - a folder plus `main` works.
- **Language services:**
  - `analyzeScopes(doc, { resolveImport })`;
  - `Location` gains `uri` (T14);
  - hover shows the export's signature and file;
  - go-to-definition opens the other file;
  - completion offers the exports inside `import { … }`, file paths inside the string, and members after `ns.`;
  - signature help uses the export's parameters;
  - renaming an imported or exported name is refused with a message (decision 25);
  - the built-in-name quick fix on an import adds `as`.
- **Language server:**
  - loads modules through the Node host plus the open-buffer overlay;
  - keeps a dependency index, so a change checks the open files that depend on it again;
  - watches `**/*.pathogen` and `pathogen.json` through `didChangeWatchedFiles` and the client's `synchronize.fileEvents` (T15).
- **Preview:** the extension host resolves the graph and sends `modules` in `update`, and the webview passes them to `compile`. It re-renders when any file in the graph changes, whether by an edit in an open buffer or on disk.
- **Playground:** check the import error in the real error panel (T9) and that `export` compiles. No UI change.

### Step 7: release checks, then the push
- **Stored workspaces:** the scan from decision 34.
- **Semantics audit** against `8cbe778`: zero diffs expected, since no existing program uses the new words.
- **`verify-phase1-surfaces.ts`:** the docs examples through the CLI, the VS Code bundle with the language server, and the playground's error.
- **VS Code:** rebuild the `.vsix` and check it installed.
- **Then:** the code review and the CHANGELOG; each commit's tree tested alone; push with your go-ahead.

## Per-step process

As in phase 0a:
1. Docs first, through the content review, and you approve them.
2. Failing tests.
3. Implement.
4. `npm run build`.
5. The step's checks.
6. The full suite.
7. Code review.
8. Commit, staging session files only.

## Amendments from the docs review (2026-11-03)

The docs are the contract (`reviews/phase-1a-docs-review.md`). Where they are more precise than the decisions above, they win:

- **Decision 31:**
  - logs read `[parts/gears.pathogen line 12] …`, extending today's `[line 1]`;
  - warnings read `parts/gears.pathogen:12:5: warning: …`;
  - an error lists one `called from <file> line N` per file boundary crossed, and one `imported from <file> line N` per import.
- **Decision 32:** `@font` and `define` count as statements; only comments may come before an import.
- **Decision 33, fonts:** fonts are shared by family **and weight**, and the clash error applies only between two files.
- **Decision 33, ids:**
  - escaping uses the Unicode code point in lowercase hex (`_20`, `_e9`);
  - one of your own ids matching an imported one is the duplicate-id error, checked when both reach the SVG.
- **Decision 26:** the freeze covers a file's private arrays and objects too. The message says "belongs to <file>, whose values are fixed once it has loaded" when the running code is in that file, and "comes from <file>, and imported values are fixed" otherwise.
- **Step 3, positions:** an evaluator error with no position that is raised **in an imported file** gets the line of the statement that raised it, so the cross-file trace always has a line. Errors in the compiled file keep today's text exactly, including today's missing positions: the docs promise it, and step 7's audit compares error text. Adding positions everywhere would be a separate follow-up with its own audit.
- **Step 3, the evaluator backstop for assigning to an imported name** (step 1's code review): the static check in const-check.ts skips a name that appears anywhere else as a parameter, loop variable or destructured name (`fn f(gear) {}`), so `gear = 5;` at the top level gets past it. When files load, the run-time binding for an import must reject assignment itself, with the same message.
- **Step 4, a namespace too** (step 3 code review): `kit.extra = 1` and `kit["extra"] = 1` on a `* as kit` namespace give today's generic "Cannot assign to property" / "Indexed assignment requires an object or array". Word them like the other imported values ("comes from kit.pathogen, and imported values are fixed").
- **Step 3, docs-example tests:** the page has four different `parts/gears.pathogen` fences (bare, "Exporting", the demo continuation, the `assert` version). Pair each `main.pathogen` with the gears fence from its own section. The `// file` comment on a fence's first line is line 1 of that file, so fixtures must include it, or the documented line numbers won't match.
- **Step 6:** Find All References lists the uses in the current file only (cross-file references are 1b). The built-in-name quick fix on an import edits the name after `as`.

## Follow-ups (recorded, not in 1a)

- **A bug found while checking examples:** `star(…)` with a string point count (`'twelve'`) draws `m 0 0 z` instead of failing.

- **1b:**
  - the default import of a drawing, after a design round;
  - renaming and find-references across files.
- **Phase 2:**
  - the preview shows main, with a pin toggle;
  - `playground/utils/scope-cache.ts` keyed by file plus import graph.
- **Only if decision 30 is (a):** fn and enum bindings fixed in every file.
- **Performance, if it's needed:** cache parsed modules across compiles in VS Code, keyed by content hash.
