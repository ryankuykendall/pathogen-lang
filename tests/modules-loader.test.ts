/**
 * Phase 1a, step 2: the import loader (src/host/load-modules.ts).
 *
 * Before a compile, every imported file is read through a host — the files
 * the program imports, the files they import, each once — and every path,
 * read and cycle mistake is reported at the import that makes it, with the
 * chain of imports that led there. Messages are docs/modules.md "Errors",
 * word for word.
 */
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { compile } from '../src';
import {
  formatModuleLoadError,
  importPathMistake,
  planImports,
  resolveModules,
  withOpenDocuments,
} from '../src/host/load-modules';
import { createNodeProjectHost } from '../src/node';

import type { HostReadResult, ProjectFileHost } from '../src/host/types';

const LABEL = '/Users/you/my-gears';

/**
 * Files in memory, by project path. Lookups ignore letter case the way macOS
 * does, so a path that differs only in case reports `case-mismatch`; a path
 * that is a prefix folder of a file reports `folder`. `reads` counts reads.
 */
function memoryHost(files: Record<string, string | Uint8Array>, overrides: Record<string, HostReadResult> = {}) {
  const reads: string[] = [];
  const host: ProjectFileHost = {
    projectLabel: LABEL,
    readFile: async (path) => {
      reads.push(path);
      if (path in overrides) return overrides[path];
      const content = files[path];
      if (content !== undefined) {
        return { ok: true, bytes: typeof content === 'string' ? new TextEncoder().encode(content) : content };
      }
      if (Object.keys(files).some((p) => p.startsWith(`${path}/`))) return { ok: false, code: 'folder' };
      const other = Object.keys(files).find((p) => p.toLowerCase() === path.toLowerCase());
      if (other) return { ok: false, code: 'case-mismatch', actual: other };
      return { ok: false, code: 'not-found', osPath: `${LABEL}${path}` };
    },
  };
  return { host, reads };
}

const entry = '/main.pathogen';

describe('planImports', () => {
  it('finds each top-level import, in order, at its path string', () => {
    const source =
      '// a library\nimport { gear } from "./parts/gears.pathogen";\nimport * as kit from \'../kit.pathogen\';\nM 0 0';
    expect(planImports(source)).toEqual([
      { written: './parts/gears.pathogen', line: 2, column: 22, from: 34, to: 58 },
      { written: '../kit.pathogen', line: 3, column: 22, from: 81, to: 98 },
    ]);
  });

  it('skips an import inside a fn and one with no path yet (the parser reports those)', () => {
    expect(planImports('fn f() {\n  import { a } from "./a.pathogen";\n}\nimport { b')).toEqual([]);
  });
});

describe('importPathMistake: the path rules', () => {
  it.each([
    [
      'gears.pathogen',
      'import "gears.pathogen" isn\'t a path. Paths start with ./, ../ or / — did you mean "./gears.pathogen"?',
    ],
    [
      'parts/gears.pathogen',
      'import "parts/gears.pathogen" isn\'t a path. Paths start with ./, ../ or / — did you mean "./parts/gears.pathogen"?',
    ],
    [
      '@studio/kit',
      'import "@studio/kit": only files in the project folder can be imported. Paths start with ./, ../ or /.',
    ],
    [
      'std:shapes',
      'import "std:shapes": only files in the project folder can be imported. Paths start with ./, ../ or /.',
    ],
    [
      'https://example.com/kit.pathogen',
      'import "https://example.com/kit.pathogen": only files in the project folder can be imported. Paths start with ./, ../ or /.',
    ],
    ['gears', 'import "gears": only files in the project folder can be imported. Paths start with ./, ../ or /.'],
    [
      'C:/parts/gears.pathogen',
      'import path "C:/parts/gears.pathogen" is a path on your computer. Write paths relative to the file (./ or ../) or the project folder (/).',
    ],
    [
      '~/kit.pathogen',
      'import path "~/kit.pathogen" is a path on your computer. Write paths relative to the file (./ or ../) or the project folder (/).',
    ],
    [
      '.\\parts\\gears.pathogen',
      'import path ".\\parts\\gears.pathogen" uses a backslash. Write paths with forward slashes on every system: "./parts/gears.pathogen".',
    ],
    [
      './parts/gears',
      'import path "./parts/gears" has no .pathogen extension. Write the file\'s full name: "./parts/gears.pathogen".',
    ],
    [
      './data/sizes.json',
      'import path "./data/sizes.json" isn\'t a .pathogen file. Only .pathogen files can be imported.',
    ],
  ])('%s', (written, message) => {
    expect(importPathMistake(written)).toBe(message);
  });

  it.each(['.', '..', './', '/', './parts/', '../..', './..'])('%s names a folder', (written) => {
    expect(importPathMistake(written)).toBe(`import path "${written}" is a folder, not a file.`);
  });

  it.each(['./gears.pathogen', '../lib/gears.pathogen', '/parts/gears.pathogen', './v1.2/gears.pathogen'])(
    '%s is well formed',
    (written) => {
      expect(importPathMistake(written)).toBeNull();
    },
  );
});

