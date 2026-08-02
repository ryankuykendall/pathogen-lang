import { describe, it, expect } from 'vitest';
import { compile } from '../src/index';
import { compilePath } from './helpers';

// Lambda expressions: builtin interop (lambda-in-place-of-trailing-block) and
// the position coverage matrix. Core call/scoping semantics live in
// evaluator.test.ts ("lambdas" / "scoping" describes).

function logValue(source: string): string {
  const result = compile(source);
  expect(result.logs.length).toBeGreaterThan(0);
  const parts = result.logs[result.logs.length - 1].parts;
  return parts.map((p) => p.value).join('');
}

describe('lambda-as-callback interop with builtins', () => {
  it('array.map(f) produces output identical to the trailing-block form', () => {
    const viaBlock = logValue('let a = [1, 2, 3].map {|v| return calc(v * 2); }; log(`${a}`); M 0 0;');
    const viaLambda = logValue('let f = {|v| return calc(v * 2); }; let a = [1, 2, 3].map(f); log(`${a}`); M 0 0;');
    const inline = logValue('let a = [1, 2, 3].map({|v| return calc(v * 2); }); log(`${a}`); M 0 0;');
    expect(viaLambda).toBe(viaBlock);
    expect(inline).toBe(viaBlock);
    expect(viaLambda).toContain('[2, 4, 6]');
  });

  it('array.map accepts a named fn value too', () => {
    const out = logValue('fn dbl(v) { return calc(v * 2); } let a = [1, 2, 3].map(dbl); log(`${a}`); M 0 0;');
    expect(out).toContain('[2, 4, 6]');
  });

  it('the lambda closure is used inside the builtin iteration', () => {
    const out = logValue(`
      let offset = 10;
      let addOffset = {|v| return calc(v + offset); };
      fn run() {
        let offset = 999;
        return [1, 2].map(addOffset);
      }
      let a = run();
      log(\`\${a}\`);
      M 0 0;
    `);
    expect(out).toContain('[11, 12]');
  });

  it('reduce(init, f) evaluates init BEFORE the callback arg (left-to-right)', () => {
    const result = compile(`
      fn computeInit() { log('init'); return 0; }
      fn makeFn() { log('fn'); return {|acc, v| return calc(acc + v); }; }
      let s = [1, 2, 3].reduce(computeInit(), makeFn());
      log(\`\${s}\`);
      M 0 0;
    `);
    const order = result.logs.map((l) => l.parts.map((p) => p.value).join(''));
    expect(order[0]).toBe('init');
    expect(order[1]).toBe('fn');
    expect(order[2]).toContain('6');
  });

  it('array.reduce(init, f) matches reduce(init) {|...|}', () => {
    const viaBlock = logValue('let s = [1, 2, 3].reduce(0) {|acc, v| return calc(acc + v); }; log(`${s}`); M 0 0;');
    const viaLambda = logValue('let f = {|acc, v| return calc(acc + v); }; let s = [1, 2, 3].reduce(0, f); log(`${s}`); M 0 0;');
    expect(viaLambda).toBe(viaBlock);
    expect(viaLambda).toContain('6');
  });

  it('array.sort(f) matches sort {|a, b|}', () => {
    const viaBlock = logValue('let s = [3, 1, 2].sort {|a, b| return calc(b - a); }; log(`${s}`); M 0 0;');
    const viaLambda = logValue('let cmp = {|a, b| return calc(b - a); }; let s = [3, 1, 2].sort(cmp); log(`${s}`); M 0 0;');
    expect(viaLambda).toBe(viaBlock);
    expect(viaLambda).toContain('[3, 2, 1]');
  });

  it('Grid.fill(f) matches fill {|row, col|}', () => {
    const viaBlock = logValue('let g = Grid(2, 2); g.fill {|r, c| return calc(r * 10 + c); }; log(`${g.cells()}`); M 0 0;');
    const viaLambda = logValue('let f = {|r, c| return calc(r * 10 + c); }; let g = Grid(2, 2); g.fill(f); log(`${g.cells()}`); M 0 0;');
    expect(viaLambda).toBe(viaBlock);
    expect(viaLambda).toContain('[0, 1, 10, 11]');
  });

  it('Grid.map(f) and Grid.forEach(f) accept lambdas', () => {
    const out = logValue(`
      let g = Grid(2, 2);
      g.fill({|r, c| return calc(r + c); });
      let doubled = g.map({|cell| return calc(cell * 2); });
      let total = 0;
      let addUp = {|cell| total = total + cell; };
      doubled.forEach(addUp);
      log(\`\${total}\`);
      M 0 0;
    `);
    expect(out).toContain('8'); // (0+1+1+2)*2
  });

  it('compoundVariableOffset(f) matches the trailing-block form exactly', () => {
    const program = (call: string) => `
      let spine = @{ c 80 -100 160 100 240 0 };
      let rib = spine.compoundVariableOffset${call};
      M rib.anchor.x rib.anchor.y
      rib.draw();
    `;
    const body = `
        vo.startCap(Cap.tapered(2, CurveContinuity.G0));
        vo.stop(0, 2, CurveContinuity.G1, -2, CurveContinuity.G1);
        vo.stop(1, 4, CurveContinuity.G1, -4, CurveContinuity.G1);
        vo.endCap(Cap.tapered(2, CurveContinuity.G0));
    `;
    const viaBlock = compilePath(program(`() {|vo, pb|${body}}`));
    const viaLambda = compilePath(`let mk = {|vo, pb|${body}};` + program('(mk)'));
    expect(viaLambda).toBe(viaBlock);
    expect(viaLambda.length).toBeGreaterThan(50);
  });

  it('variableOffset(f) works with a shared lambda', () => {
    const result = compilePath(`
      let shape = {|vo, pb|
        vo.stop(0, 2, CurveContinuity.G1);
        vo.stop(1, 6, CurveContinuity.G1);
      };
      let spine = @{ l 100 0 };
      let edge = spine.variableOffset(shape);
      M edge.anchor.x edge.anchor.y
      edge.draw();
    `);
    expect(result.length).toBeGreaterThan(10);
  });

  it('a non-callable argument still errors clearly', () => {
    expect(() => compilePath('let a = [1, 2].map(5); M 0 0;'))
      .toThrow(/map\(\) requires a trailing block or function/);
    expect(() => compilePath('let g = Grid(2, 2); g.fill(5); M 0 0;'))
      .toThrow(/Grid\.fill\(\) requires a trailing block or function/);
  });
});

