/**
 * Phase 0a step 2: the drawing context follows the call
 * (project-docs/modules/06-phase-0a-plan.md §Step 2; docs/debug.md "ctx
 * Object", docs/syntax.md "Lambdas").
 *
 * `ctx`, and the pen a call draws with, belong to the place that is drawing
 * right now: a path block's cursor inside `@{ }`, a layer's pen inside
 * `layer().apply`, the program's pen elsewhere — for code written there and
 * for any fn, lambda or callback called there. Before step 2:
 * - a lambda drew with its DEFINITION's pen (bug B2);
 * - `ctx` inside a block was bound once at the block's start, and every
 *   command, the block's included, rewrote the program's `ctx` (bug B3).
 *
 * Lives in its own file while phase 0a step 1 (tests/context.test.ts) is
 * uncommitted in another session.
 */
import { describe, expect, it } from 'vitest';

import { compile, compileWithContext } from '../src';

/** The program's own log lines (warning mirrors left out). */
function logs(source: string): string[] {
  return compile(source)
    .logs.filter((entry) => entry.severity !== 'warn')
    .map((entry) => entry.parts.map((p) => String(p.value)).join(' '));
}

describe('the docs examples', () => {
  it('docs/debug.md: ctx inside a block is its cursor, and the program pen after it', () => {
    const source = `M 10 10
let block = @{
  m 5 0
  log(ctx.position.x);   // 5, the block's cursor
};
log(ctx.position.x);     // 10, the program's pen again`;
    expect(logs(source)).toEqual(['5', '10']);
  });

  it("docs/syntax.md: a lambda called inside a block draws from the block cursor; the program's pen stays", () => {
    const source = `let tick = {|| polarLine(0deg, 10); };
M 50 50
let ticks = @{ tick(); };
log(ticks.d);          // "l 10 0" — drawn from the block's cursor
log(ctx.position.x);   // 50 — the program's pen didn't move`;
    const result = compile(source);
    expect(result.logs.map((e) => e.parts.map((p) => String(p.value)).join(' '))).toEqual(['l 10 0', '50']);
    expect(result.warnings).toEqual([]);
  });

  it("docs/debug.md: let saved = ctx keeps that moment's values", () => {
    const source = `M 0 0
let saved = ctx;
L 10 0
log(saved.position.x);   // 0
log(ctx.position.x);     // 10`;
    expect(logs(source)).toEqual(['0', '10']);
  });

  it('docs/path-blocks.md + syntax.md: a stdlib shape in a fn called inside a block still works', () => {
    expect(
      logs('fn dot() { circle(0, 0, 2); }\nlet block = @{ m 5 5; dot(); };\nlog(block.commands.length > 1);'),
    ).toEqual(['true']);
  });
});

describe('ctx inside a path block follows the block cursor (B3)', () => {
  it.each([
    ['after m 5 0', '@{ m 5 0; log(ctx.position.x); };', ['5']],
    ['in a for body', '@{ m 0 0; for (i in 0..<2) { l 10 0; log(ctx.position.x); } };', ['10', '20']],
    ['in an if body', '@{ m 5 0; if (true) { log(ctx.position.x); } };', ['5']],
    ['ctx.start', 'M 50 50\n@{ m 5 0; l 10 0; log(ctx.start.x); };', ['5']],
    ['ctx.heading after a line', '@{ m 0 0; l 5 0; log(ctx.heading); };', ['0']],
    ['read by a named fn', 'M 50 50\nfn px() { return ctx.position.x; }\n@{ m 5 0; log(px()); };', ['5']],
    ['read by a callback block', '@{ m 5 0; log([1].map() {|v| return ctx.position.x; }); };', ['[5]']],
  ])('%s', (_, source, expected) => {
    expect(logs(source)).toEqual(expected);
  });

  it("the block's cursor doesn't leak into the program's ctx", () => {
    expect(logs('M 10 10\nlet b = @{ m 5 0 };\nlog(ctx.position.x);')).toEqual(['10']);
  });
});

