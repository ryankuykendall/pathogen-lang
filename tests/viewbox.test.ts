// Tests for `define ViewBox(originX, originY, width, height);`
// Covers grammar/parsing, evaluator validation, and render precedence.

import { describe, expect, it } from 'vitest';

import { parse, parseLezer } from '../src/parser';
import { compile, generateSvg } from '../src';
import { compilePath } from './helpers';

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
      define default PathLayer('main') #{ stroke: red; };
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
      `define PathLayer('a') #{ stroke: red; };\ndefine PathLayer('b') #{ stroke: blue; }`,
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

describe('viewbox global — reading', () => {
  it('exposes the defined viewbox via dot access', () => {
    const result = compilePath(
      'define ViewBox(0, 0, 880, 280);\nrect(0, 0, viewbox.width, viewbox.height);',
    );
    // rect(x, y, w, h) emits relative: M x y l w 0 l 0 h l -w 0 z
    expect(result).toBe('M 0 0 l 880 0 l 0 280 l -880 0 z');
  });

  it('supports object destructuring', () => {
    const result = compilePath(
      'define ViewBox(0, 0, 880, 280);\nlet {width, height} = viewbox;\nrect(0, 0, width, height);',
    );
    expect(result).toBe('M 0 0 l 880 0 l 0 280 l -880 0 z');
  });

  it('supports rest patterns in destructuring', () => {
    const result = compilePath(
      'define ViewBox(5, 10, 60, 40);\nlet {originX, originY, ...size} = viewbox;\nrect(originX, originY, size.width, size.height);',
    );
    expect(result).toBe('M 5 10 l 60 0 l 0 40 l -60 0 z');
  });

  it('reads all four members with correct values', () => {
    const result = compile(
      'define ViewBox(-50, -25, 200, 100);\nlog(viewbox.originX);\nlog(viewbox.originY);\nlog(viewbox.width);\nlog(viewbox.height);',
    );
    expect(result.logs.map((l) => l.parts[0].value)).toEqual(['-50', '-25', '200', '100']);
  });

  it('rejects unknown properties with the struct type name', () => {
    expect(() => compile('define ViewBox(0, 0, 100, 100);\nlet x = viewbox.nope;')).toThrow(
      /Property 'nope' does not exist on ViewBox/,
    );
  });

  it('errors when read before define ViewBox executes', () => {
    expect(() =>
      compile('let {width} = viewbox;\ndefine ViewBox(0, 0, 200, 200);'),
    ).toThrow(/Line 1.*viewbox is not available until define ViewBox\(\.\.\.\) has run/);
  });

  it('errors when read in a program with no define ViewBox at all', () => {
    expect(() => compile('let w = viewbox.width;')).toThrow(
      /viewbox is not available until define ViewBox\(\.\.\.\) has run/,
    );
  });

  it('is readable inside a function called after define', () => {
    const result = compilePath(
      'define ViewBox(0, 0, 300, 150);\nfn w() { return viewbox.width; }\nrect(0, 0, w(), viewbox.height);',
    );
    expect(result).toBe('M 0 0 l 300 0 l 0 150 l -300 0 z');
  });

  it('is readable inside a layer apply block', () => {
    const result = compile(
      "define ViewBox(0, 0, 100, 50);\ndefine PathLayer('a') #{ stroke: red; };\nlayer('a').apply {\n  rect(0, 0, viewbox.width, viewbox.height);\n}",
    );
    const layerA = result.layers.find((l) => l.name === 'a');
    expect(layerA?.data).toBe('M 0 0 l 100 0 l 0 50 l -100 0 z');
  });

  it('is readable inside a path block', () => {
    const result = compile(
      'define ViewBox(0, 0, 60, 40);\nlet p = @{ let w = viewbox.width; h w };\nlog(p.endPoint);',
    );
    expect(result.logs[0].parts[0].value).toBe('Point(60, 0)');
  });

  it('is shadowed by a user variable named viewbox', () => {
    const result = compilePath('let viewbox = 5;\nM viewbox 0');
    expect(result).toBe('M 5 0');
  });

  it('shadowing is scope-local — global visible again outside the block', () => {
    const result = compile(
      'define ViewBox(0, 0, 100, 50);\nif (true) { let viewbox = 5; log(viewbox); }\nlog(viewbox.width);',
    );
    expect(result.logs.map((l) => l.parts[0].value)).toEqual(['5', '100']);
  });

  it('follows execution order, not source order — fn declared above define reads it when called after', () => {
    const result = compile('fn w() { return viewbox.width; }\ndefine ViewBox(0, 0, 100, 50);\nlog(w());');
    expect(result.logs[0].parts[0].value).toBe('100');
  });

  it('rejects assignment to a viewbox member (read-only struct)', () => {
    expect(() => compile('define ViewBox(0, 0, 100, 50);\nviewbox.width = 5;')).toThrow(
      /Cannot assign to property 'width'/,
    );
  });

  it('returns a fresh copy per read (mutation does not stick)', () => {
    const result = compile(
      'define ViewBox(0, 0, 100, 100);\nlet a = viewbox;\nlog(viewbox.width);',
    );
    expect(result.logs[0].parts[0].value).toBe('100');
    expect(result.viewBox).toEqual({ originX: 0, originY: 0, width: 100, height: 100 });
  });

  it('rejects define ViewBox inside a path block', () => {
    expect(() =>
      compile('let p = @{ define ViewBox(0, 0, 100, 100); h 10 };'),
    ).toThrow(/ViewBox definitions are not allowed inside path blocks/);
  });

  it('rejects define ViewBox nested in control flow inside a path block', () => {
    expect(() =>
      compile('let p = @{ if (1 == 1) { define ViewBox(0, 0, 123, 45); } h 10 };'),
    ).toThrow(/ViewBox definitions are not allowed inside path blocks/);
  });

  it('rejects define ViewBox inside a text block', () => {
    expect(() =>
      compile('let t = &{ define ViewBox(0, 0, 100, 100); text(0, 0)`hi` };'),
    ).toThrow(/ViewBox definitions are not allowed inside text blocks/);
  });

  it('formats in log() as ViewBox(originX, originY, width, height)', () => {
    const result = compile('define ViewBox(0, 0, 880, 280);\nlog(viewbox);');
    expect(result.logs[0].parts[0].value).toBe('ViewBox(0, 0, 880, 280)');
  });

  it('rejects bare viewbox as a style value instead of emitting broken CSS', () => {
    expect(() =>
      compile("define ViewBox(0, 0, 100, 100);\ndefine PathLayer('a') #{ stroke-width: viewbox; };"),
    ).toThrow(/a ViewBox value has no CSS form/);
  });

  it('rejects other struct values (ctx) as style values too', () => {
    expect(() =>
      compile("define PathLayer('a') #{ stroke-width: ctx; };\nM 0 0"),
    ).toThrow(/has no CSS form/);
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
