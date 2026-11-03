/**
 * Phase 0a step 5: a program can't declare a built-in name
 * (project-docs/modules/06-phase-0a-plan.md §Step 5; docs/syntax.md "Built-in
 * names"). Every declaration form is covered; the error is reported before
 * the program runs, at the name. The editors underline every offender and
 * offer a quick fix that renames it everywhere it's used.
 */
import { describe, expect, it } from 'vitest';

import { compile, parse } from '../src';
import { BUILTIN_NAMES, builtinNameError, suggestName } from '../src/builtin-names';
import { evaluate } from '../src/evaluator';
import { BUILTIN_ENUMS } from '../src/evaluator/builtin-enums';
import { EVALUATOR_CONSTRUCTORS, STATEMENT_BUILTINS } from '../src/evaluator/constructor-registry';
import { getCodeActions } from '../src/language-services/code-actions';
import { getDiagnostics } from '../src/language-services/diagnostics';
import { StringTextDocument } from '../src/language-services/document';
import { getHoverInfo } from '../src/language-services/hover';
import { getDefinition } from '../src/language-services/navigation';
import { getRenameEdits, prepareRename } from '../src/language-services/rename';
import { analyzeScopes } from '../src/language-services/scope-analysis';
import { getDocumentSymbols } from '../src/language-services/symbols';
import { contextAwareFunctions, stdlib } from '../src/stdlib';

import type { TextEdit } from '../src/language-services/code-actions';

// The documented messages, word for word (docs/syntax.md "Built-in names").
const PLAIN = (name: string, what: string) => `Cannot use ${name} as a name — it is ${what}. Use another name`;
const SHORTHAND = (name: string, what: string, suggestion: string) =>
  `Cannot use ${name} as a name — it is ${what}. Take the property under another name: { ${name}: ${suggestion} }`;
const FN = 'a built-in function';

/** `Parse error at line L, column C: message` for the nth occurrence of `name` in `source`. */
function errorAt(source: string, name: string, message: string, nth = 0): string {
  let offset = -1;
  for (let i = 0; i <= nth; i++) offset = source.indexOf(name, offset + 1);
  const lines = source.slice(0, offset).split('\n');
  return `Parse error at line ${lines.length}, column ${lines[lines.length - 1].length + 1}: ${message}`;
}

function logs(source: string): string[] {
  return compile(source)
    .logs.filter((entry) => entry.severity !== 'warn')
    .map((entry) => entry.parts.map((p) => String(p.value)).join(' '));
}

function applyEdits(source: string, edits: TextEdit[]): string {
  const doc = new StringTextDocument(source);
  const sorted = [...edits].sort((a, b) => doc.offsetAt(b.range.start) - doc.offsetAt(a.range.start));
  let out = source;
  for (const e of sorted) {
    out = out.slice(0, doc.offsetAt(e.range.start)) + e.newText + out.slice(doc.offsetAt(e.range.end));
  }
  return out;
}

describe('the docs examples (docs/syntax.md "Built-in names")', () => {
  it('declaring a stdlib function name is an error at the name', () => {
    const source = 'let line = @{ h 100 };';
    expect(() => compile(source)).toThrow(errorAt(source, 'line', PLAIN('line', FN)));
  });

  it('another name works', () => {
    expect(logs('let edge = @{ h 100 };\nlog(edge.length);')).toEqual(['100']);
  });

  it('names are case-sensitive', () => {
    expect(logs('let point = Point(20, 20);\nlog(point.x);')).toEqual(['20']);
  });

  it('shorthand destructuring names the fix', () => {
    const source = 'let range = { min: 2, max: 8 };\nlet { min, max } = range;';
    expect(() => compile(source)).toThrow(errorAt(source, 'min', SHORTHAND('min', FN, 'minValue'), 1));
  });

  it('taking the property under another name works', () => {
    expect(logs('let range = { min: 2, max: 8 };\nlet { min: low, max: high } = range;\nlog(low, high);')).toEqual([
      '2 8',
    ]);
  });

  it('the inline examples in docs/objects.md and the hueShift sentence compile', () => {
    expect(logs('let { deg: degrees, rad: radians, turns } = 90deg;\nlog(degrees, turns);')).toEqual(['90 0.25']);
    expect(() => compile('let quarter = 0.5pi;\nlet c = Color("#ff0000").hueShift(quarter);')).not.toThrow();
  });
});

