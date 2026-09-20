/**
 * NaN and Infinity reaching path data — a WARNING, and strict mode (ISSUE-023).
 *
 * `M NaN 0` used to compile with exit 0 and no warning; the browser then stopped
 * reading that path at the token. The policy, chosen by the author 2026-09-19:
 *
 *   - a non-finite NUMBER reaching path data warns (code `non-finite`) and the
 *     path is still emitted — degenerate math costs the rest of that layer's path
 *     (its subpaths share one `d`), not the drawing;
 *   - the same policy for raw path arguments AND for functions that draw, which
 *     until now disagreed about the same NaN (`circle` threw, `M` was silent);
 *   - `null` and a MISSING argument stay errors: those are always mistakes;
 *   - strict mode turns warnings into positioned errors — all of them, or the
 *     named codes — for build scripts and published samples.
 *
 * Five older tests observe documented math contracts through `M calc(…) 0`
 * (`smoothstep(5,5,5)`, `bump`, `noise`, `/0`, `%0`). They must keep passing
 * untouched: the value still reaches the path, now with a warning beside it.
 */
import { describe, expect, it } from 'vitest';

import { compile, compileWithContext, WARNING_CODES } from '../src';
import { splitPathCommands, tokenizePathData } from '../src/evaluator/path-data';
import { getDiagnostics } from '../src/language-services/diagnostics';
import { StringTextDocument } from '../src/language-services/document';
import { DiagnosticSeverity } from '../src/language-services/types';
import { contextAwareFunctions } from '../src/stdlib';

const TAIL = 'SVG cannot represent it; the path will be drawn only up to here';

