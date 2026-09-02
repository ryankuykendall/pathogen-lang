import { describe, expect, it } from 'vitest';

import { compile, parse } from '../src';
import { compilePath } from './helpers';

describe('Parse errors', () => {
  describe('invalid syntax', () => {
    it('throws on unclosed parenthesis in calc', () => {
      expect(() => compilePath('M calc(10 + 5 0')).toThrow();
    });

    it('throws on unclosed brace in for loop', () => {
      expect(() => compilePath('for (i in 0..5) { M i 0')).toThrow();
    });

    it('throws on unclosed brace in if statement', () => {
      expect(() => compilePath('if (x > 0) { M 10 10')).toThrow();
    });

    it('throws on unclosed brace in function definition', () => {
      expect(() => compilePath('fn test() { M 0 0')).toThrow();
    });

    it('throws on missing semicolon in let declaration', () => {
      expect(() => compilePath('let x = 10 M x 0')).toThrow(/Missing ';' after let declaration/);
    });

    it('throws on invalid operator', () => {
      expect(() => compilePath('let x = 10 @ 5;')).toThrow();
    });

    it('throws on empty calc expression', () => {
      expect(() => compilePath('M calc() 0')).toThrow();
    });
  });

  describe('reserved words', () => {
    it('throws when using let as variable name', () => {
      expect(() => compilePath('let let = 10;')).toThrow();
    });

    it('throws when using for as variable name', () => {
      expect(() => compilePath('let for = 10;')).toThrow();
    });

    it('throws when using if as variable name', () => {
      expect(() => compilePath('let if = 10;')).toThrow();
    });

    it('throws when using fn as variable name', () => {
      expect(() => compilePath('let fn = 10;')).toThrow();
    });

    it('throws when using calc as variable name', () => {
      expect(() => compilePath('let calc = 10;')).toThrow();
    });
  });

  describe('Missing semicolon errors', () => {
    it('let declaration at EOF', () => {
      expect(() => compilePath('let x = 10')).toThrow(/Missing ';' after let declaration/);
    });

    it('let declaration followed by path command', () => {
      expect(() => compilePath('let x = 10\nM x 0')).toThrow(/Missing ';' after let declaration/);
    });

    it('points to end of statement, not start of next line', () => {
      expect(() => compilePath('let x = 10\nM x 0')).toThrow(/line 1, column 11/);
    });

    it('assignment followed by path command', () => {
      expect(() => compilePath('let x = 0;\nx = 5\nM 0 0')).toThrow(/Missing ';' after assignment/);
    });

    it('return statement missing semicolon', () => {
      expect(() => compilePath('fn test() { return 10 }\ntest()')).toThrow(/Missing ';' after return statement/);
    });

    it('indexed assignment missing semicolon', () => {
      expect(() => compilePath('let a = [1, 2];\na[0] = 5\nM 0 0')).toThrow(/Missing ';'/);
    });

    it('let with complex expression', () => {
      expect(() => compilePath('let x = (10 + 5) * 3\nM 0 0')).toThrow(/Missing ';' after let declaration/);
    });

    it('style declaration missing its trailing semicolon (strict)', () => {
      // The old regex silently dropped a `;`-less last declaration; it is now
      // a hard compile error with a position.
      expect(() =>
        compile("define PathLayer('a') ${ fill: none; stroke-width: 3 }\nlayer('a').apply { M 0 0 L 10 10 }"),
      ).toThrow(/Missing ';'/);
    });

    it('style declaration missing its colon', () => {
      expect(() =>
        compile("define PathLayer('a') ${ fill none; }\nlayer('a').apply { M 0 0 L 10 10 }"),
      ).toThrow(/Missing ':'/);
    });
  });

  describe('error messages include location', () => {
    it('includes line number in error', () => {
      try {
        compilePath('let x = 10;\nlet y = @;');
        expect.fail('Should have thrown');
      } catch (e) {
        expect((e as Error).message).toMatch(/line 2/i);
      }
    });

    it('includes column number in error', () => {
      try {
        compilePath('let x = @;');
        expect.fail('Should have thrown');
      } catch (e) {
        expect((e as Error).message).toMatch(/column/i);
      }
    });
  });
});

