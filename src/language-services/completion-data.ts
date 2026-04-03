// Static completion data extracted from playground/utils/codemirror-setup.ts.
// Shared by VS Code (via LSP) and playground (via direct import).

export interface CompletionEntry {
  label: string;
  kind: 'function' | 'variable' | 'keyword' | 'property' | 'constant' | 'snippet';
  detail: string;
  /** Higher boost = higher in list. */
  boost: number;
  /** Snippet body (VS Code snippet syntax with $1, $2, etc.) */
  insertText?: string;
  isSnippet?: boolean;
}

// --- Keywords ---

export const KEYWORD_COMPLETIONS: CompletionEntry[] = [
  { label: 'let', kind: 'keyword', detail: 'Variable declaration', boost: 10, insertText: 'let ${1:name} = ${0};', isSnippet: true },
  { label: 'for', kind: 'keyword', detail: 'For loop — iterate over a range', boost: 10, insertText: 'for (${1:i} in ${2:0}..${3:10}) {\n\t$0\n}', isSnippet: true },
  { label: 'if', kind: 'keyword', detail: 'If statement — conditional', boost: 10, insertText: 'if (${1:condition}) {\n\t$0\n}', isSnippet: true },
  { label: 'fn', kind: 'keyword', detail: 'Function definition', boost: 10, insertText: 'fn ${1:name}(${2:params}) {\n\t$0\n}', isSnippet: true },
  { label: 'define', kind: 'keyword', detail: 'Define a layer with styles', boost: 8 },
  { label: 'layer', kind: 'keyword', detail: 'Layer apply block', boost: 8 },
  { label: 'return', kind: 'keyword', detail: 'Return from function', boost: 6 },
  { label: 'enum', kind: 'keyword', detail: 'Enum definition', boost: 6, insertText: 'enum ${1:Name} {\n\t${0}\n}', isSnippet: true },
  { label: 'text', kind: 'keyword', detail: 'Text element', boost: 6 },
  { label: 'tspan', kind: 'keyword', detail: 'Text span inside text block', boost: 4 },
  { label: 'else', kind: 'keyword', detail: 'Else branch', boost: 4 },
  { label: 'true', kind: 'constant', detail: 'Boolean true', boost: 2 },
  { label: 'false', kind: 'constant', detail: 'Boolean false', boost: 2 },
  { label: 'null', kind: 'constant', detail: 'Null value', boost: 2 },
];

// --- Stdlib functions ---

