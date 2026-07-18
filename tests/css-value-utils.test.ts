import { describe, expect, it } from 'vitest';
import { matchFunctionNotation, splitTopLevel } from '../src/css-value-utils';

describe('splitTopLevel', () => {
  it('splits on top-level whitespace, keeping parenthesized groups intact', () => {
    expect(splitTopLevel('rgb(1 2 3) blue')).toEqual(['rgb(1 2 3)', 'blue']);
    expect(splitTopLevel('1px solid red')).toEqual(['1px', 'solid', 'red']);
  });

  it('collapses consecutive whitespace and trims ends', () => {
    expect(splitTopLevel('  a   b  ')).toEqual(['a', 'b']);
  });

  it('keeps nested parens grouped', () => {
    expect(splitTopLevel('drop-shadow(0 2px rgba(0,0,0,.5)) none')).toEqual([
      'drop-shadow(0 2px rgba(0,0,0,.5))',
      'none',
    ]);
  });

  it('returns a single token when there is no top-level whitespace', () => {
    expect(splitTopLevel('url(#a)')).toEqual(['url(#a)']);
    expect(splitTopLevel('')).toEqual([]);
  });
});

describe('matchFunctionNotation', () => {
  it('matches a simple function call', () => {
    expect(matchFunctionNotation('rgb(1, 2, 3)')).toEqual({ name: 'rgb', args: '1, 2, 3' });
  });

  it('captures nested parens correctly (the non-nesting-regex fix)', () => {
    expect(matchFunctionNotation('translate(calc(1 + 2))')).toEqual({ name: 'translate', args: 'calc(1 + 2)' });
    expect(matchFunctionNotation('oklch(from mix(a, b) l c h)')).toEqual({
      name: 'oklch',
      args: 'from mix(a, b) l c h',
    });
  });

  it('accepts hyphenated function names', () => {
    expect(matchFunctionNotation('drop-shadow(0 2px)')).toEqual({ name: 'drop-shadow', args: '0 2px' });
  });

  it('trims surrounding whitespace', () => {
    expect(matchFunctionNotation('  var(--x)  ')).toEqual({ name: 'var', args: '--x' });
  });

  it('is quote-aware: a ) inside a string is not the close', () => {
    expect(matchFunctionNotation('content("a)b")')).toEqual({ name: 'content', args: '"a)b"' });
  });

  it('rejects trailing content after the close', () => {
    expect(matchFunctionNotation('a() b()')).toBeNull();
    expect(matchFunctionNotation('rgb(1,2,3)x')).toBeNull();
  });

  it('rejects non-function strings', () => {
    expect(matchFunctionNotation('blue')).toBeNull();
    expect(matchFunctionNotation('#fff')).toBeNull();
    expect(matchFunctionNotation('rgb(1,2,3')).toBeNull(); // unterminated
    expect(matchFunctionNotation('')).toBeNull();
  });
});
