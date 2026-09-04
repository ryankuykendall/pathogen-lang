/**
 * Style-block opener migration (`${ … }` → `#{ … }`), driven by the FROZEN
 * pre-change grammar in scripts/legacy-style-opener/pathogen-legacy.grammar.
 *
 * The old parser already knows which `${` are style-block openers
 * (`StyleBlockLiteral.from`) and which are template / style-value
 * interpolations, strings, or comments. Rewriting exactly those offsets is
 * therefore mechanical: no regex heuristics touch the ~1,300 interpolations
 * in the corpus. The parser is built at runtime with @lezer/generator so the
 * codemod keeps working after src/parser/pathogen.grammar flips to `#{`.
 *
 * Three unit kinds share one core (`rewriteSource`):
 *   - a `.pathogen` file
 *   - a fenced code block in Markdown (info string empty or `pathogen`)
 *   - a string / template literal holding Pathogen inside a TS/JS file
 *
 * Idempotency: a unit that already contains `#{` is skipped. Re-parsing
 * migrated text with the legacy parser is NOT safe (`#` is an error there and
 * recovery can re-parse a value interpolation as a block), so the guard is
 * load-bearing — `#{` was never valid syntax before the change.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildParser } from '@lezer/generator';
import ts from 'typescript';

import { pathArgsTokenizer } from '../../src/parser/path-args-tokenizer';
import { PathArgs } from '../../src/parser/pathogen.generated.terms';

import type { LRParser } from '@lezer/lr';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const LEGACY_GRAMMAR_PATH = join(__dirname, '..', 'legacy-style-opener', 'pathogen-legacy.grammar');

const OLD_OPENER = '${';
const NEW_OPENER = '#{';
/** Lines of distance within which an error node marks an opener "review". */
const REVIEW_RADIUS_LINES = 2;

let cachedParser: LRParser | null = null;

/** Build (once per process) the parser for the frozen pre-change grammar. */
export function buildLegacyParser(): LRParser {
  if (cachedParser) return cachedParser;
  const grammar = readFileSync(LEGACY_GRAMMAR_PATH, 'utf-8');
  cachedParser = buildParser(grammar, {
    externalTokenizer: (name, terms) => {
      if (name !== 'pathArgsTokenizer') {
        throw new Error(`legacy grammar declares an unexpected external tokenizer '${name}'`);
      }
      if (terms.PathArgs !== PathArgs) {
        throw new Error(
          `legacy grammar assigns PathArgs=${terms.PathArgs} but the live terms file says ${PathArgs}; ` +
            'the shared path-args tokenizer would emit the wrong term id',
        );
      }
      return pathArgsTokenizer;
    },
  });
  return cachedParser;
}

// ─── Core ──────────────────────────────────────────────────────────────

export interface OpenerHit {
  /** Offset of the `$` in the source handed to the parser. */
  offset: number;
  /** An error node begins within REVIEW_RADIUS_LINES of this opener. */
  nearError: boolean;
  /**
   * The block's interior is empty or holds `name: …` declarations. Error
   * recovery can wrap a bare interpolation (`${capName}` in a fragment shown
   * outside any block, or `${x}` in JS/bash inside a bare fence) in a
   * StyleBlockLiteral node; its interior is an expression, never a
   * declaration list, so such hits are rejected.
   */
  blockLike: boolean;
}

/** A property name at the start of the body or after a `;` / newline (comments allowed between). */
// `(?![-=+?])` keeps bash parameter expansion (`${VAR:-x}`, `${VAR:=x}`) out.
const DECLARATION_SHAPE = /(^|[;\n])\s*(\/\/[^\n]*\n\s*)*[a-zA-Z_-][a-zA-Z0-9_-]*\s*:(?![-=+?])/;
/** A property name being typed: `${ stroke-w` with no closing brace yet. */
const PARTIAL_NAME = /^\s*[a-zA-Z-][a-zA-Z0-9-]*\s*$/;

/**
 * Accept: an empty interior; an interior of underscore runs only (a JS
 * interpolation stood in for the declarations in a TS literal); one holding
 * a `name:` declaration or any `;` (interpolation expressions carry neither);
 * or, for an UNCLOSED block, a bare property-name prefix (mid-typing).
 */
function isBlockLike(body: string, closed: boolean): boolean {
  if (/^[\s_]*$/.test(body)) return true;
  if (DECLARATION_SHAPE.test(body) || body.includes(';')) return true;
  return !closed && PARTIAL_NAME.test(body);
}

function lineStarts(source: string): number[] {
  const starts = [0];
  for (let i = 0; i < source.length; i++) if (source.charCodeAt(i) === 10) starts.push(i + 1);
  return starts;
}