describe('resolveModules: reading the graph', () => {
  it('reads each file once, follows imports in imported files, and orders dependencies first', async () => {
    const { host, reads } = memoryHost({
      '/parts/gears.pathogen': 'module;\nimport { tooth } from "./teeth.pathogen";\nexport fn gear() { return tooth(); }',
      '/parts/teeth.pathogen': 'module;\nexport fn tooth() { return 1; }',
    });
    const main = 'import { gear } from "./parts/gears.pathogen";\nimport { tooth } from "/parts/teeth.pathogen";';
    const { graph, errors } = await resolveModules(main, { host, entry });
    expect(errors).toEqual([]);
    expect(graph.entry).toBe('/main.pathogen');
    expect([...graph.files.keys()].sort()).toEqual(['/parts/gears.pathogen', '/parts/teeth.pathogen']);
    expect(graph.order).toEqual(['/parts/teeth.pathogen', '/parts/gears.pathogen']);
    expect(reads).toEqual(['/parts/gears.pathogen', '/parts/teeth.pathogen']);
    expect(graph.files.get('/parts/gears.pathogen')?.imports.map((i) => [i.written, i.path])).toEqual([
      ['./teeth.pathogen', '/parts/teeth.pathogen'],
    ]);
    // How each file was first reached, nearest import first: teeth came through gears.
    expect(graph.files.get('/parts/gears.pathogen')?.importedFrom).toEqual([
      { file: '/main.pathogen', line: 1, column: 22 },
    ]);
    expect(graph.files.get('/parts/teeth.pathogen')?.importedFrom).toEqual([
      { file: '/parts/gears.pathogen', line: 2, column: 23 },
      { file: '/main.pathogen', line: 1, column: 22 },
    ]);
  });

  it('a program with no imports reads nothing', async () => {
    const { host, reads } = memoryHost({});
    const { graph, errors } = await resolveModules('M 0 0', { host, entry });
    expect([errors, graph.order, reads]).toEqual([[], [], []]);
  });

  it('strips a byte-order mark and refuses a file that is not UTF-8 text', async () => {
    const { host } = memoryHost({
      '/bom.pathogen': '\uFEFFmodule;\nexport const a = 1;',
      '/binary.pathogen': new Uint8Array([0xff, 0xfe, 0x00, 0xd8]),
    });
    const { graph, errors } = await resolveModules(
      'import { a } from "./bom.pathogen";\nimport { b } from "./binary.pathogen";',
      { host, entry },
    );
    expect(graph.files.get('/bom.pathogen')?.source).toBe('module;\nexport const a = 1;');
    expect(errors.map((e) => e.message)).toEqual([
      'import file "./binary.pathogen" could not be read: it is not UTF-8 text',
    ]);
  });
});

