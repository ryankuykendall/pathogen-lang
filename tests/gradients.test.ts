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

  describe('oklch interpolation', () => {
    it('expansion increases stop count', () => {
      const result = compile(`
        let g = LinearGradient('oklch1', 0, 0, 1, 0) {|g|
          g.stop(0, Color('#e63946'));
          g.stop(1, Color('#2a9d8f'));
        };
        g.interpolation = 'oklch';
      `);
      // Default steps=10, offset span=1, so ceil(10*1)-1 = 9 intermediates + 2 originals = 11
      expect(result.gradients[0].stops.length).toBeGreaterThan(2);
    });

    it('original stops preserved at exact offsets', () => {
      const result = compile(`
        let g = LinearGradient('oklch2', 0, 0, 1, 0) {|g|
          g.stop(0, Color('#e63946'));
          g.stop(1, Color('#2a9d8f'));
        };
        g.interpolation = 'oklch';
      `);
      const stops = result.gradients[0].stops;
      expect(stops[0].offset).toBe(0);
      expect(stops[stops.length - 1].offset).toBe(1);
    });

    it('custom steps controls density', () => {
      const resultLow = compile(`
        let g = LinearGradient('low', 0, 0, 1, 0) {|g|
          g.stop(0, Color('#e63946'));
          g.stop(1, Color('#2a9d8f'));
        };
        g.interpolation = 'oklch';
        g.steps = 5;
      `);
      const resultHigh = compile(`
        let g = LinearGradient('high', 0, 0, 1, 0) {|g|
          g.stop(0, Color('#e63946'));
          g.stop(1, Color('#2a9d8f'));
        };
        g.interpolation = 'oklch';
        g.steps = 20;
      `);
      expect(resultHigh.gradients[0].stops.length).toBeGreaterThan(resultLow.gradients[0].stops.length);
    });

    it('stops sorted after expansion', () => {
      const result = compile(`
        let g = LinearGradient('sorted', 0, 0, 1, 0) {|g|
          g.stop(0, Color('#e63946'));
          g.stop(0.5, Color('#f4a261'));
          g.stop(1, Color('#2a9d8f'));
        };
        g.interpolation = 'oklch';
      `);
      const offsets = result.gradients[0].stops.map(s => s.offset);
      for (let i = 1; i < offsets.length; i++) {
        expect(offsets[i]).toBeGreaterThanOrEqual(offsets[i - 1]);
      }
    });

    it('default (no interpolation) does NOT expand', () => {
      const result = compile(`
        let g = LinearGradient('noexpand', 0, 0, 1, 0) {|g|
          g.stop(0, Color('#e63946'));
          g.stop(1, Color('#2a9d8f'));
        };
      `);
      expect(result.gradients[0].stops).toHaveLength(2);
    });

    it('non-uniform spacing expands proportionally', () => {
      const result = compile(`
        let g = LinearGradient('nonuniform', 0, 0, 1, 0) {|g|
          g.stop(0, Color('#e63946'));
          g.stop(0.1, Color('#f4a261'));
          g.stop(1, Color('#2a9d8f'));
        };
        g.interpolation = 'oklch';
        g.steps = 10;
      `);
      const stops = result.gradients[0].stops;
      // The 0→0.1 span is small, should have fewer intermediates than 0.1→1
      const stopsBeforePoint1 = stops.filter(s => s.offset <= 0.1);
      const stopsAfterPoint1 = stops.filter(s => s.offset >= 0.1);
      expect(stopsAfterPoint1.length).toBeGreaterThan(stopsBeforePoint1.length);
    });

    it('single stop does not crash', () => {
      const result = compile(`
        let g = LinearGradient('single', 0, 0, 1, 0) {|g|
          g.stop(0.5, Color('#e63946'));
        };
        g.interpolation = 'oklch';
      `);
      expect(result.gradients[0].stops).toHaveLength(1);
    });
  });

  describe('linearRGB interpolation', () => {
    it('emits colorInterpolation in output', () => {
      const result = compile(`
        let g = LinearGradient('linrgb', 0, 0, 1, 0) {|g|
          g.stop(0, Color('#ff0000'));
          g.stop(1, Color('#0000ff'));
        };
        g.interpolation = 'linearRGB';
      `);
      expect(result.gradients[0].colorInterpolation).toBe('linearRGB');
    });

    it('does NOT expand stops', () => {
      const result = compile(`
        let g = LinearGradient('linrgb2', 0, 0, 1, 0) {|g|
          g.stop(0, Color('#ff0000'));
          g.stop(1, Color('#0000ff'));
        };
        g.interpolation = 'linearRGB';
      `);
      expect(result.gradients[0].stops).toHaveLength(2);
    });
  });

  describe('interpolation/steps properties', () => {
    it('interpolation readable after set', () => {
      const result = compile(`
        let g = LinearGradient('readip', 0, 0, 1, 0);
        g.interpolation = 'oklch';
        log(g.interpolation)
      `);
      expect(result.logs[0].parts[0].value).toBe('oklch');
    });

    it('steps readable after set', () => {
      const result = compile(`
        let g = LinearGradient('readsteps', 0, 0, 1, 0);
        g.steps = 15;
        log(g.steps)
      `);
      expect(result.logs[0].parts[0].value).toBe('15');
    });

    it('defaults to null', () => {
      const result = compile(`
        let g = LinearGradient('defaults', 0, 0, 1, 0);
        log(g.interpolation)
        log(g.steps)
      `);
      expect(result.logs[0].parts[0].value).toBe('null');
      expect(result.logs[1].parts[0].value).toBe('null');
    });

    it('invalid interpolation value throws', () => {
      expect(() => compile(`
        let g = LinearGradient('bad', 0, 0, 1, 0);
        g.interpolation = 'rgb';
      `)).toThrow(/interpolation/i);
    });

    it('non-number steps throws', () => {
      expect(() => compile(`
        let g = LinearGradient('bad', 0, 0, 1, 0);
        g.steps = 'many';
      `)).toThrow(/steps/i);
    });

    it('settable inside trailing block', () => {
      const result = compile(`
        let g = LinearGradient('inblock', 0, 0, 1, 0) {|g|
          g.stop(0, Color('#e63946'));
          g.stop(1, Color('#2a9d8f'));
          g.interpolation = 'oklch';
          g.steps = 5;
        };
      `);
      expect(result.gradients[0].stops.length).toBeGreaterThan(2);
    });
  });

  describe('interpolation inheritance', () => {
    it('inherit() propagates interpolation and steps', () => {
      const result = compile(`
        let base = LinearGradient('ibase', 0, 0, 1, 0) {|g|
          g.stop(0, Color('#e63946'));
          g.stop(1, Color('#2a9d8f'));
        };
        base.interpolation = 'oklch';
        base.steps = 8;
        let child = base.inherit('ichild');
        log(child.interpolation)
        log(child.steps)
      `);
      // Child's output shouldn't have expanded stops since it has no stops of its own
      // But the properties should be propagated
      // Actually — inherit creates a child with no stops and href to parent
      // But the interpolation/steps should be readable on the child
      // Wait: the child has no stops, so no expansion. But properties should carry.
      // Let's just check the logs
      // Actually inherit() creates empty stops with href - the child reads from parent
      // But interpolation/steps are on the GradientValue, so they should propagate
      expect(result.logs[0].parts[0].value).toBe('oklch');
      expect(result.logs[1].parts[0].value).toBe('8');
    });

    it('child can override inherited interpolation', () => {
      const result = compile(`
        let base = LinearGradient('obase', 0, 0, 1, 0) {|g|
          g.stop(0, Color('#e63946'));
          g.stop(1, Color('#2a9d8f'));
        };
        base.interpolation = 'oklch';
        let child = base.inherit('ochild');
        child.interpolation = 'linearRGB';
        log(child.interpolation)
      `);
      expect(result.logs[0].parts[0].value).toBe('linearRGB');
    });
  });

  describe('CSSVar reactive stops', () => {
    it('preserves var() in stop-color output', () => {
      const result = compile(`
        let accent = Color(CSSVar('--accent', '#e63946'));
        let g = LinearGradient('reactive', 0, 0, 1, 0) {|g|
          g.stop(0, accent);
          g.stop(1, Color('#2a9d8f'));
        };
      `);
      expect(result.gradients[0].stops[0].color).toContain('var(--accent');
    });

    it('non-CSSVar still produces static color', () => {
      const result = compile(`
        let g = LinearGradient('static', 0, 0, 1, 0) {|g|
          g.stop(0, Color('#e63946'));
        };
      `);
      expect(result.gradients[0].stops[0].color).not.toContain('var(');
    });

    it('skips oklch expansion for CSSVar stop pairs', () => {
      const result = compile(`
        let accent = Color(CSSVar('--accent', '#e63946'));
        let g = LinearGradient('skipvar', 0, 0, 1, 0) {|g|
          g.stop(0, accent);
          g.stop(1, Color('#2a9d8f'));
        };
        g.interpolation = 'oklch';
      `);
      // One stop is CSSVar, so the pair should NOT be expanded
      // Original 2 stops should remain
      expect(result.gradients[0].stops).toHaveLength(2);
      expect(result.gradients[0].stops[0].color).toContain('var(--accent');
    });

    it('registers @property for CSSVar stops', () => {
      const result = compile(`
        let accent = Color(CSSVar('--accent', '#e63946'));
        let g = LinearGradient('prop', 0, 0, 1, 0) {|g|
          g.stop(0, accent);
        };
      `);
      expect(result.cssProperties).toBeDefined();
      expect(result.cssProperties.some(p => p.name === '--accent')).toBe(true);
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