describe('every declaration form', () => {
  const cases: [string, string, string][] = [
    ['let', 'let line = 1;', 'line'],
    ['const', 'const min = 1;', 'min'],
    ['fn name', 'fn hash01(i) { return i; }', 'hash01'],
    ['fn parameter', 'fn scale(line) { return line; }', 'line'],
    ['lambda parameter', 'let double = {|arc| return arc * 2; };', 'arc'],
    ['block parameter', 'let xs = [1, 2].map {|round| round * 2};', 'round'],
    ['for loop variable', 'for (sign in 0..<3) { M 0 0 }', 'sign'],
    ['for-each variable', 'for (arc in [1, 2]) { log(arc); }', 'arc'],
    ['for-each index variable', 'for ([x, round] in [5, 6]) { log(x); }', 'round'],
    ['array destructuring', 'let [min, b] = [1, 2];', 'min'],
    ['array rest', 'let [a, ...line] = [1, 2];', 'line'],
    ['object destructuring alias', 'let { x: max } = { x: 1 };', 'max'],
    ['object rest', 'let { a, ...rect } = { a: 1, b: 2 };', 'rect'],
    ['case array binding', 'switch ([1, 2]) { case [line, b] { log(b); } }', 'line'],
    ['case object alias', 'switch ({ x: 1 }) { case { x: arc } { log(1); } }', 'arc'],
    ['switch-expression binding', 'let v = switch ([1]) { case [heading] { 1 } default { 0 } };', 'heading'],
    ['a fn that is never called', 'fn unused() {\n  let tan = 1;\n  return tan;\n}', 'tan'],
  ];
  for (const [form, source, name] of cases) {
    it(form, () => {
      expect(() => compile(source)).toThrow(errorAt(source, name, PLAIN(name, FN)));
    });
  }

  it('enum name', () => {
    const source = 'enum Marker { Dot, Ring }';
    expect(() => compile(source)).toThrow(errorAt(source, 'Marker', PLAIN('Marker', 'a built-in constructor')));
  });

  it('case object shorthand gets the property form', () => {
    const source = 'switch ({ min: 1 }) { case { min } { log(1); } }';
    expect(() => compile(source)).toThrow(errorAt(source, 'min', SHORTHAND('min', FN, 'minValue'), 1));
  });

  it('the first offender in the source is reported', () => {
    const source = 'let edge = 1;\nlet arc = 2;\nlet line = 3;';
    expect(() => compile(source)).toThrow(errorAt(source, 'arc', PLAIN('arc', FN)));
  });

  it('a const mistake written earlier is reported first', () => {
    const source = 'const a = 1;\na = 2;\nlet line = 3;';
    expect(() => compile(source)).toThrow('Parse error at line 2, column 1: Cannot assign to a');
  });
});

describe('each kind of built-in name', () => {
  const kinds: [string, string][] = [
    ['min', FN],
    ['polarLine', FN],
    ['log', FN],
    ['assert', FN],
    ['PI', FN],
    ['Point', 'a built-in constructor'],
    ['Grid', 'a built-in constructor'],
    ['Color', 'a built-in constructor'],
    ['Marker', 'a built-in constructor'],
    ['Cycler', 'a built-in constructor'],
    ['LinearGradient', 'a built-in constructor'],
    ['Direction', 'a built-in enum'],
    ['Easing', 'a built-in enum'],
    ['Font', 'a built-in namespace'],
    ['Object', 'a built-in namespace'],
    ['PathBlock', 'a built-in namespace'],
    ['Cap', 'a built-in namespace'],
  ];
  for (const [name, what] of kinds) {
    it(`${name}: ${what}`, () => {
      const source = `let ${name} = 1;`;
      expect(() => compile(source)).toThrow(errorAt(source, name, PLAIN(name, what)));
    });
  }

  it('ctx: the drawing context', () => {
    expect(() => compile('let ctx = 1;')).toThrow(
      'Parse error at line 1, column 5: Cannot use ctx as a name — it is the drawing context. Use another name',
    );
  });

  it("viewbox: the program's viewBox", () => {
    expect(() => compile('let viewbox = 5;')).toThrow(
      "Parse error at line 1, column 5: Cannot use viewbox as a name — it is the program's viewBox. Use another name",
    );
  });

  it('pi, deg and rad keep the unit-suffix message', () => {
    expect(() => compile('let deg = 1;')).toThrow(
      "Parse error at line 1, column 5: 'deg' is reserved — it is a unit suffix (0.5pi, 90deg, 1.5rad); it cannot be used as a variable name",
    );
  });
});

