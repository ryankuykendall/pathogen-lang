// CodeMirror 6 configuration and completions for pathogen-lang

// CodeMirror types — these objects come from the CodeMirror 6 packages loaded
// at runtime (not bundled), so we use `any` for CM-specific types.

/** A single completion item offered by CodeMirror's autocomplete. */
interface CompletionItem {
  label: string;
  type: string;
  info: string;
  boost?: number;
  template?: string;
  cursorOffset?: number;
  apply?: (view: any, completion: any, from: number, to: number) => void;
}

/** The result object returned by a completion source function. */
interface CompletionResult {
  from: number;
  options: CompletionItem[];
  validFor?: RegExp;
}

/** CodeMirror CompletionContext — the object passed to completion source functions. */
interface CompletionContext {
  state: { doc: { toString(): string; sliceString(from: number, to: number): string } };
  pos: number;
  explicit: boolean;
  matchBefore(regexp: RegExp): { from: number; to: number; text: string } | null;
}

// SVG style property completions (offered inside define ... { } blocks)
const stylePropertyCompletions: CompletionItem[] = [
  { label: 'stroke', type: 'property', info: 'stroke color' },
  { label: 'stroke-width', type: 'property', info: 'stroke width' },
  { label: 'stroke-dasharray', type: 'property', info: 'dash pattern' },
  { label: 'stroke-linecap', type: 'property', info: 'line cap style (butt, round, square)' },
  { label: 'stroke-linejoin', type: 'property', info: 'line join style (miter, round, bevel)' },
  { label: 'stroke-opacity', type: 'property', info: 'stroke opacity' },
  { label: 'fill', type: 'property', info: 'fill color' },
  { label: 'fill-opacity', type: 'property', info: 'fill opacity' },
  { label: 'fill-rule', type: 'property', info: 'fill rule (nonzero, evenodd)' },
  { label: 'opacity', type: 'property', info: 'overall opacity' },
  { label: 'font-family', type: 'property', info: 'font family' },
  { label: 'font-size', type: 'property', info: 'font size' },
  { label: 'font-weight', type: 'property', info: 'font weight' },
  { label: 'font-style', type: 'property', info: 'font style' },
  { label: 'text-anchor', type: 'property', info: 'text anchor (start, middle, end)' },
  { label: 'text-decoration', type: 'property', info: 'text decoration' },
  { label: 'dominant-baseline', type: 'property', info: 'vertical alignment' },
  { label: 'letter-spacing', type: 'property', info: 'letter spacing' },
];

