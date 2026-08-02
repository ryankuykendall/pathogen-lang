import { describe, expect, it } from 'vitest';

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
        cx: '0.5',
        cy: '0.5',
        r: '0.5',
        fx: '0.3',
        fy: '0.3',
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
      expect(result.gradients[0].stops[0].color).toBe('#ff0000');
    });

    it('stops accept named colors via Color()', () => {
      const result = compile(`
        let g = LinearGradient('named', 0, 0, 1, 0) {|g|
          g.stop(0, Color('red'));
        };
      `);
      expect(result.gradients[0].stops[0].color).toBe('#ff0000');
    });

    it('stop with .alpha() produces color with alpha', () => {
      const result = compile(`
        let g = LinearGradient('alpha', 0, 0, 1, 0) {|g|
          g.stop(0, Color('#000000').alpha(0.5));
        };
      `);
      expect(result.gradients[0].stops[0].color).toBe('rgba(0, 0, 0, 0.5)');
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
        log(g.id);
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
      const child = result.gradients.find((g) => g.id === 'child');
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
      const child = result.gradients.find((g) => g.id === 'child2');
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
      const child = result.gradients.find((g) => g.id === 'child3');
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
      const offsets = result.gradients[0].stops.map((s) => s.offset);
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
      const stopsBeforePoint1 = stops.filter((s) => s.offset <= 0.1);
      const stopsAfterPoint1 = stops.filter((s) => s.offset >= 0.1);
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
        log(g.interpolation);
      `);
      expect(result.logs[0].parts[0].value).toBe('oklch');
    });

    it('steps readable after set', () => {
      const result = compile(`
        let g = LinearGradient('readsteps', 0, 0, 1, 0);
        g.steps = 15;
        log(g.steps);
      `);
      expect(result.logs[0].parts[0].value).toBe('15');
    });

    it('defaults to null', () => {
      const result = compile(`
        let g = LinearGradient('defaults', 0, 0, 1, 0);
        log(g.interpolation);
        log(g.steps);
      `);
      expect(result.logs[0].parts[0].value).toBe('null');
      expect(result.logs[1].parts[0].value).toBe('null');
    });

    it('invalid interpolation value throws', () => {
      expect(() =>
        compile(`
        let g = LinearGradient('bad', 0, 0, 1, 0);
        g.interpolation = 'rgb';
      `),
      ).toThrow(/interpolation/i);
    });

    it('non-number steps throws', () => {
      expect(() =>
        compile(`
        let g = LinearGradient('bad', 0, 0, 1, 0);
        g.steps = 'many';
      `),
      ).toThrow(/steps/i);
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
        log(child.interpolation);
        log(child.steps);
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
        log(child.interpolation);
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
      expect(result.cssProperties.some((p) => p.name === '--accent')).toBe(true);
    });
  });

  describe('error cases', () => {
    it('duplicate gradient ID throws compile error', () => {
      expect(() =>
        compile(`
        let a = LinearGradient('dup', 0, 0, 1, 0);
        let b = LinearGradient('dup', 0, 0, 0, 1);
      `),
      ).toThrow(/Duplicate defs ID 'dup'/);
    });

    it('duplicate ID across gradient and mask throws error', () => {
      expect(() =>
        compile(`
        let m = Mask('shared');
        let g = LinearGradient('shared', 0, 0, 1, 0);
      `),
      ).toThrow(/Duplicate defs ID 'shared'/);
    });

    it('duplicate ID across gradient and clipPath throws error', () => {
      expect(() =>
        compile(`
        let c = ClipPath('shared');
        let g = RadialGradient('shared', 0.5, 0.5, 0.5);
      `),
      ).toThrow(/Duplicate defs ID 'shared'/);
    });

    it('wrong argument count for LinearGradient throws error', () => {
      expect(() =>
        compile(`
        let g = LinearGradient('bad', 0, 0);
      `),
      ).toThrow(/LinearGradient\(\) expects 5 arguments/);
    });

    it('wrong argument count for RadialGradient throws error', () => {
      expect(() =>
        compile(`
        let g = RadialGradient('bad', 0.5);
      `),
      ).toThrow(/RadialGradient\(\) expects 4-6 arguments/);
    });

    it('non-string ID throws error', () => {
      expect(() =>
        compile(`
        let g = LinearGradient(42, 0, 0, 1, 0);
      `),
      ).toThrow(/first argument must be a string/);
    });

    it('non-number stop offset throws error', () => {
      expect(() =>
        compile(`
        let g = LinearGradient('bad', 0, 0, 1, 0) {|g|
          g.stop('half', Color('#000'));
        };
      `),
      ).toThrow(/stop\(\) offset must be a number/);
    });

    it('non-Color stop color throws error', () => {
      expect(() =>
        compile(`
        let g = LinearGradient('bad', 0, 0, 1, 0) {|g|
          g.stop(0, '#000');
        };
      `),
      ).toThrow(/stop\(\) color must be a Color value/);
    });
  });

  describe('Pattern constructor', () => {
    it('creates Pattern with correct attributes', () => {
      const result = compile(`
        let dot = @{ circle(10, 10, 3); };
        let p = Pattern('dots', 0, 0, 20, 20) {|p|
          p.append(dot, \${ fill: Color('#e63946'); });
        };
      `);
      expect(result.patterns).toHaveLength(1);
      expect(result.patterns[0].id).toBe('dots');
      expect(result.patterns[0].x).toBe(0);
      expect(result.patterns[0].y).toBe(0);
      expect(result.patterns[0].width).toBe(20);
      expect(result.patterns[0].height).toBe(20);
    });

    it('append adds path elements to pattern', () => {
      const result = compile(`
        let dot = @{ circle(5, 5, 2); };
        let p = Pattern('p1', 0, 0, 10, 10) {|p|
          p.append(dot);
        };
      `);
      expect(result.patterns[0].elements).toHaveLength(1);
      expect(result.patterns[0].elements[0].pathData).toContain('A');
    });

    it('append with styles preserves style properties', () => {
      const result = compile(`
        let dot = @{ circle(5, 5, 2); };
        let p = Pattern('p1', 0, 0, 10, 10) {|p|
          p.append(dot, \${ fill: Color('#ff0000'); stroke: Color('#000000'); });
        };
      `);
      expect(result.patterns[0].elements[0].styles).toHaveProperty('fill');
      expect(result.patterns[0].elements[0].styles).toHaveProperty('stroke');
    });

    it('patternUnits property can be set and read', () => {
      const result = compile(`
        let dot = @{ circle(10, 10, 3); };
        let p = Pattern('dots', 0, 0, 20, 20) {|p|
          p.append(dot);
        };
        p.patternUnits = 'userSpaceOnUse';
      `);
      expect(result.patterns[0].patternUnits).toBe('userSpaceOnUse');
    });

    it('duplicate Pattern ID throws error', () => {
      expect(() =>
        compile(`
        let dot = @{ circle(5, 5, 2); };
        let a = Pattern('dup', 0, 0, 10, 10) {|p| p.append(dot); };
        let b = Pattern('dup', 0, 0, 20, 20) {|p| p.append(dot); };
      `),
      ).toThrow(/Duplicate defs ID 'dup'/);
    });
  });

  describe('Pattern output', () => {
    it('output structure matches PatternOutput interface', () => {
      const result = compile(`
        let line = @{ m 0 0 l 50 50 };
        let p = Pattern('grid', 0, 0, 50, 50) {|p|
          p.append(line, \${ fill: none; stroke: Color('#ccc'); });
        };
      `);
      const pat = result.patterns[0];
      expect(pat).toHaveProperty('id');
      expect(pat).toHaveProperty('x');
      expect(pat).toHaveProperty('y');
      expect(pat).toHaveProperty('width');
      expect(pat).toHaveProperty('height');
      expect(pat).toHaveProperty('elements');
    });

    it('elements contain pathData and styles', () => {
      const result = compile(`
        let dot = @{ circle(5, 5, 3); };
        let p = Pattern('p1', 0, 0, 10, 10) {|p|
          p.append(dot, \${ fill: Color('#f00'); });
        };
      `);
      const el = result.patterns[0].elements[0];
      expect(el).toHaveProperty('pathData');
      expect(el).toHaveProperty('styles');
      expect(typeof el.pathData).toBe('string');
    });

    it('referenced via url(#id) in layer fill', () => {
      const result = compile(`
        let dot = @{ circle(10, 10, 3); };
        let p = Pattern('dots', 0, 0, 20, 20) {|p|
          p.append(dot, \${ fill: Color('#e63946'); });
        };
        p.patternUnits = 'userSpaceOnUse';
        define PathLayer('bg') \${ fill: p; stroke: none; }
        layer('bg').apply { M 0 0 L 200 0 L 200 200 L 0 200 Z }
      `);
      const bgLayer = result.layers.find((l) => l.name === 'bg');
      expect(bgLayer?.styles.fill).toBe('url(#dots)');
    });
  });

  describe('ConicGradient constructor', () => {
    it('creates with cx/cy', () => {
      const result = compile(`
        let g = ConicGradient('cg', 100, 100) {|g|
          g.stop(0, Color('#000000'));
          g.stop(1, Color('#ffffff'));
        };
      `);
      expect(result.gradients).toHaveLength(1);
      expect(result.gradients[0].type).toBe('conic');
      expect(result.gradients[0].id).toBe('cg');
      expect(result.gradients[0].cx).toBe(100);
      expect(result.gradients[0].cy).toBe(100);
    });

    it('trailing block with stops works', () => {
      const result = compile(`
        let g = ConicGradient('wheel', 50, 50) {|g|
          g.stop(0, Color('#ff0000'));
          g.stop(0.5, Color('#00ff00'));
          g.stop(1, Color('#0000ff'));
        };
      `);
      expect(result.gradients[0].stops).toHaveLength(3);
    });

    it('duplicate ID throws error', () => {
      expect(() =>
        compile(`
        let a = ConicGradient('dup', 50, 50) {|g| g.stop(0, Color('#000')); };
        let b = ConicGradient('dup', 100, 100) {|g| g.stop(0, Color('#fff')); };
      `),
      ).toThrow(/Duplicate defs ID 'dup'/);
    });

    it('inherit propagates conic fields', () => {
      const result = compile(`
        let parent = ConicGradient('p', 100, 100) {|g|
          g.stop(0, Color('#000'));
          g.stop(1, Color('#fff'));
        };
        parent.from = 135deg;
        parent.to = 405deg;
        parent.direction = 'ccw';
        parent.spread = 'repeat';
        let child = parent.inherit('c');
      `);
      const child = result.gradients.find((g) => g.id === 'c');
      expect(child).toBeDefined();
      expect(child!.type).toBe('conic');
      expect(child!.from).toBeCloseTo((135 * Math.PI) / 180);
      expect(child!.to).toBeCloseTo((405 * Math.PI) / 180);
      expect(child!.direction).toBe('ccw');
      expect(child!.spread).toBe('repeat');
    });
  });

  describe('ConicGradient properties', () => {
    it('from/to default to 0 and 2*PI', () => {
      const result = compile(`
        let g = ConicGradient('cg', 50, 50) {|g|
          g.stop(0, Color('#000'));
          g.stop(1, Color('#fff'));
        };
      `);
      expect(result.gradients[0].from).toBeCloseTo(0);
      expect(result.gradients[0].to).toBeCloseTo(2 * Math.PI);
    });

    it('from/to readable after set with angle unit', () => {
      const result = compile(`
        let g = ConicGradient('cg', 50, 50) {|g|
          g.stop(0, Color('#000'));
          g.stop(1, Color('#fff'));
        };
        g.from = 135deg;
        g.to = 405deg;
      `);
      expect(result.gradients[0].from).toBeCloseTo((135 * Math.PI) / 180);
      expect(result.gradients[0].to).toBeCloseTo((405 * Math.PI) / 180);
    });

    it('direction defaults to cw', () => {
      const result = compile(`
        let g = ConicGradient('cg', 50, 50) {|g|
          g.stop(0, Color('#000'));
          g.stop(1, Color('#fff'));
        };
      `);
      expect(result.gradients[0].direction).toBe('cw');
    });

    it('spread defaults to clamp', () => {
      const result = compile(`
        let g = ConicGradient('cg', 50, 50) {|g|
          g.stop(0, Color('#000'));
          g.stop(1, Color('#fff'));
        };
      `);
      expect(result.gradients[0].spread).toBe('clamp');
    });

    it('invalid direction throws error', () => {
      expect(() =>
        compile(`
        let g = ConicGradient('cg', 50, 50) {|g|
          g.stop(0, Color('#000'));
        };
        g.direction = 'up';
      `),
      ).toThrow(/ConicGradient direction must be 'cw' or 'ccw'/);
    });

    it('invalid spread throws error', () => {
      expect(() =>
        compile(`
        let g = ConicGradient('cg', 50, 50) {|g|
          g.stop(0, Color('#000'));
        };
        g.spread = 'mirror';
      `),
      ).toThrow(/ConicGradient spread must be 'clamp', 'repeat', or 'transparent'/);
    });

    it('partial sweep with from/to', () => {
      const result = compile(`
        let g = ConicGradient('gauge', 100, 100) {|g|
          g.stop(0, Color('#2a9d8f'));
          g.stop(1, Color('#e63946'));
        };
        g.from = 135deg;
        g.to = 405deg;
      `);
      const grad = result.gradients[0];
      expect(grad.from).toBeCloseTo((135 * Math.PI) / 180);
      expect(grad.to).toBeCloseTo((405 * Math.PI) / 180);
    });

    it('bare number on from/to throws with helpful message', () => {
      expect(() =>
        compile(`
        let g = ConicGradient('cg', 50, 50) {|g|
          g.stop(0, Color('#000'));
        };
        g.from = 135;
      `),
      ).toThrow(/requires an angle unit.*135deg/);
    });

    it('an Angle variable is accepted on from/to (first-class Angle)', () => {
      const result = compile(`
        let g = ConicGradient('cg', 50, 50) {|g|
          g.stop(0, Color('#000'));
          g.stop(1, Color('#fff'));
        };
        let start = 135deg;
        g.from = start;
        g.to = calc(start + 270deg);
      `);
      expect(result.gradients[0].from).toBeCloseTo((135 * Math.PI) / 180);
      expect(result.gradients[0].to).toBeCloseTo((405 * Math.PI) / 180);
    });

    it('computed expression without unit is accepted', () => {
      const result = compile(`
        let g = ConicGradient('cg', 50, 50) {|g|
          g.stop(0, Color('#000'));
          g.stop(1, Color('#fff'));
        };
        g.from = rad(135);
      `);
      expect(result.gradients[0].from).toBeCloseTo((135 * Math.PI) / 180);
    });
  });

  describe('ConicGradient output', () => {
    it('output type is conic', () => {
      const result = compile(`
        let g = ConicGradient('cg', 100, 100) {|g|
          g.stop(0, Color('#000'));
          g.stop(1, Color('#fff'));
        };
      `);
      expect(result.gradients[0].type).toBe('conic');
    });

    it('stops preserved in output', () => {
      const result = compile(`
        let g = ConicGradient('cg', 100, 100) {|g|
          g.stop(0, Color('#ff0000'));
          g.stop(0.5, Color('#00ff00'));
          g.stop(1, Color('#0000ff'));
        };
      `);
      expect(result.gradients[0].stops).toHaveLength(3);
      expect(result.gradients[0].stops[0].offset).toBe(0);
      expect(result.gradients[0].stops[2].offset).toBe(1);
    });

    it('from/to/direction/spread in output', () => {
      const result = compile(`
        let g = ConicGradient('cg', 100, 100) {|g|
          g.stop(0, Color('#000'));
          g.stop(1, Color('#fff'));
        };
        g.from = 90deg;
        g.to = 270deg;
        g.direction = 'ccw';
        g.spread = 'transparent';
      `);
      const grad = result.gradients[0];
      expect(grad.from).toBeCloseTo(Math.PI / 2);
      expect(grad.to).toBeCloseTo((3 * Math.PI) / 2);
      expect(grad.direction).toBe('ccw');
      expect(grad.spread).toBe('transparent');
    });

    it('oklch preserved on stops via stopsWithOklch', () => {
      const result = compile(`
        let g = ConicGradient('cg', 100, 100) {|g|
          g.stop(0, Color('#ff0000'));
          g.stop(1, Color('#0000ff'));
        };
      `);
      const grad = result.gradients[0];
      expect(grad.stopsWithOklch).toBeDefined();
      expect(grad.stopsWithOklch!.length).toBe(2);
    });

    it('inherits interpolation/steps', () => {
      const result = compile(`
        let g = ConicGradient('cg', 100, 100) {|g|
          g.stop(0, Color('#ff0000'));
          g.stop(1, Color('#0000ff'));
        };
        g.interpolation = 'oklch';
        g.steps = 20;
      `);
      const grad = result.gradients[0];
      // oklch interpolation causes stop expansion
      expect(grad.stops.length).toBeGreaterThan(2);
    });
  });

  describe('ConicGradient rendering', () => {
    it('conic gradient is usable as fill', () => {
      const result = compile(`
        let g = ConicGradient('wheel', 100, 100) {|g|
          g.stop(0, Color('#e63946'));
          g.stop(0.33, Color('#2a9d8f'));
          g.stop(0.66, Color('#264653'));
          g.stop(1, Color('#e63946'));
        };
        define PathLayer('bg') \${ fill: g; stroke: none; }
        layer('bg').apply { M 0 0 L 200 0 L 200 200 L 0 200 Z }
      `);
      const bgLayer = result.layers.find((l) => l.name === 'bg');
      expect(bgLayer?.styles.fill).toBe('url(#wheel)');
    });

    it('negative angle with unit accepted', () => {
      const result = compile(`
        let g = ConicGradient('spot', 100, 100) {|g|
          g.stop(0, Color('#000'));
          g.stop(1, Color('#fff'));
        };
        g.from = -15deg;
        g.to = 15deg;
      `);
      expect(result.gradients[0].from).toBeCloseTo((-15 * Math.PI) / 180);
      expect(result.gradients[0].to).toBeCloseTo((15 * Math.PI) / 180);
    });

    it('pi unit accepted for angles', () => {
      const result = compile(`
        let g = ConicGradient('cg', 100, 100) {|g|
          g.stop(0, Color('#000'));
          g.stop(1, Color('#fff'));
        };
        g.from = 0.5pi;
        g.to = 1.5pi;
      `);
      expect(result.gradients[0].from).toBeCloseTo(Math.PI / 2);
      expect(result.gradients[0].to).toBeCloseTo(1.5 * Math.PI);
    });

    it('rad unit accepted for angles', () => {
      const result = compile(`
        let g = ConicGradient('cg', 100, 100) {|g|
          g.stop(0, Color('#000'));
          g.stop(1, Color('#fff'));
        };
        g.from = 1.5708rad;
        g.to = 4.7124rad;
      `);
      expect(result.gradients[0].from).toBeCloseTo(Math.PI / 2, 2);
      expect(result.gradients[0].to).toBeCloseTo((3 * Math.PI) / 2, 2);
    });
  });

  describe('Pattern and ConicGradient cross-type duplicate ID checks', () => {
    it('duplicate ID across Pattern and Mask throws error', () => {
      expect(() =>
        compile(`
        let m = Mask('shared');
        let dot = @{ circle(5, 5, 2); };
        let p = Pattern('shared', 0, 0, 10, 10) {|p| p.append(dot); };
      `),
      ).toThrow(/Duplicate defs ID 'shared'/);
    });

    it('duplicate ID across Pattern and Gradient throws error', () => {
      expect(() =>
        compile(`
        let g = LinearGradient('shared', 0, 0, 1, 0);
        let dot = @{ circle(5, 5, 2); };
        let p = Pattern('shared', 0, 0, 10, 10) {|p| p.append(dot); };
      `),
      ).toThrow(/Duplicate defs ID 'shared'/);
    });

    it('duplicate ID across ConicGradient and Pattern throws error', () => {
      expect(() =>
        compile(`
        let dot = @{ circle(5, 5, 2); };
        let p = Pattern('shared', 0, 0, 10, 10) {|p| p.append(dot); };
        let g = ConicGradient('shared', 50, 50) {|g| g.stop(0, Color('#000')); };
      `),
      ).toThrow(/Duplicate defs ID 'shared'/);
    });

    it('wrong argument count for Pattern throws error', () => {
      expect(() =>
        compile(`
        let p = Pattern('bad', 0, 0);
      `),
      ).toThrow(/Pattern\(\) expects 5 arguments/);
    });

    it('wrong argument count for ConicGradient throws error', () => {
      expect(() =>
        compile(`
        let g = ConicGradient('bad', 50);
      `),
      ).toThrow(/ConicGradient\(\) expects 3 arguments/);
    });
  });

  describe('ConicGradient innerRadius', () => {
    it('defaults to 0', () => {
      const result = compile(`
        let g = ConicGradient('cg', 100, 100) {|g|
          g.stop(0, Color('#000'));
          g.stop(1, Color('#fff'));
        };
      `);
      expect(result.gradients[0].innerRadius).toBe(0);
    });

    it('is settable via assignment', () => {
      const result = compile(`
        let g = ConicGradient('cg', 100, 100) {|g|
          g.stop(0, Color('#000'));
          g.stop(1, Color('#fff'));
        };
        g.innerRadius = 30;
      `);
      expect(result.gradients[0].innerRadius).toBe(30);
    });

    it('is readable via log', () => {
      const result = compile(`
        let g = ConicGradient('cg', 100, 100) {|g|
          g.stop(0, Color('#000'));
          g.stop(1, Color('#fff'));
        };
        g.innerRadius = 25;
        log(g.innerRadius);
      `);
      expect(result.logs[0].parts[0].value).toBe('25');
    });

    it('rejects negative values', () => {
      expect(() =>
        compile(`
        let g = ConicGradient('cg', 100, 100) {|g|
          g.stop(0, Color('#000'));
        };
        g.innerRadius = -10;
      `),
      ).toThrow(/innerRadius must be >= 0/);
    });

    it('rejects non-number values', () => {
      expect(() =>
        compile(`
        let g = ConicGradient('cg', 100, 100) {|g|
          g.stop(0, Color('#000'));
        };
        g.innerRadius = 'big';
      `),
      ).toThrow(/innerRadius must be a number/);
    });

    it('propagates via inherit', () => {
      const result = compile(`
        let parent = ConicGradient('p', 100, 100) {|g|
          g.stop(0, Color('#000'));
          g.stop(1, Color('#fff'));
        };
        parent.innerRadius = 20;
        let child = parent.inherit('c');
        log(child.innerRadius);
      `);
      expect(result.logs[0].parts[0].value).toBe('20');
      const child = result.gradients.find((g) => g.id === 'c');
      expect(child!.innerRadius).toBe(20);
    });

    it('is present in output', () => {
      const result = compile(`
        let g = ConicGradient('cg', 100, 100) {|g|
          g.stop(0, Color('#000'));
          g.stop(1, Color('#fff'));
        };
        g.innerRadius = 40;
      `);
      const grad = result.gradients[0];
      expect(grad).toHaveProperty('innerRadius');
      expect(grad.innerRadius).toBe(40);
    });

    it('combined: innerRadius + partial sweep', () => {
      const result = compile(`
        let g = ConicGradient('ring', 100, 100) {|g|
          g.stop(0, Color('#2a9d8f'));
          g.stop(1, Color('#e63946'));
        };
        g.from = 135deg;
        g.to = 405deg;
        g.innerRadius = 30;
      `);
      const grad = result.gradients[0];
      expect(grad.innerRadius).toBe(30);
      expect(grad.from).toBeCloseTo((135 * Math.PI) / 180);
      expect(grad.to).toBeCloseTo((405 * Math.PI) / 180);
    });

    it('combined: innerRadius + spread transparent', () => {
      const result = compile(`
        let g = ConicGradient('ring', 100, 100) {|g|
          g.stop(0, Color('#000'));
          g.stop(1, Color('#fff'));
        };
        g.spread = 'transparent';
        g.innerRadius = 15;
      `);
      const grad = result.gradients[0];
      expect(grad.innerRadius).toBe(15);
      expect(grad.spread).toBe('transparent');
    });

    it('combined: innerRadius + direction ccw', () => {
      const result = compile(`
        let g = ConicGradient('ring', 100, 100) {|g|
          g.stop(0, Color('#000'));
          g.stop(1, Color('#fff'));
        };
        g.direction = 'ccw';
        g.innerRadius = 50;
      `);
      const grad = result.gradients[0];
      expect(grad.innerRadius).toBe(50);
      expect(grad.direction).toBe('ccw');
    });
  });

  describe('ConicGradient innerFill', () => {
    it('defaults to transparent', () => {
      const result = compile(`
        let g = ConicGradient('cg', 100, 100) {|g|
          g.stop(0, Color('#000'));
          g.stop(1, Color('#fff'));
        };
      `);
      expect(result.gradients[0].innerFill).toBe('transparent');
    });

    it('accepts transparent', () => {
      const result = compile(`
        let g = ConicGradient('cg', 100, 100) {|g|
          g.stop(0, Color('#000'));
          g.stop(1, Color('#fff'));
        };
        g.innerFill = 'transparent';
      `);
      expect(result.gradients[0].innerFill).toBe('transparent');
    });

    it('accepts center', () => {
      const result = compile(`
        let g = ConicGradient('cg', 100, 100) {|g|
          g.stop(0, Color('#000'));
          g.stop(1, Color('#fff'));
        };
        g.innerFill = 'center';
      `);
      expect(result.gradients[0].innerFill).toBe('center');
    });

    it('accepts transparent-blend', () => {
      const result = compile(`
        let g = ConicGradient('cg', 100, 100) {|g|
          g.stop(0, Color('#000'));
          g.stop(1, Color('#fff'));
        };
        g.innerFill = 'transparent-blend';
      `);
      expect(result.gradients[0].innerFill).toBe('transparent-blend');
    });

    it('accepts a Color value', () => {
      const result = compile(`
        let g = ConicGradient('cg', 100, 100) {|g|
          g.stop(0, Color('#000'));
          g.stop(1, Color('#fff'));
        };
        g.innerFill = Color('#e63946');
      `);
      expect(result.gradients[0].innerFill).toBe('#e63946');
    });

    it('is readable via log', () => {
      const result = compile(`
        let g = ConicGradient('cg', 100, 100) {|g|
          g.stop(0, Color('#000'));
          g.stop(1, Color('#fff'));
        };
        g.innerFill = 'center';
        log(g.innerFill);
      `);
      expect(result.logs[0].parts[0].value).toBe('center');
    });

    it('rejects invalid string values', () => {
      expect(() =>
        compile(`
        let g = ConicGradient('cg', 100, 100) {|g|
          g.stop(0, Color('#000'));
        };
        g.innerFill = 'blur';
      `),
      ).toThrow(/innerFill must be 'transparent', 'transparent-blend', 'center', or a Color/);
    });

    it('rejects number values', () => {
      expect(() =>
        compile(`
        let g = ConicGradient('cg', 100, 100) {|g|
          g.stop(0, Color('#000'));
        };
        g.innerFill = 42;
      `),
      ).toThrow(/innerFill must be 'transparent', 'transparent-blend', 'center', or a Color/);
    });

    it('propagates via inherit', () => {
      const result = compile(`
        let parent = ConicGradient('p', 100, 100) {|g|
          g.stop(0, Color('#000'));
          g.stop(1, Color('#fff'));
        };
        parent.innerFill = 'center';
        let child = parent.inherit('c');
        log(child.innerFill);
      `);
      expect(result.logs[0].parts[0].value).toBe('center');
    });

    it('combined: innerRadius + innerFill center', () => {
      const result = compile(`
        let g = ConicGradient('cg', 100, 100) {|g|
          g.stop(0, Color('#2a9d8f'));
          g.stop(1, Color('#e63946'));
        };
        g.innerRadius = 30;
        g.innerFill = 'center';
      `);
      const grad = result.gradients[0];
      expect(grad.innerRadius).toBe(30);
      expect(grad.innerFill).toBe('center');
    });

    it('combined: innerRadius + innerFill Color', () => {
      const result = compile(`
        let g = ConicGradient('cg', 100, 100) {|g|
          g.stop(0, Color('#000'));
          g.stop(1, Color('#fff'));
        };
        g.innerRadius = 20;
        g.innerFill = Color('#1a1a2e');
      `);
      const grad = result.gradients[0];
      expect(grad.innerRadius).toBe(20);
      expect(grad.innerFill).toBe('#1a1a2e');
    });
  });

  // ==========================================================================
  // MeshGradient
  // ==========================================================================

  describe('MeshGradient constructor', () => {
    it('creates with correct type and dimensions', () => {
      const result = compile(`
        let g = MeshGradient('mg', 200, 100, 3, 2) {|g|
          g.colorAll(Color('#ff0000'));
        };
      `);
      expect(result.gradients).toHaveLength(1);
      expect(result.gradients[0].type).toBe('mesh');
      expect(result.gradients[0].id).toBe('mg');
      expect(result.gradients[0].meshWidth).toBe(200);
      expect(result.gradients[0].meshHeight).toBe(100);
    });

    it('validates 5 arguments are required', () => {
      expect(() => compile(`let g = MeshGradient('m', 200, 100, 3);`)).toThrow(/MeshGradient\(\) expects 5 arguments/);
    });

    it('validates id is a string', () => {
      expect(() => compile(`let g = MeshGradient(123, 200, 100, 3, 2);`)).toThrow(/first argument must be a string/);
    });

    it('validates width/height/cols/rows are numbers', () => {
      expect(() => compile(`let g = MeshGradient('m', 'w', 100, 3, 2);`)).toThrow(/must be numbers/);
    });

    it('rejects cols < 2', () => {
      expect(() => compile(`let g = MeshGradient('m', 200, 100, 1, 2);`)).toThrow(/cols and rows must be >= 2/);
    });

    it('rejects rows < 2', () => {
      expect(() => compile(`let g = MeshGradient('m', 200, 100, 3, 1);`)).toThrow(/cols and rows must be >= 2/);
    });

    it('duplicate ID throws error', () => {
      expect(() =>
        compile(`
        let a = MeshGradient('dup', 200, 100, 3, 2) {|g| g.colorAll(Color('#000')); };
        let b = MeshGradient('dup', 200, 100, 3, 2) {|g| g.colorAll(Color('#fff')); };
      `),
      ).toThrow(/Duplicate defs ID 'dup'/);
    });
  });

  describe('MeshGradient grid initialization', () => {
    it('grid has correct dimensions in output', () => {
      const result = compile(`
        let g = MeshGradient('mg', 200, 100, 3, 2) {|g|
          g.colorAll(Color('#ff0000'));
        };
      `);
      const grid = result.gradients[0].meshGrid!;
      expect(grid).toHaveLength(2); // 2 rows
      expect(grid[0]).toHaveLength(3); // 3 cols
      expect(grid[1]).toHaveLength(3);
    });

    it('points are evenly spaced', () => {
      const result = compile(`
        let g = MeshGradient('mg', 200, 100, 3, 2) {|g|
          g.colorAll(Color('#000'));
        };
      `);
      const grid = result.gradients[0].meshGrid!;
      // Row 0: y=0, Row 1: y=100
      expect(grid[0][0].y).toBe(0);
      expect(grid[1][0].y).toBe(100);
      // Col 0: x=0, Col 1: x=100, Col 2: x=200
      expect(grid[0][0].x).toBe(0);
      expect(grid[0][1].x).toBe(100);
      expect(grid[0][2].x).toBe(200);
    });

    it('default color is transparent', () => {
      const result = compile(`
        let g = MeshGradient('mg', 100, 100, 2, 2) {|g| };
      `);
      const grid = result.gradients[0].meshGrid!;
      expect(grid[0][0].color).toMatch(/oklch\(0 0 0 \/ 0\)/);
    });
  });

  describe('MeshGradient .colorAll()', () => {
    it('sets all points to given color', () => {
      const result = compile(`
        let g = MeshGradient('mg', 100, 100, 2, 2) {|g|
          g.colorAll(Color('#ff0000'));
        };
      `);
      const grid = result.gradients[0].meshGrid!;
      for (const row of grid) {
        for (const pt of row) {
          expect(pt.color).toBeDefined();
          expect(pt.color).not.toBe('oklch(0 0 0 / 0)');
        }
      }
    });

    it('validates ColorValue argument', () => {
      expect(() =>
        compile(`
        let g = MeshGradient('mg', 100, 100, 2, 2) {|g|
          g.colorAll(42);
        };
      `),
      ).toThrow(/must be a Color value/);
    });

    it('only available on mesh gradients', () => {
      expect(() =>
        compile(`
        let g = LinearGradient('lg', 0, 0, 1, 1) {|g|
          g.colorAll(Color('#000'));
        };
      `),
      ).toThrow(/colorAll\(\) is only available on MeshGradient/);
    });
  });

  describe('MeshGradient .getPoint()', () => {
    it('returns a MeshPointValue that can be colored', () => {
      const result = compile(`
        let g = MeshGradient('mg', 100, 100, 2, 2) {|g|
          let pt = g.getPoint(0, 0);
          pt.color = Color('#ff0000');
        };
      `);
      const grid = result.gradients[0].meshGrid!;
      // Point (0,0) should have the red color
      expect(grid[0][0].color).toBeDefined();
      expect(grid[0][0].color).not.toBe('oklch(0 0 0 / 0)');
      // Other point should still be transparent
      expect(grid[0][1].color).toBe('oklch(0 0 0 / 0)');
    });

    it('validates 2 arguments', () => {
      expect(() =>
        compile(`
        let g = MeshGradient('mg', 100, 100, 2, 2) {|g|
          let pt = g.getPoint(0);
        };
      `),
      ).toThrow(/expects 2 arguments/);
    });

    it('bounds checks row', () => {
      expect(() =>
        compile(`
        let g = MeshGradient('mg', 100, 100, 2, 2) {|g|
          let pt = g.getPoint(5, 0);
        };
      `),
      ).toThrow(/out of bounds/);
    });

    it('bounds checks col', () => {
      expect(() =>
        compile(`
        let g = MeshGradient('mg', 100, 100, 2, 2) {|g|
          let pt = g.getPoint(0, 5);
        };
      `),
      ).toThrow(/out of bounds/);
    });

    it('only available on mesh gradients', () => {
      expect(() =>
        compile(`
        let g = LinearGradient('lg', 0, 0, 1, 1) {|g|
          let pt = g.getPoint(0, 0);
        };
      `),
      ).toThrow(/getPoint\(\) is only available on MeshGradient/);
    });
  });

  describe('MeshGradient .getRow()', () => {
    it('returns iterable array of correct length', () => {
      const result = compile(`
        let g = MeshGradient('mg', 100, 100, 3, 2) {|g|
          let row = g.getRow(0);
          for ([pt, i] in row) {
            pt.color = Color('#ff0000');
          }
        };
      `);
      const grid = result.gradients[0].meshGrid!;
      // All 3 points in row 0 should be colored
      for (let c = 0; c < 3; c++) {
        expect(grid[0][c].color).not.toMatch(/oklch\(0 0 0 \/ 0\)/);
      }
      // Row 1 should still be transparent
      expect(grid[1][0].color).toMatch(/oklch\(0 0 0 \/ 0\)/);
    });

    it('bounds checks row index', () => {
      expect(() =>
        compile(`
        let g = MeshGradient('mg', 100, 100, 2, 2) {|g|
          let row = g.getRow(5);
        };
      `),
      ).toThrow(/out of bounds/);
    });
  });

  describe('MeshGradient .getCol()', () => {
    it('returns iterable array of correct length', () => {
      const result = compile(`
        let g = MeshGradient('mg', 100, 100, 3, 2) {|g|
          let col = g.getCol(1);
          for ([pt, i] in col) {
            pt.color = Color('#00ff00');
          }
        };
      `);
      const grid = result.gradients[0].meshGrid!;
      // Col 1 across both rows should be colored
      expect(grid[0][1].color).not.toMatch(/oklch\(0 0 0 \/ 0\)/);
      expect(grid[1][1].color).not.toMatch(/oklch\(0 0 0 \/ 0\)/);
      // Other cols should be transparent
      expect(grid[0][0].color).toMatch(/oklch\(0 0 0 \/ 0\)/);
    });

    it('bounds checks col index', () => {
      expect(() =>
        compile(`
        let g = MeshGradient('mg', 100, 100, 2, 2) {|g|
          let col = g.getCol(5);
        };
      `),
      ).toThrow(/out of bounds/);
    });
  });

  describe('MeshPointValue properties and methods', () => {
    it('.x and .y readable', () => {
      const result = compile(`
        let g = MeshGradient('mg', 200, 100, 3, 2) {|g|
          let pt = g.getPoint(0, 1);
          log(pt.x);
          log(pt.y);
        };
      `);
      // pt at row 0, col 1 → x = 100, y = 0
      expect(result.logs).toHaveLength(2);
    });

    it('.color get returns ColorValue', () => {
      const result = compile(`
        let g = MeshGradient('mg', 100, 100, 2, 2) {|g|
          g.colorAll(Color('#ff0000'));
          let pt = g.getPoint(0, 0);
          let c = pt.color;
          log(c.hex);
        };
      `);
      expect(result.logs).toHaveLength(1);
    });

    it('.color set updates the grid point', () => {
      const result = compile(`
        let g = MeshGradient('mg', 100, 100, 2, 2) {|g|
          let pt = g.getPoint(1, 1);
          pt.color = Color('#0000ff');
        };
      `);
      const grid = result.gradients[0].meshGrid!;
      expect(grid[1][1].color).not.toMatch(/oklch\(0 0 0 \/ 0\)/);
    });

    it('.color set validates ColorValue', () => {
      expect(() =>
        compile(`
        let g = MeshGradient('mg', 100, 100, 2, 2) {|g|
          let pt = g.getPoint(0, 0);
          pt.color = 'red';
        };
      `),
      ).toThrow(/color must be a Color value/);
    });

    it('.translate() moves point position', () => {
      const result = compile(`
        let g = MeshGradient('mg', 100, 100, 2, 2) {|g|
          g.colorAll(Color('#000'));
          let pt = g.getPoint(0, 0);
          pt.translate(10, -5);
        };
      `);
      const grid = result.gradients[0].meshGrid!;
      expect(grid[0][0].x).toBe(10); // 0 + 10
      expect(grid[0][0].y).toBe(-5); // 0 + (-5)
    });

    it('mutations propagate to gradient output', () => {
      const result = compile(`
        let g = MeshGradient('mg', 100, 100, 2, 2) {|g|
          let pt = g.getPoint(0, 1);
          pt.color = Color('#00ff00');
          pt.translate(5, 5);
        };
      `);
      const grid = result.gradients[0].meshGrid!;
      expect(grid[0][1].x).toBe(105); // 100 + 5
      expect(grid[0][1].y).toBe(5); // 0 + 5
      expect(grid[0][1].color).not.toMatch(/oklch\(0 0 0 \/ 0\)/);
    });
  });

  describe('MeshGradient properties', () => {
    it('.cols and .rows readable', () => {
      const result = compile(`
        let g = MeshGradient('mg', 200, 100, 4, 3) {|g|
          g.colorAll(Color('#000'));
        };
        log(g.cols);
        log(g.rows);
      `);
      expect(result.logs).toHaveLength(2);
    });

    it('.width and .height readable', () => {
      const result = compile(`
        let g = MeshGradient('mg', 200, 100, 3, 2) {|g|
          g.colorAll(Color('#000'));
        };
        log(g.width);
        log(g.height);
      `);
      expect(result.logs).toHaveLength(2);
    });

    it('.id readable', () => {
      const result = compile(`
        let g = MeshGradient('mg', 100, 100, 2, 2) {|g|
          g.colorAll(Color('#000'));
        };
        log(g.id);
      `);
      expect(result.logs).toHaveLength(1);
    });

    it('.interpolation settable', () => {
      const result = compile(`
        let g = MeshGradient('mg', 100, 100, 2, 2) {|g|
          g.colorAll(Color('#000'));
        };
        g.interpolation = 'oklch';
      `);
      expect(result.gradients[0]).toBeDefined();
    });
  });

  describe('MeshGradient output', () => {
    it('output has type mesh with meshGrid', () => {
      const result = compile(`
        let g = MeshGradient('mg', 200, 100, 3, 2) {|g|
          g.colorAll(Color('#ff0000'));
        };
      `);
      const grad = result.gradients[0];
      expect(grad.type).toBe('mesh');
      expect(grad.meshGrid).toBeDefined();
      expect(grad.meshWidth).toBe(200);
      expect(grad.meshHeight).toBe(100);
    });

    it('meshGrid has correct structure', () => {
      const result = compile(`
        let g = MeshGradient('mg', 100, 100, 2, 2) {|g|
          g.colorAll(Color('#ff0000'));
        };
      `);
      const grid = result.gradients[0].meshGrid!;
      expect(grid).toHaveLength(2);
      expect(grid[0]).toHaveLength(2);
      expect(grid[0][0]).toHaveProperty('x');
      expect(grid[0][0]).toHaveProperty('y');
      expect(grid[0][0]).toHaveProperty('color');
    });
  });

  describe('MeshGradient programmatic use', () => {
    it('for-loop over getRow() colors row', () => {
      const result = compile(`
        let g = MeshGradient('mg', 100, 100, 3, 2) {|g|
          let row = g.getRow(0);
          for ([pt, i] in row) {
            pt.color = Color('#ff0000');
          }
        };
      `);
      const grid = result.gradients[0].meshGrid!;
      for (let c = 0; c < 3; c++) {
        expect(grid[0][c].color).not.toMatch(/oklch\(0 0 0 \/ 0\)/);
      }
    });

    it('fill auto-wraps to url(#id)', () => {
      const result = compile(`
        let g = MeshGradient('mg', 100, 100, 2, 2) {|g|
          g.colorAll(Color('#ff0000'));
        };
        define PathLayer('bg') \${ fill: g; }
        layer('bg').apply { rect(0, 0, 100, 100); }
      `);
      expect(result.layers[0].styles.fill).toBe('url(#mg)');
    });
  });

  describe('MeshGradient log formatting', () => {
    it('shows MeshGradient(id, cols×rows)', () => {
      const result = compile(`
        let g = MeshGradient('fire', 200, 200, 3, 2) {|g|
          g.colorAll(Color('#000'));
        };
        log(g);
      `);
      expect(result.logs).toHaveLength(1);
    });
  });

  // ==========================================================================
  // FreeformGradient
  // ==========================================================================

  describe('FreeformGradient constructor', () => {
    it('creates with correct type and dimensions', () => {
      const result = compile(`
        let g = FreeformGradient('fg', 400, 300) {|g|
          g.point(50, 50, Color('#e63946'));
          g.point(350, 80, Color('#f4a261'));
        };
      `);
      expect(result.gradients).toHaveLength(1);
      expect(result.gradients[0].type).toBe('freeform');
      expect(result.gradients[0].id).toBe('fg');
      expect(result.gradients[0].freeformWidth).toBe(400);
      expect(result.gradients[0].freeformHeight).toBe(300);
    });

    it('validates 3 arguments are required', () => {
      expect(() => compile(`let g = FreeformGradient('f', 200);`)).toThrow(/FreeformGradient\(\) expects 3 arguments/);
    });

    it('validates id is a string', () => {
      expect(() => compile(`let g = FreeformGradient(42, 200, 100);`)).toThrow(/first argument must be a string/);
    });

    it('validates width/height are numbers', () => {
      expect(() => compile(`let g = FreeformGradient('f', 'w', 100);`)).toThrow(/must be numbers/);
    });

    it('duplicate ID throws error', () => {
      expect(() =>
        compile(`
        let a = FreeformGradient('dup', 200, 100) {|g| g.point(0, 0, Color('#000')); };
        let b = FreeformGradient('dup', 200, 100) {|g| g.point(0, 0, Color('#fff')); };
      `),
      ).toThrow(/Duplicate defs ID 'dup'/);
    });
  });

  describe('FreeformGradient .point()', () => {
    it('adds points', () => {
      const result = compile(`
        let g = FreeformGradient('fg', 400, 300) {|g|
          g.point(50, 50, Color('#e63946'));
          g.point(350, 80, Color('#f4a261'));
          g.point(200, 250, Color('#2a9d8f'));
        };
      `);
      const pts = result.gradients[0].freeformPoints!;
      expect(pts).toHaveLength(3);
      expect(pts[0].x).toBe(50);
      expect(pts[0].y).toBe(50);
    });

    it('validates 3 arguments', () => {
      expect(() =>
        compile(`
        let g = FreeformGradient('fg', 200, 100) {|g|
          g.point(50, 50);
        };
      `),
      ).toThrow(/expects 3 arguments/);
    });

    it('validates x/y are numbers', () => {
      expect(() =>
        compile(`
        let g = FreeformGradient('fg', 200, 100) {|g|
          g.point('a', 50, Color('#000'));
        };
      `),
      ).toThrow(/must be numbers/);
    });

    it('validates color is ColorValue', () => {
      expect(() =>
        compile(`
        let g = FreeformGradient('fg', 200, 100) {|g|
          g.point(50, 50, '#000');
        };
      `),
      ).toThrow(/must be a Color value/);
    });

    it('only available on freeform gradients', () => {
      expect(() =>
        compile(`
        let g = LinearGradient('lg', 0, 0, 1, 1) {|g|
          g.point(50, 50, Color('#000'));
        };
      `),
      ).toThrow(/point\(\) is only available on FreeformGradient/);
    });
  });

  describe('FreeformGradient .falloff', () => {
    it('defaults to 2.0', () => {
      const result = compile(`
        let g = FreeformGradient('fg', 200, 100) {|g|
          g.point(50, 50, Color('#000'));
          g.point(150, 50, Color('#fff'));
        };
      `);
      expect(result.gradients[0].falloff).toBe(2.0);
    });

    it('is settable', () => {
      const result = compile(`
        let g = FreeformGradient('fg', 200, 100) {|g|
          g.point(50, 50, Color('#000'));
          g.point(150, 50, Color('#fff'));
        };
        g.falloff = 3.5;
      `);
      expect(result.gradients[0].falloff).toBe(3.5);
    });

    it('rejects non-number', () => {
      expect(() =>
        compile(`
        let g = FreeformGradient('fg', 200, 100) {|g|
          g.point(50, 50, Color('#000'));
        };
        g.falloff = 'high';
      `),
      ).toThrow(/falloff must be a number/);
    });

    it('rejects <= 0', () => {
      expect(() =>
        compile(`
        let g = FreeformGradient('fg', 200, 100) {|g|
          g.point(50, 50, Color('#000'));
        };
        g.falloff = 0;
      `),
      ).toThrow(/falloff must be positive/);
    });

    it('only settable on freeform gradients', () => {
      expect(() =>
        compile(`
        let g = ConicGradient('cg', 50, 50) {|g|
          g.stop(0, Color('#000'));
        };
        g.falloff = 2.5;
      `),
      ).toThrow(/falloff.*only available on FreeformGradient/);
    });
  });

  describe('FreeformGradient output', () => {
    it('output has type freeform with points', () => {
      const result = compile(`
        let g = FreeformGradient('fg', 400, 300) {|g|
          g.point(50, 50, Color('#e63946'));
          g.point(350, 80, Color('#f4a261'));
        };
      `);
      const grad = result.gradients[0];
      expect(grad.type).toBe('freeform');
      expect(grad.freeformPoints).toBeDefined();
      expect(grad.freeformWidth).toBe(400);
      expect(grad.freeformHeight).toBe(300);
      expect(grad.falloff).toBe(2.0);
    });

    it('freeformPoints structure is correct', () => {
      const result = compile(`
        let g = FreeformGradient('fg', 200, 100) {|g|
          g.point(10, 20, Color('#ff0000'));
        };
      `);
      const pts = result.gradients[0].freeformPoints!;
      expect(pts[0]).toHaveProperty('x', 10);
      expect(pts[0]).toHaveProperty('y', 20);
      expect(pts[0]).toHaveProperty('color');
    });
  });

  describe('FreeformGradient properties', () => {
    it('.width and .height readable', () => {
      const result = compile(`
        let g = FreeformGradient('fg', 400, 300) {|g|
          g.point(50, 50, Color('#000'));
          g.point(350, 80, Color('#fff'));
        };
        log(g.width);
        log(g.height);
      `);
      expect(result.logs).toHaveLength(2);
    });

    it('.id readable', () => {
      const result = compile(`
        let g = FreeformGradient('fg', 200, 100) {|g|
          g.point(50, 50, Color('#000'));
          g.point(150, 50, Color('#fff'));
        };
        log(g.id);
      `);
      expect(result.logs).toHaveLength(1);
    });

    it('.falloff readable', () => {
      const result = compile(`
        let g = FreeformGradient('fg', 200, 100) {|g|
          g.point(50, 50, Color('#000'));
          g.point(150, 50, Color('#fff'));
        };
        log(g.falloff);
      `);
      expect(result.logs).toHaveLength(1);
    });
  });

  describe('FreeformGradient programmatic use', () => {
    it('multiple points in trailing block', () => {
      const result = compile(`
        let g = FreeformGradient('fg', 200, 200) {|g|
          g.point(0, 0, Color('#ff0000'));
          g.point(50, 50, Color('#00ff00'));
          g.point(100, 100, Color('#0000ff'));
          g.point(150, 150, Color('#ffffff'));
        };
      `);
      expect(result.gradients[0].freeformPoints).toHaveLength(4);
    });

    it('fill auto-wraps to url(#id)', () => {
      const result = compile(`
        let g = FreeformGradient('fg', 200, 100) {|g|
          g.point(50, 50, Color('#000'));
          g.point(150, 50, Color('#fff'));
        };
        define PathLayer('bg') \${ fill: g; }
        layer('bg').apply { rect(0, 0, 200, 100); }
      `);
      expect(result.layers[0].styles.fill).toBe('url(#fg)');
    });
  });

  describe('FreeformGradient validation warnings', () => {
    it('warns with < 2 points', () => {
      const result = compile(`
        let g = FreeformGradient('fg', 200, 100) {|g|
          g.point(50, 50, Color('#000'));
        };
      `);
      const warningLog = result.logs.find((l) =>
        l.parts.some((p) => typeof p.value === 'string' && p.value.includes('fewer than 2 points')),
      );
      expect(warningLog).toBeDefined();
    });
  });

  describe('FreeformGradient log formatting', () => {
    it('shows FreeformGradient(id, N points)', () => {
      const result = compile(`
        let g = FreeformGradient('nebula', 200, 100) {|g|
          g.point(50, 50, Color('#000'));
          g.point(150, 50, Color('#fff'));
        };
        log(g);
      `);
      expect(result.logs).toHaveLength(1);
    });
  });

  describe('Mesh/Freeform cross-type duplicate ID checks', () => {
    it('MeshGradient cannot reuse LinearGradient ID', () => {
      expect(() =>
        compile(`
        let lg = LinearGradient('shared', 0, 0, 1, 1) {|g| g.stop(0, Color('#000')); };
        let mg = MeshGradient('shared', 100, 100, 2, 2) {|g| g.colorAll(Color('#000')); };
      `),
      ).toThrow(/Duplicate defs ID 'shared'/);
    });

    it('FreeformGradient cannot reuse ConicGradient ID', () => {
      expect(() =>
        compile(`
        let cg = ConicGradient('shared', 50, 50) {|g| g.stop(0, Color('#000')); };
        let fg = FreeformGradient('shared', 200, 100) {|g| g.point(0, 0, Color('#000')); };
      `),
      ).toThrow(/Duplicate defs ID 'shared'/);
    });
  });

  // ── TopoGradient ───────────────────────────────────────────────────────

  describe('TopoGradient constructor', () => {
    it('creates with correct type and dimensions', () => {
      const result = compile(`
        let shore = @{ circle(0, 0, 100); closePath(); };
        let topo = TopoGradient('terrain', 400, 300) {|g|
          g.contour(shore.project(200, 150), 0.5, Color('#27ae60'));
        };
      `);
      expect(result.gradients).toHaveLength(1);
      expect(result.gradients[0].type).toBe('topo');
      expect(result.gradients[0].id).toBe('terrain');
      expect(result.gradients[0].topoWidth).toBe(400);
      expect(result.gradients[0].topoHeight).toBe(300);
    });

    it('validates 3 arguments are required', () => {
      expect(() => compile(`let g = TopoGradient('t', 200);`)).toThrow(/TopoGradient\(\) expects 3 arguments/);
    });

    it('validates id is a string', () => {
      expect(() => compile(`let g = TopoGradient(42, 200, 100);`)).toThrow(/first argument must be a string/);
    });

    it('validates width/height are numbers', () => {
      expect(() => compile(`let g = TopoGradient('t', 'w', 100);`)).toThrow(/must be numbers/);
    });

    it('duplicate ID throws error', () => {
      expect(() =>
        compile(`
        let s = @{ circle(0, 0, 50); closePath(); };
        let a = TopoGradient('dup', 200, 100) {|g| g.contour(s.project(100, 50), 0.5, Color('#000')); };
        let b = TopoGradient('dup', 200, 100) {|g| g.contour(s.project(100, 50), 0.5, Color('#fff')); };
      `),
      ).toThrow(/Duplicate defs ID 'dup'/);
    });

    it('defaults easing to linear and method to distance', () => {
      const result = compile(`
        let shore = @{ circle(0, 0, 100); closePath(); };
        let topo = TopoGradient('t', 400, 300) {|g|
          g.contour(shore.project(200, 150), 0.5, Color('#27ae60'));
        };
      `);
      expect(result.gradients[0].topoEasing).toBe('linear');
      expect(result.gradients[0].topoMethod).toBe('distance');
    });

    it('TopoGradient cannot reuse existing gradient ID', () => {
      expect(() =>
        compile(`
        let lg = LinearGradient('shared', 0, 0, 1, 1) {|g| g.stop(0, Color('#000')); };
        let s = @{ circle(0, 0, 50); closePath(); };
        let tg = TopoGradient('shared', 200, 100) {|g| g.contour(s.project(100, 50), 0.5, Color('#000')); };
      `),
      ).toThrow(/Duplicate defs ID 'shared'/);
    });
  });

  describe('TopoGradient .contour()', () => {
    it('adds contours with path, elevation, and color', () => {
      const result = compile(`
        let shore = @{ circle(0, 0, 100); closePath(); };
        let peak = @{ circle(0, 0, 40); closePath(); };
        let topo = TopoGradient('terrain', 400, 300) {|g|
          g.contour(shore.project(200, 150), 0.3, Color('#f9e79f'));
          g.contour(peak.project(200, 150), 0.8, Color('#6e2c00'));
        };
      `);
      const contours = result.gradients[0].topoContours!;
      expect(contours).toHaveLength(2);
      expect(contours[0].elevation).toBe(0.3);
      expect(contours[0].color).toBeDefined();
      expect(contours[0].path).toBeDefined();
      expect(contours[1].elevation).toBe(0.8);
    });

    it('validates 3 arguments', () => {
      expect(() =>
        compile(`
        let shore = @{ circle(0, 0, 100); closePath(); };
        let topo = TopoGradient('t', 200, 100) {|g|
          g.contour(shore.project(100, 50), 0.5);
        };
      `),
      ).toThrow(/expects 3 arguments/);
    });

    it('validates first argument is ProjectedPathValue', () => {
      expect(() =>
        compile(`
        let shore = @{ circle(0, 0, 100); closePath(); };
        let topo = TopoGradient('t', 200, 100) {|g|
          g.contour(shore, 0.5, Color('#000'));
        };
      `),
      ).toThrow(/must be a ProjectedPathValue/);
    });

    it('rejects string as first argument', () => {
      expect(() =>
        compile(`
        let topo = TopoGradient('t', 200, 100) {|g|
          g.contour('path', 0.5, Color('#000'));
        };
      `),
      ).toThrow(/must be a ProjectedPathValue/);
    });

    it('validates elevation is a number', () => {
      expect(() =>
        compile(`
        let shore = @{ circle(0, 0, 100); closePath(); };
        let topo = TopoGradient('t', 200, 100) {|g|
          g.contour(shore.project(100, 50), 'high', Color('#000'));
        };
      `),
      ).toThrow(/elevation must be a number/);
    });

    it('rejects elevation < 0', () => {
      expect(() =>
        compile(`
        let shore = @{ circle(0, 0, 100); closePath(); };
        let topo = TopoGradient('t', 200, 100) {|g|
          g.contour(shore.project(100, 50), -0.1, Color('#000'));
        };
      `),
      ).toThrow(/elevation must be between 0 and 1/);
    });

    it('rejects elevation > 1', () => {
      expect(() =>
        compile(`
        let shore = @{ circle(0, 0, 100); closePath(); };
        let topo = TopoGradient('t', 200, 100) {|g|
          g.contour(shore.project(100, 50), 1.5, Color('#000'));
        };
      `),
      ).toThrow(/elevation must be between 0 and 1/);
    });

    it('validates third argument is Color', () => {
      expect(() =>
        compile(`
        let shore = @{ circle(0, 0, 100); closePath(); };
        let topo = TopoGradient('t', 200, 100) {|g|
          g.contour(shore.project(100, 50), 0.5, '#000');
        };
      `),
      ).toThrow(/must be a Color value/);
    });

    it('rejects open paths (not ending with closePath)', () => {
      expect(() =>
        compile(`
        let openPath = @{ moveTo(0, 0); lineTo(100, 0); lineTo(100, 100); };
        let topo = TopoGradient('t', 200, 100) {|g|
          g.contour(openPath.project(50, 50), 0.5, Color('#000'));
        };
      `),
      ).toThrow(/path must be closed/);
    });

    it('only available on topo gradients', () => {
      expect(() =>
        compile(`
        let shore = @{ circle(0, 0, 100); closePath(); };
        let g = LinearGradient('lg', 0, 0, 1, 1) {|g|
          g.contour(shore.project(100, 50), 0.5, Color('#000'));
        };
      `),
      ).toThrow(/\.contour\(\) is only available on TopoGradient/);
    });

    it('contour path is serialized as absolute d-string', () => {
      const result = compile(`
        let shore = @{ circle(0, 0, 100); closePath(); };
        let topo = TopoGradient('terrain', 400, 300) {|g|
          g.contour(shore.project(200, 150), 0.5, Color('#27ae60'));
        };
      `);
      const path = result.gradients[0].topoContours![0].path;
      expect(path).toBeDefined();
      expect(typeof path).toBe('string');
      expect(path.length).toBeGreaterThan(0);
    });

    it('accumulates multiple contours at different elevations', () => {
      const result = compile(`
        let shore = @{ circle(0, 0, 100); closePath(); };
        let topo = TopoGradient('terrain', 400, 300) {|g|
          g.contour(shore.project(200, 150), 0.2, Color('#1a5276'));
          g.contour(shore.project(200, 150), 0.5, Color('#27ae60'));
          g.contour(shore.project(200, 150), 0.8, Color('#ffffff'));
        };
      `);
      expect(result.gradients[0].topoContours).toHaveLength(3);
      expect(result.gradients[0].topoContours![0].elevation).toBe(0.2);
      expect(result.gradients[0].topoContours![1].elevation).toBe(0.5);
      expect(result.gradients[0].topoContours![2].elevation).toBe(0.8);
    });
  });

  describe('TopoGradient properties', () => {
    it('easing defaults to linear', () => {
      const result = compile(`
        let s = @{ circle(0, 0, 100); closePath(); };
        let topo = TopoGradient('t', 400, 300) {|g|
          g.contour(s.project(200, 150), 0.5, Color('#27ae60'));
        };
      `);
      expect(result.gradients[0].topoEasing).toBe('linear');
    });

    it('easing can be set to smoothstep', () => {
      const result = compile(`
        let s = @{ circle(0, 0, 100); closePath(); };
        let topo = TopoGradient('t', 400, 300) {|g|
          g.contour(s.project(200, 150), 0.5, Color('#27ae60'));
        };
        topo.easing = 'smoothstep';
      `);
      expect(result.gradients[0].topoEasing).toBe('smoothstep');
    });

    it('easing can be set to ease-in, ease-out, ease-in-out', () => {
      for (const ease of ['ease-in', 'ease-out', 'ease-in-out']) {
        const result = compile(`
          let s = @{ circle(0, 0, 100); closePath(); };
          let topo = TopoGradient('t', 400, 300) {|g|
            g.contour(s.project(200, 150), 0.5, Color('#27ae60'));
          };
          topo.easing = '${ease}';
        `);
        expect(result.gradients[0].topoEasing).toBe(ease);
      }
    });

    it('easing rejects invalid values', () => {
      expect(() =>
        compile(`
        let s = @{ circle(0, 0, 100); closePath(); };
        let topo = TopoGradient('t', 400, 300) {|g|
          g.contour(s.project(200, 150), 0.5, Color('#27ae60'));
        };
        topo.easing = 'cubic';
      `),
      ).toThrow(/easing must be one of/);
    });

    it('easing only settable on topo gradients', () => {
      expect(() =>
        compile(`
        let lg = LinearGradient('lg', 0, 0, 1, 1) {|g| g.stop(0, Color('#000')); };
        lg.easing = 'smoothstep';
      `),
      ).toThrow(/only available on TopoGradient/);
    });

    it('method defaults to distance', () => {
      const result = compile(`
        let s = @{ circle(0, 0, 100); closePath(); };
        let topo = TopoGradient('t', 400, 300) {|g|
          g.contour(s.project(200, 150), 0.5, Color('#27ae60'));
        };
      `);
      expect(result.gradients[0].topoMethod).toBe('distance');
    });

    it('method = laplace is accepted', () => {
      const result = compile(`
        let s = @{ circle(0, 0, 100); closePath(); };
        let topo = TopoGradient('t', 400, 300) {|g|
          g.contour(s.project(200, 150), 0.5, Color('#27ae60'));
        };
        topo.method = 'laplace';
      `);
      expect(result.gradients[0].topoMethod).toBe('laplace');
    });

    it('method only settable on topo gradients', () => {
      expect(() =>
        compile(`
        let lg = LinearGradient('lg', 0, 0, 1, 1) {|g| g.stop(0, Color('#000')); };
        lg.method = 'distance';
      `),
      ).toThrow(/only available on TopoGradient/);
    });

    it('width, height, id are readable', () => {
      const result = compile(`
        let s = @{ circle(0, 0, 100); closePath(); };
        let topo = TopoGradient('terrain', 400, 300) {|g|
          g.contour(s.project(200, 150), 0.5, Color('#27ae60'));
        };
        log(topo.id);
        log(topo.width);
        log(topo.height);
      `);
      expect(result.logs[0].parts[0].value).toBe('terrain');
      expect(result.logs[1].parts[0].value).toBe('400');
      expect(result.logs[2].parts[0].value).toBe('300');
    });

    it('interpolation is settable', () => {
      const result = compile(`
        let s = @{ circle(0, 0, 100); closePath(); };
        let topo = TopoGradient('t', 400, 300) {|g|
          g.contour(s.project(200, 150), 0.5, Color('#27ae60'));
        };
        topo.interpolation = 'oklch';
      `);
      expect(result.gradients[0]).toBeDefined();
    });

    it('baseColor can be set', () => {
      const result = compile(`
        let s = @{ circle(0, 0, 100); closePath(); };
        let topo = TopoGradient('t', 400, 300) {|g|
          g.contour(s.project(200, 150), 0.5, Color('#27ae60'));
        };
        topo.baseColor = Color('#1a5276');
      `);
      expect(result.gradients[0].topoBaseColor).toBeDefined();
    });

    it('baseColor rejects non-Color values', () => {
      expect(() =>
        compile(`
        let s = @{ circle(0, 0, 100); closePath(); };
        let topo = TopoGradient('t', 400, 300) {|g|
          g.contour(s.project(200, 150), 0.5, Color('#27ae60'));
        };
        topo.baseColor = '#1a5276';
      `),
      ).toThrow(/must be a Color value/);
    });

    it('baseColor only settable on topo gradients', () => {
      expect(() =>
        compile(`
        let lg = LinearGradient('lg', 0, 0, 1, 1) {|g| g.stop(0, Color('#000')); };
        lg.baseColor = Color('#fff');
      `),
      ).toThrow(/only available on TopoGradient/);
    });

    it('iterations defaults to 200', () => {
      const result = compile(`
        let s = @{ circle(0, 0, 100); closePath(); };
        let topo = TopoGradient('t', 400, 300) {|g|
          g.contour(s.project(200, 150), 0.5, Color('#27ae60'));
        };
      `);
      expect(result.gradients[0].topoIterations).toBe(200);
    });

    it('iterations settable and readable via log()', () => {
      const result = compile(`
        let s = @{ circle(0, 0, 100); closePath(); };
        let topo = TopoGradient('t', 400, 300) {|g|
          g.contour(s.project(200, 150), 0.5, Color('#27ae60'));
        };
        topo.iterations = 500;
        log(topo.iterations);
      `);
      expect(result.gradients[0].topoIterations).toBe(500);
      expect(result.logs[0].parts[0].value).toBe('500');
    });

    it('iterations must be a number', () => {
      expect(() =>
        compile(`
        let s = @{ circle(0, 0, 100); closePath(); };
        let topo = TopoGradient('t', 400, 300) {|g|
          g.contour(s.project(200, 150), 0.5, Color('#27ae60'));
        };
        topo.iterations = 'many';
      `),
      ).toThrow(/iterations must be a number/);
    });

    it('iterations rejects 0 (below range)', () => {
      expect(() =>
        compile(`
        let s = @{ circle(0, 0, 100); closePath(); };
        let topo = TopoGradient('t', 400, 300) {|g|
          g.contour(s.project(200, 150), 0.5, Color('#27ae60'));
        };
        topo.iterations = 0;
      `),
      ).toThrow(/iterations must be between 1 and 2000/);
    });

    it('iterations rejects 3000 (above range)', () => {
      expect(() =>
        compile(`
        let s = @{ circle(0, 0, 100); closePath(); };
        let topo = TopoGradient('t', 400, 300) {|g|
          g.contour(s.project(200, 150), 0.5, Color('#27ae60'));
        };
        topo.iterations = 3000;
      `),
      ).toThrow(/iterations must be between 1 and 2000/);
    });

    it('iterations rounds to integer', () => {
      const result = compile(`
        let s = @{ circle(0, 0, 100); closePath(); };
        let topo = TopoGradient('t', 400, 300) {|g|
          g.contour(s.project(200, 150), 0.5, Color('#27ae60'));
        };
        topo.iterations = 150.7;
      `);
      expect(result.gradients[0].topoIterations).toBe(151);
    });

    it('iterations only settable on topo gradients', () => {
      expect(() =>
        compile(`
        let lg = LinearGradient('lg', 0, 0, 1, 1) {|g| g.stop(0, Color('#000')); };
        lg.iterations = 100;
      `),
      ).toThrow(/only available on TopoGradient/);
    });

    it('laplace + custom iterations both in output', () => {
      const result = compile(`
        let s = @{ circle(0, 0, 100); closePath(); };
        let topo = TopoGradient('t', 400, 300) {|g|
          g.contour(s.project(200, 150), 0.5, Color('#27ae60'));
        };
        topo.method = 'laplace';
        topo.iterations = 750;
      `);
      expect(result.gradients[0].topoMethod).toBe('laplace');
      expect(result.gradients[0].topoIterations).toBe(750);
    });

    it('iterations serialized in output when method is distance', () => {
      const result = compile(`
        let s = @{ circle(0, 0, 100); closePath(); };
        let topo = TopoGradient('t', 400, 300) {|g|
          g.contour(s.project(200, 150), 0.5, Color('#27ae60'));
        };
        topo.iterations = 100;
      `);
      expect(result.gradients[0].topoMethod).toBe('distance');
      expect(result.gradients[0].topoIterations).toBe(100);
    });

    // --- blend property ---

    it('blend defaults to 1.0', () => {
      const result = compile(`
        let s = @{ circle(0, 0, 100); closePath(); };
        let topo = TopoGradient('t', 400, 300) {|g|
          g.contour(s.project(200, 150), 0.5, Color('#27ae60'));
        };
      `);
      expect(result.gradients[0].topoBlend).toBe(1.0);
    });

    it('blend settable and readable via log()', () => {
      const result = compile(`
        let s = @{ circle(0, 0, 100); closePath(); };
        let topo = TopoGradient('t', 400, 300) {|g|
          g.contour(s.project(200, 150), 0.5, Color('#27ae60'));
        };
        topo.blend = 0.7;
        log(topo.blend);
      `);
      expect(result.logs[0].parts[0].value).toBe('0.7');
      expect(result.gradients[0].topoBlend).toBe(0.7);
    });

    it('blend must be a number', () => {
      expect(() =>
        compile(`
        let s = @{ circle(0, 0, 100); closePath(); };
        let topo = TopoGradient('t', 400, 300) {|g|
          g.contour(s.project(200, 150), 0.5, Color('#27ae60'));
        };
        topo.blend = "high";
      `),
      ).toThrow(/blend must be a number/);
    });

    it('blend range 0 to 1', () => {
      expect(() =>
        compile(`
        let s = @{ circle(0, 0, 100); closePath(); };
        let topo = TopoGradient('t', 400, 300) {|g|
          g.contour(s.project(200, 150), 0.5, Color('#27ae60'));
        };
        topo.blend = -0.1;
      `),
      ).toThrow(/blend must be between 0 and 1/);
      expect(() =>
        compile(`
        let s = @{ circle(0, 0, 100); closePath(); };
        let topo = TopoGradient('t', 400, 300) {|g|
          g.contour(s.project(200, 150), 0.5, Color('#27ae60'));
        };
        topo.blend = 1.5;
      `),
      ).toThrow(/blend must be between 0 and 1/);
    });

    it('blend only on topo', () => {
      expect(() =>
        compile(`
        let g = LinearGradient('g', 0, 0, 1, 0) {|g|
          g.stop(0, Color('#000'));
          g.stop(1, Color('#fff'));
        };
        g.blend = 0.5;
      `),
      ).toThrow(/only available on TopoGradient/);
    });
  });

  describe('TopoGradient output serialization', () => {
    it('builds stopsWithOklch from contours sorted by elevation', () => {
      const result = compile(`
        let s = @{ circle(0, 0, 100); closePath(); };
        let topo = TopoGradient('t', 400, 300) {|g|
          g.contour(s.project(200, 150), 0.8, Color('#ffffff'));
          g.contour(s.project(200, 150), 0.3, Color('#27ae60'));
        };
      `);
      const stops = result.gradients[0].stopsWithOklch!;
      expect(stops.length).toBeGreaterThanOrEqual(2);
      // Stops should be sorted by elevation
      for (let i = 1; i < stops.length; i++) {
        expect(stops[i].offset).toBeGreaterThanOrEqual(stops[i - 1].offset);
      }
    });

    it('includes baseColor at offset 0 when set', () => {
      const result = compile(`
        let s = @{ circle(0, 0, 100); closePath(); };
        let topo = TopoGradient('t', 400, 300) {|g|
          g.contour(s.project(200, 150), 0.5, Color('#27ae60'));
        };
        topo.baseColor = Color('#1a5276');
      `);
      const stops = result.gradients[0].stopsWithOklch!;
      expect(stops[0].offset).toBe(0);
      expect(stops[0].oklch).toBeDefined();
    });

    it('contours have oklch data in output', () => {
      const result = compile(`
        let s = @{ circle(0, 0, 100); closePath(); };
        let topo = TopoGradient('t', 400, 300) {|g|
          g.contour(s.project(200, 150), 0.5, Color('#27ae60'));
        };
      `);
      const contour = result.gradients[0].topoContours![0];
      expect(contour.oklch).toBeDefined();
      expect(contour.color).toBeDefined();
    });
  });

  describe('TopoGradient validation warnings', () => {
    it('warns with 0 contours', () => {
      const result = compile(`
        let topo = TopoGradient('t', 400, 300) {|g| };
      `);
      const warns = result.logs.filter((l) => l.parts[0].value.includes('no contours'));
      expect(warns.length).toBe(1);
    });
  });

  describe('TopoGradient log formatting', () => {
    it('shows contour count in log output', () => {
      const result = compile(`
        let s = @{ circle(0, 0, 100); closePath(); };
        let topo = TopoGradient('terrain', 400, 300) {|g|
          g.contour(s.project(200, 150), 0.3, Color('#27ae60'));
          g.contour(s.project(200, 150), 0.8, Color('#ffffff'));
        };
        log(topo);
      `);
      expect(result.logs[0].parts[0].value).toBe('TopoGradient(terrain, 2 contours)');
    });
  });

  describe('TopoGradient fill/stroke integration', () => {
    it('auto-wraps to url(#id) when used as fill', () => {
      const result = compile(`
        let s = @{ circle(0, 0, 100); closePath(); };
        let topo = TopoGradient('terrain', 400, 300) {|g|
          g.contour(s.project(200, 150), 0.5, Color('#27ae60'));
        };
        define PathLayer('bg') \${ fill: topo; }
        layer('bg').apply { rect(0, 0, 400, 300); }
      `);
      expect(result.layers[0].styles?.fill).toBe('url(#terrain)');
    });

    it('multiple topos in same program', () => {
      const result = compile(`
        let s = @{ circle(0, 0, 100); closePath(); };
        let topo1 = TopoGradient('t1', 400, 300) {|g|
          g.contour(s.project(200, 150), 0.5, Color('#27ae60'));
        };
        let topo2 = TopoGradient('t2', 200, 200) {|g|
          g.contour(s.project(100, 100), 0.3, Color('#ffffff'));
        };
      `);
      expect(result.gradients).toHaveLength(2);
      expect(result.gradients[0].id).toBe('t1');
      expect(result.gradients[1].id).toBe('t2');
    });
  });

  describe('TopoGradient programmatic contours', () => {
    it('generates contours via for-loop', () => {
      const result = compile(`
        let topo = TopoGradient('rings', 400, 400) {|g|
          for ([level, i] in [0.2, 0.4, 0.6, 0.8]) {
            let r = calc(150 - i * 35);
            let ring = @{ circle(0, 0, r); closePath(); };
            g.contour(ring.project(200, 200), level, Color('#27ae60'));
          }
        };
      `);
      expect(result.gradients[0].topoContours).toHaveLength(4);
      expect(result.gradients[0].topoContours![0].elevation).toBe(0.2);
      expect(result.gradients[0].topoContours![3].elevation).toBe(0.8);
    });
  });
});
