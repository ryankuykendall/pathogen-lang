import { existsSync } from 'fs';
import { resolve, dirname, sep } from 'path';
import { defineConfig, type Plugin } from 'vitest/config';

// During .js → .ts migration, some .js files still import siblings via .js
// extensions that now only exist as .ts.  This plugin tries .ts when a .js
// import would otherwise 404.
function jsTsFallback(): Plugin {
  return {
    name: 'js-ts-fallback',
    enforce: 'pre',
    resolveId(source, importer) {
      if (!importer || !source.endsWith('.js')) return null;
      const abs = resolve(dirname(importer), source);
      if (existsSync(abs)) return null; // .js exists, nothing to do
      const tsPath = abs.replace(/\.js$/, '.ts');
      if (existsSync(tsPath)) return tsPath;
      // The blog's generated data (npm run build:blog; not in git): without it,
      // a stand-in, so the Pages worker's tests run in a fresh checkout.
      if (abs.endsWith(`${sep}website${sep}generated${sep}blog-data.js`)) {
        return resolve(import.meta.dirname, 'tests/fakes/blog-data.ts');
      }
      return null;
    },
  };
}

export default defineConfig({
  plugins: [jsTsFallback()],
  resolve: {
    // The language server and extension import the library by package name;
    // in tests that is the source, not a build that may be stale or missing.
    alias: [
      { find: /^pathogen-lang$/, replacement: resolve(import.meta.dirname, 'src/index.ts') },
      { find: /^pathogen-lang\/node$/, replacement: resolve(import.meta.dirname, 'src/node/index.ts') },
      // The extension's VS Code glue runs against a stand-in (tests/vscode-preview-panel.test.ts).
      { find: /^vscode$/, replacement: resolve(import.meta.dirname, 'tests/fakes/vscode.ts') },
    ],
  },
  test: {
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/cli.ts'],
    },
  },
});
