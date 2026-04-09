# Pathogen Formatting Style Questionnaire

## How to Use

For each snippet below you'll find:

1. **Category** — the formatting decision being tested
2. **Raw snippet** — deliberately messy or inconsistent formatting
3. **Pay attention to** — what aspects matter for this decision
4. **Your preferred version** — reformat the snippet how you want it
5. **Commentary** — explain *why* ("I want breathing room here", "these are always read together", etc.)

Your reformatted versions become the canonical formatting spec and golden-file test fixtures for the Pathogen formatter. Take your time — these decisions cascade into TextMate grammar snippets and VS Code completions too.

---

## 1. Indentation Depth and Nesting

**Decision:** How many spaces per indent level? What happens at 3–4 nesting levels?
Two spaces at all levels, including at 3-4+.

**Raw snippet:**
```pathogen
for ([d, i] in data) {
  let sliceFrom = calc(startOffset + i * sliceAngle);
  let sliceTo = calc(sliceFrom + barSweep);
  if (d.all > 0) {
    let outerR = calc(barInnerR + (maxR - barInnerR) * d.all / maxVal);
    let barLayer = PathLayer(`bar-all-${i}`) ${ 
      fill: allBarColor;
      stroke: bgColor;
      stroke-width: 1; 
    };
    catGroup.append(barLayer);
    barLayer.apply {
      M cx cy
      radialWedge(barInnerR, 
          outerR, 
          sliceFrom, 
          sliceTo, 
          cornerR);
    }
  }
}
```

**Pay attention to:** Number of spaces per level. Whether the innermost body (path commands inside `.apply` inside `if` inside `for`) still gets indented or whether you cap nesting depth. Whether `M cx cy` at depth 4 looks reasonable.

**Your preferred version:**
```pathogen

```

**Commentary:**
This seems very straight forward...we can consistently do two spaces.

---

## 2. Brace Placement

**Decision:** Same-line opening braces (K&R) vs next-line (Allman)?
Same line opening braces.

**Raw snippet:**
```pathogen
fn buildSchematic(coneCx, coneCy, innerR, fromDeg, toDeg) {
  if (innerR > 0) {
    circle(coneCx, coneCy, innerR)
  }
  
  for (i in 0..5) {
    let angle = calc(i / 5 * TAU());
    M calc(coneCx + 30 * cos(angle)) calc(coneCy + 30 * sin(angle))
  }
}
```

**Pay attention to:** Whether the opening brace goes on the same line as `fn`, `if`, `for`, or on its own line. Whether this choice applies uniformly to all block types (including `.apply`, gradient trailing blocks, `.map` trailing blocks).

**Your preferred version:**
```pathogen

```

**Commentary:**
Always same-line.

---

## 3. Semicolons on Required Statements

**Decision:** Consistent semicolons on `let`, assignment, `return`, and expression statements.

**Raw snippet:**
```pathogen
let cx = 200;
let cy = 150;
let innerR = 24;
let barGap = 1;
let barInnerR = calc(innerR + barGap);
wheel_outer.innerRadius = 65;
wheel_outer.spread = 'transparent';
log("done");
return result;
```

**Pay attention to:** Whether every `let`, assignment, expression statement, and `return` gets a trailing semicolon. Whether the formatter should always enforce them or leave them as-is.

**Your preferred version:**
```pathogen

```

**Commentary:**
Add them always. This is a great convenience for the user.

---

## 4. Semicolons on Optional Contexts

**Decision:** Path commands, text statements, and `@font` directives allow optional semicolons. Should the formatter add, remove, or preserve them?

**Raw snippet:**
```pathogen
@font "../../fonts/Bebas_Neue/BebasNeue-Regular.ttf";
@font "../../fonts/Inconsolata/Inconsolata-Regular.ttf";

M 0 0
L 100 0
L 100 100
Z

text(50, 50)`Hello World`;
text(100, 100)`Second line`
```

**Pay attention to:** Whether `@font` gets a semicolon. Whether path commands get semicolons. Whether `text` statements get semicolons. Whether you want consistency or context-dependent rules.

**Your preferred version:**
```pathogen
@font "../../fonts/Bebas_Neue/BebasNeue-Regular.ttf";
@font "../../fonts/Inconsolata/Inconsolata-Regular.ttf";

M 0 0
L 100 0
L 100 100
Z

text(50, 50)`Hello World`;
text(100, 100)`Second line`;
```

**Commentary:**
Always for @font and text statements. Never for raw native SVG path commands, even when they are using functions. That being said, in terms of formatting, my preference is that we *always* put SVG path commands on their own lines (for readability, we should never display more than one SVG path command per line.)

---

## 5. Binary Operator Spacing

**Decision:** Spaces around all binary operators? Special treatment for any?

**Raw snippet:**
```pathogen
let sum = x+y;
let product = x * y;
let ratio = d.all/maxVal;
let scaled = barInnerR+(maxR-barInnerR)*d.all/maxVal;
let cond = x>10 && y<50;
let either = flag||!flag;
let merged = baseStyles<<overrides;
let equal = x==y;
let modded = i%count;
```

**Pay attention to:** Whether every binary operator gets spaces on both sides. Whether `<<` (merge) gets the same treatment as arithmetic. Whether logical operators (`&&`, `||`) and comparison (`==`, `!=`, `<`, `>`) get spaces. Whether `%` (modulo) is different from `+`, `-`.

