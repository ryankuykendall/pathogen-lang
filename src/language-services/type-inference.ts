import { CONSTRUCTOR_RETURN_TYPES, TYPE_METHOD_RETURNS, TYPE_PROPERTY_TYPES } from './completion-data.generated';

/**
 * Lightweight, regex-based type inference over source text — shared by
 * completions (member access, pattern-brace suggestions) and hover (variable
 * type display). No AST: every rule matches declaration patterns directly,
 * consistent with the completion engine's text-scanning design.
 */

/** Escape a string for use inside a RegExp. */
export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Map method names to their return types.
 * Used for chained completions like shape.boundingBox().width
 */
export function getMethodReturnType(method: string): string | null {
  const METHOD_RETURN_TYPES: Record<string, string> = {
    // PathBlock methods returning PathBlock
    offset: 'PathBlock',
    variableOffset: 'PathBlock',
    compoundVariableOffset: 'PathBlock',
    reverse: 'PathBlock',
    mirror: 'PathBlock',
    subPath: 'PathBlock',
    chamfer: 'PathBlock',
    chamferAtVertex: 'PathBlock',
    fillet: 'PathBlock',
    filletAtVertex: 'PathBlock',
    ellipticalFillet: 'PathBlock',
    ellipticalFilletAtVertex: 'PathBlock',
    union: 'PathBlock',
    difference: 'PathBlock',
    intersection: 'PathBlock',
    xor: 'PathBlock',
    scale: 'PathBlock',
    rotateAtVertexIndex: 'PathBlock',
    toPathBlock: 'PathBlock',

    // PathBlock methods returning ProjectedPath
    project: 'ProjectedPath',
    draw: 'ProjectedPath',
    drawTo: 'ProjectedPath',

    // PathBlock namespace
    fromGlyph: 'array',

    // PathBlock methods returning BoundingBox
    boundingBox: 'BoundingBox',
    paddedBoundingBox: 'BoundingBox',

    // PathBlock methods returning Point
    get: 'Point',
    anchor: 'Point',

    // Named-label queries. `segment` returns PathBlock on a PathBlock receiver
    // and ProjectedPath on ProjectedPath/PathLayer — the per-type
    // TYPE_METHOD_RETURNS map (preferred over this fallback) carries the
    // precise return; PathBlock is the fallback for an unknown receiver.
    segment: 'PathBlock',
    point: 'Point',
    vertex: 'VertexHandle',

    // Color methods returning ColorInstance
    lighten: 'ColorInstance',
    darken: 'ColorInstance',
    saturate: 'ColorInstance',
    desaturate: 'ColorInstance',
    alpha: 'ColorInstance',
    hueShift: 'ColorInstance',
    complement: 'ColorInstance',
    mix: 'ColorInstance',
    flatten: 'ColorInstance',

    // Point methods returning Point
    translate: 'Point',
    polarTranslate: 'Point',
    midpoint: 'Point',
    lerp: 'Point',
    rotate: 'Point',

    // PolarVector methods returning PolarVector
    turn: 'PolarVector',
    // Note: 'mirror' maps to PathBlock (defined above) — PolarVector.mirror() also exists
    // but PathBlock is more common, so we keep that mapping

    // Cycler
    pick: 'any',

    // Array methods
    slice: 'array',
    map: 'array',
    mapSlice: 'array',
  };

  return METHOD_RETURN_TYPES[method] ?? null;
}

/**
 * Infer the Pathogen type of a destructuring RHS expression text
 * (the `rhs` in `let { a, b } = rhs;`).
 */
