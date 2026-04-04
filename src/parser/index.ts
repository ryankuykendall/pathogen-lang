import Parsimmon from 'parsimmon';

import type {
  ArrayDestructuringPattern,
  ArrayLiteral,
  AssignmentStatement,
  BinaryExpression,
  BooleanLiteral,
  CalcExpression,
  ColorLiteral,
  Comment,
  EnumDefinition,
  Expression,
  ExpressionStatement,
  FontDirective,
  ForEachLoop,
  ForLoop,
  FunctionCall,
  FunctionDefinition,
  Identifier,
  IfStatement,
  IndexedAssignmentStatement,
  LayerApplyBlock,
  LayerConstructorExpression,
  LayerDefinition,
  LetDeclaration,
  MemberAssignmentStatement,
  NullLiteral,
  NumberLiteral,
  ObjectDestructuringPattern,
  ObjectLiteral,
  ObjectProperty,
  PathArg,
  PathBlockExpression,
  PathCommand,
  Program,
  ReturnStatement,
  SourceLocation,
  SpreadElement,
  Statement,
  StringLiteral,
  StyleBlockLiteral,
  StyleProperty,
  TemplateLiteral,
  TextBlockExpression,
  TextBodyItem,
  TextStatement,
  TspanStatement,
  UnaryExpression,
} from './ast';

const P = Parsimmon;

// Helper to convert Parsimmon Index to SourceLocation
function indexToLoc(index: Parsimmon.Index): SourceLocation {
  return {
    line: index.line,
    column: index.column,
    offset: index.offset,
  };
}

// Path command letters (cannot be used as identifiers in path context)
const PATH_COMMANDS = 'MLHVCSQTAZmlhvcsqtaz';

// Whitespace and comments (// line comments)
const optWhitespace = P.regexp(/(?:\s|\/\/[^\n]*)*/);

// Lexer helpers
function token<T>(parser: Parsimmon.Parser<T>): Parsimmon.Parser<T> {
  return parser.skip(optWhitespace);
}

function word(str: string): Parsimmon.Parser<string> {
  return token(P.string(str));
}

function keyword(str: string): Parsimmon.Parser<string> {
  return token(P.regexp(new RegExp(`${str}(?![a-zA-Z0-9_])`)));
}

// Number literal: 123, 45.67, -89, .5, optionally with unit suffix (deg/rad/pi/%)
// Uses negative lookahead to avoid consuming '.' when followed by '..' (range operator)
const numberLiteral: Parsimmon.Parser<NumberLiteral> = token(
  P.regexp(/-?(?:\d+(?:\.(?!\.))\d*|\.\d+|\d+)(deg|rad|pi|%)?/),
).map((str) => {
  const match = /^(-?(?:\d+(?:\.\d*)?|\.\d+|\d+))(deg|rad|pi|%)?$/.exec(str);
  return {
    type: 'NumberLiteral' as const,
    value: parseFloat(match![1]),
    unit: match![2] as 'deg' | 'rad' | 'pi' | '%' | undefined,
  };
});

// String literal: "hello" or 'hello'
// Supports escape sequences: \n, \t, \\, \", \'
const stringLiteral: Parsimmon.Parser<StringLiteral> = token(
  P.alt(
    P.regexp(/"(?:[^"\\]|\\.)*"/).map((str) => str.slice(1, -1)),
    P.regexp(/'(?:[^'\\]|\\.)*'/).map((str) => str.slice(1, -1)),
  ),
).map((value) => ({
  type: 'StringLiteral' as const,
  value: value
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'")
    .replace(/\\\\/g, '\\'),
}));

