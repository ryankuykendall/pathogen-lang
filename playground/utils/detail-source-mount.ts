// Lazy-mounted CodeMirror 6 read-only editor for the workspace detail
// page (/u/:handle/:slug). Imported on first expand of the "View
// source" disclosure.
//
// Two reasons we use CodeMirror here instead of a hand-rolled <pre>
// with span coloring:
//   1. Single presentational code path. The playground editor uses the
//      same Lezer parser (window.PathogenLang.lezerParser in SPA
//      context, /dist/highlight.global.js here) wrapped in the same
//      LRLanguage. Drift between editor and read-only display is
//      structurally prevented.
//   2. Module-level caching. CodeMirror loads from esm.sh; if the
//      visitor has touched the playground in this session, the bundles
//      are warm in the browser cache and this mount is fast.
//
// Bundle weight is the cost: ~250KB raw / ~80KB gzipped across the
// CodeMirror modules. Best-effort — if any module fails to load, the
// caller (the boot script in renderWorkspaceDetailPage) falls back to
// the lightweight highlightPathogen <pre> swap from /dist/highlight.
// global.js.

//
// With several files (2e step 6; mockup v12 P1 to P5), View source is the
// viewer the snapshots page and the review modal use (<source-files>), opening
// on the main: mountSourceFiles below.

import { arrivedFiles, isSourceJson, waitingFiles } from './detail-source-files.js';

import type { MiniWorkspaceFiles } from '../components/blog/mini-workspace.js';
import type { SourceFiles } from '../components/shared/source-files.js';
import type { ServedSource, SourceJson } from './detail-source-files.js';
import type { SnapshotFilesEngine } from './snapshot-viewer-files.js';

interface MountResult {
  mounted: boolean;
  reason?: string;
}

const isDarkTheme = (): boolean => document.documentElement.getAttribute('data-active-theme') === 'dark';

/**
 * The small highlight bundle (the parser, a file's kind, pathogen.json), served by the
 * site: a plain URL, so bundlers and tests leave the import alone.
 */
const HIGHLIGHT_BUNDLE = '/dist/highlight.global.js';
const loadHighlightBundle = async (): Promise<unknown> => import(/* @vite-ignore */ HIGHLIGHT_BUNDLE);

/** The highlight bundle's engine calls (a file's kind, pathogen.json), when it loaded. */
function engineOf(mod: unknown): SnapshotFilesEngine | null {
  const lib = mod as Partial<SnapshotFilesEngine> | null;
  return typeof lib?.isModuleSource === 'function' && typeof lib.workspaceProjectFileText === 'function'
    ? (lib as SnapshotFilesEngine)
    : null;
}

/**
 * View source with several files: the viewer, shown at once with the main's text
 * (the page served it), the others loading from source.json in one request, and
 * Try again when it fails (P2, P4). The files are source.json's when it comes.
 */
export async function mountSourceFiles(
  preElement: HTMLPreElement,
  served: ServedSource,
  sourceUrl: string,
  loadHighlight: () => Promise<unknown> = loadHighlightBundle,
): Promise<MountResult> {
  const mainText = preElement.textContent ?? '';
  const fetchSource = async (): Promise<SourceJson | null> => {
    try {
      const res = await fetch(sourceUrl, { credentials: 'same-origin' });
      if (!res.ok) return null;
      const body: unknown = await res.json();
      return isSourceJson(body) ? body : null;
    } catch {
      return null;
    }
  };
  // The texts are asked for at once, while the viewer's own modules load.
  const first = fetchSource();
  let highlight: unknown = null;
  try {
    [, highlight] = await Promise.all([
      import('../components/shared/source-files.js'),
      loadHighlight().catch(() => null),
    ]);
  } catch (err) {
    return { mounted: false, reason: `the viewer failed to load: ${(err as Error).message}` };
  }
  // Without the engine there's no telling a file's kind and no pathogen.json, so the list
  // wouldn't match the summary's count: the page keeps the main's text, as without scripts.
  const engine = engineOf(highlight);
  if (!engine) return { mounted: false, reason: 'the highlight bundle failed to load' };
  const viewer = document.createElement('source-files') as SourceFiles;
  const show = (files: MiniWorkspaceFiles): void => {
    viewer.files = files.files;
    viewer.folders = files.folders;
    viewer.main = files.main;
    viewer.open = files.open;
  };
  show(waitingFiles(served, mainText, engine, 'loading'));
  const host = document.createElement('div');
  host.className = 'detail-source-files';
  host.append(viewer);
  preElement.replaceWith(host);
  viewer.activate().catch(() => undefined);

  // Each attempt answers only for itself: a Try again supersedes an answer still on its way.
  let attempt = 0;
  const load = async (request: Promise<SourceJson | null>): Promise<void> => {
    const at = ++attempt;
    const source = await request;
    if (at !== attempt) return;
    let arrived: MiniWorkspaceFiles | null = null;
    try {
      arrived = source ? arrivedFiles(source, engine, viewer.open) : null;
    } catch {
      // An answer that can't be shown is a failed one, with Try again: never a spinner forever.
    }
    show(arrived ?? waitingFiles(served, mainText, engine, 'failed', viewer.open));
  };
  viewer.addEventListener('source-files-retry', () => {
    show(waitingFiles(served, mainText, engine, 'loading', viewer.open));
    load(fetchSource()).catch(() => undefined);
  });
  load(first).catch(() => undefined);
  return { mounted: true };
}

