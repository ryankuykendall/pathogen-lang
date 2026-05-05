// Tests for playground/utils/color.ts — the playground-side parser used by
// the CodeMirror color chip. Separate from src/color.ts (the evaluator-side
// parser). They must stay in sync on which CSS color forms they recognize:
// when these diverge, the chip's color picker opens in the wrong format
// (e.g. shows "hex" / sRGB even when the source is `oklch(...)`).

import { describe, expect, it } from 'vitest';
import { parseColor, detectFormat, formatColor } from '../playground/utils/color';

describe('playground parseColor — modern CSS forms', () => {
  it('detects format=oklch for oklch with percentages', () => {
    const p = parseColor('oklch(79% 32% 178)');
    expect(p.format).toBe('oklch');
  });

  it('detects format=oklab for oklab with percentages', () => {
    const p = parseColor('oklab(73% 50% -25%)');
    expect(p.format).toBe('oklab');
  });

  it('detects format=oklab for oklab with negative numeric a/b', () => {
    const p = parseColor('oklab(73% .19 -.09)');
    expect(p.format).toBe('oklab');
  });

  it('detects format=hsl for modern space-separated hsl', () => {
    const p = parseColor('hsl(120 100% 40%)');
    expect(p.format).toBe('hsl');
  });

  it('still detects format=hsl for legacy comma-separated hsl', () => {
    const p = parseColor('hsl(120, 100%, 40%)');
    expect(p.format).toBe('hsl');
  });

  it('detects format=rgb for modern space-separated rgb', () => {
    const p = parseColor('rgb(255 128 0)');
    expect(p.format).toBe('rgb');
  });

  it('detects format=rgb for percent components', () => {
    const p = parseColor('rgb(100% 50% 0%)');
    expect(p.format).toBe('rgb');
  });

  it('detects format=hex for short hex', () => {
    const p = parseColor('#0c0');
    expect(p.format).toBe('hex');
  });
});

describe('playground formatColor — modern CSS L4 forms', () => {
  it('emits modern space-separated rgb', () => {
    const out = formatColor({ r: 255, g: 128, b: 0, a: 1, format: 'rgb' }, 'rgb');
    expect(out).toBe('rgb(255 128 0)');
  });

  it('emits modern space-separated hsl', () => {
    const out = formatColor({ r: 0, g: 204, b: 0, a: 1, format: 'hsl' }, 'hsl');
    // 120deg pure green at 40% lightness
    expect(out).toMatch(/^hsl\(120 100% 40%\)$/);
  });

  it('emits hsl with / alpha when alpha < 1', () => {
    const out = formatColor({ r: 0, g: 204, b: 0, a: 0.5, format: 'hsla' }, 'hsl');
    expect(out).toMatch(/^hsl\(120 100% 40% \/ 0\.5\)$/);
  });

  it('emits rgb with / alpha when alpha < 1', () => {
    const out = formatColor({ r: 255, g: 128, b: 0, a: 0.5, format: 'rgba' }, 'rgb');
    expect(out).toMatch(/^rgb\(255 128 0 \/ 0\.5\)$/);
  });
});

describe('playground detectFormat', () => {
  it('matches the prefix-based heuristic for all CSS forms', () => {
    expect(detectFormat('#0c0')).toBe('hex');
    expect(detectFormat('rgb(255 128 0)')).toBe('rgb');
    expect(detectFormat('rgba(255, 128, 0, 0.5)')).toBe('rgba');
    expect(detectFormat('hsl(120 100% 40%)')).toBe('hsl');
    expect(detectFormat('hsla(120, 100%, 40%, 0.5)')).toBe('hsla');
    expect(detectFormat('oklch(79% 32% 178)')).toBe('oklch');
    expect(detectFormat('oklab(73% .19 -.09)')).toBe('oklab');
    expect(detectFormat('aliceblue')).toBe('named');
  });
});
