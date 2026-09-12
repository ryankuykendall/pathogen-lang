// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';

// The fullscreen chip is painted in place from two store keys: the status
// picks text/class, compilationElapsedMs supplies the "Compiling... MM:SS"
// clock. Pin both the paint and the in-place update (no node replacement).

describe('svg-preview-pane compile clock chip', () => {
  afterEach(async () => {
    const { store } = await import('../playground/state/store.ts');
    store.update({ compilationStatus: 'idle', compilationElapsedMs: 0 });
    document.body.innerHTML = '';
  });

  it('paints the clock from the store and ticks the same node in place', async () => {
    const { store } = await import('../playground/state/store.ts');
    await import('../playground/components/svg-preview-pane.ts');
    const el = document.createElement('svg-preview-pane');
    document.body.appendChild(el);
    const chip = el.shadowRoot!.querySelector('#compilation-status') as HTMLElement;
    expect(chip).not.toBeNull();

    store.update({ compilationStatus: 'compiling', compilationElapsedMs: 61_000 });
    expect(chip.textContent).toBe('Compiling... 01:01');
    expect(chip.classList.contains('compiling')).toBe(true);

    store.set('compilationElapsedMs', 62_000);
    expect(chip.textContent).toBe('Compiling... 01:02');
    expect(el.shadowRoot!.querySelector('#compilation-status')).toBe(chip);

    store.set('compilationStatus', 'rendering');
    expect(chip.textContent).toBe('Rendering...');
    expect(chip.classList.contains('compiling')).toBe(false);
  });

  // ISSUE-016: the fullscreen chrome carries a Cancel control beside the chip.
  // The pane never re-renders, so the button is toggled in place by the same
  // painter that ticks the clock.
  it('shows the Cancel control only while compiling and dispatches cancel-compile', async () => {
    const { store } = await import('../playground/state/store.ts');
    await import('../playground/components/svg-preview-pane.ts');
    const el = document.createElement('svg-preview-pane');
    document.body.appendChild(el);
    const chrome = el.shadowRoot!.querySelector('#compilation-chrome') as HTMLElement;
    const btn = el.shadowRoot!.querySelector('#cancel-compile-btn') as HTMLButtonElement;
    expect(chrome).not.toBeNull();
    expect(btn).not.toBeNull();
    expect(btn.getAttribute('aria-label')).toBe('Cancel compile');
    expect(chrome.classList.contains('hidden')).toBe(true);
    expect(btn.hidden).toBe(true);

    store.update({ compilationStatus: 'compiling', compilationElapsedMs: 1000 });
    expect(chrome.classList.contains('hidden')).toBe(false);
    expect(btn.hidden).toBe(false);

    // Ticks patch in place: same nodes, button still shown.
    store.set('compilationElapsedMs', 2000);
    expect(el.shadowRoot!.querySelector('#cancel-compile-btn')).toBe(btn);
    expect(btn.hidden).toBe(false);

    const received: Event[] = [];
    const listener = (e: Event) => received.push(e);
    document.addEventListener('cancel-compile', listener);
    try {
      btn.click();
    } finally {
      document.removeEventListener('cancel-compile', listener);
    }
    expect(received).toHaveLength(1);
    expect(received[0].bubbles).toBe(true);
    expect(received[0].composed).toBe(true);

    for (const status of ['rendering', 'completed', 'error', 'cancelled'] as const) {
      store.set('compilationStatus', status);
      expect(btn.hidden, `hidden while ${status}`).toBe(true);
      expect(chrome.classList.contains('hidden'), `chip shown while ${status}`).toBe(false);
    }
    store.set('compilationStatus', 'idle');
    expect(chrome.classList.contains('hidden')).toBe(true);
  });

  it('shows the running clock when mounted mid-compile', async () => {
    const { store } = await import('../playground/state/store.ts');
    await import('../playground/components/svg-preview-pane.ts');
    store.update({ compilationStatus: 'compiling', compilationElapsedMs: 754_000 });

    const el = document.createElement('svg-preview-pane');
    document.body.appendChild(el);
    expect(el.shadowRoot!.querySelector('#compilation-status')!.textContent).toBe('Compiling... 12:34');
  });
});
