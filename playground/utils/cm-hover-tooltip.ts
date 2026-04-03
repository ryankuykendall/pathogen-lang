// CodeMirror 6 hover tooltip extension — shows language intelligence on hover
// Uses the shared getHoverInfo from svg-path-extended language services.

/**
 * Minimal interface for the CodeMirror view module we need.
 * The actual module is loaded dynamically from ESM CDN.
 */
interface CmViewModule {
  hoverTooltip(
    source: (view: CmEditorView, pos: number, side: number) => HoverTooltipResult | null | Promise<HoverTooltipResult | null>,
    options?: { hideOnChange?: boolean },
  ): unknown; // Extension
}

interface CmEditorView {
  state: {
    doc: {
      toString(): string;
      lineAt(pos: number): { number: number; from: number };
    };
  };
}

interface HoverTooltipResult {
  pos: number;
  end?: number;
  above?: boolean;
  create(view: CmEditorView): { dom: HTMLElement };
}

/**
 * Create a CodeMirror hoverTooltip extension that uses the shared
 * language-services getHoverInfo function.
 *
 * @param cmView — The `@codemirror/view` module (dynamically imported)
 * @returns An array of CodeMirror extensions to include in the editor state
 */
export function hoverTooltipExtension(cmView: CmViewModule): unknown[] {
  const { StringTextDocument, getHoverInfo } = window.SvgPathExtended;

  if (!getHoverInfo || !StringTextDocument) {
    console.warn('Language services not available — hover tooltips disabled');
    return [];
  }

  const tooltip = cmView.hoverTooltip(
    (view: CmEditorView, pos: number, _side: number) => {
      const source = view.state.doc.toString();
      const doc = new StringTextDocument(source);

      // Convert CM offset to language-services Position
      const lineInfo = view.state.doc.lineAt(pos);
      const line = lineInfo.number - 1; // CM lines are 1-based, LS is 0-based
      const character = pos - lineInfo.from;

      const info = getHoverInfo(doc, { line, character });
      if (!info) return null;

      // Calculate the start offset for tooltip positioning
      let tooltipPos = pos;
      let tooltipEnd: number | undefined;

      if (info.range) {
        // Convert LS range back to CM offsets
        const lines = source.split('\n');
        tooltipPos = offsetFromPosition(lines, info.range.start);
        tooltipEnd = offsetFromPosition(lines, info.range.end);
      }

      return {
        pos: tooltipPos,
        end: tooltipEnd,
        above: true,
        create() {
          const dom = document.createElement('div');
          dom.className = 'cm-hover-tooltip';
          dom.innerHTML = renderMarkdown(info.contents);
          return { dom };
        },
      };
    },
    { hideOnChange: true },
  );

  return [tooltip];
}

/**
 * Convert a 0-based Position to a character offset in the source.
 */
function offsetFromPosition(lines: string[], pos: { line: number; character: number }): number {
  let offset = 0;
  for (let i = 0; i < pos.line && i < lines.length; i++) {
    offset += lines[i].length + 1; // +1 for newline
  }
  return offset + pos.character;
}

/**
 * Minimal Markdown-to-HTML rendering for hover content.
 * Handles: **bold**, `code`, ```code blocks```, newlines.
 */
function renderMarkdown(md: string): string {
  return md
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\n\n/g, '<br><br>')
    .replace(/\n/g, '<br>');
}
