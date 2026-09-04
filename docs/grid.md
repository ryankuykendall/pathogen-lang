# Grid

A `Grid` is a fixed-shape, mutable, two-dimensional container of values that maps cells to canvas coordinates. It removes the need to hand-build nested arrays, exposes spatial helpers like `getPoint(row, col)`, and supports both nearest-cell and bilinear sampling at arbitrary canvas positions — the primitives you need for flow fields, heatmaps, mesh sampling, and look-up tables.

Pathogen arrays throw on out-of-bounds access; `Grid` gives you `'clamp'`, `'wrap'`, and `'null'` modes for spatial code where reading outside the defined region is expected — particle traces, edge-sampling kernels, toroidal flow fields.

Grids are values, not SVG elements. They do not produce `<defs>`; they hold data that other layers consume.

> **Not to be confused with** the stdlib `squareGrid()`, `triangleGrid()`, and `hexagonGrid()` functions — those return SVG path data for visual lattices (lines, dots, shapes). `Grid()` here is a data container for values mapped to canvas coordinates.

## Creating a Grid

Use the `Grid()` constructor with a row count, a column count, and an options object. A trailing block `{|grid| ... }` binds the newly-created grid so you can populate it:

```
let field = Grid(20, 20, { xDim: 10, yDim: 10 }) {|g|
  g.fill {|row, col, center|
    return calc(sin(row / g.rows) + cos(col * 3 / g.cols));
  };
};
```

After construction, `field` is a 20×20 grid spanning a 200×200 region (`cols * xDim` × `rows * yDim`), with each cell holding the value the `fill` block returned.

Constructor signature: `Grid(rows, cols, options)` — `rows` and `cols` are positive integers, `options` is an object literal. All keys in `options` are optional.

> **Argument order is rows first, then cols** (matching matrix / image conventions). For a 200×200 viewBox split into 10-unit cells you write `Grid(20, 20, { xDim: 10, yDim: 10 })`. Cell access is the same: `grid.get(row, col)`, `grid.getPoint(row, col)`.

The trailing block `{|g| ... }` runs once at construction. Inside the block you can call `g.set(r, c, v)`, `g.fill { ... }`, or anything else that builds the cells. For uniform grids you can skip the block entirely by passing `defaultValue` in the options.

## Constructor options

| Key             | Type    | Default        | Purpose                                                                                                |
|-----------------|---------|----------------|--------------------------------------------------------------------------------------------------------|
| `xDim`          | number  | `1`            | Cell width in canvas units. Total grid width is `cols * xDim`.                                         |
| `yDim`          | number  | `1`            | Cell height in canvas units. Total grid height is `rows * yDim`.                                       |
| `origin`        | Point   | `Point(0, 0)`  | Top-left corner of the grid in canvas space. Cell `(r, c)` center is at `origin.x + (c+0.5)*xDim, origin.y + (r+0.5)*yDim`. |
| `defaultValue`  | any     | `null`         | Initial value for every cell. Lets you skip an init block when all cells start equal.                  |
| `outOfBounds`   | string  | `'clamp'`      | Sampling behavior when `(x, y)` falls outside the grid: `'clamp'` (use the nearest edge cell), `'wrap'` (toroidal — wrap around), or `'null'` (return `null`). |
| `interpolation` | string  | `'nearest'`    | Default mode for `.sample(x, y)`: `'nearest'` or `'bilinear'`. You can always call `.sampleBilinear(x, y)` explicitly. |

`outOfBounds: 'wrap'` is the common choice for flow fields — it makes the field seamless when a particle drifts off one edge and reappears on the other.

## Members

| Property  | Type    | Description                                  |
|-----------|---------|----------------------------------------------|
| `rows`    | number  | Row count.                                   |
| `cols`    | number  | Column count.                                |
| `xDim`    | number  | Cell width.                                  |
| `yDim`    | number  | Cell height.                                 |
| `origin`  | Point   | Grid top-left in canvas space.               |
| `width`   | number  | Total spatial width: `cols * xDim`.          |
| `height`  | number  | Total spatial height: `rows * yDim`.         |

## Cell access

### `get(row, col)`

