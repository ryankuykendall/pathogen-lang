import { describe, expect, it } from 'vitest';

import { formatBytes } from '../playground/utils/format-bytes.ts';

describe('formatBytes', () => {
  it('formats byte counts below 1000 as B', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1)).toBe('1 B');
    expect(formatBytes(842)).toBe('842 B');
    expect(formatBytes(999)).toBe('999 B');
  });

  it('formats KB with one decimal below 10, integers above', () => {
    expect(formatBytes(1000)).toBe('1 KB');
    expect(formatBytes(1200)).toBe('1.2 KB');
    expect(formatBytes(9600)).toBe('9.6 KB');
    expect(formatBytes(10_000)).toBe('10 KB');
    expect(formatBytes(128_000)).toBe('128 KB');
    expect(formatBytes(128_499)).toBe('128 KB');
  });

  it('trims the trailing .0', () => {
    expect(formatBytes(2000)).toBe('2 KB');
    expect(formatBytes(3_000_000)).toBe('3 MB');
  });

  it('promotes to MB at the KB rounding boundary instead of showing 1000 KB', () => {
    expect(formatBytes(999_500)).toBe('1 MB');
    expect(formatBytes(999_499)).toBe('999 KB');
  });

  it('formats MB', () => {
    expect(formatBytes(1_200_000)).toBe('1.2 MB');
    expect(formatBytes(25_000_000)).toBe('25 MB');
  });

  it('returns empty string for invalid input', () => {
    expect(formatBytes(-1)).toBe('');
    expect(formatBytes(NaN)).toBe('');
    expect(formatBytes(Infinity)).toBe('');
  });
});
