/**
 * Source locations — every AST node that can be the subject of an error carries
 * a `loc`, and every `loc` is exactly what the original definition said it was.
 *
 * Two things are pinned here (both 2026-09-19, ISSUE-022):
 *
 * 1. CORRECTNESS of the fast path. `loc()` used to slice the source from 0 and
 *    split it on newlines for EVERY node — O(source) per call, 18.8 s to parse a
 *    1.4 MB program. It is now a binary search over line starts computed once.
 *    The reference implementation below is the old definition, verbatim; every
 *    `loc` in every parsed program must agree with it.
 *
 * 2. COVERAGE. A method call takes its error position from its receiver, and the
 *    literal builders never set one, so `[1, 2].slice('a')` reported an error
 *    with no line or column. The matrix is receiver shape × position, so a
 *    literal kind added later cannot quietly regress it.
 */
import { describe, expect, it } from 'vitest';

import { compile, parse } from '../src';
import { lineColumnAt, lineStartsCacheMissCount } from '../src/parser/ast-builder';

/** The pre-2026-09-19 definition of a location, kept verbatim as the oracle. */
function referenceLineColumn(source: string, offset: number): { line: number; column: number } {
  const before = source.slice(0, offset);
  const lines = before.split('\n');
  return { line: lines.length, column: lines[lines.length - 1].length + 1 };
}

/** Deterministic PRNG (LCG) — the generated sources must be the same on every run. */
function makeRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

interface Loc {
  line: number;
  column: number;
  offset: number;
}

function collectLocs(node: unknown, out: { type: string; loc: Loc }[] = []): { type: string; loc: Loc }[] {
  if (!node || typeof node !== 'object') return out;
  if (Array.isArray(node)) {
    for (const child of node) collectLocs(child, out);
    return out;
  }
  const record = node as Record<string, unknown>;
  if (typeof record.type === 'string' && record.loc) out.push({ type: record.type, loc: record.loc as Loc });
  for (const [key, value] of Object.entries(record)) if (key !== 'loc') collectLocs(value, out);
  return out;
}

const PROGRAMS: Record<string, string> = {
  'single line': 'let total = [1, 2, 3].length; M total 0 L 10 calc(total * 2)',
  'many lines, blank lines, indentation': [
    'let radii = [120, 80, 40];',
    '',
    'for (pair in radii.mapSlice(2)) {',
    '  let [outer, inner] = pair;',
    '',
    '  circle(200, 200, inner);',
    '}',
    'let label = `ring ${radii.length}`;',
    "let spot = { across: -5, down: 'seven' };",
    'M spot.across 0',
  ].join('\n'),
  'CRLF line endings (the \\r stays a column)': 'let first = 1;\r\nlet second = [first, 2];\r\nM second[0] 0',
  'astral and combining characters before a node': "let glyphs = '𝕏é👍🏽';\nlet after = [1, 2];\nM after[0] 0",
  'leading and trailing newlines': '\n\n\nlet late = [1];\nM late[0] 0\n\n',
  'comments between tokens': 'let list = [\n  10, // first\n  // 20,\n  30,\n];\nL list[0] list[1]',
};

