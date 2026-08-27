import { describe, expect, it } from 'vitest';
import { compile, compileWithContext } from '../src/index';

/**
 * Definition-site annotations: `with <cornerOp>(...)` and `as segment/endpoint(...)`.
 * Recording tests — labels never change emitted geometry; corner ops are
 * recorded here and applied at finalization (covered in later tests).
 */
describe('segment labels and corner-op suffixes: recording', () => {
  it('labels do not change emitted output (byte-equal)', () => {
    const plain = compile('M 10 10\nh 20\nv 20');
    const labeled = compile("M 10 10\nh 20 as segment('lid')\nv 20 as endpoint('corner');");
    expect(labeled.layers[0].data).toBe(plain.layers[0].data);
  });

  it('labels statement functions without changing output', () => {
    const plain = compile('circle(50, 50, 25);');
    const labeled = compile("circle(50, 50, 25) as segment('c1');");
    expect(labeled.layers[0].data).toBe(plain.layers[0].data);
  });

  it('interpolated labels evaluate per iteration without collision', () => {
    expect(() => compile('M 0 0\nfor (i in 0..3) {\n  h 10 as segment(`rib-${i}`)\n}')).not.toThrow();
  });

  it('ctx.position reflects authored geometry after an annotated command', () => {
    const result = compileWithContext("M 10 10\nh 20\nv 20 with fillet(5) as segment('west');");
    expect(result.context.position).toEqual({ x: 30, y: 30 });
  });

  it('works inside apply blocks', () => {
    const src = "let pl = PathLayer('p') ${ fill: none; };\npl.apply {\n  M 5 5\n  h 10 as segment('a')\n}";
    expect(() => compile(src)).not.toThrow();
  });

  it('works inside path blocks', () => {
    expect(() => compile("let p = @{\n  h 20 as segment('lid')\n  v 20\n};\np.drawTo(10, 10);")).not.toThrow();
  });
});

describe('segment labels and corner-op suffixes: validation errors', () => {
  it('allows duplicate labels — shared names form groups', () => {
    expect(() => compile("M 0 0\nh 10 as segment('a')\nv 10 as segment('a')")).not.toThrow();
    expect(() => compile("M 0 0\nh 10 as endpoint('e')\nv 10 as endpoint('e')")).not.toThrow();
  });

  it('allows the same label in different layers', () => {
    const src = [
      "let a = PathLayer('a') ${ fill: none; };",
      "let b = PathLayer('b') ${ fill: none; };",
      "a.apply {\n  M 0 0\n  h 10 as segment('lid')\n}",
      "b.apply {\n  M 0 0\n  h 10 as segment('lid')\n}",
    ].join('\n');
    expect(() => compile(src)).not.toThrow();
  });

  it('rejects with fillet on the first drawing command of a subpath', () => {
    expect(() => compile('M 0 0\nM 50 50\nh 10 with fillet(5)')).toThrow(/no joint to round|previous drawing command/);
  });

  it('rejects with fillet on a statement that begins a new subpath', () => {
    expect(() => compile('M 0 0\nh 10\ncircle(50, 50, 10) with fillet(5);')).toThrow(/begins a new subpath/);
  });

  it('accepts corner ops on distinct vertices', () => {
    expect(() => compile('M 0 0\nh 10\nv 10 with fillet(3)\nh -10 with fillet(4)')).not.toThrow();
  });

  it('rejects with fillet when there is no previous drawing command', () => {
    expect(() => compile('M 0 0\nh 10 with fillet(2)')).toThrow(/no joint to round/);
  });

  it('validates corner-op arity', () => {
    expect(() => compile('M 0 0\nh 10\nv 10 with fillet(1, 2)')).toThrow(/fillet\(\) in a with clause expects 1 argument/);
    expect(() => compile('M 0 0\nh 10\nv 10 with ellipticalFillet(1)')).toThrow(/ellipticalFillet\(\) in a with clause expects 2-3/);
  });

  it('validates label name types', () => {
    expect(() => compile('M 0 0\nh 10 as segment(5)')).toThrow(/label name must be a non-empty string/);
  });

  it('rejects two segment labels in one as clause', () => {
    expect(() => compile("M 0 0\nh 10 as segment('a'), segment('b')")).toThrow(/At most one segment\(\) label/);
  });
});

