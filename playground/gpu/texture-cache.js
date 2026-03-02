// LRU Texture Cache for rendered gradient data URLs

/**
 * LRU cache for rendered gradient textures (data URLs).
 * Prevents re-rendering unchanged gradients.
 */
export class TextureCache {
  /**
   * @param {number} maxSize - Maximum entries (default 32)
   */
  constructor(maxSize = 32) {
    this._maxSize = maxSize;
    /** @type {Map<string, string>} key → dataUrl (Map preserves insertion order) */
    this._cache = new Map();
  }

  /**
   * Get a cached data URL, promoting it to most-recently-used.
   * @param {string} key
   * @returns {string|undefined}
   */
  get(key) {
    if (!this._cache.has(key)) return undefined;
    const value = this._cache.get(key);
    // Promote to most-recently-used by re-inserting
    this._cache.delete(key);
    this._cache.set(key, value);
    return value;
  }

  /**
   * Store a data URL, evicting the least-recently-used entry if at capacity.
   * @param {string} key
   * @param {string} dataUrl
   */
  set(key, dataUrl) {
    // If key exists, delete first to update insertion order
    if (this._cache.has(key)) {
      this._cache.delete(key);
    } else if (this._cache.size >= this._maxSize) {
      // Evict LRU (first key in Map)
      const lruKey = this._cache.keys().next().value;
      this._cache.delete(lruKey);
    }
    this._cache.set(key, dataUrl);
  }

  /**
   * Remove a specific entry.
   * @param {string} key
   */
  invalidate(key) {
    this._cache.delete(key);
  }

  /** Remove all entries. */
  clear() {
    this._cache.clear();
  }

  /** @returns {number} Current number of cached entries. */
  get size() {
    return this._cache.size;
  }
}

/**
 * Create a cache key from gradient rendering parameters.
 * Excludes gradient ID so that structurally identical gradients share cached results.
 * @param {object} grad - GradientOutput object
 * @param {number} w - Width in pixels
 * @param {number} h - Height in pixels
 * @returns {string}
 */
export function hashGradient(grad, w, h) {
  const stops = (grad.stopsWithOklch || grad.stops || [])
    .map(s => `${s.offset}:${s.color}`)
    .join(',');
  return [
    'conic',
    w, h,
    grad.cx ?? 0,
    grad.cy ?? 0,
    grad.from ?? 0,
    grad.to ?? (2 * Math.PI),
    grad.innerRadius ?? 0,
    grad.innerFill ?? 'transparent',
    grad.spread ?? 'clamp',
    grad.direction ?? 'cw',
    stops,
  ].join('|');
}
