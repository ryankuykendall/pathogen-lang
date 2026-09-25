import { describe, expect, it } from 'vitest';

import { compilePath } from './helpers';
import { TYPE_MEMBERS, TYPE_METHOD_RETURNS } from '../src/language-services/completion-data.generated';

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

/**
 * Return-type parity. The presence checks above caught a method missing from a
 * receiver; they could not catch a method PRESENT on both but declared with the
 * wrong return type — which is how ISSUE-025 and D4 survived, with six methods
 * on a ProjectedPath declared to return a ProjectedPath while the runtime handed
 * back a PathBlock.
 *
 * The probe uses the one member each kind has that the other does not:
 * `toPathBlock` exists only on a ProjectedPath, `project` only on a PathBlock.
 *
 * Audit: project-docs/placement-audit/ V1.
 */
describe('declared return types match the runtime', () => {
  // A CLOSED receiver, so the boolean ops are usable: an open path makes them
  // throw for an unrelated reason, which the probe would read as "the member
  // exists" and silently invert the answer.
  const RECV = '@{ h 40 v 40 h -40 z }.project(10, 10)';

  /** 'PathBlock' | 'ProjectedPath' | null (neither, or the call itself failed). */
  function runtimeKind(expr: string): string | null {
    const probe = (member: string): boolean => {
      try {
        compilePath(`let pp = ${RECV}; let r = ${expr}; r.${member}; M 0 0`);
        return true;
      } catch (e) {
        return !/Unknown (PathBlock|ProjectedPath) method/.test((e as Error).message);
      }
    };
    if (probe('toPathBlock()')) return 'ProjectedPath';
    if (probe('project(0, 0)')) return 'PathBlock';
    return null;
  }

  const CASES: [expr: string, declared: string][] = [
    ['pp.subPath(0.2, 0.8)', 'PathBlock'],
    ['pp.union(@{ h 40 v 40 h -40 z }.project(20, 20))', 'PathBlock'],
    ['pp.difference(@{ h 40 v 40 h -40 z }.project(20, 20))', 'PathBlock'],
    ['pp.offset(5)', 'ProjectedPath'],
    ['pp.reverse()', 'ProjectedPath'],
    ['pp.toPathBlock()', 'PathBlock'],
    ['pp.drawTo(0, 0)', 'ProjectedPath'],
  ];

  for (const [expr, declared] of CASES) {
    it(`${expr} really returns a ${declared}`, () => {
      expect(runtimeKind(expr)).toBe(declared);
    });
  }

  it('agrees with what the generated completion data promises', () => {
    const returns = TYPE_METHOD_RETURNS.ProjectedPath;
    expect(returns.subPath).toBe('PathBlock');
    expect(returns.union).toBe('PathBlock');
    expect(returns.difference).toBe('PathBlock');
    expect(returns.intersection).toBe('PathBlock');
    expect(returns.xor).toBe('PathBlock');
    expect(returns.offset).toBe('ProjectedPath');
  });
});
