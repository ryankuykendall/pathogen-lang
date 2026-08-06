import { describe, expect, it } from 'vitest';

import { compile, compileAnnotated } from '../src';

describe('Annotated Output', () => {
  describe('basic path commands', () => {
    it('outputs each path command on its own line', () => {
      const result = compileAnnotated('M 0 0 L 10 20 Z');
      const lines = result.split('\n').filter((l) => l.trim());
      expect(lines).toContain('M 0 0');
      expect(lines).toContain('L 10 20');
      expect(lines).toContain('Z');
    });

    it('preserves path command values', () => {
      const result = compileAnnotated('M 100 200');
      expect(result).toContain('M 100 200');
    });
  });

  describe('comments', () => {
    it('preserves single line comments', () => {
      const result = compileAnnotated('// This is a comment\nM 0 0');
      expect(result).toContain('// This is a comment');
    });

    it('preserves multiple comments', () => {
      const result = compileAnnotated(`// First
M 0 0
// Second
L 10 20`);
      expect(result).toContain('// First');
      expect(result).toContain('// Second');
    });

    it('preserves inline comments', () => {
      const result = compileAnnotated('M 0 0 // start point');
      expect(result).toContain('// start point');
    });
  });

  describe('for loops', () => {
    it('annotates simple for loop', () => {
      // 0..3 is inclusive: 0, 1, 2, 3
      const result = compileAnnotated('for (i in 0..3) { M i 0 }');
      expect(result).toContain('//--- for (i in 0..3) from line 1');
      expect(result).toContain('//--- iteration 0');
      expect(result).toContain('//--- iteration 1');
      expect(result).toContain('//--- iteration 2');
      expect(result).toContain('//--- iteration 3');
    });

    it('shows correct line number for loop', () => {
      const result = compileAnnotated(`M 0 0
for (i in 0..2) { L i 0 }`);
      expect(result).toContain('from line 2');
    });

    it('truncates long loops', () => {
      // 0..20 is inclusive: 21 iterations (0 through 20)
      // First 3: 0, 1, 2. Last 3: 18, 19, 20. Skip: 15
      const result = compileAnnotated('for (i in 0..20) { M i 0 }');
      expect(result).toContain('//--- iteration 0');
      expect(result).toContain('//--- iteration 1');
      expect(result).toContain('//--- iteration 2');
      expect(result).toContain('... 15 more iterations ...');
      expect(result).toContain('//--- iteration 18');
      expect(result).toContain('//--- iteration 19');
      expect(result).toContain('//--- iteration 20');
      // Should NOT contain middle iterations
      expect(result).not.toContain('//--- iteration 10');
    });

    it('shows all iterations for short loops', () => {
      // 0..5 is inclusive: 6 iterations (0 through 5), below truncation threshold
      const result = compileAnnotated('for (i in 0..5) { M i 0 }');
      expect(result).toContain('//--- iteration 0');
      expect(result).toContain('//--- iteration 1');
      expect(result).toContain('//--- iteration 2');
      expect(result).toContain('//--- iteration 3');
      expect(result).toContain('//--- iteration 4');
      expect(result).toContain('//--- iteration 5');
      expect(result).not.toContain('more iterations');
    });
  });

  describe('function calls', () => {
    it('annotates stdlib function calls', () => {
      const result = compileAnnotated('circle(50, 50, 25);');
      expect(result).toContain('//--- circle(50, 50, 25) called from line 1');
    });

    it('shows correct line number for function calls', () => {
      // Note: Function calls need to be separate statements (not after path commands)
      // because otherwise they're parsed as path arguments
      const result = compileAnnotated(`// Setup
circle(100, 100, 50);`);
      expect(result).toContain('from line 2');
    });

    it('annotates user-defined function calls', () => {
      const result = compileAnnotated(`fn square(x, y, s) {
  M x y
  L calc(x + s) y
  L calc(x + s) calc(y + s)
  L x calc(y + s)
  Z
}
square(10, 10, 50);`);
      expect(result).toContain('//--- square(10, 10, 50) called from line');
      expect(result).toContain('M 10 10');
      expect(result).toContain('L 60 10');
    });
  });

  describe('nested structures', () => {
    it('handles nested loops', () => {
      const result = compileAnnotated(`
for (i in 0..2) {
  for (j in 0..2) {
    M i j
  }
}`);
      // Should have outer loop annotation
      expect(result).toContain('//--- for (i in 0..2)');
      // Should have inner loop annotations
      expect(result).toContain('//--- for (j in 0..2)');
    });

    it('handles function calls inside loops', () => {
      const result = compileAnnotated(`
for (i in 0..3) {
  circle(calc(i * 50), 50, 20);
}`);
      expect(result).toContain('//--- for (i in 0..3)');
      expect(result).toContain('//--- circle');
    });
  });

  describe('variables and expressions', () => {
    it('evaluates variables in output', () => {
      const result = compileAnnotated(`
let x = 100;
let y = 200;
M x y`);
      expect(result).toContain('M 100 200');
    });

    it('evaluates calc expressions', () => {
      const result = compileAnnotated('M calc(10 + 20) calc(5 * 3)');
      expect(result).toContain('M 30 15');
    });
  });

  describe('if statements', () => {
    it('only shows executed branch', () => {
      const result = compileAnnotated(`
let x = 10;
if (x > 5) {
  M 100 100
} else {
  M 0 0
}`);
      expect(result).toContain('M 100 100');
      expect(result).not.toContain('M 0 0');
    });
  });

  describe('complex examples', () => {
    it('handles spiral example', () => {
      const result = compileAnnotated(`
// Spiral pattern
M 100 100
for (i in 1..5) {
  let angle = calc(i * 0.5);
  let r = calc(i * 10);
  L calc(100 + r) calc(100 + r)
}`);
      expect(result).toContain('// Spiral pattern');
      expect(result).toContain('M 100 100');
      expect(result).toContain('//--- for (i in 1..5)');
      expect(result).toContain('//--- iteration 1');
    });

    it('handles steps function', () => {
      // User function called as separate statement
      const result = compileAnnotated(`
fn steps(count, tread, riser) {
  for (i in 0..count) {
    h tread
    v riser
  }
}
steps(3, 20, 10);`);
      expect(result).toContain('//--- steps(3, 20, 10)');
      expect(result).toContain('//--- for (i in 0..3)');
      expect(result).toContain('h 20');
      expect(result).toContain('v 10');
    });
  });

  describe('context-aware functions', () => {
    it('handles polarLine', () => {
      const result = compileAnnotated('M 50 50 polarLine(0, 100);');
      expect(result).toContain('L');
      expect(result).toContain('150'); // 50 + 100*cos(0) = 150
    });

    it('handles arcFromCenter', () => {
      const result = compileAnnotated('arcFromCenter(0, 0, 50, 0, 90deg, 1);');
      // arcFromCenter now emits L (not M) to keep paths continuous
      expect(result).toContain('L');
      expect(result).toContain('A');
    });

    it('handles arcFromPolarOffset', () => {
      const result = compileAnnotated('arcFromPolarOffset(0, 50, 90deg);');
      // arcFromPolarOffset emits only A (no L or M)
      expect(result).toContain('A 50 50');
      expect(result).not.toContain('L');
    });

    it('handles tangentLine after arc', () => {
      const result = compileAnnotated(`
arcFromCenter(0, 0, 50, 0, 90deg, 1);
tangentLine(20);`);
      expect(result).toContain('L');
    });

    it('handles polarMove', () => {
      const result = compileAnnotated('M 0 0 polarMove(0, 100);');
      expect(result).toContain('L');
      expect(result).toContain('100'); // 0 + 100*cos(0) = 100
    });
  });

  describe('return statements', () => {
    it('handles explicit return in user function', () => {
      const result = compileAnnotated(`
fn double(x) { return calc(x * 2); }
M double(5) 0`);
      expect(result).toContain('M 10 0');
    });

    it('handles return in nested function call', () => {
      const result = compileAnnotated(`
fn add(a, b) { return calc(a + b); }
fn triple(x) { return calc(x * 3); }
M add(triple(2), 4) 0`);
      expect(result).toContain('M 10 0'); // triple(2)=6, add(6,4)=10
    });
  });

  describe('angle units', () => {
    it('converts deg to radians', () => {
      const result = compileAnnotated('M calc(sin(90deg)) 0');
      expect(result).toContain('M 1 0');
    });

    it('handles degrees in polarLine', () => {
      // polarLine(90deg, 100) at position (50, 50) should go to (50, 150)
      const result = compileAnnotated('M 50 50 polarLine(90deg, 100);');
      expect(result).toContain('L');
      expect(result).toContain('150'); // 50 + 100*sin(90deg) = 150
    });

    it('hueShift(90deg) matches hueShift(90) (unit-aware color methods, parity)', () => {
      const result = compileAnnotated(`let c = Color(0.5, 0.15, 30);
if (c.hueShift(90deg).hue == c.hueShift(90).hue) { M 1 1 } else { M 9 9 }`);
      expect(result).toContain('M 1 1');
    });

    it('flatten() composites 50% red over default white (parity)', () => {
      const result = compileAnnotated(`let c = Color("#ff0000").alpha(0.5);
let flat = c.flatten();
if (flat.a == 1) { M 1 1 } else { M 9 9 }`);
      expect(result).toContain('M 1 1');
    });

    it('flatten() onto translucent background composites alpha (parity)', () => {
      const result = compileAnnotated(`let c = Color("#ff0000").alpha(0.5);
let bg = Color("#ffffff").alpha(0.5);
if (c.flatten(bg).a == 0.75) { M 1 1 } else { M 9 9 }`);
      expect(result).toContain('M 1 1');
    });

    it('flatten() throws on theme-dynamic colors (parity)', () => {
      expect(() => compileAnnotated('let c = Color(CSSVar("--x", "#ff0000")); c.flatten();')).toThrow(
        'theme-dynamic'
      );
    });

    it('hueShift over calc angle arithmetic matches degrees (parity)', () => {
      const result = compileAnnotated(`let c = Color(0.5, 0.15, 30);
if (c.hueShift(calc(1 / 2 * 2pi)).hue == c.hueShift(180).hue) { M 1 1 } else { M 9 9 }`);
      expect(result).toContain('M 1 1');
    });

    it('throws on angle unit mismatch in + (parity with primary evaluator)', () => {
      expect(() => compileAnnotated('M calc(90deg + 5) 0')).toThrow(/Cannot add.*angle unit/);
    });

    it('throws when multiplying two angle values (parity)', () => {
      expect(() => compileAnnotated('M calc(90deg * 45deg) 0')).toThrow(/Cannot multiply.*angle/);
    });

    it('angle survives a variable into hueShift (first-class Angle parity)', () => {
      const result = compileAnnotated(`let c = Color(0.5, 0.15, 30);
let turn = 0.5pi;
if (c.hueShift(turn).hue == c.hueShift(90).hue) { M 1 1 } else { M 9 9 }`);
      expect(result).toContain('M 1 1');
    });

    it('an Angle variable reads as radians in a path argument (parity)', () => {
      const result = compileAnnotated('let d = calc(90deg / 2);\nM d 0');
      expect(result).toContain(`M ${Math.PI / 4} 0`);
    });

    it('context-aware call display shows the written unit (parity)', () => {
      // The annotated function_call line renders the Angle in its unit while
      // the geometry uses radians: 50 + 100*sin(90deg) = 150
      const result = compileAnnotated('let a = 90deg;\nM 50 50 polarLine(a, 100);');
      expect(result).toContain('polarLine(90deg, 100)');
      expect(result).toContain('150');
      expect(result).not.toContain('[object Object]');
    });

    it('no [object Object] when an Angle flows through path arg, fn call, and style', () => {
      const result = compileAnnotated(`let ang = 45deg;
fn spoke(angle) { return calc(sin(angle) * 10); }
define PathLayer('p') \${ rotate: ang; }
M spoke(ang) ang
M 50 50 polarLine(ang, 100);`);
      expect(result).not.toContain('[object Object]');
      expect(result).toContain(`M ${Math.sin(Math.PI / 4) * 10} ${Math.PI / 4}`);
    });

    it('lambda closure resolves lexically under --annotated (parity with plain)', () => {
      const result = compileAnnotated(`let scale = 3;
let times = {|x| return calc(x * scale); };
fn caller() { let scale = 100; return times(2); }
M caller() 0`);
      expect(result).toContain('M 6 0');
    });

    it('lambda called in path-arg position works under --annotated (2nd dispatch)', () => {
      const result = compileAnnotated(`let f = {|x| return calc(x * 2); };
M f(5) 0`);
      expect(result).toContain('M 10 0');
      expect(result).not.toContain('[object Object]');
    });

    it('lambda applied to array.map via << works under --annotated (no-crash + geometry)', () => {
      const result = compileAnnotated(`let g = {|v| return calc(v + 1); };
let a = [1, 2].map() << g;
M 0 0`);
      expect(result).toContain('M 0 0');
    });

    it('Grid.fill/map/forEach, sort, and reduce accept << workers under --annotated (parity)', () => {
      // All six annotated resolveCallbackBlock sites — the two VO methods
      // throw "not supported in --annotated" and are pinned separately.
      // (Assignment statements are unsupported in annotated callback bodies —
      // pre-existing limitation — so forEach is exercised no-op style and the
      // sum goes through reduce.)
      const result = compileAnnotated(`let g = Grid(2, 2);
g.fill() << {|r, c| return calc(r * 10 + c); };
let doubled = g.map() << {|cell| return calc(cell * 2); };
doubled.forEach() << {|cell| return cell; };
let cells = doubled.cells();
let total = cells.reduce(0) << {|acc, v| return calc(acc + v); };
let s = [3, 1, 2].sort() << {|a, b| return calc(a - b); };
let first = s[0];
M total first`);
      expect(result).toContain('M 44 1'); // (0+1+10+11)*2 = 44; sort asc → 1
    });

    it('object merge via << works under --annotated (parity with the main evaluator)', () => {
      // Pins the ObjectValue << ObjectValue case added for parity — this
      // previously threw in annotated mode while compiling fine normally.
      const result = compileAnnotated(`let a = { x: 1 };
let b = a << { y: 2, x: 9 };
M b.x b.y`);
      expect(result).toContain('M 9 2');
    });

    it('a callable landing on the merge path gets the targeted hint under --annotated', () => {
      expect(() => compileAnnotated(`let f = {|v| return v; };
let a = 5 << f;
M 0 0`)).toThrow(/can apply a function or lambda only to a callback builtin call/);
    });

    it('variableOffset() << worker still reports the annotated-mode limitation', () => {
      expect(() => compileAnnotated(`let mk = {|go, pb| go.stop(0, 2, CurveContinuity.G1); };
let s = @{ l 100 0 };
let e = s.variableOffset() << mk;
M 0 0`)).toThrow(/not supported in --annotated/);
    });

    it('reduce(init) << worker evaluates init BEFORE the worker under --annotated (parity)', () => {
      // Mirrors the plain-evaluator order test in tests/lambdas.test.ts —
      // annotated.ts has its own resolveCallbackBlock copy (parity-drift
      // history: 2nd dispatch, own sort, own formatters), so pin both.
      // Contract: receiver -> parenthesized args -> << worker expression.
      // Geometry encodes the proof via an order-recording array (assignment
      // statements and .length() aren't supported in annotated fn bodies /
      // mode, so push() records and the first two entries discriminate):
      // init-first single-eval → order [1, 2] → M 106 12. Reversed → 21;
      // a double evaluation of init → 11.
      const result = compileAnnotated(`let order = [];
fn computeInit() { order.push(1); return 100; }
fn makeFn() { order.push(2); return {|acc, v| return calc(acc + v); }; }
let total = [1, 2, 3].reduce(computeInit()) << makeFn();
let first = order[0];
let second = order[1];
M total calc(first * 10 + second)`);
      expect(result).toContain('M 106 12');
    });

    it('lambda arg renders as Lambda(params) in the function_call annotation', () => {
      // The function_call trace line goes through displayArg — this is where
      // the [object Object] regression would actually surface. Statement-level
      // user-fn calls are what emit the trace line.
      const result = compileAnnotated(`let g = {|v| return calc(v + 1); };
fn spot(f) {
  M f(1) 0
}
spot(g);`);
      expect(result).toContain('spot(Lambda(v))');
      expect(result).not.toContain('[object Object]');
      expect(result).toContain('M 2 0');
    });

    it('bare stdlib call statement unwraps Angle args (parity)', () => {
      // arc()'s x-axis-rotation slot receives an Angle via the bare
      // fn-call-statement branch, which has its own dispatch
      const result = compileAnnotated('M 50 100\narc(50, 50, 30deg, 1, 1, 150, 100);');
      expect(result).not.toContain('[object Object]');
      expect(result).toContain(`A 50 50 ${(30 * Math.PI) / 180}`);
    });

    it('.toPi() re-tags display and keeps the radians value (parity)', () => {
      // Geometry unchanged (sin reads radians); display in the context-aware
      // call line shows the re-tagged unit
      const result = compileAnnotated('let a = 90deg;\nlet b = a.toPi();\nM 50 50 polarLine(b, 100);');
      expect(result).toContain('polarLine(0.5pi, 100)');
      expect(result).toContain('150');
    });

    it('sort() orders Angle arrays (parity)', () => {
      const result = compileAnnotated(
        'let arr = [1pi, 90deg, 0.1rad];\nlet s = arr.sort();\nlet first = s[0];\nM first.rad 0',
      );
      expect(result).toContain('M 0.1 0');
    });

    it('hue-rotate with an Angle variable emits degrees in CSS (parity)', () => {
      const result = compileAnnotated(
        "let myAngle = 90deg;\ndefine PathLayer('p') ${ filter: hue-rotate(myAngle); }\nM 0 0",
      );
      expect(result).not.toContain('hue-rotate(myAngle)');
    });

    it('Color(L, C, H) auto-converts an Angle hue (parity)', () => {
      const result = compileAnnotated(`let h = 90deg;
if (Color(0.5, 0.15, h).hue == 90) { M 1 1 } else { M 9 9 }`);
      expect(result).toContain('M 1 1');
    });
  });

  describe('gradient property validation (parity with primary evaluator)', () => {
    // The annotated evaluator used to accept-or-ignore all gradient property
    // assignments ("lenient by design"), so programs the primary evaluator
    // rejects compiled fine under --annotated. Both now share
    // assignGradientProperty from gradient-assign.ts.
    const conic = `let g = ConicGradient('cg', 50, 50) {|g|
      g.stop(0, Color('#000'));
      g.stop(1, Color('#fff'));
    };`;

    it('accepts angle-suffixed from/to', () => {
      expect(() =>
        compileAnnotated(`${conic}
g.from = 135deg;
g.to = 405deg;
M 0 0`),
      ).not.toThrow();
    });

    it('rejects a bare number on from with the helpful message', () => {
      expect(() =>
        compileAnnotated(`${conic}
g.from = 135;`),
      ).toThrow(/ConicGradient 'from' requires an angle unit.*135deg/);
    });

    it('rejects invalid direction', () => {
      expect(() =>
        compileAnnotated(`${conic}
g.direction = 'up';`),
      ).toThrow(/ConicGradient direction must be 'cw' or 'ccw'/);
    });

    it('rejects invalid spread', () => {
      expect(() =>
        compileAnnotated(`${conic}
g.spread = 'mirror';`),
      ).toThrow(/ConicGradient spread must be 'clamp', 'repeat', or 'transparent'/);
    });

    it('rejects wrong-typed steps', () => {
      expect(() =>
        compileAnnotated(`${conic}
g.steps = 'many';`),
      ).toThrow(/Gradient property 'steps' must be a number/);
    });

    it('rejects invalid interpolation', () => {
      expect(() =>
        compileAnnotated(`${conic}
g.interpolation = 'hsl';`),
      ).toThrow(/Gradient interpolation must be 'srgb', 'oklch', or 'linearRGB'/);
    });

    it('rejects a topo-only property on a conic gradient', () => {
      expect(() =>
        compileAnnotated(`${conic}
g.blend = 0.5;`),
      ).toThrow(/Property 'blend' is only available on TopoGradient/);
    });

    it('rejects an unknown gradient property', () => {
      expect(() =>
        compileAnnotated(`${conic}
g.bogus = 1;`),
      ).toThrow(/Cannot assign to Gradient property 'bogus'/);
    });

    // innerRadius/innerFill previously fell through the lenient switch with no
    // case at all — silently vanishing in annotated mode instead of storing.
    it('accepts valid innerRadius and innerFill', () => {
      expect(() =>
        compileAnnotated(`${conic}
g.innerRadius = 10;
g.innerFill = 'center';
M 0 0`),
      ).not.toThrow();
    });

    it('rejects negative innerRadius', () => {
      expect(() =>
        compileAnnotated(`${conic}
g.innerRadius = -1;`),
      ).toThrow(/ConicGradient innerRadius must be >= 0/);
    });

    it('rejects invalid innerFill', () => {
      expect(() =>
        compileAnnotated(`${conic}
g.innerFill = 'nonsense';`),
      ).toThrow(/ConicGradient innerFill must be 'transparent', 'transparent-blend', 'center', or a Color value/);
    });
  });

  describe('Pattern/Marker/MeshPoint property validation (parity with primary evaluator)', () => {
    const pattern = `let pt = Pattern('pt', 0, 0, 10, 10) {|p|
      p.append(@{ m 0 0 l 5 5 });
    };`;
    const marker = `let mk = Marker('mk', 10, 10) {|m|
      m.append(@{ m 0 0 l 10 5 l -10 5 z });
    };`;
    const mesh = `let g = MeshGradient('mg', 200, 100, 3, 2) {|g|
      g.colorAll(Color('#ff0000'));
    };`;

    it('accepts valid Pattern/Marker/MeshPoint assignments', () => {
      expect(() =>
        compileAnnotated(`${pattern}
${marker}
${mesh}
pt.patternUnits = 'userSpaceOnUse';
mk.refX = 'center';
mk.orient = 'auto';
g.getPoint(0, 0).color = Color('#00ff00');
M 0 0`),
      ).not.toThrow();
    });

    it('rejects wrong-typed Pattern property', () => {
      expect(() =>
        compileAnnotated(`${pattern}
pt.patternUnits = 5;`),
      ).toThrow(/Pattern property 'patternUnits' must be a string/);
    });

    it('rejects unknown Pattern property', () => {
      expect(() =>
        compileAnnotated(`${pattern}
pt.bogus = 'x';`),
      ).toThrow(/Cannot assign to Pattern property 'bogus'/);
    });

    it('rejects invalid Marker enum value', () => {
      expect(() =>
        compileAnnotated(`${marker}
mk.refX = 'middle';`),
      ).toThrow(/Invalid value 'middle' for Marker.refX. Valid values: left, center, right/);
    });

    it('rejects wrong-typed Marker orient', () => {
      expect(() =>
        compileAnnotated(`${marker}
mk.orient = Color('#000');`),
      ).toThrow(/Marker.orient must be a number or MarkerOrient enum value/);
    });

    it('rejects unknown Marker property', () => {
      expect(() =>
        compileAnnotated(`${marker}
mk.bogus = 1;`),
      ).toThrow(/Cannot assign to Marker property 'bogus'/);
    });

    it('rejects Marker enum violation inside an apply block (second statement evaluator)', () => {
      expect(() =>
        compileAnnotated(`${marker}
define PathLayer('a') \${ stroke: #000; }
layer('a').apply {
  mk.markerUnits = 'pixels';
}`),
      ).toThrow(/Invalid value 'pixels' for Marker.markerUnits/);
    });

    it('rejects non-Color MeshPoint color', () => {
      expect(() =>
        compileAnnotated(`${mesh}
g.getPoint(0, 0).color = 5;`),
      ).toThrow(/MeshPoint color must be a Color value/);
    });

    it('rejects wrong-typed MeshPoint x', () => {
      expect(() =>
        compileAnnotated(`${mesh}
g.getPoint(0, 0).x = 'left';`),
      ).toThrow(/MeshPoint x must be a number/);
    });
  });

  describe('BUILTIN_ENUMS parity (shared builtin-enums.ts)', () => {
    // The annotated evaluator's former hand-copied enum table was missing
    // BlendMode, NoiseFilterStyle, GlowMode, BBoxAnchor, and five others,
    // so these references threw 'Undefined variable' only in annotated mode.
    it('resolves enums that were missing from the annotated copy', () => {
      expect(() =>
        compileAnnotated(`let b = BlendMode.Multiply;
let n = NoiseFilterStyle.Grain;
let a = BBoxAnchor.Center;
M 0 0`),
      ).not.toThrow();
    });
  });

  describe('member expressions in path args', () => {
    it('handles ctx.position.x', () => {
      const result = compileAnnotated('M 100 200 L calc(ctx.position.x + 50) ctx.position.y');
      expect(result).toContain('M 100 200');
      expect(result).toContain('L 150 200');
    });
  });

  describe('spline stdlib functions', () => {
    it('annotates cubicSpline call with relative path commands', () => {
      const result = compileAnnotated(`cubicSpline([
        { x: 0, y: 0, angle: 0, exit: 30 },
        { x: 100, y: 0, angle: 0, entry: 30 }
      ]);`);
      expect(result).toContain('//--- cubicSpline');
      expect(result).toContain('called from line 1');
      expect(result).toContain('m 0 0');
      expect(result).toContain('c 30 0 70 0 100 0');
    });

    it('annotates quadSpline call', () => {
      const result = compileAnnotated(`quadSpline(
        { x: 0, y: 0, angle: 0, exit: 40 },
        [],
        { x: 100, y: 50 }
      );`);
      expect(result).toContain('//--- quadSpline');
      expect(result).toContain('m 0 0');
      expect(result).toContain('q 40 0 100 50');
    });

    it('annotates clippedQuadSpline call', () => {
      const result = compileAnnotated(`clippedQuadSpline(
        { x: 0, y: 0, angle: 0, exit: 50, exitTime: 1 },
        [],
        { x: 100, y: 0, entryTime: 1 }
      );`);
      expect(result).toContain('//--- clippedQuadSpline');
      expect(result).toContain('m 0 0');
      expect(result).toContain('c 50 0 50 0 100 0');
    });
  });

  describe('heading and turn', () => {
    it('heading() does not emit commands', () => {
      const result = compileAnnotated('M 50 100\nheading(0);\ntangentLine(30);');
      expect(result).toContain('M 50 100');
      expect(result).toContain('L 80 100');
    });

    it('turn() adjusts heading', () => {
      const result = compileAnnotated('M 0 0\nL 50 0\nturn(90deg);\ntangentLine(30);');
      expect(result).toContain('L 50 30');
    });
  });

  describe('destructuring', () => {
    it('destructures object literals', () => {
      const result = compileAnnotated('let { x, y } = { x: 20, y: 30 };\nM x y');
      expect(result).toContain('M 20 30');
    });

    it('destructures arrays', () => {
      const result = compileAnnotated('let [px, py] = [15, 25];\nM px py');
      expect(result).toContain('M 15 25');
    });

    it('destructures Point like the main evaluator', () => {
      const result = compileAnnotated('let { x, y } = Point(20, 30);\nM x y');
      expect(result).toContain('M 20 30');
    });

    it('destructures Point with rename and rest', () => {
      const result = compileAnnotated('let { x: px, ...rest } = Point(40, 60);\nM px rest.y');
      expect(result).toContain('M 40 60');
    });

    it('destructures Grid computed properties', () => {
      const result = compileAnnotated('let { width, height } = Grid(4, 5, { xDim: 10, yDim: 10 });\nM width height');
      expect(result).toContain('M 50 40');
    });

    it('destructures ctx.position mid-path', () => {
      const result = compileAnnotated('M 50 50\nL 120 80\nlet { x, y } = ctx.position;\nM x y');
      expect(result).toContain('M 120 80');
    });

    it('throws with line number for a missing struct key', () => {
      expect(() => compileAnnotated('let { z } = Point(1, 2);')).toThrow(
        /Line 1.*Property 'z' does not exist on Point/,
      );
    });

    it('destructures inside a TextBlock text body without throwing', () => {
      expect(() =>
        compileAnnotated(`let t = &{
  text(0, 0) {
    let { x, y } = Point(7, 9);
    \`at \${x},\${y}\`
  }
};`),
      ).not.toThrow();
    });

    it('missing struct key inside a TextBlock text body reports a line number', () => {
      expect(() =>
        compileAnnotated(`let t = &{
  text(0, 0) {
    let { z } = Point(1, 2);
    \`hi\`
  }
};`),
      ).toThrow(/Line \d+.*Property 'z' does not exist on Point/);
    });

    it('still throws when destructuring a plain number', () => {
      expect(() => compileAnnotated('let { x } = 5;')).toThrow(/cannot destructure/i);
    });
  });

  describe('style-block CSS function values (parity with primary evaluator)', () => {
    // Layer definitions are no-ops in annotated mode, so these tests evaluate
    // style blocks in expression position (`let s = ${...};`), which routes
    // through the annotated evaluator's evaluateStyleBlockLiteral.
    it('resolves a Color variable inside drop-shadow to the same CSS as the primary evaluator', () => {
      // Regression: the annotated evaluator previously never resolved
      // expressions embedded in CSS function args, drifting from index.ts.
      // The expected string comes from the primary evaluator, so this asserts
      // exact cross-evaluator parity; it is observable in annotated mode via
      // the property-read branch (only the exact resolved string takes M 1 1).
      const expected = compile(`let c = oklch(0.63 0.26 29);
define PathLayer('a') \${ filter: drop-shadow(4px 4px 8px c); }
layer('a').apply { M 0 0 }`).layers.find((l) => l.name === 'a')!.styles.filter;
      expect(expected).toMatch(/^drop-shadow\(4px 4px 8px #[0-9a-f]{6}\)$/);

      const result = compileAnnotated(`let c = oklch(0.63 0.26 29);
let s = \${ filter: drop-shadow(4px 4px 8px c); };
if (s.filter == '${expected}') { M 1 1 } else { M 9 9 }`);
      expect(result).toBe('M 1 1');
    });

    it('rejects comma-form drop-shadow with the same positioned error', () => {
      expect(() =>
        compileAnnotated(`
let s = \${ filter: drop-shadow(4px, 4px, 4px, #c00); };
M 0 0`),
      ).toThrow(/Line 2, col \d+: drop-shadow\(\) uses space-separated CSS syntax/);
    });

    it('rejects comma-chained filter functions', () => {
      expect(() =>
        compileAnnotated(`
let s = \${ filter: blur(2px), brightness(1.2); };
M 0 0`),
      ).toThrow(/filter chains are space-separated/);
    });

    it('splices template fragments with exact cross-evaluator parity', () => {
      const expected = compile(`let softness = 1.5;
define PathLayer('a') \${ filter: blur(\`\${softness}\`px) brightness(\`\${1.2}\`); }
layer('a').apply { M 0 0 }`).layers.find((l) => l.name === 'a')!.styles.filter;
      expect(expected).toBe('blur(1.5px) brightness(1.2)');

      const result = compileAnnotated(`let softness = 1.5;
let s = \${ filter: blur(\`\${softness}\`px) brightness(\`\${1.2}\`); };
if (s.filter == '${expected}') { M 1 1 } else { M 9 9 }`);
      expect(result).toBe('M 1 1');
    });

    it('substitutes numeric variables with cross-evaluator parity', () => {
      const result = compileAnnotated(`let level = 1.4;
let s = \${ filter: brightness(level); };
if (s.filter == 'brightness(1.4)') { M 1 1 } else { M 9 9 }`);
      expect(result).toBe('M 1 1');
    });

    it('rejects a fragment result that violates the allow-list', () => {
      expect(() =>
        compileAnnotated(`
let bad = "url(http://evil.example)";
let s = \${ filter: blur(2px) \`\${bad}\`; };
M 0 0`),
      ).toThrow(/url\(\)|disallowed/);
    });

    it('rejects a smuggled var()-shaped fragment beside a legit substitution', () => {
      expect(() =>
        compileAnnotated(`
let level = 1.5;
let payload = "var(--evil-hack, 1)";
let s = \${ filter: \`\${payload}\` brightness(level); };
M 0 0`),
      ).toThrow(/var\(\)|disallowed/);
    });

    it('rejects unitless CSS function arguments with the same error', () => {
      expect(() =>
        compileAnnotated(`
let s = \${ filter: blur(4); };
M 0 0`),
      ).toThrow(/blur\(\) takes a length.*needs a unit/s);
    });

    it('rejects a substituted unitless variable like the primary evaluator', () => {
      expect(() =>
        compileAnnotated(`
let amount = 4;
let s = \${ filter: blur(amount); };
M 0 0`),
      ).toThrow(/blur\(\) takes a length/);
    });

    it('rejects a property/function mismatch like the primary evaluator', () => {
      expect(() =>
        compileAnnotated(`
let s = \${ fill: rotate(45); };
M 0 0`),
      ).toThrow(/rotate\(\) is not valid on "fill"/);
    });

    it('keeps unitless transforms valid in annotated mode', () => {
      const result = compileAnnotated(`let s = \${ transform: rotate(45); };
if (s.transform == 'rotate(45)') { M 1 1 } else { M 9 9 }`);
      expect(result).toBe('M 1 1');
    });

    it('resolves identifiers in whole-value templates with parity', () => {
      const expected = compile(`let softness = 1.5;
let level = 1.4;
define PathLayer('a') \${ filter: \`blur(\${softness}px) brightness(level)\`; }
layer('a').apply { M 0 0 }`).layers.find((l) => l.name === 'a')!.styles.filter;
      expect(expected).toBe('blur(1.5px) brightness(1.4)');

      const result = compileAnnotated(`let softness = 1.5;
let level = 1.4;
let s = \${ filter: \`blur(\${softness}px) brightness(level)\`; };
if (s.filter == '${expected}') { M 1 1 } else { M 9 9 }`);
      expect(result).toBe('M 1 1');
    });
  });
});

describe('viewbox global — annotated evaluator parity', () => {
  it('stores and reads the viewbox after define', () => {
    const result = compileAnnotated(`define ViewBox(0, 0, 880, 280);
if (viewbox.width == 880) { M 1 1 } else { M 9 9 }
if (viewbox.height == 280) { M 2 2 } else { M 9 9 }`);
    expect(result).toContain('M 1 1');
    expect(result).toContain('M 2 2');
    expect(result).not.toContain('M 9 9');
  });

  it('supports destructuring', () => {
    const result = compileAnnotated(`define ViewBox(-10, -20, 100, 50);
let {originX, originY, width, height} = viewbox;
if (originX == -10) { M 1 1 } else { M 9 9 }
if (originY == -20) { M 2 2 } else { M 9 9 }
if (width == 100) { M 3 3 } else { M 9 9 }
if (height == 50) { M 4 4 } else { M 9 9 }`);
    expect(result).not.toContain('M 9 9');
  });

  it('errors when read before define (same message as main evaluator)', () => {
    expect(() => compileAnnotated('let w = viewbox.width;')).toThrow(
      /viewbox is not available until define ViewBox\(\.\.\.\) has run/,
    );
  });

  it('rejects duplicate ViewBox definitions', () => {
    expect(() =>
      compileAnnotated('define ViewBox(0, 0, 200, 200);\ndefine ViewBox(0, 0, 400, 400);'),
    ).toThrow(/Duplicate ViewBox definition/);
  });

  it('rejects zero width', () => {
    expect(() => compileAnnotated('define ViewBox(0, 0, 0, 200);')).toThrow(
      /width must be greater than 0/,
    );
  });

  it('rejects define ViewBox inside a layer apply block', () => {
    expect(() =>
      compileAnnotated(`define PathLayer('a') \${ stroke: red; };
layer('a').apply {
  define ViewBox(0, 0, 200, 200);
  M 0 0
}`),
    ).toThrow(/ViewBox must appear at top level/);
  });

  it('reads viewbox inside a function called after define', () => {
    const result = compileAnnotated(`fn w() { return viewbox.width; }
define ViewBox(0, 0, 100, 50);
if (w() == 100) { M 1 1 } else { M 9 9 }`);
    expect(result).toContain('M 1 1');
    expect(result).not.toContain('M 9 9');
  });

  it('reads viewbox inside a layer apply block', () => {
    const result = compileAnnotated(`define ViewBox(0, 0, 100, 50);
define PathLayer('a') \${ stroke: red; };
layer('a').apply {
  M viewbox.width 0
}`);
    expect(result).toContain('M 100 0');
  });

  it('reads viewbox inside a path block', () => {
    const result = compileAnnotated(`define ViewBox(0, 0, 60, 40);
let p = @{ let w = viewbox.width; h w };
if (p.endPoint.x == 60) { M 1 1 } else { M 9 9 }`);
    expect(result).toContain('M 1 1');
    expect(result).not.toContain('M 9 9');
  });

  it('silently skips define ViewBox inside path blocks (annotated block convention)', () => {
    const result = compileAnnotated(`let p = @{ define ViewBox(0, 0, 9, 9); h 10 };
define ViewBox(0, 0, 100, 50);
if (viewbox.width == 100) { M 1 1 } else { M 9 9 }`);
    expect(result).toContain('M 1 1');
    expect(result).not.toContain('M 9 9');
  });

  it('rejects assignment to a viewbox member (parity with main evaluator)', () => {
    expect(() =>
      compileAnnotated('define ViewBox(0, 0, 100, 50);\nviewbox.width = 5;\nM 0 0'),
    ).toThrow(/Cannot assign to property 'width'/);
  });
});

describe('array reverse and sort (annotated parity)', () => {
  it('reverse returns a new reversed array', () => {
    const result = compileAnnotated('let r = [1, 2, 3].reverse(); M r[0] r[2]');
    expect(result).toContain('M 3 1');
  });

  it('reverse does not mutate the original array', () => {
    const result = compileAnnotated('let orig = [1, 2, 3]; let r = orig.reverse(); M orig[0] r[0]');
    expect(result).toContain('M 1 3');
  });

  it('bare sort orders numbers ascending', () => {
    const result = compileAnnotated('let r = [10, 2, -1].sort(); M r[0] r[2]');
    expect(result).toContain('M -1 10');
  });

  it('bare sort on mixed-type array throws the same error as main mode', () => {
    expect(() => compileAnnotated('let r = [1, `a`].sort();')).toThrow(/all-number or all-string/);
  });

  it('comparator sort orders Points by field', () => {
    const result = compileAnnotated(
      'let pts = [Point(30, 0), Point(10, 0), Point(20, 0)]; let sorted = pts.sort {|a, b| return calc(a.x - b.x); }; M sorted[0].x sorted[2].x',
    );
    expect(result).toContain('M 10 30');
  });

  it('comparator returning a boolean throws the same error as main mode', () => {
    expect(() => compileAnnotated('let r = [1, 2].sort {|a, b| return a < b; };')).toThrow(/must return a number/);
  });
});

describe('array first/last/filter (annotated parity)', () => {
  it('.first returns the first element', () => {
    const result = compileAnnotated('let list = [10, 20, 30]; M list.first 0');
    expect(result).toContain('M 10 0');
  });

  it('.last returns the last element', () => {
    const result = compileAnnotated('let list = [10, 20, 30]; M list.last 0');
    expect(result).toContain('M 30 0');
  });

  it('.first/.last on empty array return null', () => {
    const result = compileAnnotated(
      'let list = []; if (list.first == null && list.last == null) { M 1 0 } else { M 0 0 }',
    );
    expect(result).toContain('M 1 0');
  });

  it('unknown array property still throws', () => {
    expect(() => compileAnnotated('let list = [1]; M list.middle 0')).toThrow(/does not exist on array/);
  });

  it('filter keeps elements whose block returns truthy', () => {
    const result = compileAnnotated('let r = [4, -2, 7, 0, -5].filter {|n| return n > 0; }; M r[0] r[1]');
    expect(result).toContain('M 4 7');
  });

  it('filter does not mutate the original array', () => {
    const result = compileAnnotated('let orig = [1, 2, 3]; let r = orig.filter {|n| return n > 1; }; M orig.length r.length');
    expect(result).toContain('M 3 2');
  });

  it('filter index param works', () => {
    const result = compileAnnotated('let r = [10, 20, 30, 40].filter {|val, i| return i % 2 == 0; }; M r[0] r[1]');
    expect(result).toContain('M 10 30');
  });

  it('filter with no return drops every element', () => {
    const result = compileAnnotated('let r = [1, 2, 3].filter {|n| let x = 1; }; M r.length 0');
    expect(result).toContain('M 0 0');
  });

  it('filter() << worker matches the trailing-block form', () => {
    const viaBlock = compileAnnotated('let r = [4, -2, 7, 0].filter {|v| return v > 0; }; M r[0] r[1]');
    const viaWorker = compileAnnotated('let pos = {|v| return v > 0; }; let r = [4, -2, 7, 0].filter() << pos; M r[0] r[1]');
    expect(viaBlock).toContain('M 4 7');
    expect(viaWorker).toContain('M 4 7');
  });

  it('filter without a block throws the same error as main mode', () => {
    expect(() => compileAnnotated('let r = [1].filter();')).toThrow(/requires a trailing block/);
  });

  it('filter with an extra argument throws the same error as main mode', () => {
    expect(() => compileAnnotated('let r = [1].filter(5) {|n| return 1; };')).toThrow(/takes no arguments/);
  });
});

describe('array iteration lock (annotated parity)', () => {
  it('push via arrayRef inside filter throws the same error as main mode', () => {
    expect(() => compileAnnotated('let r = [1, 2].filter {|n, i, ref| ref.push(9); return 1; };')).toThrow(
      /Cannot call push\(\) on an array while it is being iterated/,
    );
  });

  it('push via the closure variable inside map throws', () => {
    expect(() => compileAnnotated('let nums = [1, 2]; let r = nums.map {|n| nums.push(9); return n; };')).toThrow(
      /Cannot call push\(\) on an array while it is being iterated/,
    );
  });

  it('push inside a for-each body throws', () => {
    expect(() => compileAnnotated('let nums = [1, 2]; for (n in nums) { nums.push(9); }')).toThrow(
      /Cannot call push\(\) on an array while it is being iterated/,
    );
  });

  it('indexed assignment inside a for-each body throws', () => {
    expect(() => compileAnnotated('let nums = [1, 2]; for (n in nums) { nums[0] = 9; }')).toThrow(
      /Cannot assign to an element of an array while it is being iterated/,
    );
  });

  it('push inside a sort comparator throws', () => {
    expect(() =>
      compileAnnotated('let nums = [2, 1]; let r = nums.sort {|a, b| nums.push(9); return calc(a - b); };'),
    ).toThrow(/Cannot call push\(\) on an array while it is being iterated/);
  });

  it('the lock is released after iteration completes', () => {
    const result = compileAnnotated(
      'let nums = [1, 2, 3]; let r = nums.filter {|n| return n > 1; }; nums.push(4); M nums.length 0',
    );
    expect(result).toContain('M 4 0');
  });

  it('iterating a slice copy allows mutating the original', () => {
    const result = compileAnnotated(
      'let queue = [1, 2]; for (item in queue.slice(0)) { queue.push(calc(item * 10)); } M queue.length 0',
    );
    expect(result).toContain('M 4 0');
  });
});

describe('array sort NaN guard (annotated parity)', () => {
  it('bare sort on numeric array containing NaN throws the same error as main mode', () => {
    expect(() => compileAnnotated('let a = [3, 1]; a.push(calc(1 % 0)); let r = a.sort();')).toThrow(
      /cannot order NaN elements/,
    );
  });
});

describe('PathBlock isEmpty / char / isWhitespace (annotated parity)', () => {
  // fromGlyph itself is unreachable in annotated mode (compileAnnotated has
  // no font option), so only the non-glyph paths are testable here: isEmpty
  // must resolve, and char/isWhitespace must throw the same guidance as the
  // main evaluator.
  it('isEmpty resolves on a PathBlock without throwing', () => {
    expect(() =>
      compileAnnotated('let pb = @{ m 0 0 l 10 0 };\nlet e = pb.isEmpty;\nM 0 0'),
    ).not.toThrow();
  });

  it('isEmpty resolves on a ProjectedPath without throwing', () => {
    expect(() =>
      compileAnnotated('let pb = @{ m 0 0 l 10 0 };\nlet e = pb.project(5, 5).isEmpty;\nM 0 0'),
    ).not.toThrow();
  });

  it('char and isWhitespace on non-glyph PathBlocks throw the fromGlyph guidance', () => {
    expect(() =>
      compileAnnotated('let pb = @{ m 0 0 l 10 0 };\nlet c = pb.char;\nM 0 0'),
    ).toThrow(/char.*fromGlyph/s);
    expect(() =>
      compileAnnotated('let pb = @{ m 0 0 l 10 0 };\nlet w = pb.isWhitespace;\nM 0 0'),
    ).toThrow(/isWhitespace.*fromGlyph/s);
  });

  it('character-class members on non-glyph PathBlocks throw the fromGlyph guidance', () => {
    for (const prop of ['isSpace', 'isTab', 'isNewline', 'isMark', 'codePoint']) {
      expect(() =>
        compileAnnotated(`let pb = @{ m 0 0 l 10 0 };\nlet v = pb.${prop};\nM 0 0`),
      ).toThrow(new RegExp(`${prop}.*fromGlyph`, 's'));
    }
  });
});

describe('loop control: continue and break (annotated parity)', () => {
  it('continue skips the iteration body in annotated mode', () => {
    const out = compileAnnotated('for (i in 0..4) {\n  if (i == 2) {\n    continue;\n  }\n  M calc(i * 10) 0\n}');
    expect(out).toContain('M 10 0');
    expect(out).not.toContain('M 20 0');
    expect(out).toContain('M 30 0');
  });

  it('break exits the loop and still emits the remaining iteration markers correctly', () => {
    const out = compileAnnotated('for (i in 0..5) {\n  if (i == 2) {\n    break;\n  }\n  M calc(i * 10) 0\n}');
    expect(out).toContain('M 0 0');
    expect(out).toContain('M 10 0');
    expect(out).not.toContain('M 20 0');
    expect(out).not.toContain('iteration 3');
  });

  it('break inside a truncated (>10 iteration) loop still terminates and emits loop structure', () => {
    // Break fires at i == 1, within the shown-first-3 window; the loop must
    // stop entirely (no skip marker, no tail iterations).
    const out = compileAnnotated('for (i in 0..50) {\n  if (i == 1) {\n    break;\n  }\n  M i 0\n}');
    expect(out).toContain('M 0 0');
    expect(out).not.toContain('M 2 0');
    expect(out).not.toContain('skipping');
    expect(out).toContain('for (i in 0..50)');
  });

  it('matches the main evaluator output for a continue program', () => {
    const src = 'for (i in 0..4) { if (i == 2) { continue; } M calc(i * 10) 0 }';
    const plain = compile(src);
    // Annotated path commands, stripped of annotations, must equal the plain output
    const annotated = compileAnnotated(src.replace(/ }/g, '\n}').replace(/{ /g, '{\n'));
    const commands = annotated.split('\n').filter((l) => l.trim().startsWith('M')).map((l) => l.trim());
    expect(commands.join(' ')).toBe(plain.layers[0].data);
  });
});
