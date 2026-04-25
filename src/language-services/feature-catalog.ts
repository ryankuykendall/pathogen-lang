// Language-feature catalog — the single source of truth for which language
// features exist, how they surface in each channel (VS Code LSP server and
// Playground CodeMirror extensions), and which features are deliberately
// skipped per-channel.
//
// Adding a new language-services feature? Three steps:
//   1. Implement it in src/language-services/ and export it from
//      src/language-services/index.ts.
//   2. Add an entry to LANGUAGE_FEATURES below.
//   3. Wire it into the channels indicated by its flags:
//        - `vscodeCapability` → wire in packages/pathogen-language-server/src/server.ts
//        - `playgroundRequired: true` → wire in playground/utils/cm-language-services.ts
//
// The parity test at tests/cross-channel-parity.test.ts enforces that every
// feature ends up in both channels (or has a documented skip reason).

export type LanguageFeature = {
  /** Stable identifier used in PLAYGROUND_WIRINGS and tests. */
  id: string;
  /** Name of the exported function in src/language-services/index.ts. */
  fn: string;
  /**
   * LSP capability name as advertised in server.ts's onInitialize return, or
   * null if the feature is surfaced some other way (e.g. push diagnostics).
   */
  vscodeCapability: string | null;
  /**
   * LSP trigger characters, if the feature has any (completions, signature
   * help, on-type formatting). Used by the parity test to verify server.ts
   * advertises the same trigger set the catalog declares.
   */
  lspTriggerCharacters?: readonly string[];
  /**
   * True if this feature must be wired into the Playground editor
   * (playground/utils/cm-language-services.ts). Set to false only when the
   * feature deliberately does not apply to a single-file, in-browser editor,
   * and supply `playgroundSkipReason` to document why.
   */
  playgroundRequired: boolean;
  /** Required when playgroundRequired is false. */
  playgroundSkipReason?: string;
  /**
   * True if the feature is in the "defer for now" bucket — it's intended to
   * land in the Playground eventually but is not part of the current wiring
   * round. The parity test allows these to be absent from
   * cm-language-services.ts without failing, but the skip is tracked.
   */
  playgroundDeferred?: boolean;
};

export const LANGUAGE_FEATURES: readonly LanguageFeature[] = [
  {
    id: 'diagnostics',
    fn: 'getDiagnostics',
    vscodeCapability: null, // Pushed via connection.sendDiagnostics
    playgroundRequired: true,
  },
  {
    id: 'completion',
    fn: 'getCompletions',
    vscodeCapability: 'completionProvider',
    lspTriggerCharacters: ['.', '$', '@', '&'],
    playgroundRequired: true,
  },
  {
    id: 'hover',
    fn: 'getHoverInfo',
    vscodeCapability: 'hoverProvider',
    playgroundRequired: true,
  },
  {
    id: 'documentSymbols',
    fn: 'getDocumentSymbols',
    vscodeCapability: 'documentSymbolProvider',
    playgroundRequired: true,
    playgroundDeferred: true, // Phase C deferral: outline panel is follow-up work
  },
  {
    id: 'definition',
    fn: 'getDefinition',
    vscodeCapability: 'definitionProvider',
    playgroundRequired: true,
  },
  {
    id: 'references',
    fn: 'getReferences',
    vscodeCapability: 'referencesProvider',
    playgroundRequired: true,
  },
  {
    id: 'signatureHelp',
    fn: 'getSignatureHelp',
    vscodeCapability: 'signatureHelpProvider',
    lspTriggerCharacters: ['(', ','],
    playgroundRequired: true,
  },
  {
    id: 'prepareRename',
    fn: 'prepareRename',
    vscodeCapability: 'renameProvider',
    playgroundRequired: true,
  },
  {
    id: 'rename',
    fn: 'getRenameEdits',
    // Same LSP capability as prepareRename; declared once to avoid double-counting.
    vscodeCapability: null,
    playgroundRequired: true,
  },
  {
    id: 'formatDocument',
    fn: 'formatDocument',
    vscodeCapability: 'documentFormattingProvider',
    playgroundRequired: true,
  },
  {
    id: 'codeActions',
    fn: 'getCodeActions',
    vscodeCapability: 'codeActionProvider',
    playgroundRequired: true,
    playgroundDeferred: true, // Phase C deferral: lightbulb UI is follow-up work
  },
  {
    id: 'refactorActions',
    fn: 'getRefactorActions',
    vscodeCapability: null, // Shares codeActionProvider with getCodeActions
    playgroundRequired: true,
    playgroundDeferred: true,
  },
  {
    id: 'inlayHints',
    fn: 'getInlayHints',
    vscodeCapability: 'inlayHintProvider',
    playgroundRequired: true,
    playgroundDeferred: true, // Phase C deferral: preferences toggle is follow-up work
  },
  {
    id: 'semanticTokens',
    fn: 'getSemanticTokens',
    vscodeCapability: 'semanticTokensProvider',
    playgroundRequired: false,
    playgroundSkipReason:
      "Playground uses the Lezer grammar via @codemirror/language for syntax " +
      "highlighting (pathogenLanguage() in code-editor-pane.ts). Layering " +
      "semantic tokens on top would fight for token positions and double-render.",
  },
  {
    id: 'codeLens',
    fn: 'getCodeLenses',
    vscodeCapability: 'codeLensProvider',
    playgroundRequired: false,
    playgroundSkipReason:
      "Reference-count chrome above declarations has low value in a single-" +
      "file editor; the document outline panel (documentSymbols) covers the " +
      "same navigation use case more compactly.",
  },
] as const;

/**
 * Exports from src/language-services/index.ts that are NOT user-facing
 * features — helper types, constants, classes, or sub-routines consumed only
 * by feature implementations. Listed here so the parity test's exhaustiveness
 * check can distinguish "new feature that needs wiring" from "new helper".
 *
 * Keep this list in sync when new non-feature helpers are added. Adding a
 * helper function that starts with `get`/`format`/`prepare`/`analyze` but
 * isn't a feature? Either rename it or add it to this set.
 */
export const HELPERS_NOT_FEATURES: ReadonlySet<string> = new Set([
  'StringTextDocument',
  'DiagnosticSeverity',
  'SymbolKind',
  'InlayHintKind',
  'TOKEN_TYPES',
  'TOKEN_MODIFIERS',
  'encodeSemanticTokens',
  'analyzeScopes',
]);