describe('corner-op finalization (record-then-apply)', () => {
  it('with fillet(r) produces the same output as .filletAtVertex on a path block', () => {
    const suffix = compile('let p = @{\n  h 20\n  v 20 with fillet(5)\n};\np.drawTo(10, 10);');
    const posthoc = compile('let p = @{\n  h 20\n  v 20\n};\nlet f = p.filletAtVertex(0, 5);\nf.drawTo(10, 10);');
    expect(suffix.layers[0].data).toBe(posthoc.layers[0].data);
  });

  it('with chamfer produces the same output as .chamferAtVertex on a path block', () => {
    const suffix = compile('let p = @{\n  h 20\n  v 20 with chamfer(4)\n};\np.drawTo(10, 10);');
    const posthoc = compile('let p = @{\n  h 20\n  v 20\n};\nlet c = p.chamferAtVertex(0, 4, 4);\nc.drawTo(10, 10);');
    expect(suffix.layers[0].data).toBe(posthoc.layers[0].data);
  });

  it('applies corner ops on layer paths at emit', () => {
    const plain = compile('M 10 10\nh 20\nv 20');
    const filleted = compile('M 10 10\nh 20\nv 20 with fillet(5)');
    expect(filleted.layers[0].data).not.toBe(plain.layers[0].data);
    expect(filleted.layers[0].data).toContain('a '); // fillet arc present
  });

  it('multi-subpath layers finalize only the annotated subpath and keep moves', () => {
    const src = 'M 10 10\nh 20\nv 20 with fillet(5)\nM 100 100\nh 5\nv 5';
    const result = compile(src);
    const data = result.layers[0].data;
    expect(data).toContain('a ');
    // Both subpath moves survive
    expect(data).toContain('M 10 10');
    expect(data).toContain('M 100 100');
    // Untouched second subpath keeps its raw fragments byte-exact
    expect(data).toContain('h 5 v 5');
  });

  it('zero-op programs keep byte-exact output', () => {
    const result = compile("M 10 10\nh 20 as segment('lid')\nv 20");
    expect(result.layers[0].data).toBe('M 10 10 h 20 v 20');
  });

  it('multiple ops on distinct vertices all apply', () => {
    const result = compile('M 0 0\nh 40\nv 40 with fillet(5)\nh -40 with fillet(5)');
    const arcs = (result.layers[0].data.match(/a /g) ?? []).length;
    expect(arcs).toBe(2);
  });

  it('closed paths with a corner-op finalize correctly', () => {
    const result = compile('M 10 10\nh 30\nv 30 with fillet(6)\nh -30\nz');
    expect(result.layers[0].data).toContain('a ');
    expect(result.layers[0].data.trim().toLowerCase().endsWith('z')).toBe(true);
  });

  it('collinear curve junctions no-op, matching existing fillet semantics', () => {
    // The cubic ends heading due south and v continues south — tangent-collinear,
    // so the fillet machinery skips it (same behavior as .filletAtVertex today).
    const plain = compile('M 0 0\nc 10 0 20 10 20 20\nv 20');
    const suffixed = compile('M 0 0\nc 10 0 20 10 20 20\nv 20 with fillet(5)');
    expect(suffixed.layers[0].data).toBe(plain.layers[0].data);
  });

  it('with clauses inside user functions finalize in the emitted segment', () => {
    const src = 'fn corner() {\n  h 20\n  v 20 with fillet(5)\n}\nM 10 10\ncorner();';
    const result = compile(src);
    expect(result.layers[0].data).toContain('a ');
  });

  it('annotated mode rejects with clauses honestly', async () => {
    const { compileAnnotated } = await import('../src/index');
    expect(() => compileAnnotated('M 0 0\nh 10\nv 10 with fillet(3)')).toThrow(/not supported in --annotated/);
  });

  it('annotated mode accepts labels (emit-neutral, silently ignored)', async () => {
    const { compileAnnotated } = await import('../src/index');
    expect(() => compileAnnotated("M 0 0\nh 10 as segment('lid')")).not.toThrow();
  });

  it('rejects with/as clauses on assignments', () => {
    expect(() => compile("let x = 5;\nx = 10 as segment('foo');")).toThrow(/only allowed on path commands/);
  });

  it('preserves z labels through corner-op finalization on closed paths', () => {
    // The op on v triggers finalization; the z carries an endpoint label whose
    // meta must survive the pop-and-reclose inside the corner-op appliers.
    expect(() =>
      compile("M 10 10\nh 30\nv 30 with fillet(6)\nh -30\nz as endpoint('home')"),
    ).not.toThrow();
  });

  it('labels survive projection', () => {
    // project() rebuilds commands with an origin offset; meta must ride along.
    expect(() => compile("let p = @{\n  h 20 as segment('lid')\n  v 20\n};\nlet proj = p.project(10, 10);\nproj.drawTo(50, 50);")).not.toThrow();
  });
});

