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

import { validateCSSIdent, validateCSSValue, validatePropertySyntax } from '../evaluator/sanitize';
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
  /**
   * Emit the `<script type="application/json" id="pathogen-metadata">` block
   * that powers the blog mini-workspace inspector. Off by default — the
   * security contract in tests/security/compiler-emission.test.ts forbids any
   * `<script>` in default compiler output. Sample / BBWP build scripts opt in
   * via `--include-metadata`. Surfaces that consume the metadata (blog
   * mini-workspace) strip all scripts at the iframe boundary anyway, so the
   * tag is structurally inert; the default-off keeps the contract narrow.
   */
  includeMetadata?: boolean;
  /** Forward to buildDefs — render conic/mesh/freeform/topo as <pattern><image>. */
  useImageGradients?: boolean;
  /** Forward to buildDefs — pre-rendered GPU gradient data URLs by id. */
  gpuGradientUrls?: Map<string, string>;
  /** Forward to buildDefs — emit playground-only data-*-def attributes on defs. */
  emitPlaygroundDataAttrs?: boolean;
}

export function buildSvgTree(result: CompileResult, options: BuildTreeOptions = {}): VNode {
  // Precedence: source-defined `define ViewBox(...)` wins over caller options,
  // which win over the default. Width/height attrs default to viewBox w/h.
  const sourceViewBox = result.viewBox;
  const viewBox = sourceViewBox
    ? `${sourceViewBox.originX} ${sourceViewBox.originY} ${sourceViewBox.width} ${sourceViewBox.height}`
    : options.viewBox ?? '0 0 200 200';
  const width = sourceViewBox
    ? String(sourceViewBox.width)
    : options.width ?? '200';
  const height = sourceViewBox
    ? String(sourceViewBox.height)
    : options.height ?? '200';

  const viewBoxParts = viewBox.split(/\s+/).map(Number);
  const defsOptions: BuildDefsOptions = {
    width: viewBoxParts[2] || parseInt(width, 10) || 200,
    height: viewBoxParts[3] || parseInt(height, 10) || 200,
    useImageGradients: options.useImageGradients,
    gpuGradientUrls: options.gpuGradientUrls,
    emitPlaygroundDataAttrs: options.emitPlaygroundDataAttrs,
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
    .map((prop) => {
      // Defense-in-depth validation. Each field should already be validated at
      // CSSVar()/Color(CSSVar()) construction; re-checking here protects the
      // serializer if a future code path bypasses the constructor.
      validateCSSIdent(prop.name, 'css-var');
      validatePropertySyntax(prop.syntax);
      if (typeof prop.inherits !== 'boolean') {
        throw new Error(`@property "${prop.name}" inherits must be a boolean, got ${typeof prop.inherits}`);
      }
      validateCSSValue(prop.initialValue, '__cssvar_initial__', { allowVar: true });
      return `    @property ${prop.name} {\n      syntax: "${prop.syntax}";\n      inherits: ${prop.inherits};\n      initial-value: ${prop.initialValue};\n    }`;
    })
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
    viewBox: result.viewBox,
  };
  return h(
    'script',
    { type: 'application/json', id: 'pathogen-metadata' },
    [raw(`<![CDATA[${JSON.stringify(metadata)}]]>`)],
  );
}