describe('non-finite numbers in path data', () => {
  describe('a raw path argument warns, and the path is still emitted', () => {
    // Every computed-argument branch of evaluatePathArg gets a case; the bad
    // value is always on line 2 so a position defaulting to line 1 cannot pass.
    const cases: [string, string, RegExp][] = [
      ['a variable', 'let bad = sqrt(-1);\nM bad 0 L 10 10', /^`bad` is NaN in a path argument — /],
      ['calc()', 'let pad = 0;\nM calc(sqrt(-1)) 0 L 10 10', /^a path argument is NaN — /],
      ['a member', 'let spot = { across: sqrt(-1) };\nM spot.across 0', /^a path argument is NaN — /],
      ['an index', 'let coords = [sqrt(-1), 5];\nM coords[0] coords[1]', /^a path argument is NaN — /],
      ['a function call', 'let pad = 0;\nM sqrt(-1) 0', /^a path argument is NaN — /],
      ['Infinity', 'let big = 1 / 0;\nM big 0', /^`big` is Infinity in a path argument — /],
      ['negative Infinity', 'let big = -1 / 0;\nM big 0', /^`big` is -Infinity in a path argument — /],
      ['a relative command', 'let bad = sqrt(-1);\nM 0 0 h bad', /^`bad` is NaN in a path argument — /],
    ];
    for (const [name, source, message] of cases) {
      it(name, () => {
        const result = compile(source);
        expect(result.warnings).toHaveLength(1);
        const [warning] = result.warnings;
        expect(warning.code).toBe('non-finite');
        expect(warning.message).toMatch(message);
        expect(warning.message.endsWith(TAIL)).toBe(true);
        expect(warning.line).toBe(2);
        expect(warning.column).toBeGreaterThan(0);
        // still emitted — the pinned math-contract tests rely on this
        expect(result.layers[0].data).toMatch(/NaN|Infinity/);
      });
    }

    it('positions the warning AT the argument', () => {
      // `M bad 0` — `bad` starts at column 3 of line 2.
      const [warning] = compile('let bad = sqrt(-1);\nM bad 0').warnings;
      expect({ line: warning.line, column: warning.column }).toEqual({ line: 2, column: 3 });
    });

    it('is mirrored into the log stream like every other warning', () => {
      const result = compile('let bad = sqrt(-1);\nM bad 0');
      const mirror = result.logs.find((entry) => entry.severity === 'warn');
      expect(mirror?.line).toBe(2);
      expect(mirror?.parts[0].value).toBe(`[warn] ${result.warnings[0].message}`);
    });

    it('reaches the editor as a warning diagnostic, not an error', () => {
      const diagnostics = getDiagnostics(new StringTextDocument('let bad = sqrt(-1);\nM bad 0'));
      const hit = diagnostics.find((diagnostic) => diagnostic.message.includes('is NaN in a path argument'));
      expect(hit?.severity).toBe(DiagnosticSeverity.Warning);
      expect(hit?.range.start.line).toBe(1); // LSP lines are 0-based
    });

    it('finite arguments — zero, negative, fractional — produce no warning', () => {
      const result = compile('let shift = -5;\nM shift 0 h 0 l calc(shift * 2.5) 0.25');
      expect(result.warnings).toEqual([]);
      expect(result.layers[0].data).toBe('M -5 0 h 0 l -12.5 0.25');
    });

    it('the documented math contracts still reach the path (the five pinned tests)', () => {
      expect(compile('M calc(smoothstep(5, 5, 5)) 0').layers[0].data).toBe('M NaN 0');
      expect(compile('let d = calc(10 / 0); M d 0').layers[0].data).toContain('Infinity');
    });
  });

  describe('a function that draws follows the same policy', () => {
    it('a NaN argument warns instead of throwing, names the variable, and is emitted', () => {
      const result = compile('let radius = sqrt(-1);\ncircle(50, 50, radius);');
      expect(result.warnings).toHaveLength(1);
      const [warning] = result.warnings;
      expect(warning.code).toBe('non-finite');
      expect(warning.message).toBe(`circle(): argument 3 (\`radius\`) is NaN — ${TAIL}`);
      expect({ line: warning.line, column: warning.column }).toEqual({ line: 2, column: 1 });
      expect(result.layers[0].data).toContain('NaN');
    });

    it('an Infinity argument, not a variable', () => {
      const [warning] = compile('rect(0, 0, 1 / 0, 10);').warnings;
      expect(warning.message).toBe(`rect(): argument 3 is Infinity — ${TAIL}`);
    });

    it('warns ONCE per call — not again when the NaN shows up in what was emitted', () => {
      expect(compile('circle(50, 50, sqrt(-1));').warnings).toHaveLength(1);
    });

    it('a NaN buried in a structured argument warns with what was produced', () => {
      const source =
        'cubicSpline([{ x: sqrt(-1), y: 100, angle: 0, exit: 30 }, { x: 100, y: 100, angle: 0, entry: 30 }]);';
      const result = compile(source);
      expect(result.warnings.map((warning) => [warning.code, warning.message])).toEqual([
        ['non-finite', 'cubicSpline() produced a non-numeric coordinate (NaN) — check its arguments'],
      ]);
    });

    it('a context-aware function with a NaN ARGUMENT warns — it is not mistaken for a missing one', () => {
      const result = compile('let turnBy = sqrt(-1);\nM 0 0 polarLine(turnBy, 10);');
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].message).toBe(`polarLine(): argument 1 (\`turnBy\`) is NaN — ${TAIL}`);
    });
  });

  describe('what stays an ERROR, because it is always a mistake', () => {
    it('null', () => {
      expect(() => compile('let [present, missing] = [40];\ncircle(50, 50, missing);')).toThrow(
        /circle\(\): argument 3 \(`missing`\) is null/,
      );
    });

    it('too few arguments to a path function', () => {
      expect(() => compile('circle(10);')).toThrow(/circle\(\) expects 3 arguments, got 1/);
    });

    it('null as a raw path argument', () => {
      expect(() => compile('let missing = null;\nM missing 0')).toThrow(/Cannot use null as a path argument/);
    });

    // Derived from the source set, so a context-aware function added later is
    // covered. BOTH outcomes are asserted — an earlier version returned from the
    // catch without checking anything, so nine of its ten cases asserted nothing
    // (code review). A throw must be a real compile error about THIS call, not
    // a parse error in the template; and the template is proven to compile.
    const withNoArguments = (name: string) => `M 0 0 h 10 heading(0deg); ${name}(); L 20 20`;
    const ABOUT_THE_CALL = /produced a non-numeric|left the heading as|requires|expects|is null/;

    it('the template compiles when the call is complete — so a throw below is about the call', () => {
      const result = compile('M 0 0 h 10 heading(0deg); polarLine(0deg, 10); L 20 20');
      expect(result.layers[0].data).toBe('M 0 0 h 10 L 20 0 L 20 20');
      expect(result.warnings).toEqual([]);
    });

    for (const name of contextAwareFunctions) {
      it(`${name}() with no arguments is an error, or emits nothing non-numeric — never a mere warning`, () => {
        let thrown = '';
        let result: ReturnType<typeof compile> | null = null;
        try {
          result = compile(withNoArguments(name));
        } catch (error) {
          thrown = (error as Error).message;
        }
        if (result === null) {
          expect(thrown).toMatch(/^Line 1, col \d+: /);
          expect(thrown).toMatch(ABOUT_THE_CALL);
          expect(thrown).toContain(name);
        } else {
          expect(result.warnings.map((warning) => warning.code)).not.toContain('non-finite');
          expect(result.layers.map((layer) => layer.data).join(' ')).not.toMatch(/NaN|Infinity|undefined|null/);
        }
      });
    }

    it('a missing context-aware argument is still the positioned error', () => {
      expect(() => compile('M 0 0 polarLine(0.5);')).toThrow(
        /Line 1, col \d+: polarLine\(\) produced a non-numeric coordinate \(NaN\).*it received 1 argument\)/,
      );
    });
  });

  describe('strict mode', () => {
    const NAN_PROGRAM = 'let bad = sqrt(-1);\nM bad 0';
    const FILLET_PROGRAM =
      'let plate = @{\n  h 40\n  v 40\n  h -40\n  z\n};\nlet soft = plate.fillet(30);\nM 10 10\nsoft.draw();';

    it('strict: true turns the warning into a positioned error that names its code', () => {
      expect(() => compile(NAN_PROGRAM, { strict: true })).toThrow(
        /^Line 2, col 3: `bad` is NaN in a path argument — .* \(strict: non-finite\)$/,
      );
    });

    it('strict: true covers every code, not only this one', () => {
      expect(compile(FILLET_PROGRAM).warnings[0].code).toBe('corner-op');
      expect(() => compile(FILLET_PROGRAM, { strict: true })).toThrow(/\(strict: corner-op\)$/);
    });

    it('naming codes keeps the warnings a program has accepted', () => {
      expect(() => compile(NAN_PROGRAM, { strict: ['non-finite'] })).toThrow(/\(strict: non-finite\)$/);
      const accepted = compile(FILLET_PROGRAM, { strict: ['non-finite'] });
      expect(accepted.warnings[0].code).toBe('corner-op');
      expect(compile(NAN_PROGRAM, { strict: ['gradient'] }).warnings[0].code).toBe('non-finite');
    });

    it('off by default, and false or an empty list mean off', () => {
      for (const options of [undefined, {}, { strict: false }, { strict: [] }]) {
        expect(compile(NAN_PROGRAM, options).warnings).toHaveLength(1);
      }
    });

    it('compileWithContext honours it too — the path the playground takes', () => {
      expect(compileWithContext(NAN_PROGRAM).warnings).toHaveLength(1);
      expect(() => compileWithContext(NAN_PROGRAM, { strict: ['non-finite'] })).toThrow(/\(strict: non-finite\)$/);
    });

    // Every error raised inside a callback is wrapped with the invocation that
    // raised it — `Line 3: Error in .map() callback at index 0: Line 4, col 13: …`
    // for an ordinary error, and the same for a failing assert(). A strict error
    // follows that format; it is not a second, accidental position prefix.
    it('inside a callback it reads like every other error raised there', () => {
      const source =
        'let bad = sqrt(-1);\nlet list = [1, 2];\nlet out = list.map {|item|\n  M bad 0\n  return item;\n};';
      expect(() => compile(source, { strict: true })).toThrow(
        /^Line 3: Error in \.map\(\) callback at index 0: Line 4, col 5: `bad` is NaN in a path argument — .* \(strict: non-finite\)$/,
      );
      const ordinary =
        "let list = [1, 2];\nlet pad = 0;\nlet out = list.map {|item|\n  let broken = list.slice('a');\n  return item;\n};";
      expect(() => compile(ordinary)).toThrow(
        /^Line 3: Error in \.map\(\) callback at index 0: Line 4, col \d+: slice\(\)/,
      );
    });

    it('a clean program is unaffected', () => {
      expect(compile('M 0 0 L 10 10', { strict: true }).layers[0].data).toBe('M 0 0 L 10 10');
    });
  });

  // Found in code review. NaN and Infinity are numbers spelled with letters, and
  // two of those letters are path commands: the `a` in NaN and the `t` in
  // Infinity. The tokenizer that rebuilds the structured trace from emitted text
  // read them as commands, so `circle(50, 50, NaN)` traced as TEN commands, and
  // `L NaN 20` grew a phantom arc. Raw arguments had always done this, silently;
  // emitting a non-finite number is now an official outcome, so the trace —
  // `--json` records, pen tracking — has to stay true.
  describe('the structured trace survives a non-finite number', () => {
    const letters = (source: string) =>
      (compile(source, { trace: true }).layers[0].commands ?? []).map((entry) => entry.command).join(' ');

    it('control: a finite circle is M a a', () => {
      expect(letters('circle(50, 50, 20);')).toBe('M a a');
    });

    it('a NaN circle is still M a a — not ten commands', () => {
      expect(letters('circle(50, 50, sqrt(-1));')).toBe('M a a');
    });

    it('a raw NaN argument does not grow a phantom arc', () => {
      expect(letters('M 10 10 L calc(sqrt(-1)) 20 L 30 30')).toBe('M L L');
    });

    it('a raw Infinity argument does not grow a phantom t', () => {
      expect(letters('M 10 10 L calc(1 / 0) 20 L 30 30')).toBe('M L L');
    });

    describe('the tokenizer reads the words as numbers, sign included', () => {
      it('NaN', () => {
        expect(tokenizePathData('M 10 10 L NaN 20 L 30 30')).toEqual([
          { command: 'M', args: [10, 10] },
          { command: 'L', args: [Number.NaN, 20] },
          { command: 'L', args: [30, 30] },
        ]);
      });

      it('Infinity and -Infinity keep their sign', () => {
        expect(tokenizePathData('L Infinity 20 L -Infinity 5')).toEqual([
          { command: 'L', args: [Number.POSITIVE_INFINITY, 20] },
          { command: 'L', args: [Number.NEGATIVE_INFINITY, 5] },
        ]);
      });

      it('inside an arc, including next to its one-digit flag slots', () => {
        expect(tokenizePathData('a NaN NaN 0 1 1 NaN 0')).toEqual([
          { command: 'a', args: [Number.NaN, Number.NaN, 0, 1, 1, Number.NaN, 0] },
        ]);
      });

      it('packed against a command letter, as the serializer never writes but a hand-made d might', () => {
        expect(tokenizePathData('M0 0LNaN 5')).toEqual([
          { command: 'M', args: [0, 0] },
          { command: 'L', args: [Number.NaN, 5] },
        ]);
      });

      it('finite path data is tokenized exactly as before', () => {
        expect(tokenizePathData('M 10-5 a 5 5 0 1110 0 t 1.5.5')).toEqual([
          { command: 'M', args: [10, -5] },
          { command: 'a', args: [5, 5, 0, 1, 1, 10, 0] },
          { command: 't', args: [1.5, 0.5] },
        ]);
      });

      it('the display split keeps a non-finite word inside its command', () => {
        expect(splitPathCommands('M 10 10 L NaN 20 L Infinity 5')).toEqual([
          { command: 'M', argsText: '10 10' },
          { command: 'L', argsText: 'NaN 20' },
          { command: 'L', argsText: 'Infinity 5' },
        ]);
      });
    });
  });

  describe('the list of codes', () => {
    it('is exported at runtime and includes the new code', () => {
      expect(WARNING_CODES).toContain('non-finite');
      expect(WARNING_CODES).toContain('corner-op');
      expect(new Set(WARNING_CODES).size).toBe(WARNING_CODES.length);
    });
  });
});
