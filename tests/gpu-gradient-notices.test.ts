import { afterEach, describe, expect, it } from 'vitest';

import { groupWarnLogEntries } from '../src/evaluator/warning-groups';

// gradient-service.ts touches the DOM only inside render functions, so its
// notice queue can be exercised under node.

describe('gradient-service notices', () => {
  afterEach(async () => {
    const { takeNotices } = await import('../playground/gpu/gradient-service');
    takeNotices();
  });

  it('queues console-shaped warn entries and drains them once', async () => {
    const { pushNotice, takeNotices } = await import('../playground/gpu/gradient-service');
    pushNotice("Gradient 'wheel' (conic) rendered with the Canvas 2D fallback — WebGPU failed: texture too large.");
    const drained = takeNotices();
    expect(drained).toEqual([
      {
        line: null,
        severity: 'warn',
        parts: [
          {
            type: 'string',
            value:
              "[warn] Gradient 'wheel' (conic) rendered with the Canvas 2D fallback — WebGPU failed: texture too large.",
          },
        ],
      },
    ]);
    expect(takeNotices()).toEqual([]);
  });

  it('groups like the compiler console does: one row per distinct notice', async () => {
    const { pushNotice, takeNotices } = await import('../playground/gpu/gradient-service');
    pushNotice("Gradient 'a' (conic) could not be rasterized (Canvas 2D failed); fills using it will render empty.");
    pushNotice("Gradient 'b' (mesh) could not be rasterized (Canvas 2D failed); fills using it will render empty.");
    const grouped = groupWarnLogEntries(takeNotices() as never);
    expect(grouped).toHaveLength(2);
  });

  it('caps the queue so a caller that never drains cannot grow it without bound', async () => {
    const { pushNotice, takeNotices } = await import('../playground/gpu/gradient-service');
    for (let i = 0; i < 100; i++) pushNotice(`notice ${i}`);
    expect(takeNotices()).toHaveLength(64);
  });
});
