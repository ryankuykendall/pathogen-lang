import { describe, expect, it } from 'vitest';

import { compile } from '../src';

/**
 * Subscriptions — `layer.subscribe(selector) {|match, i, sub| ... }`.
 * Contract: docs/subscriptions.md. Callbacks run at program end over the
 * subscription's window; output is compared against the hand-written loop.
 */

function logLines(src: string): string[] {
  return compile(src).logs.map((l) => l.parts.map((p) => String(p.value)).join(' '));
}

function layerData(src: string, name: string): string {
  const layer = compile(src).layers.find((l) => l.name === name);
  if (!layer) throw new Error(`no layer ${name}`);
  return layer.data;
}

/** Number of circle() calls in a path layer: each starts with an M. */
function moves(d: string): number {
  return (d.match(/(^|\s)M\s/g) ?? []).length;
}

const HEAD = [
  "define PathLayer('shape') #{ stroke: #333; fill: none; }",
  "define PathLayer('dots') #{ fill: #d33; stroke: none; }",
].join('\n');
const SQUARE = "layer('shape').apply {\n  M 20 20;\n  h 80;\n  v 60;\n  h -80;\n  z;\n}";
const DOT = "layer('dots').apply {\n    circle(corner.x, corner.y, 3);\n  }";

describe('subscriptions: basics', () => {
  it('draws exactly what the hand-written query loop draws, and leaves the source untouched', () => {
    const subscribed = `${HEAD}\nlayer('shape').subscribe('endpoint') {|corner|\n  ${DOT}\n};\n${SQUARE}`;
    const looped = `${HEAD}\n${SQUARE}\nfor (corner in layer('shape').queryAll('endpoint')) {\n  ${DOT}\n}`;
    expect(layerData(subscribed, 'dots')).toBe(layerData(looped, 'dots'));
    expect(moves(layerData(subscribed, 'dots'))).toBe(4);
    expect(layerData(subscribed, 'shape')).toBe(layerData(`${HEAD}\n${SQUARE}`, 'shape'));
  });

  it('passes the match, its ordinal, and the subscription', () => {
    const src = `${HEAD}\nlayer('shape').subscribe('endpoint') {|corner, i, sub|\n  log(i, sub.count, sub.active, sub.source, sub.selector, corner.point);\n};\n${SQUARE}`;
    expect(logLines(src)).toEqual([
      '0 1 true shape endpoint Point(100, 20)',
      '1 2 true shape endpoint Point(100, 80)',
      '2 3 true shape endpoint Point(20, 80)',
      '3 4 true shape endpoint Point(20, 20)',
    ]);
  });

  it('accepts a << worker defined elsewhere and hands structs by noun', () => {
    const src = `${HEAD}\nlet mark = {|arc| layer('dots').apply { circle(arc.center.x, arc.center.y, 1); } };\nlayer('shape').subscribe('command(a)') << mark;\nlayer('shape').apply {\n  M 0 0;\n  a 10 10 0 0 1 10 10;\n  a 10 10 0 0 1 10 10;\n}`;
    expect(moves(layerData(src, 'dots'))).toBe(2);
  });

  it('runs at program end: callbacks see the finished, finalized source', () => {
    const src = `${HEAD}\nlayer('shape').subscribe('command(line):first') {|edge|\n  log(edge.end, layer('shape').queryAll('endpoint').length);\n};\nlayer('shape').apply {\n  M 20 20;\n  h 80;\n  v 60 with fillet(10);\n  h -80;\n  z;\n}`;
    // The fillet trims the first edge to 70 units (re-emitted as l); every corner already exists when the callback runs.
    expect(logLines(src)).toEqual(['Point(90, 20) 5']);
  });

  it('delivers the arcs that corner operations insert', () => {
    const src = `${HEAD}\nlayer('shape').subscribe('command(a)') {|arc| log(arc.center); };\nlayer('shape').apply {\n  M 20 20;\n  h 80;\n  v 60 with fillet(10);\n  h -80;\n  z;\n}`;
    expect(logLines(src)).toEqual(['Point(90, 30)']);
  });

  it('variables read inside a callback hold their final values (documented)', () => {
    const src = `${HEAD}\nlet radius = 3;\nlayer('shape').subscribe('endpoint:first') {|corner| log(radius); };\n${SQUARE}\nradius = 9;`;
    expect(logLines(src)).toEqual(['9']);
  });

  it('bare path commands in a callback go to the default layer', () => {
    const src = `${HEAD}\ndefine default PathLayer('main') #{ fill: none; }\nlayer('shape').subscribe('endpoint') {|corner|\n  M corner.x corner.y;\n  h 2;\n};\n${SQUARE}`;
    expect(layerData(src, 'main')).toBe('M 100 20 h 2 M 100 80 h 2 M 20 80 h 2 M 20 20 h 2');
  });

  it('can target text layers', () => {
    const src = `${HEAD}\ndefine TextLayer('labels') #{ font-size: 8; }\nlayer('shape').subscribe('endpoint') {|corner, i|\n  layer('labels').apply {\n    text(corner.x, corner.y)\`\${i}\`\n  }\n};\n${SQUARE}`;
    const labels = compile(src).layers.find((l) => l.name === 'labels');
    expect(labels?.textElements?.length).toBe(4);
    expect(labels?.textElements?.[3]).toMatchObject({ x: 20, y: 20 });
  });
});

