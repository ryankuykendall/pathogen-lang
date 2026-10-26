/**
 * src/host/ ships in the browser bundles (the playground global, the worker,
 * the VS Code webview), so it must never import Node built-ins; those belong
 * in src/node/, the `pathogen-lang/node` entry.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const HOST_DIR = join(__dirname, '../../src/host');

describe('src/host stays free of Node built-ins', () => {
  it.each(readdirSync(HOST_DIR).filter((f) => f.endsWith('.ts')))(
    '%s imports no node: or bare Node modules',
    (file) => {
      const text = readFileSync(join(HOST_DIR, file), 'utf8');
      const imports = [...text.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
      const nodeOnly = imports.filter(
        (spec) =>
          spec.startsWith('node:') || ['fs', 'fs/promises', 'path', 'os', 'crypto', 'url', 'module'].includes(spec),
      );
      expect(nodeOnly).toEqual([]);
    },
  );
});