// Color literal: #cc0000, #f00, #cc000080, #f008
const colorLiteral: Parsimmon.Parser<ColorLiteral> = P.seqMap(
  P.index,
  token(P.regexp(/#[0-9a-fA-F]{3,8}\b/)),
  (startIndex, raw) => ({
    type: 'ColorLiteral' as const,
    raw,
    loc: indexToLoc(startIndex),
  }),
);

// CSS color function names that produce color literals via raw capture
const cssColorFunctionNames = ['rgb', 'rgba', 'hsl', 'hsla', 'hwb', 'lab', 'lch', 'oklab', 'oklch'];

// CSS color function literal: rgb(255, 0, 0), hsl(0, 100%, 50%), oklch(0.6 0.15 30), etc.
// Uses raw capture for arguments to avoid conflicts with % and / inside parens.
const cssColorLiteral: Parsimmon.Parser<ColorLiteral> = P.seqMap(
  P.index,
  token(P.regexp(new RegExp(`(${cssColorFunctionNames.join('|')})\\s*\\(`))),
  P.regexp(/[^)]*/),
  P.string(')').skip(optWhitespace),
  (startIndex, funcOpen, rawArgs, _close) => {
    const funcName = funcOpen.trim().replace('(', '');
    return {
      type: 'ColorLiteral' as const,
      raw: `${funcName}(${rawArgs.trim()})`,
      loc: indexToLoc(startIndex),
    };
  },
);

// Identifier: x, myVar, _private (for general use)
const identifier: Parsimmon.Parser<Identifier> = P.seqMap(
  P.index,
  token(P.regexp(/[a-zA-Z_][a-zA-Z0-9_]*/)),
  (startIndex, name) => ({
    type: 'Identifier' as const,
    name,
    loc: indexToLoc(startIndex),
  }),
);

// Reserved words that cannot be identifiers
const reservedWords = [
  'let',
  'for',
  'in',
  'if',
  'else',
  'fn',
  'calc',
  'log',
  'return',
  'define',
  'default',
  'layer',
  'apply',
  'text',
  'tspan',
  'null',
  'true',
  'false',
  'enum',
  'PathLayer',
  'TextLayer',
];

// Context-aware functions that should be parsed as statements, not path arguments
// These functions require path context and produce path output
const contextAwareFunctionNames = [
  'polarPoint',
  'polarOffset',
  'polarMove',
  'polarLine',
  'arcFromCenter',
  'tangentLine',
  'tangentArc',
  'heading',
  'turn',
];

const nonReservedIdentifier: Parsimmon.Parser<Identifier> = identifier.chain((id) =>
  reservedWords.includes(id.name) ? P.fail(`Reserved word: ${id.name}`) : P.succeed(id),
);

// Identifier that is NOT a path command letter (for path arguments)
const nonPathCommandIdentifier: Parsimmon.Parser<Identifier> = P.seqMap(
  P.index,
  token(P.regexp(/[a-zA-Z_][a-zA-Z0-9_]*/)),
  (startIndex, name) => ({ startIndex, name }),
).chain(({ startIndex, name }) => {
  if (name.length === 1 && PATH_COMMANDS.includes(name)) {
    return P.fail(`Path command letter cannot be used as identifier: ${name}`);
  }
  if (reservedWords.includes(name)) {
    return P.fail(`Reserved word: ${name}`);
  }
  return P.succeed({ type: 'Identifier' as const, name, loc: indexToLoc(startIndex) });
});

// Postfix operators: chains .method(args), .method {|p| ...}, .property, and [index] after a base expression
function withPostfix(base: Parsimmon.Parser<Expression>): Parsimmon.Parser<Expression> {
  type MethodPostfix = { type: 'method'; method: string; args: Expression[]; block?: { params: string[]; body: Statement[] }; loc: SourceLocation };
  type MemberPostfix = { type: 'member'; prop: string };
  type IndexPostfix = { type: 'index'; index: Expression };
  type Postfix = MethodPostfix | MemberPostfix | IndexPostfix;

  return base.chain((baseExpr) =>
    P.alt<Postfix>(
      // .name {|param| body} → block-only method call (no parens)
      P.seqMap(
        P.index,
        P.string('.'),
        token(P.regexp(/[a-zA-Z_][a-zA-Z0-9_]*/)),
        trailingBlock,
        (startIndex, _dot, method, block): MethodPostfix => ({
          type: 'method',
          method,
          args: [],
          block,
          loc: indexToLoc(startIndex),
        }),
      ),
      // .name(args) {|param| body}? → MethodCallExpression with optional trailing block
      P.seqMap(
        P.index,
        P.string('.'),
        token(P.regexp(/[a-zA-Z_][a-zA-Z0-9_]*/)),
        P.string('(').skip(optWhitespace),
        P.sepBy(
          P.lazy(() => expression),
          word(','),
        ),
        word(')'),
        trailingBlock.atMost(1),
        (startIndex, _dot, method, _open, args, _close, block): MethodPostfix => ({
          type: 'method',
          method,
          args,
          ...(block.length > 0 ? { block: block[0] } : {}),
          loc: indexToLoc(startIndex),
        }),
      ),
      // .name → MemberExpression
      P.seq(P.string('.'), token(P.regexp(/[a-zA-Z_][a-zA-Z0-9_]*/))).map(
        ([, prop]): MemberPostfix => ({ type: 'member', prop }),
      ),
      // [expr] → IndexExpression
      P.seq(
        P.string('[').skip(optWhitespace),
        P.lazy(() => expression),
        word(']'),
      ).map(([, index]): IndexPostfix => ({ type: 'index', index })),
    )
      .many()
      .map((postfixes: Postfix[]) =>
        postfixes.reduce<Expression>((obj, postfix) => {
          if (postfix.type === 'method') {
            return {
              type: 'MethodCallExpression' as const,
              object: obj,
              method: postfix.method,
              args: postfix.args,
              ...(postfix.block ? { block: postfix.block } : {}),
              loc: postfix.loc,
            };
          }
          if (postfix.type === 'member') {
            return { type: 'MemberExpression' as const, object: obj, property: postfix.prop };
          }
          return { type: 'IndexExpression' as const, object: obj, index: postfix.index };
        }, baseExpr),
      ),
  );
}

// Member/index expression for path arguments (base cannot be path command letter or context-aware function call)
// Type is narrowed to PathArg-compatible types
const pathMemberExpression: Parsimmon.Parser<PathArg> =
  // First check: fail if this is a context-aware function followed by '('
  P.lookahead(
    P.regexp(/[a-zA-Z_][a-zA-Z0-9_]*/)
      .chain((name) => {
        if (contextAwareFunctionNames.includes(name)) {
          // Peek ahead to check if followed by '(' (with optional whitespace)
          return P.regexp(/\s*\(/)
            .map(() => 'function-call')
            .or(P.succeed('not-function-call'));
        }
        return P.succeed('not-context-aware');
      })
      .chain((result) => {
        if (result === 'function-call') {
          return P.fail('context-aware function call');
        }
        return P.succeed(null);
      }),
  ).then(
    nonPathCommandIdentifier.chain((baseExpr) =>
      P.alt(
        // .name(args) → MethodCallExpression
        P.seqMap(
          P.index,
          P.string('.'),
          token(P.regexp(/[a-zA-Z_][a-zA-Z0-9_]*/)),
          P.string('(').skip(optWhitespace),
          P.sepBy(
            P.lazy(() => expression),
            word(','),
          ),
          word(')'),
          (
            startIndex,
            _dot,
            method,
            _open,
            args,
          ): { type: 'method'; method: string; args: Expression[]; loc: SourceLocation } => ({
            type: 'method',
            method,
            args,
            loc: indexToLoc(startIndex),
          }),
        ),
        // .name → MemberExpression
        P.seq(P.string('.'), token(P.regexp(/[a-zA-Z_][a-zA-Z0-9_]*/))).map(
          ([, prop]): { type: 'member'; prop: string } => ({ type: 'member', prop }),
        ),
        // [expr] → IndexExpression
        P.seq(
          P.string('[').skip(optWhitespace),
          P.lazy(() => expression),
          word(']'),
        ).map(([, index]): { type: 'index'; index: Expression } => ({ type: 'index', index })),
      )
        .many()
        .map((postfixes) =>
          postfixes.reduce<PathArg>((obj, postfix) => {
            if (postfix.type === 'method') {
              return {
                type: 'MethodCallExpression' as const,
                object: obj as Expression,
                method: postfix.method,
                args: postfix.args,
                loc: (postfix as { loc: SourceLocation }).loc,
              };
            }
            if (postfix.type === 'member') {
              return { type: 'MemberExpression' as const, object: obj as Expression, property: postfix.prop };
            }
            return { type: 'IndexExpression' as const, object: obj as Expression, index: postfix.index };
          }, baseExpr),
        ),
    ),
  );

// Expression parser with operator precedence
const expression: Parsimmon.Parser<Expression> = P.lazy(() => ternaryExpression);

// Ternary: condition ? consequent : alternate (right-associative, lowest precedence)
const ternaryExpression: Parsimmon.Parser<Expression> = P.lazy(() =>
  orExpression.chain((condition) =>
    P.seq(
      optWhitespace.then(P.string('?')).skip(optWhitespace),
      ternaryExpression,
      optWhitespace.then(P.string(':')).skip(optWhitespace),
      ternaryExpression,
    )
      .map(([, consequent, , alternate]) => ({
        type: 'TernaryExpression' as const,
        condition,
        consequent,
        alternate,
      }))
      .or(P.of(condition)),
  ),
);

// Operators by precedence (lowest to highest)
const orExpression: Parsimmon.Parser<Expression> = P.lazy(() =>
  andExpression.chain((first) =>
    P.seq(word('||'), andExpression)
      .many()
      .map((rest) =>
        rest.reduce<Expression>(
          (left, [op, right]) => ({
            type: 'BinaryExpression',
            operator: op as BinaryExpression['operator'],
            left,
            right,
          }),
          first,
        ),
      ),
  ),
);

const andExpression: Parsimmon.Parser<Expression> = P.lazy(() =>
  equalityExpression.chain((first) =>
    P.seq(word('&&'), equalityExpression)
      .many()
      .map((rest) =>
        rest.reduce<Expression>(
          (left, [op, right]) => ({
            type: 'BinaryExpression',
            operator: op as BinaryExpression['operator'],
            left,
            right,
          }),
          first,
        ),
      ),
  ),
);

const equalityExpression: Parsimmon.Parser<Expression> = P.lazy(() =>
  comparisonExpression.chain((first) =>
    P.seq(P.alt(word('=='), word('!=')), comparisonExpression)
      .many()
      .map((rest) =>
        rest.reduce<Expression>(
          (left, [op, right]) => ({
            type: 'BinaryExpression',
            operator: op as BinaryExpression['operator'],
            left,
            right,
          }),
          first,
        ),
      ),
  ),
);

const comparisonExpression: Parsimmon.Parser<Expression> = P.lazy(() =>
  mergeExpression.chain((first) =>
    P.seq(P.alt(word('<='), word('>='), token(P.regexp(/<(?!<)/)), word('>')), mergeExpression)
      .many()
      .map((rest) =>
        rest.reduce<Expression>(
          (left, [op, right]) => ({
            type: 'BinaryExpression',
            operator: op as BinaryExpression['operator'],
            left,
            right,
          }),
          first,
        ),
      ),
  ),
);

const mergeExpression: Parsimmon.Parser<Expression> = P.lazy(() =>
  additiveExpression.chain((first) =>
    P.seq(word('<<'), additiveExpression)
      .many()
      .map((rest) =>
        rest.reduce<Expression>(
          (left, [op, right]) => ({
            type: 'BinaryExpression',
            operator: op as BinaryExpression['operator'],
            left,
            right,
          }),
          first,
        ),
      ),
  ),
);

const additiveExpression: Parsimmon.Parser<Expression> = P.lazy(() =>
  multiplicativeExpression.chain((first) =>
    P.seq(P.alt(word('+'), word('-')), multiplicativeExpression)
      .many()
      .map((rest) =>
        rest.reduce<Expression>(
          (left, [op, right]) => ({
            type: 'BinaryExpression',
            operator: op as BinaryExpression['operator'],
            left,
            right,
          }),
          first,
        ),
      ),
  ),
);

const multiplicativeExpression: Parsimmon.Parser<Expression> = P.lazy(() =>
  unaryExpression.chain((first) =>
    P.seq(P.alt(word('*'), word('/'), word('%')), unaryExpression)
      .many()
      .map((rest) =>
        rest.reduce<Expression>(
          (left, [op, right]) => ({
            type: 'BinaryExpression',
            operator: op as BinaryExpression['operator'],
            left,
            right,
          }),
          first,
        ),
      ),
  ),
);

const unaryExpression: Parsimmon.Parser<Expression> = P.lazy(() =>
  P.alt(
    P.seq(P.alt(word('-'), word('!')), unaryExpression).map(
      ([op, arg]): UnaryExpression => ({
        type: 'UnaryExpression',
        operator: op as UnaryExpression['operator'],
        argument: arg,
      }),
    ),
    primaryExpression,
  ),
);

// Trailing block: {|param1, param2, ...| statements} — parsed after function call closing paren
const trailingBlock: Parsimmon.Parser<{ params: string[]; body: Statement[] }> = P.seqMap(
  P.string('{').skip(optWhitespace),
  P.string('|').skip(optWhitespace),
  P.sepBy1(token(P.regexp(/[a-zA-Z_][a-zA-Z0-9_]*/)), word(',')),
  P.string('|').skip(optWhitespace),
  P.lazy(() => statement).many(),
  word('}'),
  (_open, _pipe1, params, _pipe2, body, _close) => ({ params, body }),
);

// Function call: name(arg1, arg2, ...) with optional trailing block
const functionCall: Parsimmon.Parser<FunctionCall> = P.seqMap(
  P.index,
  token(P.regexp(/[a-zA-Z_][a-zA-Z0-9_]*/)),
  P.string('(').skip(optWhitespace),
  P.sepBy(
    P.lazy(() => expression),
    word(','),
  ),
  word(')'),
  trailingBlock.atMost(1),
  (startIndex, name, _open, args, _close, block) => ({
    type: 'FunctionCall' as const,
    name,
    args,
    ...(block.length > 0 ? { block: block[0] } : {}),
    loc: indexToLoc(startIndex),
  }),
);

// Template literal: `hello ${name}!`
// Whitespace inside template literals is significant, so NO token() wrapper
const templateLiteral: Parsimmon.Parser<TemplateLiteral> = P.seq(
  P.string('`'),
  P.alt(
    P.string('${')
      .then(P.lazy(() => expression))
      .skip(P.string('}')),
    P.regexp(/(?:[^`\\$]|\\.|(?:\$(?!\{)))+/).map((raw) =>
      raw.replace(/\\`/g, '`').replace(/\\\$/g, '$').replace(/\\\\/g, '\\').replace(/\\n/g, '\n').replace(/\\t/g, '\t'),
    ),
  ).many(),
  P.string('`'),
)
  .skip(optWhitespace)
  .map(([, parts]) => ({
    type: 'TemplateLiteral' as const,
    parts,
  }));

// Null literal
const nullLiteral: Parsimmon.Parser<NullLiteral> = keyword('null').map(
  (): NullLiteral => ({
    type: 'NullLiteral' as const,
  }),
);

// Boolean literal
const booleanLiteral: Parsimmon.Parser<BooleanLiteral> = P.alt(
  keyword('true').map((): BooleanLiteral => ({ type: 'BooleanLiteral' as const, value: true })),
  keyword('false').map((): BooleanLiteral => ({ type: 'BooleanLiteral' as const, value: false })),
);

// Spread element: ...expr
const spreadElement: Parsimmon.Parser<SpreadElement> = P.seq(
  token(P.string('...')),
  P.lazy(() => expression),
).map(([, argument]): SpreadElement => ({
  type: 'SpreadElement' as const,
  argument,
}));

// Array literal: [], [1, 2, 3], [expr, ...arr, expr]
const arrayLiteral: Parsimmon.Parser<ArrayLiteral> = P.seq(
  word('['),
  P.sepBy(
    P.alt(
      spreadElement,
      P.lazy(() => expression),
    ),
    word(','),
  ),
  word(',').atMost(1),
  word(']'),
).map(
  ([, elements]): ArrayLiteral => ({
    type: 'ArrayLiteral' as const,
    elements,
  }),
);

// Object literal: { key: value, ... }
const objectProperty: Parsimmon.Parser<ObjectProperty> = P.seqMap(
  P.alt(
    nonReservedIdentifier.map((id: Identifier) => id.name),
    stringLiteral.map((s: StringLiteral) => s.value),
  ),
  word(':'),
  P.lazy(() => expression),
  (key, _colon, value) => ({ type: 'ObjectProperty' as const, key, value }),
);

const objectLiteral: Parsimmon.Parser<ObjectLiteral> = P.seq(
  word('{'),
  P.sepBy(
    P.alt(spreadElement, objectProperty),
    word(','),
  ),
  word(',').atMost(1), // optional trailing comma
  word('}'),
).map(
  ([, properties]): ObjectLiteral => ({
    type: 'ObjectLiteral' as const,
    properties,
  }),
);

// Path block expression: @{ relative path commands }
const pathBlockExpression: Parsimmon.Parser<PathBlockExpression> = P.seqMap(
  P.index,
  token(P.string('@{')),
  P.lazy(() => statement).many(),
  word('}'),
  (startIndex, _at, body, _close) => ({
    type: 'PathBlockExpression' as const,
    body,
    loc: indexToLoc(startIndex),
  }),
);

// Text block expression: &{ text statements }
const textBlockExpression: Parsimmon.Parser<TextBlockExpression> = P.seqMap(
  P.index,
  token(P.string('&{')),
  P.lazy(() => statement).many(),
  word('}'),
  (startIndex, _amp, body, _close) => ({
    type: 'TextBlockExpression' as const,
    body,
    loc: indexToLoc(startIndex),
  }),
);

// Layer constructor expression: PathLayer('name') or PathLayer('name') ${ ... }
const layerConstructorExpression: Parsimmon.Parser<LayerConstructorExpression> = P.seqMap(
  P.index,
  token(P.regexp(/PathLayer|TextLayer|GroupLayer/)),
  word('('),
  P.lazy(() => expression),
  word(')'),
  P.lazy(() => styleBlockLiteral).fallback(undefined as StyleBlockLiteral | undefined),
  (startIndex, layerType, _lp, name, _rp, styleExpr) => ({
    type: 'LayerConstructorExpression' as const,
    layerType: layerType as 'PathLayer' | 'TextLayer' | 'GroupLayer',
    name,
    ...(styleExpr ? { styleExpr } : {}),
    loc: indexToLoc(startIndex),
  }),
);

// Primary expression: style block, path block, color literal, number, string, template literal, calc, null, array, object, layer constructor, identifier (with optional postfix), function call (with optional postfix), or parenthesized expression
const primaryExpression: Parsimmon.Parser<Expression> = P.lazy(() =>
  P.alt(
    withPostfix(styleBlockLiteral),
    withPostfix(pathBlockExpression as Parsimmon.Parser<Expression>),
    withPostfix(textBlockExpression as Parsimmon.Parser<Expression>),
    nullLiteral,
    booleanLiteral,
    withPostfix(arrayLiteral as Parsimmon.Parser<Expression>),
    withPostfix(colorLiteral as Parsimmon.Parser<Expression>),
    withPostfix(cssColorLiteral as Parsimmon.Parser<Expression>),
    numberLiteral,
    stringLiteral,
    templateLiteral,
    calcExpression,
    withPostfix(layerConstructorExpression as Parsimmon.Parser<Expression>),
    withPostfix(functionCall),
    withPostfix(objectLiteral as Parsimmon.Parser<Expression>),
    withPostfix(nonReservedIdentifier),
    withPostfix(P.seq(word('('), expression, word(')')).map(([, expr]) => expr)),
  ),
);

// calc(expression)
const calcExpression: Parsimmon.Parser<CalcExpression> = P.seqMap(
  keyword('calc'),
  P.string('(').skip(optWhitespace),
  expression,
  word(')'),
  (_calc, _open, expr, _close) => ({
    type: 'CalcExpression' as const,
    expression: expr,
  }),
);

// Function call for path arguments (must check it's not a path command or reserved word)
// Uses lookahead to reject context-aware functions WITHOUT consuming input
const pathFunctionCall: Parsimmon.Parser<FunctionCall> = P.seqMap(
  // First, use lookahead to check if this is a context-aware function (fail early without consuming)
  P.lookahead(
    P.regexp(/[a-zA-Z_][a-zA-Z0-9_]*/).chain((name) => {
      if (contextAwareFunctionNames.includes(name)) {
        return P.fail('context-aware function');
      }
      return P.succeed(name);
    }),
  ),
  P.index,
  token(P.regexp(/[a-zA-Z_][a-zA-Z0-9_]*/)).chain((name) => {
    // Reject reserved words (they start statements, not function calls in path context)
    if (reservedWords.includes(name)) {
      return P.fail(`Reserved word: ${name}`);
    }
    return P.succeed(name);
  }),
  P.string('(').skip(optWhitespace),
  P.sepBy(
    P.lazy(() => expression),
    word(','),
  ),
  word(')'),
  (_lookahead, startIndex, name, _open, args, _close) => ({
    type: 'FunctionCall' as const,
    name,
    args,
    loc: indexToLoc(startIndex),
  }),
);

// Path argument: number, boolean, identifier (non-path-command) with optional property access, calc(), or function call
const pathArg: Parsimmon.Parser<PathArg> = P.alt(calcExpression, pathFunctionCall, booleanLiteral, numberLiteral, pathMemberExpression);

// Path command: M, L, C, A, Z, etc. followed by arguments
// Arguments stop when we see another path command letter or end of input
const pathCommand: Parsimmon.Parser<PathCommand> = P.seqMap(
  P.index,
  token(P.regexp(/[MLHVCSQTAZmlhvcsqtaz]/)),
  pathArg.many(),
  (startIndex, command, args) => ({
    type: 'PathCommand' as const,
    command,
    args,
    loc: indexToLoc(startIndex),
  }),
);

// Destructuring patterns for let declarations
const arrayDestructuringPattern: Parsimmon.Parser<ArrayDestructuringPattern> = P.seq(
  word('['),
  P.sepBy1(nonReservedIdentifier, word(',')),
  P.seq(word(','), token(P.string('...')), nonReservedIdentifier).atMost(1),
  word(']'),
).map(([, elements, restArr]): ArrayDestructuringPattern => ({
  type: 'ArrayDestructuringPattern' as const,
  elements: elements.map((id: Identifier) => id.name),
  ...(restArr.length > 0 ? { rest: (restArr[0] as [unknown, unknown, Identifier])[2].name } : {}),
}));

const objectDestructuringProp: Parsimmon.Parser<{ key: string; alias?: string }> = P.seqMap(
  nonReservedIdentifier,
  P.seq(word(':'), nonReservedIdentifier).atMost(1),
  (id, aliasArr) => ({
    key: id.name,
    ...(aliasArr.length > 0 ? { alias: (aliasArr[0] as [unknown, Identifier])[1].name } : {}),
  }),
);

const objectDestructuringPattern: Parsimmon.Parser<ObjectDestructuringPattern> = P.seq(
  word('{'),
  P.sepBy1(objectDestructuringProp, word(',')),
  P.seq(word(','), token(P.string('...')), nonReservedIdentifier).atMost(1),
  word('}'),
).map(([, properties, restArr]): ObjectDestructuringPattern => ({
  type: 'ObjectDestructuringPattern' as const,
  properties,
  ...(restArr.length > 0 ? { rest: (restArr[0] as [unknown, unknown, Identifier])[2].name } : {}),
}));

// let declaration: let x = 10; or let [a, b] = expr; or let { x, y } = obj;
const letDeclaration: Parsimmon.Parser<LetDeclaration> = P.alt(
  // Destructuring: let [a, b] = ...; or let { x, y } = ...;
  P.seqMap(
    P.index,
    keyword('let'),
    P.alt(arrayDestructuringPattern, objectDestructuringPattern),
    word('='),
    expression,
    word(';'),
    (startIndex, _let, pattern, _eq, value, _semi) => ({
      type: 'LetDeclaration' as const,
      name: '',
      pattern,
      value,
      loc: indexToLoc(startIndex),
    }),
  ),
  // Simple: let x = 10;
  P.seqMap(
    P.index,
    keyword('let'),
    nonReservedIdentifier,
    word('='),
    expression,
    word(';'),
    (startIndex, _let, id, _eq, value, _semi) => ({
      type: 'LetDeclaration' as const,
      name: id.name,
      value,
      loc: indexToLoc(startIndex),
    }),
  ),
);

// Block: { statements }
const block: Parsimmon.Parser<Statement[]> = P.lazy(() =>
  P.seq(word('{'), statement.many(), word('}')).map(([, stmts]) => stmts),
);

// Simple value for for-loop range (number or identifier, not full expression to avoid ambiguity)
const rangeValue: Parsimmon.Parser<Expression> = P.alt(numberLiteral, nonReservedIdentifier);

// for loop: for (i in 0..10) { ... }
const forLoop: Parsimmon.Parser<ForLoop> = P.seqMap(
  P.index,
  keyword('for'),
  word('('),
  nonReservedIdentifier,
  keyword('in'),
  rangeValue,
  token(P.string('..')),
  rangeValue,
  word(')'),
  block,
  (startIndex, _for, _lp, id, _in, start, _dots, end, _rp, body) => ({
    type: 'ForLoop' as const,
    variable: id.name,
    start,
    end,
    body,
    loc: indexToLoc(startIndex),
  }),
);

// for-each loop: for (item in list) { ... } or for ([item, index] in list) { ... }
const forEachLoop: Parsimmon.Parser<ForEachLoop> = P.seqMap(
  P.index,
  keyword('for'),
  word('('),
  P.alt(
    // Destructured: [item, index]
    P.seq(word('['), nonReservedIdentifier, word(','), nonReservedIdentifier, word(']')).map(([, item, , index]) => ({
      variable: item.name,
      indexVariable: index.name,
    })),
    // Simple: item
    nonReservedIdentifier.map((id) => ({ variable: id.name })),
  ),
  keyword('in'),
  expression,
  word(')'),
  block,
  (startIndex, _for, _lp, vars, _in, iterable, _rp, body) => ({
    type: 'ForEachLoop' as const,
    variable: vars.variable,
    indexVariable: (vars as { indexVariable?: string }).indexVariable,
    iterable,
    body,
    loc: indexToLoc(startIndex),
  }),
);

// if statement: if (condition) { ... } else { ... }
const ifStatement: Parsimmon.Parser<IfStatement> = P.seqMap(
  P.index,
  keyword('if'),
  word('('),
  expression,
  word(')'),
  block,
  P.seq(
    keyword('else'),
    P.alt(
      P.lazy(() => ifStatement).map((stmt) => [stmt]),
      block,
    ),
  )
    .map(([, b]) => b)
    .fallback(null),
  (startIndex, _if, _lp, condition, _rp, consequent, alternate) => ({
    type: 'IfStatement' as const,
    condition,
    consequent,
    alternate,
    loc: indexToLoc(startIndex),
  }),
);

// function definition: fn name(a, b) { ... }
const functionDefinition: Parsimmon.Parser<FunctionDefinition> = P.seqMap(
  P.index,
  keyword('fn'),
  nonReservedIdentifier,
  word('('),
  P.sepBy(nonReservedIdentifier, word(',')),
  word(')'),
  block,
  (startIndex, _fn, id, _lp, params, _rp, body) => ({
    type: 'FunctionDefinition' as const,
    name: id.name,
    params: params.map((p) => p.name),
    body,
    loc: indexToLoc(startIndex),
  }),
);

// return statement: return expr;
const returnStatement: Parsimmon.Parser<ReturnStatement> = P.seqMap(
  keyword('return'),
  expression,
  word(';'),
  (_return, value, _semi) => ({
    type: 'ReturnStatement' as const,
    value,
  }),
);

// Indexed assignment statement: obj['key'] = value; or arr[0] = value;
const indexedAssignmentStatement: Parsimmon.Parser<IndexedAssignmentStatement> = P.seqMap(
  P.index,
  withPostfix(
    P.alt(functionCall as Parsimmon.Parser<Expression>, nonReservedIdentifier as Parsimmon.Parser<Expression>),
  ),
  token(P.regexp(/=(?!=)/)),
  expression,
  word(';'),
  (startIndex, lhs, _eq, value, _semi) => {
    if (lhs.type !== 'IndexExpression') {
      return P.fail('expected index expression on left side of assignment') as unknown as IndexedAssignmentStatement;
    }
    return {
      type: 'IndexedAssignmentStatement' as const,
      object: lhs.object,
      index: lhs.index,
      value,
      loc: indexToLoc(startIndex),
    };
  },
).chain((result) => {
  if (result?.type === 'IndexedAssignmentStatement') {
    return P.succeed(result);
  }
  return P.fail('expected indexed assignment');
});

// Member assignment statement: expr.property = value;
const memberAssignmentStatement: Parsimmon.Parser<MemberAssignmentStatement> = P.seqMap(
  P.index,
  withPostfix(
    P.alt(functionCall as Parsimmon.Parser<Expression>, nonReservedIdentifier as Parsimmon.Parser<Expression>),
  ),
  token(P.regexp(/=(?!=)/)),
  expression,
  word(';'),
  (startIndex, lhs, _eq, value, _semi) => {
    if (lhs.type !== 'MemberExpression') {
      return P.fail('expected member expression on left side of assignment') as unknown as MemberAssignmentStatement;
    }
    return {
      type: 'MemberAssignmentStatement' as const,
      object: lhs.object,
      property: lhs.property,
      value,
      loc: indexToLoc(startIndex),
    };
  },
).chain((result) => {
  if (result?.type === 'MemberAssignmentStatement') {
    return P.succeed(result);
  }
  return P.fail('expected member assignment');
});

// Expression statement: expression;
const expressionStatement: Parsimmon.Parser<ExpressionStatement> = P.seqMap(
  P.index,
  expression,
  word(';'),
  (startIndex, expr, _semi) => ({
    type: 'ExpressionStatement' as const,
    expression: expr,
    loc: indexToLoc(startIndex),
  }),
);

// Assignment statement: x = expr;
const assignmentStatement: Parsimmon.Parser<AssignmentStatement> = P.seqMap(
  P.index,
  nonReservedIdentifier,
  token(P.regexp(/=(?!=)/)), // '=' NOT followed by '=' (avoids matching '==')
  expression,
  word(';'),
  (startIndex, id, _eq, value, _semi) => ({
    type: 'AssignmentStatement' as const,
    name: id.name,
    value,
    loc: indexToLoc(startIndex),
  }),
);

// Statement-level function call (like circle(50, 50, 25))
const functionCallStatement: Parsimmon.Parser<PathCommand> = P.seqMap(
  functionCall,
  word(';').atMost(1), // Optional semicolon
  (call) => ({
    type: 'PathCommand' as const,
    command: '', // Empty command means it's a function call at statement level
    args: [call],
    loc: call.loc,
  }),
);

// Method call statement: any expression chain ending with .method(args)
// e.g., list.push(42), ctx.transform.translate.set(50, 50),
//       layer('main').ctx.transform.reset()
const methodCallStatement: Parsimmon.Parser<PathCommand> = P.index.chain((startIndex) =>
  withPostfix(
    P.alt(functionCall as Parsimmon.Parser<Expression>, nonReservedIdentifier as Parsimmon.Parser<Expression>),
  ).chain((expr) => {
    if (expr.type === 'MethodCallExpression') {
      return word(';')
        .atMost(1)
        .map(() => ({
          type: 'PathCommand' as const,
          command: '' as const,
          args: [expr],
          loc: indexToLoc(startIndex),
        }));
    }
    return P.fail('expected method call') as Parsimmon.Parser<PathCommand>;
  }),
);

// Style block literal: ${ stroke: #cc0000; stroke-width: 4; }
// Parses raw text between ${ and }, extracts declarations with regex
const styleBlockLiteral: Parsimmon.Parser<StyleBlockLiteral> = P.seq(
  token(P.string('${')),
  P.regexp(/[^}]*/),
  word('}'),
).map(([, raw]) => {
  const cleaned = raw.replace(/\/\/[^\n]*/g, ''); // strip // comments
  const decls: StyleProperty[] = [];
  const re = /([a-zA-Z][a-zA-Z0-9-]*)\s*:\s*([^;\n]+);/g;
  let m;
  while ((m = re.exec(cleaned)) !== null) {
    decls.push({ type: 'StyleProperty', name: m[1].trim(), value: m[2].trim() });
  }
  return { type: 'StyleBlockLiteral' as const, properties: decls };
});

// Layer definition: define [default] PathLayer('name') ${ style declarations }
const layerDefinition: Parsimmon.Parser<LayerDefinition> = P.seqMap(
  P.index,
  keyword('define'),
  keyword('default')
    .map(() => true)
    .fallback(false),
  token(P.regexp(/PathLayer|TextLayer|GroupLayer/)),
  word('('),
  expression,
  word(')'),
  expression,
  (startIndex, _define, isDefault, layerType, _lp, name, _rp, styleExpr) => ({
    type: 'LayerDefinition' as const,
    layerType: layerType as 'PathLayer' | 'TextLayer' | 'GroupLayer',
    name,
    isDefault,
    styleExpr,
    loc: indexToLoc(startIndex),
  }),
);

// Layer apply block: layer('name').apply { statements } or variable.apply { statements }
const layerApplyBlock: Parsimmon.Parser<LayerApplyBlock> = P.alt(
  // Existing form: layer('name').apply { ... }
  P.seqMap(
    P.index,
    keyword('layer'),
    word('('),
    expression,
    word(')'),
    word('.'),
    keyword('apply'),
    block,
    (startIndex, _layer, _lp, layerName, _rp, _dot, _apply, body) => ({
      type: 'LayerApplyBlock' as const,
      layerName,
      body,
      loc: indexToLoc(startIndex),
    }),
  ),
  // New form: variable.apply { ... }
  P.seqMap(
    P.index,
    nonReservedIdentifier,
    word('.'),
    keyword('apply'),
    block,
    (startIndex, id, _dot, _apply, body) => ({
      type: 'LayerApplyBlock' as const,
      layerName: id as Expression,
      body,
      loc: indexToLoc(startIndex),
    }),
  ),
);

// tspan statement: tspan()`content` or tspan(dx, dy)`content` or tspan(dx, dy, rotation)`content` or tspan(dx, dy, rotation, styles)`content`
// Only valid inside text() block bodies
const tspanStatement: Parsimmon.Parser<TspanStatement> = P.seqMap(
  P.index,
  keyword('tspan'),
  word('('),
  P.alt(
    P.seqMap(
      expression,
      word(','),
      expression,
      word(','),
      expression,
      word(','),
      expression,
      (dx: Expression, _c1: string, dy: Expression, _c2: string, rot: Expression, _c3: string, styles: Expression) => ({
        dx,
        dy,
        rotation: rot,
        styles,
      }),
    ),
    P.seqMap(
      expression,
      word(','),
      expression,
      word(','),
      expression,
      (dx: Expression, _c1: string, dy: Expression, _c2: string, rot: Expression) => ({ dx, dy, rotation: rot }),
    ),
    P.seqMap(expression, word(','), expression, (dx: Expression, _c: string, dy: Expression) => ({ dx, dy })),
    P.succeed({} as { dx?: Expression; dy?: Expression; rotation?: Expression; styles?: Expression }),
  ),
  word(')'),
  templateLiteral,
  (idx, _t, _lp, args, _rp, content) => ({
    type: 'TspanStatement' as const,
    ...args,
    content,
    loc: indexToLoc(idx),
  }),
);

// text() block body: mixed bare template literals, tspan statements, for loops, if statements, let declarations
// Uses P.lazy() because textForLoop/textIfStatement reference textBlock which references textBlockBody
const textBlockBody: Parsimmon.Parser<TextBodyItem[]> = P.lazy(() =>
  P.alt(
    tspanStatement as Parsimmon.Parser<TextBodyItem>,
    templateLiteral as Parsimmon.Parser<TextBodyItem>,
    textForLoop as Parsimmon.Parser<TextBodyItem>,
    textForEachLoop as Parsimmon.Parser<TextBodyItem>,
    textIfStatement as Parsimmon.Parser<TextBodyItem>,
    letDeclaration as Parsimmon.Parser<TextBodyItem>,
  ).many(),
);

// Text-specific block: { textBlockBody } — used by textForLoop and textIfStatement
const textBlock: Parsimmon.Parser<TextBodyItem[]> = P.seq(word('{'), textBlockBody, word('}')).map(
  ([, items]) => items,
);

// For loop inside text blocks — body contains text items instead of statements
const textForLoop: Parsimmon.Parser<ForLoop> = P.seqMap(
  P.index,
  keyword('for'),
  word('('),
  nonReservedIdentifier,
  keyword('in'),
  rangeValue,
  token(P.string('..')),
  rangeValue,
  word(')'),
  textBlock,
  (startIndex, _for, _lp, id, _in, start, _dots, end, _rp, body) => ({
    type: 'ForLoop' as const,
    variable: id.name,
    start,
    end,
    body: body as unknown as Statement[],
    loc: indexToLoc(startIndex),
  }),
);

// For-each loop inside text blocks — body contains text items instead of statements
const textForEachLoop: Parsimmon.Parser<ForEachLoop> = P.seqMap(
  P.index,
  keyword('for'),
  word('('),
  P.alt(
    // Destructured: [item, index]
    P.seq(word('['), nonReservedIdentifier, word(','), nonReservedIdentifier, word(']')).map(([, item, , index]) => ({
      variable: item.name,
      indexVariable: index.name,
    })),
    // Simple: item
    nonReservedIdentifier.map((id) => ({ variable: id.name })),
  ),
  keyword('in'),
  expression,
  word(')'),
  textBlock,
  (startIndex, _for, _lp, vars, _in, iterable, _rp, body) => ({
    type: 'ForEachLoop' as const,
    variable: vars.variable,
    indexVariable: (vars as { indexVariable?: string }).indexVariable,
    iterable,
    body: body as unknown as Statement[],
    loc: indexToLoc(startIndex),
  }),
);

// If statement inside text blocks — branches contain text items instead of statements
const textIfStatement: Parsimmon.Parser<IfStatement> = P.seqMap(
  P.index,
  keyword('if'),
  word('('),
  expression,
  word(')'),
  textBlock,
  P.seq(
    keyword('else'),
    P.alt(
      P.lazy(() => textIfStatement).map((stmt) => [stmt]),
      textBlock,
    ),
  )
    .map(([, b]) => b)
    .fallback(null),
  (startIndex, _if, _lp, condition, _rp, consequent, alternate) => ({
    type: 'IfStatement' as const,
    condition,
    consequent: consequent as unknown as Statement[],
    alternate: alternate as unknown as Statement[] | null,
    loc: indexToLoc(startIndex),
  }),
);

// text statement: text(x, y)`content` or text(x, y, rotation)`content` or text(x, y, rotation, styles)`content` or text(x, y) { `text` tspan()... }
const textStatement: Parsimmon.Parser<TextStatement> = P.seqMap(
  P.index,
  keyword('text'),
  word('('),
  P.seqMap(
    expression,
    word(','),
    expression,
    P.seq(word(','), expression)
      .map(([, r]: [string, Expression]) => r)
      .fallback(undefined as Expression | undefined),
    P.seq(word(','), expression)
      .map(([, s]: [string, Expression]) => s)
      .fallback(undefined as Expression | undefined),
    (x: Expression, _c: string, y: Expression, rotation: Expression | undefined, styles: Expression | undefined) => ({
      x,
      y,
      rotation,
      styles,
    }),
  ),
  word(')'),
  P.alt(
    // Block form: text(x, y) { `text` tspan()... }
    P.seq(word('{'), textBlockBody, word('}')).map(([, body]: [string, TextBodyItem[], string]) => ({ body })),
    // Inline form: text(x, y)`content`
    templateLiteral.map((content: TemplateLiteral) => ({ content })),
  ),
  (idx, _t, _lp, pos, _rp, form) => ({
    type: 'TextStatement' as const,
    ...pos,
    ...form,
    loc: indexToLoc(idx),
  }),
);

// Enum definition: enum Name { Member, Member = value, ... }
const enumMemberValue: Parsimmon.Parser<Expression> = P.alt(
  stringLiteral,
  booleanLiteral,
  colorLiteral as Parsimmon.Parser<Expression>,
  cssColorLiteral as Parsimmon.Parser<Expression>,
  numberLiteral,
  nullLiteral,
);

const enumMember: Parsimmon.Parser<{ name: string; value?: Expression }> = P.seqMap(
  token(P.regexp(/[a-zA-Z_][a-zA-Z0-9_]*/)),
  P.seq(word('='), enumMemberValue)
    .map(([, v]) => v)
    .fallback(undefined as Expression | undefined),
  (name, value) => ({ name, ...(value !== undefined ? { value } : {}) }),
);

const enumDefinition: Parsimmon.Parser<EnumDefinition> = P.seqMap(
  P.index,
  keyword('enum'),
  token(P.regexp(/[a-zA-Z_][a-zA-Z0-9_]*/)),
  word('{'),
  P.sepBy(enumMember, word(',')),
  word(',').atMost(1), // optional trailing comma
  word('}'),
  (startIndex, _enum, name, _open, members, _trailing, _close) => ({
    type: 'EnumDefinition' as const,
    name,
    members,
    loc: indexToLoc(startIndex),
  }),
);

// @font directive: @font "Inter" or @font "./fonts/Custom.ttf" 700
const fontDirective: Parsimmon.Parser<FontDirective> = P.seqMap(
  P.index,
  token(P.string('@font')),
  token(P.alt(
    P.regexp(/"(?:[^"\\]|\\.)*"/).map((s) => s.slice(1, -1)),
    P.regexp(/'(?:[^'\\]|\\.)*'/).map((s) => s.slice(1, -1)),
  )),
  token(P.regexp(/[0-9]+/).map(Number)).fallback(undefined as number | undefined),
  word(';').fallback(';'), // optional semicolon
  (startIndex, _at, source, weight, _semi) => ({
    type: 'FontDirective' as const,
    source,
    ...(weight !== undefined ? { weight } : {}),
    loc: indexToLoc(startIndex),
  }),
);

