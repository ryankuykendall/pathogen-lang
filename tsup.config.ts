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
]);
