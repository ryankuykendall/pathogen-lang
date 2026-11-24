/**
 * The preview's drawing thread (2f): draws the program list's programs small
 * (program-drawing.ts), off the extension host's own thread, as the playground
 * draws them on a worker of their own. One draw at a time; the host stops a
 * draw by ending the thread (programs-thread.ts).
 *
 * `workerData` names the library files the host loaded (`pathogen-lang` and
 * `pathogen-lang/node`: the .vsix's bundled copies, or the repo's dist/ when
 * running from source), so both threads run the same library.
 *
 * Messages:
 *   host → thread  { id, program, open: [path, text][], maxDataBytes? }
 *   thread → host  { id, result: DrawResult } | { id, failed: string }
 */
import { createRequire } from 'node:module';
import { parentPort, workerData } from 'node:worker_threads';

import { FontSession } from './font-session';
import { samePathKey } from './preview-modules';
import { drawProgram } from './program-drawing';

import type { PathogenLib, PathogenNodeLib } from './font-session';
import type { DrawingLib, DrawingNodeLib } from './program-drawing';

export interface WorkerLibraryPaths {
  lib: string;
  node: string;
}

export interface DrawRequest {
  id: number;
  program: string;
  open: [string, string][];
  /** The `pathogen.maxDataSize` setting, in bytes, when set. */
  maxDataBytes?: number;
}

if (parentPort) {
  const port = parentPort;
  const paths = workerData as WorkerLibraryPaths;
  const load = createRequire(__filename);
  const lib = load(paths.lib) as PathogenLib & DrawingLib;
  const node = load(paths.node) as PathogenNodeLib & DrawingNodeLib;
  const fonts = new FontSession({ lib, node });
  port.on('message', (request: DrawRequest) => {
    // By one spelling per file, as the preview matches open tabs (samePathKey).
    const open = new Map(request.open.map(([p, text]) => [samePathKey(p), text]));
    drawProgram({ lib, node }, fonts, request.program, (p) => open.get(samePathKey(p)), request.maxDataBytes).then(
      (result) => port.postMessage({ id: request.id, result }),
      (err: unknown) => port.postMessage({ id: request.id, failed: err instanceof Error ? err.message : String(err) }),
    );
  });
}