describe('source locations', () => {
  // The primary equivalence proof: the function itself, against the original
  // definition, over generated sources and hostile offsets. Deterministic PRNG.
  describe('lineColumnAt equals the original slice-and-split definition', () => {
    // Sources over 512 characters go through a two-entry line-start cache; short
    // ones bypass it. Three long sources are rotated so every call after the
    // first evicts something — the path the short-source test below never takes.
    it('for long sources, with the line-start cache evicting on every call', () => {
      const random = makeRandom(987654);
      const alphabet = ['let value = 10;', ' ', '\n', '\n', '\r\n', '𝕏', '// note', '\t', '\n\n'];
      const longSource = () => {
        let source = '';
        while (source.length < 600 + Math.floor(random() * 1500)) {
          source += alphabet[Math.floor(random() * alphabet.length)];
        }
        return source;
      };
      let checked = 0;
      for (let round = 0; round < 12; round++) {
        const sources = [longSource(), longSource(), longSource()];
        for (const source of sources) expect(source.length).toBeGreaterThan(512);
        for (let step = 0; step < 400; step++) {
          const source = sources[step % 3];
          const offset = Math.floor(random() * (source.length + 40)) - 20;
          expect(lineColumnAt(source, offset)).toEqual(referenceLineColumn(source, offset));
          checked++;
        }
      }
      expect(checked).toBe(4800);
    });

    it('for every offset of 300 generated sources, plus out-of-range and non-finite offsets', () => {
      const random = makeRandom(12345);
      const alphabet = ['a', ' ', '\n', '\n', '\r', '\r\n', '𝕏', 'é', '\t', '\n\n'];
      let checked = 0;
      for (let round = 0; round < 300; round++) {
        let source = '';
        const length = Math.floor(random() * 60);
        for (let i = 0; i < length; i++) source += alphabet[Math.floor(random() * alphabet.length)];
        const hostile = [-1e9, -source.length - 2, -3, -1, source.length + 1, source.length + 50, 1e9];
        const nonFinite = [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 2.7, -2.7];
        const inRange = Array.from({ length: source.length + 1 }, (_, offset) => offset);
        for (const offset of [...hostile, ...nonFinite, ...inRange]) {
          lineColumnAt(`${source}\nother`, 1);
          expect(lineColumnAt(source, offset)).toEqual(referenceLineColumn(source, offset));
          checked++;
        }
      }
      expect(checked).toBeGreaterThan(10000);
    });
  });

  // Outside a method's trailing block. (Inside one, line and column are right —
  // errors there report the correct line — but `loc.offset` is relative to the
  // block's own text: a separate, older inconsistency, ISSUE-024.)
  describe('every loc agrees with the original definition', () => {
    for (const [name, source] of Object.entries(PROGRAMS)) {
      it(name, () => {
        const locs = collectLocs(parse(source));
        // Guards the guard: a program that yields no locs proves nothing.
        expect(locs.length).toBeGreaterThan(5);
        for (const { type, loc } of locs) {
          expect({ type, ...loc }).toEqual({ type, ...referenceLineColumn(source, loc.offset), offset: loc.offset });
        }
      });
    }

    it('a loc points AT its node — the offset slices back to the literal it describes', () => {
      // Derived, not listed: whatever number literals the program has, each one's
      // offset must land on source text that parses back to that literal's value.
      // (This is the check that exposed the for-each header bug below: the `2` in
      // `radii.mapSlice(2)` on line 3 reported 1:24.)
      const source = PROGRAMS['many lines, blank lines, indentation'];
      const numbers: { value: number; loc: Loc }[] = [];
      const visit = (node: unknown): void => {
        if (!node || typeof node !== 'object') return;
        if (Array.isArray(node)) {
          node.forEach(visit);
          return;
        }
        const record = node as Record<string, unknown>;
        if (record.type === 'NumberLiteral' && record.loc) {
          numbers.push({ value: record.value as number, loc: record.loc as Loc });
        }
        for (const [key, value] of Object.entries(record)) if (key !== 'loc') visit(value);
      };
      visit(parse(source));
      expect(numbers.length).toBeGreaterThanOrEqual(6);
      for (const { value, loc } of numbers) {
        const textThere = /^\d+(\.\d+)?/.exec(source.slice(loc.offset))?.[0];
        expect({ value, line: loc.line, text: textThere }).toEqual({ value, line: loc.line, text: String(value) });
      }
    });
  });

  // The cache POLICY, pinned directly. (Code review: the timing test below uses
  // short calc() bodies, which bypass the cache — so a regression to a one-entry
  // cache would pass it. Counting computations is deterministic; timing a
  // quadratic term that only dominates at unit-test-hostile sizes is not.)
  describe('the line-start cache: two entries, and short sources never enter it', () => {
    const long = (tag: string) => `${`let ${tag} = 10;\n`.repeat(60)}// ${tag}`;
    const missesDuring = (run: () => void) => {
      const before = lineStartsCacheMissCount();
      run();
      return lineStartsCacheMissCount() - before;
    };

    it('two long sources alternating are each computed once', () => {
      const first = long('alphaOne');
      const second = long('betaOne');
      expect(first.length).toBeGreaterThan(512);
      const misses = missesDuring(() => {
        for (let round = 0; round < 50; round++) {
          lineColumnAt(first, round);
          lineColumnAt(second, round);
        }
      });
      expect(misses).toBe(2);
    });

    it('a third long source evicts the least recently used — the cache holds two, not more', () => {
      const [first, second, third] = [long('alphaTwo'), long('betaTwo'), long('gammaTwo')];
      const misses = missesDuring(() => {
        lineColumnAt(first, 1);
        lineColumnAt(second, 1);
        lineColumnAt(third, 1); // evicts `first`
        lineColumnAt(first, 1); // computed again
      });
      expect(misses).toBe(4);
    });

    it('a short source between two uses of a long one does not evict it', () => {
      // The document, then a calc() body parsed from its own short wrapped
      // string, then the document again — thousands of times in a real parse.
      const document = long('documentThree');
      const misses = missesDuring(() => {
        for (let round = 0; round < 200; round++) {
          lineColumnAt(document, round);
          lineColumnAt(`let _ = ${round} + 1;`, 3);
        }
      });
      expect(misses).toBe(1);
    });

    it('answers stay right across every eviction above', () => {
      const [first, second, third] = [long('alphaFour'), long('betaFour'), long('gammaFour')];
      for (const source of [first, second, third, first, third, second, first]) {
        for (const offset of [0, 17, 300, source.length - 1, source.length]) {
          expect(lineColumnAt(source, offset)).toEqual(referenceLineColumn(source, offset));
        }
      }
    });
  });

  describe('parsing a large program is not quadratic', () => {
    // 4,000 lines took ~750 ms when loc() was O(source); the same shape at
    // 20,000 lines took 18.8 s. The bound is loose on purpose — it fails on
    // quadratic growth, not on a slow CI machine.
    it('scales close to linearly from 2,000 to 8,000 lines', () => {
      const programOf = (lineCount: number) =>
        Array.from(
          { length: lineCount },
          (_, i) => `let v${i} = [${i}, ${i + 1}, ${i * 2}.5]; M ${i} ${i + 1} L ${i * 2} calc(${i} + 1)`,
        ).join('\n');
      const timeOf = (lineCount: number) => {
        const source = programOf(lineCount);
        parse(source); // warm
        const start = performance.now();
        parse(source);
        return performance.now() - start;
      };
      const small = timeOf(2000);
      const large = timeOf(8000);
      // 4× the input: linear ≈ 4×, quadratic ≈ 16×. Allow generous noise.
      expect(large / small).toBeLessThan(9);
    });
  });

  describe('an error raised by a method is positioned, whatever the receiver is', () => {
    // Each call is wrong on purpose. The receiver sits on line 3 so a position
    // that defaults to line 1 cannot pass.
    const onLine3 = (expression: string) =>
      `let one = 1;\nlet two = 2; let pair = [one, two];\nlet result = ${expression};`;
    const receivers: [string, string][] = [
      ['variable (control — this one always worked)', "pair.slice('a')"],
      ['chained off an array literal', "[one, two].reverse().slice('a')"],
      ['array literal', "[one, two].slice('a')"],
      ['nested array literal', "[[1, 2], [3]].slice('a')"],
      ['spread-built array literal', "[...[one], two].slice('a')"],
      ['index into an array literal', "[[1, 2]][0].slice('a')"],
      ['member of an object literal', "{ list: [1, 2] }.list.slice('a')"],
      ['string literal', "'abc'.slice('a', 'b', 'c')"],
      ['template literal', '`abc`.slice("a", "b", "c")'],
      ['parenthesised variable', "([one, two]).slice('a')"],
      ['range literal', "(1..3).slice('a')"],
    ];
    for (const [name, expression] of receivers) {
      it(name, () => {
        expect(() => compile(onLine3(expression))).toThrow(/^Line 3, col \d+: slice\(\)/);
      });
    }

    it('the column is the receiver, not the start of the line', () => {
      // `let result = ` is 13 characters, so the literal starts at column 14.
      expect(() => compile(onLine3("[one, two].slice('a')"))).toThrow(/^Line 3, col 14: /);
    });
  });

  // The header of a for-each loop is parsed from its own `let _ = …;` wrapper.
  // It was never rebased onto the document, so EVERY error in one reported
  // "Line 1, col 9" — col 9 being the width of the wrapper — wherever the loop
  // was. Found 2026-09-19 by the derived number-literal check above.
  describe('an error in a for-each header is positioned at the header', () => {
    const header = "for (item in list.slice('a')) {";
    const column = (indent: string) => indent.length + 'for (item in '.length + 1;
    const contexts: [string, string, number, number][] = [
      ['top level', `let list = [1, 2];\nlet pad = 0;\n${header} M item 0 }`, 3, column('')],
      [
        'in a function body',
        `let list = [1, 2];\nfn walk() {\n  let pad = 0;\n  ${header} M item 0 }\n}\nwalk();`,
        4,
        column('  '),
      ],
      [
        'in a path block',
        `let list = [1, 2];\nlet pad = 0;\nlet block = @{\n  ${header} h item }\n};`,
        4,
        column('  '),
      ],
      [
        'in a text block',
        `let list = [1, 2];\nlet pad = 0;\nlet label = &{\n  ${header} text(0, 0)\`x\` }\n};`,
        4,
        column('  '),
      ],
    ];
    for (const [name, source, line, col] of contexts) {
      it(name, () => {
        expect(() => compile(source)).toThrow(new RegExp(`^Line ${line}, col ${col}: slice\\(\\)`));
      });
    }

    it('positions an argument inside the header, not just the receiver', () => {
      const source = 'let list = [1, 2];\nlet pad = 0;\nfor (item in list.slice(missing)) { M item 0 }';
      expect(() => compile(source)).toThrow(/^Line 3, col 25: Undefined variable: missing/);
    });

    it('a valid header is unaffected', () => {
      expect(compile('for (item in [10, 20].slice(0, 1)) { M item 0 }').layers[0].data).toBe('M 10 0 M 20 0');
    });
  });

  describe('a calc() path argument is positioned', () => {
    it('reports where the calc() is', () => {
      expect(() => compile('M 0 0\nL calc(missing + 1) 0')).toThrow(/Line 2/);
    });
  });
});
