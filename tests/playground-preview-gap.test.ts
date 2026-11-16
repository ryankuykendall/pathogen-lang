// The workspace preview's move from the box its drawing was drawn in to the gap the panes
// leave (option 1, project-docs/preview-raster-perf/option-1-build-plan.md).
import { describe, expect, it } from 'vitest';

import {
  gapMove,
  HEAVY_REDRAW_MS,
  isHeavyDrawing,
  isHeavyRedraw,
  meetScale,
  rememberRedraw,
  sameGap,
  sameSize,
} from '../playground/utils/preview-gap';

describe('meetScale', () => {
  it('is the smaller of the two ratios (xMidYMid meet)', () => {
    expect(meetScale(600, 400, { width: 100, height: 100 })).toBe(4);
    expect(meetScale(300, 400, { width: 100, height: 100 })).toBe(3);
  });

  it('is 1 for an empty viewBox', () => {
    expect(meetScale(600, 400, { width: 0, height: 100 })).toBe(1);
  });
});

describe('gapMove', () => {
  // A wide drawing (the preview's fit margin around a 200 x 100 canvas), limited by width.
  const wide = { width: 228, height: 124 };

  it("moves the drawn box's center to the gap's and scales by the change in fit", () => {
    const drawn = { left: 845, width: 595 };
    const gap = { left: 845, width: 355 }; // the inspector opened: 240 px less on the right
    const move = gapMove(drawn, gap, 805, wide, false);
    expect(move.originX).toBe(845 + 595 / 2);
    expect(move.dx).toBe(845 + 355 / 2 - (845 + 595 / 2));
    expect(move.scale).toBeCloseTo(355 / 595, 12);
  });

  it("never enlarges a heavy drawing's picture, and does enlarge when asked", () => {
    const drawn = { left: 845, width: 355 };
    const gap = { left: 845, width: 595 }; // the inspector closed
    expect(gapMove(drawn, gap, 805, wide, false).scale).toBe(1);
    expect(gapMove(drawn, gap, 805, wide, true).scale).toBeCloseTo(595 / 355, 12);
    // The picture still moves to the gap's center.
    expect(gapMove(drawn, gap, 805, wide, false).dx).toBe(845 + 595 / 2 - (845 + 355 / 2));
  });

  it('keeps the scale when the height limits the fit both before and after', () => {
    const square = { width: 100, height: 100 };
    // 600 and 800 wide by 400 high: meet is 4 both times (height-limited).
    expect(gapMove({ left: 0, width: 600 }, { left: 100, width: 800 }, 400, square, true).scale).toBe(1);
    // Narrower than high: the width limits it (3 against 4).
    expect(gapMove({ left: 0, width: 600 }, { left: 0, width: 300 }, 400, square, false).scale).toBe(3 / 4);
  });

  it('is the identity for the same box', () => {
    const box = { left: 597, width: 843 };
    expect(gapMove(box, box, 805, wide, false)).toEqual({ originX: 597 + 843 / 2, dx: 0, scale: 1 });
  });
});

describe('sameGap', () => {
  it('matches to half a pixel', () => {
    expect(sameGap({ left: 10, width: 300 }, { left: 10.4, width: 299.6 })).toBe(true);
    expect(sameGap({ left: 10, width: 300 }, { left: 10.5, width: 300 })).toBe(false);
    expect(sameGap({ left: 10, width: 300 }, { left: 10, width: 301 })).toBe(false);
  });
});

describe('sameSize', () => {
  it('is false before anything was drawn, and compares both sides', () => {
    expect(sameSize(null, { width: 1440, height: 741 })).toBe(false);
    expect(sameSize({ width: 1440, height: 741 }, { width: 1440, height: 741 })).toBe(true);
    expect(sameSize({ width: 1440, height: 741 }, { width: 1439, height: 741 })).toBe(false);
    expect(sameSize({ width: 1440, height: 741 }, { width: 1440, height: 900 })).toBe(false);
  });
});

describe('rememberRedraw and isHeavyDrawing', () => {
  it('keeps the last three, and one slow redraw among them makes the drawing heavy', () => {
    let recent: number[] = [];
    for (const ms of [20, 300, 18, 25]) recent = rememberRedraw(recent, ms);
    expect(recent).toEqual([300, 18, 25]);
    expect(isHeavyDrawing(recent)).toBe(true);
    recent = rememberRedraw(recent, 30);
    expect(recent).toEqual([18, 25, 30]);
    expect(isHeavyDrawing(recent)).toBe(false);
    expect(isHeavyDrawing([])).toBe(false);
  });
});

describe('isHeavyRedraw', () => {
  it('is heavy only past the threshold', () => {
    expect(HEAVY_REDRAW_MS).toBe(100);
    expect(isHeavyRedraw(33)).toBe(false);
    expect(isHeavyRedraw(100)).toBe(false);
    expect(isHeavyRedraw(101)).toBe(true);
    expect(isHeavyRedraw(1700)).toBe(true);
  });
});
