import { describe, expect, it } from 'vitest';

import { highlightPathogen, highlightPathogenTokens } from '../src/highlight';

import type { HighlightToken } from '../src/highlight';

function roundTrip(lines: HighlightToken[][]): string {
  return lines.map((ts) => ts.map((t) => t.text).join('')).join('\n');
}

function classesOf(lines: HighlightToken[][]): Map<string, string | null> {
  const map = new Map<string, string | null>();
  for (const line of lines) {
    for (const tok of line) {
      if (!map.has(tok.text)) map.set(tok.text, tok.cls);
    }
  }
  return map;
}

describe('highlightPathogenTokens', () => {
  it('round-trips the exact source text', () => {
    const source = [
      'define ViewBox(0, 0, 800, 1000);',
      '',
      'let rings = 5;',
      'let center = Point(400, 500);',
      '',
      'for i in 1..rings {',
      '  circle(center, 60 + i * 70).draw();',
      '}',
      '',
      '// the sun',
      'circle(center, 26).draw();',
    ].join('\n');
    expect(roundTrip(highlightPathogenTokens(source))).toBe(source);
  });

  it('returns one token array per source line', () => {
    const source = 'let a = 1;\nlet b = 2;\n\nlet c = 3;';
    const lines = highlightPathogenTokens(source);
    expect(lines).toHaveLength(4);
    expect(lines[2]).toEqual([]);
  });

  it('classifies keywords, numbers, and identifiers', () => {
    const lines = highlightPathogenTokens('let x = 10 + 2;');
    const classes = classesOf(lines);
    expect(classes.get('let')).toBe('kw');
    expect(classes.get('x')).toBe('id');
    expect(classes.get('10')).toBe('num');
    expect(classes.get('2')).toBe('num');
    // Anonymous literal tokens (=, +, ;) never appear as Lezer tree
    // nodes — they land in un-classed gap text, matching the shipped
    // highlightPathogen behavior.
    expect(classes.get('=')).toBeNull();
  });

  it('classifies comments and strings', () => {
    const lines = highlightPathogenTokens('// note\nlet s = "hi";');
    const classes = classesOf(lines);
    expect(classes.get('// note')).toBe('cm');
    expect(classes.get('"hi"')).toBe('str');
  });

  it('classifies the range operator and loop keywords', () => {
    const lines = highlightPathogenTokens('for i in 1..5 {\n}');
    const classes = classesOf(lines);
    expect(classes.get('for')).toBe('kw');
    expect(classes.get('in')).toBe('kw');
    expect(classes.get('..')).toBe('op');
  });

  it('splits multi-line tokens across lines, keeping the class', () => {
    // A gap token containing a newline must not leak a '\n' into any
    // token's text.
    const source = 'let a = 1;\n\n\nlet b = 2;';
    const lines = highlightPathogenTokens(source);
    expect(lines).toHaveLength(4);
    for (const line of lines) {
      for (const tok of line) {
        expect(tok.text).not.toContain('\n');
      }
    }
    expect(roundTrip(lines)).toBe(source);
  });

  it('handles empty source', () => {
    expect(highlightPathogenTokens('')).toEqual([[]]);
    expect(roundTrip(highlightPathogenTokens(''))).toBe('');
  });

  it('round-trips syntactically invalid source', () => {
    const source = 'let = ;;; @@@ unclosed(';
    expect(roundTrip(highlightPathogenTokens(source))).toBe(source);
  });

  it('agrees with highlightPathogen HTML output', () => {
    const source = 'let x = 1;\n// c\ncircle(Point(0, 0), 5).draw();';
    const fromTokens = highlightPathogenTokens(source)
      .map((line) =>
        line
          .map((t) => {
            const esc = t.text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            return t.cls ? `<span class="${t.cls}">${esc}</span>` : esc;
          })
          .join(''),
      )
      .join('\n');
    // Same text and classes; the flat form may merge adjacent
    // un-classed runs, so compare after stripping tags pairs down to
    // a canonical form: remove empty spans and compare rendered text +
    // class sequence.
    const stripText = (html: string): string => html.replace(/<[^>]+>/g, '');
    const classSeq = (html: string): string[] => [...html.matchAll(/<span class="(\w+)">/g)].map((m) => m[1]);
    const direct = highlightPathogen(source);
    expect(stripText(fromTokens)).toBe(stripText(direct));
    // Token-form may split one multi-line span into several; compare
    // deduplicated adjacent runs.
    const dedupe = (seq: string[]): string[] => seq.filter((c, i) => i === 0 || seq[i - 1] !== c);
    expect(dedupe(classSeq(fromTokens))).toEqual(dedupe(classSeq(direct)));
  });
});