describe('name-based query APIs (segment / point / vertex)', () => {
  it('segment() returns a rebased sub-PathBlock with working geometry APIs', () => {
    const src = [
      "let p = @{",
      "  h 40 as segment('lid')",
      "  v 40",
      "};",
      "let lid = p.segment('lid');",
      "lid.drawTo(10, 10);",
    ].join('\n');
    const result = compile(src);
    expect(result.layers[0].data).toBe('M 10 10 h 40');
  });

  it('point() returns the labeled vertex as a Point usable in commands', () => {
    const result = compile("let p = @{\n  h 40 as endpoint('east')\n  v 40\n};\nlet e = p.point('east');\nM e.x e.y\nh 5");
    expect(result.layers[0].data).toBe('M 40 0 h 5');
  });

  it('vertex().fillet(r) matches filletAtVertex on the same corner', () => {
    const byName = compile("let p = @{\n  h 20\n  v 20 as endpoint('c')\n  h -20\n};\nlet f = p.vertex('c').fillet(5);\nf.drawTo(10, 10);");
    const byIndex = compile('let p = @{\n  h 20\n  v 20\n  h -20\n};\nlet f = p.filletAtVertex(1, 5);\nf.drawTo(10, 10);');
    expect(byName.layers[0].data).toBe(byIndex.layers[0].data);
  });

  it('point() answers the authored sharp corner even after a fillet trims it', () => {
    // 'c' labels the end of the h edge — the very corner the fillet rounds away.
    const result = compile("let p = @{\n  h 20 as endpoint('c')\n  v 20 with fillet(5)\n};\nlet pt = p.point('c');\nM pt.x pt.y\nh 1");
    expect(result.layers[0].data).toBe('M 20 0 h 1');
  });

  it('projected paths answer queries in absolute coordinates', () => {
    const src = "let p = @{\n  h 40 as endpoint('east')\n};\nlet proj = p.project(100, 200);\nlet e = proj.point('east');\nM e.x e.y\nh 1";
    const result = compile(src);
    expect(result.layers[0].data).toBe('M 140 200 h 1');
  });

  it('layer().segment() returns absolute geometry from the layer store', () => {
    const src = [
      "let pl = PathLayer('a') ${ fill: none; };",
      "pl.apply {\n  M 10 10\n  h 30 as segment('top')\n  v 30\n}",
      "let top = layer('a').segment('top');",
      "let bb = top.boundingBox();",
      "log(bb.x, bb.y, bb.width, bb.height);",
    ].join('\n');
    const result = compile(src);
    const logLine = result.logs.map((l) => l.parts.map((p) => String(p.value)).join(' ')).join(' ');
    // The labeled edge runs (10,10)→(40,10): bbox x=10 y=10 w=30 h=0
    expect(logLine).toContain('10 10 30 0');
  });

  it('layer().point() reads authored geometry', () => {
    const src = "let pl = PathLayer('a') ${ fill: none; };\npl.apply {\n  M 10 10\n  h 30 as endpoint('e')\n}\nlet e = layer('a').point('e');\nM e.x e.y\nh 1";
    const result = compile(src);
    // Bare command after apply goes to the default layer
    const defaultLayer = result.layers.find((l) => l.isDefault);
    expect(defaultLayer?.data).toBe('M 40 10 h 1');
  });

  it('unknown labels list what is available', () => {
    expect(() => compile("let p = @{\n  h 40 as segment('lid')\n};\np.segment('nope');")).toThrow(
      /No segment named 'nope' — available: 'lid'/,
    );
    expect(() => compile("let p = @{\n  h 40 as endpoint('e')\n};\np.point('nope');")).toThrow(
      /No endpoint named 'nope' — available: 'e'/,
    );
  });

  it('vertex handle exposes x/y/point/label properties and destructuring', () => {
    const src = "let p = @{\n  h 20\n  v 20 as endpoint('c')\n};\nlet vh = p.vertex('c');\nlet { x, y } = vh;\nM x y\nh 1";
    const result = compile(src);
    expect(result.layers[0].data).toBe('M 20 20 h 1');
  });

  it('layer/projected vertex handles reject corner ops honestly', () => {
    const src = "let pl = PathLayer('a') ${ fill: none; };\npl.apply {\n  M 0 0\n  h 10\n  v 10 as endpoint('c')\n}\nlayer('a').vertex('c').fillet(2);";
    expect(() => compile(src)).toThrow(/not supported yet/);
  });

  it('segment labels survive corner-op finalization for querying', () => {
    // The fillet consumes part of the labeled edge; the label must survive on
    // the trimmed command so the segment stays queryable.
    const src = "let p = @{\n  h 20 as segment('top')\n  v 20 with fillet(5)\n};\nlet top = p.segment('top');\ntop.drawTo(0, 0);";
    const result = compile(src);
    // Trimmed to 15 by the fillet (splits re-emit h as l, matching .fillet())
    expect(result.layers[0].data).toBe('M 0 0 l 15 0');
  });
});

