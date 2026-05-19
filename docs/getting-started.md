# Getting Started

pathogen-lang is a language that extends SVG path syntax with variables, expressions, control flow, and functions. It compiles to standard SVG path data that works in any browser or graphics application.

## Your First Path

Try this simple example in the playground:

```
define ViewBox(0, 0, 200, 200);
define default PathLayer('main-path-layer') ${
  fill: #bbb;
  stroke: #222;
  stroke-width: 1;
};

// A simple rectangle using variables
let size = 50
let x = 10
let y = 10

M x y
h size
v size
h calc(-size)
Z
```

Every Pathogen program starts with a [`define ViewBox`](#viewbox) declaring the canvas, and typically one or more [layer definitions](#layers) describing how strokes and fills should look.

This creates a rectangle by:
1. Moving to position (10, 10)
2. Drawing a horizontal line of length 50
3. Drawing a vertical line of length 50
4. Drawing a horizontal line back
5. Closing the path

## Why pathogen-lang?

SVG paths are powerful but writing them by hand is tedious:

```
// Standard SVG - repetitive coordinates
M 20 20 L 80 20 L 80 80 L 20 80 Z
M 100 20 L 160 20 L 160 80 L 100 80 Z
M 180 20 L 240 20 L 240 80 L 180 80 Z
```

With pathogen-lang, you can use variables and loops:

```
// pathogen-lang - DRY and readable
let size = 60
for (i in 0..3) {
  rect(calc(20 + i * 80), 20, size, size)
}
```

## Key Features

### Variables

Store and reuse values:

```
let width = 200
let height = 100
let centerX = calc(width / 2)
```

### Expressions with calc()

Use math in path commands:

```
let r = 50
M calc(100 - r) 100
L calc(100 + r) 100
```

### Loops

Repeat patterns easily:

```
for (i in 0..10) {
  circle(calc(20 + i * 30), 100, 10)
}
```

### Functions

Define reusable shapes:

```
fn square(x, y, size) {
  rect(x, y, size, size)
}

square(10, 10, 50)
square(70, 10, 50)
```

### Built-in Shapes

Common shapes are included:

```
circle(100, 100, 50)
rect(10, 10, 80, 60)
polygon(100, 100, 40, 6)  // hexagon
star(100, 100, 50, 25, 5)
```

## Next Steps

- **Syntax Reference** - Learn all the language features
- **Standard Library** - Explore built-in functions
- **Examples** - See practical patterns and recipes
