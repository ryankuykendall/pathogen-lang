/**
 * Parse a stored snapshot SVG into an inert, script-free <svg> element that
 * is safe to place in the app document (the Export dialog renders and
 * serializes it there).
 *
 * The API stores snapshot SVG as uploaded and does not sanitize it (it
 * serves it with a script-blocking CSP instead). Snapshots are owner-only,
 * so the worst case is self-inflicted — still, nothing parsed from storage
 * gets to run in the app's origin. Parsing happens in a DOMParser document
 * (inert: no scripts, no loads), then everything able to execute or navigate
 * is removed before the node is imported:
 *   - <script>, <foreignObject>, <iframe>, <object>, <embed>, <audio>,
 *     <video>, and <animate>/<set> that target href attributes
 *   - every on* event-handler attribute
 *   - href / xlink:href values other than same-document fragments and
 *     data:image/* URIs (this is what neutralizes an external <use>)
 *   - @import rules and url(…) references to anything but fragments and
 *     data: URIs, in <style> text and style="" attributes (no fetches)
 */

const DROP_ELEMENTS = new Set(['script', 'foreignobject', 'iframe', 'object', 'embed', 'audio', 'video']);
const ANIMATION_ELEMENTS = new Set(['animate', 'set', 'animatetransform', 'animatemotion']);

// url(...) whose target isn't a same-document fragment or a data: URI.
const EXTERNAL_URL = /url\(\s*(?!['"]?\s*(?:#|data:))[^)]*\)/gi;
const IMPORT_RULE = /@import[^;]*;?/gi;

function stripExternalRefs(css: string): string {
  return css.replace(IMPORT_RULE, '').replace(EXTERNAL_URL, 'none');
}

function isSafeHref(value: string): boolean {
  const v = value.trim().toLowerCase();
  return v.startsWith('#') || v.startsWith('data:image/');
}

export function parseSnapshotSvg(svgText: string, doc: Document = document): SVGSVGElement {
  const parsed = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  const root = parsed.documentElement;
  if (root.nodeName.toLowerCase() !== 'svg' || parsed.querySelector('parsererror')) {
    throw new Error('The stored snapshot is not a valid SVG document');
  }

  const all = [root, ...Array.from(root.querySelectorAll('*'))];
  for (const el of all) {
    const name = el.localName.toLowerCase();
    if (DROP_ELEMENTS.has(name)) {
      el.remove();
      continue;
    }
    if (name === 'style') {
      el.textContent = stripExternalRefs(el.textContent ?? '');
    }
    if (ANIMATION_ELEMENTS.has(name)) {
      const target = (el.getAttribute('attributeName') || '').toLowerCase();
      if (target.endsWith('href')) {
        el.remove();
        continue;
      }
    }
    for (const attr of Array.from(el.attributes)) {
      const attrName = attr.name.toLowerCase();
      if (attrName.startsWith('on')) {
        el.removeAttribute(attr.name);
      } else if ((attrName === 'href' || attrName.endsWith(':href')) && !isSafeHref(attr.value)) {
        el.removeAttributeNode(attr);
      } else if (attrName === 'style') {
        attr.value = stripExternalRefs(attr.value);
      }
    }
  }
  return doc.importNode(root, true) as unknown as SVGSVGElement;
}
