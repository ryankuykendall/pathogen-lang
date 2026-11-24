/**
 * Phase 3a, step 4: data imports in VS Code (docs/data-import.md "In each
 * tool": "Data files work as in the CLI, up to 50 MB; the
 * pathogen.maxDataSize setting raises that. Editing or saving a data file
 * redraws the preview when its program is shown, and rechecks the open files
 * that import it.").
 *
 * The shared editor helpers (src/node), the preview's message to its webview
 * (packages/vscode-pathogen/src/preview-modules.ts) and the language server's
 * imports (packages/pathogen-language-server/src/modules.ts). Real folders on
 * disk; `pathogen-lang` resolves to the sources.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DocumentModules } from '../packages/pathogen-language-server/src/modules';
import * as extensionData from '../packages/vscode-pathogen/src/data-files';
import { modulesForCompile, previewModules } from '../packages/vscode-pathogen/src/preview-modules';
import * as lib from '../src';
import { DATA_EXTENSIONS } from '../src/data/data-files';
import * as node from '../src/node';

const TMP = join(__dirname, 'tmp');
let project = '';

const GEARS =
  '[\n  { "name": "drive", "x": 55, "y": 50, "radius": 40, "teeth": 12 },\n  { "name": "idler", "x": 150, "y": 50, "radius": 28, "teeth": 8 }\n]\n';
const DRAW =
  'define ViewBox(0, 0, 200, 100);\nfor (gear in gears) {\n  star(gear.x, gear.y, gear.radius, gear.radius - 6, gear.teeth);\n}\n';
const MAIN = `import gears from "./data/gears.json";\n${DRAW}`;

beforeAll(() => {
  mkdirSync(TMP, { recursive: true });
  project = mkdtempSync(join(TMP, 'vscode-data-'));
  mkdirSync(join(project, 'data', 'more'), { recursive: true });
  mkdirSync(join(project, 'parts'));
  mkdirSync(join(project, 'node_modules', 'pkg'), { recursive: true });
  mkdirSync(join(project, '.cache'));
  writeFileSync(join(project, 'pathogen.json'), '{}\n');
  writeFileSync(join(project, 'main.pathogen'), MAIN);
  writeFileSync(join(project, 'data', 'gears.json'), GEARS);
  writeFileSync(join(project, 'data', 'broken.json'), '[1 2]');
  writeFileSync(join(project, 'data', 'more', 'map.geojson'), '{ "type": "FeatureCollection", "features": [] }');
  writeFileSync(join(project, 'crane.fold'), '{}');
  writeFileSync(join(project, 'notes.txt'), 'not data');
  writeFileSync(join(project, 'parts', 'kit.pathogen'), 'module;\nexport const n = 1;\n');
  // Not offered: a nested project's own pathogen.json, packages, dot folders.
  writeFileSync(join(project, 'parts', 'pathogen.json'), '{}\n');
  writeFileSync(join(project, 'node_modules', 'pkg', 'package.json'), '{}');
  writeFileSync(join(project, '.cache', 'x.json'), '{}');
  // 1.5 MB: over a 1 MB limit.
  writeFileSync(join(project, 'data', 'big.json'), `[${'1,'.repeat(786_432)}1]`);
});

afterAll(() => rmSync(project, { recursive: true, force: true }));

const noBuffers = (): undefined => undefined;
const main = () => join(project, 'main.pathogen');
const MB = 1024 * 1024;

describe("the extension's copy of the data extensions", () => {
  it('matches the language (src/data/data-files.ts)', () => {
    expect(extensionData.DATA_EXTENSIONS).toEqual(DATA_EXTENSIONS);
  });

  it.each<[string, boolean]>([
    ['/p/data/gears.json', true],
    ['C:\\p\\map.GEOJSON', true],
    ['/p/borders.topojson', true],
    ['/p/crane.fold', true],
    ['/p/pathogen.json', false],
    ['/p/main.pathogen', false],
    ['/p/notes.txt', false],
    ['/p/.json', false],
  ])('%s is a data file: %s', (filePath, expected) => {
    expect(extensionData.isDataFile(filePath)).toBe(expected);
  });

  it("the watchers' glob takes in .pathogen files, pathogen.json and data files", () => {
    expect(extensionData.IMPORTABLE_FILES_GLOB).toBe('**/*.{pathogen,json,geojson,topojson,fold}');
  });
});

describe('the shared editor helpers (src/node)', () => {
  it("resolveEditorModules reads a document's data files, and editorModulePaths lists them so an edit rechecks", async () => {
    const modules = await node.resolveEditorModules(main(), MAIN, noBuffers);
    expect(modules.errors).toEqual([]);
    expect([...(modules.graph.data?.keys() ?? [])]).toEqual(['/data/gears.json']);
    expect(node.editorModulePaths(modules)).toEqual([join(project, 'data', 'gears.json')]);
  });

  it('the size limit, as pathogen.maxDataSize sets it', async () => {
    const source = 'import big from "./data/big.json";\n';
    const limited = await node.resolveEditorModules(main(), source, noBuffers, { maxDataBytes: MB });
    expect(limited.errors.map((e) => e.message)).toEqual([
      'import file "./data/big.json" is 1.6 MB, more than the 1 MB a data file can be. To read it anyway, pass --max-data-size=50 (in VS Code, the pathogen.maxDataSize setting).',
    ]);
    const raised = await node.resolveEditorModules(main(), source, noBuffers, { maxDataBytes: 2 * MB });
    expect(raised.errors).toEqual([]);
  });

  it("listProjectDataFiles: the project's data files, for completing a data import's path", async () => {
    expect(await node.listProjectDataFiles(project)).toEqual([
      '/crane.fold',
      '/data/big.json',
      '/data/broken.json',
      '/data/gears.json',
      '/data/more/map.geojson',
    ]);
  });
});

