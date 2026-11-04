/**
 * Phase 1a, step 5c: values tied to another file's drawing (docs/modules.md
 * "What you import is fixed", the paragraph on layers, transforms and
 * subscriptions; decision 35).
 *
 * A layer, transform or subscription an imported file holds once it has
 * loaded belongs to a drawing that's gone: exporting one is an error at the
 * export, and using one that reaches you another way is an error at the use.
 * Every method and property the API declares for those types is checked, so
 * a new one can't slip past. Query results are copies and cross freely.
 */
import { describe, expect, it } from 'vitest';

import { compile, resolveModules } from '../src';
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

const mainLogs = (result: CompileResult): string[] =>
  result.logs.filter((l) => !l.file).map((l) => l.parts.map((p) => p.value).join(' '));

/** A file whose drawing has a path layer, a text layer, a group, transforms and a subscription. */
const INKS = {
  '/inks.pathogen': [
    "let inkLayer = PathLayer('ink') #{ stroke: Color('#333'); };",
    "let labels = TextLayer('labels') #{ font-size: 14; };",
    "let group = GroupLayer('group') #{};",
    'let moved = ctx.transform;',
    'let shift = ctx.transform.translate;',
    "let sub = inkLayer.subscribe('endpoint') {|e|\n  log(e.point.x);\n};",
    'inkLayer.apply { M 0 0 L 10 0 L 20 5 }',
    'export fn getInk() {\n  return inkLayer;\n}',
    'export fn getLabels() {\n  return labels;\n}',
    'export fn getGroup() {\n  return group;\n}',
    'export fn getTransform() {\n  return moved;\n}',
    'export fn getShift() {\n  return shift;\n}',
    'export fn getSub() {\n  return sub;\n}',
    'export fn redraw() {\n  inkLayer.apply { M 0 0 L 1 1 }\n}',
    "export const corners = inkLayer.queryAll('endpoint');",
    '',
  ].join('\n'),
};

const USE = (name: string, what: string): RegExp =>
  new RegExp(
    `^Line \\d+, col \\d+: Cannot use ${name} — it is ${what} inks\\.pathogen's drawing, which stays in that file\\. Export a fn that draws, and call it inside your own layer$`,
  );

// --- the docs ---------------------------------------------------------------------

describe("docs: values that belong to the imported file's drawing", () => {
  it.each([
    ["export const ink = PathLayer('ink') #{};", 'ink', 'a layer of'],
    ['export const moved = ctx.transform;', 'moved', 'a transform of'],
    [
      "define PathLayer('ink') #{}\nexport const sub = layer('ink').subscribe('endpoint') {|e|\n  log(1);\n};",
      'sub',
      'a subscription to',
    ],
  ])('exporting one is an error at the export: %s', async (source, name, what) => {
    const message = await errorOf('import * as inks from "./inks.pathogen";\nlog(1);', {
      '/inks.pathogen': `${source}\n`,
    });
    const exportLine = source.split('\n').findIndex((line) => line.startsWith('export')) + 1;
    // The position is the declaration the export marks: `const`, after `export `.
    expect(message).toBe(
      `inks.pathogen line ${exportLine}, col 8: Cannot export ${name} — it is ${what} this file's drawing, which stays in this file. Export a fn that draws instead\n` +
        '  imported from main.pathogen line 1',
    );
  });

  it('using one that reaches you another way, such as from an exported fn, is an error at the use', async () => {
    expect(
      await errorOf('import { getInk } from "./inks.pathogen";\nlet ink = getInk();\nink.apply { M 0 0 L 5 5 }', INKS),
    ).toBe(
      "Line 3, col 1: Cannot use ink — it is a layer of inks.pathogen's drawing, which stays in that file. Export a fn that draws, and call it inside your own layer",
    );
  });

  it('an exported fn that picks a layer by name draws into your layer, because the drawing follows the call', async () => {
    const result = await compileFiles(
      "import { inkLine } from \"./inks.pathogen\";\ndefine PathLayer('ink') #{ stroke: Color('#333'); }\ninkLine(Point(0, 0), Point(20, 10));",
      {
        '/inks.pathogen':
          "export fn inkLine(start, end) {\n  layer('ink').apply {\n    M start.x start.y\n    L end.x end.y\n  }\n}\n",
      },
    );
    expect(result.layers.map((l) => [l.name, l.data])).toEqual([['ink', 'M 0 0 L 20 10']]);
  });

  it('query results are copies of what was drawn, so you can read them', async () => {
    const result = await compileFiles(
      'import { corners } from "./inks.pathogen";\nlog(corners.length);\nlog(corners[1].point.x);',
      INKS,
    );
    expect(mainLogs(result)).toEqual(['2', '20']);
  });
});

