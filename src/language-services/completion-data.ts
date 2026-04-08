// Static completion data: keywords, style properties, and type member sets.
// Stdlib completions are now generated — see completion-data.generated.ts.
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
    { label: 'rotate', kind: 'function', detail: 'rotate(angle, origin?) — Rotate around point', boost: 8 },
    { label: 'distanceTo', kind: 'function', detail: 'distanceTo(other) — Euclidean distance', boost: 8 },
    { label: 'angleTo', kind: 'function', detail: 'angleTo(other) — Angle to other point', boost: 8 },
    { label: 'lerp', kind: 'function', detail: 'lerp(other, t) — Interpolate toward point', boost: 8 },
    { label: 'midpoint', kind: 'function', detail: 'midpoint(other) — Midpoint between two points', boost: 6 },
    { label: 'polarTranslate', kind: 'function', detail: 'polarTranslate(angle, distance) — Polar offset', boost: 8 },
    { label: 'offset', kind: 'function', detail: 'offset(other) — Get {dx, dy} delta', boost: 6 },
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
    { label: 'pop', kind: 'function', detail: 'pop() — Remove and return last element', boost: 10 },
    { label: 'shift', kind: 'function', detail: 'shift() — Remove and return first element', boost: 8 },
    { label: 'unshift', kind: 'function', detail: 'unshift(item) — Add to beginning', boost: 8 },
    { label: 'empty', kind: 'function', detail: 'empty() — Check if array is empty', boost: 6 },
    { label: 'map', kind: 'function', detail: 'map {|item| ...} — Transform elements', boost: 14 },
    { label: 'reduce', kind: 'function', detail: 'reduce(init) {|acc, item| ...} — Reduce', boost: 10 },
    { label: 'mapSlice', kind: 'function', detail: 'mapSlice(length) — Sliding window slices', boost: 8 },
    { label: 'slice', kind: 'function', detail: 'slice(start, end?) — Get sub-array', boost: 8 },
  ],
};

export const STRING_MEMBERS: MemberCompletionSet = {
  properties: [
    { label: 'length', kind: 'property', detail: 'String length', boost: 15 },
  ],
  methods: [
    { label: 'split', kind: 'function', detail: 'split() — Split into character array', boost: 10 },
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
    { label: 'has', kind: 'function', detail: 'Object.has(obj, key) — Check if key exists', boost: 8 },
  ],
};
