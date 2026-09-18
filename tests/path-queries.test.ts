import { describe, expect, it } from 'vitest';

import { compile } from '../src';

/**
 * Path queries — `query(sel)` / `queryAll(sel)` on PathBlock, ProjectedPath, and
 * layer receivers. Contract: docs/path-queries.md. Expected values are computed
 * from the authored geometry, never hardcoded from output.
 */

function layerData(src: string, name: string): string {
  const layer = compile(src).layers.find((l) => l.name === name);
  if (!layer) throw new Error(`no layer ${name}`);
  return layer.data;
}

/** Each log() line as a single space-joined string. */
function logLines(src: string): string[] {
  const result = compile(src);
  return result.logs.map((l) => l.parts.map((p) => String(p.value)).join(' '));
}

const SQUARE_LAYER = [
  "define PathLayer('shape') #{ stroke: #333; fill: none; }",
  "layer('shape').apply {",
  '  M 20 20;',
  '  h 80;',
  '  v 60;',
  '  h -80;',
  '  z;',
  '}',
].join('\n');

/** Tab: h 40 → arc to (50,10) → v 20 → arc to (40,40) → h -40 → z (closing line of length 40). */
const TAB_BLOCK = [
  'let tab = @{',
  '  h 40;',
  '  a 10 10 0 0 1 10 10;',
  '  v 20;',
  '  a 10 10 0 0 1 -10 10;',
  '  h -40;',
  '  z;',
  '};',
].join('\n');

const COMB_BLOCK = [
  'let comb = @{',
  '  for (i in 0..3) {',
  "    v -20 as segment('tooth');",
  "    v 20 as endpoint('root');",
  '    h 12;',
  '  }',
  '};',
].join('\n');

const FACE_BLOCK = ['let face = @{', '  circle(0, 0, 30);', '  rect(-8, -8, 16, 16);', '};'].join('\n');

/** Three squares = three subpaths; flat command indexes 0..11. */
const THREE_SQUARES = [
  "define PathLayer('grid') #{ fill: none; }",
  "layer('grid').apply {",
  '  M 0 0; h 10; v 10; z;',
  '  M 20 0; h 10; v 10; z;',
  '  M 40 0; h 10; v 10; z;',
  '}',
].join('\n');

describe('path queries: output parity', () => {
  it('queries never change emitted path data', () => {
    const plain = compile(SQUARE_LAYER);
    const queried = compile(
      `${SQUARE_LAYER}\nlet corners = layer('shape').queryAll('endpoint');\nlet arcs = layer('shape').queryAll('command(a)');`,
    );
    expect(queried.layers[0].data).toBe(plain.layers[0].data);
  });
});

describe('path queries: endpoint', () => {
  it('returns one Endpoint per drawing command, skipping the move', () => {
    const lines = logLines(
      `${SQUARE_LAYER}\nlet corners = layer('shape').queryAll('endpoint');\nlog(corners.length);\nlog(corners[0].x, corners[0].y);\nlog(corners[1].x, corners[1].y);\nlog(corners[3].x, corners[3].y);`,
    );
    // h 80 → (100,20); v 60 → (100,80); h -80 → (20,80); z → back to (20,20)
    expect(lines).toEqual(['4', '100 20', '100 80', '20 20']);
  });

  it('exposes point, command, next, turn, and isJoint', () => {
    const lines = logLines(
      `${SQUARE_LAYER}\nlet corners = layer('shape').queryAll('endpoint');\nlet first = corners[0];\nlog(first.point);\nlog(first.command.command, first.next.command);\nlog(first.turn.deg, first.isJoint);\nlet last = corners[3];\nlog(last.next.command, last.turn.deg, last.isJoint);`,
    );
    // At (100,20): east → south is a +90° turn (y down). The z endpoint wraps to the first drawing command.
    expect(lines).toEqual(['Point(100, 20)', 'h v', '90 true', 'h 90 true']);
  });

  it('open paths end with next = null and isJoint = false', () => {
    const lines = logLines(
      "let p = @{\n  h 10;\n  v 10;\n};\nlet last = p.query('endpoint:last');\nlog(last.next, last.isJoint, last.label);",
    );
    expect(lines).toEqual(['null false null']);
  });

  it('endpoint(label) finds labeled joints and query() returns the first', () => {
    const lines = logLines(
      `${COMB_BLOCK}\nlog(comb.query('endpoint(root)').point);\nlog(comb.queryAll('endpoint(root)').length);\nlog(comb.query('endpoint(root)').label);`,
    );
    expect(lines).toEqual(['Point(0, 0)', '4', 'root']);
  });

  it('endpoint corner ops behave like the legacy vertex handle', () => {
    const src =
      "let p = @{\n  h 20;\n  v 20 as endpoint('c');\n  h -20;\n};\nlet viaVertex = p.vertex('c').fillet(4);\nlet viaQuery = p.query('endpoint(c)').fillet(4);\nlog(viaVertex.d == viaQuery.d);";
    expect(logLines(src)).toEqual(['true']);
  });
});

