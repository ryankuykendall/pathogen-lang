// Unit tests for scripts/lib/completion-extract.ts — the pure extraction
// logic behind scripts/generate-completions.ts. Uses inline ts-morph fixtures
// rather than the real src/pathogen-api.ts so each behavior is isolated.

import { describe, expect, it } from 'vitest';

import {
  deriveTemplate,
  elementTypeFromText,
  escapeString,
  extractConstructorReturnTypes,
  extractFromPathogenApi,
  extractMethodBlockParams,
  extractNamespaceMembers,
  extractNamespaceMethodReturns,
  extractTypeElementTypes,
  extractTypeMembers,
  extractTypeMethodReturns,
  extractTypePropertyReturns,
  loadApiSource,
  parseJsDoc,
} from '../../scripts/lib/completion-extract';

import {
  METHOD_BLOCK_PARAMS,
  NAMESPACE_METHOD_RETURNS,
  TYPE_ELEMENT_TYPES,
  TYPE_PROPERTY_TYPES,
} from '../../src/language-services/completion-data.generated';

import type { ExtractionWarning } from '../../scripts/lib/completion-extract';

describe('parseJsDoc', () => {
  it('extracts detail, boost, and kind', () => {
    const parsed = parseJsDoc('circle(cx, cy, r) — Draw circle @boost 15');
    expect(parsed.detail).toBe('circle(cx, cy, r) — Draw circle');
    expect(parsed.boost).toBe(15);
    expect(parsed.kind).toBe('function');
  });

  it('extracts @snippet with \\n/\\t escapes expanded and strips it from detail', () => {
    const parsed = parseJsDoc('apply { } — Send path commands @boost 8 @snippet apply {\\n\\t$0\\n}');
    expect(parsed.snippet).toBe('apply {\n\t$0\n}');
    expect(parsed.detail).toBe('apply { } — Send path commands');
  });

  it('leaves detail untouched when no @snippet is present', () => {
    const parsed = parseJsDoc('drawTo(x, y) — Draw path translated to (x, y)');
    expect(parsed.snippet).toBeUndefined();
    expect(parsed.detail).toBe('drawTo(x, y) — Draw path translated to (x, y)');
  });

  it('extracts @blockparams as an ordered type list and strips it from detail', () => {
    const parsed = parseJsDoc(
      'variableOffset() {|go, pb| ...} — Trace @blockparams VariableOffsetBuilder, PathBlock @snippet variableOffset() {|${1:go}, ${2:pb}|\\n\\t$0\\n}',
    );
    expect(parsed.blockParams).toEqual(['VariableOffsetBuilder', 'PathBlock']);
    expect(parsed.detail).toBe('variableOffset() {|go, pb| ...} — Trace');
    expect(parsed.snippet).toBe('variableOffset() {|${1:go}, ${2:pb}|\n\t$0\n}');
  });

  it('omits blockParams when the tag is absent', () => {
    expect(parseJsDoc('drawTo(x, y) — Draw').blockParams).toBeUndefined();
  });
});

describe('deriveTemplate', () => {
  function paramsOf(decl: string) {
    const sf = loadApiSource(decl);
    return sf.getFunctions()[0].getParameters();
  }

  it('derives numbered placeholders for required params', () => {
    const params = paramsOf('export declare function drawTo(x: number, y: number): void;');
    expect(deriveTemplate('drawTo', params)).toBe('drawTo(${1:x}, ${2:y})$0');
  });

  it('quotes string-typed params', () => {
    const params = paramsOf('export declare function Mask(id: string): void;');
    expect(deriveTemplate('Mask', params)).toBe("Mask('${1:id}')$0");
  });

  it('omits optional params', () => {
    const params = paramsOf('export declare function Cycler(array: unknown, shuffle?: boolean): void;');
    expect(deriveTemplate('Cycler', params)).toBe('Cycler(${1:array})$0');
  });

  it('collapses a rest param to a single unquoted placeholder', () => {
    const params = paramsOf('export declare function min(...values: number[]): number;');
    expect(deriveTemplate('min', params)).toBe('min(${1:values})$0');
  });

  it('emits closed parens for zero-arg functions', () => {
    const params = paramsOf('export declare function PI(): number;');
    expect(deriveTemplate('PI', params)).toBe('PI()$0');
  });

  it('prefers an explicit @snippet over derivation', () => {
    const params = paramsOf('export declare function apply(): void;');
    expect(deriveTemplate('apply', params, 'apply {\n\t$0\n}')).toBe('apply {\n\t$0\n}');
  });
});

