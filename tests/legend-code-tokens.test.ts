import { describe, expect, it } from 'vitest';

import { layoutCodeLines } from '../playground/utils/legend-code-tokens';

import type { CodeToken } from '../playground/utils/legend-code-tokens';

const tok = (text: string, cls: string | null = null): CodeToken => ({ text, cls });
const joined = (lines: CodeToken[][]): string[] => lines.map((ts) => ts.map((t) => t.text).join(''));

describe('layoutCodeLines', () => {
  it('monochrome fallback: one plain token per line', () => {
    const lines = layoutCodeLines('let a = 1;\nlet b = 2;', { maxLines: 128, charsPerLine: 80 });
    expect(lines).toEqual([[tok('let a = 1;')], [tok('let b = 2;')]]);
  });

  it('preserves blank lines as a single space token', () => {
    const lines = layoutCodeLines('a\n\nb', { maxLines: 128, charsPerLine: 80 });
    expect(joined(lines)).toEqual(['a', ' ', 'b']);
  });

  it('caps at maxLines and appends a "..." row', () => {
    const source = Array.from({ length: 10 }, (_, i) => `line ${i}`).join('\n');
    const lines = layoutCodeLines(source, { maxLines: 4, charsPerLine: 80 });
    expect(lines).toHaveLength(5);
    expect(joined(lines)[4]).toBe('...');
    expect(joined(lines)[3]).toBe('line 3');
  });

  it('truncates long lines to charsPerLine with a "..." suffix', () => {
    const lines = layoutCodeLines('abcdefghijklmnop', { maxLines: 128, charsPerLine: 10 });
    expect(joined(lines)).toEqual(['abcdefg...']);
  });

  it('truncates at token boundaries, keeping earlier token classes', () => {
    const tokenLines = [[tok('let', 'kw'), tok(' count = ', null), tok('123456789', 'num')]];
    const lines = layoutCodeLines('let count = 123456789', {
      maxLines: 128,
      charsPerLine: 15,
      tokenLines,
    });
    expect(joined(lines)).toEqual(['let count = ...']);
    expect(lines[0][0]).toEqual(tok('let', 'kw'));
    // The num token had no room inside the 12-char budget; the ellipsis is plain.
    expect(lines[0][lines[0].length - 1]).toEqual(tok('...', null));
  });

  it('slices a token that crosses the budget, keeping its class', () => {
    const tokenLines = [[tok('abcdefghijklmnop', 'str')]];
    const lines = layoutCodeLines('abcdefghijklmnop', { maxLines: 128, charsPerLine: 10, tokenLines });
    expect(lines[0]).toEqual([tok('abcdefg', 'str'), tok('...', null)]);
  });

  it('uses token lines verbatim when they fit', () => {
    const tokenLines = [
      [tok('let', 'kw'), tok(' x = ', null), tok('1', 'num'), tok(';', null)],
      [],
      [tok('// c', 'cm')],
    ];
    const lines = layoutCodeLines('let x = 1;\n\n// c', { maxLines: 128, charsPerLine: 80, tokenLines });
    expect(lines[0]).toEqual(tokenLines[0]);
    expect(lines[1]).toEqual([tok(' ')]); // blank line placeholder
    expect(lines[2]).toEqual(tokenLines[2]);
  });

  it('rejects token lines that do not round-trip the source', () => {
    const tokenLines = [[tok('WRONG', 'kw')]];
    const lines = layoutCodeLines('let x = 1;', { maxLines: 128, charsPerLine: 80, tokenLines });
    expect(lines).toEqual([[tok('let x = 1;')]]);
  });

  it('handles empty source', () => {
    expect(layoutCodeLines('', { maxLines: 128, charsPerLine: 80 })).toEqual([[tok(' ')]]);
  });
});
