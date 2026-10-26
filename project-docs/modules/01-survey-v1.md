<!-- Saved from the plan-mode session of 2026-10-22. The survey as the user reviewed it in round 1; later rounds live in 02-decision-log-v1.md. -->

# Modules, data and files for Pathogen: a survey of the state of the art (v1)

> Brainstorming draft (plan mode), 2026-10-22. This is a survey, not an implementation plan.
> (Rounds 2–5, §14–§18, and the decision log §17 are in `02-decision-log-v1.md`.)
> **Round 2 is in §14**: the decisions so far, `const` / `export const`, and how each data format becomes a value.
> **Round 3 is in §15**: the round-2 decisions, type names for `columnTypes`, SVG `querySelector`, module state after load, and the project root on disk.
> **Round 4 is in §16**: the round-3 decisions, defs ids across modules, what the preview shows, a draft phase order, type-name casing, and what is still open.
> **§17 is the decision log for rounds 1–4**, in one place.
> When plan mode ends, this file gets copied to `project-docs/modules/01-survey-v1.md`, and later rounds go beside it as new files.

## 0. Summary

**The asks are one problem.** Code modules, data import, folders, multi-file workspaces, and fonts in VS Code all come down to the same change: a Pathogen program stops being one string and becomes a set of files that a host finds and loads. Today every layer assumes one string:
- the editor store
- the KV workspace record, with its hash and revision
- the approval record
- snapshots
- `?state=` links
- the VS Code preview message
- the CLI input
- the language server
- the compiler's error positions, which have no file field

**The baseline is modern ES modules**, as you asked:
- `import { a } from "./x.pathogen";`
- `import * as x from "./x.pathogen";`
- `export` on declarations

On top of that, I'd make about a dozen deliberate changes where JavaScript's history or Pathogen's nature calls for it (§2). Examples: no `export default`, no import cycles, no computed imports, data imports typed by file extension, frozen exports, and sandboxed paths.

**Four forks decide the design.** Copying JS answers none of them:
- **A. Function scope (§3).** Named `fn`s are dynamically scoped, so an imported function would look up its own helpers in the *importing* file.
  - Dynamic scope also carries the drawing state (pen, output, `ctx`) into helper functions. Any module design has to separate "where names resolve" from "where drawing goes".
- **B. Top-level effects (§4).** Running a file draws, defines layers and the ViewBox, and registers defs under ids the user picks. All of it lands in one shared state.
- **C. Synchronous compiler (§5).** `compile()` is synchronous, and `@font` is already resolved before evaluation. Imports and data should follow that pattern: literal paths that the host loads first.
- **D. No host layer (§6).** Five places compile Pathogen, and each loads resources its own way. One shared resolver with a small host per surface is the prerequisite. Fixing fonts in VS Code would be its first use.

**My lean, for discussion:**
- Named functions become lexical for names, while the drawing context follows the call. The minimum alternative is that dynamic naming stops at the file boundary.
- Each module runs in isolation, and its drawing is available as a value.
- Code and data both come in through static imports.
- One shared resolver serves every surface.
- Local files come first, with the specifier space reserved for versioned sharing later.

---

## 1. What exists today (constraints found in the code)

### Compiler

**Entry points and options**
- `compile(source, options)` and `compileWithContext` are synchronous (src/index.ts:218, 258).
- `CompileOptions` has four fields: `toFixed`, `fonts`, `trace`, `strict`.
- There is no caching. Every compile re-parses and re-evaluates from scratch.

**`@font` is resolved before evaluation** by a static pre-scan, `resolveFontDirectives` (src/parser/font-directives.ts:27).
- It only looks at top-level directives.
- An identifier must be a top-level string `let`. Anything else gets a clear error.
- The evaluator treats `@font` as a no-op (evaluator/index.ts:10802).
- **This is the in-house precedent for static imports.**

**The only feedback channel is request → host fetches → recompile.**
- The signals are `missingGlyphs`, `fontCoverageRequests`, `FontData.partial`, and errors annotated by `annotateFontCoverage`.
- Only the playground runs this loop, and it stops after 3 + 2 passes.

**All side effects go into one shared `EvaluationState`:**
- path output (the default layer is the root accumulator)
- the pen
- layers, keyed by name
- `define ViewBox`
- defs: Mask, ClipPath, Gradient, Pattern, Marker and Filter share **one id space, with user-chosen ids** (`Marker('arrowhead', …)`)
- enums, logs, warnings, subscriptions

What happens on a clash:
- A duplicate layer name, a second ViewBox, a duplicate def id, or a redefined enum is a **hard error**.
- Redefining a `let` or `fn` **silently overwrites** the old one.

**Named `fn` has no closure.**
- The call site runs `createScope(userFn.closure ?? scope)`, passing the *caller's* scope (evaluator/index.ts:8695). This is the documented dynamic scope (docs/syntax.md § Scoping).
- Lambdas capture the scope they were defined in.
- The language services already model fn bodies **lexically** (scope-analysis.ts:168, 220). Runtime and tooling disagree today.

