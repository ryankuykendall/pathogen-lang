/**
 * Names from other files, for the editor features (docs/modules.md "In each
 * tool": hover, go-to-definition, completion and parameter hints work across
 * files).
 *
 * The files come in as data: the ModuleGraph that resolveModules builds with
 * the edited document as its entry. So the language services stay free of
 * Node and of reading files, the language server and the preview decide how
 * files are read (open buffers first), and the playground, which has no
 * files, calls the same functions without a graph.
 *
 * A file's exports are read the tree-first way: scope analysis of its source,
 * whose top-level declarations carry `exported`.
 */
import { StringTextDocument } from './document';
import { analyzeScopes, declarationName } from './scope-analysis';
import { findDeclaration } from './type-inference-ast';
import { projectDirname, resolveProjectPath } from '../host/paths';
import { lezerParser } from '../parser';

import type { SyntaxNode, Tree } from '@lezer/common';

import type { Declaration, ScopeInfo } from './scope-analysis';
import type { Position, Range } from './types';
import type { ModuleFile, ModuleGraph } from '../host/load-modules';

/** What the editor features may know beyond the document itself. */
export interface LanguageServiceOptions {
  /**
   * The files the document imports, directly or not: resolveModules with the
   * document as its entry. Without it, an imported name is only a name.
   */
  modules?: ModuleGraph;
  /**
   * The project's importable files (modules), by project path, for
   * completing an import's path. Needs `modules` too, for the document's own
   * path.
   */
  projectFiles?: readonly string[];
}

/** An imported file, analyzed once per ModuleFile (the server keeps a graph per document). */
export interface AnalyzedFile {
  file: ModuleFile;
  document: StringTextDocument;
  info: ScopeInfo;
}

const analyzed = new WeakMap<ModuleFile, AnalyzedFile>();

export function analyzeFile(file: ModuleFile): AnalyzedFile {
  let entry = analyzed.get(file);
  if (!entry) {
    const document = new StringTextDocument(file.source);
    entry = { file, document, info: analyzeScopes(document) };
    analyzed.set(file, entry);
  }
  return entry;
}

/**
 * The document's syntax tree: the one scope analysis kept, else a fresh
 * parse. Scope analysis keeps none when the AST builder rejects the file,
 * and a default import (`import gears from …`) is one such error.
 */
export function syntaxTreeOf(info: ScopeInfo, source: string): Tree {
  return info.tree ?? lezerParser.parse(source);
}

/** The file an import's path names, resolved from the file the import is written in. */
export function importedFile(graph: ModuleGraph, fromFile: string, written: string): ModuleFile | undefined {
  const resolved = resolveProjectPath(written, fromFile);
  return resolved.ok ? graph.files.get(resolved.path) : undefined;
}

/** A file's exports by name: its top-level declarations marked `export`. */
export function exportsOf(file: ModuleFile): Map<string, Declaration> {
  const out = new Map<string, Declaration>();
  for (const decl of analyzeFile(file).info.root.declarations.values()) {
    if (decl.exported) out.set(decl.name, decl);
  }
  return out;
}

/** What an imported name stands for. */
export type ImportTarget =
  /** An export: `decl` is its declaration in `file`, which `analyzed` describes. */
  | { kind: 'export'; file: ModuleFile; decl: Declaration; analyzed: AnalyzedFile }
  /** `* as gears`: the whole file. */
  | { kind: 'namespace'; file: ModuleFile }
  /** A name the file doesn't export (the compile says so too). */
  | { kind: 'missing'; file: ModuleFile; name: string };

/** How many files a name may be passed on through before the search stops. */
const MAX_PASSES = 16;

/**
 * What an import declaration in `fromFile` stands for: the export it names,
 * or the file for `* as`. Null when it isn't an import, or its file isn't in
 * the graph (it couldn't be read; the diagnostics say why).
 */
export function resolveImport(graph: ModuleGraph, fromFile: string, decl: Declaration): ImportTarget | null {
  if (decl.kind !== 'import' || !decl.importFrom) return null;
  const file = importedFile(graph, fromFile, decl.importFrom.path);
  if (!file) return null;
  if (decl.importFrom.name === undefined) return { kind: 'namespace', file };
  return resolveExport(graph, file, decl.importFrom.name);
}

/**
 * The export `name` of `file`. A file that passes on a name from another
 * file (`export const gear = gears.gear;`, docs/modules.md "Exporting") is
 * followed to where the name is defined, as the run time would find it.
 */
