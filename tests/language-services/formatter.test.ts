import { describe, it, expect } from 'vitest';
import { StringTextDocument } from '../../src/language-services/document';
import { formatDocument } from '../../src/language-services/formatter';

function format(source: string, indent?: string): string {
  const edits = formatDocument(new StringTextDocument(source), indent ? { indent } : undefined);
  if (edits.length === 0) return source; // Already formatted or unparseable
  return edits[0].newText;
}

describe('formatDocument', () => {
  it('returns empty edits for unparseable source', () => {
    const edits = formatDocument(new StringTextDocument('let x = '));
    expect(edits).toHaveLength(0);
  });

  describe('indentation', () => {
    it('indents for-loop body', () => {
      const result = format('for (i in 0..5) {\nM i 0\n}');
      expect(result).toBe('for (i in 0..5) {\n  M i 0\n}');
    });

    it('indents function body', () => {
      const result = format('fn draw() {\nM 0 0\nL 100 100\n}');
      expect(result).toBe('fn draw() {\n  M 0 0\n  L 100 100\n}');
    });

    it('indents nested blocks', () => {
      const result = format('for (i in 0..3) {\nif (i > 1) {\nM i 0\n}\n}');
      expect(result).toBe('for (i in 0..3) {\n  if (i > 1) {\n    M i 0\n  }\n}');
    });

    it('indents if-else', () => {
      const result = format('if (x > 0) {\nM 10 10\n} else {\nM 0 0\n}');
      expect(result).toContain('  M 10 10');
      expect(result).toContain('} else {');
      expect(result).toContain('  M 0 0');
    });
  });

  describe('path commands', () => {
    it('formats path command with spaces', () => {
      expect(format('M 10 20')).toBe('M 10 20');
    });

    it('formats Z with no args', () => {
      expect(format('M 0 0\nL 100 0\nZ')).toContain('Z');
    });
  });

  describe('let declarations', () => {
    it('formats simple let', () => {
      expect(format('let x = 10;')).toBe('let x = 10;');
    });

    it('formats let with expression', () => {
      const result = format('let y = calc(10 + 20);');
      expect(result).toContain('let y =');
    });
  });

  describe('functions', () => {
    it('formats function with params', () => {
      const result = format('fn draw(cx, cy, r) {\ncircle(cx, cy, r)\n}');
      expect(result).toBe('fn draw(cx, cy, r) {\n  circle(cx, cy, r)\n}');
    });
  });

  describe('enums', () => {
    it('formats enum with indented members', () => {
      const result = format('enum Dir {\nUP,\nDOWN\n}');
      expect(result).toContain('  UP');
      expect(result).toContain('  DOWN');
    });
  });

  describe('custom indent', () => {
    it('uses 4-space indent when specified', () => {
      const result = format('for (i in 0..5) {\nM i 0\n}', '    ');
      expect(result).toBe('for (i in 0..5) {\n    M i 0\n}');
    });

    it('uses tab indent when specified', () => {
      const result = format('for (i in 0..5) {\nM i 0\n}', '\t');
      expect(result).toBe('for (i in 0..5) {\n\tM i 0\n}');
    });
  });

  describe('expressions', () => {
    it('formats binary expressions with spaces', () => {
      const result = format('let x = calc(10 + 20);');
      expect(result).toContain('10 + 20');
    });

    it('formats array literals', () => {
      const result = format('let arr = [1, 2, 3];');
      expect(result).toContain('[1, 2, 3]');
    });
  });
});