export const STDLIB_COMPLETIONS: CompletionEntry[] = [
  // Constructors
  { label: 'Point', kind: 'function', detail: 'Point(x, y) — Create a 2D point', boost: 15 },
  { label: 'PolarVector', kind: 'function', detail: 'PolarVector(angle, distance) — Polar direction/distance', boost: 14 },
  { label: 'Cycler', kind: 'function', detail: 'Cycler(array, shuffle?) — Round-robin iterator', boost: 12 },
  { label: 'CSSVar', kind: 'function', detail: "CSSVar('name', fallback?) — CSS custom property", boost: 10 },

  // Layer constructors
  { label: 'PathLayer', kind: 'function', detail: "PathLayer('name') — Path layer constructor", boost: 12 },
  { label: 'TextLayer', kind: 'function', detail: "TextLayer('name') — Text layer constructor", boost: 12 },
  { label: 'GroupLayer', kind: 'function', detail: "GroupLayer('name') — Group layer constructor", boost: 12 },

  // Context-aware (polar, tangent)
  { label: 'polarPoint', kind: 'function', detail: 'polarPoint(angle, distance) — Point at polar offset', boost: 14 },
  { label: 'polarOffset', kind: 'function', detail: 'polarOffset(angle, distance) — Relative polar offset', boost: 14 },
  { label: 'polarMove', kind: 'function', detail: 'polarMove(angle, distance) — Move in polar direction', boost: 14 },
  { label: 'polarLine', kind: 'function', detail: 'polarLine(angle, distance) — Line in polar direction', boost: 14 },
  { label: 'arcFromCenter', kind: 'function', detail: 'arcFromCenter(dcx, dcy, r, start, end, cw) — Arc from center', boost: 12 },
  { label: 'arcFromPolarOffset', kind: 'function', detail: 'arcFromPolarOffset(angle, radius, sweepAngle) — Arc from polar center', boost: 12 },
  { label: 'tangentLine', kind: 'function', detail: 'tangentLine(length) — Line following tangent', boost: 12 },
  { label: 'tangentArc', kind: 'function', detail: 'tangentArc(radius, sweepAngle) — Arc from tangent', boost: 12 },
  { label: 'heading', kind: 'function', detail: 'heading(angle) — Set heading direction', boost: 10 },
  { label: 'turn', kind: 'function', detail: 'turn(delta) — Turn heading by delta', boost: 10 },

  // Shapes
  { label: 'circle', kind: 'function', detail: 'circle(cx, cy, r) — Draw circle', boost: 15 },
  { label: 'rect', kind: 'function', detail: 'rect(x, y, w, h) — Draw rectangle', boost: 15 },
  { label: 'roundRect', kind: 'function', detail: 'roundRect(x, y, w, h, r) — Rounded rectangle', boost: 13 },
  { label: 'polygon', kind: 'function', detail: 'polygon(cx, cy, r, sides) — Regular polygon', boost: 13 },
  { label: 'star', kind: 'function', detail: 'star(cx, cy, outer, inner, points) — Star shape', boost: 13 },

  // Curves
  { label: 'quadratic', kind: 'function', detail: 'quadratic(x1, y1, cx, cy, x2, y2) — Quadratic bezier', boost: 10 },
  { label: 'cubic', kind: 'function', detail: 'cubic(x1, y1, c1x, c1y, c2x, c2y, x2, y2) — Cubic bezier', boost: 10 },
  { label: 'arc', kind: 'function', detail: 'arc(rx, ry, rot, large, sweep, x, y) — Arc command', boost: 10 },
  { label: 'line', kind: 'function', detail: 'line(x1, y1, x2, y2) — Line segment', boost: 10 },
  { label: 'moveTo', kind: 'function', detail: 'moveTo(x, y) — Move command', boost: 8 },
  { label: 'lineTo', kind: 'function', detail: 'lineTo(x, y) — Line command', boost: 8 },
  { label: 'closePath', kind: 'function', detail: 'closePath() — Close path (Z)', boost: 8 },

  // Splines
  { label: 'cubicSpline', kind: 'function', detail: 'cubicSpline(points) — Smooth cubic spline', boost: 8 },
  { label: 'quadSpline', kind: 'function', detail: 'quadSpline(start, points, end) — Smooth quad spline', boost: 8 },
  { label: 'polarCubicBezier', kind: 'function', detail: 'polarCubicBezier(start, pv1, pv2, end) — Polar cubic bezier', boost: 8 },

  // Grids
  { label: 'squareGrid', kind: 'function', detail: 'squareGrid(type, x, y, w, h, cellSize) — Square grid', boost: 8 },
  { label: 'triangleGrid', kind: 'function', detail: 'triangleGrid(type, x, y, w, h, cellSize) — Triangle grid', boost: 8 },
  { label: 'hexagonGrid', kind: 'function', detail: 'hexagonGrid(type, x, y, w, h, cellSize, orient?) — Hex grid', boost: 8 },

  // Constants
  { label: 'PI', kind: 'function', detail: 'PI() — Returns pi', boost: 12 },
  { label: 'TAU', kind: 'function', detail: 'TAU() — Returns 2*pi', boost: 12 },
  { label: 'E', kind: 'function', detail: 'E() — Returns e', boost: 8 },
  { label: 'mpi', kind: 'function', detail: 'mpi(x) — Multiply by pi', boost: 6 },

  // Angle conversion
  { label: 'deg', kind: 'function', detail: 'deg(radians) — Convert radians to degrees', boost: 10 },
  { label: 'rad', kind: 'function', detail: 'rad(degrees) — Convert degrees to radians', boost: 10 },
  { label: 'normalizeAngle', kind: 'function', detail: 'normalizeAngle(angle) — Normalize to [0, 2pi)', boost: 6 },

  // Interpolation
  { label: 'lerp', kind: 'function', detail: 'lerp(a, b, t) — Linear interpolation', boost: 14 },
  { label: 'clamp', kind: 'function', detail: 'clamp(value, min, max) — Constrain to range', boost: 14 },
  { label: 'map', kind: 'function', detail: 'map(val, inMin, inMax, outMin, outMax) — Map between ranges', boost: 12 },

  // Trig
  { label: 'sin', kind: 'function', detail: 'sin(x) — Sine', boost: 12 },
  { label: 'cos', kind: 'function', detail: 'cos(x) — Cosine', boost: 12 },
  { label: 'tan', kind: 'function', detail: 'tan(x) — Tangent', boost: 8 },
  { label: 'asin', kind: 'function', detail: 'asin(x) — Arc sine', boost: 6 },
  { label: 'acos', kind: 'function', detail: 'acos(x) — Arc cosine', boost: 6 },
  { label: 'atan', kind: 'function', detail: 'atan(x) — Arc tangent', boost: 6 },
  { label: 'atan2', kind: 'function', detail: 'atan2(y, x) — Two-argument arc tangent', boost: 8 },

  // Rounding
  { label: 'floor', kind: 'function', detail: 'floor(x) — Round down', boost: 8 },
  { label: 'ceil', kind: 'function', detail: 'ceil(x) — Round up', boost: 8 },
  { label: 'round', kind: 'function', detail: 'round(x) — Round to nearest', boost: 8 },
  { label: 'trunc', kind: 'function', detail: 'trunc(x) — Truncate decimal', boost: 6 },

  // Utility
  { label: 'abs', kind: 'function', detail: 'abs(x) — Absolute value', boost: 10 },
  { label: 'sign', kind: 'function', detail: 'sign(x) — Sign (-1, 0, or 1)', boost: 6 },
  { label: 'min', kind: 'function', detail: 'min(a, b, ...) — Minimum', boost: 10 },
  { label: 'max', kind: 'function', detail: 'max(a, b, ...) — Maximum', boost: 10 },

  // Random
  { label: 'random', kind: 'function', detail: 'random() — Random 0-1', boost: 8 },
  { label: 'randomRange', kind: 'function', detail: 'randomRange(min, max) — Random in range', boost: 8 },

  // Exp/Log
  { label: 'exp', kind: 'function', detail: 'exp(x) — e^x', boost: 6 },
  { label: 'log', kind: 'function', detail: 'log(...) — Natural log or debug log', boost: 8 },
  { label: 'log10', kind: 'function', detail: 'log10(x) — Base-10 log', boost: 6 },
  { label: 'log2', kind: 'function', detail: 'log2(x) — Base-2 log', boost: 6 },
  { label: 'pow', kind: 'function', detail: 'pow(x, y) — x^y', boost: 8 },
  { label: 'sqrt', kind: 'function', detail: 'sqrt(x) — Square root', boost: 10 },
  { label: 'cbrt', kind: 'function', detail: 'cbrt(x) — Cube root', boost: 6 },

  // Namespaces
  { label: 'Object', kind: 'variable', detail: 'Object — Static methods (keys, values, entries)', boost: 6 },
  { label: 'Color', kind: 'variable', detail: 'Color — Color creation and manipulation', boost: 8 },
  { label: 'ctx', kind: 'variable', detail: 'ctx — Path context (position, start, heading)', boost: 16 },
];