**Values**
- The `Value` union is large. It includes `ObjectValue` (a Map, reference semantics, mutable), mutable arrays with an iteration lock, `BooleanValue {0|1}`, PathBlock, Color, and more.
- There are no user-defined types beyond `enum`.
- JSON maps almost directly. Only booleans need converting.

**SVG and path data**
- `SVGDocumentFragment(string)` inserts sanitized SVG markup (allow-list), but it extracts no geometry.
- `parsePathDataExpanded` exists, but only as a TypeScript export (src/index.ts:157).

**Keywords**
- Reserved via `@specialize`: `let for in if else switch case default where fn return break continue enum define ViewBox layer apply text tspan calc`.
- `with` and `as` are already *contextual*.
- `from` is a gradient property (`g.from`), so it must stay contextual.
- A new statement keyword has two more homes:
  - the path-args tokenizer's `KEYWORDS`, or `M x y` swallows the next line
  - the 9 registries checked by tests/keyword-registry.test.ts

**The evaluator is not re-entrant.**
- Number formatting is a module-level global, reset in `finally`.
- The record, call and seam counters are never reset.
- `@{}` blocks build a synthetic state by hand. Any new registry has to be threaded through it.
  - Unverified, from reading the code: that synthetic state omits the font registry, so `fromGlyph` inside `@{}` may see no fonts. Worth a quick check.

**Locations have no file.** Errors, logs, warnings and `SourceLocation` carry a line and column only.

**Name resolution has an asymmetry.** A user `fn Point` or `fn polarLine` is silently ignored at call sites, because constructors and context-aware functions resolve first. Imports will make this collision more likely.

### Surfaces

**Playground**
- The store holds one `code` string.
- Compiles run in a stateless worker, and every request clones the font buffers.
- There is one EditorView, which gets a fresh EditorState per document.
- Autosave PUTs `{code, baseRev}`.
- There are no files, tabs, uploads or file pickers.
- A file-path `@font './x.ttf'` is skipped on purpose and never loaded.

**API**
- A workspace is the KV record `workspace:{id}` = `{code, contentHash, rev, …}`, with no code-size check.
- Thumbnails, snapshots and approval SVGs live in R2.
- Users, sessions, publication states and snapshot metadata live in D1.
- **Nothing on Cloudflare compiles Pathogen.** The bundle is about 9 MB, over the Workers limit, so there is no server host to build.

**Snapshots** are owner-only, with immutable files (`image.svg`, `code.pathogen`, `card.png`). They are deleted with their workspace.

**Publishing** freezes the approved version (code, hash, slug) at a permanent URL, `/u/<handle>/<slug>`.
- Any edit triggers re-review.
- Unpublishing makes the workspace private again.

**VS Code preview**
- The webview runs `PathogenLang.compile(source)` with no options. **There is no font loader at all.**
- Its CSP sets `connect-src 'none'`.
- `localResourceRoots` excludes the workspace.
- Nothing calls `vscode.workspace.fs`.

**VS Code language server**
- It handles one document per request.
- Its results carry no URIs.
- It captures `workspaceRoot` but never uses it.

**CLI**
- It reads a file, stdin, or `-e`.
- It resolves `@font` paths against the source file's directory, or cwd for stdin and `-e`, and it searches the system font folders.
- A missing font is a *warning*. In the playground it is an *error*.

**Divergence across surfaces**
- Five compile hosts: the editor worker client, the shared worker client, a main-thread fallback, the VS Code webview, and the CLI.
- Two different "is this a file path?" rules: cli.ts:760 vs font-loader.ts:767.
- Two Google Fonts fetchers.

### Requirements already on file
Source: `project-docs/domain-survey/04-synthesis/general-language-requirements.md`.

- **R2, modules and libraries (size L).**
  - About 26 domains name a library as the deliverable.
  - Modules are "the delivery vehicle for all shared kits": joints, checks and chart kits ship as libraries, not builtins, which keeps the core language small.
  - The requirement calls out loading paths for the playground, CLI and LSP ("three surfaces!").
- **R4, data import (size M, phased).**
  - Phase 1: read CSV and JSON files.
  - Phase 2: image sampling, for grid crafts, string-art portraits and mosaics.
  - Phase 3: thin format adapters written *as library modules on top of R2*: GPX, WIF (weaving), UIUC `.dat` (airfoils), FOLD (origami), star catalogs.
  - Flagship domains: personal data art, RC ribs, weaving, guest lists.
  - Import is compile-side input, a security surface separate from the output's no-remote-URL contract.
- **R11, compile-time HTTP (size M, plus a security design).**
  - Flagship domains: e-ink dashboards and personal data art.
  - It comes after R4, which supplies the parsing half.
  - It needs an explicit network policy for the playground (CORS) and the CLI.

Two more pointers:
- The wedge analysis ranks modules first, and says modules must come before kit-building.
- The VS Code roadmap's Phase 8 planned multi-file support and `@font` path resolution (`project-docs/developer-experience/vscode-dx-roadmap-v1.md:198–215`).

**Implication of R4 phase 3:** plain-text import belongs in v1. Format adapters for GPX, WIF and the rest are just libraries that parse a string, so the community can write them without the core growing a parser per format.

---

## 2. Baseline: modern ESM, plus deliberate changes

