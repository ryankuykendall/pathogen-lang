# Making Pathogen paths and path blocks more reactive and observable

## Current positioning

I have an interest in making Pathogen language Paths and PathBlocks more observable and reactive. My interest in the feature area has grown out of the work that we did to allow users to apply labels to segments and points when authoring paths (as described in the following blog post: https://pathogen.studio/blog/segment-labels-and-suffixes)...This capability in conjunction with our segment and point querying methods (we well as some nascent ideas around building a querying language around that would allow users to extract metadata from a path) opens up a rich opportunity and programming paradigm that will allow users to draw many things in parallel without any real path bookkeeping. 

The basic concept that I am most interested in is the use case of drawing a path and then simply labeling vertices on that path using observations and lambdas. The following pseudo-code should illustrate what I believe that we could do:

  let primaryPath = PathLayer(`primary-path`) ${...};
  let annotationPath = PathLayer(`annotation-path`) ${...};
  let annotationText = PathLayer(`annotation-text`) ${...};
  let primaryObserver = primaryPath.query('endpoint').subscribe() {|queryResult|
    let {point, index} = queryResult;
    annotationPoint.apply {
      // Draw circle at emitted vertex
    }
    annotationText.apply {
      // Draw text inside cirle at emitted vertex
    }
  };

  primaryPath.apply {
    M 0 0
    h 200
    v 200
    h -200
    v -200
    z
  }

  primaryObserver.unsubscribe();

The same could be done with PathBlocks as well (assuming that we add .apply {} to PathBlocks as an additional means of appending to path blocks.)

My expectation is that we would have a fairly rich querying language for SVG path commands (as well as our built in path commands that would allow users to query for specific commands (such as every arc applied to a path) as well as attributes of paths (all of the Y attributes of line commands, perhaps using something similar to CSS attribute selector syntax command(L, l)[y]), and even a bit of convenience syntax for grabbing things such a control points for bezier curves, etc. This would be in addition to the ability to query for labeled segments, points, and atomic items.

This also means that we need to return rich, well thought out objects and attributes for our queryResult object (since at the moment, we do not have first class objects representing bezier curves or arcs in the language.)

What I have presented above is a very loose sketch of the capability I am interested in. Below I have appended some personal notes as well as another prompt plus proposal/counter proposal for a system called signals. To be honest, I am very lukewarm, if not cold on the Signal proposal, as it does not really get the observable aspect of the capability that I have described above. That is likely my faunt as I may have over-indexed on anchoring to an RxJS BehaviorSubject model in that prompt, where what I have described above looks a bit more like a stream.

Again, this is merely a sketch with some gaping gaps in technical description and details. But I am hoping that we can turn this into a longer conversation, with you asking me some targeted questions in order to tease out, and ultimately illuminate a clearer, more concrete path in turning this into a powerful set of features that we could incorporate into the Pathogen Language.

## Personal Notes:

- Add block arguments to PathBlock definitions @{|ctx| …}
    - Allow ctx to queryable using segment(‘…’), segmentAll(‘…’), point(‘…’), pointAll(‘…’)
    - REACTIVE SVG PATHS!!!: Allow users to subscribe to layer.ctx.stream.subscribe(‘some-query’) << {|itemPathBlock| …some work… } using lambdas…the use case would be to add schematic information to a path as you draw it…the stream would work like RxJS, such that a user could filter the results of the stream as new path commands are added to it…the stream listeners could the be drawing to other parts of the SVG!!!
    - Blog title: Thinking and Drawing in Parallel: A new reactive drawing system (getting rid of path bookkeeping…could this be a core value.)
    - Could these streams also be used to generate animations?
    - Since some paths will not be created linearly, because of operations such as boolean intersections etc., should we add a PathBlock.walk method? Or do we just get that with PathBlock.commands?
    - Does PathBlock have, or should it have, an .apply {} method?

## Signals counter proposal + original prompt:

### Prompt

I am building a new programming language for authoring SVGs. I have some ideas around extending the language to make it reactive using some of the ideas captured in the RxJS library. My experience with RxJS is that I want to use BehaviorSubjects primarily rather than just general streams. The primary use case for streams would all for users observe SVG paths as they are being authored, with the commands being the primary content of the stream. I don’t think that I need the complete RxJS API rebuilt in my language, but I am curious what you would recommend to start out with. My language documentation is here if you would like some additional context to anchor your answer: https://pathogen.studio/docs

### Proposal

I think there’s a very natural reactive model hiding in Pathogen already. After looking through the docs, I would **not** start by rebuilding RxJS. I’d start with a small “state over time” abstraction inspired specifically by `BehaviorSubject`, then add only the operators that make geometric authoring noticeably better.

The important distinction I’d make is this:

> **The path is the state; commands are the changes to that state.**

That leads to a cleaner design than treating an SVG path as merely an unbounded stream of commands.

Pathogen already represents a `PathBlock` as a first-class value, and already exposes its executed commands as objects containing `command`, `args`, `start`, and `end`. `ctx.commands` similarly represents command history during evaluation. ([Pathogen Studio][1]) That means you already have most of the value model you need.

RxJS's `BehaviorSubject` is particularly relevant because it represents a value with a meaningful **current state**: it requires an initial value, retains its latest value, and immediately supplies that value to new subscribers. ([RxJS][2])

## I would make `BehaviorSubject` the primitive—but probably give it a Pathogen name

Something like `Signal`, `Behavior`, `Cell`, or perhaps simply `Subject` if you don't anticipate exposing the broader Rx taxonomy.

Conceptually:

```text
Signal<T>
  .value
  .next(value)
  .subscribe(fn)
```

For example, borrowing your lambda syntax:

```pathogen
let radius = Signal(20);

radius.subscribe {|r|
  log(r);
};

radius.next(30);
```

But the more interesting case is paths.

I would *not* make this:

```text
BehaviorSubject<Command>
```

the fundamental representation of a path.

A `BehaviorSubject<Command>` means:

> "What is the current path?"

Answer:

> "`l 20 0`"

That's not really state. It's just the last event.

Instead, I would make the reactive value something closer to:

```text
Signal<PathBlock>
```

with **command deltas available alongside it**.

For instance, hypothetically:

```pathogen
let path = PathSignal();

path.next(@{ h 20 });
path.next(@{ v 30 });
```

At this point:

```pathogen
path.value
```

would represent:

```pathogen
@{
  h 20
  v 30
}
```

That fits Pathogen especially nicely because `PathBlock`s are already composable first-class values. ([Pathogen Studio][1])

But subscribers could still primarily observe commands:

```pathogen
path.commands.subscribe {|cmd|
  log(cmd.command);
};
```

yielding something conceptually like:

```text
{ command: "h", args: [20], start: ..., end: ... }
{ command: "v", args: [30], start: ..., end: ... }
```

That command object is already essentially a native Pathogen concept. ([Pathogen Studio][1])

So I'd think of the object as having two faces:

```text
path.value      // Behavior/state: complete current PathBlock
path.commands   // Events/deltas: commands as they are authored
```

That distinction will pay off later.

---

## The MVP operator set I'd implement

You can get surprisingly far with about **six operators**.

1. **`map`**

This is indispensable.

```pathogen
let endpoints =
  path.commands.map {|cmd|
    return cmd.end;
  };
```

Or:

```pathogen
let lengths =
  path.map {|pb|
    return pb.length;
  };
```

You already have `.map` semantics for arrays and lexical lambdas, so this will feel unsurprising in the language. Pathogen's lambdas capture lexical state, which is particularly convenient for reactive transformations. ([Pathogen Studio][3])

2. **`filter`**

Especially useful on command streams:

```pathogen
let curves =
  path.commands.filter {|cmd|
    return cmd.command == "c";
  };
```

or potentially against your segment metadata:

```pathogen
let corners =
  path.commands.filter {|cmd|
    return cmd.command == "l";
  };
```

Again, Pathogen already has `.filter` on arrays, so users wouldn't have to learn a new conceptual vocabulary. ([Pathogen Studio][1])

3. **`scan`**

This one is disproportionately valuable for your domain.

`scan` turns an event stream into accumulated state:

```pathogen
let distance =
  path.commands.scan(0) {|total, cmd|
    return total + cmd.start.distanceTo(cmd.end);
  };
```

More importantly, it provides a general escape hatch. Many operators you might otherwise feel compelled to add can initially be expressed in terms of `scan`.

Conceptually:

```text
commands:
M → L → L → C

scan:
[M]
[M,L]
[M,L,L]
[M,L,L,C]
```

In fact, if commands really are your primitive stream, **`scan` is what turns that event stream into a BehaviorSubject-like path state**.

RxJS similarly categorizes `scan` as a transformation operator. ([RxJS][4])

4. **`distinct` / `distinctUntilChanged`**

I'd probably call it just `distinct()` unless you expect a second form of distinctness.

This becomes important as soon as derived values cause SVG recomputation:

```pathogen
let heading =
  cursor.map {|p| return p.angle; }
        .distinct();
```

Without it, reactive geometry can cause lots of redundant downstream updates.

RxJS's `distinctUntilChanged` emits the first value and subsequently emits only when the value differs from the previously emitted value. ([RxJS][5])

For Pathogen, I'd strongly consider making sensible structural equality part of this operator. Geometric values are much more commonly `Point`, `PathBlock`, arrays, etc. than JavaScript object identities.

5. **`combine` / `combineLatest`**

This is probably the most important multi-source primitive:

```pathogen
let center = Signal(Point(100, 100));
let radius = Signal(30);

let circlePath = combine(center, radius) {|c, r|
  return circle(c.x, c.y, r);
};
```

I'd seriously consider calling this **`combine`**, not `combineLatest`.

Because if all your reactive values are BehaviorSubject-like, "latest" is implied. There is always a current value.

This is one place where copying RxJS terminology would make Pathogen unnecessarily verbose.

6. **`subscribe`**

You obviously need the terminal operation:

```pathogen
path.commands.subscribe {|cmd|
  log(cmd);
};
```

But I'd make subscriptions relatively uncommon in ordinary Pathogen programs.

Most usage should ideally remain declarative:

```pathogen
let radius = Signal(20);

let shape = radius.map {|r|
  return @{ ... };
};

layer('main').apply(shape);
```

rather than:

```pathogen
radius.subscribe {|r|
   // manually mutate five things
};
```

The latter quickly turns reactive systems into callback programs.

---

## So my actual v1 would be extremely small

Something approximately like:

```text
Signal(initialValue)

signal.value
signal.next(value)

signal.map(fn)
signal.filter(fn)
signal.scan(initial, fn)
signal.distinct(fn?)
signal.subscribe(fn)

combine(a, b, ..., fn)
```

And for paths:

```text
PathSignal

path.value
path.commands
```

That is enough to learn whether the feature is genuinely useful without committing your language to the entire Rx conceptual universe.

I would deliberately leave out `mergeMap`, `switchMap`, `concatMap`, `exhaustMap`, schedulers, cold observables, multicasting operators, replay subjects, completion/error channels, etc. RxJS has an enormous operator surface because it solves asynchronous I/O, browser events, requests, timers, cancellation, concurrency, and many other problems. ([RxJS][4]) Most of that complexity has no obvious role in SVG authoring.

## There's one operator I'd add specifically for Pathogen

Rather than chasing RxJS parity, I'd spend that design budget on **domain-specific reactive operations**.

For example, imagine:

```pathogen
path.commands.vertices()
path.commands.segments()
```

or perhaps even:

```pathogen
path.vertices
path.segments
```

Because a raw SVG command isn't usually what the geometric author ultimately cares about.

Given:

```pathogen
@{
  h 40
  v 30
  c ...
}
```

your command representation already knows the command's `start` and `end`. ([Pathogen Studio][1]) So a reactive path could expose increasingly semantic projections:

```text
path.commands
path.vertices
path.segments
path.length
path.bounds
```

Each could itself be a reactive value.

Then something like:

```pathogen
path.endPoint.subscribe {|p|
  circle(p.x, p.y, 5);
};
```

starts to feel like a language for reactive geometry rather than "RxJS ported into an SVG DSL."

That seems much more interesting.

## You may actually be closer to Signals than RxJS

There's also a terminology/architecture point worth considering.

What you've described—mostly BehaviorSubjects representing current values—is increasingly unlike traditional stream programming and much closer to a **signal graph**:

```text
input signal
     ↓
computed signal
     ↓
computed geometry
     ↓
SVG output
```

For example:

```pathogen
let size = Signal(40);

let square = computed {| |
  return @{ h size.value v size.value h calc(-size.value) z };
};
```

You could potentially make dependency tracking automatic:

```pathogen
let size = Signal(40);

let square = computed {
  return @{ h size v size h calc(-size) z };
};
```

Now changing:

```pathogen
size = 80;
```

invalidates `square`.

That is a very different language direction, but I think it may ultimately fit Pathogen **better than explicit Rx-style piping**.

The reason is that geometry has state-like semantics:

```text
radius = 20
center = (100,100)
rotation = 15deg
path = ...
```

These aren't fundamentally event streams. They're values that change.

And RxJS itself explicitly uses the age-versus-birthday example to distinguish these: a birthday is an event stream; a person's age is a BehaviorSubject-like "value over time." ([RxJS][6]) SVG parameters look much more like the latter.

Commands are the interesting exception: they're naturally events.

So Pathogen could embrace both without exposing two giant APIs:

```text
                     ┌── command event stream
PathSignal ──────────┤
                     └── current PathBlock state
```

## A concrete model I'd explore

I think this would make a particularly coherent Pathogen design:

```pathogen
let stroke = PathSubject();

stroke << @{ h 40 };
stroke << @{ v 30 };

let endpoint = stroke.map {|path|
  return path.endPoint;
};

let direction =
  stroke.commands
    .filter {|cmd| return cmd.command != "m"; }
    .map {|cmd| return cmd.start.angleTo(cmd.end); }
    .distinct();
```

And because Pathogen already uses `<<` for PathBlock concatenation, there's potentially a very appealing semantic available here. Path concatenation currently returns a composed path block. ([Pathogen Studio][1])

You could decide that:

```pathogen
stroke << block
```

means "append this geometry to this reactive path," giving you something aesthetically native to the language rather than:

```pathogen
stroke.next(block);
```

I'm not certain I'd overload it—that deserves careful thought—but it has a nice Pathogen-ness to it.

### One architectural constraint I would establish early

Make propagation **synchronous, deterministic, and transaction-based**.

If:

```text
A ──┐
    ├── C
B ──┘
```

and one operation changes both A and B, C should ideally recompute **once**, seeing the new values of both, rather than:

```text
A changes
C computes with new A + old B

B changes
C computes again with new A + new B
```

That "glitch" problem becomes extremely visible when C is geometry being rendered.

So even if the public API looks like BehaviorSubjects, internally I would strongly favor:

```text
mutation
  ↓
mark dependencies dirty
  ↓
finish transaction
  ↓
topologically recompute
  ↓
render once
```

rather than literally implementing every value as an RxJS-style immediate observer callback.

That internal choice gives you room later for an excellent interactive editor.

## My suggested order

If I were implementing this in Pathogen, I'd build only:

1. `Signal(value)` / current-value semantics
2. `map`
3. `filter`
4. `scan`
5. `distinct`
6. `combine`
7. `subscribe`
8. A specialized reactive `Path` whose **state is the current `PathBlock` and whose changes expose your existing `{command, args, start, end}` records**

Then I'd stop and build examples.

In particular, I'd try to write a dozen compelling reactive geometry programs before adding another operator. If you repeatedly find yourself implementing the same thing with `scan`, *that* is your next operator.

The strongest part of this direction, to me, is that **Pathogen already has the right intermediate representation for it**. A `PathBlock` is a first-class value, its `commands` are inspectable, commands already carry their before/after geometry, and lambdas now give you lexical functions for transformations. ([Pathogen Studio][1]) You don't need to graft a foreign reactive system onto the language; you can make the existing path model reactive.

I would also strongly consider calling the primitive **`Signal` rather than `BehaviorSubject`**, even if its initial semantics are almost exactly BehaviorSubject's. That gives you freedom to optimize around deterministic geometric dependency graphs later without users assuming all of RxJS's Subject/Observable semantics.

[1]: https://pathogen.studio/docs "Documentation — Pathogen"
[2]: https://rxjs.dev/api/index/class/BehaviorSubject?utm_source=chatgpt.com "RxJS - BehaviorSubject"
[3]: https://www.pathogen.studio/blog/lambdas-come-to-pathogen?utm_source=chatgpt.com "The Shape of a Stroke: Envelopes, Bulges, and Lambdas — Pathogen Studio"
[4]: https://rxjs.dev/guide/operators?utm_source=chatgpt.com "RxJS - RxJS Operators"
[5]: https://rxjs.dev/api/operators/distinctUntilChanged?utm_source=chatgpt.com "RxJS - distinctUntilChanged"
[6]: https://rxjs.dev/guide/subject?utm_source=chatgpt.com "RxJS - Subject"