// --- Style properties (for inside ${ } blocks) ---

export const STYLE_PROPERTY_COMPLETIONS: CompletionEntry[] = [
  { label: 'stroke', kind: 'property', detail: 'Stroke color', boost: 15 },
  { label: 'stroke-width', kind: 'property', detail: 'Stroke width', boost: 14 },
  { label: 'stroke-dasharray', kind: 'property', detail: 'Dash pattern (e.g., 4 2)', boost: 10 },
  { label: 'stroke-linecap', kind: 'property', detail: 'Line cap: butt, round, square', boost: 8 },
  { label: 'stroke-linejoin', kind: 'property', detail: 'Line join: miter, round, bevel', boost: 8 },
  { label: 'stroke-opacity', kind: 'property', detail: 'Stroke opacity (0-1)', boost: 8 },
  { label: 'fill', kind: 'property', detail: 'Fill color', boost: 15 },
  { label: 'fill-opacity', kind: 'property', detail: 'Fill opacity (0-1)', boost: 8 },
  { label: 'fill-rule', kind: 'property', detail: 'Fill rule: nonzero, evenodd', boost: 8 },
  { label: 'opacity', kind: 'property', detail: 'Overall opacity (0-1)', boost: 10 },
  { label: 'font-family', kind: 'property', detail: 'Font family name', boost: 10 },
  { label: 'font-size', kind: 'property', detail: 'Font size', boost: 10 },
  { label: 'font-weight', kind: 'property', detail: 'Font weight (100-900)', boost: 8 },
  { label: 'font-style', kind: 'property', detail: 'Font style: normal, italic', boost: 6 },
  { label: 'text-anchor', kind: 'property', detail: 'Text anchor: start, middle, end', boost: 8 },
  { label: 'text-decoration', kind: 'property', detail: 'Text decoration', boost: 6 },
  { label: 'dominant-baseline', kind: 'property', detail: 'Vertical text alignment', boost: 8 },
  { label: 'letter-spacing', kind: 'property', detail: 'Letter spacing', boost: 6 },
  { label: 'transform', kind: 'property', detail: 'SVG transform', boost: 6 },
  { label: 'translate-x', kind: 'property', detail: 'Convenience: translate X', boost: 6 },
  { label: 'translate-y', kind: 'property', detail: 'Convenience: translate Y', boost: 6 },
  { label: 'rotate', kind: 'property', detail: 'Convenience: rotation angle', boost: 6 },
  { label: 'scale-x', kind: 'property', detail: 'Convenience: scale X', boost: 6 },
  { label: 'scale-y', kind: 'property', detail: 'Convenience: scale Y', boost: 6 },
];

