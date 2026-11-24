/**
 * Phase 3a, step 2: our own JSON reader (src/data/json-reader.ts; note 76,
 * decision 2). docs/data-import.md promises one message for a JSON mistake
 * on every surface and keys in the file's order, which JSON.parse can't give:
 * its messages differ between browsers, and it puts keys such as "2" first.
 *
 * Each message says what was expected where the reading stopped. Lines and
 * columns count as the compiler's do: lines split at \n, columns in UTF-16
 * code units from 1.
 */
import { describe, expect, it } from 'vitest';

import { readJson } from '../src/data/json-reader';

import type { DataValue } from '../src/data/json-reader';

/**
 * A value read from JSON as plain JS, for comparing: objects as lists of
 * [key, value] entries (their order is part of the contract), arrays as
 * arrays, true/false as booleans. The reader builds Pathogen values.
 */
function plain(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  const tagged = value as DataValue & object;
  if (tagged.type === 'ObjectValue') return [...tagged.properties.entries()].map(([k, v]) => [k, plain(v)]);
  if (tagged.type === 'ArrayValue') return tagged.elements.map(plain);
  if (tagged.type === 'BooleanValue') return tagged.value === 1;
  throw new Error(`not a value JSON reads as: ${JSON.stringify(value)}`);
}

function read(text: string): unknown {
  const result = readJson(text);
  if (!result.ok) throw new Error(`${result.line}:${result.column} ${result.message}`);
  return plain(result.value);
}

function mistake(text: string): string {
  const result = readJson(text);
  if (result.ok) throw new Error(`read without a mistake: ${text}`);
  return `${result.line}:${result.column} ${result.message}`;
}

