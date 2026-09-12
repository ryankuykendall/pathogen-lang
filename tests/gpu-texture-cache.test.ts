import { describe, expect, it } from 'vitest';

import { TextureCache, hashGradient } from '../playground/gpu/texture-cache';

const conic = {
  type: 'conic' as const,
  cx: -1200,
  cy: 14400,
  from: -0.45 * Math.PI,
  to: 0.05 * Math.PI,
  innerRadius: 1000,
  spread: 'transparent',
  stops: [
    { offset: 0, color: '#ff0000' },
    { offset: 1, color: '#0000ff' },
  ],
};

describe('hashGradient', () => {
  it('keys on the post-clamp size and the renderer, right after the type', () => {
    const key = hashGradient(conic, 8192, 3174, 'gpu');
    expect(key.startsWith('conic|gpu|8192|3174|')).toBe(true);
  });

  it('separates a GPU raster from a Canvas 2D raster of the same gradient', () => {
    expect(hashGradient(conic, 8192, 3174, 'gpu')).not.toBe(hashGradient(conic, 8192, 3174, '2d'));
  });

  it('separates sizes (the pre-clamp size no longer collides with the clamped one)', () => {
    expect(hashGradient(conic, 96000, 37200, 'gpu')).not.toBe(hashGradient(conic, 8192, 3174, 'gpu'));
  });

  it('defaults the path to gpu and carries it for every family', () => {
    expect(hashGradient(conic, 10, 10)).toBe(hashGradient(conic, 10, 10, 'gpu'));
    for (const type of ['mesh', 'freeform', 'topo'] as const) {
      const key = hashGradient({ type }, 64, 64, '2d');
      expect(key.startsWith(`${type}|2d|64|64|`)).toBe(true);
    }
  });
});

describe('TextureCache', () => {
  it('evicts the least recently used entry at capacity', () => {
    const cache = new TextureCache(2);
    cache.set('a', 'A');
    cache.set('b', 'B');
    expect(cache.get('a')).toBe('A'); // touch a → b is now the oldest
    cache.set('c', 'C');
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('a')).toBe('A');
    expect(cache.get('c')).toBe('C');
  });
});
