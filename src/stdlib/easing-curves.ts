// Named easing curves — the single source of truth behind the `Easing` enum
// (src/evaluator/builtin-enums.ts derives its members from EASING_ORDER), the
// `ease(curve, t)` stdlib function, and the playground's topological-gradient
// renderers: the Canvas fallback reads EASING_CURVES and both WGSL shaders
// splice in buildEasingWgsl() at pipeline creation.
//
// The index of a spec in EASING_SPECS is the u32 mode the shaders receive.
// The first five are the legacy wire values and must never move; append new
// curves at the end. Every JS body has a WGSL twin beside it so a reviewer can
// see both formulas at once (WGSL cannot consume JS, so this adjacency is the
// parity guarantee; tests/easing-curves.test.ts pins the rest).
//
// Formulas are the standard Penner / easings.net set. Bodies take u already
// clamped to [0, 1] and may return outside [0, 1] (back, elastic) — the
// stdlib `ease` passes that through; gradients clamp the result to the ramp.

export interface EasingCurveSpec {
  /** Enum string value: `Easing.SineInOut` → 'sine-in-out'. */
  readonly name: string;
  /** JS curve over u in [0, 1]. */
  readonly js: (u: number) => number;
  /** WGSL statements computing the same curve from `u: f32`; must `return`. */
  readonly wgsl: string;
}

const BACK_C1 = 1.70158;
const BACK_C2 = BACK_C1 * 1.525;
const BACK_C3 = BACK_C1 + 1;
const ELASTIC_C4 = (2 * Math.PI) / 3;
const ELASTIC_C5 = (2 * Math.PI) / 4.5;

/** A JS number as a WGSL f32 literal: always carries a decimal point. */
function wgslFloat(n: number): string {
  const text = String(n);
  return /[.e]/.test(text) ? text : `${text}.0`;
}
const WGSL_BACK_C1 = wgslFloat(BACK_C1);
const WGSL_BACK_C2 = wgslFloat(BACK_C2);
const WGSL_BACK_C3 = wgslFloat(BACK_C3);
const WGSL_ELASTIC_C4 = wgslFloat(ELASTIC_C4);
const WGSL_ELASTIC_C5 = wgslFloat(ELASTIC_C5);

function bounceOut(x: number): number {
  const n1 = 7.5625;
  const d1 = 2.75;
  if (x < 1 / d1) return n1 * x * x;
  if (x < 2 / d1) {
    const y = x - 1.5 / d1;
    return n1 * y * y + 0.75;
  }
  if (x < 2.5 / d1) {
    const y = x - 2.25 / d1;
    return n1 * y * y + 0.9375;
  }
  const y = x - 2.625 / d1;
  return n1 * y * y + 0.984375;
}

// WGSL twin of bounceOut, emitted once ahead of the switch by buildEasingWgsl.
const BOUNCE_OUT_WGSL = `fn bounceOut(x: f32) -> f32 {
  let n1 = 7.5625;
  let d1 = 2.75;
  if (x < 1.0 / d1) {
    return n1 * x * x;
  }
  if (x < 2.0 / d1) {
    let y = x - 1.5 / d1;
    return n1 * y * y + 0.75;
  }
  if (x < 2.5 / d1) {
    let y = x - 2.25 / d1;
    return n1 * y * y + 0.9375;
  }
  let y = x - 2.625 / d1;
  return n1 * y * y + 0.984375;
}`;

