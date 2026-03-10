// CodeMirror 6 error highlight extension — marks error line and character position
// Shows a red/pink background on the error line and a wavy underline at the error column

interface ErrorPosition {
  line: number;
  column: number;
}

interface ErrorState {
  error: ErrorPosition | null;
  decorations: unknown; // Decoration.none or DecorationSet
}

interface ErrorHighlightResult {
  extension: unknown[];
  setError(editorView: unknown, position: ErrorPosition): void;
  clearError(editorView: unknown): void;
}

// The CM modules are passed in to avoid tight coupling to specific CM imports
interface StateEffectType {
  of(value: unknown): unknown;
}

interface CmStateModule {
  StateEffect: {
    define<T>(): StateEffectType;
  };
  StateField: {
    define<T>(config: {
      create(): T;
      update(state: T, tr: unknown): T;
      provide: (f: unknown) => unknown;
    }): unknown;
  };
}

interface CmViewModule {
  Decoration: {
    none: unknown;
    line(spec: { class: string }): { range(from: number): unknown };
    mark(spec: { class: string }): { range(from: number, to: number): unknown };
    set(decorations: unknown[], sort?: boolean): unknown;
  };
  EditorView: {
    decorations: {
      from(field: unknown, getter: (state: unknown) => unknown): unknown;
    };
  };
}

export function errorHighlightExtension(cmStateModule: CmStateModule, cmViewModule: CmViewModule): ErrorHighlightResult {
  const { StateEffect, StateField } = cmStateModule;
  const { Decoration, EditorView } = cmViewModule;

  const setErrorEffect = StateEffect.define<ErrorPosition>();
  const clearErrorEffect = StateEffect.define<null>();

  // Build decorations for a given error position and document
  function buildDecorations(doc: { lines: number; line(n: number): { from: number; to: number; length: number }; sliceString(from: number, to: number): string }, line: number, column: number): unknown {
    if (line < 1 || line > doc.lines) return Decoration.none;

    const lineObj = doc.line(line);
    const decos: unknown[] = [];

    // Line highlight
    decos.push(Decoration.line({ class: 'cm-error-line' }).range(lineObj.from));

    // Character/token mark — clamp column to line length, scan for word boundary
    const col = Math.max(1, Math.min(column, lineObj.length));
    const charFrom = lineObj.from + col - 1;
    // Scan forward to find end of identifier/word token
    const lineText = doc.sliceString(lineObj.from, lineObj.to);
    let endCol = col - 1; // 0-based index into lineText
    while (endCol < lineText.length && /[a-zA-Z0-9_]/.test(lineText[endCol])) {
      endCol++;
    }
    const charTo = Math.min(lineObj.from + endCol, lineObj.to);
    // Fall back to single char if no word found
    const effectiveTo = charTo > charFrom ? charTo : Math.min(charFrom + 1, lineObj.to);
    if (charFrom < effectiveTo) {
      decos.push(Decoration.mark({ class: 'cm-error-char' }).range(charFrom, effectiveTo));
    }

    return Decoration.set(decos, true);
  }

  const errorField = StateField.define<ErrorState>({
    create(): ErrorState {
      return { error: null, decorations: Decoration.none };
    },
    update(state: ErrorState, tr: { effects: Array<{ is(type: StateEffectType): boolean; value: unknown }>; docChanged: boolean; state: { doc: unknown } }): ErrorState {
      for (const effect of tr.effects) {
        if (effect.is(setErrorEffect)) {
          const { line, column } = effect.value as ErrorPosition;
          return { error: { line, column }, decorations: buildDecorations(tr.state.doc as Parameters<typeof buildDecorations>[0], line, column) };
        }
        if (effect.is(clearErrorEffect)) {
          return { error: null, decorations: Decoration.none };
        }
      }
      // On doc change, re-create decorations from stored error to survive full doc replacement
      if (tr.docChanged && state.error) {
        return {
          error: state.error,
          decorations: buildDecorations(tr.state.doc as Parameters<typeof buildDecorations>[0], state.error.line, state.error.column),
        };
      }
      return state;
    },
    provide: (f: unknown) => EditorView.decorations.from(f, (s: unknown) => (s as ErrorState).decorations),
  });

  return {
    extension: [errorField],
    setError(editorView: unknown, { line, column }: ErrorPosition): void {
      (editorView as { dispatch(spec: { effects: unknown }): void }).dispatch({ effects: (setErrorEffect as unknown as { of(value: ErrorPosition): unknown }).of({ line, column }) });
    },
    clearError(editorView: unknown): void {
      (editorView as { dispatch(spec: { effects: unknown }): void }).dispatch({ effects: (clearErrorEffect as unknown as { of(value: null): unknown }).of(null) });
    },
  };
}
