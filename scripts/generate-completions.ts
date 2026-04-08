import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { Project } from 'ts-morph';
import { BUILTIN_ENUMS, ENUM_METADATA } from '../src/api-surface';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface ExtractedCompletion {
  label: string;
  kind: string;
  detail: string;
  boost: number;
}

/**
 * Parse a JSDoc comment to extract the detail string, @boost, and @kind values.
 * Expected format: "description text @boost N @kind kindName"
 * The detail string is everything before the first @tag.
 */
function parseJsDoc(comment: string): { detail: string; boost: number; kind: string } {
  let boost = 8;
  let kind = 'function';

  const boostMatch = comment.match(/@boost\s+(\d+)/);
  if (boostMatch) boost = parseInt(boostMatch[1], 10);

  const kindMatch = comment.match(/@kind\s+(\w+)/);
  if (kindMatch) kind = kindMatch[1];

  // Detail is everything before the first @tag, trimmed
  const detail = comment.replace(/@boost\s+\d+/g, '').replace(/@kind\s+\w+/g, '').trim();

  return { detail, boost, kind };
}

/**
 * Get the raw JSDoc comment text from a node's JSDoc, including custom tags.
 * ts-morph's getDescription() strips unknown tags, so we parse the full text.
 */
function getRawJsDocComment(jsDocs: ReturnType<typeof import('ts-morph').FunctionDeclaration.prototype.getJsDocs>): string | null {
  if (jsDocs.length === 0) return null;
  // getFullText() returns "/** ... */" — strip the comment markers
  const full = jsDocs[0].getFullText();
  const inner = full.replace(/^\/\*\*\s*/, '').replace(/\s*\*\/$/, '').replace(/^\s*\*\s?/gm, '').trim();
  return inner || null;
}

/**
 * Extract stdlib function completions from pathogen-api.ts using ts-morph.
 */
function extractFromPathogenApi(apiPath: string): ExtractedCompletion[] {
  const project = new Project({ compilerOptions: { strict: false } });
  const sourceFile = project.addSourceFileAtPath(apiPath);
  const completions: ExtractedCompletion[] = [];

  // Extract top-level function declarations
  for (const fn of sourceFile.getFunctions()) {
    const name = fn.getName();
    if (!name) continue;

    const comment = getRawJsDocComment(fn.getJsDocs());
    if (!comment) continue;

    const { detail, boost, kind } = parseJsDoc(comment);
    completions.push({ label: name, kind, detail, boost });
  }

  // Extract variable declarations (like `ctx`)
  for (const decl of sourceFile.getVariableDeclarations()) {
    const name = decl.getName();
    const statement = decl.getVariableStatement();
    if (!statement) continue;

    const comment = getRawJsDocComment(statement.getJsDocs());
    if (!comment) continue;

    const { detail, boost, kind } = parseJsDoc(comment);
    completions.push({ label: name, kind, detail, boost });
  }

  // Extract namespace declarations (Color, Object)
  for (const ns of sourceFile.getModules()) {
    const name = ns.getName();

    const comment = getRawJsDocComment(ns.getJsDocs());
    if (!comment) continue;

    const { detail, boost, kind } = parseJsDoc(comment);
    completions.push({ label: name, kind, detail, boost });
  }

  return completions;
}

const program = new Command();
program
  .name('generate-completions')
  .description('Generate completion data from API surface registry and pathogen-api.ts')
  .action(() => {
    const outputPath = path.resolve(__dirname, '../src/language-services/completion-data.generated.ts');
    const apiPath = path.resolve(__dirname, '../src/pathogen-api.ts');

    // =========================================================================
    // Phase 1: Enum completions (from BUILTIN_ENUMS + ENUM_METADATA)
    // =========================================================================

    const missingMetadata = Object.keys(BUILTIN_ENUMS).filter((k) => !(k in ENUM_METADATA));
    if (missingMetadata.length > 0) {
      console.warn(`⚠ Missing ENUM_METADATA for: ${missingMetadata.join(', ')}`);
    }

    const enumNames = Object.keys(BUILTIN_ENUMS).sort();
    const enumCompletionEntries = enumNames.map((name) => {
      const meta = ENUM_METADATA[name] ?? { detail: `${name} enum`, boost: 6 };
      return `  { label: '${name}', kind: 'variable', detail: '${escapeString(meta.detail)}', boost: ${meta.boost} }`;
    });

    const enumMemberEntries = enumNames.map((enumName) => {
      const members = BUILTIN_ENUMS[enumName];
      const memberEntries = Object.entries(members).map(([memberName, value]) => {
        return `    { label: '${memberName}', kind: 'constant', detail: '${enumName}.${memberName} → "${escapeString(value)}"', boost: 8 }`;
      });
      return `  ${enumName}: [\n${memberEntries.join(',\n')},\n  ]`;
    });

    // =========================================================================
    // Phase 2: Stdlib completions (from pathogen-api.ts via ts-morph)
    // =========================================================================

    const stdlibCompletions = extractFromPathogenApi(apiPath);

    const stdlibEntries = stdlibCompletions.map((c) => {
      return `  { label: '${c.label}', kind: '${c.kind}', detail: '${escapeString(c.detail)}', boost: ${c.boost} }`;
    });

    // =========================================================================
    // Build output
    // =========================================================================

    const output = `// AUTO-GENERATED by scripts/generate-completions.ts — DO NOT EDIT
// Source: src/api-surface.ts (enums) + src/pathogen-api.ts (stdlib)
// Regenerate: npm run generate:completions

import type { CompletionEntry } from './completion-data';

/** Top-level enum name completions (GridPatternType, Easing, etc.) */
export const ENUM_COMPLETIONS: CompletionEntry[] = [
${enumCompletionEntries.join(',\n')},
];

/** Enum member completions keyed by enum name */
export const ENUM_MEMBER_MAP: Record<string, CompletionEntry[]> = {
${enumMemberEntries.join(',\n')},
};

/** Stdlib function, constructor, namespace, and context-aware completions */
export const STDLIB_COMPLETIONS: CompletionEntry[] = [
${stdlibEntries.join(',\n')},
];
`;

    fs.writeFileSync(outputPath, output, 'utf-8');

    const enumMemberCount = Object.values(BUILTIN_ENUMS).reduce((n, m) => n + Object.keys(m).length, 0);
    console.log(`✓ Generated ${outputPath}`);
    console.log(`  ${enumNames.length} enums (${enumMemberCount} members)`);
    console.log(`  ${stdlibCompletions.length} stdlib/constructor/namespace completions`);
  });

function escapeString(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

program.parse();
