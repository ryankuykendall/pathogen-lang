/**
 * Phase 3a, step 2: a data import's value at run time (docs/data-import.md
 * "JSON" and "What you import is fixed"; note 76, decision 6).
 *
 * The compile binds an imported data file's value to its name, fixed all the
 * way in: changing it, or an object or array inside it, is an error that
 * names the file. Messages are the docs' word for word.
 */
import { describe, expect, it } from 'vitest';

import { compile } from '../src';
import { resolveModules } from '../src/host/load-modules';

import type { HostReadResult, ProjectFileHost } from '../src/host/types';

function memoryHost(files: Record<string, string>): ProjectFileHost {
  return {
    projectLabel: '/Users/you/gear-studies',
    readFile: async (path): Promise<HostReadResult> =>
      files[path] === undefined
        ? { ok: false, code: 'not-found', osPath: path }
        : { ok: true, bytes: new TextEncoder().encode(files[path]) },
  };
}

const GEARS =
  '[\n  { "name": "drive", "x": 55, "y": 50, "radius": 40, "teeth": 12 },\n  { "name": "idler", "x": 150, "y": 50, "radius": 28, "teeth": 8 }\n]\n';

/** Compile `main` with the files beside it, as a tool with a project folder does. */
async function compileWith(main: string, files: Record<string, string>): Promise<ReturnType<typeof compile>> {
  const { graph, errors } = await resolveModules(main, { host: memoryHost(files), entry: '/main.pathogen' });
  expect(errors).toEqual([]);
  return compile(main, { modules: graph });
}

/** The error a program stops with, or a note that it didn't. */
async function errorOf(main: string, files: Record<string, string>): Promise<string> {
  try {
    await compileWith(main, files);
    return 'no error';
  } catch (e) {
    return (e as Error).message;
  }
}

/** What the program logged, one line per log() call. */
async function logsOf(main: string, files: Record<string, string>): Promise<string[]> {
  const result = await compileWith(main, files);
  return result.logs.map((entry) => entry.parts.map((part) => part.value).join(' '));
}

const DRAW =
  'for (gear in gears) {\n  star(gear.x, gear.y, gear.radius, gear.radius - 6, gear.teeth);\n  circle(gear.x, gear.y, gear.radius * 0.3);\n}\n';

describe('the example at the top of docs/data-import.md', () => {
  it('draws the same as the same data written in the program', async () => {
    const imported = await compileWith(
      `// main.pathogen\nimport gears from "./data/gears.json";\n\ndefine ViewBox(0, 0, 200, 100);\n\n${DRAW}`,
      { '/data/gears.json': GEARS },
    );
    const inline = compile(
      `let gears = [\n  { name: "drive", x: 55, y: 50, radius: 40, teeth: 12 },\n  { name: "idler", x: 150, y: 50, radius: 28, teeth: 8 },\n];\ndefine ViewBox(0, 0, 200, 100);\n${DRAW}`,
    );
    expect(imported.layers).toEqual(inline.layers);
    // A 12-tooth star and its hub, then an 8-tooth star and its hub.
    expect(imported.layers[0].data.match(/M/g)).toHaveLength(4);
  });
});

