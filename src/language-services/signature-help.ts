import { analyzeScopes } from './scope-analysis';
import { STDLIB_COMPLETIONS } from './completion-data';

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

// --- Signature data ---

interface FunctionSignature {
  label: string;
  params: string[];
  doc: string;
}

const SIGNATURES = new Map<string, FunctionSignature>();

// Build from stdlib completion data (extract params from detail string)
for (const entry of STDLIB_COMPLETIONS) {
  if (entry.kind !== 'function') continue;
  const match = entry.detail.match(/^(\w+)\(([^)]*)\)/);
  if (match) {
    const name = match[1];
    const paramsStr = match[2].trim();
    const params = paramsStr ? paramsStr.split(/,\s*/) : [];
    SIGNATURES.set(name, { label: `${name}(${paramsStr})`, params, doc: entry.detail });
  }
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

  // Look up signature
  let sig = SIGNATURES.get(callInfo.functionName);

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
    signatures: [{
      label: sig.label,
      parameters: sig.params.map((p) => ({ label: p })),
      documentation: sig.doc,
    }],
    activeSignature: 0,
    activeParameter: Math.min(callInfo.argIndex, sig.params.length - 1),
  };
}

// --- Call context detection ---

interface CallContext {
  functionName: string;
  argIndex: number; // 0-based index of the current argument
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
          return { functionName, argIndex };
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
