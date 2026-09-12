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

  // ISSUE-016: the Cancel control beside the chip. It is part of render()
  // (status changes re-render), never of the clock tick.
  describe('Cancel control', () => {
    it('exists only while compiling', async () => {
      const { store } = await import('../playground/state/store.ts');
      await import('../playground/components/app-breadcrumb.ts');
      store.update({ currentView: 'workspace', compilationStatus: 'idle', compilationElapsedMs: 0 });

      const el = document.createElement('app-breadcrumb');
      document.body.appendChild(el);
      const query = () => el.shadowRoot!.querySelector<HTMLButtonElement>('#cancel-compile-btn');
      expect(query()).toBeNull();

      store.set('compilationStatus', 'compiling');
      const btn = query();
      expect(btn).not.toBeNull();
      expect(btn!.textContent.trim()).toBe('Cancel');
      expect(btn!.getAttribute('aria-label')).toBe('Cancel compile');
      expect(btn!.classList.contains('cancel-compile-btn')).toBe(true);
      // Rendered in the controls cluster, right after the chip.
      expect(btn!.closest('.controls-left')).not.toBeNull();
      expect(btn!.previousElementSibling?.id).toBe('compilation-status');

      for (const status of ['rendering', 'completed', 'error', 'cancelled', 'idle'] as const) {
        store.set('compilationStatus', status);
        expect(query(), `no Cancel while ${status}`).toBeNull();
      }
    });

    it('dispatches a bubbling, composed cancel-compile event on click', async () => {
      const { store } = await import('../playground/state/store.ts');
      await import('../playground/components/app-breadcrumb.ts');
      store.update({ currentView: 'workspace', compilationStatus: 'compiling', compilationElapsedMs: 0 });

      const el = document.createElement('app-breadcrumb');
      document.body.appendChild(el);

      // workspace-view listens on document, so the event must escape the shadow root.
      const received: Event[] = [];
      const listener = (e: Event) => received.push(e);
      document.addEventListener('cancel-compile', listener);
      try {
        el.shadowRoot!.querySelector<HTMLButtonElement>('#cancel-compile-btn')!.click();
      } finally {
        document.removeEventListener('cancel-compile', listener);
      }
      expect(received).toHaveLength(1);
      expect(received[0].type).toBe('cancel-compile');
      expect(received[0].bubbles).toBe(true);
      expect(received[0].composed).toBe(true);
    });

    it('survives clock ticks without re-render: same chip node, one button, still wired', async () => {
      const { store } = await import('../playground/state/store.ts');
      await import('../playground/components/app-breadcrumb.ts');
      store.update({ currentView: 'workspace', compilationStatus: 'compiling', compilationElapsedMs: 0 });

      const el = document.createElement('app-breadcrumb');
      document.body.appendChild(el);
      const chip = el.shadowRoot!.querySelector('#compilation-status')!;
      const btn = el.shadowRoot!.querySelector<HTMLButtonElement>('#cancel-compile-btn')!;

      store.set('compilationElapsedMs', 1000);
      store.set('compilationElapsedMs', 2000);
      expect(el.shadowRoot!.querySelector('#compilation-status')!.isSameNode(chip)).toBe(true);
      expect(chip.textContent).toBe('Compiling... 00:02');
      const buttons = el.shadowRoot!.querySelectorAll('#cancel-compile-btn, .cancel-compile-btn');
      expect(buttons).toHaveLength(1);
      expect(buttons[0].isSameNode(btn)).toBe(true);

      // The listener bound at render time is still the one that fires: exactly once per click.
      let count = 0;
      const listener = () => count++;
      document.addEventListener('cancel-compile', listener);
      try {
        btn.click();
      } finally {
        document.removeEventListener('cancel-compile', listener);
      }
      expect(count).toBe(1);
    });
  });
});