// Statement
// Important: functionCallStatement must come BEFORE pathCommand to avoid
// 'circle(...)' being parsed as path command 'c' + 'ircle(...)'
// forLoop (range) tried before forEachLoop (for-each) — disambiguated by '..'
const statement: Parsimmon.Parser<Statement> = P.alt(
  fontDirective,
  layerDefinition,
  layerApplyBlock,
  textStatement,
  enumDefinition,
  letDeclaration,
  forLoop,
  forEachLoop,
  ifStatement,
  functionDefinition,
  returnStatement,
  indexedAssignmentStatement,
  memberAssignmentStatement,
  assignmentStatement,
  methodCallStatement,
  functionCallStatement,
  expressionStatement,
  pathCommand,
);

// Program
const program: Parsimmon.Parser<Program> = optWhitespace.then(statement.many()).map((body) => ({
  type: 'Program' as const,
  body,
}));

function detectMissingSemicolon(
  input: string,
  offset: number,
): { message: string; line: number; column: number } | null {
  const before = input.slice(0, offset);
  // Find the start of the current statement by scanning backward for a boundary,
  // skipping over @{ ... } path blocks and ${ ... } style blocks
  let lastBoundary = -1;
  for (let i = before.length - 1; i >= 0; i--) {
    const ch = before[i];
    if (ch === '}') {
      // Check if this closes a @{ } or ${ } block — skip over it
      const braceStart = before.lastIndexOf('{', i - 1);
      if (braceStart >= 1 && (before[braceStart - 1] === '@' || before[braceStart - 1] === '$')) {
        i = braceStart - 1;
        continue;
      }
      lastBoundary = i;
      break;
    }
    if (ch === ';' || ch === '{') {
      lastBoundary = i;
      break;
    }
  }
  const statementText = before.slice(lastBoundary + 1).trim();

  let message: string;
  if (statementText.startsWith('let ')) {
    message = "Missing ';' after let declaration";
  } else if (statementText.startsWith('return ') || statementText === 'return') {
    message = "Missing ';' after return statement";
  } else if (/^[a-zA-Z_]\w*\s*(?:\.\w+|\[[\s\S]*?\])*\s*=(?!=)/.test(statementText)) {
    message = "Missing ';' after assignment";
  } else {
    message = "Missing ';'";
  }

  // Point to where the semicolon should go (end of statement) rather than
  // where the parser failed (start of next token)
  let endOffset = offset;
  for (let i = offset - 1; i >= 0; i--) {
    if (input[i] !== ' ' && input[i] !== '\t' && input[i] !== '\n' && input[i] !== '\r') {
      endOffset = i + 1;
      break;
    }
  }
  const beforeEnd = input.slice(0, endOffset);
  const endLines = beforeEnd.split('\n');

  return {
    message,
    line: endLines.length,
    column: endLines[endLines.length - 1].length + 1,
  };
}

