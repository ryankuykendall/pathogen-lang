/**
 * Phase 1a, step 6b: the editor features across files (docs/modules.md "In
 * each tool": "errors, hover, go-to-definition, completion and parameter
 * hints all work across files"; plan in
 * project-docs/modules/26-phase-1a-step6-plan.md).
 *
 * The language services get the files a document imports as data, the
 * `ModuleGraph` from resolveModules, so they stay free of Node and the
 * playground calls them the same way with no graph. These tests build the
 * graph the way the language server will: resolveModules over a host.
 */
import { describe, expect, it } from 'vitest';

import { getCompletions, getDefinition, getHoverInfo, resolveModules, StringTextDocument } from '../src';
import { relativeImportPath } from '../src/language-services/module-exports';

import type { CompletionItem, LanguageServiceOptions, ModuleGraph, Position, ProjectFileHost } from '../src';

function memoryHost(files: Record<string, string>): ProjectFileHost {
  return {
    projectLabel: '/Users/you/my-gears',
    readFile: async (path) =>
      path in files
        ? { ok: true, bytes: new TextEncoder().encode(files[path]) }
        : { ok: false, code: 'not-found', osPath: `/Users/you/my-gears${path}` },
  };
}

// The docs' gears library (docs/modules.md "Exporting"), and a kit that passes
// two of its names on ("To pass on a name from another file").
const GEARS = [
  '// parts/gears.pathogen',
  'module;',
  '',
  'export const toothDepth = 6;',
  '',
  'export enum Teeth { Few = 8, Standard = 12, Fine = 20 }',
  '',
  'export fn gear(center, radius, teeth) {',
  '  star(center.x, center.y, radius, radius - toothDepth, teeth);',
  '  hub(center, radius);',
  '}',
  '',
  '// Not exported: only this file can use it.',
  'fn hub(center, radius) {',
  '  circle(center.x, center.y, radius * 0.3);',
  '}',
  '',
].join('\n');

const KIT = [
  '// parts/kit.pathogen',
  'module;',
  '',
  'import * as gears from "./gears.pathogen";',
  '',
  'export const gear = gears.gear;',
  'export const Teeth = gears.Teeth;',
  '',
].join('\n');

const FILES = {
  '/parts/gears.pathogen': GEARS,
  '/parts/kit.pathogen': KIT,
  // Passing on a name imported under another name, and a whole namespace.
  '/parts/renamed.pathogen': 'module;\n\nimport { gear as cog } from "./gears.pathogen";\nexport const gear = cog;\n',
  '/parts/whole.pathogen': 'module;\n\nimport * as gears from "./gears.pathogen";\nexport const all = gears;\n',
};

/** A graph that may hold load errors (a half-typed import, a missing file). */
async function graphAllowingErrors(source: string): Promise<ModuleGraph> {
  return (await resolveModules(source, { host: memoryHost(FILES), entry: '/main.pathogen' })).graph;
}

const MAIN = [
  'import { gear, Teeth as Kind, toothDepth } from "./parts/gears.pathogen";',
  'import * as gears from "./parts/gears.pathogen";',
  'import * as kit from "./parts/kit.pathogen";',
  '',
  'gear(Point(55, 50), 40, Kind.Standard);',
  'gears.gear(Point(150, 50), 28, gears.Teeth.Few);',
  'kit.gear(Point(10, 10), 5, toothDepth);',
  '',
].join('\n');

async function graphFor(source: string, entry = '/main.pathogen'): Promise<ModuleGraph> {
  const { graph, errors } = await resolveModules(source, { host: memoryHost(FILES), entry });
  expect(errors).toEqual([]);
  return graph;
}

/**
 * The position inside the `occurrence`-th `needle` on 0-based `line` (one
 * character in, so it is inside the word).
 */
function at(source: string, line: number, needle: string, occurrence = 1): Position {
  const text = source.split('\n')[line];
  let from = -1;
  for (let i = 0; i < occurrence; i++) {
    from = text.indexOf(needle, from + 1);
    if (from === -1) throw new Error(`no ${needle} #${occurrence} on line ${line}`);
  }
  return { line, character: from + 1 };
}

const GEAR_HOVER =
  '**gear** — *function*\n\n`fn gear(center, radius, teeth)`\n\nDefined in parts/gears.pathogen, line 8';