describe('values', () => {
  it('the example at the top of docs/data-import.md', () => {
    const text =
      '[\n  { "name": "drive", "x": 55, "y": 50, "radius": 40, "teeth": 12 },\n  { "name": "idler", "x": 150, "y": 50, "radius": 28, "teeth": 8 }\n]\n';
    expect(read(text)).toEqual([
      [
        ['name', 'drive'],
        ['x', 55],
        ['y', 50],
        ['radius', 40],
        ['teeth', 12],
      ],
      [
        ['name', 'idler'],
        ['x', 150],
        ['y', 50],
        ['radius', 28],
        ['teeth', 8],
      ],
    ]);
  });

  it.each<[string, unknown]>([
    ['0', 0],
    ['-0', -0],
    ['12', 12],
    ['-3.25', -3.25],
    ['1e3', 1000],
    ['2.5E-2', 0.025],
    ['1e+2', 100],
    ['true', true],
    ['false', false],
    ['null', null],
    ['""', ''],
    ['"plain"', 'plain'],
    ['[]', []],
    ['{}', []],
    [' \t\r\n 7 \r\n', 7],
  ])('%s', (text, value) => {
    expect(read(text)).toEqual(value);
  });

  it('every escape JSON has', () => {
    expect(read(String.raw`"q\" b\\ s\/ \b\f\n\r\t Aé€"`)).toBe(
      `q" b\\ s/ \b\f\n\r\t A${String.fromCodePoint(0xe9)}${String.fromCodePoint(0x20ac)}`,
    );
  });

  it('a pair of \\u escapes makes one character beyond U+FFFF, and text is kept as written', () => {
    expect(read(String.raw`"😀"`)).toBe(String.fromCodePoint(0x1f600));
    expect(read(`"${String.fromCodePoint(0x1f600)} ${String.fromCodePoint(0xe9)}"`)).toBe(
      `${String.fromCodePoint(0x1f600)} ${String.fromCodePoint(0xe9)}`,
    );
  });

  it('keys stay in the file\'s order, keys like "2" included', () => {
    expect(read('{ "b": 1, "2": 2, "a": 3, "10": 4 }')).toEqual([
      ['b', 1],
      ['2', 2],
      ['a', 3],
      ['10', 4],
    ]);
  });

  it('a key written twice keeps its last value, at its first place', () => {
    expect(read('{ "a": 1, "b": 2, "a": 3 }')).toEqual([
      ['a', 3],
      ['b', 2],
    ]);
  });

  it('__proto__ and constructor are keys like any other', () => {
    const result = readJson('{ "__proto__": { "polluted": true }, "constructor": 1 }');
    expect(result.ok && plain(result.value)).toEqual([
      ['__proto__', [['polluted', true]]],
      ['constructor', 1],
    ]);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('nesting 100,000 deep reads without running out of stack', () => {
    const depth = 100_000;
    const result = readJson(`${'['.repeat(depth)}1${']'.repeat(depth)}`);
    expect(result.ok).toBe(true);
    let value: unknown = result.ok ? result.value : null;
    let levels = 0;
    while (typeof value === 'object' && value !== null && (value as DataValue & object).type === 'ArrayValue') {
      value = (value as { elements: unknown[] }).elements[0];
      levels++;
    }
    expect([levels, value]).toEqual([depth, 1]);
  });

  it('a mistake 100,000 deep is still found and placed', () => {
    const depth = 100_000;
    expect(mistake(`${'['.repeat(depth)}1,${']'.repeat(depth)}`)).toBe(
      `1:${depth + 3} expected a value, not ]: JSON has no comma after the last item`,
    );
  });
});

describe('mistakes: what was expected where the reading stopped', () => {
  it.each<[string, string, string]>([
    // The message docs/data-import.md shows.
    ['a missing comma in an array', '[\n  1,\n  2\n  3\n]', '4:3 expected , or ] after an array item'],
    ['an array never closed', '[1, 2', '1:6 expected , or ] after an array item'],
    ['a missing comma in an object', '{ "a": 1 "b": 2 }', "1:10 expected , or } after a key's value"],
    ['an object never closed', '{ "a": 1', "1:9 expected , or } after a key's value"],
    ['a key without quotes', '{ a: 1 }', '1:3 expected a key in double quotes'],
    ['a key in single quotes', "{ 'a': 1 }", '1:3 expected a key in double quotes'],
    ['a number as a key', '{ 1: 2 }', '1:3 expected a key in double quotes'],
    ['a missing colon', '{ "a" 1 }', '1:7 expected : after the key "a"'],
    [
      'a comma after the last array item',
      '[1, 2,]',
      '1:7 expected a value, not ]: JSON has no comma after the last item',
    ],
    [
      'a comma after the last key',
      '{ "a": 1, }',
      '1:11 expected a key in double quotes, not }: JSON has no comma after the last item',
    ],
    ['a missing value', '{ "a": }', '1:8 expected a value'],
    ['a line comment', '[\n  1, // one\n  2\n]', "2:6 expected a value, not a comment: JSON can't have comments"],
    ['a block comment', '/* sizes */ [1]', "1:1 expected a value, not a comment: JSON can't have comments"],
    [
      'a comment after an item',
      '[1 // one\n]',
      "1:4 expected , or ] after an array item, not a comment: JSON can't have comments",
    ],
    ['a string in single quotes', "['a']", "1:2 expected a value, not ': strings in JSON use double quotes"],
    ['a word JSON lacks', '[True]', "1:2 expected a value, not True: JSON's words are true, false and null"],
    ['undefined', '{ "a": undefined }', "1:8 expected a value, not undefined: JSON's words are true, false and null"],
    ['NaN', '[NaN]', "1:2 expected a value, not NaN: JSON's words are true, false and null"],
    ['Infinity', '[-Infinity]', '1:3 expected a digit after -'],
    ['a string over two lines', '["one\ntwo"]', '1:6 expected " to end the string before the line ends'],
    ['a string never closed', '["one', '1:6 expected " to end the string before the file ends'],
    ['a tab inside a string', '["a\tb"]', '1:4 a tab inside a string is written \\t'],
    [
      'another control character',
      `["a${String.fromCharCode(1)}b"]`,
      '1:4 a control character inside a string is written \\u0001',
    ],
    [
      'an escape JSON lacks',
      String.raw`["a\x41"]`,
      String.raw`1:4 \x isn't an escape in JSON: write \", \\, \/, \b, \f, \n, \r, \t or \u followed by four hex digits`,
    ],
    ['a short \\u escape', String.raw`["\u12G4"]`, String.raw`1:3 expected four hex digits after \u`],
    [
      'a leading zero',
      '[01]',
      "1:3 expected , or ] after an array item, not a digit: a number can't start with 0 and another digit",
    ],
    ['a leading plus', '[+1]', "1:2 expected a value, not +: a number can't start with +"],
    ['a leading point', '[.5]', '1:2 expected a value, not .: a number needs a digit before its .'],
    ['a trailing point', '[1.]', '1:4 expected a digit after .'],
    ['an empty exponent', '[1e]', '1:4 expected a digit in the exponent'],
    ['a lone minus', '[-]', '1:3 expected a digit after -'],
    ['a number too large to hold', '{ "a": 1e400 }', '1:8 the number 1e400 is too large'],
    ['a second value', '[1] [2]', '1:5 expected the end of the file after the value'],
    ['a value after an object', '{}\nx', '2:1 expected the end of the file after the value'],
    ['an empty file', '', '1:1 expected a value: the file is empty'],
    ['a file of spaces', '  \n  ', '2:3 expected a value: the file is empty'],
  ])('%s', (_what, text, expected) => {
    expect(mistake(text)).toBe(expected);
  });

  it('columns count UTF-16 code units, as the editors do', () => {
    // `["` is columns 1–2, the emoji two code units (3–4), `" ` 5–6: the 1 is at column 7.
    expect(mistake(`["${String.fromCodePoint(0x1f600)}" 1]`)).toBe('1:7 expected , or ] after an array item');
  });

  it('a carriage return is part of its line, as in the compiler', () => {
    expect(mistake('[\r\n  1\r\n  2\r\n]')).toBe('3:3 expected , or ] after an array item');
  });
});
