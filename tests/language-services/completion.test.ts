import { describe, it, expect } from 'vitest';
import { StringTextDocument } from '../../src/language-services/document';
import { getCompletions, getStyleValueKeywordRun } from '../../src/language-services/completion';
import type { CompletionItem } from '../../src/language-services/completion';

function complete(source: string, line: number, character: number): CompletionItem[] {
  return getCompletions(new StringTextDocument(source), { line, character });
}

// eslint-disable-next-line import/order
import { STYLE_PROPERTY_VALUES } from '../../src/language-services/completion-data-static';
// eslint-disable-next-line import/order
import { CSS_FILTER_FUNCTION_NAMES } from '../../src/evaluator/sanitize';

/** Get completions at end of source. */
function completeAtEnd(source: string): CompletionItem[] {
  const lines = source.split('\n');
  const lastLine = lines.length - 1;
  const lastChar = lines[lastLine].length;
  return complete(source, lastLine, lastChar);
}

function labels(items: CompletionItem[]): string[] {
  return items.map((i) => i.label);
}

describe('getCompletions', () => {
  describe('keywords', () => {
    it('offers keywords at top level', () => {
      const items = completeAtEnd('');
      const names = labels(items);
      expect(names).toContain('let');
      expect(names).toContain('for');
      expect(names).toContain('if');
      expect(names).toContain('fn');
    });

    it('filters by prefix', () => {
      const items = completeAtEnd('le');
      const names = labels(items);
      expect(names).toContain('let');
      expect(names).toContain('lerp');
      expect(names).not.toContain('for');
    });

    it('offers ViewBox among keyword completions', () => {
      const items = completeAtEnd('');
      expect(labels(items)).toContain('ViewBox');
    });
  });

  describe('stdlib functions', () => {
    it('offers stdlib functions', () => {
      const items = completeAtEnd('');
      const names = labels(items);
      expect(names).toContain('circle');
      expect(names).toContain('sin');
      expect(names).toContain('lerp');
      expect(names).toContain('PI');
    });

    it('filters stdlib by prefix', () => {
      const items = completeAtEnd('ci');
      expect(labels(items)).toContain('circle');
      expect(labels(items)).not.toContain('rect');
    });

    it('includes previously-missing stdlib functions', () => {
      const items = completeAtEnd('');
      const names = labels(items);
      // Hyperbolic trig (were missing from completion-data.ts)
      expect(names).toContain('sinh');
      expect(names).toContain('cosh');
      expect(names).toContain('tanh');
      // Polar coordinate helpers
      expect(names).toContain('polarX');
      expect(names).toContain('polarY');
      // Path functions
      expect(names).toContain('radialWedge');
      expect(names).toContain('clippedQuadSpline');
    });

    it('offers ctx', () => {
      const items = completeAtEnd('ct');
      expect(labels(items)).toContain('ctx');
    });

    it('offers hash01 with generated detail and snippet', () => {
      const items = completeAtEnd('ha');
      const item = items.find((i) => i.label === 'hash01');
      expect(item).toBeDefined();
      expect(item!.detail).toBe('hash01(n, seed?) — Deterministic hash of integer n to [0, 1)');
      expect(item!.insertText).toBe('hash01(${1:n})$0');
    });

    it('offers the hash range conveniences and shaping functions', () => {
      const items = completeAtEnd('');
      const names = labels(items);
      expect(names).toContain('hash11');
      expect(names).toContain('hashRange');
      expect(names).toContain('bump');
      expect(names).toContain('easeIn');
      expect(names).toContain('easeOut');
      expect(names).toContain('easeInOut');
      const hashRange = items.find((i) => i.label === 'hashRange');
      expect(hashRange!.detail).toBe('hashRange(n, min, max, seed?) — Deterministic hash of integer n to [min, max)');
      expect(hashRange!.insertText).toBe('hashRange(${1:n}, ${2:min}, ${3:max})$0');
      const bump = items.find((i) => i.label === 'bump');
      expect(bump!.detail).toBe('bump(t, center, spread) — Raised-cosine kernel: 1 at center, easing to 0 at center ± spread');
    });

    it('offers noise and noise2 with generated details', () => {
      const items = completeAtEnd('noi');
      const noise = items.find((i) => i.label === 'noise');
      expect(noise).toBeDefined();
      expect(noise!.detail).toBe('noise(x, seed?) — 1D value noise: smooth deterministic wobble of continuous x, [0, 1)');
      expect(noise!.insertText).toBe('noise(${1:x})$0');
      const noise2 = items.find((i) => i.label === 'noise2');
      expect(noise2).toBeDefined();
      expect(noise2!.detail).toBe('noise2(x, y, seed?) — 2D value noise on the unit lattice, [0, 1)');
      expect(noise2!.insertText).toBe('noise2(${1:x}, ${2:y})$0');
    });

    it('offers smoothstep with generated detail and snippet', () => {
      const items = completeAtEnd('smo');
      const item = items.find((i) => i.label === 'smoothstep');
      expect(item).toBeDefined();
      expect(item!.detail).toBe('smoothstep(edge0, edge1, x) — Hermite ease from 0 to 1 between edges');
      expect(item!.insertText).toBe('smoothstep(${1:edge0}, ${2:edge1}, ${3:x})$0');
    });
  });

  describe('user definitions (scope-aware)', () => {
    it('offers user-declared variables', () => {
      const items = completeAtEnd('let myVar = 10;\n');
      expect(labels(items)).toContain('myVar');
    });

    it('offers user-defined functions', () => {
      const items = completeAtEnd('fn drawCircle(x, y) {\n  circle(x, y, 10);\n}\n');
      expect(labels(items)).toContain('drawCircle');
    });

    it('does not offer variables declared after cursor', () => {
      // Cursor is at end of line 0, myLater is on line 1
      const items = complete('M 0 0\nlet myLater = 10;', 0, 5);
      expect(labels(items)).not.toContain('myLater');
    });

    it('offers loop variables inside loop body', () => {
      // Source must be parseable for scope analysis to work
      const source = 'for (i in 0..10) {\n  M i 0\n}';
      // Cursor at line 1 (inside the loop body)
      const items = complete(source, 1, 4);
      expect(labels(items)).toContain('i');
    });
  });

  describe('member access (dot completions)', () => {
    it('offers ctx properties after ctx.', () => {
      const items = completeAtEnd('M 0 0\nctx.');
      const names = labels(items);
      expect(names).toContain('position');
      expect(names).toContain('start');
      expect(names).toContain('heading');
      expect(names).toContain('transform');
    });

    it('offers Object methods after Object.', () => {
      const items = completeAtEnd('Object.');
      const names = labels(items);
      expect(names).toContain('keys');
      expect(names).toContain('values');
      expect(names).toContain('entries');
    });

    it('offers Point members for Point variables', () => {
      const items = completeAtEnd('let p = Point(10, 20);\np.');
      const names = labels(items);
      expect(names).toContain('x');
      expect(names).toContain('y');
      expect(names).toContain('translate');
      expect(names).toContain('distanceTo');
      expect(names).toContain('angleTo');
      expect(names).toContain('polarTranslate');
      expect(names).toContain('offset');
    });

    it('does not offer phantom Point methods', () => {
      const items = completeAtEnd('let p = Point(10, 20);\np.');
      const names = labels(items);
      expect(names).not.toContain('scale');
      expect(names).not.toContain('distance');
    });

    it('offers Angle members for an angle-suffixed literal variable', () => {
      const items = completeAtEnd('let a = 90deg;\na.');
      const names = labels(items);
      expect(names).toContain('deg');
      expect(names).toContain('rad');
      expect(names).toContain('pi');
      expect(names).toContain('turns');
    });

    it('offers Angle members for a calc() over angle literals', () => {
      const items = completeAtEnd('let a = calc(2 * 45deg);\na.');
      const names = labels(items);
      expect(names).toContain('deg');
      expect(names).toContain('rad');
      expect(names).toContain('pi');
      expect(names).toContain('turns');
    });

    it('offers Angle members after a re-tagging chain (a.toPi().)', () => {
      const items = completeAtEnd('let a = 90deg;\na.toPi().');
      const names = labels(items);
      expect(names).toContain('deg');
      expect(names).toContain('toDeg');
    });

    it('offers Angle members when angle-ness flows through a variable in calc()', () => {
      const items = completeAtEnd('let a = 90deg;\nlet b = calc(a * 2);\nb.');
      const names = labels(items);
      expect(names).toContain('deg');
      expect(names).toContain('rad');
      expect(names).toContain('pi');
      expect(names).toContain('turns');
    });

    it('offers Point members for a Grid origin destructured binding', () => {
      const items = completeAtEnd('let g = Grid(3, 4, { xDim: 10, yDim: 10 });\nlet { origin } = g;\norigin.');
      const names = labels(items);
      expect(names).toContain('x');
      expect(names).toContain('y');
      expect(names).toContain('translate');
    });

    it('offers Point members for an aliased destructured binding', () => {
      const items = completeAtEnd('let g = Grid(3, 4, { xDim: 10, yDim: 10 });\nlet { origin: o } = g;\no.');
      const names = labels(items);
      expect(names).toContain('x');
      expect(names).toContain('translate');
    });

    it('offers no phantom members for numeric destructured bindings', () => {
      const items = completeAtEnd('let g = Grid(3, 4, { xDim: 10, yDim: 10 });\nlet { rows } = g;\nrows.');
      const names = labels(items);
      expect(names).not.toContain('x');
      expect(names).not.toContain('cols');
      expect(names).not.toContain('translate');
    });

    it('offers Color members for a MeshPoint color destructured binding', () => {
      const items = completeAtEnd(
        "let mg = MeshGradient('m', 100, 100, 2, 2) {|gr|\n};\nlet mp = mg.getPoint(0, 0);\nlet { color } = mp;\ncolor.",
      );
      const names = labels(items);
      expect(names).toContain('hex');
      expect(names).toContain('lighten');
      expect(names).toContain('mix');
    });

    it('offers Point members for a ctx destructured binding', () => {
      const items = completeAtEnd('M 0 0\nlet { position } = ctx;\nposition.');
      const names = labels(items);
      expect(names).toContain('x');
      expect(names).toContain('y');
    });

    it('offers no members for numeric ctx.position destructured bindings', () => {
      const items = completeAtEnd('M 0 0\nlet { x } = ctx.position;\nx.');
      const names = labels(items);
      expect(names).not.toContain('translate');
      expect(names).not.toContain('position');
    });

    it('offers viewbox properties after viewbox.', () => {
      const items = completeAtEnd('define ViewBox(0, 0, 200, 100);\nviewbox.');
      const names = labels(items);
      expect(names).toContain('originX');
      expect(names).toContain('originY');
      expect(names).toContain('width');
      expect(names).toContain('height');
    });
  });

  describe('destructuring pattern braces', () => {
    it('offers viewbox data properties inside the pattern', () => {
      const source = 'define ViewBox(0, 0, 200, 100);\nlet {  } = viewbox;';
      const items = complete(source, 1, 5);
      const names = labels(items);
      expect(names).toContain('originX');
      expect(names).toContain('originY');
      expect(names).toContain('width');
      expect(names).toContain('height');
    });

    it('offers Grid data properties inside the pattern', () => {
      const source = 'let g = Grid(3, 4, { xDim: 10, yDim: 10 });\nlet {  } = g;';
      const items = complete(source, 1, 5);
      const names = labels(items);
      expect(names).toContain('rows');
      expect(names).toContain('cols');
      expect(names).toContain('origin');
      expect(names).toContain('width');
    });

    it('does not offer methods or keywords inside the pattern', () => {
      const source = 'let g = Grid(3, 4, { xDim: 10, yDim: 10 });\nlet {  } = g;';
      const items = complete(source, 1, 5);
      const names = labels(items);
      expect(names).not.toContain('getPoint');
      expect(names).not.toContain('fill');
      expect(names).not.toContain('let');
      expect(names).not.toContain('for');
    });

    it('excludes keys already used in the pattern', () => {
      const source = 'let g = Grid(3, 4, { xDim: 10, yDim: 10 });\nlet { rows,  } = g;';
      const items = complete(source, 1, 11);
      const names = labels(items);
      expect(names).not.toContain('rows');
      expect(names).toContain('cols');
    });

    it('filters by the typed prefix', () => {
      const source = 'let g = Grid(3, 4, { xDim: 10, yDim: 10 });\nlet { or } = g;';
      const items = complete(source, 1, 8);
      const names = labels(items);
      expect(names).toContain('origin');
      expect(names).not.toContain('rows');
    });

    it('offers Point properties for a constructor RHS', () => {
      const source = 'let {  } = Point(1, 2);';
      const items = complete(source, 0, 5);
      const names = labels(items);
      expect(names).toContain('x');
      expect(names).toContain('y');
      expect(names).not.toContain('translate');
    });

    it('offers object-literal keys for a literal-typed RHS variable', () => {
      const source = 'let obj = { a: 1, b: 2 };\nlet {  } = obj;';
      const items = complete(source, 1, 5);
      const names = labels(items);
      expect(names).toContain('a');
      expect(names).toContain('b');
    });

    it('returns nothing when the RHS is missing', () => {
      const items = completeAtEnd('let { ');
      expect(items).toEqual([]);
    });

    it('does not fire for object literals or block braces', () => {
      // let obj = { — object literal, not a pattern
      const literalItems = completeAtEnd('let obj = { ');
      expect(labels(literalItems)).not.toContain('rows');
      // apply { — block body: keywords must still appear
      const applyItems = completeAtEnd("define PathLayer('p') ${}\nlayer('p').apply {\n");
      expect(labels(applyItems)).toContain('let');
    });

    it('does not fire for identifiers that merely end in "let"', () => {
      // outlet { — in-progress/malformed input; normal completions must survive
      const items = completeAtEnd('outlet {\n');
      expect(labels(items)).toContain('let');
      const violetItems = completeAtEnd('violet { ');
      expect(labels(violetItems)).toContain('let');
    });

    it('offers Grid members for Grid variables', () => {
      const items = completeAtEnd('let g = Grid(3, 4, { xDim: 10, yDim: 10 });\ng.');
      const names = labels(items);
      expect(names).toContain('rows');
      expect(names).toContain('cols');
      expect(names).toContain('xDim');
      expect(names).toContain('yDim');
      expect(names).toContain('origin');
      expect(names).toContain('width');
      expect(names).toContain('height');
      expect(names).toContain('get');
      expect(names).toContain('set');
      expect(names).toContain('getPoint');
      expect(names).toContain('fill');
      expect(names).toContain('forEach');
      expect(names).toContain('map');
      expect(names).toContain('sample');
      expect(names).toContain('sampleBilinear');
      expect(names).toContain('sampleNearest');
    });

    it('offers PathBlock members for path block variables', () => {
      const items = completeAtEnd('let shape = @{\n  M 0 0\n  L 100 0\n};\nshape.');
      const names = labels(items);
      expect(names).toContain('draw');
      expect(names).toContain('get');
      expect(names).toContain('boundingBox');
      expect(names).toContain('length');
    });

    it('offers array members for array variables', () => {
      const items = completeAtEnd('let items = [1, 2, 3];\nitems.');
      const names = labels(items);
      expect(names).toContain('length');
      expect(names).toContain('map');
      expect(names).toContain('push');
      expect(names).toContain('pop');
      expect(names).toContain('mapSlice');
      expect(names).toContain('reverse');
      expect(names).toContain('sort');

      const reverse = items.find((i) => i.label === 'reverse')!;
      expect(reverse.detail).toContain('Reversed copy');
      expect(reverse.insertText).toBe('reverse()$0');

      const sort = items.find((i) => i.label === 'sort')!;
      expect(sort.detail).toContain('Sorted copy');
      expect(sort.insertText).toBe('sort()$0');
    });

    it('does not offer phantom Array methods', () => {
      const items = completeAtEnd('let a = [1, 2, 3];\na.');
      const names = labels(items);
      expect(names).not.toContain('filter');
      expect(names).not.toContain('flatMap');
      expect(names).not.toContain('indexOf');
    });

    it('offers string members for string variables', () => {
      const items = completeAtEnd('let name = "hello";\nname.');
      const names = labels(items);
      expect(names).toContain('length');
      expect(names).toContain('split');
      expect(names).toContain('includes');
    });

    it('filters member completions by prefix', () => {
      const items = completeAtEnd('ctx.pos');
      expect(labels(items)).toContain('position');
      expect(labels(items)).not.toContain('start');
    });
  });

  describe('deep property access', () => {
    it('offers Point members for ctx.position.', () => {
      const items = completeAtEnd('M 0 0\nctx.position.');
      const names = labels(items);
      expect(names).toContain('x');
      expect(names).toContain('y');
    });

    it('offers transform sub-properties for ctx.transform.', () => {
      const items = completeAtEnd('M 0 0\nctx.transform.');
      const names = labels(items);
      expect(names).toContain('translate');
      expect(names).toContain('rotate');
      expect(names).toContain('scale');
      expect(names).toContain('reset');
    });
  });

  describe('enum completions', () => {
    it('offers enum names at top level', () => {
      const items = completeAtEnd('');
      const names = labels(items);
      expect(names).toContain('GridPatternType');
      expect(names).toContain('Easing');
      expect(names).toContain('BBoxAnchor');
    });

    it('offers all 12 enum names', () => {
      const items = completeAtEnd('');
      const names = labels(items);
      for (const enumName of [
        'Easing', 'Interpolation', 'SpreadMethod', 'GradientUnits',
        'Direction', 'ConicSpread', 'InnerFill', 'TopoMethod',
        'BBoxAnchor', 'GridPatternType', 'HexagonOrientation', 'VerticalAnchor',
      ]) {
        expect(names).toContain(enumName);
      }
    });

    it('offers enum members after enum name dot', () => {
      const items = completeAtEnd('GridPatternType.');
      const names = labels(items);
      expect(names).toContain('Shape');
      expect(names).toContain('Dot');
      expect(names).toContain('Intersection');
      expect(names).toContain('Partial');
    });

    it('offers Easing members after Easing.', () => {
      const items = completeAtEnd('Easing.');
      const names = labels(items);
      expect(names).toContain('Linear');
      expect(names).toContain('Smoothstep');
      expect(names).toContain('EaseIn');
      expect(names).toContain('EaseOut');
      expect(names).toContain('EaseInOut');
    });

    it('filters enum members by prefix', () => {
      const items = completeAtEnd('Easing.E');
      const names = labels(items);
      expect(names).toContain('EaseIn');
      expect(names).toContain('EaseOut');
      expect(names).toContain('EaseInOut');
      expect(names).not.toContain('Linear');
      expect(names).not.toContain('Smoothstep');
    });

    it('filters enum names by prefix', () => {
      const items = completeAtEnd('Grid');
      const names = labels(items);
      expect(names).toContain('GridPatternType');
      expect(names).not.toContain('Easing');
    });
  });

  describe('layer member completions', () => {
    it('offers PathLayer members', () => {
      const items = completeAtEnd("let pLayer = PathLayer('main');\npLayer.");
      const names = labels(items);
      expect(names).toContain('name');
      expect(names).toContain('styles');
      expect(names).toContain('ctx');
    });

    it('offers TextLayer members', () => {
      const items = completeAtEnd("let tLayer = TextLayer('text');\ntLayer.");
      const names = labels(items);
      expect(names).toContain('name');
      expect(names).toContain('styles');
    });

    it('offers GroupLayer members including append', () => {
      const items = completeAtEnd("let gLayer = GroupLayer('group');\ngLayer.");
      const names = labels(items);
      expect(names).toContain('name');
      expect(names).toContain('styles');
      expect(names).toContain('ctx');
      expect(names).toContain('append');
    });
  });

  describe('Color namespace completions', () => {
    it('offers Color methods after Color.', () => {
      const items = completeAtEnd('Color.');
      const names = labels(items);
      expect(names).toContain('mix');
      expect(names).toContain('palette');
      expect(names).toContain('lightDark');
    });
  });

  describe('PolarVector member completions', () => {
    it('offers PolarVector members', () => {
      const items = completeAtEnd('let pv = PolarVector(45, 10);\npv.');
      const names = labels(items);
      expect(names).toContain('angle');
      expect(names).toContain('distance');
      expect(names).toContain('turn');
      expect(names).toContain('scale');
      expect(names).toContain('mirror');
    });
  });

  describe('PathBlock geometry methods', () => {
    it('offers chamfer and fillet methods on PathBlock', () => {
      const items = completeAtEnd('let shape = @{\n  M 0 0\n  L 100 0\n  L 100 100\n  Z\n};\nshape.');
      const names = labels(items);
      expect(names).toContain('chamfer');
      expect(names).toContain('fillet');
      expect(names).toContain('union');
      expect(names).toContain('difference');
      expect(names).toContain('subPath');
      expect(names).toContain('intersectionPoints');
    });
  });

  describe('named-label queries (segment/point/vertex)', () => {
    it('offers segment/point/vertex on a PathBlock variable', () => {
      const items = completeAtEnd('let shape = @{\n  M 0 0\n  L 100 0\n};\nshape.');
      const names = labels(items);
      expect(names).toContain('segment');
      expect(names).toContain('point');
      expect(names).toContain('vertex');
    });

    it('derives a quoted-string snippet for segment()', () => {
      const items = completeAtEnd('let shape = @{\n  M 0 0\n};\nshape.');
      const segment = items.find((i) => i.label === 'segment');
      expect(segment?.isSnippet).toBe(true);
      expect(segment?.insertText).toBe("segment('${1:name}')$0");
    });

    it('offers VertexHandle members (fillet/chamfer + x/y/point/label) after pb.vertex(...)', () => {
      const items = completeAtEnd("let shape = @{\n  M 0 0\n  L 100 0 as endpoint('corner')\n};\nshape.vertex('corner').");
      const names = labels(items);
      expect(names).toContain('fillet');
      expect(names).toContain('chamfer');
      expect(names).toContain('ellipticalFillet');
      expect(names).toContain('x');
      expect(names).toContain('y');
      expect(names).toContain('point');
      expect(names).toContain('label');
    });

    it('keeps segment() a PathBlock on a PathBlock receiver', () => {
      const items = completeAtEnd("let shape = @{\n  M 0 0\n};\nshape.segment('a').");
      const names = labels(items);
      // `project` is PathBlock-only (ProjectedPath lacks it) — proves the
      // chain resolved to PathBlock, not ProjectedPath.
      expect(names).toContain('project');
      expect(names).toContain('segment');
      expect(names).toContain('drawTo');
    });

    it('offers segment/point/vertex on a ProjectedPath variable', () => {
      const items = completeAtEnd('let shape = @{\n  M 0 0\n};\nlet p = shape.project(0, 0);\np.');
      const names = labels(items);
      expect(names).toContain('segment');
      expect(names).toContain('point');
      expect(names).toContain('vertex');
    });

    it('offers segment/point/vertex on a PathLayer variable', () => {
      const items = completeAtEnd("let a = layer('main');\na.");
      const names = labels(items);
      expect(names).toContain('segment');
      expect(names).toContain('point');
      expect(names).toContain('vertex');
    });

    it('offers segment/point/vertex on a direct layer() call', () => {
      const items = completeAtEnd("layer('a').");
      const names = labels(items);
      expect(names).toContain('segment');
      expect(names).toContain('point');
      expect(names).toContain('vertex');
      // The direct-call resolution also surfaces the base PathLayer members,
      // which were previously unreachable without binding to a variable.
      expect(names).toContain('apply');
      expect(names).toContain('ctx');
    });
  });

  describe('style block completions', () => {
    it('offers style properties inside ${ }', () => {
      const items = completeAtEnd("define PathLayer('main') ${ ");
      const names = labels(items);
      expect(names).toContain('stroke');
      expect(names).toContain('fill');
      expect(names).toContain('stroke-width');
      expect(names).toContain('opacity');
      // Should NOT offer regular keywords/stdlib inside style block
      expect(names).not.toContain('let');
      expect(names).not.toContain('circle');
    });

    it('does not offer style properties outside ${ }', () => {
      const items = completeAtEnd('let x = 10;\n');
      const names = labels(items);
      expect(names).not.toContain('stroke');
      expect(names).not.toContain('fill');
    });


    it('offers user color variables in style value position (user bug 2026-04-11)', () => {
      // In a style block value position (after `:`), the engine should
      // return user-defined variables — not more style property names.
      // Uses the `let layer = PathLayer(...) ${...};` form which is known
      // to parse strictly, so analyzeScopes() can see the let declarations
      // above the style block.
      const source =
        "let bgColor = Color('#ff6b6b');\n" +       // line 0
        "let textColor = Color('#2f2f2f');\n" +     // line 1
        "let bg = PathLayer('bg') \${\n" +          // line 2
        '  fill: bgColor;\n' +                      // line 3
        '  stroke: bgColor;\n' +                    // line 4
        '};';                                       // line 5
      // Cursor at line 3, character 8 — right after `  fill: ` (before
      // the `bgColor` that the user is typing).
      const items = complete(source, 3, 8);
      const names = labels(items);
      expect(names).toContain('bgColor');
      expect(names).toContain('textColor');
      // Also surface CSS value keywords
      expect(names).toContain('none');
      expect(names).toContain('transparent');
      expect(names).toContain('currentColor');
      // And NOT the property-name set (we're past the colon)
      expect(names).not.toContain('fill');
      expect(names).not.toContain('stroke-width');
    });

    it('still offers property names before the first colon on a new line', () => {
      // After a `;` (end of the previous entry), we're back in property
      // name position and should see CSS property completions again.
      // Full parseable source; cursor between `fill: bgColor;` and the
      // next line's content.
      const source =
        "let bgColor = Color('#ff6b6b');\n" + // line 0
        "let bg = PathLayer('bg') \${\n" +    // line 1
        '  fill: bgColor;\n' +                // line 2
        '  stroke: bgColor;\n' +              // line 3
        '};';                                 // line 4
      // Cursor at line 3, character 2 — right after `  ` (indent) and
      // before `stroke`. We're in property-name position.
      const items = complete(source, 3, 2);
      const names = labels(items);
      expect(names).toContain('stroke');
      expect(names).toContain('fill');
      expect(names).toContain('opacity');
      // User vars are a value-position concept
      expect(names).not.toContain('bgColor');
    });
  });

  describe('Color instance completions', () => {
    it('offers Color methods after Color() constructor', () => {
      const items = completeAtEnd("let c = Color('#ff0000');\nc.");
      const names = labels(items);
      expect(names).toContain('lighten');
      expect(names).toContain('darken');
      expect(names).toContain('alpha');
      expect(names).toContain('hueShift');
      expect(names).toContain('css');
      expect(names).toContain('hex');
    });

    it('offers Color methods for hex literal variables', () => {
      const items = completeAtEnd('let c = #ff0000;\nc.');
      const names = labels(items);
      expect(names).toContain('lighten');
      expect(names).toContain('complement');
    });

    it('offers Color methods after chained method', () => {
      const items = completeAtEnd("let c = Color('#f00');\nc.lighten(0.2).");
      const names = labels(items);
      expect(names).toContain('darken');
      expect(names).toContain('alpha');
      expect(names).toContain('css');
    });
  });

  describe('method return type completions', () => {
    it('offers BoundingBox members after .boundingBox()', () => {
      const items = completeAtEnd("let s = @{ h 60 v 60 };\ns.boundingBox().");
      const names = labels(items);
      expect(names).toContain('x');
      expect(names).toContain('y');
      expect(names).toContain('width');
      expect(names).toContain('height');
    });

    it('infers BoundingBox from variable assignment', () => {
      const items = completeAtEnd("let s = @{ h 60 };\nlet bb = s.boundingBox();\nbb.");
      const names = labels(items);
      expect(names).toContain('x');
      expect(names).toContain('width');
    });

    it('offers Point members after .get()', () => {
      const items = completeAtEnd("let s = @{ h 60 v 60 };\ns.get(0.5).");
      const names = labels(items);
      expect(names).toContain('x');
      expect(names).toContain('y');
    });
  });

  describe('layer() and stdlib return type inference', () => {
    it('offers PathLayer members for layer() result', () => {
      const items = completeAtEnd("let ref = layer('main');\nref.");
      const names = labels(items);
      expect(names).toContain('apply');
      expect(names).toContain('ctx');
      expect(names).toContain('name');
    });

    it('offers apply in PathLayer completions', () => {
      const items = completeAtEnd("let bg = PathLayer('bg');\nbg.");
      const names = labels(items);
      expect(names).toContain('apply');
    });

    it('offers PathLayer members after style block and apply block (user bug 2026-04-10)', () => {
      // Exact user scenario that was reported as broken: declaration with a
      // style block, an apply block on the next line, then dot-access on a
      // new line. The scope/type inference must survive the intervening
      // incomplete statement at the bottom of the buffer.
      const source =
        "let bg = PathLayer('bg') ${ fill: '#f00'; stroke: none; };\n" +
        'bg.apply {\n' +
        '  rect(0, 0, 600, 600);\n' +
        '}\n' +
        'bg.';
      const items = completeAtEnd(source);
      const names = labels(items);
      expect(names).toContain('apply');
      expect(names).toContain('ctx');
      expect(names).toContain('name');
      expect(names).toContain('styles');
    });

    it('offers PathLayer members with MULTILINE style block (user bug 2026-04-11)', () => {
      // User-reported: the real-world scenario has the style block spanning
      // multiple lines. Verify inferType's regex still matches across
      // newlines between `PathLayer(` and the dot access.
      const source =
        "let bg = PathLayer('bg') \${\n" +
        "  fill: '#ff6b6b';\n" +
        '  stroke: none;\n' +
        '};\n' +
        'bg.apply {\n' +
        '  rect(0, 0, 600, 600);\n' +
        '}\n' +
        '\n' +
        'bg.';
      const items = completeAtEnd(source);
      const names = labels(items);
      expect(names).toContain('apply');
      expect(names).toContain('ctx');
      expect(names).toContain('name');
      expect(names).toContain('styles');
      // Regression guard: the popup must NOT contain top-level keywords,
      // which would indicate the member-access path wasn't taken.
      expect(names).not.toContain('let');
      expect(names).not.toContain('for');
      expect(names).not.toContain('fn');
    });

    it('infers PathBlock from circle() result', () => {
      const items = completeAtEnd('let circ = circle(50, 50, 25);\ncirc.');
      const names = labels(items);
      expect(names).toContain('boundingBox');
      expect(names).toContain('drawTo');
      expect(names).toContain('length');
    });
  });

  describe('type flow analysis', () => {
    it('propagates type through variable assignment', () => {
      const items = completeAtEnd('let shape = @{ h 60 v 60 };\nlet copy = shape;\ncopy.');
      const names = labels(items);
      expect(names).toContain('boundingBox');
      expect(names).toContain('drawTo');
    });

    it('infers Point type for map block param over Point array', () => {
      const items = completeAtEnd('let pts = [Point(0, 0)];\nlet r = pts.map() {|pt|\n  pt.');
      const names = labels(items);
      expect(names).toContain('x');
      expect(names).toContain('y');
      expect(names).toContain('translate');
    });

    it('infers object props for map block param over object array', () => {
      const items = completeAtEnd('let data = [{ x: 60, y: 160, name: "a" }];\nlet r = data.map() {|item|\n  item.');
      const names = labels(items);
      expect(names).toContain('x');
      expect(names).toContain('y');
      expect(names).toContain('name');
    });

    it('infers object props for destructured for-each loop var', () => {
      const items = completeAtEnd('let data = [{ x: 60, y: 160, name: "a" }];\nfor ([d, i] in data) {\n  d.');
      const names = labels(items);
      expect(names).toContain('x');
      expect(names).toContain('y');
      expect(names).toContain('name');
    });

    it('infers Point type for simple for-each loop var', () => {
      const items = completeAtEnd('let pts = [Point(0, 0)];\nfor (pt in pts) {\n  pt.');
      const names = labels(items);
      expect(names).toContain('x');
      expect(names).toContain('y');
    });

    it('infers object properties from direct object literal', () => {
      const items = completeAtEnd('let cfg = { title: "test", innerR: 50 };\ncfg.');
      const names = labels(items);
      expect(names).toContain('title');
      expect(names).toContain('innerR');
    });
  });

  describe('completion item structure', () => {
    it('includes detail for stdlib functions', () => {
      const items = completeAtEnd('circ');
      const circle = items.find((i) => i.label === 'circle');
      expect(circle).toBeDefined();
      expect(circle!.detail).toContain('circle(cx, cy, r)');
    });

    it('has sortText for ordering', () => {
      const items = completeAtEnd('');
      expect(items.every((i) => typeof i.sortText === 'string')).toBe(true);
    });

    it('keywords have snippet insertText', () => {
      const items = completeAtEnd('');
      const letItem = items.find((i) => i.label === 'let');
      expect(letItem).toBeDefined();
      expect(letItem!.isSnippet).toBe(true);
      expect(letItem!.insertText).toContain('${1:name}');
    });
  });

  describe('block-start snippets at statement start', () => {
    it('@ offers @font and @{ snippets', () => {
      const names = labels(completeAtEnd('@'));
      expect(names).toContain('@font');
      expect(names).toContain('@{');
    });

    it('@f filters to @font and hides @{', () => {
      const names = labels(completeAtEnd('@f'));
      expect(names).toContain('@font');
      expect(names).not.toContain('@{');
    });

    it('@font still includes @font', () => {
      expect(labels(completeAtEnd('@font'))).toContain('@font');
    });

    it('& offers &{ snippet', () => {
      expect(labels(completeAtEnd('&'))).toContain('&{');
    });

    it('@ in expression position (after =) offers @{ but NOT @font', () => {
      const names = labels(completeAtEnd('let x = @'));
      expect(names).toContain('@{');
      expect(names).not.toContain('@font');
    });

    it('& in expression position (after =) offers &{', () => {
      expect(labels(completeAtEnd('let x = &'))).toContain('&{');
    });

    it('@ after + offers @{ in expression position', () => {
      const names = labels(completeAtEnd('let x = a + @'));
      expect(names).toContain('@{');
      expect(names).not.toContain('@font');
    });

    it('@ after identifier (mid-word) does NOT offer block snippets', () => {
      const names = labels(completeAtEnd('let x = abc@'));
      expect(names).not.toContain('@font');
      expect(names).not.toContain('@{');
    });

    it('after } offers block snippets at statement start', () => {
      expect(labels(completeAtEnd('@{ M 0 0 }\n@'))).toContain('@font');
    });

    it('after ; offers block snippets at statement start', () => {
      expect(labels(completeAtEnd('let x = 1;\n@'))).toContain('@font');
    });

    it('@ snippet entries are marked isSnippet', () => {
      const items = completeAtEnd('@');
      const fontItem = items.find((i) => i.label === '@font');
      expect(fontItem?.isSnippet).toBe(true);
      expect(fontItem?.insertText).toBe('@font "${1:Inconsolata}" ${2:400};');
    });
  });

  describe('declaration snippets via $', () => {
    it('$ at statement start offers let/PathLayer/TextLayer', () => {
      const names = labels(completeAtEnd('$'));
      expect(names).toContain('let');
      expect(names).toContain('PathLayer');
      expect(names).toContain('TextLayer');
    });

    it('$ after ; offers declaration snippets', () => {
      const names = labels(completeAtEnd('let x = 1;\n$'));
      expect(names).toContain('PathLayer');
    });
  });

  describe('style-block snippet via $ in expression position', () => {
    it('$ after = offers ${ ... } style block', () => {
      const items = completeAtEnd('let foo = $');
      const styleBlock = items.find((i) => i.label === '${...}' && i.detail.includes('Style block'));
      expect(styleBlock).toBeDefined();
      expect(styleBlock!.insertText).toBe('${\n\t$0\n}');
    });

    it('$ after ( offers style block', () => {
      const items = completeAtEnd('foo($');
      expect(items.find((i) => i.label === '${...}' && i.detail.includes('Style block'))).toBeDefined();
    });

    it('$ at statement start does NOT offer style block (declaration snippets instead)', () => {
      const items = completeAtEnd('$');
      expect(items.find((i) => i.label === '${...}' && i.detail.includes('Style block'))).toBeUndefined();
    });
  });

  describe('template interpolation snippet', () => {
    it('inside backtick string offers ${...}', () => {
      const names = labels(completeAtEnd('text(0,0)`hello $'));
      expect(names).toContain('${...}');
    });

    it('inside backtick string after ${ offers ${...}', () => {
      const names = labels(completeAtEnd('text(0,0)`hello ${'));
      expect(names).toContain('${...}');
    });

    it('regression: NO style props inside backtick interpolation', () => {
      const names = labels(completeAtEnd('text(0,0)`hello ${'));
      expect(names).not.toContain('stroke');
      expect(names).not.toContain('fill');
    });

    it('regression: real style block still gets style props', () => {
      const names = labels(completeAtEnd("define PathLayer('a') ${\n  "));
      expect(names).toContain('stroke');
      expect(names).toContain('fill');
    });

    it('${...} insertText strips to literal ${expr}', () => {
      const item = completeAtEnd('text(0,0)`hello $').find((i) => i.label === '${...}');
      expect(item?.insertText).toBe('${${1:expr}}');
    });

    it('outside backticks does NOT offer ${...}', () => {
      const names = labels(completeAtEnd('let x = 1;\n'));
      expect(names).not.toContain('${...}');
    });
  });

  describe('Filter constructors', () => {
    it('lists all seven filter constructors in top-level completions', () => {
      const items = completeAtEnd('');
      const names = labels(items);
      expect(names).toContain('NoiseFilter');
      expect(names).toContain('GlowFilter');
      expect(names).toContain('EmbossFilter');
      expect(names).toContain('ElevationShadowFilter');
      expect(names).toContain('InnerShadowFilter');
      expect(names).toContain('PixelateFilter');
      expect(names).toContain('MotionBlurFilter');
    });

    it('offers MotionBlurFilter members on the let-bound variable and block param', () => {
      const onVar = labels(completeAtEnd('let m = MotionBlurFilter() {|f| };\nm.'));
      for (const member of ['id', 'type', 'distance', 'angle', 'samples']) {
        expect(onVar).toContain(member);
      }
      const onParam = labels(completeAtEnd('let m = MotionBlurFilter() {|f| f.'));
      expect(onParam).toContain('distance');
      expect(onParam).toContain('type');
    });

    it('offers NoiseFilter members on the let-bound variable', () => {
      const items = completeAtEnd('let n = NoiseFilter() {|f| };\nn.');
      const names = labels(items);
      expect(names).toContain('id');
      expect(names).toContain('style');
      expect(names).toContain('scale');
      expect(names).toContain('octaves');
      expect(names).toContain('amount');
      expect(names).toContain('monochrome');
      expect(names).toContain('seed');
      expect(names).toContain('blend');
      expect(names).toContain('contrast');
      expect(names).toContain('stitch');
    });

    it('offers NoiseFilter members on the trailing-block bound parameter', () => {
      const items = completeAtEnd('let n = NoiseFilter() {|f|\n  f.');
      const names = labels(items);
      expect(names).toContain('style');
      expect(names).toContain('amount');
      expect(names).toContain('blend');
    });

    it('offers GlowFilter members on the let-bound variable', () => {
      const items = completeAtEnd('let g = GlowFilter() {|f| };\ng.');
      const names = labels(items);
      expect(names).toContain('mode');
      expect(names).toContain('color');
      expect(names).toContain('radius');
      expect(names).toContain('spread');
      expect(names).toContain('opacity');
    });

    it('offers GlowFilter members on the trailing-block bound parameter', () => {
      const items = completeAtEnd('let g = GlowFilter() {|f|\n  f.');
      const names = labels(items);
      expect(names).toContain('mode');
      expect(names).toContain('radius');
    });

    it('offers EmbossFilter members', () => {
      const items = completeAtEnd('let e = EmbossFilter() {|f| };\ne.');
      const names = labels(items);
      expect(names).toContain('angle');
      expect(names).toContain('elevation');
      expect(names).toContain('depth');
      expect(names).toContain('strength');
      expect(names).toContain('shininess');
      expect(names).toContain('lightColor');
      expect(names).toContain('smooth');
    });

    it('offers ElevationShadowFilter members', () => {
      const items = completeAtEnd('let s = ElevationShadowFilter() {|f| };\ns.');
      const names = labels(items);
      expect(names).toContain('elevation');
      expect(names).toContain('color');
      expect(names).toContain('direction');
      expect(names).toContain('tightness');
    });

    it('offers InnerShadowFilter members', () => {
      const items = completeAtEnd('let i = InnerShadowFilter() {|f| };\ni.');
      const names = labels(items);
      expect(names).toContain('offsetX');
      expect(names).toContain('offsetY');
      expect(names).toContain('blur');
      expect(names).toContain('color');
      expect(names).toContain('opacity');
    });

    it('offers PixelateFilter members for both positional and block forms', () => {
      const positional = labels(completeAtEnd('let p = PixelateFilter(10, 10, 5);\np.'));
      expect(positional).toContain('width');
      expect(positional).toContain('height');
      expect(positional).toContain('radius');

      const block = labels(completeAtEnd('let p = PixelateFilter() {|f| };\np.'));
      expect(block).toContain('width');
      expect(block).toContain('height');
      expect(block).toContain('radius');
    });
  });

  // Regression suite for the 2026-07-13 language-service audit: snippet
  // templates on method completions, corrected drawTo docs, defs-constructor
  // completions, and hyphen-aware style-property filtering.
  describe('method snippet templates (generated insertText)', () => {
    it('layer.apply inserts a brace template with cursor inside', () => {
      const items = completeAtEnd("let bg = PathLayer('bg');\nbg.ap");
      const apply = items.find((i) => i.label === 'apply');
      expect(apply).toBeDefined();
      expect(apply!.isSnippet).toBe(true);
      expect(apply!.insertText).toBe('apply {\n\t$0\n}');
    });

    it('PathBlock drawTo documents (x, y) — not layerName — and derives a parens template', () => {
      const items = completeAtEnd('let pb = @{ m 0 0 l 10 10 };\npb.dr');
      const drawTo = items.find((i) => i.label === 'drawTo');
      expect(drawTo).toBeDefined();
      expect(drawTo!.detail).toBe('drawTo(x, y) — Draw path translated to (x, y); returns a ProjectedPath');
      expect(drawTo!.insertText).toBe('drawTo(${1:x}, ${2:y})$0');
      expect(drawTo!.isSnippet).toBe(true);
    });

    it('stdlib functions derive parens templates with named placeholders', () => {
      const items = completeAtEnd('cir');
      const circle = items.find((i) => i.label === 'circle');
      expect(circle!.insertText).toBe('circle(${1:cx}, ${2:cy}, ${3:r})$0');
    });

    it('array map uses its @snippet block template, not a parens call', () => {
      const items = completeAtEnd('let arr = [1, 2, 3];\narr.ma');
      const map = items.find((i) => i.label === 'map');
      expect(map!.insertText).toBe('map {|${1:item}|\n\treturn $0;\n}');
    });
  });

  describe('defs constructor completions', () => {
    it('offers the defs constructors at top level with binding-block snippets', () => {
      const items = completeAtEnd('');
      const names = labels(items);
      for (const ctor of ['Mask', 'ClipPath', 'LinearGradient', 'RadialGradient', 'ConicGradient', 'MeshGradient', 'FreeformGradient', 'TopoGradient', 'Pattern', 'Marker']) {
        expect(names).toContain(ctor);
      }
      const marker = items.find((i) => i.label === 'Marker');
      expect(marker!.isSnippet).toBe(true);
      expect(marker!.insertText).toBe("Marker('${1:id}', ${2:10}, ${3:10}) {|${4:m}|\n\t$0\n}");
    });

    it('completes members on a Marker binding-block param', () => {
      const items = completeAtEnd("Marker('dot', 10, 10) {|m|\n  m.");
      const names = labels(items);
      expect(names).toContain('append');
      expect(names).toContain('refX');
      expect(names).toContain('orient');
    });

    it('completes members on a let-assigned Mask', () => {
      const names = labels(completeAtEnd("let mk = Mask('fade');\nmk."));
      expect(names).toEqual(expect.arrayContaining(['id', 'append']));
    });

    it('resolves mesh getPoint() chains to MeshPoint members', () => {
      const names = labels(completeAtEnd("MeshGradient('m', 100, 100, 2, 2) {|g|\n  g.getPoint(0, 0)."));
      expect(names).toEqual(expect.arrayContaining(['x', 'y', 'color', 'translate']));
    });

    it('resolves grid getPoint() chains to Point members (per-type return map)', () => {
      const names = labels(completeAtEnd('let g = Grid(4, 4);\nlet p = g.getPoint(0, 0).'));
      expect(names).toContain('distanceTo');
      expect(names).not.toContain('color');
    });

    it('completes PathBlock namespace members', () => {
      const names = labels(completeAtEnd('PathBlock.'));
      expect(names).toContain('fromGlyph');
    });
  });

  describe('style property-name prefix filtering (hyphen-aware)', () => {
    it('narrows to stroke-* properties for a hyphenated prefix', () => {
      const names = labels(completeAtEnd('let s = ${ stroke-w'));
      expect(names).toContain('stroke-width');
      expect(names).not.toContain('fill');
    });

    it('still offers all properties with no prefix', () => {
      const names = labels(completeAtEnd('let s = ${ '));
      expect(names).toContain('stroke-width');
      expect(names).toContain('fill');
    });
  });

  describe('style property-name declaration templates', () => {
    it('property names insert `name: $0;` with the cursor in value position', () => {
      const items = completeAtEnd('let s = ${ stroke-w');
      const sw = items.find((i) => i.label === 'stroke-width');
      expect(sw).toBeDefined();
      expect(sw!.isSnippet).toBe(true);
      expect(sw!.insertText).toBe('stroke-width: $0;');
    });

    it('inserts just the name when a colon already follows the cursor', () => {
      // Cursor sits after `stroke-w`, before the existing `: 2;`.
      const source = 'let s = ${ stroke-w: 2; };';
      const cursor = source.indexOf(': 2;');
      const items = complete(source, 0, cursor);
      const sw = items.find((i) => i.label === 'stroke-width');
      expect(sw).toBeDefined();
      expect(sw!.insertText).toBeUndefined();
      expect(sw!.isSnippet).toBeUndefined();
    });
  });

  describe('style value-position suggestions', () => {
    it('offers the property-specific enumerated values right after the colon', () => {
      const names = labels(completeAtEnd('let s = ${ stroke-linecap: '));
      expect(names).toEqual(expect.arrayContaining(['butt', 'round', 'square']));
    });

    it('filters hyphenated value keywords by the full run', () => {
      const names = labels(completeAtEnd('let s = ${ text-decoration: line-t'));
      expect(names).toContain('line-through');
      expect(names).not.toContain('underline');
    });

    it('does not leak enumerated values across properties', () => {
      const names = labels(completeAtEnd('let s = ${ stroke-width: '));
      expect(names).not.toContain('butt');
      expect(names).not.toContain('evenodd');
    });

    it('offers none/currentColor/context-* for stroke, deduped against generic keywords', () => {
      const items = completeAtEnd('let s = ${ stroke: ');
      const noneEntries = items.filter((i) => i.label === 'none');
      expect(noneEntries).toHaveLength(1);
      const names = labels(items);
      expect(names).toEqual(expect.arrayContaining(['currentColor', 'context-stroke', 'context-fill']));
    });

    it('still offers user variables in value position (well-formed block)', () => {
      // Note: scope analysis needs a parseable document — variables are not
      // collected while the style block is still unterminated (pre-existing
      // limitation, independent of value suggestions).
      const source = 'let accent = oklch(0.7 0.1 250);\nlet s = ${ stroke:  };';
      const cursor = source.indexOf(' };') + 1;
      const items = complete(source, 1, cursor - source.indexOf('\n') - 1);
      expect(labels(items)).toContain('accent');
    });

    it('getStyleValueKeywordRun returns the keyword run only for keyword-like values', () => {
      const src1 = 'let s = ${ text-decoration: line-t';
      expect(getStyleValueKeywordRun(src1, src1.length)).toBe('line-t');
      const src2 = 'let s = ${ stroke-dasharray: 4 2';
      expect(getStyleValueKeywordRun(src2, src2.length)).toBeNull();
      const src3 = 'let x = a-b';
      expect(getStyleValueKeywordRun(src3, src3.length)).toBeNull();
    });
  });
});

