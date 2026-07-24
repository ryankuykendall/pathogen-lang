/**
 * Shared member-access resolution — given the text before a cursor/word,
 * determine the receiver's type and the member set it exposes. Extracted from
 * completion.ts so hover renders member tooltips through exactly the same
 * receiver logic that powers member completions (branch order and
 * fall-through preserved). Two deliberate deviations from the original:
 * receiver names resolve through the injected resolver's full chain (the old
 * chainMatch skipped loop-var inference), and getMembersForObject checks
 * `in TYPE_MEMBERS` once on the resolver's first non-null result rather than
 * per regex rule.
 *
 * Receiver *names* are typed through an injectable resolver so consumers can
 * put the AST-based path (type-inference-ast.ts) first and fall back to the
 * regex rules; the default resolver is the legacy regex chain.
 */
import {
  CONSTRUCTOR_RETURN_TYPES,
  ENUM_MEMBER_MAP,
  NAMESPACE_MEMBERS,
  TYPE_MEMBERS,
  TYPE_METHOD_RETURNS,
} from './completion-data.generated';
import { escapeRegex, getMethodReturnType, inferBlockParamType, inferLoopVarType, inferType } from './type-inference';

import type { CompletionEntry, MemberCompletionSet } from './completion-data-static';

/** Resolve a bare name to a Pathogen type name (null when unknown). */
export type NameTypeResolver = (name: string) => string | null;

export interface MemberAccessResolution {
  /** Pathogen type of the receiver when it is a TYPE_MEMBERS type; null for namespace/enum/object-literal member sets */
  typeName: string | null;
  members: MemberCompletionSet;
  /** The (possibly partial) member word already typed after the final `.` */
  memberPrefix: string;
}

/**
 * Layer constructors return a layer union that stays hand-written rather than
 * generated (see the matching special-case in type-inference.ts inferType), so
 * they aren't in CONSTRUCTOR_RETURN_TYPES. Map their bare-call return types
 * here for member completion on `layer('x').`, `PathLayer('x').`, etc.
 */
const LAYER_CALL_RETURN_TYPES: Record<string, string> = {
  layer: 'PathLayer',
  PathLayer: 'PathLayer',
  TextLayer: 'TextLayer',
  GroupLayer: 'GroupLayer',
};

/** The legacy regex inference chain — used when no resolver is injected. */
export function regexNameResolver(name: string, source: string): string | null {
  return inferType(name, source) ?? inferBlockParamType(name, source) ?? inferLoopVarType(name, source);
}

/**
 * Resolve member access at the end of `textBefore`. Returns null when the
 * cursor is not in a member position or the receiver cannot be typed.
 */
