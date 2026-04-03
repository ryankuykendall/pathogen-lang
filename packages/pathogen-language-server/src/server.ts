import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  InitializeParams,
  InitializeResult,
  TextDocumentSyncKind,
  Diagnostic as LSPDiagnostic,
  DiagnosticSeverity as LSPDiagnosticSeverity,
  SymbolKind as LSPSymbolKind,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import {
  getDiagnostics,
  getDocumentSymbols,
  SymbolKind,
  StringTextDocument,
  DiagnosticSeverity,
} from 'svg-path-extended';
import type { Diagnostic, DocumentSymbol } from 'svg-path-extended';

// Create the LSP connection (stdio transport)
const connection = createConnection(ProposedFeatures.all);

// Document manager — full sync (sends entire document content on each change)
const documents = new TextDocuments(TextDocument);

connection.onInitialize((_params: InitializeParams): InitializeResult => {
  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Full,
      documentSymbolProvider: true,
    },
  };
});

// Document symbols for outline/breadcrumbs
connection.onDocumentSymbol((params) => {
  const textDocument = documents.get(params.textDocument.uri);
  if (!textDocument) return [];

  const doc = new StringTextDocument(textDocument.getText());
  const symbols = getDocumentSymbols(doc);
  return symbols.map(toLSPDocumentSymbol);
});

// Re-validate when a document changes
documents.onDidChangeContent((change) => {
  validateTextDocument(change.document);
});

// Clear diagnostics when a document is closed
documents.onDidClose((event) => {
  connection.sendDiagnostics({ uri: event.document.uri, diagnostics: [] });
});

/**
 * Run the Pathogen compiler's diagnostic engine and publish results.
 */
function validateTextDocument(textDocument: TextDocument): void {
  const source = textDocument.getText();

  // Wrap the LSP TextDocument in our language-services TextDocument
  const doc = new StringTextDocument(source);
  const diagnostics = getDiagnostics(doc);

  // Convert language-services Diagnostic[] to LSP Diagnostic[]
  const lspDiagnostics: LSPDiagnostic[] = diagnostics.map(toLSPDiagnostic);

  connection.sendDiagnostics({ uri: textDocument.uri, diagnostics: lspDiagnostics });
}

/**
 * Map a language-services Diagnostic to an LSP Diagnostic.
 */
function toLSPDiagnostic(diag: Diagnostic): LSPDiagnostic {
  return {
    range: {
      start: { line: diag.range.start.line, character: diag.range.start.character },
      end: { line: diag.range.end.line, character: diag.range.end.character },
    },
    severity: mapSeverity(diag.severity),
    message: diag.message,
    source: diag.source,
  };
}

function mapSeverity(severity: DiagnosticSeverity): LSPDiagnosticSeverity {
  switch (severity) {
    case DiagnosticSeverity.Error:
      return LSPDiagnosticSeverity.Error;
    case DiagnosticSeverity.Warning:
      return LSPDiagnosticSeverity.Warning;
    case DiagnosticSeverity.Information:
      return LSPDiagnosticSeverity.Information;
    case DiagnosticSeverity.Hint:
      return LSPDiagnosticSeverity.Hint;
    default:
      return LSPDiagnosticSeverity.Error;
  }
}

/**
 * Map a language-services DocumentSymbol to an LSP DocumentSymbol.
 */
function toLSPDocumentSymbol(sym: DocumentSymbol): {
  name: string;
  kind: LSPSymbolKind;
  range: LSPDiagnostic['range'];
  selectionRange: LSPDiagnostic['range'];
  children?: ReturnType<typeof toLSPDocumentSymbol>[];
} {
  return {
    name: sym.name,
    kind: mapSymbolKind(sym.kind),
    range: {
      start: { line: sym.range.start.line, character: sym.range.start.character },
      end: { line: sym.range.end.line, character: sym.range.end.character },
    },
    selectionRange: {
      start: { line: sym.selectionRange.start.line, character: sym.selectionRange.start.character },
      end: { line: sym.selectionRange.end.line, character: sym.selectionRange.end.character },
    },
    children: sym.children?.map(toLSPDocumentSymbol),
  };
}

function mapSymbolKind(kind: SymbolKind): LSPSymbolKind {
  switch (kind) {
    case SymbolKind.Function:
      return LSPSymbolKind.Function;
    case SymbolKind.Variable:
      return LSPSymbolKind.Variable;
    case SymbolKind.Enum:
      return LSPSymbolKind.Enum;
    case SymbolKind.EnumMember:
      return LSPSymbolKind.EnumMember;
    case SymbolKind.Struct:
      return LSPSymbolKind.Struct;
    case SymbolKind.Key:
      return LSPSymbolKind.Key;
    default:
      return LSPSymbolKind.Variable;
  }
}

// Start listening
documents.listen(connection);
connection.listen();
