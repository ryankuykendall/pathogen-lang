# Examples

Practical examples showing how to use pathogen-lang for common tasks.

## Basic Shapes

### Simple Rectangle

```
rect(10, 10, 180, 80)
```

### Circle

```
circle(100, 100, 50)
```

### Rounded Rectangle

```
roundRect(20, 40, 160, 120, 15)
```

## Using Variables

### Centered Circle

```
let width = 200;
let height = 200;
let cx = calc(width / 2);
let cy = calc(height / 2);
let r = 40;

circle(cx, cy, r)
```

### Configurable Star

```
let centerX = 100;
let centerY = 100;
let outerR = 60;
let innerR = 25;
let points = 5;

star(centerX, centerY, outerR, innerR, points)
```

## Loops and Patterns

### Row of Circles

```
for (i in 0..5) {
  circle(calc(30 + i * 35), 100, 15)
}
```

### Grid of Dots

```
for (row in 0..5) {
  for (col in 0..5) {
    circle(calc(20 + col * 40), calc(20 + row * 40), 5)
  }
}
```

### Concentric Circles

```
let cx = 100;
let cy = 100;

for (i in 1..6) {
  circle(cx, cy, calc(i * 15))
}
```

## Trigonometry

### Points on a Circle

```
let cx = 100;
let cy = 100;
let r = 60;
let points = 8;

for (i in 0..points) {
  let angle = calc(i / points * TAU());
  let x = calc(cx + cos(angle) * r);
  let y = calc(cy + sin(angle) * r);
  circle(x, y, 5)
}
```

### Spiral

```
M 100 100
for (i in 1..100) {
  let angle = calc(i * 0.2);
  let r = calc(i * 0.8);
  L calc(100 + cos(angle) * r) calc(100 + sin(angle) * r)
}
```

### Sine Wave

```
M 0 100
for (i in 1..40) {
  let x = calc(i * 5);
  let y = calc(100 + sin(i * 0.3) * 30);
  L x y
}
```

### Flower Pattern

```
let cx = 100;
let cy = 100;
let petalCount = 6;
let petalRadius = 25;
let centerRadius = 15;

// Petals
for (i in 0..petalCount) {
  let angle = calc(i / petalCount * TAU());
  let px = calc(cx + cos(angle) * 35);
  let py = calc(cy + sin(angle) * 35);
  circle(px, py, petalRadius)
}

// Center
circle(cx, cy, centerRadius)
```

## Custom Functions

### Reusable Square

```
fn square(x, y, size) {
  rect(x, y, size, size)
}

square(10, 10, 50)
square(70, 10, 50)
square(130, 10, 50)
```

### Diamond Shape

```
fn diamond(cx, cy, size) {
  M cx calc(cy - size)
  L calc(cx + size) cy
  L cx calc(cy + size)
  L calc(cx - size) cy
  Z
}

diamond(100, 100, 40)
```

### Arrow

```
fn arrow(x1, y1, x2, y2, headSize) {
  // Line
  M x1 y1
  L x2 y2

  // Arrowhead (simplified)
  let angle = atan2(calc(y2 - y1), calc(x2 - x1));
  let a1 = calc(angle + 2.5);
  let a2 = calc(angle - 2.5);

  M x2 y2
  L calc(x2 - cos(a1) * headSize) calc(y2 - sin(a1) * headSize)
  M x2 y2
  L calc(x2 - cos(a2) * headSize) calc(y2 - sin(a2) * headSize)
}

arrow(20, 100, 180, 100, 15)
```

## Conditionals

### Size-Based Shape

```
let size = 80;

if (size > 50) {
  circle(100, 100, size)
} else {
  rect(calc(100 - size / 2), calc(100 - size / 2), size, size)
}
```

### Alternating Pattern

```
for (i in 0..10) {
  let x = calc(20 + i * 18);
  if (calc(i % 2) == 0) {
    circle(x, 100, 8)
  } else {
    rect(calc(x - 6), 94, 12, 12)
  }
}
```

## Complex Examples

### Gear Shape

```
let cx = 100;
let cy = 100;
let innerR = 30;
let outerR = 50;
let teeth = 12;

M calc(cx + outerR) cy

for (i in 0..teeth) {
  let a1 = calc(i / teeth * TAU());
  let a2 = calc((i + 0.3) / teeth * TAU());
  let a3 = calc((i + 0.5) / teeth * TAU());
  let a4 = calc((i + 0.8) / teeth * TAU());

  L calc(cx + cos(a1) * outerR) calc(cy + sin(a1) * outerR)
  L calc(cx + cos(a2) * outerR) calc(cy + sin(a2) * outerR)
  L calc(cx + cos(a3) * innerR) calc(cy + sin(a3) * innerR)
  L calc(cx + cos(a4) * innerR) calc(cy + sin(a4) * innerR)
}

Z

// Center hole
circle(cx, cy, 10)
```

### Recursive-Style Tree (using loops)

```
// Simple branching pattern
fn branch(x, y, length, angle, depth) {
  let x2 = calc(x + cos(angle) * length);
  let y2 = calc(y + sin(angle) * length);
  M x y
  L x2 y2
}

let startX = 100;
let startY = 180;

// Trunk
M startX startY
L startX 120

// Main branches
for (i in 0..5) {
  let angle = calc(-1.57 + (i - 2) * 0.4);
  let len = calc(30 - abs(i - 2) * 5);
  branch(startX, 120, len, angle, 0)
}
```

## Tips

1. **Start simple**: Build complex shapes from simple parts
2. **Use variables**: Makes code readable and adjustable
3. **Extract functions**: Reuse common patterns
4. **Test incrementally**: Generate SVGs often to see results
5. **Use comments**: Document your intent for complex sections
