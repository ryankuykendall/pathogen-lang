/**
 * Generate a complete SVG string from a CompileResult.
 *
 * Thin adapter over the shared renderer in `src/render/`. The tree itself
 * lives in `buildSvgTree`; serialization lives in `toSvgString`. This file
 * exists to preserve the public `generateSvg` / `SvgGeneratorOptions` API
 * shape while the unification refactor is in progress.
 *
 * Consumers: `src/cli.ts` (via `--output-svg-file`), VS Code extension
 * webview (via `PathogenLang.generateSvg` on the bundled library).
 */

import type { CompileResult } from '.';

import { buildSvgTree, toSvgString } from './render';

export interface SvgGeneratorOptions {
  viewBox?: string;
  width?: string;
  height?: string;
  stroke?: string;
  fill?: string;
  strokeWidth?: string;
  includeMetadata?: boolean;
}

export function generateSvg(result: CompileResult, options: SvgGeneratorOptions = {}): string {
  const tree = buildSvgTree(result, {
    viewBox: options.viewBox,
    width: options.width,
    height: options.height,
    defaultStroke: options.stroke,
    defaultFill: options.fill,
    defaultStrokeWidth: options.strokeWidth,
    includeMetadata: options.includeMetadata,
  });
  return toSvgString(tree);
}
