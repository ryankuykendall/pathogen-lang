#!/usr/bin/env tsx
/**
 * AST-driven semicolon insertion for Pathogen source code.
 *
 * Uses the Parsimmon parser to parse Pathogen programs, walks the AST
 * to find standalone function/method call statements (PathCommand with
 * empty command), and inserts ';' after each one that doesn't already
 * have it.
 *
 * This is the migration script for the language change: semicolons are
 * now mandatory after all expression statements.
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { parse } from '../src/parser/index';
import type { Program, Statement, PathCommand } from '../src/parser/ast';

/**
 * Find positions where ';' should be inserted in a Pathogen source string.
 * Returns byte offsets (into the source) where ';' needs to go, sorted descending.
 */
function findMissingSemicolonPositions(source: string): number[] {
  let ast: Program;
  try {
    ast = parse(source);
  } catch {
    return []; // Can't parse — skip
  }

  const positions: number[] = [];
  walkStatements(ast.body, source, positions);
  return positions.sort((a, b) => b - a); // Descending for safe insertion
}

function walkStatements(stmts: Statement[], source: string, positions: number[]): void {
  for (const stmt of stmts) {
    // PathCommand with empty command = standalone function/method call
    if (stmt.type === 'PathCommand' && (stmt as PathCommand).command === '') {
      const loc = (stmt as any).loc;
      if (loc) {
        // Find the end of this statement in the source
        const endPos = findStatementEnd(source, loc.offset);
        if (endPos >= 0 && source[endPos] !== ';') {
          positions.push(endPos);
        }
      }
    }

    // Recurse into block-containing statements
    if (stmt.type === 'ForLoop' || stmt.type === 'ForEachLoop') {
      walkStatements((stmt as any).body, source, positions);
    } else if (stmt.type === 'IfStatement') {
      walkStatements((stmt as any).consequent, source, positions);
      if ((stmt as any).alternate) {
        walkStatements((stmt as any).alternate, source, positions);
      }
    } else if (stmt.type === 'FunctionDefinition') {
      walkStatements((stmt as any).body, source, positions);
    } else if (stmt.type === 'LayerApplyBlock') {
      walkStatements((stmt as any).body, source, positions);
    }
  }
}

/**
 * Find the end position of a statement starting at the given offset.
 * Uses the source text to find where the full expression chain ends,
 * including method chains like a.project(0, 0).union(b.project(0, 0)).
 */
function findStatementEnd(source: string, startOffset: number): number {
  let pos = startOffset;
  let depth = 0;
  let lastExprEnd = -1;
  let inString = false;
  let stringChar = '';

  while (pos < source.length) {
    const ch = source[pos];

    // Handle string literals
    if (inString) {
      if (ch === stringChar && source[pos - 1] !== '\\') inString = false;
      pos++;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      inString = true;
      stringChar = ch;
      pos++;
      continue;
    }

    // Track parens
    if (ch === '(') depth++;
    if (ch === ')') {
      depth--;
      if (depth === 0) {
        lastExprEnd = pos + 1; // After the ')'

        // Look ahead: if followed by '.method(' it's a chain — continue
        let peek = pos + 1;
        while (peek < source.length && /\s/.test(source[peek])) peek++;
        if (peek < source.length && source[peek] === '.') {
          // Method chain continues — don't stop here
          pos++;
          continue;
        }

        // Look ahead: if followed by '{' with '|', it's a trailing block
        if (peek < source.length && source[peek] === '{') {
          let j = peek + 1;
          while (j < source.length && /\s/.test(source[j])) j++;
          if (j < source.length && source[j] === '|') {
            // Skip trailing block
            let blockDepth = 1;
            pos = peek + 1;
            while (pos < source.length && blockDepth > 0) {
              if (source[pos] === '{') blockDepth++;
              else if (source[pos] === '}') blockDepth--;
              pos++;
            }
            lastExprEnd = pos; // After the '}'
            continue;
          }
        }

        // No chain or trailing block — expression ends here
        return lastExprEnd;
      }
    }

    // Track brackets (for index access like arr[0])
    if (ch === '[') depth++;
    if (ch === ']') {
      depth--;
      if (depth === 0) lastExprEnd = pos + 1;
    }

    // Statement boundary
    if (depth === 0 && (ch === '\n' || ch === ';' || ch === '}') && lastExprEnd > 0) {
      return lastExprEnd;
    }

    pos++;
  }

  // End of source
  if (lastExprEnd > 0) return lastExprEnd;
  return -1;
}

/**
 * Insert semicolons at the given positions (must be sorted descending).
 */
function insertSemicolons(source: string, positions: number[]): string {
  let result = source;
  for (const pos of positions) {
    result = result.slice(0, pos) + ';' + result.slice(pos);
  }
  return result;
}

/**
 * Fix a Pathogen source string by adding missing semicolons.
 */
function fixSource(source: string): { fixed: string; count: number } {
  const positions = findMissingSemicolonPositions(source);
  if (positions.length === 0) return { fixed: source, count: 0 };
  return { fixed: insertSemicolons(source, positions), count: positions.length };
}

// --- File processing ---

function processTestFile(filePath: string): number {
  let content = readFileSync(filePath, 'utf-8');
  let totalFixes = 0;

  // Template literals in compile/compilePath/compileWithContext/compileAnnotated/parse
  content = content.replace(
    /(compilePath|compile|compileWithContext|compileAnnotated|parse)\s*\(\s*`([\s\S]*?)`/g,
    (_match, fn, body) => {
      const { fixed, count } = fixSource(body);
      totalFixes += count;
      return `${fn}(\`${fixed}\``;
    }
  );

  // Single-quoted strings
  content = content.replace(
    /(compilePath|compile|compileWithContext|compileAnnotated|parse)\s*\('([^']+)'/g,
    (_match, fn, body) => {
      const { fixed, count } = fixSource(body);
      totalFixes += count;
      return `${fn}('${fixed}'`;
    }
  );

  // compileWithContext with trailing options: compileWithContext(`...`, { ... })
  content = content.replace(
    /(compileWithContext)\s*\(\s*`([\s\S]*?)`,/g,
    (_match, fn, body) => {
      const { fixed, count } = fixSource(body);
      totalFixes += count;
      return `${fn}(\`${fixed}\`,`;
    }
  );

  // runCli(['-e', '...']) single-quoted
  content = content.replace(
    /runCli\(\['-e',\s*'([^']+)'/g,
    (_match, body) => {
      const { fixed, count } = fixSource(body);
      totalFixes += count;
      return `runCli(['-e', '${fixed}'`;
    }
  );

  // writeFileSync with template literal Pathogen code
  content = content.replace(
    /(writeFileSync\([^,]+,\s*)`([\s\S]*?)`/g,
    (_match, prefix, body) => {
      if (/\b(let |fn |M |L |for |define |layer|circle|rect|polygon|log)\b/.test(body)) {
        const { fixed, count } = fixSource(body);
        totalFixes += count;
        return `${prefix}\`${fixed}\``;
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
  const { fixed, count } = fixSource(content);
  if (count > 0) writeFileSync(filePath, fixed);
  return count;
}

function walkDir(dir: string, ext: string): string[] {
  const results: string[] = [];
  try {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (full.includes('node_modules') || full.includes('.git/')) continue;
      try {
        const stat = statSync(full);
        if (stat.isDirectory()) results.push(...walkDir(full, ext));
        else if (full.endsWith(ext)) results.push(full);
      } catch { /* skip */ }
    }
  } catch { /* skip */ }
  return results;
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
