/**
 * What the editors know of imported data (docs/data-import.md "In the
 * editor"): a value described in a few words for hover, and the values an
 * expression can reach in a data file, for key completion and the "has no
 * key" underline. The graph's data values are read once by the loader
 * (src/host/load-modules.ts) and passed in as data; nothing here reads a file.
 */
import { levenshtein } from './edit-distance';
import { resolveProjectPath } from '../host/paths';
import { fileLabel } from '../module-messages';
import { parseExpression } from '../parser/lezer-expression';
import { KEYWORDS } from '../parser/path-args-tokenizer';

import type { Declaration, Scope } from './scope-analysis';
import type { ModuleGraph } from '../host/load-modules';
import type { Expression } from '../parser/ast';

/** The words for a value's type, as completion details give them. */
export type DataTypeLabel = 'number' | 'string' | 'true/false' | 'null' | 'array' | 'object';

interface ArrayLike {
  type: 'ArrayValue';
  elements: unknown[];
}
interface ObjectLike {
  type: 'ObjectValue';
  properties: Map<string, unknown>;
}

function isArray(value: unknown): value is ArrayLike {
  return typeof value === 'object' && value !== null && (value as { type?: unknown }).type === 'ArrayValue';
}

function isObject(value: unknown): value is ObjectLike {
  return typeof value === 'object' && value !== null && (value as { type?: unknown }).type === 'ObjectValue';
}

export function typeLabel(value: unknown): DataTypeLabel {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'string') return 'string';
  if (isArray(value)) return 'array';
  if (isObject(value)) return 'object';
  return 'true/false';
}

/** How many keys a description lists before it stops. */
const KEYS_SHOWN = 12;

/**
 * The keys of a list of objects: each in the order it first appears, with the
 * type of its first value. Kept per array, since data values never change
 * and an editor asks again on every keystroke.
 */
const keysCache = new WeakMap<object, Map<string, DataTypeLabel>>();

function keysOf(objects: Iterable<unknown>): Map<string, DataTypeLabel> {
  const keys = new Map<string, DataTypeLabel>();
  for (const value of objects) {
    if (!isObject(value)) continue;
    for (const [key, held] of value.properties) if (!keys.has(key)) keys.set(key, typeLabel(held));
  }
  return keys;
}

function itemKeys(array: ArrayLike): Map<string, DataTypeLabel> {
  let keys = keysCache.get(array);
  if (!keys) {
    keys = keysOf(array.elements);
    keysCache.set(array, keys);
  }
  return keys;
}

function keyList(keys: Iterable<string>): string {
  const all = [...keys];
  const shown = all.slice(0, KEYS_SHOWN).join(', ');
  return all.length > KEYS_SHOWN ? `${shown}, … (${all.length} keys)` : shown;
}