**Your preferred version:**
```pathogen
let sum = x + y;
let product = x * y;
let ratio = d.all / maxVal;
let scaled = barInnerR + (maxR - barInnerR) * d.all / maxVal;
let cond = x > 10 && y < 50;
let either = flag || !flag;
let merged = baseStyles << overrides;
let equal = x == y;
let modded = i % count;

```

**Commentary:**
It is more readable to put more space around variables, numbers, strings and binary operators.

---

## 6. calc() Expression Formatting

**Decision:** Spacing inside `calc()`, and whether contents follow normal expression spacing.

**Raw snippet:**
```pathogen
let outerR = calc(barInnerR+(maxR-barInnerR)*d.all/maxVal);
let sliceAngle = calc( TAU() / count );
let ex = calc(cx+radius*cos(angle));
let browserStart = calc(500-browserW/2);
let paramY=calc(cellY+cellH+26);
```

**Pay attention to:** Whether `calc()` contents get the same operator spacing as regular expressions. Whether there should be a space after `calc(` or before `)`. Whether the assignment `=` in `let paramY=calc(...)` gets spaces.

**Your preferred version:**
```pathogen
let outerR = calc(barInnerR + (maxR - barInnerR) * d.all / maxVal);
let sliceAngle = calc(TAU() / count);
let ex = calc(cx + radius * cos(angle));
let browserStart = calc(500 - browserW / 2);
let paramY = calc(cellY + cellH + 26);

```

**Commentary:**
Preference for spacing around operators and '=', but no space after `calc(` or before `)`.

---

## 7. Style Block: Single-Line vs Multi-Line Threshold

**Decision:** When does a style block stay on one line vs break to multiple lines?

**Raw snippet:**
```pathogen
let bg = PathLayer('bg') ${ fill: #0f172a; };
let grid = PathLayer('grid') ${ stroke: Color('#1e293b'); stroke-width: 0.5; fill: none; };
let catLabel = TextLayer(`label-${i}`) ${ font-size: 9; fill: textColor; font-family: Georgia, serif; font-weight: bold; };
let leaders = PathLayer('leaders') ${ fill: none; stroke: Color('#475569'); stroke-width: 0.5; };
let v1_bbox = PathLayer('v1-bbox') ${ fill: none; stroke: Color('#22c55e40'); stroke-width: 0.75; stroke-dasharray: "3 2"; };
```

**Pay attention to:** How many style properties trigger a line break (1? 2? 3? 4?). Whether line length matters more than property count. Whether all layer constructors (`let` and `define`) follow the same rules.

**Your preferred version:**
```pathogen
let bg = PathLayer('bg') ${ 
  fill: #0f172a; 
};
let grid = PathLayer('grid') ${ 
  stroke: Color('#1e293b'); 
  stroke-width: 0.5; 
  fill: none; 
};
let catLabel = TextLayer(`label-${i}`) ${ 
  font-size: 9; 
  fill: textColor; 
  font-family: Georgia, serif; 
  font-weight: bold; 
};
let leaders = PathLayer('leaders') ${ 
  fill: none; 
  stroke: Color('#475569'); 
  stroke-width: 0.5; 
};
let v1_bbox = PathLayer('v1-bbox') ${ 
  fill: none; 
  stroke: Color('#22c55e40'); 
  stroke-width: 0.75; 
  stroke-dasharray: "3 2"; 
};

```

**Commentary:**
To improve readability, we should display only one style attribute per line.

---

## 8. Style Block: Multi-Line Layout

**Decision:** For style blocks that span multiple lines, what does the layout look like?

**Raw snippet:**
```pathogen
let subtitleLayer = TextLayer('subtitle') ${font-size: 11;fill: annotColor;font-family: system-ui, sans-serif;text-anchor: middle;};
```

**Pay attention to:** Indentation of properties relative to the `let` declaration. Whether each property gets its own line. Whether there's a trailing semicolon after the last property. Whether the closing `}` is on its own line. Whether the `};` closing is on its own line or shares with the last property.

**Your preferred version:**
```pathogen
let subtitleLayer = TextLayer('subtitle') ${
  font-size: 11;
  fill: annotColor;
  font-family: system-ui, sans-serif;
  text-anchor: middle;
};

```

**Commentary:**
Attributes on their own line, trailing semi-colon after the last property.

---

## 9. Path Command Spacing and Line Breaking

**Decision:** How are path command arguments spaced? When do multi-segment paths break across lines?

**Raw snippet:**
```pathogen
layer('outline').apply {
  M 100 120 L 170 120 L 200 150 L 200 200
  M332 176 l10 4 l-10 4 z
  C 10 20 30 40 50 60
  A 50 50 0 1 1 100 0
  M legOX legOY radialWedge(legBarStart, 25, legA1, calc(legA1 + legSweep), legCR) M legOX legOY radialWedge(legBarStart, 38, legA2, calc(legA2 + legSweep), legCR)
}
```

**Pay attention to:** Whether there's always a space between the command letter and first argument (`M 100` vs `M100`). Whether each path command starts on its own line. Whether a sequence of short commands can stay on one line (`M 10 20 L 30 40`). Whether function calls within path context (like `radialWedge`) force a line break. How arc (`A`) commands with 7 arguments are formatted.