| # | Topic | ESM today | Pathogen draft | Why, and who does it this way |
|---|---|---|---|---|
| 1 | Unit | one file = one module | same | universal |
| 2 | Spelling | `import { a, b as c } from "./x.js"`, `import * as ns`, `export` | same spelling, with `.pathogen` paths | your direction, and the most widely known syntax |
| 3 | Default export | `export default` | none. A bare default import means **the file's content**: a JSON value, CSV rows, an SVG drawing, or a `.pathogen` file's drawing | default exports get renamed at every import and weaken auto-import. Rust, Go, Gleam and Elm have none. JSON modules already use the default slot for content |
| 4 | Cycles | allowed (live bindings, TDZ errors) | a compile error that names the cycle | Go, Elm, Gleam, OCaml and Typst forbid cycles. It also lets a synchronous evaluator run modules in order |
| 5 | Specifiers | URLs with extensions. Bare names resolve through `node_modules` or import maps | `./`, `../`, and `/` (project root); the full filename; forward slashes; exact case. No bare names. Schemes reserved for later | Node ESM and Deno require extensions. TypeScript 6.0 deprecated its legacy resolution modes and 7.0 removes them. Typst 0.15 banned backslashes in paths |
| 6 | Data | JSON needs `with { type: "json" }`. Text and bytes imports are still at TC39 | the type comes from the extension. `with { … }` is only for parse options | the browser rule guards against MIME confusion on the open web, which a sandboxed project doesn't have. CUE, Bun and Vite infer the type from the extension |
| 7 | Top-level effects | anything runs at import time | the module runs in its own state, and its drawing never reaches the importer (fork B) | OpenSCAD `use`, Typst `import`, Sass `@use` |
| 8 | Evaluation | async graph, top-level await | the host loads the whole graph, then one synchronous evaluation runs each module once per compile | Typst, Starlark, and Pathogen's own `@font` |
| 9 | Dynamic import | `import()` with a computed specifier | none. Static globs cover collections (`"./icons/*.svg"`) | Vite `import.meta.glob`, CUE `glob=` and Pkl `import*` are all literals |
| 10 | What crosses the boundary | read-only bindings to mutable objects | frozen values (arrays and objects locked) | Starlark freezes a module's values once it finishes loading. Pathogen already has an iteration lock |
| 11 | Scope | lexical | named fns become lexical for names, with the drawing context following the call; or dynamic naming stops at the file (fork A) | every modern language. Emacs Lisp is still migrating 14 years on. The graphics state is dynamic in every drawing API |
| 12 | Resource paths | `new URL("./x", import.meta.url)` | a path resolves against the file it is written in | Typst 0.15 added a path type to fix exactly this |
| 13 | Built-ins | globals | the stdlib stays a global prelude; `std:` is reserved for future modules | Rust and Haskell use preludes. Sass moved its globals into `sass:math` and friends, at a migration cost |
| 14 | Packages | npm ranges plus a lockfile | later: exact, immutable versions only | Typst Universe pins exact versions. Also the left-pad incident, and Deno's move to JSR |
| 15 | Ids in output | not applicable | defs ids are scoped per module | CSS Modules make names local by default |

### Before and after (illustrative, not final syntax)

**Today:** one file, with the gear code pasted in from another workspace.
```
define ViewBox(0, 0, 400, 300);
let cities = [{ name: "Oslo", x: 120, y: 40 }, …];  // typed by hand
fn tooth(angle, radius) { … }
fn gear(teeth, radius) { … tooth(a, radius) … }
for (city in cities) { circle(city.x, city.y, 3); }
gear(12, 40);
```

**With modules:** a workspace with three files.
```
// lib/gears.pathogen
fn tooth(angle, radius) { … }                 // private
export fn gear(teeth, radius) { … tooth(a, radius) … }
gear(12, 40);                                 // demo; stays inside this file

// data/cities.csv
name,x,y
Oslo,120,40

// main.pathogen
import { gear } from "./lib/gears.pathogen";
import cities from "./data/cities.csv";

define ViewBox(0, 0, 400, 300);
for (city in cities) { circle(city.x, city.y, 3); }
gear(12, 40);
```

---

## 3. Fork A: function scope across files

**The problem:**
```
// lib/gears.pathogen
let TOOTH_DEPTH = 6;
export fn gear(teeth, r) { … calc(r + TOOTH_DEPTH) … }

// main.pathogen
import { gear } from "./lib/gears.pathogen";
gear(12, 40);  // today's rule looks TOOTH_DEPTH up in main → error,
               // or, worse, silently uses main's own TOOTH_DEPTH
```

**What others do**
- Every mainstream language today is lexically scoped.
- Dynamic scope survives only as an explicit opt-in:
  - Common Lisp special variables
  - Racket `parameterize`
  - React context
  - OpenSCAD's `$`-variables, where `$fn` resolution flows to callees. This is the closest maker-tool precedent.
- **Emacs Lisp** is the cautionary tale:
  - Lexical binding arrived in Emacs 24 (2012).
  - The byte compiler started warning in Emacs 28.
  - A 2021 plan targets Emacs 32 for making it the default.
  - Every file written in the meantime depends on the old rule. Pathogen will never again be this cheap to change.
