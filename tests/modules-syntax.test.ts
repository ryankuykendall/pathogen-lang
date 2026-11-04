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
  "import must come before the file's other statements, @font and define included. Only comments and the module; line may come before it.";
// docs/modules.md "Exporting" and the Errors table (step 5e: modules are libraries).
const MODULE_FIRST = "module; must be the file's first statement. Only comments may come before it.";
const EXPORT_NEEDS_MODULE =
  "export only works in a module. Remove export, or add module; at the top of the file to make it a module, which can't draw at its top level.";
const MODULE_DRAWS =
  "A module can't draw while it loads. Draw in an exported fn, and call it from the file that imports this one.";
const MODULE_VIEWBOX =
  "A module has no drawing, so it can't define a ViewBox. The program that imports it sets the ViewBox.";

function diagnosticsOf(source: string, options?: Parameters<typeof getDiagnostics>[1]): string[] {
  return getDiagnostics(new StringTextDocument(source), options).map(
    (d) => `${d.range.start.line + 1}:${d.range.start.character + 1} ${d.message}`,
  );
}

/** Each diagnostic with the exact span it underlines: `line:col-line:col message` (1-based). */
function rangesOf(source: string): string[] {
  return getDiagnostics(new StringTextDocument(source)).map(
    (d) =>
      `${d.range.start.line + 1}:${d.range.start.character + 1}-${d.range.end.line + 1}:${d.range.end.character + 1} ${d.message}`,
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
      'module;\nexport const toothDepth = 6;\nexport fn gear(c) { return c; }\nexport enum Teeth { Few = 8 }\nconst plain = 1;',
    ).body;
    expect(body[0]).toEqual({ type: 'ModuleHeader', loc: expect.objectContaining({ line: 1, column: 1 }) });
    expect(body[1]).toMatchObject({
      type: 'LetDeclaration',
      kind: 'const',
      exported: true,
      exportLoc: { line: 2, column: 1 },
      loc: { line: 2, column: 8 },
    } satisfies Partial<LetDeclaration>);
    expect(body[2]).toMatchObject({
      type: 'FunctionDefinition',
      name: 'gear',
      exported: true,
      exportLoc: { line: 3, column: 1 },
    } satisfies Partial<FunctionDefinition>);
    expect(body[3]).toMatchObject({
      type: 'EnumDefinition',
      name: 'Teeth',
      exported: true,
    } satisfies Partial<EnumDefinition>);
    expect((body[4] as LetDeclaration).exported).toBeUndefined();
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
      'Parse error at line 1, column 1: import gears from "./parts/gears.pathogen" isn\'t supported: Pathogen has no default export. Import its names: import { … } from "./parts/gears.pathogen"; or import * as gears from "./parts/gears.pathogen";',
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
      'module;\nimport * as gear from "./a.pathogen";\nexport fn gear() { return 1; }',
      'Parse error at line 3, column 11: Cannot declare gear again — it is imported on line 2. Use another name',
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
  it.each([
    'import',
    'import {',
    'import { gear',
    'import { gear }',
    'import { gear } from',
    'import * as',
    'import {} from 5;',
  ])('a half-typed import (%s) names the shape, from the compiler and the editor alike', (typed) => {
    const source = `${typed}\nM 0 0`;
    expect(() => parse(source)).toThrow(`Parse error at line 1, column 1: ${INCOMPLETE}`);
    expect(diagnosticsOf(source)).toEqual([`1:1 ${INCOMPLETE}`]);
  });

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

describe('export only works in a module (docs/modules.md "Exporting")', () => {
  it('export without module; is an error at the export word, from the compiler and the editor alike', () => {
    const source = 'const r = 5;\nexport const size = 2;';
    expect(() => parse(source)).toThrow(`Parse error at line 2, column 1: ${EXPORT_NEEDS_MODULE}`);
    expect(() => compile(source)).toThrow(`Parse error at line 2, column 1: ${EXPORT_NEEDS_MODULE}`);
    // The underline is the word `export`, not the declaration after it.
    expect(rangesOf(source)).toEqual([`2:1-2:7 ${EXPORT_NEEDS_MODULE}`]);
  });

  it('the editors underline every export in a file without the header', () => {
    expect(rangesOf('export const a = 1;\nexport fn f() { return 1; }\nexport enum Size { Small }')).toEqual([
      `1:1-1:7 ${EXPORT_NEEDS_MODULE}`,
      `2:1-2:7 ${EXPORT_NEEDS_MODULE}`,
      `3:1-3:7 ${EXPORT_NEEDS_MODULE}`,
    ]);
  });

  it('the first fix the message offers, removing export, gives a working program', () => {
    const plain =
      'const r = 5;\nenum Size { Small = 2 }\nfn dot(x) {\n  circle(x, 0, calc(r * Size.Small));\n}\nM 0 0\ndot(10);';
    // circle(10, 0, 5 * 2) from the fn: start at cx − r = 0, then two half arcs of 2r = 20.
    expect(compile(plain).layers[0].data).toBe('M 0 0 M 0 0 a 10 10 0 1 1 20 0 a 10 10 0 1 1 -20 0');
  });

  it('a misplaced module; still makes the file a module: only the header is reported, not each export', () => {
    expect(rangesOf('const a = 1;\nmodule;\nexport const b = 2;')).toEqual([`2:1-2:8 ${MODULE_FIRST}`]);
  });
});

describe('the module; header (docs/modules.md "Exporting")', () => {
  it('is a ModuleHeader statement at its position', () => {
    expect(parse('module;\nexport const a = 1;').body[0]).toEqual({
      type: 'ModuleHeader',
      loc: expect.objectContaining({ line: 1, column: 1 }),
    });
  });

  it('comments may come before it', () => {
    expect(parse('// the gears library\n// by me\nmodule;\nexport const a = 1;').body.map((s) => s.type)).toEqual([
      'Comment',
      'Comment',
      'ModuleHeader',
      'LetDeclaration',
    ]);
    expect(diagnosticsOf('// the gears library\nmodule;\nexport const a = 1;')).toEqual([]);
  });

  it('imports come after it', () => {
    const source =
      'module;\nimport { gear } from "./a.pathogen";\nimport * as kit from "./b.pathogen";\nexport const size = 2;';
    expect(parse(source).body.map((s) => s.type)).toEqual([
      'ModuleHeader',
      'ImportDeclaration',
      'ImportDeclaration',
      'LetDeclaration',
    ]);
    // With no project folder, the import itself is the error, not its place.
    expect(() => compile(source)).toThrow(`Line 2, col 1: ${NO_PROJECT('./a.pathogen')}`);
  });

  it.each([
    ['a second module; line', 'module;\nmodule;', 2, 1],
    ['module; after a statement', 'const a = 1;\nmodule;', 2, 1],
    ['module; after an import', 'import { a } from "./a.pathogen";\nmodule;', 2, 1],
    ['module; again after the imports', 'module;\nimport { a } from "./a.pathogen";\nmodule;', 3, 1],
    ['module; after @font', '@font "Inter";\nmodule;', 2, 1],
    // `module;` used to be a bare expression statement naming a variable; it is now always the header.
    ['a bare module; naming a variable', 'let module = 1;\nmodule;', 2, 1],
  ])('%s is an error at that line', (_label, source, line, column) => {
    expect(() => parse(source)).toThrow(`Parse error at line ${line}, column ${column}: ${MODULE_FIRST}`);
    expect(rangesOf(source)).toEqual([`${line}:${column}-${line}:${column + 'module;'.length} ${MODULE_FIRST}`]);
  });

  it.each([
    ['inside a fn', 'fn f() {\n  module;\n}'],
    ['inside an if', 'if (true) {\n  module;\n}'],
    ['inside a path block', 'let shape = @{\n  module;\n};'],
  ])('module; %s is an error at its line, from the AST builder', (_label, source) => {
    expect(() => parse(source)).toThrow(`Parse error at line 2, column 3: ${MODULE_FIRST}`);
    expect(diagnosticsOf(source)).toEqual([`2:3 ${MODULE_FIRST}`]);
  });
});

describe("a module can't draw at its top level: the statements the parser can see", () => {
  // Calls that draw (`gear(…);`) are an expression to the parser; the evaluator stops those.
  it.each([
    ['a path command', 'module;\nM 0 0', '2:1-2:2', MODULE_DRAWS],
    ['a layer definition', "module;\ndefine PathLayer('ink') #{ stroke: red; }", '2:1-2:7', MODULE_DRAWS],
    ['an apply block', "module;\nlayer('ink').apply {\n  M 0 0\n}", '2:1-2:6', MODULE_DRAWS],
    ['an apply block on a name', 'module;\nink.apply {\n  M 0 0\n}', '2:1-2:4', MODULE_DRAWS],
    ['a text line', 'module;\ntext(10, 20)`hi`;', '2:1-2:5', MODULE_DRAWS],
    ['define ViewBox', 'module;\ndefine ViewBox(0, 0, 10, 10);', '2:1-2:7', MODULE_VIEWBOX],
  ])('%s is an error underlined on its first word', (_label, source, span, message) => {
    expect(() => parse(source)).toThrow(`Parse error at line 2, column 1: ${message}`);
    expect(() => compile(source)).toThrow(`Parse error at line 2, column 1: ${message}`);
    expect(rangesOf(source)).toEqual([`${span} ${message}`]);
  });

  it('a run of path commands is one drawing, underlined once at its first letter', () => {
    // Each command letter is its own top-level statement in the tree.
    expect(rangesOf('module;\nM 0 0 L 10 10 L 20 0 Z')).toEqual([`2:1-2:2 ${MODULE_DRAWS}`]);
    expect(rangesOf('module;\nM 0 0;\nL 4 4;')).toEqual([`2:1-2:2 ${MODULE_DRAWS}`]);
    // Another statement between them starts a new run.
    expect(rangesOf('module;\nM 0 0 L 10 10\nconst a = 1;\nM 5 5 h 3')).toEqual([
      `2:1-2:2 ${MODULE_DRAWS}`,
      `4:1-4:2 ${MODULE_DRAWS}`,
    ]);
  });

  it('the same statements in a file without the header are fine', () => {
    expect(() =>
      parse("M 0 0\ndefine PathLayer('ink') #{ stroke: red; }\ndefine ViewBox(0, 0, 10, 10);"),
    ).not.toThrow();
  });

  it('what a module may have at its top level raises no module rule', () => {
    const source = [
      '// a library',
      'module;',
      'import { gear } from "./gears.pathogen";',
      '@font "Inter";',
      'const style = #{ stroke: red; };',
      'const tooth = @{ m 0 0 l 4 0 l 0 4 z };',
      'const label = &{ text(0, 0)`hi` };',
      'let count = 2;',
      'enum Size { Small, Large }',
      'fn helper(x) { return x * 2; }',
      'export const width = helper(count);',
      'export fn draw(at) {',
      '  M at.x at.y',
      '  tooth.draw();',
      '}',
      'export enum Teeth { Few = 8 }',
      'log(width);',
      'assert(width == 4, "width");',
    ].join('\n');
    expect(() => parse(source)).not.toThrow();
    // Without the import (the playground has no project folder), the editor finds nothing at all.
    const noImport = source.replace('import { gear } from "./gears.pathogen";\n', '');
    expect(diagnosticsOf(noImport)).toEqual([]);
  });
});

describe('`module` stays an ordinary name', () => {
  it('as a variable, a key, a member, a parameter and a path argument', () => {
    const result = compile(
      'let module = 3;\nlet kit = { module: 4 };\nfn twice(module) { return module * 2; }\nlog(module);\nlog(kit.module);\nlog(twice(5));\nM 0 0\nL module kit.module',
    );
    expect(result.logs.map((l) => l.parts.map((p) => p.value).join(' '))).toEqual(['3', '4', '10']);
    expect(result.layers[0].data).toBe('M 0 0 L 3 4');
  });

  it('a value named module with members, and assignment to it', () => {
    const result = compile('let module = { x: 5 };\nlog(module.x);\nmodule = { x: 6 };\nlog(module.x);');
    expect(result.logs.map((l) => l.parts.map((p) => p.value).join(' '))).toEqual(['5', '6']);
  });

  // `module ;` ending a path command could have been read as a header; the path argument wins.
  it.each([
    ['M 0 0 L 1 module;', 'M 0 0 L 1 1'],
    ['M 0 0 L module module;', 'M 0 0 L 1 1'],
    ['M module 0;', 'M 1 0'],
  ])('`%s` keeps module as the last path argument', (path, data) => {
    expect(compile(`let module = 1;\n${path}`).layers[0].data).toBe(data);
  });

  it('a bare `module;` statement is the header now, an error anywhere but first (it used to read a variable and do nothing)', () => {
    expect(() => parse('let module = 1;\nfn f() { module; }')).toThrow(
      "Parse error at line 2, column 10: module; must be the file's first statement. Only comments may come before it.",
    );
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
    // A program can't export and a module can't draw, so the tree is read with
    // the naming rules off: the path command ends before `export`.
    const body = parse('M 0 0 L 10 10\nexport const r = 5;\nL r 0', { namingChecks: false }).body;
    expect(body.map((s) => s.type)).toEqual(['PathCommand', 'PathCommand', 'LetDeclaration', 'PathCommand']);
    expect(body[2]).toMatchObject({ name: 'r', exported: true, exportLoc: { line: 2, column: 1 } });
    // With the rules on, the error is the export's own, on line 2: nothing swallowed it.
    expect(() => parse('M 0 0 L 10 10\nexport const r = 5;\nL r 0')).toThrow(
      `Parse error at line 2, column 1: ${EXPORT_NEEDS_MODULE}`,
    );
  });
});

describe('the formatter', () => {
  it('prints the header, imports and the export prefix, and is stable', () => {
    const source =
      'module ;\nimport {gear,Teeth as Kind} from \'./parts/gears.pathogen\';\nimport * as  gears from "./x.pathogen";\nimport {} from "./y.pathogen";\nexport   const a=1;\nexport fn f(x){\nreturn x;\n}\nexport enum E { A }\n';
    const expected =
      'module;\nimport { gear, Teeth as Kind } from "./parts/gears.pathogen";\nimport * as gears from "./x.pathogen";\nimport {} from "./y.pathogen";\nexport const a = 1;\nexport fn f(x) {\n  return x;\n}\nexport enum E {\n  A,\n}\n';
    expect(formatted(source)).toBe(expected);
    expect(formatted(expected)).toBe(expected);
  });

  it('keeps a header after comments and a blank line exactly (a missing case would delete it)', () => {
    const source = '// gears\nmodule;\n\nexport const a = 1;\n';
    expect(formatted(source)).toBe(source);
  });

  it('keeps an exported declaration verbatim, export included, when a comment forces it', () => {
    // The comment in the parameter list has no AST node, so the statement is
    // printed as written. Its tree node starts at `export`, not at `fn`.
    const source = 'module;\nlet  x=1;\nexport fn f(a, // first\n  b) {\n  return a;\n}\n';
    expect(formatted(source)).toBe('module;\nlet x = 1;\nexport fn f(a, // first\n  b) {\n  return a;\n}\n');
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
    const exportDoc = new StringTextDocument('module;\nexport const a = 1;');
    expect(getHoverInfo(exportDoc, { line: 1, character: 2 })?.contents).toMatch(/^\*\*export\*\* — /);
  });

  it('hover explains the module; header', () => {
    const doc = new StringTextDocument('// a library\nmodule;\nexport const a = 1;');
    expect(getHoverInfo(doc, { line: 1, character: 2 })?.contents).toMatch(/^\*\*module;\*\* — /);
  });

  it('a variable named `from` hovers as a variable, not as a keyword', () => {
    const doc = new StringTextDocument('let from = 3;\nlog(from);');
    expect(getHoverInfo(doc, { line: 1, character: 5 })?.contents).toContain('**from** — *variable');
  });

  it('a variable named `module` hovers as a variable, not as the header', () => {
    const doc = new StringTextDocument('let module = 3;\nlog(module);');
    expect(getHoverInfo(doc, { line: 1, character: 5 })?.contents).toContain('**module** — *variable');
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
    expect(() =>
      parse('import { circle } from "./a.pathogen";\nlet a = 1;\nimport { b } from "./b.pathogen";'),
    ).toThrow('Parse error at line 1, column 10: Cannot use circle as a name');
  });

  it('redeclaring with an exported const lands on its `const` keyword, as for a plain const (not on `export`)', () => {
    expect(() => parse('module;\nconst a = 1;\nexport const a = 2;')).toThrow('Parse error at line 3, column 8:');
  });

  it('a misplaced header before a drawing statement: the header, written first, is reported', () => {
    expect(() => parse('const a = 1;\nmodule;\nM 0 0')).toThrow(`Parse error at line 2, column 1: ${MODULE_FIRST}`);
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
    expect(formatted('let a=1;\nimport {b} from "./b.pathogen";')).toBe(
      'let a = 1;\nimport { b } from "./b.pathogen";',
    );
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

describe('an import path is the raw text between its quotes', () => {
  it('no escapes are processed, so a Windows-style path reaches the path rules as typed', () => {
    // The file text is ".\reports\new.pathogen": `\r` and `\n` stay a backslash and a letter.
    const decl = parse('import { a } from ".\\reports\\new.pathogen";').body[0] as ImportDeclaration;
    expect(decl.source).toBe('.\\reports\\new.pathogen');
  });

  it.each([
    // a plain path is printed in double quotes, whatever it was written with
    ["import { a } from './plain.pathogen';", 'import { a } from "./plain.pathogen";'],
    // one holding a quote or a backslash keeps the token as written
    ["import { a } from './a\"b.pathogen';", "import { a } from './a\"b.pathogen';"],
    ['import { a } from ".\\\\b.pathogen";', 'import { a } from ".\\\\b.pathogen";'],
  ])('the formatter keeps %s', (source, expected) => {
    expect(formatted(source)).toBe(expected);
    const before = (parse(source).body[0] as ImportDeclaration).source;
    const after = (parse(expected).body[0] as ImportDeclaration).source;
    expect(after).toBe(before);
  });
});
