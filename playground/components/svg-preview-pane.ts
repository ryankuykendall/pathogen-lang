// SVG Preview pane with zoom/pan controls and navigator

import { store } from '../state/store.js';
import { attachFullscreenBehavior, fullscreenButtonHTML, fullscreenStyles } from '../utils/fullscreen-toggle.js';

const LAYERS_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>`;

const DEFAULT_STROKE = '#000000';
const DEFAULT_STROKE_WIDTH = 2;

interface LayerInput {
  name: string;
  type: string;
  data: string;
  styles: Record<string, string>;
  isDefault: boolean;
  transform?: string;
  textElements?: TextElement[];
  fragmentDefs?: string;
  fragmentVisuals?: string;
  children?: LayerInput[];
}

interface TextElement {
  x: number;
  y: number;
  rotation?: number;
  styles?: Record<string, string>;
  children: TextChild[];
}

interface TextChild {
  type: 'run' | 'tspan';
  text: string;
  dx?: number;
  dy?: number;
  rotation?: number;
  styles?: Record<string, string>;
}

interface DefsData {
  masks?: MaskDef[];
  clipPaths?: ClipPathDef[];
  gradients?: GradientDef[];
  patterns?: PatternDef[];
  markers?: MarkerDef[];
  cssProperties?: CssPropertyDef[];
  gpuGradientUrls?: Map<string, string>;
}

interface MaskDef {
  id: string;
  elements: { pathData: string; styles: Record<string, string> }[];
}

interface ClipPathDef {
  id: string;
  elements: { pathData: string }[];
}

interface GradientDef {
  id: string;
  type: string;
  attrs: Record<string, string>;
  stops: { offset: number; color: string }[];
  stopsWithOklch?: { offset: number; color: string }[];
  spreadMethod?: string;
  gradientUnits?: string;
  gradientTransform?: string;
  colorInterpolation?: string;
  href?: string;
  from?: number;
  to?: number;
  cx?: number;
  cy?: number;
}

interface PatternDef {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  patternUnits?: string;
  patternTransform?: string;
  patternContentUnits?: string;
  elements: { pathData: string; styles: Record<string, string> }[];
}

interface MarkerDef {
  id: string;
  viewBox: string;
  markerWidth: number;
  markerHeight: number;
  refX: string;
  refY: string;
  markerUnits?: string;
  orient?: string;
  preserveAspectRatio?: string;
  elements: { pathData: string; styles: Record<string, string> }[];
}

interface CssPropertyDef {
  name: string;
  syntax: string;
  inherits: boolean;
  initialValue: string;
}

export class SvgPreviewPane extends HTMLElement {
  // Zoom/pan constants
  private readonly MIN_ZOOM = 0.25;
  private readonly MAX_ZOOM = 10;
  private readonly ZOOM_STEP = 1.5;

  // Pan state
  private isPanning: boolean = false;
  private panStartX: number = 0;
  private panStartY: number = 0;

  // Navigator drag state
  private isNavigatorDragging: boolean = false;
  private navDragStartX: number = 0;
  private navDragStartY: number = 0;
  private navDragStartPanX: number = 0;
  private navDragStartPanY: number = 0;

  // Fullscreen toggle
  private _cleanupFullscreen: (() => void) | null = null;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback(): void {
    this.render();
    this.setupEventListeners();
    this.subscribeToStore();
    this.updateSvgStyles();
    this._cleanupFullscreen = attachFullscreenBehavior(this, this.shadowRoot!);
  }

  disconnectedCallback(): void {
    if (this._cleanupFullscreen) this._cleanupFullscreen();
  }

  subscribeToStore(): void {
    store.subscribe(
      [
        'width',
        'height',
        'background',
        'gridEnabled',
        'gridColor',
        'gridSize',
        'zoomLevel',
        'panX',
        'panY',
        'pathData',
      ],
      () => {
        this.updateSvgStyles();
      },
    );
    store.subscribe('inspectorOpen', () => {
      const btn = this.shadowRoot!.querySelector('#inspector-open-btn') as HTMLElement | null;
      if (btn) btn.style.display = (store.get('inspectorOpen') as boolean) ? 'none' : '';
    });
    store.subscribe('layerVisibility', () => {
      this.applyLayerVisibility();
      this.updateNavigatorContent();
    });
    store.subscribe('defsVisibility', () => {
      this.applyLayerVisibility();
    });
  }

  get preview(): SVGSVGElement {
    return this.shadowRoot!.querySelector('#preview') as SVGSVGElement;
  }

  get previewPath(): SVGPathElement {
    return this.shadowRoot!.querySelector('#preview-path') as SVGPathElement;
  }

  get previewContainer(): HTMLElement {
    return this.shadowRoot!.querySelector('#preview-container') as HTMLElement;
  }

  set pathData(value: string) {
    store.set('pathData', value || '');
    this.previewPath.setAttribute('d', value || '');
    this.updateNavigatorContent();
  }

  /**
   * Set path data and measure rendering time using forced layout calculation.
   */
  setPathDataWithTiming(value: string): number {
    store.set('pathData', value || '');

    const start = performance.now();
    this.previewPath.setAttribute('d', value || '');

    // Force synchronous layout calculation
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
   */
  setLayersWithTiming(layers: LayerInput[], defsData: DefsData = {}): number {
    const defaultData = layers[0]?.data || '';
    store.set('pathData', defaultData);

    const start = performance.now();

    // Get the layers container
    const layersGroup = this.shadowRoot!.querySelector('#preview-layers') as SVGGElement | null;
    if (layersGroup) {
      // Clear existing layer paths
      layersGroup.innerHTML = '';

      // Clean up previous fragment defs and mask/clipPath defs
      const defsEl = this.shadowRoot!.querySelector('#preview defs') as SVGDefsElement | null;
      if (defsEl) {
        for (const old of defsEl.querySelectorAll(
          '[data-fragment-layer], [data-mask-def], [data-clippath-def], [data-gradient-def], [data-pattern-def], [data-marker-def]',
        )) {
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
            const w = (store.get('width') as number) || 200;
            const h = (store.get('height') as number) || 200;
            patEl.setAttribute('width', String(w));
            patEl.setAttribute('height', String(h));
            patEl.setAttribute('patternUnits', 'userSpaceOnUse');

            const imgEl = document.createElementNS(SVG_NS_DEFS, 'image');
            imgEl.setAttribute('width', String(w));
            imgEl.setAttribute('height', String(h));

            // Use pre-rendered GPU texture if available
            const preRenderedUrl = defsData.gpuGradientUrls?.get(grad.id);
            if (preRenderedUrl) {
              imgEl.setAttribute('href', preRenderedUrl);
            } else {
              // Inline Canvas 2D fallback
              try {
                const scale = 2;
                const canvas = document.createElement('canvas');
                canvas.width = w * scale;
                canvas.height = h * scale;
                const ctx2d = canvas.getContext('2d');
                if (ctx2d) {
                  const fromAngle = grad.from ?? 0;
                  const toAngle = grad.to ?? fromAngle + 2 * Math.PI;
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

      // Inject marker defs
      if (defsData.markers && defsEl) {
        for (const marker of defsData.markers) {
          const markerEl = document.createElementNS(SVG_NS_DEFS, 'marker');
          markerEl.setAttribute('id', marker.id);
          markerEl.setAttribute('data-marker-def', marker.id);
          markerEl.setAttribute('viewBox', marker.viewBox);
          markerEl.setAttribute('markerWidth', String(marker.markerWidth));
          markerEl.setAttribute('markerHeight', String(marker.markerHeight));
          markerEl.setAttribute('refX', marker.refX);
          markerEl.setAttribute('refY', marker.refY);
          if (marker.markerUnits) markerEl.setAttribute('markerUnits', marker.markerUnits);
          if (marker.orient) markerEl.setAttribute('orient', marker.orient);
          if (marker.preserveAspectRatio) markerEl.setAttribute('preserveAspectRatio', marker.preserveAspectRatio);
          for (const el of marker.elements) {
            const pathEl = document.createElementNS(SVG_NS_DEFS, 'path');
            pathEl.setAttribute('d', el.pathData);
            for (const [k, v] of Object.entries(el.styles)) pathEl.setAttribute(k, v);
            markerEl.appendChild(pathEl);
          }
          defsEl.appendChild(markerEl);
        }
      }

      // Inject @property CSS declarations
      const svgEl = this.shadowRoot!.querySelector('#preview') as SVGSVGElement;
      const existingCssStyle = svgEl.querySelector('style[data-css-properties]');
      if (existingCssStyle) existingCssStyle.remove();
      if (defsData.cssProperties && defsData.cssProperties.length > 0) {
        const SVG_NS = 'http://www.w3.org/2000/svg';
        const styleEl = document.createElementNS(SVG_NS, 'style');
        styleEl.setAttribute('data-css-properties', '');
        const rules = defsData.cssProperties
          .map(
            (prop) =>
              `@property ${prop.name} {\n  syntax: "${prop.syntax}";\n  inherits: ${prop.inherits};\n  initial-value: ${prop.initialValue};\n}`,
          )
          .join('\n');
        styleEl.textContent = rules;
        svgEl.insertBefore(styleEl, svgEl.firstChild);
      }

      const SVG_NS = 'http://www.w3.org/2000/svg';

      // Render a single layer to a DOM element, recursing for groups
      const renderLayerToDOM = (layer: LayerInput, parent: SVGElement): void => {
        // Fragment layers
        if (layer.type === 'fragment') {
          if (layer.fragmentDefs && defsEl) {
            const defsDoc = new DOMParser().parseFromString(
              `<svg xmlns="http://www.w3.org/2000/svg"><defs>${layer.fragmentDefs}</defs></svg>`,
              'image/svg+xml',
            );
            const parsedDefs = defsDoc.querySelector('defs');
            if (parsedDefs) {
              for (const child of Array.from(parsedDefs.children)) {
                const imported = document.importNode(child, true) as SVGElement;
                imported.setAttribute('data-fragment-layer', layer.name);
                defsEl.appendChild(imported);
              }
            }
          }
          if (layer.fragmentVisuals) {
            const visualDoc = new DOMParser().parseFromString(
              `<svg xmlns="http://www.w3.org/2000/svg">${layer.fragmentVisuals}</svg>`,
              'image/svg+xml',
            );
            const visualRoot = visualDoc.documentElement;
            const wrapper = document.createElementNS(SVG_NS, 'g');
            (wrapper as SVGElement & { dataset: DOMStringMap }).dataset.layerName = layer.name;
            for (const child of Array.from(visualRoot.children)) {
              wrapper.appendChild(document.importNode(child, true));
            }
            parent.appendChild(wrapper);
          }
          return;
        }

        // Group layers
        if (layer.type === 'group') {
          const g = document.createElementNS(SVG_NS, 'g');
          (g as SVGElement & { dataset: DOMStringMap }).dataset.layerName = layer.name;
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
            (textEl as SVGElement & { dataset: DOMStringMap }).dataset.layerName = layer.name;
            textEl.setAttribute('x', String(te.x));
            textEl.setAttribute('y', String(te.y));
            if (te.rotation != null) {
              const deg = (te.rotation * 180) / Math.PI;
              textEl.setAttribute('transform', `rotate(${deg}, ${te.x}, ${te.y})`);
            }
            for (const [key, value] of Object.entries(layer.styles)) {
              textEl.setAttribute(key, value);
            }
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
                if (child.rotation != null) tspan.setAttribute('rotate', String((child.rotation * 180) / Math.PI));
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
        (path as SVGElement & { dataset: DOMStringMap }).dataset.layerName = layer.name;
        path.setAttribute('d', layer.data || '');
        path.setAttribute('fill', 'none');

        if (layer.transform) {
          path.setAttribute('transform', layer.transform);
        }

        const hasCustomStroke = !!layer.styles.stroke;
        const hasCustomStrokeWidth = !!layer.styles['stroke-width'];
        path.setAttribute('stroke', layer.styles.stroke || DEFAULT_STROKE);
        path.setAttribute('stroke-width', layer.styles['stroke-width'] || String(DEFAULT_STROKE_WIDTH));
        if (hasCustomStroke) (path as SVGElement & { dataset: DOMStringMap }).dataset.hasLayerStroke = 'true';
        if (hasCustomStrokeWidth)
          (path as SVGElement & { dataset: DOMStringMap }).dataset.hasLayerStrokeWidth = 'true';
        path.setAttribute('fill', layer.styles.fill || 'none');
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
        (p as SVGPathElement).getBBox();
      }
    } catch (e) {
      // getBBox can throw if path is empty or invalid
    }

    const renderTime = performance.now() - start;

    this.applyLayerVisibility();
    this.updateNavigatorContent();

    return renderTime;
  }

  applyLayerVisibility(): void {
    const layersGroup = this.shadowRoot!.querySelector('#preview-layers');
    if (!layersGroup) return;
    const visibility = store.get('layerVisibility') as Record<string, boolean>;

    for (const el of layersGroup.querySelectorAll('[data-layer-name]')) {
      const name = (el as HTMLElement).dataset.layerName;
      if (name && visibility[name] === false) {
        (el as HTMLElement).style.display = 'none';
      } else {
        (el as HTMLElement).style.display = '';
      }
    }

    // Handle mask/clipPath visibility
    const defsVisibility = (store.get('defsVisibility') as Record<string, boolean>) || {};
    for (const el of layersGroup.querySelectorAll('[data-layer-name]')) {
      const htmlEl = el as HTMLElement;
      // Check mask attribute
      const maskAttr = htmlEl.getAttribute('mask') || htmlEl.dataset.origMask;
      if (maskAttr) {
        const match = maskAttr.match(/url\(#(.+?)\)/);
        if (match) {
          const maskId = match[1];
          if (defsVisibility[`mask:${maskId}`] === false) {
            if (htmlEl.getAttribute('mask')) {
              htmlEl.dataset.origMask = htmlEl.getAttribute('mask')!;
              htmlEl.removeAttribute('mask');
            }
          } else if (htmlEl.dataset.origMask) {
            htmlEl.setAttribute('mask', htmlEl.dataset.origMask);
            delete htmlEl.dataset.origMask;
          }
        }
      }
      // Check clip-path attribute
      const clipAttr = htmlEl.getAttribute('clip-path') || htmlEl.dataset.origClipPath;
      if (clipAttr) {
        const match = clipAttr.match(/url\(#(.+?)\)/);
        if (match) {
          const clipId = match[1];
          if (defsVisibility[`clip-path:${clipId}`] === false) {
            if (htmlEl.getAttribute('clip-path')) {
              htmlEl.dataset.origClipPath = htmlEl.getAttribute('clip-path')!;
              htmlEl.removeAttribute('clip-path');
            }
          } else if (htmlEl.dataset.origClipPath) {
            htmlEl.setAttribute('clip-path', htmlEl.dataset.origClipPath);
            delete htmlEl.dataset.origClipPath;
          }
        }
      }
    }
  }

  clear(): void {
    this.previewPath.setAttribute('d', '');
    const layersGroup = this.shadowRoot!.querySelector('#preview-layers');
    if (layersGroup) layersGroup.innerHTML = '';
    store.set('pathData', '');
    const navPaths = this.shadowRoot!.querySelector('#navigator-paths');
    if (navPaths) navPaths.innerHTML = '';
    store.update({ zoomLevel: 1, panX: 0, panY: 0 });
    this.updateViewBox();
  }

  showLoading(): void {
    (this.shadowRoot!.querySelector('#loading-overlay') as HTMLElement).style.display = 'flex';
  }

  hideLoading(): void {
    (this.shadowRoot!.querySelector('#loading-overlay') as HTMLElement).style.display = 'none';
  }

  // Zoom/Pan methods
  updateViewBox(): void {
    const width = store.get('width') as number;
    const height = store.get('height') as number;
    const zoomLevel = store.get('zoomLevel') as number;
    let panX = store.get('panX') as number;
    let panY = store.get('panY') as number;

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
    const zoomDisplay = this.shadowRoot!.querySelector('#zoom-level') as HTMLInputElement | null;
    if (zoomDisplay) {
      zoomDisplay.value = `${Math.round(zoomLevel * 100)}%`;
    }

    this.updateNavigatorViewport();
    this.previewContainer.classList.toggle('can-pan', zoomLevel >= 0.5);
  }

  adjustPanForZoom(oldZoom: number, newZoom: number): void {
    const width = store.get('width') as number;
    const height = store.get('height') as number;
    const panX = store.get('panX') as number;
    const panY = store.get('panY') as number;

    const oldViewWidth = width / oldZoom;
    const oldViewHeight = height / oldZoom;
    const centerX = panX + oldViewWidth / 2;
    const centerY = panY + oldViewHeight / 2;

    const newViewWidth = width / newZoom;
    const newViewHeight = height / newZoom;

    store.update({
      panX: centerX - newViewWidth / 2,
      panY: centerY - newViewHeight / 2,
    });
  }

  zoomIn(): void {
    const oldZoom = store.get('zoomLevel') as number;
    const newZoom = Math.min(this.MAX_ZOOM, oldZoom * this.ZOOM_STEP);
    this.adjustPanForZoom(oldZoom, newZoom);
    store.set('zoomLevel', newZoom);
    this.updateViewBox();
  }

  zoomOut(): void {
    const oldZoom = store.get('zoomLevel') as number;
    const newZoom = Math.max(this.MIN_ZOOM, oldZoom / this.ZOOM_STEP);
    this.adjustPanForZoom(oldZoom, newZoom);
    store.set('zoomLevel', newZoom);
    this.updateViewBox();
  }

  zoomFit(): void {
    store.update({ zoomLevel: 1, panX: 0, panY: 0 });
    this.updateViewBox();
  }

  // Pan handling
  startPan(e: MouseEvent): void {
    if ((store.get('zoomLevel') as number) < 0.5) return;
    this.isPanning = true;
    this.panStartX = e.clientX;
    this.panStartY = e.clientY;
    this.previewContainer.classList.add('panning');
    e.preventDefault();
  }

  doPan(e: MouseEvent): void {
    if (!this.isPanning) return;

    const ctm = this.preview.getScreenCTM();
    if (!ctm) return;

    const dx = (this.panStartX - e.clientX) / ctm.a;
    const dy = (this.panStartY - e.clientY) / ctm.d;

    store.update({
      panX: (store.get('panX') as number) + dx,
      panY: (store.get('panY') as number) + dy,
    });

    this.panStartX = e.clientX;
    this.panStartY = e.clientY;

    this.updateViewBox();
  }

  endPan(): void {
    this.isPanning = false;
    this.previewContainer.classList.remove('panning');
  }

  // Navigator methods
  updateNavigatorViewport(): void {
    const width = store.get('width') as number;
    const height = store.get('height') as number;
    const zoomLevel = store.get('zoomLevel') as number;
    const panX = store.get('panX') as number;
    const panY = store.get('panY') as number;

    const viewWidth = width / zoomLevel;
    const viewHeight = height / zoomLevel;

    const viewport = this.shadowRoot!.querySelector('#navigator-viewport') as SVGRectElement;
    viewport.setAttribute('x', String(panX));
    viewport.setAttribute('y', String(panY));
    viewport.setAttribute('width', String(viewWidth));
    viewport.setAttribute('height', String(viewHeight));
  }

  updateNavigatorContent(): void {
    const navGroup = this.shadowRoot!.querySelector('#navigator-paths') as SVGGElement;
    const navBg = this.shadowRoot!.querySelector('#navigator-bg') as SVGRectElement;
    const navSvg = this.shadowRoot!.querySelector('#navigator-svg') as SVGSVGElement;
    const SVG_NS = 'http://www.w3.org/2000/svg';

    // Clear existing navigator content
    navGroup.innerHTML = '';

    // Build per-layer paths in the navigator
    const layersGroup = this.shadowRoot!.querySelector('#preview-layers');
    const visibleElements = layersGroup
      ? Array.from(layersGroup.querySelectorAll('path, text, g')).filter((el) => {
          let node = el as HTMLElement | null;
          while (node && node !== layersGroup) {
            if (node.style.display === 'none') return false;
            node = node.parentElement;
          }
          return true;
        })
      : [];

    // Only process leaf elements (path/text), skip <g> containers
    const leafElements = visibleElements.filter((el) => el.tagName === 'path' || el.tagName === 'text');

    // Compute minimum stroke-width that remains visible at navigator scale.
    // The navigator is 120×120 CSS px; strokes in SVG-coordinate units get scaled
    // down by Math.min(120/w, 120/h)*0.9, so sub-pixel dots (e.g. particle/attractor
    // artwork) vanish.  Setting a floor of 1/scale keeps them at ~1 CSS px.
    const canvasW = store.get('width') as number;
    const canvasH = store.get('height') as number;
    const navScale = Math.min(120 / canvasW, 120 / canvasH) * 0.9;
    const minNavStroke = 1 / navScale;

    if (leafElements.length > 0) {
      for (const el of leafElements) {
        if (el.tagName === 'path') {
          const navPath = document.createElementNS(SVG_NS, 'path');
          navPath.setAttribute('d', el.getAttribute('d') || '');
          navPath.setAttribute('stroke', el.getAttribute('stroke') || DEFAULT_STROKE);
          navPath.setAttribute(
            'stroke-width',
            String(Math.max(parseFloat(el.getAttribute('stroke-width') || '') || DEFAULT_STROKE_WIDTH, minNavStroke)),
          );
          navPath.setAttribute('fill', el.getAttribute('fill') || 'none');
          // Accumulate transforms from ancestor <g> elements
          const transforms: string[] = [];
          let ancestor = el.parentElement;
          while (ancestor && ancestor !== layersGroup) {
            const t = ancestor.getAttribute('transform');
            if (t) transforms.unshift(t);
            ancestor = ancestor.parentElement;
          }
          const ownTransform = el.getAttribute('transform');
          if (ownTransform) transforms.push(ownTransform);
          if (transforms.length > 0) navPath.setAttribute('transform', transforms.join(' '));

          for (const attr of [
            'stroke-dasharray',
            'stroke-linecap',
            'stroke-linejoin',
            'stroke-opacity',
            'fill-opacity',
            'opacity',
            'fill-rule',
          ]) {
            const val = el.getAttribute(attr);
            if (val) navPath.setAttribute(attr, val);
          }
          navGroup.appendChild(navPath);
        } else if (el.tagName === 'text') {
          // Clone text element into navigator
          const navText = el.cloneNode(true) as SVGTextElement;
          navGroup.appendChild(navText);
        }
      }
    } else {
      // Fallback: single preview-path
      const d = this.previewPath.getAttribute('d') || '';
      if (d) {
        const navPath = document.createElementNS(SVG_NS, 'path');
        navPath.setAttribute('d', d);
        navPath.setAttribute('stroke', DEFAULT_STROKE);
        navPath.setAttribute('stroke-width', String(Math.max(DEFAULT_STROKE_WIDTH, minNavStroke)));
        navPath.setAttribute('fill', 'none');
        navGroup.appendChild(navPath);
      }
    }

    const width = store.get('width') as number;
    const height = store.get('height') as number;

    const navWidth = 120;
    const navHeight = 120;
    const scale = Math.min(navWidth / width, navHeight / height) * 0.9;
    const offsetX = (navWidth - width * scale) / 2;
    const offsetY = (navHeight - height * scale) / 2;

    navSvg.setAttribute(
      'viewBox',
      `${-offsetX / scale} ${-offsetY / scale} ${navWidth / scale} ${navHeight / scale}`,
    );
    navBg.setAttribute('fill', store.get('background') as string);
    navBg.setAttribute('x', '0');
    navBg.setAttribute('y', '0');
    navBg.setAttribute('width', String(width));
    navBg.setAttribute('height', String(height));

    this.updateNavigatorViewport();
  }

  screenToNavigatorSVG(clientX: number, clientY: number): { x: number; y: number } {
    const navSvg = this.shadowRoot!.querySelector('#navigator-svg') as SVGSVGElement;
    const pt = navSvg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const svgPt = pt.matrixTransform(navSvg.getScreenCTM()!.inverse());
    return { x: svgPt.x, y: svgPt.y };
  }

  navigatorMouseDown(e: MouseEvent): void {
    e.preventDefault();
    const { x: svgX, y: svgY } = this.screenToNavigatorSVG(e.clientX, e.clientY);
    const width = store.get('width') as number;
    const height = store.get('height') as number;
    const zoomLevel = store.get('zoomLevel') as number;
    const panX = store.get('panX') as number;
    const panY = store.get('panY') as number;

    const viewWidth = width / zoomLevel;
    const viewHeight = height / zoomLevel;
    const inViewport = svgX >= panX && svgX <= panX + viewWidth && svgY >= panY && svgY <= panY + viewHeight;

    if (inViewport) {
      this.isNavigatorDragging = true;
      this.navDragStartX = svgX;
      this.navDragStartY = svgY;
      this.navDragStartPanX = panX;
      this.navDragStartPanY = panY;
    } else {
      store.update({
        panX: svgX - viewWidth / 2,
        panY: svgY - viewHeight / 2,
      });
      this.updateViewBox();
    }
  }

  navigatorMouseMove(e: MouseEvent): void {
    if (!this.isNavigatorDragging) return;

    const { x: svgX, y: svgY } = this.screenToNavigatorSVG(e.clientX, e.clientY);

    store.update({
      panX: this.navDragStartPanX + (svgX - this.navDragStartX),
      panY: this.navDragStartPanY + (svgY - this.navDragStartY),
    });

    this.updateViewBox();
  }

  navigatorMouseUp(): void {
    this.isNavigatorDragging = false;
  }

  navigatorDoubleClick(e: MouseEvent): void {
    e.preventDefault();
    const { x: svgX, y: svgY } = this.screenToNavigatorSVG(e.clientX, e.clientY);
    const width = store.get('width') as number;
    const height = store.get('height') as number;
    const zoomLevel = store.get('zoomLevel') as number;

    const viewWidth = width / zoomLevel;
    const viewHeight = height / zoomLevel;

    store.update({
      panX: svgX - viewWidth / 2,
      panY: svgY - viewHeight / 2,
    });

    this.updateViewBox();
  }

  updateSvgStyles(): void {
    const state = store.getAll() as Record<string, unknown>;

    this.preview.setAttribute('width', String(state.width));
    this.preview.setAttribute('height', String(state.height));

    this.updateViewBox();

    this.previewPath.setAttribute('stroke', DEFAULT_STROKE);
    this.previewPath.setAttribute('stroke-width', String(DEFAULT_STROKE_WIDTH));
    this.previewPath.setAttribute('fill', 'none');

    // Update layer paths that don't have per-layer styles
    const layersGroup = this.shadowRoot!.querySelector('#preview-layers');
    if (layersGroup) {
      for (const path of layersGroup.querySelectorAll('path')) {
        if (!(path as unknown as HTMLElement).dataset.hasLayerStroke) {
          path.setAttribute('stroke', DEFAULT_STROKE);
        }
        if (!(path as unknown as HTMLElement).dataset.hasLayerStrokeWidth) {
          path.setAttribute('stroke-width', String(DEFAULT_STROKE_WIDTH));
        }
      }
    }

    const previewBg = this.shadowRoot!.querySelector('#preview-bg') as SVGRectElement;
    previewBg.setAttribute('fill', state.background as string);
    previewBg.setAttribute('x', '0');
    previewBg.setAttribute('y', '0');
    previewBg.setAttribute('width', String(state.width));
    previewBg.setAttribute('height', String(state.height));

    // Grid
    const gridPattern = this.shadowRoot!.querySelector('#grid-pattern') as SVGPatternElement;
    const gridPath = this.shadowRoot!.querySelector('#grid-path') as SVGPathElement;
    const previewGrid = this.shadowRoot!.querySelector('#preview-grid') as SVGRectElement;

    gridPattern.setAttribute('width', String(state.gridSize));
    gridPattern.setAttribute('height', String(state.gridSize));
    gridPath.setAttribute('d', `M ${state.gridSize} 0 L 0 0 0 ${state.gridSize}`);
    gridPath.setAttribute('stroke', state.gridColor as string);
    previewGrid.style.display = state.gridEnabled ? 'block' : 'none';
    previewGrid.setAttribute('x', '0');
    previewGrid.setAttribute('y', '0');
    previewGrid.setAttribute('width', String(state.width));
    previewGrid.setAttribute('height', String(state.height));

    this.updateNavigatorContent();
  }

  setupEventListeners(): void {
    // Zoom controls
    this.shadowRoot!.querySelector('#zoom-in')!.addEventListener('click', () => this.zoomIn());
    this.shadowRoot!.querySelector('#zoom-out')!.addEventListener('click', () => this.zoomOut());
    this.shadowRoot!.querySelector('#zoom-fit')!.addEventListener('click', () => this.zoomFit());

    // Zoom level input
    const zoomInput = this.shadowRoot!.querySelector('#zoom-level') as HTMLInputElement;
    zoomInput.addEventListener('change', (e: Event) => {
      const value = parseInt((e.target as HTMLInputElement).value);
      if (!isNaN(value) && value >= this.MIN_ZOOM * 100 && value <= this.MAX_ZOOM * 100) {
        const oldZoom = store.get('zoomLevel') as number;
        const newZoom = value / 100;
        this.adjustPanForZoom(oldZoom, newZoom);
        store.set('zoomLevel', newZoom);
        this.updateViewBox();
      } else {
        (e.target as HTMLInputElement).value = `${Math.round((store.get('zoomLevel') as number) * 100)}%`;
      }
    });

    zoomInput.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        const step = e.shiftKey ? 0.25 : 0.05;
        const direction = e.key === 'ArrowUp' ? 1 : -1;

        const oldZoom = store.get('zoomLevel') as number;
        const newZoom = Math.max(this.MIN_ZOOM, Math.min(this.MAX_ZOOM, oldZoom + step * direction));
        this.adjustPanForZoom(oldZoom, newZoom);
        store.set('zoomLevel', newZoom);
        this.updateViewBox();
      }
    });

    // Mouse wheel zoom
    this.previewContainer.addEventListener(
      'wheel',
      (e: WheelEvent) => {
        e.preventDefault();
        const dampening = 0.002;
        const delta = -e.deltaY * dampening;

        const oldZoom = store.get('zoomLevel') as number;
        const newZoom = Math.max(this.MIN_ZOOM, Math.min(this.MAX_ZOOM, oldZoom * (1 + delta)));

        this.adjustPanForZoom(oldZoom, newZoom);
        store.set('zoomLevel', newZoom);
        this.updateViewBox();
      },
      { passive: false },
    );

    // Pan via drag
    this.previewContainer.addEventListener('mousedown', (e: MouseEvent) => this.startPan(e));
    document.addEventListener('mousemove', (e: MouseEvent) => this.doPan(e));
    document.addEventListener('mouseup', () => this.endPan());

    // Navigator
    const navSvg = this.shadowRoot!.querySelector('#navigator-svg') as SVGSVGElement;
    navSvg.addEventListener('mousedown', (e: MouseEvent) => this.navigatorMouseDown(e));
    navSvg.addEventListener('dblclick', (e: MouseEvent) => this.navigatorDoubleClick(e));
    document.addEventListener('mousemove', (e: MouseEvent) => this.navigatorMouseMove(e));
    document.addEventListener('mouseup', () => this.navigatorMouseUp());

    // Inspector toggle
    this.shadowRoot!.querySelector('#inspector-open-btn')?.addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('toggle-inspector', { bubbles: true, composed: true }));
    });
  }

  render(): void {
    this.shadowRoot!.innerHTML = `
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

        #inspector-open-btn {
          position: absolute;
          top: 1rem;
          right: 1rem;
          width: 32px;
          height: 32px;
          padding: 0;
          display: grid;
          place-items: center;
          border: 1px solid var(--border-color, #e2e8f0);
          border-radius: var(--radius-md, 8px);
          background: var(--bg-elevated, #ffffff);
          color: var(--text-secondary, #64748b);
          cursor: pointer;
          box-shadow: var(--shadow-md);
          z-index: 10;
          transition: all var(--transition-base, 0.15s ease);
        }

        #inspector-open-btn:hover {
          border-color: var(--accent-color, #10b981);
          color: var(--accent-color, #10b981);
          background: var(--accent-subtle, rgba(16, 185, 129, 0.1));
        }

        #inspector-open-btn svg {
          width: 16px;
          height: 16px;
        }

        ${fullscreenStyles(120, 1)}
      </style>

      <div id="zoom-navigator">
        <svg id="navigator-svg">
          <rect id="navigator-bg" width="100%" height="100%"></rect>
          <g id="navigator-paths"></g>
          <rect id="navigator-viewport" fill="none" stroke="var(--accent-color, #10b981)" stroke-width="1" vector-effect="non-scaling-stroke"></rect>
        </svg>
      </div>

      ${fullscreenButtonHTML()}

      <button id="inspector-open-btn" title="Toggle inspector">${LAYERS_ICON}</button>

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
