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
import { validateCSSIdent } from '../evaluator/sanitize';
import type {
  CompileResult,
  ElevationShadowFilterOutput,
  EmbossFilterOutput,
  FilterOutput,
  GlowFilterOutput,
  GradientOutput,
  InnerShadowFilterOutput,
  MarkerOutput,
  MaskOutput,
  NoiseFilterOutput,
  PatternOutput,
  PixelateFilterOutput,
} from '../evaluator/types';
import type { ClipPathOutput } from '../evaluator/types';

import { h, type VNode } from './types';

/**
 * Defense-in-depth check on URLs that flow into <image href=...> from gpu
 * gradient rasterization. Producers (workspace-view, gradient-service) emit
 * data: URLs only; this assertion prevents a regression there from leaking a
 * remote URL into the SVG output.
 */
function assertSafeGpuImageUrl(url: string): void {
  if (!url.startsWith('data:image/')) {
    throw new Error(
      `GPU gradient href must be a data:image/... URI, got ${JSON.stringify(url.slice(0, 80))}`,
    );
  }
}

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
  for (const filter of result.filters ?? []) {
    defs.push(buildFilter(filter, emitData));
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
      if (url) {
        assertSafeGpuImageUrl(url);
        imgAttrs.href = url;
      }
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
      if (url) {
        assertSafeGpuImageUrl(url);
        imgAttrs.href = url;
      }
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
  if (grad.href) {
    // Defense-in-depth: gradient inheritance refs are validated at evaluation
    // (LinearGradient/RadialGradient constructors); re-check here to protect
    // any future caller that bypasses the constructor path.
    validateCSSIdent(grad.href, 'gradient-href');
    attrs.href = `#${grad.href}`;
  }

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

// ---------------------------------------------------------------------------
// Custom filter recipes
// ---------------------------------------------------------------------------
//
// A filter wraps a primitive chain inside <filter id="...">. Dispatch is by
// `kind`; additional filter kinds can slot in next to `buildNoisePrimitives`
// without changes to wrapper attrs or dispatch shape.
//
// All recipes use a -10%..+120% region so grain extends slightly beyond strokes
// and dropshadow-style spread fits without clipping (matches the convention
// other defs producers use).

/** Filter region rectangle. Each filter kind picks its own based on how far primitives extend. */
interface FilterRegion {
  x: string;
  y: string;
  width: string;
  height: string;
}

function filterRegion(filter: FilterOutput): FilterRegion {
  switch (filter.kind) {
    case 'noise':
    case 'emboss':
    case 'inner-shadow':
      return { x: '-10%', y: '-10%', width: '120%', height: '120%' };
    case 'glow':
      // Outer glow extends beyond the painted bounds by ~radius + spread; give it a generous region.
      return { x: '-50%', y: '-50%', width: '200%', height: '200%' };
    case 'elevation-shadow':
      // Soft layer offset + blur can reach ~elevation*6 outside the source.
      return { x: '-100%', y: '-100%', width: '300%', height: '300%' };
    case 'pixelate':
      // Tile + dilate operate inside the source bounds.
      return { x: '0%', y: '0%', width: '100%', height: '100%' };
    default: {
      const _exhaustive: never = filter;
      throw new Error(`Unsupported filter kind in filterRegion: ${String((_exhaustive as { kind: string }).kind)}`);
    }
  }
}

function buildFilter(filter: FilterOutput, emitData: boolean): VNode {
  const attrs: Record<string, string> = { id: filter.id };
  if (emitData) attrs['data-filter-def'] = filter.id;
  const region = filterRegion(filter);
  attrs.x = region.x;
  attrs.y = region.y;
  attrs.width = region.width;
  attrs.height = region.height;
  // PixelateFilter relies on user-space primitive coordinates (feFlood at
  // pixel offsets like 3,3 with width=12 etc.). The default filterUnits is
  // objectBoundingBox, which scales those coords to 0..1 of the source bbox
  // and produces an empty result. userSpaceOnUse keeps the primitive coords
  // as literal pixel values.
  if (filter.kind === 'pixelate') {
    attrs.filterUnits = 'userSpaceOnUse';
  }
  let children: VNode[];
  switch (filter.kind) {
    case 'noise':
      children = buildNoisePrimitives(filter);
      break;
    case 'glow':
      children = buildGlowPrimitives(filter);
      break;
    case 'emboss':
      children = buildEmbossPrimitives(filter);
      break;
    case 'elevation-shadow':
      children = buildElevationShadowPrimitives(filter);
      break;
    case 'inner-shadow':
      children = buildInnerShadowPrimitives(filter);
      break;
    case 'pixelate':
      children = buildPixelatePrimitives(filter);
      break;
    default: {
      const _exhaustive: never = filter;
      throw new Error(`Unsupported filter kind: ${String((_exhaustive as { kind: string }).kind)}`);
    }
  }
  return h('filter', attrs, children);
}

function turbulenceAttrs(filter: NoiseFilterOutput): Record<string, string> {
  const attrs: Record<string, string> = {
    type: filter.style === 'speckle' ? 'turbulence' : 'fractalNoise',
    baseFrequency: String(filter.scale),
    numOctaves: String(filter.octaves),
    seed: String(filter.seed),
    result: 'turb',
  };
  if (filter.stitch) attrs.stitchTiles = 'stitch';
  return attrs;
}

/** Linear alpha ramp via feComponentTransfer — modulates noise intensity uniformly across presets. */
function amountTransferNode(amount: number, inResult: string, outResult: string): VNode {
  return h('feComponentTransfer', { in: inResult, result: outResult }, [
    h('feFuncA', { type: 'linear', slope: String(amount) }),
  ]);
}

/** Symmetric contrast pump on RGB channels — used by the Gradient style and any preset with contrast > 1. */
function contrastPumpNode(contrast: number, inResult: string, outResult: string): VNode {
  // y = clamp(contrast * (x - 0.5) + 0.5, 0..1) — implemented as linear with intercept.
  const slope = String(contrast);
  const intercept = String(0.5 - 0.5 * contrast);
  return h('feComponentTransfer', { in: inResult, result: outResult }, [
    h('feFuncR', { type: 'linear', slope, intercept }),
    h('feFuncG', { type: 'linear', slope, intercept }),
    h('feFuncB', { type: 'linear', slope, intercept }),
  ]);
}

/**
 * All current noise presets share the same primitive chain shape:
 *   turbulence → optional contrast pump → composite-in SourceAlpha →
 *   optional luminance-to-alpha (monochrome) → amount transfer → blend.
 *
 * Per-preset visual character flows entirely through:
 *   - `turbulenceAttrs(filter)`: Speckle picks `type: 'turbulence'`; others
 *     `'fractalNoise'`. `stitchTiles` is set when `filter.stitch === true`.
 *   - Default parameter values baked in at construction (scale/octaves/blend
 *     /contrast/monochrome — see `noiseFilterDefaults` in the evaluator).
 *
 * Keeping a single chain function means every user property — `contrast`,
 * `monochrome`, `amount`, `blend` — affects every preset uniformly. The
 * earlier per-preset builders silently dropped `contrast` on four of five
 * styles and forced `monochrome` on Static.
 */
function buildNoisePrimitives(filter: NoiseFilterOutput): VNode[] {
  const nodes: VNode[] = [h('feTurbulence', turbulenceAttrs(filter))];
  let last = 'turb';
  if (filter.contrast !== 1) {
    nodes.push(contrastPumpNode(filter.contrast, last, 'pumped'));
    last = 'pumped';
  }
  nodes.push(h('feComposite', { in: last, in2: 'SourceAlpha', operator: 'in', result: 'masked' }));
  last = 'masked';
  if (filter.monochrome) {
    nodes.push(h('feColorMatrix', { in: last, type: 'luminanceToAlpha', result: 'mono' }));
    last = 'mono';
  }
  nodes.push(amountTransferNode(filter.amount, last, 'noise'));
  nodes.push(h('feBlend', { in: 'SourceGraphic', in2: 'noise', mode: filter.blend }));
  return nodes;
}

// ---------------------------------------------------------------------------
// GlowFilter — outer or inner soft glow.
// ---------------------------------------------------------------------------

function buildGlowPrimitives(filter: GlowFilterOutput): VNode[] {
  const nodes: VNode[] = [];
  let blurIn = 'SourceAlpha';
  if (filter.spread > 0) {
    nodes.push(
      h('feMorphology', {
        in: 'SourceAlpha',
        operator: filter.mode === 'inner' ? 'erode' : 'dilate',
        radius: String(filter.spread),
        result: 'shaped',
      }),
    );
    blurIn = 'shaped';
  }
  nodes.push(h('feGaussianBlur', { in: blurIn, stdDeviation: String(filter.radius), result: 'blur' }));
  if (filter.mode === 'outer') {
    nodes.push(h('feFlood', { 'flood-color': filter.color, 'flood-opacity': String(filter.opacity), result: 'flood' }));
    nodes.push(h('feComposite', { in: 'flood', in2: 'blur', operator: 'in', result: 'coloredGlow' }));
    nodes.push(
      h('feMerge', {}, [
        h('feMergeNode', { in: 'coloredGlow' }),
        h('feMergeNode', { in: 'SourceGraphic' }),
      ]),
    );
  } else {
    // Inner: invert the blurred shape against the source alpha so glow rides the inside edge.
    nodes.push(h('feComposite', { in: 'SourceAlpha', in2: 'blur', operator: 'out', result: 'inverted' }));
    nodes.push(h('feFlood', { 'flood-color': filter.color, 'flood-opacity': String(filter.opacity), result: 'flood' }));
    nodes.push(h('feComposite', { in: 'flood', in2: 'inverted', operator: 'in', result: 'innerGlow' }));
    // Clip glow to source so it never leaks outside.
    nodes.push(h('feComposite', { in: 'innerGlow', in2: 'SourceAlpha', operator: 'in', result: 'clippedGlow' }));
    nodes.push(
      h('feMerge', {}, [
        h('feMergeNode', { in: 'SourceGraphic' }),
        h('feMergeNode', { in: 'clippedGlow' }),
      ]),
    );
  }
  return nodes;
}

// ---------------------------------------------------------------------------
// EmbossFilter — feSpecularLighting + feDistantLight.
// ---------------------------------------------------------------------------

function radToDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

function buildEmbossPrimitives(filter: EmbossFilterOutput): VNode[] {
  const nodes: VNode[] = [];
  let specIn = 'SourceAlpha';
  if (filter.smooth > 0) {
    nodes.push(h('feGaussianBlur', { in: 'SourceAlpha', stdDeviation: String(filter.smooth), result: 'blur' }));
    specIn = 'blur';
  }
  nodes.push(
    h(
      'feSpecularLighting',
      {
        in: specIn,
        surfaceScale: String(filter.depth),
        specularConstant: String(filter.strength),
        specularExponent: String(filter.shininess),
        'lighting-color': filter.lightColor,
        result: 'spec',
      },
      [
        h('feDistantLight', {
          azimuth: cleanNum(radToDeg(filter.angle)),
          elevation: cleanNum(radToDeg(filter.elevation)),
        }),
      ],
    ),
  );
  nodes.push(h('feComposite', { in: 'spec', in2: 'SourceAlpha', operator: 'in', result: 'masked' }));
  nodes.push(
    h('feComposite', {
      in: 'SourceGraphic',
      in2: 'masked',
      operator: 'arithmetic',
      k1: '0',
      k2: '1',
      k3: '1',
      k4: '0',
    }),
  );
  return nodes;
}

// ---------------------------------------------------------------------------
// ElevationShadowFilter — three layered soft shadows.
// ---------------------------------------------------------------------------

interface ShadowLayer {
  distanceRatio: number;
  blurRatio: number;
  opacity: number;
}

const ELEVATION_LAYERS: ShadowLayer[] = [
  { distanceRatio: 0.3, blurRatio: 0.5, opacity: 0.3 },
  { distanceRatio: 0.6, blurRatio: 1.0, opacity: 0.18 },
  { distanceRatio: 1.0, blurRatio: 2.0, opacity: 0.12 },
];

/**
 * Round near-zero floats to 0 and trim long decimal tails so the emitted SVG
 * is readable. Without this, `cos(PI/2) * 6` shows up as `3.67e-16` and
 * `0.3 * 6` as `1.7999999999999998`. Six decimal places is plenty of
 * resolution for filter-region geometry.
 */
function cleanNum(n: number): string {
  if (!Number.isFinite(n)) return String(n);
  if (Math.abs(n) < 1e-9) return '0';
  const rounded = Math.round(n * 1e6) / 1e6;
  return String(rounded);
}

function buildSoftShadowLayer(
  index: number,
  dx: number,
  dy: number,
  blur: number,
  color: string,
  opacity: number,
): VNode[] {
  const i = index + 1;
  return [
    h('feGaussianBlur', { in: 'SourceAlpha', stdDeviation: cleanNum(blur), result: `b${i}` }),
    h('feOffset', { in: `b${i}`, dx: cleanNum(dx), dy: cleanNum(dy), result: `o${i}` }),
    h('feFlood', { 'flood-color': color, 'flood-opacity': cleanNum(opacity), result: `f${i}` }),
    h('feComposite', { in: `f${i}`, in2: `o${i}`, operator: 'in', result: `s${i}` }),
  ];
}

function buildElevationShadowPrimitives(filter: ElevationShadowFilterOutput): VNode[] {
  const nodes: VNode[] = [];
  if (filter.elevation <= 0) {
    // Flat — emit a pass-through chain (Identity on SourceGraphic). feMerge with just SourceGraphic.
    nodes.push(h('feMerge', {}, [h('feMergeNode', { in: 'SourceGraphic' })]));
    return nodes;
  }
  const cosD = Math.cos(filter.direction);
  const sinD = Math.sin(filter.direction);
  const mergeChildren: VNode[] = [];
  for (let i = 0; i < ELEVATION_LAYERS.length; i++) {
    const layer = ELEVATION_LAYERS[i];
    const distance = filter.elevation * layer.distanceRatio * filter.tightness;
    const blur = filter.elevation * layer.blurRatio * filter.tightness;
    const dx = distance * cosD;
    const dy = distance * sinD;
    const sub = buildSoftShadowLayer(i, dx, dy, blur, filter.color, layer.opacity);
    nodes.push(...sub);
    mergeChildren.push(h('feMergeNode', { in: `s${i + 1}` }));
  }
  mergeChildren.push(h('feMergeNode', { in: 'SourceGraphic' }));
  nodes.push(h('feMerge', {}, mergeChildren));
  return nodes;
}

// ---------------------------------------------------------------------------
// InnerShadowFilter — inset shadow clipped to source.
// ---------------------------------------------------------------------------

function buildInnerShadowPrimitives(filter: InnerShadowFilterOutput): VNode[] {
  return [
    h('feGaussianBlur', { in: 'SourceAlpha', stdDeviation: String(filter.blur), result: 'blur' }),
    h('feOffset', { in: 'blur', dx: String(filter.offsetX), dy: String(filter.offsetY), result: 'offset' }),
    h('feComposite', { in: 'SourceAlpha', in2: 'offset', operator: 'out', result: 'inverted' }),
    h('feFlood', { 'flood-color': filter.color, 'flood-opacity': String(filter.opacity), result: 'flood' }),
    h('feComposite', { in: 'flood', in2: 'inverted', operator: 'in', result: 'innerShadow' }),
    h('feComposite', { in: 'innerShadow', in2: 'SourceAlpha', operator: 'in', result: 'clipped' }),
    h('feMerge', {}, [h('feMergeNode', { in: 'SourceGraphic' }), h('feMergeNode', { in: 'clipped' })]),
  ];
}

// ---------------------------------------------------------------------------
// PixelateFilter — flood-tile-dilate mosaic.
// ---------------------------------------------------------------------------

function buildPixelatePrimitives(filter: PixelateFilterOutput): VNode[] {
  const offset = filter.radius / 2;
  return [
    h('feFlood', {
      x: String(offset),
      y: String(offset),
      width: '2',
      height: '2',
      'flood-color': '#000',
    }),
    h('feComposite', { width: String(filter.width), height: String(filter.height) }),
    h('feTile', { result: 'a' }),
    h('feComposite', { in: 'SourceGraphic', in2: 'a', operator: 'in' }),
    h('feMorphology', { operator: 'dilate', radius: String(filter.radius) }),
  ];
}
