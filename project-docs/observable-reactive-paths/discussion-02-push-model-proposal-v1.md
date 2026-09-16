# Discussion 02 — push model (milestone 2) proposal v1

Date: 2026-09-14. Session: https://claude.ai/code/session_01N33kf8UYo9xxCyveUcvgRL
Builds on milestone 1 (`plan-01-query-language-m1.md`, shipped in c558cd0).

## The one-line definition

A subscription is a **query that runs incrementally**: the same selector grammar,
the same result structs, evaluated against each record as it lands in a layer's
store, with the callback invoked once per match.

## What M1 settled that shapes push

- Selector nouns, filters and combinator scoping are all decidable per command as
  it is recorded, EXCEPT anything that needs the future: `:last`, negative `:nth`,
  the end of a labeled run, the end of a subpath, and an endpoint's `next`/`turn`.
- Events must come from records that reach a layer store. Discard sinks (`.map`,
  `.filter`, `Grid.fill`) write to throwaway stores; attaching subscriptions to the
  store object itself means they can never fire phantom events, so the ctx-leak bug
  is not a blocker for M2.
- Records are statement-granular and labels attach after the record lands, so
  the event unit is "a statement's commands, annotated".

## Dispatch: batched at transaction end (recommended)

Events are queued while an apply block is active and dispatched when the outermost
apply block closes; at top level they are dispatched at the end of each statement.
Equivalent rule: **dispatch whenever a statement completes with no apply block
active** (the apply-block statement itself included).

Why: the callback then always runs at top level, where `other.apply { }` is legal —
the apply-nesting ban never has to be lifted, re-entrancy loops cannot form through
nesting, and Ryan's original sketch works verbatim. What it gives up: the callback
cannot read the source layer's in-flight `ctx` (the event payload carries start,
end, `next`, `turn` instead) and cannot feed back into the same block's later
commands (deliberately).

Re-entrancy guard: records made by a callback never notify the subscription that
is currently dispatching; a depth cap (16) turns mutual feeding into an error.

## When each noun fires

| Noun | Fires when | Held until |
|---|---|---|
| `command` | its statement completes | — |
| `call` | its statement completes | — |
| `endpoint` | its joint is known: the next drawing command in the subpath lands, or `z` closes it | trailing endpoint of an open subpath → next `m`, `unsubscribe()`, or program end (`next` = null) |
| `segment` | the labeled run closes (a command with another/no label lands) | program end |
| `subpath` | `z`, or the next `m` | program end |
| `:first`, `:nth(k≥0)` | the k-th match | — |
| `:last`, negative `:nth` | program end only | — |

Endpoints see AUTHORED geometry (the sharp corner a later `with fillet` trims), and
their `cornerOp` is known exactly when the joint is, because the `with` clause
lives on the following command.

Program end = "complete": every active subscription flushes its held events once.

## API sketch (style 1, source-centric primitive)

```
let dots = PathLayer('dots') #{ fill: #36c; stroke: none; }
let primary = PathLayer('primary') #{ stroke: #333; fill: none; }

let corners = primary.subscribe('endpoint') {|joint, n|
  dots.apply {
    circle(joint.x, joint.y, 3);
  }
};

primary.apply {
  M 20 20; h 80; v 60; h -80; z;
}

corners.unsubscribe();   // also flushes held events
```

- `subscribe(selector)` on PathLayer refs (`layer('x')` and layer variables);
  trailing block `{|match, index| … }` or worker form `subscribe(sel) << handler`
  (`subscribe` joins CALLBACK_METHODS). Second param = ordinal in this stream.
- Returns `Subscription` (`unsubscribe()`, `active`, `count`); auto-completes at
  program end. Errors in a callback are compile errors at the callback's line.
- Only future records are delivered; `queryAll` covers the past.
- Non-streamable selectors (`:last`, negative nth) are accepted but documented as
  firing at completion.
- PathBlock literals are not observable in M2 (built in one expression; pull covers
  them). `@{|ctx| …}` block args stay deferred.

## Style 2 (target-centric sugar, optional)

```
dots.observe(primary, 'endpoint') {|joint|
  circle(joint.x, joint.y, 3);
}
```
The block is an apply body for `dots`, run per event. Reads as "dots follows
primary's endpoints"; multi-layer fan-out = one subscription per target. Could ship
alongside style 1 or later.

## Open decisions

1. Batched dispatch (recommended) vs immediate with nesting lifted.
2. Endpoint timing: hold until the joint resolves (recommended) vs fire immediately
   with `next = null`.