// --- every method and property of these types ---------------------------------------

/** How to call each declared method on `held` (the API declares these in src/pathogen-api.ts). */
const CALLS: Record<string, Record<string, string>> = {
  PathLayer: {
    apply: 'held.apply { M 0 0 L 1 1 }',
    subscribe: "held.subscribe('endpoint') {|e|\n  log(1);\n};",
    query: "log(held.query('endpoint'));",
    queryAll: "log(held.queryAll('endpoint'));",
    segment: "log(held.segment('x'));",
    segmentAll: "log(held.segmentAll('x'));",
    point: "log(held.point('x'));",
    pointAll: "log(held.pointAll('x'));",
    vertex: "log(held.vertex('x'));",
    vertexAll: "log(held.vertexAll('x'));",
  },
  TextLayer: { apply: 'held.apply {\n  text(0, 0)`hi`\n}' },
  GroupLayer: { append: "held.append(PathLayer('mine') #{});" },
  Subscription: { unsubscribe: 'held.unsubscribe();' },
};

const GETTER: Record<string, { fn: string; what: string }> = {
  PathLayer: { fn: 'getInk', what: 'a layer of' },
  TextLayer: { fn: 'getLabels', what: 'a layer of' },
  GroupLayer: { fn: 'getGroup', what: 'a layer of' },
  Subscription: { fn: 'getSub', what: 'a subscription to' },
};

const declared = (type: string, kind: 'methods' | 'properties'): string[] =>
  (TYPE_MEMBERS[type]?.[kind] ?? []).map((m) => m.label);

describe('every declared method and property, on a value from another file', () => {
  it('the tables cover exactly what the API declares', () => {
    for (const type of Object.keys(CALLS))
      expect(Object.keys(CALLS[type]).sort()).toEqual(declared(type, 'methods').sort());
  });

  describe.each(Object.keys(GETTER))('%s', (type) => {
    const { fn, what } = GETTER[type];
    const main = (body: string): string => `import { ${fn} } from "./inks.pathogen";\nlet held = ${fn}();\n${body}`;

    it.each(Object.entries(CALLS[type]))('.%s() is an error at the use', async (_method, call) => {
      expect(await errorOf(main(call), INKS)).toMatch(USE('held', what));
    });

    it.each(declared(type, 'properties'))('.%s is an error at the use', async (property) => {
      expect(await errorOf(main(`log(held.${property});`), INKS)).toMatch(USE('held', what));
    });
  });

  it('writing a layer property, and merging styles into it with <<, are errors too', async () => {
    const main = (body: string): string => `import { getInk } from "./inks.pathogen";\nlet held = getInk();\n${body}`;
    expect(await errorOf(main("held.styles = #{ stroke: Color('#f00'); };"), INKS)).toMatch(USE('held', 'a layer of'));
    expect(await errorOf(main("let more = held << #{ stroke: Color('#f00'); };"), INKS)).toMatch(
      USE('held', 'a layer of'),
    );
  });

  it('so is passing a layer where one is expected: your group appending it', async () => {
    const main =
      'import { getInk } from "./inks.pathogen";\nlet mine = GroupLayer(\'mine\') #{};\nmine.append(getInk());';
    expect(await errorOf(main, INKS)).toMatch(USE('inkLayer', 'a layer of'));
  });

  // ctx.transform and its parts aren't declared as types in the API, so they're listed here.
  it.each([
    ['getTransform', 'held.reset();'],
    ['getTransform', 'log(held.translate);'],
    ['getShift', 'held.reset();'],
    ['getShift', 'held.set(1, 2);'],
  ])('a transform (%s): %s', async (fn, body) => {
    expect(await errorOf(`import { ${fn} } from "./inks.pathogen";\nlet held = ${fn}();\n${body}`, INKS)).toMatch(
      USE('held', 'a transform of'),
    );
  });
});

// --- how far it reaches -----------------------------------------------------------------