export function inferRhsType(rhs: string, source: string, seen?: Set<string>): string | null {
  const t = rhs.trim();
  if (/^ctx\.(position|start)$/.test(t)) return 'Point';
  if (t === 'ctx') return 'PathContext';
  if (t === 'viewbox') return 'ViewBox';
  const ctorMatch = /^(\w+)\s*\(/.exec(t);
  // Object.hasOwn, not `in`: inherited names like toString/constructor must
  // not resolve through Object.prototype (same pitfall as struct-properties).
  if (ctorMatch && Object.hasOwn(CONSTRUCTOR_RETURN_TYPES, ctorMatch[1])) return CONSTRUCTOR_RETURN_TYPES[ctorMatch[1]].type;
  if (/^(?:Color\s*\(|#[0-9a-fA-F]|rgb\(|hsl\(|oklch\(|hwb\(|lab\(|lch\(|oklab\()/.test(t)) return 'ColorInstance';
  if (/^[a-zA-Z_]\w*$/.test(t)) return inferType(t, source, seen);
  return null;
}

/**
 * Lightweight type inference from source text.
 * Matches patterns like `let x = Point(...)`, `let x = @{...}`, `let x = [...]`, etc.
 *
 * `seen` guards multi-hop reference cycles (`let a = b; let b = a;`) — the
 * inline `!== name` checks below only catch direct self-reference, and a
 * two-variable cycle previously recursed to a stack overflow.
 */
export function inferType(name: string, source: string, seen?: Set<string>): string | null {
  const visited = seen ?? new Set<string>();
  if (visited.has(name)) return null;
  visited.add(name);

  const esc = escapeRegex(name);

  // Layer constructors — support both `let x = PathLayer(...)` and
  // `define x PathLayer(...)`. These return a layer union in pathogen-api.ts,
  // so they stay hand-written rather than generated.
  if (new RegExp(`(?:let\\s+${esc}\\s*=|define)\\s*PathLayer\\s*\\(`).test(source)) return 'PathLayer';
  if (new RegExp(`(?:let\\s+${esc}\\s*=|define)\\s*TextLayer\\s*\\(`).test(source)) return 'TextLayer';
  if (new RegExp(`(?:let\\s+${esc}\\s*=|define)\\s*GroupLayer\\s*\\(`).test(source)) return 'GroupLayer';

  // let name = layer('...').segment/point/vertex(...) — a query RESULT, not
  // the layer itself. Must be checked before the bare layer() rule below,
  // which would otherwise greedily match on the `layer(` prefix.
  const layerQuery = new RegExp(
    `let\\s+${esc}\\s*=\\s*layer\\s*\\([^)]*\\)\\s*\\.\\s*(segmentAll|pointAll|vertexAll|segment|point|vertex)\\s*\\(`,
  ).exec(source);
  if (layerQuery) {
    if (layerQuery[1].endsWith('All')) return 'Array';
    return layerQuery[1] === 'segment' ? 'ProjectedPath' : layerQuery[1] === 'point' ? 'Point' : 'VertexHandle';
  }

  // let name = layer('...')  — returns a layer reference (same as PathLayer)
  if (new RegExp(`let\\s+${esc}\\s*=\\s*layer\\s*\\(`).test(source)) return 'PathLayer';

  // Constructor-derived types — generated from pathogen-api.ts return types
  // (Point, PolarVector, Cycler, CSSVar, Grid, filters, gradients, Mask,
  // ClipPath, Pattern, Marker, SVGDocumentFragment, ...). Adding a declared
  // constructor to pathogen-api.ts propagates here with no code change.
  for (const [ctor, info] of Object.entries(CONSTRUCTOR_RETURN_TYPES)) {
    if (new RegExp(`let\\s+${esc}\\s*=\\s*${ctor}\\s*\\(`).test(source)) return info.type;
  }

  // let name = Color(...) or let name = #hex or let name = rgb(...) or let name = oklch(...)
  if (
    new RegExp(
      `let\\s+${esc}\\s*=\\s*(?:Color\\s*\\(|#[0-9a-fA-F]|rgb\\(|hsl\\(|oklch\\(|hwb\\(|lab\\(|lch\\(|oklab\\()`,
    ).test(source)
  )
    return 'ColorInstance';

  // let name = @{ ... }
  if (new RegExp(`let\\s+${esc}\\s*=\\s*@\\s*\\{`).test(source)) return 'PathBlock';

  // let name = &{ ... }
  if (new RegExp(`let\\s+${esc}\\s*=\\s*&\\s*\\{`).test(source)) return 'ProjectedText';

  // let name = [...]  or method returning array
  if (new RegExp(`let\\s+${esc}\\s*=\\s*\\[`).test(source)) return 'array';

  // let name = "..." or let name = '...' or let name = `...`
  if (new RegExp(`let\\s+${esc}\\s*=\\s*["'\`]`).test(source)) return 'string';

  // let name = receiver.method() — infer from method return type, preferring
  // the receiver's per-type return map over the global fallback.
  const methodAssignMatch = new RegExp(`let\\s+${esc}\\s*=\\s*(\\w+)\\.([a-zA-Z]+)\\s*\\(`).exec(source);
  if (methodAssignMatch) {
    const [, receiver, method] = methodAssignMatch;
    const receiverType = receiver !== name ? inferType(receiver, source, visited) : null;
    const perType = receiverType ? TYPE_METHOD_RETURNS[receiverType]?.[method] : undefined;
    const returnType = perType ?? getMethodReturnType(method);
    if (returnType && returnType !== 'any') return returnType;
  }

  // let { a, b: alias, ...rest } = rhs; — resolve the bound name's property
  // type through TYPE_PROPERTY_TYPES (the destructuring counterpart of the
  // method-return rule above). First match anywhere in the file wins — the
  // same whole-source, position-unaware limitation every rule here shares.
  // The (^|[^\w$]) prefix keeps identifiers ending in "let" from matching.
  const destructureRe = /(^|[^\w$])let\s*\{([^}]{0,300})\}\s*=\s*([^;]{1,200});/g;
  for (const m of source.matchAll(destructureRe)) {
    const [, , patternText, rhs] = m;
    for (const entry of patternText.split(',')) {
      const e = entry.trim();
      if (e === '' || e.startsWith('...')) continue; // rest binds a plain object — no member surface
      const [key, alias] = e.split(':').map((s) => s.trim());
      const bound = alias ?? key;
      if (bound !== name) continue;
      if (rhs.trim() === name) return null; // recursion guard
      const rhsType = inferRhsType(rhs, source, visited);
      const propType = rhsType ? TYPE_PROPERTY_TYPES[rhsType]?.[key] : undefined;
      // A destructured binding must not fall through to weaker rules.
      return propType ?? null;
    }
  }

  // Stdlib path functions return PathBlock-like path segments
  if (
    new RegExp(
      `let\\s+${esc}\\s*=\\s*(?:circle|rect|roundRect|polygon|star|line|arc|quadratic|cubic|cubicSpline|quadSpline)\\s*\\(`,
    ).test(source)
  ) {
    return 'PathBlock';
  }

  // Assignment from another variable: let x = y; — propagate y's type to x
  const assignMatch = new RegExp(`let\\s+${esc}\\s*=\\s*([a-zA-Z_]\\w*)\\s*;`).exec(source);
  if (assignMatch) {
    const sourceVar = assignMatch[1];
    // Avoid infinite recursion by not re-inferring the same name
    if (sourceVar !== name) {
      return inferType(sourceVar, source, visited);
    }
  }

  return null;
}

/**
 * Infer type for a block parameter (e.g., item in arr.map {|item| ...}).
 * Looks for the array variable the .map/.reduce is called on, then infers
 * the element type of that array.
 */
export function inferBlockParamType(paramName: string, source: string): string | null {
  const esc = escapeRegex(paramName);

  // Match: arrayVar.map() {|paramName| or arrayVar.map() {|paramName, index|
  const mapMatch = new RegExp(`(\\w+)\\.map\\s*\\(\\)\\s*\\{\\s*\\|\\s*${esc}(?:\\s*,\\s*\\w+)*\\s*\\|`).exec(source);
  if (mapMatch) {
    return inferArrayElementType(mapMatch[1], source);
  }

  // Match: arrayVar.reduce(init) {|acc, paramName| — param is 2nd arg (the element)
  const reduceItemMatch = new RegExp(
    `(\\w+)\\.reduce\\s*\\([^)]*\\)\\s*\\{\\s*\\|\\s*\\w+\\s*,\\s*${esc}(?:\\s*,\\s*\\w+)*\\s*\\|`,
  ).exec(source);
  if (reduceItemMatch) {
    return inferArrayElementType(reduceItemMatch[1], source);
  }

  // Match: Ctor(...) {|paramName| — bound parameter inside a constructor's
  // trailing block (filters, gradients, Pattern, Marker, Grid). The
  // constructor list is generated from @snippet tags in pathogen-api.ts.
  const blockCtors = Object.keys(CONSTRUCTOR_RETURN_TYPES).filter(
    (ctor) => CONSTRUCTOR_RETURN_TYPES[ctor].hasBindingBlock,
  );
  const ctorMatch = new RegExp(`(${blockCtors.join('|')})\\s*\\([^)]*\\)\\s*\\{\\s*\\|\\s*${esc}\\s*\\|`).exec(source);
  if (ctorMatch) {
    return CONSTRUCTOR_RETURN_TYPES[ctorMatch[1]].type;
  }

  return null;
}

/**
 * Infer type for a loop variable (e.g., d in for ([d, i] in data) or item in for (item in arr)).
 */
export function inferLoopVarType(varName: string, source: string): string | null {
  const esc = escapeRegex(varName);

  // Match: for ([varName, ...] in arrayVar) — destructured iteration
  const destructuredMatch = new RegExp(
    `for\\s*\\(\\s*\\[\\s*${esc}(?:\\s*,\\s*\\w+)*\\s*\\]\\s+in\\s+(\\w+)\\s*\\)`,
  ).exec(source);
  if (destructuredMatch) {
    return inferArrayElementType(destructuredMatch[1], source);
  }

  // Match: for (varName in arrayVar) — simple iteration
  const simpleMatch = new RegExp(`for\\s*\\(\\s*${esc}\\s+in\\s+(\\w+)\\s*\\)`).exec(source);
  if (simpleMatch) {
    return inferArrayElementType(simpleMatch[1], source);
  }

  return null;
}

/**
 * Infer the element type of an array variable by looking at its initialization.
 * e.g., let arr = [Point(0,0), Point(1,1)] → element type is 'Point'
 *       let arr = [{ x: 0, y: 0 }] → element type might be an inline object
 */
export function inferArrayElementType(arrayName: string, source: string): string | null {
  const esc = escapeRegex(arrayName);

  // Look for array initializer: let arrayName = [ ... ]
  const arrMatch = new RegExp(`let\\s+${esc}\\s*=\\s*\\[\\s*([^\\]]{1,200})`).exec(source);
  if (!arrMatch) return null;

  const firstContent = arrMatch[1].trim();

  // Check first element type
  if (/^Point\s*\(/.test(firstContent)) return 'Point';
  if (/^PolarVector\s*\(/.test(firstContent)) return 'PolarVector';
  if (/^Color\s*\(/.test(firstContent) || /^#[0-9a-fA-F]/.test(firstContent)) return 'ColorInstance';
  if (/^@\s*\{/.test(firstContent)) return 'PathBlock';
  if (/^PathLayer\s*\(/.test(firstContent)) return 'PathLayer';
  if (/^TextLayer\s*\(/.test(firstContent)) return 'TextLayer';
  if (/^GroupLayer\s*\(/.test(firstContent)) return 'GroupLayer';

  // Array of objects: let arr = [{ x: 0, y: 0 }, ...] — return a marker type
  if (firstContent.startsWith('{')) return '_ObjectLiteral';

  return null;
}
