// @vitest-environment jsdom

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { compile } from '../src';
import { buildSvgTree, mountInto, toSvgString } from '../src/render';

const FIXTURES_DIR = join(
  __dirname,
  '..',
  'project-docs',
  'render-pipeline-unification',
  'snapshots',
);

const fixtures = readdirSync(FIXTURES_DIR)
  .filter((name) => name.endsWith('.pathogen'))
  .sort();

const options = {
  viewBox: '0 0 200 200',
  width: '200',
  height: '200',
};

describe('Render-channel parity: toSvgString ↔ mountInto', () => {
  for (const fixture of fixtures) {
    const name = fixture.replace(/\.pathogen$/, '');

    it(`structural equivalence: ${name}`, () => {
      const source = readFileSync(join(FIXTURES_DIR, fixture), 'utf-8');
      const result = compile(source);
      const tree = buildSvgTree(result, options);

      // Adapter A: string serialization. Parse back into a DOM.
      const svgString = toSvgString(tree);
      const parser = new DOMParser();
      const stringDoc = parser.parseFromString(svgString, 'image/svg+xml');
      const stringRoot = stringDoc.documentElement;

      // Adapter B: live DOM mounting. Build a detached <svg>, mount the
      // tree's children into it, use outerHTML to get a comparable node.
      const mountedRoot = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      for (const [k, v] of Object.entries(tree.attrs)) {
        mountedRoot.setAttribute(k, v);
      }
      mountInto(mountedRoot, tree.children.filter((c): c is typeof tree => typeof c === 'object' && 'tag' in c));

      // Structural equality: same tag, same attributes (as a set), same
      // children order.
      assertStructurallyEqual(stringRoot, mountedRoot, name);
    });
  }
});

function assertStructurallyEqual(a: Element, b: Element, context: string): void {
  const trail = [context];
  equalNode(a, b, trail);
}

function equalNode(a: Node, b: Node, trail: string[]): void {
  const label = trail.join(' > ');

  if (a.nodeType !== b.nodeType) {
    throw new Error(`${label}: node types differ (${a.nodeType} vs ${b.nodeType})`);
  }

  if (a.nodeType === 3 /* TEXT_NODE */) {
    const aText = (a.nodeValue ?? '').replace(/\s+/g, ' ').trim();
    const bText = (b.nodeValue ?? '').replace(/\s+/g, ' ').trim();
    if (aText !== bText) {
      throw new Error(`${label}: text content differs:\n  A: ${JSON.stringify(aText)}\n  B: ${JSON.stringify(bText)}`);
    }
    return;
  }

  if (a.nodeType !== 1 /* ELEMENT_NODE */) return;

  const ae = a as Element;
  const be = b as Element;
  if (ae.tagName.toLowerCase() !== be.tagName.toLowerCase()) {
    throw new Error(`${label}: tag differs (${ae.tagName} vs ${be.tagName})`);
  }

  // Compare attributes as unordered sets.
  const aAttrs = attrMap(ae);
  const bAttrs = attrMap(be);
  const keys = new Set([...Object.keys(aAttrs), ...Object.keys(bAttrs)]);
  for (const k of keys) {
    if (aAttrs[k] !== bAttrs[k]) {
      throw new Error(
        `${label} <${ae.tagName}>: attr "${k}" differs:\n  A: ${JSON.stringify(aAttrs[k])}\n  B: ${JSON.stringify(bAttrs[k])}`,
      );
    }
  }

  // Compare child lists, skipping whitespace-only text nodes.
  const aChildren = meaningfulChildren(ae);
  const bChildren = meaningfulChildren(be);
  if (aChildren.length !== bChildren.length) {
    throw new Error(
      `${label} <${ae.tagName}>: child count differs (${aChildren.length} vs ${bChildren.length})\n  A tags: ${aChildren.map(describeNode).join(', ')}\n  B tags: ${bChildren.map(describeNode).join(', ')}`,
    );
  }
  for (let i = 0; i < aChildren.length; i++) {
    const childTrail = [...trail, `<${ae.tagName.toLowerCase()}>[${i}:${describeNode(aChildren[i])}]`];
    equalNode(aChildren[i], bChildren[i], childTrail);
  }
}

function attrMap(el: Element): Record<string, string> {
  const out: Record<string, string> = {};
  for (const attr of Array.from(el.attributes)) {
    // Strip XLink namespace so href emitted via setAttributeNS and setAttribute both land.
    const name = attr.name.startsWith('xlink:') ? 'href' : attr.name;
    out[name] = attr.value;
  }
  return out;
}

function meaningfulChildren(el: Element): Node[] {
  return Array.from(el.childNodes).filter((n) => {
    if (n.nodeType === 3 /* TEXT_NODE */) {
      return (n.nodeValue ?? '').trim().length > 0;
    }
    return n.nodeType === 1 /* ELEMENT_NODE */;
  });
}

function describeNode(n: Node): string {
  if (n.nodeType === 1) {
    const el = n as Element;
    const id = el.getAttribute('id');
    return id ? `${el.tagName.toLowerCase()}#${id}` : el.tagName.toLowerCase();
  }
  return 'text';
}
