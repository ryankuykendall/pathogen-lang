import { describe, it, expect } from 'vitest';
import {
  clampZoom,
  clampPan,
  adjustPanForZoom,
  viewToViewBox,
  computeTransform,
  type PanZoomCanvas,
  type PanZoomView,
} from '../src/ui/pan-zoom-controller';

const CANVAS: PanZoomCanvas = { originX: 0, originY: 0, width: 200, height: 200 };
const CANVAS_OFFSET: PanZoomCanvas = { originX: 10, originY: 20, width: 400, height: 300 };

describe('clampZoom', () => {
  it('clamps to [minZoom, maxZoom]', () => {
    expect(clampZoom(0.1, { minZoom: 0.25, maxZoom: 10 })).toBe(0.25);
    expect(clampZoom(50, { minZoom: 0.25, maxZoom: 10 })).toBe(10);
    expect(clampZoom(2, { minZoom: 0.25, maxZoom: 10 })).toBe(2);
  });
  it('uses defaults when opts omitted', () => {
    expect(clampZoom(0.01, {})).toBe(0.25);
    expect(clampZoom(999, {})).toBe(10);
  });
});

describe('viewToViewBox', () => {
  it('produces origin + pan and width/height divided by zoom', () => {
    expect(viewToViewBox({ zoom: 1, panX: 0, panY: 0 }, CANVAS)).toBe('0 0 200 200');
    expect(viewToViewBox({ zoom: 2, panX: 0, panY: 0 }, CANVAS)).toBe('0 0 100 100');
    expect(viewToViewBox({ zoom: 1, panX: 50, panY: 25 }, CANVAS)).toBe('50 25 200 200');
  });
  it('accounts for a non-zero canvas origin', () => {
    expect(viewToViewBox({ zoom: 2, panX: 5, panY: 5 }, CANVAS_OFFSET)).toBe('15 25 200 150');
  });
});

describe('adjustPanForZoom', () => {
  it('keeps the view center fixed across a zoom change', () => {
    const view: PanZoomView = { zoom: 1, panX: 0, panY: 0 };
    // center is (100,100); at zoom 2 the view is 100x100 so pan should be (50,50)
    expect(adjustPanForZoom(view, 2, CANVAS)).toEqual({ panX: 50, panY: 50 });
  });
  it('is reversible (zoom in then out returns to start)', () => {
    const start: PanZoomView = { zoom: 1, panX: 30, panY: -10 };
    const inAt2 = adjustPanForZoom(start, 2, CANVAS);
    const backAt1 = adjustPanForZoom({ zoom: 2, ...inAt2 }, 1, CANVAS);
    expect(backAt1.panX).toBeCloseTo(start.panX, 9);
    expect(backAt1.panY).toBeCloseTo(start.panY, 9);
  });
});

describe('clampPan', () => {
  it('recenters when zoomed below the disable threshold', () => {
    // zoom 0.25 → view 800x800, recentre to -(800-200)/2 = -300
    const out = clampPan({ zoom: 0.25, panX: 999, panY: -999 }, CANVAS);
    expect(out).toEqual({ panX: -300, panY: -300 });
  });
  it('bounds pan with a margin when zoomed in', () => {
    // zoom 2 → view 100x100, margin = 100/3. width-viewWidth = 100.
    // maxPanX = max(0,100) + 100/3 = 133.33; minPanX = min(0,100) - 100/3 = -33.33
    const high = clampPan({ zoom: 2, panX: 1000, panY: 1000 }, CANVAS);
    expect(high.panX).toBeCloseTo(100 + 100 / 3, 6);
    const low = clampPan({ zoom: 2, panX: -1000, panY: -1000 }, CANVAS);
    expect(low.panX).toBeCloseTo(-100 / 3, 6);
  });
  it('leaves an in-bounds pan untouched', () => {
    const out = clampPan({ zoom: 2, panX: 40, panY: 40 }, CANVAS);
    expect(out).toEqual({ panX: 40, panY: 40 });
  });
});

describe('computeTransform', () => {
  // Square box matching the canvas aspect → no letterbox (offset 0).
  const BOX = { w: 400, h: 400 };

  it('is identity when the view equals the baked view', () => {
    const v: PanZoomView = { zoom: 1.5, panX: 12, panY: -8 };
    const t = computeTransform(v, v, CANVAS, BOX.w, BOX.h);
    expect(t.scale).toBeCloseTo(1, 9);
    expect(t.tx).toBeCloseTo(0, 9);
    expect(t.ty).toBeCloseTo(0, 9);
  });

  it('scale equals the zoom ratio', () => {
    const baked: PanZoomView = { zoom: 1, panX: 0, panY: 0 };
    const view: PanZoomView = { zoom: 2, panX: 0, panY: 0 };
    const t = computeTransform(view, baked, CANVAS, BOX.w, BOX.h);
    expect(t.scale).toBeCloseTo(2, 9);
  });

  it('a pure pan maps unit delta to pixels at the current zoom (no letterbox)', () => {
    // baseScale = 400/200 = 2 px/unit at zoom 1. Pan by +10 units at zoom 1.
    const baked: PanZoomView = { zoom: 1, panX: 0, panY: 0 };
    const view: PanZoomView = { zoom: 1, panX: 10, panY: 0 };
    const t = computeTransform(view, baked, CANVAS, BOX.w, BOX.h);
    expect(t.scale).toBeCloseTo(1, 9);
    expect(t.tx).toBeCloseTo(-20, 6); // -(panX-panX0)*baseScale*zoom = -(10)*2*1
    expect(t.ty).toBeCloseTo(0, 9);
  });

  it('the transform reproduces the new viewBox mapping (letterboxed box)', () => {
    // Non-square box → letterbox. Verify that applying the transform to the
    // baked unit→px mapping yields the target view's unit→px mapping, by
    // checking two canvas points map identically both ways.
    const boxW = 600;
    const boxH = 400; // box aspect 1.5 vs canvas aspect 1 → letterboxed
    const baked: PanZoomView = { zoom: 1, panX: 0, panY: 0 };
    const view: PanZoomView = { zoom: 1.8, panX: 35, panY: -12 };

    const baseScale = Math.min(boxW / CANVAS.width, boxH / CANVAS.height);
    const offsetX = (boxW - baseScale * CANVAS.width) / 2;
    const offsetY = (boxH - baseScale * CANVAS.height) / 2;

    // unit → px under a given view (meet, constant aspect).
    const pxX = (u: number, v: PanZoomView) =>
      offsetX + baseScale * v.zoom * (u - (CANVAS.originX + v.panX));
    const pyY = (u: number, v: PanZoomView) =>
      offsetY + baseScale * v.zoom * (u - (CANVAS.originY + v.panY));

    const t = computeTransform(view, baked, CANVAS, boxW, boxH);
    // Apply CSS transform (origin 0,0): p' = scale*p + translate.
    for (const u of [0, 50, 137.5, 200]) {
      const transformed = t.scale * pxX(u, baked) + t.tx;
      expect(transformed).toBeCloseTo(pxX(u, view), 6);
      const transformedY = t.scale * pyY(u, baked) + t.ty;
      expect(transformedY).toBeCloseTo(pyY(u, view), 6);
    }
  });
});