**Your preferred version:**
```pathogen
layer('outline').apply {
  M 100 120 
  L 170 120 
  L 200 150 
  L 200 200
  M 332 176 
  l 10 4 
  l -10 4 
  z
  C 10 20 30 40 50 60
  A 50 50 0 1 1 100 0
  M legOX legOY 
  radialWedge(legBarStart, 25, legA1, calc(legA1 + legSweep), legCR) 
  M legOX legOY 
  radialWedge(legBarStart, 38, legA2, calc(legA2 + legSweep), legCR)
}

```

**Commentary:**
We always want to have space between the command letter and the first argument. We always want to ensure that we only have one SVG path command per line in terms of readability. When we have signed values, we always want a space between the path command letter and the minus sign. Those are all things that we would definitely want to have. 

---

## 10. Ternary Expression Formatting

**Decision:** Single-line vs multi-line ternary. How to handle long conditions.

**Raw snippet:**
```pathogen
let hasBadge = d.name == "Economic" || d.name == "Wargame" || d.name == "Humor" || d.name == "Music" || d.name == "Mafia" || d.name == "Prehistoric" ? 1 : 0;
let color = is_active ? Color('#22c55e') : Color('#64748b');
let anchor = labelR > 200 ? 'start' : labelR < -200 ? 'end' : 'middle';
```

**Pay attention to:** When a ternary stays on one line vs breaks. If multi-line, where the `?` and `:` go (start of continuation line? end of previous line?). How nested ternaries are handled. How long the condition can get before it wraps.

**Your preferred version:**
```pathogen
let hasBadge = d.name == "Economic" || 
  d.name == "Wargame" || 
  d.name == "Humor" || 
  d.name == "Music" || 
  d.name == "Mafia" || 
  d.name == "Prehistoric" ? 1 : 0;
let color = is_active ? Color('#22c55e') : Color('#64748b');
let anchor = labelR > 200 ? 
  'start' : labelR < -200 ? 
    'end' : 'middle';
```

**Commentary:**
Nested ternary, such as the let anchor example, should be spread across multiple lines. The let hasBadge example could spread the conditional across multiple lines if there are more that two conditions.

---

## 11. Array Literal Formatting

**Decision:** When do array literals break to multiple lines?

**Raw snippet:**
```pathogen
let ramp = [darker, dark, base, light, lighter, pale];
let ramp_names = ['-20%', '-10%', 'base', '+10%', '+20%', '+30%'];
let firstWords = ["Fantasy", "Wargame", "Science", "Adventure", "Economic", "Animals", "Humor", "Murder", "Civilization", "Exploration", "Medieval", "Mythology", "Political", "Farming", "Music", "Travel", "Nautical", "Ancient", "Mafia", "Spies", "Transportation", "Religious", "Prehistoric", "Age", "Medical", "Arabian"];
let pts = [{ x: 60, y: 160, angle: -20deg, exit: 70 }, { x: 190, y: 70, angle: 15deg, entry: 60, exit: 55 }, { x: 330, y: 155, angle: -30deg, entry: 65, exit: 55 }, { x: 455, y: 85, angle: 10deg, entry: 60 }];
let try_anchors = [BBoxAnchor.Left, BBoxAnchor.BottomLeft, BBoxAnchor.Bottom, BBoxAnchor.TopLeft, BBoxAnchor.Top, BBoxAnchor.BottomRight, BBoxAnchor.Right, BBoxAnchor.TopRight];
```

**Pay attention to:** The line length at which an array wraps. Whether short arrays of primitives stay on one line. Whether arrays of objects always go multi-line with one object per line. How wrapped array elements are indented. Whether a trailing comma is added after the last element.

**Your preferred version:**
```pathogen
let ramp = [
  darker, 
  dark, 
  base, 
  light, 
  lighter, 
  pale,
];
let ramp_names = [
  '-20%', 
  '-10%', 
  'base', 
  '+10%', 
  '+20%', 
  '+30%',
];
let firstWords = [
  "Fantasy", 
  "Wargame", 
  "Science", 
  "Adventure", 
  "Economic", 
  "Animals", 
  "Humor", 
  "Murder", 
  "Civilization", 
  "Exploration", 
  "Medieval", 
  "Mythology", 
  "Political", 
  "Farming", 
  "Music", 
  "Travel", 
  "Nautical", 
  "Ancient", 
  "Mafia", 
  "Spies", 
  "Transportation", 
  "Religious", 
  "Prehistoric", 
  "Age", 
  "Medical", 
  "Arabian",
];
let pts = [
  { 
    x: 60, 
    y: 160, 
    angle: -20deg, 
    exit: 70,
  }, 
  { 
    x: 190, 
    y: 70, 
    angle: 15deg, 
    entry: 60, 
    exit: 55,
  }, 
  { 
    x: 330, 
    y: 155, 
    angle: -30deg, 
    entry: 65, 
    exit: 55,
  }, 
  { 
    x: 455, 
    y: 85, 
    angle: 10deg, 
    entry: 60,
  }
];
let try_anchors = [
  BBoxAnchor.Left, 
  BBoxAnchor.BottomLeft, 
  BBoxAnchor.Bottom, 
  BBoxAnchor.TopLeft, 
  BBoxAnchor.Top, 
  BBoxAnchor.BottomRight, 
  BBoxAnchor.Right, 
  BBoxAnchor.TopRight,
];

```

