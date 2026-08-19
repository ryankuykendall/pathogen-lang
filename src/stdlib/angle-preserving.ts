// Angle-preserving stdlib contract — the single source of truth consumed by
// both evaluators' stdlib dispatch (like callback-methods.ts). A function
// listed here passes angle-ness through: when any of its value-carrying
// argument slots receives an AngleValue, the numeric result is re-wrapped as
// an AngleValue (unit taken from the first such argument). Functions NOT
// listed keep the plain-number contract: angle-consuming (sin, deg, floor…)
// and angle-producing (atan2, rad, mpi — documented as plain radians) results
// stay bare numbers.
//
// INVARIANT: every key must name an export of mathFunctions (locked by the
// coverage-matrix test in tests/evaluator.test.ts). When adding a stdlib
// function that picks or blends among its inputs, categorize it here.

/** Which argument indices carry the value space ('all' for variadics). */
export const ANGLE_PRESERVING_ARGS: Readonly<Record<string, 'all' | readonly number[]>> = {
  abs: [0],
  min: 'all',
  max: 'all',
  lerp: [0, 1], // endpoints; t is a plain ratio
  clamp: [0, 1, 2],
  map: [3, 4], // the OUTPUT range decides the result space
  normalizeAngle: [0],
  randomRange: [0, 1],
  hashRange: [1, 2], // n and seed are indices, not values
};
