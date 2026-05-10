/**
 * Build VNode[] representing the top-level layer elements inside an SVG.
 *
 * Handles the four LayerOutput kinds:
 *   - path layer    → <path> with d, fill, stroke, stroke-width, other styles, transform
 *   - text layer    → one or more <text> elements with tspan children
 *   - group layer   → <g> with nested layer children (recursive)
 *   - fragment      → raw pre-rendered SVG (emitted verbatim; see types.RawText)
 *
 * Attribute order matches pre-refactor `src/svg-generator.ts` so Phase 2's
 * CLI byte-snapshots pass unchanged.
 */

import type { LayerOutput } from '../evaluator/types';

import { h, raw, type VNode, type VNodeChild } from './types';

export interface BuildLayersOptions {
  /** Default stroke used when a layer does not specify one. Matches CLI default. */
  defaultStroke?: string;
  /** Default fill used when a layer does not specify one. Matches CLI default. */
  defaultFill?: string;
  /** Default stroke-width used when a layer does not specify one. Matches CLI default. */
  defaultStrokeWidth?: string;
  /**
   * Emit playground-specific data attributes (`data-layer-name` on all layer
   * types, `data-has-layer-stroke` / `data-has-layer-stroke-width` on path
   * layers when set in layer.styles). Default false — CLI must not emit
   * these (would break byte identity).
   */
  emitPlaygroundDataAttrs?: boolean;
}

export function buildLayers(layers: LayerOutput[], options: BuildLayersOptions = {}): VNode[] {
  const defaults = resolveDefaults(options);
  return layers.map((layer) => buildLayer(layer, options, defaults));
}

/**
 * Build a single layer. Exposed so callers (e.g. the preview pane) can
 * interleave shared-layer builds with surface-specific logic (e.g. fragment
 * layer parsing) while preserving rendering order.
 */
export function buildSingleLayer(layer: LayerOutput, options: BuildLayersOptions = {}): VNode {
  return buildLayer(layer, options, resolveDefaults(options));
}

type ResolvedDefaults = { stroke: string; fill: string; strokeWidth: string };

function resolveDefaults(options: BuildLayersOptions): ResolvedDefaults {
  return {
    stroke: options.defaultStroke ?? '#000',
    fill: options.defaultFill ?? 'none',
    strokeWidth: options.defaultStrokeWidth ?? '2',
  };
}

function buildLayer(layer: LayerOutput, options: BuildLayersOptions, defaults: ResolvedDefaults): VNode {
  if (layer.type === 'group') {
    return buildGroup(layer, options, defaults);
  }
  if (layer.type === 'text' && layer.textElements) {
    return buildText(layer, options);
  }
  if (layer.type === 'fragment') {
    return buildFragment(layer, options);
  }
  return buildPath(layer, options, defaults);
}

function buildPath(layer: LayerOutput, options: BuildLayersOptions, defaults: ResolvedDefaults): VNode {
  const emitData = options.emitPlaygroundDataAttrs ?? false;
  const attrs: Record<string, string> = {};

  // `data-layer-name` is emitted on every layer-rendered element in BOTH CLI
  // and playground modes — the inspector toggle on blog mini-workspaces queries
  // by this attribute to find every element of a multi-element layer (e.g. a
  // multi-text TextLayer where only the first sibling carries `id`). Without
  // it, toggling a TextLayer with N text elements only hides 1 of N.
  // `id` is additionally emitted in CLI mode for cross-document references
  // (mask/clipPath/marker resolution by id-fragment).
  if (layer.name) {
    attrs['data-layer-name'] = layer.name;
  }
  if (!emitData && layer.name && !layer.isDefault) {
    attrs.id = layer.name;
  }
  attrs.d = layer.data ?? '';

  const hasLayerStroke = layer.styles.stroke !== undefined;
  const hasLayerStrokeWidth = layer.styles['stroke-width'] !== undefined;
  const stroke = layer.styles.stroke ?? defaults.stroke;
  const fill = layer.styles.fill ?? defaults.fill;
  const strokeWidth = layer.styles['stroke-width'] ?? defaults.strokeWidth;

  attrs.fill = fill;
  attrs.stroke = stroke;
  attrs['stroke-width'] = strokeWidth;

  if (emitData && hasLayerStroke) attrs['data-has-layer-stroke'] = 'true';
  if (emitData && hasLayerStrokeWidth) attrs['data-has-layer-stroke-width'] = 'true';

  // Any other style properties, in their original insertion order.
  const handled = new Set(['stroke', 'fill', 'stroke-width']);
  for (const [key, value] of Object.entries(layer.styles)) {
    if (!handled.has(key)) {
      attrs[key] = String(value);
    }
  }

  if (layer.transform) {
    attrs.transform = layer.transform;
  }

  return h('path', attrs, []);
}