**Commentary:**
Each item on its own line. Always put a comma in in the last item.

---

## 12. Object Literal Formatting

**Decision:** Inline vs multi-line for objects. Spacing around braces and colons.

**Raw snippet:**
```pathogen
let offset = {x: 10, y: 20};
let card1_bbox_rect = {x: bb.x, y: bb.y, width: bb.width, height: bb.height};
let cfg = {title: 'transparent-blend',coneOff: Point(0, 0),innerR: 50,fromDeg: 0,toDeg: 360,dir: 'cw',spread: 'clamp',innerFill: 'transparent-blend'};
let expanded = { ...defaults, stroke: '#ff0000', fill: 'none' };
```

**Pay attention to:** Space inside braces (`{ x: 1 }` vs `{x: 1}`). Space after colons (`x: 1` vs `x:1`). When an object wraps to multi-line. How multi-line object properties are indented. How spread elements (`...defaults`) are formatted.

**Your preferred version:**
```pathogen
let offset = {
  x: 10, 
  y: 20,
};
let card1_bbox_rect = {
  x: bb.x, 
  y: bb.y, 
  width: bb.width, 
  height: bb.height,
};
let cfg = {
  title: 'transparent-blend',
  coneOff: Point(0, 0),
  innerR: 50,
  fromDeg: 0,
  toDeg: 360,
  dir: 'cw',
  spread: 'clamp',
  innerFill: 'transparent-blend',
};
let expanded = { 
  ...defaults, 
  stroke: '#ff0000', 
  fill: 'none',
};
```

**Commentary:**
Each attribute/member on its own line, space after the colon, last item always gets a comma.

---

## 13. Function Definitions with Many Parameters

**Decision:** When to break parameter lists across lines.

**Raw snippet:**
```pathogen
fn buildSchematic(coneCx, coneCy, innerR, fromDeg, toDeg, rectX, rectY, rectW, rectH) {
  circle(coneCx, coneCy, innerR)
  rect(rectX, rectY, rectW, rectH)
}

fn angleWedge(cx, cy, radius, angle) {
  let ex = calc(cx + radius * cos(angle));
  let ey = calc(cy + radius * sin(angle));
}

fn swatch(cx, cy, r) {
  circle(cx, cy, r);
}
```

**Pay attention to:** Whether a function with 9 parameters wraps them to the next line. How wrapped parameters are indented (aligned under `(`, or indented one level). Whether 4-parameter functions stay on one line. Where the opening `{` goes when params wrap.

**Your preferred version:**
```pathogen
fn buildSchematic(coneCx, coneCy, innerR, fromDeg, 
    toDeg, rectX, rectY, rectW, rectH) {
  circle(coneCx, coneCy, innerR)
  rect(rectX, rectY, rectW, rectH)
}

fn angleWedge(cx, cy, radius, angle) {
  let ex = calc(cx + radius * cos(angle));
  let ey = calc(cy + radius * sin(angle));
}

fn swatch(cx, cy, r) {
  circle(cx, cy, r);
}
```

**Commentary:**
Break up argument list into multiple lines after every fourth argument (new line between 4 and 5, 8 and 9, etc.)

---

## 14. Function Calls with Many Arguments

**Decision:** When to break argument lists across lines.

**Raw snippet:**
```pathogen
labelTb.radialProject(cx, cy, midAngle, labelR, 'start', 1, VerticalAnchor.Midline).draw();
roundRect(calc(browserStart + frac1 * browserW - subPad + 4), calc(subY - 11), calc((fracHi1 * browserW + subPad * 2) * 0.92), 15, 2);
buildSchematic(calc(coneCx - cellX), calc(coneCy - cellY), cfg.innerR, cfg.fromDeg, cfg.toDeg, calc(rectX - cellX), calc(rectY - cellY), fillW, fillH);
log(`[${i}] ${cfg.title}`, "offset:", cfg.coneOff.x, cfg.coneOff.y, "iR:", cfg.innerR);
```

**Pay attention to:** Whether long calls wrap and where the line break falls. Whether argument alignment is used (args aligned under the first arg after `(`). Whether each argument gets its own line or they group logically. What happens with chained calls (`.radialProject(...).draw()`).

**Your preferred version:**
```pathogen
labelTb.radialProject(cx, 
    cy, 
    midAngle, 
    labelR, 
    'start', 
    1, 
    VerticalAnchor.Midline).draw();
roundRect(calc(browserStart + frac1 * browserW - subPad + 4), 
    calc(subY - 11), 
    calc((fracHi1 * browserW + subPad * 2) * 0.92), 
    15, 
    2);
buildSchematic(calc(coneCx - cellX), 
    calc(coneCy - cellY), 
    cfg.innerR, 
    cfg.fromDeg, 
    cfg.toDeg, 
    calc(rectX - cellX), 
    calc(rectY - cellY), 
    fillW, 
    fillH);
log(`[${i}] ${cfg.title}`, 
    "offset:", 
    cfg.coneOff.x, 
    cfg.coneOff.y, 
    "iR:", 
    cfg.innerR);

```

**Commentary:**
I think that if the function takes more four arguments, then we want to put each argument on its own line, or if one of the arguments is the result of another functional call, then move each argument onto its own line in order to improve readability.

---

## 15. Gradient Constructor with Trailing Block

