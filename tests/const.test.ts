/**
 * Phase 0a step 4: `const` (project-docs/modules/06-phase-0a-plan.md §Step 4;
 * docs/syntax.md "Variables" → "const"). JavaScript semantics (decision 7):
 * the binding is fixed, the contents are not. Reassigning or redeclaring a
 * const is an error — statically, at the assignment, when the source decides
 * it (src/parser/const-check.ts), otherwise when the code runs.
 */
import { describe, expect, it } from 'vitest';

import { extractTopLevelStringLets } from '../playground/services/font-loader';
import { readFileSync } from 'node:fs';

import { compile, parse } from '../src';
import { evaluate } from '../src/evaluator';
import { getCompletions } from '../src/language-services/completion';
import { getDiagnostics } from '../src/language-services/diagnostics';
import { StringTextDocument } from '../src/language-services/document';
import { formatDocument } from '../src/language-services/formatter';
import { getHoverInfo } from '../src/language-services/hover';
import { TOKEN_MODIFIERS, getSemanticTokens } from '../src/language-services/semantic-tokens';
import { SymbolKind, getDocumentSymbols } from '../src/language-services/symbols';
import { resolveFontDirectives } from '../src/parser/font-directives';

function logs(source: string): string[] {
  return compile(source)
    .logs.filter((entry) => entry.severity !== 'warn')
    .map((entry) => entry.parts.map((p) => String(p.value)).join(' '));
}

function path(source: string): string {
  return compile(source)
    .layers.map((l) => l.data)
    .join(' ')
    .trim();
}

const REASSIGN = (name: string) =>
  `Cannot assign to ${name} — it is a const. Declare it with let if it needs to change`;
const REDECLARE_CONST = (name: string) =>
  `Cannot declare ${name} again in this scope — it is a const. Use another name`;
const CONST_OVER = (name: string) =>
  `Cannot declare ${name} as a const — it is already declared in this scope. Use another name`;

describe('the docs examples (docs/syntax.md "Variables")', () => {
  it('let and const side by side', () => {
    expect(logs('let width = 200;\nlet height = 100;\nconst margin = 10;\nlog(width, height, margin);')).toEqual([
      '200 100 10',
    ]);
  });

  it('assigning to a const is an error at the assignment', () => {
    expect(() => compile('const margin = 10;\nmargin = 12;')).toThrow(
      `Parse error at line 2, column 1: ${REASSIGN('margin')}`,
    );
  });

  it('a const array can still be changed', () => {
    expect(logs('const steps = [];\nsteps.push(10);\nsteps[0] = 20;   // steps is [20]\nlog(steps);')).toEqual([
      '[20]',
    ]);
  });

  it('a const object can still be changed (objects change by index, docs/objects.md)', () => {
    expect(logs("const box = { w: 1 };\nbox['w'] = 5;\nlog(box.w);")).toEqual(['5']);
  });

  it('a const in a loop body is new on each pass', () => {
    const source = 'for (i in 0..<3) {\n  const rowY = i * 20;\n  M 0 rowY h 40\n}';
    expect(path(source)).toBe('M 0 0 h 40 M 0 20 h 40 M 0 40 h 40');
  });

  it("a function's own variable with a const's name", () => {
    const source = `const size = 10;
fn ownSize() {
  let size = 20;   // this function's own size
  return size;
}
let both = [size, ownSize()];   // [10, 20]
log(both);`;
    expect(logs(source)).toEqual(['[10, 20]']);
  });

  it('the two redeclaration examples and their messages', () => {
    expect(() => compile('const margin = 10;\nlet margin = 12;')).toThrow(
      `Parse error at line 2, column 1: ${REDECLARE_CONST('margin')}`,
    );
    expect(() => compile('let margin = 10;\nconst margin = 12;')).toThrow(
      `Parse error at line 2, column 1: ${CONST_OVER('margin')}`,
    );
  });

  it('the run-time-only cases the docs name', () => {
    // a function written above the const that assigns to it
    expect(() => compile('fn reset() { LIMIT = 0; }\nconst LIMIT = 5;\nreset();')).toThrow(
      `Line 1: ${REASSIGN('LIMIT')}`,
    );
    expect(() => compile('fn reset() { LIMIT = 0; }\nconst LIMIT = 5;')).not.toThrow();
    // a const that shares its name with a parameter
    expect(() => compile('const k = 1;\nfn f(k) { return k; }\nk = 2;')).toThrow(`Line 3: ${REASSIGN('k')}`);
    expect(() => compile('fn f(k) { const k = 1; return k; }\nlet r = f(2);')).toThrow(`Line 1: ${CONST_OVER('k')}`);
  });

  it('keywords are not bare object keys or properties; quoted keys work', () => {
    expect(() => parse('let o = { text: 1 };')).toThrow();
    expect(() => parse('let o = { const: 1 };')).toThrow();
    expect(logs("let o = { 'text': 1 };\nlog(o['text']);")).toEqual(['1']);
  });

  it('destructuring', () => {
    expect(logs('let pair = [1, 2];\nconst [first, second] = pair;\nlog(first, second);')).toEqual(['1 2']);
    expect(logs('const { x, y } = { x: 3, y: 4 };\nlog(x, y);')).toEqual(['3 4']);
  });
});