export const EASING_SPECS: readonly EasingCurveSpec[] = [
  // --- legacy wire values 0..4: pinned, never reorder ---
  { name: 'linear', js: (u) => u, wgsl: 'return u;' },
  { name: 'smoothstep', js: (u) => u * u * (3 - 2 * u), wgsl: 'return u * u * (3.0 - 2.0 * u);' },
  { name: 'ease-in', js: (u) => u * u, wgsl: 'return u * u;' },
  { name: 'ease-out', js: (u) => 1 - (1 - u) * (1 - u), wgsl: 'return 1.0 - (1.0 - u) * (1.0 - u);' },
  {
    name: 'ease-in-out',
    js: (u) => (u < 0.5 ? 2 * u * u : 1 - 2 * (1 - u) * (1 - u)),
    wgsl: 'if (u < 0.5) { return 2.0 * u * u; }\n      return 1.0 - 2.0 * (1.0 - u) * (1.0 - u);',
  },
  // --- sine ---
  { name: 'sine-in', js: (u) => 1 - Math.cos((u * Math.PI) / 2), wgsl: 'return 1.0 - cos(u * 1.5707963267948966);' },
  { name: 'sine-out', js: (u) => Math.sin((u * Math.PI) / 2), wgsl: 'return sin(u * 1.5707963267948966);' },
  {
    name: 'sine-in-out',
    js: (u) => -(Math.cos(Math.PI * u) - 1) / 2,
    wgsl: 'return -(cos(3.141592653589793 * u) - 1.0) / 2.0;',
  },
  // --- cubic ---
  { name: 'cubic-in', js: (u) => u * u * u, wgsl: 'return u * u * u;' },
  {
    name: 'cubic-out',
    js: (u) => 1 - (1 - u) * (1 - u) * (1 - u),
    wgsl: 'return 1.0 - (1.0 - u) * (1.0 - u) * (1.0 - u);',
  },
  {
    name: 'cubic-in-out',
    js: (u) => (u < 0.5 ? 4 * u * u * u : 1 - ((-2 * u + 2) * (-2 * u + 2) * (-2 * u + 2)) / 2),
    wgsl: 'if (u < 0.5) { return 4.0 * u * u * u; }\n      let v = -2.0 * u + 2.0;\n      return 1.0 - (v * v * v) / 2.0;',
  },
  // --- expo ---
  {
    name: 'expo-in',
    js: (u) => (u === 0 ? 0 : 2 ** (10 * u - 10)),
    wgsl: 'if (u == 0.0) { return 0.0; }\n      return pow(2.0, 10.0 * u - 10.0);',
  },
  {
    name: 'expo-out',
    js: (u) => (u === 1 ? 1 : 1 - 2 ** (-10 * u)),
    wgsl: 'if (u == 1.0) { return 1.0; }\n      return 1.0 - pow(2.0, -10.0 * u);',
  },
  {
    name: 'expo-in-out',
    js: (u) => (u === 0 ? 0 : u === 1 ? 1 : u < 0.5 ? 2 ** (20 * u - 10) / 2 : (2 - 2 ** (-20 * u + 10)) / 2),
    wgsl: 'if (u == 0.0) { return 0.0; }\n      if (u == 1.0) { return 1.0; }\n      if (u < 0.5) { return pow(2.0, 20.0 * u - 10.0) / 2.0; }\n      return (2.0 - pow(2.0, -20.0 * u + 10.0)) / 2.0;',
  },
  // --- circ ---
  { name: 'circ-in', js: (u) => 1 - Math.sqrt(1 - u * u), wgsl: 'return 1.0 - sqrt(1.0 - u * u);' },
  { name: 'circ-out', js: (u) => Math.sqrt(1 - (u - 1) * (u - 1)), wgsl: 'return sqrt(1.0 - (u - 1.0) * (u - 1.0));' },
  {
    name: 'circ-in-out',
    js: (u) =>
      u < 0.5 ? (1 - Math.sqrt(1 - 2 * u * (2 * u))) / 2 : (Math.sqrt(1 - (-2 * u + 2) * (-2 * u + 2)) + 1) / 2,
    wgsl: 'if (u < 0.5) { return (1.0 - sqrt(1.0 - (2.0 * u) * (2.0 * u))) / 2.0; }\n      let v = -2.0 * u + 2.0;\n      return (sqrt(1.0 - v * v) + 1.0) / 2.0;',
  },
  // --- back (overshoots) ---
  {
    name: 'back-in',
    js: (u) => BACK_C3 * u * u * u - BACK_C1 * u * u,
    wgsl: `return ${WGSL_BACK_C3} * u * u * u - ${WGSL_BACK_C1} * u * u;`,
  },
  {
    name: 'back-out',
    js: (u) => 1 + BACK_C3 * (u - 1) * (u - 1) * (u - 1) + BACK_C1 * (u - 1) * (u - 1),
    wgsl: `let v = u - 1.0;\n      return 1.0 + ${WGSL_BACK_C3} * v * v * v + ${WGSL_BACK_C1} * v * v;`,
  },
  {
    name: 'back-in-out',
    js: (u) =>
      u < 0.5
        ? (2 * u * (2 * u) * ((BACK_C2 + 1) * 2 * u - BACK_C2)) / 2
        : ((2 * u - 2) * (2 * u - 2) * ((BACK_C2 + 1) * (u * 2 - 2) + BACK_C2) + 2) / 2,
    wgsl: `if (u < 0.5) { return ((2.0 * u) * (2.0 * u) * ((${WGSL_BACK_C2} + 1.0) * 2.0 * u - ${WGSL_BACK_C2})) / 2.0; }\n      let v = 2.0 * u - 2.0;\n      return (v * v * ((${WGSL_BACK_C2} + 1.0) * v + ${WGSL_BACK_C2}) + 2.0) / 2.0;`,
  },
  // --- elastic (overshoots) ---
  {
    name: 'elastic-in',
    js: (u) => (u === 0 ? 0 : u === 1 ? 1 : -(2 ** (10 * u - 10)) * Math.sin((u * 10 - 10.75) * ELASTIC_C4)),
    wgsl: `if (u == 0.0) { return 0.0; }\n      if (u == 1.0) { return 1.0; }\n      return -pow(2.0, 10.0 * u - 10.0) * sin((u * 10.0 - 10.75) * ${WGSL_ELASTIC_C4});`,
  },
  {
    name: 'elastic-out',
    js: (u) => (u === 0 ? 0 : u === 1 ? 1 : 2 ** (-10 * u) * Math.sin((u * 10 - 0.75) * ELASTIC_C4) + 1),
    wgsl: `if (u == 0.0) { return 0.0; }\n      if (u == 1.0) { return 1.0; }\n      return pow(2.0, -10.0 * u) * sin((u * 10.0 - 0.75) * ${WGSL_ELASTIC_C4}) + 1.0;`,
  },
  {
    name: 'elastic-in-out',
    js: (u) =>
      u === 0
        ? 0
        : u === 1
          ? 1
          : u < 0.5
            ? -(2 ** (20 * u - 10) * Math.sin((20 * u - 11.125) * ELASTIC_C5)) / 2
            : (2 ** (-20 * u + 10) * Math.sin((20 * u - 11.125) * ELASTIC_C5)) / 2 + 1,
    wgsl: `if (u == 0.0) { return 0.0; }\n      if (u == 1.0) { return 1.0; }\n      if (u < 0.5) { return -(pow(2.0, 20.0 * u - 10.0) * sin((20.0 * u - 11.125) * ${WGSL_ELASTIC_C5})) / 2.0; }\n      return (pow(2.0, -20.0 * u + 10.0) * sin((20.0 * u - 11.125) * ${WGSL_ELASTIC_C5})) / 2.0 + 1.0;`,
  },
  // --- bounce ---
  { name: 'bounce-in', js: (u) => 1 - bounceOut(1 - u), wgsl: 'return 1.0 - bounceOut(1.0 - u);' },
  { name: 'bounce-out', js: (u) => bounceOut(u), wgsl: 'return bounceOut(u);' },
  {
    name: 'bounce-in-out',
    js: (u) => (u < 0.5 ? (1 - bounceOut(1 - 2 * u)) / 2 : (1 + bounceOut(2 * u - 1)) / 2),
    wgsl: 'if (u < 0.5) { return (1.0 - bounceOut(1.0 - 2.0 * u)) / 2.0; }\n      return (1.0 + bounceOut(2.0 * u - 1.0)) / 2.0;',
  },
];

