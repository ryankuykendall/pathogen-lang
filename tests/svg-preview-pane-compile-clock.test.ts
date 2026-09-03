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

  it('shows the running clock when mounted mid-compile', async () => {
    const { store } = await import('../playground/state/store.ts');
    await import('../playground/components/svg-preview-pane.ts');
    store.update({ compilationStatus: 'compiling', compilationElapsedMs: 754_000 });

    const el = document.createElement('svg-preview-pane');
    document.body.appendChild(el);
    expect(el.shadowRoot!.querySelector('#compilation-status')!.textContent).toBe('Compiling... 12:34');
  });
});
