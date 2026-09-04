/**
 * Shared SVG renderer for the pathogen-lang project.
 *
 * Produces a minimal `VNode` tree from a `CompileResult`, then hands it to
 * one of two adapters:
 *   - `toSvgString(tree)` — string output (CLI, VS Code webview pre-Phase-5)
 *   - `mountInto(parent, tree)` — live DOM (playground, VS Code post-Phase-5)
 *
 * See `project-docs/render-pipeline-unification/DESIGN.md` for the full
 * contract (attribute ordering, data-* preservation, failure modes).
 */

export { buildDefs, type BuildDefsOptions } from './build-defs';
export { buildLayers, buildSingleLayer, type BuildLayersOptions } from './build-layers';
export { buildSvgTree, type BuildTreeOptions } from './build-tree';
export { escapeXml, toSvgString } from './serialize';
export { toJsonDocument, type JsonDocument, type JsonLayer } from './json-document';
export { mountInto } from './mount';
export { h, isRawText, isVNode, raw, type RawText, type VNode, type VNodeChild } from './types';
