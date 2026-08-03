import { describe, it, expect } from 'vitest';
import { StringTextDocument } from '../../src/language-services/document';
import { getHoverInfo } from '../../src/language-services/hover';

function hover(source: string, line: number, character: number) {
  return getHoverInfo(new StringTextDocument(source), { line, character });
}

describe('getHoverInfo', () => {
  describe('keywords', () => {
    it('shows hover for let', () => {
      const result = hover('let x = 10;', 0, 1); // cursor on "let"
      expect(result).not.toBeNull();
      expect(result!.contents).toContain('**let**');
      expect(result!.contents).toContain('Declare a variable');
    });

    it('shows hover for for', () => {
      const result = hover('for (i in 0..5) {\n  M i 0\n}', 0, 1);
      expect(result).not.toBeNull();
      expect(result!.contents).toContain('**for**');
    });

    it('shows hover for fn', () => {
      const result = hover('fn draw() {\n  M 0 0\n}', 0, 1);
      expect(result).not.toBeNull();
      expect(result!.contents).toContain('**fn**');
    });

    it('a variable named `lambda` hovers as a variable, not a keyword', () => {
      // `lambda` is a completion-snippet prefix only, NOT a grammar keyword —
      // a KEYWORD_HOVER entry would shadow user variables of that name
      // (regression guard for the entry removed in code review).
      const result = hover('let lambda = 5;\ncircle(0, 0, lambda);', 1, 15); // cursor inside "lambda"
      expect(result).not.toBeNull();
      expect(result!.contents).toContain('variable');
      expect(result!.contents).not.toContain('lexical capture');
    });

    it('shows hover for calc', () => {
      const result = hover('M calc(10 + 5) 0', 0, 3);
      expect(result).not.toBeNull();
      expect(result!.contents).toContain('**calc()**');
    });

    it('shows hover for true/false/null', () => {
      expect(hover('let x = true;', 0, 9)!.contents).toContain('**true**');
      expect(hover('let x = false;', 0, 9)!.contents).toContain('**false**');
      expect(hover('let x = null;', 0, 9)!.contents).toContain('**null**');
    });
  });

  describe('SVG path commands', () => {
    it('shows hover for M command', () => {
      const result = hover('M 10 20', 0, 0);
      expect(result).not.toBeNull();
      expect(result!.contents).toContain('**M**');
      expect(result!.contents).toContain('Move to');
    });

    it('shows hover for A command', () => {
      const result = hover('A 50 50 0 1 1 100 0', 0, 0);
      expect(result).not.toBeNull();
      expect(result!.contents).toContain('**A**');
      expect(result!.contents).toContain('Arc');
    });

    it('shows hover for Z command', () => {
      const result = hover('M 0 0 L 100 0 Z', 0, 15);
      expect(result).not.toBeNull();
      expect(result!.contents).toContain('Close path');
    });
  });

  describe('stdlib functions', () => {
    it('shows hover for circle', () => {
      const result = hover('circle(50, 50, 25)', 0, 3);
      expect(result).not.toBeNull();
      expect(result!.contents).toContain('**circle**');
      expect(result!.contents).toContain('circle(cx, cy, r)');
    });

    it('shows hover for lerp', () => {
      const result = hover('let x = lerp(0, 100, 0.5);', 0, 10);
      expect(result).not.toBeNull();
      expect(result!.contents).toContain('**lerp**');
    });

    it('shows hover for sin', () => {
      const result = hover('let y = sin(1.5);', 0, 10);
      expect(result).not.toBeNull();
      expect(result!.contents).toContain('**sin**');
    });

    it('shows hover for hash01', () => {
      const result = hover('let x = hash01(3);', 0, 10);
      expect(result).not.toBeNull();
      expect(result!.contents).toContain('**hash01**');
      expect(result!.contents).toContain('Deterministic hash of integer n to [0, 1)');
    });

    it('shows hover for bump and easeInOut', () => {
      const bumpResult = hover('let x = bump(0.5, 0.5, 0.4);', 0, 9);
      expect(bumpResult).not.toBeNull();
      expect(bumpResult!.contents).toContain('**bump**');
      expect(bumpResult!.contents).toContain('Raised-cosine kernel');
      const easeResult = hover('let x = easeInOut(0.5);', 0, 12);
      expect(easeResult).not.toBeNull();
      expect(easeResult!.contents).toContain('**easeInOut**');
      expect(easeResult!.contents).toContain('Quadratic ease-in-out');
    });

    it('shows hover for noise', () => {
      const result = hover('let x = noise(0.5);', 0, 10);
      expect(result).not.toBeNull();
      expect(result!.contents).toContain('**noise**');
      expect(result!.contents).toContain('1D value noise');
    });

    it('shows hover for smoothstep', () => {
      const result = hover('let x = smoothstep(0, 1, 0.5);', 0, 12);
      expect(result).not.toBeNull();
      expect(result!.contents).toContain('**smoothstep**');
      expect(result!.contents).toContain('Hermite ease');
    });

    it('shows hover for ctx', () => {
      const result = hover('let pos = ctx;', 0, 11);
      expect(result).not.toBeNull();
      expect(result!.contents).toContain('**ctx**');
    });

    it('shows hover for the viewbox global', () => {
      const result = hover('define ViewBox(0, 0, 200, 100);\nlet w = viewbox;', 1, 10);
      expect(result).not.toBeNull();
      expect(result!.contents).toContain('**viewbox**');
      expect(result!.contents).toContain('originX');
    });

    it('shows member hover for viewbox.width', () => {
      const result = hover('define ViewBox(0, 0, 200, 100);\nlet w = viewbox.width;', 1, 17);
      expect(result).not.toBeNull();
      expect(result!.contents).toContain('width');
    });
  });

  describe('user-defined symbols', () => {
    it('shows hover for user variable', () => {
      const result = hover('let radius = 50;\ncircle(0, 0, radius);', 1, 15);
      expect(result).not.toBeNull();
      expect(result!.contents).toContain('**radius**');
      expect(result!.contents).toContain('variable');
    });

    it('shows hover for function parameter', () => {
      const result = hover('fn draw(cx, cy) {\n  M cx cy\n}', 1, 4);
      expect(result).not.toBeNull();
      expect(result!.contents).toContain('**cx**');
      expect(result!.contents).toContain('parameter');
    });

    it('shows hover for user function', () => {
      const result = hover('fn draw() {\n  M 0 0\n}\ndraw();', 3, 2);
      expect(result).not.toBeNull();
      expect(result!.contents).toContain('**draw**');
      expect(result!.contents).toContain('function');
    });
  });

  describe('inferred variable types', () => {
    it('shows the inferred type for a constructor-typed variable', () => {
      const result = hover('let p = Point(10, 20);\ncircle(p.x, p.y, 5);', 1, 7);
      expect(result).not.toBeNull();
      expect(result!.contents).toContain('*variable: Point*');
    });

    it('shows the inferred type for a destructured struct binding', () => {
      const result = hover(
        'let g = Grid(3, 4, { xDim: 10, yDim: 10 });\nlet { origin } = g;\ncircle(origin.x, origin.y, 5);',
        2,
        8,
      );
      expect(result).not.toBeNull();
      expect(result!.contents).toContain('*variable: Point*');
    });

    it('shows the Color display name for ColorInstance bindings', () => {
      const result = hover('let col = oklch(0.7 0.15 200);\nlog(col);', 1, 5);
      expect(result).not.toBeNull();
      expect(result!.contents).toContain('*variable: Color*');
      expect(result!.contents).not.toContain('ColorInstance');
    });

    it('shows the inferred type for an aliased destructured binding', () => {
      const result = hover(
        'let g = Grid(3, 4, { xDim: 10, yDim: 10 });\nlet { origin: o } = g;\ncircle(o.x, o.y, 5);',
        2,
        7,
      );
      expect(result).not.toBeNull();
      expect(result!.contents).toContain('*variable: Point*');
    });

    it('shows number for numeric literal declarations', () => {
      const result = hover('let radius = 50;\ncircle(0, 0, radius);', 1, 15);
      expect(result).not.toBeNull();
      expect(result!.contents).toBe('**radius** — *variable: number*\n\nDefined at line 1');
    });

    it('shows number for numeric destructured bindings', () => {
      const result = hover('let { x } = Point(1, 2);\ncircle(x, 0, 5);', 1, 7);
      expect(result).not.toBeNull();
      expect(result!.contents).toContain('*variable: number*');
    });

    it('infers number for bindings destructured from an inline object literal', () => {
      // Backstop for the objectProp branch in type-inference-ast.ts, which
      // requires the ObjectProperty discriminant on parsed properties.
      const result = hover("let { x } = { x: 5, y: 'hi' };\ncircle(x, 0, 5);", 1, 7);
      expect(result).not.toBeNull();
      expect(result!.contents).toContain('*variable: number*');
    });

    it('shows the inferred type for a loop variable over a typed array', () => {
      const result = hover('let pts = [Point(0, 0), Point(1, 1)];\nfor (pt in pts) {\n  circle(pt.x, pt.y, 2);\n}', 2, 10);
      expect(result).not.toBeNull();
      expect(result!.contents).toContain('*loop variable: Point*');
    });
  });

  describe('no hover', () => {
    it('returns null for empty space far from any word', () => {
      // Position in the middle of lots of whitespace
      expect(hover('M     10', 0, 3)).toBeNull();
    });

    it('returns null for numbers', () => {
      // Numbers are digits, getWordAt will find them, but they won't match any hover
      const result = hover('M 10 20', 0, 3);
      // 10 is not a keyword, stdlib, or user symbol — no hover
      expect(result).toBeNull();
    });
  });

  describe('hover range', () => {
    it('returns range covering the word', () => {
      const result = hover('circle(50, 50, 25)', 0, 3);
      expect(result).not.toBeNull();
      expect(result!.range).toBeDefined();
      expect(result!.range!.start).toEqual({ line: 0, character: 0 });
      expect(result!.range!.end).toEqual({ line: 0, character: 6 });
    });
  });

  // 2026-07-13 audit: defs constructors flow into hover via STDLIB_COMPLETIONS.
  describe('defs constructor hover', () => {
    it('shows hover for Marker with its real signature', () => {
      const result = hover("let mk = Marker('dot', 10, 10);", 0, 10); // cursor on "Marker"
      expect(result).not.toBeNull();
      expect(result!.contents).toContain('Marker');
      expect(result!.contents).toContain('markerWidth');
    });

    it('shows hover for LinearGradient', () => {
      const result = hover("let g = LinearGradient('fade', 0, 0, 1, 1);", 0, 12);
      expect(result).not.toBeNull();
      expect(result!.contents).toContain('LinearGradient');
      expect(result!.contents).toContain('x1, y1, x2, y2');
    });

    it('shows hover for Mask', () => {
      const result = hover("let m = Mask('fade');", 0, 9);
      expect(result).not.toBeNull();
      expect(result!.contents).toContain('Mask');
      expect(result!.contents).toContain('append');
    });

    it('shows hover for Pattern', () => {
      const result = hover("let p = Pattern('dots', 0, 0, 10, 10);", 0, 10);
      expect(result).not.toBeNull();
      expect(result!.contents).toContain('Pattern');
    });
  });

  // --- Member access + AST-inference integration (variableOffset repro) ---

  /** Position of the nth occurrence of `needle` (cursor on its first character). */
  function posOf(source: string, needle: string, occurrence = 0): { line: number; character: number } {
    let idx = -1;
    for (let i = 0; i <= occurrence; i++) {
      idx = source.indexOf(needle, idx + 1);
      if (idx === -1) throw new Error(`needle not found: ${needle}`);
    }
    const before = source.slice(0, idx).split('\n');
    return { line: before.length - 1, character: before[before.length - 1].length };
  }

  function hoverOn(source: string, needle: string, occurrence = 0) {
    const { line, character } = posOf(source, needle, occurrence);
    return hover(source, line, character);
  }

  describe('variableOffset repro program (end-to-end)', () => {
    const program = [
      "let fontStyles = ${ font-family: 'Baumans'; };",
      "let glyphs = PathBlock.fromGlyph('AB', fontStyles);",
      'for ([glyph, gIndex] in glyphs) {',
      '  for ([contour, cIndex] in glyph.contours) {',
      '    let leftOffset = calc(126.5 + (gIndex * 48));',
      '    for (offsetBase in 1..32) {',
      '      let offset = calc(offsetBase * 1.171);',
      '      let halo = contour.variableOffset() {|vo, cpb|',
      '        let bb = cpb.boundingBox();',
      '        for (time in 1..99) {',
      '          vo.stop(calc(time / 100), offset, CurveContinuity.G2);',
      '        }',
      '      };',
      '      halo.drawTo(leftOffset, 101);',
      '    }',
      '  }',
      '}',
    ].join('\n');

    it('types the destructured glyph loop element as PathBlock', () => {
      const result = hoverOn(program, 'glyph, gIndex');
      expect(result!.contents).toContain('*loop variable: PathBlock*');
    });

    it('types the destructured index binding as number', () => {
      const result = hoverOn(program, 'gIndex]');
      expect(result!.contents).toContain('*loop variable: number*');
    });

    it('types the nested contour loop element as PathBlock', () => {
      const result = hoverOn(program, 'contour, cIndex');
      expect(result!.contents).toContain('*loop variable: PathBlock*');
    });

    it('shows the contours property with its element type', () => {
      const result = hoverOn(program, 'contours)');
      expect(result!.contents).toContain('**contours**');
      expect(result!.contents).toContain('PathBlock property: array<PathBlock>');
      expect(result!.contents).toContain('Per-contour PathBlocks');
    });

    it('shows the variableOffset method doc', () => {
      const result = hoverOn(program, 'variableOffset() {');
      expect(result!.contents).toContain('**variableOffset**');
      expect(result!.contents).toContain('PathBlock method');
      expect(result!.contents).toContain('Trace a smooth offset path');
    });

    it('types vo at its pipe-declaration site', () => {
      const result = hoverOn(program, 'vo, cpb');
      expect(result!.contents).toContain('*block parameter: VariableOffsetBuilder*');
    });

    it('types vo at a use site', () => {
      const result = hoverOn(program, 'vo.stop');
      expect(result!.contents).toContain('*block parameter: VariableOffsetBuilder*');
    });

    it('types << worker-lambda params like trailing-block params', () => {
      const workerProgram = `let spine = @{ M 0 0 L 100 0 };
let rib = spine.variableOffset() << {|wgo, wpb|
  wgo.stop(0, 5, CurveContinuity.G1);
  wpb.boundingBox();
};
M 0 0`;
      const goHover = hoverOn(workerProgram, 'wgo.stop');
      expect(goHover!.contents).toContain('*block parameter: VariableOffsetBuilder*');
      const pbHover = hoverOn(workerProgram, 'wpb.boundingBox');
      expect(pbHover!.contents).toContain('*block parameter: PathBlock*');
    });

    it('shows the builder stop method doc', () => {
      const result = hoverOn(program, 'stop(calc');
      expect(result!.contents).toContain('**stop**');
      expect(result!.contents).toContain('VariableOffsetBuilder method');
      expect(result!.contents).toContain('Place an offset stop along the spine');
    });

    it('types cpb (the spine param) as PathBlock', () => {
      const result = hoverOn(program, 'cpb.boundingBox');
      expect(result!.contents).toContain('*block parameter: PathBlock*');
    });

    it('types glyphs as array<PathBlock> via the fromGlyph return', () => {
      const result = hoverOn(program, 'glyphs =');
      expect(result!.contents).toContain('*variable: array<PathBlock>*');
    });

    it('types calc() declarations and range loop counters as numbers', () => {
      expect(hoverOn(program, 'offset = calc')!.contents).toContain('*variable: number*');
      expect(hoverOn(program, 'offsetBase in')!.contents).toContain('*loop variable: number*');
    });

    it('types halo from the variableOffset return type', () => {
      const result = hoverOn(program, 'halo =');
      expect(result!.contents).toContain('*variable: PathBlock*');
    });

    it('types fontStyles as StyleBlock', () => {
      const result = hoverOn(program, 'fontStyles =');
      expect(result!.contents).toContain('*variable: StyleBlock*');
    });
  });

  describe('reference cycles', () => {
    const cyclic = 'let alpha = beta;\nlet beta = alpha;\nalpha.x;';

    it('does not overflow on mutually-referencing declarations (use site, member, declaration site)', () => {
      // Transient editing state: two variables briefly assigned to each other.
      // Regression for a stack overflow in the regex inference chain.
      expect(() => hover(cyclic, 2, 1)).not.toThrow(); // use of alpha
      expect(() => hover(cyclic, 2, 7)).not.toThrow(); // member on cyclic receiver
      expect(() => hover(cyclic, 0, 5)).not.toThrow(); // alpha's declaration site
      expect(() => hover(cyclic, 1, 5)).not.toThrow(); // beta's declaration site
    });
  });

  describe('member hover', () => {
    it('does not bleed the stdlib doc into unresolvable member positions', () => {
      // `.map` on an untyped receiver must NOT show the stdlib map(value,...) doc
      const result = hoverOn('someUnknown.map() {|q| circle(q, 0, 1); };', 'map()');
      expect(result).toBeNull();
    });

    it('shows namespace member docs', () => {
      const result = hoverOn('let c = Color.mix(#f00, #00f, 0.5);', 'mix(');
      expect(result!.contents).toContain('**mix**');
      expect(result!.contents).toContain('Interpolate colors');
    });

    it('shows enum member values', () => {
      const result = hoverOn('let e = CurveContinuity.G2;', 'G2;');
      expect(result).not.toBeNull();
      expect(result!.contents).toContain('**G2**');
    });

    it('shows compound builder members only on the compound builder', () => {
      const program = 'let ribbon = @{ M 0 0 L 10 0 }.compoundVariableOffset() {|go, pb|\n  go.startCap(Cap.round());\n};';
      const result = hoverOn(program, 'startCap(');
      expect(result!.contents).toContain('**startCap**');
      expect(result!.contents).toContain('CompoundVariableOffsetBuilder method');
    });
  });

  // The systematic guard: every binding form × declaration-site hover.
  // A null `type` documents a known-uninferable form — if inference learns it
  // later, the row should be updated, not deleted.
  describe('binding-form coverage matrix', () => {
    const CASES: Array<{ label: string; source: string; needle: string; kind: string; type: string | null }> = [
      { label: 'number literal', source: 'let n = 5;\ncircle(n, 0, 1);', needle: 'n =', kind: 'variable', type: 'number' },
      { label: 'negative number', source: 'let n = -2.5;\ncircle(n, 0, 1);', needle: 'n =', kind: 'variable', type: 'number' },
      { label: 'boolean literal', source: 'let b = true;\ncircle(0, 0, 1);', needle: 'b =', kind: 'variable', type: 'boolean' },
      { label: 'string literal', source: "let str = 'hi';\ncircle(0, 0, 1);", needle: 'str =', kind: 'variable', type: 'string' },
      { label: 'color literal', source: 'let col = #ff0000;', needle: 'col =', kind: 'variable', type: 'Color' },
      { label: 'path block', source: 'let p = @{ M 0 0 };', needle: 'p =', kind: 'variable', type: 'PathBlock' },
      { label: 'style block', source: 'let st = ${ stroke: #000; };', needle: 'st =', kind: 'variable', type: 'StyleBlock' },
      { label: 'array literal', source: 'let arr = [1, 2];', needle: 'arr =', kind: 'variable', type: 'array<number>' },
      { label: 'object literal', source: 'let o = { x: 1 };', needle: 'o =', kind: 'variable', type: 'object' },
      // Lambda literal: the value itself is a function; no type name exists
      // for it yet, so the declaration hovers untyped (null documents this).
      { label: 'lambda literal', source: 'let f = {|a, b| return a; };\ncircle(0, 0, 1);', needle: 'f =', kind: 'variable', type: null },
      // A lambda's own params are uninferable — no owning call site.
      { label: 'lambda param', source: 'let f = {|amt| return amt; };\ncircle(0, 0, 1);', needle: 'amt|', kind: 'block parameter', type: null },
      { label: 'constructor', source: 'let pt = Point(1, 2);', needle: 'pt =', kind: 'variable', type: 'Point' },
      {
        label: 'method return',
        source: 'let p = @{ M 0 0 };\nlet bb = p.boundingBox();',
        needle: 'bb =',
        kind: 'variable',
        type: 'BoundingBox',
      },
      {
        label: 'array destructure: number element',
        source: 'let [num, pb, sb] = [5, @{ M 0 0 }, ${ stroke: #000; }];',
        needle: 'num,',
        kind: 'variable',
        type: 'number',
      },
      {
        label: 'array destructure: path-block element',
        source: 'let [num, pb, sb] = [5, @{ M 0 0 }, ${ stroke: #000; }];',
        needle: 'pb,',
        kind: 'variable',
        type: 'PathBlock',
      },
      {
        label: 'array destructure: style-block element',
        source: 'let [num, pb, sb] = [5, @{ M 0 0 }, ${ stroke: #000; }];',
        needle: 'sb]',
        kind: 'variable',
        type: 'StyleBlock',
      },
      {
        label: 'object destructure: typed property',
        source: 'let g = Grid(3, 4, { xDim: 10, yDim: 10 });\nlet { origin } = g;',
        needle: 'origin }',
        kind: 'variable',
        type: 'Point',
      },
      {
        label: 'object destructure: numeric property',
        source: 'let pt = Point(1, 2);\nlet { x } = pt;',
        needle: 'x }',
        kind: 'variable',
        type: 'number',
      },
      {
        label: 'loop over array literal',
        source: 'for (pt in [Point(0, 0), Point(1, 1)]) {\n  circle(pt.x, pt.y, 1);\n}',
        needle: 'pt in',
        kind: 'loop variable',
        type: 'Point',
      },
      {
        label: 'destructured loop element + index',
        source: 'let pts = [Point(0, 0)];\nfor ([pt, i] in pts) {\n  circle(pt.x, i, 1);\n}',
        needle: 'pt, i]',
        kind: 'loop variable',
        type: 'Point',
      },
      {
        label: 'destructured loop index',
        source: 'let pts = [Point(0, 0)];\nfor ([pt, i] in pts) {\n  circle(pt.x, i, 1);\n}',
        needle: 'i]',
        kind: 'loop variable',
        type: 'number',
      },
      {
        label: 'range loop counter',
        source: 'for (i in 0..10) {\n  M i 0\n}',
        needle: 'i in',
        kind: 'loop variable',
        type: 'number',
      },
      {
        label: 'map block param',
        source: 'let pts = [Point(0, 0)];\nlet xs = pts.map() {|p| return p.x; };',
        needle: 'p| return',
        kind: 'block parameter',
        type: 'Point',
      },
      // Comparator params named pa/pb, not a/b — single-letter path-command
      // names (a = relative arc) get path-command hover, which wins over
      // scope analysis (pre-existing precedence, not sort-specific).
      {
        label: 'sort comparator first param',
        source: 'let pts = [Point(0, 0)];\nlet sorted = pts.sort {|pa, pb| return calc(pa.x - pb.x); };',
        needle: 'pa, pb|',
        kind: 'block parameter',
        type: 'Point',
      },
      {
        label: 'sort comparator second param',
        source: 'let pts = [Point(0, 0)];\nlet sorted = pts.sort {|pa, pb| return calc(pa.x - pb.x); };',
        needle: 'pb| return',
        kind: 'block parameter',
        type: 'Point',
      },
      {
        label: 'fn parameter (uninferable)',
        source: 'fn f(amount) {\n  return amount;\n}',
        needle: 'amount)',
        kind: 'parameter',
        type: null,
      },
    ];

    for (const c of CASES) {
      it(`${c.label} → ${c.kind}${c.type ? `: ${c.type}` : ''}`, () => {
        const result = hoverOn(c.source, c.needle);
        expect(result).not.toBeNull();
        const expected = c.type ? `*${c.kind}: ${c.type}*` : `*${c.kind}*`;
        expect(result!.contents).toContain(expected);
      });
    }
  });
});