describe('group labels (querySelector/querySelectorAll model)', () => {
  const ribs = "let p = @{\n  for (i in 0..3) {\n    h 10 as segment('rib')\n    v 5 as endpoint('joint')\n  }\n};";

  it('segmentAll returns every contiguous run in authoring order', () => {
    // 4 ribs, each separated by an unlabeled v — 4 distinct runs
    const src = `${ribs}\nlet all = p.segmentAll('rib');\nlog(all.length);\nall[2].drawTo(0, 0);`;
    const result = compile(src);
    const logLine = result.logs.map((l) => l.parts.map((pp) => String(pp.value)).join(' ')).join(' ');
    expect(logLine).toContain('4');
    expect(result.layers[0].data).toBe('M 0 0 h 10');
  });

  it('singular segment() returns the first match when duplicates exist', () => {
    const src = `${ribs}\np.segment('rib').drawTo(50, 50);`;
    const result = compile(src);
    expect(result.layers[0].data).toBe('M 50 50 h 10');
  });

  it('consecutive same-labeled statements merge into one run', () => {
    const src = "let p = @{\n  h 10 as segment('edge')\n  h 10 as segment('edge')\n  v 5\n  h 10 as segment('edge')\n};\nlog(p.segmentAll('edge').length);\np.segment('edge').drawTo(0, 0);";
    const result = compile(src);
    const logLine = result.logs.map((l) => l.parts.map((pp) => String(pp.value)).join(' ')).join(' ');
    expect(logLine).toContain('2'); // merged first pair + the separated third
    expect(result.layers[0].data).toBe('M 0 0 h 10 h 10');
  });

  it('pointAll returns all labeled vertices with exact coordinates', () => {
    const src = `${ribs}\nlet pts = p.pointAll('joint');\nlog(pts.length, pts[0].x, pts[0].y, pts[3].x, pts[3].y);`;
    const result = compile(src);
    const logLine = result.logs.map((l) => l.parts.map((pp) => String(pp.value)).join(' ')).join(' ');
    // Each iteration: h 10 then v 5 — joints at (10,5),(20,10),(30,15),(40,20)
    expect(logLine).toContain('4');
    expect(logLine).toContain('10');
    expect(logLine).toContain('40');
    expect(logLine).toContain('20');
  });

  it('vertexAll returns fillet-capable handles for each vertex', () => {
    const src = "let p = @{\n  h 20\n  v 20 as endpoint('c')\n  h 20\n  v 20 as endpoint('c')\n  h 20\n};\nlet vs = p.vertexAll('c');\nlog(vs.length);\nlet f = vs[1].fillet(4);\nf.drawTo(0, 0);";
    const result = compile(src);
    const logLine = result.logs.map((l) => l.parts.map((pp) => String(pp.value)).join(' ')).join(' ');
    expect(logLine).toContain('2');
    expect(result.layers[0].data).toContain('a 4 4'); // fillet arc applied at the second joint
  });

  it('All queries return an empty array for unknown labels (no error)', () => {
    const src = "let p = @{\n  h 10 as segment('a')\n};\nlog(p.segmentAll('nope').length, p.pointAll('nope').length, p.vertexAll('nope').length);";
    const result = compile(src);
    const logLine = result.logs.map((l) => l.parts.map((pp) => String(pp.value)).join(' ')).join(' ');
    expect(logLine).toContain('0');
  });

  it('singular queries still error on unknown labels', () => {
    expect(() => compile("let p = @{\n  h 10 as segment('a')\n};\np.segment('nope');")).toThrow(/No segment named 'nope'/);
  });

  it('groups work through layer queries', () => {
    const src = [
      "let pl = PathLayer('g') ${ fill: none; };",
      "pl.apply {\n  M 0 0\n  h 10 as segment('rib')\n  v 5\n  h 10 as segment('rib')\n}",
      "log(layer('g').segmentAll('rib').length);",
    ].join('\n');
    const result = compile(src);
    const logLine = result.logs.map((l) => l.parts.map((pp) => String(pp.value)).join(' ')).join(' ');
    expect(logLine).toContain('2');
  });

  it('groups work on projected paths', () => {
    const src = "let p = @{\n  h 10 as segment('rib')\n  v 5\n  h 10 as segment('rib')\n};\nlet proj = p.project(100, 100);\nlog(proj.segmentAll('rib').length, proj.segmentAll('rib')[1].startPoint.x);";
    const result = compile(src);
    const logLine = result.logs.map((l) => l.parts.map((pp) => String(pp.value)).join(' ')).join(' ');
    expect(logLine).toContain('2');
    expect(logLine).toContain('110'); // second rib starts at x=110 absolute
  });
});