3. Verb and handle names: `subscribe`/`Subscription` vs `observe`/`Observer`.
4. Style 2 sugar in M2, later, or never.
5. Late subscribers: future-only (recommended) vs replay history.
6. Callback second param: ordinal (recommended) vs the subscription handle.
7. Streams on the default layer at top level: per-statement dispatch (recommended).
8. Whether `:last`/negative nth should error at subscribe time instead of firing at
   completion.

---

## Addendum (2026-09-14): Ryan's question on memory / async, and the turn to end-of-program dispatch

Ryan asked whether everything stays in memory until the SVG is written (yes: one
synchronous pass; stores are joined into `d` strings in `buildCompileResult`; the
SVG is assembled later by the CLI / preview), and what the risk would be of running
callbacks "asynchronously behind the scenes". There is no true asynchrony inside
compile; the spectrum is record-time → transaction-end → program-end. Ryan is
fine waiting until the end and wants self-writes and circular subscriptions to be
impossible.

End-of-program dispatch = milestone 1 verbatim: register selector; at program end
`queryAll` over the source window and call the lambda per match. Concerns:

1. Closure late-binding (lambdas capture by reference; callbacks see end-state
   variables). Document + idiom.
2. Target-layer ordering: subscription output appends last (dash phase, markers,
   pen position). Document; recommend dedicated annotation layers.
3. Self-write = error (known dispatching subscription + written store). Chains:
   dispatch in rounds to a fixpoint with a cap; cycles error naming layers.
   Stricter alternative: targets must have no subscriptions.
4. Subscription = WINDOW over the source's record list: subscribe stamps start,
   unsubscribe stamps end; dispatch queries that window. Late subscribers start
   later. Needs `meta.record` identity carried through finalization.
5. Finalized geometry becomes available to callbacks (matches pull). Recommended.
6. Error attribution: callback line + triggering record loc.
7. Callbacks see completed state (consistent; cannot observe half-drawn paths).
8. Determinism: registration order, authoring order within, rounds for chains.

Resolved by deferral: endpoint hold timing, `:last` / negative nth, completion.
Remaining: cycle policy (rounds vs sinks-only), closure caveat acceptance,
finalized vs authored (recommend finalized), names, style-2 sugar.

---

## Decisions (Ryan, 2026-09-15)

- **Queue as we go, walk at the end.** The queue holds RECORDS in global program
  order; each subscription is a window over its source's records (subscribe opens,
  unsubscribe closes). At program end each selector runs once over the finalized
  commands in its window (M1 matcher), so `:last` / negative `:nth` deliver exactly
  the final items; then the global queue is replayed in program order, firing each
  subscription's matches as their records come up (registration order breaks ties).
- Endpoint timing: moot (all joints resolved at dispatch).
- Names: `subscribe` / `Subscription`.
- Target-centric `observe` sugar: NOT in this milestone (different shape, not a
  synonym: block is an apply body for the target; one target per subscription).
- Late subscribers: window opens at the call; query for history.
- Block params: `{|qr, i, sub|}` — match, ordinal among this subscription's
  matches, handle. `sub.unsubscribe()` inside the callback cancels the remaining
  queued matches; at top level it closes the window.
- Cycles: rounds to a fixpoint; cap = named constant (proposed 8; Ryan floated
  4–8); error prints the chain (`primary → dots → primary`). Self-write into the
  source from its own callback = immediate error.
- Closure late-binding: accepted, documented caveat.
- Callbacks see FINALIZED geometry.
- Pending confirmation: cap value; `observe` deferred.

---

## Implemented (2026-09-15)

Round cap 8 confirmed; `observe` deferred. Shipped as `docs/subscriptions.md` +
`src/evaluator/subscriptions.ts` (dispatcher: windows on the global record
sequence `meta.record`, one matcher pass per subscription with a subject window
applied before position pseudos, program-order replay, rounds to a fixpoint with
the cap, self-write detection by store growth), `layer.subscribe(...)` in the
evaluator's layer-reference branch, `Subscription` value + struct descriptor,
editor typing of the block params. Demo: `demo-subscriptions.pathogen` +
`renders/demo-subscriptions.png` (9 joints annotated before `unsubscribe()`,
none after; fillet arc spoked). Traps found: `layer` is a keyword → handle member
is `source`; trims/z-expansion/connectors rebuilt meta from a label whitelist and
dropped identity → `identityMeta` helper at every site; a fillet re-emits the
trimmed `h` as `l`.
