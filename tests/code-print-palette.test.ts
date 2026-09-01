import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { CODE_PRINT_COLORS, CODE_PRINT_DEFAULT } from '../playground/utils/code-print-palette';

// Drift guard: the export print palette hand-inlines the LIGHT theme's
// --code-* hexes (CSS vars can't survive SVG/PDF export). If someone
// retunes theme.css, this test fails and points at the module to update.

const themeCss = readFileSync(resolve(__dirname, '../playground/styles/theme.css'), 'utf8');

// The light values live in the first `:root` block, before any
// [data-theme='dark'] or @media override re-declares them. Taking the
// first occurrence of each var is therefore the light-theme value.
function firstVar(name: string): string {
  const m = new RegExp(`${name}:\\s*(#[0-9a-fA-F]{3,8})`).exec(themeCss);
  if (!m) throw new Error(`theme.css does not define ${name}`);
  return m[1].toLowerCase();
}

const VAR_FOR_CLASS: Record<string, string> = {
  kw: '--code-keyword',
  pr: '--code-pr',
  fn: '--code-fn',
  num: '--code-num',
  str: '--code-str',
  cm: '--code-comment',
  op: '--code-op',
  tp: '--code-tp',
  id: '--text-primary',
};

describe('code print palette', () => {
  it('covers every class the palette maps', () => {
    expect(Object.keys(CODE_PRINT_COLORS).sort()).toEqual(Object.keys(VAR_FOR_CLASS).sort());
  });

  for (const [cls, cssVar] of Object.entries(VAR_FOR_CLASS)) {
    it(`${cls} matches light-theme ${cssVar}`, () => {
      expect(CODE_PRINT_COLORS[cls].toLowerCase()).toBe(firstVar(cssVar));
    });
  }

  it('default fill matches light --text-primary', () => {
    expect(CODE_PRINT_DEFAULT.toLowerCase()).toBe(firstVar('--text-primary'));
  });
});
