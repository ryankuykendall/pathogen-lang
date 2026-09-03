// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

// The storybook header renders its chip empty and hidden; only
// updateCompilationStatus() paints it. A story that seeds a compile before
// the element mounts relies on connectedCallback applying the chip once, and
// clock ticks must patch that same node in place.

describe('playground-header compile clock chip', () => {
  beforeAll(() => {
    // playground-header pulls in services/api.ts, which reads a build-time
    // esbuild define; supply it so the module can load under vitest.
    (globalThis as { __PATHOGEN_API_BASE__?: string }).__PATHOGEN_API_BASE__ = 'http://localhost:8787';
  });

  afterEach(async () => {
    const { store } = await import('../playground/state/store.ts');
    store.update({ compilationStatus: 'idle', compilationElapsedMs: 0 });
    document.body.innerHTML = '';
  });

  it('paints a seeded clock on mount and ticks the same node in place', async () => {
    const { store } = await import('../playground/state/store.ts');
    await import('../playground/components/playground-header.ts');
    store.update({ compilationStatus: 'compiling', compilationElapsedMs: 754_000 });

    const el = document.createElement('playground-header');
    document.body.appendChild(el);
    const chip = el.shadowRoot!.querySelector('#compilation-status') as HTMLElement;
    expect(chip).not.toBeNull();
    expect(chip.textContent).toBe('Compiling... 12:34');
    expect(chip.classList.contains('compiling')).toBe(true);

    store.set('compilationElapsedMs', 755_000);
    expect(el.shadowRoot!.querySelector('#compilation-status')!.isSameNode(chip)).toBe(true);
    expect(chip.textContent).toBe('Compiling... 12:35');

    store.set('compilationStatus', 'rendering');
    expect(chip.textContent).toBe('Rendering...');
    expect(chip.classList.contains('compiling')).toBe(false);
  });
});