const TEETH_HOVER = (name: string): string =>
  `**${name}** — *enum*\n\n\`enum Teeth { Few, Standard, Fine }\`\n\nDefined in parts/gears.pathogen, line 6`;

/** Where `gear`, `Teeth` and `toothDepth` are written in parts/gears.pathogen. */
const GEAR_NAME = { start: { line: 7, character: 10 }, end: { line: 7, character: 14 } };
const TEETH_NAME = { start: { line: 5, character: 12 }, end: { line: 5, character: 17 } };
const DEPTH_NAME = { start: { line: 3, character: 13 }, end: { line: 3, character: 23 } };
const FILE_START = { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } };

describe('hover on a name from another file', () => {
  const hover = async (line: number, needle: string, occurrence = 1): Promise<string | undefined> =>
    getHoverInfo(new StringTextDocument(MAIN), at(MAIN, line, needle, occurrence), {
      modules: await graphFor(MAIN),
    })?.contents;

  it("shows an imported fn's signature and where it is defined", async () => {
    expect(await hover(4, 'gear')).toBe(GEAR_HOVER);
  });

  it('… also on its name in the import', async () => {
    expect(await hover(0, 'gear')).toBe(GEAR_HOVER);
  });

  it("an enum imported under another name shows the enum's own name and members", async () => {
    expect(await hover(4, 'Kind')).toBe(TEETH_HOVER('Kind'));
    expect(await hover(0, 'Kind')).toBe(TEETH_HOVER('Kind'));
  });

  it('the exported name before `as` shows the export', async () => {
    expect(await hover(0, 'Teeth')).toBe(TEETH_HOVER('Teeth'));
  });

  it('an imported const shows its type, inferred in its own file', async () => {
    expect(await hover(6, 'toothDepth')).toBe(
      '**toothDepth** — *variable: number*\n\nDefined in parts/gears.pathogen, line 4',
    );
  });

  it('a namespace lists the exports of its file', async () => {
    expect(await hover(5, 'gears')).toBe(
      '**gears** — *namespace*\n\nThe exports of parts/gears.pathogen: gear, Teeth, toothDepth',
    );
    expect(await hover(2, 'kit')).toBe('**kit** — *namespace*\n\nThe exports of parts/kit.pathogen: gear, Teeth');
  });

  it("a namespace's member shows the export", async () => {
    expect(await hover(5, '.gear')).toBe(GEAR_HOVER);
    expect(await hover(5, '.Teeth')).toBe(TEETH_HOVER('Teeth'));
  });

  it('a name passed on by another file (export const gear = gears.gear) shows where it is defined', async () => {
    expect(await hover(6, '.gear')).toBe(GEAR_HOVER);
  });

  it("a namespace member the file doesn't export has no hover", async () => {
    const source = 'import * as gears from "./parts/gears.pathogen";\nlog(gears.hub);\n';
    const contents = getHoverInfo(new StringTextDocument(source), at(source, 1, 'hub'), {
      modules: await graphFor(source),
    });
    expect(contents).toBeNull();
  });

  it("a name the file doesn't export says so, in the compiler's words", async () => {
    const source = 'import { gera } from "./parts/gears.pathogen";\n';
    const contents = getHoverInfo(new StringTextDocument(source), at(source, 0, 'gera'), {
      modules: await graphFor(source),
    })?.contents;
    expect(contents).toBe(
      '**gera** — *imported name*\n\nparts/gears.pathogen has no export named gera. It exports: gear, Teeth, toothDepth.',
    );
  });

  it('works from inside an imported file too: its ./ paths start in its own folder', async () => {
    const graph = await graphFor(KIT, '/parts/kit.pathogen');
    // `.gear`: one in, the cursor is on the member (`gears` contains `gear` too).
    expect(getHoverInfo(new StringTextDocument(KIT), at(KIT, 5, '.gear'), { modules: graph })?.contents).toBe(
      GEAR_HOVER,
    );
  });

  it('without the files (the playground, an unsaved file) it stays "imported name"', () => {
    expect(getHoverInfo(new StringTextDocument(MAIN), at(MAIN, 4, 'gear'))?.contents).toBe(
      '**gear** — *imported name*\n\nDefined at line 1',
    );
  });
});

