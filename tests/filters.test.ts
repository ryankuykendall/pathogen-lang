import { describe, expect, it } from 'vitest';

import { compile } from '../src';
import { buildDefs } from '../src/render';
import type { VNode } from '../src/render';

/**
 * Flatten the primitive children of the single emitted <filter> def to
 * an array of { tag, attrs } objects so tests can assert chain shape.
 */
function emittedFilterPrimitives(source: string): { tag: string; attrs: Record<string, string> }[] {
  const result = compile(source);
  expect(result.filters).toHaveLength(1);
  const defs = buildDefs(result);
  const filterNode = defs.find(
    (n): n is VNode => typeof n === 'object' && n !== null && 'tag' in n && n.tag === 'filter',
  );
  expect(filterNode).toBeDefined();
  return (filterNode!.children ?? []).map((child) => {
    if (typeof child === 'string') return { tag: '#text', attrs: {} };
    return { tag: child.tag, attrs: child.attrs as Record<string, string> };
  });
}

/**
 * Helper: compile a NoiseFilter wrapped in a layer that references it, then
 * return the single emitted FilterOutput. Most tests want one filter at a time.
 */
function compileFilter(body: string) {
  const result = compile(`
    let f = NoiseFilter() {|f|
      ${body}
    };
    define PathLayer('layer') #{
      fill: hotpink;
      filter: f;
    }
    layer('layer').apply { M 0 0 L 10 0 L 10 10 L 0 10 Z }
  `);
  expect(result.filters).toHaveLength(1);
  return { result, filter: result.filters[0] };
}