describe('extractFromPathogenApi', () => {
  it('attaches derived insertText to function completions', () => {
    const sf = loadApiSource(`
      /** lerp(a, b, t) — Linear interpolation @boost 14 */
      export declare function lerp(a: number, b: number, t: number): number;
    `);
    const [entry] = extractFromPathogenApi(sf);
    expect(entry.label).toBe('lerp');
    expect(entry.insertText).toBe('lerp(${1:a}, ${2:b}, ${3:t})$0');
  });

  it('does not attach insertText to variables or namespaces', () => {
    const sf = loadApiSource(`
      /** ctx — Path context @boost 16 @kind variable */
      export declare const ctx: number;
      /** Color — Color helpers @boost 8 @kind variable */
      export declare namespace Color {
        /** Color.mix(c1, c2, t) — Interpolate colors */
        function mix(c1: number, c2: number, t: number): number;
      }
    `);
    const entries = extractFromPathogenApi(sf);
    const ctx = entries.find((e) => e.label === 'ctx');
    const color = entries.find((e) => e.label === 'Color');
    expect(ctx?.insertText).toBeUndefined();
    expect(color?.insertText).toBeUndefined();
  });

  it('warns when a block-shaped detail has no @snippet', () => {
    const sf = loadApiSource(`
      /** weird() {|x| ...} — Block-shaped but untagged */
      export declare function weird(): void;
    `);
    const warnings: ExtractionWarning[] = [];
    extractFromPathogenApi(sf, warnings);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].member).toBe('weird');
  });
});

describe('extractTypeMembers', () => {
  const FIXTURE = `
    /** @type Widget */
    export interface PathogenWidget {
      /** Widget id */
      readonly id: string;
      /** apply { } — Send commands @snippet apply {\\n\\t$0\\n} */
      apply(): void;
      /** resize(w, h) — Resize widget */
      resize(w: number, h: number): PathogenWidget;
    }
  `;

  it('methods carry @snippet or derived templates; properties carry none', () => {
    const [set] = extractTypeMembers(loadApiSource(FIXTURE));
    expect(set.typeName).toBe('Widget');
    expect(set.properties[0].insertText).toBeUndefined();
    const apply = set.methods.find((m) => m.label === 'apply');
    const resize = set.methods.find((m) => m.label === 'resize');
    expect(apply?.insertText).toBe('apply {\n\t$0\n}');
    expect(apply?.detail).toBe('apply { } — Send commands');
    expect(resize?.insertText).toBe('resize(${1:w}, ${2:h})$0');
  });

  it('skips interfaces without a @type tag', () => {
    const sf = loadApiSource('export interface Options { a?: number; }');
    expect(extractTypeMembers(sf)).toHaveLength(0);
  });
});

describe('extractNamespaceMembers', () => {
  it('derives templates and unmangles trailing-underscore names', () => {
    const sf = loadApiSource(`
      export declare namespace Object {
        /** Object.delete(obj, key) — Remove key */
        function delete_(obj: unknown, key: string): unknown;
      }
    `);
    const [set] = extractNamespaceMembers(sf);
    const del = set.methods[0];
    expect(del.label).toBe('delete');
    expect(del.insertText).toBe("delete(${1:obj}, '${2:key}')$0");
  });
});

