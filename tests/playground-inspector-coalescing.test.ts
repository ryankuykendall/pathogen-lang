// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from 'vitest';

// Regression tests for the editor-choppiness fix (project-docs/editor-perf/):
// the inspector pipeline used to rebuild three panels once per store key per
// compile (~550ms main-thread on layer-heavy programs). The fix has three
// layers, each covered here:
//   1. panel setters coalesce into one updateList per microtask
//   2. inspector-panel setData only forwards fields whose identity changed
//   3. layers/palette panels render via a single innerHTML pass with
//      delegated click handling (rows must stay interactive and escaped)

import type { LayerOutput } from '../playground/types/compiler.js';

function makeLayer(name: string, overrides: Partial<LayerOutput> = {}): LayerOutput {
  return {
    name,
    type: 'path',
    data: 'M 0 0 L 10 10',
    styles: { stroke: '#123456', fill: 'none' },
    isDefault: false,
    ...overrides,
  } as LayerOutput;
}

/** Two microtask hops — enough to drain a schedule-inside-microtask chain. */
async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

beforeAll(async () => {
  await import('../playground/components/inspector-panel.ts');
});

describe('layers-panel update coalescing', () => {
  it('runs updateList once for a burst of property assignments', async () => {
    const el = document.createElement('layers-panel') as HTMLElement & {
      layers: LayerOutput[];
      masks: { id: string }[];
      clipPaths: { id: string }[];
      gradients: unknown[];
      layerVisibility: Record<string, boolean>;
      updateList: () => void;
    };
    el.setAttribute('embedded', '');
    document.body.appendChild(el);
    await flushMicrotasks();

    const updateSpy = vi.spyOn(el, 'updateList');
    el.layers = [makeLayer('a'), makeLayer('b')];
    el.masks = [];
    el.clipPaths = [];
    el.gradients = [];
    el.layerVisibility = {};
    expect(updateSpy).not.toHaveBeenCalled(); // nothing synchronous

    await flushMicrotasks();
    expect(updateSpy).toHaveBeenCalledTimes(1);

    const rows = el.shadowRoot!.querySelectorAll('.layer-row');
    expect(rows.length).toBe(2);
    el.remove();
  });

  it('renders rows with names, badges, and eye buttons intact', async () => {
    const el = document.createElement('layers-panel') as HTMLElement & { layers: LayerOutput[] };
    el.setAttribute('embedded', '');
    document.body.appendChild(el);
    el.layers = [makeLayer('ring0'), makeLayer('label', { type: 'text' })];
    await flushMicrotasks();

    const rows = Array.from(el.shadowRoot!.querySelectorAll('.layer-row'));
    expect(rows.map((r) => r.querySelector('.layer-name')?.textContent)).toEqual(['ring0', 'label']);
    expect(rows.map((r) => r.querySelector('.type-badge')?.textContent)).toEqual(['path', 'text']);
    expect(rows.every((r) => r.querySelector('.eye-btn'))).toBe(true);
    el.remove();
  });

  it('escapes hostile layer names instead of injecting markup', async () => {
    const el = document.createElement('layers-panel') as HTMLElement & { layers: LayerOutput[] };
    el.setAttribute('embedded', '');
    document.body.appendChild(el);
    el.layers = [makeLayer('<img src=x onerror=alert(1)>')];
    await flushMicrotasks();

    expect(el.shadowRoot!.querySelector('img')).toBeNull();
    expect(el.shadowRoot!.querySelector('.layer-name')?.textContent).toBe('<img src=x onerror=alert(1)>');
    el.remove();
  });

  it('delegated eye-button click dispatches layer-visibility-change and re-renders', async () => {
    const el = document.createElement('layers-panel') as HTMLElement & { layers: LayerOutput[] };
    el.setAttribute('embedded', '');
    document.body.appendChild(el);
    el.layers = [makeLayer('halo')];
    await flushMicrotasks();

    const events: { name: string; visible: boolean }[] = [];
    el.addEventListener('layer-visibility-change', (e) => {
      // eslint-disable-next-line n/no-unsupported-features/node-builtins -- jsdom environment, not Node
      events.push((e as CustomEvent<{ name: string; visible: boolean }>).detail);
    });

    const eye = el.shadowRoot!.querySelector('.eye-btn') as HTMLButtonElement;
    eye.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));

    expect(events).toEqual([{ name: 'halo', visible: false }]);
    // toggleVisibility re-renders synchronously; the row now shows the "show" affordance
    const eyeAfter = el.shadowRoot!.querySelector('.eye-btn') as HTMLButtonElement;
    expect(eyeAfter.getAttribute('title')).toBe('Show layer');
    el.remove();
  });

  it('delegated eye-button click on a defs row dispatches defs-visibility-change', async () => {
    const el = document.createElement('layers-panel') as HTMLElement & {
      layers: LayerOutput[];
      masks: { id: string }[];
    };
    el.setAttribute('embedded', '');
    document.body.appendChild(el);
    el.layers = [makeLayer('masked', { styles: { stroke: '#000', mask: 'url(#m1)' } })];
    el.masks = [{ id: 'm1' }];
    await flushMicrotasks();

    const defsRow = el.shadowRoot!.querySelector('.layer-row.defs-row') as HTMLElement;
    expect(defsRow).not.toBeNull();
    expect(defsRow.dataset.defKey).toBe('mask:m1');

    const events: { key: string; visible: boolean }[] = [];
    el.addEventListener('defs-visibility-change', (e) => {
      // eslint-disable-next-line n/no-unsupported-features/node-builtins -- jsdom environment, not Node
      events.push((e as CustomEvent<{ key: string; visible: boolean }>).detail);
    });
    (defsRow.querySelector('.eye-btn') as HTMLButtonElement).dispatchEvent(
      new MouseEvent('click', { bubbles: true, composed: true }),
    );
    expect(events).toEqual([{ key: 'mask:m1', visible: false }]);
    el.remove();
  });

  it('rejects style values that could break out of the style attribute', async () => {
    const el = document.createElement('layers-panel') as HTMLElement & { layers: LayerOutput[] };
    el.setAttribute('embedded', '');
    document.body.appendChild(el);
    // A value containing a declaration separator must not reach the style attr
    el.layers = [makeLayer('sneaky', { styles: { fill: 'red; background-image: url(https://evil)' } })];
    await flushMicrotasks();

    const dot = el.shadowRoot!.querySelector('.color-dot') as HTMLElement;
    expect(dot.getAttribute('style')).toBe('background: #333');
    el.remove();
  });

  it('delegated group-row click toggles collapse of children', async () => {
    const el = document.createElement('layers-panel') as HTMLElement & { layers: LayerOutput[] };
    el.setAttribute('embedded', '');
    document.body.appendChild(el);
    el.layers = [makeLayer('grp', { type: 'group', children: [makeLayer('child-1'), makeLayer('child-2')] })];
    await flushMicrotasks();
    expect(el.shadowRoot!.querySelectorAll('.layer-row').length).toBe(3);

    const groupRow = el.shadowRoot!.querySelector('.layer-row[data-group="1"]') as HTMLElement;
    (groupRow.querySelector('.layer-name') as HTMLElement).dispatchEvent(
      new MouseEvent('click', { bubbles: true, composed: true }),
    );
    expect(el.shadowRoot!.querySelectorAll('.layer-row').length).toBe(1);
    el.remove();
  });
});

