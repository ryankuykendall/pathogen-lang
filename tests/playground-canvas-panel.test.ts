// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest';

// Step 3b of phase 2d (project-docs/modules/52-phase-2d-plan.md): the footer
// is gone. Background, Grid and Precision live in the inspector's Canvas
// section, which takes its values as a property and reports each change as a
// `canvas-change` event; workspace-view owns the store and the saving.

import type { CanvasSettings } from '../playground/components/canvas-panel.ts';

type CanvasPanelEl = HTMLElement & { settings: CanvasSettings };
type InspectorEl = HTMLElement & { canvasSettings: CanvasSettings };

const SETTINGS: CanvasSettings = {
  background: '#f5f5f5',
  gridEnabled: true,
  gridColor: '#cccccc',
  gridSize: 20,
  toFixed: null,
};

beforeAll(async () => {
  await import('../playground/components/inspector-panel.ts');
  await import('../playground/components/svg-preview-pane.ts');
});

function mountPanel(settings: CanvasSettings = SETTINGS): CanvasPanelEl {
  const el = document.createElement('canvas-panel') as CanvasPanelEl;
  el.setAttribute('embedded', '');
  document.body.appendChild(el);
  el.settings = settings;
  return el;
}

function q<T extends Element>(el: HTMLElement, selector: string): T {
  const found = el.shadowRoot!.querySelector(selector);
  if (!found) throw new Error(`no ${selector}`);
  return found as T;
}

interface Change {
  setting: string;
  value: unknown;
}

/** Collect the canvas-change details the panel dispatches, as seen from the document. */
function changes(): Change[] {
  const seen: Change[] = [];
  document.addEventListener('canvas-change', (e) => {
    seen.push((e as Event & { detail: Change }).detail);
  });
  return seen;
}

/** The colour picker's event, as pathogen-color-input dispatches it. */
function colorChange(value: string): Event {
  return new window.CustomEvent('color-change', { bubbles: true, composed: true, detail: { value } });
}

