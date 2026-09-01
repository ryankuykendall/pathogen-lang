// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from 'vitest';

// Regression tests for the 20k-layer inspector work
// (project-docs/inspector-virtualization/): windowed rendering in the
// layers/palette panels, the closed-inspector setData gate, O(1) visibility
// diff-patching, group-children defs rows, and the pruneVisibility identity
// contract. Complements playground-inspector-coalescing.test.ts (which
// guards the earlier coalescing/differential fixes) and
// playground-virtual-list.test.ts (pure window math).

import { collectLayerNames, pruneVisibility } from '../playground/utils/layer-visibility.js';

import type { LayerOutput } from '../playground/types/compiler.js';

function makeLayer(name: string, overrides: Partial<LayerOutput> = {}): LayerOutput {
  return {
    name,
    type: 'path',
    data: 'M 0 0 L 10 10',
    styles: { stroke: '#123456', fill: '#654321' },
    isDefault: false,
    ...overrides,
  } as LayerOutput;
}

function manyLayers(n: number): LayerOutput[] {
  const layers: LayerOutput[] = [];
  for (let i = 0; i < n; i++) layers.push(makeLayer(`l${i}`));
  return layers;
}

/** Two microtask hops — enough to drain a schedule-inside-microtask chain. */
async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

interface LayersPanelLike extends HTMLElement {
  layers: LayerOutput[];
  masks: { id: string }[];
  clipPaths: { id: string }[];
  gradients: unknown[];
  layerVisibility: Record<string, boolean>;
  defsVisibility: Record<string, boolean>;
  updateList: () => void;
  refreshVirtual: () => void;
}

function mountLayersPanel(): LayersPanelLike {
  const el = document.createElement('layers-panel') as LayersPanelLike;
  el.setAttribute('embedded', '');
  document.body.appendChild(el);
  return el;
}

beforeAll(async () => {
  await import('../playground/components/inspector-panel.ts');
});

