// AST Node Types for svg-path-extended

// Source location for annotated output
export interface SourceLocation {
  line: number;
  column: number;
  offset: number;
}

// Comment node for preserving comments in annotated output
export interface Comment {
  type: 'Comment';
  text: string;
  loc: SourceLocation;
}

export type Node =
  | Program
  | Comment
  | LetDeclaration
  | AssignmentStatement
  | IndexedAssignmentStatement
  | MemberAssignmentStatement
  | ExpressionStatement
  | ForLoop
  | ForEachLoop
  | IfStatement
  | FunctionDefinition
  | EnumDefinition
  | PathCommand
  | LayerDefinition
  | LayerApplyBlock
  | TextStatement
  | CalcExpression
  | FunctionCall
  | TernaryExpression
  | BinaryExpression
  | UnaryExpression
  | MemberExpression
  | NullLiteral
  | BooleanLiteral
  | ArrayLiteral
  | ObjectLiteral
  | IndexExpression
  | MethodCallExpression
  | LayerConstructorExpression
  | ColorLiteral
  | Identifier
  | NumberLiteral
  | StringLiteral
  | TemplateLiteral
  | StyleBlockLiteral
  | PathBlockExpression
  | TextBlockExpression
  | FontDirective;

export interface Program {
  type: 'Program';
  body: Statement[];
}

export type Statement =
  | Comment
  | LetDeclaration
  | AssignmentStatement
  | IndexedAssignmentStatement
  | MemberAssignmentStatement
  | ExpressionStatement
  | ForLoop
  | ForEachLoop
  | IfStatement
  | FunctionDefinition
  | EnumDefinition
  | ReturnStatement
  | PathCommand
  | LayerDefinition
  | LayerApplyBlock
  | TextStatement
  | FontDirective;

// let x = 10;
export interface LetDeclaration {
  type: 'LetDeclaration';
  name: string;
  value: Expression;
  loc?: SourceLocation;
}

// x = 10;
export interface AssignmentStatement {
  type: 'AssignmentStatement';
  name: string;
  value: Expression;
  loc?: SourceLocation;
}

// for (i in 0..10) { ... }
export interface ForLoop {
  type: 'ForLoop';
  variable: string;
  start: Expression;
  end: Expression;
  body: Statement[];
  loc?: SourceLocation;
}

// for (item in list) { ... } or for ([item, index] in list) { ... }
export interface ForEachLoop {
  type: 'ForEachLoop';
  variable: string;
  indexVariable?: string;
  iterable: Expression;
  body: Statement[];
  loc?: SourceLocation;
}

// if (condition) { ... } else { ... }
export interface IfStatement {
  type: 'IfStatement';
  condition: Expression;
  consequent: Statement[];
  alternate: Statement[] | null;
  loc?: SourceLocation;
}

// fn name(a, b) { ... }
export interface FunctionDefinition {
  type: 'FunctionDefinition';
  name: string;
  params: string[];
  body: Statement[];
  loc?: SourceLocation;
}

// return expr;
export interface ReturnStatement {
  type: 'ReturnStatement';
  value: Expression;
}

// M x y, L 10 20, etc.
export interface PathCommand {
  type: 'PathCommand';
  command: string; // M, m, L, l, H, h, V, v, C, c, S, s, Q, q, T, t, A, a, Z, z
  args: PathArg[];
  loc?: SourceLocation;
}

export type PathArg =
  | NumberLiteral
  | BooleanLiteral
  | Identifier
  | CalcExpression
  | FunctionCall
  | MemberExpression
  | IndexExpression
  | MethodCallExpression;

// calc(x + 10)
export interface CalcExpression {
  type: 'CalcExpression';
  expression: Expression;
}

// sin(x), star(10, 20, 5, 6)
export interface FunctionCall {
  type: 'FunctionCall';
  name: string;
  args: Expression[];
  block?: { params: string[]; body: Statement[] }; // Trailing block: {|param1, param2, ...| statements}
  loc?: SourceLocation;
}

// x + y, x * 2, etc.
export interface BinaryExpression {
  type: 'BinaryExpression';
  operator: '+' | '-' | '*' | '/' | '%' | '<' | '>' | '<=' | '>=' | '==' | '!=' | '&&' | '||' | '<<';
  left: Expression;
  right: Expression;
}

// condition ? consequent : alternate
export interface TernaryExpression {
  type: 'TernaryExpression';
  condition: Expression;
  consequent: Expression;
  alternate: Expression;
}

// -x, !x
export interface UnaryExpression {
  type: 'UnaryExpression';
  operator: '-' | '!';
  argument: Expression;
}

// Property access: ctx.x, ctx.position.x
export interface MemberExpression {
  type: 'MemberExpression';
  object: Expression;
  property: string;
}

// Variable reference
export interface Identifier {
  type: 'Identifier';
  name: string;
  loc?: SourceLocation;
}

// Numeric literal
export interface NumberLiteral {
  type: 'NumberLiteral';
  value: number;
  unit?: 'deg' | 'rad' | 'pi' | '%'; // Optional unit suffix (angle or percent)
}

// String literal (for log messages)
export interface StringLiteral {
  type: 'StringLiteral';
  value: string;
}

// Template literal: `hello ${name}!`
export interface TemplateLiteral {
  type: 'TemplateLiteral';
  parts: (string | Expression)[]; // Alternating strings and expressions
}