describe('JSON values become Pathogen values', () => {
  const DATA = {
    '/data/mix.json':
      '{ "b": 1, "2": "two", "a": [true, false, null], "nested": { "deep": { "n": -2.5e1 } }, "length": 7, "Population (2020)": 9, "text": "t" }',
  };
  const IMPORT = 'import mix from "./data/mix.json";\n';

  it('keys in the file\'s order, keys like "2" included', async () => {
    expect(await logsOf(`${IMPORT}log(Object.keys(mix));`, DATA)).toEqual([
      '[b, 2, a, nested, length, Population (2020), text]',
    ]);
  });

  it('numbers, strings, true/false, null, arrays and objects', async () => {
    expect(
      await logsOf(
        `${IMPORT}log(mix.b + 1);\nlog(mix["2"]);\nlog(mix.a[0] == true, mix.a[1] == false, mix.a[2] == null);\nlog(mix.nested.deep.n);`,
        DATA,
      ),
    ).toEqual(['2', 'two', 'true true true', '-25']);
  });

  it('brackets for a key that is not a name or is a keyword; .length is the number of keys', async () => {
    expect(
      await logsOf(
        `${IMPORT}log(mix["Population (2020)"]);\nlog(mix["text"]);\nlog(mix["length"]);\nlog(mix.length);`,
        DATA,
      ),
    ).toEqual(['9', 't', '7', '7']);
  });

  it("a key that isn't there reads as null; .has() tells", async () => {
    expect(await logsOf(`${IMPORT}log(mix.missing == null);\nlog(mix.has("missing"), mix.has("b"));`, DATA)).toEqual([
      'true',
      'false true',
    ]);
  });

  it('a file whose value is a number, a string, true or null', async () => {
    const files = { '/n.json': '42', '/s.json': '"hi"', '/t.json': 'true', '/z.json': 'null' };
    const main =
      'import n from "./n.json";\nimport s from "./s.json";\nimport t from "./t.json";\nimport z from "./z.json";\nlog(n + 1, s, t == true, z == null);';
    expect(await logsOf(main, files)).toEqual(['43 hi true true']);
  });

  it('GeoJSON, TopoJSON and FOLD read as JSON', async () => {
    const files = {
      '/map.geojson': '{ "type": "FeatureCollection", "features": [] }',
      '/borders.topojson': '{ "type": "Topology", "arcs": [[[0, 0], [1, 1]]] }',
      '/crane.fold': '{ "vertices_coords": [[0, 0], [1, 0]] }',
    };
    const main =
      'import places from "./map.geojson";\nimport borders from "./borders.topojson";\nimport crane from "./crane.fold";\nlog(places.type, borders.arcs[0][1][0], crane.vertices_coords.length);';
    expect(await logsOf(main, files)).toEqual(['FeatureCollection 1 2']);
  });
});

describe('one value serves every compile that reads the same text (the parse cache, note 77)', () => {
  it('compiles that try every way to change it, or change copies of it, leave it as the file says', async () => {
    const files = { '/data/shared.json': '[{ "n": 1, "tags": ["a"] }, { "n": 2, "tags": [] }]' };
    const IMPORT = 'import rows from "./data/shared.json";\n';
    const attempts = [
      'rows.push(1);',
      'rows.pop();',
      'rows[0] = 5;',
      'rows[0]["n"] = 9;',
      'rows[0].n = 9;',
      'rows[0].tags.push("b");',
      'Object.delete(rows[0], "n");',
      'for (row in rows) {\n  row.n = 0;\n}',
      'let copy = [...rows];\ncopy.push(3);\ncopy.reverse();\nlet sorted = rows.sort {|a, b| return b.n - a.n; };',
      'let mine = rows.map {|row| return { ...row, n: 7 }; };\nmine[0].n = 8;',
    ];
    for (const attempt of attempts) {
      try {
        await compileWith(`${IMPORT}${attempt}`, files);
      } catch {
        // Changing it is an error; what matters is the value afterwards.
      }
    }
    expect(
      await logsOf(`${IMPORT}log(rows.length, rows[0].n, rows[1].n, rows[0].tags, Object.keys(rows[0]));`, files),
    ).toEqual(['2 1 2 [a] [n, tags]']);
  });
});

describe('each data file is read once per compile, and every importer sees the same value', () => {
  it('a module and the program read the same file: both see it, the module through its fn', async () => {
    const files = {
      '/data/gears.json': GEARS,
      '/parts/kit.pathogen':
        'module;\nimport table from "../data/gears.json";\nexport fn biggest() { return table.reduce(0) {|acc, gear| return max(acc, gear.radius); }; }\n',
    };
    const main =
      'import gears from "./data/gears.json";\nimport { biggest } from "./parts/kit.pathogen";\nlog(biggest(), gears.length);';
    expect(await logsOf(main, files)).toEqual(['40 2']);
  });
});

