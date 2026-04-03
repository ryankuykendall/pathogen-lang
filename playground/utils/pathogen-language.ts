// Pathogen language support for CodeMirror 6
// Uses the Lezer parser from svg-path-extended for accurate syntax highlighting.

/**
 * Minimal interface for the CodeMirror language module.
 * The actual module is loaded dynamically from ESM CDN.
 */
interface CmLanguageModule {
  LRLanguage: {
    define(config: { parser: unknown; languageData?: Record<string, unknown> }): unknown;
  };
  LanguageSupport: new (language: unknown, support?: unknown[]) => unknown;
  syntaxHighlighting(style: unknown): unknown;
  defaultHighlightStyle: unknown;
  indentOnInput(): unknown;
  bracketMatching(): unknown;
}

/**
 * Create a CodeMirror language extension for Pathogen using the Lezer parser.
 * Replaces langJs.javascript() in the editor setup.
 *
 * @param cmLanguage — The `@codemirror/language` module (dynamically imported)
 * @returns A CodeMirror LanguageSupport extension
 */
export function pathogenLanguage(cmLanguage: CmLanguageModule): unknown {
  const { lezerParser } = window.SvgPathExtended;

  if (!lezerParser) {
    console.warn('Lezer parser not available — falling back to no language support');
    return [];
  }

  // Create the LRLanguage with our parser
  const lang = cmLanguage.LRLanguage.define({
    parser: lezerParser,
    languageData: {
      commentTokens: { line: '//' },
      closeBrackets: { brackets: ['(', '[', '{', '"', "'", '`'] },
      indentOnInput: /^\s*[})\]]$/,
    },
  });

  return new cmLanguage.LanguageSupport(lang);
}
