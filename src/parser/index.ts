import Parsimmon from 'parsimmon';
import type {
  Program,
  Statement,
  Expression,
  PathArg,
  NumberLiteral,
  StringLiteral,
  Identifier,
  BinaryExpression,
  UnaryExpression,
  CalcExpression,
  FunctionCall,
  MemberExpression,
  NullLiteral,
  ArrayLiteral,
  ObjectLiteral,
  IndexExpression,
  IndexedAssignmentStatement,
  MethodCallExpression,
  PathCommand,
  LetDeclaration,
  AssignmentStatement,
  ForLoop,
  ForEachLoop,
  IfStatement,
  FunctionDefinition,
  ReturnStatement,
  SourceLocation,
  Comment,
  StyleProperty,
  StyleBlockLiteral,
  LayerDefinition,
  LayerApplyBlock,
  TemplateLiteral,
  TextStatement,
  TspanStatement,
  TextBodyItem,
  PathBlockExpression,
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
  return token(P.regexp(new RegExp(str + '(?![a-zA-Z0-9_])')));
}

// Number literal: 123, 45.67, -89, .5, optionally with angle unit suffix (deg/rad/pi)
// Uses negative lookahead to avoid consuming '.' when followed by '..' (range operator)
const numberLiteral: Parsimmon.Parser<NumberLiteral> = token(
  P.regexp(/-?(?:\d+(?:\.(?!\.))\d*|\.\d+|\d+)(deg|rad|pi)?/)
).map((str) => {
  const match = str.match(/^(-?(?:\d+(?:\.\d*)?|\.\d+|\d+))(deg|rad|pi)?$/);
  return {
    type: 'NumberLiteral' as const,
    value: parseFloat(match![1]),
    unit: match![2] as 'deg' | 'rad' | 'pi' | undefined,
  };
});

// String literal: "hello" or 'hello'
// Supports escape sequences: \n, \t, \\, \", \'
const stringLiteral: Parsimmon.Parser<StringLiteral> = token(
  P.alt(
    P.regexp(/"(?:[^"\\]|\\.)*"/).map((str) => str.slice(1, -1)),
    P.regexp(/'(?:[^'\\]|\\.)*'/).map((str) => str.slice(1, -1))
  )
).map((value) => ({
  type: 'StringLiteral' as const,
  value: value
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'")
    .replace(/\\\\/g, '\\'),
}));

// Identifier: x, myVar, _private (for general use)
const identifier: Parsimmon.Parser<Identifier> = P.seqMap(
  P.index,
  token(P.regexp(/[a-zA-Z_][a-zA-Z0-9_]*/)),
  (startIndex, name) => ({
    type: 'Identifier' as const,
    name,
    loc: indexToLoc(startIndex),
  })
);

// Reserved words that cannot be identifiers
const reservedWords = ['let', 'for', 'in', 'if', 'else', 'fn', 'calc', 'log', 'return', 'define', 'default', 'layer', 'apply', 'text', 'tspan', 'null'];

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
];

const nonReservedIdentifier: Parsimmon.Parser<Identifier> = identifier.chain((id) =>
  reservedWords.includes(id.name)
    ? P.fail(`Reserved word: ${id.name}`)
    : P.succeed(id)
);

// Identifier that is NOT a path command letter (for path arguments)
const nonPathCommandIdentifier: Parsimmon.Parser<Identifier> = P.seqMap(
  P.index,
  token(P.regexp(/[a-zA-Z_][a-zA-Z0-9_]*/)),
  (startIndex, name) => ({ startIndex, name })
).chain(({ startIndex, name }) => {
  if (name.length === 1 && PATH_COMMANDS.includes(name)) {
    return P.fail(`Path command letter cannot be used as identifier: ${name}`);
  }
  if (reservedWords.includes(name)) {
    return P.fail(`Reserved word: ${name}`);
  }
  return P.succeed({ type: 'Identifier' as const, name, loc: indexToLoc(startIndex) });
});

