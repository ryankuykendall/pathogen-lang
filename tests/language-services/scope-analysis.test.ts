import { describe, it, expect } from 'vitest';
import { StringTextDocument } from '../../src/language-services/document';
import { analyzeScopes } from '../../src/language-services/scope-analysis';
import type { ScopeInfo, Declaration, Reference } from '../../src/language-services/scope-analysis';

function analyze(source: string): ScopeInfo {
  return analyzeScopes(new StringTextDocument(source));
}

function declNames(info: ScopeInfo): string[] {
  return info.declarations.map((d) => d.name);
}

function refNames(info: ScopeInfo): string[] {
  return info.references.map((r) => r.name);
}

function unresolvedRefs(info: ScopeInfo): string[] {
  return info.references.filter((r) => !r.declaration && !r.isBuiltin).map((r) => r.name);
}

function builtinRefs(info: ScopeInfo): string[] {
  return info.references.filter((r) => r.isBuiltin).map((r) => r.name);
}

describe('analyzeScopes', () => {
  it('returns empty for empty source', () => {
    const info = analyze('');
    expect(info.declarations).toHaveLength(0);
    expect(info.references).toHaveLength(0);
  });

  it('recovers declarations from incomplete source (lenient parse)', () => {
    // Mid-typing `let x = ` still records x — Lezer error recovery + the
    // lenient AST builder keep the scope tree usable between keystrokes.
    const info = analyze('let x = ');
    expect(info.declarations).toHaveLength(1);
    expect(info.declarations[0].name).toBe('x');
  });

  describe('let declarations', () => {
    it('records a simple let declaration', () => {
      const info = analyze('let x = 10;');
      expect(declNames(info)).toEqual(['x']);
      expect(info.declarations[0].kind).toBe('variable');
    });

    it('records multiple declarations', () => {
      const info = analyze('let x = 10;\nlet y = 20;');
      expect(declNames(info)).toEqual(['x', 'y']);
    });

    it('records array destructuring elements', () => {
      const info = analyze('let [a, b, c] = [1, 2, 3];');
      expect(declNames(info)).toContain('a');
      expect(declNames(info)).toContain('b');
      expect(declNames(info)).toContain('c');
    });

    it('records object destructuring elements', () => {
      const info = analyze('let { x, y } = point;');
      expect(declNames(info)).toContain('x');
      expect(declNames(info)).toContain('y');
    });

    it('resolves references to prior declarations', () => {
      const info = analyze('let x = 10;\nM x 0');
      const xRef = info.references.find((r) => r.name === 'x');
      expect(xRef).toBeDefined();
      expect(xRef!.declaration).not.toBeNull();
      expect(xRef!.declaration!.name).toBe('x');
    });
  });

  describe('function definitions', () => {
    it('records function declaration in outer scope', () => {
      const info = analyze('fn draw() {\n  M 0 0\n}');
      expect(declNames(info)).toContain('draw');
      expect(info.declarations.find((d) => d.name === 'draw')!.kind).toBe('function');
    });

    it('records parameters in function scope', () => {
      const info = analyze('fn draw(cx, cy, r) {\n  circle(cx, cy, r);\n}');
      const params = info.declarations.filter((d) => d.kind === 'parameter');
      expect(params.map((p) => p.name)).toEqual(['cx', 'cy', 'r']);
    });

    it('resolves parameter references inside function body', () => {
      const info = analyze('fn draw(cx, cy) {\n  M cx cy\n}');
      const cxRef = info.references.find((r) => r.name === 'cx');
      expect(cxRef).toBeDefined();
      expect(cxRef!.declaration).not.toBeNull();
      expect(cxRef!.declaration!.kind).toBe('parameter');
    });

    it('resolves outer scope variables inside function body', () => {
      const info = analyze('let r = 50;\nfn draw() {\n  circle(0, 0, r);\n}');
      const rRef = info.references.find((r) => r.name === 'r');
      expect(rRef).toBeDefined();
      expect(rRef!.declaration).not.toBeNull();
      expect(rRef!.declaration!.kind).toBe('variable');
    });
  });

  describe('for loops', () => {
    it('records loop variable in loop scope', () => {
      const info = analyze('for (i in 0..5) {\n  M i 0\n}');
      const loopVar = info.declarations.find((d) => d.name === 'i');
      expect(loopVar).toBeDefined();
      expect(loopVar!.kind).toBe('loopVar');
    });

    it('resolves loop variable inside body', () => {
      const info = analyze('for (i in 0..5) {\n  M i 0\n}');
      const iRef = info.references.find((r) => r.name === 'i');
      expect(iRef).toBeDefined();
      expect(iRef!.declaration).not.toBeNull();
      expect(iRef!.declaration!.kind).toBe('loopVar');
    });

    it('loop variable not visible outside loop', () => {
      const info = analyze('for (i in 0..5) {\n  M i 0\n}\nM i 0');
      // There should be two references to 'i': one inside (resolved), one outside (unresolved)
      const iRefs = info.references.filter((r) => r.name === 'i');
      expect(iRefs).toHaveLength(2);
      expect(iRefs[0].declaration).not.toBeNull(); // inside loop
      expect(iRefs[1].declaration).toBeNull(); // outside loop
      expect(iRefs[1].isBuiltin).toBe(false); // not a builtin either
    });
  });

  describe('forEach loops', () => {
    it('records forEach variable and index', () => {
      const info = analyze('let items = [1, 2];\nfor ([item, idx] in items) {\n  M item idx\n}');
      expect(declNames(info)).toContain('item');
      expect(declNames(info)).toContain('idx');
    });
  });

  describe('if statements', () => {
    it('creates separate scopes for branches', () => {
      const info = analyze('let x = 10;\nif (x > 5) {\n  let a = 1;\n} else {\n  let b = 2;\n}');
      expect(declNames(info)).toContain('x');
      expect(declNames(info)).toContain('a');
      expect(declNames(info)).toContain('b');
      // Root scope has 2 children (then, else)
      expect(info.root.children).toHaveLength(2);
    });
  });

  describe('enum definitions', () => {
    it('records enum declaration', () => {
      const info = analyze('enum Direction {\n  UP,\n  DOWN\n}');
      expect(declNames(info)).toContain('Direction');
      expect(info.declarations.find((d) => d.name === 'Direction')!.kind).toBe('enum');
    });
  });

  describe('variable shadowing', () => {
    it('inner scope shadows outer variable', () => {
      const info = analyze('let x = 10;\nfn test() {\n  let x = 20;\n  M x 0\n}');
      // Two declarations of 'x'
      const xDecls = info.declarations.filter((d) => d.name === 'x');
      expect(xDecls).toHaveLength(2);
      // Reference in function body resolves to the inner x
      const xRef = info.references.find((r) => r.name === 'x');
      expect(xRef).toBeDefined();
      // The inner declaration should be in a child scope
      expect(xDecls[1].scope).not.toBe(xDecls[0].scope);
    });
  });

  describe('stdlib and builtins', () => {
    it('marks stdlib function references as builtin', () => {
      const info = analyze('circle(50, 50, 25);');
      expect(builtinRefs(info)).toContain('circle');
    });

    it('marks ctx as builtin', () => {
      const info = analyze('M 0 0\nlet pos = ctx.position;');
      expect(builtinRefs(info)).toContain('ctx');
    });

    it('marks builtin enums as builtin', () => {
      const info = analyze('let e = Easing.Linear;');
      expect(builtinRefs(info)).toContain('Easing');
    });

    it('marks undefined variables as unresolved non-builtin', () => {
      const info = analyze('M undefinedVar 0');
      expect(unresolvedRefs(info)).toContain('undefinedVar');
    });
  });

  describe('assignments', () => {
    it('assignment to declared variable creates a reference', () => {
      const info = analyze('let x = 10;\nx = 20;');
      const xRefs = info.references.filter((r) => r.name === 'x');
      expect(xRefs).toHaveLength(1); // assignment target is a reference
      expect(xRefs[0].declaration).not.toBeNull();
    });
  });

  describe('complex programs', () => {
    it('handles nested scopes correctly', () => {
      const source = [
        'let r = 50;',
        'fn draw(cx, cy) {',
        '  for (i in 0..5) {',
        '    let angle = calc(i * TAU() / 5);',
        '    M calc(cx + r * cos(angle)) calc(cy + r * sin(angle))',
        '  }',
        '}',
        'draw(100, 100);',
      ].join('\n');
      const info = analyze(source);

      // Declarations: r, draw, cx, cy, i, angle
      expect(declNames(info)).toEqual(['r', 'draw', 'cx', 'cy', 'i', 'angle']);

      // References to stdlib (cos, sin, TAU, calc are resolved as builtin)
      expect(builtinRefs(info)).toContain('cos');
      expect(builtinRefs(info)).toContain('sin');
      expect(builtinRefs(info)).toContain('TAU');

      // No unresolved references (everything is declared or builtin)
      expect(unresolvedRefs(info)).toHaveLength(0);
    });
  });

  describe('trailing blocks', () => {
    it('records block params in method blocks', () => {
      const info = analyze('let items = [1, 2, 3];\nlet result = items.map {|item| return calc(item * 2); };');
      expect(declNames(info)).toContain('item');
      const itemDecl = info.declarations.find((d) => d.name === 'item');
      expect(itemDecl!.kind).toBe('blockParam');
    });
  });

  describe('style-block value references', () => {
    function styleRefs(info: ScopeInfo): Reference[] {
      return info.references.filter((r) => r.inStyleValue);
    }
    /** Assert a ref's full-width range slices exactly its name from the source. */
    function expectExactRange(src: string, ref: Reference): void {
      const line = src.split('\n')[ref.range.start.line];
      expect(ref.range.end.line).toBe(ref.range.start.line);
      expect(line.slice(ref.range.start.character, ref.range.end.character)).toBe(ref.name);
    }

    it('emits a reference for a bare declared identifier as a value', () => {
      const src = 'let c = #f00;\nlet s = ${ stroke: c; };';
      const refs = styleRefs(analyze(src));
      expect(refs).toHaveLength(1);
      expect(refs[0].name).toBe('c');
      expect(refs[0].declaration).not.toBeNull();
      expectExactRange(src, refs[0]);
    });

    it('emits references inside CSS function args (drop-shadow)', () => {
      const src = 'let shadowColor = #000;\nlet s = ${ filter: drop-shadow(4px 4px 8px shadowColor); };';
      const refs = styleRefs(analyze(src));
      expect(refs.map((r) => r.name)).toEqual(['shadowColor']);
      expectExactRange(src, refs[0]);
    });

    it('member heads are references; method names are not', () => {
      const src = 'let c = #f00;\nlet s = ${ fill: c.alpha(40%); };';
      const refs = styleRefs(analyze(src));
      expect(refs.map((r) => r.name)).toEqual(['c']);
      expectExactRange(src, refs[0]);
    });

    it('function callee names are never references', () => {
      // `blur` is also a plausible variable name — as a callee it stays CSS.
      const src = 'let blur = 4;\nlet s = ${ filter: blur(2px); };';
      expect(styleRefs(analyze(src))).toHaveLength(0);
    });

    it('CSS keywords and undeclared identifiers are not references', () => {
      const src = 'let s = ${ stroke-linejoin: round; text-anchor: middle; fill: tomato; };';
      expect(styleRefs(analyze(src))).toHaveLength(0);
    });

    it('stdlib/builtin names are not references at CSS level', () => {
      // Evaluator keeps function-valued identifiers as raw CSS; `round` is
      // stdlib but must not be a reference unless the USER declares it.
      const src = 'let s = ${ stroke-linejoin: round; };';
      const info = analyze(src);
      expect(styleRefs(info)).toHaveLength(0);
    });

    it('a user declaration shadowing a CSS keyword IS a reference', () => {
      const src = 'let round = #0f0;\nlet s = ${ stroke: round; };';
      const refs = styleRefs(analyze(src));
      expect(refs.map((r) => r.name)).toEqual(['round']);
      expect(refs[0].declaration).not.toBeNull();
    });

    it('template interpolation identifiers use normal Pathogen semantics', () => {
      const src = "let family = 'Inter';\nfn myFn(x) { return x; }\nlet s = ${ font-family: `${family} ${myFn(2)}`; };";
      const refs = styleRefs(analyze(src));
      expect(refs.map((r) => r.name).sort()).toEqual(['family', 'myFn']);
      for (const r of refs) expectExactRange(src, r);
    });

    it('multiple references on one line each get exact distinct ranges', () => {
      const src = 'let c = #f00;\nlet s = ${ filter: drop-shadow(1px 1px c) drop-shadow(2px 2px c); };';
      const refs = styleRefs(analyze(src));
      expect(refs).toHaveLength(2);
      expect(refs[0].range.start.character).not.toBe(refs[1].range.start.character);
      for (const r of refs) expectExactRange(src, r);
    });

    it('style refs carry full-width ranges (end > start)', () => {
      const src = 'let c = #f00;\nlet s = ${ stroke: c; };';
      const [ref] = styleRefs(analyze(src));
      expect(ref.range.end.character).toBeGreaterThan(ref.range.start.character);
    });

    it('stays lenient on incomplete blocks', () => {
      const src = 'let c = #f00;\nlet s = ${\n  stroke: c;\n  filter: \n};';
      const refs = styleRefs(analyze(src));
      expect(refs.map((r) => r.name)).toEqual(['c']);
    });

    it('declarations after the style block are not in scope', () => {
      const src = 'let s = ${ stroke: later; };\nlet later = #f00;';
      expect(styleRefs(analyze(src))).toHaveLength(0);
    });
  });
});
