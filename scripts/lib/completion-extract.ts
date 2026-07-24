/**
 * Pure extraction logic for generate-completions.ts.
 *
 * Parses src/pathogen-api.ts (via ts-morph) into completion entries, type
 * member sets, signature data, and constructor return-type mappings. Kept
 * free of Commander/file-writing side effects so it is unit-testable
 * (tests/language-services/generate-completions.test.ts).
 */
import { Project } from 'ts-morph';
import type { SourceFile, ParameterDeclaration, JSDocableNode } from 'ts-morph';

export interface ExtractedCompletion {
  label: string;
  kind: string;
  detail: string;
  boost: number;
  /** VS Code snippet syntax (`${1:x}`, `$0`); present only when the entry inserts a template */
  insertText?: string;
}

export interface MemberSet {
  typeName: string;
  properties: ExtractedCompletion[];
  methods: ExtractedCompletion[];
}

export interface SignatureEntry {
  name: string;
  label: string;
  params: string[];
  doc: string;
}

export interface ConstructorReturnType {
  /** Pathogen type name (`@type` tag of the returned interface) */
  type: string;
  /** True when the constructor's snippet binds a trailing block param (`{|g| ...}`) */
  hasBindingBlock: boolean;
}

export interface ParsedJsDoc {
  detail: string;
  boost: number;
  kind: string;
  /** `@snippet` template with `\n`/`\t` escapes already expanded */
  snippet?: string;
  /** `@blockparams` Pathogen type names of a method's trailing-block params, in order */
  blockParams?: string[];
}

/** Return type of a namespace function: the Pathogen type, plus the array element type when known. */
export interface NamespaceMethodReturn {
  type: string;
  elementType?: string;
}

/** Warnings collected during extraction (drift smells, missing tags). */
export interface ExtractionWarning {
  member: string;
  message: string;
}

/**
 * Parse a JSDoc comment to extract the detail string, @boost, @kind, and
 * @snippet values. Expected format:
 *   "description text @boost N @kind kindName"
 *   "description text @snippet template-to-end-of-line"
 * The detail string is everything before the first @tag. The @snippet value
 * runs to the end of its line; two-character `\n`/`\t` escapes are expanded
 * so templates can be written inline in single-line JSDoc.
 */
export function parseJsDoc(comment: string): ParsedJsDoc {
  let boost = 8;
  let kind = 'function';
  let snippet: string | undefined;
  let blockParams: string[] | undefined;

  const boostMatch = /@boost\s+(\d+)/.exec(comment);
  if (boostMatch) boost = parseInt(boostMatch[1], 10);

  const kindMatch = /@kind\s+(\w+)/.exec(comment);
  if (kindMatch) kind = kindMatch[1];

  const snippetMatch = /@snippet\s+(.+)$/m.exec(comment);
  if (snippetMatch) {
    snippet = snippetMatch[1].trim().replace(/\\n/g, '\n').replace(/\\t/g, '\t');
  }

  // @blockparams TypeA, TypeB — must precede @snippet in single-line JSDoc
  // (the snippet capture runs to end of line and would swallow it otherwise;
  // extractMethodBlockParams warns when a snippet contains the tag).
  const blockParamsMatch = /@blockparams\s+([A-Za-z_$][\w$]*(?:\s*,\s*[A-Za-z_$][\w$]*)*)/.exec(comment);
  if (blockParamsMatch) {
    blockParams = blockParamsMatch[1].split(',').map((s) => s.trim());
  }

  // Detail is everything before the first @tag, trimmed
  const detail = comment
    .replace(/@snippet\s+.+$/m, '')
    .replace(/@blockparams\s+[A-Za-z_$][\w$]*(?:\s*,\s*[A-Za-z_$][\w$]*)*/g, '')
    .replace(/@boost\s+\d+/g, '')
    .replace(/@kind\s+\w+/g, '')
    .trim();

  return { detail, boost, kind, snippet, ...(blockParams ? { blockParams } : {}) };
}

/**
 * Get the raw JSDoc comment text from a node's JSDoc, including custom tags.
 * ts-morph's getDescription() strips unknown tags, so we parse the full text.
 */
export function getRawJsDocComment(jsDocs: ReturnType<JSDocableNode['getJsDocs']>): string | null {
  if (jsDocs.length === 0) return null;
  // getFullText() returns "/** ... */" — strip the comment markers
  const full = jsDocs[0].getFullText();
  const inner = full
    .replace(/^\/\*\*\s*/, '')
    .replace(/\s*\*\/$/, '')
    .replace(/^\s*\*\s?/gm, '')
    .trim();
  return inner || null;
}