- Pathogen's own tooling already treats fn bodies lexically, so hover and go-to-definition can point at a different binding than the runtime uses.

### What dynamic scope is doing today (checked in the code)

Scope and drawing are coupled: **the drawing state travels on the scope chain.**
- `createScope(parent)` copies the parent's `evalState`, which holds the pen, the output, and the active layer (evaluator/index.ts:1001).
- `@{}` blocks give their block scope their own `evalState` and rebind `ctx` in it (evaluator/index.ts:2482–2488).
- A named fn's scope descends from the *caller's* scope (evaluator/index.ts:8695).

So a helper like `fn tick() { l 5 0 }` or `fn mark() { L calc(ctx.position.x + 5) 0 }`, called inside `@{}` or `layer().apply {}`, draws with that block's pen and `ctx`. That works today *because* of dynamic scope.

There is a corollary, from reading only and not yet tested: a lambda takes its `evalState` from where it was defined. So a top-level lambda called inside `@{}` probably tracks the root pen and `ctx`, not the block's. Worth a test.

**What this means for modules:** whichever option is chosen, "where names resolve" has to be separated from "where drawing goes". The drawing context (pen, output, active layer, `ctx`) should follow the call, as the graphics state does in PostScript, Canvas 2D and Processing. Without that split:
- an imported fn would draw into its own module's state (under isolation)
- or a lexical fn would draw into the root state

### Options
All three below assume the split. Only name lookup differs.

1. **Lexical names, dynamic drawing.** A named fn sees the variables where it is written, exactly like a lambda. Pen, output and `ctx` come from the call site.
   - One naming rule for fns and lambdas, and it matches the tooling.
   - It also fixes the lambda-in-`@{}` case.
   - It breaks only functions that read a caller's *local variables* (the documented `amt` example). Helpers that use `ctx` and the pen keep working.
   - It needs an audit of samples, blog posts and saved workspaces first. The style-opener KV migration is the precedent.
   - During the transition, a warning would flag every free name that resolves differently under the two rules.
2. **Dynamic names within a file, lexical across files, dynamic drawing.** Within one file nothing changes. A fn called from another file resolves its free names in its own file's top level.
   - Nothing breaks.
   - It leaves two naming rules plus a boundary rule.
3. **Keep dynamic names across files.** Every library helper would have to be exported, and imported by every caller. Not workable.

