// Playground language-services registration — the single place where every
// language-services feature is wired into the CodeMirror 6 editor. This is
// the Playground's analog of `packages/pathogen-language-server/src/server.ts`
// for the VS Code extension: both channels take the same set of features from
// `src/language-services/` and adapt them to their native surface (LSP
// handlers for VS Code, CodeMirror extensions for the Playground).
//
// The set of features wired here MUST match the `playgroundRequired: true`
// entries in `src/language-services/feature-catalog.ts` (minus entries with
// `playgroundDeferred: true`). The parity test at
// `tests/cross-channel-parity.test.ts` reads this file as text and asserts
// that every required feature's `fn` name appears below.
//
// Adding a new feature?
//   1. Update src/language-services/feature-catalog.ts first.
//   2. Add a wire-up function below.
//   3. Reference the wire-up from PLAYGROUND_WIRINGS so the parity test sees it.
//   4. Include the returned extensions in buildLanguageExtensions()'s result.

import { sharedCompletionSource } from './cm-completion-bridge.js';
import { hoverTooltipExtension } from './cm-hover-tooltip.js';
import { errorHighlightExtension } from './cm-error-highlight.js';

// ─── CodeMirror module shapes (dynamically imported from ESM CDN) ─────────────

interface CmStateFieldSpec<T> {
  create(state: CmEditorState): T;
  update(value: T, transaction: CmTransaction): T;
  provide?(field: unknown): unknown;
}

interface CmStateModule {
  StateField: {
    define<T>(spec: CmStateFieldSpec<T>): unknown;
  };
}

interface CmViewModule {
  EditorView: {
    updateListener: { of(fn: (update: CmViewUpdate) => void): unknown };
    domEventHandlers(handlers: {
      [event: string]: (event: Event, view: unknown) => boolean | void;
    }): unknown;
  };
  hoverTooltip(
    source: (view: unknown, pos: number, side: number) => unknown,
    options?: { hideOnChange?: boolean },
  ): unknown;
  showTooltip: {
    computeN(
      deps: unknown[],
      read: (state: CmEditorState) => readonly CmTooltip[],
    ): unknown;
  };
}

interface CmTooltip {
  pos: number;
  above?: boolean;
  strictSide?: boolean;
  create(view: unknown): { dom: HTMLElement };
}

interface CmAutocompleteModule {
  autocompletion(config: unknown): unknown;
  startCompletion(view: unknown): boolean;
}

interface CmEditorState {
  doc: { sliceString(from: number, to?: number): string; toString(): string };
  selection: { main: { head: number } };
  field<T>(field: unknown): T;
}

interface CmEditorView {
  state: CmEditorState;
}

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

export interface CmModulesForLanguageServices {
  state: CmStateModule;
  view: CmViewModule;
  autocomplete: CmAutocompleteModule;
}

// ─── Feature wire-ups ─────────────────────────────────────────────────────────

/**
 * Completion trigger-detector. CodeMirror 6's `autocompletion()` does not
 * auto-open the completion popup on non-word characters. When the user types
 * one of the LSP trigger characters (`.`, `$` for completions; `(`, `,` for
 * signature help) this extension manually calls `startCompletion()` so the
 * popup appears without Ctrl+Space. The completion source itself is the
 * shared language-services `getCompletions` function.
 *
 * Wired features: getCompletions. When signature help is wired in Phase C1
 * it will reuse this same trigger extension for `(` and `,`.
 */
const COMPLETION_TRIGGER_CHARS = new Set(['.', '$', '(', ',']);

function wireCompletionTriggers(cm: CmModulesForLanguageServices): unknown {
  return cm.view.EditorView.updateListener.of((update: CmViewUpdate) => {
    if (!update.docChanged) return;
    if (!update.transactions.some((tr) => tr.isUserEvent('input.type'))) return;
    const head = update.state.selection.main.head;
    if (head === 0) return;
    const charBefore = update.state.doc.sliceString(head - 1, head);
    if (COMPLETION_TRIGGER_CHARS.has(charBefore)) {
      cm.autocomplete.startCompletion(update.view);
    }
  });
}

