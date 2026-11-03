/**
 * Phase 1a, step 1: the import/export syntax (docs/modules.md).
 *
 * What this step delivers: the grammar, the AST, every static rule with its
 * exact message and position, the formatter, the editors' view of imported
 * names, and the one run-time behaviour that exists before files can be
 * loaded — an import in a program with no project folder (the playground,
 * an API caller that passes no modules) is a positioned error, the same from
 * compile() and from getDiagnostics() with or without options.
 *
 * Messages are the docs' "Errors" table, word for word (src/module-messages.ts).
 */
import { describe, expect, it } from 'vitest';

import { compile } from '../src';
import { getDiagnostics } from '../src/language-services/diagnostics';
import { StringTextDocument } from '../src/language-services/document';
import { formatDocument } from '../src/language-services/formatter';
import { getHoverInfo } from '../src/language-services/hover';
import { analyzeScopes } from '../src/language-services/scope-analysis';
import { parse } from '../src/parser';

import type { EnumDefinition, FunctionDefinition, ImportDeclaration, LetDeclaration } from '../src/parser/ast';

const NO_PROJECT = (path: string): string =>
  `Cannot import "${path}": this program has no project folder to read files from. Imports work in the CLI and VS Code; a playground workspace is one program for now.`;
const IMPORTS_FIRST =
  "import must come before the file's other statements, @font and define included. Only comments may come first.";

function diagnosticsOf(source: string, options?: Parameters<typeof getDiagnostics>[1]): string[] {
  return getDiagnostics(new StringTextDocument(source), options).map(
    (d) => `${d.range.start.line + 1}:${d.range.start.character + 1} ${d.message}`,
  );
}

function formatted(source: string): string {
  const edits = formatDocument(new StringTextDocument(source));
  return edits.length === 0 ? source : edits[0].newText;
}

describe('the AST', () => {
  it('named imports keep each exported name, its local name and both positions', () => {
    const [decl] = parse('import { gear, Teeth as Kind } from "./parts/gears.pathogen";').body as ImportDeclaration[];
    expect(decl).toMatchObject({
      type: 'ImportDeclaration',
      source: './parts/gears.pathogen',
      sourceLoc: { line: 1, column: 37 },
      loc: { line: 1, column: 1 },
      specifiers: [
        { imported: 'gear', local: 'gear', loc: { line: 1, column: 10 }, localLoc: { line: 1, column: 10 } },
        { imported: 'Teeth', local: 'Kind', loc: { line: 1, column: 16 }, localLoc: { line: 1, column: 25 } },
      ],
    });
    expect(decl.namespace).toBeUndefined();
  });

  it('a namespace import has its name and no specifiers', () => {
    const [decl] = parse('import * as gears from "./parts/gears.pathogen";').body as ImportDeclaration[];
    expect(decl).toMatchObject({
      source: './parts/gears.pathogen',
      specifiers: [],
      namespace: { local: 'gears', loc: { column: 13 } },
    });
  });

  it('an empty list and a trailing comma both parse', () => {
    expect((parse('import {} from "./a.pathogen";').body[0] as ImportDeclaration).specifiers).toEqual([]);
    expect((parse('import { a, } from "./a.pathogen";').body[0] as ImportDeclaration).specifiers).toHaveLength(1);
  });

  it('export is a flag on the const, fn or enum it precedes, with its own position', () => {
    const body = parse(
      'export const toothDepth = 6;\nexport fn gear(c) { return c; }\nexport enum Teeth { Few = 8 }\nconst plain = 1;',
    ).body;
    expect(body[0]).toMatchObject({
      type: 'LetDeclaration',
      kind: 'const',
      exported: true,
      exportLoc: { line: 1, column: 1 },
      loc: { line: 1, column: 8 },
    } satisfies Partial<LetDeclaration>);
    expect(body[1]).toMatchObject({
      type: 'FunctionDefinition',
      name: 'gear',
      exported: true,
      exportLoc: { line: 2, column: 1 },
    } satisfies Partial<FunctionDefinition>);
    expect(body[2]).toMatchObject({
      type: 'EnumDefinition',
      name: 'Teeth',
      exported: true,
    } satisfies Partial<EnumDefinition>);
    expect((body[3] as LetDeclaration).exported).toBeUndefined();
  });

  it('comments may come before imports', () => {
    expect(() => parse('// the gears library\nimport { gear } from "./parts/gears.pathogen";')).not.toThrow();
  });
});

