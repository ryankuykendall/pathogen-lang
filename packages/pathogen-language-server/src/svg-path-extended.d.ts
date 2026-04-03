/**
 * Type declarations for svg-path-extended.
 * This shim exists because the main package's DTS build has a pre-existing
 * failure. Once that's fixed, this file can be deleted and types will come
 * from the package's dist/index.d.ts instead.
 */
declare module 'svg-path-extended' {
  export interface Position {
    line: number;
    character: number;
  }

  export interface Range {
    start: Position;
    end: Position;
  }

  export enum DiagnosticSeverity {
    Error = 1,
    Warning = 2,
    Information = 3,
    Hint = 4,
  }

  export interface Diagnostic {
    range: Range;
    severity: DiagnosticSeverity;
    message: string;
    source: string;
  }

  export interface TextDocument {
    getText(): string;
    positionAt(offset: number): Position;
    offsetAt(position: Position): number;
    readonly lineCount: number;
  }

  export class StringTextDocument implements TextDocument {
    constructor(content: string);
    getText(): string;
    positionAt(offset: number): Position;
    offsetAt(position: Position): number;
    readonly lineCount: number;
  }

  export function getDiagnostics(document: TextDocument): Diagnostic[];

  export enum SymbolKind {
    Function = 12,
    Variable = 13,
    Enum = 10,
    EnumMember = 22,
    Struct = 23,
    Key = 20,
  }

  export interface DocumentSymbol {
    name: string;
    kind: SymbolKind;
    range: Range;
    selectionRange: Range;
    children?: DocumentSymbol[];
  }

  export function getDocumentSymbols(document: TextDocument): DocumentSymbol[];

  export interface CompletionItem {
    label: string;
    kind: 'function' | 'variable' | 'keyword' | 'property' | 'constant' | 'snippet';
    detail: string;
    sortText: string;
    insertText?: string;
    isSnippet?: boolean;
  }

  export function getCompletions(document: TextDocument, position: Position): CompletionItem[];

  export interface HoverInfo {
    contents: string;
    range?: Range;
  }

  export function getHoverInfo(document: TextDocument, position: Position): HoverInfo | null;

  export interface Location {
    range: Range;
  }

  export function getDefinition(document: TextDocument, position: Position): Location | null;
  export function getReferences(document: TextDocument, position: Position, includeDeclaration?: boolean): Location[];

  export interface ParameterInformation {
    label: string;
  }

  export interface SignatureInformation {
    label: string;
    parameters: ParameterInformation[];
    documentation?: string;
  }

  export interface SignatureHelp {
    signatures: SignatureInformation[];
    activeSignature: number;
    activeParameter: number;
  }

  export function getSignatureHelp(document: TextDocument, position: Position): SignatureHelp | null;

  export interface PrepareRenameResult {
    range: Range;
    placeholder: string;
  }

  export interface TextEdit {
    range: Range;
    newText: string;
  }

  export function prepareRename(document: TextDocument, position: Position): PrepareRenameResult | null;
  export function getRenameEdits(document: TextDocument, position: Position, newName: string): TextEdit[];
}
