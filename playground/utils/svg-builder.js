// SVG Builder — standalone SVG DOM construction for BBWP and future server-side use.
// Extracted from svg-preview-pane.js; uses browser DOM APIs only.

const SVG_NS = 'http://www.w3.org/2000/svg';
const DEFAULT_STROKE = '#000000';
const DEFAULT_STROKE_WIDTH = '2';

/**
 * Build a complete SVG document string from compilation output.
 *
 * @param {object} params - Compilation data
 * @param {object[]} params.layers - LayerOutput array
 * @param {object[]} params.masks - Mask definitions
 * @param {object[]} params.clipPaths - ClipPath definitions
 * @param {object[]} params.gradients - Gradient definitions
 * @param {object[]} params.patterns - Pattern definitions
 * @param {object[]} params.cssProperties - CSS @property registrations
 * @param {Map<string,string>} [params.gpuGradientUrls] - Pre-rendered GPU gradient data URLs
 * @param {object} svgOptions - SVG document options
 * @param {string} [svgOptions.viewBox='0 0 200 200']
 * @param {string} [svgOptions.width='200']
 * @param {string} [svgOptions.height='200']
 * @param {string} [svgOptions.background='transparent']
 * @param {string} [svgOptions.defaultStroke='#000000']
 * @param {string} [svgOptions.defaultFill='none']
 * @param {string} [svgOptions.defaultStrokeWidth='2']
 * @returns {string} Serialized SVG document
 */
