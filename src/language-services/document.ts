import type { Position } from './types';

/**
 * Minimal text document abstraction.
 * Compatible with vscode-languageserver-textdocument so the LSP server
 * can pass its document objects directly, while the playground can create
 * a trivial implementation wrapping a string.
 */
export interface TextDocument {
  getText(): string;
  positionAt(offset: number): Position;
  offsetAt(position: Position): number;
  readonly lineCount: number;
}

/**
 * Simple string-backed TextDocument for use in language-services and tests.
 */
export class StringTextDocument implements TextDocument {
  private readonly _content: string;
  private readonly _lineOffsets: number[];

  constructor(content: string) {
    this._content = content;
    this._lineOffsets = computeLineOffsets(content);
  }

  getText(): string {
    return this._content;
  }

  get lineCount(): number {
    return this._lineOffsets.length;
  }

  positionAt(offset: number): Position {
    const clamped = Math.max(0, Math.min(offset, this._content.length));
    const offsets = this._lineOffsets;

    // Binary search for the line containing the offset
    let low = 0;
    let high = offsets.length - 1;
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      if (offsets[mid] <= clamped) {
        low = mid;
      } else {
        high = mid - 1;
      }
    }

    return { line: low, character: clamped - offsets[low] };
  }

  offsetAt(position: Position): number {
    const offsets = this._lineOffsets;
    const line = Math.max(0, Math.min(position.line, offsets.length - 1));
    const lineOffset = offsets[line];
    const nextLineOffset = line + 1 < offsets.length ? offsets[line + 1] : this._content.length;
    const maxCharacter = nextLineOffset - lineOffset;
    return lineOffset + Math.max(0, Math.min(position.character, maxCharacter));
  }
}

/**
 * Compute the start offset of each line in the text.
 * The first line always starts at offset 0.
 */
function computeLineOffsets(text: string): number[] {
  const offsets: number[] = [0];
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10) { // \n
      offsets.push(i + 1);
    } else if (text.charCodeAt(i) === 13) { // \r
      if (i + 1 < text.length && text.charCodeAt(i + 1) === 10) {
        i++; // \r\n
      }
      offsets.push(i + 1);
    }
  }
  return offsets;
}