describe('a lambda draws with the pen of the place that calls it (B2)', () => {
  it('draws into the block it is called in', () => {
    const result = compile('let tick = {|| polarLine(0deg, 10); };\nM 50 50\nlet b = @{ tick(); };\nlog(b.d);');
    expect(logs('let tick = {|| polarLine(0deg, 10); };\nM 50 50\nlet b = @{ tick(); };\nlog(b.d);')).toEqual([
      'l 10 0',
    ]);
    expect(result.warnings).toEqual([]);
  });

  it('a lambda written inside a block and called later reads the pen where it is called', () => {
    const source =
      'let f = null;\nlet b = @{\n  let g = {|| return ctx.position.x; };\n  f = g;\n  m 5 0;\n};\nM 70 0\nlog(f());';
    expect(logs(source)).toEqual(['70']);
  });

  it('a worker applied with << inside a block draws into the block', () => {
    const source =
      'let g = Grid(1, 2, { xDim: 10, yDim: 10 });\nlet step = {|cell, row, col, center| l 1 0; };\nlet b = @{ m 0 0; g.forEach() << step; };\nlog(b.d);';
    expect(logs(source)).toEqual(['m 0 0 l 1 0 l 1 0']);
  });

  it.each([
    [
      'map() << worker',
      'let drawer = {|v| l 1 0; return v; };\nlet block = @{ m 0 0; let r = [1, 2].map() << drawer; };\nlog(block.d);',
    ],
    [
      'a map trailing block (already right)',
      'let block = @{ m 0 0; let r = [1, 2].map {|v| l 1 0; return v; }; };\nlog(block.d);',
    ],
  ])('a callback that draws inside a block draws into it: %s', (_, source) => {
    expect(logs(source)).toEqual(['m 0 0 l 1 0 l 1 0']);
  });

  // Right before step 2 only because every command rewrote the program's ctx
  // (B3): pinned so a fix that resolves ctx from the wrong scope shows up.
  it.each([
    [
      'a lambda reading ctx in a block',
      'M 50 50\nlet px = {|| return ctx.position.x; };\n@{ m 5 0; log(px()); };',
      ['5'],
    ],
    [
      'map() << lambda reading ctx in a block',
      'M 50 50\nlet px = {|v| return ctx.position.x; };\n@{ m 5 0; log([1].map() << px); };',
      ['[5]'],
    ],
  ])('%s', (_, source, expected) => {
    expect(logs(source)).toEqual(expected);
  });

  // docs/path-blocks.md "Restrictions": every rule holds for a fn or lambda
  // called inside a block. Before step 2, called code was checked for only
  // .draw()/.project(), text() and nested blocks; an absolute command was
  // quietly made relative, `define PathLayer` was accepted, and
  // layer().apply failed with "Undefined layer". The user chose to enforce
  // all six in step 2 (2026-10-29).
  it.each([
    ['.draw()', 'let shape = @{ l 1 1 };\n', 'shape.draw();', /Cannot call \.draw\(\) inside a path block/],
    [
      '.project()',
      'let shape = @{ l 1 1 };\n',
      'let placed = shape.project(0, 0);',
      /Cannot call \.project\(\) inside a path block/,
    ],
    ['text()', '', 'text(0, 0)`a`', /text\(\) can only be used inside a TextLayer apply block/],
    ['a nested @{ }', '', 'let inner = @{ l 1 1 };', /Cannot nest path blocks/],
    [
      'an absolute command',
      '',
      'L 10 10',
      /Absolute path command 'L' is not allowed inside path blocks\. Use lowercase 'l' for relative commands/,
    ],
    [
      'define PathLayer',
      '',
      "define PathLayer('x') #{ stroke: red; };",
      /Layer definitions are not allowed inside path blocks/,
    ],
    [
      'define TextLayer',
      '',
      "define TextLayer('t') #{ font-size: 12; };",
      /Layer definitions are not allowed inside path blocks/,
    ],
    [
      'layer().apply',
      "define PathLayer('x') #{ stroke: red; };\n",
      "layer('x').apply { M 0 0 }",
      /Layer apply blocks are not allowed inside path blocks/,
    ],
  ])("the block's rules reach code called inside it: %s", (_, prelude, body, error) => {
    expect(() => compile(`${prelude}let f = {|| ${body} };\nlet block = @{ f(); };`)).toThrow(error);
    expect(() => compile(`${prelude}fn g() { ${body} }\nlet block = @{ g(); };`)).toThrow(error);
  });

  it('docs/path-blocks.md: fn edge() { L 10 10 } is fine alone, an error when called inside a block', () => {
    expect(logs('fn edge() { L 10 10 }\nM 0 0\nedge();\nlog(ctx.position.x);')).toEqual(['10']);
    expect(() => compile('fn edge() { L 10 10 }\nlet block = @{ edge(); };')).toThrow(
      /Absolute path command 'L' is not allowed inside path blocks/,
    );
  });

  it('a lambda or fn called inside a block may still use relative commands', () => {
    expect(
      logs('let hop = {|| l 5 0; };\nfn step() { l 5 0; }\nlet block = @{ m 0 0; hop(); step(); };\nlog(block.d);'),
    ).toEqual(['m 0 0 l 5 0 l 5 0']);
  });

  // The code review's cases. Before step 2 an uppercase command was checked
  // on the block's own lines only: inside an if/for body it was accepted, and
  // inside a builder block it leaked into the block's path ("m 0 0 m 0 0 l 5 5").
  it.each([
    ['an if body', '@{ m 0 0; if (true) { L 10 10 } };'],
    ['a for body', '@{ m 0 0; for (i in 0..<1) { L 10 10 } };'],
    ['a builder block', "@{ m 0 0; let pat = Pattern('p', 0, 0, 10, 10) {|p| M 0 0 L 5 5 }; };"],
  ])('an uppercase command anywhere inside a block is an error: %s', (_, source) => {
    expect(() => compile(source)).toThrow(/Absolute path command '[ML]' is not allowed inside path blocks/);
  });

  it('a lambda called from a lambda called inside a block still draws into the block', () => {
    expect(
      logs(
        'let inner = {|| polarLine(0deg, 10); };\nlet outer = {|| inner(); };\nM 50 50\nlet b = @{ outer(); };\nlog(b.d);',
      ),
    ).toEqual(['l 10 0']);
  });

  it('a worker applied with << to reduce, inside a block, draws into it', () => {
    const source =
      'let step = {|acc, v| l 1 0; return calc(acc + v); };\nlet block = @{ m 0 0; let total = [1, 2].reduce(0) << step; };\nlog(block.d);';
    expect(logs(source)).toEqual(['m 0 0 l 1 0 l 1 0']);
  });

  it.each([
    ['a text block inside a path block', '@{ m 5 0; let t = &{ log(ctx.position.x); text(0, 0)`a` }; };'],
    [
      'a builder block inside a path block',
      "@{ m 5 0; let pat = Pattern('p', 0, 0, 10, 10) {|p| log(ctx.position.x); }; };",
    ],
  ])("ctx in %s is the path block's cursor", (_, source) => {
    expect(logs(source)).toEqual(['5']);
  });
});

