# Phase 1a, step 5c: values tied to another file's drawing

2026-11-04. Design: `17-phase-1a-step5-design.md`, section 5c, and its amendments. Contract: docs/modules.md, the paragraph "Values that belong to the imported file's drawing stay in that file", and the two Errors rows for exporting and using one (decision 35). No docs change was needed. Step 5a came before it.

## Before and after

| | Before | After |
|---|---|---|
| `export const ink = layer('ink');` in an imported file | exported; using it drew into a drawing that had already ended, so nothing appeared | an error at the export: "Cannot export ink — it is a layer of this file's drawing, which stays in this file. Export a fn that draws instead" |
| A layer, transform or subscription reaching your file another way (a fn returning it) | used silently, to no effect | an error at the use: "Cannot use ink — it is a layer of inks.pathogen's drawing, which stays in that file. Export a fn that draws, and call it inside your own layer" |
| The file's own fn using its load-time layer after the file loaded | drew into the ended drawing, silently | the same use error, traced to your call |
| An exported fn calling `layer('ink')` when it runs | drew into your `ink` layer | unchanged |
| Query results | copies of the commands | unchanged, and now tested |

## What this step delivers

| Piece | Where | What it does |
|---|---|---|
| Recording | `fixFile` | Layer references, transform references (and their `translate`/`rotate`/`scale` parts) and subscriptions leave the skip list. Each one the walk reaches is recorded in a per-compile `DrawingValues` map: the file being loaded, the binding it was reached from, and its kind. That file is the one whose drawing it belongs to: the drawing follows the call, so a layer another file's fn makes during this load is this file's. The first file to record a value keeps it |
| `drawingValues` / `drawingValueUse` | evaluator/index.ts | Saved and restored per compile like `fixedValues`, and undefined without files. A recorded value was recorded after its drawing ended, so any later use is an error, even from its own file's fn |
| Use sites | evaluator/index.ts | Any method call on the value (the one receiver check in `evaluateMethodCall`); any property read (`evaluateMemberExpression`); a property write (with step 4's check); `<<` merging styles into a layer; `GroupLayer.append`'s arguments; an `apply` target |
| Export check | `loadModules`, with `exportsOf` now giving each export's position | Your own drawing's value: "Cannot export …". Another file's value, such as one a fn handed back while this file loaded: "Cannot use …". At the declaration, traced with `imported from`. The compiled file's exports are never checked, since `export` does nothing there |
| `isImportedValueError` | module-messages.ts (was `isFixedValueError`) | Also matches the two drawing messages, so they get through the style-value fallbacks |

## Decisions in this step

- **Showing isn't using.** `log(ink)` works: it doesn't draw. Today a layer reference logs as `[object Object]`, which is outside this step.
- **The error is on any property, read or write.** That includes reading `sub.count` or `ink.name`. The docs say "using one … is an error", and a read is how the use starts.
- **The export error points at the declaration** (`const`, column 8), the position the parser gives the statement. The docs say "at the export", and the line is the export's.
- **No new docs.** Every message was already in the docs table, word for word.

## Checks

- **`tests/modules-drawing.test.ts`** (48, after the review):
  - the docs: all three export errors, a use through a fn, `inkLine` drawing into your layer, query results read;
  - every method and property the API declares for PathLayer, TextLayer, GroupLayer and Subscription, from `TYPE_MEMBERS`. A test checks that the call table covers exactly what the API declares, so a new method needs a row;
  - the transform methods and members, listed by hand because the API doesn't declare them as types;
  - property writes, `<<`, your group appending another file's layer;
  - naming by the written expression or the binding, the file's own fn after load, a second file re-exporting the first's layer, logging;
  - the file's own subscriptions during its load, and one-file programs.
- **Semantics audit, tree-alone suite, full suite:** see the commit message.

## Reviews

- **Code review** (no critical findings). Its trace of other routes found no leak. Destructuring, spread, index access, comparisons, `for…in`, interpolation and `log` all reach a layer only through the checked sites. `layer('ink')`, `GroupLayer(…)` and the subscription dispatcher make fresh references, which are never recorded. Query results only reach a PathBlock through `source.value`, never a layer. Dispositions:
  - **W1, a layer exported inside an array or object: left, with a test.** The docs make exporting a layer an error, and using one that "reaches you some other way" an error at the use. Rejecting the holder at its export would also block its other values (`kit.size`), so the holder exports and the layer is the use error.
  - **W2, the name for a layer reached through a holder: taken.** For `getKit().ink`, the message used the holder's binding (`kit`). `writtenName` now falls back to the last property written (`ink`) when the head of a member chain has no name. Step 4's messages get the same improvement for the same shape. Tested.
  - **W3, file and binding name from two files: a comment.** A layer another file's fn makes during this file's load is recorded as this file's drawing, under the name of the closure variable in that other file. The name is only used when the code using the value doesn't name it.
  - **W4, a callback that runs after the file loaded: a test.** An imported fn subscribing on your layer with a callback that uses its own file's layer fails when the callback runs at the end of your drawing. That is correct: that layer's drawing has ended. The subscription's existing wrapper ("Error in subscription on 'mine', match 1 …") carries the message, with the file and line.
  - **S1, the pattern recognizing these errors: tightened** to the full "…'s drawing, which stays in that file." and "this file's drawing, which stays in this file." phrases. A test checks that an `assert` message with similar words still fails as an assert.

  `tests/modules-drawing.test.ts` now has 48 tests.

## Follow-up: the cost per read and per call (a later commit)

After step 5, the advisor asked for the cost of 5c's check on every property read and method call in a compile with files, which step 4's benchmark (writes only) didn't cover. `tmp/phase1/bench-step5c.ts` measures it, with medians of 21 runs and one import:

| 30k-iteration loop | Step 3 | Step 4 | Step 5 | After the fix | No files |
|---|---|---|---|---|---|
| Property read (`p.x`) | 6.0 ms | 6.1 ms | 6.1 ms | 6.1 ms | 5.4 ms |
| Method call (`p.distanceTo(q)`) | 16.3 ms | 18.3 ms | 18.7 ms | 17.2 ms | 16.0 ms |

5c's own check cost about 2%. The larger cost was step 4's: every method call built a `Type.method` string to look up in `CHANGES_RECEIVER`. Two fast paths:
- `CHANGES_RECEIVER_TYPES` skips building the key unless the receiver's type has a changing method;
- `drawingValueUse` returns at once unless the value's type is one of the four drawing types (`DRAWING_KINDS`).

The read loop's remaining overhead dates from step 3 and is outside this fix.