describe('static rules: each message word for word, at its position', () => {
  it.each([
    [
      'import inside a fn',
      'fn f() {\n  import { a } from "./a.pathogen";\n}',
      'Parse error at line 2, column 3: import must be at the top level of the file, not inside a function or block.',
    ],
    [
      'export inside an if',
      'if (true) {\n  export const a = 1;\n}',
      'Parse error at line 2, column 3: export must be at the top level of the file, not inside a function or block.',
    ],
    [
      'export inside a path block',
      'let shape = @{\n  export fn f() { return 1; }\n};',
      'Parse error at line 2, column 3: export must be at the top level of the file, not inside a function or block.',
    ],
    [
      'a default import',
      'import gears from "./parts/gears.pathogen";',
      'Parse error at line 1, column 1: import gears from "./parts/gears.pathogen" would import the file\'s drawing, which isn\'t supported. Import its names: import { … } from "./parts/gears.pathogen"; or import * as gears from "./parts/gears.pathogen";',
    ],
    [
      'export let',
      'export let total = 3;',
      "Parse error at line 1, column 1: export let isn't allowed: an imported file's variables are fixed once it has loaded. Use export const.",
    ],
    [
      'export before a path command',
      'export M 0 0',
      'Parse error at line 1, column 1: export goes in front of a const, fn or enum declaration.',
    ],
    [
      'export before a number',
      'export 5;',
      'Parse error at line 1, column 1: export goes in front of a const, fn or enum declaration.',
    ],
    [
      'an import after a let',
      'let a = 1;\nimport { b } from "./b.pathogen";',
      `Parse error at line 2, column 1: ${IMPORTS_FIRST}`,
    ],
    [
      'an import after @font',
      '@font "Inter";\nimport { b } from "./b.pathogen";',
      `Parse error at line 2, column 1: ${IMPORTS_FIRST}`,
    ],
    [
      'an import after define',
      'define ViewBox(0, 0, 10, 10);\nimport { b } from "./b.pathogen";',
      `Parse error at line 2, column 1: ${IMPORTS_FIRST}`,
    ],
    [
      'a name imported twice',
      'import { gear } from "./a.pathogen";\nimport { gear } from "./b.pathogen";',
      'Parse error at line 2, column 10: Cannot import gear again — it is already imported on line 1. Import one of them under another name: { gear as … }',
    ],
    [
      'a namespace name imported twice',
      'import { kit } from "./a.pathogen";\nimport * as kit from "./b.pathogen";',
      'Parse error at line 2, column 13: Cannot import kit again — it is already imported on line 1. Import one of them under another name: * as …',
    ],
    [
      'a let reusing an imported name',
      'import { gear } from "./a.pathogen";\nlet gear = 1;',
      'Parse error at line 2, column 5: Cannot declare gear again — it is imported on line 1. Use another name',
    ],
    [
      'a const reusing an imported name',
      'import { gear } from "./a.pathogen";\nconst gear = 1;',
      'Parse error at line 2, column 7: Cannot declare gear again — it is imported on line 1. Use another name',
    ],
    [
      'an exported fn reusing an imported name',
      'import * as gear from "./a.pathogen";\nexport fn gear() { return 1; }',
      'Parse error at line 2, column 11: Cannot declare gear again — it is imported on line 1. Use another name',
    ],
    [
      'an enum reusing an imported name',
      'import { Teeth } from "./a.pathogen";\nenum Teeth { Few }',
      'Parse error at line 2, column 6: Cannot declare Teeth again — it is imported on line 1. Use another name',
    ],
    [
      'a destructured name reusing an imported name',
      'import { gear } from "./a.pathogen";\nlet { gear } = { gear: 1 };',
      'Parse error at line 2, column 7: Cannot declare gear again — it is imported on line 1. Use another name',
    ],
    [
      'assigning to an imported name',
      'import { gear } from "./parts/gears.pathogen";\ngear = 5;',
      'Parse error at line 2, column 1: Cannot assign to gear — it is imported from parts/gears.pathogen. Declare your own with let if it needs to change',
    ],
    [
      'assigning to an imported name in a fn that is never called',
      'import * as gears from "../lib/gears.pathogen";\nfn reset() {\n  gears = 0;\n}',
      'Parse error at line 3, column 3: Cannot assign to gears — it is imported from ../lib/gears.pathogen. Declare your own with let if it needs to change',
    ],
    [
      'a built-in name after as',
      'import { edge as line } from "./a.pathogen";',
      'Parse error at line 1, column 18: Cannot use line as a name — it is a built-in function. Use another name',
    ],
    [
      'a built-in name as a namespace',
      'import * as Color from "./a.pathogen";',
      'Parse error at line 1, column 13: Cannot use Color as a name — it is a built-in constructor. Use another name',
    ],
    [
      'a built-in name imported as itself',
      'import { circle } from "./a.pathogen";',
      'Parse error at line 1, column 10: Cannot use circle as a name — it is a built-in function. Use another name',
    ],
  ])('%s', (_label, source, message) => {
    expect(() => parse(source)).toThrow(message);
    expect(() => compile(source)).toThrow(message);
  });

  it('a name imported under one name and shadowed inside a fn is fine (inner scopes may reuse it)', () => {
    expect(() => parse('import { gear } from "./a.pathogen";\nfn f(gear) { return gear; }')).not.toThrow();
  });

  it('the editors list every module-rule violation, each at its word', () => {
    expect(diagnosticsOf('let a = 1;\nimport { b } from "./b.pathogen";\nimport { b } from "./c.pathogen";')).toEqual([
      `2:1 ${IMPORTS_FIRST}`,
      `3:1 ${IMPORTS_FIRST}`,
      '3:10 Cannot import b again — it is already imported on line 2. Import one of them under another name: { b as … }',
    ]);
    expect(diagnosticsOf('export M 0 0')).toEqual(['1:1 export goes in front of a const, fn or enum declaration.']);
  });

  // What the editor shows on each keystroke while an import is typed: the
  // shape, at `import`, until the path is there — then a missing `;` is real.
  const INCOMPLETE =
    'Incomplete import — write it as import { name } from "./file.pathogen"; or import * as name from "./file.pathogen";';
  it.each(['import', 'import {', 'import { gear', 'import { gear }', 'import { gear } from', 'import * as', 'import {} from 5;'])(
    'a half-typed import (%s) names the shape, from the compiler and the editor alike',
    (typed) => {
      const source = `${typed}\nM 0 0`;
      expect(() => parse(source)).toThrow(`Parse error at line 1, column 1: ${INCOMPLETE}`);
      expect(diagnosticsOf(source)).toEqual([`1:1 ${INCOMPLETE}`]);
    },
  );

  it('once the path is written, a missing ; is the message', () => {
    expect(diagnosticsOf('import { gear } from "./parts/gears.pathogen"\nM 0 0')).toEqual(["1:46 Missing ';'"]);
  });
});