**Decision:** How to format gradient constructors with their `{|g| ... }` trailing blocks.

**Raw snippet:**
```pathogen
let glow = RadialGradient('glow', 0.5, 0.5, 0.5) {|g| g.stop(0, light_a); g.stop(0.4, light_a.alpha(0.6)); g.stop(1, light_a.alpha(0)); };

let sky_grad = LinearGradient('sky', 0, 0, 0, 1) {|g|
g.stop(0,    Color('#0d1b2a'));
g.stop(0.45, Color('#1b4965'));
g.stop(0.65, Color('#415a77'));
g.stop(1,    Color('#778da9'));
};

let wheel = ConicGradient('wheel', cx, cy) {|g|
g.stop(0,      Color('#e63946').alpha(0.01));
g.stop(0.0833, Color('#e63946').alpha(0.2));
g.stop(0.1667, Color('#e63946').alpha(0.5));
g.stop(0.25,   Color('#f4845f').alpha(0.9));
g.stop(0.5,    Color('#277da1').alpha(0.7));
g.stop(1,      Color('#e63946').alpha(0.01));
};
```

**Pay attention to:** Whether the `{|g|` stays on the same line as the constructor. Whether stops are indented inside the block. Whether stop offset values are column-aligned (0, 0.45, 0.65, 1 with padding). Whether each `g.stop(...)` gets its own line. Whether a short 3-stop gradient can stay on one line. Closing `};` placement.

**Your preferred version:**
```pathogen
let glow = RadialGradient('glow', 0.5, 0.5, 0.5) {|g| 
  g.stop(0, light_a); 
  g.stop(0.4, light_a.alpha(0.6)); 
  g.stop(1, light_a.alpha(0)); 
};

let sky_grad = LinearGradient('sky', 0, 0, 0, 1) {|g|
  g.stop(0,    Color('#0d1b2a'));
  g.stop(0.45, Color('#1b4965'));
  g.stop(0.65, Color('#415a77'));
  g.stop(1,    Color('#778da9'));
};

let wheel = ConicGradient('wheel', cx, cy) {|g|
  g.stop(0,      Color('#e63946').alpha(0.01));
  g.stop(0.0833, Color('#e63946').alpha(0.2));
  g.stop(0.1667, Color('#e63946').alpha(0.5));
  g.stop(0.25,   Color('#f4845f').alpha(0.9));
  g.stop(0.5,    Color('#277da1').alpha(0.7));
  g.stop(1,      Color('#e63946').alpha(0.01));
};

```

**Commentary:**
Block arguments stay on the same line as the constructor.Stops are indented inside of the block. Stop offset values are column-aligned. g.stop gets its own line in all cases, regardless of number of stops. '};' always goes on its own line.

---

## 16. Layer Definition Formatting

**Decision:** How to format `define` layer definitions.

**Raw snippet:**
```pathogen
define PathLayer('curve') ${ fill: none; stroke: #3b82f6; stroke-width: 3 }
define TextLayer('title') ${ font-size: 11; fill: #f59e0b; font-family: system-ui, sans-serif }
define GroupLayer('diagram') ${ translate-x: 0; translate-y: 0; }
define default PathLayer('main') ${ stroke: #000; stroke-width: 2; fill: none; }
```

**Pay attention to:** Whether `define` layer definitions follow the same single-line/multi-line threshold as `let` layer constructors (snippet 7). Whether the missing trailing semicolons on individual properties matter (e.g., `stroke-width: 3` with no `;` before `}`). Whether the `define` keyword affects formatting differently than `let`.

**Your preferred version:**
```pathogen
define PathLayer('curve') ${ 
  fill: none; 
  stroke: #3b82f6; 
  stroke-width: 3;
}
define TextLayer('title') ${ 
  font-size: 11; 
  fill: #f59e0b; 
  font-family: system-ui, sans-serif; 
}
define GroupLayer('diagram') ${ 
  translate-x: 0; 
  translate-y: 0; 
}
define default PathLayer('main') ${ 
  stroke: #000; 
  stroke-width: 2; 
  fill: none; 
}

```

**Commentary:**
define layer statements with style blocks are always multi-line (unless the StyleBlock is empty.) Display only one style attribute per line. Last style attribute always has a semi-colon after it.

---

## 17. Layer Apply Block Formatting

**Decision:** How to format `.apply { ... }` blocks.

**Raw snippet:**
```pathogen
bg.apply { rect(0, 0, 600, 340); }

grid.apply {
for (i in 0..17) { M 0 calc(i * 20) h 600 }
for (j in 0..30) { M calc(j * 20) 0 v 340 }
}

layer('outline').apply {
circle(100, 100, 50)
}

wedges.apply {
M legOX legOY
radialWedge(legBarStart, 25, legA1, calc(legA1 + legSweep), legCR)
M legOX legOY
radialWedge(legBarStart, 38, legA2, calc(legA2 + legSweep), legCR)
}
```

**Pay attention to:** Whether a single-statement `.apply` can stay on one line (`bg.apply { rect(...); }`). Whether `for` loops inside `.apply` stay on one line when their body is short. How mixed path-command-and-function-call apply blocks are indented. Whether `layer('name').apply` and `variable.apply` follow the same rules.

