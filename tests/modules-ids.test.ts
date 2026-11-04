/**
 * Phase 1a, step 5a: ids from other files (docs/modules.md "Ids from other
 * files", decisions 27 and 33).
 *
 * The docs section comes first, item by item. Then a matrix over every kind
 * of def and every way a reference reaches your drawing. Every compile here
 * also checks that each url(#…) and href in the SVG names an id the SVG has,
 * so a def that is referenced but missing can't pass unnoticed.
 */
import { describe, expect, it } from 'vitest';

import { compile, resolveModules } from '../src';
import { idPrefixOf } from '../src/evaluator/module-runtime';
import { generateSvg } from '../src/svg-generator';

import type { CompileResult, ModuleGraph, ProjectFileHost } from '../src';

function memoryHost(files: Record<string, string>): ProjectFileHost {
  return {
    projectLabel: '/Users/you/my-gears',
    readFile: async (path) =>
      path in files
        ? { ok: true, bytes: new TextEncoder().encode(files[path]) }
        : { ok: false, code: 'not-found', osPath: `/Users/you/my-gears${path}` },
  };
}

async function graphOf(main: string, files: Record<string, string>): Promise<ModuleGraph> {
  const { graph, errors } = await resolveModules(main, { host: memoryHost(files), entry: '/main.pathogen' });
  expect(errors).toEqual([]);
  return graph;
}

