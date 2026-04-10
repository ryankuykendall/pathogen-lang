import { analyzeScopes } from './scope-analysis';
import {
  KEYWORD_COMPLETIONS,
  STYLE_PROPERTY_COMPLETIONS,
} from './completion-data-static';
import {
  ENUM_COMPLETIONS,
  ENUM_MEMBER_MAP,
  STDLIB_COMPLETIONS,
  TYPE_MEMBERS,
  NAMESPACE_MEMBERS,
} from './completion-data.generated';

import type { TextDocument } from './document';
import type { Position } from './types';
import type { CompletionEntry, MemberCompletionSet } from './completion-data-static';

export interface CompletionItem {
  label: string;
  kind: 'function' | 'variable' | 'keyword' | 'property' | 'constant' | 'snippet';
  detail: string;
  sortText: string;
  insertText?: string;
  isSnippet?: boolean;
}

/**
 * Get completion items at a position in a document.
 */
export function getCompletions(document: TextDocument, position: Position): CompletionItem[] {
  const source = document.getText();
  const offset = document.offsetAt(position);
  const textBefore = source.slice(0, offset);

  // Check if we're inside a style block ${ ... }
  if (isInsideStyleBlock(textBefore)) {
    return STYLE_PROPERTY_COMPLETIONS.map(toCompletionItem);
  }

  // Check for method call on expression: expr.method(...).
  // e.g., shape.boundingBox(). or Color('#f00').lighten(0.2).
  const chainMatch = textBefore.match(/\.(\w+)\(\s*[^)]*\)\s*\.(\w*)$/);
  if (chainMatch) {
    const methodName = chainMatch[1];
    const memberPrefix = chainMatch[2];
    const returnType = getMethodReturnType(methodName);
    if (returnType && returnType in TYPE_MEMBERS) {
      return filterByPrefix(
        [...TYPE_MEMBERS[returnType].properties, ...TYPE_MEMBERS[returnType].methods].map(toCompletionItem),
        memberPrefix,
      );
    }
  }

  // Check for member access (dot completions)
  const dotMatch = textBefore.match(/(\w+)\.(\w*)$/);
  if (dotMatch) {
    const objectName = dotMatch[1];
    const memberPrefix = dotMatch[2];
    const members = getMembersForObject(objectName, source);
    if (members) {
      return filterByPrefix(
        [...members.properties, ...members.methods].map(toCompletionItem),
        memberPrefix,
      );
    }
  }

  // Check for deep property access (e.g., ctx.position.x, layer.ctx.position)
  const deepMatch = textBefore.match(/(\w+)\.(\w+)\.(\w*)$/);
  if (deepMatch) {
    const [, obj, prop1, prefix] = deepMatch;
    const deepMembers = getDeepMembers(obj, prop1, source);
    if (deepMembers) {
      return filterByPrefix(
        [...deepMembers.properties, ...deepMembers.methods].map(toCompletionItem),
        prefix,
      );
    }
  }

  // Get the word prefix at cursor
  const prefixMatch = textBefore.match(/[a-zA-Z_]\w*$/);
  const prefix = prefixMatch ? prefixMatch[0] : '';

  // Collect all completions
  const items: CompletionItem[] = [];

  // Keywords, stdlib, and enums
  items.push(...KEYWORD_COMPLETIONS.map(toCompletionItem));
  items.push(...STDLIB_COMPLETIONS.map(toCompletionItem));
  items.push(...ENUM_COMPLETIONS.map(toCompletionItem));

  // Scope-aware user definitions
  const scopeInfo = analyzeScopes(document);
  const seen = new Set<string>();

  for (const decl of scopeInfo.declarations) {
    if (seen.has(decl.name)) continue;
    seen.add(decl.name);

    // Check if declaration is visible at the cursor position
    // (simple heuristic: declaration line is before cursor line)
    if (decl.range.start.line <= position.line) {
      items.push({
        label: decl.name,
        kind: decl.kind === 'function' ? 'function' : 'variable',
        detail: decl.kind === 'function' ? `fn ${decl.name}(...)` : `${decl.kind}: ${decl.name}`,
        sortText: sortKey(20, decl.name), // User definitions rank high
      });
    }
  }

  return filterByPrefix(items, prefix);
}

// --- Helpers ---