describe('query-API chains rooted in layer() calls', () => {
  const labels2 = (items: ReturnType<typeof completeAtEnd>) => items.map((i) => i.label);

  it('resolves let x = layer(...).segment(...) as ProjectedPath', () => {
    const items = completeAtEnd("let top = layer('a').segment('s');\ntop.");
    const names = labels2(items);
    expect(names).toContain('get');
    expect(names).toContain('partition');
    expect(names).not.toContain('project');
    expect(names).not.toContain('draw');
    // and not the PathLayer set
    expect(names).not.toContain('apply');
  });

  it('resolves a direct layer(...).segment(...). chain as ProjectedPath', () => {
    const items = completeAtEnd("layer('a').segment('s').");
    const names = labels2(items);
    expect(names).toContain('get');
    expect(names).toContain('partition');
    expect(names).not.toContain('project');
    expect(names).not.toContain('draw');
  });

  it('infers layer query results by kind', async () => {
    const { inferType } = await import('../../src/language-services/type-inference');
    expect(inferType('top', "let top = layer('a').segment('s');")).toBe('ProjectedPath');
    expect(inferType('pt', "let pt = layer('a').point('p');")).toBe('Point');
    expect(inferType('vh', "let vh = layer('a').vertex('v');")).toBe('VertexHandle');
    expect(inferType('pl', "let pl = layer('a');")).toBe('PathLayer');
  });
});

