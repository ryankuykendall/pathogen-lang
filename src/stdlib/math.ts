// Math standard library functions

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

  // Angle conversions
  deg: (radians: number) => (radians * 180) / Math.PI,
  rad: (degrees: number) => (degrees * Math.PI) / 180,

  // Random (note: not deterministic)
  random: () => Math.random(),
  randomRange: (min: number, max: number) => min + Math.random() * (max - min),
};