function isInsideStyleBlock(textBefore: string): boolean {
  // Find the last ${ and check if there's a matching } after it
  let depth = 0;
  for (let i = textBefore.length - 1; i >= 0; i--) {
    if (textBefore[i] === '}') depth++;
    if (textBefore[i] === '{' && i > 0 && textBefore[i - 1] === '$') {
      if (depth === 0) return true;
      depth--;
    }
  }
  return false;
}

function getMembersForObject(name: string, source: string): MemberCompletionSet | null {
  // Namespaces (Color, Object)
  if (name in NAMESPACE_MEMBERS) return NAMESPACE_MEMBERS[name];

  // Enum member access (GridPatternType.Shape, Easing.Linear, etc.)
  if (name in ENUM_MEMBER_MAP) {
    return { properties: ENUM_MEMBER_MAP[name], methods: [] };
  }

  // Special names with known types
  if (name === 'ctx' && 'PathContext' in TYPE_MEMBERS) return TYPE_MEMBERS['PathContext'];

  // Try to infer type from source
  const type = inferType(name, source);
  if (type && type in TYPE_MEMBERS) return TYPE_MEMBERS[type];

  return null;
}

function getDeepMembers(obj: string, prop: string, source?: string): MemberCompletionSet | null {
  // ctx.position.x, ctx.start.y
  if (obj === 'ctx' && (prop === 'position' || prop === 'start')) {
    return TYPE_MEMBERS['Point'] ?? null;
  }
  // ctx.transform has its own members
  if (obj === 'ctx' && prop === 'transform') {
    return {
      properties: [
        { label: 'translate', kind: 'property', detail: 'Translation state {x, y}', boost: 10 },
        { label: 'rotate', kind: 'property', detail: 'Rotation state {angle, cx, cy}', boost: 10 },
        { label: 'scale', kind: 'property', detail: 'Scale state {x, y}', boost: 10 },
      ],
      methods: [
        { label: 'reset', kind: 'function', detail: 'reset() — Reset all transforms', boost: 8 },
        { label: 'set', kind: 'function', detail: 'set(property, value) — Set transform value', boost: 8 },
      ],
    };
  }

  // layer.ctx.position, layer.ctx.start — infer layer type, then check prop
  if (source && prop === 'ctx') {
    const type = inferType(obj, source);
    if (type === 'PathLayer' || type === 'GroupLayer') {
      return TYPE_MEMBERS['PathContext'] ?? null;
    }
  }

  return null;
}

/**
 * Map method names to their return types.
 * Used for chained completions like shape.boundingBox().width
 */
function getMethodReturnType(method: string): string | null {
  const METHOD_RETURN_TYPES: Record<string, string> = {
    // PathBlock methods returning PathBlock
    offset: 'PathBlock', reverse: 'PathBlock', mirror: 'PathBlock',
    subPath: 'PathBlock', chamfer: 'PathBlock', chamferAtVertex: 'PathBlock',
    fillet: 'PathBlock', filletAtVertex: 'PathBlock',
    ellipticalFillet: 'PathBlock', ellipticalFilletAtVertex: 'PathBlock',
    union: 'PathBlock', difference: 'PathBlock', intersection: 'PathBlock', xor: 'PathBlock',
    scale: 'PathBlock', rotateAtVertexIndex: 'PathBlock',
    toPathBlock: 'PathBlock',

    // PathBlock methods returning BoundingBox
    boundingBox: 'BoundingBox', paddedBoundingBox: 'BoundingBox',

    // PathBlock methods returning Point
    get: 'Point', anchor: 'Point',

    // Color methods returning ColorInstance
    lighten: 'ColorInstance', darken: 'ColorInstance',
    saturate: 'ColorInstance', desaturate: 'ColorInstance',
    alpha: 'ColorInstance', hueShift: 'ColorInstance',
    complement: 'ColorInstance', mix: 'ColorInstance',

    // Point methods returning Point
    translate: 'Point', polarTranslate: 'Point',
    midpoint: 'Point', lerp: 'Point', rotate: 'Point',

    // PolarVector methods returning PolarVector
    turn: 'PolarVector',
    // Note: 'mirror' maps to PathBlock (defined above) — PolarVector.mirror() also exists
    // but PathBlock is more common, so we keep that mapping

    // Cycler
    pick: 'any',

    // Array methods
    slice: 'array', map: 'array', mapSlice: 'array',
  };

  return METHOD_RETURN_TYPES[method] ?? null;
}

