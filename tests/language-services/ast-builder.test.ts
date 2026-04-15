import { describe, it, expect } from 'vitest';
import { parser } from '../../src/parser/pathogen.generated';
import { buildAST } from '../../src/parser/ast-builder';

function lezerParse(source: string) {
  const tree = parser.parse(source);
  return buildAST(tree, source);
}

describe('Lezer AST Builder', () => {
  describe('basic statements', () => {
    it('parses let declaration', () => {
      const ast = lezerParse('let x = 10;');
      expect(ast.body).toHaveLength(1);
      expect(ast.body[0].type).toBe('LetDeclaration');
      const decl = ast.body[0] as any;
      expect(decl.name).toBe('x');
      expect(decl.value.type).toBe('NumberLiteral');
      expect(decl.value.value).toBe(10);
    });

    it('parses let with binary expression', () => {
      const ast = lezerParse('let y = 10 + 20;');
      const decl = ast.body[0] as any;
      expect(decl.value.type).toBe('BinaryExpression');
      expect(decl.value.operator).toBe('+');
    });

    it('parses assignment', () => {
      const ast = lezerParse('x = 42;');
      expect(ast.body[0].type).toBe('AssignmentStatement');
      const assign = ast.body[0] as any;
      expect(assign.name).toBe('x');
      expect(assign.value.value).toBe(42);
    });

    it('parses return statement', () => {
      const ast = lezerParse('fn f() { return 42; }');
      const fn = ast.body[0] as any;
      expect(fn.body[0].type).toBe('ReturnStatement');
      expect(fn.body[0].value.value).toBe(42);
    });
  });

  describe('control flow', () => {
    it('parses for-range loop', () => {
      const ast = lezerParse('for (i in 0..5) { M i 0 }');
      expect(ast.body[0].type).toBe('ForLoop');
      const loop = ast.body[0] as any;
      expect(loop.variable).toBe('i');
      expect(loop.start.value).toBe(0);
      expect(loop.end.value).toBe(5);
      expect(loop.body).toHaveLength(1);
      expect(loop.body[0].type).toBe('PathCommand');
    });

    it('parses if/else', () => {
      const ast = lezerParse('if (x > 0) { M 10 10 } else { M 0 0 }');
      expect(ast.body[0].type).toBe('IfStatement');
      const ifStmt = ast.body[0] as any;
      expect(ifStmt.condition.type).toBe('BinaryExpression');
      expect(ifStmt.consequent).toHaveLength(1);
      expect(ifStmt.alternate).toHaveLength(1);
    });

    it('parses function definition', () => {
      const ast = lezerParse('fn draw(cx, cy) { circle(cx, cy, 50) }');
      expect(ast.body[0].type).toBe('FunctionDefinition');
      const fn = ast.body[0] as any;
      expect(fn.name).toBe('draw');
      expect(fn.params).toEqual(['cx', 'cy']);
      expect(fn.body).toHaveLength(1);
    });
  });

  describe('path commands', () => {
    it('parses M with numeric args', () => {
      const ast = lezerParse('M 10 20');
      expect(ast.body[0].type).toBe('PathCommand');
      const cmd = ast.body[0] as any;
      expect(cmd.command).toBe('M');
      expect(cmd.args).toHaveLength(2);
      expect(cmd.args[0].value).toBe(10);
      expect(cmd.args[1].value).toBe(20);
    });

    it('parses multiple path commands', () => {
      const ast = lezerParse('M 10 20 L 30 40 Z');
      expect(ast.body).toHaveLength(3);
      expect((ast.body[0] as any).command).toBe('M');
      expect((ast.body[1] as any).command).toBe('L');
      expect((ast.body[2] as any).command).toBe('Z');
    });

    it('parses path command with identifier args', () => {
      const ast = lezerParse('M x y');
      const cmd = ast.body[0] as any;
      expect(cmd.args).toHaveLength(2);
      expect(cmd.args[0].type).toBe('Identifier');
      expect(cmd.args[0].name).toBe('x');
    });

    it('parses Z with no args', () => {
      const ast = lezerParse('Z');
      expect((ast.body[0] as any).command).toBe('Z');
      expect((ast.body[0] as any).args).toHaveLength(0);
    });
  });

  describe('expressions', () => {
    it('parses ternary expression', () => {
      const ast = lezerParse('let x = a > 0 ? a : 0;');
      const decl = ast.body[0] as any;
      expect(decl.value.type).toBe('TernaryExpression');
    });

    it('parses unary expression', () => {
      const ast = lezerParse('let neg = -x;');
      const decl = ast.body[0] as any;
      expect(decl.value.type).toBe('UnaryExpression');
      expect(decl.value.operator).toBe('-');
    });

    it('parses array literal', () => {
      const ast = lezerParse('let arr = [1, 2, 3];');
      const decl = ast.body[0] as any;
      expect(decl.value.type).toBe('ArrayLiteral');
      expect(decl.value.elements).toHaveLength(3);
    });

    it('parses object literal', () => {
      const ast = lezerParse('let obj = { x: 10, y: 20 };');
      const decl = ast.body[0] as any;
      expect(decl.value.type).toBe('ObjectLiteral');
      expect(decl.value.properties).toHaveLength(2);
    });

    it('parses color literal', () => {
      const ast = lezerParse('let c = #ff0000;');
      const decl = ast.body[0] as any;
      expect(decl.value.type).toBe('ColorLiteral');
      expect(decl.value.raw).toBe('#ff0000');
    });

    it('parses number with unit', () => {
      const ast = lezerParse('let a = 45deg;');
      const decl = ast.body[0] as any;
      expect(decl.value.type).toBe('NumberLiteral');
      expect(decl.value.value).toBe(45);
      expect(decl.value.unit).toBe('deg');
    });
  });

  // Regression suite for issue #1 — array literals (and parallel callsites)
  // must fold postfix operators (index, member, call, chains) into their
  // elements instead of leaking them out as extra sibling elements.
  describe('array literals with postfix-expression elements (issue #1)', () => {
    it('parses array literal with index-expression elements', () => {
      const ast = lezerParse('let arr = [ramp[2], ramp[0], ramp[1]];');
      const decl = ast.body[0] as any;
      expect(decl.value.type).toBe('ArrayLiteral');
      expect(decl.value.elements).toHaveLength(3);
      const [e0, e1, e2] = decl.value.elements;
      expect(e0.type).toBe('IndexExpression');
      expect(e0.object.type).toBe('Identifier');
      expect(e0.object.name).toBe('ramp');
      expect(e0.index.type).toBe('NumberLiteral');
      expect(e0.index.value).toBe(2);
      expect(e1.type).toBe('IndexExpression');
      expect(e1.index.value).toBe(0);
      expect(e2.type).toBe('IndexExpression');
      expect(e2.index.value).toBe(1);
    });

    it('parses array literal with member-access elements', () => {
      const ast = lezerParse('let arr = [obj.a, obj.b, obj.c];');
      const decl = ast.body[0] as any;
      expect(decl.value.type).toBe('ArrayLiteral');
      expect(decl.value.elements).toHaveLength(3);
      const [e0, e1, e2] = decl.value.elements;
      expect(e0.type).toBe('MemberExpression');
      expect(e0.object.name).toBe('obj');
      expect(e0.property).toBe('a');
      expect(e1.type).toBe('MemberExpression');
      expect(e1.property).toBe('b');
      expect(e2.type).toBe('MemberExpression');
      expect(e2.property).toBe('c');
    });

    it('parses array literal with function-call elements', () => {
      const ast = lezerParse('let arr = [f(1), f(2), f(3)];');
      const decl = ast.body[0] as any;
      expect(decl.value.type).toBe('ArrayLiteral');
      expect(decl.value.elements).toHaveLength(3);
      const [e0, e1, e2] = decl.value.elements;
      expect(e0.type).toBe('FunctionCall');
      expect(e0.name).toBe('f');
      expect(e0.args).toHaveLength(1);
      expect(e0.args[0].value).toBe(1);
      expect(e1.type).toBe('FunctionCall');
      expect(e1.args[0].value).toBe(2);
      expect(e2.type).toBe('FunctionCall');
      expect(e2.args[0].value).toBe(3);
    });

    it('parses array literal with chained postfix (index then member)', () => {
      const ast = lezerParse('let arr = [ramp[0].foo, ramp[1].bar];');
      const decl = ast.body[0] as any;
      expect(decl.value.type).toBe('ArrayLiteral');
      expect(decl.value.elements).toHaveLength(2);
      const [e0, e1] = decl.value.elements;
      expect(e0.type).toBe('MemberExpression');
      expect(e0.property).toBe('foo');
      expect(e0.object.type).toBe('IndexExpression');
      expect(e0.object.object.name).toBe('ramp');
      expect(e0.object.index.value).toBe(0);
      expect(e1.type).toBe('MemberExpression');
      expect(e1.property).toBe('bar');
      expect(e1.object.type).toBe('IndexExpression');
      expect(e1.object.index.value).toBe(1);
    });

    it('parses spread element over an index-expression', () => {
      const ast = lezerParse('let arr = [...ramp[0]];');
      const decl = ast.body[0] as any;
      expect(decl.value.type).toBe('ArrayLiteral');
      expect(decl.value.elements).toHaveLength(1);
      const [e0] = decl.value.elements;
      expect(e0.type).toBe('SpreadElement');
      expect(e0.argument.type).toBe('IndexExpression');
      expect(e0.argument.object.name).toBe('ramp');
      expect(e0.argument.index.value).toBe(0);
    });
  });

  describe('enum', () => {
    it('parses enum definition', () => {
      const ast = lezerParse('enum Dir { UP, DOWN }');
      expect(ast.body[0].type).toBe('EnumDefinition');
      const enumDef = ast.body[0] as any;
      expect(enumDef.name).toBe('Dir');
      expect(enumDef.members).toHaveLength(2);
      expect(enumDef.members[0].name).toBe('UP');
      expect(enumDef.members[1].name).toBe('DOWN');
    });
  });

  describe('function calls as expressions', () => {
    it('parses function call in let value', () => {
      const ast = lezerParse('let r = circle(50, 50, 25);');
      const decl = ast.body[0] as any;
      expect(decl.value.type).toBe('FunctionCall');
      expect(decl.value.name).toBe('circle');
      expect(decl.value.args).toHaveLength(3);
    });
  });

  describe('object literal property values', () => {
    it('parses function call as object property value', () => {
      const ast = lezerParse('let x = { y: randomRange(0, 10) };');
      const decl = ast.body[0] as any;
      expect(decl.value.type).toBe('ObjectLiteral');
      const prop = decl.value.properties[0];
      expect(prop.key).toBe('y');
      expect(prop.value.type).toBe('FunctionCall');
      expect(prop.value.name).toBe('randomRange');
      expect(prop.value.args).toHaveLength(2);
    });

    it('parses function call with calc args as object property value', () => {
      const ast = lezerParse('let x = { y: randomRange(calc(a * 0.8), calc(a * 1.2)) };');
      const decl = ast.body[0] as any;
      const prop = decl.value.properties[0];
      expect(prop.value.type).toBe('FunctionCall');
      expect(prop.value.name).toBe('randomRange');
      expect(prop.value.args).toHaveLength(2);
      expect(prop.value.args[0].type).toBe('CalcExpression');
      expect(prop.value.args[1].type).toBe('CalcExpression');
    });

    it('parses method call as object property value', () => {
      const ast = lezerParse('let x = { c: base.lighten(20) };');
      const decl = ast.body[0] as any;
      const prop = decl.value.properties[0];
      expect(prop.value.type).toBe('MethodCallExpression');
      expect(prop.value.method).toBe('lighten');
    });

    it('parses member access as object property value', () => {
      const ast = lezerParse('let x = { w: bb.width };');
      const decl = ast.body[0] as any;
      const prop = decl.value.properties[0];
      expect(prop.value.type).toBe('MemberExpression');
      expect(prop.value.property).toBe('width');
    });
  });

  describe('member access', () => {
    it('parses member expression', () => {
      const ast = lezerParse('ctx.position.x;');
      const expr = (ast.body[0] as any).expression;
      expect(expr.type).toBe('MemberExpression');
    });
  });
});