describe('resolveModules: each read mistake, at the import', () => {
  it.each([
    [
      'a missing file',
      'import { a } from "./parts/gear.pathogen";',
      'import file "./parts/gear.pathogen" was not found (looked for /Users/you/my-gears/parts/gear.pathogen).',
    ],
    [
      'a missing file from the project folder',
      'import { a } from "/parts/gear.pathogen";',
      'import file "/parts/gear.pathogen" was not found (looked for /Users/you/my-gears/parts/gear.pathogen). A leading / means the project folder, not your computer\'s root.',
    ],
    [
      'letter case',
      'import { a } from "./parts/Gears.pathogen";',
      'import file "./parts/Gears.pathogen" differs from the file on disk only in letter case: "./parts/gears.pathogen". Paths are case-sensitive on every system.',
    ],
    ['a folder', 'import { a } from "./parts.pathogen";', 'import path "./parts.pathogen" is a folder, not a file.'],
    [
      'climbing out',
      'import { a } from "../../shared/gears.pathogen";',
      'import path "../../shared/gears.pathogen" leaves the project folder (/Users/you/my-gears). Move the file into the project folder, or move the project\'s pathogen.json (or add one) to a folder that contains both files, other than your home folder itself.',
    ],
    [
      'a link that leads out',
      'import { a } from "./linked.pathogen";',
      'import path "./linked.pathogen" leaves the project folder (/Users/you/my-gears). Move the file into the project folder, or move the project\'s pathogen.json (or add one) to a folder that contains both files, other than your home folder itself.',
    ],
    [
      'an unreadable file',
      'import { a } from "./locked.pathogen";',
      'import file "./locked.pathogen" could not be read: EACCES: permission denied',
    ],
    [
      'a bad path',
      'import { a } from "parts/gears.pathogen";',
      'import "parts/gears.pathogen" isn\'t a path. Paths start with ./, ../ or / — did you mean "./parts/gears.pathogen"?',
    ],
  ])('%s', async (_label, main, message) => {
    const { host } = memoryHost(
      { '/parts/gears.pathogen': '', '/parts.pathogen/x.pathogen': '' },
      {
        '/linked.pathogen': { ok: false, code: 'escapes-root' },
        '/locked.pathogen': { ok: false, code: 'unreadable', detail: 'EACCES: permission denied' },
      },
    );
    const { errors } = await resolveModules(main, { host, entry });
    expect(errors).toEqual([{ message, file: '/main.pathogen', line: 1, column: 19, importedFrom: [] }]);
  });
});

describe('resolveModules: mistakes in imported files carry the chain', () => {
  it('names the file and line, then each import that led there, nearest first', async () => {
    const { host } = memoryHost({
      '/parts/gears.pathogen': '// gears\nmodule;\nimport { tooth } from "./teeth.pathogen";',
      '/parts/teeth.pathogen': 'module;\nimport { metal } from "./missing.pathogen";',
    });
    const { errors } = await resolveModules('import { gear } from "./parts/gears.pathogen";', { host, entry });
    expect(errors).toEqual([
      {
        message:
          'import file "./missing.pathogen" was not found (looked for /Users/you/my-gears/parts/missing.pathogen).',
        file: '/parts/teeth.pathogen',
        line: 2,
        column: 23,
        importedFrom: [
          { file: '/parts/gears.pathogen', line: 3, column: 23 },
          { file: '/main.pathogen', line: 1, column: 22 },
        ],
      },
    ]);
  });

  it('the CLI prints it with one `imported from` line per import (docs/modules.md)', () => {
    const text = formatModuleLoadError(
      {
        message: 'import file "./missing.pathogen" was not found (looked for /x).',
        file: '/parts/teeth.pathogen',
        line: 1,
        column: 23,
        importedFrom: [
          { file: '/parts/gears.pathogen', line: 2, column: 23 },
          { file: '/main.pathogen', line: 1, column: 22 },
        ],
      },
      'main.pathogen',
    );
    expect(text).toBe(
      'Error: parts/teeth.pathogen line 1, col 23: import file "./missing.pathogen" was not found (looked for /x).\n' +
        '  imported from parts/gears.pathogen line 2\n' +
        '  imported from main.pathogen line 1',
    );
  });

  it('a mistake in the compiled file reads like an @font one: file:line:col: error:', () => {
    const text = formatModuleLoadError(
      {
        message: 'import path "./parts.pathogen" is a folder, not a file.',
        file: '/main.pathogen',
        line: 3,
        column: 19,
        importedFrom: [],
      },
      'poster/main.pathogen',
    );
    expect(text).toBe('poster/main.pathogen:3:19: error: import path "./parts.pathogen" is a folder, not a file.');
  });
});