/**
 * Completion wire-up. Uses the shared `getCompletions` via
 * `sharedCompletionSource` from cm-completion-bridge.ts. Falls through to the
 * legacy ad-hoc `svgPathCompletions` for any feature surface the shared
 * engine doesn't cover yet.
 *
 * Wired features: getCompletions.
 */
function wireCompletion(
  cm: CmModulesForLanguageServices,
  legacyFallback: unknown,
): unknown {
  return cm.autocomplete.autocompletion({
    override: [sharedCompletionSource, legacyFallback],
  });
}

/**
 * Hover wire-up. Uses the shared `getHoverInfo`.
 *
 * Wired features: getHoverInfo.
 */
function wireHover(cm: CmModulesForLanguageServices): unknown[] {
  return hoverTooltipExtension(cm.view as never);
}

/**
 * Diagnostics wire-up. Returns the CodeMirror extension for rendering error
 * squiggles plus imperative handles used by workspace-view to push diagnostic
 * results. Diagnostics come from the shared `getDiagnostics` function (called
 * by workspace-view's `showError()` after compilation), then are dispatched
 * into CodeMirror via the handle returned here.
 *
 * Wired features: getDiagnostics.
 */
function wireDiagnostics(cm: CmModulesForLanguageServices): ErrorHighlightHandle {
  return errorHighlightExtension(cm.state as never, cm.view as never) as ErrorHighlightHandle;
}

/**
 * Signature help wire-up. Shows a floating tooltip with the active parameter
 * highlighted while the cursor sits inside a function call's argument list.
 * Re-computed on every doc/selection change using the shared
 * `getSignatureHelp` language-services function.
 *
 * The completion trigger-detector (wireCompletionTriggers) also fires on `(`
 * and `,`, so the tooltip can appear at the moment the user enters an
 * argument position without requiring a manual refresh.
 *
 * Wired features: getSignatureHelp.
 */
function wireSignatureHelp(cm: CmModulesForLanguageServices): unknown[] {
  const services = window.SvgPathExtended;
  if (!services || !services.getSignatureHelp || !services.StringTextDocument) {
    console.warn('Language services not available — signature help disabled');
    return [];
  }
  const getSignatureHelp = services.getSignatureHelp;
  const StringTextDocumentCtor = services.StringTextDocument;

  function computeTooltip(state: CmEditorState): readonly CmTooltip[] {
    const source = state.doc.toString();
    const head = state.selection.main.head;
    const { line, character } = offsetToPosition(source, head);
    const doc = new StringTextDocumentCtor(source);
    const help = getSignatureHelp(doc, { line, character });
    if (!help || help.signatures.length === 0) return [];

    const sig = help.signatures[help.activeSignature] ?? help.signatures[0];
    const activeParam = help.activeParameter;

    return [
      {
        pos: head,
        above: true,
        strictSide: true,
        create() {
          const dom = document.createElement('div');
          dom.className = 'cm-signature-help';
          dom.setAttribute('role', 'tooltip');
          renderSignature(dom, sig, activeParam);
          return { dom };
        },
      },
    ];
  }

  const sigHelpField = cm.state.StateField.define<readonly CmTooltip[]>({
    create(state: CmEditorState) {
      return computeTooltip(state);
    },
    update(tooltips: readonly CmTooltip[], tr: CmTransaction) {
      // Re-compute on doc change or selection change; otherwise reuse.
      if (!tr.docChanged && !tr.selection) return tooltips;
      return computeTooltip(tr.state);
    },
    provide(field: unknown) {
      return cm.view.showTooltip.computeN([field], (state: CmEditorState) => state.field<readonly CmTooltip[]>(field));
    },
  });

  return [sigHelpField];
}

/** Convert a character offset into an LSP-style 0-based Position. */
function offsetToPosition(source: string, offset: number): { line: number; character: number } {
  let line = 0;
  let lineStart = 0;
  for (let i = 0; i < offset && i < source.length; i++) {
    if (source.charCodeAt(i) === 10) {
      line++;
      lineStart = i + 1;
    }
  }
  return { line, character: offset - lineStart };
}

