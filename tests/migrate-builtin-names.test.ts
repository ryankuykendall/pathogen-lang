/**
 * The step 5 codemod (scripts/lib/builtin-name-codemod.ts): stored workspaces
 * that declare a built-in name are renamed with the editors' quick fix, and a
 * rename is kept only when the old evaluator says the output is unchanged.
 */
import { describe, expect, it } from 'vitest';

import { compile } from '../src';
import { migrateSource, renameBuiltinDeclarations } from '../scripts/lib/builtin-name-codemod';

import type { PathogenModule } from '../scripts/lib/semantics-audit/baseline';

function renamed(source: string): string {
  const out = renameBuiltinDeclarations(source);
  if (out.kind !== 'renamed') throw new Error(`expected a rename, got ${JSON.stringify(out)}`);
  return out.text;
}

describe('renameBuiltinDeclarations', () => {
  it('leaves a program without built-in declarations alone', () => {
    expect(renameBuiltinDeclarations('let low = 1;\nlog(min(low, 2));')).toEqual({ kind: 'none' });
  });

  it('the stored-workspace shape: let min / let max in a loop body', () => {
    const source = [
      'for (step in 1..3) {',
      '  let min = 0.0001;',
      '  let max = 0.9999;',
      '  let time = calc(((max - min) / 3) * step);',
      '  log(time);',
      '}',
    ].join('\n');
    expect(renamed(source)).toBe(
      [
        'for (step in 1..3) {',
        '  let minValue = 0.0001;',
        '  let maxValue = 0.9999;',
        '  let time = calc(((maxValue - minValue) / 3) * step);',
        '  log(time);',
        '}',
      ].join('\n'),
    );
  });

  it('a fn that takes a built-in name becomes the program’s own version (myMpi)', () => {
    expect(renamed('fn mpi(x) { return calc(x * 3.14); }\nlog(mpi(2));')).toBe(
      'fn myMpi(x) { return calc(x * 3.14); }\nlog(myMpi(2));',
    );
  });

  it('a built-in call in another scope keeps calling the built-in', () => {
    const source = 'fn f(a) {\n  let min = a;\n  return min;\n}\nlog(min(1, 2), f(3));';
    expect(renamed(source)).toBe('fn f(a) {\n  let minValue = a;\n  return minValue;\n}\nlog(min(1, 2), f(3));');
  });

  it('keys, members and strings keep the name; shorthand properties keep their key', () => {
    const source = "let map = [1];\nlet o = { map, other: map };\nlog(o.map, 'map');";
    expect(renamed(source)).toBe("let mapValue = [1];\nlet o = { map: mapValue, other: mapValue };\nlog(o.map, 'map');");
  });

  it('shorthand destructuring keeps the property and renames the variable', () => {
    expect(renamed('let r = { min: 1 };\nlet { min } = r;\nlog(min);')).toBe(
      'let r = { min: 1 };\nlet { min: minValue } = r;\nlog(minValue);',
    );
  });

  it('style values, template interpolations and calc arguments follow', () => {
    const source = "let line = 3;\ndefine PathLayer('a') #{ stroke-width: line; }\nlayer('a').apply { M calc(line) 0 }\nlog(`w ${line}`);";
    expect(renamed(source)).toBe(
      "let lineValue = 3;\ndefine PathLayer('a') #{ stroke-width: lineValue; }\nlayer('a').apply { M calc(lineValue) 0 }\nlog(`w ${lineValue}`);",
    );
  });

  it('a name already in use is not taken', () => {
    expect(renamed('let minValue = 1;\nlet min = 2;\nlog(min, minValue);')).toBe(
      'let minValue = 1;\nlet minValue2 = 2;\nlog(minValue2, minValue);',
    );
  });

  it('an enum named like a built-in', () => {
    expect(renamed('enum Direction { Up, Down }\nlog(Direction.Up == Direction.Down);')).toBe(
      'enum MyDirection { Up, Down }\nlog(MyDirection.Up == MyDirection.Down);',
    );
  });

  it('every result compiles under the new rules', () => {
    for (const source of [
      'let min = 1; let max = 2; log(max - min);',
      'fn hash01(i) { return 0.5; }\nlog(hash01(3));',
      'let { min, max } = { min: 1, max: 2 };\nlog(min, max);',
      'for (arc in [1, 2]) { log(arc); }',
    ]) {
      expect(() => compile(renamed(source)), source).not.toThrow();
    }
  });
});

/** An evaluator stand-in: `render` decides the SVG for a source text. */
function stubLib(render: (source: string) => string): PathogenModule {
  return {
    compile: (source: string) => ({ source, logs: [], warnings: [] }),
    generateSvg: (result: { source: string }) => render(result.source),
    buildFontRegistry: () => ({ registry: undefined }),
    ensureOpentype: async () => {},
  } as unknown as PathogenModule;
}

describe('migrateSource: the same-output gate', () => {
  const source = 'let min = 1;\nlog(min);';

  it('keeps a rename whose output is unchanged', async () => {
    const out = await migrateSource(source, stubLib(() => '<svg/>'), 'k');
    expect(out).toMatchObject({ kind: 'renamed', renames: [{ from: 'min', to: 'minValue' }] });
  });

  it('sends a rename whose output changes to review', async () => {
    const out = await migrateSource(source, stubLib((s) => (s.includes('minValue') ? '<svg a/>' : '<svg b/>')), 'k');
    expect(out).toMatchObject({ kind: 'review', reason: 'output differs after renaming (svg)' });
  });

  it('keeps a program that fails the same way before and after, with a note', async () => {
    const failing = stubLib(() => '');
    failing.compile = () => {
      throw new Error('Array index 0 out of bounds (length 0)');
    };
    const out = await migrateSource(source, failing, 'k');
    expect(out).toMatchObject({ kind: 'renamed', note: 'fails as before: Array index 0 out of bounds (length 0)' });
  });

  it('sends a program whose error changes to review', async () => {
    const failing = stubLib(() => '');
    failing.compile = (s: string) => {
      throw new Error(s.includes('minValue') ? 'after' : 'before');
    };
    const out = await migrateSource(source, failing, 'k');
    expect(out).toMatchObject({ kind: 'review', reason: 'errors differ — before: before; after: after' });
  });

  it('leaves a program that does not parse for review', async () => {
    const out = await migrateSource('let min = 1\nlog(min);', stubLib(() => ''), 'k');
    expect(out.kind).toBe('review');
  });
});
