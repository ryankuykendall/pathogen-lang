/**
 * Phase 3a, step 1: the syntax of a data import (docs/data-import.md;
 * project-docs/modules/76-phase-3a-build-plan.md).
 *
 * `import gears from "./data/gears.json";` parses, every walker of imports
 * knows the form, and each path is checked against the form it's imported
 * with: one table for docs/data-import.md's and docs/modules.md's Errors
 * rows, word for word. Reading the data itself is step 2.
 */
import { describe, expect, it } from 'vitest';

import { compile } from '../src';
import { importPathMistake, planImports } from '../src/host/load-modules';
import { importEditsForMoves } from '../src/host/move-imports';
import { getDiagnostics } from '../src/language-services/diagnostics';
import { StringTextDocument } from '../src/language-services/document';
import { formatDocument } from '../src/language-services/formatter';
import { getRenameEdits, prepareRename } from '../src/language-services/rename';
import { analyzeScopes } from '../src/language-services/scope-analysis';
import { parse } from '../src/parser';

import type { ImportDeclaration } from '../src/parser/ast';

function diagnosticsOf(source: string): string[] {
  return getDiagnostics(new StringTextDocument(source)).map(
    (d) => `${d.range.start.line + 1}:${d.range.start.character + 1} ${d.message}`,
  );
}

function formatted(source: string): string {
  const edits = formatDocument(new StringTextDocument(source));
  return edits.length === 0 ? source : edits[0].newText;
}

describe('the AST', () => {
  it('a data import has its name, where the name is, and no specifiers', () => {
    const [decl] = parse('import gears from "./data/gears.json";').body as ImportDeclaration[];
    expect(decl).toMatchObject({
      type: 'ImportDeclaration',
      source: './data/gears.json',
      sourceLoc: { line: 1, column: 19 },
      loc: { line: 1, column: 1 },
      specifiers: [],
      defaultImport: { local: 'gears', loc: { line: 1, column: 8 } },
    });
    expect(decl.namespace).toBeUndefined();
  });

  it('parses wherever an import may go: after comments and a module; line', () => {
    expect(() => parse('// data\nmodule;\nimport sizes from "./sizes.json";\nexport const n = 1;')).not.toThrow();
  });

  it("a name with a .pathogen path parses: the path rules say it's wrong (below), not the parser", () => {
    expect(() => parse('import gears from "./parts/gears.pathogen";')).not.toThrow();
  });
});

describe('planImports records the form and the name', () => {
  it('a name, braces and * as', () => {
    const source =
      'import gears from "./data/gears.json";\nimport { a } from "./a.pathogen";\nimport * as kit from "./kit.pathogen";';
    expect(planImports(source).map((p) => [p.written, p.form, p.name])).toEqual([
      ['./data/gears.json', 'default', 'gears'],
      ['./a.pathogen', 'named', undefined],
      ['./kit.pathogen', 'namespace', 'kit'],
    ]);
  });
});

// docs/data-import.md "Errors" and docs/modules.md "Errors", word for word.
const NOT_IMPORTABLE = (written: string): string =>
  `import path "${written}" isn't a file Pathogen can import. Imports read .pathogen modules and JSON files (.json, .geojson, .topojson, .fold).`;