describe('the Canvas section', () => {
  it('shows the settings it is given', () => {
    const el = mountPanel({ ...SETTINGS, background: '#123456', gridEnabled: false, gridSize: 50, toFixed: 2 });
    expect(q<HTMLElement>(el, '#bg').getAttribute('value')).toBe('#123456');
    expect(q<HTMLElement>(el, '.bg-value').textContent).toBe('#123456');
    expect(q<HTMLInputElement>(el, '#grid-enabled').checked).toBe(false);
    expect(q<HTMLElement>(el, '#grid-color').getAttribute('value')).toBe('#cccccc');
    expect(q<HTMLSelectElement>(el, '#grid-size').value).toBe('50');
    expect(q<HTMLSelectElement>(el, '#to-fixed').value).toBe('2');
  });

  it('shows Off for precision when toFixed is null', () => {
    const el = mountPanel();
    expect(q<HTMLSelectElement>(el, '#to-fixed').value).toBe('');
    expect(q<HTMLSelectElement>(el, '#to-fixed').selectedOptions[0].textContent).toBe('Off');
  });

  it('updates its controls in place, so an open colour picker is not replaced', () => {
    const el = mountPanel();
    const bg = q<HTMLElement>(el, '#bg');
    el.settings = { ...SETTINGS, background: '#000000', gridSize: 100 };
    expect(q<HTMLElement>(el, '#bg')).toBe(bg);
    expect(bg.getAttribute('value')).toBe('#000000');
    expect(q<HTMLElement>(el, '.bg-value').textContent).toBe('#000000');
    expect(q<HTMLSelectElement>(el, '#grid-size').value).toBe('100');
  });

  it('a grid size that is not in the list still shows', () => {
    const el = mountPanel({ ...SETTINGS, gridSize: 15 });
    expect(q<HTMLSelectElement>(el, '#grid-size').value).toBe('15');
    expect(q<HTMLSelectElement>(el, '#grid-size').selectedOptions[0].textContent).toBe('15px');
  });

  it('reports each change as a canvas-change event and changes nothing itself', () => {
    const el = mountPanel();
    const seen = changes();

    q<HTMLElement>(el, '#bg').dispatchEvent(colorChange('#ff0000'));
    const grid = q<HTMLInputElement>(el, '#grid-enabled');
    grid.checked = false;
    grid.dispatchEvent(new Event('change', { bubbles: true }));
    q<HTMLElement>(el, '#grid-color').dispatchEvent(colorChange('#00ff00'));
    const size = q<HTMLSelectElement>(el, '#grid-size');
    size.value = '50';
    size.dispatchEvent(new Event('change', { bubbles: true }));
    const precision = q<HTMLSelectElement>(el, '#to-fixed');
    precision.value = '3';
    precision.dispatchEvent(new Event('change', { bubbles: true }));
    precision.value = '';
    precision.dispatchEvent(new Event('change', { bubbles: true }));

    expect(seen).toEqual([
      { setting: 'background', value: '#ff0000' },
      { setting: 'gridEnabled', value: false },
      { setting: 'gridColor', value: '#00ff00' },
      { setting: 'gridSize', value: 50 },
      { setting: 'toFixed', value: 3 },
      { setting: 'toFixed', value: null },
    ]);
    // The panel only reports: what it shows comes from its owner.
    expect(el.settings).toEqual(SETTINGS);
    expect(q<HTMLElement>(el, '.bg-value').textContent).toBe('#f5f5f5');
  });

  it('collapses and expands from its header, telling the inspector its height changed', () => {
    const el = mountPanel();
    let resized = 0;
    el.addEventListener('inspector-section-resize', () => resized++);
    const header = q<HTMLButtonElement>(el, '.panel-header');
    const body = q<HTMLElement>(el, '.canvas-body');
    expect(header.getAttribute('aria-expanded')).toBe('true');

    header.click();
    expect(header.getAttribute('aria-expanded')).toBe('false');
    expect(body.hidden).toBe(true);
    header.click();
    expect(header.getAttribute('aria-expanded')).toBe('true');
    expect(body.hidden).toBe(false);
    expect(resized).toBe(2);
  });

  it('labels every control', () => {
    const el = mountPanel();
    expect(q<HTMLElement>(el, '#bg').getAttribute('aria-label')).toBe('Background color');
    expect(q<HTMLInputElement>(el, '#grid-enabled').getAttribute('aria-label')).toBe('Show grid');
    expect(q<HTMLElement>(el, '#grid-color').getAttribute('aria-label')).toBe('Grid color');
    expect(q<HTMLSelectElement>(el, '#grid-size').getAttribute('aria-label')).toBe('Grid size');
    expect(q<HTMLLabelElement>(el, 'label[for="to-fixed"]').textContent).toBe('Precision');
  });
});

describe('the inspector', () => {
  it('has a Canvas section above Layers when asked for one', () => {
    const el = document.createElement('inspector-panel') as InspectorEl;
    el.setAttribute('canvas', '');
    document.body.appendChild(el);
    const sections = Array.from(el.shadowRoot!.querySelector('.inspector')!.children).map((c) =>
      c.tagName.toLowerCase(),
    );
    expect(sections).toEqual(['div', 'canvas-panel', 'layers-panel', 'palette-panel', 'cssvar-panel']);

    el.canvasSettings = { ...SETTINGS, gridSize: 25 };
    const panel = el.shadowRoot!.querySelector('canvas-panel') as CanvasPanelEl;
    expect(panel.settings.gridSize).toBe(25);
    expect(q<HTMLSelectElement>(panel, '#grid-size').value).toBe('25');
  });

  it('keeps settings given before it rendered', () => {
    const el = document.createElement('inspector-panel') as InspectorEl;
    el.setAttribute('canvas', '');
    el.canvasSettings = { ...SETTINGS, toFixed: 1 };
    document.body.appendChild(el);
    const panel = el.shadowRoot!.querySelector('canvas-panel') as CanvasPanelEl;
    expect(q<HTMLSelectElement>(panel, '#to-fixed').value).toBe('1');
  });

  it('has no Canvas section otherwise (the mini-workspace and the detail page)', () => {
    const el = document.createElement('inspector-panel') as InspectorEl;
    document.body.appendChild(el);
    expect(el.shadowRoot!.querySelector('canvas-panel')).toBeNull();
    el.canvasSettings = SETTINGS; // harmless
    expect(el.shadowRoot!.querySelector('layers-panel')).not.toBeNull();
  });
});