describe('path queries: command', () => {
  it('command(a) finds every arc and exposes arc members', () => {
    const lines = logLines(
      `${TAB_BLOCK}\nlet arcs = tab.queryAll('command(a)');\nlog(arcs.length);\nlog(arcs[0].center);\nlog(arcs[0].rx, arcs[0].ry, arcs[0].sweep, arcs[0].largeArc);\nlog(arcs[0].index, arcs[0].command, arcs[0].absolute);`,
    );
    // Quarter arc (40,0)→(50,10), r=10, sweep=1: center (40,10)
    expect(lines).toEqual(['2', 'Point(40, 10)', '10 10 true false', '1 a false']);
  });

  it('projected paths answer in page coordinates', () => {
    const lines = logLines(
      `${TAB_BLOCK}\nlet placed = tab.project(30, 25);\nlet arcs = placed.queryAll('command(a)');\nlog(arcs[0].center, arcs[0].end);`,
    );
    expect(lines).toEqual(['Point(70, 35) Point(80, 35)']);
  });

  it('letters are case-insensitive and shape words expand', () => {
    const lines = logLines(
      `${TAB_BLOCK}\nlog(tab.queryAll('command(A)').length, tab.queryAll('command(arc)').length);\nlog(tab.queryAll('command(line)').length, tab.queryAll('command(close)').length);\nlog(tab.queryAll('command').length);`,
    );
    // line = h/v/l (not z): h 40, v 20, h -40 → 3
    expect(lines).toEqual(['2 2', '3 1', '6']);
  });

  it('absolute is true only for uppercase layer-authored commands', () => {
    const src =
      "define PathLayer('p') #{ fill: none; }\nlayer('p').apply {\n  M 0 0;\n  A 10 10 0 0 1 20 0;\n  a 10 10 0 0 1 20 0;\n}\nlet arcs = layer('p').queryAll('command(a)');\nlog(arcs.length, arcs[0].absolute, arcs[1].absolute);";
    expect(logLines(src)).toEqual(['2 true false']);
  });

  it('cubic and quadratic commands expose control points', () => {
    const src =
      "let p = @{\n  c 10 0 20 10 30 10;\n  q 10 10 20 0;\n};\nlet cubic = p.query('command(cubic)');\nlet quad = p.query('command(quadratic)');\nlog(cubic.cp1, cubic.cp2);\nlog(quad.cp);";
    expect(logLines(src)).toEqual(['Point(10, 0) Point(20, 10)', 'Point(40, 20)']);
  });

  it('absolute smooth curves on layers resolve their control points and length', () => {
    // S reflects the previous cp2 (20,0) about its start (20,20) → cp1 (20,40); cp2 is literally (40,0).
    const src = [
      "define PathLayer('l') #{ fill: none; }",
      "layer('l').apply {\n  M 0 0;\n  C 10 0 20 0 20 20;\n  S 40 0 60 20;\n}",
      "let smooth = layer('l').query('command(s)');",
      'log(smooth.cp1, smooth.cp2, smooth.absolute);',
      'let block = @{\n  c 10 0 20 0 20 20;\n  s 20 -20 40 0;\n};',
      "log(smooth.length == block.query('command(s)').length, smooth.length > 40);",
      "log(layer('l').queryAll('command[length>40]').length);",
    ].join('\n');
    // Only the smooth curve (chord 40, curve longer) passes; the cubic is ~33 long.
    expect(logLines(src)).toEqual(['Point(20, 40) Point(40, 0) true', 'true true', '1']);
  });

  it('labels authored in a block survive drawTo() into a layer store', () => {
    const src = [
      "let lid = @{\n  h 20 as segment('top');\n  v 10 as endpoint('c');\n};",
      "define PathLayer('l') #{ fill: none; }",
      "layer('l').apply {\n  lid.drawTo(10, 10);\n}",
      "log(layer('l').queryAll('segment(top)').length, layer('l').query('endpoint(c)').point, layer('l').segment('top').length);",
    ].join('\n');
    expect(logLines(src)).toEqual(['1 Point(30, 20) 20']);
  });

  it('a comma list keeps authoring order', () => {
    const lines = logLines(
      `${TAB_BLOCK}\nlet mixed = tab.queryAll('command(v), command(h)');\nlog(mixed.length, mixed[0].index, mixed[1].index, mixed[2].index);`,
    );
    expect(lines).toEqual(['3 0 2 4']);
  });

  it('sees geometry drawn with the one-line M x y block.draw() idiom', () => {
    const src = "define PathLayer('p') #{ fill: none; }\nlet tab = @{\n  h 20;\n  v 10;\n};\nlayer('p').apply {\n  M 0 0 tab.draw()\n}\nlog(layer('p').queryAll('command').length, layer('p').queryAll('endpoint').length, layer('p').query('call(draw)').commands.length);";
    // call(draw) is the whole one-line statement: the move plus the block's two commands.
    expect(logLines(src)).toEqual(['3 2 3']);
  });

  it('blocks from layer queries draw in place, whatever case the layer was authored in', () => {
    // A subpath run begins with the layer's own M; an uppercase L stays a relative line when drawn.
    const src = [
      "define PathLayer('l') #{ fill: none; }",
      "define PathLayer('out') #{ fill: none; }",
      "layer('l').apply {\n  M 0 50;\n  h 28;\n  z;\n  M 44 32;\n  L 90 32 as segment('e');\n  v 46;\n  z;\n}",
      "layer('out').apply {\n  layer('l').query('subpath(1)').block.draw();\n  layer('l').segment('e').draw();\n}",
    ].join('\n');
    // The run's leading M is where the block starts, not a command it carries.
    expect(layerData(src, 'out')).toBe('M 44 32 l 46 0 v 46 z M 44 32 l 46 0');
  });

  it('.commands returns the same Command struct as queryAll(command)', () => {
    const src =
      "let p = @{\n  h 20 as segment('lid');\n  v 20;\n};\nlet first = p.commands[0];\nlog(first.command, first.segment, first.end);\nlog(p.commands.length == p.queryAll('command').length);\nlet { start, end } = p.commands[1];\nlog(start, end);\nlog(Object.keys(first).length > 4);";
    expect(logLines(src)).toEqual(['h lid Point(20, 0)', 'true', 'Point(20, 0) Point(20, 20)', 'true']);
  });
});

