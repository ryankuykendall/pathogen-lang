/**
 * Security: SVGDocumentFragment sanitizer tests.
 *
 * Asserts that user-supplied fragment markup cannot smuggle through any of the
 * SVG-borne attack vectors catalogued in
 * project-docs/security/svg-attack-fixtures.md (rows F1–F7).
 *
 * Tests fail today for F1, F2, F3, F4, F5, F6, F7 — Phase 2 closes them.
 */

import { describe, expect, it } from 'vitest';

import { compile } from '../../src';
import { sanitizeSVGFragment } from '../../src/evaluator/svg-sanitize';

// Wrap in `let f = ...; f.insert();` so the only failure point is the
// sanitizer itself. A bare `SVGDocumentFragment(...);` expression statement
// would throw "did not return a valid path value" regardless of payload —
// which makes a naive expect(...).toThrow() pass even when the sanitizer
// accepts the malicious fragment.
function expectFragmentRejected(fragmentSource: string): void {
  expect(() =>
    compile(`let f = SVGDocumentFragment(\`${fragmentSource}\`); f.insert();`),
  ).toThrow();
}

describe('Security · SVGDocumentFragment sanitizer', () => {
  // ── Pre-existing protections (F1 baseline) ─────────────────────────────

  describe('baseline: existing rejections (regression guard)', () => {
    it('rejects <script> elements', () => {
      expectFragmentRejected('<script>alert(1)</script>');
    });

    it('rejects on* event handler attributes', () => {
      expectFragmentRejected('<rect onclick="alert(1)" width="10" height="10"/>');
    });

    it('rejects malformed (mismatched) tags', () => {
      expectFragmentRejected('<g><rect/></text>');
    });
  });

  // ── F1: <foreignObject> with HTML ─────────────────────────────────────

  describe('F1: <foreignObject> blocked', () => {
    it('rejects <foreignObject> outright', () => {
      expectFragmentRejected(
        "<foreignObject><div xmlns='http://www.w3.org/1999/xhtml'>x</div></foreignObject>",
      );
    });

    it('rejects <foreignObject> even when self-closing', () => {
      expectFragmentRejected('<foreignObject/>');
    });

    it('rejects nested <foreignObject>', () => {
      expectFragmentRejected('<g><foreignObject><div>x</div></foreignObject></g>');
    });
  });

  // ── F2: <a xlink:href="javascript:"> ──────────────────────────────────

  describe('F2: <a> blocked entirely', () => {
    it('rejects <a> with javascript: href', () => {
      expectFragmentRejected('<a xlink:href="javascript:alert(1)"><circle r="10"/></a>');
    });

    it('rejects <a> even with safe-looking href', () => {
      expectFragmentRejected('<a xlink:href="#safe"><circle r="10"/></a>');
    });
  });

  // ── F3: <animate attributeName="href"> ────────────────────────────────

  describe('F3: animation elements blocked', () => {
    it('rejects <animate>', () => {
      expectFragmentRejected(
        '<image href="#x"><animate attributeName="href" to="javascript:alert(1)"/></image>',
      );
    });

    it('rejects <animateTransform>', () => {
      expectFragmentRejected(
        '<rect><animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="9999s"/></rect>',
      );
    });

    it('rejects <animateMotion>', () => {
      expectFragmentRejected('<rect><animateMotion path="M 0 0"/></rect>');
    });

    it('rejects <set>', () => {
      expectFragmentRejected('<rect><set attributeName="href" to="javascript:alert(1)"/></rect>');
    });
  });

  // ── F4: <image href="https://..."> ────────────────────────────────────

  describe('F4: href protocol allow-list', () => {
    it('rejects <image href="https://...">', () => {
      expectFragmentRejected('<image href="https://evil.example/log"/>');
    });

    it('rejects <image href="http://...">', () => {
      expectFragmentRejected('<image href="http://evil.example/log"/>');
    });

    it('rejects <image xlink:href="//protocol-relative">', () => {
      expectFragmentRejected('<image xlink:href="//evil.example/log"/>');
    });

    it('rejects javascript: href on any element', () => {
      expectFragmentRejected('<image href="javascript:alert(1)"/>');
    });

    it('rejects data:text/html href', () => {
      expectFragmentRejected('<image href="data:text/html,<script>alert(1)</script>"/>');
    });

    it('accepts <image href="#frag"> (local fragment)', () => {
      expect(() =>
        compile(`
          let f = SVGDocumentFragment(\`<image href="#localPattern"/>\`);
          f.insert();
        `),
      ).not.toThrow();
    });

    it('accepts <image href="data:image/png;base64,...">', () => {
      expect(() =>
        compile(`
          let f = SVGDocumentFragment(\`<image href="data:image/png;base64,iVBORw0KGgo="/>\`);
          f.insert();
        `),
      ).not.toThrow();
    });
  });

  // ── F5: inline style="..." rejected ───────────────────────────────────

  describe('F5: inline style attribute blocked', () => {
    it('rejects style="..." on any element', () => {
      expectFragmentRejected('<rect style="background:url(https://evil.example/log)"/>');
    });

    it('rejects even benign-looking style="..."', () => {
      expectFragmentRejected('<rect style="fill: red"/>');
    });
  });

  // ── F6: <style> block rejected ────────────────────────────────────────

  describe('F6: <style> element blocked', () => {
    it('rejects <style>', () => {
      expectFragmentRejected('<style>* { background: url(https://evil.example/log); }</style>');
    });

    it('rejects <style> with @import', () => {
      expectFragmentRejected('<style>@import url(https://evil.example/log);</style>');
    });
  });

  // ── F7: <use href="javascript:"> ──────────────────────────────────────

  describe('F7: <use href> protocol allow-list', () => {
    it('rejects <use href="javascript:">', () => {
      expectFragmentRejected('<use href="javascript:alert(1)"/>');
    });

    it('rejects <use href="https://...">', () => {
      expectFragmentRejected('<use href="https://evil.example/x.svg#sym"/>');
    });

    it('accepts <use href="#localSymbol">', () => {
      expect(() =>
        compile(`
          let frag = SVGDocumentFragment(\`
            <defs><symbol id="s"><circle r="5"/></symbol></defs>
            <use href="#s"/>
          \`);
          frag.insert();
        `),
      ).not.toThrow();
    });
  });

  // ── F8: markup-by-regex parsing bypasses (Phase 2 cursor tokenizer) ────
  // The regex tag scanner ([^>]*? truncation, \bon\w+= word-boundary miss,
  // silent skip of non-tag `<`) let malformed markup smuggle through. The
  // first two rows below were CONFIRMED bypasses of the regex implementation;
  // the cursor tokenizer closes them and rejects every inert construct.

  describe('F8: quote-aware attribute scanning', () => {
    it('rejects a javascript: href hidden behind a quoted ">" (attr-truncation bypass)', () => {
      // TAG_RE stopped the attr block at the > inside title="a>b", so the
      // javascript: href was never seen by validateHrefValue — a real bypass.
      expectFragmentRejected('<use title="a>b" href="javascript:alert(1)"/>');
    });

    it('rejects an on* attribute whose name is split by a newline', () => {
      // \bon\w+= never matched `on\nclick=`; the tokenizer reads the whole
      // attribute name structurally.
      expectFragmentRejected('<rect on\nclick="alert(1)" width="10" height="10"/>');
    });

    it('rejects an unterminated quoted attribute (silently skipped by the regex)', () => {
      expectFragmentRejected('<rect title="abc');
    });

    it('rejects an unquoted javascript: href', () => {
      expectFragmentRejected('<use href=javascript:alert(1) />');
    });

    it('still rejects unquoted on* attribute values (regression guard)', () => {
      expectFragmentRejected('<rect width=10 onclick=alert(1)/>');
    });

    it('still rejects mixed-case blocked elements (regression guard)', () => {
      expectFragmentRejected('<ScRiPt>x</ScRiPt>');
    });

    it('still rejects javascript: href with leading whitespace (regression guard)', () => {
      expectFragmentRejected('<use href=" javascript:alert(1)"/>');
    });
  });

  describe('F8: inert constructs rejected outright', () => {
    it('rejects XML comments', () => {
      expectFragmentRejected('<!-- note --><rect width="5"/>');
    });

    it('rejects a blocked element hidden inside a comment', () => {
      expectFragmentRejected('<!-- <script>x</script> --><rect/>');
    });

    it('rejects an unterminated comment', () => {
      expectFragmentRejected('<!-- never closed <rect/>');
    });

    it('rejects CDATA sections', () => {
      expectFragmentRejected('<![CDATA[hello]]><rect/>');
    });

    it('rejects DOCTYPE declarations', () => {
      expectFragmentRejected('<!DOCTYPE svg><rect/>');
    });

    it('rejects processing instructions', () => {
      expectFragmentRejected('<?xml version="1.0"?><rect/>');
    });

    it('rejects a stray "<" in text content (XML-invalid)', () => {
      expectFragmentRejected('<text>a < b</text>');
    });
  });

  describe('F8: range-based defs separation', () => {
    it('separates a <defs> block with attributes from visual content', () => {
      const r = sanitizeSVGFragment('<defs id="d"><marker id="m"><path d="M 0 0"/></marker></defs><circle r="5"/>');
      expect(r.defsContent).toBe('<marker id="m"><path d="M 0 0"/></marker>');
      expect(r.visualContent).toBe('<circle r="5"/>');
    });

    it('does not mis-split on a </defs> string inside an attribute value', () => {
      // The old defsRe closed at the FIRST literal </defs>, even inside a
      // quoted attribute. Range-based slicing uses the tokenizer close pos.
      const r = sanitizeSVGFragment('<defs><rect id="a" data-x="</defs>"/></defs><circle r="5"/>');
      expect(r.defsContent).toBe('<rect id="a" data-x="</defs>"/>');
      expect(r.visualContent).toBe('<circle r="5"/>');
    });

    it('merges multiple top-level defs blocks', () => {
      const r = sanitizeSVGFragment(
        '<defs><marker id="a"><path d="M 0 0"/></marker></defs><rect width="1" height="1"/>' +
          '<defs><marker id="b"><path d="M 1 1"/></marker></defs>',
      );
      expect(r.defsContent).toBe(
        '<marker id="a"><path d="M 0 0"/></marker>\n<marker id="b"><path d="M 1 1"/></marker>',
      );
      expect(r.visualContent).toBe('<rect width="1" height="1"/>');
    });

    it('does not carve inner content from inside a >-bearing attribute on the <defs> tag', () => {
      // A `>` inside the defs opening tag's own quoted attribute must NOT be
      // treated as the tag close. Inner-content bounds come from the
      // tokenizer's quote-aware positions, so the smuggled <image onerror>
      // stays inert quoted text — only the real child <rect/> is extracted.
      const payload = '<defs id="x><image onerror=\'alert(1)\' src=\'x\'/>"><rect/></defs><circle r="1"/>';
      const r = sanitizeSVGFragment(payload);
      expect(r.defsContent).toBe('<rect/>');
      expect(r.visualContent).toBe('<circle r="1"/>');
      expect(r.defsContent).not.toContain('onerror');
    });

    it('neutralizes the same attribute-smuggle end-to-end (no onerror in compiled output)', () => {
      const result = compile(
        'let f = SVGDocumentFragment(`<defs id="x><image onerror=\'alert(1)\' src=\'x\'/>"><rect/></defs><circle r="1"/>`); f.insert();',
      );
      const frag = result.layers.find((l) => l.type === 'fragment');
      expect(frag?.fragmentDefs).toBe('<rect/>');
      expect(frag?.fragmentDefs).not.toContain('onerror');
      expect(frag?.fragmentVisuals).not.toContain('onerror');
    });
  });

  describe('F8: namespace-prefixed href aliasing', () => {
    it('validates a javascript: href behind a custom xlink-bound prefix', () => {
      // x:href bound to the XLink namespace resolves like xlink:href in every
      // namespace-aware consumer; matching only the literal "xlink:href" would
      // let this skip the allow-list.
      expectFragmentRejected(
        '<image xmlns:evil="http://www.w3.org/1999/xlink" evil:href="javascript:alert(1)"/>',
      );
    });

    it('validates a remote href behind a custom prefix', () => {
      expectFragmentRejected(
        '<image xmlns:x="http://www.w3.org/1999/xlink" x:href="https://evil.example/exfil"/>',
      );
    });

    it('still accepts a custom-prefixed href pointing at a local fragment', () => {
      expect(() =>
        compile(
          'let f = SVGDocumentFragment(`<use xmlns:x="http://www.w3.org/1999/xlink" x:href="#s"/>`); f.insert();',
        ),
      ).not.toThrow();
    });
  });
});
