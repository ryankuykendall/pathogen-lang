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
    define PathLayer('layer') \${
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
        define PathLayer('a') \${ fill: hotpink; filter: f; }
        layer('a').apply { M 0 0 L 10 0 L 10 10 L 0 10 Z }
      `);
      const layer = result.layers.find((l) => l.name === 'a')!;
      expect(layer.styles.filter).toBe(`url(#${result.filters[0].id})`);
    });

    it('reusing one filter across N layers emits a single filter def', () => {
      const result = compile(`
        let g = NoiseFilter() {|f| f.style = NoiseFilterStyle.Paper; };
        define PathLayer('a') \${ fill: red; filter: g; }
        define PathLayer('b') \${ fill: blue; filter: g; }
        define PathLayer('c') \${ fill: green; filter: g; }
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
        define PathLayer('a') \${
          fill: red;
          filter: NoiseFilter();
        }
        define PathLayer('b') \${
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
      define PathLayer('a') \${ fill: red; filter: f; }
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