// Postfix operators: chains .method(args), .property, and [index] after a base expression
function withPostfix(base: Parsimmon.Parser<Expression>): Parsimmon.Parser<Expression> {
  return base.chain((baseExpr) =>
    P.alt(
      // .name(args) → MethodCallExpression (try first — needs '(' after '.name')
      P.seq(
        P.string('.'),
        token(P.regexp(/[a-zA-Z_][a-zA-Z0-9_]*/)),
        P.string('(').skip(optWhitespace),
        P.sepBy(P.lazy(() => expression), word(',')),
        word(')')
      ).map(([, method, , args]): { type: 'method'; method: string; args: Expression[] } =>
        ({ type: 'method', method, args })),
      // .name → MemberExpression
      P.seq(P.string('.'), token(P.regexp(/[a-zA-Z_][a-zA-Z0-9_]*/)))
        .map(([, prop]): { type: 'member'; prop: string } => ({ type: 'member', prop })),
      // [expr] → IndexExpression
      P.seq(P.string('[').skip(optWhitespace), P.lazy(() => expression), word(']'))
        .map(([, index]): { type: 'index'; index: Expression } => ({ type: 'index', index }))
    )
      .many()
      .map((postfixes) =>
        postfixes.reduce<Expression>((obj, postfix) => {
          if (postfix.type === 'method') {
            return { type: 'MethodCallExpression' as const, object: obj, method: postfix.method, args: postfix.args };
          } else if (postfix.type === 'member') {
            return { type: 'MemberExpression' as const, object: obj, property: postfix.prop };
          } else {
            return { type: 'IndexExpression' as const, object: obj, index: postfix.index };
          }
        }, baseExpr)
      )
  );
}

// Member/index expression for path arguments (base cannot be path command letter or context-aware function call)
// Type is narrowed to PathArg-compatible types
const pathMemberExpression: Parsimmon.Parser<PathArg> =
  // First check: fail if this is a context-aware function followed by '('
  P.lookahead(
    P.regexp(/[a-zA-Z_][a-zA-Z0-9_]*/).chain((name) => {
      if (contextAwareFunctionNames.includes(name)) {
        // Peek ahead to check if followed by '(' (with optional whitespace)
        return P.regexp(/\s*\(/).map(() => 'function-call').or(P.succeed('not-function-call'));
      }
      return P.succeed('not-context-aware');
    }).chain((result) => {
      if (result === 'function-call') {
        return P.fail('context-aware function call');
      }
      return P.succeed(null);
    })
  ).then(
    nonPathCommandIdentifier.chain((baseExpr) =>
      P.alt(
        // .name(args) → MethodCallExpression
        P.seq(
          P.string('.'),
          token(P.regexp(/[a-zA-Z_][a-zA-Z0-9_]*/)),
          P.string('(').skip(optWhitespace),
          P.sepBy(P.lazy(() => expression), word(',')),
          word(')')
        ).map(([, method, , args]): { type: 'method'; method: string; args: Expression[] } =>
          ({ type: 'method', method, args })),
        // .name → MemberExpression
        P.seq(P.string('.'), token(P.regexp(/[a-zA-Z_][a-zA-Z0-9_]*/)))
          .map(([, prop]): { type: 'member'; prop: string } => ({ type: 'member', prop })),
        // [expr] → IndexExpression
        P.seq(P.string('[').skip(optWhitespace), P.lazy(() => expression), word(']'))
          .map(([, index]): { type: 'index'; index: Expression } => ({ type: 'index', index }))
      )
        .many()
        .map((postfixes) =>
          postfixes.reduce<PathArg>((obj, postfix) => {
            if (postfix.type === 'method') {
              return { type: 'MethodCallExpression' as const, object: obj as Expression, method: postfix.method, args: postfix.args };
            } else if (postfix.type === 'member') {
              return { type: 'MemberExpression' as const, object: obj as Expression, property: postfix.prop };
            } else {
              return { type: 'IndexExpression' as const, object: obj as Expression, index: postfix.index };
            }
          }, baseExpr)
        )
    )
  );

// Expression parser with operator precedence
const expression: Parsimmon.Parser<Expression> = P.lazy(() => orExpression);

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
          first
        )
      )
  )
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
          first
        )
      )
  )
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
          first
        )
      )
  )
);

