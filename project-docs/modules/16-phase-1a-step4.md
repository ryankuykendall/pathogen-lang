# Phase 1a, step 4: freeze after load

2026-11-03. Plan: `12-phase-1-plan.md` "Step 4", plus its amendments (decision 26's "belongs to" / "comes from" wording, and the namespace item from step 3's review). Step 3 was `9eed00d`.

## What this step delivers

| Piece | Where | What it does |
|---|---|---|
| `fixFile` | evaluator/module-runtime.ts | Runs once a file has loaded, after its subscriptions. It marks the file's root scope and every value reachable from its variables: elements of arrays, objects, Cyclers and grids, plus a mesh gradient's points (`getPoint` hands back the live ones). It also marks the scopes its fns and lambdas close over, each with the file it is written in. Private values count too, since an exported fn can hand them out. A value another file already fixed keeps that file. The walk is iterative and marks before it descends |
| `fixedValues` | evaluator/index.ts | A per-compile `WeakMap` from each value or scope to `{ file, name }`. It is a module-level variable, saved and restored around each compile like `runningFile`, and undefined in a compile without files. Every check starts with `fixedValues === undefined` |
| `CHANGES_RECEIVER` | evaluator/module-runtime.ts | The 22 methods that change their receiver, keyed `Type.method` as `receiverTypeName` names the type. Checked once at the top of `evaluateMethodCall` |
| Five guard sites | evaluator/index.ts | 1. `updateVariable`: a binding in a fixed scope (decision 29). 2. `IndexedAssignmentStatement`. 3. `MemberAssignmentStatement` (every property write on every type passes here). 4. `evaluateMethodCall` via the table. 5. `Object.delete` |
| Messages | module-messages.ts | `fixedValueError`, `fixedVariableError`, `fixedNamespaceError`. "Belongs to" when the running file owns the value, "comes from" otherwise; a namespace is always "imported". The advice depends on the kind: array, object, Cycler, other. `isFixedValueError` lets them through the style-value fallbacks |
| Docs | docs/modules.md | The `ids.pathogen` fence shows the full trace, as the other examples do. Three new Errors rows: a Cycler its own file holds, another value its own file holds, a namespace |

**How a message names the value.** An identifier gives its own name, so `as` and aliases give the local name. A chain of identifiers gives the dotted chain (`kit.sizes`). Anything else (`sizes().push(9)`) gives the name of the binding the value was reached from in its file (`known`). So `rows[0].push(9)` reads "Cannot change rows", and the advice "Copy it first: [...rows]" is a shallow copy. That's the one inexact case, and it's acceptable: the user still learns where the value comes from.

**Departures and decisions in this step:**
- **Closures are walked.** The advisor suggested sealing only the root scope. A counter that a fn closed over while its file loaded (`export const counter = makeCounter();`) would then stay shared, mutable state across importers. That breaks the docs' promise that a file "behaves the same however many files import it".
- **A scope belongs to the file it is written in**, not the file whose load found it. `export const f = mk();` in b.pathogen keeps a scope of a.pathogen's `mk`. Its variables, and the values they hold, belong to a.pathogen, whose code names them. So a change from inside `f` reads "belongs to a.pathogen". The walk takes the file from `moduleOf` once per closure it finds.
- **The file's own data comes first.** A value b.pathogen passed in to `mk` is both b's and a variable of a's scope. It "comes from b.pathogen", because the walk finishes b's own scopes and everything they hold before it visits any scope written in another file. This holds whether b reaches the value directly (`keep(mine)`) or through its own nested data (`keep(holder.items)`). Without that order the result depended on which stack was popped first.
- **Not walked:** values tied to a drawing (layers, transform refs, subscriptions), which step 5 gives their own errors, and namespaces. Also skipped are values nothing can change: Boolean, Angle, Point, PolarVector, Color, PathBlock and style blocks. For each, every property write already errors and no method changes it (probed: `tmp/phase1/probe-immutable-writes.ts`). Marking them doubled the load time of a file holding 90k points. The skip list fails safe, because a type missing from it is marked.
- **Changing methods found** (audit §2, then a full sweep of the writes in `evaluateMethodCall`, then the API classification test):
  - `Array.push/pop/shift/unshift`;
  - `Cycler.pick`;
  - `Grid.set/fill`;
  - `Gradient.stop/colorAll/point/contour`;
  - `MeshPoint.translate`;
  - `Mask|ClipPath|Pattern|Marker.append`;
  - the variable-offset builder's `stop/startTangent/endTangent/startCap/endCap`.

  The first sweep missed the builder's tangent and cap setters (`if (…) b.startTangent = v;`). The classification test caught them.
- **The new errors carry a column.** They only occur with files, so no existing message changes.

## Checks