describe('path queries: call', () => {
  it('groups commands by the statement that emitted them', () => {
    const lines = logLines(
      `${FACE_BLOCK}\nlog(face.queryAll('call').length);\nlet ring = face.query('call(circle)');\nlog(ring.name, ring.commands.length, ring.index);\nlog(face.query('call(rect)').index);\nlog(face.queryAll('call(circle) command(a)').length);`,
    );
    expect(lines).toEqual(['2', 'circle 3 0', '1', '2']);
  });

  it('a call block on a layer answers for the call alone, not the pen before it', () => {
    // circle(50, 50, 10) begins with M 40 50; the pen before it was at (0, 0), which is not the circle's.
    const src = "define PathLayer('p') #{ fill: none; }\nlayer('p').apply {\n  M 0 0;\n  h 1;\n  circle(50, 50, 10);\n}\nlet ring = layer('p').query('call(circle)');\nlet box = ring.block.boundingBox();\nlog(box.x, box.y, box.width, box.height);\nlog(ring.block.centerPoint());";
    expect(logLines(src)).toEqual(['40 40 20 20', 'Point(50, 50)']);
  });

  it('call blocks measure the emitted geometry on a layer', () => {
    // rect(0, 0, 20, 10): perimeter 60; the block is a ProjectedPath in page coordinates.
    const src =
      "define PathLayer('p') #{ fill: none; }\nlayer('p').apply {\n  rect(30, 40, 20, 10);\n}\nlet box = layer('p').query('call(rect)');\nlog(box.block.length, box.start, box.end, box.commands.length);";
    expect(logLines(src)).toEqual(['60 Point(0, 0) Point(30, 40) 5']);
  });

  it('call identity survives corner-op finalization', () => {
    const src =
      "let p = @{\n  h 20;\n  lineTo(20, 20) with fillet(5);\n  h -20;\n};\nlog(p.queryAll('call(lineTo)').length, p.queryAll('call').length);";
    expect(logLines(src)).toEqual(['1 1']);
  });

  it('call identity survives subPath() fragments on both cut commands', () => {
    // subPath(0.1, 0.6) keeps the tail of the first arc and the head of the second; both stay the circle's.
    const src = `${FACE_BLOCK}\nlet piece = face.subPath(0.1, 0.6);\nlog(piece.queryAll('call(circle)').length, piece.query('call(circle)').commands.length);`;
    expect(logLines(src)).toEqual(['1 2']);
  });

  it('literal commands are not calls', () => {
    expect(logLines("let p = @{\n  h 10;\n  v 10;\n};\nlog(p.queryAll('call').length);")).toEqual(['0']);
  });
});

