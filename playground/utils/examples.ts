// Example code snippets for the playground

export const examples: Record<string, string> = {
  circle: `// Simple circle
circle(100, 100, 50)`,

  star: `// 5-pointed star
let cx = 100;
let cy = 100;
let outerR = 60;
let innerR = 25;
let points = 5;

star(cx, cy, outerR, innerR, points)`,

  grid: `// Grid of dots using nested loops (5x5)
for (row in 0..4) {
  for (col in 0..4) {
    circle(calc(20 + col * 40), calc(20 + row * 40), 5)
  }
}`,

  spiral: `// Spiral using trigonometry
M 100 100
for (i in 1..100) {
  let angle = calc(i * 0.2);
  let r = calc(i * 0.8);
  L calc(100 + cos(angle) * r) calc(100 + sin(angle) * r)
}`,

  flower: `// Flower with petals
let cx = 100;
let cy = 100;
let petalCount = 6;
let petalRadius = 25;
let centerRadius = 15;

// Petals (0 to petalCount-1 for correct count)
for (i in 0..calc(petalCount - 1)) {
  let angle = calc(i / petalCount * TAU());
  let px = calc(cx + cos(angle) * 35);
  let py = calc(cy + sin(angle) * 35);
  circle(px, py, petalRadius)
}

// Center
circle(cx, cy, centerRadius)`,

  sineWave: `// Sine wave
M 0 100
for (i in 1..40) {
  let x = calc(i * 5);
  let y = calc(100 + sin(i * 0.3) * 30);
  L x y
}`,

  gear: `// Gear shape
let cx = 100;
let cy = 100;
let innerR = 30;
let outerR = 50;
let teeth = 12;

M calc(cx + outerR) cy

for (i in 0..calc(teeth - 1)) {
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
circle(cx, cy, 10)`,

  customFunction: `// Custom function: diamond shape
fn diamond(cx, cy, size) {
  M cx calc(cy - size)
  L calc(cx + size) cy
  L cx calc(cy + size)
  L calc(cx - size) cy
  Z
}

// Draw diamonds in a row
for (i in 0..4) {
  diamond(calc(40 + i * 45), 100, 20)
}`,

  descending: `// Descending ranges: shrinking circles
let cx = 100;
let cy = 100;

// Circles shrink from radius 80 down to 10
for (r in 80..10) {
  if (calc(r % 10) == 0) {
    circle(cx, cy, r)
  }
}

// Staircase going down (right to left)
M 180 20
for (i in 8..1) {
  h -20
  v 20
}
h -20`,

  polarPath: `// Polar coordinates and tangent functions
// Create an S-curve with smooth arcs

M 20 100

// Start going right
polarLine(0, 40)

// Smooth 90° turn downward
tangentArc(25, 90deg)

// Short straight segment
tangentLine(20)

// Smooth 90° turn back (negative = opposite curve)
tangentArc(25, -90deg)

// Finish going right
tangentLine(40)

// Draw reference points using polarPoint
M 100 50
let pt1 = polarPoint(45deg, 30);
circle(pt1.x, pt1.y, 5)
let pt2 = polarPoint(135deg, 30);
circle(pt2.x, pt2.y, 5)
let pt3 = polarPoint(225deg, 30);
circle(pt3.x, pt3.y, 5)
let pt4 = polarPoint(315deg, 30);
circle(pt4.x, pt4.y, 5)
circle(100, 50, 3)`,
};

export const defaultCode = `// Welcome to Pathogen!
// Try editing this code or select an example above.

let cx = 100;
let cy = 100;

// Draw a circle
circle(cx, cy, 40)

// Draw 8 points around it
for (i in 0..7) {
  let angle = calc(i / 8 * TAU());
  let x = calc(cx + cos(angle) * 70);
  let y = calc(cy + sin(angle) * 70);
  circle(x, y, 8)
}`;