If ambient settings beyond the drawing context are wanted (like OpenSCAD's `$fn`), the modern form is a separate, named mechanism, not a property of all functions.

---

## 4. Fork B: what running an imported file does

**Today:** a file's top level draws into the default layer, moves the pen, defines layers and the ViewBox, registers defs by id, and logs. If that ran inside the importer's state:
- duplicate layer names, a second ViewBox, or two `Marker('arrow', …)` would be hard errors
- drawing and `let` overwrites would happen silently

### How others split "use the definitions" from "run the file"

| Language | Definitions only | Run or paste in place | Notes |
|---|---|---|---|
| OpenSCAD | `use <lib.scad>` imports modules and functions. Top-level geometry doesn't run, and top-level variables aren't visible | `include <lib.scad>` acts as if the file were pasted in | no namespaces, so libraries prefix their names (BOSL2) |
| Typst | `#import "lib.typ": a, b` evaluates the file without placing its content | `#include "ch.typ"` places the content as a value. Scope is *not* shared: an included file must do its own imports | a `set` rule only affects content produced in its own file |
| Sass | `@use "lib"` is namespaced and loaded once. Members starting with `-` or `_` are private. `@forward` re-exports | `@import` is global and textual, and duplicates CSS | `@import` was deprecated in Dart Sass 1.80 (Oct 2024). Removal comes in 3.0, at least two years later. The global built-ins moved into `sass:math`, `sass:map`, and the rest |
| Asymptote (vector graphics) | `access m;` (qualified), `from m access a, b;` | `include "f";` (textual) | `import m;` = `access m; unravel m;` |
| C / C++ | — | `#include` | C++20 modules are still rolling out. Textual inclusion is very hard to undo |
| Python | — | — | `if __name__ == "__main__":` keeps a demo out of imports |

### Options for Pathogen

1. **Isolation.** Each module evaluates in its own state, with its own pen, layers, ViewBox and defs. Its logs are tagged with the file name.
   - Named imports take its exports.
   - `import logo from "./logo.pathogen"` takes its drawing as a value you can place.
   - A library can carry its own demo.
   - The cost: the evaluator must become re-entrant (§1), and a "drawing value" type is needed. Does `GroupLayer` or PathBlock cover it?
2. **Definitions only.** An imported file may contain only `import`, `export`, `let`, `fn` and `enum`, plus defs constructors. Any drawing, layer or ViewBox is a compile error that says how to fix it.
   - This is the simplest option.
   - It can be relaxed into option 1 later without breaking anyone.
3. **Include, with shared state.** This works like OpenSCAD `include`, C, or Sass `@import`. Every language that started here has moved away from it.

### Defs ids
- Mask, ClipPath, Gradient, Pattern, Marker and Filter share one id space, and the user picks the ids. Two libraries that each create `Marker('arrowhead', …)` will collide.
- CSS hit the same problem with class names. CSS Modules made names local by default (hashed per file), with an explicit `:global` escape hatch.
- Options for Pathogen:
  - Automatically prefix the ids of non-entry modules, and rewrite the references the compiler knows about (`marker-end: arrow`, `.id`). A raw `url(#…)` string stays local to its module.
  - Or deduplicate identical defs and make conflicting ones an error.
- The hard case is a raw-string reference that crosses files.

### Document-level settings under isolation
- `define ViewBox`, `define default PathLayer`, and layer styles belong to the file that defines them.
- The entry file's settings define the output.
- An imported drawing carries its own viewBox, which is useful for placing it.

---

## 5. Fork C: static imports for a synchronous compiler

Pathogen already made this choice once. `@font` paths are resolved statically before evaluation, so the host loads the bytes first and the evaluator never waits. Import declarations fit the same mould if their paths are top-level literals.

| Approach | Who | Strength | Cost |
|---|---|---|---|
| Static declarations with literal paths | ESM; Starlark `load()`; Observable Framework `FileAttachment("…")` (must be a literal); Vite `import.meta.glob`; CUE `@embed(file=…)` / `glob=` (v0.12+, files inside the module only); Zig `@embedFile`; Rust `include_str!`; Go `//go:embed` | the host sees the whole graph before running anything; tooling can type the data; works with a synchronous evaluator | paths can't be computed |
| Loader functions that take any path | Typst `json()` / `csv()` / `read()`; Processing `loadTable`; Terraform `file()`; Pkl `read()`; Jsonnet `importstr` | flexible | an async host must pause or restart the compile, and tools can't see the data until the program runs |
| Async loading in user code | p5.js 2.0 (2025) removed `preload()`; every `load…` call returns a promise you `await` inside `async setup()` | honest about how the web works | async spreads into every sketch, and sequential `await`s slow loading |
| Hash-pinned remote imports | Dhall (`sha256:`), Roc's hashed URLs, Deno lockfiles, Nix flakes | reproducible remote code | registry needs (versions, deduplication) show up later. Deno launched the JSR registry for this reason |

Two lessons that bite late:
- **Relative paths inside libraries.** In Typst, `read("data.json")` resolved against the file that *calls* `read`, so a package function given a user's path read the wrong file. Typst 0.15 (June 2026) added a path type that resolves where it is written. Pathogen should decide on day one that **a path resolves against the file it is written in**.
- **JS took years to get data imports.** JSON modules and import attributes reached the standard in ES2025, after `assert` was renamed to `with`. Text and bytes imports are still at TC39 in 2026:
  - import-bytes is at Stage 2.7 (Feb 2026 draft).
  - import-text was reported at Stage 3 in March 2026, though its May draft is still labelled Stage 2.
  - Deno's text and bytes imports still need `--unstable-raw-imports`.
  - Building data into the module system from the start avoids all of this.

**The shape I'd recommend**
- Static `import` for both code and data.
- The type comes from the file extension.
- `with { … }` carries parse options.
- Static globs handle collections.
- No computed paths in v1.
- Computed paths could come later through the existing request → fetch → recompile loop. But its 3 + 2 pass cap is too low for discovering a graph one hop at a time.

---

## 6. Fork D: one resolver, many hosts (and the VS Code font gap)

**Today** there are five compile hosts and three font behaviors:

| Surface | Fonts | When a font is missing | File-path `@font` |
|---|---|---|---|
| CLI | local files plus system font folders | warning | loaded |
| Playground | Google Fonts | error | silently ignored |
| VS Code | nothing | — | nothing |

On top of that, there are two different rules for detecting a file path.

### Precedents
- **Typst's `World` interface** has methods such as `source(id)`, `file(id)`, `font(i)` and `today()`. The CLI, the web app and the language server each implement it, and the compiler never touches a filesystem. The host fetches and caches packages.
- **TypeScript's `CompilerHost` / `LanguageServiceHost`** apply the same idea to tooling, including unsaved editor buffers that override what is on disk.
- **Roc platforms**: the language is pure, and the host provides every effect.

### Sketch for Pathogen
```ts
interface PathogenHost {
  resolve(specifier: string, fromFile: FileId): FileId;  // pure path rules, shared by all surfaces
  read(file: FileId): Promise<Uint8Array | string>;      // one implementation per surface
  fonts: FontSource;                                     // Google, local, or bundled
}
```
- A shared loader in `src/` walks the imports and `@font` directives and calls the host for each one.
- It parses the data files.
- It then hands `compile` a ready-made file map, so the evaluator stays synchronous.

### The VS Code fix as its first use
- The extension runs in Node, so it can:
  - read files through `vscode.workspace.fs`. This works for remote and virtual workspaces too, and can overlay unsaved editors.
  - fetch Google Fonts with Node's `fetch`
  - post the buffers into the webview
- That sidesteps both `connect-src 'none'` and the `localResourceRoots` limit.
- The playground's coverage loop can be reused as is.
- It should respect VS Code Workspace Trust: no network fetches in a restricted folder.

### Tooling
The language services need a project model:
- results carry a file URI
- errors, logs and warnings carry a file
- go-to-definition, rename and references cross files
- completion lists another file's exports
- import paths autocomplete

---

## 7. The general design axes (reference)

### 7.1 What is a module?
- **File = module:** JS, Python, Gleam, Typst, Zig, Lua, Nix, Jsonnet.
- **Directory = package:** Go, Odin.
- **Declared tree:** Rust (`mod`), OCaml (`.ml` plus a `.mli` signature).

→ **File = module.**

### 7.2 How are things exported?
- An `export` keyword: JS.
- `pub`: Rust, Gleam, Zig.
- Capitalized names: Go.
- A leading underscore: Python by convention, Dart enforced, Sass `-` / `_`.
- Export lists: Haskell, Elm `exposing`, OCaml `.mli`.
- Everything is public: Typst.

→ **`export` on declarations** (`export fn`, `export let`, `export enum`), plus `export { a as b };` lists. Anything not exported is private.

### 7.3 How are things imported?
- **Named:** `{ a, b as c }`.
- **Namespace:** `* as m`. Go, Gleam and Zig are qualified by default.
- **Default:** JS.
- **Glob:** `from m import *`, `use m::*`, Typst `: *`. Globs make readers guess where a name came from.

→ **Named and namespace imports, and no globbing into scope.**
- Importing a name that shadows a built-in should be an error, given today's silent constructor shadowing (§1).

### 7.4 How are modules named?
- Relative paths: every system.
- Root-relative paths: Typst's leading `/`.
- **Bare names resolved by a package manager** (Node `node_modules`, Python `sys.path`): the source of most JS and Python pain.
- URLs: Deno, browsers, Dhall, Roc.
- Schemes: `node:`, `jsr:`, `npm:`, `sass:math`, Typst `@preview/cetz:0.3.1`, Pkl `package://`, Odin `core:`, Strudel `github:`.
- Import maps: browsers, Deno, Node `#imports`.
- **Module paths instead of strings:** Rust, Gleam, and WESL. WESL (2025–26) adds `import package::colors::chartreuse;` to WGSL, and its linker includes only the modules that are actually reached.
  - Strings suit Pathogen better, because data files need real filenames anyway.

→ **Paths only in v1.** Reserve `std:` and one remote form.

### 7.5 How are modules evaluated?
- **Once per program:** JS, Python.
- **Cycles:**
  - JS and Python allow them, at the risk of half-initialized modules.
  - Rust allows them within a crate.
  - Go, Elm, Gleam, OCaml and Typst forbid them.
- **Laziness:**
  - Python 3.15 adds explicit `lazy import` (PEP 810, accepted Nov 2025).
  - TC39 `import defer` is still in progress.
  - Both are performance features for huge apps, and not needed here.

→ **Once per compile, no cycles, eager.**

### 7.6 What crosses the boundary?
- ESM bindings are read-only, but the objects behind them stay mutable.
- Starlark freezes everything a module exports once the module finishes loading.

→ **Freeze exports.**

### 7.7 Versions and distribution
- **npm:** semver ranges plus a lockfile. Unpublishing has been restricted since left-pad (2016).
- **Go:** minimal version selection, a checksum database, and a module proxy.
- **Elm:** the package tool enforces semver by diffing the API.
- **Typst Universe:** exact versions only, and immutable.
- **Deno:** URL imports led to the JSR registry (2024).
- **Observable:** cells import from another notebook, pinned or latest.

→ **Later. Exact pins, and a published version never disappears from under the files that import it.**

### 7.8 Tooling that depends on the design
- **Auto-import.** Needs named exports.
- **Path completion.**
- **Cross-file navigation:** go-to-definition, rename, and "update imports when a file moves".
- **Import hygiene:** unused-import diagnostics and organize-imports.
- **Typed data.** TypeScript's `resolveJsonModule` infers a JSON file's shape from its contents.

---

## 8. JS/TS growing pains → rules for Pathogen

1. **Two module systems.** CommonJS and ESM coexisted for a decade. `require(esm)` was only unflagged in Node 22.12 and 20.19 (2024–25).
   → One system from day one.
2. **`export default`.** It gets renamed at every import, makes auto-import worse, and causes CJS-interop `.default` bugs.
   → No default exports.
3. **Ambiguous specifiers.** Extensionless paths, `index.js`, many extensions, and `package.json` `exports`/`type` led to probing, ambiguity, and browser mismatches.
   → Full filenames, one source extension, no directory magic.
4. **Resolution modes.** TypeScript accumulated classic, node10, node16, nodenext and bundler, plus `baseUrl`/`paths`. TS 6.0 (March 2026) deprecated the legacy ones, and 7.0 removes them.
   → One resolution algorithm, written down once, shared by every surface.
5. **Syntax churn.** Import assertions shipped, then were renamed to attributes (`assert` → `with`).
   → Settle the keywords before release, and keep one extension point (`with { … }`).
6. **Cycles.** Cycles plus live bindings produce TDZ errors at runtime.
   → Forbid cycles.
7. **Import-time side effects.** Polyfills and registration forced bundlers to add `sideEffects` flags.
   → A module's top level can't affect the importer (fork B).
8. **Locating resources.** `__dirname` gave way to `import.meta.url`.
   → A path resolves against the file it is written in.
9. **Bare specifiers.** Their meaning depends on the `node_modules` layout (phantom dependencies, hoisting).
   → No ambient search paths.
10. **Unversioned URL imports.** Deno's early URL imports had no versions, so they led to duplicates, availability problems, and no semver. JSR followed.
    → Remote code only by immutable version.
11. **Late data imports.** JSON modules took years, and text/bytes imports are still pending.
    → Data imports in v1.
12. **Barrel files.** Index files that re-export everything hurt load time and create cycles.
    → Re-exports are allowed but explicit. No `export *` in v1.
13. **Contextual keywords.** JS kept `from`, `as` and `of` contextual so existing variable names wouldn't break.
    → `from`, `as` and `with` stay contextual. `import` and `export` become reserved after an audit.

---

## 9. Data formats

| Format | Produces | Precedents | Gotchas |
|---|---|---|---|
| JSON | objects, arrays, numbers, strings, booleans, null | everyone | booleans must become `BooleanValue` |
| CSV / TSV | an array of row objects (from the header row) | d3-dsv with `autoType`; Observable `.csv({typed: true})`; Processing `loadTable(…, "header")`; Vega-Lite `format.parse` | quotes and newlines inside fields; Excel's BOM; `;` delimiters and decimal commas; type inference (the ZIP "02134" becomes a number) |
| SVG | a drawing value: paths as PathBlocks, plus ids, groups, and the viewBox | OpenSCAD `import("x.svg")` (outlines only); Processing `loadShape`; Paper.js `importSVG`; Maker.js `importer.fromSVGPathData`; vpype `read`; Cuttle's "Import SVG" | transforms; units and dpi; Y-up vs Y-down (Maker.js); strokes vs fills; text; untrusted markup (an allow-list sanitizer already exists) |
| GeoJSON / TopoJSON | features with coordinates, turned into paths through a projection | d3-geo, Vega-Lite, mapshaper | needs map projections. The domain survey made real-world GIS a non-goal; fantasy maps are planar |
| Plain text | a string | Typst `read`, Jsonnet `importstr`, Dhall `as Text` | UTF-8 only |
| Images | an `<image>`, or pixels to sample (heightmaps) | Typst `image`, OpenSCAD `surface()` | size; privacy |
| Fonts | already handled by `@font` | — | maybe unify later |
| DXF | geometry (import) | OpenSCAD `import("x.dxf", layer=…)` | a large spec. Export was the domain survey's priority |

**Typed tooling**
- TypeScript infers a JSON import's type from the file.
- Observable types CSV columns on request.
- Elm makes you decode data explicitly.
- Pathogen's completion engine could read the data file and offer `city.` → `name`, `x`, `y`.

**Untrusted input and size**
- SVG import should extract geometry, not inject markup. Any markup that is kept goes through the existing allow-list.
- Every surface needs a per-file size limit.
- Parse each data file once per content hash. Today the playground re-sends everything on every keystroke.

---

## 10. Files, folders and the sandbox

| System | Root | Escape rules | Network |
|---|---|---|---|
| Typst | `--root` (default: the entry file's directory); `/x` means root-relative | nothing outside the root | packages only, fetched by the host |
| Deno | — | `--allow-read=<paths>` | `--allow-net=<hosts>` |
| Pkl | `--root-dir` | `allowedModules` / `allowedResources` patterns | by pattern |
| Go `//go:embed`, CUE `@embed`, Zig `@embedFile` | the module or package directory | no `..`, nothing outside the module | none |
| Nix (pure evaluation), Dhall | the flake or store | Dhall: remote code can't read local files | hash-pinned only |
| VS Code | the workspace folder | Workspace Trust (restricted mode) | — |

**Rules to adopt**
- **The project root:**
  - pathogen.studio: the workspace
  - VS Code: the workspace folder
  - CLI: the nearest `pathogen.json` if we add one, otherwise the entry file's directory; `--root` overrides
- **Paths:**
  - forward slashes only
  - `./`, `../`, and `/` for the root
  - no absolute OS paths, and no escaping the root
  - exact case, even on macOS. TypeScript has `forceConsistentCasingInFileNames` because "works on my Mac" breaks on Linux and in CI
  - UTF-8
- **Read-only.** The compiler never writes.
- **Network.** v1 makes no network requests beyond fonts. R11 (compile-time HTTP) arrives later with its own policy:
  - the playground: CORS plus an allow-list
  - the CLI: opt-in, Deno-style (`--allow-net=<hosts>`)
  - VS Code: off in untrusted folders
- **Why the root matters on the CLI and VS Code:** without one, `import key from "../../.ssh/id_rsa" with { type: "text" }` followed by `text(key)` copies a private file into an SVG you then share. Typst's root exists for this reason.
- **Globs return sorted results**, because directory order differs by operating system.
- **Watch mode** watches exactly the files the loader read.

---

## 11. Multi-file workspaces on pathogen.studio

### Precedents
| Product | Model | Notes |
|---|---|---|
| Typst web app | a project of files and folders, with one main file | free plan: 200 MB, 100 files per project; Pro: 2 GB, 1,000 files (pricing page) |
| Overleaf | a project with a "main document" | binary uploads, history |
| Observable | a notebook plus attached files; cells import from other notebooks | 50 MB uploads; Notebooks 2.0 (2025) moves to files on disk |
| p5.js editor | a sketch of files plus uploaded assets | about 250 MB per user (community-reported) |
| Shadertoy | fixed tabs: Common, Buffers A–D, Image | zero setup, but rigid |
| CodeSandbox, StackBlitz | a full virtual filesystem | general purpose |
| Cuttle (laser cutting) | SVG import from a menu; published projects expose parameters | a neighbor in our domain |

### What changes on pathogen.studio
- **Storage.** The KV record `{code, contentHash, rev}` becomes a file manifest (path → content hash and size) plus content-addressed blobs in R2.
  - Snapshots and approvals then freeze a manifest. That makes them cheap and deduplicates files across forks.
  - KV values cap at 25 MiB, so data files belong in R2.
- **Hashes and drift detection.** `contentHash`, the approval `codeHash`, re-review drift detection, and the autosave hash all become hashes of the manifest.
- **Editor:**
  - a file tree, with the main file marked
  - one EditorState per open file (fresh-state-per-document already exists)
  - renaming a file updates import paths
  - drag-and-drop upload
  - viewers for CSV, JSON, SVG and fonts
  - a preview of the main file, or of the file being edited
- **Links.** `?state=` stays single-file; long programs already hit HTTP 431 under wrangler. Multi-file sharing goes through workspaces.
- **UI changes follow the mockups-first rule.**

### Sharing between workspaces (open question)
- Approved versions are already frozen and addressable at `/u/<handle>/<slug>`. To serve as import targets, they would need:
  - numbered versions
  - public read access to the whole file tree
  - a promise that a version never disappears while something imports it (left-pad)
- Snapshots don't fit, because they are private and deleted with their workspace.
- Models to study:
  - Typst Universe: exact versions, immutable.
  - Figma library updates: consumers see "updates available" and choose when to accept them.

---

## Sources (web, checked 2026-10-22)
- TC39 import-text proposal (Stage 2 draft, May 2026): https://tc39.es/proposal-import-text/
- TC39 import-bytes proposal (Stage 2.7 draft, Feb 2026): https://tc39.es/proposal-import-bytes/
- TC39 deferred import evaluation: https://github.com/tc39/proposal-defer-import-eval/
- Typst 0.15.0 changelog (path type, forward slashes): https://typst.app/docs/changelog/0.15.0/
- Typst path type reference: https://typst.app/docs/reference/foundations/path/
- Typst forum, "Why are paths always relative to the current file?": https://forum.typst.app/t/why-are-paths-always-relative-to-the-current-file/306
- Typst forum, import vs include scoping: https://forum.typst.app/t/why-cant-i-use-a-function-in-a-chapter-even-though-i-imported-it-at-the-start-of-my-main-file/196
- Typst pricing (web app limits): https://typst.app/pricing
- TypeScript 6.0 deprecations: https://visualstudiomagazine.com/articles/2026/03/23/typescript-6-0-ships-as-final-javascript-based-release-clears-path-for-go-native-7-0.aspx
- p5.js 2.0 async loading (compatibility guide): https://github.com/processing/p5.js-compatibility
- Python PEP 810, explicit lazy imports: https://peps.python.org/810
- Deno 2.4, text and bytes imports: https://deno.com/blog/v2.4
- CUE file embedding: https://cuelang.org/docs/howto/embed-files-in-cue-evaluation/
- WESL spec: https://wesl-lang.dev/spec/README
- Sass `@import` deprecation: https://sass-lang.com/blog/import-is-deprecated/
- Emacs lexical-binding migration plan (emacs-devel, 2021): https://mail.gnu.org/r/emacs-devel/2021-09/txteAg7CU0hgP.txt
- OpenSCAD libraries (`use` / `include`, OPENSCADPATH): https://en.wikibooks.org/wiki/OpenSCAD_User_Manual/Libraries
- OpenSCAD SVG import: https://app.openscad.org/documentation/manual/SVG_Import.html
- Observable file attachments: https://observablehq.com/documentation/data/files/file-attachments
- Observable Notebooks 2.0: https://observablehq.com/notebook-kit/
- p5.js editor asset limit (forum): https://discourse.processing.org/t/size-limit-of-250-mb-issue/38173
- Maker.js importing: https://maker.js.org/docs/importing/
- Cuttle SVG import and DXF export: https://cuttle.xyz/blog/easter-basket-cuttle-template-snap-to-grid-dxf-export
- Gleam modules (qualified and unqualified imports): https://tour.gleam.run/basics/type-imports
- VS Code `Webview.postMessage` (ArrayBuffer transfer for engines 1.57 and later): https://vscode-api.js.org/interfaces/vscode.Webview.html
- WebviewView typed-array transfer (PR #148429): https://github.com/microsoft/vscode/pull/148429
- Google Fonts css2 responses (TTF for non-browser clients, WOFF2 slices for browsers): measured with curl and Node `fetch` on 2026-10-22