describe('z-chamfer label preservation and group pairing (review regressions)', () => {
  it('endpoint labels on z survive chamfer finalization (singular query)', () => {
    // applyCornerOperations (chamfer path) must reattach zMeta on re-close,
    // matching the fillet appliers — previously the label vanished.
    const src = "let p = @{\n  h 30\n  v 30 with chamfer(4)\n  h -30\n  z as endpoint('home')\n};\nlet pt = p.point('home');\nM pt.x pt.y\nh 1";
    const result = compile(src);
    expect(result.layers[0].data).toBe('M 0 0 h 1'); // z closes back to the block origin
  });

  it('vertexAll returns the full group with correct coordinates when a member sits on a chamfered z', () => {
    const src = [
      "let p = @{",
      "  h 20 as endpoint('corner')",
      "  v 20",
      "  h 30 as endpoint('corner')",
      "  v 20 with chamfer(4)",
      "  h -50",
      "  z as endpoint('corner')",
      "};",
      "let vs = p.vertexAll('corner');",
      "log(vs.length, vs[0].x, vs[0].y, vs[1].x, vs[1].y, vs[2].x, vs[2].y);",
    ].join('\n');
    const result = compile(src);
    const logLine = result.logs.map((l) => l.parts.map((pp) => String(pp.value)).join(' ')).join(' ');
    // Three members: (20,0), (50,20), and z's end = subpath start (0,0)
    expect(logLine).toContain('3');
    expect(logLine).toContain('20 0');
    expect(logLine).toContain('50 20');
  });
});

describe('labels survive derived paths', () => {
  // Byte-equality guard: labels must never change emitted geometry,
  // including through every derived-path operation that now carries them.
  const LABELED_SRC = [
    'let src = @{',
    "  h 40 as segment('top'), endpoint('ne')",
    '  v 40',
    "  h -40 as segment('bottom')",
    '  z',
    '};',
  ].join('\n');
  const PLAIN_SRC = ['let src = @{', '  h 40', '  v 40', '  h -40', '  z', '};'].join('\n');

  const UNARY_OPS: [string, string][] = [
    ['reverse', 'src.reverse()'],
    ['offset', 'src.offset(4)'],
    ['mirror', 'src.mirror(0.25pi)'],
    ['scale', 'src.scale(2, 1.5)'],
    ['rotate', 'src.rotate(0.3)'],
    ['rotateAtVertexIndex', 'src.rotateAtVertexIndex(1, 0.3)'],
    ['subPath', 'src.subPath(0.2, 0.9)'],
    ['fillet', 'src.fillet(4)'],
    ['chamfer', 'src.chamfer(4)'],
    ['ellipticalFillet', 'src.ellipticalFillet(6, 3)'],
  ];

  for (const [name, expr] of UNARY_OPS) {
    it(`${name}: labeled and unlabeled inputs emit identical geometry`, () => {
      const labeled = compile(`${LABELED_SRC}\nlet d = ${expr};\nd.drawTo(10, 10);`);
      const plain = compile(`${PLAIN_SRC}\nlet d = ${expr};\nd.drawTo(10, 10);`);
      expect(labeled.layers[0].data).toBe(plain.layers[0].data);
    });
  }

  it('scale() preserves segment and endpoint labels', () => {
    const result = compile(
      `${LABELED_SRC}\nlet s = src.scale(2, 2);\nlet lid = s.segment('top');\nlid.drawTo(0, 0);`,
    );
    expect(result.layers[0].data).toBe('M 0 0 l 80 0');
    const pt = compile(`${LABELED_SRC}\nlet s = src.scale(2, 2);\nlet e = s.point('ne');\nM e.x e.y\nh 1`);
    expect(pt.layers[0].data).toBe('M 80 0 h 1');
  });

  it('rotate() preserves labels through the new transform', () => {
    // 'ne' at (40,0) rotated +90° about the origin lands at (0,40).
    const result = compile(`${LABELED_SRC}\nlet r = src.rotate(0.5pi);\nlet e = r.point('ne');\nlog(e.x, e.y);\nM 0 0`);
    expect(Number(result.logs[0].parts[0].value)).toBeCloseTo(0, 5);
    expect(Number(result.logs[0].parts[1].value)).toBeCloseTo(40, 5);
  });

  it('mirror() on a ProjectedPath answers label queries in absolute coordinates', () => {
    const result = compile(
      `${LABELED_SRC}\nlet proj = src.project(100, 100);\nlet m = proj.mirror(0.5pi);\nlet e = m.point('ne');\nM e.x e.y\nh 1`,
    );
    // 'ne' projected to (140,100), mirrored across the vertical through (100,100) → (60,100).
    expect(result.layers[0].data).toBe('M 60 100 h 1');
  });

  it('reverse() shifts endpoint labels to their vertex (open path)', () => {
    // 'a' names (10,0); reversed geometry is M 0 0 v -10 h -10, where that
    // vertex sits at (0,-10).
    const result = compile(
      "let p = @{\n  h 10 as endpoint('a')\n  v 10\n};\nlet r = p.reverse();\nlet e = r.point('a');\nM e.x e.y\nh 1",
    );
    expect(result.layers[0].data).toBe('M 0 -10 h 1');
  });

  it('reverse() keeps segment labels on their (reversed) commands', () => {
    const result = compile(
      "let p = @{\n  h 10 as segment('lid')\n  v 10\n};\nlet r = p.reverse();\nlet lid = r.segment('lid');\nlid.drawTo(0, 0);",
    );
    // The lid edge reversed is the final h -10 of M 0 0 v -10 h -10.
    expect(result.layers[0].data).toBe('M 0 0 h -10');
  });

  it('reverse() on a closed path lands endpoint labels via the ring wraparound', () => {
    // 'sw' names (0,20); reversed closed geometry is l 0 20 h 20 v -20 h -20 z,
    // where (0,20) is the end of the leading l.
    const result = compile(
      "let p = @{\n  h 20\n  v 20\n  h -20 as endpoint('sw')\n  z\n};\nlet r = p.reverse();\nlet e = r.point('sw');\nM e.x e.y\nh 1",
    );
    expect(result.layers[0].data).toBe('M 0 20 h 1');
  });

  it('reverse() on an open path drops the final vertex endpoint label (documented)', () => {
    // 'end' names the open path's last vertex, which becomes the reversed
    // start point — no command end can carry it.
    const result = compile(
      "let p = @{\n  h 10 as endpoint('mid')\n  v 10 as endpoint('end')\n};\nlet r = p.reverse();\nlet all = r.pointAll('end');\nlog(all.length);\nM 0 0",
    );
    expect(String(result.logs[0].parts[0].value)).toBe('0');
  });

  it('subPath(1, 0) carries labels through the reversed range', () => {
    const labeled = compile(`${LABELED_SRC}\nlet d = src.subPath(1, 0);\nlet runs = d.segmentAll('top');\nlog(runs.length);\nM 0 0`);
    expect(String(labeled.logs[0].parts[0].value)).toBe('1');
  });

  it('fillet() method results still answer segment queries', () => {
    const result = compile(
      `${LABELED_SRC}\nlet f = src.fillet(4);\nlet runs = f.segmentAll('top');\nlog(runs.length);\nM 0 0`,
    );
    expect(String(result.logs[0].parts[0].value)).toBe('1');
  });

  it('offset() carries source labels onto offset images', () => {
    const result = compile(
      `${LABELED_SRC}\nlet o = src.offset(4);\nlet runs = o.segmentAll('top');\nlog(runs.length);\nM 0 0`,
    );
    expect(String(result.logs[0].parts[0].value)).toBe('1');
  });
});

