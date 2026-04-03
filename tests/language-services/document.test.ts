import { describe, it, expect } from 'vitest';
import { StringTextDocument } from '../../src/language-services/document';

describe('StringTextDocument', () => {
  describe('lineCount', () => {
    it('counts a single line (no newline)', () => {
      expect(new StringTextDocument('hello').lineCount).toBe(1);
    });

    it('counts empty string as 1 line', () => {
      expect(new StringTextDocument('').lineCount).toBe(1);
    });

    it('counts lines separated by LF', () => {
      expect(new StringTextDocument('a\nb\nc').lineCount).toBe(3);
    });

    it('counts trailing newline as starting a new empty line', () => {
      expect(new StringTextDocument('a\nb\n').lineCount).toBe(3);
    });

    it('handles CRLF line endings', () => {
      expect(new StringTextDocument('a\r\nb\r\nc').lineCount).toBe(3);
    });

    it('handles bare CR line endings', () => {
      expect(new StringTextDocument('a\rb\rc').lineCount).toBe(3);
    });
  });

  describe('positionAt', () => {
    it('returns 0,0 for offset 0', () => {
      const doc = new StringTextDocument('hello\nworld');
      expect(doc.positionAt(0)).toEqual({ line: 0, character: 0 });
    });

    it('returns position within first line', () => {
      const doc = new StringTextDocument('hello\nworld');
      expect(doc.positionAt(3)).toEqual({ line: 0, character: 3 });
    });

    it('returns start of second line', () => {
      const doc = new StringTextDocument('hello\nworld');
      // offset 6 = 'h','e','l','l','o','\n' -> start of 'world'
      expect(doc.positionAt(6)).toEqual({ line: 1, character: 0 });
    });

    it('returns position within second line', () => {
      const doc = new StringTextDocument('hello\nworld');
      expect(doc.positionAt(8)).toEqual({ line: 1, character: 2 });
    });

    it('clamps negative offset to 0,0', () => {
      const doc = new StringTextDocument('hello\nworld');
      expect(doc.positionAt(-5)).toEqual({ line: 0, character: 0 });
    });

    it('clamps offset beyond end to last position', () => {
      const doc = new StringTextDocument('hello\nworld');
      expect(doc.positionAt(999)).toEqual({ line: 1, character: 5 });
    });

    it('handles empty document', () => {
      const doc = new StringTextDocument('');
      expect(doc.positionAt(0)).toEqual({ line: 0, character: 0 });
    });

    it('handles CRLF correctly', () => {
      const doc = new StringTextDocument('ab\r\ncd');
      // offset 0='a', 1='b', 2='\r', 3='\n', 4='c', 5='d'
      expect(doc.positionAt(4)).toEqual({ line: 1, character: 0 });
      expect(doc.positionAt(5)).toEqual({ line: 1, character: 1 });
    });

    it('handles multiple lines', () => {
      const doc = new StringTextDocument('let x = 10;\nlet y = 20;\nM x y');
      expect(doc.positionAt(12)).toEqual({ line: 1, character: 0 });
      expect(doc.positionAt(24)).toEqual({ line: 2, character: 0 });
      expect(doc.positionAt(26)).toEqual({ line: 2, character: 2 });
    });
  });

  describe('offsetAt', () => {
    it('returns 0 for position 0,0', () => {
      const doc = new StringTextDocument('hello\nworld');
      expect(doc.offsetAt({ line: 0, character: 0 })).toBe(0);
    });

    it('returns offset within first line', () => {
      const doc = new StringTextDocument('hello\nworld');
      expect(doc.offsetAt({ line: 0, character: 3 })).toBe(3);
    });

    it('returns offset at start of second line', () => {
      const doc = new StringTextDocument('hello\nworld');
      expect(doc.offsetAt({ line: 1, character: 0 })).toBe(6);
    });

    it('clamps line beyond document', () => {
      const doc = new StringTextDocument('hello\nworld');
      // Line 99 clamps to last line (1), then character 0
      expect(doc.offsetAt({ line: 99, character: 0 })).toBe(6);
    });

    it('clamps character beyond line length', () => {
      const doc = new StringTextDocument('hello\nworld');
      // Line 0 has 5 chars + newline, character 99 clamps to end of line content + newline
      expect(doc.offsetAt({ line: 0, character: 99 })).toBe(6);
    });

    it('clamps negative line to 0', () => {
      const doc = new StringTextDocument('hello\nworld');
      expect(doc.offsetAt({ line: -1, character: 0 })).toBe(0);
    });

    it('handles empty document', () => {
      const doc = new StringTextDocument('');
      expect(doc.offsetAt({ line: 0, character: 0 })).toBe(0);
    });
  });

  describe('round-trip: positionAt <-> offsetAt', () => {
    it('round-trips every offset in a multi-line document', () => {
      const text = 'let x = 10;\nfor (i in 0..5) {\n  M i 0\n}';
      const doc = new StringTextDocument(text);
      for (let offset = 0; offset <= text.length; offset++) {
        const pos = doc.positionAt(offset);
        const back = doc.offsetAt(pos);
        expect(back, `offset ${offset} -> pos(${pos.line},${pos.character}) -> offset ${back}`).toBe(
          Math.min(offset, text.length),
        );
      }
    });
  });

  describe('getText', () => {
    it('returns the original content', () => {
      const text = 'M 10 20\nL 30 40';
      expect(new StringTextDocument(text).getText()).toBe(text);
    });
  });
});