describe('path queries: segment', () => {
  it('segment(label) returns Segment structs with blocks', () => {
    const lines = logLines(
      `${COMB_BLOCK}\nlet teeth = comb.queryAll('segment(tooth)');\nlog(teeth.length, teeth[0].label, teeth[0].block.length, teeth[3].index);\nlog(comb.queryAll('segment').length);`,
    );
    expect(lines).toEqual(['4 tooth 20 3', '4']);
  });

  it('descendant combinator scopes endpoints to labeled runs', () => {
    const lines = logLines(
      `${COMB_BLOCK}\nlet corners = comb.queryAll('segment(tooth) endpoint');\nlog(corners.length, corners[0].point);`,
    );
    expect(lines).toEqual(['4 Point(0, -20)']);
  });
});

describe('path queries: subpath and :nth', () => {
  it('subpath(k) and command:nth select by membership vs position', () => {
    const lines = logLines(
      `${THREE_SQUARES}\nlet g = layer('grid');\nlog(g.queryAll('subpath').length);\nlog(g.queryAll('command:nth(1..5)').length);\nlog(g.queryAll('subpath(1..2) command').length);\nlet inner = g.queryAll('subpath(1) command:nth(1..2)');\nlog(inner[0].command, inner[0].index, inner[1].command, inner[1].index);`,
    );
    expect(lines).toEqual(['3', '5', '8', 'h 5 v 6']);
  });

  it('negative indexes, half-open ranges, and lists follow the language', () => {
    const lines = logLines(
      `${THREE_SQUARES}\nlet g = layer('grid');\nlog(g.query('endpoint:nth(-1)').point);\nlog(g.queryAll('command:nth(-3..-1)').length, g.queryAll('command:nth(0..<3)').length);\nlet picked = g.queryAll('subpath(0, 2)');\nlog(picked[0].index, picked[1].index);\nlog(g.query('subpath(-1)').index, g.query('subpath(-1)').closed);`,
    );
    // last endpoint: the third square's z lands on its start (40,0)
    expect(lines).toEqual(['Point(40, 0)', '3 3', '0 2', '2 true']);
  });

  it('a subpath starts after z when drawing continues without a move', () => {
    const src =
      "let p = @{\n  h 10;\n  v 10;\n  z;\n  h 10;\n  v 10;\n};\nlet subs = p.queryAll('subpath');\nlog(subs.length, subs[0].closed, subs[1].closed, p.subPathCount);\nlog(subs[1].commands.length, subs[1].start);";
    expect(logLines(src)).toEqual(['2 true false 2', '2 Point(0, 0)']);
  });

  it('.contours follows the same rule for open runs', () => {
    expect(logLines('let p = @{\n  m 0 0;\n  h 10;\n  m 20 0;\n  h 10;\n};\nlog(p.contours.length);')).toEqual(['2']);
  });
});

