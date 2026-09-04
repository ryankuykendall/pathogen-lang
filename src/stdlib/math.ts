// Math standard library functions

import { EASING_CURVES, EASING_ORDER } from './easing-curves';

const clamp01 = (t: number): number => Math.min(Math.max(t, 0), 1);

// The hash family must be bit-identical across JS engines (CLI, playground,
// VS Code preview), so it is built only from operations ECMAScript specifies
// exactly: Math.imul, bit ops, and IEEE +-*/. No transcendentals.
// mix32 is the lowbias32 finalizer (Chris Wellons).
const mix32 = (x: number): number => {
  x |= 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return x | 0;
};

// Seed lane gets its own mix so seed streams are independent hashes of the
// integer line, not shifted copies of each other.
const hashU32 = (n: number, seed: number): number =>
  mix32((mix32(n | 0) ^ Math.imul((seed | 0) ^ 0x9e3779b9, 0x85ebca6b)) | 0) >>> 0;

// Fold a 2D lattice point onto the integer line with a large odd multiplier
// before the shared 1D hash.
const hash2U32 = (ix: number, iy: number, seed: number): number =>
  hashU32((ix + Math.imul(iy | 0, 0x9e3779b1)) | 0, seed);

export const mathFunctions = {
  // Trigonometric (angles in radians)
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  atan2: Math.atan2,

  // Hyperbolic
  sinh: Math.sinh,
  cosh: Math.cosh,
  tanh: Math.tanh,

  // Exponential and logarithmic
  exp: Math.exp,
  ln: Math.log,
  log10: Math.log10,
  log2: Math.log2,
  pow: (base: number, exp: number) => base ** exp,
  sqrt: Math.sqrt,
  cbrt: Math.cbrt,

  // Rounding
  floor: Math.floor,
  ceil: Math.ceil,
  round: Math.round,
  trunc: Math.trunc,

  // Utility
  abs: Math.abs,
  sign: Math.sign,
  min: Math.min,
  max: Math.max,

  // Constants (as zero-arg functions)
  PI: () => Math.PI,
  E: () => Math.E,
  TAU: () => Math.PI * 2,

  // Pi multiplier (for use with expressions/variables)
  mpi: (x: number) => Math.PI * x,

  // Interpolation and clamping
  lerp: (a: number, b: number, t: number) => a + (b - a) * t,
  clamp: (value: number, min: number, max: number) => Math.min(Math.max(value, min), max),
  map: (value: number, inMin: number, inMax: number, outMin: number, outMax: number) =>
    outMin + ((value - inMin) / (inMax - inMin)) * (outMax - outMin),
  // GLSL argument order; the clamp absorbs the equal-edges division, so
  // edge0 === edge1 is a hard step (NaN only at x === edge0)
  smoothstep: (edge0: number, edge1: number, x: number) => {
    const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1);
    return t * t * (3 - 2 * t);
  },
  // Raised-cosine kernel: 1 at t === center, eased to 0 at |t - center| >=
  // spread. Math.cos is deterministic per engine, not bit-pinned cross-engine.
  bump: (t: number, center: number, spread: number) => {
    const d = Math.min(Math.max(Math.abs(t - center) / spread, 0), 1);
    return 0.5 * (1 + Math.cos(Math.PI * d));
  },
  // The quadratic trio: the callable forms of Easing.EaseIn/EaseOut/EaseInOut,
  // read from the shared curve table (src/stdlib/easing-curves.ts) that also
  // drives the gradient renderers; inputs clamp to [0, 1].
  easeIn: (t: number) => EASING_CURVES['ease-in'](clamp01(t)),
  easeOut: (t: number) => EASING_CURVES['ease-out'](clamp01(t)),
  easeInOut: (t: number) => EASING_CURVES['ease-in-out'](clamp01(t)),
  // ease(curve, t): any Easing member (or its string) applied to t. Input
  // clamps to [0, 1] with exact endpoints; output is NOT clamped, so back and
  // elastic overshoot on purpose. Per-engine deterministic (sin/pow/sqrt).
  ease: (curve: unknown, t: number) => {
    if (typeof curve !== 'string') {
      throw new Error(`ease: curve must be an Easing member or its string (got ${String(curve)})`);
    }
    const fn = EASING_CURVES[curve];
    if (!fn) throw new Error(`ease: unknown curve '${curve}'. Valid curves: ${EASING_ORDER.join(', ')}`);
    const u = clamp01(t);
    if (u === 0) return 0;
    if (u === 1) return 1;
    return fn(u);
  },
  // CSS cubic-bezier() timing curve: endpoints pinned at (0,0) and (1,1),
  // (x1,y1)/(x2,y2) are the two handles, t last. Solves x(u) = t (Newton,
  // then bisection — the WebKit UnitBezier structure) and returns y(u).
  // Only +,-,*,/ with a fixed solve, so results are bit-identical across
  // engines like the hash family. Input t clamps to [0, 1]; output is NOT
  // clamped, so y handles outside [0, 1] overshoot on purpose.
  cubicBezier: (x1: number, y1: number, x2: number, y2: number, t: number) => {
    if (!(Number.isFinite(x1) && Number.isFinite(y1) && Number.isFinite(x2) && Number.isFinite(y2))) {
      throw new Error('cubicBezier: all four handle values must be finite');
    }
    if (x1 < 0 || x1 > 1 || x2 < 0 || x2 > 1) {
      throw new Error(`cubicBezier: x1 and x2 must be within [0, 1] (got x1 = ${x1}, x2 = ${x2})`);
    }
    const x = Math.min(Math.max(t, 0), 1);
    if (x === 0) return 0;
    if (x === 1) return 1;
    // Power-basis coefficients: B(u) = ((a·u + b)·u + c)·u
    const cx = 3 * x1;
    const bx = 3 * (x2 - x1) - cx;
    const ax = 1 - cx - bx;
    const cy = 3 * y1;
    const by = 3 * (y2 - y1) - cy;
    const ay = 1 - cy - by;
    const sampleX = (u: number) => ((ax * u + bx) * u + cx) * u;
    const epsilon = 1e-12;
    let u = x;
    let solved = false;
    for (let i = 0; i < 8; i++) {
      const err = sampleX(u) - x;
      if (Math.abs(err) < epsilon) {
        solved = true;
        break;
      }
      const slope = (3 * ax * u + 2 * bx) * u + cx;
      if (Math.abs(slope) < 1e-6) break;
      u -= err / slope;
      // A step that leaves [0, 1] means Newton is diverging near a flat
      // stretch of x(u); hand the root over to bisection immediately.
      if (u < 0 || u > 1) break;
    }
    if (!solved) {
      // Bisection on [0, 1]; x is monotone there because x1, x2 are in range.
      // Runs until the bracket can no longer shrink (at most 64 halvings), so
      // the fallback is accurate to the last bit even where x(u) is flat.
      let lo = 0;
      let hi = 1;
      u = x;
      for (let i = 0; i < 64 && lo < hi; i++) {
        const err = sampleX(u) - x;
        if (err === 0) break;
        if (err < 0) lo = u;
        else hi = u;
        u = (hi - lo) * 0.5 + lo;
      }
    }
    return ((ay * u + by) * u + cy) * u;
  },

  // Angle conversions
  deg: (radians: number) => (radians * 180) / Math.PI,
  rad: (degrees: number) => (degrees * Math.PI) / 180,

  // Angle normalization — returns angle in [0, TAU) range
  normalizeAngle: (angle: number) => {
    const tau = Math.PI * 2;
    return ((angle % tau) + tau) % tau;
  },

  // Polar coordinate helpers — reduce cos/sin boilerplate in radial layouts
  polarX: (cx: number, angle: number, radius: number) => cx + Math.cos(angle) * radius,
  polarY: (cy: number, angle: number, radius: number) => cy + Math.sin(angle) * radius,

  // Random (note: not deterministic)
  random: () => Math.random(),
  randomRange: (min: number, max: number) => min + Math.random() * (max - min),

  // Hash (deterministic; n and seed truncate to 32-bit integers)
  hash01: (n: number, seed: number = 0) => hashU32(n, seed) / 4294967296,
  hash11: (n: number, seed: number = 0) => (hashU32(n, seed) / 4294967296) * 2 - 1,
  hashRange: (n: number, min: number, max: number, seed: number = 0) =>
    min + (hashU32(n, seed) / 4294967296) * (max - min),

  // Value noise (deterministic; hash01 at integer lattice points, smoothstep
  // fade between them — noise(k) === hash01(k) at integer k)
  noise: (x: number, seed: number = 0) => {
    const xf = Math.floor(x);
    const t = x - xf;
    const a = hashU32(xf, seed) / 4294967296;
    const b = hashU32(xf + 1, seed) / 4294967296;
    const u = t * t * (3 - 2 * t);
    return a + (b - a) * u;
  },
  noise2: (x: number, y: number, seed: number = 0) => {
    const xf = Math.floor(x);
    const yf = Math.floor(y);
    const tx = x - xf;
    const ty = y - yf;
    const ux = tx * tx * (3 - 2 * tx);
    const uy = ty * ty * (3 - 2 * ty);
    const a = hash2U32(xf, yf, seed) / 4294967296;
    const b = hash2U32(xf + 1, yf, seed) / 4294967296;
    const c = hash2U32(xf, yf + 1, seed) / 4294967296;
    const d = hash2U32(xf + 1, yf + 1, seed) / 4294967296;
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
  },
};
