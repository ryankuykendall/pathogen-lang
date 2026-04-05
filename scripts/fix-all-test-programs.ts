#!/usr/bin/env tsx
/**
 * Find ALL Pathogen source code embedded in TypeScript test files,
 * parse each one, and add missing semicolons using AST positions.
 *
 * Strategy: find all backtick-delimited strings in each test file,
 * try to parse each as Pathogen, and fix any that have missing-semicolon
 * PathCommand nodes.
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { parse } from '../src/parser/index';
import type { Statement, PathCommand } from '../src/parser/ast';

function findMissingSemicolonPositions(source: string): number[] {
  let ast;
  try { ast = parse(source); } catch { return []; }
  const positions: number[] = [];
  walkStatements(ast.body, source, positions);
  return positions.sort((a, b) => b - a);
}

function walkStatements(stmts: Statement[], source: string, positions: number[]): void {
  for (const stmt of stmts) {
    if (stmt.type === 'PathCommand' && (stmt as PathCommand).command === '') {
      const loc = (stmt as any).loc;
      if (loc) {
        const endPos = findExpressionEnd(source, loc.offset);
        if (endPos >= 0 && source[endPos] !== ';') {
          positions.push(endPos);
        }
      }
    }
    // Recurse into all nested blocks
    const s = stmt as any;
    if (s.body && Array.isArray(s.body)) walkStatements(s.body, source, positions);
    if (s.consequent && Array.isArray(s.consequent)) walkStatements(s.consequent, source, positions);
    if (s.alternate && Array.isArray(s.alternate)) walkStatements(s.alternate, source, positions);
    // Walk into expression values with blocks
    if (s.value?.body && Array.isArray(s.value.body)) walkStatements(s.value.body, source, positions);
    if (s.value?.block?.body) walkStatements(s.value.block.body, source, positions);
    // Walk into PathCommand args with blocks
    if (s.args) {
      for (const arg of s.args) {
        if (arg?.block?.body) walkStatements(arg.block.body, source, positions);
      }
    }
    // Walk into expression's blocks
    if (s.expression?.block?.body) walkStatements(s.expression.block.body, source, positions);
  }
}

function findExpressionEnd(source: string, startOffset: number): number {
  let pos = startOffset;
  let depth = 0;
  let lastExprEnd = -1;
  let inString = false;
  let stringChar = '';

  while (pos < source.length) {
    const ch = source[pos];
    if (inString) {
      if (ch === stringChar && source[pos - 1] !== '\\') inString = false;
      pos++; continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { inString = true; stringChar = ch; pos++; continue; }
    if (ch === '(' || ch === '[') depth++;
    if (ch === ')' || ch === ']') {
      depth--;
      if (depth === 0) {
        lastExprEnd = pos + 1;
        let peek = pos + 1;
        while (peek < source.length && /\s/.test(source[peek])) peek++;
        if (peek < source.length && source[peek] === '.') { pos++; continue; }
        if (peek < source.length && source[peek] === '{') {
          let j = peek + 1;
          while (j < source.length && /\s/.test(source[j])) j++;
          if (j < source.length && source[j] === '|') {
            let bd = 1; pos = peek + 1;
            while (pos < source.length && bd > 0) { if (source[pos] === '{') bd++; else if (source[pos] === '}') bd--; pos++; }
            lastExprEnd = pos; continue;
          }
        }
        return lastExprEnd;
      }
    }
    if (depth === 0 && (ch === '\n' || ch === ';' || ch === '}') && lastExprEnd > 0) return lastExprEnd;
    pos++;
  }
  return lastExprEnd > 0 ? lastExprEnd : -1;
}

function insertSemicolons(source: string, positions: number[]): string {
  let result = source;
  for (const pos of positions) {
    result = result.slice(0, pos) + ';' + result.slice(pos);
  }
  return result;
}

function fixSource(source: string): { fixed: string; count: number } {
  const positions = findMissingSemicolonPositions(source);
  if (positions.length === 0) return { fixed: source, count: 0 };
  return { fixed: insertSemicolons(source, positions), count: positions.length };
}

function processTestFile(filePath: string): number {
  const content = readFileSync(filePath, 'utf-8');
  let totalFixes = 0;

  // Find all backtick-delimited strings (template literals)
  // and try to parse them as Pathogen code
  let result = '';
  let pos = 0;

  while (pos < content.length) {
    const backtickStart = content.indexOf('`', pos);
    if (backtickStart === -1) {
      result += content.slice(pos);
      break;
    }

    // Copy everything up to the backtick
    result += content.slice(pos, backtickStart + 1);
    pos = backtickStart + 1;

    // Find the matching closing backtick (handling escaped backticks and ${} interpolation)
    let depth = 0;
    let end = pos;
    while (end < content.length) {
      if (content[end] === '\\') { end += 2; continue; }
      if (content[end] === '$' && end + 1 < content.length && content[end + 1] === '{') {
        depth++; end += 2; continue;
      }
      if (content[end] === '{') { if (depth > 0) depth++; end++; continue; }
      if (content[end] === '}') { if (depth > 0) depth--; end++; continue; }
      if (content[end] === '`' && depth === 0) break;
      end++;
    }

    if (end >= content.length) {
      result += content.slice(pos);
      break;
    }

    // Extract the template literal body
    const body = content.slice(pos, end);

    // Unescape \$ for Pathogen parsing
    const unescaped = body.replace(/\\\$/g, '$');

    // Try to fix the Pathogen source
    const { fixed, count } = fixSource(unescaped);
    totalFixes += count;

    // Re-escape $ back to \$ for the TypeScript template literal
    const reescaped = count > 0 ? fixed.replace(/(?<![\\])\$/g, '\\$') : body;

    result += reescaped;
    pos = end;
  }

  if (totalFixes > 0) {
    writeFileSync(filePath, result);
    console.log(`  ${filePath}: ${totalFixes} semicolons added`);
  }
  return totalFixes;
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
      } catch {}
    }
  } catch {}
  return results;
}

// Main
console.log('Processing test files...');
let total = 0;
for (const file of walkDir('tests', '.test.ts')) {
  total += processTestFile(file);
}
console.log(`\nTotal: ${total} semicolons added`);
