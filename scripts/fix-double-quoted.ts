#!/usr/bin/env tsx
/**
 * Fix double-quoted and single-quoted Pathogen strings in test files.
 * These were missed by the template-literal-focused scripts.
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { parse } from '../src/parser/index';
import type { Statement, PathCommand } from '../src/parser/ast';

function needsSemicolon(source: string): boolean {
  try {
    const ast = parse(source);
    for (const stmt of ast.body) {
      if (stmt.type === 'PathCommand' && (stmt as PathCommand).command === '') {
        return true;
      }
    }
  } catch {}
  return false;
}

function addSemicolonToFunctionCall(source: string): string {
  // If the source ends with a function call ) without ;, add ;
  const trimmed = source.trimEnd();
  if (trimmed.endsWith(')') && !trimmed.endsWith(';')) {
    // Verify this looks like a function call end (has alphanumeric or ) before final ))
    if (/[a-zA-Z0-9_)'")]\)$/.test(trimmed)) {
      return trimmed + ';';
    }
  }
  return source;
}

function processTestFile(filePath: string): number {
  let content = readFileSync(filePath, 'utf-8');
  let fixes = 0;

  // Fix double-quoted strings: compilePath("..."), compile("..."), etc.
  content = content.replace(
    /(compilePath|compile|compileWithContext|compileAnnotated|parse)\s*\("([^"]+)"\)/g,
    (_match, fn, body) => {
      const fixed = addSemicolonToFunctionCall(body);
      if (fixed !== body) { fixes++; return `${fn}("${fixed}")`; }
      return _match;
    }
  );

  // Fix single-quoted strings: compilePath('...')
  content = content.replace(
    /(compilePath|compile|compileWithContext|compileAnnotated|parse)\s*\('([^']+)'\)/g,
    (_match, fn, body) => {
      const fixed = addSemicolonToFunctionCall(body);
      if (fixed !== body) { fixes++; return `${fn}('${fixed}')`; }
      return _match;
    }
  );

  // Fix expect(() => compilePath("...")).toThrow patterns
  content = content.replace(
    /compilePath\("([^"]+)"\)/g,
    (_match, body) => {
      const fixed = addSemicolonToFunctionCall(body);
      if (fixed !== body) { fixes++; return `compilePath("${fixed}")`; }
      return _match;
    }
  );

  // Fix runCli(['-e', "..."]) double-quoted
  content = content.replace(
    /runCli\(\['-e',\s*"([^"]+)"\]/g,
    (_match, body) => {
      const fixed = addSemicolonToFunctionCall(body);
      if (fixed !== body) { fixes++; return `runCli(['-e', "${fixed}"]`; }
      return _match;
    }
  );

  if (fixes > 0) {
    writeFileSync(filePath, content);
    console.log(`  ${filePath}: ${fixes} semicolons added`);
  }
  return fixes;
}

function walkDir(dir: string, ext: string): string[] {
  const results: string[] = [];
  try {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (full.includes('node_modules') || full.includes('.git/')) continue;
      try { const s = statSync(full); if (s.isDirectory()) results.push(...walkDir(full, ext)); else if (full.endsWith(ext)) results.push(full); } catch {}
    }
  } catch {}
  return results;
}

console.log('Processing test files...');
let total = 0;
for (const file of walkDir('tests', '.test.ts')) {
  total += processTestFile(file);
}
console.log(`Total: ${total} semicolons added`);
