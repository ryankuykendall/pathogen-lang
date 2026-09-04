import { describe, expect, it } from 'vitest';

import {
  buildLegacyParser,
  findLegacyOpeners,
  rewriteMarkdown,
  rewritePathogenFile,
  rewriteSource,
  rewriteTypeScript,
} from '../scripts/lib/legacy-style-opener';

// The frozen grammar is byte-identical to the live grammar at commit fe78555;
// these tests pin the codemod's contract independently of the live parser.
const parser = buildLegacyParser();

const O = '${'; // the legacy opener, spelled indirectly so this file is not itself a migration candidate

describe('legacy style-opener codemod: Pathogen source', () => {
  it('rewrites a style block in let position', () => {
    const src = `let s = ${O} fill: red; stroke-width: 2; };`;
    expect(findLegacyOpeners(src, parser)).toEqual([8]);
    const out = rewriteSource(src, parser);
    expect(out.kind).toBe('rewritten');
    if (out.kind === 'rewritten') expect(out.text).toBe('let s = #{ fill: red; stroke-width: 2; };');
  });

  it('rewrites layer-definition, constructor, and << chain positions', () => {
    const src = [
      `define default PathLayer('a') ${O} stroke: red; }`,
      `let l = PathLayer('b') ${O} fill: blue; };`,
      `let m = base << ${O} stroke-width: 4; } << ${O} fill: blue; };`,
      `l.styles = l.styles << ${O} opacity: 0.5; };`,
    ].join('\n');
    const out = rewriteSource(src, parser);
    expect(out.kind).toBe('rewritten');
    if (out.kind === 'rewritten') {
      expect(out.offsets).toHaveLength(5);
      expect(out.text).not.toContain(O);
      expect(out.text.match(/#\{/g)).toHaveLength(5);
    }
  });

  it('leaves value interpolations, template interpolations, strings, and comments alone', () => {
    const src = [
      'let w = 3;',
      `let s = ${O}`,
      `  stroke-width: ${O}w * 2};`,
      `  stroke-dasharray: ${O}w} ${O}w};`,
      `  font-family: \`${O}family}\`;`,
      `  content: "${O}not-a-block}";`,
      `  // a comment with ${O} in it`,
      '};',
      `let msg = \`Hello ${O}name}!\`;`,
      `let q = '${O}literal}';`,
    ].join('\n');
    const out = rewriteSource(src, parser);
    expect(out.kind).toBe('rewritten');
    if (out.kind === 'rewritten') {
      expect(out.offsets).toHaveLength(1);
      const lines = out.text.split('\n');
      expect(lines[1]).toBe('let s = #{');
      expect(lines.slice(2)).toEqual(src.split('\n').slice(2));
    }
  });

  it('rewrites a block nested inside a template interpolation', () => {
    const src = `let t = \`${O} PathLayer('x') ${O} fill: red; } }\`;`;
    const out = rewriteSource(src, parser);
    expect(out.kind).toBe('rewritten');
    if (out.kind === 'rewritten') expect(out.text).toBe(`let t = \`${O} PathLayer('x') #{ fill: red; } }\`;`);
  });

  it('is idempotent: a unit already holding #{ is skipped, never re-parsed', () => {
    const migrated = `let s = #{ stroke-width: ${O}w}; };`;
    expect(rewriteSource(migrated, parser)).toEqual({ kind: 'already-migrated' });
  });

  it('reports no-openers for interpolation-only text', () => {
    expect(rewriteSource(`let msg = \`Hello ${O}name}\`;`, parser)).toEqual({ kind: 'no-openers', rejected: [] });
  });

  it('flags an opener that sits next to a parse error for review', () => {
    const src = `let s = ${O} stroke:  };\nlet oops = ;`;
    const { report } = rewritePathogenFile(src, parser);
    expect(report.rewritten).toBe(1);
    expect(report.review).toHaveLength(1);
    expect(report.review[0].line).toBe(1);
  });

  it('rejects an interpolation that error recovery wrapped in a block node', () => {
    // A declaration shown as a fragment outside any block: the parser recovers
    // `${capName}` into a StyleBlockLiteral, but its interior is an expression.
    const fragment = `stroke-linecap: ${O}capName};\nstroke-dasharray: ${O}cell} ${O}cell};`;
    const out = rewriteSource(fragment, parser);
    expect(out.kind).toBe('no-openers');
    if (out.kind === 'no-openers') expect(out.rejected.length).toBeGreaterThan(0);
    const js = ['const a = `${O}x}`;', 'function f() { return 1; }'].join('\n');
    expect(rewriteSource(js, parser).kind).toBe('no-openers');
  });

  it('accepts mid-typing prefixes, malformed declarations, and JS stand-ins', () => {
    expect(rewriteSource(`let s = ${O} stroke-w`, parser).kind).toBe('rewritten');
    expect(rewriteSource(`define PathLayer('a') ${O} fill none; }`, parser).kind).toBe('rewritten');
    // A closed block holding only an identifier is an interpolation, not a prefix.
    expect(rewriteSource(`stroke: ${O}capName};`, parser).kind).toBe('no-openers');
  });

  it('accepts empty blocks and blocks whose declarations start after a comment', () => {
    const src = `let g = GroupLayer('g') ${O}};\nlet s = ${O}\n  // leading comment\n  fill: red;\n};`;
    const out = rewriteSource(src, parser);
    expect(out.kind).toBe('rewritten');
    if (out.kind === 'rewritten') expect(out.offsets).toHaveLength(2);
  });
});

describe('legacy style-opener codemod: Markdown', () => {
  it('rewrites pathogen and bare fences, leaves other languages and prose alone', () => {
    const md = [
      '# Title',
      `Prose mentioning \`${O} }\` stays.`,
      '```pathogen',
      `let s = ${O} fill: red; };`,
      '```',
      '```',
      `define PathLayer('p') ${O} stroke: blue; }`,
      '```',
      '```ts',
      `const s = \`${O}x}\`;`,
      '```',
      '```bash',
      `echo ${O}HOME}`,
      '```',
    ].join('\n');
    const { text, report } = rewriteMarkdown(md, parser);
    const lines = text.split('\n');
    expect(lines[1]).toBe(`Prose mentioning \`${O} }\` stays.`);
    expect(lines[3]).toBe('let s = #{ fill: red; };');
    expect(lines[6]).toBe("define PathLayer('p') #{ stroke: blue; }");
    expect(lines[9]).toBe(`const s = \`${O}x}\`;`);
    expect(lines[12]).toBe(`echo ${O}HOME}`);
    expect(report.units).toBe(2);
    expect(report.rewritten).toBe(2);
  });

  it('does not touch a bare fence that is really JavaScript', () => {
    const md = [
      '```',
      'const a = `${O}x}`;',
      'const b = { y: 1 };',
      'export function f() { return a + b.y; }',
      '```',
    ].join('\n');
    const { text } = rewriteMarkdown(md, parser);
    expect(text).toBe(md);
  });

  it('leaves bash parameter expansion in a bare fence alone', () => {
    const md = ['```', `echo ${O}NAME:-default} ${O}HOME:=/tmp}`, '```'].join('\n');
    expect(rewriteMarkdown(md, parser).text).toBe(md);
  });

  it('handles tilde fences and longer fence runs', () => {
    const md = ['~~~pathogen', `let s = ${O} fill: red; };`, '~~~', '````', `let t = ${O} fill: blue; };`, '````'].join(
      '\n',
    );
    const { text } = rewriteMarkdown(md, parser);
    expect(text).toContain('let s = #{ fill: red; };');
    expect(text).toContain('let t = #{ fill: blue; };');
  });
});

describe('legacy style-opener codemod: TypeScript literals', () => {
  it('rewrites escaped openers in template literals and leaves JS interpolations alone', () => {
    const src = [
      'const w = 4;',
      'const src = `let s = \\${ stroke-width: ${w}; };',
      "define PathLayer('a') \\${ fill: red; }`;",
      'const html = `<div class="${cls}">${body}</div>`;',
    ].join('\n');
    const { text, report } = rewriteTypeScript(src, parser, 'a.test.ts');
    const lines = text.split('\n');
    expect(lines[1]).toBe('const src = `let s = #{ stroke-width: ${w}; };');
    expect(lines[2]).toBe("define PathLayer('a') #{ fill: red; }`;");
    expect(lines[3]).toBe('const html = `<div class="${cls}">${body}</div>`;');
    expect(report.rewritten).toBe(2);
  });

  it('rewrites an opener smuggled in as an interpolated string', () => {
    const src = "const src = `let p = @{ h 100 };\\nlet pieces = p.dash(${'${'} stroke-dasharray: 50 50; });`;";
    const { text, report } = rewriteTypeScript(src, parser, 'a.test.ts');
    expect(text).toBe('const src = `let p = @{ h 100 };\\nlet pieces = p.dash(#{ stroke-dasharray: 50 50; });`;');
    expect(report.rewritten).toBe(1);
  });

  it('rewrites openers in quoted strings', () => {
    const src = `const src = "define PathLayer('p') ${O} stroke: red; }\\nlayer('p').apply { M 0 0 }";`;
    const { text } = rewriteTypeScript(src, parser, 'a.test.ts');
    expect(text).toBe(`const src = "define PathLayer('p') #{ stroke: red; }\\nlayer('p').apply { M 0 0 }";`);
  });

  it('skips literals with snippet placeholders and literals already migrated', () => {
    // A migrated literal that still carries a value interpolation contains
    // `${` and is therefore a candidate; the `#{` guard must skip it.
    const src = [
      "const snippet = 'let ${1:name} = ${0};';",
      "const done = 'let s = #{ stroke-width: ${O}w}; };';",
      "const style = 'let s = ${O} fill: red; };';",
    ]
      .join('\n')
      .replaceAll('${O}', O);
    const { text, report } = rewriteTypeScript(src, parser, 'a.ts');
    const lines = text.split('\n');
    expect(lines[0]).toBe("const snippet = 'let ${1:name} = ${0};';");
    expect(lines[1]).toBe(`const done = 'let s = #{ stroke-width: ${O}w}; };';`);
    expect(lines[2]).toBe("const style = 'let s = #{ fill: red; };';");
    expect(report.skipped.map((s) => s.reason)).toEqual(['skipped-snippet-placeholders', 'already-migrated']);
  });

  it('accepts a block whose declarations are a JS interpolation', () => {
    const src = "const decl = 'fill: red;';\nconst src = `define PathLayer('a') \\${ ${decl} }`;";
    const { text, report } = rewriteTypeScript(src, parser, 'a.test.ts');
    expect(report.rewritten).toBe(1);
    expect(text.split('\n')[1]).toBe("const src = `define PathLayer('a') #{ ${decl} }`;");
  });

  it('keeps Pathogen inside interpolation-bearing templates aligned (offsets survive JS spans)', () => {
    const src = [
      'const name = "x";',
      'const src = `',
      "  define PathLayer('${name}') \\${",
      '    fill: ${color};',
      '  }',
      '`;',
    ].join('\n');
    const { text, report } = rewriteTypeScript(src, parser, 'a.test.ts');
    expect(report.rewritten).toBe(1);
    expect(text.split('\n')[2]).toBe("  define PathLayer('${name}') #{");
    expect(text.split('\n')[3]).toBe('    fill: ${color};');
  });
});
