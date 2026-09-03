// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

// The breadcrumb re-renders its whole shadow DOM on a status change, but the
// once-a-second clock must patch the existing chip node in place: a 1 Hz
// innerHTML rebuild would close the overflow menu, drop focus, and restart
// the chip's pulse animation. isSameNode is the proof.

describe('app-breadcrumb compile clock chip', () => {
  beforeAll(() => {
    // app-breadcrumb pulls in services/api.ts, which reads a build-time
    // esbuild define; supply it so the module can load under vitest.
    (globalThis as { __PATHOGEN_API_BASE__?: string }).__PATHOGEN_API_BASE__ = 'http://localhost:8787';
  });

  afterEach(async () => {
    const { store } = await import('../playground/state/store.ts');
    store.update({ currentView: 'landing', compilationStatus: 'idle', compilationElapsedMs: 0 });
    document.body.innerHTML = '';
  });

  it('ticks the clock on the same node and re-renders only on a status change', async () => {
    const { store } = await import('../playground/state/store.ts');
    await import('../playground/components/app-breadcrumb.ts');
    store.update({ currentView: 'workspace', compilationStatus: 'compiling', compilationElapsedMs: 0 });

    const el = document.createElement('app-breadcrumb');
    document.body.appendChild(el);
    const chip = el.shadowRoot!.querySelector('#compilation-status') as HTMLElement;
    expect(chip).not.toBeNull();
    expect(chip.textContent).toBe('Compiling... 00:00');

    store.set('compilationElapsedMs', 61_000);
    expect(el.shadowRoot!.querySelector('#compilation-status')!.isSameNode(chip)).toBe(true);
    expect(chip.textContent).toBe('Compiling... 01:01');
    expect(chip.classList.contains('compiling')).toBe(true);

    // A status change still goes through render() and reads the current clock.
    store.set('compilationStatus', 'rendering');
    const after = el.shadowRoot!.querySelector('#compilation-status') as HTMLElement;
    expect(after.textContent).toBe('Rendering...');

    // Re-entering compiling paints the clock from the store, not from 00:00.
    store.update({ compilationStatus: 'compiling', compilationElapsedMs: 5000 });
    expect(el.shadowRoot!.querySelector('#compilation-status')!.textContent).toBe('Compiling... 00:05');
  });
});
