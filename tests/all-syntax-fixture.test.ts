import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { compile } from '../src';
import { getDiagnostics } from '../src/language-services/diagnostics';
import { StringTextDocument } from '../src/language-services/document';
import { lezerParser } from '../src/parser';

/**
 * packages/vscode-pathogen/test-fixtures/all-syntax.pathogen is the file a
 * person opens in VS Code to eyeball TextMate highlighting after a grammar
 * change. Nothing executable used it, so it rotted: by 2026-09 it did not
 * compile (a reserved name, an undefined variable, absolute commands inside a
 * path block, a corner op with no joint — each hidden behind the one before)
 * and it never mentioned switch/case/where/default, break/continue, ViewBox,
 * text blocks, queries, Grid, Marker or Pattern.
 *
 * These tests keep its two promises:
 *   1. it COMPILES, with no diagnostics — so the preview command renders it;
 *   2. it shows ALL syntax — every node type the Lezer grammar can produce
 *      appears in its parse tree, so a new construct fails this test until the
 *      fixture shows it (or an exception below says why it cannot).
 */
const FIXTURE_URL = new URL('../packages/vscode-pathogen/test-fixtures/all-syntax.pathogen', import.meta.url);
const FIXTURE = readFileSync(FIXTURE_URL, 'utf8');

const GRAMMAR = readFileSync(new URL('../src/parser/pathogen.grammar', import.meta.url), 'utf8');
// Keywords come from two macros: `kw<"for">`, and `@extend[@name=with]<Identifier, "with">`
// for the contextual ones (`with`, `as`). The @extend form also defines the
// path-command LETTERS, which share one node name — those are not keywords.
const GRAMMAR_KEYWORDS = [
  ...new Set([
    ...[...GRAMMAR.matchAll(/kw<"(\w+)">/g)].map((m) => m[1]),
    ...[...GRAMMAR.matchAll(/@extend\[@name=(\w+)\]<Identifier, "(\w+)">/g)].filter((m) => m[1] === m[2]).map((m) => m[2]),
  ]),
].sort();

/**
 * Node types the fixture is allowed to omit, each with the reason. Empty today.
 * (`LineComment` lived here while a comment inside an expression was a parse
 * error; when that was fixed, the "still needed" test below failed until the
 * entry was removed — which is the point of it.)
 */
const NODE_TYPE_EXCEPTIONS: Record<string, string> = {};

const seenNodeTypes = new Set<string>();
let errorNodes = 0;
lezerParser.parse(FIXTURE).iterate({
  enter(node) {
    if (node.type.isError) errorNodes++;
    seenNodeTypes.add(node.name);
  },
});

const grammarNodeTypes = [
  ...new Set(lezerParser.nodeSet.types.filter((t) => !t.isError && !t.isAnonymous && t.name !== '').map((t) => t.name)),
];

describe('all-syntax.pathogen: it compiles', () => {
  it('parses with no error nodes', () => {
    expect(errorNodes).toBe(0);
  });

  it('produces no diagnostics of any severity', () => {
    const diagnostics = getDiagnostics(new StringTextDocument(FIXTURE)).map(
      (d) => `L${d.range.start.line + 1}:${d.range.start.character + 1} ${d.message}`,
    );
    expect(diagnostics).toEqual([]);
  });

  it('compiles to real output: layers of every kind, defs of every kind, no warnings', () => {
    const result = compile(FIXTURE);
    expect(result.warnings ?? []).toEqual([]);
    const layerTypes = new Set(result.layers.map((layer) => layer.type));
    expect([...layerTypes].sort()).toEqual(['group', 'path', 'text']);
    expect(result.masks.length).toBeGreaterThan(0);
    expect(result.clipPaths.length).toBeGreaterThan(0);
    expect(result.gradients.length).toBeGreaterThan(0);
    expect((result.patterns ?? []).length).toBeGreaterThan(0);
    expect((result.markers ?? []).length).toBeGreaterThan(0);
  });

  it('its subscription actually fires (a subscription sees what is drawn after it)', () => {
    const dots = compile(FIXTURE).layers.find((layer) => layer.name === 'dots');
    expect(dots?.data ?? '').toContain('a 3 3');
  });
});

describe('all-syntax.pathogen: it shows all syntax', () => {
  it('the grammar has keywords and node types to check (the extraction still works)', () => {
    expect(GRAMMAR_KEYWORDS.length).toBeGreaterThan(15);
    // both macro forms are picked up
    expect(GRAMMAR_KEYWORDS).toEqual(expect.arrayContaining(['for', 'switch', 'ViewBox', 'with', 'as']));
    expect(GRAMMAR_KEYWORDS).not.toContain('M');
    expect(grammarNodeTypes.length).toBeGreaterThan(60);
  });

  it.each(GRAMMAR_KEYWORDS)('uses the keyword `%s` as a real token', (keyword) => {
    // Keyword tokens are tree nodes named after the keyword, so a mention in a
    // comment or a string does not count.
    expect(seenNodeTypes.has(keyword)).toBe(true);
  });

  it('exercises every node type the grammar can produce', () => {
    const missing = grammarNodeTypes
      .filter((name) => !seenNodeTypes.has(name) && !(name in NODE_TYPE_EXCEPTIONS))
      .sort();
    expect(missing).toEqual([]);
  });

  it('every exception is still needed and still names a real node type', () => {
    for (const name of Object.keys(NODE_TYPE_EXCEPTIONS)) {
      expect(grammarNodeTypes).toContain(name);
      // If the fixture starts exercising it, the exception is stale — delete it.
      expect(seenNodeTypes.has(name)).toBe(false);
    }
  });

  it.each([
    ['both range operators', /\d\.\.\d/, /\.\.</],
    ['a range value', /\(\d+\.\.<?[\w.]+\)/, null],
    ['the << operator as merge and as a worker', /\} << #\{/, /\.map\(\) << \w+/],
    ['template interpolation and style interpolation', /`[^`]*\$\{/, /stroke-width: \$\{/],
    ['all four unit suffixes', /\d(deg|rad|pi)\b/, /\d%/],
    ['hex and functional colors', /#[0-9a-f]{3,8}\b/i, /oklch\(/],
    ['context paint in a marker', /context-stroke/, null],
    ['the @font directive', /^@font /m, null],
    ['corner ops and labels (with / as)', / with (fillet|chamfer|ellipticalFillet)\(/, / as (segment|endpoint)\(/],
    ['queries and a subscription', /\.query(All)?\(/, /\.subscribe\(/],
    ['every binding-block constructor family', /(Linear|Radial)Gradient\(/, /(Marker|Pattern|Grid|Mask|ClipPath)\(/],
    ['comments where a statement cannot go: between switch clauses and inside a list', /\n  \/\/ case \d+ \{/, /, \/\/ [^\n]+\n/],
  ])('shows %s', (_label, first, second) => {
    expect(FIXTURE).toMatch(first);
    if (second) expect(FIXTURE).toMatch(second);
  });
});
