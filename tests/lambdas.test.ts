import { describe, it, expect } from 'vitest';
import { compile } from '../src/index';
import { compilePath } from './helpers';

// Lambda expressions: << worker application to builtins and the position
// coverage matrix. Core call/scoping semantics live in evaluator.test.ts
// ("lambdas" / "scoping" describes).

function logValue(source: string): string {
  const result = compile(source);
  expect(result.logs.length).toBeGreaterThan(0);
  const parts = result.logs[result.logs.length - 1].parts;
  return parts.map((p) => p.value).join('');
}

describe('<< worker application to builtins', () => {
  it('array.map() << f produces output identical to the trailing-block form', () => {
    const viaBlock = logValue('let a = [1, 2, 3].map {|v| return calc(v * 2); }; log(`${a}`); M 0 0;');
    const viaLambda = logValue('let f = {|v| return calc(v * 2); }; let a = [1, 2, 3].map() << f; log(`${a}`); M 0 0;');
    const inline = logValue('let a = [1, 2, 3].map() << {|v| return calc(v * 2); }; log(`${a}`); M 0 0;');
    expect(viaLambda).toBe(viaBlock);
    expect(inline).toBe(viaBlock);
    expect(viaLambda).toContain('[2, 4, 6]');
  });

  it('array.map() << namedFn accepts a named fn value too', () => {
    const out = logValue('fn dbl(v) { return calc(v * 2); } let a = [1, 2, 3].map() << dbl; log(`${a}`); M 0 0;');
    expect(out).toContain('[2, 4, 6]');
  });

  it('the lambda closure is used inside the builtin iteration', () => {
    const out = logValue(`
      let offset = 10;
      let addOffset = {|v| return calc(v + offset); };
      fn run() {
        let offset = 999;
        return [1, 2].map() << addOffset;
      }
      let a = run();
      log(\`\${a}\`);
      M 0 0;
    `);
    expect(out).toContain('[11, 12]');
  });

  it('array.filter() << f produces output identical to the trailing-block form', () => {
    const viaBlock = logValue('let a = [4, -2, 7, 0].filter {|v| return v > 0; }; log(`${a}`); M 0 0;');
    const viaLambda = logValue('let f = {|v| return v > 0; }; let a = [4, -2, 7, 0].filter() << f; log(`${a}`); M 0 0;');
    const inline = logValue('let a = [4, -2, 7, 0].filter() << {|v| return v > 0; }; log(`${a}`); M 0 0;');
    expect(viaLambda).toBe(viaBlock);
    expect(inline).toBe(viaBlock);
    expect(viaLambda).toContain('[4, 7]');
  });

  it('array.filter() << namedFn accepts a named fn value too', () => {
    const out = logValue('fn pos(v) { return v > 0; } let a = [4, -2, 7].filter() << pos; log(`${a}`); M 0 0;');
    expect(out).toContain('[4, 7]');
  });

  it('reduce(init) << worker evaluates init BEFORE the worker expression', () => {
    // The evaluation-order contract: receiver -> parenthesized args -> worker.
    const result = compile(`
      fn computeInit() { log('init'); return 0; }
      fn makeFn() { log('fn'); return {|acc, v| return calc(acc + v); }; }
      let s = [1, 2, 3].reduce(computeInit()) << makeFn();
      log(\`\${s}\`);
      M 0 0;
    `);
    const order = result.logs.map((l) => l.parts.map((p) => p.value).join(''));
    expect(order[0]).toBe('init');
    expect(order[1]).toBe('fn');
    expect(order[2]).toContain('6');
  });

  it('array.reduce(init) << f matches reduce(init) {|...|}', () => {
    const viaBlock = logValue('let s = [1, 2, 3].reduce(0) {|acc, v| return calc(acc + v); }; log(`${s}`); M 0 0;');
    const viaLambda = logValue('let f = {|acc, v| return calc(acc + v); }; let s = [1, 2, 3].reduce(0) << f; log(`${s}`); M 0 0;');
    expect(viaLambda).toBe(viaBlock);
    expect(viaLambda).toContain('6');
  });

  it('array.sort() << cmp matches sort {|a, b|}', () => {
    const viaBlock = logValue('let s = [3, 1, 2].sort {|a, b| return calc(b - a); }; log(`${s}`); M 0 0;');
    const viaLambda = logValue('let cmp = {|a, b| return calc(b - a); }; let s = [3, 1, 2].sort() << cmp; log(`${s}`); M 0 0;');
    expect(viaLambda).toBe(viaBlock);
    expect(viaLambda).toContain('[3, 2, 1]');
  });

  it('Grid.fill() << f matches fill {|row, col|}', () => {
    const viaBlock = logValue('let g = Grid(2, 2); g.fill {|r, c| return calc(r * 10 + c); }; log(`${g.cells()}`); M 0 0;');
    const viaLambda = logValue('let f = {|r, c| return calc(r * 10 + c); }; let g = Grid(2, 2); g.fill() << f; log(`${g.cells()}`); M 0 0;');
    expect(viaLambda).toBe(viaBlock);
    expect(viaLambda).toContain('[0, 1, 10, 11]');
  });

  it('Grid.map() << f and Grid.forEach() << f accept lambdas', () => {
    const out = logValue(`
      let g = Grid(2, 2);
      g.fill() << {|r, c| return calc(r + c); };
      let doubled = g.map() << {|cell| return calc(cell * 2); };
      let total = 0;
      let addUp = {|cell| total = total + cell; };
      doubled.forEach() << addUp;
      log(\`\${total}\`);
      M 0 0;
    `);
    expect(out).toContain('8'); // (0+1+1+2)*2
  });

  it('compoundVariableOffset() << mk matches the trailing-block form exactly', () => {
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
    const viaWorker = compilePath(`let mk = {|vo, pb|${body}};` + program('() << mk'));
    expect(viaWorker).toBe(viaBlock);
    expect(viaWorker.length).toBeGreaterThan(50);
  });

  it('variableOffset() << shape works with a shared lambda', () => {
    const result = compilePath(`
      let shape = {|vo, pb|
        vo.stop(0, 2, CurveContinuity.G1);
        vo.stop(1, 6, CurveContinuity.G1);
      };
      let spine = @{ l 100 0 };
      let edge = spine.variableOffset() << shape;
      M edge.anchor.x edge.anchor.y
      edge.draw();
    `);
    expect(result.length).toBeGreaterThan(10);
  });

  it('worker application works in expression-statement position', () => {
    const out = logValue('let g = Grid(2, 2); let f = {|r, c| return calc(r + c); }; g.fill() << f; log(`${g.cells()}`); M 0 0;');
    expect(out).toContain('[0, 1, 1, 2]');
  });

  it('apply-then-merge chains when the types line up', () => {
    // compoundVariableOffset() << mk yields a PathBlock; << @{...} concatenates.
    const result = compilePath(`
      let mk = {|vo, pb|
        vo.stop(0, 2, CurveContinuity.G1, -2, CurveContinuity.G1);
        vo.stop(1, 2, CurveContinuity.G1, -2, CurveContinuity.G1);
      };
      let spine = @{ l 100 0 };
      let rib = spine.compoundVariableOffset() << mk << @{ l 10 0 };
      M 0 0
      rib.draw();
    `);
    expect(result).toContain('l 10 0');
  });
});