describe('NoiseFilter', () => {
  describe('Construction & defaults', () => {
    it('creates a filter with Grain defaults when style is omitted', () => {
      const { filter } = compileFilter('');
      expect(filter.kind).toBe('noise');
      expect(filter.style).toBe('grain');
      expect(filter.scale).toBe(5.0);
      expect(filter.octaves).toBe(6);
      expect(filter.amount).toBeCloseTo(0.4);
      expect(filter.monochrome).toBe(true);
      expect(filter.blend).toBe('color-burn');
      expect(filter.contrast).toBe(1.0);
      expect(filter.stitch).toBe(false);
    });

    it('rejects positional arguments', () => {
      expect(() => compile(`let f = NoiseFilter(0.5);`)).toThrow(/takes no positional arguments/);
    });

    it('auto-generates a CSS-safe id starting with pathogen-noise-', () => {
      const { filter } = compileFilter('');
      expect(filter.id).toMatch(/^pathogen-noise-\d+$/);
    });
  });

  describe('Style presets', () => {
    it('Paper applies multiplicative defaults', () => {
      const { filter } = compileFilter('f.style = NoiseFilterStyle.Paper;');
      expect(filter.style).toBe('paper');
      expect(filter.scale).toBe(1.0);
      expect(filter.octaves).toBe(3);
      expect(filter.blend).toBe('multiply');
      expect(filter.monochrome).toBe(true);
    });

    it('Speckle uses coarser defaults and color noise', () => {
      const { filter } = compileFilter('f.style = NoiseFilterStyle.Speckle;');
      expect(filter.style).toBe('speckle');
      expect(filter.scale).toBeCloseTo(0.3);
      expect(filter.octaves).toBe(2);
      expect(filter.monochrome).toBe(false);
    });

    it('Static uses high octaves and hard-light blend', () => {
      const { filter } = compileFilter('f.style = NoiseFilterStyle.Static;');
      expect(filter.style).toBe('static');
      expect(filter.octaves).toBe(8);
      expect(filter.blend).toBe('hard-light');
    });

    it('Gradient enables stitch and contrast pump', () => {
      const { filter } = compileFilter('f.style = NoiseFilterStyle.Gradient;');
      expect(filter.style).toBe('gradient');
      expect(filter.stitch).toBe(true);
      expect(filter.contrast).toBeCloseTo(1.7);
      expect(filter.blend).toBe('overlay');
    });

    it('rejects unknown style values', () => {
      expect(() =>
        compile(`let f = NoiseFilter() {|f| f.style = 'wobble'; };`),
      ).toThrow(/Invalid value 'wobble' for NoiseFilter\.style/);
    });
  });

  describe('Property overrides', () => {
    it('user assignments take precedence over preset defaults', () => {
      const { filter } = compileFilter(`
        f.style = NoiseFilterStyle.Paper;
        f.amount = 0.85;
        f.octaves = 7;
      `);
      expect(filter.style).toBe('paper');
      expect(filter.amount).toBeCloseTo(0.85);
      expect(filter.octaves).toBe(7);
    });

    it('scale accepts numeric values', () => {
      const { filter } = compileFilter('f.scale = 2.5;');
      expect(filter.scale).toBe(2.5);
    });

    it("scale accepts the 'fine' | 'medium' | 'coarse' tokens", () => {
      expect(compileFilter("f.scale = 'fine';").filter.scale).toBe(5.0);
      expect(compileFilter("f.scale = 'medium';").filter.scale).toBe(1.0);
      expect(compileFilter("f.scale = 'coarse';").filter.scale).toBeCloseTo(0.3);
    });

    it('scale accepts NoiseFilterScale enum members (equivalent to the bare strings)', () => {
      expect(compileFilter('f.scale = NoiseFilterScale.Fine;').filter.scale).toBe(5.0);
      expect(compileFilter('f.scale = NoiseFilterScale.Medium;').filter.scale).toBe(1.0);
      expect(compileFilter('f.scale = NoiseFilterScale.Coarse;').filter.scale).toBeCloseTo(0.3);
    });

    it('rejects invalid scale strings', () => {
      expect(() => compile(`let f = NoiseFilter() {|f| f.scale = 'wobble'; };`)).toThrow(
        /NoiseFilter\.scale must be a positive number or one of/,
      );
    });

    it('rejects out-of-range octaves', () => {
      expect(() => compile(`let f = NoiseFilter() {|f| f.octaves = 0; };`)).toThrow(
        /NoiseFilter\.octaves must be an integer between 1 and 10/,
      );
      expect(() => compile(`let f = NoiseFilter() {|f| f.octaves = 11; };`)).toThrow(
        /NoiseFilter\.octaves must be an integer between 1 and 10/,
      );
    });

    it('rejects out-of-range amount', () => {
      expect(() => compile(`let f = NoiseFilter() {|f| f.amount = 1.5; };`)).toThrow(
        /NoiseFilter\.amount must be a number between 0 and 1/,
      );
    });

    it('blend accepts BlendMode enum members', () => {
      const { filter } = compileFilter('f.blend = BlendMode.SoftLight;');
      expect(filter.blend).toBe('soft-light');
    });

    it('rejects unknown blend modes', () => {
      expect(() => compile(`let f = NoiseFilter() {|f| f.blend = 'wobble'; };`)).toThrow(
        /Invalid value 'wobble' for NoiseFilter\.blend/,
      );
    });

    it('style assignment re-baselines parameters but preserves user-set seed', () => {
      const { filter } = compileFilter(`
        f.seed = 999;
        f.style = NoiseFilterStyle.Static;
      `);
      expect(filter.style).toBe('static');
      expect(filter.octaves).toBe(8);
      expect(filter.seed).toBe(999);
    });
  });

  describe('Style-block url(#id) resolution', () => {
    it('filter: <FilterValue> resolves to url(#id)', () => {
      const result = compile(`
        let f = NoiseFilter() {|f| f.style = NoiseFilterStyle.Grain; };
        define PathLayer('a') #{ fill: hotpink; filter: f; }
        layer('a').apply { M 0 0 L 10 0 L 10 10 L 0 10 Z }
      `);
      const layer = result.layers.find((l) => l.name === 'a')!;
      expect(layer.styles.filter).toBe(`url(#${result.filters[0].id})`);
    });

    it('reusing one filter across N layers emits a single filter def', () => {
      const result = compile(`
        let g = NoiseFilter() {|f| f.style = NoiseFilterStyle.Paper; };
        define PathLayer('a') #{ fill: red; filter: g; }
        define PathLayer('b') #{ fill: blue; filter: g; }
        define PathLayer('c') #{ fill: green; filter: g; }
        layer('a').apply { M 0 0 L 10 0 Z }
        layer('b').apply { M 0 0 L 10 0 Z }
        layer('c').apply { M 0 0 L 10 0 Z }
      `);
      expect(result.filters).toHaveLength(1);
      const id = result.filters[0].id;
      for (const layer of result.layers.filter((l) => ['a', 'b', 'c'].includes(l.name))) {
        expect(layer.styles.filter).toBe(`url(#${id})`);
      }
    });

    it('anonymous inline NoiseFilter() (no block) generates one def per call site', () => {
      // The style-block value tokenizer is regex-based and stops at the first
      // ';', so inline trailing-block configuration (`filter: NoiseFilter() {|f|
      // ...; };`) is not parseable today. The bare form `filter: NoiseFilter();`
      // still works — and yields a default Grain filter, one def per site.
      const result = compile(`
        define PathLayer('a') #{
          fill: red;
          filter: NoiseFilter();
        }
        define PathLayer('b') #{
          fill: blue;
          filter: NoiseFilter();
        }
        layer('a').apply { M 0 0 L 10 0 Z }
        layer('b').apply { M 0 0 L 10 0 Z }
      `);
      expect(result.filters).toHaveLength(2);
      expect(result.filters[0].id).not.toBe(result.filters[1].id);
    });
  });

  describe('Seed determinism', () => {
    it('same source produces the same auto-derived seed across compiles', () => {
      const src = `let f = NoiseFilter() {|f| f.style = NoiseFilterStyle.Paper; };`;
      const a = compile(src);
      const b = compile(src);
      expect(a.filters[0]).toEqual(b.filters[0]);
      expect((a.filters[0] as { seed: number }).seed).toBe((b.filters[0] as { seed: number }).seed);
    });

    it('explicit seed overrides the derived value', () => {
      const { filter } = compileFilter('f.seed = 42;');
      expect(filter.seed).toBe(42);
    });
  });

  describe('Property reads', () => {
    it('exposes id, style, and the configured knobs after construction', () => {
      const result = compile(`
        let f = NoiseFilter() {|f|
          f.style = NoiseFilterStyle.Paper;
          f.amount = 0.42;
          f.seed = 1234;
        };
        log(f.id);
        log(f.style);
        log(f.amount);
        log(f.seed);
        log(f.scale);
        log(f.octaves);
        log(f.monochrome);
        log(f.blend);
        log(f.contrast);
        log(f.stitch);
      `);
      const values = result.logs.map((l) => l.parts.map((p) => p.value).join(''));
      expect(values[0]).toMatch(/^pathogen-noise-/);
      expect(values[1]).toBe('paper');
      expect(values[2]).toBe('0.42');
      expect(values[3]).toBe('1234');
      expect(values[4]).toBe('1');           // Paper default scale
      expect(values[5]).toBe('3');           // Paper default octaves
      expect(values[6]).toBe('true');
      expect(values[7]).toBe('multiply');
      expect(values[8]).toBe('1');           // Paper default contrast
      expect(values[9]).toBe('false');
    });

    it('throws on unknown property reads', () => {
      expect(() =>
        compile(`let f = NoiseFilter() {|f| f.style = NoiseFilterStyle.Grain; }; log(f.nope);`),
      ).toThrow(/Property 'nope' does not exist on NoiseFilter/);
    });
  });

  describe('Bound parameter naming', () => {
    it('block param can be any name', () => {
      const result = compile(`
        let a = NoiseFilter() {|x| x.style = NoiseFilterStyle.Paper; };
        let b = NoiseFilter() {|filter| filter.amount = 0.3; };
      `);
      expect(result.filters).toHaveLength(2);
    });
  });

  describe('Numeric guards', () => {
    it('rejects Infinity on scale', () => {
      expect(() => compile(`let f = NoiseFilter() {|f| f.scale = 1 / 0; };`)).toThrow(
        /NoiseFilter\.scale/,
      );
    });
    it('rejects Infinity on amount via boundary check', () => {
      expect(() => compile(`let f = NoiseFilter() {|f| f.amount = 1 / 0; };`)).toThrow(
        /NoiseFilter\.amount/,
      );
    });
    it('rejects Infinity on contrast', () => {
      expect(() => compile(`let f = NoiseFilter() {|f| f.contrast = 1 / 0; };`)).toThrow(
        /NoiseFilter\.contrast/,
      );
    });
    it('rejects Infinity on seed', () => {
      expect(() => compile(`let f = NoiseFilter() {|f| f.seed = 1 / 0; };`)).toThrow(
        /NoiseFilter\.seed/,
      );
    });
  });

  describe('Rendered <filter> primitive chain', () => {
    const program = (body: string) => `
      let f = NoiseFilter() {|f|
        ${body}
      };
      define PathLayer('a') #{ fill: red; filter: f; }
      layer('a').apply { M 0 0 L 10 0 L 10 10 L 0 10 Z }
    `;

    it('Grain emits turbulence → composite → mono → amount → blend', () => {
      const primitives = emittedFilterPrimitives(
        program('f.style = NoiseFilterStyle.Grain;'),
      );
      const tags = primitives.map((p) => p.tag);
      expect(tags).toEqual(['feTurbulence', 'feComposite', 'feColorMatrix', 'feComponentTransfer', 'feBlend']);
      expect(primitives[0].attrs.type).toBe('fractalNoise');
      expect(primitives[2].attrs.type).toBe('luminanceToAlpha');
      expect(primitives[4].attrs.mode).toBe('color-burn');
    });

    it('Speckle uses feTurbulence type="turbulence" (not fractalNoise)', () => {
      const primitives = emittedFilterPrimitives(
        program('f.style = NoiseFilterStyle.Speckle;'),
      );
      expect(primitives[0].tag).toBe('feTurbulence');
      expect(primitives[0].attrs.type).toBe('turbulence');
    });

    it('Static emits hard-light blend', () => {
      const primitives = emittedFilterPrimitives(
        program('f.style = NoiseFilterStyle.Static;'),
      );
      const lastBlend = primitives[primitives.length - 1];
      expect(lastBlend.tag).toBe('feBlend');
      expect(lastBlend.attrs.mode).toBe('hard-light');
    });

    it('Gradient inserts feComponentTransfer contrast pump when contrast != 1', () => {
      const primitives = emittedFilterPrimitives(
        program('f.style = NoiseFilterStyle.Gradient;'),
      );
      // Gradient default contrast is 1.7 → contrastPumpNode after turb
      const componentTransfers = primitives.filter((p) => p.tag === 'feComponentTransfer');
      // One for the contrast pump on RGB, one for the amount alpha ramp
      expect(componentTransfers).toHaveLength(2);
    });

    it('Grain with contrast = 2.0 inserts the contrast-pump feComponentTransfer', () => {
      const primitives = emittedFilterPrimitives(
        program(`f.style = NoiseFilterStyle.Grain; f.contrast = 2.0;`),
      );
      const componentTransfers = primitives.filter((p) => p.tag === 'feComponentTransfer');
      // Without the contrast fix this would only have ONE feComponentTransfer
      // (the amount ramp). With the fix, the contrast pump adds a second.
      expect(componentTransfers).toHaveLength(2);
    });

    it('Static with monochrome = false omits the luminanceToAlpha primitive', () => {
      const primitives = emittedFilterPrimitives(
        program(`f.style = NoiseFilterStyle.Static; f.monochrome = false;`),
      );
      const colorMatrices = primitives.filter((p) => p.tag === 'feColorMatrix');
      expect(colorMatrices).toHaveLength(0);
    });

    it('Speckle (color noise default) omits the luminanceToAlpha primitive', () => {
      const primitives = emittedFilterPrimitives(
        program('f.style = NoiseFilterStyle.Speckle;'),
      );
      const colorMatrices = primitives.filter((p) => p.tag === 'feColorMatrix');
      expect(colorMatrices).toHaveLength(0);
    });

    it('stitch = true sets stitchTiles on feTurbulence', () => {
      const primitives = emittedFilterPrimitives(
        program(`f.style = NoiseFilterStyle.Paper; f.stitch = true;`),
      );
      expect(primitives[0].tag).toBe('feTurbulence');
      expect(primitives[0].attrs.stitchTiles).toBe('stitch');
    });
  });
});