describe('what you import is fixed (docs/data-import.md, the table and the Errors rows)', () => {
  const FILES = { '/data/gears.json': GEARS };
  const IMPORT = 'import gears from "./data/gears.json";\n';

  it('gears.push(row) names the file and says to copy', async () => {
    expect(await errorOf(`${IMPORT}gears.push({ name: "third" });`, FILES)).toBe(
      'Line 2, col 1: Cannot change gears — it comes from data/gears.json, and imported values are fixed. Copy it first: [...gears]',
    );
  });

  it('gears[0]["teeth"] = 16 names an object inside it', async () => {
    expect(await errorOf(`${IMPORT}gears[0]["teeth"] = 16;`, FILES)).toBe(
      'Line 2, col 1: Cannot change an object inside gears — it comes from data/gears.json, and imported values are fixed. Make new objects: gears.map {|gear| return { ...gear }; }',
    );
  });

  it('even in a copied array: copying is one level deep', async () => {
    expect(await errorOf(`${IMPORT}let myGears = [...gears];\nmyGears[0]["teeth"] = 16;`, FILES)).toBe(
      'Line 3, col 1: Cannot change an object inside gears — it comes from data/gears.json, and imported values are fixed. Make new objects: gears.map {|gear| return { ...gear }; }',
    );
  });

  it('a copied array can be added to', async () => {
    expect(
      await logsOf(`${IMPORT}let myGears = [...gears];\nmyGears.push({ name: "third" });\nlog(myGears.length);`, FILES),
    ).toEqual(['3']);
  });

  it('new objects can be changed: the way the docs show', async () => {
    expect(
      await logsOf(
        `${IMPORT}let myGears = gears.map {|gear| return { ...gear }; };\nmyGears[0]["teeth"] = 16;\nlog(myGears[0].teeth, gears[0].teeth);`,
        FILES,
      ),
    ).toEqual(['16 12']);
  });

  it('a member write on a loop variable is an object inside', async () => {
    expect(await errorOf(`${IMPORT}for (gear in gears) {\n  gear.teeth = 3;\n}`, FILES)).toBe(
      'Line 3, col 3: Cannot change an object inside gears — it comes from data/gears.json, and imported values are fixed. Make new objects: gears.map {|gear| return { ...gear }; }',
    );
  });

  it("{ ...gear } copies one level: an array inside each gear is still the file's", async () => {
    const files = { '/data/gears.json': '[{ "holes": [1, 2] }]' };
    expect(
      await errorOf(
        `${IMPORT}let myGears = gears.map {|gear| return { ...gear }; };\nmyGears[0].holes.push(3);`,
        files,
      ),
    ).toBe(
      'Line 3, col 1: Cannot change an array inside gears — it comes from data/gears.json, and imported values are fixed. Copy it first: [...myGears[0].holes]',
    );
  });

  it('a value worked out from the data is new and yours', async () => {
    expect(
      await logsOf(
        `${IMPORT}let sizes = gears.map {|gear| return gear.radius * 2; };\nsizes.push(1);\nlog(sizes);`,
        FILES,
      ),
    ).toEqual(['[80, 56, 1]']);
  });

  it('giving the name a new value is the import rule', async () => {
    expect(await errorOf(`${IMPORT}gears = [];`, FILES)).toBe(
      'Parse error at line 2, column 1: Cannot assign to gears — it is imported from data/gears.json. Declare your own with let if it needs to change',
    );
  });

  it('a data file imported from another folder: the message names it by its path from the project folder', async () => {
    const files = {
      '/shared/gears.json': GEARS,
      '/parts/kit.pathogen':
        'module;\nimport table from "../shared/gears.json";\nexport fn grow() { table.push(1); return 0; }\n',
    };
    expect(await errorOf('import { grow } from "./parts/kit.pathogen";\ngrow();', files)).toBe(
      'parts/kit.pathogen line 3, col 20: Cannot change table — it comes from shared/gears.json, and imported values are fixed. Copy it first: [...table]\n  called from main.pathogen line 2',
    );
  });
});

describe('modules get the same message for an object inside (docs/modules.md "What you import is fixed")', () => {
  const FILES = {
    '/parts/sizes.pathogen': 'module;\nexport const sizes = [{ width: 1 }, { width: 2 }];\n',
  };

  it('mySizes[0]["width"] = 4 on an object inside a copied array', async () => {
    expect(
      await errorOf(
        'import { sizes } from "./parts/sizes.pathogen";\nlet mySizes = [...sizes];\nmySizes[0]["width"] = 4;',
        FILES,
      ),
    ).toBe(
      'Line 3, col 1: Cannot change an object inside sizes — it comes from parts/sizes.pathogen, and imported values are fixed. Make new objects: sizes.map {|size| return { ...size }; }',
    );
  });

  it('the top-level value keeps its own message', async () => {
    expect(await errorOf('import { sizes } from "./parts/sizes.pathogen";\nsizes.push(3);', FILES)).toBe(
      'Line 2, col 1: Cannot change sizes — it comes from parts/sizes.pathogen, and imported values are fixed. Copy it first: [...sizes]',
    );
  });
});