export function resolveMemberAccess(
  textBefore: string,
  source: string,
  resolveName?: NameTypeResolver,
): MemberAccessResolution | null {
  const resolver: NameTypeResolver = resolveName ?? ((name) => regexNameResolver(name, source));

  // Method call on expression: expr.method(...).
  // e.g., shape.boundingBox(). or Color('#f00').lighten(0.2).
  // Member access on a chain rooted in a bare call: callee(...).method(...).
  // e.g. layer('a').segment('s'). — chainMatch below can't recover the
  // receiver (the closing paren breaks its \w+ capture), so resolve the
  // callee's return type and look the method up in that type's per-type
  // return map (PathLayer's segment → ProjectedPath, not the flat fallback).
  const callChainMatch = /(?:^|[^.\w])(\w+)\(\s*[^)]*\)\s*\.(\w+)\(\s*[^)]*\)\s*\.(\w*)$/.exec(textBefore);
  if (callChainMatch) {
    const callee = callChainMatch[1];
    const methodName = callChainMatch[2];
    const memberPrefix = callChainMatch[3];
    const receiverType =
      LAYER_CALL_RETURN_TYPES[callee] ??
      (Object.hasOwn(CONSTRUCTOR_RETURN_TYPES, callee) ? CONSTRUCTOR_RETURN_TYPES[callee].type : null);
    const chainReturnType = receiverType ? TYPE_METHOD_RETURNS[receiverType]?.[methodName] : undefined;
    if (chainReturnType && chainReturnType in TYPE_MEMBERS) {
      return { typeName: chainReturnType, members: TYPE_MEMBERS[chainReturnType], memberPrefix };
    }
  }

  // When the receiver is a plain variable, prefer its per-type return map
  // (grid.getPoint() → Point vs mesh.getPoint() → MeshPoint).
  const chainMatch = /(\w+)?\.(\w+)\(\s*[^)]*\)\s*\.(\w*)$/.exec(textBefore);
  if (chainMatch) {
    const receiverName = chainMatch[1];
    const methodName = chainMatch[2];
    const memberPrefix = chainMatch[3];
    const receiverType = receiverName ? resolver(receiverName) : null;
    const perType = receiverType ? TYPE_METHOD_RETURNS[receiverType]?.[methodName] : undefined;
    const returnType = perType ?? getMethodReturnType(methodName);
    if (returnType && returnType in TYPE_MEMBERS) {
      return { typeName: returnType, members: TYPE_MEMBERS[returnType], memberPrefix };
    }
  }

  // Member access on a bare call expression: callee(...).
  // e.g., layer('main'). or PathLayer('bg'). — the trailing ) breaks dotMatch's
  // \w+, and chainMatch only fires on a `.method()` chain. Resolve the callee's
  // return type (layer()/PathLayer()/TextLayer()/GroupLayer() → layer types,
  // other constructors via CONSTRUCTOR_RETURN_TYPES) and offer that type's
  // members. Placed after chainMatch so `pb.vertex('x').` still resolves via
  // its receiver `pb`; the [^.\w] guard keeps this from matching a method call
  // (which chainMatch owns).
  const callMatch = /(?:^|[^.\w])(\w+)\(\s*[^)]*\)\s*\.(\w*)$/.exec(textBefore);
  if (callMatch) {
    const callee = callMatch[1];
    const memberPrefix = callMatch[2];
    const returnType =
      LAYER_CALL_RETURN_TYPES[callee] ??
      (Object.hasOwn(CONSTRUCTOR_RETURN_TYPES, callee) ? CONSTRUCTOR_RETURN_TYPES[callee].type : null);
    if (returnType && returnType in TYPE_MEMBERS) {
      return { typeName: returnType, members: TYPE_MEMBERS[returnType], memberPrefix };
    }
  }

  // Member access (dot completions)
  const dotMatch = /(\w+)\.(\w*)$/.exec(textBefore);
  if (dotMatch) {
    const objectName = dotMatch[1];
    const memberPrefix = dotMatch[2];
    const resolved = getMembersForObject(objectName, source, resolver);
    if (resolved) {
      return { ...resolved, memberPrefix };
    }
  }

  // Deep property access (e.g., ctx.position.x, layer.ctx.position)
  const deepMatch = /(\w+)\.(\w+)\.(\w*)$/.exec(textBefore);
  if (deepMatch) {
    const [, obj, prop1, memberPrefix] = deepMatch;
    const deepMembers = getDeepMembers(obj, prop1, resolver);
    if (deepMembers) {
      return { ...deepMembers, memberPrefix };
    }
  }

  return null;
}

export function getMembersForObject(
  name: string,
  source: string,
  resolveName?: NameTypeResolver,
): { typeName: string | null; members: MemberCompletionSet } | null {
  const resolver: NameTypeResolver = resolveName ?? ((n) => regexNameResolver(n, source));

  // Namespaces (Color, Object)
  if (name in NAMESPACE_MEMBERS) return { typeName: null, members: NAMESPACE_MEMBERS[name] };

  // Enum member access (GridPatternType.Shape, Easing.Linear, etc.)
  if (name in ENUM_MEMBER_MAP) {
    return { typeName: null, members: { properties: ENUM_MEMBER_MAP[name], methods: [] } };
  }

  // Special names with known types
  if (name === 'ctx' && 'PathContext' in TYPE_MEMBERS) {
    return { typeName: 'PathContext', members: TYPE_MEMBERS.PathContext };
  }

  // Resolve the name to a type (AST-first when injected, regex chain otherwise)
  const type = resolver(name);
  if (type && type in TYPE_MEMBERS) return { typeName: type, members: TYPE_MEMBERS[type] };

  // Object literal properties: if we can find { name: ..., x: ..., y: ... } patterns
  // for the variable, offer those properties as completions
  const objProps = inferObjectProperties(name, source);
  if (objProps) return { typeName: null, members: objProps };

  return null;
}