// Stdlib completions for autocomplete (ordered by priority)
export const stdlibCompletions: CompletionItem[] = [
  // ctx object (used with polar/tangent functions)
  { label: 'ctx', type: 'variable', info: 'ctx - Path context object' },

  // Point constructor
  { label: 'Point', type: 'function', info: 'Point(x, y) - Create a 2D point' },
  { label: 'Cycler', type: 'function', info: 'Cycler(array, shuffle?) - Create a round-robin cycler' },

  // Layer types
  { label: 'PathLayer', type: 'keyword', info: "PathLayer('name') - Path layer type for define" },
  { label: 'TextLayer', type: 'keyword', info: "TextLayer('name') - Text layer type for define" },
  { label: 'null', type: 'keyword', info: 'null - Null literal' },

  // 1. Polar Coordinate functions
  { label: 'polarPoint', type: 'function', info: 'polarPoint(angle, distance) - Point at polar offset' },
  { label: 'polarOffset', type: 'function', info: 'polarOffset(angle, distance) - Relative polar offset' },
  { label: 'polarMove', type: 'function', info: 'polarMove(angle, distance, isMoveTo?) - Move in polar direction' },
  { label: 'polarLine', type: 'function', info: 'polarLine(angle, distance) - Line in polar direction' },

  // 2. Arc and Tangent functions
  {
    label: 'arcFromCenter',
    type: 'function',
    info: 'arcFromCenter(dcx, dcy, r, start, end, cw) - Arc from center offset',
  },
  {
    label: 'arcFromPolarOffset',
    type: 'function',
    info: 'arcFromPolarOffset(angle, radius, sweepAngle) - Arc from polar center',
  },
  { label: 'tangentLine', type: 'function', info: 'tangentLine(length) - Line following tangent' },
  { label: 'tangentArc', type: 'function', info: 'tangentArc(radius, sweepAngle) - Arc from tangent' },

  // 3. Path functions (shapes, curves, commands)
  { label: 'circle', type: 'function', info: 'circle(cx, cy, r) - Draw circle' },
  { label: 'rect', type: 'function', info: 'rect(x, y, w, h) - Draw rectangle' },
  { label: 'roundRect', type: 'function', info: 'roundRect(x, y, w, h, r) - Rounded rectangle' },
  { label: 'polygon', type: 'function', info: 'polygon(cx, cy, r, sides) - Regular polygon' },
  { label: 'star', type: 'function', info: 'star(cx, cy, outer, inner, points) - Star shape' },
  { label: 'quadratic', type: 'function', info: 'quadratic(x1, y1, cx, cy, x2, y2) - Quadratic bezier' },
  { label: 'cubic', type: 'function', info: 'cubic(x1, y1, c1x, c1y, c2x, c2y, x2, y2) - Cubic bezier' },
  { label: 'arc', type: 'function', info: 'arc(rx, ry, rot, large, sweep, x, y) - Arc command' },
  { label: 'line', type: 'function', info: 'line(x1, y1, x2, y2) - Line segment' },
  { label: 'moveTo', type: 'function', info: 'moveTo(x, y) - Move command' },
  { label: 'lineTo', type: 'function', info: 'lineTo(x, y) - Line command' },
  { label: 'closePath', type: 'function', info: 'closePath() - Close path (Z)' },

  // 4. Constants
  { label: 'PI', type: 'function', info: 'PI() - Returns π' },
  { label: 'E', type: 'function', info: 'E() - Returns e' },
  { label: 'TAU', type: 'function', info: 'TAU() - Returns 2π' },
  { label: 'mpi', type: 'function', info: 'mpi(x) - Multiply by π' },

  // 5. Angle Conversion
  { label: 'deg', type: 'function', info: 'deg(radians) - Convert radians to degrees' },
  { label: 'rad', type: 'function', info: 'rad(degrees) - Convert degrees to radians' },

  // 6. Interpolation
  { label: 'lerp', type: 'function', info: 'lerp(a, b, t) - Linear interpolation' },
  { label: 'clamp', type: 'function', info: 'clamp(value, min, max) - Constrain to range' },
  { label: 'map', type: 'function', info: 'map(val, inMin, inMax, outMin, outMax) - Map between ranges' },
  { label: 'smoothstep', type: 'function', info: 'smoothstep(edge0, edge1, x) - Hermite ease from 0 to 1 between edges' },
  { label: 'bump', type: 'function', info: 'bump(t, center, spread) - Raised-cosine kernel: 1 at center, 0 outside center ± spread' },
  { label: 'easeIn', type: 'function', info: 'easeIn(t) - Quadratic ease-in over clamped [0, 1]' },
  { label: 'easeOut', type: 'function', info: 'easeOut(t) - Quadratic ease-out over clamped [0, 1]' },
  { label: 'easeInOut', type: 'function', info: 'easeInOut(t) - Quadratic ease-in-out over clamped [0, 1]' },
  { label: 'ease', type: 'function', info: 'ease(curve, t) - Apply a named Easing curve (member or string) to t' },
  { label: 'cubicBezier', type: 'function', info: 'cubicBezier(x1, y1, x2, y2, t) - CSS cubic-bezier timing curve' },

  // 7. Trigonometry
  { label: 'sin', type: 'function', info: 'sin(x) - Sine' },
  { label: 'cos', type: 'function', info: 'cos(x) - Cosine' },
  { label: 'tan', type: 'function', info: 'tan(x) - Tangent' },
  { label: 'asin', type: 'function', info: 'asin(x) - Arc sine' },
  { label: 'acos', type: 'function', info: 'acos(x) - Arc cosine' },
  { label: 'atan', type: 'function', info: 'atan(x) - Arc tangent' },
  { label: 'atan2', type: 'function', info: 'atan2(y, x) - Two-argument arc tangent' },
  { label: 'sinh', type: 'function', info: 'sinh(x) - Hyperbolic sine' },
  { label: 'cosh', type: 'function', info: 'cosh(x) - Hyperbolic cosine' },
  { label: 'tanh', type: 'function', info: 'tanh(x) - Hyperbolic tangent' },

  // 8. Rounding
  { label: 'floor', type: 'function', info: 'floor(x) - Round down' },
  { label: 'ceil', type: 'function', info: 'ceil(x) - Round up' },
  { label: 'round', type: 'function', info: 'round(x) - Round to nearest integer' },
  { label: 'trunc', type: 'function', info: 'trunc(x) - Truncate decimal' },

  // 9. Utility
  { label: 'abs', type: 'function', info: 'abs(x) - Absolute value' },
  { label: 'sign', type: 'function', info: 'sign(x) - Sign (-1, 0, or 1)' },
  { label: 'min', type: 'function', info: 'min(a, b, ...) - Minimum value' },
  { label: 'max', type: 'function', info: 'max(a, b, ...) - Maximum value' },

  // 10. Random
  { label: 'random', type: 'function', info: 'random() - Random number 0-1' },
  { label: 'randomRange', type: 'function', info: 'randomRange(min, max) - Random in range' },
  { label: 'hash01', type: 'function', info: 'hash01(n, seed?) - Deterministic hash of integer n to [0, 1)' },
  { label: 'noise', type: 'function', info: 'noise(x, seed?) - 1D value noise, smooth and deterministic, [0, 1)' },
  { label: 'noise2', type: 'function', info: 'noise2(x, y, seed?) - 2D value noise on the unit lattice, [0, 1)' },
  { label: 'hash11', type: 'function', info: 'hash11(n, seed?) - Deterministic hash of integer n to [-1, 1)' },
  { label: 'hashRange', type: 'function', info: 'hashRange(n, min, max, seed?) - Deterministic hash of integer n to [min, max)' },

  // 11. Exponential/Log
  { label: 'exp', type: 'function', info: 'exp(x) - e raised to power x' },
  { label: 'log', type: 'function', info: 'log(...) - Natural logarithm or debug logging' },
  { label: 'log10', type: 'function', info: 'log10(x) - Base-10 logarithm' },
  { label: 'log2', type: 'function', info: 'log2(x) - Base-2 logarithm' },
  { label: 'pow', type: 'function', info: 'pow(x, y) - x raised to power y' },
  { label: 'sqrt', type: 'function', info: 'sqrt(x) - Square root' },
  { label: 'cbrt', type: 'function', info: 'cbrt(x) - Cube root' },

  // 12. Object namespace
  { label: 'Object', type: 'variable', info: 'Object - Object namespace for static methods' },
];

