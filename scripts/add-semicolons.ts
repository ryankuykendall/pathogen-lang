#!/usr/bin/env tsx
/**
 * Add missing semicolons to standalone function/method call statements
 * in Pathogen source code embedded in test files and .pathogen files.
 *
 * This is a language change: semicolons are now required after all
 * expression statements (function calls, method calls, etc.)
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

function globSync(pattern: string, opts?: { ignore?: string }): string[] {
  const results: string[] = [];
  function walk(dir: string) {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (opts?.ignore && full.includes('node_modules')) continue;
      const stat = statSync(full);
      if (stat.isDirectory()) walk(full);
      else if (pattern.endsWith('.test.ts') && full.endsWith('.test.ts')) results.push(full);
      else if (pattern.endsWith('.pathogen') && full.endsWith('.pathogen')) results.push(full);
    }
  }
  const baseDir = pattern.split('*')[0].replace(/\/$/, '') || '.';
  try { walk(baseDir); } catch { /* dir doesn't exist */ }
  return results;
}

// Pattern: line ending with ) or )) that's NOT followed by ; or { or . or ,
// These are standalone function/method calls that need ;
const NEEDS_SEMI_RE = /^(\s*(?:\/\/.*)?)\n?(\s*(?:\w[\w.]*(?:\([^)]*\))+(?:\s*\{[^}]*\})?)\s*)$/;

// More targeted: find lines in template literals that end with ) without ;
// within compile/compilePath calls
function addSemicolonsToSource(source: string): string {
  // Process lines that look like standalone function/method calls
  const lines = source.split('\n');
  const result: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    const trimmed = line.trimEnd();

    // Skip empty, comments, path commands, block delimiters
    if (!trimmed || trimmed.startsWith('//') || /^\s*[{}[\]]/.test(trimmed)) {
      result.push(line);
      continue;
    }

    // Skip lines already ending with ; or { or , or opening block
    if (/[;{,]$/.test(trimmed) || trimmed.endsWith('\\')) {
      result.push(line);
      continue;
    }

    // Skip path commands (M, L, H, V, C, S, Q, T, A, Z + lowercase)
    if (/^\s*[MLHVCSQTAZmlhvcsqtaz]\s+/.test(trimmed)) {
      result.push(line);
      continue;
    }

    // Skip let/for/if/fn/define/enum/return that are block starters
    if (/^\s*(for|if|else|fn|define|enum)\b/.test(trimmed) && !trimmed.endsWith(')')) {
      result.push(line);
      continue;
    }

    // Skip lines inside template literals that are just text
    if (/^\s*`/.test(trimmed) || /`\s*$/.test(trimmed)) {
      result.push(line);
      continue;
    }

    // Lines ending with ) — likely function/method calls
    if (/\)\s*$/.test(trimmed)) {
      // But not if it's a for/if/fn/text/tspan declaration with block
      if (/^\s*(for|if|fn|text|tspan)\s*[\(]/.test(trimmed) && i + 1 < lines.length && lines[i + 1].trimStart().startsWith('{')) {
        result.push(line);
        continue;
      }
      // Not for/if/fn header lines
      if (/^\s*(for|if)\s*\(/.test(trimmed)) {
        result.push(line);
        continue;
      }
      if (/^\s*fn\s+\w+\s*\(/.test(trimmed)) {
        result.push(line);
        continue;
      }
      // Not text/tspan with backtick on same or next line
      if (/^\s*(text|tspan)\s*\(/.test(trimmed)) {
        result.push(line);
        continue;
      }
      // Not ) followed by { on next line (block)
      if (i + 1 < lines.length && /^\s*\{/.test(lines[i + 1])) {
        result.push(line);
        continue;
      }
      // Not inside layer().apply
      if (/\.apply\s*$/.test(trimmed)) {
        result.push(line);
        continue;
      }
      // Add semicolon
      result.push(line.replace(/(\)\s*)$/, '$1;'));
      continue;
    }

    // Lines ending with } that are trailing blocks (not standalone blocks)
    // e.g., "  };" at end of let declaration with trailing block
    // Skip these — they already have ; if needed

    result.push(line);
  }

  return result.join('\n');
}

// Process test file: find compile/compilePath string arguments and add semicolons
function processTestFile(filePath: string): { changed: boolean; fixes: number } {
  let content = readFileSync(filePath, 'utf-8');
  let fixes = 0;

  // Find template literal strings in compile/compilePath calls
  // Match: compilePath(`...`) or compile(`...`)
  content = content.replace(
    /(compilePath|compile|compileWithContext|compileAnnotated|parse)\s*\(\s*`([\s\S]*?)`/g,
    (match, fn, body) => {
      const fixed = addSemicolonsToSource(body);
      if (fixed !== body) {
        const lineCount = (fixed.match(/;$/gm) || []).length - (body.match(/;$/gm) || []).length;
        fixes += lineCount;
        return `${fn}(\`${fixed}\``;
      }
      return match;
    }
  );

  // Also fix single-quoted strings: compilePath('...')
  content = content.replace(
    /(compilePath|compile|compileWithContext|compileAnnotated|parse)\s*\(\s*'([^']+)'/g,
    (match, fn, body) => {
      const fixed = addSemicolonsToSource(body);
      if (fixed !== body) {
        fixes++;
        return `${fn}('${fixed}'`;
      }
      return match;
    }
  );

  if (fixes > 0) {
    writeFileSync(filePath, content);
  }
  return { changed: fixes > 0, fixes };
}

// Process .pathogen files
function processPathogenFile(filePath: string): { changed: boolean; fixes: number } {
  const content = readFileSync(filePath, 'utf-8');
  const fixed = addSemicolonsToSource(content);
  const fixes = (fixed.match(/;$/gm) || []).length - (content.match(/;$/gm) || []).length;
  if (fixed !== content) {
    writeFileSync(filePath, fixed);
  }
  return { changed: fixed !== content, fixes };
}

// Main
const testFiles = globSync('tests/**/*.test.ts');
const pathogenFiles = globSync('**/*.pathogen', { ignore: 'node_modules/**' });

console.log(`Processing ${testFiles.length} test files...`);
let totalFixes = 0;
for (const file of testFiles) {
  const { changed, fixes } = processTestFile(file);
  if (changed) {
    console.log(`  ${file}: ${fixes} semicolons added`);
    totalFixes += fixes;
  }
}

console.log(`\nProcessing ${pathogenFiles.length} .pathogen files...`);
for (const file of pathogenFiles) {
  const { changed, fixes } = processPathogenFile(file);
  if (changed) {
    console.log(`  ${file}: ${fixes} semicolons added`);
    totalFixes += fixes;
  }
}

console.log(`\nTotal: ${totalFixes} semicolons added`);