// ============================================================================
// GlowFilter
// ============================================================================

function wrapInLayer(constructorSource: string) {
  return `
    let f = ${constructorSource};
    define PathLayer('layer') #{ fill: hotpink; filter: f; }
    layer('layer').apply { M 0 0 L 10 0 L 10 10 L 0 10 Z }
  `;
}

describe('GlowFilter', () => {
  it('creates a filter with sensible defaults', () => {
    const result = compile(wrapInLayer('GlowFilter() {|f| }'));
    expect(result.filters).toHaveLength(1);
    const f = result.filters[0] as { kind: string; mode: string; radius: number; spread: number; opacity: number };
    expect(f.kind).toBe('glow');
    expect(f.mode).toBe('outer');
    expect(f.radius).toBe(4);
    expect(f.spread).toBe(0);
    expect(f.opacity).toBeCloseTo(0.8);
  });

  it('honors property overrides', () => {
    const result = compile(
      wrapInLayer(`GlowFilter() {|f|
        f.mode = GlowMode.Inner;
        f.color = Color('#ff0000');
        f.radius = 10;
        f.spread = 2;
        f.opacity = 0.5;
      }`),
    );
    const f = result.filters[0] as { mode: string; color: string; radius: number; spread: number; opacity: number };
    expect(f.mode).toBe('inner');
    expect(f.color).toBe('#ff0000');
    expect(f.radius).toBe(10);
    expect(f.spread).toBe(2);
    expect(f.opacity).toBe(0.5);
  });

  it('rejects unknown mode', () => {
    expect(() =>
      compile(`let f = GlowFilter() {|f| f.mode = 'wobble'; };`),
    ).toThrow(/Invalid value 'wobble' for GlowFilter\.mode/);
  });

  it('rejects negative radius', () => {
    expect(() =>
      compile(`let f = GlowFilter() {|f| f.radius = -1; };`),
    ).toThrow(/GlowFilter\.radius must be a finite non-negative number/);
  });

  it('rejects out-of-range opacity', () => {
    expect(() =>
      compile(`let f = GlowFilter() {|f| f.opacity = 1.5; };`),
    ).toThrow(/GlowFilter\.opacity must be a number between 0 and 1/);
  });

  it('exposes read-side property access', () => {
    const result = compile(`
      let f = GlowFilter() {|f| f.radius = 7; };
      log(f.id);
      log(f.mode);
      log(f.radius);
    `);
    const values = result.logs.map((l) => l.parts.map((p) => p.value).join(''));
    expect(values[0]).toMatch(/^pathogen-glow-/);
    expect(values[1]).toBe('outer');
    expect(values[2]).toBe('7');
  });

  it('Outer mode emits feGaussianBlur → feFlood → feComposite → feMerge', () => {
    const primitives = emittedFilterPrimitives(
      wrapInLayer('GlowFilter() {|f| f.mode = GlowMode.Outer; }'),
    );
    const tags = primitives.map((p) => p.tag);
    expect(tags).toEqual(['feGaussianBlur', 'feFlood', 'feComposite', 'feMerge']);
  });

  it('Inner mode emits feGaussianBlur → feComposite(out) → feFlood → feComposite(in) → feComposite(in) → feMerge', () => {
    const primitives = emittedFilterPrimitives(
      wrapInLayer('GlowFilter() {|f| f.mode = GlowMode.Inner; }'),
    );
    const tags = primitives.map((p) => p.tag);
    expect(tags).toEqual(['feGaussianBlur', 'feComposite', 'feFlood', 'feComposite', 'feComposite', 'feMerge']);
  });

  it('spread > 0 inserts feMorphology', () => {
    const primitives = emittedFilterPrimitives(
      wrapInLayer('GlowFilter() {|f| f.spread = 2; }'),
    );
    expect(primitives[0].tag).toBe('feMorphology');
    expect(primitives[0].attrs.operator).toBe('dilate');
  });
});

