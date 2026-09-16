# Subscriptions

A subscription is a [path query](#path-queries-path-queries) that runs itself. You tell a layer what you want from it — every corner, every arc, everything a `circle()` drew — and hand over a block. The compiler calls that block once per match, in the order the geometry was drawn, and the annotations follow the drawing without any bookkeeping on your side.

> **Prerequisites:** This page assumes the [Path Queries](#path-queries-path-queries) grammar and result structs, [layers and `apply` blocks](#layers-layers), and [lambdas](#syntax-lambdas).

The dot-on-every-corner program from the queries page, written as a subscription. The annotation is declared once, before any drawing, and never mentions a coordinate:

```
define ViewBox(0, 0, 120, 100);
define PathLayer('shape') #{ stroke: #333; stroke-width: 2; fill: none; }
define PathLayer('dots') #{ fill: #d33; stroke: none; }

layer('shape').subscribe('endpoint') {|corner|
  layer('dots').apply {
    circle(corner.x, corner.y, 3);
  }
};

layer('shape').apply {
  M 20 20;
  h 80;
  v 60;
  h -80;
  z;
}
```

`subscribe` takes the same selector strings `queryAll` does and hands the block the same structs: an `Endpoint` here, a `Command` for `command(a)`, a `Call` for `call(circle)`, and so on.

## Things to know first

- **Callbacks run at the end of the program, not while you draw.** The compiler keeps every layer in memory until the last statement has run, then works through the subscriptions. So a callback always sees the finished picture: the source path is complete, corner operations are already applied, and every other layer is done too.
- **Variables inside a callback hold their final values.** Blocks are closures over their scope, and the callback runs last, so a variable you changed after subscribing shows its last value, not the one it had when the drawing happened. Bind what the callback needs before subscribing, or put it in the selector.
- **A callback may not draw into the layer it subscribed to.** That is an error the moment it happens, on the statement that wrote. Subscriptions annotate other layers.
- **Subscription output lands after everything the program drew directly into the target.** That changes where a dash pattern is in its cycle and where markers go. Give annotations their own layer and this never matters.
- **Only drawing after the `subscribe` call is delivered.** Query the layer for what came before. Calling `unsubscribe()` stops delivery from that point.

## Subscribing

```
let handle = layer('shape').subscribe('endpoint') {|match, index, subscription|
  ...
};

layer('shape').subscribe('command(a)') << annotateArc;   // a lambda or fn defined elsewhere
```

`subscribe` is available on path layer references — `layer('name')` and layer variables — and takes one selector string. The block receives up to three parameters, all optional: the **match**, its **index** among this subscription's matches starting at 0, and the **Subscription** itself, so a callback can stop after some number of matches:

```
layer('shape').subscribe('endpoint') {|corner, i, sub|
  layer('dots').apply {
    circle(corner.x, corner.y, 3);
  }
  if (i >= 2) {
    sub.unsubscribe();
  }
};
```

Malformed selectors are reported at the `subscribe` line, with the same messages `query` gives.

## When callbacks run

Every path statement the program executes is queued in order, across all layers. Nothing is matched while you draw. When the program ends:

1. Each subscription runs its selector once over the finalized geometry of its window, exactly as `queryAll` would. This is what makes `:last` deliver only the final match and `:nth(-3..-1)` only the last three: the whole window is known before anything fires.
2. The queue is replayed in program order and each subscription's matches fire as their statements come up. Two subscriptions on different layers interleave the way the drawing did; for the same statement, the one subscribed first fires first.
3. Anything the callbacks drew is queued too. If a target layer has its own open subscription, that starts another round.

## Windows

A subscription is a window over its source. `subscribe` opens it and `unsubscribe()` closes it, so drawing between the two calls is what gets delivered:

```
let corners = layer('shape').subscribe('endpoint') {|corner|
  layer('dots').apply { circle(corner.x, corner.y, 3); }
};

layer('shape').apply {
  M 20 20; h 40; v 20; h -40; z;   // annotated
}

corners.unsubscribe();

layer('shape').apply {
  M 70 20; h 40; v 20; h -40; z;   // not annotated
}
```

`unsubscribe()` inside a callback means something slightly different: the window is already fixed by then, so it cancels the matches that have not fired yet.

Position pseudo-selectors count within the window: `endpoint:first` is the first corner drawn after subscribing, `endpoint:last` the last drawn before unsubscribing.

## Chains and cycles

A callback may draw into a layer that has subscriptions of its own. Those fire in a following round, so annotations can be annotated. What cannot happen is a loop: if rounds keep producing new drawing, the compiler stops after eight and reports the chain it found, for example:

```
Subscriptions fed each other for 8 rounds: shape → dots → shape
```

Writing into the subscribed layer from its own callback is the shortest such loop, and is reported immediately rather than after eight rounds.

## Where the drawing goes

The callback runs as ordinary top-level code once the program has finished, so it can open `apply` blocks on any layer, including text layers:

```
define TextLayer('labels') #{ font-size: 8; fill: #333; }

layer('shape').subscribe('endpoint') {|corner, i|
  layer('labels').apply {
    text(corner.x, corner.y)`${i}`
  }
};
```

Bare path commands in a callback go where top-level commands go: the default layer. A callback may also call `log()`, query any layer, and read `ctx`, which is the top-level context.

## What the callback sees

- **Finalized geometry**, the same answer `query` gives after the fact: a corner rounded by `with fillet` shows the arc, not the sharp joint you typed.
- **Page coordinates**, because the source is a layer.
- **Complete structure.** Every `Endpoint` knows its `next`, `turn`, and `isJoint`; every `Segment` and `Subpath` is whole.
- **The whole program's final state**, as described under things to know first.

## The Subscription value

| Member | Type | Meaning |
|---|---|---|
| `source` | string | the source layer's name |
| `selector` | string | the selector as written |
| `active` | boolean | the window is open and the subscription has not been cancelled |
| `count` | number | matches delivered so far — meaningful inside callbacks |
| `unsubscribe()` | method | close the window, or cancel remaining matches when called during delivery |

`log(handle)` prints `Subscription(shape: 'endpoint', 4 delivered)`.

## Errors

- `subscribe` on a text or group layer is an error; only path layers have geometry to observe.
- A selector that does not parse errors at the `subscribe` line with the query grammar's message.
- An error inside a callback reports the callback's line and names the statement whose geometry triggered it, so the cause is one jump away.
- Writing into the subscribed layer from its own callback, and a chain that never settles, are errors as described above.

## Subscriptions versus queries

A subscription is `queryAll` over a window plus the loop you would have written, run for you at the end and kept next to the intent. Reach for `queryAll` when you need the results as data now, in the middle of the program; reach for `subscribe` when the drawing is spread across the program and the annotation should simply follow it.
