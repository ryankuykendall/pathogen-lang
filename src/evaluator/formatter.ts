// Formatter for annotated output
import type { AnnotatedOutput } from './annotated';

export interface FormatOptions {
  indentSize?: number;
  indentChar?: string;
}

export function formatAnnotated(output: AnnotatedOutput, options: FormatOptions = {}): string {
  const { indentSize = 2, indentChar = ' ' } = options;
  const lines: string[] = [];
  let indentLevel = 0;

  function indent(): string {
    return indentChar.repeat(indentLevel * indentSize);
  }

  for (const line of output.lines) {
    switch (line.type) {
      case 'comment':
        lines.push(indent() + line.text);
        break;

      case 'path_command':
        if (line.args) {
          lines.push(`${indent()}${line.command} ${line.args}`);
        } else {
          lines.push(indent() + line.command);
        }
        break;

      case 'loop_start':
        lines.push('');
        lines.push(`${indent()}//--- for (${line.variable} in ${line.start}${line.inclusive === false ? '..<' : '..'}${line.end}) from line ${line.line}`);
        indentLevel++;
        break;

      case 'foreach_start':
        lines.push('');
        lines.push(`${indent()}//--- for (${line.variable} in array[${line.length}]) from line ${line.line}`);
        indentLevel++;
        break;

      case 'iteration':
        lines.push(`${indent()}//--- iteration ${line.index}`);
        break;

      case 'iteration_skip':
        lines.push(`${indent()}... ${line.count} more iterations ...`);
        break;

      case 'loop_end':
        indentLevel--;
        break;

      case 'function_call':
        lines.push(`${indent()}//--- ${line.name}(${line.args}) called from line ${line.line}`);
        indentLevel++;
        break;

      case 'function_call_end':
        indentLevel--;
        break;
    }
  }

  return lines.join('\n');
}
