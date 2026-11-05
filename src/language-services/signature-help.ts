import { METHOD_SIGNATURE_DATA, SIGNATURE_DATA } from './completion-data.generated';
import { regexNameResolver, resolveMemberAccess } from './member-resolution';
import { importedFile, namespaceReceiverAt, resolveExport, resolveImport } from './module-exports';
import { analyzeScopes } from './scope-analysis';
import { findDeclaration, inferDeclType, inferExprElementType } from './type-inference-ast';
import { fileLabel } from '../module-messages';

import type { TextDocument } from './document';
import type { ImportTarget, LanguageServiceOptions } from './module-exports';
import type { Declaration, Reference, ScopeInfo } from './scope-analysis';
import type { Position } from './types';

export interface SignatureHelp {
  signatures: SignatureInformation[];
  activeSignature: number;
  activeParameter: number;
}

export interface SignatureInformation {
  label: string;
  parameters: ParameterInformation[];
  documentation?: string;
}

export interface ParameterInformation {
  label: string;
}

/**
 * Get signature help at a position in a document.
 * Returns null if the cursor is not inside function call parentheses.
 * With `options.modules`, a fn from another file shows the parameters it is
 * defined with (docs/modules.md "In each tool").
 */
export function getSignatureHelp(
  document: TextDocument,
  position: Position,
  options: LanguageServiceOptions = {},
): SignatureHelp | null {
  const source = document.getText();
  const offset = document.offsetAt(position);

  // Walk backward to find the function call context
  const callInfo = findCallContext(source, offset);
  if (!callInfo) return null;

  let cachedScopeInfo: ScopeInfo | null = null;
  const getScopeInfo = (): ScopeInfo => {
    cachedScopeInfo ??= analyzeScopes(document);
    return cachedScopeInfo;
  };
  const graph = options.modules;

  // A call with a receiver — `pb.rotate(|)` — is a METHOD, and method names
  // collide across receivers (`rotate` on PathBlock takes an angle; on Point it
  // takes an angle and an origin). So resolve the receiver's type first and look
  // the signature up under it, through the same path member completion and
  // hover use. Falling back to the flat stdlib table here would be wrong, not
  // merely unhelpful: `xs.map(|)` would show the stdlib `map(value, inMin, …)`.
  let sig: { label: string; params: string[]; doc: string } | undefined;
  const isMethodCall = callInfo.nameStart > 0 && source[callInfo.nameStart - 1] === '.';

  if (isMethodCall) {
    // `gears.gear(`: a namespace's fn, from its own file.
    const receiver = graph ? namespaceReceiverAt(getScopeInfo(), source, callInfo.nameStart, position) : null;
    if (graph && receiver) {
      const file = importedFile(graph, graph.entry, receiver.path);
      const target = file ? resolveExport(graph, file, callInfo.functionName) : null;
      sig = target ? fnSignature(callInfo.functionName, target) : undefined;
      return sig ? signatureHelp(sig, callInfo.argIndex) : null;
    }
    const typeName = resolveReceiverType(document, source, callInfo.nameEnd, position);
    sig = typeName ? METHOD_SIGNATURE_DATA[typeName]?.[callInfo.functionName] : undefined;
    // An unresolved receiver yields nothing rather than a wrong signature.
    if (!sig) return null;
  } else {
    sig = SIGNATURE_DATA[callInfo.functionName];
  }

  // If not in stdlib: the fn the call sees, written in this file or imported.
  if (!sig) {
    const decl = declarationForCall(getScopeInfo(), callInfo.functionName, document.positionAt(callInfo.nameStart));
    if (decl?.kind === 'function') sig = fnSignature(callInfo.functionName, { decl });
    else if (decl?.kind === 'import' && graph) {
      const target = resolveImport(graph, graph.entry, decl);
      sig = target ? fnSignature(callInfo.functionName, target) : undefined;
    }
  }

  if (!sig) return null;
  return signatureHelp(sig, callInfo.argIndex);
}

/**
 * The declaration a call's name resolves to. Scope analysis already resolved
 * the call as a reference, through the scopes it is written in, so a sibling
 * fn's inner fn of the same name can't win. The reference sits on the call's
 * line at or before its name. Without one (a call still being typed may not
 * parse into one), the nearest declaration of the name in the file.
 */