describe("a fn's and an enum's hover in one file shows the same signature line", () => {
  it('a fn', () => {
    const source = 'fn draw(cx, cy) {\n  M cx cy\n}\ndraw(1, 2);\n';
    expect(getHoverInfo(new StringTextDocument(source), at(source, 3, 'draw'))?.contents).toBe(
      '**draw** — *function*\n\n`fn draw(cx, cy)`\n\nDefined at line 1',
    );
  });

  it('an enum', () => {
    const source = 'enum Teeth { Few = 8, Fine = 20 }\nlog(Teeth.Few);\n';
    expect(getHoverInfo(new StringTextDocument(source), at(source, 1, 'Teeth'))?.contents).toBe(
      '**Teeth** — *enum*\n\n`enum Teeth { Few, Fine }`\n\nDefined at line 1',
    );
  });
});

describe('go-to-definition opens the other file', () => {
  const definition = async (line: number, needle: string, occurrence = 1) =>
    getDefinition(new StringTextDocument(MAIN), at(MAIN, line, needle, occurrence), {
      modules: await graphFor(MAIN),
    });

  it("an imported name goes to its declaration's name in the other file", async () => {
    expect(await definition(4, 'gear')).toEqual({ file: '/parts/gears.pathogen', range: GEAR_NAME });
    expect(await definition(0, 'gear')).toEqual({ file: '/parts/gears.pathogen', range: GEAR_NAME });
    expect(await definition(6, 'toothDepth')).toEqual({ file: '/parts/gears.pathogen', range: DEPTH_NAME });
  });

  it('an alias and the exported name before `as` both go to the export', async () => {
    expect(await definition(4, 'Kind')).toEqual({ file: '/parts/gears.pathogen', range: TEETH_NAME });
    expect(await definition(0, 'Teeth')).toEqual({ file: '/parts/gears.pathogen', range: TEETH_NAME });
  });

  it("a namespace's member goes to the export", async () => {
    expect(await definition(5, '.gear')).toEqual({ file: '/parts/gears.pathogen', range: GEAR_NAME });
  });

  it('a name passed on by another file goes to where it is defined, not to the line that passes it on', async () => {
    expect(await definition(6, '.gear')).toEqual({ file: '/parts/gears.pathogen', range: GEAR_NAME });
  });

  it('a namespace, and the path in an import, open the file', async () => {
    expect(await definition(5, 'gears')).toEqual({ file: '/parts/gears.pathogen', range: FILE_START });
    expect(await definition(1, 'parts/gears')).toEqual({ file: '/parts/gears.pathogen', range: FILE_START });
  });

  it('a name in this file stays in this file, with no file field', async () => {
    const source =
      'import { gear } from "./parts/gears.pathogen";\nfn draw() {\n  gear(Point(1, 1), 2, 3);\n}\ndraw();\n';
    const location = getDefinition(new StringTextDocument(source), at(source, 4, 'draw'), {
      modules: await graphFor(source),
    });
    expect(location).not.toBeNull();
    expect(location).not.toHaveProperty('file');
    expect(location!.range.start.line).toBe(1);
  });

  it('without the files it goes to the import, as before', () => {
    const location = getDefinition(new StringTextDocument(MAIN), at(MAIN, 4, 'gear'));
    expect(location).not.toHaveProperty('file');
    expect(location!.range.start.line).toBe(0);
  });
});

