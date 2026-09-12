/**
 * WebGPU error capture for a synchronous render sequence.
 *
 * Validation and out-of-memory failures on a device do not throw: they are
 * reported through the device's error-scope stack (or, when nothing is
 * listening, logged as uncaptured errors) while the calling code carries on
 * with invalid objects. A render that ends in `canvas.toDataURL()` then
 * returns a perfectly valid *blank* image. This helper turns those reports
 * back into a thrown error so callers can fall back and never cache a blank.
 */

/** The subset of GPUDevice this helper needs — fakeable in unit tests. */
export interface ErrorScopeDevice {
  pushErrorScope(filter: GPUErrorFilter): void;
  popErrorScope(): Promise<GPUError | null>;
}

export class GpuRenderError extends Error {
  readonly errors: ReadonlyArray<{ message: string }>;

  constructor(label: string, errors: ReadonlyArray<{ message: string }>) {
    super(`${label}: ${errors.map((e) => e.message).join('; ')}`);
    this.name = 'GpuRenderError';
    this.errors = errors;
  }
}

/** Push order; `validation` ends up on top and is popped first. */
const FILTERS: readonly GPUErrorFilter[] = ['internal', 'out-of-memory', 'validation'];

/**
 * Run `fn` inside error scopes and reject if any of them reports.
 *
 * `fn` must be synchronous: the gradient families render under
 * `Promise.all` on one shared device, and error scopes are a per-device
 * LIFO stack — an `await` between push and pop would let another render's
 * scopes interleave with this one and misattribute its errors. Do every
 * `await` (pipeline getters) before calling this, and keep the canvas
 * configure → submit → `toDataURL` sequence inside `fn`.
 *
 * All pops are issued synchronously in LIFO order right after `fn`, then
 * awaited together. A throw from `fn` is rethrown after the pops; a pop that
 * rejects (device lost, empty stack) counts as a failure.
 */
export async function withGpuErrorScopes<T>(device: ErrorScopeDevice, label: string, fn: () => T): Promise<T> {
  for (const filter of FILTERS) device.pushErrorScope(filter);

  let result: T | undefined;
  let thrown: unknown;
  let threw = false;
  try {
    result = fn();
  } catch (e) {
    threw = true;
    thrown = e;
  }

  const pops = FILTERS.map(() => device.popErrorScope());
  const settled = await Promise.allSettled(pops);
  if (threw) throw thrown;

  const errors: { message: string }[] = [];
  for (const s of settled) {
    if (s.status === 'fulfilled') {
      if (s.value) errors.push({ message: s.value.message });
    } else {
      errors.push({ message: `popErrorScope rejected (${String(s.reason)})` });
    }
  }
  if (errors.length > 0) throw new GpuRenderError(label, errors);
  return result as T;
}
