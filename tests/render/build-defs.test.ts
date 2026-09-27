import { describe, expect, it } from 'vitest';

import { compile } from '../../src';
import { buildSvgTree } from '../../src/render';
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

describe('buildDefs — conic gradients honour the viewBox origin (ISSUE-027)', () => {
  // `define ViewBox(-100, -100, 200, 200)`: the visible area is (-100,-100) → (100,100)
  // and the gradient is centred in it. Every tile, mask and rect must start at the origin.
  const source = (extra: string): string => `
      define ViewBox(-100, -100, 200, 200);
      let g = ConicGradient('wheel', 0, 0) {|g|
        g.stop(0, Color('#ff0000'));
        g.stop(1, Color('#0000ff'));
      };
      ${extra}
      define PathLayer('p') #{ fill: g; }
      layer('p').apply { M -100 -100 h 200 v 200 h -200 z }
    `;
  const view = { originX: -100, originY: -100, width: 200, height: 200 };
  const tile = { x: '-100', y: '-100', width: '200', height: '200' };

  // Pattern content is drawn in the tile's own coordinates (its top-left is (0, 0)),
  // so the user-space centre (0, 0) is (100, 100) inside the tile.
  const local = { x: '0', y: '0', width: '200', height: '200' };

  it('wedge branch: the pattern tile covers the viewBox and the wedges fan out from the tile-local centre', () => {
    const nodes = buildDefs(compile(source('')), view);
    expect(nodes.map((n) => n.tag)).toEqual(['pattern']);
    expect(nodes[0].attrs).toMatchObject({ id: 'wheel', ...tile, patternUnits: 'userSpaceOnUse' });
    expect((nodes[0].children[0].attrs.d as string).startsWith('M 100 100 L ')).toBe(true);
  });

  it("wedge branch: a 'transparent-blend' mask, its rect and the inner disc are tile-local", () => {
    const nodes = buildDefs(compile(source("g.innerRadius = 30; g.innerFill = 'transparent-blend';")), view);
    expect(nodes.map((n) => n.tag)).toEqual(['radialGradient', 'mask', 'pattern']);
    expect(nodes[0].attrs).toMatchObject({ cx: '100', cy: '100' });
    expect(nodes[1].attrs).toMatchObject({ id: 'wheel-inner-mask', ...local });
    expect(nodes[1].children[0].attrs).toMatchObject(local);
    expect(nodes[2].attrs).toMatchObject(tile);
  });

  it('image branch: the pattern tile and the image cover the viewBox', () => {
    const nodes = buildDefs(compile(source('')), { ...view, useImageGradients: true });
    expect(nodes[0].attrs).toMatchObject(tile);
    expect(nodes[0].children[0].attrs).toMatchObject({ width: '200', height: '200' });
  });

  it('buildSvgTree passes the source viewBox origin through, so the CLI and VS Code get it for free', () => {
    const tree = buildSvgTree(compile(source('')));
    const defs = tree.children.find((c) => typeof c !== 'string' && c.tag === 'defs');
    expect(defs && typeof defs !== 'string' && defs.children[0].attrs).toMatchObject(tile);
  });

  it('the mesh/freeform/topo CLI placeholder tile starts at the viewBox origin too', () => {
    const result = compile(`
      define ViewBox(-100, -100, 200, 200);
      let m = MeshGradient('m', 200, 200, 2, 2) {|g|
        g.getPoint(0, 0).color = Color('#ff0000');
        g.getPoint(1, 1).color = Color('#0000ff');
      };
      define PathLayer('p') #{ fill: m; }
      layer('p').apply { M -100 -100 h 200 v 200 h -200 z }
    `);
    const nodes = buildDefs(result, view);
    expect(nodes[0].tag).toBe('pattern');
    expect(nodes[0].attrs).toMatchObject({ id: 'm', x: '-100', y: '-100', patternUnits: 'userSpaceOnUse' });
  });

  it('defaults the origin to (0, 0), leaving the existing 0 0 W H output unchanged', () => {
    const result = compile(source('').replace('define ViewBox(-100, -100, 200, 200);', ''));
    expect(buildDefs(result, { width: 200, height: 200 })).toEqual(buildDefs(result, { originX: 0, originY: 0, width: 200, height: 200 }));
  });
});
