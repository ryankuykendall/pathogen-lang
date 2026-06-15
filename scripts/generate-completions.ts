import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { Project } from 'ts-morph';
import { BUILTIN_ENUMS, ENUM_METADATA } from '../src/api-surface';
import { stdlib, contextAwareFunctions } from '../src/stdlib';

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

interface MemberSet {
  typeName: string;
  properties: ExtractedCompletion[];
  methods: ExtractedCompletion[];
}

/**
 * Extract type member completion sets from interfaces in pathogen-api.ts.
 * Interfaces with a `@type TypeName` JSDoc tag are extracted.
 */
function extractTypeMembers(apiPath: string): MemberSet[] {
  const project = new Project({ compilerOptions: { strict: false } });
  const sourceFile = project.addSourceFileAtPath(apiPath);
  const memberSets: MemberSet[] = [];

  for (const iface of sourceFile.getInterfaces()) {
    const comment = getRawJsDocComment(iface.getJsDocs());
    if (!comment) continue;

    // Extract @type tag to get the Pathogen type name
    const typeMatch = comment.match(/@type\s+(\w+)/);
    if (!typeMatch) continue;
    const typeName = typeMatch[1];

    const properties: ExtractedCompletion[] = [];
    const methods: ExtractedCompletion[] = [];

    // Extract properties
    for (const prop of iface.getProperties()) {
      const propComment = getRawJsDocComment(prop.getJsDocs());
      const detail = propComment ? parseJsDoc(propComment).detail : prop.getName();
      const boost = propComment ? parseJsDoc(propComment).boost : 8;
      properties.push({ label: prop.getName(), kind: 'property', detail, boost });
    }

    // Extract methods
    for (const method of iface.getMethods()) {
      const methodComment = getRawJsDocComment(method.getJsDocs());
      const detail = methodComment ? parseJsDoc(methodComment).detail : `${method.getName()}()`;
      const boost = methodComment ? parseJsDoc(methodComment).boost : 8;
      methods.push({ label: method.getName(), kind: 'function', detail, boost });
    }

    memberSets.push({ typeName, properties, methods });
  }

  return memberSets;
}

/**
 * Extract namespace member completion sets (Color.mix, Object.keys, etc.)
 */
function extractNamespaceMembers(apiPath: string): MemberSet[] {
  const project = new Project({ compilerOptions: { strict: false } });
  const sourceFile = project.addSourceFileAtPath(apiPath);
  const memberSets: MemberSet[] = [];

  for (const ns of sourceFile.getModules()) {
    const name = ns.getName();
    const methods: ExtractedCompletion[] = [];

    for (const fn of ns.getFunctions()) {
      const fnName = fn.getName();
      if (!fnName) continue;
      const fnComment = getRawJsDocComment(fn.getJsDocs());
      const detail = fnComment ? parseJsDoc(fnComment).detail : `${name}.${fnName}()`;
      const boost = fnComment ? parseJsDoc(fnComment).boost : 8;
      // Use the actual name, not delete_ → delete
      const label = fnName.endsWith('_') ? fnName.slice(0, -1) : fnName;
      methods.push({ label, kind: 'function', detail, boost });
    }

    if (methods.length > 0) {
      memberSets.push({ typeName: name, properties: [], methods });
    }
  }

  return memberSets;
}

interface SignatureEntry {
  name: string;
  label: string;
  params: string[];
  doc: string;
}

/**
 * Extract function signature data from pathogen-api.ts for signature help.
 */
function extractSignatureData(apiPath: string): SignatureEntry[] {
  const project = new Project({ compilerOptions: { strict: false } });
  const sourceFile = project.addSourceFileAtPath(apiPath);
  const signatures: SignatureEntry[] = [];

  for (const fn of sourceFile.getFunctions()) {
    const name = fn.getName();
    if (!name) continue;

    const params = fn.getParameters().map((p) => p.getName());
    // Skip rest params marker
    const cleanParams = params.map((p) => p.replace(/^\.\.\./, ''));

    const comment = getRawJsDocComment(fn.getJsDocs());
    const doc = comment ? parseJsDoc(comment).detail : `${name}()`;

    const paramsStr = cleanParams.join(', ');
    signatures.push({
      name,
      label: `${name}(${paramsStr})`,
      params: cleanParams,
      doc,
    });
  }

  return signatures;
}