describe('resolveModules: cycles', () => {
  const cycleEnd = '. Move what both files need into a third file that both import.';

  it('two files that import each other: named at the import that closes the cycle', async () => {
    const { host } = memoryHost({ '/parts/a.pathogen': 'module;\nimport { main } from "../main.pathogen";' });
    const { errors } = await resolveModules('import { a } from "./parts/a.pathogen";', { host, entry });
    expect(errors).toEqual([
      {
        message: `Import cycle: main.pathogen → parts/a.pathogen → main.pathogen${cycleEnd}`,
        file: '/parts/a.pathogen',
        line: 2,
        column: 22,
        importedFrom: [{ file: '/main.pathogen', line: 1, column: 19 }],
      },
    ]);
  });

  it('a file that imports itself', async () => {
    const { host } = memoryHost({});
    const { errors } = await resolveModules('import { a } from "./main.pathogen";', { host, entry });
    expect(errors.map((e) => e.message)).toEqual([`Import cycle: main.pathogen → main.pathogen${cycleEnd}`]);
  });

  it('a cycle not involving the compiled file, closed twice, is reported once', async () => {
    // b closes the cycle with two imports; without the de-duplication there would be two errors.
    const { host } = memoryHost({
      '/a.pathogen': 'module;\nimport { b } from "./b.pathogen";',
      '/b.pathogen': 'module;\nimport { a } from "./a.pathogen";\nimport { again } from "/a.pathogen";',
    });
    const { errors } = await resolveModules('import { a } from "./a.pathogen";', { host, entry });
    expect(errors).toEqual([
      {
        message: `Import cycle: a.pathogen → b.pathogen → a.pathogen${cycleEnd}`,
        file: '/b.pathogen',
        line: 2,
        column: 19,
        importedFrom: [
          { file: '/a.pathogen', line: 2, column: 19 },
          { file: '/main.pathogen', line: 1, column: 19 },
        ],
      },
    ]);
  });

  it('a non-entry file that imports itself', async () => {
    const { host } = memoryHost({ '/a.pathogen': 'module;\nimport { a } from "./a.pathogen";' });
    const { errors } = await resolveModules('import { a } from "./a.pathogen";', { host, entry });
    expect(errors.map((e) => [e.message, e.file])).toEqual([
      [`Import cycle: a.pathogen → a.pathogen${cycleEnd}`, '/a.pathogen'],
    ]);
  });
});