// Minimal structural typing for the dynamically-imported CM modules.
// We use `unknown` at the boundaries and cast at call sites — the
// alternative (full d.ts of every esm.sh module) is more weight than
// it's worth for a single read-only mount.
type CmModule = Record<string, unknown>;

export async function mountReadOnlyEditor(preElement: HTMLPreElement, source: string): Promise<MountResult> {
  let state: CmModule;
  let view: CmModule;
  let language: CmModule;
  let oneDark: CmModule;
  let highlightMod: CmModule;
  try {
    [state, view, language, oneDark, highlightMod] = await Promise.all([
      import('https://esm.sh/@codemirror/state@6'),
      import('https://esm.sh/@codemirror/view@6'),
      import('https://esm.sh/@codemirror/language@6'),
      import('https://esm.sh/@codemirror/theme-one-dark@6'),
      loadHighlightBundle() as Promise<CmModule>,
    ]);
  } catch (err) {
    return { mounted: false, reason: `module load failed: ${(err as Error).message}` };
  }

  // The Lezer parser comes from our small bundle, not the 9MB compiler
  // global. Same parser the playground editor uses — keeping things in
  // sync structurally rather than by convention. Prefer the editor parser
  // (structured style-block highlighting via parseMixed).
  const mod = highlightMod as { lezerParser?: unknown; editorParser?: unknown };
  const lezerParser = mod.editorParser ?? mod.lezerParser;
  if (!lezerParser) {
    return { mounted: false, reason: 'lezerParser missing from highlight bundle' };
  }

  // Wrap the parser in an LRLanguage + LanguageSupport so CodeMirror's
  // syntaxHighlighting can decorate it. The languageData hint here only
  // affects keymap-driven behaviors (comment toggle, bracket matching);
  // not strictly needed for read-only but cheap to set and mirrors the
  // playground's pathogen-language.ts factory.
  const cmLanguage = language as {
    LRLanguage: { define(config: unknown): unknown };
    LanguageSupport: new (lang: unknown) => unknown;
    syntaxHighlighting(style: unknown): unknown;
    defaultHighlightStyle: unknown;
  };
  const lang = cmLanguage.LRLanguage.define({
    parser: lezerParser,
    languageData: {
      commentTokens: { line: '//' },
    },
  });
  const support = new cmLanguage.LanguageSupport(lang);

  // Theme: mirror the playground's light/dark setup. We read the active
  // theme from the same data attribute the global theme manager flips
  // (see playground/utils/theme.ts), and follow it when it changes (note 59,
  // found along the way: the code view picked one theme, once).
  const oneDarkMod = oneDark as { oneDarkTheme: unknown; oneDarkHighlightStyle: unknown };
  const themeExt = (dark: boolean): unknown[] =>
    dark
      ? [oneDarkMod.oneDarkTheme, cmLanguage.syntaxHighlighting(oneDarkMod.oneDarkHighlightStyle)]
      : [cmLanguage.syntaxHighlighting(cmLanguage.defaultHighlightStyle)];

  // Build the editor state. Read-only is the entire point of this
  // surface; we explicitly set it via EditorState.readOnly.of(true)
  // (not via the deprecated EditorView.editable.of(false)) so the
  // selection model + drawSelection() still work for copy/paste.
  const cmState = state as {
    EditorState: {
      create(config: unknown): unknown;
      readOnly: { of(v: boolean): unknown };
    };
    Compartment: new () => { of: (ext: unknown) => unknown; reconfigure: (ext: unknown) => unknown };
  };
  const cmView = view as {
    lineNumbers(): unknown;
    highlightSpecialChars(): unknown;
    drawSelection(): unknown;
    highlightActiveLine(): unknown;
    EditorView: { new (config: unknown): { dispatch: (tr: unknown) => void }; lineWrapping: unknown };
  };
  const theme = new cmState.Compartment();
  const editorState = cmState.EditorState.create({
    doc: source,
    extensions: [
      cmView.lineNumbers(),
      cmView.highlightSpecialChars(),
      cmView.drawSelection(),
      cmView.highlightActiveLine(),
      cmState.EditorState.readOnly.of(true),
      cmView.EditorView.lineWrapping,
      support,
      theme.of(themeExt(isDarkTheme())),
    ],
  });

  // Mount into a fresh host div, then swap the <pre>. Doing it as
  // a swap (instead of clearing the <pre> and mounting inside it)
  // means crawlers / no-JS visitors keep the unmodified <pre> in the
  // DOM until the swap completes — no flash of un-styled content.
  const host = document.createElement('div');
  host.className = 'detail-source-editor';
  const editor = new cmView.EditorView({ state: editorState, parent: host });
  preElement.replaceWith(host);
  const themeWatch = new MutationObserver(() => {
    // Gone from the page: stop watching.
    if (!host.isConnected) {
      themeWatch.disconnect();
      return;
    }
    editor.dispatch({ effects: theme.reconfigure(themeExt(isDarkTheme())) });
  });
  themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-active-theme'] });

  return { mounted: true };
}