describe('<< worker coverage matrix', () => {
  // Every callback builtin x every worker kind (lambda variable, named fn,
  // literal lambda) must match the trailing-block form exactly. Constant
  // programs, so parity is exact string equality on the logged result.
  const builtins: Array<{
    name: string;
    block: string; // full program computing r via trailing block
    worker: (rhs: string) => string; // same program with << rhs
    lambda: string; // lambda literal for the var/literal columns
    fnDecl: string; // named-fn declaration for the named column (fn w2 ...)
    expected: string;
  }> = [
    {
      name: 'array.map',
      block: 'let r = [1, 2].map {|v| return calc(v + 1); };',
      worker: (rhs) => `let r = [1, 2].map() << ${rhs};`,
      lambda: '{|v| return calc(v + 1); }',
      fnDecl: 'fn w2(v) { return calc(v + 1); }',
      expected: '[2, 3]',
    },
    {
      name: 'array.reduce',
      block: 'let r = [1, 2, 3].reduce(4) {|acc, v| return calc(acc + v); };',
      worker: (rhs) => `let r = [1, 2, 3].reduce(4) << ${rhs};`,
      lambda: '{|acc, v| return calc(acc + v); }',
      fnDecl: 'fn w2(acc, v) { return calc(acc + v); }',
      expected: '10',
    },
    {
      name: 'array.sort',
      block: 'let r = [2, 3, 1].sort {|a, b| return calc(a - b); };',
      worker: (rhs) => `let r = [2, 3, 1].sort() << ${rhs};`,
      lambda: '{|a, b| return calc(a - b); }',
      fnDecl: 'fn w2(a, b) { return calc(a - b); }',
      expected: '[1, 2, 3]',
    },
    {
      name: 'Grid.fill',
      block: 'let g = Grid(2, 2); g.fill {|row, col| return calc(row + col); }; let r = g.cells();',
      worker: (rhs) => `let g = Grid(2, 2); g.fill() << ${rhs}; let r = g.cells();`,
      lambda: '{|row, col| return calc(row + col); }',
      fnDecl: 'fn w2(row, col) { return calc(row + col); }',
      expected: '[0, 1, 1, 2]',
    },
    {
      name: 'Grid.forEach',
      block: 'let g = Grid(2, 2); g.fill {|row, col| return calc(row + col); }; let r = 0; g.forEach {|cell| r = r + cell; };',
      worker: (rhs) => `let g = Grid(2, 2); g.fill {|row, col| return calc(row + col); }; let r = 0; g.forEach() << ${rhs};`,
      lambda: '{|cell| r = r + cell; }',
      fnDecl: 'fn w2(cell) { r = r + cell; }',
      expected: '4',
    },
    {
      name: 'Grid.map',
      block: 'let g = Grid(2, 2); g.fill {|row, col| return calc(row + col); }; let m = g.map {|cell| return calc(cell * 3); }; let r = m.cells();',
      worker: (rhs) => `let g = Grid(2, 2); g.fill {|row, col| return calc(row + col); }; let m = g.map() << ${rhs}; let r = m.cells();`,
      lambda: '{|cell| return calc(cell * 3); }',
      fnDecl: 'fn w2(cell) { return calc(cell * 3); }',
      expected: '[0, 3, 3, 6]',
    },
  ];

  for (const b of builtins) {
    it(`${b.name}: lambda var, named fn, and literal << all match the block form`, () => {
      const tail = ' log(`${r}`); M 0 0;';
      const viaBlock = logValue(b.block + tail);
      const viaVar = logValue(`let w = ${b.lambda};` + b.worker('w') + tail);
      const viaLiteral = logValue(b.worker(b.lambda) + tail);
      const viaNamed = logValue(b.fnDecl + ' ' + b.worker('w2') + tail);
      expect(viaVar).toBe(viaBlock);
      expect(viaLiteral).toBe(viaBlock);
      expect(viaNamed).toBe(viaBlock);
      expect(viaBlock).toContain(b.expected);
    });
  }

  // The two variable-offset builders compare full compiled path output.
  const voBody =
    'go.stop(0, 3, CurveContinuity.G1); go.stop(1, 3, CurveContinuity.G1);';
  const cvoBody =
    'go.stop(0, 2, CurveContinuity.G1, -2, CurveContinuity.G1); go.stop(1, 2, CurveContinuity.G1, -2, CurveContinuity.G1);';
  const voProgram = (method: string, call: string) => `
    let spine = @{ l 100 0 };
    let pbk = spine.${method}${call};
    M 0 0
    pbk.draw();
  `;

  for (const [method, body] of [
    ['variableOffset', voBody],
    ['compoundVariableOffset', cvoBody],
  ] as const) {
    it(`${method}: lambda var, named fn, and literal << all match the block form`, () => {
      const viaBlock = compilePath(voProgram(method, `() {|go, pb| ${body} }`));
      const viaVar = compilePath(`let w = {|go, pb| ${body} };` + voProgram(method, '() << w'));
      const viaLiteral = compilePath(voProgram(method, `() << {|go, pb| ${body} }`));
      const viaNamed = compilePath(`fn w2(go, pb) { ${body} }` + voProgram(method, '() << w2'));
      expect(viaVar).toBe(viaBlock);
      expect(viaLiteral).toBe(viaBlock);
      expect(viaNamed).toBe(viaBlock);
      expect(viaBlock.length).toBeGreaterThan(20);
    });
  }
});