// Snippet templates for autocomplete
export const snippetTemplates: CompletionItem[] = [
  {
    label: 'for',
    type: 'keyword',
    info: 'for loop - iterate over a range',
    template: 'for (i in 0..10) {\n  \n}',
    cursorOffset: 16,
  },
  {
    label: 'fn',
    type: 'keyword',
    info: 'function definition',
    template: 'fn name() {\n  \n}',
    cursorOffset: 3,
  },
  {
    label: 'if',
    type: 'keyword',
    info: 'if statement - conditional execution',
    template: 'if (condition) {\n  \n}',
    cursorOffset: 4,
  },
  {
    label: 'ifelse',
    type: 'keyword',
    info: 'if-else statement',
    template: 'if (condition) {\n  \n} else {\n  \n}',
    cursorOffset: 4,
  },
  {
    label: 'switch',
    type: 'keyword',
    info: 'switch statement - match a value against case patterns',
    template: 'switch (value) {\n  case pattern {\n    \n  }\n  default {\n    \n  }\n}',
    cursorOffset: 8,
  },
  {
    label: 'let',
    type: 'keyword',
    info: 'variable declaration',
    template: 'let name = ;',
    cursorOffset: 4,
  },
  {
    label: 'forangle',
    type: 'keyword',
    info: 'radial loop - iterate angles around a circle',
    template: 'for (i in 0..count) {\n  let angle = calc(i / count * TAU());\n  \n}',
    cursorOffset: 14,
  },
  {
    label: 'forgrid',
    type: 'keyword',
    info: 'grid loop - nested rows and columns',
    template: 'for (row in 0..rows) {\n  for (col in 0..cols) {\n    \n  }\n}',
    cursorOffset: 13,
  },
  {
    label: 'define',
    type: 'keyword',
    info: 'define a layer with styles',
    template: "define PathLayer('name') #{ stroke: #000; stroke-width: 2; }",
    cursorOffset: 18,
  },
  {
    label: 'layer',
    type: 'keyword',
    info: 'layer apply block - send output to a named layer',
    template: "layer('name').apply {\n  \n}",
    cursorOffset: 7,
  },
  {
    label: 'text',
    type: 'keyword',
    info: 'text element (inline or block form)',
    template: 'text(100, 100)`content`',
    cursorOffset: 15,
  },
  {
    label: 'tspan',
    type: 'keyword',
    info: 'text span inside text() block',
    template: 'tspan(0, 20)`content`',
    cursorOffset: 13,
  },
  {
    label: 'pathblock',
    type: 'keyword',
    info: 'path block - reusable path data',
    template: 'let name = @{\n  \n}',
    cursorOffset: 4,
  },
];

// Shared property/method names for PathBlock and ProjectedPath completions
const pathSamplingProps: string[] = ['length', 'vertices', 'subPathCount', 'subPathCommands', 'startPoint', 'endPoint'];
const pathSamplingMethods: string[] = [
  'get',
  'tangent',
  'normal',
  'partition',
  'reverse',
  'boundingBox',
  'offset',
  'mirror',
  'rotateAtVertexIndex',
  'scale',
];

