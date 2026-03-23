import { describe, expect, it } from 'vitest';

import { compile } from '../src';
import { compilePath } from './helpers';

describe('Objects', () => {
  describe('literals', () => {
    it('creates an empty object', () => {
      const result = compile('let obj = {}; log(obj);');
      expect(result.logs[0].parts[0].value).toBe('{}');
    });

    it('creates an object with a single property', () => {
      const result = compile('let obj = { x: 10 }; log(obj);');
      expect(result.logs[0].parts[0].value).toBe('{x: 10}');
    });

    it('creates an object with multiple properties', () => {
      const result = compile("let obj = { name: 'Dave', age: 32 }; log(obj);");
      expect(result.logs[0].parts[0].value).toBe('{name: Dave, age: 32}');
    });

    it('allows trailing commas', () => {
      const result = compile('let obj = { x: 1, y: 2, }; log(obj);');
      expect(result.logs[0].parts[0].value).toBe('{x: 1, y: 2}');
    });

    it('supports nested objects', () => {
      const result = compile('let obj = { center: { x: 10, y: 20 } }; log(obj.center);');
      expect(result.logs[0].parts[0].value).toBe('{x: 10, y: 20}');
    });

    it('supports arrays as values', () => {
      const result = compile('let obj = { items: [1, 2, 3] }; log(obj.items);');
      expect(result.logs[0].parts[0].value).toBe('[1, 2, 3]');
    });

    it('supports string literal keys', () => {
      const result = compile("let obj = { 'first-name': 'Alice' }; log(obj['first-name']);");
      expect(result.logs[0].parts[0].value).toBe('Alice');
    });

    it('supports expression values', () => {
      const result = compile('let x = 5; let obj = { val: x * 2 }; log(obj.val);');
      expect(result.logs[0].parts[0].value).toBe('10');
    });
  });

  describe('read access', () => {
    it('reads via dot notation', () => {
      const result = compile('let obj = { x: 42 }; log(obj.x);');
      expect(result.logs[0].parts[0].value).toBe('42');
    });

    it('reads via bracket notation', () => {
      const result = compile("let obj = { x: 42 }; log(obj['x']);");
      expect(result.logs[0].parts[0].value).toBe('42');
    });

    it('returns null for missing key (dot notation)', () => {
      const result = compile('let obj = { x: 1 }; log(obj.y);');
      expect(result.logs[0].parts[0].value).toBe('null');
    });

    it('returns null for missing key (bracket notation)', () => {
      const result = compile("let obj = { x: 1 }; log(obj['y']);");
      expect(result.logs[0].parts[0].value).toBe('null');
    });

    it('supports dynamic key expression', () => {
      const result = compile("let obj = { x: 10, y: 20 }; let key = 'y'; log(obj[key]);");
      expect(result.logs[0].parts[0].value).toBe('20');
    });

    it('reads nested properties via chained dot notation', () => {
      const result = compile('let obj = { a: { b: 99 } }; log(obj.a.b);');
      expect(result.logs[0].parts[0].value).toBe('99');
    });

    it('reads length property', () => {
      const result = compile('let obj = { a: 1, b: 2, c: 3 }; log(obj.length);');
      expect(result.logs[0].parts[0].value).toBe('3');
    });

    it('uses object properties in path commands', () => {
      expect(compilePath('let p = { x: 50, y: 80 }; M p.x p.y')).toBe('M 50 80');
    });
  });

  describe('write access', () => {
    it('sets a new property via bracket assignment', () => {
      const result = compile("let obj = {}; obj['x'] = 10; log(obj.x);");
      expect(result.logs[0].parts[0].value).toBe('10');
    });

    it('overwrites an existing property', () => {
      const result = compile("let obj = { x: 1 }; obj['x'] = 99; log(obj.x);");
      expect(result.logs[0].parts[0].value).toBe('99');
    });

    it('adds a new key to an existing object', () => {
      const result = compile("let obj = { x: 1 }; obj['y'] = 2; log(obj);");
      expect(result.logs[0].parts[0].value).toBe('{x: 1, y: 2}');
    });

    it('assigns array elements via indexed assignment', () => {
      const result = compile('let arr = [1, 2, 3]; arr[0] = 99; log(arr);');
      expect(result.logs[0].parts[0].value).toBe('[99, 2, 3]');
    });
  });

  describe('has()', () => {
    it('returns true for existing key', () => {
      const result = compile("let obj = { x: 10 }; log(obj.has('x'));");
      expect(result.logs[0].parts[0].value).toBe('true');
    });

    it('returns false for missing key', () => {
      const result = compile("let obj = { x: 10 }; log(obj.has('y'));");
      expect(result.logs[0].parts[0].value).toBe('false');
    });
  });

  describe('Object namespace', () => {
    it('Object.keys returns array of keys', () => {
      const result = compile('let obj = { a: 1, b: 2 }; log(Object.keys(obj));');
      expect(result.logs[0].parts[0].value).toBe('[a, b]');
    });

    it('Object.values returns array of values', () => {
      const result = compile('let obj = { a: 1, b: 2 }; log(Object.values(obj));');
      expect(result.logs[0].parts[0].value).toBe('[1, 2]');
    });

    it('Object.entries returns array of [key, value] pairs', () => {
      const result = compile('let obj = { a: 1, b: 2 }; log(Object.entries(obj));');
      expect(result.logs[0].parts[0].value).toBe('[[a, 1], [b, 2]]');
    });

    it('Object.delete removes a key and returns value', () => {
      const result = compile(
        "let obj = { x: 10, y: 20 }; let deleted = Object.delete(obj, 'x'); log(deleted); log(obj);",
      );
      expect(result.logs[0].parts[0].value).toBe('10');
      expect(result.logs[1].parts[0].value).toBe('{y: 20}');
    });

    it('Object.delete returns null for missing key', () => {
      const result = compile("let obj = { x: 10 }; let deleted = Object.delete(obj, 'z'); log(deleted);");
      expect(result.logs[0].parts[0].value).toBe('null');
    });

    it('iterates Object.keys in for-each', () => {
      const result = compile('let obj = { a: 1, b: 2 }; for (key in Object.keys(obj)) { log(key); }');
      expect(result.logs[0].parts[0].value).toBe('a');
      expect(result.logs[1].parts[0].value).toBe('b');
    });

    it('iterates Object.entries with element and index', () => {
      const result = compile(
        'let obj = { a: 1, b: 2 }; for ([entry, i] in Object.entries(obj)) { log(entry[0], entry[1], i); }',
      );
      expect(result.logs[0].parts[0].value).toBe('a');
      expect(result.logs[0].parts[1].value).toBe('1');
      expect(result.logs[0].parts[2].value).toBe('0');
      expect(result.logs[1].parts[0].value).toBe('b');
      expect(result.logs[1].parts[1].value).toBe('2');
      expect(result.logs[1].parts[2].value).toBe('1');
    });
  });

  describe('for-each with objects', () => {
    it('iterates keys with single variable', () => {
      const result = compile('let obj = { x: 10, y: 20 }; for (key in obj) { log(key); }');
      expect(result.logs[0].parts[0].value).toBe('x');
      expect(result.logs[1].parts[0].value).toBe('y');
    });

    it('iterates key-value pairs with destructuring', () => {
      const result = compile('let obj = { x: 10, y: 20 }; for ([k, v] in obj) { log(k, v); }');
      expect(result.logs[0].parts[0].value).toBe('x');
      expect(result.logs[0].parts[1].value).toBe('10');
      expect(result.logs[1].parts[0].value).toBe('y');
      expect(result.logs[1].parts[1].value).toBe('20');
    });
  });

  describe('for-in always binds element + index', () => {
    it('binds element and index for scalar elements', () => {
      const result = compile('let arr = [10, 20, 30]; for ([item, idx] in arr) { log(item, idx); }');
      expect(result.logs[0].parts[0].value).toBe('10');
      expect(result.logs[0].parts[1].value).toBe('0');
      expect(result.logs[1].parts[0].value).toBe('20');
      expect(result.logs[1].parts[1].value).toBe('1');
    });

    it('binds array element and index for nested arrays', () => {
      const result = compile('let pairs = [[1, 2], [3, 4]]; for ([a, b] in pairs) { log(a, b); }');
      expect(result.logs[0].parts[0].value).toBe('[1, 2]');
      expect(result.logs[0].parts[1].value).toBe('0');
      expect(result.logs[1].parts[0].value).toBe('[3, 4]');
      expect(result.logs[1].parts[1].value).toBe('1');
    });
  });

  describe('reference semantics', () => {
    it('mutations are visible through aliases', () => {
      const result = compile("let a = { x: 1 }; let b = a; b['x'] = 99; log(a.x);");
      expect(result.logs[0].parts[0].value).toBe('99');
    });

    it('mutations via function are visible to caller', () => {
      const result = compile("fn setKey(obj) { obj['val'] = 42; return 0; } let o = {}; setKey(o); log(o.val);");
      expect(result.logs[0].parts[0].value).toBe('42');
    });
  });

  describe('merge (<<)', () => {
    it('merges two objects with non-overlapping keys', () => {
      const result = compile('let a = {x: 1}; let b = {y: 2}; let c = a << b; log(c);');
      expect(result.logs[0].parts[0].value).toBe('{x: 1, y: 2}');
    });

    it('right-side wins on key conflicts', () => {
      const result = compile('let a = {x: 1, y: 2}; let b = {y: 99, z: 3}; let c = a << b; log(c);');
      expect(result.logs[0].parts[0].value).toBe('{x: 1, y: 99, z: 3}');
    });

    it('does not mutate the original objects', () => {
      const result = compile('let a = {x: 1}; let b = {y: 2}; let c = a << b; log(a); log(b);');
      expect(result.logs[0].parts[0].value).toBe('{x: 1}');
      expect(result.logs[1].parts[0].value).toBe('{y: 2}');
    });

    it('chains multiple merges left-to-right', () => {
      const result = compile('let a = {x: 1}; let b = {y: 2}; let c = {z: 3}; let d = a << b << c; log(d);');
      expect(result.logs[0].parts[0].value).toBe('{x: 1, y: 2, z: 3}');
    });

    it('chained merge with progressive override', () => {
      const result = compile('let a = {v: 1}; let b = {v: 2}; let c = {v: 3}; let d = a << b << c; log(d.v);');
      expect(result.logs[0].parts[0].value).toBe('3');
    });

    it('merging with empty object returns equivalent copy', () => {
      const result = compile('let a = {x: 1, y: 2}; let b = a << {}; log(b);');
      expect(result.logs[0].parts[0].value).toBe('{x: 1, y: 2}');
    });

    it('empty object absorbs all properties from right', () => {
      const result = compile('let a = {}; let b = {x: 1, y: 2}; let c = a << b; log(c);');
      expect(result.logs[0].parts[0].value).toBe('{x: 1, y: 2}');
    });

    it('shallow merge shares nested object references', () => {
      const result = compile(`
        let inner = {val: 1};
        let a = {nested: inner};
        let b = a << {};
        b.nested['val'] = 99;
        log(a.nested.val);
      `);
      expect(result.logs[0].parts[0].value).toBe('99');
    });

    it('merged object is independent from sources for top-level keys', () => {
      const result = compile(`
        let a = {x: 1};
        let b = a << {y: 2};
        b['x'] = 99;
        log(a.x);
      `);
      expect(result.logs[0].parts[0].value).toBe('1');
    });

    it('preserves mixed value types across merge', () => {
      const result = compile(`
        let a = {n: 42, s: 'hello'};
        let b = {arr: [1, 2], flag: true};
        let c = a << b;
        log(c.n); log(c.s); log(c.arr); log(c.flag);
      `);
      expect(result.logs[0].parts[0].value).toBe('42');
      expect(result.logs[1].parts[0].value).toBe('hello');
      expect(result.logs[2].parts[0].value).toBe('[1, 2]');
      expect(result.logs[3].parts[0].value).toBe('true');
    });
  });

  describe('error cases', () => {
    it('throws for non-string key in bracket access', () => {
      expect(() => compile('let obj = { x: 1 }; log(obj[42]);')).toThrow('Object key must be a string');
    });

    it('throws for non-string key in bracket assignment', () => {
      expect(() => compile('let obj = {}; obj[42] = 1;')).toThrow('Object key must be a string');
    });

    it('throws for has() with wrong argument type', () => {
      expect(() => compile('let obj = {}; obj.has(42);')).toThrow('has() argument must be a string');
    });

    it('throws for unknown method on object', () => {
      expect(() => compile('let obj = {}; obj.foo();')).toThrow('Unknown object method: foo');
    });
  });
});
