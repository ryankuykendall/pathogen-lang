/**
 * Rewriting import paths when files move (docs/workspace-files.md "Renaming,
 * moving and deleting"; note 52, step 1). Renaming or moving a file updates
 * the imports that name it in the other files, and a moved file's own `./`
 * and `../` imports, so every import still reaches the same file.
 *
 * The strongest check is the round trip: compile each program before the
 * move and after it (edits applied, files renamed), through the same loader
 * the playground uses, and compare: no load errors, the same files reached,
 * the same drawing.
 */
import { describe, expect, it } from 'vitest';

import { compile, createMemoryProjectHost, resolveModules } from '../../src';
import { applyImportEdits, importEditsForMoves, pathAfterMoves } from '../../src/host/move-imports';

import type { PathMove } from '../../src/host/move-imports';

const MAIN = [
  'import { gear } from "./parts/gears.pathogen";',
  "import * as kit from './parts/kit.pathogen';",
  'gear(20, 20);',
  'kit.dot(60, 20);',
  '',
].join('\n');
const GEARS = [
  'module;',
  'import { dot } from "./kit.pathogen";',
  'export fn gear(x, y) {',
  '  dot(x, y);',
  '  circle(x, y, 10);',
  '}',
  '',
].join('\n');
const KIT = 'module;\nexport fn dot(x, y) {\n  circle(x, y, 2);\n}\n';
const DEMO = [
  'import { gear } from "../parts/gears.pathogen";',
  'import { dot } from "/parts/kit.pathogen";',
  'gear(50, 50);',
  'dot(80, 80);',
  '',
].join('\n');

/** A workspace by project path. */
const WORKSPACE: Record<string, string> = {
  '/main.pathogen': MAIN,
  '/parts/gears.pathogen': GEARS,
  '/parts/kit.pathogen': KIT,
  '/demos/gears.pathogen': DEMO,
};
const PROGRAMS = ['/main.pathogen', '/demos/gears.pathogen'];

/** Every file after the moves: its edits applied, at its new path. */
function moved(files: Record<string, string>, moves: PathMove[]): Record<string, string> {
  const edits = new Map(importEditsForMoves(files, moves).map((f) => [f.file, f.edits]));
  const out: Record<string, string> = {};
  for (const [path, text] of Object.entries(files)) {
    out[pathAfterMoves(path, moves)] = applyImportEdits(text, edits.get(path) ?? []);
  }
  return out;
}

/** Compile one program of a workspace held by project path. */
async function build(files: Record<string, string>, entry: string) {
  const keys = Object.fromEntries(Object.entries(files).map(([path, text]) => [path.slice(1), text]));
  const host = createMemoryProjectHost(keys, { label: 'Gears' });
  const { graph, errors } = await resolveModules(files[entry], { host, entry });
  const drawing = errors.length === 0 ? compile(files[entry], { modules: graph }).layers.map((l) => l.data) : null;
  return { errors: errors.map((e) => e.message), reached: [...graph.files.keys()].sort(), drawing };
}

/** Moving files leaves every program drawing the same, through the same files. */
async function expectRoundTrip(files: Record<string, string>, moves: PathMove[], programs = PROGRAMS) {
  const after = moved(files, moves);
  for (const program of programs) {
    const before = await build(files, program);
    expect(before.errors, `${program} before the move`).toEqual([]);
    // Not vacuous: the program reaches a library and draws.
    expect(before.reached.length).toBeGreaterThan(0);
    expect(before.drawing!.join(' ')).toMatch(/\ba\b/);
    const now = await build(after, pathAfterMoves(program, moves));
    expect(now.errors, `${program} after the move`).toEqual([]);
    expect(now.reached).toEqual(before.reached.map((p) => pathAfterMoves(p, moves)).sort());
    expect(now.drawing).toEqual(before.drawing);
  }
  return after;
}

