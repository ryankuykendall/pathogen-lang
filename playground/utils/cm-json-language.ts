// Highlighting for pathogen.json in the editor (phase 2d, step 4a; mockup v6
// screen J): keys, strings, numbers and punctuation, as CodeMirror's own JSON
// mode colours them. A small tokenizer behind CodeMirror's StreamLanguage,
// which the editor already loads with @codemirror/language, rather than a
// second package from the CDN for one read-only file the playground writes.

/** The token at `pos` in a line: where it ends, and its highlight tag (null for spaces). */
export function nextJsonToken(text: string, pos: number): { end: number; style: string | null } {
  const rest = text.slice(pos);
  const space = /^\s+/.exec(rest);
  if (space) return { end: pos + space[0].length, style: null };
  // A string runs to its closing quote, or to the end of the line if it has none.
  const string = /^"(?:[^"\\]|\\.)*(?:"|$)/.exec(rest);
  if (string) {
    const end = pos + string[0].length;
    // A key is a string followed by a colon.
    return { end, style: /^\s*:/.test(text.slice(end)) ? 'propertyName' : 'string' };
  }
  const number = /^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(rest);
  if (number) return { end: pos + number[0].length, style: 'number' };
  const literal = /^(?:true|false|null)\b/.exec(rest);
  if (literal) return { end: pos + literal[0].length, style: literal[0] === 'null' ? 'null' : 'bool' };
  const ch = rest[0];
  const style = ch === '{' || ch === '}' ? 'brace' : ch === '[' || ch === ']' ? 'squareBracket' : 'punctuation';
  return { end: pos + 1, style };
}

/** The slice of CodeMirror's StringStream the tokenizer reads and moves. */
interface StringStreamLike {
  string: string;
  pos: number;
}

/** The parts of @codemirror/language this needs. */
export interface StreamLanguageModule {
  StreamLanguage: {
    define: (spec: { name: string; token: (stream: StringStreamLike) => string | null }) => unknown;
  };
}

/** A CodeMirror language for JSON, from the editor's own @codemirror/language. */
export function jsonLanguage(language: StreamLanguageModule): unknown {
  return language.StreamLanguage.define({
    name: 'json',
    token(stream) {
      const { end, style } = nextJsonToken(stream.string, stream.pos);
      stream.pos = end;
      return style;
    },
  });
}
