#!/usr/bin/env tsx
/**
 * Use the Lezer parser to find missing semicolons in Pathogen source code
 * embedded in test files and .pathogen files, and add them.
 *
 * This uses Lezer's error nodes to find exact positions where ';' is needed.
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { parser } from '../src/parser/pathogen.generated';

function findMissingSemicolons(source: string): number[] {
  const tree = parser.parse(source);
  const positions: number[] = [];
  const cursor = tree.cursor();

  do {
    if (cursor.type.isError) {
      const offset = cursor.from;
      // Check if this looks like a missing semicolon
      // (scan backward to find end of statement)
      let pos = offset - 1;
      while (pos >= 0 && /[\s\n\r]/.test(source[pos])) pos--;
      if (pos >= 0 && source[pos] === ')') {
        // Check that we're not at a for/if/fn header
        const before = source.slice(0, pos + 1).trimEnd();
        if (!/\b(for|if|fn|text|tspan)\s*\(/.test(before.slice(-30))) {
          positions.push(pos + 1);
        }
      }
    }
  } while (cursor.next());

  return positions;
}

function addSemicolons(source: string): string {
  const positions = findMissingSemicolons(source);
  if (positions.length === 0) return source;

  // Insert ; at each position (process from end to start to preserve offsets)
  const sorted = [...new Set(positions)].sort((a, b) => b - a);
  let result = source;
  for (const pos of sorted) {
    result = result.slice(0, pos) + ';' + result.slice(pos);
  }
  return result;
}

function processTestFile(filePath: string): number {
  let content = readFileSync(filePath, 'utf-8');
  let totalFixes = 0;

  // Find Pathogen source in template literals: compile(`...`), compilePath(`...`), etc.
  content = content.replace(
    /(compilePath|compile|compileWithContext|compileAnnotated|parse)\s*\(\s*`([\s\S]*?)`/g,
    (_match, fn, body) => {
      const fixed = addSemicolons(body);
      if (fixed !== body) {
        const diff = fixed.length - body.length;
        totalFixes += diff;
        return `${fn}(\`${fixed}\``;
      }
      return _match;
    }
  );

  // Single-quoted strings
  content = content.replace(
    /(compilePath|compile|compileWithContext|compileAnnotated|parse)\s*\(\s*'([^']+)'/g,
    (_match, fn, body) => {
      const fixed = addSemicolons(body);
      if (fixed !== body) {
        totalFixes += fixed.length - body.length;
        return `${fn}('${fixed}'`;
      }
      return _match;
    }
  );

  // Also handle runCli(['-e', '...']) patterns
  content = content.replace(
    /runCli\(\['-e',\s*'([^']+)'\]/g,
    (_match, body) => {
      const fixed = addSemicolons(body);
      if (fixed !== body) {
        totalFixes += fixed.length - body.length;
        return `runCli(['-e', '${fixed}']`;
      }
      return _match;
    }
  );

  if (totalFixes > 0) {
    writeFileSync(filePath, content);
  }
  return totalFixes;
}

function processPathogenFile(filePath: string): number {
  const content = readFileSync(filePath, 'utf-8');
  const fixed = addSemicolons(content);
  if (fixed !== content) {
    writeFileSync(filePath, fixed);
    return fixed.length - content.length;
  }
  return 0;
}

// Walk directory
function walkDir(dir: string, ext: string): string[] {
  const results: string[] = [];
  try {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (full.includes('node_modules') || full.includes('.git/')) continue;
      const stat = statSync(full);
      if (stat.isDirectory()) results.push(...walkDir(full, ext));
      else if (full.endsWith(ext)) results.push(full);
    }
  } catch { /* ignore */ }
  return results;
}

// Main
console.log('Processing test files...');
let total = 0;
for (const file of walkDir('tests', '.test.ts')) {
  const fixes = processTestFile(file);
  if (fixes > 0) console.log(`  ${file}: ${fixes} semicolons added`);
  total += fixes;
}

console.log('\nProcessing .pathogen files...');
for (const file of [...walkDir('project-docs', '.pathogen'), ...walkDir('packages', '.pathogen'), ...walkDir('public', '.pathogen'), ...walkDir('website', '.pathogen')]) {
  const fixes = processPathogenFile(file);
  if (fixes > 0) console.log(`  ${file}: ${fixes} semicolons added`);
  total += fixes;
}

console.log(`\nTotal: ${total} semicolons added`);
