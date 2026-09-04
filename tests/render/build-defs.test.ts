import { describe, expect, it } from 'vitest';

import { compile } from '../../src';
import { buildDefs } from '../../src/render/build-defs';

describe('buildDefs', () => {
  it('emits defs in order: masks → clipPaths → gradients → patterns → markers', () => {
    const result = compile(`
      let rect = @{ m 0 0 l 10 0 l 0 10 l -10 0 z };
      let mask = Mask('m1');
      mask.append(rect, #{ fill: Color('#ffffff'); });

      let shape = @{ m 0 0 l 10 0 l 0 10 l -10 0 z };
      let clip = ClipPath('c1');
      clip.append(shape);

      let g = LinearGradient('g1', 0, 0, 1, 0) {|g|
        g.stop(0, Color('#000000'));
        g.stop(1, Color('#ffffff'));
      };

      let dot = @{ circle(5, 5, 2); };
      let pat = Pattern('p1', 0, 0, 10, 10) {|p| p.append(dot, #{ fill: Color('#000000'); }); };

      let arrow = @{ m 0 0 l 5 2 l -5 2 z };
      let mk = Marker('mk1', 5, 5) {|m| m.append(arrow, #{ fill: Color('#000000'); }); };

      define PathLayer('any') #{ fill: g; mask: mask.id; clip-path: clip.id; marker-end: mk; }
      layer('any').apply { M 0 0 L 10 10 }
    `);

    const nodes = buildDefs(result);
    const tags = nodes.map((n) => n.tag);
    expect(tags).toEqual(['mask', 'clipPath', 'linearGradient', 'pattern', 'marker']);
  });

  it('preserves marker default elision (markerUnits="strokeWidth" omitted)', () => {
    const result = compile(`
      let arrow = @{ m 0 0 l 5 2 l -5 2 z };
      let m = Marker('arrow', 5, 5) {|m| m.append(arrow, #{ fill: Color('#333333'); }); };
    `);
    const [marker] = buildDefs(result);
    expect(marker.tag).toBe('marker');
    expect(marker.attrs.markerUnits).toBeUndefined();
    expect(marker.attrs.preserveAspectRatio).toBeUndefined();
    expect(marker.attrs.orient).toBe('auto'); // orient is always emitted
  });

  it('emits marker overrides in the canonical attr order', () => {
    const result = compile(`
      let arrow = @{ m 0 0 l 5 2 l -5 2 z };
      let m = Marker('arrow', 5, 5) {|m| m.append(arrow, #{ fill: context-stroke; }); };
      m.markerUnits = MarkerUnits.UserSpaceOnUse;
      m.orient = MarkerOrient.AutoStartReverse;
      m.preserveAspectRatio = MarkerPreserveAspectRatio.XMinYMinSlice;
    `);
    const [marker] = buildDefs(result);
    const keys = Object.keys(marker.attrs);
    expect(keys).toEqual([
      'id',
      'viewBox',
      'markerWidth',
      'markerHeight',
      'refX',
      'refY',
      'markerUnits',
      'orient',
      'preserveAspectRatio',
    ]);
  });

  it('skips defs emission when the CompileResult has none', () => {
    const result = compile(`
      define PathLayer('a') #{ stroke: Color('#000'); }
      layer('a').apply { M 0 0 L 10 10 }
    `);
    expect(buildDefs(result)).toEqual([]);
  });
});
