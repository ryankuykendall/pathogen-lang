// SVG Preview pane with zoom/pan controls and navigator

import { store } from '../state/store.js';

const DEFAULT_STROKE = '#000000';
const DEFAULT_STROKE_WIDTH = 2;

export class SvgPreviewPane extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });

    // Zoom/pan constants
    this.MIN_ZOOM = 0.25;
    this.MAX_ZOOM = 10;
    this.ZOOM_STEP = 1.5;

    // Pan state
    this.isPanning = false;
    this.panStartX = 0;
    this.panStartY = 0;

    // Navigator drag state
    this.isNavigatorDragging = false;
    this.navDragStartX = 0;
    this.navDragStartY = 0;
    this.navDragStartPanX = 0;
    this.navDragStartPanY = 0;
  }

  connectedCallback() {
    this.render();
    this.setupEventListeners();
    this.subscribeToStore();
    this.updateSvgStyles();
  }

  subscribeToStore() {
    store.subscribe(['width', 'height', 'background', 'gridEnabled', 'gridColor', 'gridSize', 'zoomLevel', 'panX', 'panY', 'pathData'], () => {
      this.updateSvgStyles();
    });
    store.subscribe('layerVisibility', () => {
      this.applyLayerVisibility();
      this.updateNavigatorContent();
    });
    store.subscribe('defsVisibility', () => {
      this.applyLayerVisibility();
    });
  }

  get preview() {
    return this.shadowRoot.querySelector('#preview');
  }

  get previewPath() {
    return this.shadowRoot.querySelector('#preview-path');
  }

  get previewContainer() {
    return this.shadowRoot.querySelector('#preview-container');
  }

  set pathData(value) {
    store.set('pathData', value || '');
    this.previewPath.setAttribute('d', value || '');
    this.updateNavigatorContent();
  }

  /**
   * Set path data and measure rendering time using forced layout calculation.
   * @param {string} value - The path data to set
   * @returns {number} The rendering time in milliseconds
   */
  setPathDataWithTiming(value) {
    store.set('pathData', value || '');

    const start = performance.now();
    this.previewPath.setAttribute('d', value || '');

    // Force synchronous layout calculation
    // getBBox() requires the browser to calculate the path geometry
    try {
      this.previewPath.getBBox();
    } catch (e) {
      // getBBox can throw if path is empty or invalid
    }

    const renderTime = performance.now() - start;

    this.updateNavigatorContent();

    return renderTime;
  }

  /**
   * Set layers and measure rendering time.
   * Renders multiple <path> elements for multi-layer output.
   * @param {Array<{name: string, type: string, data: string, styles: Record<string, string>, isDefault: boolean}>} layers
   * @returns {number} The rendering time in milliseconds
   */
  setLayersWithTiming(layers, defsData = {}) {
    const defaultData = layers[0]?.data || '';
    store.set('pathData', defaultData);

    const start = performance.now();

    // Get the layers container
    const layersGroup = this.shadowRoot.querySelector('#preview-layers');
    if (layersGroup) {
      // Clear existing layer paths
      layersGroup.innerHTML = '';

      // Clean up previous fragment defs and mask/clipPath defs
      const defsEl = this.shadowRoot.querySelector('#preview defs');
      if (defsEl) {
        for (const old of defsEl.querySelectorAll('[data-fragment-layer], [data-mask-def], [data-clippath-def], [data-gradient-def], [data-pattern-def]')) {
          old.remove();
        }
      }

      // Inject mask defs
      const SVG_NS_DEFS = 'http://www.w3.org/2000/svg';
      if (defsData.masks && defsEl) {
        for (const mask of defsData.masks) {
          const maskEl = document.createElementNS(SVG_NS_DEFS, 'mask');
          maskEl.setAttribute('id', mask.id);
          maskEl.setAttribute('data-mask-def', mask.id);
          for (const el of mask.elements) {
            const pathEl = document.createElementNS(SVG_NS_DEFS, 'path');
            pathEl.setAttribute('d', el.pathData);
            for (const [key, value] of Object.entries(el.styles)) {
              pathEl.setAttribute(key, value);
            }
            maskEl.appendChild(pathEl);
          }
          defsEl.appendChild(maskEl);
        }
      }

      // Inject clipPath defs
      if (defsData.clipPaths && defsEl) {
        for (const clip of defsData.clipPaths) {
          const clipEl = document.createElementNS(SVG_NS_DEFS, 'clipPath');
          clipEl.setAttribute('id', clip.id);
          clipEl.setAttribute('data-clippath-def', clip.id);
          for (const el of clip.elements) {
            const pathEl = document.createElementNS(SVG_NS_DEFS, 'path');
            pathEl.setAttribute('d', el.pathData);
            clipEl.appendChild(pathEl);
          }
          defsEl.appendChild(clipEl);
        }
      }

      // Inject gradient defs
      if (defsData.gradients && defsEl) {
        for (const grad of defsData.gradients) {
          if (grad.type === 'conic') {
            // Render conic gradient as <pattern> with rasterized <image>
            const patEl = document.createElementNS(SVG_NS_DEFS, 'pattern');
            patEl.setAttribute('id', grad.id);
            patEl.setAttribute('data-gradient-def', grad.id);
            patEl.setAttribute('x', '0');
            patEl.setAttribute('y', '0');
            const w = store.get('width') || 200;
            const h = store.get('height') || 200;
            patEl.setAttribute('width', String(w));
            patEl.setAttribute('height', String(h));
            patEl.setAttribute('patternUnits', 'userSpaceOnUse');

            const imgEl = document.createElementNS(SVG_NS_DEFS, 'image');
            imgEl.setAttribute('width', String(w));
            imgEl.setAttribute('height', String(h));

            // Use pre-rendered GPU texture if available (WebGPU or cached)
            const preRenderedUrl = defsData.gpuGradientUrls?.get(grad.id);
            if (preRenderedUrl) {
              imgEl.setAttribute('href', preRenderedUrl);
            } else {
              // Inline Canvas 2D fallback (safety net if GPU service hasn't initialized)
              try {
                const scale = 2;
                const canvas = document.createElement('canvas');
                canvas.width = w * scale;
                canvas.height = h * scale;
                const ctx2d = canvas.getContext('2d');
                if (ctx2d) {
                  const fromAngle = grad.from ?? 0;
                  const toAngle = grad.to ?? (fromAngle + 2 * Math.PI);
                  const cx = (grad.cx ?? 0) * scale;
                  const cy = (grad.cy ?? 0) * scale;
                  const conicGrad = ctx2d.createConicGradient(fromAngle, cx, cy);
                  const stops = grad.stopsWithOklch || grad.stops;
                  const totalAngle = toAngle - fromAngle;
                  const fullRevolution = 2 * Math.PI;
                  for (const s of stops) {
                    const scaledOffset = (s.offset * totalAngle) / fullRevolution;
                    if (scaledOffset >= 0 && scaledOffset <= 1) {
                      conicGrad.addColorStop(Math.min(1, Math.max(0, scaledOffset)), s.color);
                    }
                  }
                  ctx2d.fillStyle = conicGrad;
                  ctx2d.fillRect(0, 0, w * scale, h * scale);
                  imgEl.setAttribute('href', canvas.toDataURL('image/png'));
                }
              } catch (e) {
                console.warn('Conic gradient canvas rendering failed:', e);
              }
            }

            patEl.appendChild(imgEl);
            defsEl.appendChild(patEl);
            continue;
          }
          if (grad.type === 'mesh' || grad.type === 'freeform' || grad.type === 'topo') {
            // Render mesh/freeform gradient as <pattern> with rasterized <image>
            // Use objectBoundingBox so the image stretches to fill the element
            // (userSpaceOnUse causes tiling/wrap-around artifacts)
            const patEl = document.createElementNS(SVG_NS_DEFS, 'pattern');
            patEl.setAttribute('id', grad.id);
            patEl.setAttribute('data-gradient-def', grad.id);
            patEl.setAttribute('x', '0');
            patEl.setAttribute('y', '0');
            patEl.setAttribute('width', '1');
            patEl.setAttribute('height', '1');
            patEl.setAttribute('patternUnits', 'objectBoundingBox');
            patEl.setAttribute('patternContentUnits', 'objectBoundingBox');

            const imgEl = document.createElementNS(SVG_NS_DEFS, 'image');
            imgEl.setAttribute('width', '1');
            imgEl.setAttribute('height', '1');
            imgEl.setAttribute('preserveAspectRatio', 'none');

            // Use pre-rendered GPU texture if available
            const preRenderedUrl = defsData.gpuGradientUrls?.get(grad.id);
            if (preRenderedUrl) {
              imgEl.setAttribute('href', preRenderedUrl);
            }

            patEl.appendChild(imgEl);
            defsEl.appendChild(patEl);
            continue;
          }
          const tagName = grad.type === 'linear' ? 'linearGradient' : 'radialGradient';
          const gradEl = document.createElementNS(SVG_NS_DEFS, tagName);
          gradEl.setAttribute('id', grad.id);
          gradEl.setAttribute('data-gradient-def', grad.id);
          for (const [key, value] of Object.entries(grad.attrs)) {
            gradEl.setAttribute(key, value);
          }
          if (grad.spreadMethod) gradEl.setAttribute('spreadMethod', grad.spreadMethod);
          if (grad.gradientUnits) gradEl.setAttribute('gradientUnits', grad.gradientUnits);
          if (grad.gradientTransform) gradEl.setAttribute('gradientTransform', grad.gradientTransform);
          if (grad.colorInterpolation) gradEl.setAttribute('color-interpolation', grad.colorInterpolation);
          if (grad.href) gradEl.setAttributeNS('http://www.w3.org/1999/xlink', 'href', `#${grad.href}`);
          for (const stop of grad.stops) {
            const stopEl = document.createElementNS(SVG_NS_DEFS, 'stop');
            stopEl.setAttribute('offset', String(stop.offset));
            stopEl.setAttribute('stop-color', stop.color);
            gradEl.appendChild(stopEl);
          }
          defsEl.appendChild(gradEl);
        }
      }

      // Inject pattern defs
      if (defsData.patterns && defsEl) {
        for (const pat of defsData.patterns) {
          const patEl = document.createElementNS(SVG_NS_DEFS, 'pattern');
          patEl.setAttribute('id', pat.id);
          patEl.setAttribute('data-pattern-def', pat.id);
          patEl.setAttribute('x', String(pat.x));
          patEl.setAttribute('y', String(pat.y));
          patEl.setAttribute('width', String(pat.width));
          patEl.setAttribute('height', String(pat.height));
          if (pat.patternUnits) patEl.setAttribute('patternUnits', pat.patternUnits);
          if (pat.patternTransform) patEl.setAttribute('patternTransform', pat.patternTransform);
          if (pat.patternContentUnits) patEl.setAttribute('patternContentUnits', pat.patternContentUnits);
          for (const el of pat.elements) {
            const pathEl = document.createElementNS(SVG_NS_DEFS, 'path');
            pathEl.setAttribute('d', el.pathData);
            for (const [k, v] of Object.entries(el.styles)) pathEl.setAttribute(k, v);
            patEl.appendChild(pathEl);
          }
          defsEl.appendChild(patEl);
        }
      }

      // Inject @property CSS declarations
      const svgEl = this.shadowRoot.querySelector('#preview');
      const existingCssStyle = svgEl.querySelector('style[data-css-properties]');
      if (existingCssStyle) existingCssStyle.remove();
      if (defsData.cssProperties && defsData.cssProperties.length > 0) {
        const styleEl = document.createElementNS(SVG_NS_DEFS, 'style');
        styleEl.setAttribute('data-css-properties', '');
        const rules = defsData.cssProperties.map(prop =>
          `@property ${prop.name} {\n  syntax: "${prop.syntax}";\n  inherits: ${prop.inherits};\n  initial-value: ${prop.initialValue};\n}`
        ).join('\n');
        styleEl.textContent = rules;
        svgEl.insertBefore(styleEl, svgEl.firstChild);
      }

      const SVG_NS = 'http://www.w3.org/2000/svg';

      // Render a single layer to a DOM element, recursing for groups
      const renderLayerToDOM = (layer, parent) => {
        // Fragment layers: inject defs and append visual content
        if (layer.type === 'fragment') {
          if (layer.fragmentDefs && defsEl) {
            const defsDoc = new DOMParser().parseFromString(
              `<svg xmlns="http://www.w3.org/2000/svg"><defs>${layer.fragmentDefs}</defs></svg>`,
              'image/svg+xml'
            );
            const parsedDefs = defsDoc.querySelector('defs');
            if (parsedDefs) {
              for (const child of Array.from(parsedDefs.children)) {
                const imported = document.importNode(child, true);
                imported.setAttribute('data-fragment-layer', layer.name);
                defsEl.appendChild(imported);
              }
            }
          }
          if (layer.fragmentVisuals) {
            const visualDoc = new DOMParser().parseFromString(
              `<svg xmlns="http://www.w3.org/2000/svg">${layer.fragmentVisuals}</svg>`,
              'image/svg+xml'
            );
            const visualRoot = visualDoc.documentElement;
            const wrapper = document.createElementNS(SVG_NS, 'g');
            wrapper.dataset.layerName = layer.name;
            for (const child of Array.from(visualRoot.children)) {
              wrapper.appendChild(document.importNode(child, true));
            }
            parent.appendChild(wrapper);
          }
          return;
        }

        // Group layers: create <g> and recurse for children
        if (layer.type === 'group') {
          const g = document.createElementNS(SVG_NS, 'g');
          g.dataset.layerName = layer.name;
          for (const [key, value] of Object.entries(layer.styles)) {
            g.setAttribute(key, value);
          }
          if (layer.transform) {
            g.setAttribute('transform', layer.transform);
          }
          if (layer.children) {
            for (const child of layer.children) {
              renderLayerToDOM(child, g);
            }
          }
          parent.appendChild(g);
          return;
        }

        if (layer.type === 'text' && layer.textElements) {
          for (const te of layer.textElements) {
            const textEl = document.createElementNS(SVG_NS, 'text');
            textEl.dataset.layerName = layer.name;
            textEl.setAttribute('x', String(te.x));
            textEl.setAttribute('y', String(te.y));
            if (te.rotation != null) {
              const deg = te.rotation * 180 / Math.PI;
              textEl.setAttribute('transform', `rotate(${deg}, ${te.x}, ${te.y})`);
            }
            for (const [key, value] of Object.entries(layer.styles)) {
              textEl.setAttribute(key, value);
            }
            // Apply per-text-element styles (override layer styles)
            if (te.styles) {
              for (const [key, value] of Object.entries(te.styles)) {
                textEl.setAttribute(key, value);
              }
            }
            for (const child of te.children) {
              if (child.type === 'run') {
                textEl.appendChild(document.createTextNode(child.text));
              } else {
                const tspan = document.createElementNS(SVG_NS, 'tspan');
                tspan.textContent = child.text;
                if (child.dx != null) tspan.setAttribute('dx', String(child.dx));
                if (child.dy != null) tspan.setAttribute('dy', String(child.dy));
                if (child.rotation != null) tspan.setAttribute('rotate', String(child.rotation * 180 / Math.PI));
                // Apply per-tspan styles
                if (child.styles) {
                  for (const [key, value] of Object.entries(child.styles)) {
                    tspan.setAttribute(key, value);
                  }
                }
                textEl.appendChild(tspan);
              }
            }
            parent.appendChild(textEl);
          }
          return;
        }

        // Default: path layer
        const path = document.createElementNS(SVG_NS, 'path');
        path.dataset.layerName = layer.name;
        path.setAttribute('d', layer.data || '');
        path.setAttribute('fill', 'none');

        // Apply transform if set
        if (layer.transform) {
          path.setAttribute('transform', layer.transform);
        }

        // Apply per-layer styles, fall back to hardcoded defaults
        const hasCustomStroke = !!layer.styles['stroke'];
        const hasCustomStrokeWidth = !!layer.styles['stroke-width'];
        path.setAttribute('stroke', layer.styles['stroke'] || DEFAULT_STROKE);
        path.setAttribute('stroke-width', layer.styles['stroke-width'] || DEFAULT_STROKE_WIDTH);
        // Mark per-layer styles so updateSvgStyles() won't overwrite them
        if (hasCustomStroke) path.dataset.hasLayerStroke = 'true';
        if (hasCustomStrokeWidth) path.dataset.hasLayerStrokeWidth = 'true';
        path.setAttribute('fill', layer.styles['fill'] || 'none');
        // Apply any additional style attributes
        for (const [key, value] of Object.entries(layer.styles)) {
          if (key !== 'stroke' && key !== 'stroke-width' && key !== 'fill') {
            path.setAttribute(key, value);
          }
        }
        parent.appendChild(path);
      };

      for (const layer of layers) {
        renderLayerToDOM(layer, layersGroup);
      }

      // Hide the single preview-path when using layers group
      this.previewPath.setAttribute('d', '');
    } else {
      // Fallback: single path
      this.previewPath.setAttribute('d', defaultData);
    }

    // Force synchronous layout calculation
    try {
      const paths = layersGroup?.querySelectorAll('path') || [this.previewPath];
      for (const p of paths) {
        p.getBBox();
      }
    } catch (e) {
      // getBBox can throw if path is empty or invalid
    }

    const renderTime = performance.now() - start;

    this.applyLayerVisibility();
    this.updateNavigatorContent();

    return renderTime;
  }

  applyLayerVisibility() {
    const layersGroup = this.shadowRoot.querySelector('#preview-layers');
    if (!layersGroup) return;
    const visibility = store.get('layerVisibility');

    for (const el of layersGroup.querySelectorAll('[data-layer-name]')) {
      const name = el.dataset.layerName;
      if (name && visibility[name] === false) {
        el.style.display = 'none';
      } else {
        el.style.display = '';
      }
    }

    // Handle mask/clipPath visibility: remove/restore attributes on referencing layers
    const defsVisibility = store.get('defsVisibility') || {};
    for (const el of layersGroup.querySelectorAll('[data-layer-name]')) {
      // Check mask attribute
      const maskAttr = el.getAttribute('mask') || el.dataset.origMask;
      if (maskAttr) {
        const match = maskAttr.match(/url\(#(.+?)\)/);
        if (match) {
          const maskId = match[1];
          if (defsVisibility[`mask:${maskId}`] === false) {
            if (el.getAttribute('mask')) {
              el.dataset.origMask = el.getAttribute('mask');
              el.removeAttribute('mask');
            }
          } else if (el.dataset.origMask) {
            el.setAttribute('mask', el.dataset.origMask);
            delete el.dataset.origMask;
          }
        }
      }
      // Check clip-path attribute
      const clipAttr = el.getAttribute('clip-path') || el.dataset.origClipPath;
      if (clipAttr) {
        const match = clipAttr.match(/url\(#(.+?)\)/);
        if (match) {
          const clipId = match[1];
          if (defsVisibility[`clip-path:${clipId}`] === false) {
            if (el.getAttribute('clip-path')) {
              el.dataset.origClipPath = el.getAttribute('clip-path');
              el.removeAttribute('clip-path');
            }
          } else if (el.dataset.origClipPath) {
            el.setAttribute('clip-path', el.dataset.origClipPath);
            delete el.dataset.origClipPath;
          }
        }
      }
    }
  }

  clear() {
    this.previewPath.setAttribute('d', '');
    const layersGroup = this.shadowRoot.querySelector('#preview-layers');
    if (layersGroup) layersGroup.innerHTML = '';
    store.set('pathData', '');
    const navPaths = this.shadowRoot.querySelector('#navigator-paths');
    if (navPaths) navPaths.innerHTML = '';
    store.update({ zoomLevel: 1, panX: 0, panY: 0 });
    this.updateViewBox();
  }

  showLoading() {
    this.shadowRoot.querySelector('#loading-overlay').style.display = 'flex';
  }

  hideLoading() {
    this.shadowRoot.querySelector('#loading-overlay').style.display = 'none';
  }

  // Zoom/Pan methods
  updateViewBox() {
    const width = store.get('width');
    const height = store.get('height');
    let zoomLevel = store.get('zoomLevel');
    let panX = store.get('panX');
    let panY = store.get('panY');

    const viewWidth = width / zoomLevel;
    const viewHeight = height / zoomLevel;

    // Clamp pan values; center canvas when zoomed out below 50%
    if (zoomLevel < 0.5) {
      panX = -(viewWidth - width) / 2;
      panY = -(viewHeight - height) / 2;
    } else {
      const marginX = viewWidth / 3;
      const marginY = viewHeight / 3;
      const minPanX = Math.min(0, width - viewWidth) - marginX;
      const maxPanX = Math.max(0, width - viewWidth) + marginX;
      const minPanY = Math.min(0, height - viewHeight) - marginY;
      const maxPanY = Math.max(0, height - viewHeight) + marginY;
      panX = Math.max(minPanX, Math.min(panX, maxPanX));
      panY = Math.max(minPanY, Math.min(panY, maxPanY));
    }

    // Update store with clamped values
    store.update({ panX, panY });

    this.preview.setAttribute('viewBox', `${panX} ${panY} ${viewWidth} ${viewHeight}`);

    // Update zoom level display
    const zoomDisplay = this.shadowRoot.querySelector('#zoom-level');
    if (zoomDisplay) {
      zoomDisplay.value = `${Math.round(zoomLevel * 100)}%`;
    }

    this.updateNavigatorViewport();
    this.previewContainer.classList.toggle('can-pan', zoomLevel >= 0.5);
  }

  adjustPanForZoom(oldZoom, newZoom) {
    const width = store.get('width');
    const height = store.get('height');
    let panX = store.get('panX');
    let panY = store.get('panY');

    const oldViewWidth = width / oldZoom;
    const oldViewHeight = height / oldZoom;
    const centerX = panX + oldViewWidth / 2;
    const centerY = panY + oldViewHeight / 2;

    const newViewWidth = width / newZoom;
    const newViewHeight = height / newZoom;

    store.update({
      panX: centerX - newViewWidth / 2,
      panY: centerY - newViewHeight / 2
    });
  }

  zoomIn() {
    const oldZoom = store.get('zoomLevel');
    const newZoom = Math.min(this.MAX_ZOOM, oldZoom * this.ZOOM_STEP);
    this.adjustPanForZoom(oldZoom, newZoom);
    store.set('zoomLevel', newZoom);
    this.updateViewBox();
  }

  zoomOut() {
    const oldZoom = store.get('zoomLevel');
    const newZoom = Math.max(this.MIN_ZOOM, oldZoom / this.ZOOM_STEP);
    this.adjustPanForZoom(oldZoom, newZoom);
    store.set('zoomLevel', newZoom);
    this.updateViewBox();
  }

  zoomFit() {
    store.update({ zoomLevel: 1, panX: 0, panY: 0 });
    this.updateViewBox();
  }

  // Pan handling
  startPan(e) {
    if (store.get('zoomLevel') < 0.5) return;
    this.isPanning = true;
    this.panStartX = e.clientX;
    this.panStartY = e.clientY;
    this.previewContainer.classList.add('panning');
    e.preventDefault();
  }

  doPan(e) {
    if (!this.isPanning) return;

    const ctm = this.preview.getScreenCTM();
    if (!ctm) return;

    const dx = (this.panStartX - e.clientX) / ctm.a;
    const dy = (this.panStartY - e.clientY) / ctm.d;

    store.update({
      panX: store.get('panX') + dx,
      panY: store.get('panY') + dy
    });

    this.panStartX = e.clientX;
    this.panStartY = e.clientY;

    this.updateViewBox();
  }

  endPan() {
    this.isPanning = false;
    this.previewContainer.classList.remove('panning');
  }

  // Navigator methods
  updateNavigatorViewport() {
    const width = store.get('width');
    const height = store.get('height');
    const zoomLevel = store.get('zoomLevel');
    const panX = store.get('panX');
    const panY = store.get('panY');

    const viewWidth = width / zoomLevel;
    const viewHeight = height / zoomLevel;

    const viewport = this.shadowRoot.querySelector('#navigator-viewport');
    viewport.setAttribute('x', panX);
    viewport.setAttribute('y', panY);
    viewport.setAttribute('width', viewWidth);
    viewport.setAttribute('height', viewHeight);
  }

  updateNavigatorContent() {
    const navGroup = this.shadowRoot.querySelector('#navigator-paths');
    const navBg = this.shadowRoot.querySelector('#navigator-bg');
    const navSvg = this.shadowRoot.querySelector('#navigator-svg');
    const SVG_NS = 'http://www.w3.org/2000/svg';

    // Clear existing navigator content
    navGroup.innerHTML = '';

    // Build per-layer paths in the navigator, preserving individual styles
    // Walk all descendants (not just direct children) to find paths/text inside <g> groups
    const layersGroup = this.shadowRoot.querySelector('#preview-layers');
    const visibleElements = layersGroup
      ? Array.from(layersGroup.querySelectorAll('path, text, g')).filter(el => {
          // Skip elements whose ancestor (up to layersGroup) is hidden
          let node = el;
          while (node && node !== layersGroup) {
            if (node.style.display === 'none') return false;
            node = node.parentElement;
          }
          return true;
        })
      : [];

    // Only process leaf elements (path/text), skip <g> containers
    const leafElements = visibleElements.filter(el => el.tagName === 'path' || el.tagName === 'text');

    if (leafElements.length > 0) {
      for (const el of leafElements) {
        if (el.tagName === 'path') {
          const navPath = document.createElementNS(SVG_NS, 'path');
          navPath.setAttribute('d', el.getAttribute('d') || '');
          navPath.setAttribute('stroke', el.getAttribute('stroke') || DEFAULT_STROKE);
          navPath.setAttribute('stroke-width', Math.max(parseFloat(el.getAttribute('stroke-width')) || DEFAULT_STROKE_WIDTH, 1));
          navPath.setAttribute('fill', el.getAttribute('fill') || 'none');
          // Copy additional style attributes (dasharray scaled to screen pixels)
          // Accumulate transforms from ancestor <g> elements
          const transforms = [];
          let ancestor = el.parentElement;
          while (ancestor && ancestor !== layersGroup) {
            const t = ancestor.getAttribute('transform');
            if (t) transforms.unshift(t);
            ancestor = ancestor.parentElement;
          }
          const ownTransform = el.getAttribute('transform');
          if (ownTransform) transforms.push(ownTransform);
          if (transforms.length > 0) navPath.setAttribute('transform', transforms.join(' '));

          for (const attr of ['stroke-dasharray', 'stroke-linecap', 'stroke-linejoin', 'stroke-opacity', 'fill-opacity', 'opacity', 'fill-rule']) {
            const val = el.getAttribute(attr);
            if (val) navPath.setAttribute(attr, val);
          }
          navGroup.appendChild(navPath);
        } else if (el.tagName === 'text') {
          // Clone text element into navigator for a faithful minimap
          const navText = el.cloneNode(true);
          navGroup.appendChild(navText);
        }
      }
    } else {
      // Fallback: single preview-path (no layers)
      const d = this.previewPath.getAttribute('d') || '';
      if (d) {
        const navPath = document.createElementNS(SVG_NS, 'path');
        navPath.setAttribute('d', d);
        navPath.setAttribute('stroke', DEFAULT_STROKE);
        navPath.setAttribute('stroke-width', Math.max(DEFAULT_STROKE_WIDTH, 1));
        navPath.setAttribute('fill', 'none');
        navGroup.appendChild(navPath);
      }
    }

    const width = store.get('width');
    const height = store.get('height');

    const navWidth = 120;
    const navHeight = 120;
    const scale = Math.min(navWidth / width, navHeight / height) * 0.9;
    const offsetX = (navWidth - width * scale) / 2;
    const offsetY = (navHeight - height * scale) / 2;

    navSvg.setAttribute('viewBox', `${-offsetX / scale} ${-offsetY / scale} ${navWidth / scale} ${navHeight / scale}`);
    navBg.setAttribute('fill', store.get('background'));
    navBg.setAttribute('x', 0);
    navBg.setAttribute('y', 0);
    navBg.setAttribute('width', width);
    navBg.setAttribute('height', height);

    this.updateNavigatorViewport();
  }

  screenToNavigatorSVG(clientX, clientY) {
    const navSvg = this.shadowRoot.querySelector('#navigator-svg');
    const pt = navSvg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const svgPt = pt.matrixTransform(navSvg.getScreenCTM().inverse());
    return { x: svgPt.x, y: svgPt.y };
  }

  navigatorMouseDown(e) {
    e.preventDefault();
    const { x: svgX, y: svgY } = this.screenToNavigatorSVG(e.clientX, e.clientY);
    const width = store.get('width');
    const height = store.get('height');
    const zoomLevel = store.get('zoomLevel');
    const panX = store.get('panX');
    const panY = store.get('panY');

    const viewWidth = width / zoomLevel;
    const viewHeight = height / zoomLevel;
    const inViewport = svgX >= panX && svgX <= panX + viewWidth &&
                       svgY >= panY && svgY <= panY + viewHeight;

    if (inViewport) {
      this.isNavigatorDragging = true;
      this.navDragStartX = svgX;
      this.navDragStartY = svgY;
      this.navDragStartPanX = panX;
      this.navDragStartPanY = panY;
    } else {
      store.update({
        panX: svgX - viewWidth / 2,
        panY: svgY - viewHeight / 2
      });
      this.updateViewBox();
    }
  }

  navigatorMouseMove(e) {
    if (!this.isNavigatorDragging) return;

    const { x: svgX, y: svgY } = this.screenToNavigatorSVG(e.clientX, e.clientY);

    store.update({
      panX: this.navDragStartPanX + (svgX - this.navDragStartX),
      panY: this.navDragStartPanY + (svgY - this.navDragStartY)
    });

    this.updateViewBox();
  }

  navigatorMouseUp() {
    this.isNavigatorDragging = false;
  }

  navigatorDoubleClick(e) {
    e.preventDefault();
    const { x: svgX, y: svgY } = this.screenToNavigatorSVG(e.clientX, e.clientY);
    const width = store.get('width');
    const height = store.get('height');
    const zoomLevel = store.get('zoomLevel');

    const viewWidth = width / zoomLevel;
    const viewHeight = height / zoomLevel;

    store.update({
      panX: svgX - viewWidth / 2,
      panY: svgY - viewHeight / 2
    });

    this.updateViewBox();
  }

  updateSvgStyles() {
    const state = store.getAll();

    this.preview.setAttribute('width', state.width);
    this.preview.setAttribute('height', state.height);

    this.updateViewBox();

    this.previewPath.setAttribute('stroke', DEFAULT_STROKE);
    this.previewPath.setAttribute('stroke-width', DEFAULT_STROKE_WIDTH);
    this.previewPath.setAttribute('fill', 'none');

    // Update layer paths that don't have per-layer styles
    const layersGroup = this.shadowRoot.querySelector('#preview-layers');
    if (layersGroup) {
      for (const path of layersGroup.querySelectorAll('path')) {
        if (!path.dataset.hasLayerStroke) {
          path.setAttribute('stroke', DEFAULT_STROKE);
        }
        if (!path.dataset.hasLayerStrokeWidth) {
          path.setAttribute('stroke-width', DEFAULT_STROKE_WIDTH);
        }
      }
    }

    const previewBg = this.shadowRoot.querySelector('#preview-bg');
    previewBg.setAttribute('fill', state.background);
    previewBg.setAttribute('x', 0);
    previewBg.setAttribute('y', 0);
    previewBg.setAttribute('width', state.width);
    previewBg.setAttribute('height', state.height);

    // Grid
    const gridPattern = this.shadowRoot.querySelector('#grid-pattern');
    const gridPath = this.shadowRoot.querySelector('#grid-path');
    const previewGrid = this.shadowRoot.querySelector('#preview-grid');

    gridPattern.setAttribute('width', state.gridSize);
    gridPattern.setAttribute('height', state.gridSize);
    gridPath.setAttribute('d', `M ${state.gridSize} 0 L 0 0 0 ${state.gridSize}`);
    gridPath.setAttribute('stroke', state.gridColor);
    previewGrid.style.display = state.gridEnabled ? 'block' : 'none';
    previewGrid.setAttribute('x', 0);
    previewGrid.setAttribute('y', 0);
    previewGrid.setAttribute('width', state.width);
    previewGrid.setAttribute('height', state.height);

    this.updateNavigatorContent();
  }

  setupEventListeners() {

    // Zoom controls
    this.shadowRoot.querySelector('#zoom-in').addEventListener('click', () => this.zoomIn());
    this.shadowRoot.querySelector('#zoom-out').addEventListener('click', () => this.zoomOut());
    this.shadowRoot.querySelector('#zoom-fit').addEventListener('click', () => this.zoomFit());

    // Zoom level input
    const zoomInput = this.shadowRoot.querySelector('#zoom-level');
    zoomInput.addEventListener('change', (e) => {
      const value = parseInt(e.target.value);
      if (!isNaN(value) && value >= this.MIN_ZOOM * 100 && value <= this.MAX_ZOOM * 100) {
        const oldZoom = store.get('zoomLevel');
        const newZoom = value / 100;
        this.adjustPanForZoom(oldZoom, newZoom);
        store.set('zoomLevel', newZoom);
        this.updateViewBox();
      } else {
        e.target.value = `${Math.round(store.get('zoomLevel') * 100)}%`;
      }
    });

    zoomInput.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        const step = e.shiftKey ? 0.25 : 0.05;
        const direction = e.key === 'ArrowUp' ? 1 : -1;

        const oldZoom = store.get('zoomLevel');
        const newZoom = Math.max(this.MIN_ZOOM, Math.min(this.MAX_ZOOM, oldZoom + (step * direction)));
        this.adjustPanForZoom(oldZoom, newZoom);
        store.set('zoomLevel', newZoom);
        this.updateViewBox();
      }
    });

    // Mouse wheel zoom
    this.previewContainer.addEventListener('wheel', (e) => {
      e.preventDefault();
      const dampening = 0.002;
      const delta = -e.deltaY * dampening;

      const oldZoom = store.get('zoomLevel');
      const newZoom = Math.max(this.MIN_ZOOM, Math.min(this.MAX_ZOOM, oldZoom * (1 + delta)));

      this.adjustPanForZoom(oldZoom, newZoom);
      store.set('zoomLevel', newZoom);
      this.updateViewBox();
    }, { passive: false });

    // Pan via drag
    this.previewContainer.addEventListener('mousedown', (e) => this.startPan(e));
    document.addEventListener('mousemove', (e) => this.doPan(e));
    document.addEventListener('mouseup', () => this.endPan());

    // Navigator
    const navSvg = this.shadowRoot.querySelector('#navigator-svg');
    navSvg.addEventListener('mousedown', (e) => this.navigatorMouseDown(e));
    navSvg.addEventListener('dblclick', (e) => this.navigatorDoubleClick(e));
    document.addEventListener('mousemove', (e) => this.navigatorMouseMove(e));
    document.addEventListener('mouseup', () => this.navigatorMouseUp());
  }

  render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 1.5rem;
          background: var(--bg-primary, #f8f9fa);
          min-width: 0;
          overflow: auto;
          position: relative;
        }

        @media (max-width: 800px) {
          :host {
            min-height: 250px;
            padding: 1rem;
          }
        }

        #preview-container {
          position: relative;
          width: 100%;
          flex: 1;
          min-height: 0;
          border-radius: var(--radius-lg, 12px);
          overflow: hidden;
          box-shadow: var(--shadow-lg);
        }

        #preview {
          display: block;
          width: 100%;
          height: 100%;
          position: absolute;
          left: 50%;
          top: 50%;
          translate: -50% -50%;
        }

        #preview-container.can-pan {
          cursor: grab;
        }

        #preview-container.panning {
          cursor: grabbing;
        }

        /* Navigator */
        #zoom-navigator {
          position: absolute;
          top: 1rem;
          left: 1rem;
          width: 120px;
          height: 120px;
          background: var(--bg-elevated, #ffffff);
          border: 1px solid var(--border-color, #e2e8f0);
          border-radius: var(--radius-lg, 12px);
          box-shadow: var(--shadow-lg);
          overflow: hidden;
          z-index: 10;
        }

        #navigator-svg {
          width: 100%;
          height: 100%;
        }

        #navigator-viewport {
          cursor: move;
          fill: var(--accent-subtle, rgba(16, 185, 129, 0.15));
        }

        /* Zoom controls */
        #zoom-controls {
          position: absolute;
          bottom: 1rem;
          left: 50%;
          transform: translateX(-50%);
          display: flex;
          align-items: center;
          gap: 0.5rem;
          background: var(--bg-elevated, #ffffff);
          padding: 0.5rem 0.75rem;
          border-radius: var(--radius-lg, 12px);
          border: 1px solid var(--border-color, #e2e8f0);
          box-shadow: var(--shadow-lg);
          z-index: 10;
        }

        #zoom-controls button {
          width: 32px;
          height: 32px;
          padding: 0;
          display: grid;
          place-items: center;
          border: 1px solid var(--border-color, #e2e8f0);
          border-radius: var(--radius-md, 8px);
          background: var(--bg-secondary, #ffffff);
          color: var(--text-primary, #1a1a2e);
          cursor: pointer;
          font-family: inherit;
          font-size: 0.875rem;
          transition: all var(--transition-base, 0.15s ease);
        }

        #zoom-controls button:hover {
          background: var(--hover-bg, rgba(0, 0, 0, 0.04));
          border-color: var(--accent-color, #10b981);
          color: var(--accent-color, #10b981);
        }

        #zoom-in,
        #zoom-out {
          font-size: 1.25rem;
          font-weight: 400;
          line-height: 0;
        }

        #zoom-fit {
          font-size: 0.8125rem;
          font-weight: 500;
        }

        #zoom-level {
          width: 56px;
          padding: 0.375rem 0.5rem;
          border: 1px solid var(--border-color, #e2e8f0);
          border-radius: var(--radius-md, 8px);
          font-size: 0.75rem;
          font-family: var(--font-mono, 'Inconsolata', monospace);
          font-weight: 500;
          text-align: center;
          background: var(--bg-secondary, #ffffff);
          color: var(--text-primary, #1a1a2e);
          transition: all var(--transition-base, 0.15s ease);
        }

        #zoom-level:focus {
          outline: none;
          border-color: var(--accent-color, #10b981);
          box-shadow: 0 0 0 3px var(--focus-ring, rgba(16, 185, 129, 0.4));
        }

        #loading-overlay {
          display: none;
          position: absolute;
          inset: 0;
          align-items: center;
          justify-content: center;
          background: var(--bg-primary, #f8f9fa);
          border-radius: var(--radius-lg, 12px);
          z-index: 5;
        }

        .loading-spinner {
          width: 40px;
          height: 40px;
          border: 3px solid var(--border-color, #e2e8f0);
          border-top-color: var(--accent-color, #10b981);
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      </style>

      <div id="zoom-navigator">
        <svg id="navigator-svg">
          <rect id="navigator-bg" width="100%" height="100%"></rect>
          <g id="navigator-paths"></g>
          <rect id="navigator-viewport" fill="none" stroke="var(--accent-color, #10b981)" stroke-width="1" vector-effect="non-scaling-stroke"></rect>
        </svg>
      </div>

      <div id="zoom-controls">
        <button id="zoom-out" title="Zoom out">&#x2212;</button>
        <button id="zoom-fit" title="Fit to view">Fit</button>
        <button id="zoom-in" title="Zoom in">&#x002B;</button>
        <input type="text" id="zoom-level" value="100%" title="Enter zoom percentage">
      </div>

      <div id="preview-container">
        <svg id="preview" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="grid-pattern" patternUnits="userSpaceOnUse">
              <path id="grid-path" fill="none" stroke-width="0.5"/>
            </pattern>
          </defs>
          <rect id="preview-bg" width="100%" height="100%"></rect>
          <rect id="preview-grid" width="100%" height="100%" fill="url(#grid-pattern)"></rect>
          <g id="preview-layers"></g>
          <path id="preview-path" fill="none"></path>
        </svg>
        <div id="loading-overlay">
          <div class="loading-spinner"></div>
        </div>
      </div>
    `;
  }
}

customElements.define('svg-preview-pane', SvgPreviewPane);