describe('extractConstructorReturnTypes', () => {
  const FIXTURE = `
    /** Marker('id', w, h) {|m| ...} — Marker @snippet Marker('\${1:id}', \${2:10}, \${3:10}) {|\${4:m}|\\n\\t$0\\n} */
    export declare function Marker(id: string, w: number, h: number): PathogenMarker;
    /** Mask('id') — Mask */
    export declare function Mask(id: string): PathogenMask;
    /** PathLayer('name') — union return, skipped */
    export declare function PathLayer(name: string): PathogenMarker | PathogenMask;
    /** @type Marker */
    export interface PathogenMarker { readonly id: string; }
    /** @type Mask */
    export interface PathogenMask { readonly id: string; }
  `;

  it('maps constructors to @type names with hasBindingBlock from the snippet', () => {
    const map = extractConstructorReturnTypes(loadApiSource(FIXTURE));
    expect(map.Marker).toEqual({ type: 'Marker', hasBindingBlock: true });
    expect(map.Mask).toEqual({ type: 'Mask', hasBindingBlock: false });
  });

  it('skips union return types', () => {
    const map = extractConstructorReturnTypes(loadApiSource(FIXTURE));
    expect(map.PathLayer).toBeUndefined();
  });
});

describe('extractTypeMethodReturns', () => {
  it('resolves per-type method returns through @type tags, arrays, and strings', () => {
    const sf = loadApiSource(`
      /** @type Grid */
      export interface PathogenGrid {
        getPoint(row: number, col: number): PathogenPoint;
        getRow(row: number): PathogenPoint[];
        name(): string;
        forEach(): void;
      }
      /** @type Point */
      export interface PathogenPoint { readonly x: number; }
    `);
    const returns = extractTypeMethodReturns(sf);
    expect(returns.Grid).toEqual({ getPoint: 'Point', getRow: 'array', name: 'string' });
  });
});

describe('extractTypePropertyReturns', () => {
  it('resolves property types through @type tags, keeps primitives, applies the ColorValue alias', () => {
    const sf = loadApiSource(`
      export interface ColorValue { readonly __brand: 'color'; }
      /** @type Grid */
      export interface PathogenGrid {
        readonly rows: number;
        readonly origin: PathogenPoint;
        getPoint(row: number, col: number): PathogenPoint;
      }
      /** @type Point */
      export interface PathogenPoint { readonly x: number; readonly y: number; }
      /** @type MeshPoint */
      export interface PathogenMeshPoint { color: ColorValue; x: number; }
    `);
    const props = extractTypePropertyReturns(sf);
    // number/boolean properties are kept — they have no member surface but
    // power hover display for destructured bindings (let { x } = point).
    expect(props.Grid).toEqual({ rows: 'number', origin: 'Point' });
    expect(props.MeshPoint).toEqual({ color: 'ColorInstance', x: 'number' });
    expect(props.Point).toEqual({ x: 'number', y: 'number' });
  });

  it('shipped generated data resolves the destructuring-critical entries', () => {
    expect(TYPE_PROPERTY_TYPES.Grid.origin).toBe('Point');
    expect(TYPE_PROPERTY_TYPES.MeshPoint.color).toBe('ColorInstance');
    expect(TYPE_PROPERTY_TYPES.PathContext.position).toBe('Point');
    expect(TYPE_PROPERTY_TYPES.PathContext.start).toBe('Point');
    expect(TYPE_PROPERTY_TYPES.Grid.rows).toBe('number');
    expect(TYPE_PROPERTY_TYPES.Point.x).toBe('number');
  });
});

describe('elementTypeFromText', () => {
  const ifaceToType = new Map([
    ['PathogenPathBlock', 'PathBlock'],
    ['PathogenPoint', 'Point'],
    ['ColorValue', 'ColorInstance'],
  ]);

  it('resolves PathogenArray<T> generics and T[] suffixes through the type map', () => {
    expect(elementTypeFromText('PathogenArray<PathogenPathBlock>', ifaceToType)).toBe('PathBlock');
    expect(elementTypeFromText('ColorValue[]', ifaceToType)).toBe('ColorInstance');
  });

  it('returns null for ungeneric arrays, unknown element types, and non-arrays', () => {
    expect(elementTypeFromText('PathogenArray', ifaceToType)).toBeNull();
    expect(elementTypeFromText('PathogenArray<UnknownThing>', ifaceToType)).toBeNull();
    expect(elementTypeFromText('number', ifaceToType)).toBeNull();
  });
});

