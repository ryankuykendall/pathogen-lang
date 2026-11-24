/**
 * Phase 3a, step 3: the editors read the data a program imports
 * (docs/data-import.md "In the editor"; mockups v1 1c and 1d, approved).
 *
 * - Hover on an imported name says what it holds.
 * - Completion offers an object's keys after a dot, through `gears[0].` and
 *   the name of a loop over the array; a key that needs brackets in its
 *   bracket form.
 * - A key no item has is underlined with the nearest one.
 * - A mistake in a data file is placed on the import that reads it.
 * - Inside an import's quotes, a name alone is offered data files, braces
 *   and `* as` modules.
 */
import { describe, expect, it } from 'vitest';

import { readJson } from '../src/data/json-reader';
import { resolveModules } from '../src/host/load-modules';
import { getCompletions } from '../src/language-services/completion';
import { chainEndingAt, describeData, receiverBeforeDot } from '../src/language-services/data-shapes';
import { getDiagnostics } from '../src/language-services/diagnostics';
import { StringTextDocument } from '../src/language-services/document';
import { getHoverInfo } from '../src/language-services/hover';

import type { ModuleGraph, ModuleLoadError } from '../src/host/load-modules';
import type { HostReadResult, ProjectFileHost } from '../src/host/types';
import type { Position } from '../src/language-services/types';

const GEARS =
  '[\n  { "name": "drive", "x": 55, "y": 50, "radius": 40, "teeth": 12 },\n  { "name": "idler", "x": 150, "y": 50, "radius": 28, "teeth": 8 }\n]\n';

const FILES: Record<string, string> = {
  '/data/gears.json': GEARS,
  '/data/places.json':
    '[{ "name": "Lyon", "Population (2020)": 522250, "length": 3, "text": "a", "tags": ["x"], "at": { "lat": 45.7, "lon": 4.8 }, "where": "south" }, { "name": "Nice", "capital": false }]',
  '/data/settings.json': '{ "size": 10, "palette": ["red", "blue"] }',
  '/parts/kit.pathogen': 'module;\nexport const n = 1;\n',
};

function memoryHost(files: Record<string, string>): ProjectFileHost {
  return {
    projectLabel: '/Users/you/gear-studies',
    readFile: async (path): Promise<HostReadResult> =>
      files[path] === undefined
        ? { ok: false, code: 'not-found', osPath: path }
        : { ok: true, bytes: new TextEncoder().encode(files[path]) },
  };
}

async function load(source: string, files = FILES): Promise<{ graph: ModuleGraph; errors: ModuleLoadError[] }> {
  return resolveModules(source, { host: memoryHost(files), entry: '/main.pathogen' });
}

/** The position of the last `|` in `raw` (block parameters' `{|gear|` come before it), and the text without it. */
function cursor(raw: string): { source: string; position: Position } {
  const at = raw.lastIndexOf('|');
  const before = raw.slice(0, at).split('\n');
  return {
    source: raw.slice(0, at) + raw.slice(at + 1),
    position: { line: before.length - 1, character: before[before.length - 1].length },
  };
}

async function completeAt(raw: string): Promise<string[]> {
  const { source, position } = cursor(raw);
  const { graph } = await load(source);
  return getCompletions(new StringTextDocument(source), position, { modules: graph }).map(
    (item) => `${item.label} ${item.detail}${item.insertText === undefined ? '' : ` → ${item.insertText}`}`,
  );
}

async function hoverAt(raw: string): Promise<string | null> {
  const { source, position } = cursor(raw);
  const { graph } = await load(source);
  return getHoverInfo(new StringTextDocument(source), position, { modules: graph })?.contents ?? null;
}

async function diagnosticsOf(source: string, files = FILES): Promise<string[]> {
  const { graph, errors } = await load(source, files);
  const SEVERITY: Record<number, string> = { 1: 'error', 2: 'warning' };
  const severity = (n: number | undefined): string => SEVERITY[n ?? 0] ?? String(n);
  return getDiagnostics(new StringTextDocument(source), { modules: graph, loadErrors: errors }).map(
    (d) =>
      `${d.range.start.line + 1}:${d.range.start.character + 1}-${d.range.end.character + 1} ${severity(d.severity)} ${d.message}`,
  );
}

const IMPORT = 'import gears from "./data/gears.json";\n';