describe('palette-panel', () => {
  it('coalesces assignments and renders escaped color rows', async () => {
    const el = document.createElement('palette-panel') as HTMLElement & {
      layers: LayerOutput[];
      gradients: unknown[];
      updateList: () => void;
    };
    el.setAttribute('embedded', '');
    document.body.appendChild(el);
    await flushMicrotasks();

    const updateSpy = vi.spyOn(el, 'updateList');
    el.layers = [makeLayer('<b>x</b>', { styles: { stroke: 'oklch(0.6 0.1 200)', fill: 'none' } })];
    el.gradients = [];
    await flushMicrotasks();

    expect(updateSpy).toHaveBeenCalledTimes(1);
    expect(el.shadowRoot!.querySelector('b')).toBeNull();
    expect(el.shadowRoot!.querySelector('.group-header')?.textContent).toBe('<b>x</b>');
    const row = el.shadowRoot!.querySelector('.color-row');
    expect(row?.querySelector('.prop-name')?.textContent).toBe('stroke');
    expect(row?.querySelector('.color-value')?.textContent).toBe('oklch(0.6 0.1 200)');
    el.remove();
  });
});

describe('cssvar-panel update coalescing', () => {
  it('runs updateList once for a burst of property assignments', async () => {
    const el = document.createElement('cssvar-panel') as HTMLElement & {
      layers: LayerOutput[];
      cssProperties: unknown[];
      gradients: unknown[];
      updateList: () => void;
    };
    el.setAttribute('embedded', '');
    document.body.appendChild(el);
    await flushMicrotasks();

    const updateSpy = vi.spyOn(el, 'updateList');
    el.layers = [makeLayer('a', { styles: { stroke: 'var(--accent, #f00)', fill: 'none' } })];
    el.cssProperties = [];
    el.gradients = [];
    expect(updateSpy).not.toHaveBeenCalled();

    await flushMicrotasks();
    expect(updateSpy).toHaveBeenCalledTimes(1);
    expect(el.shadowRoot!.querySelector('.var-name')?.textContent).toBe('--accent');
    el.remove();
  });
});