describe('resolveModules: more shapes', () => {
  it('a diamond: two files import a third, which is read once and runs first', async () => {
    const { host, reads } = memoryHost({
      '/left.pathogen': 'module;\nimport { base } from "./base.pathogen";',
      '/right.pathogen': 'module;\nimport { base } from "./base.pathogen";',
      '/base.pathogen': 'module;\nexport const base = 1;',
    });
    const { graph, errors } = await resolveModules(
      'import { l } from "./left.pathogen";\nimport { r } from "./right.pathogen";',
      { host, entry },
    );
    expect(errors).toEqual([]);
    expect(graph.order).toEqual(['/base.pathogen', '/left.pathogen', '/right.pathogen']);
    expect(reads).toEqual(['/left.pathogen', '/base.pathogen', '/right.pathogen']);
    expect(graph.files.get('/base.pathogen')?.imports).toEqual([]);
  });

  it('a nested file climbing out of the project is an error in that file', async () => {
    const { host } = memoryHost({ '/parts/a.pathogen': 'module;\nimport { x } from "../../x.pathogen";' });
    const { errors } = await resolveModules('import { a } from "./parts/a.pathogen";', { host, entry });
    expect(errors.map((e) => [e.file, e.message])).toEqual([
      [
        '/parts/a.pathogen',
        'import path "../../x.pathogen" leaves the project folder (/Users/you/my-gears). Move the file into the project folder, or move the project\'s pathogen.json (or add one) to a folder that contains both files, other than your home folder itself.',
      ],
    ]);
  });

  it("a file that can't be read is an error at every import of it, read once", async () => {
    const { host, reads } = memoryHost({
      '/a.pathogen': 'module;\nimport { m } from "./missing.pathogen";',
      '/b.pathogen': 'module;\n\nimport { m } from "/missing.pathogen";',
    });
    const { errors } = await resolveModules('import { a } from "./a.pathogen";\nimport { b } from "./b.pathogen";', {
      host,
      entry,
    });
    expect(errors.map((e) => [e.file, e.line, e.message])).toEqual([
      [
        '/a.pathogen',
        2,
        'import file "./missing.pathogen" was not found (looked for /Users/you/my-gears/missing.pathogen).',
      ],
      [
        '/b.pathogen',
        3,
        'import file "/missing.pathogen" was not found (looked for /Users/you/my-gears/missing.pathogen). A leading / means the project folder, not your computer\'s root.',
      ],
    ]);
    expect(reads.filter((p) => p === '/missing.pathogen')).toHaveLength(1);
  });

  it('the same import twice in one file reads it once', async () => {
    const { host, reads } = memoryHost({ '/a.pathogen': 'module;' });
    await resolveModules('import { x } from "./a.pathogen";\nimport * as a from "/a.pathogen";', { host, entry });
    expect(reads).toEqual(['/a.pathogen']);
  });

  it('a Windows-style path is checked as typed, escapes and all', async () => {
    const { host } = memoryHost({});
    const { errors } = await resolveModules('import { a } from ".\\reports\\new.pathogen";', { host, entry });
    expect(errors.map((e) => e.message)).toEqual([
      'import path ".\\reports\\new.pathogen" uses a backslash. Write paths with forward slashes on every system: "./reports/new.pathogen".',
    ]);
  });

  it('planImports reads files with Windows line endings, and an import after other statements', () => {
    expect(planImports('M 0 0\r\nimport { a } from "./a.pathogen";').map((i) => [i.written, i.line, i.column])).toEqual(
      [['./a.pathogen', 2, 19]],
    );
  });
});