describe('path queries: filters', () => {
  it('compares scalar properties', () => {
    const lines = logLines(
      `${TAB_BLOCK}\nlog(tab.queryAll('command(line)[length>30]').length);\nlog(tab.queryAll('command(a)[sweep=true]').length);\nlog(tab.queryAll('command[index>=4]').length);\nlog(tab.queryAll('command[y=40]').length);`,
    );
    // lines: h 40, v 20, h -40 → two over 30; y=40: second arc, h -40 (end y 40) → 2
    expect(lines).toEqual(['2', '2', '2', '2']);
  });

  it('presence filters and label filters', () => {
    const lines = logLines(
      `${COMB_BLOCK}\nlog(comb.queryAll('endpoint[label]').length, comb.queryAll('command[label]').length);\nlog(comb.queryAll('command[label=tooth]').length);`,
    );
    // v -20 (segment tooth) and v 20 (endpoint root) both carry a label: 8 of 12 commands
    expect(lines).toEqual(['4 8', '4']);
  });

  it('multi-command matches pass when any member passes', () => {
    const lines = logLines(
      `${FACE_BLOCK}\nlog(face.queryAll('call[rx]').length, face.queryAll('call[length>50]').length);`,
    );
    // only the circle has arcs; its arcs are ~94 long each, the rect edges are 16
    expect(lines).toEqual(['1 1']);
  });

  it('interpolated values work inside the selector string', () => {
    const lines = logLines(
      `${TAB_BLOCK}\nlet minimum = 30;\nlog(tab.queryAll(\`command(line)[length>\${minimum}]\`).length);`,
    );
    expect(lines).toEqual(['2']);
  });
});

describe('path queries: errors', () => {
  it('query() errors on no match and lists what the path has', () => {
    expect(() => compile(`${COMB_BLOCK}\nlet s = comb.query('segment(nope)');`)).toThrow(
      /No match.*segment\(nope\).*'tooth'/s,
    );
    expect(() => compile(`${COMB_BLOCK}\nlet e = comb.query('endpoint(nope)');`)).toThrow(/No match.*'root'/s);
    expect(() => compile(`${TAB_BLOCK}\nlet c = tab.query('command(c)');`)).toThrow(/No match.*commands: h, a, v, z/s);
    expect(() => compile(`${TAB_BLOCK}\nlet c = tab.query('call(circle)');`)).toThrow(/No match.*calls: \(none\)/s);
    expect(() => compile(`${TAB_BLOCK}\nlet s = tab.query('subpath(3)');`)).toThrow(/No match.*1 subpath/s);
  });

  it('queryAll() returns an empty array on no match', () => {
    expect(
      logLines(`${TAB_BLOCK}\nlog(tab.queryAll('segment(nope)').length, tab.queryAll('call(circle)').length);`),
    ).toEqual(['0 0']);
  });

  it('rejects unknown nouns, mixed lists, legacy pseudos, and bad filters', () => {
    expect(() => compile(`${TAB_BLOCK}\nlet v = tab.query('vertex(a)');`)).toThrow(
      /Unknown noun 'vertex'.*command, call, endpoint, segment, subpath/s,
    );
    expect(() => compile(`${TAB_BLOCK}\nlet m = tab.queryAll('command(a), endpoint');`)).toThrow(/mixes nouns/);
    expect(() => compile(`${TAB_BLOCK}\nlet m = tab.queryAll('command:atomic');`)).toThrow(/:atomic.*segmentAll/s);
    expect(() => compile(`${TAB_BLOCK}\nlet m = tab.queryAll('command[bogus]');`)).toThrow(/Unknown filter 'bogus'/);
    expect(() => compile(`${TAB_BLOCK}\nlet m = tab.queryAll('command(w)');`)).toThrow(/Unknown command kind 'w'/);
    expect(() => compile(`${TAB_BLOCK}\nlet m = tab.queryAll('command:nth(a)');`)).toThrow(/index/i);
    expect(() => compile(`${TAB_BLOCK}\nlet m = tab.queryAll('command(*, a)');`)).toThrow(/'\*' selects every command/);
    expect(logLines(`${TAB_BLOCK}\nlog(tab.queryAll('command()').length, tab.queryAll('command(*)').length);`)).toEqual(
      ['6 6'],
    );
  });

  it('kind-specific members error on the wrong kind', () => {
    expect(() => compile(`${TAB_BLOCK}\nlog(tab.query('command(h)').rx);`)).toThrow(/rx.*Command/);
  });

  it('query is only available on PathLayer references', () => {
    expect(() => compile("define TextLayer('t') #{ font-size: 12; }\nlet q = layer('t').queryAll('command');")).toThrow(
      /PathLayer/,
    );
  });
});