// ============================================================================
// EmbossFilter
// ============================================================================

describe('EmbossFilter', () => {
  it('creates a filter with sensible defaults', () => {
    const result = compile(wrapInLayer('EmbossFilter() {|f| }'));
    const f = result.filters[0] as { kind: string; depth: number; strength: number; shininess: number };
    expect(f.kind).toBe('emboss');
    expect(f.depth).toBe(2);
    expect(f.strength).toBeCloseTo(0.8);
    expect(f.shininess).toBe(20);
  });

  it('accepts angle with deg unit', () => {
    const result = compile(wrapInLayer('EmbossFilter() {|f| f.angle = 90deg; }'));
    const f = result.filters[0] as { angle: number };
    expect(f.angle).toBeCloseTo(Math.PI / 2);
  });

  it('accepts an Angle value via a variable on angle/elevation (first-class Angle)', () => {
    const result = compile(
      wrapInLayer('EmbossFilter() {|f| let a = 90deg; f.angle = a; f.elevation = calc(a / 3); }'),
    );
    const f = result.filters[0] as { angle: number; elevation: number };
    expect(f.angle).toBeCloseTo(Math.PI / 2);
    expect(f.elevation).toBeCloseTo(Math.PI / 6);
  });

  it('rejects shininess below 1', () => {
    expect(() =>
      compile(`let f = EmbossFilter() {|f| f.shininess = 0.5; };`),
    ).toThrow(/EmbossFilter\.shininess must be a finite number >= 1/);
  });

  it('emits feSpecularLighting with feDistantLight child', () => {
    const primitives = emittedFilterPrimitives(wrapInLayer('EmbossFilter() {|f| }'));
    expect(primitives.find((p) => p.tag === 'feSpecularLighting')).toBeDefined();
  });

  it('exposes angle and elevation reads in radians', () => {
    const result = compile(`
      let f = EmbossFilter() {|f| f.angle = 90deg; f.elevation = 30deg; };
      log(f.angle);
      log(f.elevation);
    `);
    const values = result.logs.map((l) => l.parts.map((p) => p.value).join(''));
    expect(parseFloat(values[0])).toBeCloseTo(Math.PI / 2);
    expect(parseFloat(values[1])).toBeCloseTo(Math.PI / 6);
  });

  it('emits clean azimuth/elevation degrees without floating-point noise', () => {
    const primitives = emittedFilterPrimitives(wrapInLayer('EmbossFilter() {|f| f.angle = 30deg; f.elevation = 60deg; }'));
    const light = primitives.find((p) => p.tag === 'feSpecularLighting')!;
    // The feDistantLight is the only child; we serialized it under the feSpecularLighting in build-defs.
    // emittedFilterPrimitives flattens only the top-level filter children, so we read the azimuth from the
    // VNode tree directly by querying the SVG output instead.
    expect(light).toBeDefined();
    // Inspect the rendered SVG string via the compile result to confirm no scientific-notation tails.
    const source = wrapInLayer('EmbossFilter() {|f| f.angle = 30deg; f.elevation = 60deg; }');
    const result = compile(source);
    const defs = buildDefs(result);
    const filterNode = defs.find((n): n is VNode => typeof n === 'object' && n !== null && 'tag' in n && n.tag === 'filter')!;
    const spec = filterNode.children!.find((c): c is VNode => typeof c === 'object' && c !== null && 'tag' in c && c.tag === 'feSpecularLighting')!;
    const distant = spec.children!.find((c): c is VNode => typeof c === 'object' && c !== null && 'tag' in c && c.tag === 'feDistantLight')!;
    expect(distant.attrs.azimuth).toBe('30');
    expect(distant.attrs.elevation).toBe('60');
  });

  it('rejects negative depth, strength, smooth', () => {
    expect(() => compile(`let f = EmbossFilter() {|f| f.depth = -1; };`)).toThrow(
      /EmbossFilter\.depth must be a finite non-negative number/,
    );
    expect(() => compile(`let f = EmbossFilter() {|f| f.strength = -1; };`)).toThrow(
      /EmbossFilter\.strength must be a finite non-negative number/,
    );
    expect(() => compile(`let f = EmbossFilter() {|f| f.smooth = -1; };`)).toThrow(
      /EmbossFilter\.smooth must be a finite non-negative number/,
    );
  });
});

