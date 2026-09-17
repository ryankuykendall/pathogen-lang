# Path Queries

A path is a list of commands. `query` lets you ask that list a question by **kind** — every arc, every corner, everything one `circle()` call drew — and hands back objects that already know their own geometry. You stop counting commands and start naming what you want.

> **Prerequisites:** This page assumes you know [path blocks](#path-blocks-path-blocks) — the `@{ }` sigil, `.draw()`, and `.drawTo()` — and have seen the `as segment(...)` / `as endpoint(...)` clauses from [Segment Labels](#segment-labels-segment-labels-corner-suffixes). Labels are optional here: most queries need none.

The barest example puts a dot on every corner of a shape without writing down a single coordinate twice:

```
define ViewBox(0, 0, 120, 100);
define PathLayer('shape') #{ stroke: #333; stroke-width: 2; fill: none; }
define PathLayer('dots') #{ fill: #d33; stroke: none; }

layer('shape').apply {
  M 20 20;
  h 80;
  v 60;
  h -80;
  z;
}

layer('dots').apply {
  for (corner in layer('shape').queryAll('endpoint')) {
    circle(corner.x, corner.y, 3);
  }
}
```

`queryAll('endpoint')` returns one **Endpoint** per drawing command — the place each stroke of the pen finishes. Each one knows its `x`, `y`, the command that produced it, and the turn the path makes there.

## Things to know first

- **Queries answer finished geometry.** A `with fillet(...)` corner has already been rounded when you query, so `command(a)` includes the fillet's arc and `endpoint(name)` on a filleted corner answers the trimmed tangent point. The legacy `point('name')` keeps its documented preference for the sharp *authored* corner; `query` does not.
- **`endpoint` skips pure moves.** A move is where drawing starts, not where anything ends. A `z` that has length counts — its endpoint is the subpath's start.
- **Command letters are case-insensitive.** `command(a)` and `command(A)` match the same arcs. Path blocks always report lowercase relative commands; `absolute` is only ever `true` on a layer source that was authored with uppercase commands.
- **Coordinates come from the receiver.** On a `PathBlock`, positions are relative to the block's origin. Query the `ProjectedPath` returned by `.draw()`, `.drawTo()`, or `.project()` when you need page coordinates.
- **`subpath` is not `.subPath()`.** The `subpath` noun is SVG structure: one pen-down run between moves. The `.subPath(startT, endT)` [method](#path-blocks-subpathstartt-endt-pathblock) slices a path by arc-length fraction. Same word, unrelated jobs.
- **`call` sees the outer statement only.** `call(circle)` finds `circle(...)` statements you wrote; it does not see a `circle()` inside a user function you called — that statement answers to `call(myFn)`. Boolean results (`union`, `cut`, ...) carry labels but not call identity. The boundary is the layer's own `apply` block, not the function: a `circle()` written inside `holes.apply { … }` is that layer's `call(circle)` even when the apply block sits inside `fn drawHoles(holes)`, while `fn slot() { roundRect(…) }` invoked inside the apply block records as `call(slot)`.
- **A comma list keeps one noun.** `queryAll('command(a), command(c)')` is fine; `queryAll('command(a), endpoint')` is an error, so every array you get back has one element type.

## Asking by kind

Each noun names one kind of thing and takes, in parentheses, the natural way to pick some of that kind. Leave the parentheses off, or write `*` alone inside them, to get all of them.

| Noun | Pick with | Returns | One match is |
|---|---|---|---|
| `command(a, c)` | command letters or a shape word: `line`, `cubic`, `quadratic`, `curve`, `arc`, `move`, `close` | `Command` | one SVG command |
| `call(circle, draw, myFn)` | the function, method, or user function whose statement drew it | `Call` | everything one statement emitted |
| `endpoint(base)` | an endpoint label from `as endpoint('base')` | `Endpoint` | where one drawing command finishes |
| `segment(rib)` | a segment label from `as segment('rib')`; `cut` and `cut.name` work as they do for `segmentAll` | `Segment` | one labeled run |
| `subpath(1)` | a position: `2`, `1..3`, `0..<2`, `-1` | `Subpath` | one pen-down run between moves |

### Every arc, no labels

```
define ViewBox(0, 0, 140, 100);
define default PathLayer('tab') #{ stroke: #333; stroke-width: 2; fill: none; }

let tab = @{
  h 40;
  a 10 10 0 0 1 10 10;
  v 20;
  a 10 10 0 0 1 -10 10;
  h -40;
  z;
};

let placed = tab.drawTo(30, 25);

for (arc in placed.queryAll('command(a)')) {
  circle(arc.center.x, arc.center.y, 2);
}
```

The query runs on `placed`, the `ProjectedPath` that `drawTo` returned, so `arc.center` is already in page coordinates. Arc commands expose `rx`, `ry`, `rotation`, `largeArc`, `sweep`, and the computed `center`.

### Labels through `query`

Labels still work — they are simply the argument to `segment` and `endpoint`, mirroring how you wrote them:

```
let comb = @{
  for (i in 0..3) {
    v -20 as segment('tooth');
    v 20 as endpoint('root');
    h 12;
  }
};

let teeth = comb.queryAll('segment(tooth)');    // four Segment values
log(teeth[0].block.length);                     // 20
log(comb.query('endpoint(root)').point);        // Point(0, 0)
```

A label name is an expression at authoring time, so the same interpolation works inside a query string: ``comb.query(`segment(tooth-${i})`)``.

### Everything one statement drew

```
let face = @{
  circle(0, 0, 30);
  rect(-8, -8, 16, 16);
};

let ring = face.query('call(circle)');   // one Call: the two arcs the circle emitted
log(ring.name, ring.commands.length);    // circle 3 — the leading move plus two arcs
log(ring.block.length);                  // the circumference
```

`call` groups commands by the statement that produced them, which is the unit a stdlib shape function emits. `call(draw)` and `call(drawTo)` find placed path blocks the same way.

## Narrowing with filters

Square brackets test one scalar property of each match. Presence alone (`[label]`) or a comparison with `=`, `!=`, `<`, `<=`, `>`, `>=`:

```
let long = placed.queryAll('command(line)[length>30]');   // only the two 40-unit edges
let named = comb.queryAll('endpoint[label]');             // endpoints that carry any label
let clockwise = placed.queryAll('command(a)[sweep=true]');
```

| Filter | Applies to | Meaning |
|---|---|---|
| `x`, `y` | any | the match's end point |
| `length` | any | arc length of the command |
| `index` | any | position among commands, 0-based |
| `absolute`, `relative` | any | how the command was authored (layers only; blocks are always relative) |
| `label` | any | carries a segment or endpoint label |
| `cornerOp` | any | `fillet`, `chamfer`, or `ellipticalFillet` recorded on its end vertex |
| `closed` | `subpath` | ends in `z` |
| `x1`, `y1`, `x2`, `y2` | curves | control points as SVG names them |
| `rx`, `ry`, `rotation`, `largeArc`, `sweep` | arcs | arc parameters as SVG names them |

A filter on a match made of several commands — a `call`, `segment`, or `subpath` — passes when **any** of its commands passes. For "all of them" or for totals, filter the result array with `.filter {|m| ... }`.

Dynamic values go through string interpolation: ``placed.queryAll(`command(line)[length>${minimum}]`)``.

## Looking inside a match

A space between two parts means "inside": the right part is searched only within the commands the left part matched, and the right part is what you get back. This is the CSS descendant combinator, and it replaces `:atomic` from the legacy methods with a typed result.

```
let toothCorners = comb.queryAll('segment(tooth) endpoint');   // corners at the end of each tooth
let ringArcs = face.queryAll('call(circle) command(a)');       // the arcs, not the leading move
let firstRunLines = placed.queryAll('subpath(0) command(line)');
```

## Picking by position

`:first`, `:last`, and `:nth(...)` select from whatever list the rest of the query built. `:nth` accepts the same index spellings the language uses everywhere else — a single index, an inclusive range `a..b`, a half-open range `a..<b`, negatives counting from the end, and comma lists:

```
placed.query('command:nth(0)');          // the first command
placed.query('endpoint:nth(-1)');        // the last endpoint — same as :last
placed.queryAll('command:nth(1..3)');    // commands 1, 2, 3
placed.queryAll('command:nth(-3..-1)');  // the last three
comb.queryAll('segment(tooth):nth(0, 2)');
```

Two rules keep this predictable. Results always come back in authoring order whatever order you list. And after a space, `:nth` counts inside the scope: `subpath(1) command:nth(0)` is the first command **of that subpath**, not the first command of the path.

### `subpath` versus `command:nth`

These look similar and mean different things. Given three squares:

```
M 0 0  h 10 v 10 z      // subpath 0 = commands 0..3
M 20 0 h 10 v 10 z      // subpath 1 = commands 4..7
M 40 0 h 10 v 10 z      // subpath 2 = commands 8..11
```

| Query | Selects by | Result |
|---|---|---|
| `command:nth(1..5)` | position in the whole path | five commands, straddling the first boundary |
| `subpath(1..2) command` | membership | all eight commands of the second and third squares |
| `subpath(1) command:nth(1..2)` | position within one subpath | the `h v` of the second square |

A subpath starts at every move, and also at the first drawing command after a `z` that is not followed by a move — the SVG rule. `subPathCount` and `.contours` use the same rule.

## What comes back

Every result is a struct: read members with `.`, or destructure with `let { x, y } = corner;`. Arrays of them behave like any other array (`for`, `.map`, `.filter`, indexing).

### Command

| Member | Type | Meaning |
|---|---|---|
| `command` | string | the letter, lowercase |
| `absolute` | boolean | authored uppercase on a layer; always `false` on blocks and projections |
| `args` | number[] | the numeric arguments as recorded |
| `start`, `end` | Point | pen position before and after |
| `index` | number | position among the path's commands, 0-based |
| `subpath` | number | which subpath it belongs to |
| `length` | number | arc length |
| `block` | PathBlock / ProjectedPath | the command on its own, ready to draw or measure |
| `segment`, `endpoint` | string or `null` | labels carried by this command |
| `cp1`, `cp2` | Point | cubic control points (`s` is resolved to its implied first point) |
| `cp` | Point | quadratic control point (`t` resolved likewise) |
| `rx`, `ry`, `rotation` | number | arc radii and x-axis rotation in degrees |
| `largeArc`, `sweep` | boolean | arc flags |
| `center` | Point | computed arc center |

Kind-specific members exist only on their kind: reading `rx` from a line is the usual "property does not exist" error, so select with `command(a)` first.

`PathBlock.commands` and `.subPathCommands` return this same struct, so a program that read `cmd.command` or `cmd.end` before keeps working and now also sees labels.

### Endpoint

| Member | Type | Meaning |
|---|---|---|
| `point`, `x`, `y` | Point, number | where the command finished |
| `label` | string or `null` | the `as endpoint(...)` name, if any |
| `index` | number | position among the path's endpoints |
| `command` | Command | the command that ends here |
| `next` | Command or `null` | the command leaving this point; on a closed subpath the last endpoint's `next` is the first drawing command |
| `turn` | Angle | signed change of direction, wrapped to (−π, π] |
| `isJoint` | boolean | a drawing command arrives and another leaves |
| `fillet(r)`, `chamfer(d, d2?)`, `ellipticalFillet(rx, ry, rot?)` | method | corner operations, joints only — exactly what `vertex('name')` offered |

`vertex('name')` and `vertexAll('name')` return Endpoints.

### Call

| Member | Type | Meaning |
|---|---|---|
| `name` | string | the function or method name |
| `commands` | Command[] | what it emitted, in order |
| `block` | PathBlock / ProjectedPath | the emitted geometry as one block |
| `start`, `end` | Point | pen position before and after the statement |
| `index` | number | position among the path's calls |

### Segment

| Member | Type | Meaning |
|---|---|---|
| `label` | string | the `as segment(...)` name |
| `block` | PathBlock / ProjectedPath | the run — what `segment('name')` returns directly |
| `commands` | Command[] | its commands |
| `start`, `end` | Point | run endpoints |
| `length` | number | total arc length |
| `index` | number | position within its label group |

### Subpath

| Member | Type | Meaning |
|---|---|---|
| `index` | number | position among subpaths |
| `closed` | boolean | ends in `z` |
| `block` | PathBlock / ProjectedPath | the run as one block |
| `commands` | Command[] | its commands |
| `start`, `end` | Point | where the pen landed and finished |

On a `PathBlock` receiver, `block` members are path blocks re-based to their own origin, the same as `segment('name')`. On a layer or `ProjectedPath` receiver they are projected paths in page coordinates.

## When nothing matches

`query` follows `querySelector`: no match is an error that lists what the path actually has — its segment labels, endpoint labels, command letters, calls, or subpath count — so a typo is caught where it happens. `queryAll` follows `querySelectorAll` and returns an empty array, so it loops safely over things that might not exist.

Malformed selectors are errors too, naming the part that failed: an unknown noun lists the five nouns, an unknown filter lists the filters, a comma list that mixes nouns says so.

## Grammar

```
query      := selector ( ',' selector )*         one noun across the list
selector   := compound ( ' ' compound )*         right side searched inside the left
compound   := noun [ '(' arg (',' arg)* ')' ] filter* [ pseudo ]
noun       := command | call | endpoint | segment | subpath
filter     := '[' name [ op value ] ']'          op: = != < <= > >=
pseudo     := :first | :last | :nth( index-list )
index-spec := int | int..int | int..<int         negatives count from the end
```

## Subscriptions

When the drawing is spread across the program and the annotation should simply follow it, hand the same selector to [`subscribe`](#subscriptions-subscriptions): the compiler runs the query at the end of the program and calls your block once per match, in drawing order.

## The legacy methods

`segment`, `segmentAll`, `point`, `pointAll`, `vertex`, and `vertexAll` are the label-only shortcuts that predate `query`. They are unchanged, including the `:atomic` pseudo-selector, and are often the shortest spelling when all you want is a labeled block or point:

| Shortcut | Same as |
|---|---|
| `pb.segment('rib')` | `pb.query('segment(rib)').block` |
| `pb.segmentAll('rib')` | `pb.queryAll('segment(rib)')` mapped to `.block` |
| `pb.segmentAll('rim:atomic')` | `pb.queryAll('segment(rim) command')` mapped to `.block` |
| `pb.point('base')` | `pb.query('endpoint(base)').point` — except `point` prefers the authored corner on filleted vertices |
| `pb.vertex('base')` | `pb.query('endpoint(base)')` |
| `pb.commands` | `pb.queryAll('command')` |
