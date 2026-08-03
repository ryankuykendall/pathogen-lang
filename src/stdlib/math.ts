// Math standard library functions

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
  log: Math.log,
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
};
