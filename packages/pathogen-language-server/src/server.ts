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
  CompletionItemKind,
  InsertTextFormat,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import {
  getDiagnostics,
  getDocumentSymbols,
  getCompletions,
  getHoverInfo,
  getDefinition,
  getReferences,
  getSignatureHelp,
  prepareRename,
  getRenameEdits,
  getSemanticTokens,
  encodeSemanticTokens,
  TOKEN_TYPES,
  TOKEN_MODIFIERS,
  formatDocument,
  getCodeActions,
  getRefactorActions,
  getInlayHints,
  InlayHintKind,
  SymbolKind,
  StringTextDocument,
  DiagnosticSeverity,
} from 'svg-path-extended';
import type { Diagnostic, DocumentSymbol, CompletionItem, HoverInfo, Location, SignatureHelp, TextEdit, SemanticToken } from 'svg-path-extended';

// Create the LSP connection (stdio transport)
const connection = createConnection(ProposedFeatures.all);

// Document manager — full sync (sends entire document content on each change)
const documents = new TextDocuments(TextDocument);

// Workspace context — captured during initialization
let workspaceRoot: string | null = null;

connection.onInitialize((params: InitializeParams): InitializeResult => {
  // Capture workspace root for font path resolution and file-relative operations
  if (params.rootUri) {
    try {
      workspaceRoot = new URL(params.rootUri).pathname;
    } catch {
      workspaceRoot = params.rootUri;
    }
  } else if (params.rootPath) {
    workspaceRoot = params.rootPath;
  }

  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Full,
      documentSymbolProvider: true,
      completionProvider: {
        triggerCharacters: ['.', '$'],
      },
      hoverProvider: true,
      definitionProvider: true,
      referencesProvider: true,
      signatureHelpProvider: {
        triggerCharacters: ['(', ','],
      },
      renameProvider: {
        prepareProvider: true,
      },
      semanticTokensProvider: {
        full: true,
        legend: {
          tokenTypes: [...TOKEN_TYPES],
          tokenModifiers: [...TOKEN_MODIFIERS],
        },
      },
      documentFormattingProvider: true,
      documentRangeFormattingProvider: true,
      documentOnTypeFormattingProvider: {
        firstTriggerCharacter: '}',
        moreTriggerCharacter: ['\n'],
      },
      codeActionProvider: {
        codeActionKinds: ['quickfix', 'refactor.extract', 'refactor.inline'],
      },
      inlayHintProvider: true,
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

// Completion
connection.onCompletion((params) => {
  const textDocument = documents.get(params.textDocument.uri);
  if (!textDocument) return [];

  const doc = new StringTextDocument(textDocument.getText());
  const items = getCompletions(doc, params.position);
  return items.map(toLSPCompletionItem);
});

// Hover
connection.onHover((params) => {
  const textDocument = documents.get(params.textDocument.uri);
  if (!textDocument) return null;

  const doc = new StringTextDocument(textDocument.getText());
  const info = getHoverInfo(doc, params.position);
  if (!info) return null;

  return {
    contents: { kind: 'markdown' as const, value: info.contents },
    range: info.range ? {
      start: { line: info.range.start.line, character: info.range.start.character },
      end: { line: info.range.end.line, character: info.range.end.character },
    } : undefined,
  };
});

// Go to definition
connection.onDefinition((params) => {
  const textDocument = documents.get(params.textDocument.uri);
  if (!textDocument) return null;

  const doc = new StringTextDocument(textDocument.getText());
  const location = getDefinition(doc, params.position);
  if (!location) return null;

  return {
    uri: params.textDocument.uri,
    range: {
      start: { line: location.range.start.line, character: location.range.start.character },
      end: { line: location.range.end.line, character: location.range.end.character },
    },
  };
});

// Find references
connection.onReferences((params) => {
  const textDocument = documents.get(params.textDocument.uri);
  if (!textDocument) return [];

  const doc = new StringTextDocument(textDocument.getText());
  const locations = getReferences(doc, params.position, params.context.includeDeclaration);
  return locations.map((loc) => ({
    uri: params.textDocument.uri,
    range: {
      start: { line: loc.range.start.line, character: loc.range.start.character },
      end: { line: loc.range.end.line, character: loc.range.end.character },
    },
  }));
});

// Signature help
connection.onSignatureHelp((params) => {
  const textDocument = documents.get(params.textDocument.uri);
  if (!textDocument) return null;

  const doc = new StringTextDocument(textDocument.getText());
  const help = getSignatureHelp(doc, params.position);
  if (!help) return null;

  return {
    signatures: help.signatures.map((sig) => ({
      label: sig.label,
      documentation: sig.documentation,
      parameters: sig.parameters.map((p) => ({ label: p.label })),
    })),
    activeSignature: help.activeSignature,
    activeParameter: help.activeParameter,
  };
});

// Prepare rename (validate position)
connection.onPrepareRename((params) => {
  const textDocument = documents.get(params.textDocument.uri);
  if (!textDocument) return null;

  const doc = new StringTextDocument(textDocument.getText());
  const result = prepareRename(doc, params.position);
  if (!result) return null;

  return {
    range: {
      start: { line: result.range.start.line, character: result.range.start.character },
      end: { line: result.range.end.line, character: result.range.end.character },
    },
    placeholder: result.placeholder,
  };
});

// Rename
connection.onRenameRequest((params) => {
  const textDocument = documents.get(params.textDocument.uri);
  if (!textDocument) return null;

  const doc = new StringTextDocument(textDocument.getText());
  const edits = getRenameEdits(doc, params.position, params.newName);
  if (edits.length === 0) return null;

  return {
    changes: {
      [params.textDocument.uri]: edits.map((edit) => ({
        range: {
          start: { line: edit.range.start.line, character: edit.range.start.character },
          end: { line: edit.range.end.line, character: edit.range.end.character },
        },
        newText: edit.newText,
      })),
    },
  };
});

// Semantic tokens
connection.languages.semanticTokens.on((params) => {
  const textDocument = documents.get(params.textDocument.uri);
  if (!textDocument) return { data: [] };

  const doc = new StringTextDocument(textDocument.getText());
  const tokens = getSemanticTokens(doc);
  const data = encodeSemanticTokens(tokens);
  return { data };
});

// Document formatting
connection.onDocumentFormatting((params) => {
  const textDocument = documents.get(params.textDocument.uri);
  if (!textDocument) return [];

  const doc = new StringTextDocument(textDocument.getText());
  const edits = formatDocument(doc);
  return edits.map((edit) => ({
    range: {
      start: { line: edit.range.start.line, character: edit.range.start.character },
      end: { line: edit.range.end.line, character: edit.range.end.character },
    },
    newText: edit.newText,
  }));
});

// Range formatting — format the entire document and return only edits within the range
connection.onDocumentRangeFormatting((params) => {
  const textDocument = documents.get(params.textDocument.uri);
  if (!textDocument) return [];

  const doc = new StringTextDocument(textDocument.getText());
  const edits = formatDocument(doc);

  // Filter to only return the edit if it overlaps the requested range
  // Since formatDocument returns a single whole-document edit, we extract
  // just the lines within the range
  if (edits.length === 0) return [];

  const formatted = edits[0].newText;
  const formattedLines = formatted.split('\n');
  const startLine = params.range.start.line;
  const endLine = params.range.end.line;

  // Extract the formatted lines within the requested range
  const rangeLines = formattedLines.slice(startLine, endLine + 1);

  return [{
    range: params.range,
    newText: rangeLines.join('\n'),
  }];
});

// On-type formatting — auto-indent after newlines following {
connection.onDocumentOnTypeFormatting((params) => {
  const textDocument = documents.get(params.textDocument.uri);
  if (!textDocument) return [];

  const line = params.position.line;
  const text = textDocument.getText();
  const lines = text.split('\n');

  // After typing '}', re-indent the closing brace
  if (params.ch === '}' && line < lines.length) {
    const currentLine = lines[line];
    const prevLine = line > 0 ? lines[line - 1] : '';
    // Count indentation of the opening line (find matching { by looking at previous lines)
    let indent = 0;
    for (let i = line - 1; i >= 0; i--) {
      if (lines[i].trimEnd().endsWith('{')) {
        indent = lines[i].match(/^(\s*)/)?.[1].length ?? 0;
        break;
      }
    }
    const expected = ' '.repeat(indent) + '}';
    if (currentLine.trim() === '}' && currentLine !== expected) {
      return [{
        range: {
          start: { line, character: 0 },
          end: { line, character: currentLine.length },
        },
        newText: expected,
      }];
    }
  }

  // After typing newline after {, auto-indent
  if (params.ch === '\n' && line > 0) {
    const prevLine = lines[line - 1];
    if (prevLine.trimEnd().endsWith('{')) {
      const prevIndent = prevLine.match(/^(\s*)/)?.[1].length ?? 0;
      const newIndent = ' '.repeat(prevIndent + 2);
      const currentLine = lines[line] || '';
      // Only add indent if current line is empty or has less indent
      if (currentLine.trim() === '' || currentLine.match(/^(\s*)/)?.[1].length === 0) {
        return [{
          range: {
            start: { line, character: 0 },
            end: { line, character: currentLine.length },
          },
          newText: newIndent,
        }];
      }
    }
  }

  return [];
});

// Code actions (quick fixes + refactoring)
connection.onCodeAction((params) => {
  const textDocument = documents.get(params.textDocument.uri);
  if (!textDocument) return [];

  const doc = new StringTextDocument(textDocument.getText());
  const uri = params.textDocument.uri;

  function toLSPAction(action: { title: string; kind: string; diagnostics: unknown[]; edit: { changes: Array<{ range: any; newText: string }> } }) {
    return {
      title: action.title,
      kind: action.kind,
      diagnostics: action.diagnostics.length > 0 ? params.context.diagnostics : undefined,
      edit: {
        changes: {
          [uri]: action.edit.changes.map((c) => ({
            range: {
              start: { line: c.range.start.line, character: c.range.start.character },
              end: { line: c.range.end.line, character: c.range.end.character },
            },
            newText: c.newText,
          })),
        },
      },
    };
  }

  const result: ReturnType<typeof toLSPAction>[] = [];

  // Quick fixes for diagnostics
  const diagnostics = (params.context.diagnostics || []).map((d) => ({
    range: d.range,
    severity: d.severity as number ?? 1,
    message: d.message,
    source: d.source ?? 'pathogen',
  }));
  const quickFixes = getCodeActions(doc, params.range, diagnostics);
  result.push(...quickFixes.map(toLSPAction));

  // Refactoring actions for the selection
  const refactors = getRefactorActions(doc, params.range);
  result.push(...refactors.map(toLSPAction));

  return result;
});

// Inlay hints
connection.languages.inlayHint.on((params) => {
  const textDocument = documents.get(params.textDocument.uri);
  if (!textDocument) return [];

  const doc = new StringTextDocument(textDocument.getText());
  const hints = getInlayHints(doc, params.range);
  return hints.map((hint) => ({
    position: { line: hint.position.line, character: hint.position.character },
    label: hint.label,
    kind: hint.kind === InlayHintKind.Parameter ? 1 : 2, // LSP InlayHintKind
    paddingLeft: hint.paddingLeft,
    paddingRight: hint.paddingRight,
  }));
});

// Re-validate when a document changes (debounced to avoid flashing errors while typing)
const validationTimers = new Map<string, ReturnType<typeof setTimeout>>();

documents.onDidChangeContent((change) => {
  const uri = change.document.uri;
  const existing = validationTimers.get(uri);
  if (existing) clearTimeout(existing);

  // Check if the user is mid-expression (e.g., just typed a dot for member access)
  const source = change.document.getText();
  const trimmed = source.trimEnd();
  const isMidExpression = trimmed.endsWith('.') || trimmed.endsWith('(') || trimmed.endsWith(',');
  const delay = isMidExpression ? 500 : 200;

  validationTimers.set(uri, setTimeout(() => {
    validationTimers.delete(uri);
    validateTextDocument(change.document);
  }, delay));
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

/**
 * Map a language-services CompletionItem to an LSP CompletionItem.
 */
function toLSPCompletionItem(item: CompletionItem) {
  return {
    label: item.label,
    kind: mapCompletionKind(item.kind),
    detail: item.detail,
    sortText: item.sortText,
    insertText: item.insertText ?? item.label,
    insertTextFormat: item.isSnippet ? InsertTextFormat.Snippet : InsertTextFormat.PlainText,
  };
}

function mapCompletionKind(kind: string): CompletionItemKind {
  switch (kind) {
    case 'function': return CompletionItemKind.Function;
    case 'variable': return CompletionItemKind.Variable;
    case 'keyword': return CompletionItemKind.Keyword;
    case 'property': return CompletionItemKind.Property;
    case 'constant': return CompletionItemKind.Constant;
    case 'snippet': return CompletionItemKind.Snippet;
    default: return CompletionItemKind.Text;
  }
}

// Start listening
documents.listen(connection);
connection.listen();
