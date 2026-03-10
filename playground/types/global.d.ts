import type { CompileResult, CompileOptions, CompileWithContextOptions, EvaluateWithContextResult } from './compiler';

export {};

declare global {
  interface Window {
    SvgPathExtended: {
      compile(source: string, options?: CompileOptions): CompileResult;
      compileAnnotated(source: string): string;
      compileWithContext(source: string, options?: CompileWithContextOptions): EvaluateWithContextResult;
    };
  }

  /** Global available via ESLint config — same as window.SvgPathExtended */
  const SVGPathExtended: Window['SvgPathExtended'];
}
