/**
 * Serialize a VNode tree to an SVG string.
 *
 * Byte-identical with the pre-refactor `src/svg-generator.ts` emitter.
 * The format has a few quirks inherited from that emitter:
 *
 *   - `<defs>` is emitted at column 0 (not tree-indented under `<svg>`).
 *   - Defs children are at column 2; grandchildren (e.g. paths inside a
 *     marker) are at column 4.
 *   - Layer elements are at column 2.
 *   - A blank line sits between `<svg>` and `<defs>`, and between `</defs>`
 *     and the first layer element.
 *   - `<text>` and `<tspan>` render their children inline (no newlines).
 *   - `<style>` and `<script>` children marked as `raw` are emitted verbatim
 *     to preserve CDATA wrappers.
 *   - Fragment layers (synthetic `__fragment__` tag) are emitted as raw SVG.
 *   - Text-layer wrappers (synthetic `__text-siblings__`) are unwrapped, so
 *     multiple `<text>` elements appear as siblings at the layer's indent.
 *
 * The quirks exist because the pre-refactor emitter used string concatenation
 * rather than tree walking. Phase 0 snapshots pin the current bytes; this
 * serializer matches them. If a future cleanup wants tree-clean indentation,
 * it would need to regenerate the snapshots — out of scope for this refactor.
 */

import { isRawText, isVNode, type VNode, type VNodeChild } from './types';

/** Tags whose children render inline (no newlines or indentation between children). */
const INLINE_TAGS = new Set(['text', 'tspan']);

/** Synthetic tags invented by the builders; unwrapped by the serializer. */
const UNWRAP_TAGS = new Set(['__text-siblings__']);

/** Synthetic tag for pre-rendered fragment SVG; contents emitted as raw. */
const FRAGMENT_TAG = '__fragment__';

export function toSvgString(root: VNode): string {
  if (root.tag !== 'svg') {
    // Non-envelope trees (tests, helpers) use plain tree serialization.
    return serializeNode(root, '');
  }
  return serializeSvgRoot(root);
}

/**
 * Emit the top-level `<svg>` envelope with the pre-refactor format.
 *
 *   <svg ...>{optional <style> prefix}
 *
 *   <defs>
 *     ...defs children at col 2...
 *   </defs>
 *
 *     ...layer elements at col 2...{optional metadata suffix}
 *   </svg>
 */
function serializeSvgRoot(svg: VNode): string {
  const openTag = `<${svg.tag}${formatAttrs(svg.attrs)}>`;

  // Split children into sections matching the pre-refactor template.
  let styleSection = '';
  let defsSection = '';
  let metadataSection = '';
  const layerSections: string[] = [];

  for (const child of svg.children) {
    if (!isVNode(child)) continue;
    if (child.tag === 'style') {
      // Leading newline + 2-space indent, matching the original template.
      styleSection = `\n  ${serializeStyleElement(child)}`;
    } else if (child.tag === 'defs') {
      defsSection = `\n<defs>\n${serializeDefsChildren(child.children)}\n</defs>\n`;
    } else if (child.tag === 'script' && child.attrs.id === 'pathogen-metadata') {
      metadataSection = `\n${serializeRawOnlyElement(child)}`;
    } else {
      layerSections.push(serializeLayerElement(child, '  '));
    }
  }

  const elements = layerSections.join('\n');

  return `${openTag}${styleSection}
${defsSection}
${elements}${metadataSection}
</svg>`;
}

/**
 * Serialize <defs>'s children at column 2 each, with their own subtrees
 * indented at column 4+.
 */
function serializeDefsChildren(children: VNodeChild[]): string {
  return children
    .filter((c): c is VNode => isVNode(c))
    .map((child) => serializeNode(child, '  '))
    .join('\n');
}

/**
 * Serialize a layer element. Text-siblings wrapper is unwrapped so its
 * children appear at the layer's indent.
 */