describe('subscriptions: windows', () => {
  it('unsubscribe() at top level closes the window', () => {
    const src = `${HEAD}\nlet corners = layer('shape').subscribe('endpoint') {|corner| ${DOT} };\nlayer('shape').apply {\n  M 20 20; h 40; v 20; h -40; z;\n}\ncorners.unsubscribe();\nlog(corners.active);\nlayer('shape').apply {\n  M 70 20; h 40; v 20; h -40; z;\n}`;
    expect(moves(layerData(src, 'dots'))).toBe(4);
    expect(logLines(src)).toEqual(['false']);
  });

  it('a late subscription only sees later drawing', () => {
    const src = `${HEAD}\nlayer('shape').apply {\n  M 20 20; h 40; v 20; h -40; z;\n}\nlayer('shape').subscribe('endpoint') {|corner| ${DOT} };\nlayer('shape').apply {\n  M 70 20; h 40; v 20; h -40; z;\n}`;
    const d = layerData(src, 'dots');
    expect(moves(d)).toBe(4);
    expect(d.startsWith('M 107 20')).toBe(true); // first corner of the second square, radius 3
  });

  it(':last and negative :nth resolve against the whole window before anything fires', () => {
    const last = `${HEAD}\nlayer('shape').subscribe('endpoint:last') {|corner| ${DOT} };\n${SQUARE}`;
    expect(layerData(last, 'dots').startsWith('M 17 20')).toBe(true);
    expect(moves(layerData(last, 'dots'))).toBe(1);
    const lastThree = `${HEAD}\nlayer('shape').subscribe('endpoint:nth(-3..-1)') {|corner| ${DOT} };\n${SQUARE}`;
    expect(moves(layerData(lastThree, 'dots'))).toBe(3);
  });

  it('unsubscribe() inside the callback cancels the remaining matches', () => {
    const src = `${HEAD}\nlayer('shape').subscribe('endpoint') {|corner, i, sub|\n  ${DOT}\n  if (i >= 1) {\n    sub.unsubscribe();\n  }\n};\n${SQUARE}`;
    expect(moves(layerData(src, 'dots'))).toBe(2);
  });

  it('replays the global queue in program order across subscriptions', () => {
    const src = [
      "define PathLayer('a') #{ fill: none; }",
      "define PathLayer('b') #{ fill: none; }",
      "layer('b').subscribe('endpoint') {|e| log('b', e.index); };",
      "layer('a').subscribe('endpoint') {|e| log('a', e.index); };",
      "layer('a').apply {\n  M 0 0;\n  h 10;\n}",
      "layer('b').apply {\n  M 0 0;\n  h 10;\n}",
      "layer('a').apply {\n  h 10;\n}",
    ].join('\n');
    expect(logLines(src)).toEqual(['a 0', 'b 0', 'a 1']);
  });
});

