// CodeMirror 6 completion bridge — wraps the shared language-services
// getCompletions function for use as a CodeMirror completion source.
//
// This replaces the bulk of codemirror-setup.ts's svgPathCompletions function
// with the shared completion engine that's also used by the VS Code extension.

/** CodeMirror CompletionContext — the object passed to completion source functions. */
interface CompletionContext {
  state: { doc: { toString: () => string } };
  pos: number;
  explicit: boolean;
  matchBefore: (regexp: RegExp) => { from: number; to: number; text: string } | null;
}

/** CodeMirror CompletionResult — what a completion source returns. */
interface CompletionResult {
  from: number;
  options: {
    label: string;
    type: string;
    info?: string;
    detail?: string;
    boost?: number;
    apply?: (view: unknown, completion: unknown, from: number, to: number) => void;
  }[];
  validFor?: RegExp;
}

/**
 * `snippet()` from @codemirror/autocomplete — compiles a template into an
 * apply function with real tab-stop cycling. Injected by the editor pane
 * (which dynamically imports the module); when absent the bridge falls back
 * to a manual insert that places the cursor at the first placeholder.
 */
type CmSnippetFn = (template: string) => (view: unknown, completion: unknown, from: number, to: number) => void;

/**
 * Convert a VS Code snippet template to CodeMirror 6 field syntax:
 *   - `$0` (final cursor) → `${}` (CM's anonymous last field)
 *   - `${2|Grain,Paper|}` (choice) → `${2:Grain}` (CM has no choice fields;
 *     keep the first choice as the placeholder default)
 *   - `${1:name}` passes through unchanged.
 */
export function toCmSnippetTemplate(template: string): string {
  return template.replace(/\$\{(\d+)\|([^,}|]+)[^}]*\}/g, '${$1:$2}').replace(/\$0/g, '${}');
}

/**
 * Strip VS Code snippet placeholders down to plain text:
 *   `${1:name}` → `name`, `${2|Grain,Paper|}` → `Grain`, `$0`/`$1` → ''.
 */
function stripPlaceholders(template: string): string {
  return template
    .replace(/\$\{\d+\|([^,}|]+)[^}]*\}/g, '$1')
    .replace(/\$\{\d+:([^}]*)\}/g, '$1')
    .replace(/\$\d+/g, '');
}

/**
 * Manual snippet apply — used when the native `snippet()` function isn't
 * available. Inserts the stripped template, re-indented to the current line,
 * and selects the first `${1:…}` placeholder default so typing replaces it
 * (falling back to the `$0` cursor marker, then to the insert end).
 */
function manualSnippetApply(template: string) {
  return (view: any, _completion: any, from: number, to: number) => {
    const stripped = stripPlaceholders(template);

    // Locate the selection target BEFORE stripping: prefer the first
    // numbered placeholder's default text; fall back to the $0 marker.
    let selAnchor: number;
    let selHead: number;
    const firstField = /\$\{\d+[|:]([^,}|]*)[^}]*\}/.exec(template);
    if (firstField) {
      const beforeField = stripPlaceholders(template.slice(0, firstField.index));
      selAnchor = from + beforeField.length;
      selHead = selAnchor + firstField[1].length;
    } else {
      const cursorMarkerIdx = template.indexOf('$0');
      const beforeMarker = cursorMarkerIdx >= 0 ? stripPlaceholders(template.slice(0, cursorMarkerIdx)) : stripped;
      selAnchor = from + beforeMarker.length;
      selHead = selAnchor;
    }

    // Detect the current line's indentation so the inserted block matches
    // the surrounding code.
    const doc = view.state.doc.toString();
    const lineStart = doc.lastIndexOf('\n', from - 1) + 1;
    const lineText = doc.slice(lineStart, from);
    const baseIndent = lineText.match(/^(\s*)/)?.[1] ?? '';
    const indented = stripped.replace(/\n/g, `\n${baseIndent}`);
    // Adjust selection for any indent added before the selection line.
    const newlinesBefore = stripped.slice(0, selAnchor - from).split('\n').length - 1;
    const indentShift = newlinesBefore * baseIndent.length;

    view.dispatch({
      changes: { from, to, insert: indented },
      selection: { anchor: selAnchor + indentShift, head: selHead + indentShift },
    });
  };
}