describe('path queries: display', () => {
  it('logs structs recognizably', () => {
    const lines = logLines(
      `${COMB_BLOCK}\nlog(comb.query('command'));\nlog(comb.query('endpoint(root)'));\nlog(comb.query('segment(tooth)'));\nlog(comb.query('subpath'));`,
    );
    expect(lines[0]).toMatch(/^Command\(v -20/);
    expect(lines[1]).toMatch(/^Endpoint\('root' at 0, 0\)/);
    expect(lines[2]).toMatch(/^Segment\('tooth'/);
    expect(lines[3]).toMatch(/^Subpath\(0/);
  });
});

describe('labels travel with a drawn block', () => {
  const block =
    "let bar = @{\n  l 40 0 as segment('crank'), endpoint('A')\n  l 0 40 as segment('coupler'), endpoint('B')\n  z as segment('ground'), endpoint('O2')\n};\n";
  const ask =
    "log(layer('p').queryAll('endpoint').map {|e| e.label }, layer('p').queryAll('segment').map {|seg| seg.label }, layer('p').segment('crank').commands.length);";

  it('through the one-line M x y block.draw() idiom', () => {
    const src = `define PathLayer('p') #{ fill: none; }\n${block}layer('p').apply {\n  M 10 10 bar.draw()\n}\n${ask}`;
    expect(logLines(src)).toEqual(['[A, B, O2] [crank, coupler, ground] 1']);
  });

  it('through draw() on its own line', () => {
    const src = `define PathLayer('p') #{ fill: none; }\n${block}layer('p').apply {\n  M 10 10\n  bar.draw();\n}\n${ask}`;
    expect(logLines(src)).toEqual(['[A, B, O2] [crank, coupler, ground] 1']);
  });

  it('through drawTo()', () => {
    const src = `define PathLayer('p') #{ fill: none; }\n${block}layer('p').apply {\n  bar.drawTo(10, 10);\n}\n${ask}`;
    expect(logLines(src)).toEqual(['[A, B, O2] [crank, coupler, ground] 1']);
  });

  it('delivers a drawn block\'s labelled endpoint to a subscription', () => {
    const src = `define PathLayer('p') #{ fill: none; }\n${block}layer('p').subscribe('endpoint(A)') {|pivot| log(pivot.label, pivot.x, pivot.y); };\nlayer('p').apply {\n  M 10 10 bar.draw()\n}`;
    expect(logLines(src)).toEqual(['A 50 10']);
  });

  it('keeps labels independently when one block is drawn into two layers', () => {
    const src = `define PathLayer('p') #{ fill: none; }\ndefine PathLayer('q') #{ fill: none; }\n${block}layer('p').apply {\n  M 10 10 bar.draw()\n}\nlayer('q').apply {\n  M 10 30 bar.draw()\n}\nlog(layer('p').query('endpoint(B)').y, layer('q').query('endpoint(B)').y, layer('q').queryAll('segment').length);`;
    expect(logLines(src)).toEqual(['50 70 3']);
  });

  it('keeps the label of a queried segment drawn into another layer by the one-line idiom', () => {
    const src = [
      "define PathLayer('l') #{ fill: none; }",
      "define PathLayer('out') #{ fill: none; }",
      "layer('l').apply {\n  M 0 0;\n  h 28 as segment('e');\n  v 10;\n}",
      "let edge = layer('l').segment('e');",
      "layer('out').apply {\n  M 5 5 edge.draw()\n}",
      "log(layer('out').segment('e').commands.length, layer('out').queryAll('endpoint').length);",
    ].join('\n');
    expect(logLines(src)).toEqual(['1 1']);
  });

  it('keeps labels on a filleted block without applying the fillet twice', () => {
    const src = [
      "define PathLayer('p') #{ fill: none; }",
      "let tab = @{\n  h 40\n  v 40 with fillet(8) as endpoint('c')\n  h -40\n  z\n};",
      "layer('p').apply {\n  M 10 10 tab.draw()\n}",
      // one extra command in the layer: the M; the fillet arc was inserted once, when the block closed
      "log(layer('p').queryAll('command').length - tab.commands.length, layer('p').query('endpoint(c)').label);",
    ].join('\n');
    expect(logLines(src)).toEqual(['1 c']);
  });
});

describe('headings on Command and Endpoint', () => {
  const corner = "define PathLayer('p') #{ fill: none; }\nlayer('p').apply {\n  M 0 0\n  h 40\n  v 40\n}\n";

  it('reports arriving, leaving, outward and turn at a right-angle joint', () => {
    // At (40, 0): arrived heading east (0°), leaves heading south (90°), turn +90°, outward = 0 + 45 − 90.
    const src = `${corner}let j = layer('p').query('endpoint:nth(0)');\nlog(round(j.arriving.deg), round(j.leaving.deg), round(j.outward.deg), round(j.turn.deg));`;
    expect(logLines(src)).toEqual(['0 90 -45 90']);
  });

  it('at an open end leaving is null and outward is the arriving heading', () => {
    const src = `${corner}let e = layer('p').query('endpoint:nth(1)');\nlog(round(e.arriving.deg), e.leaving, round(e.outward.deg));`;
    expect(logLines(src)).toEqual(['90 null 90']);
  });

  it('outward at a straight joint is the side normal(t) picks', () => {
    const src = "define PathLayer('p') #{ fill: none; }\nlayer('p').apply {\n  M 0 0\n  h 20\n  h 20\n}\nlet j = layer('p').query('endpoint:nth(0)');\nlet bar = @{\n  h 40\n};\nlog(round(j.outward.deg), round(deg(bar.normal(0.5).angle)));";
    expect(logLines(src)).toEqual(['-90 -90']);
  });

  it('startHeading and endHeading differ on an arc and agree on a line', () => {
    const src = "define PathLayer('p') #{ fill: none; }\nlayer('p').apply {\n  M 0 0\n  a 20 20 0 0 1 20 20\n  l 10 0\n}\nlet arc = layer('p').query('command(a)');\nlet line = layer('p').query('command(l)');\nlog(round(arc.startHeading.deg), round(arc.endHeading.deg), round(line.startHeading.deg), round(line.endHeading.deg));";
    expect(logLines(src)).toEqual(['0 90 0 0']);
  });

  it('headings are Angle values that take part in angle arithmetic', () => {
    const src = `${corner}let j = layer('p').query('endpoint:nth(0)');\nlet back = j.arriving + 180deg;\nlog(round(back.deg), (j.outward).rad < 0);`;
    expect(logLines(src)).toEqual(['180 true']);
  });
});

describe(':nth with an interpolated array', () => {
  const lines = "define PathLayer('p') #{ fill: none; }\nlayer('p').apply {\n  M 0 0\n  for (i in 1..6) {\n    L calc(i * 10) 0\n  }\n}\n";

  it('accepts the brackets an interpolated array produces', () => {
    const src = `${lines}let picks = [1, 3, 5];\nlog(layer('p').queryAll(\`command(line):nth(\${picks})\`).map {|cmd| cmd.end.x });`;
    expect(logLines(src)).toEqual(['[20, 40, 60]']);
  });

  it('accepts a literal bracketed list and ranges inside it', () => {
    const src = `${lines}log(layer('p').queryAll('command(line):nth([0, 2..3])').map {|cmd| cmd.end.x });`;
    expect(logLines(src)).toEqual(['[10, 30, 40]']);
  });

  it('still rejects an empty list', () => {
    expect(() => compile(`${lines}layer('p').queryAll('command(line):nth([])');`)).toThrow(/Empty index list/);
  });
});

describe('zero-length commands are not endpoints', () => {
  const src = "define PathLayer('p') #{ fill: none; }\nlayer('p').apply {\n  M 0 0\n  l 10 10\n  l 0 0\n  v 40\n}\n";

  it('skips a zero-length line, so turn and the headings describe real strokes', () => {
    const q = `${src}let j = layer('p').query('endpoint:nth(0)');\nlog(layer('p').queryAll('endpoint').length, round(j.arriving.deg), round(j.leaving.deg), round(j.turn.deg), toFixed(j.outward, 1, 'deg'), j.next.command);`;
    expect(logLines(q)).toEqual(['2 45 90 45 -22.5 v']);
  });

  it('still lists the zero-length command under command()', () => {
    expect(logLines(`${src}log(layer('p').queryAll('command(l)').length);`)).toEqual(['2']);
  });

  it('skips an arc back to its own start but keeps a curve that loops', () => {
    const arc = "define PathLayer('p') #{ fill: none; }\nlayer('p').apply {\n  M 0 0\n  h 10\n  a 5 5 0 1 1 0 0\n  v 10\n}\nlog(layer('p').queryAll('endpoint').length);";
    expect(logLines(arc)).toEqual(['2']);
    const loop = "define PathLayer('p') #{ fill: none; }\nlayer('p').apply {\n  M 0 0\n  h 10\n  c 10 -10 10 10 0 0\n  v 10\n}\nlog(layer('p').queryAll('endpoint').length);";
    expect(logLines(loop)).toEqual(['3']);
  });
});
