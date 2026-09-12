// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ISSUE-016: the editor's compile worker must be cancellable. A Web Worker
// runs its messages serially and cannot be interrupted, so cancelling means
// terminating the worker and respawning it for the next request. The editor
// has its own CompilerWorkerClient so that cancelling never rejects a compile
// another caller (publish precheck, admin views) is waiting on.
//
// `Worker` is replaced with a FakeWorker that records posted messages and
// terminate() calls and lets a test answer a request by id. `fetch` is
// stubbed to fail loudly: a source without @font must never reach the
// network (resolveFontsForSource short-circuits before any fetch).

class FakeWorker {
  static instances: FakeWorker[] = [];

  readonly posted: { id: number; type: string; source: string }[] = [];

  terminated = false;

  onmessage: ((event: { data: unknown }) => void) | null = null;

  onerror: ((event: unknown) => void) | null = null;

  constructor(readonly url: string) {
    FakeWorker.instances.push(this);
  }

  postMessage(message: { id: number; type: string; source: string }): void {
    if (this.terminated) throw new Error('postMessage on a terminated FakeWorker');
    this.posted.push(message);
  }

  terminate(): void {
    this.terminated = true;
  }

  /** Deliver a successful reply for a request id, as the real worker would. */
  reply(id: number, result: unknown): void {
    this.onmessage?.({ data: { id, success: true, result } });
  }

  /** Deliver a failed reply for a request id. */
  fail(id: number, error: string): void {
    this.onmessage?.({ data: { id, success: false, error } });
  }
}

/** Poll until `cond()` holds (font resolution is async before postMessage). */
async function until(cond: () => boolean, label: string): Promise<void> {
  for (let i = 0; i < 50; i++) {
    if (cond()) return;
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  }
  throw new Error(`timed out waiting for: ${label}`);
}

/** Resolve to the rejection of `p` (or throw if it resolved). */
async function rejectionOf(p: Promise<unknown>): Promise<{ name: string; message: string; reason?: string }> {
  try {
    await p;
  } catch (e) {
    return e as { name: string; message: string; reason?: string };
  }
  throw new Error('expected the promise to reject');
}

const SOURCE_A = 'define ViewBox(0, 0, 10, 10);\nlet a = circle(5);\na.draw();';
const SOURCE_B = 'define ViewBox(0, 0, 10, 10);\nlet b = circle(4);\nb.draw();';

async function loadModule() {
  return import('../playground/services/compiler-worker');
}