describe('label-name validation (identifier-shaped, reserved cut namespace)', () => {
  // Coverage matrix over the whole punctuation class — '.' and ':' are the
  // delimiters the query language claims today, but the rule reserves ALL
  // punctuation so future query syntax never collides with authored names.
  const punctuation = [
    '.', ':', '/', '\\\\', '*', '+', '?', '!', '@', '#', '$', '%', '^', '&',
    '(', ')', '[', ']', '{', '}', '|', ',', '~', '<', '>', '=', ' ', '\\t',
  ];
  for (const ch of punctuation) {
    it(`rejects segment label containing ${JSON.stringify(ch)}`, () => {
      expect(() => compile(`M 0 0\nh 10 as segment('a${ch}b');`)).toThrow(/label name/);
    });
  }
  it('rejects endpoint labels with punctuation too', () => {
    expect(() => compile("M 0 0\nh 10 as endpoint('a:b');")).toThrow(/label name/);
    expect(() => compile("M 0 0\nh 10 as endpoint('a.b');")).toThrow(/label name/);
  });
  it('rejects labels that do not start with a letter', () => {
    expect(() => compile("M 0 0\nh 10 as segment('9lives');")).toThrow(/label name/);
    expect(() => compile("M 0 0\nh 10 as segment('-x');")).toThrow(/label name/);
    expect(() => compile("M 0 0\nh 10 as segment('_x');")).toThrow(/label name/);
  });
  it('accepts identifier-shaped labels', () => {
    expect(() => compile("M 0 0\nh 10 as segment('A-1_b'), endpoint('x9');")).not.toThrow();
  });
  it("reserves bare 'cut' for segment labels, pointing at the opt-in", () => {
    expect(() => compile("M 0 0\nh 10 as segment('cut');")).toThrow(/reserved.*cut\.<name>/s);
  });
  it("endpoint labels are a separate namespace — endpoint('cut') stays legal", () => {
    expect(() => compile("M 0 0\nh 10 as endpoint('cut');")).not.toThrow();
  });
  it("allows the explicit segment opt-in 'cut.<name>'", () => {
    expect(() => compile("M 0 0\nh 10 as segment('cut.rim');")).not.toThrow();
  });
  it("validates the opt-in sub-name ('cut.', 'cut.9x' rejected)", () => {
    expect(() => compile("M 0 0\nh 10 as segment('cut.');")).toThrow(/label name/);
    expect(() => compile("M 0 0\nh 10 as segment('cut.9x');")).toThrow(/label name/);
    expect(() => compile("M 0 0\nh 10 as segment('cut.a.b');")).toThrow(/label name/);
  });
  it("dots outside the cut namespace are rejected ('foo.bar')", () => {
    expect(() => compile("M 0 0\nh 10 as segment('foo.bar');")).toThrow(/label name/);
  });
  it('the opt-in is segment-only — endpoint cut.<name> rejected', () => {
    expect(() => compile("M 0 0\nh 10 as endpoint('cut.rim');")).toThrow(/label name/);
  });
  it('validates computed labels after evaluation', () => {
    expect(() => compile("let bad = 'a:b';\nM 0 0\nh 10 as segment(`${bad}`);")).toThrow(/label name/);
  });
  it("umbrella query: authored 'cut.rim' opt-in is returned by segmentAll('cut')", () => {
    const result = compileWithContext(`
      let p = @{
        h 40 as segment('cut.rim');
        v 40 as segment('side');
        h -40
        z
      };
      let count = p.segmentAll('cut').length;
      log(count);
    `);
    expect(result.logs[0].parts.map((x) => x.value).join('')).toContain('1');
  });
});

