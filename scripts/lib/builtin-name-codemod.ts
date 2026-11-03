/**
 * The codemod for phase 0a step 5: rename every declaration that uses a
 * built-in name (docs/syntax.md "Built-in names") to a free name, with the
 * same rename the editors' quick fix uses (language-services rename.ts
 * `renameDeclarationEdits`, scope-aware: object keys, `.members`, strings and
 * same-named built-in calls elsewhere stay put; `{ min }` becomes
 * `{ min: minValue }`).
 *
 * A rename is accepted only when the renamed source parses under the new
 * rules AND compiles to the same output as the original under the OLD
 * evaluator (the one production ran before the change): the same SVG, the
 * same logged values (log labels repeat the source text, so a renamed
 * variable's label differs by design) and the same warnings. Anything else —
 * including a program that already fails to compile — is left alone and
 * reported for review.
 */
import { BUILTIN_NAMES, suggestName } from '../../src/builtin-names';
import { RESERVED_UNIT_NAMES } from '../../src/evaluator/reserved-names';
import { StringTextDocument } from '../../src/language-services/document';
import { renameDeclarationEdits } from '../../src/language-services/rename';
import { analyzeScopes, declarationName } from '../../src/language-services/scope-analysis';
import * as nodeHost from '../../src/node';
import { lezerParser, parse, planFontDirectives, resolveFonts } from '../../src';
import { findReservedBindings } from '../../src/parser/reserved-bindings';
import { withSeededRandom } from './semantics-audit/random';

import type { ResolvedFont } from '../../src/host/load-fonts';
import type { TextEdit } from '../../src/language-services/rename';
import type { PathogenModule } from './semantics-audit/baseline';

export interface Rename {
  from: string;
  to: string;
}

export type CodemodOutcome =
  | { kind: 'none' }
  /** `note` says when the program failed before and fails the same way after (behaviour unchanged). */
  | { kind: 'renamed'; text: string; renames: Rename[]; note?: string }
  | { kind: 'review'; reason: string; renames?: Rename[] };

/**
 * The program's `@font` fonts, loaded as the CLI loads them (installed fonts,
 * the download cache, then Google Fonts), so the same-output check compiles
 * glyph geometry for real. A stored program has no project folder, so file
 * paths in `@font` can't resolve — those programs fail before and after alike.
 */
export async function resolveProgramFonts(source: string): Promise<ResolvedFont[]> {
  if (!planFontDirectives(source)?.directives.length) return [];
  const root = process.cwd();
  const host = nodeHost.createNodeFontHost({
    root,
    programDir: root,
    offlineReason: nodeHost.offlineReason(false),
    cacheDir: nodeHost.defaultCacheDir(),
    fontDirs: nodeHost.fontDirsFromEnv(process.env.PATHOGEN_FONT_DIRS),
  });
  const { fonts } = await resolveFonts(source, { host, entry: '/<stored>.pathogen' });
  return fonts;
}

/** Built-in names the source declares (pi/deg/rad were already errors and keep their own rule). */
export function builtinDeclarations(source: string): { name: string; offset: number }[] {
  return findReservedBindings(lezerParser.parse(source), source)
    .filter((b) => BUILTIN_NAMES.has(b.name) && !RESERVED_UNIT_NAMES.has(b.name))
    .map((b) => ({ name: b.name, offset: b.offset }));
}

function applyEdits(source: string, doc: StringTextDocument, edits: TextEdit[]): string {
  const sorted = [...edits].sort((a, b) => doc.offsetAt(b.range.start) - doc.offsetAt(a.range.start));
  let out = source;
  for (const e of sorted) {
    out = out.slice(0, doc.offsetAt(e.range.start)) + e.newText + out.slice(doc.offsetAt(e.range.end));
  }
  return out;
}

/** Rename one declaration at a time (positions move after each), until none is left. */
export function renameBuiltinDeclarations(source: string): CodemodOutcome {
  let text = source;
  const renames: Rename[] = [];
  const chosen = new Set<string>();
  for (let round = 0; round < 100; round++) {
    const [first] = builtinDeclarations(text);
    if (!first) return renames.length ? { kind: 'renamed', text, renames } : { kind: 'none' };
    const doc = new StringTextDocument(text);
    const info = analyzeScopes(doc);
    const decl = info.declarations.find(
      (d) => d.name === first.name && declarationName(info, d, doc) && doc.offsetAt(declarationName(info, d, doc)!.range.start) === first.offset,
    );
    if (!decl) return { kind: 'review', reason: `no declaration found for ${first.name} at offset ${first.offset}`, renames };
    const used = new Set([...info.declarations.map((d) => d.name), ...info.references.map((r) => r.name), ...chosen]);
    const to = suggestName(first.name, (n) => used.has(n), decl.kind === 'function');
    chosen.add(to);
    text = applyEdits(text, doc, renameDeclarationEdits(doc, info, decl, to));
    renames.push({ from: first.name, to });
  }
  return { kind: 'review', reason: 'more than 100 renames', renames };
}

interface Output {
  error?: string;
  svg?: string;
  logs?: string;
  warnings?: string;
}

/** What a program produces under `lib`, with Math.random seeded by `key` (the same sequence for both versions). */
function outputUnder(lib: PathogenModule, source: string, key: string, fonts: readonly ResolvedFont[]): Output {
  const registry = fonts.length ? lib.buildFontRegistry(fonts).registry : undefined;
  return withSeededRandom(key, (): Output => {
    try {
      const result = lib.compile(source, { fonts: registry });
      return {
        svg: lib.generateSvg(result),
        logs: JSON.stringify(result.logs.map((entry) => entry.parts.map((p) => p.value))),
        warnings: JSON.stringify((result.warnings ?? []).map((w) => [w.code, w.line, w.column])),
      };
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  }).value;
}

/**
 * The codemod plus its gate. `oldLib` is the evaluator before the change;
 * `key` seeds Math.random identically for the original and the renamed text.
 * Fonts are loaded from the RENAMED text (the font planner parses with the
 * new rules, which refuse the original) and used for both compiles.
 *
 * A program that already failed is accepted only when the renamed text fails
 * with the identical message: it behaves exactly as before, where leaving it
 * would swap its error for the new naming error.
 */
export async function migrateSource(source: string, oldLib: PathogenModule, key: string): Promise<CodemodOutcome> {
  const out = renameBuiltinDeclarations(source);
  if (out.kind !== 'renamed') return out;
  try {
    parse(out.text);
  } catch (err) {
    return { kind: 'review', reason: `renamed source does not parse: ${(err as Error).message}`, renames: out.renames };
  }
  const fonts = await resolveProgramFonts(out.text);
  if (fonts.length) await oldLib.ensureOpentype(); // glyph outlines need the font parser loaded, as in the CLI
  const before = outputUnder(oldLib, source, key, fonts);
  const after = outputUnder(oldLib, out.text, key, fonts);
  if (before.error !== undefined || after.error !== undefined) {
    if (before.error === after.error) return { ...out, note: `fails as before: ${before.error}` };
    return {
      kind: 'review',
      reason: `errors differ — before: ${before.error ?? '(none)'}; after: ${after.error ?? '(none)'}`,
      renames: out.renames,
    };
  }
  for (const field of ['svg', 'logs', 'warnings'] as const) {
    if (before[field] !== after[field]) {
      return { kind: 'review', reason: `output differs after renaming (${field})`, renames: out.renames };
    }
  }
  return out;
}