Returns the value stored at `(row, col)`. Bounds-checked — throws if `row` or `col` is out of range.

```
let v = field.get(3, 7);
```

### `set(row, col, value)`

Writes `value` at `(row, col)`. Returns the grid itself so calls can be chained. Bounds-checked.

```
field.set(0, 0, 1.5);
field.set(0, 1, 2.0).set(0, 2, 2.5);
```

### `getPoint(row, col)`

Returns the cell's **center** as a `Point` in canvas space:

```
let p = field.getPoint(3, 7);   // Point at canvas coords (75, 35) given xDim/yDim of 10
```

This is the same vocabulary used by `MeshGradient` — once you know it for one, you know it for both.

### `getRow(row)` and `getCol(col)`

Return an array of the row's or column's cell values. Useful for sweeps, reductions, or rendering one row at a time.

### `cells()`

Returns a flat row-major array of every cell value. Useful for reductions:

```
let total = field.cells().reduce(0) {|acc, v| return calc(acc + v); };
```

## Iteration

### `fill {|row, col, center| ... }`

Mutates **every cell** using the block's return value. This is the declarative replacement for nested init loops:

```
field.fill {|row, col, center|
  return calc(sin(row / field.rows) + cos(col * 3 / field.cols));
};
```

The block receives the cell's row, col, and center point. `fill` mutates in place and returns the grid for chaining.

