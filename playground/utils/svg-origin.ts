// Normalize an SVG viewBox to a (0,0) origin.
//
// The thumbnail crop modal assumes the artwork's viewBox starts at the
// origin: its crop math, pan/zoom canvas, snapshot viewBox reset, and the
// hero render all use `0 0 w h`. `define ViewBox(-100, -100, 200, 200)` is
// legal Pathogen, so callers that feed the modal a compiled SVG must first
// shift the content so the origin lands on (0,0).
//
// Pure string math so it can be unit-tested in the node-only vitest env.

export interface OriginNormalization {
  width: number;
  height: number;
  /** `translate(-vx -vy)` when the origin is non-zero, else null. */
  translate: string | null;
}

export function computeOriginNormalization(viewBox: string): OriginNormalization {
  const parts = String(viewBox ?? '')
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  const [vx, vy, vw, vh] = parts;
  if (parts.length !== 4 || !parts.every((n) => Number.isFinite(n)) || vw <= 0 || vh <= 0) {
    return { width: 200, height: 200, translate: null };
  }
  const translate = vx === 0 && vy === 0 ? null : `translate(${-vx} ${-vy})`;
  return { width: vw, height: vh, translate };
}
