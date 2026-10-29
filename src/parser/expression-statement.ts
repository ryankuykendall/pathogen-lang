import type { Expression, PathCommandAnnotations, SourceLocation, Statement } from './ast';

/**
 * The statement a bare expression followed by `;` builds.
 *
 * A call is a PathCommand with no command letter: that is where a path
 * function's output is emitted (`circle(50, 50, 25);`) and where statement
 * builtins such as `log()` run. Anything else is an ExpressionStatement.
 *
 * Shared by the AST builder and the evaluator, which runs the last line of a
 * builder block written without `;` (`LinearGradient(...) {|g| g.stop(1, c) }`)
 * as exactly the statement it would be with the `;`.
 */
export function statementForExpression(
  expression: Expression,
  loc?: SourceLocation,
  annotations?: PathCommandAnnotations,
): Statement {
  if (expression.type === 'FunctionCall' || expression.type === 'MethodCallExpression') {
    return {
      type: 'PathCommand',
      command: '',
      args: [expression],
      ...(annotations ? { annotations } : {}),
      loc,
    };
  }
  return { type: 'ExpressionStatement', expression, loc };
}
