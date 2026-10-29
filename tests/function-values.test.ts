/**
 * A function value used where a number is expected (docs/stdlib.md
 * "Constants", docs/debug.md "Output Format"). `PI` without its parentheses
 * names the function: `log(PI)` used to print its JavaScript source
 * (`()=>Math.PI`), `-PI` said only "Unary operator - requires numeric
 * operand", `sin(PI)` quietly returned NaN, and `heading(PI)` put JS source
 * in its message. Each site now names the function and shows the call.
 *
 * A function stays a value — `let f = sin; f(0.5)` still works — so only the
 * places that need a number change.
 */
import { describe, expect, it } from 'vitest';

import { compile } from '../src';

function logs(source: string): string[] {
  return compile(source).logs.map((entry) => entry.parts.map((p) => String(p.value)).join(' '));
}

// π as an angle is `1pi` (π/2 would be `0.5pi`).
const PI_HINT = '`PI` is a function, not a number — call it: `PI()` (or, for an angle, write `1pi`)';

describe('function values: display', () => {
  it.each([
    ['log() of a constant', 'log(PI);', 'StdlibFunction(PI)'],
    ['a template', 'log(`pi is ${PI}`);', 'pi is StdlibFunction(PI)'],
    ['a variable holding a stdlib function', 'let f = sin;\nlog(f);', 'StdlibFunction(sin)'],
    ['a user fn (unchanged)', 'fn double(x) { return calc(x * 2); }\nlog(double);', 'Function(x)'],
    ['a lambda (unchanged)', 'let half = {|x| x / 2};\nlog(half);', 'Lambda(x)'],
  ])('%s', (_, source, expected) => {
    expect(logs(source)).toEqual([expected]);
  });

  it('a stdlib function held in a variable can still be called', () => {
    expect(logs('let f = sin;\nlog(f(0.5));')).toEqual(['0.479425538604203']);
  });
});

describe('function values: used as a number', () => {
  it.each([
    ['unary -', 'log(-PI);'],
    ['unary !', 'log(!PI);'],
    ['/ (left side)', 'log(PI / 2);'],
    ['* (right side)', 'log(2 * PI);'],
    ['a comparison', 'log(PI > 3);'],
    ['==', 'log(PI == 3);'],
    ['inside calc()', 'log(calc(PI * 2));'],
    ['-PI/2 (the old blog spelling)', 'log(-PI/2);'],
  ])('%s names the function and shows the call', (_, source) => {
    expect(() => compile(source)).toThrow(`Line 1: ${PI_HINT}`);
  });

  it.each([
    ['TAU', 'log(TAU / 4);', '`TAU` is a function, not a number — call it: `TAU()` (or, for an angle, write `2pi`)'],
    ['E', 'log(E * 2);', '`E` is a function, not a number — call it: `E()`'],
    ['a function with parameters', 'log(sin + 1);', '`sin` is a function, not a number — call it: `sin(…)`'],
    ['an alias keeps its own name', 'let f = PI;\nlog(-f);', '`f` is a function, not a number — call it: `f()`'],
    [
      'a user fn with no parameters',
      'fn two() { return 2; }\nlog(-two);',
      '`two` is a function, not a number — call it: `two()`',
    ],
    ['a lambda', 'let half = {|x| x / 2};\nlog(half * 2);', '`half` is a function, not a number — call it: `half(…)`'],
    // `()` only for an empty parameter list: a rest parameter (the splines,
    // the grids) also reports length 0, and a native function its real arity.
    ['a zero-argument function', 'log(random + 1);', '`random` is a function, not a number — call it: `random()`'],
    [
      'a rest-parameter function',
      'log(-cubicSpline);',
      '`cubicSpline` is a function, not a number — call it: `cubicSpline(…)`',
    ],
    ['a native function', 'log(-sqrt);', '`sqrt` is a function, not a number — call it: `sqrt(…)`'],
  ])('%s', (_, source, message) => {
    const line = source.split('\n').length;
    expect(() => compile(source)).toThrow(`Line ${line}: ${message}`);
  });

  it('other non-numbers keep the old message', () => {
    expect(() => compile('let x = "a" * 2;')).toThrow('Binary operator * requires numeric operands');
    expect(() => compile('let p = Point(1, 2);\nlet x = -p;')).toThrow('Unary operator - requires numeric operand');
  });
});

describe('function values: passed to a standard-library function', () => {
  it.each([
    ['a math function', 'log(sin(PI));', 'Line 1, col 5: sin(): argument 1'],
    ['a path function', 'circle(PI, 0, 10);', 'Line 1, col 1: circle(): argument 1'],
    ['a context-aware function', 'M 0 0\npolarLine(PI, 10);', 'Line 2, col 1: polarLine(): argument 1'],
    ['heading()', 'M 0 0\nheading(PI);', 'Line 2, col 1: heading(): argument 1'],
  ])('%s: an error naming the argument, not NaN', (_, source, prefix) => {
    expect(() => compile(source)).toThrow(
      `${prefix} (\`PI\`) is a function, not a number — call it: \`PI()\` (or, for an angle, write \`1pi\`)`,
    );
  });

  it('names a later argument by its position', () => {
    expect(() => compile('circle(50, 50, sqrt);')).toThrow(
      'Line 1, col 1: circle(): argument 3 (`sqrt`) is a function, not a number — call it: `sqrt(…)`',
    );
  });
});
