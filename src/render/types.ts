/**
 * Minimal VNode type for the shared SVG renderer.
 *
 * Deliberately small: no keys, no diffing, no lifecycle. This is a one-shot
 * tree built from a `CompileResult` and consumed by exactly two adapters:
 *
 * - `serialize.ts` — emits an SVG string (CLI, VS Code webview pre-Phase-5)
 * - `mount.ts` — injects into live DOM via `createElementNS` (playground,
 *   VS Code webview post-Phase-5)
 *
 * Attribute insertion order matters for byte identity with the pre-refactor
 * CLI output. Builders must insert attributes in the order the existing
 * `src/svg-generator.ts` emits them.
 */

/** An element child can be another VNode, plain text (XML-escaped), or
 *  a raw string that bypasses escaping (used for pre-rendered fragment SVG
 *  and for CDATA-wrapped <style> content).
 */
export type VNodeChild = VNode | string | RawText;

export interface VNode {
  tag: string;
  attrs: Record<string, string>;
  children: VNodeChild[];
}

/** Marker object for children that must be emitted verbatim (no XML escape). */
export interface RawText {
  raw: string;
}

export function isVNode(child: VNodeChild): child is VNode {
  return typeof child === 'object' && child !== null && 'tag' in child;
}

export function isRawText(child: VNodeChild): child is RawText {
  return typeof child === 'object' && child !== null && 'raw' in child;
}

/** Convenience factory; keeps builder code compact. */
export function h(tag: string, attrs: Record<string, string> = {}, children: VNodeChild[] = []): VNode {
  return { tag, attrs, children };
}

/** Raw-text helper for children that must not be XML-escaped. */
export function raw(content: string): RawText {
  return { raw: content };
}