/** Render a SignatureInformation into the tooltip DOM, bolding the active param. */
function renderSignature(
  dom: HTMLElement,
  sig: { label: string; documentation?: string; parameters: Array<{ label: string }> },
  activeParam: number,
): void {
  const label = sig.label;
  const params = sig.parameters;

  const labelEl = document.createElement('div');
  labelEl.className = 'cm-signature-label';

  // If we can locate the active parameter's label inside sig.label, bold it.
  // Otherwise just render the label verbatim.
  const activeParamLabel = params[activeParam]?.label;
  if (activeParamLabel) {
    const idx = label.indexOf(activeParamLabel);
    if (idx >= 0) {
      labelEl.appendChild(document.createTextNode(label.slice(0, idx)));
      const strong = document.createElement('strong');
      strong.textContent = activeParamLabel;
      labelEl.appendChild(strong);
      labelEl.appendChild(document.createTextNode(label.slice(idx + activeParamLabel.length)));
    } else {
      labelEl.textContent = label;
    }
  } else {
    labelEl.textContent = label;
  }
  dom.appendChild(labelEl);

  if (sig.documentation) {
    const docEl = document.createElement('div');
    docEl.className = 'cm-signature-doc';
    docEl.textContent = sig.documentation;
    dom.appendChild(docEl);
  }
}

/**
 * Rename wire-up. Bound to F2 (VS Code convention). When invoked, it calls
 * prepareRename to validate the symbol, prompts the user for a new name,
 * then calls getRenameEdits to produce the edit set and dispatches a single
 * transaction applying all of them.
 *
 * Wired features: prepareRename, getRenameEdits.
 *
 * The UI is a simple `window.prompt()` for now — a proper inline widget is
 * a nice-to-have follow-up. prompt() is synchronous, focus-safe, and zero
 * additional component surface.
 *
 * Exported so the editor pane can bind it to a keymap entry.
 */
export function runRename(editorView: unknown): boolean {
  const services = window.SvgPathExtended;
  if (!services || !services.prepareRename || !services.getRenameEdits || !services.StringTextDocument) {
    console.warn('Language services not available — rename disabled');
    return false;
  }

  const view = editorView as {
    state: {
      doc: { toString(): string; length: number };
      selection: { main: { head: number } };
    };
    dispatch(tr: unknown): void;
  };
  const source = view.state.doc.toString();
  const head = view.state.selection.main.head;
  const { line, character } = offsetToPosition(source, head);

  const doc = new services.StringTextDocument(source);
  const prep = services.prepareRename(doc, { line, character });
  if (!prep) {
    // Not a renameable symbol (keyword, builtin, or no word under cursor).
    return false;
  }

  const newName = window.prompt(`Rename "${prep.placeholder}" to:`, prep.placeholder);
  if (!newName || newName === prep.placeholder) return false;
  // Reject invalid identifiers at the UI layer.
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(newName)) {
    window.alert(`Invalid identifier: "${newName}"`);
    return false;
  }

  const edits = services.getRenameEdits(doc, { line, character }, newName);
  if (!edits || edits.length === 0) return false;

  // Apply all edits in a single transaction. Sort by descending start
  // offset so earlier edits don't shift later ones' positions.
  const changes = edits
    .map((edit) => ({
      from: positionToOffset(source, edit.range.start),
      to: positionToOffset(source, edit.range.end),
      insert: edit.newText,
      _sortKey: positionToOffset(source, edit.range.start),
    }))
    .sort((a, b) => b._sortKey - a._sortKey)
    .map(({ from, to, insert }) => ({ from, to, insert }));

  view.dispatch({
    changes,
    userEvent: 'rename',
  });
  return true;
}

/**
 * Find-references wire-up. Bound to Shift+F12 (VS Code convention). When
 * invoked, it calls the shared `getReferences` language-services function,
 * converts each returned range to a CodeMirror offset range, and turns the
 * editor selection into a multi-cursor that covers every reference.
 *
 * The user can then Escape to collapse back to the primary cursor, navigate
 * between references, or edit them all simultaneously.
 *
 * Wired features: getReferences.
 *
 * Exported so the editor pane can bind it to a keymap entry.
 */