describe('pathAfterMoves', () => {
  it('moves a file, everything in a moved folder, and nothing else', () => {
    const moves = [
      { from: '/parts/gears.pathogen', to: '/parts/cogs.pathogen' },
      { from: '/demos', to: '/examples/demos' },
    ];
    expect(pathAfterMoves('/parts/gears.pathogen', moves)).toBe('/parts/cogs.pathogen');
    expect(pathAfterMoves('/demos/gears.pathogen', moves)).toBe('/examples/demos/gears.pathogen');
    expect(pathAfterMoves('/demos', moves)).toBe('/examples/demos');
    expect(pathAfterMoves('/parts/kit.pathogen', moves)).toBe('/parts/kit.pathogen');
    // A name that only starts like the folder isn't in it.
    expect(pathAfterMoves('/demos-old/a.pathogen', moves)).toBe('/demos-old/a.pathogen');
  });

  it('applies the most specific move when a folder and a file in it both move', () => {
    const moves = [
      { from: '/parts', to: '/machines' },
      { from: '/parts/kit.pathogen', to: '/kit.pathogen' },
    ];
    expect(pathAfterMoves('/parts/kit.pathogen', moves)).toBe('/kit.pathogen');
    expect(pathAfterMoves('/parts/gears.pathogen', moves)).toBe('/machines/gears.pathogen');
  });

  it('refuses a path that is not a project path', () => {
    expect(() => pathAfterMoves('parts/gears.pathogen', [])).toThrow(/project path/);
    expect(() => importEditsForMoves({}, [{ from: 'parts', to: '/machines' }])).toThrow(/project path/);
  });

  it.each([
    ['a trailing slash', { from: '/parts/', to: '/machines' }],
    ['a ".." part', { from: '/parts', to: '/a/../machines' }],
    ['an empty part', { from: '/parts', to: '/a//machines' }],
    ['a "." part', { from: '/./parts', to: '/machines' }],
    ['the top itself', { from: '/', to: '/machines' }],
  ])('refuses a move with %s, which would map to the wrong place without an error', (_label, move) => {
    expect(() => pathAfterMoves('/parts/gears.pathogen', [move])).toThrow(/not a project path/);
    expect(() => importEditsForMoves(WORKSPACE, [move])).toThrow(/not a project path/);
  });

  it('refuses the same path moved twice', () => {
    const moves = [
      { from: '/parts', to: '/a' },
      { from: '/parts', to: '/b' },
    ];
    expect(() => pathAfterMoves('/parts/kit.pathogen', moves)).toThrow('"/parts" is moved twice.');
  });
});