describe('where the cursor is: word ends, quotes, paths, `as`', () => {
  const definition = async (position: Position) =>
    getDefinition(new StringTextDocument(MAIN), position, { modules: await graphFor(MAIN) });

  it('the cursor just after the exported name before `as` still goes to the export', async () => {
    const end = MAIN.split('\n')[0].indexOf('Teeth') + 'Teeth'.length;
    expect(await definition({ line: 0, character: end })).toEqual({ file: '/parts/gears.pathogen', range: TEETH_NAME });
  });

  it("a click on the path's quote or on a / opens the file", async () => {
    const quote = MAIN.split('\n')[1].indexOf('"');
    expect(await definition({ line: 1, character: quote })).toEqual({
      file: '/parts/gears.pathogen',
      range: FILE_START,
    });
    expect(await definition({ line: 1, character: quote + 2 })).toEqual({
      file: '/parts/gears.pathogen',
      range: FILE_START,
    });
  });

  it('a word inside a path has no hover: it is part of a file name', async () => {
    const options = { modules: await graphFor(MAIN) };
    const doc = new StringTextDocument(MAIN);
    const path = MAIN.split('\n')[1].indexOf('"./parts/gears');
    for (const inPath of ['parts', 'gears', 'pathogen']) {
      const character = MAIN.split('\n')[1].indexOf(inPath, path) + 1;
      expect(getHoverInfo(doc, { line: 1, character }, options), inPath).toBeNull();
      expect(getHoverInfo(doc, { line: 1, character }), `${inPath}, no files`).toBeNull();
    }
  });

  it('a file the AST builder rejects (a default import) still has its import paths', async () => {
    const source = 'import gears from "./parts/gears.pathogen";\n';
    const options = { modules: await graphFor(source) };
    const doc = new StringTextDocument(source);
    expect(getHoverInfo(doc, at(source, 0, 'parts'), options)).toBeNull();
    expect(getDefinition(doc, at(source, 0, 'parts'), options)).toEqual({
      file: '/parts/gears.pathogen',
      range: FILE_START,
    });
  });

  it('`as` is not a name from another file', async () => {
    expect(await definition(at(MAIN, 0, ' as ', 1))).toBeNull();
    const hover = getHoverInfo(new StringTextDocument(MAIN), at(MAIN, 0, ' as '), { modules: await graphFor(MAIN) });
    expect(hover?.contents ?? '').not.toContain('Defined in');
  });
});

describe('names passed on, shadowed or not found', () => {
  it('a name passed on under another name (import { gear as cog }; export const gear = cog;)', async () => {
    const source = 'import { gear } from "./parts/renamed.pathogen";\ngear(Point(1, 1), 2, 3);\n';
    const options = { modules: await graphFor(source) };
    expect(getHoverInfo(new StringTextDocument(source), at(source, 1, 'gear'), options)?.contents).toBe(GEAR_HOVER);
    expect(getDefinition(new StringTextDocument(source), at(source, 1, 'gear'), options)).toEqual({
      file: '/parts/gears.pathogen',
      range: GEAR_NAME,
    });
  });

  it('a namespace passed on as a value is the const that holds it', async () => {
    const source = 'import { all } from "./parts/whole.pathogen";\nlog(all);\n';
    const options = { modules: await graphFor(source) };
    expect(getHoverInfo(new StringTextDocument(source), at(source, 1, 'all'), options)?.contents).toBe(
      '**all** — *variable*\n\nDefined in parts/whole.pathogen, line 4',
    );
  });

  it('a parameter that shadows a namespace is not the namespace', async () => {
    const source =
      'import * as gears from "./parts/gears.pathogen";\nfn spin(gears) {\n  return gears.gear;\n}\nlog(spin(1));\n';
    const options = { modules: await graphFor(source) };
    const doc = new StringTextDocument(source);
    expect(getHoverInfo(doc, at(source, 2, '.gear'), options)?.contents ?? '').not.toContain('Defined in');
    expect(getDefinition(doc, at(source, 2, '.gear'), options)).toBeNull();
  });

  it("an import whose file couldn't be read stays an imported name", async () => {
    const source = 'import { gear } from "./parts/missing.pathogen";\ngear(1);\n';
    const options = { modules: await graphAllowingErrors(source) };
    expect(getHoverInfo(new StringTextDocument(source), at(source, 1, 'gear'), options)?.contents).toBe(
      '**gear** — *imported name*\n\nDefined at line 1',
    );
  });

  it('half-typed imports never throw, wherever the cursor is', async () => {
    for (const source of [
      'import { gear',
      'import { gear } from "',
      'import { gear } from "";\n',
      'import { gear } from "./parts/gears.pathogen"',
      'import * as gears from "./parts/gears.pathogen";\ngears.',
      'import * as gears from "./parts/gears.pathogen";\ngears.gear(',
      'import { , } from "./parts/gears.pathogen";\n',
    ]) {
      const options = { modules: await graphAllowingErrors(source), projectFiles: PROJECT_FILES };
      const doc = new StringTextDocument(source);
      for (let offset = 0; offset <= source.length; offset++) {
        const position = doc.positionAt(offset);
        expect(() => getHoverInfo(doc, position, options), `${source} @${offset}`).not.toThrow();
        expect(() => getDefinition(doc, position, options), `${source} @${offset}`).not.toThrow();
        expect(() => getCompletions(doc, position, options), `${source} @${offset}`).not.toThrow();
      }
    }
  });
});

// --- completion (step 6b, part 2) ------------------------------------------------------

