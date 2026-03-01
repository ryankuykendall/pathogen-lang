import { describe, it, expect } from 'vitest';
import { compile } from '../src';

describe('Gradients', () => {
  describe('construction and stops', () => {
    it('LinearGradient creates with correct type and attrs', () => {
      const result = compile(`
        let g = LinearGradient('lg', 0, 0, 1, 1) {|g|
          g.stop(0, Color('#000000'));
          g.stop(1, Color('#ffffff'));
        };
      `);
      expect(result.gradients).toHaveLength(1);
      expect(result.gradients[0].type).toBe('linear');
      expect(result.gradients[0].id).toBe('lg');
      expect(result.gradients[0].attrs).toEqual({ x1: '0', y1: '0', x2: '1', y2: '1' });
    });

    it('RadialGradient creates with cx, cy, r', () => {
      const result = compile(`
        let g = RadialGradient('rg', 0.5, 0.5, 0.5) {|g|
          g.stop(0, Color('#fff'));
          g.stop(1, Color('#000'));
        };
      `);
      expect(result.gradients).toHaveLength(1);
      expect(result.gradients[0].type).toBe('radial');
      expect(result.gradients[0].id).toBe('rg');
      expect(result.gradients[0].attrs).toEqual({ cx: '0.5', cy: '0.5', r: '0.5' });
    });

    it('RadialGradient accepts optional fx, fy', () => {
      const result = compile(`
        let g = RadialGradient('rg2', 0.5, 0.5, 0.5, 0.3, 0.3) {|g|
          g.stop(0, Color('#fff'));
        };
      `);
      expect(result.gradients[0].attrs).toEqual({
        cx: '0.5', cy: '0.5', r: '0.5', fx: '0.3', fy: '0.3',
      });
    });

    it('.stop() adds stops with offset and Color value', () => {
      const result = compile(`
        let g = LinearGradient('s', 0, 0, 1, 0) {|g|
          g.stop(0, Color('#e63946'));
          g.stop(0.5, Color('#f4a261'));
          g.stop(1, Color('#2a9d8f'));
        };
      `);
      expect(result.gradients[0].stops).toHaveLength(3);
      expect(result.gradients[0].stops[0].offset).toBe(0);
      expect(result.gradients[0].stops[1].offset).toBe(0.5);
      expect(result.gradients[0].stops[2].offset).toBe(1);
    });

    it('stops accept hex strings via Color()', () => {
      const result = compile(`
        let g = LinearGradient('hex', 0, 0, 1, 0) {|g|
          g.stop(0, Color('#ff0000'));
        };
      `);
      expect(result.gradients[0].stops[0].color).toBeDefined();
      expect(typeof result.gradients[0].stops[0].color).toBe('string');
    });

    it('stops accept named colors via Color()', () => {
      const result = compile(`
        let g = LinearGradient('named', 0, 0, 1, 0) {|g|
          g.stop(0, Color('red'));
        };
      `);
      expect(result.gradients[0].stops[0].color).toBeDefined();
      expect(typeof result.gradients[0].stops[0].color).toBe('string');
    });

    it('stop with .alpha() produces color with alpha', () => {
      const result = compile(`
        let g = LinearGradient('alpha', 0, 0, 1, 0) {|g|
          g.stop(0, Color('#000000').alpha(0.5));
        };
      `);
      // Alpha colors produce rgb() with alpha component or oklch with alpha
      expect(result.gradients[0].stops[0].color).toBeDefined();
    });
  });

  describe('block syntax', () => {
    it('trailing block {|g| ... } executes with gradient as parameter', () => {
      const result = compile(`
        let g = LinearGradient('block', 0, 0, 1, 0) {|g|
          g.stop(0, Color('#000'));
          g.stop(1, Color('#fff'));
        };
      `);
      expect(result.gradients[0].stops).toHaveLength(2);
    });

    it('block can contain for-loops for dynamic stop generation', () => {
      const result = compile(`
        let g = LinearGradient('dynamic', 0, 0, 1, 0) {|g|
          for (i in 0..4) {
            g.stop(calc(i / 4), Color('#000'));
          }
        };
      `);
      expect(result.gradients[0].stops).toHaveLength(5);
    });

    it('block can contain if-statements', () => {
      const result = compile(`
        let g = LinearGradient('cond', 0, 0, 1, 0) {|g|
          g.stop(0, Color('#000'));
          if (1 == 1) {
            g.stop(1, Color('#fff'));
          }
        };
      `);
      expect(result.gradients[0].stops).toHaveLength(2);
    });

    it('gradient without block creates empty gradient', () => {
      const result = compile(`
        let g = LinearGradient('empty', 0, 0, 1, 0);
      `);
      expect(result.gradients[0].stops).toHaveLength(0);
    });
  });

  describe('style integration', () => {
    it('GradientValue in fill produces url(#id)', () => {
      const result = compile(`
        let g = LinearGradient('myfill', 0, 0, 1, 0) {|g|
          g.stop(0, Color('#000'));
          g.stop(1, Color('#fff'));
        };
        define PathLayer('test') \${ fill: g; }
        layer('test').apply { M 0 0 L 100 0 }
      `);
      expect(result.layers[0].styles.fill).toBe('url(#myfill)');
    });

    it('GradientValue in stroke produces url(#id)', () => {
      const result = compile(`
        let g = LinearGradient('mystroke', 0, 0, 1, 0) {|g|
          g.stop(0, Color('#000'));
          g.stop(1, Color('#fff'));
        };
        define PathLayer('test') \${ stroke: g; }
        layer('test').apply { M 0 0 L 100 0 }
      `);
      expect(result.layers[0].styles.stroke).toBe('url(#mystroke)');
    });

    it('.id property returns gradient string ID', () => {
      const result = compile(`
        let g = LinearGradient('myid', 0, 0, 1, 0);
        log(g.id)
      `);
      expect(result.logs[0].parts[0].value).toBe('myid');
    });
  });

  describe('attributes', () => {
    it('.spreadMethod serializes correctly', () => {
      const result = compile(`
        let g = LinearGradient('sm', 0, 0, 1, 0) {|g|
          g.stop(0, Color('#000'));
        };
        g.spreadMethod = 'repeat';
      `);
      expect(result.gradients[0].spreadMethod).toBe('repeat');
    });

    it('.gradientUnits serializes correctly', () => {
      const result = compile(`
        let g = LinearGradient('gu', 0, 0, 1, 0) {|g|
          g.stop(0, Color('#000'));
        };
        g.gradientUnits = 'userSpaceOnUse';
      `);
      expect(result.gradients[0].gradientUnits).toBe('userSpaceOnUse');
    });

    it('.gradientTransform serializes correctly', () => {
      const result = compile(`
        let g = LinearGradient('gt', 0, 0, 1, 0) {|g|
          g.stop(0, Color('#000'));
        };
        g.gradientTransform = 'rotate(45)';
      `);
      expect(result.gradients[0].gradientTransform).toBe('rotate(45)');
    });
  });

  describe('inheritance', () => {
    it('.inherit() creates new gradient with href pointing to parent', () => {
      const result = compile(`
        let base = LinearGradient('base', 0, 0, 1, 0) {|g|
          g.stop(0, Color('#000'));
          g.stop(1, Color('#fff'));
        };
        let child = base.inherit('child');
      `);
      expect(result.gradients).toHaveLength(2);
      const child = result.gradients.find(g => g.id === 'child');
      expect(child).toBeDefined();
      expect(child!.href).toBe('base');
      expect(child!.stops).toHaveLength(0);
    });

    it('inherited gradient can override attributes', () => {
      const result = compile(`
        let base = LinearGradient('base2', 0, 0, 1, 0) {|g|
          g.stop(0, Color('#000'));
        };
        let child = base.inherit('child2');
        child.gradientTransform = 'rotate(90)';
      `);
      const child = result.gradients.find(g => g.id === 'child2');
      expect(child!.gradientTransform).toBe('rotate(90)');
      expect(child!.href).toBe('base2');
    });

    it('inherited gradient with no stops emits self-closing element', () => {
      const result = compile(`
        let base = LinearGradient('base3', 0, 0, 1, 0) {|g|
          g.stop(0, Color('#000'));
        };
        let child = base.inherit('child3');
      `);
      const child = result.gradients.find(g => g.id === 'child3');
      expect(child!.stops).toHaveLength(0);
      expect(child!.href).toBe('base3');
    });
  });

  describe('output structure', () => {
    it('CompileResult.gradients contains gradient output objects', () => {
      const result = compile(`
        let g = LinearGradient('out', 0, 0, 1, 0) {|g|
          g.stop(0, Color('#000'));
        };
      `);
      expect(result.gradients).toBeDefined();
      expect(Array.isArray(result.gradients)).toBe(true);
    });

    it('linear gradient attrs include x1, y1, x2, y2', () => {
      const result = compile(`
        let g = LinearGradient('coords', 0.1, 0.2, 0.8, 0.9) {|g|
          g.stop(0, Color('#000'));
        };
      `);
      const attrs = result.gradients[0].attrs;
      expect(attrs.x1).toBe('0.1');
      expect(attrs.y1).toBe('0.2');
      expect(attrs.x2).toBe('0.8');
      expect(attrs.y2).toBe('0.9');
    });

    it('radial gradient attrs include cx, cy, r', () => {
      const result = compile(`
        let g = RadialGradient('rcoords', 0.3, 0.4, 0.6) {|g|
          g.stop(0, Color('#000'));
        };
      `);
      const attrs = result.gradients[0].attrs;
      expect(attrs.cx).toBe('0.3');
      expect(attrs.cy).toBe('0.4');
      expect(attrs.r).toBe('0.6');
    });

    it('stops serialize with offset and stop-color', () => {
      const result = compile(`
        let g = LinearGradient('stops', 0, 0, 1, 0) {|g|
          g.stop(0.25, Color('#e63946'));
          g.stop(0.75, Color('#2a9d8f'));
        };
      `);
      expect(result.gradients[0].stops[0].offset).toBe(0.25);
      expect(result.gradients[0].stops[0].color).toBeDefined();
      expect(result.gradients[0].stops[1].offset).toBe(0.75);
    });

    it('program with no gradients has empty gradients array', () => {
      const result = compile('M 0 0 L 100 100');
      expect(result.gradients).toEqual([]);
    });
  });

  describe('error cases', () => {
    it('duplicate gradient ID throws compile error', () => {
      expect(() => compile(`
        let a = LinearGradient('dup', 0, 0, 1, 0);
        let b = LinearGradient('dup', 0, 0, 0, 1);
      `)).toThrow(/Duplicate defs ID 'dup'/);
    });

    it('duplicate ID across gradient and mask throws error', () => {
      expect(() => compile(`
        let m = Mask('shared');
        let g = LinearGradient('shared', 0, 0, 1, 0);
      `)).toThrow(/Duplicate defs ID 'shared'/);
    });

    it('duplicate ID across gradient and clipPath throws error', () => {
      expect(() => compile(`
        let c = ClipPath('shared');
        let g = RadialGradient('shared', 0.5, 0.5, 0.5);
      `)).toThrow(/Duplicate defs ID 'shared'/);
    });

    it('wrong argument count for LinearGradient throws error', () => {
      expect(() => compile(`
        let g = LinearGradient('bad', 0, 0);
      `)).toThrow(/LinearGradient\(\) expects 5 arguments/);
    });

    it('wrong argument count for RadialGradient throws error', () => {
      expect(() => compile(`
        let g = RadialGradient('bad', 0.5);
      `)).toThrow(/RadialGradient\(\) expects 4-6 arguments/);
    });

    it('non-string ID throws error', () => {
      expect(() => compile(`
        let g = LinearGradient(42, 0, 0, 1, 0);
      `)).toThrow(/first argument must be a string/);
    });

    it('non-number stop offset throws error', () => {
      expect(() => compile(`
        let g = LinearGradient('bad', 0, 0, 1, 0) {|g|
          g.stop('half', Color('#000'));
        };
      `)).toThrow(/stop\(\) offset must be a number/);
    });

    it('non-Color stop color throws error', () => {
      expect(() => compile(`
        let g = LinearGradient('bad', 0, 0, 1, 0) {|g|
          g.stop(0, '#000');
        };
      `)).toThrow(/stop\(\) color must be a Color value/);
    });
  });
});
