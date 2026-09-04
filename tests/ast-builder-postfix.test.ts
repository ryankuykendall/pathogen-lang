// Regression tests for AST builders that consume expressions from a
// sequence of CST children. The shared bug: builders that iterated
// children and called `buildExpression` directly stopped at the
// primary node (Identifier, Number, etc.), leaving the postfix chain
// (ArgList, ".", "[") as unconsumed siblings — which then fell through
// `buildExpression`'s case 'ArgList' branch and produced NullLiteral,
// silently replacing the real expression.
//
// Fixed in (commit alongside this test):
//   buildCalcExpression, buildUnaryExpression, buildTernaryExpression,
//   buildTextStatement, buildTspanStatement.

import { describe, expect, it } from 'vitest';

import { compile } from '../src';
import { parse } from '../src/parser';

describe('AST builder — postfix folding inside expression contexts', () => {
  it('calc(foo(x)) preserves the user-function call', () => {
    const ast = parse('let x = calc(foo(5));');
    const v = (ast.body[0] as { value: { type: string; expression: { type: string } } }).value;
    expect(v.type).toBe('CalcExpression');
    expect(v.expression.type).toBe('FunctionCall');
  });

  it('calc(foo(5)) evaluates to the function return value', () => {
    const result = compile(`fn foo(n) { return calc(100 - n); }\nlet x = calc(foo(5)); log(x);`);
    const log = result.logs[0];
    expect(log.parts[0]).toMatchObject({ value: '95' });
  });

  it('calc(stdlib_fn(arg)) evaluates correctly', () => {
    const result = compile(`let y = calc(cos(0)); log(y);`);
    const log = result.logs[0];
    expect(log.parts[0]).toMatchObject({ value: '1' });
  });

  it('UnaryExpression argument can be a function call: -sin(0.5)', () => {
    const result = compile(`let v = calc(-sin(0.5)); log(v);`);
    const log = result.logs[0];
    expect(log.parts[0]).toMatchObject({ value: '-0.479425538604203' });
  });

  it('TernaryExpression branches can be function calls', () => {
    const result = compile(`let v = true ? cos(0.3) : sin(0.7); log(v);`);
    const log = result.logs[0];
    expect(log.parts[0]).toMatchObject({ value: String(Math.cos(0.3)) });
  });

  it('text() args can be function calls (no longer "x must be a number")', () => {
    const result = compile(`
      define ViewBox(0,0,200,200);
      define TextLayer('t') #{ font-size: 12; };
      layer('t').apply {
        text(polarX(100, 0, 50), polarY(100, 0, 50))\`hi\`
      }
    `);
    expect(result.layers).toHaveLength(1);
    const text = result.layers[0].textElements?.[0];
    expect(text).toBeDefined();
    expect(text?.x).toBeCloseTo(150, 5);
    expect(text?.y).toBeCloseTo(100, 5);
  });

  it('tspan() args can be function calls', () => {
    const result = compile(`
      define ViewBox(0,0,200,200);
      define TextLayer('t') #{ font-size: 12; };
      layer('t').apply {
        text(50, 50) {
          tspan(polarX(0, 0, 10), polarY(0, 0, 10))\`x\`
        }
      }
    `);
    expect(result.layers).toHaveLength(1);
    const children = result.layers[0].textElements?.[0]?.children;
    expect(children).toBeDefined();
    const tspan = children?.[0] as { type: string; dx?: number; dy?: number };
    expect(tspan?.type).toBe('tspan');
    expect(tspan?.dx).toBeCloseTo(10, 5);
    expect(tspan?.dy).toBeCloseTo(0, 5);
  });

  it('text() args support nested calc() with function calls', () => {
    // Pattern from website/blog/samples/post16: text(calc(dotX + 8), calc(dotY + 3))
    const result = compile(`
      define ViewBox(0,0,200,200);
      define TextLayer('t') #{ font-size: 12; };
      fn pos() { return 100; }
      layer('t').apply {
        text(calc(pos() + 5), calc(pos() - 5))\`labeled\`
      }
    `);
    const text = result.layers[0].textElements?.[0];
    expect(text?.x).toBe(105);
    expect(text?.y).toBe(95);
  });

  it('member-chain after function call: foo(x).prop still works', () => {
    // Regression guard: text() previously handled .prop chains via custom
    // logic. After the rewrite to buildExpressionWithPostfix, this chain
    // is still folded correctly.
    const result = compile(`
      define ViewBox(0,0,200,200);
      define TextLayer('t') #{ font-size: 12; };
      let pt = Point(50, 75);
      layer('t').apply {
        text(pt.x, pt.y)\`p\`
      }
    `);
    const text = result.layers[0].textElements?.[0];
    expect(text?.x).toBe(50);
    expect(text?.y).toBe(75);
  });
});
