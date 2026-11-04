# Phase 1a, step 5: what crosses the boundary (design)

2026-11-03. Plan: `12-phase-1-plan.md` "Step 5" and decisions 27, 33 and 35, with the docs as the contract (docs/modules.md "Ids from other files", "Fonts in imported files", the drawing-tied paragraph of "What you import is fixed", and the last six rows of "Errors"). Step 4 was `d0e9198`.

Step 5 lands as four commits, each verified the usual way (tests, the semantics audit, code review, the tree tested alone):

| Commit | What |
|---|---|
| 5a | Ids from other files |
| 5b | CSSVar registrations crossing |
| 5c | Values tied to another file's drawing |
| 5d | Fonts in imported files |

Logs and warnings carrying `file`, and a file's subscriptions running at the end of its load, already shipped in step 3. 5a adds tests that pin them.

## 5a. Ids from other files

**Where the code runs decides the prefix.** `runningFile` already names the file whose code is running (step 3: `acrossFiles` sets it for a call into another file's fn, and loading sets it for a file's top level). A def made while `runningFile` is an imported file gets that file's prefix; made in the compiled file's own code, its id is as written. That covers decision 27 (an imported fn called from your file) without looking at closures again.

**One helper claims every id.** The 12 constructors, `Gradient.inherit`, `Marker.fromPathBlock` and `nextAutoFilterId` each check all six maps today. They'll call one `claimDefsId(scope, written, call)` that:
- adds the prefix;
- runs today's duplicate check and message for the compiled file's own ids, which are unchanged;
- records where the id was made (`{ file, written, line }`), which the clash message needs.

**Where an imported file's defs live.** A def made by an imported file's code goes into a compile-wide `moduleDefs` map, keyed by its full id, whether it was made while the file loaded or by its fn during your file's drawing. It never goes into your file's maps directly. The duplicate check for such a def is against `moduleDefs`. Its prefix is unique per file, so that is exactly the file's own duplicate check.

**Only what's used reaches your SVG.** `buildCompileResult`, in a compile with files, scans what reached the output for references before it builds the defs lists:
- `url(#…)` in every style that reached the output: layer styles, element styles, text and tspan styles, and the styles inside defs' own content;
- a gradient's `href`.

Every referenced id found in `moduleDefs` joins the output, and its content is scanned in turn, until nothing new turns up. This catches every way a reference arrives:
- a value (`stroke: sky`);
- `m.id` (a string);
- a style block resolved while the other file loaded;
- one def's content referring to another;
- a raw string with the full id.

Checking at the use sites instead would miss the resolved style blocks, and `m.id` is only a string.

**Raw `url(#x)`.**
- **In an imported file's code**, a raw `url(#x)` in a style value becomes `url(#<prefix>x)` when `x` is one of that file's defs at that moment. A raw reference written before its def is made isn't rewritten; the corpus has one program with a raw `url(#…)` at all.
- **In the compiled file**, each raw `url(#x)` is recorded with its position. At the end, an `x` that isn't one of your ids but is the written id of an imported file's def gives the warning: "url(#arrowhead) matches no id in this file. The arrowhead made in parts/arrows.pathogen is parts-arrows--arrowhead in your SVG; use the imported value instead."

**Clashes.**
- **Prefixes:** checked once, after the graph loads, over every file's prefix. `parts-gears.pathogen and parts/gears.pathogen would both give their ids the prefix parts-gears--. Rename one of the files.`
- **One of your ids against an imported one:** checked when an imported def joins the output and your maps already hold its id. The message uses both recorded origins: `Duplicate defs ID 'arrows--tip': made in main.pathogen line 4, and as 'tip' in arrows.pathogen line 2. Rename one of them.`

**The prefix** (docs "Escaping"):
- the path from the project folder, `/` turned into `-`, `.pathogen` dropped, then `--`;
- a leading digit gets `_` in front;
- any other character outside `A-Z a-z 0-9 _ -` becomes `_` plus its code point in lowercase hex.

It is computed once per file, on its `ModuleIdentity`.

**Noise.** The seed hashes the id as written. An auto filter id is numbered per file (`pathogen-noise-1`, …) and then prefixed. So a top-level `NoiseFilter()` has the same seed imported or compiled alone, and one made by an exported fn is numbered in the order your file calls it.

**Derived ids** (`-inner-fill`, `-ramp`, …) are built by the renderer from the full id, so they follow.

## 5b. CSSVar registrations

`Color(CSSVar(…))` registers an `@property` rule in `evalState.cssProperties`. An imported file's registrations go into a compile-wide map too. The same output scan pulls one in when `var(--name)` appears in the output. Custom property names aren't prefixed: CSS reads them by name, and the user wrote that name. Two files registering one name with different definitions is out of scope; the first registration wins, as within one file.

## 5c. Values tied to another file's drawing

`fixFile` already reaches every layer reference, transform reference and subscription an imported file holds when it finishes loading, and skips them. It will record them in a `drawingValues` WeakMap (value → file) instead. Any other way such a value could reach your file is through those holdings, since a fn of that file called by yours makes them in your drawing.

- **At a use**, a recorded value from another file is an error: "Cannot use ink — it is a layer of inks.pathogen's drawing, which stays in that file. Export a fn that draws, and call it inside your own layer." The uses are:
  - a method call on the value: the DRAWING list in modules-freeze.test.ts, which is the classification's source;
  - reading or writing one of its properties;
  - passing it where a layer or transform is expected.
- **At the export**, an exported const whose value is one of these gives "Cannot export ink — it is a layer of this file's drawing, which stays in this file. Export a fn that draws instead" at the export line, while the file loads.
- **Query results** cross as frozen data. Step 4's walk already fixes them. 5c checks that none of them can reach back into the layer they came from.

## 5d. Fonts in imported files

This is host-side, before the compile, as in phase 0b:
- `planFontDirectives` runs over every file in the graph, with each file's `./` paths starting from that file;
- the CLI, the language server and the preview each pass the merged registry.

Fonts are shared by family and weight. Two files loading *different* font files as one family and weight is an error naming both: `Two files load different fonts as "Inter" 400: ./a/Inter.ttf (main.pathogen) and ./b/Inter.ttf (parts/labels.pathogen). Use the same font in both files.`

## Amendments

**From the advisor, before 5a's tests:**
- **Raw `url(#x)` in an imported file is rewritten unconditionally**, not only when `x` already exists. "Rewrite if known" fails a forward reference. Its unrewritten `url(#x)` would then silently bind to the compiled file's own `x`. The docs say a raw reference in an imported file means that file's own id.
- **The output is walked generically** (every string, plus `href`), not field by field. A missed or later-added field would leave a dangling reference with no error.
- **5c:** find the chokepoint before listing uses; handle a re-export of another file's layer; skip the export check in the compiled file.
- **5d:** the shared planner and the CLI only. The language server and the preview get their graph, and so their fonts across files, in step 6.
- **5b:** pull an imported `@property` only when the compiled file doesn't register that name itself.

**From 5a's code review:** written text is always the file's own name. A value keeps its id when a def has that id, and is otherwise the file's own name too. See `18-phase-1a-step5a.md`.