export function runFindReferences(editorView: unknown): boolean {
  const services = window.SvgPathExtended;
  if (!services || !services.getReferences || !services.StringTextDocument) {
    console.warn('Language services not available — find references disabled');
    return false;
  }

  const view = editorView as {
    state: {
      doc: { toString(): string; length: number };
      selection: { main: { head: number } };
    };
    dispatch(tr: unknown): void;
  };
  const source = view.state.doc.toString();
  const head = view.state.selection.main.head;
  const { line, character } = offsetToPosition(source, head);

  const locations = services.getReferences(
    new services.StringTextDocument(source),
    { line, character },
    true,
  );
  if (!locations || locations.length === 0) return false;

  // Convert each location to a CodeMirror selection range. The
  // language-services Range covers the whole identifier, so set anchor at
  // start and head at end — user can collapse via Escape.
  const ranges = locations
    .map((loc) => ({
      anchor: positionToOffset(source, loc.range.start),
      head: positionToOffset(source, loc.range.end),
    }))
    // Sort so the primary selection (first) is the one closest to the
    // user's current cursor — more intuitive for navigation.
    .sort((a, b) => {
      const distA = Math.abs(a.anchor - head);
      const distB = Math.abs(b.anchor - head);
      return distA - distB;
    });

  view.dispatch({
    selection: { ranges, main: 0 },
    scrollIntoView: true,
    userEvent: 'select.references',
  });
  return true;
}

/**
 * Go-to-definition wire-up. Registers a Ctrl/Cmd+click handler on the editor
 * DOM that calls the shared `getDefinition` function, converts the returned
 * range to an offset, and dispatches a CodeMirror transaction that moves
 * the cursor to the declaration and scrolls it into view.
 *
 * Wired features: getDefinition.
 */
function wireGoToDefinition(cm: CmModulesForLanguageServices): unknown {
  const services = window.SvgPathExtended;
  if (!services || !services.getDefinition || !services.StringTextDocument) {
    console.warn('Language services not available — go-to-definition disabled');
    return [];
  }
  const getDefinition = services.getDefinition;
  const StringTextDocumentCtor = services.StringTextDocument;

  return cm.view.EditorView.domEventHandlers({
    mousedown(event: Event, viewArg: unknown) {
      const ev = event as MouseEvent;
      // Only trigger on Ctrl/Cmd + left-click.
      if (!(ev.metaKey || ev.ctrlKey) || ev.button !== 0) return false;
      const view = viewArg as {
        state: {
          doc: { toString(): string; length: number };
          selection: { main: { head: number; anchor: number } };
        };
        posAtCoords(coords: { x: number; y: number }): number | null;
        dispatch(tr: unknown): void;
      };
      const pos = view.posAtCoords({ x: ev.clientX, y: ev.clientY });
      if (pos == null) return false;
      const source = view.state.doc.toString();
      const { line, character } = offsetToPosition(source, pos);
      const def = getDefinition(new StringTextDocumentCtor(source), { line, character });
      if (!def) return false;
      const targetOffset = positionToOffset(source, def.range.start);
      ev.preventDefault();
      view.dispatch({
        selection: { anchor: targetOffset, head: targetOffset },
        scrollIntoView: true,
        userEvent: 'navigate.definition',
      });
      return true;
    },
  });
}

/**
 * Format the current editor document using the shared `formatDocument`
 * language-services function. Designed to be called imperatively from a
 * keyboard shortcut or menu button — it reads the current editor state,
 * runs the formatter, and dispatches a transaction that replaces the
 * document content while preserving the cursor offset as best it can.
 *
 * Wired features: formatDocument.
 *
 * Exported so it can be called from code-editor-pane.ts (keybinding) and
 * playground-header.ts (menu button).
 */
export function runFormatDocument(editorView: unknown): boolean {
  const services = window.SvgPathExtended;
  if (!services || !services.formatDocument || !services.StringTextDocument) {
    console.warn('Language services not available — format disabled');
    return false;
  }

  const view = editorView as {
    state: {
      doc: { toString(): string; length: number };
      selection: { main: { head: number; anchor: number } };
    };
    dispatch(tr: unknown): void;
  };

  const source = view.state.doc.toString();
  const doc = new services.StringTextDocument(source);
  const edits = services.formatDocument(doc);
  if (edits.length === 0) return false;

  // formatDocument returns a single whole-document replacement, but be
  // defensive: apply every edit in one transaction, sorted by start offset.
  const changes = edits.map((edit) => ({
    from: positionToOffset(source, edit.range.start),
    to: positionToOffset(source, edit.range.end),
    insert: edit.newText,
  }));

  // Preserve cursor as a best-effort: clamp to new doc length.
  const prevHead = view.state.selection.main.head;
  const newDocLength = edits.length === 1
    ? edits[0].newText.length
    : source.length; // multi-edit: rough estimate
  const newHead = Math.min(prevHead, newDocLength);

  view.dispatch({
    changes,
    selection: { anchor: newHead, head: newHead },
    userEvent: 'format',
  });
  return true;
}

