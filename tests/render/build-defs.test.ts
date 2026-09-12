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

describe('buildDefs — conic gradients', () => {
  const conicSource = (extra: string): string => `
      let g = ConicGradient('wheel', 100, 100) {|g|
        g.stop(0, Color('#ff0000'));
        g.stop(1, Color('#0000ff'));
      };
      g.from = 0rad;
      g.to = 0.5pi;
      ${extra}
      define PathLayer('p') #{ fill: g; }
      layer('p').apply { M 0 0 L 10 10 }
    `;

  it('wedge branch: a partial sweep with the default clamp fills the gap with the last stop', () => {
    const nodes = buildDefs(compile(conicSource('')), { width: 200, height: 200 });
    expect(nodes.map((n) => n.tag)).toEqual(['pattern']);
    const paths = nodes[0].children;
    expect(paths).toHaveLength(360);
    expect(paths.slice(90).every((p) => p.attrs.fill === '#0000ff')).toBe(true);
  });

  it("wedge branch: spread 'transparent' leaves the gap unpainted", () => {
    const nodes = buildDefs(compile(conicSource("g.spread = 'transparent';")), { width: 200, height: 200 });
    expect(nodes[0].children).toHaveLength(90);
  });

  it('wedge branch: innerRadius with the default hard hole cuts annular sectors', () => {
    const nodes = buildDefs(compile(conicSource('g.innerRadius = 30;')), { width: 200, height: 200 });
    const d = nodes[0].children[0].attrs.d as string;
    expect(d).toContain(' A 30 30 0 ');
    expect(d.startsWith('M 100 100')).toBe(false);
  });

  it("wedge branch: innerFill 'center' adds a sibling radialGradient and a circle inside the pattern", () => {
    const nodes = buildDefs(compile(conicSource("g.innerRadius = 30; g.innerFill = 'center';")), {
      width: 200,
      height: 200,
    });
    expect(nodes.map((n) => n.tag)).toEqual(['radialGradient', 'pattern']);
    const grad = nodes[0];
    expect(grad.attrs).toMatchObject({ id: 'wheel-inner-fill', gradientUnits: 'userSpaceOnUse', cx: '100', cy: '100', r: '30' });
    expect(grad.children.map((s) => [s.attrs.offset, s.attrs['stop-color'], s.attrs['stop-opacity']])).toEqual([
      ['0', '#ff0000', '1'],
      ['0.25', '#ff0000', '0.8438'],
      ['0.5', '#ff0000', '0.5'],
      ['0.75', '#ff0000', '0.1563'],
      ['1', '#ff0000', '0'],
    ]);
    const pattern = nodes[1];
    const circle = pattern.children[pattern.children.length - 1];
    expect(circle.tag).toBe('circle');
    expect(circle.attrs).toEqual({ cx: '100', cy: '100', r: '30', fill: 'url(#wheel-inner-fill)' });
  });

  it("wedge branch: innerFill 'transparent-blend' masks the wedges with a luminance ramp", () => {
    const nodes = buildDefs(compile(conicSource("g.innerRadius = 30; g.innerFill = 'transparent-blend';")), {
      width: 200,
      height: 200,
    });
    expect(nodes.map((n) => n.tag)).toEqual(['radialGradient', 'mask', 'pattern']);
    expect(nodes[0].children.map((s) => s.attrs['stop-color'])).toEqual([
      'rgb(0, 0, 0)',
      'rgb(40, 40, 40)',
      'rgb(128, 128, 128)',
      'rgb(215, 215, 215)',
      'rgb(255, 255, 255)',
    ]);
    expect(nodes[1].attrs.id).toBe('wheel-inner-mask');
    const group = nodes[2].children[0];
    expect(group.tag).toBe('g');
    expect(group.attrs.mask).toBe('url(#wheel-inner-mask)');
    expect(group.children).toHaveLength(360);
  });

  it('image branch: emits pattern+image, with href only when a URL is supplied', () => {
    const result = compile(conicSource(''));
    const without = buildDefs(result, { width: 200, height: 200, useImageGradients: true });
    expect(without.map((n) => n.tag)).toEqual(['pattern']);
    expect(without[0].children[0].tag).toBe('image');
    expect(without[0].children[0].attrs.href).toBeUndefined();

    const urls = new Map([['wheel', 'data:image/png;base64,AAAA']]);
    const withUrl = buildDefs(result, { width: 200, height: 200, useImageGradients: true, gpuGradientUrls: urls });
    expect(withUrl[0].children[0].attrs.href).toBe('data:image/png;base64,AAAA');
  });
});