describe('reassignment and redeclaration', () => {
  it.each([
    ['let after const', 'const k = 1;\nlet k = 2;', `Parse error at line 2, column 1: ${REDECLARE_CONST('k')}`],
    ['const after const', 'const k = 1;\nconst k = 2;', `Parse error at line 2, column 1: ${REDECLARE_CONST('k')}`],
    [
      'fn after const',
      'const k = 1;\nfn k() { return 1; }',
      `Parse error at line 2, column 1: ${REDECLARE_CONST('k')}`,
    ],
    ['const after let', 'let k = 1;\nconst k = 2;', `Parse error at line 2, column 1: ${CONST_OVER('k')}`],
    ['const after fn', 'fn k() { return 1; }\nconst k = 2;', `Parse error at line 2, column 1: ${CONST_OVER('k')}`],
    [
      'a destructured const, then let',
      'const [a, b] = [1, 2];\nlet b = 3;',
      `Parse error at line 2, column 1: ${REDECLARE_CONST('b')}`,
    ],
  ])('%s', (_, source, message) => {
    expect(() => compile(source)).toThrow(message);
  });

  it('let after let in the same scope still just rebinds (unchanged)', () => {
    expect(logs('let k = 1;\nlet k = 2;\nlog(k);')).toEqual(['2']);
  });

  it('assigning to a destructured const', () => {
    expect(() => compile('const [a, b] = [1, 2];\nb = 3;')).toThrow(
      `Parse error at line 2, column 1: ${REASSIGN('b')}`,
    );
  });

  it('caught before the program runs: in a function that is never called', () => {
    expect(() => compile('const LIMIT = 5;\nfn reset() { LIMIT = 0; }')).toThrow(
      `Parse error at line 2, column 14: ${REASSIGN('LIMIT')}`,
    );
  });

  it('caught before the program runs: in a lambda that is never called', () => {
    expect(() => compile('const LIMIT = 5;\nlet reset = {|| LIMIT = 0; };')).toThrow(
      `Parse error at line 2, column 17: ${REASSIGN('LIMIT')}`,
    );
  });

  it('caught when the code runs: a fn written before the const assigns it', () => {
    expect(() => compile('fn reset() { LIMIT = 0; }\nconst LIMIT = 5;\nreset();')).toThrow(
      `Line 1: ${REASSIGN('LIMIT')}`,
    );
  });

  it('the evaluator enforces the same rules on its own (the static check only moves them earlier)', () => {
    // An AST that skipped parse()'s naming checks: the run-time backstop catches each case.
    const unchecked = (source: string) => () => evaluate(parse(source, { namingChecks: false }));
    expect(unchecked('const margin = 10;\nmargin = 12;')).toThrow(`Line 2: ${REASSIGN('margin')}`);
    expect(unchecked('const margin = 10;\nif (true) { margin = 12; }')).toThrow(`Line 2: ${REASSIGN('margin')}`);
    expect(unchecked('const margin = 10;\nlet margin = 12;')).toThrow(`Line 2: ${REDECLARE_CONST('margin')}`);
    expect(unchecked('let margin = 10;\nconst margin = 12;')).toThrow(`Line 2: ${CONST_OVER('margin')}`);
    expect(unchecked('const margin = 10;\nfn margin() { return 1; }')).toThrow(`Line 2: ${REDECLARE_CONST('margin')}`);
  });

  it("a loop body's const can't take the loop variable's name (the body runs in the loop variable's scope)", () => {
    expect(() => compile('for (i in 0..<2) { const i = 5; }')).toThrow(`Line 1: ${CONST_OVER('i')}`);
  });

  it('with a reserved name and a const mistake, the one written first is reported', () => {
    expect(() => compile('const margin = 1;\nmargin = 2;\nlet rad = 3;')).toThrow(
      `Parse error at line 2, column 1: ${REASSIGN('margin')}`,
    );
    expect(() => compile('let rad = 3;\nconst margin = 1;\nmargin = 2;')).toThrow(
      /^Parse error at line 1, column 5: 'rad' is reserved/,
    );
  });
});