describe('hover says what an imported name holds (mockup 1c)', () => {
  const expected = '**gears** — *imported data*\n\ndata/gears.json · an array of 2 objects: name, x, y, radius, teeth';

  it('on a use', async () => {
    expect(await hoverAt(`${IMPORT}for (gear in g|ears) {\n}`)).toBe(expected);
  });

  it('on the import itself', async () => {
    expect(await hoverAt('import ge|ars from "./data/gears.json";\n')).toBe(expected);
  });

  it('a file the loader could not read: what kind of name it is, and nothing more', async () => {
    expect(await hoverAt('import mi|ssing from "./data/missing.json";\n')).toBe('**missing** — *imported data*');
  });
});

describe('describeData: what a value holds, in a few words', () => {
  const described = (json: string): string => {
    const read = readJson(json);
    if (!read.ok) throw new Error(read.message);
    return describeData(read.value);
  };

  it.each([
    [GEARS, 'an array of 2 objects: name, x, y, radius, teeth'],
    ['[{ "a": 1 }]', 'an array of 1 object: a'],
    ['[{ "a": 1 }, { "b": 2 }]', 'an array of 2 objects: a, b'],
    ['[1, 2, 3]', 'an array of 3 numbers'],
    ['["a"]', 'an array of 1 string'],
    ['[true, false]', 'an array of 2 true/false values'],
    ['[[1], [2]]', 'an array of 2 arrays'],
    ['[1, "a", null]', 'an array of 3 items'],
    ['[{ "a": 1 }, 2]', 'an array of 2 items'],
    ['[]', 'an empty array'],
    ['{ "size": 10, "palette": [] }', 'an object with 2 keys: size, palette'],
    ['{ "only": 1 }', 'an object with 1 key: only'],
    ['{}', 'an empty object'],
    ['42', 'a number: 42'],
    ['"hi"', 'a string: "hi"'],
    ['true', 'true'],
    ['null', 'null'],
  ])('%s', (json, words) => {
    expect(described(json)).toBe(words);
  });

  it('a long list of keys stops after 12, and counts them all', () => {
    const keys = Array.from({ length: 15 }, (_, i) => `"k${i}": ${i}`).join(', ');
    expect(described(`[{ ${keys} }]`)).toBe(
      'an array of 1 object: k0, k1, k2, k3, k4, k5, k6, k7, k8, k9, k10, k11, … (15 keys)',
    );
  });

  it('a large count reads with separators', () => {
    expect(described(`[${'1,'.repeat(12_344)}1]`)).toBe('an array of 12,345 numbers');
  });
});

describe('completion offers the keys after a dot (mockup 1d)', () => {
  const KEYS = ['name string', 'x number', 'y number', 'radius number', 'teeth number'];

  it('the name of a loop over the array', async () => {
    expect(await completeAt(`${IMPORT}for (gear in gears) {\n  circle(gear.|\n}`)).toEqual(KEYS);
  });

  it('an item by its index', async () => {
    expect(await completeAt(`${IMPORT}log(gears[0].|);`)).toEqual(KEYS);
  });

  it('a variable holding an item', async () => {
    expect(await completeAt(`${IMPORT}let first = gears[1];\nlog(first.|);`)).toEqual(KEYS);
  });

  it('a block parameter of .map, .filter and .forEach over the array', async () => {
    expect(await completeAt(`${IMPORT}let rs = gears.map {|gear| return gear.|; };`)).toEqual(KEYS);
  });

  it('as typing goes on, the keys that start with what was typed', async () => {
    expect(await completeAt(`${IMPORT}log(gears[0].ra|);`)).toEqual(['radius number']);
  });

  it("every item's keys, each in the order it first appears; a key that needs brackets in its bracket form", async () => {
    expect(
      await completeAt('import places from "./data/places.json";\nfor (place in places) {\n  log(place.|);\n}'),
    ).toEqual([
      'name string',
      'Population (2020) number → ["Population (2020)"]',
      'length number → ["length"]',
      'text string → ["text"]',
      'tags array',
      'at object',
      // `where` is a keyword (case patterns), so it takes brackets too.
      'where string → ["where"]',
      'capital true/false',
    ]);
  });

  it('nested objects', async () => {
    expect(await completeAt('import places from "./data/places.json";\nlog(places[0].at.|);')).toEqual([
      'lat number',
      'lon number',
    ]);
  });

  it('an object file: its keys after its name', async () => {
    expect(await completeAt('import settings from "./data/settings.json";\nlog(settings.|);')).toEqual([
      'size number',
      'palette array',
    ]);
  });

  it('a bracket form replaces the dot', async () => {
    const { source, position } = cursor('import places from "./data/places.json";\nlog(places[0].|);');
    const { graph } = await load(source);
    const item = getCompletions(new StringTextDocument(source), position, { modules: graph }).find(
      (i) => i.label === 'length',
    );
    expect(item?.range).toEqual({ start: { line: 1, character: 13 }, end: position });
  });
});

