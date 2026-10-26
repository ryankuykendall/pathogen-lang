<!-- Saved from the plan-mode session of 2026-10-22: draft recommendations (§12), next steps (§13), rounds 2–5 (§14–§18) and the decision log (§17). Section numbers continue from 01-survey-v1.md. -->

# Modules, data and files: decisions (rounds 1–5, 2026-10-22)

## 12. Draft recommendations and open decisions

| # | Decision | My lean |
|---|---|---|
| 1 | ESM spelling; `export` on declarations; named and namespace imports | yes |
| 2 | No `export default`; a default import gives the file's content | **decided (round 1)** |
| 3 | No import cycles | **decided (round 1)** |
| 4 | **Fork A**, function scope | **decided (round 2): lexical names**, with the drawing context following the call. Needs an audit and a transition warning |
| 5 | **Fork B**, isolated modules with drawing as a value; defs ids scoped per module | **decided (round 1): isolation** |
| 6 | **Fork C**, static imports for code and data; type from extension; `with` for options; static globs; no computed paths in v1 | **literal paths and type-by-extension decided (round 1)**. The structure of each data type is in §14.3 |
| 6a | `const`, and `export const` / `fn` / `enum` | **decided (round 2):** JS-style `const`; no `export let`; freeze after load. Whether module bindings also freeze is open (§15.4) |
| 7 | Paths resolve against the file they're written in; `/` is the root; sandbox rules from §10 | yes |
| 8 | **Fork D**, a shared loader plus a host interface, with VS Code fonts as the first use | yes, and do it first |
| 9 | Frozen exports | yes |
| 10 | `import` and `export` reserved after a sample and KV audit; `from`, `as` and `with` stay contextual | yes |
| 11 | The stdlib stays a global prelude; importing a name that shadows a built-in is an error | yes |
| 12 | Data formats in v1: JSON, CSV/TSV, SVG, and text (text lets libraries parse GPX, WIF and FOLD, per R4 phase 3). Image sampling next. GeoJSON later, as JSON plus helpers | lean yes; depends on which domains we target |
| 13 | Multi-file storage: a manifest plus content-addressed blobs | lean yes; needs API design |
| 14 | Sharing across workspaces: reserve a specifier form now, design versions later | open |
| 15 | A project file (`pathogen.json`) for the root, aliases, and dependencies | open. Typst managed without one until it added packages |

## 13. Next steps, when you're ready to move toward a plan
1. Settle forks A–D.
2. Copy this survey to `project-docs/modules/01-survey-v1.md`, and write `02-design-v1.md` with before/after examples for each decision.
3. Mock up the multi-file workspace (file tree, main file, data viewers) before changing the playground.
4. Write the docs first: `docs/modules.md` and a data-import page, both registered in `DOC_FILES`.
5. Write the phased implementation plan:
   1. host layer and VS Code fonts
   2. local modules in the CLI and VS Code
   3. multi-file workspaces in the playground
   4. data import
   5. sharing

---

## 14. Round 2: decisions so far, `const`, and how data files become values

### 14.1 Decisions so far (round 1, 2026-10-22)

| Item | Status |
|---|---|
| Fork B: modules run in isolation; the default import of a `.pathogen` file is its drawing | **decided** |
| No `export default`; a default import gives the file's content | **decided** |
| No import cycles | **decided** |
| Type from the file extension; `with { … }` for hints and overrides | **decided** |
| Literal import paths; no `import()` | **decided** |
| Fork A: function scope | open. You raised `const` and `export const` (§14.2) |
| Fork C: data import | direction is import statements, with the extension giving the type and `with` giving hints. Parsing and structuring are worked out in §14.3 |

### 14.2 `const` and `export const`

**Today**
- Only `let` exists, and variables are mutable.
- Arrays and objects are shared references.
- The iteration lock already makes an array read-only while it is being walked, and it comes with a clear error message.
- `@font NAME` accepts only a top-level `let NAME = "literal"`.
- `const` is not a keyword yet.

**What `const` could mean**

| Code | JS | Pathogen, shallow | Pathogen, deep |
|---|---|---|---|
| `const x = 1; x = 2;` | error | error | error |
| `const xs = [1]; xs.push(2);` | allowed | allowed | error: contents are frozen |
| `const o = { a: 1 }; o.a = 2;` | allowed | allowed | error |
| an importer receives an exported value | a live binding; the object stays mutable | a separate freeze at the module boundary | already frozen |