function lineOf(starts: number[], offset: number): number {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = Math.floor((lo + hi + 1) / 2);
    if (starts[mid] <= offset) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

export interface ScanResult {
  hits: OpenerHit[];
  errorCount: number;
}

/** Every legacy style-block opener in `source`, per the frozen grammar. */
export function scanLegacyOpeners(source: string, parser: LRParser = buildLegacyParser()): ScanResult {
  const tree = parser.parse(source);
  const starts = lineStarts(source);
  const errorLines: number[] = [];
  const blocks: { from: number; to: number }[] = [];
  tree.iterate({
    enter(node) {
      if (node.type.isError) errorLines.push(lineOf(starts, node.from));
      if (node.name === 'StyleBlockLiteral' && source.startsWith(OLD_OPENER, node.from)) {
        blocks.push({ from: node.from, to: node.to });
      }
    },
  });
  const hits = blocks.map(({ from, to }) => {
    const line = lineOf(starts, from);
    const closed = source[to - 1] === '}';
    const bodyEnd = closed ? to - 1 : to;
    return {
      offset: from,
      nearError: errorLines.some((l) => Math.abs(l - line) <= REVIEW_RADIUS_LINES),
      blockLike: isBlockLike(source.slice(from + OLD_OPENER.length, bodyEnd), closed),
    };
  });
  return { hits, errorCount: errorLines.length };
}

export function findLegacyOpeners(source: string, parser?: LRParser): number[] {
  return scanLegacyOpeners(source, parser).hits.map((h) => h.offset);
}

export type UnitOutcome =
  | { kind: 'rewritten'; text: string; offsets: number[]; review: number[]; rejected: number[] }
  | { kind: 'no-openers'; rejected: number[] }
  | { kind: 'already-migrated' };

/** Rewrite every legacy opener in one Pathogen source unit. */
export function rewriteSource(source: string, parser: LRParser = buildLegacyParser()): UnitOutcome {
  if (!source.includes(OLD_OPENER)) return { kind: 'no-openers', rejected: [] };
  if (source.includes(NEW_OPENER)) return { kind: 'already-migrated' };
  const { hits } = scanLegacyOpeners(source, parser);
  const accepted = hits.filter((h) => h.blockLike);
  const rejected = hits.filter((h) => !h.blockLike).map((h) => h.offset);
  if (accepted.length === 0) return { kind: 'no-openers', rejected };
  let text = source;
  for (const { offset } of [...accepted].sort((a, b) => b.offset - a.offset)) {
    text = `${text.slice(0, offset)}#${text.slice(offset + 1)}`;
  }
  return {
    kind: 'rewritten',
    text,
    offsets: accepted.map((h) => h.offset),
    review: accepted.filter((h) => h.nearError).map((h) => h.offset),
    rejected,
  };
}

// ─── Reports ───────────────────────────────────────────────────────────

export interface UnitNote {
  /** 1-based line in the containing file. */
  line: number;
  reason: string;
  text?: string;
}

export interface FileReport {
  /** Units (files, fences, literals) that were candidates (contained `${`). */
  units: number;
  /** Openers rewritten. */
  rewritten: number;
  /** Openers rewritten next to a parse error — check by hand. */
  review: UnitNote[];
  /** Units left untouched, with the reason. */
  skipped: UnitNote[];
}

const REJECTED = 'probable interpolation (no declarations inside)';

function emptyReport(): FileReport {
  return { units: 0, rewritten: 0, review: [], skipped: [] };
}

function lineText(source: string, offset: number): string {
  const start = source.lastIndexOf('\n', offset - 1) + 1;
  let end = source.indexOf('\n', offset);
  if (end < 0) end = source.length;
  return source.slice(start, end).trim();
}

/** A whole `.pathogen` file. */
export function rewritePathogenFile(source: string, parser?: LRParser): { text: string; report: FileReport } {
  const report = emptyReport();
  if (!source.includes(OLD_OPENER)) return { text: source, report };
  report.units = 1;
  const out = rewriteSource(source, parser);
  const starts = lineStarts(source);
  if (out.kind === 'already-migrated') {
    report.skipped.push({ line: 1, reason: out.kind });
    return { text: source, report };
  }
  for (const o of out.rejected) {
    report.skipped.push({ line: lineOf(starts, o) + 1, reason: REJECTED, text: lineText(source, o) });
  }
  if (out.kind !== 'rewritten') return { text: source, report };
  report.rewritten = out.offsets.length;
  report.review = out.review.map((o) => ({
    line: lineOf(starts, o) + 1,
    reason: 'parse error nearby',
    text: lineText(source, o),
  }));
  return { text: out.text, report };
}

// ─── Markdown ──────────────────────────────────────────────────────────

const FENCE_OPEN = /^(\s*)(`{3,}|~{3,})\s*([^\s`~]*)/;