describe('a program with no project folder (the playground, an API caller with no modules)', () => {
  const source = '// a comment first is fine\nimport { gear } from "./parts/gears.pathogen";\ngear(Point(1, 1), 2, 3);';

  it('compile() stops at the import with the documented message', () => {
    expect(() => compile(source)).toThrow(`Line 2, col 1: ${NO_PROJECT('./parts/gears.pathogen')}`);
  });

  it('getDiagnostics() says the same at the same place — with no options (the playground) and with fonts (the language server)', () => {
    const expected = [`2:1 ${NO_PROJECT('./parts/gears.pathogen')}`];
    expect(diagnosticsOf(source)).toEqual(expected);
    expect(diagnosticsOf(source, { fonts: { messages: [] } })).toEqual(expected);
  });

  it('a namespace import gets the same message', () => {
    expect(() => compile('import * as kit from "/lib/kit.pathogen";')).toThrow(
      `Line 1, col 1: ${NO_PROJECT('/lib/kit.pathogen')}`,
    );
  });
});

describe('export in the file being compiled does nothing', () => {
  it('the output is the same with and without export', () => {
    const plain =
      'const r = 5;\nenum Size { Small = 2 }\nfn dot(x) {\n  circle(x, 0, calc(r * Size.Small));\n}\nM 0 0\ndot(10);';
    const exported = plain
      .replace('const r', 'export const r')
      .replace('enum Size', 'export enum Size')
      .replace('fn dot', 'export fn dot');
    expect(exported).not.toBe(plain);
    expect(compile(exported).layers).toEqual(compile(plain).layers);
  });
});