function buildText(layer: LayerOutput, options: BuildLayersOptions): VNode {
  const emitData = options.emitPlaygroundDataAttrs ?? false;
  const elements = layer.textElements ?? [];
  const idName = layer.name && !layer.isDefault ? layer.name : null;

  const children: VNode[] = elements.map((te, i) => {
    const mergedStyles = te.styles ? { ...layer.styles, ...te.styles } : layer.styles;

    const attrs: Record<string, string> = {};
    // `data-layer-name` on every text sibling — in both CLI and playground —
    // so the blog mini-workspace inspector can query `[data-layer-name="X"]`
    // and toggle every text in a multi-text TextLayer atomically. CLI also
    // keeps `id` on the first sibling for backward compat with consumers
    // that referenced the layer by id-fragment.
    if (layer.name) {
      attrs['data-layer-name'] = layer.name;
    }
    if (!emitData && i === 0 && idName) {
      attrs.id = idName;
    }
    attrs.x = String(te.x);
    attrs.y = String(te.y);
    if (te.rotation != null) {
      attrs.transform = `rotate(${radToDeg(te.rotation)}, ${te.x}, ${te.y})`;
    }
    for (const [key, value] of Object.entries(mergedStyles)) {
      attrs[key] = String(value);
    }

    const textChildren: VNodeChild[] = te.children.map((child) => {
      if (child.type === 'run') {
        return child.text;
      }
      const tspanAttrs: Record<string, string> = {};
      if (child.dx != null) tspanAttrs.dx = String(child.dx);
      if (child.dy != null) tspanAttrs.dy = String(child.dy);
      if (child.rotation != null) tspanAttrs.rotate = String(radToDeg(child.rotation));
      for (const [key, value] of Object.entries(child.styles ?? {})) {
        tspanAttrs[key] = String(value);
      }
      return h('tspan', tspanAttrs, [child.text]);
    });

    return h('text', attrs, textChildren);
  });

  return h('__text-siblings__', {}, children);
}

function buildGroup(layer: LayerOutput, options: BuildLayersOptions, defaults: ResolvedDefaults): VNode {
  const emitData = options.emitPlaygroundDataAttrs ?? false;
  const attrs: Record<string, string> = {};
  // See buildPath for the rationale: `data-layer-name` everywhere enables
  // group-aware visibility toggles; `id` in CLI mode preserves cross-doc refs.
  if (layer.name) {
    attrs['data-layer-name'] = layer.name;
  }
  if (!emitData && layer.name && !layer.isDefault) {
    attrs.id = layer.name;
  }
  for (const [key, value] of Object.entries(layer.styles)) {
    attrs[key] = String(value);
  }
  if (layer.transform) {
    attrs.transform = layer.transform;
  }

  const children: VNode[] = (layer.children ?? []).map((c) => buildLayer(c, options, defaults));
  return h('g', attrs, children);
}

function buildFragment(layer: LayerOutput, _options: BuildLayersOptions): VNode {
  // Fragment layers are pre-rendered SVG; CLI emits the raw parts verbatim.
  // Playground callers should handle fragment layers specially (see
  // svg-preview-pane.ts) and pass only non-fragment layers to buildLayers.
  const parts: string[] = [];
  if (layer.fragmentDefs) parts.push(layer.fragmentDefs);
  if (layer.fragmentVisuals) parts.push(layer.fragmentVisuals);
  return h('__fragment__', {}, [raw(parts.join('\n'))]);
}

function radToDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}
