/**
 * Result typing for `query(sel)` / `queryAll(sel)`: the noun of the selector's
 * rightmost compound names the Pathogen type that comes back. The generator
 * skips union return types on purpose, so this is the single hand rule that
 * types query results (type-inference-ast.ts, member-resolution.ts).
 */
import { QUERY_NOUNS, queryNounOf } from '../evaluator/path-query';

import type { QueryNoun } from '../evaluator/path-query';

const NOUN_TYPES: Record<QueryNoun, string> = {
  command: 'Command',
  call: 'Call',
  endpoint: 'Endpoint',
  segment: 'Segment',
  subpath: 'Subpath',
};

/**
 * Pathogen type name for a `query(selector)` result, or null when the noun
 * cannot be determined. Falls back to a lexical guess (the leading identifier
 * of the first selector's last compound) so a selector that is mid-typing or
 * carries `${}` interpolation still types.
 */
export function queryResultType(selector: string): string | null {
  const parsed = queryNounOf(selector);
  if (parsed) return NOUN_TYPES[parsed];
  const first = selector.split(',')[0].trim();
  const lastCompound = first.split(/\s+/).filter(Boolean).pop() ?? '';
  const ident = /^([a-z]+)/.exec(lastCompound)?.[1];
  if (ident && (QUERY_NOUNS as readonly string[]).includes(ident)) return NOUN_TYPES[ident as QueryNoun];
  return null;
}

/** Strip the quotes of a string-literal argument as it appears in source text. */
export function unquoteSelector(argText: string): string | null {
  const m = /^\s*(['"`])([\s\S]*)\1\s*$/.exec(argText);
  return m ? m[2] : null;
}