describe('Runtime errors', () => {
  describe('undefined variables', () => {
    it('throws on undefined variable in path command', () => {
      expect(() => compilePath('M x 0')).toThrow(/[Uu]ndefined variable.*x/);
    });

    it('throws on undefined variable in calc expression', () => {
      expect(() => compilePath('M calc(x + 10) 0')).toThrow(/[Uu]ndefined variable.*x/);
    });

    it('throws on undefined variable in function call', () => {
      expect(() => compilePath('circle(x, 100, 50);')).toThrow(/[Uu]ndefined variable.*x/);
    });

    it('throws on undefined function', () => {
      expect(() => compilePath('unknownFunc(10, 20);')).toThrow(/[Uu]ndefined/);
    });
  });

  describe('type errors', () => {
    it('throws on non-numeric operand to binary operator', () => {
      expect(() => compilePath('let s = circle(50, 50, 25); let x = calc(s + 1);')).toThrow(/numeric/i);
    });

    it('throws on non-numeric operand to unary operator', () => {
      expect(() => compilePath('let s = circle(50, 50, 25); let x = calc(-s);')).toThrow(/numeric/i);
    });
  });

  describe('function argument errors', () => {
    it('throws on wrong argument count for user function (too few)', () => {
      expect(() => compilePath('fn add(a, b) { M calc(a + b) 0 } add(1);')).toThrow(/expects 2 arguments.*got 1/i);
    });

    it('throws on wrong argument count for user function (too many)', () => {
      expect(() => compilePath('fn single(x) { M x 0 } single(1, 2, 3);')).toThrow(/expects 1 argument.*got 3/i);
    });
  });

  describe('for loop errors', () => {
    it('throws on non-numeric range start', () => {
      expect(() => compilePath('let s = circle(50, 50, 25); for (i in s..10) { M i 0 }')).toThrow(/numeric/i);
    });

    it('throws on non-numeric range end', () => {
      expect(() => compilePath('let s = circle(50, 50, 25); for (i in 0..s) { M i 0 }')).toThrow(/numeric/i);
    });
  });

  describe('runtime error locations', () => {
    it('undefined variable includes line and column', () => {
      expect(() => compilePath('let x = 10;\nM undefinedVar 0')).toThrow(
        /^Line 2, col 3: Undefined variable: undefinedVar$/,
      );
    });

    it('undeclared assignment includes line number', () => {
      expect(() => compilePath('let x = 10;\ny = 5;')).toThrow(/^Line 2: Cannot assign to undeclared variable: y$/);
    });

    it('wrong function argument count includes line number', () => {
      expect(() => compilePath('fn add(a, b) { M calc(a + b) 0 }\nadd(1);')).toThrow(
        /^Line 2, col 1: Function add expects 2 arguments, got 1$/,
      );
    });

    it('for-loop type error includes line number', () => {
      expect(() => compilePath('let s = circle(50, 50, 25);\nfor (i in s..10) { M i 0 }')).toThrow(
        /^Line 2: for loop range must be numeric$/,
      );
    });

    it('undefined variable in calc includes line and column', () => {
      expect(() => compilePath('let a = 1;\nlet b = 2;\nM calc(undefinedVar + 1) 0')).toThrow(
        /^Line 3, col 8: Undefined variable: undefinedVar$/,
      );
    });

    it('no "Line undefined:" in output for graceful degradation', () => {
      try {
        compilePath('M undefinedVar 0');
        expect.fail('Should have thrown');
      } catch (e) {
        const message = (e as Error).message;
        expect(message).not.toContain('Line undefined:');
        expect(message).toMatch(/Line 1, col 3: Undefined variable: undefinedVar/);
      }
    });
  });
});

describe('Null errors', () => {
  it('null in arithmetic throws descriptive error', () => {
    expect(() => compilePath('let x = null; let y = calc(x + 1);')).toThrow(/null.*arithmetic/i);
  });

  it('null in path argument throws descriptive error', () => {
    expect(() => compilePath('let x = null; M x 0')).toThrow(/null.*path argument/i);
  });

  it('unary operator on null throws', () => {
    expect(() => compilePath('let x = null; let y = calc(-x);')).toThrow(/null/i);
  });
});

