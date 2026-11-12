// The import lines a rename or a move rewrote, marked in the editor (phase 2d,
// step 4c-2; mockup v7 screen F, "After renaming": "The import lines that
// changed are marked in the editor"). A bar beside each line, until the next
// edit of the file.
//
// Built once per editor and shared by every file's state, as the error marks
// are (cm-error-highlight.ts): an effect only reaches a field its state holds.

interface CmStateModuleLike {
  StateEffect: { define: <T>() => { of: (value: T) => unknown } };
  StateField: {
    define: <T>(spec: {
      create: () => T;
      update: (value: T, tr: ChangedTransaction) => T;
      provide?: (field: unknown) => unknown;
    }) => unknown;
  };
}

interface CmViewModuleLike {
  Decoration: {
    none: unknown;
    line: (spec: { class: string }) => { range: (from: number) => unknown };
    set: (ranges: unknown[], sort?: boolean) => unknown;
  };
  EditorView: { decorations: { from: (field: unknown, get: (value: unknown) => unknown) => unknown } };
}

interface ChangedTransaction {
  docChanged: boolean;
  effects: readonly { is: (type: unknown) => boolean; value: unknown }[];
  state: { doc: { line: (n: number) => { from: number }; lines: number } };
}

export interface ChangedLines {
  extension: unknown[];
  /** The effect that marks these lines (1-based) in the state it's dispatched to. */
  mark: (lines: number[]) => unknown;
}

export function changedLinesExtension(state: CmStateModuleLike, view: CmViewModuleLike): ChangedLines {
  const markEffect = state.StateEffect.define<number[]>();
  const field = state.StateField.define<unknown>({
    create: () => view.Decoration.none,
    update(decorations, tr) {
      for (const effect of tr.effects) {
        if (effect.is(markEffect)) {
          const doc = tr.state.doc;
          const lines = [...new Set(effect.value as number[])]
            .filter((n) => n >= 1 && n <= doc.lines)
            .sort((a, b) => a - b);
          return lines.length > 0
            ? view.Decoration.set(
                lines.map((n) => view.Decoration.line({ class: 'cm-changed-line' }).range(doc.line(n).from)),
              )
            : view.Decoration.none;
        }
      }
      // The next edit of the file clears them.
      return tr.docChanged ? view.Decoration.none : decorations;
    },
    provide: (f) => view.EditorView.decorations.from(f, (value) => value),
  });
  return { extension: [field], mark: (lines) => markEffect.of(lines) };
}

/**
 * One edit that turns `doc` into `next`: the span between their common start
 * and common end. Undo history maps through it, so only an event inside that
 * span is collapsed; a whole-document replace would collapse them all.
 */
export function spanChange(doc: string, next: string): { from: number; to: number; insert: string } {
  const most = Math.min(doc.length, next.length);
  let start = 0;
  while (start < most && doc.charCodeAt(start) === next.charCodeAt(start)) start++;
  let end = 0;
  while (end < most - start && doc.charCodeAt(doc.length - 1 - end) === next.charCodeAt(next.length - 1 - end)) end++;
  return { from: start, to: doc.length - end, insert: next.slice(start, next.length - end) };
}

/** The 1-based lines of `after` that the edits (made to the text before) touch. */
export function editedLines(after: string, edits: readonly { from: number; to: number; insert: string }[]): number[] {
  let shift = 0;
  const lines: number[] = [];
  for (const edit of [...edits].sort((a, b) => a.from - b.from)) {
    const at = edit.from + shift;
    lines.push(after.slice(0, at).split('\n').length);
    shift += edit.insert.length - (edit.to - edit.from);
  }
  return lines;
}
