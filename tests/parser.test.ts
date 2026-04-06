import { describe, expect, it } from 'vitest';

import { extractComments, parse, parseWithComments } from '../src/parser';

describe('Parser', () => {
  describe('path commands', () => {
    it('parses simple path commands with numbers', () => {
      const ast = parse('M 10 20');
      expect(ast.body).toHaveLength(1);
      expect(ast.body[0]).toMatchObject({
        type: 'PathCommand',
        command: 'M',
        args: [
          { type: 'NumberLiteral', value: 10 },
          { type: 'NumberLiteral', value: 20 },
        ],
      });
    });

    it('parses multiple path commands', () => {
      const ast = parse('M 0 0 L 10 20 Z');
      expect(ast.body).toHaveLength(3);
      expect(ast.body[0]).toMatchObject({ type: 'PathCommand', command: 'M' });
      expect(ast.body[1]).toMatchObject({ type: 'PathCommand', command: 'L' });
      expect(ast.body[2]).toMatchObject({ type: 'PathCommand', command: 'Z' });
    });

    it('parses path commands with identifiers', () => {
      const ast = parse('M x y');
      expect(ast.body[0]).toMatchObject({
        type: 'PathCommand',
        command: 'M',
        args: [
          { type: 'Identifier', name: 'x' },
          { type: 'Identifier', name: 'y' },
        ],
      });
    });

    it('parses path commands with calc()', () => {
      const ast = parse('L calc(x + 10) calc(y * 2)');
      expect(ast.body[0]).toMatchObject({
        type: 'PathCommand',
        command: 'L',
      });
      expect(ast.body[0].type === 'PathCommand' && ast.body[0].args[0]).toMatchObject({
        type: 'CalcExpression',
      });
    });

    it('parses lowercase path commands', () => {
      const ast = parse('m 10 20 l 5 5');
      expect(ast.body[0]).toMatchObject({ type: 'PathCommand', command: 'm' });
      expect(ast.body[1]).toMatchObject({ type: 'PathCommand', command: 'l' });
    });

    it('parses H (horizontal line)', () => {
      const ast = parse('H 50');
      expect(ast.body[0]).toMatchObject({ type: 'PathCommand', command: 'H' });
    });

    it('parses V (vertical line)', () => {
      const ast = parse('V 50');
      expect(ast.body[0]).toMatchObject({ type: 'PathCommand', command: 'V' });
    });

    it('parses C (cubic bezier)', () => {
      const ast = parse('C 10 20 30 40 50 60');
      expect(ast.body[0]).toMatchObject({ type: 'PathCommand', command: 'C' });
      expect(ast.body[0].type === 'PathCommand' && ast.body[0].args).toHaveLength(6);
    });

    it('parses S (smooth cubic)', () => {
      const ast = parse('S 30 40 50 60');
      expect(ast.body[0]).toMatchObject({ type: 'PathCommand', command: 'S' });
    });

    it('parses Q (quadratic bezier)', () => {
      const ast = parse('Q 25 50 50 0');
      expect(ast.body[0]).toMatchObject({ type: 'PathCommand', command: 'Q' });
    });

    it('parses T (smooth quadratic)', () => {
      const ast = parse('T 50 0');
      expect(ast.body[0]).toMatchObject({ type: 'PathCommand', command: 'T' });
    });

    it('parses A (arc)', () => {
      const ast = parse('A 25 25 0 1 1 50 50');
      expect(ast.body[0]).toMatchObject({ type: 'PathCommand', command: 'A' });
      expect(ast.body[0].type === 'PathCommand' && ast.body[0].args).toHaveLength(7);
    });
  });

  describe('comments', () => {
    it('parses code with line comments', () => {
      const ast = parse('// This is a comment\nM 10 20');
      expect(ast.body).toHaveLength(1);
      expect(ast.body[0]).toMatchObject({ type: 'PathCommand', command: 'M' });
    });

    it('parses code with inline comments', () => {
      const ast = parse('M 10 20 // move to 10,20\nL 30 40');
      expect(ast.body).toHaveLength(2);
    });

    it('parses code with multiple comments', () => {
      const ast = parse(`
        // First comment
        let x = 10; // inline
        // Another comment
        M x 0
      `);
      expect(ast.body).toHaveLength(2);
    });
  });

  describe('let declarations', () => {
    it('parses simple let declaration', () => {
      const ast = parse('let x = 10;');
      expect(ast.body[0]).toMatchObject({
        type: 'LetDeclaration',
        name: 'x',
        value: { type: 'NumberLiteral', value: 10 },
      });
    });

    it('parses let with expression', () => {
      const ast = parse('let x = 10 + 5;');
      expect(ast.body[0]).toMatchObject({
        type: 'LetDeclaration',
        name: 'x',
        value: {
          type: 'BinaryExpression',
          operator: '+',
        },
      });
    });
  });

  describe('angle units', () => {
    it('parses number with deg suffix', () => {
      const ast = parse('let x = 45deg;');
      expect(ast.body[0]).toMatchObject({
        type: 'LetDeclaration',
        name: 'x',
        value: { type: 'NumberLiteral', value: 45, unit: 'deg' },
      });
    });

    it('parses number with rad suffix', () => {
      const ast = parse('let x = 1.5rad;');
      expect(ast.body[0]).toMatchObject({
        type: 'LetDeclaration',
        name: 'x',
        value: { type: 'NumberLiteral', value: 1.5, unit: 'rad' },
      });
    });

    it('parses negative angle with deg suffix', () => {
      const ast = parse('let x = -45deg;');
      // Negative angles are parsed as UnaryExpression('-', NumberLiteral)
      // which is semantically equivalent
      expect(ast.body[0]).toMatchObject({
        type: 'LetDeclaration',
        name: 'x',
        value: {
          type: 'UnaryExpression',
          operator: '-',
          argument: { type: 'NumberLiteral', value: 45, unit: 'deg' },
        },
      });
    });

    it('parses plain number without unit', () => {
      const ast = parse('let x = 45;');
      const decl = ast.body[0];
      expect(decl.type === 'LetDeclaration' && decl.value).toMatchObject({
        type: 'NumberLiteral',
        value: 45,
      });
      // unit should be undefined
      if (decl.type === 'LetDeclaration' && decl.value.type === 'NumberLiteral') {
        expect(decl.value.unit).toBeUndefined();
      }
    });

    it('parses angle in function call', () => {
      const ast = parse('M sin(90deg) 0');
      const cmd = ast.body[0];
      if (cmd.type === 'PathCommand') {
        expect(cmd.args[0]).toMatchObject({
          type: 'FunctionCall',
          name: 'sin',
          args: [{ type: 'NumberLiteral', value: 90, unit: 'deg' }],
        });
      }
    });

    it('parses number with pi suffix', () => {
      const ast = parse('let x = 0.25pi;');
      expect(ast.body[0]).toMatchObject({
        type: 'LetDeclaration',
        name: 'x',
        value: { type: 'NumberLiteral', value: 0.25, unit: 'pi' },
      });
    });

    it('parses integer with pi suffix', () => {
      const ast = parse('let x = 1pi;');
      expect(ast.body[0]).toMatchObject({
        type: 'LetDeclaration',
        name: 'x',
        value: { type: 'NumberLiteral', value: 1, unit: 'pi' },
      });
    });

    it('parses negative number with pi suffix via unary negation', () => {
      const ast = parse('let x = -2pi;');
      expect(ast.body[0]).toMatchObject({
        type: 'LetDeclaration',
        name: 'x',
        value: {
          type: 'UnaryExpression',
          operator: '-',
          argument: { type: 'NumberLiteral', value: 2, unit: 'pi' },
        },
      });
    });
  });

  describe('expressions', () => {
    it('parses arithmetic with correct precedence', () => {
      const ast = parse('let x = 1 + 2 * 3;');
      const expr = ast.body[0];
      expect(expr.type === 'LetDeclaration' && expr.value).toMatchObject({
        type: 'BinaryExpression',
        operator: '+',
        left: { type: 'NumberLiteral', value: 1 },
        right: {
          type: 'BinaryExpression',
          operator: '*',
          left: { type: 'NumberLiteral', value: 2 },
          right: { type: 'NumberLiteral', value: 3 },
        },
      });
    });

    it('parses function calls', () => {
      const ast = parse('M sin(0) cos(0)');
      expect(ast.body[0].type === 'PathCommand' && ast.body[0].args[0]).toMatchObject({
        type: 'FunctionCall',
        name: 'sin',
        args: [{ type: 'NumberLiteral', value: 0 }],
      });
    });

    it('parses nested function calls', () => {
      const ast = parse('let x = max(min(a, b), c);');
      expect(ast.body[0]).toMatchObject({
        type: 'LetDeclaration',
        value: {
          type: 'FunctionCall',
          name: 'max',
        },
      });
    });

    it('parses comparison operators', () => {
      const ops = ['<', '>', '<=', '>=', '==', '!='];
      for (const op of ops) {
        const ast = parse(`let x = 1 ${op} 2;`);
        expect(ast.body[0]).toMatchObject({
          type: 'LetDeclaration',
          value: { type: 'BinaryExpression', operator: op },
        });
      }
    });

    it('parses logical and operator', () => {
      const ast = parse('let x = 1 && 2;');
      expect(ast.body[0]).toMatchObject({
        type: 'LetDeclaration',
        value: { type: 'BinaryExpression', operator: '&&' },
      });
    });

    it('parses logical or operator', () => {
      const ast = parse('let x = 1 || 2;');
      expect(ast.body[0]).toMatchObject({
        type: 'LetDeclaration',
        value: { type: 'BinaryExpression', operator: '||' },
      });
    });

    it('parses unary minus', () => {
      const ast = parse('let x = -5;');
      expect(ast.body[0]).toMatchObject({
        type: 'LetDeclaration',
        value: { type: 'UnaryExpression', operator: '-' },
      });
    });

    it('parses unary not', () => {
      const ast = parse('let x = !1;');
      expect(ast.body[0]).toMatchObject({
        type: 'LetDeclaration',
        value: { type: 'UnaryExpression', operator: '!' },
      });
    });

    it('parses division and modulo', () => {
      const ast = parse('let x = 10 / 3;');
      expect(ast.body[0]).toMatchObject({
        type: 'LetDeclaration',
        value: { type: 'BinaryExpression', operator: '/' },
      });

      const ast2 = parse('let x = 10 % 3;');
      expect(ast2.body[0]).toMatchObject({
        type: 'LetDeclaration',
        value: { type: 'BinaryExpression', operator: '%' },
      });
    });
  });

  describe('control flow', () => {
    it('parses for loop', () => {
      const ast = parse('for (i in 0..5) { M i 0 }');
      expect(ast.body[0]).toMatchObject({
        type: 'ForLoop',
        variable: 'i',
        start: { type: 'NumberLiteral', value: 0 },
        end: { type: 'NumberLiteral', value: 5 },
      });
    });

    it('parses if statement', () => {
      const ast = parse('if (x > 0) { M 10 10 }');
      expect(ast.body[0]).toMatchObject({
        type: 'IfStatement',
        condition: {
          type: 'BinaryExpression',
          operator: '>',
        },
      });
    });

    it('parses if-else statement', () => {
      const ast = parse('if (x > 0) { M 10 10 } else { M 0 0 }');
      const stmt = ast.body[0];
      expect(stmt.type === 'IfStatement' && stmt.alternate).not.toBeNull();
    });

    it('parses else if as nested IfStatement in alternate', () => {
      const ast = parse('if (x > 0) { M 10 10 } else if (x < 0) { M 20 20 }');
      const stmt = ast.body[0];
      expect(stmt).toMatchObject({
        type: 'IfStatement',
        condition: { type: 'BinaryExpression', operator: '>' },
      });
      if (stmt.type === 'IfStatement') {
        expect(stmt.alternate).toHaveLength(1);
        expect(stmt.alternate![0]).toMatchObject({
          type: 'IfStatement',
          condition: { type: 'BinaryExpression', operator: '<' },
          alternate: null,
        });
      }
    });

    it('parses else if ... else if ... else chain', () => {
      const ast = parse('if (x == 1) { M 1 0 } else if (x == 2) { M 2 0 } else if (x == 3) { M 3 0 } else { M 0 0 }');
      const stmt = ast.body[0];
      if (stmt.type === 'IfStatement') {
        // first else if
        const elseIf1 = stmt.alternate![0];
        expect(elseIf1).toMatchObject({
          type: 'IfStatement',
          condition: { type: 'BinaryExpression', left: { name: 'x' }, right: { value: 2 } },
        });
        // second else if
        if (elseIf1.type === 'IfStatement') {
          const elseIf2 = elseIf1.alternate![0];
          expect(elseIf2).toMatchObject({
            type: 'IfStatement',
            condition: { type: 'BinaryExpression', left: { name: 'x' }, right: { value: 3 } },
          });
          // final else
          if (elseIf2.type === 'IfStatement') {
            expect(elseIf2.alternate).toHaveLength(1);
            expect(elseIf2.alternate![0]).toMatchObject({ type: 'PathCommand', command: 'M' });
          }
        }
      }
    });

    it('parses if with calc() in condition', () => {
      const ast = parse('if (calc(x % 2) == 0) { M 10 10 }');
      expect(ast.body[0]).toMatchObject({
        type: 'IfStatement',
        condition: {
          type: 'BinaryExpression',
          operator: '==',
          left: { type: 'CalcExpression' },
        },
      });
    });

    it('parses if with calc() on both sides', () => {
      const ast = parse('if (calc(a + b) > calc(c * 2)) { M 10 10 }');
      expect(ast.body[0]).toMatchObject({
        type: 'IfStatement',
        condition: {
          type: 'BinaryExpression',
          operator: '>',
          left: { type: 'CalcExpression' },
          right: { type: 'CalcExpression' },
        },
      });
    });
  });

  describe('function definitions', () => {
    it('parses function definition', () => {
      const ast = parse('fn square(x) { M x x }');
      expect(ast.body[0]).toMatchObject({
        type: 'FunctionDefinition',
        name: 'square',
        params: ['x'],
      });
    });

    it('parses function with multiple params', () => {
      const ast = parse('fn add(x, y, z) { M x y }');
      expect(ast.body[0]).toMatchObject({
        type: 'FunctionDefinition',
        params: ['x', 'y', 'z'],
      });
    });
  });

  describe('function call statements', () => {
    it('parses function call without semicolon', () => {
      const ast = parse('circle(50, 50, 20);');
      expect(ast.body).toHaveLength(1);
      expect(ast.body[0]).toMatchObject({
        type: 'PathCommand',
        command: '',
      });
    });

    it('parses function call with optional semicolon', () => {
      const ast = parse('circle(50, 50, 20);');
      expect(ast.body).toHaveLength(1);
      expect(ast.body[0]).toMatchObject({
        type: 'PathCommand',
        command: '',
      });
    });

    it('parses multiple function calls with semicolons', () => {
      const ast = parse('circle(50, 50, 20);\nrect(0, 0, 10, 10);\nlog(ctx);');
      expect(ast.body).toHaveLength(3);
    });
  });

  describe('source locations', () => {
    it('captures location for for loops', () => {
      const ast = parse('for (i in 0..5) { M i 0 }');
      const forLoop = ast.body[0];
      expect(forLoop.type).toBe('ForLoop');
      if (forLoop.type === 'ForLoop') {
        expect(forLoop.loc).toBeDefined();
        expect(forLoop.loc?.line).toBe(1);
        expect(forLoop.loc?.column).toBe(1);
      }
    });

    it('captures location for for loops on later lines', () => {
      const ast = parse('M 0 0\nfor (i in 0..5) { M i 0 }');
      const forLoop = ast.body[1];
      expect(forLoop.type).toBe('ForLoop');
      if (forLoop.type === 'ForLoop') {
        expect(forLoop.loc?.line).toBe(2);
        expect(forLoop.loc?.column).toBe(1);
      }
    });

    it('captures location for path commands', () => {
      const ast = parse('M 10 20');
      const cmd = ast.body[0];
      expect(cmd.type).toBe('PathCommand');
      if (cmd.type === 'PathCommand') {
        expect(cmd.loc).toBeDefined();
        expect(cmd.loc?.line).toBe(1);
      }
    });

    it('captures location for function calls at statement level', () => {
      const ast = parse('circle(50, 50, 25);');
      const cmd = ast.body[0];
      expect(cmd.type).toBe('PathCommand');
      if (cmd.type === 'PathCommand') {
        expect(cmd.loc).toBeDefined();
        expect(cmd.loc?.line).toBe(1);
      }
    });

    it('captures location for function calls in path arguments', () => {
      const ast = parse('M sin(0) cos(0)');
      const cmd = ast.body[0];
      if (cmd.type === 'PathCommand') {
        const arg0 = cmd.args[0];
        if (arg0.type === 'FunctionCall') {
          expect(arg0.loc).toBeDefined();
          expect(arg0.loc?.line).toBe(1);
        }
      }
    });
  });

  describe('comment extraction', () => {
    it('extracts single line comment', () => {
      const comments = extractComments('// Hello world');
      expect(comments).toHaveLength(1);
      expect(comments[0].text).toBe('// Hello world');
      expect(comments[0].loc.line).toBe(1);
    });

    it('extracts multiple comments', () => {
      const input = `// First comment
M 0 0
// Second comment
L 10 20`;
      const comments = extractComments(input);
      expect(comments).toHaveLength(2);
      expect(comments[0].text).toBe('// First comment');
      expect(comments[0].loc.line).toBe(1);
      expect(comments[1].text).toBe('// Second comment');
      expect(comments[1].loc.line).toBe(3);
    });

    it('extracts inline comments', () => {
      const input = 'M 0 0 // move to origin';
      const comments = extractComments(input);
      expect(comments).toHaveLength(1);
      expect(comments[0].text).toBe('// move to origin');
      expect(comments[0].loc.column).toBe(7);
    });

    it('parseWithComments returns both AST and comments', () => {
      const input = `// Draw a line
M 0 0
L 10 20 // end point`;
      const result = parseWithComments(input);
      expect(result.program.body).toHaveLength(2);
      expect(result.comments).toHaveLength(2);
      expect(result.comments[0].text).toBe('// Draw a line');
      expect(result.comments[1].text).toBe('// end point');
    });
  });

  describe('assignment statement', () => {
    it('parses variable reassignment', () => {
      const ast = parse('x = 10;');
      expect(ast.body[0]).toMatchObject({
        type: 'AssignmentStatement',
        name: 'x',
        value: { type: 'NumberLiteral', value: 10 },
      });
    });

    it('parses assignment with expression', () => {
      const ast = parse('x = calc(y + 1);');
      expect(ast.body[0]).toMatchObject({ type: 'AssignmentStatement', name: 'x' });
    });

    it('does not confuse = with ==', () => {
      const ast = parse('if (x == 1) { M 0 0 }');
      expect(ast.body[0]).toMatchObject({ type: 'IfStatement' });
    });
  });

  describe('layer definitions', () => {
    it('parses basic PathLayer definition', () => {
      const ast = parse("define PathLayer('main') ${}");
      expect(ast.body).toHaveLength(1);
      expect(ast.body[0]).toMatchObject({
        type: 'LayerDefinition',
        layerType: 'PathLayer',
        isDefault: false,
        styleExpr: { type: 'StyleBlockLiteral', properties: [] },
      });
    });

    it('parses default PathLayer definition', () => {
      const ast = parse("define default PathLayer('main') ${}");
      expect(ast.body[0]).toMatchObject({
        type: 'LayerDefinition',
        layerType: 'PathLayer',
        isDefault: true,
      });
    });

    it('parses TextLayer definition', () => {
      const ast = parse("define TextLayer('text') ${}");
      expect(ast.body[0]).toMatchObject({
        type: 'LayerDefinition',
        layerType: 'TextLayer',
      });
    });

    it('parses style properties', () => {
      const ast = parse("define PathLayer('main') ${ stroke: #cc0000; stroke-width: 4; }");
      const def = ast.body[0] as any;
      expect(def.type).toBe('LayerDefinition');
      expect(def.styleExpr.type).toBe('StyleBlockLiteral');
      expect(def.styleExpr.properties).toHaveLength(2);
      expect(def.styleExpr.properties[0]).toEqual({ type: 'StyleProperty', name: 'stroke', value: '#cc0000' });
      expect(def.styleExpr.properties[1]).toEqual({ type: 'StyleProperty', name: 'stroke-width', value: '4' });
    });

    it('parses style block with comments', () => {
      const ast = parse("define PathLayer('main') ${ // comment\nstroke: red; }");
      const def = ast.body[0] as any;
      expect(def.styleExpr.properties).toHaveLength(1);
      expect(def.styleExpr.properties[0].name).toBe('stroke');
    });

    it('parses layer name as expression', () => {
      const ast = parse('define PathLayer(myVar) ${}');
      const def = ast.body[0] as any;
      expect(def.name).toMatchObject({ type: 'Identifier', name: 'myVar' });
    });
  });

  describe('style block literals', () => {
    it('parses empty style block', () => {
      const ast = parse('let s = ${};');
      const decl = ast.body[0] as any;
      expect(decl.value).toMatchObject({
        type: 'StyleBlockLiteral',
        properties: [],
      });
    });

    it('parses style block with properties', () => {
      const ast = parse('let s = ${ stroke: red; fill: blue; };');
      const decl = ast.body[0] as any;
      expect(decl.value.type).toBe('StyleBlockLiteral');
      expect(decl.value.properties).toHaveLength(2);
      expect(decl.value.properties[0]).toEqual({ type: 'StyleProperty', name: 'stroke', value: 'red' });
      expect(decl.value.properties[1]).toEqual({ type: 'StyleProperty', name: 'fill', value: 'blue' });
    });

    it('parses << merge operator', () => {
      const ast = parse('let s = ${ stroke: red; } << ${ fill: blue; };');
      const decl = ast.body[0] as any;
      expect(decl.value).toMatchObject({
        type: 'BinaryExpression',
        operator: '<<',
        left: { type: 'StyleBlockLiteral' },
        right: { type: 'StyleBlockLiteral' },
      });
    });

    it('does not confuse < with <<', () => {
      const ast = parse('let x = 1 < 2;');
      expect(ast.body[0]).toMatchObject({
        type: 'LetDeclaration',
        value: { type: 'BinaryExpression', operator: '<' },
      });
    });

    it('parses style block with member access', () => {
      const ast = parse('let x = ${ stroke: red; }.stroke;');
      const decl = ast.body[0] as any;
      expect(decl.value).toMatchObject({
        type: 'MemberExpression',
        property: 'stroke',
        object: { type: 'StyleBlockLiteral' },
      });
    });
  });

  describe('layer apply blocks', () => {
    it('parses basic apply block', () => {
      const ast = parse("layer('main').apply { M 10 10 }");
      expect(ast.body).toHaveLength(1);
      expect(ast.body[0]).toMatchObject({
        type: 'LayerApplyBlock',
        body: [{ type: 'PathCommand', command: 'M' }],
      });
    });

    it('parses apply block with multiple statements', () => {
      const ast = parse("layer('main').apply { M 10 10 L 20 20 Z }");
      const block = ast.body[0] as any;
      expect(block.type).toBe('LayerApplyBlock');
      expect(block.body).toHaveLength(3);
    });

    it('parses apply block with variable name', () => {
      const ast = parse('layer(name).apply { M 0 0 }');
      const block = ast.body[0] as any;
      expect(block.layerName).toMatchObject({ type: 'Identifier', name: 'name' });
    });
  });

  describe('member access on function calls', () => {
    it('parses function call with member access', () => {
      const ast = parse("let x = layer('main').ctx;");
      const decl = ast.body[0] as any;
      expect(decl.type).toBe('LetDeclaration');
      expect(decl.value).toMatchObject({
        type: 'MemberExpression',
        property: 'ctx',
        object: {
          type: 'FunctionCall',
          name: 'layer',
        },
      });
    });

    it('parses chained member access on function call', () => {
      const ast = parse("let x = layer('main').ctx.position;");
      const decl = ast.body[0] as any;
      expect(decl.value).toMatchObject({
        type: 'MemberExpression',
        property: 'position',
        object: {
          type: 'MemberExpression',
          property: 'ctx',
        },
      });
    });
  });

  describe('template literals', () => {
    it('parses a simple template literal', () => {
      const ast = parse('let x = `hello`;');
      expect(ast.body[0]).toMatchObject({
        type: 'LetDeclaration',
        value: {
          type: 'TemplateLiteral',
          parts: ['hello'],
        },
      });
    });

    it('parses template literal with expression', () => {
      const ast = parse('let x = `hello ${name}!`;');
      const tl = (ast.body[0] as any).value;
      expect(tl.type).toBe('TemplateLiteral');
      expect(tl.parts).toHaveLength(3);
      expect(tl.parts[0]).toBe('hello ');
      expect(tl.parts[1]).toMatchObject({ type: 'Identifier', name: 'name' });
      expect(tl.parts[2]).toBe('!');
    });

    it('parses template literal with multiple expressions', () => {
      const ast = parse('let x = `${a} and ${b}`;');
      const tl = (ast.body[0] as any).value;
      expect(tl.parts).toHaveLength(3);
      expect(tl.parts[0]).toMatchObject({ type: 'Identifier', name: 'a' });
      expect(tl.parts[1]).toBe(' and ');
      expect(tl.parts[2]).toMatchObject({ type: 'Identifier', name: 'b' });
    });

    it('parses template literal with calc expression', () => {
      const ast = parse('let x = `value: ${2 + 3}`;');
      const tl = (ast.body[0] as any).value;
      expect(tl.parts[0]).toBe('value: ');
      expect(tl.parts[1]).toMatchObject({
        type: 'BinaryExpression',
        operator: '+',
      });
    });

    it('parses empty template literal', () => {
      const ast = parse('let x = ``;');
      const tl = (ast.body[0] as any).value;
      expect(tl.type).toBe('TemplateLiteral');
      expect(tl.parts).toHaveLength(0);
    });

    it('parses template literal with escaped backtick', () => {
      const ast = parse('let x = `hello \\`world\\``;');
      const tl = (ast.body[0] as any).value;
      expect(tl.parts[0]).toBe('hello `world`');
    });

    it('parses template literal with dollar sign not followed by brace', () => {
      const ast = parse('let x = `price: $5`;');
      const tl = (ast.body[0] as any).value;
      expect(tl.parts[0]).toBe('price: $5');
    });
  });

  describe('null', () => {
    it('parses null literal', () => {
      const ast = parse('let x = null;');
      expect(ast.body[0]).toMatchObject({
        type: 'LetDeclaration',
        name: 'x',
        value: { type: 'NullLiteral' },
      });
    });

    it('null is a reserved word', () => {
      expect(() => parse('let null = 10;')).toThrow();
    });
  });

  describe('booleans', () => {
    it('parses true as BooleanLiteral', () => {
      const ast = parse('let x = true;');
      expect(ast.body[0]).toMatchObject({
        type: 'LetDeclaration',
        name: 'x',
        value: { type: 'BooleanLiteral', value: true },
      });
    });

    it('parses false as BooleanLiteral', () => {
      const ast = parse('let x = false;');
      expect(ast.body[0]).toMatchObject({
        type: 'LetDeclaration',
        name: 'x',
        value: { type: 'BooleanLiteral', value: false },
      });
    });

    it('true is a reserved word', () => {
      expect(() => parse('let true = 10;')).toThrow();
    });

    it('false is a reserved word', () => {
      expect(() => parse('let false = 10;')).toThrow();
    });

    it('parses boolean as path arg', () => {
      const ast = parse('A 50 50 0 true false 100 0');
      const cmd = ast.body[0] as any;
      expect(cmd.type).toBe('PathCommand');
      expect(cmd.args[3]).toMatchObject({ type: 'BooleanLiteral', value: true });
      expect(cmd.args[4]).toMatchObject({ type: 'BooleanLiteral', value: false });
    });
  });

  describe('enums', () => {
    it('parses basic enum with auto-valued members', () => {
      const ast = parse('enum Dir { Up, Down, Left, Right }');
      expect(ast.body[0]).toMatchObject({
        type: 'EnumDefinition',
        name: 'Dir',
        members: [
          { name: 'Up' },
          { name: 'Down' },
          { name: 'Left' },
          { name: 'Right' },
        ],
      });
    });

    it('parses enum with explicit string values', () => {
      const ast = parse("enum Season { Spring = 'vernal', Summer = 'estival' }");
      const enumDef = ast.body[0] as any;
      expect(enumDef.type).toBe('EnumDefinition');
      expect(enumDef.members[0].value).toMatchObject({ type: 'StringLiteral', value: 'vernal' });
      expect(enumDef.members[1].value).toMatchObject({ type: 'StringLiteral', value: 'estival' });
    });

    it('parses enum with explicit number values', () => {
      const ast = parse('enum Weight { Thin = 1, Bold = 4 }');
      const enumDef = ast.body[0] as any;
      expect(enumDef.members[0].value).toMatchObject({ type: 'NumberLiteral', value: 1 });
      expect(enumDef.members[1].value).toMatchObject({ type: 'NumberLiteral', value: 4 });
    });

    it('parses enum with color values', () => {
      const ast = parse('enum P { Primary = #0066ff, Accent = #ff6600 }');
      const enumDef = ast.body[0] as any;
      expect(enumDef.members[0].value).toMatchObject({ type: 'ColorLiteral', raw: '#0066ff' });
    });

    it('parses enum with boolean values', () => {
      const ast = parse('enum T { On = true, Off = false }');
      const enumDef = ast.body[0] as any;
      expect(enumDef.members[0].value).toMatchObject({ type: 'BooleanLiteral', value: true });
      expect(enumDef.members[1].value).toMatchObject({ type: 'BooleanLiteral', value: false });
    });

    it('enum is a reserved word', () => {
      expect(() => parse('let enum = 10;')).toThrow();
    });

    it('parses enum with trailing comma', () => {
      const ast = parse('enum Dir { Up, Down, }');
      const enumDef = ast.body[0] as any;
      expect(enumDef.members).toHaveLength(2);
    });
  });

  describe('arrays', () => {
    it('parses empty array', () => {
      const ast = parse('let x = [];');
      expect(ast.body[0]).toMatchObject({
        type: 'LetDeclaration',
        value: { type: 'ArrayLiteral', elements: [] },
      });
    });

    it('parses array with elements', () => {
      const ast = parse('let x = [1, 2, 3];');
      const decl = ast.body[0] as any;
      expect(decl.value.type).toBe('ArrayLiteral');
      expect(decl.value.elements).toHaveLength(3);
      expect(decl.value.elements[0]).toMatchObject({ type: 'NumberLiteral', value: 1 });
      expect(decl.value.elements[2]).toMatchObject({ type: 'NumberLiteral', value: 3 });
    });

    it('parses index access', () => {
      const ast = parse('let x = list[0];');
      const decl = ast.body[0] as any;
      expect(decl.value).toMatchObject({
        type: 'IndexExpression',
        object: { type: 'Identifier', name: 'list' },
        index: { type: 'NumberLiteral', value: 0 },
      });
    });

    it('parses chained index access', () => {
      const ast = parse('let x = grid[0][1];');
      const decl = ast.body[0] as any;
      expect(decl.value).toMatchObject({
        type: 'IndexExpression',
        object: {
          type: 'IndexExpression',
          object: { type: 'Identifier', name: 'grid' },
          index: { type: 'NumberLiteral', value: 0 },
        },
        index: { type: 'NumberLiteral', value: 1 },
      });
    });

    it('parses method call', () => {
      const ast = parse('let x = list.push(42);');
      const decl = ast.body[0] as any;
      expect(decl.value).toMatchObject({
        type: 'MethodCallExpression',
        object: { type: 'Identifier', name: 'list' },
        method: 'push',
        args: [{ type: 'NumberLiteral', value: 42 }],
      });
    });

    it('parses method call with trailing block (no parens)', () => {
      const ast = parse('let x = list.map {|item| return item; };');
      const decl = ast.body[0] as any;
      expect(decl.value).toMatchObject({
        type: 'MethodCallExpression',
        object: { type: 'Identifier', name: 'list' },
        method: 'map',
        args: [],
        block: {
          params: ['item'],
          body: expect.any(Array),
        },
      });
      expect(decl.value.block.body).toHaveLength(1);
      expect(decl.value.block.body[0].type).toBe('ReturnStatement');
    });

    it('parses method call with args and trailing block', () => {
      const ast = parse('let x = list.reduce(0) {|acc| return acc; };');
      const decl = ast.body[0] as any;
      expect(decl.value).toMatchObject({
        type: 'MethodCallExpression',
        object: { type: 'Identifier', name: 'list' },
        method: 'reduce',
        args: [{ type: 'NumberLiteral', value: 0 }],
        block: {
          params: ['acc'],
          body: expect.any(Array),
        },
      });
    });

    it('parses for-each loop', () => {
      const ast = parse('for (item in list) { M item 0 }');
      expect(ast.body[0]).toMatchObject({
        type: 'ForEachLoop',
        variable: 'item',
        iterable: { type: 'Identifier', name: 'list' },
      });
    });

    it('parses destructured for-each loop', () => {
      const ast = parse('for ([item, idx] in list) { M item idx }');
      expect(ast.body[0]).toMatchObject({
        type: 'ForEachLoop',
        variable: 'item',
        indexVariable: 'idx',
        iterable: { type: 'Identifier', name: 'list' },
      });
    });

    it('disambiguates range for-loop from for-each', () => {
      // Range loop: has '..'
      const ast1 = parse('for (i in 0..10) { M i 0 }');
      expect(ast1.body[0].type).toBe('ForLoop');

      // For-each: no '..'
      const ast2 = parse('for (i in list) { M i 0 }');
      expect(ast2.body[0].type).toBe('ForEachLoop');
    });

    it('parses index in path args', () => {
      const ast = parse('M arr[0] arr[1]');
      const cmd = ast.body[0] as any;
      expect(cmd.args[0]).toMatchObject({
        type: 'IndexExpression',
        object: { type: 'Identifier', name: 'arr' },
        index: { type: 'NumberLiteral', value: 0 },
      });
      expect(cmd.args[1]).toMatchObject({
        type: 'IndexExpression',
        object: { type: 'Identifier', name: 'arr' },
        index: { type: 'NumberLiteral', value: 1 },
      });
    });

    it('parses method call statement', () => {
      const ast = parse('list.push(42);');
      expect(ast.body[0]).toMatchObject({
        type: 'PathCommand',
        command: '',
      });
      const cmd = ast.body[0] as any;
      expect(cmd.args[0]).toMatchObject({
        type: 'MethodCallExpression',
        method: 'push',
      });
    });
  });

  describe('spread and destructuring', () => {
    it('parses array spread element', () => {
      const ast = parse('let x = [1, ...a, 2];');
      const decl = ast.body[0] as any;
      expect(decl.value.type).toBe('ArrayLiteral');
      expect(decl.value.elements).toHaveLength(3);
      expect(decl.value.elements[0]).toMatchObject({ type: 'NumberLiteral', value: 1 });
      expect(decl.value.elements[1]).toMatchObject({ type: 'SpreadElement', argument: { type: 'Identifier', name: 'a' } });
      expect(decl.value.elements[2]).toMatchObject({ type: 'NumberLiteral', value: 2 });
    });

    it('parses object spread property', () => {
      const ast = parse('let x = { ...a, y: 2 };');
      const decl = ast.body[0] as any;
      expect(decl.value.type).toBe('ObjectLiteral');
      expect(decl.value.properties).toHaveLength(2);
      expect(decl.value.properties[0]).toMatchObject({ type: 'SpreadElement', argument: { type: 'Identifier', name: 'a' } });
      expect(decl.value.properties[1]).toMatchObject({ key: 'y' });
    });

    it('parses array destructuring pattern', () => {
      const ast = parse('let [a, b, c] = arr;');
      const decl = ast.body[0] as any;
      expect(decl.type).toBe('LetDeclaration');
      expect(decl.pattern).toMatchObject({
        type: 'ArrayDestructuringPattern',
        elements: ['a', 'b', 'c'],
      });
    });

    it('parses array destructuring with rest', () => {
      const ast = parse('let [first, ...rest] = arr;');
      const decl = ast.body[0] as any;
      expect(decl.pattern).toMatchObject({
        type: 'ArrayDestructuringPattern',
        elements: ['first'],
        rest: 'rest',
      });
    });

    it('parses object destructuring pattern', () => {
      const ast = parse('let { x, y } = point;');
      const decl = ast.body[0] as any;
      expect(decl.type).toBe('LetDeclaration');
      expect(decl.pattern).toMatchObject({
        type: 'ObjectDestructuringPattern',
        properties: [{ key: 'x' }, { key: 'y' }],
      });
    });

    it('parses object destructuring with rename', () => {
      const ast = parse('let { z: depth } = point;');
      const decl = ast.body[0] as any;
      expect(decl.pattern).toMatchObject({
        type: 'ObjectDestructuringPattern',
        properties: [{ key: 'z', alias: 'depth' }],
      });
    });

    it('parses object destructuring with rest', () => {
      const ast = parse('let { x, ...rest } = obj;');
      const decl = ast.body[0] as any;
      expect(decl.pattern).toMatchObject({
        type: 'ObjectDestructuringPattern',
        properties: [{ key: 'x' }],
        rest: 'rest',
      });
    });
  });

  describe('text and tspan statements', () => {
    it('parses inline text statement', () => {
      const ast = parse('text(10, 20)`hello`');
      expect(ast.body[0]).toMatchObject({
        type: 'TextStatement',
        x: { type: 'NumberLiteral', value: 10 },
        y: { type: 'NumberLiteral', value: 20 },
        content: { type: 'TemplateLiteral', parts: ['hello'] },
      });
    });

    it('parses text statement with rotation', () => {
      const ast = parse('text(10, 20, 30)`hello`');
      expect(ast.body[0]).toMatchObject({
        type: 'TextStatement',
        x: { type: 'NumberLiteral', value: 10 },
        y: { type: 'NumberLiteral', value: 20 },
        rotation: { type: 'NumberLiteral', value: 30 },
      });
    });

    it('parses block text statement with tspan', () => {
      const ast = parse('text(10, 20) { `hello ` tspan(0, 16)`world` }');
      const stmt = ast.body[0] as any;
      expect(stmt.type).toBe('TextStatement');
      expect(stmt.body).toHaveLength(2);
      expect(stmt.body[0]).toMatchObject({ type: 'TemplateLiteral', parts: ['hello '] });
      expect(stmt.body[1]).toMatchObject({
        type: 'TspanStatement',
        dx: { type: 'NumberLiteral', value: 0 },
        dy: { type: 'NumberLiteral', value: 16 },
        content: { type: 'TemplateLiteral', parts: ['world'] },
      });
    });

    it('parses tspan with no arguments', () => {
      const ast = parse('text(10, 20) { tspan()`content` }');
      const stmt = ast.body[0] as any;
      expect(stmt.body[0]).toMatchObject({
        type: 'TspanStatement',
        content: { type: 'TemplateLiteral', parts: ['content'] },
      });
      expect(stmt.body[0].dx).toBeUndefined();
      expect(stmt.body[0].dy).toBeUndefined();
    });

    it('parses tspan with rotation', () => {
      const ast = parse('text(10, 20) { tspan(0, 16, 45)`rotated` }');
      const stmt = ast.body[0] as any;
      expect(stmt.body[0]).toMatchObject({
        type: 'TspanStatement',
        dx: { type: 'NumberLiteral', value: 0 },
        dy: { type: 'NumberLiteral', value: 16 },
        rotation: { type: 'NumberLiteral', value: 45 },
      });
    });
  });

  describe('color literals', () => {
    it('parses 6-digit hex color literal', () => {
      const ast = parse('let c = #cc0000;');
      const decl = ast.body[0] as any;
      expect(decl.value).toMatchObject({
        type: 'ColorLiteral',
        raw: '#cc0000',
      });
    });

    it('parses 3-digit hex color literal', () => {
      const ast = parse('let c = #f00;');
      const decl = ast.body[0] as any;
      expect(decl.value).toMatchObject({
        type: 'ColorLiteral',
        raw: '#f00',
      });
    });

    it('parses 8-digit hex color literal (with alpha)', () => {
      const ast = parse('let c = #cc000080;');
      const decl = ast.body[0] as any;
      expect(decl.value).toMatchObject({
        type: 'ColorLiteral',
        raw: '#cc000080',
      });
    });

    it('parses 4-digit hex color literal (with alpha)', () => {
      const ast = parse('let c = #f008;');
      const decl = ast.body[0] as any;
      expect(decl.value).toMatchObject({
        type: 'ColorLiteral',
        raw: '#f008',
      });
    });

    it('parses hex literal with method chaining', () => {
      const ast = parse('let c = (#cc0000).lighten(0.2);');
      const decl = ast.body[0] as any;
      // The parenthesized expr gets parsed, then .lighten() via withPostfix
      // The outer expression is a MethodCallExpression
      expect(decl.value.type).toBe('MethodCallExpression');
      expect(decl.value.method).toBe('lighten');
    });

    it('parses hex literal inside Color()', () => {
      const ast = parse('let c = Color(#cc0000);');
      const decl = ast.body[0] as any;
      expect(decl.value).toMatchObject({
        type: 'FunctionCall',
        name: 'Color',
      });
      expect(decl.value.args[0]).toMatchObject({
        type: 'ColorLiteral',
        raw: '#cc0000',
      });
    });
  });

  describe('CSS color function literals', () => {
    it('parses rgb() as ColorLiteral', () => {
      const ast = parse('let c = rgb(255, 0, 0);');
      const decl = ast.body[0] as any;
      expect(decl.value).toMatchObject({
        type: 'ColorLiteral',
        raw: 'rgb(255, 0, 0)',
      });
    });

    it('parses rgba() as ColorLiteral', () => {
      const ast = parse('let c = rgba(255, 0, 0, 0.5);');
      const decl = ast.body[0] as any;
      expect(decl.value).toMatchObject({
        type: 'ColorLiteral',
        raw: 'rgba(255, 0, 0, 0.5)',
      });
    });

    it('parses hsl() as ColorLiteral', () => {
      const ast = parse('let c = hsl(0, 100%, 50%);');
      const decl = ast.body[0] as any;
      expect(decl.value).toMatchObject({
        type: 'ColorLiteral',
        raw: 'hsl(0, 100%, 50%)',
      });
    });

    it('parses oklch() as ColorLiteral', () => {
      const ast = parse('let c = oklch(0.6 0.15 30);');
      const decl = ast.body[0] as any;
      expect(decl.value).toMatchObject({
        type: 'ColorLiteral',
        raw: 'oklch(0.6 0.15 30)',
      });
    });

    it('parses oklch() with alpha as ColorLiteral', () => {
      const ast = parse('let c = oklch(0.6 0.15 30 / 0.5);');
      const decl = ast.body[0] as any;
      expect(decl.value).toMatchObject({
        type: 'ColorLiteral',
        raw: 'oklch(0.6 0.15 30 / 0.5)',
      });
    });

    it('parses CSS color function with method chaining', () => {
      const ast = parse('let c = rgb(255, 0, 0).lighten(0.2);');
      const decl = ast.body[0] as any;
      expect(decl.value.type).toBe('MethodCallExpression');
      expect(decl.value.method).toBe('lighten');
      expect(decl.value.object).toMatchObject({
        type: 'ColorLiteral',
        raw: 'rgb(255, 0, 0)',
      });
    });
  });

  describe('percent suffix', () => {
    it('parses number with percent suffix', () => {
      const ast = parse('let x = 20%;');
      const decl = ast.body[0] as any;
      expect(decl.value).toMatchObject({
        type: 'NumberLiteral',
        value: 20,
        unit: '%',
      });
    });

    it('parses percent suffix with decimal', () => {
      const ast = parse('let x = 50.5%;');
      const decl = ast.body[0] as any;
      expect(decl.value).toMatchObject({
        type: 'NumberLiteral',
        value: 50.5,
        unit: '%',
      });
    });

    it('parses modulus operator with spaces', () => {
      const ast = parse('let x = calc(10 % 3);');
      const decl = ast.body[0] as any;
      const calcExpr = decl.value;
      expect(calcExpr.type).toBe('CalcExpression');
      expect(calcExpr.expression).toMatchObject({
        type: 'BinaryExpression',
        operator: '%',
        left: { type: 'NumberLiteral', value: 10 },
        right: { type: 'NumberLiteral', value: 3 },
      });
    });

    it('parses percent suffix and modulus together', () => {
      const ast = parse('let x = calc(20% % 2%);');
      const decl = ast.body[0] as any;
      const calcExpr = decl.value;
      expect(calcExpr.type).toBe('CalcExpression');
      expect(calcExpr.expression).toMatchObject({
        type: 'BinaryExpression',
        operator: '%',
        left: { type: 'NumberLiteral', value: 20, unit: '%' },
        right: { type: 'NumberLiteral', value: 2, unit: '%' },
      });
    });
  });
});
