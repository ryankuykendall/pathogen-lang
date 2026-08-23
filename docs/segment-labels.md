# Segment Labels & Corner Suffixes

Segment labels and corner suffixes let you annotate a path **at the point you define it**. Two small clauses attach to any path command:

- **`as`** gives a command (or the vertex it lands on) a **name**, so you can look it up later by that name instead of by a fragile numeric index.
- **`with`** attaches a **corner operation** — a fillet or chamfer — to the joint the command creates, rounding or cutting it without restructuring your code.

Both clauses read left to right like English and work everywhere path commands do: inside `@{ }` [path blocks](#path-blocks-path-blocks), inside `layer('name').apply { }` blocks, and at the top level.

```
define ViewBox(0, 0, 120, 80);
define default PathLayer('shape') ${ stroke: #333; stroke-width: 2; fill: none; }

M 10 10
h 60 as segment('top');
v 40 with fillet(8) as endpoint('corner');
h -60;
```

Here `top` names the first horizontal edge, the vertical edge rounds the corner where it meets the top with an 8-unit fillet, and `corner` names the vertex at the end of that edge. Later code can ask the path for `segment('top')`, `point('corner')`, or `vertex('corner')` by name.

## Syntax

A path command may carry an optional `with` clause and an optional `as` clause, in that order:

```
<command> <args> [with <corner-op>] [as <label> (, <label>)*] ;
```

Rules:

- The `with` clause comes **before** the `as` clause.
- At most **one** `with` clause and **one** `as` clause per command.
- Only the `as` clause takes a **comma-separated list** — a single command can carry several labels (for example both a segment name and an endpoint name).
- The trailing `;` is **optional** on path commands, exactly as it is on plain commands.

```
// all valid
h 60 as segment('top');
v 40 with fillet(8);
v 40 with fillet(8) as endpoint('corner');
h -60 as segment('base'), endpoint('base-end');
```

The same clauses attach to **statement functions** — stdlib generators like `circle`, `rect`, and `polygon` — which do end with a semicolon:

```
circle(0, 0, 20) as segment('rim');
rect(0, 0, 40, 20) as segment('panel'), endpoint('panel-end');
```

A statement function can emit many commands. The `as segment(...)` label names the **whole range** those commands produce, so `segment('rim')` returns the entire circle.

## Labels

Labels name parts of a path so you can query them later. There are two kinds, matching the two things a path is made of — its edges and its vertices.

### `as segment('name')`

Names the command (or command range) itself. Query it with [`segment('name')`](#segment-labels-querying-labels) to get a sub-path you can sample, measure, and decorate.

```
h 60 as segment('lid');
circle(0, 0, 20) as segment('rim');
```

### `as endpoint('name')`

Names the **vertex** the command lands on — the point at its end. Query it two ways: [`point('name')`](#segment-labels-querying-labels) for the coordinate (useful as a `drawTo` target), and [`vertex('name')`](#segment-labels-querying-labels) for a handle that can round or cut the corner.

```
v 40 as endpoint('shoulder');
```

### Both at once

Because the `as` clause takes a list, one command can name both its edge and its ending vertex:

```
h -60 as segment('base'), endpoint('base-end');
```

### Group labels and computed labels

Labels don't have to be unique, so the natural way to label loop-generated geometry is to reuse **one name** and query the group with [`segmentAll`](#segment-labels-querying-labels):

```
define ViewBox(0, 0, 200, 120);
define default PathLayer('ribs') ${ stroke: #333; stroke-width: 2; fill: none; }

M 10 60
for (i in 0..5) {
  v -30 as segment('rib');
  v 30;
  h 30;
}
```

All six ribs share the name `rib`; `segmentAll('rib')` returns them in authoring order. When members need *distinct* names — say, to look one up individually — a label name is an expression, so `${ }` interpolation works:

```
v -30 as segment(`rib-${i}`);
```

That produces `rib-0` through `rib-5` (ranges are inclusive), each individually addressable with the singular `segment('rib-3')`.

## Corner Suffixes

The `with` clause attaches a corner operation to the joint a command creates — the vertex between the **previous** command and this one. It is the definition-site spelling of the [`fillet` and `chamfer`](#path-blocks-fillets) methods: instead of rounding a corner after the fact by its index, you round it right where you draw it.

### `with fillet(radius)`

Rounds the joint with a circular arc of the given radius, trimming the two adjacent edges so the arc sits tangent to both:

```
define ViewBox(0, 0, 100, 100);
define default PathLayer('box') ${ stroke: #333; stroke-width: 2; fill: none; }

M 20 20
h 60;
v 60 with fillet(10);
h -60;
z;
```

The fillet trims the incoming and outgoing edges exactly as `.fillet()` does — the rounded result is shorter along both edges than the sharp corner would be.

### `with chamfer(distance)` / `with chamfer(d1, d2)`

Cuts the joint with a straight bevel. One distance chamfers symmetrically; two distances trim the incoming and outgoing edges independently:

```
v 60 with chamfer(10);
v 60 with chamfer(6, 14);
```

### Recorded at definition, applied at finalization

Corner suffixes do **not** rewrite the command as you write it. The operation is recorded on the joint and applied when the path is finalized — when the `@{ }` block closes, or when a layer is emitted. Two consequences follow:

- **Your authored geometry is preserved.** The pen still moves by the extents you wrote; `ctx.position` mid-path reflects the sharp corner, not the trimmed one. The trimming happens at the end, so the cursor math you do between commands stays predictable.
- **Labels survive the operation.** A segment or endpoint label on a filleted command still resolves after the corner is rounded. On **PathBlock** values and **layer** queries, endpoint labels name the **authored** vertex: if a corner op trims the corner a label sits on, `point('name')` still answers with the sharp corner you wrote, not the trimmed edge. On a **ProjectedPath** (the result of `project()`/`draw()`/`drawTo()`), queries answer the projected, finalized geometry — a filleted corner's labeled point is the trimmed tangent point.

### Junction support

`with fillet(...)` and `with ellipticalFillet(...)` follow the same rules as the [`fillet`](#path-blocks-fillets) methods: tangent-based rounding that skips tangent-collinear junctions; junctions involving curves follow the same tangent math. `with chamfer(...)` works at junctions between **all** command types — lines, curves, and arcs — matching [`chamfer`](#path-blocks-chamfers). If a radius or chamfer distance is larger than an adjacent edge, it is clamped to the edge length and a warning is logged.

## Querying Labels

Labels exist to be looked up. A path with labels answers three questions by name, on both [`PathBlock`](#path-blocks-path-blocks) and `ProjectedPath` values:

| Query | Returns | Use for |
|---|---|---|
| `pb.segment('name')` | `PathBlock` | The **first** segment matching the name |
| `pb.segmentAll('name')` | array of `PathBlock` | **Every** segment sharing the name, in authoring order |
| `pb.point('name')` | `Point` | The first named vertex — a `drawTo`/layout target |
| `pb.pointAll('name')` | array of `Point` | Every vertex sharing the name |
| `pb.vertex('name')` | vertex handle | Rounding or cutting the first named corner |
| `pb.vertexAll('name')` | array of handles | Every corner sharing the name |

The pairing follows the model you already know from the DOM: `segment` is `querySelector` (first match), `segmentAll` is `querySelectorAll` (all matches). Labels don't have to be unique — a name shared by several statements forms a **group**, which makes loops natural:

```
let comb = @{
  for (i in 0..4) {
    v -20 as segment('tooth');
    v 20;
    h 12;
  }
};

// five teeth, one name, no index bookkeeping
for (tooth in comb.segmentAll('tooth')) {
  log(tooth.length);
}
```

Consecutive same-labeled statements merge into one segment; runs separated by other commands are distinct group members. Singular queries error when the name matches nothing (listing what the path has); the `All` queries return an empty array instead, so they loop safely over names that might not exist.

### `segment('name')` → PathBlock

Returns the labeled command range as a full PathBlock, with every geometry method — `get`, `tangent`, `normal`, `partition`, `boundingBox`, and the rest:

```
let outline = @{
  h 60 as segment('lid');
  v 40;
  h -60;
};

// decorate evenly along just the lid
let lid = outline.segment('lid');
for (op in lid.partition(6)) {
  circle(op.point.x, op.point.y, 2);
}
```

### `point('name')` → Point

Returns the coordinate of a named vertex — ready to use as a `drawTo` anchor so shapes align to a named location instead of a hand-computed one:

```
let frame = @{
  h 80 as endpoint('hinge');
  v 50;
  h -80;
};
let proj = frame.project(10, 10);

let tab = @{ circle(0, 0, 6); };
tab.drawTo(proj.point('hinge').x, proj.point('hinge').y);
```

On a `ProjectedPath`, `point('name')` returns **absolute** coordinates; on an unprojected `PathBlock` the coordinates are relative to the block origin.

### `vertex('name')` → vertex handle

Returns a handle for the named corner. The handle exposes `.fillet(radius)`, `.chamfer(distance)` / `.chamfer(d1, d2)`, and `.ellipticalFillet(rx, ry)`, each returning a new path with that corner operation applied — the name-based counterpart to [`filletAtVertex`](#path-blocks-filletatvertexindex-radius-pathblock-projectedpath) that never breaks when you add a command earlier in the path:

```
let box = @{
  h 60 as endpoint('corner');
  v 40;
  h -60;
  z;
};

let rounded = box.vertex('corner').fillet(8);
rounded.drawTo(10, 10);
```

This is exactly why labels beat indices: inserting a command above `corner` shifts every vertex index, but `vertex('corner')` still points at the same joint.

### Querying layers

Layers built with `apply { }` are queryable by the same names. `layer('name').segment('label')` returns the labeled range in the layer's absolute coordinates, and `.point(...)` / `.vertex(...)` work the same way:

```
define ViewBox(0, 0, 200, 120);
define default PathLayer('road') ${ stroke: #333; stroke-width: 2; fill: none; }
define PathLayer('markers') ${ fill: #cc0000; }

layer('road').apply {
  M 10 60
  h 180 as segment('main');
}

// space dots along the named road segment
layer('markers').apply {
  for (op in layer('road').segment('main').partition(9)) {
    circle(op.point.x, op.point.y, 3);
  }
}
```

## Labels Survive Derived Paths

Operations that produce a new PathBlock or ProjectedPath carry your labels with them. A path labeled `as segment('rim')` still answers `segment('rim')` after it has been transformed, combined, or cut:

- **Transforms**: `reverse`, `offset`, `mirror`, `scale`, `rotate`, `rotateAtVertexIndex`, `subPath`
- **Corner shaping**: `fillet`, `chamfer`, `ellipticalFillet` and their `AtVertex` variants
- **Set operations**: `union`, `difference`, `intersection`, `xor` — labels from *both* operands coexist in the result
- **Cutting**: [`cut()`](#path-blocks-cutting-paths) — pieces keep the subject's labels on their surviving boundary fragments

**Cut seams are labeled for you.** Every healed edge a cut creates — the cutter's strokes where they sealed a piece shut, a cookie cutter's stamped boundary (in both the stamped piece and the hole it left), and any bridging segments — carries the segment label `cut`. That makes the seams queryable like any other group:

```
let pieces = shape.cut(knife);
for ([p, i] in pieces) {
  // Project the piece to where it is drawn — the projected form answers
  // queries in absolute coordinates (segment() sub-blocks are rebased).
  let placed = p.project(20, 20);
  for (seam in placed.segmentAll('cut')) {
    for (op in seam.partition(4)) {
      circle(op.point.x, op.point.y, 1.5);
    }
  }
}
```

If you label your own geometry `as segment('cut')`, it merges into the same group — labels form groups by design.

**What to know about derived labels:**

- **Runs merge.** Adjacent commands with the same label merge into one queryable run, so two seam edges that meet end-to-end come back from `segmentAll('cut')` as a single run, not two.
- **Queries answer finalized geometry.** A derived block's `point()`/`vertex()` answer the geometry as it exists after the operation — e.g. the trimmed corner after a fillet, not the authored sharp one (the authored-position preference applies only to the original block).
- **Reversal moves endpoint labels correctly** — an `as endpoint(...)` name stays on its vertex when a path is reversed. One exception: on an *open* path, an endpoint label on the final vertex does not survive `reverse()` (that vertex becomes the start point, which carries no command metadata).
- **Corner-op suffixes don't carry.** A pending `with fillet(...)` is consumed by the block it was written in; it never re-applies on a derived path.
- **Labels on `m` commands survive only point-mapping transforms.** A label on a move command (e.g. `m 10 10 as endpoint('start')`) carries through `mirror()`, `scale()`, `rotate()`, `rotateAtVertexIndex()`, and `offset()`, which map commands one-to-one — but `reverse()`, `subPath()`, the boolean operations, and `cut()` rebuild the path from its drawing commands and drop moves along the way, taking their labels with them. Prefer labeling a drawing command.
- **Excluded**: `variableOffset` and `compoundVariableOffset` resample the geometry entirely, so there is no correspondence to carry labels through — their results are unlabeled.
- The cutter's own labels do not propagate into cut pieces; its strokes become the `cut` seams.

## Errors & Notes

- **Shared labels form groups.** Label names do **not** have to be unique: reusing `segment('rib')` across several statements creates a group, and `segmentAll('rib')` returns every member (singular `segment('rib')` returns the first, querySelector-style). The same applies to `endpoint` labels via `pointAll`/`vertexAll`. Segment and endpoint labels are separate namespaces, so `segment('x')` and `endpoint('x')` may coexist (they answer different queries).
- **`with` needs a previous joint.** A corner suffix rounds the joint between the previous command and this one, so it needs a previous command in the current subpath. `with fillet(...)` on the first command of a block, or on the first command after an `m`/`M` that opens a new subpath, is a compile error — there is no corner to operate on. (This mirrors the "no previous heading" error from `tangentArc`.)
- **Clause ordering.** `with` must precede `as`, each may appear at most once, and only `as` takes a comma list. `as segment('x') with fillet(5)` (wrong order) and two `with` clauses on one command are both errors.
- **Unknown labels.** A singular query for a name that was never defined — `pb.segment('nope')` — is an error that lists the labels the path actually has, so a typo tells you what was available. The `All` queries return an **empty array** instead of erroring, matching `querySelectorAll`, so `for (x in pb.segmentAll('maybe'))` is safe without a guard.
- **Vertex corner ops: PathBlocks for now.** `vertex('name').fillet(...)` and its siblings apply on `PathBlock` and `ProjectedPath` sources. On a **layer** vertex handle they report that corner operations are not supported on layers yet — layer and projected `segment`/`point` queries work fully; only the vertex-handle corner operations are deferred.
