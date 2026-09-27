import { METHOD_SIGNATURE_DATA, SIGNATURE_DATA } from './completion-data.generated';
import { regexNameResolver, resolveMemberAccess } from './member-resolution';
import { analyzeScopes } from './scope-analysis';
import { findDeclaration, inferDeclType, inferExprElementType } from './type-inference-ast';

import type { TextDocument } from './document';
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
 */
export function getSignatureHelp(document: TextDocument, position: Position): SignatureHelp | null {
  const source = document.getText();
  const offset = document.offsetAt(position);

  // Walk backward to find the function call context
  const callInfo = findCallContext(source, offset);
  if (!callInfo) return null;

  // A call with a receiver — `pb.rotate(|)` — is a METHOD, and method names
  // collide across receivers (`rotate` on PathBlock takes an angle; on Point it
  // takes an angle and an origin). So resolve the receiver's type first and look
  // the signature up under it, through the same path member completion and
  // hover use. Falling back to the flat stdlib table here would be wrong, not
  // merely unhelpful: `xs.map(|)` would show the stdlib `map(value, inMin, …)`.
  let sig: { label: string; params: string[]; doc: string } | undefined;
  const isMethodCall = callInfo.nameStart > 0 && source[callInfo.nameStart - 1] === '.';

  if (isMethodCall) {
    const typeName = resolveReceiverType(document, source, callInfo.nameEnd, position);
    sig = typeName ? METHOD_SIGNATURE_DATA[typeName]?.[callInfo.functionName] : undefined;
    // An unresolved receiver yields nothing rather than a wrong signature.
    if (!sig) return null;
  } else {
    sig = SIGNATURE_DATA[callInfo.functionName];
  }

  // If not in stdlib, check user-defined functions via scope analysis
  if (!sig) {
    const scopeInfo = analyzeScopes(document);
    for (const decl of scopeInfo.declarations) {
      if (decl.name === callInfo.functionName && decl.kind === 'function') {
        // We don't have param names from scope analysis alone,
        // but we can check the AST. For now, provide the function name.
        sig = { label: `${decl.name}(...)`, params: [], doc: `User function: ${decl.name}` };
        break;
      }
    }
  }

  if (!sig) return null;

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
    activeParameter: Math.max(0, Math.min(callInfo.argIndex, sig.params.length - 1)),
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
