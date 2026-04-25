// CodeMirror 6 completion bridge — wraps the shared language-services
// getCompletions function for use as a CodeMirror completion source.
//
// This replaces the bulk of codemirror-setup.ts's svgPathCompletions function
// with the shared completion engine that's also used by the VS Code extension.

/** CodeMirror CompletionContext — the object passed to completion source functions. */
interface CompletionContext {
  state: { doc: { toString(): string } };
  pos: number;
  explicit: boolean;
  matchBefore(regexp: RegExp): { from: number; to: number; text: string } | null;
}

/** CodeMirror CompletionResult — what a completion source returns. */
interface CompletionResult {
  from: number;
  options: Array<{
    label: string;
    type: string;
    info?: string;
    detail?: string;
    boost?: number;
    apply?: (view: unknown, completion: unknown, from: number, to: number) => void;
  }>;
  validFor?: RegExp;
}

/**
 * Create a CodeMirror completion source backed by the shared language-services
 * getCompletions function.
 *
 * This provides: keywords, stdlib functions, scope-aware user definitions,
 * member access completions, style block property completions — all from
 * the shared engine.
 */
export function sharedCompletionSource(context: CompletionContext): CompletionResult | null {
  const { StringTextDocument, getCompletions } = window.SvgPathExtended;

  if (!getCompletions || !StringTextDocument) {
    return null;
  }

  // Find the word being typed. `[@&$\w.]*` captures plain identifiers
  // (`cir`), member-access prefixes (`bg.app`), and leading-symbol prefixes
  // (`@font`, `&{`, `$`) that surface block-start and declaration snippets.
  // We reject zero-length non-explicit matches so that punctuation keystrokes
  // (e.g. `;`) don't trigger the completion popup for no reason.
  const word = context.matchBefore(/[@&$\w.]*/);
  if (!word || (word.from === word.to && !context.explicit)) return null;

  const source = context.state.doc.toString();
  const doc = new StringTextDocument(source);

  // Convert CM offset to language-services Position
  const lines = source.slice(0, context.pos).split('\n');
  const line = lines.length - 1;
  const character = lines[lines.length - 1].length;

  const items = getCompletions(doc, { line, character });
  if (items.length === 0) return null;

  // The `from` position controls which span of text CodeMirror's filter
  // matches option labels against. If the word the user is typing includes
  // a `.` (member access), the completion replaces only the text AFTER the
  // last dot — that's the member prefix — not the whole `object.prefix`.
  // Without this, CM6 would try to fuzzy-match option labels like `apply`
  // against `bg.` and filter them all out, leaving the popup empty.
  const lastDot = word.text.lastIndexOf('.');
  const from = lastDot >= 0 ? word.from + lastDot + 1 : word.from;

  return {
    from,
    options: items.map((item) => ({
      label: item.label,
      type: mapCompletionKind(item.kind),
      detail: item.detail,
      boost: parseBoost(item.sortText),
      // For snippets, provide an apply function that inserts the template
      // text with the cursor placed at the `$0` marker (final cursor
      // position in VS Code snippet syntax). Named placeholders like
      // `${1:name}` are replaced with their default text; bare markers
      // like `$1` are removed.
      ...(item.isSnippet && item.insertText ? {
        apply: (view: any, _completion: any, from: number, to: number) => {
          const template = item.insertText!;
          // Locate the $0 cursor marker BEFORE stripping placeholders.
          const cursorMarkerIdx = template.indexOf('$0');
          // Strip placeholders: ${1:name} → name, $0/$1/etc. → ''
          const stripped = template
            .replace(/\$\{\d+:([^}]*)\}/g, '$1')
            .replace(/\$\d+/g, '');
          // Compute cursor position: if $0 exists, count how many
          // characters precede it after stripping everything before it.
          let cursorPos: number;
          if (cursorMarkerIdx >= 0) {
            const beforeMarker = template.slice(0, cursorMarkerIdx)
              .replace(/\$\{\d+:([^}]*)\}/g, '$1')
              .replace(/\$\d+/g, '');
            cursorPos = from + beforeMarker.length;
          } else {
            cursorPos = from + stripped.length;
          }
          // Detect the current line's indentation so the inserted block
          // matches the surrounding code.
          const doc = view.state.doc.toString();
          const lineStart = doc.lastIndexOf('\n', from - 1) + 1;
          const lineText = doc.slice(lineStart, from);
          const baseIndent = lineText.match(/^(\s*)/)?.[1] ?? '';
          // Re-indent non-first lines of the snippet.
          const indented = stripped.replace(/\n/g, '\n' + baseIndent);
          // Adjust cursor for any indent added before the cursor line.
          const newlinesBefore = stripped.slice(0, cursorPos - from).split('\n').length - 1;
          const adjustedCursor = cursorPos + newlinesBefore * baseIndent.length;
          view.dispatch({
            changes: { from, to, insert: indented },
            selection: { anchor: adjustedCursor },
          });
        },
      } : {}),
    })),
    validFor: /^[@&$\w.]*$/,
  };
}

/** Map our completion kind strings to CodeMirror completion types. */
function mapCompletionKind(kind: string): string {
  switch (kind) {
    case 'function': return 'function';
    case 'variable': return 'variable';
    case 'keyword': return 'keyword';
    case 'property': return 'property';
    case 'constant': return 'constant';
    case 'snippet': return 'keyword';
    default: return 'text';
  }
}

/** Extract numeric boost from sortText (our format: 2-digit inverted prefix). */
function parseBoost(sortText: string): number {
  const prefix = parseInt(sortText.slice(0, 2), 10);
  if (isNaN(prefix)) return 0;
  return 99 - prefix; // Invert back to boost
}
