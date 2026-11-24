/**
 * Phase 3a, step 2: the loader reads data files (src/host/load-modules.ts;
 * docs/data-import.md; note 76, decisions 1, 3 and 7).
 *
 * - A data file goes into the graph's `data`, apart from the modules: its
 *   text, its value (read once, Pathogen values) and how the compile reached it.
 * - Each mistake is a load error: a JSON mistake at its line and column in
 *   the data file, with an `imported from` line for each import on the way;
 *   a file too large or not UTF-8 at the import's path.
 * - On disk the size is checked before the file is read.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { singularOf } from '../src/data/data-files';
import { DEFAULT_MAX_DATA_BYTES, formatModuleLoadError, resolveModules } from '../src/host/load-modules';
import { createMemoryProjectHost } from '../src/host/memory-host';
import { dataTooLargeError, megabytes, suggestedMaxDataSize } from '../src/module-messages';
import { createNodeProjectHost } from '../src/node';

import type { HostReadResult, ProjectFileHost } from '../src/host/types';

const MB = 1024 * 1024;

function memoryHost(files: Record<string, string | Uint8Array>) {
  const reads: string[] = [];
  const host: ProjectFileHost = {
    projectLabel: '/Users/you/gear-studies',
    readFile: async (path): Promise<HostReadResult> => {
      reads.push(path);
      const content = files[path];
      if (content === undefined) return { ok: false, code: 'not-found', osPath: `/Users/you/gear-studies${path}` };
      return { ok: true, bytes: typeof content === 'string' ? new TextEncoder().encode(content) : content };
    },
  };
  return { host, reads };
}

const GEARS =
  '[\n  { "name": "drive", "x": 55, "y": 50, "radius": 40, "teeth": 12 },\n  { "name": "idler", "x": 150, "y": 50, "radius": 28, "teeth": 8 }\n]\n';
const MAIN = '// main.pathogen\nimport gears from "./data/gears.json";\n\ndefine ViewBox(0, 0, 200, 100);\n';
const entry = '/main.pathogen';

describe('the graph holds data apart from modules', () => {
  it('a data import: its text, its value, its name and where it was imported', async () => {
    const { host } = memoryHost({ '/data/gears.json': GEARS });
    const { graph, errors } = await resolveModules(MAIN, { host, entry });
    expect(errors).toEqual([]);
    expect([...graph.files.keys(), ...graph.order]).toEqual([]);
    const data = graph.data?.get('/data/gears.json');
    expect(data).toMatchObject({
      path: '/data/gears.json',
      text: GEARS,
      name: 'gears',
      importedFrom: [{ file: '/main.pathogen', line: 2, column: 19 }],
    });
    expect(data?.value).toMatchObject({ type: 'ArrayValue' });
    expect((data?.value as { elements: unknown[] }).elements).toHaveLength(2);
  });

  it('read once, however many files import it; a module that imports it lists it with its imports', async () => {
    const { host, reads } = memoryHost({
      '/data/gears.json': GEARS,
      '/parts/kit.pathogen':
        'module;\nimport table from "../data/gears.json";\nexport fn count() { return table.length; }\n',
    });
    const main = 'import gears from "./data/gears.json";\nimport { count } from "./parts/kit.pathogen";\n';
    const { graph, errors } = await resolveModules(main, { host, entry });
    expect(errors).toEqual([]);
    expect(reads.filter((path) => path === '/data/gears.json')).toHaveLength(1);
    expect(graph.files.get('/parts/kit.pathogen')?.imports.map((i) => [i.written, i.path, i.form])).toEqual([
      ['../data/gears.json', '/data/gears.json', 'default'],
    ]);
  });

  it('a missing data file is an error at the import, as for a module', async () => {
    const { host } = memoryHost({});
    const { errors } = await resolveModules(MAIN, { host, entry });
    expect(errors.map((e) => `${e.file} ${e.line}:${e.column} ${e.message}`)).toEqual([
      '/main.pathogen 2:19 import file "./data/gears.json" was not found (looked for /Users/you/gear-studies/data/gears.json).',
    ]);
  });

  it('a byte-order mark is dropped', async () => {
    const { host } = memoryHost({ '/data/gears.json': `${String.fromCharCode(0xfeff)}[1]` });
    const { graph, errors } = await resolveModules(MAIN, { host, entry });
    expect(errors).toEqual([]);
    expect(graph.data?.get('/data/gears.json')?.text).toBe('[1]');
  });
});

describe('mistakes in a data file', () => {
  it("a JSON mistake is at its own line and column, and the CLI prints docs/data-import.md's block", async () => {
    const broken = '[\n  { "name": "drive" }\n  { "name": "idler" }\n]\n';
    const { host } = memoryHost({ '/data/gears.json': broken });
    const { errors } = await resolveModules(MAIN, { host, entry });
    expect(errors).toEqual([
      {
        message: 'expected , or ] after an array item',
        file: '/data/gears.json',
        line: 3,
        column: 3,
        importedFrom: [{ file: '/main.pathogen', line: 2, column: 19 }],
      },
    ]);
    expect(formatModuleLoadError(errors[0], 'main.pathogen')).toBe(
      'Error: data/gears.json line 3, col 3: expected , or ] after an array item\n  imported from main.pathogen line 2',
    );
  });

  it('through a module: one imported from line for each import on the way', async () => {
    const { host } = memoryHost({
      '/data/gears.json': '[1 2]',
      '/parts/kit.pathogen': 'module;\nimport table from "../data/gears.json";\nexport const n = 1;\n',
    });
    const { errors } = await resolveModules('import { n } from "./parts/kit.pathogen";\n', { host, entry });
    expect(errors.map((e) => formatModuleLoadError(e, 'main.pathogen'))).toEqual([
      'Error: data/gears.json line 1, col 4: expected , or ] after an array item\n  imported from parts/kit.pathogen line 2\n  imported from main.pathogen line 1',
    ]);
  });

  it('the files it tried to read and could not are listed, for an editor to watch', async () => {
    const { host } = memoryHost({
      '/data/gears.json': '[1 2]',
      '/parts/kit.pathogen': 'M 0 0\n',
    });
    const main =
      'import gears from "./data/gears.json";\nimport { n } from "./parts/kit.pathogen";\nimport gone from "./data/gone.json";\n';
    const { unread } = await resolveModules(main, { host, entry });
    expect(unread.sort()).toEqual(['/data/gears.json', '/data/gone.json', '/parts/kit.pathogen']);
  });

  it('reported once, however many imports read the file', async () => {
    const { host } = memoryHost({
      '/data/gears.json': '[1 2]',
      '/parts/kit.pathogen': 'module;\nimport table from "../data/gears.json";\nexport const n = 1;\n',
    });
    const main = 'import gears from "./data/gears.json";\nimport { n } from "./parts/kit.pathogen";\n';
    const { errors } = await resolveModules(main, { host, entry });
    expect(errors).toHaveLength(1);
  });

  it("a file that isn't UTF-8 text", async () => {
    const { host } = memoryHost({ '/data/gears.json': new Uint8Array([0x5b, 0xff, 0xfe, 0x5d]) });
    const { errors } = await resolveModules(MAIN, { host, entry });
    expect(errors.map((e) => `${e.file} ${e.line}:${e.column} ${e.message}`)).toEqual([
      '/main.pathogen 2:19 import file "./data/gears.json" isn\'t UTF-8 text, so it can\'t be read. Save it as UTF-8.',
    ]);
  });

  it('a file over the limit is an error at the import, with its size, the limit and how to raise it', async () => {
    const { host } = memoryHost({ '/data/gears.json': `[${'1,'.repeat(MB)}1]` });
    const { errors, graph } = await resolveModules(MAIN, { host, entry, maxDataBytes: MB });
    expect(errors.map((e) => `${e.file} ${e.line}:${e.column} ${e.message}`)).toEqual([
      '/main.pathogen 2:19 import file "./data/gears.json" is 2.1 MB, more than the 1 MB a data file can be. To read it anyway, pass --max-data-size=50 (in VS Code, the pathogen.maxDataSize setting).',
    ]);
    expect(graph.data?.size ?? 0).toBe(0);
  });

  it('the limit is 50 MB unless raised', () => {
    expect(DEFAULT_MAX_DATA_BYTES).toBe(50 * MB);
  });
});

describe('a workspace in memory answers with its text (phase 3a step 6)', () => {
  const SMALL = '[{ "x": 1 }]';

  it('the loader reads the text and never asks for the bytes', async () => {
    const texts = new Map([
      ['main.pathogen', MAIN],
      ['data/gears.json', SMALL],
    ]);
    const inner = createMemoryProjectHost(texts, { label: 'Gears' });
    // A host whose answers refuse to give bytes: reading them would fail the test.
    const host: ProjectFileHost = {
      projectLabel: 'Gears',
      readFile: async (path, options) => {
        const read = await inner.readFile(path, options);
        if (!read.ok) return read;
        return {
          ok: true,
          text: read.text,
          get bytes(): Uint8Array {
            throw new Error(`the bytes of ${path} were asked for`);
          },
        };
      },
    };
    const { errors, graph } = await resolveModules(MAIN, { host, entry });
    expect(errors).toEqual([]);
    expect(graph.data?.get('/data/gears.json')?.text).toBe(SMALL);
  });

  it('a text that could pass the limit is counted in UTF-8 bytes, as on disk', async () => {
    // 400,000 characters of "é": 800,000 bytes, under 1 MB as text length but over 0.5 MB in bytes.
    const text = `"${'é'.repeat(400_000)}"`;
    const host = createMemoryProjectHost({ 'main.pathogen': MAIN, 'data/gears.json': text }, { label: 'Gears' });
    const { errors } = await resolveModules(MAIN, { host, entry, maxDataBytes: MB / 2 });
    expect(errors.map((e) => e.message)).toEqual([dataTooLargeError('./data/gears.json', 800_002, MB / 2)]);
  });
});

describe('the size message (docs/data-import.md and docs/cli.md)', () => {
  it("the docs' example", () => {
    expect(dataTooLargeError('./data/trips.json', 82 * MB, 50 * MB)).toBe(
      'import file "./data/trips.json" is 82 MB, more than the 50 MB a data file can be. To read it anyway, pass --max-data-size=100 (in VS Code, the pathogen.maxDataSize setting).',
    );
  });

  // Sizes are whole bytes.
  it.each([
    [82 * MB, '82 MB'],
    [Math.round(5.4 * MB), '5.4 MB'],
    // Rounded up, so a file just over a limit never reads as the limit itself.
    [50 * MB + 1, '50.1 MB'],
    [5 * MB + 1, '5.1 MB'],
    [Math.floor(0.3 * MB), '0.3 MB'],
    [Math.floor(0.3 * MB) + 1, '0.4 MB'],
    [1, '0.1 MB'],
  ])('%i bytes read as %s', (bytes, text) => {
    expect(megabytes(bytes)).toBe(text);
  });

  it.each([
    [82 * MB, 100],
    [50 * MB + 1, 100],
    [100 * MB, 100],
    [120 * MB, 150],
    [3 * MB, 50],
  ])('a file of %i bytes suggests --max-data-size=%i', (bytes, suggested) => {
    expect(suggestedMaxDataSize(bytes)).toBe(suggested);
  });
});

describe('on disk, the size is checked before the file is read', () => {
  mkdirSync(join(__dirname, 'tmp'), { recursive: true });
  const root = mkdtempSync(join(__dirname, 'tmp', 'data-loader-'));
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it("a file over maxBytes is too-large, with its size, and isn't read", async () => {
    mkdirSync(join(root, 'data'), { recursive: true });
    writeFileSync(join(root, 'data', 'big.json'), `[${'1,'.repeat(MB)}1]`);
    const host = createNodeProjectHost(root);
    expect(await host.readFile('/data/big.json', { maxBytes: MB })).toEqual({
      ok: false,
      code: 'too-large',
      size: 2 * MB + 3,
    });
    const read = await host.readFile('/data/big.json');
    expect(read.ok).toBe(true);
  });

  it('the loader passes the limit to the host and reports what it found', async () => {
    const host = createNodeProjectHost(root);
    const { errors } = await resolveModules('import big from "./data/big.json";\n', {
      host,
      entry: '/main.pathogen',
      maxDataBytes: MB,
    });
    expect(errors.map((e) => e.message)).toEqual([
      'import file "./data/big.json" is 2.1 MB, more than the 1 MB a data file can be. To read it anyway, pass --max-data-size=50 (in VS Code, the pathogen.maxDataSize setting).',
    ]);
  });
});

describe('the VS Code modules fixture (packages/vscode-pathogen/test-fixtures/modules)', () => {
  it('its main reads its data file from disk, beside its modules', async () => {
    const root = join(__dirname, '..', 'packages', 'vscode-pathogen', 'test-fixtures', 'modules');
    const main = readFileSync(join(root, 'main.pathogen'), 'utf8');
    const { graph, errors } = await resolveModules(main, {
      host: createNodeProjectHost(root),
      entry: '/main.pathogen',
    });
    expect(errors).toEqual([]);
    expect([...graph.files.keys(), ...(graph.data?.keys() ?? [])]).toEqual([
      '/parts/gears.pathogen',
      '/data/dots.json',
    ]);
  });
});

describe('singularOf: the item name in a message about a list', () => {
  it.each([
    ['gears', 'gear'],
    ['sizes', 'size'],
    ['cities', 'city'],
    ['entries', 'entry'],
    ['prizes', 'prize'],
    ['phases', 'phase'],
    ['houses', 'house'],
    ['rows', 'row'],
    ['photos', 'photo'],
    // No plural ending, or one whose singular the spelling can't tell
    // (matches → match but caches → cache): `item`.
    ['boxes', 'item'],
    ['matches', 'item'],
    ['caches', 'item'],
    ['bushes', 'item'],
    ['classes', 'item'],
    ['quizzes', 'item'],
    ['status', 'item'],
    ['axis', 'item'],
    ['gas', 'item'],
    ['class', 'item'],
    ['data', 'item'],
    ['table', 'item'],
    // A singular that can't be a name: `text` and `case` are keywords, `circle` a built-in name.
    ['texts', 'item'],
    ['cases', 'item'],
    ['circles', 'item'],
  ])('%s → %s', (name, singular) => {
    expect(singularOf(name)).toBe(singular);
  });
});