- **`tests/modules-freeze.test.ts`** (158, plus the enum row of "works on a value an exported fn makes", skipped because an enum can't be declared inside a fn):
  - **The docs examples word for word:**
    - `sizes.push`, `style['width']`, `palette.pick()` and `sky.stop`, with each suggested copy or fn shown working;
    - the `ids.pathogen` fence, the take-and-return version, and `nextId()` inside its own file while it loads;
    - the "belongs to" rows for an array, an object, a Cycler and another value, with passing a Cycler in shown working;
    - both namespace forms;
    - reading (map, sort, slice, for).
  - **A matrix** over every `CHANGES_RECEIVER` entry plus 8 writes (array element, object key, enum member, `Object.delete`, gradient, marker, pattern and mesh-point properties). Each is checked four ways: an error on an imported value ("comes from"), an error from the owning file's exported fn ("belongs to", with the trace), working in the owning file while it loads, and working on a value an exported fn makes per call.
  - **Classification:** every method in `TYPE_MEMBERS` (from src/pathogen-api.ts) is changing, reading or drawing-tied, never two of these, and every changing method has a matrix case.
  - **Reach:**
    - nested elements, aliases, `as`, `kit.sizes`, and a private value handed out by a fn;
    - mesh points, the closure counter, a fn's locals, and an array passed in;
    - a closure one file's fn builds while another file loads (both directions, and a value the loading file reaches only through its own nested data), and an exported fn assigning to its file's const;
    - a re-export keeping the first file, and a file changing an import while it loads;
    - cycles;
    - the compiled file's own values, and one-file programs.
  - **Inside a style value:** the fixed-value error placed at the value; inside a CSS function and a template; from an imported fn, with the trace's call and the editor site on the value's line; through a fn the value calls, where the call inside the fn keeps its own line exactly as outside a style; in a file that loads; other errors keeping the raw text as before.
- **CLI** (`tmp/phase1/freeze-cli/`): the `ids.pathogen` example prints exactly the docs fence and exits 1.
- **Benchmark** (`tmp/phase1/bench-step4.ts`, medians of 21):

  | | Step 3 | Step 4 |
  |---|---|---|
  | One file, push 30k | 15.3 ms | 15.3 ms |
  | One file, index write 30k | 5.2 ms | 5.3 ms |
  | One file, assign 30k | 4.8 ms | 4.7 ms |
  | One file, member write 10k | 1.9 ms | 1.9 ms |
  | Load a file holding 90k points | 12.6 ms | 14.2 ms |

  The one-file rows are from the final code. There, the index and member writes check `fixedValues` inline before calling the lookup, as the method-call site does. Without that, the index write read +6–8% in two runs.

  The load row is the median of 21 runs. The first measurements took 9 runs and read +7.7 to +12.7 ms (about 85 ns per value). That was mostly code that hadn't warmed up, plus garbage collection from building the 90k points. The walk visits 180k elements (the three arrays and their concatenation) once per load, about 9 ns each.

  With files, the same loops pay 4–10% (0.2–1.5 ms per 30k writes) for the lookup. A field on `Scope` would make assignments cheaper. The difference is about 16 ns per assignment, which isn't worth a second mechanism.
- **Semantics audit, tree-alone suite and full suite:** see the commit message.

## Reviews

- **Content review** of the docs additions (approve with changes). Taken:
  - the namespace advice now reads "Declare a variable of your own with let, under another name", because "declare your own" read as `let kit = …`, itself an error;
  - "Make a new one inside the fn, or pass one in as a parameter", because a grid built up over several calls shouldn't be thrown away;
  - the namespace row label now matches its neighbours.

  Left as they are:
  - the order of the existing approved rows;
  - a gotcha note on the Cycler row;
  - extending the "What you import is fixed" table with a namespace row.
- **Code review** (approve with fixes; no critical findings). Its bypass search found the five guards are the only places a value changes: no stdlib function or other file changes its arguments. Taken:
  1. **A change inside a style value lost its message.** A style value keeps its raw text when evaluating it fails (`rgb(…)`, `context-stroke`), so `#{ stroke: palette.pick(); }` was rejected as a disallowed token. A fixed-value error now gets through the same way a lexical-scope miss does, from the value, a CSS function argument or a template. `isFixedValueError` reads the message's words, so it still matches once the error is traced through other files. A style value is parsed on its own, so a traced error's call read "line 1". `ModuleTraceError.moveLastStep` puts the last step, and the editor site, on the value's line. 5 tests.
  2. **The owner of a closure built during another file's load.** b's walk was the first to find a scope of a.pathogen's `mk`, so a change from a.pathogen's code read "comes from b.pathogen". The walk now records each scope's own file (see the decisions above), and `updateVariable` reads that instead of calling `moduleOf`. 2 tests.
  3. **Allocation in the walk.** Already fixed before the review landed: elements are marked as they're found, only holders queue, and `.flat()` runs only for grids and meshes. Re-measured: see the benchmark.
  4. **The const check now comes before the fixed check.** A const can't change in any file. In practice the static check rejects such an assignment while the file loads, so the order can't be observed. A test pins the const error.
  5. **The enum row of the per-call test** is an explicit `it.skipIf` instead of an early return.
  7. **A comment on the classification test:** it only sees methods `pathogen-api.ts` declares.

  Left: 6, `rows[0].pick()` suggesting `export fn rows()`. It is the same inexact case as `[...rows]` above.

- **Advisor check of the review fixes** (after a first local commit, since amended). It found two regressions, both in code that runs only with files:
  - **Fix 2 made the owner depend on walk order.** Scopes were popped before held values, so another file's closure scope could claim a value the file reached through its own nested data. In `keep(holder.items)`, `holder.items` read "comes from a.pathogen". Now the file's own scopes and held values come first (see the decisions above). 1 test.
  - **Fix 1 moved every last step**, including a real call deeper in. A style value calling a local fn that calls an imported fn read line 5 (the style value) instead of line 3 (the call). `ModuleTraceError` now records the scope its last step's call was made from (`lastCaller`). A style value moves the step only when that scope is its own. 1 test, which also compares the style value with the same call outside a style.
  - The semantics audit can't see either change, because its corpus is one-file programs, where `fixedValues` is undefined. It was re-run on the final tree anyway.

  **Found while probing, not changed:** in a one-file program, an error inside a style template nests two positions (`Line 2, col 20: Style value for "stroke": Line 1, col 12: …`). Fixed-value errors no longer do. Others are unchanged, since that is outside this step.
