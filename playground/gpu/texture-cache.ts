// LRU Texture Cache for rendered gradient data URLs

/** Gradient-like object accepted by hashGradient (subset of GradientOutput). */
interface HashableGradient {
  type: string;
  cx?: number;
  cy?: number;
  from?: number;
  to?: number;
  innerRadius?: number;
  innerFill?: string;
  spread?: string;
  direction?: string;
  interpolation?: string;
  stops?: { offset: number; color: string }[];
  stopsWithOklch?: { offset: number; color: string }[];
  meshGrid?: { x: number; y: number; color: string }[][];
  meshWidth?: number;
  meshHeight?: number;
  freeformPoints?: { x: number; y: number; color: string }[];
  freeformWidth?: number;
  freeformHeight?: number;
  falloff?: number;
  topoContours?: { elevation: number; path: string; color: string }[];
  topoWidth?: number;
  topoHeight?: number;
  topoEasing?: string;
  topoMethod?: string;
  topoIterations?: number;
  topoBlend?: number;
  topoBaseColor?: string;
}

/**
 * LRU cache for rendered gradient textures (data URLs).
 * Prevents re-rendering unchanged gradients.
 */
export class TextureCache {
  private _maxSize: number;
  /** key -> dataUrl (Map preserves insertion order) */
  private _cache: Map<string, string>;

  constructor(maxSize: number = 32) {
    this._maxSize = maxSize;
    this._cache = new Map();
  }

  /**
   * Get a cached data URL, promoting it to most-recently-used.
   */
  get(key: string): string | undefined {
    if (!this._cache.has(key)) return undefined;
    const value = this._cache.get(key)!;
    // Promote to most-recently-used by re-inserting
    this._cache.delete(key);
    this._cache.set(key, value);
    return value;
  }

  /**
   * Store a data URL, evicting the least-recently-used entry if at capacity.
   */
  set(key: string, dataUrl: string): void {
    // If key exists, delete first to update insertion order
    if (this._cache.has(key)) {
      this._cache.delete(key);
    } else if (this._cache.size >= this._maxSize) {
      // Evict LRU (first key in Map)
      const lruKey = this._cache.keys().next().value as string;
      this._cache.delete(lruKey);
    }
    this._cache.set(key, dataUrl);
  }

  /**
   * Remove a specific entry.
   */
  invalidate(key: string): void {
    this._cache.delete(key);
  }

  /** Remove all entries. */
  clear(): void {
    this._cache.clear();
  }

  /** Current number of cached entries. */
  get size(): number {
    return this._cache.size;
  }
}

/**
 * Create a cache key from gradient rendering parameters.
 * Excludes gradient ID so that structurally identical gradients share cached results.
 */
export function hashGradient(grad: HashableGradient, w: number, h: number): string {
  if (grad.type === 'mesh') {
    const grid = (grad.meshGrid || []).map((row) => row.map((p) => `${p.x},${p.y}:${p.color}`).join(';')).join('/');
    return ['mesh', w, h, grad.meshWidth ?? 0, grad.meshHeight ?? 0, grad.interpolation ?? 'srgb', grid].join('|');
  }

  if (grad.type === 'freeform') {
    const pts = (grad.freeformPoints || []).map((p) => `${p.x},${p.y}:${p.color}`).join(';');
    return [
      'freeform',
      w,
      h,
      grad.freeformWidth ?? 0,
      grad.freeformHeight ?? 0,
      grad.falloff ?? 2.0,
      grad.interpolation ?? 'srgb',
      pts,
    ].join('|');
  }

  if (grad.type === 'topo') {
    const contours = (grad.topoContours || []).map((c) => `${c.elevation}:${c.path}:${c.color}`).join(',');
    const stops = (grad.stopsWithOklch || []).map((s) => `${s.offset}:${s.color}`).join(',');
    return [
      'topo',
      w,
      h,
      grad.topoWidth ?? 0,
      grad.topoHeight ?? 0,
      grad.topoEasing ?? 'linear',
      grad.topoMethod ?? 'distance',
      grad.topoIterations ?? 200,
      grad.topoBlend ?? 1.0,
      grad.topoBaseColor ?? '',
      contours,
      stops,
    ].join('|');
  }

  const stops = (grad.stopsWithOklch || grad.stops || []).map((s) => `${s.offset}:${s.color}`).join(',');
  return [
    'conic',
    w,
    h,
    grad.cx ?? 0,
    grad.cy ?? 0,
    grad.from ?? 0,
    grad.to ?? 2 * Math.PI,
    grad.innerRadius ?? 0,
    grad.innerFill ?? 'transparent',
    grad.spread ?? 'clamp',
    grad.direction ?? 'cw',
    stops,
  ].join('|');
}