describe('names that are not declarations stay free', () => {
  it('object keys, properties, strings', () => {
    expect(logs("let range = { min: 2, max: 8, line: 'line' };\nlog(range.min, range['max'], range.line);")).toEqual([
      '2 8 line',
    ]);
  });

  it('enum members', () => {
    expect(logs('enum Edge { line, arc }\nlog(Edge.line == Edge.line, Edge.arc == Edge.line);')).toEqual([
      'true false',
    ]);
  });

  it('style property values (CSS keywords)', () => {
    const result = compile(
      "define PathLayer('a') #{ stroke-linecap: round; stroke-linejoin: round; }\nlayer('a').apply { M 0 0 L 10 0 }",
    );
    expect(result.layers[0].styles?.['stroke-linecap']).toBe('round');
  });

  it('calling the built-ins', () => {
    expect(logs('log(min(1, 2), max(1, 2), round(2.6));')).toEqual(['1 2 3']);
  });

  it('a capitalised user name that only differs in case', () => {
    expect(logs('let grid = Grid(4, 5);\nlog(grid.rows);')).toEqual(['4']);
  });
});

describe('the run-time backstop (ASTs that skipped the static check)', () => {
  it('a let', () => {
    expect(() => evaluate(parse('let line = 1;', { namingChecks: false }))).toThrow(PLAIN('line', FN));
  });

  it('a fn parameter, when the fn is called', () => {
    expect(() => evaluate(parse('fn f(arc) { return arc; }\nlog(f(1));', { namingChecks: false }))).toThrow(
      PLAIN('arc', FN),
    );
  });

  it('shorthand destructuring', () => {
    expect(() => evaluate(parse('let { min } = { min: 1 };', { namingChecks: false }))).toThrow(
      SHORTHAND('min', FN, 'minValue'),
    );
  });

  it('parse() with namingChecks: false still builds the tree (outline, inlay hints, formatter)', () => {
    expect(() => parse('let line = 1;', { namingChecks: false })).not.toThrow();
    const symbols = getDocumentSymbols(new StringTextDocument('let line = 1;\nlet edge = 2;'));
    expect(symbols.map((s) => s.name)).toEqual(['line', 'edge']);
  });
});

describe('the name table', () => {
  it('derives from the registries', () => {
    for (const name of Object.keys(stdlib)) expect(BUILTIN_NAMES.has(name), name).toBe(true);
    for (const name of contextAwareFunctions) expect(BUILTIN_NAMES.get(name)).toBe('function');
    for (const name of STATEMENT_BUILTINS) expect(BUILTIN_NAMES.get(name)).toBe('function');
    for (const name of EVALUATOR_CONSTRUCTORS) expect(BUILTIN_NAMES.get(name)).toBe('constructor');
    for (const name of Object.keys(BUILTIN_ENUMS)) expect(BUILTIN_NAMES.get(name)).toBe('enum');
    expect(BUILTIN_NAMES.has('Infinity')).toBe(false);
    expect(BUILTIN_NAMES.has('NaN')).toBe(false);
  });

  it('every namespace in the table resolves at run time', () => {
    const namespaces = [...BUILTIN_NAMES].filter(([, kind]) => kind === 'namespace').map(([name]) => name);
    expect(namespaces.length).toBeGreaterThan(0);
    for (const name of namespaces) expect(() => compile(`let ns = ${name};`), name).not.toThrow();
  });

  it('suggestName avoids taken names and other built-ins', () => {
    expect(suggestName('min')).toBe('minValue');
    expect(suggestName('Marker')).toBe('MyMarker');
    expect(suggestName('min', (n) => n === 'minValue')).toBe('minValue2');
  });

  it('builtinNameError matches the documented text', () => {
    expect(builtinNameError('line')).toBe(PLAIN('line', FN));
    expect(builtinNameError('min', true)).toBe(SHORTHAND('min', FN, 'minValue'));
  });
});

