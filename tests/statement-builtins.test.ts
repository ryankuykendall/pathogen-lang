import { describe, expect, it } from 'vitest';

import { compile, compileWithContext } from '../src';
import { getDiagnostics } from '../src/language-services/diagnostics';
import { StringTextDocument } from '../src/language-services/document';

const logText = (src: string): string[] =>
  compile(src).logs.map((entry) => entry.parts.map((p) => (p.label ? `${p.label} = ${p.value}` : p.value)).join(' '));

/**
 * log() and assert() are statement builtins: they run for their effect from
 * statement position in every body kind, produce no value and no path
 * output, and are a compile error in value position.
 */
describe('statement builtins: log() and assert()', () => {
  describe('log() is a statement everywhere', () => {
    it.each([
      ['top level', 'log("top");\nM 0 0', ['top']],
      ['for body', 'for (i in 0..1) {\n  log("loop", i);\n}\nM 0 0', ['loop i = 0', 'loop i = 1']],
      ['if body', 'let a = 1;\nif (a > 0) {\n  log("yes");\n}\nM 0 0', ['yes']],
      ['fn body', 'fn f() {\n  log("fn");\n  return 1;\n}\nlet v = f();\nM calc(v) 0', ['fn']],
      [
        'lambda body',
        'let g = {|x|\n  log("lambda", x);\n  return x;\n};\nlet v = g(2);\nM calc(v) 0',
        ['lambda x = 2'],
      ],
      [
        'apply block',
        "define PathLayer('p') #{ stroke: red; }\nlayer('p').apply {\n  log(\"apply\");\n  M 1 1\n}",
        ['apply'],
      ],
      ['path block', 'let b = @{\n  log("block");\n  h 10\n};\nM 0 0\nb.draw()', ['block']],
      ['text block', 'let tb = &{\n  log("text");\n  text(0, 0) `a`;\n};\nM calc(tb.elementCount) 0', ['text']],
      ['constructor callback', 'let m = Marker(\'m\', 10, 10) {|mk|\n  log("marker");\n};\nM 0 0', ['marker']],
    ])('%s', (_name, src, expected) => {
      expect(logText(src)).toEqual(expected);
    });

    it('a number-shaped argument logs the number instead of computing a logarithm', () => {
      const result = compile('log(sqrt(9));\nlog(2.5);\nM 0 0');
      expect(result.layers[0].data).toBe('M 0 0');
      expect(result.logs.map((e) => e.parts[0].value)).toEqual(['3', '2.5']);
    });

    it('carries the source line', () => {
      const result = compile('M 0 0\n\nlog("third line");');
      expect(result.logs[0].line).toBe(3);
    });

    it('is a compile error in value position, naming ln()', () => {
      expect(() => compile('let y = log(3);\nM 0 0')).toThrow(
        'Line 1, col 9: log() records a message and has no value — use ln(x) for the natural logarithm',
      );
      expect(() => compile('M calc(log(2)) 0')).toThrow(/use ln\(x\)/);
    });
  });

  describe('ln()', () => {
    it('is the natural logarithm', () => {
      expect(compile('M calc(ln(1)) calc(round(ln(exp(2))))').layers[0].data).toBe('M 0 2');
    });
  });

  describe('assert()', () => {
    it('is silent when the condition holds', () => {
      const result = compile('let w = 5;\nassert(w < 10, "too wide");\nassert(w);\nM 0 0');
      expect(result.layers[0].data).toBe('M 0 0');
      expect(result.logs).toEqual([]);
    });

    it('fails with the message, line, and column', () => {
      expect(() => compile('let w = 50;\nassert(w < 10, `w is ${w}`);\nM 0 0')).toThrow(
        'Line 2, col 1: assertion failed: w is 50',
      );
    });

    it('uses the condition source as the default message', () => {
      expect(() => compile('let w = 50;\nassert(w < 10);')).toThrow('Line 2, col 1: assertion failed: w < 10');
    });

    it('treats null, 0, false, and the empty string as failures', () => {
      for (const cond of ['null', '0', 'false', '""']) {
        expect(() => compile(`assert(${cond});`)).toThrow(/assertion failed/);
      }
    });

    it('checks its arity and rejects value position', () => {
      expect(() => compile('assert();')).toThrow(/assert\(\) expects 1 or 2 arguments, got 0/);
      expect(() => compile('let z = assert(true);')).toThrow('assert() is a statement and has no value');
    });

    it('fails inside a loop and a text block with the right line', () => {
      expect(() => compile('for (i in 0..3) {\n  assert(i < 2, `i=${i}`);\n}\nM 0 0')).toThrow(
        'Line 2, col 3: assertion failed: i=2',
      );
      expect(() => compile('let tb = &{\n  assert(false, "in text");\n};')).toThrow(
        'Line 2, col 3: assertion failed: in text',
      );
    });

    it('surfaces as an editor diagnostic on the failing line', () => {
      const diags = getDiagnostics(new StringTextDocument('let w = 50;\nassert(w < 10, "too wide");\nM 0 0'));
      expect(diags.some((d) => d.message.includes('assertion failed: too wide') && d.range.start.line === 1)).toBe(
        true,
      );
    });
  });

  it('compileWithContext sees the same logs', () => {
    const result = compileWithContext('log("ctx");\nM 0 0');
    expect(result.logs.map((e) => e.parts[0].value)).toEqual(['ctx']);
  });
});