/** Load pathogen-api.ts into a ts-morph SourceFile (single parse shared by all extractors). */
export function loadApiFile(apiPath: string): SourceFile {
  const project = new Project({ compilerOptions: { strict: false } });
  return project.addSourceFileAtPath(apiPath);
}

/** Parse an inline declaration source (test fixture) instead of a file on disk. */
export function loadApiSource(source: string): SourceFile {
  const project = new Project({ compilerOptions: { strict: false }, useInMemoryFileSystem: true });
  return project.createSourceFile('pathogen-api.ts', source);
}

/**
 * Derive the snippet template for a callable completion.
 *
 * Priority:
 *   1. `@snippet` JSDoc tag — authoritative (needed for trailing-block syntax
 *      that TypeScript declarations cannot express, e.g. `apply { }`).
 *   2. Parens template from required parameters: `drawTo(${1:x}, ${2:y})$0`.
 *      Optional and defaulted params are omitted; a rest param becomes one
 *      placeholder; string-typed params get quoted placeholders (`'${1:id}'`).
 *   3. Zero required params → `name()$0`.
 */
export function deriveTemplate(name: string, params: ParameterDeclaration[], snippet?: string): string {
  if (snippet) return snippet;
  const required = params.filter((p) => !p.hasQuestionToken() && !p.hasInitializer());
  if (required.length === 0) return `${name}()$0`;
  const placeholders = required.map((p, i) => {
    const paramName = p.getName().replace(/^\.\.\./, '');
    const placeholder = `\${${i + 1}:${paramName}}`;
    const typeText = p.getTypeNode()?.getText() ?? '';
    return typeText === 'string' && !p.isRestParameter() ? `'${placeholder}'` : placeholder;
  });
  return `${name}(${placeholders.join(', ')})$0`;
}

/** Detail strings that look block-shaped — these need an explicit @snippet tag. */
function looksBlockShaped(detail: string): boolean {
  return detail.includes('{|') || detail.includes('{ }') || detail.includes('{ … }');
}

/**
 * Extract stdlib function/variable/namespace completions from pathogen-api.ts.
 * Callable entries carry a derived or @snippet insertText.
 */
export function extractFromPathogenApi(sourceFile: SourceFile, warnings?: ExtractionWarning[]): ExtractedCompletion[] {
  const completions: ExtractedCompletion[] = [];

  // Top-level function declarations → callable, with template
  for (const fn of sourceFile.getFunctions()) {
    const name = fn.getName();
    if (!name) continue;

    const comment = getRawJsDocComment(fn.getJsDocs());
    if (!comment) continue;

    const { detail, boost, kind, snippet } = parseJsDoc(comment);
    if (!snippet && looksBlockShaped(detail) && warnings) {
      warnings.push({ member: name, message: `detail looks block-shaped but has no @snippet tag: "${detail}"` });
    }
    const insertText = kind === 'function' ? deriveTemplate(name, fn.getParameters(), snippet) : snippet;
    completions.push({ label: name, kind, detail, boost, ...(insertText ? { insertText } : {}) });
  }

  // Variable declarations (like `ctx`) — no template
  for (const decl of sourceFile.getVariableDeclarations()) {
    const name = decl.getName();
    const statement = decl.getVariableStatement();
    if (!statement) continue;

    const comment = getRawJsDocComment(statement.getJsDocs());
    if (!comment) continue;

    const { detail, boost, kind } = parseJsDoc(comment);
    completions.push({ label: name, kind, detail, boost });
  }

  // Namespace declarations (Color, Object, Cap, PathBlock) — no template
  for (const ns of sourceFile.getModules()) {
    const name = ns.getName();

    const comment = getRawJsDocComment(ns.getJsDocs());
    if (!comment) continue;

    const { detail, boost, kind } = parseJsDoc(comment);
    completions.push({ label: name, kind, detail, boost });
  }

  return completions;
}

/**
 * Extract type member completion sets from interfaces in pathogen-api.ts.
 * Interfaces with a `@type TypeName` JSDoc tag are extracted. Methods carry
 * a derived or @snippet insertText.
 */