/** The project's modules, as the language server will list them. */
const PROJECT_FILES = ['/parts/gears.pathogen', '/parts/kit.pathogen', '/lib/marks.pathogen'];

/**
 * Completions at the `|` in `raw`. `files` false: no graph (the playground).
 * The graph may hold load errors: a half-typed import is the usual case.
 */
async function completeAt(
  raw: string,
  // `projectFiles: null`: no file list (an undefined one would take the default).
  settings: { files?: boolean; entry?: string; projectFiles?: readonly string[] | null } = {},
): Promise<CompletionItem[]> {
  const { files = true, entry = '/main.pathogen', projectFiles = PROJECT_FILES } = settings;
  const offset = raw.indexOf('|');
  const source = raw.slice(0, offset) + raw.slice(offset + 1);
  const doc = new StringTextDocument(source);
  const options: LanguageServiceOptions = files
    ? {
        modules: (await resolveModules(source, { host: memoryHost(FILES), entry })).graph,
        ...(projectFiles ? { projectFiles } : {}),
      }
    : {};
  return getCompletions(doc, doc.positionAt(offset), options);
}

const labels = (items: CompletionItem[]): string[] => items.map((i) => i.label).sort();

const GEAR_ITEM = { label: 'gear', kind: 'function', detail: 'fn gear(center, radius, teeth) — parts/gears.pathogen' };
const TEETH_ITEM = {
  label: 'Teeth',
  kind: 'variable',
  detail: 'enum Teeth { Few, Standard, Fine } — parts/gears.pathogen',
};
const DEPTH_ITEM = { label: 'toothDepth', kind: 'variable', detail: 'const toothDepth: number — parts/gears.pathogen' };
const shape = (items: CompletionItem[]) =>
  items.map(({ label, kind, detail }) => ({ label, kind, detail })).sort((a, b) => a.label.localeCompare(b.label));

describe('completion inside import { }', () => {
  it("offers the file's exports, each with its signature and file", async () => {
    expect(shape(await completeAt('import { | } from "./parts/gears.pathogen";'))).toEqual([
      GEAR_ITEM,
      TEETH_ITEM,
      DEPTH_ITEM,
    ]);
  });

  it('leaves out the names already imported, and narrows to what is typed', async () => {
    expect(labels(await completeAt('import { gear, | } from "./parts/gears.pathogen";'))).toEqual([
      'Teeth',
      'toothDepth',
    ]);
    expect(labels(await completeAt('import { to| } from "./parts/gears.pathogen";'))).toEqual(['toothDepth']);
  });

  it('a name passed on by another file is offered with what it is', async () => {
    expect(shape(await completeAt('import { | } from "./parts/kit.pathogen";'))).toEqual([GEAR_ITEM, TEETH_ITEM]);
  });

  it('offers nothing after `as` (a new name), before the path is written, or without the files', async () => {
    expect(await completeAt('import { Teeth as | } from "./parts/gears.pathogen";')).toEqual([]);
    expect(await completeAt('import * as | from "./parts/gears.pathogen";')).toEqual([]);
    expect(await completeAt('import { |')).toEqual([]);
    expect(await completeAt('import { | } from "./parts/gears.pathogen";', { files: false })).toEqual([]);
  });

  it('an import on a later line offers its own file, and leaves out only its own names', async () => {
    expect(
      labels(
        await completeAt('import { gear } from "./parts/gears.pathogen";\nimport { | } from "./parts/kit.pathogen";\n'),
      ),
    ).toEqual(['Teeth', 'gear']);
  });

  it('outside the braces, completion is as anywhere else', async () => {
    // Just after `}`: `from` comes next, so the keywords are offered, not the exports.
    const afterBrace = await completeAt('import { gear }| from "./parts/gears.pathogen";');
    expect(afterBrace.map((i) => i.label)).toContain('let');
    expect(afterBrace.some((i) => i.detail.endsWith('— parts/gears.pathogen') || i.kind === 'file')).toBe(false);
    // An import left open doesn't take over the lines after it: the parser ends it there.
    expect((await completeAt('import { gear\nlet x = 1;\nlo|')).map((i) => i.label)).toContain('log');
  });
});

