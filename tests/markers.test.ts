import { describe, expect, it } from 'vitest';

import { compile } from '../src';

describe('Markers', () => {
  describe('Marker() constructor', () => {
    it('creates Marker with smart defaults', () => {
      const result = compile(`
        let arrow = @{ m 0 0 l 10 5 l -10 5 z };
        let m = Marker('arrowhead', 10, 10) {|m|
          m.append(arrow, \${ fill: Color('#333'); });
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
          m.append(arrow, \${ fill: Color('#ff0000'); stroke: Color('#000'); });
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
          m.append(tri, \${ fill: Color('#333'); });
          m.append(dot, \${ fill: Color('#fff'); });
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
        define PathLayer('line') \${ marker-end: m; }
        layer('line').apply { M 0 0 L 100 100 }
      `);
      const layer = result.layers.find((l) => l.name === 'line');
      expect(layer!.styles['marker-end']).toBe('url(#arrowhead)');
    });

    it('marker shorthand auto-wraps to url(#id)', () => {
      const result = compile(`
        let arrow = @{ m 0 0 l 10 5 l -10 5 z };
        let m = Marker('a', 10, 10) {|m| m.append(arrow); };
        define PathLayer('line') \${ marker: m; }
        layer('line').apply { M 0 0 L 100 100 }
      `);
      const layer = result.layers.find((l) => l.name === 'line');
      expect(layer!.styles['marker']).toBe('url(#a)');
    });

    it('marker-start, marker-mid, marker-end all resolve correctly', () => {
      const result = compile(`
        let arrow = @{ m 0 0 l 10 5 l -10 5 z };
        let a = Marker('a', 10, 10) {|m| m.append(arrow); };
        let b = Marker('b', 5, 5) {|m| m.append(arrow); };
        let c = Marker('c', 8, 8) {|m| m.append(arrow); };
        define PathLayer('line') \${
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
          m.append(arrow, \${ fill: Color('#333'); });
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
});