function getDeepMembers(
  obj: string,
  prop: string,
  resolver: NameTypeResolver,
): { typeName: string | null; members: MemberCompletionSet } | null {
  // ctx.position.x, ctx.start.y
  if (obj === 'ctx' && (prop === 'position' || prop === 'start')) {
    return TYPE_MEMBERS.Point ? { typeName: 'Point', members: TYPE_MEMBERS.Point } : null;
  }
  // ctx.transform has its own members
  if (obj === 'ctx' && prop === 'transform') {
    return {
      typeName: null,
      members: {
        properties: [
          { label: 'translate', kind: 'property', detail: 'Translation state {x, y}', boost: 10 },
          { label: 'rotate', kind: 'property', detail: 'Rotation state {angle, cx, cy}', boost: 10 },
          { label: 'scale', kind: 'property', detail: 'Scale state {x, y}', boost: 10 },
        ],
        methods: [
          { label: 'reset', kind: 'function', detail: 'reset() — Reset all transforms', boost: 8 },
          { label: 'set', kind: 'function', detail: 'set(property, value) — Set transform value', boost: 8 },
        ],
      },
    };
  }

  // layer.ctx.position, layer.ctx.start — infer layer type, then check prop
  if (prop === 'ctx') {
    const type = resolver(obj);
    if (type === 'PathLayer' || type === 'GroupLayer') {
      return TYPE_MEMBERS.PathContext ? { typeName: 'PathContext', members: TYPE_MEMBERS.PathContext } : null;
    }
  }

  return null;
}

/**
 * Infer object properties when a variable holds an object literal or comes from
 * an array of objects. Returns ad-hoc member completions based on property names.
 */
export function inferObjectProperties(name: string, source: string): MemberCompletionSet | null {
  const esc = escapeRegex(name);

  // Direct object literal: let name = { x: ..., y: ..., ... };
  const objMatch = new RegExp(`let\\s+${esc}\\s*=\\s*\\{\\s*([^}]{1,500})\\}`).exec(source);
  if (objMatch) {
    return extractObjectProps(objMatch[1]);
  }

  // Check if this is a loop/block param iterating over an array of objects
  // We already checked inferBlockParamType/inferLoopVarType — if those returned '_ObjectLiteral',
  // we need to find the actual array and extract props from the first element
  const blockParamType = inferBlockParamType(name, source);
  if (blockParamType === '_ObjectLiteral') {
    // Find the array variable
    const mapMatch = new RegExp(`(\\w+)\\.map\\s*\\(\\)\\s*\\{\\s*\\|\\s*${esc}`).exec(source);
    const loopMatch = new RegExp(
      `for\\s*\\(\\s*(?:\\[\\s*)?${esc}(?:\\s*,\\s*\\w+)*\\s*(?:\\]\\s+|\\s+)in\\s+(\\w+)\\s*\\)`,
    ).exec(source);
    const arrName = mapMatch?.[1] ?? loopMatch?.[1];
    if (arrName) {
      const arrEsc = escapeRegex(arrName);
      const arrInit = new RegExp(`let\\s+${arrEsc}\\s*=\\s*\\[\\s*\\{\\s*([^}]{1,500})\\}`).exec(source);
      if (arrInit) return extractObjectProps(arrInit[1]);
    }
  }

  const loopVarType = inferLoopVarType(name, source);
  if (loopVarType === '_ObjectLiteral') {
    const loopMatch = new RegExp(
      `for\\s*\\(\\s*(?:\\[\\s*)?${esc}(?:\\s*,\\s*\\w+)*\\s*(?:\\]\\s+|\\s+)in\\s+(\\w+)\\s*\\)`,
    ).exec(source);
    const arrName = loopMatch?.[1];
    if (arrName) {
      const arrEsc = escapeRegex(arrName);
      const arrInit = new RegExp(`let\\s+${arrEsc}\\s*=\\s*\\[\\s*\\{\\s*([^}]{1,500})\\}`).exec(source);
      if (arrInit) return extractObjectProps(arrInit[1]);
    }
  }

  return null;
}

/**
 * Extract property names from an object literal body string like "x: 10, y: 20, name: 'foo'"
 */
function extractObjectProps(body: string): MemberCompletionSet | null {
  const propPattern = /(\w+)\s*:/g;
  const props: CompletionEntry[] = [];
  const seen = new Set<string>();
  let m;
  while ((m = propPattern.exec(body)) !== null) {
    if (!seen.has(m[1])) {
      seen.add(m[1]);
      props.push({ label: m[1], kind: 'property', detail: `property: ${m[1]}`, boost: 10 });
    }
  }
  if (props.length === 0) return null;
  return { properties: props, methods: [] };
}
