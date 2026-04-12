// Language Services — shared intelligence layer for VS Code and playground
//
// This module provides language features (diagnostics, completion, hover, etc.)
// as pure TypeScript functions with zero Node.js or VS Code dependencies.
// Both the LSP server and the playground consume this layer directly.

export { StringTextDocument } from './document';
export type { TextDocument } from './document';
export { DiagnosticSeverity } from './types';
export type { Diagnostic, Position, Range } from './types';
export { getDiagnostics } from './diagnostics';
export { getDocumentSymbols, SymbolKind } from './symbols';
export type { DocumentSymbol } from './symbols';
export { analyzeScopes } from './scope-analysis';
export type { ScopeInfo, Scope, Declaration, Reference, DeclarationKind } from './scope-analysis';
export { getCompletions } from './completion';
export type { CompletionItem } from './completion';
export { getHoverInfo } from './hover';
export type { HoverInfo } from './hover';
export { getDefinition, getReferences } from './navigation';
export type { Location } from './navigation';
export { getSignatureHelp } from './signature-help';
export type { SignatureHelp, SignatureInformation, ParameterInformation } from './signature-help';
export { prepareRename, getRenameEdits } from './rename';
export type { TextEdit, PrepareRenameResult } from './rename';
export { getSemanticTokens, encodeSemanticTokens, TOKEN_TYPES, TOKEN_MODIFIERS } from './semantic-tokens';
export type { SemanticToken } from './semantic-tokens';
export { formatDocument } from './formatter';
export type { FormatEdit, FormatOptions } from './formatter';
export { getCodeActions, getRefactorActions } from './code-actions';
export type { CodeAction } from './code-actions';
export { getCodeLenses } from './code-lens';
export type { CodeLens } from './code-lens';
export { getInlayHints, InlayHintKind } from './inlay-hints';
export type { InlayHint } from './inlay-hints';

// Feature catalog — single source of truth for cross-channel parity
export { LANGUAGE_FEATURES, HELPERS_NOT_FEATURES } from './feature-catalog';
export type { LanguageFeature } from './feature-catalog';