describe('Array errors', () => {
  it('index out of bounds throws', () => {
    expect(() => compilePath('let list = [1, 2]; M list[5] 0')).toThrow(/out of bounds/i);
  });

  it('index on non-array throws', () => {
    expect(() => compilePath('let x = 5; M x[0] 0')).toThrow(/array/i);
  });

  it('non-numeric index throws', () => {
    expect(() => compilePath('let list = [1, 2]; let k = "foo"; M list[k] 0')).toThrow(/number/i);
  });

  it('unknown method throws', () => {
    expect(() => compilePath('let list = [1, 2]; let x = list.foo();')).toThrow(/unknown.*method/i);
  });

  it('for-each over non-array throws', () => {
    expect(() => compilePath('let x = 5; for (i in x) { M i 0 }')).toThrow(/array/i);
  });

  it('push with wrong arg count throws', () => {
    expect(() => compilePath('let list = []; list.push(1, 2);')).toThrow(/1 argument/i);
  });

  it('pop with wrong arg count throws', () => {
    expect(() => compilePath('let list = [1]; let x = list.pop(1);')).toThrow(/0 arguments/i);
  });

  it('method on non-array throws', () => {
    expect(() => compilePath('let x = 5; x.push(1);')).toThrow(/non-array/i);
  });

  it('bare sort on mixed-type array throws with comparator hint', () => {
    expect(() => compilePath('let r = [1, `a`].sort();')).toThrow(/all-number or all-string.*comparator|comparator/i);
  });

  it('bare sort on Point array throws', () => {
    expect(() => compilePath('let r = [Point(0, 0), Point(1, 1)].sort();')).toThrow(/all-number or all-string/i);
  });

  it('bare sort on array containing null throws', () => {
    expect(() => compilePath('let a = [1, 2]; a.push(null); let r = a.sort();')).toThrow(/all-number or all-string/i);
  });

  it('sort comparator returning a string throws', () => {
    expect(() => compilePath('let r = [1, 2].sort {|a, b| return `x`; };')).toThrow(/must return a number/i);
  });

  it('sort comparator returning a boolean throws', () => {
    expect(() => compilePath('let r = [1, 2].sort {|a, b| return a < b; };')).toThrow(/must return a number/i);
  });

  it('sort comparator with no return throws', () => {
    expect(() => compilePath('let r = [1, 2].sort {|a, b| log(a); };')).toThrow(/must return a number/i);
  });

  it('sort comparator returning NaN throws', () => {
    expect(() => compilePath('let r = [1, 2].sort {|a, b| return calc(a % 0); };')).toThrow(/must return a number/i);
  });

  it('bare sort on numeric array containing NaN throws', () => {
    expect(() => compilePath('let a = [3, 1]; a.push(calc(1 % 0)); let r = a.sort();')).toThrow(/NaN/);
  });

  it('sort with arguments throws', () => {
    expect(() => compilePath('let r = [1, 2].sort(1);')).toThrow(/does not take arguments/i);
  });

  it('reverse with arguments throws', () => {
    expect(() => compilePath('let r = [1, 2].reverse(1);')).toThrow(/0 arguments/i);
  });

  it('reverse with a trailing block throws', () => {
    expect(() => compilePath('let r = [1, 2].reverse() {|a| return a; };')).toThrow(/does not take a trailing block/i);
  });

  it('error inside sort comparator is wrapped with sort context', () => {
    expect(() => compilePath('let r = [1, 2].sort {|a, b| let x = undefinedVar; return 0; };')).toThrow(
      /sort\(\) comparator/i,
    );
  });

  it('filter without a block or worker throws', () => {
    expect(() => compilePath('let r = [1].filter();')).toThrow(
      /filter\(\) requires a trailing block or a << worker/i,
    );
  });

  it('filter with an argument besides the callback throws', () => {
    expect(() => compilePath('let r = [1].filter(5) {|n| return 1; };')).toThrow(
      /filter\(\) takes no arguments besides the callback/i,
    );
  });

  it('error inside filter callback is wrapped with index context', () => {
    expect(() => compilePath('let r = [1, 2].filter {|n| return undefinedVar; };')).toThrow(
      /Error in .filter\(\) callback at index 0/i,
    );
  });

  it('unknown array property still throws with method hint', () => {
    expect(() => compilePath('let list = [1]; M list.middle 0')).toThrow(
      /Property 'middle' does not exist on array/i,
    );
  });

  it('mutation during iteration reports the exact message with the slice hint', () => {
    expect(() => compilePath('let nums = [1, 2]; for (n in nums) { nums.push(9); }')).toThrow(
      /Cannot call push\(\) on an array while it is being iterated — callbacks and for-each bodies receive the array read-only\. Iterate a copy with \.slice\(0\) if you need to mutate\./,
    );
  });

  it('indexed assignment during iteration reports the exact message', () => {
    expect(() => compilePath('let nums = [1, 2]; for (n in nums) { nums[0] = 9; }')).toThrow(
      /Cannot assign to an element of an array while it is being iterated — callbacks and for-each bodies receive the array read-only\./,
    );
  });
});

