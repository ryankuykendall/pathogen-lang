# Phase 1a, step 5a: ids from other files

2026-11-03. Design: `17-phase-1a-step5-design.md`, section 5a, with the advisor's two changes:
- raw `url(#…)` in an imported file is rewritten unconditionally;
- the output is walked generically, not field by field.

Contract: docs/modules.md "Ids from other files". Step 4 was `d0e9198`.

## What this step delivers

| Piece | Where | What it does |
|---|---|---|
| `idPrefixOf` | evaluator/module-runtime.ts | The docs' prefix: the path from the project folder, `/` → `-`, `.pathogen` dropped, `--` at the end. A character an id can't hold becomes `_` plus its lowercase hex code point, and a leading digit or `-` gets `_`. It lives on the file's `ModuleIdentity.idPrefix` |
| Prefix clash check | `loadModules` | Before any file runs, two files with one prefix stop the compile, naming both in load order |
| `defsIdFor` / `defsIdTaken` / `storeDef` | evaluator/index.ts | Replace the 14 copies of the six-map duplicate check, across 21 constructor sites (12 constructors, `Gradient.inherit`, `Marker.fromPathBlock`, the 7 auto-id filters). While an imported file's code runs (`runningFile`), the id gets its prefix, and the def goes to the compile's shared `moduleDefs.imported` instead of any file's maps. The compiled file's defs go into its maps as before, with their position noted. The duplicate messages are unchanged |
| `nextAutoFilterId` | evaluator/index.ts | Numbers per file. Returns `{ id, written }`, and `makeDefaultNoiseFilter` seeds from `written`, so a top-level `NoiseFilter()` has the same seed imported or compiled alone |
| Raw references | `evaluateStyleBlockLiteral` → `rawIdRefs` | A `fromSource` flag marks text as written: raw CSS, a string literal, a bare name that isn't a variable. In an imported file's code, each `url(#x)` in such text becomes `url(#<prefix>x)`, unless it already carries the prefix. In the compiled file's code it is noted with its position |
| `defsForOutput` | before the defs lists in `buildCompileResult` | Without files, it returns the state's own maps. With files, it walks everything that reached the output (the layers, then the compiled file's defs, then each def that joins). It joins an imported def for each `url(#id)` in any string and each `href`. It skips only the trace-only `records` and `commands`, which the SVG never draws from. Then the clash and the warning (below) |
| Messages | module-messages.ts | `idPrefixClashError`, `importedIdClashError`, `importedRawRefWarning` |
| Warning code | `WARNING_CODES`, playground `compiler.d.ts` | `imported-id` |
| Docs | docs/modules.md, docs/debug.md | The clash sentence says when it applies (see below); the table row and the debug page's code list name `imported-id` |

## Decisions in this step

- **Where the code runs decides the prefix**, through `runningFile`, which step 3 already maintains. A def made by an imported fn while your file draws gets that file's prefix (decision 27), with no closure lookup.
- **An imported file's defs never enter a file's maps.** That holds whether the def was made while its file loaded or by its fn during your drawing. It reaches the SVG only when referenced. That is stricter than "load-time defs only", and consistent: "An imported file's defs … appear in your SVG only when your drawing uses them."
- **Raw text vs values.** The advisor recommended rewriting every raw `url(#x)` in an imported file. A value can't be told from raw text once it is a string, so `fromSource` draws the line at evaluation:
  - **Text as written** is raw and is always rewritten, even when it already looks prefixed.
  - **A value** (`m.id`, a variable, a call) keeps its id when some def has that id. So a Mask value your file passes into an imported fn (`#{ mask: m.id; }` there) keeps your id, as "Values carry their full id" promises.
  - **A value naming no def's id** is a name kept in a string (`const name = 'cut'; mask: name;`). It is the file's own name too, so it gets the prefix and works as it does compiled alone. The first version left it unprefixed, which dangled silently.
  - **The one ambiguous case:** inside an imported fn called while your file draws, a string that happens to equal one of your ids is taken as yours. That needs the same bare name in both files plus a string variable, and the def value avoids it.