describe('the preview without a card or minimap', () => {
  it('has no minimap, and the fullscreen button takes the top-left corner', async () => {
    const el = document.createElement('svg-preview-pane');
    document.body.appendChild(el);
    const root = el.shadowRoot!;
    expect(root.querySelector('#zoom-navigator')).toBeNull();
    expect(root.querySelector('#navigator-svg')).toBeNull();
    expect(root.querySelector('#fullscreen-toggle')).not.toBeNull();
    const css = root.querySelector('style')!.textContent;
    const toggleRule = /#fullscreen-toggle \{[^}]*\}/.exec(css)![0];
    expect(toggleRule).toContain('top: 1rem;');
    expect(toggleRule).toContain('left: 1rem;');
  });

  it('draws no card: no rounded corners or shadow around the preview', () => {
    const el = document.createElement('svg-preview-pane');
    document.body.appendChild(el);
    const css = el.shadowRoot!.querySelector('style')!.textContent;
    const container = /#preview-container \{[^}]*\}/.exec(css)![0];
    expect(container).not.toContain('border-radius');
    expect(container).not.toContain('box-shadow');
    const host = /:host \{[^}]*\}/.exec(css)![0];
    expect(host).toContain('padding: 0;');
  });
});

describe('fullscreenStyles', () => {
  it('puts the button in the corner when there is no minimap, and beside the minimap otherwise', async () => {
    const { fullscreenStyles } = await import('../playground/utils/fullscreen-toggle.ts');
    const rule = (css: string): string => /#fullscreen-toggle \{[^}]*\}/.exec(css)![0];
    expect(rule(fullscreenStyles(0, 1))).toContain('left: 1rem;');
    // The blog's mini-preview keeps its minimap and its button position.
    expect(rule(fullscreenStyles(100, 0.5))).toContain('left: calc(0.5rem + 100px + 0.5rem);');
    expect(rule(fullscreenStyles(100, 0.5))).toContain('top: 0.5rem;');
  });
});

describe('the fit margin', () => {
  it('pads the canvas by a share of its longer side, on every side', async () => {
    const { withFitMargin, FIT_MARGIN } = await import('../playground/utils/preview-fit.ts');
    expect(FIT_MARGIN).toBe(0.06);
    // 200 × 200: 6% of 200 is 12.
    expect(withFitMargin({ originX: 0, originY: 0, width: 200, height: 200 })).toEqual({
      originX: -12,
      originY: -12,
      width: 224,
      height: 224,
    });
    // 500 × 300 at (10, 20): 6% of 500 is 30, the same on both axes.
    expect(withFitMargin({ originX: 10, originY: 20, width: 500, height: 300 })).toEqual({
      originX: -20,
      originY: -10,
      width: 560,
      height: 360,
    });
  });
});

describe('Copy SVG', () => {
  it('frames the copy on the drawing, not the fit margin or the current zoom', async () => {
    const { drawingSvgMarkup } = await import('../playground/utils/preview-fit.ts');
    const SVG_NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(SVG_NS, 'svg');
    // The live preview at Fit: the program's 500 × 300 box at (10, 20) plus the margin.
    svg.setAttribute('viewBox', '-20 -10 560 360');
    svg.setAttribute('width', '500');
    svg.setAttribute('height', '300');
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', 'M 10 20 L 510 320');
    svg.appendChild(path);

    const markup = drawingSvgMarkup(svg, { originX: 10, originY: 20, width: 500, height: 300 });

    const copied = new window.DOMParser().parseFromString(markup, 'image/svg+xml').documentElement;
    expect(copied.getAttribute('viewBox')).toBe('10 20 500 300');
    expect(copied.getAttribute('width')).toBe('500');
    expect(copied.getAttribute('height')).toBe('300');
    expect(copied.querySelector('path')?.getAttribute('d')).toBe('M 10 20 L 510 320');
    // The live preview keeps its view.
    expect(svg.getAttribute('viewBox')).toBe('-20 -10 560 360');
  });
});