export function resolveExport(graph: ModuleGraph, file: ModuleFile, name: string, passes = 0): ImportTarget {
  const decl = exportsOf(file).get(name);
  if (!decl) return { kind: 'missing', file, name };
  const passedOn = passes < MAX_PASSES ? followPassedOn(graph, file, decl, passes) : null;
  return passedOn ?? { kind: 'export', file, decl, analyzed: analyzeFile(file) };
}

/** `export const gear = gears.gear;` or `export const gear = cog;`, `cog` imported: the export it passes on. */
function followPassedOn(graph: ModuleGraph, file: ModuleFile, decl: Declaration, passes: number): ImportTarget | null {
  if (decl.kind !== 'variable' || decl.typeContext?.kind !== 'init') return null;
  const expr = decl.typeContext.expr;
  const top = analyzeFile(file).info.root.declarations;
  let source: Declaration | undefined;
  let name: string | undefined;
  if (expr.type === 'Identifier') {
    source = top.get(expr.name);
    name = source?.importFrom?.name;
  } else if (expr.type === 'MemberExpression' && expr.object.type === 'Identifier') {
    source = top.get(expr.object.name);
    // Only a namespace's member: `kit.gear` where kit is `* as kit`.
    name = source?.importFrom && source.importFrom.name === undefined ? expr.property : undefined;
  }
  if (source?.kind !== 'import' || !source.importFrom || name === undefined) return null;
  const next = importedFile(graph, file.path, source.importFrom.path);
  if (!next) return null;
  const target = resolveExport(graph, next, name, passes + 1);
  return target.kind === 'export' ? target : null;
}

/** Where an export's name is written in its own file. */
export function exportNameRange(target: Extract<ImportTarget, { kind: 'export' }>): Range {
  const { info, document } = target.analyzed;
  return declarationName(info, target.decl, document)?.range ?? target.decl.range;
}

/**
 * The one-line signature the editors show for a fn or an enum, in this file
 * or another: `fn gear(center, radius, teeth)`, `enum Teeth { Few, Fine }`.
 */
export function declarationSignature(decl: Declaration): string | null {
  if (decl.kind === 'function' && decl.params) return `fn ${decl.name}(${decl.params.join(', ')})`;
  if (decl.kind === 'enum' && decl.members) {
    return decl.members.length > 0 ? `enum ${decl.name} { ${decl.members.join(', ')} }` : `enum ${decl.name} {}`;
  }
  return null;
}

/**
 * The namespace before `.word` at `offset`, when it is a `* as` import:
 * `gears` in `gears.gear`. A receiver that is itself a member (`a.gears`)
 * isn't one.
 */
export function namespaceReceiverAt(
  info: ScopeInfo,
  source: string,
  offset: number,
  position: Position,
): { decl: Declaration; path: string } | null {
  if (offset === 0 || source[offset - 1] !== '.') return null;
  let start = offset - 1;
  while (start > 0 && /[A-Za-z0-9_]/.test(source[start - 1])) start--;
  const name = source.slice(start, offset - 1);
  if (!/^[A-Za-z_]/.test(name) || (start > 0 && source[start - 1] === '.')) return null;
  const decl = findDeclaration(info, name, position);
  if (decl?.kind !== 'import' || !decl.importFrom || decl.importFrom.name !== undefined) return null;
  return { decl, path: decl.importFrom.path };
}

/** What the cursor is on inside an import: its path, or a name it imports (before any `as`). */
export interface ImportSite {
  /** The path as written between the quotes. */
  path: string;
  /** The exported name under the cursor; none when the cursor is on the path. */
  name?: string;
}

/**
 * The import part at `offset`: the path string, or the exported name in
 * `{ gear }` / `{ Teeth as Kind }`. An alias after `as` is a declaration like
 * any other, so scope analysis answers for it; this is for what it can't see.
 * The cursor may be just after the part (the end of a word, past the closing
 * quote), so the token before it counts too.
 */
export function importSiteAt(tree: Tree, source: string, offset: number): ImportSite | null {
  return importSiteOf(tree.resolveInner(offset, 1), source) ?? importSiteOf(tree.resolveInner(offset, -1), source);
}

