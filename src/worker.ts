// Web Worker entry point for async compilation
// Offloads interpreter execution from main thread

import { compile, compileWithContext, createFontRegistry, addFont } from '.';

import type { CompileOptions, FontRegistry } from '.';

export interface FontBuffer {
  family: string;
  weight: number;
  style: 'normal' | 'italic';
  buffer: ArrayBuffer;
  // Codepoint coverage claim of a Google Fonts subset slice (see FontData.unicodeRanges)
  unicodeRanges?: Array<[number, number]>;
}

export interface WorkerRequest {
  id: number;
  type: 'compile' | 'compileWithContext';
  source: string;
  options?: CompileOptions;
  fontBuffers?: FontBuffer[];
}

export interface WorkerResponse {
  id: number;
  type: 'compile' | 'compileWithContext';
  success: boolean;
  result?: unknown;
  error?: string;
}

/**
 * Build a FontRegistry from transferred font buffers.
 */
function buildRegistryFromBuffers(buffers: FontBuffer[]): FontRegistry {
  const registry = createFontRegistry();
  for (const fb of buffers) {
    addFont(registry, fb.family, fb.weight, fb.style, fb.buffer, fb.unicodeRanges);
  }
  return registry;
}

// Handle incoming messages
self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const { id, type, source, options, fontBuffers } = event.data;

  try {
    // Build font registry from transferred buffers if present
    const fontRegistry = fontBuffers && fontBuffers.length > 0
      ? buildRegistryFromBuffers(fontBuffers)
      : undefined;

    const compileOpts: CompileOptions | undefined = fontRegistry || options
      ? { ...options, ...(fontRegistry ? { fonts: fontRegistry } : {}) }
      : undefined;

    let result: unknown;

    switch (type) {
      case 'compile':
        result = compile(source, compileOpts);
        break;
      case 'compileWithContext':
        result = compileWithContext(source, compileOpts);
        break;
      default:
        throw new Error(`Unknown compilation type: ${type}`);
    }

    const response: WorkerResponse = {
      id,
      type,
      success: true,
      result,
    };

    self.postMessage(response);
  } catch (e) {
    const response: WorkerResponse = {
      id,
      type,
      success: false,
      error: e instanceof Error ? e.message : String(e),
    };

    self.postMessage(response);
  }
};
