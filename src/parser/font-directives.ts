import type { FontDirective, Program, SourceLocation } from './ast';

export interface ResolvedFontDirective {
  family: string;
  weight?: number;
  loc?: SourceLocation;
}

export interface FontDirectiveError {
  message: string;
  /** The unresolved identifier, when the error is an identifier-resolution failure. */
  identifier?: string;
  loc?: SourceLocation;
}

/**
 * Statically resolve every `@font` directive in a program to a concrete
 * family name or file path.
 *
 * Font loading is a host-environment step that runs *before* evaluation,
 * so identifier sources cannot use runtime scope — they resolve against
 * top-level `let name = "string literal";` declarations only (in either
 * order relative to the directive). Anything else is reported as an error
 * so hosts can fail with a clear message instead of silently skipping the
 * font.
 */
export function resolveFontDirectives(program: Program): {
  resolved: ResolvedFontDirective[];
  errors: FontDirectiveError[];
} {
  const stringLets = new Map<string, string>();
  for (const stmt of program.body) {
    if (stmt.type === 'LetDeclaration' && !stmt.pattern && stmt.value.type === 'StringLiteral') {
      stringLets.set(stmt.name, stmt.value.value);
    }
  }

  const resolved: ResolvedFontDirective[] = [];
  const errors: FontDirectiveError[] = [];
  for (const stmt of program.body) {
    if (stmt.type !== 'FontDirective') continue;
    const directive = stmt as FontDirective;
    if (directive.sourceKind === 'identifier') {
      const bound = stringLets.get(directive.source);
      if (bound === undefined) {
        errors.push({
          message:
            `@font directive references '${directive.source}', which is not a top-level string variable. ` +
            `Declare it at the top level: let ${directive.source} = "Family Name";`,
          identifier: directive.source,
          loc: directive.loc,
        });
        continue;
      }
      resolved.push({ family: bound, weight: directive.weight, loc: directive.loc });
    } else {
      resolved.push({ family: directive.source, weight: directive.weight, loc: directive.loc });
    }
  }

  return { resolved, errors };
}
