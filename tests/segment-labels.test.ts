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
  it('rejects duplicate segment labels within a path', () => {
    expect(() => compile("M 0 0\nh 10 as segment('a')\nv 10 as segment('a')")).toThrow(/Duplicate segment label 'a'/);
  });

  it('rejects duplicate endpoint labels within a path', () => {
    expect(() => compile("M 0 0\nh 10 as endpoint('e')\nv 10 as endpoint('e')")).toThrow(/Duplicate endpoint label 'e'/);
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