/**
 * Lightweight type inference from source text.
 * Matches patterns like `let x = Point(...)`, `let x = @{...}`, `let x = [...]`, etc.
 */
function inferType(name: string, source: string): string | null {
  const esc = escapeRegex(name);

  // let name = Point(...)
  if (new RegExp(`let\\s+${esc}\\s*=\\s*Point\\s*\\(`).test(source)) return 'Point';

  // let name = PolarVector(...)
  if (new RegExp(`let\\s+${esc}\\s*=\\s*PolarVector\\s*\\(`).test(source)) return 'PolarVector';

  // let name = Cycler(...)
  if (new RegExp(`let\\s+${esc}\\s*=\\s*Cycler\\s*\\(`).test(source)) return 'Cycler';

  // let name = PathLayer(...) or define PathLayer(...)
  if (new RegExp(`(?:let\\s+${esc}\\s*=|define)\\s*PathLayer\\s*\\(`).test(source)) return 'PathLayer';

  // let name = TextLayer(...)
  if (new RegExp(`(?:let\\s+${esc}\\s*=|define)\\s*TextLayer\\s*\\(`).test(source)) return 'TextLayer';

  // let name = GroupLayer(...)
  if (new RegExp(`(?:let\\s+${esc}\\s*=|define)\\s*GroupLayer\\s*\\(`).test(source)) return 'GroupLayer';

  // let name = layer('...')  — returns a layer reference (same as PathLayer)
  if (new RegExp(`let\\s+${esc}\\s*=\\s*layer\\s*\\(`).test(source)) return 'PathLayer';

  // let name = Color(...) or let name = #hex or let name = rgb(...) or let name = oklch(...)
  if (new RegExp(`let\\s+${esc}\\s*=\\s*(?:Color\\s*\\(|#[0-9a-fA-F]|rgb\\(|hsl\\(|oklch\\(|hwb\\(|lab\\(|lch\\(|oklab\\()`).test(source)) return 'ColorInstance';

  // let name = @{ ... }
  if (new RegExp(`let\\s+${esc}\\s*=\\s*@\\s*\\{`).test(source)) return 'PathBlock';

  // let name = &{ ... }
  if (new RegExp(`let\\s+${esc}\\s*=\\s*&\\s*\\{`).test(source)) return 'ProjectedText';

  // let name = CSSVar(...)
  if (new RegExp(`let\\s+${esc}\\s*=\\s*CSSVar\\s*\\(`).test(source)) return 'CSSVar';

  // let name = [...]  or method returning array
  if (new RegExp(`let\\s+${esc}\\s*=\\s*\\[`).test(source)) return 'array';

  // let name = "..." or let name = '...' or let name = `...`
  if (new RegExp(`let\\s+${esc}\\s*=\\s*["'\`]`).test(source)) return 'string';

  // let name = something.boundingBox() — infer from method return type
  const methodAssignMatch = new RegExp(`let\\s+${esc}\\s*=\\s*\\w+\\.([a-zA-Z]+)\\s*\\(`).exec(source);
  if (methodAssignMatch) {
    const returnType = getMethodReturnType(methodAssignMatch[1]);
    if (returnType && returnType !== 'any') return returnType;
  }

  // Stdlib path functions return PathBlock-like path segments
  if (new RegExp(`let\\s+${esc}\\s*=\\s*(?:circle|rect|roundRect|polygon|star|line|arc|quadratic|cubic|cubicSpline|quadSpline)\\s*\\(`).test(source)) {
    return 'PathBlock';
  }

  return null;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function toCompletionItem(entry: CompletionEntry): CompletionItem {
  return {
    label: entry.label,
    kind: entry.kind,
    detail: entry.detail,
    sortText: sortKey(entry.boost, entry.label),
    insertText: entry.insertText,
    isSnippet: entry.isSnippet,
  };
}

function sortKey(boost: number, label: string): string {
  // Lower sortText = higher priority. Pad boost inverted to 2 digits.
  return String(99 - boost).padStart(2, '0') + label;
}

function filterByPrefix(items: CompletionItem[], prefix: string): CompletionItem[] {
  if (!prefix) return items;
  const lower = prefix.toLowerCase();
  return items.filter((item) => item.label.toLowerCase().startsWith(lower));
}