const comparisonExpression: Parsimmon.Parser<Expression> = P.lazy(() =>
  mergeExpression.chain((first) =>
    P.seq(
      P.alt(word('<='), word('>='), token(P.regexp(/<(?!<)/)), word('>')),
      mergeExpression
    )
      .many()
      .map((rest) =>
        rest.reduce<Expression>(
          (left, [op, right]) => ({
            type: 'BinaryExpression',
            operator: op as BinaryExpression['operator'],
            left,
            right,
          }),
          first
        )
      )
  )
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
          first
        )
      )
  )
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
          first
        )
      )
  )
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
          first
        )
      )
  )
);

const unaryExpression: Parsimmon.Parser<Expression> = P.lazy(() =>
  P.alt(
    P.seq(P.alt(word('-'), word('!')), unaryExpression).map(
      ([op, arg]): UnaryExpression => ({
        type: 'UnaryExpression',
        operator: op as UnaryExpression['operator'],
        argument: arg,
      })
    ),
    primaryExpression
  )
);

// Function call: name(arg1, arg2, ...)
const functionCall: Parsimmon.Parser<FunctionCall> = P.seqMap(
  P.index,
  token(P.regexp(/[a-zA-Z_][a-zA-Z0-9_]*/)),
  P.string('(').skip(optWhitespace),
  P.sepBy(P.lazy(() => expression), word(',')),
  word(')'),
  (startIndex, name, _open, args, _close) => ({
    type: 'FunctionCall' as const,
    name,
    args,
    loc: indexToLoc(startIndex),
  })
);

// Template literal: `hello ${name}!`
// Whitespace inside template literals is significant, so NO token() wrapper
const templateLiteral: Parsimmon.Parser<TemplateLiteral> = P.seq(
  P.string('`'),
  P.alt(
    P.string('${').then(P.lazy(() => expression)).skip(P.string('}')),
    P.regexp(/(?:[^`\\$]|\\.|(?:\$(?!\{)))+/)
      .map(raw => raw.replace(/\\`/g, '`').replace(/\\\$/g, '$')
                      .replace(/\\\\/g, '\\').replace(/\\n/g, '\n').replace(/\\t/g, '\t'))
  ).many(),
  P.string('`')
).skip(optWhitespace).map(([, parts]) => ({
  type: 'TemplateLiteral' as const,
  parts,
}));

// Null literal
const nullLiteral: Parsimmon.Parser<NullLiteral> = keyword('null').map((): NullLiteral => ({
  type: 'NullLiteral' as const,
}));

// Array literal: [], [1, 2, 3], [expr, expr]
const arrayLiteral: Parsimmon.Parser<ArrayLiteral> = P.seq(
  word('['),
  P.sepBy(P.lazy(() => expression), word(',')),
  word(',').atMost(1),
  word(']')
).map(([, elements]): ArrayLiteral => ({
  type: 'ArrayLiteral' as const,
  elements,
}));

// Object literal: { key: value, ... }
const objectProperty: Parsimmon.Parser<{ key: string; value: Expression }> = P.seqMap(
  P.alt(
    nonReservedIdentifier.map((id: Identifier) => id.name),
    stringLiteral.map((s: StringLiteral) => s.value)
  ),
  word(':'),
  P.lazy(() => expression),
  (key, _colon, value) => ({ key, value })
);

const objectLiteral: Parsimmon.Parser<ObjectLiteral> = P.seq(
  word('{'),
  P.sepBy(objectProperty, word(',')),
  word(',').atMost(1),  // optional trailing comma
  word('}')
).map(([, properties]): ObjectLiteral => ({
  type: 'ObjectLiteral' as const,
  properties,
}));

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
  })
);