**Your preferred version:**
```pathogen
bg.apply { 
  rect(0, 0, 600, 340); 
}

grid.apply {
  for (i in 0..17) { 
    M 0 calc(i * 20) 
    h 600 
  }
  for (j in 0..30) { 
    M calc(j * 20) 0 
    v 340 
  }
}

layer('outline').apply {
  circle(100, 100, 50);
}

wedges.apply {
  M legOX legOY
  radialWedge(legBarStart, 
      25, 
      legA1, 
      calc(legA1 + legSweep), 
      legCR);
  M legOX legOY
  radialWedge(legBarStart, 
      38, 
      legA2, 
      calc(legA2 + legSweep), 
      legCR);
}

```

**Commentary:**
layer.apply with one or more statements is always multiline. for loops, even short for loops, are always multi-line.

---

## 18. Text and Tspan Formatting

**Decision:** How to format `text()` with template literals and `text() { tspan() ... }` blocks.

**Raw snippet:**
```pathogen
text(50, 50)`Hello World`

text(500, subY) {
`They make up nearly 30% of `
tspan(0, 0, 0, hiWhite)`all board games`
`, but just about 10% of the `
tspan(0, 0, 0, hiWhite)`top 100`
` ranked titles.`
}

text(0, 0) { `${d.name}` tspan(0, 0, 0, redDot)` · ` tspan(0, 0, 0, redPct)`${d.all}%` tspan(0, 0, 0, darkDot)` · ` tspan(0, 0, 0, darkPct)`${d.top}%` }
```

**Pay attention to:** Whether simple `text(x, y)\`content\`` stays on one line. How multi-tspan text blocks are indented. Whether each tspan gets its own line. Whether bare template literals inside text blocks get their own line. Whether a text block with many short tspans can stay on one line or always breaks.

**Your preferred version:**
```pathogen

text(500, subY) {
  `They make up nearly 30% of `;
  tspan(0, 0, 0, hiWhite)`all board games`;
  `, but just about 10% of the `;
  tspan(0, 0, 0, hiWhite)`top 100`;
  ` ranked titles.`;
}

text(0, 0) { 
  `${d.name}`;
  tspan(0, 0, 0, redDot)` · `;
  tspan(0, 0, 0, redPct)`${d.all}%`; 
  tspan(0, 0, 0, darkDot)` · `;
  tspan(0, 0, 0, darkPct)`${d.top}%`;
}

```

**Commentary:**
To improve readability, we should be putting each of the items on their own line.

---

## 19. Path Block (@{}) Expression Formatting

**Decision:** How to format path block expressions.

**Raw snippet:**
```pathogen
let sq = @{ h 60 v 60 h -60 z };
let corner = @{ h 100 v 80 };
let arrow = @{
h 40
l -10 -8
l 0 5
h -30
v 6
h 30
l 0 5
l 10 -8
};
let composite = @{
for (i in 0..4) {
  let angle = calc(i * 90deg);
  polarMove(angle, 20)
  polarLine(angle, 40)
}
};
```

**Pay attention to:** When a path block stays on one line (2 commands? 3? 4?). How multi-line path blocks are indented. Whether the closing `};` is on its own line or shares with last command. Whether control flow inside a path block changes the formatting.

**Your preferred version:**
```pathogen
let sq = @{ 
  h 60 
  v 60 
  h -60 
  z 
};
let corner = @{ 
  h 100 
  v 80 
};
let arrow = @{
  h 40
  l -10 -8
  l 0 5
  h -30
  v 6
  h 30
  l 0 5
  l 10 -8
};
let composite = @{
  for (i in 0..4) {
    let angle = calc(i * 90deg);
    polarMove(angle, 20);
    polarLine(angle, 40);
  }
};

```

**Commentary:**
Multi-command path blocks are always indented, and nested for loops are also indented. One of the selling points of the Pathogen Language is that the user can include comments along side and around their SVG path defintions. Spacing of one command per line provides the user with easy ingress to add comments to improve wayfinding and organization in their code.

---

## 20. Text Block (&{}) Expression Formatting

**Decision:** How to format text block expressions, including merge operator placement.

**Raw snippet:**
```pathogen
let seg1Tb = &{ text(0, 11)`They make up nearly 30% of ` } << subStyle;

let card = &{
text(0, 14)`Server Node`
text(0, 32)`Status: online`
text(0, 48)`Latency: 12ms`
} << mono_styles;

let labelTb = &{
text(0, 0) {
`${d.name}`
tspan(0, 0, 0, redDot)` · `
tspan(0, 0, 0, redPct)`${d.all}%`
tspan(0, 0, 0, darkDot)` · `
tspan(0, 0, 0, darkPct)`${d.top}%`
}
} << ${ font-size: 9; };
```

**Pay attention to:** When a single-text text block stays on one line. How multi-text text blocks are indented. Where the `<< style` merge goes (same line as closing `}` or next line?). How nested text blocks with tspans are indented (3 levels deep: `&{` > `text() {` > `tspan()`).

**Your preferred version:**
```pathogen
let seg1Tb = &{ 
  text(0, 11)`They make up nearly 30% of `;
} << subStyle;

let card = &{
  text(0, 14)`Server Node`;
  text(0, 32)`Status: online`;
  text(0, 48)`Latency: 12ms`;
} << mono_styles;

let labelTb = &{
  text(0, 0) {
    `${d.name}`;
    tspan(0, 0, 0, redDot)` · `;
    tspan(0, 0, 0, redPct)`${d.all}%`;
    tspan(0, 0, 0, darkDot)` · `;
    tspan(0, 0, 0, darkPct)`${d.top}%`;
  }
} << ${ font-size: 9; };
```