A reusable field function (a *worker*) applies with `<<` instead of a
block — `field.fill() << waveFn;` — see
[Applying workers](#syntax-applying-workers). The same applies to
`forEach` and `map` below.

### `forEach {|cell, row, col, center| ... }`

Iterates every cell in row-major order for side effects. The standard way to draw something *at* each cell:

```
field.forEach {|angle, row, col, center|
  arrowPB.rotateAtVertexIndex(0, angle).drawTo(center.x, center.y);
};
```

### `map {|cell, row, col, center| ... }`

Returns a **new grid** with the same rows/cols/xDim/yDim/origin but with every cell replaced by the block's return value. The original grid is unchanged. Use this when you want a derived grid (e.g., the curl of a velocity field) without losing the original.

## Sampling at arbitrary positions

A grid only stores values at discrete cell centers. Sampling answers the question "what value would this grid have at canvas position `(x, y)`?" where `(x, y)` rarely lines up with a cell center.

### `sampleNearest(x, y)`

Snaps `(x, y)` to the nearest cell and returns that cell's value. Fast but produces visibly stepped transitions between cells — fine for low-resolution decoration, not great for smooth particle integration.

### `sampleBilinear(x, y)`

Blends the four surrounding cells weighted by `(x, y)`'s position between them. Requires numeric cell values. Produces a smooth, continuous field — see the primer below.

### `sample(x, y)`

Dispatches to `sampleNearest` or `sampleBilinear` depending on the grid's `interpolation` option. Useful when you want the call site to be agnostic about which mode the grid was configured with.

Out-of-bounds behavior for all three is controlled by the grid's `outOfBounds` option.

## Example: a flow-field arrow grid

A flow field is a 2D grid where each cell stores a direction; visualizing it draws an arrow at each cell, rotated by that direction.

> **Two cell representations for flow fields, choose by use case:**
> - **Storing scalar angles** (this section) — fine when you only render at cell centers via `forEach`. Simpler to write and reason about.
> - **Storing unit vectors** `Point(cos(a), sin(a))` (see [the bilinear-sampling primer below](#grid-bilinear-sampling-what-it-is-and-when-to-use-it)) — required if you'll sample between cells (e.g., to trace a particle through the field via `sampleBilinear`). Raw-angle bilinear interpolation produces wrong directions at every wrap-around; vector-component interpolation is the standard fix.

```
define ViewBox(0, 0, 200, 200);

let arrowMarker = Marker('arrowhead', 10, 10) {|m|
  m.append(@{ m 0 0 l 10 5 l -10 5 z }, #{ fill: context-stroke; });
};

let arrowPB = @{ m 0 0 m -3 0 h 6 };

let field = Grid(20, 20, { xDim: 10, yDim: 10, outOfBounds: 'wrap' }) {|g|
  g.fill {|row, col, center|
    return calc(sin(row / g.rows) + cos(col * 3 / g.cols));
  };
};

define PathLayer('flow-vectors') #{
  stroke-width: 0.2;
  stroke: Color('#0c0');
  marker-end: arrowMarker;
}

layer('flow-vectors').apply {
  field.forEach {|angle, row, col, center|
    arrowPB.rotateAtVertexIndex(0, angle).drawTo(center.x, center.y);
  };
}
```

The grid's `xDim`/`yDim` does all the cell-center arithmetic, so changing the resolution to 40×40 is a one-number edit.

## Bilinear sampling — what it is and when to use it

Your grid stores values at cell centers. For a 20×20 grid, that's 400 known values. When you need to read at a canvas position **between** cells — for example, when tracing a particle through a flow field — you have two choices:

- **Nearest-cell** snaps to the closest cell. Cheap, but the value jumps abruptly at cell boundaries, so a traced particle zig-zags visibly between cells.
- **Bilinear** blends the four surrounding cells weighted by how close `(x, y)` is to each. The field becomes smooth and continuous.

### The math

The pseudocode below is what `sampleBilinear` does internally; you don't write any of it yourself.

Given canvas position `(x, y)`, convert to fractional grid coordinates (cell centers are at integer values):

```text
fc = (x - origin.x) / xDim - 0.5
fr = (y - origin.y) / yDim - 0.5
c0 = floor(fc),  c1 = c0 + 1
r0 = floor(fr),  r1 = r0 + 1
fx = fc - c0     // in [0, 1]
fy = fr - r0
```

Read the four surrounding cells and lerp twice horizontally, then once vertically:

```text
v00 = cell[r0][c0]
v01 = cell[r0][c1]
v10 = cell[r1][c0]
v11 = cell[r1][c1]

top    = v00 * (1 - fx) + v01 * fx
bottom = v10 * (1 - fx) + v11 * fx
result = top * (1 - fy) + bottom * fy
```

Three linear interpolations, hence "bi-linear." Out-of-bounds reads (when `r0 < 0`, `c1 >= cols`, etc.) are resolved by the grid's `outOfBounds` option before the lerps run.

### The angle-wraparound catch

If your cells store **raw angles** (radians or degrees) you cannot bilinearly interpolate them directly. The angles `0.01` and `2π - 0.01` are visually nearly the same direction, but their linear average is `π` — the opposite direction. Bilinear on raw angles produces nonsense at every wrap-around.

The clean fix is to **store unit vectors** instead. Each cell holds a `Point(cos(angle), sin(angle))`. Bilinearly interpolate `x` and `y` separately, then take `atan2(y, x)` to recover a smoothed angle:

```
let field = Grid(20, 20, { xDim: 10, yDim: 10, outOfBounds: 'wrap' }) {|g|
  g.fill {|row, col, center|
    let a = calc(sin(row / g.rows) + cos(col * 3 / g.cols));
    return Point(cos(a), sin(a));
  };
};

// Later, when sampling:
let v = field.sampleBilinear(particle.x, particle.y);
let smoothedAngle = atan2(v.y, v.x);
```

Bilinear interpolation of unit vectors does shrink the result slightly (a sampled point lying between two opposite-pointing unit vectors will have length near zero), but for direction extraction via `atan2` the magnitude is irrelevant. This is the standard approach in generative-art flow-field codebases.

## See also

- [Markers](#markers-markers) — uses the same trailing-block construction pattern.
- [Path Blocks](#path-blocks-path-blocks) — `rotateAtVertexIndex` and `drawTo` are the natural way to render arrows at each cell.
- [Gradients](#gradients-gradients) — `MeshGradient` interpolates colors across an SVG patch; `Grid` stores arbitrary values your code reads back via `get`, `sample`, etc. The vocabulary overlaps (`getPoint`, `getRow`, `getCol`) but the runtime roles are distinct.
- [Stdlib `squareGrid`/`triangleGrid`/`hexagonGrid`](#stdlib-standard-library-reference) — produce SVG path data for visual lattices; not data containers.