describe('CompilerWorkerClient cancellation', () => {
  beforeEach(() => {
    vi.resetModules();
    FakeWorker.instances = [];
    vi.stubGlobal('Worker', FakeWorker);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        throw new Error(`unexpected fetch during a font-free compile: ${url}`);
      }),
    );
    (globalThis as { __PATHOGEN_API_BASE__?: string }).__PATHOGEN_API_BASE__ = 'http://localhost:8787';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('superseding compile: cancelInFlight terminates the worker, rejects the old promise, and the next request spawns a new worker', async () => {
    const { editorCompiler, CompileCancelledError } = await loadModule();

    const first = editorCompiler.compileWithContext(SOURCE_A, 1, undefined);
    first.catch(() => {}); // asserted below via rejectionOf
    await until(() => FakeWorker.instances[0]?.posted.length === 1, 'first request posted');
    const workerA = FakeWorker.instances[0];
    expect(editorCompiler.pendingCount).toBe(1);
    expect(workerA.posted[0]).toMatchObject({ id: 1, type: 'compileWithContext', source: SOURCE_A });

    // What workspace-view.updatePreview() does right before sending the newer compile.
    expect(editorCompiler.cancelInFlight('superseded')).toBe(true);
    expect(workerA.terminated).toBe(true);
    expect(editorCompiler.pendingCount).toBe(0);

    const err = await rejectionOf(first);
    expect(err.name).toBe('CompileCancelled');
    expect(err).toBeInstanceOf(CompileCancelledError);
    expect(err.reason).toBe('superseded');
    expect(err.message).toBe('Compile cancelled (superseded)');

    const second = editorCompiler.compileWithContext(SOURCE_B, 2, undefined);
    await until(
      () => FakeWorker.instances.length === 2 && FakeWorker.instances[1].posted.length === 1,
      'second request posted',
    );
    const workerB = FakeWorker.instances[1];
    expect(workerB).not.toBe(workerA);
    expect(workerA.posted).toHaveLength(1); // nothing else went to the dead worker
    // Request ids keep counting across the respawn.
    expect(workerB.posted[0]).toMatchObject({ id: 2, type: 'compileWithContext', source: SOURCE_B });

    workerB.reply(2, { svg: 'second' });
    await expect(second).resolves.toMatchObject({ svg: 'second' });
    expect(workerB.terminated).toBe(false);
  });

  it('cancelInFlight with nothing pending is a no-op: returns false, spawns nothing, keeps a live worker', async () => {
    const { editorCompiler } = await loadModule();

    expect(editorCompiler.cancelInFlight('user')).toBe(false);
    expect(FakeWorker.instances).toHaveLength(0);

    // After a request has been answered there is nothing to cancel either —
    // and the worker that answered it must survive for the next compile.
    const done = editorCompiler.compileWithContext(SOURCE_A, 1, undefined);
    await until(() => FakeWorker.instances[0]?.posted.length === 1, 'request posted');
    const worker = FakeWorker.instances[0];
    worker.reply(1, { svg: 'done' });
    await expect(done).resolves.toMatchObject({ svg: 'done' });

    expect(editorCompiler.cancelInFlight('user')).toBe(false);
    expect(worker.terminated).toBe(false);
    expect(FakeWorker.instances).toHaveLength(1);
  });

  it('a pending request on the shared instance survives an editor cancel and still resolves', async () => {
    const mod = await loadModule();
    const { editorCompiler, sharedCompiler } = mod;

    // publish-precheck / admin views go through the default export, which is
    // backed by the shared instance.
    const precheck = mod.default.compileWithContext(SOURCE_A, 7, undefined);
    await until(() => FakeWorker.instances[0]?.posted.length === 1, 'shared request posted');
    const sharedWorker = FakeWorker.instances[0];
    expect(sharedCompiler.pendingCount).toBe(1);

    const editorCompile = editorCompiler.compileWithContext(SOURCE_B, 1, undefined);
    editorCompile.catch(() => {});
    await until(
      () => FakeWorker.instances.length === 2 && FakeWorker.instances[1].posted.length === 1,
      'editor request posted',
    );
    const editorWorker = FakeWorker.instances[1];
    expect(editorWorker).not.toBe(sharedWorker);

    expect(editorCompiler.cancelInFlight('user')).toBe(true);
    expect(editorWorker.terminated).toBe(true);
    expect((await rejectionOf(editorCompile)).name).toBe('CompileCancelled');

    // The shared worker and its request are untouched.
    expect(sharedWorker.terminated).toBe(false);
    expect(sharedCompiler.pendingCount).toBe(1);
    sharedWorker.reply(sharedWorker.posted[0].id, { svg: 'precheck' });
    await expect(precheck).resolves.toMatchObject({ svg: 'precheck' });
  });

  it('terminate() rejects pending requests with a CompileCancelled error (reason: terminated)', async () => {
    const { editorCompiler } = await loadModule();

    const pending = editorCompiler.compileWithContext(SOURCE_A, 1, undefined);
    pending.catch(() => {});
    await until(() => FakeWorker.instances[0]?.posted.length === 1, 'request posted');

    editorCompiler.terminate();
    expect(FakeWorker.instances[0].terminated).toBe(true);
    const err = await rejectionOf(pending);
    expect(err.name).toBe('CompileCancelled');
    expect(err.reason).toBe('terminated');
    expect(editorCompiler.pendingCount).toBe(0);
  });

  it('refuses to post a request that is already stale (no worker is spawned for it)', async () => {
    const { editorCompiler } = await loadModule();

    const stale = editorCompiler.compileWithContext(SOURCE_A, 1, () => true);
    const err = await rejectionOf(stale);
    expect(err.message).toBe('Stale result');
    expect(FakeWorker.instances).toHaveLength(0);
    expect(editorCompiler.pendingCount).toBe(0);
  });

  it('a worker-reported failure is a plain Error, not a cancellation', async () => {
    const { editorCompiler } = await loadModule();

    const failing = editorCompiler.compileWithContext(SOURCE_A, 1, undefined);
    failing.catch(() => {});
    await until(() => FakeWorker.instances[0]?.posted.length === 1, 'request posted');
    FakeWorker.instances[0].fail(1, 'Undefined variable: nope');

    const err = await rejectionOf(failing);
    expect(err.name).toBe('Error');
    expect(err.message).toBe('Undefined variable: nope');
  });
});