describe('group-label All queries', () => {
  it('offers the All variants alongside the singular queries', () => {
    const items = completeAtEnd("let shape = @{\n  M 0 0\n};\nshape.");
    const names = items.map((i) => i.label);
    expect(names).toContain('segmentAll');
    expect(names).toContain('pointAll');
    expect(names).toContain('vertexAll');
  });

  it('offers All queries on layer references', () => {
    const items = completeAtEnd("layer('a').");
    const names = items.map((i) => i.label);
    expect(names).toContain('segmentAll');
    expect(names).toContain('vertexAll');
  });
});

describe('variableOffset builder completions', () => {
  it('offers the simple builder methods on vo. inside a variableOffset block', () => {
    const items = completeAtEnd('let spine = @{ M 0 0 L 100 0 };\nlet halo = spine.variableOffset() {|vo, pb|\n  vo.');
    const names = items.map((i) => i.label);
    expect(names).toContain('stop');
    expect(names).toContain('startTangent');
    expect(names).toContain('endTangent');
    expect(names).not.toContain('startCap');
    const stop = items.find((i) => i.label === 'stop');
    expect(stop!.detail).toContain('Place an offset stop along the spine');
    expect(stop!.insertText).toBe('stop(${1:time}, ${2:offset}, ${3:CurveContinuity.G2})$0');
    expect(stop!.isSnippet).toBe(true);
  });

  it('offers the compound builder methods (caps, 5-arg stop) on go. inside a compoundVariableOffset block', () => {
    const items = completeAtEnd('let spine = @{ M 0 0 L 100 0 };\nlet rib = spine.compoundVariableOffset() {|go, pb|\n  go.');
    const names = items.map((i) => i.label);
    expect(names).toContain('startCap');
    expect(names).toContain('endCap');
    expect(names).not.toContain('startTangent');
    const stop = items.find((i) => i.label === 'stop');
    expect(stop!.detail).toContain('two-profile stop');
    expect(stop!.insertText).toBe('stop(${1:time}, ${2:offset1}, ${3:CurveContinuity.G2}, ${4:offset2}, ${5:CurveContinuity.G2})$0');
  });

  it('types the second block param (the spine) as PathBlock', () => {
    const items = completeAtEnd('let spine = @{ M 0 0 L 100 0 };\nlet halo = spine.variableOffset() {|vo, pb|\n  pb.');
    const names = items.map((i) => i.label);
    expect(names).toContain('boundingBox');
    expect(names).toContain('contours');
  });

  it('types << worker-lambda params exactly like trailing-block params', () => {
    // The << bridge: a lambda literal applied as a worker has an owning call.
    const goItems = completeAtEnd('let spine = @{ M 0 0 L 100 0 };\nlet halo = spine.variableOffset() << {|go, pb|\n  go.');
    const goNames = goItems.map((i) => i.label);
    expect(goNames).toContain('stop');
    expect(goNames).toContain('startTangent');
    const stop = goItems.find((i) => i.label === 'stop');
    expect(stop!.detail).toContain('Place an offset stop along the spine');
    const pbItems = completeAtEnd('let spine = @{ M 0 0 L 100 0 };\nlet halo = spine.compoundVariableOffset() << {|go, pb|\n  pb.');
    expect(pbItems.map((i) => i.label)).toContain('boundingBox');
  });

  it('types array-element << worker params via the receiver', () => {
    const items = completeAtEnd("let glyphs = PathBlock.fromGlyph('AB', ${ font-family: 'B'; });\nlet moved = glyphs.map() << {|glyph|\n  glyph.");
    const names = items.map((i) => i.label);
    expect(names).toContain('contours');
    expect(names).toContain('drawTo');
  });

  it('types the result of a << worker application as the completed call', () => {
    // let rib = spine.variableOffset() << mk → PathBlock members on rib.
    const items = completeAtEnd('let mk = {|go, pb| go.stop(0, 5, CurveContinuity.G1); };\nlet spine = @{ M 0 0 L 100 0 };\nlet rib = spine.variableOffset() << mk;\nrib.');
    const names = items.map((i) => i.label);
    expect(names).toContain('draw');
    expect(names).toContain('boundingBox');
  });
});

