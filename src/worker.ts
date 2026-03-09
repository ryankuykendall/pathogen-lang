// Web Worker entry point for async compilation
// Offloads interpreter execution from main thread

import { compile, compileAnnotated, compileWithContext } from '.';

import type { CompileOptions } from '.';

export interface WorkerRequest {
  id: number;
  type: 'compile' | 'compileAnnotated' | 'compileWithContext';
  source: string;
  options?: CompileOptions;
}

export interface WorkerResponse {
  id: number;
  type: 'compile' | 'compileAnnotated' | 'compileWithContext';
  success: boolean;
  result?: unknown;
  error?: string;
}

// Handle incoming messages
self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const { id, type, source, options } = event.data;

  try {
    let result: unknown;

    switch (type) {
      case 'compile':
        result = compile(source, options);
        break;
      case 'compileAnnotated':
        result = compileAnnotated(source);
        break;
      case 'compileWithContext':
        result = compileWithContext(source, options);
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
