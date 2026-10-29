/**
 * Constructor builder blocks — `LinearGradient(...) {|g| ... }`, Pattern,
 * Marker, Grid and the filters — run their statements for effect; the
 * block's value is not used.
 *
 * A block body is lambda-shaped, so a last line without `;` is that body's
 * result, which the evaluator delivers as a return. The builders didn't
 * catch it: `{|g| g.stop(1, Color('#2a9d8f')) }` escaped compile() as a bare
 * `{ value }` object and the user saw "[object Object]" or "undefined". A
 * return now ends a builder block, as it does for subscription callbacks.
 */
import { describe, expect, it } from 'vitest';

import { compile } from '../src';

/** [constructor, a program whose block ends with `log("<constructor>")` and no `;`]. */
const BUILDERS: [string, string][] = [
  [
    'LinearGradient',
    `let x = LinearGradient('a', 0, 0, 1, 0) {|g| g.stop(0, Color('#000000')); log("LinearGradient") };`,
  ],
  [
    'RadialGradient',
    `let x = RadialGradient('b', 0.5, 0.5, 0.5) {|g| g.stop(0, Color('#ffffff')); log("RadialGradient") };`,
  ],
  ['ConicGradient', `let x = ConicGradient('c', 100, 100) {|g| g.stop(0, Color('#e63946')); log("ConicGradient") };`],
  [
    'MeshGradient',
    `let x = MeshGradient('d', 200, 200, 2, 2) {|g| g.getPoint(0, 0).color = Color('#264653'); log("MeshGradient") };`,
  ],
  [
    'FreeformGradient',
    `let x = FreeformGradient('e', 200, 200) {|g| g.point(0, 0, Color('#ffffff')); g.point(200, 200, Color('#264653')); log("FreeformGradient") };`,
  ],
  [
    'TopoGradient',
    `let ring = @{ circle(0, 0, 20); closePath(); };
let x = TopoGradient('f', 100, 100) {|g| g.contour(ring.project(50, 50), 0.5, Color('#27ae60')); log("TopoGradient") };`,
  ],
  [
    'Pattern',
    `let dot = @{ circle(10, 10, 3); };
let x = Pattern('p', 0, 0, 20, 20) {|p| p.append(dot, #{ fill: Color('#e63946'); }); log("Pattern") };`,
  ],
  [
    'Marker',
    `let tip = @{ h 10 v 10 z };
let x = Marker('m', 10, 10) {|m| m.append(tip, #{ fill: Color('#333333'); }); log("Marker") };`,
  ],
  ['Grid', `let x = Grid(2, 2, { xDim: 10, yDim: 10 }) {|g| g.fill {|row, col, center| return 1; }; log("Grid") };`],
  ['NoiseFilter', `let x = NoiseFilter() {|f| f.style = NoiseFilterStyle.Grain; log("NoiseFilter") };`],
  ['GlowFilter', `let x = GlowFilter() {|f| f.radius = 8; log("GlowFilter") };`],
  ['EmbossFilter', `let x = EmbossFilter() {|f| f.depth = 3; log("EmbossFilter") };`],
  ['ElevationShadowFilter', `let x = ElevationShadowFilter() {|f| f.elevation = 6; log("ElevationShadowFilter") };`],
  ['InnerShadowFilter', `let x = InnerShadowFilter() {|f| f.blur = 4; log("InnerShadowFilter") };`],
  ['PixelateFilter', `let x = PixelateFilter() {|f| f.width = 12; log("PixelateFilter") };`],
  ['MotionBlurFilter', `let x = MotionBlurFilter() {|f| f.distance = 20; log("MotionBlurFilter") };`],
];

function logs(source: string): string[] {
  return compile(source).logs.map((entry) => entry.parts.map((p) => String(p.value)).join(' '));
}

describe('builder blocks', () => {
  it.each(BUILDERS)('%s: a last line without ";" runs, and the block ends there', (name, source) => {
    expect(logs(source)).toEqual([name]);
  });

  it.each(BUILDERS)('%s: the same block with the ";" behaves the same', (name, source) => {
    expect(logs(source.replace(`log("${name}") }`, `log("${name}"); }`))).toEqual([name]);
  });

  it('covers every constructor that takes a builder block', () => {
    // 16 builder sites in src/evaluator/index.ts share one block runner.
    expect(BUILDERS.map(([name]) => name)).toHaveLength(16);
  });

  it('the gradients.md shape: a last g.stop(...) without ";" adds its stop', () => {
    const result = compile(`let sunset = LinearGradient('sunset', 0, 0, 1, 0) {|g|
  g.stop(0, Color('#e63946'));
  g.stop(1, Color('#2a9d8f'))
};
define PathLayer('sky') #{ fill: sunset; };
layer('sky').apply { rect(0, 0, 100, 50); }`);
    const gradient = result.gradients?.find((g) => g.id === 'sunset');
    expect(gradient?.stops.map((s) => s.offset)).toEqual([0, 1]);
  });

  it('an explicit return ends a builder block early', () => {
    expect(logs(`let x = LinearGradient('a', 0, 0, 1, 0) {|g| log("before"); return 0; log("after"); };`)).toEqual([
      'before',
    ]);
  });
});
