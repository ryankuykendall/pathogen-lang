// SVG Builder — thin adapter over the shared renderer in `src/render/`.
// Consumed by `playground/bbwp.html` to produce complete SVG documents for
// BBWP (browser-based workspace preview) artifacts.
//
// This file used to be a separate third implementation of the render logic
// (~366 lines, missing marker support entirely). The render pipeline
// unification (2026-04-21) collapsed it into this ~60-line wrapper so BBWP
// gets parity with CLI and playground preview for free. See
// `project-docs/render-pipeline-unification/PLAN.md` Phase 4.

import type {
  ClipPathOutput,
  CompileResult,
  CSSPropertyDeclaration,
  FilterOutput,
  GradientOutput,
  LayerOutput,
  MarkerOutput,
  MaskOutput,
  PatternOutput,
} from '../../src/evaluator/types';
import { buildSvgTree, h, toSvgString } from '../../src/render';

interface BuildSvgParams {
  layers?: LayerOutput[];
  masks?: MaskOutput[];
  clipPaths?: ClipPathOutput[];
  gradients?: GradientOutput[];
  patterns?: PatternOutput[];
  markers?: MarkerOutput[];
  filters?: FilterOutput[];
  cssProperties?: CSSPropertyDeclaration[];
  /** Pre-rendered GPU gradient data URLs, keyed by gradient id. */
  gpuGradientUrls?: Map<string, string>;
}

interface SvgOptions {
  viewBox?: string;
  width?: string;
  height?: string;
  background?: string;
  defaultStroke?: string;
  defaultFill?: string;
  defaultStrokeWidth?: string;
}

/**
 * Build a complete SVG document string from compilation output.
 *
 * BBWP-specific behavior kept: when `background` is set and non-transparent,
 * injects a `<rect width="100%" height="100%" fill="{bg}">` as the first
 * child of `<svg>` so the artifact has a solid background when rasterized.
 */
export function buildSvg(params: BuildSvgParams, svgOptions: SvgOptions = {}): string {
  const background = svgOptions.background || 'transparent';

  const tree = buildSvgTree(
    {
      layers: params.layers ?? [],
      masks: params.masks ?? [],
      clipPaths: params.clipPaths ?? [],
      gradients: params.gradients ?? [],
      patterns: params.patterns ?? [],
      markers: params.markers ?? [],
      filters: params.filters ?? [],
      cssProperties: params.cssProperties ?? [],
      logs: [],
      calledStdlibFunctions: [],
    } as unknown as CompileResult,
    {
      viewBox: svgOptions.viewBox,
      width: svgOptions.width,
      height: svgOptions.height,
      defaultStroke: svgOptions.defaultStroke,
      defaultFill: svgOptions.defaultFill,
      defaultStrokeWidth: svgOptions.defaultStrokeWidth,
      useImageGradients: true,
      gpuGradientUrls: params.gpuGradientUrls,
    },
  );

  if (background && background !== 'transparent') {
    tree.children.unshift(h('rect', { width: '100%', height: '100%', fill: background }));
  }

  return toSvgString(tree);
}