describe('query pseudo-selectors (:atomic, :first, :last, :nth)', () => {
  // Tooth lengths VARY per iteration (20, 25, 30) so position pseudos
  // are discriminating: a wrong index or 1-indexed nth picks a run with
  // a different length and fails.
  const comb = `
    let comb = @{
      for (i in 0..2) {
        v calc(-20 - i * 5) as segment('tooth');
        v calc(20 + i * 5);
        h calc(10 + i);
      }
    };
  `;

  it(':atomic undoes the merge — a circle() run decomposes into its two arcs', () => {
    const result = compileWithContext(`
      let wheel = @{
        circle(0, 0, 40) as segment('rim');
      };
      log(wheel.segmentAll('rim').length);
      log(wheel.segmentAll('rim:atomic').length);
    `);
    const vals = result.logs.map((e) => e.parts.map((p) => String(p.value)).join(''));
    expect(vals[0]).toContain('1');
    expect(vals[1]).toContain('2');
  });

  it(':atomic pieces preserve labels and their combined geometry spans the run', () => {
    const result = compileWithContext(`
      let wheel = @{
        circle(0, 0, 40) as segment('rim');
      };
      let run = wheel.segment('rim');
      let arcs = wheel.segmentAll('rim:atomic');
      let lenSum = 0;
      for (arc in arcs) {
        lenSum = calc(lenSum + arc.length);
        log(arc.segmentAll('rim').length);
      }
      log(calc(abs(lenSum - run.length) < 0.001));
    `);
    const vals = result.logs.map((e) => e.parts.map((p) => String(p.value)).join(''));
    expect(vals[0]).toContain('1');
    expect(vals[1]).toContain('1');
    expect(vals[2]).toContain('true');
  });

  it(':first / :last / :nth(k) select runs from a group (0-indexed)', () => {
    const result = compileWithContext(`
      ${comb}
      let first = comb.segment('tooth:first');
      let last = comb.segment('tooth:last');
      let mid = comb.segment('tooth:nth(1)');
      let bare = comb.segment('tooth');
      log(calc(abs(first.length - bare.length) < 0.001));
      log(last.length);
      log(mid.length);
      log(comb.segmentAll('tooth:last').length);
    `);
    const vals = result.logs.map((e) => e.parts.map((p) => String(p.value)).join(''));
    expect(vals[0]).toContain('true'); // :first == bare singular
    expect(Number(vals[1].replace(/[^0-9.]/g, ''))).toBeCloseTo(30, 3); // :last = tooth 2
    expect(Number(vals[2].replace(/[^0-9.]/g, ''))).toBeCloseTo(25, 3); // :nth(1) 0-indexed = tooth 1
    expect(vals[3]).toContain('1'); // All form: array of one
  });

  it(':nth out of range: All form returns [], singular errors with the run count', () => {
    const ok = compileWithContext(`
      ${comb}
      log(comb.segmentAll('tooth:nth(9)').length);
    `);
    expect(ok.logs[0].parts.map((p) => String(p.value)).join('')).toContain('0');
    expect(() => compile(`${comb}\nlet x = comb.segment('tooth:nth(9)');`)).toThrow(/3 runs?/);
  });

  it('unknown and chained pseudos error listing the available set', () => {
    expect(() => compile(`${comb}\nlet x = comb.segment('tooth:frist');`)).toThrow(
      /:atomic.*:first.*:last.*:nth/s,
    );
    expect(() => compile(`${comb}\nlet x = comb.segmentAll('tooth:first:atomic');`)).toThrow(
      /one pseudo/i,
    );
  });

  it('point/vertex queries reject pseudo syntax, pointing at segment queries', () => {
    const src = `
      let p = @{
        h 10 as endpoint('tip');
      };
    `;
    expect(() => compile(`${src}\nlet a = p.point('tip:first');`)).toThrow(/segment quer/i);
    expect(() => compile(`${src}\nlet a = p.vertexAll('tip:atomic');`)).toThrow(/segment quer/i);
    expect(() => compile(`${src}\nlet a = p.pointAll('tip:atomic');`)).toThrow(/segment quer/i);
  });

  it('pseudos work on projected paths and layer queries', () => {
    const result = compileWithContext(`
      let comb = @{
        for (i in 0..2) {
          v -20 as segment('tooth');
          v 20;
          h 10;
        }
      };
      let placed = comb.project(50, 50);
      log(placed.segmentAll('tooth:atomic').length);
      log(placed.segment('tooth:last').startPoint.x);
      let lay = PathLayer('teeth') \${};
      layer('teeth').apply {
        M 10 10
        h 5 as segment('edge');
        h 5 as segment('edge');
      }
      log(layer('teeth').segmentAll('edge:atomic').length);
    `);
    const vals = result.logs.map((e) => e.parts.map((p) => String(p.value)).join(''));
    expect(vals[0]).toContain('3');
    expect(Number(vals[1].replace(/[^0-9.-]/g, ''))).toBeCloseTo(70, 3);
    expect(vals[2]).toContain('2');
  });
});