describe('String errors', () => {
  it('index out of bounds throws', () => {
    expect(() => compilePath('let str = `abc`; let x = str[5];')).toThrow(/out of bounds/i);
  });

  it('negative index throws', () => {
    expect(() => compilePath('let str = `abc`; let x = str[-1];')).toThrow(/out of bounds/i);
  });

  it('non-integer index throws', () => {
    expect(() => compilePath('let str = `abc`; let x = str[1.5];')).toThrow(/out of bounds|integer/i);
  });

  it('unknown string method throws', () => {
    expect(() => compilePath('let str = `abc`; let x = str.foo();')).toThrow(/unknown.*method/i);
  });

  it('.append() with wrong arg count throws', () => {
    expect(() => compilePath('let str = `abc`; str.append();')).toThrow(/1 argument/i);
  });

  it('.prepend() with wrong arg count throws', () => {
    expect(() => compilePath('let str = `abc`; str.prepend();')).toThrow(/1 argument/i);
  });

  it('.includes() with wrong arg count throws', () => {
    expect(() => compilePath('let str = `abc`; str.includes();')).toThrow(/1 argument/i);
  });

  it('.slice() with wrong arg count throws', () => {
    expect(() => compilePath('let str = `abc`; str.slice(0);')).toThrow(/2 arguments/i);
  });

  it('.split() with args throws', () => {
    expect(() => compilePath('let str = `abc`; str.split("x");')).toThrow(/0 arguments/i);
  });

  it('.empty() with args throws', () => {
    expect(() => compilePath('let str = `abc`; str.empty(1);')).toThrow(/0 arguments/i);
  });
});

describe('Point errors', () => {
  it('Point() with wrong arg count throws', () => {
    expect(() => compilePath('let pt = Point(1);')).toThrow(/2 arguments/i);
  });

  it('Point() with no args throws', () => {
    expect(() => compilePath('let pt = Point();')).toThrow(/2 arguments/i);
  });

  it('Point() with three args throws', () => {
    expect(() => compilePath('let pt = Point(1, 2, 3);')).toThrow(/2 arguments/i);
  });

  it('Point() with non-numeric x throws', () => {
    expect(() => compilePath('let pt = Point("a", 1);')).toThrow(/number/i);
  });

  it('Point() with non-numeric y throws', () => {
    expect(() => compilePath('let pt = Point(1, "b");')).toThrow(/number/i);
  });

  it('accessing non-existent property on Point throws', () => {
    expect(() => compilePath('let pt = Point(1, 2); let z = pt.z;')).toThrow(/does not exist.*Point/i);
  });

  it('calling unknown method on Point throws', () => {
    expect(() => compilePath('let pt = Point(1, 2); let r = pt.foo();')).toThrow(/unknown.*method/i);
  });

  it('.translate() with wrong arg count throws', () => {
    expect(() => compilePath('let pt = Point(1, 2); pt.translate(1);')).toThrow(/2 arguments/i);
  });

  it('.midpoint() with non-Point arg throws', () => {
    expect(() => compilePath('let pt = Point(1, 2); pt.midpoint(5);')).toThrow(/Point/i);
  });

  it('.lerp() with non-Point first arg throws', () => {
    expect(() => compilePath('let pt = Point(1, 2); pt.lerp(5, 0.5);')).toThrow(/Point/i);
  });

  it('.lerp() with non-number t throws', () => {
    expect(() => compilePath('let p1 = Point(0, 0); let p2 = Point(1, 1); p1.lerp(p2, "half");')).toThrow(/number/i);
  });

  it('.rotate() with non-number angle throws', () => {
    expect(() => compilePath('let pt = Point(1, 0); let c = Point(0, 0); pt.rotate("x", c);')).toThrow(/number/i);
  });

  it('.rotate() with non-Point origin throws', () => {
    expect(() => compilePath('let pt = Point(1, 0); pt.rotate(90deg, 5);')).toThrow(/Point/i);
  });

  it('.distanceTo() with non-Point arg throws', () => {
    expect(() => compilePath('let pt = Point(0, 0); pt.distanceTo(5);')).toThrow(/Point/i);
  });

  it('.angleTo() with non-Point arg throws', () => {
    expect(() => compilePath('let pt = Point(0, 0); pt.angleTo(5);')).toThrow(/Point/i);
  });
});

