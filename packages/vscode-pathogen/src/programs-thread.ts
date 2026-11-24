/**
 * The host's side of the preview's drawing thread (programs-worker.ts): one
 * draw at a time, stopped by ending the thread, and a fresh thread for the
 * next draw. A thread that fails to start or exits mid-draw rejects that draw
 * with an Error, which the drawings queue shows as a blank tile.
 *
 * No `vscode` import: tests/vscode-programs-thread.test.ts runs the compiled
 * thread from out/.
 */
import { Worker } from 'node:worker_threads';

import { DrawCancelled } from './preview-drawings';

import type { DrawResult } from './program-drawing';
import type { DrawRequest, WorkerLibraryPaths } from './programs-worker';

export class DrawingThread {
  private worker: Worker | null = null;

  private nextId = 0;

  private pending: { id: number; resolve: (r: DrawResult) => void; reject: (e: unknown) => void } | null = null;

  /** `script`: the compiled programs-worker.js. */
  constructor(
    private readonly script: string,
    private readonly libraries: WorkerLibraryPaths,
  ) {}

  draw(program: string, open: [string, string][], maxDataBytes?: number): Promise<DrawResult> {
    // One at a time: a draw still running is stopped first.
    if (this.pending) this.cancel();
    const worker = this.start();
    const id = ++this.nextId;
    // A draw in flight keeps the process alive; an idle thread never does.
    worker.ref();
    const settled = () => {
      if (this.worker === worker) worker.unref();
    };
    return new Promise<DrawResult>((resolve, reject) => {
      this.pending = {
        id,
        resolve: (r) => {
          settled();
          resolve(r);
        },
        reject: (e) => {
          settled();
          reject(e);
        },
      };
      const request: DrawRequest = { id, program, open, ...(maxDataBytes === undefined ? {} : { maxDataBytes }) };
      worker.postMessage(request);
    });
  }

  /** Stop the draw in flight: it rejects with DrawCancelled, and the thread ends. */
  cancel(): void {
    const pending = this.pending;
    this.pending = null;
    this.stop();
    pending?.reject(new DrawCancelled());
  }

  dispose(): void {
    this.cancel();
  }

  private start(): Worker {
    if (this.worker) return this.worker;
    const worker = new Worker(this.script, { workerData: this.libraries });
    worker.on('message', (msg: { id: number; result?: DrawResult; failed?: string }) => {
      const pending = this.pending;
      if (!pending || pending.id !== msg.id) return;
      this.pending = null;
      if (msg.result) pending.resolve(msg.result);
      else pending.reject(new Error(msg.failed ?? 'The drawing thread gave no result.'));
    });
    const lost = (why: string) => {
      if (this.worker !== worker) return;
      this.worker = null;
      const pending = this.pending;
      this.pending = null;
      pending?.reject(new Error(why));
    };
    worker.on('error', (err) => lost(`The drawing thread failed: ${err.message}`));
    worker.on('exit', (code) => lost(`The drawing thread exited (${code}).`));
    // Idle, it never keeps VS Code's extension host (or a script) alive on its own.
    worker.unref();
    this.worker = worker;
    return worker;
  }

  private stop(): void {
    const worker = this.worker;
    this.worker = null;
    if (worker) worker.terminate().catch(() => undefined);
  }
}
