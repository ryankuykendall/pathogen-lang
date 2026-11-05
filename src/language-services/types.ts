// Language Services Types
// LSP-compatible (0-based line and character) so the LSP adapter can pass-through.

/**
 * A position in a text document (0-based line and character).
 */
export interface Position {
  line: number;
  character: number;
}

/**
 * A range in a text document defined by start and end positions.
 */
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

/**
 * A diagnostic message (error, warning, etc.) tied to a range in the document.
 */
export interface Diagnostic {
  range: Range;
  severity: DiagnosticSeverity;
  message: string;
  /** The source of the diagnostic (e.g., 'pathogen-parser', 'pathogen-evaluator'). */
  source: string;
  /**
   * The same error at its own line in another file: one this document's call
   * caused in an imported file's code, which that file's own check can't see
   * (docs/modules.md "In each tool": "if that file is open, the error shows
   * at its own line too"). `file` is a project path (`/parts/gears.pathogen`),
   * `message` the error's words and its `called from` lines.
   */
  alsoIn?: { file: string; range: Range; message: string };
}
