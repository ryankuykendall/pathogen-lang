/**
 * The playground declares the compiler's types by hand
 * (playground/types/compiler.d.ts) so it can type-check without a library
 * build. Its WarningCode union fell behind WARNING_CODES once (missing
 * non-finite, layer-transform and marker-space); this keeps the copy honest.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { WARNING_CODES } from '../src';

describe('playground WarningCode', () => {
  it('lists exactly WARNING_CODES, in order', () => {
    const declarations = readFileSync(join(__dirname, '../playground/types/compiler.d.ts'), 'utf8');
    const union = /export type WarningCode =([^;]+);/.exec(declarations)?.[1] ?? '';
    const codes = [...union.matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect(codes).toEqual([...WARNING_CODES]);
  });
});