describe('Edge cases', () => {
  describe('empty constructs', () => {
    it('handles single-value range', () => {
      // 0..0 is inclusive: just 0 (1 iteration)
      expect(compilePath('for (i in 0..0) { M i 0 }')).toBe('M 0 0');
    });

    it('handles single-value range with same start and end', () => {
      // 5..5 is inclusive: just 5 (1 iteration)
      expect(compilePath('for (i in 5..5) { M i 0 }')).toBe('M 5 0');
    });

    it('handles empty if body when condition is false', () => {
      expect(compilePath('let x = 0; if (x > 0) { M 10 10 }')).toBe('');
    });
  });

  describe('numeric edge cases', () => {
    it('handles very large numbers', () => {
      const result = compilePath('M 999999999 999999999');
      expect(result).toBe('M 999999999 999999999');
    });

    it('handles very small decimals', () => {
      const result = compilePath('M 0.0001 0.0001');
      expect(result).toBe('M 0.0001 0.0001');
    });

    it('handles negative zero', () => {
      const result = compilePath('M calc(0 * -1) 0');
      expect(result).toBe('M 0 0');
    });
  });

  describe('division and modulo', () => {
    it('handles division', () => {
      expect(compilePath('let d = calc(10 / 2); M d 0')).toBe('M 5 0');
    });

    it('handles modulo', () => {
      expect(compilePath('M calc(10 % 3) 0')).toBe('M 1 0');
    });

    it('handles division by zero (returns Infinity)', () => {
      const result = compilePath('let d = calc(10 / 0); M d 0');
      expect(result).toContain('Infinity');
    });

    it('handles modulo by zero (returns NaN)', () => {
      const result = compilePath('M calc(10 % 0) 0');
      expect(result).toContain('NaN');
    });
  });

  describe('angle unit mismatches', () => {
    it('throws when adding deg to plain number', () => {
      expect(() => compilePath('M calc(90deg + 5) 0')).toThrow(/Cannot add.*angle unit/);
    });

    it('throws when subtracting plain number from deg', () => {
      expect(() => compilePath('M calc(90deg - 5) 0')).toThrow(/Cannot subtract.*angle unit/);
    });

    it('throws when adding plain number to deg (reversed order)', () => {
      expect(() => compilePath('M calc(5 + 90deg) 0')).toThrow(/Cannot add.*angle unit/);
    });

    it('throws when adding deg to negative plain number', () => {
      expect(() => compilePath('M calc(90deg + -5) 0')).toThrow(/Cannot add.*angle unit/);
    });

    it('throws when multiplying two angle values', () => {
      expect(() => compilePath('M calc(90deg * 45deg) 0')).toThrow(/Cannot multiply.*angle/);
    });

    it('throws on nested angle arithmetic mixed with a plain number', () => {
      expect(() => compilePath('M calc((90deg * 2) + 5) 0')).toThrow(/Cannot add.*angle unit/);
    });

    it('allows scaling an angle by a plain number', () => {
      expect(compilePath('M calc(2 * 45deg) 0')).toMatch(/^M 1\.570/);
    });

    it('allows dividing two angle values (unitless ratio)', () => {
      expect(compilePath('M calc(90deg / 45deg) 0')).toBe('M 2 0');
    });

    // Unknowns (variables, calls) are never rejected — the check only fires
    // when both sides' units can be statically inferred from the source.
    it('never rejects a variable mixed with an angle literal', () => {
      expect(compilePath('let offset = 5; M calc(offset + 90deg) 0')).toMatch(/^M 6\.570/);
    });

    it('never rejects an angle literal mixed with a variable (reversed order)', () => {
      expect(compilePath('let offset = 5; M calc(90deg + offset) 0')).toMatch(/^M 6\.570/);
    });

    it('allows adding deg to deg', () => {
      const result = compilePath('M calc(90deg + 5deg) 0');
      expect(result).toMatch(/^M [\d.]+ 0$/);
    });

    it('allows adding rad to rad', () => {
      const result = compilePath('M calc(1rad + 0.5rad) 0');
      expect(result).toBe('M 1.5 0');
    });

    it('allows multiplying deg by plain number', () => {
      const result = compilePath('M calc(45deg * 2) 0');
      expect(result).toMatch(/^M [\d.]+ 0$/);
    });

    it('allows dividing deg by plain number', () => {
      const result = compilePath('let d = calc(90deg / 2); M d 0');
      expect(result).toMatch(/^M [\d.]+ 0$/);
    });

    it('allows adding negative deg to deg', () => {
      const result = compilePath('M calc(-45deg + 90deg) 0');
      expect(result).toMatch(/^M [\d.]+ 0$/);
    });

    it('allows function result plus plain number (no unit tracking through functions)', () => {
      // sin(90deg) returns 1 (dimensionless), so adding 0.5 is valid
      const result = compilePath('M calc(sin(90deg) + 0.5) 0');
      expect(result).toBe('M 1.5 0');
    });
  });

  describe('style block errors', () => {
    it('throws when using << with non-style-block left operand', () => {
      expect(() => compile('let x = 5 << \${ stroke: red; };')).toThrow();
    });

    it('throws when using << with non-style-block right operand', () => {
      expect(() => compile('let s = \${ stroke: red; }; let x = s << 5;')).toThrow();
    });

    it('throws when layer definition style is not a style block', () => {
      expect(() =>
        compile(`
        let x = 5;
        define PathLayer('test') x
        layer('test').apply { M 0 0 }
      `),
      ).toThrow();
    });

    it('throws when accessing non-existent property on style block', () => {
      expect(() =>
        compile(`
        let s = \${ stroke: red; };
        let x = s.nonExistent;
      `),
      ).toThrow();
    });
  });
});

