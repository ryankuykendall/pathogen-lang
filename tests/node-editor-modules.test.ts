/**
 * Phase 1a, step 6c part 2: the files an editor document imports, for the
 * language server and the VS Code preview (src/node: resolveEditorModules,
 * listProjectModules). Real folders on disk, as the editors see them.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { editorModulePaths, listProjectModules, resolveEditorModules } from '../src/node';

const TMP = join(__dirname, 'tmp');
let project = '';

const GEARS = 'module;\n\nexport fn gear(size) {\n  circle(0, 0, size);\n}\n';

beforeAll(() => {
  mkdirSync(TMP, { recursive: true });
  project = mkdtempSync(join(TMP, 'editor-modules-'));
  const write = (path: string, text: string) => {
    mkdirSync(join(project, ...path.split('/').slice(0, -1)), { recursive: true });
    writeFileSync(join(project, ...path.split('/')), text);
  };
  write('pathogen.json', '{}\n');
  write('main.pathogen', 'import { gear } from "./parts/gears.pathogen";\ngear(4);\n');
  write('parts/gears.pathogen', GEARS);
  write('parts/scene.pathogen', 'M 0 0 L 10 10\n');
  write('lib/deep/marks.pathogen', 'module;\nexport const size = 2;\n');
  write('node_modules/pkg/hidden.pathogen', 'module;\nexport const x = 1;\n');
  write('.cache/copy.pathogen', 'module;\nexport const x = 1;\n');
});

afterAll(() => {
  rmSync(project, { recursive: true, force: true });
});

const noBuffers = (): undefined => undefined;

describe('resolveEditorModules with a broken pathogen.json', () => {
  let broken = '';
  const MAIN_SOURCE = '// main.pathogen\nimport { gear } from "./parts/gears.pathogen";\ngear(4);\n';
  const message = () =>
    `pathogen.json (${broken}): "main" is now "entryPoints", a list whose first entry is the main. Replace it with "entryPoints": ["poster.pathogen"].`;

  beforeAll(() => {
    broken = mkdtempSync(join(TMP, 'editor-modules-broken-'));
    mkdirSync(join(broken, 'parts'));
    writeFileSync(join(broken, 'pathogen.json'), '{ "main": "poster.pathogen" }\n');
    writeFileSync(join(broken, 'parts', 'gears.pathogen'), GEARS);
    writeFileSync(join(broken, 'main.pathogen'), MAIN_SOURCE);
  });

  afterAll(() => {
    rmSync(broken, { recursive: true, force: true });
  });

  it('stops a document with imports, as it stops the CLI: the message is the error at the first import', async () => {
    const result = await resolveEditorModules(join(broken, 'main.pathogen'), MAIN_SOURCE, noBuffers);
    expect(result.errors).toEqual([
      { message: message(), file: '/main.pathogen', line: 2, column: 22, importedFrom: [] },
    ]);
    expect(result.graph.files.size).toBe(0);
  });

  it('a document without imports reads nothing from the project, so it compiles', async () => {
    const result = await resolveEditorModules(join(broken, 'main.pathogen'), 'M 0 0\n', noBuffers);
    expect(result.errors).toEqual([]);
  });
});

describe('resolveEditorModules', () => {
  it("finds the project folder, the document's place in it, and the files it imports", async () => {
    const main = join(project, 'main.pathogen');
    const result = await resolveEditorModules(main, 'import { gear } from "./parts/gears.pathogen";\n', noBuffers);
    expect([result.root, result.entry, result.errors]).toEqual([project, '/main.pathogen', []]);
    expect([...result.graph.files.keys()]).toEqual(['/parts/gears.pathogen']);
    expect(result.graph.files.get('/parts/gears.pathogen')?.source).toBe(GEARS);
    expect(editorModulePaths(result)).toEqual([join(project, 'parts', 'gears.pathogen')]);
  });

  it('an open buffer stands in for the file on disk', async () => {
    const edited = 'module;\n\nexport fn gear(size, teeth) {\n  star(0, 0, size, size - 2, teeth);\n}\n';
    const gearsPath = join(project, 'parts', 'gears.pathogen');
    const result = await resolveEditorModules(
      join(project, 'main.pathogen'),
      'import { gear } from "./parts/gears.pathogen";\n',
      (path) => (path === gearsPath ? edited : undefined),
    );
    expect(result.graph.files.get('/parts/gears.pathogen')?.source).toBe(edited);
  });

  it("a file's ./ paths start in its own folder", async () => {
    const result = await resolveEditorModules(
      join(project, 'parts', 'gears.pathogen'),
      'module;\nimport { size } from "../lib/deep/marks.pathogen";\n',
      noBuffers,
    );
    expect([result.entry, [...result.graph.files.keys()]]).toEqual([
      '/parts/gears.pathogen',
      ['/lib/deep/marks.pathogen'],
    ]);
  });

  it('what could not be loaded comes back as load errors', async () => {
    const result = await resolveEditorModules(
      join(project, 'main.pathogen'),
      'import * as scene from "./parts/scene.pathogen";\n',
      noBuffers,
    );
    expect(result.errors.map((e) => e.message)).toEqual([
      'Cannot import "./parts/scene.pathogen": it isn\'t a module. To make it one, add module; at the top of that file and move its drawing into exported fns.',
    ]);
  });

  it('an unsaved document: each import is a load error saying to save it, and nothing is read', async () => {
    const result = await resolveEditorModules(null, 'import { gear } from "./parts/gears.pathogen";\n', () => {
      throw new Error('read');
    });
    expect([result.root, result.entry, result.graph.files.size]).toEqual([null, '/<unsaved>', 0]);
    expect(result.errors.map((e) => [e.line, e.column, e.message])).toEqual([
      [
        1,
        22,
        'Cannot import "./parts/gears.pathogen" until this file is saved: import paths start at the file\'s folder.',
      ],
    ]);
  });

  it('a document without imports reads nothing', async () => {
    const result = await resolveEditorModules(join(project, 'main.pathogen'), 'M 0 0 L 1 1\n', () => {
      throw new Error('read');
    });
    expect([result.graph.files.size, result.errors]).toEqual([0, []]);
  });
});

describe('listProjectModules', () => {
  it("lists the project's modules by project path, skipping programs, node_modules and dot folders", async () => {
    expect(await listProjectModules(project)).toEqual(['/lib/deep/marks.pathogen', '/parts/gears.pathogen']);
  });

  it('stops after looking at a bounded number of files, programs counted too (breadth first)', async () => {
    // main.pathogen is looked at first, and is a program; then parts/gears.pathogen.
    expect(await listProjectModules(project, { maxFiles: 1 })).toEqual([]);
    expect(await listProjectModules(project, { maxFiles: 2 })).toEqual(['/parts/gears.pathogen']);
  });

  it('reads only the start of a file: a long comment before `module;` still counts', async () => {
    writeFileSync(join(project, 'commented.pathogen'), `// ${'x'.repeat(2000)}\nmodule;\nexport const a = 1;\n`);
    try {
      expect(await listProjectModules(project)).toContain('/commented.pathogen');
    } finally {
      rmSync(join(project, 'commented.pathogen'));
    }
  });
});