describe('lambda position coverage matrix', () => {
  it('lambda in let declaration', () => {
    expect(compilePath('let f = {|x| return x; }; M f(4) 0;')).toBe('M 4 0');
  });

  it('lambda as function-call argument', () => {
    // Note: the lambda literal lives in a normal call, not inside a path-arg
    // position — the greedy path-args tokenizer stops at `|`, so a literal
    // inside `M use({|x| ...})` cannot parse. Pass via a variable there.
    expect(compilePath('fn use(f) { return f(3); } let r = use({|x| return calc(x + 1); }); M r 0;')).toBe('M 4 0');
  });

  it('lambda as array element (retrieved then called by name)', () => {
    expect(compilePath('let fns = [{|| return 5; }]; let f = fns[0]; M f() 0;')).toBe('M 5 0');
  });

  it('lambda as object value (retrieved then called by name)', () => {
    expect(compilePath('let o = {get: {|| return 6; }}; let f = o.get; M f() 0;')).toBe('M 6 0');
  });

  it('lambda as return value from fn and from lambda', () => {
    expect(compilePath('fn make() { return {|| return 7; }; } let f = make(); M f() 0;')).toBe('M 7 0');
    expect(compilePath('let outer = {|| return {|| return 8; }; }; let f = outer(); M f() 0;')).toBe('M 8 0');
  });

  it('PINS v1 limitation: immediate call of a lambda literal silently yields the lambda (callee-expression gap)', () => {
    // {|x| ...}(3) parses, but the ArgList after a non-Identifier callee is
    // dropped (pre-existing ast-builder gap shared with fns[0](5) / obj.f(1)).
    // Documented in docs/syntax.md § Lambdas. If this test starts failing
    // because calling works, delete it and unpin the docs limitation.
    const out = logValue('let r = {|x| return 9; }(3); log(`${r}`); M 0 0;');
    expect(out).toContain('Lambda(x)');
  });
});
