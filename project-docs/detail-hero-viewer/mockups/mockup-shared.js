// Shared interactive wiring for the detail-hero-viewer mock-ups.
//
// Loads the pre-compiled artwork SVG, mounts the shared PanZoomController
// (window.PathogenPanZoom, loaded as a classic script by each page), builds
// the layer model from [data-layer-name] attributes, and wires the zoom
// pill, fullscreen, and wheel hint. Production note: the real detail page
// must render the SVG through the sandboxed preview iframe
// (playground/utils/preview-iframe.ts) — inlining into the page document
// is a mock-up-only shortcut, acceptable because we compiled this artwork
// ourselves.

const ARTWORK_URL = '../assets/artwork.svg';
const SOURCE_URL = '../assets/experiments-in-random-variable-offsets.pathogen';

/** Fetch + parse the artwork, strip scripts, mount into the viewport. */
export async function loadArtwork(viewport) {
  const res = await fetch(ARTWORK_URL);
  if (!res.ok) throw new Error(`Artwork fetch failed (${res.status})`);
  const text = await res.text();
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  const parsed = doc.documentElement;
  if (parsed.nodeName !== 'svg') throw new Error('Artwork is not an SVG document');

  // Read the optional pathogen-metadata block BEFORE stripping scripts.
  let meta = null;
  const metaEl = parsed.querySelector('script#pathogen-metadata');
  if (metaEl) {
    try {
      meta = JSON.parse(metaEl.textContent || 'null');
    } catch {
      meta = null;
    }
  }
  parsed.querySelectorAll('script').forEach((s) => s.remove());

  const svg = document.importNode(parsed, true);
  viewport.prepend(svg);
  return { svg, meta };
}

/** Fill a <pre> with the real source (keeps the page free of escaping). */
export async function populateSource(preEl, metaEl) {
  try {
    const res = await fetch(SOURCE_URL);
    const text = await res.text();
    preEl.textContent = text;
    if (metaEl) {
      const lines = text.trimEnd().split('\n').length;
      metaEl.textContent = `Pathogen · ${lines} lines`;
    }
  } catch {
    preEl.textContent = '// source unavailable (is npm run serve:bbwp running?)';
  }
}

/**
 * Group artwork elements by data-layer-name (document order == paint order).
 * Returns [{ name, els, color, visible }].
 */
export function buildLayerModel(svg) {
  const groups = new Map();
  svg.querySelectorAll('[data-layer-name]').forEach((el) => {
    const name = el.getAttribute('data-layer-name');
    if (!name) return;
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(el);
  });
  return [...groups.entries()].map(([name, els]) => ({
    name,
    els,
    color: swatchColor(els[0]),
    visible: true,
  }));
}

function swatchColor(el) {
  const fill = el.getAttribute('fill');
  if (fill && fill !== 'none' && !fill.startsWith('url(')) return fill;
  const stroke = el.getAttribute('stroke');
  if (stroke && stroke !== 'none' && !stroke.startsWith('url(')) return stroke;
  return null;
}

function setLayerVisible(layer, visible) {
  layer.visible = visible;
  layer.els.forEach((el) => {
    el.style.display = visible ? '' : 'none';
  });
}

const EYE_ON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_OFF =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';

/**
 * Render the shared layer-list UI (head + filter/bulk tools + scrollable
 * rows) into `container`. Real artworks can carry hundreds of generated
 * layers (this one has ~485), so the list ships with a filter and bulk
 * show/hide — a bare checkbox column does not scale.
 *
 * opts.solo: alt-click a row isolates that layer (alt-click again restores).
 */