function importSiteOf(node: SyntaxNode, source: string): ImportSite | null {
  const declaration = importDeclarationOf(node);
  if (!declaration) return null;
  const pathNode = declaration.getChild('String');
  if (!pathNode) return null;
  const path = source.slice(pathNode.from + 1, pathNode.to - 1);
  if (node.name === 'String' && node.from === pathNode.from) return { path };
  if (node.name === 'Identifier' && node.parent?.name === 'ImportSpecifier') {
    return { path, name: source.slice(node.from, node.to) };
  }
  return null;
}

/** Where completion is inside an import (docs/modules.md "In each tool"). */
export type ImportCompletionContext =
  /** Inside `{ }`: the import's path if written yet, the names already listed, and the word typed. */
  | { kind: 'names'; path?: string; listed: Set<string>; prefix: string }
  /** After `as`: a new name, so there's nothing to offer. */
  | { kind: 'alias' }
  /** Inside the path's quotes: what is typed so far, which starts at offset `from`. */
  | { kind: 'path'; typed: string; from: number };

/** The completion context at `offset` when it is inside an import, else null. */
export function importCompletionContextAt(tree: Tree, source: string, offset: number): ImportCompletionContext | null {
  const node = tree.resolveInner(offset, -1);
  let specifier: SyntaxNode | null = null;
  for (let at: SyntaxNode | null = node; at; at = at.parent) {
    if (at.name === 'String' && at.parent?.name === 'ImportDeclaration') {
      // Strings in the tree are closed: inside means before the closing quote.
      return offset > at.from && offset < at.to
        ? { kind: 'path', typed: source.slice(at.from + 1, offset), from: at.from + 1 }
        : null;
    }
    if (at.name === 'ImportSpecifier') specifier = at;
    if (at.name === 'ImportSpecifiers') return namesContext(at, specifier, source, offset);
    // `import * as |`: a new name.
    if (at.name === 'NamespaceImport') return /\bas\b/.test(source.slice(at.from, offset)) ? { kind: 'alias' } : null;
    if (at.name === 'ImportDeclaration' || at.name === 'Program') break;
  }
  // A path whose closing quote isn't typed yet doesn't parse as a string (the
  // tree breaks the import apart), so it's read from the line.
  const lineStart = source.lastIndexOf('\n', offset - 1) + 1;
  const open = /^\s*import\b[^"\n]*\bfrom\s*"([^"\n]*)$/.exec(source.slice(lineStart, offset));
  return open ? { kind: 'path', typed: open[1], from: offset - open[1].length } : null;
}

function namesContext(
  specifiers: SyntaxNode,
  specifier: SyntaxNode | null,
  source: string,
  offset: number,
): ImportCompletionContext | null {
  const close = specifiers.lastChild?.name === '}' ? specifiers.lastChild : null;
  if (offset <= specifiers.from || (close && offset > close.from)) return null;
  if (specifier && /\bas\b/.test(source.slice(specifier.from, offset))) return { kind: 'alias' };
  const listed = new Set<string>();
  for (let child = specifiers.firstChild; child; child = child.nextSibling) {
    const id = child.name === 'ImportSpecifier' ? child.getChild('Identifier') : null;
    // The name being typed isn't listed yet.
    if (id && !(id.from <= offset && offset <= id.to)) listed.add(source.slice(id.from, id.to));
  }
  const pathNode = specifiers.parent?.getChild('String');
  return {
    kind: 'names',
    ...(pathNode ? { path: source.slice(pathNode.from + 1, pathNode.to - 1) } : {}),
    listed,
    prefix: /[A-Za-z0-9_]*$/.exec(source.slice(specifiers.from + 1, offset))?.[0] ?? '',
  };
}

/**
 * How an import in `fromFile` writes the path to `toPath`: `./` for a file
 * in its folder or below, `../` to climb out (docs/projects.md "Writing paths").
 */
export function relativeImportPath(fromFile: string, toPath: string): string {
  const fromDir = projectDirname(fromFile).split('/').filter(Boolean);
  const to = toPath.split('/').filter(Boolean);
  let shared = 0;
  while (shared < fromDir.length && shared < to.length - 1 && fromDir[shared] === to[shared]) shared++;
  const up = fromDir.length - shared;
  const rest = to.slice(shared).join('/');
  return up === 0 ? `./${rest}` : `${'../'.repeat(up)}${rest}`;
}

function importDeclarationOf(node: SyntaxNode): SyntaxNode | null {
  for (let at: SyntaxNode | null = node; at; at = at.parent) {
    if (at.name === 'ImportDeclaration') return at;
    if (at.name === 'Program') return null;
  }
  return null;
}
