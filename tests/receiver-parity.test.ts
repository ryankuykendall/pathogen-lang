import { describe, expect, it } from 'vitest';

import { compilePath } from './helpers';
import { TYPE_MEMBERS } from '../src/language-services/completion-data.generated';

/**
 * PathBlock and ProjectedPath are the same geometry in two coordinate spaces, so
 * their method surfaces should differ only where the space itself makes a method
 * meaningless. This pins that in both directions.
 *
 * It shipped broken once: `Command.block` is declared as a PathBlock in
 * pathogen-api.ts (the doc comment says it is really a ProjectedPath on layer and
 * projected sources), so completions offered `match.block.variableOffset()` while
 * the evaluator's ProjectedPath switch answered "Unknown ProjectedPath method".
 * Nothing else in the toolchain would have caught it: crossCheck() in
 * scripts/generate-completions.ts compares function names only and never
 * inspects @type interface methods.
 *
 * No hand-maintained parity list — the method set is read from TYPE_MEMBERS, the
 * generated artifact the editor itself consumes, and probed against the real
 * dispatch.
 */

/** Methods that belong to PathBlock alone, each with the reason. */
const PATHBLOCK_ONLY_BY_DESIGN: Record<string, string> = {
  project: 'a ProjectedPath is already projected; drawTo() repositions it',
};

const PB_METHODS = TYPE_MEMBERS.PathBlock.methods.map((m) => m.label);

/**
 * Call `method` with no arguments on a ProjectedPath and return the error text.
 * Arity and argument-type errors are expected and irrelevant here; only the
 * dispatch-gap message means the method is missing from the receiver.
 */
function dispatchError(method: string): string {
  try {
    compilePath(`let pp = @{ h 100 }.project(0, 0); pp.${method}(); M 0 0`);
    return '';
  } catch (e) {
    return (e as Error).message;
  }
}

describe('PathBlock / ProjectedPath parity', () => {
  it('reads a non-trivial PathBlock method set', () => {
    // Guards against a silently empty extraction making everything below vacuous.
    expect(PB_METHODS.length).toBeGreaterThan(30);
  });

  it('dispatches every PathBlock method on a ProjectedPath', () => {
    const gaps = PB_METHODS.filter(
      (m) => !(m in PATHBLOCK_ONLY_BY_DESIGN) && dispatchError(m).includes('Unknown ProjectedPath method'),
    );
    expect(gaps).toEqual([]);
  });

  it('keeps the by-design exclusions genuinely absent', () => {
    // Without this the exclusion list could quietly become decorative.
    for (const m of Object.keys(PATHBLOCK_ONLY_BY_DESIGN)) {
      expect(dispatchError(m), m).toMatch(/Unknown ProjectedPath method/);
    }
  });

  it('declares on ProjectedPath everything it declares on PathBlock', () => {
    // The direction that actually broke: completions promising what the runtime
    // refuses.
    const declared = new Set(TYPE_MEMBERS.ProjectedPath.methods.map((m) => m.label));
    const missing = PB_METHODS.filter((m) => !declared.has(m) && !(m in PATHBLOCK_ONLY_BY_DESIGN));
    expect(missing).toEqual([]);
  });
});
