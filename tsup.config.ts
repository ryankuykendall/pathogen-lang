import { defineConfig } from 'tsup';

export default defineConfig([
  // Library builds
  {
    entry: ['src/index.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: true,
    clean: true,
  },
  // Browser global build
  {
    entry: ['src/index.ts'],
    format: ['iife'],
    globalName: 'PathogenLang',
    outExtension: () => ({ js: '.global.js' }),
    sourcemap: true,
  },
  // CLI build
  {
    entry: ['src/cli.ts'],
    format: ['esm'],
    sourcemap: true,
    banner: {
      js: '#!/usr/bin/env node',
    },
  },
  // Web Worker build
  {
    entry: ['src/worker.ts'],
    format: ['iife'],
    outExtension: () => ({ js: '.worker.js' }),
    sourcemap: true,
  },
  // Source-code highlighter — ESM browser bundle. Lazy-loaded by the
  // workspace detail page (/u/:handle/:slug) on first expand of the
  // "View source" disclosure. Smaller than dist/index.global.js
  // because it imports only the Lezer parser (and its transitive
  // @lezer/highlight prop source), not the evaluator or stdlib.
  //
  // noExternal: [/.*/] is critical — tsup's ESM default leaves bare
  // imports like `@lezer/lr` as external (suitable for libraries
  // consumed by another bundler) but the browser can't resolve them.
  // Force everything to inline so a single <script type="module">
  // dynamic-import can run standalone.
  {
    entry: ['src/highlight.ts'],
    format: ['esm'],
    outExtension: () => ({ js: '.global.js' }),
    sourcemap: true,
    noExternal: [/.*/],
  },
  // Shared pan/zoom controller — the single implementation consumed by every
  // surface that pans/zooms an SVG (workspace preview, blog mini-workspace,
  // BBWP, VS Code preview webview, thumbnail/legend modals). ESM + types power
  // the `pathogen-lang/pan-zoom` sub-path export; the IIFE global is loaded via
  // a <script> tag by surfaces that don't import ESM (the webview's inline
  // script and the pre-compiled-SVG mini-preview, which doesn't load the
  // compiler global at all). Self-contained (noExternal) so the global runs
  // standalone, like dist/highlight.global.js.
  {
    entry: { 'pan-zoom': 'src/ui/pan-zoom-controller.ts' },
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: true,
  },
  {
    entry: { 'pan-zoom': 'src/ui/pan-zoom-controller.ts' },
    format: ['iife'],
    globalName: 'PathogenPanZoom',
    outExtension: () => ({ js: '.global.js' }),
    sourcemap: true,
    noExternal: [/.*/],
  },
]);
