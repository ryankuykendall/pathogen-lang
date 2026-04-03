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

  // Find the word being typed
  const word = context.matchBefore(/[\w.]*/);
  if (!word && !context.explicit) return null;

  const source = context.state.doc.toString();
  const doc = new StringTextDocument(source);

  // Convert CM offset to language-services Position
  const lines = source.slice(0, context.pos).split('\n');
  const line = lines.length - 1;
  const character = lines[lines.length - 1].length;

  const items = getCompletions(doc, { line, character });
  if (items.length === 0) return null;

  const from = word ? word.from : context.pos;

  return {
    from,
    options: items.map((item) => ({
      label: item.label,
      type: mapCompletionKind(item.kind),
      detail: item.detail,
      boost: parseBoost(item.sortText),
      // For snippets, provide apply function that inserts the snippet text
      // (CodeMirror doesn't natively support VS Code snippet syntax, so we
      // strip the placeholders for now and just insert the text)
      ...(item.isSnippet && item.insertText ? {
        apply: (view: any, _completion: any, from: number, to: number) => {
          // Convert VS Code snippet syntax to plain text
          const plainText = item.insertText!
            .replace(/\$\{?\d+:?([^}]*)\}?/g, '$1') // ${1:name} -> name, $0 -> ''
            .replace(/\$\d+/g, '');
          view.dispatch({
            changes: { from, to, insert: plainText },
            selection: { anchor: from + plainText.length },
          });
        },
      } : {}),
    })),
    validFor: /^[\w.]*$/,
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