describe('inspector-panel differential setData', () => {
  interface InspectorLike extends HTMLElement {
    setData: (data: Record<string, unknown>) => void;
  }

  function freshInspector(): InspectorLike {
    const el = document.createElement('inspector-panel') as InspectorLike;
    document.body.appendChild(el);
    return el;
  }

  it('does not reassign fields whose identity is unchanged', async () => {
    const el = freshInspector();
    const lp = el.shadowRoot!.querySelector('layers-panel') as HTMLElement & { layers: LayerOutput[] };
    await flushMicrotasks();

    const layersSetter = vi.fn();
    const proto = Object.getPrototypeOf(lp);
    const original = Object.getOwnPropertyDescriptor(proto, 'layers')!;
    Object.defineProperty(lp, 'layers', {
      set(v) {
        layersSetter(v);
        original.set!.call(this, v);
      },
      configurable: true,
    });

    const layers = [makeLayer('a')];
    const visibilityA = {};
    el.setData({ layers, masks: [], clipPaths: [], gradients: [], cssProperties: [], layerVisibility: visibilityA });
    expect(layersSetter).toHaveBeenCalledTimes(1);

    // Same layers reference, new visibility → layers must NOT be reassigned
    el.setData({ layers, masks: [], clipPaths: [], gradients: [], cssProperties: [], layerVisibility: { a: false } });
    expect(layersSetter).toHaveBeenCalledTimes(1);

    // New layers reference → reassigned
    el.setData({ layers: [makeLayer('b')] });
    expect(layersSetter).toHaveBeenCalledTimes(2);
    el.remove();
  });

  it('a full setData pass triggers at most one updateList per child panel', async () => {
    const el = freshInspector();
    const lp = el.shadowRoot!.querySelector('layers-panel') as HTMLElement & { updateList: () => void };
    await flushMicrotasks();

    const updateSpy = vi.spyOn(lp, 'updateList');
    el.setData({
      layers: [makeLayer('a')],
      masks: [{ id: 'm1' }],
      clipPaths: [],
      gradients: [],
      cssProperties: [],
      layerVisibility: {},
      defsVisibility: {},
    });
    await flushMicrotasks();
    expect(updateSpy).toHaveBeenCalledTimes(1);
    el.remove();
  });
});