describe('resolveModules: only modules can be imported (docs/modules.md "Importing")', () => {
  const notAModule = (written: string): string =>
    `Cannot import "${written}": it isn't a module. To make it one, add module; at the top of that file and move its drawing into exported fns.`;

  it.each([
    ['a program that draws', 'define ViewBox(0, 0, 100, 100);\ncircle(50, 50, 20);\n'],
    ['a file with exports but no module; line', 'export const toothDepth = 6;\nexport fn gear(r) { return r; }\n'],
    ['an empty file', ''],
    ['module used as a name', 'let module = 3;\nlog(module);\n'],
  ])('%s is an error at the import, on its path', async (_label, source) => {
    const { host } = memoryHost({ '/parts/scene.pathogen': source });
    const { graph, errors } = await resolveModules('// main\nimport { gear } from "./parts/scene.pathogen";', {
      host,
      entry,
    });
    expect(errors).toEqual([
      { message: notAModule('./parts/scene.pathogen'), file: '/main.pathogen', line: 2, column: 22, importedFrom: [] },
    ]);
    expect([...graph.files.keys(), ...graph.order]).toEqual([]);
  });

  it('each import of a non-module gets its own error, worded as it writes the path; the file is read once', async () => {
    const { host, reads } = memoryHost({
      '/a.pathogen': 'module;\nimport { s } from "/parts/scene.pathogen";',
      '/parts/scene.pathogen': 'M 0 0 L 10 10',
    });
    const { errors } = await resolveModules(
      'import { a } from "./a.pathogen";\nimport { s } from "./parts/scene.pathogen";',
      { host, entry },
    );
    expect(errors).toEqual([
      {
        message: notAModule('/parts/scene.pathogen'),
        file: '/a.pathogen',
        line: 2,
        column: 19,
        importedFrom: [{ file: '/main.pathogen', line: 1, column: 19 }],
      },
      { message: notAModule('./parts/scene.pathogen'), file: '/main.pathogen', line: 2, column: 19, importedFrom: [] },
    ]);
    expect(reads.filter((p) => p === '/parts/scene.pathogen')).toHaveLength(1);
  });

  it('a non-module imported by an imported file carries the chain, and the CLI prints it', async () => {
    const { host } = memoryHost({
      '/parts/gears.pathogen': '// gears\nmodule;\nimport { draw } from "./scene.pathogen";',
      '/parts/scene.pathogen': 'M 0 0 L 1 1',
    });
    const { errors } = await resolveModules('import { gear } from "./parts/gears.pathogen";', { host, entry });
    expect(errors).toEqual([
      {
        message: notAModule('./scene.pathogen'),
        file: '/parts/gears.pathogen',
        line: 3,
        column: 22,
        importedFrom: [{ file: '/main.pathogen', line: 1, column: 22 }],
      },
    ]);
    expect(formatModuleLoadError(errors[0], 'main.pathogen')).toBe(
      `Error: parts/gears.pathogen line 3, col 22: ${notAModule('./scene.pathogen')}\n  imported from main.pathogen line 1`,
    );
  });

  it("a non-module's own imports are not followed", async () => {
    const { host, reads } = memoryHost({
      '/scene.pathogen': 'import { x } from "./missing.pathogen";\nimport { y } from "../../outside.pathogen";\nM 0 0',
    });
    const { errors } = await resolveModules('import { s } from "./scene.pathogen";', { host, entry });
    expect(errors.map((e) => [e.file, e.message])).toEqual([['/main.pathogen', notAModule('./scene.pathogen')]]);
    expect(reads).toEqual(['/scene.pathogen']);
  });

  it('comments may come before `module;`: the file is a module', async () => {
    const { host } = memoryHost({ '/lib.pathogen': '// a library\n// of gears\n\nmodule;\nexport const a = 1;' });
    const main = 'import { a } from "./lib.pathogen";\nlog(a);';
    const { graph, errors } = await resolveModules(main, { host, entry });
    expect(errors).toEqual([]);
    expect(graph.order).toEqual(['/lib.pathogen']);
    expect(compile(main, { modules: graph }).logs.find((l) => !l.file)?.parts[0].value).toBe('1');
  });

  it('a header still being typed (`module` with no `;`) counts as a module, so the importer sees the missing `;`', async () => {
    // Lezer's error recovery still builds a ModuleHeader there. The not-a-module
    // message would tell the author to add a line they have already started.
    const { host } = memoryHost({ '/lib.pathogen': '// lib\nmodule\n\nexport const a = 1;\n' });
    const main = 'import { a } from "./lib.pathogen";\nlog(a);';
    const { graph, errors } = await resolveModules(main, { host, entry });
    expect(errors).toEqual([]);
    expect(() => compile(main, { modules: graph })).toThrow(
      "lib.pathogen line 2, col 7: Missing ';'\n  imported from main.pathogen line 1",
    );
  });

  it('`Module;` (a capital M) is not the header: the not-a-module message says what to write', async () => {
    const { host } = memoryHost({ '/lib.pathogen': 'Module;\nexport const a = 1;\n' });
    const { errors } = await resolveModules('import { a } from "./lib.pathogen";', { host, entry });
    expect(errors.map((e) => e.message)).toEqual([notAModule('./lib.pathogen')]);
  });

  it('a misplaced `module;` still makes it a module for the loader; the compile reports the placement in that file', async () => {
    const { host } = memoryHost({ '/late.pathogen': 'const a = 1;\nmodule;\nexport const b = a;' });
    const main = 'import { b } from "./late.pathogen";\nlog(b);';
    const { graph, errors } = await resolveModules(main, { host, entry });
    expect(errors).toEqual([]);
    expect(graph.order).toEqual(['/late.pathogen']);
    expect(() => compile(main, { modules: graph })).toThrow(
      "late.pathogen line 2, col 1: module; must be the file's first statement. Only comments may come before it.\n" +
        '  imported from main.pathogen line 1',
    );
  });
});

