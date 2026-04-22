/**
 * Build VNode[] representing the `<defs>` children for a `CompileResult`.
 *
 * Emission order (must match pre-refactor `src/svg-generator.ts`):
 *   masks → clipPaths → gradients → patterns → markers
 *
 * Each branch preserves the attribute order of the pre-refactor emitter so
 * Phase 2's CLI byte-snapshots pass unchanged.
 */

import { renderConicToWedges } from '../conic-renderer';
import type {
  CompileResult,
  GradientOutput,
  MarkerOutput,
  MaskOutput,
  PatternOutput,
} from '../evaluator/types';
import type { ClipPathOutput } from '../evaluator/types';

import { h, type VNode } from './types';

export interface BuildDefsOptions {
  /** SVG canvas width — used for conic gradient wedge sizing. Defaults to 200. */
  width?: number;
  /** SVG canvas height — used for conic gradient wedge sizing. Defaults to 200. */
  height?: number;
  /**
   * Emit playground-specific `data-*-def` attributes on each defs element.
   * Used by the preview-pane cleanup selector to remove previous-compilation
   * defs without affecting the static grid pattern. Default false — CLI must
   * not emit these (would break byte identity).
   */
  emitPlaygroundDataAttrs?: boolean;
  /**
   * Render conic/mesh/freeform/topo gradients as `<pattern><image/></pattern>`
   * instead of the CLI fallback (wedge paths for conic, flat rect for others).
   * The `<image>` `href` comes from `gpuGradientUrls` when present; when
   * absent the `href` is emitted empty, and the caller is expected to run a
   * post-pass that computes it (e.g. Canvas 2D conic fallback in the
   * playground). Default false — CLI gets wedges/rects.
   */
  useImageGradients?: boolean;
  /**
   * Pre-rendered data URLs per gradient id (from `playground/gpu/...`). Only
   * consulted when `useImageGradients` is true. Ignored otherwise.
   */
  gpuGradientUrls?: Map<string, string>;
}

export function buildDefs(result: CompileResult, options: BuildDefsOptions = {}): VNode[] {
  const width = options.width ?? 200;
  const height = options.height ?? 200;
  const emitData = options.emitPlaygroundDataAttrs ?? false;
  const useImg = options.useImageGradients ?? false;
  const urls = options.gpuGradientUrls;

  const defs: VNode[] = [];

  for (const mask of result.masks) {
    defs.push(buildMask(mask, emitData));
  }
  for (const clip of result.clipPaths) {
    defs.push(buildClipPath(clip, emitData));
  }
  for (const grad of result.gradients) {
    defs.push(buildGradient(grad, width, height, emitData, useImg, urls));
  }
  for (const pat of result.patterns ?? []) {
    defs.push(buildPattern(pat, emitData));
  }
  for (const marker of result.markers ?? []) {
    defs.push(buildMarker(marker, emitData));
  }

  return defs;
}

function buildMask(mask: MaskOutput, emitData: boolean): VNode {
  const attrs: Record<string, string> = { id: mask.id };
  if (emitData) attrs['data-mask-def'] = mask.id;
  const children: VNode[] = mask.elements.map((el) =>
    h('path', { d: el.pathData, ...el.styles }),
  );
  return h('mask', attrs, children);
}

function buildClipPath(clip: ClipPathOutput, emitData: boolean): VNode {
  const attrs: Record<string, string> = { id: clip.id };
  if (emitData) attrs['data-clippath-def'] = clip.id;
  const children: VNode[] = clip.elements.map((el) => h('path', { d: el.pathData }));
  return h('clipPath', attrs, children);
}