**Commentary:**
Text lines in a text block should be on their own line if there are 1 or more text lines. The `<< style` merge goes (same line as closing `}`).

---

## 21. Enum Definition Formatting

**Decision:** How to format enum declarations.

**Raw snippet:**
```pathogen
enum Direction { UP, DOWN, LEFT, RIGHT }
enum GridPatternType {Shape,Partial,Intersection,Full}
enum VerticalAnchor {
Top = 0, Midline = 1, Baseline = 2, Bottom = 3
}
enum Easing {
Linear = 'linear',
Smoothstep = 'smoothstep',
EaseIn = 'ease-in',
EaseOut = 'ease-out',
EaseInOut = 'ease-in-out',
}
```

**Pay attention to:** Whether short enums (4 members, no values) can stay on one line. What triggers multi-line. Whether each member gets its own line when multi-line. Whether trailing commas are added. How members with `= value` are aligned. Spacing after commas.

**Your preferred version:**
```pathogen
enum Direction { 
  UP, 
  DOWN, 
  LEFT, 
  RIGHT,
}

enum GridPatternType {
  Shape,
  Partial,
  Intersection,
  Full,
}

enum VerticalAnchor {
  Top = 0, 
  Midline = 1, 
  Baseline = 2, 
  Bottom = 3,
}
enum Easing {
  Linear = 'linear',
  Smoothstep = 'smoothstep',
  EaseIn = 'ease-in',
  EaseOut = 'ease-out',
  EaseInOut = 'ease-in-out',
}

```

**Commentary:**
Enum items should always be on their own lines and each item, including the last should have a trailing comma.

---

## 22. Destructuring Patterns

**Decision:** How to format array and object destructuring in `let` and `for`.

**Raw snippet:**
```pathogen
let [a,b,c] = some_array;
let [head,...tail] = points;
let {x,y:alias,width,height} = shape.boundingBox();
let {x, ...rest} = config;
for ([d,i] in data) {
  let sliceFrom = calc(startOffset + i * sliceAngle);
}
for ([pt,i] in top) { pt.color = Color('#0a0a2e'); }
```

**Pay attention to:** Spaces inside brackets/braces (`[a, b]` vs `[a,b]`). Spaces after commas. Spaces around the `:` alias in object destructuring (`y: alias` vs `y:alias`). Whether destructuring in `for` follows the same spacing as in `let`. Space before `...` in rest patterns.

**Your preferred version:**
```pathogen
let [a, b, c] = some_array;
let [head, ...tail] = points;
let { x, y: alias, width, height } = shape.boundingBox();
let { x, ...rest } = config;
for ([d, i] in data) {
  let sliceFrom = calc(startOffset + i * sliceAngle);
}
for ([pt, i] in top) { 
  pt.color = Color('#0a0a2e'); 
}

```

**Commentary:**


---

## 23. Method Chain Formatting

**Decision:** How to format chained method calls.

**Raw snippet:**
```pathogen
let guideClr = base.lighten(0.2).alpha(0.55);
let labelClr = base.desaturate(0.4).lighten(0.3);
let triColor = gridColor.hueShift(180).lighten(20%).alpha(0.8);
labelTb.radialProject(cx, cy, midAngle, labelR, 'start', 1, VerticalAnchor.Midline).draw();
let v1_label_proj = (&{ text(0, 8)`mono 10px` } << anno_styles).project(0, -10);
shape.boundingBox().width;
```

**Pay attention to:** Whether short 2-step chains stay on one line. Whether 3+ step chains break with each `.method()` on its own line. How the leading `.` is indented on wrapped lines (indented under the object? indented one level?). How parenthesized expressions with chained calls are formatted.

**Your preferred version:**
```pathogen
let guideClr = base.lighten(0.2).alpha(0.55);
let labelClr = base.desaturate(0.4).lighten(0.3);
let triColor = gridColor
    .hueShift(180)
    .lighten(20%)
    .alpha(0.8);
labelTb.radialProject(cx, cy, midAngle, labelR, 
    'start', 1, VerticalAnchor.Midline)
    .draw();
let v1_label_proj = (&{ 
  text(0, 8)`mono 10px` 
} << anno_styles).project(0, -10);
shape.boundingBox().width;

```

**Commentary:**


---

## 24. Comment Spacing and Section Headers

**Decision:** How to format comments, section dividers, and spacing around comments.

**Raw snippet:**
```pathogen
// ─── Background ─────────────────────────────────────────────────────
let bg = PathLayer('bg') ${ fill: Color('#0f172a'); stroke: none; };
bg.apply { rect(0, 0, 600, 340); }
// ═══════════════════════════════════════
// Step 1: Two overlapping squares (input)
// ═══════════════════════════════════════
let s1_orig = PathLayer('s1-orig') ${ stroke: Color('#94a3b840'); stroke-width: 1; fill: none; };
// --- Reactive light colors ---
let light_a = Color(CSSVar('--light-a', '#f4a261'));
// === Chart parameters ===
// Center in the middle of the canvas
let cx = 500;
```