describe("the preview's message to its webview", () => {
  it('a program whose only import is data still sends its files, with each data file as text', async () => {
    const found = await previewModules({ lib, node }, main(), MAIN, noBuffers);
    expect([found.errors, found.watched]).toEqual([[], [join(project, 'data', 'gears.json')]]);
    // What postMessage carries: JSON. The values are read again on the other side.
    const sent = JSON.parse(JSON.stringify(found.message));
    expect(sent.data).toEqual([
      [
        '/data/gears.json',
        {
          path: '/data/gears.json',
          text: GEARS,
          name: 'gears',
          importedFrom: [{ file: '/main.pathogen', line: 1, column: 19 }],
        },
      ],
    ]);
    const drawn = lib.compile(MAIN, { modules: modulesForCompile(sent, lib.readJson) });
    const inline = lib.compile(
      `let gears = [{ name: "drive", x: 55, y: 50, radius: 40, teeth: 12 }, { name: "idler", x: 150, y: 50, radius: 28, teeth: 8 }];\n${DRAW}`,
    );
    expect(drawn.layers.map((l) => l.data)).toEqual(inline.layers.map((l) => l.data));
  });

  it("an open data file's unsaved text is what the preview draws", async () => {
    const edited = '[{ "name": "only", "x": 100, "y": 50, "radius": 30, "teeth": 5 }]';
    const gearsPath = join(project, 'data', 'gears.json');
    const found = await previewModules({ lib, node }, main(), MAIN, (p) => (p === gearsPath ? edited : undefined));
    const sent = JSON.parse(JSON.stringify(found.message));
    const drawn = lib.compile(MAIN, { modules: modulesForCompile(sent, lib.readJson) });
    expect(drawn.layers[0].data.match(/M/g)).toHaveLength(1);
  });

  it('the size limit reaches the preview too', async () => {
    const found = await previewModules({ lib, node }, main(), 'import big from "./data/big.json";\n', noBuffers, MB);
    expect(found.errors).toEqual([
      'main.pathogen:1:17: error: import file "./data/big.json" is 1.6 MB, more than the 1 MB a data file can be. To read it anyway, pass --max-data-size=50 (in VS Code, the pathogen.maxDataSize setting).',
    ]);
  });
});

describe("the language server's imports", () => {
  const uriOf = (path: string) => pathToFileURL(join(project, ...path.split('/'))).href;

  it('a data file is one the document depends on: editing it rechecks the document', async () => {
    const modules = new DocumentModules(noBuffers);
    await modules.refresh(uriOf('main.pathogen'), MAIN);
    expect(modules.dependents(uriOf('data/gears.json'))).toEqual([uriOf('main.pathogen')]);
  });

  it('a data file that failed to load is one too: fixing it, unsaved, rechecks the document', async () => {
    const modules = new DocumentModules(noBuffers);
    const loaded = await modules.refresh(uriOf('main.pathogen'), 'import broken from "./data/broken.json";\n');
    expect(loaded.errors).toHaveLength(1);
    expect(modules.dependents(uriOf('data/broken.json'))).toEqual([uriOf('main.pathogen')]);
  });

  it("an open data file's unsaved text is what the document's hover and completion read", async () => {
    const edited = '[{ "label": "a" }]';
    const gearsPath = join(project, 'data', 'gears.json');
    const modules = new DocumentModules((p) => (p === gearsPath ? edited : undefined));
    await modules.refresh(uriOf('main.pathogen'), MAIN);
    const hover = lib.getHoverInfo(
      new lib.StringTextDocument(MAIN),
      { line: 0, character: 8 },
      modules.optionsFor(uriOf('main.pathogen')),
    );
    expect(hover?.contents).toBe('**gears** — *imported data*\n\ndata/gears.json · an array of 1 object: label');
  });

  it('the size limit, as the setting gives it', async () => {
    const modules = new DocumentModules(noBuffers);
    modules.setMaxDataBytes(MB);
    const loaded = await modules.refresh(uriOf('main.pathogen'), 'import big from "./data/big.json";\n');
    expect(loaded.errors.map((e) => e.message)[0]).toMatch(
      /^import file "\.\/data\/big\.json" is 1\.6 MB, more than the 1 MB/,
    );
  });

  it("the project's files for completing paths: modules and data files", async () => {
    const modules = new DocumentModules(noBuffers);
    await modules.refresh(uriOf('main.pathogen'), MAIN);
    await modules.listed(uriOf('main.pathogen'));
    expect(modules.optionsFor(uriOf('main.pathogen')).projectFiles).toEqual([
      '/crane.fold',
      '/data/big.json',
      '/data/broken.json',
      '/data/gears.json',
      '/data/more/map.geojson',
      '/parts/kit.pathogen',
    ]);
  });
});
