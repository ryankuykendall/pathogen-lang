/**
 * Mount a VNode (or VNode[]) into a live DOM element via `createElementNS`.
 *
 * This is the DOM-side adapter counterpart to `serialize.ts`. The same tree
 * is consumed by both; this adapter produces interactive DOM for the
 * playground preview pane (and, post-Phase-5, the VS Code preview webview).
 *
 * Synthetic tags invented by the builders are unwrapped:
 *   - `__text-siblings__` → children are appended directly (no wrapper element).
 *   - `__fragment__` → raw-SVG children are parsed and appended.
 *
 * This adapter is NOT responsible for clearing the target element; callers
 * handle cleanup (by `data-*-def` attribute in the playground, by class in
 * VS Code).
 */

import { isRawText, isVNode, type VNode, type VNodeChild } from './types';

const SVG_NS = 'http://www.w3.org/2000/svg';

const UNWRAP_TAGS = new Set(['__text-siblings__']);
const FRAGMENT_TAG = '__fragment__';

export function mountInto(parent: Element, vnodes: VNode | VNode[]): void {
  const list = Array.isArray(vnodes) ? vnodes : [vnodes];
  for (const vnode of list) {
    appendVNode(parent, vnode);
  }
}

function appendVNode(parent: Element, vnode: VNode): void {
  if (UNWRAP_TAGS.has(vnode.tag)) {
    // Unwrap: append each child directly to the parent.
    for (const child of vnode.children) {
      if (isVNode(child)) appendVNode(parent, child);
      else if (isRawText(child)) appendRawSvg(parent, child.raw);
      else parent.appendChild(parent.ownerDocument!.createTextNode(child));
    }
    return;
  }

  if (vnode.tag === FRAGMENT_TAG) {
    // Pre-rendered SVG string. Parse and append each top-level node.
    for (const child of vnode.children) {
      if (isRawText(child) && child.raw.length > 0) {
        appendRawSvg(parent, child.raw);
      }
    }
    return;
  }

  const el = parent.ownerDocument!.createElementNS(SVG_NS, vnode.tag);
  for (const [k, v] of Object.entries(vnode.attrs)) {
    el.setAttribute(k, v);
  }
  appendChildren(el, vnode.children);
  parent.appendChild(el);
}

function appendChildren(parent: Element, children: VNodeChild[]): void {
  for (const child of children) {
    if (typeof child === 'string') {
      parent.appendChild(parent.ownerDocument!.createTextNode(child));
    } else if (isRawText(child)) {
      appendRawSvg(parent, child.raw);
    } else {
      appendVNode(parent, child);
    }
  }
}

/**
 * Parse a raw SVG string and append its top-level nodes to `parent`.
 * Used for fragment layers (pre-rendered SVG content) and CDATA-wrapped
 * `<style>` / `<script>` content.
 *
 * The browser's DOMParser is used when available. In non-browser environments
 * (jsdom, Happy DOM) the same API is provided by the environment.
 */
function appendRawSvg(parent: Element, rawContent: string): void {
  const doc = parent.ownerDocument!;
  // DOMParser works for full SVG fragments wrapped in <svg> root. For arbitrary
  // inner content we wrap in a synthetic root so all siblings come back.
  const wrapped = `<svg xmlns="${SVG_NS}">${rawContent}</svg>`;
  const parser = new (globalThis as typeof globalThis & { DOMParser: typeof DOMParser }).DOMParser();
  const parsed = parser.parseFromString(wrapped, 'image/svg+xml');
  const root = parsed.documentElement;
  if (!root) return;
  // Import each top-level child (skipping text nodes that are pure whitespace).
  for (const child of Array.from(root.childNodes)) {
    if (child.nodeType === 3 /* TEXT_NODE */ && (child.nodeValue ?? '').trim() === '') continue;
    parent.appendChild(doc.importNode(child, true));
  }
}
