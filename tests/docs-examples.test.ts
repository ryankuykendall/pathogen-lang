/**
 * Every Pathogen example published in docs/ and on the blog parses.
 *
 * In October 2026 the semantics audit found 131 docs examples and 60 blog
 * examples the parser rejected, most written before semicolons became
 * mandatory, including the first example on the Getting Started page.
 * Nothing compiled them, so they rotted silently.
 *
 * The contract: a code block in docs/*.md or website/blog/*.md that is
 * untagged or tagged `pathogen` must parse. Examples may be fragments that
 * lean on an earlier block (undefined names are fine; this test only parses).
 * Code that isn't Pathogen takes its own tag (`text`, `xml`, `js`, `bash`, …),
 * and Pathogen shown failing to parse on purpose is tagged
 * ```pathogen invalid, which both builds render exactly like ```pathogen.
 * (Examples that parse but fail when they run, such as the rejected style
 * values in security.md, stay untagged and are checked.)
 *
 * Blocks are read with `marked`, the parser scripts/build-docs.ts and
 * scripts/build-blog.ts publish with, so the test sees what the site shows.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { marked } from 'marked';
import { describe, expect, it } from 'vitest';

import { parse } from '../src';

import type { Tokens } from 'marked';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
/** Each published source, with a floor on how many checked examples it holds. */
const SOURCES: Record<string, number> = { docs: 500, 'website/blog': 150 };

interface Example {
  file: string;
  line: number;
  info: string;
  code: string;
}

/** The code blocks marked finds in one page (`docs/<name>`, `website/blog/<name>`), with the line each starts on. */
function examples(file: string): Example[] {
  return examplesIn(readFileSync(join(ROOT, file), 'utf-8'), file);
}

function examplesIn(text: string, file: string): Example[] {
  const found: Example[] = [];
  let searchFrom = 0;
  marked.walkTokens(marked.lexer(text), (token) => {
    if (token.type !== 'code') return;
    const code = token as Tokens.Code;
    // Report the line of the block's first body line. Inside a list, marked
    // strips the indentation from `raw`, so fall back to the first code line.
    let line = 0;
    const at = text.indexOf(code.raw, searchFrom);
    if (at >= 0) {
      line = text.slice(0, at).split('\n').length + 1;
      searchFrom = at + code.raw.length;
    } else {
      const first = code.text.split('\n')[0];
      const bodyAt = first.trim() ? text.indexOf(first, searchFrom) : -1;
      if (bodyAt >= 0) {
        line = text.slice(0, bodyAt).split('\n').length;
        searchFrom = bodyAt + first.length;
      }
    }
    found.push({ file, line, info: (code.lang ?? '').trim().toLowerCase(), code: code.text });
  });
  return found;
}

function isCheckedPathogen(info: string): boolean {
  const words = info.split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  return words[0] === 'pathogen' && !words.includes('invalid');
}

function parseError(code: string): string | null {
  try {
    parse(code);
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

const pages = Object.keys(SOURCES).flatMap((dir) =>
  readdirSync(join(ROOT, dir))
    .filter((name) => name.endsWith('.md') && name !== 'CLAUDE.md')
    .sort()
    .map((name) => `${dir}/${name}`),
);

describe('published examples (docs and blog)', () => {
  it.each(Object.entries(SOURCES))('finds the examples it is meant to check in %s', (dir, floor) => {
    const checked = pages
      .filter((page) => page.startsWith(`${dir}/`))
      .flatMap(examples)
      .filter((e) => isCheckedPathogen(e.info));
    // A collapse here means the reader broke, not that the pages improved.
    expect(checked.length).toBeGreaterThan(floor);
  });

  it('skips only ```pathogen invalid and non-Pathogen tags', () => {
    const sample = [
      '```',
      'M 0 0',
      '```',
      '```pathogen',
      'M 0 0',
      '```',
      '```pathogen invalid',
      'let = ;',
      '```',
      '```text',
      'not code',
      '```',
      '- in a list:',
      '',
      '  ```',
      '  L 1 1',
      '  ```',
    ].join('\n');
    const found = examplesIn(sample, 'sample.md').map((e) => [e.info, e.line, isCheckedPathogen(e.info)]);
    expect(found).toEqual([
      ['', 2, true],
      ['pathogen', 5, true],
      ['pathogen invalid', 8, false],
      ['text', 11, false],
      ['', 16, true],
    ]);
  });

  it.each(pages)('every Pathogen example in %s parses', (page) => {
    const failures = examples(page)
      .filter((e) => isCheckedPathogen(e.info))
      .map((e) => ({ e, error: parseError(e.code) }))
      .filter((r) => r.error !== null)
      .map(({ e, error }) => `${e.file}:${e.line} (${e.code.split('\n')[0].slice(0, 60)}): ${error}`);
    expect(failures).toEqual([]);
  });
});