**Pay attention to:** Whether section headers get blank lines before and after. Which header styles you prefer (thin rule `───`, thick rule `═══`, dashes `---`, equals `===`, or mixed). How many blank lines separate major sections. Whether a comment followed by a related `let` has zero or one blank line between them. Whether the formatter should enforce a specific header style or leave comments alone.

**Your preferred version:**
```pathogen
// ─── Background ─────────────────────────────────────────────────────
let bg = PathLayer('bg') ${ 
  fill: Color('#0f172a'); 
  stroke: none; 
};
bg.apply { 
  rect(0, 0, 600, 340); 
}

// ───────────────────────────────────────
// Step 1: Two overlapping squares (input)
// ───────────────────────────────────────

let s1_orig = PathLayer('s1-orig') ${ stroke: Color('#94a3b840'); stroke-width: 1; fill: none; };

// ─── Reactive light colors ───

let light_a = Color(CSSVar('--light-a', '#f4a261'));

// ─── Chart parameters ───
// Center in the middle of the canvas

let cx = 500;

```

**Commentary:**
I like the thin rule, but what are you using, an endash or an emdash? It seems like it should be something that is easily accessible to users, so we may just need to go with a dash. Let's not enforce a specific header style, unless there is a way that we could enforce in our own code samples.
---

## 25. Blank Line Rules Between Constructs

**Decision:** How many blank lines between different types of constructs.

**Raw snippet:**
```pathogen
let bg = PathLayer('bg') ${ fill: #0f172a; stroke: none; };
bg.apply { rect(0, 0, 400, 400); }
let gridLayer = PathLayer('grid') ${ stroke: gridColor; stroke-width: 0.3; fill: none; };
gridLayer.ctx.transform.rotate.set(0.08pi);
gridLayer.apply {
  squareGrid(GridPatternType.Partial, -40, -40, 480, 480, 16);
}
let accentColor = gridColor.lighten(30%);
let hexLayer = PathLayer('hex') ${ stroke: accentColor; stroke-width: 0.5; fill: none; };
hexLayer.apply {
  hexagonGrid(GridPatternType.Shape, 60, 60, 280, 280, 30);
}
let labels = TextLayer('labels') ${
  font-family: system-ui, sans-serif;
  font-size: 9;
  fill: #64748b;
  text-anchor: start;
};
labels.apply {
  text(22, 388)`Grid composition example`
}
```

**Pay attention to:** Whether there's a blank line between a layer definition and its `.apply`. Whether there's a blank line between one layer's apply block and the next layer's definition. Whether consecutive `let` declarations without blank lines are acceptable. Whether a block of related code (definition + config + apply) is separated from the next block by one or two blank lines. Whether the formatter should enforce blank line rules or only normalize excessive blank lines.

**Your preferred version:**
```pathogen
let bg = PathLayer('bg') ${ 
  fill: #0f172a; 
  stroke: none; 
};
bg.apply { 
  rect(0, 0, 400, 400); 
}

let gridLayer = PathLayer('grid') ${ 
  stroke: gridColor; 
  stroke-width: 0.3; 
  fill: none; 
};
gridLayer.ctx.transform.rotate.set(0.08pi);
gridLayer.apply {
  squareGrid(GridPatternType.Partial, -40, -40, 480, 480, 16);
}

let accentColor = gridColor.lighten(30%);
let hexLayer = PathLayer('hex') ${ 
  stroke: accentColor; 
  stroke-width: 0.5; 
  fill: none; 
};
hexLayer.apply {
  hexagonGrid(GridPatternType.Shape, 60, 60, 280, 280, 30);
}

let labels = TextLayer('labels') ${
  font-family: system-ui, sans-serif;
  font-size: 9;
  fill: #64748b;
  text-anchor: start;
};
labels.apply {
  text(22, 388)`Grid composition example`;
}
```

**Commentary:**
The formatter shouldn't do either of there, as it could cause developer frustration: Whether the formatter should enforce blank line rules or only normalize excessive blank lines.

I think this is generally a place where we have to defer to the styles of the users adhere to.
---

## Summary of Decisions

After completing the questionnaire, fill in this table for quick reference:

| Decision | Your Choice |
|----------|-------------|
| Indent size | 2 spaces |
| Brace placement | same-line |
| Semicolons on let/assign/return | always |
| Semicolons on path commands | never |
| Semicolons on text statements | always |
| Semicolons on @font | always |
| Binary operator spacing | always spaces |
| calc() internal spacing | same as expressions |
| Style block single-line max properties | 0 properties |
| Style block trailing semicolon | always |
| Path command spacing | always space |
| Path commands per line | one |
| Ternary wrapping threshold | ??? characters |
| Array inline threshold | 5 elements or 20 characters |
| Object inline threshold | 2 properties or 20 characters |
| Function param wrapping threshold | 4 params or 32 characters |
| Function arg wrapping threshold | 2 args or 32 characters |
| Gradient stop alignment | column-aligned |
| Layer apply single-line threshold | 0 statements |
| Path block single-line threshold | 0 commands |
| Text block single-line threshold | 0 text elements |
| Enum single-line threshold | 0 members |
| Method chain wrapping | 3 steps or 32 characters |
| Section header style | one preferred style |
| Blank lines between major sections | 2 lines |
| Blank lines: layer def → its apply | 0 lines |
| Trailing commas in arrays/objects | always |
| Comments | reformat |