export function renderLayerList(container, model, opts = {}) {
  container.classList.add('layer-list');
  container.innerHTML = `
    <div class="layer-list-head">
      <span class="layer-list-title">Layers</span>
      <span class="layer-list-count">${model.length}</span>
    </div>
    <div class="layer-list-tools">
      <input class="layer-filter" type="text" placeholder="Filter…" aria-label="Filter layers">
      <button class="layer-bulk" data-bulk="show">All</button>
      <button class="layer-bulk" data-bulk="hide">None</button>
    </div>
    <ul class="layer-rows"></ul>`;

  const rowsEl = container.querySelector('.layer-rows');
  const rows = model.map((layer) => {
    const li = document.createElement('li');
    li.className = 'layer-row';
    const swatch = document.createElement('span');
    swatch.className = 'layer-swatch';
    if (layer.color) swatch.style.background = layer.color;
    const name = document.createElement('span');
    name.className = 'layer-name';
    name.textContent = layer.name;
    const eye = document.createElement('button');
    eye.className = 'layer-eye';
    eye.title = `Toggle ${layer.name}`;
    eye.setAttribute('aria-pressed', 'true');
    eye.innerHTML = EYE_ON;
    li.append(swatch, name, eye);
    rowsEl.appendChild(li);
    return { layer, li, eye };
  });

  const sync = () => {
    rows.forEach(({ layer, li, eye }) => {
      li.classList.toggle('is-hidden', !layer.visible);
      eye.setAttribute('aria-pressed', String(layer.visible));
      eye.innerHTML = layer.visible ? EYE_ON : EYE_OFF;
    });
    if (opts.onChange) opts.onChange();
  };

  let soloed = null;
  rows.forEach(({ layer, li, eye }) => {
    eye.addEventListener('click', () => {
      soloed = null;
      setLayerVisible(layer, !layer.visible);
      sync();
    });
    if (opts.solo) {
      li.addEventListener('click', (e) => {
        if (!e.altKey) return;
        e.preventDefault();
        if (soloed === layer) {
          model.forEach((l) => setLayerVisible(l, true));
          soloed = null;
        } else {
          model.forEach((l) => setLayerVisible(l, l === layer));
          soloed = layer;
        }
        sync();
      });
    }
  });

  container.querySelectorAll('.layer-bulk').forEach((btn) => {
    btn.addEventListener('click', () => {
      const show = btn.dataset.bulk === 'show';
      soloed = null;
      model.forEach((l) => setLayerVisible(l, show));
      sync();
    });
  });

  const filter = container.querySelector('.layer-filter');
  filter.addEventListener('input', () => {
    const q = filter.value.trim().toLowerCase();
    rows.forEach(({ layer, li }) => {
      li.hidden = q !== '' && !layer.name.toLowerCase().includes(q);
    });
  });

  return { sync };
}

/**
 * Mount the shared PanZoomController + zoom pill + fullscreen on a viewer.
 *
 * config: { stage, viewport, svg, pill, fullscreenBtn?, fitBtn?, hintEl? }
 * Returns the controller.
 */
export function initHeroViewer({ stage, viewport, svg, pill, fullscreenBtn, fitBtn, hintEl }) {
  const { PanZoomController } = window.PathogenPanZoom;

  // Parse ALL FOUR viewBox numbers — a nonzero origin must reach the
  // controller or zoom-to-fit and pan clamping land offset (the known
  // mini-preview gap this mock-up deliberately does not copy).
  const vb = (svg.getAttribute('viewBox') || '0 0 200 200').trim().split(/[\s,]+/).map(Number);
  const canvas = { originX: vb[0], originY: vb[1], width: vb[2], height: vb[3] };

  const ctrl = new PanZoomController({
    svg,
    eventTarget: viewport,
    mode: 'transform',
    canvas,
    onChange: (view) => {
      pill.zoom = view.zoom;
    },
    // Presses on chrome (pill, buttons, panels) never start a pan.
    shouldStartPan: (e) => !(e.target instanceof Element && e.target.closest('[data-chrome]')),
    options: { requireModifierForWheel: true },
  });

  pill.controller = ctrl;
  pill.fadeTarget = viewport;

  // Fit once layout has settled (fonts/stylesheets can shift the box).
  requestAnimationFrame(() => requestAnimationFrame(() => ctrl.zoomToFit()));

  // Naked wheel (no Ctrl/Cmd) → show the modifier hint briefly.
  if (hintEl) {
    let hintTimer = null;
    viewport.addEventListener(
      'wheel',
      (e) => {
        if (e.ctrlKey || e.metaKey) return;
        hintEl.classList.add('visible');
        clearTimeout(hintTimer);
        hintTimer = setTimeout(() => hintEl.classList.remove('visible'), 900);
      },
      { passive: true },
    );
  }

  // Double-click (on artwork, not chrome) steps the zoom in.
  viewport.addEventListener('dblclick', (e) => {
    if (e.target instanceof Element && e.target.closest('[data-chrome]')) return;
    ctrl.zoomTo(ctrl.getView().zoom * 1.5);
    pill.zoom = ctrl.getView().zoom;
  });

  if (fitBtn) {
    fitBtn.addEventListener('click', () => {
      ctrl.zoomToFit();
      pill.zoom = 1;
    });
  }

  if (fullscreenBtn) {
    fullscreenBtn.addEventListener('click', () => {
      if (document.fullscreenElement) document.exitFullscreen();
      else stage.requestFullscreen?.();
    });
    document.addEventListener('fullscreenchange', () => {
      const on = document.fullscreenElement === stage;
      stage.toggleAttribute('data-fullscreen', on);
      pill.toggleAttribute('always-visible', on);
      requestAnimationFrame(() => ctrl.zoomToFit());
    });
  }

  return ctrl;
}