describe('layers-panel windowed rendering', () => {
  it('renders only a bounded window of a large list, inside a full-height sizer', async () => {
    const el = mountLayersPanel();
    el.layers = manyLayers(1000);
    await flushMicrotasks();

    // jsdom has zero layout, so the window uses the 600px viewport fallback
    // plus 400px overscan: rows covering [0, 1000px) at 28px/row = 36 rows.
    const rows = el.shadowRoot!.querySelectorAll('.layer-row');
    expect(rows.length).toBe(36);
    const sizer = el.shadowRoot!.querySelector('.vl-sizer') as HTMLElement;
    expect(sizer.style.height).toBe(`${1000 * 28}px`);
    // The badge still reflects the full model, not the window.
    expect(el.shadowRoot!.querySelector('.badge')?.textContent).toBe('1000');
    el.remove();
  });

  it('re-windows to a different slice when the scroller moves', async () => {
    const el = mountLayersPanel();
    el.layers = manyLayers(1000);
    await flushMicrotasks();

    const list = el.shadowRoot!.querySelector('.layer-list') as HTMLElement;
    list.scrollTop = 5000;
    el.refreshVirtual();

    const rows = Array.from(el.shadowRoot!.querySelectorAll('.layer-row'));
    // Window [4600, 6000): row 164 spans [4592, 4620).
    expect((rows[0] as HTMLElement).dataset.layerName).toBe('l164');
    const slice = el.shadowRoot!.querySelector('.vl-slice') as HTMLElement;
    expect(slice.style.transform).toBe(`translateY(${164 * 28}px)`);
    el.remove();
  });

  it('delegated eye click works on a windowed mid-list row', async () => {
    const el = mountLayersPanel();
    el.layers = manyLayers(1000);
    await flushMicrotasks();

    const list = el.shadowRoot!.querySelector('.layer-list') as HTMLElement;
    list.scrollTop = 5000;
    el.refreshVirtual();

    const events: { name: string; visible: boolean }[] = [];
    el.addEventListener('layer-visibility-change', (e) => {
      // eslint-disable-next-line n/no-unsupported-features/node-builtins -- jsdom environment, not Node
      events.push((e as CustomEvent<{ name: string; visible: boolean }>).detail);
    });
    const firstRow = el.shadowRoot!.querySelector('.layer-row') as HTMLElement;
    (firstRow.querySelector('.eye-btn') as HTMLButtonElement).dispatchEvent(
      new MouseEvent('click', { bubbles: true, composed: true }),
    );
    expect(events).toEqual([{ name: 'l164', visible: false }]);
    el.remove();
  });

  it('collapsed groups are excluded from rows but included in the badge', async () => {
    const el = mountLayersPanel();
    el.layers = [makeLayer('grp', { type: 'group', children: [makeLayer('c1'), makeLayer('c2')] })];
    await flushMicrotasks();
    expect(el.shadowRoot!.querySelectorAll('.layer-row').length).toBe(3);
    expect(el.shadowRoot!.querySelector('.badge')?.textContent).toBe('3');

    const groupRow = el.shadowRoot!.querySelector('.layer-row[data-group="1"]') as HTMLElement;
    (groupRow.querySelector('.layer-name') as HTMLElement).dispatchEvent(
      new MouseEvent('click', { bubbles: true, composed: true }),
    );
    expect(el.shadowRoot!.querySelectorAll('.layer-row').length).toBe(1);
    expect(el.shadowRoot!.querySelector('.badge')?.textContent).toBe('3');
    el.remove();
  });

  it('group children with mask/clip refs get defs rows', async () => {
    const el = mountLayersPanel();
    el.layers = [
      makeLayer('grp', {
        type: 'group',
        children: [makeLayer('masked-child', { styles: { stroke: '#000', mask: 'url(#m1)' } })],
      }),
    ];
    el.masks = [{ id: 'm1' }];
    await flushMicrotasks();

    const defsRow = el.shadowRoot!.querySelector('.layer-row.defs-row') as HTMLElement;
    expect(defsRow).not.toBeNull();
    expect(defsRow.dataset.defKey).toBe('mask:m1');
    el.remove();
  });
});

describe('layers-panel visibility diff-patching', () => {
  it('a visibility-only change patches the eye in place without a rebuild', async () => {
    const el = mountLayersPanel();
    el.layers = [makeLayer('a'), makeLayer('b')];
    el.layerVisibility = {};
    await flushMicrotasks();

    const updateSpy = vi.spyOn(el, 'updateList');
    el.layerVisibility = { a: false };
    expect(updateSpy).not.toHaveBeenCalled();
    await flushMicrotasks();
    expect(updateSpy).not.toHaveBeenCalled();

    const rowA = el.shadowRoot!.querySelector('.layer-row[data-layer-name="a"]') as HTMLElement;
    const eyeA = rowA.querySelector('.eye-btn') as HTMLElement;
    expect(eyeA.getAttribute('title')).toBe('Show layer');
    expect(eyeA.getAttribute('aria-label')).toBe('Show a');
    const rowB = el.shadowRoot!.querySelector('.layer-row[data-layer-name="b"]') as HTMLElement;
    expect(rowB.querySelector('.eye-btn')!.getAttribute('title')).toBe('Hide layer');
    el.remove();
  });

  it('a value-equal visibility echo (fresh object, same values) is a no-op', async () => {
    const el = mountLayersPanel();
    el.layers = [makeLayer('a')];
    el.layerVisibility = { a: false };
    await flushMicrotasks();

    const updateSpy = vi.spyOn(el, 'updateList');
    el.layerVisibility = { a: false };
    await flushMicrotasks();
    expect(updateSpy).not.toHaveBeenCalled();
    el.remove();
  });

  it('eye toggle patches synchronously instead of rebuilding the list', async () => {
    const el = mountLayersPanel();
    el.layers = [makeLayer('halo')];
    await flushMicrotasks();

    const updateSpy = vi.spyOn(el, 'updateList');
    const eye = el.shadowRoot!.querySelector('.eye-btn') as HTMLButtonElement;
    eye.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));

    expect(updateSpy).not.toHaveBeenCalled();
    expect(el.shadowRoot!.querySelector('.eye-btn')!.getAttribute('title')).toBe('Show layer');
    el.remove();
  });

  it('a defsVisibility-only change patches the def-row eye in place without a rebuild', async () => {
    const el = mountLayersPanel();
    el.layers = [makeLayer('masked', { styles: { stroke: '#000', mask: 'url(#m1)' } })];
    el.masks = [{ id: 'm1' }];
    el.defsVisibility = {};
    await flushMicrotasks();

    const updateSpy = vi.spyOn(el, 'updateList');
    el.defsVisibility = { 'mask:m1': false };
    await flushMicrotasks();
    expect(updateSpy).not.toHaveBeenCalled();

    const defsRow = el.shadowRoot!.querySelector('.layer-row.defs-row') as HTMLElement;
    const eye = defsRow.querySelector('.eye-btn') as HTMLElement;
    expect(eye.getAttribute('title')).toBe('Enable mask');
    expect(eye.getAttribute('aria-label')).toBe('Enable mask m1');
    el.remove();
  });

  it('patches rows whose names need CSS escaping', async () => {
    const hostile = 'we"ird\\name';
    const el = mountLayersPanel();
    el.layers = [makeLayer(hostile)];
    el.layerVisibility = {};
    await flushMicrotasks();

    el.layerVisibility = { [hostile]: false };
    const eye = el.shadowRoot!.querySelector('.eye-btn') as HTMLElement;
    expect(eye.getAttribute('title')).toBe('Show layer');
    el.remove();
  });
});

