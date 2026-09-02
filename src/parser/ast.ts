// AST Node Types for pathogen-lang

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
  | SwitchStatement
  | FunctionDefinition
  | EnumDefinition
  | PathCommand
  | ViewBoxDefinition
  | LayerDefinition
  | LayerApplyBlock
  | TextStatement
  | CalcExpression
  | FunctionCall
  | LambdaExpression
  | TernaryExpression
  | BinaryExpression
  | UnaryExpression
  | MemberExpression
  | NullLiteral
  | BooleanLiteral
  | SpreadElement
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
  | SwitchStatement
  | FunctionDefinition
  | EnumDefinition
  | ReturnStatement
  | BreakStatement
  | ContinueStatement
  | PathCommand
  | ViewBoxDefinition
  | LayerDefinition
  | LayerApplyBlock
  | TextStatement
  | FontDirective;

// let x = 10; or let [a, b] = expr; or let { x, y } = expr;
export interface LetDeclaration {
  type: 'LetDeclaration';
  name: string;
  pattern?: ArrayDestructuringPattern | ObjectDestructuringPattern;
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

// switch (value) { case pattern { ... } default { ... } }
// No fallthrough: the first matching case runs and the switch ends. Case
// bodies are ordinary blocks (loop-transparent break/continue, own scope).
// Text-block switches reuse this node with TextBodyItem[] bodies, exactly as
// TextIfStatement reuses IfStatement.
export interface SwitchStatement {
  type: 'SwitchStatement';
  discriminant: Expression;
  cases: SwitchCase[];              // source order; never contains the default
  defaultCase: SwitchDefault | null; // builder guarantees: last clause, at most one
  loc?: SourceLocation;
}

// case p1, p2 where guard { ... }
export interface SwitchCase {
  type: 'SwitchCase';
  patterns: CasePattern[];          // >= 1; comma alternatives share the body and the guard
  guard: Expression | null;         // `where` expression, evaluated after bindings
  body: Statement[];
  loc?: SourceLocation;
}

// default { ... }
export interface SwitchDefault {
  type: 'SwitchDefault';
  body: Statement[];
  loc?: SourceLocation;
}

// A case pattern: a value compared with `==` rules, a numeric range, or a
// destructuring shape that binds names for the body.
export type CasePattern =
  | ValuePattern
  | RangePattern
  | ArrayDestructuringPattern
  | ObjectDestructuringPattern;

// case expr — any expression; a bare name is the variable's value, never a binding
export interface ValuePattern {
  type: 'ValuePattern';
  value: Expression;
  loc?: SourceLocation;
}

// case a..b / a..<b / ..b / ..<b / a..
export interface RangePattern {
  type: 'RangePattern';
  start: Expression | null;         // null = open lower bound
  end: Expression | null;           // null = open upper bound
  inclusive: boolean;               // `..` true, `..<` false (only meaningful with an end)
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
  /** True for the expression-bodied lambda sugar {|v| v * 2} — the return
   *  was synthesized, so the formatter must not print the keyword. */
  implicit?: boolean;
}

// break;
export interface BreakStatement {
  type: 'BreakStatement';
  loc?: SourceLocation;
}

// continue;
export interface ContinueStatement {
  type: 'ContinueStatement';
  loc?: SourceLocation;
}

// `with <cornerOp>(...)` — behavior recorded on the vertex this command creates
export interface CornerOpAnnotation {
  kind: 'fillet' | 'chamfer' | 'ellipticalFillet';
  args: Expression[];
  loc?: SourceLocation;
}

// `as segment('name')` / `as endpoint('name')` — labels attached to this command
export interface LabelAnnotation {
  kind: 'segment' | 'endpoint';
  name: Expression; // expression-valued so loop labels like segment('rib-${i}') work
  loc?: SourceLocation;
}

export interface PathCommandAnnotations {
  cornerOp?: CornerOpAnnotation;
  labels?: LabelAnnotation[];
}

// M x y, L 10 20, etc.
export interface PathCommand {
  type: 'PathCommand';
  command: string; // M, m, L, l, H, h, V, v, C, c, S, s, Q, q, T, t, A, a, Z, z
  args: PathArg[];
  annotations?: PathCommandAnnotations;
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

// Shared shape of a block-with-params: trailing blocks and lambda literals
export interface BlockFunction {
  params: string[];
  body: Statement[];
}

// Lambda literal: {|a, b| return a + b; } in expression position
export interface LambdaExpression extends BlockFunction {
  type: 'LambdaExpression';
  loc?: SourceLocation;
}

// sin(x), star(10, 20, 5, 6)
export interface FunctionCall {
  type: 'FunctionCall';
  name: string;
  args: Expression[];
  block?: BlockFunction; // Trailing block: {|param1, param2, ...| statements}
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

// Spread element: ...expr (used in array/object literals)
export interface SpreadElement {
  type: 'SpreadElement';
  argument: Expression;
}

// Array literal: [1, 2, 3] or [1, ...arr, 2]
export interface ArrayLiteral {
  type: 'ArrayLiteral';
  elements: (Expression | SpreadElement)[];
}

// Object property: key: value, or shorthand { key } desugared to key: key
export interface ObjectProperty {
  type: 'ObjectProperty';
  key: string;
  value: Expression;
  // True when written as shorthand ({ x } for { x: x }); value holds the
  // desugared Identifier. Source printers use this to round-trip the sugar.
  shorthand?: true;
}

// Object literal: { key: value, ... } or { ...obj, key: value }
export interface ObjectLiteral {
  type: 'ObjectLiteral';
  properties: (ObjectProperty | SpreadElement)[];
}

// Array destructuring: let [a, b, ...rest] = expr;
export interface ArrayDestructuringPattern {
  type: 'ArrayDestructuringPattern';
  elements: string[];
  rest?: string;
  loc?: SourceLocation;
}

// Object destructuring: let { x, y: alias, ...rest } = expr;
export interface ObjectDestructuringPattern {
  type: 'ObjectDestructuringPattern';
  properties: { key: string; alias?: string }[];
  rest?: string;
  loc?: SourceLocation;
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
  block?: BlockFunction;
  loc?: SourceLocation;
}

// Style block literal: ${ stroke: red; stroke-width: 2; }
export interface StyleBlockLiteral {
  type: 'StyleBlockLiteral';
  properties: StyleProperty[];
  // Set when a declaration is malformed (e.g. missing a required trailing `;`).
  // AST-building stays lenient (so the language service remains resilient while
  // a block is being typed); the evaluator throws this as a strict error, so
  // it surfaces at compile time and as an editor diagnostic (Phase 3 eval).
  incomplete?: { message: string; line: number; column: number };
}

// text(x, y)`content` or text(x, y) { `text` tspan()... }
export type TextBodyItem = TspanStatement | TemplateLiteral | ForLoop | ForEachLoop | IfStatement | SwitchStatement | LetDeclaration | BreakStatement | ContinueStatement;

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
  loc?: SourceLocation; // start of the declaration name (for diagnostics)
  nameEnd?: number; // offset just past the property name
  valueLoc?: SourceLocation; // start of the trimmed value
  valueEnd?: number; // offset just past the trimmed value
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

// define ViewBox(originX, originY, width, height);
export interface ViewBoxDefinition {
  type: 'ViewBoxDefinition';
  originX: Expression;
  originY: Expression;
  width: Expression;
  height: Expression;
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
// or @font familyVar (a top-level let bound to a string literal)
export interface FontDirective {
  type: 'FontDirective';
  source: string; // Font family name, file path, or variable name (see sourceKind)
  sourceKind?: 'literal' | 'identifier'; // absent means 'literal'
  weight?: number; // Optional specific weight (100-900)
  loc?: SourceLocation;
}

export type Expression =
  | TernaryExpression
  | BinaryExpression
  | UnaryExpression
  | CalcExpression
  | FunctionCall
  | LambdaExpression
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
