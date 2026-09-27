import { describe, expect, it } from 'vitest';
import { buildSvgTree, toSvgString } from '../src/render';

import { compile, compileWithContext } from '../src';

describe('Markers', () => {
  describe('Marker() constructor', () => {
    it('creates Marker with smart defaults', () => {
      const result = compile(`
        let arrow = @{ m 0 0 l 10 5 l -10 5 z };
        let m = Marker('arrowhead', 10, 10) {|m|
          m.append(arrow, #{ fill: Color('#333'); });
        };
      `);
      expect(result.markers).toHaveLength(1);
      const marker = result.markers[0];
      expect(marker.id).toBe('arrowhead');
      expect(marker.viewBox).toBe('0 0 10 10');
      expect(marker.markerWidth).toBe(10);
      expect(marker.markerHeight).toBe(10);
      expect(marker.refX).toBe('5');
      expect(marker.refY).toBe('5');
      expect(marker.orient).toBe('auto');
      // default markerUnits and preserveAspectRatio match SVG defaults → omitted from output
      expect(marker.markerUnits).toBeUndefined();
      expect(marker.preserveAspectRatio).toBeUndefined();
    });

    it('append adds path elements', () => {
      const result = compile(`
        let arrow = @{ m 0 0 l 10 5 l -10 5 z };
        let m = Marker('a', 10, 10) {|m|
          m.append(arrow);
        };
      `);
      expect(result.markers[0].elements).toHaveLength(1);
      expect(result.markers[0].elements[0].pathData).toContain('L');
    });

    it('append with styles preserves style properties', () => {
      const result = compile(`
        let arrow = @{ m 0 0 l 10 5 l -10 5 z };
        let m = Marker('a', 10, 10) {|m|
          m.append(arrow, #{ fill: Color('#ff0000'); stroke: Color('#000'); });
        };
      `);
      expect(result.markers[0].elements[0].styles).toHaveProperty('fill');
      expect(result.markers[0].elements[0].styles).toHaveProperty('stroke');
    });

    it('append can be called multiple times to compose the marker', () => {
      const result = compile(`
        let tri = @{ m 0 0 l 10 5 l -10 5 z };
        let dot = @{ circle(5, 5, 1); };
        let m = Marker('a', 10, 10) {|m|
          m.append(tri, #{ fill: Color('#333'); });
          m.append(dot, #{ fill: Color('#fff'); });
        };
      `);
      expect(result.markers[0].elements).toHaveLength(2);
    });

    it('throws on wrong argument count', () => {
      expect(() => compile(`let m = Marker('a', 10);`)).toThrow(/Marker\(\) expects 3 arguments/);
    });

    it('throws when id is not a string', () => {
      expect(() => compile(`let m = Marker(42, 10, 10);`)).toThrow(/Marker\(\) first argument must be a string/);
    });

    it('throws when markerWidth or markerHeight is not a number', () => {
      expect(() => compile(`let m = Marker('a', 'wide', 10);`)).toThrow(
        /Marker\(\) markerWidth and markerHeight arguments must be numbers/,
      );
    });
  });

  describe('Property assignment', () => {
    it('viewBox can be set', () => {
      const result = compile(`
        let arrow = @{ m 0 0 l 10 5 l -10 5 z };
        let m = Marker('a', 10, 10);
        m.viewBox = '0 0 20 20';
        m.append(arrow);
      `);
      expect(result.markers[0].viewBox).toBe('0 0 20 20');
    });

    it('refX/refY accept numbers', () => {
      const result = compile(`
        let arrow = @{ m 0 0 l 10 5 l -10 5 z };
        let m = Marker('a', 10, 10);
        m.refX = 10;
        m.refY = 5;
        m.append(arrow);
      `);
      expect(result.markers[0].refX).toBe('10');
      expect(result.markers[0].refY).toBe('5');
    });

    it('refX accepts MarkerRefX enum values', () => {
      const result = compile(`
        let arrow = @{ m 0 0 l 10 5 l -10 5 z };
        let m = Marker('a', 10, 10);
        m.refX = MarkerRefX.Center;
        m.refY = MarkerRefY.Top;
        m.append(arrow);
      `);
      expect(result.markers[0].refX).toBe('center');
      expect(result.markers[0].refY).toBe('top');
    });

    it('refX rejects invalid enum string with descriptive error', () => {
      expect(() =>
        compile(`
          let m = Marker('a', 10, 10);
          m.refX = 'invalid';
        `),
      ).toThrow(/Invalid value 'invalid' for Marker.refX\. Valid values: left, center, right/);
    });

    it('markerUnits accepts MarkerUnits enum values', () => {
      const result = compile(`
        let arrow = @{ m 0 0 l 10 5 l -10 5 z };
        let m = Marker('a', 10, 10);
        m.markerUnits = MarkerUnits.UserSpaceOnUse;
        m.append(arrow);
      `);
      expect(result.markers[0].markerUnits).toBe('userSpaceOnUse');
    });

    it('markerUnits rejects invalid string', () => {
      expect(() =>
        compile(`
          let m = Marker('a', 10, 10);
          m.markerUnits = 'invalid';
        `),
      ).toThrow(/Invalid value 'invalid' for Marker.markerUnits\. Valid values: strokeWidth, userSpaceOnUse/);
    });

    it('orient accepts MarkerOrient enum values', () => {
      const result = compile(`
        let arrow = @{ m 0 0 l 10 5 l -10 5 z };
        let m = Marker('a', 10, 10);
        m.orient = MarkerOrient.AutoStartReverse;
        m.append(arrow);
      `);
      expect(result.markers[0].orient).toBe('auto-start-reverse');
    });

    it('orient accepts a numeric angle (radians) and converts to degrees', () => {
      const result = compile(`
        let arrow = @{ m 0 0 l 10 5 l -10 5 z };
        let m = Marker('a', 10, 10);
        m.orient = PI() / 2;
        m.append(arrow);
      `);
      // PI/2 radians = 90 degrees
      expect(result.markers[0].orient).toBe('90');
    });

    it('orient accepts an Angle value via a variable (first-class Angle)', () => {
      const result = compile(`
        let arrow = @{ m 0 0 l 10 5 l -10 5 z };
        let m = Marker('a', 10, 10);
        let a = 90deg;
        m.orient = a;
        m.append(arrow);
      `);
      expect(result.markers[0].orient).toBe('90');
    });

    it('preserveAspectRatio accepts MarkerPreserveAspectRatio enum values', () => {
      const result = compile(`
        let arrow = @{ m 0 0 l 10 5 l -10 5 z };
        let m = Marker('a', 10, 10);
        m.preserveAspectRatio = MarkerPreserveAspectRatio.XMaxYMaxSlice;
        m.append(arrow);
      `);
      expect(result.markers[0].preserveAspectRatio).toBe('xMaxYMax slice');
    });

    it('preserveAspectRatio None is preserved', () => {
      const result = compile(`
        let arrow = @{ m 0 0 l 10 5 l -10 5 z };
        let m = Marker('a', 10, 10);
        m.preserveAspectRatio = MarkerPreserveAspectRatio.None;
        m.append(arrow);
      `);
      expect(result.markers[0].preserveAspectRatio).toBe('none');
    });

    it('preserveAspectRatio rejects invalid string', () => {
      expect(() =>
        compile(`
          let m = Marker('a', 10, 10);
          m.preserveAspectRatio = 'invalid';
        `),
      ).toThrow(/Invalid value 'invalid' for Marker.preserveAspectRatio/);
    });

    it('throws on unknown property assignment', () => {
      expect(() =>
        compile(`
          let m = Marker('a', 10, 10);
          m.nope = 'x';
        `),
      ).toThrow(/Cannot assign to Marker property 'nope'/);
    });
  });

  describe('Property access', () => {
    it('reads id, viewBox, markerWidth, markerHeight, refX, refY, orient', () => {
      const result = compile(`
        let arrow = @{ m 0 0 l 10 5 l -10 5 z };
        let m = Marker('a', 20, 12);
        m.refX = 10;
        m.append(arrow);
        log(m.id);
        log(m.viewBox);
        log(m.markerWidth);
        log(m.markerHeight);
        log(m.refX);
        log(m.orient);
      `);
      const parts = result.logs.map((l) => l.parts[0].value);
      expect(parts[0]).toBe('a');
      expect(parts[1]).toBe('0 0 20 12');
      expect(parts[2]).toBe('20');
      expect(parts[3]).toBe('12');
      expect(parts[4]).toBe('10');
      expect(parts[5]).toBe('auto');
    });

    it('throws on unknown property access', () => {
      expect(() =>
        compile(`
          let m = Marker('a', 10, 10);
          log(m.nope);
        `),
      ).toThrow(/Property 'nope' does not exist on Marker/);
    });
  });

  describe('Style block resolution', () => {
    it('MarkerValue resolves to url(#id) in style block', () => {
      const result = compile(`
        let arrow = @{ m 0 0 l 10 5 l -10 5 z };
        let m = Marker('arrowhead', 10, 10) {|m| m.append(arrow); };
        define PathLayer('line') #{ marker-end: m; }
        layer('line').apply { M 0 0 L 100 100 }
      `);
      const layer = result.layers.find((l) => l.name === 'line');
      expect(layer!.styles['marker-end']).toBe('url(#arrowhead)');
    });

    it('marker shorthand expands to marker-start/mid/end, each auto-wrapped to url(#id) (ISSUE-031)', () => {
      // Browsers honour `marker` only as a CSS property, never as a presentation
      // attribute, so the shorthand must never reach the SVG as `marker="…"`.
      const result = compile(`
        let arrow = @{ m 0 0 l 10 5 l -10 5 z };
        let m = Marker('a', 10, 10) {|m| m.append(arrow); };
        define PathLayer('line') #{ marker: m; }
        layer('line').apply { M 0 0 L 100 100 }
      `);
      const layer = result.layers.find((l) => l.name === 'line');
      expect(layer!.styles['marker']).toBeUndefined();
      expect(layer!.styles['marker-start']).toBe('url(#a)');
      expect(layer!.styles['marker-mid']).toBe('url(#a)');
      expect(layer!.styles['marker-end']).toBe('url(#a)');
      const svg = toSvgString(buildSvgTree(result));
      expect(svg).toContain('marker-start="url(#a)" marker-mid="url(#a)" marker-end="url(#a)"');
      expect(svg).not.toMatch(/ marker="/);
    });

    it('marker shorthand reads back from a style block when its three longhands agree', () => {
      const logs = compile(`
        let arrow = @{ m 0 0 l 10 5 l -10 5 z };
        let a = Marker('a', 10, 10) {|m| m.append(arrow); };
        let b = Marker('b', 10, 10) {|m| m.append(arrow); };
        let same = #{ marker: a; };
        log(same.marker);
        log(same.markerEnd);
      `).logs.map((l) => l.parts[0].value);
      expect(logs).toEqual(['url(#a)', 'url(#a)']);
      // once a longhand diverges there is no single shorthand value to report
      expect(() =>
        compile(`
          let arrow = @{ m 0 0 l 10 5 l -10 5 z };
          let a = Marker('a', 10, 10) {|m| m.append(arrow); };
          let b = Marker('b', 10, 10) {|m| m.append(arrow); };
          let mixed = #{ marker: a; marker-end: b; };
          log(mixed.marker);
        `),
      ).toThrow(/Property 'marker' does not exist on style block/);
    });

    it('marker shorthand keeps CSS cascade order with the explicit properties', () => {
      const styles = (block: string): Record<string, string> => {
        const result = compile(`
          let arrow = @{ m 0 0 l 10 5 l -10 5 z };
          let a = Marker('a', 10, 10) {|m| m.append(arrow); };
          let b = Marker('b', 10, 10) {|m| m.append(arrow); };
          define PathLayer('line') #{ ${block} }
          layer('line').apply { M 0 0 L 100 100 }
        `);
        return result.layers.find((l) => l.name === 'line')!.styles;
      };
      // a later marker-end overrides the shorthand's end only
      expect(styles('marker: a; marker-end: b;')).toMatchObject({
        'marker-start': 'url(#a)',
        'marker-mid': 'url(#a)',
        'marker-end': 'url(#b)',
      });
      // a later shorthand overrides all three
      expect(styles('marker-end: b; marker: a;')).toMatchObject({
        'marker-start': 'url(#a)',
        'marker-mid': 'url(#a)',
        'marker-end': 'url(#a)',
      });
    });

    it('marker-start, marker-mid, marker-end all resolve correctly', () => {
      const result = compile(`
        let arrow = @{ m 0 0 l 10 5 l -10 5 z };
        let a = Marker('a', 10, 10) {|m| m.append(arrow); };
        let b = Marker('b', 5, 5) {|m| m.append(arrow); };
        let c = Marker('c', 8, 8) {|m| m.append(arrow); };
        define PathLayer('line') #{
          marker-start: a;
          marker-mid: b;
          marker-end: c;
        }
        layer('line').apply { M 0 0 L 100 100 }
      `);
      const layer = result.layers.find((l) => l.name === 'line');
      expect(layer!.styles['marker-start']).toBe('url(#a)');
      expect(layer!.styles['marker-mid']).toBe('url(#b)');
      expect(layer!.styles['marker-end']).toBe('url(#c)');
    });
  });

  describe('Duplicate ID detection', () => {
    it('throws when two Markers use the same id', () => {
      expect(() =>
        compile(`
          let a = Marker('dup', 10, 10);
          let b = Marker('dup', 20, 20);
        `),
      ).toThrow(/Duplicate defs ID 'dup'/);
    });

    it('throws when Marker id collides with Mask id', () => {
      expect(() =>
        compile(`
          let m = Mask('shared');
          let x = Marker('shared', 10, 10);
        `),
      ).toThrow(/Duplicate defs ID 'shared'/);
    });

    it('throws when Marker id collides with Pattern id', () => {
      expect(() =>
        compile(`
          let dot = @{ circle(5, 5, 2); };
          let p = Pattern('shared', 0, 0, 10, 10) {|p| p.append(dot); };
          let x = Marker('shared', 10, 10);
        `),
      ).toThrow(/Duplicate defs ID 'shared'/);
    });

    it('throws when Mask id collides with an existing Marker id', () => {
      expect(() =>
        compile(`
          let x = Marker('shared', 10, 10);
          let m = Mask('shared');
        `),
      ).toThrow(/Duplicate defs ID 'shared'/);
    });
  });

  describe('Log formatting', () => {
    it('Marker logs as Marker(id, N elements)', () => {
      const result = compile(`
        let arrow = @{ m 0 0 l 10 5 l -10 5 z };
        let m = Marker('arrow', 10, 10) {|m|
          m.append(arrow);
        };
        log(m);
      `);
      expect(result.logs[0].parts[0].value).toBe('Marker(arrow, 1 elements)');
    });
  });

  describe('SVG output', () => {
    it('emits <marker> element in <defs> with correct attributes', () => {
      const result = compile(`
        let arrow = @{ m 0 0 l 10 5 l -10 5 z };
        let m = Marker('arrowhead', 10, 10) {|m|
          m.append(arrow, #{ fill: Color('#333'); });
        };
      `);
      const marker = result.markers[0];
      expect(marker.id).toBe('arrowhead');
      expect(marker.viewBox).toBe('0 0 10 10');
      expect(marker.markerWidth).toBe(10);
      expect(marker.markerHeight).toBe(10);
      expect(marker.orient).toBe('auto');
      expect(marker.elements[0].pathData).toMatch(/^M 0 0/);
    });
  });

  describe('compileWithContext parity', () => {
    // Regression: evaluateWithContext originally forgot to forward markers into
    // its return object, so the playground (which uses compileWithContext via
    // the worker) received undefined markers and rendered nothing in <defs>.
    // compile() and compileWithContext() must expose the same markers array.
    it('includes markers in result, matching compile()', () => {
      const source = `
        let arrow = @{ m 0 0 l 10 5 l -10 5 z };
        let m = Marker('arrowhead', 10, 10) {|m|
          m.append(arrow, #{ fill: Color('#333'); });
        };
      `;
      const compileResult = compile(source);
      const contextResult = compileWithContext(source);
      expect(contextResult.markers).toBeDefined();
      expect(contextResult.markers).toHaveLength(1);
      expect(contextResult.markers[0].id).toBe('arrowhead');
      expect(contextResult.markers).toEqual(compileResult.markers);
    });
  });
  describe('Marker.fromPathBlock()', () => {
    const DOT = 'let dot = @{ circle(0, 0, 5); };';
    const ARROW = 'let arrow = @{ m 0 0 l 10 5 l -10 5 z };';
    const USE = (m: string): string => `define PathLayer('p') #{ stroke: #333; fill: none; marker: ${m}; }\nlayer('p').apply { M 0 0 L 50 0 }`;
    const warnings = (src: string): string[] => compile(src).warnings.filter((w) => w.code === 'marker-space').map((w) => w.message);

    it('fits the viewBox, size and reference point to the shape and applies the styles', () => {
      const result = compile(`${DOT}
        let m = Marker.fromPathBlock('dot', dot, #{ fill: context-stroke; });
        ${USE('m')}`);
      const marker = result.markers![0];
      expect(marker).toMatchObject({ id: 'dot', viewBox: '-5 -5 10 10', markerWidth: 10, markerHeight: 10, refX: '0', refY: '0', orient: 'auto' });
      expect(marker.elements).toHaveLength(1);
      expect(marker.elements[0].styles.fill).toBe('context-stroke');
      expect(marker.elements[0].pathData.startsWith('M ')).toBe(true);
      expect(result.warnings.filter((w) => w.code === 'marker-space')).toEqual([]);
      const svg = toSvgString(buildSvgTree(result));
      expect(svg).toContain('<marker id="dot" viewBox="-5 -5 10 10" markerWidth="10" markerHeight="10" refX="0" refY="0"');
      expect(svg).toContain('marker-start="url(#dot)" marker-mid="url(#dot)" marker-end="url(#dot)"');
    });

    it('pads the box by half a numeric stroke-width, keeping the reference point', () => {
      const marker = compile(`${DOT}
        let m = Marker.fromPathBlock('dot', dot, #{ fill: none; stroke: context-stroke; stroke-width: 2; });
        ${USE('m')}`).markers![0];
      expect(marker).toMatchObject({ viewBox: '-6 -6 12 12', markerWidth: 12, markerHeight: 12, refX: '0', refY: '0' });
    });

    it('puts the reference point at a BBoxAnchor', () => {
      const marker = compile(`${ARROW}
        let tip = Marker.fromPathBlock('tip', arrow, #{ fill: context-stroke; }, BBoxAnchor.Right);
        ${USE('tip')}`).markers![0];
      expect(marker).toMatchObject({ viewBox: '0 0 10 10', refX: '10', refY: '5' });
      const bottomLeft = compile(`${ARROW}
        let m = Marker.fromPathBlock('m', arrow, #{ fill: context-stroke; }, BBoxAnchor.BottomLeft);
        ${USE('m')}`).markers![0];
      expect(bottomLeft).toMatchObject({ refX: '0', refY: '10' });
    });

    it('fits a ProjectedPath where it is, with no warning', () => {
      const result = compile(`${ARROW}
        let far = Marker.fromPathBlock('far', arrow.project(200, 150));
        ${USE('far')}`);
      expect(result.markers![0]).toMatchObject({ viewBox: '200 150 10 10', refX: '205', refY: '155' });
      expect(result.markers![0].elements[0].pathData.startsWith('M 200 150')).toBe(true);
      expect(result.warnings.filter((w) => w.code === 'marker-space')).toEqual([]);
    });

    it('returns an ordinary marker: append and property assignment still work', () => {
      const result = compile(`${DOT}${ARROW}
        let m = Marker.fromPathBlock('m', arrow, #{ fill: context-stroke; });
        m.append(@{ m 2 2 l 6 3 l -6 3 z }, #{ fill: #fff; });
        m.orient = MarkerOrient.AutoStartReverse;
        m.markerUnits = MarkerUnits.UserSpaceOnUse;
        ${USE('m')}`);
      expect(result.markers![0].elements).toHaveLength(2);
      expect(result.markers![0]).toMatchObject({ orient: 'auto-start-reverse', markerUnits: 'userSpaceOnUse' });
    });

    it('rejects bad arguments and duplicate ids', () => {
      expect(() => compile(`${DOT} let m = Marker.fromPathBlock('m');`)).toThrow(/expects 2-4 arguments/);
      expect(() => compile(`${DOT} let m = Marker.fromPathBlock(5, dot);`)).toThrow(/first argument must be a string/);
      expect(() => compile(`let m = Marker.fromPathBlock('m', 5);`)).toThrow(/must be a PathBlock or ProjectedPath/);
      expect(() => compile(`let m = Marker.fromPathBlock('m', @{ });`)).toThrow(/cannot fit an empty shape/);
      expect(() => compile(`${DOT} let m = Marker.fromPathBlock('m', dot, 5);`)).toThrow(/third argument must be a style block/);
      expect(() => compile(`${DOT} let m = Marker.fromPathBlock('m', dot, #{ }, 5);`)).toThrow(/anchor must be a BBoxAnchor value/);
      expect(() => compile(`${DOT} let m = Marker.fromPathBlock('m', dot, #{ }, 'nowhere');`)).toThrow(/Invalid BBoxAnchor value/);
      expect(() =>
        compile(`${DOT} let a = Marker('m', 10, 10) {|m| m.append(dot); }; let b = Marker.fromPathBlock('m', dot);`),
      ).toThrow(/Duplicate defs ID 'm'/);
      expect(() => compile(`${DOT} let m = Marker.fromPathBlock('m', dot); let n = Marker.nope();`)).toThrow(/Unknown Marker method: nope/);
    });
  });

  describe('marker-space warning', () => {
    const DOT = 'let dot = @{ circle(0, 0, 5); };';
    const ARROW = 'let arrow = @{ m 0 0 l 10 5 l -10 5 z };';
    const warnings = (src: string): string[] => compile(src).warnings.filter((w) => w.code === 'marker-space').map((w) => w.message);

    it('warns once per marker when an appended block lies outside the viewBox, naming both', () => {
      const w = warnings(`${DOT}
        let m = Marker('dot', 10, 10) {|m| m.append(dot); m.append(dot); };
        M 0 0`);
      expect(w).toHaveLength(1);
      expect(w[0]).toBe(
        "Marker 'dot': 2 appended shapes span -5…5 × -5…5 but the marker's viewBox is 0 0 10 10 — the part outside it is clipped. Use Marker.fromPathBlock(), set viewBox, or translate the shape",
      );
      const single = warnings(`${DOT}
        let m = Marker('dot', 10, 10) {|m| m.append(dot); };
        M 0 0`);
      expect(single[0]).toContain("Marker 'dot': the appended shape spans -5…5 × -5…5 but the marker's viewBox is 0 0 10 10");
    });

    it('says that a ProjectedPath kept its page coordinates', () => {
      const w = warnings(`${ARROW}
        let m = Marker('ghost', 10, 10) {|m| m.append(arrow.project(200, 150)); };
        M 0 0`);
      expect(w).toHaveLength(1);
      expect(w[0]).toContain('the appended ProjectedPath kept its page coordinates and spans 200…210 × 150…160');
      expect(w[0]).toContain('toPathBlock() and append that');
    });

    it('carries the position of the append', () => {
      const result = compile(`${DOT}
        let m = Marker('dot', 10, 10) {|m|
          m.append(dot);
        };
        M 0 0`);
      const w = result.warnings.find((x) => x.code === 'marker-space')!;
      expect(w.line).toBe(3);
    });

    it('is silent when the shape fits, and when viewBox is assigned after append', () => {
      expect(warnings(`${ARROW} let m = Marker('a', 10, 10) {|m| m.append(arrow); }; M 0 0`)).toEqual([]);
      expect(warnings(`${DOT} let m = Marker('late', 10, 10) {|m| m.append(dot); }; m.viewBox = \`-5 -5 10 10\`; M 0 0`)).toEqual([]);
      expect(warnings(`${DOT} let m = Marker.fromPathBlock('fit', dot); M 0 0`)).toEqual([]);
    });

    it('becomes an error under strict mode', () => {
      expect(() =>
        compile(`${DOT} let m = Marker('dot', 10, 10) {|m| m.append(dot); }; M 0 0`, { strict: ['marker-space'] }),
      ).toThrow(/marker-space/);
    });
  });
});