describe('extractTypeElementTypes', () => {
  it('collects element types from array-typed properties and method returns', () => {
    const sf = loadApiSource(`
      /** @type PathBlock */
      export interface PathogenPathBlock {
        /** Per-contour PathBlocks */
        readonly contours: PathogenArray<PathogenPathBlock>;
        /** Not an array */
        readonly length: number;
        /** segmentAll(name) */
        segmentAll(name: string): PathogenArray<PathogenPathBlock>;
        /** boundingBox() */
        boundingBox(): PathogenBoundingBox;
      }
      /** @type BoundingBox */
      export interface PathogenBoundingBox { readonly width: number; }
    `);
    expect(extractTypeElementTypes(sf)).toEqual({
      PathBlock: { contours: 'PathBlock', segmentAll: 'PathBlock' },
    });
  });

  it('shipped generated data carries the contours element type', () => {
    expect(TYPE_ELEMENT_TYPES.PathBlock.contours).toBe('PathBlock');
    expect(TYPE_ELEMENT_TYPES.PathBlock.vertices).toBe('Point');
  });
});

describe('extractNamespaceMethodReturns', () => {
  it('collects namespace function return types with array element types', () => {
    const sf = loadApiSource(`
      export declare namespace PathBlock {
        /** PathBlock.fromGlyph(text, styles) */
        function fromGlyph(text: string, styles: Value): PathogenArray<PathogenPathBlock>;
      }
      /** @type PathBlock */
      export interface PathogenPathBlock { readonly length: number; }
      /** @type array */
      export interface PathogenArray<T = Value> { readonly length: number; }
    `);
    expect(extractNamespaceMethodReturns(sf)).toEqual({
      PathBlock: { fromGlyph: { type: 'array', elementType: 'PathBlock' } },
    });
  });

  it('shipped generated data resolves fromGlyph and Color.palette', () => {
    expect(NAMESPACE_METHOD_RETURNS.PathBlock.fromGlyph).toEqual({ type: 'array', elementType: 'PathBlock' });
    expect(NAMESPACE_METHOD_RETURNS.Color.palette).toEqual({ type: 'array', elementType: 'ColorInstance' });
    expect(NAMESPACE_METHOD_RETURNS.Color.mix).toEqual({ type: 'ColorInstance' });
  });
});

describe('extractMethodBlockParams', () => {
  it('collects @blockparams per type and method', () => {
    const sf = loadApiSource(`
      /** @type PathBlock */
      export interface PathogenPathBlock {
        /** variableOffset() {|go, pb| ...} @blockparams VariableOffsetBuilder, PathBlock @snippet variableOffset() {|\${1:go}, \${2:pb}|\\n\\t$0\\n} */
        variableOffset(): PathogenPathBlock;
        /** drawTo(x, y) — no block */
        drawTo(x: number, y: number): PathogenProjectedPath;
      }
    `);
    expect(extractMethodBlockParams(sf)).toEqual({
      PathBlock: { variableOffset: ['VariableOffsetBuilder', 'PathBlock'] },
    });
  });

  it('warns when @blockparams trails @snippet (which would swallow it)', () => {
    const sf = loadApiSource(`
      /** @type PathBlock */
      export interface PathogenPathBlock {
        /** variableOffset() {|go, pb| ...} @snippet variableOffset() {|\${1:go}|$0} @blockparams VariableOffsetBuilder, PathBlock */
        variableOffset(): PathogenPathBlock;
      }
    `);
    const warnings: ExtractionWarning[] = [];
    extractMethodBlockParams(sf, warnings);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].member).toBe('PathBlock.variableOffset');
    expect(warnings[0].message).toContain('must precede @snippet');
  });

  it('shipped generated data types both variableOffset block params', () => {
    expect(METHOD_BLOCK_PARAMS.PathBlock.variableOffset).toEqual(['VariableOffsetBuilder', 'PathBlock']);
    expect(METHOD_BLOCK_PARAMS.PathBlock.compoundVariableOffset).toEqual(['CompoundVariableOffsetBuilder', 'PathBlock']);
  });
});

describe('escapeString', () => {
  it('escapes newlines and tabs so the generated file stays single-line', () => {
    expect(escapeString('apply {\n\t$0\n}')).toBe('apply {\\n\\t$0\\n}');
  });

  it('escapes quotes and backslashes', () => {
    expect(escapeString("it's a \\ test")).toBe("it\\'s a \\\\ test");
  });
});