describe('subscriptions: chains and errors', () => {
  it('annotations can be annotated: a second round fires for targets with subscriptions', () => {
    const src = `${HEAD}\ndefine PathLayer('rings') #{ fill: none; }\nlayer('shape').subscribe('endpoint') {|corner| ${DOT} };\nlayer('dots').subscribe('call(circle)') {|dot|\n  layer('rings').apply { circle(dot.start.x, dot.start.y, 6); }\n};\n${SQUARE}`;
    expect(moves(layerData(src, 'dots'))).toBe(4);
    expect(moves(layerData(src, 'rings'))).toBe(4);
  });

  it('a cycle stops after eight rounds and names the chain', () => {
    const src = [
      "define PathLayer('a') #{ fill: none; }",
      "define PathLayer('b') #{ fill: none; }",
      "layer('a').subscribe('endpoint') {|e| layer('b').apply { M e.x e.y; h 1; } };",
      "layer('b').subscribe('endpoint') {|e| layer('a').apply { M e.x e.y; v 1; } };",
      "layer('a').apply {\n  M 0 0;\n  h 10;\n}",
    ].join('\n');
    expect(() => compile(src)).toThrow(/fed each other for 8 rounds: a → b → a/);
  });

  it('drawing into the subscribed layer from its own callback is an immediate error', () => {
    const src = `${HEAD}\nlayer('shape').subscribe('endpoint') {|corner|\n  layer('shape').apply { M corner.x corner.y; h 1; }\n};\n${SQUARE}`;
    expect(() => compile(src)).toThrow(/Subscription on 'shape' drew into 'shape' from its own callback/);
  });

  it('reports selector errors at the subscribe line and callback errors with the triggering statement', () => {
    expect(() => compile(`${HEAD}\nlayer('shape').subscribe('vertex(a)') {|v| log(v); };\n${SQUARE}`)).toThrow(
      /Line 3.*Unknown noun 'vertex'/s,
    );
    const failing = `${HEAD}\nlayer('shape').subscribe('endpoint') {|corner, i|\n  assert(i < 2, 'too many');\n};\n${SQUARE}`;
    expect(() => compile(failing)).toThrow(
      /^Line 4(, col \d+)?: Error in subscription on 'shape', match 3 \(statement at line 10, subscribed at line 3\): assertion failed/,
    );
  });

  it('only path layers can be subscribed to', () => {
    expect(() =>
      compile("define TextLayer('t') #{ font-size: 10; }\nlayer('t').subscribe('endpoint') {|e| log(e); };"),
    ).toThrow(/PathLayer/);
  });

  it('rejects group layers too', () => {
    expect(() =>
      compile("define GroupLayer('g') #{ opacity: 1; }\nlayer('g').subscribe('endpoint') {|e| log(e); };"),
    ).toThrow(/PathLayer/);
  });

  it('accepts a named fn as the << worker', () => {
    const src = `${HEAD}\nfn mark(corner) {\n  layer('dots').apply { circle(corner.x, corner.y, 3); }\n}\nlayer('shape').subscribe('endpoint') << mark;\n${SQUARE}`;
    expect(moves(layerData(src, 'dots'))).toBe(4);
  });

  it('subscriptions created in a loop capture their own iteration', () => {
    const src = `${HEAD}\nfor (k in 0..1) {\n  layer('shape').subscribe(\`endpoint:nth(\${k})\`) {|corner| log(k, corner.index); };\n}\n${SQUARE}`;
    expect(logLines(src)).toEqual(['0 0', '1 1']);
  });

  it('a cycle report names the loop even when the source also feeds a dead end', () => {
    const src = [
      "define PathLayer('a') #{ fill: none; }",
      "define PathLayer('b') #{ fill: none; }",
      "define PathLayer('c') #{ fill: none; }",
      "layer('a').subscribe('endpoint') {|e| layer('c').apply { M e.x e.y; h 1; } layer('b').apply { M e.x e.y; h 1; } };",
      "layer('b').subscribe('endpoint') {|e| layer('a').apply { M e.x e.y; v 1; } };",
      "layer('a').apply {\n  M 0 0;\n  h 10;\n}",
    ].join('\n');
    expect(() => compile(src)).toThrow(/8 rounds: a → b → a/);
  });

  it('logs the handle recognizably', () => {
    const src = `${HEAD}\nlet corners = layer('shape').subscribe('endpoint') {|corner| ${DOT} };\nlog(corners);\n${SQUARE}`;
    expect(logLines(src)).toEqual(["Subscription(shape: 'endpoint', 0 delivered)"]);
  });
});

/**
 * The motivating case for variableOffset on a ProjectedPath: a callback builds
 * new geometry from what a layer drew. `match.block` is projected, so the offset
 * comes back registered on the match and `draw()` needs no `M`.
 * Contract: docs/subscriptions.md "Where the drawing goes".
 */
describe('subscriptions — building geometry from match.block', () => {
  const PROGRAM = `
    define default PathLayer('sink') #{ fill: none; }
    let shape = PathLayer('shape') #{ fill: none; };
    let casing = PathLayer('casing') #{ fill: none; };

    shape.subscribe('command[length>0]') {|match, i, sub|
      let edge = match.block.variableOffset() {|go, pb|
        go.stop(0%, 0, CurveContinuity.G1);
        go.stop(50%, 6, CurveContinuity.G2);
        go.stop(100%, 0, CurveContinuity.G1);
      };
      casing.apply {
        edge.draw();
      }
    };

    shape.apply {
      M 100 100;
      L 200 100;
      L 200 200;
    }
  `;

  it('offsets every matched command without Unknown ProjectedPath method', () => {
    const d = layerData(PROGRAM, 'casing');
    expect(d).not.toBe('');
    // One offset per drawing command; the leading move is filtered out.
    expect(moves(d)).toBe(2);
  });

  it('lands each offset on the command it came from', () => {
    // The first matched command runs east from (100,100); its offset starts at
    // that same point, because a stop at 0% with offset 0 sits on the spine.
    const d = layerData(PROGRAM, 'casing');
    expect(d).toMatch(/^M 100 100\b/);
  });

  it('a bare command selector now names the leading move as the problem', () => {
    const withMove = PROGRAM.replace("'command[length>0]'", "'command'");
    expect(() => layerData(withMove, 'casing')).toThrow(/arc length/);
  });

  it('a layer created inside the callback still reaches the output', () => {
    const src = `
      define default PathLayer('sink') #{ fill: none; }
      let shape = PathLayer('shape') #{ fill: none; };
      shape.subscribe('command[length>0]') {|match, i, sub|
        let born = PathLayer(\`born-\${i}\`) #{ fill: none; };
        born.apply {
          match.block.draw();
        }
      };
      shape.apply {
        M 10 10;
        L 40 10;
      }
    `;
    expect(layerData(src, 'born-0')).toContain('M 10 10');
  });
});

