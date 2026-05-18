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

interface MountResult {
  mounted: boolean;
  reason?: string;
}

// Minimal structural typing for the dynamically-imported CM modules.
// We use `unknown` at the boundaries and cast at call sites — the
// alternative (full d.ts of every esm.sh module) is more weight than
// it's worth for a single read-only mount.
type CmModule = Record<string, unknown>;

export async function mountReadOnlyEditor(
  preElement: HTMLPreElement,
  source: string,
): Promise<MountResult> {
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
      import(/* @vite-ignore */ '/dist/highlight.global.js'),
    ]);
  } catch (err) {
    return { mounted: false, reason: `module load failed: ${(err as Error).message}` };
  }

  // The Lezer parser comes from our small bundle, not the 9MB compiler
  // global. Same parser the playground editor uses — keeping things in
  // sync structurally rather than by convention.
  const lezerParser = (highlightMod as { lezerParser?: unknown }).lezerParser;
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
  // (see playground/utils/theme.ts). If the visitor toggles theme after
  // mount we don't currently swap — defer that until the page actually
  // surfaces a theme toggle on the detail page route.
  const isDark = document.documentElement.getAttribute('data-active-theme') === 'dark';
  const oneDarkMod = oneDark as { oneDarkTheme: unknown; oneDarkHighlightStyle: unknown };
  const themeExt = isDark
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
  };
  const cmView = view as {
    lineNumbers(): unknown;
    highlightSpecialChars(): unknown;
    drawSelection(): unknown;
    highlightActiveLine(): unknown;
    EditorView: { new (config: unknown): unknown; lineWrapping: unknown };
  };
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
      ...themeExt,
    ],
  });

  // Mount into a fresh host div, then swap the <pre>. Doing it as
  // a swap (instead of clearing the <pre> and mounting inside it)
  // means crawlers / no-JS visitors keep the unmodified <pre> in the
  // DOM until the swap completes — no flash of un-styled content.
  const host = document.createElement('div');
  host.className = 'detail-source-editor';
  new cmView.EditorView({ state: editorState, parent: host });
  preElement.replaceWith(host);

  return { mounted: true };
}
