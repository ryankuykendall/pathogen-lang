#!/usr/bin/env tsx
/**
 * Precisely add missing semicolons to Pathogen source code by using
 * the Parsimmon parser's error detection. When Parsimmon reports a
 * "Missing ';'" error, insert ';' at the exact position.
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { parse } from '../src/parser/index';

function fixSemicolons(source: string): { fixed: string; count: number } {
  let current = source;
  let count = 0;
  const maxPasses = 20; // Prevent infinite loops

  for (let pass = 0; pass < maxPasses; pass++) {
    try {
      parse(current);
      break; // No errors — done
    } catch (e) {
      const msg = (e as Error).message;
      const match = msg.match(/Parse error at line (\d+), column (\d+): Missing ';'/);
      if (!match) break; // Not a missing semicolon error — stop

      const line = parseInt(match[1], 10);
      const col = parseInt(match[2], 10);

      // Insert ';' at the specified position
      const lines = current.split('\n');
      if (line < 1 || line > lines.length) break;

      const lineText = lines[line - 1];
      const insertPos = Math.min(col - 1, lineText.length);
      lines[line - 1] = lineText.slice(0, insertPos) + ';' + lineText.slice(insertPos);
      current = lines.join('\n');
      count++;
    }
  }

  return { fixed: current, count };
}

function processTestFile(filePath: string): number {
  let content = readFileSync(filePath, 'utf-8');
  let totalFixes = 0;

  // Process template literals in compile/compilePath/etc calls
  content = content.replace(
    /(compilePath|compile|compileWithContext|compileAnnotated|parse)\s*\(\s*`([\s\S]*?)`/g,
    (_match, fn, body) => {
      const { fixed, count } = fixSemicolons(body);
      totalFixes += count;
      return `${fn}(\`${fixed}\``;
    }
  );

  // Process single-quoted strings
  content = content.replace(
    /(compilePath|compile|compileWithContext|compileAnnotated|parse)\s*\('([^']+)'/g,
    (_match, fn, body) => {
      const { fixed, count } = fixSemicolons(body);
      totalFixes += count;
      return `${fn}('${fixed}'`;
    }
  );

  // Process runCli -e strings
  content = content.replace(
    /runCli\(\['-e',\s*'([^']+)'\]/g,
    (_match, body) => {
      const { fixed, count } = fixSemicolons(body);
      totalFixes += count;
      return `runCli(['-e', '${fixed}']`;
    }
  );

  if (totalFixes > 0) {
    writeFileSync(filePath, content);
  }
  return totalFixes;
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

function processPathogenFile(filePath: string): number {
  const content = readFileSync(filePath, 'utf-8');
  const { fixed, count } = fixSemicolons(content);
  if (count > 0) writeFileSync(filePath, fixed);
  return count;
}

// Main
console.log('Processing test files...');
let total = 0;
for (const file of walkDir('tests', '.test.ts')) {
  const count = processTestFile(file);
  if (count > 0) {
    console.log(`  ${file}: ${count} semicolons added`);
    total += count;
  }
}

console.log('\nProcessing .pathogen files...');
for (const dir of ['project-docs', 'packages', 'public', 'website']) {
  for (const file of walkDir(dir, '.pathogen')) {
    const count = processPathogenFile(file);
    if (count > 0) {
      console.log(`  ${file}: ${count} semicolons added`);
      total += count;
    }
  }
}

console.log(`\nTotal: ${total} semicolons added`);