// Primary expression: style block, path block, number, string, template literal, calc, null, array, object, identifier (with optional postfix), function call (with optional postfix), or parenthesized expression
const primaryExpression: Parsimmon.Parser<Expression> = P.lazy(() =>
  P.alt(
    withPostfix(styleBlockLiteral),
    withPostfix(pathBlockExpression as Parsimmon.Parser<Expression>),
    nullLiteral,
    withPostfix(arrayLiteral as Parsimmon.Parser<Expression>),
    numberLiteral,
    stringLiteral,
    templateLiteral,
    calcExpression,
    withPostfix(functionCall),
    withPostfix(objectLiteral as Parsimmon.Parser<Expression>),
    withPostfix(nonReservedIdentifier),
    P.seq(word('('), expression, word(')')).map(([, expr]) => expr)
  )
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
  })
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
    })
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
  P.sepBy(P.lazy(() => expression), word(',')),
  word(')'),
  (_lookahead, startIndex, name, _open, args, _close) => ({
    type: 'FunctionCall' as const,
    name,
    args,
    loc: indexToLoc(startIndex),
  })
);

// Path argument: number, identifier (non-path-command) with optional property access, calc(), or function call
const pathArg: Parsimmon.Parser<PathArg> = P.alt(
  calcExpression,
  pathFunctionCall,
  numberLiteral,
  pathMemberExpression
);

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
  })
);

// let declaration: let x = 10;
const letDeclaration: Parsimmon.Parser<LetDeclaration> = P.seqMap(
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
  })
);

// Block: { statements }
const block: Parsimmon.Parser<Statement[]> = P.lazy(() =>
  P.seq(word('{'), statement.many(), word('}')).map(([, stmts]) => stmts)
);

// Simple value for for-loop range (number or identifier, not full expression to avoid ambiguity)
const rangeValue: Parsimmon.Parser<Expression> = P.alt(
  numberLiteral,
  nonReservedIdentifier
);

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
  })
);

// for-each loop: for (item in list) { ... } or for ([item, index] in list) { ... }
const forEachLoop: Parsimmon.Parser<ForEachLoop> = P.seqMap(
  P.index,
  keyword('for'),
  word('('),
  P.alt(
    // Destructured: [item, index]
    P.seq(
      word('['),
      nonReservedIdentifier,
      word(','),
      nonReservedIdentifier,
      word(']')
    ).map(([, item, , index]) => ({ variable: item.name, indexVariable: index.name })),
    // Simple: item
    nonReservedIdentifier.map((id) => ({ variable: id.name }))
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
  })
);

// if statement: if (condition) { ... } else { ... }
const ifStatement: Parsimmon.Parser<IfStatement> = P.seqMap(
  P.index,
  keyword('if'),
  word('('),
  expression,
  word(')'),
  block,
  P.seq(keyword('else'), P.alt(
    P.lazy(() => ifStatement).map(stmt => [stmt]),
    block
  )).map(([, b]) => b).fallback(null),
  (startIndex, _if, _lp, condition, _rp, consequent, alternate) => ({
    type: 'IfStatement' as const,
    condition,
    consequent,
    alternate,
    loc: indexToLoc(startIndex),
  })
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
  })
);

// return statement: return expr;
const returnStatement: Parsimmon.Parser<ReturnStatement> = P.seqMap(
  keyword('return'),
  expression,
  word(';'),
  (_return, value, _semi) => ({
    type: 'ReturnStatement' as const,
    value,
  })
);

// Indexed assignment statement: obj['key'] = value; or arr[0] = value;
const indexedAssignmentStatement: Parsimmon.Parser<IndexedAssignmentStatement> = P.seqMap(
  P.index,
  withPostfix(
    P.alt(
      functionCall as Parsimmon.Parser<Expression>,
      nonReservedIdentifier as Parsimmon.Parser<Expression>
    )
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
  }
).chain(result => {
  if (result && result.type === 'IndexedAssignmentStatement') {
    return P.succeed(result);
  }
  return P.fail('expected indexed assignment');
});

// Assignment statement: x = expr;
const assignmentStatement: Parsimmon.Parser<AssignmentStatement> = P.seqMap(
  P.index,
  nonReservedIdentifier,
  token(P.regexp(/=(?!=)/)),  // '=' NOT followed by '=' (avoids matching '==')
  expression,
  word(';'),
  (startIndex, id, _eq, value, _semi) => ({
    type: 'AssignmentStatement' as const,
    name: id.name,
    value,
    loc: indexToLoc(startIndex),
  })
);

