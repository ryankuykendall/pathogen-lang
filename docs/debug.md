# Debug & Console

The playground includes debugging tools to help you understand how your code executes and inspect values during evaluation.

## Console Output

Click the **Console** button in the header to view debug output.

## log() Function

Use `log()` to inspect values during execution:

```
log("message")           // String message
log(myVar)               // Variable with label
log("pos:", ctx.position) // Multiple args
log(ctx)                 // Full context object
```

### Output Format

String arguments display as-is. Other expressions show a label with the source:

```
log("radius is", r)
// Output:
// radius is
// r = 50
```

Objects are expandable in the console - click the arrow to explore nested properties.

[Angle values](#syntax-angle-units) log in their written unit (`90deg`, `0.5pi`) rather than as a radians number — use `.rad` or `.deg` to log a bare number.

## ctx Object

The `ctx` object tracks path state during evaluation:

### ctx.position

Current pen position after the last command.

| Property | Description |
|----------|-------------|
| `ctx.position.x` | X coordinate |
| `ctx.position.y` | Y coordinate |

```
M 100 50
log(ctx.position)  // {x: 100, y: 50}
L 150 75
log(ctx.position)  // {x: 150, y: 75}
```

### ctx.start

Subpath start position (set by `M`/`m`, used by `Z`).

| Property | Description |
|----------|-------------|
| `ctx.start.x` | X coordinate |
| `ctx.start.y` | Y coordinate |

### ctx.commands

Array of all executed commands with their positions:

```
// Each entry contains:
{
  command: "L",        // Command letter
  args: [150, 75],     // Evaluated arguments
  start: {x: 100, y: 50},
  end: {x: 150, y: 75}
}
```

## Using ctx in Paths

Access position values with `calc()`:

```
M 50 50
// Draw relative to current position
L calc(ctx.position.x + 30) ctx.position.y
circle(ctx.position.x, ctx.position.y, 5)
```

## Example: Debug a Loop

```
M 20 100
for (i in 0..4) {
  log("iteration", i, ctx.position)
  L calc(ctx.position.x + 40) 100
}
```

This logs the iteration number and current position at each step, helping you trace how the path is constructed.