describe('AST-based receiver typing (destructured loops over method-returned arrays)', () => {
  it('offers PathBlock members on a destructured loop element over PathBlock.fromGlyph', () => {
    const items = completeAtEnd(
      "let glyphs = PathBlock.fromGlyph('AB', ${ font-family: 'B'; });\nfor ([glyph, gIndex] in glyphs) {\n  glyph.",
    );
    const names = items.map((i) => i.label);
    expect(names).toContain('contours');
    expect(names).toContain('variableOffset');
    const drawTo = items.find((i) => i.label === 'drawTo');
    expect(drawTo!.insertText).toBe('drawTo(${1:x}, ${2:y})$0');
  });

  it('offers PathBlock members on a loop element over glyph.contours', () => {
    const items = completeAtEnd(
      "let glyphs = PathBlock.fromGlyph('AB', ${ font-family: 'B'; });\nfor ([glyph, gIndex] in glyphs) {\n  for ([contour, cIndex] in glyph.contours) {\n    contour.",
    );
    const names = items.map((i) => i.label);
    expect(names).toContain('variableOffset');
    expect(names).toContain('drawTo');
  });

  it('resolves shadowed names to the declaration governing the cursor position', () => {
    // Outer `item` is a number; the inner loop shadows it with a Point element.
    const items = completeAtEnd('let item = 5;\nfor (item in [Point(0, 0)]) {\n  item.');
    const names = items.map((i) => i.label);
    expect(names).toContain('translate');
    expect(names).toContain('x');
  });
});