// Statement-level function call (like circle(50, 50, 25))
interface FunctionCallStatement {
  type: 'FunctionCallStatement';
  call: FunctionCall;
}

const functionCallStatement: Parsimmon.Parser<PathCommand> = P.seqMap(
  functionCall,
  word(';').atMost(1),  // Optional semicolon
  (call) => ({
    type: 'PathCommand' as const,
    command: '',  // Empty command means it's a function call at statement level
    args: [call],
    loc: call.loc,
  })
);

// Method call statement: any expression chain ending with .method(args)
// e.g., list.push(42), ctx.transform.translate.set(50, 50),
//       layer('main').ctx.transform.reset()
const methodCallStatement: Parsimmon.Parser<PathCommand> = P.index.chain(startIndex =>
  withPostfix(
    P.alt(
      functionCall as Parsimmon.Parser<Expression>,
      nonReservedIdentifier as Parsimmon.Parser<Expression>
    )
  ).chain(expr => {
    if (expr.type === 'MethodCallExpression') {
      return word(';').atMost(1).map(() => ({
        type: 'PathCommand' as const,
        command: '' as const,
        args: [expr as MethodCallExpression],
        loc: indexToLoc(startIndex),
      }));
    }
    return P.fail('expected method call') as Parsimmon.Parser<PathCommand>;
  })
);

// Style block literal: ${ stroke: #cc0000; stroke-width: 4; }
// Parses raw text between ${ and }, extracts declarations with regex
const styleBlockLiteral: Parsimmon.Parser<StyleBlockLiteral> = P.seq(
  token(P.string('${')),
  P.regexp(/[^}]*/),
  word('}')
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
  keyword('default').map(() => true).fallback(false),
  token(P.regexp(/PathLayer|TextLayer/)),
  word('('),
  expression,
  word(')'),
  expression,
  (startIndex, _define, isDefault, layerType, _lp, name, _rp, styleExpr) => ({
    type: 'LayerDefinition' as const,
    layerType: layerType as 'PathLayer' | 'TextLayer',
    name,
    isDefault,
    styleExpr,
    loc: indexToLoc(startIndex),
  })
);

// Layer apply block: layer('name').apply { statements }
const layerApplyBlock: Parsimmon.Parser<LayerApplyBlock> = P.seqMap(
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
  })
);

// tspan statement: tspan()`content` or tspan(dx, dy)`content` or tspan(dx, dy, rotation)`content` or tspan(dx, dy, rotation, styles)`content`
// Only valid inside text() block bodies
const tspanStatement: Parsimmon.Parser<TspanStatement> = P.seqMap(
  P.index,
  keyword('tspan'),
  word('('),
  P.alt(
    P.seqMap(expression, word(','), expression, word(','), expression, word(','), expression,
      (dx: Expression, _c1: string, dy: Expression, _c2: string, rot: Expression, _c3: string, styles: Expression) => ({ dx, dy, rotation: rot, styles })),
    P.seqMap(expression, word(','), expression, word(','), expression,
      (dx: Expression, _c1: string, dy: Expression, _c2: string, rot: Expression) => ({ dx, dy, rotation: rot })),
    P.seqMap(expression, word(','), expression,
      (dx: Expression, _c: string, dy: Expression) => ({ dx, dy })),
    P.succeed({} as { dx?: Expression; dy?: Expression; rotation?: Expression; styles?: Expression })
  ),
  word(')'),
  templateLiteral,
  (idx, _t, _lp, args, _rp, content) => ({
    type: 'TspanStatement' as const,
    ...args,
    content,
    loc: indexToLoc(idx),
  })
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
  ).many()
);

// Text-specific block: { textBlockBody } — used by textForLoop and textIfStatement
const textBlock: Parsimmon.Parser<TextBodyItem[]> =
  P.seq(word('{'), textBlockBody, word('}')).map(([, items]) => items);

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
  })
);

