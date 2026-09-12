import { describe, expect, it, vi } from 'vitest';

import { GpuRenderError, withGpuErrorScopes, type ErrorScopeDevice } from '../playground/gpu/gpu-error-scopes';

function fakeDevice(pops: Array<{ message: string } | null | Error>): ErrorScopeDevice & {
  pushes: string[];
  popCalls: number;
  popsAfterFn: number[];
} {
  const device = {
    pushes: [] as string[],
    popCalls: 0,
    popsAfterFn: [] as number[],
    pushErrorScope: vi.fn((filter: GPUErrorFilter) => {
      device.pushes.push(filter);
    }),
    popErrorScope: vi.fn(() => {
      const outcome = pops[device.popCalls++];
      return outcome instanceof Error ? Promise.reject(outcome) : Promise.resolve(outcome as GPUError | null);
    }),
  };
  return device;
}

describe('withGpuErrorScopes', () => {
  it('runs fn inside three scopes and resolves its value when none report', async () => {
    const device = fakeDevice([null, null, null]);
    let popsWhenFnRan = -1;
    const value = await withGpuErrorScopes(device, 'conic', () => {
      popsWhenFnRan = device.popCalls;
      return 'data:image/png;base64,ok';
    });
    expect(value).toBe('data:image/png;base64,ok');
    expect(device.pushes).toEqual(['internal', 'out-of-memory', 'validation']);
    expect(popsWhenFnRan).toBe(0);
    expect(device.popCalls).toBe(3);
  });

  it('rejects with GpuRenderError carrying the label and message when a scope reports', async () => {
    const device = fakeDevice([{ message: 'Texture size (12000×4650) exceeded maximum texture size' }, null, null]);
    const run = withGpuErrorScopes(device, 'conic', () => 'blank-but-truthy');
    await expect(run).rejects.toBeInstanceOf(GpuRenderError);
    await expect(run).rejects.toThrow('conic: Texture size (12000×4650) exceeded maximum texture size');
    expect(device.popCalls).toBe(3);
  });

  it('rethrows an exception from fn after still popping every scope', async () => {
    const device = fakeDevice([null, null, null]);
    const boom = new Error('Could not get webgpu context');
    await expect(
      withGpuErrorScopes(device, 'mesh', () => {
        throw boom;
      }),
    ).rejects.toBe(boom);
    expect(device.popCalls).toBe(3);
  });

  it('treats a rejecting pop as a failure rather than resolving a value', async () => {
    const device = fakeDevice([null, new Error('device lost'), null]);
    const run = withGpuErrorScopes(device, 'topo', () => 'value');
    await expect(run).rejects.toBeInstanceOf(GpuRenderError);
    await expect(run).rejects.toThrow('popErrorScope rejected');
  });

  it('collects every reporting scope into one error', async () => {
    const device = fakeDevice([{ message: 'validation failed' }, { message: 'out of memory' }, null]);
    await expect(withGpuErrorScopes(device, 'freeform', () => 1)).rejects.toThrow(
      'freeform: validation failed; out of memory',
    );
  });
});
