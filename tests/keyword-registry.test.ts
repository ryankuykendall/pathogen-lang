/**
 * Keyword drift guard.
 *
 * The Lezer grammar is the single source of truth for reserved words. Every
 * editor-facing registry that enumerates keywords by hand (tokenizer guard,
 * highlighters, completions, hover, rename, extract-refactor, snippet
 * highlighter, TextMate grammar) must cover each `kw<"…">` term, or carry a
 * justified exception below. Exceptions must also stay accurate: an exception
 * for a keyword the registry already contains is flagged as stale.
 */
import { readFileSync } from 'node:fs';

import { describe, it, expect } from 'vitest';

import { KEYWORDS as SNIPPET_KEYWORDS } from '../src/evaluator/code-snippet';
import { NODE_CLASS } from '../src/highlight';
import { RESERVED_IDENTIFIERS } from '../src/language-services/code-actions';
import { KEYWORD_COMPLETIONS } from '../src/language-services/completion-data-static';
import { KEYWORD_HOVER } from '../src/language-services/hover';
import { NON_RENAMEABLE } from '../src/language-services/rename';
import { parse } from '../src/parser';
import { KEYWORD_NODE_NAMES } from '../src/parser/highlight';
import { KEYWORDS as PATH_ARG_KEYWORDS } from '../src/parser/path-args-tokenizer';

const GRAMMAR_SOURCE = readFileSync(new URL('../src/parser/pathogen.grammar', import.meta.url), 'utf8');
const GRAMMAR_KEYWORDS = new Set([...GRAMMAR_SOURCE.matchAll(/kw<"(\w+)">/g)].map((m) => m[1]));
// Contextual keywords: `@extend[@name=with]<Identifier, "with">`. The same macro
// defines the path-command letters, whose node name differs from the word.
const CONTEXTUAL_KEYWORDS = new Set(
  [...GRAMMAR_SOURCE.matchAll(/@extend\[@name=(\w+)\]<Identifier, "(\w+)">/g)]
    .filter((m) => m[1] === m[2])
    .map((m) => m[2]),
);

const TEXTMATE = JSON.parse(
  readFileSync(new URL('../packages/vscode-pathogen/syntaxes/pathogen.tmLanguage.json', import.meta.url), 'utf8'),
) as { repository: { keyword: { match: string } } };
const TEXTMATE_KEYWORDS = new Set(
  TEXTMATE.repository.keyword.match.replace(/^\\b\(/, '').replace(/\)\\b$/, '').split('|'),
);

interface Registry {
  name: string;
  has: ReadonlySet<string>;
  /** keyword → one-line reason it is legitimately absent from this registry */
  exceptions: Record<string, string>;
}

const REGISTRIES: Registry[] = [
  {
    name: 'path-args-tokenizer KEYWORDS',
    has: PATH_ARG_KEYWORDS,
    exceptions: {
      in: 'only appears inside a for-loop header, never at a path-argument boundary',
      calc: 'calc(...) is itself a path argument; the tokenizer consumes it as a call',
      ViewBox: 'only follows `define`, which already ends path-argument scanning',
    },
  },
  {
    name: 'parser/highlight.ts KEYWORD_NODE_NAMES',
    has: new Set(KEYWORD_NODE_NAMES.split(/\s+/)),
    exceptions: {},
  },
  {
    name: "highlight.ts NODE_CLASS 'kw' entries",
    has: new Set(Object.keys(NODE_CLASS).filter((k) => NODE_CLASS[k] === 'kw')),
    exceptions: {},
  },
  {
    name: 'completion-data-static KEYWORD_COMPLETIONS labels',
    has: new Set(KEYWORD_COMPLETIONS.map((e) => e.label)),
    exceptions: {
      in: 'mid-statement only (for-loop header); the `for` snippet writes it',
      apply: 'mid-statement only (after `layer(...)` or a layer variable and `.`)',
      calc: 'path-argument wrapper, never a statement start',
    },
  },
  {
    name: 'hover KEYWORD_HOVER keys',
    has: new Set(Object.keys(KEYWORD_HOVER)),
    exceptions: {},
  },
  {
    name: 'rename NON_RENAMEABLE',
    has: NON_RENAMEABLE,
    exceptions: {},
  },
  {
    name: 'code-actions RESERVED_IDENTIFIERS',
    has: RESERVED_IDENTIFIERS,
    exceptions: {},
  },
  {
    name: 'code-snippet KEYWORDS',
    has: SNIPPET_KEYWORDS,
    exceptions: {},
  },
  {
    name: 'TextMate repository.keyword.match',
    has: TEXTMATE_KEYWORDS,
    exceptions: {
      calc: 'has its own #calc-expression rule that scopes the whole calc(...) form',
    },
  },
];