/**
 * Cross-check pathogen-api.ts declarations against runtime stdlib + contextAwareFunctions.
 * Warns about drift between declarations and runtime.
 */
function crossCheck(declaredFunctions: Set<string>): void {
  const stdlibNames = new Set(Object.keys(stdlib));
  const contextNames = new Set(contextAwareFunctions);

  // Functions in stdlib but not declared
  const missingFromDecl: string[] = [];
  for (const name of stdlibNames) {
    if (!declaredFunctions.has(name)) missingFromDecl.push(name);
  }
  for (const name of contextNames) {
    if (!declaredFunctions.has(name)) missingFromDecl.push(name);
  }

  if (missingFromDecl.length > 0) {
    console.warn(`⚠ Runtime functions not declared in pathogen-api.ts: ${missingFromDecl.join(', ')}`);
    console.warn('  Add declarations to src/pathogen-api.ts');
  }

  // Declared functions not in runtime (excluding constructors, namespaces, variables)
  const runtimeNames = new Set([
    ...stdlibNames,
    ...contextNames,
    'Point', 'PolarVector', 'Cycler', 'CSSVar',
    'PathLayer', 'TextLayer', 'GroupLayer',
    // Filter constructors live in the evaluator's call dispatch, not the stdlib registry.
    'NoiseFilter', 'GlowFilter', 'EmbossFilter', 'ElevationShadowFilter', 'InnerShadowFilter', 'PixelateFilter',
    'MotionBlurFilter',
    // Grid constructor lives in the evaluator, not the stdlib registry.
    'Grid',
  ]);
  const extraDecl: string[] = [];
  for (const name of declaredFunctions) {
    if (!runtimeNames.has(name)) extraDecl.push(name);
  }

  if (extraDecl.length > 0) {
    console.warn(`⚠ Declared in pathogen-api.ts but not in runtime: ${extraDecl.join(', ')}`);
  }
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
    // Phase 4: Signature data + cross-check
    // =========================================================================

    const signatureData = extractSignatureData(apiPath);
    const signatureEntries = signatureData.map((s) => {
      const paramsArr = s.params.map((p) => `'${p}'`).join(', ');
      return `  '${s.name}': { label: '${escapeString(s.label)}', params: [${paramsArr}], doc: '${escapeString(s.doc)}' }`;
    });

    // Cross-check: compare declarations against runtime
    const declaredFunctions = new Set(signatureData.map((s) => s.name));
    crossCheck(declaredFunctions);

    // =========================================================================
    // Phase 3: Type members + namespace members (from pathogen-api.ts interfaces)
    // =========================================================================

    const typeMembers = extractTypeMembers(apiPath);
    const namespaceMembers = extractNamespaceMembers(apiPath);

    function formatMemberSet(ms: MemberSet): string {
      const formatEntries = (entries: ExtractedCompletion[]) => {
        if (entries.length === 0) return '';
        return entries.map((c) =>
          `      { label: '${c.label}', kind: '${c.kind}', detail: '${escapeString(c.detail)}', boost: ${c.boost} }`,
        ).join(',\n') + ',';
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
`;

    fs.writeFileSync(outputPath, output, 'utf-8');

    const enumMemberCount = Object.values(BUILTIN_ENUMS).reduce((n, m) => n + Object.keys(m).length, 0);
    console.log(`✓ Generated ${outputPath}`);
    console.log(`  ${enumNames.length} enums (${enumMemberCount} members)`);
    console.log(`  ${stdlibCompletions.length} stdlib/constructor/namespace completions`);
    console.log(`  ${typeMembers.length} type member sets (${typeMembers.reduce((n, m) => n + m.properties.length + m.methods.length, 0)} total members)`);
    console.log(`  ${namespaceMembers.length} namespace member sets (${namespaceMembers.reduce((n, m) => n + m.methods.length, 0)} total methods)`);
    console.log(`  ${signatureData.length} function signatures`);
  });

function escapeString(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

program.parse();
