// CodeMirror 6 extension: recolor variable REFERENCES inside style-block
// values back to the editor's variable color.
//
// The inner style grammar colors bare value identifiers as CSS values
// (whiskey orange in oneDark) because, without scope info, `middle` and
// `glyphFontColor` are the same token. Scope analysis knows the difference —
// this extension marks every style-value identifier that resolves to a user
// declaration with `.cm-style-var-ref`, restoring the variable color (oneDark
// coral; default text color in light, matching outer variable references).
//
// Ranges come from the shared scope-cache memo (one analyzeScopes per doc
// change, shared with the color-chip extension).

import { getStyleRefRanges } from './scope-cache.js';

/** CodeMirror @codemirror/view module — loaded from ESM CDN, typed loosely. */
type CMViewModule = any;

export function styleRefRecolorExtension(cmViewModule: CMViewModule): any[] {
  const { ViewPlugin, Decoration, EditorView } = cmViewModule;

  const refMark = Decoration.mark({ class: 'cm-style-var-ref' });

  function buildDecorations(view: any): any {
    const source = view.state.doc.toString();
    const ranges = getStyleRefRanges(source);
    return Decoration.set(
      ranges.map((r) => refMark.range(r.from, r.to)),
      true,
    );
  }

  const plugin = ViewPlugin.fromClass(
    class {
      decorations: any;
      constructor(view: any) {
        this.decorations = buildDecorations(view);
      }
      update(update: any): void {
        if (update.docChanged || update.viewportChanged) {
          this.decorations = buildDecorations(update.view);
        }
      }
    },
    { decorations: (v: any) => v.decorations },
  );

  // Theme-scoped selectors (scope class + descendant) out-rank the single-
  // class syntax-highlight rules, so no !important is needed.
  //
  // CRITICAL: the `span` descendant selectors are load-bearing. CodeMirror
  // NESTS the syntax-highlight span INSIDE the mark span —
  //   <span class="cm-style-var-ref"><span class="ͼx">name</span></span>
  // — so the glyphs are painted by the inner span's color, not the mark's.
  // Styling only `.cm-style-var-ref` makes getComputedStyle on the mark
  // report the new color while the rendered text keeps the old one (found
  // 2026-07-26 via Ryan's side-by-side color-literal calibration after every
  // wrapper-level measurement claimed the recolor worked).
  const theme = EditorView.baseTheme({
    '&dark .cm-style-var-ref': { color: '#e06c75' },
    '&dark .cm-style-var-ref span': { color: '#e06c75' },
    '&light .cm-style-var-ref': { color: 'inherit' },
    '&light .cm-style-var-ref span': { color: 'inherit' },
  });

  return [plugin, theme];
}