describe('reference cycles', () => {
  it('does not overflow on mutually-referencing declarations', () => {
    // Transient editing state: two variables briefly assigned to each other.
    // Regression for a stack overflow in the regex inference chain.
    expect(() => completeAtEnd('let alpha = beta;\nlet beta = alpha;\nalpha.')).not.toThrow();
  });
});

describe('style property/value coverage matrix', () => {
  // Generalization of the reported `filter` gap: every property in
  // STYLE_PROPERTY_ENTRIES must be offered in name position, and value
  // position must behave per its value-kind — enumerated properties offer
  // exactly their STYLE_PROPERTY_VALUES entries, open-domain properties
  // offer keywords + user variables, and no property offers statement
  // keywords or declaration-shaped binding-block snippets.
  const nameItems = completeAtEnd("define PathLayer('m') ${ ");
  const nameLabels = labels(nameItems);

  it('offers every known style property in name position', () => {
    for (const label of Object.keys(STYLE_PROPERTY_VALUES)) {
      expect(nameLabels, `property '${label}' missing in name position`).toContain(label);
    }
    // The seven properties added for the 2026-07-25 audit
    for (const label of ['filter', 'mask', 'clip-path', 'stroke-dashoffset', 'color', 'mix-blend-mode', 'paint-order']) {
      expect(nameLabels, `property '${label}' missing in name position`).toContain(label);
    }
  });

  describe('value position per property', () => {
    for (const [prop, values] of Object.entries(STYLE_PROPERTY_VALUES)) {
      it(`offers the enumerated/snippet values for '${prop}' and no statement keywords`, () => {
        const items = completeAtEnd(`define PathLayer('m') \${ ${prop}: `);
        const names = labels(items);
        for (const v of values) {
          expect(names, `value '${v.label}' missing for '${prop}'`).toContain(v.label);
        }
        expect(names).not.toContain('let');
        expect(names).not.toContain('for');
        // Declaration-shaped constructor snippets (binding blocks) must never
        // be inserted in value position.
        for (const item of items) {
          expect(item.insertText ?? '', `binding-block snippet '${item.label}' offered for '${prop}'`).not.toContain('{|');
        }
      });
    }
  });

  it('offers filter function snippets with space-separated (CSS-correct) placeholders', () => {
    const items = completeAtEnd("define PathLayer('m') ${ filter: ");
    const drop = items.find((i) => i.label === 'drop-shadow');
    expect(drop).toBeDefined();
    expect(drop!.isSnippet).toBe(true);
    expect(drop!.insertText).toBe('drop-shadow(${1:4}px ${2:4}px ${3:8}px ${4:color})');
    expect(drop!.insertText).not.toContain(',');
    const url = items.find((i) => i.label === 'url');
    expect(url!.insertText).toBe('url(#${1:id})');
  });

  it('carries units in length/angle placeholders so the snippet compiles as-is', () => {
    // The evaluator rejects a unitless length or angle, so a snippet without a
    // unit would insert code that fails to compile.
    const items = completeAtEnd("define PathLayer('m') ${ filter: ");
    expect(items.find((i) => i.label === 'blur')!.insertText).toBe('blur(${1:4}px)');
    expect(items.find((i) => i.label === 'hue-rotate')!.insertText).toBe('hue-rotate(${1:90}deg)');
    // Unitless amounts stay unitless — a unit there is an error.
    expect(items.find((i) => i.label === 'brightness')!.insertText).toBe('brightness(${1:amount})');
  });

  it('derives filter function completions from the sanitizer allow-list (bidirectional)', () => {
    const items = completeAtEnd("define PathLayer('m') ${ filter: ");
    const names = new Set(labels(items));
    for (const fn of CSS_FILTER_FUNCTION_NAMES) {
      expect(names, `sanitizer-allowed filter fn '${fn}' has no completion`).toContain(fn);
    }
  });

  it('ranks in-scope filter-constructor variables first after filter:', () => {
    const source =
      'let grain = NoiseFilter() {|f| f.style = NoiseFilterStyle.Grain; };\n' +
      'let unrelated = 42;\n' +
      "let l = PathLayer('a') ${\n" +
      '  filter: \n' +
      '};';
    const items = complete(source, 3, 10);
    const grain = items.find((i) => i.label === 'grain');
    expect(grain).toBeDefined();
    expect(grain!.detail).toBe('NoiseFilter — renders as url(#id)');
    const unrelated = items.find((i) => i.label === 'unrelated');
    expect(unrelated).toBeDefined();
    // Lower sortText string sorts first in both surfaces
    expect(grain!.sortText < unrelated!.sortText).toBe(true);
  });

  it('offers Mask-typed variables with the ref detail after mask:', () => {
    const source =
      "let m = Mask('cut');\n" +
      "let l = PathLayer('a') ${\n" +
      '  mask: \n' +
      '};';
    const items = complete(source, 2, 8);
    const m = items.find((i) => i.label === 'm');
    expect(m).toBeDefined();
    expect(m!.detail).toBe('Mask — renders as url(#id)');
  });
});
