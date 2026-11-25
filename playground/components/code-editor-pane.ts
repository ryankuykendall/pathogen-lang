// Code editor pane with CodeMirror

import { store } from '../state/store.js';
import {
  buildLanguageExtensions,
  runFormatDocument,
  runFindReferences,
  runRename,
  type ErrorHighlightHandle,
} from '../utils/cm-language-services.js';
import { PROJECT_FILE } from '../services/workspace-edits.js';
import { isDataFile } from '../services/workspace-files.js';
import { changedLinesExtension, editedLines, spanChange } from '../utils/cm-changed-lines.js';
import type { ChangedLines } from '../utils/cm-changed-lines.js';
import { colorPickerExtension } from '../utils/cm-color-picker.js';
import { jsonLanguage, LONG_DATA_LINE, longestLine } from '../utils/cm-json-language.js';
import { FILE_ICONS } from '../utils/file-icons.js';
import { styleRefRecolorExtension } from '../utils/cm-style-ref-recolor.js';
import { textLayerEditorExtension } from '../utils/cm-textlayer-editor.js';
import { svgPathCompletions } from '../utils/codemirror-setup.js';
import { pathogenLanguage } from '../utils/pathogen-language.js';
import { themeManager } from '../utils/theme.js';
import styles from './code-editor-pane.css';
import './editor-zero-state.js';
import type { EditorZeroState } from './editor-zero-state.js';

// CodeMirror module types (dynamically imported from ESM CDN)
interface CmStateModule {
  Compartment: new () => { of(ext: unknown): unknown; reconfigure(ext: unknown): unknown };
  EditorState: {
    create(config: unknown): unknown;
    readOnly: { of(value: boolean): unknown };
  };
  Transaction: { addToHistory: { of: (value: boolean) => unknown } };
  StateField: {
    define<T>(spec: {
      create(state: unknown): T;
      update(value: T, transaction: unknown): T;
      provide?(field: unknown): unknown;
    }): unknown;
  };
}

interface CmViewModule {
  EditorView: {
    new (config: unknown): CmEditorView;
    lineWrapping: unknown;
    editable: { of(value: boolean): unknown };
    contentAttributes: { of: (attrs: Record<string, string>) => unknown };
    scrollIntoView(pos: number, options?: unknown): unknown;
    updateListener: { of(fn: (update: CmViewUpdate) => void): unknown };
    domEventHandlers(handlers: Record<string, (...args: unknown[]) => boolean | void>): unknown;
  };
  lineNumbers(): unknown;
  highlightActiveLineGutter(): unknown;
  highlightSpecialChars(): unknown;
  drawSelection(): unknown;
  rectangularSelection(): unknown;
  highlightActiveLine(): unknown;
  keymap: { of(bindings: unknown[]): unknown };
  ViewPlugin: {
    define: (
      create: (view: CmEditorView) => { update?: (update: CmViewUpdate) => void; destroy?: () => void },
    ) => unknown;
  };
  hoverTooltip(source: unknown, options?: unknown): unknown;
  showTooltip: {
    computeN(deps: unknown[], read: (state: unknown) => readonly unknown[]): unknown;
  };
}

interface CmEditorState {
  doc: {
    length: number;
    toString(): string;
    lines: number;
    line: (n: number) => { from: number; length: number };
    sliceString(from: number, to?: number): string;
  };
  selection: { main: { head: number } };
  field<T>(field: unknown): T;
  update: (spec: unknown) => { state: CmEditorState };
}

interface CmEditorView {
  state: CmEditorState;
  dispatch(tr: unknown): void;
  setState: (state: unknown) => void;
  hasFocus: boolean;
  focus(): void;
  destroy(): void;
  scrollDOM: HTMLElement;
  contentDOM: HTMLElement;
  coordsAtPos: (pos: number) => { left: number; top: number; bottom: number } | null;
  /** CodeMirror 6.23+: an effect that scrolls back to here when dispatched. */
  scrollSnapshot?: () => unknown;
}

/** A file's editor state while another file is shown, with where it was scrolled to. */
interface KeptFile {
  state: CmEditorState;
  scroll: { snapshot: unknown } | { top: number };
}

const DEFAULT_FILE = 'main.pathogen';

/** pathogen.json's line above the editor (mockup v6, screen J). */
const READ_ONLY_NOTE =
  '<b>Read-only.</b> The playground writes this file from your workspace. To change the main, use Set as main on a program.';
/** What the tip at the cursor says when you type in it. */
const READ_ONLY_TIP = 'Read-only. Set as main changes this list';
const READ_ONLY_HINT_MS = 2000;
// A data file's JSON is read again this long after typing pauses, as a compile waits (a 5 MB file takes about 50 ms).
const DATA_LINT_MS = 150;
// A data file with a line longer than LONG_DATA_LINE is shown plain: no highlighting, no wrapping (_dataExtensions).