There are two ways to make shared module values safe. They are separate choices, and each is a departure from JS.

**(a) Deep `const`:** "const means constant", so the contents are frozen too.
- It also covers exports and imported data.
- The iteration lock's error machinery can carry the message, for example: "`PALETTE` is a const, so its contents can't change. Use `let` for a list you add to, or work on a copy: `let mine = [...PALETTE];`".
- The cost is real for JS users. `const result = []; … result.push(x)` is the most common JS idiom, and under deep const it errors.

**(b) Freeze after load (Starlark's rule)**, with `const` staying JS-style (binding only).
- Once a module finishes evaluating, its top-level values are frozen, and so is all imported data.
- Inside a module, code behaves exactly like JS.
- Importers can share the values, and recompiles can cache them, without changing what `const` means.

With neither: an importer could mutate an array that another importer also sees, and caching across recompiles would need copies.

**What can be exported**
```
export const TOOTH_DEPTH = 6;
export fn gear(teeth, r) { … }
export enum Joint { Finger, Dovetail }
export { gear as spurGear };
export let counter = 0;   // ✗ error: export a const, or a fn that returns the value
```
- ESM allows `export let` so the exporting module can keep updating a live binding.
- With modules evaluated once, in isolation, and finished before the importer runs, that binding has nothing left to update. Gleam and Elm export only constants and functions.
- Under *lexical names*, a module can still keep private `let` state that its exported functions use. Under the middle option below, it can't: see the caveat there.

**`const` elsewhere**
- `@font FAMILY;` would accept a top-level `const FAMILY = "Inter";`, with `let` still working.
- Import hints stay literals, as in ESM.
- Inside functions and blocks, `const` works like `let` but can't be reassigned.
- Reassigning a const becomes a static diagnostic, and semantic highlighting can show constants.

**How `const` changes Fork A**
- Under *lexical names*, `const` is orthogonal: it only adds immutability.
- It also enables a new middle option: **definitions resolve where written, variables resolve where called.**
  - A free name that points (at the definition site) to a `const`, `fn`, `enum` or an import is taken from there.
  - A free name that points to a `let` keeps today's caller-scope lookup.
  - The documented `amt` example (a `let`) keeps working, and library constants written as `const` work across files.
  - The precedent has the opposite polarity: Common Lisp and Emacs Lisp make `defvar` variables dynamic and everything else lexical, and OpenSCAD makes `$` names dynamic.
  - The cost: two rules keyed by declaration kind.
  - **Caveat:** an exported fn that reads its own module's top-level `let` fails when called from another file, because the lookup happens in the caller's file. So a library can't keep private mutable state, and the error has to say "make it const".

```
// lib/gears.pathogen
const DEPTH = 6;        // const: found where gear() is written
let wobble = 0.5;       // let: looked up where gear() is called
export fn gear(teeth, r) { … calc(r + DEPTH + wobble) … }

// main.pathogen
import { gear } from "./lib/gears.pathogen";
let wobble = 2;
gear(12, 40);  // middle option: DEPTH = 6, wobble = 2
               // lexical names: DEPTH = 6, wobble = 0.5
```

### 14.3 How data files become values

**Before and after**

| Today | With data imports |
|---|---|
| `let cities = [{ name: "Oslo", x: 120, y: 40 }, …];` typed or pasted by hand | `import cities from "./data/cities.csv";` |
| a path pasted as a string from Inkscape | `import logo from "./art/logo.svg";` |
| a weaving draft hand-converted to arrays | `import draft from "./draft.wif" with { type: "text" };` plus a parser library |

**General model:** `import <name> from "<path>" [with { <hints> }];`
1. **Type.** `with { type: "…" }` wins if given. Otherwise the extension decides. An unknown extension is an error that lists the available types.
2. **Parsing** happens once in the shared loader in `src/`, so every surface gets an identical value. Each parse is cached by content hash plus hints.
3. **Sharing the value.** If imported data is frozen (option (a) or (b) in §14.2), every importer can share one value and it can be cached. If not, each importer gets its own copy.
4. **Errors point into the data file**, for example `cities.csv:14:9 unterminated quote`. They show at the import line and in the data file itself.
5. **Hints are literals, checked per type.** An unknown hint is an error that lists the valid ones, and the editor completes them inside `with { }`.

**Extension → type → value**

| Extensions | Type | Value |
|---|---|---|
| `.json` `.geojson` `.topojson` `.fold` | json | the JSON value. Objects become objects (key order kept), arrays become arrays, numbers and strings stay as they are, `true`/`false` become booleans, `null` becomes null |
| `.csv`, `.tsv` | csv | an array of row objects, keyed by the header |
| `.txt`, or any file with `with { type: "text" }` | text | a string (UTF-8, BOM stripped, line endings normalized to `\n`) |
| `.svg` | svg | a drawing value, the same kind as a `.pathogen` default import |
| `.pathogen` | module | named imports get its exports; a default import gets its drawing |
| `.png` `.jpg` (later, R4 phase 2) | image | size plus pixel sampling |

**Hints**

| Type | Hint | Default | Meaning |
|---|---|---|---|
| any | `type` | from the extension | override: `"text"`, `"json"`, `"csv"`, `"svg"` |
| csv | `header` | `true` | the first row names the columns. `false` gives arrays of cells |
| csv | `delimiter` | `","` (`.csv`), tab (`.tsv`) | `";"` and so on |
| csv | `types` | `"infer"` | `"infer"`, `"strings"`, or per column: `{ zip: "string", x: "number" }` |
| csv | `decimal` | `"."` | `","` for European number formats |
| csv | `skip` | `0` | rows to skip before the header |
| csv | `comment` | none | lines starting with this are ignored |
| svg | `text` | `"warn"` | what to do with `<text>`: `"warn"` or `"ignore"` |

**CSV cell typing (the biggest structuring choice)**

| Option | Who does it | Pros | Cons |
|---|---|---|---|
| Strings unless asked | Observable (`typed` is opt-in), Python's `csv` | never surprises | every number needs converting, and Pathogen has no string-to-number function today |
| Infer per cell | d3 `autoType` | convenient | the ZIP code "02134" becomes 2134, and one column can mix types |
| **Infer per column** | pandas `read_csv` infers per column (and still reads "02134" as 2134). On top of that, a Pathogen-specific rule: a leading-zero value keeps its whole column as strings | convenient, and consistent within a column | one stray cell turns a numeric column into strings (with a warning that names the cell) |
| Explicit schema | Vega-Lite `format.parse`, Elm decoders | exact | verbose |

My lean is to **infer per column** by default:
- Inferred types are numbers, booleans (`true`/`false`), and null for empty cells.
- `types: { … }` overrides individual columns, and `types: "strings"` turns inference off.
- A column that falls back to strings says why on hover.

Other CSV rules:
- A header that isn't an identifier is read as `row["Population (2020)"]`.
- Duplicate headers are an error.
- Ragged rows are an error that names the row.

**SVG imports a drawing value.** Illustrative members:
```
import logo from "./art/logo.svg";
logo.viewBox        // the SVG's own viewBox
logo.paths          // every shape as a PathBlock (rect, circle, … converted; transforms applied)
logo.byId("star")   // one element or group, as a drawing
logo.layers         // top-level groups, by id or Inkscape layer name
```
- Only geometry and basic paint (fill, stroke, stroke-width, opacity) are extracted. Markup never passes through.
- `<use>` is expanded.
- Gradients, filters and text are dropped *with a warning*, never silently.
- DOCTYPE and entities are rejected, and there is a size cap.
- **Note:** the domain survey never asked for SVG import. It's my suggestion: fork B made "a drawing" a value, and laser, plotter and stencil users reuse artwork. The survey's own order was CSV/JSON first, then images, then text-format adapters.

**Text import and format adapters** (R4 phase 3: GPX, WIF, UIUC `.dat`, FOLD)
- These are libraries that parse a string.
- They need string tools Pathogen lacks today: string-to-number, trim, lines, find/replace.
- FOLD is JSON, so it needs nothing extra.

**Globs**
```
import icons from "./icons/*.svg";
// icons = { arrow: <drawing>, star: <drawing> }
// keyed by file name without the extension, sorted by path
```
- Two files with the same name in different subfolders would be an error.
- No `**` in v1.

**Tooling from data.** The language service reads data files through the same host, so it can offer:
- hover on `cities`: "212 rows · name (text), x (number), y (number)"
- completion on `city.`: `name`, `x`, `y`
- a diagnostic on `city.populaton`: "cities.csv has no column 'populaton'. Did you mean 'population'?"
- completion inside `logo.byId("…")`: the SVG's ids

### 14.4 New constraint found in the docs
- Calling a function stored in a value, as in `obj.f(1)`, isn't supported yet (docs/syntax.md, "Current limitations").
- Namespace imports need exactly that: `gears.gear(12, 40)`.
- Built-in namespaces already dispatch member calls (`Font.info(…)`, `Object.keys(…)`), so a module namespace can reuse that path without lifting the general limitation.

---

## 15. Round 3: type names, SVG queries, module state, and the project root

### 15.1 Decisions (round 2, 2026-10-22)

| Item | Decision |
|---|---|
| Fork A: names in a fn | **Lexical.** The drawing context (pen, output, `ctx`, active layer) follows the call |
| | This breaks the documented `amt` case. It needs an audit of samples, blog posts and KV workspaces, a transition warning, and an update to docs/syntax.md § Scoping |
| `const` | **JS semantics.** The binding can't be reassigned, and the contents stay mutable |
| Exports | **`const`, `fn` and `enum` only.** No `export let` |
| Freeze after load | **Yes.** An imported module's top-level values and all imported data are frozen once the module finishes evaluating |
| CSV | **Infer by default**, plus an explicit cast list (`columnTypes`). What the type names are is §15.2 |
| SVG | **In, but minimal.** A document value with `querySelector` / `querySelectorAll` returning allow-listed Elements. Element types and properties come in a follow-up |

### 15.2 Type names for `columnTypes`

Your sketch: `with { columnTypes: [string, string, integer, float, angle] }`. Writing a type needs type names, which Pathogen doesn't have yet. The editor already *shows* types in hover, with names from `pathogen-api.ts` such as `Point`, `Color`, `PathBlock`, `Angle`, `string` and `number`. The options:

| Option | Looks like | Pros | Cons |
|---|---|---|---|
| Strings | `["string", "integer", "angle"]` | no language change; the editor completes and checks them | stringly typed; no path to type annotations |
| A built-in enum | `[ColumnType.String, ColumnType.Integer]` | follows existing enums (`Easing.EaseIn`, `SpreadMethod.Pad`); completions are generated | verbose; CSV-only |
| **Contextual type names (TypeScript's model)** | `[string, string, integer, number, angle]` | your exact syntax. TS's `number` and `string` mean a type only in a type position, and are never reserved elsewhere (`let angle = 45deg;` keeps working). The same words would serve future annotations: `fn gear(teeth: integer)` | the words aren't values, so string→number conversion still needs a function (§14.3 gap) |
| Type names as values | `[String, Integer, Angle]`, plus `Number.parse("12")` | they double as conversion namespaces | adds global PascalCase names; a bigger design |

My lean is **contextual type names**. Open details:
- **Casing.** All lowercase, as in your sketch? Or TS's split, where primitives are lowercase (`string`, `number`, `boolean`) and structured types are PascalCase (`Angle`, `Color`, `Point`), matching what hover shows today?
- **The set.** Probably `string`, `number`, `integer` (a number checked to be whole), `boolean`, `angle`, `color`. Is `float` a synonym for `number`? I'd pick one name.
- **Angle cells.** A cell like `45deg` carries its unit. A bare `45` needs a unit from somewhere, for example `angle(deg)`, because angle literals must carry a unit.
- **Positional and by-name forms:**
  - A positional array (yours) must match the column count, and `null` means "infer this one".
  - A by-name object (`{ zip: string }`) overrides only the named columns and survives column reordering.
  - Supporting both costs little.

### 15.3 SVG: querySelector, allow-listed

```
import plate from "./art/plate.svg";              // an SVG document value
let cuts = plate.querySelectorAll("path.cut");    // array of Elements (document order)
let logo = plate.querySelector("#logo");          // an Element, or null
```

**Parity constraint.** The CLI (Node) and the playground's compile worker have **no DOM**. Web Workers have no `DOMParser`. So parsing and selector matching must be one shared JavaScript implementation in `src/` (an XML parser plus a selector engine), never the browser DOM. Otherwise the three surfaces would match selectors differently.

**Allow-list at parse time** (it extends the existing `ALLOWED_ELEMENTS` idea in `svg-sanitize.ts`):
- Disallowed elements (script, foreignObject, …) and attributes (event handlers, external references) are dropped while parsing, so they are never queryable.
- DOCTYPE and entities are rejected.
- There is a size cap.

**Selector subset for v1**
- type (`path`), id (`#logo`), class (`.cut`)
- attribute (`[data-op="score"]`)
- descendant and child combinators
- grouping with `,`
- Anything else is a compile error that names the unsupported part.

**What a v1 Element exposes is the open question.** Candidates:
- `tagName`, `id` and classes
- `getAttribute(name)`, for allow-listed attributes only
- `toPathBlock()` for shapes (path, rect, circle, ellipse, line, polyline, polygon). Without it, nothing imported is drawable in v1.
- `querySelector` / `querySelectorAll` scoped to an element's descendants

**Later:** transforms (an element's own and its ancestors'), units and `viewBox` scaling, paint, text, `<use>`.

### 15.4 Module state after load

"Freeze after load" freezes *values* (arrays and objects). Can an imported module's own top-level `let` still be **rebound** by its exported functions after load?

```
// lib/ids.pathogen
let count = 0;
export fn nextId() { count = count + 1; return count; }
```

- **Frozen too (Starlark).**
  - After load, `count = …` is an error that says to keep state in the caller and pass it in.
  - Libraries become pure, and caching a module's evaluated result across recompiles stays correct.
- **Rebinding allowed.**
  - Counters work.
  - But a cached module would carry `count` from one compile into the next. So module evaluation could not be cached across recompiles, only parsing. Order of calls would also matter across the program.

My lean is **frozen too**.

### 15.5 The project root on disk (CLI and VS Code)

The playground's root is always the workspace. On disk, something has to mark where imports may reach.

| Option | Root | Notes |
|---|---|---|
| **Manifest or entry folder** | the folder of the nearest `pathogen.json` above the entry file; without one, the entry file's folder; `--root` overrides | a workspace downloaded from pathogen.studio becomes a folder with `pathogen.json` (`main`, `name`). VS Code and `pathogen-lang .` then know which file is main, so web and disk use the same model |
| Entry folder only | the entry file's folder; `--root` widens it | Typst's default; no manifest file |
| Editor or shell folder | the VS Code workspace folder; the CLI's current directory | it depends on how the program was launched, so the same file can behave differently |
| No sandbox | any relative path, as in Node | the `../../.ssh/id_rsa` problem (§10) |

My lean is **manifest or entry folder**.

---

## 16. Round 4: defs ids, previewing a multi-file workspace, phase order, and type-name casing

### 16.1 Decisions (round 3, 2026-10-22)

| Item | Decision |
|---|---|
| Type names | **Contextual (TypeScript's model).** They mean a type only in a type position (`columnTypes` now, annotations later) and are never reserved elsewhere |
| SVG Element v1 | **`tagName`, `id`, classes; `getAttribute` for allow-listed attributes; `toPathBlock()` for path, rect, circle, ellipse, line, polyline and polygon** |
| Scoped queries | **Deferred.** Revisit later (note below) |
| Module state after load | **Frozen too.** An imported module's top-level bindings can't be reassigned after load, and its values are frozen |
| Project root on disk | **The nearest `pathogen.json`, otherwise the entry file's folder.** `--root` overrides. `pathogen.json` names the main file |

**Note on scoped queries (for later).** This is a DOM feature, not an Inkscape one:
- `element.querySelectorAll("path")` searches only inside that element.
- Inkscape came up only because its layers are `<g>` groups, which makes them a natural thing to search within.
- Until scoped queries exist, a descendant selector does the same job: `plate.querySelectorAll("#cut-layer path")`.

### 16.2 Defs ids across modules

Mask, ClipPath, Gradient, Pattern, Marker and Filter share one id space with user-chosen ids. Under isolation, each module registers defs in its own state. The output collects every def that something actually uses, so two modules may both have made `Marker('arrowhead', …)`.

| Option | How it works | Pros | Cons |
|---|---|---|---|
| **Prefix non-entry modules** (CSS Modules' approach) | ids from imported modules are emitted as `gears--arrowhead`. References through values (`marker-end: arrow`, `.id`) and raw `url(#arrowhead)` strings *inside* gears.pathogen are rewritten. The entry file's ids stay exactly as written | no collisions; existing single-file programs are unchanged | a raw `url(#…)` string that points into *another* module can't be resolved, so it's an error that says to import the value instead |
| Dedupe or error | identical defs (same id and content) merge. The same id with different content is a compile error naming both files | ids stay as written | library authors must pick globally unique ids, and two unrelated libraries can collide |
| Hash every id | all ids derived from content (`pg-3fa9c1`) | never collides | changes the entry file's output too, so CSS or scripts that target ids break |

My lean is **prefix non-entry modules**.

### 16.3 What the playground preview shows

Isolation (fork B) makes every file a drawing on its own, so a library can carry a demo.

| Option | Behavior | Precedent |
|---|---|---|
| Always the main file | the preview shows main no matter which file you edit | the Typst web app, Overleaf |
| The file being edited | editing lib/gears.pathogen shows its demo | the VS Code preview today (it follows the active editor) |
| **Main, with a "preview this file" toggle** | main by default, and you can pin the preview to the current file | none exact; covers both habits |

The mockups would settle the details. VS Code would mirror whichever is chosen: follow the active file, with a "lock to main" command, or the reverse.

### 16.4 Phase order (draft)

| Phase | Work | Why here |
|---|---|---|
| 0a | Split the drawing context from name lookup; lexical named fns; `const` (JS semantics) | a breaking language change with its own audit and migration; modules depend on it |
| 0b | Shared loader plus host interface in `src/`; CLI, playground worker and VS Code hosts; **VS Code fonts** as the first use | no language change; it removes the five-host drift before anything new rides on it |
| 1 | `import` / `export`, isolation, no cycles, freeze after load, namespace calls, defs ids, `pathogen.json`. Lands in CLI and VS Code first (files on disk) | the language core |
| 2 | Playground multi-file workspaces: mockups, then storage (manifest plus blobs), then the editor and preview | the biggest UI and API piece |
| 3 | Data imports: JSON, CSV (inference plus `columnTypes`), text; typed completions from data | R4 phase 1 |
| 4 | SVG import (querySelector, the v1 Element) | your follow-up decides the Element surface |
| 5 | Globs, scoped queries, sharing across workspaces (versions), images (R4 phase 2) | later |

Docs come first in every phase (`docs/modules.md`, `docs/data-import.md`, …), per CLAUDE.md.

### 16.5 Type-name casing and set

- **All lowercase:** `string number integer boolean angle color point`. This matches your sketch.
- **TypeScript's split:** primitives lowercase (`string`, `number`, `integer`, `boolean`) and structured types PascalCase (`Angle`, `Color`, `Point`, `PathBlock`).
  - `pathogen-api.ts` already names types this way (`@type string`, `@type array`, `@type Point`, `@type Angle`, `@type PathBlock`), so hover already shows it.
- **One name per type.** `number` rather than `float`, since Pathogen has one number type. `integer` is a number checked to be whole.

### 16.6 Still open, not asked yet
- Glob result shape: an object keyed by file name, or an array of records.
- Sharing across workspaces: versioned imports of published workspaces (`@handle/slug@n`), immutability, and the left-pad rule.
- Multi-file storage details and migrating existing single-string workspaces.
- How a bare number in an `angle` column gets its unit.
- String tools for text adapters: string→number, trim, lines, find/replace.
- An audit of identifiers named `import`, `export` or `const` in samples and KV workspaces.
- Importing a name that shadows a built-in: error or warning.

---

## 17. Decision log (rounds 1–4, 2026-10-22)

**Module system**

| # | Decision | Round |
|---|---|---|
| 1 | ESM spelling: `import { a, b as c } from "./x.pathogen";`, `import * as ns from …`, `export` on declarations | 0 (your direction) |
| 2 | No `export default`. A bare default import gives the file's content: a JSON value, CSV rows, an SVG document, or a `.pathogen` file's drawing | 1 |
| 3 | No import cycles. A cycle is a compile error that names the files | 1 |
| 4 | Literal import paths at the top level; no `import()` | 1 |
| 5 | **Isolation.** Each module runs in its own state, and its drawing, layers and ViewBox never reach the importer. The default import of a `.pathogen` file is its drawing, as a value | 1 |
| 6 | **Lexical names** in named fns. The drawing context (pen, output, `ctx`, active layer) follows the call | 2 |
| 7 | `const` has JS semantics (the binding is fixed, the contents are not). Exports are `const`, `fn` and `enum` only | 2 |
| 8 | **Freeze after load.** An imported module's values *and* top-level bindings are frozen once it finishes evaluating | 2, 3 |
| 9 | Defs ids from imported files are prefixed (`gears--arrowhead`), with references rewritten. The main file's ids stay as written | 4 |

**Data imports**

| # | Decision | Round |
|---|---|---|
| 10 | The type comes from the file extension; `with { … }` carries hints and overrides | 1 |
| 11 | CSV infers types per column by default; `columnTypes` (positional array or by-name object) casts columns | 2, 3 |
| 12 | Type names are contextual, TypeScript-style: lowercase primitives (`string`, `number`, `integer`, `boolean`) and PascalCase structured types (`Angle`, `Color`, `Point`). They are never reserved outside type positions | 3, 4 |
| 13 | SVG import is a document value with `querySelector` / `querySelectorAll`, parsed against an allow-list by one shared implementation | 2 |
| 14 | A v1 SVG Element has `tagName`, `id`, classes, `getAttribute` (allow-listed) and `toPathBlock()` for basic shapes. Scoped queries are deferred | 3 |

**Files, surfaces and order**

| # | Decision | Round |
|---|---|---|
| 15 | Project root on disk: the nearest `pathogen.json` (which names the main file), otherwise the entry file's folder; `--root` overrides. In the playground, the workspace is the root | 3 |
| 16 | Playground preview: the main file by default, with a toggle to pin it to the current file. VS Code mirrors this | 4 |
| 17 | Phase order: **0b host layer plus VS Code fonts**, then 0a (the language change), then modules, multi-file workspaces, data, SVG, and later items | 4 |

**Round 5**

| # | Decision | Round |
|---|---|---|
| 18 | **Error on built-in names.** Importing or declaring (`fn`, `let`, `const`) a name a built-in already uses is a compile error; rename with `as`. This also ends today's silent ignoring of `fn Point` / `fn polarLine`. It needs an audit of programs that override ordinary stdlib functions today | 5 |
| 19 | Next step: **plan phase 0b** (host layer plus VS Code fonts) | 5 |

**My defaults for items not asked about (say if any are wrong):**
- A specifier that isn't `./`, `../` or `/` is reserved in v1. It's a compile error ("remote imports aren't available yet"), which keeps room for `@handle/slug@n` and `std:` later.
- Paths use forward slashes and exact case, can't escape the root, are read-only, and resolve against the file they are written in.
- Plain-text import is in v1, so format adapters can be libraries.

---

## 18. Round 5: shadowing built-ins, and what's next

### 18.1 Imported or declared names that match a built-in

**Today** (evaluator call order, evaluator/index.ts:7477) resolves calls in this order:
1. `log` / `assert`
2. `layer()`
3. constructors by name (`Point`, `Marker`, …)
4. the 10 context-aware functions (`polarLine`, `tangentArc`, …)
5. the scope chain
6. the stdlib

The result is inconsistent:
- A user `fn circle` shadows the stdlib `circle`.
- A user `fn Point` or `fn polarLine` is **silently ignored** at call sites.
- Imports will make these collisions far more common.

| Option | Behavior |
|---|---|
| **Local names win** (JS's rule) | an import or declaration shadows any built-in in that file, constructors and context-aware functions included. Hover shows which one is in effect. Programs that declare `fn Point` today would start using their own (needs an audit) |
| Error on built-in names | you can't import or declare a built-in's name, and must rename with `as`. Safest, but it breaks programs that shadow ordinary stdlib functions today |
| Warn, local names win | as above, plus a warning every time a built-in is shadowed |

My lean is **local names win**.

### 18.2 What's next
Most of the design is settled (§17). Where we could go next:
1. **Plan phase 0b:** the host layer plus VS Code fonts.
   - Its first step saves this survey and a consolidated design doc to `project-docs/modules/`.
   - It would also include: the playground's silent skipping of file-path `@font` becomes a visible message, and file-path fonts obey the root rule.
2. **Sharing across workspaces:** versions, immutability, and specifiers like `@handle/slug@n`.
3. **Multi-file workspace UX and storage**, leading to mockups.
4. **The remaining small items** (§16.6).

---