- **The clash applies once your drawing refers to the id.** A reference names an id, so with your own `arrows--tip` and an imported `tip`, any reference to `arrows--tip` would reach both. The first version of the test expected no error when only your own was used. That was wrong, and the docs sentence now says "once your drawing refers to that id … a reference to it can't tell them apart". With no reference at all, your own def is emitted and the imported one stays out.
- **The walk skips the trace fields.** With `trace: true`, walking 20k command records added 57% to a compile with files. The SVG is never drawn from `records` or `commands`, so they can't carry a reference. A test pins that trace on and off give the same defs.

## Checks

- **`tests/modules-ids.test.ts`** (67, plus 5 skipped: `inherit` applies only to the gradient kinds):
  - the docs section item by item;
  - a matrix of 7 def kinds × 5 routes (a value or `.id`, a style block resolved while the file loaded, another def's content, a raw full id, `inherit`);
  - escaping, clashes, noise seeds, subscriptions in an imported file, trace, and one-file programs.

  Every compile checks that each `url(#…)` and `href` in its SVG names an id the SVG has.
- **CLI** (`tmp/phase1/ids-cli/`): main imports a marker whose fill is a gradient, and has its own `arrowhead` too. The SVG has `parts-arrows--arrowhead` with `parts-arrows--sky` pulled in, your own `arrowhead`, and no unused mask. The PNG shows a blue gradient arrowhead and a red one. Compiled alone, `parts/arrows.pathogen` keeps unprefixed ids and emits every def as before.
- **Benchmark** (`tmp/phase1/bench-step5a.ts`, medians of 21):

  | | Step 4 | Step 5a |
  |---|---|---|
  | One file, 2k gradients + styles | 42.6 ms | 43.0 ms |
  | One file, 5k style blocks | 137.2 ms | 136.9 ms |
  | One file, 20k segments | 15.7 ms | 15.6 ms |
  | With files vs without, 20k segments | 15.2 ms | 15.5 ms |
  | The same with `trace: true` | 19.1 ms | 19.3 ms |

- **Semantics audit, tree-alone suite, full suite:** see the commit message.

## Reviews

- **Code review** (no critical findings). Its probes found no reference the walk misses, and no read of the defs maps during an imported file's load. Taken:
  1. **Two imported files can add up to one full id.** `a.pathogen`'s `Mask('b--x')` and `a--b.pathogen`'s `Mask('x')` are both `a--b--x`. That gave a duplicate error blaming the second file. `defsIdTaken` now names both: "Duplicate defs ID 'a--b--x': made as 'b--x' in a.pathogen line 1, and as 'x' in a--b.pathogen. Rename one of them." Auto filter ids use `defsIdUsed` and skip to the next number instead. 1 test.
  2. **A raw reference that already looked prefixed** (`url(#a--cut)` in `a.pathogen`) was left as is, while `Mask('a--cut')` became `a--a--cut`, so it dangled. Written text is now always the file's own name. 1 test.
  3. **A name kept in a string in an imported file dangled silently.** It now gets the prefix when no def has that id (see "Raw text vs values"). 1 test, with the reference written before its mask.
  4. **Raw text mixed with a `${…}` splice** counts as a value. The CSS validator accepts a `url()` only as the whole value, so this can't happen today. A comment says so.
  5. **The walk's `href` match** is limited to gradients, the only def with one.
  6. **Raw references are noted once per id and position**, not once per run, so a loop doesn't grow the list. The walk also returns at once when no imported file made a def. 1 test.

  Left: the suggestion to skip bulk keys in the walk, since the benchmark shows no cost with trace off.
- **Content review** of the three docs edits: the clash sentence was approved with changes; the table row and the debug.md code list were approved. All suggestions taken:
  - the clash sentence now has a plain subject ("The compile also stops when…") instead of "So does", which read back to "rename one of them". It says outright that a reference meant for your own marker counts.
  - the older table label "One of your ids matches an imported one" read as if a match alone were enough. It is now "…an imported one your drawing refers to", to agree with the bullet.
  - the raw-`url` bullet ends the way markers.md does: "The warning's code is `imported-id`; `--strict=imported-id` makes it an error." A test pins strict mode.
  - debug.md's gloss says "in your file", since only the compiled file's raw references warn.

  The reviewer noted, and left as is, that "your drawing" slightly under-describes one case. An unused def of yours whose content refers to the id also triggers the clash, because your own defs are always searched. "Anything in your SVG" would be exact but break the neighbouring bullet's wording.
