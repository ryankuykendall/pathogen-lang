import {
  DiagnosticSeverity,
  encodeSemanticTokens,
  formatDocument,
  getCodeActions,
  getCodeLenses,
  getCompletions,
  getDefinition,
  getDiagnostics,
  getDocumentSymbols,
  getHoverInfo,
  getReferences,
  isStylePropertyNamePosition,
  getStyleValueKeywordRun,
  getSignatureHelp,
  prepareRename,
  getRenameEdits,
  renameRefusal,
  getSemanticTokens,
  StringTextDocument,
  SymbolKind,
  TOKEN_MODIFIERS,
  TOKEN_TYPES,
  getRefactorActions,
  getInlayHints,
  InlayHintKind,
} from 'pathogen-lang';
import * as path from 'node:path';

import {
  CompletionItemKind,
  createConnection,
  DiagnosticSeverity as LSPDiagnosticSeverity,
  InsertTextFormat,
  LSPErrorCodes,
  ProposedFeatures,
  ResponseError,
  SymbolKind as LSPSymbolKind,
  TextDocuments,
  TextDocumentSyncKind,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';

import { DiagnosticFonts } from './fonts';
import { DocumentModules, filePathOf, samePathKey } from './modules';

import type {
  CompletionItem,
  Diagnostic,
  DocumentSymbol,
  HoverInfo,
  Location,
  SemanticToken,
  SignatureHelp,
  TextEdit,
} from 'pathogen-lang';
import type { Diagnostic as LSPDiagnostic, InitializeParams, InitializeResult } from 'vscode-languageserver/node';

// Create the LSP connection (stdio transport)
const connection = createConnection(ProposedFeatures.all);

// Document manager — full sync (sends entire document content on each change)
const documents = new TextDocuments(TextDocument);

// The files each open document imports (docs/modules.md "In each tool"),
// read through the open buffers so unsaved edits count.
const documentModules = new DocumentModules((absolutePath) => {
  for (const document of documents.all()) {
    const file = filePathOf(document.uri);
    if (file !== null && samePathKey(file) === samePathKey(absolutePath)) return document.getText();
  }
  return undefined;
});

// Whether the client understands `${1:x}`/`$0` snippet syntax in completions.
// When false, snippet templates are stripped to plain text before sending.
let clientSupportsSnippets = false;

connection.onInitialize((params: InitializeParams): InitializeResult => {
  clientSupportsSnippets = params.capabilities.textDocument?.completion?.completionItem?.snippetSupport === true;

  // Paths in @font resolve per document, from its own URI (fonts.ts), never
  // from a workspace root.
  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Full,
      documentSymbolProvider: true,
      completionProvider: {
        // `"` and `/` open an import's path list; anywhere else they offer nothing (onCompletion).
        triggerCharacters: ['.', '$', '#', '@', '&', ':', '"', '/'],
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
      codeLensProvider: {
        resolveProvider: false,
      },
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

  const text = textDocument.getText();
  const doc = new StringTextDocument(text);
  const items = getCompletions(doc, params.position, documentModules.optionsFor(params.textDocument.uri));

  // `"` and `/` trigger completion only for an import's path: a `/` in
  // `calc(a / b)` or a comment must not open the keyword list.
  const trigger = params.context?.triggerCharacter;
  if ((trigger === '"' || trigger === '/') && !items.some((item) => item.kind === 'file')) return [];

  // Style-block property names (`stroke-width`) and enumerated values
  // (`line-through`) are hyphenated, but the client derives replacement
  // ranges from its word pattern, which treats `-` as a boundary — accepting
  // a completion over a typed hyphenated prefix would double it. Attach an
  // explicit textEdit covering the full run before the cursor. (Clients
  // ignore insertText when a textEdit is present, so newText must carry the
  // full insertion.)
  const offset = textDocument.offsetAt(params.position);
  const inPropName = isStylePropertyNamePosition(text, offset);
  const valueRun = inPropName ? null : getStyleValueKeywordRun(text, offset);
  if (inPropName || (valueRun !== null && valueRun.length > 0)) {
    const prefix = inPropName ? (/[-\w]*$/.exec(text.slice(0, offset))?.[0] ?? '') : valueRun!;
    const start = textDocument.positionAt(offset - prefix.length);
    return items.map((item) => {
      const lspItem = toLSPCompletionItem(item);
      return {
        ...lspItem,
        textEdit: {
          range: { start, end: params.position },
          newText: lspItem.insertText,
        },
      };
    });
  }

  // An item with its own range (an import's path, with its `/` and `.`)
  // replaces exactly that, not the word the client would pick.
  return items.map((item) => {
    const lspItem = toLSPCompletionItem(item);
    return item.range ? { ...lspItem, textEdit: { range: item.range, newText: lspItem.insertText } } : lspItem;
  });
});

// Hover
connection.onHover((params) => {
  const textDocument = documents.get(params.textDocument.uri);
  if (!textDocument) return null;

  const doc = new StringTextDocument(textDocument.getText());
  const info = getHoverInfo(doc, params.position, documentModules.optionsFor(params.textDocument.uri));
  if (!info) return null;

  return {
    contents: { kind: 'markdown' as const, value: info.contents },
    range: info.range
      ? {
          start: { line: info.range.start.line, character: info.range.start.character },
          end: { line: info.range.end.line, character: info.range.end.character },
        }
      : undefined,
  };
});

// Go to definition
connection.onDefinition((params) => {
  const textDocument = documents.get(params.textDocument.uri);
  if (!textDocument) return null;

  const doc = new StringTextDocument(textDocument.getText());
  const { uri } = params.textDocument;
  const location = getDefinition(doc, params.position, documentModules.optionsFor(uri));
  if (!location) return null;
  // A name from another file: its project path, in this document's project folder.
  const target = location.file === undefined ? uri : documentModules.uriFor(uri, location.file);
  if (!target) return null;

  return {
    uri: target,
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
  const help = getSignatureHelp(doc, params.position, documentModules.optionsFor(params.textDocument.uri));
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
  if (!result) {
    // A name other files share: say why rather than nothing (docs/modules.md
    // "In each tool"). RequestFailed: the request was valid, the rename isn't.
    const refusal = renameRefusal(doc, params.position);
    return refusal ? new ResponseError(LSPErrorCodes.RequestFailed, refusal) : null;
  }

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
  if (edits.length === 0) {
    // A client that skips prepareRename still gets the reason.
    const refusal = renameRefusal(doc, params.position);
    return refusal ? new ResponseError(LSPErrorCodes.RequestFailed, refusal) : null;
  }

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

  return [
    {
      range: params.range,
      newText: rangeLines.join('\n'),
    },
  ];
});

// On-type formatting — auto-indent after newlines following {
connection.onDocumentOnTypeFormatting((params) => {
  const textDocument = documents.get(params.textDocument.uri);
  if (!textDocument) return [];

  const { line } = params.position;
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
        indent = /^(\s*)/.exec(lines[i])?.[1].length ?? 0;
        break;
      }
    }
    const expected = `${' '.repeat(indent)}}`;
    if (currentLine.trim() === '}' && currentLine !== expected) {
      return [
        {
          range: {
            start: { line, character: 0 },
            end: { line, character: currentLine.length },
          },
          newText: expected,
        },
      ];
    }
  }

  // After typing newline after {, auto-indent
  if (params.ch === '\n' && line > 0) {
    const prevLine = lines[line - 1];
    if (prevLine.trimEnd().endsWith('{')) {
      const prevIndent = /^(\s*)/.exec(prevLine)?.[1].length ?? 0;
      const newIndent = ' '.repeat(prevIndent + 2);
      const currentLine = lines[line] || '';
      // Only add indent if current line is empty or has less indent
      if (currentLine.trim() === '' || /^(\s*)/.exec(currentLine)?.[1].length === 0) {
        return [
          {
            range: {
              start: { line, character: 0 },
              end: { line, character: currentLine.length },
            },
            newText: newIndent,
          },
        ];
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
  const { uri } = params.textDocument;

  function toLSPAction(action: {
    title: string;
    kind: string;
    diagnostics: unknown[];
    edit: { changes: { range: any; newText: string }[] };
  }) {
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
    severity: (d.severity as number) ?? 1,
    // LSP 3.18 allows MarkupContent messages; language-services diagnostics are plain strings.
    message: typeof d.message === 'string' ? d.message : d.message.value,
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

// Code lens — reference counts above declarations
connection.onCodeLens((params) => {
  const textDocument = documents.get(params.textDocument.uri);
  if (!textDocument) return [];

  const doc = new StringTextDocument(textDocument.getText());
  const lenses = getCodeLenses(doc);
  return lenses.map((lens) => ({
    range: {
      start: { line: lens.range.start.line, character: lens.range.start.character },
      end: { line: lens.range.end.line, character: lens.range.end.character },
    },
    command: {
      title: lens.command.title,
      command: '', // Client-side command not supported in basic LSP; title-only lens
    },
  }));
});

// Re-validate when a document changes (debounced to avoid flashing errors while typing)
const validationTimers = new Map<string, ReturnType<typeof setTimeout>>();

/** Check an open document after `delay` ms, replacing a check already waiting for it. */
function scheduleValidation(uri: string, delay: number): void {
  const existing = validationTimers.get(uri);
  if (existing) clearTimeout(existing);
  validationTimers.set(
    uri,
    setTimeout(() => {
      validationTimers.delete(uri);
      // The current text: a dependent's own content didn't change, and may have since.
      const document = documents.get(uri);
      if (document) void validateTextDocument(document);
    }, delay),
  );
}

documents.onDidChangeContent((change) => {
  const { uri } = change.document;

  // Check if the user is mid-expression (e.g., just typed a dot for member access)
  const source = change.document.getText();
  const trimmed = source.trimEnd();
  const isMidExpression = trimmed.endsWith('.') || trimmed.endsWith('(') || trimmed.endsWith(',');
  const delay = isMidExpression ? 500 : 200;

  scheduleValidation(uri, delay);
  // The open files that import this one, directly or not, see its unsaved
  // text: check them again too (docs/modules.md "In each tool").
  for (const dependent of documentModules.dependents(uri)) scheduleValidation(dependent, delay);
});

// Clear diagnostics when a document is closed — and a check still waiting to
// run for it, which would otherwise publish diagnostics for a closed file.
// The files that import it read it from disk again.
documents.onDidClose((event) => {
  const { uri } = event.document;
  const pending = validationTimers.get(uri);
  if (pending) clearTimeout(pending);
  validationTimers.delete(uri);
  const dependents = documentModules.dependents(uri);
  diagnosticFonts.forget(uri);
  documentModules.forget(uri);
  connection.sendDiagnostics({ uri, diagnostics: [] });
  for (const dependent of dependents) scheduleValidation(dependent, 200);
});

// A .pathogen file or a pathogen.json created, changed or deleted on disk (the
// client's file watcher): any open document may import it, or now find a file
// it couldn't. Check them all; there are rarely more than a few.
connection.onDidChangeWatchedFiles(() => {
  documentModules.filesChanged();
  for (const document of documents.all()) scheduleValidation(document.uri, 200);
});

// The fonts each document's @font directives name, loaded like the CLI does;
// a background download re-checks the document when it lands.
const diagnosticFonts = new DiagnosticFonts((uri) => {
  const doc = documents.get(uri);
  if (doc) void validateTextDocument(doc);
});

/**
 * Run the Pathogen compiler's diagnostic engine and publish results.
 */
async function validateTextDocument(textDocument: TextDocument): Promise<void> {
  const source = textDocument.getText();
  // The files it imports first: hover, completion and the rest read them after.
  let modules: Awaited<ReturnType<DocumentModules['refresh']>> | undefined;
  try {
    modules = await documentModules.refresh(textDocument.uri, source);
  } catch (err) {
    connection.console.error(`Pathogen: reading imported files failed: ${(err as Error).message}`);
  }
  if (documents.get(textDocument.uri)?.version !== textDocument.version) return;

  let fonts: Awaited<ReturnType<DiagnosticFonts['forDocument']>>;
  try {
    // The imported files' @font lines load too, as in the CLI.
    fonts = await diagnosticFonts.forDocument(textDocument.uri, source, modules?.graph);
  } catch (err) {
    connection.console.error(`Pathogen: loading fonts for diagnostics failed: ${(err as Error).message}`);
    fonts = undefined;
  }
  // A newer edit arrived while fonts loaded: its own validation will publish.
  if (documents.get(textDocument.uri)?.version !== textDocument.version) return;

  // Wrap the LSP TextDocument in our language-services TextDocument
  const doc = new StringTextDocument(source);
  const diagnostics = getDiagnostics(doc, {
    ...(fonts ? { fonts } : {}),
    ...(modules ? { modules: modules.graph, loadErrors: modules.errors } : {}),
  });

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
    case SymbolKind.Constant:
      return LSPSymbolKind.Constant;
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
 * Strip VS Code snippet placeholders down to plain text:
 * `${1:name}` → `name`, `${2|Grain,Paper|}` → `Grain`, `$0`/`$1` → ''.
 */
function stripSnippetPlaceholders(template: string): string {
  return template
    .replace(/\$\{\d+\|([^,}|]+)[^}]*\}/g, '$1')
    .replace(/\$\{\d+:([^}]*)\}/g, '$1')
    .replace(/\$\d+/g, '');
}

/**
 * Map a language-services CompletionItem to an LSP CompletionItem.
 * Snippet templates are downgraded to plain text when the client did not
 * advertise completionItem.snippetSupport.
 */
function toLSPCompletionItem(item: CompletionItem) {
  const isSnippet = Boolean(item.isSnippet && item.insertText);
  const useSnippetFormat = isSnippet && clientSupportsSnippets;
  const insertText = isSnippet
    ? useSnippetFormat
      ? item.insertText!
      : stripSnippetPlaceholders(item.insertText!)
    : (item.insertText ?? item.label);
  return {
    label: item.label,
    kind: mapCompletionKind(item.kind),
    detail: item.detail,
    sortText: item.sortText,
    insertText,
    insertTextFormat: useSnippetFormat ? InsertTextFormat.Snippet : InsertTextFormat.PlainText,
  };
}

function mapCompletionKind(kind: string): CompletionItemKind {
  switch (kind) {
    case 'function':
      return CompletionItemKind.Function;
    case 'variable':
      return CompletionItemKind.Variable;
    case 'keyword':
      return CompletionItemKind.Keyword;
    case 'property':
      return CompletionItemKind.Property;
    case 'constant':
      return CompletionItemKind.Constant;
    case 'snippet':
      return CompletionItemKind.Snippet;
    case 'file':
      return CompletionItemKind.File;
    default:
      return CompletionItemKind.Text;
  }
}

// Start listening
documents.listen(connection);
connection.listen();