describe('editors', () => {
  it('every offender is a diagnostic at its name', () => {
    const doc = new StringTextDocument('let line = 1;\nlet arc = 2;\nlog(line, arc);');
    const diags = getDiagnostics(doc).map((d) => ({ message: d.message, range: d.range }));
    expect(diags).toEqual([
      { message: PLAIN('line', FN), range: { start: { line: 0, character: 4 }, end: { line: 0, character: 8 } } },
      { message: PLAIN('arc', FN), range: { start: { line: 1, character: 4 }, end: { line: 1, character: 7 } } },
    ]);
  });

  it('the quick fix renames the declaration and every reference, and the output is unchanged', () => {
    const source = [
      'fn twice() { return line * 2; }',
      'let line = 3;',
      "define PathLayer('a') #{ stroke-width: line; }",
      "layer('a').apply {",
      '  M calc(line) 0 L calc(line * 2) 0',
      '}',
      'log(`len ${line}`, twice());',
      'let box = { line };',
      'log(box.line);',
      'fn other(a) { let line2 = a; return min(line2, 1); }',
      'log(other(4));',
    ].join('\n');
    const doc = new StringTextDocument(source);
    const diag = getDiagnostics(doc).find((d) => d.message === PLAIN('line', FN))!;
    expect(diag).toBeDefined();
    const action = getCodeActions(doc, diag.range, [diag]).find((a) => a.title === 'Rename line to lineValue')!;
    expect(action).toBeDefined();
    const fixed = applyEdits(source, action.edit.changes);
    expect(fixed).toBe(
      [
        'fn twice() { return lineValue * 2; }',
        'let lineValue = 3;',
        "define PathLayer('a') #{ stroke-width: lineValue; }",
        "layer('a').apply {",
        '  M calc(lineValue) 0 L calc(lineValue * 2) 0',
        '}',
        'log(`len ${lineValue}`, twice());',
        'let box = { line: lineValue };',
        'log(box.line);',
        'fn other(a) { let line2 = a; return min(line2, 1); }',
        'log(other(4));',
      ].join('\n'),
    );
    // The renamed program draws and logs what the original meant.
    const result = compile(fixed);
    expect(result.layers.find((l) => l.name === 'a')?.data.trim()).toBe('M 3 0 L 6 0');
    expect(result.layers.find((l) => l.name === 'a')?.styles?.['stroke-width']).toBe('3');
    expect(logs(fixed)).toEqual(['len 3 6', '3', '1']);
  });

  it('the quick fix picks a name the program does not use', () => {
    const source = 'let minValue = 1;\nlet min = 2;\nlog(min, minValue);';
    const doc = new StringTextDocument(source);
    const diag = getDiagnostics(doc).find((d) => d.message === PLAIN('min', FN))!;
    const action = getCodeActions(doc, diag.range, [diag]).find((a) => a.title.startsWith('Rename min'))!;
    expect(action.title).toBe('Rename min to minValue2');
    expect(applyEdits(source, action.edit.changes)).toBe(
      'let minValue = 1;\nlet minValue2 = 2;\nlog(minValue2, minValue);',
    );
  });

  it('rename works on a declaration that has a built-in name', () => {
    const source = 'let heading = 135deg;\nlog(heading);';
    const doc = new StringTextDocument(source);
    expect(prepareRename(doc, { line: 0, character: 6 })).toEqual({
      range: { start: { line: 0, character: 4 }, end: { line: 0, character: 11 } },
      placeholder: 'heading',
    });
    expect(applyEdits(source, getRenameEdits(doc, { line: 0, character: 6 }, 'bearing'))).toBe(
      'let bearing = 135deg;\nlog(bearing);',
    );
  });

  it('rename edits the reference it is asked about, not the first word on the line', () => {
    const source = "let size = 3;\nlog('size', size);";
    const doc = new StringTextDocument(source);
    expect(applyEdits(source, getRenameEdits(doc, { line: 0, character: 5 }, 'width'))).toBe(
      "let width = 3;\nlog('size', width);",
    );
  });

  it("a trailing block's parameters aren't confused with a same-named lambda in the call's arguments", () => {
    // Both bind acc and v; renaming the block's acc must not touch the lambda's.
    const source = 'let r = [3, 4].reduce({|acc, v| acc + v}) {|acc, v| acc + v};';
    const doc = new StringTextDocument(source);
    const blockAcc = source.lastIndexOf('{|acc') + 2;
    expect(applyEdits(source, getRenameEdits(doc, { line: 0, character: blockAcc + 1 }, 'total'))).toBe(
      'let r = [3, 4].reduce({|acc, v| acc + v}) {|total, v| total + v};',
    );
    const lambdaAcc = source.indexOf('{|acc') + 2;
    expect(applyEdits(source, getRenameEdits(doc, { line: 0, character: lambdaAcc + 1 }, 'sum'))).toBe(
      'let r = [3, 4].reduce({|sum, v| sum + v}) {|acc, v| acc + v};',
    );
  });

  it('a fn body sees names declared later in its scope (scope analysis and go-to-definition)', () => {
    const source = 'fn twice() { return size * 2; }\nlet size = 3;\nlog(twice());';
    const doc = new StringTextDocument(source);
    const ref = analyzeScopes(doc).references.find((r) => r.name === 'size');
    expect(ref?.declaration?.name).toBe('size');
    expect(getDefinition(doc, { line: 0, character: 21 })?.range.start.line).toBe(1);
    expect(getHoverInfo(doc, { line: 0, character: 21 })?.contents).toContain('size');
  });
});
