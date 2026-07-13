import { Command } from 'commander';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BUILTIN_ENUMS, ENUM_METADATA } from '../src/api-surface';
import { stdlib, contextAwareFunctions } from '../src/stdlib';
import {
  DEFS_CONSTRUCTORS,
  FILTER_CONSTRUCTORS,
  VALUE_CONSTRUCTORS,
  LAYER_CONSTRUCTORS,
  EVALUATOR_CONSTRUCTORS,
} from '../src/evaluator/constructor-registry';
import {
  loadApiFile,
  extractFromPathogenApi,
  extractTypeMembers,
  extractNamespaceMembers,
  extractSignatureData,
  extractConstructorReturnTypes,
  extractTypeMethodReturns,
  escapeString,
} from './lib/completion-extract';
import type { ExtractedCompletion, MemberSet, ExtractionWarning } from './lib/completion-extract';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Cross-check pathogen-api.ts declarations against the runtime surface:
 * stdlib + contextAwareFunctions + the evaluator constructor registry
 * (src/evaluator/constructor-registry.ts — behaviorally verified against
 * the real dispatch by tests/constructor-registry.test.ts).
 * Returns drift findings; `--strict` turns them into a non-zero exit.
 */
function crossCheck(
  declaredFunctions: Set<string>,
  constructorReturnTypes: Record<string, { type: string; hasBindingBlock: boolean }>,
): string[] {
  const problems: string[] = [];
  const stdlibNames = new Set(Object.keys(stdlib));
  const contextNames = new Set(contextAwareFunctions);

  // Runtime functions with no declaration in pathogen-api.ts → no completion,
  // no hover, no signature help.
  const missingFromDecl: string[] = [];
  for (const name of stdlibNames) {
    if (!declaredFunctions.has(name)) missingFromDecl.push(name);
  }
  for (const name of contextNames) {
    if (!declaredFunctions.has(name)) missingFromDecl.push(name);
  }
  for (const name of EVALUATOR_CONSTRUCTORS) {
    if (!declaredFunctions.has(name)) missingFromDecl.push(name);
  }

  if (missingFromDecl.length > 0) {
    problems.push(
      `Runtime functions not declared in pathogen-api.ts: ${missingFromDecl.join(', ')} — add declarations to src/pathogen-api.ts`,
    );
  }

  // Declared functions not present anywhere in the runtime → phantom completions.
  const runtimeNames = new Set<string>([
    ...stdlibNames,
    ...contextNames,
    ...VALUE_CONSTRUCTORS,
    ...LAYER_CONSTRUCTORS,
    ...FILTER_CONSTRUCTORS,
    ...DEFS_CONSTRUCTORS,
  ]);
  const extraDecl: string[] = [];
  for (const name of declaredFunctions) {
    if (!runtimeNames.has(name)) extraDecl.push(name);
  }

  if (extraDecl.length > 0) {
    problems.push(`Declared in pathogen-api.ts but not in runtime: ${extraDecl.join(', ')}`);
  }

  // Every defs/filter constructor should map to a @type interface so its
  // returned object gets member completions.
  const missingReturnType = [...DEFS_CONSTRUCTORS, ...FILTER_CONSTRUCTORS].filter(
    (name) => !(name in constructorReturnTypes),
  );
  if (missingReturnType.length > 0) {
    problems.push(
      `Constructors without a resolvable @type return interface (no member completions): ${missingReturnType.join(', ')}`,
    );
  }

  return problems;
}

function formatEntry(c: ExtractedCompletion, indent: string): string {
  const snippetPart = c.insertText ? `, insertText: '${escapeString(c.insertText)}', isSnippet: true` : '';
  return `${indent}{ label: '${c.label}', kind: '${c.kind}', detail: '${escapeString(c.detail)}', boost: ${c.boost}${snippetPart} }`;
}

