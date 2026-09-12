import { describe, expect, it } from 'vitest';

import { renderConic, renderConicToWedges, sampleConicRamp } from '../src/conic-renderer';

const stops = [
  { offset: 0, color: '#ff0000' },
  { offset: 1, color: '#0000ff' },
];
const base = {
  cx: 100,
  cy: 100,
  from: 0,
  to: Math.PI / 2,
  direction: 'cw' as const,
  spread: 'transparent' as const,
  stops,
  viewWidth: 200,
  viewHeight: 200,
};

/** Count the `A` commands in a path — a plain sector has one, an annular sector two. */
const arcs = (d: string): number => (d.match(/ A /g) ?? []).length;

describe('renderConic — wedge coverage', () => {
  it("emits one wedge per degree over the sweep and nothing else for 'transparent'", () => {
    const { wedges } = renderConic(base);
    expect(wedges).toHaveLength(90);
    // Every wedge is a plain sector from the center.
    for (const w of wedges) {
      expect(w.d.startsWith('M 100 100 L ')).toBe(true);
      expect(arcs(w.d)).toBe(1);
    }
  });

  it("covers the whole circle for 'clamp' and paints the gap with the last stop", () => {
    const { wedges } = renderConic({ ...base, spread: 'clamp' });
    expect(wedges).toHaveLength(360);
    const gap = wedges.slice(90);
    expect(gap.every((w) => w.fill === '#0000ff')).toBe(true);
  });

  it("covers the whole circle for 'repeat' and tiles the ramp", () => {
    const { wedges } = renderConic({ ...base, spread: 'repeat' });
    expect(wedges).toHaveLength(360);
    // The second quarter restarts the ramp: its first wedge is near the first stop.
    expect(wedges[90].fill).toBe(wedges[0].fill);
    expect(wedges[179].fill).toBe(wedges[89].fill);
  });

  it('a full-turn sweep has no gap and 360 wedges regardless of spread', () => {
    for (const spread of ['clamp', 'repeat', 'transparent'] as const) {
      expect(renderConic({ ...base, to: 2 * Math.PI, spread }).wedges).toHaveLength(360);
    }
  });

  it("'ccw' paints the mirror image of the sweep with the ramp reversed on screen", () => {
    const cw = renderConic(base).wedges;
    const ccw = renderConic({ ...base, direction: 'ccw' }).wedges;
    expect(ccw).toHaveLength(90);
    // cw covers screen angles [0, π/2] (points with y ≥ cy); ccw covers [−π/2, 0] (y ≤ cy).
    const yOf = (d: string): number => Number(d.split(' ')[5]);
    expect(cw.every((w) => yOf(w.d) >= 100)).toBe(true);
    expect(ccw.every((w) => yOf(w.d) <= 100)).toBe(true);
    // At the shared boundary (angle 0) both start on the first stop.
    expect(cw[0].fill).toBe(ccw[ccw.length - 1].fill);
  });

  it('returns nothing for an empty stop list or a zero sweep', () => {
    expect(renderConic({ ...base, stops: [] }).wedges).toEqual([]);
    expect(renderConic({ ...base, to: 0 }).wedges).toEqual([]);
  });
});

describe('renderConic — inner radius', () => {
  it("cuts annular sectors for the hard 'transparent' hole", () => {
    const { wedges, innerOverlay, innerMask } = renderConic({ ...base, innerRadius: 30 });
    expect(wedges).toHaveLength(90);
    for (const w of wedges) {
      expect(arcs(w.d)).toBe(2);
      expect(w.d.startsWith('M 100 100')).toBe(false);
      expect(w.d).toContain(' A 30 30 0 ');
    }
    expect(innerOverlay).toBeUndefined();
    expect(innerMask).toBeUndefined();
  });

  it("'center' keeps full sectors and adds a first-stop overlay following 1 − smoothstep", () => {
    const { wedges, innerOverlay } = renderConic({ ...base, innerRadius: 30, innerFill: 'center' });
    expect(wedges.every((w) => arcs(w.d) === 1)).toBe(true);
    expect(innerOverlay).toEqual({
      radius: 30,
      color: '#ff0000',
      stops: [
        { offset: 0, opacity: 1 },
        { offset: 0.25, opacity: 0.84375 },
        { offset: 0.5, opacity: 0.5 },
        { offset: 0.75, opacity: 0.15625 },
        { offset: 1, opacity: 0 },
      ],
    });
  });

  it('a custom color becomes the overlay color', () => {
    const { innerOverlay } = renderConic({ ...base, innerRadius: 30, innerFill: '#1a1a2e' });
    expect(innerOverlay?.color).toBe('#1a1a2e');
  });

  it("'transparent-blend' emits a luminance mask rising from black to white", () => {
    const { innerMask, innerOverlay } = renderConic({ ...base, innerRadius: 30, innerFill: 'transparent-blend' });
    expect(innerOverlay).toBeUndefined();
    expect(innerMask?.radius).toBe(30);
    expect(innerMask?.stops.map((s) => Number(s.luminance.toFixed(5)))).toEqual([0, 0.15625, 0.5, 0.84375, 1]);
  });
});

describe('sampleConicRamp', () => {
  it('mixes linearly in gamma-encoded sRGB like the shader (and CSS gradients), not by nearest stop', () => {
    // The shader uploads canvas bytes / 255 and mixes them as-is, so the
    // midpoint of red→blue is (128, 0, 128) — not the linear-light #bc00bc.
    expect(sampleConicRamp(stops, 0.5)).toBe('#800080');
    expect(sampleConicRamp(stops, 0)).toBe('#ff0000');
    expect(sampleConicRamp(stops, 1)).toBe('#0000ff');
    expect(sampleConicRamp(stops, -1)).toBe('#ff0000');
    expect(sampleConicRamp(stops, 2)).toBe('#0000ff');
  });

  it('keeps alpha straight and emits rgba() when translucent', () => {
    const translucent = [
      { offset: 0, color: 'rgba(255, 0, 0, 1)' },
      { offset: 1, color: 'rgba(255, 0, 0, 0)' },
    ];
    expect(sampleConicRamp(translucent, 0.5)).toBe('rgba(255, 0, 0, 0.5)');
  });

  it('falls back to the nearer stop when a color cannot be parsed', () => {
    const odd = [
      { offset: 0, color: 'url(#nope)' },
      { offset: 1, color: '#0000ff' },
    ];
    expect(sampleConicRamp(odd, 0.25)).toBe('url(#nope)');
    expect(sampleConicRamp(odd, 0.75)).toBe('#0000ff');
  });
});

describe('renderConicToWedges', () => {
  it('is the wedge list of renderConic', () => {
    expect(renderConicToWedges(base)).toEqual(renderConic(base).wedges);
  });
});
