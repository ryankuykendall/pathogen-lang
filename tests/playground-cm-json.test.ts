// pathogen.json's highlighting in the editor (2d, step 4a): a small JSON
// tokenizer behind a CodeMirror StreamLanguage (playground/utils/cm-json-language.ts).
// Names are highlight tags: keys as propertyName, as CodeMirror's JSON mode does.

import { describe, expect, it } from 'vitest';

import { longestLine, nextJsonToken, viewerLanguage } from '../playground/utils/cm-json-language.js';

describe('the read-only viewer’s language (phase 3a)', () => {
  it('JSON for a data file and pathogen.json, Pathogen for the rest', () => {
    expect([
      viewerLanguage('data', '[1, 2]'),
      viewerLanguage('project', '{ "entryPoints": [] }'),
      viewerLanguage('program', 'M 0 0'),
      viewerLanguage('library', 'module;'),
    ]).toEqual(['json', 'json', 'pathogen', 'pathogen']);
  });

  it('a data file with a line past 20,000 characters is plain, as the editor shows it', () => {
    const line = (n: number): string => `[${'1,'.repeat(n)}1]`;
    expect(longestLine(`{\n${line(9_998)}\n}`)).toBe(19_999);
    expect(viewerLanguage('data', `{\n${line(9_998)}\n}`)).toBe('json');
    expect(viewerLanguage('data', `{\n${line(10_000)}\n}`)).toBe('plain');
    // pathogen.json is never that long, and keeps its highlighting.
    expect(viewerLanguage('project', line(10_000))).toBe('json');
  });
});

/** A line's tokens as [text, tag], whitespace left out. */
function tokens(line: string): [string, string][] {
  const out: [string, string][] = [];
  let pos = 0;
  while (pos < line.length) {
    const { end, style } = nextJsonToken(line, pos);
    expect(end).toBeGreaterThan(pos);
    if (style !== null) out.push([line.slice(pos, end), style]);
    pos = end;
  }
  return out;
}

describe('the JSON tokenizer', () => {
  it('reads pathogen.json as the playground writes it', () => {
    expect(tokens('{')).toEqual([['{', 'brace']]);
    expect(tokens('  "entryPoints": [')).toEqual([
      ['"entryPoints"', 'propertyName'],
      [':', 'punctuation'],
      ['[', 'squareBracket'],
    ]);
    expect(tokens('    "parts/main.pathogen",')).toEqual([
      ['"parts/main.pathogen"', 'string'],
      [',', 'punctuation'],
    ]);
    expect(tokens('  ]')).toEqual([[']', 'squareBracket']]);
    expect(tokens('{}')).toEqual([
      ['{', 'brace'],
      ['}', 'brace'],
    ]);
  });

  it('knows escapes, numbers and the literals, and never stalls on anything else', () => {
    expect(tokens('"a \\" b" : -1.5e3, true false null')).toEqual([
      ['"a \\" b"', 'propertyName'],
      [':', 'punctuation'],
      ['-1.5e3', 'number'],
      [',', 'punctuation'],
      ['true', 'bool'],
      ['false', 'bool'],
      ['null', 'null'],
    ]);
    // An unclosed string runs to the end of the line; a stray character is punctuation.
    expect(tokens('"open @')).toEqual([['"open @', 'string']]);
    expect(tokens('@')).toEqual([['@', 'punctuation']]);
  });
});
