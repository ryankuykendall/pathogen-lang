/**
 * Names of the constructor functions implemented in the evaluators' call
 * dispatch (evaluator/index.ts evaluateFunctionCall) rather than the stdlib
 * registry. Grouped by what the constructed value is.
 *
 * This is the bridge between the runtime and the language service:
 * scripts/generate-completions.ts cross-checks that every name here has a
 * declaration in src/pathogen-api.ts, and a self-verifying test
 * (tests/constructor-registry.test.ts) compiles a canonical call for each
 * name so the list cannot drift from the actual dispatch.
 *
 * Adding a constructor to the evaluator? Add it here, declare it in
 * src/pathogen-api.ts, and run `npm run generate:completions`.
 */

/** Defs producers — emit `<defs>` children (gradients, masks, markers, …). */
export const DEFS_CONSTRUCTORS = [
  'SVGDocumentFragment',
  'Mask',
  'ClipPath',
  'LinearGradient',
  'RadialGradient',
  'ConicGradient',
  'MeshGradient',
  'FreeformGradient',
  'TopoGradient',
  'Pattern',
  'Marker',
] as const;

/** Filter constructors — also defs producers, dispatched separately. */
export const FILTER_CONSTRUCTORS = [
  'NoiseFilter',
  'GlowFilter',
  'EmbossFilter',
  'ElevationShadowFilter',
  'InnerShadowFilter',
  'PixelateFilter',
  'MotionBlurFilter',
] as const;

/** Plain value constructors dispatched in the evaluator. */
export const VALUE_CONSTRUCTORS = ['Point', 'PolarVector', 'Cycler', 'CSSVar', 'Grid'] as const;

/** Layer constructors. */
export const LAYER_CONSTRUCTORS = ['PathLayer', 'TextLayer', 'GroupLayer'] as const;

/** Every constructor the evaluator dispatches outside the stdlib registry. */
export const EVALUATOR_CONSTRUCTORS = [
  ...DEFS_CONSTRUCTORS,
  ...FILTER_CONSTRUCTORS,
  ...VALUE_CONSTRUCTORS,
  ...LAYER_CONSTRUCTORS,
] as const;

export type EvaluatorConstructor = (typeof EVALUATOR_CONSTRUCTORS)[number];