// null literal
export interface NullLiteral {
  type: 'NullLiteral';
}

// boolean literal
export interface BooleanLiteral {
  type: 'BooleanLiteral';
  value: boolean;
}

// enum definition
export interface EnumDefinition {
  type: 'EnumDefinition';
  name: string;
  members: { name: string; value?: Expression }[];
  loc?: SourceLocation;
}

// Array literal: [1, 2, 3]
export interface ArrayLiteral {
  type: 'ArrayLiteral';
  elements: Expression[];
}

// Object literal: { key: value, ... }
export interface ObjectLiteral {
  type: 'ObjectLiteral';
  properties: { key: string; value: Expression }[];
}

// Indexed assignment: obj['key'] = value; or arr[0] = value;
export interface IndexedAssignmentStatement {
  type: 'IndexedAssignmentStatement';
  object: Expression;
  index: Expression;
  value: Expression;
  loc?: SourceLocation;
}

// Index access: list[0]
export interface IndexExpression {
  type: 'IndexExpression';
  object: Expression;
  index: Expression;
}

// Method call: list.push(val) or list.map {|item| ... }
export interface MethodCallExpression {
  type: 'MethodCallExpression';
  object: Expression;
  method: string;
  args: Expression[];
  block?: { params: string[]; body: Statement[] };
  loc?: SourceLocation;
}

// Style block literal: ${ stroke: red; stroke-width: 2; }
export interface StyleBlockLiteral {
  type: 'StyleBlockLiteral';
  properties: StyleProperty[];
}

// text(x, y)`content` or text(x, y) { `text` tspan()... }
export type TextBodyItem = TspanStatement | TemplateLiteral | ForLoop | ForEachLoop | IfStatement | LetDeclaration;

export interface TextStatement {
  type: 'TextStatement';
  x: Expression;
  y: Expression;
  rotation?: Expression;
  styles?: Expression;
  content?: TemplateLiteral; // Inline form: text(x, y)`content`
  body?: TextBodyItem[]; // Block form: text(x, y) { `text` tspan()... }
  loc?: SourceLocation;
}

// tspan()`content` — only valid inside text() block
export interface TspanStatement {
  type: 'TspanStatement';
  dx?: Expression;
  dy?: Expression;
  rotation?: Expression;
  styles?: Expression;
  content: TemplateLiteral;
  loc?: SourceLocation;
}

// Style property in a layer definition: stroke: #cc0000;
export interface StyleProperty {
  type: 'StyleProperty';
  name: string; // e.g. 'stroke', 'stroke-width'
  value: string; // raw string e.g. '#cc0000', '4 1 2 3'
}

// define [default] PathLayer('name') ${ style declarations }
export interface LayerDefinition {
  type: 'LayerDefinition';
  layerType: 'PathLayer' | 'TextLayer' | 'GroupLayer';
  name: Expression;
  isDefault: boolean;
  styleExpr: Expression;
  loc?: SourceLocation;
}

// PathLayer('name') or PathLayer('name') ${ ... } as an expression
export interface LayerConstructorExpression {
  type: 'LayerConstructorExpression';
  layerType: 'PathLayer' | 'TextLayer' | 'GroupLayer';
  name: Expression;
  styleExpr?: Expression; // Optional trailing style block
  loc?: SourceLocation;
}

// expr.property = value;
export interface MemberAssignmentStatement {
  type: 'MemberAssignmentStatement';
  object: Expression;
  property: string;
  value: Expression;
  loc?: SourceLocation;
}

// expression;  (bare expression as a statement)
export interface ExpressionStatement {
  type: 'ExpressionStatement';
  expression: Expression;
  loc?: SourceLocation;
}

// layer('name').apply { statements }
export interface LayerApplyBlock {
  type: 'LayerApplyBlock';
  layerName: Expression;
  body: Statement[];
  loc?: SourceLocation;
}

// Color literal: #cc0000, #f00, #cc000080, #f008
export interface ColorLiteral {
  type: 'ColorLiteral';
  raw: string; // e.g., '#cc0000'
  loc?: SourceLocation;
}

// Path block expression: @{ relative path commands }
export interface PathBlockExpression {
  type: 'PathBlockExpression';
  body: Statement[];
  loc?: SourceLocation;
}

// Text block expression: &{ text statements }
export interface TextBlockExpression {
  type: 'TextBlockExpression';
  body: Statement[];
  loc?: SourceLocation;
}

// @font "Inter" or @font "./fonts/Custom.ttf" or @font "Inter" 700
export interface FontDirective {
  type: 'FontDirective';
  source: string; // Font family name or file path
  weight?: number; // Optional specific weight (100-900)
  loc?: SourceLocation;
}

export type Expression =
  | TernaryExpression
  | BinaryExpression
  | UnaryExpression
  | CalcExpression
  | FunctionCall
  | MemberExpression
  | NullLiteral
  | BooleanLiteral
  | ArrayLiteral
  | ObjectLiteral
  | IndexExpression
  | MethodCallExpression
  | LayerConstructorExpression
  | ColorLiteral
  | Identifier
  | NumberLiteral
  | StringLiteral
  | TemplateLiteral
  | StyleBlockLiteral
  | PathBlockExpression
  | TextBlockExpression;
