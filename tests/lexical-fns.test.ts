/**
 * Phase 0a step 3: named fns are lexical (project-docs/modules/06-phase-0a-plan.md
 * §Step 3; docs/syntax.md "Scoping: where a function finds its names").
 *
 * A function of either kind sees the variables WHERE IT IS WRITTEN. Before
 * step 3 a named fn resolved free names in the CALLER's scope (dynamic
 * scope), which modules can't have: an imported function must find its own
 * file's names. A lookup that only the old rule would have resolved fails
 * with a hint that says so and shows the fix. The audit hook reports every
 * name the two rules resolve differently, including the silent cases.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { compile } from '../src';
import { __setScopeAudit } from '../src/evaluator/index';
import type { ScopeAuditEvent } from '../src/evaluator/index';
import { getCodeActions } from '../src/language-services/code-actions';
import { getDiagnostics } from '../src/language-services/diagnostics';
import { getHoverInfo } from '../src/language-services/hover';
import { StringTextDocument } from '../src/language-services/document';

function logs(source: string): string[] {
  return compile(source)
    .logs.filter((entry) => entry.severity !== 'warn')
    .map((entry) => entry.parts.map((p) => String(p.value)).join(' '));
}

const HINT = 'a function sees the variables where it is written, not where it is called';

describe('the docs examples (docs/syntax.md "Scoping")', () => {
  it("a fn sees the top-level amt, not its caller's", () => {
    const source = `fn f() { return amt; }
fn g() { let amt = 7; return f(); }
let amt = 1;
let a = f();   // 1 — the top-level amt
let b = g();   // 1 — g's own amt is not visible inside f
log(a, b);`;
    expect(logs(source)).toEqual(['1 1']);
  });

  it('a value from the caller is passed in as a parameter', () => {
    const source = `fn scaled(x, amt) { return calc(x * amt); }
fn g() { let amt = 7; return scaled(2, amt); }
let b = g();   // 14
log(b);`;
    expect(logs(source)).toEqual(['14']);
  });

  it('a name that only exists where the fn is called is an error with the hint and the fix', () => {
    const source = 'fn f() { return amt; }\nfn g() { let amt = 7; return f(); }\nlet b = g();';
    expect(() => compile(source)).toThrow(
      `Line 1, col 17: Undefined variable: amt — ${HINT}. Pass it in: add amt to f's parameters, fn f(amt), and pass it where f is called`,
    );
  });

  it("the factory example: a fn written inside a fn keeps that call's parameters", () => {
    const source = `fn make(k) {
  fn times(x) { return calc(x * k); }
  return times;
}
let triple = make(3);
let fifteen = triple(5);   // 15
log(fifteen);`;
    expect(logs(source)).toEqual(['15']);
  });

  it('the assignment example and its fix', () => {
    const broken = `fn reset() { count = 0; }
fn run() { let count = 5; reset(); return count; }
let n = run();`;
    expect(() => compile(broken)).toThrow(
      `Cannot assign to count here — ${HINT}. Return the new value instead: count = reset();`,
    );
    const fixed = `fn reset() { return 0; }
fn run() { let count = 5; count = reset(); return count; }
let n = run();   // 0
log(n);`;
    expect(logs(fixed)).toEqual(['0']);
  });

  it('the worker example, its error and both fixes', () => {
    const broken = `fn scale(v) { return calc(v * k); }
fn run() {
  let k = 3;
  return [1, 2].map() << scale;
}
let xs = run();`;
    expect(() => compile(broken)).toThrow(
      `Undefined variable: k — ${HINT}. scale is applied with <<, so it can't take k as a parameter: write it where k is visible, as a trailing block or a let-bound lambda`,
    );
    const fixed = `fn run() {
  let k = 3;
  let scale = {|v| return calc(v * k); };
  return [1, 2].map() << scale;   // or: [1, 2].map {|v| return calc(v * k); }
}
let xs = run();   // [3, 6]
log(xs);`;
    expect(logs(fixed)).toEqual(['[3, 6]']);
  });
});

describe('names a lexical fn still finds', () => {
  it.each([
    ['a top-level let declared after the fn', 'fn f() { return amt; }\nlet amt = 3;\nlog(f());', ['3']],
    [
      'mutual recursion with a fn declared later',
      'fn isEven(n) { if (n == 0) { return 1; } return isOdd(calc(n - 1)); }\nfn isOdd(n) { if (n == 0) { return 0; } return isEven(calc(n - 1)); }\nlog(isEven(4));',
      ['1'],
    ],
    [
      'a fn written in a loop keeps its iteration',
      'let fns = [];\nfor (i in 0..<3) {\n  fn get() { return i; }\n  fns.push(get);\n}\nlet first = fns[0];\nlet last = fns[2];\nlog(first(), last());',
      ['0 2'],
    ],
    [
      "a fn written inside a fn sees that fn's locals",
      'fn make(k) {\n  fn times(x) { return calc(x * k); }\n  return times;\n}\nlet triple = make(3);\nlog(triple(5));',
      ['15'],
    ],
    ["a fn's own parameter shadows a top-level name", 'let amt = 1;\nfn f(amt) { return amt; }\nlog(f(9));', ['9']],
    ['ctx is still the pen drawing now', 'fn px() { return ctx.position.x; }\nM 40 0\nlog(px());', ['40']],
  ])('%s', (_, source, expected) => {
    expect(logs(source)).toEqual(expected);
  });
});

describe('what the old dynamic rule found, and the hint', () => {
  it('a fn with parameters: the fix adds the name to them', () => {
    const source = 'fn f(x) { return calc(x + amt); }\nfn g() { let amt = 7; return f(1); }\nlet b = g();';
    expect(() => compile(source)).toThrow(
      `Undefined variable: amt — ${HINT}. Pass it in: add amt to f's parameters, fn f(x, amt), and pass it where f is called`,
    );
  });

  it('the hint names the innermost fn, and each fn in between, when the name is calls away', () => {
    const source =
      'fn inner() { return amt; }\nfn middle() { return inner(); }\nfn outer() { let amt = 4; return middle(); }\nlet b = outer();';
    expect(() => compile(source)).toThrow(
      `Undefined variable: amt — ${HINT}. Pass it in: add amt to inner's parameters, fn inner(amt), and pass it where inner is called. middle needs it as a parameter too, to pass it along`,
    );
    const deeper =
      'fn a() { return amt; }\nfn b() { return a(); }\nfn c() { return b(); }\nfn d() { let amt = 4; return c(); }\nlet r = d();';
    expect(() => compile(deeper)).toThrow(
      /fn a\(amt\), and pass it where a is called\. b, c need it as a parameter too, to pass it along$/,
    );
  });

  it('recursion: the fn on the way is itself, so the hint stays simple', () => {
    const source =
      'fn down(n) { if (n == 0) { return amt; } return down(calc(n - 1)); }\nfn g() { let amt = 2; return down(3); }\nlet r = g();';
    expect(() => compile(source)).toThrow(
      new RegExp(
        `Undefined variable: amt — ${HINT}\\. Pass it in: add amt to down's parameters, fn down\\(n, amt\\), and pass it where down is called$`,
      ),
    );
  });

  it('recursion: a name where the fn is written is found at any depth', () => {
    expect(
      logs('let base = 10;\nfn down(n) { if (n == 0) { return base; } return down(calc(n - 1)); }\nlog(down(3));'),
    ).toEqual(['10']);
  });

  it('a fn called inside a path block: a block-local name gets the hint; ctx and viewbox still resolve', () => {
    const source = 'fn edge() { h w }\nlet b = @{ let w = 5; edge(); };';
    expect(() => compile(source)).toThrow(
      `Undefined variable: w — ${HINT}. Pass it in: add w to edge's parameters, fn edge(w), and pass it where edge is called`,
    );
    const resolves =
      'define ViewBox(0, 0, 80, 40);\nfn px() { return ctx.position.x; }\nfn wide() { return viewbox.width; }\nlet b = @{ m 5 0; log(px(), wide()); };';
    expect(logs(resolves)).toEqual(['5 80']);
  });

  it('a named Grid worker reading a local of the code that applies it gets the worker hint', () => {
    const source =
      'fn cell(row, col, center) { return calc(row * w); }\nfn build() {\n  let w = 3;\n  let g = Grid(2, 2, { xDim: 10, yDim: 10 });\n  g.fill() << cell;\n  return g;\n}\nlet g = build();';
    expect(() => compile(source)).toThrow(
      `Undefined variable: w — ${HINT}. cell is applied with <<, so it can't take w as a parameter: write it where w is visible, as a trailing block or a let-bound lambda`,
    );
  });

  it('a named << worker reading a local of the code that applies it: no parameter fix', () => {
    // map passes (item, index, array): `fn worker(v, k)` would bind k to the index.
    const source =
      'fn worker(v) { return calc(v * k); }\nfn run() { let k = 3; return [1, 2].map() << worker; }\nlet r = run();';
    expect(() => compile(source)).toThrow(
      `Undefined variable: k — ${HINT}. worker is applied with <<, so it can't take k as a parameter: write it where k is visible, as a trailing block or a let-bound lambda`,
    );
  });

  it('both forms the worker hint suggests work (and a lambda literal after << would not)', () => {
    const letBound =
      'fn run() {\n  let k = 3;\n  let worker = {|v| return calc(v * k); };\n  return [1, 2].map() << worker;\n}\nlog(run());';
    expect(logs(letBound)).toEqual(['[3, 6]']);
    const trailing = 'fn run() {\n  let k = 3;\n  return [1, 2].map {|v| return calc(v * k); };\n}\nlog(run());';
    expect(logs(trailing)).toEqual(['[3, 6]']);
    const inline = 'fn run() { let k = 3; return [1, 2].map() << {|v| return calc(v * k); }; }\nlog(run());';
    expect(() => compile(inline)).toThrow(/An inline lambda after '<<' is not allowed/);
  });

  it('assigning to a variable that only exists where the fn is called', () => {
    const source = 'fn reset() { count = 0; }\nfn run() { let count = 5; reset(); return count; }\nlet r = run();';
    expect(() => compile(source)).toThrow(
      `Cannot assign to count here — ${HINT}. Return the new value instead: count = reset();`,
    );
  });

  it('a << worker assigning to a local of the code that applies it', () => {
    const source =
      'fn tally(v) { total = v; return v; }\nfn run() { let total = 0; let r = [1, 2].map() << tally; return total; }\nlet t = run();';
    expect(() => compile(source)).toThrow(
      `Cannot assign to total here — ${HINT}. tally is applied with <<, so it can't assign to total: write it where total is visible, as a trailing block or a let-bound lambda`,
    );
  });

  it('a name that exists nowhere keeps the plain messages', () => {
    expect(() => compile('fn f() { return nope; }\nlet b = f();')).toThrow(/Undefined variable: nope$/);
    expect(() => compile('fn f() { nope = 1; }\nf();')).toThrow(/Cannot assign to undeclared variable: nope$/);
  });

  // A style value whose evaluation fails keeps its raw text (rgb(...),
  // context-stroke, …). A caller's name resolved there under the old rule, so
  // raw text would be a silent change: stroke="col" instead of #f00.
  describe('style values stop with the hint instead of keeping the raw name', () => {
    const inFn = (decl: string, local: string) =>
      `fn mk() {\n  let l = PathLayer('a') #{ ${decl} };\n  l.apply { M 0 0 L 10 0 }\n}\nfn g() { ${local} mk(); }\ng();`;

    it.each([
      ['a bare name', 'stroke: col;', "let col = '#f00';", 'stroke', 'col', 37],
      ['a number', 'stroke: red; stroke-width: w;', 'let w = 3;', 'stroke-width', 'w', 56],
      ['an interpolation', 'stroke: ${col};', "let col = '#0f0';", 'stroke', 'col', 37],
      ['a CSS function argument', 'stroke: red; filter: brightness(level);', 'let level = 0.5;', 'filter', 'level', 50],
      ['a transform shorthand', 'stroke: red; translate-x: dx;', 'let dx = 5;', 'translate-x', 'dx', 55],
    ])('%s', (_, decl, local, prop, name, col) => {
      expect(() => compile(inFn(decl, local))).toThrow(
        `Line 2, col ${col}: Style value for "${prop}": Undefined variable: ${name} — ${HINT}. Pass it in: add ${name} to mk's parameters, fn mk(${name}), and pass it where mk is called`,
      );
    });

    it('CSS keywords and names that exist nowhere still pass through as text', () => {
      const result = compile(inFn('stroke: context-stroke; fill: none;', ''));
      expect(result.layers.find((l) => l.name === 'a')?.styles).toEqual({ stroke: 'context-stroke', fill: 'none' });
    });

    it('a style value that resolves where the fn is written is unchanged', () => {
      const source = `let col = '#00f';\n${inFn('stroke: col;', '')}`;
      expect(compile(source).layers.find((l) => l.name === 'a')?.styles).toEqual({ stroke: '#00f' });
    });
  });

  it('a lambda never gets the hint: lambdas were already lexical', () => {
    const source = 'let f = {|| return amt; };\nfn g() { let amt = 7; return f(); }\nlet b = g();';
    expect(() => compile(source)).toThrow(/Undefined variable: amt$/);
  });

  it('a subscription callback written as a named fn is lexical', () => {
    const source =
      "define PathLayer('a') #{ stroke: red; };\nlet tag = 'top';\nfn onCommand(m) { log(tag); }\nlayer('a').subscribe('command') << onCommand;\nlayer('a').apply { M 1 1 }";
    expect(logs(source)).toEqual(['top']);
  });

  it('a subscription callback reading a local of the code that subscribed gets the worker hint', () => {
    const source =
      "define PathLayer('a') #{ stroke: red; };\nfn onCommand(m) { log(tag); }\nfn setup() { let tag = 'local'; layer('a').subscribe('command') << onCommand; }\nsetup();\nlayer('a').apply { M 1 1 }";
    expect(() => compile(source)).toThrow(
      `Undefined variable: tag — ${HINT}. onCommand is applied with <<, so it can't take tag as a parameter: write it where tag is visible, as a trailing block or a let-bound lambda`,
    );
  });

  it("the editor's fn hover states the rule", () => {
    const hover = getHoverInfo(new StringTextDocument('fn f() { return 1; }'), { line: 0, character: 1 });
    expect(hover?.contents).toContain(
      "A function sees the variables where it is written, not where it is called (lexical scope). Pass anything else in as a parameter (a `<<` worker can't take extra ones: write it where the name is visible).",
    );
    expect(hover?.contents).not.toContain('dynamic');
  });

  it('the editor still offers "Did you mean" on a hinted error', () => {
    const doc = new StringTextDocument(
      'let radius = 50;\nfn f() { return radiuss; }\nfn g() { let radiuss = 2; return f(); }\nlet r = g();',
    );
    const diagnostics = getDiagnostics(doc);
    expect(diagnostics.map((d) => d.message)).toEqual([
      expect.stringContaining(`Undefined variable: radiuss — ${HINT}`),
    ]);
    const actions = getCodeActions(doc, diagnostics[0].range, diagnostics);
    expect(actions.find((a) => a.title.includes('radius'))).toBeDefined();
  });
});

describe('the audit hook (__setScopeAudit, for scripts/audit-semantics.ts --step 3)', () => {
  afterEach(() => __setScopeAudit(null));

  /** Unique events while compiling `source`, as "kind fn.name", and whether it threw. */
  function events(source: string): { events: string[]; threw: boolean } {
    const seen = new Set<string>();
    __setScopeAudit((e: ScopeAuditEvent) => seen.add(`${e.kind} ${e.fn}.${e.name}`));
    let threw = false;
    try {
      compile(source);
    } catch {
      threw = true;
    } finally {
      __setScopeAudit(null);
    }
    return { events: [...seen].sort(), threw };
  }

  it("bound-elsewhere: the amt example, silent — g's amt was found before, the top-level one now", () => {
    const source = 'fn f() { return amt; }\nfn g() { let amt = 7; return f(); }\nlet amt = 1;\nlet b = g();';
    expect(events(source)).toEqual({ events: ['bound-elsewhere f.amt'], threw: false });
  });

  it("a caller's variable named like a built-in can no longer exist (step 5: the declaration is an error)", () => {
    // Step 3 recorded this as bound-elsewhere (f.round read g's variable
    // before, the built-in after); since step 5 `let round` doesn't compile.
    const source = 'fn f() { return round(2.4); }\nfn g() { let round = 9; return f(); }\nlet b = g();';
    expect(events(source)).toEqual({ events: [], threw: true });
  });

  it('only-where-written: a fn returned from a factory used to lose its variables', () => {
    const source =
      'fn make(k) {\n  fn times(x) { return calc(x * k); }\n  return times;\n}\nlet triple = make(3);\nlet n = triple(5);';
    expect(events(source)).toEqual({ events: ['only-where-written times.k'], threw: false });
  });

  it('only-where-called: the hinted error, for reads and assignments', () => {
    expect(events('fn f() { return amt; }\nfn g() { let amt = 7; return f(); }\nlet b = g();')).toEqual({
      events: ['only-where-called f.amt'],
      threw: true,
    });
    expect(events('fn reset() { count = 0; }\nfn run() { let count = 5; reset(); }\nrun();')).toEqual({
      events: ['only-where-called reset.count'],
      threw: true,
    });
  });

  it('no events when both rules agree: top-level names, parameters, lambdas', () => {
    const source =
      'let amt = 1;\nfn f(x) { return calc(x + amt); }\nlet g = {|y| return f(y); };\nfn h() { return g(2); }\nlet n = h();';
    expect(events(source)).toEqual({ events: [], threw: false });
  });

  it('off by default: compiling reports nothing to a hook that was cleared', () => {
    const seen: ScopeAuditEvent[] = [];
    __setScopeAudit((e) => seen.push(e));
    __setScopeAudit(null);
    compile('fn f() { return amt; }\nfn g() { let amt = 7; return f(); }\nlet amt = 1;\nlet b = g();');
    expect(seen).toEqual([]);
  });
});