describe('palette-panel windowed rendering', () => {
  it('renders only a bounded window of headers and color rows', async () => {
    const el = document.createElement('palette-panel') as HTMLElement & {
      layers: LayerOutput[];
      gradients: unknown[];
    };
    el.setAttribute('embedded', '');
    document.body.appendChild(el);
    el.layers = manyLayers(1000); // stroke + fill → header + 2 color rows per layer
    el.gradients = [];
    await flushMicrotasks();

    const sizer = el.shadowRoot!.querySelector('.vl-sizer') as HTMLElement;
    expect(sizer.style.height).toBe(`${1000 * 24 + 2000 * 26}px`);
    const headers = el.shadowRoot!.querySelectorAll('.group-header').length;
    const colorRows = el.shadowRoot!.querySelectorAll('.color-row').length;
    expect(headers + colorRows).toBeLessThan(60);
    expect(headers + colorRows).toBeGreaterThan(10);
    // Badge counts all color rows, not the window.
    expect(el.shadowRoot!.querySelector('.badge')?.textContent).toBe('2000');
    el.remove();
  });
});

describe('inspector-panel open gate', () => {
  interface InspectorLike extends HTMLElement {
    setData: (data: Record<string, unknown>) => void;
    open: boolean;
  }

  function mountInspector(): InspectorLike {
    const el = document.createElement('inspector-panel') as InspectorLike;
    document.body.appendChild(el);
    return el;
  }

  it('defers setData while closed and forwards the latest data on open', async () => {
    const el = mountInspector();
    const lp = el.shadowRoot!.querySelector('layers-panel') as LayersPanelLike;
    await flushMicrotasks();

    el.open = false;
    const updateSpy = vi.spyOn(lp, 'updateList');
    el.setData({ layers: [makeLayer('stale')], masks: [], clipPaths: [], gradients: [], cssProperties: [] });
    el.setData({ layers: [makeLayer('fresh')] });
    await flushMicrotasks();
    expect(updateSpy).not.toHaveBeenCalled();
    expect(lp.shadowRoot!.querySelectorAll('.layer-row').length).toBe(0);

    el.open = true;
    await flushMicrotasks();
    expect(updateSpy).toHaveBeenCalledTimes(1);
    const rows = Array.from(lp.shadowRoot!.querySelectorAll('.layer-row'));
    expect(rows.map((r) => (r as HTMLElement).dataset.layerName)).toEqual(['fresh']);
    el.remove();
  });

  it('keeps the differential cache honest across a close/open cycle', async () => {
    const el = mountInspector();
    const lp = el.shadowRoot!.querySelector('layers-panel') as LayersPanelLike;
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
    el.setData({ layers });
    expect(layersSetter).toHaveBeenCalledTimes(1);

    // Closed: a new reference arrives but must not reach the children yet.
    el.open = false;
    const layersB = [makeLayer('b')];
    el.setData({ layers: layersB });
    expect(layersSetter).toHaveBeenCalledTimes(1);

    // Open forwards it (identity differs from what the children hold).
    el.open = true;
    expect(layersSetter).toHaveBeenCalledTimes(2);
    expect(layersSetter).toHaveBeenLastCalledWith(layersB);

    // Same reference again → differential cache suppresses the assignment.
    el.setData({ layers: layersB });
    expect(layersSetter).toHaveBeenCalledTimes(2);
    el.remove();
  });

  it('re-windows the sibling panels when a section or group collapse changes heights', async () => {
    const el = mountInspector();
    const lp = el.shadowRoot!.querySelector('layers-panel') as LayersPanelLike & { toggleCollapse: () => void };
    const pp = el.shadowRoot!.querySelector('palette-panel') as HTMLElement & { refreshVirtual: () => void };
    await flushMicrotasks();
    el.setData({
      layers: [makeLayer('grp', { type: 'group', children: [makeLayer('c1')] })],
      gradients: [],
    });
    await flushMicrotasks();

    // Collapsing the layers section shifts the palette's offset within the
    // shared scroller — the inspector must re-window the sibling.
    const paletteRefresh = vi.spyOn(pp, 'refreshVirtual');
    lp.toggleCollapse();
    expect(paletteRefresh).toHaveBeenCalled();

    // Group expand/collapse changes the layers sizer height the same way.
    lp.toggleCollapse(); // expand the section again first
    paletteRefresh.mockClear();
    const groupRow = lp.shadowRoot!.querySelector('.layer-row[data-group="1"]') as HTMLElement;
    (groupRow.querySelector('.layer-name') as HTMLElement).dispatchEvent(
      new MouseEvent('click', { bubbles: true, composed: true }),
    );
    expect(paletteRefresh).toHaveBeenCalled();
    el.remove();
  });

  it('re-opening with no pending data does not disturb the children', async () => {
    const el = mountInspector();
    const lp = el.shadowRoot!.querySelector('layers-panel') as LayersPanelLike;
    await flushMicrotasks();
    el.setData({ layers: [makeLayer('a')] });
    await flushMicrotasks();

    const updateSpy = vi.spyOn(lp, 'updateList');
    el.open = false;
    el.open = true;
    await flushMicrotasks();
    expect(updateSpy).not.toHaveBeenCalled();
    el.remove();
  });
});

describe('pruneVisibility / collectLayerNames', () => {
  it('returns the same reference when nothing is stale', () => {
    const current = { a: false, c1: true };
    const names = collectLayerNames([makeLayer('a'), makeLayer('grp', { type: 'group', children: [makeLayer('c1')] })]);
    expect(pruneVisibility(current, names)).toBe(current);
  });

  it('collects group-children names so their entries survive a recompile', () => {
    const names = collectLayerNames([makeLayer('grp', { type: 'group', children: [makeLayer('c1')] })]);
    expect(names.has('grp')).toBe(true);
    expect(names.has('c1')).toBe(true);
  });

  it('drops entries for layers that no longer exist', () => {
    const current = { a: false, gone: false };
    const pruned = pruneVisibility(current, new Set(['a']));
    expect(pruned).not.toBe(current);
    expect(pruned).toEqual({ a: false });
  });
});