function count(n: number, one: string, many: string): string {
  return `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;
}

/** What a data value holds, in a few words: `an array of 2 objects: name, x, y, radius, teeth`. */
export function describeData(value: unknown): string {
  if (isArray(value)) {
    const n = value.elements.length;
    if (n === 0) return 'an empty array';
    const kinds = new Set(value.elements.map(typeLabel));
    if (kinds.size > 1) return `an array of ${count(n, 'item', 'items')}`;
    const [kind] = kinds;
    if (kind === 'object') return `an array of ${count(n, 'object', 'objects')}: ${keyList(itemKeys(value).keys())}`;
    if (kind === 'true/false') return `an array of ${count(n, 'true/false value', 'true/false values')}`;
    if (kind === 'null') return `an array of ${count(n, 'null', 'nulls')}`;
    return `an array of ${count(n, kind, `${kind}s`)}`;
  }
  if (isObject(value)) {
    const n = value.properties.size;
    return n === 0
      ? 'an empty object'
      : `an object with ${count(n, 'key', 'keys')}: ${keyList(value.properties.keys())}`;
  }
  if (typeof value === 'number') return `a number: ${value}`;
  if (typeof value === 'string') {
    const shown = value.length > 40 ? `${value.slice(0, 40)}…` : value;
    return `a string: ${JSON.stringify(shown)}`;
  }
  if (value === null || value === undefined) return 'null';
  return (value as { value?: number }).value === 1 ? 'true' : 'false';
}

/**
 * The values an expression reaches in one data file. `complete` is false when
 * the walk stopped early (a very long list): then "no item has this key" can't
 * be said for sure.
 */
export interface DataReach {
  values: readonly unknown[];
  /** The data file, as messages name it: `data/gears.json`. */
  file: string;
  complete: boolean;
  /** The one array whose items these are, when they are exactly that: its keys are cached. */
  itemsOf?: ArrayLike;
}

/** How many values a reach may hold before the walk stops. */
const REACH_LIMIT = 200_000;

function elementsOf(reach: DataReach): DataReach {
  const arrays = reach.values.filter(isArray);
  // One array: its own list, not a copy (a reach is only read).
  if (arrays.length === 1) {
    return { values: arrays[0].elements, file: reach.file, complete: reach.complete, itemsOf: arrays[0] };
  }
  const values: unknown[] = [];
  let complete = reach.complete;
  for (const array of arrays) {
    if (values.length + array.elements.length > REACH_LIMIT) {
      complete = false;
      break;
    }
    for (const element of array.elements) values.push(element);
  }
  return { values, file: reach.file, complete };
}

function propertyOf(reach: DataReach, key: string): DataReach {
  const values: unknown[] = [];
  for (const value of reach.values) {
    if (isObject(value) && value.properties.has(key)) values.push(value.properties.get(key));
  }
  return { values, file: reach.file, complete: reach.complete };
}

/** The methods whose block's first parameter is each item of the array they're called on. */
const ITEM_FIRST = new Set(['map', 'filter', 'forEach', 'find', 'findIndex', 'some', 'every', 'flatMap', 'sort']);

/** How a name in an expression is found: its declaration, or null. */
export type NameLookup = (name: string) => Declaration | null;

/** Names as `scope` sees them: its own declarations, then the scopes around it. */
function lookupIn(scope: Scope | null): NameLookup {
  return (name) => {
    for (let at = scope; at; at = at.parent) {
      const decl = at.declarations.get(name);
      if (decl) return decl;
    }
    return null;
  };
}

/** How deep the walk follows names into the expressions that declare them. */
const MAX_DEPTH = 16;

/** The values a declared name holds in a data file, or null when it holds none. */
export function dataOfDeclaration(decl: Declaration, graph: ModuleGraph, depth = 0): DataReach | null {
  if (depth > MAX_DEPTH) return null;
  if (decl.kind === 'import') {
    if (!decl.importFrom?.data) return null;
    const resolved = resolveProjectPath(decl.importFrom.path, graph.entry);
    const file = resolved.ok ? graph.data?.get(resolved.path) : undefined;
    return file ? { values: [file.value], file: fileLabel(file.path), complete: true } : null;
  }
  const context = decl.typeContext;
  if (!context) return null;
  const from = (expr: Expression): DataReach | null => dataOfExpression(expr, lookupIn(decl.scope), graph, depth + 1);
  switch (context.kind) {
    case 'init':
      return from(context.expr);
    case 'loopElement': {
      const iterable = from(context.iterable);
      return iterable ? elementsOf(iterable) : null;
    }
    case 'objectProp': {
      const object = from(context.expr);
      return object ? propertyOf(object, context.key) : null;
    }
    case 'arrayElement': {
      const array = from(context.expr);
      if (!array) return null;
      const values = array.values.filter(isArray).map((a) => a.elements[context.index]);
      return { values: values.filter((v) => v !== undefined), file: array.file, complete: array.complete };
    }
    case 'blockParam': {
      const call = context.call;
      if (call.type !== 'MethodCallExpression') return null;
      const itemIndex = call.method === 'reduce' ? 1 : ITEM_FIRST.has(call.method) ? 0 : -1;
      if (context.index !== itemIndex) return null;
      const array = from(call.object);
      return array ? elementsOf(array) : null;
    }
    default:
      return null;
  }
}

/**
 * The values an expression reaches in a data file: a data import's name, a
 * key (`gear.radius`, `place["Population (2020)"]`), an item (`gears[0]`),
 * and names declared from them (a loop over the array, `let first = gears[0]`,
 * a block parameter of `.map`). Null when it reaches none.
 */
export function dataOfExpression(
  expr: Expression,
  lookup: NameLookup,
  graph: ModuleGraph,
  depth = 0,
): DataReach | null {
  if (depth > MAX_DEPTH) return null;
  switch (expr.type) {
    case 'Identifier': {
      const decl = lookup(expr.name);
      return decl ? dataOfDeclaration(decl, graph, depth + 1) : null;
    }
    case 'MemberExpression': {
      const object = dataOfExpression(expr.object, lookup, graph, depth + 1);
      return object ? propertyOf(object, expr.property) : null;
    }
    case 'IndexExpression': {
      const object = dataOfExpression(expr.object, lookup, graph, depth + 1);
      if (!object) return null;
      if (expr.index.type === 'StringLiteral') return propertyOf(object, expr.index.value);
      if (expr.index.type === 'NumberLiteral' && expr.index.unit === undefined) {
        const index = expr.index.value;
        const values = object.values.filter(isArray).map((a) => a.elements[index]);
        return { values: values.filter((v) => v !== undefined), file: object.file, complete: object.complete };
      }
      return elementsOf(object);
    }
    default:
      return null;
  }
}

/**
 * The receiver written before the `.` that ends `textBefore`, as an
 * expression: `gear` in `circle(gear.`, `places[0].at` in
 * `log(places[0].at.`. Names, dots and bracketed indexes only.
 */
export function receiverBeforeDot(textBefore: string): Expression | null {
  return textBefore.endsWith('.') ? chainEndingAt(textBefore.slice(0, -1)) : null;
}

/** How far back a chain may reach: past this, it isn't one a person wrote before a dot. */
const CHAIN_REACH = 2000;

function isNameChar(code: number): boolean {
  return (code >= 48 && code <= 57) || (code >= 65 && code <= 90) || (code >= 97 && code <= 122) || code === 95;
}

/**
 * The chain of names, dots and bracketed indexes that ends at offset `end` of
 * `source` (its end unless given), as an expression. Read backwards from
 * `end` in place, so each call costs only the chain's length: the editors
 * call it once for every key in a file.
 */
export function chainEndingAt(source: string, end = source.length): Expression | null {
  const limit = Math.max(0, end - CHAIN_REACH);
  let start = end;
  for (;;) {
    if (source.charCodeAt(start - 1) === 93 /* ] */) {
      // A bracketed index, balanced.
      let depth = 0;
      let at = start - 1;
      for (; at >= limit; at--) {
        const code = source.charCodeAt(at);
        if (code === 93) depth++;
        else if (code === 91 /* [ */ && --depth === 0) break;
      }
      if (at < limit) return null;
      start = at;
      continue;
    }
    let at = start;
    while (at > limit && isNameChar(source.charCodeAt(at - 1))) at--;
    // A name starts with a letter or `_`.
    while (at < start && source.charCodeAt(at) >= 48 && source.charCodeAt(at) <= 57) at++;
    if (at === start) break;
    start = at;
    if (source.charCodeAt(start - 1) !== 46 /* . */) break;
    start -= 1;
  }
  const text = source.slice(start, end);
  return text === '' ? null : parseExpression(text);
}

/**
 * The key a misspelled one most likely means: the nearest by edit distance,
 * within a third of its length (at least one edit). Null when none is that near.
 */
export function nearestKey(key: string, keys: Iterable<string>): string | null {
  const reach = Math.max(1, Math.floor(key.length / 3));
  let best: string | null = null;
  let bestDistance = Infinity;
  for (const candidate of keys) {
    const distance = levenshtein(key.toLowerCase(), candidate.toLowerCase());
    if (distance <= reach && distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}

/** The keys of the objects a reach holds, each with its first value's type. */
export function keysOfReach(reach: DataReach): Map<string, DataTypeLabel> {
  return reach.itemsOf ? itemKeys(reach.itemsOf) : keysOf(reach.values);
}

/** Words a key can't be read by with a dot: keywords, the value words, and `length` (an object's key count). */
const NOT_DOT_KEYS: ReadonlySet<string> = new Set([...KEYWORDS, 'as', 'true', 'false', 'null', 'length']);

/**
 * Whether a key reads with a dot (`gear.radius`) rather than brackets
 * (`place["Population (2020)"]`, `label["text"]`, `beam["length"]`):
 * docs/data-import.md "JSON".
 */
export function isDotKey(key: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(key) && !NOT_DOT_KEYS.has(key);
}

const allObjectsCache = new WeakMap<object, boolean>();

/** Whether every value a reach holds is an object (so a dot after it is a key). */
export function reachIsObjects(reach: DataReach): boolean {
  if (reach.values.length === 0) return false;
  if (!reach.itemsOf) return reach.values.every(isObject);
  let all = allObjectsCache.get(reach.itemsOf);
  if (all === undefined) {
    all = reach.itemsOf.elements.every(isObject);
    allObjectsCache.set(reach.itemsOf, all);
  }
  return all;
}
