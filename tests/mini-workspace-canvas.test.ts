// @vitest-environment jsdom
//
// The blog's mini-workspace: Background and Grid (2d, step 9c; mockup v7
// screen W, approved 2026-11-09, note 53 answer 6):
// - In the control bar after the post's own variable chips: Background ("the
//   canvas behind the drawing"), then Grid. Both stay outside the chip group,
//   so variables that arrive late (an SVG fetched after the page) still get
//   their chips.
// - Background opens a popover: five swatches, a hex field (a bad value is
//   marked and changes nothing), and Default, the embed's own (transparent).
//   Esc closes it only, and the keyboard goes back to Background.
// - Grid turns the grid on, with its size beside it while it's on.
// - Reset is always there: it puts back the variables, the background and
//   the grid, and its tooltip says which.
// - Nothing is remembered: no storage is written.

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

type Preview = HTMLElement & { background: string; grid: { enabled: boolean; size: number; color: string } };

describe('the mini-workspace’s Background and Grid (step 9c)', () => {
  beforeAll(async () => {
    // The theme manager asks for the system's colour scheme; jsdom has no matchMedia.
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
    })) as unknown as typeof window.matchMedia;
    await import('../playground/components/blog/mini-workspace.ts');
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  /** An embed, its bar open as a reader's click leaves it (unless `barOpen` is false). */
  function mount(vars: string | null, barOpen = true) {
    const el = document.createElement('mini-workspace');
    if (vars !== null) el.setAttribute('vars', vars);
    el.innerHTML = '<pre><code>define ViewBox(0, 0, 240, 120);\ncircle(120, 60, 40);</code></pre>';
    document.body.appendChild(el);
    if (barOpen) el.classList.add('bar-open', 'bar-fully-open');
    const root = el.shadowRoot!;
    const q = <T extends Element = HTMLElement>(sel: string) => root.querySelector<T>(sel as never) as T;
    const preview = () => q<Preview>('mini-preview');
    return { el, root, q, preview };
  }

  const key = (target: Element, k: string): KeyboardEvent => {
    const event = new window.KeyboardEvent('keydown', { key: k, bubbles: true, composed: true, cancelable: true });
    target.dispatchEvent(event);
    return event;
  };

  it('sits after the variable chips, outside their group: Background, Grid, then Reset', () => {
    const { root } = mount('--bg: #d0d7f0');
    const inner = root.querySelector('.glass-bar-inner')!;
    const order = [...inner.children].map((c) => c.id || c.className).filter((x) => x !== 'glass-divider');
    // Copy left the bar for the code panel (2e, step 3b): fullscreen follows Reset.
    expect(order).toEqual([
      'code-toggle',
      'chip-group',
      'bg-control',
      'grid-control',
      'canvas-reset',
      'fullscreen-btn',
    ]);
    expect(root.querySelector('#chip-group #vars-reset, #chip-group #canvas-reset')).toBeNull();
    expect(root.querySelector('#chip-group pathogen-color-input[data-var="--bg"]')).not.toBeNull();
    expect(root.querySelector('#bg-btn')!.getAttribute('data-tip')).toBe('Background: the canvas behind the drawing');
  });

  it('Background: a swatch, a hex value, a bad hex (marked, nothing changes), and Default', () => {
    const { q, preview } = mount(null);
    expect(preview().background).toBe('transparent');
    q('#bg-btn').click();
    const popover = q('#bg-popover');
    expect(popover.hidden).toBe(false);
    const swatches = [...popover.querySelectorAll<HTMLButtonElement>('.swatch')];
    expect(swatches.map((s) => s.getAttribute('aria-label'))).toEqual([
      'White, #ffffff',
      'Paper, #f5f0e6',
      'Light grey, #e5e7eb',
      'Slate, #4b5563',
      'Black, #000000',
    ]);
    swatches[3].click();
    expect([preview().background, swatches[3].getAttribute('aria-pressed')]).toEqual(['#4b5563', 'true']);
    const hex = q<HTMLInputElement>('#bg-hex');
    expect(hex.value).toBe('#4b5563');
    hex.value = '#123456';
    key(hex, 'Enter');
    expect(preview().background).toBe('#123456');
    hex.value = 'nope';
    key(hex, 'Enter');
    expect([preview().background, hex.getAttribute('aria-invalid')]).toEqual(['#123456', 'true']);
    q('#bg-default').click();
    expect([preview().background, hex.value, hex.getAttribute('aria-invalid')]).toEqual(['transparent', '', 'false']);
  });

  it('Background’s Esc closes the popover only, and the keyboard goes back to Background', () => {
    const { q } = mount(null);
    q('#bg-btn').click();
    const event = key(q('#bg-hex'), 'Escape');
    expect([
      q('#bg-popover').hidden,
      event.defaultPrevented,
      q('#bg-btn') === q('#bg-btn').getRootNode().activeElement,
    ]).toEqual([true, true, true]);
  });

  it('Grid: on with its size beside it (20 px, the playground’s), the size changes, off hides it', () => {
    const { q, preview } = mount(null);
    expect([preview().grid.enabled, q('#grid-size').hidden]).toEqual([false, true]);
    q('#grid-btn').click();
    expect([q('#grid-btn').getAttribute('aria-pressed'), q('#grid-size').hidden, preview().grid]).toEqual([
      'true',
      false,
      { enabled: true, size: 20, color: '#cccccc' },
    ]);
    const size = q<HTMLSelectElement>('#grid-size');
    expect([...size.options].map((o) => o.value)).toEqual(['10', '20', '25', '50', '100']);
    size.value = '50';
    size.dispatchEvent(new window.Event('change', { bubbles: true }));
    expect(preview().grid.size).toBe(50);
    q('#grid-btn').click();
    expect([preview().grid.enabled, q('#grid-size').hidden]).toEqual([false, true]);
  });

  it('Reset puts back the variables, the background and the grid, and says so', () => {
    const { root, q, preview } = mount('--bg: #d0d7f0');
    const chip = root.querySelector<HTMLElement & { value: string }>('#chip-group pathogen-color-input')!;
    chip.dispatchEvent(
      new window.CustomEvent('color-change', { bubbles: true, composed: true, detail: { value: '#ff0000' } }),
    );
    q('#bg-btn').click();
    q<HTMLButtonElement>('.swatch').click();
    q('#grid-btn').click();
    const reset = q('#canvas-reset');
    expect(reset.getAttribute('data-tip')).toBe('Reset the variables, the background and the grid');
    reset.click();
    expect([
      chip.value,
      preview().background,
      preview().grid.enabled,
      q('#grid-btn').getAttribute('aria-pressed'),
    ]).toEqual(['#d0d7f0', 'transparent', false, 'false']);
  });

  it('with no variables, Reset is still there, for the background and the grid', () => {
    const { q, preview } = mount(null);
    expect(q('#canvas-reset').getAttribute('data-tip')).toBe('Reset the background and the grid');
    q('#grid-btn').click();
    q('#canvas-reset').click();
    expect(preview().grid.enabled).toBe(false);
  });

  it('nothing is remembered: no storage is written', () => {
    const setItem = vi.spyOn(window.Storage.prototype, 'setItem');
    const { q } = mount('--bg: #d0d7f0');
    q('#bg-btn').click();
    q<HTMLButtonElement>('.swatch').click();
    q('#grid-btn').click();
    expect(setItem).not.toHaveBeenCalled();
  });

  // The code review's cases.

  it('variables that arrive late (an SVG fetched after the page) still get their chips, and Reset says so', () => {
    const { el, root, q } = mount(null);
    expect([root.querySelectorAll('#chip-group .chip').length, q('#canvas-reset').getAttribute('data-tip')]).toEqual([
      0,
      'Reset the background and the grid',
    ]);
    const embed = el as unknown as {
      _cssVars: { name: string; defaultValue: string }[];
      _injectVarControls: () => void;
    };
    embed._cssVars = [{ name: '--ink', defaultValue: '#112233' }];
    embed._injectVarControls();
    expect([
      root.querySelectorAll('#chip-group .chip').length,
      q('#canvas-reset').getAttribute('data-tip'),
      root.querySelector('#chip-group #bg-control'),
    ]).toEqual([1, 'Reset the variables, the background and the grid', null]);
  });

  it('Background pressed while the bar unfolds opens once it has (the bar clips it until then)', () => {
    const { el, q } = mount(null, false);
    el.classList.add('bar-open');
    q('#bg-btn').click();
    expect(q('#bg-popover').hidden).toBe(true);
    const done = new window.Event('transitionend');
    Object.defineProperty(done, 'propertyName', { value: 'height' });
    q('#glass-bar').dispatchEvent(done);
    expect([el.classList.contains('bar-fully-open'), q('#bg-popover').hidden]).toEqual([true, false]);
  });

  it('a press outside, in another embed too, closes the popover', () => {
    const first = mount(null);
    const second = mount(null);
    first.q('#bg-btn').click();
    second.el.dispatchEvent(new window.Event('pointerdown', { bubbles: true, composed: true }));
    expect(first.q('#bg-popover').hidden).toBe(true);
    first.q('#bg-btn').click();
    document.body.dispatchEvent(new window.Event('pointerdown', { bubbles: true }));
    expect(first.q('#bg-popover').hidden).toBe(true);
  });

  it('folding the bar, Reset, or Tab out of it closes the popover', () => {
    const { el, q } = mount(null);
    q('#bg-btn').click();
    q('#summary').click();
    expect(q('#bg-popover').hidden).toBe(true);
    // Open again (as its transition would leave it).
    q('#summary').click();
    el.classList.add('bar-fully-open');
    q('#bg-btn').click();
    q('#canvas-reset').click();
    expect(q('#bg-popover').hidden).toBe(true);
    q('#bg-btn').click();
    q('.swatch').dispatchEvent(new window.FocusEvent('focusout', { bubbles: true, relatedTarget: document.body }));
    expect(q('#bg-popover').hidden).toBe(true);
  });

  it('Esc in the popover reaches nothing outside it (the preview’s fullscreen listens on the document)', () => {
    const { q } = mount(null);
    const outside = vi.fn();
    document.addEventListener('keydown', outside);
    q('#bg-btn').click();
    key(q('#bg-hex'), 'Escape');
    document.removeEventListener('keydown', outside);
    expect([outside.mock.calls.length, q('#bg-popover').hidden]).toEqual([0, true]);
  });

  it('an embed taken out and put back starts afresh, and its controls work', () => {
    const { el, q, preview } = mount(null);
    q('#bg-btn').click();
    q<HTMLButtonElement>('.swatch').click();
    q('#grid-btn').click();
    el.remove();
    document.body.appendChild(el);
    el.classList.add('bar-open', 'bar-fully-open');
    expect([preview().background, preview().grid.enabled, q('#grid-btn').getAttribute('aria-pressed')]).toEqual([
      'transparent',
      false,
      'false',
    ]);
    q('#grid-btn').click();
    expect([preview().grid.enabled, q('#grid-btn').getAttribute('aria-pressed')]).toEqual([true, 'true']);
  });
});