// --- Member access completions ---

export interface MemberCompletionSet {
  properties: CompletionEntry[];
  methods: CompletionEntry[];
}

export const POINT_MEMBERS: MemberCompletionSet = {
  properties: [
    { label: 'x', kind: 'property', detail: 'X coordinate', boost: 10 },
    { label: 'y', kind: 'property', detail: 'Y coordinate', boost: 10 },
    { label: 'angle', kind: 'property', detail: 'Angle from origin', boost: 6 },
  ],
  methods: [
    { label: 'translate', kind: 'function', detail: 'translate(dx, dy) — Offset point', boost: 8 },
    { label: 'rotate', kind: 'function', detail: 'rotate(angle, cx?, cy?) — Rotate point', boost: 8 },
    { label: 'scale', kind: 'function', detail: 'scale(sx, sy?, cx?, cy?) — Scale point', boost: 6 },
    { label: 'distance', kind: 'function', detail: 'distance(other) — Distance to another point', boost: 8 },
    { label: 'lerp', kind: 'function', detail: 'lerp(other, t) — Interpolate toward point', boost: 8 },
    { label: 'midpoint', kind: 'function', detail: 'midpoint(other) — Midpoint between two points', boost: 6 },
  ],
};

export const CTX_MEMBERS: MemberCompletionSet = {
  properties: [
    { label: 'position', kind: 'property', detail: 'Current pen position {x, y}', boost: 15 },
    { label: 'start', kind: 'property', detail: 'Subpath start position {x, y}', boost: 12 },
    { label: 'heading', kind: 'property', detail: 'Current heading angle', boost: 10 },
    { label: 'tangentAngle', kind: 'property', detail: 'Tangent angle at current position', boost: 8 },
    { label: 'transform', kind: 'property', detail: 'Layer transform state', boost: 10 },
    { label: 'commands', kind: 'property', detail: 'Array of executed commands', boost: 6 },
  ],
  methods: [],
};

