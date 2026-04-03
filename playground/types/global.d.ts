import type { CompileResult, CompileOptions, CompileWithContextOptions, EvaluateWithContextResult } from './compiler';

export {};

/** Language Services types (shared with VS Code extension) */
interface LSPosition {
  line: number;
  character: number;
}

interface LSRange {
  start: LSPosition;
  end: LSPosition;
}

interface LSTextDocument {
  getText(): string;
  positionAt(offset: number): LSPosition;
  offsetAt(position: LSPosition): number;
  readonly lineCount: number;
}

interface LSHoverInfo {
  contents: string;
  range?: LSRange;
}

interface LSCompletionItem {
  label: string;
  kind: 'function' | 'variable' | 'keyword' | 'property' | 'constant' | 'snippet';
  detail: string;
  sortText: string;
  insertText?: string;
  isSnippet?: boolean;
}

declare global {
  interface Window {
    SvgPathExtended: {
      compile(source: string, options?: CompileOptions): CompileResult;
      compileAnnotated(source: string): string;
      compileWithContext(source: string, options?: CompileWithContextOptions): EvaluateWithContextResult;
      // Language Services
      StringTextDocument: new (content: string) => LSTextDocument;
      getHoverInfo(document: LSTextDocument, position: LSPosition): LSHoverInfo | null;
      getCompletions(document: LSTextDocument, position: LSPosition): LSCompletionItem[];
      // Lezer parser for CodeMirror syntax highlighting
      lezerParser: unknown;
    };
  }

  /** Global available via ESLint config — same as window.SvgPathExtended */
  const SVGPathExtended: Window['SvgPathExtended'];
}
