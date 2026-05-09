// Bridge-level test for playground/utils/cm-completion-bridge.ts.
//
// The bridge turns language-services' getCompletions into a CodeMirror
// completion source. It reads its dependencies off window.PathogenLang, so
// this test injects the real language-services implementations onto that
// global before importing the bridge.
//
// This test specifically protects the fix for the 2026-04-10 user bug where
// `bg.` after a PathLayer declaration produced a missing-semicolon error
// instead of member completions. The underlying completion engine is covered
// by completion.test.ts; this file verifies the playground's adapter around
// that engine does not drop the result on the way to CodeMirror.

import { describe, it, expect, beforeAll } from 'vitest';
import { StringTextDocument } from '../../src/language-services/document';
import { getCompletions } from '../../src/language-services/completion';

// Populate the global the bridge expects before importing the bridge module.
beforeAll(() => {
  (globalThis as unknown as { window: { PathogenLang: unknown } }).window = {
    PathogenLang: {
      StringTextDocument,
      getCompletions,
    },
  };
});

// CodeMirror's CompletionContext shape — the minimum the bridge accesses.
type BridgeContext = {
  state: { doc: { toString(): string } };
  pos: number;
  explicit: boolean;
  matchBefore(regexp: RegExp): { from: number; to: number; text: string } | null;
};

function makeContext(source: string, explicit = false): BridgeContext {
  return {
    state: { doc: { toString: () => source } },
    pos: source.length,
    explicit,
    matchBefore(regexp: RegExp) {
      // Mirror CodeMirror's matchBefore: return the longest suffix of `source`
      // ending at the cursor that matches `regexp`. Anchoring with `$`
      // ensures we find only matches whose end equals source.length.
      const anchored = new RegExp(`(?:${regexp.source})$`, regexp.flags.replace('g', ''));
      const m = source.match(anchored);
      if (!m) return null;
      const text = m[0];
      const from = source.length - text.length;
      return { from, to: source.length, text };
    },
  };
}

describe('sharedCompletionSource (cm-completion-bridge)', () => {
  it('returns PathLayer member completions for `bg.` after style block + apply block', async () => {
    // Dynamic import so the beforeAll global shim is in place first.
    const { sharedCompletionSource } = await import('../../playground/utils/cm-completion-bridge.js');

    const source =
      "let bg = PathLayer('bg') ${ fill: '#f00'; stroke: none; };\n" +
      'bg.apply {\n' +
      '  rect(0, 0, 600, 600);\n' +
      '}\n' +
      'bg.';

    const result = sharedCompletionSource(makeContext(source) as unknown as Parameters<typeof sharedCompletionSource>[0]);
    expect(result).not.toBeNull();
    const labels = result!.options.map((o) => o.label);
    expect(labels).toContain('apply');
    expect(labels).toContain('ctx');
    expect(labels).toContain('name');
    expect(labels).toContain('styles');
  });

  it('returns null for an empty buffer without explicit trigger', async () => {
    const { sharedCompletionSource } = await import('../../playground/utils/cm-completion-bridge.js');
    const ctx = makeContext('');
    const result = sharedCompletionSource(ctx as unknown as Parameters<typeof sharedCompletionSource>[0]);
    // Empty word at non-explicit position → bridge bails before hitting the engine.
    expect(result).toBeNull();
  });

  it('returns member completions for Point after variable assignment', async () => {
    const { sharedCompletionSource } = await import('../../playground/utils/cm-completion-bridge.js');
    const source = 'let p = Point(10, 20);\np.';
    const result = sharedCompletionSource(makeContext(source) as unknown as Parameters<typeof sharedCompletionSource>[0]);
    expect(result).not.toBeNull();
    const labels = result!.options.map((o) => o.label);
    expect(labels).toContain('x');
    expect(labels).toContain('y');
  });
});