// For-each loop inside text blocks — body contains text items instead of statements
const textForEachLoop: Parsimmon.Parser<ForEachLoop> = P.seqMap(
  P.index,
  keyword('for'),
  word('('),
  P.alt(
    // Destructured: [item, index]
    P.seq(
      word('['),
      nonReservedIdentifier,
      word(','),
      nonReservedIdentifier,
      word(']')
    ).map(([, item, , index]) => ({ variable: item.name, indexVariable: index.name })),
    // Simple: item
    nonReservedIdentifier.map((id) => ({ variable: id.name }))
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
  })
);

// If statement inside text blocks — branches contain text items instead of statements
const textIfStatement: Parsimmon.Parser<IfStatement> = P.seqMap(
  P.index,
  keyword('if'),
  word('('),
  expression,
  word(')'),
  textBlock,
  P.seq(keyword('else'), P.alt(
    P.lazy(() => textIfStatement).map(stmt => [stmt]),
    textBlock
  )).map(([, b]) => b).fallback(null),
  (startIndex, _if, _lp, condition, _rp, consequent, alternate) => ({
    type: 'IfStatement' as const,
    condition,
    consequent: consequent as unknown as Statement[],
    alternate: alternate as unknown as Statement[] | null,
    loc: indexToLoc(startIndex),
  })
);

// text statement: text(x, y)`content` or text(x, y, rotation)`content` or text(x, y, rotation, styles)`content` or text(x, y) { `text` tspan()... }
const textStatement: Parsimmon.Parser<TextStatement> = P.seqMap(
  P.index,
  keyword('text'),
  word('('),
  P.seqMap(expression, word(','), expression,
    P.seq(word(','), expression).map(([, r]: [string, Expression]) => r).fallback(undefined as Expression | undefined),
    P.seq(word(','), expression).map(([, s]: [string, Expression]) => s).fallback(undefined as Expression | undefined),
    (x: Expression, _c: string, y: Expression, rotation: Expression | undefined, styles: Expression | undefined) => ({ x, y, rotation, styles })),
  word(')'),
  P.alt(
    // Block form: text(x, y) { `text` tspan()... }
    P.seq(word('{'), textBlockBody, word('}'))
      .map(([, body]: [string, TextBodyItem[], string]) => ({ body })),
    // Inline form: text(x, y)`content`
    templateLiteral.map((content: TemplateLiteral) => ({ content })),
  ),
  (idx, _t, _lp, pos, _rp, form) => ({
    type: 'TextStatement' as const,
    ...pos,
    ...form,
    loc: indexToLoc(idx),
  })
);

// Statement
// Important: functionCallStatement must come BEFORE pathCommand to avoid
// 'circle(...)' being parsed as path command 'c' + 'ircle(...)'
// forLoop (range) tried before forEachLoop (for-each) — disambiguated by '..'
const statement: Parsimmon.Parser<Statement> = P.alt(
  layerDefinition,
  layerApplyBlock,
  textStatement,
  letDeclaration,
  forLoop,
  forEachLoop,
  ifStatement,
  functionDefinition,
  returnStatement,
  indexedAssignmentStatement,
  assignmentStatement,
  methodCallStatement,
  functionCallStatement,
  pathCommand
);

// Program
const program: Parsimmon.Parser<Program> = optWhitespace
  .then(statement.many())
  .map((body) => ({
    type: 'Program' as const,
    body,
  }));

export function parse(input: string): Program {
  const result = program.parse(input);
  if (result.status) {
    return result.value;
  } else {
    const { index, expected } = result;
    const lines = input.slice(0, index.offset).split('\n');
    const line = lines.length;
    const column = lines[lines.length - 1].length + 1;
    throw new Error(
      `Parse error at line ${line}, column ${column}: expected ${expected.join(' or ')}`
    );
  }
}

// Extract comments from source code
// Returns array of Comment nodes with their positions
export function extractComments(input: string): Comment[] {
  const comments: Comment[] = [];
  const lines = input.split('\n');

  let offset = 0;
  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum];
    const commentMatch = line.match(/\/\/(.*)$/);

    if (commentMatch) {
      const commentStart = line.indexOf('//');
      comments.push({
        type: 'Comment',
        text: '//' + commentMatch[1],
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

export { program, expression, pathCommand, statement };