/**
 * A layer transform moves the rendered picture, not the geometry the compiler
 * holds, so a subscription match is in the SOURCE layer's own coordinates.
 * Drawing it into a layer whose transform differs puts the annotation where the
 * geometry is not — measured at 100,50 off in the audit's repro.
 *
 * The check compares EFFECTIVE transforms (composed with any groups the layers
 * sit in), so equal transforms on both sides stay silent: they move together.
 *
 * Audit: project-docs/placement-audit/D2-layer-transform-queries.md, option D.
 * Note the layer and parameter names: single letters like a/c/s/q are path
 * commands and cannot be identifiers in path-argument position.
 */
describe('subscriptions across a layer-transform boundary', () => {
  function transformWarnings(src: string): string[] {
    return compile(src)
      .warnings.filter((w) => w.code === 'layer-transform')
      .map((w) => w.message);
  }

  const wiring = `
    src.subscribe('endpoint') {|pt, i, sub| dst.apply { circle(pt.x, pt.y, 2); } };
    src.apply { M 10 10; L 60 10; }
  `;

  it('warns when the source is transformed and the target is not', () => {
    const w = transformWarnings(`
      define default PathLayer('sink') #{ fill: none; }
      let src = PathLayer('src') #{ fill: none; translate-x: 100; translate-y: 50; };
      let dst = PathLayer('dst') #{ fill: #c00; };
      ${wiring}
    `);
    expect(w).toHaveLength(1);
    expect(w[0]).toContain("Subscription on 'src' drew into 'dst'");
    expect(w[0]).toContain('translate(100, 50) vs none');
  });

  it('stays silent when neither layer is transformed', () => {
    expect(
      transformWarnings(`
        define default PathLayer('sink') #{ fill: none; }
        let src = PathLayer('src') #{ fill: none; };
        let dst = PathLayer('dst') #{ fill: #c00; };
        ${wiring}
      `),
    ).toEqual([]);
  });

  it('stays silent when both carry the same transform', () => {
    expect(
      transformWarnings(`
        define default PathLayer('sink') #{ fill: none; }
        let src = PathLayer('src') #{ fill: none; translate-x: 100; };
        let dst = PathLayer('dst') #{ fill: #c00; translate-x: 100; };
        ${wiring}
      `),
    ).toEqual([]);
  });

  it('stays silent when both sit in the same transformed group', () => {
    // Effective transforms, not own transforms: neither layer declares one.
    expect(
      transformWarnings(`
        define default PathLayer('sink') #{ fill: none; }
        let grp = GroupLayer('grp') #{ translate-x: 200; };
        let src = PathLayer('src') #{ fill: none; };
        let dst = PathLayer('dst') #{ fill: #c00; };
        grp.append(src);
        grp.append(dst);
        ${wiring}
      `),
    ).toEqual([]);
  });

  it('warns when only the source sits in a transformed group', () => {
    const w = transformWarnings(`
      define default PathLayer('sink') #{ fill: none; }
      let grp = GroupLayer('grp') #{ translate-x: 200; };
      let src = PathLayer('src') #{ fill: none; };
      let dst = PathLayer('dst') #{ fill: #c00; };
      grp.append(src);
      ${wiring}
    `);
    expect(w).toHaveLength(1);
    expect(w[0]).toContain('translate(200, 0) vs none');
  });

  it('warns once per layer pair, not once per match', () => {
    const w = transformWarnings(`
      define default PathLayer('sink') #{ fill: none; }
      let src = PathLayer('src') #{ fill: none; translate-x: 100; };
      let dst = PathLayer('dst') #{ fill: #c00; };
      src.subscribe('endpoint') {|pt, i, sub| dst.apply { circle(pt.x, pt.y, 2); } };
      src.apply { M 10 10; L 60 10; L 60 60; }
    `);
    expect(w).toHaveLength(1);
  });
});