// ============================================================================
// ElevationShadowFilter
// ============================================================================

describe('ElevationShadowFilter', () => {
  it('creates a filter with sensible defaults', () => {
    const result = compile(wrapInLayer('ElevationShadowFilter() {|f| }'));
    const f = result.filters[0] as { kind: string; elevation: number; tightness: number };
    expect(f.kind).toBe('elevation-shadow');
    expect(f.elevation).toBe(4);
    expect(f.tightness).toBe(1);
  });

  it('clamps reject when elevation > 24', () => {
    expect(() =>
      compile(`let f = ElevationShadowFilter() {|f| f.elevation = 25; };`),
    ).toThrow(/ElevationShadowFilter\.elevation must be a finite number between 0 and 24/);
  });

  it('emits three soft-shadow layer sub-chains + feMerge', () => {
    const primitives = emittedFilterPrimitives(wrapInLayer('ElevationShadowFilter() {|f| f.elevation = 4; }'));
    const tags = primitives.map((p) => p.tag);
    const blurCount = tags.filter((t) => t === 'feGaussianBlur').length;
    const offsetCount = tags.filter((t) => t === 'feOffset').length;
    const floodCount = tags.filter((t) => t === 'feFlood').length;
    expect(blurCount).toBe(3);
    expect(offsetCount).toBe(3);
    expect(floodCount).toBe(3);
    expect(tags[tags.length - 1]).toBe('feMerge');
  });

  it('elevation = 0 emits only a pass-through feMerge', () => {
    const primitives = emittedFilterPrimitives(wrapInLayer('ElevationShadowFilter() {|f| f.elevation = 0; }'));
    expect(primitives.map((p) => p.tag)).toEqual(['feMerge']);
  });

  it('direction projects the offset vector — direction = 0deg means horizontal', () => {
    const primitives = emittedFilterPrimitives(
      wrapInLayer('ElevationShadowFilter() {|f| f.elevation = 6; f.direction = 0deg; }'),
    );
    const offsets = primitives.filter((p) => p.tag === 'feOffset');
    expect(offsets).toHaveLength(3);
    // direction = 0deg → cos = 1, sin = 0 → dx is positive, dy is 0
    expect(parseFloat(offsets[0].attrs.dx)).toBeGreaterThan(0);
    expect(offsets[0].attrs.dy).toBe('0');
  });

  it('tightness scales the per-layer distance and blur ratios', () => {
    const tight = emittedFilterPrimitives(
      wrapInLayer('ElevationShadowFilter() {|f| f.elevation = 6; f.tightness = 0.5; }'),
    );
    const wide = emittedFilterPrimitives(
      wrapInLayer('ElevationShadowFilter() {|f| f.elevation = 6; f.tightness = 2.0; }'),
    );
    const tightBlurs = tight.filter((p) => p.tag === 'feGaussianBlur').map((p) => parseFloat(p.attrs.stdDeviation));
    const wideBlurs = wide.filter((p) => p.tag === 'feGaussianBlur').map((p) => parseFloat(p.attrs.stdDeviation));
    // Wide tightness should produce 4× the blur of tight tightness for each layer
    for (let i = 0; i < tightBlurs.length; i++) {
      expect(wideBlurs[i] / tightBlurs[i]).toBeCloseTo(4);
    }
  });
});

// ============================================================================
// InnerShadowFilter
// ============================================================================