interface CmTransaction {
  isUserEvent(type: string): boolean;
  state: CmEditorState;
  docChanged: boolean;
  selection?: unknown;
}

interface CmViewUpdate {
  docChanged: boolean;
  view: CmEditorView;
  state: CmEditorState;
  transactions: CmTransaction[];
}

interface CmCommandsModule {
  history(): unknown;
  defaultKeymap: unknown[];
  historyKeymap: unknown[];
  indentWithTab: unknown;
}

interface CmLanguageModule {
  syntaxHighlighting(style: unknown): unknown;
  defaultHighlightStyle: unknown;
  indentOnInput(): unknown;
  bracketMatching(): unknown;
  syntaxTree(state: unknown): unknown;
  StreamLanguage: Parameters<typeof jsonLanguage>[0]['StreamLanguage'];
}

interface CmAutocompleteModule {
  autocompletion(config: unknown): unknown;
  completionKeymap: unknown[];
  startCompletion(view: unknown): boolean;
  closeBrackets(): unknown;
  closeBracketsKeymap: unknown[];
}

interface CmOneDarkModule {
  oneDarkTheme: unknown;
  oneDarkHighlightStyle: unknown;
}

interface CmModules {
  state: CmStateModule;
  view: CmViewModule;
  commands: CmCommandsModule;
  language: CmLanguageModule;
  autocomplete: CmAutocompleteModule;
  oneDark: CmOneDarkModule;
}

export class CodeEditorPane extends HTMLElement {
  private _editor: CmEditorView | null;
  private _cmModules: CmModules | null;
  private _initialCode: string;
  private _themeCompartment: { of(ext: unknown): unknown; reconfigure(ext: unknown): unknown } | null;
  private _errorHighlight: ErrorHighlightHandle | null;

  // Language-services extensions are built once and reused across document
  // resets — the error-highlight StateField/StateEffect identities must stay
  // stable or setErrors/clearError dispatches would target a field the
  // current EditorState doesn't contain.
  private _languageExtensions: ReturnType<typeof buildLanguageExtensions> | null;

  private _pendingError: { line: number; column: number } | null;

  /** A line to go to once the editor has loaded (revealPosition before it had). */
  private _pendingReveal: { line: number; column: number } | null = null;
  private _pendingWarnings: Array<{ line: number; column: number }>;
  private _themeUnsubscribe: (() => void) | null;

  // One editor state per file of the workspace (phase 2d, step 3): the file
  // shown is the view's state; every other file opened since the workspace
  // loaded keeps its state here, undo history included, so each file keeps
  // its own undo while the workspace is open (docs/workspace-files.md). A
  // workspace load forgets them all: every workspace has a main.pathogen,
  // and another workspace's history must never come back.
  // Null with no file open (step 4d): the view holds an inert empty state,
  // hidden behind the zero-state, so nothing typed can reach a file.
  private _activePath: string | null;

  private _kept: Map<string, KeptFile>;

  /** Clears the read-only line's highlight and the tip, a moment after typing in pathogen.json. */
  private _readOnlyTimer: ReturnType<typeof setTimeout> | null = null;

  /** The rewritten-import marks (4c-2): built once, shared by every file's state, like the error marks. */
  private _changedLines: ChangedLines | null = null;