describe('withOpenDocuments: unsaved editor buffers', () => {
  it('a file open in the editor reads as its buffer', async () => {
    const { host } = memoryHost({ '/parts/gears.pathogen': 'module;\nexport const saved = 1;' });
    const overlaid = withOpenDocuments(host, (path) =>
      path === '/parts/gears.pathogen' ? 'module;\nexport const unsaved = 2;' : undefined,
    );
    const { graph } = await resolveModules('import { unsaved } from "./parts/gears.pathogen";', {
      host: overlaid,
      entry,
    });
    expect(graph.files.get('/parts/gears.pathogen')?.source).toBe('module;\nexport const unsaved = 2;');
  });

  it('the buffer decides whether the file is a module: deleting `module;` there is the error at once', async () => {
    const { host } = memoryHost({ '/parts/gears.pathogen': 'module;\nexport const saved = 1;' });
    const overlaid = withOpenDocuments(host, () => 'export const unsaved = 2;');
    const { errors } = await resolveModules('import { unsaved } from "./parts/gears.pathogen";', { host: overlaid, entry });
    expect(errors.map((e) => e.message)).toEqual([
      'Cannot import "./parts/gears.pathogen": it isn\'t a module. To make it one, add module; at the top of that file and move its drawing into exported fns.',
    ]);
  });

  it.each([
    [
      'letter case',
      './parts/Gears.pathogen',
      'import file "./parts/Gears.pathogen" differs from the file on disk only in letter case: "./parts/gears.pathogen". Paths are case-sensitive on every system.',
    ],
    [
      'a missing file',
      './parts/new.pathogen',
      'import file "./parts/new.pathogen" was not found (looked for /Users/you/my-gears/parts/new.pathogen).',
    ],
    [
      'a link that leads out',
      './linked.pathogen',
      'import path "./linked.pathogen" leaves the project folder (/Users/you/my-gears). Move the file into the project folder, or move the project\'s pathogen.json (or add one) to a folder that contains both files, other than your home folder itself.',
    ],
  ])('a buffer cannot stand in for a path the disk rejects: %s', async (_label, written, message) => {
    const { host } = memoryHost(
      { '/parts/gears.pathogen': '' },
      { '/linked.pathogen': { ok: false, code: 'escapes-root' } },
    );
    const overlaid = withOpenDocuments(host, () => 'export const a = 1;');
    const { errors } = await resolveModules(`import { a } from "${written}";`, { host: overlaid, entry });
    expect(errors).toEqual([{ message, file: '/main.pathogen', line: 1, column: 19, importedFrom: [] }]);
  });
});

describe('the Node host on disk (the VS Code modules fixture)', () => {
  const root = fileURLToPath(new URL('../packages/vscode-pathogen/test-fixtures/modules/', import.meta.url));

  it('reads the fixture project', async () => {
    const host = createNodeProjectHost(root);
    const main =
      'import { gear, Teeth as Kind } from "./parts/gears.pathogen";\nimport * as gears from "/parts/gears.pathogen";';
    const { graph, errors } = await resolveModules(main, { host, entry });
    expect(errors).toEqual([]);
    expect(graph.order).toEqual(['/parts/gears.pathogen']);
    expect(graph.files.get('/parts/gears.pathogen')?.source).toContain('export fn gear(center, radius, teeth)');
  });

  it('reports letter case and a missing file from the real disk', async () => {
    const host = createNodeProjectHost(root);
    const { errors } = await resolveModules(
      'import { gear } from "./Parts/gears.pathogen";\nimport { b } from "./parts/missing.pathogen";',
      { host, entry },
    );
    expect(errors.map((e) => e.message)).toEqual([
      'import file "./Parts/gears.pathogen" differs from the file on disk only in letter case: "./parts/gears.pathogen". Paths are case-sensitive on every system.',
      expect.stringMatching(
        /^import file "\.\/parts\/missing\.pathogen" was not found \(looked for .*missing\.pathogen\)\.$/,
      ),
    ]);
  });
});