describe("completion after a namespace's dot", () => {
  it("offers the namespace's exports, and only those", async () => {
    expect(shape(await completeAt('import * as gears from "./parts/gears.pathogen";\ngears.|'))).toEqual([
      GEAR_ITEM,
      TEETH_ITEM,
      DEPTH_ITEM,
    ]);
    expect(labels(await completeAt('import * as gears from "./parts/gears.pathogen";\ngears.to|'))).toEqual([
      'toothDepth',
    ]);
  });

  it('follows names another file passes on', async () => {
    expect(shape(await completeAt('import * as kit from "./parts/kit.pathogen";\nkit.|'))).toEqual([
      GEAR_ITEM,
      TEETH_ITEM,
    ]);
  });

  it('inside a fn and in a template literal too', async () => {
    expect(
      labels(await completeAt('import * as gears from "./parts/gears.pathogen";\nfn f() {\n  return gears.|;\n}\n')),
    ).toEqual(['Teeth', 'gear', 'toothDepth']);
    expect(
      labels(await completeAt('import * as gears from "./parts/gears.pathogen";\nlog(`${gears.to|}`);\n')),
    ).toEqual(['toothDepth']);
  });
});

describe('completion inside an import path', () => {
  /** The range a path completion replaces: from just after the opening quote to the cursor. */
  const pathRange = (raw: string) => {
    const doc = new StringTextDocument(raw.replace('|', ''));
    const cursor = raw.indexOf('|');
    return { start: doc.positionAt(raw.lastIndexOf('"', cursor) + 1), end: doc.positionAt(cursor) };
  };

  it("offers the project's modules, written from this file's folder", async () => {
    const raw = 'import { gear } from "|";';
    const items = await completeAt(raw);
    expect(labels(items)).toEqual(['./lib/marks.pathogen', './parts/gears.pathogen', './parts/kit.pathogen']);
    expect(items.every((i) => i.kind === 'file')).toBe(true);
    expect(items[0].range).toEqual(pathRange(raw));
  });

  it('narrows to what is typed, and replaces it', async () => {
    const raw = 'import { gear } from "./pa|";';
    const items = await completeAt(raw);
    expect(labels(items)).toEqual(['./parts/gears.pathogen', './parts/kit.pathogen']);
    expect(items[0].range).toEqual(pathRange(raw));
  });

  it('from a file in a subfolder: ../ for the others, and not the file itself', async () => {
    expect(labels(await completeAt('import * as x from "|";', { entry: '/parts/kit.pathogen' }))).toEqual([
      '../lib/marks.pathogen',
      './gears.pathogen',
    ]);
  });

  it('a path starting with / is written from the project folder', async () => {
    expect(labels(await completeAt('import * as x from "/|";'))).toEqual([
      '/lib/marks.pathogen',
      '/parts/gears.pathogen',
      '/parts/kit.pathogen',
    ]);
  });

  it('works before the closing quote is typed', async () => {
    expect(labels(await completeAt('import { gear } from "./pa|'))).toEqual([
      './parts/gears.pathogen',
      './parts/kit.pathogen',
    ]);
  });

  it("offers nothing without the project's file list, and nothing after the closing quote", async () => {
    expect(await completeAt('import { gear } from "|";', { projectFiles: null })).toEqual([]);
    const afterQuote = await completeAt('import { gear } from "./parts/gears.pathogen"|;');
    expect(afterQuote.filter((i) => i.kind === 'file')).toEqual([]);
  });

  it('a default import (an error the compile explains) still completes its path', async () => {
    expect(labels(await completeAt('import gears from "./parts/g|";'))).toEqual(['./parts/gears.pathogen']);
  });
});

describe('relativeImportPath', () => {
  it('writes ./ inside the folder and ../ out of it', () => {
    expect(relativeImportPath('/main.pathogen', '/parts/gears.pathogen')).toBe('./parts/gears.pathogen');
    expect(relativeImportPath('/parts/kit.pathogen', '/parts/gears.pathogen')).toBe('./gears.pathogen');
    expect(relativeImportPath('/parts/kit.pathogen', '/main.pathogen')).toBe('../main.pathogen');
    expect(relativeImportPath('/a/b/c.pathogen', '/a/d/e.pathogen')).toBe('../d/e.pathogen');
    expect(relativeImportPath('/a/b/c.pathogen', '/x/y.pathogen')).toBe('../../x/y.pathogen');
    expect(relativeImportPath('/a/c.pathogen', '/a/b/c/d.pathogen')).toBe('./b/c/d.pathogen');
  });
});
