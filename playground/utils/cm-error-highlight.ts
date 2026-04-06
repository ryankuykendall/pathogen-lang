// CodeMirror 6 error highlight extension — marks error lines and character positions
// Supports multiple simultaneous error highlights

interface ErrorPosition {
  line: number;
  column: number;
}

interface ErrorState {
  errors: ErrorPosition[];
  decorations: unknown; // Decoration.none or DecorationSet
}

interface ErrorHighlightResult {
  extension: unknown[];
  setError(editorView: unknown, position: ErrorPosition): void;
  setErrors(editorView: unknown, positions: ErrorPosition[]): void;
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

  const setErrorsEffect = StateEffect.define<ErrorPosition[]>();
  const clearErrorEffect = StateEffect.define<null>();

  // Build decorations for a single error position
  function buildDecosForPosition(doc: { lines: number; line(n: number): { from: number; to: number; length: number }; sliceString(from: number, to: number): string }, line: number, column: number, decos: unknown[]): void {
    if (line < 1 || line > doc.lines) return;

    const lineObj = doc.line(line);

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
  }

  // Build decorations for all error positions
  function buildDecorations(doc: Parameters<typeof buildDecosForPosition>[0], errors: ErrorPosition[]): unknown {
    if (errors.length === 0) return Decoration.none;
    const decos: unknown[] = [];
    for (const { line, column } of errors) {
      buildDecosForPosition(doc, line, column, decos);
    }
    return decos.length > 0 ? Decoration.set(decos, true) : Decoration.none;
  }

  const errorField = StateField.define<ErrorState>({
    create(): ErrorState {
      return { errors: [], decorations: Decoration.none };
    },
    update(state: ErrorState, tr: { effects: Array<{ is(type: StateEffectType): boolean; value: unknown }>; docChanged: boolean; state: { doc: unknown } }): ErrorState {
      for (const effect of tr.effects) {
        if (effect.is(setErrorsEffect)) {
          const errors = effect.value as ErrorPosition[];
          return { errors, decorations: buildDecorations(tr.state.doc as Parameters<typeof buildDecosForPosition>[0], errors) };
        }
        if (effect.is(clearErrorEffect)) {
          return { errors: [], decorations: Decoration.none };
        }
      }
      // On doc change, re-create decorations from stored errors to survive full doc replacement
      if (tr.docChanged && state.errors.length > 0) {
        return {
          errors: state.errors,
          decorations: buildDecorations(tr.state.doc as Parameters<typeof buildDecosForPosition>[0], state.errors),
        };
      }
      return state;
    },
    provide: (f: unknown) => EditorView.decorations.from(f, (s: unknown) => (s as ErrorState).decorations),
  });

  return {
    extension: [errorField],
    setError(editorView: unknown, position: ErrorPosition): void {
      this.setErrors(editorView, [position]);
    },
    setErrors(editorView: unknown, positions: ErrorPosition[]): void {
      (editorView as { dispatch(spec: { effects: unknown }): void }).dispatch({ effects: (setErrorsEffect as unknown as { of(value: ErrorPosition[]): unknown }).of(positions) });
    },
    clearError(editorView: unknown): void {
      (editorView as { dispatch(spec: { effects: unknown }): void }).dispatch({ effects: (clearErrorEffect as unknown as { of(value: null): unknown }).of(null) });
    },
  };
}
