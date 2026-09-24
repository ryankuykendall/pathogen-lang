import { describe, expect, it } from 'vitest';

import { compile } from '../src';
import { compilePath } from './helpers';

/**
 * Path data must begin with a moveto. Per the SVG spec an initial relative
 * command has no starting point, so the browser discards the ENTIRE path — the
 * output compiles clean and renders nothing. Two places produced such data:
 *
 *   - a layer whose first content has no leading move (ISSUE-015): a
 *     variableOffset result, a `<<` concatenation, a bare `H 50`
 *   - every `<defs>` producer: Mask/ClipPath/Pattern/Marker `.append()` and
 *     `.contour()`, which serialize through commandsToAbsoluteD
 *
 * Both are repaired at SERIALIZATION ONLY. The command list is never touched,
 * because a synthesized move must not become a value the language can see: it
 * would add a phantom `command` match, shift every `:nth` index, and change what
 * `command:first` selects. The tests below pin both halves of that contract.
 *
 * Audit: project-docs/placement-audit/ (D1, ISSUE-015, principle P5a).
 */

function layerData(src: string, name: string): string {
  const layer = compile(src).layers.find((l) => l.name === name);
  if (!layer) throw new Error(`no layer ${name}`);
  return layer.data;
}

/** Every `pathData` string across all defs producers, in declaration order. */
function defsPaths(src: string): string[] {
  const out = compile(src);
  const groups = [out.masks, out.clipPaths, out.patterns, out.markers];
  return groups.flatMap((g) =>
    (g ?? []).flatMap((def: { elements?: { pathData?: string }[] }) =>
      (def.elements ?? []).map((el) => el.pathData ?? '').filter(Boolean),
    ),
  );
}

describe('a layer always begins with a moveto', () => {
  it('repairs a variableOffset result drawn first into a layer (ISSUE-015)', () => {
    const d = layerData(
      `
      define default PathLayer('sink') #{ fill: none; }
      let ribbon = PathLayer('ribbon') #{ fill: none; };
      let edge = @{ h 100 }.variableOffset() {|go, pb|
        go.stop(0%, 0, CurveContinuity.G1);
        go.stop(50%, 10, CurveContinuity.G2);
        go.stop(100%, 0, CurveContinuity.G1);
      };
      ribbon.apply { edge.draw(); }
    `,
      'ribbon',
    );
    expect(d.startsWith('m 0 0 ')).toBe(true);
    expect(d).toMatch(/^m 0 0 c /);
  });

  it('repairs a `<<` concatenation drawn first into a layer', () => {
    const d = layerData(
      `
      define default PathLayer('sink') #{ fill: none; }
      let drawn = PathLayer('drawn') #{ fill: none; };
      let foo = @{ h 10 } << @{ v 10 };
      drawn.apply { foo.draw(); }
    `,
      'drawn',
    );
    expect(d).toBe('m 0 0 h 10 v 10');
  });

  it('repairs bare authored commands', () => {
    expect(compilePath('H 50')).toBe('m 0 0 H 50');
    expect(compilePath('L 10 10')).toBe('m 0 0 L 10 10');
  });

  it('leaves data that already starts with a move untouched', () => {
    expect(compilePath('M 10 10 h 5')).toBe('M 10 10 h 5');
    expect(compilePath('@{ m 4 4 h 5 }.draw();')).toBe('m 4 4 h 5');
  });

  it('adds nothing to an empty layer', () => {
    const d = layerData(
      `
      define default PathLayer('sink') #{ fill: none; }
      let empty = PathLayer('empty') #{ fill: none; };
      M 0 0;
    `,
      'empty',
    );
    expect(d).toBe('');
  });
});

describe('defs content always begins with a moveto', () => {
  const DEFS_SRC = `
    define ViewBox(0, 0, 200, 200);
    define default PathLayer('p') #{ fill: #000; }
    let flat = @{ h 40 v 40 h -40 z };
    let m = Mask('m1');
    m.append(flat);
    m.append(flat.project(100, 100));
    M 10 10;
    h 50;
  `;

  it('prepends the absolute first point, not a relative move (D1)', () => {
    // Defs content has no cursor, so a relative move would have nothing to
    // resolve against — the absolute start is the only correct repair.
    const paths = defsPaths(DEFS_SRC);
    expect(paths.length).toBeGreaterThan(0);
    for (const d of paths) {
      expect(d.startsWith('M ')).toBe(true);
    }
  });

  it('places a projected append at its own coordinates', () => {
    const paths = defsPaths(DEFS_SRC);
    expect(paths[0]).toBe('M 0 0 H 40 V 40 H 0 Z');
    expect(paths[1]).toBe('M 100 100 H 140 V 140 H 100 Z');
  });

  it('leaves an already-positioned block untouched', () => {
    const paths = defsPaths(`
      define ViewBox(0, 0, 200, 200);
      define default PathLayer('p') #{ fill: #000; }
      let m = Mask('m2');
      m.append(@{ m 0 0 h 40 v 40 h -40 z });
      M 10 10;
      h 50;
    `);
    expect(paths[0]).toBe('M 0 0 H 40 V 40 H 0 Z');
  });
});

describe('the synthesized move never reaches the value', () => {
  // The guarantee that makes this safe: repairing output must not change what
  // queries, `.commands` or `:nth` see. A merged block is the case that would
  // break first, since `<<` produces no leading move.
  it('leaves d, commands, subPathCount and query indices unchanged', () => {
    const logs = compile(`
      define default PathLayer('p') #{ fill: none; }
      let foo = @{ h 10 } << @{ v 10 };
      let out = \`\${foo.d}|\${foo.commands.length}|\${foo.subPathCount}|\${foo.query('command:first').command}|\${foo.queryAll('command').length}\`;
      log(out);
      M 0 0;
    `).logs;
    const line = logs[0].parts.map((p) => String(p.value)).join(' ');
    expect(line).toBe('h 10 v 10|2|1|h|2');
  });

  it('keeps a normalized offset result free-floating as a value', () => {
    const logs = compile(`
      define default PathLayer('p') #{ fill: none; }
      let edge = @{ h 100 }.variableOffset() {|go, pb|
        go.stop(0%, 0, CurveContinuity.G1);
        go.stop(100%, 6, CurveContinuity.G1);
      };
      let out = \`\${edge.startPoint}|\${edge.commands[0].command}\`;
      log(out);
      M 0 0;
    `).logs;
    const line = logs[0].parts.map((p) => String(p.value)).join(' ');
    // startPoint stays the block's own origin and the first command is still the
    // curve — no synthesized move in the command list.
    expect(line).toBe('Point(0, 0)|c');
  });
});