/** Curve names in wire order; index = u32 shader mode. */
export const EASING_ORDER: readonly string[] = EASING_SPECS.map((s) => s.name);

/**
 * name → JS curve over clamped u. Built without a prototype so that
 * `EASING_CURVES['constructor']` is undefined rather than Object's
 * constructor — the lookup in `ease()` and the playground relies on that.
 */
export const EASING_CURVES: Readonly<Record<string, (u: number) => number>> = Object.freeze(
  Object.assign(
    Object.create(null) as Record<string, (u: number) => number>,
    Object.fromEntries(EASING_SPECS.map((s) => [s.name, s.js])),
  ),
);

/** Wire value for a curve name, or -1 when unknown. */
export function easingModeIndex(name: string): number {
  return EASING_ORDER.indexOf(name);
}

/**
 * `Easing` enum members derived from the curve names: 'sine-in-out' →
 * SineInOut, 'ease-in' → EaseIn, 'smoothstep' → Smoothstep. Insertion order
 * follows EASING_ORDER, so the enum lists curves in wire order.
 */
export function easingEnumMembers(): Record<string, string> {
  const members: Record<string, string> = {};
  for (const name of EASING_ORDER) {
    const member = name
      .split('-')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join('');
    members[member] = name;
  }
  return members;
}

/**
 * WGSL for the topo shaders: `easingCurve(u, mode)` switches over every
 * spec in wire order, and `applyEasing(t, mode)` clamps the input to [0, 1]
 * and the output back onto the color ramp. Spliced in by
 * playground/gpu/easing-wgsl.ts at pipeline creation.
 */
export function buildEasingWgsl(): string {
  const cases = EASING_SPECS.map(
    (spec, i) => `    case ${i}u: {\n      // ${spec.name}\n      ${spec.wgsl}\n    }`,
  ).join('\n');
  return `// --- Easing functions (generated from src/stdlib/easing-curves.ts — do not edit by hand) ---

${BOUNCE_OUT_WGSL}

fn easingCurve(u: f32, mode: u32) -> f32 {
  switch (mode) {
${cases}
    default: {
      return u;
    }
  }
}

// Gradient use: input clamped to [0, 1], and the eased elevation clamped back
// onto the color ramp so overshooting curves (back, elastic) hold at the edge.
fn applyEasing(t: f32, mode: u32) -> f32 {
  let u = clamp(t, 0.0, 1.0);
  if (u <= 0.0) {
    return 0.0;
  }
  if (u >= 1.0) {
    return 1.0;
  }
  return clamp(easingCurve(u, mode), 0.0, 1.0);
}
`;
}