describe('importPathMistake: the path and the form together', () => {
  it.each([
    ['./data/gears.json', 'gears'],
    ['./data/map.geojson', 'map'],
    ['./data/borders.topojson', 'borders'],
    ['./data/crane.fold', 'crane'],
    ['/data/gears.json', 'gears'],
    ['../shared/gears.json', 'gears'],
    ['./data/GEARS.JSON', 'gears'],
  ])('a name with a data path is well formed: %s', (written, name) => {
    expect(importPathMistake(written, 'default', name)).toBeNull();
  });

  it.each<[string, 'default' | 'named' | 'namespace', string | undefined, string]>([
    [
      './parts/gears.pathogen',
      'default',
      'gears',
      'import gears from "./parts/gears.pathogen" isn\'t supported: Pathogen has no default export. Import its names: import { … } from "./parts/gears.pathogen"; or import * as gears from "./parts/gears.pathogen";',
    ],
    [
      './data/gears',
      'default',
      'gears',
      'import path "./data/gears" has no extension. Write the file\'s full name, such as "./data/gears.json".',
    ],
    ['./data/sizes.xlsx', 'default', 'sizes', NOT_IMPORTABLE('./data/sizes.xlsx')],
    // Text and CSV aren't read yet (text is on hold; CSV comes in 3b).
    ['./data/profile.txt', 'default', 'profile', NOT_IMPORTABLE('./data/profile.txt')],
    ['./data/cities.csv', 'default', 'cities', NOT_IMPORTABLE('./data/cities.csv')],
    [
      './data/sizes.json',
      'named',
      undefined,
      '"./data/sizes.json" is a data file: import it by a name, as import sizes from "./data/sizes.json";',
    ],
    [
      './data/gears.json',
      'namespace',
      'gearTable',
      '"./data/gears.json" is a data file: import it by a name, as import gearTable from "./data/gears.json";',
    ],
    [
      './parts/gears',
      'named',
      undefined,
      'import path "./parts/gears" has no .pathogen extension. Write the file\'s full name: "./parts/gears.pathogen".',
    ],
    ['./notes.md', 'named', undefined, NOT_IMPORTABLE('./notes.md')],
    ['./notes.md', 'namespace', 'notes', NOT_IMPORTABLE('./notes.md')],
    // The path's shape is checked first, the same for every form.
    [
      'gears.json',
      'default',
      'gears',
      'import "gears.json" isn\'t a path. Paths start with ./, ../ or / — did you mean "./gears.json"?',
    ],
    ['./data/', 'default', 'gears', 'import path "./data/" is a folder, not a file.'],
  ])('%s imported as %s', (written, form, name, message) => {
    expect(importPathMistake(written, form, name)).toBe(message);
  });

  it.each([
    ['./data/gear-sizes.json', 'gearSizes'],
    ['./data/gear_sizes.json', 'gear_sizes'],
    ['./data/2020.json', 'data2020'],
    ['./data/circle.json', 'circleData'],
    ['./data/text.json', 'textData'],
    ['./data/über.json', 'uber'],
    ['./data/-.json', 'data'],
  ])('braces on %s suggest a name that can be one: %s', (written, name) => {
    expect(importPathMistake(written, 'named')).toBe(
      `"${written}" is a data file: import it by a name, as import ${name} from "${written}";`,
    );
  });
});

describe('static rules: a data import is an import like the others', () => {
  it('importing the same name again names the form to use', () => {
    expect(diagnosticsOf('import gears from "./a.json";\nimport gears from "./b.json";')).toEqual([
      '2:8 Cannot import gears again — it is already imported on line 1. Import one of them under another name: import … from',
    ]);
  });

  it('declaring the name again', () => {
    expect(diagnosticsOf('import gears from "./data/gears.json";\nconst gears = 1;')).toEqual([
      '2:7 Cannot declare gears again — it is imported on line 1. Use another name',
    ]);
  });

  it('giving it a new value', () => {
    expect(() => parse('import gears from "./data/gears.json";\ngears = [];')).toThrow(
      'Parse error at line 2, column 1: Cannot assign to gears — it is imported from data/gears.json. Declare your own with let if it needs to change',
    );
  });

  it('a built-in name, as for every declaration', () => {
    expect(() => parse('import circle from "./data/circle.json";')).toThrow(
      /^Parse error at line 1, column 8: .*circle/,
    );
  });

  it('imports come first', () => {
    expect(diagnosticsOf('let a = 1;\nimport gears from "./data/gears.json";')).toEqual([
      "2:1 import must come before the file's other statements, @font and define included. Only comments and the module; line may come before it.",
    ]);
  });

  it('a half-typed data import names its own shape', () => {
    const message = 'Incomplete import — write it as import gears from "./data/gears.json";';
    for (const typed of ['import gears', 'import gears from']) {
      expect(diagnosticsOf(`${typed}\nM 0 0`), typed).toEqual([`1:1 ${message}`]);
      expect(() => parse(`${typed}\nM 0 0`), typed).toThrow(`Parse error at line 1, column 1: ${message}`);
    }
  });
});

