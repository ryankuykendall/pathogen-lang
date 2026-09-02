import { describe, expect, it } from 'vitest';

import { isTruthy, toNumber, valuesEqual } from '../src/evaluator/value-semantics';

import type { AngleValue, ArrayValue, BooleanValue, ObjectValue, PointValue } from '../src/evaluator/types';

// One implementation of `==`, truthiness, and numeric coercion is shared by
// `if`, `? :`, `where` guards, `case` matching, and both evaluators. These
// tables pin the three tiers so `case` and `==` cannot drift apart.

const TRUE: BooleanValue = { type: 'BooleanValue', value: 1 };
const FALSE: BooleanValue = { type: 'BooleanValue', value: 0 };
const deg = (degrees: number): AngleValue => ({ type: 'AngleValue', radians: (degrees * Math.PI) / 180, unit: 'deg' });
const rad = (radians: number): AngleValue => ({ type: 'AngleValue', radians, unit: 'rad' });
const point = (x: number, y: number): PointValue => ({ type: 'PointValue', x, y });
const array = (...elements: number[]): ArrayValue => ({ type: 'ArrayValue', elements });
const object = (entries: Record<string, number>): ObjectValue => ({
  type: 'ObjectValue',
  properties: new Map(Object.entries(entries)),
});

describe('value-semantics', () => {
  describe('toNumber', () => {
    const cases: [string, unknown, number | undefined][] = [
      ['number passes through', 7, 7],
      ['zero passes through', 0, 0],
      ['negative number passes through', -2.5, -2.5],
      ['true is 1', TRUE, 1],
      ['false is 0', FALSE, 0],
      ['angle is its radians', deg(180), Math.PI],
      ['zero angle is 0', deg(0), 0],
      ['string is not numeric', '1', undefined],
      ['empty string is not numeric', '', undefined],
      ['null is not numeric', null, undefined],
      ['Point is not numeric', point(1, 2), undefined],
      ['array is not numeric', array(1), undefined],
      ['object is not numeric', object({ a: 1 }), undefined],
    ];
    it.each(cases)('%s', (_name, input, expected) => {
      expect(toNumber(input)).toBe(expected);
    });
  });

  describe('valuesEqual', () => {
    const cases: [string, unknown, unknown, boolean | undefined][] = [
      // Tier 1: null equals only null
      ['null == null', null, null, true],
      ['null != 0', null, 0, false],
      ['0 != null', 0, null, false],
      ['null != ""', null, '', false],
      ['null != false', null, FALSE, false],
      // Tier 2: strings and booleans compare as strings
      ['equal strings', 'abc', 'abc', true],
      ['different strings', 'abc', 'abd', false],
      ['"true" == true', 'true', TRUE, true],
      ['"false" == false', 'false', FALSE, true],
      ['"true" != false', 'true', FALSE, false],
      ['true == "true" (reversed operands)', TRUE, 'true', true],
      // Tier 3: everything toNumber understands compares numerically
      ['equal numbers', 5, 5, true],
      ['different numbers', 5, 6, false],
      ['true == 1', TRUE, 1, true],
      ['1 == true (reversed operands)', 1, TRUE, true],
      ['false == 0', FALSE, 0, true],
      ['true != 0', TRUE, 0, false],
      ['true == true', TRUE, TRUE, true],
      ['equal angles in different units', deg(180), rad(Math.PI), true],
      ['different angles', deg(90), deg(180), false],
      ['angle == its radians as a number', rad(1.5), 1.5, true],
      ['0deg == 0', deg(0), 0, true],
      // Not comparable at all
      ['"1" vs 1', '1', 1, undefined],
      ['1 vs "1" (reversed operands)', 1, '1', undefined],
      ['Point vs number', point(1, 2), 1, undefined],
      ['equal Points are not value-comparable', point(1, 2), point(1, 2), undefined],
      ['arrays are not comparable', array(1), array(1), undefined],
      ['objects are not comparable', object({ a: 1 }), object({ a: 1 }), undefined],
      ['string vs Point', 'abc', point(1, 2), undefined],
    ];
    it.each(cases)('%s', (_name, a, b, expected) => {
      expect(valuesEqual(a, b)).toBe(expected);
    });
  });

  describe('isTruthy', () => {
    const cases: [string, unknown, boolean][] = [
      ['null is falsy', null, false],
      ['0 is falsy', 0, false],
      ['-0 is falsy', -0, false],
      ['non-zero number is truthy', 3, true],
      ['negative number is truthy', -1, true],
      ['empty string is falsy', '', false],
      ['non-empty string is truthy', 'a', true],
      ['"0" is truthy (a string, not a number)', '0', true],
      ['"false" is truthy (a string, not a boolean)', 'false', true],
      ['false is falsy', FALSE, false],
      ['true is truthy', TRUE, true],
      ['0deg is falsy', deg(0), false],
      ['0 radians is falsy', rad(0), false],
      ['90deg is truthy', deg(90), true],
      ['empty array is truthy', array(), true],
      ['array is truthy', array(0), true],
      ['empty object is truthy', object({}), true],
      ['Point(0, 0) is truthy', point(0, 0), true],
    ];
    it.each(cases)('%s', (_name, input, expected) => {
      expect(isTruthy(input)).toBe(expected);
    });
  });
});