describe('importEditsForMoves', () => {
  it('renaming a library rewrites the imports that name it, and nothing else', async () => {
    const moves = [{ from: '/parts/gears.pathogen', to: '/parts/cogs.pathogen' }];
    const edits = importEditsForMoves(WORKSPACE, moves);
    expect(edits.map((f) => [f.file, f.edits.map((e) => [e.line, e.written, e.text])])).toEqual([
      ['/main.pathogen', [[1, './parts/gears.pathogen', './parts/cogs.pathogen']]],
      ['/demos/gears.pathogen', [[1, '../parts/gears.pathogen', '../parts/cogs.pathogen']]],
    ]);
    const after = await expectRoundTrip(WORKSPACE, moves);
    expect(after['/main.pathogen'].split('\n')[0]).toBe('import { gear } from "./parts/cogs.pathogen";');
  });

  it('moving a library to another folder rewrites relative and absolute imports of it', async () => {
    const moves = [{ from: '/parts/kit.pathogen', to: '/shared/kit.pathogen' }];
    const after = await expectRoundTrip(WORKSPACE, moves);
    expect(after['/main.pathogen'].split('\n')[1]).toBe("import * as kit from './shared/kit.pathogen';");
    expect(after['/parts/gears.pathogen'].split('\n')[1]).toBe('import { dot } from "../shared/kit.pathogen";');
    // Absolute stays absolute.
    expect(after['/demos/gears.pathogen'].split('\n')[1]).toBe('import { dot } from "/shared/kit.pathogen";');
  });

  it('moving a file rewrites its own relative imports, and leaves its absolute ones', async () => {
    const moves = [{ from: '/demos/gears.pathogen', to: '/try-gears.pathogen' }];
    const edits = importEditsForMoves(WORKSPACE, moves);
    expect(edits.map((f) => [f.file, f.edits.map((e) => e.text)])).toEqual([
      ['/demos/gears.pathogen', ['./parts/gears.pathogen']],
    ]);
    const after = await expectRoundTrip(WORKSPACE, moves);
    expect(after['/try-gears.pathogen']).toBe(DEMO.replace('"../parts/gears.pathogen"', '"./parts/gears.pathogen"'));
  });

  it('moving a folder rewrites imports into it, and leaves imports between its own files', async () => {
    const moves = [{ from: '/parts', to: '/machines/parts' }];
    const edits = importEditsForMoves(WORKSPACE, moves);
    // gears' `./kit.pathogen` still reaches kit: both moved together.
    expect(edits.map((f) => f.file)).toEqual(['/main.pathogen', '/demos/gears.pathogen']);
    const after = await expectRoundTrip(WORKSPACE, moves);
    expect(after['/demos/gears.pathogen'].split('\n').slice(0, 2)).toEqual([
      'import { gear } from "../machines/parts/gears.pathogen";',
      'import { dot } from "/machines/parts/kit.pathogen";',
    ]);
  });

  it('a swap maps every path against the original names, not one move after another', async () => {
    const files = {
      '/main.pathogen': 'import { a } from "./a.pathogen";\nimport { b } from "./b.pathogen";\ncircle(a, b, 1);\n',
      '/a.pathogen': 'module;\nexport const a = 10;\n',
      '/b.pathogen': 'module;\nexport const b = 20;\n',
    };
    const moves = [
      { from: '/a.pathogen', to: '/b.pathogen' },
      { from: '/b.pathogen', to: '/a.pathogen' },
    ];
    const after = await expectRoundTrip(files, moves, ['/main.pathogen']);
    expect(after['/main.pathogen']).toBe(
      'import { a } from "./b.pathogen";\nimport { b } from "./a.pathogen";\ncircle(a, b, 1);\n',
    );
  });

  it('a rename that only changes letter case rewrites the import', async () => {
    const moves = [{ from: '/parts/gears.pathogen', to: '/parts/Gears.pathogen' }];
    const after = await expectRoundTrip(WORKSPACE, moves);
    expect(after['/main.pathogen'].split('\n')[0]).toBe('import { gear } from "./parts/Gears.pathogen";');
  });

  it('rewrites several imports in one file, and applying them from the end keeps every offset right', () => {
    const files = {
      '/main.pathogen': 'import { a } from "./x/a.pathogen";\nimport { b } from "./x/b.pathogen";\n',
      '/x/a.pathogen': 'module;\nexport const a = 1;\n',
      '/x/b.pathogen': 'module;\nexport const b = 2;\n',
    };
    const after = moved(files, [{ from: '/x', to: '/longer-folder-name' }]);
    expect(after['/main.pathogen']).toBe(
      'import { a } from "./longer-folder-name/a.pathogen";\nimport { b } from "./longer-folder-name/b.pathogen";\n',
    );
  });

  it('keeps the spelling of an import that still reaches the same file', () => {
    const files = {
      '/main.pathogen': 'import { gear } from "./parts/../parts/gears.pathogen";\n',
      '/parts/gears.pathogen': GEARS,
      '/parts/kit.pathogen': KIT,
    };
    expect(importEditsForMoves(files, [{ from: '/main.pathogen', to: '/start.pathogen' }])).toEqual([]);
  });

  it('gives each edit its place: the path between the quotes, and its line and column', () => {
    const [file] = importEditsForMoves(WORKSPACE, [{ from: '/parts/kit.pathogen', to: '/kit.pathogen' }]);
    expect(file.file).toBe('/main.pathogen');
    const [edit] = file.edits;
    expect(MAIN.slice(edit.from, edit.to)).toBe('./parts/kit.pathogen');
    // Column 23: the path's first character, after the quote in column 22.
    expect([edit.line, edit.column, edit.text]).toEqual([2, 23, './kit.pathogen']);
  });

  it('keeps an import of a missing file pointing at the same place', () => {
    const files = { '/demos/try.pathogen': 'import { x } from "../parts/missing.pathogen";\n' };
    const after = moved(files, [{ from: '/demos/try.pathogen', to: '/try.pathogen' }]);
    expect(after['/try.pathogen']).toBe('import { x } from "./parts/missing.pathogen";\n');
  });

  it('pins a mis-cased import: it stays as written, so a moved target turns its case error into not-found', async () => {
    const files = { ...WORKSPACE, '/main.pathogen': 'import { gear } from "./Parts/gears.pathogen";\ngear(1, 1);\n' };
    expect(importEditsForMoves(files, [{ from: '/parts', to: '/machines' }]).map((f) => f.file)).toEqual([
      '/demos/gears.pathogen',
    ]);
    const after = moved(files, [{ from: '/parts', to: '/machines' }]);
    const { errors } = await build(after, '/main.pathogen');
    expect(errors).toEqual(['import file "./Parts/gears.pathogen" was not found (looked for Parts/gears.pathogen).']);
  });

  it('leaves imports it cannot read: path mistakes, paths above the top, a string not closed yet', () => {
    const files = {
      '/demos/try.pathogen': [
        'import { a } from "parts/gears.pathogen";',
        'import { b } from "./gears";',
        'import { c } from "../../gears.pathogen";',
        'import { d } from "./gears.pathogen',
      ].join('\n'),
      '/demos/gears.pathogen': GEARS,
    };
    expect(importEditsForMoves(files, [{ from: '/demos', to: '/examples' }])).toEqual([]);
  });

  it('reads only import statements: a path in a comment or a string is left alone', () => {
    const files = {
      '/main.pathogen': [
        '// import { gear } from "./parts/gears.pathogen";',
        'log("./parts/gears.pathogen");',
        '',
      ].join('\n'),
      '/parts/gears.pathogen': GEARS,
    };
    expect(importEditsForMoves(files, [{ from: '/parts', to: '/machines' }])).toEqual([]);
  });

  it('reads only .pathogen files', () => {
    const files = { '/pathogen.json': '{ "x": "import { a } from \\"./a.pathogen\\";" }', '/a.pathogen': 'module;\n' };
    expect(importEditsForMoves(files, [{ from: '/a.pathogen', to: '/b.pathogen' }])).toEqual([]);
  });

  it('takes a Map as well as an object', () => {
    const files = new Map(Object.entries(WORKSPACE));
    expect(
      importEditsForMoves(files, [{ from: '/parts/kit.pathogen', to: '/kit.pathogen' }]).map((f) => f.file),
    ).toEqual(['/main.pathogen', '/parts/gears.pathogen', '/demos/gears.pathogen']);
  });

  it('a file and the file it imports, moved apart in one go, still meet', async () => {
    const moves = [
      { from: '/main.pathogen', to: '/a/main.pathogen' },
      { from: '/parts/kit.pathogen', to: '/shared/kit.pathogen' },
    ];
    const after = await expectRoundTrip(WORKSPACE, moves);
    expect(after['/a/main.pathogen'].split('\n').slice(0, 2)).toEqual([
      'import { gear } from "../parts/gears.pathogen";',
      "import * as kit from '../shared/kit.pathogen';",
    ]);
  });

  it('climbs as many folders as it takes', async () => {
    const files = {
      '/x/y/c.pathogen': 'import { k } from "./k.pathogen";\ncircle(k, k, 1);\n',
      '/x/y/k.pathogen': 'module;\nexport const k = 5;\n',
    };
    const after = await expectRoundTrip(files, [{ from: '/x/y/k.pathogen', to: '/k.pathogen' }], ['/x/y/c.pathogen']);
    expect(after['/x/y/c.pathogen'].split('\n')[0]).toBe('import { k } from "../../k.pathogen";');
  });

  it('rewrites an import that would climb above the top from where the file moves to', async () => {
    const files = {
      '/x/y/c.pathogen': 'import { k } from "../../k.pathogen";\ncircle(k, k, 1);\n',
      '/k.pathogen': 'module;\nexport const k = 5;\n',
    };
    const moves = [{ from: '/x/y/c.pathogen', to: '/c.pathogen' }];
    const after = await expectRoundTrip(files, moves, ['/x/y/c.pathogen']);
    expect(after['/c.pathogen'].split('\n')[0]).toBe('import { k } from "./k.pathogen";');
  });

  it('refuses moves that would put two files at one path', () => {
    expect(() => importEditsForMoves(WORKSPACE, [{ from: '/parts/kit.pathogen', to: '/main.pathogen' }])).toThrow(
      '"/main.pathogen" and "/parts/kit.pathogen" would both be "/main.pathogen".',
    );
  });
});