export function extractTypeMembers(sourceFile: SourceFile, warnings?: ExtractionWarning[]): MemberSet[] {
  const memberSets: MemberSet[] = [];

  for (const iface of sourceFile.getInterfaces()) {
    const comment = getRawJsDocComment(iface.getJsDocs());
    if (!comment) continue;

    const typeMatch = /@type\s+(\w+)/.exec(comment);
    if (!typeMatch) continue;
    const typeName = typeMatch[1];

    const properties: ExtractedCompletion[] = [];
    const methods: ExtractedCompletion[] = [];

    for (const prop of iface.getProperties()) {
      const propComment = getRawJsDocComment(prop.getJsDocs());
      const detail = propComment ? parseJsDoc(propComment).detail : prop.getName();
      const boost = propComment ? parseJsDoc(propComment).boost : 8;
      properties.push({ label: prop.getName(), kind: 'property', detail, boost });
    }

    for (const method of iface.getMethods()) {
      const methodComment = getRawJsDocComment(method.getJsDocs());
      const parsed = methodComment ? parseJsDoc(methodComment) : null;
      const detail = parsed?.detail ?? `${method.getName()}()`;
      const boost = parsed?.boost ?? 8;
      if (!parsed?.snippet && looksBlockShaped(detail) && warnings) {
        warnings.push({
          member: `${typeName}.${method.getName()}`,
          message: `detail looks block-shaped but has no @snippet tag: "${detail}"`,
        });
      }
      const insertText = deriveTemplate(method.getName(), method.getParameters(), parsed?.snippet);
      methods.push({ label: method.getName(), kind: 'function', detail, boost, insertText });
    }

    memberSets.push({ typeName, properties, methods });
  }

  return memberSets;
}

/**
 * Extract namespace member completion sets (Color.mix, Object.keys, etc.).
 * Members carry a derived or @snippet insertText.
 */
export function extractNamespaceMembers(sourceFile: SourceFile, warnings?: ExtractionWarning[]): MemberSet[] {
  const memberSets: MemberSet[] = [];

  for (const ns of sourceFile.getModules()) {
    const name = ns.getName();
    const methods: ExtractedCompletion[] = [];

    for (const fn of ns.getFunctions()) {
      const fnName = fn.getName();
      if (!fnName) continue;
      const fnComment = getRawJsDocComment(fn.getJsDocs());
      const parsed = fnComment ? parseJsDoc(fnComment) : null;
      const detail = parsed?.detail ?? `${name}.${fnName}()`;
      const boost = parsed?.boost ?? 8;
      // Use the actual name, not delete_ → delete
      const label = fnName.endsWith('_') ? fnName.slice(0, -1) : fnName;
      if (!parsed?.snippet && looksBlockShaped(detail) && warnings) {
        warnings.push({
          member: `${name}.${label}`,
          message: `detail looks block-shaped but has no @snippet tag: "${detail}"`,
        });
      }
      const insertText = deriveTemplate(label, fn.getParameters(), parsed?.snippet);
      methods.push({ label, kind: 'function', detail, boost, insertText });
    }

    if (methods.length > 0) {
      memberSets.push({ typeName: name, properties: [], methods });
    }
  }

  return memberSets;
}

/**
 * Extract function signature data from pathogen-api.ts for signature help.
 */
