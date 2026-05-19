// Tests for `define ViewBox(originX, originY, width, height);`
// Covers grammar/parsing, evaluator validation, and render precedence.

import { describe, expect, it } from 'vitest';

import { parse, parseLezer } from '../src/parser';
import { compile, generateSvg } from '../src';

describe('define ViewBox — parsing', () => {
  it('parses a basic ViewBox definition', () => {
    const ast = parse('define ViewBox(0, 0, 200, 200);');
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0]).toMatchObject({
      type: 'ViewBoxDefinition',
      originX: { type: 'NumberLiteral', value: 0 },
      originY: { type: 'NumberLiteral', value: 0 },
      width: { type: 'NumberLiteral', value: 200 },
      height: { type: 'NumberLiteral', value: 200 },
    });
  });

  it('accepts expressions in every position', () => {
    const ast = parseLezer('let W = 400; define ViewBox(0, 0, W, calc(W * 0.75));');
    const vb = ast.ast.body.find((s) => s.type === 'ViewBoxDefinition');
    expect(vb).toBeDefined();
    expect((vb as { width: { type: string } }).width.type).toBe('Identifier');
    expect((vb as { height: { type: string } }).height.type).toBe('CalcExpression');
  });

  it('accepts negative origin via unary minus', () => {
    const ast = parse('define ViewBox(-50, -50, 200, 200);');
    expect(ast.body[0]).toMatchObject({
      type: 'ViewBoxDefinition',
      originX: { type: 'UnaryExpression', operator: '-' },
    });
  });

  it('coexists with layer definitions and path commands', () => {
    const ast = parseLezer(`
      define ViewBox(0, 0, 200, 200);
      define default PathLayer('main') \${ stroke: red; };
      M 0 0 L 100 100
    `);
    const types = ast.ast.body.map((s) => s.type);
    expect(types).toEqual(
      expect.arrayContaining(['ViewBoxDefinition', 'LayerDefinition', 'PathCommand']),
    );
  });

  it('reserves `ViewBox` as a keyword (parity with other define-family keywords)', () => {
    // `ViewBox` is specialized at tokenization (same as `let`, `for`, `define`),
    // so it cannot be used as a variable name. This is intentional — it keeps
    // diagnostics focused and matches the rest of the language's keyword model.
    expect(() => parse('let ViewBox = 5;')).toThrow();
  });

  it('accepts adjacent LayerDefinitions with optional trailing `;`', () => {
    // The grammar accepts an optional `;` after `define ... { ... }` so the
    // user-facing boilerplate (which uses `};`) parses, while existing
    // definitions without `;` continue to parse. This test pins both forms.
    const ast = parse(
      `define PathLayer('a') \${ stroke: red; };\ndefine PathLayer('b') \${ stroke: blue; }`,
    );
    expect(ast.body.map((s) => s.type)).toEqual(['LayerDefinition', 'LayerDefinition']);
  });
});

describe('define ViewBox — evaluation', () => {
  it('populates result.viewBox with the four resolved numbers', () => {
    const result = compile('define ViewBox(0, 0, 200, 200);') as ReturnType<typeof compile> & {
      viewBox?: { originX: number; originY: number; width: number; height: number };
    };
    expect(result.viewBox).toEqual({ originX: 0, originY: 0, width: 200, height: 200 });
  });

  it('evaluates expression arguments', () => {
    const result = compile('let W = 100; define ViewBox(0, 0, calc(W * 2), W);') as ReturnType<typeof compile> & {
      viewBox?: { width: number; height: number };
    };
    expect(result.viewBox?.width).toBe(200);
    expect(result.viewBox?.height).toBe(100);
  });

  it('permits negative origin values', () => {
    const result = compile('define ViewBox(-50, -50, 200, 200);') as ReturnType<typeof compile> & {
      viewBox?: { originX: number; originY: number };
    };
    expect(result.viewBox?.originX).toBe(-50);
    expect(result.viewBox?.originY).toBe(-50);
  });

  it('rejects duplicate ViewBox definitions', () => {
    expect(() =>
      compile('define ViewBox(0, 0, 200, 200);\ndefine ViewBox(0, 0, 400, 400);'),
    ).toThrow(/Duplicate ViewBox definition/);
  });

  it('rejects zero width', () => {
    expect(() => compile('define ViewBox(0, 0, 0, 200);')).toThrow(/width must be greater than 0/);
  });

  it('rejects negative width', () => {
    expect(() => compile('define ViewBox(0, 0, -50, 200);')).toThrow(/width must be greater than 0/);
  });

  it('rejects zero height', () => {
    expect(() => compile('define ViewBox(0, 0, 200, 0);')).toThrow(/height must be greater than 0/);
  });

  it('rejects non-numeric arguments with a clear message', () => {
    expect(() => compile('define ViewBox(0, 0, "abc", 200);')).toThrow(
      /must evaluate to a finite number/,
    );
  });

  it('leaves result.viewBox undefined when no define ViewBox is present', () => {
    const result = compile('M 0 0 L 100 100') as ReturnType<typeof compile> & {
      viewBox?: unknown;
    };
    expect(result.viewBox).toBeUndefined();
  });
});

describe('define ViewBox — render precedence', () => {
  function viewBoxOf(svg: string): string {
    const m = svg.match(/<svg[^>]*\bviewBox="([^"]+)"/);
    return m ? m[1] : 'NONE';
  }

  function rootWidthOf(svg: string): string {
    const m = svg.match(/<svg[^>]*\bwidth="([^"]+)"/);
    return m ? m[1] : 'NONE';
  }

  it('source wins over caller options', () => {
    const result = compile('define ViewBox(0, 0, 300, 300); M 0 0');
    const svg = generateSvg(result, { viewBox: '0 0 100 100', width: '100', height: '100' });
    expect(viewBoxOf(svg)).toBe('0 0 300 300');
    expect(rootWidthOf(svg)).toBe('300');
  });

  it('caller options win when source has no define ViewBox', () => {
    const result = compile('M 0 0');
    const svg = generateSvg(result, { viewBox: '0 0 100 100', width: '100', height: '100' });
    expect(viewBoxOf(svg)).toBe('0 0 100 100');
    expect(rootWidthOf(svg)).toBe('100');
  });

  it('falls back to default 0 0 200 200 when nothing is specified', () => {
    const result = compile('M 0 0');
    const svg = generateSvg(result);
    expect(viewBoxOf(svg)).toBe('0 0 200 200');
    expect(rootWidthOf(svg)).toBe('200');
  });

  it('emits negative-origin viewBox correctly', () => {
    const result = compile('define ViewBox(-50, -50, 200, 200); M 0 0');
    const svg = generateSvg(result);
    expect(viewBoxOf(svg)).toBe('-50 -50 200 200');
  });
});
