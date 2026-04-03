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