describe('Method call error locations', () => {
  it('unknown PathBlock method includes line and column', () => {
    expect(() => compilePath('let b = @{ l 10 0 };\nb.foo();')).toThrow(
      /^Line 2, col 1: Unknown PathBlock method: foo$/,
    );
  });

  it('unknown ProjectedPath method includes line and column', () => {
    expect(() => compilePath('let b = @{ l 10 0 };\nlet p = b.project(0, 0);\np.foo();')).toThrow(
      /^Line 3, col 1: Unknown ProjectedPath method: foo$/,
    );
  });

  it('argument type error on method call includes line and column', () => {
    expect(() => compilePath('let b = @{ l 10 0 };\nb.get("x");')).toThrow(/^Line 2, col 1:.*must be a number$/);
  });

  it('unknown array method includes line and column', () => {
    expect(() => compilePath('let list = [1, 2];\nlist.foo();')).toThrow(/^Line 2, col 1:.*Unknown array method: foo$/);
  });

  it('unknown Point method includes line and column', () => {
    expect(() => compilePath('let pt = Point(1, 2);\npt.foo();')).toThrow(/^Line 2, col 1:.*Unknown Point method: foo$/);
  });

  it('unknown string method includes line and column', () => {
    expect(() => compilePath('let s = `hello`;\ns.foo();')).toThrow(/^Line 2, col 1:.*Unknown string method: foo$/);
  });
});

describe('Void function calls', () => {
  it('void function as bare statement does not throw', () => {
    // A user-defined function that doesn't return anything
    const result = compilePath('fn doNothing() { let x = 1; }\ndoNothing();');
    expect(result).toBe('');
  });

  it('void function with path commands still works', () => {
    const result = compilePath('fn setup() { let x = 1; }\nsetup();\nM 10 20');
    expect(result).toBe('M 10 20');
  });

  it('function with explicit return value still works normally', () => {
    const result = compilePath('fn makeCircle(r) { return circle(50, 50, r); }\nmakeCircle(25);');
    expect(result).toContain('M');
  });

  it('void function in layer apply block does not throw', () => {
    const result = compile(`
      define PathLayer('main') \${ stroke: black; }
      fn doNothing() { let x = 1; }
      layer('main').apply {
        doNothing();
        M 10 20
      }
    `);
    expect(result.layers.length).toBeGreaterThan(0);
  });
});

describe('Color literal errors', () => {
  it('rejects 5-digit hex literal', () => {
    expect(() => compile('let c = #abcde;')).toThrow(/Invalid hex color.*must be 3, 4, 6, or 8 hex digits/);
  });

  it('rejects 7-digit hex literal', () => {
    expect(() => compile('let c = #abcdef0;')).toThrow(/Invalid hex color.*must be 3, 4, 6, or 8 hex digits/);
  });
});

describe('Index expression errors include source location', () => {
  // Regression: IndexExpression and MemberExpression nodes were created
  // without `loc`, so runtime errors like array-OOB threw with no line
  // number. The error panel showed "Array index 7 out of bounds (length 7)"
  // and the user had to scan the whole file to find the offending lookup.

  it('reports line number for array-out-of-bounds reads', () => {
    const source = `let arr = [1, 2, 3];
let x = arr[5];`;
    expect(() => compile(source)).toThrow(/Line 2.*Array index 5 out of bounds \(length 3\)/);
  });

  it('reports line number for string-out-of-bounds reads', () => {
    const source = `let s = 'abc';
let c = s[10];`;
    expect(() => compile(source)).toThrow(/Line 2.*String index 10 out of bounds \(length 3\)/);
  });

  it('reports line number for non-numeric array index', () => {
    const source = `let arr = [1, 2, 3];
let x = arr['oops'];`;
    expect(() => compile(source)).toThrow(/Line 2.*Array index must be a number/);
  });

  describe('Grid errors', () => {
    it('throws on non-integer rows', () => {
      expect(() => compile('let g = Grid(2.5, 3, {});')).toThrow(/rows must be a positive integer/);
    });

    it('throws on zero or negative cols', () => {
      expect(() => compile('let g = Grid(3, 0, {});')).toThrow(/cols must be a positive integer/);
    });

    it('throws on get() out of bounds', () => {
      expect(() => compile('let g = Grid(2, 3, {}); g.get(5, 0);')).toThrow(/Grid\.get\(5, 0\) out of bounds for 2×3 grid/);
    });

    it('throws on set() out of bounds', () => {
      expect(() => compile('let g = Grid(2, 3, {}); g.set(0, 10, 1);')).toThrow(/Grid\.set\(0, 10\) out of bounds for 2×3 grid/);
    });

    it('throws on invalid outOfBounds option', () => {
      expect(() => compile("let g = Grid(2, 2, { outOfBounds: 'bounce' });")).toThrow(/outOfBounds must be 'clamp', 'wrap', or 'null'/);
    });

    it('throws on invalid interpolation option', () => {
      expect(() => compile("let g = Grid(2, 2, { interpolation: 'cubic' });")).toThrow(/interpolation must be 'nearest' or 'bilinear'/);
    });

    it('throws on sampleBilinear with non-numeric, non-Point cells', () => {
      expect(() => compile(`
        let g = Grid(2, 2, { xDim: 10, yDim: 10 }) {|grid|
          grid.set(0, 0, 'a'); grid.set(0, 1, 'b'); grid.set(1, 0, 'c'); grid.set(1, 1, 'd');
        };
        g.sampleBilinear(10, 10);
      `)).toThrow(/sampleBilinear\(\) requires cells to be numbers or Points/);
    });
  });
});