describe('<< worker errors and merge regressions', () => {
  it('the removed argument form errors with a pointer to <<', () => {
    expect(() => compilePath('let f = {|v| return v; }; let a = [1, 2].map(f); M 0 0;'))
      .toThrow(/map\(\) requires a trailing block or a << worker/);
    expect(() => compilePath('let f = {|r, c| return r; }; let g = Grid(2, 2); g.fill(f); M 0 0;'))
      .toThrow(/Grid\.fill\(\) requires a trailing block or a << worker/);
    expect(() => compilePath('let f = {|acc, v| return acc; }; let s = [1, 2].reduce(0, f); M 0 0;'))
      .toThrow(/reduce\(\) requires a trailing block or a << worker/);
    expect(() => compilePath(`
      let mk = {|vo, pb| vo.stop(0, 2, CurveContinuity.G1); };
      let s = @{ l 100 0 };
      let e = s.variableOffset(mk);
      M 0 0;
    `)).toThrow(/variableOffset\(\) requires a block or a << worker/);
  });

  it('a non-callable argument still errors clearly', () => {
    expect(() => compilePath('let a = [1, 2].map(5); M 0 0;'))
      .toThrow(/map\(\) requires a trailing block or a << worker/);
    expect(() => compilePath('let g = Grid(2, 2); g.fill(5); M 0 0;'))
      .toThrow(/Grid\.fill\(\) requires a trailing block or a << worker/);
  });

  it('a non-callable << right side after a callback builtin errors', () => {
    expect(() => compilePath('let a = [1, 2].map() << 5; M 0 0;'))
      .toThrow(/map\(\) << expects a function or lambda on the right side/);
    expect(() => compilePath('let g = Grid(2, 2); g.fill() << "nope"; M 0 0;'))
      .toThrow(/fill\(\) << expects a function or lambda on the right side/);
  });

  it('a callable landing on the merge path gets the targeted hint', () => {
    // value << lambda
    expect(() => compilePath('let f = {|v| return v; }; let a = 5 << f; M 0 0;'))
      .toThrow(/can apply a function or lambda only to a callback builtin call/);
    // chained application: (map() << f) is already an array. RHS is
    // deliberately non-callable so the failure pins the left-to-right
    // grouping (apply f, then attempt an invalid merge) rather than the
    // callable-RHS hint firing for either grouping.
    expect(() => compilePath('let f = {|v| return v; }; let a = [1].map() << f << 7; M 0 0;'))
      .toThrow(/requires matching operand types/);
    // And with a callable RHS, the targeted hint names the problem.
    expect(() => compilePath('let f = {|v| return v; }; let g = {|v| return v; }; let a = [1].map() << f << g; M 0 0;'))
      .toThrow(/can apply a function or lambda only to a callback builtin call/);
    // block + worker: the block completes the call, so << sees array << fn
    expect(() => compilePath('let f = {|v| return v; }; let a = [1].map {|v| return v; } << f; M 0 0;'))
      .toThrow(/can apply a function or lambda only to a callback builtin call/);
  });

  it('a block-bearing builtin call followed by << still merges (concat regression)', () => {
    const result = compilePath(`
      let spine = @{ l 100 0 };
      let edge = spine.variableOffset() {|go, pb|
        go.stop(0, 5, CurveContinuity.G1);
        go.stop(1, 5, CurveContinuity.G1);
      } << @{ l 10 0 };
      M 0 0
      edge.draw();
    `);
    expect(result).toContain('l 10 0');
  });

  it('non-callback << merges are untouched (objects, styles, path blocks)', () => {
    const out = logValue('let a = { x: 1 }; let b = a << { y: 2, x: 9 }; log(`${b.x},${b.y}`); M 0 0;');
    expect(out).toContain('9,2');
    const path = compilePath('let p = @{ m 5 5 } << @{ l 10 0 }; M 0 0 p.draw();');
    expect(path).toContain('l 10 0');
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

  it('lambda as << worker operand (variable, literal)', () => {
    expect(compilePath('let f = {|v| return calc(v * 2); }; let a = [3].map() << f; let x = a[0]; M x 0;')).toBe('M 6 0');
    expect(compilePath('let a = [3].map() << {|v| return calc(v * 2); }; let x = a[0]; M x 0;')).toBe('M 6 0');
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