describe('unchanged by step 2', () => {
  it.each([
    ['ctx at the top level', 'M 9 0\nlog(ctx.position.x);', ['9']],
    [
      'map() << lambda at the top level',
      'M 9 0\nlet px = {|v| return ctx.position.x; };\nlog([1].map() << px);',
      ['[9]'],
    ],
    [
      "a fn and a lambda inside layer().apply read the layer's pen",
      "define PathLayer('a') #{ stroke: red; };\nfn fx() { return ctx.position.x; }\nlet lx = {|| return ctx.position.x; };\nM 5 5\nlayer('a').apply { M 30 0 log(fx()); log(lx()); }",
      ['30', '30'],
    ],
    [
      'a callback inside layer().apply',
      "define PathLayer('a') #{ stroke: red; };\nM 5 5\nlayer('a').apply { M 30 0 log([1].map() {|v| return ctx.position.x; }); }",
      ['[30]'],
    ],
    [
      'ctx.transform from a lambda in apply moves that layer',
      "define PathLayer('a') #{ stroke: red; };\nlet shift = {|| ctx.transform.translate.set(10, 20); };\nlayer('a').apply { shift(); M 0 0 L 5 5 }\nlog(layer('a').ctx.transform.translate.x);",
      ['10'],
    ],
    [
      'inside &{ }, ctx is the outer pen and transform',
      'ctx.transform.translate.set(7, 0);\nM 40 0\nlet t = &{\n  log(ctx.position.x);\n  log(ctx.transform.translate.x);\n  text(0, 0)`a`\n};',
      ['40', '7'],
    ],
    ['ctx.heading is null after M', 'M 0 0 L 10 0\nM 5 5\nlog(ctx.heading);', ['null']],
    ['ctx.heading is null after m inside a block', 'M 0 0 L 10 0\n@{ m 5 0; log(ctx.heading); };', ['null']],
    ['a saved ctx keeps the values of that moment', 'M 0 0\nlet c = ctx;\nL 10 0\nlog(c.position.x);', ['0']],
    ['a user binding named ctx still wins (until step 5)', 'let ctx = 5;\nlog(ctx);', ['5']],
    [
      "a subscription callback reads the program's final pen",
      "define PathLayer('a') #{ stroke: red; };\nlayer('a').subscribe('command') {|m| log(ctx.position.x); };\nlayer('a').apply { M 70 0 }\nM 33 3",
      ['33'],
    ],
  ])('%s', (_, source, expected) => {
    expect(logs(source)).toEqual(expected);
  });

  it('ctx.transform inside @{ } is still an error', () => {
    expect(() => compile('@{ m 0 0; log(ctx.transform); };')).toThrow(
      "Property 'transform' does not exist on context object",
    );
  });

  it("compileWithContext's context is the program's pen after a block", () => {
    expect(compileWithContext('M 10 10 L 20 10\nlet b = @{ m 5 0 };').context.position).toEqual({ x: 20, y: 10 });
  });
});