describe('InnerShadowFilter', () => {
  it('creates a filter with sensible defaults', () => {
    const result = compile(wrapInLayer('InnerShadowFilter() {|f| }'));
    const f = result.filters[0] as { kind: string; offsetX: number; offsetY: number; blur: number; opacity: number };
    expect(f.kind).toBe('inner-shadow');
    expect(f.offsetX).toBe(0);
    expect(f.offsetY).toBe(2);
    expect(f.blur).toBe(4);
    expect(f.opacity).toBe(0.5);
  });

  it('rejects negative blur', () => {
    expect(() =>
      compile(`let f = InnerShadowFilter() {|f| f.blur = -1; };`),
    ).toThrow(/InnerShadowFilter\.blur must be a finite non-negative number/);
  });

  it('emits the inset primitive chain (blur → offset → composite-out → flood → composite-in → composite-in → merge)', () => {
    const primitives = emittedFilterPrimitives(wrapInLayer('InnerShadowFilter() {|f| }'));
    const tags = primitives.map((p) => p.tag);
    expect(tags).toEqual([
      'feGaussianBlur',
      'feOffset',
      'feComposite',
      'feFlood',
      'feComposite',
      'feComposite',
      'feMerge',
    ]);
    // first composite is the inversion: operator = out
    expect(primitives[2].attrs.operator).toBe('out');
  });
});

// ============================================================================
// PixelateFilter
// ============================================================================

describe('PixelateFilter', () => {
  it('positional form sets width, height, radius', () => {
    const result = compile(wrapInLayer('PixelateFilter(10, 12, 5)'));
    const f = result.filters[0] as { kind: string; width: number; height: number; radius: number };
    expect(f.kind).toBe('pixelate');
    expect(f.width).toBe(10);
    expect(f.height).toBe(12);
    expect(f.radius).toBe(5);
  });

  it('block form sets the same properties', () => {
    const result = compile(
      wrapInLayer(`PixelateFilter() {|f| f.width = 10; f.height = 12; f.radius = 5; }`),
    );
    const f = result.filters[0] as { width: number; height: number; radius: number };
    expect(f.width).toBe(10);
    expect(f.height).toBe(12);
    expect(f.radius).toBe(5);
  });

  it('no-arg form uses defaults', () => {
    const result = compile(wrapInLayer('PixelateFilter()'));
    const f = result.filters[0] as { width: number; height: number; radius: number };
    expect(f.width).toBe(10);
    expect(f.height).toBe(10);
    expect(f.radius).toBe(5);
  });

  it('rejects mixing positional args with a trailing block', () => {
    expect(() =>
      compile(`let f = PixelateFilter(10, 10, 5) {|f| f.width = 20; };`),
    ).toThrow(/cannot combine positional arguments with a trailing block/);
  });

  it('rejects 1 or 2 positional args', () => {
    expect(() => compile(`let f = PixelateFilter(10);`)).toThrow(/expects 0 or 3 arguments/);
    expect(() => compile(`let f = PixelateFilter(10, 10);`)).toThrow(/expects 0 or 3 arguments/);
  });

  it('rejects non-positive positional values', () => {
    expect(() => compile(`let f = PixelateFilter(0, 10, 5);`)).toThrow(
      /PixelateFilter\(\) arguments must be finite positive numbers/,
    );
    expect(() => compile(`let f = PixelateFilter(10, -1, 5);`)).toThrow(
      /PixelateFilter\(\) arguments must be finite positive numbers/,
    );
  });

  it('rejects non-positive property writes', () => {
    expect(() =>
      compile(`let f = PixelateFilter() {|f| f.radius = 0; };`),
    ).toThrow(/PixelateFilter\.radius must be a finite positive number/);
  });

  it('emits feFlood → feComposite → feTile → feComposite → feMorphology', () => {
    const primitives = emittedFilterPrimitives(wrapInLayer('PixelateFilter(10, 10, 5)'));
    const tags = primitives.map((p) => p.tag);
    expect(tags).toEqual(['feFlood', 'feComposite', 'feTile', 'feComposite', 'feMorphology']);
    expect(primitives[0].attrs.x).toBe('2.5'); // radius / 2
    expect(primitives[1].attrs.width).toBe('10');
    expect(primitives[4].attrs.radius).toBe('5');
  });

  it('emits filterUnits="userSpaceOnUse" on the filter element', () => {
    // The pixelate technique places feFlood at user-space pixel offsets (e.g.
    // x=2.5, width=2). Without filterUnits=userSpaceOnUse those coords are
    // interpreted as fractions of the source bounding box and the flood lands
    // outside the filter region, producing an empty filter output (a blank
    // shape). This assertion locks the fix in place.
    const result = compile(wrapInLayer('PixelateFilter(10, 10, 5)'));
    const defs = buildDefs(result);
    const filterNode = defs.find(
      (n): n is VNode => typeof n === 'object' && n !== null && 'tag' in n && n.tag === 'filter',
    )!;
    expect(filterNode.attrs.filterUnits).toBe('userSpaceOnUse');
  });
});

// ============================================================================
// MotionBlurFilter
// ============================================================================

/** Find the single emitted <filter> VNode (with its attrs), plus all defs. */
function emittedDefs(source: string): VNode[] {
  return buildDefs(compile(source)).filter(
    (n): n is VNode => typeof n === 'object' && n !== null && 'tag' in n,
  );
}
function findTag(defs: VNode[], tag: string): VNode | undefined {
  return defs.find((n) => n.tag === tag);
}