export function buildSvg(params, svgOptions = {}) {
  const {
    layers = [],
    masks = [],
    clipPaths = [],
    gradients = [],
    patterns = [],
    cssProperties = [],
    gpuGradientUrls,
  } = params;

  const viewBox = svgOptions.viewBox || '0 0 200 200';
  const width = svgOptions.width || '200';
  const height = svgOptions.height || '200';
  const background = svgOptions.background || 'transparent';
  const defaultStroke = svgOptions.defaultStroke || DEFAULT_STROKE;
  const defaultFill = svgOptions.defaultFill || 'none';
  const defaultStrokeWidth = svgOptions.defaultStrokeWidth || DEFAULT_STROKE_WIDTH;

  // Create SVG root
  const svgEl = document.createElementNS(SVG_NS, 'svg');
  svgEl.setAttribute('xmlns', SVG_NS);
  svgEl.setAttribute('viewBox', viewBox);
  svgEl.setAttribute('width', width);
  svgEl.setAttribute('height', height);

  // CSS @property declarations
  if (cssProperties.length > 0) {
    const styleEl = document.createElementNS(SVG_NS, 'style');
    const rules = cssProperties.map(prop =>
      `@property ${prop.name} {\n  syntax: "${prop.syntax}";\n  inherits: ${prop.inherits};\n  initial-value: ${prop.initialValue};\n}`
    ).join('\n');
    styleEl.textContent = rules;
    svgEl.appendChild(styleEl);
  }

  // Background rect
  const bgRect = document.createElementNS(SVG_NS, 'rect');
  bgRect.setAttribute('width', '100%');
  bgRect.setAttribute('height', '100%');
  bgRect.setAttribute('fill', background);
  svgEl.appendChild(bgRect);

  // Defs section
  const defsEl = document.createElementNS(SVG_NS, 'defs');
  let hasDefs = false;

  // Masks
  for (const mask of masks) {
    const maskEl = document.createElementNS(SVG_NS, 'mask');
    maskEl.setAttribute('id', mask.id);
    for (const el of mask.elements) {
      const pathEl = document.createElementNS(SVG_NS, 'path');
      pathEl.setAttribute('d', el.pathData);
      for (const [key, value] of Object.entries(el.styles)) {
        pathEl.setAttribute(key, value);
      }
      maskEl.appendChild(pathEl);
    }
    defsEl.appendChild(maskEl);
    hasDefs = true;
  }

  // ClipPaths
  for (const clip of clipPaths) {
    const clipEl = document.createElementNS(SVG_NS, 'clipPath');
    clipEl.setAttribute('id', clip.id);
    for (const el of clip.elements) {
      const pathEl = document.createElementNS(SVG_NS, 'path');
      pathEl.setAttribute('d', el.pathData);
      clipEl.appendChild(pathEl);
    }
    defsEl.appendChild(clipEl);
    hasDefs = true;
  }

  // Gradients
  const w = parseInt(width, 10) || 200;
  const h = parseInt(height, 10) || 200;

  for (const grad of gradients) {
    if (grad.type === 'conic') {
      // Conic gradient as <pattern> with rasterized <image>
      const patEl = document.createElementNS(SVG_NS, 'pattern');
      patEl.setAttribute('id', grad.id);
      patEl.setAttribute('x', '0');
      patEl.setAttribute('y', '0');
      patEl.setAttribute('width', String(w));
      patEl.setAttribute('height', String(h));
      patEl.setAttribute('patternUnits', 'userSpaceOnUse');

      const imgEl = document.createElementNS(SVG_NS, 'image');
      imgEl.setAttribute('width', String(w));
      imgEl.setAttribute('height', String(h));

      const preRenderedUrl = gpuGradientUrls?.get(grad.id);
      if (preRenderedUrl) {
        imgEl.setAttribute('href', preRenderedUrl);
      } else {
        // Canvas 2D fallback
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
      hasDefs = true;
      continue;
    }

    if (grad.type === 'mesh' || grad.type === 'freeform' || grad.type === 'topo') {
      // Mesh/freeform/topo as <pattern> with objectBoundingBox
      const patEl = document.createElementNS(SVG_NS, 'pattern');
      patEl.setAttribute('id', grad.id);
      patEl.setAttribute('x', '0');
      patEl.setAttribute('y', '0');
      patEl.setAttribute('width', '1');
      patEl.setAttribute('height', '1');
      patEl.setAttribute('patternUnits', 'objectBoundingBox');
      patEl.setAttribute('patternContentUnits', 'objectBoundingBox');

      const imgEl = document.createElementNS(SVG_NS, 'image');
      imgEl.setAttribute('width', '1');
      imgEl.setAttribute('height', '1');
      imgEl.setAttribute('preserveAspectRatio', 'none');

      const preRenderedUrl = gpuGradientUrls?.get(grad.id);
      if (preRenderedUrl) {
        imgEl.setAttribute('href', preRenderedUrl);
      }

      patEl.appendChild(imgEl);
      defsEl.appendChild(patEl);
      hasDefs = true;
      continue;
    }

    // Linear/radial gradients — native SVG elements
    const tagName = grad.type === 'linear' ? 'linearGradient' : 'radialGradient';
    const gradEl = document.createElementNS(SVG_NS, tagName);
    gradEl.setAttribute('id', grad.id);
    for (const [key, value] of Object.entries(grad.attrs)) {
      gradEl.setAttribute(key, value);
    }
    if (grad.spreadMethod) gradEl.setAttribute('spreadMethod', grad.spreadMethod);
    if (grad.gradientUnits) gradEl.setAttribute('gradientUnits', grad.gradientUnits);
    if (grad.gradientTransform) gradEl.setAttribute('gradientTransform', grad.gradientTransform);
    if (grad.colorInterpolation) gradEl.setAttribute('color-interpolation', grad.colorInterpolation);
    if (grad.href) gradEl.setAttributeNS('http://www.w3.org/1999/xlink', 'href', `#${grad.href}`);
    for (const stop of grad.stops) {
      const stopEl = document.createElementNS(SVG_NS, 'stop');
      stopEl.setAttribute('offset', String(stop.offset));
      stopEl.setAttribute('stop-color', stop.color);
      gradEl.appendChild(stopEl);
    }
    defsEl.appendChild(gradEl);
    hasDefs = true;
  }

  // Patterns
  for (const pat of patterns) {
    const patEl = document.createElementNS(SVG_NS, 'pattern');
    patEl.setAttribute('id', pat.id);
    patEl.setAttribute('x', String(pat.x));
    patEl.setAttribute('y', String(pat.y));
    patEl.setAttribute('width', String(pat.width));
    patEl.setAttribute('height', String(pat.height));
    if (pat.patternUnits) patEl.setAttribute('patternUnits', pat.patternUnits);
    if (pat.patternTransform) patEl.setAttribute('patternTransform', pat.patternTransform);
    if (pat.patternContentUnits) patEl.setAttribute('patternContentUnits', pat.patternContentUnits);
    for (const el of pat.elements) {
      const pathEl = document.createElementNS(SVG_NS, 'path');
      pathEl.setAttribute('d', el.pathData);
      for (const [k, v] of Object.entries(el.styles)) pathEl.setAttribute(k, v);
      patEl.appendChild(pathEl);
    }
    defsEl.appendChild(patEl);
    hasDefs = true;
  }

  if (hasDefs) {
    svgEl.appendChild(defsEl);
  }

  // Render layers
  function renderLayerToDOM(layer, parent) {
    // Fragment layers
    if (layer.type === 'fragment') {
      if (layer.fragmentDefs) {
        const defsDoc = new DOMParser().parseFromString(
          `<svg xmlns="http://www.w3.org/2000/svg"><defs>${layer.fragmentDefs}</defs></svg>`,
          'image/svg+xml'
        );
        const parsedDefs = defsDoc.querySelector('defs');
        if (parsedDefs) {
          for (const child of Array.from(parsedDefs.children)) {
            defsEl.appendChild(document.importNode(child, true));
          }
        }
      }
      if (layer.fragmentVisuals) {
        const visualDoc = new DOMParser().parseFromString(
          `<svg xmlns="http://www.w3.org/2000/svg">${layer.fragmentVisuals}</svg>`,
          'image/svg+xml'
        );
        const wrapper = document.createElementNS(SVG_NS, 'g');
        for (const child of Array.from(visualDoc.documentElement.children)) {
          wrapper.appendChild(document.importNode(child, true));
        }
        parent.appendChild(wrapper);
      }
      return;
    }

    // Group layers
    if (layer.type === 'group') {
      const g = document.createElementNS(SVG_NS, 'g');
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

    // Text layers
    if (layer.type === 'text' && layer.textElements) {
      for (const te of layer.textElements) {
        const textEl = document.createElementNS(SVG_NS, 'text');
        textEl.setAttribute('x', String(te.x));
        textEl.setAttribute('y', String(te.y));
        if (te.rotation != null) {
          const deg = te.rotation * 180 / Math.PI;
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
            if (child.rotation != null) tspan.setAttribute('rotate', String(child.rotation * 180 / Math.PI));
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
    path.setAttribute('d', layer.data || '');

    if (layer.transform) {
      path.setAttribute('transform', layer.transform);
    }

    // Apply styles with defaults
    path.setAttribute('stroke', layer.styles['stroke'] || defaultStroke);
    path.setAttribute('stroke-width', layer.styles['stroke-width'] || defaultStrokeWidth);
    path.setAttribute('fill', layer.styles['fill'] || defaultFill);
    for (const [key, value] of Object.entries(layer.styles)) {
      if (key !== 'stroke' && key !== 'stroke-width' && key !== 'fill') {
        path.setAttribute(key, value);
      }
    }
    parent.appendChild(path);
  }

  for (const layer of layers) {
    renderLayerToDOM(layer, svgEl);
  }

  return new XMLSerializer().serializeToString(svgEl);
}
