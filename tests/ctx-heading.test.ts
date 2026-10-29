/**
 * `ctx.heading` with no direction set reads `null` (docs/stdlib.md
 * "ctx.heading"): before anything is drawn, and after `M` clears it. It used
 * to be an error ("Property 'heading' does not exist on context object")
 * while the docs said it read as undefined.
 */
import { describe, expect, it } from 'vitest';

import { compile, compileWithContext } from '../src';

function logs(source: string): string[] {
  return compile(source).logs.map((entry) => entry.parts.map((p) => String(p.value)).join(' '));
}

describe('ctx.heading with no direction set', () => {
  it('is null before anything is drawn', () => {
    expect(logs('log(ctx.heading);')).toEqual(['null']);
  });

  it('is null after M clears it — the docs/stdlib.md example', () => {
    expect(
      logs(`M 0 0  L 50 0
log(ctx.heading);
heading(90deg);
M 200 200
log(ctx.heading);`),
    ).toEqual(['0', 'null']);
  });

  it('compares equal to null, so a program can test for it', () => {
    expect(
      logs(
        'M 10 10\nif (ctx.heading == null) { log("no heading"); }\nL 20 10\nif (ctx.heading != null) { log("heading set"); }',
      ),
    ).toEqual(['no heading', 'heading set']);
  });

  it('destructures like any other member', () => {
    expect(
      logs('let { heading } = ctx;\nlog(heading);\nM 0 0 L 10 0\nlet { heading: after } = ctx;\nlog(after);'),
    ).toEqual(['null', '0']);
  });

  it("a layer's ctx has the same heading member", () => {
    expect(logs("define PathLayer('a') #{ stroke: red; };\nlog(layer('a').ctx.heading);")).toEqual(['null']);
  });

  it('nested context records have no heading', () => {
    expect(() => compile('log(ctx.position.heading);')).toThrow(/Property 'heading' does not exist on context object/);
  });

  it('other missing ctx members are still an error', () => {
    expect(() => compile('log(ctx.nope);')).toThrow(/Property 'nope' does not exist on context object/);
  });

  it("the JS API's context.heading stays undefined after M", () => {
    expect(compileWithContext('M 0 0 L 50 0 M 100 100').context.heading).toBeUndefined();
  });
});