// --- Lezer parser (opt-in) ---
// The Lezer parser is available for editor integration (syntax highlighting,
// CodeMirror) via parseLezer(). The main parse() still uses Parsimmon for
// full compatibility until the Lezer grammar covers all edge cases.

import { parser as lezerParser } from './pathogen.generated';
import { buildAST, buildASTWithComments, setExpressionParser } from './ast-builder';

// Wire the Lezer-based expression parser into the AST builder
import { parseExpression as lezerParseExpression } from './lezer-expression';
setExpressionParser({ parse: (input: string) => {
  const result = lezerParseExpression(input);
  return { status: result !== null, value: result };
}});

/**
 * Parse using the Lezer parser. Returns the Lezer tree + AST.
 * Used by the playground for syntax highlighting (sub-phase D).
 * Not yet a drop-in replacement for parse() — the Lezer grammar doesn't
 * cover all edge cases of the Parsimmon parser.
 */
export function parseLezer(input: string): { tree: import('@lezer/common').Tree; ast: Program } {
  const tree = lezerParser.parse(input);
  const ast = buildAST(tree, input);
  return { tree, ast };
}

/** Export the Lezer parser for direct CodeMirror integration. */
export { lezerParser };

export function parse(input: string): Program {
  const tree = lezerParser.parse(input);

  // Check for Lezer parse errors — use Lezer's error-recovered AST when
  // possible, fall back to Parsimmon only when needed
  let hasErrors = false;
  const errCur = tree.cursor();
  do { if (errCur.type.isError) { hasErrors = true; break; } } while (errCur.next());

  if (hasErrors) {
    // Lezer found errors — try Parsimmon as fallback
    const result = program.parse(input);
    if (result.status) return result.value;

    // Parsimmon also fails — produce error message
    const { index, expected } = result;
    const lines = input.slice(0, index.offset).split('\n');
    const line = lines.length;
    const column = lines[lines.length - 1].length + 1;
    if (expected.includes("';'")) {
      const semiResult = detectMissingSemicolon(input, index.offset);
      if (semiResult) throw new Error(`Parse error at line ${semiResult.line}, column ${semiResult.column}: ${semiResult.message}`);
    }
    throw new Error(`Parse error at line ${line}, column ${column}: expected ${expected.join(' or ')}`);
  }

  return buildAST(tree, input);
}

// Extract comments from source code
// Returns array of Comment nodes with their positions
export function extractComments(input: string): Comment[] {
  const comments: Comment[] = [];
  const lines = input.split('\n');

  let offset = 0;
  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum];
    const commentMatch = /\/\/(.*)$/.exec(line);

    if (commentMatch) {
      const commentStart = line.indexOf('//');
      comments.push({
        type: 'Comment',
        text: `//${commentMatch[1]}`,
        loc: {
          line: lineNum + 1, // 1-indexed
          column: commentStart + 1, // 1-indexed
          offset: offset + commentStart,
        },
      });
    }

    offset += line.length + 1; // +1 for newline
  }

  return comments;
}

// Parse result that includes both AST and comments
export interface ParseResultWithComments {
  program: Program;
  comments: Comment[];
}

// Parse input and extract comments separately
export function parseWithComments(input: string): ParseResultWithComments {
  return {
    program: parse(input),
    comments: extractComments(input),
  };
}

export { expression, pathCommand, program, statement };