function declarationForCall(info: ScopeInfo, name: string, at: Position): Declaration | null {
  let best: Reference | null = null;
  for (const ref of info.references) {
    if (ref.name !== name || !ref.declaration) continue;
    if (ref.range.start.line !== at.line || ref.range.start.character > at.character) continue;
    if (!best || ref.range.start.character >= best.range.start.character) best = ref;
  }
  return best?.declaration ?? findDeclaration(info, name, at);
}

/**
 * A user fn's signature, under the name the call uses (an alias, a
 * namespace's member): its parameters and where it is defined, as hover
 * says it. Anything other than a fn has none.
 */
function fnSignature(
  calledName: string,
  target: ImportTarget | { decl: Declaration },
): { label: string; params: string[]; doc: string } | undefined {
  if ('kind' in target && target.kind !== 'export') return undefined;
  const { decl } = target;
  if (decl.kind !== 'function') return undefined;
  const params = decl.params ?? [];
  const line = decl.range.start.line + 1;
  const doc = 'file' in target ? `Defined in ${fileLabel(target.file.path)}, line ${line}` : `Defined at line ${line}`;
  return { label: `${calledName}(${params.join(', ')})`, params, doc };
}

function signatureHelp(sig: { label: string; params: string[]; doc: string }, argIndex: number): SignatureHelp {
  return {
    signatures: [
      {
        label: sig.label,
        parameters: sig.params.map((p) => ({ label: p })),
        documentation: sig.doc,
      },
    ],
    activeSignature: 0,
    // Clamped at 0: a zero-parameter signature (PI(), grid.map() — whose params
    // arrive in a trailing block) would otherwise report -1, which is not a
    // valid LSP parameter index.
    activeParameter: Math.max(0, Math.min(argIndex, sig.params.length - 1)),
  };
}

/**
 * The Pathogen type of the receiver in `receiver.method(`, or null.
 *
 * AST-first, with the regex resolver as the fallback — the same pair hover
 * passes to resolveMemberAccess, so a receiver that types for member
 * completion types here too.
 */
function resolveReceiverType(
  document: TextDocument,
  source: string,
  nameEnd: number,
  position: Position,
): string | null {
  let cachedScopeInfo: ReturnType<typeof analyzeScopes> | null = null;
  const getScopeInfo = () => {
    cachedScopeInfo ??= analyzeScopes(document);
    return cachedScopeInfo;
  };
  const resolveName = (name: string): string | null => {
    const decl = findDeclaration(getScopeInfo(), name, position);
    return (decl ? inferDeclType(decl) : null) ?? regexNameResolver(name, source);
  };
  const resolveElementType = (name: string): string | null => {
    const decl = findDeclaration(getScopeInfo(), name, position);
    return decl?.typeContext?.kind === 'init' ? inferExprElementType(decl.typeContext.expr, decl.scope) : null;
  };
  return resolveMemberAccess(source.slice(0, nameEnd), source, resolveName, resolveElementType)?.typeName ?? null;
}

// --- Call context detection ---

interface CallContext {
  functionName: string;
  argIndex: number; // 0-based index of the current argument
  nameStart: number; // offset of the first character of the name
  nameEnd: number; // offset just past the last character of the name
}

/**
 * Walk backward from the offset to find an enclosing function call.
 * Returns the function name and which argument the cursor is in.
 */
function findCallContext(source: string, offset: number): CallContext | null {
  let depth = 0;
  let argIndex = 0;
  let i = offset - 1;

  // Walk backward, tracking parentheses and commas
  while (i >= 0) {
    const ch = source[i];

    // Skip string literals
    if (ch === '"' || ch === "'" || ch === '`') {
      i--;
      while (i >= 0 && source[i] !== ch) {
        if (source[i] === '\\') i--; // skip escaped chars
        i--;
      }
      i--;
      continue;
    }

    if (ch === ')') {
      depth++;
    } else if (ch === '(') {
      if (depth === 0) {
        // Found our opening paren — now find the function name
        let nameStart = i - 1;
        // Skip whitespace between name and paren
        while (nameStart >= 0 && /\s/.test(source[nameStart])) nameStart--;
        // Walk back through the identifier
        const idEnd = nameStart + 1;
        while (nameStart >= 0 && /[a-zA-Z0-9_]/.test(source[nameStart])) nameStart--;
        nameStart++;

        if (nameStart < idEnd) {
          const functionName = source.slice(nameStart, idEnd);
          return { functionName, argIndex, nameStart, nameEnd: idEnd };
        }
        return null;
      }
      depth--;
    } else if (ch === ',' && depth === 0) {
      argIndex++;
    }

    i--;
  }

  return null;
}