describe('`from` stays an ordinary name', () => {
  it('as a variable, a key, a member and a path argument', () => {
    const result = compile('let from = 3;\nlet grad = { from: 4 };\nlet fromKey = grad.from;\nM 0 0\nL from fromKey');
    expect(result.layers[0].data).toBe('M 0 0 L 3 4');
  });
});

describe('path arguments stop at the new keywords', () => {
  it('export on the line after a path command starts a new statement', () => {
    const result = compile('M 0 0 L 10 10\nexport const r = 5;\nL r 0');
    expect(result.layers[0].data).toBe('M 0 0 L 10 10 L 5 0');
  });
});

describe('the formatter', () => {
  it('prints imports and the export prefix, and is stable', () => {
    const source =
      'import {gear,Teeth as Kind} from \'./parts/gears.pathogen\';\nimport * as  gears from "./x.pathogen";\nimport {} from "./y.pathogen";\nexport   const a=1;\nexport fn f(x){\nreturn x;\n}\nexport enum E { A }\n';
    const expected =
      'import { gear, Teeth as Kind } from "./parts/gears.pathogen";\nimport * as gears from "./x.pathogen";\nimport {} from "./y.pathogen";\nexport const a = 1;\nexport fn f(x) {\n  return x;\n}\nexport enum E {\n  A,\n}\n';
    expect(formatted(source)).toBe(expected);
    expect(formatted(expected)).toBe(expected);
  });

  it('keeps an exported declaration verbatim, export included, when a comment forces it', () => {
    // The comment in the parameter list has no AST node, so the statement is
    // printed as written. Its tree node starts at `export`, not at `fn`.
    const source = 'let  x=1;\nexport fn f(a, // first\n  b) {\n  return a;\n}\n';
    expect(formatted(source)).toBe('let x = 1;\nexport fn f(a, // first\n  b) {\n  return a;\n}\n');
  });
});

describe('the editors see imported names', () => {
  const source =
    'import { gear, Teeth as Kind } from "./parts/gears.pathogen";\nimport * as gears from "./x.pathogen";\nlet size = Kind.Few;\ngear(Point(1, 1), 2, size);\nlog(gears.toothDepth);';

  it('scope analysis declares each one, fixed like a const, and resolves its uses', () => {
    const info = analyzeScopes(new StringTextDocument(source));
    const imports = info.declarations.filter((d) => d.kind === 'import');
    expect(imports.map((d) => [d.name, d.isConst, d.range.start.line, d.range.start.character])).toEqual([
      ['gear', true, 0, 9],
      ['Kind', true, 0, 24],
      ['gears', true, 1, 12],
    ]);
    for (const name of ['gear', 'Kind', 'gears']) {
      const uses = info.references.filter((r) => r.name === name);
      expect(uses.length, name).toBeGreaterThan(0);
      expect(
        uses.every((r) => r.declaration?.kind === 'import'),
        name,
      ).toBe(true);
    }
  });

  it('hover names an imported name as one', () => {
    const doc = new StringTextDocument(source);
    const hover = getHoverInfo(doc, { line: 3, character: 1 });
    expect(hover?.contents).toContain('**gear** — *imported name*');
  });

  it('hover explains the keywords', () => {
    const doc = new StringTextDocument(source);
    expect(getHoverInfo(doc, { line: 0, character: 2 })?.contents).toMatch(/^\*\*import\*\* — /);
    const exportDoc = new StringTextDocument('export const a = 1;');
    expect(getHoverInfo(exportDoc, { line: 0, character: 2 })?.contents).toMatch(/^\*\*export\*\* — /);
  });

  it('a variable named `from` hovers as a variable, not as a keyword', () => {
    const doc = new StringTextDocument('let from = 3;\nlog(from);');
    expect(getHoverInfo(doc, { line: 1, character: 5 })?.contents).toContain('**from** — *variable');
  });
});

