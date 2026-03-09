// CodeMirror 6 error highlight extension — marks error line and character position
// Shows a red/pink background on the error line and a wavy underline at the error column

export function errorHighlightExtension(cmStateModule, cmViewModule) {
  const { StateEffect, StateField } = cmStateModule;
  const { Decoration, EditorView } = cmViewModule;

  const setErrorEffect = StateEffect.define();
  const clearErrorEffect = StateEffect.define();

  // Build decorations for a given error position and document
  function buildDecorations(doc, line, column) {
    if (line < 1 || line > doc.lines) return Decoration.none;

    const lineObj = doc.line(line);
    const decos = [];

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

  const errorField = StateField.define({
    create() {
      return { error: null, decorations: Decoration.none };
    },
    update(state, tr) {
      for (const effect of tr.effects) {
        if (effect.is(setErrorEffect)) {
          const { line, column } = effect.value;
          return { error: { line, column }, decorations: buildDecorations(tr.state.doc, line, column) };
        }
        if (effect.is(clearErrorEffect)) {
          return { error: null, decorations: Decoration.none };
        }
      }
      // On doc change, re-create decorations from stored error to survive full doc replacement
      if (tr.docChanged && state.error) {
        return {
          error: state.error,
          decorations: buildDecorations(tr.state.doc, state.error.line, state.error.column),
        };
      }
      return state;
    },
    provide: (f) => EditorView.decorations.from(f, (s) => s.decorations),
  });

  return {
    extension: [errorField],
    setError(editorView, { line, column }) {
      editorView.dispatch({ effects: setErrorEffect.of({ line, column }) });
    },
    clearError(editorView) {
      editorView.dispatch({ effects: clearErrorEffect.of(null) });
    },
  };
}