describe('a program with no project folder', () => {
  it('a data import stops at the import with the documented message', () => {
    expect(() => compile('import gears from "./data/gears.json";\nM 0 0')).toThrow(
      'Line 1, col 1: Cannot import "./data/gears.json": this program has no project folder to read files from. Imports work in a saved playground workspace, the CLI and VS Code.',
    );
  });
});

describe('the formatter', () => {
  it('prints a data import and keeps it stable', () => {
    const source = "import   gears   from './data/gears.json' ;\nlog(gears);\n";
    const expected = 'import gears from "./data/gears.json";\nlog(gears);\n';
    expect(formatted(source)).toBe(expected);
    expect(formatted(expected)).toBe(expected);
  });
});

describe('the editors see the imported name', () => {
  const source = 'import gears from "./data/gears.json";\nfor (gear in gears) {\n  log(gear);\n}';

  it('scope analysis declares it, fixed like a const, as data, and resolves its uses', () => {
    const info = analyzeScopes(new StringTextDocument(source));
    const imports = info.declarations.filter((d) => d.kind === 'import');
    expect(imports.map((d) => [d.name, d.isConst, d.importFrom, d.range.start.line, d.range.start.character])).toEqual([
      ['gears', true, { path: './data/gears.json', data: true }, 0, 7],
    ]);
    const uses = info.references.filter((r) => r.name === 'gears');
    expect(uses).toHaveLength(1);
    expect(uses[0].declaration?.kind).toBe('import');
  });

  it('no static rule fires on a well-formed data import: with no files, the one message is the missing project folder', () => {
    expect(diagnosticsOf(source)).toEqual([
      '1:1 Cannot import "./data/gears.json": this program has no project folder to read files from. Imports work in a saved playground workspace, the CLI and VS Code.',
    ]);
  });

  it("renaming it is allowed: the name is this file's own, so no other file uses it", () => {
    const doc = new StringTextDocument(source);
    expect(prepareRename(doc, { line: 1, character: 15 })).not.toBeNull();
    const edits = getRenameEdits(doc, { line: 1, character: 15 }, 'gearTable');
    expect(
      edits
        .map((e) => [e.range.start.line, e.range.start.character, e.newText])
        .sort((a, b) => Number(a[0]) - Number(b[0])),
    ).toEqual([
      [0, 7, 'gearTable'],
      [1, 13, 'gearTable'],
    ]);
  });
});

describe('moving files rewrites data imports too', () => {
  it("moving the data file rewrites the import's path", () => {
    const files = { '/main.pathogen': 'import gears from "./gears.json";\n', '/gears.json': '[]' };
    expect(importEditsForMoves(files, [{ from: '/gears.json', to: '/data/gears.json' }])).toEqual([
      {
        file: '/main.pathogen',
        edits: [{ from: 19, to: 31, written: './gears.json', text: './data/gears.json', line: 1, column: 20 }],
      },
    ]);
  });

  it('moving the program rewrites its own ./ path to the data file', () => {
    const files = { '/main.pathogen': 'import gears from "./data/gears.json";\n', '/data/gears.json': '[]' };
    expect(importEditsForMoves(files, [{ from: '/main.pathogen', to: '/demos/main.pathogen' }])).toEqual([
      {
        file: '/main.pathogen',
        edits: [{ from: 19, to: 36, written: './data/gears.json', text: '../data/gears.json', line: 1, column: 20 }],
      },
    ]);
  });
});