/**
 * Rewrite Pathogen inside fenced code blocks. A fence is a unit when its
 * info string is empty or `pathogen`. The block-content check in
 * scanLegacyOpeners is what keeps JS/bash `${x}` inside bare fences intact.
 */
export function rewriteMarkdown(
  text: string,
  parser: LRParser = buildLegacyParser(),
): { text: string; report: FileReport } {
  const report = emptyReport();
  const lines = text.split('\n');
  let i = 0;
  let changed = false;
  while (i < lines.length) {
    const open = FENCE_OPEN.exec(lines[i]);
    if (!open) {
      i++;
      continue;
    }
    const fenceChar = open[2][0];
    const fenceLen = open[2].length;
    const info = open[3].toLowerCase();
    const closeRe = new RegExp(`^\\s*${fenceChar === '`' ? '`' : '~'}{${fenceLen},}\\s*$`);
    let j = i + 1;
    while (j < lines.length && !closeRe.test(lines[j])) j++;
    const bodyStart = i + 1;
    const bodyEnd = j; // exclusive
    if (info === '' || info === 'pathogen') {
      const body = lines.slice(bodyStart, bodyEnd).join('\n');
      if (body.includes(OLD_OPENER)) {
        report.units++;
        const out = rewriteSource(body, parser);
        const starts = lineStarts(body);
        if (out.kind === 'already-migrated') {
          report.skipped.push({ line: bodyStart + 1, reason: out.kind, text: lines[i].trim() });
        } else {
          for (const o of out.rejected) {
            report.skipped.push({ line: bodyStart + lineOf(starts, o) + 1, reason: REJECTED, text: lineText(body, o) });
          }
        }
        if (out.kind === 'rewritten') {
          report.rewritten += out.offsets.length;
          for (const o of out.review) {
            report.review.push({
              line: bodyStart + lineOf(starts, o) + 1,
              reason: 'parse error nearby',
              text: lineText(body, o),
            });
          }
          lines.splice(bodyStart, bodyEnd - bodyStart, ...out.text.split('\n'));
          changed = true;
        }
      }
    }
    i = bodyEnd + 1;
  }
  return { text: changed ? lines.join('\n') : text, report };
}

// ─── TypeScript / JavaScript ───────────────────────────────────────────

