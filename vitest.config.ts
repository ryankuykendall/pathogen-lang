import { existsSync } from 'fs';
import { resolve, dirname } from 'path';
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
      return null;
    },
  };
}

export default defineConfig({
  plugins: [jsTsFallback()],
  test: {
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/cli.ts'],
    },
  },
});