export function extractSignatureData(sourceFile: SourceFile): SignatureEntry[] {
  const signatures: SignatureEntry[] = [];

  for (const fn of sourceFile.getFunctions()) {
    const name = fn.getName();
    if (!name) continue;

    const params = fn.getParameters().map((p) => p.getName());
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
 * Map top-level constructor functions to the Pathogen type of the value they
 * return. A function participates when its declared return type names an
 * interface carrying a `@type` tag. Union return types (e.g. PathLayer) are
 * skipped — the engine keeps hand-written rules for those.
 */
export function extractConstructorReturnTypes(sourceFile: SourceFile): Record<string, ConstructorReturnType> {
  const ifaceToType = buildIfaceToTypeMap(sourceFile);
  const result: Record<string, ConstructorReturnType> = {};
  for (const fn of sourceFile.getFunctions()) {
    const name = fn.getName();
    if (!name) continue;
    const returnText = fn.getReturnTypeNode()?.getText();
    if (!returnText) continue;
    // Strip generic args (`PathogenArray<...>` → `PathogenArray`); skip unions
    if (returnText.includes('|')) continue;
    const bareName = returnText.replace(/<.*>$/, '').trim();
    const typeName = ifaceToType.get(bareName);
    if (!typeName) continue;

    const comment = getRawJsDocComment(fn.getJsDocs());
    const snippet = comment ? parseJsDoc(comment).snippet : undefined;
    result[name] = { type: typeName, hasBindingBlock: snippet?.includes('{|') ?? false };
  }
  return result;
}

/**
 * Map a declared TypeScript return-type text to a Pathogen type name, or null
 * when the return type has no member surface (void, number, unions, inline
 * object literals).
 */
function returnTextToPathogenType(returnText: string, ifaceToType: Map<string, string>): string | null {
  if (returnText.includes('|') || returnText.includes('{')) return null;
  if (returnText.endsWith('[]')) return 'array';
  const bareName = returnText.replace(/<.*>$/, '').trim();
  if (bareName === 'string') return 'string';
  return ifaceToType.get(bareName) ?? null;
}

/** interface name → `@type` tag, for return-type resolution. */
function buildIfaceToTypeMap(sourceFile: SourceFile): Map<string, string> {
  const ifaceToType = new Map<string, string>();
  for (const iface of sourceFile.getInterfaces()) {
    const comment = getRawJsDocComment(iface.getJsDocs());
    if (!comment) continue;
    const typeMatch = /@type\s+(\w+)/.exec(comment);
    if (typeMatch) ifaceToType.set(iface.getName(), typeMatch[1]);
  }
  return ifaceToType;
}

/**
 * Per-type method return types: Pathogen type name → method name → Pathogen
 * type of the value the method returns. Lets the engine resolve chains like
 * `grid.getPoint(0, 0).x` and `mesh.getPoint(0, 0).color` differently even
 * though both types declare `getPoint`.
 */
export function extractTypeMethodReturns(sourceFile: SourceFile): Record<string, Record<string, string>> {
  const ifaceToType = buildIfaceToTypeMap(sourceFile);
  const result: Record<string, Record<string, string>> = {};

  for (const iface of sourceFile.getInterfaces()) {
    const comment = getRawJsDocComment(iface.getJsDocs());
    if (!comment) continue;
    const typeMatch = /@type\s+(\w+)/.exec(comment);
    if (!typeMatch) continue;
    const typeName = typeMatch[1];

    const returns: Record<string, string> = {};
    for (const method of iface.getMethods()) {
      const returnText = method.getReturnTypeNode()?.getText();
      if (!returnText) continue;
      const pathogenType = returnTextToPathogenType(returnText, ifaceToType);
      if (pathogenType) returns[method.getName()] = pathogenType;
    }
    if (Object.keys(returns).length > 0) result[typeName] = returns;
  }

  return result;
}

/**
 * Pathogen-api interface names that resolve to a Pathogen type but carry no
 * `@type` tag (brand-only forward declarations at the top of pathogen-api.ts).
 * Scoped to property extraction so the other generated maps stay byte-stable.
 */
const PROPERTY_TYPE_ALIASES: ReadonlyMap<string, string> = new Map([['ColorValue', 'ColorInstance']]);

/**
 * Per-type data-property types: Pathogen type name → property name → Pathogen
 * type of the property's value. Lets the engine resolve destructured bindings
 * like `let { origin } = grid;` (origin: Point) and `let { color } = meshPoint;`
 * (color: ColorInstance). Properties with no member surface (numbers, unions,
 * inline object literals) emit no entry.
 */
export function extractTypePropertyReturns(sourceFile: SourceFile): Record<string, Record<string, string>> {
  const ifaceToType = new Map([...buildIfaceToTypeMap(sourceFile), ...PROPERTY_TYPE_ALIASES]);
  const result: Record<string, Record<string, string>> = {};

  for (const iface of sourceFile.getInterfaces()) {
    const comment = getRawJsDocComment(iface.getJsDocs());
    if (!comment) continue;
    const typeMatch = /@type\s+(\w+)/.exec(comment);
    if (!typeMatch) continue;

    const props: Record<string, string> = {};
    for (const prop of iface.getProperties()) {
      const typeText = prop.getTypeNode()?.getText();
      if (!typeText) continue;
      // Primitive-typed properties carry no member surface but still power
      // hover display for destructured bindings (let { x } = point → number).
      const pathogenType =
        returnTextToPathogenType(typeText, ifaceToType) ??
        (typeText === 'number' || typeText === 'boolean' ? typeText : null);
      if (pathogenType) props[prop.getName()] = pathogenType;
    }
    if (Object.keys(props).length > 0) result[typeMatch[1]] = props;
  }

  return result;
}

/**
 * Resolve the element type of an array-typed declaration text: `PathogenArray<X>`
 * and `X[]` map X through the `@type` map (plus aliases). Returns null for bare
 * `PathogenArray`, non-array types, and element types with no member surface.
 */
export function elementTypeFromText(typeText: string, ifaceToType: Map<string, string>): string | null {
  const t = typeText.trim();
  const genericMatch = /^PathogenArray<\s*([\w$]+)\s*>$/.exec(t);
  const suffixMatch = /^([\w$]+)\[\]$/.exec(t);
  const inner = genericMatch?.[1] ?? suffixMatch?.[1];
  if (!inner) return null;
  return ifaceToType.get(inner) ?? null;
}

/**
 * Per-type member element types: Pathogen type name → member (property or
 * method) name → element type of the array it holds/returns. Parallel to
 * TYPE_METHOD_RETURNS / TYPE_PROPERTY_TYPES (whose values stay bare 'array' —
 * 'array' is itself a TYPE_MEMBERS key that engine code string-compares
 * against). Lets inference recover `glyph.contours` → array of PathBlock.
 */
export function extractTypeElementTypes(sourceFile: SourceFile): Record<string, Record<string, string>> {
  const ifaceToType = new Map([...buildIfaceToTypeMap(sourceFile), ...PROPERTY_TYPE_ALIASES]);
  const result: Record<string, Record<string, string>> = {};

  for (const iface of sourceFile.getInterfaces()) {
    const comment = getRawJsDocComment(iface.getJsDocs());
    if (!comment) continue;
    const typeMatch = /@type\s+(\w+)/.exec(comment);
    if (!typeMatch) continue;

    const members: Record<string, string> = {};
    for (const prop of iface.getProperties()) {
      const typeText = prop.getTypeNode()?.getText();
      const elementType = typeText ? elementTypeFromText(typeText, ifaceToType) : null;
      if (elementType) members[prop.getName()] = elementType;
    }
    for (const method of iface.getMethods()) {
      const returnText = method.getReturnTypeNode()?.getText();
      const elementType = returnText ? elementTypeFromText(returnText, ifaceToType) : null;
      if (elementType) members[method.getName()] = elementType;
    }
    if (Object.keys(members).length > 0) result[typeMatch[1]] = members;
  }

  return result;
}

/**
 * Namespace function return types (PathBlock.fromGlyph, Color.mix, ...):
 * namespace name → function name → { type, elementType? }. Namespace functions
 * previously emitted no return-type data at all; this powers inference for
 * `let glyphs = PathBlock.fromGlyph(...)` including the array element type.
 */
export function extractNamespaceMethodReturns(
  sourceFile: SourceFile,
): Record<string, Record<string, NamespaceMethodReturn>> {
  const ifaceToType = new Map([...buildIfaceToTypeMap(sourceFile), ...PROPERTY_TYPE_ALIASES]);
  const result: Record<string, Record<string, NamespaceMethodReturn>> = {};

  for (const ns of sourceFile.getModules()) {
    const returns: Record<string, NamespaceMethodReturn> = {};
    for (const fn of ns.getFunctions()) {
      const fnName = fn.getName();
      if (!fnName) continue;
      const returnText = fn.getReturnTypeNode()?.getText();
      if (!returnText) continue;
      const type = returnTextToPathogenType(returnText, ifaceToType);
      if (!type) continue;
      const label = fnName.endsWith('_') ? fnName.slice(0, -1) : fnName;
      const elementType = elementTypeFromText(returnText, ifaceToType);
      returns[label] = { type, ...(elementType ? { elementType } : {}) };
    }
    if (Object.keys(returns).length > 0) result[ns.getName()] = returns;
  }

  return result;
}

/**
 * Method trailing-block param types: Pathogen type name → method name → the
 * Pathogen types of the `{|a, b| ...}` block params, in order, from the
 * method's `@blockparams` JSDoc tag. Powers block-param inference for
 * `spine.variableOffset() {|go, pb| ...}` (go: VariableOffsetBuilder, pb: PathBlock).
 */
export function extractMethodBlockParams(
  sourceFile: SourceFile,
  warnings?: ExtractionWarning[],
): Record<string, Record<string, string[]>> {
  const result: Record<string, Record<string, string[]>> = {};

  for (const iface of sourceFile.getInterfaces()) {
    const comment = getRawJsDocComment(iface.getJsDocs());
    if (!comment) continue;
    const typeMatch = /@type\s+(\w+)/.exec(comment);
    if (!typeMatch) continue;
    const typeName = typeMatch[1];

    const perMethod: Record<string, string[]> = {};
    for (const method of iface.getMethods()) {
      const methodComment = getRawJsDocComment(method.getJsDocs());
      if (!methodComment) continue;
      const parsed = parseJsDoc(methodComment);
      if (parsed.snippet?.includes('@blockparams') && warnings) {
        warnings.push({
          member: `${typeName}.${method.getName()}`,
          message:
            '@blockparams appears after @snippet — the snippet capture runs to end of line, so the tag must precede @snippet',
        });
      }
      if (parsed.blockParams) perMethod[method.getName()] = parsed.blockParams;
    }
    if (Object.keys(perMethod).length > 0) result[typeName] = perMethod;
  }

  return result;
}

/** Escape a string for emission inside single quotes in the generated file. */
export function escapeString(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\t/g, '\\t')
    .replace(/\r/g, '\\r');
}