const program = new Command();
program
  .name('generate-completions')
  .description('Generate completion data from API surface registry and pathogen-api.ts')
  .option('--strict', 'Exit non-zero on any drift warning')
  .action((opts: { strict?: boolean }) => {
    const outputPath = path.resolve(__dirname, '../src/language-services/completion-data.generated.ts');
    const apiPath = path.resolve(__dirname, '../src/pathogen-api.ts');
    const sourceFile = loadApiFile(apiPath);
    const warnings: ExtractionWarning[] = [];

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
      const memberEntries = Object.entries(members).map(
        ([memberName, value]) =>
          `    { label: '${memberName}', kind: 'constant', detail: '${enumName}.${memberName} → "${escapeString(value)}"', boost: 8 }`,
      );
      return `  ${enumName}: [\n${memberEntries.join(',\n')},\n  ]`;
    });

    // =========================================================================
    // Phase 2: Stdlib completions (from pathogen-api.ts via ts-morph)
    // =========================================================================

    const stdlibCompletions = extractFromPathogenApi(sourceFile, warnings);
    const stdlibEntries = stdlibCompletions.map((c) => formatEntry(c, '  '));

    // =========================================================================
    // Phase 4: Signature data + constructor return types + cross-check
    // =========================================================================

    const signatureData = extractSignatureData(sourceFile);
    const signatureEntries = signatureData.map((s) => {
      const paramsArr = s.params.map((p) => `'${p}'`).join(', ');
      return `  '${s.name}': { label: '${escapeString(s.label)}', params: [${paramsArr}], doc: '${escapeString(s.doc)}' }`;
    });

    const constructorReturnTypes = extractConstructorReturnTypes(sourceFile);
    const constructorEntries = Object.entries(constructorReturnTypes).map(
      ([name, info]) => `  '${name}': { type: '${info.type}', hasBindingBlock: ${info.hasBindingBlock} }`,
    );

    const typeMethodReturns = extractTypeMethodReturns(sourceFile);
    const methodReturnEntries = Object.entries(typeMethodReturns).map(([typeName, returns]) => {
      const inner = Object.entries(returns)
        .map(([m, t]) => `${m}: '${t}'`)
        .join(', ');
      return `  '${typeName}': { ${inner} }`;
    });

    // Cross-check: compare declarations against runtime
    const declaredFunctions = new Set(signatureData.map((s) => s.name));
    const problems = crossCheck(declaredFunctions, constructorReturnTypes);
    for (const p of problems) console.warn(`⚠ ${p}`);

    // =========================================================================
    // Phase 3: Type members + namespace members (from pathogen-api.ts interfaces)
    // =========================================================================

    const typeMembers = extractTypeMembers(sourceFile, warnings);
    const namespaceMembers = extractNamespaceMembers(sourceFile, warnings);

    for (const w of warnings) console.warn(`⚠ ${w.member}: ${w.message}`);

    function formatMemberSet(ms: MemberSet): string {
      const formatEntries = (entries: ExtractedCompletion[]) => {
        if (entries.length === 0) return '';
        return `${entries.map((c) => formatEntry(c, '      ')).join(',\n')},`;
      };
      const propsStr = formatEntries(ms.properties);
      const methsStr = formatEntries(ms.methods);
      return `  '${ms.typeName}': {\n    properties: [\n${propsStr}\n    ],\n    methods: [\n${methsStr}\n    ],\n  }`;
    }

    const typeMemberEntries = typeMembers.map(formatMemberSet);
    const namespaceMemberEntries = namespaceMembers.map(formatMemberSet);

    // =========================================================================
    // Build output
    // =========================================================================

    const output = `// AUTO-GENERATED by scripts/generate-completions.ts — DO NOT EDIT
// Source: src/api-surface.ts (enums) + src/pathogen-api.ts (stdlib, types, namespaces)
// Regenerate: npm run generate:completions

import type { CompletionEntry, MemberCompletionSet } from './completion-data-static';

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

/** Type member completion sets keyed by Pathogen type name */
export const TYPE_MEMBERS: Record<string, MemberCompletionSet> = {
${typeMemberEntries.join(',\n')},
};

/** Namespace member completion sets keyed by namespace name */
export const NAMESPACE_MEMBERS: Record<string, MemberCompletionSet> = {
${namespaceMemberEntries.join(',\n')},
};

/** Signature data for signature help, keyed by function name */
export const SIGNATURE_DATA: Record<string, { label: string; params: string[]; doc: string }> = {
${signatureEntries.join(',\n')},
};

/** Constructor name → Pathogen type of the returned value (drives member-access inference) */
export const CONSTRUCTOR_RETURN_TYPES: Record<string, { type: string; hasBindingBlock: boolean }> = {
${constructorEntries.join(',\n')},
};

/** Per-type method return types (resolves chains like grid.getPoint(0,0).x) */
export const TYPE_METHOD_RETURNS: Record<string, Record<string, string>> = {
${methodReturnEntries.join(',\n')},
};
`;

    fs.writeFileSync(outputPath, output, 'utf-8');

    const enumMemberCount = Object.values(BUILTIN_ENUMS).reduce((n, m) => n + Object.keys(m).length, 0);
    console.log(`✓ Generated ${outputPath}`);
    console.log(`  ${enumNames.length} enums (${enumMemberCount} members)`);
    console.log(`  ${stdlibCompletions.length} stdlib/constructor/namespace completions`);
    console.log(
      `  ${typeMembers.length} type member sets (${typeMembers.reduce((n, m) => n + m.properties.length + m.methods.length, 0)} total members)`,
    );
    console.log(
      `  ${namespaceMembers.length} namespace member sets (${namespaceMembers.reduce((n, m) => n + m.methods.length, 0)} total methods)`,
    );
    console.log(`  ${signatureData.length} function signatures`);
    console.log(`  ${Object.keys(constructorReturnTypes).length} constructor return-type mappings`);

    if (opts.strict && (problems.length > 0 || warnings.length > 0 || missingMetadata.length > 0)) {
      console.error(
        `✗ --strict: ${problems.length + warnings.length + missingMetadata.length} drift finding(s) — see warnings above`,
      );
      process.exit(1);
    }
  });

program.parse();