describe('`const` as text is untouched', () => {
  it('in strings, template literals, quoted keys and style values', () => {
    const source =
      "let s = 'const';\nlet t = `const ${s}`;\nlet o = { 'const': 1 };\ndefine TextLayer('label') #{ font-family: const; font-size: 10; };\nlog(s, t, o['const']);";
    expect(logs(source)).toEqual(['const const const 1']);
  });
});

describe('the static check sees every name the program binds', () => {
  // const-check.ts finds shadowing names by walking every string in the AST.
  // A Map or Set field would hide names from it and could make it flag a
  // program that runs; this fails if the AST ever grows one.
  it('the AST of the all-syntax fixture holds no Map or Set', () => {
    const fixture = readFileSync(
      new URL('../packages/vscode-pathogen/test-fixtures/all-syntax.pathogen', import.meta.url),
      'utf-8',
    );
    const hidden: string[] = [];
    const walk = (value: unknown, path: string): void => {
      if (value instanceof Map || value instanceof Set) hidden.push(path);
      else if (Array.isArray(value)) value.forEach((v, i) => walk(v, `${path}[${i}]`));
      else if (typeof value === 'object' && value !== null)
        for (const [k, v] of Object.entries(value)) walk(v, `${path}.${k}`);
    };
    walk(parse(fixture), 'program');
    expect(hidden).toEqual([]);
  });
});

describe('shadowing: an inner scope may declare its own variable with the name', () => {
  it.each([
    ['a fn-local let', 'const k = 1;\nfn f() { let k = 2; k = 3; return k; }\nlog(f(), k);', ['3 1']],
    ['a fn parameter', 'const k = 1;\nfn f(k) { k = 5; return k; }\nlog(f(2), k);', ['5 1']],
    ['a lambda parameter', 'const k = 1;\nlet f = {|k| k = 6; return k; };\nlog(f(2), k);', ['6 1']],
    [
      'a loop variable',
      'const k = 1;\nlet seen = [];\nfor (k in 0..<2) { k = calc(k + 10); seen.push(k); }\nlog(seen, k);',
      ['[10, 11] 1'],
    ],
    ['a for-each variable', 'const k = 1;\nfor (k in [7]) { k = 8; log(k); }\nlog(k);', ['8', '1']],
    ['a callback parameter', 'const k = 1;\nlet r = [1].map {|k| k = 4; return k; };\nlog(r, k);', ['[4] 1']],
    ['a case-pattern binding', 'const k = 1;\nswitch ([2, 3]) { case [k, b] { k = 9; log(k); } }\nlog(k);', ['9', '1']],
    ['a let in an if block', 'const k = 1;\nif (true) { let k = 2; k = 3; log(k); }\nlog(k);', ['3', '1']],
  ])('%s', (_, source, expected) => {
    expect(logs(source)).toEqual(expected);
  });

  it('a const in an inner block does not reach the outer let of the same name', () => {
    expect(logs('let x = 1;\nif (true) { const x = 2; }\nx = 3;\nlog(x);')).toEqual(['3']);
  });

  it('assigning a name that only a const in an inner block had is the plain error', () => {
    expect(() => compile('if (true) { const x = 2; }\nx = 3;')).toThrow(/Cannot assign to undeclared variable: x$/);
  });
});