/** Every url(#…) and href="#…" in the SVG names an id in the SVG. */
function expectReferencesResolve(result: CompileResult): void {
  const svg = generateSvg(result);
  const ids = new Set([...svg.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]));
  const refs = [...svg.matchAll(/url\(#([^)]+)\)/g), ...svg.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]);
  expect(refs.filter((ref) => !ids.has(ref))).toEqual([]);
}

async function compileFiles(main: string, files: Record<string, string>): Promise<CompileResult> {
  const result = compile(main, { modules: await graphOf(main, files) });
  expectReferencesResolve(result);
  return result;
}

async function errorOf(main: string, files: Record<string, string>): Promise<string> {
  const modules = await graphOf(main, files);
  try {
    compile(main, { modules });
  } catch (e) {
    return (e as Error).message;
  }
  throw new Error('expected the compile to fail');
}

/** Every emitted def id, kind by kind in output order. */
const defIds = (result: CompileResult): Record<string, string[]> => ({
  masks: result.masks.map((d) => d.id),
  clipPaths: result.clipPaths.map((d) => d.id),
  gradients: result.gradients.map((d) => d.id),
  patterns: result.patterns.map((d) => d.id),
  markers: result.markers.map((d) => d.id),
  filters: result.filters.map((d) => d.id),
});

const NONE = { masks: [], clipPaths: [], gradients: [], patterns: [], markers: [], filters: [] };

const styleOf = (result: CompileResult, layer: string, property: string): string | undefined =>
  result.layers.find((l) => l.name === layer)?.styles?.[property];

const mainLogs = (result: CompileResult): string[] =>
  result.logs.filter((l) => !l.file).map((l) => l.parts.map((p) => p.value).join(' '));

// An arrowhead marker, as in docs/markers.md.
const HEAD = 'const head = @{ m 0 0 l 10 5 l -10 5 z };\n';
const ARROWS = `${HEAD}export const tip = Marker('arrowhead', 10, 10) {|m|\n  m.append(head, #{ fill: Color('#333'); });\n};\n`;
const LINE = (markerEnd: string): string =>
  `define PathLayer('line') #{ stroke: Color('#333'); marker-end: ${markerEnd}; }\nlayer('line').apply { M 0 0 L 10 0 }\n`;

// --- docs/modules.md "Ids from other files" -----------------------------------

describe('docs: ids from other files', () => {
  it('the table: made in the file you compile, in arrows.pathogen, in parts/arrows.pathogen', async () => {
    const own = await compileFiles(
      `import { tip as theirs } from "./arrows.pathogen";\n${HEAD}let tip = Marker('arrowhead', 10, 10) {|m|\n  m.append(head);\n};\n${LINE('tip')}`,
      { '/arrows.pathogen': ARROWS },
    );
    expect(defIds(own).markers).toEqual(['arrowhead']);

    const top = await compileFiles(`import { tip } from "./arrows.pathogen";\n${LINE('tip')}`, {
      '/arrows.pathogen': ARROWS,
    });
    expect(defIds(top)).toEqual({ ...NONE, markers: ['arrows--arrowhead'] });
    expect(styleOf(top, 'line', 'marker-end')).toBe('url(#arrows--arrowhead)');

    const nested = await compileFiles(`import { tip } from "./parts/arrows.pathogen";\n${LINE('tip')}`, {
      '/parts/arrows.pathogen': ARROWS,
    });
    expect(defIds(nested)).toEqual({ ...NONE, markers: ['parts-arrows--arrowhead'] });
    expect(styleOf(nested, 'line', 'marker-end')).toBe('url(#parts-arrows--arrowhead)');
  });

  it('your own ids are never changed, even with the same id in an imported file', async () => {
    const result = await compileFiles(
      `import { tip as theirs } from "./parts/arrows.pathogen";\n${HEAD}let mine = Marker('arrowhead', 10, 10) {|m|\n  m.append(head);\n};\n${LINE('mine')}define PathLayer('other') #{ marker-end: theirs; }\nlayer('other').apply { M 0 5 L 10 5 }\n`,
      { '/parts/arrows.pathogen': ARROWS },
    );
    expect(defIds(result).markers).toEqual(['arrowhead', 'parts-arrows--arrowhead']);
    expect(styleOf(result, 'line', 'marker-end')).toBe('url(#arrowhead)');
    expect(styleOf(result, 'other', 'marker-end')).toBe('url(#parts-arrows--arrowhead)');
  });

  it('the prefix comes from the file the code is written in, also when your file calls its fn', async () => {
    const result = await compileFiles(
      `import { makeTip } from "./parts/arrows.pathogen";\nlet tip = makeTip();\n${LINE('tip')}`,
      {
        '/parts/arrows.pathogen': `${HEAD}export fn makeTip() {\n  return Marker('arrowhead', 10, 10) {|m|\n    m.append(head);\n  };\n}\n`,
      },
    );
    expect(defIds(result)).toEqual({ ...NONE, markers: ['parts-arrows--arrowhead'] });
  });

  it('values carry their full id: marker-end: tip just works, and tip.id is the full id', async () => {
    const result = await compileFiles(`import { tip } from "./parts/arrows.pathogen";\nlog(tip.id);\n${LINE('tip')}`, {
      '/parts/arrows.pathogen': ARROWS,
    });
    expect(mainLogs(result)).toEqual(['parts-arrows--arrowhead']);
    expect(styleOf(result, 'line', 'marker-end')).toBe('url(#parts-arrows--arrowhead)');
  });

  describe("raw url(#…) means the file's own id", () => {
    // The raw reference is written before the mask it names, and your file
    // has a mask with the same id: each reference must reach its own mask.
    const MASKS = {
      '/parts/masks.pathogen':
        "export const shade = #{ mask: url(#cut); };\nexport fn shadeLater() {\n  return #{ mask: url(#cut); };\n}\nconst cut = Mask('cut');\ncut.append(@{ m 0 0 h 10 v 10 z }, #{ fill: Color('#fff'); });\n",
    };
    const OWN_CUT = "let mine = Mask('cut');\nmine.append(@{ m 0 0 h 5 v 5 z }, #{ fill: Color('#fff'); });\n";

    it('in a style block the imported file made while it loaded, before its mask', async () => {
      const result = await compileFiles(
        `import { shade } from "./parts/masks.pathogen";\n${OWN_CUT}define PathLayer('theirs') shade;\ndefine PathLayer('ours') #{ mask: url(#cut); }\nlayer('theirs').apply { M 0 0 L 10 0 }\nlayer('ours').apply { M 0 5 L 10 5 }\n`,
        MASKS,
      );
      expect(defIds(result).masks).toEqual(['cut', 'parts-masks--cut']);
      expect(styleOf(result, 'theirs', 'mask')).toBe('url(#parts-masks--cut)');
      expect(styleOf(result, 'ours', 'mask')).toBe('url(#cut)');
    });

    it("in a style block its fn makes while your file draws, after your own 'cut' exists", async () => {
      const result = await compileFiles(
        `import { shadeLater } from "./parts/masks.pathogen";\n${OWN_CUT}define PathLayer('theirs') shadeLater();\nlayer('theirs').apply { M 0 0 L 10 0 }\n`,
        MASKS,
      );
      expect(defIds(result).masks).toEqual(['cut', 'parts-masks--cut']);
      expect(styleOf(result, 'theirs', 'mask')).toBe('url(#parts-masks--cut)');
    });

    it('a value passed in from your file keeps your id: m.id inside the imported fn', async () => {
      const result = await compileFiles(
        `import { maskedBy } from "./parts/masks.pathogen";\n${OWN_CUT}define PathLayer('ours') maskedBy(mine);\nlayer('ours').apply { M 0 0 L 10 0 }\n`,
        { '/parts/masks.pathogen': 'export fn maskedBy(m) {\n  return #{ mask: m.id; };\n}\n' },
      );
      expect(defIds(result).masks).toEqual(['cut']);
      expect(styleOf(result, 'ours', 'mask')).toBe('url(#cut)');
    });

    it("a name kept in a string is the file's own too, as it is compiled alone, even before its mask", async () => {
      const result = await compileFiles(
        `import { look } from "./parts/masks.pathogen";\ndefine PathLayer('theirs') look;\nlayer('theirs').apply { M 0 0 L 10 0 }\n`,
        {
          '/parts/masks.pathogen':
            "const name = 'cut';\nexport const look = #{ mask: name; };\nconst cut = Mask('cut');\ncut.append(@{ m 0 0 h 10 v 10 z }, #{ fill: Color('#fff'); });\n",
        },
      );
      expect(styleOf(result, 'theirs', 'mask')).toBe('url(#parts-masks--cut)');
    });

    it("a written name that looks prefixed already is still the file's own name", async () => {
      // Mask('a--cut') in a.pathogen is a--a--cut, and so is its raw reference.
      const result = await compileFiles(
        `import { look } from "./a.pathogen";\ndefine PathLayer('theirs') look;\nlayer('theirs').apply { M 0 0 L 10 0 }\n`,
        {
          '/a.pathogen':
            "export const look = #{ mask: url(#a--cut); };\nconst cut = Mask('a--cut');\ncut.append(@{ m 0 0 h 10 v 10 z });\n",
        },
      );
      expect(styleOf(result, 'theirs', 'mask')).toBe('url(#a--a--cut)');
      expect(defIds(result).masks).toEqual(['a--a--cut']);
    });
  });

  describe("a raw url(#…) in your file that only matches another file's id", () => {
    it('is a warning that names the full id, at the value; the compile still succeeds', async () => {
      // Compiled directly: the reference dangles, which is what the warning is about.
      const main = `import { tip } from "./parts/arrows.pathogen";\n${LINE('url(#arrowhead)')}`;
      const result = compile(main, { modules: await graphOf(main, { '/parts/arrows.pathogen': ARROWS }) });
      expect(result.warnings.map((w) => [w.code, w.line, w.message])).toEqual([
        [
          'imported-id',
          2,
          'url(#arrowhead) matches no id in this file. The arrowhead made in parts/arrows.pathogen is parts-arrows--arrowhead in your SVG; use the imported value instead.',
        ],
      ]);
    });

    it('once per place it is written, however often that code runs', async () => {
      const main = `import { tip } from "./parts/arrows.pathogen";\nfor (i in 0..<3) {\n  let look = #{ marker-end: url(#arrowhead); };\n}\n`;
      const result = compile(main, { modules: await graphOf(main, { '/parts/arrows.pathogen': ARROWS }) });
      expect(result.warnings.map((w) => [w.code, w.line])).toEqual([['imported-id', 3]]);
    });

    it('--strict=imported-id makes it an error at the value', async () => {
      const main = `import { tip } from "./parts/arrows.pathogen";\n${LINE('url(#arrowhead)')}`;
      const modules = await graphOf(main, { '/parts/arrows.pathogen': ARROWS });
      expect(() => compile(main, { modules, strict: ['imported-id'] })).toThrow(
        /^Line 2, col \d+: url\(#arrowhead\) matches no id in this file\./,
      );
    });

    it('no warning when your file has that id itself', async () => {
      const main = `import { tip as theirs } from "./parts/arrows.pathogen";\n${HEAD}let mine = Marker('arrowhead', 10, 10) {|m|\n  m.append(head);\n};\n${LINE('url(#arrowhead)')}`;
      const result = await compileFiles(main, { '/parts/arrows.pathogen': ARROWS });
      expect(result.warnings).toEqual([]);
    });
  });

  describe("only what's used reaches your SVG", () => {
    const KIT = {
      '/parts/kit.pathogen': `${ARROWS}export const spare = Mask('spare');\nconst hidden = LinearGradient('hidden', 0, 0, 1, 0);\n`,
    };

    it('a used marker joins your SVG; the unused mask and private gradient stay out', async () => {
      const result = await compileFiles(`import { tip, spare } from "./parts/kit.pathogen";\n${LINE('tip')}`, KIT);
      expect(defIds(result)).toEqual({ ...NONE, markers: ['parts-kit--arrowhead'] });
    });

    it('importing without using anything adds no defs', async () => {
      const result = await compileFiles('import * as kit from "./parts/kit.pathogen";\nM 0 0 L 10 0', KIT);
      expect(defIds(result)).toEqual(NONE);
    });

    it('a def joins with the defs it refers to: a marker filled with a gradient', async () => {
      const result = await compileFiles(`import { tip } from "./parts/arrows.pathogen";\n${LINE('tip')}`, {
        '/parts/arrows.pathogen': `${HEAD}const sky = LinearGradient('sky', 0, 0, 1, 0) {|g|\n  g.stop(0, Color('#fff'));\n  g.stop(1, Color('#00f'));\n};\nexport const tip = Marker('arrowhead', 10, 10) {|m|\n  m.append(head, #{ fill: sky; });\n};\n`,
      });
      expect(defIds(result)).toEqual({
        ...NONE,
        gradients: ['parts-arrows--sky'],
        markers: ['parts-arrows--arrowhead'],
      });
    });

    const SHADES = {
      '/parts/shades.pathogen':
        "export const sky = LinearGradient('sky', 0, 0, 1, 0) {|g|\n  g.stop(0, Color('#fff'));\n  g.stop(1, Color('#00f'));\n};\nexport const lighter = sky.inherit('sky-light');\n",
    };
    const FILLED = (fill: string): string =>
      `define PathLayer('area') #{ fill: ${fill}; }\nlayer('area').apply { M 0 0 h 10 v 10 z }\n`;

    it('a gradient joins with the gradient it inherits from, both prefixed', async () => {
      const result = await compileFiles(
        `import { lighter } from "./parts/shades.pathogen";\n${FILLED('lighter')}`,
        SHADES,
      );
      expect(defIds(result).gradients).toEqual(['parts-shades--sky-light', 'parts-shades--sky']);
      expect(result.gradients.map((g) => g.href)).toEqual(['parts-shades--sky', undefined]);
    });

    it('your gradient inheriting from an imported one pulls that one in', async () => {
      const result = await compileFiles(
        `import { sky } from "./parts/shades.pathogen";\nlet mine = sky.inherit('mine');\n${FILLED('mine')}`,
        SHADES,
      );
      expect(defIds(result).gradients).toEqual(['mine', 'parts-shades--sky']);
      expect(result.gradients[0].href).toBe('parts-shades--sky');
    });
  });

  describe('escaping', () => {
    it.each([
      ['/arrows.pathogen', 'arrows--'],
      ['/parts/arrows.pathogen', 'parts-arrows--'],
      ['/2026-poster.pathogen', '_2026-poster--'],
      ['/my gears.pathogen', 'my_20gears--'],
      ['/café.pathogen', 'caf_e9--'],
      ['/v1.2/gears.pathogen', 'v1_2e2-gears--'],
      ['/Parts_A/x-y.pathogen', 'Parts_A-x-y--'],
    ])('%s gives %s', (path, prefix) => {
      expect(idPrefixOf(path)).toBe(prefix);
    });

    it('an escaped prefix reaches the SVG', async () => {
      const result = await compileFiles(`import { tip } from "./my gears.pathogen";\n${LINE('tip')}`, {
        '/my gears.pathogen': ARROWS,
      });
      expect(defIds(result).markers).toEqual(['my_20gears--arrowhead']);
    });
  });

  describe('clashes are errors', () => {
    it('two files that would get the same prefix', async () => {
      expect(
        await errorOf(
          'import { a } from "./parts-gears.pathogen";\nimport { b } from "./parts/gears.pathogen";\nlog(a + b);',
          {
            '/parts-gears.pathogen': 'export const a = 1;\n',
            '/parts/gears.pathogen': 'export const b = 2;\n',
          },
        ),
      ).toBe(
        'parts-gears.pathogen and parts/gears.pathogen would both give their ids the prefix parts-gears--. Rename one of the files.',
      );
    });

    const TIPS = {
      '/arrows.pathogen': `${HEAD}export const tip = Marker('tip', 10, 10) {|m|\n  m.append(head);\n};\n`,
    };
    const MINE = `import { tip } from "./arrows.pathogen";\n${HEAD}\nlet mine = Marker('arrows--tip', 10, 10) {|m|\n  m.append(head);\n};\n`;

    it('one of your ids matching an imported one, when both reach your SVG', async () => {
      expect(
        await errorOf(
          `${MINE}${LINE('mine')}define PathLayer('other') #{ marker-end: tip; }\nlayer('other').apply { M 0 5 L 10 5 }\n`,
          TIPS,
        ),
      ).toBe(
        "Line 4, col 12: Duplicate defs ID 'arrows--tip': made in main.pathogen line 4, and as 'tip' in arrows.pathogen line 2. Rename one of them.",
      );
    });

    it('…even when the reference was meant for your own: a reference names an id, so it reaches both', async () => {
      expect(await errorOf(`${MINE}${LINE('mine')}`, TIPS)).toMatch(/^Line 4, col 12: Duplicate defs ID 'arrows--tip'/);
    });

    it('…but not when nothing refers to that id, so the imported one stays out of your SVG', async () => {
      const result = await compileFiles(`${MINE}M 0 0 L 10 0`, TIPS);
      expect(defIds(result).markers).toEqual(['arrows--tip']);
    });

    it("an imported fn making the same id twice is that file's duplicate, traced to your call", async () => {
      const message = await errorOf(
        `import { makeTip } from "./parts/arrows.pathogen";\nlet a = makeTip();\nlet b = makeTip();`,
        {
          '/parts/arrows.pathogen': `${HEAD}export fn makeTip() {\n  return Marker('arrowhead', 10, 10) {|m|\n    m.append(head);\n  };\n}\n`,
        },
      );
      expect(message).toMatch(/^parts\/arrows\.pathogen line 3\b.*Duplicate defs ID 'parts-arrows--arrowhead'/);
      expect(message).toMatch(/\n {2}called from main\.pathogen line 3$/);
    });

    it('two files whose prefix and id add up to the same full id name both files', async () => {
      const message = await errorOf(
        'import { m } from "./a.pathogen";\nimport { n } from "./a--b.pathogen";\nlog(m.id);',
        {
          '/a.pathogen': "export const m = Mask('b--x');\n",
          '/a--b.pathogen': "export const n = Mask('x');\n",
        },
      );
      expect(message).toBe(
        "a--b.pathogen line 1: Duplicate defs ID 'a--b--x': made as 'b--x' in a.pathogen line 1, and as 'x' in a--b.pathogen. Rename one of them.\n" +
          '  imported from main.pathogen line 2',
      );
    });
  });

  describe('noise seeds', () => {
    const seedAlone = (source: string): number => {
      const result = compile(source);
      const filter = result.filters[0];
      if (filter.kind !== 'noise') throw new Error('expected a noise filter');
      return filter.seed;
    };
    const TEXTURES = { '/textures.pathogen': 'export const grain = NoiseFilter();\n' };
    const GRAINY = (filter: string): string =>
      `define PathLayer('a') #{ filter: ${filter}; }\nlayer('a').apply { M 0 0 h 10 v 10 z }\n`;

    it('a top-level NoiseFilter() has the same seed imported as compiled alone', async () => {
      const result = await compileFiles(`import { grain } from "./textures.pathogen";\n${GRAINY('grain')}`, TEXTURES);
      expect(defIds(result).filters).toEqual(['textures--pathogen-noise-1']);
      const filter = result.filters[0];
      expect(filter.kind === 'noise' && filter.seed).toBe(
        seedAlone(`${TEXTURES['/textures.pathogen']}${GRAINY('grain')}`),
      );
    });

    it('one made by an exported fn is numbered in the order your file calls it, beside your own', async () => {
      const result = await compileFiles(
        `import { freshGrain } from "./textures.pathogen";\nlet mine = NoiseFilter();\nlet first = freshGrain();\nlet second = freshGrain();\n${GRAINY('mine')}define PathLayer('b') #{ filter: first; }\ndefine PathLayer('c') #{ filter: second; }\nlayer('b').apply { M 0 0 h 5 }\nlayer('c').apply { M 0 0 h 5 }\n`,
        { '/textures.pathogen': 'export fn freshGrain() {\n  return NoiseFilter();\n}\n' },
      );
      expect(defIds(result).filters).toEqual([
        'pathogen-noise-1',
        'textures--pathogen-noise-1',
        'textures--pathogen-noise-2',
      ]);
      // The prefix isn't part of the seed: each file's first filter has the same pattern.
      const seeds = result.filters.map((f) => (f.kind === 'noise' ? f.seed : -1));
      expect(seeds[0]).toBe(seeds[1]);
      expect(seeds[2]).not.toBe(seeds[1]);
    });
  });
});

// --- every kind of def, every route a reference takes ---------------------------

interface DefKind {
  /** Statements in kit.pathogen that make the def as `d`. */
  make: string;
  /** The id as written, or the auto id for a filter. */
  written: string;
  /** The style property that refers to it. */
  property: string;
  /** Whether the value itself goes in a style (masks and clip paths use `.id`). */
  value: boolean;
}

const KINDS: Record<string, DefKind> = {
  Mask: {
    make: "const d = Mask('shape');\nd.append(@{ m 0 0 h 10 v 10 z }, #{ fill: Color('#fff'); });",
    written: 'shape',
    property: 'mask',
    value: false,
  },
  ClipPath: {
    make: "const d = ClipPath('shape');\nd.append(@{ m 0 0 h 10 v 10 z });",
    written: 'shape',
    property: 'clip-path',
    value: false,
  },
  LinearGradient: {
    make: "const d = LinearGradient('shape', 0, 0, 1, 0) {|g|\n  g.stop(0, Color('#fff'));\n  g.stop(1, Color('#00f'));\n};",
    written: 'shape',
    property: 'fill',
    value: true,
  },
  RadialGradient: {
    make: "const d = RadialGradient('shape', 0.5, 0.5, 0.5) {|g|\n  g.stop(0, Color('#fff'));\n  g.stop(1, Color('#00f'));\n};",
    written: 'shape',
    property: 'fill',
    value: true,
  },
  Pattern: {
    make: "const d = Pattern('shape', 0, 0, 10, 10) {|p|\n  p.append(@{ m 0 0 h 5 v 5 z }, #{ fill: Color('#000'); });\n};",
    written: 'shape',
    property: 'fill',
    value: true,
  },
  Marker: {
    make: "const d = Marker('shape', 10, 10) {|m|\n  m.append(@{ m 0 0 l 10 5 l -10 5 z });\n};",
    written: 'shape',
    property: 'marker-end',
    value: true,
  },
  GlowFilter: { make: 'const d = GlowFilter();', written: 'pathogen-glow-1', property: 'filter', value: true },
};

/** How `d` is written in a style, so the reference becomes url(#<full id>). */
const refTo = (kind: DefKind, name: string): string => (kind.value ? name : `${name}.id`);

const SHAPE_LAYER = (style: string): string => `define PathLayer('a') ${style}\nlayer('a').apply { M 0 0 L 10 0 }\n`;

describe.each(Object.entries(KINDS))('%s from another file', (_name, kind) => {
  const full = `kit--${kind.written}`;
  const kit = (extra = ''): Record<string, string> => ({ '/kit.pathogen': `export ${kind.make}\n${extra}` });
  const emitted = (result: CompileResult): string[] => Object.values(defIds(result)).flat();

  it('as a value, or its .id', async () => {
    const result = await compileFiles(
      `import { d } from "./kit.pathogen";\n${SHAPE_LAYER(`#{ ${kind.property}: ${refTo(kind, 'd')}; }`)}`,
      kit(),
    );
    expect(emitted(result)).toEqual([full]);
    expect(styleOf(result, 'a', kind.property)).toBe(`url(#${full})`);
  });

  it('through a style block the file resolved while it loaded', async () => {
    const result = await compileFiles(
      `import { look } from "./kit.pathogen";\n${SHAPE_LAYER('look;')}`,
      kit(`export const look = #{ ${kind.property}: ${refTo(kind, 'd')}; };\n`),
    );
    expect(emitted(result)).toEqual([full]);
  });

  it("inside another def's content", async () => {
    const result = await compileFiles(
      `import { holder } from "./kit.pathogen";\n${SHAPE_LAYER('#{ mask: holder.id; }')}`,
      kit(
        `export const holder = Mask('holder');\nholder.append(@{ m 0 0 h 10 v 10 z }, #{ ${kind.property}: ${refTo(kind, 'd')}; });\n`,
      ),
    );
    expect(emitted(result).sort()).toEqual(['kit--holder', full].sort());
  });

  it('by its full id written raw', async () => {
    const main = `import * as kit from "./kit.pathogen";\n${SHAPE_LAYER(`#{ ${kind.property}: url(#${full}); }`)}`;
    const result = await compileFiles(main, kit());
    expect(emitted(result)).toEqual([full]);
    expect(result.warnings).toEqual([]);
  });

  it.skipIf(!kind.make.includes('Gradient'))('inherited by your own gradient', async () => {
    const result = await compileFiles(
      `import { d } from "./kit.pathogen";\nlet mine = d.inherit('mine');\n${SHAPE_LAYER('#{ fill: mine; }')}`,
      kit(),
    );
    expect(defIds(result).gradients).toEqual(['mine', full]);
  });
});

// --- what step 3 already does, pinned here ----------------------------------------

describe("an imported file's subscriptions", () => {
  it('run on its own drawing at the end of its load, before its values are fixed', async () => {
    const corners =
      "define PathLayer('shape') #{ stroke: Color('#000'); }\nlet corners = [];\nlayer('shape').subscribe('endpoint') {|corner|\n  corners.push(corner);\n};\nlayer('shape').apply { M 0 0 L 10 0 L 10 10 }\nexport fn cornerCount() {\n  return corners.length;\n}\n";
    // As many endpoints as a query over the same layer finds in the file compiled on its own.
    const alone = compile(`${corners}log(layer('shape').queryAll('endpoint').length);`);
    const expected = alone.logs.map((l) => l.parts.map((p) => p.value).join(' '));
    expect(expected).toEqual(['2']);
    const result = await compileFiles('import { cornerCount } from "./corners.pathogen";\nlog(cornerCount());', {
      '/corners.pathogen': corners,
    });
    expect(mainLogs(result)).toEqual(expected);
    // Its drawing stays in its file.
    expect(result.layers.find((l) => l.name === 'shape')).toBeUndefined();
  });
});

describe('trace: true', () => {
  // The search skips the trace-only fields (they're never drawn), so tracing
  // must not change which defs reach the SVG.
  it('gives the same defs as without trace', async () => {
    const main = `import { tip } from "./parts/arrows.pathogen";\n${LINE('tip')}`;
    const files = {
      '/parts/arrows.pathogen': `${HEAD}const sky = LinearGradient('sky', 0, 0, 1, 0);\nexport const tip = Marker('arrowhead', 10, 10) {|m|\n  m.append(head, #{ fill: sky; });\n};\n`,
    };
    const modules = await graphOf(main, files);
    const traced = compile(main, { modules, trace: true });
    expectReferencesResolve(traced);
    expect(defIds(traced)).toEqual(defIds(compile(main, { modules })));
    expect(defIds(traced)).toEqual({ ...NONE, gradients: ['parts-arrows--sky'], markers: ['parts-arrows--arrowhead'] });
  });
});

describe('one-file programs and your own ids', () => {
  it('a compile with no files is unchanged: same ids, same seed', () => {
    const result = compile(
      `${HEAD}let tip = Marker('arrowhead', 10, 10) {|m|\n  m.append(head);\n};\nlet n = NoiseFilter();\n${LINE('tip')}`,
    );
    expect(defIds(result)).toEqual({ ...NONE, markers: ['arrowhead'], filters: ['pathogen-noise-1'] });
    expectReferencesResolve(result);
  });
});
