import { compile } from '../src';

import type { CompileOptions } from '../src';

/**
 * Compile source and return just the default layer's path data string.
 * Convenience wrapper for tests that don't need the full CompileResult.
 */
export function compilePath(source: string, options?: CompileOptions): string {
  return compile(source, options).layers[0]?.data ?? '';
}
