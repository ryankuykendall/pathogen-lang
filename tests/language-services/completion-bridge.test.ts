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
import { getCompletions, isStylePropertyNamePosition } from '../../src/language-services/completion';

// Populate the global the bridge expects before importing the bridge module.
beforeAll(() => {
  (globalThis as unknown as { window: { PathogenLang: unknown } }).window = {
    PathogenLang: {
      StringTextDocument,
      getCompletions,
      isStylePropertyNamePosition,
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

// Regression suite for the 2026-07-13 audit: the `stroke-` → `stroke-stroke-width`
// double-insert (replacement range must cover the whole hyphenated prefix in
// style property-name position, and ONLY there) and snippet apply behavior.
describe('style property replacement range (hyphen handling)', () => {
  it('starts the replacement at the beginning of the hyphenated prefix in a style block', async () => {
    const { sharedCompletionSource } = await import('../../playground/utils/cm-completion-bridge.js');
    const source = 'let s = ${ stroke-w';
    const result = sharedCompletionSource(makeContext(source) as unknown as Parameters<typeof sharedCompletionSource>[0]);
    expect(result).not.toBeNull();
    // Replacing [from, pos) with 'stroke-width' must consume the typed
    // 'stroke-w', so `from` sits at the 's' of 'stroke-w'.
    expect(result!.from).toBe(source.indexOf('stroke-w'));
    expect(result!.options.map((o) => o.label)).toContain('stroke-width');
  });

  it('does NOT swallow subtraction operands outside style blocks', async () => {
    const { sharedCompletionSource } = await import('../../playground/utils/cm-completion-bridge.js');
    const source = 'let ci = 4;\nlet x = a-ci';
    const result = sharedCompletionSource(makeContext(source) as unknown as Parameters<typeof sharedCompletionSource>[0]);
    expect(result).not.toBeNull();
    // `-` is an operator here: the word being completed is just `ci`.
    expect(result!.from).toBe(source.lastIndexOf('ci'));
  });
});

describe('snippet apply (manual fallback, no native snippet())', () => {
  type ApplyOption = {
    label: string;
    apply?: (view: unknown, completion: unknown, from: number, to: number) => void;
  };

  /** Minimal fake EditorView capturing the dispatched transaction. */
  function makeFakeView(doc: string) {
    const dispatched: Array<{
      changes: { from: number; to: number; insert: string };
      selection: { anchor: number; head?: number };
    }> = [];
    return {
      view: { state: { doc: { toString: () => doc } }, dispatch: (tr: never) => void dispatched.push(tr) },
      dispatched,
    };
  }

  async function getOption(source: string, label: string): Promise<{ option: ApplyOption; from: number }> {
    const { sharedCompletionSource } = await import('../../playground/utils/cm-completion-bridge.js');
    const result = sharedCompletionSource(makeContext(source) as unknown as Parameters<typeof sharedCompletionSource>[0]);
    expect(result).not.toBeNull();
    const option = result!.options.find((o) => o.label === label) as ApplyOption;
    expect(option, `option ${label}`).toBeDefined();
    return { option, from: result!.from };
  }

  it('apply {} template inserts braces with the cursor inside', async () => {
    const source = "let bg = PathLayer('bg');\nbg.ap";
    const { option, from } = await getOption(source, 'apply');
    expect(option.apply, 'apply should insert a snippet, not the bare label').toBeDefined();
    const { view, dispatched } = makeFakeView(source);
    option.apply!(view, null, from, source.length);
    expect(dispatched).toHaveLength(1);
    expect(dispatched[0].changes.insert).toBe('apply {\n\t$0\n}'.replace(/\$0/g, ''));
    // Cursor lands between the braces (after "apply {\n\t").
    expect(dispatched[0].selection.anchor).toBe(from + 'apply {\n\t'.length);
  });

  it('multi-line template re-indents to the trigger line and adjusts the selection', async () => {
    // Trigger from an indented line: the inserted block's continuation lines
    // must carry the base indent, and the cursor offset must shift by the
    // indent added before the cursor line.
    const source = "let bg = PathLayer('bg');\nif (1 == 1) {\n  bg.ap";
    const { option, from } = await getOption(source, 'apply');
    const { view, dispatched } = makeFakeView(source);
    option.apply!(view, null, from, source.length);
    // Template 'apply {\n\t$0\n}' stripped → 'apply {\n\t\n}', re-indented with
    // the trigger line's two-space base indent on each continuation line.
    expect(dispatched[0].changes.insert).toBe('apply {\n  \t\n  }');
    // Cursor sits after 'apply {\n' + base indent + '\t'.
    expect(dispatched[0].selection.anchor).toBe(from + 'apply {\n  \t'.length);
  });

  it('parens template selects the first placeholder default so typing replaces it', async () => {
    const source = 'let pb = @{ m 0 0 l 10 10 };\npb.drawT';
    const { option, from } = await getOption(source, 'drawTo');
    const { view, dispatched } = makeFakeView(source);
    option.apply!(view, null, from, source.length);
    expect(dispatched[0].changes.insert).toBe('drawTo(x, y)');
    // First placeholder default 'x' is selected: anchor after 'drawTo(', head after 'x'.
    expect(dispatched[0].selection.anchor).toBe(from + 'drawTo('.length);
    expect(dispatched[0].selection.head).toBe(from + 'drawTo(x'.length);
  });
});

describe('toCmSnippetTemplate (VS Code → CodeMirror field syntax)', () => {
  it('converts $0 to ${} and keeps numbered fields', async () => {
    const { toCmSnippetTemplate } = await import('../../playground/utils/cm-completion-bridge.js');
    expect(toCmSnippetTemplate('drawTo(${1:x}, ${2:y})$0')).toBe('drawTo(${1:x}, ${2:y})${}');
  });

  it('converts choice fields to their first choice (CM has no choice syntax)', async () => {
    const { toCmSnippetTemplate } = await import('../../playground/utils/cm-completion-bridge.js');
    expect(toCmSnippetTemplate('style = ${2|Grain,Paper,Speckle|};$0')).toBe('style = ${2:Grain};${}');
  });
});
