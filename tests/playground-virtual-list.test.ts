// Pure-math tests for the inspector's windowed-rendering utility
// (playground/utils/virtual-list.ts): prefix-sum offsets and window
// computation. DOM behavior is covered in
// playground-inspector-virtualization.test.ts.

import { describe, expect, it } from 'vitest';

import { buildOffsets, computeWindow, DEFAULT_VIEWPORT_PX } from '../playground/utils/virtual-list.js';

function rows(heights: number[]): { h: number }[] {
  return heights.map((h) => ({ h }));
}

describe('buildOffsets', () => {
  it('builds prefix sums with offsets[0] = 0 and offsets[n] = total', () => {
    const offsets = buildOffsets(rows([28, 28, 26, 24]));
    expect(Array.from(offsets)).toEqual([0, 28, 56, 82, 106]);
  });

  it('handles an empty list', () => {
    const offsets = buildOffsets(rows([]));
    expect(Array.from(offsets)).toEqual([0]);
  });
});

describe('computeWindow', () => {
  const uniform = buildOffsets(rows(new Array<number>(1000).fill(28)));

  it('windows the top of the list at scrollTop 0', () => {
    const win = computeWindow(uniform, 0, 0, 600, 400);
    expect(win.start).toBe(0);
    // Rows covering [-400, 1000): exclusive end is the first row whose top >= 1000.
    expect(win.end).toBe(Math.ceil(1000 / 28));
    expect(win.topPx).toBe(0);
    expect(win.totalPx).toBe(28000);
  });

  it('windows a mid-list scroll position with overscan on both sides', () => {
    const win = computeWindow(uniform, 5000, 0, 600, 400);
    // Visible+overscan range is [4600, 6000): row 164 spans [4592, 4620).
    expect(win.start).toBe(164);
    expect(win.end).toBe(Math.ceil(6000 / 28));
    expect(win.topPx).toBe(164 * 28);
  });

  it('subtracts the list offset within the scroller (listTop)', () => {
    const withOffset = computeWindow(uniform, 5000, 3000, 600, 400);
    const without = computeWindow(uniform, 2000, 0, 600, 400);
    expect(withOffset.start).toBe(without.start);
    expect(withOffset.end).toBe(without.end);
  });

  it('clamps at the end of the list', () => {
    const win = computeWindow(uniform, 28000, 0, 600, 400);
    expect(win.end).toBe(1000);
    // Overscan range starts at 27600; row 985 spans [27580, 27608).
    expect(win.start).toBe(985);
  });

  it('returns an empty window past the end without going out of bounds', () => {
    const win = computeWindow(uniform, 100000, 0, 600, 400);
    expect(win.start).toBe(1000);
    expect(win.end).toBe(1000);
  });

  it('handles mixed row heights (palette header/color rows)', () => {
    // 10 groups of [24, 26, 26] = 76px per group.
    const heights: number[] = [];
    for (let g = 0; g < 10; g++) heights.push(24, 26, 26);
    const offsets = buildOffsets(rows(heights));
    expect(offsets[offsets.length - 1]).toBe(760);
    // Window [152, 252): group 2 starts at exactly 152 → rows 6..9 visible
    // (row 9 spans [228, 254)); with 0 overscan start is the row covering 152.
    const win = computeWindow(offsets, 152, 0, 100, 0);
    expect(win.start).toBe(6);
    expect(win.topPx).toBe(152);
    expect(win.end).toBe(10);
  });

  it('a row whose top sits exactly at the window bottom is excluded', () => {
    const win = computeWindow(uniform, 0, 0, 28, 0);
    expect(win.start).toBe(0);
    expect(win.end).toBe(1);
  });

  it('handles an empty row list', () => {
    const win = computeWindow(buildOffsets([]), 0, 0, 600, 400);
    expect(win).toEqual({ start: 0, end: 0, topPx: 0, totalPx: 0 });
  });

  it('exports a nonzero fallback viewport for zero-layout environments', () => {
    expect(DEFAULT_VIEWPORT_PX).toBeGreaterThan(0);
  });
});