/** Convert an LSP-style 0-based Position to a character offset in source. */
function positionToOffset(source: string, pos: { line: number; character: number }): number {
  let offset = 0;
  let line = 0;
  for (let i = 0; i < source.length && line < pos.line; i++) {
    if (source.charCodeAt(i) === 10) line++;
    offset = i + 1;
  }
  return offset + pos.character;
}

// ─── Public entry point ───────────────────────────────────────────────────────

export interface ErrorHighlightHandle {
  extension: unknown[];
  setError(editorView: unknown, position: { line: number; column: number }): void;
  setErrors(editorView: unknown, positions: Array<{ line: number; column: number }>): void;
  clearError(editorView: unknown): void;
}

export interface LanguageExtensionsResult {
  /**
   * Flat list of CodeMirror extensions to spread into EditorState.create's
   * `extensions` array, in the order they should be applied.
   */
  extensions: unknown[];
  /**
   * Imperative handle for the diagnostics extension. Exposed so that
   * workspace-view can call setErrors() / clearError() after compilation.
   */
  errorHighlight: ErrorHighlightHandle;
}

/**
 * Build the full set of CodeMirror extensions that wire the shared
 * language-services layer into the Playground editor. Call this once from
 * `code-editor-pane.ts` during editor creation and spread `extensions` into
 * the `EditorState.create` config.
 *
 * @param cm            CodeMirror modules dynamically imported from ESM CDN.
 * @param legacyFallback The legacy ad-hoc `svgPathCompletions` fallback source.
 */
export function buildLanguageExtensions(
  cm: CmModulesForLanguageServices,
  legacyFallback: unknown,
): LanguageExtensionsResult {
  // Feature wire-ups — the order here matches the visual order in the
  // parity test. Every feature listed as playgroundRequired:true (and not
  // playgroundDeferred) in src/language-services/feature-catalog.ts must
  // have a call site below that references its fn name.
  //
  // Wired features:
  //   - getCompletions      → wireCompletion / wireCompletionTriggers
  //   - getHoverInfo        → wireHover
  //   - getDiagnostics      → wireDiagnostics
  //   - getSignatureHelp    → wireSignatureHelp (shares trigger detector)
  //   - formatDocument      → runFormatDocument (keybinding + header button)
  //   - getDefinition       → wireGoToDefinition (Ctrl/Cmd+click)
  //   - getReferences       → runFindReferences (Shift+F12 → multi-cursor)
  //   - prepareRename       → runRename (F2 → window.prompt)
  //   - getRenameEdits      → runRename (F2 → multi-edit transaction)
  //
  // Catalog-deferred follow-ups (playgroundDeferred: true):
  //   - getDocumentSymbols  → outline panel component
  //   - getCodeActions      → gutter lightbulb + quick-pick popover
  //   - getRefactorActions  → same gutter lightbulb
  //   - getInlayHints       → preferences toggle + decoration widgets

  const completion = wireCompletion(cm, legacyFallback);
  const triggers = wireCompletionTriggers(cm);
  const hover = wireHover(cm);
  const signatureHelp = wireSignatureHelp(cm);
  const goToDefinition = wireGoToDefinition(cm);
  const errorHighlight = wireDiagnostics(cm);

  return {
    extensions: [
      completion,
      triggers,
      ...hover,
      ...signatureHelp,
      goToDefinition,
      ...errorHighlight.extension,
    ],
    errorHighlight,
  };
}

// ─── Parity test anchor ───────────────────────────────────────────────────────
//
// The parity test in tests/cross-channel-parity.test.ts greps this file for
// each non-deferred feature's fn name from LANGUAGE_FEATURES. Do not list
// deferred features here — update the catalog and move the function below
// when wiring a new feature, so the test only sees features that are
// actually implemented.