export const ARRAY_MEMBERS: MemberCompletionSet = {
  properties: [
    { label: 'length', kind: 'property', detail: 'Number of elements', boost: 15 },
  ],
  methods: [
    { label: 'push', kind: 'function', detail: 'push(item) — Add to end', boost: 12 },
    { label: 'map', kind: 'function', detail: 'map {|item| ...} — Transform elements', boost: 14 },
    { label: 'filter', kind: 'function', detail: 'filter {|item| ...} — Filter elements', boost: 12 },
    { label: 'reduce', kind: 'function', detail: 'reduce(init) {|acc, item| ...} — Reduce', boost: 10 },
    { label: 'flatMap', kind: 'function', detail: 'flatMap {|item| ...} — Map and flatten', boost: 8 },
    { label: 'includes', kind: 'function', detail: 'includes(value) — Check if contains', boost: 8 },
    { label: 'indexOf', kind: 'function', detail: 'indexOf(value) — Find index', boost: 6 },
    { label: 'join', kind: 'function', detail: 'join(separator) — Join to string', boost: 8 },
    { label: 'slice', kind: 'function', detail: 'slice(start, end?) — Get sub-array', boost: 8 },
    { label: 'reverse', kind: 'function', detail: 'reverse() — Reverse order', boost: 6 },
    { label: 'sort', kind: 'function', detail: 'sort() — Sort elements', boost: 6 },
  ],
};

export const STRING_MEMBERS: MemberCompletionSet = {
  properties: [
    { label: 'length', kind: 'property', detail: 'String length', boost: 15 },
  ],
  methods: [
    { label: 'split', kind: 'function', detail: 'split(sep) — Split into array', boost: 10 },
    { label: 'includes', kind: 'function', detail: 'includes(str) — Check if contains', boost: 10 },
    { label: 'slice', kind: 'function', detail: 'slice(start, end?) — Get substring', boost: 8 },
    { label: 'append', kind: 'function', detail: 'append(str) — Concatenate', boost: 8 },
    { label: 'prepend', kind: 'function', detail: 'prepend(str) — Prepend string', boost: 6 },
    { label: 'empty', kind: 'function', detail: 'empty() — Check if empty', boost: 6 },
  ],
};

export const PATHBLOCK_MEMBERS: MemberCompletionSet = {
  properties: [
    { label: 'length', kind: 'property', detail: 'Path length', boost: 12 },
    { label: 'vertices', kind: 'property', detail: 'Vertex count', boost: 8 },
    { label: 'subPathCount', kind: 'property', detail: 'Number of subpaths', boost: 6 },
    { label: 'startPoint', kind: 'property', detail: 'First point {x, y}', boost: 10 },
    { label: 'endPoint', kind: 'property', detail: 'Last point {x, y}', boost: 10 },
  ],
  methods: [
    { label: 'draw', kind: 'function', detail: 'draw() — Emit path data', boost: 15 },
    { label: 'drawTo', kind: 'function', detail: "drawTo('layerName') — Emit to layer", boost: 14 },
    { label: 'get', kind: 'function', detail: 'get(t) — Sample point at t', boost: 12 },
    { label: 'tangent', kind: 'function', detail: 'tangent(t) — Tangent angle at t', boost: 10 },
    { label: 'normal', kind: 'function', detail: 'normal(t) — Normal angle at t', boost: 8 },
    { label: 'partition', kind: 'function', detail: 'partition(n) — Split into segments', boost: 10 },
    { label: 'reverse', kind: 'function', detail: 'reverse() — Reverse direction', boost: 8 },
    { label: 'boundingBox', kind: 'function', detail: 'boundingBox() — Get bounding box', boost: 12 },
    { label: 'offset', kind: 'function', detail: 'offset(distance) — Offset path', boost: 8 },
    { label: 'mirror', kind: 'function', detail: 'mirror(axis, pos) — Mirror path', boost: 6 },
    { label: 'scale', kind: 'function', detail: 'scale(sx, sy?, cx?, cy?) — Scale path', boost: 6 },
    { label: 'project', kind: 'function', detail: 'project(text, opts) — Project text on path', boost: 10 },
    { label: 'intersects', kind: 'function', detail: 'intersects(other) — Find intersections', boost: 8 },
  ],
};

export const OBJECT_NAMESPACE_MEMBERS: MemberCompletionSet = {
  properties: [],
  methods: [
    { label: 'keys', kind: 'function', detail: 'Object.keys(obj) — Get keys', boost: 12 },
    { label: 'values', kind: 'function', detail: 'Object.values(obj) — Get values', boost: 12 },
    { label: 'entries', kind: 'function', detail: 'Object.entries(obj) — Get key-value pairs', boost: 12 },
    { label: 'delete', kind: 'function', detail: 'Object.delete(obj, key) — Remove key', boost: 8 },
  ],
};
