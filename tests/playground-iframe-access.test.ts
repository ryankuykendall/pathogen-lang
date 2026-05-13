// Regression backstop for the iframe migration in commit 354c4b9.
//
// The compiled SVG render surface lives inside a sandboxed iframe
// (`playground/utils/preview-iframe.ts`). The `#preview` element is
// reachable only via `previewPane.preview` (which reads `_iframeDoc`),
// NOT via `previewPane.shadowRoot.querySelector('#preview')` — the
// shadow root contains the iframe wrapper, not the SVG.
//
// Earlier commits left six stale `previewPane.shadowRoot?.querySelector('#preview')`
// callsites in `playground/components/workspace-view.ts` that silently
// no-op'd the entire thumbnail pipeline (auto-gen, Set Thumbnail crop
// modal, beforeunload save) and the Copy SVG / Export Legend menu
// items. This test fails if anyone reintroduces that pattern.

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const PLAYGROUND_ROOT = resolve(__dirname, '..', 'playground');

// The pattern: any expression that chains `previewPane` -> `shadowRoot`
// and then asks for `#preview`. Tolerate optional-chaining, casts, and
// whitespace between the tokens.
const STALE_PATTERN = /previewPane[\s\S]{0,80}?shadowRoot[\s\S]{0,80}?['"`]#preview['"`]/;

// Allow the one file that legitimately mentions the legacy pattern in a
// prose comment explaining why it changed.
const ALLOWED_FILES = new Set<string>([
  'components/svg-preview-pane.ts',
]);

function collectSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      collectSourceFiles(full, out);
    } else if (/\.(ts|js)$/.test(entry) && !/\.d\.ts$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

describe('playground iframe access', () => {
  it('does not use previewPane.shadowRoot to reach #preview', () => {
    const files = collectSourceFiles(PLAYGROUND_ROOT);
    const offenders: string[] = [];

    for (const file of files) {
      const rel = relative(PLAYGROUND_ROOT, file);
      if (ALLOWED_FILES.has(rel)) continue;
      const source = readFileSync(file, 'utf8');
      if (STALE_PATTERN.test(source)) {
        offenders.push(rel);
      }
    }

    expect(offenders, `Stale previewPane.shadowRoot...#preview pattern. The #preview SVG lives inside the sandboxed iframe; use previewPane.preview instead.`).toEqual([]);
  });
});
