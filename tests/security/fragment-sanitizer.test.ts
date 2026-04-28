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
});