function serializeLayerElement(node: VNode, indent: string): string {
  if (UNWRAP_TAGS.has(node.tag)) {
    return node.children
      .filter((c): c is VNode => isVNode(c))
      .map((c) => serializeNode(c, indent))
      .join('\n');
  }
  if (node.tag === FRAGMENT_TAG) {
    // Fragment: emit each raw child verbatim (no indent prefix).
    return node.children
      .map((c) => (isRawText(c) ? c.raw : ''))
      .filter((s) => s.length > 0)
      .join('\n');
  }
  return serializeNode(node, indent);
}

/**
 * Recursive tree serializer for any VNode that isn't the top-level envelope.
 */
function serializeNode(node: VNode, indent: string): string {
  const openAttrs = formatAttrs(node.attrs);

  // Empty element: self-close.
  if (node.children.length === 0) {
    return `${indent}<${node.tag}${openAttrs}/>`;
  }

  // Inline element (text/tspan): children concatenated, no newlines/indent.
  if (INLINE_TAGS.has(node.tag)) {
    const content = node.children
      .map((c) => serializeInlineChild(c))
      .join('');
    return `${indent}<${node.tag}${openAttrs}>${content}</${node.tag}>`;
  }

  // Block element: children each on their own line, indented deeper.
  const childIndent = indent + '  ';
  const lines = node.children
    .map((c) => serializeBlockChild(c, childIndent))
    .filter((s) => s.length > 0);

  return `${indent}<${node.tag}${openAttrs}>\n${lines.join('\n')}\n${indent}</${node.tag}>`;
}

function serializeInlineChild(child: VNodeChild): string {
  if (typeof child === 'string') return escapeXml(child);
  if (isRawText(child)) return child.raw;
  // Inline VNode (tspan inside text).
  const attrs = formatAttrs(child.attrs);
  const inner = child.children.map((c) => serializeInlineChild(c)).join('');
  if (inner.length === 0) return `<${child.tag}${attrs}/>`;
  return `<${child.tag}${attrs}>${inner}</${child.tag}>`;
}

function serializeBlockChild(child: VNodeChild, indent: string): string {
  if (typeof child === 'string') return indent + escapeXml(child);
  if (isRawText(child)) return child.raw;
  if (UNWRAP_TAGS.has(child.tag)) {
    // Synthetic wrapper (e.g. multi-text TextLayer): emit its children at
    // the parent's child indent, never the wrapper itself. Without this,
    // grouped text layers serialize as literal `<__text-siblings__>` tags
    // and the browser silently drops the wrapped <text> elements.
    return child.children
      .filter((c): c is VNode => isVNode(c))
      .map((c) => serializeNode(c, indent))
      .join('\n');
  }
  return serializeNode(child, indent);
}

/**
 * Serialize `<style>` with raw CDATA content. The child is a RawText whose
 * `.raw` begins with `<![CDATA[` and ends with `]]>`; we emit it verbatim.
 */
function serializeStyleElement(node: VNode): string {
  const attrs = formatAttrs(node.attrs);
  const inner = node.children
    .map((c) => (isRawText(c) ? c.raw : typeof c === 'string' ? escapeXml(c) : ''))
    .join('');
  return `<${node.tag}${attrs}>${inner}</${node.tag}>`;
}

/**
 * Serialize an element whose only meaningful child is a RawText (e.g. the
 * metadata `<script>` block). No indent, no escape.
 */
function serializeRawOnlyElement(node: VNode): string {
  const attrs = formatAttrs(node.attrs);
  const inner = node.children
    .map((c) => (isRawText(c) ? c.raw : ''))
    .join('');
  return `<${node.tag}${attrs}>${inner}</${node.tag}>`;
}

function formatAttrs(attrs: Record<string, string>): string {
  const entries = Object.entries(attrs);
  if (entries.length === 0) return '';
  return ' ' + entries.map(([k, v]) => `${k}="${escapeXml(v)}"`).join(' ');
}

export function escapeXml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
