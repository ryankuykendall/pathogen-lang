import { describe, expect, it } from 'vitest';

import { compile } from '../src';

/**
 * Bare `${expr}` interpolation in style-block VALUES (Broken Lines friction
 * log #1). Contract: `prop: ${expr};` is equivalent to the backtick form
 * `` prop: `${expr}`; `` — evaluate, splice, untrusted, same validation —
 * and fragments mix with raw tokens (lists, function args, unit fusion).
 * `${` inside quoted strings stays literal.
 */

function styleOf(source: string, layerName: string): Record<string, string> {
  const result = compile(source);
  const layer = result.layers.find((l) => l.name === layerName);
  if (!layer) throw new Error(`layer ${layerName} not found`);
  return layer.styles as Record<string, string>;
}

describe('bare ${} interpolation in style values', () => {
  it('whole-value interpolation evaluates and splices', () => {
    const styles = styleOf(
      `
      let capName = 'round';
      let l = PathLayer('a') ${'${'} fill: red; stroke-linecap: ${'${'}capName}; };
      l.apply { M 0 0 h 10 }
      `,
      'a',
    );
    expect(styles['stroke-linecap']).toBe('round');
  });

  it('is equivalent to the backtick form', () => {
    const bare = styleOf(
      `let w = 2.5; let l = PathLayer('a') ${'${'} fill: red; stroke-width: ${'${'}w * 2}; }; l.apply { M 0 0 h 10 }`,
      'a',
    );
    const ticked = styleOf(
      'let w = 2.5; let l = PathLayer(\'a\') ${ fill: red; stroke-width: `${w * 2}`; }; l.apply { M 0 0 h 10 }',
      'a',
    );
    expect(bare['stroke-width']).toBe(ticked['stroke-width']);
    expect(bare['stroke-width']).toBe('5');
  });

  it('list values interpolate token by token', () => {
    const styles = styleOf(
      `
      let cell = 12;
      let l = PathLayer('a') ${'${'} fill: red; stroke-dasharray: ${'${'}cell} ${'${'}cell}; };
      l.apply { M 0 0 h 10 }
      `,
      'a',
    );
    expect(styles['stroke-dasharray']).toBe('12 12');
  });

  it('mixes with raw tokens in a list', () => {
    const styles = styleOf(
      `
      let pitch = 16;
      let l = PathLayer('a') ${'${'} fill: red; stroke-dasharray: 0.01 ${'${'}pitch}; };
      l.apply { M 0 0 h 10 }
      `,
      'a',
    );
    expect(styles['stroke-dasharray']).toBe('0.01 16');
  });

  it('works inside function arguments fused to a unit', () => {
    const styles = styleOf(
      `
      let softness = 1.5;
      let l = PathLayer('a') ${'${'} fill: red; filter: blur(${'${'}softness}px); };
      l.apply { M 0 0 h 10 }
      `,
      'a',
    );
    expect(styles['filter']).toContain('blur(1.5px)');
  });

  it('feeds dash() end-to-end', () => {
    const result = compile(`
      let cell = 20;
      let wave = @{ h 100 };
      let pieces = wave.dash(${'${'} stroke-dasharray: ${'${'}cell} ${'${'}cell}; });
      log(pieces.length);
      log(pieces[0].path.length);
    `);
    expect(String(result.logs[0].parts[0].value)).toBe('5');
    expect(Number(result.logs[1].parts[0].value)).toBeCloseTo(20, 5);
  });

  it('never splices inside double-quoted strings (quotes are opaque)', () => {
    // The value fails CSS validation with the LITERAL ${x} still present —
    // proving no splice happened inside the quotes (x = 9 would otherwise
    // have been substituted).
    expect(() =>
      compile(
        `
        let x = 9;
        let l = TextLayer('a') ${'${'} font-family: "${'${'}x}"; };
        l.apply { text(20, 20)\`hi\` }
        `,
      ),
    ).toThrow(/\$\{x\}/);
  });

  it('never splices inside single-quoted strings (and they now parse)', () => {
    // Pre-fix this was a PARSE error (the interp's } killed the single-quote
    // token); now it parses and reaches validation with the literal intact.
    expect(() =>
      compile(
        `
        let x = 9;
        let l = TextLayer('a') ${'${'} font-family: '${'${'}x}'; };
        l.apply { text(20, 20)\`hi\` }
        `,
      ),
    ).toThrow(/\$\{x\}/);
  });

  it('supports one nested brace level inside the interpolation', () => {
    const styles = styleOf(
      `
      fn pick(o) { return o.v; }
      let l = PathLayer('a') ${'${'} fill: red; stroke-width: ${'${'} pick({v: 3}) }; };
      l.apply { M 0 0 h 10 }
      `,
      'a',
    );
    expect(styles['stroke-width']).toBe('3');
  });

  it('template-form interps in style values still reject nested braces', () => {
    // Known asymmetry: nesting inside the TEMPLATE-internal interp would
    // overflow the tokenizer tables, so the template arm stays flat. The
    // bare form supports one level (test above) — it is the more capable
    // spelling inside style values.
    expect(() =>
      compile(
        `
        fn pick(o) { return o.v; }
        let l = PathLayer('a') ${'${'} fill: red; stroke-width: \`${'${'} pick({v: 4}) }\`; };
        l.apply { M 0 0 h 10 }
        `,
      ),
    ).toThrow();
  });

  it('values without ${} are untouched', () => {
    const styles = styleOf(
      `let l = PathLayer('a') ${'${'} fill: red; stroke-dasharray: 4 2; }; l.apply { M 0 0 h 10 }`,
      'a',
    );
    expect(styles['stroke-dasharray']).toBe('4 2');
    expect(styles['fill']).toBe('red');
  });

  it('splices template fragments fused to units inside a filter value', () => {
    const src = `let softness = 1.5;
define PathLayer('a') ${'${'} filter: blur(\`${'${'}softness}\`px) brightness(\`${'${'}1.2}\`); }
layer('a').apply { M 0 0 }`;
    const layer = compile(src).layers.find((l) => l.name === 'a')!;
    expect(layer.styles.filter).toBe('blur(1.5px) brightness(1.2)');
  });
});