describe('where the error comes from', () => {
  it('named as the code writes it, else by its binding in its file', async () => {
    expect(
      await errorOf('import { getInk } from "./inks.pathogen";\nlog(getInk().queryAll(\'endpoint\'));', INKS),
    ).toMatch(USE('inkLayer', 'a layer of'));
  });

  it("the file's own fn, run after it loaded, can't use its file's layer either: that drawing is gone", async () => {
    const message = await errorOf('import { redraw } from "./inks.pathogen";\nredraw();', INKS);
    expect(message).toMatch(
      /^inks\.pathogen line \d+, col \d+: Cannot use inkLayer — it is a layer of inks\.pathogen's drawing/,
    );
    expect(message).toMatch(/\n {2}called from main\.pathogen line 2$/);
  });

  it("a second file exporting the first file's layer gets the use error at its export", async () => {
    const message = await errorOf('import { ink } from "./b.pathogen";\nlog(1);', {
      ...INKS,
      '/b.pathogen': 'import { getInk } from "./inks.pathogen";\nexport const ink = getInk();\n',
    });
    expect(message).toBe(
      "b.pathogen line 2, col 8: Cannot use ink — it is a layer of inks.pathogen's drawing, which stays in that file. Export a fn that draws, and call it inside your own layer\n" +
        '  imported from main.pathogen line 1',
    );
  });

  describe('a layer inside an exported array or object', () => {
    // Exporting the holder is fine: its other values can be used. The layer
    // in it "reaches you some other way", so using it is the error.
    const KIT = {
      '/kit.pathogen':
        "let inkLayer = PathLayer('ink') #{};\nexport const kit = { size: 3, ink: inkLayer };\nexport const layers = [inkLayer];\nexport fn getKit() {\n  return kit;\n}\n",
    };

    it('exports, and its other values work', async () => {
      const result = await compileFiles(
        'import { kit, layers } from "./kit.pathogen";\nlog(kit.size);\nlog(layers.length);',
        KIT,
      );
      expect(mainLogs(result)).toEqual(['3', '1']);
    });

    it('the layer is the use error, named as the code writes it', async () => {
      const use = (name: string): RegExp =>
        new RegExp(`^Line 2, col \\d+: Cannot use ${name} — it is a layer of kit\\.pathogen's drawing`);
      expect(await errorOf('import { kit } from "./kit.pathogen";\nlog(kit.ink.queryAll(\'endpoint\'));', KIT)).toMatch(
        use('kit\\.ink'),
      );
      expect(
        await errorOf('import { getKit } from "./kit.pathogen";\nlog(getKit().ink.queryAll(\'endpoint\'));', KIT),
      ).toMatch(use('ink'));
      expect(
        await errorOf('import { layers } from "./kit.pathogen";\nlog(layers[0].queryAll(\'endpoint\'));', KIT),
      ).toMatch(use('inkLayer'));
    });
  });

  it("a callback that runs after the file loaded can't use the file's layer either", async () => {
    // watch() subscribes on your layer; its callback runs at the end of your
    // drawing, long after watched.pathogen's drawing ended.
    const message = await errorOf(
      'import { watch } from "./watched.pathogen";\nlet mine = PathLayer(\'mine\') #{};\nwatch(mine);\nmine.apply { M 0 0 L 10 0 }',
      {
        '/watched.pathogen':
          "let tally = PathLayer('tally') #{};\nexport fn watch(target) {\n  target.subscribe('endpoint') {|e|\n    tally.apply { M e.point.x 0 L e.point.x 5 }\n  };\n}\n",
      },
    );
    // The subscription's own wrapper names the match; inside it, the error names the file and line.
    expect(message).toMatch(/^Line 3, col \d+: Error in subscription on 'mine', match 1 /);
    expect(message).toContain(
      "watched.pathogen line 4, col 5: Cannot use tally — it is a layer of watched.pathogen's drawing, which stays in that file.",
    );
  });

  it('a message of your own that happens to read like these is not one of them', async () => {
    // assert() text with the same words still fails the way any assert does.
    expect(() => compile('assert(false, "it is a layer of x\'s drawing, which stays in that file. ");')).toThrow(
      /assertion failed/,
    );
  });

  it('logging one is fine: showing a value is not drawing with it', async () => {
    const result = await compileFiles('import { getInk } from "./inks.pathogen";\nlog(getInk());', INKS);
    expect(mainLogs(result)).toHaveLength(1);
  });

  it('while the file loads, its own layers, transforms and subscriptions work as before', async () => {
    const result = await compileFiles('import { corners } from "./inks.pathogen";\nlog(corners.length);', INKS);
    // The subscription ran at the end of inks.pathogen's load and logged each corner there.
    expect(
      result.logs.filter((l) => l.file === 'inks.pathogen').map((l) => l.parts.map((p) => p.value).join(' ')),
    ).toEqual(['10', '20']);
  });

  it('one-file programs: layers, transforms and subscriptions as before', () => {
    const result = compile(
      "let ink = PathLayer('ink') #{};\nlet t = ctx.transform;\nt.reset();\nlet sub = ink.subscribe('endpoint') {|e|\n  log(e.point.x);\n};\nink.apply { M 0 0 L 10 0 }\nlog(ink.name);",
    );
    // log(ink.name) runs at once; the subscription delivers at the end.
    expect(result.logs.map((l) => l.parts.map((p) => p.value).join(' '))).toEqual(['ink', '10']);
  });
});