describe('applyImportEdits', () => {
  it('refuses edits made for another version of the text, rather than corrupting it', () => {
    const [file] = importEditsForMoves(WORKSPACE, [{ from: '/parts/gears.pathogen', to: '/cogs.pathogen' }]);
    const typedSince = `// a note\n${MAIN}`;
    expect(() => applyImportEdits(typedSince, file.edits)).toThrow(/changed since/);
  });

  it('refuses an edit whose path is no longer between quotes', () => {
    const [file] = importEditsForMoves(WORKSPACE, [{ from: '/parts/gears.pathogen', to: '/cogs.pathogen' }]);
    const [edit] = file.edits;
    // The same path text at the same place, but its quotes typed away.
    const unquoted = `${MAIN.slice(0, edit.from - 1)} ${MAIN.slice(edit.from)}`;
    expect(() => applyImportEdits(unquoted, file.edits)).toThrow(/changed since/);
  });

  it('makes several edits given in any order, and refuses two that overlap', () => {
    const [file] = importEditsForMoves(WORKSPACE, [{ from: '/parts', to: '/machines' }]);
    expect(file.edits).toHaveLength(2);
    const inOrder = applyImportEdits(MAIN, file.edits);
    expect(applyImportEdits(MAIN, [...file.edits].reverse())).toBe(inOrder);
    expect(inOrder.split('\n').slice(0, 2)).toEqual([
      'import { gear } from "./machines/gears.pathogen";',
      "import * as kit from './machines/kit.pathogen';",
    ]);
    expect(() => applyImportEdits(MAIN, [file.edits[0], file.edits[0]])).toThrow(/overlap/);
  });
});