describe('break and continue placement errors', () => {
  it('rejects break and continue as variable names (reserved words)', () => {
    expect(() => compile('let break = 10;')).toThrow();
    expect(() => compile('let continue = 10;')).toThrow();
  });

  it('errors on continue outside any loop', () => {
    expect(() => compile('continue;')).toThrow(/'continue' is only valid inside a for loop/);
  });

  it('errors on break outside any loop with line/column', () => {
    expect(() => compile('let x = 1;\nbreak;')).toThrow(/line 2.*'break' is only valid inside a for loop/s);
  });

  it('errors on break in a fn body even when the fn is defined inside a loop', () => {
    expect(() => compile('for (i in 0..5) { fn f() { break; } }')).toThrow(
      /'break' is only valid inside a for loop/,
    );
  });

  it('errors on continue in a lambda body inside a loop', () => {
    expect(() => compile('for (i in 0..5) { let f = {|a| continue; }; }')).toThrow(
      /'continue' is only valid inside a for loop/,
    );
  });

  it('errors on break inside an apply block inside a loop (apply is a boundary)', () => {
    expect(() =>
      compile(`let gl = PathLayer('g');\nfor (i in 0..5) { gl.apply { break; } }`),
    ).toThrow(/'break' is only valid inside a for loop/);
  });

  it('errors on continue inside a path block inside a loop', () => {
    expect(() => compile('for (i in 0..5) { let pb = @{ continue; }; }')).toThrow(
      /'continue' is only valid inside a for loop/,
    );
  });

  it('errors on break in a Grid callback inside a loop', () => {
    expect(() =>
      compile('let g = Grid(2, 2);\nfor (i in 0..2) { g.fill {|x, y| break; }; }'),
    ).toThrow(/'break' is only valid inside a for loop/);
  });

  it('errors on break inside a switch case with no enclosing loop (with line/column)', () => {
    // A case body is loop-transparent: it neither provides a loop nor hides one.
    expect(() => compile('let x = 1;\nswitch (x) {\n  case 1 { break; }\n}')).toThrow(
      "Parse error at line 3, column 12: 'break' is only valid inside a for loop",
    );
  });

  it('errors on continue inside a switch default with no enclosing loop', () => {
    expect(() => compile('let x = 1;\nswitch (x) {\n  default { continue; }\n}')).toThrow(
      "Parse error at line 3, column 13: 'continue' is only valid inside a for loop",
    );
  });

  it('errors on break in a switch inside a fn body inside a loop (fn is a boundary)', () => {
    expect(() => compile('for (i in 0..5) { fn f(k) { switch (k) { case 1 { break; } } } }')).toThrow(
      /'break' is only valid inside a for loop/,
    );
  });

  it('errors on break in a path block inside a switch case inside a loop', () => {
    expect(() => compile('for (i in 0..5) { switch (i) { case 1 { let pb = @{ break; }; } } }')).toThrow(
      /'break' is only valid inside a for loop/,
    );
  });

  it('does not error on break inside a switch case inside a loop', () => {
    expect(compilePath('for (i in 0..5) { switch (i) { case 2 { break; } } M i 0 }')).toBe('M 0 0 M 1 0');
  });
});

