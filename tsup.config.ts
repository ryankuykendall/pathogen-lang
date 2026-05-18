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
]);