// Completion source for pathogen-lang
export function svgPathCompletions(context: CompletionContext): CompletionResult | null {
  // Check for 4-level property access (e.g., ctx.transform.translate.x)
  const deepProp = context.matchBefore(/(\w+)\.(\w+)\.(\w+)\.(\w*)$/);
  if (deepProp) {
    const match = deepProp.text.match(/(\w+)\.(\w+)\.(\w+)\.(\w*)$/);
    if (match) {
      const [, obj, prop1, prop2] = match;
      const from = deepProp.from + obj.length + 1 + prop1.length + 1 + prop2.length + 1;

      if (prop1 === 'transform' && prop2 === 'translate') {
        return {
          from,
          options: [
            {
              label: 'set()',
              type: 'function',
              info: 'translate.set(x, y) - Set translation',
              boost: 6,
              apply: (view: any, completion: any, from: number, to: number) => {
                view.dispatch({ changes: { from, to, insert: 'set()' }, selection: { anchor: from + 4 } });
              },
            },
            { label: 'reset()', type: 'function', info: 'translate.reset() - Clear translation', boost: 5 },
            { label: 'x', type: 'property', info: 'translate.x - X offset (0 if unset)', boost: 4 },
            { label: 'y', type: 'property', info: 'translate.y - Y offset (0 if unset)', boost: 3 },
          ],
          validFor: /^\w*$/,
        };
      }

      if (prop1 === 'transform' && prop2 === 'rotate') {
        return {
          from,
          options: [
            {
              label: 'set()',
              type: 'function',
              info: 'rotate.set(angle) or rotate.set(angle, cx, cy)',
              boost: 6,
              apply: (view: any, completion: any, from: number, to: number) => {
                view.dispatch({ changes: { from, to, insert: 'set()' }, selection: { anchor: from + 4 } });
              },
            },
            { label: 'reset()', type: 'function', info: 'rotate.reset() - Clear rotation', boost: 5 },
            {
              label: 'angle',
              type: 'property',
              info: 'rotate.angle - Rotation angle in radians (0 if unset)',
              boost: 4,
            },
            { label: 'cx', type: 'property', info: 'rotate.cx - Origin X (0 if unset)', boost: 3 },
            { label: 'cy', type: 'property', info: 'rotate.cy - Origin Y (0 if unset)', boost: 2 },
          ],
          validFor: /^\w*$/,
        };
      }

      if (prop1 === 'transform' && prop2 === 'scale') {
        return {
          from,
          options: [
            {
              label: 'set()',
              type: 'function',
              info: 'scale.set(sx, sy) or scale.set(sx, sy, cx, cy)',
              boost: 6,
              apply: (view: any, completion: any, from: number, to: number) => {
                view.dispatch({ changes: { from, to, insert: 'set()' }, selection: { anchor: from + 4 } });
              },
            },
            { label: 'reset()', type: 'function', info: 'scale.reset() - Clear scale', boost: 5 },
            { label: 'x', type: 'property', info: 'scale.x - X scale factor (1 if unset)', boost: 4 },
            { label: 'y', type: 'property', info: 'scale.y - Y scale factor (1 if unset)', boost: 3 },
            { label: 'cx', type: 'property', info: 'scale.cx - Origin X (0 if unset)', boost: 2 },
            { label: 'cy', type: 'property', info: 'scale.cy - Origin Y (0 if unset)', boost: 1 },
          ],
          validFor: /^\w*$/,
        };
      }
    }
  }

  // Check for nested property access (e.g., ctx.position.x, ctx.transform.translate)
  const nestedProp = context.matchBefore(/(\w+)\.(\w+)\.(\w*)$/);
  if (nestedProp) {
    const match = nestedProp.text.match(/(\w+)\.(\w+)\.(\w*)$/);
    if (match) {
      const [, obj, prop] = match;
      const from = nestedProp.from + obj.length + 1 + prop.length + 1;

      // ctx.transform.translate/rotate/scale/reset()
      if (obj === 'ctx' && prop === 'transform') {
        return {
          from,
          options: [
            { label: 'translate', type: 'property', info: 'transform.translate - Translation transform', boost: 4 },
            { label: 'rotate', type: 'property', info: 'transform.rotate - Rotation transform', boost: 3 },
            { label: 'scale', type: 'property', info: 'transform.scale - Scale transform', boost: 2 },
            { label: 'reset()', type: 'function', info: 'transform.reset() - Clear all transforms', boost: 1 },
          ],
          validFor: /^\w*$/,
        };
      }

      // ctx.position.x/y or ctx.start.x/y
      if (obj === 'ctx' && (prop === 'position' || prop === 'start')) {
        return {
          from,
          options: [
            { label: 'x', type: 'property', info: `${prop}.x - X coordinate`, boost: 2 },
            { label: 'y', type: 'property', info: `${prop}.y - Y coordinate`, boost: 1 },
          ],
          validFor: /^\w*$/,
        };
      }

      // arc.point.x/y (for arcFromCenter, arcFromPolarOffset, tangentArc results)
      if (prop === 'point') {
        const doc = context.state.doc.toString();
        const arcVarRegex = new RegExp(`let\\s+${obj}\\s*=\\s*(arcFromCenter|arcFromPolarOffset|tangentArc)\\s*\\(`);
        if (arcVarRegex.test(doc)) {
          return {
            from,
            options: [
              { label: 'x', type: 'property', info: `${obj}.point.x - Endpoint X coordinate`, boost: 2 },
              { label: 'y', type: 'property', info: `${obj}.point.y - Endpoint Y coordinate`, boost: 1 },
            ],
            validFor: /^\w*$/,
          };
        }
      }

      // PathBlock/ProjectedPath startPoint.x/y and endPoint.x/y
      if (prop === 'startPoint' || prop === 'endPoint') {
        const doc = context.state.doc.toString();
        const pathVarRegex = new RegExp(`let\\s+${obj}\\s*=\\s*(@\\s*\\{|\\w+\\.(draw|project)\\s*\\()`);
        if (pathVarRegex.test(doc)) {
          return {
            from,
            options: [
              { label: 'x', type: 'property', info: `${obj}.${prop}.x - X coordinate`, boost: 2 },
              { label: 'y', type: 'property', info: `${obj}.${prop}.y - Y coordinate`, boost: 1 },
            ],
            validFor: /^\w*$/,
          };
        }
      }
    }
  }

  // Check for single property access (e.g., ctx.position)
  const singleProp = context.matchBefore(/(\w+)\.(\w*)$/);
  if (singleProp) {
    const match = singleProp.text.match(/(\w+)\.(\w*)$/);
    if (match) {
      const [, obj] = match;
      if (obj === 'ctx') {
        const from = singleProp.from + obj.length + 1;
        return {
          from,
          options: [
            { label: 'position', type: 'property', info: 'ctx.position - Current pen position {x, y}', boost: 5 },
            { label: 'start', type: 'property', info: 'ctx.start - Subpath start position {x, y}', boost: 4 },
            {
              label: 'transform',
              type: 'property',
              info: 'ctx.transform - Layer transform (translate, rotate, scale)',
              boost: 3,
            },
            {
              label: 'tangentAngle',
              type: 'property',
              info: 'ctx.tangentAngle - Current tangent direction (radians)',
              boost: 2,
            },
            { label: 'commands', type: 'property', info: 'ctx.commands - Array of executed commands', boost: 1 },
          ],
          validFor: /^\w*$/,
        };
      }
      if (obj === 'Object') {
        const from = singleProp.from + obj.length + 1;
        return {
          from,
          options: [
            {
              label: 'keys()',
              type: 'function',
              info: 'Object.keys(obj) - Array of key names',
              boost: 4,
              apply: (view: any, completion: any, from: number, to: number) => {
                view.dispatch({ changes: { from, to, insert: 'keys()' }, selection: { anchor: from + 5 } });
              },
            },
            {
              label: 'values()',
              type: 'function',
              info: 'Object.values(obj) - Array of values',
              boost: 3,
              apply: (view: any, completion: any, from: number, to: number) => {
                view.dispatch({ changes: { from, to, insert: 'values()' }, selection: { anchor: from + 7 } });
              },
            },
            {
              label: 'entries()',
              type: 'function',
              info: 'Object.entries(obj) - Array of [key, value] pairs',
              boost: 2,
              apply: (view: any, completion: any, from: number, to: number) => {
                view.dispatch({ changes: { from, to, insert: 'entries()' }, selection: { anchor: from + 8 } });
              },
            },
            {
              label: 'delete()',
              type: 'function',
              info: 'Object.delete(obj, key) - Remove a key',
              boost: 1,
              apply: (view: any, completion: any, from: number, to: number) => {
                view.dispatch({ changes: { from, to, insert: 'delete()' }, selection: { anchor: from + 7 } });
              },
            },
          ],
          validFor: /^\w*$/,
        };
      }
      // Check for user-defined object variables
      const doc = context.state.doc.toString();
      const from = singleProp.from + obj.length + 1;

      // Check for Point variables (let x = Point(...) or method results returning Points)
      const pointVarRegex2 = new RegExp(
        `let\\s+${obj}\\s*=\\s*(Point|\\w+\\.(translate|polarTranslate|midpoint|lerp|rotate))\\s*\\(`,
      );
      if (pointVarRegex2.test(doc)) {
        return {
          from,
          options: [
            { label: 'x', type: 'property', info: `${obj}.x - X coordinate`, boost: 10 },
            { label: 'y', type: 'property', info: `${obj}.y - Y coordinate`, boost: 9 },
            {
              label: 'translate()',
              type: 'function',
              info: `${obj}.translate(dx, dy) - Offset by deltas`,
              boost: 8,
              apply: (view: any, completion: any, from: number, to: number) => {
                view.dispatch({ changes: { from, to, insert: 'translate()' }, selection: { anchor: from + 10 } });
              },
            },
            {
              label: 'polarTranslate()',
              type: 'function',
              info: `${obj}.polarTranslate(angle, distance) - Polar offset`,
              boost: 7,
              apply: (view: any, completion: any, from: number, to: number) => {
                view.dispatch({ changes: { from, to, insert: 'polarTranslate()' }, selection: { anchor: from + 15 } });
              },
            },
            {
              label: 'midpoint()',
              type: 'function',
              info: `${obj}.midpoint(point) - Halfway between two points`,
              boost: 6,
              apply: (view: any, completion: any, from: number, to: number) => {
                view.dispatch({ changes: { from, to, insert: 'midpoint()' }, selection: { anchor: from + 9 } });
              },
            },
            {
              label: 'lerp()',
              type: 'function',
              info: `${obj}.lerp(point, t) - Linear interpolation`,
              boost: 5,
              apply: (view: any, completion: any, from: number, to: number) => {
                view.dispatch({ changes: { from, to, insert: 'lerp()' }, selection: { anchor: from + 5 } });
              },
            },
            {
              label: 'rotate()',
              type: 'function',
              info: `${obj}.rotate(angle, origin) - Rotate around point`,
              boost: 4,
              apply: (view: any, completion: any, from: number, to: number) => {
                view.dispatch({ changes: { from, to, insert: 'rotate()' }, selection: { anchor: from + 7 } });
              },
            },
            {
              label: 'distanceTo()',
              type: 'function',
              info: `${obj}.distanceTo(point) - Euclidean distance`,
              boost: 3,
              apply: (view: any, completion: any, from: number, to: number) => {
                view.dispatch({ changes: { from, to, insert: 'distanceTo()' }, selection: { anchor: from + 11 } });
              },
            },
            {
              label: 'angleTo()',
              type: 'function',
              info: `${obj}.angleTo(point) - Angle in radians`,
              boost: 2,
              apply: (view: any, completion: any, from: number, to: number) => {
                view.dispatch({ changes: { from, to, insert: 'angleTo()' }, selection: { anchor: from + 8 } });
              },
            },
          ],
          validFor: /^\w*$/,
        };
      }

      // Check for polarOffset which returns dx, dy
      const offsetVarRegex = new RegExp(`let\\s+${obj}\\s*=\\s*polarOffset\\s*\\(`);
      if (offsetVarRegex.test(doc)) {
        return {
          from,
          options: [
            { label: 'dx', type: 'property', info: `${obj}.dx - X offset`, boost: 2 },
            { label: 'dy', type: 'property', info: `${obj}.dy - Y offset`, boost: 1 },
          ],
          validFor: /^\w*$/,
        };
      }

      // Check for polarPoint which returns x, y
      const pointVarRegex = new RegExp(`let\\s+${obj}\\s*=\\s*polarPoint\\s*\\(`);
      if (pointVarRegex.test(doc)) {
        return {
          from,
          options: [
            { label: 'x', type: 'property', info: `${obj}.x - X coordinate`, boost: 2 },
            { label: 'y', type: 'property', info: `${obj}.y - Y coordinate`, boost: 1 },
          ],
          validFor: /^\w*$/,
        };
      }

      // Check for arcFromCenter/arcFromPolarOffset which return {point: {x, y}, angle}
      const arcVarRegex = new RegExp(`let\\s+${obj}\\s*=\\s*(arcFromCenter|arcFromPolarOffset|tangentArc)\\s*\\(`);
      if (arcVarRegex.test(doc)) {
        return {
          from,
          options: [
            { label: 'point', type: 'property', info: `${obj}.point - Endpoint {x, y}`, boost: 3 },
            { label: 'angle', type: 'property', info: `${obj}.angle - Tangent angle (radians)`, boost: 2 },
          ],
          validFor: /^\w*$/,
        };
      }

      // Check for Cycler variables (let x = Cycler(...))
      const cyclerVarRegex = new RegExp(`let\\s+${obj}\\s*=\\s*Cycler\\s*\\(`);
      if (cyclerVarRegex.test(doc)) {
        return {
          from,
          options: [
            { label: 'length', type: 'property', info: `${obj}.length - Number of items`, boost: 2 },
            { label: 'pick()', type: 'function', info: `${obj}.pick() - Next element in cycle order`, boost: 1 },
          ],
          validFor: /^\w*$/,
        };
      }

      // Check for PathBlock variables (let x = @{ ... })
      const pathBlockVarRegex = new RegExp(`let\\s+${obj}\\s*=\\s*@\\s*\\{`);
      if (pathBlockVarRegex.test(doc)) {
        let boost = pathSamplingProps.length + pathSamplingMethods.length + 2;
        const options: CompletionItem[] = [];
        // PathBlock-only methods
        options.push({
          label: 'draw()',
          type: 'function',
          info: `${obj}.draw() - Draw the path block`,
          boost: boost--,
          apply: (view: any, completion: any, from: number, to: number) => {
            view.dispatch({ changes: { from, to, insert: 'draw()' }, selection: { anchor: from + 5 } });
          },
        });
        options.push({
          label: 'project()',
          type: 'function',
          info: `${obj}.project(t) - Project a point onto the path`,
          boost: boost--,
          apply: (view: any, completion: any, from: number, to: number) => {
            view.dispatch({ changes: { from, to, insert: 'project()' }, selection: { anchor: from + 8 } });
          },
        });
        // Shared properties
        for (const p of pathSamplingProps) {
          options.push({ label: p, type: 'property', info: `${obj}.${p}`, boost: boost-- });
        }
        // Shared methods
        for (const m of pathSamplingMethods) {
          options.push({
            label: `${m}()`,
            type: 'function',
            info: `${obj}.${m}()`,
            boost: boost--,
            apply: (view: any, completion: any, from: number, to: number) => {
              view.dispatch({ changes: { from, to, insert: `${m}()` }, selection: { anchor: from + m.length + 1 } });
            },
          });
        }
        return { from, options, validFor: /^\w*$/ };
      }

      // Check for ProjectedPath variables (let x = var.draw() or let x = var.project(...))
      const projectedPathVarRegex = new RegExp(`let\\s+${obj}\\s*=\\s*\\w+\\.(draw|project)\\s*\\(`);
      if (projectedPathVarRegex.test(doc)) {
        let boost = pathSamplingProps.length + pathSamplingMethods.length;
        const options: CompletionItem[] = [];
        for (const p of pathSamplingProps) {
          options.push({ label: p, type: 'property', info: `${obj}.${p}`, boost: boost-- });
        }
        for (const m of pathSamplingMethods) {
          options.push({
            label: `${m}()`,
            type: 'function',
            info: `${obj}.${m}()`,
            boost: boost--,
            apply: (view: any, completion: any, from: number, to: number) => {
              view.dispatch({ changes: { from, to, insert: `${m}()` }, selection: { anchor: from + m.length + 1 } });
            },
          });
        }
        return { from, options, validFor: /^\w*$/ };
      }

      // Check for Object variables (let x = { ... })
      const objectVarRegex = new RegExp(`let\\s+${obj}\\s*=\\s*\\{`);
      if (objectVarRegex.test(doc)) {
        return {
          from,
          options: [
            { label: 'length', type: 'property', info: `${obj}.length - Property count`, boost: 2 },
            {
              label: 'has()',
              type: 'function',
              info: `${obj}.has(key) - Check if key exists`,
              boost: 1,
              apply: (view: any, completion: any, from: number, to: number) => {
                view.dispatch({ changes: { from, to, insert: 'has()' }, selection: { anchor: from + 4 } });
              },
            },
          ],
          validFor: /^\w*$/,
        };
      }

      // Check for string variables (let x = `...` or let x = "...")
      const stringVarRegex = new RegExp(`let\\s+${obj}\\s*=\\s*(\`|")`);
      // Also check for string method results (let x = str.append/prepend/slice)
      const stringMethodRegex = new RegExp(`let\\s+${obj}\\s*=\\s*\\w+\\.(append|prepend|slice)\\s*\\(`);
      if (stringVarRegex.test(doc) || stringMethodRegex.test(doc)) {
        return {
          from,
          options: [
            { label: 'length', type: 'property', info: `${obj}.length - Number of characters`, boost: 8 },
            { label: 'empty()', type: 'function', info: `${obj}.empty() - 1 if empty, 0 otherwise`, boost: 7 },
            { label: 'split()', type: 'function', info: `${obj}.split() - Array of characters`, boost: 6 },
            {
              label: 'includes()',
              type: 'function',
              info: `${obj}.includes(substr) - 1 if contains substring`,
              boost: 5,
              apply: (view: any, completion: any, from: number, to: number) => {
                view.dispatch({ changes: { from, to, insert: 'includes()' }, selection: { anchor: from + 9 } });
              },
            },
            {
              label: 'append()',
              type: 'function',
              info: `${obj}.append(str) - New string with value at end`,
              boost: 4,
              apply: (view: any, completion: any, from: number, to: number) => {
                view.dispatch({ changes: { from, to, insert: 'append()' }, selection: { anchor: from + 7 } });
              },
            },
            {
              label: 'prepend()',
              type: 'function',
              info: `${obj}.prepend(str) - New string with value at start`,
              boost: 3,
              apply: (view: any, completion: any, from: number, to: number) => {
                view.dispatch({ changes: { from, to, insert: 'prepend()' }, selection: { anchor: from + 8 } });
              },
            },
            {
              label: 'slice()',
              type: 'function',
              info: `${obj}.slice(start, end) - Extract substring`,
              boost: 2,
              apply: (view: any, completion: any, from: number, to: number) => {
                view.dispatch({ changes: { from, to, insert: 'slice()' }, selection: { anchor: from + 6 } });
              },
            },
          ],
          validFor: /^\w*$/,
        };
      }

      // Check for array variables (let x = [...] or let x = str.split())
      const arrayVarRegex = new RegExp(`let\\s+${obj}\\s*=\\s*\\[`);
      const splitResultRegex = new RegExp(`let\\s+${obj}\\s*=\\s*\\w+\\.split\\s*\\(`);
      if (arrayVarRegex.test(doc) || splitResultRegex.test(doc)) {
        return {
          from,
          options: [
            { label: 'length', type: 'property', info: `${obj}.length - Number of elements`, boost: 8 },
            { label: 'empty()', type: 'function', info: `${obj}.empty() - 1 if empty, 0 otherwise`, boost: 7 },
            {
              label: 'push()',
              type: 'function',
              info: `${obj}.push(value) - Append and return new length`,
              boost: 6,
              apply: (view: any, completion: any, from: number, to: number) => {
                view.dispatch({ changes: { from, to, insert: 'push()' }, selection: { anchor: from + 5 } });
              },
            },
            { label: 'pop()', type: 'function', info: `${obj}.pop() - Remove and return last element`, boost: 5 },
            {
              label: 'unshift()',
              type: 'function',
              info: `${obj}.unshift(value) - Prepend and return new length`,
              boost: 4,
              apply: (view: any, completion: any, from: number, to: number) => {
                view.dispatch({ changes: { from, to, insert: 'unshift()' }, selection: { anchor: from + 8 } });
              },
            },
            { label: 'shift()', type: 'function', info: `${obj}.shift() - Remove and return first element`, boost: 3 },
          ],
          validFor: /^\w*$/,
        };
      }

      // If we reach here, the cursor is in a member-access context (`X.`)
      // that none of the above special-case branches recognized. Return
      // null so the shared language-services completion engine (which
      // handles PathLayer, Point, PathBlock, Cycler, etc. via type
      // inference) is the authoritative source for this completion.
      // Without this return, execution would fall through to the regular
      // word completion below and emit top-level keywords/stdlib items,
      // drowning out the correct member completions (user bug 2026-04-11).
      return null;
    }
  }

  // Style block completion is now handled entirely by the shared
  // language-services engine (see getCompletions in
  // src/language-services/completion.ts). It correctly distinguishes
  // property-name position (before `:`) from value position (after `:`),
  // which the legacy handler here did not. Returning null for any
  // `${ ... }` context defers to the shared engine.
  if (isInsideLegacyStyleBlock(context)) {
    return null;
  }

  // Defer to the shared engine for the leading-symbol triggers it owns:
  //   • `@` / `&` at statement start  → block-start snippets (@font, @{, &{)
  //   • `$` at statement start        → declaration snippets (let, PathLayer, TextLayer)
  //   • `$` in expression position    → style-block snippet (${  })
  //   • inside a backtick template    → ${...} interpolation snippet
  // Without these early returns, the legacy fallback's keyword/snippet list
  // merges into the shared engine's filtered result and dilutes precise
  // single-option matches like `@font` for `@f`.
  if (isInsideLegacyBacktickString(context)) {
    return null;
  }
  if (isLegacyLeadingSymbolTrigger(context)) {
    return null;
  }

  // Regular word completion
  const word = context.matchBefore(/\w*/);
  if (!word || (word.from === word.to && !context.explicit)) return null;

  const doc = context.state.doc.toString();
  const options: CompletionItem[] = [];
  let boost = 200;

  // 1. calc() - highest priority
  options.push({
    label: 'calc',
    type: 'function',
    info: 'calc(expr) - Evaluate math expression',
    boost: boost--,
    apply: (view: any, completion: any, from: number, to: number) => {
      view.dispatch({
        changes: { from, to, insert: 'calc()' },
        selection: { anchor: from + 5 },
      });
    },
  });

  // 2. Snippet templates - high priority
  for (const snippet of snippetTemplates) {
    options.push({
      label: snippet.label,
      type: snippet.type,
      info: snippet.info,
      boost: boost--,
      apply: (view: any, completion: any, from: number, to: number) => {
        view.dispatch({
          changes: { from, to, insert: snippet.template! },
          selection: { anchor: from + snippet.cursorOffset! },
        });
      },
    });
  }

  // 3. User-defined variables (let name = ...)
  const varRegex = /let\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*=/g;
  const seenVars = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = varRegex.exec(doc)) !== null) {
    const name = match[1];
    if (!seenVars.has(name)) {
      seenVars.add(name);
      options.push({
        label: name,
        type: 'variable',
        info: 'User variable',
        boost: boost--,
      });
    }
  }

  // 3.5. Function parameters (scoped to function body)
  const fnParamRegex = /fn\s+\w+\s*\(([^)]*)\)\s*\{/g;
  const seenParams = new Set<string>();
  while ((match = fnParamRegex.exec(doc)) !== null) {
    const paramsStr = match[1];
    const openBracePos = match.index + match[0].length - 1;

    // Find matching closing brace via depth counting
    let depth = 1;
    let pos = openBracePos + 1;
    while (pos < doc.length && depth > 0) {
      if (doc[pos] === '{') depth++;
      else if (doc[pos] === '}') depth--;
      pos++;
    }
    const closeBracePos = pos - 1;

    // Only add params if cursor is inside this function body
    if (context.pos > openBracePos && context.pos <= closeBracePos) {
      const paramNames = paramsStr
        .split(',')
        .map((p) => p.trim())
        .filter((p) => p.length > 0);
      for (const name of paramNames) {
        if (!seenParams.has(name) && !seenVars.has(name)) {
          seenParams.add(name);
          options.push({
            label: name,
            type: 'variable',
            info: 'Function parameter',
            boost: boost--,
          });
        }
      }
    }
  }

  // 4. User-defined functions (fn name(...) { ... })
  const fnRegex = /fn\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g;
  const seenFns = new Set<string>();
  while ((match = fnRegex.exec(doc)) !== null) {
    const name = match[1];
    if (!seenFns.has(name)) {
      seenFns.add(name);
      options.push({
        label: name,
        type: 'function',
        info: 'User function',
        boost: boost--,
        apply: (view: any, completion: any, from: number, to: number) => {
          view.dispatch({
            changes: { from, to, insert: `${name}()` },
            selection: { anchor: from + name.length + 1 },
          });
        },
      });
    }
  }

  // 5. Loop variables (for (name in ...))
  const loopVarRegex = /for\s*\(\s*([a-zA-Z_][a-zA-Z0-9_]*)\s+in\b/g;
  const seenLoopVars = new Set<string>();
  while ((match = loopVarRegex.exec(doc)) !== null) {
    const name = match[1];
    if (!seenLoopVars.has(name) && !seenVars.has(name)) {
      seenLoopVars.add(name);
      options.push({
        label: name,
        type: 'variable',
        info: 'Loop variable',
        boost: boost--,
      });
    }
  }

  // 6. Stdlib items (lowest priority)
  for (const item of stdlibCompletions) {
    // Skip if user already defined something with same name
    if (
      seenVars.has(item.label) ||
      seenFns.has(item.label) ||
      seenLoopVars.has(item.label) ||
      seenParams.has(item.label)
    )
      continue;

    const completion: CompletionItem = {
      label: item.label,
      type: item.type,
      info: item.info,
      boost: boost--,
    };

    // For functions, add parentheses and cursor positioning
    if (item.type === 'function') {
      completion.apply = (view: any, completion: any, from: number, to: number) => {
        const insert = `${item.label}()`;
        view.dispatch({
          changes: { from, to, insert },
          selection: { anchor: from + item.label.length + 1 },
        });
      };
    }

    options.push(completion);
  }

  return {
    from: word.from,
    options,
    validFor: /^\w*$/,
  };
}

/**
 * Detect whether the cursor is inside a `${ ... }` style block. The check
 * walks backward from the cursor looking for the nearest unmatched `#{`
 * before any closing `}`. When this returns true, svgPathCompletions should
 * return null so the shared language-services engine owns completions for
 * both property-name and value positions.
 */
function isInsideLegacyStyleBlock(context: CompletionContext): boolean {
  const textBefore = context.state.doc.sliceString(0, context.pos);
  let depth = 0;
  for (let i = textBefore.length - 1; i >= 0; i--) {
    const ch = textBefore[i];
    if (ch === '}') depth++;
    if (ch === '{' && i > 0 && textBefore[i - 1] === '#') {
      if (depth === 0) return true;
      depth--;
    }
  }
  return false;
}

/**
 * Detect whether the cursor is inside a backtick-quoted template literal.
 * The shared engine offers a `${...}` interpolation snippet here. Without
 * this defer, the legacy fallback emits keyword/snippet noise that drowns
 * the interpolation suggestion.
 */
function isInsideLegacyBacktickString(context: CompletionContext): boolean {
  const textBefore = context.state.doc.sliceString(0, context.pos);
  let inSingle = false;
  let inDouble = false;
  let inBacktick = false;
  for (let i = 0; i < textBefore.length; i++) {
    const ch = textBefore[i];
    if (ch === '\\') { i++; continue; }
    if (inBacktick) {
      if (ch === '`') inBacktick = false;
      continue;
    }
    if (inSingle) {
      if (ch === "'") inSingle = false;
      continue;
    }
    if (inDouble) {
      if (ch === '"') inDouble = false;
      continue;
    }
    if (ch === '`') inBacktick = true;
    else if (ch === "'") inSingle = true;
    else if (ch === '"') inDouble = true;
  }
  return inBacktick;
}

/**
 * Detect whether the cursor follows a leading-symbol trigger (`@`, `&`, or
 * `$`) that the shared engine handles exclusively. The shared engine
 * decides which snippet menu to surface based on statement-start position
 * and expression context — the legacy fallback should not contribute here.
 */
function isLegacyLeadingSymbolTrigger(context: CompletionContext): boolean {
  const textBefore = context.state.doc.sliceString(0, context.pos);
  return /[@&]\w*$/.test(textBefore) || /\$$/.test(textBefore);
}
