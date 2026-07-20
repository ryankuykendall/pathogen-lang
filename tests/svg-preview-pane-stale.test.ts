// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

// The stale marker is the guard against a failure mode found during the
// font-variable-resolution work: on compile error the pane keeps the last
// good render (and its injected @font-face rules), which read as "current
// output" while actually being stale.
describe('svg-preview-pane stale state', () => {
  it('toggles the stale class and badge on the preview container', async () => {
    await import('../playground/components/svg-preview-pane.ts');
    const el = document.createElement('svg-preview-pane') as HTMLElement & {
      setStale(s: boolean): void;
    };
    document.body.appendChild(el);
    const container = el.shadowRoot!.querySelector('#preview-container');
    expect(container).not.toBeNull();
    expect(el.shadowRoot!.querySelector('#stale-badge')?.textContent).toContain('Stale preview');

    el.setStale(true);
    expect(container!.classList.contains('stale')).toBe(true);
    el.setStale(false);
    expect(container!.classList.contains('stale')).toBe(false);
  });
});