describe('several errors at once: parse() reports the one written first', () => {
  it('a const mistake before an import-order mistake', () => {
    expect(() => parse('const a = 1;\na = 2;\nimport { b } from "./b.pathogen";')).toThrow(
      'Parse error at line 2, column 1: Cannot assign to a — it is a const.',
    );
  });

  it('an import-order mistake before a const mistake', () => {
    expect(() => parse('let z = 0;\nimport { b } from "./b.pathogen";\nconst a = 1;\na = 2;')).toThrow(
      `Parse error at line 2, column 1: ${IMPORTS_FIRST}`,
    );
  });

  it('a built-in name before an import-order mistake', () => {
    expect(() => parse('import { circle } from "./a.pathogen";\nlet a = 1;\nimport { b } from "./b.pathogen";')).toThrow(
      'Parse error at line 1, column 10: Cannot use circle as a name',
    );
  });

  it('redeclaring with an exported const lands on its `const` keyword, as for a plain const (not on `export`)', () => {
    expect(() => parse('const a = 1;\nexport const a = 2;')).toThrow('Parse error at line 2, column 8:');
  });
});

describe('namingChecks: false (outline, inlay hints, formatter) is unaffected by the import rules', () => {
  const misplaced = 'let a = 1;\nimport { b } from "./b.pathogen";\nimport { b } from "./c.pathogen";';

  it('parse() builds the AST without throwing', () => {
    expect(parse(misplaced, { namingChecks: false }).body.map((s) => s.type)).toEqual([
      'LetDeclaration',
      'ImportDeclaration',
      'ImportDeclaration',
    ]);
  });

  it('the formatter still formats the file', () => {
    expect(formatted('let a=1;\nimport {b} from "./b.pathogen";')).toBe('let a = 1;\nimport { b } from "./b.pathogen";');
  });
});

describe('`from` in import positions', () => {
  it.each([
    'import { from } from "./a.pathogen";',
    'import { start as from } from "./a.pathogen";',
    'import * as from from "./a.pathogen";',
  ])('%s parses, and reaches the no-project-folder error', (source) => {
    expect(() => parse(source)).not.toThrow();
    expect(() => compile(source)).toThrow(`Line 1, col 1: ${NO_PROJECT('./a.pathogen')}`);
  });

  it("a gradient's .from member still works", () => {
    const result = compile("let grad = ConicGradient('wheel', 0.5, 0.5);\ngrad.from = 90deg;\nlog(grad.from);");
    expect(result.logs[0].parts[0]).toMatchObject({ label: 'grad.from' });
  });
});

describe('half-typed imports with a path already written', () => {
  it('an `as` with no name names the shape', () => {
    expect(diagnosticsOf('import { a as } from "./x.pathogen";')).toEqual([
      '1:1 Incomplete import — write it as import { name } from "./file.pathogen"; or import * as name from "./file.pathogen";',
    ]);
  });
});

describe('the formatter keeps an import path exactly', () => {
  it.each([
    ["import { a } from './a\"b.pathogen';", 'import { a } from "./a\\"b.pathogen";'],
    ['import { a } from "./a\\\\b.pathogen";', 'import { a } from "./a\\\\b.pathogen";'],
  ])('%s', (source, expected) => {
    expect(formatted(source)).toBe(expected);
    const before = (parse(source).body[0] as ImportDeclaration).source;
    const after = (parse(expected).body[0] as ImportDeclaration).source;
    expect(after).toBe(before);
  });
});