describe('pseudo guard on the layer query path (review warning 3)', () => {
  it('layer().point/vertexAll reject pseudo syntax through the layer dispatch', () => {
    const src = `
      let lay = PathLayer('shape') \${};
      layer('shape').apply {
        M 10 10
        h 5 as endpoint('tip');
      }
    `;
    expect(() => compile(`${src}\nlet a = layer('shape').point('tip:atomic');`)).toThrow(
      /segment quer/i,
    );
    expect(() => compile(`${src}\nlet a = layer('shape').vertexAll('tip:last');`)).toThrow(
      /segment quer/i,
    );
  });

  it(":atomic on a move-only run: All → [], singular error names the drawing-command cause (not nth)", () => {
    const src = `
      let p = @{
        m 5 5 as segment('hop');
        h 10;
      };
    `;
    const ok = compileWithContext(`${src}\nlog(p.segmentAll('hop:atomic').length);`);
    expect(ok.logs[0].parts.map((x) => String(x.value)).join('')).toContain('0');
    expect(() => compile(`${src}\nlet a = p.segment('hop:atomic');`)).toThrow(/no drawing commands/);
    expect(() => compile(`${src}\nlet a = p.segment('hop:atomic');`)).not.toThrow(/0-indexed/);
  });
});

describe('annotated-mode label-name validation parity (F2)', () => {
  // compileAnnotated ignores labels for OUTPUT (emit-neutral by design)
  // but must reject the same invalid NAMES compile() rejects — a user
  // debugging a rejected label must not see it "work" in --annotated.
  const forms: Array<[string, string, RegExp]> = [
    ["bare 'cut'", "M 0 0\nh 10 as segment('cut')", /reserved.*cut\.<name>/s],
    ['punctuation', "M 0 0\nh 10 as segment('a:b')", /label name/],
    ['leading digit', "M 0 0\nh 10 as segment('9x')", /label name/],
    ['endpoint punctuation', "M 0 0\nh 10 as endpoint('a.b')", /label name/],
    ['endpoint cut-opt-in (segment-only)', "M 0 0\nh 10 as endpoint('cut.rim')", /label name/],
    ['non-string', 'M 0 0\nh 10 as segment(5)', /non-empty string/],
    ['computed invalid', "let bad = 'a:b';\nM 0 0\nh 10 as segment(`${bad}`)", /label name/],
  ];
  for (const [name, src, rx] of forms) {
    it(`annotated rejects ${name} like compile() does`, async () => {
      const { compileAnnotated } = await import('../src/index');
      expect(() => compileAnnotated(src)).toThrow(rx);
    });
  }
  it('annotated still accepts valid labels emit-neutrally', async () => {
    const { compileAnnotated } = await import('../src/index');
    expect(() => compileAnnotated("M 0 0\nh 10 as segment('lid'), endpoint('tip')")).not.toThrow();
    expect(() => compileAnnotated("M 0 0\nh 10 as segment('cut.rim')")).not.toThrow();
    expect(() => compileAnnotated("M 0 0\nh 10 as endpoint('cut')")).not.toThrow();
  });
  it('annotated rejects duplicate-kind labels in one as clause', async () => {
    const { compileAnnotated } = await import('../src/index');
    expect(() => compileAnnotated("M 0 0\nh 10 as segment('a'), segment('b')")).toThrow(/At most one segment/);
  });
});