describe('switch range pattern errors', () => {
  it('throws on non-numeric range bounds, reporting the switch line', () => {
    expect(() => compile('let sz = 3;\nswitch (sz) {\n  case "a".."b" { M 1 1 }\n}')).toThrow(
      'Line 2: Range pattern bounds must be numeric',
    );
  });

  it('throws when only one bound is non-numeric', () => {
    expect(() => compile('let sz = 3; switch (sz) { case 0.."z" { M 1 1 } }')).toThrow(
      'Line 1: Range pattern bounds must be numeric',
    );
    expect(() => compile('let sz = 3; switch (sz) { case Point(1, 2).. { M 1 1 } }')).toThrow(
      'Line 1: Range pattern bounds must be numeric',
    );
  });

  it('does not evaluate range bounds when the scrutinee is not numeric', () => {
    // A range never matches a string, so the bounds are never inspected.
    expect(compilePath('let s = "abc"; switch (s) { case "a".."b" { M 1 1 } default { M 3 3 } }')).toBe('M 3 3');
  });
});

describe('reserved unit-suffix names: pi, deg, rad (binding coverage matrix)', () => {
  const NAMES = ['pi', 'deg', 'rad'];
  // Every binding form the language has, one template per form.
  const BINDING_FORMS: Array<[string, (n: string) => string]> = [
    ['let declaration', (n) => `let ${n} = 1;`],
    ['let destructuring', (n) => `let p = Point(1, 2);\nlet [${n}, other] = [1, 2];`],
    ['for range variable', (n) => `for (${n} in 0..2) { M 0 0 }`],
    ['for-in variable', (n) => `for (${n} in [1, 2]) { M 0 0 }`],
    ['for-in pair variable', (n) => `for ([${n}, i] in [1, 2]) { M 0 0 }`],
    ['for-in index variable', (n) => `for ([x, ${n}] in [1, 2]) { M 0 0 }`],
    ['fn name', (n) => `fn ${n}(len) { h calc(len) }`],
    ['fn parameter', (n) => `fn f(${n}) { h 1 }\nM 0 0\nf(1);`],
    ['lambda parameter', (n) => `let arr = [1];\nlet out = arr.map {|${n}| return 1; };`],
  ];
  for (const name of NAMES) {
    for (const [form, tpl] of BINDING_FORMS) {
      it(`rejects '${name}' as a ${form}`, () => {
        expect(() => compile(tpl(name))).toThrow(/reserved.*unit suffix/s);
      });
    }
  }

  it('rejects the names in annotated mode too (no F2-style divergence)', async () => {
    const { compileAnnotated } = await import('../src');
    for (const name of NAMES) {
      expect(() => compileAnnotated(`let ${name} = 1;`)).toThrow(/reserved.*unit suffix/s);
      expect(() => compileAnnotated(`for (${name} in 0..2) { M 0 0 }`)).toThrow(/reserved.*unit suffix/s);
      expect(() => compileAnnotated(`fn ${name}(len) { h calc(len) }`)).toThrow(/reserved.*unit suffix/s);
    }
  });

  it('standalone reference errors name the suffix rule, per name', () => {
    expect(() => compile('M 0 0\nL calc(pi) 40')).toThrow(/unit suffix.*0\.5pi.*PI\(\)/s);
    expect(() => compile('M 0 0\nL calc(deg) 40')).toThrow(/unit suffix.*90deg.*deg\(/s);
    expect(() => compile('M 0 0\nL calc(rad) 40')).toThrow(/unit suffix.*rad.*rad\(/s);
    expect(() => compile('let x = deg;')).toThrow(/unit suffix/);
  });

  it('standalone reference in bare path-argument position errors too', () => {
    expect(() => compile('M 0 0\nh deg')).toThrow(/unit suffix/);
  });

  it('annotated mode rejects standalone references identically', async () => {
    const { compileAnnotated } = await import('../src');
    expect(() => compileAnnotated('M 0 0\nL calc(pi) 40')).toThrow(/unit suffix/);
    expect(() => compileAnnotated('let x = deg;')).toThrow(/unit suffix/);
  });

  it('call position and suffix position stay legal', () => {
    const result = compile('let a = deg(PI());\nlet b = rad(180);\nlet c = 90deg;\nM 0 0\nL calc(a) calc(b)');
    expect(result.layers[0].data).toBe('M 0 0 L 180 3.141592653589793');
  });

  it('Angle member properties .pi/.deg/.rad stay legal (member position, not identifiers)', () => {
    const result = compile('let a = 90deg;\nM 0 0\nL calc(a.pi * 100) calc(a.deg)');
    expect(result.layers[0].data).toBe('M 0 0 L 50 90');
  });
});