/** Something in a literal that says "this is Pathogen, not HTML/CSS/URL text". */
const PATHOGEN_MARKER =
  /\b(define|let|layer|PathLayer|TextLayer|GroupLayer|fn|for|if|text|tspan|apply|enum|switch|log|circle|rect|polygon|calc)\b|@\{|&\{|^\s*[MLHVCSQTAZmlhvcsqtaz]\s+-?[\d.]/m;
/** VS Code / CodeMirror snippet placeholders — never Pathogen. */
const SNIPPET_PLACEHOLDER = /\$\{\d+[:|}]|\$\d/;

interface CookedChunk {
  /** Cooked text (escapes resolved, JS interpolations replaced). */
  cooked: string;
  /** cookedIndex → raw index in the file of that cooked character's first raw char. */
  rawOf: number[];
  /**
   * Raw [start, end) spans that must be replaced whole when the cooked
   * opener at `cookedIndex` is rewritten (a JS interpolation whose value is
   * literally `'${'`).
   */
  wrapped: Map<number, [number, number]>;
}

const SIMPLE_ESCAPES: Record<string, string> = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', v: '\v', '0': '\0' };

/** Cook one raw literal chunk (text between delimiters), tracking offsets. */
function cookChunk(file: string, from: number, to: number, into: CookedChunk): void {
  let i = from;
  while (i < to) {
    const ch = file[i];
    if (ch === '\\' && i + 1 < to) {
      const next = file[i + 1];
      let cooked: string;
      let len = 2;
      if (next === 'u' && file[i + 2] === '{') {
        const close = file.indexOf('}', i + 3);
        len = close < 0 ? 2 : close - i + 1;
        cooked = '�';
      } else if (next === 'u') {
        len = 6;
        cooked = '�';
      } else if (next === 'x') {
        len = 4;
        cooked = '�';
      } else if (next === '\n') {
        // line continuation: contributes nothing
        i += 2;
        continue;
      } else {
        cooked = SIMPLE_ESCAPES[next] ?? next;
      }
      into.cooked += cooked;
      into.rawOf.push(i);
      i += len;
      continue;
    }
    into.cooked += ch;
    into.rawOf.push(i);
    i++;
  }
}

interface LiteralUnit {
  /** Raw span of the literal's whole text (delimiters included). */
  start: number;
  end: number;
  chunk: CookedChunk;
}

function collectLiterals(file: string, fileName: string): LiteralUnit[] {
  const sf = ts.createSourceFile(
    fileName,
    file,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith('.js') ? ts.ScriptKind.JS : ts.ScriptKind.TS,
  );
  const units: LiteralUnit[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isNoSubstitutionTemplateLiteral(node)) {
      const start = node.getStart(sf);
      const chunk: CookedChunk = { cooked: '', rawOf: [], wrapped: new Map() };
      cookChunk(file, start + 1, node.end - 1, chunk);
      units.push({ start, end: node.end, chunk });
      return;
    }
    if (ts.isStringLiteral(node)) {
      const start = node.getStart(sf);
      const chunk: CookedChunk = { cooked: '', rawOf: [], wrapped: new Map() };
      cookChunk(file, start + 1, node.end - 1, chunk);
      units.push({ start, end: node.end, chunk });
      return;
    }
    if (ts.isTemplateExpression(node)) {
      const start = node.getStart(sf);
      const chunk: CookedChunk = { cooked: '', rawOf: [], wrapped: new Map() };
      // head: `...${
      cookChunk(file, start + 1, node.head.end - 2, chunk);
      let interpStart = node.head.end - 2;
      for (const span of node.templateSpans) {
        const litStart = span.literal.getStart(sf);
        const interpEnd = litStart + 1; // after the closing `}`
        const exprText = file.slice(interpStart + 2, litStart).trim();
        if (exprText === "'${'" || exprText === '"${"') {
          // `${'${'}` — the opener smuggled past the template syntax.
          chunk.wrapped.set(chunk.cooked.length, [interpStart, interpEnd]);
          chunk.cooked += OLD_OPENER;
          chunk.rawOf.push(interpStart, interpStart + 1);
        } else {
          // Any other JS interpolation becomes an identifier of the same
          // raw length so Pathogen offsets survive and the parse stays sane.
          for (let k = interpStart; k < interpEnd; k++) {
            chunk.cooked += '_';
            chunk.rawOf.push(k);
          }
        }
        const isTail = span.literal.kind === ts.SyntaxKind.TemplateTail;
        cookChunk(file, litStart + 1, isTail ? span.literal.end - 1 : span.literal.end - 2, chunk);
        interpStart = span.literal.end - 2;
        // Nested template expressions inside the interpolation are
        // visited as their own units; expression text is otherwise opaque.
        ts.forEachChild(span.expression, visit);
      }
      units.push({ start, end: node.end, chunk });
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return units;
}

/**
 * Rewrite Pathogen embedded in string / template literals. Literals must
 * contain `${` (cooked), carry a Pathogen marker, hold no snippet
 * placeholders, and not already contain `#{`.
 */
export function rewriteTypeScript(
  file: string,
  parser: LRParser = buildLegacyParser(),
  fileName = 'file.ts',
): { text: string; report: FileReport } {
  const report = emptyReport();
  if (!file.includes(OLD_OPENER)) return { text: file, report };
  const starts = lineStarts(file);
  const edits: { from: number; to: number; insert: string }[] = [];

  for (const unit of collectLiterals(file, fileName)) {
    const { cooked, rawOf, wrapped } = unit.chunk;
    if (!cooked.includes(OLD_OPENER)) continue;
    const line = lineOf(starts, unit.start) + 1;
    if (cooked.includes(NEW_OPENER)) {
      report.units++;
      report.skipped.push({ line, reason: 'already-migrated' });
      continue;
    }
    if (SNIPPET_PLACEHOLDER.test(cooked)) {
      report.units++;
      report.skipped.push({ line, reason: 'skipped-snippet-placeholders', text: lineText(file, unit.start) });
      continue;
    }
    if (!PATHOGEN_MARKER.test(cooked)) continue; // HTML / CSS / URL text with JS interpolation
    report.units++;
    const { hits } = scanLegacyOpeners(cooked, parser);
    if (hits.length === 0) continue;
    for (const hit of hits) {
      const rawStart = rawOf[hit.offset];
      if (!hit.blockLike) {
        report.skipped.push({ line: lineOf(starts, rawStart) + 1, reason: REJECTED, text: lineText(file, rawStart) });
        continue;
      }
      const span = wrapped.get(hit.offset);
      if (span) edits.push({ from: span[0], to: span[1], insert: NEW_OPENER });
      else if (file[rawStart] === '\\') edits.push({ from: rawStart, to: rawStart + 2, insert: '#' });
      else edits.push({ from: rawStart, to: rawStart + 1, insert: '#' });
      report.rewritten++;
      if (hit.nearError)
        report.review.push({
          line: lineOf(starts, rawStart) + 1,
          reason: 'parse error nearby',
          text: lineText(file, rawStart),
        });
    }
  }

  if (edits.length === 0) return { text: file, report };
  edits.sort((a, b) => b.from - a.from);
  let text = file;
  for (const e of edits) text = text.slice(0, e.from) + e.insert + text.slice(e.to);
  return { text, report };
}