describe('MotionBlurFilter', () => {
  describe('Construction & defaults', () => {
    it('creates a linear filter with documented defaults', () => {
      const result = compile(wrapInLayer('MotionBlurFilter() {|f| }'));
      expect(result.filters).toHaveLength(1);
      const f = result.filters[0] as {
        kind: string;
        motionType: string;
        distance: number;
        angle: number;
        samples: number;
      };
      expect(f.kind).toBe('motion-blur');
      expect(f.motionType).toBe('linear');
      expect(f.distance).toBe(10);
      expect(f.angle).toBe(0);
      expect(f.samples).toBe(12);
    });

    it('auto-generates a CSS-safe id', () => {
      const f = compile(wrapInLayer('MotionBlurFilter() {|f| }')).filters[0];
      expect(f.id).toMatch(/^pathogen-motion-blur-\d+$/);
    });

    it('rejects positional arguments', () => {
      expect(() => compile(`let f = MotionBlurFilter(20);`)).toThrow(
        /MotionBlurFilter\(\) takes no positional arguments/,
      );
    });
  });

  describe('Properties', () => {
    it('honors type / distance / angle / samples overrides', () => {
      const f = compile(
        wrapInLayer(`MotionBlurFilter() {|f|
          f.type = MotionBlurType.Progressive;
          f.distance = 24;
          f.angle = 90deg;
          f.samples = 8;
        }`),
      ).filters[0] as { motionType: string; distance: number; angle: number; samples: number };
      expect(f.motionType).toBe('progressive');
      expect(f.distance).toBe(24);
      expect(f.angle).toBeCloseTo(Math.PI / 2);
      expect(f.samples).toBe(8);
    });

    it('converts angle units (deg) to radians', () => {
      const f = compile(wrapInLayer('MotionBlurFilter() {|f| f.angle = 45deg; }')).filters[0] as {
        angle: number;
      };
      expect(f.angle).toBeCloseTo(Math.PI / 4);
    });

    it('exposes read-side property access (type reads back the enum string)', () => {
      const result = compile(`
        let f = MotionBlurFilter() {|f| f.type = MotionBlurType.Progressive; f.distance = 7; };
        log(f.id);
        log(f.type);
        log(f.distance);
        log(f.samples);
      `);
      const values = result.logs.map((l) => l.parts.map((p) => p.value).join(''));
      expect(values[0]).toMatch(/^pathogen-motion-blur-/);
      expect(values[1]).toBe('progressive');
      expect(values[2]).toBe('7');
      expect(values[3]).toBe('12');
    });
  });

  describe('Validation', () => {
    it('rejects an invalid type', () => {
      expect(() => compile(`let f = MotionBlurFilter() {|f| f.type = 'wobble'; };`)).toThrow(
        /Invalid value 'wobble' for MotionBlurFilter\.type/,
      );
    });
    it('rejects negative distance', () => {
      expect(() => compile(`let f = MotionBlurFilter() {|f| f.distance = -1; };`)).toThrow(
        /MotionBlurFilter\.distance must be a finite non-negative number/,
      );
    });
    it('rejects non-integer / out-of-range samples', () => {
      expect(() => compile(`let f = MotionBlurFilter() {|f| f.samples = 2.5; };`)).toThrow(
        /MotionBlurFilter\.samples must be an integer between 2 and 32/,
      );
      expect(() => compile(`let f = MotionBlurFilter() {|f| f.samples = 1; };`)).toThrow(
        /between 2 and 32/,
      );
      expect(() => compile(`let f = MotionBlurFilter() {|f| f.samples = 64; };`)).toThrow(
        /between 2 and 32/,
      );
    });
    it('rejects unknown properties', () => {
      expect(() => compile(`let f = MotionBlurFilter() {|f| f.wobble = 5; };`)).toThrow(
        /Cannot assign to MotionBlurFilter property 'wobble'/,
      );
    });
  });

  describe('Linear primitive chain', () => {
    it('averages N centered taps additively (feComposite arithmetic), never feMerge', () => {
      const primitives = emittedFilterPrimitives(
        wrapInLayer('MotionBlurFilter() {|f| f.type = MotionBlurType.Linear; f.distance = 20; f.angle = 0deg; f.samples = 4; }'),
      );
      const tags = primitives.map((p) => p.tag);
      // 4 taps → 4 feOffset, 4 feComponentTransfer, 3 arithmetic folds.
      expect(tags.filter((t) => t === 'feOffset')).toHaveLength(4);
      expect(tags.filter((t) => t === 'feComponentTransfer')).toHaveLength(4);
      const composites = primitives.filter((p) => p.tag === 'feComposite');
      expect(composites).toHaveLength(3);
      for (const c of composites) {
        expect(c.attrs.operator).toBe('arithmetic');
        expect(c.attrs.k2).toBe('1');
        expect(c.attrs.k3).toBe('1');
      }
      // Averaging must NOT use feMerge (over-compositing would brighten/bias).
      expect(tags).not.toContain('feMerge');
    });

    it('centers the smear and scales each tap to 1/samples', () => {
      const primitives = emittedFilterPrimitives(
        wrapInLayer('MotionBlurFilter() {|f| f.distance = 20; f.angle = 0deg; f.samples = 2; }'),
      );
      const offsets = primitives.filter((p) => p.tag === 'feOffset');
      // samples=2 → t = -0.5, +0.5 → dx = -10, +10 (centered, symmetric).
      expect(offsets[0].attrs.dx).toBe('-10');
      expect(offsets[1].attrs.dx).toBe('10');
      // each tap pre-scaled to 1/samples via feFuncA slope (read from the tree).
      const filterNode = findTag(
        emittedDefs(wrapInLayer('MotionBlurFilter() {|f| f.distance = 20; f.angle = 0deg; f.samples = 2; }')),
        'filter',
      )!;
      const transfer = (filterNode.children as VNode[]).find((c) => c.tag === 'feComponentTransfer')!;
      const funcA = (transfer.children as VNode[])[0];
      expect(funcA.attrs.slope).toBe('0.5');
    });

    it('steers offsets purely along the angle (0deg → x only, 90deg → y only)', () => {
      const horiz = emittedFilterPrimitives(
        wrapInLayer('MotionBlurFilter() {|f| f.distance = 20; f.angle = 0deg; f.samples = 4; }'),
      ).filter((p) => p.tag === 'feOffset');
      for (const o of horiz) expect(o.attrs.dy).toBe('0');

      const vert = emittedFilterPrimitives(
        wrapInLayer('MotionBlurFilter() {|f| f.distance = 20; f.angle = 90deg; f.samples = 4; }'),
      ).filter((p) => p.tag === 'feOffset');
      for (const o of vert) expect(o.attrs.dx).toBe('0'); // cos(90°) cleans to 0
    });

    it('uses a generous filter region so the smear is not clipped', () => {
      const filterNode = findTag(
        emittedDefs(wrapInLayer('MotionBlurFilter() {|f| f.distance = 20; }')),
        'filter',
      )!;
      expect(filterNode.attrs.width).toBe('200%');
      expect(filterNode.attrs.height).toBe('200%');
    });

    it('fuses the taps with a Gaussian aligned to the motion axis (smooth, not ghosted)', () => {
      // horizontal: smoothing along x only, perpendicular (y) stays crisp.
      const horiz = emittedFilterPrimitives(
        wrapInLayer('MotionBlurFilter() {|f| f.distance = 30; f.angle = 0deg; f.samples = 16; }'),
      );
      const blurH = horiz[horiz.length - 1];
      expect(blurH.tag).toBe('feGaussianBlur');
      const [sxH, syH] = blurH.attrs.stdDeviation.split(' ');
      expect(Number(sxH)).toBeGreaterThan(0);
      expect(Number(syH)).toBe(0);
      // vertical: mirror image — smoothing along y only.
      const vert = emittedFilterPrimitives(
        wrapInLayer('MotionBlurFilter() {|f| f.distance = 30; f.angle = 90deg; f.samples = 16; }'),
      );
      const [sxV, syV] = vert[vert.length - 1].attrs.stdDeviation.split(' ');
      expect(Number(sxV)).toBe(0);
      expect(Number(syV)).toBeGreaterThan(0);
    });
  });

  describe('Progressive primitive chain', () => {
    const progSrc = wrapInLayer(
      'MotionBlurFilter() {|f| f.type = MotionBlurType.Progressive; f.distance = 8; f.angle = 90deg; }',
    );

    it('crossfades sharp↔blurred via an feImage gradient mask, summed additively', () => {
      const prims = emittedFilterPrimitives(progSrc);
      const tags = prims.map((p) => p.tag);
      expect(tags).toEqual([
        'feGaussianBlur',
        'feImage',
        'feComponentTransfer', // invert ramp
        'feComposite', // sharp ∩ inverted ramp
        'feComposite', // blurred ∩ ramp
        'feComposite', // additive sum of the two complementary halves
      ]);
      // The final combine must be arithmetic (k2=k3=1), NOT feMerge — feMerge's
      // over-compositing would dip a solid shape's alpha through the midband.
      expect(tags).not.toContain('feMerge');
      const combine = prims[prims.length - 1];
      expect(combine.attrs.operator).toBe('arithmetic');
      expect(combine.attrs.k2).toBe('1');
      expect(combine.attrs.k3).toBe('1');
    });

    it('blurs by distance and references its own mask by id', () => {
      const prims = emittedFilterPrimitives(progSrc);
      expect(prims[0].attrs.stdDeviation).toBe('8');
      const filterNode = findTag(emittedDefs(progSrc), 'filter')!;
      const feImage = prims.find((p) => p.tag === 'feImage')!;
      expect(feImage.attrs.href).toBe(`#${filterNode.attrs.id}-mask`);
    });

    it('emits a sibling objectBoundingBox gradient + mask rect tracking the bbox', () => {
      const defs = emittedDefs(progSrc);
      const grad = findTag(defs, 'linearGradient')!;
      const rect = findTag(defs, 'rect')!;
      // 90deg ramp = top→bottom: vector (0.5,0)→(0.5,1).
      expect(grad.attrs.gradientUnits).toBe('objectBoundingBox');
      expect([grad.attrs.x1, grad.attrs.y1, grad.attrs.x2, grad.attrs.y2]).toEqual(['0.5', '0', '0.5', '1']);
      // bbox-tracking depends on the mask rect filling 100% of the (bbox) region.
      expect(rect.attrs.width).toBe('100%');
      expect(rect.attrs.height).toBe('100%');
      expect(rect.attrs.fill).toBe(`url(#${grad.attrs.id})`);
    });

    it('uses a tight filter region (oversized region washes the ramp out)', () => {
      const filterNode = findTag(emittedDefs(progSrc), 'filter')!;
      expect(filterNode.attrs.width).toBe('120%');
      expect(filterNode.attrs.height).toBe('120%');
      expect(filterNode.attrs.filterUnits).toBeUndefined(); // default objectBoundingBox
    });

    it('orients the gradient along the angle (0deg → left→right)', () => {
      const grad = findTag(
        emittedDefs(
          wrapInLayer('MotionBlurFilter() {|f| f.type = MotionBlurType.Progressive; f.angle = 0deg; }'),
        ),
        'linearGradient',
      )!;
      expect([grad.attrs.x1, grad.attrs.y1, grad.attrs.x2, grad.attrs.y2]).toEqual(['0', '0.5', '1', '0.5']);
    });
  });
});