describe('everywhere a let can be written', () => {
  it('inside a path block', () => {
    expect(path('let b = @{ const step = 5; h step };\nM 0 0\nb.draw();')).toBe('M 0 0 h 5');
  });

  it('inside a text block body', () => {
    const result = compile(
      "define TextLayer('t') #{ font-size: 10; };\nlayer('t').apply {\n  text(0, 10) {\n    const word = 'hi';\n    `${word}`\n  }\n}",
    );
    expect(JSON.stringify(result.layers)).toContain('hi');
  });

  it('a const statement after a path command is not swallowed as path arguments', () => {
    expect(path('M 10 20\nconst X = 5;\nL X 0')).toBe('M 10 20 L 5 0');
  });

  it('const is a keyword: not a variable name', () => {
    expect(() => parse('let const = 1;')).toThrow();
  });
});

describe('@font accepts a top-level const', () => {
  it('resolves the family from a const', () => {
    const { resolved, errors } = resolveFontDirectives(
      parse('const family = "Inter";\n@font family;\n@font family 700;'),
    );
    expect(errors).toEqual([]);
    expect(resolved.map((r) => [r.family, r.weight])).toEqual([
      ['Inter', undefined],
      ['Inter', 700],
    ]);
  });

  it('the error for anything else suggests a const', () => {
    const { errors } = resolveFontDirectives(parse('@font mystery;'));
    expect(errors[0].message).toBe(
      `@font directive references 'mystery', which is not a top-level string variable. Declare it at the top level: const mystery = "Family Name";`,
    );
  });

  it("the playground's pre-parse fallback reads a const too", () => {
    expect([...extractTopLevelStringLets('const family = "Inter";\nlet other = \'Lora\';')]).toEqual([
      ['family', 'Inter'],
      ['other', 'Lora'],
    ]);
  });
});

describe('editor support', () => {
  const doc = (source: string) => new StringTextDocument(source);

  it('the formatter keeps const (it used to print every declaration as let)', () => {
    // (Array literals always print one element per line — the formatter's existing style.)
    const edits = formatDocument(doc('let pair = [1, 2];\nconst   margin=10;\nconst [a,b]=pair;'));
    expect(edits[0].newText).toBe('let pair = [\n  1,\n  2,\n];\nconst margin = 10;\nconst [a, b] = pair;');
  });

  it('the outline lists a const as a Constant', () => {
    const symbols = getDocumentSymbols(doc('const margin = 10;\nlet width = 5;'));
    expect(symbols.map((s) => [s.name, s.kind])).toEqual([
      ['margin', SymbolKind.Constant],
      ['width', SymbolKind.Variable],
    ]);
  });

  it('semantic tokens mark a const readonly, at its declaration and its uses', () => {
    const source = 'const margin = 10;\nlet width = margin;';
    const readonly = 1 << TOKEN_MODIFIERS.indexOf('readonly');
    const at = (line: number, character: number) =>
      getSemanticTokens(doc(source)).find((t) => t.line === line && t.character === character);
    expect(at(0, 6)!.modifiers & readonly).toBe(readonly); // margin, declared
    expect(at(1, 12)!.modifiers & readonly).toBe(readonly); // margin, read
    expect(at(1, 4)!.modifiers & readonly).toBe(0); // width, a let
  });

  it('hover and completion know the keyword', () => {
    expect(getHoverInfo(doc('const margin = 10;'), { line: 0, character: 2 })?.contents).toContain(
      '**const** — Declare a variable that is never assigned again',
    );
    const labels = getCompletions(doc('con'), { line: 0, character: 3 }).map((c) => c.label);
    expect(labels).toContain('const');
  });

  it('a reassigned const is an editor diagnostic at the assignment, even in an uncalled fn', () => {
    const diagnostics = getDiagnostics(doc('const LIMIT = 5;\nfn reset() { LIMIT = 0; }'));
    expect(diagnostics.map((d) => [d.message, d.range.start.line, d.range.start.character])).toEqual([
      ['Cannot assign to LIMIT — it is a const. Declare it with let if it needs to change', 1, 13],
    ]);
  });

  it('a naming mistake mid-edit keeps the outline and formatter (they used to go blank)', () => {
    for (const mistake of ['margin = 12;', 'let rad = 3;']) {
      const source = `const margin = 10;\nlet width = 5;\n${mistake}`;
      expect(getDocumentSymbols(doc(source)).map((s) => s.name)).toContain('width');
      expect(formatDocument(doc(source.replace('let width = 5;', 'let   width=5;')))[0].newText).toContain(
        'let width = 5;',
      );
      expect(getDiagnostics(doc(source))).toHaveLength(1); // still reported
    }
  });
});