/**
 * Create a CodeMirror completion source backed by the shared language-services
 * getCompletions function.
 *
 * This provides: keywords, stdlib functions, scope-aware user definitions,
 * member access completions, style block property completions — all from
 * the shared engine.
 *
 * @param snippetFn Optional native `snippet()` from @codemirror/autocomplete.
 *                  When provided, snippet completions get real tab-stop cycling.
 */
export function makeSharedCompletionSource(snippetFn?: CmSnippetFn) {
  return function sharedCompletionSource(context: CompletionContext): CompletionResult | null {
    const { StringTextDocument, getCompletions, isStylePropertyNamePosition, getStyleValueKeywordRun } =
      window.PathogenLang;

    if (!getCompletions || !StringTextDocument) {
      return null;
    }

    const source = context.state.doc.toString();

    // Style-block property names (`stroke-width`) and enumerated values
    // (`line-through`) are hyphenated, so the word match must include `-`
    // there — otherwise the replacement range starts after the hyphen and
    // accepting doubles the typed prefix. Outside those contexts `-` is an
    // operator (`a-b`, `-4`) and must stay a word boundary; value positions
    // only widen while the typed run is a pure keyword (letters + hyphens).
    const inStylePropName = isStylePropertyNamePosition?.(source, context.pos) ?? false;
    const inStyleValueKeyword = (getStyleValueKeywordRun?.(source, context.pos) ?? null) !== null;
    const hyphenAware = inStylePropName || inStyleValueKeyword;

    // Find the word being typed. `[@&$\w.]*` captures plain identifiers
    // (`cir`), member-access prefixes (`bg.app`), and leading-symbol prefixes
    // (`@font`, `&{`, `$`) that surface block-start and declaration snippets.
    // We reject zero-length non-explicit matches so that punctuation keystrokes
    // (e.g. `;`) don't trigger the completion popup for no reason.
    const word = context.matchBefore(hyphenAware ? /[-\w]*/ : /[@&$\w.]*/);
    if (!word || (word.from === word.to && !context.explicit)) return null;

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
        // Snippets insert their template with tab-stop fields (native
        // snippet() when available) instead of the bare label.
        ...(item.isSnippet && item.insertText
          ? {
              apply: snippetFn ? snippetFn(toCmSnippetTemplate(item.insertText)) : manualSnippetApply(item.insertText),
            }
          : {}),
      })),
      validFor: hyphenAware ? /^[-\w]*$/ : /^[@&$\w.]*$/,
    };
  };
}

/**
 * Default completion source without native snippet support — kept for
 * callers/tests that use the bridge without the @codemirror/autocomplete
 * module. The editor pane wires makeSharedCompletionSource(snippet) instead.
 */
export const sharedCompletionSource = makeSharedCompletionSource();

/** Map our completion kind strings to CodeMirror completion types. */
function mapCompletionKind(kind: string): string {
  switch (kind) {
    case 'function':
      return 'function';
    case 'variable':
      return 'variable';
    case 'keyword':
      return 'keyword';
    case 'property':
      return 'property';
    case 'constant':
      return 'constant';
    case 'snippet':
      return 'keyword';
    default:
      return 'text';
  }
}

/** Extract numeric boost from sortText (our format: 2-digit inverted prefix). */
function parseBoost(sortText: string): number {
  const prefix = parseInt(sortText.slice(0, 2), 10);
  if (isNaN(prefix)) return 0;
  return 99 - prefix; // Invert back to boost
}
