// Splices the compiler-generated easing functions into a topo shader source.
//
// The two topological-gradient shaders (topo-shader.ts, topo-laplace-shader.ts)
// carry EASING_WGSL_MARKER where `applyEasing` used to be hand-written. At
// pipeline creation the marker is replaced with `buildEasingWgsl()` from the
// compiler bundle, so the shaders, the Canvas fallback and the language's
// `ease()` all read one curve table (src/stdlib/easing-curves.ts).

export const EASING_WGSL_MARKER = '//__EASING_FUNCTIONS__';

/**
 * Return `source` with the marker replaced by the generated easing WGSL.
 * `easingWgsl` defaults to the served compiler's generator; tests pass it in.
 */
export function withEasingWgsl(source: string, easingWgsl: string = window.PathogenLang.buildEasingWgsl()): string {
  if (!source.includes(EASING_WGSL_MARKER)) {
    throw new Error(`withEasingWgsl: shader source has no ${EASING_WGSL_MARKER} marker`);
  }
  return source.replace(EASING_WGSL_MARKER, easingWgsl);
}
