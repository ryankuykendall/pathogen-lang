/**
 * Build the top-level `<svg>` VNode for a complete `CompileResult`.
 *
 * The resulting tree is consumed by both adapters:
 *   - `serialize.ts` → string output (CLI, VS Code pre-Phase-5)
 *   - `mount.ts` → DOM output (playground, VS Code post-Phase-5)
 *
 * Structure mirrors the current `src/svg-generator.ts` envelope:
 *   <svg ...>
 *     <style>...@property blocks...</style>   (optional)
 *     <defs>...</defs>                        (optional)
 *     ...layer elements...
 *     <script>...metadata...</script>         (optional)
 *   </svg>
 */

import type { CompileResult, CSSPropertyDeclaration, LayerOutput } from '../evaluator/types';

import { buildDefs, type BuildDefsOptions } from './build-defs';
import { buildLayers, type BuildLayersOptions } from './build-layers';
import { h, raw, type VNode } from './types';

export interface BuildTreeOptions extends BuildLayersOptions {
  /** SVG viewBox attribute. Default "0 0 200 200". */
  viewBox?: string;
  /** SVG width attribute. Default "200". */
  width?: string;
  /** SVG height attribute. Default "200". */
  height?: string;
  /** Emit the `<script type="application/json">` metadata block (inspector). */
  includeMetadata?: boolean;
}

export function buildSvgTree(result: CompileResult, options: BuildTreeOptions = {}): VNode {
  const viewBox = options.viewBox ?? '0 0 200 200';
  const width = options.width ?? '200';
  const height = options.height ?? '200';

  const viewBoxParts = viewBox.split(/\s+/).map(Number);
  const defsOptions: BuildDefsOptions = {
    width: viewBoxParts[2] || parseInt(width, 10) || 200,
    height: viewBoxParts[3] || parseInt(height, 10) || 200,
  };

  const children: VNode[] = [];

  const styleNode = buildStyle(result.cssProperties ?? []);
  if (styleNode) children.push(styleNode);

  const defsChildren = buildDefs(result, defsOptions);
  if (defsChildren.length > 0) {
    children.push(h('defs', {}, defsChildren));
  }

  for (const layer of buildLayers(result.layers, options)) {
    children.push(layer);
  }

  if (options.includeMetadata) {
    children.push(buildMetadata(result));
  }

  return h(
    'svg',
    {
      xmlns: 'http://www.w3.org/2000/svg',
      viewBox,
      width,
      height,
    },
    children,
  );
}

function buildStyle(cssProperties: CSSPropertyDeclaration[]): VNode | null {
  if (cssProperties.length === 0) return null;
  const rules = cssProperties
    .map(
      (prop) =>
        `    @property ${prop.name} {\n      syntax: "${prop.syntax}";\n      inherits: ${prop.inherits};\n      initial-value: ${prop.initialValue};\n    }`,
    )
    .join('\n');
  // CDATA-wrapped content; emitted verbatim by the serializer (no XML escape).
  return h('style', {}, [raw(`<![CDATA[\n${rules}\n  ]]>`)]);
}

function buildMetadata(result: CompileResult): VNode {
  const stripLayerData = (layer: LayerOutput): Record<string, unknown> => {
    const {
      data: _d,
      fragmentDefs: _fd,
      fragmentVisuals: _fv,
      textElements: _te,
      children,
      ...rest
    } = layer;
    if (children) return { ...rest, children: children.map(stripLayerData) };
    return rest;
  };
  const metadata = {
    layers: result.layers.map(stripLayerData),
    masks: result.masks,
    clipPaths: result.clipPaths,
    gradients: result.gradients,
    cssProperties: result.cssProperties,
  };
  return h(
    'script',
    { type: 'application/json', id: 'pathogen-metadata' },
    [raw(`<![CDATA[${JSON.stringify(metadata)}]]>`)],
  );
}