describe('the receiver before a dot (receiverBeforeDot, chainEndingAt)', () => {
  const written = (text: string): string | null => {
    const expr = receiverBeforeDot(text);
    return expr ? JSON.stringify(expr, (key, value: unknown) => (key === 'loc' ? undefined : value)) : null;
  };

  it.each([
    ['circle(gear.', '{"type":"Identifier","name":"gear"}'],
    [
      'log(places[0].at.',
      '{"type":"MemberExpression","object":{"type":"IndexExpression","object":{"type":"Identifier","name":"places"},"index":{"type":"NumberLiteral","value":0}},"property":"at"}',
    ],
    ['x = 1 + data2.', '{"type":"Identifier","name":"data2"}'],
  ])('%s', (text, expected) => {
    expect(written(text)).toBe(expected);
  });

  it.each(['log(1.', 'log(.', 'log(a[0.', 'log("x".'])('nothing a key can follow: %s', (text) => {
    expect(written(text)).toBeNull();
  });

  it('reads in place, from any offset', () => {
    const source = 'log(gear.radius) + more';
    expect(chainEndingAt(source, source.indexOf('.radius'))).toMatchObject({ type: 'Identifier', name: 'gear' });
  });
});

describe('a key no item has is underlined with the nearest one', () => {
  it('a misspelled key, with the key it means', async () => {
    expect(await diagnosticsOf(`${IMPORT}for (gear in gears) {\n  log(gear.radus);\n}`)).toEqual([
      '3:12-17 warning data/gears.json has no key radus. Did you mean radius?',
    ]);
  });

  it('through an index and in brackets', async () => {
    expect(await diagnosticsOf(`${IMPORT}log(gears[0]["teth"]);`)).toEqual([
      '2:14-20 warning data/gears.json has no key teth. Did you mean teeth?',
    ]);
  });

  it('with nothing near it, no suggestion', async () => {
    expect(await diagnosticsOf(`${IMPORT}log(gears[0].colour);`)).toEqual([
      '2:14-20 warning data/gears.json has no key colour.',
    ]);
  });

  it('a key only some items have may be optional, so it is not underlined', async () => {
    expect(
      await diagnosticsOf(
        'import places from "./data/places.json";\nfor (place in places) {\n  log(place.capital);\n}',
      ),
    ).toEqual([]);
  });

  it("a method of a value, such as an object's .has(), is not a key", async () => {
    expect(await diagnosticsOf(`${IMPORT}log(gears[0].has("x"), gears.length);`)).toEqual([]);
  });
});

describe('a mistake in a data file is placed on the import that reads it', () => {
  it('in the file that imports it, with where the mistake is', async () => {
    const files = { ...FILES, '/data/gears.json': '[\n  { "name": "drive" }\n  { "name": "idler" }\n]\n' };
    // On the import's path, as an error in a module is (docs/modules.md "In each tool").
    expect(await diagnosticsOf(`// main.pathogen\n${IMPORT}`, files)).toEqual([
      '2:19-39 error data/gears.json line 3, col 3: expected , or ] after an array item\n  imported from main.pathogen line 2',
    ]);
  });
});

describe("inside an import's quotes", () => {
  const PROJECT_FILES = ['/data/gears.json', '/data/places.json', '/parts/kit.pathogen', '/main.pathogen'];

  async function pathsAt(raw: string): Promise<string[]> {
    const { source, position } = cursor(raw);
    const { graph } = await load(source);
    return getCompletions(new StringTextDocument(source), position, {
      modules: graph,
      projectFiles: PROJECT_FILES,
    }).map((item) => `${item.label} ${item.detail}`);
  }

  it('a name alone is offered the data files', async () => {
    expect(await pathsAt('import gears from "./|";')).toEqual([
      './data/gears.json data file',
      './data/places.json data file',
    ]);
  });

  it('braces and * as are offered the modules', async () => {
    expect(await pathsAt('import { n } from "./|";')).toEqual(['./parts/kit.pathogen module']);
    expect(await pathsAt('import * as kit from "./|";')).toEqual(['./parts/kit.pathogen module']);
  });
});