describe('keyword registry drift guard', () => {
  it('collects the expected keyword set from the grammar', () => {
    expect([...GRAMMAR_KEYWORDS].sort()).toEqual([
      'ViewBox', 'apply', 'break', 'calc', 'case', 'const', 'continue', 'default', 'define',
      'else', 'enum', 'export', 'fn', 'for', 'if', 'import', 'in', 'layer', 'let', 'return', 'switch',
      'text', 'tspan', 'where',
    ].sort());
  });

  it('collects the contextual keywords from the grammar', () => {
    expect([...CONTEXTUAL_KEYWORDS].sort()).toEqual(['as', 'from', 'module', 'with']);
  });

  // A contextual keyword is a keyword only where the grammar expects it, so
  // both highlighters must class it there (they key on the node name, which
  // exists only in keyword position).
  it.each([
    ['parser/highlight.ts KEYWORD_NODE_NAMES', new Set(KEYWORD_NODE_NAMES.split(/\s+/))],
    ["highlight.ts NODE_CLASS 'kw' entries", new Set(Object.keys(NODE_CLASS).filter((k) => NODE_CLASS[k] === 'kw'))],
  ])('%s covers every contextual keyword', (_name, has) => {
    expect([...CONTEXTUAL_KEYWORDS].filter((k) => !has.has(k))).toEqual([]);
  });

  // `from` (modules, docs/modules.md) is also an ordinary name: a gradient's
  // `.from`, `let from = bar.start;`. A registry that treats it as reserved
  // would break those programs or the editor features on them.
  // `module` likewise is a keyword only in the `module;` line (docs/syntax.md).
  it.each(['from', 'module'])('`%s` stays usable as a name everywhere', (word) => {
    expect(() => parse(`let ${word} = 3; let g = { ${word}: 1 }; L ${word} 0; log(g.${word});`)).not.toThrow();
    const reserving: [string, ReadonlySet<string>][] = [
      ['path-args-tokenizer KEYWORDS', PATH_ARG_KEYWORDS],
      ['hover KEYWORD_HOVER keys', new Set(Object.keys(KEYWORD_HOVER))],
      ['rename NON_RENAMEABLE', NON_RENAMEABLE],
      ['code-actions RESERVED_IDENTIFIERS', RESERVED_IDENTIFIERS],
      ['code-snippet KEYWORDS', SNIPPET_KEYWORDS],
      ['TextMate repository.keyword.match', TEXTMATE_KEYWORDS],
    ];
    expect(reserving.filter(([, has]) => has.has(word)).map(([name]) => name)).toEqual([]);
  });

  it('the TextMate grammar scopes `module` only in the `module;` line', () => {
    interface MatchRule {
      match?: string;
      captures?: Record<string, { name?: string }>;
    }
    const rule = (TEXTMATE.repository as unknown as Record<string, MatchRule>)['module-header'];
    expect(rule?.captures?.['1']?.name).toMatch(/^keyword\./);
    const re = new RegExp(rule?.match ?? '$^', 'm');
    expect(re.test('module;')).toBe(true);
    expect(re.test('// c\n  module ;')).toBe(true);
    expect(re.test('let module = 3;')).toBe(false);
    expect(re.test('log(module);')).toBe(false);
    expect(re.test('module.x = 1;')).toBe(false);
  });

  it('the TextMate grammar scopes `from` only inside an import, right before the path', () => {
    type Rule = { begin?: string; patterns?: { match?: string; name?: string }[] };
    const header = (TEXTMATE.repository as unknown as Record<string, Rule>)['import-header'];
    expect(header?.begin).toBe('\\b(import)\\b');
    const fromRule = header?.patterns?.find((p) => p.match?.includes('(from)'));
    expect(fromRule?.name).toMatch(/^keyword\./);
    // `from` must be followed by a quote: `import { from } from "x"` colours only the second
    const fromRe = new RegExp(fromRule?.match ?? '$^');
    expect('import { from } from "x"'.match(new RegExp(fromRe.source, 'g'))?.length).toBe(1);
    expect(fromRe.test('let from = 3;')).toBe(false);
  });

  for (const registry of REGISTRIES) {
    it(`${registry.name} covers every grammar keyword`, () => {
      const missing = [...GRAMMAR_KEYWORDS].filter(
        (k) => !registry.has.has(k) && !(k in registry.exceptions),
      );
      expect(missing).toEqual([]);
    });

    it(`${registry.name} has no stale exceptions`, () => {
      const stale = Object.keys(registry.exceptions).filter((k) => registry.has.has(k));
      expect(stale).toEqual([]);
      for (const reason of Object.values(registry.exceptions)) expect(reason.length).toBeGreaterThan(0);
    });
  }

  it('every grammar keyword is rejected as a variable name', () => {
    for (const kw of GRAMMAR_KEYWORDS) {
      expect(() => parse(`let ${kw} = 1;`), `let ${kw} = 1; should not parse`).toThrow();
    }
  });
});