  /** True while the pane makes an edit the workspace already knows of (an import rewrite): no code-change. */
  private _quiet = false;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._editor = null;
    this._cmModules = null;
    this._initialCode = '';
    this._activePath = DEFAULT_FILE;
    this._kept = new Map();
    this._themeCompartment = null;
    this._errorHighlight = null;
    this._languageExtensions = null;
    this._pendingError = null;
    this._pendingWarnings = [];
    this._themeUnsubscribe = null;
  }

  connectedCallback(): void {
    this.render();
    this.loadCodeMirror();
  }

  disconnectedCallback(): void {
    if (this._themeUnsubscribe) {
      this._themeUnsubscribe();
    }
    if (this._readOnlyTimer) clearTimeout(this._readOnlyTimer);
    this._readOnlyTimer = null;
  }

  set initialCode(code: string) {
    this.resetFiles(this._activePath ?? DEFAULT_FILE, code);
  }

  /** The file shown's text; '' with no file open. */
  get code(): string {
    if (this._activePath === null) return '';
    return this._editor ? this._editor.state.doc.toString() : this._initialCode;
  }

  set code(value: string) {
    this.resetFiles(this._activePath ?? DEFAULT_FILE, value);
  }

  /** The file shown; null with no file open. */
  get activePath(): string | null {
    return this._activePath;
  }

  /** Whether the file shown can't be typed in: pathogen.json, which the playground writes. */
  get readOnly(): boolean {
    return this._activePath === PROJECT_FILE;
  }

  /**
   * Whether the file shown is a data file (phase 3a): JSON, edited as text,
   * with none of Pathogen's language services. Its marks are its own JSON
   * mistake's (_dataLint), never a compile's.
   */
  get isData(): boolean {
    return this._activePath !== null && isDataFile(this._activePath);
  }

  /** Put the keyboard in the editor (after a tab is clicked), or, with no file open, on the zero-state's first button. */
  focusEditor(): void {
    if (this._activePath === null) this._zeroState?.focusPrimary();
    else this._editor?.focus();
  }

  /** What the zero-state says (step 4d): workspace-view keeps it current while it shows. */
  set zeroState(view: { main: string | null; noFiles: boolean; onlyLibraries: boolean; filesHidden: boolean }) {
    this._zeroView = view;
    if (this._zeroState) this._zeroState.view = view;
  }

  private _zeroView = { main: null as string | null, noFiles: false, onlyLibraries: false, filesHidden: false };

  private get _zeroState(): EditorZeroState | null {
    return this.shadowRoot?.querySelector('editor-zero-state') ?? null;
  }

  /** The zero-state in place of the editor, or the editor back. */
  private _syncZeroState(): void {
    const none = this._activePath === null;
    const zero = this._zeroState;
    if (zero) {
      zero.hidden = !none;
      if (none) zero.view = this._zeroView;
    }
    const container = this.shadowRoot?.querySelector<HTMLElement>('#editor-container');
    if (container) container.hidden = none;
  }

  /**
   * Start over with one file, `path` holding `text` (a workspace load, a
   * scratch page): every kept file state is forgotten, and the new one is
   * FRESH — never a dispatch. A fresh state starts with an empty undo
   * history, so Cmd+Z in the new document can never resurrect the previous
   * one (a workspace switch used to leave "replace doc with old workspace" as
   * an undoable step, and autosave then persisted the undo — real data loss).
   * setState also produces no ViewUpdate, so programmatic loads do NOT fire
   * the update listener: no `code-change` event, no store.set('code'/
   * 'isModified'), no autosave.onChange. Callers must write store('code')
   * themselves. A null `path` starts over with no file open (a workspace
   * loaded with no files): the zero-state, as after showNone.
   */
  resetFiles(path: string | null, text: string): void {
    this._kept.clear();
    this._activePath = path;
    this._initialCode = path === null ? '' : text;
    this._syncReadOnly();
    this._syncZeroState();
    if (!this._editor || !this._cmModules) {
      // CodeMirror not loaded yet — createEditor() will seed from _initialCode.
      return;
    }
    if (path === null) {
      this._editor.setState(this._noneState());
      this._clearMarks();
      return;
    }
    const hadFocus = this._editor.hasFocus;
    this._editor.setState(this._newState(text, path));
    this._clearMarks();
    if (hadFocus) this._editor.focus();
  }

  /**
   * Show another file of the workspace: its kept state, with its undo history
   * and scroll position, or a fresh one holding `text`. The file shown until
   * now is kept. A kept state whose text isn't `text` (the workspace changed
   * it meanwhile) is brought to it as one undoable step. Like resetFiles,
   * nothing fires `code-change`: the caller updates the store. Error and
   * warning marks are cleared; the caller places the new file's.
   */
  showFile(path: string, text: string): void {
    if (path === this._activePath) return;
    if (!this._editor || !this._cmModules) {
      this._activePath = path;
      this._initialCode = text;
      this._syncReadOnly();
      this._syncZeroState();
      return;
    }
    const view = this._editor;
    // The file shown until now is kept (none, from the zero-state).
    this._keepShown();
    const kept = this._kept.get(path);
    this._kept.delete(path);
    let state = kept?.state ?? this._newState(text, path);
    const changed = state.doc.toString() !== text;
    if (changed) state = state.update({ changes: { from: 0, to: state.doc.length, insert: text } }).state;
    this._activePath = path;
    this._syncReadOnly();
    this._syncZeroState();
    view.setState(state);
    // A kept state was made under the theme of its day.
    this._updateEditorTheme();
    this._clearMarks();
    // Back where the file was scrolled to, unless its text changed meanwhile
    // (a snapshot names positions in the old text).
    if (kept && !changed && 'snapshot' in kept.scroll) view.dispatch({ effects: kept.scroll.snapshot });
    else view.scrollDOM.scrollTop = kept && !changed && 'top' in kept.scroll ? kept.scroll.top : 0;
  }

  /** Keep the file shown's state, undo history and scroll position, for when it's shown again. */
  private _keepShown(): void {
    const view = this._editor;
    if (!view || this._activePath === null) return;
    this._kept.set(this._activePath, {
      state: view.state,
      scroll: view.scrollSnapshot ? { snapshot: view.scrollSnapshot() } : { top: view.scrollDOM.scrollTop },
    });
  }

  /**
   * Show no file: the zero-state (step 4d). The file shown until now is kept,
   * undo history and all. The view takes an inert empty state (read-only, not
   * editable, no update listener, no language services) and hides behind the
   * zero-state, so a key pressed can't reach any file, and no timer of the
   * file just left runs against a file. Nothing fires `code-change`: the
   * caller updates the store.
   */
  showNone(): void {
    if (this._activePath === null) return;
    this._keepShown();
    this._activePath = null;
    this._initialCode = '';
    this._syncReadOnly();
    this._syncZeroState();
    if (!this._editor || !this._cmModules) return;
    this._editor.contentDOM.blur();
    this._editor.setState(this._noneState());
    this._clearMarks();
  }

  /** The view's state with no file open: nothing in it, and nothing can be typed. */
  private _noneState(): CmEditorState {
    const { state, view, autocomplete } = this._cmModules!;
    return state.EditorState.create({
      doc: '',
      extensions: [
        state.EditorState.readOnly.of(true),
        view.EditorView.editable.of(false),
        // A completion still pending in the file just left reads autocomplete's field
        // from this state (the same trap as pathogen.json's state).
        autocomplete.autocompletion({ override: [], activateOnTyping: false }),
      ],
    }) as CmEditorState;
  }

  /** Drop these files' kept states, undo history and all (they were deleted). */
  forgetFiles(paths: readonly string[]): void {
    for (const path of paths) this._kept.delete(path);
  }

  /**
   * Files whose text was replaced whole (an upload's Replace, or its Undo):
   * each starts afresh with its new text, undo history and all, since the old
   * history would map onto text it never had. A kept one is dropped, so it's
   * made afresh when shown; the file shown shows the new text now. No
   * code-change: the caller updates the store.
   */
  replaceFiles(files: readonly { path: string; text: string }[]): void {
    for (const { path, text } of files) {
      this._kept.delete(path);
      if (path !== this._activePath) continue;
      if (!this._editor || !this._cmModules) {
        this._initialCode = text;
        continue;
      }
      const hadFocus = this._editor.hasFocus;
      this._editor.setState(this._newState(text, path));
      this._updateEditorTheme();
      this._clearMarks();
      if (hadFocus) this._editor.focus();
    }
  }

  /** Files moved or renamed, in order: each keeps its state, undo history and all, under its new path. */
  renameFiles(moves: readonly { from: string; to: string }[]): void {
    for (const { from, to } of moves) {
      if (this._activePath === from) this._activePath = to;
      const kept = this._kept.get(from);
      if (kept) {
        this._kept.delete(from);
        this._kept.set(to, kept);
      }
    }
  }

  /**
   * A file's import rewrites (a rename or a move elsewhere): applied outside
   * its undo history, so Cmd-Z there never points an import back at a name
   * that's gone (the toast's Undo puts names and imports back together), and
   * without a code-change (the workspace already has them). `edits` are for
   * `before`, and the lines they touch are marked, in the file shown or when
   * a kept file is shown again. A file holding other text (it shouldn't: the
   * store has every edit) changes only where it differs from `after`, so its
   * undo history keeps its place.
   */
  editFile(
    path: string,
    edits: readonly { from: number; to: number; insert: string }[],
    before: string,
    after: string,
  ): void {
    const transaction = (doc: string): Record<string, unknown> => {
      const planned = doc === before;
      const spec: Record<string, unknown> = {
        changes: planned ? [...edits] : [spanChange(doc, after)],
        annotations: this._cmModules!.state.Transaction.addToHistory.of(false),
      };
      if (planned && this._changedLines) spec.effects = this._changedLines.mark(editedLines(after, edits));
      return spec;
    };
    if (path === this._activePath) {
      if (!this._editor || !this._cmModules) {
        this._initialCode = after;
        return;
      }
      const doc = this._editor.state.doc.toString();
      if (doc === after) return;
      this._quiet = true;
      try {
        this._editor.dispatch(transaction(doc));
      } finally {
        this._quiet = false;
      }
      return;
    }
    const kept = this._kept.get(path);
    if (!kept || !this._cmModules) return;
    const doc = kept.state.doc.toString();
    if (doc === after) return;
    kept.state = kept.state.update(transaction(doc)).state;
  }

  /**
   * New text for the file shown, when it's read-only (pathogen.json, written
   * from the entry points): no undo step, no code-change. Any other file is
   * left alone: its text is the user's.
   */
  refreshShown(text: string): void {
    if (!this.readOnly) return;
    if (!this._editor) {
      this._initialCode = text;
      return;
    }
    this._editor.dispatch({ changes: { from: 0, to: this._editor.state.doc.length, insert: text } });
  }

  private _newState(text: string, path: string): CmEditorState {
    let extensions: unknown[];
    if (path === PROJECT_FILE) extensions = this._readOnlyExtensions();
    else if (isDataFile(path)) extensions = this._dataExtensions(text);
    else extensions = this._buildExtensions();
    return this._cmModules!.state.EditorState.create({ doc: text, extensions }) as CmEditorState;
  }

  /**
   * A data file's state (phase 3a; docs/workspace-files.md "Data files"):
   * JSON, highlighted and editable, with its own undo history and the update
   * listener, so an edit reaches the store, autosave and the programs that
   * read it. None of Pathogen's language services, keys or pickers: its
   * completions, hover, rename and Format Document are Pathogen's. Its JSON
   * mistake is marked as you type, with the message its import would give
   * (_dataLint).
   *
   * A file written on long lines (minified JSON, up to 5 MB on one line) is
   * shown without highlighting or wrapping: CodeMirror highlights and lays
   * out a line whole, so each keystroke would go through all of it.
   */
  private _dataExtensions(text: string): unknown[] {
    const { view, commands, language, autocomplete } = this._cmModules!;
    const plain = longestLine(text) > LONG_DATA_LINE;
    return [
      view.lineNumbers(),
      view.highlightActiveLineGutter(),
      view.highlightSpecialChars(),
      commands.history(),
      view.drawSelection(),
      view.rectangularSelection(),
      view.highlightActiveLine(),
      language.indentOnInput(),
      language.bracketMatching(),
      autocomplete.closeBrackets(),
      // No completions; the field stays present for a completion pending from
      // the file just left (as in pathogen.json's state).
      autocomplete.autocompletion({ override: [], activateOnTyping: false }),
      this._themeCompartment!.of(this._getThemeExtensions()),
      ...(plain ? [] : [jsonLanguage(language)]),
      view.keymap.of([
        ...autocomplete.closeBracketsKeymap,
        ...commands.defaultKeymap,
        ...commands.historyKeymap,
        commands.indentWithTab,
      ]),
      ...(this._errorHighlight?.extension ?? []),
      ...(this._changedLines?.extension ?? []),
      this._updateExtension(),
      this._blurExtension(),
      this._dataLint(),
      ...(plain ? [] : [view.EditorView.lineWrapping]),
    ];
  }

  /**
   * A data file's JSON mistake, marked with the message its import would give
   * (the engine's own reader): when the file shows, and after each pause in
   * typing. A compile's marks pass a data file by (highlightErrors), so these
   * stay until the JSON reads.
   */
  private _dataLint(): unknown {
    const { view } = this._cmModules!;
    return view.ViewPlugin.define((editor: CmEditorView) => {
      let timer: ReturnType<typeof setTimeout> | null = null;
      const schedule = (delay: number): void => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          timer = null;
          this._markJsonMistake(editor);
        }, delay);
      };
      schedule(0);
      return {
        update: (update: CmViewUpdate) => {
          if (update.docChanged) schedule(DATA_LINT_MS);
        },
        destroy: () => {
          if (timer) clearTimeout(timer);
        },
      };
    });
  }

  // (setState destroys a state's plugins, so a timer from a file no longer shown never fires.)
  private _markJsonMistake(editor: CmEditorView): void {
    const readJson = window.PathogenLang?.readJson;
    if (!this._errorHighlight || typeof readJson !== 'function') return;
    const read = readJson(editor.state.doc.toString());
    if (read.ok) this._errorHighlight.clearError(editor);
    else this._errorHighlight.setErrors(editor, [{ line: read.line, column: read.column, message: read.message }]);
    // The same words for a screen reader, which can't reach the mark's hover text.
    this._setDataStatus(read.ok ? '' : `Line ${read.line}: ${read.message}`);
  }

  private _setDataStatus(text: string): void {
    const status = this.shadowRoot?.querySelector<HTMLElement>('.data-status');
    if (status && status.textContent !== text) status.textContent = text;
  }

  /**
   * pathogen.json's state: JSON highlighting and read-only, with none of
   * Pathogen's language services (its diagnostics would flag JSON as errors)
   * and no update listener: no edit of it ever reaches the store, a save or a
   * compile. You can still move, select and copy. Typing lights up the line
   * above the editor and shows the tip at the cursor (mockup v6, screen J).
   */
  private _readOnlyExtensions(): unknown[] {
    const { state, view, commands, language, autocomplete } = this._cmModules!;
    return [
      state.EditorState.readOnly.of(true),
      // No completions here. But a completion still pending in the file just
      // left (autocomplete's own timer) runs against this state when it fires,
      // and reads autocomplete's field: an inert autocompletion keeps that
      // field present, so it finds nothing to do instead of throwing.
      autocomplete.autocompletion({ override: [], activateOnTyping: false }),
      view.lineNumbers(),
      view.highlightActiveLineGutter(),
      view.highlightSpecialChars(),
      view.drawSelection(),
      view.highlightActiveLine(),
      this._themeCompartment!.of(this._getThemeExtensions()),
      jsonLanguage(language),
      view.keymap.of(commands.defaultKeymap),
      view.EditorView.lineWrapping,
      // A screen reader hears that the text box is read-only, not only the line above it.
      view.EditorView.contentAttributes.of({ 'aria-readonly': 'true' }),
      view.EditorView.domEventHandlers({
        // Every typed or pasted change, Enter and Backspace included, arrives as beforeinput.
        beforeinput: (event: unknown) => {
          (event as Event).preventDefault();
          this._readOnlyAttempt();
          return true;
        },
      }),
    ];
  }

  /** The read-only line shows with pathogen.json, and only then. */
  private _syncReadOnly(): void {
    const note = this.shadowRoot?.querySelector<HTMLElement>('.read-only-note');
    if (note) note.hidden = !this.readOnly;
    if (!this.readOnly) this._clearReadOnlyHint();
  }

  /** Typing in pathogen.json: say why nothing happens, on the line and at the cursor. */
  private _readOnlyAttempt(): void {
    const note = this.shadowRoot?.querySelector<HTMLElement>('.read-only-note');
    const tip = this.shadowRoot?.querySelector<HTMLElement>('.read-only-tip');
    note?.classList.add('hl');
    const view = this._editor;
    const at = view?.coordsAtPos(view.state.selection.main.head);
    if (tip && at) {
      const host = this.getBoundingClientRect();
      tip.textContent = READ_ONLY_TIP;
      tip.hidden = false;
      // Under the cursor, kept inside the pane at both edges.
      const right = Math.max(8, host.width - tip.offsetWidth - 8);
      tip.style.left = `${Math.min(Math.max(8, at.left - host.left), right)}px`;
      tip.style.top = `${at.bottom - host.top + 6}px`;
    }
    if (this._readOnlyTimer) clearTimeout(this._readOnlyTimer);
    this._readOnlyTimer = setTimeout(() => this._clearReadOnlyHint(), READ_ONLY_HINT_MS);
  }

  private _clearReadOnlyHint(): void {
    if (this._readOnlyTimer) clearTimeout(this._readOnlyTimer);
    this._readOnlyTimer = null;
    this.shadowRoot?.querySelector('.read-only-note')?.classList.remove('hl');
    const tip = this.shadowRoot?.querySelector<HTMLElement>('.read-only-tip');
    if (tip) tip.hidden = true;
  }

  /** A file just shown starts without the marks of the one before; the next compile places its own. */
  private _clearMarks(): void {
    this._pendingError = null;
    this._pendingWarnings = [];
    this._setDataStatus('');
    if (this._editor && this._errorHighlight) this._errorHighlight.clearError(this._editor);
  }

  async loadCodeMirror(): Promise<void> {
    if (this._cmModules) return;

    try {
      const [state, view, commands, language, autocomplete, oneDark] = await Promise.all([
        import('https://esm.sh/@codemirror/state@6'),
        import('https://esm.sh/@codemirror/view@6'),
        import('https://esm.sh/@codemirror/commands@6'),
        import('https://esm.sh/@codemirror/language@6'),
        import('https://esm.sh/@codemirror/autocomplete@6'),
        import('https://esm.sh/@codemirror/theme-one-dark@6'),
      ]);

      this._cmModules = { state, view, commands, language, autocomplete, oneDark };
      this.createEditor();
    } catch (err) {
      console.error('Failed to load CodeMirror:', err);
    }
  }

  private _getThemeExtensions(): unknown[] {
    const { language, oneDark } = this._cmModules!;
    const isDark = themeManager.getActiveTheme() === 'dark';

    if (isDark) {
      return [oneDark.oneDarkTheme, language.syntaxHighlighting(oneDark.oneDarkHighlightStyle)];
    }
    return [language.syntaxHighlighting(language.defaultHighlightStyle)];
  }

  /** An edit reaches the store and workspace-view (`code-change`): a Pathogen file's or a data file's. */
  private _updateExtension(): unknown {
    const { view } = this._cmModules!;
    return view.EditorView.updateListener.of((update: CmViewUpdate) => {
      if (update.docChanged && !this._quiet) {
        store.set('isModified', true);
        store.set('code', this._editor!.state.doc.toString());
        this.dispatchEvent(
          new CustomEvent<{ code: string }>('code-change', {
            bubbles: true,
            composed: true,
            detail: { code: this._editor!.state.doc.toString() },
          }),
        );
      }
    });
  }

  // Flush any pending autosave when focus leaves the editor — shrinks the
  // window where an edit sits unsaved between the debounce and the next save.
  private _blurExtension(): unknown {
    const { view } = this._cmModules!;
    return view.EditorView.domEventHandlers({
      blur: () => {
        this.dispatchEvent(new CustomEvent('editor-blur', { bubbles: true, composed: true }));
        return false;
      },
    });
  }

  /**
   * The full extension set for an EditorState. Called for the initial state
   * AND for every fresh one (resetFiles, and each file shown for the first
   * time, showFile) — a fresh state only keeps error highlighting and theme
   * swapping working because two identities are stable across calls:
   * `_languageExtensions` (built once — its error-highlight
   * StateField/StateEffect handles) and `_themeCompartment` (the reconfigure
   * target). Everything else is cheap to recreate, and a fresh `history()`
   * per state is exactly what isolates undo across workspace switches and
   * keeps each file's undo its own.
   */
  private _buildExtensions(): unknown[] {
    const { view, commands, language, autocomplete } = this._cmModules!;
    const updateExtension = this._updateExtension();
    const blurExtension = this._blurExtension();

    return [
      view.lineNumbers(),
      view.highlightActiveLineGutter(),
      view.highlightSpecialChars(),
      commands.history(),
      view.drawSelection(),
      view.rectangularSelection(),
      view.highlightActiveLine(),
      language.indentOnInput(),
      language.bracketMatching(),
      autocomplete.closeBrackets(),
      this._themeCompartment!.of(this._getThemeExtensions()),
      pathogenLanguage(language as any),
      view.keymap.of([
        ...autocomplete.closeBracketsKeymap,
        ...commands.defaultKeymap,
        ...commands.historyKeymap,
        ...autocomplete.completionKeymap,
        commands.indentWithTab,
        // Ctrl/Cmd+Shift+F — format the current document using the shared
        // language-services formatter. See runFormatDocument in
        // playground/utils/cm-language-services.ts.
        {
          key: 'Mod-Shift-f',
          run: (view: unknown) => runFormatDocument(view),
        },
        // F2 — rename the symbol at the cursor using prepareRename/getRenameEdits.
        {
          key: 'F2',
          run: (view: unknown) => runRename(view),
        },
        // Shift+F12 — find all references to the symbol at the cursor and
        // select them as a multi-cursor. Escape collapses back.
        {
          key: 'Shift-F12',
          run: (view: unknown) => runFindReferences(view),
        },
      ]),
      ...this._languageExtensions!.extensions,
      ...(this._changedLines?.extension ?? []),
      updateExtension,
      blurExtension,
      view.EditorView.lineWrapping,
      ...colorPickerExtension(view, language),
      ...styleRefRecolorExtension(view),
      ...textLayerEditorExtension(view, language),
    ];
  }

  createEditor(): void {
    const container = this.shadowRoot!.querySelector('#editor-container') as HTMLElement | null;
    if (!container || !this._cmModules) return;

    const { state, view, autocomplete } = this._cmModules;

    // Create compartments for dynamic theme swapping
    this._themeCompartment = new state.Compartment();

    // Build language-services extensions (completion, hover, diagnostics,
    // signature help, completion trigger detector). This is the single entry
    // point for every language feature wired into the Playground — see
    // playground/utils/cm-language-services.ts. The parity test at
    // tests/cross-channel-parity.test.ts ensures that every required feature
    // from src/language-services/feature-catalog.ts is wired there.
    //
    // Cast through `never`: the CM6 module shapes declared in this file and
    // in cm-language-services.ts describe overlapping-but-not-identical
    // slices of the same runtime objects, and TypeScript's structural
    // matching can't see that the underlying objects are the same. The
    // wiring module does its own internal type checking against its
    // interfaces.
    this._languageExtensions = buildLanguageExtensions(
      { state, view, autocomplete } as never,
      svgPathCompletions,
    );
    this._errorHighlight = this._languageExtensions.errorHighlight;
    this._changedLines = changedLinesExtension(state as never, view as never);

    const editorState =
      this._activePath === null ? this._noneState() : this._newState(this._initialCode, this._activePath);

    this._editor = new view.EditorView({
      state: editorState,
      parent: container,
    });

    // Listen for theme changes and swap editor theme
    this._themeUnsubscribe = themeManager.subscribe(() => {
      this._updateEditorTheme();
    });

    // Focus the editor (not with no file open: the zero-state shows)
    if (this._activePath !== null) this._editor.focus();

    // Apply any error or warning highlight that arrived before the editor was ready
    this._applyPendingError();
    if (this._pendingWarnings.length > 0) this.highlightWarnings(this._pendingWarnings);
    // And a link to a line followed before it was ready (step 7).
    const reveal = this._pendingReveal;
    this._pendingReveal = null;
    if (reveal) this.revealPosition(reveal.line, reveal.column);

    this.dispatchEvent(
      new CustomEvent('editor-ready', {
        bubbles: true,
        composed: true,
      }),
    );
  }

  private _updateEditorTheme(): void {
    if (!this._editor || !this._themeCompartment) return;

    this._editor.dispatch({
      effects: this._themeCompartment.reconfigure(this._getThemeExtensions()),
    });
  }

  /**
   * Replace the whole document as ONE undoable transaction. Unlike the `code`
   * setter (a fresh EditorState for document loads), this goes through the
   * update listener, so `code-change` fires and the store, autosave, and the
   * recompile all follow exactly as they do for typed edits.
   */
  replaceDocument(text: string): void {
    // pathogen.json is the playground's to write; with no file open there's no document.
    if (this.readOnly || this._activePath === null) return;
    if (!this._editor) {
      this._initialCode = text;
      return;
    }
    this._editor.dispatch({
      changes: { from: 0, to: this._editor.state.doc.length, insert: text },
    });
  }

  /**
   * Format the current document via the shared language-services formatter:
   * not pathogen.json, and not a data file, since it formats Pathogen code
   * (docs/workspace-files.md "Data files").
   */
  formatDocument(): void {
    if (!this._editor || this.readOnly || this.isData || this._activePath === null) return;
    runFormatDocument(this._editor);
  }

  /**
   * Put the cursor at `line` and `column` (1-based) in the file shown, with
   * the line in the middle of the editor (an error panel's or a console's
   * link, Cmd-click: 2d, step 7). A line past the end goes to the last one, a
   * column past the line's end to its end: the file may have changed since.
   */
  revealPosition(line: number, column = 1): void {
    if (this._activePath === null || !Number.isFinite(line) || !Number.isFinite(column)) return;
    if (!this._editor || !this._cmModules) {
      // Not loaded yet (CodeMirror comes from a CDN): done once it is.
      this._pendingReveal = { line, column };
      return;
    }
    const doc = this._editor.state.doc;
    const at = doc.line(Math.max(1, Math.min(Math.floor(line), doc.lines)));
    const pos = at.from + Math.max(0, Math.min(Math.floor(column) - 1, at.length));
    this._editor.dispatch({
      selection: { anchor: pos },
      effects: this._cmModules.view.EditorView.scrollIntoView(pos, { y: 'center' }),
      userEvent: 'select',
    });
  }

  // Marks need a file: with none open there's nothing to mark (a file shown
  // later gets its marks from workspace-view). A data file's marks are its own
  // JSON mistake's (_dataLint): a compile's marks and clears pass it by.
  highlightError(line: number, column: number): void {
    if (this._activePath === null || this.isData) return;
    this._pendingError = { line, column };
    if (!this._editor || !this._errorHighlight) return;
    this._applyPendingError();
  }

  highlightErrors(errors: Array<{ line: number; column: number }>): void {
    if (errors.length === 0 || this._activePath === null || this.isData) return;
    this._pendingError = errors[0];
    if (!this._editor || !this._errorHighlight) return;
    this._errorHighlight.setErrors(this._editor, errors);
  }

  /** Compiler warnings: same field as errors, rendered with the cm-warning-* classes. */
  highlightWarnings(warnings: Array<{ line: number; column: number }>): void {
    if (this._activePath === null || this.isData) return;
    this._pendingWarnings = warnings;
    if (!this._editor || !this._errorHighlight) return;
    if (warnings.length === 0) {
      this._errorHighlight.clearError(this._editor);
      return;
    }
    this._errorHighlight.setErrors(
      this._editor,
      warnings.map((w) => ({ line: w.line, column: w.column, severity: 'warning' as const })),
    );
  }

  clearError(): void {
    this._pendingError = null;
    this._pendingWarnings = [];
    if (!this._editor || !this._errorHighlight || this.isData) return;
    this._errorHighlight.clearError(this._editor);
  }

  private _applyPendingError(): void {
    if (!this._pendingError || !this._editor || !this._errorHighlight) return;
    const { line, column } = this._pendingError;
    this._errorHighlight.setError(this._editor, { line, column });
  }

  private _scrollToError(error: { line: number; column: number }): void {
    if (!this._editor) return;
    const doc = this._editor.state.doc;
    if (error.line >= 1 && error.line <= doc.lines) {
      const lineObj = doc.line(error.line);
      this._editor.dispatch({
        effects: this._cmModules!.view.EditorView.scrollIntoView(lineObj.from, { y: 'center' }),
      });
    }
  }

  render(): void {
    this.shadowRoot!.innerHTML = `
      <style>${styles}</style>

      <slot name="tabs"></slot>
      <div class="read-only-note" role="note" hidden>${FILE_ICONS.lock}<span>${READ_ONLY_NOTE}</span></div>
      <div id="editor-container"></div>
      <editor-zero-state hidden></editor-zero-state>
      <div class="read-only-tip" role="status" hidden></div>
      <div class="data-status" role="status" aria-live="polite"></div>
    `;
    this._syncReadOnly();
    this._syncZeroState();
  }
}

customElements.define('code-editor-pane', CodeEditorPane);
