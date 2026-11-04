/**
 * Phase 1a, step 4: what an imported file holds is fixed once it has loaded
 * (docs/modules.md "What you import is fixed", decisions 26 and 29).
 *
 * The docs examples come first, word for word. Then a matrix over every
 * method that changes its receiver (CHANGES_RECEIVER), every property and
 * index write, and Object.delete: each is an error on an imported value
 * ("comes from"), an error from the owning file's own exported fn ("belongs
 * to"), and works while the owning file loads. Last, every method the API
 * declares must be classified, so a new changing method can't slip past.
 */
import { describe, expect, it } from 'vitest';

import { compile, resolveModules } from '../src';
import { CHANGES_RECEIVER } from '../src/evaluator/module-runtime';
import { TYPE_MEMBERS } from '../src/language-services/completion-data.generated';

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

async function compileFiles(main: string, files: Record<string, string>): Promise<CompileResult> {
  return compile(main, { modules: await graphOf(main, files) });
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

/** What the compiled file logged (logs from other files carry `file`). */
const mainLogs = (result: CompileResult): string[] =>
  result.logs.filter((l) => !l.file).map((l) => l.parts.map((p) => p.value).join(' '));

// --- docs/modules.md "What you import is fixed" ------------------------------

describe('docs: what you import is fixed', () => {
  const SIZES = { '/parts/sizes.pathogen': 'export const sizes = [3, 5, 8];\n' };
  const STYLE = { '/parts/style.pathogen': 'export const style = { width: 2, color: "teal" };\n' };
  const COLORS = { '/colors.pathogen': 'export const palette = Cycler(["teal", "coral"]);\n' };

  it('sizes.push(9) on an imported array', async () => {
    expect(await errorOf('import { sizes } from "./parts/sizes.pathogen";\nsizes.push(9);', SIZES)).toBe(
      'Line 2, col 1: Cannot change sizes — it comes from parts/sizes.pathogen, and imported values are fixed. Copy it first: [...sizes]',
    );
  });

  it('…and the copy the docs suggest works', async () => {
    const result = await compileFiles(
      'import { sizes } from "./parts/sizes.pathogen";\nlet mySizes = [...sizes];\nmySizes.push(9);\nlog(mySizes);\nlog(sizes);',
      SIZES,
    );
    expect(mainLogs(result)).toEqual(['[3, 5, 8, 9]', '[3, 5, 8]']);
  });

  it("style['width'] = 4 on an imported object", async () => {
    expect(await errorOf('import { style } from "./parts/style.pathogen";\nstyle[\'width\'] = 4;', STYLE)).toBe(
      'Line 2, col 1: Cannot change style — it comes from parts/style.pathogen, and imported values are fixed. Copy it first: { ...style }',
    );
  });

  it('…and the copy the docs suggest works', async () => {
    const result = await compileFiles(
      'import { style } from "./parts/style.pathogen";\nlet myStyle = { ...style, width: 4 };\nlog(myStyle.width);\nlog(style.width);',
      STYLE,
    );
    expect(mainLogs(result)).toEqual(['4', '2']);
  });

  it('palette.pick() on an imported Cycler', async () => {
    expect(await errorOf('import { palette } from "./colors.pathogen";\nlet first = palette.pick();', COLORS)).toBe(
      'Line 2, col 13: Cannot pick from palette — it comes from colors.pathogen, and imported values are fixed. Export a fn that makes one instead: export fn palette() { return Cycler([…]); }',
    );
  });

  it('…and a fn that makes one works, each call with its own position', async () => {
    const result = await compileFiles(
      'import { palette } from "./colors.pathogen";\nlog(palette().pick());\nlog(palette().pick());',
      {
        '/colors.pathogen': 'export fn palette() {\n  return Cycler(["teal", "coral"]);\n}\n',
      },
    );
    expect(mainLogs(result)).toEqual(['teal', 'teal']);
  });

  it('.stop() on an imported gradient', async () => {
    expect(
      await errorOf('import { sky } from "./parts/shades.pathogen";\nsky.stop(1, Color("#fff"));', {
        '/parts/shades.pathogen': 'export const sky = LinearGradient("sky", 0, 0, 1, 0);\n',
      }),
    ).toBe(
      'Line 2, col 1: Cannot change sky — it comes from parts/shades.pathogen, and imported values are fixed. Make your own, or export a fn that makes one',
    );
  });

  const IDS = `// ids.pathogen
let lastId = 0;

export fn nextId() {
  lastId = lastId + 1;
  return lastId;
}
`;

  it('the ids.pathogen example, word for word', async () => {
    expect(
      await errorOf('// main.pathogen\nimport { nextId } from "./ids.pathogen";\n\nlog(nextId());', {
        '/ids.pathogen': IDS,
      }),
    ).toBe(
      'ids.pathogen line 5, col 3: Cannot assign to lastId — it belongs to ids.pathogen, whose variables are fixed once it has loaded. Return the new value instead, or pass it in as a parameter\n' +
        '  called from main.pathogen line 4',
    );
  });

  it('…the version that takes and returns the value works', async () => {
    const result = await compileFiles('import { nextId } from "./ids.pathogen";\nlog(nextId(41));', {
      '/ids.pathogen': '// ids.pathogen\nexport fn nextId(lastId) {\n  return lastId + 1;\n}\n',
    });
    expect(mainLogs(result)).toEqual(['42']);
  });

  it('…and inside ids.pathogen itself, while it runs, nextId() changes lastId as usual', async () => {
    const result = await compileFiles('import { nextId } from "./ids.pathogen";', {
      '/ids.pathogen': `${IDS}log(nextId());\nlog(nextId());\n`,
    });
    expect(result.logs.filter((l) => l.file === 'ids.pathogen').map((l) => l.parts[0].value)).toEqual(['1', '2']);
  });

  it("an exported fn changing an array its file holds: 'belongs to'", async () => {
    const message = await errorOf('import { remember } from "./names.pathogen";\nremember("ada");', {
      '/names.pathogen': 'const seen = [];\nexport fn remember(name) {\n  seen.push(name);\n}\n',
    });
    expect(message).toBe(
      'names.pathogen line 3, col 3: Cannot change seen — it belongs to names.pathogen, whose values are fixed once it has loaded. Return a new array instead\n' +
        '  called from main.pathogen line 2',
    );
  });

  it("…an object: 'Return a new object instead'", async () => {
    const message = await errorOf('import { note } from "./names.pathogen";\nnote("ada");', {
      '/names.pathogen': 'const seen = {};\nexport fn note(name) {\n  seen[name] = true;\n}\n',
    });
    expect(message).toBe(
      'names.pathogen line 3, col 3: Cannot change seen — it belongs to names.pathogen, whose values are fixed once it has loaded. Return a new object instead\n' +
        '  called from main.pathogen line 2',
    );
  });

  it("…a Cycler: the library's own palette", async () => {
    const message = await errorOf('import { nextColor } from "./colors.pathogen";\nlog(nextColor());', {
      '/colors.pathogen':
        'const palette = Cycler(["teal", "coral"]);\nexport fn nextColor() {\n  return palette.pick();\n}\n',
    });
    expect(message).toBe(
      'colors.pathogen line 3, col 10: Cannot pick from palette — it belongs to colors.pathogen, whose values are fixed once it has loaded. Pass a Cycler in as a parameter instead\n' +
        '  called from main.pathogen line 2',
    );
  });

  it('…and passing a Cycler in, as that message says, works', async () => {
    const result = await compileFiles(
      'import { nextColor } from "./colors.pathogen";\nlet mine = Cycler(["teal", "coral"]);\nlog(nextColor(mine));\nlog(nextColor(mine));',
      { '/colors.pathogen': 'export fn nextColor(palette) {\n  return palette.pick();\n}\n' },
    );
    expect(mainLogs(result)).toEqual(['teal', 'coral']);
  });

  it("…another value: 'Make a new one inside the fn, or pass one in as a parameter'", async () => {
    const message = await errorOf('import { brighten } from "./parts/shades.pathogen";\nbrighten();', {
      '/parts/shades.pathogen':
        'const sky = LinearGradient("sky", 0, 0, 1, 0);\nexport fn brighten() {\n  sky.stop(1, Color("#fff"));\n}\n',
    });
    expect(message).toBe(
      'parts/shades.pathogen line 3, col 3: Cannot change sky — it belongs to parts/shades.pathogen, whose values are fixed once it has loaded. Make a new one inside the fn, or pass one in as a parameter\n' +
        '  called from main.pathogen line 2',
    );
  });

  it.each([
    ['kit.extra = 1;', 'Line 2, col 1'],
    ['kit["extra"] = 1;', 'Line 2, col 1'],
  ])('a namespace: %s', async (line, where) => {
    expect(
      await errorOf(`import * as kit from "./kit.pathogen";\n${line}`, { '/kit.pathogen': 'export const size = 3;\n' }),
    ).toBe(
      `${where}: Cannot change kit — it is imported from kit.pathogen, and imported values are fixed. Declare a variable of your own with let, under another name`,
    );
  });

  it('reading what you import is fine: iterating, copying, and methods that return new values', async () => {
    const result = await compileFiles(
      'import { sizes } from "./parts/sizes.pathogen";\nlog(sizes.map {|n| n * 2 });\nlog(sizes.sort {|a, b| return calc(b - a); });\nlog(sizes.slice(1));\nfor (n in sizes) { log(n); }',
      SIZES,
    );
    expect(mainLogs(result)).toEqual(['[6, 10, 16]', '[8, 5, 3]', '[5, 8]', '3', '5', '8']);
  });
});

// --- every way to change a value --------------------------------------------

interface ChangeCase {
  /** Module code that defines `v` (and whatever it needs). */
  make: string;
  /** One statement that changes `v`. */
  change: string;
  kind: 'array' | 'object' | 'cycler' | 'other';
  /** The column of the change in its statement, counted from the statement's start. */
  at?: number;
}

// `held`, not `v`: a lone `v` starts a path command (`v.fill {` would parse as one).
const SQUARE = '@{ h 10 v 10 h -10 z }';
// The builder a variableOffset block hands out, kept past the block. Its
// stops end at 40%, so a later stop() call is still in order.
const BUILDER = `let keep = null;
const spine = @{ h 100 };
const ribbon = spine.variableOffset() {|go, pb|
  keep = go;
  go.stop(10%, 5, CurveContinuity.G1);
  go.stop(40%, 5, CurveContinuity.G1);
};
const held = keep;`;
// Caps exist only on the compound builder.
const COMPOUND_BUILDER = `let keep = null;
const spine = @{ h 100 };
const ribbon = spine.compoundVariableOffset() {|go, pb|
  keep = go;
  go.stop(10%, 5, CurveContinuity.G1, -5, CurveContinuity.G1);
  go.stop(90%, 5, CurveContinuity.G1, -5, CurveContinuity.G1);
};
const held = keep;`;

/** One case per CHANGES_RECEIVER entry. */
const METHOD_CASES: Record<string, ChangeCase> = {
  'Array.push': { make: 'const held = [1, 2];', change: 'held.push(3);', kind: 'array' },
  'Array.pop': { make: 'const held = [1, 2];', change: 'held.pop();', kind: 'array' },
  'Array.shift': { make: 'const held = [1, 2];', change: 'held.shift();', kind: 'array' },
  'Array.unshift': { make: 'const held = [1, 2];', change: 'held.unshift(0);', kind: 'array' },
  'Cycler.pick': { make: 'const held = Cycler([1, 2]);', change: 'held.pick();', kind: 'cycler' },
  'Grid.set': { make: 'const held = Grid(1, 2, { xDim: 10, yDim: 10 });', change: 'held.set(0, 0, 5);', kind: 'other' },
  'Grid.fill': {
    make: 'const held = Grid(1, 2, { xDim: 10, yDim: 10 });',
    change: 'held.fill {|row, col, center| return 1; };',
    kind: 'other',
  },
  'Gradient.stop': {
    make: 'const held = LinearGradient("sky", 0, 0, 1, 0);',
    change: 'held.stop(1, Color("#fff"));',
    kind: 'other',
  },
  'Gradient.colorAll': {
    make: 'const held = MeshGradient("mesh", 200, 100, 3, 2);',
    change: 'held.colorAll(Color("#000"));',
    kind: 'other',
  },
  'Gradient.point': {
    make: 'const held = FreeformGradient("free", 200, 100);',
    change: 'held.point(0, 0, Color("#000"));',
    kind: 'other',
  },
  'Gradient.contour': {
    make: 'const held = TopoGradient("topo", 200, 100);',
    change: `held.contour(${SQUARE}.project(100, 50), 0.5, Color("#000"));`,
    kind: 'other',
  },
  'MeshPoint.translate': {
    make: 'const mesh = MeshGradient("mesh", 200, 100, 3, 2);\nconst held = mesh.getPoint(0, 0);',
    change: 'held.translate(1, 1);',
    kind: 'other',
  },
  'Mask.append': {
    make: 'const held = Mask("cut");',
    change: `held.append(${SQUARE}, #{ fill: white; });`,
    kind: 'other',
  },
  'ClipPath.append': { make: 'const held = ClipPath("clip");', change: `held.append(${SQUARE});`, kind: 'other' },
  'Pattern.append': {
    make: 'const held = Pattern("dots", 0, 0, 10, 10);',
    change: `held.append(${SQUARE});`,
    kind: 'other',
  },
  'Marker.append': { make: 'const held = Marker("tip", 10, 10);', change: `held.append(${SQUARE});`, kind: 'other' },
  'VariableOffsetBuilder.stop': { make: BUILDER, change: 'held.stop(50%, 5, CurveContinuity.G1);', kind: 'other' },
  'VariableOffsetBuilder.startTangent': {
    make: BUILDER,
    change: 'held.startTangent(PolarVector(0deg, 5));',
    kind: 'other',
  },
  'VariableOffsetBuilder.endTangent': {
    make: BUILDER,
    change: 'held.endTangent(PolarVector(0deg, 5));',
    kind: 'other',
  },
  'VariableOffsetBuilder.startCap': { make: COMPOUND_BUILDER, change: 'held.startCap(Cap.round());', kind: 'other' },
  'VariableOffsetBuilder.endCap': { make: COMPOUND_BUILDER, change: 'held.endCap(Cap.round());', kind: 'other' },
};

/** Property writes, index writes and Object.delete: one check each covers every type. */
const WRITE_CASES: Record<string, ChangeCase> = {
  'array element': { make: 'const held = [1, 2];', change: 'held[0] = 9;', kind: 'array' },
  'object key': { make: 'const held = { width: 2 };', change: 'held["width"] = 4;', kind: 'object' },
  'enum member': { make: 'enum held { Few = 8, Many = 20 }', change: 'held["Few"] = 9;', kind: 'object' },
  'Object.delete': { make: 'const held = { width: 2 };', change: 'Object.delete(held, "width");', kind: 'object' },
  'gradient property': {
    make: 'const held = LinearGradient("sky", 0, 0, 1, 0);',
    change: 'held.spreadMethod = "pad";',
    kind: 'other',
  },
  'marker property': { make: 'const held = Marker("tip", 10, 10);', change: 'held.refX = 5;', kind: 'other' },
  'pattern property': {
    make: 'const held = Pattern("dots", 0, 0, 10, 10);',
    change: 'held.patternUnits = "userSpaceOnUse";',
    kind: 'other',
  },
  'mesh point property': {
    make: 'const mesh = MeshGradient("mesh", 200, 100, 3, 2);\nconst held = mesh.getPoint(0, 0);',
    change: 'held.x = 5;',
    kind: 'other',
  },
};

const ADVICE_IMPORTED: Record<ChangeCase['kind'], string> = {
  array: 'Copy it first: [...held]',
  object: 'Copy it first: { ...held }',
  cycler: 'Export a fn that makes one instead: export fn held() { return Cycler([…]); }',
  other: 'Make your own, or export a fn that makes one',
};
const ADVICE_OWN: Record<ChangeCase['kind'], string> = {
  array: 'Return a new array instead',
  object: 'Return a new object instead',
  cycler: 'Pass a Cycler in as a parameter instead',
  other: 'Make a new one inside the fn, or pass one in as a parameter',
};

const verbOf = (c: ChangeCase): string => (c.kind === 'cycler' ? 'pick from' : 'change');
const lineCount = (code: string): number => code.split('\n').length;

describe.each([
  ['methods', METHOD_CASES],
  ['writes', WRITE_CASES],
])('every change (%s)', (_group, cases) => {
  describe.each(Object.entries(cases))('%s', (_name, c) => {
    // The change starts the statement, except Object.delete(held, …), whose
    // position is the call's.
    it('is an error on an imported value', async () => {
      const message = await errorOf(`import { held } from "./kit.pathogen";\n${c.change}`, {
        '/kit.pathogen': `${c.make.replace(/^(const|enum) held/m, 'export $1 held')}\n`,
      });
      expect(message).toBe(
        `Line 2, col 1: Cannot ${verbOf(c)} held — it comes from kit.pathogen, and imported values are fixed. ${ADVICE_IMPORTED[c.kind]}`,
      );
    });

    it("is an error from the owning file's exported fn, which reads 'belongs to'", async () => {
      const kit = `${c.make}\nexport fn touch() {\n  ${c.change}\n}\n`;
      const message = await errorOf('import { touch } from "./kit.pathogen";\ntouch();', { '/kit.pathogen': kit });
      expect(message).toBe(
        `kit.pathogen line ${lineCount(c.make) + 2}, col 3: Cannot ${verbOf(c)} held — it belongs to kit.pathogen, whose values are fixed once it has loaded. ${ADVICE_OWN[c.kind]}\n` +
          '  called from main.pathogen line 2',
      );
    });

    it('works in the owning file while it loads', async () => {
      await expect(
        compileFiles('import { touch } from "./kit.pathogen";', {
          '/kit.pathogen': `${c.make}\n${c.change}\nexport fn touch() {\n  return 0;\n}\n`,
        }),
      ).resolves.toBeDefined();
    });

    // An enum can't be declared inside a fn; it is a top-level declaration.
    it.skipIf(c.make.startsWith('enum'))('works on a value an exported fn makes when it is called', async () => {
      const kit = `export fn make() {\n  ${c.make.replace(/\n/g, '\n  ')}\n  return held;\n}\n`;
      await expect(
        compileFiles(`import { make } from "./kit.pathogen";\nlet held = make();\n${c.change}`, {
          '/kit.pathogen': kit,
        }),
      ).resolves.toBeDefined();
    });
  });
});

// Only methods src/pathogen-api.ts declares are seen here. A changing method
// the evaluator accepts but the API doesn't declare is caught only if
// CHANGES_RECEIVER lists it, which the matrix above then covers.
describe('every method the API declares is classified', () => {
  // TYPE_MEMBERS names (from src/pathogen-api.ts) → receiverTypeName names.
  const RECEIVER: Record<string, string> = {
    array: 'Array',
    string: 'String',
    ObjectValue: 'Object',
    ColorInstance: 'Color',
    LinearGradient: 'Gradient',
    RadialGradient: 'Gradient',
    ConicGradient: 'Gradient',
    MeshGradient: 'Gradient',
    FreeformGradient: 'Gradient',
    TopoGradient: 'Gradient',
    CompoundVariableOffsetBuilder: 'VariableOffsetBuilder',
  };

  // Methods that only read their receiver, or return a new value.
  const READS: Record<string, string> = {
    Angle: 'toDeg toRad toPi toTurns',
    Color:
      'lighten darken saturate desaturate alpha hueShift complement mix flatten analogous triadic tetradic splitComplementary',
    Grid: 'get getPoint getRow getCol cells forEach map sample sampleNearest sampleBilinear',
    Point: 'translate rotate distanceTo angleTo lerp midpoint polarTranslate offset',
    Array: 'empty map filter reduce mapSlice slice reverse sort seams',
    String: 'split append prepend includes slice empty',
    Endpoint: 'fillet chamfer ellipticalFillet',
    PathBlock:
      'draw drawTo get tangent normal partition reverse boundingBox centerPoint translateStartPointTo translateCenterPointTo offset variableOffset compoundVariableOffset mirror scale rotate rotateAtVertexIndex subPath dash outline startAt project chamfer chamferAtVertex fillet filletAtVertex ellipticalFillet ellipticalFilletAtVertex union difference intersection xor intersects intersectionPoints cut query queryAll segment segmentAll point pointAll vertex vertexAll',
    PolarVector: 'turn scale mirror',
    SVGFragment: 'insert',
    Object: 'has',
    TextBlock: 'boundingBox project polarProject radialProject drawTo toPathBlock toCodeSnippetBlock',
    ProjectedText:
      'boundingBox paddedBoundingBox anchor polarProject intersects intersectionPoints draw drawTo translate',
    ProjectedPath:
      'draw drawTo get tangent normal partition reverse boundingBox centerPoint translateStartPointTo translateCenterPointTo offset variableOffset compoundVariableOffset toPathBlock mirror rotate rotateAtVertexIndex scale subPath dash outline startAt chamfer chamferAtVertex fillet filletAtVertex ellipticalFillet ellipticalFilletAtVertex union difference intersection xor cut intersects intersectionPoints query queryAll segment segmentAll point pointAll vertex vertexAll',
    Gradient: 'inherit getPoint getRow getCol',
  };

  // Values tied to a file's drawing: step 5 makes using another file's an error.
  const DRAWING: Record<string, string> = {
    Subscription: 'unsubscribe',
    TextLayer: 'apply',
    PathLayer: 'apply subscribe query queryAll segment segmentAll point pointAll vertex vertexAll',
    GroupLayer: 'append',
  };

  const words = (table: Record<string, string>): Set<string> =>
    new Set(Object.entries(table).flatMap(([type, methods]) => methods.split(' ').map((m) => `${type}.${m}`)));
  const reads = words(READS);
  const drawing = words(DRAWING);

  it('as changing (CHANGES_RECEIVER), reading, or tied to a drawing', () => {
    const unclassified: string[] = [];
    for (const [type, set] of Object.entries(TYPE_MEMBERS)) {
      for (const method of set.methods ?? []) {
        const key = `${RECEIVER[type] ?? type}.${method.label}`;
        if (!CHANGES_RECEIVER.has(key) && !reads.has(key) && !drawing.has(key)) unclassified.push(key);
      }
    }
    expect(unclassified).toEqual([]);
  });

  it('with no method in two lists', () => {
    const both = [...CHANGES_RECEIVER].filter((key) => reads.has(key) || drawing.has(key));
    expect(both).toEqual([]);
  });

  it('and every changing method has a case in the matrix above', () => {
    expect(Object.keys(METHOD_CASES).sort()).toEqual([...CHANGES_RECEIVER].sort());
  });
});

// --- how far the freeze reaches -----------------------------------------------

describe('what is fixed', () => {
  const ROWS = { '/kit.pathogen': 'export const rows = [[1, 2], [3]];\nexport const sizes = [3, 5];\n' };

  it('an element of an imported array, named as the code writes it', async () => {
    expect(await errorOf('import { rows } from "./kit.pathogen";\nrows[0].push(9);', ROWS)).toBe(
      'Line 2, col 1: Cannot change rows — it comes from kit.pathogen, and imported values are fixed. Copy it first: [...rows]',
    );
    expect(await errorOf('import { rows } from "./kit.pathogen";\nlet first = rows[0];\nfirst.push(9);', ROWS)).toBe(
      'Line 3, col 1: Cannot change first — it comes from kit.pathogen, and imported values are fixed. Copy it first: [...first]',
    );
  });

  it('through `as`, an alias, and a namespace', async () => {
    expect(await errorOf('import { sizes as mine } from "./kit.pathogen";\nmine.push(9);', ROWS)).toMatch(
      /^Line 2, col 1: Cannot change mine — it comes from kit\.pathogen, .* Copy it first: \[\.\.\.mine\]$/,
    );
    expect(await errorOf('import { sizes } from "./kit.pathogen";\nlet alias = sizes;\nalias.push(9);', ROWS)).toMatch(
      /^Line 3, col 1: Cannot change alias — it comes from kit\.pathogen/,
    );
    expect(await errorOf('import * as kit from "./kit.pathogen";\nkit.sizes.push(9);', ROWS)).toBe(
      'Line 2, col 1: Cannot change kit.sizes — it comes from kit.pathogen, and imported values are fixed. Copy it first: [...kit.sizes]',
    );
  });

  it("a private value an exported fn hands out keeps its binding's name", async () => {
    expect(
      await errorOf('import { sizes } from "./kit.pathogen";\nsizes().push(9);', {
        '/kit.pathogen': 'const known = [3, 5];\nexport fn sizes() {\n  return known;\n}\n',
      }),
    ).toBe(
      'Line 2, col 1: Cannot change known — it comes from kit.pathogen, and imported values are fixed. Copy it first: [...known]',
    );
  });

  it('a mesh point the gradient hands back with getPoint()', async () => {
    expect(
      await errorOf('import { mesh } from "./kit.pathogen";\nmesh.getPoint(0, 0).translate(1, 1);', {
        '/kit.pathogen': 'export const mesh = MeshGradient("mesh", 200, 100, 3, 2);\n',
      }),
    ).toBe(
      'Line 2, col 1: Cannot change mesh — it comes from kit.pathogen, and imported values are fixed. Make your own, or export a fn that makes one',
    );
  });

  it('a variable a fn closed over while its file loaded (a counter)', async () => {
    const message = await errorOf('import { counter } from "./kit.pathogen";\nlog(counter());', {
      '/kit.pathogen':
        'fn makeCounter() {\n  let count = 0;\n  return {||\n    count = count + 1;\n    return count;\n  };\n}\nexport const counter = makeCounter();\n',
    });
    expect(message).toBe(
      'kit.pathogen line 4, col 5: Cannot assign to count — it belongs to kit.pathogen, whose variables are fixed once it has loaded. Return the new value instead, or pass it in as a parameter\n' +
        '  called from main.pathogen line 2',
    );
  });

  // a.pathogen's fn builds the closure while b.pathogen loads, so b's walk is
  // the one that finds its scope. The values are a's: a's code names them.
  const MAKER = {
    '/a.pathogen':
      'export fn mk() {\n  let xs = [];\n  let n = 0;\n  return {||\n    n = n + 1;\n    xs.push(1);\n  };\n}\n',
    '/b.pathogen': 'import { mk } from "./a.pathogen";\nexport const f = mk();\n',
  };

  it("a closure one file's fn builds while another file loads belongs to the fn's file", async () => {
    expect(await errorOf('import { f } from "./b.pathogen";\nf();', MAKER)).toBe(
      'a.pathogen line 5, col 5: Cannot assign to n — it belongs to a.pathogen, whose variables are fixed once it has loaded. Return the new value instead, or pass it in as a parameter\n' +
        '  called from main.pathogen line 2',
    );
    const pushOnly = { ...MAKER, '/a.pathogen': MAKER['/a.pathogen'].replace('    n = n + 1;\n', '') };
    expect(await errorOf('import { f } from "./b.pathogen";\nf();', pushOnly)).toBe(
      'a.pathogen line 5, col 5: Cannot change xs — it belongs to a.pathogen, whose values are fixed once it has loaded. Return a new array instead\n' +
        '  called from main.pathogen line 2',
    );
  });

  it('…and a value the loading file passed in still comes from that file', async () => {
    expect(
      await errorOf('import { g } from "./b.pathogen";\ng();', {
        '/a.pathogen': 'export fn keep(list) {\n  return {||\n    list.push(1);\n  };\n}\n',
        '/b.pathogen': 'import { keep } from "./a.pathogen";\nconst mine = [];\nexport const g = keep(mine);\n',
      }),
    ).toBe(
      'a.pathogen line 3, col 5: Cannot change list — it comes from b.pathogen, and imported values are fixed. Copy it first: [...list]\n' +
        '  called from main.pathogen line 2',
    );
  });

  it('…even when the loading file reaches it only through its own nested data', async () => {
    // `holder` is the file's own; `holder.items` is also the closure's `list`.
    // The file's own data is walked before the other file's scope.
    expect(
      await errorOf('import { holder } from "./b.pathogen";\nholder.items.push(1);', {
        '/a.pathogen': 'export fn keep(list) {\n  return {||\n    list.push(1);\n  };\n}\n',
        '/b.pathogen':
          'import { keep } from "./a.pathogen";\nexport const holder = { items: [] };\nexport const g = keep(holder.items);\n',
      }),
    ).toBe(
      'Line 2, col 1: Cannot change holder.items — it comes from b.pathogen, and imported values are fixed. Copy it first: [...holder.items]',
    );
  });

  it("an exported fn assigning to its file's const gets the const error", async () => {
    expect(
      await errorOf('import { setIt } from "./k.pathogen";\nsetIt();', {
        '/k.pathogen': 'const x = 1;\nexport fn setIt() {\n  x = 2;\n}\n',
      }),
    ).toBe(
      'k.pathogen line 3, col 3: Cannot assign to x — it is a const. Declare it with let if it needs to change\n' +
        '  imported from main.pathogen line 1',
    );
  });

  it("a fn's own locals, and a value it makes per call, still change freely", async () => {
    const result = await compileFiles(
      'import { tally } from "./kit.pathogen";\nlog(tally([1, 2, 3]));\nlog(tally([4]));',
      {
        '/kit.pathogen':
          'export fn tally(xs) {\n  let total = 0;\n  let seen = [];\n  for (x in xs) {\n    total = total + x;\n    seen.push(x);\n  }\n  return [total, seen.length];\n}\n',
      },
    );
    expect(mainLogs(result)).toEqual(['[6, 3]', '[4, 1]']);
  });

  it('an array you pass in stays yours: an imported fn can change it', async () => {
    const result = await compileFiles(
      'import { addOne } from "./kit.pathogen";\nlet mine = [1];\naddOne(mine);\nlog(mine);',
      {
        '/kit.pathogen': 'export fn addOne(xs) {\n  xs.push(1);\n}\n',
      },
    );
    expect(mainLogs(result)).toEqual(['[1, 1]']);
  });

  it("a value re-exported by a second file keeps the first file's name", async () => {
    expect(
      await errorOf('import { sizes } from "./b.pathogen";\nsizes.push(9);', {
        '/a.pathogen': 'export const sizes = [3, 5];\n',
        '/b.pathogen': 'import { sizes as fromA } from "./a.pathogen";\nexport const sizes = fromA;\n',
      }),
    ).toMatch(/^Line 2, col 1: Cannot change sizes — it comes from a\.pathogen,/);
  });

  it('a file changing a value it imported, while it loads, is the imported-value error', async () => {
    expect(
      await errorOf('import { more } from "./b.pathogen";', {
        '/a.pathogen': 'export const sizes = [3, 5];\n',
        '/b.pathogen': 'import { sizes } from "./a.pathogen";\nsizes.push(9);\nexport const more = 1;\n',
      }),
    ).toBe(
      'b.pathogen line 2, col 1: Cannot change sizes — it comes from a.pathogen, and imported values are fixed. Copy it first: [...sizes]\n' +
        '  imported from main.pathogen line 1',
    );
  });

  it('a cyclic structure is fixed without looping', async () => {
    expect(
      await errorOf('import { ring } from "./kit.pathogen";\nring["self"]["n"] = 2;', {
        '/kit.pathogen': 'export const ring = { n: 1 };\nring["self"] = ring;\n',
      }),
    ).toMatch(/^Line 2, col 1: Cannot change ring\b/);
  });

  it("the compiled file's own values change as before", async () => {
    const result = await compileFiles(
      'import { sizes } from "./kit.pathogen";\nlet mine = [1];\nmine.push(2);\nmine[0] = 5;\nlet counter = 0;\ncounter = counter + 1;\nlog(mine);\nlog(counter);',
      ROWS,
    );
    expect(mainLogs(result)).toEqual(['[5, 2]', '1']);
  });

  it('one-file programs: no change at all (no imports, nothing fixed)', () => {
    const result = compile('const sizes = [1];\nsizes.push(2);\nlet c = Cycler([1, 2]);\nlog(c.pick());\nlog(sizes);');
    expect(result.logs.map((l) => l.parts.map((p) => p.value).join(' '))).toEqual(['1', '[1, 2]']);
  });
});

// --- inside a style value -------------------------------------------------------

// A style value keeps its raw text when evaluating it fails (rgb(…),
// context-stroke), and the raw text is then rejected as a disallowed token.
// A fixed-value change must say what it is instead.
describe('a change inside a style value', () => {
  const COLORS = { '/c.pathogen': 'export const palette = Cycler(["teal", "coral"]);\n' };
  const PICK =
    'Cannot pick from palette — it comes from c.pathogen, and imported values are fixed. Export a fn that makes one instead: export fn palette() { return Cycler([…]); }';
  const IDS = {
    '/ids.pathogen': 'let n = 0;\nexport fn countUp() {\n  n = n + 1;\n  return "teal";\n}\n',
  };
  const ASSIGN_N =
    'ids.pathogen line 3, col 3: Cannot assign to n — it belongs to ids.pathogen, whose variables are fixed once it has loaded. Return the new value instead, or pass it in as a parameter';

  async function thrown(main: string, files: Record<string, string>): Promise<Error & { site?: unknown }> {
    const modules = await graphOf(main, files);
    try {
      compile(main, { modules });
    } catch (e) {
      return e as Error;
    }
    throw new Error('expected the compile to fail');
  }

  it('is the fixed-value error, placed at the value', async () => {
    expect(
      await errorOf('import { palette } from "./c.pathogen";\nlet s = #{ stroke: palette.pick(); };', COLORS),
    ).toBe(`Line 2, col 20: Style value for "stroke": ${PICK}`);
    expect(
      await errorOf(
        'import { palette } from "./c.pathogen";\n\nlet s = #{\n  fill: none;\n  stroke: palette.pick();\n};',
        COLORS,
      ),
    ).toBe(`Line 5, col 11: Style value for "stroke": ${PICK}`);
  });

  it('inside a CSS function and a template', async () => {
    expect(
      await errorOf(
        'import { palette } from "./c.pathogen";\nlet s = #{ filter: drop-shadow(0 0 2px palette.pick()); };',
        COLORS,
      ),
    ).toBe(`Line 2, col 20: Style value for "filter": ${PICK}`);
    expect(
      await errorOf('import { palette } from "./c.pathogen";\nlet s = #{ stroke: `${palette.pick()}`; };', COLORS),
    ).toBe(`Line 2, col 20: Style value for "stroke": ${PICK}`);
  });

  it("from an imported fn: the trace's call is the value's line, and so is the editor's site", async () => {
    const error = await thrown('import { countUp } from "./ids.pathogen";\n\nlet s = #{ stroke: countUp(); };', IDS);
    expect(error.message).toBe(`${ASSIGN_N}\n  called from main.pathogen line 3`);
    expect(error.site).toEqual({ line: 3, column: 20 });
  });

  it("in a file that loads: the call is that file's line, and the site is the import", async () => {
    const error = await thrown('import { s } from "./b.pathogen";\nlog(s);', {
      ...IDS,
      '/b.pathogen': 'import { countUp } from "./ids.pathogen";\n\nexport const s = #{\n  stroke: countUp();\n};\n',
    });
    expect(error.message).toBe(`${ASSIGN_N}\n  called from b.pathogen line 4\n  imported from main.pathogen line 1`);
    expect(error.site).toEqual({ line: 1, column: 19 });
  });

  it('through a fn the value calls: the call inside the fn keeps its own line, as outside a style', async () => {
    const color = 'import { countUp } from "./ids.pathogen";\nfn color() {\n  return countUp();\n}\n';
    const inStyle = await thrown(`${color}let s = #{ stroke: color(); };`, IDS);
    const plain = await thrown(`${color}let s = color();`, IDS);
    expect(inStyle.message).toBe(`${ASSIGN_N}\n  called from main.pathogen line 3`);
    expect(inStyle.site).toEqual({ line: 3, column: 10 });
    expect(plain.message).toBe(inStyle.message);
    expect(plain.site).toEqual(inStyle.site);
  });

  it('other errors in a style value keep the raw text as before', async () => {
    expect(() => compile('fn bad() {\n  return 1 / missing;\n}\nlet s = #{ stroke: bad(); };')).toThrow(
      /^Line 4, col 20: Style value for "stroke" contains a disallowed token \("bad\(\)"/,
    );
  });
});