function buildGradient(
  grad: GradientOutput,
  svgW: number,
  svgH: number,
  emitData: boolean,
  useImageGradients: boolean,
  gpuGradientUrls: Map<string, string> | undefined,
): VNode {
  // Conic: either wedge paths (CLI fallback) or pattern+image (playground).
  if (grad.type === 'conic') {
    if (useImageGradients) {
      const attrs: Record<string, string> = { id: grad.id };
      if (emitData) attrs['data-gradient-def'] = grad.id;
      attrs.x = '0';
      attrs.y = '0';
      attrs.width = String(svgW);
      attrs.height = String(svgH);
      attrs.patternUnits = 'userSpaceOnUse';
      const imgAttrs: Record<string, string> = {
        width: String(svgW),
        height: String(svgH),
      };
      const url = gpuGradientUrls?.get(grad.id);
      if (url) imgAttrs.href = url;
      return h('pattern', attrs, [h('image', imgAttrs)]);
    }
    const wedges = renderConicToWedges(
      grad.cx ?? 0,
      grad.cy ?? 0,
      grad.from ?? 0,
      grad.to ?? 2 * Math.PI,
      grad.direction ?? 'cw',
      grad.spread ?? 'clamp',
      grad.stopsWithOklch ?? grad.stops,
      svgW,
      svgH,
    );
    const children: VNode[] = wedges.map((w) => h('path', { d: w.d, fill: w.fill }));
    return h(
      'pattern',
      {
        id: grad.id,
        x: '0',
        y: '0',
        width: String(svgW),
        height: String(svgH),
        patternUnits: 'userSpaceOnUse',
      },
      children,
    );
  }

  // Mesh / Freeform / Topo: either CLI fallback rect or playground pattern+image.
  if (grad.type === 'mesh' || grad.type === 'freeform' || grad.type === 'topo') {
    if (useImageGradients) {
      const attrs: Record<string, string> = { id: grad.id };
      if (emitData) attrs['data-gradient-def'] = grad.id;
      attrs.x = '0';
      attrs.y = '0';
      attrs.width = '1';
      attrs.height = '1';
      attrs.patternUnits = 'objectBoundingBox';
      attrs.patternContentUnits = 'objectBoundingBox';
      const imgAttrs: Record<string, string> = {
        width: '1',
        height: '1',
        preserveAspectRatio: 'none',
      };
      const url = gpuGradientUrls?.get(grad.id);
      if (url) imgAttrs.href = url;
      return h('pattern', attrs, [h('image', imgAttrs)]);
    }
    let w: number, hgt: number;
    if (grad.type === 'mesh') {
      w = grad.meshWidth ?? 200;
      hgt = grad.meshHeight ?? 200;
    } else if (grad.type === 'freeform') {
      w = grad.freeformWidth ?? 200;
      hgt = grad.freeformHeight ?? 200;
    } else {
      w = grad.topoWidth ?? 200;
      hgt = grad.topoHeight ?? 200;
    }
    let avgColor = '#808080';
    if (grad.type === 'topo') {
      if (grad.topoBaseColor) {
        avgColor = grad.topoBaseColor;
      } else {
        const contours = grad.topoContours ?? [];
        if (contours.length > 0) avgColor = contours[0].color;
      }
    } else {
      const points =
        grad.type === 'mesh' ? (grad.meshGrid ?? []).flat() : grad.freeformPoints ?? [];
      if (points.length > 0) avgColor = points[0].color;
    }
    return h(
      'pattern',
      {
        id: grad.id,
        x: '0',
        y: '0',
        width: String(w),
        height: String(hgt),
        patternUnits: 'userSpaceOnUse',
      },
      [h('rect', { width: String(w), height: String(hgt), fill: avgColor })],
    );
  }

  // Linear / Radial: proper <linearGradient> / <radialGradient>.
  const tagName = grad.type === 'linear' ? 'linearGradient' : 'radialGradient';
  const attrs: Record<string, string> = { id: grad.id };
  if (emitData) attrs['data-gradient-def'] = grad.id;
  for (const [key, value] of Object.entries(grad.attrs)) {
    attrs[key] = value;
  }
  if (grad.spreadMethod) attrs.spreadMethod = grad.spreadMethod;
  if (grad.gradientUnits) attrs.gradientUnits = grad.gradientUnits;
  if (grad.gradientTransform) attrs.gradientTransform = grad.gradientTransform;
  if (grad.colorInterpolation) attrs['color-interpolation'] = grad.colorInterpolation;
  if (grad.href) attrs.href = `#${grad.href}`;

  const stops: VNode[] = grad.stops.map((s) =>
    h('stop', { offset: String(s.offset), 'stop-color': s.color }),
  );
  return h(tagName, attrs, stops);
}

function buildPattern(pat: PatternOutput, emitData: boolean): VNode {
  const attrs: Record<string, string> = { id: pat.id };
  if (emitData) attrs['data-pattern-def'] = pat.id;
  attrs.x = String(pat.x);
  attrs.y = String(pat.y);
  attrs.width = String(pat.width);
  attrs.height = String(pat.height);
  if (pat.patternUnits) attrs.patternUnits = pat.patternUnits;
  if (pat.patternTransform) attrs.patternTransform = pat.patternTransform;
  if (pat.patternContentUnits) attrs.patternContentUnits = pat.patternContentUnits;
  const children: VNode[] = pat.elements.map((el) =>
    h('path', { d: el.pathData, ...el.styles }),
  );
  return h('pattern', attrs, children);
}

function buildMarker(marker: MarkerOutput, emitData: boolean): VNode {
  const attrs: Record<string, string> = { id: marker.id };
  if (emitData) attrs['data-marker-def'] = marker.id;
  attrs.viewBox = marker.viewBox;
  attrs.markerWidth = String(marker.markerWidth);
  attrs.markerHeight = String(marker.markerHeight);
  attrs.refX = marker.refX;
  attrs.refY = marker.refY;
  if (marker.markerUnits) attrs.markerUnits = marker.markerUnits;
  if (marker.orient) attrs.orient = marker.orient;
  if (marker.preserveAspectRatio) attrs.preserveAspectRatio = marker.preserveAspectRatio;
  const children: VNode[] = marker.elements.map((el) =>
    h('path', { d: el.pathData, ...el.styles }),
  );
  return h('marker', attrs, children);
}
